import React, { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Button } from './ui/button';
import { 
    LayoutDashboard, 
    ShoppingCart, 
    Printer, 
    Factory, 
    Truck, 
    Settings, 
    LogOut,
    Menu,
    X,
    Package,
    User
} from 'lucide-react';

const navItems = [
    { path: '/dashboard', label: 'DASHBOARD', icon: LayoutDashboard },
    { path: '/purchase', label: 'PURCHASE', icon: ShoppingCart },
    { path: '/printing', label: 'PRINTING/COATING', icon: Printer },
    { path: '/production', label: 'PRODUCTION', icon: Factory },
    { path: '/dispatch', label: 'DISPATCH', icon: Truck },
    { path: '/admin', label: 'ADMIN', icon: Settings, adminOnly: true },
];

export const Layout = ({ children }) => {
    const { user, logout, isAdmin } = useAuth();
    const location = useLocation();
    const navigate = useNavigate();
    const [sidebarOpen, setSidebarOpen] = useState(false);

    const handleLogout = () => {
        logout();
        navigate('/login');
    };

    const filteredNavItems = navItems.filter(item => !item.adminOnly || isAdmin());

    return (
        <div className="min-h-screen bg-background flex" data-testid="main-layout">
            {/* Mobile sidebar backdrop */}
            {sidebarOpen && (
                <div 
                    className="fixed inset-0 bg-black/50 z-40 lg:hidden"
                    onClick={() => setSidebarOpen(false)}
                />
            )}

            {/* Sidebar */}
            <aside 
                className={`fixed lg:static inset-y-0 left-0 z-50 w-64 bg-card border-r border-border transform transition-transform duration-200 ease-in-out ${
                    sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
                }`}
                data-testid="sidebar"
            >
                <div className="flex flex-col h-full">
                    {/* Logo */}
                    <div className="p-6 border-b border-border">
                        <div className="flex items-center gap-3">
                            <Package className="w-8 h-8 text-primary" />
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
                    <nav className="flex-1 p-4 space-y-1">
                        {filteredNavItems.map((item) => {
                            const Icon = item.icon;
                            const isActive = location.pathname === item.path;
                            return (
                                <Link
                                    key={item.path}
                                    to={item.path}
                                    onClick={() => setSidebarOpen(false)}
                                    className={`flex items-center gap-3 px-4 py-3 rounded-sm text-sm font-bold uppercase tracking-wider transition-all duration-150 ${
                                        isActive
                                            ? 'bg-primary text-primary-foreground glow-primary'
                                            : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                                    }`}
                                    data-testid={`nav-${item.path.slice(1)}`}
                                >
                                    <Icon className="w-5 h-5" />
                                    {item.label}
                                </Link>
                            );
                        })}
                    </nav>

                    {/* User info */}
                    <div className="p-4 border-t border-border">
                        <div className="flex items-center gap-3 px-4 py-3 rounded-sm bg-secondary/50">
                            <User className="w-5 h-5 text-muted-foreground" />
                            <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium truncate">{user?.username}</p>
                                <p className="text-xs text-muted-foreground uppercase tracking-wider">
                                    {user?.role}
                                </p>
                            </div>
                        </div>
                        <Button
                            variant="ghost"
                            className="w-full mt-2 justify-start gap-3 text-muted-foreground hover:text-destructive"
                            onClick={handleLogout}
                            data-testid="logout-btn"
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
                            onClick={() => setSidebarOpen(!sidebarOpen)}
                            data-testid="mobile-menu-btn"
                        >
                            {sidebarOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
                        </Button>
                        <div className="flex-1">
                            <h2 className="font-display text-2xl font-bold tracking-tight uppercase">
                                {navItems.find(item => item.path === location.pathname)?.label || 'Dashboard'}
                            </h2>
                        </div>
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
