/**
 * FRED / Macro Delta Engine
 *
 * Computes for each indicator:
 *  - Absolute change (rates/spreads) or % change (M2) vs previous snapshot
 *  - Z-score vs rolling history
 *  - Named anomaly conditions:
 *      • HY spread spike > 0.2bps in a single session
 *      • Yield curve sign flip (inversion/un-inversion)
 *      • Credit spread divergence (HY moves while IG stays flat → idiosyncratic risk)
 */

import { fetchRecentSnapshots } from '../storage/db';
import { zScore, pctChange, extractHistory } from './stats';

const SERIES = ['Yield_Curve_T10Y2Y', 'Fed_Funds_Rate', 'IG_Spread', 'HY_Spread', 'M2_Money_Supply'];
const HISTORY_LIMIT = 720; // ~30 days hourly

export interface MacroDeltaResult {
    deltas: Record<string, any>;
    anomalies: Record<string, any>;
}

export async function computeMacroDelta(
    currentPayload: Record<string, any>
): Promise<MacroDeltaResult> {
    const history = await fetchRecentSnapshots('macro_indicators', HISTORY_LIMIT);

    const deltas: Record<string, any> = {};
    const anomalies: Record<string, any> = {};

    for (const name of SERIES) {
        const current = currentPayload[name];
        if (!current || typeof current.value !== 'number') continue;

        const prevSnapshot = history[0]?.payload?.[name];
        const prevValue = typeof prevSnapshot?.value === 'number' ? prevSnapshot.value : null;

        let change: number | null = null;
        if (prevValue !== null) {
            change = name === 'M2_Money_Supply'
                ? pctChange(current.value, prevValue)
                : current.value - prevValue;
        }

        // Z-score over history
        const valueHistory = extractHistory(history, name, 'value');
        const z = zScore(current.value, valueHistory);

        deltas[name] = {
            value: current.value,
            change: change !== null ? Number(change.toFixed(4)) : null,
            z_score: z !== null ? Number(z.toFixed(2)) : null,
        };

        if (z !== null && Math.abs(z) > 2) {
            anomalies[`${name}_extreme`] = {
                z_score: Number(z.toFixed(2)),
                direction: z > 0 ? 'elevated' : 'depressed',
            };
        }
    }

    // --- Named macro anomalies ---
    const hy = currentPayload['HY_Spread']?.value;
    const ig = currentPayload['IG_Spread']?.value;
    const yc = currentPayload['Yield_Curve_T10Y2Y']?.value;

    const prevHy = history[0]?.payload?.['HY_Spread']?.value;
    const prevYc = history[0]?.payload?.['Yield_Curve_T10Y2Y']?.value;
    const prevIg = history[0]?.payload?.['IG_Spread']?.value;

    if (typeof hy === 'number' && typeof prevHy === 'number' && (hy - prevHy) > 0.2) {
        anomalies['hy_credit_stress'] = `HY spread spiked +${(hy - prevHy).toFixed(2)}bps — stress in leveraged credit`;
    }

    if (typeof yc === 'number' && typeof prevYc === 'number') {
        if (yc > 0 && prevYc < 0) {
            anomalies['yield_curve_uninverted'] = `Yield curve just un-inverted (${prevYc.toFixed(2)} → ${yc.toFixed(2)}) — often precedes recession confirmation`;
        }
        if (yc < 0 && prevYc > 0) {
            anomalies['yield_curve_inverted'] = `Yield curve just inverted (${prevYc.toFixed(2)} → ${yc.toFixed(2)})`;
        }
    }

    // HY-IG divergence: HY running hot while IG is flat → idiosyncratic/lower-quality stress
    if (typeof hy === 'number' && typeof ig === 'number' &&
        typeof prevHy === 'number' && typeof prevIg === 'number') {
        const hyMove = Math.abs(hy - prevHy);
        const igMove = Math.abs(ig - prevIg);
        if (hyMove > 0.15 && igMove < 0.05) {
            anomalies['hy_ig_divergence'] = 'HY spreads moving while IG stays flat — idiosyncratic / lower-quality stress, not systemic';
        }
    }

    return { deltas, anomalies };
}
