/**
 * Statistical helpers for the Delta Engine.
 * Used across all domain-specific delta modules.
 */

/** Compute mean of a number array. Returns null if empty. */
export function mean(values: number[]): number | null {
    if (values.length === 0) return null;
    return values.reduce((sum, v) => sum + v, 0) / values.length;
}

/** Compute standard deviation (population). Returns null if fewer than 2 values. */
export function stdDev(values: number[]): number | null {
    if (values.length < 2) return null;
    const m = mean(values)!;
    const variance = values.reduce((sum, v) => sum + Math.pow(v - m, 2), 0) / values.length;
    return Math.sqrt(variance);
}

/**
 * Z-score of `value` against a distribution defined by `history`.
 * Returns null if stdDev is 0 (constant series) or history is too short.
 */
export function zScore(value: number, history: number[]): number | null {
    if (history.length < 3) return null;
    const m = mean(history)!;
    const s = stdDev(history);
    if (!s || s === 0) return null;
    return (value - m) / s;
}

/**
 * Percent change from `prev` to `current`. Returns null if prev is 0.
 */
export function pctChange(current: number, prev: number): number | null {
    if (prev === 0) return null;
    return ((current - prev) / Math.abs(prev)) * 100;
}

/**
 * Given a list of snapshots (newest first), extract the history of a numeric
 * field at `payloadKey` for statistical analysis.
 */
export function extractHistory(snapshots: any[], payloadKey: string, field = 'price'): number[] {
    return snapshots
        .map(s => {
            const item = s.payload?.[payloadKey];
            const val = item?.[field] ?? item?.value ?? item;
            return typeof val === 'number' ? val : null;
        })
        .filter((v): v is number => v !== null);
}
