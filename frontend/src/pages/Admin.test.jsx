import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Admin from './Admin';
import { usersAPI, authAPI } from '../lib/api';

jest.mock('../lib/api');

const USERS = [
    { id: 'u1', username: 'Priya', email: 'priya@timestin.com', role: 'user', is_locked: false, created_at: '2026-01-01T00:00:00.000Z' },
];

beforeEach(() => {
    jest.clearAllMocks();
    usersAPI.getAll.mockResolvedValue({ data: USERS });
    usersAPI.update.mockResolvedValue({ data: {} });
    authAPI.register.mockResolvedValue({ data: {} });
});

it('requires a password when creating and does not call the API', async () => {
    const user = userEvent.setup({ delay: null });
    render(<Admin />);
    await screen.findByTestId('users-table');
    await user.click(screen.getByTestId('add-user-btn'));

    await user.type(await screen.findByTestId('new-user-name'), 'Kiran');
    await user.type(screen.getByTestId('new-user-email'), 'kiran@timestin.com');
    await user.click(screen.getByTestId('submit-user'));

    expect(await screen.findByText('Password is required for new users')).toBeInTheDocument();
    expect(authAPI.register).not.toHaveBeenCalled();
});

it('rejects a malformed email without calling the API', async () => {
    const user = userEvent.setup({ delay: null });
    render(<Admin />);
    await screen.findByTestId('users-table');
    await user.click(screen.getByTestId('add-user-btn'));

    await user.type(await screen.findByTestId('new-user-name'), 'Kiran');
    await user.type(screen.getByTestId('new-user-email'), 'kiran-at-timestin');
    await user.type(screen.getByTestId('new-user-password'), 'hunter2');
    await user.click(screen.getByTestId('submit-user'));

    expect(await screen.findByText('Enter a valid email address')).toBeInTheDocument();
    expect(authAPI.register).not.toHaveBeenCalled();
});

it('registers a new user with the default role', async () => {
    const user = userEvent.setup({ delay: null });
    render(<Admin />);
    await screen.findByTestId('users-table');
    await user.click(screen.getByTestId('add-user-btn'));

    await user.type(await screen.findByTestId('new-user-name'), 'Kiran');
    await user.type(screen.getByTestId('new-user-email'), 'kiran@timestin.com');
    await user.type(screen.getByTestId('new-user-password'), 'hunter2');
    await user.click(screen.getByTestId('submit-user'));

    await waitFor(() => expect(authAPI.register).toHaveBeenCalledTimes(1));
    expect(authAPI.register).toHaveBeenCalledWith({
        username: 'Kiran',
        email: 'kiran@timestin.com',
        password: 'hunter2',
        role: 'user',
    });
});

it('prefills the edit dialog and omits the password when left blank', async () => {
    const user = userEvent.setup({ delay: null });
    render(<Admin />);
    await screen.findByTestId('users-table');

    await user.click(screen.getByTestId('edit-user-u1'));

    expect(await screen.findByTestId('new-user-name')).toHaveValue('Priya');
    expect(screen.getByTestId('new-user-email')).toHaveValue('priya@timestin.com');
    expect(screen.getByTestId('new-user-password')).toHaveValue('');

    await user.click(screen.getByTestId('submit-user'));

    await waitFor(() => expect(usersAPI.update).toHaveBeenCalledTimes(1));
    expect(usersAPI.update).toHaveBeenCalledWith('u1', {
        username: 'Priya',
        email: 'priya@timestin.com',
        role: 'user',
    });
    expect(usersAPI.update.mock.calls[0][1]).not.toHaveProperty('password');
});
