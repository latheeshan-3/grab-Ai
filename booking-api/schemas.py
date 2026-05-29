from pydantic import BaseModel, Field
from typing import Optional


class ChatRequest(BaseModel):
    """Request schema for the chat endpoint."""
    tenant_id: str = Field(..., min_length=1, description="Medical center tenant identifier")
    conversation_id: Optional[str] = Field(
        None,
        description="Conversation session ID. Auto-generated if not provided."
    )
    message: str = Field(..., min_length=1, description="User message text")


class ChatResponse(BaseModel):
    """Response schema for the chat endpoint."""
    tenant_id: str = Field(..., description="Medical center tenant identifier")
    conversation_id: str = Field(..., description="Conversation session ID")
    reply: str = Field(..., description="AI assistant reply")
    timestamp: str = Field(..., description="ISO 8601 timestamp of the response")
