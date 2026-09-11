import React, { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '../components/ui/form';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../components/ui/dialog';
import { Badge } from '../components/ui/badge';
import ConfirmDialog from '../components/ConfirmDialog';
import TableSearch from '../components/TableSearch';
import TablePagination from '../components/TablePagination';
import { useTableFilter } from '../hooks/useTableFilter';
import { usePagination } from '../hooks/usePagination';
import { brandsAPI } from '../lib/api';
import { formatDate } from '../lib/utils';
import { Switch } from '../components/ui/switch';
import { Plus, Trash2, Pencil, Tag, Loader2, AlertCircle, Download } from 'lucide-react';
import { toast } from 'sonner';
import { exportToExcel } from '../lib/exportToExcel';
import ImportExcelButton from '../components/ImportExcelButton';
import { getErrorMessage } from '../lib/errors';
import { brandSchema } from '../lib/schemas';

const LABEL_CLASS = 'text-xs font-bold uppercase tracking-widest text-muted-foreground';

const BRANDS_EXPORT_COLUMNS = [
    { header: '#', key: 'id', transform: (v, row, idx) => idx + 1 },
    { header: 'Name', key: 'name' },
    { header: 'Created', key: 'created_at', transform: (v) => formatDate(v) },
];

const Brands = () => {
    const [brands, setBrands] = useState([]);
    const [loading, setLoading] = useState(true);
    const [dialogOpen, setDialogOpen] = useState(false);
    const [editingId, setEditingId] = useState(null);
    const [deleteTarget, setDeleteTarget] = useState(null);
    const [searchTerm, setSearchTerm] = useState('');

    const form = useForm({
        resolver: zodResolver(brandSchema),
        defaultValues: { name: '' },
    });
    const { isSubmitting } = form.formState;

    const filteredBrands = useTableFilter({
        data: brands, searchTerm, searchFields: ['name'], filters: []
    });

    const { paginatedData: paginatedBrands, currentPage, totalPages, pageSize, setCurrentPage, setPageSize, startIndex, PAGE_SIZE_OPTIONS } = usePagination({ data: filteredBrands });

    useEffect(() => { fetchBrands(); }, []);

    const fetchBrands = async () => {
        try { setLoading(true); const res = await brandsAPI.getAll(); setBrands(res.data); }
        catch (err) { toast.error(getErrorMessage(err, 'Failed to load brands')); }
        finally { setLoading(false); }
    };

    const openCreate = () => { setEditingId(null); form.reset({ name: '' }); setDialogOpen(true); };
    const openEdit = (brand) => { setEditingId(brand.id); form.reset({ name: brand.name }); setDialogOpen(true); };

    const onSubmit = async (values) => {
        const payload = { name: values.name.toUpperCase() };
        try {
            if (editingId) {
                await brandsAPI.update(editingId, payload);
                toast.success('Brand updated');
            } else {
                await brandsAPI.create(payload);
                toast.success('Brand added');
            }
            setDialogOpen(false);
            fetchBrands();
        } catch (err) { toast.error(getErrorMessage(err, 'Failed to save brand')); }
    };

    const handleDelete = async () => {
        if (!deleteTarget) return;
        try { await brandsAPI.delete(deleteTarget); toast.success('Brand deleted'); fetchBrands(); }
        catch (err) { toast.error(getErrorMessage(err, 'Failed to delete brand')); }
        finally { setDeleteTarget(null); }
    };

    return (
        <div className="space-y-6 animate-fade-in" data-testid="brands-page">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <p className="text-muted-foreground">Manage paint brand product lines</p>
                <div className="flex gap-2">
                    <Button variant="outline" onClick={async () => {
                        const data = filteredBrands;
                        if (await exportToExcel({ data, columns: BRANDS_EXPORT_COLUMNS, fileName: 'Brands', sheetName: 'Brands' })) toast.success('Exported to Excel');
                        else toast.error('No data to export');
                    }} className="font-bold uppercase tracking-wider rounded-sm" data-testid="export-brands-btn">
                        <Download className="w-4 h-4 mr-2" /> Export
                    </Button>
                    <ImportExcelButton
                        columns={[{ header: 'Name', key: 'name' }]}
                        templateName="Brands"
                        onImport={async (rows, onProgress) => {
                            let success = 0, failed = 0;
                            for (const row of rows) {
                                try { if (row.name) { await brandsAPI.create({ name: String(row.name).trim() }); success++; } else failed++; }
                                catch { failed++; }
                                onProgress(success + failed);
                            }
                            if (success > 0) fetchBrands();
                            return { success, failed };
                        }}
                    />
                    <Button onClick={openCreate} className="font-bold uppercase tracking-wider rounded-sm" data-testid="add-brand-btn">
                        <Plus className="w-4 h-4 mr-2" /> Add Brand
                    </Button>
                </div>
            </div>

            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                <DialogContent className="bg-card border-border rounded-sm max-w-sm">
                    <DialogHeader>
                        <DialogTitle className="font-display text-xl font-bold tracking-tight uppercase">
                            {editingId ? 'Edit Brand' : 'Add Brand'}
                        </DialogTitle>
                    </DialogHeader>
                    <Form {...form}>
                        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 mt-4" noValidate>
                            <FormField
                                control={form.control}
                                name="name"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel className={LABEL_CLASS}>Brand Name *</FormLabel>
                                        <FormControl>
                                            <Input {...field} placeholder="e.g., SYNCOAT PREMIUM" className="bg-background border-input rounded-sm" data-testid="brand-name-input" />
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                            <Button type="submit" className="w-full font-bold uppercase tracking-wider rounded-sm" disabled={isSubmitting} data-testid="submit-brand">
                                {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : (editingId ? 'Update Brand' : 'Add Brand')}
                            </Button>
                        </form>
                    </Form>
                </DialogContent>
            </Dialog>

            <ConfirmDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)} title="Delete Brand?" description="This will permanently remove this brand. Existing entries using this brand will not be affected." onConfirm={handleDelete} />

            <Card className="industrial-card">
                <CardHeader className="flex flex-row items-center justify-between">
                    <CardTitle className="font-display text-xl font-bold tracking-tight uppercase">Brand Management</CardTitle>
                    <Badge variant="outline">{brands.length} brands</Badge>
                </CardHeader>
                <TableSearch
                    searchValue={searchTerm}
                    onSearchChange={setSearchTerm}
                    searchPlaceholder="Search brands..."
                    onClear={() => setSearchTerm('')}
                    resultCount={filteredBrands.length}
                    totalCount={brands.length}
                />
                <CardContent className="p-0">
                    {loading ? (
                        <div className="flex items-center justify-center h-48"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
                    ) : filteredBrands.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-48 text-muted-foreground"><AlertCircle className="w-8 h-8 mb-2" /><p>{brands.length === 0 ? 'No brands found' : 'No matching brands'}</p></div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="data-table" data-testid="brands-table">
                                <thead><tr><th>#</th><th>Name</th><th>LWBF</th><th>Created</th><th></th></tr></thead>
                                <tbody>
                                    {paginatedBrands.map((brand, idx) => (
                                        <tr key={brand.id} data-testid={`brand-row-${brand.id}`}>
                                            <td className="text-muted-foreground">{startIndex + idx + 1}</td>
                                            <td className="font-bold uppercase tracking-wider">
                                                <div className="flex items-center gap-2">
                                                    <Tag className="w-4 h-4 text-primary" />
                                                    {brand.name}
                                                </div>
                                            </td>
                                            <td>
                                                <Switch checked={brand.is_lwbf || false} onCheckedChange={async (v) => {
                                                    try { await brandsAPI.update(brand.id, { is_lwbf: v }); fetchBrands(); }
                                                    catch (err) { toast.error(getErrorMessage(err, 'Failed to update')); }
                                                }} />
                                            </td>
                                            <td className="text-muted-foreground">{formatDate(brand.created_at)}</td>
                                            <td>
                                                <div className="flex gap-1">
                                                    <Button aria-label="Edit brand" variant="ghost" size="icon" onClick={() => openEdit(brand)} className="text-muted-foreground hover:text-primary" data-testid={'edit-brand-' + brand.id}><Pencil className="w-4 h-4" /></Button>
                                                    <Button aria-label="Delete brand" variant="ghost" size="icon" onClick={() => setDeleteTarget(brand.id)} className="text-muted-foreground hover:text-destructive"><Trash2 className="w-4 h-4" /></Button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                    <TablePagination currentPage={currentPage} totalPages={totalPages} pageSize={pageSize} totalItems={filteredBrands.length} startIndex={startIndex} onPageChange={setCurrentPage} onPageSizeChange={setPageSize} pageSizeOptions={PAGE_SIZE_OPTIONS} />
                </CardContent>
            </Card>
        </div>
    );
};

export default Brands;
