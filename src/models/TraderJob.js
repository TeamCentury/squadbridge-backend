const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const TraderJob = sequelize.define('TraderJob', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  trader_id: { type: DataTypes.UUID, allowNull: false },
  title: { type: DataTypes.STRING(255), allowNull: false },
  description: DataTypes.TEXT,
  category: {
    type: DataTypes.ENUM(
      'plumbing', 'electrical', 'carpentry', 'tailoring', 'catering',
      'cleaning', 'painting', 'welding', 'mechanic', 'hair_beauty',
      'tech_repair', 'photography', 'logistics', 'trading', 'other'
    ),
    defaultValue: 'other',
  },
  price_type: {
    type: DataTypes.ENUM('fixed', 'negotiable', 'hourly'),
    defaultValue: 'negotiable',
  },
  price: { type: DataTypes.DECIMAL(15, 2), defaultValue: 0 },
  location: DataTypes.STRING(500),
  status: {
    type: DataTypes.ENUM('open', 'in_progress', 'completed', 'cancelled'),
    defaultValue: 'open',
  },
  squad_link_url: DataTypes.STRING(500),
  payment_link_id: DataTypes.STRING(255),
  client_name: DataTypes.STRING(255),
  client_phone: DataTypes.STRING(20),
  completed_at: DataTypes.DATE,
}, { tableName: 'TraderJobs', timestamps: true });

module.exports = TraderJob;
