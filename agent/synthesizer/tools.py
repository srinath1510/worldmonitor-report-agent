"""
Tool executor: maps Claude tool_use calls to Supabase snapshot reads.

Each function returns a clean, pre-aggregated dict — exactly what Claude
receives as tool_result content. No live API calls happen here.
"""

import json
from storage.reader import (
    fetch_latest_snapshot,
    fetch_cross_domain_anomalies,
    fetch_daily_context,
)


def get_overnight_market_summary() -> dict:
    row = fetch_latest_snapshot("markets")
    if not row:
        return {"error": "No market snapshot available"}
    return {
        "collected_at": row.get("collected_at"),
        "prices": row.get("payload", {}),
        "deltas": row.get("deltas", {}),
        "anomalies": row.get("anomalies", {}),
    }


def get_macro_indicators() -> dict:
    row = fetch_latest_snapshot("macro_indicators")
    if not row:
        return {"error": "No macro snapshot available"}
    return {
        "collected_at": row.get("collected_at"),
        "indicators": row.get("payload", {}),
        "deltas": row.get("deltas", {}),
        "anomalies": row.get("anomalies", {}),
    }


def get_geopolitical_delta() -> dict:
    row = fetch_latest_snapshot("gdelt_tensions")
    if not row:
        return {"error": "No GDELT snapshot available"}
    return {
        "collected_at": row.get("collected_at"),
        "pairs": row.get("payload", {}),
        "deltas": row.get("deltas", {}),
        "anomalies": row.get("anomalies", {}),
    }


def get_top_news_clusters(category: str | None = None) -> dict:
    row = fetch_latest_snapshot("news")
    if not row:
        return {"error": "No news snapshot available"}
    payload: dict = row.get("payload", {})

    # Filter by category if requested
    if category and category in payload:
        clusters = {category: payload[category]}
    else:
        clusters = payload

    return {
        "collected_at": row.get("collected_at"),
        "clusters": clusters,
        "deltas": row.get("deltas", {}),
        "anomalies": row.get("anomalies", {}),
    }


def get_prediction_market_signals() -> dict:
    row = fetch_latest_snapshot("polymarket")
    if not row:
        return {"error": "No Polymarket snapshot available"}
    return {
        "collected_at": row.get("collected_at"),
        "markets": row.get("payload", {}),
        "deltas": row.get("deltas", {}),
        "anomalies": row.get("anomalies", {}),
    }


def get_anomaly_signals() -> dict:
    cross = fetch_cross_domain_anomalies()
    # Also pull domain-level anomalies so Claude has the full picture
    market_anomalies = fetch_latest_snapshot("markets").get("anomalies", {})
    macro_anomalies = fetch_latest_snapshot("macro_indicators").get("anomalies", {})
    news_anomalies = fetch_latest_snapshot("news").get("anomalies", {})
    poly_anomalies = fetch_latest_snapshot("polymarket").get("anomalies", {})
    gdelt_anomalies = fetch_latest_snapshot("gdelt_tensions").get("anomalies", {})

    return {
        "cross_domain": cross,
        "markets": market_anomalies,
        "macro": macro_anomalies,
        "news": news_anomalies,
        "polymarket": poly_anomalies,
        "geopolitical": gdelt_anomalies,
    }


# ---------------------------------------------------------------------------
# Dispatcher
# ---------------------------------------------------------------------------

TOOL_MAP = {
    "get_overnight_market_summary": lambda _: get_overnight_market_summary(),
    "get_macro_indicators":         lambda _: get_macro_indicators(),
    "get_geopolitical_delta":       lambda _: get_geopolitical_delta(),
    "get_top_news_clusters":        lambda inp: get_top_news_clusters(inp.get("category")),
    "get_prediction_market_signals":lambda _: get_prediction_market_signals(),
    "get_anomaly_signals":          lambda _: get_anomaly_signals(),
}


def execute_tool(name: str, tool_input: dict) -> dict:
    fn = TOOL_MAP.get(name)
    if fn is None:
        return {"error": f"Unknown tool: {name}"}
    try:
        return fn(tool_input)
    except Exception as e:
        return {"error": str(e)}
