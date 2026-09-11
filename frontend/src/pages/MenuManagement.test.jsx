import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import MenuManagement from './MenuManagement';
import { menuItemsAPI } from '../lib/api';

jest.mock('../lib/api');

const ITEMS = [
    { id: 'm1', label: 'REPORTS', path: '/reports', icon: 'Package', display_order: 1, admin_only: true, is_system: false, is_active: true },
];

beforeEach(() => {
    jest.clearAllMocks();
    menuItemsAPI.getAll.mockResolvedValue({ data: ITEMS });
    menuItemsAPI.create.mockResolvedValue({ data: {} });
    menuItemsAPI.update.mockResolvedValue({ data: {} });
});

it('rejects a path without a leading slash and does not call the API', async () => {
    const user = userEvent.setup({ delay: null });
    render(<MenuManagement />);
    await user.click(await screen.findByTestId('add-menu-item-btn'));

    await user.type(await screen.findByTestId('menu-item-label'), 'INVOICES');
    await user.type(screen.getByTestId('menu-item-path'), 'invoices');
    await user.click(screen.getByTestId('submit-menu-item'));

    expect(await screen.findByText('Path must start with /')).toBeInTheDocument();
    expect(menuItemsAPI.create).not.toHaveBeenCalled();
});

it('requires a label and does not call the API', async () => {
    const user = userEvent.setup({ delay: null });
    render(<MenuManagement />);
    await user.click(await screen.findByTestId('add-menu-item-btn'));

    await user.type(await screen.findByTestId('menu-item-path'), '/invoices');
    await user.click(screen.getByTestId('submit-menu-item'));

    expect(await screen.findByText('Label is required')).toBeInTheDocument();
    expect(menuItemsAPI.create).not.toHaveBeenCalled();
});

it('creates a menu item with the default icon and admin flag', async () => {
    const user = userEvent.setup({ delay: null });
    render(<MenuManagement />);
    await user.click(await screen.findByTestId('add-menu-item-btn'));

    await user.type(await screen.findByTestId('menu-item-label'), 'INVOICES');
    await user.type(screen.getByTestId('menu-item-path'), '/invoices');
    await user.click(screen.getByTestId('submit-menu-item'));

    await waitFor(() => expect(menuItemsAPI.create).toHaveBeenCalledTimes(1));
    expect(menuItemsAPI.create).toHaveBeenCalledWith({
        label: 'INVOICES',
        path: '/invoices',
        icon: 'Package',
        admin_only: false,
    });
});

it('prefills the edit dialog and sends an unchanged payload', async () => {
    const user = userEvent.setup({ delay: null });
    render(<MenuManagement />);
    await user.click(await screen.findByTestId('edit-menu-item-m1'));

    expect(await screen.findByTestId('menu-item-label')).toHaveValue('REPORTS');
    expect(screen.getByTestId('menu-item-path')).toHaveValue('/reports');

    await user.click(screen.getByTestId('submit-menu-item'));

    await waitFor(() => expect(menuItemsAPI.update).toHaveBeenCalledTimes(1));
    expect(menuItemsAPI.update).toHaveBeenCalledWith('m1', {
        label: 'REPORTS',
        path: '/reports',
        icon: 'Package',
        admin_only: true,
    });
});
