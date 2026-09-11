import React, { useState, useMemo, useRef, useEffect, useId } from 'react';
import { Input } from './ui/input';

const filterOptions = (options, search) => {
    const term = search.trim().toLowerCase();
    if (!term) return options;
    return options.filter(o => o.label.toLowerCase().includes(term));
};

/**
 * Searchable single-select, implementing the WAI-ARIA combobox pattern.
 *
 * The trigger is a `role="combobox"` button (collapsed state, labelled by the
 * form label). Opening moves focus into a search field, which is itself the
 * active combobox: it owns the listbox via `aria-controls` and points at the
 * highlighted option with `aria-activedescendant`, so DOM focus never leaves
 * the field while the user arrows through results. This is the same split the
 * shadcn Combobox (Popover + cmdk) uses.
 *
 * `aria-selected` marks the option that is actually chosen (`value`), not the
 * highlighted one; the highlight is conveyed by `aria-activedescendant`.
 *
 * Keyboard: ArrowDown/ArrowUp on the trigger open the list; in the search field
 * ArrowUp/ArrowDown move, Home/End jump, Enter chooses, Escape closes and
 * returns focus to the trigger, Tab leaves and closes.
 *
 * @param {object} props
 * @param {Array<{value: string, label: string}>} [props.options]
 * @param {string} [props.value]
 * @param {(value: string) => void} props.onValueChange
 * @param {string} [props.placeholder]
 * @param {string} [props.searchPlaceholder]
 * @param {string} [props.className]
 * @param {boolean} [props.disabled]
 * @param {string} [props['data-testid']] - On the wrapper; the trigger, search
 *   field, listbox and options derive `-trigger`, `-search`, `-listbox` and
 *   `-option-<value>` from it.
 * @param {string} [props.id] - Placed on the trigger so a `<label htmlFor>` (or
 *   the shadcn `FormControl` wrapper, which injects it) can label it. The
 *   `aria-*` props below are forwarded to the trigger for the same reason.
 */
const SearchableSelect = ({
    options = [],
    value,
    onValueChange,
    placeholder = 'Select...',
    searchPlaceholder = 'Search...',
    className = '',
    disabled = false,
    'data-testid': testId,
    id,
    'aria-label': ariaLabel,
    'aria-labelledby': ariaLabelledBy,
    'aria-describedby': ariaDescribedBy,
    'aria-invalid': ariaInvalid,
}) => {
    const [open, setOpen] = useState(false);
    const [search, setSearch] = useState('');
    const [activeIndex, setActiveIndex] = useState(-1);
    const containerRef = useRef(null);
    const triggerRef = useRef(null);
    const inputRef = useRef(null);

    const baseId = useId();
    const listboxId = `${baseId}-listbox`;
    const optionId = (index) => `${baseId}-option-${index}`;
    const subTestId = (suffix) => (testId ? `${testId}-${suffix}` : undefined);

    const selectedOption = options.find(o => o.value === value);

    const filtered = useMemo(() => filterOptions(options, search), [options, search]);

    // `options` can change while the list is open; never point past its end.
    const active = filtered.length === 0 ? -1 : Math.min(activeIndex, filtered.length - 1);
    const activeId = open && active >= 0 ? optionId(active) : undefined;

    const close = ({ restoreFocus = false } = {}) => {
        setOpen(false);
        setSearch('');
        setActiveIndex(-1);
        if (restoreFocus && triggerRef.current) triggerRef.current.focus();
    };

    const openList = () => {
        if (disabled) return;
        // The search is empty on open, so indexes into `options` are indexes
        // into the rendered list. Start on the chosen option, else the first.
        const selectedIndex = options.findIndex(o => o.value === value);
        setActiveIndex(selectedIndex >= 0 ? selectedIndex : (options.length > 0 ? 0 : -1));
        setOpen(true);
    };

    const handleSelect = (optionValue) => {
        onValueChange(optionValue);
        close({ restoreFocus: true });
    };

    useEffect(() => {
        if (open && inputRef.current) {
            inputRef.current.focus();
        }
    }, [open]);

    // Both listeners exist only while the list is open.
    useEffect(() => {
        if (!open) return undefined;

        const handleClickOutside = (e) => {
            if (containerRef.current && !containerRef.current.contains(e.target)) {
                close();
            }
        };

        // Registered on `window` in the capture phase so it runs before Radix
        // Dialog's document-level (capture) Escape listener, which checks
        // `defaultPrevented` before dismissing. Without this, Escape in the
        // search field closes the entire Dispatch/PO dialog and resets the
        // half-filled form instead of just closing this list.
        const handleEscape = (e) => {
            if (e.key !== 'Escape') return;
            if (!containerRef.current || !containerRef.current.contains(e.target)) return;
            e.preventDefault();
            close({ restoreFocus: true });
        };

        document.addEventListener('mousedown', handleClickOutside);
        window.addEventListener('keydown', handleEscape, true);
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
            window.removeEventListener('keydown', handleEscape, true);
        };
    }, [open]);

    // Keep the highlighted option visible while arrowing through a long list.
    useEffect(() => {
        if (!activeId) return;
        const el = document.getElementById(activeId);
        // jsdom does not implement scrollIntoView.
        if (el && typeof el.scrollIntoView === 'function') el.scrollIntoView({ block: 'nearest' });
    }, [activeId]);

    const handleTriggerKeyDown = (e) => {
        if (open) return;
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            e.preventDefault();
            openList();
        }
    };

    const handleSearchChange = (e) => {
        setSearch(e.target.value);
        // Highlight the first match of the new search.
        setActiveIndex(0);
    };

    const handleInputKeyDown = (e) => {
        const last = filtered.length - 1;
        switch (e.key) {
            case 'ArrowDown':
                e.preventDefault();
                setActiveIndex(last < 0 ? -1 : Math.min(active + 1, last));
                break;
            case 'ArrowUp':
                e.preventDefault();
                setActiveIndex(last < 0 ? -1 : Math.max(active - 1, 0));
                break;
            case 'Home':
                e.preventDefault();
                setActiveIndex(last < 0 ? -1 : 0);
                break;
            case 'End':
                e.preventDefault();
                setActiveIndex(last);
                break;
            case 'Enter':
                // Always swallowed: this field sits inside the Dispatch/PO
                // <form>, and letting Enter through would submit it.
                e.preventDefault();
                if (active >= 0) handleSelect(filtered[active].value);
                break;
            default:
                break;
        }
    };

    // Tab / Shift+Tab out of the widget closes it. A null relatedTarget (the
    // window losing focus, a click on something unfocusable) is left to the
    // outside-click handler so switching windows does not collapse the list.
    const handleBlur = (e) => {
        if (!open) return;
        const next = e.relatedTarget;
        if (next && containerRef.current && !containerRef.current.contains(next)) {
            close();
        }
    };

    return (
        <div ref={containerRef} className={`relative ${className}`} data-testid={testId} onBlur={handleBlur}>
            <button
                ref={triggerRef}
                type="button"
                id={id}
                role="combobox"
                aria-haspopup="listbox"
                aria-expanded={open}
                aria-controls={listboxId}
                aria-label={ariaLabel}
                aria-labelledby={ariaLabelledBy}
                aria-describedby={ariaDescribedBy}
                aria-invalid={ariaInvalid}
                disabled={disabled}
                onClick={() => (open ? close() : openList())}
                onKeyDown={handleTriggerKeyDown}
                className="flex h-10 w-full items-center justify-between rounded-sm border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                data-testid={subTestId('trigger')}
            >
                <span className={selectedOption ? 'text-foreground' : 'text-muted-foreground'}>
                    {selectedOption ? selectedOption.label : placeholder}
                </span>
                <svg className="h-4 w-4 opacity-50" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="m6 9 6 6 6-6" />
                </svg>
            </button>
            {open && (
                <div className="absolute z-50 mt-1 w-full rounded-sm border border-border bg-card shadow-md">
                    <div className="p-2">
                        <Input
                            ref={inputRef}
                            role="combobox"
                            aria-expanded={true}
                            aria-controls={listboxId}
                            aria-autocomplete="list"
                            aria-activedescendant={activeId}
                            aria-label={searchPlaceholder}
                            autoComplete="off"
                            value={search}
                            onChange={handleSearchChange}
                            onKeyDown={handleInputKeyDown}
                            placeholder={searchPlaceholder}
                            className="h-8 bg-background border-input rounded-sm text-sm"
                            onClick={(e) => e.stopPropagation()}
                            data-testid={subTestId('search')}
                        />
                    </div>
                    <div className="max-h-60 overflow-y-auto p-1">
                        {/* Kept mounted even when empty so aria-controls always resolves;
                            the empty-state text sits outside it because a listbox may
                            only contain options. */}
                        <div id={listboxId} role="listbox" aria-label={placeholder} data-testid={subTestId('listbox')}>
                            {filtered.map((option, index) => {
                                const isActive = index === active;
                                const isChosen = option.value === value;
                                const tone = isChosen ? 'text-primary font-medium' : 'text-foreground';
                                const fill = isActive
                                    ? (isChosen ? 'bg-primary/20' : 'bg-muted')
                                    : (isChosen ? 'bg-primary/10' : '');
                                return (
                                    <button
                                        key={option.value}
                                        id={optionId(index)}
                                        type="button"
                                        role="option"
                                        aria-selected={isChosen}
                                        // Options are reached with the arrow keys
                                        // from the search field, not with Tab.
                                        tabIndex={-1}
                                        // Keep focus in the search field on click
                                        // so aria-activedescendant stays valid.
                                        onMouseDown={(e) => e.preventDefault()}
                                        onMouseMove={() => { if (!isActive) setActiveIndex(index); }}
                                        onClick={() => handleSelect(option.value)}
                                        className={`flex w-full items-center rounded-sm px-2 py-1.5 text-sm cursor-pointer transition-colors ${tone} ${fill}`}
                                        data-testid={subTestId(`option-${option.value}`)}
                                    >
                                        {option.label}
                                    </button>
                                );
                            })}
                        </div>
                        {filtered.length === 0 && (
                            <div className="py-3 text-center text-sm text-muted-foreground">No results found</div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};

export default SearchableSelect;
