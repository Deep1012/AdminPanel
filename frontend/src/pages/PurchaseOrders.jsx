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
import ConfirmDialog from '../components/ConfirmDialog';
import TableSearch from '../components/TableSearch';
import TablePagination from '../components/TablePagination';
import SortableHeader from '../components/SortableHeader';
import { useTableFilter } from '../hooks/useTableFilter';
import { usePagination } from '../hooks/usePagination';
import { useTableSort } from '../hooks/useTableSort';
import { purchaseOrdersAPI, brandsAPI, sizesAPI, customersAPI } from '../lib/api';
import SearchableSelect from '../components/SearchableSelect';
import { formatDate, formatNumber, parseImportDate } from '../lib/utils';
import { getErrorMessage } from '../lib/errors';
import { purchaseOrderCreateSchema, purchaseOrderEditSchema, purchaseOrderItemInputSchema } from '../lib/schemas';
import { Plus, Trash2, Pencil, ClipboardList, Loader2, AlertCircle, Download, Check, RotateCcw } from 'lucide-react';
import { toast } from 'sonner';
import { exportToExcel } from '../lib/exportToExcel';
import ImportExcelButton from '../components/ImportExcelButton';

const LABEL_CLASS = 'text-xs font-bold uppercase tracking-widest text-muted-foreground';

const today = () => new Date().toISOString().split('T')[0];
const emptyCreate = () => ({ date: today(), company_name: '', items: [] });
const emptyItemInput = { brand_id: '', size_id: '', quantity: '' };

const PO_EXPORT_COLUMNS = [
    { header: '#', key: 'id', transform: (v, row, idx) => idx + 1 },
    { header: 'Date', key: 'date', transform: (v) => formatDate(v) },
    { header: 'Company', key: 'company_name' },
    { header: 'Brand', key: 'brand_name' },
    { header: 'Size', key: 'size_name' },
    { header: 'Quantity', key: 'quantity' },
    { header: 'Dispatched', key: 'quantity_dispatched' },
    { header: 'Pending', key: 'quantity', transform: (v, row) => Math.max(0, (row.quantity || 0) - (row.quantity_dispatched || 0)) },
    { header: 'Status', key: 'is_completed', transform: (v) => v ? 'Completed' : 'Active' },
    { header: 'Created By', key: 'created_by' },
];

const PurchaseOrders = () => {
    const [orders, setOrders] = useState([]);
    const [brands, setBrands] = useState([]);
    const [sizes, setSizes] = useState([]);
    const [customers, setCustomers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [dialogOpen, setDialogOpen] = useState(false);
    const [editingId, setEditingId] = useState(null);
    const [deleteTarget, setDeleteTarget] = useState(null);
    const [activeTab, setActiveTab] = useState('active');

    // Create dialog: one customer + date, many brand/size/qty lines.
    const createForm = useForm({
        resolver: zodResolver(purchaseOrderCreateSchema),
        defaultValues: emptyCreate(),
    });
    const { fields: formItems, append, remove, replace } = useFieldArray({ control: createForm.control, name: 'items' });
    const watchedCompany = createForm.watch('company_name');

    // The staging row is its own form instance so brand/size/qty are validated
    // on "Add" without gating the order itself. It cannot be a nested <form>
    // element, so the Add button submits it programmatically.
    const itemForm = useForm({
        resolver: zodResolver(purchaseOrderItemInputSchema),
        defaultValues: { ...emptyItemInput },
    });

    // Edit dialog: a single existing order.
    const editForm = useForm({
        resolver: zodResolver(purchaseOrderEditSchema),
        defaultValues: { date: today(), company_name: '', brand_id: '', size_id: '', quantity: '', notes: '' },
    });

    const [searchTerm, setSearchTerm] = useState('');
    const [dateFrom, setDateFrom] = useState('');
    const [dateTo, setDateTo] = useState('');
    const [filterCompany, setFilterCompany] = useState('');

    // Split orders into active and completed
    const activeOrders = useMemo(() => orders.filter(o => !o.is_completed), [orders]);
    const completedOrders = useMemo(() => orders.filter(o => o.is_completed), [orders]);
    const currentOrders = activeTab === 'active' ? activeOrders : completedOrders;

    const filters = useMemo(() => [
        ...(dateFrom ? [{ key: 'date', value: dateFrom, type: 'dateFrom' }] : []),
        ...(dateTo ? [{ key: 'date', value: dateTo, type: 'dateTo' }] : []),
        ...(filterCompany ? [{ key: 'company_name', value: filterCompany, type: 'exact' }] : []),
    ], [dateFrom, dateTo, filterCompany]);

    const filteredOrders = useTableFilter({
        data: currentOrders, searchTerm, searchFields: ['serial_no', 'company_name', 'brand_name', 'size_name'], filters
    });

    const { sortedData, sortKey, sortDir, requestSort } = useTableSort({
        data: filteredOrders, defaultSortKey: 'date', defaultSortDir: 'desc'
    });

    const { paginatedData: paginatedOrders, currentPage, totalPages, pageSize, setCurrentPage, setPageSize, startIndex, PAGE_SIZE_OPTIONS } = usePagination({ data: sortedData });

    // Unique companies for filter dropdown
    const companyOptions = useMemo(() => {
        const names = [...new Set(orders.map(o => o.company_name))].sort();
        return names.map(n => ({ value: n, label: n }));
    }, [orders]);

    useEffect(() => { fetchData(); }, []);

    const fetchData = async () => {
        try {
            setLoading(true);
            const [ordersRes, brandsRes, sizesRes, customersRes] = await Promise.all([
                purchaseOrdersAPI.getAll(), brandsAPI.getAll(), sizesAPI.getAll(), customersAPI.getAll()
            ]);
            setOrders(ordersRes.data); setBrands(brandsRes.data); setSizes(sizesRes.data); setCustomers(customersRes.data);
        } catch (err) { toast.error(getErrorMessage(err, 'Failed to load data')); }
        finally { setLoading(false); }
    };

    const resetForm = () => {
        createForm.reset(emptyCreate());
        itemForm.reset({ ...emptyItemInput });
    };

    const openCreate = () => { setEditingId(null); resetForm(); setDialogOpen(true); };

    const openEdit = (po) => {
        setEditingId(po.id);
        editForm.reset({
            company_name: po.company_name, brand_id: po.brand_id || '', size_id: po.size_id || '',
            quantity: String(po.quantity), notes: po.notes || '',
            date: po.date ? po.date.split('T')[0] : today(),
        });
        setDialogOpen(true);
    };

    const handleAddItem = itemForm.handleSubmit((values) => {
        const brand = brands.find(b => b.id === values.brand_id);
        const size = sizes.find(s => s.id === values.size_id);
        if (!brand || !size) return;
        append({
            brand_id: brand.id, brand_name: brand.name,
            size_id: size.id, size_name: size.name,
            quantity: values.quantity,
        });
        itemForm.reset({ ...emptyItemInput });
    });

    const handleRemoveItem = (index) => { remove(index); };

    const onSubmitCreate = async (values) => {
        // Each item is its own POST, so a mid-loop failure used to leave the
        // earlier items already persisted while the dialog still held all
        // of them — retrying then duplicated those. Isolate each item,
        // keep only the failures in the form, and report both counts.
        //
        // Requests stay sequential on purpose: the backend derives
        // `serial_no` by reading the latest PO and incrementing, guarded
        // only by a unique index, so firing these concurrently would
        // produce spurious 409 "Duplicate serial number" failures.
        // Matches the per-row loop in ImportExcelButton.
        const failedItems = [];
        let succeeded = 0;
        let firstError = null;

        for (const item of values.items) {
            try {
                await purchaseOrdersAPI.create({
                    date: new Date(values.date).toISOString(),
                    company_name: values.company_name,
                    brand_id: item.brand_id, brand_name: item.brand_name,
                    size_id: item.size_id, size_name: item.size_name,
                    quantity: item.quantity,
                });
                succeeded += 1;
            } catch (err) {
                failedItems.push(item);
                if (!firstError) firstError = err;
            }
        }

        const failed = failedItems.length;
        if (succeeded > 0) toast.success(`${succeeded} purchase order(s) created`);
        if (failed > 0) toast.error(`${failed} purchase order(s) failed: ${getErrorMessage(firstError, 'Failed to create orders')}`);

        fetchData();
        if (failed === 0) {
            setDialogOpen(false);
            resetForm();
        } else {
            // Leave the dialog open with only the items still to be created.
            replace(failedItems);
        }
    };

    const onSubmitEdit = async (values) => {
        try {
            const brand = brands.find(b => b.id === values.brand_id);
            const size = sizes.find(s => s.id === values.size_id);
            await purchaseOrdersAPI.update(editingId, {
                date: new Date(values.date).toISOString(),
                company_name: values.company_name,
                brand_id: values.brand_id, brand_name: brand?.name || '',
                size_id: values.size_id, size_name: size?.name || '',
                quantity: values.quantity,
                notes: values.notes || null,
            });
            toast.success('Order updated');
            setDialogOpen(false); fetchData();
        } catch (err) { toast.error(getErrorMessage(err, 'Failed to save order')); }
    };

    const handleDelete = async () => {
        if (!deleteTarget) return;
        try { await purchaseOrdersAPI.delete(deleteTarget); toast.success('Order deleted'); fetchData(); }
        catch (err) { toast.error(getErrorMessage(err, 'Failed to delete')); }
        finally { setDeleteTarget(null); }
    };

    const handleToggleComplete = async (po) => {
        try {
            await purchaseOrdersAPI.toggleComplete(po.id);
            toast.success(po.is_completed ? 'Order reopened' : 'Order marked as completed');
            fetchData();
        } catch (err) { toast.error(getErrorMessage(err, 'Failed to update status')); }
    };

    const clearFilters = () => { setSearchTerm(''); setDateFrom(''); setDateTo(''); setFilterCompany(''); };

    const totalOrders = activeOrders.length;
    const totalQuantity = activeOrders.reduce((sum, o) => sum + (o.quantity || 0), 0);
    const totalPending = activeOrders.reduce((sum, o) => sum + Math.max(0, (o.quantity || 0) - (o.quantity_dispatched || 0)), 0);

    return (
        <div className="space-y-6 animate-fade-in" data-testid="purchase-orders-page">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <p className="text-muted-foreground">Track customer purchase orders from receipt to delivery</p>
                <div className="flex gap-2">
                    <Button variant="outline" onClick={async () => {
                        if (await exportToExcel({ data: filteredOrders, columns: PO_EXPORT_COLUMNS, fileName: 'Purchase_Orders', sheetName: 'Purchase Orders' })) toast.success('Exported to Excel');
                        else toast.error('No data to export');
                    }} className="font-bold uppercase tracking-wider rounded-sm" data-testid="export-po-btn">
                        <Download className="w-4 h-4 mr-2" /> Export
                    </Button>
                    <ImportExcelButton
                        columns={[
                            { header: 'Date', key: 'date' },
                            { header: 'Company', key: 'company_name' },
                            { header: 'Brand', key: 'brand_name' },
                            { header: 'Size', key: 'size_name' },
                            { header: 'Quantity', key: 'quantity' },
                            { header: 'Notes', key: 'notes' },
                        ]}
                        templateName="Purchase_Orders"
                        onImport={async (rows, onProgress) => {
                            let success = 0, failed = 0;
                            for (const row of rows) {
                                try {
                                    if (!row.company_name || !row.brand_name || !row.size_name || !row.quantity) { failed++; onProgress(success + failed); continue; }
                                    const brand = brands.find(b => b.name.toLowerCase() === String(row.brand_name).toLowerCase().trim());
                                    const size = sizes.find(s => s.name.toLowerCase() === String(row.size_name).toLowerCase().trim());
                                    if (!brand || !size) { failed++; onProgress(success + failed); continue; }
                                    await purchaseOrdersAPI.create({
                                        date: parseImportDate(row.date) || new Date().toISOString(),
                                        company_name: String(row.company_name).trim(),
                                        brand_id: brand.id, brand_name: brand.name,
                                        size_id: size.id, size_name: size.name,
                                        quantity: parseInt(row.quantity),
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
                    <Button onClick={openCreate} className="font-bold uppercase tracking-wider rounded-sm" data-testid="add-po-btn">
                        <Plus className="w-4 h-4 mr-2" /> New Order
                    </Button>
                </div>
            </div>

            {/* Create Dialog (multi-item) */}
            <Dialog open={dialogOpen && !editingId} onOpenChange={(open) => { if (!open) { setDialogOpen(false); resetForm(); } }}>
                <DialogContent className="bg-card border-border rounded-sm max-w-xl max-h-[90vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle className="font-display text-xl font-bold tracking-tight uppercase">New Purchase Order</DialogTitle>
                    </DialogHeader>
                    <Form {...createForm}>
                        <form onSubmit={createForm.handleSubmit(onSubmitCreate)} className="space-y-4 mt-4" noValidate>
                            <FormField
                                control={createForm.control}
                                name="date"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel className={LABEL_CLASS}>Date *</FormLabel>
                                        <FormControl>
                                            <Input {...field} type="date" className="bg-background border-input rounded-sm font-mono" data-testid="po-date" />
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                            <FormField
                                control={createForm.control}
                                name="company_name"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel className={LABEL_CLASS}>Customer *</FormLabel>
                                        {/* FormControl injects the id the label points at, plus
                                            aria-invalid/aria-describedby, onto the combobox trigger. */}
                                        <FormControl>
                                            <SearchableSelect
                                                options={customers.map(c => ({ value: c.name, label: c.name }))}
                                                value={field.value}
                                                onValueChange={field.onChange}
                                                placeholder="Select customer"
                                                searchPlaceholder="Search customers..."
                                                data-testid="po-company"
                                            />
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                            <div className="border-t border-border pt-4"><Label className={LABEL_CLASS}>Add Items (Brand, Size, Qty)</Label></div>
                            {/* The staging row validates on its own form instance; it needs
                                its own provider so FormMessage can find those errors. */}
                            <Form {...itemForm}>
                                <div className="grid grid-cols-4 gap-2">
                                    <FormField
                                        control={itemForm.control}
                                        name="brand_id"
                                        render={({ field }) => (
                                            <FormItem>
                                                <Select value={field.value} onValueChange={field.onChange}>
                                                    <FormControl>
                                                        <SelectTrigger aria-label="Brand" className="bg-background border-input rounded-sm" data-testid="po-brand"><SelectValue placeholder="Brand" /></SelectTrigger>
                                                    </FormControl>
                                                    <SelectContent className="bg-card border-border rounded-sm max-h-60">{brands.map(b => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}</SelectContent>
                                                </Select>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />
                                    <FormField
                                        control={itemForm.control}
                                        name="size_id"
                                        render={({ field }) => (
                                            <FormItem>
                                                <Select value={field.value} onValueChange={field.onChange}>
                                                    <FormControl>
                                                        <SelectTrigger aria-label="Size" className="bg-background border-input rounded-sm" data-testid="po-size"><SelectValue placeholder="Size" /></SelectTrigger>
                                                    </FormControl>
                                                    <SelectContent className="bg-card border-border rounded-sm">{sizes.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
                                                </Select>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />
                                    <FormField
                                        control={itemForm.control}
                                        name="quantity"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormControl>
                                                    <Input {...field} type="number" min="1" placeholder="Qty" aria-label="Quantity" className="bg-background border-input rounded-sm font-mono" data-testid="po-quantity" />
                                                </FormControl>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />
                                    <Button type="button" onClick={handleAddItem} className="rounded-sm" data-testid="add-po-item-btn"><Plus className="w-4 h-4 mr-1" /> Add</Button>
                                </div>
                            </Form>
                            {formItems.length > 0 && (
                                <div className="space-y-2">
                                    <Label className={LABEL_CLASS}>Items ({formItems.length})</Label>
                                    <div className="space-y-1 max-h-40 overflow-y-auto">
                                        {formItems.map((item, idx) => (
                                            <div key={item.id} className="flex items-center justify-between p-2 bg-secondary/50 rounded-sm">
                                                <div className="flex items-center gap-2">
                                                    <span className="text-sm font-medium">{item.brand_name}</span>
                                                    <Badge variant="outline">{item.size_name}</Badge>
                                                    <Badge variant="secondary" className="font-mono">{formatNumber(item.quantity)} qty</Badge>
                                                </div>
                                                <Button aria-label="Remove this item from the order" type="button" variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground hover:text-destructive" onClick={() => handleRemoveItem(idx)} data-testid={'remove-po-item-' + idx}><Trash2 className="w-3 h-3" /></Button>
                                            </div>
                                        ))}
                                    </div>
                                    <div className="flex justify-between text-sm p-2 bg-success/10 rounded-sm border border-success/20">
                                        <span className="font-bold uppercase tracking-wider">Total Quantity</span>
                                        <span className="font-mono font-bold text-success">{formatNumber(formItems.reduce((sum, i) => sum + (i.quantity || 0), 0))}</span>
                                    </div>
                                </div>
                            )}
                            {createForm.formState.errors.items?.message && (
                                <p className="text-[0.8rem] font-medium text-destructive">{createForm.formState.errors.items.message}</p>
                            )}
                            <Button type="submit" className="w-full font-bold uppercase tracking-wider rounded-sm" disabled={createForm.formState.isSubmitting || formItems.length === 0 || !watchedCompany} data-testid="submit-po-create">
                                {createForm.formState.isSubmitting ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Creating...</> : `Create ${formItems.length} Order(s)`}
                            </Button>
                        </form>
                    </Form>
                </DialogContent>
            </Dialog>

            {/* Edit Dialog (single item) */}
            <Dialog open={dialogOpen && !!editingId} onOpenChange={(open) => { if (!open) { setDialogOpen(false); setEditingId(null); } }}>
                <DialogContent className="bg-card border-border rounded-sm max-w-md">
                    <DialogHeader>
                        <DialogTitle className="font-display text-xl font-bold tracking-tight uppercase">Edit Purchase Order</DialogTitle>
                    </DialogHeader>
                    <Form {...editForm}>
                        <form onSubmit={editForm.handleSubmit(onSubmitEdit)} className="space-y-4 mt-4" noValidate>
                            <FormField
                                control={editForm.control}
                                name="date"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel className={LABEL_CLASS}>Date *</FormLabel>
                                        <FormControl>
                                            <Input {...field} type="date" className="bg-background border-input rounded-sm font-mono" data-testid="po-edit-date" />
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                            <FormField
                                control={editForm.control}
                                name="company_name"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel className={LABEL_CLASS}>Customer *</FormLabel>
                                        <FormControl>
                                            <SearchableSelect
                                                options={customers.map(c => ({ value: c.name, label: c.name }))}
                                                value={field.value}
                                                onValueChange={field.onChange}
                                                placeholder="Select customer"
                                                searchPlaceholder="Search customers..."
                                                data-testid="po-edit-company"
                                            />
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                            <FormField
                                control={editForm.control}
                                name="brand_id"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel className={LABEL_CLASS}>Brand *</FormLabel>
                                        <Select value={field.value} onValueChange={field.onChange}>
                                            <FormControl>
                                                <SelectTrigger className="bg-background border-input rounded-sm" data-testid="po-edit-brand"><SelectValue placeholder="Select brand" /></SelectTrigger>
                                            </FormControl>
                                            <SelectContent className="bg-card border-border rounded-sm max-h-60">{brands.map(b => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}</SelectContent>
                                        </Select>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                            <div className="grid grid-cols-2 gap-4">
                                <FormField
                                    control={editForm.control}
                                    name="size_id"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel className={LABEL_CLASS}>Size *</FormLabel>
                                            <Select value={field.value} onValueChange={field.onChange}>
                                                <FormControl>
                                                    <SelectTrigger className="bg-background border-input rounded-sm" data-testid="po-edit-size"><SelectValue placeholder="Select" /></SelectTrigger>
                                                </FormControl>
                                                <SelectContent className="bg-card border-border rounded-sm">{sizes.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
                                            </Select>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
                                <FormField
                                    control={editForm.control}
                                    name="quantity"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel className={LABEL_CLASS}>Quantity *</FormLabel>
                                            <FormControl>
                                                <Input {...field} type="number" min="1" placeholder="0" className="bg-background border-input rounded-sm font-mono" data-testid="po-edit-quantity" />
                                            </FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
                            </div>
                            <Button type="submit" className="w-full font-bold uppercase tracking-wider rounded-sm" disabled={editForm.formState.isSubmitting} data-testid="submit-po-edit">
                                {editForm.formState.isSubmitting ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Saving...</> : 'Update Order'}
                            </Button>
                        </form>
                    </Form>
                </DialogContent>
            </Dialog>

            <ConfirmDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)} title="Delete Purchase Order?" description="This will permanently remove this purchase order." onConfirm={handleDelete} />

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <Card className="industrial-card"><CardContent className="p-4"><div className="flex items-center gap-3"><div className="p-2 bg-primary/10 rounded-sm border border-primary/20"><ClipboardList className="w-5 h-5 text-primary" /></div><div><p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Active Orders</p><p className="font-display text-2xl font-bold">{totalOrders}</p></div></div></CardContent></Card>
                <Card className="industrial-card"><CardContent className="p-4"><div className="flex items-center gap-3"><div className="p-2 bg-success/10 rounded-sm border border-success/20"><ClipboardList className="w-5 h-5 text-success" /></div><div><p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Total Quantity</p><p className="font-display text-2xl font-bold">{formatNumber(totalQuantity)}</p></div></div></CardContent></Card>
                <Card className="industrial-card"><CardContent className="p-4"><div className="flex items-center gap-3"><div className="p-2 bg-warning/10 rounded-sm border border-warning/20"><ClipboardList className="w-5 h-5 text-warning" /></div><div><p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Pending Qty</p><p className="font-display text-2xl font-bold">{formatNumber(totalPending)}</p></div></div></CardContent></Card>
            </div>

            <Card className="industrial-card">
                <CardHeader>
                    <div className="flex items-center justify-between">
                        <CardTitle className="font-display text-xl font-bold tracking-tight uppercase">Purchase Orders</CardTitle>
                        <div className="flex gap-1">
                            <button
                                onClick={() => { setActiveTab('active'); setCurrentPage(1); }}
                                className={`text-xs px-4 py-2 font-bold uppercase tracking-wider rounded-sm transition-colors ${activeTab === 'active' ? 'bg-primary text-primary-foreground' : 'bg-secondary/50 text-muted-foreground hover:bg-secondary hover:text-foreground'}`}
                                data-testid="tab-active"
                            >
                                Active ({activeOrders.length})
                            </button>
                            <button
                                onClick={() => { setActiveTab('completed'); setCurrentPage(1); }}
                                className={`text-xs px-4 py-2 font-bold uppercase tracking-wider rounded-sm transition-colors ${activeTab === 'completed' ? 'bg-primary text-primary-foreground' : 'bg-secondary/50 text-muted-foreground hover:bg-secondary hover:text-foreground'}`}
                                data-testid="tab-completed"
                            >
                                Completed ({completedOrders.length})
                            </button>
                        </div>
                    </div>
                </CardHeader>
                <TableSearch
                    searchValue={searchTerm}
                    onSearchChange={setSearchTerm}
                    searchPlaceholder="Search by serial no, company, brand..."
                    filters={[
                        { key: 'company', label: 'Company', type: 'select', options: companyOptions, value: filterCompany, onChange: setFilterCompany },
                        { key: 'dateFrom', label: 'From Date', type: 'date', value: dateFrom, onChange: setDateFrom },
                        { key: 'dateTo', label: 'To Date', type: 'date', value: dateTo, onChange: setDateTo },
                    ]}
                    onClear={clearFilters}
                    resultCount={filteredOrders.length}
                    totalCount={currentOrders.length}
                />
                <CardContent className="p-0">
                    {loading ? (
                        <div className="flex items-center justify-center h-48"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
                    ) : filteredOrders.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-48 text-muted-foreground"><AlertCircle className="w-8 h-8 mb-2" /><p>{currentOrders.length === 0 ? `No ${activeTab} orders` : 'No matching orders'}</p></div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="data-table" data-testid="po-table">
                                <thead><tr><th>#</th>
                                    <SortableHeader label="Date" sortKey="date" currentSortKey={sortKey} currentSortDir={sortDir} onSort={requestSort} />
                                    <SortableHeader label="Company" sortKey="company_name" currentSortKey={sortKey} currentSortDir={sortDir} onSort={requestSort} />
                                    <SortableHeader label="Brand" sortKey="brand_name" currentSortKey={sortKey} currentSortDir={sortDir} onSort={requestSort} />
                                    <th>Size</th>
                                    <SortableHeader label="Qty" sortKey="quantity" currentSortKey={sortKey} currentSortDir={sortDir} onSort={requestSort} />
                                    <th>Dispatched</th>
                                    <th>Pending</th>
                                    <th>By</th>
                                    <th><span className="sr-only">Actions</span></th></tr></thead>
                                <tbody>
                                    {paginatedOrders.map((po, idx) => {
                                        const pending = Math.max(0, (po.quantity || 0) - (po.quantity_dispatched || 0));
                                        return (
                                            <tr key={po.id} data-testid={`po-row-${po.id}`}>
                                                <td className="text-muted-foreground">{startIndex + idx + 1}</td>
                                                <td>{formatDate(po.date)}</td>
                                                <td className="font-medium">{po.company_name}</td>
                                                <td>{po.brand_name}</td>
                                                <td><Badge variant="outline">{po.size_name}</Badge></td>
                                                <td className="font-mono">{formatNumber(po.quantity)}</td>
                                                <td className="font-mono text-success">{formatNumber(po.quantity_dispatched || 0)}</td>
                                                <td className={`font-mono font-bold ${pending > 0 ? 'text-warning' : 'text-success'}`}>{formatNumber(pending)}</td>
                                                <td className="text-muted-foreground">{po.created_by}</td>
                                                <td>
                                                    <div className="flex gap-1">
                                                        <Button aria-label="Mark purchase order complete or reopen it"
                                                            variant="ghost" size="icon"
                                                            onClick={() => handleToggleComplete(po)}
                                                            className={po.is_completed ? 'text-muted-foreground hover:text-warning' : 'text-muted-foreground hover:text-success'}
                                                            title={po.is_completed ? 'Reopen order' : 'Mark as completed'}
                                                            data-testid={`complete-po-${po.id}`}
                                                        >
                                                            {po.is_completed ? <RotateCcw className="w-4 h-4" /> : <Check className="w-4 h-4" />}
                                                        </Button>
                                                        {!po.is_completed && (
                                                            <Button aria-label="Edit purchase order" variant="ghost" size="icon" onClick={() => openEdit(po)} className="text-muted-foreground hover:text-primary" data-testid={'edit-po-' + po.id}><Pencil className="w-4 h-4" /></Button>
                                                        )}
                                                        <Button aria-label="Delete purchase order" variant="ghost" size="icon" onClick={() => setDeleteTarget(po.id)} className="text-muted-foreground hover:text-destructive"><Trash2 className="w-4 h-4" /></Button>
                                                    </div>
                                                </td>
                                            </tr>
                                        );
                                    })}
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
