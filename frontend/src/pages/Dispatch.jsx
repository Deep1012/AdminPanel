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
import { useTableFilter } from '../hooks/useTableFilter';
import { usePagination } from '../hooks/usePagination';
import { dispatchAPI, brandsAPI, sizesAPI, customersAPI, purchaseOrdersAPI } from '../lib/api';
import SearchableSelect from '../components/SearchableSelect';
import { formatDate, formatNumber } from '../lib/utils';
import { Plus, Trash2, Pencil, Truck, Loader2, AlertCircle, Download } from 'lucide-react';
import { toast } from 'sonner';
import { exportToExcel } from '../lib/exportToExcel';

const DISPATCH_EXPORT_COLUMNS = [
    { header: 'Date', key: 'dispatch_date', transform: (v) => formatDate(v) },
    { header: 'Order #', key: 'order_number' },
    { header: 'Customer', key: 'customer_name' },
    { header: 'Brand', key: 'brand_name' },
    { header: 'Size', key: 'size_name' },
    { header: 'Quantity', key: 'quantity' },
    { header: 'Created By', key: 'created_by' },
];

const emptyForm = {
    customer_name: '', brand_id: '', size_id: '', quantity: '',
    notes: '', dispatch_date: new Date().toISOString().split('T')[0],
    purchase_order_id: ''
};

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
    const [formData, setFormData] = useState({ ...emptyForm });
    const [deleteTarget, setDeleteTarget] = useState(null);

    const [searchTerm, setSearchTerm] = useState('');
    const [dateFrom, setDateFrom] = useState('');
    const [dateTo, setDateTo] = useState('');

    const filters = useMemo(() => [
        ...(dateFrom ? [{ key: 'dispatch_date', value: dateFrom, type: 'dateFrom' }] : []),
        ...(dateTo ? [{ key: 'dispatch_date', value: dateTo, type: 'dateTo' }] : []),
    ], [dateFrom, dateTo]);

    const filteredDispatches = useTableFilter({
        data: dispatches, searchTerm, searchFields: ['order_number', 'customer_name'], filters
    });

    const { paginatedData: paginatedDispatches, currentPage, totalPages, pageSize, setCurrentPage, setPageSize, startIndex, PAGE_SIZE_OPTIONS } = usePagination({ data: filteredDispatches });

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

    const openCreate = () => { setEditingId(null); setFormData({ ...emptyForm }); setDialogOpen(true); };
    const openEdit = (d) => {
        setEditingId(d.id);
        setFormData({
            customer_name: d.customer_name || '',
            brand_id: d.brand_id || '', size_id: d.size_id || '',
            quantity: String(d.quantity),
            notes: d.notes || '',
            dispatch_date: d.dispatch_date ? d.dispatch_date.split('T')[0] : new Date().toISOString().split('T')[0],
            purchase_order_id: d.purchase_order_id || '',
        });
        setDialogOpen(true);
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!formData.customer_name || !formData.brand_id || !formData.size_id || !formData.quantity) {
            toast.error('Please fill all required fields'); return;
        }
        setSubmitting(true);
        try {
            const brand = brands.find(b => b.id === formData.brand_id);
            const size = sizes.find(s => s.id === formData.size_id);
            const payload = {
                customer_name: formData.customer_name,
                brand_id: formData.brand_id, brand_name: brand?.name || '',
                size_id: formData.size_id, size_name: size?.name || '',
                quantity: parseInt(formData.quantity),
                notes: formData.notes || null,
                dispatch_date: new Date(formData.dispatch_date).toISOString(),
                purchase_order_id: formData.purchase_order_id || null,
            };
            if (editingId) { await dispatchAPI.update(editingId, payload); toast.success('Dispatch updated'); }
            else { await dispatchAPI.create(payload); toast.success('Dispatch created'); }
            setDialogOpen(false); fetchData();
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

    const totalQuantity = dispatches.reduce((sum, d) => sum + (d.quantity || 0), 0);

    return (
        <div className="space-y-6 animate-fade-in" data-testid="dispatch-page">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <p className="text-muted-foreground">Manage dispatch orders and shipments</p>
                <div className="flex gap-2">
                    <Button variant="outline" onClick={() => {
                        const data = filteredDispatches.length > 0 ? filteredDispatches : dispatches;
                        if (exportToExcel({ data, columns: DISPATCH_EXPORT_COLUMNS, fileName: 'Dispatches', sheetName: 'Dispatches' })) toast.success('Exported to Excel');
                        else toast.error('No data to export');
                    }} className="font-bold uppercase tracking-wider rounded-sm" data-testid="export-dispatch-btn">
                        <Download className="w-4 h-4 mr-2" /> Export
                    </Button>
                    <Button onClick={openCreate} className="font-bold uppercase tracking-wider rounded-sm" data-testid="add-dispatch-btn">
                        <Plus className="w-4 h-4 mr-2" /> New Dispatch
                    </Button>
                </div>
            </div>

            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                <DialogContent className="bg-card border-border rounded-sm max-w-md">
                    <DialogHeader>
                        <DialogTitle className="font-display text-xl font-bold tracking-tight uppercase">
                            {editingId ? 'Edit Dispatch Order' : 'Create Dispatch Order'}
                        </DialogTitle>
                    </DialogHeader>
                    <form onSubmit={handleSubmit} className="space-y-4 mt-4">
                        <div className="space-y-2">
                            <Label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Date *</Label>
                            <Input type="date" value={formData.dispatch_date} onChange={(e) => setFormData({ ...formData, dispatch_date: e.target.value })} className="bg-background border-input rounded-sm font-mono" data-testid="dispatch-date" />
                        </div>
                        <div className="space-y-2">
                            <Label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Customer *</Label>
                            <SearchableSelect
                                options={customers.map(c => ({ value: c.name, label: c.name }))}
                                value={formData.customer_name}
                                onValueChange={(v) => setFormData({ ...formData, customer_name: v })}
                                placeholder="Select customer"
                                searchPlaceholder="Search customers..."
                                data-testid="dispatch-customer"
                            />
                        </div>
                        <div className="space-y-2">
                            <Label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Brand *</Label>
                            <Select value={formData.brand_id} onValueChange={(v) => setFormData({ ...formData, brand_id: v })}>
                                <SelectTrigger className="bg-background border-input rounded-sm" data-testid="dispatch-brand"><SelectValue placeholder="Select brand" /></SelectTrigger>
                                <SelectContent className="bg-card border-border rounded-sm max-h-60">{brands.map(b => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}</SelectContent>
                            </Select>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Size *</Label>
                                <Select value={formData.size_id} onValueChange={(v) => setFormData({ ...formData, size_id: v })}>
                                    <SelectTrigger className="bg-background border-input rounded-sm" data-testid="dispatch-size"><SelectValue placeholder="Select" /></SelectTrigger>
                                    <SelectContent className="bg-card border-border rounded-sm">{sizes.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-2">
                                <Label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Quantity *</Label>
                                <Input type="number" value={formData.quantity} onChange={(e) => setFormData({ ...formData, quantity: e.target.value })} placeholder="0" className="bg-background border-input rounded-sm font-mono" data-testid="dispatch-quantity" />
                            </div>
                        </div>
                        <div className="space-y-2">
                            <Label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Link to Purchase Order</Label>
                            <Select value={formData.purchase_order_id} onValueChange={(v) => setFormData({ ...formData, purchase_order_id: v === 'none' ? '' : v })}>
                                <SelectTrigger className="bg-background border-input rounded-sm" data-testid="dispatch-po"><SelectValue placeholder="None (optional)" /></SelectTrigger>
                                <SelectContent className="bg-card border-border rounded-sm max-h-60">
                                    <SelectItem value="none">None</SelectItem>
                                    {purchaseOrders
                                        .filter(po => {
                                            if (!formData.brand_id && !formData.size_id) return true;
                                            const matchBrand = !formData.brand_id || po.brand_id === formData.brand_id;
                                            const matchSize = !formData.size_id || po.size_id === formData.size_id;
                                            return matchBrand && matchSize;
                                        })
                                        .map(po => (
                                            <SelectItem key={po.id} value={po.id}>
                                                {po.serial_no} — {po.company_name} ({po.brand_name} {po.size_name}) [{po.quantity_dispatched || 0}/{po.quantity}]
                                            </SelectItem>
                                        ))
                                    }
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-2">
                            <Label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Notes</Label>
                            <Input value={formData.notes} onChange={(e) => setFormData({ ...formData, notes: e.target.value })} placeholder="Optional notes..." className="bg-background border-input rounded-sm" data-testid="dispatch-notes" />
                        </div>
                        <Button type="submit" className="w-full font-bold uppercase tracking-wider rounded-sm" disabled={submitting} data-testid="submit-dispatch">
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
                    searchPlaceholder="Search by order #, customer..."
                    filters={[
                        { key: 'dateFrom', label: 'From Date', type: 'date', value: dateFrom, onChange: setDateFrom },
                        { key: 'dateTo', label: 'To Date', type: 'date', value: dateTo, onChange: setDateTo },
                    ]}
                    onClear={clearFilters}
                    resultCount={filteredDispatches.length}
                    totalCount={dispatches.length}
                />
                <CardContent className="p-0">
                    {loading ? (
                        <div className="flex items-center justify-center h-48"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
                    ) : filteredDispatches.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-48 text-muted-foreground"><AlertCircle className="w-8 h-8 mb-2" /><p>{dispatches.length === 0 ? 'No dispatch orders found' : 'No matching orders'}</p></div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="data-table" data-testid="dispatch-table">
                                <thead><tr><th>#</th><th>Date</th><th>Order #</th><th>Customer</th><th>Brand</th><th>Size</th><th>Qty</th><th>PO</th><th>By</th><th></th></tr></thead>
                                <tbody>
                                    {paginatedDispatches.map((d, idx) => (
                                        <tr key={d.id} data-testid={`dispatch-row-${d.id}`}>
                                            <td className="text-muted-foreground">{startIndex + idx + 1}</td>
                                            <td>{formatDate(d.dispatch_date)}</td>
                                            <td className="font-mono font-medium">{d.order_number}</td>
                                            <td className="font-medium">{d.customer_name}</td>
                                            <td>{d.brand_name}</td>
                                            <td><Badge variant="outline">{d.size_name}</Badge></td>
                                            <td className="font-mono">{formatNumber(d.quantity)}</td>
                                            <td className="font-mono text-xs">{d.purchase_order_id ? purchaseOrders.find(po => po.id === d.purchase_order_id)?.serial_no || '-' : '-'}</td>
                                            <td className="text-muted-foreground">{d.created_by}</td>
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
