const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Student = sequelize.define('Student', {
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
  class: DataTypes.STRING(100),
  parent_phone: DataTypes.STRING(20),
  fee_amount: {
    type: DataTypes.DECIMAL(15, 2),
    allowNull: false,
  },
  amount_paid: {
    type: DataTypes.DECIMAL(15, 2),
    defaultValue: 0,
  },
  fee_status: {
    type: DataTypes.ENUM('unpaid', 'partial', 'paid'),
    defaultValue: 'unpaid',
  },
  payment_link_id: DataTypes.STRING(255),
  squad_link_url: DataTypes.STRING(500),
  term: DataTypes.STRING(50),
  academic_year: DataTypes.STRING(20),
}, {
  tableName: 'Students',
  timestamps: true,
});

module.exports = Student;
