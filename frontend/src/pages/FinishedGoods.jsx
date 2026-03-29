import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import TableSearch from '../components/TableSearch';
import TablePagination from '../components/TablePagination';
import { useTableFilter } from '../hooks/useTableFilter';
import { usePagination } from '../hooks/usePagination';
import { dashboardAPI } from '../lib/api';
import { formatNumber } from '../lib/utils';
import { Loader2, AlertCircle, Download, Package } from 'lucide-react';
import { toast } from 'sonner';
import { exportToExcel } from '../lib/exportToExcel';

const EXPORT_COLUMNS = [
    { header: 'Size', key: 'size_name' },
    { header: 'Brand', key: 'brand_name' },
    { header: 'Produced', key: 'produced' },
    { header: 'Dispatched', key: 'dispatched' },
    { header: 'Available', key: 'available' },
];

const FinishedGoods = () => {
    const [stockData, setStockData] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');

    const filteredData = useTableFilter({
        data: stockData, searchTerm, searchFields: ['size_name', 'brand_name'], filters: []
    });

    const { paginatedData, currentPage, totalPages, pageSize, setCurrentPage, setPageSize, startIndex, PAGE_SIZE_OPTIONS } = usePagination({ data: filteredData });

    useEffect(() => { fetchData(); }, []);

    const fetchData = async () => {
        try {
            setLoading(true);
            const res = await dashboardAPI.getFinishedGoodsList();
            setStockData(res.data);
        } catch (err) { toast.error('Failed to load finished goods'); }
        finally { setLoading(false); }
    };

    return (
        <div className="space-y-6 animate-fade-in" data-testid="finished-goods-page">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <p className="text-muted-foreground">Finished goods stock levels grouped by size and brand</p>
                <Button variant="outline" onClick={() => {
                    if (exportToExcel({ data: stockData, columns: EXPORT_COLUMNS, fileName: 'Finished_Goods', sheetName: 'Finished Goods' })) toast.success('Exported to Excel');
                    else toast.error('No data to export');
                }} className="font-bold uppercase tracking-wider rounded-sm" data-testid="export-finished-goods-btn">
                    <Download className="w-4 h-4 mr-2" /> Excel
                </Button>
            </div>

            <Card className="industrial-card">
                <CardHeader>
                    <CardTitle className="font-display text-xl font-bold tracking-tight uppercase flex items-center gap-2">
                        <Package className="w-5 h-5 text-primary" /> Finished Goods Stock (Size & Brand-Wise)
                    </CardTitle>
                </CardHeader>
                <TableSearch
                    searchValue={searchTerm}
                    onSearchChange={setSearchTerm}
                    searchPlaceholder="Search by size, brand..."
                    onClear={() => setSearchTerm('')}
                    resultCount={filteredData.length}
                    totalCount={stockData.length}
                />
                <CardContent className="p-0">
                    {loading ? (
                        <div className="flex items-center justify-center h-48"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
                    ) : filteredData.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-48 text-muted-foreground"><AlertCircle className="w-8 h-8 mb-2" /><p>No finished goods data</p></div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="data-table" data-testid="finished-goods-table">
                                <thead><tr><th>#</th><th>Size</th><th>Brand</th><th>Produced</th><th>Dispatched</th><th>Available</th></tr></thead>
                                <tbody>
                                    {paginatedData.map((row, idx) => (
                                        <tr key={idx}>
                                            <td className="text-muted-foreground">{startIndex + idx + 1}</td>
                                            <td className="font-medium">{row.size_name}</td>
                                            <td className="text-warning">{row.brand_name}</td>
                                            <td className="font-mono">{formatNumber(row.produced)}</td>
                                            <td className="font-mono text-warning">{formatNumber(row.dispatched)}</td>
                                            <td className="font-mono text-success font-bold">{formatNumber(row.available)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                    <TablePagination currentPage={currentPage} totalPages={totalPages} pageSize={pageSize} totalItems={filteredData.length} startIndex={startIndex} onPageChange={setCurrentPage} onPageSizeChange={setPageSize} pageSizeOptions={PAGE_SIZE_OPTIONS} />
                </CardContent>
            </Card>
        </div>
    );
};

export default FinishedGoods;
