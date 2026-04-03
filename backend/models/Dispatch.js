const mongoose = require("mongoose");

const dispatchSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  order_number: { type: String, required: true },
  customer_name: { type: String, required: true },
  // Legacy single-item fields (kept for backwards compatibility)
  brand_id: { type: String, default: "" },
  brand_name: { type: String, default: "" },
  size_id: { type: String, default: "" },
  size_name: { type: String, default: "" },
  quantity: { type: Number, default: 0 },
  purchase_order_id: { type: String, default: null },
  // Multi-item support
  items: { type: Array, default: [] },
  total_quantity: { type: Number, default: 0 },
  notes: { type: String, default: null },
  dispatch_date: { type: String, required: true },
  created_by: { type: String, required: true },
  updated_by: { type: String, default: null },
  updated_at: { type: String, default: null },
});

dispatchSchema.index({ dispatch_date: -1 });
dispatchSchema.index({ order_number: -1 });
dispatchSchema.index({ purchase_order_id: 1 });

module.exports = mongoose.model("Dispatch", dispatchSchema);
