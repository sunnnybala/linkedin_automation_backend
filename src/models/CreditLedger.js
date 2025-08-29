const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const CreditLedger = sequelize.define('CreditLedger', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  userId: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  delta: {
    // positive for credit, negative for debit
    type: DataTypes.INTEGER,
    allowNull: false
  },
  reason: {
    type: DataTypes.ENUM('PURCHASE', 'POST', 'RUN_NOW', 'ADJUSTMENT', 'SCHEDULED_RUN'),
    allowNull: false
  },
  referenceId: {
    type: DataTypes.STRING,
    allowNull: true
  },
  notes: {
    type: DataTypes.STRING,
    allowNull: true
  },
  balanceAfter: {
    type: DataTypes.INTEGER,
    allowNull: false
  }
}, {
  timestamps: true,
  tableName: 'credit_ledger'
});

module.exports = CreditLedger;


