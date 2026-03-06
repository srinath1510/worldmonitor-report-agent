import { db } from '../storage/db';
import { getFredSeries } from '../../worldmonitor/economic/v1/get-fred-series';

export async function collectFred() {
    console.log("Collecting FRED data via TS backend...");

    const seriesMap: Record<string, string> = {
        "Yield_Curve_T10Y2Y": "T10Y2Y",
        "Fed_Funds_Rate": "DFF",
        "IG_Spread": "BAMLC0A4CBBB",
        "HY_Spread": "BAMLH0A0HYM2",
        "M2_Money_Supply": "WM2NS"
    };

    const payload: Record<string, any> = {};
    const deltas: Record<string, any> = {};
    const anomalies: Record<string, any> = {};

    for (const [name, seriesId] of Object.entries(seriesMap)) {
        try {
            // 2 data points: latest, previous
            const res = await getFredSeries({} as any, { seriesId, limit: 2 });
            if (!res?.series?.observations || res.series.observations.length < 2) {
                throw new Error(`Insufficient data for ${seriesId}`);
            }

            // the backend typically sorts oldest first or newest first, let's verify
            const obs = res.series.observations;
            const latest = obs[obs.length - 1];
            const prev = obs[obs.length - 2];

            payload[name] = { value: latest.value, date: latest.date };

            if (name === "M2_Money_Supply") {
                const change = ((latest.value - prev.value) / Math.max(1, prev.value)) * 100;
                deltas[name] = { pct_change: Number(change.toFixed(4)) };
            } else {
                const change = latest.value - prev.value;
                deltas[name] = { absolute_change: Number(change.toFixed(4)) };
            }

            if (name === "HY_Spread" && (latest.value - prev.value) > 0.2) {
                anomalies["hy_credit_stress"] = "High Yield spread spiked significantly.";
            }

            if (name === "Yield_Curve_T10Y2Y" && latest.value > 0 && prev.value < 0) {
                anomalies["yield_curve_uninverted"] = "Yield curve has potentially un-inverted.";
            }
        } catch (e: any) {
            console.error(`Failed to fetch FRED ${name} (${seriesId}):`, e.message);
            payload[name] = { error: e.message };
        }
    }

    await db.save_snapshot('macro_indicators', payload, deltas, anomalies);
    return { payload, deltas, anomalies };
}
