/**
 * Cross-Domain Anomaly Engine
 *
 * Runs AFTER all domain collectors have saved their snapshots.
 * Reads the latest snapshot for each domain and looks for:
 *
 *  1. Silent Divergence: Prediction market moves WITHOUT concurrent news → early-warning
 *  2. Authority Triangulation: Same story appearing in news + GDELT spike + Polymarket move
 *  3. Market-Geopolitical Disconnect: Tension spike but SP500 unmoved (complacency signal)
 *  4. Macro-Market Mismatch: Credit spreads widening while equities rising (divergence)
 *
 * These cross-domain signals are saved to their own 'cross_domain' snapshot row so the
 * synthesizer agent can call `get_anomaly_signals` as a separate tool.
 */

import { fetchRecentSnapshots, db } from '../storage/db';

export async function computeCrossDomainAnomalies(): Promise<void> {
    console.log('Computing cross-domain anomalies...');

    // Fetch the latest snapshot for each domain (just 1 each)
    const [markets, macro, news, polymarket, gdelt] = await Promise.all([
        fetchRecentSnapshots('markets', 1),
        fetchRecentSnapshots('macro_indicators', 1),
        fetchRecentSnapshots('news', 1),
        fetchRecentSnapshots('polymarket', 1),
        fetchRecentSnapshots('gdelt_tensions', 1),
    ]);

    const anomalies: Record<string, any> = {};

    // Helpers to safely read current state
    const marketDeltas = markets[0]?.deltas ?? {};
    const macroPayload = macro[0]?.payload ?? {};
    const macroDeltas = macro[0]?.deltas ?? {};
    const newsDeltas = news[0]?.deltas ?? {};
    const polyAnomalies = polymarket[0]?.anomalies ?? {};
    const gdeltAnomalies = gdelt[0]?.anomalies ?? {};
    const gdeltDeltas = gdelt[0]?.deltas ?? {};

    // ---- 1. Silent Divergence ----
    // Polymarket early-warning keys = prediction market moving without news
    const earlyWarnings = Object.keys(polyAnomalies).filter(k => k.startsWith('early_warning:'));
    if (earlyWarnings.length > 0) {
        anomalies['silent_divergence'] = {
            markets_moving_ahead_of_news: earlyWarnings.map(k => polyAnomalies[k]),
            note: 'Informed money is pricing events that have not yet appeared in news clusters',
        };
    }

    // ---- 2. Authority Triangulation ----
    // Story corroborated by: news spike + GDELT spike + Polymarket move
    const gdeltSpikes = Object.keys(gdeltAnomalies).filter(k => k.endsWith('_spike'));
    const newsSpike = (newsDeltas['alert_rate_z_score'] ?? 0) > 1.5;
    const polyMarketMoves = Object.keys(polyAnomalies).filter(k => k.startsWith('significant_move:') || k.startsWith('early_warning:'));

    if (gdeltSpikes.length > 0 && newsSpike && polyMarketMoves.length > 0) {
        anomalies['authority_triangulation'] = {
            note: 'Three independent signals corroborate a developing situation',
            gdelt_spikes: gdeltSpikes,
            news_alert_z: newsDeltas['alert_rate_z_score'],
            polymarket_moves: polyMarketMoves,
        };
    }

    // ---- 3. Market-Geopolitical Disconnect ----
    // GDELT tension spike but SP500 barely moved — possible complacency
    const sp500Change = marketDeltas['SP500']?.pct_change ?? 0;
    const hasGdeltEscalation = Object.keys(gdeltAnomalies).some(k => k.endsWith('_escalating') || k.endsWith('_spike'));

    if (hasGdeltEscalation && Math.abs(sp500Change) < 0.2) {
        anomalies['geopolitical_market_disconnect'] = {
            note: 'Geopolitical tension escalating while equity markets are unmoved — possible complacency or lag',
            sp500_change_pct: sp500Change,
            active_tension_signals: Object.keys(gdeltAnomalies).filter(k => k.endsWith('_escalating') || k.endsWith('_spike')),
        };
    }

    // ---- 4. Macro-Market Mismatch ----
    // HY spreads widening (credit stress) while SP500 is rising (equity complacency)
    const hySpread = macroPayload['HY_Spread']?.value;
    const hyDelta = macroDeltas['HY_Spread']?.change;

    if (typeof hyDelta === 'number' && hyDelta > 0.1 && sp500Change > 0.3) {
        anomalies['macro_market_mismatch'] = {
            note: 'Credit spreads widening while equities rising — divergence between credit and equity market view',
            hy_spread_change: hyDelta,
            sp500_change_pct: sp500Change,
        };
    }

    // ---- 5. Macro Quiet ----
    // Nothing moved significantly — flag as "Quiet Desk" for synthesizer
    const anyMacroExtreme = Object.keys(macroDeltas).some(k => {
        const d = macroDeltas[k];
        return d?.z_score !== null && Math.abs(d.z_score ?? 0) > 1.5;
    });
    const anyMarketExtreme = Object.keys(marketDeltas).some(k => {
        const d = marketDeltas[k];
        return d?.z_score !== null && Math.abs(d.z_score ?? 0) > 1.5;
    });

    if (!anyMacroExtreme && !anyMarketExtreme && earlyWarnings.length === 0 && gdeltSpikes.length === 0) {
        anomalies['quiet_desk'] = {
            note: 'All domains within normal statistical range — no significant signal detected overnight',
        };
    }

    await db.save_snapshot('cross_domain', {}, {}, anomalies);
    console.log(`Cross-domain anomalies computed: ${Object.keys(anomalies).join(', ') || 'none'}`);
}
