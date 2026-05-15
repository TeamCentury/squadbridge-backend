const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const CreditProfile = sequelize.define('CreditProfile', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  user_id: { type: DataTypes.UUID, allowNull: false },
  user_type: {
    type: DataTypes.ENUM('trader', 'graduate'),
    allowNull: false,
  },
  score: { type: DataTypes.INTEGER, defaultValue: 300 },
  score_date: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
  // Sub-scores (0–100 each)
  payment_history_score: { type: DataTypes.INTEGER, defaultValue: 0 },
  income_score: { type: DataTypes.INTEGER, defaultValue: 0 },
  activity_score: { type: DataTypes.INTEGER, defaultValue: 0 },
  account_age_score: { type: DataTypes.INTEGER, defaultValue: 0 },
  diversity_score: { type: DataTypes.INTEGER, defaultValue: 0 },
  growth_score: { type: DataTypes.INTEGER, defaultValue: 0 },
  // Raw stats used for scoring
  account_age_days: { type: DataTypes.INTEGER, defaultValue: 0 },
  total_transactions: { type: DataTypes.INTEGER, defaultValue: 0 },
  on_time_payments: { type: DataTypes.INTEGER, defaultValue: 0 },
  total_volume_ngn: { type: DataTypes.DECIMAL(15, 2), defaultValue: 0 },
  unique_clients: { type: DataTypes.INTEGER, defaultValue: 0 },
  jobs_last_90_days: { type: DataTypes.INTEGER, defaultValue: 0 },
  factors: DataTypes.TEXT, // JSON — factor breakdown for display
}, { tableName: 'CreditProfiles', timestamps: true });

module.exports = CreditProfile;
