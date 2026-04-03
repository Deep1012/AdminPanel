import React from 'react';
import { ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react';

/**
 * Clickable table header cell with sort indicator.
 *
 * @param {Object} props
 * @param {string} props.label - Column header text
 * @param {string} props.sortKey - The data key this column sorts by
 * @param {string|null} props.currentSortKey - Currently active sort key
 * @param {'asc'|'desc'} props.currentSortDir - Current sort direction
 * @param {Function} props.onSort - Called with sortKey when clicked
 */
const SortableHeader = ({ label, sortKey, currentSortKey, currentSortDir, onSort }) => {
    const isActive = currentSortKey === sortKey;

    return (
        <th
            className="cursor-pointer select-none hover:text-primary transition-colors"
            onClick={() => onSort(sortKey)}
            data-testid={`sort-${sortKey}`}
        >
            <div className="flex items-center gap-1">
                <span>{label}</span>
                {isActive ? (
                    currentSortDir === 'asc' ? (
                        <ArrowUp className="w-3 h-3 text-primary" />
                    ) : (
                        <ArrowDown className="w-3 h-3 text-primary" />
                    )
                ) : (
                    <ArrowUpDown className="w-3 h-3 opacity-30" />
                )}
            </div>
        </th>
    );
};

export default SortableHeader;
