# TIMESTIN Manufacturing CRM - User Guide

A comprehensive guide for operating the TIMESTIN CRM panel. This document covers the full production pipeline, every module, calculations, and dashboard metrics.

---

## Table of Contents

1. [Business Overview](#1-business-overview)
2. [Production Pipeline Flow](#2-production-pipeline-flow)
3. [Module Details](#3-module-details)
   - [Purchase (Raw Materials)](#31-purchase-raw-materials)
   - [Printing / Coating](#32-printing--coating)
   - [Production](#33-production)
   - [Purchase Orders](#34-purchase-orders)
   - [Dispatch](#35-dispatch)
   - [Customers](#36-customers)
   - [Brands](#37-brands)
   - [Sizes](#38-sizes)
   - [Users (Admin)](#39-users-admin)
   - [Menu Management (Admin)](#310-menu-management-admin)
4. [Stock Summary Pages](#4-stock-summary-pages)
5. [Production Cascading Logic](#5-production-cascading-logic)
6. [PO-Dispatch Sync](#6-po-dispatch-sync)
7. [Pipeline Integrity Rules](#7-pipeline-integrity-rules)
8. [Dashboard Metrics](#8-dashboard-metrics)
9. [Excel Export](#9-excel-export)
10. [User Roles & Access Control](#10-user-roles--access-control)
11. [Admin Operations](#11-admin-operations)
12. [Quick Reference: Formulas](#12-quick-reference-formulas)

---

## 1. Business Overview

TIMESTIN CRM manages a **paint can manufacturing factory**. The factory:

- Purchases raw metal sheets (tin plates) from steel suppliers
- Prints/coats the sheets with brand artwork and protective coatings
- Produces finished paint cans by cutting and forming the printed sheets
- Dispatches orders to customers and distributors

**Key terminology:**
| Term | Meaning |
|------|---------|
| **Brand** | A paint product line (e.g., SYNCOAT, AUTOCOAT, SWAGAT) |
| **Size** | Container size (e.g., 4LTR/5KG, 1LTR, 500ML, 1KG) |
| **Gauge** | Thickness of the metal sheet (e.g., 0.18, 0.20, 0.22, 0.25 mm) |
| **Temper** | Grade of the tin plate (e.g., T3, T4, T5, DR8) |
| **Sheets** | Number of individual sheets derived from a raw material purchase |
| **Bodies** | Number of can bodies that can be printed from sheets |
| **Printing Stock** | Total units available after printing (bodies x sheets) |
| **Finished Goods** | Completed paint cans ready for dispatch |
| **LWBF** | Lacquer Wash Before Finish - a specific coating process for certain brands |

---

## 2. Production Pipeline Flow

The manufacturing process flows through 5 stages in order:

```
PURCHASE (Raw Materials)
    |
    v
PRINTING / COATING (Print brand artwork on sheets)
    |
    v
PRODUCTION (Cut & form printed sheets into cans)
    |    \
    |     --> Auto-creates BOTTOM, TOP, LID entries (same size)
    |     --> Auto-creates BOTTOM LWBF, LID LWBF (for LWBF brands only)
    |
    v
PURCHASE ORDERS (Customer orders with quantity tracking)
    |
    v
DISPATCH (Ship finished goods to customers, syncs with PO)
```

### How it works step by step:

1. **Purchase raw materials** - Buy metal sheets from steel suppliers. The system calculates how many sheets each purchase yields based on weight, gauge, and dimensions.

2. **Create printing jobs** - Select a raw material purchase and assign brand + size combinations with body counts. This consumes ALL available sheets from the selected purchase.

3. **Record production** - Log how many finished cans were produced. Select the brand and size, enter the quantity. Printing stock used is automatically set equal to quantity produced. **Important:** The system auto-creates entries for BOTTOM, TOP, and LID of the same size (and BOTTOM LWBF + LID LWBF for LWBF brands). See [Production Cascading Logic](#5-production-cascading-logic).

4. **Create purchase orders** - When customers place orders, create a PO with customer name, brand, size, and quantity. The system tracks how much has been dispatched against each PO.

5. **Dispatch goods** - Ship finished goods to customers. You can optionally link a dispatch to a PO. The PO's dispatched quantity is automatically updated. If no PO is explicitly selected, the system auto-matches by brand + size + customer.

---

## 3. Module Details

### 3.1 Purchase (Raw Materials)

**Purpose:** Track all raw material (metal sheet) purchases from suppliers.

**Fields:**
| Field | Description | Example |
|-------|-------------|---------|
| SR No | Auto-generated serial: RM-001, RM-002... | RM-001 |
| Gauge | Sheet thickness in mm | 0.20 |
| Size 1 | Sheet width in mm | 914 |
| Size 2 | Sheet length in mm | 1219 |
| Temper | Tin plate grade | T4 |
| Weight | Total weight in kg | 5500 |
| No. of Sheets | Auto-calculated from formula | 3146 |
| Sheets Used | Consumed by printing jobs | 3146 |
| Sheets Available | Remaining (auto-calculated) | 0 |
| Supplier | Vendor name | JSW Steel Ltd |
| Invoice Number | Supplier invoice reference | INV-2026-001 |
| Purchase Date | Date of purchase | 01 Mar 2026 |

**Key formula (auto-calculated on creation):**
```
No. of Sheets = Weight / (Gauge x Size1 x Size2 / 100000 x 0.785)
```

**Delete protection:** Cannot delete a purchase if printing jobs are linked to it. Delete the printing jobs first.

**Actions:** Create, Edit, Delete, Export to Excel

---

### 3.2 Printing / Coating

**Purpose:** Track printing and coating jobs that consume raw material sheets and produce printed stock.

**Fields:**
| Field | Description | Example |
|-------|-------------|---------|
| Job Number | Auto-generated: JOB-001, JOB-002... | JOB-001 |
| Raw Material | Linked purchase entry | RM-001 - 914x1219 (3146 sheets) |
| Sheets from Material | All available sheets consumed | 3146 |
| Sizes & Brands | Container size + brand + body count entries | 4LTR/5KG - SYNCOAT: 250 bodies |
| Total Bodies | Sum of all body counts | 450 |
| Job Date | Date of printing job | 03 Mar 2026 |

**How sheets are consumed:**
- When you create a printing job, you select a raw material purchase
- ALL remaining sheets from that purchase are consumed by the job
- Only materials with available sheets appear in the dropdown

**Printing stock calculation:**
```
Printing Stock = Bodies Count x Sheets from Material
```
For a job with 250 bodies using 3146 sheets: Printing Stock = 250 x 3146 = 786,500

**Multi-entry support:** A single printing job can have multiple size + brand entries. Add entries one by one using the form, then submit the complete job.

**Delete behavior:** Deleting a printing job restores the sheets back to the raw material (sheets_used is decremented).

**Actions:** Create, Edit (notes only), Delete, Export to Excel

---

### 3.3 Production

**Purpose:** Record finished goods production from printed stock.

**Fields:**
| Field | Description | Example |
|-------|-------------|---------|
| Date | Production date | 10 Mar 2026 |
| Size | Container size | 4LTR/5KG |
| Brand | Paint brand | SYNCOAT |
| Qty Produced | Finished cans produced | 400 |
| Printing Stock Used | Auto-set to qty produced | 400 |
| Notes | Optional notes | Regular batch |

**Important notes:**
- The brand dropdown **excludes** BOTTOM, TOP, LID, BOTTOM LWBF, and LID LWBF because these are auto-created by the cascading system. See [Production Cascading Logic](#5-production-cascading-logic).
- When you enter production for any regular brand, the system automatically creates matching entries for BOTTOM, TOP, and LID of the same size and quantity.
- Printing stock used is always set equal to quantity produced.
- The form shows available printing stock for the selected brand + size combination.

**Delete behavior:** Deleting a production entry also deletes all its auto-created cascade entries (BOTTOM/TOP/LID/LWBF).

**Update behavior:** Updating quantity, size, or date on a parent entry propagates the change to all cascade children.

**Actions:** Create, Edit, Delete, Export to Excel

---

### 3.4 Purchase Orders

**Purpose:** Track customer orders and their fulfillment progress.

**Fields:**
| Field | Description | Example |
|-------|-------------|---------|
| # | Row number (display only) | 1, 2, 3... |
| Serial No | Auto-generated: PO-YYYYMMDD-NNN | PO-20260315-001 |
| Date | Order date | 15 Mar 2026 |
| Customer | Customer / buyer name | Mehta Paints & Hardware |
| Brand | Ordered paint brand | SYNCOAT |
| Size | Ordered container size | 4LTR/5KG |
| Quantity | Number of units ordered | 500 |
| Dispatched | Quantity dispatched / Total quantity | 200 / 500 (with progress bar) |
| Notes | Optional notes | Urgent order |

**Dispatched column:** Shows a progress bar indicating how much of the order has been fulfilled. This is automatically synced when dispatches are created, updated, or deleted.

**Quantity protection:** Cannot reduce the PO quantity below the already-dispatched amount.

**Delete behavior:** Deleting a PO unlinks all dispatches that reference it (their PO link is set to none, but the dispatches themselves are preserved).

**Actions:** Create, Edit, Delete, Export to Excel

---

### 3.5 Dispatch

**Purpose:** Track shipments of finished goods to customers.

**Fields:**
| Field | Description | Example |
|-------|-------------|---------|
| # | Row number | 1, 2, 3... |
| Date | Dispatch date | 17 Mar 2026 |
| Order # | Auto-generated: DSP-001, DSP-002... | DSP-001 |
| Customer | Recipient name | Shah Industrial Supplies |
| Brand | Product brand | AUTOCOAT |
| Size | Product size | 1LTR |
| Quantity | Units being dispatched | 200 |
| PO | Linked purchase order serial no | PO-20260315-001 |
| Notes | Optional notes | - |

**PO Linking:**
- When creating a dispatch, you can optionally link it to a purchase order
- The PO dropdown is filtered by the selected brand and size
- Only POs with remaining capacity are shown (fully fulfilled POs are hidden)
- If no PO is explicitly selected, the system auto-matches by brand + size + customer
- The linked PO's dispatched quantity is automatically updated

**Over-dispatch protection:** If the dispatch quantity exceeds the PO's remaining quantity, the system rejects it with a specific error message.

**Actions:** Create, Edit, Delete, Export to Excel

---

### 3.6 Customers

**Purpose:** Manage the master list of customer/company names for POs and Dispatches.

**Fields:**
| Field | Description | Example |
|-------|-------------|---------|
| # | Row number | 1 |
| Name | Customer name (uppercase) | MEHTA PAINTS |
| Created | Date added | 29 Mar 2026 |

Customer names appear as searchable dropdowns in Purchase Orders (Company) and Dispatch (Customer) forms.

**Actions:** Create, Edit, Delete

---

### 3.7 Brands

**Purpose:** Manage the master list of paint brand names used across all modules.

**Fields:**
| Field | Description | Example |
|-------|-------------|---------|
| # | Row number | 1 |
| Name | Brand name (stored uppercase) | SYNCOAT |
| LWBF | Toggle for LWBF cascade | On / Off |
| Created | Date added | 29 Mar 2026 |

**LWBF Toggle:** When a brand has LWBF turned ON, creating production entries for that brand will also auto-create BOTTOM LWBF and LID LWBF entries (in addition to the standard BOTTOM/TOP/LID cascade). See [Production Cascading Logic](#5-production-cascading-logic).

**Currently LWBF-flagged brands:** LWBF, B/FILLER, COMM LWBF, COMM B/FILLER, 2KG LWBF, PRIDE PUTTY, PLAIN

**Actions:** Create, Edit, Delete, Toggle LWBF, Export to Excel

---

### 3.8 Sizes

**Purpose:** Manage the master list of container sizes used across all modules.

**Fields:**
| Field | Description | Example |
|-------|-------------|---------|
| # | Row number | 1 |
| Name | Size name (stored uppercase) | 4LTR/5KG |
| Created | Date added | 29 Mar 2026 |

**Actions:** Create, Edit, Delete, Export to Excel

---

### 3.9 Users (Admin)

**Purpose:** Manage system users and access control. Only visible to admin users.

**Fields:**
| Field | Description | Example |
|-------|-------------|---------|
| # | Row number | 1 |
| Username | Display name | Admin |
| Email | Login email | admin@crm.com |
| Role | Access level | admin / user |
| Created | Account creation date | 29 Mar 2026 |
| Locked | Account lock toggle | Yes / No |

**Roles:**
- **admin** - Full access including Users, Customers, Brands, Sizes, and Menu Management
- **user** - Access to operational modules (Dashboard, Purchases, Printing, Production, POs, Dispatch, and stock pages)

**Lock feature:** Admins can lock/unlock user accounts via the toggle switch. Locked accounts cannot log in.

**Clear Data button:** See [Admin Operations](#11-admin-operations).

**Actions:** Create, Edit, Delete, Lock/Unlock, Clear Data, Export to Excel

---

### 3.10 Menu Management (Admin)

**Purpose:** Configure the sidebar navigation items and their display order. Only visible to admin users.

**Features:**
- Add new menu items with label, path, icon, and admin-only flag
- Edit existing menu items
- Reorder items using up/down arrows, then click "Save Order"
- Delete non-system items (Dashboard, Menu Management, and Users are system-protected)
- Seed default menu items if the list is empty

**How it works:** The sidebar navigation is loaded dynamically from the database. If the menu items collection is empty or the API fails, the sidebar falls back to a hardcoded default list.

**Icons:** Choose from 20+ available icons (lucide-react icon set): LayoutDashboard, ShoppingCart, ClipboardList, Printer, Factory, Truck, Settings, Tag, Ruler, Package, Users, Layers, Menu, Boxes, Warehouse, BarChart3, FileText, CircleDollarSign, Wrench, Shield, Database.

---

## 4. Stock Summary Pages

Three read-only summary pages show aggregated stock levels:

### Raw Material Stock
Groups all purchases by sheet size (e.g., 914x1219) and shows:
- Total sheets, sheets used, sheets available, total weight per size group

### Printing Stock
Groups by brand + size and shows:
- Printing done (bodies x sheets from jobs)
- Used in production
- Available printing stock

### Finished Goods
Groups by brand + size and shows:
- Total produced (from production entries)
- Total dispatched
- Available stock (produced - dispatched)

All three pages have search, pagination, and serial number columns.

---

## 5. Production Cascading Logic

This is a key business feature. When production is recorded for a brand, the system automatically creates entries for can components.

### Standard Cascade (ALL brands)
When you create a production entry for **any brand except** BOTTOM, TOP, LID, BOTTOM LWBF, or LID LWBF:

The system auto-creates **3 additional entries** for the same size and quantity:
1. **BOTTOM** — can bottom component
2. **TOP** — can top component
3. **LID** — can lid component

### LWBF Cascade (LWBF brands only)
If the source brand has the **LWBF toggle ON** in the Brands page, the system creates **2 more entries** in addition to the standard 3:
4. **BOTTOM LWBF** — LWBF-coated bottom
5. **LID LWBF** — LWBF-coated lid

### Example
Creating production: **SYNCOAT**, **4LTR/5KG**, qty **500**

Auto-creates:
- BOTTOM, 4LTR/5KG, qty 500
- TOP, 4LTR/5KG, qty 500
- LID, 4LTR/5KG, qty 500

If SYNCOAT had LWBF=ON, also:
- BOTTOM LWBF, 4LTR/5KG, qty 500
- LID LWBF, 4LTR/5KG, qty 500

### Cascade Lifecycle
- **Delete:** Deleting the parent entry deletes all its cascade children
- **Update:** Changing quantity, size, or date on the parent updates all children
- **Notes:** Cascade entries are marked with "Auto-created from {brand} production"

### Managing LWBF Brands
Go to **Brands** page and toggle the **LWBF** switch ON/OFF for each brand. Currently flagged: LWBF, B/FILLER, COMM LWBF, COMM B/FILLER, 2KG LWBF, PRIDE PUTTY, PLAIN.

---

## 6. PO-Dispatch Sync

Purchase Orders and Dispatches are linked for quantity tracking:

### How it works
1. **Create dispatch** — If linked to a PO (manually or auto-matched), the PO's `dispatched` count increases
2. **Update dispatch** — Old PO sync is reversed, new PO sync is applied
3. **Delete dispatch** — The PO's dispatched count decreases
4. **Auto-matching** — If no PO is selected when creating a dispatch, the system finds the oldest PO with matching brand + size + customer that has remaining capacity

### Protections
- Cannot dispatch more than the PO's remaining quantity (shows error with specific amounts)
- Cannot reduce a PO's quantity below its already-dispatched amount
- Fully fulfilled POs are hidden from the dispatch form's PO dropdown
- Deleting a PO unlinks all its dispatches (dispatches are preserved, just unlinked)

### Visual indicator
The PO table shows a **progress bar** in the "Dispatched" column: e.g., `200 / 500` with a filled bar at 40%.

---

## 7. Pipeline Integrity Rules

The system enforces data integrity across the manufacturing pipeline:

| Action | What happens |
|--------|-------------|
| Delete a **raw material** | Blocked if printing jobs use it. Delete the jobs first. |
| Delete a **printing job** | Sheets are restored to the raw material (sheets_used decremented) |
| Delete a **production entry** | All cascade children (BOTTOM/TOP/LID/LWBF) are also deleted |
| Update a **production entry** | Quantity/size/date changes propagate to cascade children |
| Delete a **purchase order** | All referencing dispatches are unlinked (PO link set to none) |
| Delete a **dispatch** | The linked PO's dispatched quantity is decremented |

---

## 8. Dashboard Metrics

The dashboard displays real-time metrics across all modules:

### Summary Cards
| Card | Metric | Description |
|------|--------|-------------|
| Raw Material | Total Sheets | Sum of all sheets across purchases |
| Raw Material | Available Sheets | Sheets not yet used by printing jobs |
| Raw Material | Total Weight | Sum of all purchase weights (kg) |
| Printing | Total Printing Stock | Sum of bodies x sheets per job |
| Printing | Available Stock | Printing stock minus production usage |
| Finished Goods | Total Produced | Sum of all quantity_produced |
| Finished Goods | Available Stock | Produced minus dispatched |
| Dispatch | Total Dispatched | Sum of all dispatch quantities |
| Purchase Orders | Total | Count and total quantity of all POs |

### Charts
- **Production Trend** — Bar chart showing output over time (daily/weekly/monthly toggle)
- **Raw Material Stock** — Table grouped by sheet size
- **Printing Stock List** — Table by brand and size
- **Finished Goods List** — Table by brand and size
- **Recent Activity** — Last 10 entries across all modules
- **PO Summary** — Latest 5 purchase orders

### Trend Indicators
Each card shows a 30-day comparison:
- Green up arrow = increased vs previous 30 days
- Red down arrow = decreased
- Neutral = no change

---

## 9. Excel Export

Every data table has an **Export** button:
- Exports the **currently filtered** data (not all data)
- If search/date filters are active, only matching rows are exported
- If no data matches the current filter, export shows "No data to export"
- Files are named: `{ModuleName}_YYYY-MM-DD.xlsx`

**Modules with export:** Purchase Orders, Purchases, Printing Jobs, Production, Dispatch, Brands, Sizes, Users

---

## 10. User Roles & Access Control

### Authentication
- Users log in with email and password
- Sessions last 24 hours (JWT token)
- Locked accounts cannot log in

### Roles
| Feature | Admin | User |
|---------|-------|------|
| Dashboard | Yes | Yes |
| Raw Material / Printing / Finished Goods Stock | Yes | Yes |
| Purchase Orders | Yes | Yes |
| Purchase (Raw Materials) | Yes | Yes |
| Printing / Coating | Yes | Yes |
| Production | Yes | Yes |
| Dispatch | Yes | Yes |
| Customers | Yes | No |
| Brands | Yes | No |
| Sizes | Yes | No |
| Menu Management | Yes | No |
| User Management | Yes | No |
| Clear Data | Yes | No |

### Default Admin Account
- Email: `admin@crm.com`
- Password: `admin123`

---

## 11. Admin Operations

### Clear Operational Data
Located on the **Users (Admin)** page. The red **Clear Data** button permanently deletes:
- All purchases (raw materials)
- All printing/coating jobs
- All production records
- All dispatches
- All purchase orders

**Preserved (not deleted):**
- Brands
- Sizes
- Customers
- Users
- Menu items

A confirmation dialog is shown before clearing. The dialog lists exactly what will be deleted.

### Menu Management
See [Menu Management](#310-menu-management-admin).

---

## 12. Quick Reference: Formulas

| Formula | Calculation |
|---------|-------------|
| **No. of Sheets** | `Weight / (Gauge x Size1 x Size2 / 100000 x 0.785)` |
| **Printing Stock** | `Bodies Count x Sheets from Material` |
| **Available Printing Stock** | `Total Printing Done - Used in Production` |
| **Available Finished Goods** | `Total Produced - Total Dispatched` |
| **Available Raw Material** | `No. of Sheets - Sheets Used` |
| **PO Remaining** | `Quantity - Quantity Dispatched` |

### Example Calculation

**Raw material purchase:**
- Weight: 5,500 kg, Gauge: 0.20 mm, Size: 914 x 1219 mm

```
Divisor = (0.20 x 914 x 1219 / 100000) x 0.785
        = (222,694.8 / 100000) x 0.785
        = 2.2269 x 0.785
        = 1.7482

No. of Sheets = 5500 / 1.7482 = 3,146 sheets
```

**Printing job on those sheets:**
- Brand: SYNCOAT, Bodies: 250

```
Printing Stock = 250 x 3146 = 786,500 units
```

**Production from that stock:**
- Quantity produced: 400 cans (printing stock used = 400)

```
Available Printing Stock = 786,500 - 400 = 786,100 remaining
```

**Dispatch linked to a PO (qty 500):**
- Dispatch quantity: 200

```
PO Remaining = 500 - 200 = 300 remaining (shown as 200/500 on PO table)
```
