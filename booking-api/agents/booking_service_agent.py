"""
booking_service_agent.py
─────────────────────────
Main booking agent.

Responsibilities:
  1. Load (or create) the session context window from Redis.
  2. Call the LLM with the context window snapshot → LLM returns ONLY the
     sub-agent name to call (no user reply — that is the sub-agent's job).
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

# ── System prompt ───────────────────────────────────────────────────────────────
# The LLM receives the context window snapshot.
# It returns ONLY a JSON object with ONE field: "sub_agent"
# The sub-agent itself is responsible for replying to the user.

BOOKING_AGENT_SYSTEM_PROMPT = """
You are the orchestrator agent for a medical center booking system.

You will receive the full booking context window as a JSON object.
Your ONLY job is to decide which sub-agent to invoke next based on the
active workflow state and the agent_call_rules.

Sub-agents:
  - services_lookup_agent    → look up available services/doctors       (STEP 1)
  - slots_lookup_agent       → look up available time slots             (STEP 2)
  - details_collection_agent → collect patient name + WhatsApp number  (STEP 3)
  - confirm_commit_agent     → commit booking to DB + send WhatsApp    (STEP 4)
  - booking_cancel_agent     → cancel an existing booking
  - new_workflow_agent       → spawn a new workflow for another booking

Decision rules (apply in strict order):
  1. If active_workflow.service.id is null                        → services_lookup_agent
  2. If service.id filled AND slot.id is null                    → slots_lookup_agent
  3. If slot.id filled AND patient details incomplete            → details_collection_agent
  4. If service + slot + patient all filled                      → confirm_commit_agent
  5. If user intent is cancellation                              → booking_cancel_agent
  6. If active workflow is completed AND user wants new booking  → new_workflow_agent

Respond ONLY with this exact JSON — no preamble, no markdown, no explanation:
{"sub_agent": "<agent_name>"}
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

        # ── Step 3: Build the LLM prompt from context snapshot ────────────────
        active_wf = get_active_workflow(context)
        prompt = _build_routing_prompt(context, active_wf)

        # ── Step 4: Call LLM — get sub-agent decision only ────────────────────
        raw_response = generate_response(
            prompt=prompt,
            system_instruction=BOOKING_AGENT_SYSTEM_PROMPT,
            temperature=0.0,
            max_output_tokens=64,   # only needs {"sub_agent": "..."}
        )

        logger.debug(f"[BookingAgent] LLM routing response: {raw_response!r}")

        # ── Step 5: Parse sub-agent decision ──────────────────────────────────
        sub_agent = _parse_sub_agent_decision(raw_response)

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


# ── Routing prompt builder ──────────────────────────────────────────────────────

def _build_routing_prompt(context: dict, active_wf: dict | None) -> str:
    """
    Build a focused context snapshot for the routing LLM call.
    Only includes fields needed for the routing decision — not full history.
    Full conversation history is kept in Redis but not sent here to save tokens.
    """
    snapshot = {
        "tenant_id":            context.get("tenant_id"),
        "conversation_id":      context.get("conversation_id"),
        "current_user_message": context.get("current_user_message"),
        "last_called_agent":    context.get("last_called_agent"),
        "last_agent_result":    context.get("last_agent_result"),
        "active_workflow_id":   context.get("active_workflow_id"),
        "active_workflow":      active_wf,
        "available_agents":     context.get("available_agents"),
        "agent_call_rules":     context.get("agent_call_rules"),
        # Last 6 turns so LLM understands conversational context
        "recent_conversation":  context.get("conversation", [])[-6:],
    }
    return f"Context window:\n{json.dumps(snapshot, indent=2, ensure_ascii=False)}"


# ── Sub-agent decision parser ───────────────────────────────────────────────────

def _parse_sub_agent_decision(raw: str) -> str:
    """
    Parse {"sub_agent": "..."} from the LLM response.
    Falls back to services_lookup_agent on any parse error.
    """
    try:
        cleaned = raw.strip().strip("```json").strip("```").strip()
        parsed = json.loads(cleaned)
        sub_agent = parsed.get("sub_agent", "").strip()
    except (json.JSONDecodeError, AttributeError) as e:
        logger.error(f"[BookingAgent] Parse error on routing response: {raw!r} | {e}")
        return "services_lookup_agent"

    if sub_agent not in VALID_SUB_AGENTS:
        logger.warning(
            f"[BookingAgent] Unknown sub-agent '{sub_agent}' — defaulting to services_lookup_agent"
        )
        return "services_lookup_agent"

    return sub_agent


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
        # TODO: from sub_agents.services_lookup_agent import run
        # return await run(context)
        reply = "I can help you with booking. Let me check what services are available."
        return reply, context

    if sub_agent == "slots_lookup_agent":
        # TODO: from sub_agents.slots_lookup_agent import run
        # return await run(context)
        reply = "Great choice! Let me look up the available time slots for you."
        return reply, context

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