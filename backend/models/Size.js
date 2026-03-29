const mongoose = require("mongoose");

const sizeSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  name: { type: String, required: true },
  created_at: { type: String, required: true },
});

module.exports = mongoose.model("Size", sizeSchema);
