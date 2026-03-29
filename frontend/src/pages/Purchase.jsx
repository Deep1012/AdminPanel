import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '../components/ui/dialog';
import { purchaseAPI } from '../lib/api';
import { formatDate, formatNumber } from '../lib/utils';
import { Plus, Trash2, ShoppingCart, Loader2, AlertCircle, Layers } from 'lucide-react';
import { toast } from 'sonner';

const Purchase = () => {
    const [purchases, setPurchases] = useState([]);
    const [loading, setLoading] = useState(true);
    const [dialogOpen, setDialogOpen] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    
    // Form state
    const [formData, setFormData] = useState({
        sr_no: '',
        gauge: '',
        size1: '',
        size2: '',
        temper: '',
        weight: '',
        supplier: '',
        invoice_number: ''
    });

    useEffect(() => {
        fetchPurchases();
    }, []);

    const fetchPurchases = async () => {
        try {
            setLoading(true);
            const res = await purchaseAPI.getAll();
            setPurchases(res.data);
        } catch (err) {
            toast.error('Failed to load purchases');
        } finally {
            setLoading(false);
        }
    };

    // Calculate No of Sheets preview
    const calculateSheets = () => {
        const gauge = parseFloat(formData.gauge) || 0;
        const size1 = parseFloat(formData.size1) || 0;
        const size2 = parseFloat(formData.size2) || 0;
        const weight = parseFloat(formData.weight) || 0;
        
        if (gauge > 0 && size1 > 0 && size2 > 0 && weight > 0) {
            const divisor = (gauge * size1 * size2 / 100000) * 0.785;
            return Math.floor(weight / divisor);
        }
        return 0;
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!formData.sr_no || !formData.gauge || !formData.size1 || !formData.size2 || !formData.temper || !formData.weight) {
            toast.error('Please fill all required fields');
            return;
        }

        setSubmitting(true);
        try {
            await purchaseAPI.create({
                sr_no: formData.sr_no,
                gauge: parseFloat(formData.gauge),
                size1: parseFloat(formData.size1),
                size2: parseFloat(formData.size2),
                temper: formData.temper,
                weight: parseFloat(formData.weight),
                supplier: formData.supplier || null,
                invoice_number: formData.invoice_number || null
            });
            toast.success('Raw material entry added successfully');
            setDialogOpen(false);
            setFormData({
                sr_no: '',
                gauge: '',
                size1: '',
                size2: '',
                temper: '',
                weight: '',
                supplier: '',
                invoice_number: ''
            });
            fetchPurchases();
        } catch (err) {
            toast.error('Failed to add entry');
        } finally {
            setSubmitting(false);
        }
    };

    const handleDelete = async (id) => {
        if (!window.confirm('Are you sure you want to delete this entry?')) return;
        
        try {
            await purchaseAPI.delete(id);
            toast.success('Entry deleted');
            fetchPurchases();
        } catch (err) {
            toast.error('Failed to delete entry');
        }
    };

    const totalSheets = purchases.reduce((sum, p) => sum + (p.no_of_sheets || 0), 0);
    const totalWeight = purchases.reduce((sum, p) => sum + (p.weight || 0), 0);

    return (
        <div className="space-y-6 animate-fade-in" data-testid="purchase-page">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                    <p className="text-muted-foreground">
                        Manage raw material (metal sheets) purchases
                    </p>
                </div>
                <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                    <DialogTrigger asChild>
                        <Button className="font-bold uppercase tracking-wider rounded-sm" data-testid="add-purchase-btn">
                            <Plus className="w-4 h-4 mr-2" />
                            Add Entry
                        </Button>
                    </DialogTrigger>
                    <DialogContent className="bg-card border-border rounded-sm max-w-lg">
                        <DialogHeader>
                            <DialogTitle className="font-display text-xl font-bold tracking-tight uppercase">
                                Add Raw Material Entry
                            </DialogTitle>
                        </DialogHeader>
                        <form onSubmit={handleSubmit} className="space-y-4 mt-4">
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                                        Sr. No *
                                    </Label>
                                    <Input
                                        value={formData.sr_no}
                                        onChange={(e) => setFormData({...formData, sr_no: e.target.value})}
                                        placeholder="e.g., RM-001"
                                        className="bg-background border-input rounded-sm font-mono"
                                        data-testid="purchase-sr-no"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                                        Gauge *
                                    </Label>
                                    <Input
                                        type="number"
                                        step="0.001"
                                        value={formData.gauge}
                                        onChange={(e) => setFormData({...formData, gauge: e.target.value})}
                                        placeholder="e.g., 0.22"
                                        className="bg-background border-input rounded-sm font-mono"
                                        data-testid="purchase-gauge"
                                    />
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                                        Size 1 *
                                    </Label>
                                    <Input
                                        type="number"
                                        step="0.01"
                                        value={formData.size1}
                                        onChange={(e) => setFormData({...formData, size1: e.target.value})}
                                        placeholder="e.g., 914"
                                        className="bg-background border-input rounded-sm font-mono"
                                        data-testid="purchase-size1"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                                        Size 2 *
                                    </Label>
                                    <Input
                                        type="number"
                                        step="0.01"
                                        value={formData.size2}
                                        onChange={(e) => setFormData({...formData, size2: e.target.value})}
                                        placeholder="e.g., 1219"
                                        className="bg-background border-input rounded-sm font-mono"
                                        data-testid="purchase-size2"
                                    />
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                                        Temper *
                                    </Label>
                                    <Input
                                        value={formData.temper}
                                        onChange={(e) => setFormData({...formData, temper: e.target.value})}
                                        placeholder="e.g., T4, T5, DR8"
                                        className="bg-background border-input rounded-sm"
                                        data-testid="purchase-temper"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                                        Weight (kg) *
                                    </Label>
                                    <Input
                                        type="number"
                                        step="0.01"
                                        value={formData.weight}
                                        onChange={(e) => setFormData({...formData, weight: e.target.value})}
                                        placeholder="e.g., 5000"
                                        className="bg-background border-input rounded-sm font-mono"
                                        data-testid="purchase-weight"
                                    />
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                                        Supplier
                                    </Label>
                                    <Input
                                        value={formData.supplier}
                                        onChange={(e) => setFormData({...formData, supplier: e.target.value})}
                                        placeholder="Supplier name"
                                        className="bg-background border-input rounded-sm"
                                        data-testid="purchase-supplier"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                                        Invoice No.
                                    </Label>
                                    <Input
                                        value={formData.invoice_number}
                                        onChange={(e) => setFormData({...formData, invoice_number: e.target.value})}
                                        placeholder="INV-001"
                                        className="bg-background border-input rounded-sm font-mono"
                                        data-testid="purchase-invoice"
                                    />
                                </div>
                            </div>

                            {/* Auto-calculated sheets preview */}
                            <div className="p-4 bg-primary/10 rounded-sm border border-primary/20">
                                <div className="flex items-center justify-between">
                                    <div>
                                        <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                                            No. of Sheets (Auto-Calculated)
                                        </p>
                                        <p className="text-xs text-muted-foreground mt-1">
                                            = Weight ÷ (Gauge × Size1 × Size2 ÷ 100000 × 0.785)
                                        </p>
                                    </div>
                                    <p className="font-display text-3xl font-bold text-primary">
                                        {formatNumber(calculateSheets())}
                                    </p>
                                </div>
                            </div>

                            <Button 
                                type="submit" 
                                className="w-full font-bold uppercase tracking-wider rounded-sm"
                                disabled={submitting}
                                data-testid="purchase-submit"
                            >
                                {submitting ? (
                                    <>
                                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                        Adding...
                                    </>
                                ) : (
                                    'Add Entry'
                                )}
                            </Button>
                        </form>
                    </DialogContent>
                </Dialog>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <Card className="industrial-card">
                    <CardContent className="p-4">
                        <div className="flex items-center gap-3">
                            <div className="p-2 bg-primary/10 rounded-sm border border-primary/20">
                                <ShoppingCart className="w-5 h-5 text-primary" />
                            </div>
                            <div>
                                <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                                    Total Entries
                                </p>
                                <p className="font-display text-2xl font-bold">{purchases.length}</p>
                            </div>
                        </div>
                    </CardContent>
                </Card>
                <Card className="industrial-card">
                    <CardContent className="p-4">
                        <div className="flex items-center gap-3">
                            <div className="p-2 bg-success/10 rounded-sm border border-success/20">
                                <Layers className="w-5 h-5 text-success" />
                            </div>
                            <div>
                                <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                                    Total Sheets
                                </p>
                                <p className="font-display text-2xl font-bold">{formatNumber(totalSheets)}</p>
                            </div>
                        </div>
                    </CardContent>
                </Card>
                <Card className="industrial-card">
                    <CardContent className="p-4">
                        <div className="flex items-center gap-3">
                            <div className="p-2 bg-info/10 rounded-sm border border-info/20">
                                <ShoppingCart className="w-5 h-5 text-info" />
                            </div>
                            <div>
                                <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                                    Total Weight
                                </p>
                                <p className="font-display text-2xl font-bold">{formatNumber(totalWeight)} kg</p>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Table */}
            <Card className="industrial-card">
                <CardHeader>
                    <CardTitle className="font-display text-xl font-bold tracking-tight uppercase">
                        Raw Material Inventory
                    </CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                    {loading ? (
                        <div className="flex items-center justify-center h-48">
                            <Loader2 className="w-6 h-6 animate-spin text-primary" />
                        </div>
                    ) : purchases.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-48 text-muted-foreground">
                            <AlertCircle className="w-8 h-8 mb-2" />
                            <p>No raw material entries found</p>
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="data-table" data-testid="purchase-table">
                                <thead>
                                    <tr>
                                        <th>Date</th>
                                        <th>Sr. No</th>
                                        <th>Gauge</th>
                                        <th>Size 1</th>
                                        <th>Size 2</th>
                                        <th>Temper</th>
                                        <th>Weight</th>
                                        <th>Total Sheets</th>
                                        <th>Used</th>
                                        <th>Available</th>
                                        <th>Supplier</th>
                                        <th>By</th>
                                        <th></th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {purchases.map((purchase) => (
                                        <tr key={purchase.id} data-testid={`purchase-row-${purchase.id}`}>
                                            <td>{formatDate(purchase.purchase_date)}</td>
                                            <td className="font-medium">{purchase.sr_no}</td>
                                            <td>{purchase.gauge}</td>
                                            <td>{purchase.size1}</td>
                                            <td>{purchase.size2}</td>
                                            <td>{purchase.temper}</td>
                                            <td>{formatNumber(purchase.weight)} kg</td>
                                            <td className="font-mono">
                                                {formatNumber(purchase.no_of_sheets)}
                                            </td>
                                            <td className="text-warning font-mono">
                                                {formatNumber(purchase.sheets_used || 0)}
                                            </td>
                                            <td className="text-success font-bold font-mono">
                                                {formatNumber(purchase.sheets_available || (purchase.no_of_sheets - (purchase.sheets_used || 0)))}
                                            </td>
                                            <td>{purchase.supplier || '-'}</td>
                                            <td className="text-muted-foreground">{purchase.created_by}</td>
                                            <td>
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    onClick={() => handleDelete(purchase.id)}
                                                    className="text-muted-foreground hover:text-destructive"
                                                    data-testid={`delete-purchase-${purchase.id}`}
                                                >
                                                    <Trash2 className="w-4 h-4" />
                                                </Button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
};

export default Purchase;
