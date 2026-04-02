const express = require("express");
const { v4: uuidv4 } = require("uuid");
const PrintingJob = require("../models/PrintingJob");
const Purchase = require("../models/Purchase");
const { authenticate } = require("../middleware/auth");

const router = express.Router();

// Auto-generate job number: JOB-001, JOB-002, etc.
async function generateJobNumber() {
  const last = await PrintingJob.findOne({}, { job_number: 1 })
    .sort({ job_number: -1 })
    .lean();
  let seq = 1;
  if (last && last.job_number) {
    const match = last.job_number.match(/JOB-(\d+)/);
    if (match) seq = parseInt(match[1], 10) + 1;
  }
  return `JOB-${String(seq).padStart(3, "0")}`;
}

router.post("/", authenticate, async (req, res) => {
  try {
    const { raw_material_id, sizes, notes, job_date } = req.body;
    const id = uuidv4();
    const now = job_date || new Date().toISOString();

    const rawMaterial = await Purchase.findOne({ id: raw_material_id }, { _id: 0, __v: 0 });
    if (!rawMaterial) {
      return res.status(404).json({ detail: "Raw material not found" });
    }

    const sheets_available = (rawMaterial.no_of_sheets || 0) - (rawMaterial.sheets_used || 0);
    if (sheets_available <= 0) {
      return res.status(400).json({ detail: "No sheets available from this raw material" });
    }

    let total_bodies = 0;
    let total_sheets_used = 0;
    for (const sizeEntry of sizes) {
      for (const brand of sizeEntry.brands) {
        total_bodies += brand.bodies_count;
        total_sheets_used += brand.sheets_used || 0;
      }
    }

    if (total_sheets_used <= 0) {
      return res.status(400).json({ detail: "Please specify sheets used for each entry" });
    }
    if (total_sheets_used > sheets_available) {
      return res.status(400).json({ detail: `Total sheets used (${total_sheets_used}) exceeds available sheets (${sheets_available})` });
    }

    const job_number = await generateJobNumber();

    const job = await PrintingJob.create({
      id,
      job_number,
      raw_material_id,
      raw_material_sr_no: rawMaterial.sr_no,
      raw_material_size: `${rawMaterial.size1}x${rawMaterial.size2}`,
      sheets_from_material: total_sheets_used,
      sizes,
      total_bodies,
      notes: notes || null,
      job_date: now,
      created_by: req.user.username,
    });

    // Update raw material sheets_used by the sum of per-line sheets_used
    await Purchase.updateOne(
      { id: raw_material_id },
      { $inc: { sheets_used: total_sheets_used } }
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
    const { notes, job_date, sizes } = req.body;
    const updateData = {};
    if (notes !== undefined) updateData.notes = notes;
    if (job_date !== undefined) updateData.job_date = job_date;
    if (sizes !== undefined) {
      const job = await PrintingJob.findOne({ id: req.params.jobId }).lean();
      if (!job) return res.status(404).json({ detail: "Job not found" });

      let total_bodies = 0;
      let newTotalSheets = 0;
      for (const sizeEntry of sizes) {
        for (const brand of sizeEntry.brands) {
          total_bodies += brand.bodies_count;
          newTotalSheets += brand.sheets_used || 0;
        }
      }
      updateData.sizes = sizes;
      updateData.total_bodies = total_bodies;

      const oldSheets = job.sheets_from_material || 0;
      if (newTotalSheets > 0) {
        updateData.sheets_from_material = newTotalSheets;
        const delta = newTotalSheets - oldSheets;
        if (delta !== 0 && job.raw_material_id) {
          await Purchase.updateOne(
            { id: job.raw_material_id },
            { $inc: { sheets_used: delta } }
          );
        }
      }
    }

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
    const job = await PrintingJob.findOne({ id: req.params.jobId }).lean();
    if (!job) return res.status(404).json({ detail: "Job not found" });

    // Roll back sheets_used on the raw material
    if (job.raw_material_id && job.sheets_from_material) {
      await Purchase.updateOne(
        { id: job.raw_material_id },
        { $inc: { sheets_used: -job.sheets_from_material } }
      );
    }

    await PrintingJob.deleteOne({ id: req.params.jobId });
    res.json({ message: "Job deleted successfully" });
  } catch (error) {
    res.status(500).json({ detail: error.message });
  }
});

module.exports = router;
