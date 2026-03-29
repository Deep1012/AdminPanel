# PRD: TIMESTIN CRM Feature Update v2
## Brands/Sizes Tables + Universal Search + Dashboard Redesign + Purchase Orders

---

## Overview

Four interconnected improvements to the TIMESTIN Manufacturing CRM:
1. Converting Brands and Sizes pages from badge-chip layouts to proper data tables
2. Adding universal search and filter to all data tables
3. Redesigning the Dashboard with charts and activity feeds
4. Building a new Purchase Order (PO) module that tracks the customer order lifecycle from receipt through delivery with dispatch auto-linking

---

## R1: Brands & Sizes as Tables

- Replace the `flex-wrap` badge-chip layout with proper `<table>` elements
- Columns: `#` (index), `Name`, `Created Date`, `Actions` (Edit / Delete)
- Maintain existing Create/Edit dialog and Delete confirmation behavior
- Follow the same `data-table` CSS class pattern used across all pages

## R2: Universal Search & Filter

Every data table gets a search bar rendered above the table card. Filtering is **client-side**.

| Page | Text Search | Filters |
|------|------------|---------|
| Purchase | sr_no, supplier | gauge (select), date range |
| Printing | job_number, raw_material_sr_no | status (select) |
| Production | brand_name, size_name | date range |
| Dispatch | order_number, customer_name | status (select), date range |
| Brands | name | - |
| Sizes | name | - |
| Users (Admin) | username, email | - |
| Purchase Orders | serial_no, company_name | status (select), date range |

## R3: Dashboard Redesign

### Remove
- Export All to Excel button and per-table export buttons
- Three stock list tables (Raw Material Stock, Printing Stock, Finished Goods)

### Keep
- Summary stat cards (redesigned)

### Add
- **5 Stat Cards**: Total Purchases, Total Printing Jobs, Total Production, Total Dispatches, Pending POs
- **Charts** (recharts):
  - Production Trend: bar chart, production quantity grouped by month (last 6 months)
  - Dispatch Status Distribution: pie chart, count by status
  - Purchase Stock Levels: horizontal bar chart, available sheets by material size
- **Recent Activity Feed**: last 10 entries across all modules sorted by date
- **PO Alerts Panel**: pending POs requiring attention (count + list of latest 5)

### Dashboard Layout (top to bottom)
1. Stat Cards Row (5 cards, responsive grid)
2. Charts Row (3 columns on desktop, stacked on mobile)
3. Bottom Row (2 columns: Recent Activity + PO Alerts)

## R4: Purchase Order (PO) Module

### Data Model

```
PurchaseOrder {
  id:            String (UUID, required, unique)
  serial_no:     String (required, unique) -- auto: "PO-20260329-001"
  date:          String (ISO date, required)
  company_name:  String (required)
  brand_id:      String (required)
  brand_name:    String (required)
  size_id:       String (required)
  size_name:     String (required)
  quantity:      Number (required, min: 1)
  status:        String (enum: received|confirmed|in_production|ready|dispatched|delivered, default: received)
  notes:         String (nullable)
  dispatch_id:   String (nullable) -- linked Dispatch entry ID
  created_by:    String (required)
  created_at:    String (ISO timestamp)
}
```

### Status Flow
`received` -> `confirmed` -> `in_production` -> `ready` -> `dispatched` -> `delivered`

### Dispatch Auto-Linking
When PO status changes to `dispatched`:
- Auto-create a Dispatch entry with PO's brand, size, quantity, company as customer
- Store dispatch ID in PO's `dispatch_id` field
- Guard: if `dispatch_id` already exists, skip duplicate creation

### API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/purchase-orders` | List all POs, sorted by date desc |
| POST | `/api/purchase-orders` | Create PO (auto-generate serial_no) |
| PUT | `/api/purchase-orders/:poId` | Update PO; if status -> dispatched, auto-create Dispatch |
| DELETE | `/api/purchase-orders/:poId` | Delete PO |

### Frontend Page
- Route: `/purchase-orders`
- Nav: "PURCHASE ORDERS" between DASHBOARD and PURCHASE, icon: ClipboardList
- Stat cards: Total POs, Pending, In Production, Ready to Dispatch
- Table columns: Date, Serial No, Company, Brand, Size, Qty, Status, Notes, Linked Dispatch, By, Actions
- Create/Edit dialog with date, company_name, brand (select), size (select), quantity, notes
- Serial no auto-generated (shown read-only on edit)
- Status change via inline Select dropdown
- Delete with ConfirmDialog

---

## Implementation Phases

### Phase 1: Shared Infrastructure
- Create `useDebounce` hook
- Create `useTableFilter` hook (debounced search + multi-field text matching + filter chains)
- Create `TableSearch` reusable component (search input + filter dropdowns + clear button)
- Update `utils.js` with PO status helpers

### Phase 2: Brands & Sizes Table Conversion
- Convert Brands.jsx from badge layout to data table + TableSearch
- Convert Sizes.jsx from badge layout to data table + TableSearch

### Phase 3: Search & Filter for Existing Tables
- Add search/filter to Purchase, Printing, Production, Dispatch, Admin pages
- Each page gets TableSearch component wired with useTableFilter

### Phase 4: PO Backend
- Create PurchaseOrder Mongoose model
- Create purchaseOrders.js routes (CRUD + dispatch auto-creation)
- Mount routes in server.js

### Phase 5: PO Frontend
- Add purchaseOrdersAPI to api.js
- Create PurchaseOrders.jsx page
- Add route in App.js and nav item in Layout.jsx

### Phase 6: Dashboard Redesign
- Add 4 new dashboard backend endpoints (production-trend, dispatch-distribution, recent-activity, po-summary)
- Update /stats to include PO counts
- Create DashboardCharts, RecentActivity, POAlerts components
- Rewrite Dashboard.jsx (remove exports, add charts + activity + alerts)

---

## Files to CREATE (9 files)

| File | Phase |
|------|-------|
| `frontend/src/hooks/useDebounce.js` | 1 |
| `frontend/src/hooks/useTableFilter.js` | 1 |
| `frontend/src/components/TableSearch.jsx` | 1 |
| `backend/models/PurchaseOrder.js` | 4 |
| `backend/routes/purchaseOrders.js` | 4 |
| `frontend/src/pages/PurchaseOrders.jsx` | 5 |
| `frontend/src/components/DashboardCharts.jsx` | 6 |
| `frontend/src/components/RecentActivity.jsx` | 6 |
| `frontend/src/components/POAlerts.jsx` | 6 |

## Files to MODIFY (14 files)

| File | Phase | Change |
|------|-------|--------|
| `frontend/src/lib/utils.js` | 1 | Add PO status helpers |
| `frontend/src/pages/Brands.jsx` | 2 | Badge-chips -> table + search |
| `frontend/src/pages/Sizes.jsx` | 2 | Badge-chips -> table + search |
| `frontend/src/pages/Purchase.jsx` | 3 | Add search/filter bar |
| `frontend/src/pages/Printing.jsx` | 3 | Add search/filter bar |
| `frontend/src/pages/Production.jsx` | 3 | Add search/filter bar |
| `frontend/src/pages/Dispatch.jsx` | 3 | Add search/filter bar |
| `frontend/src/pages/Admin.jsx` | 3 | Add search/filter bar |
| `backend/server.js` | 4 | Mount PO routes |
| `frontend/src/lib/api.js` | 5+6 | Add PO API + dashboard endpoints |
| `frontend/src/components/Layout.jsx` | 5 | Add PO nav item |
| `frontend/src/App.js` | 5 | Add PO route |
| `backend/routes/dashboard.js` | 6 | Add 4 new endpoints, update stats |
| `frontend/src/pages/Dashboard.jsx` | 6 | Complete redesign |

---

## Risks

| Risk | Severity | Mitigation |
|------|----------|------------|
| Dispatch auto-creation fails mid-operation | High | Don't update PO status if Dispatch creation fails; check dispatch_id exists before creating |
| Client-side filtering slow with large datasets | Medium | useDebounce (300ms); future: server-side pagination |
| Dashboard 6 API calls on mount | Medium | Use Promise.allSettled; skeleton loaders per section |
| PO serial number race condition | Low | unique index on serial_no; retry with incremented sequence |
| Removing Dashboard export | Low | Keep xlsx/file-saver for future per-page export buttons |
