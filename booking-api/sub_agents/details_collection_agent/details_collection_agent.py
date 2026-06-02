"""
details_collection_agent.py
─────────────────────────────
STEP 3 sub-agent: collect patient name and WhatsApp number.

State machine — determined by what is null in active_workflow.patient:

  BRANCH A — both name AND whatsapp_number already in context (pre-populated):
    → Skip collection. Build summary and hand off to confirm_commit_agent.

  BRANCH B — name is set, whatsapp_number is null:
    → Extract only a WhatsApp number from the user's message.
    → Validate + normalise to E.164.
    → If valid: write to context, show summary → ready for confirm_commit_agent.
    → If invalid: explain error and ask again.

  BRANCH C — name is null, whatsapp_number is set (edge case):
    → Extract only a name from the user's message.
    → If valid: write to context, show summary → ready for confirm_commit_agent.
    → If invalid: ask again.

  BRANCH D — both null (first call from booking_service_agent):
    → LLM call to extract both from the user's message.
    → Write whatever was found to context.
    → If still incomplete: ask for whatever is still missing.
    → If both filled: show summary → ready for confirm_commit_agent.

After BOTH fields are filled this agent returns the booking summary as
reply_to_user. booking_service_agent will route to confirm_commit_agent
on the next turn once the user confirms.
"""

import json
import logging

from services.llm_service import generate_response
from services.context_service import update_workflow_patient, get_active_workflow

from sub_agents.details_collection_agent.details_collection_agent_tools import (
    normalise_whatsapp_number,
    validate_patient_name,
    format_booking_summary,
)
from sub_agents.details_collection_agent.details_collection_context import (
    DETAILS_EXTRACTION_SYSTEM_PROMPT,
    build_details_extraction_prompt,
)

logger = logging.getLogger("booking_api.details_collection_agent")


# ── Entry point ────────────────────────────────────────────────────────────────

async def run(main_context: dict) -> tuple[str, dict]:
    """
    Entry point called by booking_service_agent._dispatch_sub_agent().
    Returns (reply_to_user, updated_main_context).
    """
    tenant_id    = main_context.get("tenant_id", "")
    conv_id      = main_context.get("conversation_id", "")
    user_message = main_context.get("current_user_message", "")

    logger.info(f"[DetailsAgent] Starting | tenant={tenant_id} | conv={conv_id}")

    active_wf = get_active_workflow(main_context)
    if not active_wf:
        logger.error("[DetailsAgent] No active workflow found")
        return "Something went wrong. Please start your booking again.", main_context

    # ── Read current patient state from context ────────────────────────────────
    patient       = active_wf.get("patient", {})
    current_name  = patient.get("name")
    current_wa    = patient.get("whatsapp_number")

    # ── Read service/slot for the summary ─────────────────────────────────────
    service     = active_wf.get("service", {})
    slot        = active_wf.get("slot", {})
    service_name = service.get("name", "the selected service")
    doctor_name  = service.get("doctor_name")
    slot_date    = slot.get("date", "")
    slot_time    = slot.get("time", "")

    print(
        f"\n[DetailsAgent] State | "
        f"name={current_name!r} | whatsapp={current_wa!r}"
    )

    # ── BRANCH A: Both already filled (e.g. pre-populated by new_workflow_agent)
    if current_name and current_wa:
        print("[DetailsAgent] Branch A — both fields already present")
        logger.info("[DetailsAgent] Both fields pre-populated — building summary")
        summary = format_booking_summary(
            service_name=service_name,
            doctor_name=doctor_name,
            slot_date=slot_date,
            slot_time=slot_time,
            patient_name=current_name,
            whatsapp=current_wa,
        )
        return summary, main_context

    # ── Determine which fields are still missing ───────────────────────────────
    missing_fields = []
    already_have   = {}

    if not current_name:
        missing_fields.append("name")
    else:
        already_have["name"] = current_name

    if not current_wa:
        missing_fields.append("whatsapp_number")
    else:
        already_have["whatsapp_number"] = current_wa

    print(f"[DetailsAgent] Missing fields: {missing_fields}")

    # ── BRANCH B: Only WhatsApp is missing — skip LLM, do direct extraction ───
    if current_name and not current_wa:
        print("[DetailsAgent] Branch B — name known, extracting WhatsApp only")
        return await _extract_whatsapp_only(
            user_message=user_message,
            current_name=current_name,
            main_context=main_context,
            service_name=service_name,
            doctor_name=doctor_name,
            slot_date=slot_date,
            slot_time=slot_time,
        )

    # ── BRANCH C: Only name is missing ────────────────────────────────────────
    if current_wa and not current_name:
        print("[DetailsAgent] Branch C — WhatsApp known, extracting name only")
        return await _extract_name_only(
            user_message=user_message,
            current_wa=current_wa,
            main_context=main_context,
            service_name=service_name,
            doctor_name=doctor_name,
            slot_date=slot_date,
            slot_time=slot_time,
        )

    # ── BRANCH D: Both missing — full LLM extraction ──────────────────────────
    print("[DetailsAgent] Branch D — both fields missing, running LLM extraction")
    return await _extract_both(
        user_message=user_message,
        missing_fields=missing_fields,
        already_have=already_have,
        main_context=main_context,
        service_name=service_name,
        doctor_name=doctor_name,
        slot_date=slot_date,
        slot_time=slot_time,
    )


# ── Branch B: Extract WhatsApp number only ────────────────────────────────────

async def _extract_whatsapp_only(
    user_message: str,
    current_name: str,
    main_context: dict,
    service_name: str,
    doctor_name:  str | None,
    slot_date:    str,
    slot_time:    str,
) -> tuple[str, dict]:
    """
    User already provided their name; we're waiting for a WhatsApp number.
    Use regex/tool directly — no need for a full LLM call.
    """
    # Try to pull a digit sequence that looks like a phone number from the message
    raw_candidates = _extract_phone_candidates(user_message)

    for candidate in raw_candidates:
        is_valid, normalised, error = normalise_whatsapp_number(candidate)
        if is_valid and normalised:
            # Write both fields (name was already in context)
            main_context = update_workflow_patient(
                context=main_context,
                patient={"name": current_name, "whatsapp_number": normalised},
            )
            logger.info(
                f"[DetailsAgent] ✓ WhatsApp set | name={current_name!r} | wa={normalised!r}"
            )
            summary = format_booking_summary(
                service_name=service_name,
                doctor_name=doctor_name,
                slot_date=slot_date,
                slot_time=slot_time,
                patient_name=current_name,
                whatsapp=normalised,
            )
            return summary, main_context
        else:
            # Found a number-like string but it failed validation
            logger.info(f"[DetailsAgent] Invalid WhatsApp candidate: {candidate!r} | {error}")
            return (
                f"{error}\n\nPlease provide a valid Sri Lankan WhatsApp number "
                f"(e.g. 0771234567).",
                main_context,
            )

    # No phone-like string found in the message at all
    return (
        f"Thanks, {current_name}! Could you please share your WhatsApp number? "
        f"(e.g. 0771234567)",
        main_context,
    )


# ── Branch C: Extract name only ───────────────────────────────────────────────

async def _extract_name_only(
    user_message: str,
    current_wa:   str,
    main_context: dict,
    service_name: str,
    doctor_name:  str | None,
    slot_date:    str,
    slot_time:    str,
) -> tuple[str, dict]:
    """
    User already provided their WhatsApp number; we're waiting for a name.
    Use LLM to extract it from the message.
    """
    prompt = build_details_extraction_prompt(
        user_message=user_message,
        missing_fields=["name"],
        already_have={"whatsapp_number": current_wa},
        recent_conversation=main_context.get("conversation", [])[-6:],
    )

    raw = generate_response(
        prompt=prompt,
        system_instruction=DETAILS_EXTRACTION_SYSTEM_PROMPT,
        temperature=0.0,
        max_output_tokens=400,
    )

    logger.debug(f"[DetailsAgent] Name-only LLM raw: {raw!r}")
    parsed = _safe_parse_llm(raw)

    name_found = bool(parsed.get("name_found", False))
    raw_name   = parsed.get("name") or ""
    reply      = (parsed.get("reply_to_user") or "").strip()

    if not name_found or not raw_name:
        return reply or "Could you please share your full name?", main_context

    is_valid, clean_name, err = validate_patient_name(raw_name)
    if not is_valid:
        return err or "Could you please share your full name?", main_context

    # Write both fields
    main_context = update_workflow_patient(
        context=main_context,
        patient={"name": clean_name, "whatsapp_number": current_wa},
    )
    logger.info(f"[DetailsAgent] ✓ Name set | name={clean_name!r}")
    summary = format_booking_summary(
        service_name=service_name,
        doctor_name=doctor_name,
        slot_date=slot_date,
        slot_time=slot_time,
        patient_name=clean_name,
        whatsapp=current_wa,
    )
    return summary, main_context


# ── Branch D: Extract both fields via LLM ─────────────────────────────────────

async def _extract_both(
    user_message:  str,
    missing_fields: list[str],
    already_have:  dict,
    main_context:  dict,
    service_name:  str,
    doctor_name:   str | None,
    slot_date:     str,
    slot_time:     str,
) -> tuple[str, dict]:
    """
    Both name and WhatsApp are missing. Ask the LLM to extract them.
    Validate what it finds, write whatever is valid, and ask for the rest.
    """
    prompt = build_details_extraction_prompt(
        user_message=user_message,
        missing_fields=missing_fields,
        already_have=already_have,
        recent_conversation=main_context.get("conversation", [])[-6:],
    )

    raw = generate_response(
        prompt=prompt,
        system_instruction=DETAILS_EXTRACTION_SYSTEM_PROMPT,
        temperature=0.0,
        max_output_tokens=512,
    )

    logger.debug(f"[DetailsAgent] Both-fields LLM raw: {raw!r}")
    parsed = _safe_parse_llm(raw)

    name_found     = bool(parsed.get("name_found", False))
    raw_name       = parsed.get("name") or ""
    wa_found       = bool(parsed.get("whatsapp_found", False))
    raw_wa         = parsed.get("whatsapp_number") or ""
    llm_reply      = (parsed.get("reply_to_user") or "").strip()

    resolved_name  = None
    resolved_wa    = None

    # ── Validate name if found ─────────────────────────────────────────────────
    if name_found and raw_name:
        valid_name, clean_name, name_err = validate_patient_name(raw_name)
        if valid_name:
            resolved_name = clean_name
        else:
            logger.info(f"[DetailsAgent] Invalid name from LLM: {raw_name!r} | {name_err}")
            # Override LLM reply with the error
            llm_reply = name_err or "Could you please share your full name?"

    # ── Validate WhatsApp if found ─────────────────────────────────────────────
    if wa_found and raw_wa:
        valid_wa, normalised_wa, wa_err = normalise_whatsapp_number(raw_wa)
        if valid_wa:
            resolved_wa = normalised_wa
        else:
            logger.info(f"[DetailsAgent] Invalid WhatsApp from LLM: {raw_wa!r} | {wa_err}")
            if not llm_reply:
                llm_reply = wa_err or "Please provide a valid Sri Lankan WhatsApp number."

    print(
        f"[DetailsAgent] Extraction result | "
        f"name={resolved_name!r} | wa={resolved_wa!r}"
    )

    # ── Write whatever is valid into context ───────────────────────────────────
    if resolved_name or resolved_wa:
        patient_update = {}
        if resolved_name:
            patient_update["name"] = resolved_name
        if resolved_wa:
            patient_update["whatsapp_number"] = resolved_wa

        main_context = update_workflow_patient(
            context=main_context,
            patient=patient_update,
        )

        # Re-read from context to confirm what's saved
        active_wf    = get_active_workflow(main_context)
        saved_name   = active_wf["patient"].get("name")
        saved_wa     = active_wf["patient"].get("whatsapp_number")

        logger.info(
            f"[DetailsAgent] Context updated | name={saved_name!r} | wa={saved_wa!r}"
        )

        # Both now filled → show summary
        if saved_name and saved_wa:
            summary = format_booking_summary(
                service_name=service_name,
                doctor_name=doctor_name,
                slot_date=slot_date,
                slot_time=slot_time,
                patient_name=saved_name,
                whatsapp=saved_wa,
            )
            logger.info("[DetailsAgent] ✓ Both fields collected — showing booking summary")
            return summary, main_context

        # Partially filled — ask for the rest
        still_missing = []
        if not saved_name:
            still_missing.append("full name")
        if not saved_wa:
            still_missing.append("WhatsApp number (e.g. 0771234567)")

        if llm_reply:
            return llm_reply, main_context

        ask = " and ".join(still_missing)
        return f"Could you also share your {ask}?", main_context

    # ── Nothing extracted — use LLM reply or default ask ─────────────────────
    if llm_reply:
        return llm_reply, main_context

    return (
        "To complete your booking, I'll need a few details. "
        "Could you please share your full name and WhatsApp number? "
        "(e.g. John Perera, 0771234567)",
        main_context,
    )


# ── Helpers ───────────────────────────────────────────────────────────────────

def _safe_parse_llm(raw: str) -> dict:
    """Parse LLM JSON response safely — return empty dict on error."""
    try:
        cleaned = raw.strip().strip("```json").strip("```").strip()
        return json.loads(cleaned)
    except (json.JSONDecodeError, AttributeError) as e:
        logger.error(f"[DetailsAgent] JSON parse error: {raw!r} | {e}")
        return {}


def _extract_phone_candidates(text: str) -> list[str]:
    """
    Extract digit sequences that might be phone numbers from raw text.
    Returns a list of candidate strings (spaces/dashes preserved for normaliser).
    """
    import re
    # Match: optional +, then 10-12 digits possibly with spaces or dashes
    pattern = re.compile(r"(\+?[\d][\d\s\-]{8,13}[\d])")
    matches = pattern.findall(text)
    # Clean up: strip surrounding whitespace from each match
    return [m.strip() for m in matches if m.strip()]
