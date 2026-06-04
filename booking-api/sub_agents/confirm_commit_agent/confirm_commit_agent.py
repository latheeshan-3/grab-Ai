"""
confirm_commit_agent.py
────────────────────────
STEP 4 sub-agent: confirm and commit the booking.

State machine — two sub-states inside step 4:

  SUB-STATE A — Awaiting user confirmation:
    The details_collection_agent already showed the booking summary.
    This turn we detect whether the user said YES or NO.

    → YES: proceed to SUB-STATE B (write to DB).
    → NO : ask what they want to change / or offer to cancel.
    → AMBIGUOUS: re-ask for a clear yes/no.

  SUB-STATE B — DB write (no user interaction needed):
    1. Re-verify slot is still 'available' (race-condition guard).
    2. lock_slot()   — flip available_slots.status → 'booked'.
    3. create_booking() — insert row in bookings table.
    4. complete_workflow() — mark context window as completed.
    5. Return the confirmed booking reply.

Flow is deliberately stateless: the agent only looks at what is
currently in the context window and the user's current message.
"""

import json
import logging

from services.llm_service import generate_response
from services.context_service import (
    get_active_workflow,
    complete_workflow,
    set_workflow_error,
)

from sub_agents.confirm_commit_agent.confirm_commit_agent_tools import (
    fetch_slot_status,
    lock_slot,
    create_booking,
    format_confirmation_reply,
)
from sub_agents.confirm_commit_agent.confirm_commit_context import (
    CONFIRM_INTENT_SYSTEM_PROMPT,
    build_confirm_intent_prompt,
    build_booking_summary_from_context,
)

logger = logging.getLogger("booking_api.confirm_commit_agent")


# ── Entry point ────────────────────────────────────────────────────────────────

async def run(main_context: dict) -> tuple[str, dict]:
    """
    Entry point called by booking_service_agent._dispatch_sub_agent().
    Returns (reply_to_user, updated_main_context).
    """
    tenant_id    = main_context.get("tenant_id", "")
    conv_id      = main_context.get("conversation_id", "")
    user_message = main_context.get("current_user_message", "")

    logger.info(
        f"[CommitAgent] Starting | tenant={tenant_id} | conv={conv_id}"
    )

    active_wf = get_active_workflow(main_context)
    if not active_wf:
        logger.error("[CommitAgent] No active workflow found")
        return "Something went wrong. Please start your booking again.", main_context

    # ── Validate all required fields are present ───────────────────────────────
    service     = active_wf.get("service", {})
    slot        = active_wf.get("slot", {})
    patient     = active_wf.get("patient", {})

    service_id   = service.get("id")
    service_name = service.get("name", "the selected service")
    doctor_name  = service.get("doctor_name")
    slot_id      = slot.get("id")
    slot_date    = slot.get("date", "")
    slot_time    = slot.get("time", "")
    patient_name = patient.get("name")
    whatsapp     = patient.get("whatsapp_number")
    notes        = patient.get("notes")
    workflow_id  = active_wf.get("workflow_id", "")

    # Guard: missing critical fields
    missing = [
        field for field, val in [
            ("service_id", service_id),
            ("slot_id",    slot_id),
            ("patient_name", patient_name),
            ("whatsapp_number", whatsapp),
        ]
        if not val
    ]
    if missing:
        logger.error(f"[CommitAgent] Missing required fields: {missing}")
        return (
            "Some booking details are still missing. Let me take you back to complete them.",
            main_context,
        )

    print(
        f"\n[CommitAgent] Fields OK | "
        f"service={service_id!r} | slot={slot_id!r} | "
        f"patient={patient_name!r} | wa={whatsapp!r}"
    )

    # ── SUB-STATE A: Detect confirmation intent ────────────────────────────────
    print("[CommitAgent] Sub-state A — detecting confirmation intent")

    confirmed, non_confirm_reply = await _detect_confirmation_intent(
        user_message=user_message,
        active_wf=active_wf,
        recent_conversation=main_context.get("conversation", []),
    )

    if not confirmed:
        logger.info("[CommitAgent] User did not confirm — returning non-confirm reply")
        return non_confirm_reply, main_context

    # ── SUB-STATE B: Commit to database ───────────────────────────────────────
    print("[CommitAgent] Sub-state B — committing booking to database")
    logger.info(
        f"[CommitAgent] User confirmed — committing booking | "
        f"slot={slot_id} | tenant={tenant_id}"
    )

    # Step B-1: Re-verify slot is still available (race-condition guard)
    current_status = await fetch_slot_status(slot_id=slot_id, tenant_id=tenant_id)
    if current_status != "available":
        logger.warning(
            f"[CommitAgent] Slot no longer available | "
            f"slot={slot_id} | status={current_status!r}"
        )
        main_context = set_workflow_error(
            context=main_context,
            step=4,
            agent="confirm_commit_agent",
            message=f"Slot {slot_id} is no longer available (status={current_status})",
        )
        return (
            "⚠️ Sorry, that slot was just taken by someone else. "
            "Would you like to choose a different time? "
            "Just let me know and I'll show you the next available slots.",
            main_context,
        )

    # Step B-2: Lock the slot (flip status → 'booked')
    slot_locked = await lock_slot(slot_id=slot_id, tenant_id=tenant_id)
    if not slot_locked:
        logger.error(f"[CommitAgent] Failed to lock slot | slot={slot_id}")
        main_context = set_workflow_error(
            context=main_context,
            step=4,
            agent="confirm_commit_agent",
            message=f"Failed to lock slot {slot_id}",
        )
        return (
            "⚠️ We couldn't reserve that slot — it may have just been booked. "
            "Would you like to pick a different time?",
            main_context,
        )

    logger.info(f"[CommitAgent] ✓ Slot locked | slot={slot_id}")

    # Step B-3: Create the booking record
    booking_id = await create_booking(
        tenant_id=tenant_id,
        conversation_id=conv_id,
        workflow_id=workflow_id,
        service_id=service_id,
        slot_id=slot_id,
        service_name=service_name,
        doctor_name=doctor_name,
        appointment_date=slot_date,
        appointment_time=slot_time,
        patient_name=patient_name,
        whatsapp_number=whatsapp,
        notes=notes,
    )

    if not booking_id:
        logger.error(
            f"[CommitAgent] Booking DB insert failed | slot={slot_id}"
        )
        # Slot was locked but booking insert failed — log for manual review
        # We leave the slot as 'booked' to avoid double-booking; surface error to user
        main_context = set_workflow_error(
            context=main_context,
            step=4,
            agent="confirm_commit_agent",
            message="Booking DB insert failed after slot lock",
        )
        return (
            "⚠️ Your slot is reserved but we encountered an issue saving your booking. "
            "Our team has been notified and will confirm your appointment shortly.",
            main_context,
        )

    logger.info(f"[CommitAgent] ✓ Booking created | booking_id={booking_id}")

    # Step B-4: Mark workflow as completed in context window
    main_context = complete_workflow(
        context=main_context,
        booking_reference=booking_id,
    )
    logger.info(f"[CommitAgent] ✓ Workflow marked completed | booking_id={booking_id}")

    # Step B-5: Build and return success reply
    reply = format_confirmation_reply(
        booking_id=booking_id,
        service_name=service_name,
        doctor_name=doctor_name,
        appointment_date=slot_date,
        appointment_time=slot_time,
        patient_name=patient_name,
        whatsapp_number=whatsapp,
    )

    print(f"\n[CommitAgent] ✓ Booking committed successfully | booking_id={booking_id}")
    return reply, main_context


# ── Confirmation intent detection ─────────────────────────────────────────────

async def _detect_confirmation_intent(
    user_message: str,
    active_wf: dict,
    recent_conversation: list[dict],
) -> tuple[bool, str]:
    """
    Use a lightweight LLM call to determine whether the user confirmed
    the booking or not.

    Returns:
        (confirmed: bool, non_confirm_reply: str)

    If confirmed=True the non_confirm_reply is empty (not used by caller).
    If confirmed=False the non_confirm_reply is the message to return to the user.
    """
    # ── Fast keyword pre-check to skip LLM for obvious YES/NO ─────────────────
    lower = user_message.strip().lower()

    _FAST_YES = {
        "yes", "ok", "okay", "sure", "confirm", "confirmed",
        "go ahead", "proceed", "book it", "do it", "yep", "yup",
        "definitely", "please do", "correct", "right", "fine",
        "alright", "great", "perfect", "sounds good", "looks good",
        "that's correct", "that is correct",
    }
    _FAST_NO = {
        "no", "nope", "cancel", "stop", "wait", "hold on",
        "change", "wrong", "incorrect", "not yet",
    }

    if lower in _FAST_YES:
        logger.info(f"[CommitAgent] Fast YES detected: {user_message!r}")
        return True, ""

    if lower in _FAST_NO:
        logger.info(f"[CommitAgent] Fast NO detected: {user_message!r}")
        return False, (
            "No problem! Would you like to change any details or shall I cancel this booking? "
            "Just let me know."
        )

    # ── LLM call for nuanced intent detection ─────────────────────────────────
    booking_summary = build_booking_summary_from_context(active_wf)
    prompt = build_confirm_intent_prompt(
        user_message=user_message,
        booking_summary=booking_summary,
        recent_conversation=recent_conversation,
    )

    try:
        raw = generate_response(
            prompt=prompt,
            system_instruction=CONFIRM_INTENT_SYSTEM_PROMPT,
            temperature=0.0,
            max_output_tokens=256,
        )
        logger.debug(f"[CommitAgent] Confirmation intent LLM raw: {raw!r}")

        parsed = _safe_parse_llm(raw)
        confirmed   = bool(parsed.get("confirmed", False))
        llm_reply   = (parsed.get("reply_to_user") or "").strip()

        if confirmed:
            logger.info("[CommitAgent] LLM detected: CONFIRMED")
            return True, ""

        # Not confirmed — use LLM reply or a default fallback
        fallback = (
            "Would you like to change anything, or shall I cancel this booking?"
        )
        logger.info(f"[CommitAgent] LLM detected: NOT confirmed | reply={llm_reply!r}")
        return False, llm_reply or fallback

    except Exception as e:
        logger.error(f"[CommitAgent] Confirmation intent detection error: {e}", exc_info=True)
        # Fail safe — re-show summary and ask again
        summary = build_booking_summary_from_context(active_wf)
        return False, (
            f"Sorry, I didn't quite catch that. Here's your booking summary:\n\n"
            f"{summary}"
        )


# ── Helpers ───────────────────────────────────────────────────────────────────

def _safe_parse_llm(raw: str) -> dict:
    """Parse LLM JSON response safely — return empty dict on error."""
    try:
        cleaned = raw.strip().strip("```json").strip("```").strip()
        return json.loads(cleaned)
    except (json.JSONDecodeError, AttributeError) as e:
        logger.error(f"[CommitAgent] JSON parse error: {raw!r} | {e}")
        return {}
