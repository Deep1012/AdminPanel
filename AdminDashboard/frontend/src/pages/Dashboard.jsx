import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { dashboardAPI } from '../lib/api';
import { formatNumber } from '../lib/utils';
import { Package, Printer, Factory, Truck, ShoppingCart, Loader2, AlertCircle, Layers, Download } from 'lucide-react';
import * as XLSX from 'xlsx';
import { saveAs } from 'file-saver';
import { toast } from 'sonner';

const StatCard = ({ title, value, subtitle, icon: Icon, color = 'primary' }) => (
    <Card className="industrial-card">
        <CardContent className="p-4">
            <div className="flex items-center gap-3">
                <div className={`p-2 bg-${color}/10 rounded-sm border border-${color}/20`}>
                    <Icon className={`w-5 h-5 text-${color}`} />
                </div>
                <div>
                    <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">{title}</p>
                    <p className="font-display text-2xl font-bold">{value}</p>
                    {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
                </div>
            </div>
        </CardContent>
    </Card>
);

const StockTable = ({ title, icon: Icon, columns, data, emptyMessage, onExport }) => (
    <Card className="industrial-card">
        <CardHeader className="pb-3 flex flex-row items-center justify-between">
            <CardTitle className="font-display text-lg font-bold tracking-tight uppercase flex items-center gap-2">
                <Icon className="w-5 h-5 text-primary" /> {title}
            </CardTitle>
            {data.length > 0 && (
                <Button variant="outline" size="sm" onClick={onExport} className="rounded-sm">
                    <Download className="w-4 h-4 mr-1" /> Excel
                </Button>
            )}
        </CardHeader>
        <CardContent className="p-0">
            {data.length === 0 ? (
                <div className="flex items-center justify-center h-32 text-muted-foreground text-sm">
                    <AlertCircle className="w-4 h-4 mr-2" /> {emptyMessage}
                </div>
            ) : (
                <div className="overflow-x-auto">
                    <table className="data-table">
                        <thead><tr>{columns.map((col, i) => <th key={i}>{col.header}</th>)}</tr></thead>
                        <tbody>
                            {data.map((row, idx) => (
                                <tr key={idx}>
                                    {columns.map((col, i) => (
                                        <td key={i} className={col.className || ''}>
                                            {col.render ? col.render(row) : row[col.key]}
                                        </td>
                                    ))}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </CardContent>
    </Card>
);

const Dashboard = () => {
    const [stats, setStats] = useState(null);
    const [purchaseStock, setPurchaseStock] = useState([]);
    const [printingStock, setPrintingStock] = useState([]);
    const [finishedGoods, setFinishedGoods] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => { fetchDashboardData(); }, []);

    const fetchDashboardData = async () => {
        try {
            setLoading(true);
            const [statsRes, purchaseRes, printingRes, finishedRes] = await Promise.all([
                dashboardAPI.getStats(),
                dashboardAPI.getPurchaseStock(),
                dashboardAPI.getPrintingStockList(),
                dashboardAPI.getFinishedGoodsList()
            ]);
            setStats(statsRes.data);
            setPurchaseStock(purchaseRes.data);
            setPrintingStock(printingRes.data);
            setFinishedGoods(finishedRes.data);
        } catch (err) {
            setError('Failed to load dashboard data');
        } finally {
            setLoading(false);
        }
    };

    const exportToExcel = (data, columns, filename) => {
        const exportData = data.map(row => {
            const obj = {};
            columns.forEach(col => {
                obj[col.header] = row[col.key];
            });
            return obj;
        });
        
        const ws = XLSX.utils.json_to_sheet(exportData);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Stock');
        const excelBuffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
        const blob = new Blob([excelBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
        saveAs(blob, `${filename}_${new Date().toISOString().split('T')[0]}.xlsx`);
        toast.success(`Exported to ${filename}.xlsx`);
    };

    const exportAllToExcel = () => {
        const wb = XLSX.utils.book_new();
        
        // Purchase Stock
        const purchaseData = purchaseStock.map(r => ({
            'Size': r.size, 'Gauge': r.gauge, 'Total Sheets': r.total_sheets,
            'Used': r.sheets_used, 'Available': r.sheets_available, 'Weight (kg)': r.total_weight
        }));
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(purchaseData), 'Raw Material Stock');
        
        // Printing Stock
        const printingData = printingStock.filter(s => s.printing_done > 0).map(r => ({
            'Size': r.size_name, 'Brand': r.brand_name, 'Printing Done': r.printing_done,
            'Used in Production': r.used_in_production, 'Available': r.available
        }));
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(printingData), 'Printing Stock');
        
        // Finished Goods
        const finishedData = finishedGoods.filter(s => s.produced > 0).map(r => ({
            'Size': r.size_name, 'Brand': r.brand_name, 'Produced': r.produced,
            'Dispatched': r.dispatched, 'Available': r.available
        }));
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(finishedData), 'Finished Goods Stock');
        
        const excelBuffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
        const blob = new Blob([excelBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
        saveAs(blob, `TIMESTIN_All_Stock_${new Date().toISOString().split('T')[0]}.xlsx`);
        toast.success('Exported all stock reports to Excel');
    };

    if (loading) return <div className="flex items-center justify-center h-64"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;
    if (error) return <div className="flex items-center justify-center h-64 text-destructive"><AlertCircle className="w-6 h-6 mr-2" />{error}</div>;

    const purchaseColumns = [
        { header: 'Size', key: 'size', className: 'font-medium' },
        { header: 'Gauge', key: 'gauge' },
        { header: 'Total Sheets', key: 'total_sheets', render: (r) => formatNumber(r.total_sheets) },
        { header: 'Used', key: 'sheets_used', render: (r) => <span className="text-warning">{formatNumber(r.sheets_used)}</span> },
        { header: 'Available', key: 'sheets_available', render: (r) => <span className="text-success font-bold">{formatNumber(r.sheets_available)}</span> },
        { header: 'Weight (kg)', key: 'total_weight', render: (r) => formatNumber(r.total_weight) }
    ];

    const printingColumns = [
        { header: 'Size', key: 'size_name', className: 'font-medium' },
        { header: 'Brand', key: 'brand_name' },
        { header: 'Printing Done', key: 'printing_done', render: (r) => formatNumber(r.printing_done) },
        { header: 'Used in Production', key: 'used_in_production', render: (r) => <span className="text-warning">{formatNumber(r.used_in_production)}</span> },
        { header: 'Available', key: 'available', render: (r) => <span className="text-success font-bold">{formatNumber(r.available)}</span> }
    ];

    const finishedColumns = [
        { header: 'Size', key: 'size_name', className: 'font-medium' },
        { header: 'Brand', key: 'brand_name' },
        { header: 'Produced', key: 'produced', render: (r) => formatNumber(r.produced) },
        { header: 'Dispatched', key: 'dispatched', render: (r) => <span className="text-warning">{formatNumber(r.dispatched)}</span> },
        { header: 'Available', key: 'available', render: (r) => <span className="text-success font-bold">{formatNumber(r.available)}</span> }
    ];

    return (
        <div className="space-y-6 animate-fade-in" data-testid="dashboard-page">
            {/* Header with Export All */}
            <div className="flex justify-between items-center">
                <div></div>
                <Button onClick={exportAllToExcel} className="font-bold uppercase tracking-wider rounded-sm">
                    <Download className="w-4 h-4 mr-2" /> Export All to Excel
                </Button>
            </div>

            {/* Stats Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <StatCard title="Printing Stock" value={formatNumber(stats?.printing_coating?.printing_stock_available || 0)} subtitle={`${formatNumber(stats?.printing_coating?.total_printing_stock || 0)} total`} icon={Printer} color="primary" />
                <StatCard title="Finished Goods" value={formatNumber(stats?.finished_goods?.available_stock || 0)} subtitle={`${formatNumber(stats?.finished_goods?.total_produced || 0)} produced`} icon={Package} color="success" />
                <StatCard title="Pending Orders" value={formatNumber(stats?.dispatch?.pending_orders || 0)} subtitle={`${formatNumber(stats?.dispatch?.total_dispatched || 0)} dispatched`} icon={Truck} color="warning" />
                <StatCard title="Available Sheets" value={formatNumber(stats?.purchase?.total_sheets_available || 0)} subtitle={`${formatNumber(stats?.purchase?.total_sheets || 0)} total`} icon={ShoppingCart} color="info" />
            </div>

            {/* Stock Lists */}
            <div className="grid grid-cols-1 gap-6">
                <StockTable
                    title="Raw Material Stock (Size-wise)"
                    icon={Layers}
                    columns={purchaseColumns}
                    data={purchaseStock}
                    emptyMessage="No raw material stock"
                    onExport={() => exportToExcel(purchaseStock, purchaseColumns, 'Raw_Material_Stock')}
                />
                
                <StockTable
                    title="Printing Stock (Size & Brand-wise)"
                    icon={Printer}
                    columns={printingColumns}
                    data={printingStock.filter(s => s.printing_done > 0)}
                    emptyMessage="No printing stock"
                    onExport={() => exportToExcel(printingStock.filter(s => s.printing_done > 0), printingColumns, 'Printing_Stock')}
                />
                
                <StockTable
                    title="Finished Goods Stock (Size & Brand-wise)"
                    icon={Factory}
                    columns={finishedColumns}
                    data={finishedGoods.filter(s => s.produced > 0)}
                    emptyMessage="No finished goods stock"
                    onExport={() => exportToExcel(finishedGoods.filter(s => s.produced > 0), finishedColumns, 'Finished_Goods_Stock')}
                />
            </div>
        </div>
    );
};

export default Dashboard;
