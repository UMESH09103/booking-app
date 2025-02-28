const PaytmChecksum = require("paytmchecksum");

async function initiatePaytmPayment(bookingId, amount, djName, userId, mobile) {
  const mid = process.env.PAYTM_MID;
  const merchantKey = process.env.PAYTM_MERCHANT_KEY;
  const website = process.env.PAYTM_WEBSITE || "WEBSTAGING";
  const channelId = process.env.PAYTM_CHANNEL_ID || "WEB";
  const industryType = process.env.PAYTM_INDUSTRY_TYPE_ID || "Retail";
  const callbackUrl = process.env.PAYTM_CALLBACK_URL || "http://localhost:3000/payment-callback/";

  if (!mid || !merchantKey) {
    throw new Error("Paytm credentials (MID or MERCHANT_KEY) are missing in environment variables");
  }

  const orderId = `ORDER_${bookingId}_${Date.now()}`;
  const paytmParams = {
    requestType: "Payment",
    mid: mid,
    websiteName: website,
    industryTypeId: industryType,
    channelId: channelId,
    orderId: orderId,
    amount: amount.toFixed(2), // Amount in INR
    callbackUrl: `${callbackUrl}${bookingId}`,
    txnDate: new Date().toISOString().split("T")[0], // YYYY-MM-DD
    mobileNo: mobile || "9999999999",
    email: "customer@example.com", // Optional, can be dynamic
  };

  try {
    const checksum = await PaytmChecksum.generateSignature(
      JSON.stringify(paytmParams),
      merchantKey
    );
    paytmParams.checksum = checksum;

    console.log("Paytm Payment Initiation Params:", paytmParams);

    // Return params for client-side redirect
    return {
      url: "https://securegw-stage.paytm.in/theia/processTransaction", // Sandbox URL
      params: paytmParams,
    };
  } catch (err) {
    console.error("❌ Paytm Checksum Error:", err.message);
    throw new Error("Failed to initiate Paytm payment: " + err.message);
  }
}

module.exports = { initiatePaytmPayment };