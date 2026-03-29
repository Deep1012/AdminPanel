import axios from 'axios';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API_BASE = `${BACKEND_URL}/api`;

// Create axios instance
const api = axios.create({
    baseURL: API_BASE,
    headers: {
        'Content-Type': 'application/json',
    },
});

// Add auth token to requests
api.interceptors.request.use((config) => {
    const token = localStorage.getItem('token');
    if (token) {
        config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
});

// Handle auth errors
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

// Auth APIs
export const authAPI = {
    login: (email, password) => api.post('/auth/login', { email, password }),
    register: (data) => api.post('/auth/register', data),
    getMe: () => api.get('/auth/me'),
};

// Users APIs
export const usersAPI = {
    getAll: () => api.get('/users'),
    update: (id, data) => api.put(`/users/${id}`, data),
    delete: (id) => api.delete(`/users/${id}`),
};

// Brands APIs
export const brandsAPI = {
    getAll: () => api.get('/brands'),
    create: (data) => api.post('/brands', data),
    delete: (id) => api.delete(`/brands/${id}`),
};

// Sizes APIs
export const sizesAPI = {
    getAll: () => api.get('/sizes'),
    create: (data) => api.post('/sizes', data),
    delete: (id) => api.delete(`/sizes/${id}`),
};

// Purchase APIs
export const purchaseAPI = {
    getAll: () => api.get('/purchases'),
    getAvailable: () => api.get('/purchases/available'),
    create: (data) => api.post('/purchases', data),
    delete: (id) => api.delete(`/purchases/${id}`),
};

// Printing Jobs APIs
export const printingAPI = {
    getAll: () => api.get('/printing-jobs'),
    create: (data) => api.post('/printing-jobs', data),
    update: (id, data) => api.put(`/printing-jobs/${id}`, data),
    delete: (id) => api.delete(`/printing-jobs/${id}`),
};

// Production APIs
export const productionAPI = {
    getAll: () => api.get('/production'),
    create: (data) => api.post('/production', data),
    delete: (id) => api.delete(`/production/${id}`),
};

// Dispatch APIs
export const dispatchAPI = {
    getAll: () => api.get('/dispatch'),
    create: (data) => api.post('/dispatch', data),
    update: (id, data) => api.put(`/dispatch/${id}`, data),
    delete: (id) => api.delete(`/dispatch/${id}`),
};

// Dashboard APIs
export const dashboardAPI = {
    getStats: () => api.get('/dashboard/stats'),
    getPurchaseStock: () => api.get('/dashboard/purchase-stock'),
    getPrintingStockList: () => api.get('/dashboard/printing-stock-list'),
    getFinishedGoodsList: () => api.get('/dashboard/finished-goods-list'),
};

// Seed Data
export const seedAPI = {
    seed: () => api.post('/seed'),
};

export default api;
