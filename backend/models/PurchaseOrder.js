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
    status: {
      type: String,
      enum: ["received", "confirmed", "in_production", "ready", "dispatched", "delivered"],
      default: "received",
    },
    notes: { type: String, default: null },
    dispatch_id: { type: String, default: null },
    created_by: { type: String, required: true },
    created_at: { type: String, required: true },
  },
  { collection: "purchaseorders" }
);

purchaseOrderSchema.index({ date: -1 });
purchaseOrderSchema.index({ status: 1 });

module.exports = mongoose.model("PurchaseOrder", purchaseOrderSchema);
