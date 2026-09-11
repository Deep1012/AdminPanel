/**
 * Tiny in-memory TTL cache for near-static reference reads.
 *
 * WHY: brands, sizes, customers and menu items are configuration, not
 * operational data. Every page that offers a brand or size picker refetches
 * them on mount, and `Layout` refetched the menu on every navigation, so a
 * click from Purchase to Production issued four requests for data that had not
 * changed. The payloads are small; the cost is latency and request count, not
 * bytes.
 *
 * SCOPE, DELIBERATE: this is a browser module-level Map, so it lives exactly as
 * long as the page does. A reload starts cold; nothing is shared between tabs
 * or users. That is the correct lifetime for per-session reference data and the
 * reason this is not a serverless-safe pattern being smuggled into the client —
 * there is one page load per cache.
 *
 * CORRECTNESS IS ENFORCED BY INVALIDATION, NOT BY THE TTL. The 60s window only
 * bounds how stale a *third party's* edit can be. The user's own mutations drop
 * the affected key synchronously (see `lib/api.js`), because an admin who
 * renames a brand and does not see the rename will conclude the save failed.
 *
 * IN-FLIGHT DEDUPLICATION comes for free: the promise is cached, not the
 * resolved value. `Production` fires brands and sizes inside one `Promise.all`
 * while `Layout` is still mounting; caching the promise collapses those into a
 * single request instead of racing three.
 */

export const DEFAULT_TTL_MS = 60_000;

/** key -> { expires: number, promise: Promise } */
const entries = new Map();

/**
 * Read through the cache.
 *
 * @param {string} key Cache key, one per endpoint.
 * @param {() => Promise} loader Called only on a miss.
 * @param {number} [ttlMs] Freshness window in milliseconds.
 * @returns {Promise} The cached or freshly issued request.
 */
export function cachedRead(key, loader, ttlMs = DEFAULT_TTL_MS) {
    const now = Date.now();
    const hit = entries.get(key);
    if (hit && hit.expires > now) return hit.promise;

    // A rejected request must not be remembered, or one network blip would
    // wedge the key for the whole TTL. Drop it and let the next caller retry.
    const promise = loader().catch((err) => {
        const current = entries.get(key);
        if (current && current.promise === promise) entries.delete(key);
        throw err;
    });

    entries.set(key, { expires: now + ttlMs, promise });
    return promise;
}

/**
 * Drop one or more keys. Call from every mutation that can change them.
 * @param {...string} keys
 */
export function invalidate(...keys) {
    for (const key of keys) entries.delete(key);
}

/** Drop everything. Used by logout and by bulk admin operations. */
export function invalidateAll() {
    entries.clear();
}

/**
 * Run a mutation and drop the given keys whether it succeeds or fails.
 *
 * Invalidating on failure too is intentional: a request that errored may still
 * have been applied server-side (a timeout on a write that committed), so the
 * cached copy can no longer be trusted either way.
 *
 * @param {() => Promise} mutate
 * @param {string[]} keys
 */
export function mutating(mutate, keys) {
    return mutate().finally(() => invalidate(...keys));
}

/** Cache keys, one per cached endpoint. */
export const CACHE_KEYS = Object.freeze({
    brands: 'brands',
    sizes: 'sizes',
    customers: 'customers',
    menuItems: 'menu-items',
});
