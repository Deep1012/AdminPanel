const jwt = require("jsonwebtoken");
const User = require("../models/User");

const authenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ detail: "No token provided" });
    }

    const token = authHeader.split(" ")[1];
    const payload = jwt.verify(token, process.env.JWT_SECRET);

    const user = await User.findOne({ id: payload.user_id }).select("-password -_id -__v");
    if (!user) {
      return res.status(401).json({ detail: "User not found" });
    }
    if (user.is_locked) {
      return res.status(403).json({ detail: "Account is locked" });
    }

    req.user = user.toObject();
    next();
  } catch (error) {
    if (error.name === "TokenExpiredError") {
      return res.status(401).json({ detail: "Token expired" });
    }
    return res.status(401).json({ detail: "Invalid token" });
  }
};

const adminRequired = async (req, res, next) => {
  if (req.user.role !== "admin") {
    return res.status(403).json({ detail: "Admin access required" });
  }
  next();
};

module.exports = { authenticate, adminRequired };
