import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../components/ui/dialog';
import { Badge } from '../components/ui/badge';
import ConfirmDialog from '../components/ConfirmDialog';
import { brandsAPI } from '../lib/api';
import { formatDate } from '../lib/utils';
import { Plus, Trash2, Pencil, Tag, Loader2, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';

const Brands = () => {
    const [brands, setBrands] = useState([]);
    const [loading, setLoading] = useState(true);
    const [dialogOpen, setDialogOpen] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [editingId, setEditingId] = useState(null);
    const [brandName, setBrandName] = useState('');
    const [deleteTarget, setDeleteTarget] = useState(null);

    useEffect(() => { fetchBrands(); }, []);

    const fetchBrands = async () => {
        try { setLoading(true); const res = await brandsAPI.getAll(); setBrands(res.data); }
        catch (err) { toast.error('Failed to load brands'); }
        finally { setLoading(false); }
    };

    const openCreate = () => { setEditingId(null); setBrandName(''); setDialogOpen(true); };

    const openEdit = (brand) => { setEditingId(brand.id); setBrandName(brand.name); setDialogOpen(true); };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!brandName.trim()) { toast.error('Enter brand name'); return; }
        setSubmitting(true);
        try {
            if (editingId) {
                await brandsAPI.update(editingId, { name: brandName.trim().toUpperCase() });
                toast.success('Brand updated');
            } else {
                await brandsAPI.create({ name: brandName.trim().toUpperCase() });
                toast.success('Brand added');
            }
            setDialogOpen(false);
            fetchBrands();
        } catch (err) { toast.error('Failed to save brand'); }
        finally { setSubmitting(false); }
    };

    const handleDelete = async () => {
        if (!deleteTarget) return;
        try { await brandsAPI.delete(deleteTarget); toast.success('Brand deleted'); fetchBrands(); }
        catch (err) { toast.error('Failed to delete brand'); }
        finally { setDeleteTarget(null); }
    };

    return (
        <div className="space-y-6 animate-fade-in" data-testid="brands-page">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <p className="text-muted-foreground">Manage paint brand product lines</p>
                <Button onClick={openCreate} className="font-bold uppercase tracking-wider rounded-sm" data-testid="add-brand-btn">
                    <Plus className="w-4 h-4 mr-2" /> Add Brand
                </Button>
            </div>

            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                <DialogContent className="bg-card border-border rounded-sm max-w-sm">
                    <DialogHeader>
                        <DialogTitle className="font-display text-xl font-bold tracking-tight uppercase">
                            {editingId ? 'Edit Brand' : 'Add Brand'}
                        </DialogTitle>
                    </DialogHeader>
                    <form onSubmit={handleSubmit} className="space-y-4 mt-4">
                        <div className="space-y-2">
                            <Label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Brand Name *</Label>
                            <Input value={brandName} onChange={(e) => setBrandName(e.target.value)} placeholder="e.g., SYNCOAT PREMIUM" className="bg-background border-input rounded-sm" data-testid="brand-name-input" />
                        </div>
                        <Button type="submit" className="w-full font-bold uppercase tracking-wider rounded-sm" disabled={submitting} data-testid="submit-brand">
                            {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : (editingId ? 'Update Brand' : 'Add Brand')}
                        </Button>
                    </form>
                </DialogContent>
            </Dialog>

            <ConfirmDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)} title="Delete Brand?" description="This will permanently remove this brand. Existing entries using this brand will not be affected." onConfirm={handleDelete} />

            <Card className="industrial-card">
                <CardHeader className="flex flex-row items-center justify-between">
                    <CardTitle className="font-display text-xl font-bold tracking-tight uppercase">Brand Management</CardTitle>
                    <Badge variant="outline">{brands.length} brands</Badge>
                </CardHeader>
                <CardContent>
                    {loading ? (
                        <div className="flex items-center justify-center h-48"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
                    ) : brands.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-48 text-muted-foreground"><AlertCircle className="w-8 h-8 mb-2" /><p>No brands found</p></div>
                    ) : (
                        <div className="flex flex-wrap gap-3">
                            {brands.map((brand) => (
                                <div key={brand.id} className="flex items-center gap-2 px-4 py-2 bg-secondary/50 rounded-sm border border-border" data-testid={`brand-${brand.id}`}>
                                    <Tag className="w-4 h-4 text-primary" />
                                    <span className="font-bold text-sm uppercase tracking-wider">{brand.name}</span>
                                    <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground hover:text-primary" onClick={() => openEdit(brand)}>
                                        <Pencil className="w-3 h-3" />
                                    </Button>
                                    <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground hover:text-destructive" onClick={() => setDeleteTarget(brand.id)}>
                                        <Trash2 className="w-3 h-3" />
                                    </Button>
                                </div>
                            ))}
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
};

export default Brands;
