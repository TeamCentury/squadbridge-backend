const router = require('express').Router({ mergeParams: true });
const { body, validationResult } = require('express-validator');
const { PayrollConfig, PayrollStaff, PayrollLog, School, AuditLog } = require('../models');
const squadService = require('../services/squadService');
const whatsappService = require('../services/whatsappService');
const spitchService = require('../services/spitchService');

/**
 * @swagger
 * /api/v1/schools/{id}/payroll/configure:
 *   post:
 *     summary: Configure payroll schedule and staff list
 *     description: |
 *       Saves the payroll day and full staff list. Replaces any existing staff list.
 *       The Azure Functions timer reads this config daily and auto-executes on the scheduled day.
 *     tags: [Payroll]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [payroll_day, staff]
 *             properties:
 *               payroll_day:
 *                 type: integer
 *                 minimum: 1
 *                 maximum: 28
 *                 example: 20
 *               staff:
 *                 type: array
 *                 items:
 *                   type: object
 *                   required: [name, bank_code, account_number, amount]
 *                   properties:
 *                     name:
 *                       type: string
 *                       example: Ngozi Adeyemi
 *                     role:
 *                       type: string
 *                       example: Class Teacher
 *                     bank_code:
 *                       type: string
 *                       example: "058"
 *                     account_number:
 *                       type: string
 *                       example: "0123456789"
 *                     amount:
 *                       type: number
 *                       example: 85000
 *     responses:
 *       200:
 *         description: Payroll configured
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/PayrollConfig'
 *       400:
 *         description: Validation error
 */
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

/**
 * @swagger
 * /api/v1/schools/{id}/payroll/execute:
 *   post:
 *     summary: Manually trigger payroll disbursement
 *     description: |
 *       Checks Squad balance, then calls Squad Bulk Transfer for all active staff.
 *       Sends WhatsApp confirmation and generates a Spitch TTS audio summary.
 *       Returns 402 if balance is insufficient.
 *     tags: [Payroll]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Payroll executed
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: completed
 *                 batch_id:
 *                   type: string
 *                   example: SB-1716000000000
 *                 staff_count:
 *                   type: integer
 *                   example: 20
 *                 total_amount:
 *                   type: number
 *                   example: 1700000
 *                 audio_url:
 *                   type: string
 *                   format: uri
 *                   nullable: true
 *       400:
 *         description: No active payroll configuration
 *       402:
 *         description: Insufficient balance
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                 balance:
 *                   type: number
 *                 required:
 *                   type: number
 *       404:
 *         description: School not found
 */
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

    const balanceRes = await squadService.getBalance();
    const balance = balanceRes?.data?.balance || 0;

    if (balance < config.total_amount) {
      await whatsappService.notifyForecastAlert(school.phone, balance, config.total_amount, new Date().toDateString());
      return res.status(402).json({ error: 'Insufficient balance for payroll', balance, required: config.total_amount });
    }

    const batchRef = `SB-${Date.now()}`;
    const merchantId = process.env.SQUAD_MERCHANT_ID || school.squad_merchant_id || 'SB';

    const transfers = staffList.map((s, i) => ({
      transaction_reference: `${merchantId}_payroll_${batchRef}_${i}`,
      account_number: s.account_number,
      bank_code: s.nip_code || s.bank_code, // must be 6-digit NIP code (e.g. '000013' for GTBank)
      account_name: s.name,
      amount: Math.round(parseFloat(s.amount) * 100), // kobo
      currency_id: 'NGN',
      remark: `${school.name} payroll ${new Date().toLocaleString('en-NG', { month: 'long', year: 'numeric' })}`,
    }));

    const bulkRes = await squadService.bulkTransfer({ batch_ref: batchRef, transaction_details: transfers });
    const batchId = bulkRes?.batch_ref || batchRef;

    const log = await PayrollLog.create({
      school_id: school.id, config_id: config.id, total_amount: config.total_amount,
      staff_count: staffList.length, squad_batch_id: batchId, status: 'completed',
    });

    await AuditLog.create({
      school_id: school.id, event_type: 'PAYROLL_EXECUTED',
      amount: config.total_amount, squad_transaction_id: batchId,
      description: `Payroll executed for ${staffList.length} staff`,
    });

    const ttsText = spitchService.buildPayrollText(staffList.length, config.total_amount, balance - config.total_amount);
    const audio = await spitchService.generateTTS(ttsText);
    if (audio) await log.update({ audio_url: audio.audio_url });

    await whatsappService.notifyPayrollComplete(school.phone, staffList.length, config.total_amount, balance - config.total_amount, batchId);

    res.json({ status: 'completed', batch_id: batchId, staff_count: staffList.length, total_amount: config.total_amount, audio_url: audio?.audio_url });
  } catch (err) {
    next(err);
  }
});

/**
 * @swagger
 * /api/v1/schools/{id}/payroll/history:
 *   get:
 *     summary: Get payroll execution history
 *     tags: [Payroll]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: List of past payroll runs
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/PayrollLog'
 */
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
