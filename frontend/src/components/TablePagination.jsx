import React from 'react';
import { Button } from './ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react';

/**
 * Reusable table pagination bar.
 *
 * @param {Object} props
 * @param {number} props.currentPage
 * @param {number} props.totalPages
 * @param {number} props.pageSize
 * @param {number} props.totalItems - Total filtered items count
 * @param {number} props.startIndex - Index of the first item on current page
 * @param {Function} props.onPageChange
 * @param {Function} props.onPageSizeChange
 * @param {number[]} props.pageSizeOptions
 */
const TablePagination = ({ currentPage, totalPages, pageSize, totalItems, startIndex, onPageChange, onPageSizeChange, pageSizeOptions = [10, 25, 50, 100] }) => {
    if (totalItems === 0) return null;

    const endIndex = Math.min(startIndex + pageSize, totalItems);

    return (
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-4 py-3 border-t border-border" data-testid="table-pagination">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span>Rows per page</span>
                <Select value={String(pageSize)} onValueChange={(v) => onPageSizeChange(Number(v))}>
                    <SelectTrigger className="h-8 w-[70px] bg-background border-input rounded-sm text-xs">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-card border-border rounded-sm">
                        {pageSizeOptions.map(size => (
                            <SelectItem key={size} value={String(size)}>{size}</SelectItem>
                        ))}
                    </SelectContent>
                </Select>
                <span className="ml-2">
                    {startIndex + 1}-{endIndex} of {totalItems}
                </span>
            </div>
            <div className="flex items-center gap-1">
                <Button
                    variant="outline"
                    size="icon"
                    className="h-8 w-8 rounded-sm"
                    onClick={() => onPageChange(1)}
                    disabled={currentPage === 1}
                    data-testid="page-first"
                >
                    <ChevronsLeft className="w-4 h-4" />
                </Button>
                <Button
                    variant="outline"
                    size="icon"
                    className="h-8 w-8 rounded-sm"
                    onClick={() => onPageChange(currentPage - 1)}
                    disabled={currentPage === 1}
                    data-testid="page-prev"
                >
                    <ChevronLeft className="w-4 h-4" />
                </Button>
                <span className="px-3 text-sm font-mono text-muted-foreground">
                    {currentPage} / {totalPages}
                </span>
                <Button
                    variant="outline"
                    size="icon"
                    className="h-8 w-8 rounded-sm"
                    onClick={() => onPageChange(currentPage + 1)}
                    disabled={currentPage === totalPages}
                    data-testid="page-next"
                >
                    <ChevronRight className="w-4 h-4" />
                </Button>
                <Button
                    variant="outline"
                    size="icon"
                    className="h-8 w-8 rounded-sm"
                    onClick={() => onPageChange(totalPages)}
                    disabled={currentPage === totalPages}
                    data-testid="page-last"
                >
                    <ChevronsRight className="w-4 h-4" />
                </Button>
            </div>
        </div>
    );
};

export default TablePagination;
