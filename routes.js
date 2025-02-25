const express = require("express");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const User = require("./models/user");
const Booking = require("./models/booking");
const DJ = require("./models/dj");
const { initiatePhonePePayment } = require("./phonepe"); // Import PhonePe logic

const router = express.Router();

// Authentication Middleware
function authenticateToken(req, res, next) {
  const token = req.cookies.token;
  if (!token) return res.redirect("/login");
  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err) return res.redirect("/login");
    req.user = user; // Already has user.id and email from token
    // Fetch user from DB to get role
    User.findById(user.id)
      .then(dbUser => {
        if (!dbUser) return res.redirect("/login");
        req.user.role = dbUser.role; // Add role to req.user
        next();
      })
      .catch(err => {
        console.error("❌ User Fetch Error:", err.message);
        res.redirect("/login");
      });
  });
}

// Landing Page
router.get("/", (req, res) => {
  const token = req.cookies.token;
  let user = null;
  if (token) {
    try {
      user = jwt.verify(token, process.env.JWT_SECRET);
    } catch (err) {
      // Invalid token, ignore
    }
  }
  res.render("landing", { user });
});

// Register Page
router.get("/register", (req, res) => {
  res.render("register", { error: null, message: null });
});

// Handle User Registration
router.post("/register", async (req, res) => {
  const { username, email, password, age, role } = req.body; // Add role to form data
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
    await User.create({ username, email, password: hash, age, role: role || "user" }); // Default to "user" if not provided
    res.render("register", { error: null, message: "Account created successfully! Redirecting to login..." });
  } catch (err) {
    console.error("❌ Registration Error:", err.message);
    res.render("register", { error: "Internal server error", message: null });
  }
});

// Login Page
router.get("/login", (req, res) => {
  res.render("login", { message: null, error: null });
});

// Handle User Login
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

// Dashboard Page
router.get("/dashboard", authenticateToken, async (req, res) => {
  try {
    const djs = await DJ.find();
    res.render("dashboard", { user: req.user, djs, error: null });
  } catch (err) {
    console.error("❌ Dashboard Error:", err.message);
    res.render("dashboard", { user: req.user, djs: [], error: "Failed to load DJs" });
  }
});

// Profile Page
router.get("/profile", authenticateToken, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    res.render("profile", { user });
  } catch (err) {
    console.error("❌ Profile Error:", err.message);
    res.redirect("/login");
  }
});

// Logout Route
router.post("/logout", (req, res) => {
  res.clearCookie("token");
  res.redirect("/login");
});

// Add DJ Page (GET) - Restricted to admins
router.get("/add-dj", authenticateToken, (req, res) => {
  if (req.user.role !== "admin") {
    return res.redirect("/dashboard?error=Unauthorized access");
  }
  res.render("add-dj", { error: null, message: null });
});

// Handle Add DJ Submission (POST) - Restricted to admins
router.post("/add-dj", authenticateToken, async (req, res) => {
  if (req.user.role !== "admin") {
    return res.redirect("/dashboard?error=Unauthorized access");
  }
  const { name, genre, experience, price, sinceYear, nextAvailableDates, ownerName, mobile, address, restrictions } = req.body;
  const photo = req.files && req.files.photo ? `/images/${req.files.photo[0].filename}` : null;
  const ownerPhoto = req.files && req.files.ownerPhoto ? `/images/${req.files.ownerPhoto[0].filename}` : null;

  try {
    if (!name || !genre || !experience || !price || !sinceYear || !ownerName || !mobile || !address) {
      return res.render("add-dj", { error: "All fields except photo, owner photo, next available dates, and restrictions are required!", message: null });
    }
    if (!/^\d{10}$/.test(mobile)) {
      return res.render("add-dj", { error: "Mobile number must be 10 digits!", message: null });
    }

    const dj = new DJ({
      name,
      genre,
      experience: parseInt(experience),
      price: parseInt(price),
      sinceYear: parseInt(sinceYear),
      nextAvailableDates,
      ownerName,
      mobile,
      address,
      restrictions,
      photo,
      ownerPhoto,
      addedBy: req.user.id,
    });

    await dj.save();
    res.render("add-dj", { error: null, message: "DJ added successfully! Redirecting to dashboard..." });
  } catch (err) {
    console.error("❌ Add DJ Error:", err.message);
    res.render("add-dj", { error: "Failed to add DJ. Try again.", message: null });
  }
});

// Booking Page (GET)
router.get("/book/:djName", authenticateToken, (req, res) => {
  const djName = req.params.djName;
  res.render("book", { djName, error: null, message: null });
});

// Handle Booking Submission (POST)
router.post("/book/:djName", authenticateToken, async (req, res) => {
  const djName = req.params.djName;
  const { fullName, address, mobile, date, time, location, aadhaar, notes } = req.body;
  const photo = req.file ? `/images/${req.file.filename}` : null;

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

    const booking = new Booking({
      userId: req.user.id,
      djName,
      fullName,
      address,
      mobile,
      date: new Date(date),
      time,
      location,
      aadhaar,
      photo,
      notes: notes || "",
    });

    const savedBooking = await booking.save();
    const dj = await DJ.findOne({ name: djName });
    if (!dj) {
      return res.render("book", { djName, error: "DJ not found", message: null });
    }

    // Initiate PhonePe payment
    const paymentUrl = await initiatePhonePePayment(savedBooking._id, dj.price, req.user.id, mobile);
    console.log("Redirecting to PhonePe URL:", paymentUrl); // Debug log
    res.redirect(paymentUrl);
  } catch (err) {
    console.error("❌ Booking or Payment Error:", err.message);
    res.render("book", { djName, error: "Failed to initiate payment. Try again.", message: null });
  }
});

// Payment Page (GET) - For collecting payment details
router.get("/payment/:bookingId", authenticateToken, async (req, res) => {
  const { bookingId } = req.params;
  try {
    const booking = await Booking.findById(bookingId);
    if (!booking) {
      return res.render("payment", { djName: "", amount: 0, bookingId, error: "Booking not found" });
    }
    const dj = await DJ.findOne({ name: booking.djName });
    if (!dj) {
      return res.render("payment", { djName: booking.djName, amount: 0, bookingId, error: "DJ not found" });
    }
    res.render("payment", { djName: booking.djName, amount: dj.price, bookingId, error: null });
  } catch (err) {
    console.error("❌ Payment Page Error:", err.message);
    res.render("payment", { djName: "", amount: 0, bookingId, error: "Internal server error" });
  }
});

// Handle Payment Submission (POST) - Mock implementation (replace with actual PhonePe integration)
router.post("/payment/:bookingId", authenticateToken, async (req, res) => {
  const { bookingId } = req.params;
  const { paymentMethod, cardNumber, expiry, cvv, upiId, bank } = req.body;

  try {
    const booking = await Booking.findById(bookingId);
    if (!booking) {
      return res.render("payment", { djName: "", amount: 0, bookingId, error: "Booking not found" });
    }
    const dj = await DJ.findOne({ name: booking.djName });
    if (!dj) {
      return res.render("payment", { djName: booking.djName, amount: 0, bookingId, error: "DJ not found" });
    }

    // Mock payment processing (replace with actual PhonePe integration)
    let paymentSuccess = false;
    if (paymentMethod === "card" && cardNumber && expiry && cvv) {
      // Validate card details (simplified)
      paymentSuccess = true; // Mock success for testing
    } else if (paymentMethod === "upi" && upiId) {
      paymentSuccess = true; // Mock success for testing
    } else if (paymentMethod === "netbanking" && bank) {
      paymentSuccess = true; // Mock success for testing
    }

    if (paymentSuccess) {
      // In production, integrate with PhonePe or other payment gateway here
      console.log("Payment processed successfully for booking:", bookingId);
      res.render("payment", { success: true, djName: booking.djName, amount: dj.price, bookingId });
    } else {
      res.render("payment", { success: false, djName: booking.djName, amount: dj.price, bookingId, error: "Payment failed. Please check your details." });
    }
  } catch (err) {
    console.error("❌ Payment Processing Error:", err.message);
    res.render("payment", { success: false, djName: "", amount: 0, bookingId, error: "Internal server error" });
  }
});

// Payment Callback Route (after PhonePe redirect)
router.get("/payment-callback/:bookingId", async (req, res) => {
  const { bookingId } = req.params;
  try {
    const booking = await Booking.findById(bookingId);
    if (!booking) {
      return res.render("payment", { success: false, djName: "", amount: 0, bookingId });
    }
    // TODO: Verify payment status with PhonePe /pg/v1/status API in production
    console.log("Payment callback for booking:", bookingId); // Debug log
    const dj = await DJ.findOne({ name: booking.djName });
    res.render("payment", { success: true, djName: booking.djName, amount: dj ? dj.price : 0, bookingId });
  } catch (err) {
    console.error("❌ Payment Callback Error:", err.message);
    res.render("payment", { success: false, djName: "", amount: 0, bookingId });
  }
});

// DJ Details Page
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

module.exports = router;