/**
 * Label association, checked in rendered output.
 *
 * `getByLabelText` only resolves when a label is programmatically tied to its
 * control (`<label for>` -> `id`, `aria-labelledby`, or `aria-label`). A label
 * that merely sits next to an input fails it. Each assertion also checks the
 * resolved element is the intended control, so a label that happens to point
 * at the wrong field would fail too.
 */
import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Brands from './Brands';
import Dispatch from './Dispatch';
import PurchaseOrders from './PurchaseOrders';
import Printing from './Printing';
import {
    brandsAPI, sizesAPI, customersAPI, dispatchAPI, purchaseOrdersAPI, printingAPI, purchaseAPI,
} from '../lib/api';

jest.mock('../lib/api');

beforeEach(() => {
    jest.clearAllMocks();
    brandsAPI.getAll.mockResolvedValue({ data: [{ id: 'b1', name: 'SYNCOAT', is_lwbf: false, created_at: '2026-01-01T00:00:00.000Z' }] });
    sizesAPI.getAll.mockResolvedValue({ data: [{ id: 's1', name: '4LTR/5KG' }] });
    customersAPI.getAll.mockResolvedValue({ data: [{ id: 'c1', name: 'Mehta Paints' }] });
    dispatchAPI.getAll.mockResolvedValue({ data: [] });
    purchaseOrdersAPI.getAll.mockResolvedValue({ data: [] });
    printingAPI.getAll.mockResolvedValue({ data: [] });
    purchaseAPI.getAvailable.mockResolvedValue({ data: [] });
});

/** The label resolves, and to exactly the control carrying `testId`. */
const expectLabelled = (label, testId) => {
    expect(screen.getByLabelText(label)).toBe(screen.getByTestId(testId));
};

it('Brands: the name input is associated with its label', async () => {
    const user = userEvent.setup({ delay: null });
    render(<Brands />);
    await screen.findByTestId('brands-table');
    await user.click(screen.getByTestId('add-brand-btn'));
    await screen.findByTestId('brand-name-input');

    expectLabelled('Brand Name *', 'brand-name-input');

    const label = screen.getByText('Brand Name *');
    expect(label.tagName).toBe('LABEL');
    expect(label).toHaveAttribute('for', screen.getByTestId('brand-name-input').id);
});

it('Dispatch: every field in the create dialog is reachable by its label', async () => {
    const user = userEvent.setup({ delay: null });
    render(<Dispatch />);
    // The empty-state message renders once loading has finished.
    await screen.findByText('No dispatch orders found');
    await user.click(screen.getByTestId('add-dispatch-btn'));
    await screen.findByTestId('dispatch-date');

    // Visible FormLabel -> FormControl (htmlFor/id) pairs.
    expectLabelled('Date *', 'dispatch-date');
    // SearchableSelect: the label must reach the combobox trigger, not the
    // wrapper div, or a screen reader announces an unnamed control.
    expectLabelled('Customer *', 'dispatch-customer-trigger');

    // The staging row has no visible labels (placeholders only), so each
    // control carries an aria-label instead.
    expectLabelled('Brand', 'dispatch-brand');
    expectLabelled('Size', 'dispatch-size');
    expectLabelled('Quantity', 'dispatch-quantity');
    expectLabelled('Item notes', 'dispatch-item-notes');
});

it('Purchase Orders: the create dialog customer and staging fields are labelled', async () => {
    const user = userEvent.setup({ delay: null });
    render(<PurchaseOrders />);
    await screen.findByTestId('add-po-btn');
    await user.click(screen.getByTestId('add-po-btn'));
    await screen.findByTestId('po-date');

    expectLabelled('Date *', 'po-date');
    expectLabelled('Customer *', 'po-company-trigger');
    expectLabelled('Brand', 'po-brand');
    expectLabelled('Size', 'po-size');
    expectLabelled('Quantity', 'po-quantity');
});

it('Printing: the create dialog fields and staging row are labelled', async () => {
    const user = userEvent.setup({ delay: null });
    render(<Printing />);
    await screen.findByTestId('add-job-btn');
    await user.click(screen.getByTestId('add-job-btn'));
    await screen.findByTestId('job-date');

    expectLabelled('Date *', 'job-date');
    expectLabelled('Raw Material *', 'raw-material-select');
    expectLabelled('Sheets Used *', 'sheets-used');
    expectLabelled('Notes', 'job-notes');
    expectLabelled('Size', 'container-size');
    expectLabelled('Brand', 'brand-select');
    expectLabelled('Bodies', 'bodies-count');
});
