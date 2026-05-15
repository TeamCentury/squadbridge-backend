const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const ConversationSession = sequelize.define('ConversationSession', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  // One of these is set — phone for WhatsApp/USSD, session_id for web/Vapi
  phone: { type: DataTypes.STRING(20), unique: false },
  session_id: DataTypes.STRING(255), // Vapi call ID or web session token
  channel: {
    type: DataTypes.ENUM('whatsapp', 'vapi', 'twilio', 'ussd', 'web'),
    allowNull: false,
  },
  user_id: DataTypes.UUID,
  user_type: DataTypes.ENUM('graduate', 'trader', 'employer', 'school', 'unknown'),
  language: { type: DataTypes.STRING(10), defaultValue: 'en-NG' },
  voice_preference: { type: DataTypes.BOOLEAN, defaultValue: false },
  messages: { type: DataTypes.TEXT, defaultValue: '[]' }, // JSON array of {role, content, ts}
  context: DataTypes.TEXT, // JSON — current flow state, collected fields
  last_active_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
  ended_at: DataTypes.DATE,
}, { tableName: 'ConversationSessions', timestamps: true });

module.exports = ConversationSession;
