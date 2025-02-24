const mongoose = require("mongoose");

const djSchema = new mongoose.Schema({
  name: { type: String, required: true },
  genre: { type: String, required: true },
  experience: { type: Number, required: true },
  price: { type: Number, required: true },
  sinceYear: { type: Number, required: true },
  nextAvailableDates: [Date],
  ownerName: { type: String, required: true },
  mobile: { type: String, required: true },
  address: { type: String, required: true },
  restrictions: { type: String },
  photo: { type: String }, // URL to DJ photo
  ownerPhoto: { type: String }, // URL to owner photo
  addedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true }
});

module.exports = mongoose.model("DJ", djSchema);