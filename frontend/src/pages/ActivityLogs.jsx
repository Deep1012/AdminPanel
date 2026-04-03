import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Badge } from '../components/ui/badge';
import { adminAPI } from '../lib/api';
import { formatNumber } from '../lib/utils';
import { Activity, Loader2, AlertCircle, ChevronLeft, ChevronRight, LogIn, Plus, Pencil, Trash2, Download, Upload, Database, Eraser } from 'lucide-react';
import { toast } from 'sonner';

const ACTION_COLORS = {
    LOGIN: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
    CREATE: 'bg-green-500/10 text-green-400 border-green-500/20',
    UPDATE: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20',
    DELETE: 'bg-red-500/10 text-red-400 border-red-500/20',
    EXPORT: 'bg-purple-500/10 text-purple-400 border-purple-500/20',
    IMPORT: 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20',
    CLEAR_DATA: 'bg-red-500/10 text-red-400 border-red-500/20',
    BACKUP: 'bg-teal-500/10 text-teal-400 border-teal-500/20',
};

const ACTION_ICONS = {
    LOGIN: LogIn,
    CREATE: Plus,
    UPDATE: Pencil,
    DELETE: Trash2,
    EXPORT: Download,
    IMPORT: Upload,
    CLEAR_DATA: Eraser,
    BACKUP: Database,
};

const ENTITY_TYPES = ['auth', 'purchase', 'printing_job', 'production', 'dispatch', 'purchase_order', 'brand', 'size', 'customer', 'admin', 'backup'];
const ACTION_TYPES = ['LOGIN', 'CREATE', 'UPDATE', 'DELETE', 'EXPORT', 'IMPORT', 'CLEAR_DATA', 'BACKUP'];

const ActivityLogs = () => {
    const [logs, setLogs] = useState([]);
    const [stats, setStats] = useState(null);
    const [loading, setLoading] = useState(true);
    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const [total, setTotal] = useState(0);
    const limit = 50;

    // Filters
    const [filterAction, setFilterAction] = useState('');
    const [filterEntity, setFilterEntity] = useState('');
    const [filterUsername, setFilterUsername] = useState('');
    const [filterDateFrom, setFilterDateFrom] = useState('');
    const [filterDateTo, setFilterDateTo] = useState('');

    const fetchLogs = useCallback(async () => {
        try {
            setLoading(true);
            const params = { page, limit };
            if (filterAction) params.action = filterAction;
            if (filterEntity) params.entity_type = filterEntity;
            if (filterUsername) params.username = filterUsername;
            if (filterDateFrom) params.from = filterDateFrom;
            if (filterDateTo) params.to = filterDateTo;

            const res = await adminAPI.getActivityLogs(params);
            setLogs(res.data.logs);
            setTotal(res.data.total);
            setTotalPages(res.data.totalPages);
        } catch (err) { toast.error('Failed to load activity logs'); }
        finally { setLoading(false); }
    }, [page, filterAction, filterEntity, filterUsername, filterDateFrom, filterDateTo]);

    const fetchStats = useCallback(async () => {
        try {
            const res = await adminAPI.getActivityLogStats();
            setStats(res.data);
        } catch { /* ignore */ }
    }, []);

    useEffect(() => { fetchLogs(); }, [fetchLogs]);
    useEffect(() => { fetchStats(); }, [fetchStats]);

    const clearFilters = () => {
        setFilterAction(''); setFilterEntity(''); setFilterUsername('');
        setFilterDateFrom(''); setFilterDateTo(''); setPage(1);
    };

    const formatTimestamp = (ts) => {
        const d = new Date(ts);
        return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) +
            ' ' + d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    };

    return (
        <div className="space-y-6 animate-fade-in" data-testid="activity-logs-page">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <p className="text-muted-foreground">View all system activity - login, create, update, delete operations</p>
            </div>

            {stats && (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                    <Card className="industrial-card"><CardContent className="p-4"><div className="flex items-center gap-3"><div className="p-2 bg-primary/10 rounded-sm border border-primary/20"><Activity className="w-5 h-5 text-primary" /></div><div><p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Total Logs</p><p className="font-display text-2xl font-bold">{formatNumber(stats.total)}</p></div></div></CardContent></Card>
                    <Card className="industrial-card"><CardContent className="p-4"><div className="flex items-center gap-3"><div className="p-2 bg-success/10 rounded-sm border border-success/20"><Activity className="w-5 h-5 text-success" /></div><div><p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Today</p><p className="font-display text-2xl font-bold">{formatNumber(stats.today)}</p></div></div></CardContent></Card>
                    <Card className="industrial-card"><CardContent className="p-4"><div className="flex items-center gap-3"><div className="p-2 bg-green-500/10 rounded-sm border border-green-500/20"><Plus className="w-5 h-5 text-green-500" /></div><div><p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Creates</p><p className="font-display text-2xl font-bold">{formatNumber(stats.by_action?.CREATE || 0)}</p></div></div></CardContent></Card>
                    <Card className="industrial-card"><CardContent className="p-4"><div className="flex items-center gap-3"><div className="p-2 bg-blue-500/10 rounded-sm border border-blue-500/20"><LogIn className="w-5 h-5 text-blue-500" /></div><div><p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Logins</p><p className="font-display text-2xl font-bold">{formatNumber(stats.by_action?.LOGIN || 0)}</p></div></div></CardContent></Card>
                </div>
            )}

            <Card className="industrial-card">
                <CardHeader><CardTitle className="font-display text-xl font-bold tracking-tight uppercase">Activity Logs</CardTitle></CardHeader>
                <div className="px-6 pb-4">
                    <div className="flex flex-wrap items-end gap-2">
                        <div className="min-w-[140px]">
                            <Select value={filterAction} onValueChange={(v) => { setFilterAction(v === 'all' ? '' : v); setPage(1); }}>
                                <SelectTrigger className="bg-background border-input rounded-sm h-9"><SelectValue placeholder="Action" /></SelectTrigger>
                                <SelectContent className="bg-card border-border rounded-sm">
                                    <SelectItem value="all">All Actions</SelectItem>
                                    {ACTION_TYPES.map(a => <SelectItem key={a} value={a}>{a}</SelectItem>)}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="min-w-[140px]">
                            <Select value={filterEntity} onValueChange={(v) => { setFilterEntity(v === 'all' ? '' : v); setPage(1); }}>
                                <SelectTrigger className="bg-background border-input rounded-sm h-9"><SelectValue placeholder="Entity" /></SelectTrigger>
                                <SelectContent className="bg-card border-border rounded-sm">
                                    <SelectItem value="all">All Entities</SelectItem>
                                    {ENTITY_TYPES.map(e => <SelectItem key={e} value={e}>{e.replace('_', ' ')}</SelectItem>)}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="min-w-[140px]">
                            <Input value={filterUsername} onChange={(e) => { setFilterUsername(e.target.value); setPage(1); }} placeholder="Username..." className="bg-background border-input rounded-sm h-9" />
                        </div>
                        <div className="min-w-[140px]">
                            <Label className="text-[10px] font-bold uppercase text-muted-foreground mb-1 block">From</Label>
                            <Input type="date" value={filterDateFrom} onChange={(e) => { setFilterDateFrom(e.target.value); setPage(1); }} className="bg-background border-input rounded-sm font-mono text-xs h-9" />
                        </div>
                        <div className="min-w-[140px]">
                            <Label className="text-[10px] font-bold uppercase text-muted-foreground mb-1 block">To</Label>
                            <Input type="date" value={filterDateTo} onChange={(e) => { setFilterDateTo(e.target.value); setPage(1); }} className="bg-background border-input rounded-sm font-mono text-xs h-9" />
                        </div>
                        <Button variant="outline" onClick={clearFilters} className="rounded-sm text-xs font-bold uppercase h-9">Clear</Button>
                    </div>
                    <p className="text-xs text-muted-foreground mt-2">{formatNumber(total)} log(s) found</p>
                </div>
                <CardContent className="p-0">
                    {loading ? (
                        <div className="flex items-center justify-center h-48"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
                    ) : logs.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-48 text-muted-foreground"><AlertCircle className="w-8 h-8 mb-2" /><p>No activity logs found</p></div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="data-table" data-testid="activity-logs-table">
                                <thead><tr><th>Timestamp</th><th>Action</th><th>Entity</th><th>Label</th><th>User</th><th>Details</th><th>IP</th></tr></thead>
                                <tbody>
                                    {logs.map((log) => {
                                        const IconComp = ACTION_ICONS[log.action] || Activity;
                                        return (
                                            <tr key={log.id}>
                                                <td className="font-mono text-xs whitespace-nowrap">{formatTimestamp(log.timestamp)}</td>
                                                <td>
                                                    <Badge variant="outline" className={`${ACTION_COLORS[log.action] || ''} font-mono text-xs`}>
                                                        <IconComp className="w-3 h-3 mr-1" />
                                                        {log.action}
                                                    </Badge>
                                                </td>
                                                <td className="text-xs uppercase">{log.entity_type?.replace('_', ' ')}</td>
                                                <td className="font-medium text-sm">{log.entity_label || '-'}</td>
                                                <td className="text-muted-foreground">{log.username}</td>
                                                <td className="max-w-xs truncate text-xs text-muted-foreground" title={log.details || ''}>{log.details || '-'}</td>
                                                <td className="text-xs font-mono text-muted-foreground whitespace-nowrap">{log.ip_address || '-'}</td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    )}
                    {totalPages > 1 && (
                        <div className="flex items-center justify-between px-6 py-3 border-t border-border">
                            <p className="text-xs text-muted-foreground">
                                Page {page} of {totalPages} ({formatNumber(total)} total)
                            </p>
                            <div className="flex gap-2">
                                <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)} className="rounded-sm">
                                    <ChevronLeft className="w-4 h-4" />
                                </Button>
                                <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)} className="rounded-sm">
                                    <ChevronRight className="w-4 h-4" />
                                </Button>
                            </div>
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
};

export default ActivityLogs;
