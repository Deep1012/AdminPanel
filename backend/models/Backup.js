const mongoose = require("mongoose");

const backupSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  timestamp: { type: Date, default: Date.now },
  type: { type: String, default: "monthly" },
  collections: { type: Object, required: true },
  record_counts: { type: Object, required: true },
  size_bytes: { type: Number, default: 0 },
});

backupSchema.index({ timestamp: -1 });

module.exports = mongoose.model("Backup", backupSchema);
