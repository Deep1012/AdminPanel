import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import Login from './Login';
import { AuthProvider } from '../context/AuthContext';
import { authAPI } from '../lib/api';

jest.mock('../lib/api');

const renderLogin = () =>
    render(
        <MemoryRouter>
            <AuthProvider>
                <Login />
            </AuthProvider>
        </MemoryRouter>
    );

beforeEach(() => {
    jest.clearAllMocks();
    localStorage.clear();
    authAPI.login.mockResolvedValue({ data: { token: 'jwt', user: { id: 'u1', username: 'admin', role: 'admin' } } });
    authAPI.getMe.mockResolvedValue({ data: { id: 'u1', username: 'admin', role: 'admin' } });
});

it('blocks an empty submit and does not call the API', async () => {
    const user = userEvent.setup({ delay: null });
    renderLogin();

    await user.click(screen.getByTestId('login-submit'));

    expect(await screen.findByText('Email is required')).toBeInTheDocument();
    expect(screen.getByText('Password is required')).toBeInTheDocument();
    expect(authAPI.login).not.toHaveBeenCalled();
});

it('rejects a malformed email without calling the API', async () => {
    const user = userEvent.setup({ delay: null });
    renderLogin();

    await user.type(screen.getByTestId('login-email'), 'not-an-email');
    await user.type(screen.getByTestId('login-password'), 'admin123');
    await user.click(screen.getByTestId('login-submit'));

    expect(await screen.findByText('Enter a valid email address')).toBeInTheDocument();
    expect(authAPI.login).not.toHaveBeenCalled();
});

it('logs in with valid credentials', async () => {
    const user = userEvent.setup({ delay: null });
    renderLogin();

    await user.type(screen.getByTestId('login-email'), 'admin@crm.com');
    await user.type(screen.getByTestId('login-password'), 'admin123');
    await user.click(screen.getByTestId('login-submit'));

    await waitFor(() => expect(authAPI.login).toHaveBeenCalledTimes(1));
    expect(authAPI.login).toHaveBeenCalledWith('admin@crm.com', 'admin123');
});

it('shows the backend detail message when login fails', async () => {
    const user = userEvent.setup({ delay: null });
    authAPI.login.mockRejectedValue({ response: { data: { detail: 'Account is locked' } } });
    renderLogin();

    await user.type(screen.getByTestId('login-email'), 'admin@crm.com');
    await user.type(screen.getByTestId('login-password'), 'admin123');
    await user.click(screen.getByTestId('login-submit'));

    expect(await screen.findByTestId('login-error')).toHaveTextContent('Account is locked');
});
