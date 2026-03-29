import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { Tabs, TabsList, TabsTrigger } from '../components/ui/tabs';
import { dashboardAPI } from '../lib/api';
import { formatNumber, formatDate, getPOStatusLabel } from '../lib/utils';
import GreetingBanner from '../components/dashboard/GreetingBanner';
import StatCard from '../components/dashboard/StatCard';
import {
    ShoppingCart, Printer, Factory, Truck, ClipboardList,
    Loader2, AlertCircle, Activity
} from 'lucide-react';
import {
    AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
    PieChart, Pie, Cell, Legend
} from 'recharts';
import { toast } from 'sonner';

const CHART_COLORS = ['#ea580c', '#f59e0b', '#22c55e', '#3b82f6', '#8b5cf6'];
const PIE_COLORS = { pending: '#f59e0b', dispatched: '#3b82f6', delivered: '#22c55e' };

const ACTIVITY_ICONS = {
    purchase: ShoppingCart,
    printing: Printer,
    production: Factory,
    dispatch: Truck,
    purchase_order: ClipboardList,
};

const ACTIVITY_LABELS = {
    purchase: 'Purchase',
    printing: 'Printing Job',
    production: 'Production',
    dispatch: 'Dispatch',
    purchase_order: 'Purchase Order',
};

const Dashboard = () => {
    const navigate = useNavigate();
    const [stats, setStats] = useState(null);
    const [productionTrend, setProductionTrend] = useState([]);
    const [trendPeriod, setTrendPeriod] = useState('monthly');
    const [dispatchDist, setDispatchDist] = useState([]);
    const [stockLevels, setStockLevels] = useState([]);
    const [recentActivity, setRecentActivity] = useState([]);
    const [poSummary, setPOSummary] = useState({ pending_count: 0, latest: [] });
    const [loading, setLoading] = useState(true);

    const fetchTrend = useCallback(async (period) => {
        try {
            const res = await dashboardAPI.getProductionTrend(period);
            setProductionTrend(res.data);
        } catch {
            // keep existing data
        }
    }, []);

    useEffect(() => { fetchData(); }, []);

    useEffect(() => { fetchTrend(trendPeriod); }, [trendPeriod, fetchTrend]);

    const fetchData = async () => {
        try {
            setLoading(true);
            const results = await Promise.allSettled([
                dashboardAPI.getStats(),
                dashboardAPI.getProductionTrend('monthly'),
                dashboardAPI.getDispatchDistribution(),
                dashboardAPI.getPurchaseStock(),
                dashboardAPI.getRecentActivity(),
                dashboardAPI.getPOSummary(),
            ]);

            if (results[0].status === 'fulfilled') setStats(results[0].value.data);
            if (results[1].status === 'fulfilled') setProductionTrend(results[1].value.data);
            if (results[2].status === 'fulfilled') setDispatchDist(results[2].value.data);
            if (results[3].status === 'fulfilled') setStockLevels(results[3].value.data);
            if (results[4].status === 'fulfilled') setRecentActivity(results[4].value.data);
            if (results[5].status === 'fulfilled') setPOSummary(results[5].value.data);
        } catch (err) {
            toast.error('Failed to load dashboard');
        } finally {
            setLoading(false);
        }
    };

    const dispatchTotal = dispatchDist.reduce((sum, d) => sum + d.count, 0);

    if (loading) return <div className="flex items-center justify-center h-64"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;

    return (
        <div className="space-y-6 animate-fade-in" data-testid="dashboard-page">
            {/* Greeting Banner */}
            <GreetingBanner />

            {/* Stat Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
                <StatCard
                    title="Purchases"
                    value={formatNumber(stats?.purchase?.total_items || 0)}
                    subtitle={`${formatNumber(stats?.purchase?.total_sheets_available || 0)} sheets avail.`}
                    icon={ShoppingCart}
                    color="primary"
                    trend={stats?.trends?.purchases}
                />
                <StatCard
                    title="Printing Jobs"
                    value={formatNumber(stats?.printing_coating?.pending_jobs || 0)}
                    subtitle={`${formatNumber(stats?.printing_coating?.completed_jobs || 0)} completed`}
                    icon={Printer}
                    color="info"
                    trend={stats?.trends?.printing}
                />
                <StatCard
                    title="Production"
                    value={formatNumber(stats?.finished_goods?.total_produced || 0)}
                    subtitle={`${formatNumber(stats?.finished_goods?.available_stock || 0)} in stock`}
                    icon={Factory}
                    color="success"
                    trend={stats?.trends?.production}
                />
                <StatCard
                    title="Dispatches"
                    value={formatNumber(stats?.dispatch?.total_items || 0)}
                    subtitle={`${formatNumber(stats?.dispatch?.pending_orders || 0)} pending`}
                    icon={Truck}
                    color="warning"
                    trend={stats?.trends?.dispatch}
                />
                <StatCard
                    title="Pending POs"
                    value={formatNumber(stats?.purchase_orders?.pending || 0)}
                    subtitle={`${formatNumber(stats?.purchase_orders?.total || 0)} total orders`}
                    icon={ClipboardList}
                    color="primary"
                    trend={stats?.trends?.purchase_orders}
                />
            </div>

            {/* Charts Row */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Production Trend */}
                <Card className="industrial-card lg:col-span-2" data-testid="production-trend-chart">
                    <CardHeader className="flex flex-row items-center justify-between">
                        <CardTitle className="font-display text-lg font-bold tracking-tight uppercase">Production Trend</CardTitle>
                        <Tabs value={trendPeriod} onValueChange={setTrendPeriod}>
                            <TabsList className="h-8">
                                <TabsTrigger value="daily" className="text-xs px-2.5 py-1">Daily</TabsTrigger>
                                <TabsTrigger value="weekly" className="text-xs px-2.5 py-1">Weekly</TabsTrigger>
                                <TabsTrigger value="monthly" className="text-xs px-2.5 py-1">Monthly</TabsTrigger>
                            </TabsList>
                        </Tabs>
                    </CardHeader>
                    <CardContent>
                        {productionTrend.length === 0 ? (
                            <div className="flex items-center justify-center h-48 text-muted-foreground"><AlertCircle className="w-4 h-4 mr-2" />No production data</div>
                        ) : (
                            <ResponsiveContainer width="100%" height={280}>
                                <AreaChart data={productionTrend}>
                                    <defs>
                                        <linearGradient id="trendGradient" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="5%" stopColor="#ea580c" stopOpacity={0.3} />
                                            <stop offset="95%" stopColor="#ea580c" stopOpacity={0} />
                                        </linearGradient>
                                    </defs>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                                    <XAxis dataKey="label" tick={{ fill: '#a1a1aa', fontSize: 12 }} />
                                    <YAxis tick={{ fill: '#a1a1aa', fontSize: 12 }} />
                                    <Tooltip contentStyle={{ backgroundColor: '#18181b', border: '1px solid #27272a', borderRadius: '2px' }} labelStyle={{ color: '#f4f4f5' }} />
                                    <Area type="monotone" dataKey="total" stroke="#ea580c" strokeWidth={2} fill="url(#trendGradient)" name="Qty Produced" />
                                </AreaChart>
                            </ResponsiveContainer>
                        )}
                    </CardContent>
                </Card>

                {/* Dispatch Status Donut */}
                <Card className="industrial-card" data-testid="dispatch-donut-chart">
                    <CardHeader><CardTitle className="font-display text-lg font-bold tracking-tight uppercase">Dispatch Status</CardTitle></CardHeader>
                    <CardContent>
                        {dispatchDist.every(d => d.count === 0) ? (
                            <div className="flex items-center justify-center h-48 text-muted-foreground"><AlertCircle className="w-4 h-4 mr-2" />No dispatch data</div>
                        ) : (
                            <ResponsiveContainer width="100%" height={280}>
                                <PieChart>
                                    <Pie
                                        data={dispatchDist.filter(d => d.count > 0)}
                                        dataKey="count"
                                        nameKey="status"
                                        cx="50%"
                                        cy="50%"
                                        innerRadius={55}
                                        outerRadius={90}
                                        label={({ status, count }) => `${status}: ${count}`}
                                    >
                                        {dispatchDist.filter(d => d.count > 0).map((entry, i) => (
                                            <Cell key={i} fill={PIE_COLORS[entry.status] || CHART_COLORS[i % CHART_COLORS.length]} />
                                        ))}
                                    </Pie>
                                    <Tooltip contentStyle={{ backgroundColor: '#18181b', border: '1px solid #27272a', borderRadius: '2px' }} />
                                    <Legend wrapperStyle={{ fontSize: 12 }} />
                                    {/* Center label */}
                                    <text x="50%" y="48%" textAnchor="middle" dominantBaseline="middle" className="fill-foreground" style={{ fontSize: '24px', fontWeight: 'bold', fontFamily: 'Barlow Condensed' }}>
                                        {dispatchTotal}
                                    </text>
                                    <text x="50%" y="58%" textAnchor="middle" dominantBaseline="middle" className="fill-muted-foreground" style={{ fontSize: '11px', fontWeight: 500 }}>
                                        TOTAL
                                    </text>
                                </PieChart>
                            </ResponsiveContainer>
                        )}
                    </CardContent>
                </Card>
            </div>

            {/* Stock Levels */}
            {stockLevels.length > 0 && (
                <Card className="industrial-card" data-testid="stock-levels-chart">
                    <CardHeader><CardTitle className="font-display text-lg font-bold tracking-tight uppercase">Raw Material Stock Levels</CardTitle></CardHeader>
                    <CardContent>
                        <ResponsiveContainer width="100%" height={Math.max(200, stockLevels.length * 50)}>
                            <BarChart data={stockLevels} layout="vertical">
                                <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                                <XAxis type="number" tick={{ fill: '#a1a1aa', fontSize: 12 }} />
                                <YAxis dataKey="size" type="category" tick={{ fill: '#a1a1aa', fontSize: 12 }} width={100} />
                                <Tooltip contentStyle={{ backgroundColor: '#18181b', border: '1px solid #27272a', borderRadius: '2px' }} labelStyle={{ color: '#f4f4f5' }} />
                                <Bar dataKey="sheets_available" fill="#22c55e" radius={[0, 2, 2, 0]} name="Available Sheets" />
                                <Bar dataKey="sheets_used" fill="#f59e0b" radius={[0, 2, 2, 0]} name="Used Sheets" />
                            </BarChart>
                        </ResponsiveContainer>
                    </CardContent>
                </Card>
            )}

            {/* Bottom Row: Activity + PO Alerts */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Recent Activity */}
                <Card className="industrial-card" data-testid="recent-activity">
                    <CardHeader>
                        <CardTitle className="font-display text-lg font-bold tracking-tight uppercase flex items-center gap-2">
                            <Activity className="w-5 h-5 text-primary" /> Recent Activity
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        {recentActivity.length === 0 ? (
                            <div className="flex items-center justify-center h-32 text-muted-foreground"><AlertCircle className="w-4 h-4 mr-2" />No recent activity</div>
                        ) : (
                            <div className="space-y-3">
                                {recentActivity.map((item, idx) => {
                                    const Icon = ACTIVITY_ICONS[item.type] || AlertCircle;
                                    return (
                                        <div key={idx} className="flex items-center gap-3 p-2 rounded-sm hover:bg-secondary/50 transition-colors">
                                            <div className="p-1.5 bg-primary/10 rounded-sm"><Icon className="w-4 h-4 text-primary" /></div>
                                            <div className="flex-1 min-w-0">
                                                <p className="text-sm font-medium truncate">
                                                    <span className="text-muted-foreground">{ACTIVITY_LABELS[item.type]}:</span> {item.identifier}
                                                </p>
                                                <p className="text-xs text-muted-foreground">{formatDate(item.date)}</p>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </CardContent>
                </Card>

                {/* PO Alerts */}
                <Card className="industrial-card" data-testid="po-alerts">
                    <CardHeader className="flex flex-row items-center justify-between">
                        <CardTitle className="font-display text-lg font-bold tracking-tight uppercase flex items-center gap-2">
                            <ClipboardList className="w-5 h-5 text-primary" /> Purchase Order Alerts
                        </CardTitle>
                        {poSummary.pending_count > 0 && (
                            <Badge variant="destructive" className="font-mono">{poSummary.pending_count} pending</Badge>
                        )}
                    </CardHeader>
                    <CardContent>
                        {poSummary.pending_count === 0 ? (
                            <div className="flex items-center justify-center h-32 text-success">
                                <div className="text-center">
                                    <p className="font-bold">All orders processed</p>
                                    <p className="text-xs text-muted-foreground mt-1">No pending purchase orders</p>
                                </div>
                            </div>
                        ) : (
                            <div className="space-y-3">
                                {poSummary.latest.map((po, idx) => (
                                    <div
                                        key={idx}
                                        className="flex items-center justify-between p-2 rounded-sm hover:bg-secondary/50 transition-colors cursor-pointer"
                                        onClick={() => navigate('/purchase-orders')}
                                        data-testid={`po-alert-${idx}`}
                                    >
                                        <div className="flex-1 min-w-0">
                                            <p className="text-sm font-mono font-bold text-primary">{po.serial_no}</p>
                                            <p className="text-xs text-muted-foreground truncate">{po.company_name}</p>
                                        </div>
                                        <div className="text-right">
                                            <p className="text-sm font-mono font-bold">{formatNumber(po.quantity)}</p>
                                            <Badge variant="outline" className="text-xs">{getPOStatusLabel(po.status)}</Badge>
                                        </div>
                                    </div>
                                ))}
                                {poSummary.pending_count > 5 && (
                                    <p
                                        className="text-xs text-primary cursor-pointer hover:underline text-center pt-2"
                                        onClick={() => navigate('/purchase-orders')}
                                    >
                                        View all {poSummary.pending_count} pending orders
                                    </p>
                                )}
                            </div>
                        )}
                    </CardContent>
                </Card>
            </div>
        </div>
    );
};

export default Dashboard;
