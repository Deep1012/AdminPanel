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
import { useTableFilter } from '../hooks/useTableFilter';
import { usePagination } from '../hooks/usePagination';
import { productionAPI, brandsAPI, sizesAPI } from '../lib/api';
import { formatDate, formatNumber } from '../lib/utils';
import { Plus, Trash2, Pencil, Factory, Loader2, AlertCircle, Download } from 'lucide-react';
import { toast } from 'sonner';
import { exportToExcel } from '../lib/exportToExcel';

const PRODUCTION_EXPORT_COLUMNS = [
    { header: 'Date', key: 'production_date', transform: (v) => formatDate(v) },
    { header: 'Size', key: 'size_name' },
    { header: 'Brand', key: 'brand_name' },
    { header: 'Printing Stock Used', key: 'printing_stock_used', transform: (v) => v || 0 },
    { header: 'Qty Produced', key: 'quantity_produced' },
    { header: 'Notes', key: 'notes', transform: (v) => v || '-' },
    { header: 'Created By', key: 'created_by' },
];

const emptyForm = {
    brand_id: '', size_id: '', quantity_produced: '', printing_stock_used: '', notes: '',
    production_date: new Date().toISOString().split('T')[0]
};

const Production = () => {
    const [production, setProduction] = useState([]);
    const [brands, setBrands] = useState([]);
    const [sizes, setSizes] = useState([]);
    const [loading, setLoading] = useState(true);
    const [dialogOpen, setDialogOpen] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [editingId, setEditingId] = useState(null);
    const [formData, setFormData] = useState({ ...emptyForm });
    const [deleteTarget, setDeleteTarget] = useState(null);

    const [searchTerm, setSearchTerm] = useState('');
    const [dateFrom, setDateFrom] = useState('');
    const [dateTo, setDateTo] = useState('');

    const filters = useMemo(() => [
        ...(dateFrom ? [{ key: 'production_date', value: dateFrom, type: 'dateFrom' }] : []),
        ...(dateTo ? [{ key: 'production_date', value: dateTo, type: 'dateTo' }] : []),
    ], [dateFrom, dateTo]);

    const filteredProduction = useTableFilter({
        data: production, searchTerm, searchFields: ['brand_name', 'size_name'], filters
    });

    const { paginatedData: paginatedProduction, currentPage, totalPages, pageSize, setCurrentPage, setPageSize, startIndex, PAGE_SIZE_OPTIONS } = usePagination({ data: filteredProduction });

    useEffect(() => { fetchData(); }, []);

    const fetchData = async () => {
        try {
            setLoading(true);
            const [prodRes, brandsRes, sizesRes] = await Promise.all([
                productionAPI.getAll(), brandsAPI.getAll(), sizesAPI.getAll()
            ]);
            setProduction(prodRes.data); setBrands(brandsRes.data); setSizes(sizesRes.data);
        } catch (err) { toast.error('Failed to load data'); }
        finally { setLoading(false); }
    };

    const openCreate = () => { setEditingId(null); setFormData({ ...emptyForm }); setDialogOpen(true); };
    const openEdit = (entry) => {
        setEditingId(entry.id);
        setFormData({
            brand_id: entry.brand_id || '', size_id: entry.size_id || '',
            quantity_produced: String(entry.quantity_produced), printing_stock_used: String(entry.printing_stock_used || ''),
            notes: entry.notes || '',
            production_date: entry.production_date ? entry.production_date.split('T')[0] : new Date().toISOString().split('T')[0],
        });
        setDialogOpen(true);
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!formData.brand_id || !formData.size_id || !formData.quantity_produced || !formData.printing_stock_used) {
            toast.error('Please fill all required fields'); return;
        }
        setSubmitting(true);
        try {
            const brand = brands.find(b => b.id === formData.brand_id);
            const size = sizes.find(s => s.id === formData.size_id);
            const payload = {
                brand_id: formData.brand_id, brand_name: brand?.name || '',
                size_id: formData.size_id, size_name: size?.name || '',
                quantity_produced: parseInt(formData.quantity_produced),
                printing_stock_used: parseInt(formData.printing_stock_used),
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

    const totalProduced = production.reduce((sum, p) => sum + (p.quantity_produced || 0), 0);
    const totalPrintingUsed = production.reduce((sum, p) => sum + (p.printing_stock_used || 0), 0);

    return (
        <div className="space-y-6 animate-fade-in" data-testid="production-page">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <p className="text-muted-foreground">Record finished goods production</p>
                <div className="flex gap-2">
                    <Button variant="outline" onClick={() => {
                        const data = filteredProduction.length > 0 ? filteredProduction : production;
                        if (exportToExcel({ data, columns: PRODUCTION_EXPORT_COLUMNS, fileName: 'Production', sheetName: 'Production' })) toast.success('Exported to Excel');
                        else toast.error('No data to export');
                    }} className="font-bold uppercase tracking-wider rounded-sm" data-testid="export-production-btn">
                        <Download className="w-4 h-4 mr-2" /> Export
                    </Button>
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
                                <SelectContent className="bg-card border-border rounded-sm max-h-60">{brands.map(b => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}</SelectContent>
                            </Select>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Printing Stock Used *</Label>
                                <Input type="number" value={formData.printing_stock_used} onChange={(e) => setFormData({ ...formData, printing_stock_used: e.target.value })} placeholder="0" className="bg-background border-input rounded-sm font-mono" data-testid="prod-printing-used" />
                            </div>
                            <div className="space-y-2">
                                <Label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Qty Produced *</Label>
                                <Input type="number" value={formData.quantity_produced} onChange={(e) => setFormData({ ...formData, quantity_produced: e.target.value })} placeholder="0" className="bg-background border-input rounded-sm font-mono" data-testid="prod-quantity" />
                            </div>
                        </div>
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
                <Card className="industrial-card"><CardContent className="p-4"><div className="flex items-center gap-3"><div className="p-2 bg-primary/10 rounded-sm border border-primary/20"><Factory className="w-5 h-5 text-primary" /></div><div><p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Total Entries</p><p className="font-display text-2xl font-bold">{production.length}</p></div></div></CardContent></Card>
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
                    totalCount={production.length}
                />
                <CardContent className="p-0">
                    {loading ? (
                        <div className="flex items-center justify-center h-48"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
                    ) : filteredProduction.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-48 text-muted-foreground"><AlertCircle className="w-8 h-8 mb-2" /><p>{production.length === 0 ? 'No production records' : 'No matching records'}</p></div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="data-table" data-testid="production-table">
                                <thead><tr><th>Date</th><th>Size</th><th>Brand</th><th>Printing Used</th><th>Qty Produced</th><th>Notes</th><th>By</th><th></th></tr></thead>
                                <tbody>
                                    {paginatedProduction.map((entry) => (
                                        <tr key={entry.id} data-testid={`production-row-${entry.id}`}>
                                            <td>{formatDate(entry.production_date)}</td>
                                            <td className="font-medium">{entry.size_name}</td>
                                            <td>{entry.brand_name}</td>
                                            <td className="font-mono text-warning">{formatNumber(entry.printing_stock_used || 0)}</td>
                                            <td className="font-mono text-success font-bold">{formatNumber(entry.quantity_produced)}</td>
                                            <td className="max-w-xs truncate text-muted-foreground">{entry.notes || '-'}</td>
                                            <td className="text-muted-foreground">{entry.created_by}</td>
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
