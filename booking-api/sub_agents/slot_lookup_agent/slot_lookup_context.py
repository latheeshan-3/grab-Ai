"""
slot_lookup_context.py
───────────────────────
System prompts and prompt builders for the two LLM calls in slot_lookup_agent.

  CALL 1 — Date extraction:
    Input:  user message + today's date + recent conversation
    Output: {"date_found": bool, "date": "YYYY-MM-DD" | null, "reply_to_user": str | null}

  CALL 2 — Slot selection:
    Input:  user message + available slots list
    Output: {"slot_selected": bool, "slot_id": str | null, ...}
"""

import json
import re
import logging

logger = logging.getLogger("booking_api.slot_lookup_context")


# ── Call 1: Date extraction system prompt ─────────────────────────────────────

DATE_EXTRACTION_SYSTEM_PROMPT = """
You are a date extraction assistant for a medical center booking system.

You will receive the user's message and today's date.
Your ONLY job: determine if the user's message contains or implies a booking date.

RULES:
  - Accept ANY natural date expression: "tomorrow", "June 5th", "next Monday",
    "the 10th", "10/06", "2026-06-10", "next week", "this Friday", "06", etc.
  - Strip noise — punctuation (?!.,), filler words (maybe, perhaps, how about,
    I want to book, can I book). Extract the date fragment only.
  - Resolve relative dates using today's date provided in the context.
  - Accept FUTURE dates only. If clearly in the past, set date_found = false.
  - When there is ANY date hint in the message, set date_found = true.
    Only return date_found = false if the message contains NO date whatsoever
    (e.g. "I have no idea", "what options do you have", pure slot number picks).

RESPONSE FORMAT — ONLY valid JSON, no preamble, no markdown:

When date found:
{"date_found": true, "date": "YYYY-MM-DD", "reply_to_user": null}

When NO date found:
{"date_found": false, "date": null, "reply_to_user": "Which date would you like to book? For example: 'tomorrow', 'June 10th', or 'next Monday'."}
""".strip()


def build_date_extraction_prompt(
    user_message: str,
    recent_conversation: list[dict],
    today_date: str,
) -> str:
    """
    Build the date extraction prompt.
    Strips punctuation/filler from user_message before sending
    so the LLM isn't distracted by "tomorrow?" vs "tomorrow".
    """
    # Strip leading/trailing punctuation and common filler
    cleaned = re.sub(r"^[\s?!.,;:]+|[\s?!.,;:]+$", "", user_message).strip()
    cleaned = re.sub(
        r"^(i want to book|can i book|book me|maybe|perhaps|how about|i'd like)\s+",
        "", cleaned, flags=re.IGNORECASE
    ).strip()

    if cleaned != user_message:
        logger.debug(f"[SlotLookupContext] Cleaned for date extraction: {user_message!r} → {cleaned!r}")

    payload = {
        "today_date":          today_date,
        "user_message":        cleaned,
        "recent_conversation": recent_conversation[-4:],  # last 4 turns only
    }
    return f"Date extraction context:\n{json.dumps(payload, indent=2, ensure_ascii=False, default=str)}"


# ── Call 2: Slot selection system prompt ─────────────────────────────────────

SLOT_SELECTION_SYSTEM_PROMPT = """
You are the slot selection agent for a medical center booking system.

You will receive the user's message and a list of available slots (id, date, time).

Your ONLY job: check if the user's message indicates which slot they want to book.

The user may say:
  - A time: "9am", "9:00", "half past ten", "10:30"
  - A number: "the first one", "number 2", "slot 3", "the second"
  - Relative: "the earliest", "the latest", "the last one"

RESPONSE FORMAT — ONLY valid JSON, no preamble, no markdown:

If user clearly selected a slot:
{
  "slot_selected": true,
  "slot_id": "<exact id from the slots list — copy verbatim>",
  "slot_date": "<YYYY-MM-DD>",
  "slot_time": "<HH:MM>",
  "reply_to_user": "<brief confirmation e.g. 'Perfect! Noted the 09:30 slot on June 10th. Let me collect your details.'>"
}

If user has NOT clearly selected a slot:
{
  "slot_selected": false,
  "slot_id": null,
  "slot_date": null,
  "slot_time": null,
  "reply_to_user": "<re-show the slots list numbered, ask user to choose>"
}

CRITICAL: slot_id MUST be copied exactly from the provided available_slots list. Never invent an id.
""".strip()


def build_slot_selection_prompt(
    user_message: str,
    available_slots: list[dict],
    slot_date: str,
    service_name: str,
) -> str:
    payload = {
        "user_message":    user_message,
        "service_name":    service_name,
        "slot_date":       slot_date,
        "available_slots": available_slots,
    }
    return f"Slot selection context:\n{json.dumps(payload, indent=2, ensure_ascii=False, default=str)}"