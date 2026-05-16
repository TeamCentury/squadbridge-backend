const router = require('express').Router();
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { Op } = require('sequelize');
const { School, Transaction, PayrollLog, AuditLog, OpportunityPool, Employer, GigPost, Trader, Graduate, sequelize } = require('../models');
const adminAuth = require('../middleware/adminAuth');
const redis = require('../config/redis');
const logger = require('../config/logger');

// POST /api/v1/admin/login
/**
 * @swagger
 * /api/v1/admin/login:
 *   post:
 *     summary: Admin login — obtain a JWT with role=admin
 *     tags: [Admin]
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, password]
 *             properties:
 *               email:
 *                 type: string
 *                 example: admin@squadbridge.ng
 *               password:
 *                 type: string
 *     responses:
 *       200:
 *         description: Login successful
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 token:
 *                   type: string
 *       401:
 *         description: Invalid credentials
 */
router.post('/login', async (req, res, next) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'email and password are required' });
    }

    const adminEmail = process.env.ADMIN_EMAIL;
    const adminPasswordHash = process.env.ADMIN_PASSWORD_HASH;

    if (!adminEmail || !adminPasswordHash) {
      return res.status(503).json({ error: 'Admin credentials not configured' });
    }

    if (email !== adminEmail) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const valid = await bcrypt.compare(password, adminPasswordHash);
    if (!valid) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = jwt.sign(
      { role: 'admin', email },
      process.env.JWT_SECRET,
      { expiresIn: '12h' }
    );

    res.json({ token });
  } catch (err) {
    next(err);
  }
});

// All routes below require admin JWT
router.use(adminAuth);

// GET /api/v1/admin/stats
/**
 * @swagger
 * /api/v1/admin/stats:
 *   get:
 *     summary: Platform-wide metrics
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Platform stats
 */
router.get('/stats', async (req, res, next) => {
  try {
    const [schoolCount, onboardedCount, studentCount, txResult, payrollResult] = await Promise.all([
      School.count(),
      School.count({ where: { onboarding_status: 'onboarded' } }),
      School.sum('student_count'),
      Transaction.findOne({
        attributes: [
          [sequelize.fn('COUNT', sequelize.col('id')), 'tx_count'],
          [sequelize.fn('SUM', sequelize.col('amount')), 'total_volume'],
        ],
        where: { status: 'successful' },
        raw: true,
      }),
      PayrollLog.findOne({
        attributes: [
          [sequelize.fn('COUNT', sequelize.col('id')), 'payroll_count'],
          [sequelize.fn('SUM', sequelize.col('total_amount')), 'payroll_total'],
        ],
        where: { status: 'completed' },
        raw: true,
      }),
    ]);

    const failedTx = await Transaction.count({ where: { status: 'failed' } });
    const failedPayroll = await PayrollLog.count({ where: { status: 'failed' } });

    res.json({
      schools: {
        total: schoolCount,
        onboarded: onboardedCount,
        pending: schoolCount - onboardedCount,
      },
      students: studentCount || 0,
      transactions: {
        count: Number(txResult?.tx_count || 0),
        volume_ngn: Number(txResult?.total_volume || 0),
        failed: failedTx,
      },
      payroll: {
        runs: Number(payrollResult?.payroll_count || 0),
        total_paid_ngn: Number(payrollResult?.payroll_total || 0),
        failed_runs: failedPayroll,
      },
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/v1/admin/schools
/**
 * @swagger
 * /api/v1/admin/schools:
 *   get:
 *     summary: List all schools with aggregate stats
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [pending, verified, onboarded]
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 50
 *       - in: query
 *         name: offset
 *         schema:
 *           type: integer
 *           default: 0
 *     responses:
 *       200:
 *         description: List of schools
 */
router.get('/schools', async (req, res, next) => {
  try {
    const { status, limit = 50, offset = 0 } = req.query;
    const where = {};
    if (status) where.onboarding_status = status;

    const { count, rows } = await School.findAndCountAll({
      where,
      attributes: [
        'id', 'name', 'phone', 'state', 'lga', 'nuban',
        'onboarding_status', 'student_count', 'staff_count',
        'fee_per_term', 'avg_salary', 'bvn_verified', 'createdAt',
      ],
      order: [['createdAt', 'DESC']],
      limit: Math.min(Number(limit), 200),
      offset: Number(offset),
    });

    // Enrich with suspension status from Redis
    const enriched = await Promise.all(rows.map(async (s) => {
      const suspended = redis ? await redis.get(`admin:suspended:${s.id}`).catch(() => null) : null;
      return { ...s.toJSON(), is_suspended: suspended === '1' };
    }));

    res.json({ total: count, schools: enriched });
  } catch (err) {
    next(err);
  }
});

// GET /api/v1/admin/schools/:id
/**
 * @swagger
 * /api/v1/admin/schools/{id}:
 *   get:
 *     summary: Get a single school's full profile
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: School details
 *       404:
 *         description: School not found
 */
router.get('/schools/:id', async (req, res, next) => {
  try {
    const school = await School.findByPk(req.params.id);
    if (!school) return res.status(404).json({ error: 'School not found' });

    const [txStats, payrollStats, recentAudit] = await Promise.all([
      Transaction.findOne({
        where: { school_id: school.id, status: 'successful' },
        attributes: [
          [sequelize.fn('COUNT', sequelize.col('id')), 'count'],
          [sequelize.fn('SUM', sequelize.col('amount')), 'total'],
        ],
        raw: true,
      }),
      PayrollLog.findOne({
        where: { school_id: school.id },
        attributes: [
          [sequelize.fn('COUNT', sequelize.col('id')), 'runs'],
          [sequelize.fn('SUM', sequelize.col('total_amount')), 'total_paid'],
        ],
        raw: true,
      }),
      AuditLog.findAll({
        where: { school_id: school.id },
        order: [['createdAt', 'DESC']],
        limit: 10,
      }),
    ]);

    const suspended = redis ? await redis.get(`admin:suspended:${school.id}`).catch(() => null) : null;

    res.json({
      ...school.toJSON(),
      is_suspended: suspended === '1',
      stats: {
        transactions: { count: Number(txStats?.count || 0), total_ngn: Number(txStats?.total || 0) },
        payroll: { runs: Number(payrollStats?.runs || 0), total_paid_ngn: Number(payrollStats?.total_paid || 0) },
      },
      recent_audit: recentAudit,
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/v1/admin/schools/:id/suspend
/**
 * @swagger
 * /api/v1/admin/schools/{id}/suspend:
 *   post:
 *     summary: Suspend a school account
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
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
 *               reason:
 *                 type: string
 *     responses:
 *       200:
 *         description: School suspended
 *       404:
 *         description: School not found
 */
router.post('/schools/:id/suspend', async (req, res, next) => {
  try {
    const school = await School.findByPk(req.params.id);
    if (!school) return res.status(404).json({ error: 'School not found' });

    if (redis) {
      await redis.set(`admin:suspended:${school.id}`, '1');
      const reason = req.body?.reason || 'Suspended by admin';
      await redis.set(`admin:suspend_reason:${school.id}`, reason);
    }

    logger.info({ event: 'school_suspended', school_id: school.id, admin: req.user.email, reason: req.body?.reason });

    res.json({ message: `${school.name} has been suspended` });
  } catch (err) {
    next(err);
  }
});

// POST /api/v1/admin/schools/:id/unsuspend
/**
 * @swagger
 * /api/v1/admin/schools/{id}/unsuspend:
 *   post:
 *     summary: Lift suspension on a school account
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Suspension lifted
 *       404:
 *         description: School not found
 */
router.post('/schools/:id/unsuspend', async (req, res, next) => {
  try {
    const school = await School.findByPk(req.params.id);
    if (!school) return res.status(404).json({ error: 'School not found' });

    if (redis) {
      await redis.del(`admin:suspended:${school.id}`);
      await redis.del(`admin:suspend_reason:${school.id}`);
    }

    logger.info({ event: 'school_unsuspended', school_id: school.id, admin: req.user.email });

    res.json({ message: `${school.name} suspension lifted` });
  } catch (err) {
    next(err);
  }
});

// GET /api/v1/admin/transactions
/**
 * @swagger
 * /api/v1/admin/transactions:
 *   get:
 *     summary: Platform-wide transaction list
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [pending, successful, failed, reversed]
 *       - in: query
 *         name: from
 *         schema:
 *           type: string
 *           format: date
 *       - in: query
 *         name: to
 *         schema:
 *           type: string
 *           format: date
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 100
 *       - in: query
 *         name: offset
 *         schema:
 *           type: integer
 *           default: 0
 *     responses:
 *       200:
 *         description: List of transactions
 */
router.get('/transactions', async (req, res, next) => {
  try {
    const { status, from, to, limit = 100, offset = 0 } = req.query;
    const where = {};
    if (status) where.status = status;
    if (from || to) {
      where.createdAt = {};
      if (from) where.createdAt[Op.gte] = new Date(from);
      if (to) where.createdAt[Op.lte] = new Date(to);
    }

    const { count, rows } = await Transaction.findAndCountAll({
      where,
      include: [{ model: School, attributes: ['id', 'name', 'phone'] }],
      order: [['createdAt', 'DESC']],
      limit: Math.min(Number(limit), 500),
      offset: Number(offset),
    });

    res.json({ total: count, transactions: rows });
  } catch (err) {
    next(err);
  }
});

// GET /api/v1/admin/exceptions
/**
 * @swagger
 * /api/v1/admin/exceptions:
 *   get:
 *     summary: Failed events — failed transactions, failed payroll runs, failed audit events
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 50
 *     responses:
 *       200:
 *         description: Exception list
 */
router.get('/exceptions', async (req, res, next) => {
  try {
    const limit = Math.min(Number(req.query.limit || 50), 200);

    const [failedTx, failedPayroll, failedAudit] = await Promise.all([
      Transaction.findAll({
        where: { status: 'failed' },
        include: [{ model: School, attributes: ['id', 'name'] }],
        order: [['createdAt', 'DESC']],
        limit,
      }),
      PayrollLog.findAll({
        where: { status: { [Op.in]: ['failed', 'partial'] } },
        include: [{ model: School, attributes: ['id', 'name'] }],
        order: [['executed_at', 'DESC']],
        limit,
      }),
      AuditLog.findAll({
        where: { status: 'failed' },
        include: [{ model: School, attributes: ['id', 'name'] }],
        order: [['createdAt', 'DESC']],
        limit,
      }),
    ]);

    res.json({
      failed_transactions: failedTx,
      failed_payroll_runs: failedPayroll,
      failed_audit_events: failedAudit,
      summary: {
        failed_transactions: failedTx.length,
        failed_payroll_runs: failedPayroll.length,
        failed_audit_events: failedAudit.length,
      },
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/v1/admin/audit
/**
 * @swagger
 * /api/v1/admin/audit:
 *   get:
 *     summary: Platform-wide audit log
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: event_type
 *         schema:
 *           type: string
 *       - in: query
 *         name: from
 *         schema:
 *           type: string
 *           format: date
 *       - in: query
 *         name: to
 *         schema:
 *           type: string
 *           format: date
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 100
 *       - in: query
 *         name: offset
 *         schema:
 *           type: integer
 *           default: 0
 *     responses:
 *       200:
 *         description: Audit log entries
 */
router.get('/audit', async (req, res, next) => {
  try {
    const { event_type, from, to, limit = 100, offset = 0 } = req.query;
    const where = {};
    if (event_type) where.event_type = event_type;
    if (from || to) {
      where.createdAt = {};
      if (from) where.createdAt[Op.gte] = new Date(from);
      if (to) where.createdAt[Op.lte] = new Date(to);
    }

    const { count, rows } = await AuditLog.findAndCountAll({
      where,
      include: [{ model: School, attributes: ['id', 'name'] }],
      order: [['createdAt', 'DESC']],
      limit: Math.min(Number(limit), 500),
      offset: Number(offset),
    });

    res.json({ total: count, events: rows });
  } catch (err) {
    next(err);
  }
});

// POST /api/v1/admin/seed — idempotent seed for OpportunityPool (and supporting tables)
router.post('/seed', async (req, res, next) => {
  try {
    const expires = (days) => new Date(Date.now() + days * 24 * 60 * 60 * 1000);

    const EMPLOYERS = [
      { id: 'e1000000-0000-0000-0000-000000000001', name: 'Adewale Okonkwo', company: 'BuildRight Nigeria Ltd', phone: '08031000001', email: 'adewale@buildright.ng', state: 'Lagos', lga: 'Ikeja', industry: 'Construction', company_size: '11-50', bvn_verified: true },
      { id: 'e1000000-0000-0000-0000-000000000002', name: 'Ngozi Eze', company: 'TechForward Solutions', phone: '08031000002', email: 'ngozi@techforward.ng', state: 'Abuja', lga: 'Wuse', industry: 'Technology', company_size: '1-10', bvn_verified: true },
      { id: 'e1000000-0000-0000-0000-000000000003', name: 'Emeka Chukwu', company: 'Harvest Foods Nig', phone: '08031000003', email: 'emeka@harvestfoods.ng', state: 'Enugu', lga: 'Enugu North', industry: 'Food & Agriculture', company_size: '51-200', bvn_verified: false },
    ];

    const OPPORTUNITIES = [
      { id: 'op000000-0000-0000-0000-000000000001', source_url_hash: 'seed001seedseed001seedseed001seedseed001seedseed001seedseed001se', title: 'Youth Empowerment Vocational Training — LASG (Plumbing, Electrical, Welding)', organization: 'Lagos State Government — TESCOM', description: 'Free 3-month vocational training for Lagos residents aged 18–35. Trades available: plumbing, electrical installation, welding, tiling, and AC servicing. Certificate issued on completion. Limited slots.', skills_required: JSON.stringify(['plumbing', 'electrician', 'welding', 'tiling']), opportunity_type: 'training', target_user_type: 'trader', location: 'Lagos, Nigeria', pay_or_stipend: 'Free training + ₦15,000/month stipend', deadline: expires(45), external_link: 'https://tescom.lagosstate.gov.ng', source_platform: 'government', is_active: true },
      { id: 'op000000-0000-0000-0000-000000000002', source_url_hash: 'seed002seedseed002seedseed002seedseed002seedseed002seedseed002se', title: 'Jobberman Nigeria — Graduate Trainee Programme (Multiple Sectors)', organization: 'Jobberman Nigeria', description: 'Applications open for graduate trainees in banking, FMCG, technology, and consulting. Minimum 2:1 degree required. 12-month rotational programme with competitive pay.', skills_required: JSON.stringify(['microsoft excel', 'communication', 'data analysis', 'administration']), opportunity_type: 'full_time', target_user_type: 'graduate', location: 'Lagos / Abuja / Port Harcourt', pay_or_stipend: '₦120,000–₦180,000/month', deadline: expires(30), external_link: 'https://jobberman.com', source_platform: 'jobberman', is_active: true },
      { id: 'op000000-0000-0000-0000-000000000003', source_url_hash: 'seed003seedseed003seedseed003seedseed003seedseed003seedseed003se', title: 'CBN Creative Industry Financing Initiative — Artisan Loans', organization: 'Central Bank of Nigeria', description: 'Single-digit interest loans for artisans and micro-businesses in the creative sector. Trades include tailoring, hairdressing, welding, and food processing. Apply through participating microfinance banks.', skills_required: JSON.stringify(['tailoring', 'welding', 'food processing', 'hairdressing']), opportunity_type: 'grant', target_user_type: 'trader', location: 'Nationwide', pay_or_stipend: 'Loans up to ₦500,000 at 9% p.a.', deadline: expires(60), external_link: 'https://cbn.gov.ng', source_platform: 'government', is_active: true },
      { id: 'op000000-0000-0000-0000-000000000004', source_url_hash: 'seed004seedseed004seedseed004seedseed004seedseed004seedseed004se', title: 'Google Africa Developer Scholarship — Web & Android Track', organization: 'Google via Andela', description: 'Fully funded online scholarship for Africans interested in web development and Android programming. 6-month course with mentorship, community support, and job placement assistance.', skills_required: JSON.stringify(['javascript', 'react', 'android', 'python', 'frontend']), opportunity_type: 'training', target_user_type: 'graduate', location: 'Remote (Nigeria eligible)', pay_or_stipend: 'Free scholarship', deadline: expires(20), external_link: 'https://andela.com', source_platform: 'discovery_africa', is_active: true },
      { id: 'op000000-0000-0000-0000-000000000005', source_url_hash: 'seed005seedseed005seedseed005seedseed005seedseed005seedseed005se', title: 'BOI YouWin! Connect Nigeria — SME Grant (Up to ₦10M)', organization: 'Bank of Industry', description: 'Business grant competition for young Nigerians aged 18–40 with viable business ideas or existing small businesses. Categories include agro-processing, manufacturing, and digital services.', skills_required: JSON.stringify(['farming', 'agriculture', 'food processing', 'manufacturing']), opportunity_type: 'grant', target_user_type: 'all', location: 'Nationwide', pay_or_stipend: 'Grants from ₦1M to ₦10M', deadline: expires(75), external_link: 'https://boi.ng', source_platform: 'government', is_active: true },
      { id: 'op000000-0000-0000-0000-000000000006', source_url_hash: 'seed006seedseed006seedseed006seedseed006seedseed006seedseed006se', title: 'MyJobMag — Remote Customer Support Agents (Igbo/Yoruba/Hausa Speakers)', organization: 'Multiple Clients via MyJobMag', description: 'Openings for bilingual customer support representatives who speak Igbo, Yoruba, or Hausa alongside English. Work from home, part-time or full-time. Laptop required.', skills_required: JSON.stringify(['customer support', 'communication', 'data entry', 'microsoft excel']), opportunity_type: 'gig', target_user_type: 'all', location: 'Remote (Nigeria)', pay_or_stipend: '₦40,000–₦75,000/month', deadline: expires(14), external_link: 'https://myjobmag.com', source_platform: 'myjobmag', is_active: true },
    ];

    async function upsert(Model, records) {
      let created = 0, skipped = 0;
      for (const r of records) {
        const [, wasCreated] = await Model.findOrCreate({ where: { id: r.id }, defaults: r });
        wasCreated ? created++ : skipped++;
      }
      return { created, skipped };
    }

    const [empResult, oppResult] = await Promise.all([
      upsert(Employer, EMPLOYERS),
      upsert(OpportunityPool, OPPORTUNITIES),
    ]);

    logger.info({ event: 'admin_seed', admin: req.user.email, opportunities: oppResult });

    res.json({
      message: 'Seed complete',
      employers: empResult,
      opportunities: oppResult,
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
