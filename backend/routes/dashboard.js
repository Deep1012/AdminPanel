const express = require("express");
const PrintingJob = require("../models/PrintingJob");
const Production = require("../models/Production");
const Dispatch = require("../models/Dispatch");
const Purchase = require("../models/Purchase");
const PurchaseOrder = require("../models/PurchaseOrder");
const { authenticate } = require("../middleware/auth");

const router = express.Router();

router.get("/stats", authenticate, async (req, res) => {
  try {
    const [purchases, printingJobs, production, dispatches, purchaseOrders] = await Promise.all([
      Purchase.find({}, { _id: 0, __v: 0 }).lean(),
      PrintingJob.find({}, { _id: 0, __v: 0 }).lean(),
      Production.find({}, { _id: 0, __v: 0 }).lean(),
      Dispatch.find({}, { _id: 0, __v: 0 }).lean(),
      PurchaseOrder.find({}, { _id: 0, __v: 0 }).lean(),
    ]);

    const total_sheets = purchases.reduce((sum, p) => sum + (p.no_of_sheets || 0), 0);
    const total_sheets_available = purchases.reduce((sum, p) => sum + ((p.no_of_sheets || 0) - (p.sheets_used || 0)), 0);
    const total_weight = purchases.reduce((sum, p) => sum + (p.weight || 0), 0);

    const total_jobs = printingJobs.length;
    let total_printing_stock = 0;
    for (const job of printingJobs) {
      total_printing_stock += (job.total_bodies || 0) * (job.sheets_from_material || 0);
    }
    const total_printing_used = production.reduce((sum, p) => sum + (p.printing_stock_used || 0), 0);

    const total_finished_goods = production.reduce((sum, p) => sum + (p.quantity_produced || 0), 0);
    const total_dispatched = dispatches.reduce((sum, d) => sum + (d.quantity || 0), 0);

    const po_total_quantity = purchaseOrders.reduce((sum, po) => sum + (po.quantity || 0), 0);

    // Compute trends (last 30 days vs previous 30 days)
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 86400000);
    const sixtyDaysAgo = new Date(now.getTime() - 60 * 86400000);

    const inRange = (dateStr, start, end) => {
      if (!dateStr) return false;
      const d = new Date(dateStr);
      return !isNaN(d.getTime()) && d >= start && d < end;
    };

    const trends = {
      purchases: {
        current: purchases.filter(p => inRange(p.purchase_date, thirtyDaysAgo, now)).length,
        previous: purchases.filter(p => inRange(p.purchase_date, sixtyDaysAgo, thirtyDaysAgo)).length,
      },
      printing: {
        current: printingJobs.filter(j => inRange(j.job_date, thirtyDaysAgo, now)).length,
        previous: printingJobs.filter(j => inRange(j.job_date, sixtyDaysAgo, thirtyDaysAgo)).length,
      },
      production: {
        current: production.filter(p => inRange(p.production_date, thirtyDaysAgo, now)).reduce((s, p) => s + (p.quantity_produced || 0), 0),
        previous: production.filter(p => inRange(p.production_date, sixtyDaysAgo, thirtyDaysAgo)).reduce((s, p) => s + (p.quantity_produced || 0), 0),
      },
      dispatch: {
        current: dispatches.filter(d => inRange(d.dispatch_date, thirtyDaysAgo, now)).length,
        previous: dispatches.filter(d => inRange(d.dispatch_date, sixtyDaysAgo, thirtyDaysAgo)).length,
      },
      purchase_orders: {
        current: purchaseOrders.filter(po => inRange(po.date, thirtyDaysAgo, now)).length,
        previous: purchaseOrders.filter(po => inRange(po.date, sixtyDaysAgo, thirtyDaysAgo)).length,
      },
    };

    res.json({
      purchase: { total_sheets, total_sheets_available, total_weight, total_items: purchases.length },
      printing_coating: { total_printing_stock, printing_stock_available: total_printing_stock - total_printing_used, total_jobs },
      finished_goods: { total_produced: total_finished_goods, available_stock: total_finished_goods - total_dispatched },
      dispatch: { total_dispatched, total_items: dispatches.length },
      purchase_orders: { total: purchaseOrders.length, total_quantity: po_total_quantity },
      trends,
    });
  } catch (error) {
    res.status(500).json({ detail: error.message });
  }
});

router.get("/purchase-stock", authenticate, async (req, res) => {
  try {
    const purchases = await Purchase.find({}, { _id: 0, __v: 0 }).lean();
    const stockMap = {};
    for (const p of purchases) {
      const sizeKey = `${p.size1}x${p.size2}`;
      if (!stockMap[sizeKey]) {
        stockMap[sizeKey] = { size: sizeKey, gauge: p.gauge || 0, total_sheets: 0, sheets_used: 0, sheets_available: 0, total_weight: 0 };
      }
      stockMap[sizeKey].total_sheets += p.no_of_sheets || 0;
      stockMap[sizeKey].sheets_used += p.sheets_used || 0;
      stockMap[sizeKey].sheets_available += (p.no_of_sheets || 0) - (p.sheets_used || 0);
      stockMap[sizeKey].total_weight += p.weight || 0;
    }
    res.json(Object.values(stockMap));
  } catch (error) {
    res.status(500).json({ detail: error.message });
  }
});

// Production trend - supports ?period=daily|weekly|monthly
router.get("/production-trend", authenticate, async (req, res) => {
  try {
    const period = req.query.period || "monthly";
    const production = await Production.find({}, { production_date: 1, quantity_produced: 1, _id: 0 }).lean();
    const now = new Date();
    const buckets = {};

    if (period === "daily") {
      for (let i = 29; i >= 0; i--) {
        const d = new Date(now.getTime() - i * 86400000);
        const key = d.toISOString().split("T")[0];
        const label = d.toLocaleDateString("en-US", { day: "numeric", month: "short" });
        buckets[key] = { month: key, label, total: 0 };
      }
      for (const p of production) {
        if (!p.production_date) continue;
        const key = new Date(p.production_date).toISOString().split("T")[0];
        if (buckets[key]) buckets[key].total += p.quantity_produced || 0;
      }
    } else if (period === "weekly") {
      for (let i = 11; i >= 0; i--) {
        const weekStart = new Date(now.getTime() - i * 7 * 86400000);
        const key = weekStart.toISOString().split("T")[0];
        const label = `W${12 - i} ${weekStart.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`;
        buckets[key] = { month: key, label, total: 0, start: weekStart.getTime(), end: weekStart.getTime() + 7 * 86400000 };
      }
      for (const p of production) {
        if (!p.production_date) continue;
        const t = new Date(p.production_date).getTime();
        for (const b of Object.values(buckets)) {
          if (t >= b.start && t < b.end) {
            b.total += p.quantity_produced || 0;
            break;
          }
        }
      }
      for (const b of Object.values(buckets)) { delete b.start; delete b.end; }
    } else {
      for (let i = 5; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
        const label = d.toLocaleDateString("en-US", { month: "short", year: "numeric" });
        buckets[key] = { month: key, label, total: 0 };
      }
      for (const p of production) {
        if (!p.production_date) continue;
        const d = new Date(p.production_date);
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
        if (buckets[key]) buckets[key].total += p.quantity_produced || 0;
      }
    }

    res.json(Object.values(buckets));
  } catch (error) {
    res.status(500).json({ detail: error.message });
  }
});

// Recent activity - last 10 entries across all modules
router.get("/recent-activity", authenticate, async (req, res) => {
  try {
    const [purchases, jobs, production, dispatches, orders] = await Promise.all([
      Purchase.find({}, { id: 1, sr_no: 1, purchase_date: 1, _id: 0 }).sort({ purchase_date: -1 }).limit(5).lean(),
      PrintingJob.find({}, { id: 1, job_number: 1, job_date: 1, _id: 0 }).sort({ job_date: -1 }).limit(5).lean(),
      Production.find({}, { id: 1, brand_name: 1, size_name: 1, production_date: 1, _id: 0 }).sort({ production_date: -1 }).limit(5).lean(),
      Dispatch.find({}, { id: 1, order_number: 1, dispatch_date: 1, _id: 0 }).sort({ dispatch_date: -1 }).limit(5).lean(),
      PurchaseOrder.find({}, { id: 1, serial_no: 1, date: 1, company_name: 1, _id: 0 }).sort({ date: -1 }).limit(5).lean(),
    ]);

    const activity = [
      ...purchases.map(p => ({ type: "purchase", identifier: p.sr_no, date: p.purchase_date })),
      ...jobs.map(j => ({ type: "printing", identifier: j.job_number, date: j.job_date })),
      ...production.map(p => ({ type: "production", identifier: `${p.brand_name} ${p.size_name}`, date: p.production_date })),
      ...dispatches.map(d => ({ type: "dispatch", identifier: d.order_number, date: d.dispatch_date })),
      ...orders.map(o => ({ type: "purchase_order", identifier: `${o.serial_no} - ${o.company_name}`, date: o.date })),
    ];

    activity.sort((a, b) => new Date(b.date) - new Date(a.date));
    res.json(activity.slice(0, 10));
  } catch (error) {
    res.status(500).json({ detail: error.message });
  }
});

// PO summary for dashboard
router.get("/po-summary", authenticate, async (req, res) => {
  try {
    const allOrders = await PurchaseOrder.find(
      {},
      { _id: 0, __v: 0 }
    ).sort({ date: -1 }).lean();

    res.json({
      total_count: allOrders.length,
      latest: allOrders.slice(0, 5),
    });
  } catch (error) {
    res.status(500).json({ detail: error.message });
  }
});

// Keep legacy endpoints
router.get("/printing-stock-list", authenticate, async (req, res) => {
  try {
    const jobs = await PrintingJob.find({}, { _id: 0, __v: 0 }).lean();
    const production = await Production.find({}, { _id: 0, __v: 0 }).lean();
    const stockMap = {};
    for (const job of jobs) {
      const sheets = job.sheets_from_material || 0;
      for (const sizeEntry of (job.sizes || [])) {
        const sizeName = sizeEntry.size_name || "Unknown";
        for (const brand of (sizeEntry.brands || [])) {
          const key = `${sizeName}_${brand.brand_name}`;
          if (!stockMap[key]) stockMap[key] = { size_name: sizeName, brand_name: brand.brand_name, printing_done: 0, used_in_production: 0, available: 0 };
          stockMap[key].printing_done += (brand.bodies_count || 0) * sheets;
        }
      }
    }
    for (const p of production) {
      const key = `${p.size_name || ""}_${p.brand_name || ""}`;
      if (stockMap[key]) stockMap[key].used_in_production += p.printing_stock_used || 0;
    }
    for (const key of Object.keys(stockMap)) stockMap[key].available = stockMap[key].printing_done - stockMap[key].used_in_production;
    res.json(Object.values(stockMap));
  } catch (error) {
    res.status(500).json({ detail: error.message });
  }
});

router.get("/finished-goods-list", authenticate, async (req, res) => {
  try {
    const production = await Production.find({}, { _id: 0, __v: 0 }).lean();
    const dispatches = await Dispatch.find({}, { _id: 0, __v: 0 }).lean();
    const stockMap = {};
    for (const p of production) {
      const key = `${p.size_name || ""}_${p.brand_name || ""}`;
      if (!stockMap[key]) stockMap[key] = { size_name: p.size_name || "", brand_name: p.brand_name || "", produced: 0, dispatched: 0, available: 0 };
      stockMap[key].produced += p.quantity_produced || 0;
    }
    for (const d of dispatches) {
      const key = `${d.size_name || ""}_${d.brand_name || ""}`;
      if (stockMap[key]) stockMap[key].dispatched += d.quantity || 0;
    }
    for (const key of Object.keys(stockMap)) stockMap[key].available = stockMap[key].produced - stockMap[key].dispatched;
    res.json(Object.values(stockMap));
  } catch (error) {
    res.status(500).json({ detail: error.message });
  }
});

module.exports = router;
