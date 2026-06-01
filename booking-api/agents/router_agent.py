import json
import logging
from services.llm_service import generate_response
from services.redis_service import get_redis

logger = logging.getLogger("booking_api.router_agent")

ROUTER_SYSTEM_PROMPT = """
You are a routing agent for a medical center booking assistant.

Your ONLY job is to classify the user's message into one of two services:
  - "rag_service"      → user is asking a question (about services, doctors, prices, location, hours, FAQs, or any general information)
  - "booking_service"  → user wants to book, cancel, reschedule, or manage an appointment

IMPORTANT: When in doubt, prefer "booking_service". Short replies like dates ("tomorrow",
"June 5th", "next Monday"), times ("10am"), confirmations ("yes", "ok", "the first one",
"number 2"), or slot selections are part of an ongoing booking conversation — classify
these as "booking_service".

Respond with ONLY a valid JSON object — no preamble, no markdown, no explanation:
{"service": "rag_service"}
or
{"service": "booking_service"}

Examples:
  "What doctors do you have?"              → {"service": "rag_service"}
  "What are your opening hours?"           → {"service": "rag_service"}
  "I want to book an appointment"          → {"service": "booking_service"}
  "Cancel my booking"                      → {"service": "booking_service"}
  "Do you have a dermatologist?"           → {"service": "rag_service"}
  "Book me for cardiology next Monday"     → {"service": "booking_service"}
  "How much does a consultation cost?"     → {"service": "rag_service"}
  "I want to reschedule my appointment"    → {"service": "booking_service"}
  "tomorrow"                               → {"service": "booking_service"}
  "June 10th"                              → {"service": "booking_service"}
  "the first one"                          → {"service": "booking_service"}
  "yes"                                    → {"service": "booking_service"}
  "10:30"                                  → {"service": "booking_service"}
  "ok"                                     → {"service": "booking_service"}
""".strip()


async def route_request(
    tenant_id: str,
    conversation_id: str,
    user_message: str,
) -> str:
    """
    Classify the user message and return the target service name.

    Priority logic:
      1. If an active booking session exists in Redis for this conversation_id
         AND the active workflow is in_progress → always route to booking_service.
         This covers short follow-up messages like dates, slot numbers, confirmations
         that the LLM might misclassify without full context.
      2. Otherwise call the LLM to classify intent.

    Returns "rag_service" or "booking_service".
    """
    logger.info(
        f"[RouterAgent] tenant={tenant_id} | conv={conversation_id} | "
        f"message='{user_message[:80]}'"
    )

    # ── Priority check: active booking session in Redis ────────────────────────
    # If the user already has an in-progress booking workflow, any message they
    # send is a continuation of that workflow — route directly to booking_service
    # without calling the LLM. This prevents short replies like "tomorrow" or
    # "the first one" from being misrouted to rag_service.
    if await _has_active_booking_session(conversation_id):
        print(f"\n[RouterAgent] → Active booking session detected — routing to: booking_service\n")
        logger.info(f"[RouterAgent] Active session shortcut → booking_service")
        return "booking_service"

    # ── No active session — classify intent via LLM ───────────────────────────
    prompt = f"User message: {user_message}"

    raw_response = generate_response(
        prompt=prompt,
        system_instruction=ROUTER_SYSTEM_PROMPT,
        temperature=0.0,
        max_output_tokens=320,
    )

    logger.debug(f"[RouterAgent] Raw LLM response: {raw_response!r}")

    try:
        cleaned = raw_response.strip().strip("```json").strip("```").strip()
        parsed = json.loads(cleaned)
        service = parsed.get("service", "").strip()
    except (json.JSONDecodeError, AttributeError) as e:
        logger.error(
            f"[RouterAgent] Failed to parse LLM response: {raw_response!r} | Error: {e}"
        )
        service = "rag_service"

    valid_services = {"rag_service", "booking_service"}
    if service not in valid_services:
        logger.warning(
            f"[RouterAgent] Unexpected value '{service}' — defaulting to rag_service"
        )
        service = "rag_service"

    print(f"\n[RouterAgent] → Routed to: {service}\n")
    logger.info(f"[RouterAgent] Routing decision: {service}")

    return service


async def _has_active_booking_session(conversation_id: str) -> bool:
    """
    Check Redis for an existing booking context window.
    Returns True if a context exists AND has at least one in_progress workflow.
    Returns False if no session exists (new conversation) or all workflows are completed/cancelled.
    """
    try:
        import json as _json
        client = get_redis()
        raw = await client.get(f"booking:session:{conversation_id}")
        if not raw:
            return False

        ctx = _json.loads(raw)
        workflows = ctx.get("workflows", [])

        # Check if any workflow is still in_progress
        has_active = any(wf.get("status") == "in_progress" for wf in workflows)
        logger.debug(
            f"[RouterAgent] Session check | conv={conversation_id} | "
            f"has_active_workflow={has_active}"
        )
        return has_active

    except Exception as e:
        logger.error(f"[RouterAgent] Redis session check failed | {e}")
        # On error, fall through to LLM classification — safer than blocking
        return False