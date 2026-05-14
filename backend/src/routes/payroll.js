const router = require('express').Router({ mergeParams: true });
const { body, validationResult } = require('express-validator');
const { PayrollConfig, PayrollStaff, PayrollLog, School, AuditLog } = require('../models');
const squadService = require('../services/squadService');
const whatsappService = require('../services/whatsappService');
const spitchService = require('../services/spitchService');

// POST /api/v1/schools/:id/payroll/configure
router.post('/configure', [
  body('payroll_day').isInt({ min: 1, max: 28 }),
  body('staff').isArray({ min: 1 }),
  body('staff.*.name').notEmpty(),
  body('staff.*.bank_code').notEmpty(),
  body('staff.*.account_number').notEmpty(),
  body('staff.*.amount').isFloat({ min: 1 }),
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { payroll_day, staff } = req.body;
    const schoolId = req.params.id;

    const total_amount = staff.reduce((sum, s) => sum + parseFloat(s.amount), 0);

    const [config] = await PayrollConfig.upsert({ school_id: schoolId, payroll_day, total_amount, status: 'active' });

    await PayrollStaff.destroy({ where: { school_id: schoolId } });
    await PayrollStaff.bulkCreate(staff.map((s) => ({ ...s, school_id: schoolId })));

    res.json({ config_id: config.id, payroll_day, total_amount, staff_count: staff.length });
  } catch (err) {
    next(err);
  }
});

// POST /api/v1/schools/:id/payroll/execute
router.post('/execute', async (req, res, next) => {
  try {
    const school = await School.findByPk(req.params.id);
    if (!school) return res.status(404).json({ error: 'School not found' });

    const [config, staffList] = await Promise.all([
      PayrollConfig.findOne({ where: { school_id: school.id, status: 'active' } }),
      PayrollStaff.findAll({ where: { school_id: school.id, active: true } }),
    ]);

    if (!config) return res.status(400).json({ error: 'No active payroll configuration' });
    if (!staffList.length) return res.status(400).json({ error: 'No staff configured for payroll' });

    const balanceRes = await squadService.getBalance(school.squad_merchant_id);
    const balance = balanceRes?.data?.balance || 0;

    if (balance < config.total_amount) {
      await whatsappService.notifyForecastAlert(
        school.phone,
        balance,
        config.total_amount,
        new Date().toDateString()
      );
      return res.status(402).json({ error: 'Insufficient balance for payroll', balance, required: config.total_amount });
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
      description: `Payroll executed for ${staffList.length} staff`,
    });

    const ttsText = spitchService.buildPayrollText(staffList.length, config.total_amount, balance - config.total_amount);
    const audio = await spitchService.generateTTS(ttsText);
    if (audio) {
      await log.update({ audio_url: audio.audio_url });
    }

    await whatsappService.notifyPayrollComplete(school.phone, staffList.length, config.total_amount, balance - config.total_amount, batchId);

    res.json({ status: 'completed', batch_id: batchId, staff_count: staffList.length, total_amount: config.total_amount, audio_url: audio?.audio_url });
  } catch (err) {
    next(err);
  }
});

// GET /api/v1/schools/:id/payroll/history
router.get('/history', async (req, res, next) => {
  try {
    const logs = await PayrollLog.findAll({
      where: { school_id: req.params.id },
      order: [['executed_at', 'DESC']],
    });
    res.json(logs);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
