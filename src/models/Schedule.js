const { DataTypes, Model } = require('sequelize');
const sequelize = require('../config/database');

class Schedule extends Model {
  static associate(models) {
    Schedule.belongsTo(models.User, {
      foreignKey: 'userId',
      as: 'user',
      onDelete: 'CASCADE'
    });
    Schedule.hasMany(models.ScheduleRun, {
      foreignKey: 'scheduleId',
      as: 'runs',
      onDelete: 'CASCADE'
    });
  }
}

Schedule.init({
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  userId: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  topics: {
    type: DataTypes.JSONB,
    allowNull: false,
    defaultValue: []
  },
  cadence: {
    type: DataTypes.ENUM('daily', 'every_3_days', 'weekly', 'every_2_weeks'),
    allowNull: false
  },
  timezone: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  nextRunAt: {
    type: DataTypes.DATE,
    allowNull: false
  },
  lastRunAt: {
    type: DataTypes.DATE,
    allowNull: true
  },
  isActive: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: true
  },
  metadata: {
    type: DataTypes.JSONB,
    allowNull: false,
    defaultValue: {}
  }
}, {
  sequelize,
  modelName: 'Schedule',
  tableName: 'schedules',
  timestamps: true,
  indexes: [
    { fields: ['userId'], name: 'schedules_user_id_index' },
    { fields: ['isActive', 'nextRunAt'], name: 'schedules_active_next_index' }
  ]
});

module.exports = Schedule;


