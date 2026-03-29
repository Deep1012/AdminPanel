import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs) {
    return twMerge(clsx(inputs));
}

export function formatDate(dateString) {
    if (!dateString) return '-';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-IN', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
    });
}

export function formatDateTime(dateString) {
    if (!dateString) return '-';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-IN', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    });
}

export function formatCurrency(amount) {
    return new Intl.NumberFormat('en-IN', {
        style: 'currency',
        currency: 'INR',
        maximumFractionDigits: 0,
    }).format(amount);
}

export function formatNumber(num) {
    return new Intl.NumberFormat('en-IN').format(num);
}

export function getStatusColor(status) {
    const statusMap = {
        pending: 'status-pending',
        in_progress: 'status-in_progress',
        completed: 'status-completed',
        dispatched: 'status-dispatched',
        delivered: 'status-delivered',
        received: 'status-pending',
        confirmed: 'status-in_progress',
        in_production: 'status-in_progress',
        ready: 'status-completed',
    };
    return statusMap[status] || 'status-pending';
}

export function getPOStatusLabel(status) {
    const labels = {
        received: 'Received',
        confirmed: 'Confirmed',
        in_production: 'In Production',
        ready: 'Ready',
        dispatched: 'Dispatched',
        delivered: 'Delivered',
    };
    return labels[status] || status;
}
