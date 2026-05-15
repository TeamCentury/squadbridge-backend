require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const { sequelize, School, PayrollConfig, PayrollStaff, PayrollLog, AuditLog } = require('../models');
const squadService = require('../services/squadService');
const whatsappService = require('../services/whatsappService');
const spitchService = require('../services/spitchService');
const logger = require('../config/logger');

// Azure Functions v4 timer trigger — runs daily at 08:00 WAT
const { app } = require('@azure/functions');

app.timer('payrollTrigger', {
  schedule: '0 0 7 * * *', // 07:00 UTC = 08:00 WAT
  handler: async (myTimer, context) => {
    await sequelize.authenticate();
    const today = new Date().getDate();

    const configs = await PayrollConfig.findAll({
      where: { payroll_day: today, status: 'active' },
      include: [{ model: School, as: 'school' }],
    });

    logger.info({ event: 'payroll_trigger', count: configs.length, day: today });

    for (const config of configs) {
      const school = config.school;
      try {
        const staffList = await PayrollStaff.findAll({ where: { school_id: school.id, active: true } });
        if (!staffList.length) continue;

        const balanceRes = await squadService.getBalance().catch(() => null);
        const balance = balanceRes?.data?.balance || 0;

        if (balance < parseFloat(config.total_amount)) {
          await whatsappService.notifyForecastAlert(school.phone, balance, config.total_amount, new Date().toDateString());
          await PayrollLog.create({
            school_id: school.id,
            config_id: config.id,
            total_amount: config.total_amount,
            staff_count: staffList.length,
            status: 'failed',
            notes: `Insufficient balance: ₦${balance} available, ₦${config.total_amount} required`,
          });
          continue;
        }

        const transfers = staffList.map((s) => ({
          account_number: s.account_number,
          bank_code: s.bank_code,
          amount: parseFloat(s.amount) * 100,
          currency_id: 'NGN',
          remark: `${school.name} payroll - ${new Date().toLocaleString('en-NG', { month: 'long', year: 'numeric' })}`,
        }));

        const bulkRes = await squadService.bulkTransfer({ transactions: transfers });
        const batchId = bulkRes?.data?.batch_id || `SB-${Date.now()}`;

        const log = await PayrollLog.create({
          school_id: school.id,
          config_id: config.id,
          total_amount: config.total_amount,
          staff_count: staffList.length,
          squad_batch_id: batchId,
          status: 'completed',
        });

        await AuditLog.create({
          school_id: school.id,
          event_type: 'PAYROLL_EXECUTED',
          amount: config.total_amount,
          squad_transaction_id: batchId,
          description: `Scheduled payroll for ${staffList.length} staff`,
        });

        const ttsText = spitchService.buildPayrollText(staffList.length, config.total_amount, balance - config.total_amount);
        const audio = await spitchService.generateTTS(ttsText);
        if (audio) await log.update({ audio_url: audio.audio_url });

        await whatsappService.notifyPayrollComplete(school.phone, staffList.length, config.total_amount, balance - config.total_amount, batchId);
        logger.info({ event: 'payroll_completed', school: school.name, batch_id: batchId });
      } catch (err) {
        logger.error({ event: 'payroll_error', school: school.name, error: err.message });
      }
    }

    await sequelize.close();
  },
});
