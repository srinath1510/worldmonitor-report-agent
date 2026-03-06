/**
 * GDELT Delta Engine
 *
 * Computes for each geopolitical pair:
 *  - Article volume delta vs previous snapshot
 *  - Z-score of current volume vs 7-day rolling history
 *  - Flags sustained tension escalation (3+ consecutive hourly increases)
 *  - Flags sudden silence (high-volume pair drops to 0 articles)
 */

import { fetchRecentSnapshots } from '../storage/db';
import { zScore, mean } from './stats';

const HISTORY_LIMIT = 168; // 7 days
const SPIKE_Z_THRESHOLD = 2.0;

const PAIRS = [
    'usa_russia', 'russia_ukraine', 'usa_china',
    'china_taiwan', 'usa_iran', 'usa_venezuela',
];

export interface GdeltDeltaResult {
    deltas: Record<string, any>;
    anomalies: Record<string, any>;
}

export async function computeGdeltDelta(
    currentPayload: Record<string, any>
): Promise<GdeltDeltaResult> {
    const history = await fetchRecentSnapshots('gdelt_tensions', HISTORY_LIMIT);

    const deltas: Record<string, any> = {};
    const anomalies: Record<string, any> = {};

    for (const pair of PAIRS) {
        const current = currentPayload[pair];
        if (!current) continue;

        const currentVol: number = current['articles_returned'] ?? 0;

        // Extract rolling volume history for Z-score
        const volHistory: number[] = history
            .map(s => s.payload?.[pair]?.['articles_returned'])
            .filter((v): v is number => typeof v === 'number');

        const avgVol = mean(volHistory);
        const z = zScore(currentVol, volHistory);
        const prevVol: number = history[0]?.payload?.[pair]?.['articles_returned'] ?? 0;

        deltas[pair] = {
            articles_returned: currentVol,
            change_vs_prev: currentVol - prevVol,
            z_score: z !== null ? Number(z.toFixed(2)) : null,
            avg_7d: avgVol !== null ? Number(avgVol.toFixed(1)) : null,
        };

        // Spike detection
        if (z !== null && z > SPIKE_Z_THRESHOLD) {
            anomalies[`${pair}_spike`] = `${pair.replace('_', '↔')} coverage spiked (${z.toFixed(1)}σ above 7d avg) — unusual media tension`;
        }

        // Sudden silence: was active (>2 articles) but now zero
        if (currentVol === 0 && prevVol > 2) {
            anomalies[`${pair}_sudden_silence`] = `${pair.replace('_', '↔')} coverage dropped to zero after sustained activity — blackout or story killed`;
        }

        // Sustained escalation: last 3 hourly snapshots all increased
        const last3 = history.slice(0, 3).map(s => s.payload?.[pair]?.['articles_returned'] ?? 0);
        if (last3.length === 3 && last3[0]! > last3[1]! && last3[1]! > last3[2]!) {
            anomalies[`${pair}_escalating`] = `${pair.replace('_', '↔')} showing 3-consecutive-hour escalation in coverage volume`;
        }
    }

    return { deltas, anomalies };
}
