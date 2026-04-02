import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import TableSearch from '../components/TableSearch';
import TablePagination from '../components/TablePagination';
import { useTableFilter } from '../hooks/useTableFilter';
import { usePagination } from '../hooks/usePagination';
import { dashboardAPI } from '../lib/api';
import { formatNumber, formatDate } from '../lib/utils';
import { Loader2, AlertCircle, Download, Layers, List } from 'lucide-react';
import { toast } from 'sonner';
import { exportToExcel } from '../lib/exportToExcel';

const AGGREGATED_EXPORT_COLUMNS = [
    { header: 'Size', key: 'size' },
    { header: 'Gauge', key: 'gauge' },
    { header: 'Total Sheets', key: 'total_sheets' },
    { header: 'Used', key: 'sheets_used' },
    { header: 'Available', key: 'sheets_available' },
    { header: 'Weight (KG)', key: 'total_weight' },
];

const INDIVIDUAL_EXPORT_COLUMNS = [
    { header: 'SR No', key: 'sr_no' },
    { header: 'Date', key: 'purchase_date', transform: (v) => formatDate(v) },
    { header: 'Size', key: 'size' },
    { header: 'Gauge', key: 'gauge' },
    { header: 'Temper', key: 'temper' },
    { header: 'Weight (KG)', key: 'weight' },
    { header: 'Total Sheets', key: 'total_sheets' },
    { header: 'Used', key: 'sheets_used' },
    { header: 'Available', key: 'sheets_available' },
    { header: 'Supplier', key: 'supplier' },
];

const RawMaterialStock = () => {
    const [aggregatedData, setAggregatedData] = useState([]);
    const [individualData, setIndividualData] = useState([]);
    const [gauges, setGauges] = useState([]);
    const [selectedGauge, setSelectedGauge] = useState('all');
    const [viewMode, setViewMode] = useState('aggregated');
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');

    // Filter by gauge
    const gaugeFilteredAggregated = selectedGauge === 'all'
        ? aggregatedData
        : aggregatedData.filter(r => String(r.gauge) === selectedGauge);
    const gaugeFilteredIndividual = selectedGauge === 'all'
        ? individualData
        : individualData.filter(r => String(r.gauge) === selectedGauge);

    const currentData = viewMode === 'aggregated' ? gaugeFilteredAggregated : gaugeFilteredIndividual;
    const searchFields = viewMode === 'aggregated' ? ['size', 'gauge'] : ['sr_no', 'size', 'gauge', 'temper', 'supplier'];

    const filteredData = useTableFilter({
        data: currentData, searchTerm, searchFields, filters: []
    });

    const { paginatedData, currentPage, totalPages, pageSize, setCurrentPage, setPageSize, startIndex, PAGE_SIZE_OPTIONS } = usePagination({ data: filteredData });

    useEffect(() => { fetchData(); }, []);

    const fetchData = async () => {
        try {
            setLoading(true);
            const res = await dashboardAPI.getPurchaseStock();
            const data = res.data;
            // Support both old (array) and new (object) response formats
            if (Array.isArray(data)) {
                setAggregatedData(data);
                setIndividualData([]);
                setGauges([]);
            } else {
                setAggregatedData(data.aggregated || []);
                setIndividualData(data.individual || []);
                setGauges(data.gauges || []);
            }
        } catch (err) { toast.error('Failed to load stock data'); }
        finally { setLoading(false); }
    };

    const handleExport = () => {
        const columns = viewMode === 'aggregated' ? AGGREGATED_EXPORT_COLUMNS : INDIVIDUAL_EXPORT_COLUMNS;
        const fileName = viewMode === 'aggregated' ? 'Raw_Material_Stock_Aggregated' : 'Raw_Material_Stock_Individual';
        if (exportToExcel({ data: filteredData, columns, fileName, sheetName: 'Raw Material Stock' })) toast.success('Exported to Excel');
        else toast.error('No data to export');
    };

    return (
        <div className="space-y-6 animate-fade-in" data-testid="raw-material-stock-page">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <p className="text-muted-foreground">Raw material stock levels grouped by size</p>
                <div className="flex gap-2">
                    <Button
                        variant={viewMode === 'aggregated' ? 'default' : 'outline'}
                        onClick={() => { setViewMode('aggregated'); setCurrentPage(1); setSearchTerm(''); }}
                        className="font-bold uppercase tracking-wider rounded-sm text-xs"
                        data-testid="view-aggregated-btn"
                    >
                        <Layers className="w-4 h-4 mr-1" /> Size-Wise
                    </Button>
                    <Button
                        variant={viewMode === 'individual' ? 'default' : 'outline'}
                        onClick={() => { setViewMode('individual'); setCurrentPage(1); setSearchTerm(''); }}
                        className="font-bold uppercase tracking-wider rounded-sm text-xs"
                        data-testid="view-individual-btn"
                    >
                        <List className="w-4 h-4 mr-1" /> Individual
                    </Button>
                    <Button variant="outline" onClick={handleExport} className="font-bold uppercase tracking-wider rounded-sm" data-testid="export-stock-btn">
                        <Download className="w-4 h-4 mr-2" /> Excel
                    </Button>
                </div>
            </div>

            {/* Gauge Tabs */}
            {gauges.length > 0 && (
                <div className="flex flex-wrap gap-2" data-testid="gauge-tabs">
                    <Button
                        variant={selectedGauge === 'all' ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => { setSelectedGauge('all'); setCurrentPage(1); }}
                        className="font-bold uppercase tracking-wider rounded-sm text-xs"
                    >
                        All Gauges
                    </Button>
                    {gauges.map(g => (
                        <Button
                            key={g}
                            variant={selectedGauge === String(g) ? 'default' : 'outline'}
                            size="sm"
                            onClick={() => { setSelectedGauge(String(g)); setCurrentPage(1); }}
                            className="font-bold uppercase tracking-wider rounded-sm text-xs"
                        >
                            {g}
                        </Button>
                    ))}
                </div>
            )}

            <Card className="industrial-card">
                <CardHeader>
                    <CardTitle className="font-display text-xl font-bold tracking-tight uppercase flex items-center gap-2">
                        {viewMode === 'aggregated'
                            ? <><Layers className="w-5 h-5 text-primary" /> Raw Material Stock (Size-Wise)</>
                            : <><List className="w-5 h-5 text-primary" /> Raw Material Stock (Individual)</>
                        }
                    </CardTitle>
                </CardHeader>
                <TableSearch
                    searchValue={searchTerm}
                    onSearchChange={setSearchTerm}
                    searchPlaceholder={viewMode === 'aggregated' ? 'Search by size, gauge...' : 'Search by SR No, size, gauge, temper, supplier...'}
                    onClear={() => setSearchTerm('')}
                    resultCount={filteredData.length}
                    totalCount={currentData.length}
                />
                <CardContent className="p-0">
                    {loading ? (
                        <div className="flex items-center justify-center h-48"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
                    ) : filteredData.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-48 text-muted-foreground"><AlertCircle className="w-8 h-8 mb-2" /><p>No stock data available</p></div>
                    ) : viewMode === 'aggregated' ? (
                        <div className="overflow-x-auto">
                            <table className="data-table" data-testid="raw-material-stock-table">
                                <thead><tr><th>#</th><th>Size</th><th>Gauge</th><th>Total Sheets</th><th>Used</th><th>Available</th><th>Weight (KG)</th></tr></thead>
                                <tbody>
                                    {paginatedData.map((row, idx) => (
                                        <tr key={idx}>
                                            <td className="text-muted-foreground">{startIndex + idx + 1}</td>
                                            <td className="font-medium">{row.size}</td>
                                            <td>{row.gauge}</td>
                                            <td className="font-mono">{formatNumber(row.total_sheets)}</td>
                                            <td className="font-mono text-warning">{formatNumber(row.sheets_used)}</td>
                                            <td className="font-mono text-success font-bold">{formatNumber(row.sheets_available)}</td>
                                            <td className="font-mono">{formatNumber(row.total_weight)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="data-table" data-testid="raw-material-individual-table">
                                <thead><tr><th>#</th><th>SR No</th><th>Date</th><th>Size</th><th>Gauge</th><th>Temper</th><th>Weight (KG)</th><th>Total Sheets</th><th>Used</th><th>Available</th><th>Supplier</th></tr></thead>
                                <tbody>
                                    {paginatedData.map((row, idx) => (
                                        <tr key={row.id || idx}>
                                            <td className="text-muted-foreground">{startIndex + idx + 1}</td>
                                            <td className="font-medium">{row.sr_no}</td>
                                            <td>{formatDate(row.purchase_date)}</td>
                                            <td className="font-medium">{row.size}</td>
                                            <td>{row.gauge}</td>
                                            <td>{row.temper}</td>
                                            <td className="font-mono">{formatNumber(row.weight)}</td>
                                            <td className="font-mono">{formatNumber(row.total_sheets)}</td>
                                            <td className="font-mono text-warning">{formatNumber(row.sheets_used)}</td>
                                            <td className="font-mono text-success font-bold">{formatNumber(row.sheets_available)}</td>
                                            <td>{row.supplier}</td>
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

export default RawMaterialStock;
