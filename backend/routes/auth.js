const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { v4: uuidv4 } = require("uuid");
const User = require("../models/User");
const { authenticate, adminRequired } = require("../middleware/auth");
const { logActivity } = require("../lib/activityLogger");
const { verifyPassword } = require("../lib/passwordVerify");
const { throttleRejection, recordFailedAttempt, clearThrottle } = require("../lib/loginThrottle");
const { resolveLoginAttempt, RECORD_FAILURE, CLEAR_THROTTLE } = require("../lib/loginOutcome");

const router = express.Router();

const ALLOWED_ROLES = ["admin", "user"];

router.post("/register", authenticate, adminRequired, async (req, res, next) => {
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
    next(error);
  }
});

router.post("/login", async (req, res, next) => {
  try {
    const { email, password } = req.body;

    // Reject non-strings before building any query: a body such as
    // {"email":{"$ne":null}} would otherwise reach findOne as a Mongo operator
    // filter and match an arbitrary user.
    if (typeof email !== "string" || typeof password !== "string") {
      return res.status(400).json({ detail: "email and password must be strings" });
    }

    const user = await User.findOne({ email });

    // 1. Brute-force cooldown, before any bcrypt work, so a locked-out
    //    attacker cannot keep burning CPU. The counter lives on the user row
    //    rather than in process memory because concurrent requests to a
    //    serverless deployment land in separate instances, where an in-memory
    //    limiter is bypassed simply by issuing the guesses in parallel.
    const throttled = throttleRejection(user);
    if (throttled) {
      // Correct HTTP for a cooldown, alongside the { detail } the UI reads.
      res.set("Retry-After", String(throttled.retry_after_seconds));
      return res.status(throttled.status).json({ detail: throttled.detail });
    }

    // 2. Always compare, against a dummy hash when no user matched. The old
    //    `!user || !(await bcrypt.compare(...))` short-circuited, so bcrypt
    //    (~50-150ms) ran only for real accounts and response latency
    //    enumerated valid emails. See lib/passwordVerify.js.
    const passwordMatches = await verifyPassword(password, user && user.password);

    // 3. The 401 / 403 / 200 decision, in lib/loginOutcome.js so the ordering
    //    of the three rejections is unit-testable. Note 403 is decided AFTER
    //    the compare above, so an admin-locked account is not distinguishable
    //    by response time.
    const outcome = resolveLoginAttempt({ user, passwordMatches });

    // 4. The throttle bookkeeping the outcome calls for. Both helpers write
    //    only failed_login_count/locked_until — never is_locked — so neither
    //    can create nor release an administrator's permanent lock.
    if (outcome.action === RECORD_FAILURE) {
      await recordFailedAttempt(User, user);
    } else if (outcome.action === CLEAR_THROTTLE) {
      await clearThrottle(User, user);
    }

    if (!outcome.ok) {
      return res.status(outcome.status).json({ detail: outcome.detail });
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
    next(error);
  }
});

router.get("/me", authenticate, async (req, res, next) => {
  res.json(req.user);
});

module.exports = router;
