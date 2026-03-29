import React, { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../components/ui/dialog';
import ConfirmDialog from '../components/ConfirmDialog';
import TableSearch from '../components/TableSearch';
import TablePagination from '../components/TablePagination';
import { useTableFilter } from '../hooks/useTableFilter';
import { usePagination } from '../hooks/usePagination';
import { purchaseAPI } from '../lib/api';
import { formatDate, formatNumber } from '../lib/utils';
import { Plus, Trash2, Pencil, ShoppingCart, Loader2, AlertCircle, Layers, Download } from 'lucide-react';
import { toast } from 'sonner';
import { exportToExcel } from '../lib/exportToExcel';

const PURCHASE_EXPORT_COLUMNS = [
    { header: 'Date', key: 'purchase_date', transform: (v) => formatDate(v) },
    { header: 'Sr. No', key: 'sr_no' },
    { header: 'Gauge', key: 'gauge' },
    { header: 'Size 1', key: 'size1' },
    { header: 'Size 2', key: 'size2' },
    { header: 'Temper', key: 'temper' },
    { header: 'Weight (kg)', key: 'weight' },
    { header: 'Total Sheets', key: 'no_of_sheets' },
    { header: 'Used', key: 'sheets_used', transform: (v) => v || 0 },
    { header: 'Available', key: 'no_of_sheets', transform: (v, row) => (row.no_of_sheets || 0) - (row.sheets_used || 0) },
    { header: 'Supplier', key: 'supplier', transform: (v) => v || '-' },
    { header: 'Created By', key: 'created_by' },
];

const emptyForm = { gauge: '', size1: '', size2: '', temper: '', weight: '', supplier: '', invoice_number: '', purchase_date: new Date().toISOString().split('T')[0] };

const Purchase = () => {
    const [purchases, setPurchases] = useState([]);
    const [loading, setLoading] = useState(true);
    const [dialogOpen, setDialogOpen] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [editingId, setEditingId] = useState(null);
    const [formData, setFormData] = useState({ ...emptyForm });
    const [deleteTarget, setDeleteTarget] = useState(null);

    // Search & filter state
    const [searchTerm, setSearchTerm] = useState('');
    const [filterGauge, setFilterGauge] = useState('');
    const [dateFrom, setDateFrom] = useState('');
    const [dateTo, setDateTo] = useState('');

    const gaugeOptions = useMemo(() => {
        const unique = [...new Set(purchases.map(p => String(p.gauge)))].sort();
        return unique.map(g => ({ value: g, label: g }));
    }, [purchases]);

    const filters = useMemo(() => [
        ...(filterGauge ? [{ key: 'gauge', value: parseFloat(filterGauge), type: 'exact' }] : []),
        ...(dateFrom ? [{ key: 'purchase_date', value: dateFrom, type: 'dateFrom' }] : []),
        ...(dateTo ? [{ key: 'purchase_date', value: dateTo, type: 'dateTo' }] : []),
    ], [filterGauge, dateFrom, dateTo]);

    const filteredPurchases = useTableFilter({
        data: purchases, searchTerm, searchFields: ['sr_no', 'supplier'], filters
    });

    const { paginatedData: paginatedPurchases, currentPage, totalPages, pageSize, setCurrentPage, setPageSize, startIndex, PAGE_SIZE_OPTIONS } = usePagination({ data: filteredPurchases });

    useEffect(() => { fetchPurchases(); }, []);

    const fetchPurchases = async () => {
        try { setLoading(true); const res = await purchaseAPI.getAll(); setPurchases(res.data); }
        catch (err) { toast.error('Failed to load purchases'); }
        finally { setLoading(false); }
    };

    const calculateSheets = () => {
        const g = parseFloat(formData.gauge) || 0;
        const s1 = parseFloat(formData.size1) || 0;
        const s2 = parseFloat(formData.size2) || 0;
        const w = parseFloat(formData.weight) || 0;
        if (g > 0 && s1 > 0 && s2 > 0 && w > 0) return Math.floor(w / ((g * s1 * s2 / 100000) * 0.785));
        return 0;
    };

    const openCreate = () => { setEditingId(null); setFormData({ ...emptyForm }); setDialogOpen(true); };
    const openEdit = (p) => {
        setEditingId(p.id);
        setFormData({
            gauge: String(p.gauge), size1: String(p.size1), size2: String(p.size2),
            temper: p.temper, weight: String(p.weight), supplier: p.supplier || '', invoice_number: p.invoice_number || '',
            purchase_date: p.purchase_date ? p.purchase_date.split('T')[0] : new Date().toISOString().split('T')[0],
        });
        setDialogOpen(true);
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!formData.gauge || !formData.size1 || !formData.size2 || !formData.temper || !formData.weight) {
            toast.error('Please fill all required fields'); return;
        }
        setSubmitting(true);
        try {
            const payload = {
                gauge: parseFloat(formData.gauge), size1: parseFloat(formData.size1),
                size2: parseFloat(formData.size2), temper: formData.temper, weight: parseFloat(formData.weight),
                supplier: formData.supplier || null, invoice_number: formData.invoice_number || null,
                purchase_date: new Date(formData.purchase_date).toISOString(),
            };
            if (editingId) { await purchaseAPI.update(editingId, payload); toast.success('Entry updated'); }
            else { await purchaseAPI.create(payload); toast.success('Entry added'); }
            setDialogOpen(false); fetchPurchases();
        } catch (err) { toast.error('Failed to save entry'); }
        finally { setSubmitting(false); }
    };

    const handleDelete = async () => {
        if (!deleteTarget) return;
        try { await purchaseAPI.delete(deleteTarget); toast.success('Entry deleted'); fetchPurchases(); }
        catch (err) { toast.error('Failed to delete'); }
        finally { setDeleteTarget(null); }
    };

    const clearFilters = () => { setSearchTerm(''); setFilterGauge(''); setDateFrom(''); setDateTo(''); };

    const totalSheets = purchases.reduce((s, p) => s + (p.no_of_sheets || 0), 0);
    const totalWeight = purchases.reduce((s, p) => s + (p.weight || 0), 0);

    return (
        <div className="space-y-6 animate-fade-in" data-testid="purchase-page">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <p className="text-muted-foreground">Manage raw material (metal sheets) purchases</p>
                <div className="flex gap-2">
                    <Button variant="outline" onClick={() => {
                        const data = filteredPurchases.length > 0 ? filteredPurchases : purchases;
                        if (exportToExcel({ data, columns: PURCHASE_EXPORT_COLUMNS, fileName: 'Purchases', sheetName: 'Purchases' })) toast.success('Exported to Excel');
                        else toast.error('No data to export');
                    }} className="font-bold uppercase tracking-wider rounded-sm" data-testid="export-purchase-btn">
                        <Download className="w-4 h-4 mr-2" /> Export
                    </Button>
                    <Button onClick={openCreate} className="font-bold uppercase tracking-wider rounded-sm" data-testid="add-purchase-btn">
                        <Plus className="w-4 h-4 mr-2" /> Add Entry
                    </Button>
                </div>
            </div>

            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                <DialogContent className="bg-card border-border rounded-sm max-w-lg">
                    <DialogHeader>
                        <DialogTitle className="font-display text-xl font-bold tracking-tight uppercase">
                            {editingId ? 'Edit Raw Material Entry' : 'Add Raw Material Entry'}
                        </DialogTitle>
                    </DialogHeader>
                    <form onSubmit={handleSubmit} className="space-y-4 mt-4">
                        <div className="space-y-2">
                            <Label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Date *</Label>
                            <Input type="date" value={formData.purchase_date} onChange={(e) => setFormData({ ...formData, purchase_date: e.target.value })} className="bg-background border-input rounded-sm font-mono" data-testid="purchase-date" />
                        </div>
                        <div className="space-y-2">
                            <Label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Gauge *</Label>
                            <Input type="number" step="0.001" value={formData.gauge} onChange={(e) => setFormData({ ...formData, gauge: e.target.value })} placeholder="e.g., 0.22" className="bg-background border-input rounded-sm font-mono" data-testid="purchase-gauge" />
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Size 1 *</Label>
                                <Input type="number" step="0.01" value={formData.size1} onChange={(e) => setFormData({ ...formData, size1: e.target.value })} placeholder="e.g., 914" className="bg-background border-input rounded-sm font-mono" data-testid="purchase-size1" />
                            </div>
                            <div className="space-y-2">
                                <Label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Size 2 *</Label>
                                <Input type="number" step="0.01" value={formData.size2} onChange={(e) => setFormData({ ...formData, size2: e.target.value })} placeholder="e.g., 1219" className="bg-background border-input rounded-sm font-mono" data-testid="purchase-size2" />
                            </div>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Temper *</Label>
                                <Input value={formData.temper} onChange={(e) => setFormData({ ...formData, temper: e.target.value })} placeholder="e.g., T4" className="bg-background border-input rounded-sm" data-testid="purchase-temper" />
                            </div>
                            <div className="space-y-2">
                                <Label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Weight (kg) *</Label>
                                <Input type="number" step="0.01" value={formData.weight} onChange={(e) => setFormData({ ...formData, weight: e.target.value })} placeholder="e.g., 5000" className="bg-background border-input rounded-sm font-mono" data-testid="purchase-weight" />
                            </div>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Supplier</Label>
                                <Input value={formData.supplier} onChange={(e) => setFormData({ ...formData, supplier: e.target.value })} placeholder="Supplier name" className="bg-background border-input rounded-sm" data-testid="purchase-supplier" />
                            </div>
                            <div className="space-y-2">
                                <Label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Invoice No.</Label>
                                <Input value={formData.invoice_number} onChange={(e) => setFormData({ ...formData, invoice_number: e.target.value })} placeholder="INV-001" className="bg-background border-input rounded-sm font-mono" data-testid="purchase-invoice" />
                            </div>
                        </div>
                        <div className="p-4 bg-primary/10 rounded-sm border border-primary/20">
                            <div className="flex items-center justify-between">
                                <div>
                                    <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">No. of Sheets (Auto-Calculated)</p>
                                    <p className="text-xs text-muted-foreground mt-1">= Weight / (Gauge x Size1 x Size2 / 100000 x 0.785)</p>
                                </div>
                                <p className="font-display text-3xl font-bold text-primary">{formatNumber(calculateSheets())}</p>
                            </div>
                        </div>
                        <Button type="submit" className="w-full font-bold uppercase tracking-wider rounded-sm" disabled={submitting} data-testid="purchase-submit">
                            {submitting ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Saving...</> : (editingId ? 'Update Entry' : 'Add Entry')}
                        </Button>
                    </form>
                </DialogContent>
            </Dialog>

            <ConfirmDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)} title="Delete Purchase Entry?" description="This will permanently remove this raw material entry." onConfirm={handleDelete} />

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <Card className="industrial-card"><CardContent className="p-4"><div className="flex items-center gap-3"><div className="p-2 bg-primary/10 rounded-sm border border-primary/20"><ShoppingCart className="w-5 h-5 text-primary" /></div><div><p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Total Entries</p><p className="font-display text-2xl font-bold">{purchases.length}</p></div></div></CardContent></Card>
                <Card className="industrial-card"><CardContent className="p-4"><div className="flex items-center gap-3"><div className="p-2 bg-success/10 rounded-sm border border-success/20"><Layers className="w-5 h-5 text-success" /></div><div><p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Total Sheets</p><p className="font-display text-2xl font-bold">{formatNumber(totalSheets)}</p></div></div></CardContent></Card>
                <Card className="industrial-card"><CardContent className="p-4"><div className="flex items-center gap-3"><div className="p-2 bg-info/10 rounded-sm border border-info/20"><ShoppingCart className="w-5 h-5 text-info" /></div><div><p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Total Weight</p><p className="font-display text-2xl font-bold">{formatNumber(totalWeight)} kg</p></div></div></CardContent></Card>
            </div>

            <Card className="industrial-card">
                <CardHeader><CardTitle className="font-display text-xl font-bold tracking-tight uppercase">Raw Material Inventory</CardTitle></CardHeader>
                <TableSearch
                    searchValue={searchTerm}
                    onSearchChange={setSearchTerm}
                    searchPlaceholder="Search by SR No, supplier..."
                    filters={[
                        { key: 'gauge', label: 'Gauge', type: 'select', options: gaugeOptions, value: filterGauge, onChange: setFilterGauge },
                        { key: 'dateFrom', label: 'From Date', type: 'date', value: dateFrom, onChange: setDateFrom },
                        { key: 'dateTo', label: 'To Date', type: 'date', value: dateTo, onChange: setDateTo },
                    ]}
                    onClear={clearFilters}
                    resultCount={filteredPurchases.length}
                    totalCount={purchases.length}
                />
                <CardContent className="p-0">
                    {loading ? (
                        <div className="flex items-center justify-center h-48"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
                    ) : filteredPurchases.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-48 text-muted-foreground"><AlertCircle className="w-8 h-8 mb-2" /><p>{purchases.length === 0 ? 'No raw material entries found' : 'No matching entries'}</p></div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="data-table" data-testid="purchase-table">
                                <thead><tr><th>Date</th><th>Sr. No</th><th>Gauge</th><th>Size 1</th><th>Size 2</th><th>Temper</th><th>Weight</th><th>Total Sheets</th><th>Used</th><th>Available</th><th>Supplier</th><th>By</th><th></th></tr></thead>
                                <tbody>
                                    {paginatedPurchases.map((p) => (
                                        <tr key={p.id} data-testid={`purchase-row-${p.id}`}>
                                            <td>{formatDate(p.purchase_date)}</td>
                                            <td className="font-medium">{p.sr_no}</td>
                                            <td>{p.gauge}</td><td>{p.size1}</td><td>{p.size2}</td><td>{p.temper}</td>
                                            <td>{formatNumber(p.weight)} kg</td>
                                            <td className="font-mono">{formatNumber(p.no_of_sheets)}</td>
                                            <td className="text-warning font-mono">{formatNumber(p.sheets_used || 0)}</td>
                                            <td className="text-success font-bold font-mono">{formatNumber(p.sheets_available ?? (p.no_of_sheets - (p.sheets_used || 0)))}</td>
                                            <td>{p.supplier || '-'}</td>
                                            <td className="text-muted-foreground">{p.created_by}</td>
                                            <td>
                                                <div className="flex gap-1">
                                                    <Button variant="ghost" size="icon" onClick={() => openEdit(p)} className="text-muted-foreground hover:text-primary"><Pencil className="w-4 h-4" /></Button>
                                                    <Button variant="ghost" size="icon" onClick={() => setDeleteTarget(p.id)} className="text-muted-foreground hover:text-destructive"><Trash2 className="w-4 h-4" /></Button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                    <TablePagination currentPage={currentPage} totalPages={totalPages} pageSize={pageSize} totalItems={filteredPurchases.length} startIndex={startIndex} onPageChange={setCurrentPage} onPageSizeChange={setPageSize} pageSizeOptions={PAGE_SIZE_OPTIONS} />
                </CardContent>
            </Card>
        </div>
    );
};

export default Purchase;
