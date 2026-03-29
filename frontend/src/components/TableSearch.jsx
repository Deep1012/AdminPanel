import React from 'react';
import { Input } from './ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Button } from './ui/button';
import { Search, X } from 'lucide-react';

/**
 * Reusable search/filter bar for data tables.
 *
 * @param {Object} props
 * @param {string} props.searchValue - Current search input value
 * @param {Function} props.onSearchChange - Callback when search input changes
 * @param {string} props.searchPlaceholder - Placeholder text for search input
 * @param {Array} props.filters - Array of filter configs:
 *   { key, label, type: 'select' | 'date', options?: [{value, label}], value, onChange }
 * @param {Function} props.onClear - Callback to reset all filters
 * @param {number} props.resultCount - Number of filtered results
 * @param {number} props.totalCount - Total number of records
 */
const TableSearch = ({ searchValue, onSearchChange, searchPlaceholder = 'Search...', filters = [], onClear, resultCount, totalCount }) => {
    const hasActiveFilters = searchValue || filters.some(f => f.value);

    return (
        <div className="flex flex-wrap items-center gap-3 p-4" data-testid="table-search">
            <div className="relative flex-1 min-w-[200px]">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                    value={searchValue}
                    onChange={(e) => onSearchChange(e.target.value)}
                    placeholder={searchPlaceholder}
                    className="pl-9 bg-background border-input rounded-sm"
                    data-testid="table-search-input"
                />
            </div>
            {filters.map((filter) => (
                <div key={filter.key} className="min-w-[140px]">
                    {filter.type === 'select' ? (
                        <Select value={filter.value || 'all'} onValueChange={(v) => filter.onChange(v === 'all' ? '' : v)}>
                            <SelectTrigger className="bg-background border-input rounded-sm text-xs h-9" data-testid={`filter-${filter.key}`}>
                                <SelectValue placeholder={filter.label} />
                            </SelectTrigger>
                            <SelectContent className="bg-card border-border rounded-sm">
                                <SelectItem value="all">All {filter.label}</SelectItem>
                                {filter.options?.map(opt => (
                                    <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    ) : filter.type === 'date' ? (
                        <Input
                            type="date"
                            value={filter.value || ''}
                            onChange={(e) => filter.onChange(e.target.value)}
                            className="bg-background border-input rounded-sm text-xs h-9 font-mono"
                            placeholder={filter.label}
                            title={filter.label}
                            data-testid={`filter-${filter.key}`}
                        />
                    ) : null}
                </div>
            ))}
            {hasActiveFilters && (
                <Button variant="ghost" size="sm" onClick={onClear} className="text-muted-foreground hover:text-foreground rounded-sm h-9" data-testid="filter-clear">
                    <X className="w-4 h-4 mr-1" /> Clear
                </Button>
            )}
            {resultCount !== undefined && totalCount !== undefined && resultCount !== totalCount && (
                <span className="text-xs text-muted-foreground">
                    Showing {resultCount} of {totalCount}
                </span>
            )}
        </div>
    );
};

export default TableSearch;
