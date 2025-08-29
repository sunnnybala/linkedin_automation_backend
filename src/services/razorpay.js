const Razorpay = require('razorpay');

function getClient() {
  const key_id = process.env.RAZORPAY_KEY_ID;
  const key_secret = process.env.RAZORPAY_KEY_SECRET;
  if (!key_id || !key_secret) throw new Error('Missing Razorpay credentials');
  const client = new Razorpay({ key_id, key_secret });
  // minimal log to confirm client creation
  if (process.env.NODE_ENV !== 'production') {
    console.log('[RZP][CLIENT] initialized');
  }
  return client;
}

async function createOrder({ amountInPaise, receipt, notes }) {
  const client = getClient();
  console.log('[RZP][ORDER][CREATE][REQ]', { amountInPaise, receipt, notes });
  const order = await client.orders.create({ amount: amountInPaise, currency: 'INR', receipt, notes, payment_capture: 1 });
  console.log('[RZP][ORDER][CREATE][RES]', { id: order.id, amount: order.amount, currency: order.currency, status: order.status });
  return order; // { id, amount, currency, status }
}

module.exports = { createOrder };


