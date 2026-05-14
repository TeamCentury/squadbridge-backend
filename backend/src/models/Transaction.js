const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Transaction = sequelize.define('Transaction', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
  },
  school_id: {
    type: DataTypes.UUID,
    allowNull: false,
  },
  student_id: DataTypes.UUID,
  squad_transaction_id: {
    type: DataTypes.STRING(255),
    unique: true,
    allowNull: false,
  },
  amount: {
    type: DataTypes.DECIMAL(15, 2),
    allowNull: false,
  },
  status: {
    type: DataTypes.ENUM('pending', 'successful', 'failed', 'reversed'),
    defaultValue: 'pending',
  },
  payment_method: DataTypes.STRING(50),
  payment_link_id: DataTypes.STRING(255),
  currency: {
    type: DataTypes.STRING(5),
    defaultValue: 'NGN',
  },
  webhook_received_at: DataTypes.DATE,
  squad_payload: DataTypes.TEXT,
}, {
  tableName: 'Transactions',
  timestamps: true,
});

module.exports = Transaction;
