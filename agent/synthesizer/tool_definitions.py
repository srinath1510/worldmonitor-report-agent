"""
Claude tool definitions for the synthesis agent.
These map exactly to the tool executor in tools.py.
"""

TOOLS = [
    {
        "name": "get_overnight_market_summary",
        "description": (
            "Returns pre-computed overnight market movements with per-instrument % change, "
            "Z-scores vs 30-day baseline, and cross-asset pattern flags "
            "(risk-off, risk-on, stagflation, dollar squeeze). Call this first."
        ),
        "input_schema": {"type": "object", "properties": {}},
    },
    {
        "name": "get_macro_indicators",
        "description": (
            "Returns FRED macro data: yield curve (T10Y2Y), Fed funds rate, HY and IG credit spreads, "
            "M2 money supply. Includes absolute changes, Z-scores, and named anomalies "
            "(yield curve inversion/un-inversion, HY-IG divergence, credit stress)."
        ),
        "input_schema": {"type": "object", "properties": {}},
    },
    {
        "name": "get_geopolitical_delta",
        "description": (
            "Returns GDELT article-volume changes for six bilateral tension pairs: "
            "USA↔Russia, Russia↔Ukraine, USA↔China, China↔Taiwan, USA↔Iran, USA↔Venezuela. "
            "Includes Z-scores vs 7-day baseline, escalation flags, and silence detection."
        ),
        "input_schema": {"type": "object", "properties": {}},
    },
    {
        "name": "get_top_news_clusters",
        "description": (
            "Returns top news stories by category from WorldMonitor's curated RSS feed digest. "
            "Each story includes source, threat level, and whether it triggered an alert. "
            "Optionally filter by category."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "category": {
                    "type": "string",
                    "enum": ["world", "finance", "tech", "military", "mena", "intel"],
                    "description": "Optional category filter. Omit to get all categories.",
                }
            },
        },
    },
    {
        "name": "get_prediction_market_signals",
        "description": (
            "Returns Polymarket prediction markets with 24h probability shifts. "
            "Flags moves > 5% with low concurrent news volume as early-warning signals — "
            "what informed money is pricing before headlines. High-value for divergence detection."
        ),
        "input_schema": {"type": "object", "properties": {}},
    },
    {
        "name": "get_anomaly_signals",
        "description": (
            "Returns cross-domain anomalies computed after all collectors run: "
            "silent divergences (prediction market moves without news), "
            "authority triangulations (GDELT + news + Polymarket all corroborating), "
            "market-geopolitical disconnects (tension spike + equity complacency), "
            "macro-market mismatches (credit spreads vs equities), and quiet desk detection."
        ),
        "input_schema": {"type": "object", "properties": {}},
    },
]
