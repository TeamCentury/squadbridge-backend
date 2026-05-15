const router = require('express').Router();
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { body, validationResult } = require('express-validator');
const { Graduate, GraduateGig, CreditProfile } = require('../models');
const squadService = require('../services/squadService');
const { sendText } = require('../services/whatsappService');
const { scoreUser, recordCreditEvent } = require('../services/creditScoringService');
const authMiddleware = require('../middleware/auth');
const logger = require('../config/logger');

function issueToken(graduate) {
  return jwt.sign(
    { user_id: graduate.id, user_type: 'graduate', phone: graduate.phone },
    process.env.JWT_SECRET,
    { expiresIn: '7d' }
  );
}

function requireGraduate(req, res, next) {
  if (req.user?.user_type !== 'graduate') {
    return res.status(403).json({ error: 'Graduate account required' });
  }
  next();
}

// ──────────────────────────────────────────────
// Registration
// ──────────────────────────────────────────────

/**
 * @swagger
 * /api/v1/graduates/register:
 *   post:
 *     summary: Register a graduate account
 *     tags: [Graduates]
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name, phone, password]
 *             properties:
 *               name:
 *                 type: string
 *                 example: Aisha Suleiman
 *               phone:
 *                 type: string
 *                 example: "+2348067001234"
 *               password:
 *                 type: string
 *               email:
 *                 type: string
 *               degree:
 *                 type: string
 *                 example: B.Sc Computer Science
 *               field_of_study:
 *                 type: string
 *               graduation_year:
 *                 type: integer
 *                 example: 2023
 *               university:
 *                 type: string
 *               skills:
 *                 type: array
 *                 items:
 *                   type: string
 *               state:
 *                 type: string
 *               bvn:
 *                 type: string
 *                 description: BVN for KYC (not stored)
 *     responses:
 *       201:
 *         description: Account created, NUBAN assigned
 *       400:
 *         description: Phone already registered
 */
router.post('/register', [
  body('name').notEmpty(),
  body('phone').notEmpty(),
  body('password').isLength({ min: 6 }),
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { name, phone, password, email, degree, field_of_study, graduation_year, university, skills, state, lga, bvn } = req.body;

    const existing = await Graduate.findOne({ where: { phone } });
    if (existing) return res.status(400).json({ error: 'Phone number already registered' });

    const password_hash = await bcrypt.hash(password, 10);

    let nuban = null;
    let squad_merchant_id = null;
    let bvn_verified = false;

    try {
      const vaRes = await squadService.createVirtualAccount({
        customer_identifier: phone.replace('+', ''),
        first_name: name.split(' ')[0],
        last_name: name.split(' ').slice(1).join(' ') || name,
        mobile_num: phone.replace('+', ''),
        bvn: bvn || undefined,
        beneficiary_account: '0000000000',
        bank_code: '000',
      });
      nuban = vaRes?.data?.virtual_account_number;
      squad_merchant_id = vaRes?.data?.merchant_id;
      bvn_verified = !!bvn;
    } catch (e) {
      logger.warn({ fn: 'graduates.register', msg: 'Squad VA failed', error: e.message });
    }

    const graduate = await Graduate.create({
      name, phone, email, password_hash,
      degree, field_of_study,
      graduation_year: graduation_year ? Number(graduation_year) : null,
      university,
      skills: skills ? JSON.stringify(skills) : null,
      state, lga, nuban, squad_merchant_id, bvn_verified,
    });

    await recordCreditEvent(graduate.id, 'graduate', 'account_created', { description: 'Account registered' });
    if (bvn_verified) await recordCreditEvent(graduate.id, 'graduate', 'bvn_verified');

    if (nuban) {
      sendText(phone, `Welcome to SquadBridge! Your earnings account: ${nuban}\nClients can pay you for gigs. Start listing: ${process.env.FRONTEND_URL || 'https://squadbridge.ng'}`).catch(() => {});
    }

    const token = issueToken(graduate);
    res.status(201).json({ token, graduate_id: graduate.id, nuban, message: 'Account created' });
  } catch (err) {
    next(err);
  }
});

// ──────────────────────────────────────────────
// Login
// ──────────────────────────────────────────────

/**
 * @swagger
 * /api/v1/graduates/login:
 *   post:
 *     summary: Graduate login
 *     tags: [Graduates]
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [phone, password]
 *             properties:
 *               phone:
 *                 type: string
 *               password:
 *                 type: string
 *     responses:
 *       200:
 *         description: JWT token
 *       401:
 *         description: Invalid credentials
 */
router.post('/login', async (req, res, next) => {
  try {
    const { phone, password } = req.body;
    if (!phone || !password) return res.status(400).json({ error: 'phone and password required' });

    const graduate = await Graduate.findOne({ where: { phone } });
    if (!graduate) return res.status(401).json({ error: 'Invalid credentials' });

    const valid = await bcrypt.compare(password, graduate.password_hash);
    if (!valid) return res.status(401).json({ error: 'Invalid credentials' });

    res.json({ token: issueToken(graduate), graduate_id: graduate.id, name: graduate.name, nuban: graduate.nuban });
  } catch (err) {
    next(err);
  }
});

// All routes below require JWT
router.use(authMiddleware, requireGraduate);

// ──────────────────────────────────────────────
// Profile
// ──────────────────────────────────────────────

/**
 * @swagger
 * /api/v1/graduates/me:
 *   get:
 *     summary: Get own graduate profile
 *     tags: [Graduates]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Graduate profile
 */
router.get('/me', async (req, res, next) => {
  try {
    const grad = await Graduate.findByPk(req.user.user_id, { attributes: { exclude: ['password_hash'] } });
    if (!grad) return res.status(404).json({ error: 'Graduate not found' });
    const parsed = grad.toJSON();
    if (parsed.skills) parsed.skills = JSON.parse(parsed.skills);
    res.json(parsed);
  } catch (err) {
    next(err);
  }
});

/**
 * @swagger
 * /api/v1/graduates/me:
 *   patch:
 *     summary: Update graduate profile
 *     tags: [Graduates]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               bio:
 *                 type: string
 *               cv_url:
 *                 type: string
 *               linkedin_url:
 *                 type: string
 *               skills:
 *                 type: array
 *                 items:
 *                   type: string
 *     responses:
 *       200:
 *         description: Updated profile
 */
router.patch('/me', async (req, res, next) => {
  try {
    const allowed = ['bio', 'cv_url', 'linkedin_url', 'state', 'lga', 'preferred_language'];
    const updates = {};
    for (const key of allowed) {
      if (req.body[key] !== undefined) updates[key] = req.body[key];
    }
    if (req.body.skills) updates.skills = JSON.stringify(req.body.skills);

    await Graduate.update(updates, { where: { id: req.user.user_id } });

    const grad = await Graduate.findByPk(req.user.user_id, { attributes: { exclude: ['password_hash'] } });
    const parsed = grad.toJSON();
    if (parsed.skills) parsed.skills = JSON.parse(parsed.skills);
    res.json(parsed);
  } catch (err) {
    next(err);
  }
});

// ──────────────────────────────────────────────
// Gig listings
// ──────────────────────────────────────────────

/**
 * @swagger
 * /api/v1/graduates/gigs:
 *   post:
 *     summary: Create a gig listing
 *     tags: [Graduates]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [title, category]
 *             properties:
 *               title:
 *                 type: string
 *                 example: WAEC/JAMB Maths Tutoring
 *               description:
 *                 type: string
 *               category:
 *                 type: string
 *                 example: tutoring
 *               rate:
 *                 type: number
 *                 example: 3000
 *               rate_type:
 *                 type: string
 *                 enum: [hourly, fixed, negotiable]
 *               location_type:
 *                 type: string
 *                 enum: [remote, onsite, hybrid]
 *               client_name:
 *                 type: string
 *               client_phone:
 *                 type: string
 *     responses:
 *       201:
 *         description: Gig created. Payment link generated if client details provided.
 */
router.post('/gigs', [
  body('title').notEmpty(),
  body('category').notEmpty(),
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { title, description, category, rate, rate_type, location_type, client_name, client_phone } = req.body;
    const gradId = req.user.user_id;

    let squad_link_url = null;
    let payment_link_id = null;

    if (client_phone && rate && rate_type === 'fixed') {
      try {
        const grad = await Graduate.findByPk(gradId);
        const linkRes = await squadService.createPaymentLink({
          name: `${grad.name} - ${title}`,
          hash: `grad-${gradId}-${Date.now()}`,
          link_status: 1,
          expire_by: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
          amount: Math.round(rate * 100),
          currency_id: 'NGN',
          description: `Payment for gig: ${title}`,
        });
        squad_link_url = linkRes?.data?.link;
        payment_link_id = linkRes?.data?.link_id;

        if (squad_link_url) {
          sendText(client_phone, `Hello ${client_name || 'there'}! Payment request from ${grad.name}.\n\nGig: ${title}\nAmount: ₦${Number(rate).toLocaleString()}\nPay here: ${squad_link_url}`).catch(() => {});
        }
      } catch (e) {
        logger.warn({ fn: 'graduates.gigs.post', msg: 'Payment link failed', error: e.message });
      }
    }

    const gig = await GraduateGig.create({
      graduate_id: gradId, title, description, category,
      rate: rate || 0,
      rate_type: rate_type || 'negotiable',
      location_type: location_type || 'remote',
      client_name, client_phone,
      squad_link_url, payment_link_id,
    });

    res.status(201).json(gig);
  } catch (err) {
    next(err);
  }
});

/**
 * @swagger
 * /api/v1/graduates/gigs:
 *   get:
 *     summary: List own gigs
 *     tags: [Graduates]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [available, busy, inactive]
 *     responses:
 *       200:
 *         description: List of gigs
 */
router.get('/gigs', async (req, res, next) => {
  try {
    const where = { graduate_id: req.user.user_id };
    if (req.query.status) where.status = req.query.status;

    const gigs = await GraduateGig.findAll({ where, order: [['createdAt', 'DESC']] });
    res.json(gigs);
  } catch (err) {
    next(err);
  }
});

/**
 * @swagger
 * /api/v1/graduates/gigs/{gigId}/complete:
 *   post:
 *     summary: Mark a gig as completed and record earnings
 *     tags: [Graduates]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: gigId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               amount_earned:
 *                 type: number
 *               squad_transaction_id:
 *                 type: string
 *     responses:
 *       200:
 *         description: Gig completed, earnings recorded
 */
router.post('/gigs/:gigId/complete', async (req, res, next) => {
  try {
    const gig = await GraduateGig.findOne({ where: { id: req.params.gigId, graduate_id: req.user.user_id } });
    if (!gig) return res.status(404).json({ error: 'Gig not found' });

    const amountEarned = Number(req.body.amount_earned || gig.rate || 0);

    await gig.update({ status: 'inactive', amount_earned: amountEarned, completed_at: new Date() });

    await Graduate.increment(
      { total_gigs: 1, total_earnings: amountEarned },
      { where: { id: req.user.user_id } }
    );

    const clientHash = gig.client_phone
      ? require('crypto').createHash('sha256').update(gig.client_phone).digest('hex').slice(0, 16)
      : null;

    await recordCreditEvent(req.user.user_id, 'graduate', 'gig_completed', {
      amount: amountEarned,
      clientId: clientHash,
      description: `Gig completed: ${gig.title}`,
      squadTransactionId: req.body.squad_transaction_id || null,
    });

    res.json({ message: 'Gig completed', gig_id: gig.id, amount_earned: amountEarned });
  } catch (err) {
    next(err);
  }
});

// ──────────────────────────────────────────────
// Income tracking
// ──────────────────────────────────────────────

/**
 * @swagger
 * /api/v1/graduates/earnings:
 *   get:
 *     summary: Income summary and history
 *     tags: [Graduates]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Earnings breakdown
 */
router.get('/earnings', async (req, res, next) => {
  try {
    const { CreditEvent } = require('../models');
    const { Op } = require('sequelize');

    const now = new Date();
    const d30ago = new Date(now - 30 * 24 * 60 * 60 * 1000);
    const d90ago = new Date(now - 90 * 24 * 60 * 60 * 1000);

    const [allGigs, events30, events90, grad] = await Promise.all([
      GraduateGig.findAll({
        where: { graduate_id: req.user.user_id, status: 'inactive', completed_at: { [Op.not]: null } },
        order: [['completed_at', 'DESC']],
      }),
      CreditEvent.findAll({
        where: { user_id: req.user.user_id, user_type: 'graduate', event_type: 'gig_completed', recorded_at: { [Op.gte]: d30ago } },
      }),
      CreditEvent.findAll({
        where: { user_id: req.user.user_id, user_type: 'graduate', event_type: 'gig_completed', recorded_at: { [Op.gte]: d90ago } },
      }),
      Graduate.findByPk(req.user.user_id, { attributes: ['total_gigs', 'total_earnings'] }),
    ]);

    const last30 = events30.reduce((s, e) => s + Number(e.amount), 0);
    const last90 = events90.reduce((s, e) => s + Number(e.amount), 0);

    res.json({
      total_gigs: grad.total_gigs,
      total_earnings_ngn: Number(grad.total_earnings),
      last_30_days_ngn: last30,
      last_90_days_ngn: last90,
      gig_history: allGigs.map((g) => ({
        title: g.title,
        category: g.category,
        amount_earned: Number(g.amount_earned),
        completed_at: g.completed_at,
      })),
    });
  } catch (err) {
    next(err);
  }
});

// ──────────────────────────────────────────────
// Payment link — ad-hoc
// ──────────────────────────────────────────────

/**
 * @swagger
 * /api/v1/graduates/payment-link:
 *   post:
 *     summary: Generate a payment link for a gig
 *     tags: [Graduates]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [amount, description]
 *             properties:
 *               amount:
 *                 type: number
 *               description:
 *                 type: string
 *               client_name:
 *                 type: string
 *               client_phone:
 *                 type: string
 *     responses:
 *       201:
 *         description: Payment link created
 */
router.post('/payment-link', [
  body('amount').isFloat({ min: 1 }),
  body('description').notEmpty(),
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { amount, description, client_name, client_phone } = req.body;
    const grad = await Graduate.findByPk(req.user.user_id);

    const linkRes = await squadService.createPaymentLink({
      name: `${grad.name} - ${description}`,
      hash: `grad-${grad.id}-${Date.now()}`,
      link_status: 1,
      expire_by: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      amount: Math.round(amount * 100),
      currency_id: 'NGN',
      description,
    });

    const paymentUrl = linkRes?.data?.link;

    if (client_phone && paymentUrl) {
      sendText(client_phone, `Hello ${client_name || 'there'}! Payment request from ${grad.name}.\n\nAmount: ₦${Number(amount).toLocaleString()}\nPay here: ${paymentUrl}`).catch(() => {});
    }

    res.status(201).json({
      payment_url: paymentUrl,
      payment_link_id: linkRes?.data?.link_id,
      amount,
      client_notified: !!(client_phone && paymentUrl),
    });
  } catch (err) {
    next(err);
  }
});

// ──────────────────────────────────────────────
// Credit score
// ──────────────────────────────────────────────

/**
 * @swagger
 * /api/v1/graduates/credit:
 *   get:
 *     summary: Get own credit score
 *     tags: [Graduates]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Credit score and breakdown
 */
router.get('/credit', async (req, res, next) => {
  try {
    const result = await scoreUser(req.user.user_id, 'graduate');
    res.json(result);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
