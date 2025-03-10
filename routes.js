const express = require("express");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const nodemailer = require("nodemailer");
const User = require("./models/user");
const Booking = require("./models/booking");
const DJ = require("./models/dj");
const { initiatePaytmPayment } = require("./paytm");
const multer = require("multer");
const { CloudinaryStorage } = require("multer-storage-cloudinary");
const cloudinary = require("cloudinary").v2;
const PaytmChecksum = require("paytmchecksum");

const router = express.Router();

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

// Nodemailer Configuration
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

function authenticateToken(req, res, next) {
  const token = req.cookies.token;
  if (!token) return res.redirect("/login");
  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err) return res.redirect("/login");
    req.user = user;
    User.findById(user.id)
      .then((dbUser) => {
        if (!dbUser) return res.redirect("/login");
        req.user.role = dbUser.role;
        next();
      })
      .catch((err) => {
        console.error("❌ User Fetch Error:", err.message);
        res.redirect("/login");
      });
  });
}

router.get("/", (req, res) => {
  const token = req.cookies.token;
  let user = null;
  if (token) {
    try {
      user = jwt.verify(token, process.env.JWT_SECRET);
    } catch (err) {}
  }
  res.render("landing", { user });
});

router.get("/register", (req, res) => {
  res.render("register", { error: null, message: null });
});

router.post("/register", async (req, res) => {
  const { username, email, password, age, role } = req.body;
  try {
    const existingUser = await User.findOne({ $or: [{ email }, { username }] });
    if (existingUser) {
      return res.render("register", { error: "Username or Email already exists!", message: null });
    }
    if (password.length < 6) {
      return res.render("register", { error: "Password must be at least 6 characters!", message: null });
    }
    if (age < 13) {
      return res.render("register", { error: "You must be at least 13 years old!", message: null });
    }
    const hash = await bcrypt.hash(password, 10);
    await User.create({ username, email, password: hash, age, role: role || "user" });
    res.redirect("/login?message=Account created successfully! Please log in.");
  } catch (err) {
    console.error("❌ Registration Error:", err.message);
    res.render("register", { error: "Internal server error", message: null });
  }
});

router.get("/login", (req, res) => {
  res.render("login", { message: req.query.message || null, error: null });
});

router.post("/login", async (req, res) => {
  const { email, password, rememberMe } = req.body;
  try {
    const user = await User.findOne({ email });
    if (!user) {
      return res.render("login", { error: "Invalid email or password", message: null });
    }
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.render("login", { error: "Invalid email or password", message: null });
    }
    const token = jwt.sign({ id: user._id, email: user.email }, process.env.JWT_SECRET, {
      expiresIn: rememberMe ? "7d" : "1h",
    });
    res.cookie("token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      maxAge: rememberMe ? 7 * 24 * 60 * 60 * 1000 : 60 * 60 * 1000,
    });
    res.redirect("/dashboard");
  } catch (err) {
    console.error("❌ Login Error:", err.message);
    res.render("login", { error: "Internal server error", message: null });
  }
});

// Forgot Password Routes
router.get("/forgot-password", (req, res) => {
  res.render("forgot-password", { error: null, message: null });
});

router.post("/forgot-password", async (req, res) => {
  const { email } = req.body;
  try {
    const user = await User.findOne({ email });
    if (!user) {
      return res.render("forgot-password", { error: "No user found with this email", message: null });
    }

    const resetToken = jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: "1h" });
    const resetLink = `http://localhost:3000/reset-password/${resetToken}`; // Update for Render in production

    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: email,
      subject: "Password Reset Request",
      html: `
        <p>You requested a password reset for your DJ Booking account.</p>
        <p>Click <a href="${resetLink}">here</a> to reset your password. This link expires in 1 hour.</p>
        <p>If you didn’t request this, ignore this email.</p>
      `,
    };

    await transporter.sendMail(mailOptions);
    res.render("forgot-password", { error: null, message: "Password reset link sent to your email!" });
  } catch (err) {
    console.error("❌ Forgot Password Error:", err.message);
    res.render("forgot-password", { error: "Failed to send reset link. Try again.", message: null });
  }
});

router.get("/reset-password/:token", (req, res) => {
  const { token } = req.params;
  try {
    jwt.verify(token, process.env.JWT_SECRET);
    res.render("reset-password", { token, error: null, message: null });
  } catch (err) {
    console.error("❌ Reset Token Error:", err.message);
    res.render("login", { error: "Invalid or expired reset link", message: null });
  }
});

router.post("/reset-password/:token", async (req, res) => {
  const { token } = req.params;
  const { password } = req.body;
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.id);
    if (!user) {
      return res.render("reset-password", { token, error: "User not found", message: null });
    }
    if (password.length < 6) {
      return res.render("reset-password", { token, error: "Password must be at least 6 characters!", message: null });
    }
    const hash = await bcrypt.hash(password, 10);
    user.password = hash;
    await user.save();
    res.redirect("/login?message=Password reset successfully! Please log in.");
  } catch (err) {
    console.error("❌ Reset Password Error:", err.message);
    res.render("reset-password", { token, error: "Invalid or expired reset link", message: null });
  }
});

router.get("/dashboard", authenticateToken, async (req, res) => {
  try {
    const djs = await DJ.find();
    res.render("dashboard", { 
      user: req.user, 
      djs, 
      error: null, 
      message: req.query.message || null 
    });
  } catch (err) {
    console.error("❌ Dashboard Error:", err.message);
    res.render("dashboard", { 
      user: req.user, 
      djs: [], 
      error: "Failed to load DJs", 
      message: null 
    });
  }
});

router.get("/profile", authenticateToken, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    res.render("profile", { user });
  } catch (err) {
    console.error("❌ Profile Error:", err.message);
    res.redirect("/login");
  }
});

router.get("/history", authenticateToken, async (req, res) => {
  try {
    const bookings = await Booking.find({ userId: req.user.id }).sort({ date: -1 });
    res.render("history", {
      bookings,
      error: req.query.error || null,
      message: req.query.message || null,
    });
  } catch (err) {
    console.error("❌ History Error:", err.message);
    res.render("history", {
      bookings: [],
      error: "Failed to load booking history",
      message: null,
    });
  }
});

router.post("/booking/cancel/:bookingId", authenticateToken, async (req, res) => {
  const { bookingId } = req.params;
  try {
    const booking = await Booking.findById(bookingId);
    if (!booking || booking.userId.toString() !== req.user.id) {
      const bookings = await Booking.find({ userId: req.user.id }).sort({ date: -1 });
      return res.render("history", {
        bookings,
        error: "Invalid or unauthorized booking",
        message: null,
      });
    }
    if (booking.status === "cancelled") {
      const bookings = await Booking.find({ userId: req.user.id }).sort({ date: -1 });
      return res.render("history", {
        bookings,
        error: "Booking already cancelled",
        message: null,
      });
    }
    if (booking.paymentStatus === "paid") {
      console.log("ℹ️ Refund logic pending for booking:", bookingId);
    }
    booking.status = "cancelled";
    await booking.save();
    await DJ.updateOne(
      { name: booking.djName },
      { $addToSet: { nextAvailableDates: booking.date } }
    );
    const bookings = await Booking.find({ userId: req.user.id }).sort({ date: -1 });
    res.render("history", {
      bookings,
      error: null,
      message: "Booking cancelled successfully",
    });
  } catch (err) {
    console.error("❌ Cancel Booking Error:", err.message);
    const bookings = await Booking.find({ userId: req.user.id }).sort({ date: -1 });
    res.render("history", {
      bookings,
      error: "Failed to cancel booking",
      message: null,
    });
  }
});

router.post("/logout", (req, res) => {
  res.clearCookie("token");
  res.redirect("/login");
});

// Add DJ (accessible to admins only)
router.get("/add-dj", authenticateToken, (req, res) => {
  if (req.user.role !== "admin") {
    return res.redirect("/dashboard?error=Unauthorized access");
  }
  res.render("add-dj", { error: null, message: null });
});

router.post("/add-dj", authenticateToken, uploadFields, async (req, res) => {
  if (req.user.role !== "admin") {
    return res.redirect("/dashboard?error=Unauthorized access");
  }
  const {
    name,
    genre,
    experience,
    price,
    sinceYear,
    nextAvailableDates,
    ownerName,
    mobile,
    address,
    restrictions,
  } = req.body;

  const photo = req.files && req.files["photo"] ? req.files["photo"][0].path : null;
  const ownerPhoto = req.files && req.files["ownerPhoto"] ? req.files["ownerPhoto"][0].path : null;

  try {
    if (!name || !genre || !experience || !price || !sinceYear || !ownerName || !mobile || !address) {
      return res.render("add-dj", {
        error: "All fields except photo, owner photo, next available dates, and restrictions are required!",
        message: null,
      });
    }
    if (!/^\d{10}$/.test(mobile)) {
      return res.render("add-dj", { error: "Mobile number must be 10 digits!", message: null });
    }
    if (isNaN(experience) || experience < 0) {
      return res.render("add-dj", { error: "Experience must be a positive number!", message: null });
    }
    if (isNaN(price) || price <= 0) {
      return res.render("add-dj", { error: "Price must be a positive number!", message: null });
    }
    if (isNaN(sinceYear) || sinceYear < 1900 || sinceYear > new Date().getFullYear()) {
      return res.render("add-dj", { error: "Since Year must be a valid year!", message: null });
    }

    const existingDJ = await DJ.findOne({ name });
    if (existingDJ) {
      return res.render("add-dj", { error: "DJ with this name already exists!", message: null });
    }

    let parsedDates = [];
    if (nextAvailableDates) {
      parsedDates = nextAvailableDates.split(",").map((date) => new Date(date.trim()));
      if (parsedDates.some((date) => isNaN(date.getTime()))) {
        return res.render("add-dj", { error: "Invalid date format in Next Available Dates!", message: null });
      }
    }

    const dj = new DJ({
      name,
      genre,
      experience: parseInt(experience),
      price: parseInt(price),
      sinceYear: parseInt(sinceYear),
      nextAvailableDates: parsedDates,
      ownerName,
      mobile,
      address,
      restrictions: restrictions || "",
      photo,
      ownerPhoto,
      addedBy: req.user.id,
    });

    await dj.save();
    res.render("add-dj", {
      error: null,
      message: "DJ added successfully! You will be redirected to the dashboard in 2 seconds...",
      redirect: true,
    });
  } catch (err) {
    console.error("❌ Add DJ Error:", err.message);
    res.render("add-dj", { error: `Failed to add DJ: ${err.message}`, message: null });
  }
});

// Edit DJ (accessible only to the admin who added it)
router.get("/edit-dj/:djName", authenticateToken, async (req, res) => {
  const djName = req.params.djName;
  try {
    const dj = await DJ.findOne({ name: djName });
    if (!dj) {
      return res.redirect("/dashboard?error=DJ not found");
    }
    if (req.user.role !== "admin" || dj.addedBy.toString() !== req.user.id) {
      return res.redirect("/dashboard?error=Unauthorized to edit this DJ");
    }
    res.render("edit-dj", { dj, error: null, message: null });
  } catch (err) {
    console.error("❌ Edit DJ Page Error:", err.message);
    res.redirect("/dashboard?error=Failed to load edit page");
  }
});

router.post("/edit-dj/:djName", authenticateToken, uploadFields, async (req, res) => {
  const djName = req.params.djName;
  const {
    name,
    genre,
    experience,
    price,
    sinceYear,
    nextAvailableDates,
    ownerName,
    mobile,
    address,
    restrictions,
  } = req.body;

  const photo = req.files && req.files["photo"] ? req.files["photo"][0].path : null;
  const ownerPhoto = req.files && req.files["ownerPhoto"] ? req.files["ownerPhoto"][0].path : null;

  try {
    const dj = await DJ.findOne({ name: djName });
    if (!dj) {
      return res.redirect("/dashboard?error=DJ not found");
    }
    if (req.user.role !== "admin" || dj.addedBy.toString() !== req.user.id) {
      return res.redirect("/dashboard?error=Unauthorized to edit this DJ");
    }

    if (!name || !genre || !experience || !price || !sinceYear || !ownerName || !mobile || !address) {
      return res.render("edit-dj", {
        dj,
        error: "All fields except photo, owner photo, next available dates, and restrictions are required!",
        message: null,
      });
    }
    if (!/^\d{10}$/.test(mobile)) {
      return res.render("edit-dj", { dj, error: "Mobile number must be 10 digits!", message: null });
    }
    if (isNaN(experience) || experience < 0) {
      return res.render("edit-dj", { dj, error: "Experience must be a positive number!", message: null });
    }
    if (isNaN(price) || price <= 0) {
      return res.render("edit-dj", { dj, error: "Price must be a positive number!", message: null });
    }
    if (isNaN(sinceYear) || sinceYear < 1900 || sinceYear > new Date().getFullYear()) {
      return res.render("edit-dj", { dj, error: "Since Year must be a valid year!", message: null });
    }

    let parsedDates = [];
    if (nextAvailableDates) {
      parsedDates = nextAvailableDates.split(",").map((date) => new Date(date.trim()));
      if (parsedDates.some((date) => isNaN(date.getTime()))) {
        return res.render("edit-dj", { dj, error: "Invalid date format in Next Available Dates!", message: null });
      }
    }

    dj.name = name;
    dj.genre = genre;
    dj.experience = parseInt(experience);
    dj.price = parseInt(price);
    dj.sinceYear = parseInt(sinceYear);
    dj.nextAvailableDates = parsedDates.length ? parsedDates : dj.nextAvailableDates;
    dj.ownerName = ownerName;
    dj.mobile = mobile;
    dj.address = address;
    dj.restrictions = restrictions || "";
    if (photo) dj.photo = photo;
    if (ownerPhoto) dj.ownerPhoto = ownerPhoto;

    await dj.save();
    res.render("edit-dj", {
      dj,
      error: null,
      message: "DJ updated successfully! Redirecting to dashboard in 2 seconds...",
      redirect: true,
    });
  } catch (err) {
    console.error("❌ Edit DJ Error:", err.message);
    const dj = await DJ.findOne({ name: djName });
    res.render("edit-dj", { dj, error: `Failed to update DJ: ${err.message}`, message: null });
  }
});

// Delete DJ (accessible only to the admin who added it)
router.post("/delete-dj/:djName", authenticateToken, async (req, res) => {
  const djName = req.params.djName;
  try {
    const dj = await DJ.findOne({ name: djName });
    if (!dj) {
      return res.redirect("/dashboard?error=DJ not found");
    }
    if (req.user.role !== "admin" || dj.addedBy.toString() !== req.user.id) {
      return res.redirect("/dashboard?error=Unauthorized to delete this DJ");
    }

    await DJ.deleteOne({ name: djName });
    res.redirect("/dashboard?message=DJ deleted successfully");
  } catch (err) {
    console.error("❌ Delete DJ Error:", err.message);
    res.redirect("/dashboard?error=Failed to delete DJ");
  }
});

router.get("/book/:djName", authenticateToken, async (req, res) => {
  const djName = req.params.djName;
  try {
    const dj = await DJ.findOne({ name: djName });
    if (!dj) {
      return res.redirect("/dashboard?error=DJ not found");
    }
    res.render("book", { djName, error: null, message: null });
  } catch (err) {
    console.error("❌ Book Page Error:", err.message);
    res.redirect("/dashboard?error=Failed to load booking page");
  }
});

router.post("/book/:djName", authenticateToken, upload.single("photo"), async (req, res) => {
  const djName = req.params.djName;
  const { fullName, address, mobile, date, time, location, aadhaar, notes } = req.body;
  const photo = req.file ? req.file.path : null;

  try {
    if (!fullName || !address || !mobile || !date || !time || !location || !aadhaar) {
      return res.render("book", { djName, error: "All fields except notes and photo are required!", message: null });
    }
    if (!/^\d{10}$/.test(mobile)) {
      return res.render("book", { djName, error: "Mobile number must be 10 digits!", message: null });
    }
    if (!/^\d{4}\s\d{4}\s\d{4}$/.test(aadhaar)) {
      return res.render("book", { djName, error: "Aadhaar must be in XXXX XXXX XXXX format!", message: null });
    }

    const bookingDate = new Date(date);
    const dj = await DJ.findOne({ name: djName });
    if (!dj) {
      return res.render("book", { djName, error: "DJ not found", message: null });
    }

    const existingBooking = await Booking.findOne({
      djName,
      date: bookingDate,
      paymentStatus: "paid",
      status: "active",
    });
    if (existingBooking) {
      return res.render("book", { djName, error: "DJ is already booked on this date!", message: null });
    }

    const booking = new Booking({
      userId: req.user.id,
      djName,
      fullName,
      address,
      mobile,
      date: bookingDate,
      time,
      location,
      aadhaar,
      photo,
      notes: notes || "",
      paymentStatus: "pending",
      status: "active",
    });

    const savedBooking = await booking.save();
    const paytmDetails = await initiatePaytmPayment(savedBooking._id, dj.price, djName, req.user.id, mobile);
    res.render("paytm-checkout", { paytmDetails, bookingId: savedBooking._id, djName });
  } catch (err) {
    console.error("❌ Booking or Payment Error:", err.message);
    res.render("book", { djName, error: "Failed to initiate payment. Try again.", message: null });
  }
});

router.post("/payment-callback/:bookingId", async (req, res) => {
  const { bookingId } = req.params;
  const paytmResponse = req.body;

  try {
    const booking = await Booking.findById(bookingId);
    if (!booking) {
      return res.render("payment", {
        success: false,
        djName: "",
        amount: 0,
        bookingId,
        error: "Booking not found",
      });
    }
    const dj = await DJ.findOne({ name: booking.djName });

    const checksumVerified = await PaytmChecksum.verifySignature(
      paytmResponse,
      process.env.PAYTM_MERCHANT_KEY,
      paytmResponse.CHECKSUMHASH
    );

    if (!checksumVerified) {
      booking.paymentStatus = "failed";
      await booking.save();
      console.error("❌ Checksum verification failed for booking:", bookingId);
      return res.render("payment", {
        success: false,
        djName: booking.djName,
        amount: dj ? dj.price : 0,
        bookingId,
        error: "Payment verification failed",
      });
    }

    if (paytmResponse.STATUS === "TXN_SUCCESS") {
      booking.paymentStatus = "paid";
      await booking.save();
      await DJ.updateOne(
        { name: booking.djName },
        { $pull: { nextAvailableDates: booking.date } }
      );
      console.log("✅ Payment successful for booking:", bookingId);
      res.redirect(`/booking-confirmation/${bookingId}`);
    } else {
      booking.paymentStatus = "failed";
      await booking.save();
      console.log("❌ Payment failed for booking:", bookingId, "Status:", paytmResponse.STATUS);
      return res.render("payment", {
        success: false,
        djName: booking.djName,
        amount: dj ? dj.price : 0,
        bookingId,
        error: "Payment failed",
      });
    }
  } catch (err) {
    console.error("❌ Payment Callback Error:", err.message);
    res.render("payment", {
      success: false,
      djName: "",
      amount: 0,
      bookingId,
      error: "Server error",
    });
  }
});

router.get("/booking-confirmation/:bookingId", authenticateToken, async (req, res) => {
  const { bookingId } = req.params;
  try {
    const booking = await Booking.findById(bookingId);
    if (!booking || booking.userId.toString() !== req.user.id) {
      return res.redirect("/dashboard?error=Invalid or unauthorized booking");
    }
    res.render("booking-confirmation", { booking });
  } catch (err) {
    console.error("❌ Booking Confirmation Error:", err.message);
    res.redirect("/dashboard?error=Failed to load confirmation");
  }
});

router.get("/dj-details/:djName", authenticateToken, async (req, res) => {
  try {
    const djName = req.params.djName;
    const dj = await DJ.findOne({ name: djName });
    if (!dj) {
      return res.render("dashboard", { user: req.user, djs: [], error: "DJ not found" });
    }
    const owner = await User.findById(dj.addedBy);
    if (!owner) {
      return res.render("dashboard", { user: req.user, djs: [], error: "Owner not found" });
    }
    res.render("dj-details", { dj, owner });
  } catch (err) {
    console.error("❌ DJ Details Error:", err.message);
    res.render("dashboard", { user: req.user, djs: [], error: "Failed to load DJ details" });
  }
});

router.post("/profile/photo", authenticateToken, upload.single("photo"), async (req, res) => {
  try {
    const photo = req.file ? req.file.path : null;
    if (!photo) {
      return res.json({ error: "No photo uploaded or invalid file" });
    }
    const user = await User.findByIdAndUpdate(req.user.id, { photo }, { new: true });
    if (!user) {
      return res.json({ error: "User not found" });
    }
    req.user.photo = photo;
    console.log("✅ Photo updated for user:", user.email, "Path:", photo);
    res.json({ user, error: null, message: "Profile photo updated successfully!" });
  } catch (err) {
    console.error("❌ Profile Photo Upload Error:", err.message);
    res.json({ error: "Failed to upload photo. Try again." });
  }
});

module.exports = router;