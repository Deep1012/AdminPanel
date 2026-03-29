import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { Toaster } from './components/ui/sonner';
import Layout from './components/Layout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Purchase from './pages/Purchase';
import Printing from './pages/Printing';
import Production from './pages/Production';
import Dispatch from './pages/Dispatch';
import Admin from './pages/Admin';
import Brands from './pages/Brands';
import Sizes from './pages/Sizes';
import './App.css';

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

    return <Layout>{children}</Layout>;
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
        <BrowserRouter>
            <AuthProvider>
                <div className="App dark">
                    <AppRoutes />
                    <Toaster position="bottom-right" richColors />
                </div>
            </AuthProvider>
        </BrowserRouter>
    );
}

export default App;
