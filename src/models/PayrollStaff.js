const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const PayrollStaff = sequelize.define('PayrollStaff', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
  },
  school_id: {
    type: DataTypes.UUID,
    allowNull: false,
  },
  name: {
    type: DataTypes.STRING(255),
    allowNull: false,
  },
  role: DataTypes.STRING(100),
  bank_code: {
    type: DataTypes.STRING(10),
    allowNull: false,
  },
  account_number: {
    type: DataTypes.STRING(20),
    allowNull: false,
  },
  amount: {
    type: DataTypes.DECIMAL(15, 2),
    allowNull: false,
  },
  active: {
    type: DataTypes.BOOLEAN,
    defaultValue: true,
  },
}, {
  tableName: 'PayrollStaff',
  timestamps: true,
});

module.exports = PayrollStaff;
