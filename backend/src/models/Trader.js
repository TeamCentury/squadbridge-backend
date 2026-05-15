const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Trader = sequelize.define('Trader', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  name: { type: DataTypes.STRING(255), allowNull: false },
  phone: { type: DataTypes.STRING(20), allowNull: false, unique: true },
  email: DataTypes.STRING(255),
  password_hash: DataTypes.STRING(255),
  business_name: DataTypes.STRING(255),
  business_type: {
    type: DataTypes.ENUM('artisan', 'trader', 'vendor', 'contractor', 'service_provider'),
    defaultValue: 'trader',
  },
  skills: DataTypes.TEXT, // JSON array
  state: DataTypes.STRING(100),
  lga: DataTypes.STRING(100),
  address: DataTypes.STRING(500),
  nuban: { type: DataTypes.STRING(20), unique: true },
  squad_merchant_id: DataTypes.STRING(255),
  bvn_verified: { type: DataTypes.BOOLEAN, defaultValue: false },
  is_active: { type: DataTypes.BOOLEAN, defaultValue: true },
  bio: DataTypes.TEXT,
  profile_image_url: DataTypes.STRING(500),
  rating: { type: DataTypes.DECIMAL(3, 2), defaultValue: 0 },
  total_jobs: { type: DataTypes.INTEGER, defaultValue: 0 },
  total_earnings: { type: DataTypes.DECIMAL(15, 2), defaultValue: 0 },
  preferred_language: {
    type: DataTypes.ENUM('en', 'yo', 'ha', 'ig', 'pcm'),
    defaultValue: 'en',
  },
}, { tableName: 'Traders', timestamps: true });

module.exports = Trader;
