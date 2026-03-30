const mongoose = require("mongoose");

const purchaseOrderSchema = new mongoose.Schema(
  {
    id: { type: String, required: true, unique: true },
    serial_no: { type: String, required: true, unique: true },
    date: { type: String, required: true },
    company_name: { type: String, required: true },
    brand_id: { type: String, required: true },
    brand_name: { type: String, required: true },
    size_id: { type: String, required: true },
    size_name: { type: String, required: true },
    quantity: { type: Number, required: true, min: 1 },
    quantity_dispatched: { type: Number, default: 0 },
    notes: { type: String, default: null },
    created_by: { type: String, required: true },
    created_at: { type: String, required: true },
  },
  { collection: "purchaseorders" }
);

purchaseOrderSchema.index({ date: -1 });

module.exports = mongoose.model("PurchaseOrder", purchaseOrderSchema);
