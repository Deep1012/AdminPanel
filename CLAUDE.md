# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**TIMESTIN CRM** - A manufacturing CRM for a paint/coating factory. Tracks the full production pipeline: raw material purchase (metal sheets) -> printing/coating jobs -> production -> dispatch. Monorepo with a Node.js/Express backend and React frontend.

**Domain context:** The business manufactures paint cans. "Brands" are paint product lines (e.g., SYNCOAT, AUTOCOAT). "Sizes" are can sizes (e.g., 4LTR/5KG, 1LTR). Raw materials are metal sheets purchased by weight, gauge, and dimensions.

### Key Business Formulas
- **No. of Sheets** = Weight / (Gauge x Size1 x Size2 / 100000 x 0.785)
- **Printing Stock** = Bodies in Job x Sheets from Raw Material
- **Available Printing Stock** = Printing Done - Used in Production

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
- `models/` - Mongoose schemas: User, Brand, Size, Purchase, PrintingJob, Production, Dispatch, PurchaseOrder
- `routes/` - Express routers: auth, users, brands, sizes, purchases, printingJobs, production, dispatch, dashboard, purchaseOrders
- `seed-data.js` - Standalone seed script (`npm run seed`) — clears operational data and inserts 12 entries per collection

**Collections:** `users`, `brands`, `sizes`, `purchases`, `printingjobs`, `productions`, `dispatches`, `purchaseorders`

**Auth:** JWT (HS256) with Bearer tokens. 24h expiry. Two roles: `admin` and `user`.

**Env vars:** `MONGO_URL`, `JWT_SECRET`, `CORS_ORIGINS`, `PORT`

### Frontend (`frontend/`)
React 19 + CRA (via craco) + Tailwind CSS 3 + shadcn/ui (new-york style, JSX not TSX).

**Key paths:**
- `src/lib/api.js` - Axios client with auth interceptor; all API functions exported here
- `src/context/AuthContext.js` - Auth state (token in localStorage, user object)
- `src/components/Layout.jsx` - Sidebar + header shell wrapping all protected pages
- `src/components/ui/` - shadcn/ui primitives (do not edit manually; use shadcn CLI to add)
- `src/pages/` - Route pages: Login, Dashboard, PurchaseOrders, Purchase, Printing, Production, Dispatch, Brands, Sizes, Admin
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

## Conventions
- Forms use react-hook-form + zod validation
- Toast notifications via sonner (bottom-right)
- Charts via recharts
- Excel export via xlsx (file-saver)
- All entity IDs are UUIDs (generated server-side)
- MongoDB documents use `id` field (not `_id`) for application-level IDs
- API routes all under `/api` prefix
- Error responses use `{ detail: "message" }` format
