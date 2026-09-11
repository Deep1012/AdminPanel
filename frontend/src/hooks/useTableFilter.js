import { useMemo } from 'react';
import { useDebounce } from './useDebounce';

/**
 * Reduce a date value to the UTC timestamp of midnight on its calendar day.
 *
 * Date-range inputs give us "YYYY-MM-DD", which `new Date()` reads as UTC
 * midnight, while records carry full ISO timestamps (imports are pinned to noon
 * UTC by `parseImportDate`). Comparing those with local-time accessors like
 * `setHours` shifted the effective day boundary by the viewer's UTC offset, so
 * boundary-day records appeared or vanished depending on the browser timezone.
 * Collapsing both sides to a UTC calendar day makes the comparison
 * timezone-independent — same approach as `parseImportDate` in lib/utils.
 *
 * @param {string|number|Date} value
 * @returns {number|null} Epoch ms of UTC midnight, or null if unparseable
 */
function utcDayStart(value) {
    if (value === null || value === undefined || value === '') return null;
    const d = value instanceof Date ? value : new Date(value);
    if (isNaN(d.getTime())) return null;
    return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

/**
 * Client-side table filtering hook.
 *
 * @param {Object} options
 * @param {Array} options.data - Full array of records
 * @param {string} options.searchTerm - Raw search input string
 * @param {string[]} options.searchFields - Field names to text-search against
 * @param {Array} options.filters - Array of { key, value, type: 'exact' | 'dateRange' | 'dateFrom' | 'dateTo' }
 * @returns {Array} Filtered data
 */
export function useTableFilter({ data = [], searchTerm = '', searchFields = [], filters = [] }) {
    const debouncedSearch = useDebounce(searchTerm, 300);

    const filteredData = useMemo(() => {
        let result = data;

        // Text search across multiple fields
        if (debouncedSearch && searchFields.length > 0) {
            const term = debouncedSearch.toLowerCase();
            result = result.filter(item =>
                searchFields.some(field => {
                    const val = item[field];
                    return val && String(val).toLowerCase().includes(term);
                })
            );
        }

        // Apply each filter
        for (const filter of filters) {
            if (!filter.value && filter.value !== 0) continue;

            if (filter.type === 'exact') {
                result = result.filter(item => item[filter.key] === filter.value);
            } else if (filter.type === 'dateFrom') {
                const from = utcDayStart(filter.value);
                if (from === null) continue;
                result = result.filter(item => {
                    const d = utcDayStart(item[filter.key]);
                    return d !== null && d >= from;
                });
            } else if (filter.type === 'dateTo') {
                const to = utcDayStart(filter.value);
                if (to === null) continue;
                result = result.filter(item => {
                    const d = utcDayStart(item[filter.key]);
                    return d !== null && d <= to;
                });
            }
        }

        return result;
    }, [data, debouncedSearch, searchFields, filters]);

    return filteredData;
}
