const express = require("express");
const mongoose = require("mongoose");
const dotenv = require("dotenv");
const cookieParser = require("cookie-parser");
const path = require("path");
const multer = require("multer");
const { CloudinaryStorage } = require("multer-storage-cloudinary");
const cloudinary = require("cloudinary").v2;

dotenv.config();
const app = express();

// Cloudinary Configuration
cloudinary.config({
  cloud_name: "dceppiv8w",
  api_key: "512776949379832",
  api_secret: "LhdddDrxUsgy2_HoHdUbqZ346BA",
});

// Multer Configuration with Cloudinary
const storage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: "dj-booking-images",
    allowed_formats: ["jpg", "jpeg", "png", "webp"],
  },
});
const upload = multer({
  storage,
  limits: { fileSize: 1024 * 1024 * 5 },
  fileFilter: (req, file, cb) => {
    if (!file.originalname.match(/\.(jpg|jpeg|png|webp)$/)) {
      console.error("❌ File rejected:", file.originalname, "Unsupported type");
      return cb(new Error("Only image files (jpg, jpeg, png, webp) are allowed!"), false);
    }
    console.log("✅ File accepted:", file.originalname);
    cb(null, true);
  },
});

const uploadFields = upload.fields([
  { name: "photo", maxCount: 1 },
  { name: "ownerPhoto", maxCount: 1 },
]);

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(express.static("public"));

// Set EJS as the view engine
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

// Routes
const routes = require("./routes");
app.use("/", routes);

// MongoDB Connection
mongoose.connect(process.env.MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
  ssl: true,
  serverSelectionTimeoutMS: 30000,
})
  .then(() => console.log("✅ MongoDB Connected"))
  .catch(err => console.error("❌ MongoDB Connection Error:", err.message));

// Start Server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));

// Export Multer instances for routes.js
module.exports = { app, upload, uploadFields };