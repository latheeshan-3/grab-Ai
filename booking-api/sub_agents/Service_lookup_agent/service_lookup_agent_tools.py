"""
service_lookup_agent_tools.py
──────────────────────────────
Database tools for the services lookup sub-agent.

Queries the `available_services` table in Supabase and returns
structured data that the LLM can reason over.

All functions are pure async — they only READ from the DB.
They never touch the context window or Redis.
"""

import logging
from typing import Optional

from configs.supabase import get_supabase_client

logger = logging.getLogger("booking_api.service_lookup_tools")


# ── Data model returned to the agent ──────────────────────────────────────────
# Each service row is normalised into this flat dict before being sent to the LLM.
# We never expose raw Supabase rows to agent or LLM layers.

def _row_to_service(row: dict) -> dict:
    """Normalise a raw Supabase row into a clean service dict."""
    return {
        "id":                 str(row.get("id", "")),
        "clinic_center_name": row.get("clinic_center_name", ""),
        "service_name":       row.get("available_service", ""),
        "doctor_name":        row.get("doctor_name"),      # may be None
        "is_active":          row.get("is_active", True),
    }


# ── Tool 1: Fetch all active services for a tenant ────────────────────────────

async def fetch_active_services(tenant_id: str) -> list[dict]:
    """
    Fetch every active service row for the given tenant_id.

    Returns a list of normalised service dicts, or an empty list on error.

    Called by service_lookup_agent at the start of every invocation —
    before the LLM call — so the LLM always reasons on live DB data.
    """
    logger.info(f"[ServiceLookupTools] Fetching active services | tenant={tenant_id}")

    try:
        client = get_supabase_client()

        response = (
            client.table("available_services")
            .select("id, clinic_center_name, available_service, doctor_name, is_active")
            .eq("tenant_id", tenant_id)
            .eq("is_active", True)
            .order("available_service")
            .execute()
        )

        rows = response.data or []
        services = [_row_to_service(r) for r in rows]

        logger.info(
            f"[ServiceLookupTools] Found {len(services)} active service(s) | tenant={tenant_id}"
        )
        print(f"\n[ServiceLookupTools] DB returned {len(services)} service(s) for tenant {tenant_id}")

        return services

    except Exception as e:
        logger.error(
            f"[ServiceLookupTools] Failed to fetch services | tenant={tenant_id} | {e}",
            exc_info=True,
        )
        return []


# ── Tool 2: Fetch one service by its UUID ─────────────────────────────────────

async def fetch_service_by_id(service_id: str, tenant_id: str) -> Optional[dict]:
    """
    Fetch a single service row by its UUID.
    Also validates it belongs to the correct tenant (security guard).

    Returns a normalised service dict, or None if not found / wrong tenant.
    """
    logger.info(
        f"[ServiceLookupTools] Fetching service by id | service={service_id} | tenant={tenant_id}"
    )

    try:
        client = get_supabase_client()

        response = (
            client.table("available_services")
            .select("id, clinic_center_name, available_service, doctor_name, is_active")
            .eq("id", service_id)
            .eq("tenant_id", tenant_id)
            .eq("is_active", True)
            .single()                   # raises if 0 or >1 rows
            .execute()
        )

        if not response.data:
            logger.warning(
                f"[ServiceLookupTools] Service not found | service={service_id} | tenant={tenant_id}"
            )
            return None

        return _row_to_service(response.data)

    except Exception as e:
        logger.error(
            f"[ServiceLookupTools] Failed to fetch service by id | "
            f"service={service_id} | tenant={tenant_id} | {e}",
        )
        return None


# ── Tool 3: Format services list for user display ─────────────────────────────

def format_services_for_display(services: list[dict]) -> str:
    """
    Format the services list into a clean, numbered string for showing to the user.
    Used by the LLM reply when no service was detected in the user's message.

    Example output:
        1. Dermatology — Dr. Perera
        2. Cardiology — Dr. Fernando
        3. General Consultation
    """
    if not services:
        return "No services are currently available."

    lines = []
    for i, svc in enumerate(services, start=1):
        doctor = f" — {svc['doctor_name']}" if svc.get("doctor_name") else ""
        lines.append(f"  {i}. {svc['service_name']}{doctor}")

    return "\n".join(lines)