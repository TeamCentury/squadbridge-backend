const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const OpportunitySent = sequelize.define('OpportunitySent', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  user_id: { type: DataTypes.UUID, allowNull: false },
  user_type: { type: DataTypes.ENUM('graduate', 'trader'), allowNull: false },
  opportunity_id: { type: DataTypes.UUID, allowNull: false },
  sent_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
  clicked: { type: DataTypes.BOOLEAN, defaultValue: false },
  applied: { type: DataTypes.BOOLEAN, defaultValue: false },
}, { tableName: 'OpportunitySent', timestamps: false });

module.exports = OpportunitySent;
