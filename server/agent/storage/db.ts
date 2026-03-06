import { createClient, SupabaseClient } from '@supabase/supabase-js';

let _db: SupabaseClient | null = null;
let initialized = false;

function getDb(): SupabaseClient | null {
    if (initialized) return _db;
    initialized = true;
    const SUPABASE_URL = process.env.SUPABASE_URL || '';
    const SUPABASE_KEY = process.env.SUPABASE_KEY || '';
    if (SUPABASE_URL && SUPABASE_KEY) {
        _db = createClient(SUPABASE_URL, SUPABASE_KEY);
    } else {
        console.warn('SUPABASE_URL or SUPABASE_KEY not set. TS Collectors will run in dry-run mode.');
    }
    return _db;
}

/** Fetch the N most recent snapshots for a domain, ordered newest first. */
export async function fetchRecentSnapshots(domain: string, limit: number): Promise<any[]> {
    const client = getDb();
    if (!client) return [];

    const { data, error } = await client
        .from('snapshots')
        .select('collected_at, payload, deltas, anomalies')
        .eq('domain', domain)
        .order('collected_at', { ascending: false })
        .limit(limit);

    if (error) {
        console.error(`Error fetching snapshots for ${domain}:`, error.message);
        return [];
    }
    return data || [];
}

export const db = {
    save_snapshot: async (domain: string, payload: any, deltas?: any, anomalies?: any) => {
        const client = getDb();
        if (!client) {
            console.log(`[DRY RUN] Would save snapshot for ${domain}: payload keys=[${Object.keys(payload).join(', ')}]`);
            return;
        }

        try {
            const { error } = await client.from('snapshots').insert({
                domain,
                payload,
                deltas: deltas || {},
                anomalies: anomalies || {},
            });

            if (error) {
                console.error(`Error saving snapshot for ${domain}:`, error.message);
            } else {
                console.log(`Saved snapshot for domain="${domain}"`);
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
                events_payload: events,
            });
            if (error) {
                console.error(`Error saving daily_context for ${dateStr}:`, error.message);
            }
        } catch (e) {
            console.error(`Exception saving daily_context for ${dateStr}:`, e);
        }
    },
};
