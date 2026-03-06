import { db } from '../storage/db';
import { listFeedDigest } from '../../worldmonitor/news/v1/list-feed-digest';

export async function collectNews() {
    console.log("Collecting News clusters via TS backend...");

    const payload: Record<string, any> = {};
    const deltas: Record<string, any> = {};
    const anomalies: Record<string, any> = {};

    try {
        const response = await listFeedDigest({} as any, { variant: 'full', lang: 'en' });

        if (!response || !response.categories) {
            throw new Error("No news categories returned");
        }

        let topStoriesCount = 0;
        let alertsCount = 0;

        for (const [catName, bucket] of Object.entries(response.categories)) {
            if (!bucket || !bucket.items) continue;

            const items = bucket.items.slice(0, 3); // top 3 per category

            payload[catName] = items.map((i: any) => ({
                title: i.title,
                source: i.source,
                isAlert: i.isAlert,
                threatLevel: i.threat?.level
            }));

            topStoriesCount += items.length;
            alertsCount += items.filter((i: any) => i.isAlert).length;
        }

        deltas['total_major_stories'] = topStoriesCount;
        deltas['total_alerts'] = alertsCount;

        if (alertsCount >= 3) {
            anomalies["high_alert_volume"] = `Unusual amount of high threat alerts (${alertsCount})`;
        }

        await db.save_snapshot('news', payload, deltas, anomalies);
        return { payload, deltas, anomalies };
    } catch (error: any) {
        console.error("Failed to collect news:", error.message);
        const payload = { error: error.message };
        await db.save_snapshot('news', payload, {}, {});
        return { payload };
    }
}
