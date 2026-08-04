module.exports = {
  open: () => Promise.resolve({
    razorpay_order_id: 'order_test',
    razorpay_payment_id: 'pay_test',
    razorpay_signature: 'signature_test',
  }),
};
