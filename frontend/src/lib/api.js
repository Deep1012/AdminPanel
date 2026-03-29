import axios from 'axios';

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

export const brandsAPI = {
    getAll: () => api.get('/brands'),
    create: (data) => api.post('/brands', data),
    update: (id, data) => api.put(`/brands/${id}`, data),
    delete: (id) => api.delete(`/brands/${id}`),
};

export const sizesAPI = {
    getAll: () => api.get('/sizes'),
    create: (data) => api.post('/sizes', data),
    update: (id, data) => api.put(`/sizes/${id}`, data),
    delete: (id) => api.delete(`/sizes/${id}`),
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
    getAll: () => api.get('/production'),
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
};

export const dashboardAPI = {
    getStats: () => api.get('/dashboard/stats'),
    getPurchaseStock: () => api.get('/dashboard/purchase-stock'),
    getPrintingStockList: () => api.get('/dashboard/printing-stock-list'),
    getFinishedGoodsList: () => api.get('/dashboard/finished-goods-list'),
    getProductionTrend: (period = 'monthly') => api.get(`/dashboard/production-trend?period=${period}`),
    getDispatchDistribution: () => api.get('/dashboard/dispatch-distribution'),
    getRecentActivity: () => api.get('/dashboard/recent-activity'),
    getPOSummary: () => api.get('/dashboard/po-summary'),
};

export default api;
