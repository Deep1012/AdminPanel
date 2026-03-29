const express = require("express");
const bcrypt = require("bcryptjs");
const User = require("../models/User");
const { authenticate, adminRequired } = require("../middleware/auth");

const router = express.Router();

router.get("/", authenticate, adminRequired, async (req, res) => {
  try {
    const users = await User.find({}, { _id: 0, password: 0, __v: 0 }).lean();
    res.json(users);
  } catch (error) {
    res.status(500).json({ detail: error.message });
  }
});

router.put("/:userId", authenticate, adminRequired, async (req, res) => {
  try {
    const { username, email, role, is_locked, password } = req.body;
    const updateData = {};
    if (username !== undefined) updateData.username = username;
    if (email !== undefined) updateData.email = email;
    if (role !== undefined) updateData.role = role;
    if (is_locked !== undefined) updateData.is_locked = is_locked;
    if (password) updateData.password = await bcrypt.hash(password, 10);

    if (Object.keys(updateData).length === 0) {
      return res.status(400).json({ detail: "No fields to update" });
    }

    const result = await User.updateOne({ id: req.params.userId }, { $set: updateData });
    if (result.matchedCount === 0) {
      return res.status(404).json({ detail: "User not found" });
    }

    res.json({ message: "User updated successfully" });
  } catch (error) {
    res.status(500).json({ detail: error.message });
  }
});

router.delete("/:userId", authenticate, adminRequired, async (req, res) => {
  try {
    const result = await User.deleteOne({ id: req.params.userId });
    if (result.deletedCount === 0) {
      return res.status(404).json({ detail: "User not found" });
    }
    res.json({ message: "User deleted successfully" });
  } catch (error) {
    res.status(500).json({ detail: error.message });
  }
});

module.exports = router;
