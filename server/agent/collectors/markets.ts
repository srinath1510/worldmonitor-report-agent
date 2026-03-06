import { db, fetchRecentSnapshots } from '../storage/db';
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
            console.warn('Yahoo Finance returned no quotes (likely rate limited)');
            // Fallback: fetch from previous snapshot and mark as stale
            const recent = await fetchRecentSnapshots('markets', 1);
            if (recent.length > 0) {
                const prev = recent[0];
                const payload = {
                    ...prev.payload,
                    _stale: true,
                    _stale_reason: 'Yahoo Finance rate limited - using cached data',
                    _stale_age_hours: Math.round((Date.now() - new Date(prev.collected_at).getTime()) / 3600000)
                };
                console.log(`Using cached market data from ${new Date(prev.collected_at).toISOString()}`);
                // Re-run delta with stale flag
                const { deltas, anomalies } = await computeMarketsDelta(payload);
                await db.save_snapshot('markets', payload, deltas, { ...anomalies, data_stale: true });
                return { payload, deltas, anomalies };
            }
            throw new Error('No quotes returned and no cached data available');
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
        console.log('✓ Markets data collected successfully');
        return { payload, deltas, anomalies };
    } catch (error: any) {
        console.error('✗ Failed to collect markets:', error.message);
        await db.save_snapshot('markets', { error: error.message, _failed: true }, {}, {});
        return { payload: { error: error.message } };
    }
}
