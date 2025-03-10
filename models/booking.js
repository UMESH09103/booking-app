const mongoose = require("mongoose");

const bookingSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  djName: { type: String, required: true },
  fullName: { type: String, required: true },
  address: { type: String, required: true },
  mobile: { type: String, required: true },
  date: { type: Date, required: true },
  time: { type: String, required: true },
  location: { type: String, required: true },
  aadhaar: { type: String, required: true },
  photo: { type: String },
  notes: { type: String },
  paymentStatus: {
    type: String,
    default: "pending",
    enum: ["pending", "paid", "failed"],
  },
  status: {
    type: String,
    default: "active",
    enum: ["active", "cancelled"],
  },
});

module.exports = mongoose.model("Booking", bookingSchema);