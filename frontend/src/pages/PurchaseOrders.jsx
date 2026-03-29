import React, { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Badge } from '../components/ui/badge';
import { Textarea } from '../components/ui/textarea';
import ConfirmDialog from '../components/ConfirmDialog';
import TableSearch from '../components/TableSearch';
import TablePagination from '../components/TablePagination';
import { useTableFilter } from '../hooks/useTableFilter';
import { usePagination } from '../hooks/usePagination';
import { purchaseOrdersAPI, brandsAPI, sizesAPI } from '../lib/api';
import { formatDate, formatNumber, getStatusColor, getPOStatusLabel } from '../lib/utils';
import { Plus, Trash2, Pencil, ClipboardList, Loader2, AlertCircle, Truck, Factory, CheckCircle, Download } from 'lucide-react';
import { toast } from 'sonner';
import { exportToExcel } from '../lib/exportToExcel';

const PO_EXPORT_COLUMNS = [
    { header: '#', key: 'id', transform: (v, row, idx) => idx + 1 },
    { header: 'Date', key: 'date', transform: (v) => formatDate(v) },
    { header: 'Company', key: 'company_name' },
    { header: 'Brand', key: 'brand_name' },
    { header: 'Size', key: 'size_name' },
    { header: 'Quantity', key: 'quantity' },
    { header: 'Status', key: 'status', transform: (v) => getPOStatusLabel(v) },
    { header: 'Dispatch', key: 'dispatch_id', transform: (v) => v ? 'Linked' : '-' },
    { header: 'Created By', key: 'created_by' },
];

const PO_STATUSES = [
    { value: 'received', label: 'Received' },
    { value: 'confirmed', label: 'Confirmed' },
    { value: 'in_production', label: 'In Production' },
    { value: 'ready', label: 'Ready' },
    { value: 'dispatched', label: 'Dispatched' },
    { value: 'delivered', label: 'Delivered' },
];

const emptyForm = {
    company_name: '', brand_id: '', size_id: '', quantity: '', notes: '',
    date: new Date().toISOString().split('T')[0]
};

const PurchaseOrders = () => {
    const [orders, setOrders] = useState([]);
    const [brands, setBrands] = useState([]);
    const [sizes, setSizes] = useState([]);
    const [loading, setLoading] = useState(true);
    const [dialogOpen, setDialogOpen] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [editingId, setEditingId] = useState(null);
    const [formData, setFormData] = useState({ ...emptyForm });
    const [deleteTarget, setDeleteTarget] = useState(null);

    const [searchTerm, setSearchTerm] = useState('');
    const [filterStatus, setFilterStatus] = useState('');
    const [dateFrom, setDateFrom] = useState('');
    const [dateTo, setDateTo] = useState('');

    const filters = useMemo(() => [
        ...(filterStatus ? [{ key: 'status', value: filterStatus, type: 'exact' }] : []),
        ...(dateFrom ? [{ key: 'date', value: dateFrom, type: 'dateFrom' }] : []),
        ...(dateTo ? [{ key: 'date', value: dateTo, type: 'dateTo' }] : []),
    ], [filterStatus, dateFrom, dateTo]);

    const filteredOrders = useTableFilter({
        data: orders, searchTerm, searchFields: ['serial_no', 'company_name'], filters
    });

    const { paginatedData: paginatedOrders, currentPage, totalPages, pageSize, setCurrentPage, setPageSize, startIndex, PAGE_SIZE_OPTIONS } = usePagination({ data: filteredOrders });

    useEffect(() => { fetchData(); }, []);

    const fetchData = async () => {
        try {
            setLoading(true);
            const [ordersRes, brandsRes, sizesRes] = await Promise.all([
                purchaseOrdersAPI.getAll(), brandsAPI.getAll(), sizesAPI.getAll()
            ]);
            setOrders(ordersRes.data); setBrands(brandsRes.data); setSizes(sizesRes.data);
        } catch (err) { toast.error('Failed to load data'); }
        finally { setLoading(false); }
    };

    const openCreate = () => { setEditingId(null); setFormData({ ...emptyForm }); setDialogOpen(true); };
    const openEdit = (po) => {
        setEditingId(po.id);
        setFormData({
            company_name: po.company_name, brand_id: po.brand_id || '', size_id: po.size_id || '',
            quantity: String(po.quantity), notes: po.notes || '',
            date: po.date ? po.date.split('T')[0] : new Date().toISOString().split('T')[0],
        });
        setDialogOpen(true);
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!formData.company_name || !formData.brand_id || !formData.size_id || !formData.quantity) {
            toast.error('Please fill all required fields'); return;
        }
        setSubmitting(true);
        try {
            const brand = brands.find(b => b.id === formData.brand_id);
            const size = sizes.find(s => s.id === formData.size_id);
            const payload = {
                date: new Date(formData.date).toISOString(),
                company_name: formData.company_name,
                brand_id: formData.brand_id, brand_name: brand?.name || '',
                size_id: formData.size_id, size_name: size?.name || '',
                quantity: parseInt(formData.quantity),
                notes: formData.notes || null,
            };
            if (editingId) { await purchaseOrdersAPI.update(editingId, payload); toast.success('Order updated'); }
            else { await purchaseOrdersAPI.create(payload); toast.success('Purchase order created'); }
            setDialogOpen(false); fetchData();
        } catch (err) { toast.error(err.response?.data?.detail || 'Failed to save order'); }
        finally { setSubmitting(false); }
    };

    const handleStatusChange = async (poId, newStatus) => {
        if (newStatus === 'dispatched') {
            const po = orders.find(o => o.id === poId);
            if (po && !po.dispatch_id) {
                toast.info('A dispatch entry will be auto-created for this order');
            }
        }
        try {
            await purchaseOrdersAPI.update(poId, { status: newStatus });
            toast.success(`Status updated to ${getPOStatusLabel(newStatus)}`);
            fetchData();
        } catch (err) { toast.error('Failed to update status'); }
    };

    const handleDelete = async () => {
        if (!deleteTarget) return;
        try { await purchaseOrdersAPI.delete(deleteTarget); toast.success('Order deleted'); fetchData(); }
        catch (err) { toast.error('Failed to delete'); }
        finally { setDeleteTarget(null); }
    };

    const clearFilters = () => { setSearchTerm(''); setFilterStatus(''); setDateFrom(''); setDateTo(''); };

    const totalOrders = orders.length;
    const pendingCount = orders.filter(o => ['received', 'confirmed'].includes(o.status)).length;
    const inProductionCount = orders.filter(o => o.status === 'in_production').length;
    const readyCount = orders.filter(o => o.status === 'ready').length;

    return (
        <div className="space-y-6 animate-fade-in" data-testid="purchase-orders-page">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <p className="text-muted-foreground">Track customer purchase orders from receipt to delivery</p>
                <div className="flex gap-2">
                    <Button variant="outline" onClick={() => {
                        const data = filteredOrders.length > 0 ? filteredOrders : orders;
                        if (exportToExcel({ data, columns: PO_EXPORT_COLUMNS, fileName: 'Purchase_Orders', sheetName: 'Purchase Orders' })) toast.success('Exported to Excel');
                        else toast.error('No data to export');
                    }} className="font-bold uppercase tracking-wider rounded-sm" data-testid="export-po-btn">
                        <Download className="w-4 h-4 mr-2" /> Export
                    </Button>
                    <Button onClick={openCreate} className="font-bold uppercase tracking-wider rounded-sm" data-testid="add-po-btn">
                        <Plus className="w-4 h-4 mr-2" /> New Order
                    </Button>
                </div>
            </div>

            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                <DialogContent className="bg-card border-border rounded-sm max-w-md">
                    <DialogHeader>
                        <DialogTitle className="font-display text-xl font-bold tracking-tight uppercase">
                            {editingId ? 'Edit Purchase Order' : 'New Purchase Order'}
                        </DialogTitle>
                    </DialogHeader>
                    <form onSubmit={handleSubmit} className="space-y-4 mt-4">
                        <div className="space-y-2">
                            <Label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Date *</Label>
                            <Input type="date" value={formData.date} onChange={(e) => setFormData({ ...formData, date: e.target.value })} className="bg-background border-input rounded-sm font-mono" data-testid="po-date" />
                        </div>
                        <div className="space-y-2">
                            <Label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Company Name *</Label>
                            <Input value={formData.company_name} onChange={(e) => setFormData({ ...formData, company_name: e.target.value })} placeholder="Customer company" className="bg-background border-input rounded-sm" data-testid="po-company" />
                        </div>
                        <div className="space-y-2">
                            <Label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Brand *</Label>
                            <Select value={formData.brand_id} onValueChange={(v) => setFormData({ ...formData, brand_id: v })}>
                                <SelectTrigger className="bg-background border-input rounded-sm" data-testid="po-brand"><SelectValue placeholder="Select brand" /></SelectTrigger>
                                <SelectContent className="bg-card border-border rounded-sm max-h-60">{brands.map(b => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}</SelectContent>
                            </Select>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Size *</Label>
                                <Select value={formData.size_id} onValueChange={(v) => setFormData({ ...formData, size_id: v })}>
                                    <SelectTrigger className="bg-background border-input rounded-sm" data-testid="po-size"><SelectValue placeholder="Select" /></SelectTrigger>
                                    <SelectContent className="bg-card border-border rounded-sm">{sizes.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-2">
                                <Label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Quantity *</Label>
                                <Input type="number" value={formData.quantity} onChange={(e) => setFormData({ ...formData, quantity: e.target.value })} placeholder="0" className="bg-background border-input rounded-sm font-mono" data-testid="po-quantity" />
                            </div>
                        </div>
                        <div className="space-y-2">
                            <Label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Notes</Label>
                            <Textarea value={formData.notes} onChange={(e) => setFormData({ ...formData, notes: e.target.value })} placeholder="Optional notes..." className="bg-background border-input rounded-sm" data-testid="po-notes" />
                        </div>
                        <Button type="submit" className="w-full font-bold uppercase tracking-wider rounded-sm" disabled={submitting} data-testid="submit-po">
                            {submitting ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Saving...</> : (editingId ? 'Update Order' : 'Create Order')}
                        </Button>
                    </form>
                </DialogContent>
            </Dialog>

            <ConfirmDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)} title="Delete Purchase Order?" description="This will permanently remove this purchase order." onConfirm={handleDelete} />

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <Card className="industrial-card"><CardContent className="p-4"><div className="flex items-center gap-3"><div className="p-2 bg-primary/10 rounded-sm border border-primary/20"><ClipboardList className="w-5 h-5 text-primary" /></div><div><p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Total Orders</p><p className="font-display text-2xl font-bold">{totalOrders}</p></div></div></CardContent></Card>
                <Card className="industrial-card"><CardContent className="p-4"><div className="flex items-center gap-3"><div className="p-2 bg-warning/10 rounded-sm border border-warning/20"><ClipboardList className="w-5 h-5 text-warning" /></div><div><p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Pending</p><p className="font-display text-2xl font-bold">{pendingCount}</p></div></div></CardContent></Card>
                <Card className="industrial-card"><CardContent className="p-4"><div className="flex items-center gap-3"><div className="p-2 bg-info/10 rounded-sm border border-info/20"><Factory className="w-5 h-5 text-info" /></div><div><p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">In Production</p><p className="font-display text-2xl font-bold">{inProductionCount}</p></div></div></CardContent></Card>
                <Card className="industrial-card"><CardContent className="p-4"><div className="flex items-center gap-3"><div className="p-2 bg-success/10 rounded-sm border border-success/20"><CheckCircle className="w-5 h-5 text-success" /></div><div><p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Ready</p><p className="font-display text-2xl font-bold">{readyCount}</p></div></div></CardContent></Card>
            </div>

            <Card className="industrial-card">
                <CardHeader><CardTitle className="font-display text-xl font-bold tracking-tight uppercase">Purchase Orders</CardTitle></CardHeader>
                <TableSearch
                    searchValue={searchTerm}
                    onSearchChange={setSearchTerm}
                    searchPlaceholder="Search by serial no, company..."
                    filters={[
                        { key: 'status', label: 'Status', type: 'select', options: PO_STATUSES, value: filterStatus, onChange: setFilterStatus },
                        { key: 'dateFrom', label: 'From Date', type: 'date', value: dateFrom, onChange: setDateFrom },
                        { key: 'dateTo', label: 'To Date', type: 'date', value: dateTo, onChange: setDateTo },
                    ]}
                    onClear={clearFilters}
                    resultCount={filteredOrders.length}
                    totalCount={orders.length}
                />
                <CardContent className="p-0">
                    {loading ? (
                        <div className="flex items-center justify-center h-48"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
                    ) : filteredOrders.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-48 text-muted-foreground"><AlertCircle className="w-8 h-8 mb-2" /><p>{orders.length === 0 ? 'No purchase orders found' : 'No matching orders'}</p></div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="data-table" data-testid="po-table">
                                <thead><tr><th>#</th><th>Date</th><th>Company</th><th>Brand</th><th>Size</th><th>Qty</th><th>Status</th><th>Dispatch</th><th>By</th><th></th></tr></thead>
                                <tbody>
                                    {paginatedOrders.map((po, idx) => (
                                        <tr key={po.id} data-testid={`po-row-${po.id}`}>
                                            <td className="text-muted-foreground">{startIndex + idx + 1}</td>
                                            <td>{formatDate(po.date)}</td>
                                            <td className="font-medium">{po.company_name}</td>
                                            <td>{po.brand_name}</td>
                                            <td><Badge variant="outline">{po.size_name}</Badge></td>
                                            <td className="font-mono">{formatNumber(po.quantity)}</td>
                                            <td>
                                                <Select value={po.status} onValueChange={(v) => handleStatusChange(po.id, v)}>
                                                    <SelectTrigger className={`w-36 h-8 text-xs ${getStatusColor(po.status)} rounded-sm`}><SelectValue>{getPOStatusLabel(po.status)}</SelectValue></SelectTrigger>
                                                    <SelectContent className="bg-card border-border rounded-sm">
                                                        {PO_STATUSES.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                                                    </SelectContent>
                                                </Select>
                                            </td>
                                            <td>
                                                {po.dispatch_id ? (
                                                    <Badge variant="secondary" className="text-xs"><Truck className="w-3 h-3 mr-1" /> Linked</Badge>
                                                ) : (
                                                    <span className="text-muted-foreground text-xs">-</span>
                                                )}
                                            </td>
                                            <td className="text-muted-foreground">{po.created_by}</td>
                                            <td>
                                                <div className="flex gap-1">
                                                    <Button variant="ghost" size="icon" onClick={() => openEdit(po)} className="text-muted-foreground hover:text-primary"><Pencil className="w-4 h-4" /></Button>
                                                    <Button variant="ghost" size="icon" onClick={() => setDeleteTarget(po.id)} className="text-muted-foreground hover:text-destructive"><Trash2 className="w-4 h-4" /></Button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
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
