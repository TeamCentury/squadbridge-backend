const router = require('express').Router();
const bcrypt = require('bcryptjs');
const { body, param, validationResult } = require('express-validator');
const { School, Student, Transaction, Forecast } = require('../models');
const squadService = require('../services/squadService');
const whatsappService = require('../services/whatsappService');
const { AuditLog } = require('../models');
const { generatePLRecommendation } = require('../services/claudeService');

/**
 * @swagger
 * /api/v1/schools/onboard:
 *   post:
 *     summary: Onboard a new school
 *     description: |
 *       Validates BVN via Squad KYC, provisions a Squad Virtual Account (NUBAN),
 *       saves the school record, and sends a WhatsApp welcome notification.
 *     tags: [Schools]
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name, phone, bvn, state, lga, student_count, fee_per_term, staff_count, avg_salary, password]
 *             properties:
 *               name:
 *                 type: string
 *                 example: Sunrise Academy
 *               phone:
 *                 type: string
 *                 example: "+2348012345678"
 *               bvn:
 *                 type: string
 *                 example: "12345678901"
 *                 description: 11-digit BVN — used for KYC only, never stored
 *               state:
 *                 type: string
 *                 example: Lagos
 *               lga:
 *                 type: string
 *                 example: Ikeja
 *               address:
 *                 type: string
 *                 example: 14 School Road, Ikeja
 *               student_count:
 *                 type: integer
 *                 example: 150
 *               fee_per_term:
 *                 type: number
 *                 example: 65000
 *               staff_count:
 *                 type: integer
 *                 example: 20
 *               avg_salary:
 *                 type: number
 *                 example: 85000
 *               password:
 *                 type: string
 *                 minLength: 6
 *                 example: securepass123
 *     responses:
 *       201:
 *         description: School onboarded successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 school_id:
 *                   type: string
 *                   format: uuid
 *                 nuban:
 *                   type: string
 *                   example: "0123456789"
 *                 status:
 *                   type: string
 *                   example: onboarded
 *       400:
 *         description: Validation error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ValidationError'
 *       422:
 *         description: BVN verification failed
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.post('/onboard', [
  body('name').trim().notEmpty(),
  body('phone').matches(/^\+?234[0-9]{10}$/).withMessage('Valid Nigerian phone required'),
  body('bvn').matches(/^[0-9]{11}$/).withMessage('BVN must be 11 digits'),
  body('state').notEmpty(),
  body('lga').notEmpty(),
  body('student_count').isInt({ min: 1 }),
  body('fee_per_term').isFloat({ min: 0 }),
  body('staff_count').isInt({ min: 0 }),
  body('avg_salary').isFloat({ min: 0 }),
  body('password').isLength({ min: 6 }),
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { name, phone, bvn, state, lga, address, student_count, fee_per_term, staff_count, avg_salary, password } = req.body;

    let merchantData;
    try {
      merchantData = await squadService.createSubMerchant({ display_name: name, bvn, phone_number: phone });
    } catch (err) {
      return res.status(422).json({ error: 'Identity verification failed. Please check your BVN.' });
    }

    const vaRes = await squadService.createVirtualAccount({
      customer_identifier: phone,
      display_name: name,
      bvn,
    });
    const nuban = vaRes?.data?.account_number;

    const password_hash = await bcrypt.hash(password, 12);

    const school = await School.create({
      name, phone, state, lga, address, student_count, fee_per_term, staff_count, avg_salary,
      nuban, squad_merchant_id: merchantData?.data?.merchant_id,
      bvn_verified: true, onboarding_status: 'onboarded', password_hash,
    });

    await AuditLog.create({ school_id: school.id, event_type: 'ONBOARDED', description: `${name} onboarded successfully` });
    await whatsappService.notifyOnboarding(phone, nuban);

    res.status(201).json({ school_id: school.id, nuban, status: 'onboarded' });
  } catch (err) {
    next(err);
  }
});

/**
 * @swagger
 * /api/v1/schools/{id}:
 *   get:
 *     summary: Get school profile
 *     tags: [Schools]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: School UUID
 *     responses:
 *       200:
 *         description: School profile
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/School'
 *       404:
 *         description: School not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.get('/:id', [param('id').isUUID()], async (req, res, next) => {
  try {
    const school = await School.findByPk(req.params.id, {
      attributes: { exclude: ['password_hash'] },
    });
    if (!school) return res.status(404).json({ error: 'School not found' });
    res.json(school);
  } catch (err) {
    next(err);
  }
});

/**
 * @swagger
 * /api/v1/schools/{id}/pl:
 *   get:
 *     summary: Get auto-generated P&L for a school
 *     description: |
 *       Calculates annual income, all expense categories, net position,
 *       and an actionable recommendation if in deficit.
 *     tags: [Schools]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: P&L breakdown
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/PL'
 *       404:
 *         description: School not found
 */
router.get('/:id/pl', async (req, res, next) => {
  try {
    const school = await School.findByPk(req.params.id);
    if (!school) return res.status(404).json({ error: 'School not found' });

    const s = parseFloat(school.student_count);
    const f = parseFloat(school.fee_per_term);
    const sc = parseFloat(school.staff_count);
    const sa = parseFloat(school.avg_salary);

    const annual_income = f * s * 3;
    const salary_expense = sa * sc * 12;
    const transport_estimate = 3000 * (0.8 * s) * 12;
    const feeding_estimate = 2500 * (0.7 * s) * 12;
    const utilities_estimate = 150000 * 12;
    const maintenance_estimate = 100000 * 12;
    const total_expenses = salary_expense + transport_estimate + feeding_estimate + utilities_estimate + maintenance_estimate;
    const net_position = annual_income - total_expenses;

    const plData = { annual_income, total_expenses, net_position, salary_expense, student_count: s, fee_per_term: f, staff_count: sc };
    const recommendation = await generatePLRecommendation(plData, school.name).catch(() => null);

    res.json({ annual_income, salary_expense, transport_estimate, feeding_estimate, utilities_estimate, maintenance_estimate, total_expenses, net_position, recommendation });
  } catch (err) {
    next(err);
  }
});

/**
 * @swagger
 * /api/v1/schools/{id}/dashboard:
 *   get:
 *     summary: Get aggregated dashboard data
 *     description: |
 *       Returns live Squad balance, collection totals, recent transactions,
 *       and the latest cash flow forecast in one call.
 *     tags: [Schools]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Dashboard aggregated data
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 balance:
 *                   type: number
 *                   example: 4700000
 *                 total_collected:
 *                   type: number
 *                   example: 4680000
 *                 total_expected:
 *                   type: number
 *                   example: 9750000
 *                 students_paid:
 *                   type: integer
 *                   example: 72
 *                 total_students:
 *                   type: integer
 *                   example: 150
 *                 recent_transactions:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Transaction'
 *                 forecast:
 *                   $ref: '#/components/schemas/Forecast'
 *       404:
 *         description: School not found
 */
router.get('/:id/dashboard', async (req, res, next) => {
  try {
    const school = await School.findByPk(req.params.id);
    if (!school) return res.status(404).json({ error: 'School not found' });

    const [balanceRes, students, recentTx, forecast] = await Promise.all([
      squadService.getBalance(school.squad_merchant_id).catch(() => null),
      Student.findAll({ where: { school_id: school.id } }),
      Transaction.findAll({ where: { school_id: school.id, status: 'successful' }, order: [['createdAt', 'DESC']], limit: 5 }),
      Forecast.findOne({ where: { school_id: school.id }, order: [['generated_at', 'DESC']] }),
    ]);

    const paidCount = students.filter((s) => s.fee_status === 'paid').length;
    const totalCollected = students.reduce((sum, s) => sum + parseFloat(s.amount_paid), 0);
    const totalExpected = students.reduce((sum, s) => sum + parseFloat(s.fee_amount), 0);

    res.json({
      balance: balanceRes?.data?.balance || 0,
      total_collected: totalCollected,
      total_expected: totalExpected,
      students_paid: paidCount,
      total_students: students.length,
      recent_transactions: recentTx,
      forecast: forecast || null,
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
