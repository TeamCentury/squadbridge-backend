const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const AuditLog = sequelize.define('AuditLog', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
  },
  school_id: DataTypes.UUID,
  event_type: {
    type: DataTypes.ENUM(
      'PAYMENT_RECEIVED',
      'PAYROLL_EXECUTED',
      'LINK_GENERATED',
      'ONBOARDED',
      'WEBHOOK_RECEIVED',
      'FORECAST_UPDATED',
      'PAYOUT_REQUESTED'
    ),
    allowNull: false,
  },
  description: DataTypes.STRING(500),
  amount: DataTypes.DECIMAL(15, 2),
  squad_transaction_id: DataTypes.STRING(255),
  status: {
    type: DataTypes.ENUM('success', 'failed', 'pending'),
    defaultValue: 'success',
  },
  metadata: DataTypes.TEXT,
}, {
  tableName: 'AuditLogs',
  timestamps: true,
});

module.exports = AuditLog;
