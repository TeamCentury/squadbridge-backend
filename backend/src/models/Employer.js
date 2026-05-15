const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Employer = sequelize.define('Employer', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  name: { type: DataTypes.STRING(255), allowNull: false },
  company: DataTypes.STRING(255),
  phone: { type: DataTypes.STRING(20), allowNull: false, unique: true },
  email: DataTypes.STRING(255),
  password_hash: DataTypes.STRING(255),
  nuban: { type: DataTypes.STRING(20), unique: true },
  squad_merchant_id: DataTypes.STRING(255),
  bvn_verified: { type: DataTypes.BOOLEAN, defaultValue: false },
  is_active: { type: DataTypes.BOOLEAN, defaultValue: true },
  state: DataTypes.STRING(100),
  lga: DataTypes.STRING(100),
  address: DataTypes.STRING(500),
  industry: DataTypes.STRING(255),
  company_size: DataTypes.STRING(50),
  reputation_score: { type: DataTypes.DECIMAL(4, 2), defaultValue: 5.0 },
  dispute_count: { type: DataTypes.INTEGER, defaultValue: 0 },
  total_hires: { type: DataTypes.INTEGER, defaultValue: 0 },
  total_spent_ngn: { type: DataTypes.DECIMAL(15, 2), defaultValue: 0 },
  preferred_language: {
    type: DataTypes.ENUM('en', 'yo', 'ha', 'ig', 'pcm', 'fr', 'sw'),
    defaultValue: 'en',
  },
}, { tableName: 'Employers', timestamps: true });

module.exports = Employer;
