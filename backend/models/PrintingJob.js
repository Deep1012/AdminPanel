const mongoose = require("mongoose");

const printingJobSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  job_number: { type: String, required: true },
  raw_material_id: { type: String, required: true },
  raw_material_sr_no: { type: String, default: "N/A" },
  raw_material_size: { type: String, default: "N/A" },
  sheets_from_material: { type: Number, default: 0 },
  sizes: { type: Array, default: [] },
  total_bodies: { type: Number, default: 0 },
  // status field deprecated — kept for backward compat with existing data
  status: { type: String, default: null },
  notes: { type: String, default: null },
  job_date: { type: String, required: true },
  created_by: { type: String, required: true },
  updated_by: { type: String, default: null },
  updated_at: { type: String, default: null },
});

printingJobSchema.index({ job_date: -1 });
printingJobSchema.index({ raw_material_id: 1 });
printingJobSchema.index({ job_number: -1 });

module.exports = mongoose.model("PrintingJob", printingJobSchema);
