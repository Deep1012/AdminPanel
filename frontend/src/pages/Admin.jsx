import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../components/ui/dialog';
import { Badge } from '../components/ui/badge';
import { Switch } from '../components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import ConfirmDialog from '../components/ConfirmDialog';
import TableSearch from '../components/TableSearch';
import TablePagination from '../components/TablePagination';
import { useTableFilter } from '../hooks/useTableFilter';
import { usePagination } from '../hooks/usePagination';
import { usersAPI, authAPI, adminAPI } from '../lib/api';
import { formatDate } from '../lib/utils';
import { Trash2, Pencil, Loader2, AlertCircle, Lock, Unlock, UserPlus, Download, DatabaseZap } from 'lucide-react';
import { toast } from 'sonner';
import { exportToExcel } from '../lib/exportToExcel';

const USERS_EXPORT_COLUMNS = [
    { header: 'Username', key: 'username' },
    { header: 'Email', key: 'email' },
    { header: 'Role', key: 'role' },
    { header: 'Created', key: 'created_at', transform: (v) => formatDate(v) },
    { header: 'Locked', key: 'is_locked', transform: (v) => v ? 'Yes' : 'No' },
];

const emptyUser = { username: '', email: '', password: '', role: 'user' };

const Admin = () => {
    const [users, setUsers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [dialogOpen, setDialogOpen] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [editingId, setEditingId] = useState(null);
    const [formData, setFormData] = useState({ ...emptyUser });
    const [deleteTarget, setDeleteTarget] = useState(null);
    const [clearDataOpen, setClearDataOpen] = useState(false);
    const [clearing, setClearing] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');

    const filteredUsers = useTableFilter({
        data: users, searchTerm, searchFields: ['username', 'email'], filters: []
    });

    const { paginatedData: paginatedUsers, currentPage, totalPages, pageSize, setCurrentPage, setPageSize, startIndex, PAGE_SIZE_OPTIONS } = usePagination({ data: filteredUsers });

    useEffect(() => { fetchData(); }, []);

    const fetchData = async () => {
        try { setLoading(true); const res = await usersAPI.getAll(); setUsers(res.data); }
        catch (err) { toast.error('Failed to load users'); }
        finally { setLoading(false); }
    };

    const openCreate = () => { setEditingId(null); setFormData({ ...emptyUser }); setDialogOpen(true); };
    const openEdit = (user) => {
        setEditingId(user.id);
        setFormData({ username: user.username, email: user.email, password: '', role: user.role });
        setDialogOpen(true);
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!formData.username || !formData.email) { toast.error('Please fill required fields'); return; }
        if (!editingId && !formData.password) { toast.error('Password is required for new users'); return; }
        setSubmitting(true);
        try {
            if (editingId) {
                const payload = { username: formData.username, email: formData.email, role: formData.role };
                if (formData.password) payload.password = formData.password;
                await usersAPI.update(editingId, payload);
                toast.success('User updated');
            } else {
                await authAPI.register(formData);
                toast.success(`User created! Credentials: ${formData.email} / ${formData.password}`);
            }
            setDialogOpen(false); fetchData();
        } catch (err) { toast.error(err.response?.data?.detail || 'Failed to save user'); }
        finally { setSubmitting(false); }
    };

    const handleToggleLock = async (userId, currentLock) => {
        try { await usersAPI.update(userId, { is_locked: !currentLock }); toast.success(`User ${!currentLock ? 'locked' : 'unlocked'}`); fetchData(); }
        catch (err) { toast.error('Failed to update user'); }
    };

    const handleDelete = async () => {
        if (!deleteTarget) return;
        try { await usersAPI.delete(deleteTarget); toast.success('User deleted'); fetchData(); }
        catch (err) { toast.error('Failed to delete user'); }
        finally { setDeleteTarget(null); }
    };

    const handleClearData = async () => {
        setClearing(true);
        try {
            const res = await adminAPI.clearOperationalData();
            const d = res.data.deleted;
            toast.success(`Cleared: ${d.purchases} purchases, ${d.printingJobs} jobs, ${d.production} production, ${d.dispatches} dispatches, ${d.purchaseOrders} POs`);
            setClearDataOpen(false);
        } catch (err) { toast.error(err.response?.data?.detail || 'Failed to clear data'); }
        finally { setClearing(false); }
    };

    if (loading) return <div className="flex items-center justify-center h-64"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;

    return (
        <div className="space-y-6 animate-fade-in" data-testid="admin-page">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <p className="text-muted-foreground">Manage system users and access control</p>
                <div className="flex gap-2">
                    <Button variant="destructive" onClick={() => setClearDataOpen(true)} className="font-bold uppercase tracking-wider rounded-sm" data-testid="clear-data-btn">
                        <DatabaseZap className="w-4 h-4 mr-2" /> Clear Data
                    </Button>
                    <Button variant="outline" onClick={() => {
                        const data = filteredUsers;
                        if (exportToExcel({ data, columns: USERS_EXPORT_COLUMNS, fileName: 'Users', sheetName: 'Users' })) toast.success('Exported to Excel');
                        else toast.error('No data to export');
                    }} className="font-bold uppercase tracking-wider rounded-sm" data-testid="export-users-btn">
                        <Download className="w-4 h-4 mr-2" /> Export
                    </Button>
                    <Button onClick={openCreate} className="font-bold uppercase tracking-wider rounded-sm" data-testid="add-user-btn">
                        <UserPlus className="w-4 h-4 mr-2" /> Add User
                    </Button>
                </div>
            </div>

            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                <DialogContent className="bg-card border-border rounded-sm max-w-md">
                    <DialogHeader>
                        <DialogTitle className="font-display text-xl font-bold tracking-tight uppercase">
                            {editingId ? 'Edit User' : 'Create New User'}
                        </DialogTitle>
                    </DialogHeader>
                    <form onSubmit={handleSubmit} className="space-y-4 mt-4">
                        <div className="space-y-2">
                            <Label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Username *</Label>
                            <Input value={formData.username} onChange={(e) => setFormData({ ...formData, username: e.target.value })} placeholder="John Doe" className="bg-background border-input rounded-sm" data-testid="new-user-name" />
                        </div>
                        <div className="space-y-2">
                            <Label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Email *</Label>
                            <Input type="email" value={formData.email} onChange={(e) => setFormData({ ...formData, email: e.target.value })} placeholder="user@company.com" className="bg-background border-input rounded-sm" data-testid="new-user-email" />
                        </div>
                        <div className="space-y-2">
                            <Label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                                Password {editingId ? '(leave blank to keep current)' : '*'}
                            </Label>
                            <Input type="text" value={formData.password} onChange={(e) => setFormData({ ...formData, password: e.target.value })} placeholder={editingId ? '--------' : 'Create password'} className="bg-background border-input rounded-sm font-mono" data-testid="new-user-password" />
                        </div>
                        <div className="space-y-2">
                            <Label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Role</Label>
                            <Select value={formData.role} onValueChange={(v) => setFormData({ ...formData, role: v })}>
                                <SelectTrigger className="bg-background border-input rounded-sm"><SelectValue /></SelectTrigger>
                                <SelectContent className="bg-card border-border rounded-sm">
                                    <SelectItem value="user">User</SelectItem>
                                    <SelectItem value="admin">Admin</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        {!editingId && (
                            <div className="p-3 bg-primary/10 rounded-sm border border-primary/20 text-sm">
                                <p className="font-bold text-primary">Share these credentials with the user:</p>
                                <p className="font-mono mt-1">Email: {formData.email || '...'}</p>
                                <p className="font-mono">Password: {formData.password || '...'}</p>
                            </div>
                        )}
                        <Button type="submit" className="w-full font-bold uppercase tracking-wider rounded-sm" disabled={submitting}>
                            {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : (editingId ? 'Update User' : 'Create User')}
                        </Button>
                    </form>
                </DialogContent>
            </Dialog>

            <ConfirmDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)} title="Delete User?" description="This will permanently remove this user account." onConfirm={handleDelete} />
            <ConfirmDialog open={clearDataOpen} onOpenChange={setClearDataOpen} title="Clear ALL Operational Data?" description="This will permanently delete ALL purchases, printing jobs, production records, dispatches, and purchase orders. Brands, sizes, customers, and users will NOT be affected. This action cannot be undone." onConfirm={handleClearData} confirmText={clearing ? 'Clearing...' : 'Clear All Data'} />

            <Card className="industrial-card">
                <CardHeader className="flex flex-row items-center justify-between">
                    <CardTitle className="font-display text-xl font-bold tracking-tight uppercase">User Management</CardTitle>
                    <Badge variant="outline">{users.length} users</Badge>
                </CardHeader>
                <TableSearch
                    searchValue={searchTerm}
                    onSearchChange={setSearchTerm}
                    searchPlaceholder="Search by username, email..."
                    onClear={() => setSearchTerm('')}
                    resultCount={filteredUsers.length}
                    totalCount={users.length}
                />
                <CardContent className="p-0">
                    {filteredUsers.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-48 text-muted-foreground"><AlertCircle className="w-8 h-8 mb-2" /><p>{users.length === 0 ? 'No users' : 'No matching users'}</p></div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="data-table" data-testid="users-table">
                                <thead><tr><th>#</th><th>Username</th><th>Email</th><th>Role</th><th>Created</th><th>Locked</th><th></th></tr></thead>
                                <tbody>
                                    {paginatedUsers.map((user, idx) => (
                                        <tr key={user.id} data-testid={`user-row-${user.id}`}>
                                            <td className="text-muted-foreground">{startIndex + idx + 1}</td>
                                            <td className="font-medium">{user.username}</td>
                                            <td className="font-mono text-muted-foreground">{user.email}</td>
                                            <td><Badge variant={user.role === 'admin' ? 'default' : 'secondary'} className="uppercase">{user.role}</Badge></td>
                                            <td>{formatDate(user.created_at)}</td>
                                            <td>
                                                <div className="flex items-center gap-2">
                                                    {user.is_locked ? <Lock className="w-4 h-4 text-destructive" /> : <Unlock className="w-4 h-4 text-success" />}
                                                    <Switch checked={user.is_locked} onCheckedChange={() => handleToggleLock(user.id, user.is_locked)} />
                                                </div>
                                            </td>
                                            <td>
                                                <div className="flex gap-1">
                                                    <Button variant="ghost" size="icon" onClick={() => openEdit(user)} className="text-muted-foreground hover:text-primary"><Pencil className="w-4 h-4" /></Button>
                                                    <Button variant="ghost" size="icon" onClick={() => setDeleteTarget(user.id)} className="text-muted-foreground hover:text-destructive"><Trash2 className="w-4 h-4" /></Button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                    <TablePagination currentPage={currentPage} totalPages={totalPages} pageSize={pageSize} totalItems={filteredUsers.length} startIndex={startIndex} onPageChange={setCurrentPage} onPageSizeChange={setPageSize} pageSizeOptions={PAGE_SIZE_OPTIONS} />
                </CardContent>
            </Card>
        </div>
    );
};

export default Admin;
