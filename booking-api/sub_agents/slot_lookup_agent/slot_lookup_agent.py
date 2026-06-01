"""
slot_lookup_agent.py
─────────────────────
STEP 2 sub-agent: collect a date, fetch available slots, confirm slot selection.

State machine — determined by what is null in active_workflow.slot:

  slot.date is null AND slot.id is null:
    → Run date extraction on user message.
    → If date found: fetch slots and show list to user.
    → If date not found: ask user for date.
    → slot.date written to context only after slots are shown.

  slot.date is set AND slot.id is null:
    → Slots were already shown to user on the previous turn.
    → Run slot selection LLM on current user message.
    → If slot selected: validate in DB, update context (id + time), step → 3.
    → If not selected: re-show the same slots list.

  slot.id is set:
    → Should not reach here (step would already be 3).

The service_lookup_agent asks "which date?" in its confirmation reply,
so this agent receives the date as the FIRST message it processes.
"""

import json
import logging
from datetime import date as date_type

from services.llm_service import generate_response
from services.context_service import update_workflow_slot, get_active_workflow

from sub_agents.slot_lookup_agent.slot_lookup_agent_tools import (
    fetch_slots_by_service_and_date,
    fetch_slot_by_id,
    format_slots_for_display,
)
from sub_agents.slot_lookup_agent.slot_lookup_context import (
    DATE_EXTRACTION_SYSTEM_PROMPT,
    SLOT_SELECTION_SYSTEM_PROMPT,
    build_date_extraction_prompt,
    build_slot_selection_prompt,
)

logger = logging.getLogger("booking_api.slot_lookup_agent")


# ── Entry point ────────────────────────────────────────────────────────────────

async def run(main_context: dict) -> tuple[str, dict]:
    """
    Entry point called by booking_service_agent._dispatch_sub_agent().
    Returns (reply_to_user, updated_main_context).
    """
    tenant_id    = main_context.get("tenant_id", "")
    conv_id      = main_context.get("conversation_id", "")
    user_message = main_context.get("current_user_message", "")
    today        = str(date_type.today())

    logger.info(f"[SlotLookupAgent] Starting | tenant={tenant_id} | conv={conv_id}")

    active_wf    = get_active_workflow(main_context)
    service_id   = active_wf["service"]["id"]   if active_wf else None
    service_name = active_wf["service"]["name"] if active_wf else "the selected service"
    slot_date    = active_wf["slot"]["date"]     if active_wf else None
    slot_id      = active_wf["slot"]["id"]       if active_wf else None

    # Safety guard
    if not service_id:
        logger.error("[SlotLookupAgent] Called before service is filled")
        return "Please select a service first before checking slots.", main_context

    print(f"\n[SlotLookupAgent] State | slot.date={slot_date!r} | slot.id={slot_id!r}")

    # ── BRANCH A: slot.date already set, slot.id still null ───────────────────
    # Slots were shown on the previous turn. User is now picking one.
    if slot_date and not slot_id:
        print(f"[SlotLookupAgent] Branch A — date known ({slot_date}), awaiting slot pick")
        return await _select_slot(
            main_context=main_context,
            tenant_id=tenant_id,
            service_id=service_id,
            service_name=service_name,
            slot_date=slot_date,
            user_message=user_message,
        )

    # ── BRANCH B: slot.date is null — extract date from user message ──────────
    print(f"[SlotLookupAgent] Branch B — no date yet, extracting from: '{user_message[:80]}'")

    date_found, extracted_date, ask_date_reply = await _extract_date(
        user_message=user_message,
        recent_conversation=main_context.get("conversation", [])[-6:],
        today=today,
    )

    print(f"[SlotLookupAgent] Date extraction → found={date_found} | date={extracted_date}")

    if not date_found or not extracted_date:
        # No date in this message — ask the user
        logger.info("[SlotLookupAgent] No date found — asking user")
        return ask_date_reply, main_context

    # Date found — fetch slots and show list.
    # Write slot.date into context NOW so next turn goes to Branch A.
    main_context = _write_slot_date(main_context, extracted_date)

    available_slots = await fetch_slots_by_service_and_date(
        tenant_id=tenant_id,
        service_id=service_id,
        slot_date=extracted_date,
    )

    if not available_slots:
        logger.info(f"[SlotLookupAgent] No slots on {extracted_date} — clearing date, asking again")
        main_context = _clear_slot_date(main_context)
        return (
            f"Sorry, there are no available slots for {service_name} on {extracted_date}. "
            f"Please choose a different date.",
            main_context,
        )

    # Show slots — user will pick on next turn (handled by Branch A)
    slots_display = format_slots_for_display(available_slots, extracted_date)
    reply = (
        f"Here are the available slots for {service_name} on {extracted_date}:\n\n"
        f"{slots_display}\n\n"
        f"Which time would you prefer?"
    )
    print(f"[SlotLookupAgent] Showing {len(available_slots)} slot(s) for {extracted_date}")
    return reply, main_context


# ── Branch A: user is picking a slot ──────────────────────────────────────────

async def _select_slot(
    main_context: dict,
    tenant_id: str,
    service_id: str,
    service_name: str,
    slot_date: str,
    user_message: str,
) -> tuple[str, dict]:
    """
    Fetch slots for the stored date and run slot selection LLM.
    Called when slot.date is already set from the previous turn.
    """
    # Re-fetch slots (live check — don't rely on what was shown last turn)
    available_slots = await fetch_slots_by_service_and_date(
        tenant_id=tenant_id,
        service_id=service_id,
        slot_date=slot_date,
    )

    if not available_slots:
        # All slots taken since last shown — clear date, ask for new one
        main_context = _clear_slot_date(main_context)
        return (
            f"Sorry, all slots for {slot_date} are now taken. "
            f"Please choose a different date.",
            main_context,
        )

    # Call LLM to detect which slot the user picked
    prompt = build_slot_selection_prompt(
        user_message=user_message,
        available_slots=available_slots,
        slot_date=slot_date,
        service_name=service_name,
    )

    raw = generate_response(
        prompt=prompt,
        system_instruction=SLOT_SELECTION_SYSTEM_PROMPT,
        temperature=0.0,
        max_output_tokens=400,
    )

    logger.debug(f"[SlotLookupAgent] Slot selection LLM raw: {raw!r}")

    slot_selected, slot_data, reply = _parse_slot_selection(raw, available_slots, slot_date)

    print(f"[SlotLookupAgent] Slot selection → selected={slot_selected} | data={slot_data}")

    if not slot_selected:
        # User didn't clearly pick — re-show the list
        return reply, main_context

    # Validate the selected slot is still available in DB
    validated = await fetch_slot_by_id(slot_id=slot_data["slot_id"], tenant_id=tenant_id)

    if not validated:
        logger.warning(f"[SlotLookupAgent] Slot {slot_data['slot_id']} no longer available")
        updated_slots = await fetch_slots_by_service_and_date(
            tenant_id=tenant_id, service_id=service_id, slot_date=slot_date
        )
        return (
            f"Sorry, that slot was just taken. Here are the remaining slots:\n\n"
            f"{format_slots_for_display(updated_slots, slot_date)}\n\nPlease choose another.",
            main_context,
        )

    # Write confirmed slot into context — id, date, time — step advances to 3
    main_context = update_workflow_slot(
        context=main_context,
        slot={
            "id":   validated["id"],
            "date": validated["date"],
            "time": validated["time"],
        },
    )

    logger.info(
        f"[SlotLookupAgent] ✓ Slot confirmed → "
        f"id={validated['id']} | date={validated['date']} | time={validated['time']}"
    )
    return reply, main_context


# ── Date extraction LLM call ───────────────────────────────────────────────────

async def _extract_date(
    user_message: str,
    recent_conversation: list[dict],
    today: str,
) -> tuple[bool, str | None, str]:
    """
    Extract a booking date from the user message.
    Returns (date_found, date_str | None, reply_if_not_found).
    """
    prompt = build_date_extraction_prompt(
        user_message=user_message,
        recent_conversation=recent_conversation,
        today_date=today,
    )

    raw = generate_response(
        prompt=prompt,
        system_instruction=DATE_EXTRACTION_SYSTEM_PROMPT,
        temperature=0.0,
        max_output_tokens=1024,
    )

    try:
        cleaned = raw.strip().strip("```json").strip("```").strip()
        parsed  = json.loads(cleaned)
    except (json.JSONDecodeError, AttributeError) as e:
        logger.error(f"[SlotLookupAgent] Date parse error: {raw!r} | {e}")
        return False, None, "Which date would you like to book your appointment?"

    date_found = bool(parsed.get("date_found", False))
    date_str   = parsed.get("date")
    reply      = (parsed.get("reply_to_user") or "").strip()

    if not date_found and not reply:
        reply = "Which date would you like? For example: 'tomorrow', 'June 10th', or 'next Monday'."

    return date_found, date_str if date_found else None, reply


# ── Slot selection parser ──────────────────────────────────────────────────────

def _parse_slot_selection(
    raw: str,
    available_slots: list[dict],
    slot_date: str,
) -> tuple[bool, dict | None, str]:
    """
    Parse slot selection LLM response.
    Returns (slot_selected, slot_data | None, reply_to_user).
    Hallucination guard: slot_id must exist in the fetched DB list.
    """
    try:
        cleaned = raw.strip().strip("```json").strip("```").strip()
        parsed  = json.loads(cleaned)
    except (json.JSONDecodeError, AttributeError) as e:
        logger.error(f"[SlotLookupAgent] Slot selection parse error: {raw!r} | {e}")
        return False, None, _show_slots_reply(available_slots, slot_date)

    slot_selected = bool(parsed.get("slot_selected", False))
    slot_id       = parsed.get("slot_id")
    slot_date_out = parsed.get("slot_date")
    slot_time     = parsed.get("slot_time")
    reply         = (parsed.get("reply_to_user") or "").strip()

    if not slot_selected:
        return False, None, reply or _show_slots_reply(available_slots, slot_date)

    # Hallucination guard
    valid_ids = {s["id"] for s in available_slots}
    if slot_id not in valid_ids:
        logger.warning(f"[SlotLookupAgent] Hallucinated slot_id '{slot_id}' — rejecting")
        return False, None, _show_slots_reply(available_slots, slot_date)

    if not reply:
        reply = (
            f"Perfect! I've noted the {slot_time} slot on {slot_date_out or slot_date}. "
            f"Let me collect your details to confirm the booking."
        )

    return True, {
        "slot_id":   slot_id,
        "slot_date": slot_date_out or slot_date,
        "slot_time": slot_time,
    }, reply


# ── Context write helpers ──────────────────────────────────────────────────────

def _write_slot_date(context: dict, date_str: str) -> dict:
    """
    Write only slot.date into the active workflow.
    slot.id and slot.time remain null — slot not yet confirmed.
    This persists via booking_service_agent after this agent returns,
    so next turn Branch A correctly detects the stored date.
    """
    active_wf = get_active_workflow(context)
    if active_wf:
        active_wf["slot"]["date"] = date_str
    return context


def _clear_slot_date(context: dict) -> dict:
    """Clear slot.date when the chosen date has no available slots."""
    active_wf = get_active_workflow(context)
    if active_wf:
        active_wf["slot"]["date"] = None
    return context


def _show_slots_reply(available_slots: list[dict], slot_date: str) -> str:
    """Build fallback reply showing all slots."""
    slots_display = format_slots_for_display(available_slots, slot_date)
    return (
        f"Here are the available slots:\n\n{slots_display}\n\n"
        f"Which time would you prefer?"
    )