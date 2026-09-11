const mongoose = require("mongoose");

const userSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  username: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  role: { type: String, default: "user", enum: ["admin", "user"] },
  // Permanent lock, set by an administrator via PUT /api/users/:userId and
  // enforced on every request by middleware/auth.js (403). Deliberately
  // separate from the login throttle below: see lib/loginThrottle.js.
  is_locked: { type: Boolean, default: false },
  // Login brute-force throttle. Counted in the database rather than in
  // process memory because this API runs as serverless functions, where
  // concurrent requests land in separate instances. Written only by
  // POST /api/auth/login via lib/loginThrottle.js; never by an administrator.
  failed_login_count: { type: Number, default: 0 },
  locked_until: { type: Date, default: null },
  created_at: { type: String, required: true },
});

module.exports = mongoose.model("User", userSchema);
