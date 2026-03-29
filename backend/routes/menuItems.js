const express = require("express");
const { v4: uuidv4 } = require("uuid");
const MenuItem = require("../models/MenuItem");
const { authenticate, adminRequired } = require("../middleware/auth");

const router = express.Router();

const DEFAULT_MENU_ITEMS = [
  { label: "DASHBOARD", path: "/dashboard", icon: "LayoutDashboard", display_order: 1, is_system: true },
  { label: "RAW MATERIAL STOCK", path: "/raw-material-stock", icon: "Layers", display_order: 2 },
  { label: "PRINTING STOCK", path: "/printing-stock", icon: "Printer", display_order: 3 },
  { label: "FINISHED GOODS", path: "/finished-goods", icon: "Package", display_order: 4 },
  { label: "PURCHASE ORDERS", path: "/purchase-orders", icon: "ClipboardList", display_order: 5 },
  { label: "PURCHASE", path: "/purchase", icon: "ShoppingCart", display_order: 6 },
  { label: "PRINTING/COATING", path: "/printing", icon: "Printer", display_order: 7 },
  { label: "PRODUCTION", path: "/production", icon: "Factory", display_order: 8 },
  { label: "DISPATCH", path: "/dispatch", icon: "Truck", display_order: 9 },
  { label: "CUSTOMERS", path: "/customers", icon: "Users", display_order: 10, admin_only: true },
  { label: "BRANDS", path: "/brands", icon: "Tag", display_order: 11, admin_only: true },
  { label: "SIZES", path: "/sizes", icon: "Ruler", display_order: 12, admin_only: true },
  { label: "MENU MANAGEMENT", path: "/menu-management", icon: "Menu", display_order: 13, admin_only: true, is_system: true },
  { label: "USERS", path: "/admin", icon: "Settings", display_order: 14, admin_only: true, is_system: true },
];

// GET all menu items (all authenticated users)
router.get("/", authenticate, async (req, res) => {
  try {
    const items = await MenuItem.find({ is_active: true }, { _id: 0, __v: 0 })
      .sort({ display_order: 1 })
      .lean();
    res.json(items);
  } catch (error) {
    res.status(500).json({ detail: error.message });
  }
});

// POST create new menu item (admin only)
router.post("/", authenticate, adminRequired, async (req, res) => {
  try {
    const { label, path, icon, admin_only } = req.body;
    if (!label || !path || !icon) {
      return res.status(400).json({ detail: "Label, path, and icon are required" });
    }

    const existing = await MenuItem.findOne({ path }).lean();
    if (existing) return res.status(400).json({ detail: "A menu item with this path already exists" });

    const maxOrder = await MenuItem.findOne({}, { display_order: 1 }).sort({ display_order: -1 }).lean();
    const display_order = (maxOrder?.display_order || 0) + 1;

    const item = await MenuItem.create({
      id: uuidv4(),
      label: label.toUpperCase(),
      path,
      icon,
      display_order,
      admin_only: admin_only || false,
      is_active: true,
      is_system: false,
      created_at: new Date().toISOString(),
    });

    res.json(item.toObject({ versionKey: false }));
  } catch (error) {
    res.status(500).json({ detail: error.message });
  }
});

// PUT update menu item (admin only)
router.put("/:id", authenticate, adminRequired, async (req, res) => {
  try {
    const { label, path, icon, admin_only, is_active } = req.body;
    const updateData = {};
    if (label !== undefined) updateData.label = label.toUpperCase();
    if (path !== undefined) updateData.path = path;
    if (icon !== undefined) updateData.icon = icon;
    if (admin_only !== undefined) updateData.admin_only = admin_only;
    if (is_active !== undefined) updateData.is_active = is_active;

    if (Object.keys(updateData).length === 0) {
      return res.status(400).json({ detail: "No fields to update" });
    }

    const result = await MenuItem.updateOne({ id: req.params.id }, { $set: updateData });
    if (result.matchedCount === 0) return res.status(404).json({ detail: "Menu item not found" });

    const updated = await MenuItem.findOne({ id: req.params.id }, { _id: 0, __v: 0 }).lean();
    res.json(updated);
  } catch (error) {
    res.status(500).json({ detail: error.message });
  }
});

// PUT reorder all menu items (admin only)
router.put("/", authenticate, adminRequired, async (req, res) => {
  try {
    const { items } = req.body;
    if (!Array.isArray(items)) return res.status(400).json({ detail: "Items array required" });

    const ops = items.map(({ id, display_order }) => ({
      updateOne: { filter: { id }, update: { $set: { display_order } } },
    }));
    await MenuItem.bulkWrite(ops);

    const updated = await MenuItem.find({}, { _id: 0, __v: 0 }).sort({ display_order: 1 }).lean();
    res.json(updated);
  } catch (error) {
    res.status(500).json({ detail: error.message });
  }
});

// DELETE menu item (admin only, reject system items)
router.delete("/:id", authenticate, adminRequired, async (req, res) => {
  try {
    const item = await MenuItem.findOne({ id: req.params.id }).lean();
    if (!item) return res.status(404).json({ detail: "Menu item not found" });
    if (item.is_system) return res.status(400).json({ detail: "Cannot delete system menu items" });

    await MenuItem.deleteOne({ id: req.params.id });
    res.json({ message: "Menu item deleted successfully" });
  } catch (error) {
    res.status(500).json({ detail: error.message });
  }
});

// POST seed default menu items (admin only)
router.post("/seed-defaults", authenticate, adminRequired, async (req, res) => {
  try {
    const count = await MenuItem.countDocuments();
    if (count > 0) return res.status(400).json({ detail: "Menu items already exist. Clear them first if you want to re-seed." });

    const docs = DEFAULT_MENU_ITEMS.map(item => ({
      id: uuidv4(),
      ...item,
      admin_only: item.admin_only || false,
      is_active: true,
      is_system: item.is_system || false,
      created_at: new Date().toISOString(),
    }));
    await MenuItem.insertMany(docs);
    res.json({ message: `Seeded ${docs.length} menu items`, count: docs.length });
  } catch (error) {
    res.status(500).json({ detail: error.message });
  }
});

module.exports = router;
