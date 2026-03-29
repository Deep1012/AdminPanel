require("dotenv").config();
const mongoose = require("mongoose");
const { v4: uuidv4 } = require("uuid");

const Purchase = require("./models/Purchase");
const PrintingJob = require("./models/PrintingJob");
const Production = require("./models/Production");
const Dispatch = require("./models/Dispatch");
const Brand = require("./models/Brand");
const Size = require("./models/Size");

async function seed() {
  await mongoose.connect(process.env.MONGO_URL);
  console.log("Connected to MongoDB");

  // Clear old sample data (keep brands, sizes, users)
  await Purchase.deleteMany({});
  await PrintingJob.deleteMany({});
  await Production.deleteMany({});
  await Dispatch.deleteMany({});
  console.log("Cleared old operational data");

  const brands = await Brand.find({}, { _id: 0 }).lean();
  const sizes = await Size.find({}, { _id: 0 }).lean();

  if (brands.length === 0 || sizes.length === 0) {
    console.error("No brands/sizes found. Run POST /api/seed first.");
    process.exit(1);
  }

  // --- 10 Purchases ---
  const purchases = [];
  const gauges = [0.18, 0.20, 0.22, 0.24, 0.19, 0.21, 0.23, 0.25, 0.20, 0.22];
  const size1s = [810, 830, 914, 750, 900, 810, 950, 800, 914, 860];
  const size2s = [1010, 1050, 1219, 1100, 1200, 1050, 1250, 1000, 1219, 1100];
  const weights = [4500, 5200, 6100, 3800, 5500, 4200, 7000, 3500, 5800, 4800];
  const tempers = ["T3", "T4", "T5", "DR8", "T3", "T4", "T5", "DR8", "T3", "T4"];

  for (let i = 0; i < 10; i++) {
    const gauge = gauges[i];
    const s1 = size1s[i];
    const s2 = size2s[i];
    const weight = weights[i];
    const divisor = (gauge * s1 * s2 / 100000) * 0.785;
    const no_of_sheets = divisor > 0 ? Math.floor(weight / divisor) : 0;
    const day = String(10 + i).padStart(2, "0");

    const p = {
      id: uuidv4(),
      sr_no: `RM-${String(i + 1).padStart(3, "0")}`,
      gauge, size1: s1, size2: s2,
      temper: tempers[i], weight,
      no_of_sheets,
      sheets_used: 0,
      sheets_available: no_of_sheets,
      supplier: `Supplier ${String.fromCharCode(65 + i)}`,
      invoice_number: `INV-2026-${String(i + 1).padStart(3, "0")}`,
      purchase_date: `2026-03-${day}T10:00:00.000Z`,
      created_by: "Admin",
    };
    purchases.push(p);
  }
  await Purchase.insertMany(purchases);
  console.log(`Created ${purchases.length} purchases`);

  // --- 10 Printing Jobs (use first 10 purchases) ---
  const printingJobs = [];
  for (let i = 0; i < 10; i++) {
    const purchase = purchases[i];
    const size = sizes[i % sizes.length];
    const brand1 = brands[i % brands.length];
    const brand2 = brands[(i + 1) % brands.length];
    const bodies1 = 200 + i * 50;
    const bodies2 = 150 + i * 30;
    const sheets = purchase.sheets_available;
    const day = String(12 + i).padStart(2, "0");

    const job = {
      id: uuidv4(),
      job_number: `JOB-${String(i + 1).padStart(3, "0")}`,
      raw_material_id: purchase.id,
      raw_material_sr_no: purchase.sr_no,
      raw_material_size: `${purchase.size1}x${purchase.size2}`,
      sheets_from_material: sheets,
      sizes: [{
        size_id: size.id,
        size_name: size.name,
        brands: [
          { brand_id: brand1.id, brand_name: brand1.name, bodies_count: bodies1 },
          { brand_id: brand2.id, brand_name: brand2.name, bodies_count: bodies2 },
        ],
      }],
      total_bodies: bodies1 + bodies2,
      status: i < 3 ? "pending" : i < 7 ? "in_progress" : "completed",
      notes: i % 3 === 0 ? `Batch ${i + 1} notes` : null,
      job_date: `2026-03-${day}T10:00:00.000Z`,
      created_by: "Admin",
    };
    printingJobs.push(job);

    // Mark purchase sheets as used
    await Purchase.updateOne({ id: purchase.id }, { $set: { sheets_used: sheets, sheets_available: 0 } });
  }
  await PrintingJob.insertMany(printingJobs);
  console.log(`Created ${printingJobs.length} printing jobs`);

  // --- 10 Production entries ---
  const productionEntries = [];
  for (let i = 0; i < 10; i++) {
    const job = printingJobs[i];
    const sizeEntry = job.sizes[0];
    const brandEntry = sizeEntry.brands[0];
    const qtyProduced = 100 + i * 40;
    const printingUsed = brandEntry.bodies_count;
    const day = String(15 + i).padStart(2, "0");

    productionEntries.push({
      id: uuidv4(),
      brand_id: brandEntry.brand_id,
      brand_name: brandEntry.brand_name,
      size_id: sizeEntry.size_id,
      size_name: sizeEntry.size_name,
      quantity_produced: qtyProduced,
      printing_stock_used: printingUsed,
      printing_job_id: job.id,
      notes: i % 2 === 0 ? `Production batch ${i + 1}` : null,
      production_date: `2026-03-${day}T10:00:00.000Z`,
      created_by: "Admin",
    });
  }
  await Production.insertMany(productionEntries);
  console.log(`Created ${productionEntries.length} production entries`);

  // --- 10 Dispatch entries ---
  const dispatchEntries = [];
  const customers = ["Mehta Paints", "Shah Hardware", "Gujarat Coatings", "Patel & Sons", "National Paints",
    "Royal Hardware", "Star Finishes", "Diamond Paints", "Elite Coatings", "Prime Supplies"];
  const statuses = ["pending", "pending", "dispatched", "dispatched", "dispatched",
    "delivered", "delivered", "delivered", "pending", "dispatched"];

  for (let i = 0; i < 10; i++) {
    const prod = productionEntries[i];
    const qty = Math.floor(prod.quantity_produced * 0.7);
    const day = String(18 + (i % 12)).padStart(2, "0");

    dispatchEntries.push({
      id: uuidv4(),
      order_number: `ORD-2026-${String(i + 1).padStart(3, "0")}`,
      customer_name: customers[i],
      brand_id: prod.brand_id,
      brand_name: prod.brand_name,
      size_id: prod.size_id,
      size_name: prod.size_name,
      quantity: qty,
      status: statuses[i],
      delivery_address: `${i + 10}, Industrial Area, Ahmedabad`,
      notes: i % 3 === 0 ? `Priority order` : null,
      dispatch_date: `2026-03-${day}T10:00:00.000Z`,
      created_by: "Admin",
    });
  }
  await Dispatch.insertMany(dispatchEntries);
  console.log(`Created ${dispatchEntries.length} dispatch entries`);

  console.log("\nSample data seeded successfully!");
  await mongoose.disconnect();
}

seed().catch(err => { console.error(err); process.exit(1); });
