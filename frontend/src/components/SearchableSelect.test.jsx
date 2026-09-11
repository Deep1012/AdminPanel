import React, { useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import SearchableSelect from './SearchableSelect';
import { Dialog, DialogContent, DialogTitle } from './ui/dialog';

const OPTIONS = [
    { value: 'Mehta Paints', label: 'Mehta Paints' },
    { value: 'Asian Coatings', label: 'Asian Coatings' },
    { value: 'Berger Traders', label: 'Berger Traders' },
];

/** Controlled wrapper, the way FormField/Controller drives it in the pages. */
const Harness = ({ initial = '', onValueChange = () => {}, ...rest }) => {
    const [value, setValue] = useState(initial);
    return (
        <SearchableSelect
            options={OPTIONS}
            value={value}
            onValueChange={(next) => { setValue(next); onValueChange(next); }}
            placeholder="Select customer"
            searchPlaceholder="Search customers..."
            data-testid="customer"
            {...rest}
        />
    );
};

const trigger = () => screen.getByTestId('customer-trigger');
const search = () => screen.getByTestId('customer-search');
const activeOption = () => document.getElementById(search().getAttribute('aria-activedescendant'));

it('exposes a collapsed combobox that controls a listbox', () => {
    render(<Harness />);

    expect(trigger()).toHaveAttribute('role', 'combobox');
    expect(trigger()).toHaveAttribute('aria-expanded', 'false');
    expect(trigger()).toHaveAttribute('aria-haspopup', 'listbox');
    expect(trigger()).toHaveAttribute('aria-controls');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
});

it('opens on click, focuses the search field and wires the ARIA references', async () => {
    const user = userEvent.setup({ delay: null });
    render(<Harness initial="Asian Coatings" />);

    await user.click(trigger());

    expect(trigger()).toHaveAttribute('aria-expanded', 'true');
    expect(search()).toHaveFocus();
    const listbox = screen.getByRole('listbox');
    expect(trigger()).toHaveAttribute('aria-controls', listbox.id);
    expect(search()).toHaveAttribute('aria-controls', listbox.id);

    const options = screen.getAllByRole('option');
    expect(options).toHaveLength(3);
    // aria-selected marks the chosen value; the highlight starts on it too.
    expect(screen.getByRole('option', { name: 'Asian Coatings' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('option', { name: 'Mehta Paints' })).toHaveAttribute('aria-selected', 'false');
    expect(activeOption()).toHaveTextContent('Asian Coatings');
    // Options are not tab stops; the arrow keys reach them.
    options.forEach((option) => expect(option).toHaveAttribute('tabindex', '-1'));
});

it('moves the highlight with the arrow keys, Home and End, and selects with Enter', async () => {
    const user = userEvent.setup({ delay: null });
    const onValueChange = jest.fn();
    render(<Harness onValueChange={onValueChange} />);

    await user.click(trigger());
    expect(activeOption()).toHaveTextContent('Mehta Paints');

    await user.keyboard('{ArrowDown}');
    expect(activeOption()).toHaveTextContent('Asian Coatings');
    await user.keyboard('{ArrowDown}{ArrowDown}');
    // Stops at the end rather than wrapping.
    expect(activeOption()).toHaveTextContent('Berger Traders');
    await user.keyboard('{ArrowUp}');
    expect(activeOption()).toHaveTextContent('Asian Coatings');
    await user.keyboard('{Home}');
    expect(activeOption()).toHaveTextContent('Mehta Paints');
    await user.keyboard('{End}');
    expect(activeOption()).toHaveTextContent('Berger Traders');

    await user.keyboard('{Enter}');

    expect(onValueChange).toHaveBeenCalledTimes(1);
    expect(onValueChange).toHaveBeenCalledWith('Berger Traders');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(trigger()).toHaveAttribute('aria-expanded', 'false');
    expect(trigger()).toHaveFocus();
    expect(trigger()).toHaveTextContent('Berger Traders');
});

it('opens from the keyboard with ArrowDown on the trigger', async () => {
    const user = userEvent.setup({ delay: null });
    render(<Harness />);

    trigger().focus();
    await user.keyboard('{ArrowDown}');

    expect(screen.getByRole('listbox')).toBeInTheDocument();
    expect(search()).toHaveFocus();
});

it('filters as you type and Enter picks the first match', async () => {
    const user = userEvent.setup({ delay: null });
    const onValueChange = jest.fn();
    render(<Harness onValueChange={onValueChange} />);

    await user.click(trigger());
    await user.type(search(), 'berg');

    expect(screen.getAllByRole('option')).toHaveLength(1);
    expect(activeOption()).toHaveTextContent('Berger Traders');

    await user.keyboard('{Enter}');
    expect(onValueChange).toHaveBeenCalledWith('Berger Traders');
});

it('shows an empty state and ignores Enter when nothing matches', async () => {
    const user = userEvent.setup({ delay: null });
    const onValueChange = jest.fn();
    render(<Harness onValueChange={onValueChange} />);

    await user.click(trigger());
    await user.type(search(), 'zzz');

    expect(screen.getByText('No results found')).toBeInTheDocument();
    expect(screen.queryAllByRole('option')).toHaveLength(0);
    expect(search()).not.toHaveAttribute('aria-activedescendant');

    await user.keyboard('{Enter}');
    expect(onValueChange).not.toHaveBeenCalled();
    expect(screen.getByRole('listbox')).toBeInTheDocument();
});

it('closes on Escape without changing the value and returns focus to the trigger', async () => {
    const user = userEvent.setup({ delay: null });
    const onValueChange = jest.fn();
    render(<Harness initial="Mehta Paints" onValueChange={onValueChange} />);

    await user.click(trigger());
    await user.keyboard('{ArrowDown}');
    await user.keyboard('{Escape}');

    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(trigger()).toHaveFocus();
    expect(trigger()).toHaveTextContent('Mehta Paints');
    expect(onValueChange).not.toHaveBeenCalled();

    // Reopening starts from a clean search.
    await user.click(trigger());
    expect(search()).toHaveValue('');
});

it('Escape closes only the list, not an enclosing dialog', async () => {
    const user = userEvent.setup({ delay: null });
    const onOpenChange = jest.fn();
    render(
        <Dialog open onOpenChange={onOpenChange}>
            <DialogContent aria-describedby={undefined}>
                <DialogTitle>Create Dispatch Order</DialogTitle>
                <Harness />
            </DialogContent>
        </Dialog>
    );

    await user.click(trigger());
    await user.keyboard('{Escape}');

    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(onOpenChange).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    // With the list closed, Escape is the dialog's again.
    await user.keyboard('{Escape}');
    expect(onOpenChange).toHaveBeenCalledWith(false);
});

it('does not submit the enclosing form when Enter chooses an option', async () => {
    const user = userEvent.setup({ delay: null });
    const onSubmit = jest.fn((e) => e.preventDefault());
    render(
        <form onSubmit={onSubmit}>
            <Harness />
        </form>
    );

    await user.click(trigger());
    await user.keyboard('{Enter}');

    expect(trigger()).toHaveTextContent('Mehta Paints');
    expect(onSubmit).not.toHaveBeenCalled();
});

it('selects with the mouse and closes on an outside click', async () => {
    const user = userEvent.setup({ delay: null });
    const onValueChange = jest.fn();
    render(
        <div>
            <Harness onValueChange={onValueChange} />
            <p>elsewhere</p>
        </div>
    );

    await user.click(trigger());
    await user.click(screen.getByRole('option', { name: 'Asian Coatings' }));
    expect(onValueChange).toHaveBeenCalledWith('Asian Coatings');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();

    await user.click(trigger());
    await user.click(screen.getByText('elsewhere'));
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(onValueChange).toHaveBeenCalledTimes(1);
});

it('closes when focus tabs out of the widget', async () => {
    const user = userEvent.setup({ delay: null });
    render(
        <div>
            <Harness />
            <input aria-label="Next field" />
        </div>
    );

    await user.click(trigger());
    await user.tab();

    expect(screen.getByLabelText('Next field')).toHaveFocus();
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
});

it('does not open when disabled', async () => {
    const user = userEvent.setup({ delay: null });
    render(<Harness disabled />);

    await user.click(trigger());
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
});

it('can be labelled by a <label htmlFor> through the forwarded id', () => {
    render(
        <>
            {/* Deliberately id-only (the FormControl path): the deprecated
                label-has-for rule wants nesting too, and cannot see that
                Harness renders the control this id lands on. */}
            {/* eslint-disable-next-line jsx-a11y/label-has-for */}
            <label htmlFor="customer-field">Customer *</label>
            <Harness id="customer-field" aria-invalid="true" />
        </>
    );

    const combobox = screen.getByLabelText('Customer *');
    expect(combobox).toBe(trigger());
    expect(combobox).toHaveAttribute('aria-invalid', 'true');
});
