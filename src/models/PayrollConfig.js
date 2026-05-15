const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const PayrollConfig = sequelize.define('PayrollConfig', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
  },
  school_id: {
    type: DataTypes.UUID,
    allowNull: false,
  },
  payroll_day: {
    type: DataTypes.INTEGER,
    allowNull: false,
    validate: { min: 1, max: 28 },
  },
  total_amount: {
    type: DataTypes.DECIMAL(15, 2),
    defaultValue: 0,
  },
  status: {
    type: DataTypes.ENUM('active', 'paused'),
    defaultValue: 'active',
  },
}, {
  tableName: 'PayrollConfigs',
  timestamps: true,
});

module.exports = PayrollConfig;
