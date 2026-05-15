const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const OpportunityPool = sequelize.define('OpportunityPool', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  source_url_hash: { type: DataTypes.STRING(64), unique: true }, // SHA256 of URL — dedup key
  title: { type: DataTypes.STRING(500), allowNull: false },
  organization: DataTypes.STRING(255),
  description: DataTypes.TEXT,
  skills_required: DataTypes.TEXT, // JSON array
  opportunity_type: {
    type: DataTypes.ENUM('gig', 'training', 'internship', 'full_time', 'fellowship', 'government', 'grant'),
    defaultValue: 'gig',
  },
  target_user_type: {
    type: DataTypes.ENUM('graduate', 'trader', 'all'),
    defaultValue: 'all',
  },
  location: DataTypes.STRING(255),
  pay_or_stipend: DataTypes.STRING(255),
  deadline: DataTypes.DATE,
  external_link: DataTypes.STRING(1000),
  source_platform: DataTypes.STRING(100), // 'jobberman', 'discovery_africa', etc.
  is_active: { type: DataTypes.BOOLEAN, defaultValue: true },
  scraped_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
}, { tableName: 'OpportunityPool', timestamps: true });

module.exports = OpportunityPool;
