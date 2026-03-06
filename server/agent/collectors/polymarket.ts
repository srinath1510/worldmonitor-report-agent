import { db } from '../storage/db';
import { listPredictionMarkets } from '../../worldmonitor/prediction/v1/list-prediction-markets';

export async function collectPolymarket() {
    console.log("Collecting Polymarket data via TS backend...");

    const payload: Record<string, any> = {};
    const deltas: Record<string, any> = {};
    const anomalies: Record<string, any> = {};

    try {
        // Top geopolitics tag query from prediction markets
        const response = await listPredictionMarkets({} as any, { category: 'politics', pageSize: 10 } as any);

        if (response && response.markets) {
            for (const m of response.markets) {
                payload[m.title] = { yes_probability: m.yesPrice };
            }
        } else {
            payload["error"] = "No markets returned. Likely Cloudflare blocked or empty.";
        }

    } catch (error: any) {
        console.error("Failed to fetch Polymarket:", error.message);
        payload["error"] = error.message;
    }

    await db.save_snapshot('polymarket', payload, deltas, anomalies);
    return { payload, deltas, anomalies };
}
