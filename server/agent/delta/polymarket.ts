/**
 * Polymarket Delta Engine
 *
 * Computes for each market:
 *  - Probability delta since last snapshot
 *  - Flags moves > 3% as significant
 *  - Flags moves > 5% with no concurrent news spike → early-warning divergence signal
 *    (the plan's highest-value insight: "what informed money is pricing before headlines")
 */

import { fetchRecentSnapshots } from '../storage/db';

const SIGNIFICANT_MOVE_THRESHOLD = 0.03;   // 3% probability shift
const EARLY_WARNING_THRESHOLD = 0.05;       // 5% with no news = early warning
const HISTORY_LIMIT = 48;                   // 48 hours of snapshots

export interface PolymarketDeltaResult {
    deltas: Record<string, any>;
    anomalies: Record<string, any>;
}

export async function computePolymarketDelta(
    currentPayload: Record<string, any>,
    newsAlertsCount: number  // current news alert count — used for divergence detection
): Promise<PolymarketDeltaResult> {
    const history = await fetchRecentSnapshots('polymarket', HISTORY_LIMIT);

    const deltas: Record<string, any> = {};
    const anomalies: Record<string, any> = {};

    // Use the snapshot from ~24h ago for the "since yesterday" delta
    const yesterdayPayload: Record<string, any> =
        history[23]?.payload ?? history[history.length - 1]?.payload ?? {};

    for (const [title, current] of Object.entries(currentPayload)) {
        const currentProb = typeof current === 'object' ? current['yes_probability'] : null;
        if (typeof currentProb !== 'number') continue;

        const prevEntry = yesterdayPayload[title];
        const prevProb = typeof prevEntry === 'object' ? prevEntry['yes_probability'] : null;

        if (typeof prevProb !== 'number') {
            // New market — mark as recently added
            deltas[title] = { yes_probability: currentProb, delta_24h: null, is_new: true };
            continue;
        }

        const delta24h = currentProb - prevProb;
        deltas[title] = {
            yes_probability: currentProb,
            delta_24h: Number(delta24h.toFixed(3)),
        };

        const absDelta = Math.abs(delta24h);

        if (absDelta >= EARLY_WARNING_THRESHOLD && newsAlertsCount < 3) {
            // Big move in prediction market with quiet news — early-warning signal
            anomalies[`early_warning:${title}`] = {
                market: title,
                delta_24h: Number(delta24h.toFixed(3)),
                direction: delta24h > 0 ? 'probability rising' : 'probability falling',
                note: `${(absDelta * 100).toFixed(1)}% move with low news volume — informed money may be ahead of headlines`,
            };
        } else if (absDelta >= SIGNIFICANT_MOVE_THRESHOLD) {
            anomalies[`significant_move:${title}`] = {
                market: title,
                delta_24h: Number(delta24h.toFixed(3)),
                direction: delta24h > 0 ? 'rising' : 'falling',
            };
        }
    }

    return { deltas, anomalies };
}
