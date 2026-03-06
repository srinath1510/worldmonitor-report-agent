import * as dotenv from 'dotenv';
dotenv.config();

import { collectMarkets } from '../collectors/markets';
import { collectFred } from '../collectors/fred';
import { collectNews } from '../collectors/news';
import { collectGdelt } from '../collectors/gdelt';
import { collectPolymarket } from '../collectors/polymarket';
import { computeCrossDomainAnomalies } from '../delta/cross-domain';

async function runAll() {
    console.log('Starting hourly collection + delta cycle...');

    let newsAlertsCount = 0;

    try {
        await collectMarkets();
    } catch (e: any) {
        console.error(`Error in markets collector: ${e.message}`);
    }

    try {
        await collectGdelt();
    } catch (e: any) {
        console.error(`Error in gdelt collector: ${e.message}`);
    }

    try {
        const newsResult = await collectNews();
        // Pass news alert count downstream to Polymarket delta engine
        newsAlertsCount = newsResult?.deltas?.['total_alerts'] ?? 0;
    } catch (e: any) {
        console.error(`Error in news collector: ${e.message}`);
    }

    try {
        // Pass news alert count so Polymarket delta knows if a move is suspiciously quiet
        await collectPolymarket(newsAlertsCount);
    } catch (e: any) {
        console.error(`Error in polymarket collector: ${e.message}`);
    }

    try {
        await collectFred();
    } catch (e: any) {
        console.error(`Error in fred collector: ${e.message}`);
    }

    // Cross-domain anomaly engine runs last, after all domains have fresh snapshots
    try {
        await computeCrossDomainAnomalies();
    } catch (e: any) {
        console.error(`Error in cross-domain anomaly engine: ${e.message}`);
    }

    console.log('Collection cycle complete.');
    process.exit(0);
}

runAll();
