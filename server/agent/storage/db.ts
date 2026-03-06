import { createClient, SupabaseClient } from '@supabase/supabase-js';

let _db: SupabaseClient | null = null;
let initialized = false;

function getDb() {
    if (initialized) return _db;
    initialized = true;
    const SUPABASE_URL = process.env.SUPABASE_URL || '';
    const SUPABASE_KEY = process.env.SUPABASE_KEY || '';
    if (SUPABASE_URL && SUPABASE_KEY) {
        _db = createClient(SUPABASE_URL, SUPABASE_KEY);
    } else {
        console.warn("SUPABASE_URL or SUPABASE_KEY not set. TS Collectors will run in dry-run mode.");
    }
    return _db;
}

export const db = {
    save_snapshot: async (domain: string, payload: any, deltas?: any, anomalies?: any) => {
        const client = getDb();
        if (!client) {
            console.log(`[DRY RUN] Would save snapshot for ${domain}`);
            return;
        }

        try {
            const { error } = await client.from('snapshots').insert({
                domain,
                payload,
                deltas: deltas || {},
                anomalies: anomalies || {}
                // collected_at has a default NOW() in the schema
            });

            if (error) {
                console.error(`Error saving snapshot for ${domain}:`, error.message);
            }
        } catch (e) {
            console.error(`Exception saving snapshot for ${domain}:`, e);
        }
    },

    update_daily_context: async (dateStr: string, events: any) => {
        const client = getDb();
        if (!client) {
            console.log(`[DRY RUN] Would save daily context for ${dateStr}`);
            return;
        }

        try {
            const { error } = await client.from('daily_context').upsert({
                date: dateStr,
                events_payload: events
            });
            if (error) {
                console.error(`Error saving daily_context for ${dateStr}:`, error.message);
            }
        } catch (e) {
            console.error(`Exception saving daily_context for ${dateStr}:`, e);
        }
    }
};
