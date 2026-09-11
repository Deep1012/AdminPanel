# TIMESTIN CRM - Project Feature List & Quotation

**Project:** TIMESTIN Manufacturing CRM  
**Type:** Full-Stack Web Application (Custom Built)  
**Date:** April 2026  
**Prepared By:** ___________________  
**Prepared For:** ___________________

---

## Project Overview

A comprehensive, custom-built Manufacturing CRM system designed for the paint container manufacturing industry. The system tracks the entire production pipeline from raw material procurement through to final dispatch, with full inventory management, purchase order tracking, and business analytics.

**Live Application:** https://timestin-crm.netlify.app  
**Backend API:** https://timestin-crm-backend.onrender.com/api

---

## 1. Authentication & User Management

| # | Feature | Description |
|---|---------|-------------|
| 1.1 | Secure Login System | Email/password authentication with encrypted credentials |
| 1.2 | JWT Token Authentication | 24-hour session tokens with automatic expiry |
| 1.3 | Role-Based Access Control | Two roles (Admin, User) with granular permissions |
| 1.4 | Account Lock/Unlock | Admin can lock user accounts to prevent access |
| 1.5 | User Registration | Admin can create new user accounts with role assignment |
| 1.6 | User Management (CRUD) | Create, edit, delete users with password reset capability |
| 1.7 | Auto-Logout on Expiry | Automatic session cleanup and redirect on token expiry |
| 1.8 | Credential Sharing View | Shows username/password after creation for easy sharing |

---

## 2. Dashboard & Analytics

| # | Feature | Description |
|---|---------|-------------|
| 2.1 | Personalized Welcome | Greeting banner with logged-in user name |
| 2.2 | Date-Filtered Statistics | Filter all dashboard stats by specific date |
| 2.3 | Purchase Stats Card | Total items, total sheets, sheets available |
| 2.4 | Printing Stats Card | Total jobs, printing stock available |
| 2.5 | Production Stats Card | Total produced, available finished goods |
| 2.6 | Dispatch Stats Card | Total dispatches, quantity dispatched |
| 2.7 | Purchase Orders Stats Card | Total POs, total quantity |
| 2.8 | 30-Day Trend Indicators | Percentage change vs previous 30 days per card |
| 2.9 | Production Trend Chart | Interactive area chart with Daily/Weekly/Monthly toggle |
| 2.10 | Raw Material Stock Chart | Horizontal bar chart showing Available vs Used sheets by size |
| 2.11 | Recent Activity Feed | Last 10 activities across all modules |
| 2.12 | Recent Purchase Orders Widget | Latest 5 POs with quick navigation |
| 2.13 | Responsive Grid Layout | Auto-adapts to screen size |

---

## 3. Raw Material Purchase Management

| # | Feature | Description |
|---|---------|-------------|
| 3.1 | Purchase Entry (CRUD) | Create, view, edit, delete raw material purchases |
| 3.2 | Auto Serial Number | Sequential numbering (RM-001, RM-002...) |
| 3.3 | Sheet Auto-Calculation | Automatic calculation: Weight / (Gauge x Size1 x Size2 / 100000 x 0.785) |
| 3.4 | Stock Tracking | Real-time tracking of total sheets, used sheets, available sheets |
| 3.5 | Supplier & Invoice Tracking | Optional supplier name and invoice number per entry |
| 3.6 | 15-Column Data Table | Date, SR No, Gauge, Size 1, Size 2, Temper, Weight, Total Sheets, Used, Available, Supplier, Created By, Updated By, Actions |
| 3.7 | Column Sorting | Sortable on all data columns with direction indicators |
| 3.8 | Multi-Filter Search | Full-text search + Gauge dropdown + Date range (from/to) |
| 3.9 | Pagination | Configurable: 10/25/50/100 items per page |
| 3.10 | Excel Export | Export current filtered view to .xlsx |
| 3.11 | Excel Import with Template | Bulk import from Excel with downloadable template, progress bar, and validation feedback |
| 3.12 | Color-Coded Availability | Green for available stock, yellow/orange for used stock |
| 3.13 | Summary Statistics Cards | Total Entries, Total Sheets, Total Weight |
| 3.14 | Deletion Protection | Prevents deletion if linked printing jobs exist |

---

## 4. Printing/Coating Job Management

| # | Feature | Description |
|---|---------|-------------|
| 4.1 | Printing Job Entry (CRUD) | Create, view, edit, delete printing/coating jobs |
| 4.2 | Auto Job Number | Sequential numbering (JOB-001, JOB-002...) |
| 4.3 | Raw Material Linking | Select raw material from dropdown with available sheet info |
| 4.4 | Sheet Consumption Tracking | Validates and tracks sheets used from raw material |
| 4.5 | Multi-Size, Multi-Brand Support | One job can include multiple sizes and brands |
| 4.6 | Bodies Count Calculation | Total bodies calculated across all brand entries |
| 4.7 | Total Printing Calculation | Bodies x Sheets Used per entry |
| 4.8 | Sheet Rollback on Delete | Restores used sheets to raw material when job deleted |
| 4.9 | 13-Column Data Table | Date, Job #, Raw Material, Material Size, Sheets Used, Container Size, Brand, Bodies, Total Printing, Created By, Updated By, Actions |
| 4.10 | Column Sorting | All columns sortable |
| 4.11 | Search & Filtering | Text search across job #, material, brand, size |
| 4.12 | Pagination | Configurable page sizes |
| 4.13 | Excel Export | Export to .xlsx |
| 4.14 | Excel Import with Template | Bulk import with validation (material, brand, size lookups) |
| 4.15 | Summary Cards | Total Jobs, Total Bodies |

---

## 5. Production Management

| # | Feature | Description |
|---|---------|-------------|
| 5.1 | Production Entry (CRUD) | Create, view, edit, delete production records |
| 5.2 | Automatic Cascading (BOTTOM/TOP/LID) | Every production entry auto-creates matching BOTTOM, TOP, and LID entries |
| 5.3 | LWBF Cascading | LWBF-flagged brands additionally auto-create BOTTOM LWBF and LID LWBF entries |
| 5.4 | Cascade Update Propagation | Editing parent updates all cascaded children automatically |
| 5.5 | Cascade Delete | Deleting parent removes all cascaded children |
| 5.6 | Printing Stock Consumption | Tracks printing stock used per production entry |
| 5.7 | Real-Time Stock Display | Shows available printing stock when selecting brand/size |
| 5.8 | System Brand Filtering | Hides auto-generated brands (BOTTOM, TOP, LID, LWBF) from creation form |
| 5.9 | 10-Column Data Table | Date, Size, Brand, Printing Used, Qty Produced, Notes, Created By, Updated By, Actions |
| 5.10 | Column Sorting | All columns sortable |
| 5.11 | Search & Date Range Filter | Text search + date from/to |
| 5.12 | Pagination | Configurable page sizes |
| 5.13 | Excel Export | Export to .xlsx |
| 5.14 | Excel Import with Template | Bulk import with brand/size validation |
| 5.15 | Summary Cards | Total Entries, Printing Used, Total Produced |

---

## 6. Dispatch Management

| # | Feature | Description |
|---|---------|-------------|
| 6.1 | Dispatch Entry (CRUD) | Create, view, edit, delete dispatch orders |
| 6.2 | Auto Order Number | Sequential numbering (DSP-001, DSP-002...) |
| 6.3 | Multi-Item Dispatch | One order supports multiple brand/size/qty items |
| 6.4 | Searchable Customer Dropdown | Autocomplete customer selection with search |
| 6.5 | Per-Item Notes | Individual notes for each dispatch item |
| 6.6 | PO Auto-Matching | Automatically matches dispatch to oldest Purchase Order by brand + size + customer |
| 6.7 | PO Quantity Sync | Dispatch create/update/delete automatically updates PO dispatched quantities |
| 6.8 | Over-Dispatch Prevention | Validates quantity does not exceed PO remaining |
| 6.9 | 10-Column Data Table | Date, Customer, Brand, Size, Qty, Notes, Created By, Updated By, Actions |
| 6.10 | Column Sorting | All columns sortable |
| 6.11 | Search & Date Range Filter | Text search + date from/to |
| 6.12 | Pagination | Configurable page sizes |
| 6.13 | Excel Export | Export to .xlsx |
| 6.14 | Excel Import with Template | Bulk import with customer/brand/size validation |
| 6.15 | Summary Cards | Total Orders, Total Quantity |

---

## 7. Purchase Order Management

| # | Feature | Description |
|---|---------|-------------|
| 7.1 | Purchase Order Entry (CRUD) | Create, view, edit, delete purchase orders |
| 7.2 | Auto Serial Number | Date-based sequential numbering (PO-YYYYMMDD-NNN) |
| 7.3 | Multi-Item PO Creation | Create multiple items (brand/size/qty) for same customer in one dialog |
| 7.4 | Searchable Customer Dropdown | Autocomplete customer selection |
| 7.5 | Active Orders Tab | Shows all in-progress purchase orders |
| 7.6 | Completed Orders Tab | Shows all completed/closed purchase orders |
| 7.7 | Complete/Reopen Toggle | Mark PO as completed or reopen from completed tab |
| 7.8 | Dispatched Quantity Tracking | Auto-synced count of dispatched items per PO |
| 7.9 | Pending Quantity Display | Calculated: Quantity - Dispatched (color-coded) |
| 7.10 | Company Filter Dropdown | Filter orders by company name |
| 7.11 | Edit Protection for Completed POs | Cannot edit completed orders (must reopen first) |
| 7.12 | Quantity Floor Validation | Cannot reduce PO quantity below already-dispatched amount |
| 7.13 | 10-Column Data Table | Date, Company, Brand, Size, Qty, Dispatched, Pending, Created By, Actions |
| 7.14 | Column Sorting | All columns sortable |
| 7.15 | Search & Date Range Filter | Text search + company dropdown + date from/to |
| 7.16 | Pagination | Per tab with configurable page sizes |
| 7.17 | Excel Export | Export to .xlsx |
| 7.18 | Excel Import with Template | Bulk import with validation |
| 7.19 | Summary Cards | Active Orders, Total Quantity, Pending Qty |
| 7.20 | Dispatch Unlinking on Delete | Deleting PO safely unlinks all associated dispatches |

---

## 8. Master Data Management

### 8A. Brands Management

| # | Feature | Description |
|---|---------|-------------|
| 8A.1 | Brand CRUD | Create, view, edit, delete paint brands |
| 8A.2 | LWBF Toggle | Inline switch to flag brands for LWBF cascade in production |
| 8A.3 | Auto-Uppercase | Brand names automatically converted to uppercase |
| 8A.4 | Search & Pagination | Text search, configurable page sizes |
| 8A.5 | Excel Export/Import | Export and bulk import brands |

### 8B. Sizes Management

| # | Feature | Description |
|---|---------|-------------|
| 8B.1 | Size CRUD | Create, view, edit, delete can sizes |
| 8B.2 | Auto-Uppercase | Size names automatically converted to uppercase |
| 8B.3 | Search & Pagination | Text search, configurable page sizes |
| 8B.4 | Excel Export/Import | Export and bulk import sizes |

### 8C. Customers Management (Admin Only)

| # | Feature | Description |
|---|---------|-------------|
| 8C.1 | Customer CRUD | Create, view, edit, delete customers |
| 8C.2 | Name Uniqueness | Prevents duplicate customer entries |
| 8C.3 | Search & Pagination | Text search, configurable page sizes |
| 8C.4 | Excel Export/Import | Export and bulk import customers |

---

## 9. Stock & Inventory Views (Read-Only)

### 9A. Raw Material Stock

| # | Feature | Description |
|---|---------|-------------|
| 9A.1 | Aggregated View (Size-Wise) | Grouped by size+gauge: Total Sheets, Used, Available, Weight |
| 9A.2 | Individual Entry View | All purchase entries with calculated availability |
| 9A.3 | View Mode Toggle | Switch between aggregated and individual views |
| 9A.4 | Gauge Filter Tabs | Quick-filter by gauge value |
| 9A.5 | Search, Pagination, Export | Full search, page sizes, Excel export |

### 9B. Printing Stock

| # | Feature | Description |
|---|---------|-------------|
| 9B.1 | Stock by Size & Brand | Printing Done, Used in Production, Available |
| 9B.2 | Color-Coded Values | Green for available, yellow for used |
| 9B.3 | Search, Pagination, Export | Full search, page sizes, Excel export |

### 9C. Finished Goods Stock

| # | Feature | Description |
|---|---------|-------------|
| 9C.1 | Stock by Size & Brand | Produced, Dispatched, Available |
| 9C.2 | Size Filter Tabs | Quick-filter by can size |
| 9C.3 | Color-Coded Values | Green for available, yellow for dispatched |
| 9C.4 | Search, Pagination, Export | Full search, page sizes, Excel export |

---

## 10. Administration & System Features

### 10A. Activity Logs (Admin Only)

| # | Feature | Description |
|---|---------|-------------|
| 10A.1 | Comprehensive Audit Trail | Logs all create, update, delete, login, export, import, and clear operations |
| 10A.2 | 8 Action Types Tracked | LOGIN, CREATE, UPDATE, DELETE, EXPORT, IMPORT, CLEAR_DATA, BACKUP |
| 10A.3 | 11 Entity Types | Auth, Purchase, Printing, Production, Dispatch, PO, Brand, Size, Customer, Admin, Backup |
| 10A.4 | Color-Coded Action Badges | Visual distinction by action type |
| 10A.5 | Multi-Filter System | Filter by action, entity type, username, date range |
| 10A.6 | Server-Side Pagination | 50 logs per page with navigation |
| 10A.7 | Summary Statistics | Total logs, today's logs, creates count, logins count |
| 10A.8 | User & Timestamp Tracking | Who did what and when |

### 10B. Dynamic Menu Management (Admin Only)

| # | Feature | Description |
|---|---------|-------------|
| 10B.1 | Custom Navigation Items | Add/edit/delete sidebar menu entries |
| 10B.2 | Icon Picker | 50+ Lucide icons with live preview |
| 10B.3 | Drag-Free Reordering | Up/Down buttons with save confirmation |
| 10B.4 | Admin-Only Toggle | Mark items as visible to admins only |
| 10B.5 | System Item Protection | Core items (Dashboard, Menu, Users) cannot be deleted |
| 10B.6 | Seed Defaults | One-click restore of default 15-item menu |

### 10C. Backup System (Admin Only)

| # | Feature | Description |
|---|---------|-------------|
| 10C.1 | Manual Backup | One-click full database backup |
| 10C.2 | Automated Monthly Backup | Cron job runs on 1st of every month at midnight |
| 10C.3 | 9 Collections Backed Up | All data except passwords |
| 10C.4 | Backup Download | Full JSON snapshot download |
| 10C.5 | Backup Management | View, download, delete backups |
| 10C.6 | Auto-Pruning | Keeps only 12 most recent backups |
| 10C.7 | Size Tracking | Shows backup size in bytes |

### 10D. Data Management (Admin Only)

| # | Feature | Description |
|---|---------|-------------|
| 10D.1 | Clear Operational Data | Wipe all operational data (purchases, jobs, production, dispatches, POs) |
| 10D.2 | Master Data Preservation | Brands, sizes, customers, users preserved during clear |
| 10D.3 | Confirmation Dialog | Multi-step confirmation before destructive action |
| 10D.4 | Deletion Count Report | Shows count of deleted records per collection |

---

## 11. Cross-Cutting Features (Applied Across All Modules)

| # | Feature | Description |
|---|---------|-------------|
| 11.1 | Global Excel Export (Admin) | One-click export of ALL 6 main tables simultaneously |
| 11.2 | Excel Import System | 8 entities support bulk import with template download, progress tracking, and validation |
| 11.3 | Sortable Table Columns | Click-to-sort with ascending/descending indicators on all tables |
| 11.4 | Full-Text Search | Search across multiple fields on every data page |
| 11.5 | Advanced Filtering | Date ranges, dropdown filters, text search per module |
| 11.6 | Configurable Pagination | 10/25/50/100 items per page on all tables |
| 11.7 | Toast Notifications | Success/error/info messages on all operations |
| 11.8 | Confirmation Dialogs | Required before all delete operations |
| 11.9 | Form Validation | Required fields, type checking, range validation with inline error messages |
| 11.10 | Loading States | Spinners and skeleton states during data fetching |
| 11.11 | Empty States | Helpful messages when no data exists |
| 11.12 | Error Handling | User-friendly error messages for all API failures |

---

## 12. UI/UX Design & Responsiveness

| # | Feature | Description |
|---|---------|-------------|
| 12.1 | Custom Dark Industrial Theme | "Tactical Factory" design with safety orange accent, dark zinc backgrounds |
| 12.2 | Custom Typography System | Barlow Condensed headings, IBM Plex Sans body, JetBrains Mono for data |
| 12.3 | Responsive Layout | Adapts to desktop, tablet, and mobile screens |
| 12.4 | Collapsible Sidebar | Desktop: toggle collapse with icon-only mode; Mobile: hamburger menu with overlay |
| 12.5 | Dynamic Navigation | Menu items loaded from database with role-based visibility |
| 12.6 | Profile Dropdown | User avatar, name, email, profile link, logout |
| 12.7 | Color-Coded Data | Green (available), Yellow (used/warning), Red (critical) across all tables |
| 12.8 | Badge System | Role badges, size badges, status badges throughout UI |
| 12.9 | Horizontal Scroll Tables | Tables scroll horizontally on small screens |
| 12.10 | Touch-Friendly Controls | All buttons and controls sized for mobile touch |

---

## 13. Backend & Infrastructure

| # | Feature | Description |
|---|---------|-------------|
| 13.1 | RESTful API (62 Endpoints) | Full REST API covering all business operations |
| 13.2 | JWT Authentication | Secure token-based authentication on all protected routes |
| 13.3 | Role-Based Authorization | Admin-only routes for sensitive operations |
| 13.4 | Input Validation | Server-side validation on all endpoints |
| 13.5 | Activity Logging System | Non-blocking async logging on all CRUD operations |
| 13.6 | Database Indexing (19 Indexes) | Optimized queries for production performance |
| 13.7 | CORS Configuration | Configurable cross-origin access |
| 13.8 | Auto-Generated Identifiers | 4 sequential numbering systems (RM, JOB, DSP, PO) |
| 13.9 | Keep-Alive Cron | 14-minute self-ping to prevent server spin-down |
| 13.10 | Monthly Backup Cron | Automated backup on 1st of every month |
| 13.11 | Data Seeding Script | One-command database population with 12 entries per collection |
| 13.12 | Environment Configuration | Secure environment variable management |

---

## 14. Deployment & Hosting

| # | Feature | Description |
|---|---------|-------------|
| 14.1 | Backend Deployment (Render) | Auto-deploy on git push, health check monitoring |
| 14.2 | Frontend Deployment (Netlify) | Production build with CDN distribution |
| 14.3 | MongoDB Atlas (Cloud Database) | Managed cloud database with auto-scaling |
| 14.4 | SSL/HTTPS | Secure connections on both frontend and backend |
| 14.5 | CI/CD Pipeline | Push-to-deploy workflow for backend |

---

## Project Summary

| Category | Count |
|----------|-------|
| Total Pages/Screens | 16 |
| Core CRUD Modules | 7 (Purchase, Printing, Production, Dispatch, POs, Brands, Sizes) |
| Read-Only Stock Views | 3 (Raw Material, Printing, Finished Goods) |
| Admin-Only Pages | 4 (Users, Menu Management, Activity Logs, Customers) |
| Dashboard Charts/Widgets | 5 (Stats cards, Production trend, Stock chart, Activity feed, PO summary) |
| API Endpoints | 62 |
| Database Collections | 12 |
| Database Indexes | 19 |
| Excel Import Entities | 8 |
| Excel Export Pages | 13+ (per-page + global) |
| Business Logic Systems | 8 (Cascading, Auto-matching, Sheet calc, PO sync, etc.) |
| Custom React Hooks | 6 |
| Reusable UI Components | 30+ |
| Cron Jobs | 2 (Keep-alive, Monthly backup) |
| Activity Log Action Types | 8 |

### Technology Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 19, Tailwind CSS 3, shadcn/ui, Recharts, Lucide Icons |
| Backend | Node.js, Express.js, Mongoose |
| Database | MongoDB Atlas |
| Authentication | JWT (JSON Web Tokens), bcrypt |
| Hosting | Render (Backend), Netlify (Frontend) |
| Excel | XLSX.js, file-saver |
| Scheduling | node-cron |

---

## Total Project Cost

| Description | Amount |
|-------------|--------|
| **Full-Stack Web Application Development** | |
| **Design, Development, Testing & Deployment** | |
| | |
| **Total Cost:** | **___________________** |

---

*This document represents the complete scope of features delivered for the TIMESTIN Manufacturing CRM system.*
