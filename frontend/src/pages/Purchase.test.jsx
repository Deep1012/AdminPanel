import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Purchase from './Purchase';
import { purchaseAPI } from '../lib/api';

jest.mock('../lib/api');

const PURCHASES = [
    {
        id: 'p1', sr_no: 'RM-001', gauge: 0.18, size1: 914, size2: 1219, temper: 'T4',
        weight: 5000, no_of_sheets: 3100, sheets_used: 0, sheets_available: 3100,
        supplier: 'Tata Steel', invoice_number: 'INV-001',
        purchase_date: '2026-01-05T00:00:00.000Z', created_by: 'admin',
    },
];

beforeEach(() => {
    jest.clearAllMocks();
    purchaseAPI.getAll.mockResolvedValue({ data: PURCHASES });
    purchaseAPI.create.mockResolvedValue({ data: {} });
    purchaseAPI.update.mockResolvedValue({ data: {} });
});

const fillValidPurchase = async (user, overrides = {}) => {
    const values = { gauge: '0.18', size1: '914', size2: '1219', temper: 'T4', weight: '5000', ...overrides };
    const fill = async (testId, value) => {
        const field = screen.getByTestId(testId);
        await user.clear(field);
        // userEvent.type() rejects an empty string, so leaving a field blank
        // just means clearing it.
        if (value !== '') await user.type(field, value);
    };
    await fill('purchase-gauge', values.gauge);
    await fill('purchase-size1', values.size1);
    await fill('purchase-size2', values.size2);
    await fill('purchase-temper', values.temper);
    await fill('purchase-weight', values.weight);
};

const openCreate = async (user) => {
    render(<Purchase />);
    await screen.findByTestId('purchase-table');
    await user.click(screen.getByTestId('add-purchase-btn'));
    await screen.findByTestId('purchase-gauge');
};

// The truthy checks this replaced let "-5" through, and parseFloat('-5')
// reached the API; routes/purchases.js then answered 400.
it.each([
    ['purchase-gauge', 'Gauge must be greater than 0'],
    ['purchase-size1', 'Size 1 must be greater than 0'],
    ['purchase-size2', 'Size 2 must be greater than 0'],
    ['purchase-weight', 'Weight must be greater than 0'],
])('blocks a negative value in %s and does not call the API', async (testId, message) => {
    const user = userEvent.setup({ delay: null });
    await openCreate(user);

    await fillValidPurchase(user);
    await user.clear(screen.getByTestId(testId));
    await user.type(screen.getByTestId(testId), '-5');
    await user.click(screen.getByTestId('purchase-submit'));

    expect(await screen.findByText(message)).toBeInTheDocument();
    expect(purchaseAPI.create).not.toHaveBeenCalled();
});

it('blocks a zero weight and does not call the API', async () => {
    const user = userEvent.setup({ delay: null });
    await openCreate(user);

    await fillValidPurchase(user, { weight: '0' });
    await user.click(screen.getByTestId('purchase-submit'));

    expect(await screen.findByText('Weight must be greater than 0')).toBeInTheDocument();
    expect(purchaseAPI.create).not.toHaveBeenCalled();
});

it('requires a temper and does not call the API', async () => {
    const user = userEvent.setup({ delay: null });
    await openCreate(user);

    await fillValidPurchase(user, { temper: '' });
    await user.click(screen.getByTestId('purchase-submit'));

    expect(await screen.findByText('Temper is required')).toBeInTheDocument();
    expect(purchaseAPI.create).not.toHaveBeenCalled();
});

it('sends numbers, not strings, for a valid entry', async () => {
    const user = userEvent.setup({ delay: null });
    await openCreate(user);

    await fillValidPurchase(user);
    await user.click(screen.getByTestId('purchase-submit'));

    await waitFor(() => expect(purchaseAPI.create).toHaveBeenCalledTimes(1));
    const payload = purchaseAPI.create.mock.calls[0][0];
    expect(payload).toMatchObject({
        gauge: 0.18, size1: 914, size2: 1219, temper: 'T4', weight: 5000,
        supplier: null, invoice_number: null,
    });
    expect(typeof payload.gauge).toBe('number');
    expect(typeof payload.weight).toBe('number');
    expect(payload).not.toHaveProperty('sr_no');
});

it('prefills the edit dialog and sends an unchanged payload', async () => {
    const user = userEvent.setup({ delay: null });
    render(<Purchase />);
    await screen.findByTestId('purchase-table');

    await user.click(screen.getByTestId('edit-purchase-p1'));

    expect(await screen.findByTestId('purchase-gauge')).toHaveValue(0.18);
    expect(screen.getByTestId('purchase-size1')).toHaveValue(914);
    expect(screen.getByTestId('purchase-size2')).toHaveValue(1219);
    expect(screen.getByTestId('purchase-temper')).toHaveValue('T4');
    expect(screen.getByTestId('purchase-weight')).toHaveValue(5000);
    expect(screen.getByTestId('purchase-supplier')).toHaveValue('Tata Steel');
    expect(screen.getByTestId('purchase-invoice')).toHaveValue('INV-001');
    expect(screen.getByTestId('purchase-date')).toHaveValue('2026-01-05');

    await user.click(screen.getByTestId('purchase-submit'));

    await waitFor(() => expect(purchaseAPI.update).toHaveBeenCalledTimes(1));
    expect(purchaseAPI.update).toHaveBeenCalledWith('p1', {
        gauge: 0.18, size1: 914, size2: 1219, temper: 'T4', weight: 5000,
        supplier: 'Tata Steel', invoice_number: 'INV-001',
        purchase_date: new Date('2026-01-05').toISOString(),
    });
});
