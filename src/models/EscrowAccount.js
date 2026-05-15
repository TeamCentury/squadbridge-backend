const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const EscrowAccount = sequelize.define('EscrowAccount', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  employer_id: { type: DataTypes.UUID, allowNull: false },
  worker_id: { type: DataTypes.UUID, allowNull: false },
  worker_type: { type: DataTypes.ENUM('trader', 'graduate'), allowNull: false },
  gig_post_id: DataTypes.UUID,
  agreed_amount: { type: DataTypes.DECIMAL(15, 2), allowNull: false },
  platform_fee_pct: { type: DataTypes.DECIMAL(4, 2), defaultValue: 2.5 },
  squad_dynamic_nuban: DataTypes.STRING(20),
  squad_virtual_account_id: DataTypes.STRING(255),
  squad_transaction_id: DataTypes.STRING(255),
  status: {
    type: DataTypes.ENUM('pending', 'funded', 'work_started', 'work_done', 'released', 'disputed', 'refunded'),
    defaultValue: 'pending',
  },
  funded_at: DataTypes.DATE,
  released_at: DataTypes.DATE,
  dispute_reason: DataTypes.TEXT,
  job_title: DataTypes.STRING(500),
  job_description: DataTypes.TEXT,
  duration_days: DataTypes.INTEGER,
}, { tableName: 'EscrowAccounts', timestamps: true });

module.exports = EscrowAccount;
