import { db } from '../storage/db';
import { getFredSeries } from '../../worldmonitor/economic/v1/get-fred-series';
import { computeMacroDelta } from '../delta/fred';

export async function collectFred() {
    console.log('Collecting FRED data via TS backend...');

    const seriesMap: Record<string, string> = {
        'Yield_Curve_T10Y2Y': 'T10Y2Y',
        'Fed_Funds_Rate': 'DFF',
        'IG_Spread': 'BAMLC0A4CBBB',
        'HY_Spread': 'BAMLH0A0HYM2',
        'M2_Money_Supply': 'WM2NS',
    };

    const payload: Record<string, any> = {};

    for (const [name, seriesId] of Object.entries(seriesMap)) {
        try {
            const res = await getFredSeries({} as any, { seriesId, limit: 2 });
            const obs = res?.series?.observations;
            if (!obs || obs.length < 1) throw new Error(`No data for ${seriesId}`);
            const latest = obs[obs.length - 1]!;
            payload[name] = { value: latest.value, date: latest.date };
        } catch (e: any) {
            console.error(`Failed to fetch FRED ${name} (${seriesId}):`, e.message);
            payload[name] = { error: e.message };
        }
    }

    // Run delta engine: reads history from Supabase, computes changes + anomalies
    const { deltas, anomalies } = await computeMacroDelta(payload);

    await db.save_snapshot('macro_indicators', payload, deltas, anomalies);
    return { payload, deltas, anomalies };
}
