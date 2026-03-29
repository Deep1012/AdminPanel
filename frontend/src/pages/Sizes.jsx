import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../components/ui/dialog';
import { Badge } from '../components/ui/badge';
import ConfirmDialog from '../components/ConfirmDialog';
import { sizesAPI } from '../lib/api';
import { formatDate } from '../lib/utils';
import { Plus, Trash2, Pencil, Ruler, Loader2, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';

const Sizes = () => {
    const [sizes, setSizes] = useState([]);
    const [loading, setLoading] = useState(true);
    const [dialogOpen, setDialogOpen] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [editingId, setEditingId] = useState(null);
    const [sizeName, setSizeName] = useState('');
    const [deleteTarget, setDeleteTarget] = useState(null);

    useEffect(() => { fetchSizes(); }, []);

    const fetchSizes = async () => {
        try { setLoading(true); const res = await sizesAPI.getAll(); setSizes(res.data); }
        catch (err) { toast.error('Failed to load sizes'); }
        finally { setLoading(false); }
    };

    const openCreate = () => { setEditingId(null); setSizeName(''); setDialogOpen(true); };

    const openEdit = (size) => { setEditingId(size.id); setSizeName(size.name); setDialogOpen(true); };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!sizeName.trim()) { toast.error('Enter size name'); return; }
        setSubmitting(true);
        try {
            if (editingId) {
                await sizesAPI.update(editingId, { name: sizeName.trim().toUpperCase() });
                toast.success('Size updated');
            } else {
                await sizesAPI.create({ name: sizeName.trim().toUpperCase() });
                toast.success('Size added');
            }
            setDialogOpen(false);
            fetchSizes();
        } catch (err) { toast.error('Failed to save size'); }
        finally { setSubmitting(false); }
    };

    const handleDelete = async () => {
        if (!deleteTarget) return;
        try { await sizesAPI.delete(deleteTarget); toast.success('Size deleted'); fetchSizes(); }
        catch (err) { toast.error('Failed to delete size'); }
        finally { setDeleteTarget(null); }
    };

    return (
        <div className="space-y-6 animate-fade-in" data-testid="sizes-page">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <p className="text-muted-foreground">Manage container sizes for production</p>
                <Button onClick={openCreate} className="font-bold uppercase tracking-wider rounded-sm" data-testid="add-size-btn">
                    <Plus className="w-4 h-4 mr-2" /> Add Size
                </Button>
            </div>

            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                <DialogContent className="bg-card border-border rounded-sm max-w-sm">
                    <DialogHeader>
                        <DialogTitle className="font-display text-xl font-bold tracking-tight uppercase">
                            {editingId ? 'Edit Size' : 'Add Size'}
                        </DialogTitle>
                    </DialogHeader>
                    <form onSubmit={handleSubmit} className="space-y-4 mt-4">
                        <div className="space-y-2">
                            <Label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Size Name *</Label>
                            <Input value={sizeName} onChange={(e) => setSizeName(e.target.value)} placeholder="e.g., 4LTR/5KG" className="bg-background border-input rounded-sm" data-testid="size-name-input" />
                        </div>
                        <Button type="submit" className="w-full font-bold uppercase tracking-wider rounded-sm" disabled={submitting} data-testid="submit-size">
                            {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : (editingId ? 'Update Size' : 'Add Size')}
                        </Button>
                    </form>
                </DialogContent>
            </Dialog>

            <ConfirmDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)} title="Delete Size?" description="This will permanently remove this size. Existing entries using this size will not be affected." onConfirm={handleDelete} />

            <Card className="industrial-card">
                <CardHeader className="flex flex-row items-center justify-between">
                    <CardTitle className="font-display text-xl font-bold tracking-tight uppercase">Size Management</CardTitle>
                    <Badge variant="outline">{sizes.length} sizes</Badge>
                </CardHeader>
                <CardContent>
                    {loading ? (
                        <div className="flex items-center justify-center h-48"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
                    ) : sizes.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-48 text-muted-foreground"><AlertCircle className="w-8 h-8 mb-2" /><p>No sizes found</p></div>
                    ) : (
                        <div className="flex flex-wrap gap-3">
                            {sizes.map((size) => (
                                <div key={size.id} className="flex items-center gap-2 px-4 py-2 bg-secondary/50 rounded-sm border border-border" data-testid={`size-${size.id}`}>
                                    <Ruler className="w-4 h-4 text-primary" />
                                    <span className="font-bold text-sm uppercase tracking-wider">{size.name}</span>
                                    <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground hover:text-primary" onClick={() => openEdit(size)}>
                                        <Pencil className="w-3 h-3" />
                                    </Button>
                                    <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground hover:text-destructive" onClick={() => setDeleteTarget(size.id)}>
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

export default Sizes;
