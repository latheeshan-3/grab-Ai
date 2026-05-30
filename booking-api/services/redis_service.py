"""
redis_service.py
─────────────────
Async Redis client for the booking API.

Responsibilities:
  - Single shared async client (lazy init)
  - get / save / delete context window by conversation_id
  - Per-conversation processing lock (prevents concurrent writes)
  - TTL refresh on active sessions
"""

import json
import logging
import os
from typing import Optional

import redis.asyncio as aioredis
from dotenv import load_dotenv

load_dotenv()

logger = logging.getLogger("booking_api.redis_service")

# ── Config ─────────────────────────────────────────────────────────────────────
REDIS_URL      = os.getenv("REDIS_URL", "redis://redis:6379")
SESSION_TTL = int(os.getenv("REDIS_SESSION_TTL_SECONDS", 3600))  # 1 hour default
LOCK_TTL    = int(os.getenv("REDIS_LOCK_TTL_SECONDS", 15))       # 15s auto-release

# ── Singleton async client ─────────────────────────────────────────────────────
_redis_client: Optional[aioredis.Redis] = None


def get_redis() -> aioredis.Redis:
    """
    Return (or lazily create) the shared async Redis client.
    Uses decode_responses=True so all values come back as str, not bytes.
    """
    global _redis_client
    if _redis_client is None:
        _redis_client = aioredis.from_url(
            REDIS_URL,
            encoding="utf-8",
            decode_responses=True,
        )
        logger.info(f"[RedisService] Client initialised → {REDIS_URL}")
    return _redis_client


async def close_redis() -> None:
    """Close the Redis connection gracefully on app shutdown."""
    global _redis_client
    if _redis_client:
        await _redis_client.aclose()
        _redis_client = None
        logger.info("[RedisService] Connection closed.")


# ── Key schema ─────────────────────────────────────────────────────────────────

def _ctx_key(conversation_id: str) -> str:
    """Full context window for a session."""
    return f"booking:session:{conversation_id}"

def _lock_key(conversation_id: str) -> str:
    """Per-conversation processing lock."""
    return f"booking:lock:{conversation_id}"


# ── Context window CRUD ────────────────────────────────────────────────────────

async def get_context(conversation_id: str) -> Optional[dict]:
    """
    Load the context window JSON from Redis.
    Returns None if the key does not exist (new session or expired TTL).
    """
    client = get_redis()
    raw = await client.get(_ctx_key(conversation_id))
    if raw is None:
        logger.debug(f"[RedisService] No context found | conv={conversation_id}")
        return None
    try:
        ctx = json.loads(raw)
        logger.debug(f"[RedisService] Context loaded | conv={conversation_id}")
        return ctx
    except json.JSONDecodeError as e:
        logger.error(
            f"[RedisService] JSON parse error | conv={conversation_id} | {e}"
        )
        return None


async def save_context(conversation_id: str, context: dict) -> None:
    """
    Write the full context window to Redis, resetting the TTL.
    Entire object is replaced on every write (last-write-wins).
    Always serialise + SET atomically — never do partial field updates.
    """
    client = get_redis()
    try:
        raw = json.dumps(context, ensure_ascii=False, default=str)
        await client.set(_ctx_key(conversation_id), raw, ex=SESSION_TTL)
        logger.debug(
            f"[RedisService] Context saved | conv={conversation_id} | TTL={SESSION_TTL}s"
        )
    except Exception as e:
        logger.error(
            f"[RedisService] Failed to save context | conv={conversation_id} | {e}"
        )
        raise


async def delete_context(conversation_id: str) -> None:
    """
    Delete a session context window.
    Call when a session is explicitly closed or after a clean booking completion
    if you want to free memory immediately.
    """
    client = get_redis()
    await client.delete(_ctx_key(conversation_id))
    logger.info(f"[RedisService] Context deleted | conv={conversation_id}")


async def refresh_ttl(conversation_id: str) -> None:
    """
    Reset the TTL on an active session without modifying its value.
    Call this on every read so active conversations never expire mid-session.
    """
    client = get_redis()
    refreshed = await client.expire(_ctx_key(conversation_id), SESSION_TTL)
    if refreshed:
        logger.debug(f"[RedisService] TTL refreshed | conv={conversation_id}")
    else:
        logger.debug(f"[RedisService] TTL refresh skipped (key not found) | conv={conversation_id}")


# ── Processing lock ────────────────────────────────────────────────────────────

async def acquire_lock(conversation_id: str) -> bool:
    """
    Try to acquire an exclusive processing lock for this conversation.

    Uses Redis SET NX (set-if-not-exists) with a short TTL so the lock
    auto-releases if the process crashes before release_lock() is called.

    Returns True  → lock acquired, caller may proceed.
    Returns False → lock already held, concurrent request detected.
    """
    client = get_redis()
    acquired = await client.set(
        _lock_key(conversation_id),
        "1",
        nx=True,        # Only set if key does NOT already exist
        ex=LOCK_TTL,    # Auto-release after LOCK_TTL seconds
    )
    if acquired:
        logger.debug(f"[RedisService] Lock acquired | conv={conversation_id}")
    else:
        logger.warning(
            f"[RedisService] Lock BUSY — concurrent request? | conv={conversation_id}"
        )
    return bool(acquired)


async def release_lock(conversation_id: str) -> None:
    """
    Release the processing lock.
    Always called in the `finally` block of the booking agent.
    """
    client = get_redis()
    await client.delete(_lock_key(conversation_id))
    logger.debug(f"[RedisService] Lock released | conv={conversation_id}")