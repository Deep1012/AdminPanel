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

/**
 * Parse a date string in dd-mm-yyyy or dd/mm/yyyy format (or fallback to native Date parsing).
 * Returns an ISO string. If parsing fails, returns current date ISO string.
 */
export function parseImportDate(value) {
    if (!value) return null;
    const str = String(value).trim();
    // Match dd-mm-yyyy or dd/mm/yyyy
    const match = str.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
    if (match) {
        const day = parseInt(match[1], 10);
        const month = parseInt(match[2], 10) - 1;
        const year = parseInt(match[3], 10);
        const date = new Date(year, month, day);
        // Validate parsed date matches input (catches auto-correction of invalid dates)
        if (!isNaN(date.getTime()) && date.getDate() === day && date.getMonth() === month && date.getFullYear() === year) {
            return date.toISOString();
        }
    }
    // Fallback: try native Date parsing
    const fallback = new Date(str);
    if (!isNaN(fallback.getTime())) return fallback.toISOString();
    return null;
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
