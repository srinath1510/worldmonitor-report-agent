import os
import json
import sys
from pathlib import Path
from datetime import date, datetime, timedelta, timezone

from supabase import create_client, Client
from dotenv import load_dotenv

# Load .env from repo root (storage/ -> agent/ -> repo root)
_repo_root = Path(__file__).resolve().parent.parent.parent
load_dotenv(dotenv_path=_repo_root / '.env')

_client: Client | None = None

def get_client() -> Client | None:
    global _client
    if _client is not None:
        return _client
    url = os.environ.get("SUPABASE_URL", "")
    key = os.environ.get("SUPABASE_KEY", "")
    if not url or not key:
        print("Warning: SUPABASE_URL or SUPABASE_KEY not set.", file=sys.stderr)
        return None
    _client = create_client(url, key)
    return _client


def fetch_latest_snapshot(domain: str) -> dict:
    """Returns the most recent snapshot row for a domain as a dict."""
    client = get_client()
    if not client:
        return {}

    resp = (
        client.table("snapshots")
        .select("collected_at, payload, deltas, anomalies")
        .eq("domain", domain)
        .order("collected_at", desc=True)
        .limit(1)
        .execute()
    )
    rows = resp.data or []
    return rows[0] if rows else {}


def fetch_daily_context(target_date: str | None = None) -> dict:
    """Returns the daily_context row for today (or a given date)."""
    client = get_client()
    if not client:
        return {}

    d = target_date or date.today().isoformat()
    resp = (
        client.table("daily_context")
        .select("events_payload")
        .eq("date", d)
        .limit(1)
        .execute()
    )
    rows = resp.data or []
    return rows[0].get("events_payload", {}) if rows else {}


def fetch_cross_domain_anomalies() -> dict:
    """Returns the latest cross-domain anomaly snapshot."""
    row = fetch_latest_snapshot("cross_domain")
    return row.get("anomalies", {})
