/**
 * News Delta Engine
 *
 * Computes:
 *  - New categories appearing vs prior snapshot (velocity spike detection)
 *  - Alert count delta vs rolling 7-day average
 *  - Z-score of alert rate to flag unusual news volume
 *  - Silence detection: categories that were active yesterday but absent today
 */

import { fetchRecentSnapshots } from '../storage/db';
import { zScore, mean } from './stats';

const HISTORY_LIMIT = 168; // 7 days of hourly snapshots
const ALERT_SPIKE_Z_THRESHOLD = 2.0;

export interface NewsDeltaResult {
    deltas: Record<string, any>;
    anomalies: Record<string, any>;
}

export async function computeNewsDelta(
    currentPayload: Record<string, any>,
    currentDeltas: Record<string, any>
): Promise<NewsDeltaResult> {
    const history = await fetchRecentSnapshots('news', HISTORY_LIMIT);

    const deltas: Record<string, any> = { ...currentDeltas };
    const anomalies: Record<string, any> = {};

    const currentAlerts: number = currentDeltas['total_alerts'] ?? 0;
    const currentTotal: number = currentDeltas['total_major_stories'] ?? 0;

    // Build history of alert counts from past snapshots
    const alertHistory: number[] = history
        .map(s => s.deltas?.['total_alerts'])
        .filter((v): v is number => typeof v === 'number');

    const alertMean = mean(alertHistory);
    const alertZ = zScore(currentAlerts, alertHistory);

    deltas['alert_rate_z_score'] = alertZ !== null ? Number(alertZ.toFixed(2)) : null;
    deltas['alert_7d_mean'] = alertMean !== null ? Number(alertMean.toFixed(1)) : null;

    // Velocity spike: alert count statistically high?
    if (alertZ !== null && alertZ > ALERT_SPIKE_Z_THRESHOLD) {
        anomalies['news_velocity_spike'] =
            `Alert volume (${currentAlerts}) is ${alertZ.toFixed(1)}σ above 7-day average (${alertMean?.toFixed(1)}) — unusual news intensity`;
    }

    // Silence detection: compare active categories with yesterday's snapshot
    const yesterdayPayload = history[23]?.payload ?? history[history.length - 1]?.payload ?? {};
    const currentCategories = new Set(Object.keys(currentPayload));
    const yesterdayCategories = new Set(Object.keys(yesterdayPayload));

    const silentCategories = [...yesterdayCategories].filter(cat => !currentCategories.has(cat));
    const newCategories = [...currentCategories].filter(cat => !yesterdayCategories.has(cat));

    if (silentCategories.length > 0) {
        anomalies['silent_categories'] = {
            categories: silentCategories,
            note: 'These categories had coverage yesterday but are absent today — unusual silence',
        };
    }

    if (newCategories.length > 0) {
        anomalies['emerging_categories'] = {
            categories: newCategories,
            note: 'New coverage categories not seen yesterday',
        };
    }

    deltas['vs_yesterday'] = {
        silent: silentCategories,
        emerging: newCategories,
    };

    return { deltas, anomalies };
}
