const mongoose = require("mongoose");

const purchaseSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  sr_no: { type: String, required: true },
  gauge: { type: Number, required: true, min: 0 },
  size1: { type: Number, required: true, min: 0 },
  size2: { type: Number, required: true, min: 0 },
  temper: { type: String, required: true },
  weight: { type: Number, required: true, min: 0 },
  no_of_sheets: { type: Number, default: 0, min: 0 },
  sheets_used: { type: Number, default: 0, min: 0 },
  // sheets_available is deliberately NOT stored. It was written at create time
  // and on a dimension/weight edit, but printing jobs only ever incremented
  // sheets_used, so the stored copy drifted from the first job onwards and the
  // schema default of 0 stopped the route's `=== undefined` backfill from ever
  // firing. It is now derived on read from no_of_sheets - sheets_used
  // (lib/stock.js, lib/purchaseView.js). scripts/unset-sheets-available.js
  // removes the stale stored copies.
  supplier: { type: String, default: null },
  invoice_number: { type: String, default: null },
  purchase_date: { type: String, required: true },
  created_by: { type: String, required: true },
  updated_by: { type: String, default: null },
  updated_at: { type: String, default: null },
});

purchaseSchema.index({ purchase_date: -1 });
purchaseSchema.index({ sr_no: -1 });

module.exports = mongoose.model("Purchase", purchaseSchema);
