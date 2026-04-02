import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs) {
    return twMerge(clsx(inputs));
}

export function formatDate(dateString) {
    if (!dateString) return '-';
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return '-';
    return date.toLocaleDateString('en-IN', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        timeZone: 'UTC',
    });
}

export function formatDateTime(dateString) {
    if (!dateString) return '-';
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return '-';
    return date.toLocaleDateString('en-IN', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        timeZone: 'UTC',
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
 * Parse a date from Excel import. Handles:
 * - JS Date objects (from xlsx cellDates:true)
 * - dd-mm-yyyy or dd/mm/yyyy strings
 * - Excel serial numbers (e.g. 46113)
 * - Native Date-parseable strings (ISO, etc.)
 * Returns "YYYY-MM-DDT12:00:00.000Z" string, or null if unparseable.
 * Uses noon UTC to prevent any timezone from shifting the calendar day.
 * Builds ISO strings directly — avoids Date constructor timezone traps.
 */
export function parseImportDate(value) {
    if (!value) return null;
    const pad = (n) => String(n).padStart(2, '0');
    const noonISO = (y, m, d) => `${y}-${pad(m)}-${pad(d)}T12:00:00.000Z`;

    // Date object (from xlsx cellDates:true) — use UTC accessors only
    if (value instanceof Date && !isNaN(value.getTime())) {
        return noonISO(value.getUTCFullYear(), value.getUTCMonth() + 1, value.getUTCDate());
    }
    // Excel serial number
    if (typeof value === 'number' && value > 0 && value < 2958466) {
        const d = new Date(Date.UTC(1899, 11, 30) + value * 86400000);
        return noonISO(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
    }
    const str = String(value).trim();
    // dd-mm-yyyy or dd/mm/yyyy
    const match = str.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
    if (match) {
        const day = parseInt(match[1], 10);
        const month = parseInt(match[2], 10);
        const year = parseInt(match[3], 10);
        if (day >= 1 && day <= 31 && month >= 1 && month <= 12 && year >= 1900) {
            return noonISO(year, month, day);
        }
    }
    // Fallback: native parse then extract UTC components
    const fb = new Date(str);
    if (!isNaN(fb.getTime()) && fb.getUTCFullYear() > 1900 && fb.getUTCFullYear() < 2100) {
        return noonISO(fb.getUTCFullYear(), fb.getUTCMonth() + 1, fb.getUTCDate());
    }
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
