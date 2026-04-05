import React, { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Badge } from '../components/ui/badge';
import ConfirmDialog from '../components/ConfirmDialog';
import TableSearch from '../components/TableSearch';
import TablePagination from '../components/TablePagination';
import SortableHeader from '../components/SortableHeader';
import { useTableFilter } from '../hooks/useTableFilter';
import { usePagination } from '../hooks/usePagination';
import { useTableSort } from '../hooks/useTableSort';
import { purchaseOrdersAPI, brandsAPI, sizesAPI, customersAPI } from '../lib/api';
import SearchableSelect from '../components/SearchableSelect';
import { formatDate, formatNumber, parseImportDate } from '../lib/utils';
import { Plus, Trash2, Pencil, ClipboardList, Loader2, AlertCircle, Download, Check, RotateCcw } from 'lucide-react';
import { toast } from 'sonner';
import { exportToExcel } from '../lib/exportToExcel';
import ImportExcelButton from '../components/ImportExcelButton';

const PO_EXPORT_COLUMNS = [
    { header: '#', key: 'id', transform: (v, row, idx) => idx + 1 },
    { header: 'Date', key: 'date', transform: (v) => formatDate(v) },
    { header: 'Company', key: 'company_name' },
    { header: 'Brand', key: 'brand_name' },
    { header: 'Size', key: 'size_name' },
    { header: 'Quantity', key: 'quantity' },
    { header: 'Dispatched', key: 'quantity_dispatched' },
    { header: 'Pending', key: 'quantity', transform: (v, row) => Math.max(0, (row.quantity || 0) - (row.quantity_dispatched || 0)) },
    { header: 'Status', key: 'is_completed', transform: (v) => v ? 'Completed' : 'Active' },
    { header: 'Created By', key: 'created_by' },
];

const PurchaseOrders = () => {
    const [orders, setOrders] = useState([]);
    const [brands, setBrands] = useState([]);
    const [sizes, setSizes] = useState([]);
    const [customers, setCustomers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [dialogOpen, setDialogOpen] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [editingId, setEditingId] = useState(null);
    const [deleteTarget, setDeleteTarget] = useState(null);
    const [activeTab, setActiveTab] = useState('active');

    // Multi-item form state
    const [formCompany, setFormCompany] = useState('');
    const [formDate, setFormDate] = useState(new Date().toISOString().split('T')[0]);
    const [currentBrandId, setCurrentBrandId] = useState('');
    const [currentSizeId, setCurrentSizeId] = useState('');
    const [currentQuantity, setCurrentQuantity] = useState('');
    const [formItems, setFormItems] = useState([]);

    // Single-item edit form (for editing existing PO)
    const [editForm, setEditForm] = useState({ company_name: '', brand_id: '', size_id: '', quantity: '', notes: '', date: '' });

    const [searchTerm, setSearchTerm] = useState('');
    const [dateFrom, setDateFrom] = useState('');
    const [dateTo, setDateTo] = useState('');
    const [filterCompany, setFilterCompany] = useState('');

    // Split orders into active and completed
    const activeOrders = useMemo(() => orders.filter(o => !o.is_completed), [orders]);
    const completedOrders = useMemo(() => orders.filter(o => o.is_completed), [orders]);
    const currentOrders = activeTab === 'active' ? activeOrders : completedOrders;

    const filters = useMemo(() => [
        ...(dateFrom ? [{ key: 'date', value: dateFrom, type: 'dateFrom' }] : []),
        ...(dateTo ? [{ key: 'date', value: dateTo, type: 'dateTo' }] : []),
        ...(filterCompany ? [{ key: 'company_name', value: filterCompany, type: 'exact' }] : []),
    ], [dateFrom, dateTo, filterCompany]);

    const filteredOrders = useTableFilter({
        data: currentOrders, searchTerm, searchFields: ['serial_no', 'company_name', 'brand_name', 'size_name'], filters
    });

    const { sortedData, sortKey, sortDir, requestSort } = useTableSort({
        data: filteredOrders, defaultSortKey: 'date', defaultSortDir: 'desc'
    });

    const { paginatedData: paginatedOrders, currentPage, totalPages, pageSize, setCurrentPage, setPageSize, startIndex, PAGE_SIZE_OPTIONS } = usePagination({ data: sortedData });

    // Unique companies for filter dropdown
    const companyOptions = useMemo(() => {
        const names = [...new Set(orders.map(o => o.company_name))].sort();
        return names.map(n => ({ value: n, label: n }));
    }, [orders]);

    useEffect(() => { fetchData(); }, []);

    const fetchData = async () => {
        try {
            setLoading(true);
            const [ordersRes, brandsRes, sizesRes, customersRes] = await Promise.all([
                purchaseOrdersAPI.getAll(), brandsAPI.getAll(), sizesAPI.getAll(), customersAPI.getAll()
            ]);
            setOrders(ordersRes.data); setBrands(brandsRes.data); setSizes(sizesRes.data); setCustomers(customersRes.data);
        } catch (err) { toast.error('Failed to load data'); }
        finally { setLoading(false); }
    };

    const resetForm = () => {
        setFormCompany(''); setFormDate(new Date().toISOString().split('T')[0]);
        setCurrentBrandId(''); setCurrentSizeId(''); setCurrentQuantity('');
        setFormItems([]);
    };

    const openCreate = () => { setEditingId(null); resetForm(); setDialogOpen(true); };

    const openEdit = (po) => {
        setEditingId(po.id);
        setEditForm({
            company_name: po.company_name, brand_id: po.brand_id || '', size_id: po.size_id || '',
            quantity: String(po.quantity), notes: po.notes || '',
            date: po.date ? po.date.split('T')[0] : new Date().toISOString().split('T')[0],
        });
        setDialogOpen(true);
    };

    const handleAddItem = () => {
        if (!currentBrandId || !currentSizeId || !currentQuantity) { toast.error('Please select brand, size and enter quantity'); return; }
        const brand = brands.find(b => b.id === currentBrandId);
        const size = sizes.find(s => s.id === currentSizeId);
        if (!brand || !size) return;
        setFormItems([...formItems, {
            brand_id: brand.id, brand_name: brand.name,
            size_id: size.id, size_name: size.name,
            quantity: parseInt(currentQuantity),
        }]);
        setCurrentBrandId(''); setCurrentSizeId(''); setCurrentQuantity('');
    };

    const handleRemoveItem = (index) => { setFormItems(formItems.filter((_, i) => i !== index)); };

    const handleSubmitCreate = async (e) => {
        e.preventDefault();
        if (!formCompany || formItems.length === 0) { toast.error('Please select customer and add at least one item'); return; }
        setSubmitting(true);
        try {
            for (const item of formItems) {
                await purchaseOrdersAPI.create({
                    date: new Date(formDate).toISOString(),
                    company_name: formCompany,
                    brand_id: item.brand_id, brand_name: item.brand_name,
                    size_id: item.size_id, size_name: item.size_name,
                    quantity: item.quantity,
                });
            }
            toast.success(`${formItems.length} purchase order(s) created`);
            setDialogOpen(false); resetForm(); fetchData();
        } catch (err) { toast.error(err.response?.data?.detail || 'Failed to create orders'); }
        finally { setSubmitting(false); }
    };

    const handleSubmitEdit = async (e) => {
        e.preventDefault();
        if (!editForm.company_name || !editForm.brand_id || !editForm.size_id || !editForm.quantity) {
            toast.error('Please fill all required fields'); return;
        }
        setSubmitting(true);
        try {
            const brand = brands.find(b => b.id === editForm.brand_id);
            const size = sizes.find(s => s.id === editForm.size_id);
            await purchaseOrdersAPI.update(editingId, {
                date: new Date(editForm.date).toISOString(),
                company_name: editForm.company_name,
                brand_id: editForm.brand_id, brand_name: brand?.name || '',
                size_id: editForm.size_id, size_name: size?.name || '',
                quantity: parseInt(editForm.quantity),
                notes: editForm.notes || null,
            });
            toast.success('Order updated');
            setDialogOpen(false); fetchData();
        } catch (err) { toast.error(err.response?.data?.detail || 'Failed to save order'); }
        finally { setSubmitting(false); }
    };

    const handleDelete = async () => {
        if (!deleteTarget) return;
        try { await purchaseOrdersAPI.delete(deleteTarget); toast.success('Order deleted'); fetchData(); }
        catch (err) { toast.error('Failed to delete'); }
        finally { setDeleteTarget(null); }
    };

    const handleToggleComplete = async (po) => {
        try {
            await purchaseOrdersAPI.toggleComplete(po.id);
            toast.success(po.is_completed ? 'Order reopened' : 'Order marked as completed');
            fetchData();
        } catch (err) { toast.error('Failed to update status'); }
    };

    const clearFilters = () => { setSearchTerm(''); setDateFrom(''); setDateTo(''); setFilterCompany(''); };

    const totalOrders = activeOrders.length;
    const totalQuantity = activeOrders.reduce((sum, o) => sum + (o.quantity || 0), 0);
    const totalPending = activeOrders.reduce((sum, o) => sum + Math.max(0, (o.quantity || 0) - (o.quantity_dispatched || 0)), 0);

    return (
        <div className="space-y-6 animate-fade-in" data-testid="purchase-orders-page">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <p className="text-muted-foreground">Track customer purchase orders from receipt to delivery</p>
                <div className="flex gap-2">
                    <Button variant="outline" onClick={() => {
                        if (exportToExcel({ data: filteredOrders, columns: PO_EXPORT_COLUMNS, fileName: 'Purchase_Orders', sheetName: 'Purchase Orders' })) toast.success('Exported to Excel');
                        else toast.error('No data to export');
                    }} className="font-bold uppercase tracking-wider rounded-sm" data-testid="export-po-btn">
                        <Download className="w-4 h-4 mr-2" /> Export
                    </Button>
                    <ImportExcelButton
                        columns={[
                            { header: 'Date', key: 'date' },
                            { header: 'Company', key: 'company_name' },
                            { header: 'Brand', key: 'brand_name' },
                            { header: 'Size', key: 'size_name' },
                            { header: 'Quantity', key: 'quantity' },
                            { header: 'Notes', key: 'notes' },
                        ]}
                        templateName="Purchase_Orders"
                        onImport={async (rows, onProgress) => {
                            let success = 0, failed = 0;
                            for (const row of rows) {
                                try {
                                    if (!row.company_name || !row.brand_name || !row.size_name || !row.quantity) { failed++; onProgress(success + failed); continue; }
                                    const brand = brands.find(b => b.name.toLowerCase() === String(row.brand_name).toLowerCase().trim());
                                    const size = sizes.find(s => s.name.toLowerCase() === String(row.size_name).toLowerCase().trim());
                                    if (!brand || !size) { failed++; onProgress(success + failed); continue; }
                                    await purchaseOrdersAPI.create({
                                        date: parseImportDate(row.date) || new Date().toISOString(),
                                        company_name: String(row.company_name).trim(),
                                        brand_id: brand.id, brand_name: brand.name,
                                        size_id: size.id, size_name: size.name,
                                        quantity: parseInt(row.quantity),
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
                    <Button onClick={openCreate} className="font-bold uppercase tracking-wider rounded-sm" data-testid="add-po-btn">
                        <Plus className="w-4 h-4 mr-2" /> New Order
                    </Button>
                </div>
            </div>

            {/* Create Dialog (multi-item) */}
            <Dialog open={dialogOpen && !editingId} onOpenChange={(open) => { if (!open) { setDialogOpen(false); resetForm(); } }}>
                <DialogContent className="bg-card border-border rounded-sm max-w-xl max-h-[90vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle className="font-display text-xl font-bold tracking-tight uppercase">New Purchase Order</DialogTitle>
                    </DialogHeader>
                    <form onSubmit={handleSubmitCreate} className="space-y-4 mt-4">
                        <div className="space-y-2">
                            <Label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Date *</Label>
                            <Input type="date" value={formDate} onChange={(e) => setFormDate(e.target.value)} className="bg-background border-input rounded-sm font-mono" data-testid="po-date" />
                        </div>
                        <div className="space-y-2">
                            <Label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Customer *</Label>
                            <SearchableSelect
                                options={customers.map(c => ({ value: c.name, label: c.name }))}
                                value={formCompany}
                                onValueChange={setFormCompany}
                                placeholder="Select customer"
                                searchPlaceholder="Search customers..."
                                data-testid="po-company"
                            />
                        </div>
                        <div className="border-t border-border pt-4"><Label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Add Items (Brand, Size, Qty)</Label></div>
                        <div className="grid grid-cols-4 gap-2">
                            <Select value={currentBrandId} onValueChange={setCurrentBrandId}>
                                <SelectTrigger className="bg-background border-input rounded-sm" data-testid="po-brand"><SelectValue placeholder="Brand" /></SelectTrigger>
                                <SelectContent className="bg-card border-border rounded-sm max-h-60">{brands.map(b => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}</SelectContent>
                            </Select>
                            <Select value={currentSizeId} onValueChange={setCurrentSizeId}>
                                <SelectTrigger className="bg-background border-input rounded-sm" data-testid="po-size"><SelectValue placeholder="Size" /></SelectTrigger>
                                <SelectContent className="bg-card border-border rounded-sm">{sizes.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
                            </Select>
                            <Input type="number" value={currentQuantity} onChange={(e) => setCurrentQuantity(e.target.value)} placeholder="Qty" className="bg-background border-input rounded-sm font-mono" data-testid="po-quantity" />
                            <Button type="button" onClick={handleAddItem} className="rounded-sm" data-testid="add-po-item-btn"><Plus className="w-4 h-4 mr-1" /> Add</Button>
                        </div>
                        {formItems.length > 0 && (
                            <div className="space-y-2">
                                <Label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Items ({formItems.length})</Label>
                                <div className="space-y-1 max-h-40 overflow-y-auto">
                                    {formItems.map((item, idx) => (
                                        <div key={idx} className="flex items-center justify-between p-2 bg-secondary/50 rounded-sm">
                                            <div className="flex items-center gap-2">
                                                <span className="text-sm font-medium">{item.brand_name}</span>
                                                <Badge variant="outline">{item.size_name}</Badge>
                                                <Badge variant="secondary" className="font-mono">{formatNumber(item.quantity)} qty</Badge>
                                            </div>
                                            <Button type="button" variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground hover:text-destructive" onClick={() => handleRemoveItem(idx)}><Trash2 className="w-3 h-3" /></Button>
                                        </div>
                                    ))}
                                </div>
                                <div className="flex justify-between text-sm p-2 bg-success/10 rounded-sm border border-success/20">
                                    <span className="font-bold uppercase tracking-wider">Total Quantity</span>
                                    <span className="font-mono font-bold text-success">{formatNumber(formItems.reduce((sum, i) => sum + (i.quantity || 0), 0))}</span>
                                </div>
                            </div>
                        )}
                        <Button type="submit" className="w-full font-bold uppercase tracking-wider rounded-sm" disabled={submitting || formItems.length === 0 || !formCompany} data-testid="submit-po-create">
                            {submitting ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Creating...</> : `Create ${formItems.length} Order(s)`}
                        </Button>
                    </form>
                </DialogContent>
            </Dialog>

            {/* Edit Dialog (single item) */}
            <Dialog open={dialogOpen && !!editingId} onOpenChange={(open) => { if (!open) { setDialogOpen(false); setEditingId(null); } }}>
                <DialogContent className="bg-card border-border rounded-sm max-w-md">
                    <DialogHeader>
                        <DialogTitle className="font-display text-xl font-bold tracking-tight uppercase">Edit Purchase Order</DialogTitle>
                    </DialogHeader>
                    <form onSubmit={handleSubmitEdit} className="space-y-4 mt-4">
                        <div className="space-y-2">
                            <Label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Date *</Label>
                            <Input type="date" value={editForm.date} onChange={(e) => setEditForm({ ...editForm, date: e.target.value })} className="bg-background border-input rounded-sm font-mono" />
                        </div>
                        <div className="space-y-2">
                            <Label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Customer *</Label>
                            <SearchableSelect
                                options={customers.map(c => ({ value: c.name, label: c.name }))}
                                value={editForm.company_name}
                                onValueChange={(v) => setEditForm({ ...editForm, company_name: v })}
                                placeholder="Select customer"
                                searchPlaceholder="Search customers..."
                            />
                        </div>
                        <div className="space-y-2">
                            <Label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Brand *</Label>
                            <Select value={editForm.brand_id} onValueChange={(v) => setEditForm({ ...editForm, brand_id: v })}>
                                <SelectTrigger className="bg-background border-input rounded-sm"><SelectValue placeholder="Select brand" /></SelectTrigger>
                                <SelectContent className="bg-card border-border rounded-sm max-h-60">{brands.map(b => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}</SelectContent>
                            </Select>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Size *</Label>
                                <Select value={editForm.size_id} onValueChange={(v) => setEditForm({ ...editForm, size_id: v })}>
                                    <SelectTrigger className="bg-background border-input rounded-sm"><SelectValue placeholder="Select" /></SelectTrigger>
                                    <SelectContent className="bg-card border-border rounded-sm">{sizes.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-2">
                                <Label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Quantity *</Label>
                                <Input type="number" value={editForm.quantity} onChange={(e) => setEditForm({ ...editForm, quantity: e.target.value })} placeholder="0" className="bg-background border-input rounded-sm font-mono" />
                            </div>
                        </div>
                        <Button type="submit" className="w-full font-bold uppercase tracking-wider rounded-sm" disabled={submitting}>
                            {submitting ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Saving...</> : 'Update Order'}
                        </Button>
                    </form>
                </DialogContent>
            </Dialog>

            <ConfirmDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)} title="Delete Purchase Order?" description="This will permanently remove this purchase order." onConfirm={handleDelete} />

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <Card className="industrial-card"><CardContent className="p-4"><div className="flex items-center gap-3"><div className="p-2 bg-primary/10 rounded-sm border border-primary/20"><ClipboardList className="w-5 h-5 text-primary" /></div><div><p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Active Orders</p><p className="font-display text-2xl font-bold">{totalOrders}</p></div></div></CardContent></Card>
                <Card className="industrial-card"><CardContent className="p-4"><div className="flex items-center gap-3"><div className="p-2 bg-success/10 rounded-sm border border-success/20"><ClipboardList className="w-5 h-5 text-success" /></div><div><p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Total Quantity</p><p className="font-display text-2xl font-bold">{formatNumber(totalQuantity)}</p></div></div></CardContent></Card>
                <Card className="industrial-card"><CardContent className="p-4"><div className="flex items-center gap-3"><div className="p-2 bg-warning/10 rounded-sm border border-warning/20"><ClipboardList className="w-5 h-5 text-warning" /></div><div><p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Pending Qty</p><p className="font-display text-2xl font-bold">{formatNumber(totalPending)}</p></div></div></CardContent></Card>
            </div>

            <Card className="industrial-card">
                <CardHeader>
                    <div className="flex items-center justify-between">
                        <CardTitle className="font-display text-xl font-bold tracking-tight uppercase">Purchase Orders</CardTitle>
                        <div className="flex gap-1">
                            <button
                                onClick={() => { setActiveTab('active'); setCurrentPage(1); }}
                                className={`text-xs px-4 py-2 font-bold uppercase tracking-wider rounded-sm transition-colors ${activeTab === 'active' ? 'bg-primary text-primary-foreground' : 'bg-secondary/50 text-muted-foreground hover:bg-secondary hover:text-foreground'}`}
                                data-testid="tab-active"
                            >
                                Active ({activeOrders.length})
                            </button>
                            <button
                                onClick={() => { setActiveTab('completed'); setCurrentPage(1); }}
                                className={`text-xs px-4 py-2 font-bold uppercase tracking-wider rounded-sm transition-colors ${activeTab === 'completed' ? 'bg-primary text-primary-foreground' : 'bg-secondary/50 text-muted-foreground hover:bg-secondary hover:text-foreground'}`}
                                data-testid="tab-completed"
                            >
                                Completed ({completedOrders.length})
                            </button>
                        </div>
                    </div>
                </CardHeader>
                <TableSearch
                    searchValue={searchTerm}
                    onSearchChange={setSearchTerm}
                    searchPlaceholder="Search by serial no, company, brand..."
                    filters={[
                        { key: 'company', label: 'Company', type: 'select', options: companyOptions, value: filterCompany, onChange: setFilterCompany },
                        { key: 'dateFrom', label: 'From Date', type: 'date', value: dateFrom, onChange: setDateFrom },
                        { key: 'dateTo', label: 'To Date', type: 'date', value: dateTo, onChange: setDateTo },
                    ]}
                    onClear={clearFilters}
                    resultCount={filteredOrders.length}
                    totalCount={currentOrders.length}
                />
                <CardContent className="p-0">
                    {loading ? (
                        <div className="flex items-center justify-center h-48"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
                    ) : filteredOrders.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-48 text-muted-foreground"><AlertCircle className="w-8 h-8 mb-2" /><p>{currentOrders.length === 0 ? `No ${activeTab} orders` : 'No matching orders'}</p></div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="data-table" data-testid="po-table">
                                <thead><tr><th>#</th>
                                    <SortableHeader label="Date" sortKey="date" currentSortKey={sortKey} currentSortDir={sortDir} onSort={requestSort} />
                                    <SortableHeader label="Company" sortKey="company_name" currentSortKey={sortKey} currentSortDir={sortDir} onSort={requestSort} />
                                    <SortableHeader label="Brand" sortKey="brand_name" currentSortKey={sortKey} currentSortDir={sortDir} onSort={requestSort} />
                                    <th>Size</th>
                                    <SortableHeader label="Qty" sortKey="quantity" currentSortKey={sortKey} currentSortDir={sortDir} onSort={requestSort} />
                                    <th>Dispatched</th>
                                    <th>Pending</th>
                                    <th>By</th>
                                    <th></th></tr></thead>
                                <tbody>
                                    {paginatedOrders.map((po, idx) => {
                                        const pending = Math.max(0, (po.quantity || 0) - (po.quantity_dispatched || 0));
                                        return (
                                            <tr key={po.id} data-testid={`po-row-${po.id}`}>
                                                <td className="text-muted-foreground">{startIndex + idx + 1}</td>
                                                <td>{formatDate(po.date)}</td>
                                                <td className="font-medium">{po.company_name}</td>
                                                <td>{po.brand_name}</td>
                                                <td><Badge variant="outline">{po.size_name}</Badge></td>
                                                <td className="font-mono">{formatNumber(po.quantity)}</td>
                                                <td className="font-mono text-success">{formatNumber(po.quantity_dispatched || 0)}</td>
                                                <td className={`font-mono font-bold ${pending > 0 ? 'text-warning' : 'text-success'}`}>{formatNumber(pending)}</td>
                                                <td className="text-muted-foreground">{po.created_by}</td>
                                                <td>
                                                    <div className="flex gap-1">
                                                        <Button
                                                            variant="ghost" size="icon"
                                                            onClick={() => handleToggleComplete(po)}
                                                            className={po.is_completed ? 'text-muted-foreground hover:text-warning' : 'text-muted-foreground hover:text-success'}
                                                            title={po.is_completed ? 'Reopen order' : 'Mark as completed'}
                                                            data-testid={`complete-po-${po.id}`}
                                                        >
                                                            {po.is_completed ? <RotateCcw className="w-4 h-4" /> : <Check className="w-4 h-4" />}
                                                        </Button>
                                                        {!po.is_completed && (
                                                            <Button variant="ghost" size="icon" onClick={() => openEdit(po)} className="text-muted-foreground hover:text-primary"><Pencil className="w-4 h-4" /></Button>
                                                        )}
                                                        <Button variant="ghost" size="icon" onClick={() => setDeleteTarget(po.id)} className="text-muted-foreground hover:text-destructive"><Trash2 className="w-4 h-4" /></Button>
                                                    </div>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    )}
                    <TablePagination currentPage={currentPage} totalPages={totalPages} pageSize={pageSize} totalItems={filteredOrders.length} startIndex={startIndex} onPageChange={setCurrentPage} onPageSizeChange={setPageSize} pageSizeOptions={PAGE_SIZE_OPTIONS} />
                </CardContent>
            </Card>
        </div>
    );
};

export default PurchaseOrders;
