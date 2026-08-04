declare module 'react-native-razorpay' {
  export type RazorpayCheckoutOptions = {
    amount: number;
    currency: string;
    description: string;
    key: string;
    name: string;
    order_id: string;
    prefill?: {
      email?: string;
      name?: string;
    };
    theme?: {
      color: string;
    };
  };

  export type RazorpayPaymentSuccess = {
    razorpay_order_id: string;
    razorpay_payment_id: string;
    razorpay_signature: string;
  };

  export type RazorpayPaymentError = {
    code?: number;
    description?: string;
  };

  const RazorpayCheckout: {
    open(options: RazorpayCheckoutOptions): Promise<RazorpayPaymentSuccess>;
  };

  export default RazorpayCheckout;
}
