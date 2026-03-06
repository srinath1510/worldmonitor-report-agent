import { db, fetchRecentSnapshots } from '../storage/db';
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
    let rateLimitCount = 0;

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
            if (e.message?.includes('429')) {
                rateLimitCount++;
            }
            console.error(`Failed to fetch GDELT for ${pairName}:`, e.message);
            payload[pairName] = { error: e.message, articles_returned: 0 };
        }
    }

    // If all pairs failed due to rate limiting, use cached data
    if (rateLimitCount === Object.keys(pairs).length) {
        console.warn('GDELT rate limited on all pairs - attempting fallback to cached data');
        const recent = await fetchRecentSnapshots('gdelt_tensions', 1);
        if (recent.length > 0) {
            const prev = recent[0];
            const cachedPayload = {
                ...prev.payload,
                _stale: true,
                _stale_reason: 'GDELT rate limited - using cached data',
                _stale_age_hours: Math.round((Date.now() - new Date(prev.collected_at).getTime()) / 3600000)
            };
            console.log(`Using cached GDELT data from ${new Date(prev.collected_at).toISOString()}`);
            const { deltas, anomalies } = await computeGdeltDelta(cachedPayload);
            await db.save_snapshot('gdelt_tensions', cachedPayload, deltas, { ...anomalies, data_stale: true });
            return { payload: cachedPayload, deltas, anomalies };
        }
    }

    // Run delta engine: Z-scores, escalation detection, silence flags
    const { deltas, anomalies } = await computeGdeltDelta(payload);

    await db.save_snapshot('gdelt_tensions', payload, deltas, anomalies);
    console.log(`✓ GDELT data collected (${Object.keys(pairs).length - rateLimitCount}/${Object.keys(pairs).length} pairs successful)`);
    return { payload, deltas, anomalies };
}
