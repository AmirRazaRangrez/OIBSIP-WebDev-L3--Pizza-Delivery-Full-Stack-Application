const Razorpay = require('razorpay');

let razorpayInstance = null;

const getRazorpayInstance = () => {
  if (!razorpayInstance) {
    const keyId = process.env.RAZORPAY_KEY_ID || 'rzp_test_Twlntm5UkURGg0';
    const keySecret = process.env.RAZORPAY_KEY_SECRET || 'FXnUylflZOnGsE4zoexrkIuv';

    razorpayInstance = new Razorpay({
      key_id: keyId,
      key_secret: keySecret
    });
  }
  return razorpayInstance;
};

module.exports = {
  getRazorpayInstance
};
