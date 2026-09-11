import axios from 'axios';
import { cachedRead, mutating, invalidateAll, CACHE_KEYS } from './apiCache';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API_BASE = `${BACKEND_URL}/api`;

const api = axios.create({
    baseURL: API_BASE,
    headers: { 'Content-Type': 'application/json' },
});

api.interceptors.request.use((config) => {
    const token = localStorage.getItem('token');
    if (token) config.headers.Authorization = `Bearer ${token}`;
    return config;
});

api.interceptors.response.use(
    (response) => response,
    (error) => {
        if (error.response?.status === 401) {
            localStorage.removeItem('token');
            localStorage.removeItem('user');
            // The next session may be a different user with a different
            // admin-only view of this reference data.
            invalidateAll();
            window.location.href = '/login';
        }
        return Promise.reject(error);
    }
);

export const authAPI = {
    login: (email, password) => api.post('/auth/login', { email, password }),
    register: (data) => api.post('/auth/register', data),
    getMe: () => api.get('/auth/me'),
};

export const usersAPI = {
    getAll: () => api.get('/users'),
    update: (id, data) => api.put(`/users/${id}`, data),
    delete: (id) => api.delete(`/users/${id}`),
};

// Brands, sizes, customers and menu items are read through the TTL cache and
// every write below drops the key it touches. `update` covers the Brands page's
// LWBF toggle, which is a plain PUT.
export const brandsAPI = {
    getAll: () => cachedRead(CACHE_KEYS.brands, () => api.get('/brands')),
    create: (data) => mutating(() => api.post('/brands', data), [CACHE_KEYS.brands]),
    update: (id, data) => mutating(() => api.put(`/brands/${id}`, data), [CACHE_KEYS.brands]),
    delete: (id) => mutating(() => api.delete(`/brands/${id}`), [CACHE_KEYS.brands]),
};

export const sizesAPI = {
    getAll: () => cachedRead(CACHE_KEYS.sizes, () => api.get('/sizes')),
    create: (data) => mutating(() => api.post('/sizes', data), [CACHE_KEYS.sizes]),
    update: (id, data) => mutating(() => api.put(`/sizes/${id}`, data), [CACHE_KEYS.sizes]),
    delete: (id) => mutating(() => api.delete(`/sizes/${id}`), [CACHE_KEYS.sizes]),
};

export const purchaseAPI = {
    getAll: () => api.get('/purchases'),
    getAvailable: () => api.get('/purchases/available'),
    create: (data) => api.post('/purchases', data),
    update: (id, data) => api.put(`/purchases/${id}`, data),
    delete: (id) => api.delete(`/purchases/${id}`),
};

export const printingAPI = {
    getAll: () => api.get('/printing-jobs'),
    create: (data) => api.post('/printing-jobs', data),
    update: (id, data) => api.put(`/printing-jobs/${id}`, data),
    delete: (id) => api.delete(`/printing-jobs/${id}`),
};

export const productionAPI = {
    // Opt-in server-side pagination: with no params the route still answers
    // with a bare array over the whole collection (cascade rows included),
    // which is what the unpaginated readers rely on. Passing `page`/`limit`
    // switches it to the { data, total, page, limit, total_pages } envelope.
    getAll: (params) => api.get('/production', params ? { params } : undefined),
    create: (data) => api.post('/production', data),
    update: (id, data) => api.put(`/production/${id}`, data),
    delete: (id) => api.delete(`/production/${id}`),
};

export const dispatchAPI = {
    getAll: () => api.get('/dispatch'),
    create: (data) => api.post('/dispatch', data),
    update: (id, data) => api.put(`/dispatch/${id}`, data),
    delete: (id) => api.delete(`/dispatch/${id}`),
};

export const purchaseOrdersAPI = {
    getAll: () => api.get('/purchase-orders'),
    create: (data) => api.post('/purchase-orders', data),
    update: (id, data) => api.put(`/purchase-orders/${id}`, data),
    delete: (id) => api.delete(`/purchase-orders/${id}`),
    toggleComplete: (id) => api.put(`/purchase-orders/${id}/complete`),
};

export const customersAPI = {
    getAll: () => cachedRead(CACHE_KEYS.customers, () => api.get('/customers')),
    create: (data) => mutating(() => api.post('/customers', data), [CACHE_KEYS.customers]),
    update: (id, data) => mutating(() => api.put(`/customers/${id}`, data), [CACHE_KEYS.customers]),
    delete: (id) => mutating(() => api.delete(`/customers/${id}`), [CACHE_KEYS.customers]),
};

export const adminAPI = {
    // Documented to preserve brands/sizes/customers/menu items, but it is a
    // bulk delete: dropping every key is one refetch against being wrong.
    clearOperationalData: () => mutating(() => api.post('/admin/clear-operational-data'), Object.values(CACHE_KEYS)),
    getActivityLogs: (params) => api.get('/admin/activity-logs', { params }),
    getActivityLogStats: () => api.get('/admin/activity-logs/stats'),
};

export const menuItemsAPI = {
    getAll: () => cachedRead(CACHE_KEYS.menuItems, () => api.get('/menu-items')),
    create: (data) => mutating(() => api.post('/menu-items', data), [CACHE_KEYS.menuItems]),
    update: (id, data) => mutating(() => api.put(`/menu-items/${id}`, data), [CACHE_KEYS.menuItems]),
    delete: (id) => mutating(() => api.delete(`/menu-items/${id}`), [CACHE_KEYS.menuItems]),
    // Reorder and seed both rewrite the whole collection, so both invalidate.
    reorder: (items) => mutating(() => api.put('/menu-items', { items }), [CACHE_KEYS.menuItems]),
    seedDefaults: () => mutating(() => api.post('/menu-items/seed-defaults'), [CACHE_KEYS.menuItems]),
};

export const dashboardAPI = {
    getStats: (date) => api.get('/dashboard/stats' + (date ? `?date=${date}` : '')),
    getPurchaseStock: () => api.get('/dashboard/purchase-stock'),
    getPrintingStockList: () => api.get('/dashboard/printing-stock-list'),
    getFinishedGoodsList: () => api.get('/dashboard/finished-goods-list'),
    getProductionTrend: (period = 'monthly') => api.get(`/dashboard/production-trend?period=${period}`),
    getRecentActivity: () => api.get('/dashboard/recent-activity'),
    getPOSummary: () => api.get('/dashboard/po-summary'),
    getExportAll: () => api.get('/dashboard/export-all'),
};

export const backupsAPI = {
    getAll: () => api.get('/backups'),
    create: () => api.post('/backups'),
    get: (id) => api.get(`/backups/${id}`),
    delete: (id) => api.delete(`/backups/${id}`),
};

export default api;
