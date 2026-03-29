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
import { printingAPI, brandsAPI, sizesAPI, purchaseAPI } from '../lib/api';
import { formatDate, formatNumber, getStatusColor } from '../lib/utils';
import { Plus, Trash2, Pencil, Printer, Loader2, AlertCircle, Layers } from 'lucide-react';
import { toast } from 'sonner';

const Printing = () => {
    const [jobs, setJobs] = useState([]);
    const [brands, setBrands] = useState([]);
    const [sizes, setSizes] = useState([]);
    const [availableMaterials, setAvailableMaterials] = useState([]);
    const [loading, setLoading] = useState(true);
    const [dialogOpen, setDialogOpen] = useState(false);
    const [editDialogOpen, setEditDialogOpen] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [deleteTarget, setDeleteTarget] = useState(null);

    // Create form state
    const [formData, setFormData] = useState({ job_number: '', raw_material_id: '', notes: '', job_date: new Date().toISOString().split('T')[0] });
    const [selectedMaterial, setSelectedMaterial] = useState(null);
    const [jobEntries, setJobEntries] = useState([]);
    const [currentSizeId, setCurrentSizeId] = useState('');
    const [currentBrandId, setCurrentBrandId] = useState('');
    const [currentBodiesCount, setCurrentBodiesCount] = useState('');

    // Edit form state (status, notes, date only)
    const [editingId, setEditingId] = useState(null);
    const [editForm, setEditForm] = useState({ status: '', notes: '' });

    useEffect(() => { fetchData(); }, []);

    const fetchData = async () => {
        try {
            setLoading(true);
            const [jobsRes, brandsRes, sizesRes, materialsRes] = await Promise.all([
                printingAPI.getAll(), brandsAPI.getAll(), sizesAPI.getAll(), purchaseAPI.getAvailable()
            ]);
            setJobs(jobsRes.data);
            setBrands(brandsRes.data);
            setSizes(sizesRes.data);
            setAvailableMaterials(materialsRes.data);
        } catch (err) { toast.error('Failed to load data'); }
        finally { setLoading(false); }
    };

    const resetForm = () => {
        setFormData({ job_number: '', raw_material_id: '', notes: '', job_date: new Date().toISOString().split('T')[0] });
        setSelectedMaterial(null);
        setJobEntries([]);
        setCurrentSizeId(''); setCurrentBrandId(''); setCurrentBodiesCount('');
    };

    const handleMaterialChange = (materialId) => {
        setFormData({ ...formData, raw_material_id: materialId });
        setSelectedMaterial(availableMaterials.find(m => m.id === materialId));
    };

    const handleAddEntry = () => {
        if (!currentSizeId || !currentBrandId || !currentBodiesCount) {
            toast.error('Please select size, brand and enter bodies count'); return;
        }
        const size = sizes.find(s => s.id === currentSizeId);
        const brand = brands.find(b => b.id === currentBrandId);
        if (!size || !brand) return;
        setJobEntries([...jobEntries, { size_id: size.id, size_name: size.name, brand_id: brand.id, brand_name: brand.name, bodies_count: parseInt(currentBodiesCount) }]);
        setCurrentSizeId(''); setCurrentBrandId(''); setCurrentBodiesCount('');
    };

    const handleRemoveEntry = (index) => { setJobEntries(jobEntries.filter((_, i) => i !== index)); };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!formData.job_number || !formData.raw_material_id || jobEntries.length === 0) {
            toast.error('Please fill job number, select raw material, and add at least one entry'); return;
        }
        const sizesMap = {};
        jobEntries.forEach(entry => {
            if (!sizesMap[entry.size_id]) { sizesMap[entry.size_id] = { size_id: entry.size_id, size_name: entry.size_name, brands: [] }; }
            sizesMap[entry.size_id].brands.push({ brand_id: entry.brand_id, brand_name: entry.brand_name, bodies_count: entry.bodies_count });
        });
        setSubmitting(true);
        try {
            await printingAPI.create({
                job_number: formData.job_number, raw_material_id: formData.raw_material_id,
                sizes: Object.values(sizesMap), notes: formData.notes || null,
                job_date: new Date(formData.job_date).toISOString(),
            });
            toast.success('Printing job created');
            setDialogOpen(false);
            resetForm();
            fetchData();
        } catch (err) { toast.error(err.response?.data?.detail || 'Failed to create job'); }
        finally { setSubmitting(false); }
    };

    const openEdit = (job) => {
        setEditingId(job.id);
        setEditForm({ status: job.status || 'pending', notes: job.notes || '' });
        setEditDialogOpen(true);
    };

    const handleEditSubmit = async (e) => {
        e.preventDefault();
        setSubmitting(true);
        try {
            await printingAPI.update(editingId, { status: editForm.status, notes: editForm.notes || null });
            toast.success('Job updated');
            setEditDialogOpen(false);
            fetchData();
        } catch (err) { toast.error('Failed to update job'); }
        finally { setSubmitting(false); }
    };

    const handleStatusChange = async (jobId, newStatus) => {
        try { await printingAPI.update(jobId, { status: newStatus }); toast.success('Status updated'); fetchData(); }
        catch (err) { toast.error('Failed to update status'); }
    };

    const handleDelete = async () => {
        if (!deleteTarget) return;
        try { await printingAPI.delete(deleteTarget); toast.success('Job deleted'); fetchData(); }
        catch (err) { toast.error('Failed to delete job'); }
        finally { setDeleteTarget(null); }
    };

    const getTotalBodies = () => jobEntries.reduce((sum, e) => sum + e.bodies_count, 0);

    return (
        <div className="space-y-6 animate-fade-in" data-testid="printing-page">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <p className="text-muted-foreground">Manage printing and coating jobs linked to raw materials</p>
                <Button onClick={() => { resetForm(); setDialogOpen(true); }} className="font-bold uppercase tracking-wider rounded-sm" data-testid="add-job-btn">
                    <Plus className="w-4 h-4 mr-2" /> New Job
                </Button>
            </div>

            {/* Create Job Dialog */}
            <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) resetForm(); }}>
                <DialogContent className="bg-card border-border rounded-sm max-w-xl max-h-[90vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle className="font-display text-xl font-bold tracking-tight uppercase">Create Printing Job</DialogTitle>
                    </DialogHeader>
                    <form onSubmit={handleSubmit} className="space-y-4 mt-4">
                        <div className="space-y-2">
                            <Label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Date *</Label>
                            <Input type="date" value={formData.job_date} onChange={(e) => setFormData({ ...formData, job_date: e.target.value })} className="bg-background border-input rounded-sm font-mono" data-testid="job-date" />
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Job Number *</Label>
                                <Input value={formData.job_number} onChange={(e) => setFormData({ ...formData, job_number: e.target.value })} placeholder="JOB-001" className="bg-background border-input rounded-sm font-mono" data-testid="job-number" />
                            </div>
                            <div className="space-y-2">
                                <Label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Raw Material *</Label>
                                <Select value={formData.raw_material_id} onValueChange={handleMaterialChange}>
                                    <SelectTrigger className="bg-background border-input rounded-sm" data-testid="raw-material-select"><SelectValue placeholder="Select raw material" /></SelectTrigger>
                                    <SelectContent className="bg-card border-border rounded-sm">
                                        {availableMaterials.length === 0 ? (
                                            <div className="p-2 text-sm text-muted-foreground">No available materials</div>
                                        ) : availableMaterials.map(m => (
                                            <SelectItem key={m.id} value={m.id}>{m.display_name}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>

                        {selectedMaterial && (
                            <div className="p-3 bg-primary/10 rounded-sm border border-primary/20 grid grid-cols-3 gap-4 text-sm">
                                <div><p className="text-xs font-bold uppercase text-muted-foreground">Size</p><p className="font-mono font-bold">{selectedMaterial.size1} x {selectedMaterial.size2}</p></div>
                                <div><p className="text-xs font-bold uppercase text-muted-foreground">Gauge</p><p className="font-mono">{selectedMaterial.gauge}</p></div>
                                <div><p className="text-xs font-bold uppercase text-muted-foreground">Available Sheets</p><p className="font-mono font-bold text-primary">{formatNumber(selectedMaterial.sheets_available)}</p></div>
                            </div>
                        )}

                        <div className="border-t border-border pt-4">
                            <Label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Add Size, Brand & Bodies</Label>
                        </div>
                        <div className="grid grid-cols-4 gap-2">
                            <Select value={currentSizeId} onValueChange={setCurrentSizeId}>
                                <SelectTrigger className="bg-background border-input rounded-sm" data-testid="container-size"><SelectValue placeholder="Size" /></SelectTrigger>
                                <SelectContent className="bg-card border-border rounded-sm">{sizes.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
                            </Select>
                            <Select value={currentBrandId} onValueChange={setCurrentBrandId}>
                                <SelectTrigger className="bg-background border-input rounded-sm" data-testid="brand-select"><SelectValue placeholder="Brand" /></SelectTrigger>
                                <SelectContent className="bg-card border-border rounded-sm max-h-60">{brands.map(b => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}</SelectContent>
                            </Select>
                            <Input type="number" value={currentBodiesCount} onChange={(e) => setCurrentBodiesCount(e.target.value)} placeholder="Bodies" className="bg-background border-input rounded-sm font-mono" data-testid="bodies-count" />
                            <Button type="button" onClick={handleAddEntry} className="rounded-sm" data-testid="add-entry-btn"><Plus className="w-4 h-4" /></Button>
                        </div>

                        {jobEntries.length > 0 && (
                            <div className="space-y-2">
                                <Label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Added Entries ({jobEntries.length})</Label>
                                <div className="space-y-1 max-h-40 overflow-y-auto">
                                    {jobEntries.map((entry, idx) => (
                                        <div key={idx} className="flex items-center justify-between p-2 bg-secondary/50 rounded-sm">
                                            <div className="flex items-center gap-2">
                                                <Badge variant="outline">{entry.size_name}</Badge>
                                                <span className="text-sm">{entry.brand_name}</span>
                                                <Badge variant="secondary" className="font-mono">{formatNumber(entry.bodies_count)} bodies</Badge>
                                            </div>
                                            <Button type="button" variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground hover:text-destructive" onClick={() => handleRemoveEntry(idx)}>
                                                <Trash2 className="w-3 h-3" />
                                            </Button>
                                        </div>
                                    ))}
                                </div>
                                <div className="flex justify-between text-sm p-2 bg-success/10 rounded-sm border border-success/20">
                                    <span className="font-bold uppercase tracking-wider">Total Bodies</span>
                                    <span className="font-mono font-bold text-success">{formatNumber(getTotalBodies())}</span>
                                </div>
                            </div>
                        )}

                        <div className="space-y-2">
                            <Label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Notes</Label>
                            <Textarea value={formData.notes} onChange={(e) => setFormData({ ...formData, notes: e.target.value })} placeholder="Optional notes..." className="bg-background border-input rounded-sm" data-testid="job-notes" />
                        </div>
                        <Button type="submit" className="w-full font-bold uppercase tracking-wider rounded-sm" disabled={submitting || jobEntries.length === 0 || !formData.raw_material_id} data-testid="submit-job">
                            {submitting ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Creating...</> : 'Create Job'}
                        </Button>
                    </form>
                </DialogContent>
            </Dialog>

            {/* Edit Job Dialog (status & notes) */}
            <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
                <DialogContent className="bg-card border-border rounded-sm max-w-sm">
                    <DialogHeader>
                        <DialogTitle className="font-display text-xl font-bold tracking-tight uppercase">Edit Printing Job</DialogTitle>
                    </DialogHeader>
                    <form onSubmit={handleEditSubmit} className="space-y-4 mt-4">
                        <div className="space-y-2">
                            <Label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Status</Label>
                            <Select value={editForm.status} onValueChange={(v) => setEditForm({ ...editForm, status: v })}>
                                <SelectTrigger className="bg-background border-input rounded-sm"><SelectValue /></SelectTrigger>
                                <SelectContent className="bg-card border-border rounded-sm">
                                    <SelectItem value="pending">Pending</SelectItem>
                                    <SelectItem value="in_progress">In Progress</SelectItem>
                                    <SelectItem value="completed">Completed</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-2">
                            <Label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Notes</Label>
                            <Textarea value={editForm.notes} onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })} placeholder="Optional notes..." className="bg-background border-input rounded-sm" />
                        </div>
                        <Button type="submit" className="w-full font-bold uppercase tracking-wider rounded-sm" disabled={submitting}>
                            {submitting ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Saving...</> : 'Update Job'}
                        </Button>
                    </form>
                </DialogContent>
            </Dialog>

            <ConfirmDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)} title="Delete Printing Job?" description="This will permanently remove this printing job." onConfirm={handleDelete} />

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <Card className="industrial-card"><CardContent className="p-4"><div className="flex items-center gap-3"><div className="p-2 bg-primary/10 rounded-sm border border-primary/20"><Printer className="w-5 h-5 text-primary" /></div><div><p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Total Jobs</p><p className="font-display text-2xl font-bold">{jobs.length}</p></div></div></CardContent></Card>
                <Card className="industrial-card"><CardContent className="p-4"><div className="flex items-center gap-3"><div className="p-2 bg-warning/10 rounded-sm border border-warning/20"><Printer className="w-5 h-5 text-warning" /></div><div><p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Pending Jobs</p><p className="font-display text-2xl font-bold">{jobs.filter(j => j.status === 'pending').length}</p></div></div></CardContent></Card>
                <Card className="industrial-card"><CardContent className="p-4"><div className="flex items-center gap-3"><div className="p-2 bg-success/10 rounded-sm border border-success/20"><Layers className="w-5 h-5 text-success" /></div><div><p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Total Bodies</p><p className="font-display text-2xl font-bold">{formatNumber(jobs.reduce((sum, j) => sum + j.total_bodies, 0))}</p></div></div></CardContent></Card>
            </div>

            <Card className="industrial-card">
                <CardHeader><CardTitle className="font-display text-xl font-bold tracking-tight uppercase">Printing Jobs</CardTitle></CardHeader>
                <CardContent className="p-0">
                    {loading ? (
                        <div className="flex items-center justify-center h-48"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
                    ) : jobs.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-48 text-muted-foreground"><AlertCircle className="w-8 h-8 mb-2" /><p>No printing jobs found</p></div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="data-table" data-testid="jobs-table">
                                <thead><tr><th>Date</th><th>Job #</th><th>Raw Material</th><th>Material Size</th><th>Sheets</th><th>Sizes & Brands</th><th>Total Bodies</th><th>Status</th><th>By</th><th></th></tr></thead>
                                <tbody>
                                    {jobs.map((job) => (
                                        <tr key={job.id} data-testid={`job-row-${job.id}`}>
                                            <td>{formatDate(job.job_date)}</td>
                                            <td className="font-medium">{job.job_number}</td>
                                            <td>{job.raw_material_sr_no}</td>
                                            <td>{job.raw_material_size}</td>
                                            <td className="font-mono">{formatNumber(job.sheets_from_material)}</td>
                                            <td><div className="flex flex-wrap gap-1 max-w-xs">{job.sizes?.map((s, i) => (<Badge key={i} variant="outline" className="text-xs">{s.size_name}: {s.brands?.map(b => b.brand_name).join(', ')}</Badge>))}</div></td>
                                            <td className="font-mono text-primary font-bold">{formatNumber(job.total_bodies)}</td>
                                            <td>
                                                <Select value={job.status} onValueChange={(v) => handleStatusChange(job.id, v)}>
                                                    <SelectTrigger className={`w-32 h-8 text-xs ${getStatusColor(job.status)} rounded-sm`}><SelectValue /></SelectTrigger>
                                                    <SelectContent className="bg-card border-border rounded-sm">
                                                        <SelectItem value="pending">Pending</SelectItem>
                                                        <SelectItem value="in_progress">In Progress</SelectItem>
                                                        <SelectItem value="completed">Completed</SelectItem>
                                                    </SelectContent>
                                                </Select>
                                            </td>
                                            <td className="text-muted-foreground">{job.created_by}</td>
                                            <td>
                                                <div className="flex gap-1">
                                                    <Button variant="ghost" size="icon" onClick={() => openEdit(job)} className="text-muted-foreground hover:text-primary"><Pencil className="w-4 h-4" /></Button>
                                                    <Button variant="ghost" size="icon" onClick={() => setDeleteTarget(job.id)} className="text-muted-foreground hover:text-destructive" data-testid={`delete-job-${job.id}`}><Trash2 className="w-4 h-4" /></Button>
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

export default Printing;
