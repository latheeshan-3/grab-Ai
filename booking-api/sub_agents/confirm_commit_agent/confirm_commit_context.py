"""
confirm_commit_context.py
──────────────────────────
System prompts and prompt builders for the confirm_commit_agent.

  CALL 1 — Confirmation intent detection:
    Input:  user message + booking summary
    Output: {
               "confirmed": bool,
               "reply_to_user": str | null
            }

    confirmed = true  → user said yes / ok / proceed / any acceptance
    confirmed = false → user said no / wait / change / any rejection
"""

import json
import logging

logger = logging.getLogger("booking_api.confirm_commit_context")


# ── Confirmation intent detection system prompt ───────────────────────────────

CONFIRM_INTENT_SYSTEM_PROMPT = """
You are a booking confirmation intent detector for a medical center.

The user has just reviewed their booking summary and you must decide whether
they want to CONFIRM the booking or NOT.

RULES:
  - Treat any positive response as confirmed:
      yes, ok, okay, sure, confirm, go ahead, proceed, that's correct,
      looks good, perfect, yep, yup, definitely, please do, correct, 
      sounds good, book it, do it, confirmed, right, fine, alright,
      great, wonderful — and natural language equivalents in any style.
  - Treat any negative or hesitant response as NOT confirmed:
      no, wait, cancel, change, incorrect, wrong, stop, hold on,
      not yet, let me think, actually — and natural language equivalents.
  - If the intent is ambiguous, set confirmed = false and politely ask
    the user to reply with a clear yes or no.

RESPONSE FORMAT — ONLY valid JSON, no preamble, no markdown:

When the user confirms:
{
  "confirmed": true,
  "reply_to_user": null
}

When the user does NOT confirm:
{
  "confirmed": false,
  "reply_to_user": "<friendly message — e.g. 'No problem! Would you like to change anything or cancel?'>"
}

When intent is ambiguous:
{
  "confirmed": false,
  "reply_to_user": "Could you please confirm — shall I go ahead and book this appointment? Reply *yes* to confirm or *no* to cancel."
}

CRITICAL:
  - Never fabricate intent.
  - reply_to_user MUST be null only when confirmed = true.
  - Do not include any text outside the JSON object.
""".strip()


def build_confirm_intent_prompt(
    user_message: str,
    booking_summary: str,
    recent_conversation: list[dict],
) -> str:
    """
    Build the confirmation intent detection prompt.
    Provides the LLM with the user's message, the booking summary shown to
    the user, and recent conversation history for context.
    """
    payload = {
        "user_message": user_message,
        "booking_summary_shown_to_user": booking_summary,
        "recent_conversation": recent_conversation[-6:],  # last 6 turns
    }
    return (
        f"Confirmation intent detection context:\n"
        f"{json.dumps(payload, indent=2, ensure_ascii=False, default=str)}"
    )


def build_booking_summary_from_context(active_wf: dict) -> str:
    """
    Re-build the booking summary string from the active workflow context.
    Used to remind the user what they are confirming.
    """
    service     = active_wf.get("service", {})
    slot        = active_wf.get("slot", {})
    patient     = active_wf.get("patient", {})

    service_name = service.get("name", "the selected service")
    doctor_name  = service.get("doctor_name")
    slot_date    = slot.get("date", "")
    slot_time    = slot.get("time", "")
    patient_name = patient.get("name", "")
    whatsapp     = patient.get("whatsapp_number", "")

    doctor_line = f"Doctor   : {doctor_name}" if doctor_name else "Doctor   : (not specified)"

    return (
        f"📋 *Booking Summary*\n"
        f"Service  : {service_name}\n"
        f"{doctor_line}\n"
        f"Date     : {slot_date}\n"
        f"Time     : {slot_time}\n"
        f"Patient  : {patient_name}\n"
        f"WhatsApp : {whatsapp}\n"
        f"Shall I confirm this booking? (Reply *yes* to confirm or *no* to cancel)"
    )
