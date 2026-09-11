import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import PurchaseOrders from './PurchaseOrders';
import { purchaseOrdersAPI, brandsAPI, sizesAPI, customersAPI } from '../lib/api';

jest.mock('../lib/api');

const BRANDS = [{ id: 'b1', name: 'SYNCOAT' }];
const SIZES = [{ id: 's1', name: '4LTR/5KG' }];
const CUSTOMERS = [{ id: 'c1', name: 'Mehta Paints' }];
const ORDERS = [
    {
        id: 'po1', serial_no: 'PO-20260105-001', date: '2026-01-05T00:00:00.000Z',
        company_name: 'Mehta Paints', brand_id: 'b1', brand_name: 'SYNCOAT',
        size_id: 's1', size_name: '4LTR/5KG', quantity: 1000, quantity_dispatched: 200,
        is_completed: false, notes: 'rush', created_by: 'admin',
    },
];

beforeEach(() => {
    jest.clearAllMocks();
    purchaseOrdersAPI.getAll.mockResolvedValue({ data: ORDERS });
    purchaseOrdersAPI.create.mockResolvedValue({ data: {} });
    purchaseOrdersAPI.update.mockResolvedValue({ data: {} });
    brandsAPI.getAll.mockResolvedValue({ data: BRANDS });
    sizesAPI.getAll.mockResolvedValue({ data: SIZES });
    customersAPI.getAll.mockResolvedValue({ data: CUSTOMERS });
});

// models/PurchaseOrder.js declares quantity: { min: 1 }.
it.each([['-5'], ['0']])('refuses to stage a PO line with quantity %s', async (quantity) => {
    const user = userEvent.setup({ delay: null });
    render(<PurchaseOrders />);
    await screen.findByTestId('po-table');
    await user.click(screen.getByTestId('add-po-btn'));

    await user.type(await screen.findByTestId('po-quantity'), quantity);
    await user.click(screen.getByTestId('add-po-item-btn'));

    expect(await screen.findByText('Quantity must be at least 1')).toBeInTheDocument();
    expect(screen.queryByTestId('remove-po-item-0')).not.toBeInTheDocument();
    expect(purchaseOrdersAPI.create).not.toHaveBeenCalled();
});

it('names the missing brand and size when staging a line', async () => {
    const user = userEvent.setup({ delay: null });
    render(<PurchaseOrders />);
    await screen.findByTestId('po-table');
    await user.click(screen.getByTestId('add-po-btn'));

    await user.type(await screen.findByTestId('po-quantity'), '500');
    await user.click(screen.getByTestId('add-po-item-btn'));

    expect(await screen.findByText('Select a brand')).toBeInTheDocument();
    expect(screen.getByText('Select a size')).toBeInTheDocument();
    expect(purchaseOrdersAPI.create).not.toHaveBeenCalled();
});

it('blocks a zero quantity on the edit dialog and does not call the API', async () => {
    const user = userEvent.setup({ delay: null });
    render(<PurchaseOrders />);
    await screen.findByTestId('po-table');

    await user.click(screen.getByTestId('edit-po-po1'));
    const qty = await screen.findByTestId('po-edit-quantity');
    await user.clear(qty);
    await user.type(qty, '0');
    await user.click(screen.getByTestId('submit-po-edit'));

    expect(await screen.findByText('Quantity must be at least 1')).toBeInTheDocument();
    expect(purchaseOrdersAPI.update).not.toHaveBeenCalled();
});

it('prefills the edit dialog and sends a typed, unchanged payload', async () => {
    const user = userEvent.setup({ delay: null });
    render(<PurchaseOrders />);
    await screen.findByTestId('po-table');

    await user.click(screen.getByTestId('edit-po-po1'));

    expect(await screen.findByTestId('po-edit-date')).toHaveValue('2026-01-05');
    expect(screen.getByTestId('po-edit-company')).toHaveTextContent('Mehta Paints');
    expect(screen.getByTestId('po-edit-quantity')).toHaveValue(1000);

    await user.click(screen.getByTestId('submit-po-edit'));

    await waitFor(() => expect(purchaseOrdersAPI.update).toHaveBeenCalledTimes(1));
    const [id, payload] = purchaseOrdersAPI.update.mock.calls[0];
    expect(id).toBe('po1');
    expect(payload).toEqual({
        date: new Date('2026-01-05').toISOString(),
        company_name: 'Mehta Paints',
        brand_id: 'b1', brand_name: 'SYNCOAT',
        size_id: 's1', size_name: '4LTR/5KG',
        quantity: 1000,
        notes: 'rush',
    });
    expect(typeof payload.quantity).toBe('number');
});
