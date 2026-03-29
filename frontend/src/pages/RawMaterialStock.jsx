import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { dashboardAPI } from '../lib/api';
import { formatNumber } from '../lib/utils';
import { Loader2, AlertCircle, Download, Layers } from 'lucide-react';
import { toast } from 'sonner';
import { exportToExcel } from '../lib/exportToExcel';

const EXPORT_COLUMNS = [
    { header: 'Size', key: 'size' },
    { header: 'Gauge', key: 'gauge' },
    { header: 'Total Sheets', key: 'total_sheets' },
    { header: 'Used', key: 'sheets_used' },
    { header: 'Available', key: 'sheets_available' },
    { header: 'Weight (KG)', key: 'total_weight' },
];

const RawMaterialStock = () => {
    const [stockData, setStockData] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => { fetchData(); }, []);

    const fetchData = async () => {
        try {
            setLoading(true);
            const res = await dashboardAPI.getPurchaseStock();
            setStockData(res.data);
        } catch (err) { toast.error('Failed to load stock data'); }
        finally { setLoading(false); }
    };

    return (
        <div className="space-y-6 animate-fade-in" data-testid="raw-material-stock-page">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <p className="text-muted-foreground">Raw material stock levels grouped by size</p>
                <Button variant="outline" onClick={() => {
                    if (exportToExcel({ data: stockData, columns: EXPORT_COLUMNS, fileName: 'Raw_Material_Stock', sheetName: 'Raw Material Stock' })) toast.success('Exported to Excel');
                    else toast.error('No data to export');
                }} className="font-bold uppercase tracking-wider rounded-sm" data-testid="export-stock-btn">
                    <Download className="w-4 h-4 mr-2" /> Excel
                </Button>
            </div>

            <Card className="industrial-card">
                <CardHeader>
                    <CardTitle className="font-display text-xl font-bold tracking-tight uppercase flex items-center gap-2">
                        <Layers className="w-5 h-5 text-primary" /> Raw Material Stock (Size-Wise)
                    </CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                    {loading ? (
                        <div className="flex items-center justify-center h-48"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
                    ) : stockData.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-48 text-muted-foreground"><AlertCircle className="w-8 h-8 mb-2" /><p>No stock data available</p></div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="data-table" data-testid="raw-material-stock-table">
                                <thead><tr><th>Size</th><th>Gauge</th><th>Total Sheets</th><th>Used</th><th>Available</th><th>Weight (KG)</th></tr></thead>
                                <tbody>
                                    {stockData.map((row, idx) => (
                                        <tr key={idx}>
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
                    )}
                </CardContent>
            </Card>
        </div>
    );
};

export default RawMaterialStock;
