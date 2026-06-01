"""
booking_service_agent.py
─────────────────────────
Main booking agent.

Responsibilities:
  1. Load (or create) the session context window from Redis.
  2. Deterministically decide which sub-agent to call based on
     active_workflow.step and filled fields — NO LLM needed for routing.
     Exception: a lightweight LLM call detects cancellation intent.
  3. Print the chosen sub-agent to the terminal.
  4. Pass the full context window to the chosen sub-agent.
  5. Sub-agent runs its own LLM call + tools, updates workflow fields,
     and returns (reply_to_user, updated_context).
  6. Append user message + AI reply to conversation history.
  7. Persist the fully updated context window to Redis.
  8. Print the final context window state to the terminal.
  9. Return the AI reply to the chat router.
"""

import json
import logging

from services.context_service import (
    append_assistant_turn,
    append_user_turn,
    get_active_workflow,
    load_or_create_context,
    persist_context,
    update_agent_state,
    print_context_window,
)
from services.redis_service import acquire_lock, release_lock
from services.llm_service import generate_response

# ── Sub-agent imports (add each here as they are built) ───────────────────────
from sub_agents.Service_lookup_agent.service_lookup_agent import (
    run as run_service_lookup,
)
from sub_agents.slot_lookup_agent.slot_lookup_agent import (
    run as run_slot_lookup,
)

logger = logging.getLogger("booking_api.booking_service_agent")

# ── Valid sub-agents ────────────────────────────────────────────────────────────
VALID_SUB_AGENTS = {
    "services_lookup_agent",
    "slots_lookup_agent",
    "details_collection_agent",
    "booking_cancel_agent",
    "new_workflow_agent",
    "confirm_commit_agent",
}

# ── Cancellation detection prompt (LLM used ONLY for this) ─────────────────────
_CANCEL_DETECTION_PROMPT = """
You are a cancellation intent detector.
Read the user's message and reply ONLY with a JSON object:
  {"cancel": true}   — if the user clearly wants to cancel their appointment
  {"cancel": false}  — for everything else (dates, slot picks, confirmations, questions)

No preamble. No markdown. No explanation.

Examples:
  "cancel my booking"          → {"cancel": true}
  "I want to cancel"           → {"cancel": true}
  "tomorrow"                   → {"cancel": false}
  "the first one"              → {"cancel": false}
  "maybe next week"            → {"cancel": false}
  "yes"                        → {"cancel": false}
""".strip()




# ── Entry point ─────────────────────────────────────────────────────────────────

async def handle_booking_request(
    tenant_id: str,
    conversation_id: str,
    user_message: str,
) -> str:
    """
    Entry point called by the chat router for all booking-intent messages.
    Returns the final AI reply string.
    """
    logger.info(
        f"[BookingAgent] Request received | tenant={tenant_id} | conv={conversation_id}"
    )

    # ── Step 1: Acquire processing lock ───────────────────────────────────────
    lock_acquired = await acquire_lock(conversation_id)
    if not lock_acquired:
        logger.warning(f"[BookingAgent] Lock busy — conv={conversation_id}")
        return "I'm still processing your last message. Please wait a moment and try again."

    try:
        # ── Step 2: Load or create context window ─────────────────────────────
        # Note: load_or_create_context appends the user turn to conversation[]
        # and sets current_user_message — so we don't append again here.
        context = await load_or_create_context(tenant_id, conversation_id, user_message)

        # ── Step 3: Deterministic routing based on context state ─────────────
        # Read the filled fields and step from Redis context — NO LLM needed.
        # LLM is only used below to detect cancellation intent.
        active_wf = get_active_workflow(context)
        sub_agent = _determine_sub_agent(context, active_wf)

        # ── Step 6: Print sub-agent decision to terminal ──────────────────────
        print(f"\n{'='*60}")
        print(f"[BookingAgent] Sub-agent selected → {sub_agent}")
        print(f"{'='*60}\n")
        logger.info(f"[BookingAgent] Routing to: {sub_agent}")

        # ── Step 7: Update agent state in context (pre-dispatch) ──────────────
        context = update_agent_state(context, sub_agent, "in_progress")

        # ── Step 8: Dispatch — sub-agent receives full context, returns
        #            (reply_to_user, updated_context) ─────────────────────────
        reply_to_user, context = await _dispatch_sub_agent(
            sub_agent=sub_agent,
            context=context,
        )

        # ── Step 9: Mark agent call as complete ───────────────────────────────
        context = update_agent_state(context, sub_agent, "success")

        # ── Step 10: Append AI reply to conversation history ──────────────────
        # (User turn was already appended in load_or_create_context)
        context = append_assistant_turn(context, reply_to_user)

        # ── Step 11: Persist fully updated context to Redis ───────────────────
        await persist_context(conversation_id, context)

        # ── Step 12: Print full context window to terminal ────────────────────
        print_context_window(context)

        return reply_to_user

    except Exception as e:
        logger.error(
            f"[BookingAgent] Unhandled error | conv={conversation_id} | {e}",
            exc_info=True,
        )
        return "Sorry, something went wrong with your booking. Please try again."

    finally:
        # Always release lock regardless of success or failure
        await release_lock(conversation_id)


# ── Deterministic sub-agent router ────────────────────────────────────────────

def _determine_sub_agent(context: dict, active_wf: dict | None) -> str:
    """
    Decide which sub-agent to call based entirely on the context window state
    read from Redis — NO LLM involved in routing.

    Priority order:
      1. No active workflow → services_lookup_agent
      2. Completed workflow + user wants another → new_workflow_agent (LLM check)
      3. Cancellation intent detected → booking_cancel_agent (LLM check)
      4. step 1 / service not filled → services_lookup_agent
      5. step 2 / slot not confirmed → slots_lookup_agent
      6. step 3 / patient details missing → details_collection_agent
      7. step 4 / all fields filled → confirm_commit_agent
    """
    user_message = context.get("current_user_message", "")

    # ── Guard: no active workflow ─────────────────────────────────────────────
    if active_wf is None:
        logger.warning("[BookingAgent] No active workflow found — defaulting to services_lookup_agent")
        return "services_lookup_agent"

    workflow_status = active_wf.get("status", "in_progress")
    step            = active_wf.get("step", 1)
    service_id      = active_wf.get("service", {}).get("id")
    slot_id         = active_wf.get("slot", {}).get("id")
    patient         = active_wf.get("patient", {})

    # ── Completed workflow: check if user wants a new booking ─────────────────
    if workflow_status == "completed":
        logger.info("[BookingAgent] Workflow completed — routing to new_workflow_agent")
        return "new_workflow_agent"

    # ── Cancellation intent check (only LLM call in this function) ────────────
    if _is_cancellation_intent(user_message):
        logger.info("[BookingAgent] Cancellation intent detected — routing to booking_cancel_agent")
        return "booking_cancel_agent"

    # ── STEP 1: Service not yet selected ─────────────────────────────────────
    if step <= 1 or not service_id:
        logger.info(
            f"[BookingAgent] step={step} | service_id={service_id!r} "
            "→ routing to services_lookup_agent"
        )
        return "services_lookup_agent"

    # ── STEP 2: Service confirmed, slot not yet confirmed ─────────────────────
    if step <= 2 or not slot_id:
        logger.info(
            f"[BookingAgent] step={step} | service_id={service_id!r} | slot_id={slot_id!r} "
            "→ routing to slots_lookup_agent"
        )
        return "slots_lookup_agent"

    # ── STEP 3: Slot confirmed, patient details missing ───────────────────────
    patient_name     = patient.get("name")
    patient_whatsapp = patient.get("whatsapp_number")
    if step <= 3 or not (patient_name and patient_whatsapp):
        logger.info(
            f"[BookingAgent] step={step} | slot confirmed | patient incomplete "
            "→ routing to details_collection_agent"
        )
        return "details_collection_agent"

    # ── STEP 4: Everything filled → commit ────────────────────────────────────
    logger.info("[BookingAgent] All fields filled → routing to confirm_commit_agent")
    return "confirm_commit_agent"


def _is_cancellation_intent(user_message: str) -> bool:
    """
    Lightweight LLM call to detect cancellation intent only.
    Returns True if the user clearly wants to cancel their booking.
    """
    if not user_message:
        return False

    # Fast keyword pre-check to avoid LLM call in most cases
    lower = user_message.lower()
    cancel_keywords = {"cancel", "cancellation", "don't want", "dont want", "stop booking"}
    has_keyword = any(kw in lower for kw in cancel_keywords)
    if not has_keyword:
        return False

    # Only call LLM if a cancellation keyword is present
    try:
        raw = generate_response(
            prompt=f"User message: {user_message}",
            system_instruction=_CANCEL_DETECTION_PROMPT,
            temperature=0.0,
            max_output_tokens=32,
        )
        cleaned = raw.strip().strip("```json").strip("```").strip()
        parsed  = json.loads(cleaned)
        return bool(parsed.get("cancel", False))
    except Exception as e:
        logger.error(f"[BookingAgent] Cancellation detection error: {e}")
        return False


# ── Sub-agent dispatcher ────────────────────────────────────────────────────────

async def _dispatch_sub_agent(
    sub_agent: str,
    context: dict,
) -> tuple[str, dict]:
    """
    Dispatch to the correct sub-agent.

    Each sub-agent:
      - Receives the full context window
      - Runs its own LLM call and/or tool calls
      - Updates workflow fields inside context
      - Returns (reply_to_user: str, updated_context: dict)

    All sub-agents are stubs returning placeholder replies for now.
    Replace each stub block with the real import + call when ready.
    """
    logger.info(f"[BookingAgent] Dispatching to → {sub_agent}")

    if sub_agent == "services_lookup_agent":
        return await run_service_lookup(context)

    if sub_agent == "slots_lookup_agent":
        return await run_slot_lookup(context)

    if sub_agent == "details_collection_agent":
        # TODO: from sub_agents.details_collection_agent import run
        # return await run(context)
        reply = "Almost there! Could I have your full name and WhatsApp number to confirm the booking?"
        return reply, context

    if sub_agent == "booking_cancel_agent":
        # TODO: from sub_agents.booking_cancel_agent import run
        # return await run(context)
        reply = "I can help you cancel that booking. Could you share your booking reference number?"
        return reply, context

    if sub_agent == "new_workflow_agent":
        # TODO: from sub_agents.new_workflow_agent import run
        # return await run(context)
        reply = "Sure! Let's get your next appointment sorted. What service do you need?"
        return reply, context

    if sub_agent == "confirm_commit_agent":
        # TODO: from sub_agents.confirm_commit_agent import run
        # return await run(context)
        reply = "Your booking has been confirmed! You will receive a WhatsApp notification shortly."
        return reply, context

    # Fallback — should never reach here due to validation above
    logger.error(f"[BookingAgent] No dispatch handler for '{sub_agent}'")
    return "I encountered an issue processing your request. Please try again.", context