require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const { sequelize, School, PayrollConfig, Forecast } = require('../models');
const squadService = require('../services/squadService');
const { computeForecast } = require('../services/forecastService');
const whatsappService = require('../services/whatsappService');
const logger = require('../config/logger');

const { app } = require('@azure/functions');

// Runs nightly at 23:00 UTC
app.timer('forecastTrigger', {
  schedule: '0 0 23 * * *',
  handler: async (myTimer, context) => {
    await sequelize.authenticate();
    const schools = await School.findAll({ where: { onboarding_status: 'onboarded' } });

    logger.info({ event: 'forecast_trigger', school_count: schools.length });

    for (const school of schools) {
      try {
        const balanceRes = await squadService.getBalance().catch(() => null);
        const balance = balanceRes?.data?.balance || 0;

        const forecast = await computeForecast(school.id, balance);

        const payrollConfig = await PayrollConfig.findOne({ where: { school_id: school.id, status: 'active' } });
        if (payrollConfig && forecast.lower30 < parseFloat(payrollConfig.total_amount)) {
          const payrollDate = `${payrollConfig.payroll_day} ${new Date().toLocaleString('en-NG', { month: 'long' })}`;
          await whatsappService.notifyForecastAlert(school.phone, forecast.day30, payrollConfig.total_amount, payrollDate);
        }

        logger.info({ event: 'forecast_updated', school: school.name, day30: forecast.day30 });
      } catch (err) {
        logger.error({ event: 'forecast_error', school: school.name, error: err.message });
      }
    }

    await sequelize.close();
  },
});
