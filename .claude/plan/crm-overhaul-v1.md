# Implementation Plan: TIMESTIN CRM Major Overhaul

## Task Type
- [x] Frontend (React pages, components, routing)
- [x] Backend (Node.js routes, models, APIs)
- [x] Fullstack (Parallel)

---

## Overview

10 major changes spanning new pages, form modifications, status removal, business logic automation, and a new Customer entity. Organized into 6 phases by dependency order.

---

## Phase 1: Foundation — New Customer Entity + Searchable Dropdowns

### 1A. Customer Model + Routes (Backend)

**New file: `backend/models/Customer.js`**
```js
// Schema: id (UUID), name (String, required, unique), created_at
```

**New file: `backend/routes/customers.js`**
```js
// CRUD: GET /, POST /, PUT /:id, DELETE /:id
// GET returns sorted by name
```

**Mount in `server.js`:**
```js
app.use("/api/customers", customerRoutes);
```

| File | Operation | Description |
|------|-----------|-------------|
| `backend/models/Customer.js` | Create | Customer mongoose schema |
| `backend/routes/customers.js` | Create | CRUD routes for customers |
| `backend/server.js:15` | Modify | Import + mount customer routes |

### 1B. Customer Management Page (Frontend)

**New file: `frontend/src/pages/Customers.jsx`**
- Same pattern as Brands.jsx / Sizes.jsx
- Table with: Name, Created At, Actions (edit/delete)
- Add/Edit dialog with name field

| File | Operation | Description |
|------|-----------|-------------|
| `frontend/src/pages/Customers.jsx` | Create | Customer CRUD page |
| `frontend/src/lib/api.js` | Modify | Add `customersAPI` export |
| `frontend/src/App.js` | Modify | Add `/customers` route |
| `frontend/src/components/Layout.jsx:32-42` | Modify | Add CUSTOMERS nav item (admin only), make BRANDS + SIZES admin only |

### 1C. Searchable Dropdown Component (Requirement #6)

**New file: `frontend/src/components/SearchableSelect.jsx`**
- Wraps the existing shadcn `Select` with a search input inside `SelectContent`
- Uses `cmdk` (already installed) or simple filter input
- Props: `options`, `value`, `onValueChange`, `placeholder`, `searchPlaceholder`
- Filter options by typed text

Replace all `<Select>` dropdowns for brands, sizes, raw materials, customers with `<SearchableSelect>`.

| File | Operation | Description |
|------|-----------|-------------|
| `frontend/src/components/SearchableSelect.jsx` | Create | Searchable select component |

---

## Phase 2: Stock Report Pages (Requirement #1)

Move the 3 old dashboard stock tables to dedicated pages. Backend APIs already exist.

### 2A. Raw Material Stock Page

**New file: `frontend/src/pages/RawMaterialStock.jsx`**
- Calls `dashboardAPI.getPurchaseStock()`
- Table: Size, Gauge, Total Sheets, Used, Available, Weight (KG)
- Excel export button
- Same dark industrial styling

### 2B. Printing Stock Page

**New file: `frontend/src/pages/PrintingStock.jsx`**
- Calls `dashboardAPI.getPrintingStockList()`
- Table: Size, Brand, Printing Done, Used in Production, Available
- Excel export button

### 2C. Finished Goods Stock Page

**New file: `frontend/src/pages/FinishedGoods.jsx`**
- Calls `dashboardAPI.getFinishedGoodsList()`
- Table: Size, Brand, Produced, Dispatched, Available
- Excel export button

### 2D. Navigation Updates

Add 3 new nav items in Layout.jsx sidebar, grouped under a "STOCK REPORTS" section or after Dashboard:

```js
{ path: '/raw-material-stock', label: 'RAW MATERIAL STOCK', icon: Layers },
{ path: '/printing-stock', label: 'PRINTING STOCK', icon: Printer },
{ path: '/finished-goods', label: 'FINISHED GOODS', icon: Package },
```

| File | Operation | Description |
|------|-----------|-------------|
| `frontend/src/pages/RawMaterialStock.jsx` | Create | Raw material stock page |
| `frontend/src/pages/PrintingStock.jsx` | Create | Printing stock page |
| `frontend/src/pages/FinishedGoods.jsx` | Create | Finished goods stock page |
| `frontend/src/App.js` | Modify | Add 3 new routes |
| `frontend/src/components/Layout.jsx` | Modify | Add 3 stock nav items after Dashboard; make BRANDS, SIZES, CUSTOMERS adminOnly |

---

## Phase 3: Form & UI Fixes (Requirements #2, #3, #4)

### 3A. Purchase — Auto Serial No (Requirement #2)

**Backend (`backend/routes/purchases.js`):**
- Auto-generate `sr_no` on POST (e.g., `RM-001`, `RM-002` — sequential)
- Remove `sr_no` from required body fields

**Frontend (`frontend/src/pages/Purchase.jsx`):**
- Remove `sr_no` input from the Add form (keep in Edit form as read-only)
- Keep `sr_no` column in table
- Sort: newest entries on top (already sorted by `purchase_date` desc — verify and enforce)
- After successful create, scroll to top / first page

| File | Operation | Description |
|------|-----------|-------------|
| `backend/routes/purchases.js` | Modify | Auto-generate sr_no in POST |
| `frontend/src/pages/Purchase.jsx:157-161` | Modify | Remove sr_no input from create form, keep in edit as readonly |

### 3B. Date Picker — White Calendar Icon (Requirement #3)

**CSS fix in `frontend/src/App.css` or `index.css`:**
```css
input[type="date"]::-webkit-calendar-picker-indicator {
  filter: invert(1);
  cursor: pointer;
}
```

| File | Operation | Description |
|------|-----------|-------------|
| `frontend/src/App.css` | Modify | Add white date picker icon CSS |

### 3C. Remove Statuses Throughout (Requirement #4)

**Printing Jobs:**
- Backend: Remove `status` field from PrintingJob schema (or keep in DB but don't expose)
- Frontend: Remove status column, status filter, status select in table, Edit dialog status field
- Remove status stat cards ("Pending Jobs")

**Dispatch:**
- Backend: Remove `status` from Dispatch schema
- Frontend: Remove status column, status filter, status select in table

**Purchase Orders:**
- Backend: Remove `status` from PurchaseOrder schema
- Frontend: Remove status column, status filter, status select
- Remove status stat cards (Pending, In Production, Ready)
- Remove auto-dispatch-on-status-change logic

**Dashboard:**
- Update dashboard stats that reference statuses (pending_jobs, completed_jobs, pending_orders)
- Remove dispatch distribution pie chart (it's status-based)

| File | Operation | Description |
|------|-----------|-------------|
| `backend/models/PrintingJob.js` | Modify | Remove status field |
| `backend/models/Dispatch.js` | Modify | Remove status field |
| `backend/models/PurchaseOrder.js` | Modify | Remove status field |
| `backend/routes/printingJobs.js` | Modify | Remove status from create/update |
| `backend/routes/dispatch.js` | Modify | Remove status from create/update |
| `backend/routes/purchaseOrders.js` | Modify | Remove status + auto-dispatch logic |
| `backend/routes/dashboard.js` | Modify | Remove status-based aggregations |
| `frontend/src/pages/Printing.jsx` | Modify | Remove status column/filter/edit dialog |
| `frontend/src/pages/Dispatch.jsx` | Modify | Remove status column/filter |
| `frontend/src/pages/PurchaseOrders.jsx` | Modify | Remove status column/filter/cards |
| `frontend/src/pages/Dashboard.jsx` | Modify | Remove dispatch donut chart, update stat references |

---

## Phase 4: Printing/Coating Overhaul (Requirement #5)

### 4A. Remove Job Number — Auto Serial

**Backend (`backend/routes/printingJobs.js`):**
- Auto-generate `job_number` as sequential integer (1, 2, 3...)
- Remove `job_number` from required body

**Frontend (`frontend/src/pages/Printing.jsx`):**
- Remove `job_number` input from Create form
- Show auto-generated number in table

### 4B. Multiple Entries → Multiple Rows

Current behavior: One printing job → one row with badges like "1LTR: SANDING SEALER, SYNCOAT"

New behavior: Each size+brand entry in a job creates its OWN row in the table.

**Backend approach:** The `sizes` array in PrintingJob already stores per-entry data. The frontend display needs to "flatten" jobs into rows.

**Frontend (`frontend/src/pages/Printing.jsx`):**
- Flatten `jobs` into `rows`: for each job, for each size entry, for each brand → create a row
- Each row shows: Date, Job #, Raw Material, Material Size, Sheets, Size, Brand, Bodies, Total Printing, By, Actions

### 4C. Add "Total Printing" Column

**Formula:** `Total Printing = bodies_count × sheets_from_material`

Example: 1LTR Sanding Sealer → 12 bodies × 1459 sheets = 17,508

**Frontend:** Add computed column in the flattened row display.

### 4D. Update Create Dialog Summary

- Instead of combined "Total Bodies", show per-entry breakdown:
  - Each entry: `{size} {brand} → {bodies} × {sheets} = {total_printing}`
- Show grand total of all entries

| File | Operation | Description |
|------|-----------|-------------|
| `backend/routes/printingJobs.js:9-57` | Modify | Auto-generate job_number |
| `frontend/src/pages/Printing.jsx` | Modify | Remove job_number input, flatten rows, add Total Printing column, update summary |

---

## Phase 5: Dispatch, Production, PO Changes (Requirements #7, #8, #9)

### 5A. Dispatch — Customer Dropdown + Remove Fields (Requirement #7)

**Frontend (`frontend/src/pages/Dispatch.jsx`):**
- Replace `customer_name` text input with `SearchableSelect` populated from `customersAPI.getAll()`
- Remove `delivery_address` textarea
- Remove `order_number` input — auto-generate serial number on backend

**Backend (`backend/routes/dispatch.js`):**
- Auto-generate `order_number` as sequential (1, 2, 3...) in POST
- Remove `delivery_address` from required, deprecate field
- Accept `customer_id` alongside `customer_name`

| File | Operation | Description |
|------|-----------|-------------|
| `backend/routes/dispatch.js` | Modify | Auto serial, customer_id support |
| `frontend/src/pages/Dispatch.jsx` | Modify | Customer dropdown, remove address/order fields |

### 5B. Production — Dynamic Printing Stock (Requirement #8)

**Concept:** When user selects a size + brand in the Production form, auto-calculate `printing_stock_used` from printing stock data.

**Implementation:**
- Frontend fetches `dashboardAPI.getPrintingStockList()` on Production page load
- When size + brand are selected, look up the matching entry's `available` value
- Pre-fill `printing_stock_used` as read-only (or auto-calculated = quantity_produced)
- Actually: `printing_stock_used` = `quantity_produced` (the user enters qty, stock used equals it)

**Alternative interpretation:** The "printing stock used" field should show the available printing stock for that size+brand combo, and the user only enters quantity_produced. The `printing_stock_used` is set equal to `quantity_produced` automatically.

| File | Operation | Description |
|------|-----------|-------------|
| `frontend/src/pages/Production.jsx` | Modify | Fetch printing stock, auto-fill printing_stock_used from qty |

### 5C. Purchase Orders — Customer Dropdown + Dispatch Progress (Requirement #9)

**Customer from dropdown:**
- Replace `company_name` text input with `SearchableSelect` from customers
- Store both `customer_id` and `company_name`

**Dispatch Progress UI:**
Instead of "Linked" badge, show a progress indicator:
- Add `quantity_dispatched` field to PurchaseOrder schema (default 0)
- When a dispatch is created for a PO, update `quantity_dispatched`
- UI: Progress bar showing `dispatched / total` (e.g., "1,000 / 5,000")
- Color coding: 0% = red, partial = orange, 100% = green

**Backend changes:**
- Add `quantity_dispatched` to PurchaseOrder model
- New endpoint or modify dispatch POST to accept `purchase_order_id` and update PO's `quantity_dispatched`
- Remove the old auto-create-dispatch-on-status-change logic

**Frontend PO table:**
- Replace "Dispatch" column with progress bar component
- Show: `{dispatched}/{total}` with visual bar

| File | Operation | Description |
|------|-----------|-------------|
| `backend/models/PurchaseOrder.js` | Modify | Add quantity_dispatched field |
| `backend/routes/purchaseOrders.js` | Modify | Customer dropdown support, dispatch tracking |
| `backend/routes/dispatch.js` | Modify | Accept purchase_order_id, update PO dispatched qty |
| `frontend/src/pages/PurchaseOrders.jsx` | Modify | Customer dropdown, progress bar UI |

---

## Phase 6: Printing Stock Cascading Logic (Requirement #10)

### Business Logic

When a production entry is created for a brand that is NOT "BOTTOM", "TOP", or "LID" (and not LWBF variants):
- For the **same size**, auto-increment "used in production" for BOTTOM, TOP, and LID brands

Special case for LWBF brands (42/45/46/47/48/53/69 — **need clarification on which exact brand names these refer to**):
- Auto-increment "used in production" for "LID LWBF" and "BOTTOM LWBF" for the same size

### Implementation

**Backend (`backend/routes/production.js` POST):**

```pseudo
on create production entry:
  brand_name = entry.brand_name
  size_id = entry.size_id
  quantity = entry.quantity_produced (or printing_stock_used)

  EXCLUDED_BRANDS = ["BOTTOM", "TOP", "LID", "BOTTOM LWBF", "LID LWBF"]
  LWBF_BRANDS = [<need exact brand names for 42/45/46/47/48/53/69>]

  if brand_name NOT IN EXCLUDED_BRANDS:
    if brand_name IN LWBF_BRANDS:
      // Update LID LWBF and BOTTOM LWBF for same size
      create/update production shadow entries for LID LWBF + BOTTOM LWBF
    else:
      // Update BOTTOM, TOP, LID for same size
      create/update production shadow entries for BOTTOM + TOP + LID
```

**Dashboard printing-stock-list endpoint:**
- Already aggregates `used_in_production` from all production entries
- The shadow entries will automatically reflect in the stock calculations

**CLARIFICATION NEEDED:** What are the exact brand names for codes 42/45/46/47/48/53/69? Are these specific brands from the brand list? Possible candidates from the DB:
- Could be: 2KG LWBF, LWBF, COMM LWBF, B/FILLER, COMM B/FILLER, etc.
- Please confirm which brands should trigger LWBF cascading vs regular cascading

| File | Operation | Description |
|------|-----------|-------------|
| `backend/routes/production.js` | Modify | Add cascading logic on POST for BOTTOM/TOP/LID auto-update |

---

## Risks and Mitigation

| Risk | Mitigation |
|------|------------|
| Removing statuses may break existing data/queries | Keep fields in DB but stop using them in UI; no migration needed |
| Cascading production logic complexity | Unit test the logic thoroughly; make brand lists configurable |
| Customer entity is new — dispatches reference old data | Migration: create customers from existing unique `customer_name` values |
| Multiple rows per printing job changes pagination | Test with existing seed data; ensure row count is correct |
| Printing stock auto-calculation accuracy | Cross-validate with manual calculations from screenshots |

---

## Clarifications Needed

1. **Requirement #10:** Which exact brand names correspond to codes 42/45/46/47/48/53/69? (for LWBF cascading logic)
2. **Requirement #8:** Should `printing_stock_used` = `quantity_produced` automatically, or should it show available printing stock as a reference?
3. **Requirement #5:** When showing "Total Printing" in the create dialog, should it use the selected raw material's available sheets for the calculation preview?

---

## Implementation Order (Sequential with Parallelism)

```
Phase 1 (Foundation) ──→ Phase 2 (Stock Pages) ──→ Phase 3 (UI Fixes) ──→ Phase 4 (Printing) ──→ Phase 5 (Dispatch/Prod/PO) ──→ Phase 6 (Cascading Logic)
  │                        │                        │
  ├─ 1A: Customer BE      ├─ 2A: Raw Material pg   ├─ 3A: Purchase serial
  ├─ 1B: Customer FE      ├─ 2B: Printing Stock pg ├─ 3B: Date picker CSS
  ├─ 1C: SearchableSelect ├─ 2C: Finished Goods pg ├─ 3C: Remove statuses
  │                        └─ 2D: Nav updates       │
  │                                                  │
  └─ All can run in parallel within phase            └─ 3A+3B parallel, 3C sequential
```

## Key Files Summary

| File | Operations | Phases |
|------|-----------|--------|
| `backend/server.js` | Mount customer routes | 1 |
| `backend/models/Customer.js` | CREATE | 1 |
| `backend/routes/customers.js` | CREATE | 1 |
| `backend/models/PrintingJob.js` | Remove status | 3 |
| `backend/models/Dispatch.js` | Remove status | 3 |
| `backend/models/PurchaseOrder.js` | Remove status, add qty_dispatched | 3, 5 |
| `backend/routes/purchases.js` | Auto sr_no | 3 |
| `backend/routes/printingJobs.js` | Auto job_number, remove status | 3, 4 |
| `backend/routes/dispatch.js` | Auto serial, customer, remove status | 3, 5 |
| `backend/routes/production.js` | Cascading logic | 6 |
| `backend/routes/purchaseOrders.js` | Customer, remove status, dispatch tracking | 3, 5 |
| `backend/routes/dashboard.js` | Remove status-based stats | 3 |
| `frontend/src/components/SearchableSelect.jsx` | CREATE | 1 |
| `frontend/src/components/Layout.jsx` | Add nav items | 1, 2 |
| `frontend/src/lib/api.js` | Add customersAPI | 1 |
| `frontend/src/App.js` | Add routes | 1, 2 |
| `frontend/src/App.css` | Date picker CSS | 3 |
| `frontend/src/pages/Customers.jsx` | CREATE | 1 |
| `frontend/src/pages/RawMaterialStock.jsx` | CREATE | 2 |
| `frontend/src/pages/PrintingStock.jsx` | CREATE | 2 |
| `frontend/src/pages/FinishedGoods.jsx` | CREATE | 2 |
| `frontend/src/pages/Purchase.jsx` | Remove sr_no input | 3 |
| `frontend/src/pages/Printing.jsx` | Major overhaul | 3, 4 |
| `frontend/src/pages/Production.jsx` | Dynamic printing stock | 5 |
| `frontend/src/pages/Dispatch.jsx` | Customer dropdown, remove fields | 3, 5 |
| `frontend/src/pages/PurchaseOrders.jsx` | Customer dropdown, progress bar | 3, 5 |
| `frontend/src/pages/Dashboard.jsx` | Remove status-based charts | 3 |
