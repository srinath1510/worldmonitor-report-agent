import { db } from '../storage/db';
import { searchGdeltDocuments } from '../../worldmonitor/intelligence/v1/search-gdelt-documents';

export async function collectGdelt() {
    console.log("Collecting GDELT data via TS backend...");

    const pairs = {
        "usa_russia": "united states AND russia",
        "russia_ukraine": "russia AND ukraine",
        "usa_china": "united states AND china",
        "china_taiwan": "china AND taiwan",
        "usa_iran": "united states AND iran",
        "usa_venezuela": "united states AND venezuela"
    };

    const payload: Record<string, any> = {};
    const deltas: Record<string, any> = {};
    const anomalies: Record<string, any> = {};

    for (const [pairName, query] of Object.entries(pairs)) {
        try {
            const resp24h = await searchGdeltDocuments({} as any, { query, timespan: '24h', maxRecords: 1, sort: 'date' } as any);

            const articles = resp24h?.articles || [];
            const volume = articles.length; // The true volume comes from TimelineVolInfo in Python, but here we can just count articles returned or mock volume based on hits if we hit the limit

            // As searchGdeltDocuments returns artlist, not timeline, we can record the top article or number of articles
            payload[pairName] = {
                top_article: articles[0]?.title || null,
                articles_returned: volume
            };

            // We will skip strict volume deltas for now as the TS backend is tuned for article fetching, not volume graphs. We can revisit true volume later.
            deltas[pairName] = { volume_change: 0, change_pct: 0 };
        } catch (e: any) {
            console.error(`Failed to fetch GDELT for ${pairName}:`, e.message);
            payload[pairName] = { error: e.message };
        }
    }

    await db.save_snapshot('gdelt_tensions', payload, deltas, anomalies);
    return { payload, deltas, anomalies };
}
