import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Switch } from '../components/ui/switch';
import { Badge } from '../components/ui/badge';
import ConfirmDialog from '../components/ConfirmDialog';
import { menuItemsAPI } from '../lib/api';
import { getIcon, AVAILABLE_ICONS } from '../lib/iconMap';
import { Plus, Trash2, Pencil, Loader2, AlertCircle, ArrowUp, ArrowDown, Menu, RotateCcw } from 'lucide-react';
import { toast } from 'sonner';

const emptyForm = { label: '', path: '', icon: 'Package', admin_only: false };

const MenuManagement = () => {
    const [items, setItems] = useState([]);
    const [loading, setLoading] = useState(true);
    const [dialogOpen, setDialogOpen] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [editingId, setEditingId] = useState(null);
    const [formData, setFormData] = useState({ ...emptyForm });
    const [deleteTarget, setDeleteTarget] = useState(null);
    const [reordered, setReordered] = useState(false);

    useEffect(() => { fetchData(); }, []);

    const fetchData = async () => {
        try {
            setLoading(true);
            const res = await menuItemsAPI.getAll();
            setItems(res.data);
            setReordered(false);
        } catch (err) { toast.error('Failed to load menu items'); }
        finally { setLoading(false); }
    };

    const openCreate = () => { setEditingId(null); setFormData({ ...emptyForm }); setDialogOpen(true); };
    const openEdit = (item) => {
        setEditingId(item.id);
        setFormData({ label: item.label, path: item.path, icon: item.icon, admin_only: item.admin_only });
        setDialogOpen(true);
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!formData.label || !formData.path || !formData.icon) { toast.error('Please fill all required fields'); return; }
        if (!formData.path.startsWith('/')) { toast.error('Path must start with /'); return; }
        setSubmitting(true);
        try {
            if (editingId) {
                await menuItemsAPI.update(editingId, formData);
                toast.success('Menu item updated');
            } else {
                await menuItemsAPI.create(formData);
                toast.success('Menu item created');
            }
            setDialogOpen(false); fetchData();
        } catch (err) { toast.error(err.response?.data?.detail || 'Failed to save menu item'); }
        finally { setSubmitting(false); }
    };

    const handleDelete = async () => {
        if (!deleteTarget) return;
        try { await menuItemsAPI.delete(deleteTarget); toast.success('Menu item deleted'); fetchData(); }
        catch (err) { toast.error(err.response?.data?.detail || 'Failed to delete'); }
        finally { setDeleteTarget(null); }
    };

    const moveItem = (index, direction) => {
        const newItems = [...items];
        const swapIndex = index + direction;
        if (swapIndex < 0 || swapIndex >= newItems.length) return;
        const tempOrder = newItems[index].display_order;
        newItems[index].display_order = newItems[swapIndex].display_order;
        newItems[swapIndex].display_order = tempOrder;
        [newItems[index], newItems[swapIndex]] = [newItems[swapIndex], newItems[index]];
        setItems(newItems);
        setReordered(true);
    };

    const saveOrder = async () => {
        try {
            const orderData = items.map((item, idx) => ({ id: item.id, display_order: idx + 1 }));
            await menuItemsAPI.reorder(orderData);
            toast.success('Menu order saved');
            setReordered(false);
            fetchData();
        } catch (err) { toast.error('Failed to save order'); }
    };

    const handleSeedDefaults = async () => {
        try {
            const res = await menuItemsAPI.seedDefaults();
            toast.success(res.data.message);
            fetchData();
        } catch (err) { toast.error(err.response?.data?.detail || 'Failed to seed defaults'); }
    };

    if (loading) return <div className="flex items-center justify-center h-64"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;

    return (
        <div className="space-y-6 animate-fade-in" data-testid="menu-management-page">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <p className="text-muted-foreground">Configure sidebar navigation items and display order</p>
                <div className="flex gap-2">
                    {items.length === 0 && (
                        <Button variant="outline" onClick={handleSeedDefaults} className="font-bold uppercase tracking-wider rounded-sm">
                            <RotateCcw className="w-4 h-4 mr-2" /> Seed Defaults
                        </Button>
                    )}
                    {reordered && (
                        <Button onClick={saveOrder} className="font-bold uppercase tracking-wider rounded-sm bg-success hover:bg-success/90">
                            Save Order
                        </Button>
                    )}
                    <Button onClick={openCreate} className="font-bold uppercase tracking-wider rounded-sm" data-testid="add-menu-item-btn">
                        <Plus className="w-4 h-4 mr-2" /> Add Item
                    </Button>
                </div>
            </div>

            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                <DialogContent className="bg-card border-border rounded-sm max-w-md">
                    <DialogHeader>
                        <DialogTitle className="font-display text-xl font-bold tracking-tight uppercase">
                            {editingId ? 'Edit Menu Item' : 'Add Menu Item'}
                        </DialogTitle>
                    </DialogHeader>
                    <form onSubmit={handleSubmit} className="space-y-4 mt-4">
                        <div className="space-y-2">
                            <Label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Label *</Label>
                            <Input value={formData.label} onChange={(e) => setFormData({ ...formData, label: e.target.value })} placeholder="e.g., REPORTS" className="bg-background border-input rounded-sm" />
                        </div>
                        <div className="space-y-2">
                            <Label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Path *</Label>
                            <Input value={formData.path} onChange={(e) => setFormData({ ...formData, path: e.target.value })} placeholder="e.g., /reports" className="bg-background border-input rounded-sm font-mono" />
                        </div>
                        <div className="space-y-2">
                            <Label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Icon *</Label>
                            <Select value={formData.icon} onValueChange={(v) => setFormData({ ...formData, icon: v })}>
                                <SelectTrigger className="bg-background border-input rounded-sm"><SelectValue /></SelectTrigger>
                                <SelectContent className="bg-card border-border rounded-sm max-h-60">
                                    {AVAILABLE_ICONS.map(name => {
                                        const Icon = getIcon(name);
                                        return (
                                            <SelectItem key={name} value={name}>
                                                <div className="flex items-center gap-2"><Icon className="w-4 h-4" /> {name}</div>
                                            </SelectItem>
                                        );
                                    })}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="flex items-center justify-between">
                            <Label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Admin Only</Label>
                            <Switch checked={formData.admin_only} onCheckedChange={(v) => setFormData({ ...formData, admin_only: v })} />
                        </div>
                        <Button type="submit" className="w-full font-bold uppercase tracking-wider rounded-sm" disabled={submitting}>
                            {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : (editingId ? 'Update Item' : 'Add Item')}
                        </Button>
                    </form>
                </DialogContent>
            </Dialog>

            <ConfirmDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)} title="Delete Menu Item?" description="This will remove the item from the sidebar navigation." onConfirm={handleDelete} />

            <Card className="industrial-card">
                <CardHeader className="flex flex-row items-center justify-between">
                    <CardTitle className="font-display text-xl font-bold tracking-tight uppercase flex items-center gap-2">
                        <Menu className="w-5 h-5 text-primary" /> Menu Items
                    </CardTitle>
                    <Badge variant="outline">{items.length} items</Badge>
                </CardHeader>
                <CardContent className="p-0">
                    {items.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-48 text-muted-foreground">
                            <AlertCircle className="w-8 h-8 mb-2" />
                            <p>No menu items configured</p>
                            <Button variant="outline" className="mt-4" onClick={handleSeedDefaults}>Seed Default Items</Button>
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="data-table">
                                <thead><tr><th>#</th><th>Icon</th><th>Label</th><th>Path</th><th>Admin Only</th><th>System</th><th></th></tr></thead>
                                <tbody>
                                    {items.map((item, idx) => {
                                        const Icon = getIcon(item.icon);
                                        return (
                                            <tr key={item.id}>
                                                <td className="text-muted-foreground">{idx + 1}</td>
                                                <td><Icon className="w-4 h-4" /></td>
                                                <td className="font-medium">{item.label}</td>
                                                <td className="font-mono text-muted-foreground">{item.path}</td>
                                                <td>{item.admin_only ? <Badge variant="default">Yes</Badge> : <Badge variant="secondary">No</Badge>}</td>
                                                <td>{item.is_system ? <Badge variant="outline">System</Badge> : '-'}</td>
                                                <td>
                                                    <div className="flex gap-1">
                                                        <Button variant="ghost" size="icon" onClick={() => moveItem(idx, -1)} disabled={idx === 0} className="text-muted-foreground hover:text-primary h-8 w-8"><ArrowUp className="w-3 h-3" /></Button>
                                                        <Button variant="ghost" size="icon" onClick={() => moveItem(idx, 1)} disabled={idx === items.length - 1} className="text-muted-foreground hover:text-primary h-8 w-8"><ArrowDown className="w-3 h-3" /></Button>
                                                        <Button variant="ghost" size="icon" onClick={() => openEdit(item)} className="text-muted-foreground hover:text-primary h-8 w-8"><Pencil className="w-3 h-3" /></Button>
                                                        {!item.is_system && (
                                                            <Button variant="ghost" size="icon" onClick={() => setDeleteTarget(item.id)} className="text-muted-foreground hover:text-destructive h-8 w-8"><Trash2 className="w-3 h-3" /></Button>
                                                        )}
                                                    </div>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
};

export default MenuManagement;
