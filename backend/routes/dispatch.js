const express = require("express");
const { v4: uuidv4 } = require("uuid");
const Dispatch = require("../models/Dispatch");
const { authenticate } = require("../middleware/auth");

const router = express.Router();

router.post("/", authenticate, async (req, res) => {
  try {
    const { order_number, customer_name, brand_id, brand_name, size_id, size_name, quantity, delivery_address, notes, dispatch_date } = req.body;
    const id = uuidv4();
    const now = dispatch_date || new Date().toISOString();

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

// GET single dispatch by ID
router.get("/:dispatchId", authenticate, async (req, res) => {
  try {
    const entry = await Dispatch.findOne({ id: req.params.dispatchId }, { _id: 0, __v: 0 }).lean();
    if (!entry) return res.status(404).json({ detail: "Dispatch not found" });
    res.json(entry);
  } catch (error) {
    res.status(500).json({ detail: error.message });
  }
});

// GET all dispatches
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
    const { status, notes, order_number, customer_name, brand_id, brand_name, size_id, size_name, quantity, delivery_address, dispatch_date } = req.body;
    const updateData = {};
    if (status !== undefined) updateData.status = status;
    if (notes !== undefined) updateData.notes = notes;
    if (order_number !== undefined) updateData.order_number = order_number;
    if (customer_name !== undefined) updateData.customer_name = customer_name;
    if (brand_id !== undefined) updateData.brand_id = brand_id;
    if (brand_name !== undefined) updateData.brand_name = brand_name;
    if (size_id !== undefined) updateData.size_id = size_id;
    if (size_name !== undefined) updateData.size_name = size_name;
    if (quantity !== undefined) updateData.quantity = quantity;
    if (delivery_address !== undefined) updateData.delivery_address = delivery_address;
    if (dispatch_date !== undefined) updateData.dispatch_date = dispatch_date;

    if (Object.keys(updateData).length === 0) {
      return res.status(400).json({ detail: "No fields to update" });
    }

    const result = await Dispatch.updateOne({ id: req.params.dispatchId }, { $set: updateData }, { runValidators: true });
    if (result.matchedCount === 0) {
      return res.status(404).json({ detail: "Dispatch not found" });
    }

    const updated = await Dispatch.findOne({ id: req.params.dispatchId }, { _id: 0, __v: 0 }).lean();
    res.json(updated);
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
