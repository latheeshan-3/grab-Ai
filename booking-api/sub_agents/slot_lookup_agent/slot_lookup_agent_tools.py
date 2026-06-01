"""
slot_lookup_agent_tools.py
───────────────────────────
Database tools for the slot lookup sub-agent.

Queries the `available_slots` table in Supabase.
All functions are read-only async — they never touch context or Redis.
"""

import logging
from typing import Optional

from configs.supabase import get_supabase_client

logger = logging.getLogger("booking_api.slot_lookup_tools")


# ── Row normaliser ─────────────────────────────────────────────────────────────

def _row_to_slot(row: dict) -> dict:
    """Normalise a raw Supabase row into a clean slot dict sent to the LLM."""
    return {
        "id":        str(row.get("id", "")),
        "date":      str(row.get("slot_date", "")),   # YYYY-MM-DD
        "time":      str(row.get("slot_time", "")),   # HH:MM:SS → we trim to HH:MM below
        "status":    row.get("status", "available"),
    }


def _trim_time(slot: dict) -> dict:
    """Trim slot_time from HH:MM:SS to HH:MM for display."""
    t = slot.get("time", "")
    slot["time"] = t[:5] if len(t) >= 5 else t   # "09:30:00" → "09:30"
    return slot


# ── Tool 1: Fetch available slots by service + date ───────────────────────────

async def fetch_slots_by_service_and_date(
    tenant_id: str,
    service_id: str,
    slot_date: str,           # YYYY-MM-DD
) -> list[dict]:
    """
    Fetch all slots with status='available' for a given service and date.

    Returns a list of normalised slot dicts ordered by time,
    or an empty list on error / no results.
    """
    logger.info(
        f"[SlotLookupTools] Fetching slots | "
        f"tenant={tenant_id} | service={service_id} | date={slot_date}"
    )

    try:
        client = get_supabase_client()

        response = (
            client.table("available_slots")
            .select("id, slot_date, slot_time, status")
            .eq("tenant_id", tenant_id)
            .eq("available_service_id", service_id)
            .eq("slot_date", slot_date)
            .eq("status", "available")
            .order("slot_time")
            .execute()
        )

        rows  = response.data or []
        slots = [_trim_time(_row_to_slot(r)) for r in rows]

        logger.info(
            f"[SlotLookupTools] Found {len(slots)} available slot(s) | "
            f"service={service_id} | date={slot_date}"
        )
        print(
            f"\n[SlotLookupTools] DB returned {len(slots)} slot(s) "
            f"for service {service_id} on {slot_date}"
        )
        return slots

    except Exception as e:
        logger.error(
            f"[SlotLookupTools] Failed to fetch slots | "
            f"service={service_id} | date={slot_date} | {e}",
            exc_info=True,
        )
        return []


# ── Tool 2: Fetch a single slot by its id (validation before commit) ──────────

async def fetch_slot_by_id(
    slot_id: str,
    tenant_id: str,
) -> Optional[dict]:
    """
    Fetch a single slot row by UUID and validate it still belongs to
    the correct tenant and is still 'available'.

    Returns a normalised slot dict or None.
    Used as a safety check before writing the slot into the context window.
    """
    logger.info(f"[SlotLookupTools] Fetching slot by id | slot={slot_id} | tenant={tenant_id}")

    try:
        client = get_supabase_client()

        response = (
            client.table("available_slots")
            .select("id, slot_date, slot_time, status, available_service_id")
            .eq("id", slot_id)
            .eq("tenant_id", tenant_id)
            .single()
            .execute()
        )

        if not response.data:
            logger.warning(f"[SlotLookupTools] Slot not found | slot={slot_id}")
            return None

        slot = _trim_time(_row_to_slot(response.data))

        # Reject if already booked or time-locked
        if slot["status"] != "available":
            logger.warning(
                f"[SlotLookupTools] Slot {slot_id} is no longer available "
                f"(status={slot['status']})"
            )
            return None

        return slot

    except Exception as e:
        logger.error(
            f"[SlotLookupTools] Failed to fetch slot by id | slot={slot_id} | {e}"
        )
        return None


# ── Tool 3: Format slots for user display ─────────────────────────────────────

def format_slots_for_display(slots: list[dict], date: str) -> str:
    """
    Format the slot list into a clean numbered string for the user.

    Example:
        Available slots on 2025-06-10:
          1.  09:00
          2.  10:30
          3.  14:00
    """
    if not slots:
        return f"No available slots found for {date}."

    lines = [f"Available slots on {date}:"]
    for i, slot in enumerate(slots, start=1):
        lines.append(f"  {i}.  {slot['time']}")
    return "\n".join(lines)