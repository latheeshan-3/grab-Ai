import json
import logging
from services.llm_service import generate_response

logger = logging.getLogger("booking_api.router_agent")

# ── System prompt for the router LLM call ─────────────────────────────────────
# Strictly returns JSON with a single field: "service"
# No preamble, no markdown, no explanation — just the JSON object.

ROUTER_SYSTEM_PROMPT = """
You are a routing agent for a medical center booking assistant.

Your ONLY job is to classify the user's message into one of two services:
  - "rag_service"      → user is asking a question (about services, doctors, prices, location, hours, FAQs, or any general information)
  - "booking_service"  → user wants to book, cancel, reschedule, or manage an appointment

Respond with ONLY a valid JSON object in this exact format — no preamble, no markdown, no explanation:
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
""".strip()


def route_request(
    tenant_id: str,
    conversation_id: str,
    user_message: str,
) -> str:
    """
    Classify the user message and return the target service name.

    Args:
        tenant_id:       The medical center tenant identifier.
        conversation_id: The current session conversation ID.
        user_message:    The latest message from the user.

    Returns:
        "rag_service" or "booking_service"
    """
    logger.info(
        f"[RouterAgent] tenant={tenant_id} | conv={conversation_id} | "
        f"message='{user_message[:80]}'"
    )

    # Build the prompt — just the user message, system prompt does the heavy lifting
    prompt = f"User message: {user_message}"

    raw_response = generate_response(
        prompt=prompt,
        system_instruction=ROUTER_SYSTEM_PROMPT,
        temperature=0.0,          # deterministic — routing must be consistent
        max_output_tokens=128,     # we only need a tiny JSON object
    )

    logger.debug(f"[RouterAgent] Raw LLM response: {raw_response!r}")

    # ── Parse the JSON response ────────────────────────────────────────────────
    try:
        cleaned = raw_response.strip().strip("```json").strip("```").strip()
        parsed = json.loads(cleaned)
        service = parsed.get("service", "").strip()
    except (json.JSONDecodeError, AttributeError) as e:
        logger.error(
            f"[RouterAgent] Failed to parse LLM response: {raw_response!r} | Error: {e}"
        )
        # Safe fallback — if we cannot parse, send to RAG (read-only, no side effects)
        service = "rag_service"

    # ── Validate the returned service name ────────────────────────────────────
    valid_services = {"rag_service", "booking_service"}
    if service not in valid_services:
        logger.warning(
            f"[RouterAgent] Unexpected service value '{service}' — defaulting to rag_service"
        )
        service = "rag_service"

    # ── Print to terminal (as requested) ──────────────────────────────────────
    print(f"\n[RouterAgent] → Routed to: {service}\n")
    logger.info(f"[RouterAgent] Routing decision: {service}")

    return service