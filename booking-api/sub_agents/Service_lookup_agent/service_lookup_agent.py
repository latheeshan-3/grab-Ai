"""
service_lookup_agent.py
────────────────────────
STEP 1 sub-agent: identify which service the user wants to book.

Exactly TWO outcomes — nothing else:

  OUTCOME A — service found in user query:
    → update Redis context window service fields (id, name, doctor_name)
    → return confirmation reply  (booking_service_agent will call slots next)

  OUTCOME B — no service mentioned in user query:
    → return all available services as a list asking user to choose
    → context window unchanged (service still null, step still 1)

Flow:
  1. Fetch all active services from Supabase for this tenant.
  2. Build prompt  =  user message  +  full services list from DB.
  3. LLM call — returns JSON with "matched" true/false.
  4. If matched → validate id exists in DB list → update context.
  5. Return (reply, context).
"""

import json
import logging

from services.llm_service import generate_response
from services.context_service import update_workflow_service
from sub_agents.Service_lookup_agent.service_lookup_agent_tools import (
    fetch_active_services,
    format_services_for_display,
)

logger = logging.getLogger("booking_api.service_lookup_agent")

# ── System prompt ──────────────────────────────────────────────────────────────
# Exactly two JSON shapes — no third option.

SYSTEM_PROMPT = """
You are the service selection agent for a medical center booking assistant.

You will receive:
  - The user's message
  - The full list of available services from the database (id, service_name, doctor_name)

Your ONLY job: check whether the user's message mentions or implies any service in the list.
Use fuzzy matching — "heart doctor" → Cardiology, "skin" → Dermatology, "general" → General Consultation, etc.

You MUST reply with ONLY a valid JSON object. No preamble. No markdown. No explanation.

──────────────────────────────────────────────────
CASE 1 — User message contains a recognisable service:
{
  "matched": true,
  "service_id": "<exact id from the services list>",
  "service_name": "<exact service_name from the services list>",
  "doctor_name": "<doctor_name from the list, or null>",
  "reply_to_user": "<short confirmation, e.g. 'Got it! I'll check available slots for Dermatology with Dr. Perera.which date you want to book?'>"
}

──────────────────────────────────────────────────
CASE 2 — User message does NOT mention any specific service:
{
  "matched": false,
  "service_id": null,
  "service_name": null,
  "doctor_name": null,
  "reply_to_user": "<friendly message listing ALL services from the list, numbered, asking user to choose one>"
}

IMPORTANT:
- service_id MUST be copied exactly from the provided services list. Never invent an id.
- If you are not confident, choose CASE 2.
""".strip()


# ── Entry point ────────────────────────────────────────────────────────────────

async def run(main_context: dict) -> tuple[str, dict]:
    """
    Called by booking_service_agent._dispatch_sub_agent().

    Returns:
        (reply_to_user: str, updated_main_context: dict)
    """
    tenant_id       = main_context.get("tenant_id", "")
    conversation_id = main_context.get("conversation_id", "")
    user_message    = main_context.get("current_user_message", "")

    logger.info(f"[ServiceLookupAgent] Starting | tenant={tenant_id} | conv={conversation_id}")

    # ── Step 1: Fetch active services from Supabase ────────────────────────────
    available_services = await fetch_active_services(tenant_id)

    print(f"\n[ServiceLookupAgent] {len(available_services)} active service(s) loaded from DB")

    if not available_services:
        # DB returned nothing — surface a clear message, do not call LLM
        logger.warning(f"[ServiceLookupAgent] No active services found for tenant={tenant_id}")
        reply = (
            "I'm sorry, there are no services currently available for booking. "
            "Please contact us directly for assistance."
        )
        return reply, main_context

    # ── Step 2: Build prompt ───────────────────────────────────────────────────
    # Services list is sent as a JSON array so LLM has exact ids to copy from.
    services_json = json.dumps(available_services, indent=2, ensure_ascii=False)

    prompt = (
        f"User message: {user_message}\n\n"
        f"Available services from database:\n{services_json}"
    )

    # ── Step 3: LLM call ───────────────────────────────────────────────────────
    print(f"[ServiceLookupAgent] Calling LLM to match service in: '{user_message[:80]}'")

    raw_response = generate_response(
        prompt=prompt,
        system_instruction=SYSTEM_PROMPT,
        temperature=0.0,
        max_output_tokens=400,
    )

    logger.debug(f"[ServiceLookupAgent] LLM raw: {raw_response!r}")

    # ── Step 4: Parse LLM response ─────────────────────────────────────────────
    matched, service_data, reply_to_user = _parse_response(raw_response, available_services)

    # ── Step 5: Terminal output ────────────────────────────────────────────────
    if matched:
        print(
            f"[ServiceLookupAgent] ✓ Service matched → "
            f"name='{service_data['service_name']}' | "
            f"doctor='{service_data['doctor_name']}' | "
            f"id={service_data['service_id']}"
        )
    else:
        print("[ServiceLookupAgent] ✗ No service matched — sending list to user")

    # ── Step 6: Update context if matched ─────────────────────────────────────
    if matched and service_data:
        main_context = update_workflow_service(
            context=main_context,
            service={
                "id":          service_data["service_id"],
                "name":        service_data["service_name"],
                "doctor_name": service_data["doctor_name"],
            },
        )
        logger.info(
            f"[ServiceLookupAgent] Workflow updated → "
            f"service='{service_data['service_name']}' | id={service_data['service_id']}"
        )

    return reply_to_user, main_context


# ── Response parser ────────────────────────────────────────────────────────────

def _parse_response(
    raw: str,
    available_services: list[dict],
) -> tuple[bool, dict | None, str]:
    """
    Parse LLM JSON response.

    Returns:
        (matched: bool, service_data: dict | None, reply_to_user: str)

    Hallucination guard: if matched=true but the returned service_id is not
    in the DB list, we reject the match and fall back to listing services.
    """
    try:
        cleaned = raw.strip().strip("```json").strip("```").strip()
        parsed  = json.loads(cleaned)
    except (json.JSONDecodeError, AttributeError) as e:
        logger.error(f"[ServiceLookupAgent] JSON parse error: {raw!r} | {e}")
        return False, None, _list_services_reply(available_services)

    matched      = bool(parsed.get("matched", False))
    service_id   = parsed.get("service_id")
    service_name = parsed.get("service_name")
    doctor_name  = parsed.get("doctor_name")
    reply        = (parsed.get("reply_to_user") or "").strip()

    if not reply:
        # LLM returned empty reply — build one ourselves
        if matched and service_name:
            doc = f" with {doctor_name}" if doctor_name else ""
            reply = f"Got it! I'll check available slots for {service_name}{doc}."
        else:
            reply = _list_services_reply(available_services)

    if matched:
        # Hallucination guard — service_id must exist in DB list
        valid_ids = {svc["id"] for svc in available_services}
        if service_id not in valid_ids:
            logger.warning(
                f"[ServiceLookupAgent] Hallucinated service_id '{service_id}' — rejecting match"
            )
            return False, None, _list_services_reply(available_services)

        return True, {
            "service_id":   service_id,
            "service_name": service_name,
            "doctor_name":  doctor_name,
        }, reply

    return False, None, reply


def _list_services_reply(available_services: list[dict]) -> str:
    """Build the fallback reply that lists all services for the user to choose from."""
    service_list = format_services_for_display(available_services)
    return (
        "I'd be happy to help you book an appointment! "
        "Here are our available services:\n\n"
        f"{service_list}\n\n"
        "Which service would you like to book?"
    )