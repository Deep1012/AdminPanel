/**
 * Zod validation schemas for every data-entry form in the app.
 *
 * These mirror what the backend actually enforces (route guards plus Mongoose
 * validators) so an operator sees the problem named in the form instead of a
 * generic 400/500 toast after the round trip:
 *
 *  - `routes/purchases.js` rejects any of gauge/size1/size2/weight that is not
 *    finite and > 0, naming the offending field.
 *  - `routes/printingJobs.js` rejects a total `sheets_used` <= 0.
 *  - `models/PurchaseOrder.js` declares `quantity: { min: 1 }` and the route
 *    rejects a falsy quantity.
 *  - `routes/auth.js` restricts `role` to exactly ["admin", "user"].
 *  - `routes/customers.js` / `routes/sizes.js` / `routes/menuItems.js` reject
 *    blank names, paths and icons.
 *
 * Messages are written for the factory operator reading them, not for a
 * developer reading a stack trace.
 */
import { z } from 'zod';

/** Roles the backend's ALLOWED_ROLES gate accepts. */
export const USER_ROLES = ['admin', 'user'];

/**
 * Numeric form field.
 *
 * `<input type="number">` hands back a string, and an untouched field hands
 * back `''`. Empty is normalised to `undefined` so it reports as "required"
 * rather than coercing to 0 and reporting the wrong rule; anything that is not
 * a number is left as-is so the type error fires instead of becoming NaN.
 */
const numeric = (label, constrain) =>
    z.preprocess(
        (value) => {
            if (value === '' || value === null || value === undefined) return undefined;
            if (typeof value === 'number') return value;
            const parsed = Number(value);
            return Number.isNaN(parsed) ? value : parsed;
        },
        constrain(
            z.number({
                required_error: `${label} is required`,
                invalid_type_error: `${label} must be a number`,
            })
        )
    );

/** Finite and strictly greater than zero. Allows decimals (e.g. gauge 0.18). */
const positiveNumber = (label) =>
    numeric(label, (schema) =>
        schema.finite(`${label} must be a number`).gt(0, `${label} must be greater than 0`)
    );

/** Whole number, at least 1. */
const positiveInt = (label) =>
    numeric(label, (schema) =>
        schema.int(`${label} must be a whole number`).gte(1, `${label} must be at least 1`)
    );

/** Whole number, zero allowed. */
const nonNegativeInt = (label) =>
    numeric(label, (schema) =>
        schema.int(`${label} must be a whole number`).gte(0, `${label} cannot be negative`)
    );

const requiredText = (message) => z.string({ required_error: message }).trim().min(1, message);

const optionalText = z.string().trim().optional().default('');

const requiredDate = (label) =>
    z.string({ required_error: `${label} is required` }).min(1, `${label} is required`);

const requiredChoice = (message) => z.string({ required_error: message }).min(1, message);

/* --------------------------------------------------------------- auth */

export const loginSchema = z.object({
    email: requiredText('Email is required').email('Enter a valid email address'),
    password: requiredText('Password is required'),
});

/**
 * User create/edit share one schema. `mode` lives in the form values so the
 * password rule can switch without swapping the resolver mid-render: the edit
 * path deliberately sends no password when the field is left blank.
 */
export const userSchema = z
    .object({
        mode: z.enum(['create', 'edit']),
        username: requiredText('Username is required'),
        email: requiredText('Email is required').email('Enter a valid email address'),
        password: z.string().default(''),
        role: z.enum(USER_ROLES, { message: 'Role must be either admin or user' }),
    })
    .superRefine((values, ctx) => {
        if (values.mode === 'create' && !values.password) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                path: ['password'],
                message: 'Password is required for new users',
            });
        }
    });

/* -------------------------------------------------------- master data */

export const brandSchema = z.object({
    name: requiredText('Brand name is required'),
});

export const sizeSchema = z.object({
    name: requiredText('Size name is required'),
});

export const customerSchema = z.object({
    name: requiredText('Customer name is required'),
});

export const menuItemSchema = z.object({
    label: requiredText('Label is required'),
    path: requiredText('Path is required').startsWith('/', 'Path must start with /'),
    icon: requiredChoice('Icon is required'),
    admin_only: z.boolean().default(false),
});

/* ----------------------------------------------- raw material purchase */

export const purchaseSchema = z.object({
    purchase_date: requiredDate('Date'),
    gauge: positiveNumber('Gauge'),
    size1: positiveNumber('Size 1'),
    size2: positiveNumber('Size 2'),
    temper: requiredText('Temper is required'),
    weight: positiveNumber('Weight'),
    supplier: optionalText,
    invoice_number: optionalText,
});

/* -------------------------------------------------------- printing job */

/** One staged size + brand + bodies row, before it joins the entries list. */
export const printingEntryInputSchema = z.object({
    size_id: requiredChoice('Select a size'),
    brand_id: requiredChoice('Select a brand'),
    bodies_count: positiveInt('Bodies'),
});

/** An entry already added to the job. */
export const printingEntrySchema = z.object({
    size_id: requiredChoice('Select a size'),
    size_name: z.string(),
    brand_id: requiredChoice('Select a brand'),
    brand_name: z.string(),
    bodies_count: nonNegativeInt('Bodies'),
});

export const printingJobSchema = z.object({
    job_date: requiredDate('Date'),
    raw_material_id: requiredChoice('Select a raw material'),
    sheets_used: positiveInt('Sheets used'),
    notes: optionalText,
    entries: z.array(printingEntrySchema).min(1, 'Add at least one size/brand entry'),
});

/** Editing cannot move a job to a different raw material. */
export const printingJobEditSchema = printingJobSchema.omit({ raw_material_id: true });

/* ---------------------------------------------------------- production */

export const productionSchema = z.object({
    production_date: requiredDate('Date'),
    size_id: requiredChoice('Select a size'),
    brand_id: requiredChoice('Select a brand'),
    quantity_produced: positiveInt('Qty produced'),
    notes: optionalText,
});

/* ------------------------------------------------------------ dispatch */

/** One staged dispatch line, before it joins the items list. */
export const dispatchItemInputSchema = z.object({
    brand_id: requiredChoice('Select a brand'),
    size_id: requiredChoice('Select a size'),
    quantity: positiveInt('Quantity'),
    notes: optionalText,
});

export const dispatchItemSchema = z.object({
    brand_id: requiredChoice('Select a brand'),
    brand_name: z.string(),
    size_id: requiredChoice('Select a size'),
    size_name: z.string(),
    quantity: positiveInt('Quantity'),
    purchase_order_id: z.string().nullable().default(null),
    notes: z.string().nullable().default(null),
});

export const dispatchSchema = z.object({
    dispatch_date: requiredDate('Date'),
    customer_name: requiredChoice('Select a customer'),
    items: z.array(dispatchItemSchema).min(1, 'Add at least one item'),
});

/* ----------------------------------------------------- purchase orders */

/** One staged PO line, before it joins the items list. */
export const purchaseOrderItemInputSchema = z.object({
    brand_id: requiredChoice('Select a brand'),
    size_id: requiredChoice('Select a size'),
    quantity: positiveInt('Quantity'),
});

export const purchaseOrderItemSchema = z.object({
    brand_id: requiredChoice('Select a brand'),
    brand_name: z.string(),
    size_id: requiredChoice('Select a size'),
    size_name: z.string(),
    quantity: positiveInt('Quantity'),
});

/** Create dialog: one customer + date, many brand/size/qty lines. */
export const purchaseOrderCreateSchema = z.object({
    date: requiredDate('Date'),
    company_name: requiredChoice('Select a customer'),
    items: z.array(purchaseOrderItemSchema).min(1, 'Add at least one item'),
});

/** Edit dialog: a single existing order. */
export const purchaseOrderEditSchema = z.object({
    date: requiredDate('Date'),
    company_name: requiredChoice('Select a customer'),
    brand_id: requiredChoice('Select a brand'),
    size_id: requiredChoice('Select a size'),
    quantity: positiveInt('Quantity'),
    notes: optionalText,
});
