const PaytmChecksum = require("paytmchecksum");

async function initiatePaytmPayment(bookingId, amount, djName, userId, mobile) {
  const mid = process.env.PAYTM_MID;
  const merchantKey = process.env.PAYTM_MERCHANT_KEY;
  const website = process.env.PAYTM_WEBSITE || "WEBSTAGING";
  const channelId = process.env.PAYTM_CHANNEL_ID || "WEB";
  const industryType = process.env.PAYTM_INDUSTRY_TYPE_ID || "Retail";
  const callbackUrl = process.env.PAYTM_CALLBACK_URL || "http://localhost:3000/payment-callback/";

  console.log("Paytm MID:", mid);
  console.log("Paytm Merchant Key:", merchantKey); // Debug the key

  if (!mid || !merchantKey) {
    throw new Error("Paytm credentials (MID or MERCHANT_KEY) are missing in environment variables");
  }
  if (merchantKey.length !== 16) {
    throw new Error(`Invalid Merchant Key length: ${merchantKey.length}. Expected 16 characters.`);
  }

  const orderId = `ORDER_${bookingId}_${Date.now()}`;
  const paytmParams = {
    requestType: "Payment",
    mid: mid,
    websiteName: website,
    industryTypeId: industryType,
    channelId: channelId,
    orderId: orderId,
    amount: amount.toFixed(2),
    callbackUrl: `${callbackUrl}${bookingId}`,
    txnDate: new Date().toISOString().split("T")[0],
    mobileNo: mobile || "9999999999",
    email: "customer@example.com",
  };

  try {
    const checksum = await PaytmChecksum.generateSignature(
      JSON.stringify(paytmParams),
      merchantKey
    );
    paytmParams.checksum = checksum;

    console.log("Paytm Payment Initiation Params:", paytmParams);
    return {
      url: "https://securegw-stage.paytm.in/theia/processTransaction",
      params: paytmParams,
    };
  } catch (err) {
    console.error("❌ Paytm Checksum Error Details:", err.message);
    throw new Error("Failed to initiate Paytm payment: " + err.message);
  }
}

module.exports = { initiatePaytmPayment };