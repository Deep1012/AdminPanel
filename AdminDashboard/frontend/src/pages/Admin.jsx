import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '../components/ui/dialog';
import { Badge } from '../components/ui/badge';
import { Switch } from '../components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { usersAPI, brandsAPI, sizesAPI, authAPI } from '../lib/api';
import { formatDate } from '../lib/utils';
import { Plus, Trash2, Users, Tag, Ruler, Loader2, AlertCircle, Lock, Unlock, UserPlus } from 'lucide-react';
import { toast } from 'sonner';

const Admin = () => {
    const [users, setUsers] = useState([]);
    const [brands, setBrands] = useState([]);
    const [sizes, setSizes] = useState([]);
    const [loading, setLoading] = useState(true);
    
    // Dialog states
    const [brandDialogOpen, setBrandDialogOpen] = useState(false);
    const [sizeDialogOpen, setSizeDialogOpen] = useState(false);
    const [userDialogOpen, setUserDialogOpen] = useState(false);
    const [newBrand, setNewBrand] = useState('');
    const [newSize, setNewSize] = useState('');
    const [submitting, setSubmitting] = useState(false);
    
    // New user form
    const [newUser, setNewUser] = useState({ username: '', email: '', password: '', role: 'user' });

    useEffect(() => { fetchData(); }, []);

    const fetchData = async () => {
        try {
            setLoading(true);
            const [usersRes, brandsRes, sizesRes] = await Promise.all([
                usersAPI.getAll(),
                brandsAPI.getAll(),
                sizesAPI.getAll()
            ]);
            setUsers(usersRes.data);
            setBrands(brandsRes.data);
            setSizes(sizesRes.data);
        } catch (err) {
            toast.error('Failed to load data');
        } finally {
            setLoading(false);
        }
    };

    // User management
    const handleCreateUser = async (e) => {
        e.preventDefault();
        if (!newUser.username || !newUser.email || !newUser.password) {
            toast.error('Please fill all fields');
            return;
        }
        setSubmitting(true);
        try {
            await authAPI.register(newUser);
            toast.success(`User created! Share credentials: ${newUser.email} / ${newUser.password}`);
            setUserDialogOpen(false);
            setNewUser({ username: '', email: '', password: '', role: 'user' });
            fetchData();
        } catch (err) {
            toast.error(err.response?.data?.detail || 'Failed to create user');
        } finally {
            setSubmitting(false);
        }
    };

    const handleToggleLock = async (userId, currentLock) => {
        try {
            await usersAPI.update(userId, { is_locked: !currentLock });
            toast.success(`User ${!currentLock ? 'locked' : 'unlocked'}`);
            fetchData();
        } catch (err) {
            toast.error('Failed to update user');
        }
    };

    const handleDeleteUser = async (userId) => {
        if (!window.confirm('Delete this user?')) return;
        try {
            await usersAPI.delete(userId);
            toast.success('User deleted');
            fetchData();
        } catch (err) {
            toast.error('Failed to delete user');
        }
    };

    // Brand management
    const handleAddBrand = async (e) => {
        e.preventDefault();
        if (!newBrand.trim()) { toast.error('Enter brand name'); return; }
        setSubmitting(true);
        try {
            await brandsAPI.create({ name: newBrand.trim().toUpperCase() });
            toast.success('Brand added');
            setNewBrand('');
            setBrandDialogOpen(false);
            fetchData();
        } catch (err) {
            toast.error('Failed to add brand');
        } finally {
            setSubmitting(false);
        }
    };

    const handleDeleteBrand = async (brandId) => {
        if (!window.confirm('Delete this brand?')) return;
        try {
            await brandsAPI.delete(brandId);
            toast.success('Brand deleted');
            fetchData();
        } catch (err) {
            toast.error('Failed to delete brand');
        }
    };

    // Size management
    const handleAddSize = async (e) => {
        e.preventDefault();
        if (!newSize.trim()) { toast.error('Enter size'); return; }
        setSubmitting(true);
        try {
            await sizesAPI.create({ name: newSize.trim().toUpperCase() });
            toast.success('Size added');
            setNewSize('');
            setSizeDialogOpen(false);
            fetchData();
        } catch (err) {
            toast.error('Failed to add size');
        } finally {
            setSubmitting(false);
        }
    };

    const handleDeleteSize = async (sizeId) => {
        if (!window.confirm('Delete this size?')) return;
        try {
            await sizesAPI.delete(sizeId);
            toast.success('Size deleted');
            fetchData();
        } catch (err) {
            toast.error('Failed to delete size');
        }
    };

    if (loading) return <div className="flex items-center justify-center h-64"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;

    return (
        <div className="space-y-6 animate-fade-in" data-testid="admin-page">
            <p className="text-muted-foreground">Manage users, brands, and container sizes</p>

            <Tabs defaultValue="users" className="space-y-6">
                <TabsList className="bg-secondary/50 rounded-sm">
                    <TabsTrigger value="users" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground rounded-sm font-bold uppercase tracking-wider text-sm">
                        <Users className="w-4 h-4 mr-2" /> Users
                    </TabsTrigger>
                    <TabsTrigger value="brands" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground rounded-sm font-bold uppercase tracking-wider text-sm">
                        <Tag className="w-4 h-4 mr-2" /> Brands
                    </TabsTrigger>
                    <TabsTrigger value="sizes" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground rounded-sm font-bold uppercase tracking-wider text-sm">
                        <Ruler className="w-4 h-4 mr-2" /> Sizes
                    </TabsTrigger>
                </TabsList>

                {/* Users Tab */}
                <TabsContent value="users">
                    <Card className="industrial-card">
                        <CardHeader className="flex flex-row items-center justify-between">
                            <CardTitle className="font-display text-xl font-bold tracking-tight uppercase">User Management</CardTitle>
                            <div className="flex items-center gap-2">
                                <Badge variant="outline">{users.length} users</Badge>
                                <Dialog open={userDialogOpen} onOpenChange={setUserDialogOpen}>
                                    <DialogTrigger asChild>
                                        <Button size="sm" className="font-bold uppercase tracking-wider rounded-sm" data-testid="add-user-btn">
                                            <UserPlus className="w-4 h-4 mr-1" /> Add User
                                        </Button>
                                    </DialogTrigger>
                                    <DialogContent className="bg-card border-border rounded-sm max-w-md">
                                        <DialogHeader>
                                            <DialogTitle className="font-display text-xl font-bold tracking-tight uppercase">Create New User</DialogTitle>
                                        </DialogHeader>
                                        <form onSubmit={handleCreateUser} className="space-y-4 mt-4">
                                            <div className="space-y-2">
                                                <Label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Username *</Label>
                                                <Input value={newUser.username} onChange={(e) => setNewUser({...newUser, username: e.target.value})} placeholder="John Doe" className="bg-background border-input rounded-sm" data-testid="new-user-name" />
                                            </div>
                                            <div className="space-y-2">
                                                <Label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Email *</Label>
                                                <Input type="email" value={newUser.email} onChange={(e) => setNewUser({...newUser, email: e.target.value})} placeholder="user@company.com" className="bg-background border-input rounded-sm" data-testid="new-user-email" />
                                            </div>
                                            <div className="space-y-2">
                                                <Label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Password *</Label>
                                                <Input type="text" value={newUser.password} onChange={(e) => setNewUser({...newUser, password: e.target.value})} placeholder="Create password" className="bg-background border-input rounded-sm font-mono" data-testid="new-user-password" />
                                            </div>
                                            <div className="space-y-2">
                                                <Label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Role</Label>
                                                <Select value={newUser.role} onValueChange={(v) => setNewUser({...newUser, role: v})}>
                                                    <SelectTrigger className="bg-background border-input rounded-sm">
                                                        <SelectValue />
                                                    </SelectTrigger>
                                                    <SelectContent className="bg-card border-border rounded-sm">
                                                        <SelectItem value="user">User</SelectItem>
                                                        <SelectItem value="admin">Admin</SelectItem>
                                                    </SelectContent>
                                                </Select>
                                            </div>
                                            <div className="p-3 bg-primary/10 rounded-sm border border-primary/20 text-sm">
                                                <p className="font-bold text-primary">Share these credentials with the user:</p>
                                                <p className="font-mono mt-1">Email: {newUser.email || '...'}</p>
                                                <p className="font-mono">Password: {newUser.password || '...'}</p>
                                            </div>
                                            <Button type="submit" className="w-full font-bold uppercase tracking-wider rounded-sm" disabled={submitting}>
                                                {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Create User'}
                                            </Button>
                                        </form>
                                    </DialogContent>
                                </Dialog>
                            </div>
                        </CardHeader>
                        <CardContent className="p-0">
                            {users.length === 0 ? (
                                <div className="flex flex-col items-center justify-center h-48 text-muted-foreground"><AlertCircle className="w-8 h-8 mb-2" /><p>No users</p></div>
                            ) : (
                                <div className="overflow-x-auto">
                                    <table className="data-table" data-testid="users-table">
                                        <thead><tr><th>Username</th><th>Email</th><th>Role</th><th>Created</th><th>Locked</th><th></th></tr></thead>
                                        <tbody>
                                            {users.map((user) => (
                                                <tr key={user.id}>
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
                                                    <td><Button variant="ghost" size="icon" onClick={() => handleDeleteUser(user.id)} className="text-muted-foreground hover:text-destructive"><Trash2 className="w-4 h-4" /></Button></td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </TabsContent>

                {/* Brands Tab */}
                <TabsContent value="brands">
                    <Card className="industrial-card">
                        <CardHeader className="flex flex-row items-center justify-between">
                            <CardTitle className="font-display text-xl font-bold tracking-tight uppercase">Brand Management</CardTitle>
                            <div className="flex items-center gap-2">
                                <Badge variant="outline">{brands.length} brands</Badge>
                                <Dialog open={brandDialogOpen} onOpenChange={setBrandDialogOpen}>
                                    <DialogTrigger asChild>
                                        <Button size="sm" className="font-bold uppercase tracking-wider rounded-sm"><Plus className="w-4 h-4 mr-1" /> Add</Button>
                                    </DialogTrigger>
                                    <DialogContent className="bg-card border-border rounded-sm max-w-sm">
                                        <DialogHeader><DialogTitle className="font-display text-xl font-bold tracking-tight uppercase">Add Brand</DialogTitle></DialogHeader>
                                        <form onSubmit={handleAddBrand} className="space-y-4 mt-4">
                                            <div className="space-y-2">
                                                <Label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Brand Name</Label>
                                                <Input value={newBrand} onChange={(e) => setNewBrand(e.target.value)} placeholder="e.g., SYNCOAT PREMIUM" className="bg-background border-input rounded-sm" />
                                            </div>
                                            <Button type="submit" className="w-full font-bold uppercase tracking-wider rounded-sm" disabled={submitting}>
                                                {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Add Brand'}
                                            </Button>
                                        </form>
                                    </DialogContent>
                                </Dialog>
                            </div>
                        </CardHeader>
                        <CardContent>
                            <div className="flex flex-wrap gap-2 max-h-96 overflow-y-auto">
                                {brands.map((brand) => (
                                    <Badge key={brand.id} variant="secondary" className="px-3 py-2 text-sm flex items-center gap-2">
                                        {brand.name}
                                        <button onClick={() => handleDeleteBrand(brand.id)} className="hover:text-destructive"><Trash2 className="w-3 h-3" /></button>
                                    </Badge>
                                ))}
                            </div>
                        </CardContent>
                    </Card>
                </TabsContent>

                {/* Sizes Tab */}
                <TabsContent value="sizes">
                    <Card className="industrial-card">
                        <CardHeader className="flex flex-row items-center justify-between">
                            <CardTitle className="font-display text-xl font-bold tracking-tight uppercase">Size Management</CardTitle>
                            <div className="flex items-center gap-2">
                                <Badge variant="outline">{sizes.length} sizes</Badge>
                                <Dialog open={sizeDialogOpen} onOpenChange={setSizeDialogOpen}>
                                    <DialogTrigger asChild>
                                        <Button size="sm" className="font-bold uppercase tracking-wider rounded-sm"><Plus className="w-4 h-4 mr-1" /> Add</Button>
                                    </DialogTrigger>
                                    <DialogContent className="bg-card border-border rounded-sm max-w-sm">
                                        <DialogHeader><DialogTitle className="font-display text-xl font-bold tracking-tight uppercase">Add Size</DialogTitle></DialogHeader>
                                        <form onSubmit={handleAddSize} className="space-y-4 mt-4">
                                            <div className="space-y-2">
                                                <Label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Size Name</Label>
                                                <Input value={newSize} onChange={(e) => setNewSize(e.target.value)} placeholder="e.g., 2LTR" className="bg-background border-input rounded-sm" />
                                            </div>
                                            <Button type="submit" className="w-full font-bold uppercase tracking-wider rounded-sm" disabled={submitting}>
                                                {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Add Size'}
                                            </Button>
                                        </form>
                                    </DialogContent>
                                </Dialog>
                            </div>
                        </CardHeader>
                        <CardContent>
                            <div className="flex flex-wrap gap-2">
                                {sizes.map((size) => (
                                    <Badge key={size.id} variant="outline" className="px-4 py-2 text-sm flex items-center gap-2 border-primary/30">
                                        {size.name}
                                        <button onClick={() => handleDeleteSize(size.id)} className="hover:text-destructive"><Trash2 className="w-3 h-3" /></button>
                                    </Badge>
                                ))}
                            </div>
                        </CardContent>
                    </Card>
                </TabsContent>
            </Tabs>
        </div>
    );
};

export default Admin;
