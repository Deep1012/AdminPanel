const express = require("express");
const PrintingJob = require("../models/PrintingJob");
const Production = require("../models/Production");
const Dispatch = require("../models/Dispatch");
const Purchase = require("../models/Purchase");
const { authenticate } = require("../middleware/auth");

const router = express.Router();

router.get("/stats", authenticate, async (req, res) => {
  try {
    const printingJobs = await PrintingJob.find({}, { _id: 0, __v: 0 });
    const pending_jobs = printingJobs.filter((j) => j.status === "pending").length;
    const completed_jobs = printingJobs.filter((j) => j.status === "completed").length;

    let total_printing_stock = 0;
    for (const job of printingJobs) {
      const sheets = job.sheets_from_material || 0;
      const total_bodies = job.total_bodies || 0;
      total_printing_stock += total_bodies * sheets;
    }

    const production = await Production.find({}, { _id: 0, __v: 0 });
    const total_finished_goods = production.reduce((sum, p) => sum + (p.quantity_produced || 0), 0);
    const total_printing_used = production.reduce((sum, p) => sum + (p.printing_stock_used || 0), 0);

    const dispatches = await Dispatch.find({}, { _id: 0, __v: 0 });
    const total_dispatched = dispatches
      .filter((d) => ["dispatched", "delivered"].includes(d.status))
      .reduce((sum, d) => sum + (d.quantity || 0), 0);
    const pending_orders = dispatches.filter((d) => d.status === "pending").length;

    const purchases = await Purchase.find({}, { _id: 0, __v: 0 });
    const total_sheets = purchases.reduce((sum, p) => sum + (p.no_of_sheets || 0), 0);
    const total_sheets_available = purchases.reduce(
      (sum, p) => sum + ((p.no_of_sheets || 0) - (p.sheets_used || 0)),
      0
    );
    const total_weight = purchases.reduce((sum, p) => sum + (p.weight || 0), 0);

    res.json({
      printing_coating: {
        total_printing_stock,
        printing_stock_available: total_printing_stock - total_printing_used,
        pending_jobs,
        completed_jobs,
      },
      finished_goods: {
        total_produced: total_finished_goods,
        available_stock: total_finished_goods - total_dispatched,
      },
      dispatch: {
        total_dispatched,
        pending_orders,
      },
      purchase: {
        total_sheets,
        total_sheets_available,
        total_weight,
        total_items: purchases.length,
      },
    });
  } catch (error) {
    res.status(500).json({ detail: error.message });
  }
});

router.get("/purchase-stock", authenticate, async (req, res) => {
  try {
    const purchases = await Purchase.find({}, { _id: 0, __v: 0 });
    const stockMap = {};

    for (const p of purchases) {
      const sizeKey = `${p.size1}x${p.size2}`;
      if (!stockMap[sizeKey]) {
        stockMap[sizeKey] = {
          size: sizeKey,
          gauge: p.gauge || 0,
          total_sheets: 0,
          sheets_used: 0,
          sheets_available: 0,
          total_weight: 0,
        };
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

router.get("/printing-stock-list", authenticate, async (req, res) => {
  try {
    const jobs = await PrintingJob.find({}, { _id: 0, __v: 0 });
    const production = await Production.find({}, { _id: 0, __v: 0 });

    const stockMap = {};
    for (const job of jobs) {
      const sheets = job.sheets_from_material || 0;
      const sizes = job.sizes || [];

      for (const sizeEntry of sizes) {
        const sizeName = sizeEntry.size_name || "Unknown";
        for (const brand of sizeEntry.brands || []) {
          const key = `${sizeName}_${brand.brand_name}`;
          if (!stockMap[key]) {
            stockMap[key] = {
              size_name: sizeName,
              brand_name: brand.brand_name,
              printing_done: 0,
              used_in_production: 0,
              available: 0,
            };
          }
          stockMap[key].printing_done += (brand.bodies_count || 0) * sheets;
        }
      }
    }

    for (const p of production) {
      const key = `${p.size_name || ""}_${p.brand_name || ""}`;
      if (stockMap[key]) {
        stockMap[key].used_in_production += p.printing_stock_used || 0;
      }
    }

    for (const key of Object.keys(stockMap)) {
      stockMap[key].available = stockMap[key].printing_done - stockMap[key].used_in_production;
    }

    res.json(Object.values(stockMap));
  } catch (error) {
    res.status(500).json({ detail: error.message });
  }
});

router.get("/finished-goods-list", authenticate, async (req, res) => {
  try {
    const production = await Production.find({}, { _id: 0, __v: 0 });
    const dispatches = await Dispatch.find({}, { _id: 0, __v: 0 });

    const stockMap = {};

    for (const p of production) {
      const key = `${p.size_name || ""}_${p.brand_name || ""}`;
      if (!stockMap[key]) {
        stockMap[key] = {
          size_name: p.size_name || "",
          brand_name: p.brand_name || "",
          produced: 0,
          dispatched: 0,
          available: 0,
        };
      }
      stockMap[key].produced += p.quantity_produced || 0;
    }

    for (const d of dispatches) {
      if (["dispatched", "delivered"].includes(d.status)) {
        const key = `${d.size_name || ""}_${d.brand_name || ""}`;
        if (stockMap[key]) {
          stockMap[key].dispatched += d.quantity || 0;
        }
      }
    }

    for (const key of Object.keys(stockMap)) {
      stockMap[key].available = stockMap[key].produced - stockMap[key].dispatched;
    }

    res.json(Object.values(stockMap));
  } catch (error) {
    res.status(500).json({ detail: error.message });
  }
});

module.exports = router;
