const mongoose = require("mongoose");

const brandSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  name: { type: String, required: true },
  created_at: { type: String, required: true },
});

module.exports = mongoose.model("Brand", brandSchema);
