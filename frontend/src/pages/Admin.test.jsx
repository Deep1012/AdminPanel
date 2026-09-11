import React from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Admin from './Admin';
import { usersAPI, authAPI, adminAPI } from '../lib/api';

jest.mock('../lib/api');

const USERS = [
    { id: 'u1', username: 'Priya', email: 'priya@timestin.com', role: 'user', is_locked: false, created_at: '2026-01-01T00:00:00.000Z' },
];

// Every check key backend/lib/reconcile.js emits, all at zero.
const CHECK_KEYS = [
    'purchase_sheets_used_drift', 'negative_sheets_available', 'orphan_printing_jobs',
    'po_quantity_dispatched_drift', 'negative_po_remaining', 'dangling_dispatch_po_refs',
    'orphan_production_children', 'negative_printing_stock_available',
    'negative_finished_goods_available', 'duplicate_purchase_sr_no',
    'duplicate_printing_job_number', 'duplicate_dispatch_order_number',
];
const zeroChecks = () => Object.fromEntries(CHECK_KEYS.map((key) => [key, { count: 0, samples: [] }]));

const report = (checks) => {
    const total = Object.values(checks).reduce((sum, c) => sum + c.count, 0);
    return {
        generated_at: '2026-09-11T06:30:00.000Z',
        sample_limit: 50,
        scanned: { purchases: 120, printing_jobs: 50, production: 1420, dispatches: 300, purchase_orders: 110 },
        checks,
        total_issues: total,
        clean: total === 0,
    };
};

beforeEach(() => {
    jest.clearAllMocks();
    usersAPI.getAll.mockResolvedValue({ data: USERS });
    usersAPI.update.mockResolvedValue({ data: {} });
    authAPI.register.mockResolvedValue({ data: {} });
    adminAPI.reconcile.mockResolvedValue({ data: report(zeroChecks()) });
});

describe('data integrity check', () => {
    it('does not run on page load', async () => {
        render(<Admin />);
        await screen.findByTestId('users-table');

        expect(screen.getByTestId('run-reconcile-btn')).toBeInTheDocument();
        expect(adminAPI.reconcile).not.toHaveBeenCalled();
        expect(screen.queryByTestId('reconcile-summary')).not.toBeInTheDocument();
    });

    it('runs on demand and renders a clean result', async () => {
        const user = userEvent.setup({ delay: null });
        render(<Admin />);
        await screen.findByTestId('users-table');

        await user.click(screen.getByTestId('run-reconcile-btn'));

        expect(await screen.findByTestId('reconcile-summary')).toBeInTheDocument();
        expect(adminAPI.reconcile).toHaveBeenCalledTimes(1);
        // 120 + 50 + 1420 + 300 + 110
        expect(screen.getByTestId('reconcile-scanned')).toHaveTextContent('2,000');
        expect(screen.getByTestId('reconcile-total-issues')).toHaveTextContent('0');
        expect(screen.getByTestId('reconcile-status')).toHaveTextContent('Clean');
        expect(screen.getByText('Every check returned zero.')).toBeInTheDocument();
        CHECK_KEYS.forEach((key) => expect(screen.getByTestId(`reconcile-count-${key}`)).toHaveTextContent('0'));
        // Nothing to expand when a check is clean.
        expect(screen.queryByTestId('reconcile-toggle-orphan_printing_jobs')).not.toBeInTheDocument();
    });

    it('renders counts, samples and the expected-gap explanation for a non-clean result', async () => {
        const user = userEvent.setup({ delay: null });
        adminAPI.reconcile.mockResolvedValue({
            data: report({
                ...zeroChecks(),
                orphan_printing_jobs: {
                    count: 2,
                    samples: [
                        { job_id: 'j1', job_number: 'JOB-0007', raw_material_id: 'rm-gone', sheets_from_material: 250 },
                        { job_id: 'j2', job_number: 'JOB-0008', raw_material_id: 'rm-gone', sheets_from_material: 1200 },
                    ],
                },
                negative_printing_stock_available: {
                    count: 144,
                    samples: [{ size_name: '4LTR/5KG', brand_name: 'SYNCOAT', printing_done: 0, used_in_production: 5000, available: -5000 }],
                },
                negative_finished_goods_available: {
                    count: 59,
                    samples: [{ size_name: '500ML', brand_name: 'SANDING SEALER', produced: 14112, dispatched: 43267, available: -29155 }],
                },
            }),
        });
        render(<Admin />);
        await screen.findByTestId('users-table');

        await user.click(screen.getByTestId('run-reconcile-btn'));
        await screen.findByTestId('reconcile-summary');

        expect(screen.getByTestId('reconcile-total-issues')).toHaveTextContent('205');
        expect(screen.getByTestId('reconcile-integrity-issues')).toHaveTextContent('2');
        expect(screen.getByTestId('reconcile-gap-issues')).toHaveTextContent('203');
        expect(screen.getByTestId('reconcile-status')).toHaveTextContent('Not Clean');
        expect(screen.getByTestId('reconcile-count-orphan_printing_jobs')).toHaveTextContent('2');
        expect(screen.getByTestId('reconcile-count-negative_printing_stock_available')).toHaveTextContent('144');
        expect(screen.getByTestId('reconcile-count-negative_finished_goods_available')).toHaveTextContent('59');

        // The two expected checks are framed as gaps to close, with the
        // baseline and the warn-only consequence spelled out.
        const note = screen.getByTestId('reconcile-gaps-note');
        expect(note).toHaveTextContent('expected to be non-zero right now');
        expect(note).toHaveTextContent('data-entry gaps to close, not errors');
        expect(note).toHaveTextContent('144 printing-stock buckets');
        expect(note).toHaveTextContent('102 of them primary brands with no printing jobs recorded at all');
        expect(note).toHaveTextContent('59 finished-goods buckets');
        expect(note).toHaveTextContent('warn-only mode');
        expect(note).toHaveTextContent('Once both counts reach zero, the guards can be switched to enforcing');

        // Samples are collapsed until asked for.
        expect(screen.queryByTestId('reconcile-samples-orphan_printing_jobs')).not.toBeInTheDocument();
        const toggle = screen.getByTestId('reconcile-toggle-orphan_printing_jobs');
        expect(toggle).toHaveAttribute('aria-expanded', 'false');
        await user.click(toggle);
        expect(toggle).toHaveAttribute('aria-expanded', 'true');
        const table = screen.getByTestId('reconcile-samples-orphan_printing_jobs');
        expect(within(table).getByText('JOB-0007')).toBeInTheDocument();
        expect(within(table).getByText('1,200')).toBeInTheDocument();
    });

    it('notes when a check has more rows than the sample returned', async () => {
        const user = userEvent.setup({ delay: null });
        adminAPI.reconcile.mockResolvedValue({
            data: report({
                ...zeroChecks(),
                duplicate_dispatch_order_number: {
                    count: 75,
                    samples: [{ field: 'order_number', value: 'DSP-0999', count: 2, ids: ['d1', 'd2'] }],
                },
            }),
        });
        render(<Admin />);
        await screen.findByTestId('users-table');

        await user.click(screen.getByTestId('run-reconcile-btn'));
        await user.click(await screen.findByTestId('reconcile-toggle-duplicate_dispatch_order_number'));

        const table = screen.getByTestId('reconcile-samples-duplicate_dispatch_order_number');
        expect(within(table).getByText('d1, d2')).toBeInTheDocument();
        expect(screen.getByText(/Showing the first 1 of 75/)).toBeInTheDocument();
    });

    it('surfaces the API error detail', async () => {
        const user = userEvent.setup({ delay: null });
        adminAPI.reconcile.mockRejectedValue({ response: { data: { detail: 'Admin access required' } } });
        render(<Admin />);
        await screen.findByTestId('users-table');

        await user.click(screen.getByTestId('run-reconcile-btn'));

        expect(await screen.findByTestId('reconcile-error')).toHaveTextContent('Admin access required');
        expect(screen.queryByTestId('reconcile-summary')).not.toBeInTheDocument();
        expect(screen.getByTestId('run-reconcile-btn')).toBeEnabled();
    });
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
