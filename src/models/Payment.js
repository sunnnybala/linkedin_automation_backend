const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Payment = sequelize.define('Payment', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  userId: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  gatewayRequestId: {
    type: DataTypes.STRING,
    allowNull: true,
    unique: true
  },
  gatewayPaymentId: {
    type: DataTypes.STRING,
    allowNull: false,
    unique: true
  },
  amountInPaise: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  currency: {
    type: DataTypes.STRING,
    allowNull: false,
    defaultValue: 'INR'
  },
  status: {
    type: DataTypes.ENUM('created', 'success', 'failed'),
    allowNull: false,
    defaultValue: 'created'
  },
  method: {
    type: DataTypes.STRING,
    allowNull: true
  },
  creditsGranted: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0
  },
  rawPayload: {
    type: DataTypes.JSONB,
    allowNull: true
  },
  webhookVerifiedAt: {
    type: DataTypes.DATE,
    allowNull: true
  }
}, {
  timestamps: true,
  tableName: 'payments'
});

module.exports = Payment;


