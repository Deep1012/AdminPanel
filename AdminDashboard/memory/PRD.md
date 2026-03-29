# Manufacturing CRM System - PRD

## Original Problem Statement
Build a CRM system for managing manufacturing workflow:
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
- JWT-based login with token expiration
- User locking capability (admin only)
- Role-based access control (admin/user)

### Data Management
- 70 pre-populated paint brands
- 6 container sizes
- CRUD operations for all modules

### Workflow
1. **Purchase** → Raw material entry with quantity, rate, supplier, invoice
2. **Printing/Coating** → Jobs with multiple brands, body counts per brand, size selection
3. **Production** → Finished goods creation linked to printing jobs
4. **Dispatch** → Order tracking with customer details, status management
5. **Dashboard** → Real-time stats, stock charts, production overview

## What's Been Implemented (March 2026)
- [x] JWT Authentication with login/logout
- [x] User management with lock/unlock feature
- [x] 70+ brands and 6 sizes pre-seeded
- [x] Purchase management module
- [x] Printing/Coating job management with multi-brand support
- [x] Production tracking module
- [x] Dispatch and order management
- [x] Dashboard with stats cards and charts
- [x] Admin panel (Users, Brands, Sizes tabs)
- [x] Industrial dark theme UI
- [x] Responsive sidebar navigation

## Tech Stack
- **Frontend**: React, TailwindCSS, Shadcn/UI, Recharts
- **Backend**: FastAPI, Motor (async MongoDB)
- **Database**: MongoDB
- **Auth**: JWT tokens with bcrypt password hashing

## Prioritized Backlog
### P0 (Critical)
- None currently

### P1 (High Priority)
- Export reports to Excel/PDF
- Search and filter on all data tables
- Date range filtering for reports
- User registration by admin

### P2 (Medium Priority)
- Batch printing job creation
- Stock alerts/notifications
- Mobile app version
- Audit trail for changes

### P3 (Low Priority)
- Dark/Light theme toggle
- Multi-language support
- Barcode integration
- Dashboard customization

## Next Tasks
1. Add export functionality for reports
2. Implement search/filter on data tables
3. Add date range pickers for filtering
4. Create user registration flow for admin
