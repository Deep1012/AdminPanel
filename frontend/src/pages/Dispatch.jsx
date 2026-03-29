import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Badge } from '../components/ui/badge';
import { Textarea } from '../components/ui/textarea';
import ConfirmDialog from '../components/ConfirmDialog';
import { dispatchAPI, brandsAPI, sizesAPI } from '../lib/api';
import { formatDate, formatNumber, getStatusColor } from '../lib/utils';
import { Plus, Trash2, Pencil, Truck, Loader2, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';

const emptyForm = {
    order_number: '', customer_name: '', brand_id: '', size_id: '', quantity: '',
    delivery_address: '', notes: '', dispatch_date: new Date().toISOString().split('T')[0]
};

const Dispatch = () => {
    const [dispatches, setDispatches] = useState([]);
    const [brands, setBrands] = useState([]);
    const [sizes, setSizes] = useState([]);
    const [loading, setLoading] = useState(true);
    const [dialogOpen, setDialogOpen] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [editingId, setEditingId] = useState(null);
    const [formData, setFormData] = useState({ ...emptyForm });
    const [deleteTarget, setDeleteTarget] = useState(null);

    useEffect(() => { fetchData(); }, []);

    const fetchData = async () => {
        try {
            setLoading(true);
            const [dispatchRes, brandsRes, sizesRes] = await Promise.all([
                dispatchAPI.getAll(), brandsAPI.getAll(), sizesAPI.getAll()
            ]);
            setDispatches(dispatchRes.data);
            setBrands(brandsRes.data);
            setSizes(sizesRes.data);
        } catch (err) { toast.error('Failed to load data'); }
        finally { setLoading(false); }
    };

    const openCreate = () => { setEditingId(null); setFormData({ ...emptyForm }); setDialogOpen(true); };

    const openEdit = (d) => {
        setEditingId(d.id);
        setFormData({
            order_number: d.order_number || '', customer_name: d.customer_name || '',
            brand_id: d.brand_id || '', size_id: d.size_id || '',
            quantity: String(d.quantity), delivery_address: d.delivery_address || '',
            notes: d.notes || '',
            dispatch_date: d.dispatch_date ? d.dispatch_date.split('T')[0] : new Date().toISOString().split('T')[0],
        });
        setDialogOpen(true);
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!formData.order_number || !formData.customer_name || !formData.brand_id || !formData.size_id || !formData.quantity) {
            toast.error('Please fill all required fields'); return;
        }
        setSubmitting(true);
        try {
            const brand = brands.find(b => b.id === formData.brand_id);
            const size = sizes.find(s => s.id === formData.size_id);
            const payload = {
                order_number: formData.order_number, customer_name: formData.customer_name,
                brand_id: formData.brand_id, brand_name: brand?.name || '',
                size_id: formData.size_id, size_name: size?.name || '',
                quantity: parseInt(formData.quantity),
                delivery_address: formData.delivery_address || null,
                notes: formData.notes || null,
                dispatch_date: new Date(formData.dispatch_date).toISOString(),
            };
            if (editingId) {
                await dispatchAPI.update(editingId, payload);
                toast.success('Dispatch updated');
            } else {
                await dispatchAPI.create(payload);
                toast.success('Dispatch created');
            }
            setDialogOpen(false);
            fetchData();
        } catch (err) { toast.error('Failed to save dispatch'); }
        finally { setSubmitting(false); }
    };

    const handleStatusChange = async (dispatchId, newStatus) => {
        try { await dispatchAPI.update(dispatchId, { status: newStatus }); toast.success('Status updated'); fetchData(); }
        catch (err) { toast.error('Failed to update status'); }
    };

    const handleDelete = async () => {
        if (!deleteTarget) return;
        try { await dispatchAPI.delete(deleteTarget); toast.success('Dispatch deleted'); fetchData(); }
        catch (err) { toast.error('Failed to delete'); }
        finally { setDeleteTarget(null); }
    };

    const totalQuantity = dispatches.reduce((sum, d) => sum + (d.quantity || 0), 0);
    const pendingOrders = dispatches.filter(d => d.status === 'pending').length;

    return (
        <div className="space-y-6 animate-fade-in" data-testid="dispatch-page">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <p className="text-muted-foreground">Manage dispatch orders and shipments</p>
                <Button onClick={openCreate} className="font-bold uppercase tracking-wider rounded-sm" data-testid="add-dispatch-btn">
                    <Plus className="w-4 h-4 mr-2" /> New Dispatch
                </Button>
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
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Order Number *</Label>
                                <Input value={formData.order_number} onChange={(e) => setFormData({ ...formData, order_number: e.target.value })} placeholder="ORD-001" className="bg-background border-input rounded-sm font-mono" data-testid="dispatch-order" />
                            </div>
                            <div className="space-y-2">
                                <Label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Customer *</Label>
                                <Input value={formData.customer_name} onChange={(e) => setFormData({ ...formData, customer_name: e.target.value })} placeholder="Customer name" className="bg-background border-input rounded-sm" data-testid="dispatch-customer" />
                            </div>
                        </div>
                        <div className="space-y-2">
                            <Label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Brand *</Label>
                            <Select value={formData.brand_id} onValueChange={(v) => setFormData({ ...formData, brand_id: v })}>
                                <SelectTrigger className="bg-background border-input rounded-sm" data-testid="dispatch-brand">
                                    <SelectValue placeholder="Select brand" />
                                </SelectTrigger>
                                <SelectContent className="bg-card border-border rounded-sm max-h-60">
                                    {brands.map(b => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Size *</Label>
                                <Select value={formData.size_id} onValueChange={(v) => setFormData({ ...formData, size_id: v })}>
                                    <SelectTrigger className="bg-background border-input rounded-sm" data-testid="dispatch-size">
                                        <SelectValue placeholder="Select" />
                                    </SelectTrigger>
                                    <SelectContent className="bg-card border-border rounded-sm">
                                        {sizes.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-2">
                                <Label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Quantity *</Label>
                                <Input type="number" value={formData.quantity} onChange={(e) => setFormData({ ...formData, quantity: e.target.value })} placeholder="0" className="bg-background border-input rounded-sm font-mono" data-testid="dispatch-quantity" />
                            </div>
                        </div>
                        <div className="space-y-2">
                            <Label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Delivery Address</Label>
                            <Textarea value={formData.delivery_address} onChange={(e) => setFormData({ ...formData, delivery_address: e.target.value })} placeholder="Enter delivery address..." className="bg-background border-input rounded-sm" data-testid="dispatch-address" />
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

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <Card className="industrial-card"><CardContent className="p-4"><div className="flex items-center gap-3"><div className="p-2 bg-primary/10 rounded-sm border border-primary/20"><Truck className="w-5 h-5 text-primary" /></div><div><p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Total Orders</p><p className="font-display text-2xl font-bold">{dispatches.length}</p></div></div></CardContent></Card>
                <Card className="industrial-card"><CardContent className="p-4"><div className="flex items-center gap-3"><div className="p-2 bg-warning/10 rounded-sm border border-warning/20"><Truck className="w-5 h-5 text-warning" /></div><div><p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Pending</p><p className="font-display text-2xl font-bold">{pendingOrders}</p></div></div></CardContent></Card>
                <Card className="industrial-card"><CardContent className="p-4"><div className="flex items-center gap-3"><div className="p-2 bg-success/10 rounded-sm border border-success/20"><Truck className="w-5 h-5 text-success" /></div><div><p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Total Quantity</p><p className="font-display text-2xl font-bold">{formatNumber(totalQuantity)}</p></div></div></CardContent></Card>
            </div>

            <Card className="industrial-card">
                <CardHeader><CardTitle className="font-display text-xl font-bold tracking-tight uppercase">Dispatch Orders</CardTitle></CardHeader>
                <CardContent className="p-0">
                    {loading ? (
                        <div className="flex items-center justify-center h-48"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
                    ) : dispatches.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-48 text-muted-foreground"><AlertCircle className="w-8 h-8 mb-2" /><p>No dispatch orders found</p></div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="data-table" data-testid="dispatch-table">
                                <thead><tr><th>Date</th><th>Order #</th><th>Customer</th><th>Brand</th><th>Size</th><th>Qty</th><th>Status</th><th>By</th><th></th></tr></thead>
                                <tbody>
                                    {dispatches.map((d) => (
                                        <tr key={d.id} data-testid={`dispatch-row-${d.id}`}>
                                            <td>{formatDate(d.dispatch_date)}</td>
                                            <td className="font-mono font-medium">{d.order_number}</td>
                                            <td className="font-medium">{d.customer_name}</td>
                                            <td>{d.brand_name}</td>
                                            <td><Badge variant="outline">{d.size_name}</Badge></td>
                                            <td className="font-mono">{formatNumber(d.quantity)}</td>
                                            <td>
                                                <Select value={d.status} onValueChange={(v) => handleStatusChange(d.id, v)}>
                                                    <SelectTrigger className={`w-32 h-8 text-xs ${getStatusColor(d.status)} rounded-sm`}><SelectValue /></SelectTrigger>
                                                    <SelectContent className="bg-card border-border rounded-sm">
                                                        <SelectItem value="pending">Pending</SelectItem>
                                                        <SelectItem value="dispatched">Dispatched</SelectItem>
                                                        <SelectItem value="delivered">Delivered</SelectItem>
                                                    </SelectContent>
                                                </Select>
                                            </td>
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
                </CardContent>
            </Card>
        </div>
    );
};

export default Dispatch;
