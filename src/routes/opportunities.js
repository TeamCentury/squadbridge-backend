const router = require('express').Router();
const jwt = require('jsonwebtoken');
const { runScrape, injectOpportunity, matchForUser, sendDigest } = require('../services/opportunityService');
const { OpportunityPool } = require('../models');
const { Op } = require('sequelize');
const logger = require('../config/logger');

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

function adminAuth(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'No token' });
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    if (decoded.role !== 'admin') return res.status(403).json({ error: 'Admin only' });
    req.admin = decoded;
    next();
  } catch { res.status(401).json({ error: 'Invalid token' }); }
}

/**
 * @swagger
 * /api/v1/opportunities:
 *   get:
 *     summary: Browse opportunity pool (filterable)
 *     tags: [Opportunities]
 *     security: []
 */
router.get('/', async (req, res) => {
  try {
    const { type, skill, limit = 20, offset = 0 } = req.query;
    const where = { is_active: true };
    if (type) where.opportunity_type = type;
    if (skill) where.skills_required = { [Op.like]: `%${skill}%` };

    const opps = await OpportunityPool.findAll({
      where,
      order: [['scraped_at', 'DESC']],
      limit: parseInt(limit),
      offset: parseInt(offset),
    });
    res.json({ opportunities: opps, count: opps.length });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

/**
 * @swagger
 * /api/v1/opportunities/matched:
 *   get:
 *     summary: Get opportunities matched to the authenticated user's skills
 *     tags: [Opportunities]
 */
router.get('/matched', auth, async (req, res) => {
  try {
    const { Trader, Graduate } = require('../models');
    const userType = req.actor.type;
    const lim = Math.min(parseInt(req.query.limit) || 10, 50);
    let user = null;

    if (userType === 'trader') {
      user = await Trader.findByPk(req.actor.id, { attributes: ['skills'] });
    } else if (userType === 'graduate') {
      user = await Graduate.findByPk(req.actor.id, { attributes: ['skills'] });
    }

    if (!user) return res.status(404).json({ error: 'User not found' });

    const opps = await matchForUser(req.actor.id, userType, user.skills || '[]', lim);
    // Return flat array — frontend does Array.isArray() check
    res.json(opps);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

/**
 * @swagger
 * /api/v1/opportunities/admin/scrape:
 *   post:
 *     summary: Admin — trigger manual opportunity scrape
 *     tags: [Opportunities]
 */
router.post('/admin/scrape', adminAuth, async (req, res) => {
  try {
    const result = await runScrape();
    res.json({ message: 'Scrape complete', result });
  } catch (err) {
    logger.error({ fn: 'opportunities.scrape', error: err.message });
    res.status(500).json({ error: err.message });
  }
});

/**
 * @swagger
 * /api/v1/opportunities/admin/inject:
 *   post:
 *     summary: Admin — manually inject an opportunity
 *     tags: [Opportunities]
 */
router.post('/admin/inject', adminAuth, async (req, res) => {
  try {
    const result = await injectOpportunity(req.body);
    res.status(result.created ? 201 : 200).json({ message: result.created ? 'Opportunity created' : 'Already exists', opportunity: result.opp });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

/**
 * @swagger
 * /api/v1/opportunities/admin/send-digest:
 *   post:
 *     summary: Admin — manually trigger WhatsApp digest for a user
 *     tags: [Opportunities]
 */
router.post('/admin/send-digest', adminAuth, async (req, res) => {
  try {
    const { user_id, user_type } = req.body;
    if (!user_id || !user_type) return res.status(400).json({ error: 'user_id and user_type required' });

    const { Trader, Graduate } = require('../models');
    let user = null;
    if (user_type === 'trader') user = await Trader.findByPk(user_id);
    else if (user_type === 'graduate') user = await Graduate.findByPk(user_id);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const sent = await sendDigest(user, user_type);
    res.json({ message: `Sent ${sent} opportunities`, count: sent });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
