import React, { useState, useEffect, useMemo } from 'react';
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '../components/ui/form';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Badge } from '../components/ui/badge';
import { Textarea } from '../components/ui/textarea';
import ConfirmDialog from '../components/ConfirmDialog';
import TableSearch from '../components/TableSearch';
import TablePagination from '../components/TablePagination';
import SortableHeader from '../components/SortableHeader';
import { useTableFilter } from '../hooks/useTableFilter';
import { usePagination } from '../hooks/usePagination';
import { useTableSort } from '../hooks/useTableSort';
import { printingAPI, brandsAPI, sizesAPI, purchaseAPI } from '../lib/api';
import { formatDate, formatNumber, parseImportDate } from '../lib/utils';
import { Plus, Trash2, Pencil, Printer, Loader2, AlertCircle, Layers, Download } from 'lucide-react';
import { toast } from 'sonner';
import { exportToExcel } from '../lib/exportToExcel';
import ImportExcelButton from '../components/ImportExcelButton';
import { getErrorMessage } from '../lib/errors';
import { printingJobSchema, printingJobEditSchema, printingEntryInputSchema } from '../lib/schemas';

const LABEL_CLASS = 'text-xs font-bold uppercase tracking-widest text-muted-foreground';

const today = () => new Date().toISOString().split('T')[0];
const emptyJob = () => ({ raw_material_id: '', notes: '', job_date: today(), sheets_used: '', entries: [] });
const emptyEntryInput = { size_id: '', brand_id: '', bodies_count: '' };

/** Collapse the flat entry list into the per-size shape the API expects. */
const groupEntriesBySize = (entries) => {
    const sizesMap = {};
    entries.forEach(entry => {
        if (!sizesMap[entry.size_id]) {
            sizesMap[entry.size_id] = { size_id: entry.size_id, size_name: entry.size_name, brands: [] };
        }
        sizesMap[entry.size_id].brands.push({ brand_id: entry.brand_id, brand_name: entry.brand_name, bodies_count: entry.bodies_count });
    });
    return Object.values(sizesMap);
};

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
    const [deleteTarget, setDeleteTarget] = useState(null);

    // Create form
    const createForm = useForm({
        resolver: zodResolver(printingJobSchema),
        defaultValues: emptyJob(),
    });
    const { fields: jobEntries, append: appendEntry, remove: removeEntry } = useFieldArray({ control: createForm.control, name: 'entries' });
    const [watchedMaterialId, watchedSheets] = createForm.watch(['raw_material_id', 'sheets_used']);
    const selectedMaterial = useMemo(
        () => availableMaterials.find(m => m.id === watchedMaterialId) || null,
        [availableMaterials, watchedMaterialId]
    );

    // Staging row for the create dialog: its own form instance so size/brand/
    // bodies validate on "Add" without gating the job. It cannot be a nested
    // <form> element, so the Add button submits it programmatically.
    const entryForm = useForm({
        resolver: zodResolver(printingEntryInputSchema),
        defaultValues: { ...emptyEntryInput },
    });

    // Edit form (the raw material of an existing job cannot be changed)
    const [editingId, setEditingId] = useState(null);
    const [editMaterialInfo, setEditMaterialInfo] = useState(null);
    const editForm = useForm({
        resolver: zodResolver(printingJobEditSchema),
        defaultValues: { notes: '', job_date: today(), sheets_used: '', entries: [] },
    });
    const { fields: editEntries, append: appendEditEntry, remove: removeEditEntry } = useFieldArray({ control: editForm.control, name: 'entries' });
    const watchedEditSheets = editForm.watch('sheets_used');
    const editEntryForm = useForm({
        resolver: zodResolver(printingEntryInputSchema),
        defaultValues: { ...emptyEntryInput },
    });

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
                        updated_by: job.updated_by,
                        notes: job.notes,
                    });
                }
            }
        }
        return rows;
    }, [jobs]);

    const filteredJobs = useTableFilter({
        data: flattenedRows, searchTerm, searchFields: ['job_number', 'raw_material_sr_no', 'size_name', 'brand_name', 'created_by'], filters
    });

    const { sortedData, sortKey, sortDir, requestSort } = useTableSort({
        data: filteredJobs, defaultSortKey: 'job_date', defaultSortDir: 'desc'
    });

    const { paginatedData: paginatedJobs, currentPage, totalPages, pageSize, setCurrentPage, setPageSize, startIndex, PAGE_SIZE_OPTIONS } = usePagination({ data: sortedData });

    useEffect(() => { fetchData(); }, []);

    const fetchData = async () => {
        try {
            setLoading(true);
            const [jobsRes, brandsRes, sizesRes, materialsRes] = await Promise.all([
                printingAPI.getAll(), brandsAPI.getAll(), sizesAPI.getAll(), purchaseAPI.getAvailable()
            ]);
            setJobs(jobsRes.data); setBrands(brandsRes.data); setSizes(sizesRes.data); setAvailableMaterials(materialsRes.data);
        } catch (err) { toast.error(getErrorMessage(err, 'Failed to load data')); }
        finally { setLoading(false); }
    };

    const resetForm = () => {
        createForm.reset(emptyJob());
        entryForm.reset({ ...emptyEntryInput });
    };

    const handleAddEntry = entryForm.handleSubmit((values) => {
        const size = sizes.find(s => s.id === values.size_id);
        const brand = brands.find(b => b.id === values.brand_id);
        if (!size || !brand) return;
        appendEntry({ size_id: size.id, size_name: size.name, brand_id: brand.id, brand_name: brand.name, bodies_count: values.bodies_count });
        entryForm.reset({ ...emptyEntryInput });
    });

    const handleRemoveEntry = (index) => { removeEntry(index); };

    const onSubmit = async (values) => {
        // Not expressible in the schema: the ceiling comes from the selected
        // raw material, which lives in fetched state rather than form values.
        if (selectedMaterial && values.sheets_used > selectedMaterial.sheets_available) {
            const message = `Sheets used (${values.sheets_used}) exceeds available (${selectedMaterial.sheets_available})`;
            createForm.setError('sheets_used', { type: 'manual', message });
            toast.error(message);
            return;
        }
        try {
            await printingAPI.create({
                raw_material_id: values.raw_material_id,
                sheets_used: values.sheets_used,
                sizes: groupEntriesBySize(values.entries), notes: values.notes || null,
                job_date: new Date(values.job_date).toISOString(),
            });
            toast.success('Printing job created'); setDialogOpen(false); resetForm(); fetchData();
        } catch (err) { toast.error(getErrorMessage(err, 'Failed to create job')); }
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
        setEditMaterialInfo({ sr_no: job.raw_material_sr_no, size: job.raw_material_size, sheets: job.sheets_from_material });
        editForm.reset({
            job_date: job.job_date ? job.job_date.split('T')[0] : today(),
            notes: job.notes || '',
            sheets_used: String(job.sheets_from_material || ''),
            entries,
        });
        editEntryForm.reset({ ...emptyEntryInput });
        setEditDialogOpen(true);
    };

    const handleEditAddEntry = editEntryForm.handleSubmit((values) => {
        const size = sizes.find(s => s.id === values.size_id);
        const brand = brands.find(b => b.id === values.brand_id);
        if (!size || !brand) return;
        appendEditEntry({ size_id: size.id, size_name: size.name, brand_id: brand.id, brand_name: brand.name, bodies_count: values.bodies_count });
        editEntryForm.reset({ ...emptyEntryInput });
    });

    const onEditSubmit = async (values) => {
        try {
            await printingAPI.update(editingId, {
                job_date: new Date(values.job_date).toISOString(),
                sheets_used: values.sheets_used,
                sizes: groupEntriesBySize(values.entries),
                notes: values.notes || null,
            });
            toast.success('Job updated'); setEditDialogOpen(false); fetchData();
        } catch (err) { toast.error(getErrorMessage(err, 'Failed to update job')); }
    };

    const handleDelete = async () => {
        if (!deleteTarget) return;
        try { await printingAPI.delete(deleteTarget); toast.success('Job deleted'); fetchData(); }
        catch (err) { toast.error(getErrorMessage(err, 'Failed to delete job')); }
        finally { setDeleteTarget(null); }
    };

    const clearFilters = () => { setSearchTerm(''); };

    const sheetsNum = parseInt(watchedSheets) || 0;
    const totalBodies = jobEntries.reduce((sum, e) => sum + e.bodies_count, 0);
    const editSheetsNum = parseInt(watchedEditSheets) || 0;

    return (
        <div className="space-y-6 animate-fade-in" data-testid="printing-page">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <p className="text-muted-foreground">Manage printing and coating jobs linked to raw materials</p>
                <div className="flex gap-2">
                    <Button variant="outline" onClick={async () => {
                        if (await exportToExcel({ data: filteredJobs, columns: PRINTING_EXPORT_COLUMNS, fileName: 'Printing_Jobs', sheetName: 'Printing Jobs' })) toast.success('Exported to Excel');
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
                    <Form {...createForm}>
                        <form onSubmit={createForm.handleSubmit(onSubmit)} className="space-y-4 mt-4" noValidate>
                            <FormField
                                control={createForm.control}
                                name="job_date"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel className={LABEL_CLASS}>Date *</FormLabel>
                                        <FormControl>
                                            <Input {...field} type="date" className="bg-background border-input rounded-sm font-mono" data-testid="job-date" />
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                            <FormField
                                control={createForm.control}
                                name="raw_material_id"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel className={LABEL_CLASS}>Raw Material *</FormLabel>
                                        <Select value={field.value} onValueChange={field.onChange}>
                                            <FormControl>
                                                <SelectTrigger className="bg-background border-input rounded-sm" data-testid="raw-material-select"><SelectValue placeholder="Select raw material" /></SelectTrigger>
                                            </FormControl>
                                            <SelectContent className="bg-card border-border rounded-sm">
                                                {availableMaterials.length === 0 ? <div className="p-2 text-sm text-muted-foreground">No available materials</div> : availableMaterials.map(m => <SelectItem key={m.id} value={m.id}>{m.display_name}</SelectItem>)}
                                            </SelectContent>
                                        </Select>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                            {selectedMaterial && (
                                <div className="p-3 bg-primary/10 rounded-sm border border-primary/20 grid grid-cols-3 gap-4 text-sm">
                                    <div><p className="text-xs font-bold uppercase text-muted-foreground">Size</p><p className="font-mono font-bold">{selectedMaterial.size1} x {selectedMaterial.size2}</p></div>
                                    <div><p className="text-xs font-bold uppercase text-muted-foreground">Gauge</p><p className="font-mono">{selectedMaterial.gauge}</p></div>
                                    <div><p className="text-xs font-bold uppercase text-muted-foreground">Available Sheets</p><p className="font-mono font-bold text-primary">{formatNumber(selectedMaterial.sheets_available)}</p></div>
                                </div>
                            )}
                            {/* Sheets Used — job-level, common for all entries */}
                            <FormField
                                control={createForm.control}
                                name="sheets_used"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel className={LABEL_CLASS}>Sheets Used *</FormLabel>
                                        <FormControl>
                                            <Input {...field} type="number" min="1" placeholder="Sheets used from raw material" className="bg-background border-input rounded-sm font-mono" data-testid="sheets-used" />
                                        </FormControl>
                                        {selectedMaterial && sheetsNum > 0 && (
                                            <p className={`text-xs font-mono ${sheetsNum > selectedMaterial.sheets_available ? 'text-destructive' : 'text-muted-foreground'}`}>
                                                {formatNumber(sheetsNum)} / {formatNumber(selectedMaterial.sheets_available)} available
                                            </p>
                                        )}
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                            <div className="border-t border-border pt-4"><Label className={LABEL_CLASS}>Add Size, Brand &amp; Bodies</Label></div>
                            {/* The staging row validates on its own form instance; it needs
                                its own provider so FormMessage can find those errors. */}
                            <Form {...entryForm}>
                                <div className="grid grid-cols-4 gap-2">
                                    <FormField
                                        control={entryForm.control}
                                        name="size_id"
                                        render={({ field }) => (
                                            <FormItem>
                                                <Select value={field.value} onValueChange={field.onChange}>
                                                    <FormControl>
                                                        <SelectTrigger className="bg-background border-input rounded-sm" data-testid="container-size"><SelectValue placeholder="Size" /></SelectTrigger>
                                                    </FormControl>
                                                    <SelectContent className="bg-card border-border rounded-sm">{sizes.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
                                                </Select>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />
                                    <FormField
                                        control={entryForm.control}
                                        name="brand_id"
                                        render={({ field }) => (
                                            <FormItem>
                                                <Select value={field.value} onValueChange={field.onChange}>
                                                    <FormControl>
                                                        <SelectTrigger className="bg-background border-input rounded-sm" data-testid="brand-select"><SelectValue placeholder="Brand" /></SelectTrigger>
                                                    </FormControl>
                                                    <SelectContent className="bg-card border-border rounded-sm max-h-60">{brands.map(b => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}</SelectContent>
                                                </Select>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />
                                    <FormField
                                        control={entryForm.control}
                                        name="bodies_count"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormControl>
                                                    <Input {...field} type="number" min="1" placeholder="Bodies" className="bg-background border-input rounded-sm font-mono" data-testid="bodies-count" />
                                                </FormControl>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />
                                    <Button type="button" onClick={handleAddEntry} className="rounded-sm" data-testid="add-entry-btn"><Plus className="w-4 h-4" /></Button>
                                </div>
                            </Form>
                            {jobEntries.length > 0 && (
                                <div className="space-y-2">
                                    <Label className={LABEL_CLASS}>Added Entries ({jobEntries.length})</Label>
                                    <div className="space-y-1 max-h-40 overflow-y-auto">
                                        {jobEntries.map((entry, idx) => (
                                            <div key={entry.id} className="flex items-center justify-between p-2 bg-secondary/50 rounded-sm">
                                                <div className="flex items-center gap-2">
                                                    <Badge variant="outline">{entry.size_name}</Badge>
                                                    <span className="text-sm">{entry.brand_name}</span>
                                                    <Badge variant="secondary" className="font-mono">{formatNumber(entry.bodies_count)} bodies</Badge>
                                                </div>
                                                <Button aria-label="Remove this brand entry from the job" type="button" variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground hover:text-destructive" onClick={() => handleRemoveEntry(idx)} data-testid={'remove-entry-' + idx}><Trash2 className="w-3 h-3" /></Button>
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
                            {createForm.formState.errors.entries?.message && (
                                <p className="text-[0.8rem] font-medium text-destructive">{createForm.formState.errors.entries.message}</p>
                            )}
                            <FormField
                                control={createForm.control}
                                name="notes"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel className={LABEL_CLASS}>Notes</FormLabel>
                                        <FormControl>
                                            <Textarea {...field} placeholder="Optional notes..." className="bg-background border-input rounded-sm" data-testid="job-notes" />
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                            <Button type="submit" className="w-full font-bold uppercase tracking-wider rounded-sm" disabled={createForm.formState.isSubmitting || jobEntries.length === 0 || !watchedMaterialId || !sheetsNum} data-testid="submit-job">
                                {createForm.formState.isSubmitting ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Creating...</> : 'Create Job'}
                            </Button>
                        </form>
                    </Form>
                </DialogContent>
            </Dialog>

            {/* Edit Job Dialog */}
            <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
                <DialogContent className="bg-card border-border rounded-sm max-w-xl max-h-[90vh] overflow-y-auto">
                    <DialogHeader><DialogTitle className="font-display text-xl font-bold tracking-tight uppercase">Edit Printing Job</DialogTitle></DialogHeader>
                    <Form {...editForm}>
                        <form onSubmit={editForm.handleSubmit(onEditSubmit)} className="space-y-4 mt-4" noValidate>
                            <FormField
                                control={editForm.control}
                                name="job_date"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel className={LABEL_CLASS}>Date *</FormLabel>
                                        <FormControl>
                                            <Input {...field} type="date" className="bg-background border-input rounded-sm font-mono" data-testid="edit-job-date" />
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                            {editMaterialInfo && (
                                <div className="p-3 bg-secondary/50 rounded-sm border border-border grid grid-cols-2 gap-4 text-sm">
                                    <div><p className="text-xs font-bold uppercase text-muted-foreground">Raw Material</p><p className="font-mono font-bold">{editMaterialInfo.sr_no}</p></div>
                                    <div><p className="text-xs font-bold uppercase text-muted-foreground">Size</p><p className="font-mono">{editMaterialInfo.size}</p></div>
                                </div>
                            )}
                            <FormField
                                control={editForm.control}
                                name="sheets_used"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel className={LABEL_CLASS}>Sheets Used *</FormLabel>
                                        <FormControl>
                                            <Input {...field} type="number" min="1" placeholder="Sheets used from raw material" className="bg-background border-input rounded-sm font-mono" data-testid="edit-sheets-used" />
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                            <div className="border-t border-border pt-4"><Label className={LABEL_CLASS}>Size, Brand &amp; Bodies</Label></div>
                            {/* The staging row validates on its own form instance; it needs
                                its own provider so FormMessage can find those errors. */}
                            <Form {...editEntryForm}>
                                <div className="grid grid-cols-4 gap-2">
                                    <FormField
                                        control={editEntryForm.control}
                                        name="size_id"
                                        render={({ field }) => (
                                            <FormItem>
                                                <Select value={field.value} onValueChange={field.onChange}>
                                                    <FormControl>
                                                        <SelectTrigger className="bg-background border-input rounded-sm" data-testid="edit-container-size"><SelectValue placeholder="Size" /></SelectTrigger>
                                                    </FormControl>
                                                    <SelectContent className="bg-card border-border rounded-sm">{sizes.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
                                                </Select>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />
                                    <FormField
                                        control={editEntryForm.control}
                                        name="brand_id"
                                        render={({ field }) => (
                                            <FormItem>
                                                <Select value={field.value} onValueChange={field.onChange}>
                                                    <FormControl>
                                                        <SelectTrigger className="bg-background border-input rounded-sm" data-testid="edit-brand-select"><SelectValue placeholder="Brand" /></SelectTrigger>
                                                    </FormControl>
                                                    <SelectContent className="bg-card border-border rounded-sm max-h-60">{brands.map(b => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}</SelectContent>
                                                </Select>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />
                                    <FormField
                                        control={editEntryForm.control}
                                        name="bodies_count"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormControl>
                                                    <Input {...field} type="number" min="1" placeholder="Bodies" className="bg-background border-input rounded-sm font-mono" data-testid="edit-bodies-count" />
                                                </FormControl>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />
                                    <Button type="button" onClick={handleEditAddEntry} className="rounded-sm" data-testid="edit-add-entry-btn"><Plus className="w-4 h-4" /></Button>
                                </div>
                            </Form>
                            {editEntries.length > 0 && (
                                <div className="space-y-2">
                                    <Label className={LABEL_CLASS}>Entries ({editEntries.length})</Label>
                                    <div className="space-y-1 max-h-40 overflow-y-auto">
                                        {editEntries.map((entry, idx) => (
                                            <div key={entry.id} className="flex items-center justify-between p-2 bg-secondary/50 rounded-sm">
                                                <div className="flex items-center gap-2">
                                                    <Badge variant="outline">{entry.size_name}</Badge>
                                                    <span className="text-sm">{entry.brand_name}</span>
                                                    <Badge variant="secondary" className="font-mono">{formatNumber(entry.bodies_count)} bodies</Badge>
                                                </div>
                                                <Button aria-label="Remove this brand entry from the job" type="button" variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground hover:text-destructive" onClick={() => removeEditEntry(idx)} data-testid={'remove-edit-entry-' + idx}><Trash2 className="w-3 h-3" /></Button>
                                            </div>
                                        ))}
                                    </div>
                                    {editSheetsNum > 0 && (
                                        <div className="flex justify-between text-sm p-2 bg-primary/10 rounded-sm border border-primary/20">
                                            <span className="font-bold uppercase tracking-wider">Total Printing (Bodies x Sheets)</span>
                                            <span className="font-mono font-bold text-primary">{formatNumber(editEntries.reduce((sum, e) => sum + e.bodies_count, 0) * editSheetsNum)}</span>
                                        </div>
                                    )}
                                </div>
                            )}
                            {editForm.formState.errors.entries?.message && (
                                <p className="text-[0.8rem] font-medium text-destructive">{editForm.formState.errors.entries.message}</p>
                            )}
                            <FormField
                                control={editForm.control}
                                name="notes"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel className={LABEL_CLASS}>Notes</FormLabel>
                                        <FormControl>
                                            <Textarea {...field} placeholder="Optional notes..." className="bg-background border-input rounded-sm" data-testid="edit-job-notes" />
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                            <Button type="submit" className="w-full font-bold uppercase tracking-wider rounded-sm" disabled={editForm.formState.isSubmitting || editEntries.length === 0 || !editSheetsNum} data-testid="submit-edit-job">
                                {editForm.formState.isSubmitting ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Saving...</> : 'Update Job'}
                            </Button>
                        </form>
                    </Form>
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
                                <thead><tr><th>#</th>
                                    <SortableHeader label="Date" sortKey="job_date" currentSortKey={sortKey} currentSortDir={sortDir} onSort={requestSort} />
                                    <SortableHeader label="Job #" sortKey="job_number" currentSortKey={sortKey} currentSortDir={sortDir} onSort={requestSort} />
                                    <th>Raw Material</th><th>Material Size</th>
                                    <SortableHeader label="Sheets" sortKey="sheets_from_material" currentSortKey={sortKey} currentSortDir={sortDir} onSort={requestSort} />
                                    <th>Size</th>
                                    <SortableHeader label="Brand" sortKey="brand_name" currentSortKey={sortKey} currentSortDir={sortDir} onSort={requestSort} />
                                    <SortableHeader label="Bodies" sortKey="bodies_count" currentSortKey={sortKey} currentSortDir={sortDir} onSort={requestSort} />
                                    <SortableHeader label="Total Printing" sortKey="total_printing" currentSortKey={sortKey} currentSortDir={sortDir} onSort={requestSort} />
                                    <th>By</th><th>Updated By</th><th></th></tr></thead>
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
                                            <td className="text-muted-foreground">{row.updated_by || '-'}</td>
                                            <td>
                                                <div className="flex gap-1">
                                                    <Button aria-label="Edit printing job" variant="ghost" size="icon" onClick={() => openEdit(row)} className="text-muted-foreground hover:text-primary" data-testid={'edit-job-' + row.id}><Pencil className="w-4 h-4" /></Button>
                                                    <Button aria-label="Delete printing job" variant="ghost" size="icon" onClick={() => setDeleteTarget(row.id)} className="text-muted-foreground hover:text-destructive" data-testid={`delete-job-${row.id}`}><Trash2 className="w-4 h-4" /></Button>
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
