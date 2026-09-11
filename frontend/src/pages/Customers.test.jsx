import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Customers from './Customers';
import { customersAPI } from '../lib/api';

jest.mock('../lib/api');

const CUSTOMERS = [{ id: 'c1', name: 'Mehta Paints & Hardware', created_at: '2026-01-01T00:00:00.000Z' }];

beforeEach(() => {
    jest.clearAllMocks();
    customersAPI.getAll.mockResolvedValue({ data: CUSTOMERS });
    customersAPI.create.mockResolvedValue({ data: {} });
    customersAPI.update.mockResolvedValue({ data: {} });
});

it('blocks a blank customer name and does not call the API', async () => {
    const user = userEvent.setup({ delay: null });
    render(<Customers />);
    await screen.findByTestId('customers-table');
    await user.click(screen.getByTestId('add-customer-btn'));
    await screen.findByTestId('customer-name-input');

    await user.click(screen.getByTestId('submit-customer'));

    expect(await screen.findByText('Customer name is required')).toBeInTheDocument();
    expect(customersAPI.create).not.toHaveBeenCalled();
});

it('creates a customer with the name trimmed but not upper-cased', async () => {
    const user = userEvent.setup({ delay: null });
    render(<Customers />);
    await screen.findByTestId('customers-table');
    await user.click(screen.getByTestId('add-customer-btn'));

    await user.type(await screen.findByTestId('customer-name-input'), '  Shah Paints  ');
    await user.click(screen.getByTestId('submit-customer'));

    await waitFor(() => expect(customersAPI.create).toHaveBeenCalledTimes(1));
    expect(customersAPI.create).toHaveBeenCalledWith({ name: 'Shah Paints' });
});

it('prefills the edit dialog and sends an unchanged payload', async () => {
    const user = userEvent.setup({ delay: null });
    render(<Customers />);
    await screen.findByTestId('customers-table');

    await user.click(screen.getByTestId('edit-customer-c1'));
    expect(await screen.findByTestId('customer-name-input')).toHaveValue('Mehta Paints & Hardware');

    await user.click(screen.getByTestId('submit-customer'));

    await waitFor(() => expect(customersAPI.update).toHaveBeenCalledTimes(1));
    expect(customersAPI.update).toHaveBeenCalledWith('c1', { name: 'Mehta Paints & Hardware' });
});
