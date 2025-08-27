const express = require('express');
const router = express.Router();
const { Post } = require('../models');

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
        break;
        
      case 'post.failed':
        post.status = 'failed';
        post.metadata = {
          ...post.metadata,
          error: error || 'Unknown error',
          lastAttempt: new Date()
        };
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
    res.json({ success: true, post });
  } catch (error) {
    console.error('Webhook error:', error);
    next(error);
  }
});

// Health check endpoint for n8n
router.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date() });
});

module.exports = router;
