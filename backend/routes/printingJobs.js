const express = require("express");
const { v4: uuidv4 } = require("uuid");
const PrintingJob = require("../models/PrintingJob");
const Purchase = require("../models/Purchase");
const { authenticate } = require("../middleware/auth");
const { logActivity } = require("../lib/activityLogger");

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
    const { raw_material_id, sizes, notes, job_date, sheets_used } = req.body;
    const id = uuidv4();
    const now = job_date || new Date().toISOString();

    const rawMaterial = await Purchase.findOne({ id: raw_material_id }, { _id: 0, __v: 0 }).lean();
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

    // Accept sheets_used at job level; fall back to summing per-entry for backward compat
    let total_sheets_used = sheets_used || 0;
    if (!total_sheets_used) {
      for (const sizeEntry of sizes) {
        for (const brand of sizeEntry.brands) {
          total_sheets_used += brand.sheets_used || 0;
        }
      }
    }

    if (total_sheets_used <= 0) {
      return res.status(400).json({ detail: "Please specify sheets used" });
    }
    if (total_sheets_used > sheets_available) {
      return res.status(400).json({ detail: `Sheets used (${total_sheets_used}) exceeds available sheets (${sheets_available})` });
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

    await Purchase.updateOne(
      { id: raw_material_id },
      { $inc: { sheets_used: total_sheets_used } }
    );

    logActivity({ action: "CREATE", entity_type: "printing_job", entity_id: id, entity_label: job_number, user: req.user, details: `Created printing job ${job_number} (${total_bodies} bodies, ${total_sheets_used} sheets)`, ip_address: req.ip });

    res.json(job.toObject({ versionKey: false }));
  } catch (error) {
    res.status(500).json({ detail: error.message });
  }
});

router.get("/", authenticate, async (req, res) => {
  try {
    const jobs = await PrintingJob.find({}, { _id: 0, __v: 0 }).sort({ job_date: -1 }).lean();
    const result = jobs.map((j) => {
      if (!j.raw_material_sr_no) j.raw_material_sr_no = "N/A";
      if (!j.raw_material_size) j.raw_material_size = "N/A";
      if (j.sheets_from_material === undefined) j.sheets_from_material = 0;
      if (!j.raw_material_id) j.raw_material_id = "";
      if (!j.sizes) {
        j.sizes = [{
          size_id: j.size_id || "",
          size_name: j.size_name || "N/A",
          brands: j.brands || [],
        }];
      }
      return j;
    });
    res.json(result);
  } catch (error) {
    res.status(500).json({ detail: error.message });
  }
});

router.put("/:jobId", authenticate, async (req, res) => {
  try {
    const { notes, job_date, sizes, sheets_used } = req.body;
    const updateData = {
      updated_by: req.user.username,
      updated_at: new Date().toISOString(),
    };
    if (notes !== undefined) updateData.notes = notes;
    if (job_date !== undefined) updateData.job_date = job_date;
    if (sizes !== undefined) {
      const job = await PrintingJob.findOne({ id: req.params.jobId }).lean();
      if (!job) return res.status(404).json({ detail: "Job not found" });

      let total_bodies = 0;
      for (const sizeEntry of sizes) {
        for (const brand of sizeEntry.brands) {
          total_bodies += brand.bodies_count;
        }
      }
      updateData.sizes = sizes;
      updateData.total_bodies = total_bodies;

      // Accept sheets_used at job level; fall back to summing per-entry
      let newTotalSheets = sheets_used || 0;
      if (!newTotalSheets) {
        for (const sizeEntry of sizes) {
          for (const brand of sizeEntry.brands) {
            newTotalSheets += brand.sheets_used || 0;
          }
        }
      }

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

    const result = await PrintingJob.updateOne({ id: req.params.jobId }, { $set: updateData });
    if (result.matchedCount === 0) {
      return res.status(404).json({ detail: "Job not found" });
    }

    logActivity({ action: "UPDATE", entity_type: "printing_job", entity_id: req.params.jobId, user: req.user, details: `Updated printing job`, ip_address: req.ip });

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

    logActivity({ action: "DELETE", entity_type: "printing_job", entity_id: req.params.jobId, entity_label: job.job_number, user: req.user, details: `Deleted printing job ${job.job_number}`, ip_address: req.ip });

    res.json({ message: "Job deleted successfully" });
  } catch (error) {
    res.status(500).json({ detail: error.message });
  }
});

module.exports = router;
