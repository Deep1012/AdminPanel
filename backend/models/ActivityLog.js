const mongoose = require("mongoose");

const activityLogSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  action: { type: String, required: true, enum: ["LOGIN", "CREATE", "UPDATE", "DELETE", "EXPORT", "IMPORT", "CLEAR_DATA", "BACKUP"] },
  entity_type: { type: String, required: true },
  entity_id: { type: String, default: null },
  entity_label: { type: String, default: null },
  user_id: { type: String, required: true },
  username: { type: String, required: true },
  details: { type: String, default: null },
  ip_address: { type: String, default: null },
  timestamp: { type: Date, default: Date.now, index: true },
});

activityLogSchema.index({ action: 1 });
activityLogSchema.index({ entity_type: 1 });
activityLogSchema.index({ user_id: 1 });
activityLogSchema.index({ timestamp: -1, entity_type: 1 });

module.exports = mongoose.model("ActivityLog", activityLogSchema);
