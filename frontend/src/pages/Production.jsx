import React, { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Textarea } from '../components/ui/textarea';
import ConfirmDialog from '../components/ConfirmDialog';
import TableSearch from '../components/TableSearch';
import TablePagination from '../components/TablePagination';
import SortableHeader from '../components/SortableHeader';
import { useTableFilter } from '../hooks/useTableFilter';
import { usePagination } from '../hooks/usePagination';
import { useTableSort } from '../hooks/useTableSort';
import { productionAPI, brandsAPI, sizesAPI, dashboardAPI } from '../lib/api';

const EXCLUDED_BRAND_NAMES = ['BOTTOM', 'TOP', 'LID', 'BOTTOM LWBF', 'LID LWBF'];
import { formatDate, formatNumber, parseImportDate } from '../lib/utils';
import { Plus, Trash2, Pencil, Factory, Loader2, AlertCircle, Download } from 'lucide-react';
import { toast } from 'sonner';
import { exportToExcel } from '../lib/exportToExcel';
import ImportExcelButton from '../components/ImportExcelButton';

const PRODUCTION_EXPORT_COLUMNS = [
    { header: 'Date', key: 'production_date', transform: (v) => formatDate(v) },
    { header: 'Size', key: 'size_name' },
    { header: 'Brand', key: 'brand_name' },
    { header: 'Printing Stock Used', key: 'printing_stock_used', transform: (v) => v || 0 },
    { header: 'Qty Produced', key: 'quantity_produced' },
    { header: 'Notes', key: 'notes', transform: (v) => v || '-' },
    { header: 'Created By', key: 'created_by' },
    { header: 'Updated By', key: 'updated_by', transform: (v) => v || '-' },
];

const emptyForm = {
    brand_id: '', size_id: '', quantity_produced: '', notes: '',
    production_date: new Date().toISOString().split('T')[0]
};

const Production = () => {
    const [production, setProduction] = useState([]);
    const [brands, setBrands] = useState([]);
    const [sizes, setSizes] = useState([]);
    const [printingStock, setPrintingStock] = useState([]);
    const [loading, setLoading] = useState(true);
    const [dialogOpen, setDialogOpen] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [editingId, setEditingId] = useState(null);
    const [formData, setFormData] = useState({ ...emptyForm });
    const [deleteTarget, setDeleteTarget] = useState(null);

    const [searchTerm, setSearchTerm] = useState('');
    const [dateFrom, setDateFrom] = useState('');
    const [dateTo, setDateTo] = useState('');

    // Hide auto-cascaded entries (BOTTOM/TOP/LID/LWBF) from display
    const visibleProduction = useMemo(() =>
        production.filter(p => !EXCLUDED_BRAND_NAMES.includes(p.brand_name?.toUpperCase())),
        [production]
    );

    const filters = useMemo(() => [
        ...(dateFrom ? [{ key: 'production_date', value: dateFrom, type: 'dateFrom' }] : []),
        ...(dateTo ? [{ key: 'production_date', value: dateTo, type: 'dateTo' }] : []),
    ], [dateFrom, dateTo]);

    const filteredProduction = useTableFilter({
        data: visibleProduction, searchTerm, searchFields: ['brand_name', 'size_name', 'created_by'], filters
    });

    const { sortedData, sortKey, sortDir, requestSort } = useTableSort({
        data: filteredProduction, defaultSortKey: 'production_date', defaultSortDir: 'desc'
    });

    const { paginatedData: paginatedProduction, currentPage, totalPages, pageSize, setCurrentPage, setPageSize, startIndex, PAGE_SIZE_OPTIONS } = usePagination({ data: sortedData });

    useEffect(() => { fetchData(); }, []);

    const fetchData = async () => {
        try {
            setLoading(true);
            const [prodRes, brandsRes, sizesRes, stockRes] = await Promise.all([
                productionAPI.getAll(), brandsAPI.getAll(), sizesAPI.getAll(), dashboardAPI.getPrintingStockList()
            ]);
            setProduction(prodRes.data); setBrands(brandsRes.data); setSizes(sizesRes.data); setPrintingStock(stockRes.data);
        } catch (err) { toast.error('Failed to load data'); }
        finally { setLoading(false); }
    };

    const openCreate = () => { setEditingId(null); setFormData({ ...emptyForm }); setDialogOpen(true); };
    const openEdit = (entry) => {
        setEditingId(entry.id);
        setFormData({
            brand_id: entry.brand_id || '', size_id: entry.size_id || '',
            quantity_produced: String(entry.quantity_produced),
            notes: entry.notes || '',
            production_date: entry.production_date ? entry.production_date.split('T')[0] : new Date().toISOString().split('T')[0],
        });
        setDialogOpen(true);
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!formData.brand_id || !formData.size_id || !formData.quantity_produced) {
            toast.error('Please fill all required fields'); return;
        }
        setSubmitting(true);
        try {
            const brand = brands.find(b => b.id === formData.brand_id);
            const size = sizes.find(s => s.id === formData.size_id);
            const qtyProduced = parseInt(formData.quantity_produced);
            const payload = {
                brand_id: formData.brand_id, brand_name: brand?.name || '',
                size_id: formData.size_id, size_name: size?.name || '',
                quantity_produced: qtyProduced,
                printing_stock_used: qtyProduced,
                notes: formData.notes || null,
                production_date: new Date(formData.production_date).toISOString(),
            };
            if (editingId) { await productionAPI.update(editingId, payload); toast.success('Entry updated'); }
            else { await productionAPI.create(payload); toast.success('Entry added'); }
            setDialogOpen(false); fetchData();
        } catch (err) { toast.error('Failed to save entry'); }
        finally { setSubmitting(false); }
    };

    const handleDelete = async () => {
        if (!deleteTarget) return;
        try { await productionAPI.delete(deleteTarget); toast.success('Entry deleted'); fetchData(); }
        catch (err) { toast.error('Failed to delete'); }
        finally { setDeleteTarget(null); }
    };

    const clearFilters = () => { setSearchTerm(''); setDateFrom(''); setDateTo(''); };

    const totalProduced = visibleProduction.reduce((sum, p) => sum + (p.quantity_produced || 0), 0);
    const totalPrintingUsed = visibleProduction.reduce((sum, p) => sum + (p.printing_stock_used || 0), 0);

    return (
        <div className="space-y-6 animate-fade-in" data-testid="production-page">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <p className="text-muted-foreground">Record finished goods production</p>
                <div className="flex gap-2">
                    <Button variant="outline" onClick={() => {
                        if (exportToExcel({ data: filteredProduction, columns: PRODUCTION_EXPORT_COLUMNS, fileName: 'Production', sheetName: 'Production' })) toast.success('Exported to Excel');
                        else toast.error('No data to export');
                    }} className="font-bold uppercase tracking-wider rounded-sm" data-testid="export-production-btn">
                        <Download className="w-4 h-4 mr-2" /> Export
                    </Button>
                    <ImportExcelButton
                        columns={[
                            { header: 'Brand', key: 'brand_name' },
                            { header: 'Size', key: 'size_name' },
                            { header: 'Qty Produced', key: 'quantity_produced' },
                            { header: 'Printing Stock Used', key: 'printing_stock_used' },
                            { header: 'Production Date', key: 'production_date' },
                            { header: 'Notes', key: 'notes' },
                        ]}
                        templateName="Production"
                        onImport={async (rows, onProgress) => {
                            let success = 0, failed = 0;
                            for (const row of rows) {
                                try {
                                    if (!row.brand_name || !row.size_name || !row.quantity_produced) { failed++; onProgress(success + failed); continue; }
                                    const brand = brands.find(b => b.name.toLowerCase() === String(row.brand_name).toLowerCase().trim());
                                    const size = sizes.find(s => s.name.toLowerCase() === String(row.size_name).toLowerCase().trim());
                                    if (!brand || !size) { failed++; onProgress(success + failed); continue; }
                                    await productionAPI.create({
                                        brand_id: brand.id, brand_name: brand.name,
                                        size_id: size.id, size_name: size.name,
                                        quantity_produced: parseInt(row.quantity_produced),
                                        printing_stock_used: parseInt(row.printing_stock_used) || 0,
                                        production_date: parseImportDate(row.production_date) || new Date().toISOString(),
                                        notes: row.notes || null,
                                    });
                                    success++;
                                } catch { failed++; }
                                onProgress(success + failed);
                            }
                            if (success > 0) fetchData();
                            return { success, failed };
                        }}
                    />
                    <Button onClick={openCreate} className="font-bold uppercase tracking-wider rounded-sm" data-testid="add-production-btn">
                        <Plus className="w-4 h-4 mr-2" /> Add Production
                    </Button>
                </div>
            </div>

            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                <DialogContent className="bg-card border-border rounded-sm max-w-md">
                    <DialogHeader>
                        <DialogTitle className="font-display text-xl font-bold tracking-tight uppercase">
                            {editingId ? 'Edit Production Entry' : 'Add Production Entry'}
                        </DialogTitle>
                    </DialogHeader>
                    <form onSubmit={handleSubmit} className="space-y-4 mt-4">
                        <div className="space-y-2">
                            <Label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Date *</Label>
                            <Input type="date" value={formData.production_date} onChange={(e) => setFormData({ ...formData, production_date: e.target.value })} className="bg-background border-input rounded-sm font-mono" data-testid="prod-date" />
                        </div>
                        <div className="space-y-2">
                            <Label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Size *</Label>
                            <Select value={formData.size_id} onValueChange={(v) => setFormData({ ...formData, size_id: v })}>
                                <SelectTrigger className="bg-background border-input rounded-sm" data-testid="prod-size"><SelectValue placeholder="Select size" /></SelectTrigger>
                                <SelectContent className="bg-card border-border rounded-sm">{sizes.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-2">
                            <Label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Brand *</Label>
                            <Select value={formData.brand_id} onValueChange={(v) => setFormData({ ...formData, brand_id: v })}>
                                <SelectTrigger className="bg-background border-input rounded-sm" data-testid="prod-brand"><SelectValue placeholder="Select brand" /></SelectTrigger>
                                <SelectContent className="bg-card border-border rounded-sm max-h-60">{brands.filter(b => !EXCLUDED_BRAND_NAMES.includes(b.name?.toUpperCase())).map(b => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}</SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-2">
                            <Label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Qty Produced *</Label>
                            <Input type="number" value={formData.quantity_produced} onChange={(e) => setFormData({ ...formData, quantity_produced: e.target.value })} placeholder="0" className="bg-background border-input rounded-sm font-mono" data-testid="prod-quantity" />
                            {formData.quantity_produced && (
                                <p className="text-xs text-muted-foreground">Printing stock used will be set to <span className="font-mono font-bold text-primary">{formatNumber(parseInt(formData.quantity_produced) || 0)}</span></p>
                            )}
                        </div>
                        {formData.size_id && formData.brand_id && (() => {
                            const size = sizes.find(s => s.id === formData.size_id);
                            const brand = brands.find(b => b.id === formData.brand_id);
                            const stock = printingStock.find(s => s.size_name === size?.name && s.brand_name === brand?.name);
                            return stock ? (
                                <div className="p-3 bg-primary/10 rounded-sm border border-primary/20 text-sm">
                                    <p className="text-xs font-bold uppercase text-muted-foreground mb-1">Available Printing Stock</p>
                                    <div className="grid grid-cols-3 gap-2">
                                        <div><p className="text-xs text-muted-foreground">Printed</p><p className="font-mono font-bold">{formatNumber(stock.printing_done)}</p></div>
                                        <div><p className="text-xs text-muted-foreground">Used</p><p className="font-mono">{formatNumber(stock.used_in_production)}</p></div>
                                        <div><p className="text-xs text-muted-foreground">Available</p><p className="font-mono font-bold text-primary">{formatNumber(stock.available)}</p></div>
                                    </div>
                                </div>
                            ) : null;
                        })()}
                        <div className="space-y-2">
                            <Label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Notes</Label>
                            <Textarea value={formData.notes} onChange={(e) => setFormData({ ...formData, notes: e.target.value })} placeholder="Optional notes..." className="bg-background border-input rounded-sm" data-testid="prod-notes" />
                        </div>
                        <Button type="submit" className="w-full font-bold uppercase tracking-wider rounded-sm" disabled={submitting} data-testid="submit-production">
                            {submitting ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Saving...</> : (editingId ? 'Update Entry' : 'Add Production')}
                        </Button>
                    </form>
                </DialogContent>
            </Dialog>

            <ConfirmDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)} title="Delete Production Entry?" description="This will permanently remove this production record." onConfirm={handleDelete} />

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <Card className="industrial-card"><CardContent className="p-4"><div className="flex items-center gap-3"><div className="p-2 bg-primary/10 rounded-sm border border-primary/20"><Factory className="w-5 h-5 text-primary" /></div><div><p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Total Entries</p><p className="font-display text-2xl font-bold">{visibleProduction.length}</p></div></div></CardContent></Card>
                <Card className="industrial-card"><CardContent className="p-4"><div className="flex items-center gap-3"><div className="p-2 bg-warning/10 rounded-sm border border-warning/20"><Factory className="w-5 h-5 text-warning" /></div><div><p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Printing Used</p><p className="font-display text-2xl font-bold">{formatNumber(totalPrintingUsed)}</p></div></div></CardContent></Card>
                <Card className="industrial-card"><CardContent className="p-4"><div className="flex items-center gap-3"><div className="p-2 bg-success/10 rounded-sm border border-success/20"><Factory className="w-5 h-5 text-success" /></div><div><p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Total Produced</p><p className="font-display text-2xl font-bold">{formatNumber(totalProduced)}</p></div></div></CardContent></Card>
            </div>

            <Card className="industrial-card">
                <CardHeader><CardTitle className="font-display text-xl font-bold tracking-tight uppercase">Production Records</CardTitle></CardHeader>
                <TableSearch
                    searchValue={searchTerm}
                    onSearchChange={setSearchTerm}
                    searchPlaceholder="Search by brand, size..."
                    filters={[
                        { key: 'dateFrom', label: 'From Date', type: 'date', value: dateFrom, onChange: setDateFrom },
                        { key: 'dateTo', label: 'To Date', type: 'date', value: dateTo, onChange: setDateTo },
                    ]}
                    onClear={clearFilters}
                    resultCount={filteredProduction.length}
                    totalCount={visibleProduction.length}
                />
                <CardContent className="p-0">
                    {loading ? (
                        <div className="flex items-center justify-center h-48"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
                    ) : filteredProduction.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-48 text-muted-foreground"><AlertCircle className="w-8 h-8 mb-2" /><p>{visibleProduction.length === 0 ? 'No production records' : 'No matching records'}</p></div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="data-table" data-testid="production-table">
                                <thead><tr><th>#</th>
                                    <SortableHeader label="Date" sortKey="production_date" currentSortKey={sortKey} currentSortDir={sortDir} onSort={requestSort} />
                                    <SortableHeader label="Size" sortKey="size_name" currentSortKey={sortKey} currentSortDir={sortDir} onSort={requestSort} />
                                    <SortableHeader label="Brand" sortKey="brand_name" currentSortKey={sortKey} currentSortDir={sortDir} onSort={requestSort} />
                                    <SortableHeader label="Printing Used" sortKey="printing_stock_used" currentSortKey={sortKey} currentSortDir={sortDir} onSort={requestSort} />
                                    <SortableHeader label="Qty Produced" sortKey="quantity_produced" currentSortKey={sortKey} currentSortDir={sortDir} onSort={requestSort} />
                                    <th>Notes</th><th>By</th><th>Updated By</th><th></th></tr></thead>
                                <tbody>
                                    {paginatedProduction.map((entry, idx) => (
                                        <tr key={entry.id} data-testid={`production-row-${entry.id}`}>
                                            <td className="text-muted-foreground">{startIndex + idx + 1}</td>
                                            <td>{formatDate(entry.production_date)}</td>
                                            <td className="font-medium">{entry.size_name}</td>
                                            <td>{entry.brand_name}</td>
                                            <td className="font-mono text-warning">{formatNumber(entry.printing_stock_used || 0)}</td>
                                            <td className="font-mono text-success font-bold">{formatNumber(entry.quantity_produced)}</td>
                                            <td className="max-w-xs truncate text-muted-foreground">{entry.notes || '-'}</td>
                                            <td className="text-muted-foreground">{entry.created_by}</td>
                                            <td className="text-muted-foreground">{entry.updated_by || '-'}</td>
                                            <td>
                                                <div className="flex gap-1">
                                                    <Button variant="ghost" size="icon" onClick={() => openEdit(entry)} className="text-muted-foreground hover:text-primary"><Pencil className="w-4 h-4" /></Button>
                                                    <Button variant="ghost" size="icon" onClick={() => setDeleteTarget(entry.id)} className="text-muted-foreground hover:text-destructive"><Trash2 className="w-4 h-4" /></Button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                    <TablePagination currentPage={currentPage} totalPages={totalPages} pageSize={pageSize} totalItems={filteredProduction.length} startIndex={startIndex} onPageChange={setCurrentPage} onPageSizeChange={setPageSize} pageSizeOptions={PAGE_SIZE_OPTIONS} />
                </CardContent>
            </Card>
        </div>
    );
};

export default Production;
