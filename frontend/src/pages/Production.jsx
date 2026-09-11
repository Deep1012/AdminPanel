import React, { useState, useEffect, useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '../components/ui/form';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Textarea } from '../components/ui/textarea';
import ConfirmDialog from '../components/ConfirmDialog';
import TableSearch from '../components/TableSearch';
import TablePagination from '../components/TablePagination';
import SortableHeader from '../components/SortableHeader';
import { useDebounce } from '../hooks/useDebounce';
import { productionAPI, brandsAPI, sizesAPI, dashboardAPI } from '../lib/api';

/**
 * Cascade target brands.
 *
 * Still needed for the BRAND PICKER - those rows are written by the backend
 * cascade, so offering them for manual entry would create duplicates. It is no
 * longer used to filter the TABLE: the server does that now (see below).
 */
const EXCLUDED_BRAND_NAMES = ['BOTTOM', 'TOP', 'LID', 'BOTTOM LWBF', 'LID LWBF'];

/**
 * Production is read through GET /api/production's paginated mode.
 *
 * WHY THIS PAGE AND NO OTHER: the cascade writes 4-6 rows per entry, so
 * Production outgrows every other collection (1,420 rows against 147
 * dispatches). Every other page stays client-paginated deliberately - at ~2,000
 * documents total there is nothing to win there.
 *
 * CASCADE ROWS: sending `page`/`limit` switches the route into paginated mode,
 * where `exclude_cascade` DEFAULTS TO TRUE and filters by the same brand-name
 * list as EXCLUDED_BRAND_NAMES above. So the parameter is deliberately NOT
 * sent, and the rows are deliberately NOT filtered again on the client - a
 * second client-side pass would drop rows that `total` still counts, and the
 * page numbers would stop agreeing with the table.
 *
 * `limit` is capped at 200 server-side, which is why the export pages through
 * in 200-row batches rather than asking for everything at once.
 */
const EXPORT_BATCH_LIMIT = 200;
const DEFAULT_PAGE_SIZE = 25;
const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];
import { formatDate, formatNumber, parseImportDate } from '../lib/utils';
import { Plus, Trash2, Pencil, Factory, Loader2, AlertCircle, Download } from 'lucide-react';
import { toast } from 'sonner';
import { exportToExcel } from '../lib/exportToExcel';
import ImportExcelButton from '../components/ImportExcelButton';
import { getErrorMessage } from '../lib/errors';
import { productionSchema } from '../lib/schemas';

const LABEL_CLASS = 'text-xs font-bold uppercase tracking-widest text-muted-foreground';

const PRODUCTION_EXPORT_COLUMNS = [
    { header: 'Date', key: 'production_date', transform: (v) => formatDate(v) },
    { header: 'Size', key: 'size_name' },
    { header: 'Brand', key: 'brand_name' },
    { header: 'Printing Stock Used', key: 'printing_stock_used', transform: (v) => v || 0 },
    { header: 'Qty Produced', key: 'quantity_produced' },
    { header: 'Notes', key: 'notes', transform: (v) => v || '-' },
    { header: 'Created By', key: 'created_by' },
    { header: 'Updated By', key: 'updated_by', transform: (v) => v || '-' },
];

const emptyForm = {
    brand_id: '', size_id: '', quantity_produced: '', notes: '',
    production_date: new Date().toISOString().split('T')[0]
};

const Production = () => {
    const [production, setProduction] = useState([]);
    const [brands, setBrands] = useState([]);
    const [sizes, setSizes] = useState([]);
    const [printingStock, setPrintingStock] = useState([]);
    const [loading, setLoading] = useState(true);
    const [exporting, setExporting] = useState(false);
    const [dialogOpen, setDialogOpen] = useState(false);
    const [editingId, setEditingId] = useState(null);
    const [deleteTarget, setDeleteTarget] = useState(null);

    const form = useForm({
        resolver: zodResolver(productionSchema),
        defaultValues: { ...emptyForm },
    });
    const { isSubmitting } = form.formState;
    // The available-stock panel and the printing-stock hint both mirror the
    // in-progress selection, so they read the live (raw) field values.
    const [watchSizeId, watchBrandId, watchQuantity] = form.watch(['size_id', 'brand_id', 'quantity_produced']);

    // Server-driven list controls. Each of these is a query parameter, not a
    // client-side transform.
    const [searchTerm, setSearchTerm] = useState('');
    // Typing is the only high-frequency control here; without the debounce the
    // page fires one request per keystroke.
    const debouncedSearch = useDebounce(searchTerm, 300);
    const [dateFrom, setDateFrom] = useState('');
    const [dateTo, setDateTo] = useState('');
    const [currentPage, setCurrentPage] = useState(1);
    const [pageSize, setPageSizeState] = useState(DEFAULT_PAGE_SIZE);
    const [sortKey, setSortKey] = useState('production_date');
    const [sortDir, setSortDir] = useState('desc');

    const [total, setTotal] = useState(0);
    const [totalPages, setTotalPages] = useState(1);
    // The unfiltered count, so "showing X of Y" can still say what Y is. It is
    // captured from whichever response had no filters applied - the first load
    // always qualifies - rather than costing an extra request.
    const [baseTotal, setBaseTotal] = useState(0);
    // Bumped after a create/update/delete/import to re-run the list effect
    // without duplicating the fetch logic.
    const [reloadToken, setReloadToken] = useState(0);

    const hasFilters = Boolean(debouncedSearch.trim() || dateFrom || dateTo);
    const startIndex = (currentPage - 1) * pageSize;

    const listParams = useMemo(() => {
        const params = {
            page: currentPage,
            limit: pageSize,
            sort: sortKey,
            order: sortDir,
        };
        if (debouncedSearch.trim()) params.search = debouncedSearch.trim();
        if (dateFrom) params.date_from = dateFrom;
        if (dateTo) params.date_to = dateTo;
        // `exclude_cascade` is omitted on purpose - see the note at the top.
        return params;
    }, [currentPage, pageSize, sortKey, sortDir, debouncedSearch, dateFrom, dateTo]);

    // Reference data: fetched once, and read through the api.js TTL cache so a
    // navigation back to this page does not refetch it.
    useEffect(() => {
        let ignore = false;
        (async () => {
            try {
                const [brandsRes, sizesRes, stockRes] = await Promise.all([
                    brandsAPI.getAll(), sizesAPI.getAll(), dashboardAPI.getPrintingStockList()
                ]);
                if (ignore) return;
                setBrands(brandsRes.data); setSizes(sizesRes.data); setPrintingStock(stockRes.data);
            } catch (err) {
                if (!ignore) toast.error(getErrorMessage(err, 'Failed to load brands and sizes'));
            }
        })();
        return () => { ignore = true; };
    }, [reloadToken]);

    // The paginated list. Changing a filter while a request is in flight leaves
    // two responses racing; the ignore flag drops any that is no longer for the
    // current parameters, so a slow earlier page cannot overwrite a newer one.
    // Same guard as Dashboard.jsx and ActivityLogs.jsx.
    useEffect(() => {
        let ignore = false;
        (async () => {
            try {
                setLoading(true);
                const res = await productionAPI.getAll(listParams);
                if (ignore) return;
                const body = res.data;
                // Defensive: the route answers with a bare array when neither
                // `page` nor `limit` is sent. We always send both, so this
                // branch should not fire - but a boundary that can return two
                // shapes gets handled rather than assumed.
                if (Array.isArray(body)) {
                    setProduction(body);
                    setTotal(body.length);
                    setTotalPages(1);
                    if (!hasFilters) setBaseTotal(body.length);
                } else {
                    setProduction(body.data ?? []);
                    setTotal(body.total ?? 0);
                    setTotalPages(Math.max(1, body.total_pages ?? 1));
                    if (!hasFilters) setBaseTotal(body.total ?? 0);
                }
            } catch (err) {
                if (!ignore) toast.error(getErrorMessage(err, 'Failed to load production records'));
            } finally {
                if (!ignore) setLoading(false);
            }
        })();
        return () => { ignore = true; };
    // `hasFilters` is derived from values already carried by `listParams`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [listParams, reloadToken]);

    // Deleting the last row of the last page, or tightening a filter, can leave
    // the page number past the end. The server answers an out-of-range page
    // with an empty array, which would read as "no records" rather than "you
    // are past the end", so step back to page 1.
    useEffect(() => {
        if (total > 0 && currentPage > totalPages) setCurrentPage(1);
    }, [total, totalPages, currentPage]);

    const reload = () => setReloadToken(t => t + 1);

    // Every control that narrows or reorders the set invalidates the current
    // page number, so each one resets it.
    const changeSearch = (value) => { setSearchTerm(value); setCurrentPage(1); };
    const changeDateFrom = (value) => { setDateFrom(value); setCurrentPage(1); };
    const changeDateTo = (value) => { setDateTo(value); setCurrentPage(1); };
    const setPageSize = (size) => { setPageSizeState(size); setCurrentPage(1); };

    // Mirrors useTableSort's behaviour: the same column toggles direction, a
    // new column starts descending.
    const requestSort = (key) => {
        setCurrentPage(1);
        if (sortKey === key) {
            setSortDir(prev => (prev === 'asc' ? 'desc' : 'asc'));
        } else {
            setSortKey(key);
            setSortDir('desc');
        }
    };

    /**
     * Collect every row matching the CURRENT filters, for export.
     *
     * The table only holds one page now, so exporting `production` would write
     * a spreadsheet of whatever page happened to be open. Paging through the
     * same filtered query instead keeps the file identical to what the filters
     * describe. `limit` is capped at 200 server-side, so 1,420 rows is at most
     * eight requests - acceptable for an explicit click, and it reuses the
     * server's filter rather than reimplementing it here.
     */
    const fetchAllFiltered = async () => {
        const { page: _ignoredPage, limit: _ignoredLimit, ...filters } = listParams;
        const collected = [];
        let page = 1;
        // Bounded so a server that kept reporting a higher total could never
        // spin here forever.
        const maxPages = 200;
        while (page <= maxPages) {
            const res = await productionAPI.getAll({ ...filters, page, limit: EXPORT_BATCH_LIMIT });
            const body = res.data;
            const batch = Array.isArray(body) ? body : (body.data ?? []);
            collected.push(...batch);
            const pages = Array.isArray(body) ? 1 : Math.max(1, body.total_pages ?? 1);
            if (page >= pages || batch.length === 0) break;
            page += 1;
        }
        return collected;
    };

    const handleExport = async () => {
        try {
            setExporting(true);
            const rows = await fetchAllFiltered();
            if (await exportToExcel({ data: rows, columns: PRODUCTION_EXPORT_COLUMNS, fileName: 'Production', sheetName: 'Production' })) {
                toast.success(`Exported ${rows.length} record(s) to Excel`);
            } else {
                toast.error('No data to export');
            }
        } catch (err) {
            toast.error(getErrorMessage(err, 'Failed to export production records'));
        } finally {
            setExporting(false);
        }
    };

    const openCreate = () => { setEditingId(null); form.reset({ ...emptyForm }); setDialogOpen(true); };
    const openEdit = (entry) => {
        setEditingId(entry.id);
        form.reset({
            brand_id: entry.brand_id || '', size_id: entry.size_id || '',
            quantity_produced: String(entry.quantity_produced),
            notes: entry.notes || '',
            production_date: entry.production_date ? entry.production_date.split('T')[0] : new Date().toISOString().split('T')[0],
        });
        setDialogOpen(true);
    };

    const onSubmit = async (values) => {
        try {
            const brand = brands.find(b => b.id === values.brand_id);
            const size = sizes.find(s => s.id === values.size_id);
            // Already coerced to a positive whole number by productionSchema.
            const qtyProduced = values.quantity_produced;
            const payload = {
                brand_id: values.brand_id, brand_name: brand?.name || '',
                size_id: values.size_id, size_name: size?.name || '',
                quantity_produced: qtyProduced,
                printing_stock_used: qtyProduced,
                notes: values.notes || null,
                production_date: new Date(values.production_date).toISOString(),
            };
            if (editingId) { await productionAPI.update(editingId, payload); toast.success('Entry updated'); }
            else { await productionAPI.create(payload); toast.success('Entry added'); }
            setDialogOpen(false); reload();
        } catch (err) { toast.error(getErrorMessage(err, 'Failed to save entry')); }
    };

    const handleDelete = async () => {
        if (!deleteTarget) return;
        try { await productionAPI.delete(deleteTarget); toast.success('Entry deleted'); reload(); }
        catch (err) { toast.error(getErrorMessage(err, 'Failed to delete')); }
        finally { setDeleteTarget(null); }
    };

    const clearFilters = () => { setSearchTerm(''); setDateFrom(''); setDateTo(''); setCurrentPage(1); };

    /**
     * PAGE-SCOPED TOTALS, AND WHY.
     *
     * These two used to sum the whole collection, because the whole collection
     * was in memory. With server-side pagination only the current page is, and
     * GET /api/production exposes no aggregate - it returns a filtered `total`
     * (a row count) but no sum of `quantity_produced` or `printing_stock_used`.
     *
     * The options were: silently sum one page and keep the old "Total" labels
     * (a number that looks global and is not), refetch all 1,420 rows to add
     * them up (which is the thing this change exists to stop), or say plainly
     * what is being counted. The labels say "This Page". Restoring true totals
     * needs a backend aggregate - flagged, not faked.
     *
     * "Total Entries" is genuinely global: it is the server's filtered `total`,
     * and it is now MORE accurate than before, since it counts every matching
     * row rather than every row that happened to be loaded.
     */
    const pageProduced = production.reduce((sum, p) => sum + (p.quantity_produced || 0), 0);
    const pagePrintingUsed = production.reduce((sum, p) => sum + (p.printing_stock_used || 0), 0);

    return (
        <div className="space-y-6 animate-fade-in" data-testid="production-page">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <p className="text-muted-foreground">Record finished goods production</p>
                <div className="flex gap-2">
                    <Button variant="outline" onClick={handleExport} disabled={exporting} className="font-bold uppercase tracking-wider rounded-sm" data-testid="export-production-btn">
                        {exporting
                            ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Exporting...</>
                            : <><Download className="w-4 h-4 mr-2" /> Export</>}
                    </Button>
                    <ImportExcelButton
                        columns={[
                            { header: 'Brand', key: 'brand_name' },
                            { header: 'Size', key: 'size_name' },
                            { header: 'Qty Produced', key: 'quantity_produced' },
                            { header: 'Printing Stock Used', key: 'printing_stock_used' },
                            { header: 'Production Date', key: 'production_date' },
                            { header: 'Notes', key: 'notes' },
                        ]}
                        templateName="Production"
                        onImport={async (rows, onProgress) => {
                            let success = 0, failed = 0;
                            for (const row of rows) {
                                try {
                                    if (!row.brand_name || !row.size_name || !row.quantity_produced) { failed++; onProgress(success + failed); continue; }
                                    const brand = brands.find(b => b.name.toLowerCase() === String(row.brand_name).toLowerCase().trim());
                                    const size = sizes.find(s => s.name.toLowerCase() === String(row.size_name).toLowerCase().trim());
                                    if (!brand || !size) { failed++; onProgress(success + failed); continue; }
                                    await productionAPI.create({
                                        brand_id: brand.id, brand_name: brand.name,
                                        size_id: size.id, size_name: size.name,
                                        quantity_produced: parseInt(row.quantity_produced),
                                        printing_stock_used: parseInt(row.printing_stock_used) || 0,
                                        production_date: parseImportDate(row.production_date) || new Date().toISOString(),
                                        notes: row.notes || null,
                                    });
                                    success++;
                                } catch { failed++; }
                                onProgress(success + failed);
                            }
                            if (success > 0) reload();
                            return { success, failed };
                        }}
                    />
                    <Button onClick={openCreate} className="font-bold uppercase tracking-wider rounded-sm" data-testid="add-production-btn">
                        <Plus className="w-4 h-4 mr-2" /> Add Production
                    </Button>
                </div>
            </div>

            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                <DialogContent className="bg-card border-border rounded-sm max-w-md">
                    <DialogHeader>
                        <DialogTitle className="font-display text-xl font-bold tracking-tight uppercase">
                            {editingId ? 'Edit Production Entry' : 'Add Production Entry'}
                        </DialogTitle>
                    </DialogHeader>
                    <Form {...form}>
                        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 mt-4" noValidate>
                            <FormField
                                control={form.control}
                                name="production_date"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel className={LABEL_CLASS}>Date *</FormLabel>
                                        <FormControl>
                                            <Input {...field} type="date" className="bg-background border-input rounded-sm font-mono" data-testid="prod-date" />
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                            <FormField
                                control={form.control}
                                name="size_id"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel className={LABEL_CLASS}>Size *</FormLabel>
                                        <Select value={field.value} onValueChange={field.onChange}>
                                            <FormControl>
                                                <SelectTrigger className="bg-background border-input rounded-sm" data-testid="prod-size"><SelectValue placeholder="Select size" /></SelectTrigger>
                                            </FormControl>
                                            <SelectContent className="bg-card border-border rounded-sm">{sizes.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
                                        </Select>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                            <FormField
                                control={form.control}
                                name="brand_id"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel className={LABEL_CLASS}>Brand *</FormLabel>
                                        <Select value={field.value} onValueChange={field.onChange}>
                                            <FormControl>
                                                <SelectTrigger className="bg-background border-input rounded-sm" data-testid="prod-brand"><SelectValue placeholder="Select brand" /></SelectTrigger>
                                            </FormControl>
                                            <SelectContent className="bg-card border-border rounded-sm max-h-60">{brands.filter(b => !EXCLUDED_BRAND_NAMES.includes(b.name?.toUpperCase())).map(b => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}</SelectContent>
                                        </Select>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                            <FormField
                                control={form.control}
                                name="quantity_produced"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel className={LABEL_CLASS}>Qty Produced *</FormLabel>
                                        <FormControl>
                                            <Input {...field} type="number" min="1" placeholder="0" className="bg-background border-input rounded-sm font-mono" data-testid="prod-quantity" />
                                        </FormControl>
                                        {watchQuantity && (
                                            <p className="text-xs text-muted-foreground">Printing stock used will be set to <span className="font-mono font-bold text-primary">{formatNumber(parseInt(watchQuantity) || 0)}</span></p>
                                        )}
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                            {watchSizeId && watchBrandId && (() => {
                                const size = sizes.find(s => s.id === watchSizeId);
                                const brand = brands.find(b => b.id === watchBrandId);
                                const stock = printingStock.find(s => s.size_name === size?.name && s.brand_name === brand?.name);
                                return stock ? (
                                    <div className="p-3 bg-primary/10 rounded-sm border border-primary/20 text-sm">
                                        <p className="text-xs font-bold uppercase text-muted-foreground mb-1">Available Printing Stock</p>
                                        <div className="grid grid-cols-3 gap-2">
                                            <div><p className="text-xs text-muted-foreground">Printed</p><p className="font-mono font-bold">{formatNumber(stock.printing_done)}</p></div>
                                            <div><p className="text-xs text-muted-foreground">Used</p><p className="font-mono">{formatNumber(stock.used_in_production)}</p></div>
                                            <div><p className="text-xs text-muted-foreground">Available</p><p className="font-mono font-bold text-primary">{formatNumber(stock.available)}</p></div>
                                        </div>
                                    </div>
                                ) : null;
                            })()}
                            <FormField
                                control={form.control}
                                name="notes"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel className={LABEL_CLASS}>Notes</FormLabel>
                                        <FormControl>
                                            <Textarea {...field} placeholder="Optional notes..." className="bg-background border-input rounded-sm" data-testid="prod-notes" />
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                            <Button type="submit" className="w-full font-bold uppercase tracking-wider rounded-sm" disabled={isSubmitting} data-testid="submit-production">
                                {isSubmitting ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Saving...</> : (editingId ? 'Update Entry' : 'Add Production')}
                            </Button>
                        </form>
                    </Form>
                </DialogContent>
            </Dialog>

            <ConfirmDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)} title="Delete Production Entry?" description="This will permanently remove this production record." onConfirm={handleDelete} />

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <Card className="industrial-card"><CardContent className="p-4"><div className="flex items-center gap-3"><div className="p-2 bg-primary/10 rounded-sm border border-primary/20"><Factory className="w-5 h-5 text-primary" /></div><div><p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Total Entries</p><p className="font-display text-2xl font-bold" data-testid="production-total-entries">{formatNumber(total)}</p></div></div></CardContent></Card>
                <Card className="industrial-card"><CardContent className="p-4"><div className="flex items-center gap-3"><div className="p-2 bg-warning/10 rounded-sm border border-warning/20"><Factory className="w-5 h-5 text-warning" /></div><div><p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Printing Used (This Page)</p><p className="font-display text-2xl font-bold">{formatNumber(pagePrintingUsed)}</p></div></div></CardContent></Card>
                <Card className="industrial-card"><CardContent className="p-4"><div className="flex items-center gap-3"><div className="p-2 bg-success/10 rounded-sm border border-success/20"><Factory className="w-5 h-5 text-success" /></div><div><p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Produced (This Page)</p><p className="font-display text-2xl font-bold">{formatNumber(pageProduced)}</p></div></div></CardContent></Card>
            </div>

            <Card className="industrial-card">
                <CardHeader><CardTitle className="font-display text-xl font-bold tracking-tight uppercase">Production Records</CardTitle></CardHeader>
                <TableSearch
                    searchValue={searchTerm}
                    onSearchChange={changeSearch}
                    searchPlaceholder="Search by brand, size..."
                    filters={[
                        { key: 'dateFrom', label: 'From Date', type: 'date', value: dateFrom, onChange: changeDateFrom },
                        { key: 'dateTo', label: 'To Date', type: 'date', value: dateTo, onChange: changeDateTo },
                    ]}
                    onClear={clearFilters}
                    resultCount={total}
                    totalCount={hasFilters ? Math.max(baseTotal, total) : total}
                />
                <CardContent className="p-0">
                    {loading ? (
                        <div className="flex items-center justify-center h-48"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
                    ) : production.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-48 text-muted-foreground"><AlertCircle className="w-8 h-8 mb-2" /><p>{hasFilters ? 'No matching records' : 'No production records'}</p></div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="data-table" data-testid="production-table">
                                <thead><tr><th>#</th>
                                    <SortableHeader label="Date" sortKey="production_date" currentSortKey={sortKey} currentSortDir={sortDir} onSort={requestSort} />
                                    <SortableHeader label="Size" sortKey="size_name" currentSortKey={sortKey} currentSortDir={sortDir} onSort={requestSort} />
                                    <SortableHeader label="Brand" sortKey="brand_name" currentSortKey={sortKey} currentSortDir={sortDir} onSort={requestSort} />
                                    <SortableHeader label="Printing Used" sortKey="printing_stock_used" currentSortKey={sortKey} currentSortDir={sortDir} onSort={requestSort} />
                                    <SortableHeader label="Qty Produced" sortKey="quantity_produced" currentSortKey={sortKey} currentSortDir={sortDir} onSort={requestSort} />
                                    <th>Notes</th><th>By</th><th>Updated By</th><th></th></tr></thead>
                                <tbody>
                                    {production.map((entry, idx) => (
                                        <tr key={entry.id} data-testid={`production-row-${entry.id}`}>
                                            <td className="text-muted-foreground">{startIndex + idx + 1}</td>
                                            <td>{formatDate(entry.production_date)}</td>
                                            <td className="font-medium">{entry.size_name}</td>
                                            <td>{entry.brand_name}</td>
                                            <td className="font-mono text-warning">{formatNumber(entry.printing_stock_used || 0)}</td>
                                            <td className="font-mono text-success font-bold">{formatNumber(entry.quantity_produced)}</td>
                                            <td className="max-w-xs truncate text-muted-foreground">{entry.notes || '-'}</td>
                                            <td className="text-muted-foreground">{entry.created_by}</td>
                                            <td className="text-muted-foreground">{entry.updated_by || '-'}</td>
                                            <td>
                                                <div className="flex gap-1">
                                                    <Button variant="ghost" size="icon" aria-label={`Edit production entry for ${entry.brand_name} ${entry.size_name}`} onClick={() => openEdit(entry)} className="text-muted-foreground hover:text-primary" data-testid={'edit-production-' + entry.id}><Pencil className="w-4 h-4" /></Button>
                                                    <Button variant="ghost" size="icon" aria-label={`Delete production entry for ${entry.brand_name} ${entry.size_name}`} onClick={() => setDeleteTarget(entry.id)} className="text-muted-foreground hover:text-destructive" data-testid={'delete-production-' + entry.id}><Trash2 className="w-4 h-4" /></Button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                    <TablePagination currentPage={currentPage} totalPages={totalPages} pageSize={pageSize} totalItems={total} startIndex={startIndex} onPageChange={setCurrentPage} onPageSizeChange={setPageSize} pageSizeOptions={PAGE_SIZE_OPTIONS} />
                </CardContent>
            </Card>
        </div>
    );
};

export default Production;
