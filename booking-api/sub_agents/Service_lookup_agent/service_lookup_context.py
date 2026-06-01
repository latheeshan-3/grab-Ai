"""
service_lookup_context.py
──────────────────────────
Builds the focused context window that is passed to the
services_lookup_agent LLM call.

This is NOT the main booking context window (that lives in Redis).
This is a lean, read-only snapshot assembled just for this agent's
single LLM call — it contains only what the LLM needs to decide:

  1. What did the user say?
  2. What services exist in the DB for this tenant?
  3. What is the current workflow state?
  4. What are this agent's specific rules?

The LLM reads this and returns a structured JSON decision.
"""

import json
import logging

logger = logging.getLogger("booking_api.service_lookup_context")

# ── Agent-specific rules ───────────────────────────────────────────────────────
# These are injected into the agent's own context window (separate from the
# global booking agent_call_rules in the main context window).

SERVICE_AGENT_RULES = [
    "RULE-1: Read the user message carefully. Check if the user has mentioned "
    "a service name, doctor name, or specialty that matches any entry in available_services.",

    "RULE-2: Matching is fuzzy — 'heart doctor' matches Cardiology, "
    "'skin' matches Dermatology, 'general' matches General Consultation, etc.",

    "RULE-3: If a clear match is found, set decision = 'service_identified' "
    "and populate matched_service with the correct id, service_name, and doctor_name.",

    "RULE-4: If NO match is found, or the user is asking generally (e.g. 'book an appointment', "
    "'what services do you have'), set decision = 'ask_user' and leave matched_service null. "
    "Compose a reply listing all available services and asking the user to choose.",

    "RULE-5: If available_services is empty, set decision = 'no_services_available' "
    "and compose an apologetic reply.",

    "RULE-6: Never guess or invent a service that is not in available_services.",

    "RULE-7: reply_to_user must be friendly, concise, and in the same language as the user message.",
]


# ── Context window builder ─────────────────────────────────────────────────────

def build_service_agent_context(
    main_context: dict,
    available_services: list[dict],
) -> dict:
    """
    Build the focused context window for the services_lookup_agent LLM call.

    Args:
        main_context:       The full booking context window from Redis.
        available_services: Live DB rows fetched by service_lookup_agent_tools.

    Returns:
        A dict that is JSON-serialised and sent as the LLM prompt.
    """
    active_wf = _get_active_workflow(main_context)

    agent_context = {
        # ── Identity ──────────────────────────────────────────────────────────
        "agent":            "services_lookup_agent",
        "tenant_id":        main_context.get("tenant_id"),
        "conversation_id":  main_context.get("conversation_id"),

        # ── What the user said ────────────────────────────────────────────────
        "current_user_message": main_context.get("current_user_message"),

        # ── Recent conversation (last 6 turns for context) ────────────────────
        "recent_conversation": main_context.get("conversation", [])[-6:],

        # ── Live services from DB ─────────────────────────────────────────────
        "available_services": available_services,

        # ── Current workflow state (read-only for this agent) ─────────────────
        "current_workflow": {
            "workflow_id":    active_wf.get("workflow_id") if active_wf else None,
            "step":           active_wf.get("step") if active_wf else None,
            "service_filled": active_wf.get("service", {}).get("id") is not None
                              if active_wf else False,
        },

        # ── Rules this agent must follow ──────────────────────────────────────
        "agent_rules": SERVICE_AGENT_RULES,
    }

    logger.debug(
        f"[ServiceLookupContext] Context built | "
        f"tenant={main_context.get('tenant_id')} | "
        f"services_count={len(available_services)}"
    )

    return agent_context


def build_service_agent_prompt(agent_context: dict) -> str:
    """Serialise the agent context into the prompt string sent to the LLM."""
    return (
        f"Services lookup agent context:\n"
        f"{json.dumps(agent_context, indent=2, ensure_ascii=False, default=str)}"
    )


# ── Internal ───────────────────────────────────────────────────────────────────

def _get_active_workflow(context: dict) -> dict | None:
    active_id = context.get("active_workflow_id")
    if not active_id:
        return None
    for wf in context.get("workflows", []):
        if wf["workflow_id"] == active_id:
            return wf
    return None