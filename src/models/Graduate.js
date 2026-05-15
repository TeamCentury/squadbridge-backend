const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Graduate = sequelize.define('Graduate', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  name: { type: DataTypes.STRING(255), allowNull: false },
  phone: { type: DataTypes.STRING(20), allowNull: false, unique: true },
  email: DataTypes.STRING(255),
  password_hash: DataTypes.STRING(255),
  degree: DataTypes.STRING(100),
  field_of_study: DataTypes.STRING(255),
  graduation_year: DataTypes.INTEGER,
  university: DataTypes.STRING(255),
  skills: DataTypes.TEXT, // JSON array
  state: DataTypes.STRING(100),
  lga: DataTypes.STRING(100),
  nuban: { type: DataTypes.STRING(20), unique: true },
  squad_merchant_id: DataTypes.STRING(255),
  bvn_verified: { type: DataTypes.BOOLEAN, defaultValue: false },
  is_active: { type: DataTypes.BOOLEAN, defaultValue: true },
  bio: DataTypes.TEXT,
  cv_url: DataTypes.STRING(500),
  linkedin_url: DataTypes.STRING(500),
  total_gigs: { type: DataTypes.INTEGER, defaultValue: 0 },
  total_earnings: { type: DataTypes.DECIMAL(15, 2), defaultValue: 0 },
  preferred_language: {
    type: DataTypes.ENUM('en', 'yo', 'ha', 'ig', 'pcm'),
    defaultValue: 'en',
  },
}, { tableName: 'Graduates', timestamps: true });

module.exports = Graduate;
