import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Dispatch from './Dispatch';
import { dispatchAPI, brandsAPI, sizesAPI, customersAPI } from '../lib/api';

jest.mock('../lib/api');

const BRANDS = [{ id: 'b1', name: 'SYNCOAT' }];
const SIZES = [{ id: 's1', name: '4LTR/5KG' }];
const CUSTOMERS = [{ id: 'c1', name: 'Mehta Paints' }];
const DISPATCHES = [
    {
        id: 'd1', order_number: 'DSP-001', customer_name: 'Mehta Paints',
        brand_id: 'b1', brand_name: 'SYNCOAT', size_id: 's1', size_name: '4LTR/5KG',
        quantity: 120, total_quantity: 120, purchase_order_id: 'po1',
        items: [{
            brand_id: 'b1', brand_name: 'SYNCOAT', size_id: 's1', size_name: '4LTR/5KG',
            quantity: 120, purchase_order_id: 'po1', notes: 'urgent',
        }],
        notes: null, dispatch_date: '2026-01-05T00:00:00.000Z', created_by: 'admin',
    },
];

beforeEach(() => {
    jest.clearAllMocks();
    dispatchAPI.getAll.mockResolvedValue({ data: DISPATCHES });
    dispatchAPI.create.mockResolvedValue({ data: {} });
    dispatchAPI.update.mockResolvedValue({ data: {} });
    brandsAPI.getAll.mockResolvedValue({ data: BRANDS });
    sizesAPI.getAll.mockResolvedValue({ data: SIZES });
    customersAPI.getAll.mockResolvedValue({ data: CUSTOMERS });
});

it.each([['-5'], ['0']])('refuses to stage an item with quantity %s', async (quantity) => {
    const user = userEvent.setup({ delay: null });
    render(<Dispatch />);
    await screen.findByTestId('dispatch-table');
    await user.click(screen.getByTestId('add-dispatch-btn'));

    await user.type(await screen.findByTestId('dispatch-quantity'), quantity);
    await user.click(screen.getByTestId('add-item-btn'));

    expect(await screen.findByText('Quantity must be at least 1')).toBeInTheDocument();
    // Nothing was appended, so the repeater stays empty and nothing is sent.
    expect(screen.queryByTestId('remove-dispatch-item-0')).not.toBeInTheDocument();
    expect(dispatchAPI.create).not.toHaveBeenCalled();
});

it('names the missing brand and size when staging an item', async () => {
    const user = userEvent.setup({ delay: null });
    render(<Dispatch />);
    await screen.findByTestId('dispatch-table');
    await user.click(screen.getByTestId('add-dispatch-btn'));

    await user.type(await screen.findByTestId('dispatch-quantity'), '10');
    await user.click(screen.getByTestId('add-item-btn'));

    expect(await screen.findByText('Select a brand')).toBeInTheDocument();
    expect(screen.getByText('Select a size')).toBeInTheDocument();
    expect(dispatchAPI.create).not.toHaveBeenCalled();
});

it('prefills the edit dialog with every item and sends a typed, unchanged payload', async () => {
    const user = userEvent.setup({ delay: null });
    render(<Dispatch />);
    await screen.findByTestId('dispatch-table');

    await user.click(screen.getByTestId('edit-dispatch-d1'));

    expect(await screen.findByTestId('dispatch-date')).toHaveValue('2026-01-05');
    expect(screen.getByTestId('dispatch-customer')).toHaveTextContent('Mehta Paints');
    expect(screen.getByText('Added Items (1)')).toBeInTheDocument();
    expect(screen.getByTestId('remove-dispatch-item-0')).toBeInTheDocument();

    await user.click(screen.getByTestId('submit-dispatch'));

    await waitFor(() => expect(dispatchAPI.update).toHaveBeenCalledTimes(1));
    const [id, payload] = dispatchAPI.update.mock.calls[0];
    expect(id).toBe('d1');
    expect(payload).toEqual({
        customer_name: 'Mehta Paints',
        dispatch_date: new Date('2026-01-05').toISOString(),
        notes: null,
        items: [{
            brand_id: 'b1', brand_name: 'SYNCOAT',
            size_id: 's1', size_name: '4LTR/5KG',
            quantity: 120,
            purchase_order_id: 'po1',
            notes: 'urgent',
        }],
    });
    expect(typeof payload.items[0].quantity).toBe('number');
});

it('removing the only item disables submit so nothing is sent', async () => {
    const user = userEvent.setup({ delay: null });
    render(<Dispatch />);
    await screen.findByTestId('dispatch-table');

    await user.click(screen.getByTestId('edit-dispatch-d1'));
    await user.click(await screen.findByTestId('remove-dispatch-item-0'));

    expect(screen.getByTestId('submit-dispatch')).toBeDisabled();
    await user.click(screen.getByTestId('submit-dispatch'));
    expect(dispatchAPI.update).not.toHaveBeenCalled();
});
