import React, { useState, useMemo, useRef, useEffect } from 'react';
import { Input } from './ui/input';

const SearchableSelect = ({
    options = [],
    value,
    onValueChange,
    placeholder = 'Select...',
    searchPlaceholder = 'Search...',
    className = '',
    disabled = false,
    'data-testid': testId,
}) => {
    const [open, setOpen] = useState(false);
    const [search, setSearch] = useState('');
    const containerRef = useRef(null);
    const inputRef = useRef(null);

    const selectedOption = options.find(o => o.value === value);

    const filtered = useMemo(() => {
        if (!search.trim()) return options;
        const lower = search.toLowerCase();
        return options.filter(o => o.label.toLowerCase().includes(lower));
    }, [options, search]);

    useEffect(() => {
        const handleClickOutside = (e) => {
            if (containerRef.current && !containerRef.current.contains(e.target)) {
                setOpen(false);
                setSearch('');
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    useEffect(() => {
        if (open && inputRef.current) {
            inputRef.current.focus();
        }
    }, [open]);

    const handleSelect = (optionValue) => {
        onValueChange(optionValue);
        setOpen(false);
        setSearch('');
    };

    return (
        <div ref={containerRef} className={`relative ${className}`} data-testid={testId}>
            <button
                type="button"
                disabled={disabled}
                onClick={() => setOpen(!open)}
                className="flex h-10 w-full items-center justify-between rounded-sm border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
            >
                <span className={selectedOption ? 'text-foreground' : 'text-muted-foreground'}>
                    {selectedOption ? selectedOption.label : placeholder}
                </span>
                <svg className="h-4 w-4 opacity-50" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="m6 9 6 6 6-6" />
                </svg>
            </button>
            {open && (
                <div className="absolute z-50 mt-1 w-full rounded-sm border border-border bg-card shadow-md">
                    <div className="p-2">
                        <Input
                            ref={inputRef}
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            placeholder={searchPlaceholder}
                            className="h-8 bg-background border-input rounded-sm text-sm"
                            onClick={(e) => e.stopPropagation()}
                        />
                    </div>
                    <div className="max-h-60 overflow-y-auto p-1">
                        {filtered.length === 0 ? (
                            <div className="py-3 text-center text-sm text-muted-foreground">No results found</div>
                        ) : (
                            filtered.map((option) => (
                                <button
                                    key={option.value}
                                    type="button"
                                    onClick={() => handleSelect(option.value)}
                                    className={`flex w-full items-center rounded-sm px-2 py-1.5 text-sm cursor-pointer transition-colors
                                        ${option.value === value
                                            ? 'bg-primary/10 text-primary font-medium'
                                            : 'text-foreground hover:bg-muted'
                                        }`}
                                >
                                    {option.label}
                                </button>
                            ))
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};

export default SearchableSelect;
