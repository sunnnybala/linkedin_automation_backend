const { sequelize, User, CreditLedger } = require('../models');

const COST_PER_POST_CREDITS = 1; // 1 credit per post/run

async function addCredits(userId, credits, reason, referenceId, notes) {
  return sequelize.transaction(async (t) => {
    const user = await User.findByPk(userId, { transaction: t, lock: t.LOCK.UPDATE });
    if (!user) throw new Error('User not found');
    const newBalance = user.creditBalance + credits;
    user.creditBalance = newBalance;
    await user.save({ transaction: t });
    await CreditLedger.create({ userId, delta: credits, reason, referenceId, notes, balanceAfter: newBalance }, { transaction: t });
    console.log('[CREDITS][ADD]', { userId, credits, reason, referenceId, balanceAfter: newBalance });
    return newBalance;
  });
}

async function deductCreditsOrThrow(userId, amountCredits, reason, referenceId, onZeroCallback) {
  return sequelize.transaction(async (t) => {
    const user = await User.findByPk(userId, { transaction: t, lock: t.LOCK.UPDATE });
    if (!user) {
      const err = new Error('User not found');
      err.status = 404;
      throw err;
    }
    if (user.creditBalance < amountCredits) {
      const err = new Error('Insufficient credits');
      err.status = 402;
      throw err;
    }
    const newBalance = user.creditBalance - amountCredits;
    user.creditBalance = newBalance;
    await user.save({ transaction: t });
    await CreditLedger.create({ userId, delta: -amountCredits, reason, referenceId, balanceAfter: newBalance }, { transaction: t });
    console.log('[CREDITS][DEDUCT]', { userId, amountCredits, reason, referenceId, balanceAfter: newBalance });
    if (newBalance === 0 && typeof onZeroCallback === 'function') {
      try { await onZeroCallback(user); } catch (_) {}
    }
    return newBalance;
  });
}

module.exports = { COST_PER_POST_CREDITS, addCredits, deductCreditsOrThrow };


