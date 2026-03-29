const mongoose = require("mongoose");

const dispatchSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  order_number: { type: String, required: true },
  customer_name: { type: String, required: true },
  brand_id: { type: String, required: true },
  brand_name: { type: String, required: true },
  size_id: { type: String, required: true },
  size_name: { type: String, required: true },
  quantity: { type: Number, required: true },
  notes: { type: String, default: null },
  dispatch_date: { type: String, required: true },
  created_by: { type: String, required: true },
});

module.exports = mongoose.model("Dispatch", dispatchSchema);
