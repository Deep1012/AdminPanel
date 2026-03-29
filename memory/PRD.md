# Manufacturing CRM System - PRD

## Problem Statement
Build a CRM system for managing manufacturing workflow at a paint can factory:
- Purchase management (raw material entry item by item)
- Printing/Coating jobs (multiple brands per job, body counts, material consumption)
- Production (finished goods from printed bodies)
- Dispatch (order tracking)
- Dashboard (printing/coating stock, finished goods stock)
- Admin settings (manage brands, sizes, users with lockable editing)

## User Personas
1. **Admin User**: Full access to all modules including user management, brand/size management
2. **Regular User**: Access to operational modules (Purchase, Printing, Production, Dispatch, Dashboard)

## Core Requirements
### Authentication
- JWT-based login with 24h token expiration
- User locking capability (admin only)
- Role-based access control (admin/user)

### Data Management
- 70 pre-populated paint brands
- 6 container sizes
- CRUD operations for all modules

### Workflow
1. **Purchase** -> Raw material entry with gauge, size, weight, supplier, invoice
2. **Printing/Coating** -> Jobs with multiple brands, body counts per brand, size selection, linked to raw materials
3. **Production** -> Finished goods creation linked to printing jobs
4. **Dispatch** -> Order tracking with customer details, status management
5. **Dashboard** -> Real-time stats, stock charts, production overview

## Tech Stack
- **Frontend**: React 19, Tailwind CSS 3, shadcn/ui (new-york style), Recharts, react-hook-form + zod
- **Backend**: Node.js, Express, Mongoose
- **Database**: MongoDB Atlas
- **Auth**: JWT (HS256) with bcryptjs password hashing

## What's Been Implemented (March 2026)
- [x] JWT Authentication with login/logout
- [x] User management with lock/unlock feature
- [x] 70+ brands and 6 sizes pre-seeded
- [x] Purchase management module (auto sheet calculation)
- [x] Printing/Coating job management with multi-brand support
- [x] Production tracking module
- [x] Dispatch and order management
- [x] Purchase Order management (6-stage status pipeline, auto-dispatch creation)
- [x] Dashboard with stats cards, charts, trend indicators
- [x] Admin panel (Users, Brands, Sizes pages)
- [x] Industrial dark theme UI
- [x] Responsive sidebar navigation with collapsible toggle
- [x] Header profile dropdown with avatar
- [x] Backend migrated from Python/FastAPI to Node.js/Express (March 2026)
- [x] Excel export for all modules (xlsx + file-saver)
- [x] Search and filter on all data tables
- [x] Client-side pagination on all tables (10/25/50/100 per page)
- [x] Standalone seed script (npm run seed) with 12 entries per collection
- [x] CRM.md user guide documentation
- [x] Mongoose runValidators on all update operations

## Prioritized Backlog
### P2 (Medium Priority)
- Batch printing job creation
- Stock alerts/notifications
- Audit trail for changes
- Date range filtering for reports

### P3 (Low Priority)
- Dark/Light theme toggle
- Multi-language support
- Barcode integration
- Dashboard customization
- Export to PDF
