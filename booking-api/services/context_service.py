"""
context_service.py
──────────────────
Owns the full context window schema, all mutations, and persistence.

Rule: No agent file should ever mutate the context dict directly.
      All changes go through functions in this module.
"""

import json
import logging
from datetime import datetime, timezone
from typing import Optional

from services.redis_service import get_context, save_context

logger = logging.getLogger("booking_api.context_service")

# ── Available agents registry ──────────────────────────────────────────────────
AVAILABLE_AGENTS = {
    "agent_1": "services_lookup_agent",
    "agent_2": "slots_lookup_agent",
    "agent_3": "details_collection_agent",
    "agent_4": "booking_cancel_agent",
    "agent_5": "new_workflow_agent",
    "agent_6": "confirm_commit_agent",
}

# ── Agent call rules ───────────────────────────────────────────────────────────
AGENT_CALL_RULES = [
    "R-01 [CRITICAL] service.id must be filled before any other step. "
    "If active_workflow.service.id is null → call agent_1 (services_lookup_agent), no exceptions.",

    "R-02 [CRITICAL] slot.id must be filled before collecting patient details. "
    "If service.id filled but slot.id null → call agent_2 (slots_lookup_agent).",

    "R-03 [CRITICAL] Call agent_6 (confirm_commit_agent) only when service.id, slot.id, "
    "patient.name, and patient.whatsapp_number are all non-null.",

    "R-04 [HIGH] When active workflow is completed and user wants another booking, "
    "call agent_5 (new_workflow_agent) first. Never call agent_1 directly for a second booking.",

    "R-05 [HIGH] Always operate on active_workflow_id only. Completed workflows are read-only.",

    "R-06 [HIGH] Cancellation requires a booking_reference. "
    "If the user has not provided one, ask for it before calling agent_4 (booking_cancel_agent).",

    "R-07 [MEDIUM] When agent_5 spawns a new workflow, check completed workflows in this session "
    "for existing patient details and pre-populate after user confirmation.",

    "R-08 [MEDIUM] On sub-agent failure: retry the same agent up to 2 times. "
    "After 2 failures set workflow.error fields and surface the error to the user.",

    "R-09 [MEDIUM] Never call two sub-agents in the same turn. One sub-agent call per turn only.",

    "R-10 [LOW] After agent_6 succeeds, reply with booking_reference, service name, doctor name, "
    "date, time, and confirm that a WhatsApp notification has been sent.",

    "R-11 [LOW] Never re-ask for information already present in filled_fields.",
]


# ── Blank workflow factory ─────────────────────────────────────────────────────

def _blank_workflow(workflow_id: str) -> dict:
    return {
        "workflow_id":       workflow_id,
        "status":            "in_progress",   # in_progress | completed | cancelled | failed
        "step":              1,               # 1 → 2 → 3 → 4(commit)
        "filled_fields":     [],
        "service": {
            "id":          None,
            "name":        None,
            "doctor_name": None,
        },
        "slot": {
            "id":               None,
            "date":             None,
            "time":             None,
            "duration_minutes": None,
        },
        "patient": {
            "name":             None,
            "whatsapp_number":  None,   # E.164: +94XXXXXXXXX
            "notes":            None,
        },
        "booking_reference": None,
        "confirmed_at":      None,
        "whatsapp_sent":     False,
        "error": {
            "step":        None,
            "agent":       None,
            "message":     None,
            "retry_count": 0,
        },
    }


# ── Build fresh context window (new session) ───────────────────────────────────

def build_fresh_context(
    tenant_id: str,
    conversation_id: str,
    first_user_message: str,
) -> dict:
    """
    Create a brand-new context window for a session that has no Redis entry.
    The first user message is appended to conversation[] here.
    """
    now = _now()
    return {
        "tenant_id":          tenant_id,
        "conversation_id":    conversation_id,
        "session_started_at": now,
        "last_updated_at":    now,

        "conversation": [
            {"role": "user", "content": first_user_message, "timestamp": now}
        ],
        "current_user_message": first_user_message,

        "active_workflow_id": "wf_001",
        "workflow_counter":   1,
        "workflows":          [_blank_workflow("wf_001")],

        "last_called_agent":  None,
        "last_agent_result":  None,   # in_progress | success | failed | awaiting_user
        "agent_call_count":   0,

        "available_agents":   AVAILABLE_AGENTS,
        "agent_call_rules":   AGENT_CALL_RULES,
    }


# ── Load or create ─────────────────────────────────────────────────────────────

async def load_or_create_context(
    tenant_id: str,
    conversation_id: str,
    user_message: str,
) -> dict:
    """
    Load existing context from Redis, or build a fresh one.
    In both cases the incoming user message is appended to conversation[]
    and current_user_message is updated.

    Does NOT save to Redis — caller persists after all mutations are done.
    """
    existing = await get_context(conversation_id)

    if existing:
        logger.info(f"[ContextService] Existing context loaded | conv={conversation_id}")
        # Append the new user turn to history
        existing = append_user_turn(existing, user_message)
        return existing

    logger.info(f"[ContextService] No existing context — building fresh | conv={conversation_id}")
    return build_fresh_context(tenant_id, conversation_id, user_message)


# ── Conversation turn helpers ──────────────────────────────────────────────────

def append_user_turn(context: dict, message: str) -> dict:
    """Append a user message to conversation history and refresh current_user_message."""
    context["conversation"].append(
        {"role": "user", "content": message, "timestamp": _now()}
    )
    context["current_user_message"] = message
    context["last_updated_at"] = _now()
    return context


def append_assistant_turn(context: dict, message: str) -> dict:
    """
    Append the AI reply to conversation history.
    Called by booking_service_agent AFTER the sub-agent returns its reply.
    """
    context["conversation"].append(
        {"role": "assistant", "content": message, "timestamp": _now()}
    )
    context["last_updated_at"] = _now()
    return context


# ── Agent state helpers ────────────────────────────────────────────────────────

def update_agent_state(
    context: dict,
    agent_name: str,
    result: str,  # "in_progress" | "success" | "failed" | "awaiting_user"
) -> dict:
    """
    Record which agent was called and what its current result status is.
    Called twice per dispatch cycle:
      - Before dispatch: result = "in_progress"
      - After dispatch:  result = "success" | "failed"
    """
    context["last_called_agent"] = agent_name
    context["last_agent_result"] = result
    if result not in ("in_progress",):
        # Only increment the counter when the call is complete
        context["agent_call_count"] = context.get("agent_call_count", 0) + 1
    context["last_updated_at"] = _now()
    return context


# ── Workflow helpers ───────────────────────────────────────────────────────────

def get_active_workflow(context: dict) -> Optional[dict]:
    """Return the active workflow object, or None."""
    active_id = context.get("active_workflow_id")
    if not active_id:
        return None
    for wf in context.get("workflows", []):
        if wf["workflow_id"] == active_id:
            return wf
    return None


def spawn_new_workflow(context: dict) -> dict:
    """
    Create a new blank workflow, append it to workflows[],
    increment workflow_counter, and set active_workflow_id.
    Called by new_workflow_agent.
    """
    counter = context.get("workflow_counter", 1) + 1
    new_id = f"wf_{counter:03d}"
    context["workflow_counter"] = counter
    context["active_workflow_id"] = new_id
    context["workflows"].append(_blank_workflow(new_id))
    context["last_updated_at"] = _now()
    logger.info(f"[ContextService] New workflow spawned: {new_id}")
    return context


# ── Workflow field update helpers (used by sub-agents) ────────────────────────

def update_workflow_service(context: dict, service: dict) -> dict:
    """
    Called by services_lookup_agent after user selects a service.
    Updates service fields and advances the workflow step to 2.
    """
    wf = get_active_workflow(context)
    if wf is None:
        return context
    wf["service"].update(service)
    if "service" not in wf["filled_fields"]:
        wf["filled_fields"].append("service")
    wf["step"] = 2
    context["last_updated_at"] = _now()
    return context


def update_workflow_slot(context: dict, slot: dict) -> dict:
    """
    Called by slots_lookup_agent after user selects a slot.
    Updates slot fields and advances the workflow step to 3.
    """
    wf = get_active_workflow(context)
    if wf is None:
        return context
    wf["slot"].update(slot)
    if "slot" not in wf["filled_fields"]:
        wf["filled_fields"].append("slot")
    wf["step"] = 3
    context["last_updated_at"] = _now()
    return context


def update_workflow_patient(context: dict, patient: dict) -> dict:
    """
    Called by details_collection_agent after collecting patient details.
    Updates patient fields and advances the workflow step to 4.
    """
    wf = get_active_workflow(context)
    if wf is None:
        return context
    wf["patient"].update(patient)
    if "patient" not in wf["filled_fields"]:
        wf["filled_fields"].append("patient")
    wf["step"] = 4
    context["last_updated_at"] = _now()
    return context


def complete_workflow(context: dict, booking_reference: str) -> dict:
    """
    Called by confirm_commit_agent after successful DB write.
    Marks the workflow as completed.
    """
    wf = get_active_workflow(context)
    if wf is None:
        return context
    wf["status"] = "completed"
    wf["step"] = 4
    wf["booking_reference"] = booking_reference
    wf["confirmed_at"] = _now()
    wf["whatsapp_sent"] = True
    if "booking_reference" not in wf["filled_fields"]:
        wf["filled_fields"].append("booking_reference")
    context["last_updated_at"] = _now()
    return context


def set_workflow_error(context: dict, step: int, agent: str, message: str) -> dict:
    """Mark the active workflow with an error state."""
    wf = get_active_workflow(context)
    if wf is None:
        return context
    wf["error"]["step"] = step
    wf["error"]["agent"] = agent
    wf["error"]["message"] = message
    wf["error"]["retry_count"] = wf["error"].get("retry_count", 0) + 1
    if wf["error"]["retry_count"] >= 2:
        wf["status"] = "failed"
    context["last_updated_at"] = _now()
    return context


# ── Persist ────────────────────────────────────────────────────────────────────

async def persist_context(conversation_id: str, context: dict) -> None:
    """
    Stamp last_updated_at and write the full context window to Redis.
    Always call this after all mutations for a turn are complete.
    """
    context["last_updated_at"] = _now()
    await save_context(conversation_id, context)
    logger.debug(f"[ContextService] Persisted context | conv={conversation_id}")


# ── Terminal debug printer ─────────────────────────────────────────────────────

def print_context_window(context: dict) -> None:
    """
    Pretty-print the full context window to the terminal after each turn.
    Shows the complete state so you can verify every field is correct.
    """
    # Build a readable snapshot — exclude the static rules/agents to reduce noise
    snapshot = {
        "tenant_id":            context.get("tenant_id"),
        "conversation_id":      context.get("conversation_id"),
        "session_started_at":   context.get("session_started_at"),
        "last_updated_at":      context.get("last_updated_at"),
        "last_called_agent":    context.get("last_called_agent"),
        "last_agent_result":    context.get("last_agent_result"),
        "agent_call_count":     context.get("agent_call_count"),
        "active_workflow_id":   context.get("active_workflow_id"),
        "workflow_counter":     context.get("workflow_counter"),
        "workflows":            context.get("workflows"),
        "current_user_message": context.get("current_user_message"),
        "conversation":         context.get("conversation"),
    }

    border = "=" * 70
    print(f"\n{border}")
    print("  CONTEXT WINDOW STATE (post sub-agent response)")
    print(border)
    print(json.dumps(snapshot, indent=2, ensure_ascii=False, default=str))
    print(f"{border}\n")


# ── Internal ───────────────────────────────────────────────────────────────────

def _now() -> str:
    return datetime.now(timezone.utc).isoformat()