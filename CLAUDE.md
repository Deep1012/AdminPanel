# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**TIMESTIN CRM** - A manufacturing CRM for a paint/coating factory. Tracks the full production pipeline: raw material purchase (metal sheets) -> printing/coating jobs -> production -> dispatch. Monorepo with a Node.js/Express backend and React frontend.

**Domain context:** The business manufactures paint cans. "Brands" are paint product lines (e.g., SYNCOAT, AUTOCOAT). "Sizes" are can sizes (e.g., 4LTR/5KG, 1LTR). Raw materials are metal sheets purchased by weight, gauge, and dimensions.

### Key Business Formulas
- **No. of Sheets** = Weight / (Gauge x Size1 x Size2 / 100000 x 0.785)
- **Printing Stock** = Bodies in Job x Sheets from Raw Material
- **Available Printing Stock** = Printing Done - Used in Production
- **Finished Goods Available** = Quantity Produced - Quantity Dispatched

### Production Cascading Logic
When a production entry is created for any brand that is NOT one of the excluded brands (BOTTOM, TOP, LID, BOTTOM LWBF, LID LWBF):
1. **Always**: Auto-creates matching entries for BOTTOM, TOP, and LID of the same size and quantity
2. **LWBF brands only**: If the source brand has `is_lwbf=true`, also auto-creates BOTTOM LWBF and LID LWBF entries

LWBF-flagged brands: LWBF, B/FILLER, COMM LWBF, COMM B/FILLER, 2KG LWBF, PRIDE PUTTY, PLAIN. Managed via the LWBF toggle on the Brands page.

Cascaded entries track their parent via `parent_production_id`. Deleting or updating a parent propagates to all children.

### PO-Dispatch Sync
- Creating a dispatch linked to a PO increments the PO's `quantity_dispatched`
- Updating a dispatch reverses the old PO sync and applies the new one
- Deleting a dispatch decrements the PO's `quantity_dispatched`
- Dispatch creation auto-matches to a PO by brand + size + customer if no PO is explicitly selected
- Over-dispatch is rejected (quantity cannot exceed PO remaining)
- PO quantity cannot be reduced below already-dispatched amount

### Pipeline Integrity
- Deleting a printing job rolls back `sheets_used` on the raw material
- Deleting a raw material is blocked if printing jobs reference it
- Deleting a PO unlinks all referencing dispatches (sets `purchase_order_id=null`)
- Production form excludes cascade target brands (BOTTOM/TOP/LID/LWBF) from the dropdown

## Commands

### Backend
```bash
cd backend
npm install
npm run dev          # Dev server with nodemon
npm start            # Production
```

### Frontend
```bash
cd frontend
yarn install
yarn start          # Dev server (uses craco)
yarn build          # Production build
yarn test           # Run tests
```

### Seed Data
```bash
cd backend
npm run seed         # Clear & re-seed 12 entries per operational collection
```
POST `/api/seed` creates default brands, sizes, and admin user (admin@crm.com / admin123) on first run.

## Architecture

### Backend (`backend/`)
Node.js + Express + Mongoose. Structured into models, routes, middleware, and config.

- `server.js` - Express app entry, CORS, route mounting
- `config/db.js` - MongoDB Atlas connection via Mongoose
- `middleware/auth.js` - JWT verification (`authenticate`) and role gate (`adminRequired`)
- `models/` - Mongoose schemas: User, Brand, Size, Purchase, PrintingJob, Production, Dispatch, PurchaseOrder, MenuItem, Customer
- `routes/` - Express routers: auth, users, brands, sizes, purchases, printingJobs, production, dispatch, dashboard, purchaseOrders, customers, menuItems, admin
- `seed-data.js` - Standalone seed script (`npm run seed`) — clears operational data and inserts 12 entries per collection

**Collections:** `users`, `brands`, `sizes`, `purchases`, `printingjobs`, `productions`, `dispatches`, `purchaseorders`, `customers`, `menuitems`

**Key model fields:**
- `Brand.is_lwbf` (Boolean) — flags brands that trigger LWBF cascade in production
- `Production.parent_production_id` (String) — links cascaded entries to their parent
- `Dispatch.purchase_order_id` (String) — links dispatches to POs for quantity tracking
- `PurchaseOrder.quantity_dispatched` (Number) — auto-synced from dispatch operations

**Auth:** JWT (HS256) with Bearer tokens. 24h expiry. Two roles: `admin` and `user`.

**Env vars:** `MONGO_URL`, `JWT_SECRET`, `CORS_ORIGINS`, `PORT`

### Frontend (`frontend/`)
React 19 + CRA (via craco) + Tailwind CSS 3 + shadcn/ui (new-york style, JSX not TSX).

**Key paths:**
- `src/lib/api.js` - Axios client with auth interceptor; all API functions exported here
- `src/context/AuthContext.js` - Auth state (token in localStorage, user object)
- `src/components/Layout.jsx` - Sidebar + header shell wrapping all protected pages
- `src/components/ui/` - shadcn/ui primitives (do not edit manually; use shadcn CLI to add)
- `src/pages/` - Route pages: Login, Dashboard, PurchaseOrders, Purchase, Printing, Production, Dispatch, Brands, Sizes, Customers, Admin, MenuManagement, RawMaterialStock, PrintingStock, FinishedGoods
- `src/lib/iconMap.js` - Maps icon name strings to lucide-react components (used by dynamic menu)
- `src/components/SearchableSelect.jsx` - Searchable dropdown for customer selection
- `src/hooks/usePagination.js` - Client-side pagination hook (all tables)
- `src/hooks/useTableFilter.js` - Client-side search/filter hook
- `src/components/TablePagination.jsx` - Pagination UI component
- `src/components/TableSearch.jsx` - Search bar component
- `src/lib/exportToExcel.js` - Excel export utility

**Routing:** react-router-dom v7. `ProtectedRoute` wraps authenticated pages; `PublicRoute` wraps login. Admin page requires `adminOnly` flag.

**Path alias:** `@/` maps to `src/` (configured in craco.config.js and jsconfig.json).

**Env vars:** `REACT_APP_BACKEND_URL` (no trailing slash)

### Design System
Dark industrial theme ("Tactical Factory"). Safety orange primary (`#ea580c`), dark zinc backgrounds. Fonts: Barlow Condensed (headings), IBM Plex Sans (body), JetBrains Mono (data). All interactive elements must have `data-testid` attributes. No gradients, no shadows, rounded-sm only. Uppercase labels on table headers and form labels.

### Admin Features
- **Clear Operational Data** (`/admin` page) — Deletes all purchases, printing jobs, production, dispatches, and POs. Preserves brands, sizes, customers, users, and menu items.
- **Dynamic Menu Management** (`/menu-management` page) — Admin can add/edit/delete/reorder sidebar navigation items. Menu items stored in DB (`menuitems` collection). Layout fetches from API with hardcoded fallback. System items (Dashboard, Menu Management, Users) cannot be deleted.
- **LWBF Toggle** (`/brands` page) — Admin toggles which brands trigger LWBF cascade in production.

### Deployment
- **Backend:** Render (auto-deploy on push) — https://timestin-crm-backend.onrender.com
- **Frontend:** Netlify (manual deploy via CLI) — https://timestin-crm.netlify.app
- **Deploy frontend:** `cd frontend && REACT_APP_BACKEND_URL=https://timestin-crm-backend.onrender.com npx craco build && npx netlify-cli deploy --prod --dir=build --site=6e3e1c00-9360-4154-85f6-4bfe7e75c2a7 --no-build`

## Conventions
- Forms use react-hook-form + zod validation
- Toast notifications via sonner (bottom-right)
- Charts via recharts
- Excel export via xlsx (file-saver)
- All entity IDs are UUIDs (generated server-side)
- MongoDB documents use `id` field (not `_id`) for application-level IDs
- API routes all under `/api` prefix
- Error responses use `{ detail: "message" }` format
