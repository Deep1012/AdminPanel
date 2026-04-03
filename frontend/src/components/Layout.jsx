import React, { useState, useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useSidebar } from '../hooks/useSidebar';
import { menuItemsAPI, dashboardAPI } from '../lib/api';
import { getIcon } from '../lib/iconMap';
import { exportToExcel } from '../lib/exportToExcel';
import { formatDate } from '../lib/utils';
import { Button } from './ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from './ui/tooltip';
import { Avatar, AvatarFallback } from './ui/avatar';
import {
    DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
    DropdownMenuSeparator, DropdownMenuTrigger
} from './ui/dropdown-menu';
import {
    LayoutDashboard, ShoppingCart, ClipboardList, Printer, Factory, Truck,
    Settings, Tag, Ruler, LogOut, Menu, X, Package, User, Users, Layers,
    ChevronLeft, ChevronRight, ChevronDown, Download, Loader2
} from 'lucide-react';
import { toast } from 'sonner';

// Fallback if API fails or menu items not yet seeded
const FALLBACK_NAV_ITEMS = [
    { path: '/dashboard', label: 'DASHBOARD', icon: 'LayoutDashboard' },
    { path: '/raw-material-stock', label: 'RAW MATERIAL STOCK', icon: 'Layers' },
    { path: '/printing-stock', label: 'PRINTING STOCK', icon: 'Printer' },
    { path: '/finished-goods', label: 'FINISHED GOODS', icon: 'Package' },
    { path: '/purchase-orders', label: 'PURCHASE ORDERS', icon: 'ClipboardList' },
    { path: '/purchase', label: 'PURCHASE', icon: 'ShoppingCart' },
    { path: '/printing', label: 'PRINTING/COATING', icon: 'Printer' },
    { path: '/production', label: 'PRODUCTION', icon: 'Factory' },
    { path: '/dispatch', label: 'DISPATCH', icon: 'Truck' },
    { path: '/customers', label: 'CUSTOMERS', icon: 'Users', admin_only: true },
    { path: '/brands', label: 'BRANDS', icon: 'Tag', admin_only: true },
    { path: '/sizes', label: 'SIZES', icon: 'Ruler', admin_only: true },
    { path: '/menu-management', label: 'MENU MANAGEMENT', icon: 'Menu', admin_only: true },
    { path: '/admin', label: 'USERS', icon: 'Settings', admin_only: true },
];

export const Layout = ({ children }) => {
    const { user, logout, isAdmin } = useAuth();
    const location = useLocation();
    const navigate = useNavigate();
    const { isCollapsed, toggleSidebar } = useSidebar();
    const [mobileOpen, setMobileOpen] = useState(false);
    const [navItems, setNavItems] = useState([]);
    const [exporting, setExporting] = useState(false);

    useEffect(() => {
        menuItemsAPI.getAll()
            .then(res => {
                if (res.data && res.data.length > 0) {
                    setNavItems(res.data);
                } else {
                    setNavItems(FALLBACK_NAV_ITEMS);
                }
            })
            .catch(() => setNavItems(FALLBACK_NAV_ITEMS));
    }, []);

    const handleLogout = () => {
        logout();
        navigate('/login');
    };

    const handleGlobalExport = async () => {
        try {
            setExporting(true);
            toast.info('Fetching all data for export...');
            const res = await dashboardAPI.getExportAll();
            const d = res.data;
            const today = formatDate(new Date().toISOString());

            const exports = [
                {
                    data: d.purchases, fileName: `Purchases_${today}`, sheetName: 'Purchases',
                    columns: [
                        { header: 'Sr No', key: 'sr_no' }, { header: 'Date', key: 'purchase_date', transform: v => formatDate(v) },
                        { header: 'Supplier', key: 'supplier' }, { header: 'Size', key: 'size' }, { header: 'Gauge', key: 'gauge' },
                        { header: 'Weight (kg)', key: 'weight' }, { header: 'No of Sheets', key: 'no_of_sheets' },
                        { header: 'Created By', key: 'created_by' }, { header: 'Updated By', key: 'updated_by' },
                    ],
                },
                {
                    data: d.printingJobs, fileName: `Printing_Jobs_${today}`, sheetName: 'Printing Jobs',
                    columns: [
                        { header: 'Job #', key: 'job_number' }, { header: 'Date', key: 'job_date', transform: v => formatDate(v) },
                        { header: 'Sheets Used', key: 'sheets_used' }, { header: 'Notes', key: 'notes' },
                        { header: 'Created By', key: 'created_by' }, { header: 'Updated By', key: 'updated_by' },
                    ],
                },
                {
                    data: d.production, fileName: `Production_${today}`, sheetName: 'Production',
                    columns: [
                        { header: 'Date', key: 'production_date', transform: v => formatDate(v) },
                        { header: 'Brand', key: 'brand_name' }, { header: 'Size', key: 'size_name' },
                        { header: 'Qty Produced', key: 'quantity' }, { header: 'Printing Used', key: 'printing_stock_used' },
                        { header: 'Created By', key: 'created_by' }, { header: 'Updated By', key: 'updated_by' },
                    ],
                },
                {
                    data: d.dispatches, fileName: `Dispatches_${today}`, sheetName: 'Dispatches',
                    columns: [
                        { header: 'Order #', key: 'order_number' }, { header: 'Date', key: 'dispatch_date', transform: v => formatDate(v) },
                        { header: 'Customer', key: 'customer_name' }, { header: 'Notes', key: 'notes' },
                        { header: 'Created By', key: 'created_by' }, { header: 'Updated By', key: 'updated_by' },
                    ],
                },
                {
                    data: d.purchaseOrders, fileName: `Purchase_Orders_${today}`, sheetName: 'Purchase Orders',
                    columns: [
                        { header: 'Serial No', key: 'serial_no' }, { header: 'Date', key: 'date', transform: v => formatDate(v) },
                        { header: 'Company', key: 'company_name' }, { header: 'Brand', key: 'brand_name' },
                        { header: 'Size', key: 'size_name' }, { header: 'Quantity', key: 'quantity' },
                        { header: 'Dispatched', key: 'quantity_dispatched' },
                        { header: 'Created By', key: 'created_by' }, { header: 'Updated By', key: 'updated_by' },
                    ],
                },
                {
                    data: d.customers, fileName: `Customers_${today}`, sheetName: 'Customers',
                    columns: [
                        { header: 'Name', key: 'name' }, { header: 'Created At', key: 'created_at', transform: v => formatDate(v) },
                    ],
                },
            ];

            let count = 0;
            for (const exp of exports) {
                if (exportToExcel(exp)) count++;
            }
            toast.success(`Exported ${count} file(s) successfully`);
        } catch (err) {
            toast.error('Failed to export data');
        } finally {
            setExporting(false);
        }
    };

    const filteredNavItems = navItems.filter(item => !item.admin_only || isAdmin());

    return (
        <div className="min-h-screen bg-background flex" data-testid="main-layout">
            {/* Mobile sidebar backdrop */}
            {mobileOpen && (
                <div
                    className="fixed inset-0 bg-black/50 z-40 lg:hidden"
                    onClick={() => setMobileOpen(false)}
                />
            )}

            {/* Sidebar */}
            <aside
                className={`fixed lg:static inset-y-0 left-0 z-50 bg-card border-r border-border flex flex-col
                    transition-[width] duration-200 ease-in-out
                    ${mobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
                    ${isCollapsed ? 'lg:w-16 w-64' : 'w-64'}
                `}
                data-testid="sidebar"
            >
                <div className="flex flex-col h-full">
                    {/* Logo */}
                    <div className="p-4 border-b border-border">
                        {isCollapsed ? (
                            <div className="hidden lg:flex items-center justify-center py-2">
                                <Package className="w-7 h-7 text-primary" />
                            </div>
                        ) : null}
                        <div className={`flex items-center gap-3 ${isCollapsed ? 'lg:hidden' : ''}`}>
                            <Package className="w-8 h-8 text-primary flex-shrink-0" />
                            <div>
                                <h1 className="font-display text-xl font-bold tracking-tight uppercase text-foreground">
                                    TIMESTIN
                                </h1>
                                <p className="text-xs text-muted-foreground tracking-widest uppercase">
                                    Manufacturing CRM
                                </p>
                            </div>
                        </div>
                    </div>

                    {/* Navigation */}
                    <TooltipProvider delayDuration={0}>
                        <nav className="flex-1 p-2 space-y-1 overflow-y-auto">
                            {filteredNavItems.map((item) => {
                                const Icon = getIcon(item.icon);
                                const isActive = location.pathname === item.path;

                                const navLink = (
                                    <Link
                                        key={item.path}
                                        to={item.path}
                                        onClick={() => setMobileOpen(false)}
                                        className={`flex items-center rounded-sm transition-all duration-150
                                            ${isCollapsed
                                                ? 'lg:justify-center lg:px-0 lg:py-3 px-4 py-3 gap-3'
                                                : 'px-4 py-3 gap-3'
                                            }
                                            ${isActive
                                                ? 'bg-primary text-primary-foreground glow-primary'
                                                : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                                            }
                                            text-sm font-bold uppercase tracking-wider
                                        `}
                                        data-testid={`nav-${item.path.slice(1)}`}
                                    >
                                        <Icon className="w-5 h-5 flex-shrink-0" />
                                        <span className={`${isCollapsed ? 'lg:hidden' : ''}`}>
                                            {item.label}
                                        </span>
                                    </Link>
                                );

                                if (isCollapsed) {
                                    return (
                                        <Tooltip key={item.path}>
                                            <TooltipTrigger asChild>
                                                {navLink}
                                            </TooltipTrigger>
                                            <TooltipContent side="right" className="hidden lg:block font-bold uppercase tracking-wider text-xs">
                                                {item.label}
                                            </TooltipContent>
                                        </Tooltip>
                                    );
                                }

                                return navLink;
                            })}
                        </nav>
                    </TooltipProvider>

                    {/* Mobile-only user info at bottom of sidebar */}
                    <div className="p-2 border-t border-border lg:hidden">
                        <div className="flex items-center gap-3 px-4 py-3 rounded-sm bg-secondary/50">
                            <User className="w-5 h-5 text-muted-foreground" />
                            <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium truncate">{user?.username}</p>
                                <p className="text-xs text-muted-foreground uppercase tracking-wider">{user?.role}</p>
                            </div>
                        </div>
                        <Button
                            variant="ghost"
                            className="w-full mt-2 justify-start gap-3 text-muted-foreground hover:text-destructive"
                            onClick={handleLogout}
                            data-testid="logout-btn-mobile"
                        >
                            <LogOut className="w-5 h-5" />
                            <span className="uppercase tracking-wider text-sm font-bold">Logout</span>
                        </Button>
                    </div>
                </div>
            </aside>

            {/* Main content */}
            <div className="flex-1 flex flex-col min-w-0">
                {/* Header */}
                <header className="sticky top-0 z-30 bg-card/95 backdrop-blur-sm border-b border-border px-4 lg:px-6 py-4">
                    <div className="flex items-center gap-4">
                        <Button
                            variant="ghost"
                            size="icon"
                            className="lg:hidden"
                            onClick={() => setMobileOpen(!mobileOpen)}
                            data-testid="mobile-menu-btn"
                        >
                            {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
                        </Button>
                        <Button
                            variant="ghost"
                            size="icon"
                            className="hidden lg:flex text-muted-foreground hover:text-foreground h-8 w-8"
                            onClick={toggleSidebar}
                            data-testid="sidebar-toggle"
                        >
                            {isCollapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
                        </Button>
                        <div className="flex-1">
                            {location.pathname !== '/dashboard' && (
                                <h2 className="font-display text-2xl font-bold tracking-tight uppercase">
                                    {navItems.find(item => item.path === location.pathname)?.label || 'Dashboard'}
                                </h2>
                            )}
                        </div>
                        {/* Global Export */}
                        <TooltipProvider delayDuration={0}>
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <Button
                                        variant="outline"
                                        size="icon"
                                        className="h-9 w-9 rounded-sm"
                                        onClick={handleGlobalExport}
                                        disabled={exporting}
                                        data-testid="global-export-btn"
                                    >
                                        {exporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                                    </Button>
                                </TooltipTrigger>
                                <TooltipContent className="font-bold uppercase tracking-wider text-xs">
                                    Export All Tables
                                </TooltipContent>
                            </Tooltip>
                        </TooltipProvider>
                        {/* Profile dropdown */}
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button variant="ghost" className="flex items-center gap-2 px-2 h-9" data-testid="profile-dropdown">
                                    <Avatar className="h-8 w-8">
                                        <AvatarFallback className="bg-primary/10 text-primary text-xs font-bold">
                                            {user?.username?.charAt(0)?.toUpperCase() || 'U'}
                                        </AvatarFallback>
                                    </Avatar>
                                    <span className="hidden sm:inline text-sm font-medium uppercase tracking-wider">
                                        {user?.username}
                                    </span>
                                    <ChevronDown className="w-4 h-4 text-muted-foreground" />
                                </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-48 bg-card border-border rounded-sm">
                                <DropdownMenuLabel className="font-normal">
                                    <p className="text-sm font-medium">{user?.username}</p>
                                    <p className="text-xs text-muted-foreground">{user?.email}</p>
                                </DropdownMenuLabel>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem className="cursor-pointer gap-2" onClick={() => navigate('/admin')}>
                                    <User className="w-4 h-4" /> Profile
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem className="cursor-pointer gap-2 text-destructive focus:text-destructive" onClick={handleLogout} data-testid="logout-btn">
                                    <LogOut className="w-4 h-4" /> Logout
                                </DropdownMenuItem>
                            </DropdownMenuContent>
                        </DropdownMenu>
                    </div>
                </header>

                {/* Page content */}
                <main className="flex-1 p-4 lg:p-6 overflow-auto">
                    {children}
                </main>
            </div>
        </div>
    );
};

export default Layout;
