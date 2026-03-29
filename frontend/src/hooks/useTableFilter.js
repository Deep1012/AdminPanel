import { useMemo } from 'react';
import { useDebounce } from './useDebounce';

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
                const from = new Date(filter.value);
                from.setHours(0, 0, 0, 0);
                result = result.filter(item => {
                    const d = new Date(item[filter.key]);
                    return d >= from;
                });
            } else if (filter.type === 'dateTo') {
                const to = new Date(filter.value);
                to.setHours(23, 59, 59, 999);
                result = result.filter(item => {
                    const d = new Date(item[filter.key]);
                    return d <= to;
                });
            }
        }

        return result;
    }, [data, debouncedSearch, searchFields, filters]);

    return filteredData;
}
