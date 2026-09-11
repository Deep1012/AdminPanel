/**
 * Operator-facing copy and helpers for GET /api/admin/reconcile.
 *
 * Keys mirror the `checks` object built in backend/lib/reconcile.js; each
 * entry there is `{ count, samples }`, where `count` is the full figure and
 * `samples` is capped at the response's `sample_limit`. A key the backend adds
 * later without a matching entry here still renders (as an integrity check
 * with a generic description) rather than disappearing.
 *
 * `expected: true` marks the two availability checks that are known to be
 * non-zero on production data and that the backend's guards run warn-only
 * for (backend/lib/availabilityPolicy.js). They are presented as data-entry
 * gaps, not as integrity failures.
 */

export const RECONCILE_CHECKS = [
    {
        key: 'purchase_sheets_used_drift',
        label: 'Raw material sheets-used drift',
        description: "A purchase's stored sheets used does not match the total drawn by the printing jobs that reference it, so Raw Material Stock shows the wrong availability for these lots.",
    },
    {
        key: 'negative_sheets_available',
        label: 'Raw material sheets below zero',
        description: 'More sheets have been drawn from these purchase lots than the lot contained.',
    },
    {
        key: 'orphan_printing_jobs',
        label: 'Printing jobs with a missing raw material',
        description: 'Printing jobs that point at a purchase which no longer exists. Deleting a referenced purchase is blocked, so any count here means something bypassed that guard.',
    },
    {
        key: 'po_quantity_dispatched_drift',
        label: 'PO dispatched-quantity drift',
        description: "A purchase order's stored quantity dispatched does not match the sum of the dispatches linked to it, so its pending quantity is wrong.",
    },
    {
        key: 'negative_po_remaining',
        label: 'Over-dispatched purchase orders',
        description: 'More has been recorded as dispatched against these purchase orders than they ordered.',
    },
    {
        key: 'dangling_dispatch_po_refs',
        label: 'Dispatches linked to a deleted PO',
        description: 'Dispatch lines that still reference a purchase order which no longer exists. Deleting a PO should unlink its dispatches.',
    },
    {
        key: 'orphan_production_children',
        label: 'Orphaned cascade production entries',
        description: 'Auto-created BOTTOM / TOP / LID (or LWBF) production entries whose parent entry no longer exists. Deleting a parent should remove its children.',
    },
    {
        key: 'duplicate_purchase_sr_no',
        label: 'Duplicate purchase Sr. No.',
        description: 'Two or more purchases share a serial number. Nothing in the database prevents this, and an older number generator could repeat numbers once a collection passed 999 rows.',
    },
    {
        key: 'duplicate_printing_job_number',
        label: 'Duplicate printing job numbers',
        description: 'Two or more printing jobs share a job number, for the same reason as duplicate purchase serial numbers.',
    },
    {
        key: 'duplicate_dispatch_order_number',
        label: 'Duplicate dispatch order numbers',
        description: 'Two or more dispatches share an order number, for the same reason as duplicate purchase serial numbers.',
    },
    {
        key: 'negative_printing_stock_available',
        label: 'Printing stock below zero',
        description: 'Brand / size pairs where production has used more printing stock than printing jobs have recorded (Printing Done minus Used in Production is negative). Most are primary brands with no printing jobs entered at all.',
        expected: true,
    },
    {
        key: 'negative_finished_goods_available',
        label: 'Finished goods below zero',
        description: 'Brand / size pairs where more has been dispatched than production has recorded (Quantity Produced minus Quantity Dispatched is negative), typically stock that was dispatched before it was entered into the system.',
        expected: true,
    },
];

export const SCANNED_LABELS = {
    purchases: 'Purchases',
    printing_jobs: 'Printing jobs',
    production: 'Production',
    dispatches: 'Dispatches',
    purchase_orders: 'Purchase orders',
};

const humanise = (key) => key.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());

const toCount = (value) => (Number.isFinite(value) ? value : 0);

/**
 * Split a report's `checks` into integrity checks and expected data-entry
 * gaps, each entry carrying its copy plus `count` and `samples`.
 *
 * Known checks come first in `RECONCILE_CHECKS` order; unknown keys follow.
 *
 * @param {Record<string, {count: number, samples: Array<object>}>} [checks]
 * @returns {{ integrity: Array<object>, gaps: Array<object> }}
 */
export function groupChecks(checks) {
    const source = checks && typeof checks === 'object' ? checks : {};
    const known = new Set(RECONCILE_CHECKS.map((c) => c.key));

    const withResult = (meta) => {
        const result = source[meta.key] || {};
        return {
            ...meta,
            expected: Boolean(meta.expected),
            count: toCount(result.count),
            samples: Array.isArray(result.samples) ? result.samples : [],
        };
    };

    const described = RECONCILE_CHECKS.filter((meta) => meta.key in source).map(withResult);
    const undescribed = Object.keys(source)
        .filter((key) => !known.has(key))
        .map((key) => withResult({
            key,
            label: humanise(key),
            description: 'No description is available for this check yet.',
        }));

    const all = [...described, ...undescribed];
    return {
        integrity: all.filter((c) => !c.expected),
        gaps: all.filter((c) => c.expected),
    };
}

/** Sum of `count` across a list of grouped checks. */
export const totalCount = (list) => list.reduce((sum, c) => sum + c.count, 0);

/**
 * Column keys for a sample table: the union of every row's keys, in the order
 * they are first seen, so rows of one check with optional fields still line up.
 *
 * @param {Array<object>} samples
 * @returns {string[]}
 */
export function sampleColumns(samples) {
    const seen = [];
    for (const row of samples || []) {
        for (const key of Object.keys(row || {})) {
            if (!seen.includes(key)) seen.push(key);
        }
    }
    return seen;
}

/**
 * Display text for one sample cell. Arrays (duplicate ids) are joined,
 * numbers use the Indian grouping the rest of the app shows.
 *
 * @param {unknown} value
 * @returns {string}
 */
export function formatSampleValue(value) {
    if (value === null || value === undefined || value === '') return '-';
    if (Array.isArray(value)) return value.length ? value.join(', ') : '-';
    if (typeof value === 'number') return new Intl.NumberFormat('en-IN').format(value);
    if (typeof value === 'object') return JSON.stringify(value);
    return String(value);
}
