import * as dotenv from 'dotenv';
dotenv.config();

import { collectMarkets } from '../collectors/markets';
import { collectFred } from '../collectors/fred';
import { collectNews } from '../collectors/news';
import { collectGdelt } from '../collectors/gdelt';
import { collectPolymarket } from '../collectors/polymarket';

async function runAll() {
    console.log("Starting hourly collection cycle via TS shared runtime...");

    try {
        await collectMarkets();
    } catch (e: any) {
        console.error(`Error running markets collector: ${e.message}`);
    }

    try {
        await collectGdelt();
    } catch (e: any) {
        console.error(`Error running gdelt collector: ${e.message}`);
    }

    try {
        await collectNews();
    } catch (e: any) {
        console.error(`Error running news collector: ${e.message}`);
    }

    try {
        await collectPolymarket();
    } catch (e: any) {
        console.error(`Error running polymarket collector: ${e.message}`);
    }

    try {
        await collectFred();
    } catch (e: any) {
        console.error(`Error running fred collector: ${e.message}`);
    }

    console.log("Collection cycle complete.");
    process.exit(0);
}

runAll();
