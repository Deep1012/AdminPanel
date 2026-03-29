import { useState, useMemo } from 'react';

const DEFAULT_PAGE_SIZE = 10;
const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];

/**
 * Client-side pagination hook.
 *
 * @param {Object} options
 * @param {Array} options.data - Full filtered data array
 * @param {number} [options.initialPageSize=10] - Initial rows per page
 * @returns {{ paginatedData, currentPage, totalPages, pageSize, setCurrentPage, setPageSize, PAGE_SIZE_OPTIONS, startIndex }}
 */
export function usePagination({ data = [], initialPageSize = DEFAULT_PAGE_SIZE }) {
    const [currentPage, setCurrentPage] = useState(1);
    const [pageSize, setPageSizeState] = useState(initialPageSize);

    const totalPages = Math.max(1, Math.ceil(data.length / pageSize));

    // Reset to page 1 when data changes or page would be out of bounds
    const safePage = currentPage > totalPages ? 1 : currentPage;

    const startIndex = (safePage - 1) * pageSize;

    const paginatedData = useMemo(() => {
        return data.slice(startIndex, startIndex + pageSize);
    }, [data, startIndex, pageSize]);

    const setPageSize = (newSize) => {
        setPageSizeState(newSize);
        setCurrentPage(1);
    };

    return {
        paginatedData,
        currentPage: safePage,
        totalPages,
        pageSize,
        setCurrentPage,
        setPageSize,
        startIndex,
        PAGE_SIZE_OPTIONS,
    };
}
