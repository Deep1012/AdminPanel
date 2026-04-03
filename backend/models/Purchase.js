const mongoose = require("mongoose");

const purchaseSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  sr_no: { type: String, required: true },
  gauge: { type: Number, required: true },
  size1: { type: Number, required: true },
  size2: { type: Number, required: true },
  temper: { type: String, required: true },
  weight: { type: Number, required: true },
  no_of_sheets: { type: Number, default: 0 },
  sheets_used: { type: Number, default: 0 },
  sheets_available: { type: Number, default: 0 },
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
