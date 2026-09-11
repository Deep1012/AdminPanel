import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Printing from './Printing';
import { printingAPI, brandsAPI, sizesAPI, purchaseAPI } from '../lib/api';

jest.mock('../lib/api');

const BRANDS = [{ id: 'b1', name: 'SYNCOAT' }];
const SIZES = [{ id: 's1', name: '4LTR/5KG' }];
const MATERIALS = [
    {
        id: 'rm1', sr_no: 'RM-001', gauge: 0.18, size1: 914, size2: 1219, temper: 'T4',
        no_of_sheets: 3100, sheets_used: 0, sheets_available: 3100, weight: 5000,
        display_name: 'RM-001 - 914x1219 | G:0.18 | 5000kg (3100 sheets)',
    },
];
const JOBS = [
    {
        id: 'j1', job_number: 'JOB-001', raw_material_id: 'rm1', raw_material_sr_no: 'RM-001',
        raw_material_size: '914x1219', sheets_from_material: 250, total_bodies: 4,
        sizes: [{ size_id: 's1', size_name: '4LTR/5KG', brands: [{ brand_id: 'b1', brand_name: 'SYNCOAT', bodies_count: 4 }] }],
        notes: 'line 2', job_date: '2026-01-05T00:00:00.000Z', created_by: 'admin',
    },
];

beforeEach(() => {
    jest.clearAllMocks();
    printingAPI.getAll.mockResolvedValue({ data: JOBS });
    printingAPI.create.mockResolvedValue({ data: {} });
    printingAPI.update.mockResolvedValue({ data: {} });
    brandsAPI.getAll.mockResolvedValue({ data: BRANDS });
    sizesAPI.getAll.mockResolvedValue({ data: SIZES });
    purchaseAPI.getAvailable.mockResolvedValue({ data: MATERIALS });
});

it.each([['-5'], ['0']])('refuses to stage an entry with %s bodies', async (bodies) => {
    const user = userEvent.setup({ delay: null });
    render(<Printing />);
    await screen.findByTestId('jobs-table');
    await user.click(screen.getByTestId('add-job-btn'));

    await user.type(await screen.findByTestId('bodies-count'), bodies);
    await user.click(screen.getByTestId('add-entry-btn'));

    expect(await screen.findByText('Bodies must be at least 1')).toBeInTheDocument();
    expect(screen.queryByTestId('remove-entry-0')).not.toBeInTheDocument();
    expect(printingAPI.create).not.toHaveBeenCalled();
});

it('names the missing size and brand when staging an entry', async () => {
    const user = userEvent.setup({ delay: null });
    render(<Printing />);
    await screen.findByTestId('jobs-table');
    await user.click(screen.getByTestId('add-job-btn'));

    await user.type(await screen.findByTestId('bodies-count'), '4');
    await user.click(screen.getByTestId('add-entry-btn'));

    expect(await screen.findByText('Select a size')).toBeInTheDocument();
    expect(screen.getByText('Select a brand')).toBeInTheDocument();
    expect(printingAPI.create).not.toHaveBeenCalled();
});

// routes/printingJobs.js rejects a total sheets_used <= 0.
it('keeps submit disabled while sheets used is zero', async () => {
    const user = userEvent.setup({ delay: null });
    render(<Printing />);
    await screen.findByTestId('jobs-table');
    await user.click(screen.getByTestId('add-job-btn'));

    await user.type(await screen.findByTestId('sheets-used'), '0');

    expect(screen.getByTestId('submit-job')).toBeDisabled();
    await user.click(screen.getByTestId('submit-job'));
    expect(printingAPI.create).not.toHaveBeenCalled();
});

it('blocks a negative sheets used on the edit dialog and does not call the API', async () => {
    const user = userEvent.setup({ delay: null });
    render(<Printing />);
    await screen.findByTestId('jobs-table');

    await user.click(screen.getByTestId('edit-job-j1'));
    const sheets = await screen.findByTestId('edit-sheets-used');
    await user.clear(sheets);
    await user.type(sheets, '-10');
    await user.click(screen.getByTestId('submit-edit-job'));

    expect(await screen.findByText('Sheets used must be at least 1')).toBeInTheDocument();
    expect(printingAPI.update).not.toHaveBeenCalled();
});

it('prefills the edit dialog and sends a typed, unchanged payload', async () => {
    const user = userEvent.setup({ delay: null });
    render(<Printing />);
    await screen.findByTestId('jobs-table');

    await user.click(screen.getByTestId('edit-job-j1'));

    expect(await screen.findByTestId('edit-job-date')).toHaveValue('2026-01-05');
    expect(screen.getByTestId('edit-sheets-used')).toHaveValue(250);
    expect(screen.getByTestId('edit-job-notes')).toHaveValue('line 2');
    expect(screen.getByText('Entries (1)')).toBeInTheDocument();

    await user.click(screen.getByTestId('submit-edit-job'));

    await waitFor(() => expect(printingAPI.update).toHaveBeenCalledTimes(1));
    const [id, payload] = printingAPI.update.mock.calls[0];
    expect(id).toBe('j1');
    expect(payload).toEqual({
        job_date: new Date('2026-01-05').toISOString(),
        sheets_used: 250,
        sizes: [{
            size_id: 's1', size_name: '4LTR/5KG',
            brands: [{ brand_id: 'b1', brand_name: 'SYNCOAT', bodies_count: 4 }],
        }],
        notes: 'line 2',
    });
    expect(typeof payload.sheets_used).toBe('number');
});

it('removing the only entry disables submit so nothing is sent', async () => {
    const user = userEvent.setup({ delay: null });
    render(<Printing />);
    await screen.findByTestId('jobs-table');

    await user.click(screen.getByTestId('edit-job-j1'));
    await user.click(await screen.findByTestId('remove-edit-entry-0'));

    expect(screen.getByTestId('submit-edit-job')).toBeDisabled();
    await user.click(screen.getByTestId('submit-edit-job'));
    expect(printingAPI.update).not.toHaveBeenCalled();
});
