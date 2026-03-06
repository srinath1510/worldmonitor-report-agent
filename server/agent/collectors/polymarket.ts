import { db } from '../storage/db';
import { listPredictionMarkets } from '../../worldmonitor/prediction/v1/list-prediction-markets';
import { computePolymarketDelta } from '../delta/polymarket';

export async function collectPolymarket(newsAlertsCount = 0) {
    console.log('Collecting Polymarket data via TS backend...');

    const payload: Record<string, any> = {};

    try {
        const response = await listPredictionMarkets({} as any, {
            category: 'politics', pageSize: 20,
        } as any);

        if (response?.markets?.length) {
            for (const m of response.markets) {
                payload[m.title] = { yes_probability: m.yesPrice, volume: m.volume };
            }
        } else {
            payload['_status'] = 'No markets returned — likely Cloudflare blocked or empty';
        }
    } catch (error: any) {
        console.error('Failed to fetch Polymarket:', error.message);
        payload['error'] = error.message;
    }

    // Run delta engine: 24h probability shifts, news-divergence early-warning
    const { deltas, anomalies } = await computePolymarketDelta(payload, newsAlertsCount);

    await db.save_snapshot('polymarket', payload, deltas, anomalies);
    return { payload, deltas, anomalies };
}
