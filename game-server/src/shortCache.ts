/**
 * Per-isolate memo for public reads that land on the '!directory' singleton.
 * That one object also approves every room creation, so a flood of
 * unauthenticated directory reads would otherwise starve creates for everyone.
 *
 * Caches the resolved value, never the in-flight promise: Workers cancel
 * continuations that cross request contexts, so a promise shared with a
 * request that gets aborted can hang every other request awaiting it.
 *
 * ponytail: bounds directory load per isolate, not globally - isolates are
 * many. A global ceiling needs the Worker behind a zone with WAF rules.
 */
export function shortCache<T>(ttlMs: number, now: () => number = Date.now) {
    let hit: { at: number; value: T } | undefined
    return async (load: () => Promise<T>): Promise<T> => {
        if (hit && now() - hit.at < ttlMs) return hit.value
        const value = await load()
        hit = { at: now(), value }
        return value
    }
}
