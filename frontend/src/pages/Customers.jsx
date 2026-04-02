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
import { customersAPI } from '../lib/api';
import { formatDate } from '../lib/utils';
import { Plus, Trash2, Pencil, Users, Loader2, AlertCircle, Download } from 'lucide-react';
import { toast } from 'sonner';
import { exportToExcel } from '../lib/exportToExcel';
import ImportExcelButton from '../components/ImportExcelButton';

const CUSTOMERS_EXPORT_COLUMNS = [
    { header: '#', key: 'id', transform: (v, row, idx) => idx + 1 },
    { header: 'Name', key: 'name' },
    { header: 'Created', key: 'created_at', transform: (v) => formatDate(v) },
];

const Customers = () => {
    const [customers, setCustomers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [dialogOpen, setDialogOpen] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [editingId, setEditingId] = useState(null);
    const [customerName, setCustomerName] = useState('');
    const [deleteTarget, setDeleteTarget] = useState(null);
    const [searchTerm, setSearchTerm] = useState('');

    const filteredCustomers = useTableFilter({
        data: customers, searchTerm, searchFields: ['name'], filters: []
    });

    const { paginatedData: paginatedCustomers, currentPage, totalPages, pageSize, setCurrentPage, setPageSize, startIndex, PAGE_SIZE_OPTIONS } = usePagination({ data: filteredCustomers });

    useEffect(() => { fetchCustomers(); }, []);

    const fetchCustomers = async () => {
        try { setLoading(true); const res = await customersAPI.getAll(); setCustomers(res.data); }
        catch (err) { toast.error('Failed to load customers'); }
        finally { setLoading(false); }
    };

    const openCreate = () => { setEditingId(null); setCustomerName(''); setDialogOpen(true); };
    const openEdit = (customer) => { setEditingId(customer.id); setCustomerName(customer.name); setDialogOpen(true); };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!customerName.trim()) { toast.error('Enter customer name'); return; }
        setSubmitting(true);
        try {
            if (editingId) {
                await customersAPI.update(editingId, { name: customerName.trim() });
                toast.success('Customer updated');
            } else {
                await customersAPI.create({ name: customerName.trim() });
                toast.success('Customer added');
            }
            setDialogOpen(false);
            fetchCustomers();
        } catch (err) { toast.error(err.response?.data?.detail || 'Failed to save customer'); }
        finally { setSubmitting(false); }
    };

    const handleDelete = async () => {
        if (!deleteTarget) return;
        try { await customersAPI.delete(deleteTarget); toast.success('Customer deleted'); fetchCustomers(); }
        catch (err) { toast.error('Failed to delete customer'); }
        finally { setDeleteTarget(null); }
    };

    return (
        <div className="space-y-6 animate-fade-in" data-testid="customers-page">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <p className="text-muted-foreground">Manage customers for dispatch and purchase orders</p>
                <div className="flex gap-2">
                    <Button variant="outline" onClick={() => {
                        const data = filteredCustomers.length > 0 ? filteredCustomers : customers;
                        if (exportToExcel({ data, columns: CUSTOMERS_EXPORT_COLUMNS, fileName: 'Customers', sheetName: 'Customers' })) toast.success('Exported to Excel');
                        else toast.error('No data to export');
                    }} className="font-bold uppercase tracking-wider rounded-sm" data-testid="export-customers-btn">
                        <Download className="w-4 h-4 mr-2" /> Export
                    </Button>
                    <ImportExcelButton
                        columns={[{ header: 'Name', key: 'name' }]}
                        templateName="Customers"
                        onImport={async (rows) => {
                            let success = 0, failed = 0;
                            for (const row of rows) {
                                try { if (row.name) { await customersAPI.create({ name: String(row.name).trim() }); success++; } else failed++; }
                                catch { failed++; }
                            }
                            if (success > 0) fetchCustomers();
                            return { success, failed };
                        }}
                    />
                    <Button onClick={openCreate} className="font-bold uppercase tracking-wider rounded-sm" data-testid="add-customer-btn">
                        <Plus className="w-4 h-4 mr-2" /> Add Customer
                    </Button>
                </div>
            </div>

            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                <DialogContent className="bg-card border-border rounded-sm max-w-sm">
                    <DialogHeader>
                        <DialogTitle className="font-display text-xl font-bold tracking-tight uppercase">
                            {editingId ? 'Edit Customer' : 'Add Customer'}
                        </DialogTitle>
                    </DialogHeader>
                    <form onSubmit={handleSubmit} className="space-y-4 mt-4">
                        <div className="space-y-2">
                            <Label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Customer Name *</Label>
                            <Input value={customerName} onChange={(e) => setCustomerName(e.target.value)} placeholder="e.g., Mehta Paints & Hardware" className="bg-background border-input rounded-sm" data-testid="customer-name-input" />
                        </div>
                        <Button type="submit" className="w-full font-bold uppercase tracking-wider rounded-sm" disabled={submitting} data-testid="submit-customer">
                            {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : (editingId ? 'Update Customer' : 'Add Customer')}
                        </Button>
                    </form>
                </DialogContent>
            </Dialog>

            <ConfirmDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)} title="Delete Customer?" description="This will permanently remove this customer." onConfirm={handleDelete} />

            <Card className="industrial-card">
                <CardHeader className="flex flex-row items-center justify-between">
                    <CardTitle className="font-display text-xl font-bold tracking-tight uppercase">Customer Management</CardTitle>
                    <Badge variant="outline">{customers.length} customers</Badge>
                </CardHeader>
                <TableSearch
                    searchValue={searchTerm}
                    onSearchChange={setSearchTerm}
                    searchPlaceholder="Search customers..."
                    onClear={() => setSearchTerm('')}
                    resultCount={filteredCustomers.length}
                    totalCount={customers.length}
                />
                <CardContent className="p-0">
                    {loading ? (
                        <div className="flex items-center justify-center h-48"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
                    ) : filteredCustomers.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-48 text-muted-foreground"><AlertCircle className="w-8 h-8 mb-2" /><p>{customers.length === 0 ? 'No customers found' : 'No matching customers'}</p></div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="data-table" data-testid="customers-table">
                                <thead><tr><th>#</th><th>Name</th><th>Created</th><th></th></tr></thead>
                                <tbody>
                                    {paginatedCustomers.map((customer, idx) => (
                                        <tr key={customer.id} data-testid={`customer-row-${customer.id}`}>
                                            <td className="text-muted-foreground">{startIndex + idx + 1}</td>
                                            <td className="font-bold">
                                                <div className="flex items-center gap-2">
                                                    <Users className="w-4 h-4 text-primary" />
                                                    {customer.name}
                                                </div>
                                            </td>
                                            <td className="text-muted-foreground">{formatDate(customer.created_at)}</td>
                                            <td>
                                                <div className="flex gap-1">
                                                    <Button variant="ghost" size="icon" onClick={() => openEdit(customer)} className="text-muted-foreground hover:text-primary"><Pencil className="w-4 h-4" /></Button>
                                                    <Button variant="ghost" size="icon" onClick={() => setDeleteTarget(customer.id)} className="text-muted-foreground hover:text-destructive"><Trash2 className="w-4 h-4" /></Button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                    <TablePagination currentPage={currentPage} totalPages={totalPages} pageSize={pageSize} totalItems={filteredCustomers.length} startIndex={startIndex} onPageChange={setCurrentPage} onPageSizeChange={setPageSize} pageSizeOptions={PAGE_SIZE_OPTIONS} />
                </CardContent>
            </Card>
        </div>
    );
};

export default Customers;
