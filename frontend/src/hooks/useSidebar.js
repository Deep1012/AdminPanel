import { useState } from 'react';

const STORAGE_KEY = 'sidebar-collapsed';

export function useSidebar() {
    const [isCollapsed, setIsCollapsed] = useState(() => {
        try {
            const stored = localStorage.getItem(STORAGE_KEY);
            return stored ? JSON.parse(stored) : false;
        } catch {
            return false;
        }
    });

    const setCollapsed = (value) => {
        const newValue = typeof value === 'function' ? value(isCollapsed) : value;
        setIsCollapsed(newValue);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(newValue));
    };

    const toggleSidebar = () => setCollapsed((prev) => !prev);

    return { isCollapsed, toggleSidebar, setCollapsed };
}
