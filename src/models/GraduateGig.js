const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const GraduateGig = sequelize.define('GraduateGig', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  graduate_id: { type: DataTypes.UUID, allowNull: false },
  title: { type: DataTypes.STRING(255), allowNull: false },
  description: DataTypes.TEXT,
  category: {
    type: DataTypes.ENUM(
      'tutoring', 'data_entry', 'writing', 'design', 'social_media',
      'research', 'transcription', 'translation', 'virtual_assistant',
      'programming', 'accounting', 'marketing', 'other'
    ),
    defaultValue: 'other',
  },
  rate: { type: DataTypes.DECIMAL(15, 2), defaultValue: 0 },
  rate_type: {
    type: DataTypes.ENUM('hourly', 'fixed', 'negotiable'),
    defaultValue: 'negotiable',
  },
  location_type: {
    type: DataTypes.ENUM('remote', 'onsite', 'hybrid'),
    defaultValue: 'remote',
  },
  status: {
    type: DataTypes.ENUM('available', 'busy', 'inactive'),
    defaultValue: 'available',
  },
  client_name: DataTypes.STRING(255),
  client_phone: DataTypes.STRING(20),
  squad_link_url: DataTypes.STRING(500),
  payment_link_id: DataTypes.STRING(255),
  amount_earned: { type: DataTypes.DECIMAL(15, 2), defaultValue: 0 },
  completed_at: DataTypes.DATE,
}, { tableName: 'GraduateGigs', timestamps: true });

module.exports = GraduateGig;
