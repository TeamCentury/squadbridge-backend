const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const GigPost = sequelize.define('GigPost', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  poster_id: { type: DataTypes.UUID, allowNull: false },
  poster_type: { type: DataTypes.ENUM('trader', 'graduate', 'employer'), allowNull: false },
  title: { type: DataTypes.STRING(500), allowNull: false },
  description: DataTypes.TEXT,
  category: DataTypes.STRING(100),
  skills_required: DataTypes.TEXT, // JSON array
  budget_min: DataTypes.DECIMAL(15, 2),
  budget_max: DataTypes.DECIMAL(15, 2),
  budget_fixed: DataTypes.DECIMAL(15, 2),
  rate_type: {
    type: DataTypes.ENUM('fixed', 'per_day', 'per_hour', 'negotiable'),
    defaultValue: 'fixed',
  },
  duration_days: DataTypes.INTEGER,
  location_type: {
    type: DataTypes.ENUM('remote', 'onsite', 'hybrid'),
    defaultValue: 'onsite',
  },
  state: DataTypes.STRING(100),
  target_user_type: {
    type: DataTypes.ENUM('graduate', 'trader', 'all'),
    defaultValue: 'all',
  },
  status: {
    type: DataTypes.ENUM('open', 'in_progress', 'completed', 'closed', 'expired'),
    defaultValue: 'open',
  },
  expires_at: DataTypes.DATE,
  view_count: { type: DataTypes.INTEGER, defaultValue: 0 },
  application_count: { type: DataTypes.INTEGER, defaultValue: 0 },
}, { tableName: 'GigPosts', timestamps: true });

module.exports = GigPost;
