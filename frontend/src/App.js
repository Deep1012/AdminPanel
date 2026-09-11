import React, { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { Toaster } from './components/ui/sonner';
import ErrorBoundary from './components/ErrorBoundary';
import Layout from './components/Layout';
import Login from './pages/Login';
import './App.css';

/**
 * Route-level code splitting.
 *
 * The whole application used to ship as one 1.5MB chunk, so an unauthenticated
 * visitor downloaded the charting library, the spreadsheet engine and fifteen
 * pages in order to see a login form. Each page below is its own chunk now,
 * fetched when its route is first visited.
 *
 * `Login` stays EAGER on purpose: it is the first paint for a signed-out user,
 * and splitting it would only add a round trip before the one screen that is
 * always needed. `Layout` is eager for the same reason in reverse — every
 * authenticated route renders it, so it would be fetched immediately anyway.
 *
 * `Dashboard` is the highest-value split: it is the sole importer of recharts.
 */
const Dashboard = lazy(() => import('./pages/Dashboard'));
const Purchase = lazy(() => import('./pages/Purchase'));
const Printing = lazy(() => import('./pages/Printing'));
const Production = lazy(() => import('./pages/Production'));
const Dispatch = lazy(() => import('./pages/Dispatch'));
const Admin = lazy(() => import('./pages/Admin'));
const PurchaseOrders = lazy(() => import('./pages/PurchaseOrders'));
const Brands = lazy(() => import('./pages/Brands'));
const Sizes = lazy(() => import('./pages/Sizes'));
const Customers = lazy(() => import('./pages/Customers'));
const RawMaterialStock = lazy(() => import('./pages/RawMaterialStock'));
const PrintingStock = lazy(() => import('./pages/PrintingStock'));
const FinishedGoods = lazy(() => import('./pages/FinishedGoods'));
const MenuManagement = lazy(() => import('./pages/MenuManagement'));
const ActivityLogs = lazy(() => import('./pages/ActivityLogs'));

/**
 * Suspense fallback while a route chunk loads.
 *
 * Deliberately the same spinner the auth gate already shows, not a per-page
 * skeleton: a skeleton has to be maintained alongside every page it imitates,
 * and on a LAN-hosted factory app the chunk usually arrives before it would be
 * perceived. Sized to the content area so the sidebar and header stay put.
 */
const RouteFallback = () => (
    <div className="flex items-center justify-center py-24" data-testid="route-loading">
        <div className="flex flex-col items-center gap-3">
            <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-sm animate-spin" />
            <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Loading</p>
        </div>
    </div>
);

// Protected Route component
const ProtectedRoute = ({ children, adminOnly = false }) => {
    const { user, loading, isAdmin } = useAuth();

    if (loading) {
        return (
            <div className="min-h-screen bg-background flex items-center justify-center">
                <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
        );
    }

    if (!user) {
        return <Navigate to="/login" replace />;
    }

    if (adminOnly && !isAdmin()) {
        return <Navigate to="/dashboard" replace />;
    }

    // The Suspense boundary sits INSIDE Layout so the sidebar, header and
    // page title stay rendered while the next route's chunk downloads. A
    // boundary above Layout would blank the whole shell on every navigation.
    return (
        <Layout>
            <Suspense fallback={<RouteFallback />}>{children}</Suspense>
        </Layout>
    );
};

// Public Route (redirects to dashboard if logged in)
const PublicRoute = ({ children }) => {
    const { user, loading } = useAuth();

    if (loading) {
        return (
            <div className="min-h-screen bg-background flex items-center justify-center">
                <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
        );
    }

    if (user) {
        return <Navigate to="/dashboard" replace />;
    }

    return children;
};

function AppRoutes() {
    return (
        <Routes>
            <Route path="/login" element={
                <PublicRoute>
                    <Login />
                </PublicRoute>
            } />
            <Route path="/dashboard" element={
                <ProtectedRoute>
                    <Dashboard />
                </ProtectedRoute>
            } />
            <Route path="/raw-material-stock" element={
                <ProtectedRoute>
                    <RawMaterialStock />
                </ProtectedRoute>
            } />
            <Route path="/printing-stock" element={
                <ProtectedRoute>
                    <PrintingStock />
                </ProtectedRoute>
            } />
            <Route path="/finished-goods" element={
                <ProtectedRoute>
                    <FinishedGoods />
                </ProtectedRoute>
            } />
            <Route path="/purchase-orders" element={
                <ProtectedRoute>
                    <PurchaseOrders />
                </ProtectedRoute>
            } />
            <Route path="/purchase" element={
                <ProtectedRoute>
                    <Purchase />
                </ProtectedRoute>
            } />
            <Route path="/printing" element={
                <ProtectedRoute>
                    <Printing />
                </ProtectedRoute>
            } />
            <Route path="/production" element={
                <ProtectedRoute>
                    <Production />
                </ProtectedRoute>
            } />
            <Route path="/dispatch" element={
                <ProtectedRoute>
                    <Dispatch />
                </ProtectedRoute>
            } />
            <Route path="/brands" element={
                <ProtectedRoute>
                    <Brands />
                </ProtectedRoute>
            } />
            <Route path="/sizes" element={
                <ProtectedRoute>
                    <Sizes />
                </ProtectedRoute>
            } />
            <Route path="/customers" element={
                <ProtectedRoute adminOnly>
                    <Customers />
                </ProtectedRoute>
            } />
            <Route path="/menu-management" element={
                <ProtectedRoute adminOnly>
                    <MenuManagement />
                </ProtectedRoute>
            } />
            <Route path="/activity-logs" element={
                <ProtectedRoute adminOnly>
                    <ActivityLogs />
                </ProtectedRoute>
            } />
            <Route path="/admin" element={
                <ProtectedRoute adminOnly>
                    <Admin />
                </ProtectedRoute>
            } />
            <Route path="/" element={<Navigate to="/login" replace />} />
            <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
    );
}

function App() {
    return (
        <ErrorBoundary>
            <BrowserRouter>
                <AuthProvider>
                    <div className="App dark">
                        <AppRoutes />
                        <Toaster position="bottom-right" richColors />
                    </div>
                </AuthProvider>
            </BrowserRouter>
        </ErrorBoundary>
    );
}

export default App;
