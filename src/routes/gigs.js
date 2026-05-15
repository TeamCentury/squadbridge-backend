const router = require('express').Router();
const jwt = require('jsonwebtoken');
const { GigPost, GigApplication, Trader, Graduate, Employer, EscrowAccount } = require('../models');
const escrowService = require('../services/escrowService');
const { recordCreditEvent } = require('../services/creditScoringService');
const logger = require('../config/logger');

const isProd = process.env.NODE_ENV === 'production';
const safeErr = (err) => isProd ? 'Internal server error' : err.message;

// Generic auth — accepts trader, graduate, or employer JWT
// Normalizes both JWT shapes: trader/graduate {user_id, user_type} and employer {id, type}
function auth(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'No token' });
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.actor = {
      ...decoded,
      id:   decoded.user_id   || decoded.id,
      type: decoded.user_type || decoded.type,
    };
    next();
  } catch { res.status(401).json({ error: 'Invalid token' }); }
}

/**
 * @swagger
 * /api/v1/gigs:
 *   post:
 *     summary: Post a gig (employer or trader can post)
 *     tags: [Gigs]
 */
router.post('/', auth, async (req, res) => {
  try {
    const {
      title, description, category, budget_min, budget_max, budget_fixed,
      rate_type, skills_required, target_user_type, location_type,
      state, deadline, duration_days,
    } = req.body;

    if (!title || !description || !category) {
      return res.status(400).json({ error: 'title, description, category required' });
    }

    const expiresAt = deadline ? new Date(deadline) : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

    const gig = await GigPost.create({
      poster_id: req.actor.id,
      poster_type: req.actor.type,
      title,
      description,
      category,
      budget_min: budget_min || null,
      budget_max: budget_max || null,
      budget_fixed: budget_fixed || null,
      rate_type: rate_type || 'fixed',
      skills_required: JSON.stringify(skills_required || []),
      target_user_type: target_user_type || 'all',
      location_type: location_type || 'remote',
      state: state || 'Lagos',
      expires_at: expiresAt,
      duration_days: duration_days || null,
      status: 'open',
    });

    res.status(201).json({ message: 'Gig posted', gig });
  } catch (err) {
    logger.error({ fn: 'gigs.post', error: err.message });
    res.status(500).json({ error: safeErr(err) });
  }
});

/**
 * @swagger
 * /api/v1/gigs:
 *   get:
 *     summary: Browse open gigs (filterable by category, skill, location)
 *     tags: [Gigs]
 *     security: []
 */
router.get('/', async (req, res) => {
  try {
    const { category, skill, location_type, target_user_type, state, limit = 20, offset = 0 } = req.query;
    const { Op } = require('sequelize');

    const where = { status: 'open', expires_at: { [Op.gt]: new Date() } };
    if (category) where.category = category;
    if (location_type) where.location_type = location_type;
    if (state) where.state = state;
    if (target_user_type) where.target_user_type = { [Op.in]: [target_user_type, 'all'] };
    if (skill) where.skills_required = { [Op.like]: `%${skill}%` };

    const gigs = await GigPost.findAll({
      where,
      order: [['createdAt', 'DESC']],
      limit: parseInt(limit),
      offset: parseInt(offset),
    });

    res.json({ gigs, count: gigs.length });
  } catch (err) { res.status(500).json({ error: safeErr(err) }); }
});

/**
 * @swagger
 * /api/v1/gigs/{gigId}:
 *   get:
 *     summary: Get a single gig with applications count
 *     tags: [Gigs]
 *     security: []
 */
router.get('/:gigId', async (req, res) => {
  try {
    const gig = await GigPost.findByPk(req.params.gigId, {
      include: [{ model: GigApplication, as: 'applications', attributes: ['id', 'status', 'proposed_rate'] }],
    });
    if (!gig) return res.status(404).json({ error: 'Gig not found' });
    res.json(gig);
  } catch (err) { res.status(500).json({ error: safeErr(err) }); }
});

/**
 * @swagger
 * /api/v1/gigs/{gigId}/apply:
 *   post:
 *     summary: Apply for a gig (trader or graduate)
 *     tags: [Gigs]
 */
router.post('/:gigId/apply', auth, async (req, res) => {
  try {
    const { proposed_rate, cover_note } = req.body;
    const gig = await GigPost.findByPk(req.params.gigId);
    if (!gig) return res.status(404).json({ error: 'Gig not found' });
    if (gig.status !== 'open') return res.status(400).json({ error: 'Gig is no longer open' });

    const existing = await GigApplication.findOne({
      where: { gig_post_id: req.params.gigId, applicant_id: req.actor.id },
    });
    if (existing) return res.status(409).json({ error: 'Already applied' });

    const application = await GigApplication.create({
      gig_post_id: req.params.gigId,
      applicant_id: req.actor.id,
      applicant_type: req.actor.type,
      proposed_rate,
      cover_note,
      status: 'pending',
    });

    res.status(201).json({ message: 'Application submitted', application });
  } catch (err) { res.status(500).json({ error: safeErr(err) }); }
});

/**
 * @swagger
 * /api/v1/gigs/{gigId}/applications:
 *   get:
 *     summary: View applications for your gig (poster only)
 *     tags: [Gigs]
 */
router.get('/:gigId/applications', auth, async (req, res) => {
  try {
    const gig = await GigPost.findByPk(req.params.gigId);
    if (!gig) return res.status(404).json({ error: 'Gig not found' });
    if (gig.poster_id !== req.actor.id) return res.status(403).json({ error: 'Not your gig' });

    const applications = await GigApplication.findAll({
      where: { gig_post_id: req.params.gigId },
      order: [['createdAt', 'ASC']],
    });
    res.json(applications);
  } catch (err) { res.status(500).json({ error: safeErr(err) }); }
});

/**
 * @swagger
 * /api/v1/gigs/{gigId}/applications/{appId}/accept:
 *   post:
 *     summary: Accept an application and create escrow
 *     tags: [Gigs]
 */
router.post('/:gigId/applications/:appId/accept', auth, async (req, res) => {
  try {
    const gig = await GigPost.findByPk(req.params.gigId);
    if (!gig) return res.status(404).json({ error: 'Gig not found' });
    if (gig.poster_id !== req.actor.id) return res.status(403).json({ error: 'Not your gig' });

    const application = await GigApplication.findByPk(req.params.appId);
    if (!application) return res.status(404).json({ error: 'Application not found' });

    const agreedAmount = application.proposed_rate || gig.budget_fixed;
    if (!agreedAmount) return res.status(400).json({ error: 'No agreed amount — set budget_fixed on gig or proposed_rate on application' });

    // Get worker phone
    let workerPhone = null;
    if (application.applicant_type === 'trader') {
      const w = await Trader.findByPk(application.applicant_id, { attributes: ['phone'] });
      workerPhone = w?.phone;
    } else {
      const w = await Graduate.findByPk(application.applicant_id, { attributes: ['phone'] });
      workerPhone = w?.phone;
    }

    // Get employer phone
    let employerPhone = null;
    if (req.actor.type === 'employer') {
      const e = await Employer.findByPk(req.actor.id, { attributes: ['phone'] });
      employerPhone = e?.phone;
    } else if (req.actor.type === 'trader') {
      const t = await Trader.findByPk(req.actor.id, { attributes: ['phone'] });
      employerPhone = t?.phone;
    }

    const escrow = await escrowService.createEscrow({
      employerId: req.actor.id,
      workerId: application.applicant_id,
      workerType: application.applicant_type,
      gigPostId: gig.id,
      agreedAmount,
      jobTitle: gig.title,
      jobDescription: gig.description,
      durationDays: gig.duration_days,
      workerPhone,
      employerPhone,
    });

    // Update application and gig status
    await application.update({ status: 'accepted', escrow_id: escrow.id });
    await GigApplication.update(
      { status: 'rejected' },
      { where: { gig_post_id: gig.id, id: { [require('sequelize').Op.ne]: application.id } } }
    );
    await gig.update({ status: 'in_progress' });

    res.json({
      message: 'Application accepted. Escrow created.',
      escrow_id: escrow.id,
      payment_nuban: escrow.squad_dynamic_nuban,
      agreed_amount: agreedAmount,
    });
  } catch (err) {
    logger.error({ fn: 'gigs.accept', error: err.message });
    res.status(500).json({ error: safeErr(err) });
  }
});

/**
 * @swagger
 * /api/v1/gigs/{gigId}/complete:
 *   post:
 *     summary: Mark gig as complete (worker submits, poster confirms)
 *     tags: [Gigs]
 */
router.post('/:gigId/complete', auth, async (req, res) => {
  try {
    const { action, worker_bank_code, worker_account, worker_name, rating, review } = req.body;
    const gig = await GigPost.findByPk(req.params.gigId);
    if (!gig) return res.status(404).json({ error: 'Gig not found' });

    const application = await GigApplication.findOne({
      where: { gig_post_id: gig.id, status: 'accepted' },
    });
    if (!application) return res.status(400).json({ error: 'No accepted application' });

    // Worker marks work done
    if (action === 'submit' && req.actor.id === application.applicant_id) {
      const escrow = await EscrowAccount.findByPk(application.escrow_id);
      if (escrow) await escrow.update({ status: 'work_done' });
      return res.json({ message: 'Work submitted. Waiting for poster to confirm.' });
    }

    // Poster confirms job done
    if (action === 'confirm' && req.actor.id === gig.poster_id) {
      const escrow = await EscrowAccount.findByPk(application.escrow_id);

      // Save ratings
      if (rating) {
        await application.update({ employer_rating: rating, employer_review: review });
        if (application.applicant_type === 'trader') {
          const w = await Trader.findByPk(application.applicant_id);
          if (w) {
            const newRating = ((Number(w.rating) * (w.total_jobs || 0) + rating) / ((w.total_jobs || 0) + 1)).toFixed(2);
            await w.update({ rating: newRating, is_available: true });
          }
        } else {
          const w = await Graduate.findByPk(application.applicant_id);
          if (w) {
            const newRating = ((Number(w.rating) * (w.total_gigs || 0) + rating) / ((w.total_gigs || 0) + 1)).toFixed(2);
            await w.update({ rating: newRating, is_available: true });
          }
        }
      }

      // Full payout if bank details provided; otherwise just mark done
      if (worker_bank_code && worker_account && worker_name) {
        let workerPhone = null;
        if (application.applicant_type === 'trader') {
          const w = await Trader.findByPk(application.applicant_id, { attributes: ['phone'] });
          workerPhone = w?.phone;
        } else {
          const w = await Graduate.findByPk(application.applicant_id, { attributes: ['phone'] });
          workerPhone = w?.phone;
        }
        const result = await escrowService.releaseEscrow(application.escrow_id, worker_bank_code, worker_account, worker_name, workerPhone);
        await recordCreditEvent(application.applicant_id, application.applicant_type, 'payment_received', {
          amount: result.net_paid,
          clientId: req.actor.id,
          description: `Gig completed: ${gig.title}`,
        });
        await gig.update({ status: 'completed' });
        return res.json({ message: 'Gig completed. Payment released.', net_paid: result.net_paid });
      }

      // Mark complete without immediate payout — payout via /escrow/:id/release later
      if (escrow) await escrow.update({ status: 'work_done' });
      await gig.update({ status: 'completed' });
      return res.json({ message: 'Job confirmed as done. Payment pending release.', net_paid: null });
    }

    return res.status(400).json({ error: 'Invalid action or unauthorized' });
  } catch (err) {
    logger.error({ fn: 'gigs.complete', error: err.message });
    res.status(500).json({ error: safeErr(err) });
  }
});

/**
 * @swagger
 * /api/v1/gigs/my:
 *   get:
 *     summary: List gigs posted by or applied to by the authenticated user
 *     tags: [Gigs]
 */
router.get('/my/posted', auth, async (req, res) => {
  try {
    const lim = Math.min(parseInt(req.query.limit) || 20, 100);
    const gigs = await GigPost.findAll({
      where: { poster_id: req.actor.id },
      include: [{ model: GigApplication, as: 'applications', attributes: ['id', 'status', 'applicant_id', 'applicant_type'] }],
      order: [['createdAt', 'DESC']],
      limit: lim,
    });
    res.json(gigs);
  } catch (err) { res.status(500).json({ error: safeErr(err) }); }
});

router.get('/my/applied', auth, async (req, res) => {
  try {
    const applications = await GigApplication.findAll({
      where: { applicant_id: req.actor.id },
      include: [{ model: GigPost, as: 'gigPost' }],
      order: [['createdAt', 'DESC']],
    });
    res.json(applications);
  } catch (err) { res.status(500).json({ error: safeErr(err) }); }
});

module.exports = router;
