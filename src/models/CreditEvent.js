const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const CreditEvent = sequelize.define('CreditEvent', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  user_id: { type: DataTypes.UUID, allowNull: false },
  user_type: {
    type: DataTypes.ENUM('trader', 'graduate'),
    allowNull: false,
  },
  event_type: {
    type: DataTypes.ENUM(
      'payment_received',
      'job_completed',
      'gig_completed',
      'payment_late',
      'account_created',
      'bvn_verified',
      'profile_completed',
      'repeat_client'
    ),
    allowNull: false,
  },
  amount: { type: DataTypes.DECIMAL(15, 2), defaultValue: 0 },
  client_id: DataTypes.STRING(255), // hashed client identifier for uniqueness count
  description: DataTypes.STRING(500),
  squad_transaction_id: DataTypes.STRING(255),
  recorded_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
}, { tableName: 'CreditEvents', timestamps: true });

module.exports = CreditEvent;
