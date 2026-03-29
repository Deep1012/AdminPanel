# TIMESTIN Manufacturing CRM - User Guide

A comprehensive guide for operating the TIMESTIN CRM panel. This document covers the full production pipeline, every module, calculations, status flows, and dashboard metrics.

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
   - [Brands](#36-brands)
   - [Sizes](#37-sizes)
   - [Users (Admin)](#38-users-admin)
4. [Stock Tracking & Calculations](#4-stock-tracking--calculations)
5. [Dashboard Metrics](#5-dashboard-metrics)
6. [Status Flows](#6-status-flows)
7. [Excel Export](#7-excel-export)
8. [User Roles & Access Control](#8-user-roles--access-control)
9. [Quick Reference: Formulas](#9-quick-reference-formulas)

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
    |
    v
PURCHASE ORDERS (Customer orders tracked through statuses)
    |
    v
DISPATCH (Ship finished goods to customers)
```

### How it works step by step:

1. **Purchase raw materials** - Buy metal sheets from steel suppliers. The system calculates how many sheets each purchase yields based on weight, gauge, and dimensions.

2. **Create printing jobs** - Select a raw material purchase and assign brand + size combinations. This consumes sheets from the purchase (sheets_used increases, sheets_available decreases).

3. **Record production** - Log how many finished cans were produced from the printed stock. Specify the brand, size, quantity produced, and how much printing stock was consumed.

4. **Receive purchase orders** - When customers place orders, create a PO with company name, brand, size, and quantity. Track it through the status pipeline.

5. **Dispatch goods** - Ship finished goods to customers. Dispatches can be created manually OR auto-created when a PO status changes to "dispatched".

---

## 3. Module Details

### 3.1 Purchase (Raw Materials)

**Purpose:** Track all raw material (metal sheet) purchases from suppliers.

**Fields:**
| Field | Description | Example |
|-------|-------------|---------|
| SR No | Serial/reference number | RM-001 |
| Gauge | Sheet thickness in mm | 0.20 |
| Size 1 | Sheet width in mm | 914 |
| Size 2 | Sheet length in mm | 1219 |
| Temper | Tin plate grade | T4 |
| Weight | Total weight in kg | 5500 |
| No. of Sheets | Auto-calculated from formula | 3942 |
| Sheets Used | Consumed by printing jobs | 3942 |
| Sheets Available | Remaining (No. of Sheets - Sheets Used) | 0 |
| Supplier | Vendor name | JSW Steel Ltd |
| Invoice Number | Supplier invoice reference | INV-2026-001 |
| Purchase Date | Date of purchase | 01 Mar 2026 |

**Key formula (auto-calculated on creation):**
```
No. of Sheets = Weight / (Gauge x Size1 x Size2 / 100000 x 0.785)
```

**Actions:** Create, Edit, Delete, Export to Excel

---

### 3.2 Printing / Coating

**Purpose:** Track printing and coating jobs that consume raw material sheets and produce printed stock.

**Fields:**
| Field | Description | Example |
|-------|-------------|---------|
| Job Number | Auto-generated job reference | JOB-001 |
| Raw Material | Linked purchase entry | RM-001 - 914x1219 (3942 sheets) |
| Sheets from Material | Number of sheets consumed | 3942 |
| Sizes | Container sizes being printed | 4LTR/5KG |
| Brands | Brand(s) and body counts per size | SYNCOAT: 250, AUTOCOAT: 200 |
| Total Bodies | Sum of all body counts | 450 |
| Status | Job progress | pending / in_progress / completed |
| Job Date | Date of printing job | 03 Mar 2026 |

**How sheets are consumed:**
- When you create a printing job, you select a raw material purchase
- The job's `sheets_from_material` value is deducted from the purchase's `sheets_available`
- The purchase's `sheets_used` increases by the same amount

**Printing stock calculation:**
```
Printing Stock = Bodies Count x Sheets from Material
```
For a job with 250 bodies using 3942 sheets: Printing Stock = 250 x 3942 = 985,500

**Status flow:**
```
pending --> in_progress --> completed
```

**Actions:** Create, Edit, Delete, Update Status, Export to Excel

---

### 3.3 Production

**Purpose:** Record finished goods production from printed stock.

**Fields:**
| Field | Description | Example |
|-------|-------------|---------|
| Brand | Paint brand being produced | SYNCOAT |
| Size | Container size | 4LTR/5KG |
| Quantity Produced | Finished cans produced | 400 |
| Printing Stock Used | Amount of printing stock consumed | 480 |
| Notes | Optional notes | Regular batch |
| Production Date | Date of production run | 10 Mar 2026 |

**Stock relationship:**
- Production consumes printing stock (from completed printing jobs)
- The `printing_stock_used` field tracks how much of the available printing stock was consumed
- `Available Printing Stock = Total Printing Done - Used in Production`

**Actions:** Create, Edit, Delete, Export to Excel

---

### 3.4 Purchase Orders

**Purpose:** Track customer orders through the complete fulfillment pipeline.

**Fields:**
| Field | Description | Example |
|-------|-------------|---------|
| # | Sequential row number (display only) | 1, 2, 3... |
| Serial No | Auto-generated: PO-YYYYMMDD-NNN | PO-20260315-001 |
| Date | Order date | 15 Mar 2026 |
| Company Name | Customer / buyer | Mehta Paints & Hardware |
| Brand | Ordered paint brand | SYNCOAT |
| Size | Ordered container size | 4LTR/5KG |
| Quantity | Number of units ordered | 500 |
| Status | Order fulfillment stage | received |
| Dispatch | Linked dispatch entry (if dispatched) | DSP-PO-20260315-001 |
| Notes | Optional notes | Urgent order |

**Status flow (6 stages):**
```
received --> confirmed --> in_production --> ready --> dispatched --> delivered
```

**Auto-dispatch feature:**
When a PO's status is changed to **"dispatched"**, the system automatically:
1. Creates a new Dispatch entry with the PO's details
2. Links the dispatch to the PO via `dispatch_id`
3. Sets the dispatch order number to `DSP-{PO serial_no}`

**Actions:** Create, Edit, Delete, Update Status, Export to Excel

---

### 3.5 Dispatch

**Purpose:** Track shipments of finished goods to customers.

**Fields:**
| Field | Description | Example |
|-------|-------------|---------|
| Order Number | Dispatch reference | ORD-2026-005 |
| Customer Name | Recipient | Shah Industrial Supplies |
| Brand | Product brand | AUTOCOAT |
| Size | Product size | 1LTR |
| Quantity | Units being dispatched | 200 |
| Status | Shipment progress | pending / dispatched / delivered |
| Delivery Address | Ship-to address (optional) | Gujarat Industrial Area |
| Dispatch Date | Date of dispatch | 17 Mar 2026 |
| Notes | Optional notes | Auto-created from PO PO-20260317-003 |

**Two ways dispatches are created:**
1. **Manual** - User creates a dispatch entry directly
2. **Auto-created** - System creates when a PO status changes to "dispatched"

**Status flow:**
```
pending --> dispatched --> delivered
```

**Actions:** Create, Edit, Delete, Update Status, Export to Excel

---

### 3.6 Brands

**Purpose:** Manage the master list of paint brand names used across all modules.

**Fields:**
| Field | Description | Example |
|-------|-------------|---------|
| Name | Brand name (stored uppercase) | SYNCOAT |
| Created | Date added | 29 Mar 2026 |

Brands appear in dropdowns throughout the system (Printing Jobs, Production, Purchase Orders, Dispatch).

**Actions:** Create, Edit, Delete, Export to Excel

---

### 3.7 Sizes

**Purpose:** Manage the master list of container sizes used across all modules.

**Fields:**
| Field | Description | Example |
|-------|-------------|---------|
| Name | Size name (stored uppercase) | 4LTR/5KG |
| Created | Date added | 29 Mar 2026 |

Sizes appear in dropdowns throughout the system (Printing Jobs, Production, Purchase Orders, Dispatch).

**Actions:** Create, Edit, Delete, Export to Excel

---

### 3.8 Users (Admin)

**Purpose:** Manage system users and access control. Only visible to admin users.

**Fields:**
| Field | Description | Example |
|-------|-------------|---------|
| Username | Display name | Admin |
| Email | Login email | admin@crm.com |
| Password | Login password (visible on create) | admin123 |
| Role | Access level | admin / user |
| Locked | Account lock status | Yes / No |
| Created | Account creation date | 29 Mar 2026 |

**Roles:**
- **admin** - Full access to all modules including User Management
- **user** - Access to all modules except User Management

**Lock feature:** Admins can lock/unlock user accounts. Locked accounts cannot log in.

**Actions:** Create, Edit, Delete, Lock/Unlock, Export to Excel

---

## 4. Stock Tracking & Calculations

The system tracks stock at three levels:

### Level 1: Raw Material Stock (Purchase)
```
Sheets Available = No. of Sheets - Sheets Used
```
- Increases when new purchases are added
- Decreases when printing jobs consume sheets

### Level 2: Printing Stock
```
Printing Stock (per brand/size) = Bodies Count x Sheets from Material
Available Printing Stock = Total Printing Done - Used in Production
```
- Increases when printing jobs are completed
- Decreases when production entries consume printing stock

### Level 3: Finished Goods Stock
```
Available Finished Goods = Total Produced - Total Dispatched
```
- Increases when production entries are added
- Decreases when dispatches are made (status = dispatched or delivered)

### Stock Flow Diagram
```
Raw Material (sheets)
    |  [consumed by printing jobs]
    v
Printing Stock (bodies x sheets)
    |  [consumed by production]
    v
Finished Goods (cans produced)
    |  [reduced by dispatch]
    v
Dispatched to Customer
```

---

## 5. Dashboard Metrics

The dashboard displays real-time metrics across all modules:

### Summary Cards
| Card | Metric | Description |
|------|--------|-------------|
| Raw Material | Total Sheets | Sum of all `no_of_sheets` across purchases |
| Raw Material | Available Sheets | Sum of `no_of_sheets - sheets_used` |
| Raw Material | Total Weight | Sum of all purchase weights (kg) |
| Printing | Total Printing Stock | Sum of `total_bodies x sheets_from_material` per job |
| Printing | Available Stock | Printing stock minus production usage |
| Printing | Pending Jobs | Count of jobs with status "pending" |
| Printing | Completed Jobs | Count of jobs with status "completed" |
| Finished Goods | Total Produced | Sum of all `quantity_produced` |
| Finished Goods | Available Stock | Produced minus dispatched quantities |
| Dispatch | Total Dispatched | Sum of quantities where status is dispatched/delivered |
| Dispatch | Pending Orders | Count of dispatches with status "pending" |
| Purchase Orders | Total | Count of all POs |
| Purchase Orders | Pending | Count of POs with status received/confirmed |
| Purchase Orders | In Production | Count of POs with status in_production |
| Purchase Orders | Ready | Count of POs with status ready |

### Charts
- **Production Trend** - Bar/line chart showing production output over time (daily/weekly/monthly toggle)
- **Dispatch Distribution** - Pie chart showing dispatch status breakdown (pending/dispatched/delivered)
- **Purchase Stock** - Table showing raw material stock grouped by sheet size
- **Printing Stock List** - Table showing printing stock by brand and size
- **Finished Goods List** - Table showing finished goods inventory by brand and size
- **Recent Activity** - Timeline of last 10 entries across all modules
- **PO Summary** - Latest 5 pending purchase orders

### Trend Indicators
Each dashboard card shows a trend arrow comparing the last 30 days vs. the previous 30 days:
- Green up arrow = improvement
- Red down arrow = decline
- Neutral = no change

---

## 6. Status Flows

### Purchase Order Status Flow
```
RECEIVED        Customer order logged into the system
    |
CONFIRMED       Order verified and accepted
    |
IN_PRODUCTION   Manufacturing has started for this order
    |
READY           Goods are produced and ready to ship
    |
DISPATCHED      Goods shipped (auto-creates dispatch entry)
    |
DELIVERED       Customer has received the goods
```

### Printing Job Status Flow
```
PENDING         Job created, waiting to start
    |
IN_PROGRESS     Printing/coating underway
    |
COMPLETED       Printing finished, stock available for production
```

### Dispatch Status Flow
```
PENDING         Dispatch planned, not yet shipped
    |
DISPATCHED      Goods in transit
    |
DELIVERED       Customer received the shipment
```

---

## 7. Excel Export

Every data table in the system can be exported to an Excel (.xlsx) file:

- Click the **Export** button on any module page
- The export includes all currently filtered/visible data
- If a search filter is active, only filtered results are exported
- If no filter is active, all records are exported
- Files are named: `{ModuleName}_YYYY-MM-DD.xlsx`

**Exported modules:** Purchase Orders, Purchases, Printing Jobs, Production, Dispatch, Brands, Sizes, Users

---

## 8. User Roles & Access Control

### Authentication
- Users log in with email and password
- Sessions last 24 hours (JWT token)
- After 24 hours, users must log in again

### Roles
| Feature | Admin | User |
|---------|-------|------|
| View Dashboard | Yes | Yes |
| Purchase Orders | Yes | Yes |
| Purchase (Raw Materials) | Yes | Yes |
| Printing / Coating | Yes | Yes |
| Production | Yes | Yes |
| Dispatch | Yes | Yes |
| Brands | Yes | Yes |
| Sizes | Yes | Yes |
| User Management | Yes | No |
| Create/Edit/Delete Users | Yes | No |
| Lock/Unlock Users | Yes | No |

### Default Admin Account
- Email: `admin@crm.com`
- Password: `admin123`
- Created automatically during initial seed

---

## 9. Quick Reference: Formulas

| Formula | Calculation |
|---------|-------------|
| **No. of Sheets** | `Weight / (Gauge x Size1 x Size2 / 100000 x 0.785)` |
| **Printing Stock** | `Bodies Count x Sheets from Material` |
| **Available Printing Stock** | `Total Printing Done - Used in Production` |
| **Available Finished Goods** | `Total Produced - Total Dispatched` |
| **Available Raw Material** | `No. of Sheets - Sheets Used` |

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
- Printing stock used: 480
- Quantity produced: 400 cans

```
Available Printing Stock = 786,500 - 480 = 786,020 remaining
Finished Goods Available = 400 - (dispatched quantity)
```

---

## Support

For technical support or issues with the CRM panel, contact your system administrator.
