const sequelize = require('../config/database');
const User = require('./User');
const Post = require('./Post');
const Schedule = require('./Schedule');
const ScheduleRun = require('./ScheduleRun');

// Initialize models
const models = {
  User,
  Post,
  Schedule,
  ScheduleRun
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
