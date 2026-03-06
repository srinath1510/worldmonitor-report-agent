import { db } from '../storage/db';
import { listMarketQuotes } from '../../worldmonitor/market/v1/list-market-quotes';

export async function collectMarkets() {
    console.log("Collecting Markets data via TS backend...");

    // The symbols correspond to SP500, NDX, Crude Oil, Gold, DXY, and BTC respectively
    const symbols = ['^GSPC', '^IXIC', 'CL=F', 'GC=F', 'DX-Y.NYB', 'BTC-USD'];

    try {
        const response = await listMarketQuotes({} as any, { symbols });

        if (!response || !response.quotes || response.quotes.length === 0) {
            throw new Error("No quotes returned from Yahoo/Finnhub");
        }

        const payload: Record<string, any> = {};
        const deltas: Record<string, any> = {};
        const anomalies: Record<string, any> = {};

        const nameMap: Record<string, string> = {
            '^GSPC': 'SP500',
            '^IXIC': 'NDX',
            'CL=F': 'Crude_Oil',
            'GC=F': 'Gold',
            'DX-Y.NYB': 'DXY',
            'BTC-USD': 'BTC'
        };

        for (const q of response.quotes) {
            const name = nameMap[q.symbol] || q.symbol;
            payload[name] = { price: q.price, date: new Date().toISOString() };
            deltas[name] = { pct_change: Number(q.change.toFixed(2)) };
        }

        // Simplified risk-off signal
        if (deltas['Gold'] && deltas['DXY'] && deltas['SP500']) {
            if (deltas['Gold'].pct_change > 0.5 && deltas['DXY'].pct_change > 0.2 && deltas['SP500'].pct_change < -0.5) {
                anomalies["risk_off_signal"] = true;
            }
        }

        await db.save_snapshot('markets', payload, deltas, anomalies);
        return { payload, deltas, anomalies };
    } catch (error: any) {
        console.error("Failed to collect markets:", error.message);
        const payload = { error: error.message };
        await db.save_snapshot('markets', payload, {}, {});
        return { payload };
    }
}
