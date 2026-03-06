# WorldMonitor Report Agent

> **Macro Morning Briefing Agent** — An AI-powered daily briefing system that synthesizes geopolitical intelligence, market data, and prediction markets into actionable trading signals.

Built on top of [**WorldMonitor**](https://github.com/koala73/worldmonitor) as the data layer, this repo adds a `/agent` directory containing a Claude-powered synthesis agent that delivers a daily 8am briefing with specific trade recommendations.

---

## What You Get

Every morning at 8am (or on-demand during market hours), receive a comprehensive briefing with:

- **Specific Trading Ideas** — Long/short positions with instruments (VLO, PSX, HYG, SMH, etc.)
- **Conviction Levels** — HIGH/MEDIUM/LOW for each trade
- **Invalidation Points** — Know when you're wrong and should exit
- **Catalyst Timing** — Exact times for earnings/macro releases that matter
- **Divergence Signals** — Polymarket vs news (highest alpha source)
- **Geopolitical Analysis** — GDELT tensions, second-order market effects
- **Macro Plumbing** — Yield curve, credit spreads, what the internals signal
- **Data Gap Transparency** — Explicit blind spots (know what you can't see)

### Example Output

```markdown
## Executive Summary
Iran conflict entering critical inflection with 84% Hormuz closure probability.
Primary trade: dollar strength continuation into COST/MRVL earnings.

## Market Plays → Action Items

**Dollar Strength Continuation Play**:
- Long DXY via futures or UUP
- Conviction: HIGH
- Catalyst: Iran haven bid + 84% Hormuz closure probability
- Invalidates: Trump-Iran deal headlines
- Timeframe: 1-5 days

**Energy Volatility Strangle**:
- Long WTI straddles (ATM, 2-week expiry)
- Conviction: MEDIUM-HIGH
- Catalyst: Depleted SPR + White House futures intervention signals
- Invalidates: Iran attack tempo continues declining
- Timeframe: Before March 12

## Bottom Line
PRIMARY: Long dollar (1-5 days). Risk: Trump-Iran deal.
SECONDARY: Long oil vol (2 weeks). Risk: Attack tempo falls.
```

---

## About WorldMonitor

[**WorldMonitor**](https://github.com/koala73/worldmonitor) is an open-source geopolitical intelligence platform that aggregates:
- Real-time news feeds (Reuters, AP, Bloomberg, FT, WSJ)
- GDELT geopolitical event data
- Market data (equities, commodities, crypto)
- Prediction markets (Polymarket)
- FRED economic indicators
- Military activity, maritime tracking, infrastructure monitoring

**This repo is a fork of WorldMonitor** with an added `/agent` directory that:
1. ✅ Collects hourly snapshots overnight (12am-8am) using WorldMonitor's backend APIs
2. ✅ Stores data in Supabase with Z-scores and anomaly detection
3. ✅ Synthesizes insights at 8am using Claude Sonnet 4.5
4. ✅ Delivers actionable trading intelligence via markdown output

**Key Difference:** WorldMonitor is a real-time dashboard for monitoring. This repo adds an AI synthesis layer for trading decisions.

👉 **For WorldMonitor documentation** (the dashboard/platform), see the [original README](docs/WORLDMONITOR_ORIGINAL_README.md) or visit [worldmonitor.app](https://worldmonitor.app).

---

## Architecture

```
worldmonitor-report-agent/
├── src/                    # WorldMonitor frontend (unchanged)
├── api/                    # WorldMonitor API handlers (unchanged)
├── server/
│   ├── worldmonitor/       # Backend RPC handlers for data sources
│   └── agent/              # NEW: Data collectors + delta engine
│       ├── collectors/     # TS collectors (markets, GDELT, news, Polymarket, FRED)
│       ├── delta/          # Z-score computation, anomaly detection
│       ├── storage/        # Supabase interface
│       └── scheduler/      # collect.ts (hourly overnight)
└── agent/                  # NEW: Claude synthesis layer (Python)
    ├── synthesizer/        # Claude tool-use agent
    ├── prompts/            # System prompt + calendar context
    ├── storage/            # Supabase reader
    ├── scheduler/          # brief.py (8am daily)
    └── output/             # Daily briefings (*.md)
```

**Data Flow:**
1. **Collectors (TS)** → Call Yahoo, GDELT, FRED, Polymarket APIs → Save to Supabase
2. **Delta Engine (TS)** → Compute Z-scores, cross-asset patterns, anomalies
3. **Synthesis Agent (Python)** → Read Supabase snapshots → Claude generates brief

**WorldMonitor is NOT required to be running.** The agent uses WorldMonitor's backend API wrappers as library functions, not running services.

---

## Quick Start

### Prerequisites

- Node.js 18+ (for TypeScript collectors)
- Python 3.13+ with `uv` (for synthesis agent)
- Supabase account (free tier works)
- API keys: `ANTHROPIC_API_KEY`, `FRED_API_KEY` (optional)

### Installation

```bash
# Clone the repo
git clone https://github.com/yourusername/worldmonitor-report-agent.git
cd worldmonitor-report-agent

# Install Node dependencies (for collectors)
npm install

# Install Python dependencies (for synthesis)
cd agent
uv sync
cd ..

# Set up environment variables
cp .env.example .env
# Edit .env with your keys:
#   SUPABASE_URL=https://your-project.supabase.co
#   SUPABASE_KEY=your-anon-key
#   ANTHROPIC_API_KEY=your-api-key
#   FRED_API_KEY=your-fred-key  # Optional but recommended
```

### Create Supabase Tables

```sql
-- Snapshots table
CREATE TABLE snapshots (
    id BIGSERIAL PRIMARY KEY,
    collected_at TIMESTAMPTZ DEFAULT NOW(),
    domain TEXT NOT NULL,
    payload JSONB NOT NULL,
    deltas JSONB,
    anomalies JSONB
);
CREATE INDEX idx_snapshots_domain_time ON snapshots(domain, collected_at DESC);

-- Daily context (economic calendar)
CREATE TABLE daily_context (
    date DATE PRIMARY KEY,
    events_payload JSONB,
    last_updated TIMESTAMPTZ DEFAULT NOW()
);
```

### Usage

#### Run Data Collection (Hourly)

```bash
npx tsx server/agent/scheduler/collect.ts
```

This collects snapshots from all data sources and saves to Supabase.

#### Generate Morning Briefing

```bash
cd agent
uv run scheduler/brief.py
```

Output saved to: `agent/output/brief_YYYY-MM-DD.md`

#### View Latest Briefing

```bash
cat agent/output/brief_$(date +%Y-%m-%d).md
```

---

## Scheduling (GitHub Actions)

The repo includes workflow templates for automated runs:

### `.github/workflows/collect.yml` — Hourly collector

```yaml
on:
  schedule:
    - cron: '0 0-8 * * 1-5'  # Every hour from midnight to 8am ET, weekdays

jobs:
  collect:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
      - run: npm install
      - run: npx tsx server/agent/scheduler/collect.ts
        env:
          SUPABASE_URL: ${{ secrets.SUPABASE_URL }}
          SUPABASE_KEY: ${{ secrets.SUPABASE_KEY }}
          FRED_API_KEY: ${{ secrets.FRED_API_KEY }}
```

### `.github/workflows/brief.yml` — 8am synthesis

```yaml
on:
  schedule:
    - cron: '0 8 * * 1-5'  # 8am ET, weekdays

jobs:
  brief:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with:
          python-version: '3.13'
      - run: pip install uv && cd agent && uv sync
      - run: cd agent && uv run scheduler/brief.py
        env:
          ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
          SUPABASE_URL: ${{ secrets.SUPABASE_URL }}
          SUPABASE_KEY: ${{ secrets.SUPABASE_KEY }}
```

---

## Key Features

### ✅ Robust API Failure Handling

- **Yahoo Finance 429 errors** → Fallback to cached Supabase data
- **GDELT rate limiting** → Use previous snapshots with staleness tracking
- **Graceful degradation** → Agent produces useful output even with failures
- **Data gap transparency** → Explicit "Blind Spots" section in every brief

### ✅ Intraday Mode Detection

- Automatically detects market hours (9:30am-4pm ET)
- Adjusts analysis: "morning briefing" vs "intraday market update"
- Changes focus from pre-market setup to real-time positioning

### ✅ Trading Signal Focus

- **Specific instruments**: VLO, PSX, SMH, XRT, HYG, SPX puts, etc.
- **Conviction levels**: HIGH/MEDIUM/LOW for each play
- **Invalidation points**: Know when the thesis is wrong
- **Timeframes**: Intraday, 1-5 days, 2 weeks
- **Primary/Secondary/Tertiary** structure for prioritization

### ✅ Cross-Domain Anomaly Detection

- Z-scores for market moves, GDELT tensions, Polymarket shifts
- Cross-asset pattern detection (risk-off, stagflation, dollar squeeze)
- Silent divergences (Polymarket moves without news coverage)
- Authority triangulations (GDELT + News + Polymarket corroboration)

---

## Documentation

- **[QUICK_START.md](QUICK_START.md)** — How to read and use the briefing for trading
- **[IMPROVEMENTS.md](IMPROVEMENTS.md)** — Complete technical summary of all enhancements
- **[agent/macro-briefing-agent-plan_3.md](agent/macro-briefing-agent-plan_3.md)** — Original technical design doc
- **[docs/WORLDMONITOR_ORIGINAL_README.md](docs/WORLDMONITOR_ORIGINAL_README.md)** — Original WorldMonitor documentation

---

## Data Sources

| Source | What It Provides | Update Frequency |
|--------|------------------|------------------|
| **Yahoo Finance** | S&P 500, Nasdaq, crude oil, gold, DXY, BTC prices | Hourly overnight |
| **GDELT** | Geopolitical tension article counts (6 bilateral pairs) | Hourly overnight |
| **Polymarket** | Prediction market probabilities (Iran, Taiwan, Fed, etc.) | Hourly overnight |
| **News RSS** | Curated feeds (Reuters, AP, Bloomberg, FT, WSJ, .gov) | Hourly overnight |
| **FRED** | Yield curve (T10Y2Y), Fed funds, HY/IG spreads, M2 | Hourly overnight |
| **Economic Calendar** | Earnings (Finnhub), macro releases (FRED) | Daily at midnight |

All data is stored in Supabase with timestamps, deltas, and anomaly flags.

---

## Example Briefing Structure

```markdown
## Executive Summary
[1-2 sentences: The single most important development + trading thesis]

## Market Plays → Action Items
[2-4 specific trades with conviction/invalidation/timeframe]

## Today's Catalysts & Timing
[Earnings, macro releases, geopolitical events with exact times]

## What Moved & Why
[Overnight price action with Z-scores, cross-asset correlations]

## Macro Plumbing
[Yield curve, credit spreads, Fed positioning, liquidity signals]

## Geopolitical Watch
[GDELT deltas, escalation/de-escalation, second-order market effects]

## Divergence Signals
[6 specific divergences with conviction levels and trade ideas]

## Data Gaps & Blind Spots
[Explicit acknowledgment of missing data and mitigation strategies]

## Bottom Line
[Primary/Secondary/Tertiary trades ranked by conviction]
```

---

## Environment Variables

```bash
# Required
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_KEY=your-anon-key
ANTHROPIC_API_KEY=sk-ant-...

# Optional but recommended
FRED_API_KEY=your-fred-key           # For FRED macro data
WS_RELAY_URL=wss://your-relay.com    # For Yahoo Finance relay (bypass rate limits)

# Optional
RESEND_API_KEY=re_...                # For email delivery (future)
```

---

## Known Issues & Limitations

### Non-Critical (Gracefully Handled)

1. **Yahoo Finance Rate Limiting** → Fallback to cached data works
2. **GDELT Rate Limiting** → Fallback to cached data works
3. **FRED Series IDs** → Some return "No data" (non-critical for macro pulse)
4. **Economic Calendar Codes** → Release IDs not decoded (manual lookup works)
5. **Polymarket 24h Deltas** → Need baseline snapshots (absolute levels work)

All issues are acknowledged in briefing's "Data Gaps" section. Agent remains actionable.

---

## Tech Stack

| Component | Technology | Why |
|-----------|-----------|-----|
| **Data Layer** | WorldMonitor (forked) | Proven APIs for geopolitical intelligence |
| **Collectors** | TypeScript + Node.js | Async API calls, WorldMonitor integration |
| **Storage** | Supabase (Postgres) | Free tier, persistent across GitHub Actions |
| **Delta Engine** | TypeScript | Z-scores, anomaly detection, pattern matching |
| **Synthesis** | Python + Anthropic SDK | Claude Sonnet 4.5 tool-use agent |
| **Scheduler** | GitHub Actions cron | Free, zero infrastructure |
| **Delivery** | Markdown files (email planned) | Simple, version-controlled output |

---

## Roadmap

- [ ] Email delivery via Resend
- [ ] Economic calendar code decoding (FRED releases)
- [ ] Polymarket 24h delta baseline
- [ ] WS_RELAY_URL for Yahoo Finance reliability
- [ ] Slack/Discord webhook notifications
- [ ] Intraday updates (9am, 12pm, 3pm)
- [ ] Historical briefing archive + performance tracking
- [ ] Multi-model ensemble (Opus for critical decisions)

---

## License

This repo inherits WorldMonitor's [AGPL-3.0](LICENSE) license.

**WorldMonitor Credits:**
- Original WorldMonitor: [koala73/worldmonitor](https://github.com/koala73/worldmonitor)
- Geopolitical intelligence platform for real-time monitoring

**Agent Layer:**
- Built by us
- Claude Sonnet 4.5 synthesis agent for trading signals

---

## Disclaimer

⚠️ **This is not financial advice.** The briefing agent is a research tool that synthesizes publicly available data. All trading decisions are your own responsibility. Past performance does not guarantee future results. Markets can remain irrational longer than you can remain solvent.

The agent operates in a **degraded data environment** by design — it acknowledges blind spots and provides probabilistic assessments, not certainties.

---

## Support

- **Agent Issues:** [GitHub Issues](https://github.com/yourusername/worldmonitor-report-agent/issues)
- **Agent Documentation:** [QUICK_START.md](QUICK_START.md) · [IMPROVEMENTS.md](IMPROVEMENTS.md)
- **WorldMonitor Questions:** [Original WorldMonitor repo](https://github.com/koala73/worldmonitor)

---

**Built with Claude Code ftw** 🤖
