const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const PayrollLog = sequelize.define('PayrollLog', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
  },
  school_id: {
    type: DataTypes.UUID,
    allowNull: false,
  },
  config_id: DataTypes.UUID,
  executed_at: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW,
  },
  total_amount: {
    type: DataTypes.DECIMAL(15, 2),
    allowNull: false,
  },
  staff_count: DataTypes.INTEGER,
  squad_batch_id: DataTypes.STRING(255),
  status: {
    type: DataTypes.ENUM('completed', 'failed', 'partial'),
    defaultValue: 'completed',
  },
  notes: DataTypes.TEXT,
  audio_url: DataTypes.STRING(500),
}, {
  tableName: 'PayrollLogs',
  timestamps: true,
});

module.exports = PayrollLog;
