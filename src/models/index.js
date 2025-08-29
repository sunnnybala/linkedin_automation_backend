const sequelize = require('../config/database');
const User = require('./User');
const Post = require('./Post');
const Schedule = require('./Schedule');
const ScheduleRun = require('./ScheduleRun');
const Payment = require('./Payment');
const CreditLedger = require('./CreditLedger');

// Initialize models
const models = {
  User,
  Post,
  Schedule,
  ScheduleRun,
  Payment,
  CreditLedger
};

// Set up associations
Object.values(models)
  .filter(model => typeof model.associate === 'function')
  .forEach(model => model.associate(models));

// Export models and sequelize instance
module.exports = {
  ...models,
  sequelize,
  Sequelize: require('sequelize')
};
