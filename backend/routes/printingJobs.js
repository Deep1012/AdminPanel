const express = require("express");
const { v4: uuidv4 } = require("uuid");
const PrintingJob = require("../models/PrintingJob");
const Purchase = require("../models/Purchase");
const { authenticate } = require("../middleware/auth");
const { logActivity } = require("../lib/activityLogger");
const { nextSequence } = require("../lib/sequence");
const { sheetsAvailable } = require("../lib/stock");
const { reserveSheets, releaseSheets, restoreSheets } = require("../lib/sheetStock");

/**
 * Reverse a sheet movement that was applied ahead of a job write which then
 * failed, so the lot does not keep an adjustment for an edit that never landed.
 *
 * Best-effort and unguarded in both directions: a failed compensation leaves
 * the lot over-deducted, which is visible and conservative.
 *
 * @param {string|null} materialId
 * @param {number} delta - The movement as applied: positive = reserved.
 */
async function undoSheetDelta(materialId, delta) {
  if (!materialId || !delta) return;
  try {
    if (delta > 0) {
      await releaseSheets({ purchaseId: materialId, sheets: delta });
    } else {
      await restoreSheets({ purchaseId: materialId, sheets: -delta });
    }
  } catch (error) {
    console.error("[printingJobs] sheet compensation failed", { materialId, delta, error: error.message });
  }
}

const router = express.Router();

// Job number shape: JOB-001, JOB-002, ... JOB-1000 (see lib/sequence.js).
const JOB_NUMBER_PREFIX = "JOB-";
const JOB_NUMBER_WIDTH = 3;

router.post("/", authenticate, async (req, res, next) => {
  try {
    const { raw_material_id, sizes, notes, job_date, sheets_used } = req.body;
    const id = uuidv4();
    const now = job_date || new Date().toISOString();

    const rawMaterial = await Purchase.findOne({ id: raw_material_id }, { _id: 0, __v: 0 }).lean();
    if (!rawMaterial) {
      return res.status(404).json({ detail: "Raw material not found" });
    }

    const sheets_available = sheetsAvailable(rawMaterial);
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

    // The check above is a pre-check for a good error message only. It reads,
    // then writes, so two concurrent 80-sheet jobs against a 100-sheet lot can
    // both pass it. reserveSheets re-evaluates the same comparison *inside* the
    // update filter, so exactly one of them can win.
    const reserved = await reserveSheets({ purchaseId: raw_material_id, sheets: total_sheets_used });
    if (!reserved) {
      const latest = await Purchase.findOne(
        { id: raw_material_id },
        { no_of_sheets: 1, sheets_used: 1, _id: 0 }
      ).lean();
      if (!latest) {
        return res.status(404).json({ detail: "Raw material not found" });
      }
      return res.status(409).json({
        detail: `Sheets used (${total_sheets_used}) exceeds available sheets (${sheetsAvailable(latest)}). The lot changed while this job was being saved — reload and retry.`,
      });
    }

    // Sheets are deducted BEFORE the job row exists, on purpose. Without
    // transactions one of the two orderings has to be wrong on failure, and
    // this one fails into an over-deduction: the lot shows fewer sheets than it
    // holds, which is visible on the Raw Material Stock page and refuses
    // further commitments. The opposite order fails into an under-deduction,
    // which is invisible and lets the same sheets be committed twice.
    let job;
    try {
      const job_number = await nextSequence(PrintingJob, "job_number", JOB_NUMBER_PREFIX, JOB_NUMBER_WIDTH);

      job = await PrintingJob.create({
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
    } catch (error) {
      // Best-effort compensation. If it also fails we stay over-deducted,
      // which is the conservative side of the failure.
      await releaseSheets({ purchaseId: raw_material_id, sheets: total_sheets_used });
      throw error;
    }

    const job_number = job.job_number;

    await logActivity({ action: "CREATE", entity_type: "printing_job", entity_id: id, entity_label: job_number, user: req.user, details: `Created printing job ${job_number} (${total_bodies} bodies, ${total_sheets_used} sheets)`, ip_address: req.ip });

    res.json(job.toObject({ versionKey: false }));
  } catch (error) {
    next(error);
  }
});

router.get("/", authenticate, async (req, res, next) => {
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
    next(error);
  }
});

router.put("/:jobId", authenticate, async (req, res, next) => {
  try {
    const { notes, job_date, sizes, sheets_used } = req.body;
    const updateData = {
      updated_by: req.user.username,
      updated_at: new Date().toISOString(),
    };
    // Sheet movement applied below, so the job update can compensate it if it
    // fails. A released-but-not-shrunk job is the invisible direction, so it
    // must not be left behind.
    let appliedSheetDelta = 0;
    let sheetMaterialId = null;
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
          if (delta > 0) {
            // An edit that grows a job draws more sheets from the lot and has
            // to respect the same ceiling a new job does. This route used to
            // $inc unconditionally, so an edit could push a lot past its own
            // no_of_sheets with no check at all.
            const reserved = await reserveSheets({ purchaseId: job.raw_material_id, sheets: delta });
            if (reserved) {
              appliedSheetDelta = delta;
              sheetMaterialId = job.raw_material_id;
            } else {
              const latest = await Purchase.findOne(
                { id: job.raw_material_id },
                { no_of_sheets: 1, sheets_used: 1, _id: 0 }
              ).lean();
              const available = latest ? sheetsAvailable(latest) : 0;
              return res.status(400).json({
                detail: `Additional sheets (${delta}) exceed available sheets (${available}) on the linked raw material`,
              });
            }
          } else {
            await releaseSheets({ purchaseId: job.raw_material_id, sheets: -delta });
            appliedSheetDelta = delta;
            sheetMaterialId = job.raw_material_id;
          }
        }
      }
    }

    let result;
    try {
      result = await PrintingJob.updateOne({ id: req.params.jobId }, { $set: updateData });
    } catch (error) {
      await undoSheetDelta(sheetMaterialId, appliedSheetDelta);
      throw error;
    }
    if (result.matchedCount === 0) {
      await undoSheetDelta(sheetMaterialId, appliedSheetDelta);
      return res.status(404).json({ detail: "Job not found" });
    }

    await logActivity({ action: "UPDATE", entity_type: "printing_job", entity_id: req.params.jobId, user: req.user, details: `Updated printing job`, ip_address: req.ip });

    res.json({ message: "Job updated successfully" });
  } catch (error) {
    next(error);
  }
});

router.delete("/:jobId", authenticate, async (req, res, next) => {
  try {
    const job = await PrintingJob.findOne({ id: req.params.jobId }).lean();
    if (!job) return res.status(404).json({ detail: "Job not found" });

    // Roll back sheets_used on the raw material
    if (job.raw_material_id && job.sheets_from_material) {
      // Clamped at 0 by releaseSheets: a raw $inc of a negative number can
      // leave sheets_used negative when the stored value has already drifted
      // below what this job recorded, and a negative sheets_used reads as more
      // stock than the lot ever held.
      await releaseSheets({ purchaseId: job.raw_material_id, sheets: job.sheets_from_material });
    }

    await PrintingJob.deleteOne({ id: req.params.jobId });

    await logActivity({ action: "DELETE", entity_type: "printing_job", entity_id: req.params.jobId, entity_label: job.job_number, user: req.user, details: `Deleted printing job ${job.job_number}`, ip_address: req.ip });

    res.json({ message: "Job deleted successfully" });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
