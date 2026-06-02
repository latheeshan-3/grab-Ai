"""
details_collection_agent_tools.py
───────────────────────────────────
Validation and normalisation tools for the details collection sub-agent.

No Supabase queries are needed at this step.
All tools are synchronous — they never touch context or Redis directly.

Tools:
  1. normalise_whatsapp_number  — normalise + validate a Sri Lankan mobile number to E.164
  2. validate_patient_name      — basic sanity check on a name string
  3. format_booking_summary     — build a human-readable summary of the pending booking
"""

import re
import logging

logger = logging.getLogger("booking_api.details_collection_tools")


# ── Tool 1: WhatsApp number normalisation ─────────────────────────────────────

# Sri Lankan mobile prefixes after the leading 07 (or +947 / 947)
_SL_MOBILE_PREFIXES = {
    "070", "071", "072", "074", "075", "076", "077", "078",
}


def normalise_whatsapp_number(raw: str) -> tuple[bool, str | None, str | None]:
    """
    Normalise a raw Sri Lankan mobile number to E.164 format (+94XXXXXXXXX).

    Accepted inputs (examples):
        "0771234567"
        "077 123 4567"
        "077-123-4567"
        "+94771234567"
        "94771234567"
        "0 77 1234567"

    Returns:
        (is_valid: bool, normalised: str | None, error_reason: str | None)

    Examples:
        ("0771234567")  → (True,  "+94771234567", None)
        ("1234567890")  → (False, None, "Not a recognised Sri Lankan mobile number.")
    """
    if not raw or not isinstance(raw, str):
        return False, None, "No number provided."

    # Strip all non-digit characters except leading +
    has_plus   = raw.strip().startswith("+")
    digits_only = re.sub(r"\D", "", raw)

    logger.debug(f"[DetailsTools] Normalising number: raw={raw!r} | digits={digits_only!r}")

    # ── Detect format and normalise to 9-digit local part ─────────────────────
    local_9: str | None = None   # the 9 digits after the country code prefix

    if len(digits_only) == 10 and digits_only.startswith("0"):
        # Local format: 0XXXXXXXXX  (10 digits)
        local_9 = digits_only[1:]          # drop leading 0 → 9 digits

    elif len(digits_only) == 11 and digits_only.startswith("94"):
        # Country-code format without +: 94XXXXXXXXX  (11 digits)
        local_9 = digits_only[2:]          # drop "94" → 9 digits

    elif len(digits_only) == 11 and has_plus and digits_only.startswith("94"):
        # Full E.164: +94XXXXXXXXX  (11 digits)
        local_9 = digits_only[2:]

    if local_9 is None or len(local_9) != 9:
        reason = (
            f"'{raw}' does not look like a valid Sri Lankan mobile number. "
            "Please use a format like 0771234567 or +94771234567."
        )
        logger.info(f"[DetailsTools] Invalid number length | digits={digits_only!r}")
        return False, None, reason

    # Reconstruct the three-digit prefix to check it's a mobile prefix
    prefix_3 = "0" + local_9[:2]           # e.g. "077"
    if prefix_3 not in _SL_MOBILE_PREFIXES:
        reason = (
            f"'{raw}' does not appear to be a Sri Lankan mobile number "
            f"(prefix {prefix_3} not recognised). "
            "WhatsApp notifications require a mobile number (07X...)."
        )
        logger.info(f"[DetailsTools] Invalid prefix | prefix={prefix_3!r}")
        return False, None, reason

    normalised = f"+94{local_9}"
    logger.info(f"[DetailsTools] ✓ Number normalised | {raw!r} → {normalised!r}")
    return True, normalised, None


# ── Tool 2: Patient name validation ───────────────────────────────────────────

_MIN_NAME_LEN  = 2
_MAX_NAME_LEN  = 80
_NAME_PATTERN  = re.compile(r"^[A-Za-z\s'\-\.]+$")


def validate_patient_name(raw_name: str) -> tuple[bool, str | None, str | None]:
    """
    Basic validation for a patient name.

    Rules:
      - Between 2 and 80 characters after stripping whitespace.
      - Only letters, spaces, hyphens, apostrophes, and dots.
      - Returned name is title-cased.

    Returns:
        (is_valid: bool, cleaned_name: str | None, error_reason: str | None)
    """
    if not raw_name or not isinstance(raw_name, str):
        return False, None, "No name provided."

    cleaned = raw_name.strip()

    if len(cleaned) < _MIN_NAME_LEN:
        return False, None, f"Name '{cleaned}' is too short. Please provide your full name."

    if len(cleaned) > _MAX_NAME_LEN:
        return False, None, "The name provided is too long. Please use your legal name."

    if not _NAME_PATTERN.match(cleaned):
        return False, None, (
            f"'{cleaned}' contains unexpected characters. "
            "Please use letters only (hyphens and apostrophes are accepted)."
        )

    # Title-case: "JOHN PERERA" → "John Perera", "john perera" → "John Perera"
    title_cased = " ".join(part.capitalize() for part in cleaned.split())
    logger.info(f"[DetailsTools] ✓ Name validated | {raw_name!r} → {title_cased!r}")
    return True, title_cased, None


# ── Tool 3: Booking summary formatter ─────────────────────────────────────────

def format_booking_summary(
    service_name: str,
    doctor_name:  str | None,
    slot_date:    str,
    slot_time:    str,
    patient_name: str,
    whatsapp:     str,
) -> str:
    """
    Build a human-readable booking confirmation summary to show the user
    before calling confirm_commit_agent.

    Example output:
        📋 Booking Summary
        ─────────────────────────────
        Service  : Dermatology
        Doctor   : Dr. Perera
        Date     : 2026-06-10
        Time     : 09:30
        Patient  : John Perera
        WhatsApp : +94771234567
        ─────────────────────────────
        Please confirm to complete the booking.
    """
    doctor_line = f"Doctor   : {doctor_name}" if doctor_name else "Doctor   : (not specified)"
    return (
        f"📋 *Booking Summary*\n"
        f"─────────────────────────────\n"
        f"Service  : {service_name}\n"
        f"{doctor_line}\n"
        f"Date     : {slot_date}\n"
        f"Time     : {slot_time}\n"
        f"Patient  : {patient_name}\n"
        f"WhatsApp : {whatsapp}\n"
        f"─────────────────────────────\n"
        f"Shall I confirm this booking? (Reply *yes* to confirm or *no* to cancel)"
    )
