# Macro Briefing Agent - Improvements Summary

## Overview
Comprehensive fix and enhancement of the macro morning briefing agent to deliver actionable trading signals with improved reliability and readability.

---

## Key Improvements

### 1. **Enhanced Synthesis Prompt for Trading Signals** ✅

**Before:**
- Generic geopolitical/market summary
- No specific trade recommendations
- Unclear conviction levels
- No invalidation points

**After:**
- **Market Plays → Action Items** section with specific trades
- Clear conviction levels (HIGH/MEDIUM/LOW)
- Explicit invalidation points for each trade
- Instrument/direction/timeframe specified
- Primary/Secondary/Tertiary trade structure
- Expected catalyst timing

**Example Output:**
```
**Venezuela Normalization Curve Play**:
- Long VLO, PSX (US refiners with Venezuelan crude capability), short USO if crude premiums compress
- Conviction: MEDIUM
- Catalyst: Next 48 hours as details emerge
- Invalidates if Venezuela-US talks collapse or Iran closes Hormuz
```

### 2. **Intraday Mode Detection** ✅

**Implementation:**
- Detects if running during market hours (9:30am-4pm ET, weekdays)
- Adjusts prompt context: "morning briefing" vs "intraday market update"
- Changes analysis focus: pre-market setup vs real-time positioning

**Code Location:** [`agent/synthesizer/agent.py:37-45`](agent/synthesizer/agent.py#L37-L45)

### 3. **API Failure Fixes & Fallback Mechanisms** ✅

#### Markets Collector ([server/agent/collectors/markets.ts](server/agent/collectors/markets.ts))
**Problem:** Yahoo Finance 429 rate limiting → no market data

**Solution:**
- Fallback to cached Supabase snapshots when Yahoo rate-limited
- Mark data as stale with age indicators (`_stale_age_hours`)
- Pass stale flag to delta engine and synthesis prompt
- Agent explicitly acknowledges data gaps in output

**Before:**
```
Error: No quotes returned from Yahoo/Finnhub
```

**After:**
```
Yahoo Finance returned no quotes (likely rate limited)
Using cached market data from 2026-03-06T00:45:40.417Z
✓ Markets data collected successfully
```

#### GDELT Collector ([server/agent/collectors/gdelt.ts](server/agent/collectors/gdelt.ts))
**Problem:** GDELT API 429 rate limiting on all tension pairs

**Solution:**
- Track rate limit failures per pair
- If all pairs fail, fallback to cached snapshots
- Mark data as stale and log age
- Successful pairs still save fresh data

**Output:**
```
✓ GDELT data collected (6/6 pairs successful)
```

#### FRED Collector
**Status:** Still has "No data" errors for some series IDs
**Root Cause:** FRED API returning no observations (likely series IDs need validation)
**Current Handling:** Gracefully saves error state, synthesis agent acknowledges gap

### 4. **Improved Output Formatting & Readability** ✅

#### New Section Structure:
1. **Executive Summary** - 1-2 sentence actionable thesis
2. **Market Plays → Action Items** - 2-4 specific trades with conviction/invalidation
3. **Today's Catalysts & Timing** - Exact times, expected market impact >1%
4. **What Moved & Why** - Overnight price action with Z-scores, cross-asset correlations
5. **Macro Plumbing** - Yield curve, credit spreads, funding stress signals
6. **Geopolitical Watch** - GDELT deltas, escalation signals, second-order market impacts
7. **Divergence Signals** - Prediction markets vs news, quiet desks, 6 specific signals
8. **Data Gaps & Blind Spots** - Explicit acknowledgment of missing data
9. **Bottom Line** - Primary/Secondary/Tertiary trades with durations and risks

#### Data Gap Transparency:
```markdown
## Data Gaps & Blind Spots

**1. OVERNIGHT PRICE DATA (CRITICAL)**
- **Missing**: All equity, FX, commodity, volatility prices
- **Reason**: Yahoo Finance rate-limited; data stale
- **Impact**: Cannot confirm DXY strength, oil levels, SPX/NDX moves, VIX, gold
- **Mitigation**: Check Bloomberg/Reuters terminal immediately
```

### 5. **Increased Max Tokens for Complete Analysis** ✅

**Before:** 2000 tokens (output frequently truncated)

**After:** 4096 tokens (comprehensive analysis fits)

**Code Location:** [`agent/synthesizer/agent.py:57`](agent/synthesizer/agent.py#L57)

---

## Files Modified

### Python Agent (Synthesis Layer)
- [`agent/prompts/system_prompt.py`](agent/prompts/system_prompt.py) - Trading-focused prompt with conviction levels
- [`agent/synthesizer/agent.py`](agent/synthesizer/agent.py) - Intraday detection + max_tokens increase

### TypeScript Collectors (Data Layer)
- [`server/agent/collectors/markets.ts`](server/agent/collectors/markets.ts) - Yahoo Finance fallback to cached data
- [`server/agent/collectors/gdelt.ts`](server/agent/collectors/gdelt.ts) - GDELT rate limit fallback

---

## Testing Results

### Before Improvements:
```
## The Overnight Story
The Pentagon formally blacklisted Anthropic... [vague, no actionable trades]

## Markets
No overnight pricing data returned from any venue—this is a data infrastructure failure...
```

### After Improvements:
```
## Executive Summary
Iran war escalation is accelerating... Today's MRVL and COST earnings after-hours could be
volatility catalysts given tech disruption narrative around Anthropic Pentagon blacklist.

## Market Plays → Action Items

**Venezuela Normalization Curve Play**:
- Long VLO, PSX (US refiners), short USO if crude premiums compress
- Conviction: MEDIUM
- Catalyst: Next 48 hours
- Invalidates if Venezuela-US talks collapse

**Geopolitical Oil Play - CANNOT SIZE** (no crude price data):
- Direction should be long crude, short equities
- 84% Hormuz closure probability + Pentagon "firepower surge" language
- But without overnight WTI/Brent levels, cannot identify entry or stops

## Bottom Line

**PRIMARY TRADE**: Long dollar on Iran haven bid + energy supply shock
Duration: 1-5 days. Risk: Trump-Iran deal.

**SECONDARY TRADE**: Long oil volatility on Hormuz closure risk (84% Polymarket)
Duration: 2 weeks. Risk: Iran attack tempo continues falling.
```

---

## Remaining Issues & Future Work

### 1. **WS_RELAY_URL for Yahoo Finance**
- **Issue:** Yahoo Finance direct HTTP still gets 429, relay not configured
- **Solution:** Set up WebSocket relay server for rate limit bypass
- **Priority:** MEDIUM (fallback to cached data works for now)

### 2. **FRED Series IDs**
- **Issue:** Some series returning "No data" (T10Y2Y, DFF, etc.)
- **Solution:** Validate series IDs against current FRED API, update collector
- **Priority:** MEDIUM (macro pulse still works with available data)

### 3. **Economic Calendar Decoding**
- **Issue:** Macro release codes (86, 279, 502, 378, 101) not decoded
- **Solution:** Build mapping from calendar collector to human-readable names
- **Priority:** HIGH (critical for intraday catalyst timing)

### 4. **Polymarket 24h Deltas**
- **Issue:** All markets showing `is_new: true` with null deltas
- **Solution:** Ensure baseline snapshots exist before computing deltas
- **Priority:** HIGH (core alpha signal for divergence detection)

---

## Impact Summary

### Readability: ⬆️⬆️⬆️
- Clear section headers
- Explicit conviction levels
- Transparent about data gaps
- Bottom line summary with trade durations

### Actionability: ⬆️⬆️⬆️
- Specific instruments (VLO, PSX, SMH, XRT, HYG)
- Direction (long/short)
- Invalidation points
- Timeframes (intraday, 1-5 days, 2 weeks)

### Reliability: ⬆️⬆️
- Fallback to cached data on API failures
- Explicit acknowledgment of blind spots
- Stale data age tracking
- Graceful degradation (still produces useful output even with failures)

### Trading Value: ⬆️⬆️⬆️
- Primary/Secondary/Tertiary trade structure
- Cross-asset correlations highlighted
- Divergence signals with conviction levels
- Market catalyst timing with expected impact

---

## Usage

### Morning Brief (8am):
```bash
cd agent && uv run scheduler/brief.py
```

### Intraday Update (during market hours):
```bash
cd agent && uv run scheduler/brief.py
```
(Automatically detects intraday mode and adjusts analysis)

### Collector (hourly overnight):
```bash
npx tsx server/agent/scheduler/collect.ts
```

---

## Conclusion

The briefing agent now delivers **actionable trading intelligence** with:
1. Specific trade ideas with conviction levels
2. Clear invalidation points
3. Intraday mode detection
4. Robust API failure handling
5. Transparent data gap acknowledgment
6. Comprehensive cross-asset analysis

**Next Steps:**
1. Set up WS_RELAY_URL for Yahoo Finance reliability
2. Fix FRED series IDs
3. Decode economic calendar codes for better catalyst timing
4. Ensure Polymarket delta baseline exists

---

*Generated: 2026-03-06*
*Agent Model: claude-sonnet-4-5*
