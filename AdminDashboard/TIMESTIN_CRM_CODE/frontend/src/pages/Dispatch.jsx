import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '../components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Badge } from '../components/ui/badge';
import { Textarea } from '../components/ui/textarea';
import { dispatchAPI, brandsAPI, sizesAPI } from '../lib/api';
import { formatDate, formatNumber, getStatusColor } from '../lib/utils';
import { Plus, Trash2, Truck, Loader2, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';

const Dispatch = () => {
    const [dispatches, setDispatches] = useState([]);
    const [brands, setBrands] = useState([]);
    const [sizes, setSizes] = useState([]);
    const [loading, setLoading] = useState(true);
    const [dialogOpen, setDialogOpen] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    
    // Form state
    const [formData, setFormData] = useState({
        order_number: '',
        customer_name: '',
        brand_id: '',
        size_id: '',
        quantity: '',
        delivery_address: '',
        notes: ''
    });

    useEffect(() => {
        fetchData();
    }, []);

    const fetchData = async () => {
        try {
            setLoading(true);
            const [dispatchRes, brandsRes, sizesRes] = await Promise.all([
                dispatchAPI.getAll(),
                brandsAPI.getAll(),
                sizesAPI.getAll()
            ]);
            setDispatches(dispatchRes.data);
            setBrands(brandsRes.data);
            setSizes(sizesRes.data);
        } catch (err) {
            toast.error('Failed to load data');
        } finally {
            setLoading(false);
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        
        if (!formData.order_number || !formData.customer_name || !formData.brand_id || 
            !formData.size_id || !formData.quantity) {
            toast.error('Please fill all required fields');
            return;
        }

        setSubmitting(true);
        try {
            const brand = brands.find(b => b.id === formData.brand_id);
            const size = sizes.find(s => s.id === formData.size_id);
            
            await dispatchAPI.create({
                order_number: formData.order_number,
                customer_name: formData.customer_name,
                brand_id: formData.brand_id,
                brand_name: brand?.name || '',
                size_id: formData.size_id,
                size_name: size?.name || '',
                quantity: parseInt(formData.quantity),
                delivery_address: formData.delivery_address || null,
                notes: formData.notes || null
            });
            toast.success('Dispatch order created successfully');
            setDialogOpen(false);
            resetForm();
            fetchData();
        } catch (err) {
            toast.error('Failed to create dispatch order');
        } finally {
            setSubmitting(false);
        }
    };

    const resetForm = () => {
        setFormData({
            order_number: '',
            customer_name: '',
            brand_id: '',
            size_id: '',
            quantity: '',
            delivery_address: '',
            notes: ''
        });
    };

    const handleStatusChange = async (dispatchId, newStatus) => {
        try {
            await dispatchAPI.update(dispatchId, { status: newStatus });
            toast.success('Status updated');
            fetchData();
        } catch (err) {
            toast.error('Failed to update status');
        }
    };

    const handleDelete = async (id) => {
        if (!window.confirm('Are you sure you want to delete this dispatch?')) return;
        
        try {
            await dispatchAPI.delete(id);
            toast.success('Dispatch deleted');
            fetchData();
        } catch (err) {
            toast.error('Failed to delete dispatch');
        }
    };

    const totalQuantity = dispatches.reduce((sum, d) => sum + (d.quantity || 0), 0);
    const pendingOrders = dispatches.filter(d => d.status === 'pending').length;

    return (
        <div className="space-y-6 animate-fade-in" data-testid="dispatch-page">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                    <p className="text-muted-foreground">
                        Manage dispatch orders and shipments
                    </p>
                </div>
                <Dialog open={dialogOpen} onOpenChange={(open) => {
                    setDialogOpen(open);
                    if (!open) resetForm();
                }}>
                    <DialogTrigger asChild>
                        <Button className="font-bold uppercase tracking-wider rounded-sm" data-testid="add-dispatch-btn">
                            <Plus className="w-4 h-4 mr-2" />
                            New Dispatch
                        </Button>
                    </DialogTrigger>
                    <DialogContent className="bg-card border-border rounded-sm max-w-md">
                        <DialogHeader>
                            <DialogTitle className="font-display text-xl font-bold tracking-tight uppercase">
                                Create Dispatch Order
                            </DialogTitle>
                        </DialogHeader>
                        <form onSubmit={handleSubmit} className="space-y-4 mt-4">
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                                        Order Number *
                                    </Label>
                                    <Input
                                        value={formData.order_number}
                                        onChange={(e) => setFormData({...formData, order_number: e.target.value})}
                                        placeholder="ORD-001"
                                        className="bg-background border-input rounded-sm font-mono"
                                        data-testid="dispatch-order"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                                        Customer *
                                    </Label>
                                    <Input
                                        value={formData.customer_name}
                                        onChange={(e) => setFormData({...formData, customer_name: e.target.value})}
                                        placeholder="Customer name"
                                        className="bg-background border-input rounded-sm"
                                        data-testid="dispatch-customer"
                                    />
                                </div>
                            </div>

                            <div className="space-y-2">
                                <Label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                                    Brand *
                                </Label>
                                <Select 
                                    value={formData.brand_id} 
                                    onValueChange={(value) => setFormData({...formData, brand_id: value})}
                                >
                                    <SelectTrigger className="bg-background border-input rounded-sm" data-testid="dispatch-brand">
                                        <SelectValue placeholder="Select brand" />
                                    </SelectTrigger>
                                    <SelectContent className="bg-card border-border rounded-sm max-h-60">
                                        {brands.map(brand => (
                                            <SelectItem key={brand.id} value={brand.id}>{brand.name}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                                        Size *
                                    </Label>
                                    <Select 
                                        value={formData.size_id} 
                                        onValueChange={(value) => setFormData({...formData, size_id: value})}
                                    >
                                        <SelectTrigger className="bg-background border-input rounded-sm" data-testid="dispatch-size">
                                            <SelectValue placeholder="Select" />
                                        </SelectTrigger>
                                        <SelectContent className="bg-card border-border rounded-sm">
                                            {sizes.map(size => (
                                                <SelectItem key={size.id} value={size.id}>{size.name}</SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div className="space-y-2">
                                    <Label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                                        Quantity *
                                    </Label>
                                    <Input
                                        type="number"
                                        value={formData.quantity}
                                        onChange={(e) => setFormData({...formData, quantity: e.target.value})}
                                        placeholder="0"
                                        className="bg-background border-input rounded-sm font-mono"
                                        data-testid="dispatch-quantity"
                                    />
                                </div>
                            </div>

                            <div className="space-y-2">
                                <Label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                                    Delivery Address
                                </Label>
                                <Textarea
                                    value={formData.delivery_address}
                                    onChange={(e) => setFormData({...formData, delivery_address: e.target.value})}
                                    placeholder="Enter delivery address..."
                                    className="bg-background border-input rounded-sm"
                                    data-testid="dispatch-address"
                                />
                            </div>

                            <div className="space-y-2">
                                <Label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                                    Notes
                                </Label>
                                <Input
                                    value={formData.notes}
                                    onChange={(e) => setFormData({...formData, notes: e.target.value})}
                                    placeholder="Optional notes..."
                                    className="bg-background border-input rounded-sm"
                                    data-testid="dispatch-notes"
                                />
                            </div>

                            <Button 
                                type="submit" 
                                className="w-full font-bold uppercase tracking-wider rounded-sm"
                                disabled={submitting}
                                data-testid="submit-dispatch"
                            >
                                {submitting ? (
                                    <>
                                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                        Creating...
                                    </>
                                ) : (
                                    'Create Dispatch'
                                )}
                            </Button>
                        </form>
                    </DialogContent>
                </Dialog>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <Card className="industrial-card">
                    <CardContent className="p-4">
                        <div className="flex items-center gap-3">
                            <div className="p-2 bg-primary/10 rounded-sm border border-primary/20">
                                <Truck className="w-5 h-5 text-primary" />
                            </div>
                            <div>
                                <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                                    Total Orders
                                </p>
                                <p className="font-display text-2xl font-bold">{dispatches.length}</p>
                            </div>
                        </div>
                    </CardContent>
                </Card>
                <Card className="industrial-card">
                    <CardContent className="p-4">
                        <div className="flex items-center gap-3">
                            <div className="p-2 bg-warning/10 rounded-sm border border-warning/20">
                                <Truck className="w-5 h-5 text-warning" />
                            </div>
                            <div>
                                <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                                    Pending
                                </p>
                                <p className="font-display text-2xl font-bold">{pendingOrders}</p>
                            </div>
                        </div>
                    </CardContent>
                </Card>
                <Card className="industrial-card">
                    <CardContent className="p-4">
                        <div className="flex items-center gap-3">
                            <div className="p-2 bg-success/10 rounded-sm border border-success/20">
                                <Truck className="w-5 h-5 text-success" />
                            </div>
                            <div>
                                <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                                    Total Quantity
                                </p>
                                <p className="font-display text-2xl font-bold">{formatNumber(totalQuantity)}</p>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Table */}
            <Card className="industrial-card">
                <CardHeader>
                    <CardTitle className="font-display text-xl font-bold tracking-tight uppercase">
                        Dispatch Orders
                    </CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                    {loading ? (
                        <div className="flex items-center justify-center h-48">
                            <Loader2 className="w-6 h-6 animate-spin text-primary" />
                        </div>
                    ) : dispatches.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-48 text-muted-foreground">
                            <AlertCircle className="w-8 h-8 mb-2" />
                            <p>No dispatch orders found</p>
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="data-table" data-testid="dispatch-table">
                                <thead>
                                    <tr>
                                        <th>Date</th>
                                        <th>Order #</th>
                                        <th>Customer</th>
                                        <th>Brand</th>
                                        <th>Size</th>
                                        <th>Qty</th>
                                        <th>Status</th>
                                        <th>By</th>
                                        <th></th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {dispatches.map((dispatch) => (
                                        <tr key={dispatch.id} data-testid={`dispatch-row-${dispatch.id}`}>
                                            <td>{formatDate(dispatch.dispatch_date)}</td>
                                            <td className="font-mono font-medium">{dispatch.order_number}</td>
                                            <td className="font-medium">{dispatch.customer_name}</td>
                                            <td>{dispatch.brand_name}</td>
                                            <td>
                                                <Badge variant="outline">{dispatch.size_name}</Badge>
                                            </td>
                                            <td className="font-mono">{formatNumber(dispatch.quantity)}</td>
                                            <td>
                                                <Select
                                                    value={dispatch.status}
                                                    onValueChange={(value) => handleStatusChange(dispatch.id, value)}
                                                >
                                                    <SelectTrigger className={`w-32 h-8 text-xs ${getStatusColor(dispatch.status)} rounded-sm`}>
                                                        <SelectValue />
                                                    </SelectTrigger>
                                                    <SelectContent className="bg-card border-border rounded-sm">
                                                        <SelectItem value="pending">Pending</SelectItem>
                                                        <SelectItem value="dispatched">Dispatched</SelectItem>
                                                        <SelectItem value="delivered">Delivered</SelectItem>
                                                    </SelectContent>
                                                </Select>
                                            </td>
                                            <td className="text-muted-foreground">{dispatch.created_by}</td>
                                            <td>
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    onClick={() => handleDelete(dispatch.id)}
                                                    className="text-muted-foreground hover:text-destructive"
                                                    data-testid={`delete-dispatch-${dispatch.id}`}
                                                >
                                                    <Trash2 className="w-4 h-4" />
                                                </Button>
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
