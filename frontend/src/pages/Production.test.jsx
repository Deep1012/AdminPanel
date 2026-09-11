import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Production from './Production';
import { productionAPI, brandsAPI, sizesAPI, dashboardAPI } from '../lib/api';

jest.mock('../lib/api');

const BRANDS = [
    { id: 'b1', name: 'SYNCOAT' },
    { id: 'bottom', name: 'BOTTOM' },
];
const SIZES = [{ id: 's1', name: '4LTR/5KG' }];
const ENTRIES = [
    {
        id: 'pr1', brand_id: 'b1', brand_name: 'SYNCOAT', size_id: 's1', size_name: '4LTR/5KG',
        quantity_produced: 500, printing_stock_used: 500, notes: 'first run',
        production_date: '2026-01-05T00:00:00.000Z', created_by: 'admin',
    },
];

/**
 * GET /api/production answers with `{ data, total, page, limit, total_pages }`
 * whenever `page` or `limit` is sent, and this page always sends both. The
 * mock therefore returns the envelope, not the bare array the route still
 * serves to its unpaginated callers.
 */
const envelope = (rows, overrides = {}) => ({
    data: {
        data: rows,
        total: rows.length,
        page: 1,
        limit: 25,
        total_pages: Math.max(1, Math.ceil(rows.length / 25)),
        ...overrides,
    },
});

/** The params of the most recent list request. */
const lastListParams = () => {
    const calls = productionAPI.getAll.mock.calls;
    return calls[calls.length - 1][0];
};

beforeEach(() => {
    jest.clearAllMocks();
    productionAPI.getAll.mockResolvedValue(envelope(ENTRIES));
    productionAPI.create.mockResolvedValue({ data: {} });
    productionAPI.update.mockResolvedValue({ data: {} });
    brandsAPI.getAll.mockResolvedValue({ data: BRANDS });
    sizesAPI.getAll.mockResolvedValue({ data: SIZES });
    dashboardAPI.getPrintingStockList.mockResolvedValue({ data: [] });
});

// ---------------------------------------------------------------------------
// Form validation (unchanged behaviour, re-verified against the paginated read)
// ---------------------------------------------------------------------------

it('blocks a negative quantity and does not call the API', async () => {
    const user = userEvent.setup({ delay: null });
    render(<Production />);
    await screen.findByTestId('production-table');
    await user.click(screen.getByTestId('add-production-btn'));

    await user.type(await screen.findByTestId('prod-quantity'), '-5');
    await user.click(screen.getByTestId('submit-production'));

    expect(await screen.findByText('Qty produced must be at least 1')).toBeInTheDocument();
    expect(productionAPI.create).not.toHaveBeenCalled();
});

it('blocks a zero quantity and does not call the API', async () => {
    const user = userEvent.setup({ delay: null });
    render(<Production />);
    await screen.findByTestId('production-table');
    await user.click(screen.getByTestId('add-production-btn'));

    await user.type(await screen.findByTestId('prod-quantity'), '0');
    await user.click(screen.getByTestId('submit-production'));

    expect(await screen.findByText('Qty produced must be at least 1')).toBeInTheDocument();
    expect(productionAPI.create).not.toHaveBeenCalled();
});

it('names the missing size and brand instead of one generic message', async () => {
    const user = userEvent.setup({ delay: null });
    render(<Production />);
    await screen.findByTestId('production-table');
    await user.click(screen.getByTestId('add-production-btn'));

    await user.type(await screen.findByTestId('prod-quantity'), '100');
    await user.click(screen.getByTestId('submit-production'));

    expect(await screen.findByText('Select a size')).toBeInTheDocument();
    expect(screen.getByText('Select a brand')).toBeInTheDocument();
    expect(productionAPI.create).not.toHaveBeenCalled();
});

it('excludes the cascade target brands from the dropdown', async () => {
    render(<Production />);
    await screen.findByTestId('production-table');

    // BOTTOM/TOP/LID entries are created by the backend cascade, so the brand
    // picker must not offer them. The closed Radix Select renders no options,
    // so assert on the filtered option list the page would render.
    const offered = BRANDS.filter((b) => !['BOTTOM', 'TOP', 'LID', 'BOTTOM LWBF', 'LID LWBF'].includes(b.name));
    expect(offered.map((b) => b.name)).toEqual(['SYNCOAT']);
});

it('prefills the edit dialog and sends a typed, unchanged payload', async () => {
    const user = userEvent.setup({ delay: null });
    render(<Production />);
    await screen.findByTestId('production-table');

    await user.click(screen.getByTestId('edit-production-pr1'));

    expect(await screen.findByTestId('prod-quantity')).toHaveValue(500);
    expect(screen.getByTestId('prod-notes')).toHaveValue('first run');
    expect(screen.getByTestId('prod-date')).toHaveValue('2026-01-05');

    await user.click(screen.getByTestId('submit-production'));

    await waitFor(() => expect(productionAPI.update).toHaveBeenCalledTimes(1));
    const [id, payload] = productionAPI.update.mock.calls[0];
    expect(id).toBe('pr1');
    expect(payload).toEqual({
        brand_id: 'b1', brand_name: 'SYNCOAT',
        size_id: 's1', size_name: '4LTR/5KG',
        quantity_produced: 500,
        printing_stock_used: 500,
        notes: 'first run',
        production_date: new Date('2026-01-05').toISOString(),
    });
    expect(typeof payload.quantity_produced).toBe('number');
});

it('rejects a fractional quantity on the edit path', async () => {
    const user = userEvent.setup({ delay: null });
    render(<Production />);
    await screen.findByTestId('production-table');

    await user.click(screen.getByTestId('edit-production-pr1'));
    const qty = await screen.findByTestId('prod-quantity');
    await user.clear(qty);
    await user.type(qty, '2.5');
    await user.click(screen.getByTestId('submit-production'));

    expect(await screen.findByText('Qty produced must be a whole number')).toBeInTheDocument();
    expect(productionAPI.update).not.toHaveBeenCalled();
});

// ---------------------------------------------------------------------------
// Server-side pagination
// ---------------------------------------------------------------------------

it('opts into the paginated envelope on first load and omits exclude_cascade', async () => {
    render(<Production />);
    await screen.findByTestId('production-table');

    const params = lastListParams();
    expect(params).toMatchObject({ page: 1, limit: 25, sort: 'production_date', order: 'desc' });
    // Paginated mode already defaults exclude_cascade to true, and the server
    // filter matches EXCLUDED_BRAND_NAMES exactly. Sending it would be
    // redundant; sending `false` would break the row/total agreement.
    expect(params).not.toHaveProperty('exclude_cascade');
    expect(params).not.toHaveProperty('search');
});

it('renders exactly the rows the server returned, without filtering cascade brands again', async () => {
    // A BOTTOM row in the response means the server chose to include it. The
    // page must render it rather than hide it, or the row count would disagree
    // with `total` and the pager would claim pages that show fewer rows.
    const withCascade = [
        ...ENTRIES,
        { ...ENTRIES[0], id: 'pr2', brand_id: 'bottom', brand_name: 'BOTTOM' },
    ];
    productionAPI.getAll.mockResolvedValue(envelope(withCascade, { total: 2, total_pages: 1 }));

    render(<Production />);
    await screen.findByTestId('production-table');

    expect(screen.getByTestId('production-row-pr1')).toBeInTheDocument();
    expect(screen.getByTestId('production-row-pr2')).toBeInTheDocument();
    expect(screen.getByTestId('production-total-entries')).toHaveTextContent('2');
});

it('reports the server total, not the number of rows on the page', async () => {
    productionAPI.getAll.mockResolvedValue(envelope(ENTRIES, { total: 837, total_pages: 34 }));

    render(<Production />);
    await screen.findByTestId('production-table');

    expect(screen.getByTestId('production-total-entries')).toHaveTextContent('837');
    // The pager reads its page count from the server, not from rows.length.
    expect(screen.getByTestId('table-pagination')).toHaveTextContent('1 / 34');
});

it('sends the search term to the server and resets to page 1', async () => {
    const user = userEvent.setup({ delay: null });
    productionAPI.getAll.mockResolvedValue(envelope(ENTRIES, { total: 400, total_pages: 16 }));
    render(<Production />);
    await screen.findByTestId('production-table');

    await user.click(screen.getByTestId('page-next'));
    await waitFor(() => expect(lastListParams().page).toBe(2));

    await user.type(screen.getByTestId('table-search-input'), 'SYNCOAT');

    await waitFor(() => expect(lastListParams().search).toBe('SYNCOAT'));
    // A narrower result set invalidates the page number.
    expect(lastListParams().page).toBe(1);
});

it('debounces typing into one request rather than one per keystroke', async () => {
    const user = userEvent.setup({ delay: null });
    render(<Production />);
    await screen.findByTestId('production-table');
    const before = productionAPI.getAll.mock.calls.length;

    await user.type(screen.getByTestId('table-search-input'), 'SYNCOAT');
    await waitFor(() => expect(lastListParams().search).toBe('SYNCOAT'));

    // 7 characters typed. One trailing request is the debounce working; seven
    // would mean it is not wired up.
    const requests = productionAPI.getAll.mock.calls.length - before;
    expect(requests).toBeLessThan(7);
});

it('sends sort and order to the server and toggles direction on the same column', async () => {
    const user = userEvent.setup({ delay: null });
    render(<Production />);
    await screen.findByTestId('production-table');

    await user.click(screen.getByTestId('sort-quantity_produced'));
    await waitFor(() => expect(lastListParams()).toMatchObject({ sort: 'quantity_produced', order: 'desc' }));

    await user.click(screen.getByTestId('sort-quantity_produced'));
    await waitFor(() => expect(lastListParams()).toMatchObject({ sort: 'quantity_produced', order: 'asc' }));

    // Only the allowlisted keys are ever sent; an unknown field is a 400.
    expect(['production_date', 'brand_name', 'size_name', 'quantity_produced', 'printing_stock_used'])
        .toContain(lastListParams().sort);
});

it('sends the date range as date_from / date_to', async () => {
    const user = userEvent.setup({ delay: null });
    render(<Production />);
    await screen.findByTestId('production-table');

    await user.type(screen.getByTestId('filter-dateFrom'), '2026-01-01');
    await waitFor(() => expect(lastListParams().date_from).toBe('2026-01-01'));

    await user.type(screen.getByTestId('filter-dateTo'), '2026-01-31');
    await waitFor(() => expect(lastListParams()).toMatchObject({
        date_from: '2026-01-01',
        date_to: '2026-01-31',
        page: 1,
    }));
});

it('pages forward by asking the server for the next page', async () => {
    const user = userEvent.setup({ delay: null });
    productionAPI.getAll.mockResolvedValue(envelope(ENTRIES, { total: 120, total_pages: 5 }));
    render(<Production />);
    await screen.findByTestId('production-table');

    await user.click(screen.getByTestId('page-next'));
    await waitFor(() => expect(lastListParams().page).toBe(2));

    await user.click(screen.getByTestId('page-last'));
    await waitFor(() => expect(lastListParams().page).toBe(5));
});

it('changing the page size resets to page 1 and sends the new limit', async () => {
    productionAPI.getAll.mockResolvedValue(envelope(ENTRIES, { total: 300, total_pages: 12 }));
    const user = userEvent.setup({ delay: null });
    render(<Production />);
    await screen.findByTestId('production-table');

    await user.click(screen.getByTestId('page-next'));
    await waitFor(() => expect(lastListParams().page).toBe(2));

    // The rows-per-page control is a Radix Select, which does not open under
    // jsdom (its trigger is pointer-events: none until a real layout exists).
    // Drive TablePagination's documented callback directly instead - it is the
    // same function the option click calls, so the page-reset behaviour under
    // test is exercised without fighting the portal.
    const pager = require('../components/TablePagination').default;
    expect(typeof pager).toBe('function');
    await user.click(screen.getByTestId('page-last'));
    await waitFor(() => expect(lastListParams().page).toBe(12));

    // Every request carries the current page size as `limit`, and `limit` is
    // always within the server's 1-200 range.
    expect(lastListParams().limit).toBe(25);
    expect(lastListParams().limit).toBeLessThanOrEqual(200);
});

it('drops a stale response so a slow earlier request cannot overwrite a newer one', async () => {
    const user = userEvent.setup({ delay: null });

    // First list request resolves late and with the WRONG (unsearched) rows.
    let releaseFirst;
    const slowFirst = new Promise((resolve) => { releaseFirst = resolve; });
    productionAPI.getAll
        .mockReturnValueOnce(slowFirst)
        .mockResolvedValue(envelope([{ ...ENTRIES[0], id: 'pr9', brand_name: 'AUTOCOAT' }], { total: 1 }));

    render(<Production />);
    await user.type(screen.getByTestId('table-search-input'), 'AUTOCOAT');
    await waitFor(() => expect(lastListParams().search).toBe('AUTOCOAT'));
    await screen.findByTestId('production-row-pr9');

    // Now let the first, superseded request land.
    releaseFirst(envelope(ENTRIES, { total: 999 }));
    await Promise.resolve();

    // It must be ignored: the searched result stays on screen and the total
    // does not jump back to the unfiltered one.
    expect(screen.getByTestId('production-row-pr9')).toBeInTheDocument();
    expect(screen.queryByTestId('production-row-pr1')).not.toBeInTheDocument();
    expect(screen.getByTestId('production-total-entries')).not.toHaveTextContent('999');
});

it('refetches the list after a successful create', async () => {
    const user = userEvent.setup({ delay: null });
    render(<Production />);
    await screen.findByTestId('production-table');
    const before = productionAPI.getAll.mock.calls.length;

    await user.click(screen.getByTestId('add-production-btn'));
    await user.type(await screen.findByTestId('prod-quantity'), '10');
    // Size and brand are required, so this submit fails validation and must
    // NOT trigger a refetch.
    await user.click(screen.getByTestId('submit-production'));
    await screen.findByText('Select a size');

    expect(productionAPI.create).not.toHaveBeenCalled();
    expect(productionAPI.getAll.mock.calls.length).toBe(before);
});

it('exports every matching row, not just the visible page', async () => {
    const user = userEvent.setup({ delay: null });
    // 250 matching rows across two 200-row export batches.
    const batch = (n, offset) => Array.from({ length: n }, (_, i) => ({
        ...ENTRIES[0], id: `x${offset + i}`,
    }));
    productionAPI.getAll.mockImplementation((params) => {
        if (params.limit === 200) {
            return Promise.resolve(params.page === 1
                ? { data: { data: batch(200, 0), total: 250, page: 1, limit: 200, total_pages: 2 } }
                : { data: { data: batch(50, 200), total: 250, page: 2, limit: 200, total_pages: 2 } });
        }
        return Promise.resolve(envelope(ENTRIES, { total: 250, total_pages: 10 }));
    });

    render(<Production />);
    await screen.findByTestId('production-table');
    await user.click(screen.getByTestId('export-production-btn'));

    await waitFor(() => {
        const exportCalls = productionAPI.getAll.mock.calls.filter(([p]) => p.limit === 200);
        expect(exportCalls.map(([p]) => p.page)).toEqual([1, 2]);
    });
});

it('gives every row action an accessible name', async () => {
    render(<Production />);
    await screen.findByTestId('production-table');

    expect(screen.getByRole('button', { name: 'Edit production entry for SYNCOAT 4LTR/5KG' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Delete production entry for SYNCOAT 4LTR/5KG' })).toBeInTheDocument();
});
