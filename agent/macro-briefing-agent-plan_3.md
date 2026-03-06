# Macro Morning Briefing Agent — Technical Implementation Plan

## Overview

A daily 8am email briefing powered by Claude, built on top of WorldMonitor's open-source
codebase as the data layer. Hourly snapshots are collected overnight and synthesized into
a 3-minute read each morning.

---

## Framework Decision: No Framework

**Use the Anthropic Python SDK directly with tool_use.** No LangChain, no LangGraph.

Reasons:
- The agent task is a single-shot synthesis, not a multi-step autonomous loop
- WorldMonitor's APIs are clean and well-scoped — no orchestration complexity needed
- Fewer abstractions = easier to debug, cheaper to run, easier to maintain
- You already understand the Anthropic SDK from your Agent Builder work at JPM

The only "framework" is a cron scheduler (GitHub Actions) wrapping a Python script.

---

## Repository Strategy

**Fork WorldMonitor and add a `/agent` directory** to the repo.

Don't build a separate repo. WorldMonitor's codebase is your data layer — keep it
co-located. The agent lives in `agent/` and imports nothing from the frontend code.
It calls the same underlying public APIs that WorldMonitor wraps.

```
worldmonitor/
├── src/              # WorldMonitor frontend (untouched)
├── api/              # WorldMonitor Sebuf RPC handlers (untouched)
├── agent/            # Your addition
│   ├── collectors/   # One file per data domain
│   ├── storage/      # SQLite snapshots
│   ├── synthesizer/  # Claude tool-use agent
│   ├── delivery/     # Email via Resend
│   ├── scheduler/    # Entry points (collect.py, brief.py)
│   └── prompts/      # Prompt templates
└── .github/
    └── workflows/
        ├── collect.yml   # Runs every hour midnight–8am
        └── brief.yml     # Runs at 8am
```

---

## WorldMonitor API Domains → Agent Tools

The repo's `/api` directory is now organized into versioned Sebuf RPC domains.
Each domain maps to one agent tool. When self-hosting, these are available at
`http://localhost:PORT/api/{domain}/v1/{handler}`.

| Domain | Endpoint Pattern | Tool Name | Data |
|---|---|---|---|
| `market/v1` | `/api/market/v1/quotes` | `get_markets` | Equities, commodities, crypto |
| `economic/v1` | `/api/economic/v1/fred` | `get_fed_data` | Fed rates, yields, M2, credit spreads |
| `intelligence/v1` | `/api/intelligence/v1/gdelt` | `get_geopolitical_tensions` | GDELT tension pairs |
| `news/v1` | `/api/news/v1/feed` | `get_news` | Clustered RSS by category |
| `prediction/v1` | `/api/prediction/v1/polymarket` | `get_prediction_markets` | Geopolitical market odds |
| `maritime/v1` | `/api/maritime/v1/chokepoints` | `get_maritime` | Chokepoint vessel density |
| `military/v1` | `/api/military/v1/activity` | `get_military_activity` | Base proximity alerts |
| `seismology/v1` | `/api/seismology/v1/usgs` | `get_earthquakes` | M4.5+ seismic events |
| `cyber/v1` | `/api/cyber/v1/threats` | `get_cyber_threats` | GDELT Doc cyber intelligence |
| `supply-chain/v1` | `/api/supply-chain/v1/status` | `get_supply_chain` | Shipping/aviation disruptions |
| `climate/v1` | `/api/climate/v1/alerts` | `get_weather_alerts` | NWS severe weather |

For tools without a reliable Sebuf endpoint, call the upstream APIs directly
(USGS, NWS, GDELT are all public). WorldMonitor's source shows exactly which
endpoints and params to use.

---

## Data Collection Layer

### Hourly Snapshot Schema (SQLite)

```sql
CREATE TABLE snapshots (
    id          INTEGER PRIMARY KEY,
    collected_at TIMESTAMP NOT NULL,
    domain      TEXT NOT NULL,       -- 'markets', 'geopolitical', etc.
    payload     JSON NOT NULL,       -- raw API response
    deltas      JSON,                -- computed vs previous snapshot
    anomalies   JSON                 -- flagged deviations
);

CREATE TABLE daily_context (
    date        DATE PRIMARY KEY,
    snapshot_count INTEGER,
    last_updated TIMESTAMP
);
```

### The 5 Collectors

**1. Markets** — Finnhub (equities), Yahoo Finance (indices/commodities), CoinGecko (crypto)
Overnight price levels for S&P 500, NDX, crude oil, gold, DXY, BTC. Cross-asset deltas
are what matter: a simultaneous gold up / yields down / DXY up pattern is a named risk-off
signal that no single instrument reveals alone.

**2. GDELT Tensions** — GDELT GPR batch API
Six bilateral tension pairs: USA↔Russia, Russia↔Ukraine, USA↔China, China↔Taiwan,
USA↔Iran, USA↔Venezuela. Tension scores with trend direction (±5% threshold). Useful
for contextualizing market moves — a semis selloff lands differently alongside a rising
China↔Taiwan score. Note: GDELT measures *news volume about tension*, not tension itself.
Weight accordingly.

**3. News Clusters** — WorldMonitor's curated RSS (tightened to ~10 high-signal sources)
Reuters, AP, Bloomberg, FT, WSJ, CNBC, Fed/Treasury/White House releases, Bellingcat.
Stories clustered by Jaccard similarity, ranked by velocity. Claude receives cluster
summaries with source tier and article count — not raw headlines.

**4. Polymarket** — Polymarket API, geopolitically-tagged markets only
Odds + delta since yesterday's close. Markets that move >5% with no concurrent news
spike are flagged as early-warning signals. The highest-value collector for surfacing
what informed money is pricing before it shows up in headlines.

**5. FRED / Macro Indicators** — FRED API (no key required)
Yield curve (2Y/10Y spread), Fed funds rate, HY/IG credit spreads, M2. Replaces ACLED.
These are the indicators that explain *why* markets moved overnight — the macro
plumbing layer that contextualizes everything else in the brief.

### Economic Calendar (Static Context Block)

Not a collector — runs once at midnight and injected directly into the synthesis prompt.
Three sources:

- **FRED release calendar** (free) — CPI, PPI, NFP, GDP, FOMC minutes, Fed speeches
- **Finnhub earnings calendar** (existing API key) — S&P 500 earnings, filtered BMO/AMC
- **Central bank meetings** — hardcoded quarterly schedule for Fed/ECB/BoJ

Passed as a static block in the system prompt, not a tool call:

```python
system_prompt = f"""
...

TODAY'S SCHEDULED EVENTS:
{calendar.format_for_prompt()}

When relevant, frame analysis around these scheduled catalysts.
"""
```

This turns the brief from backward-looking summary to forward-looking prep — "markets
sold off overnight but CPI drops at 8:30, the move may reverse or accelerate on the print."

### Delta Computation (pre-aggregation before LLM)

This is the most important design decision. **Compute deltas in Python, not in the prompt.**

For each domain, the collector computes:
- **Markets**: % change since midnight snapshot, Z-score vs 30-day baseline, cross-asset pattern detection
- **GDELT tensions**: delta in tension score per pair since yesterday, trend direction
- **News velocity**: new clusters per hour vs baseline, spike detection, source tier weighting
- **Polymarket**: probability shifts >3%, news-coverage divergence flag
- **FRED**: yield curve shape change, credit spread movement vs prior week

The Claude synthesis prompt receives a clean, pre-computed diff — not raw data.
This keeps token usage low and output quality high.

---

## The Agent (Synthesizer)

### Tool Definitions

```python
tools = [
    {
        "name": "get_overnight_market_summary",
        "description": "Returns pre-computed market movements with Z-scores, cross-asset patterns, and notable anomalies since midnight",
        "input_schema": {"type": "object", "properties": {}}
    },
    {
        "name": "get_macro_indicators",
        "description": "Returns FRED yield curve shape, credit spreads, Fed funds rate, and M2 delta vs prior week",
        "input_schema": {"type": "object", "properties": {}}
    },
    {
        "name": "get_geopolitical_delta",
        "description": "Returns GDELT tension score changes for key pairs vs yesterday, with trend direction",
        "input_schema": {"type": "object", "properties": {}}
    },
    {
        "name": "get_top_news_clusters",
        "description": "Returns top 10 clustered news stories by velocity, with source tier and sentiment",
        "input_schema": {
            "type": "object",
            "properties": {
                "category": {
                    "type": "string",
                    "enum": ["world", "finance", "tech", "military", "mena"]
                }
            }
        }
    },
    {
        "name": "get_prediction_market_signals",
        "description": "Returns Polymarket odds that moved significantly overnight, flagging moves uncorrelated with news",
        "input_schema": {"type": "object", "properties": {}}
    },
    {
        "name": "get_anomaly_signals",
        "description": "Returns cross-domain anomalies: silent divergences, velocity spikes, authority triangulations",
        "input_schema": {"type": "object", "properties": {}}
    }
]
```

### Synthesis Prompt (System)

```
You are a macro situational awareness analyst writing a morning briefing for a 
senior technologist at a major financial institution. Your reader understands markets, 
geopolitics, and technology deeply. They have 3 minutes over coffee.

Rules:
- Lead with what CHANGED, not what IS
- Frame analysis around today's scheduled catalysts when relevant
- Surface divergences: what are markets pricing that news isn't covering?
- Flag what's unusually quiet — absence of signal is signal
- No hedging language. State your read directly.
- Never bullet-point the whole thing. Write in paragraphs with section headers.

Output format:
## The Overnight Story (2-3 sentences, the single most important thing)
## Today's Catalysts (scheduled events that matter today — earnings, Fed, data releases)
## Markets (what moved and what it might mean, 3-4 sentences)
## Macro Pulse (yield curve, credit spreads, what the plumbing is saying)
## Geopolitical Pulse (tension deltas, 3-4 sentences)
## Signals Worth Watching (1-2 anomalies or divergences)
## Quiet Desk (what's oddly absent today)
```

### Agent Loop

```python
def run_synthesis(db: Database) -> str:
    messages = [{"role": "user", "content": "Generate today's morning briefing."}]
    
    while True:
        response = anthropic.messages.create(
            model="claude-sonnet-4-20250514",
            max_tokens=1500,
            system=SYSTEM_PROMPT,
            tools=tools,
            messages=messages
        )
        
        if response.stop_reason == "end_turn":
            return extract_text(response)
        
        # Handle tool calls
        tool_results = []
        for block in response.content:
            if block.type == "tool_use":
                result = execute_tool(block.name, block.input, db)
                tool_results.append({
                    "type": "tool_result",
                    "tool_use_id": block.id,
                    "content": json.dumps(result)
                })
        
        messages.append({"role": "assistant", "content": response.content})
        messages.append({"role": "user", "content": tool_results})
```

Each `execute_tool` call queries SQLite for the pre-computed snapshot data —
no live API calls at synthesis time.

---

## GitHub Actions Schedules

### collect.yml — Hourly collector

```yaml
on:
  schedule:
    - cron: '0 0-8 * * *'   # Every hour from midnight to 8am UTC

jobs:
  collect:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with:
          python-version: '3.14'
      - run: pip install -r agent/requirements.txt
      - run: python agent/scheduler/collect.py
        env:
          FINNHUB_API_KEY: ${{ secrets.FINNHUB_API_KEY }}
          DB_URL: ${{ secrets.SUPABASE_URL }}

  calendar:
    runs-on: ubuntu-latest
    if: ${{ github.event.schedule == '0 0 * * *' }}  # midnight only
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with:
          python-version: '3.13'
      - run: python agent/scheduler/calendar.py   # fetch today's events once
        env:
          FINNHUB_API_KEY: ${{ secrets.FINNHUB_API_KEY }}
          DB_URL: ${{ secrets.SUPABASE_URL }}
```

### brief.yml — 8am synthesizer + delivery

```yaml
on:
  schedule:
    - cron: '0 8 * * 1-5'   # 8am UTC, weekdays only

jobs:
  brief:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with:
          python-version: '3.14'
      - run: pip install -r agent/requirements.txt
      - run: python agent/scheduler/brief.py
        env:
          ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
          RESEND_API_KEY: ${{ secrets.RESEND_API_KEY }}
          DB_URL: ${{ secrets.SUPABASE_URL }}
```

**Storage note**: GitHub Actions has no persistent filesystem between runs.
Use **Supabase** (free tier, Postgres) or a small VPS. SQLite works if you
commit the DB file to a private branch, but Supabase is cleaner.

---

## Delivery

Plain HTML email via **Resend** (free tier: 3k emails/month). Keep it minimal:

- Dark background, monospace font (matches WorldMonitor's aesthetic)
- Each section is a `<div>` block, no tables
- Subject line: `Morning Brief — {date} | {overnight_story_headline}`
- Reply-to disabled — this is read-only

---

## Tech Stack Summary

| Component | Choice | Why |
|---|---|---|
| Language | Python 3.14 | Clean async, great for API calls |
| Agent SDK | `anthropic` (raw) | No framework needed |
| Data layer | WorldMonitor fork (direct upstream API calls) | Own your data pipeline |
| Storage | Supabase (Postgres) | Persistent across GitHub Actions runs, free tier |
| Scheduler | GitHub Actions cron | Free, zero infra |
| Delivery | Resend | Best DX, free tier sufficient |
| Model | claude-sonnet-4-20250514 | Best quality/cost for synthesis |
| Calendar sources | FRED release calendar + Finnhub earnings | Both free/existing keys |

---

## Phased Build

### Phase 1 — Data Pipeline (3-4 days)
- Fork WorldMonitor, set up `agent/` directory
- Build collectors for 5 domains: Markets, GDELT, News, Polymarket, FRED
- Build calendar collector (FRED releases + Finnhub earnings) — runs at midnight only
- Verify data quality, understand API quirks
- Get snapshots writing to Supabase

### Phase 2 — Delta Engine (2-3 days)  
- Implement delta computation for each domain
- Build anomaly detection (Z-scores, velocity spikes, prediction market moves)
- Test with a week of manual runs

### Phase 3 — Synthesis Agent (2-3 days)
- Write tool definitions and system prompt
- Iterate on output quality with sample data
- Tune prompt until the output reads like something you'd actually want

### Phase 4 — Automation + Delivery (1-2 days)
- Wire up GitHub Actions schedules
- Set up Resend email templates
- Run for a full week, adjust timing

**Total: ~2 weeks** to something you're reading every morning.

---

## Key Design Principles

1. **Pre-aggregate before the LLM** — Claude gets deltas and anomalies, not raw JSON
2. **Synthesis is read-only** — agent never calls live APIs, only queries Supabase
3. **Calendar is static context, not a tool** — injected into system prompt at synthesis time
4. **Fail gracefully** — if a domain collector fails, skip it and note in the brief
5. **Start narrow** — 5 collectors first, add more once quality is high
6. **Own your data** — call upstream APIs directly, don't depend on worldmonitor.app uptime
