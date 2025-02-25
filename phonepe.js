const axios = require("axios");
const crypto = require("crypto");

async function initiatePhonePePayment(bookingId, amount, userId, mobile) {
  const merchantId = process.env.PHONEPE_MERCHANT_ID;
  const saltKey = process.env.PHONEPE_SALT_KEY;
  const saltIndex = process.env.PHONEPE_SALT_INDEX || "1";
  const apiUrl = process.env.PHONEPE_API_URL || "https://api-preprod.phonepe.com/apis/pg-sandbox"; // Default to sandbox

  if (!merchantId || !saltKey) {
    throw new Error("PhonePe credentials (MERCHANT_ID or SALT_KEY) are missing in environment variables");
  }

  const transactionId = `TX${bookingId.toString().slice(0, 12)}${Date.now().toString().slice(-8)}`; // Fixed line
  const baseUrl = process.env.NODE_ENV === "production" ? "https://dj-booking.onrender.com" : "http://localhost:3000";
  const payload = {
    merchantId: merchantId,
    merchantTransactionId: transactionId,
    merchantUserId: userId,
    amount: amount * 100, // Convert to paise
    redirectUrl: `${baseUrl}/payment-callback/${bookingId}`,
    redirectMode: "REDIRECT",
    callbackUrl: `${baseUrl}/payment-callback/${bookingId}`,
    mobileNumber: mobile || "9999999999", // Fallback mobile
    paymentInstrument: { type: "PAY_PAGE" },
  };

  const payloadString = Buffer.from(JSON.stringify(payload)).toString("base64");
  const stringToHash = payloadString + "/pg/v1/pay" + saltKey;
  const hash = crypto.createHash("sha256").update(stringToHash).digest("hex");
  const xVerify = `${hash}###${saltIndex}`;

  try {
    const response = await axios.post(
      `${apiUrl}/pg/v1/pay`,
      { request: payloadString },
      {
        headers: {
          "Content-Type": "application/json",
          "X-VERIFY": xVerify,
          "X-MERCHANT-ID": merchantId,
        },
      }
    );
    console.log("PhonePe API Response:", response.data); // Debug log
    if (!response.data.success || !response.data.data.instrumentResponse.redirectInfo.url) {
      throw new Error("Invalid response from PhonePe: " + JSON.stringify(response.data));
    }
    return response.data.data.instrumentResponse.redirectInfo.url;
  } catch (err) {
    console.error("❌ PhonePe API Error:", err.response ? err.response.data : err.message);
    throw new Error("Failed to initiate PhonePe payment");
  }
}

module.exports = { initiatePhonePePayment };