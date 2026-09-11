const express = require("express");
const bcrypt = require("bcryptjs");
const User = require("../models/User");
const { authenticate, adminRequired } = require("../middleware/auth");

const router = express.Router();

router.get("/", authenticate, adminRequired, async (req, res, next) => {
  try {
    // failed_login_count/locked_until are login-throttle bookkeeping, not
    // user-facing fields, and are projected out to keep this response
    // contract unchanged. Note the PUT below writes an explicit allowlist,
    // so an administrator can never set them by hand either.
    const users = await User.find(
      {},
      { _id: 0, password: 0, __v: 0, failed_login_count: 0, locked_until: 0 }
    ).lean();
    res.json(users);
  } catch (error) {
    next(error);
  }
});

// Mirrors the allowlist in routes/auth.js. Both paths must agree: register
// gated `role` but this handler did not, and because updateOne/$set runs
// without runValidators the Mongoose enum on User.role was bypassed too, so an
// arbitrary role string reached the database on the edit path. An invalid role
// is not an escalation (adminRequired tests `=== "admin"`, so a garbage value
// denies rather than grants) but it silently strips the user's access.
const ALLOWED_ROLES = ["admin", "user"];

router.put("/:userId", authenticate, adminRequired, async (req, res, next) => {
  try {
    const { username, email, role, is_locked, password } = req.body;

    if (role !== undefined && !ALLOWED_ROLES.includes(role)) {
      return res.status(400).json({ detail: `role must be one of: ${ALLOWED_ROLES.join(", ")}` });
    }
    for (const [field, value] of [["username", username], ["email", email], ["password", password]]) {
      if (value !== undefined && typeof value !== "string") {
        return res.status(400).json({ detail: `${field} must be a string` });
      }
    }
    if (is_locked !== undefined && typeof is_locked !== "boolean") {
      return res.status(400).json({ detail: "is_locked must be a boolean" });
    }

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
    // User.email is uniquely indexed; without this an email collision returns a
    // raw driver message in a 500 rather than something the UI can show.
    if (error.code === 11000) {
      return res.status(400).json({ detail: "Email already registered to another user" });
    }
    next(error);
  }
});

router.delete("/:userId", authenticate, adminRequired, async (req, res, next) => {
  try {
    const result = await User.deleteOne({ id: req.params.userId });
    if (result.deletedCount === 0) {
      return res.status(404).json({ detail: "User not found" });
    }
    res.json({ message: "User deleted successfully" });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
