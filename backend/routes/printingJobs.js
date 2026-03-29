const express = require("express");
const { v4: uuidv4 } = require("uuid");
const PrintingJob = require("../models/PrintingJob");
const Purchase = require("../models/Purchase");
const { authenticate } = require("../middleware/auth");

const router = express.Router();

router.post("/", authenticate, async (req, res) => {
  try {
    const { job_number, raw_material_id, sizes, notes } = req.body;
    const id = uuidv4();
    const now = new Date().toISOString();

    const rawMaterial = await Purchase.findOne({ id: raw_material_id }, { _id: 0, __v: 0 });
    if (!rawMaterial) {
      return res.status(404).json({ detail: "Raw material not found" });
    }

    const sheets_available = (rawMaterial.no_of_sheets || 0) - (rawMaterial.sheets_used || 0);
    if (sheets_available <= 0) {
      return res.status(400).json({ detail: "No sheets available from this raw material" });
    }

    let total_bodies = 0;
    for (const sizeEntry of sizes) {
      for (const brand of sizeEntry.brands) {
        total_bodies += brand.bodies_count;
      }
    }

    const job = await PrintingJob.create({
      id,
      job_number,
      raw_material_id,
      raw_material_sr_no: rawMaterial.sr_no,
      raw_material_size: `${rawMaterial.size1}x${rawMaterial.size2}`,
      sheets_from_material: sheets_available,
      sizes,
      total_bodies,
      status: "pending",
      notes: notes || null,
      job_date: now,
      created_by: req.user.username,
    });

    // Update raw material sheets_used
    await Purchase.updateOne(
      { id: raw_material_id },
      { $set: { sheets_used: (rawMaterial.sheets_used || 0) + sheets_available } }
    );

    res.json(job.toObject({ versionKey: false }));
  } catch (error) {
    res.status(500).json({ detail: error.message });
  }
});

router.get("/", authenticate, async (req, res) => {
  try {
    const jobs = await PrintingJob.find({}, { _id: 0, __v: 0 }).sort({ job_date: -1 });
    const result = jobs.map((j) => {
      const obj = j.toObject();
      if (!obj.raw_material_sr_no) obj.raw_material_sr_no = "N/A";
      if (!obj.raw_material_size) obj.raw_material_size = "N/A";
      if (obj.sheets_from_material === undefined) obj.sheets_from_material = 0;
      if (!obj.raw_material_id) obj.raw_material_id = "";
      if (!obj.sizes) {
        obj.sizes = [{
          size_id: obj.size_id || "",
          size_name: obj.size_name || "N/A",
          brands: obj.brands || [],
        }];
      }
      return obj;
    });
    res.json(result);
  } catch (error) {
    res.status(500).json({ detail: error.message });
  }
});

router.put("/:jobId", authenticate, async (req, res) => {
  try {
    const { status, notes } = req.body;
    const updateData = {};
    if (status !== undefined) updateData.status = status;
    if (notes !== undefined) updateData.notes = notes;

    if (Object.keys(updateData).length === 0) {
      return res.status(400).json({ detail: "No fields to update" });
    }

    const result = await PrintingJob.updateOne({ id: req.params.jobId }, { $set: updateData });
    if (result.matchedCount === 0) {
      return res.status(404).json({ detail: "Job not found" });
    }

    res.json({ message: "Job updated successfully" });
  } catch (error) {
    res.status(500).json({ detail: error.message });
  }
});

router.delete("/:jobId", authenticate, async (req, res) => {
  try {
    const result = await PrintingJob.deleteOne({ id: req.params.jobId });
    if (result.deletedCount === 0) {
      return res.status(404).json({ detail: "Job not found" });
    }
    res.json({ message: "Job deleted successfully" });
  } catch (error) {
    res.status(500).json({ detail: error.message });
  }
});

module.exports = router;
