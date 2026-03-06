import { db } from '../storage/db';
import { searchGdeltDocuments } from '../../worldmonitor/intelligence/v1/search-gdelt-documents';
import { computeGdeltDelta } from '../delta/gdelt';

export async function collectGdelt() {
    console.log('Collecting GDELT data via TS backend...');

    const pairs = {
        usa_russia: 'united states AND russia',
        russia_ukraine: 'russia AND ukraine',
        usa_china: 'united states AND china',
        china_taiwan: 'china AND taiwan',
        usa_iran: 'united states AND iran',
        usa_venezuela: 'united states AND venezuela',
    };

    const payload: Record<string, any> = {};

    for (const [pairName, query] of Object.entries(pairs)) {
        try {
            const resp = await searchGdeltDocuments({} as any, {
                query, timespan: '24h', maxRecords: 10, sort: 'date',
            } as any);
            const articles = resp?.articles ?? [];
            payload[pairName] = {
                top_article: articles[0]?.title ?? null,
                articles_returned: articles.length,
                sources: [...new Set(articles.map((a: any) => a.source))].slice(0, 5),
            };
        } catch (e: any) {
            console.error(`Failed to fetch GDELT for ${pairName}:`, e.message);
            payload[pairName] = { error: e.message, articles_returned: 0 };
        }
    }

    // Run delta engine: Z-scores, escalation detection, silence flags
    const { deltas, anomalies } = await computeGdeltDelta(payload);

    await db.save_snapshot('gdelt_tensions', payload, deltas, anomalies);
    return { payload, deltas, anomalies };
}
