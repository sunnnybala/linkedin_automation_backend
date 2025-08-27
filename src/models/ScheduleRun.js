const { DataTypes, Model } = require('sequelize');
const sequelize = require('../config/database');

class ScheduleRun extends Model {
  static associate(models) {
    ScheduleRun.belongsTo(models.Schedule, {
      foreignKey: 'scheduleId',
      as: 'schedule',
      onDelete: 'CASCADE'
    });
  }
}

ScheduleRun.init({
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  scheduleId: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  runAt: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW
  },
  status: {
    type: DataTypes.ENUM('pending', 'success', 'failed'),
    allowNull: false,
    defaultValue: 'pending'
  },
  error: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  response: {
    type: DataTypes.JSONB,
    allowNull: true
  },
  attempt: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 1
  },
  durationMs: {
    type: DataTypes.INTEGER,
    allowNull: true
  }
}, {
  sequelize,
  modelName: 'ScheduleRun',
  tableName: 'schedule_runs',
  timestamps: true,
  indexes: [
    { fields: ['scheduleId'], name: 'schedule_runs_schedule_id_index' }
  ]
});

module.exports = ScheduleRun;


