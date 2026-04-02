import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
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

const BRANDS_EXPORT_COLUMNS = [
    { header: '#', key: 'id', transform: (v, row, idx) => idx + 1 },
    { header: 'Name', key: 'name' },
    { header: 'Created', key: 'created_at', transform: (v) => formatDate(v) },
];

const Brands = () => {
    const [brands, setBrands] = useState([]);
    const [loading, setLoading] = useState(true);
    const [dialogOpen, setDialogOpen] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [editingId, setEditingId] = useState(null);
    const [brandName, setBrandName] = useState('');
    const [deleteTarget, setDeleteTarget] = useState(null);
    const [searchTerm, setSearchTerm] = useState('');

    const filteredBrands = useTableFilter({
        data: brands, searchTerm, searchFields: ['name'], filters: []
    });

    const { paginatedData: paginatedBrands, currentPage, totalPages, pageSize, setCurrentPage, setPageSize, startIndex, PAGE_SIZE_OPTIONS } = usePagination({ data: filteredBrands });

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
                <div className="flex gap-2">
                    <Button variant="outline" onClick={() => {
                        const data = filteredBrands;
                        if (exportToExcel({ data, columns: BRANDS_EXPORT_COLUMNS, fileName: 'Brands', sheetName: 'Brands' })) toast.success('Exported to Excel');
                        else toast.error('No data to export');
                    }} className="font-bold uppercase tracking-wider rounded-sm" data-testid="export-brands-btn">
                        <Download className="w-4 h-4 mr-2" /> Export
                    </Button>
                    <ImportExcelButton
                        columns={[{ header: 'Name', key: 'name' }]}
                        templateName="Brands"
                        onImport={async (rows) => {
                            let success = 0, failed = 0;
                            for (const row of rows) {
                                try { if (row.name) { await brandsAPI.create({ name: String(row.name).trim() }); success++; } else failed++; }
                                catch { failed++; }
                            }
                            if (success > 0) fetchData();
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
                                                    catch { toast.error('Failed to update'); }
                                                }} />
                                            </td>
                                            <td className="text-muted-foreground">{formatDate(brand.created_at)}</td>
                                            <td>
                                                <div className="flex gap-1">
                                                    <Button variant="ghost" size="icon" onClick={() => openEdit(brand)} className="text-muted-foreground hover:text-primary"><Pencil className="w-4 h-4" /></Button>
                                                    <Button variant="ghost" size="icon" onClick={() => setDeleteTarget(brand.id)} className="text-muted-foreground hover:text-destructive"><Trash2 className="w-4 h-4" /></Button>
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
