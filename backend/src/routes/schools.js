const router = require('express').Router();
const bcrypt = require('bcryptjs');
const { body, param, validationResult } = require('express-validator');
const { School, Student, Transaction, Forecast } = require('../models');
const squadService = require('../services/squadService');
const whatsappService = require('../services/whatsappService');
const { AuditLog } = require('../models');

// POST /api/v1/schools/onboard
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

    // KYC via Squad Sub-merchant API
    let merchantData;
    try {
      merchantData = await squadService.createSubMerchant({ display_name: name, bvn, phone_number: phone });
    } catch (err) {
      return res.status(422).json({ error: 'Identity verification failed. Please check your BVN.' });
    }

    // Create Squad Virtual Account
    const vaRes = await squadService.createVirtualAccount({
      customer_identifier: phone,
      display_name: name,
      bvn,
    });
    const nuban = vaRes?.data?.account_number;

    const password_hash = await bcrypt.hash(password, 12);

    const school = await School.create({
      name,
      phone,
      state,
      lga,
      address,
      student_count,
      fee_per_term,
      staff_count,
      avg_salary,
      nuban,
      squad_merchant_id: merchantData?.data?.merchant_id,
      bvn_verified: true,
      onboarding_status: 'onboarded',
      password_hash,
    });

    await AuditLog.create({ school_id: school.id, event_type: 'ONBOARDED', description: `${name} onboarded successfully` });
    await whatsappService.notifyOnboarding(phone, nuban);

    res.status(201).json({ school_id: school.id, nuban, status: 'onboarded' });
  } catch (err) {
    next(err);
  }
});

// GET /api/v1/schools/:id
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

// GET /api/v1/schools/:id/pl
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

    const recommendation = net_position < 0
      ? `Consider increasing fees to ₦${Math.ceil((total_expenses / (s * 3)) / 1000) * 1000 + 5000} or increasing enrolment by ${Math.ceil(-net_position / (f * 3))} students`
      : null;

    res.json({ annual_income, salary_expense, transport_estimate, feeding_estimate, utilities_estimate, maintenance_estimate, total_expenses, net_position, recommendation });
  } catch (err) {
    next(err);
  }
});

// GET /api/v1/schools/:id/dashboard
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
