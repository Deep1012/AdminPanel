import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Sizes from './Sizes';
import { sizesAPI } from '../lib/api';

jest.mock('../lib/api');

const SIZES = [{ id: 's1', name: '4LTR/5KG', created_at: '2026-01-01T00:00:00.000Z' }];

beforeEach(() => {
    jest.clearAllMocks();
    sizesAPI.getAll.mockResolvedValue({ data: SIZES });
    sizesAPI.create.mockResolvedValue({ data: {} });
    sizesAPI.update.mockResolvedValue({ data: {} });
});

it('blocks a blank size name and does not call the API', async () => {
    const user = userEvent.setup({ delay: null });
    render(<Sizes />);
    await screen.findByTestId('sizes-table');
    await user.click(screen.getByTestId('add-size-btn'));
    await screen.findByTestId('size-name-input');

    await user.click(screen.getByTestId('submit-size'));

    expect(await screen.findByText('Size name is required')).toBeInTheDocument();
    expect(sizesAPI.create).not.toHaveBeenCalled();
});

it('creates a size with an upper-cased, trimmed name', async () => {
    const user = userEvent.setup({ delay: null });
    render(<Sizes />);
    await screen.findByTestId('sizes-table');
    await user.click(screen.getByTestId('add-size-btn'));

    await user.type(await screen.findByTestId('size-name-input'), '  1ltr  ');
    await user.click(screen.getByTestId('submit-size'));

    await waitFor(() => expect(sizesAPI.create).toHaveBeenCalledTimes(1));
    expect(sizesAPI.create).toHaveBeenCalledWith({ name: '1LTR' });
});

it('prefills the edit dialog and sends an unchanged payload', async () => {
    const user = userEvent.setup({ delay: null });
    render(<Sizes />);
    await screen.findByTestId('sizes-table');

    await user.click(screen.getByTestId('edit-size-s1'));
    expect(await screen.findByTestId('size-name-input')).toHaveValue('4LTR/5KG');

    await user.click(screen.getByTestId('submit-size'));

    await waitFor(() => expect(sizesAPI.update).toHaveBeenCalledTimes(1));
    expect(sizesAPI.update).toHaveBeenCalledWith('s1', { name: '4LTR/5KG' });
});
