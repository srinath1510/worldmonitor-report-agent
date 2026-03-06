import { db } from '../storage/db';
import { listMarketQuotes } from '../../worldmonitor/market/v1/list-market-quotes';
import { computeMarketsDelta } from '../delta/markets';

export async function collectMarkets() {
    console.log('Collecting Markets data via TS backend...');

    const symbols = ['^GSPC', '^IXIC', 'CL=F', 'GC=F', 'DX-Y.NYB', 'BTC-USD'];
    const nameMap: Record<string, string> = {
        '^GSPC': 'SP500', '^IXIC': 'NDX', 'CL=F': 'Crude_Oil',
        'GC=F': 'Gold', 'DX-Y.NYB': 'DXY', 'BTC-USD': 'BTC',
    };

    try {
        const response = await listMarketQuotes({} as any, { symbols });

        if (!response?.quotes?.length) {
            throw new Error('No quotes returned from Yahoo/Finnhub');
        }

        const payload: Record<string, any> = {};
        for (const q of response.quotes) {
            const name = nameMap[q.symbol] || q.symbol;
            // Stash the raw change from the quote provider too, for delta engine fallback
            payload[name] = { price: q.price, change: q.change, date: new Date().toISOString() };
        }

        // Run delta engine: computes Z-scores, cross-asset patterns vs 30d history
        const { deltas, anomalies } = await computeMarketsDelta(payload);

        await db.save_snapshot('markets', payload, deltas, anomalies);
        return { payload, deltas, anomalies };
    } catch (error: any) {
        console.error('Failed to collect markets:', error.message);
        await db.save_snapshot('markets', { error: error.message }, {}, {});
        return { payload: { error: error.message } };
    }
}
