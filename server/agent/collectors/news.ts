import { db } from '../storage/db';
import { listFeedDigest } from '../../worldmonitor/news/v1/list-feed-digest';
import { computeNewsDelta } from '../delta/news';

export async function collectNews() {
    console.log('Collecting News clusters via TS backend...');

    try {
        const response = await listFeedDigest({} as any, { variant: 'full', lang: 'en' });

        if (!response?.categories) {
            throw new Error('No news categories returned');
        }

        const payload: Record<string, any> = {};
        let totalStories = 0;
        let alertsCount = 0;

        for (const [catName, bucket] of Object.entries(response.categories)) {
            if (!bucket?.items) continue;
            const items = bucket.items.slice(0, 5);
            payload[catName] = items.map((i: any) => ({
                title: i.title,
                source: i.source,
                isAlert: i.isAlert,
                threatLevel: i.threat?.level,
                publishedAt: i.publishedAt,
            }));
            totalStories += items.length;
            alertsCount += items.filter((i: any) => i.isAlert).length;
        }

        const baseDeltas = {
            total_major_stories: totalStories,
            total_alerts: alertsCount,
        };

        // Run delta engine: computes Z-scores against 7d history, detects silence/velocity
        const { deltas, anomalies } = await computeNewsDelta(payload, baseDeltas);

        await db.save_snapshot('news', payload, deltas, anomalies);
        return { payload, deltas, anomalies };
    } catch (error: any) {
        console.error('Failed to collect news:', error.message);
        await db.save_snapshot('news', { error: error.message }, {}, {});
        return { payload: { error: error.message } };
    }
}
