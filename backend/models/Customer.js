const mongoose = require("mongoose");

const customerSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  name: { type: String, required: true, unique: true },
  created_at: { type: String, required: true },
});


module.exports = mongoose.model("Customer", customerSchema);
