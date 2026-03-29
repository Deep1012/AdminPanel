const mongoose = require("mongoose");

const menuItemSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  label: { type: String, required: true },
  path: { type: String, required: true, unique: true },
  icon: { type: String, required: true },
  display_order: { type: Number, required: true },
  admin_only: { type: Boolean, default: false },
  is_active: { type: Boolean, default: true },
  is_system: { type: Boolean, default: false },
  created_at: { type: String, required: true },
});

menuItemSchema.index({ display_order: 1 });

module.exports = mongoose.model("MenuItem", menuItemSchema);
