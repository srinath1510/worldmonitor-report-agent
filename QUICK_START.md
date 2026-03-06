# Macro Briefing Agent - Quick Start Guide

## What You Get

A daily briefing with **actionable trading signals** including:

- **Specific trade ideas** with instruments, direction, conviction levels
- **Invalidation points** for each trade (know when you're wrong)
- **Catalyst timing** for intraday volatility events
- **Divergence signals** from prediction markets vs news
- **Cross-asset correlations** (risk-off, dollar strength, stagflation patterns)
- **Data gap transparency** (know what you can't see)

## Running the Agent

### Morning Briefing (pre-market):
```bash
cd agent
uv run scheduler/brief.py
```

Output saved to: [`agent/output/brief_YYYY-MM-DD.md`](agent/output/)

### Intraday Update (during market hours 9:30am-4pm ET):
```bash
cd agent
uv run scheduler/brief.py
```

Automatically detects market hours and adjusts analysis focus.

### Hourly Data Collection (runs overnight 12am-8am):
```bash
npx tsx server/agent/scheduler/collect.ts
```

Collects snapshots from:
- Yahoo Finance (markets)
- GDELT (geopolitical tensions)
- Polymarket (prediction markets)
- News RSS feeds
- FRED (macro indicators)

---

## Reading the Brief

### 1. Executive Summary
**Single most important development** + immediate trading implication

### 2. Market Plays → Action Items
**Prioritized trade ideas:**
```
**[PLAY NAME]**: Direction, Instrument
- Conviction: HIGH/MEDIUM/LOW
- Catalyst: When it matters
- Invalidates: Stop-loss condition

Example:
**Venezuela Normalization Curve Play**:
- Long VLO, PSX (US refiners), short USO
- Conviction: MEDIUM
- Catalyst: Next 48 hours as details emerge
- Invalidates if Venezuela-US talks collapse
```

### 3. Today's Catalysts & Timing
- Pre-market earnings with expected impact
- Macro releases with exact times
- Geopolitical events with timeframes

### 4. Bottom Line
**Primary/Secondary/Tertiary trades** ranked by conviction:
- PRIMARY: Highest conviction, 1-5 day hold
- SECONDARY: Medium conviction, 1-2 week hold
- TERTIARY: Lower conviction, intraday/tactical
- HEDGE: Risk management for primary thesis

---

## Understanding Conviction Levels

### HIGH Conviction
- Multiple data sources corroborate
- Clear catalyst visible
- Z-scores > 2 or major divergence
- **Action:** Size position accordingly

### MEDIUM Conviction
- Some evidence but incomplete
- Catalyst timing uncertain
- Moderate divergence
- **Action:** Smaller position, tight stops

### LOW Conviction
- Speculative/directional bias
- Incomplete data
- Weak signal
- **Action:** Watch only or minimal size

---

## Understanding Divergence Signals

**Divergences are the highest-value alpha:**

1. **Prediction Markets vs News**
   - Polymarket moves >5% with low news coverage
   - "Informed money" pricing something not yet in headlines

2. **Credit vs Equity**
   - Credit spreads tight while equities sell off (or vice versa)
   - One market is mispricing risk

3. **Cross-Asset Correlations Breaking**
   - Gold up + Yields up = Dollar strength (not flight-to-quality)
   - Oil up + Equities up = Growth narrative (not stagflation)

---

## Handling Data Gaps

Agent **explicitly acknowledges blind spots**:

```markdown
## Data Gaps & Blind Spots

**OVERNIGHT PRICE DATA (CRITICAL)**
- Missing: All equity, FX, commodity prices
- Reason: Yahoo Finance rate-limited
- Impact: Cannot confirm overnight moves
- Mitigation: Check Bloomberg terminal
```

**What to do:**
1. Read "Data Gaps" section first
2. Cross-check missing data with Bloomberg/Reuters
3. Treat inferred moves as hypotheses until confirmed
4. Adjust trade sizing for uncertainty

---

## API Status & Fallbacks

### ✅ Working with Fallbacks:
- **Markets:** Yahoo Finance → cached data if rate-limited
- **GDELT:** API → cached data if rate-limited
- **News:** RSS feeds → robust, rarely fails
- **Polymarket:** Direct API → usually reliable

### ⚠️ Known Issues:
- **FRED:** Some series IDs return "No data" (non-critical)
- **Yahoo Finance:** Rate-limited during high-load hours (fallback active)
- **GDELT:** Rate-limited during peak usage (fallback active)
- **Economic Calendar:** Release codes not decoded (manual lookup needed)

**All issues gracefully handled** - briefing still produces actionable output even with failures.

---

## Environment Variables Required

```bash
# .env file
SUPABASE_URL="https://your-project.supabase.co"
SUPABASE_KEY="your-anon-key"
ANTHROPIC_API_KEY="your-api-key"
FRED_API_KEY="your-fred-key"  # Optional but recommended
WS_RELAY_URL=""  # Optional, for Yahoo Finance relay
```

---

## Output Example

```markdown
## Executive Summary
Iran war escalation accelerating with 84% Hormuz closure probability
but markets stale due to Yahoo rate-limit. MRVL/COST earnings after-hours
are volatility catalysts given Anthropic Pentagon blacklist narrative.

## Market Plays → Action Items

**PRIMARY: Long Dollar on Iran Haven Bid**
- Long DXY via futures or UUP ETF
- Conviction: HIGH
- Catalyst: 1-5 days (Iran escalation continues)
- Invalidates: Trump announces Iran ceasefire

**SECONDARY: Long Oil Volatility**
- OVX calls or USO straddles
- Conviction: MEDIUM
- Catalyst: 2 weeks (Hormuz closure risk 84%)
- Invalidates: Iran attack tempo drops further

**TERTIARY: Short MRVL into Earnings**
- Direction: Short, intraday after 4pm earnings
- Conviction: LOW
- Catalyst: AI supply chain regulatory concerns
- Invalidates: Strong guidance >10% beat

## Bottom Line

Operating in degraded data environment but sufficient signal from news +
Polymarket. Primary trade: Long dollar (1-5 days). Secondary: Long oil vol
(2 weeks). Watch macro release codes - if CPI/labor data, overrides geopolitical.
```

---

## Best Practices

1. **Read Bottom Line First** - Get primary thesis immediately
2. **Check Data Gaps** - Know what you can't see
3. **Verify Catalyst Timing** - Don't miss intraday volatility events
4. **Cross-Reference Conviction** - Higher conviction = larger size
5. **Monitor Invalidation Points** - Know when to exit

---

## Scheduling

### Recommended Cron (GitHub Actions):

**Collection** (hourly overnight):
```yaml
cron: '0 0-8 * * 1-5'  # Midnight to 8am ET, weekdays
```

**Synthesis** (8am daily):
```yaml
cron: '0 8 * * 1-5'  # 8am ET, weekdays
```

**Intraday Updates** (optional, during volatility events):
```yaml
cron: '0 9,12,15 * * 1-5'  # 9am, 12pm, 3pm ET
```

---

## Troubleshooting

### "No quotes returned from Yahoo/Finnhub"
✅ **Expected** - Fallback to cached data is working
- Check agent output for "Using cached market data from [timestamp]"
- Brief will acknowledge data staleness in Data Gaps section

### "GDELT returned 429"
✅ **Expected** - Rate limiting, fallback active
- Check for "Using cached GDELT data from [timestamp]"
- Brief operates on news + Polymarket triangulation

### "Economic calendar codes not decoded"
⚠️ **Known Issue**
- Manually check FRED/Bloomberg economic calendar
- Look up codes: 86, 279, 502, 378, 101

### Brief truncated or incomplete
✅ **Fixed** - Max tokens increased to 4096
- If still truncating, check Anthropic API response logs

---

## Support

- **Documentation:** [`IMPROVEMENTS.md`](IMPROVEMENTS.md)
- **Technical Plan:** [`agent/macro-briefing-agent-plan_3.md`](agent/macro-briefing-agent-plan_3.md)
- **Issues:** File in repo or check logs in `agent/output/`

---

*Last Updated: 2026-03-06*
*Model: claude-sonnet-4-5*
