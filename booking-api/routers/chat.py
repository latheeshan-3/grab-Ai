import uuid
import logging
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException

from schemas import ChatRequest, ChatResponse
from agents.router_agent import route_request
from agents.booking_service_agent import handle_booking_request

logger = logging.getLogger("booking_api.chat")

router = APIRouter(tags=["Chat"])


@router.post("/chat", response_model=ChatResponse)
async def chat(request: ChatRequest):
    """
    Multi-tenant chat endpoint for medical center booking assistant.

    Accepts a tenant_id, optional conversation_id, and user message.
    Returns the AI assistant's reply with conversation metadata.

    - If conversation_id is not provided, a new one is generated (new session).
    - The tenant_id scopes the conversation to a specific medical center.
    """

    # ── Validate inputs ───────────────────────────────────────────────────────
    tenant_id = request.tenant_id.strip()
    if not tenant_id:
        raise HTTPException(status_code=400, detail="tenant_id cannot be empty")

    conversation_id = request.conversation_id or str(uuid.uuid4())

    user_message = request.message.strip()
    if not user_message:
        raise HTTPException(status_code=400, detail="message cannot be empty")

    logger.info(
        f"[Chat] Incoming request | tenant={tenant_id} | "
        f"conv={conversation_id} | message='{user_message[:80]}'"
    )

    # ── Step 1: Route via RouterAgent ─────────────────────────────────────────
    target_service = await route_request(
        tenant_id=tenant_id,
        conversation_id=conversation_id,
        user_message=user_message,
    )

    # ── Step 2: Dispatch to the identified service ────────────────────────────
    if target_service == "booking_service":
        reply = await handle_booking_request(
            tenant_id=tenant_id,
            conversation_id=conversation_id,
            user_message=user_message,
        )
    else:
        # TODO: call rag_service
        reply = (
            "I can answer your questions about our services and doctors. "
            "(RAG service — coming soon.)"
        )

    timestamp = datetime.now(timezone.utc).isoformat()

    return ChatResponse(
        tenant_id=tenant_id,
        conversation_id=conversation_id,
        reply=reply,
        timestamp=timestamp,
    )