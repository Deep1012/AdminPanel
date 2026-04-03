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
import { dispatchAPI, brandsAPI, sizesAPI, customersAPI, purchaseOrdersAPI } from '../lib/api';
import SearchableSelect from '../components/SearchableSelect';
import { formatDate, formatNumber, parseImportDate } from '../lib/utils';
import { Plus, Trash2, Pencil, Truck, Loader2, AlertCircle, Download } from 'lucide-react';
import { toast } from 'sonner';
import { exportToExcel } from '../lib/exportToExcel';
import ImportExcelButton from '../components/ImportExcelButton';

const DISPATCH_EXPORT_COLUMNS = [
    { header: 'Date', key: 'dispatch_date', transform: (v) => formatDate(v) },
    { header: 'Order #', key: 'order_number' },
    { header: 'Customer', key: 'customer_name' },
    { header: 'Brand', key: 'brand_name' },
    { header: 'Size', key: 'size_name' },
    { header: 'Quantity', key: 'quantity' },
    { header: 'Created By', key: 'created_by' },
    { header: 'Updated By', key: 'updated_by', transform: (v) => v || '-' },
];

const Dispatch = () => {
    const [dispatches, setDispatches] = useState([]);
    const [brands, setBrands] = useState([]);
    const [sizes, setSizes] = useState([]);
    const [customers, setCustomers] = useState([]);
    const [purchaseOrders, setPurchaseOrders] = useState([]);
    const [loading, setLoading] = useState(true);
    const [dialogOpen, setDialogOpen] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [editingId, setEditingId] = useState(null);
    const [deleteTarget, setDeleteTarget] = useState(null);

    // Shared dispatch fields
    const [customerName, setCustomerName] = useState('');
    const [dispatchDate, setDispatchDate] = useState(new Date().toISOString().split('T')[0]);
    const [dispatchNotes, setDispatchNotes] = useState('');

    // Per-item input state
    const [currentBrandId, setCurrentBrandId] = useState('');
    const [currentSizeId, setCurrentSizeId] = useState('');
    const [currentQuantity, setCurrentQuantity] = useState('');
    const [currentPoId, setCurrentPoId] = useState('');

    // Multi-item list
    const [dispatchItems, setDispatchItems] = useState([]);

    const [searchTerm, setSearchTerm] = useState('');
    const [dateFrom, setDateFrom] = useState('');
    const [dateTo, setDateTo] = useState('');

    const filters = useMemo(() => [
        ...(dateFrom ? [{ key: 'dispatch_date', value: dateFrom, type: 'dateFrom' }] : []),
        ...(dateTo ? [{ key: 'dispatch_date', value: dateTo, type: 'dateTo' }] : []),
    ], [dateFrom, dateTo]);

    // Flatten dispatches: one row per item
    const flattenedRows = useMemo(() => {
        const rows = [];
        for (const d of dispatches) {
            const items = (d.items && d.items.length > 0) ? d.items : [{ brand_id: d.brand_id, brand_name: d.brand_name, size_id: d.size_id, size_name: d.size_name, quantity: d.quantity, purchase_order_id: d.purchase_order_id }];
            for (const item of items) {
                rows.push({
                    ...d,
                    brand_id: item.brand_id,
                    brand_name: item.brand_name,
                    size_id: item.size_id,
                    size_name: item.size_name,
                    quantity: item.quantity,
                    purchase_order_id: item.purchase_order_id,
                    _rowKey: `${d.id}_${item.brand_id}_${item.size_id}`,
                });
            }
        }
        return rows;
    }, [dispatches]);

    const filteredDispatches = useTableFilter({
        data: flattenedRows, searchTerm, searchFields: ['order_number', 'customer_name', 'brand_name', 'size_name', 'created_by'], filters
    });

    const { sortedData, sortKey, sortDir, requestSort } = useTableSort({
        data: filteredDispatches, defaultSortKey: 'dispatch_date', defaultSortDir: 'desc'
    });

    const { paginatedData: paginatedDispatches, currentPage, totalPages, pageSize, setCurrentPage, setPageSize, startIndex, PAGE_SIZE_OPTIONS } = usePagination({ data: sortedData });

    useEffect(() => { fetchData(); }, []);

    const fetchData = async () => {
        try {
            setLoading(true);
            const [dispatchRes, brandsRes, sizesRes, customersRes, poRes] = await Promise.all([
                dispatchAPI.getAll(), brandsAPI.getAll(), sizesAPI.getAll(), customersAPI.getAll(), purchaseOrdersAPI.getAll()
            ]);
            setDispatches(dispatchRes.data); setBrands(brandsRes.data); setSizes(sizesRes.data); setCustomers(customersRes.data); setPurchaseOrders(poRes.data);
        } catch (err) { toast.error('Failed to load data'); }
        finally { setLoading(false); }
    };

    const resetForm = () => {
        setCustomerName(''); setDispatchDate(new Date().toISOString().split('T')[0]); setDispatchNotes('');
        setCurrentBrandId(''); setCurrentSizeId(''); setCurrentQuantity(''); setCurrentPoId('');
        setDispatchItems([]);
    };

    const openCreate = () => { setEditingId(null); resetForm(); setDialogOpen(true); };

    const openEdit = (row) => {
        const d = dispatches.find(di => di.id === row.id);
        if (!d) return;
        setEditingId(d.id);
        setCustomerName(d.customer_name || '');
        setDispatchDate(d.dispatch_date ? d.dispatch_date.split('T')[0] : new Date().toISOString().split('T')[0]);
        setDispatchNotes(d.notes || '');
        const items = (d.items && d.items.length > 0) ? d.items : [{ brand_id: d.brand_id, brand_name: d.brand_name, size_id: d.size_id, size_name: d.size_name, quantity: d.quantity, purchase_order_id: d.purchase_order_id }];
        setDispatchItems(items.map(i => ({ ...i })));
        setCurrentBrandId(''); setCurrentSizeId(''); setCurrentQuantity(''); setCurrentPoId('');
        setDialogOpen(true);
    };

    const handleAddItem = () => {
        if (!currentBrandId || !currentSizeId || !currentQuantity) { toast.error('Please select brand, size and enter quantity'); return; }
        const brand = brands.find(b => b.id === currentBrandId);
        const size = sizes.find(s => s.id === currentSizeId);
        if (!brand || !size) return;
        setDispatchItems([...dispatchItems, {
            brand_id: brand.id, brand_name: brand.name,
            size_id: size.id, size_name: size.name,
            quantity: parseInt(currentQuantity),
            purchase_order_id: currentPoId || null,
        }]);
        setCurrentBrandId(''); setCurrentSizeId(''); setCurrentQuantity(''); setCurrentPoId('');
    };

    const handleRemoveItem = (index) => { setDispatchItems(dispatchItems.filter((_, i) => i !== index)); };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!customerName || dispatchItems.length === 0) {
            toast.error('Please select customer and add at least one item'); return;
        }
        setSubmitting(true);
        try {
            const payload = {
                customer_name: customerName,
                dispatch_date: new Date(dispatchDate).toISOString(),
                notes: dispatchNotes || null,
                items: dispatchItems,
            };
            if (editingId) { await dispatchAPI.update(editingId, payload); toast.success('Dispatch updated'); }
            else { await dispatchAPI.create(payload); toast.success('Dispatch created'); }
            setDialogOpen(false); resetForm(); fetchData();
        } catch (err) { toast.error(err.response?.data?.detail || 'Failed to save dispatch'); }
        finally { setSubmitting(false); }
    };

    const handleDelete = async () => {
        if (!deleteTarget) return;
        try { await dispatchAPI.delete(deleteTarget); toast.success('Dispatch deleted'); fetchData(); }
        catch (err) { toast.error('Failed to delete'); }
        finally { setDeleteTarget(null); }
    };

    const clearFilters = () => { setSearchTerm(''); setDateFrom(''); setDateTo(''); };

    const totalQuantity = dispatches.reduce((sum, d) => sum + (d.total_quantity || d.quantity || 0), 0);

    return (
        <div className="space-y-6 animate-fade-in" data-testid="dispatch-page">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <p className="text-muted-foreground">Manage dispatch orders and shipments</p>
                <div className="flex gap-2">
                    <Button variant="outline" onClick={() => {
                        if (exportToExcel({ data: filteredDispatches, columns: DISPATCH_EXPORT_COLUMNS, fileName: 'Dispatches', sheetName: 'Dispatches' })) toast.success('Exported to Excel');
                        else toast.error('No data to export');
                    }} className="font-bold uppercase tracking-wider rounded-sm" data-testid="export-dispatch-btn">
                        <Download className="w-4 h-4 mr-2" /> Export
                    </Button>
                    <ImportExcelButton
                        columns={[
                            { header: 'Customer', key: 'customer_name' },
                            { header: 'Brand', key: 'brand_name' },
                            { header: 'Size', key: 'size_name' },
                            { header: 'Quantity', key: 'quantity' },
                            { header: 'Dispatch Date', key: 'dispatch_date' },
                            { header: 'Notes', key: 'notes' },
                        ]}
                        templateName="Dispatches"
                        onImport={async (rows, onProgress) => {
                            let success = 0, failed = 0;
                            for (const row of rows) {
                                try {
                                    if (!row.customer_name || !row.brand_name || !row.size_name || !row.quantity) { failed++; onProgress(success + failed); continue; }
                                    const brand = brands.find(b => b.name.toLowerCase() === String(row.brand_name).toLowerCase().trim());
                                    const size = sizes.find(s => s.name.toLowerCase() === String(row.size_name).toLowerCase().trim());
                                    if (!brand || !size) { failed++; onProgress(success + failed); continue; }
                                    await dispatchAPI.create({
                                        customer_name: String(row.customer_name).trim(),
                                        items: [{ brand_id: brand.id, brand_name: brand.name, size_id: size.id, size_name: size.name, quantity: parseInt(row.quantity), purchase_order_id: null }],
                                        dispatch_date: parseImportDate(row.dispatch_date) || new Date().toISOString(),
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
                    <Button onClick={openCreate} className="font-bold uppercase tracking-wider rounded-sm" data-testid="add-dispatch-btn">
                        <Plus className="w-4 h-4 mr-2" /> New Dispatch
                    </Button>
                </div>
            </div>

            <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) resetForm(); }}>
                <DialogContent className="bg-card border-border rounded-sm max-w-xl max-h-[90vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle className="font-display text-xl font-bold tracking-tight uppercase">
                            {editingId ? 'Edit Dispatch Order' : 'Create Dispatch Order'}
                        </DialogTitle>
                    </DialogHeader>
                    <form onSubmit={handleSubmit} className="space-y-4 mt-4">
                        <div className="space-y-2">
                            <Label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Date *</Label>
                            <Input type="date" value={dispatchDate} onChange={(e) => setDispatchDate(e.target.value)} className="bg-background border-input rounded-sm font-mono" data-testid="dispatch-date" />
                        </div>
                        <div className="space-y-2">
                            <Label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Customer *</Label>
                            <SearchableSelect
                                options={customers.map(c => ({ value: c.name, label: c.name }))}
                                value={customerName}
                                onValueChange={setCustomerName}
                                placeholder="Select customer"
                                searchPlaceholder="Search customers..."
                                data-testid="dispatch-customer"
                            />
                        </div>
                        <div className="border-t border-border pt-4"><Label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Add Items (Brand, Size, Qty)</Label></div>
                        <div className="grid grid-cols-5 gap-2">
                            <Select value={currentBrandId} onValueChange={setCurrentBrandId}>
                                <SelectTrigger className="bg-background border-input rounded-sm" data-testid="dispatch-brand"><SelectValue placeholder="Brand" /></SelectTrigger>
                                <SelectContent className="bg-card border-border rounded-sm max-h-60">{brands.map(b => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}</SelectContent>
                            </Select>
                            <Select value={currentSizeId} onValueChange={setCurrentSizeId}>
                                <SelectTrigger className="bg-background border-input rounded-sm" data-testid="dispatch-size"><SelectValue placeholder="Size" /></SelectTrigger>
                                <SelectContent className="bg-card border-border rounded-sm">{sizes.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
                            </Select>
                            <Input type="number" value={currentQuantity} onChange={(e) => setCurrentQuantity(e.target.value)} placeholder="Qty" className="bg-background border-input rounded-sm font-mono" data-testid="dispatch-quantity" />
                            <Select value={currentPoId} onValueChange={(v) => setCurrentPoId(v === 'none' ? '' : v)}>
                                <SelectTrigger className="bg-background border-input rounded-sm" data-testid="dispatch-po"><SelectValue placeholder="PO" /></SelectTrigger>
                                <SelectContent className="bg-card border-border rounded-sm max-h-60">
                                    <SelectItem value="none">None</SelectItem>
                                    {purchaseOrders
                                        .filter(po => {
                                            if ((po.quantity_dispatched || 0) >= po.quantity) return false;
                                            const matchBrand = !currentBrandId || po.brand_id === currentBrandId;
                                            const matchSize = !currentSizeId || po.size_id === currentSizeId;
                                            return matchBrand && matchSize;
                                        })
                                        .map(po => (
                                            <SelectItem key={po.id} value={po.id}>
                                                {po.serial_no} [{po.quantity_dispatched || 0}/{po.quantity}]
                                            </SelectItem>
                                        ))
                                    }
                                </SelectContent>
                            </Select>
                            <Button type="button" onClick={handleAddItem} className="rounded-sm" data-testid="add-item-btn"><Plus className="w-4 h-4" /></Button>
                        </div>
                        {dispatchItems.length > 0 && (
                            <div className="space-y-2">
                                <Label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Added Items ({dispatchItems.length})</Label>
                                <div className="space-y-1 max-h-40 overflow-y-auto">
                                    {dispatchItems.map((item, idx) => (
                                        <div key={idx} className="flex items-center justify-between p-2 bg-secondary/50 rounded-sm">
                                            <div className="flex items-center gap-2 flex-wrap">
                                                <span className="text-sm font-medium">{item.brand_name}</span>
                                                <Badge variant="outline">{item.size_name}</Badge>
                                                <Badge variant="secondary" className="font-mono">{formatNumber(item.quantity)} qty</Badge>
                                                {item.purchase_order_id && (
                                                    <Badge variant="secondary" className="font-mono text-xs text-primary">
                                                        {purchaseOrders.find(po => po.id === item.purchase_order_id)?.serial_no || 'PO'}
                                                    </Badge>
                                                )}
                                            </div>
                                            <Button type="button" variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground hover:text-destructive" onClick={() => handleRemoveItem(idx)}><Trash2 className="w-3 h-3" /></Button>
                                        </div>
                                    ))}
                                </div>
                                <div className="flex justify-between text-sm p-2 bg-success/10 rounded-sm border border-success/20">
                                    <span className="font-bold uppercase tracking-wider">Total Quantity</span>
                                    <span className="font-mono font-bold text-success">{formatNumber(dispatchItems.reduce((sum, i) => sum + (i.quantity || 0), 0))}</span>
                                </div>
                            </div>
                        )}
                        <div className="space-y-2">
                            <Label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Notes</Label>
                            <Input value={dispatchNotes} onChange={(e) => setDispatchNotes(e.target.value)} placeholder="Optional notes..." className="bg-background border-input rounded-sm" data-testid="dispatch-notes" />
                        </div>
                        <Button type="submit" className="w-full font-bold uppercase tracking-wider rounded-sm" disabled={submitting || dispatchItems.length === 0 || !customerName} data-testid="submit-dispatch">
                            {submitting ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Saving...</> : (editingId ? 'Update Dispatch' : 'Create Dispatch')}
                        </Button>
                    </form>
                </DialogContent>
            </Dialog>

            <ConfirmDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)} title="Delete Dispatch Order?" description="This will permanently remove this dispatch order." onConfirm={handleDelete} />

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Card className="industrial-card"><CardContent className="p-4"><div className="flex items-center gap-3"><div className="p-2 bg-primary/10 rounded-sm border border-primary/20"><Truck className="w-5 h-5 text-primary" /></div><div><p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Total Orders</p><p className="font-display text-2xl font-bold">{dispatches.length}</p></div></div></CardContent></Card>
                <Card className="industrial-card"><CardContent className="p-4"><div className="flex items-center gap-3"><div className="p-2 bg-success/10 rounded-sm border border-success/20"><Truck className="w-5 h-5 text-success" /></div><div><p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Total Quantity</p><p className="font-display text-2xl font-bold">{formatNumber(totalQuantity)}</p></div></div></CardContent></Card>
            </div>

            <Card className="industrial-card">
                <CardHeader><CardTitle className="font-display text-xl font-bold tracking-tight uppercase">Dispatch Orders</CardTitle></CardHeader>
                <TableSearch
                    searchValue={searchTerm}
                    onSearchChange={setSearchTerm}
                    searchPlaceholder="Search by order #, customer, brand..."
                    filters={[
                        { key: 'dateFrom', label: 'From Date', type: 'date', value: dateFrom, onChange: setDateFrom },
                        { key: 'dateTo', label: 'To Date', type: 'date', value: dateTo, onChange: setDateTo },
                    ]}
                    onClear={clearFilters}
                    resultCount={filteredDispatches.length}
                    totalCount={flattenedRows.length}
                />
                <CardContent className="p-0">
                    {loading ? (
                        <div className="flex items-center justify-center h-48"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
                    ) : filteredDispatches.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-48 text-muted-foreground"><AlertCircle className="w-8 h-8 mb-2" /><p>{dispatches.length === 0 ? 'No dispatch orders found' : 'No matching orders'}</p></div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="data-table" data-testid="dispatch-table">
                                <thead><tr><th>#</th>
                                    <SortableHeader label="Date" sortKey="dispatch_date" currentSortKey={sortKey} currentSortDir={sortDir} onSort={requestSort} />
                                    <SortableHeader label="Order #" sortKey="order_number" currentSortKey={sortKey} currentSortDir={sortDir} onSort={requestSort} />
                                    <SortableHeader label="Customer" sortKey="customer_name" currentSortKey={sortKey} currentSortDir={sortDir} onSort={requestSort} />
                                    <SortableHeader label="Brand" sortKey="brand_name" currentSortKey={sortKey} currentSortDir={sortDir} onSort={requestSort} />
                                    <th>Size</th>
                                    <SortableHeader label="Qty" sortKey="quantity" currentSortKey={sortKey} currentSortDir={sortDir} onSort={requestSort} />
                                    <th>PO</th><th>By</th><th>Updated By</th><th></th></tr></thead>
                                <tbody>
                                    {paginatedDispatches.map((d, idx) => (
                                        <tr key={d._rowKey} data-testid={`dispatch-row-${d._rowKey}`}>
                                            <td className="text-muted-foreground">{startIndex + idx + 1}</td>
                                            <td>{formatDate(d.dispatch_date)}</td>
                                            <td className="font-mono font-medium">{d.order_number}</td>
                                            <td className="font-medium">{d.customer_name}</td>
                                            <td>{d.brand_name}</td>
                                            <td><Badge variant="outline">{d.size_name}</Badge></td>
                                            <td className="font-mono">{formatNumber(d.quantity)}</td>
                                            <td className="font-mono text-xs">{d.purchase_order_id ? purchaseOrders.find(po => po.id === d.purchase_order_id)?.serial_no || '-' : '-'}</td>
                                            <td className="text-muted-foreground">{d.created_by}</td>
                                            <td className="text-muted-foreground">{d.updated_by || '-'}</td>
                                            <td>
                                                <div className="flex gap-1">
                                                    <Button variant="ghost" size="icon" onClick={() => openEdit(d)} className="text-muted-foreground hover:text-primary"><Pencil className="w-4 h-4" /></Button>
                                                    <Button variant="ghost" size="icon" onClick={() => setDeleteTarget(d.id)} className="text-muted-foreground hover:text-destructive" data-testid={`delete-dispatch-${d.id}`}><Trash2 className="w-4 h-4" /></Button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                    <TablePagination currentPage={currentPage} totalPages={totalPages} pageSize={pageSize} totalItems={filteredDispatches.length} startIndex={startIndex} onPageChange={setCurrentPage} onPageSizeChange={setPageSize} pageSizeOptions={PAGE_SIZE_OPTIONS} />
                </CardContent>
            </Card>
        </div>
    );
};

export default Dispatch;
