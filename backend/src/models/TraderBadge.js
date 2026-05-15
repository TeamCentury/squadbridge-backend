const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const TraderBadge = sequelize.define('TraderBadge', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  trader_id: { type: DataTypes.UUID, allowNull: false },
  tier: {
    type: DataTypes.INTEGER, // 1-5
    allowNull: false,
    validate: { min: 1, max: 5 },
  },
  tier_name: {
    type: DataTypes.ENUM('Registered', 'Trusted', 'Verified', 'Expert', 'Elite'),
    allowNull: false,
  },
  earned_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
  // Tier 3 — document verification
  document_url: DataTypes.STRING(500),
  document_type: DataTypes.STRING(100), // 'trade_cert', 'guild_membership', 'nabteb', etc.
  document_verified: { type: DataTypes.BOOLEAN, defaultValue: false },
  document_ai_notes: DataTypes.TEXT,
  // Tier 4 — skill assessment
  assessment_questions: DataTypes.TEXT, // JSON — GPT-4o generated questions
  assessment_answers: DataTypes.TEXT,   // JSON — trader's answers
  assessment_score: DataTypes.DECIMAL(5, 2), // 0-100
  assessment_passed: DataTypes.BOOLEAN,
  // Tier 5 — computed from platform data
  days_active: DataTypes.INTEGER,
  jobs_completed: DataTypes.INTEGER,
  avg_rating: DataTypes.DECIMAL(3, 2),
  is_active: { type: DataTypes.BOOLEAN, defaultValue: true },
}, { tableName: 'TraderBadges', timestamps: true });

module.exports = TraderBadge;
