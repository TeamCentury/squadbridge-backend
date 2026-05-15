const router = require('express').Router();
const jwt = require('jsonwebtoken');
const { Trader } = require('../models');
const badgeService = require('../services/badgeService');
const logger = require('../config/logger');

function auth(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'No token' });
  try {
    req.trader = jwt.verify(token, process.env.JWT_SECRET);
    if (req.trader.type !== 'trader') return res.status(403).json({ error: 'Traders only' });
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
 * /api/v1/badges/my:
 *   get:
 *     summary: Get my badge status
 *     tags: [Badges]
 */
router.get('/my', auth, async (req, res) => {
  try {
    const badge = await badgeService.getBadge(req.trader.id);
    const tiers = badgeService.BADGE_TIERS;
    res.json({
      badge,
      current_tier: tiers[badge.tier],
      next_tier: tiers[badge.tier + 1] || null,
      all_tiers: tiers,
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

/**
 * @swagger
 * /api/v1/badges/evaluate-trusted:
 *   post:
 *     summary: Check if eligible for Trusted badge (auto-evaluated from escrow history)
 *     tags: [Badges]
 */
router.post('/evaluate-trusted', auth, async (req, res) => {
  try {
    const trader = await Trader.findByPk(req.trader.id, { attributes: ['phone'] });
    const result = await badgeService.evaluateTrusted(req.trader.id, trader?.phone);
    res.json(result);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

/**
 * @swagger
 * /api/v1/badges/assessment:
 *   post:
 *     summary: Start or submit skill assessment for Expert badge
 *     tags: [Badges]
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               trade:
 *                 type: string
 *                 example: plumber
 *               answers:
 *                 type: array
 *                 items:
 *                   type: string
 *                 description: Omit to get questions; provide to submit answers
 */
router.post('/assessment', auth, async (req, res) => {
  try {
    const { answers } = req.body;
    const trader = await Trader.findByPk(req.trader.id, { attributes: ['primary_trade', 'phone'] });
    const trade = req.body.trade || trader?.primary_trade || 'general handyperson';
    const result = await badgeService.runSkillAssessment(req.trader.id, trade, answers, trader?.phone);
    res.json(result);
  } catch (err) {
    logger.error({ fn: 'badges.assessment', error: err.message });
    res.status(500).json({ error: err.message });
  }
});

/**
 * @swagger
 * /api/v1/badges/evaluate-elite:
 *   post:
 *     summary: Check if eligible for Elite badge
 *     tags: [Badges]
 */
router.post('/evaluate-elite', auth, async (req, res) => {
  try {
    const trader = await Trader.findByPk(req.trader.id, { attributes: ['phone'] });
    const result = await badgeService.evaluateElite(req.trader.id, trader?.phone);
    res.json(result);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

/**
 * @swagger
 * /api/v1/badges/admin/verify-documents:
 *   post:
 *     summary: Admin — verify trader documents for Verified badge
 *     tags: [Badges]
 */
router.post('/admin/verify-documents', adminAuth, async (req, res) => {
  try {
    const { trader_id, document_url } = req.body;
    if (!trader_id || !document_url) return res.status(400).json({ error: 'trader_id and document_url required' });

    const trader = await Trader.findByPk(trader_id, { attributes: ['phone'] });
    const result = await badgeService.verifyDocuments(trader_id, document_url, trader?.phone);
    res.json(result);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
