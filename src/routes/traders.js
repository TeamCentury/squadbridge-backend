const router = require('express').Router();
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { body, validationResult } = require('express-validator');
const { Trader, TraderJob, CreditProfile } = require('../models');
const squadService = require('../services/squadService');
const { sendText } = require('../services/whatsappService');
const { scoreUser, recordCreditEvent } = require('../services/creditScoringService');
const authMiddleware = require('../middleware/auth');
const logger = require('../config/logger');

// ──────────────────────────────────────────────
// Auth helpers
// ──────────────────────────────────────────────

function issueToken(trader) {
  return jwt.sign(
    { user_id: trader.id, user_type: 'trader', phone: trader.phone },
    process.env.JWT_SECRET,
    { expiresIn: '7d' }
  );
}

function requireTrader(req, res, next) {
  if (req.user?.user_type !== 'trader') {
    return res.status(403).json({ error: 'Trader account required' });
  }
  next();
}

// ──────────────────────────────────────────────
// Registration
// ──────────────────────────────────────────────

/**
 * @swagger
 * /api/v1/traders/register:
 *   post:
 *     summary: Register a trader/artisan account
 *     tags: [Traders]
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name, phone, password, business_type]
 *             properties:
 *               name:
 *                 type: string
 *                 example: Emeka Plumbing Works
 *               phone:
 *                 type: string
 *                 example: "+2348055001234"
 *               password:
 *                 type: string
 *               business_name:
 *                 type: string
 *               business_type:
 *                 type: string
 *                 enum: [artisan, trader, vendor, contractor, service_provider]
 *               skills:
 *                 type: array
 *                 items:
 *                   type: string
 *                 example: ["plumbing", "pipe fitting"]
 *               state:
 *                 type: string
 *               lga:
 *                 type: string
 *               bvn:
 *                 type: string
 *                 description: 11-digit BVN for KYC (not stored)
 *     responses:
 *       201:
 *         description: Account created, NUBAN assigned
 *       400:
 *         description: Validation error or phone already registered
 */
router.post('/register', [
  body('name').notEmpty(),
  body('phone').notEmpty(),
  body('password').isLength({ min: 6 }),
  body('business_type').notEmpty(),
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { name, phone, password, business_name, business_type, skills, state, lga, address, bvn, email } = req.body;

    const existing = await Trader.findOne({ where: { phone } });
    if (existing) return res.status(400).json({ error: 'Phone number already registered' });

    const password_hash = await bcrypt.hash(password, 10);

    // Create Squad virtual account for receiving payments
    let nuban = null;
    let squad_merchant_id = null;
    let bvn_verified = false;

    try {
      const vaRes = await squadService.createVirtualAccount({
        customer_identifier: phone.replace('+', ''),
        first_name: name.split(' ')[0],
        last_name: name.split(' ').slice(1).join(' ') || name,
        mobile_num: phone.replace('+', ''),
        bvn: bvn || '22222222222',
        dob: req.body.dob || '01/01/1990', // MM/DD/YYYY
        address: address || `${lga || ''}, ${state || 'Lagos'}`,
        gender: req.body.gender || '1',
      });
      nuban = vaRes?.data?.virtual_account_number;
      squad_merchant_id = vaRes?.data?.merchant_id;
      bvn_verified = !!bvn;
    } catch (e) {
      logger.warn({ fn: 'traders.register', msg: 'Squad VA failed', error: e.message });
    }

    const trader = await Trader.create({
      name, phone, email, password_hash,
      business_name: business_name || name,
      business_type,
      skills: skills ? JSON.stringify(skills) : null,
      state, lga, address, nuban, squad_merchant_id,
      bvn_verified,
    });

    await recordCreditEvent(trader.id, 'trader', 'account_created', { description: 'Account registered' });
    if (bvn_verified) await recordCreditEvent(trader.id, 'trader', 'bvn_verified');

    if (nuban) {
      sendText(phone, `Welcome to SquadBridge! Your payment account: ${nuban}\nClients can pay you directly. Start posting jobs: ${process.env.FRONTEND_URL || 'https://squadbridge.ng'}`).catch(() => {});
    }

    const token = issueToken(trader);
    res.status(201).json({ token, trader_id: trader.id, nuban, message: 'Account created' });
  } catch (err) {
    next(err);
  }
});

// ──────────────────────────────────────────────
// Login
// ──────────────────────────────────────────────

/**
 * @swagger
 * /api/v1/traders/login:
 *   post:
 *     summary: Trader login
 *     tags: [Traders]
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

    const trader = await Trader.findOne({ where: { phone } });
    if (!trader) return res.status(401).json({ error: 'Invalid credentials' });

    const valid = await bcrypt.compare(password, trader.password_hash);
    if (!valid) return res.status(401).json({ error: 'Invalid credentials' });

    res.json({ token: issueToken(trader), trader_id: trader.id, name: trader.name, nuban: trader.nuban });
  } catch (err) {
    next(err);
  }
});

// All routes below require JWT
router.use(authMiddleware, requireTrader);

// ──────────────────────────────────────────────
// Profile
// ──────────────────────────────────────────────

/**
 * @swagger
 * /api/v1/traders/me:
 *   get:
 *     summary: Get own trader profile
 *     tags: [Traders]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Trader profile
 */
router.get('/me', async (req, res, next) => {
  try {
    const trader = await Trader.findByPk(req.user.user_id, {
      attributes: { exclude: ['password_hash'] },
    });
    if (!trader) return res.status(404).json({ error: 'Trader not found' });
    const parsed = trader.toJSON();
    if (parsed.skills) parsed.skills = JSON.parse(parsed.skills);
    res.json(parsed);
  } catch (err) {
    next(err);
  }
});

/**
 * @swagger
 * /api/v1/traders/me:
 *   patch:
 *     summary: Update trader profile
 *     tags: [Traders]
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
 *               skills:
 *                 type: array
 *                 items:
 *                   type: string
 *               address:
 *                 type: string
 *               preferred_language:
 *                 type: string
 *     responses:
 *       200:
 *         description: Updated profile
 */
router.patch('/me', async (req, res, next) => {
  try {
    const allowed = ['bio', 'business_name', 'address', 'state', 'lga', 'profile_image_url', 'preferred_language'];
    const updates = {};
    for (const key of allowed) {
      if (req.body[key] !== undefined) updates[key] = req.body[key];
    }
    if (req.body.skills) updates.skills = JSON.stringify(req.body.skills);

    await Trader.update(updates, { where: { id: req.user.user_id } });

    const trader = await Trader.findByPk(req.user.user_id, { attributes: { exclude: ['password_hash'] } });
    const parsed = trader.toJSON();
    if (parsed.skills) parsed.skills = JSON.parse(parsed.skills);
    res.json(parsed);
  } catch (err) {
    next(err);
  }
});

// ──────────────────────────────────────────────
// Jobs (service listings)
// ──────────────────────────────────────────────

/**
 * @swagger
 * /api/v1/traders/jobs:
 *   post:
 *     summary: Post a new job/service
 *     tags: [Traders]
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
 *                 example: Kitchen plumbing repair
 *               description:
 *                 type: string
 *               category:
 *                 type: string
 *                 example: plumbing
 *               price_type:
 *                 type: string
 *                 enum: [fixed, negotiable, hourly]
 *               price:
 *                 type: number
 *               location:
 *                 type: string
 *               client_name:
 *                 type: string
 *               client_phone:
 *                 type: string
 *     responses:
 *       201:
 *         description: Job posted. If client_phone + price given, a Squad payment link is generated.
 */
router.post('/jobs', [
  body('title').notEmpty(),
  body('category').notEmpty(),
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { title, description, category, price_type, price, location, client_name, client_phone } = req.body;
    const traderId = req.user.user_id;

    let squad_link_url = null;
    let payment_link_id = null;

    // Auto-generate payment link if client details + fixed price provided
    if (client_phone && price && price_type === 'fixed') {
      try {
        const trader = await Trader.findByPk(traderId);
        const linkRes = await squadService.createPaymentLink({
          name: `${trader.business_name || trader.name} - ${title}`,
          hash: `trader-${traderId}-${Date.now()}`,
          link_status: 1,
          expire_by: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
          amount: Math.round(price * 100),
          currency_id: 'NGN',
          description: `Payment for: ${title}`,
        });
        squad_link_url = linkRes?.data?.link;
        payment_link_id = linkRes?.data?.link_id;

        if (squad_link_url) {
          sendText(client_phone, `Hello ${client_name || 'there'}! Payment request from ${trader.business_name || trader.name}.\n\nService: ${title}\nAmount: ₦${Number(price).toLocaleString()}\nPay here: ${squad_link_url}\n\nPowered by SquadBridge`).catch(() => {});
        }
      } catch (e) {
        logger.warn({ fn: 'traders.jobs.post', msg: 'Payment link failed', error: e.message });
      }
    }

    const job = await TraderJob.create({
      trader_id: traderId,
      title, description, category,
      price_type: price_type || 'negotiable',
      price: price || 0,
      location,
      client_name, client_phone,
      squad_link_url, payment_link_id,
    });

    res.status(201).json(job);
  } catch (err) {
    next(err);
  }
});

/**
 * @swagger
 * /api/v1/traders/jobs:
 *   get:
 *     summary: List own jobs
 *     tags: [Traders]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [open, in_progress, completed, cancelled]
 *     responses:
 *       200:
 *         description: List of jobs
 */
router.get('/jobs', async (req, res, next) => {
  try {
    const where = { trader_id: req.user.user_id };
    if (req.query.status) where.status = req.query.status;

    const jobs = await TraderJob.findAll({ where, order: [['createdAt', 'DESC']] });
    res.json(jobs);
  } catch (err) {
    next(err);
  }
});

/**
 * @swagger
 * /api/v1/traders/jobs/{jobId}/complete:
 *   post:
 *     summary: Mark a job as completed and record payment received
 *     tags: [Traders]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: jobId
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
 *               amount_paid:
 *                 type: number
 *               squad_transaction_id:
 *                 type: string
 *     responses:
 *       200:
 *         description: Job completed, credit event recorded
 */
router.post('/jobs/:jobId/complete', async (req, res, next) => {
  try {
    const job = await TraderJob.findOne({ where: { id: req.params.jobId, trader_id: req.user.user_id } });
    if (!job) return res.status(404).json({ error: 'Job not found' });

    const amountPaid = Number(req.body.amount_paid || job.price || 0);

    await job.update({ status: 'completed', completed_at: new Date() });

    // Update trader aggregates
    await Trader.increment(
      { total_jobs: 1, total_earnings: amountPaid },
      { where: { id: req.user.user_id } }
    );

    // Record credit event
    const clientHash = job.client_phone
      ? require('crypto').createHash('sha256').update(job.client_phone).digest('hex').slice(0, 16)
      : null;

    await recordCreditEvent(req.user.user_id, 'trader', 'job_completed', {
      amount: amountPaid,
      clientId: clientHash,
      description: `Job completed: ${job.title}`,
      squadTransactionId: req.body.squad_transaction_id || null,
    });

    res.json({ message: 'Job marked complete', job_id: job.id, amount_paid: amountPaid });
  } catch (err) {
    next(err);
  }
});

// ──────────────────────────────────────────────
// Payment link — generate for any ad-hoc payment
// ──────────────────────────────────────────────

/**
 * @swagger
 * /api/v1/traders/payment-link:
 *   post:
 *     summary: Generate a Squad payment link for a service/product
 *     tags: [Traders]
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
 *                 example: 15000
 *               description:
 *                 type: string
 *                 example: "Chair repair service"
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
    const trader = await Trader.findByPk(req.user.user_id);

    const linkRes = await squadService.createPaymentLink({
      name: `${trader.business_name || trader.name} - ${description}`,
      hash: `trader-${trader.id}-${Date.now()}`,
      link_status: 1,
      expire_by: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      amount: Math.round(amount * 100),
      currency_id: 'NGN',
      description,
    });

    const paymentUrl = linkRes?.data?.link;

    if (client_phone && paymentUrl) {
      sendText(client_phone, `Hello ${client_name || 'there'}! Payment request from ${trader.business_name || trader.name}.\n\nAmount: ₦${Number(amount).toLocaleString()}\nPay here: ${paymentUrl}`).catch(() => {});
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
 * /api/v1/traders/credit:
 *   get:
 *     summary: Get own credit score
 *     tags: [Traders]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Credit score and breakdown
 */
router.get('/credit', async (req, res, next) => {
  try {
    const result = await scoreUser(req.user.user_id, 'trader');
    res.json(result);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
