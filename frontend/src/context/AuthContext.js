import React, { createContext, useContext, useState, useEffect } from 'react';
import { authAPI } from '../lib/api';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const token = localStorage.getItem('token');
        const storedUser = localStorage.getItem('user');

        // A corrupted `user` entry (extension, manual edit, partial write, or a
        // stale shape from an older release) must never throw here — an
        // unguarded parse would white-screen the app on every load with no way
        // out but clearing site data by hand. Treat it as logged out instead.
        let parsed = null;
        if (token && storedUser) {
            try {
                parsed = JSON.parse(storedUser);
            } catch {
                parsed = null;
            }
        }

        if (token && parsed) {
            setUser(parsed);
            setLoading(false);
            // Verify token in background (don't block UI)
            authAPI.getMe()
                .then(res => {
                    setUser(res.data);
                    localStorage.setItem('user', JSON.stringify(res.data));
                })
                .catch(() => {
                    logout();
                });
        } else {
            // Clear any half-written / unreadable session so the next load is clean.
            if (storedUser || token) logout();
            setLoading(false);
        }
    }, []);

    const login = async (email, password) => {
        const response = await authAPI.login(email, password);
        const { token, user: userData } = response.data;
        localStorage.setItem('token', token);
        localStorage.setItem('user', JSON.stringify(userData));
        setUser(userData);
        return userData;
    };

    const logout = () => {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        setUser(null);
    };

    const isAdmin = () => {
        return user?.role === 'admin';
    };

    return (
        <AuthContext.Provider value={{ user, login, logout, loading, isAdmin }}>
            {children}
        </AuthContext.Provider>
    );
};

export const useAuth = () => {
    const context = useContext(AuthContext);
    if (!context) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
};
