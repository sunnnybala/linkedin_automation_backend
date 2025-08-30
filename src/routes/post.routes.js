const express = require('express');
const router = express.Router();
const { Post, User } = require('../models');
const { deductCreditsOrThrow, COST_PER_POST_CREDITS } = require('../services/credits');
const { sendCreditsDepletedEmail } = require('../services/email');
const axios = require('axios');

// Create a new post
router.post('/', async (req, res, next) => {
  try {
    const { content, scheduledAt } = req.body;
    
    // Deduct credits for immediate publish (no schedule)
    if (!scheduledAt) {
      await deductCreditsOrThrow(req.user.id, COST_PER_POST_CREDITS, 'POST', undefined, async (user) => {
        if (user.email) {
          try { await sendCreditsDepletedEmail(user.email, user.name || 'there'); } catch (_) {}
        }
      });
    }

    const post = await Post.create({
      content,
      userId: req.user.id,
      status: scheduledAt ? 'scheduled' : 'draft',
      scheduledAt: scheduledAt || null,
      metadata: {}
    });

    // If post is not scheduled, trigger n8n workflow immediately
    if (!scheduledAt) {
      console.log('[POSTS][TRIGGER][START]', { postId: post.id, userId: req.user.id });
      await triggerN8nWorkflow(post, req.user);
      console.log('[POSTS][TRIGGER][DONE]', { postId: post.id });
    }

    res.status(201).json(post);
  } catch (error) {
    next(error);
  }
});

// Get all posts for the authenticated user
router.get('/', async (req, res, next) => {
  try {
    const { status, limit = 10, offset = 0 } = req.query;
    const where = { userId: req.user.id };
    
    if (status) {
      where.status = status;
    }

    const parsedLimit = Math.min(Math.max(parseInt(limit, 10) || 10, 1), 100);
    const parsedOffset = Math.max(parseInt(offset, 10) || 0, 0);

    const posts = await Post.findAndCountAll({
      where,
      order: [['createdAt', 'DESC']],
      limit: parsedLimit,
      offset: parsedOffset
    });

    res.json({
      total: posts.count,
      items: posts.rows
    });
  } catch (error) {
    next(error);
  }
});

// Get a single post
router.get('/:id', async (req, res, next) => {
  try {
    const post = await Post.findOne({
      where: {
        id: req.params.id,
        userId: req.user.id
      }
    });

    if (!post) {
      return res.status(404).json({ error: 'Post not found' });
    }

    res.json(post);
  } catch (error) {
    next(error);
  }
});

// Update a post
router.put('/:id', async (req, res, next) => {
  try {
    const { content, status, scheduledAt } = req.body;
    
    const post = await Post.findOne({
      where: {
        id: req.params.id,
        userId: req.user.id
      }
    });

    if (!post) {
      return res.status(404).json({ error: 'Post not found' });
    }

    // Update post fields
    if (Object.prototype.hasOwnProperty.call(req.body, 'content')) post.content = content;
    if (Object.prototype.hasOwnProperty.call(req.body, 'status')) post.status = status;
    if (Object.prototype.hasOwnProperty.call(req.body, 'scheduledAt')) post.scheduledAt = scheduledAt;
    
    await post.save();

    // If post is being published now, trigger n8n workflow
    if (status === 'published') {
      await deductCreditsOrThrow(req.user.id, COST_PER_POST_CREDITS, 'POST', String(post.id), async (user) => {
        if (user.email) {
          try { await sendCreditsDepletedEmail(user.email, user.name || 'there'); } catch (_) {}
        }
      });
      const user = await User.findByPk(req.user.id);
      console.log('[POSTS][TRIGGER][START]', { postId: post.id, userId: user.id });
      await triggerN8nWorkflow(post, user);
      console.log('[POSTS][TRIGGER][DONE]', { postId: post.id });
    }

    res.json(post);
  } catch (error) {
    next(error);
  }
});

// Delete a post
router.delete('/:id', async (req, res, next) => {
  try {
    const post = await Post.findOne({
      where: {
        id: req.params.id,
        userId: req.user.id
      }
    });

    if (!post) {
      return res.status(404).json({ error: 'Post not found' });
    }

    await post.destroy();
    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

// Publish a post immediately
router.post('/:id/publish', async (req, res, next) => {
  try {
    const post = await Post.findOne({
      where: {
        id: req.params.id,
        userId: req.user.id
      }
    });

    if (!post) {
      return res.status(404).json({ error: 'Post not found' });
    }

    // Update post status
    post.status = 'published';
    post.publishedAt = new Date();
    await post.save();

    // Trigger n8n workflow
    await deductCreditsOrThrow(req.user.id, COST_PER_POST_CREDITS, 'POST', String(post.id), async (user) => {
      if (user.email) {
        try { await sendCreditsDepletedEmail(user.email, user.name || 'there'); } catch (_) {}
      }
    });
    const user = await User.findByPk(req.user.id);
    await triggerN8nWorkflow(post, user);

    res.json(post);
  } catch (error) {
    next(error);
  }
});

// Helper function to trigger n8n workflow
async function triggerN8nWorkflow(post, user) {
  if (!process.env.N8N_WEBHOOK_URL) {
    console.warn('N8N_WEBHOOK_URL not configured');
    return;
  }

  try {
    const payload = {
      event: 'post.publish',
      post: {
        id: post.id,
        content: post.content,
        status: post.status,
        scheduledAt: post.scheduledAt,
        publishedAt: post.publishedAt
      },
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        accessToken: user.accessToken
      }
    };
    console.log('[POSTS][TRIGGER][PAYLOAD]', payload);
    const response = await axios.post(process.env.N8N_WEBHOOK_URL, payload, {
      headers: {
        'Content-Type': 'application/json',
        'X-Webhook-Secret': process.env.N8N_WEBHOOK_SECRET
      }
    });
    console.log('[POSTS][TRIGGER][RESP]', { status: response.status, data: response.data });
  } catch (error) {
    console.error('Error triggering n8n workflow:', error.message);
    throw error;
  }
}

module.exports = router;
