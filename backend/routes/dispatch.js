const express = require("express");
const { v4: uuidv4 } = require("uuid");
const Dispatch = require("../models/Dispatch");
const { authenticate } = require("../middleware/auth");

const router = express.Router();

router.post("/", authenticate, async (req, res) => {
  try {
    const { order_number, customer_name, brand_id, brand_name, size_id, size_name, quantity, delivery_address, notes } = req.body;
    const id = uuidv4();
    const now = new Date().toISOString();

    const entry = await Dispatch.create({
      id,
      order_number,
      customer_name,
      brand_id,
      brand_name,
      size_id,
      size_name,
      quantity,
      status: "pending",
      delivery_address: delivery_address || null,
      notes: notes || null,
      dispatch_date: now,
      created_by: req.user.username,
    });

    res.json(entry.toObject({ versionKey: false }));
  } catch (error) {
    res.status(500).json({ detail: error.message });
  }
});

router.get("/", authenticate, async (req, res) => {
  try {
    const entries = await Dispatch.find({}, { _id: 0, __v: 0 }).sort({ dispatch_date: -1 });
    res.json(entries);
  } catch (error) {
    res.status(500).json({ detail: error.message });
  }
});

router.put("/:dispatchId", authenticate, async (req, res) => {
  try {
    const { status, notes } = req.body;
    const updateData = {};
    if (status !== undefined) updateData.status = status;
    if (notes !== undefined) updateData.notes = notes;

    if (Object.keys(updateData).length === 0) {
      return res.status(400).json({ detail: "No fields to update" });
    }

    const result = await Dispatch.updateOne({ id: req.params.dispatchId }, { $set: updateData });
    if (result.matchedCount === 0) {
      return res.status(404).json({ detail: "Dispatch not found" });
    }

    res.json({ message: "Dispatch updated successfully" });
  } catch (error) {
    res.status(500).json({ detail: error.message });
  }
});

router.delete("/:dispatchId", authenticate, async (req, res) => {
  try {
    const result = await Dispatch.deleteOne({ id: req.params.dispatchId });
    if (result.deletedCount === 0) {
      return res.status(404).json({ detail: "Dispatch not found" });
    }
    res.json({ message: "Dispatch deleted successfully" });
  } catch (error) {
    res.status(500).json({ detail: error.message });
  }
});

module.exports = router;
