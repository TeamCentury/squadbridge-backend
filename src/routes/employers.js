const router = require('express').Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { Employer, GigPost, GigApplication, Trader, Graduate, EscrowAccount } = require('../models');
const squadService = require('../services/squadService');

const isProd = process.env.NODE_ENV === 'production';
const safeErr = (err) => isProd ? 'Internal server error' : err.message;
const escrowService = require('../services/escrowService');
const { recordCreditEvent } = require('../services/creditScoringService');
const logger = require('../config/logger');

const auth = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'No token' });
  try {
    req.employer = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch { res.status(401).json({ error: 'Invalid token' }); }
};

/**
 * @swagger
 * /api/v1/employers/register:
 *   post:
 *     summary: Register an employer account
 *     tags: [Employers]
 *     security: []
 */
router.post('/register', async (req, res) => {
  try {
    const { name, email, password, phone, business_name, business_type, address, state } = req.body;
    if (!name || !email || !password || !phone) return res.status(400).json({ error: 'name, email, password, phone required' });

    const existing = await Employer.findOne({ where: { email } });
    if (existing) return res.status(409).json({ error: 'Email already registered' });

    const password_hash = await bcrypt.hash(password, 10);
    const employer = await Employer.create({
      name, email, password_hash, phone, business_name, business_type,
      address: address || 'Nigeria', state: state || 'Lagos',
    });

    // Create Squad Virtual Account for the employer
    try {
      const vaRes = await squadService.createVirtualAccount({
        first_name: name.split(' ')[0],
        last_name: name.split(' ').slice(1).join(' ') || name.split(' ')[0],
        mobile_num: phone.replace(/^\+/, '').replace(/^234/, '0'),
        email,
        bvn: '22222222222',
        dob: '01/01/1985',
        address: address || '1 Business District, Lagos',
        gender: '1',
        customer_identifier: `employer_${employer.id.slice(0, 8)}`,
        beneficiary_account: '0000000000',
      });
      const va = vaRes?.data;
      if (va?.virtual_account_number) {
        await employer.update({
          squad_virtual_account: va.virtual_account_number,
          squad_customer_id: va.customer_identifier,
        });
      }
    } catch (vaErr) {
      logger.warn({ fn: 'employers.register.va', error: vaErr.message });
    }

    const token = jwt.sign({ id: employer.id, type: 'employer' }, process.env.JWT_SECRET, { expiresIn: '30d' });
    res.status(201).json({ message: 'Employer registered', token, employer: { id: employer.id, name: employer.name, email: employer.email, squad_virtual_account: employer.squad_virtual_account } });
  } catch (err) {
    logger.error({ fn: 'employers.register', error: err.message });
    res.status(500).json({ error: safeErr(err) });
  }
});

/**
 * @swagger
 * /api/v1/employers/login:
 *   post:
 *     summary: Employer login
 *     tags: [Employers]
 *     security: []
 */
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const employer = await Employer.findOne({ where: { email } });
    if (!employer || !(await bcrypt.compare(password, employer.password_hash))) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    const token = jwt.sign({ id: employer.id, type: 'employer' }, process.env.JWT_SECRET, { expiresIn: '30d' });
    res.json({ token, employer: { id: employer.id, name: employer.name, email: employer.email, business_name: employer.business_name } });
  } catch (err) {
    res.status(500).json({ error: safeErr(err) });
  }
});

/**
 * @swagger
 * /api/v1/employers/me:
 *   get:
 *     summary: Get employer profile
 *     tags: [Employers]
 */
router.get('/me', auth, async (req, res) => {
  try {
    const employer = await Employer.findByPk(req.employer.id, {
      attributes: { exclude: ['password_hash'] },
    });
    if (!employer) return res.status(404).json({ error: 'Employer not found' });
    res.json(employer);
  } catch (err) { res.status(500).json({ error: safeErr(err) }); }
});

router.patch('/me', auth, async (req, res) => {
  try {
    const employer = await Employer.findByPk(req.employer.id);
    if (!employer) return res.status(404).json({ error: 'Not found' });
    const { business_name, business_type, address, state, bio } = req.body;
    await employer.update({ business_name, business_type, address, state, bio });
    res.json({ message: 'Profile updated', employer });
  } catch (err) { res.status(500).json({ error: safeErr(err) }); }
});

/**
 * @swagger
 * /api/v1/employers/talent:
 *   get:
 *     summary: Browse available workers (traders + graduates) by skill
 *     tags: [Employers]
 */
router.get('/talent', auth, async (req, res) => {
  try {
    const { skill, type, state } = req.query;
    const { Op } = require('sequelize');

    const traderWhere = { is_active: true, is_available: true };
    const graduateWhere = { is_active: true, is_available: true };

    if (skill) {
      traderWhere.skills = { [Op.like]: `%${skill}%` };
      graduateWhere.skills = { [Op.like]: `%${skill}%` };
    }
    if (state) {
      traderWhere.state = state;
      graduateWhere.state = state;
    }

    const [traders, graduates] = await Promise.all([
      type !== 'graduate' ? Trader.findAll({
        where: traderWhere,
        // Phone excluded — only shared after hire acceptance
        attributes: ['id', 'name', 'skills', 'primary_trade', 'state', 'rating', 'jobs_completed', 'hourly_rate'],
        limit: 20,
      }) : [],
      type !== 'trader' ? Graduate.findAll({
        where: graduateWhere,
        attributes: ['id', 'name', 'skills', 'degree', 'field_of_study', 'state', 'rating', 'gigs_completed'],
        limit: 20,
      }) : [],
    ]);

    res.json({
      traders: traders.map((t) => ({ ...t.toJSON(), user_type: 'trader' })),
      graduates: graduates.map((g) => ({ ...g.toJSON(), user_type: 'graduate' })),
      total: traders.length + graduates.length,
    });
  } catch (err) { res.status(500).json({ error: safeErr(err) }); }
});

/**
 * @swagger
 * /api/v1/employers/hire:
 *   post:
 *     summary: Hire a worker — creates escrow and notifies worker
 *     tags: [Employers]
 */
router.post('/hire', auth, async (req, res) => {
  try {
    const { worker_id, worker_type, gig_post_id, agreed_amount, job_title, job_description, duration_days } = req.body;
    if (!worker_id || !worker_type || !agreed_amount || !job_title) {
      return res.status(400).json({ error: 'worker_id, worker_type, agreed_amount, job_title required' });
    }

    const employer = await Employer.findByPk(req.employer.id, { attributes: { exclude: ['password_hash'] } });

    let workerPhone = null;
    if (worker_type === 'trader') {
      const w = await Trader.findByPk(worker_id, { attributes: ['phone'] });
      workerPhone = w?.phone;
    } else if (worker_type === 'graduate') {
      const w = await Graduate.findByPk(worker_id, { attributes: ['phone'] });
      workerPhone = w?.phone;
    }

    const escrow = await escrowService.createEscrow({
      employerId: req.employer.id,
      workerId: worker_id,
      workerType: worker_type,
      gigPostId: gig_post_id || null,
      agreedAmount: agreed_amount,
      jobTitle: job_title,
      jobDescription: job_description,
      durationDays: duration_days,
      workerPhone,
      employerPhone: employer.phone,
    });

    res.status(201).json({
      message: 'Hire request created with escrow',
      escrow_id: escrow.id,
      payment_nuban: escrow.squad_dynamic_nuban,
      amount: agreed_amount,
      instructions: `Pay ₦${Number(agreed_amount).toLocaleString()} to ${escrow.squad_dynamic_nuban} (GTBank) to activate the job.`,
    });
  } catch (err) {
    logger.error({ fn: 'employers.hire', error: err.message });
    res.status(500).json({ error: safeErr(err) });
  }
});

/**
 * @swagger
 * /api/v1/employers/escrow/{escrowId}/release:
 *   post:
 *     summary: Confirm job complete and release payment to worker
 *     tags: [Employers]
 */
router.post('/escrow/:escrowId/release', auth, async (req, res) => {
  try {
    const { escrowId } = req.params;
    const { worker_bank_code, worker_account, worker_name } = req.body;

    const escrow = await EscrowAccount.findByPk(escrowId);
    if (!escrow) return res.status(404).json({ error: 'Escrow not found' });
    if (escrow.employer_id !== req.employer.id) return res.status(403).json({ error: 'Not your escrow' });

    let workerPhone = null;
    if (escrow.worker_type === 'trader') {
      const w = await Trader.findByPk(escrow.worker_id, { attributes: ['phone'] });
      workerPhone = w?.phone;
    } else {
      const w = await Graduate.findByPk(escrow.worker_id, { attributes: ['phone'] });
      workerPhone = w?.phone;
    }

    const result = await escrowService.releaseEscrow(escrowId, worker_bank_code, worker_account, worker_name, workerPhone);

    // Record credit event for worker
    await recordCreditEvent(escrow.worker_id, escrow.worker_type, 'payment_received', {
      amount: result.net_paid,
      clientId: req.employer.id,
      description: `Escrow release: ${escrow.job_title}`,
      squadTransactionId: escrow.squad_transaction_id,
    });

    // Update employer stats
    const employer = await Employer.findByPk(req.employer.id);
    await employer.update({
      total_hires: (employer.total_hires || 0) + 1,
      total_spent_ngn: (Number(employer.total_spent_ngn) || 0) + Number(escrow.agreed_amount),
    });

    res.json({ message: 'Payment released', net_paid: result.net_paid, fee: result.fee });
  } catch (err) {
    logger.error({ fn: 'employers.release', error: err.message });
    res.status(500).json({ error: safeErr(err) });
  }
});

/**
 * @swagger
 * /api/v1/employers/escrow/{escrowId}/dispute:
 *   post:
 *     summary: Raise a dispute on an escrow
 *     tags: [Employers]
 */
router.post('/escrow/:escrowId/dispute', auth, async (req, res) => {
  try {
    const { reason } = req.body;
    const escrow = await EscrowAccount.findByPk(req.params.escrowId);
    if (!escrow) return res.status(404).json({ error: 'Escrow not found' });
    if (escrow.employer_id !== req.employer.id) return res.status(403).json({ error: 'Not your escrow' });

    const employer = await Employer.findByPk(req.employer.id, { attributes: ['phone'] });
    await escrowService.raiseDispute(req.params.escrowId, reason, employer.phone);
    res.json({ message: 'Dispute raised. Our team will review within 24 hours.' });
  } catch (err) { res.status(500).json({ error: safeErr(err) }); }
});

/**
 * @swagger
 * /api/v1/employers/escrows:
 *   get:
 *     summary: List employer's escrow accounts
 *     tags: [Employers]
 */
router.get('/escrows', auth, async (req, res) => {
  try {
    const escrows = await EscrowAccount.findAll({
      where: { employer_id: req.employer.id },
      order: [['createdAt', 'DESC']],
    });
    res.json(escrows);
  } catch (err) { res.status(500).json({ error: safeErr(err) }); }
});

module.exports = router;
