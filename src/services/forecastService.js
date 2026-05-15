const { Transaction, Forecast, PayrollConfig } = require('../models');
const { Op } = require('sequelize');

const ALPHA = 0.3;
const CONFIDENCE_BAND = 0.15;

async function computeForecast(schoolId, currentBalance) {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const transactions = await Transaction.findAll({
    where: {
      school_id: schoolId,
      status: 'successful',
      createdAt: { [Op.gte]: thirtyDaysAgo },
    },
    order: [['createdAt', 'ASC']],
  });

  // Group by day to get daily inflow
  const dailyMap = {};
  for (const tx of transactions) {
    const day = tx.createdAt.toISOString().split('T')[0];
    dailyMap[day] = (dailyMap[day] || 0) + parseFloat(tx.amount);
  }

  const dailyAmounts = Object.values(dailyMap);
  const dailyRate = dailyAmounts.length
    ? exponentialSmooth(dailyAmounts, ALPHA)
    : 0;

  const payrollConfig = await PayrollConfig.findOne({ where: { school_id: schoolId, status: 'active' } });
  const monthlyPayroll = payrollConfig ? parseFloat(payrollConfig.total_amount) : 0;

  const project = (days) => {
    let balance = currentBalance + dailyRate * days;
    const monthsPassed = days / 30;
    balance -= monthlyPayroll * monthsPassed;
    return Math.max(balance, 0);
  };

  const day30 = project(30);
  const day60 = project(60);
  const day90 = project(90);

  const params = JSON.stringify({ alpha: ALPHA, daily_rate: dailyRate, monthly_payroll: monthlyPayroll, data_points: dailyAmounts.length });

  const forecast = await Forecast.create({
    school_id: schoolId,
    day30,
    day60,
    day90,
    upper30: day30 * (1 + CONFIDENCE_BAND),
    lower30: day30 * (1 - CONFIDENCE_BAND),
    upper60: day60 * (1 + CONFIDENCE_BAND),
    lower60: day60 * (1 - CONFIDENCE_BAND),
    upper90: day90 * (1 + CONFIDENCE_BAND),
    lower90: day90 * (1 - CONFIDENCE_BAND),
    daily_rate: dailyRate,
    model_params: params,
  });

  return forecast;
}

function exponentialSmooth(values, alpha) {
  if (!values.length) return 0;
  let smoothed = values[0];
  for (let i = 1; i < values.length; i++) {
    smoothed = alpha * values[i] + (1 - alpha) * smoothed;
  }
  return smoothed;
}

module.exports = { computeForecast };
