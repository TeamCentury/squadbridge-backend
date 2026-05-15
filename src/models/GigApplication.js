const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const GigApplication = sequelize.define('GigApplication', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  gig_post_id: { type: DataTypes.UUID, allowNull: false },
  applicant_id: { type: DataTypes.UUID, allowNull: false },
  applicant_type: { type: DataTypes.ENUM('trader', 'graduate'), allowNull: false },
  cover_note: DataTypes.TEXT,
  proposed_rate: DataTypes.DECIMAL(15, 2),
  status: {
    type: DataTypes.ENUM('pending', 'shortlisted', 'accepted', 'rejected', 'completed', 'withdrawn'),
    defaultValue: 'pending',
  },
  escrow_id: DataTypes.UUID,
  employer_notified: { type: DataTypes.BOOLEAN, defaultValue: false },
  completed_at: DataTypes.DATE,
  employer_rating: DataTypes.INTEGER, // 1-5
  worker_rating: DataTypes.INTEGER,
  employer_review: DataTypes.TEXT,
  worker_review: DataTypes.TEXT,
}, { tableName: 'GigApplications', timestamps: true });

module.exports = GigApplication;
