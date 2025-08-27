const express = require('express');
const router = express.Router();
const { Schedule } = require('../models');
const { runScheduleNow } = require('../services/scheduler');

// Create a schedule
router.post('/', async (req, res, next) => {
  try {
    const { topics, cadence, timezone } = req.body;
    console.log('[SCHEDULE][CREATE] userId:', req.user.id, 'payload:', { cadence, timezone, topicsCount: Array.isArray(topics) ? topics.length : 0 });
    if (!Array.isArray(topics) || topics.length === 0) {
      return res.status(400).json({ error: 'topics must be a non-empty array' });
    }
    const allowed = ['daily','every_3_days','weekly','every_2_weeks'];
    if (!allowed.includes(cadence)) {
      return res.status(400).json({ error: 'invalid cadence' });
    }
    if (!timezone || typeof timezone !== 'string') {
      return res.status(400).json({ error: 'timezone is required' });
    }

    const now = new Date();
    const nextRunAt = now; // First run ASAP; can refine with preferred hour

    const schedule = await Schedule.create({
      userId: req.user.id,
      topics,
      cadence,
      timezone,
      nextRunAt,
      isActive: true,
      metadata: {}
    });
    console.log('[SCHEDULE][CREATE][OK] id:', schedule.id);
    res.status(201).json(schedule);
  } catch (err) {
    console.error('[SCHEDULE][CREATE][ERR]', err);
    next(err);
  }
});

// List my schedules
router.get('/', async (req, res, next) => {
  try {
    console.log('[SCHEDULE][LIST] userId:', req.user.id);
    const items = await Schedule.findAll({ where: { userId: req.user.id }, order: [['createdAt','DESC']] });
    console.log('[SCHEDULE][LIST][OK] count:', items.length);
    res.json({ items });
  } catch (err) {
    console.error('[SCHEDULE][LIST][ERR]', err);
    next(err);
  }
});

// Update a schedule
router.put('/:id', async (req, res, next) => {
  try {
    const schedule = await Schedule.findOne({ where: { id: req.params.id, userId: req.user.id } });
    if (!schedule) return res.status(404).json({ error: 'Schedule not found' });

    const { topics, cadence, timezone, isActive, nextRunAt } = req.body;
    if (Array.isArray(topics)) schedule.topics = topics;
    const allowed = ['daily','every_3_days','weekly','every_2_weeks'];
    if (cadence && allowed.includes(cadence)) schedule.cadence = cadence;
    if (typeof timezone === 'string') schedule.timezone = timezone;
    if (typeof isActive === 'boolean') schedule.isActive = isActive;
    if (nextRunAt) schedule.nextRunAt = new Date(nextRunAt);

    await schedule.save();
    console.log('[SCHEDULE][UPDATE][OK] id:', schedule.id);
    res.json(schedule);
  } catch (err) {
    console.error('[SCHEDULE][UPDATE][ERR]', err);
    next(err);
  }
});

// Delete a schedule
router.delete('/:id', async (req, res, next) => {
  try {
    const schedule = await Schedule.findOne({ where: { id: req.params.id, userId: req.user.id } });
    if (!schedule) return res.status(404).json({ error: 'Schedule not found' });
    await schedule.destroy();
    console.log('[SCHEDULE][DELETE][OK] id:', req.params.id);
    res.status(204).send();
  } catch (err) {
    console.error('[SCHEDULE][DELETE][ERR]', err);
    next(err);
  }
});

module.exports = router;

// Run now endpoint
router.post('/:id/run', async (req, res, next) => {
  try {
    console.log('[SCHEDULE][RUN_NOW] userId:', req.user.id, 'scheduleId:', req.params.id);
    const result = await runScheduleNow(req.params.id, req.user.id);
    console.log('[SCHEDULE][RUN_NOW][OK]');
    res.json({ success: result.ok, data: result.data });
  } catch (err) {
    console.error('[SCHEDULE][RUN_NOW][ERR]', err);
    next(err);
  }
});


