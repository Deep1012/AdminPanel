import { useState, useMemo } from 'react';

/**
 * Client-side table sorting hook.
 *
 * @param {Object} options
 * @param {Array} options.data - Filtered data array
 * @param {string} [options.defaultSortKey] - Default column key to sort by
 * @param {'asc'|'desc'} [options.defaultSortDir='desc'] - Default sort direction
 * @returns {{ sortedData, sortKey, sortDir, requestSort }}
 */
export function useTableSort({ data = [], defaultSortKey = null, defaultSortDir = 'desc' }) {
    const [sortKey, setSortKey] = useState(defaultSortKey);
    const [sortDir, setSortDir] = useState(defaultSortDir);

    const requestSort = (key) => {
        if (sortKey === key) {
            setSortDir(prev => prev === 'asc' ? 'desc' : 'asc');
        } else {
            setSortKey(key);
            setSortDir('desc');
        }
    };

    const sortedData = useMemo(() => {
        if (!sortKey) return data;

        return [...data].sort((a, b) => {
            let aVal = a[sortKey];
            let bVal = b[sortKey];

            // Handle null/undefined
            if (aVal == null && bVal == null) return 0;
            if (aVal == null) return 1;
            if (bVal == null) return -1;

            // Numeric comparison
            if (typeof aVal === 'number' && typeof bVal === 'number') {
                return sortDir === 'asc' ? aVal - bVal : bVal - aVal;
            }

            // Date string comparison (ISO or date-like)
            const aDate = new Date(aVal);
            const bDate = new Date(bVal);
            if (!isNaN(aDate.getTime()) && !isNaN(bDate.getTime()) && typeof aVal === 'string' && aVal.includes('-')) {
                return sortDir === 'asc' ? aDate - bDate : bDate - aDate;
            }

            // String comparison
            const aStr = String(aVal).toLowerCase();
            const bStr = String(bVal).toLowerCase();
            if (aStr < bStr) return sortDir === 'asc' ? -1 : 1;
            if (aStr > bStr) return sortDir === 'asc' ? 1 : -1;
            return 0;
        });
    }, [data, sortKey, sortDir]);

    return { sortedData, sortKey, sortDir, requestSort };
}
