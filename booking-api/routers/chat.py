import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException

from schemas import ChatRequest, ChatResponse

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

    # Validate tenant_id
    tenant_id = request.tenant_id.strip()
    if not tenant_id:
        raise HTTPException(status_code=400, detail="tenant_id cannot be empty")

    # Generate conversation_id if not provided (new session)
    conversation_id = request.conversation_id or str(uuid.uuid4())

    user_message = request.message.strip()
    if not user_message:
        raise HTTPException(status_code=400, detail="message cannot be empty")

    # ---------------------------------------------------------------
    # STUB: Replace this with actual RAG + Agentic booking logic
    # The real implementation will:
    #   1. Load tenant-specific RAG context from Supabase
    #   2. Feed conversation history + user message to the AI agent
    #   3. Execute booking actions if the agent decides to
    #   4. Return the agent's response
    # ---------------------------------------------------------------

    reply = (
        f"Hello! I'm your medical booking assistant. "
        f"How can I help you today? "
        f"You can ask me about available appointments, doctors, or services."
    )

    timestamp = datetime.now(timezone.utc).isoformat()

    return ChatResponse(
        tenant_id=tenant_id,
        conversation_id=conversation_id,
        reply=reply,
        timestamp=timestamp,
    )
