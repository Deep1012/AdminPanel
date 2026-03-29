import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { dashboardAPI } from '../lib/api';
import { formatNumber } from '../lib/utils';
import { Loader2, AlertCircle, Download, Printer } from 'lucide-react';
import { toast } from 'sonner';
import { exportToExcel } from '../lib/exportToExcel';

const EXPORT_COLUMNS = [
    { header: 'Size', key: 'size_name' },
    { header: 'Brand', key: 'brand_name' },
    { header: 'Printing Done', key: 'printing_done' },
    { header: 'Used in Production', key: 'used_in_production' },
    { header: 'Available', key: 'available' },
];

const PrintingStock = () => {
    const [stockData, setStockData] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => { fetchData(); }, []);

    const fetchData = async () => {
        try {
            setLoading(true);
            const res = await dashboardAPI.getPrintingStockList();
            setStockData(res.data);
        } catch (err) { toast.error('Failed to load printing stock'); }
        finally { setLoading(false); }
    };

    return (
        <div className="space-y-6 animate-fade-in" data-testid="printing-stock-page">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <p className="text-muted-foreground">Printing stock levels grouped by size and brand</p>
                <Button variant="outline" onClick={() => {
                    if (exportToExcel({ data: stockData, columns: EXPORT_COLUMNS, fileName: 'Printing_Stock', sheetName: 'Printing Stock' })) toast.success('Exported to Excel');
                    else toast.error('No data to export');
                }} className="font-bold uppercase tracking-wider rounded-sm" data-testid="export-printing-stock-btn">
                    <Download className="w-4 h-4 mr-2" /> Excel
                </Button>
            </div>

            <Card className="industrial-card">
                <CardHeader>
                    <CardTitle className="font-display text-xl font-bold tracking-tight uppercase flex items-center gap-2">
                        <Printer className="w-5 h-5 text-primary" /> Printing Stock (Size & Brand-Wise)
                    </CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                    {loading ? (
                        <div className="flex items-center justify-center h-48"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
                    ) : stockData.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-48 text-muted-foreground"><AlertCircle className="w-8 h-8 mb-2" /><p>No printing stock data</p></div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="data-table" data-testid="printing-stock-table">
                                <thead><tr><th>Size</th><th>Brand</th><th>Printing Done</th><th>Used in Production</th><th>Available</th></tr></thead>
                                <tbody>
                                    {stockData.map((row, idx) => (
                                        <tr key={idx}>
                                            <td className="font-medium">{row.size_name}</td>
                                            <td className="text-warning">{row.brand_name}</td>
                                            <td className="font-mono">{formatNumber(row.printing_done)}</td>
                                            <td className="font-mono text-warning">{formatNumber(row.used_in_production)}</td>
                                            <td className="font-mono text-success font-bold">{formatNumber(row.available)}</td>
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

export default PrintingStock;
