import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Brands from './Brands';
import { brandsAPI } from '../lib/api';

jest.mock('../lib/api');

const BRANDS = [{ id: 'b1', name: 'SYNCOAT', is_lwbf: false, created_at: '2026-01-01T00:00:00.000Z' }];

beforeEach(() => {
    jest.clearAllMocks();
    brandsAPI.getAll.mockResolvedValue({ data: BRANDS });
    brandsAPI.create.mockResolvedValue({ data: {} });
    brandsAPI.update.mockResolvedValue({ data: {} });
});

const openCreateDialog = async (user) => {
    render(<Brands />);
    await screen.findByTestId('brands-table');
    await user.click(screen.getByTestId('add-brand-btn'));
    return screen.findByTestId('brand-name-input');
};

it('blocks a blank brand name and does not call the API', async () => {
    const user = userEvent.setup({ delay: null });
    await openCreateDialog(user);

    await user.click(screen.getByTestId('submit-brand'));

    expect(await screen.findByText('Brand name is required')).toBeInTheDocument();
    expect(brandsAPI.create).not.toHaveBeenCalled();
});

it('rejects a whitespace-only name', async () => {
    const user = userEvent.setup({ delay: null });
    const input = await openCreateDialog(user);

    await user.type(input, '   ');
    await user.click(screen.getByTestId('submit-brand'));

    expect(await screen.findByText('Brand name is required')).toBeInTheDocument();
    expect(brandsAPI.create).not.toHaveBeenCalled();
});

it('creates a brand with an upper-cased, trimmed name', async () => {
    const user = userEvent.setup({ delay: null });
    const input = await openCreateDialog(user);

    await user.type(input, '  autocoat  ');
    await user.click(screen.getByTestId('submit-brand'));

    await waitFor(() => expect(brandsAPI.create).toHaveBeenCalledTimes(1));
    expect(brandsAPI.create).toHaveBeenCalledWith({ name: 'AUTOCOAT' });
});

it('prefills the edit dialog and sends an unchanged payload', async () => {
    const user = userEvent.setup({ delay: null });
    render(<Brands />);
    await screen.findByTestId('brands-table');

    await user.click(screen.getByTestId('edit-brand-b1'));

    const input = await screen.findByTestId('brand-name-input');
    expect(input).toHaveValue('SYNCOAT');

    await user.click(screen.getByTestId('submit-brand'));

    await waitFor(() => expect(brandsAPI.update).toHaveBeenCalledTimes(1));
    expect(brandsAPI.update).toHaveBeenCalledWith('b1', { name: 'SYNCOAT' });
    expect(brandsAPI.create).not.toHaveBeenCalled();
});
