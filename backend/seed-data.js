/**
 * TIMESTIN CRM - Data Seed Script
 *
 * Clears operational collections (purchases, printingjobs, productions,
 * dispatches, purchaseorders) and inserts 12 internally-consistent
 * entries in each. Brands, sizes, and users are left untouched.
 *
 * Usage:  cd backend && node seed-data.js
 */

require("dotenv").config();
const mongoose = require("mongoose");
const { v4: uuidv4 } = require("uuid");

const Purchase = require("./models/Purchase");
const PrintingJob = require("./models/PrintingJob");
const Production = require("./models/Production");
const Dispatch = require("./models/Dispatch");
const PurchaseOrder = require("./models/PurchaseOrder");
const Brand = require("./models/Brand");
const Size = require("./models/Size");
const User = require("./models/User");

// ── helpers ────────────────────────────────────────────────────────
function calcSheets(gauge, size1, size2, weight) {
  const div = (gauge * size1 * size2 / 100000) * 0.785;
  return div > 0 ? Math.floor(weight / div) : 0;
}

function iso(dateStr) {
  return new Date(dateStr).toISOString();
}

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

// ── main ───────────────────────────────────────────────────────────
async function seed() {
  await mongoose.connect(process.env.MONGO_URL);
  console.log("Connected to MongoDB");

  // Load existing reference data
  const brands = await Brand.find({}, { _id: 0, __v: 0 }).lean();
  const sizes = await Size.find({}, { _id: 0, __v: 0 }).lean();
  const users = await User.find({}, { _id: 0, __v: 0 }).lean();

  if (brands.length < 6) { console.error("Need at least 6 brands. Run the app first."); process.exit(1); }
  if (sizes.length < 4) { console.error("Need at least 4 sizes. Run the app first."); process.exit(1); }
  if (users.length < 1) { console.error("Need at least 1 user. Register an admin first."); process.exit(1); }

  const adminUser = users.find(u => u.role === "admin") || users[0];
  const createdBy = adminUser.username;

  // Pick 8 specific brands for consistency
  const brandNames = ["SYNCOAT", "AUTOCOAT", "SANDING SEALER", "SUPERSET", "SWAGAT", "A.O.P", "CELLOCOAT", "SUPER EPOXY"];
  const usedBrands = brandNames.map(name => brands.find(b => b.name === name)).filter(Boolean);
  if (usedBrands.length < 6) {
    console.error("Could not find required brands in DB. Ensure brands are seeded first.");
    process.exit(1);
  }

  // Pick sizes
  const sizeMap = {};
  for (const s of sizes) sizeMap[s.name] = s;
  const s4L = sizeMap["4LTR/5KG"];
  const s1L = sizeMap["1LTR"];
  const s500 = sizeMap["500ML"];
  const s1K = sizeMap["1KG"];

  if (!s4L || !s1L || !s500 || !s1K) {
    console.error("Missing expected sizes (4LTR/5KG, 1LTR, 500ML, 1KG)");
    process.exit(1);
  }

  // ── 1. Clear collections ─────────────────────────────────────────
  console.log("\nClearing collections...");
  await Promise.all([
    Purchase.deleteMany({}),
    PrintingJob.deleteMany({}),
    Production.deleteMany({}),
    Dispatch.deleteMany({}),
    PurchaseOrder.deleteMany({}),
  ]);
  console.log("  Cleared: purchases, printingjobs, productions, dispatches, purchaseorders");

  // ── 2. Purchases (12 raw material entries) ───────────────────────
  console.log("\nSeeding purchases...");
  const suppliers = [
    "JSW Steel Ltd", "Tata Steel", "SAIL", "Bhushan Steel",
    "Hindalco Industries", "Essar Steel", "Jindal Stainless",
    "POSCO India", "ArcelorMittal", "Nippon Steel", "Uttam Galva", "Rathi Steel"
  ];

  const purchaseSpecs = [
    { sr: "RM-001", gauge: 0.20, s1: 914, s2: 1219, temper: "T4",  weight: 5500, date: "2026-03-01" },
    { sr: "RM-002", gauge: 0.22, s1: 900, s2: 1000, temper: "T4",  weight: 4800, date: "2026-03-02" },
    { sr: "RM-003", gauge: 0.18, s1: 800, s2: 1100, temper: "T3",  weight: 6200, date: "2026-03-03" },
    { sr: "RM-004", gauge: 0.25, s1: 950, s2: 1200, temper: "DR8", weight: 7500, date: "2026-03-04" },
    { sr: "RM-005", gauge: 0.20, s1: 860, s2: 1100, temper: "T4",  weight: 5000, date: "2026-03-05" },
    { sr: "RM-006", gauge: 0.22, s1: 914, s2: 1219, temper: "T5",  weight: 4200, date: "2026-03-06" },
    { sr: "RM-007", gauge: 0.18, s1: 750, s2: 1000, temper: "T3",  weight: 3500, date: "2026-03-07" },
    { sr: "RM-008", gauge: 0.20, s1: 900, s2: 1150, temper: "T4",  weight: 5800, date: "2026-03-08" },
    { sr: "RM-009", gauge: 0.25, s1: 860, s2: 1200, temper: "DR8", weight: 6800, date: "2026-03-09" },
    { sr: "RM-010", gauge: 0.22, s1: 800, s2: 1000, temper: "T4",  weight: 4000, date: "2026-03-10" },
    { sr: "RM-011", gauge: 0.18, s1: 914, s2: 1219, temper: "T3",  weight: 7000, date: "2026-03-11" },
    { sr: "RM-012", gauge: 0.20, s1: 950, s2: 1100, temper: "T5",  weight: 5200, date: "2026-03-12" },
  ];

  const purchaseDocs = purchaseSpecs.map((spec, i) => {
    const sheets = calcSheets(spec.gauge, spec.s1, spec.s2, spec.weight);
    return {
      id: uuidv4(),
      sr_no: spec.sr,
      gauge: spec.gauge,
      size1: spec.s1,
      size2: spec.s2,
      temper: spec.temper,
      weight: spec.weight,
      no_of_sheets: sheets,
      sheets_used: 0,
      sheets_available: sheets,
      supplier: suppliers[i],
      invoice_number: `INV-2026-${String(i + 1).padStart(3, "0")}`,
      purchase_date: iso(spec.date),
      created_by: createdBy,
    };
  });

  await Purchase.insertMany(purchaseDocs);
  console.log(`  Inserted ${purchaseDocs.length} purchases`);

  // ── 3. Printing Jobs (12 jobs, linked to purchases) ──────────────
  console.log("\nSeeding printing jobs...");

  // Jobs consume sheets from first 12 purchases
  // Status: 4 completed, 4 in_progress, 4 pending
  const jobStatuses = [
    "completed", "completed", "completed", "completed",
    "in_progress", "in_progress", "in_progress", "in_progress",
    "pending", "pending", "pending", "pending",
  ];

  const jobConfigs = [
    { brandIdx: [0, 1], sizeRef: s4L, bodies: [250, 200] },  // SYNCOAT, AUTOCOAT - 4L
    { brandIdx: [2],    sizeRef: s1L, bodies: [400] },         // SANDING SEALER - 1L
    { brandIdx: [3, 4], sizeRef: s500, bodies: [350, 300] },  // SUPERSET, SWAGAT - 500ML
    { brandIdx: [5, 0], sizeRef: s1K, bodies: [280, 220] },   // AOP, SYNCOAT - 1KG
    { brandIdx: [1],    sizeRef: s4L, bodies: [320] },         // AUTOCOAT - 4L
    { brandIdx: [6, 2], sizeRef: s1L, bodies: [180, 250] },   // CELLOCOAT, SANDING SEALER - 1L
    { brandIdx: [7],    sizeRef: s500, bodies: [380] },        // SUPER EPOXY - 500ML
    { brandIdx: [3],    sizeRef: s1K, bodies: [300] },         // SUPERSET - 1KG
    { brandIdx: [0, 4], sizeRef: s4L, bodies: [200, 150] },   // SYNCOAT, SWAGAT - 4L
    { brandIdx: [1, 6], sizeRef: s1L, bodies: [270, 200] },   // AUTOCOAT, CELLOCOAT - 1L
    { brandIdx: [5],    sizeRef: s500, bodies: [340] },        // AOP - 500ML
    { brandIdx: [7, 2], sizeRef: s1K, bodies: [160, 240] },   // SUPER EPOXY, SANDING SEALER - 1KG
  ];

  const jobDocs = [];
  for (let i = 0; i < 12; i++) {
    const purchase = purchaseDocs[i];
    const config = jobConfigs[i];
    const sheetsConsumed = purchase.no_of_sheets; // consume all available sheets

    // Update purchase tracking
    purchase.sheets_used = sheetsConsumed;
    purchase.sheets_available = 0;

    const brandsArr = config.brandIdx.map((bIdx, j) => ({
      brand_id: usedBrands[bIdx].id,
      brand_name: usedBrands[bIdx].name,
      bodies_count: config.bodies[j],
    }));

    const totalBodies = brandsArr.reduce((s, b) => s + b.bodies_count, 0);

    jobDocs.push({
      id: uuidv4(),
      job_number: `JOB-${String(i + 1).padStart(3, "0")}`,
      raw_material_id: purchase.id,
      raw_material_sr_no: purchase.sr_no,
      raw_material_size: `${purchase.size1}x${purchase.size2}`,
      sheets_from_material: sheetsConsumed,
      sizes: [{
        size_id: config.sizeRef.id,
        size_name: config.sizeRef.name,
        brands: brandsArr,
      }],
      total_bodies: totalBodies,
      status: jobStatuses[i],
      notes: null,
      job_date: iso(`2026-03-${String(i + 3).padStart(2, "0")}`),
      created_by: createdBy,
    });
  }

  await PrintingJob.insertMany(jobDocs);
  // Update purchases with sheets_used
  for (const p of purchaseDocs) {
    await Purchase.updateOne({ id: p.id }, { $set: { sheets_used: p.sheets_used, sheets_available: p.sheets_available } });
  }
  console.log(`  Inserted ${jobDocs.length} printing jobs`);

  // ── 4. Production (12 entries from completed/in_progress jobs) ───
  console.log("\nSeeding production...");

  const productionDocs = [];
  // Use first 8 jobs (4 completed + 4 in_progress) to source production
  // Also add 4 more production entries from other completed jobs for variety
  for (let i = 0; i < 12; i++) {
    const jobIdx = i < 8 ? i : i - 4; // reuse first completed jobs for extra production
    const job = jobDocs[jobIdx];
    const sizeEntry = job.sizes[0];
    const brandEntry = sizeEntry.brands[0];
    const printingStock = brandEntry.bodies_count * job.sheets_from_material;
    const stockUsed = Math.min(Math.floor(printingStock * 0.15), 500); // use up to 15% of stock
    const qtyProduced = Math.floor(stockUsed * 0.8); // ~80% yield

    productionDocs.push({
      id: uuidv4(),
      brand_id: brandEntry.brand_id,
      brand_name: brandEntry.brand_name,
      size_id: sizeEntry.size_id,
      size_name: sizeEntry.size_name,
      quantity_produced: Math.max(qtyProduced, 50),
      printing_stock_used: Math.max(stockUsed, 60),
      notes: i % 3 === 0 ? "Regular batch" : null,
      production_date: iso(`2026-03-${String(i + 10).padStart(2, "0")}`),
      created_by: createdBy,
    });
  }

  await Production.insertMany(productionDocs);
  console.log(`  Inserted ${productionDocs.length} production entries`);

  // ── 5. Dispatches (12 entries) ───────────────────────────────────
  console.log("\nSeeding dispatches...");

  const customers = [
    "Mehta Paints & Hardware", "Shah Industrial Supplies", "Gujarat Coatings Pvt Ltd",
    "Patel & Sons Traders", "National Paints Depot", "Royal Hardware Mart",
    "Star Finishes Co.", "Diamond Paints Distributor", "Elite Coatings Ltd",
    "Prime Supplies Corp", "Sunrise Industries", "Bharat Coatings House",
  ];

  const dispatchStatuses = [
    "delivered", "delivered", "dispatched", "dispatched",
    "dispatched", "dispatched", "dispatched", "pending",
    "pending", "pending", "delivered", "delivered",
  ];

  const dispatchDocs = [];
  // First 4 dispatches will be linked to PurchaseOrders (auto-created style)
  const poLinkedDispatchIds = [];
  for (let i = 0; i < 12; i++) {
    const prod = productionDocs[i % productionDocs.length];
    const dispId = uuidv4();
    const isPoLinked = i < 4;

    if (isPoLinked) poLinkedDispatchIds.push(dispId);

    dispatchDocs.push({
      id: dispId,
      order_number: isPoLinked
        ? `DSP-PO-2026031${5 + i}-00${i + 1}`
        : `ORD-2026-${String(i + 1).padStart(3, "0")}`,
      customer_name: customers[i],
      brand_id: prod.brand_id,
      brand_name: prod.brand_name,
      size_id: prod.size_id,
      size_name: prod.size_name,
      quantity: Math.floor(prod.quantity_produced * 0.6) + 20,
      status: dispatchStatuses[i],
      delivery_address: i % 2 === 0 ? `${customers[i]}, Industrial Area, Gujarat` : null,
      notes: isPoLinked ? `Auto-created from PO PO-2026031${5 + i}-00${i + 1}` : null,
      dispatch_date: iso(`2026-03-${String(i + 15).padStart(2, "0")}`),
      created_by: createdBy,
    });
  }

  await Dispatch.insertMany(dispatchDocs);
  console.log(`  Inserted ${dispatchDocs.length} dispatches`);

  // ── 6. Purchase Orders (12 orders across all statuses) ───────────
  console.log("\nSeeding purchase orders...");

  const poStatuses = [
    "delivered", "delivered",       // oldest, fully done
    "dispatched", "dispatched",     // shipped, linked to dispatches
    "ready", "ready",              // waiting for dispatch
    "in_production", "in_production",
    "confirmed", "confirmed",
    "received", "received",         // newest, just received
  ];

  const poDocs = [];
  for (let i = 0; i < 12; i++) {
    const status = poStatuses[i];
    const prod = productionDocs[i % productionDocs.length];
    const day = 15 + i;

    // Link dispatched/delivered POs to dispatch entries
    let dispatchId = null;
    if (i < 4) {
      dispatchId = poLinkedDispatchIds[i];
    }

    poDocs.push({
      id: uuidv4(),
      serial_no: `PO-202603${String(day).padStart(2, "0")}-${String(i + 1).padStart(3, "0")}`,
      date: iso(`2026-03-${String(day).padStart(2, "0")}`),
      company_name: customers[i],
      brand_id: prod.brand_id,
      brand_name: prod.brand_name,
      size_id: prod.size_id,
      size_name: prod.size_name,
      quantity: Math.floor(Math.random() * 800) + 200,
      status,
      notes: i === 0 ? "Urgent order" : null,
      dispatch_id: dispatchId,
      created_by: createdBy,
      created_at: iso(`2026-03-${String(day).padStart(2, "0")}`),
    });
  }

  await PurchaseOrder.insertMany(poDocs);
  console.log(`  Inserted ${poDocs.length} purchase orders`);

  // ── Summary ──────────────────────────────────────────────────────
  const counts = await Promise.all([
    Purchase.countDocuments(),
    PrintingJob.countDocuments(),
    Production.countDocuments(),
    Dispatch.countDocuments(),
    PurchaseOrder.countDocuments(),
  ]);

  console.log("\n✓ Seed complete!");
  console.log(`  Purchases:       ${counts[0]}`);
  console.log(`  Printing Jobs:   ${counts[1]}`);
  console.log(`  Production:      ${counts[2]}`);
  console.log(`  Dispatches:      ${counts[3]}`);
  console.log(`  Purchase Orders: ${counts[4]}`);

  // Verify dispatched POs have dispatch_id
  const dispatchedPOs = await PurchaseOrder.find({ status: { $in: ["dispatched", "delivered"] } }).lean();
  const orphans = dispatchedPOs.filter(po => !po.dispatch_id);
  if (orphans.length > 0) {
    console.warn(`\n⚠ WARNING: ${orphans.length} dispatched/delivered POs without dispatch_id!`);
  } else {
    console.log(`  ✓ All dispatched/delivered POs have linked dispatch entries`);
  }

  await mongoose.disconnect();
  console.log("\nDisconnected from MongoDB");
}

seed().catch(err => {
  console.error("Seed failed:", err);
  process.exit(1);
});
