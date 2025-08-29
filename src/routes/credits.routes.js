const express = require('express');
const router = express.Router();
const { Payment, CreditLedger } = require('../models');
const { createOrder } = require('../services/razorpay');
const crypto = require('crypto');

// Helpers
function rupeesToPaise(rupees) { return Math.round(Number(rupees) * 100); }
function creditsFromAmountPaise(amountPaise) { return Math.floor(amountPaise / 1000); }

// Create Razorpay order (minimum ₹50)
router.post('/order', async (req, res, next) => {
  try {
    const { amount } = req.body; // rupees
    const parsedAmount = Math.round(Number(amount));
    if (!parsedAmount || parsedAmount < 50) {
      return res.status(400).json({ error: 'Minimum purchase is ₹50' });
    }

    const amountPaise = rupeesToPaise(parsedAmount);
    const credits = creditsFromAmountPaise(amountPaise);
    if (credits <= 0) {
      return res.status(400).json({ error: 'Amount too low for credits' });
    }

    const receipt = `user_${req.user.id}_${Date.now()}`;
    console.log('[RZP][ORDER][INIT]', { userId: req.user.id, amountPaise, credits, receipt });
    const order = await createOrder({ amountInPaise: amountPaise, receipt, notes: { userId: String(req.user.id), credits: String(credits) } });

    await Payment.create({
      userId: req.user.id,
      gatewayRequestId: order.id,
      gatewayPaymentId: `${order.id}:pending`,
      amountInPaise: amountPaise,
      status: 'created',
      creditsGranted: 0,
      currency: 'INR'
    });
    console.log('[RZP][ORDER][RECORDED]', { orderId: order.id, userId: req.user.id, amountPaise });
    return res.json({ orderId: order.id, amount: order.amount, currency: order.currency, keyId: process.env.RAZORPAY_KEY_ID });
  } catch (err) {
    console.error('[RZP][ORDER][ERR]', err.message);
    next(err);
  }
});

// Get current balance
router.get('/balance', async (req, res) => {
  res.json({ balance: req.user.creditBalance });
});

// List transactions (ledger)
router.get('/transactions', async (req, res, next) => {
  try {
    const { limit = 20, offset = 0 } = req.query;
    const parsedLimit = Math.min(Math.max(parseInt(limit, 10) || 20, 1), 100);
    const parsedOffset = Math.max(parseInt(offset, 10) || 0, 0);
    const rows = await CreditLedger.findAll({
      where: { userId: req.user.id },
      order: [['createdAt','DESC']],
      limit: parsedLimit,
      offset: parsedOffset
    });
    res.json({ items: rows });
  } catch (err) {
    next(err);
  }
});

// Verify Razorpay signature (client callback)
router.post('/verify', async (req, res, next) => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body || {};
    console.log('[RZP][VERIFY][REQ]', { razorpay_order_id, razorpay_payment_id });
    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return res.status(400).json({ error: 'Invalid payment verification data' });
    }
    const secret = process.env.RAZORPAY_KEY_SECRET;
    const expected = crypto
      .createHmac('sha256', secret)
      .update(razorpay_order_id + '|' + razorpay_payment_id)
      .digest('hex');
    if (expected !== razorpay_signature) {
      console.warn('[RZP][VERIFY][SIG_MISMATCH]', { expected, provided: razorpay_signature });
      return res.status(400).json({ error: 'Invalid signature' });
    }

    // Mark Payment with prelim info; credits are added on webhook only
    const payment = await Payment.findOne({ where: { gatewayRequestId: razorpay_order_id } });
    if (payment) {
      payment.gatewayPaymentId = razorpay_payment_id;
      payment.rawPayload = { razorpay_order_id, razorpay_payment_id, razorpay_signature };
      await payment.save();
      console.log('[RZP][VERIFY][RECORDED]', { orderId: razorpay_order_id, paymentId: razorpay_payment_id });
    }

    return res.json({ ok: true });
  } catch (err) {
    console.error('[RZP][VERIFY][ERR]', err.message);
    next(err);
  }
});

module.exports = router;


