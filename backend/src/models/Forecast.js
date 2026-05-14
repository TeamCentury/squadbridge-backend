const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Forecast = sequelize.define('Forecast', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
  },
  school_id: {
    type: DataTypes.UUID,
    allowNull: false,
  },
  generated_at: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW,
  },
  day30: DataTypes.DECIMAL(15, 2),
  day60: DataTypes.DECIMAL(15, 2),
  day90: DataTypes.DECIMAL(15, 2),
  upper30: DataTypes.DECIMAL(15, 2),
  lower30: DataTypes.DECIMAL(15, 2),
  upper60: DataTypes.DECIMAL(15, 2),
  lower60: DataTypes.DECIMAL(15, 2),
  upper90: DataTypes.DECIMAL(15, 2),
  lower90: DataTypes.DECIMAL(15, 2),
  model_params: DataTypes.TEXT,
  daily_rate: DataTypes.DECIMAL(15, 2),
}, {
  tableName: 'Forecasts',
  timestamps: true,
});

module.exports = Forecast;
