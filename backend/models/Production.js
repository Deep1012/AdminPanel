const mongoose = require("mongoose");

const productionSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  brand_id: { type: String, required: true },
  brand_name: { type: String, required: true },
  size_id: { type: String, required: true },
  size_name: { type: String, required: true },
  quantity_produced: { type: Number, required: true },
  printing_stock_used: { type: Number, default: 0 },
  printing_job_id: { type: String, default: null },
  parent_production_id: { type: String, default: null },
  notes: { type: String, default: null },
  production_date: { type: String, required: true },
  created_by: { type: String, required: true },
  updated_by: { type: String, default: null },
  updated_at: { type: String, default: null },
});

productionSchema.index({ production_date: -1 });
productionSchema.index({ parent_production_id: 1 });
productionSchema.index({ brand_name: 1, size_name: 1 });

module.exports = mongoose.model("Production", productionSchema);
