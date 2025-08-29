const axios = require('axios');
const crypto = require('crypto');
const { Schedule, ScheduleRun, User } = require('../models');
const { deductCreditsOrThrow, COST_PER_POST_CREDITS } = require('./credits');
const { sendCreditsDepletedEmail } = require('./email');

function computeNextRun(current, cadence) {
  const d = new Date(current.getTime());
  switch (cadence) {
    case 'daily': d.setUTCDate(d.getUTCDate() + 1); break;
    case 'every_3_days': d.setUTCDate(d.getUTCDate() + 3); break;
    case 'weekly': d.setUTCDate(d.getUTCDate() + 7); break;
    case 'every_2_weeks': d.setUTCDate(d.getUTCDate() + 14); break;
    default: d.setUTCDate(d.getUTCDate() + 7);
  }
  return d;
}

function pickRandomTopic(topics) {
  if (!Array.isArray(topics) || topics.length === 0) return null;
  const idx = Math.floor(Math.random() * topics.length);
  return topics[idx];
}

function signPayload(payload) {
  const secret = process.env.N8N_WEBHOOK_SECRET || '';
  const body = JSON.stringify(payload);
  const hmac = crypto.createHmac('sha256', secret).update(body).digest('hex');
  return { signature: hmac, body };
}

async function triggerN8n(schedule, user) {
  if (!process.env.N8N_WEBHOOK_URL) {
    console.warn('N8N_WEBHOOK_URL not configured');
    return { ok: false, status: 0, data: 'Webhook URL missing' };
  }
  const topic = pickRandomTopic(schedule.topics);
  const payload = {
    event: 'schedule.run',
    schedule: { id: schedule.id, cadence: schedule.cadence },
    user: { id: user.id, linkedinId: user.linkedinId, name: user.name, email: user.email },
    // Send access token securely in body, signed
    accessToken: user.accessToken,
    topic
  };
  console.log('[SCHEDULER][TRIGGER] payload:', payload);
  const { signature, body } = signPayload(payload);
  console.log('[SCHEDULER][TRIGGER] scheduleId:', schedule.id, 'userId:', user.id, 'topic:', topic);
  const resp = await axios.post(process.env.N8N_WEBHOOK_URL, body, {
    headers: {
      'Content-Type': 'application/json',
      'X-Webhook-Secret': process.env.N8N_WEBHOOK_SECRET,
      'X-Signature': signature
    },
    timeout: 150000
  });
  return { ok: true, status: resp.status, data: resp.data };
}

async function runDueSchedules() {
  console.log('[SCHEDULER][RUN] running due schedules');
  const now = new Date();
  const due = await Schedule.findAll({
    where: { isActive: true },
    order: [['nextRunAt', 'ASC']]
  });
  // console.log('[SCHEDULER][SCAN] found:', due.length);
  for (const schedule of due) {
    if (schedule.nextRunAt > now) continue;
    console.log('[SCHEDULER][DUE] scheduleId:', schedule.id, 'nextRunAt:', schedule.nextRunAt);
    const user = await User.findByPk(schedule.userId);
    if (!user) continue;
    const run = await ScheduleRun.create({ scheduleId: schedule.id, status: 'pending' });
    const start = Date.now();
    try {
      const resp = await triggerN8n(schedule, user);
      run.status = resp.ok ? 'success' : 'failed';
      run.response = resp.data;
      run.durationMs = Date.now() - start;
      console.log('[SCHEDULER][RUN][SUCCESS] scheduleId:', schedule.id, 'durationMs:', run.durationMs, 'response:', resp.data);
      await run.save();
    } catch (err) {
      run.status = 'failed';
      run.error = err.message;
      run.durationMs = Date.now() - start;
      await run.save();
      console.error('[SCHEDULER][RUN][ERR]', err.message);
    }
    schedule.lastRunAt = new Date();
    schedule.nextRunAt = computeNextRun(schedule.nextRunAt || new Date(), schedule.cadence);
    await schedule.save();
    console.log('[SCHEDULER][RESCHEDULE] scheduleId:', schedule.id, 'nextRunAt:', schedule.nextRunAt);
  }
}

function startScheduler() {
  const intervalMs = parseInt(process.env.SCHEDULER_INTERVAL_MS || '60000', 10);
  setInterval(() => {
    runDueSchedules().catch(err => console.error('Scheduler error:', err));
  }, intervalMs);
}

async function runScheduleNow(scheduleId, userId) {
  const schedule = await Schedule.findByPk(scheduleId);
  if (!schedule || schedule.userId !== userId) {
    const err = new Error('Schedule not found');
    err.status = 404;
    throw err;
  }
  const user = await User.findByPk(userId);
  if (!user) {
    const err = new Error('User not found');
    err.status = 404;
    throw err;
  }
  const run = await ScheduleRun.create({ scheduleId: schedule.id, status: 'pending' });
  const start = Date.now();
  try {
    await deductCreditsOrThrow(user.id, COST_PER_POST_CREDITS, 'SCHEDULED_RUN', String(schedule.id), async (u) => {
      if (u.email) { try { await sendCreditsDepletedEmail(u.email, u.name || 'there'); } catch (_) {} }
    });
    const resp = await triggerN8n(schedule, user);
    run.status = resp.ok ? 'success' : 'failed';
    run.response = resp.data;
    run.durationMs = Date.now() - start;
    await run.save();
    return { ok: resp.ok, status: resp.status, data: resp.data };
  } catch (err) {
    run.status = 'failed';
    run.error = err.message;
    run.durationMs = Date.now() - start;
    await run.save();
    throw err;
  }
}

module.exports = { startScheduler, runScheduleNow };


