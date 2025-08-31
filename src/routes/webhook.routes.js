const express = require('express');
const router = express.Router();
const { Post, Payment, User, CreditLedger } = require('../models');
const { addCredits, deductCreditsOrThrow, COST_PER_POST_CREDITS } = require('../services/credits');

// Middleware to verify webhook secret (timing-safe)
const crypto = require('crypto');
const verifyWebhook = (req, res, next) => {
  const headerSecret = req.headers['x-webhook-secret'];
  const expectedSecret = process.env.N8N_WEBHOOK_SECRET;

  if (!expectedSecret) {
    return res.status(500).json({ error: 'Server misconfigured' });
  }

  if (typeof headerSecret !== 'string') {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const a = Buffer.from(headerSecret);
  const b = Buffer.from(expectedSecret);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  next();
};

// Webhook endpoint for n8n callbacks
router.post('/n8n', verifyWebhook, async (req, res, next) => {
  try {
    console.log('[WEBHOOK][N8N][RX]', { headers: req.headers, body: req.body });
    const { event, postId, status, error, linkedInPostId } = req.body;
    
    if (!event || !postId) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Find the post
    const post = await Post.findByPk(postId);
    if (!post) {
      return res.status(404).json({ error: 'Post not found' });
    }

    // Update post based on the event
    switch (event) {
      case 'post.published':
        post.status = 'published';
        post.publishedAt = new Date();
        post.linkedInPostId = linkedInPostId || null;
        // Credits are now deducted at trigger-time; do not charge here
        break;
        
      case 'post.failed':
        post.status = 'failed';
        post.metadata = {
          ...post.metadata,
          error: error || 'Unknown error',
          lastAttempt: new Date()
        };
        // If any previous deduction happened by mistake, we could refund here.
        // Policy: currently we only charge on success, so no refund needed.
        break;
        
      case 'post.updated':
        post.linkedInPostId = linkedInPostId || post.linkedInPostId;
        post.metadata = {
          ...post.metadata,
          lastUpdated: new Date()
        };
        break;
        
      default:
        return res.status(400).json({ error: 'Invalid event type' });
    }

    await post.save();
    console.log('[WEBHOOK][N8N][OK]', { postId: post.id, status: post.status });
    res.json({ success: true, post });
  } catch (error) {
    console.error('[WEBHOOK][N8N][ERR]', error);
    next(error);
  }
});

// Health check endpoint for n8n
router.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date() });
});

// Razorpay webhook
router.post('/razorpay', async (req, res, next) => {
  try {
    const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
    if (!secret) return res.status(500).json({ error: 'Server misconfigured' });
    console.log('[RZP][WEBHOOK][RX]', { headers: req.headers, body: req.body });
    const crypto = require('crypto');
    const signature = req.headers['x-razorpay-signature'];
    if (typeof signature !== 'string') return res.status(401).json({ error: 'Unauthorized' });

    const raw = Buffer.isBuffer(req.body) ? req.body : Buffer.from(req.body || '');
    const expected = crypto.createHmac('sha256', secret).update(raw).digest('hex');
    const a = Buffer.from(signature, 'utf8');
    const b = Buffer.from(expected, 'utf8');
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
      console.warn('[RZP][WEBHOOK][SIG_MISMATCH]');
      return res.status(401).json({ error: 'Invalid signature' });
    }
    console.log('[RZP][WEBHOOK][SIG_OK]');
    const payload = JSON.parse(raw.toString('utf8'));
    console.log('[RZP][WEBHOOK][PAYLOAD]', payload);
    const event = payload?.event;
    const entity = payload?.payload?.payment?.entity || payload?.payload?.order?.entity;
    const orderId = entity?.order_id || payload?.payload?.order?.entity?.id;
    const paymentId = entity?.id;
    const amountPaise = entity?.amount || payload?.payload?.order?.entity?.amount;
    if (process.env.NODE_ENV === 'development') {
      console.log('[RZP][WEBHOOK][RX]', { event, orderId, paymentId, amountPaise });
    }
    if (!orderId || !amountPaise) return res.status(400).json({ error: 'Invalid payload' });

    let payment = await Payment.findOne({ where: { gatewayRequestId: orderId } });
    if (!payment && paymentId) payment = await Payment.findOne({ where: { gatewayPaymentId: paymentId } });
    if (!payment) return res.status(404).json({ error: 'Payment record not found' });

    if (payment.status === 'success') {
      if (process.env.NODE_ENV === 'development') {
        console.log('[RZP][WEBHOOK][IDEMPOTENT]', { orderId, paymentId });
      }
      return res.json({ ok: true });
    }

    payment.rawPayload = payload;
    payment.webhookVerifiedAt = new Date();
    if (paymentId) payment.gatewayPaymentId = paymentId;

    if (event === 'payment.captured' || event === 'order.paid' || entity?.status === 'captured' || entity?.status === 'paid') {
      payment.status = 'success';
      const credits = Math.floor((amountPaise || payment.amountInPaise) / 1000);
      payment.creditsGranted = credits;
      await payment.save();
      await addCredits(payment.userId, credits, 'PURCHASE', payment.gatewayPaymentId || paymentId || orderId, `Razorpay ₹${((amountPaise||payment.amountInPaise)/100).toFixed(2)}`);
      if (process.env.NODE_ENV === 'development') {
        console.log('[RZP][WEBHOOK][CREDITED]', { userId: payment.userId, credits, orderId, paymentId });
      }
    } else if (event && /failed|refunded/.test(event)) {
      payment.status = 'failed';
      await payment.save();
      console.warn('[RZP][WEBHOOK][FAILED]', { orderId, paymentId, event });
    } else {
      await payment.save();
    }

    return res.json({ ok: true });
  } catch (err) {
    console.error('[RZP][WEBHOOK][ERR]', err.message);
    next(err);
  }
});

// n8n posts webhook
// Move export to the end after all routes are declared
module.exports = router;
