const express = require("express");
const { v4: uuidv4 } = require("uuid");
const Customer = require("../models/Customer");
const { authenticate, adminRequired } = require("../middleware/auth");

const router = express.Router();

router.get("/", authenticate, async (req, res) => {
  try {
    const customers = await Customer.find({}, { _id: 0, __v: 0 }).sort({ name: 1 });
    res.json(customers);
  } catch (error) {
    res.status(500).json({ detail: error.message });
  }
});

router.post("/", authenticate, adminRequired, async (req, res) => {
  try {
    const { name } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ detail: "Customer name is required" });
    }

    const existing = await Customer.findOne({ name: name.trim() }).lean();
    if (existing) {
      return res.status(409).json({ detail: "Customer already exists" });
    }

    const customer = await Customer.create({
      id: uuidv4(),
      name: name.trim(),
      created_at: new Date().toISOString(),
    });

    res.json(customer.toObject({ versionKey: false }));
  } catch (error) {
    res.status(500).json({ detail: error.message });
  }
});

router.put("/:customerId", authenticate, adminRequired, async (req, res) => {
  try {
    const { name } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ detail: "Customer name is required" });
    }

    const result = await Customer.updateOne(
      { id: req.params.customerId },
      { $set: { name: name.trim() } }
    );
    if (result.matchedCount === 0) {
      return res.status(404).json({ detail: "Customer not found" });
    }

    res.json({ message: "Customer updated successfully" });
  } catch (error) {
    res.status(500).json({ detail: error.message });
  }
});

router.delete("/:customerId", authenticate, adminRequired, async (req, res) => {
  try {
    const result = await Customer.deleteOne({ id: req.params.customerId });
    if (result.deletedCount === 0) {
      return res.status(404).json({ detail: "Customer not found" });
    }
    res.json({ message: "Customer deleted successfully" });
  } catch (error) {
    res.status(500).json({ detail: error.message });
  }
});

module.exports = router;
