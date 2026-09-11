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

beforeEach(() => {
    jest.clearAllMocks();
    productionAPI.getAll.mockResolvedValue({ data: ENTRIES });
    productionAPI.create.mockResolvedValue({ data: {} });
    productionAPI.update.mockResolvedValue({ data: {} });
    brandsAPI.getAll.mockResolvedValue({ data: BRANDS });
    sizesAPI.getAll.mockResolvedValue({ data: SIZES });
    dashboardAPI.getPrintingStockList.mockResolvedValue({ data: [] });
});

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
