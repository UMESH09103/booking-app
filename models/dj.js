const mongoose = require("mongoose");

const djSchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true },
  genre: { type: String, required: true },
  experience: { type: Number, required: true },
  price: { type: Number, required: true },
  sinceYear: { type: Number, required: true },
  nextAvailableDates: { type: String },
  ownerName: { type: String, required: true },
  mobile: { type: String, required: true },
  photo: { type: String },
  address: { type: String, required: true },
  restrictions: { type: String },
  ownerPhoto: { type: String }, // New field for owner photo (optional)
  addedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model("DJ", djSchema);