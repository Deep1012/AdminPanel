const express = require("express");
const bcrypt = require("bcryptjs");
const { v4: uuidv4 } = require("uuid");
const Brand = require("../models/Brand");
const Size = require("../models/Size");
const User = require("../models/User");

const router = express.Router();

router.post("/", async (req, res) => {
  try {
    const sizes = ["4LTR/5KG", "1LTR", "500ML", "200ML/250ML", "1KG", "1/2KG"];

    const brands = [
      "SANDING SEALER", "SYNCOAT", "SUPERSET", "SWAGAT", "A.O.P", "AUTOCOAT",
      "CELLOCOAT", "SUPER EPOXY", "SYNCOAT EPOXY", "SYNCOAT COMMERCIAL",
      "S/E SATIN FINISH", "SYNCOAT EPOXY HARDNER", "AUTOCOAT ACRYLIC 1K PRIMER",
      "PROF. SANDING SEALER", "MELAMINE", "PROF. MELAMINE", "SYNCOAT 1K",
      "SYNCOAT DECORATIVE", "SYNCOAT HAMMERTONE", "SYNCOAT Q.D.",
      "QD 1K EPOXY PRIMER", "SYNCOAT STIPPLE FINISH", "SYNCOAT ZINC ETECH PRIMER",
      "SUPERPOL", "A/COAT PU COATING BASE", "A/COAT COMM. PU BASE",
      "A/COAT 2-COAT METALLIC BASE", "A/COAT PU COATING BASE W/O HANDLE",
      "A/COAT UNIVERSAL FINISH", "SPEED", "CELLOFIX", "SWAGAT FURNITURE ENAMEL",
      "7KG AUTOCOAT PUTTY", "CELLOCOAT SPARKLE", "SWAGAT RED OXIDE",
      "SWAGAT TRUCK ENAMEL", "U.W. CLEAR", "WOODFILLER", "METALLIC",
      "SUPER EPOXY HARDNER", "WOODFINISH", "2KG LWBF", "CELLOCOAT NC PUTTY",
      "AUTOCOAT PUTTY", "LWBF", "B/FILLER", "COMM LWBF", "COMM B/FILLER",
      "IND. PUTTY", "AUTOCOAT IND PUTTY", "1.5KG AUTOCOAT PUTTY", "ESQ CLASSIC",
      "PRIDE PUTTY", "PRO. SWAGAT", "LID", "BOTTOM", "TOP", "SUNLAN", "SABAR",
      "PASHMINA", "RICHGOLD", "ORBIT", "NAVDEEP", "UMA", "SONATA", "LID LWBF",
      "BOTTOM LWBF", "SHRIJI", "PLAIN", "COMM SANDING SEALER",
    ];

    const now = new Date().toISOString();

    // Clear existing
    await Size.deleteMany({});
    await Brand.deleteMany({});

    // Insert sizes
    const sizeDocs = sizes.map((s) => ({ id: uuidv4(), name: s, created_at: now }));
    await Size.insertMany(sizeDocs);

    // Insert brands
    const brandDocs = brands.map((b) => ({ id: uuidv4(), name: b, created_at: now }));
    await Brand.insertMany(brandDocs);

    // Create admin user if not exists
    const adminExists = await User.findOne({ email: "admin@crm.com" });
    if (!adminExists) {
      const hashedPassword = await bcrypt.hash("admin123", 10);
      await User.create({
        id: uuidv4(),
        username: "Admin",
        email: "admin@crm.com",
        password: hashedPassword,
        role: "admin",
        is_locked: false,
        created_at: now,
      });
    }

    res.json({
      message: "Seed data created successfully",
      sizes_created: sizes.length,
      brands_created: brands.length,
    });
  } catch (error) {
    res.status(500).json({ detail: error.message });
  }
});

module.exports = router;
