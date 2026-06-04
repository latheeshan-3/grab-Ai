"""
confirm_commit_agent_tools.py
──────────────────────────────
Database write tools for the confirm_commit sub-agent.

Responsibilities:
  1. lock_slot          — atomically flip available_slots.status → 'booked'
  2. create_booking     — insert a new row into the bookings table
  3. fetch_slot_status  — re-read a slot row to verify it is still 'available'
                          before committing (guard against race conditions)

All functions are async. They never touch context or Redis directly.
Callers are responsible for passing correctly-typed values from the context window.
"""

import logging
from datetime import datetime, timezone
from typing import Optional

from configs.supabase import get_supabase_client

logger = logging.getLogger("booking_api.confirm_commit_tools")


# ── Tool 1: Verify the slot is still available (race-condition guard) ──────────

async def fetch_slot_status(
    slot_id: str,
    tenant_id: str,
) -> Optional[str]:
    """
    Re-fetch a single slot row and return its current status string,
    or None if the slot is not found / an error occurs.

    Call this immediately before lock_slot to guard against the slot
    being booked by another session between step-3 and step-4.

    Returns:
        "available" | "booked" | "blocked" | None
    """
    logger.info(
        f"[CommitTools] Checking slot status | slot={slot_id} | tenant={tenant_id}"
    )
    try:
        client = get_supabase_client()
        response = (
            client.table("available_slots")
            .select("id, status")
            .eq("id", slot_id)
            .eq("tenant_id", tenant_id)
            .single()
            .execute()
        )
        if not response.data:
            logger.warning(f"[CommitTools] Slot not found | slot={slot_id}")
            return None

        status = response.data.get("status")
        logger.info(f"[CommitTools] Slot status={status!r} | slot={slot_id}")
        return status

    except Exception as e:
        logger.error(
            f"[CommitTools] fetch_slot_status error | slot={slot_id} | {e}",
            exc_info=True,
        )
        return None


# ── Tool 2: Flip the slot status from 'available' → 'booked' ──────────────────

async def lock_slot(
    slot_id: str,
    tenant_id: str,
) -> bool:
    """
    Atomically update available_slots.status to 'booked' for the given slot.

    Uses a conditional update (.eq("status", "available")) so that if
    another request already booked it, no rows are updated and we return False.

    Returns:
        True  — slot was successfully marked as booked
        False — slot was already taken or an error occurred
    """
    logger.info(
        f"[CommitTools] Locking slot | slot={slot_id} | tenant={tenant_id}"
    )
    try:
        client = get_supabase_client()
        now_iso = datetime.now(timezone.utc).isoformat()

        response = (
            client.table("available_slots")
            .update({
                "status":     "booked",
                "updated_at": now_iso,
            })
            .eq("id", slot_id)
            .eq("tenant_id", tenant_id)
            .eq("status", "available")   # conditional — only if still available
            .execute()
        )

        updated_rows = response.data or []
        if not updated_rows:
            logger.warning(
                f"[CommitTools] Slot lock failed — 0 rows updated "
                f"(already taken?) | slot={slot_id}"
            )
            return False

        logger.info(f"[CommitTools] ✓ Slot locked | slot={slot_id}")
        return True

    except Exception as e:
        logger.error(
            f"[CommitTools] lock_slot error | slot={slot_id} | {e}",
            exc_info=True,
        )
        return False


# ── Tool 3: Insert a new row into the bookings table ──────────────────────────

async def create_booking(
    tenant_id:        str,
    conversation_id:  str,
    workflow_id:      str,
    service_id:       str,
    slot_id:          str,
    service_name:     str,
    doctor_name:      Optional[str],
    appointment_date: str,          # YYYY-MM-DD
    appointment_time: str,          # HH:MM or HH:MM:SS
    patient_name:     str,
    whatsapp_number:  str,
    notes:            Optional[str],
) -> Optional[str]:
    """
    Insert a confirmed booking into the bookings table.

    Returns:
        booking_id (UUID str) on success, or None on failure.

    The caller is responsible for calling lock_slot() successfully BEFORE
    calling this function — this function does NOT lock the slot itself.
    """
    logger.info(
        f"[CommitTools] Creating booking | "
        f"tenant={tenant_id} | service={service_id} | slot={slot_id} | "
        f"patient={patient_name!r}"
    )

    try:
        client = get_supabase_client()
        now_iso = datetime.now(timezone.utc).isoformat()

        # Normalise time: strip seconds if present ("09:30:00" → "09:30")
        appt_time_clean = appointment_time[:5] if len(appointment_time) >= 5 else appointment_time

        payload = {
            "tenant_id":        tenant_id,
            "conversation_id":  conversation_id,
            "workflow_id":      workflow_id,
            "service_id":       service_id,
            "slot_id":          slot_id,
            "service_name":     service_name,
            "doctor_name":      doctor_name,
            "appointment_date": appointment_date,
            "appointment_time": appt_time_clean,
            "patient_name":     patient_name,
            "whatsapp_number":  whatsapp_number,
            "notes":            notes,
            "status":           "confirmed",
            "whatsapp_sent":    False,
            "confirmed_at":     now_iso,
        }

        print(f"\n[CommitTools] Inserting booking payload: {payload}")

        response = (
            client.table("bookings")
            .insert(payload)
            .execute()
        )

        rows = response.data or []
        if not rows:
            logger.error("[CommitTools] Insert returned no rows")
            return None

        booking_id = str(rows[0].get("id", ""))
        logger.info(f"[CommitTools] ✓ Booking created | booking_id={booking_id}")
        print(f"[CommitTools] ✓ Booking ID: {booking_id}")
        return booking_id

    except Exception as e:
        logger.error(
            f"[CommitTools] create_booking error | slot={slot_id} | {e}",
            exc_info=True,
        )
        return None


# ── Tool 4: Format the success reply for the user ─────────────────────────────

def format_confirmation_reply(
    booking_id:       str,
    service_name:     str,
    doctor_name:      Optional[str],
    appointment_date: str,
    appointment_time: str,
    patient_name:     str,
    whatsapp_number:  str,
) -> str:
    """
    Build the final success message shown to the user after booking is committed.

    Example:
        ✅ *Booking Confirmed!*

        📋 Booking Reference : abc123...
        Service              : Dermatology
        Doctor               : Dr. Perera
        Date                 : 2026-06-10
        Time                 : 09:30
        Patient              : John Perera
        WhatsApp             : +94771234567

        A confirmation will be sent to your WhatsApp shortly. Thank you! 🙏
    """
    # Show only last 8 chars of UUID as short reference
    short_ref = booking_id[-8:].upper() if len(booking_id) >= 8 else booking_id.upper()
    doctor_line = f"Doctor               : {doctor_name}" if doctor_name else "Doctor               : (not specified)"
    # Trim seconds from time display
    time_display = appointment_time[:5] if len(appointment_time) >= 5 else appointment_time

    return (
        f"✅ *Booking Confirmed!*\n\n"
        f"📋 Booking Reference : {short_ref}\n"
        f"Service              : {service_name}\n"
        f"{doctor_line}\n"
        f"Date                 : {appointment_date}\n"
        f"Time                 : {time_display}\n"
        f"Patient              : {patient_name}\n"
        f"WhatsApp             : {whatsapp_number}\n\n"
        f"A confirmation will be sent to your WhatsApp shortly. Thank you! 🙏"
    )
