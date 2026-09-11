import {
    loginSchema,
    userSchema,
    brandSchema,
    sizeSchema,
    customerSchema,
    menuItemSchema,
    purchaseSchema,
    printingJobSchema,
    printingEntryInputSchema,
    productionSchema,
    dispatchSchema,
    dispatchItemInputSchema,
    purchaseOrderCreateSchema,
    purchaseOrderEditSchema,
    purchaseOrderItemInputSchema,
} from './schemas';

/** First error message for `field`, or undefined when the field is valid. */
const messageFor = (schema, value, field) => {
    const result = schema.safeParse(value);
    if (result.success) return undefined;
    return result.error.issues.find((issue) => issue.path.join('.') === field)?.message;
};

const validPurchase = {
    purchase_date: '2026-01-05',
    gauge: '0.18',
    size1: '914',
    size2: '1219',
    temper: 'T4',
    weight: '5000',
    supplier: '',
    invoice_number: '',
};

describe('purchaseSchema', () => {
    it('coerces the sheet-formula inputs to numbers', () => {
        const parsed = purchaseSchema.parse(validPurchase);
        expect(parsed.gauge).toBe(0.18);
        expect(parsed.size1).toBe(914);
        expect(parsed.size2).toBe(1219);
        expect(parsed.weight).toBe(5000);
    });

    it('accepts a fractional gauge rather than forcing a whole number', () => {
        expect(purchaseSchema.safeParse({ ...validPurchase, gauge: '0.225' }).success).toBe(true);
    });

    // routes/purchases.js findInvalidSheetInput() rejects each of these with a
    // 400 naming the field; the form must catch them first.
    it.each(['gauge', 'size1', 'size2', 'weight'])('rejects a negative %s', (field) => {
        expect(messageFor(purchaseSchema, { ...validPurchase, [field]: '-5' }, field))
            .toMatch(/must be greater than 0/);
    });

    it.each(['gauge', 'size1', 'size2', 'weight'])('rejects a zero %s', (field) => {
        expect(messageFor(purchaseSchema, { ...validPurchase, [field]: '0' }, field))
            .toMatch(/must be greater than 0/);
    });

    it.each(['gauge', 'size1', 'size2', 'weight'])('reports an empty %s as required', (field) => {
        expect(messageFor(purchaseSchema, { ...validPurchase, [field]: '' }, field))
            .toMatch(/is required/);
    });

    it('rejects non-numeric text', () => {
        expect(messageFor(purchaseSchema, { ...validPurchase, weight: 'heavy' }, 'weight'))
            .toBe('Weight must be a number');
    });

    it('requires a temper', () => {
        expect(messageFor(purchaseSchema, { ...validPurchase, temper: '   ' }, 'temper'))
            .toBe('Temper is required');
    });

    it('treats supplier and invoice number as optional', () => {
        const { supplier, invoice_number, ...rest } = validPurchase;
        expect(purchaseSchema.safeParse(rest).success).toBe(true);
    });

    it('has no sr_no field — the backend generates it', () => {
        expect(Object.keys(purchaseSchema.shape)).not.toContain('sr_no');
    });
});

describe('productionSchema', () => {
    const valid = { production_date: '2026-01-05', size_id: 's1', brand_id: 'b1', quantity_produced: '100', notes: '' };

    it('coerces quantity to a number', () => {
        expect(productionSchema.parse(valid).quantity_produced).toBe(100);
    });

    it('rejects zero and negative quantities', () => {
        expect(messageFor(productionSchema, { ...valid, quantity_produced: '0' }, 'quantity_produced'))
            .toMatch(/at least 1/);
        expect(messageFor(productionSchema, { ...valid, quantity_produced: '-3' }, 'quantity_produced'))
            .toMatch(/at least 1/);
    });

    it('rejects a fractional quantity', () => {
        expect(messageFor(productionSchema, { ...valid, quantity_produced: '2.5' }, 'quantity_produced'))
            .toMatch(/whole number/);
    });

    it('requires a size and a brand', () => {
        expect(messageFor(productionSchema, { ...valid, size_id: '' }, 'size_id')).toBe('Select a size');
        expect(messageFor(productionSchema, { ...valid, brand_id: '' }, 'brand_id')).toBe('Select a brand');
    });
});

describe('printing job schemas', () => {
    const entry = { size_id: 's1', size_name: '1LTR', brand_id: 'b1', brand_name: 'SYNCOAT', bodies_count: 4 };
    const valid = { job_date: '2026-01-05', raw_material_id: 'rm1', sheets_used: '250', notes: '', entries: [entry] };

    it('coerces sheets_used to a number', () => {
        expect(printingJobSchema.parse(valid).sheets_used).toBe(250);
    });

    // routes/printingJobs.js rejects a total sheets_used <= 0.
    it('rejects zero or negative sheets_used', () => {
        expect(messageFor(printingJobSchema, { ...valid, sheets_used: '0' }, 'sheets_used')).toMatch(/at least 1/);
        expect(messageFor(printingJobSchema, { ...valid, sheets_used: '-10' }, 'sheets_used')).toMatch(/at least 1/);
    });

    it('requires at least one size/brand entry', () => {
        expect(messageFor(printingJobSchema, { ...valid, entries: [] }, 'entries'))
            .toBe('Add at least one size/brand entry');
    });

    it('requires a raw material on create but not on edit', () => {
        expect(messageFor(printingJobSchema, { ...valid, raw_material_id: '' }, 'raw_material_id'))
            .toBe('Select a raw material');
        expect(Object.keys(printingJobSchema.shape)).toContain('raw_material_id');
    });

    it('keeps existing entries with zero bodies valid but rejects negatives', () => {
        expect(printingJobSchema.safeParse({ ...valid, entries: [{ ...entry, bodies_count: 0 }] }).success).toBe(true);
        expect(printingJobSchema.safeParse({ ...valid, entries: [{ ...entry, bodies_count: -1 }] }).success).toBe(false);
    });

    it('requires a positive bodies count on the staging row', () => {
        const staged = { size_id: 's1', brand_id: 'b1', bodies_count: '0' };
        expect(messageFor(printingEntryInputSchema, staged, 'bodies_count')).toMatch(/at least 1/);
        expect(printingEntryInputSchema.parse({ ...staged, bodies_count: '4' }).bodies_count).toBe(4);
    });
});

describe('dispatch schemas', () => {
    const item = { brand_id: 'b1', brand_name: 'SYNCOAT', size_id: 's1', size_name: '1LTR', quantity: 10, purchase_order_id: null, notes: null };
    const valid = { dispatch_date: '2026-01-05', customer_name: 'Mehta Paints', items: [item] };

    it('accepts a well-formed dispatch', () => {
        expect(dispatchSchema.parse(valid).items[0].quantity).toBe(10);
    });

    it('requires a customer and at least one item', () => {
        expect(messageFor(dispatchSchema, { ...valid, customer_name: '' }, 'customer_name')).toBe('Select a customer');
        expect(messageFor(dispatchSchema, { ...valid, items: [] }, 'items')).toBe('Add at least one item');
    });

    it('rejects a non-positive staged quantity', () => {
        expect(messageFor(dispatchItemInputSchema, { brand_id: 'b1', size_id: 's1', quantity: '0' }, 'quantity'))
            .toMatch(/at least 1/);
        expect(messageFor(dispatchItemInputSchema, { brand_id: 'b1', size_id: 's1', quantity: '-4' }, 'quantity'))
            .toMatch(/at least 1/);
    });

    it('coerces a staged quantity to a number', () => {
        expect(dispatchItemInputSchema.parse({ brand_id: 'b1', size_id: 's1', quantity: '25', notes: '' }).quantity).toBe(25);
    });

    it('defaults purchase_order_id to null when absent', () => {
        const { purchase_order_id, ...rest } = item;
        expect(dispatchSchema.parse({ ...valid, items: [rest] }).items[0].purchase_order_id).toBeNull();
    });
});

describe('purchase order schemas', () => {
    const item = { brand_id: 'b1', brand_name: 'SYNCOAT', size_id: 's1', size_name: '1LTR', quantity: 500 };
    const validCreate = { date: '2026-01-05', company_name: 'Mehta Paints', items: [item] };
    const validEdit = { date: '2026-01-05', company_name: 'Mehta Paints', brand_id: 'b1', size_id: 's1', quantity: '500', notes: '' };

    it('accepts a well-formed create payload', () => {
        expect(purchaseOrderCreateSchema.parse(validCreate).items).toHaveLength(1);
    });

    it('requires a customer and at least one item on create', () => {
        expect(messageFor(purchaseOrderCreateSchema, { ...validCreate, company_name: '' }, 'company_name'))
            .toBe('Select a customer');
        expect(messageFor(purchaseOrderCreateSchema, { ...validCreate, items: [] }, 'items'))
            .toBe('Add at least one item');
    });

    // models/PurchaseOrder.js declares quantity: { min: 1 }.
    it('enforces a quantity of at least 1', () => {
        expect(messageFor(purchaseOrderItemInputSchema, { brand_id: 'b1', size_id: 's1', quantity: '0' }, 'quantity'))
            .toBe('Quantity must be at least 1');
        expect(messageFor(purchaseOrderEditSchema, { ...validEdit, quantity: '0' }, 'quantity'))
            .toBe('Quantity must be at least 1');
        expect(messageFor(purchaseOrderEditSchema, { ...validEdit, quantity: '-7' }, 'quantity'))
            .toBe('Quantity must be at least 1');
    });

    it('coerces the edit quantity to a number', () => {
        expect(purchaseOrderEditSchema.parse(validEdit).quantity).toBe(500);
    });
});

describe('userSchema', () => {
    const base = { username: 'Priya', email: 'priya@timestin.com', role: 'user' };

    it('requires a password when creating', () => {
        expect(messageFor(userSchema, { ...base, mode: 'create', password: '' }, 'password'))
            .toBe('Password is required for new users');
        expect(userSchema.safeParse({ ...base, mode: 'create', password: 'hunter2' }).success).toBe(true);
    });

    it('allows a blank password when editing', () => {
        expect(userSchema.safeParse({ ...base, mode: 'edit', password: '' }).success).toBe(true);
    });

    it('rejects a malformed email', () => {
        expect(messageFor(userSchema, { ...base, mode: 'edit', password: '', email: 'not-an-email' }, 'email'))
            .toBe('Enter a valid email address');
    });

    // routes/auth.js ALLOWED_ROLES is exactly ["admin", "user"].
    it('restricts role to admin or user', () => {
        expect(messageFor(userSchema, { ...base, mode: 'edit', password: '', role: 'superadmin' }, 'role'))
            .toBe('Role must be either admin or user');
        expect(userSchema.safeParse({ ...base, mode: 'edit', password: '', role: 'admin' }).success).toBe(true);
    });
});

describe('loginSchema', () => {
    it('requires both fields', () => {
        expect(messageFor(loginSchema, { email: '', password: '' }, 'email')).toBe('Email is required');
        expect(messageFor(loginSchema, { email: 'a@b.com', password: '' }, 'password')).toBe('Password is required');
    });

    it('validates the email format', () => {
        expect(messageFor(loginSchema, { email: 'nope', password: 'x' }, 'email')).toBe('Enter a valid email address');
    });
});

describe('master data schemas', () => {
    it.each([
        [brandSchema, 'Brand name is required'],
        [sizeSchema, 'Size name is required'],
        [customerSchema, 'Customer name is required'],
    ])('rejects a blank name with a specific message', (schema, expected) => {
        expect(messageFor(schema, { name: '   ' }, 'name')).toBe(expected);
        expect(schema.parse({ name: '  SYNCOAT  ' }).name).toBe('SYNCOAT');
    });

    it('requires label, path and icon on a menu item', () => {
        const valid = { label: 'REPORTS', path: '/reports', icon: 'Package', admin_only: false };
        expect(menuItemSchema.safeParse(valid).success).toBe(true);
        expect(messageFor(menuItemSchema, { ...valid, label: '' }, 'label')).toBe('Label is required');
        expect(messageFor(menuItemSchema, { ...valid, icon: '' }, 'icon')).toBe('Icon is required');
        expect(messageFor(menuItemSchema, { ...valid, path: 'reports' }, 'path')).toBe('Path must start with /');
    });
});
