const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { v4: uuidv4 } = require("uuid");
const User = require("../models/User");
const { authenticate, adminRequired } = require("../middleware/auth");
const { logActivity } = require("../lib/activityLogger");

const router = express.Router();

const ALLOWED_ROLES = ["admin", "user"];

router.post("/register", authenticate, adminRequired, async (req, res) => {
  try {
    const { username, email, password, role = "user" } = req.body;

    if (typeof email !== "string" || typeof password !== "string" || typeof username !== "string") {
      return res.status(400).json({ detail: "username, email and password must be strings" });
    }
    if (!ALLOWED_ROLES.includes(role)) {
      return res.status(400).json({ detail: `role must be one of: ${ALLOWED_ROLES.join(", ")}` });
    }

    const existing = await User.findOne({ email }).lean();
    if (existing) {
      return res.status(400).json({ detail: "Email already registered" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const now = new Date().toISOString();
    const id = uuidv4();

    const user = await User.create({
      id,
      username,
      email,
      password: hashedPassword,
      role,
      is_locked: false,
      created_at: now,
    });

    res.status(200).json({
      id: user.id,
      username: user.username,
      email: user.email,
      role: user.role,
      is_locked: user.is_locked,
      created_at: user.created_at,
    });
  } catch (error) {
    res.status(500).json({ detail: error.message });
  }
});

router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    // Reject non-strings before building any query: a body such as
    // {"email":{"$ne":null}} would otherwise reach findOne as a Mongo operator
    // filter and match an arbitrary user.
    if (typeof email !== "string" || typeof password !== "string") {
      return res.status(400).json({ detail: "email and password must be strings" });
    }

    const user = await User.findOne({ email });
    if (!user || !(await bcrypt.compare(password, user.password))) {
      return res.status(401).json({ detail: "Invalid credentials" });
    }

    if (user.is_locked) {
      return res.status(403).json({ detail: "Account is locked" });
    }

    const token = jwt.sign(
      { user_id: user.id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: "24h" }
    );

    await logActivity({ action: "LOGIN", entity_type: "auth", entity_id: user.id, entity_label: user.username, user: { id: user.id, username: user.username }, details: `User "${user.username}" logged in`, ip_address: req.ip });

    res.json({
      token,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        role: user.role,
      },
    });
  } catch (error) {
    res.status(500).json({ detail: error.message });
  }
});

router.get("/me", authenticate, async (req, res) => {
  res.json(req.user);
});

module.exports = router;
