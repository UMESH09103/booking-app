const mongoose = require("mongoose");

const userSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  age: { type: Number, required: true, min: 13 },
  role: { type: String, enum: ["admin", "user"], default: "user" } // Add role field
});

module.exports = mongoose.model("User", userSchema);