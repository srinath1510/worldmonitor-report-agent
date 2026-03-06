/**
 * Markets Delta Engine
 *
 * Computes per-instrument:
 *  - % change since midnight (already in payload.change from Yahoo/Finnhub)
 *  - Z-score vs 30-day rolling history (from past snapshots in Supabase)
 *  - Cross-asset pattern detection:
 *      • Risk-off: Gold↑ + DXY↑ + SP500↓
 *      • Risk-on:  SP500↑ + BTC↑ + Gold↓
 *      • Stagflation: Oil↑ + Gold↑ + SP500↓
 */

import { fetchRecentSnapshots } from '../storage/db';
import { zScore, pctChange, extractHistory } from './stats';

const INSTRUMENTS = ['SP500', 'NDX', 'Crude_Oil', 'Gold', 'DXY', 'BTC'];
// 30-day baseline @ roughly hourly snapshots overnight: use up to 720 rows
const HISTORY_LIMIT = 720;

export interface MarketsDeltaResult {
    deltas: Record<string, any>;
    anomalies: Record<string, any>;
}

export async function computeMarketsDelta(
    currentPayload: Record<string, any>
): Promise<MarketsDeltaResult> {
    // Fetch last 720 snapshots (≈30 days of hourly overnight data)
    const history = await fetchRecentSnapshots('markets', HISTORY_LIMIT);

    const deltas: Record<string, any> = {};
    const anomalies: Record<string, any> = {};

    for (const name of INSTRUMENTS) {
        const current = currentPayload[name];
        if (!current || typeof current.price !== 'number') continue;

        // % change (from the quote's own change field, already computed by WorldMonitor)
        const changeFromQuote = typeof current.change === 'number' ? current.change : null;

        // % change vs previous snapshot (most recent historical row)
        const prevSnapshot = history[0]?.payload?.[name];
        const prevPrice = typeof prevSnapshot?.price === 'number' ? prevSnapshot.price : null;
        const changeVsPrev = prevPrice !== null ? pctChange(current.price, prevPrice) : changeFromQuote;

        // Z-score vs 30-day price history
        const priceHistory = extractHistory(history, name, 'price');
        const z = zScore(current.price, priceHistory);

        deltas[name] = {
            pct_change: changeVsPrev !== null ? Number(changeVsPrev.toFixed(2)) : null,
            z_score: z !== null ? Number(z.toFixed(2)) : null,
            price: current.price,
        };

        // Flag statistically extreme moves
        if (z !== null && Math.abs(z) > 2) {
            anomalies[`${name}_extreme_move`] = {
                z_score: Number(z.toFixed(2)),
                direction: z > 0 ? 'up' : 'down',
            };
        }
    }

    // ---- Cross-asset pattern detection ----
    const g = deltas['Gold']?.pct_change ?? 0;
    const d = deltas['DXY']?.pct_change ?? 0;
    const s = deltas['SP500']?.pct_change ?? 0;
    const o = deltas['Crude_Oil']?.pct_change ?? 0;
    const b = deltas['BTC']?.pct_change ?? 0;

    if (g > 0.5 && d > 0.2 && s < -0.5) {
        anomalies['pattern_risk_off'] = 'Gold↑ + DXY↑ + SP500↓ — classic risk-off flight to safety';
    }
    if (s > 0.5 && b > 1 && g < -0.3) {
        anomalies['pattern_risk_on'] = 'SP500↑ + BTC↑ + Gold↓ — risk appetite expansion';
    }
    if (o > 1 && g > 0.5 && s < -0.3) {
        anomalies['pattern_stagflation'] = 'Oil↑ + Gold↑ + SP500↓ — stagflationary pressure signal';
    }
    if (d > 0.5 && s < -0.5 && g > 0.5) {
        anomalies['pattern_dollar_squeeze'] = 'DXY↑ + SP500↓ + Gold↑ — dollar liquidity squeeze';
    }

    return { deltas, anomalies };
}
