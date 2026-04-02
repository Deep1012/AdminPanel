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
import { sizesAPI } from '../lib/api';
import { formatDate } from '../lib/utils';
import { Plus, Trash2, Pencil, Ruler, Loader2, AlertCircle, Download } from 'lucide-react';
import { toast } from 'sonner';
import { exportToExcel } from '../lib/exportToExcel';
import ImportExcelButton from '../components/ImportExcelButton';

const SIZES_EXPORT_COLUMNS = [
    { header: '#', key: 'id', transform: (v, row, idx) => idx + 1 },
    { header: 'Name', key: 'name' },
    { header: 'Created', key: 'created_at', transform: (v) => formatDate(v) },
];

const Sizes = () => {
    const [sizes, setSizes] = useState([]);
    const [loading, setLoading] = useState(true);
    const [dialogOpen, setDialogOpen] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [editingId, setEditingId] = useState(null);
    const [sizeName, setSizeName] = useState('');
    const [deleteTarget, setDeleteTarget] = useState(null);
    const [searchTerm, setSearchTerm] = useState('');

    const filteredSizes = useTableFilter({
        data: sizes, searchTerm, searchFields: ['name'], filters: []
    });

    const { paginatedData: paginatedSizes, currentPage, totalPages, pageSize, setCurrentPage, setPageSize, startIndex, PAGE_SIZE_OPTIONS } = usePagination({ data: filteredSizes });

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
                <div className="flex gap-2">
                    <Button variant="outline" onClick={() => {
                        const data = filteredSizes;
                        if (exportToExcel({ data, columns: SIZES_EXPORT_COLUMNS, fileName: 'Sizes', sheetName: 'Sizes' })) toast.success('Exported to Excel');
                        else toast.error('No data to export');
                    }} className="font-bold uppercase tracking-wider rounded-sm" data-testid="export-sizes-btn">
                        <Download className="w-4 h-4 mr-2" /> Export
                    </Button>
                    <ImportExcelButton
                        columns={[{ header: 'Name', key: 'name' }]}
                        templateName="Sizes"
                        onImport={async (rows, onProgress) => {
                            let success = 0, failed = 0;
                            for (const row of rows) {
                                try { if (row.name) { await sizesAPI.create({ name: String(row.name).trim() }); success++; } else failed++; }
                                catch { failed++; }
                                onProgress(success + failed);
                            }
                            if (success > 0) fetchSizes();
                            return { success, failed };
                        }}
                    />
                    <Button onClick={openCreate} className="font-bold uppercase tracking-wider rounded-sm" data-testid="add-size-btn">
                        <Plus className="w-4 h-4 mr-2" /> Add Size
                    </Button>
                </div>
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
                <TableSearch
                    searchValue={searchTerm}
                    onSearchChange={setSearchTerm}
                    searchPlaceholder="Search sizes..."
                    onClear={() => setSearchTerm('')}
                    resultCount={filteredSizes.length}
                    totalCount={sizes.length}
                />
                <CardContent className="p-0">
                    {loading ? (
                        <div className="flex items-center justify-center h-48"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
                    ) : filteredSizes.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-48 text-muted-foreground"><AlertCircle className="w-8 h-8 mb-2" /><p>{sizes.length === 0 ? 'No sizes found' : 'No matching sizes'}</p></div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="data-table" data-testid="sizes-table">
                                <thead><tr><th>#</th><th>Name</th><th>Created</th><th></th></tr></thead>
                                <tbody>
                                    {paginatedSizes.map((size, idx) => (
                                        <tr key={size.id} data-testid={`size-row-${size.id}`}>
                                            <td className="text-muted-foreground">{startIndex + idx + 1}</td>
                                            <td className="font-bold uppercase tracking-wider">
                                                <div className="flex items-center gap-2">
                                                    <Ruler className="w-4 h-4 text-primary" />
                                                    {size.name}
                                                </div>
                                            </td>
                                            <td className="text-muted-foreground">{formatDate(size.created_at)}</td>
                                            <td>
                                                <div className="flex gap-1">
                                                    <Button variant="ghost" size="icon" onClick={() => openEdit(size)} className="text-muted-foreground hover:text-primary"><Pencil className="w-4 h-4" /></Button>
                                                    <Button variant="ghost" size="icon" onClick={() => setDeleteTarget(size.id)} className="text-muted-foreground hover:text-destructive"><Trash2 className="w-4 h-4" /></Button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                    <TablePagination currentPage={currentPage} totalPages={totalPages} pageSize={pageSize} totalItems={filteredSizes.length} startIndex={startIndex} onPageChange={setCurrentPage} onPageSizeChange={setPageSize} pageSizeOptions={PAGE_SIZE_OPTIONS} />
                </CardContent>
            </Card>
        </div>
    );
};

export default Sizes;
