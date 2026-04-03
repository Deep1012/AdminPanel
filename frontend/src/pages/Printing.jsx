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
import { printingAPI, brandsAPI, sizesAPI, purchaseAPI } from '../lib/api';
import { formatDate, formatNumber, parseImportDate } from '../lib/utils';
import { Plus, Trash2, Pencil, Printer, Loader2, AlertCircle, Layers, Download } from 'lucide-react';
import { toast } from 'sonner';
import { exportToExcel } from '../lib/exportToExcel';
import ImportExcelButton from '../components/ImportExcelButton';

const PRINTING_EXPORT_COLUMNS = [
    { header: 'Date', key: 'job_date', transform: (v) => formatDate(v) },
    { header: 'Job #', key: 'job_number' },
    { header: 'Raw Material', key: 'raw_material_sr_no' },
    { header: 'Material Size', key: 'raw_material_size' },
    { header: 'Sheets', key: 'sheets_from_material' },
    { header: 'Size', key: 'size_name' },
    { header: 'Brand', key: 'brand_name' },
    { header: 'Bodies', key: 'bodies_count' },
    { header: 'Total Printing', key: 'total_printing' },
    { header: 'Created By', key: 'created_by' },
];

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
    const [formData, setFormData] = useState({ raw_material_id: '', notes: '', job_date: new Date().toISOString().split('T')[0], sheets_used: '' });
    const [selectedMaterial, setSelectedMaterial] = useState(null);
    const [jobEntries, setJobEntries] = useState([]);
    const [currentSizeId, setCurrentSizeId] = useState('');
    const [currentBrandId, setCurrentBrandId] = useState('');
    const [currentBodiesCount, setCurrentBodiesCount] = useState('');

    // Edit form state
    const [editingId, setEditingId] = useState(null);
    const [editForm, setEditForm] = useState({ notes: '', job_date: '', sheets_used: '' });
    const [editEntries, setEditEntries] = useState([]);
    const [editSizeId, setEditSizeId] = useState('');
    const [editBrandId, setEditBrandId] = useState('');
    const [editBodiesCount, setEditBodiesCount] = useState('');
    const [editMaterialInfo, setEditMaterialInfo] = useState(null);

    const [searchTerm, setSearchTerm] = useState('');
    const filters = useMemo(() => [], []);

    // Flatten jobs: each size+brand combo = one row
    const flattenedRows = useMemo(() => {
        const rows = [];
        for (const job of jobs) {
            const jobSheets = job.sheets_from_material || 0;
            for (const sizeEntry of (job.sizes || [])) {
                for (const brand of (sizeEntry.brands || [])) {
                    rows.push({
                        _rowKey: `${job.id}_${sizeEntry.size_id}_${brand.brand_id}`,
                        id: job.id,
                        job_date: job.job_date,
                        job_number: job.job_number,
                        raw_material_sr_no: job.raw_material_sr_no,
                        raw_material_size: job.raw_material_size,
                        sheets_from_material: jobSheets,
                        size_name: sizeEntry.size_name,
                        brand_name: brand.brand_name,
                        bodies_count: brand.bodies_count || 0,
                        total_printing: (brand.bodies_count || 0) * jobSheets,
                        created_by: job.created_by,
                        notes: job.notes,
                    });
                }
            }
        }
        return rows;
    }, [jobs]);

    const filteredJobs = useTableFilter({
        data: flattenedRows, searchTerm, searchFields: ['job_number', 'raw_material_sr_no', 'size_name', 'brand_name'], filters
    });

    const { paginatedData: paginatedJobs, currentPage, totalPages, pageSize, setCurrentPage, setPageSize, startIndex, PAGE_SIZE_OPTIONS } = usePagination({ data: filteredJobs });

    useEffect(() => { fetchData(); }, []);

    const fetchData = async () => {
        try {
            setLoading(true);
            const [jobsRes, brandsRes, sizesRes, materialsRes] = await Promise.all([
                printingAPI.getAll(), brandsAPI.getAll(), sizesAPI.getAll(), purchaseAPI.getAvailable()
            ]);
            setJobs(jobsRes.data); setBrands(brandsRes.data); setSizes(sizesRes.data); setAvailableMaterials(materialsRes.data);
        } catch (err) { toast.error('Failed to load data'); }
        finally { setLoading(false); }
    };

    const resetForm = () => {
        setFormData({ raw_material_id: '', notes: '', job_date: new Date().toISOString().split('T')[0], sheets_used: '' });
        setSelectedMaterial(null); setJobEntries([]); setCurrentSizeId(''); setCurrentBrandId(''); setCurrentBodiesCount('');
    };

    const handleMaterialChange = (materialId) => {
        setFormData({ ...formData, raw_material_id: materialId });
        setSelectedMaterial(availableMaterials.find(m => m.id === materialId));
    };

    const handleAddEntry = () => {
        if (!currentSizeId || !currentBrandId || !currentBodiesCount) { toast.error('Please select size, brand, and enter bodies count'); return; }
        const size = sizes.find(s => s.id === currentSizeId);
        const brand = brands.find(b => b.id === currentBrandId);
        if (!size || !brand) return;
        setJobEntries([...jobEntries, { size_id: size.id, size_name: size.name, brand_id: brand.id, brand_name: brand.name, bodies_count: parseInt(currentBodiesCount) }]);
        setCurrentSizeId(''); setCurrentBrandId(''); setCurrentBodiesCount('');
    };

    const handleRemoveEntry = (index) => { setJobEntries(jobEntries.filter((_, i) => i !== index)); };

    const handleSubmit = async (e) => {
        e.preventDefault();
        const sheetsVal = parseInt(formData.sheets_used);
        if (!formData.raw_material_id || jobEntries.length === 0 || !sheetsVal) {
            toast.error('Please select raw material, enter sheets used, and add at least one entry'); return;
        }
        if (selectedMaterial && sheetsVal > selectedMaterial.sheets_available) {
            toast.error(`Sheets used (${sheetsVal}) exceeds available (${selectedMaterial.sheets_available})`); return;
        }
        const sizesMap = {};
        jobEntries.forEach(entry => {
            if (!sizesMap[entry.size_id]) { sizesMap[entry.size_id] = { size_id: entry.size_id, size_name: entry.size_name, brands: [] }; }
            sizesMap[entry.size_id].brands.push({ brand_id: entry.brand_id, brand_name: entry.brand_name, bodies_count: entry.bodies_count });
        });
        setSubmitting(true);
        try {
            await printingAPI.create({
                raw_material_id: formData.raw_material_id,
                sheets_used: sheetsVal,
                sizes: Object.values(sizesMap), notes: formData.notes || null,
                job_date: new Date(formData.job_date).toISOString(),
            });
            toast.success('Printing job created'); setDialogOpen(false); resetForm(); fetchData();
        } catch (err) { toast.error(err.response?.data?.detail || 'Failed to create job'); }
        finally { setSubmitting(false); }
    };

    const openEdit = (row) => {
        const job = jobs.find(j => j.id === row.id);
        if (!job) return;
        setEditingId(job.id);
        const entries = [];
        for (const sizeEntry of (job.sizes || [])) {
            for (const brand of (sizeEntry.brands || [])) {
                entries.push({ size_id: sizeEntry.size_id, size_name: sizeEntry.size_name, brand_id: brand.brand_id, brand_name: brand.brand_name, bodies_count: brand.bodies_count });
            }
        }
        setEditEntries(entries);
        setEditMaterialInfo({ sr_no: job.raw_material_sr_no, size: job.raw_material_size, sheets: job.sheets_from_material });
        setEditForm({
            job_date: job.job_date ? job.job_date.split('T')[0] : new Date().toISOString().split('T')[0],
            notes: job.notes || '',
            sheets_used: String(job.sheets_from_material || ''),
        });
        setEditSizeId(''); setEditBrandId(''); setEditBodiesCount('');
        setEditDialogOpen(true);
    };

    const handleEditAddEntry = () => {
        if (!editSizeId || !editBrandId || !editBodiesCount) { toast.error('Please select size, brand, and enter bodies count'); return; }
        const size = sizes.find(s => s.id === editSizeId);
        const brand = brands.find(b => b.id === editBrandId);
        if (!size || !brand) return;
        setEditEntries([...editEntries, { size_id: size.id, size_name: size.name, brand_id: brand.id, brand_name: brand.name, bodies_count: parseInt(editBodiesCount) }]);
        setEditSizeId(''); setEditBrandId(''); setEditBodiesCount('');
    };

    const handleEditSubmit = async (e) => {
        e.preventDefault();
        const sheetsVal = parseInt(editForm.sheets_used);
        if (editEntries.length === 0 || !sheetsVal) { toast.error('Add at least one entry and specify sheets used'); return; }
        const sizesMap = {};
        editEntries.forEach(entry => {
            if (!sizesMap[entry.size_id]) { sizesMap[entry.size_id] = { size_id: entry.size_id, size_name: entry.size_name, brands: [] }; }
            sizesMap[entry.size_id].brands.push({ brand_id: entry.brand_id, brand_name: entry.brand_name, bodies_count: entry.bodies_count });
        });
        setSubmitting(true);
        try {
            await printingAPI.update(editingId, {
                job_date: new Date(editForm.job_date).toISOString(),
                sheets_used: sheetsVal,
                sizes: Object.values(sizesMap),
                notes: editForm.notes || null,
            });
            toast.success('Job updated'); setEditDialogOpen(false); fetchData();
        } catch (err) { toast.error('Failed to update job'); }
        finally { setSubmitting(false); }
    };

    const handleDelete = async () => {
        if (!deleteTarget) return;
        try { await printingAPI.delete(deleteTarget); toast.success('Job deleted'); fetchData(); }
        catch (err) { toast.error('Failed to delete job'); }
        finally { setDeleteTarget(null); }
    };

    const clearFilters = () => { setSearchTerm(''); };

    const sheetsNum = parseInt(formData.sheets_used) || 0;
    const totalBodies = jobEntries.reduce((sum, e) => sum + e.bodies_count, 0);

    return (
        <div className="space-y-6 animate-fade-in" data-testid="printing-page">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <p className="text-muted-foreground">Manage printing and coating jobs linked to raw materials</p>
                <div className="flex gap-2">
                    <Button variant="outline" onClick={() => {
                        if (exportToExcel({ data: filteredJobs, columns: PRINTING_EXPORT_COLUMNS, fileName: 'Printing_Jobs', sheetName: 'Printing Jobs' })) toast.success('Exported to Excel');
                        else toast.error('No data to export');
                    }} className="font-bold uppercase tracking-wider rounded-sm" data-testid="export-jobs-btn">
                        <Download className="w-4 h-4 mr-2" /> Export
                    </Button>
                    <ImportExcelButton
                        columns={[
                            { header: 'Raw Material Sr No', key: 'raw_material_sr_no' },
                            { header: 'Size', key: 'size_name' },
                            { header: 'Brand', key: 'brand_name' },
                            { header: 'Bodies', key: 'bodies_count' },
                            { header: 'Sheets Used', key: 'sheets_used' },
                            { header: 'Job Date', key: 'job_date' },
                            { header: 'Notes', key: 'notes' },
                        ]}
                        templateName="Printing_Jobs"
                        onImport={async (rows, onProgress) => {
                            let success = 0, failed = 0;
                            for (const row of rows) {
                                try {
                                    if (!row.raw_material_sr_no || !row.size_name || !row.brand_name || !row.bodies_count || !row.sheets_used) { failed++; onProgress(success + failed); continue; }
                                    const material = availableMaterials.find(m => m.sr_no === String(row.raw_material_sr_no).trim());
                                    const brand = brands.find(b => b.name.toLowerCase() === String(row.brand_name).toLowerCase().trim());
                                    const size = sizes.find(s => s.name.toLowerCase() === String(row.size_name).toLowerCase().trim());
                                    if (!material || !brand || !size) { failed++; onProgress(success + failed); continue; }
                                    await printingAPI.create({
                                        raw_material_id: material.id,
                                        sheets_used: parseInt(row.sheets_used),
                                        sizes: [{ size_id: size.id, size_name: size.name, brands: [{ brand_id: brand.id, brand_name: brand.name, bodies_count: parseInt(row.bodies_count) }] }],
                                        job_date: parseImportDate(row.job_date) || new Date().toISOString(),
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
                    <Button onClick={() => { resetForm(); setDialogOpen(true); }} className="font-bold uppercase tracking-wider rounded-sm" data-testid="add-job-btn">
                        <Plus className="w-4 h-4 mr-2" /> New Job
                    </Button>
                </div>
            </div>

            {/* Create Job Dialog */}
            <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) resetForm(); }}>
                <DialogContent className="bg-card border-border rounded-sm max-w-xl max-h-[90vh] overflow-y-auto">
                    <DialogHeader><DialogTitle className="font-display text-xl font-bold tracking-tight uppercase">Create Printing Job</DialogTitle></DialogHeader>
                    <form onSubmit={handleSubmit} className="space-y-4 mt-4">
                        <div className="space-y-2">
                            <Label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Date *</Label>
                            <Input type="date" value={formData.job_date} onChange={(e) => setFormData({ ...formData, job_date: e.target.value })} className="bg-background border-input rounded-sm font-mono" data-testid="job-date" />
                        </div>
                        <div className="space-y-2">
                            <Label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Raw Material *</Label>
                            <Select value={formData.raw_material_id} onValueChange={handleMaterialChange}>
                                <SelectTrigger className="bg-background border-input rounded-sm" data-testid="raw-material-select"><SelectValue placeholder="Select raw material" /></SelectTrigger>
                                <SelectContent className="bg-card border-border rounded-sm">
                                    {availableMaterials.length === 0 ? <div className="p-2 text-sm text-muted-foreground">No available materials</div> : availableMaterials.map(m => <SelectItem key={m.id} value={m.id}>{m.display_name}</SelectItem>)}
                                </SelectContent>
                            </Select>
                        </div>
                        {selectedMaterial && (
                            <div className="p-3 bg-primary/10 rounded-sm border border-primary/20 grid grid-cols-3 gap-4 text-sm">
                                <div><p className="text-xs font-bold uppercase text-muted-foreground">Size</p><p className="font-mono font-bold">{selectedMaterial.size1} x {selectedMaterial.size2}</p></div>
                                <div><p className="text-xs font-bold uppercase text-muted-foreground">Gauge</p><p className="font-mono">{selectedMaterial.gauge}</p></div>
                                <div><p className="text-xs font-bold uppercase text-muted-foreground">Available Sheets</p><p className="font-mono font-bold text-primary">{formatNumber(selectedMaterial.sheets_available)}</p></div>
                            </div>
                        )}
                        {/* Sheets Used — job-level, common for all entries */}
                        <div className="space-y-2">
                            <Label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Sheets Used *</Label>
                            <Input type="number" min="1" value={formData.sheets_used} onChange={(e) => setFormData({ ...formData, sheets_used: e.target.value })} placeholder="Sheets used from raw material" className="bg-background border-input rounded-sm font-mono" data-testid="sheets-used" />
                            {selectedMaterial && sheetsNum > 0 && (
                                <p className={`text-xs font-mono ${sheetsNum > selectedMaterial.sheets_available ? 'text-destructive' : 'text-muted-foreground'}`}>
                                    {formatNumber(sheetsNum)} / {formatNumber(selectedMaterial.sheets_available)} available
                                </p>
                            )}
                        </div>
                        <div className="border-t border-border pt-4"><Label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Add Size, Brand & Bodies</Label></div>
                        <div className="grid grid-cols-4 gap-2">
                            <Select value={currentSizeId} onValueChange={setCurrentSizeId}>
                                <SelectTrigger className="bg-background border-input rounded-sm" data-testid="container-size"><SelectValue placeholder="Size" /></SelectTrigger>
                                <SelectContent className="bg-card border-border rounded-sm">{sizes.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
                            </Select>
                            <Select value={currentBrandId} onValueChange={setCurrentBrandId}>
                                <SelectTrigger className="bg-background border-input rounded-sm" data-testid="brand-select"><SelectValue placeholder="Brand" /></SelectTrigger>
                                <SelectContent className="bg-card border-border rounded-sm max-h-60">{brands.map(b => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}</SelectContent>
                            </Select>
                            <Input type="number" min="1" value={currentBodiesCount} onChange={(e) => setCurrentBodiesCount(e.target.value)} placeholder="Bodies" className="bg-background border-input rounded-sm font-mono" data-testid="bodies-count" />
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
                                            <Button type="button" variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground hover:text-destructive" onClick={() => handleRemoveEntry(idx)}><Trash2 className="w-3 h-3" /></Button>
                                        </div>
                                    ))}
                                </div>
                                {sheetsNum > 0 && (
                                    <div className="flex justify-between text-sm p-2 bg-primary/10 rounded-sm border border-primary/20">
                                        <span className="font-bold uppercase tracking-wider">Total Printing (Bodies x Sheets)</span>
                                        <span className="font-mono font-bold text-primary">{formatNumber(totalBodies * sheetsNum)}</span>
                                    </div>
                                )}
                            </div>
                        )}
                        <div className="space-y-2">
                            <Label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Notes</Label>
                            <Textarea value={formData.notes} onChange={(e) => setFormData({ ...formData, notes: e.target.value })} placeholder="Optional notes..." className="bg-background border-input rounded-sm" data-testid="job-notes" />
                        </div>
                        <Button type="submit" className="w-full font-bold uppercase tracking-wider rounded-sm" disabled={submitting || jobEntries.length === 0 || !formData.raw_material_id || !sheetsNum} data-testid="submit-job">
                            {submitting ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Creating...</> : 'Create Job'}
                        </Button>
                    </form>
                </DialogContent>
            </Dialog>

            {/* Edit Job Dialog */}
            <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
                <DialogContent className="bg-card border-border rounded-sm max-w-xl max-h-[90vh] overflow-y-auto">
                    <DialogHeader><DialogTitle className="font-display text-xl font-bold tracking-tight uppercase">Edit Printing Job</DialogTitle></DialogHeader>
                    <form onSubmit={handleEditSubmit} className="space-y-4 mt-4">
                        <div className="space-y-2">
                            <Label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Date *</Label>
                            <Input type="date" value={editForm.job_date} onChange={(e) => setEditForm({ ...editForm, job_date: e.target.value })} className="bg-background border-input rounded-sm font-mono" />
                        </div>
                        {editMaterialInfo && (
                            <div className="p-3 bg-secondary/50 rounded-sm border border-border grid grid-cols-2 gap-4 text-sm">
                                <div><p className="text-xs font-bold uppercase text-muted-foreground">Raw Material</p><p className="font-mono font-bold">{editMaterialInfo.sr_no}</p></div>
                                <div><p className="text-xs font-bold uppercase text-muted-foreground">Size</p><p className="font-mono">{editMaterialInfo.size}</p></div>
                            </div>
                        )}
                        <div className="space-y-2">
                            <Label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Sheets Used *</Label>
                            <Input type="number" min="1" value={editForm.sheets_used} onChange={(e) => setEditForm({ ...editForm, sheets_used: e.target.value })} placeholder="Sheets used from raw material" className="bg-background border-input rounded-sm font-mono" />
                        </div>
                        <div className="border-t border-border pt-4"><Label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Size, Brand & Bodies</Label></div>
                        <div className="grid grid-cols-4 gap-2">
                            <Select value={editSizeId} onValueChange={setEditSizeId}>
                                <SelectTrigger className="bg-background border-input rounded-sm"><SelectValue placeholder="Size" /></SelectTrigger>
                                <SelectContent className="bg-card border-border rounded-sm">{sizes.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
                            </Select>
                            <Select value={editBrandId} onValueChange={setEditBrandId}>
                                <SelectTrigger className="bg-background border-input rounded-sm"><SelectValue placeholder="Brand" /></SelectTrigger>
                                <SelectContent className="bg-card border-border rounded-sm max-h-60">{brands.map(b => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}</SelectContent>
                            </Select>
                            <Input type="number" min="1" value={editBodiesCount} onChange={(e) => setEditBodiesCount(e.target.value)} placeholder="Bodies" className="bg-background border-input rounded-sm font-mono" />
                            <Button type="button" onClick={handleEditAddEntry} className="rounded-sm"><Plus className="w-4 h-4" /></Button>
                        </div>
                        {editEntries.length > 0 && (
                            <div className="space-y-2">
                                <Label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Entries ({editEntries.length})</Label>
                                <div className="space-y-1 max-h-40 overflow-y-auto">
                                    {editEntries.map((entry, idx) => (
                                        <div key={idx} className="flex items-center justify-between p-2 bg-secondary/50 rounded-sm">
                                            <div className="flex items-center gap-2">
                                                <Badge variant="outline">{entry.size_name}</Badge>
                                                <span className="text-sm">{entry.brand_name}</span>
                                                <Badge variant="secondary" className="font-mono">{formatNumber(entry.bodies_count)} bodies</Badge>
                                            </div>
                                            <Button type="button" variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground hover:text-destructive" onClick={() => setEditEntries(editEntries.filter((_, i) => i !== idx))}><Trash2 className="w-3 h-3" /></Button>
                                        </div>
                                    ))}
                                </div>
                                {parseInt(editForm.sheets_used) > 0 && (
                                    <div className="flex justify-between text-sm p-2 bg-primary/10 rounded-sm border border-primary/20">
                                        <span className="font-bold uppercase tracking-wider">Total Printing (Bodies x Sheets)</span>
                                        <span className="font-mono font-bold text-primary">{formatNumber(editEntries.reduce((sum, e) => sum + e.bodies_count, 0) * parseInt(editForm.sheets_used))}</span>
                                    </div>
                                )}
                            </div>
                        )}
                        <div className="space-y-2">
                            <Label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Notes</Label>
                            <Textarea value={editForm.notes} onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })} placeholder="Optional notes..." className="bg-background border-input rounded-sm" />
                        </div>
                        <Button type="submit" className="w-full font-bold uppercase tracking-wider rounded-sm" disabled={submitting || editEntries.length === 0 || !parseInt(editForm.sheets_used)}>
                            {submitting ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Saving...</> : 'Update Job'}
                        </Button>
                    </form>
                </DialogContent>
            </Dialog>

            <ConfirmDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)} title="Delete Printing Job?" description="This will permanently remove this printing job." onConfirm={handleDelete} />

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Card className="industrial-card"><CardContent className="p-4"><div className="flex items-center gap-3"><div className="p-2 bg-primary/10 rounded-sm border border-primary/20"><Printer className="w-5 h-5 text-primary" /></div><div><p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Total Jobs</p><p className="font-display text-2xl font-bold">{jobs.length}</p></div></div></CardContent></Card>
                <Card className="industrial-card"><CardContent className="p-4"><div className="flex items-center gap-3"><div className="p-2 bg-success/10 rounded-sm border border-success/20"><Layers className="w-5 h-5 text-success" /></div><div><p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Total Bodies</p><p className="font-display text-2xl font-bold">{formatNumber(jobs.reduce((sum, j) => sum + j.total_bodies, 0))}</p></div></div></CardContent></Card>
            </div>

            <Card className="industrial-card">
                <CardHeader><CardTitle className="font-display text-xl font-bold tracking-tight uppercase">Printing Jobs</CardTitle></CardHeader>
                <TableSearch
                    searchValue={searchTerm}
                    onSearchChange={setSearchTerm}
                    searchPlaceholder="Search by job #, raw material..."
                    filters={[]}
                    onClear={clearFilters}
                    resultCount={filteredJobs.length}
                    totalCount={flattenedRows.length}
                />
                <CardContent className="p-0">
                    {loading ? (
                        <div className="flex items-center justify-center h-48"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
                    ) : filteredJobs.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-48 text-muted-foreground"><AlertCircle className="w-8 h-8 mb-2" /><p>{jobs.length === 0 ? 'No printing jobs found' : 'No matching jobs'}</p></div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="data-table" data-testid="jobs-table">
                                <thead><tr><th>#</th><th>Date</th><th>Job #</th><th>Raw Material</th><th>Material Size</th><th>Sheets</th><th>Size</th><th>Brand</th><th>Bodies</th><th>Total Printing</th><th>By</th><th></th></tr></thead>
                                <tbody>
                                    {paginatedJobs.map((row, idx) => (
                                        <tr key={row._rowKey} data-testid={`job-row-${row._rowKey}`}>
                                            <td className="text-muted-foreground">{startIndex + idx + 1}</td>
                                            <td>{formatDate(row.job_date)}</td>
                                            <td className="font-medium">{row.job_number}</td>
                                            <td>{row.raw_material_sr_no}</td>
                                            <td>{row.raw_material_size}</td>
                                            <td className="font-mono">{formatNumber(row.sheets_from_material)}</td>
                                            <td><Badge variant="outline">{row.size_name}</Badge></td>
                                            <td>{row.brand_name}</td>
                                            <td className="font-mono">{formatNumber(row.bodies_count)}</td>
                                            <td className="font-mono text-primary font-bold">{formatNumber(row.total_printing)}</td>
                                            <td className="text-muted-foreground">{row.created_by}</td>
                                            <td>
                                                <div className="flex gap-1">
                                                    <Button variant="ghost" size="icon" onClick={() => openEdit(row)} className="text-muted-foreground hover:text-primary"><Pencil className="w-4 h-4" /></Button>
                                                    <Button variant="ghost" size="icon" onClick={() => setDeleteTarget(row.id)} className="text-muted-foreground hover:text-destructive" data-testid={`delete-job-${row.id}`}><Trash2 className="w-4 h-4" /></Button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                    <TablePagination currentPage={currentPage} totalPages={totalPages} pageSize={pageSize} totalItems={filteredJobs.length} startIndex={startIndex} onPageChange={setCurrentPage} onPageSizeChange={setPageSize} pageSizeOptions={PAGE_SIZE_OPTIONS} />
                </CardContent>
            </Card>
        </div>
    );
};

export default Printing;
