const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const School = sequelize.define('School', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
  },
  name: {
    type: DataTypes.STRING(255),
    allowNull: false,
  },
  address: DataTypes.STRING(500),
  state: DataTypes.STRING(100),
  lga: DataTypes.STRING(100),
  phone: {
    type: DataTypes.STRING(20),
    allowNull: false,
  },
  nuban: {
    type: DataTypes.STRING(20),
    unique: true,
  },
  squad_merchant_id: DataTypes.STRING(255),
  student_count: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
  },
  fee_per_term: {
    type: DataTypes.DECIMAL(15, 2),
    defaultValue: 0,
  },
  staff_count: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
  },
  avg_salary: {
    type: DataTypes.DECIMAL(15, 2),
    defaultValue: 0,
  },
  bvn_verified: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
  },
  onboarding_status: {
    type: DataTypes.ENUM('pending', 'verified', 'onboarded'),
    defaultValue: 'pending',
  },
  preferred_language: {
    type: DataTypes.ENUM('en', 'yo', 'ha', 'pcm'),
    defaultValue: 'en',
  },
  password_hash: DataTypes.STRING(255),
}, {
  tableName: 'Schools',
  timestamps: true,
});

module.exports = School;
