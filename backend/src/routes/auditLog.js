const router = require('express').Router({ mergeParams: true });
const { AuditLog } = require('../models');
const { Op } = require('sequelize');

/**
 * @swagger
 * /api/v1/schools/{id}/audit:
 *   get:
 *     summary: Get the audit log for a school
 *     description: |
 *       Returns a paginated, filterable log of all financial events:
 *       payments, payroll runs, link generation, onboarding, and webhooks.
 *     tags: [Audit]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *       - in: query
 *         name: event_type
 *         schema:
 *           type: string
 *           enum: [PAYMENT_RECEIVED, PAYROLL_EXECUTED, LINK_GENERATED, ONBOARDED, WEBHOOK_RECEIVED, FORECAST_UPDATED, PAYOUT_REQUESTED]
 *       - in: query
 *         name: from
 *         schema:
 *           type: string
 *           format: date
 *         example: "2026-05-01"
 *       - in: query
 *         name: to
 *         schema:
 *           type: string
 *           format: date
 *         example: "2026-05-31"
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
 *         description: Paginated audit log
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 total:
 *                   type: integer
 *                   example: 243
 *                 logs:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/AuditLog'
 */
router.get('/', async (req, res, next) => {
  try {
    const { event_type, from, to, limit = 50, offset = 0 } = req.query;
    const where = { school_id: req.params.id };

    if (event_type) where.event_type = event_type;
    if (from || to) {
      where.createdAt = {};
      if (from) where.createdAt[Op.gte] = new Date(from);
      if (to) where.createdAt[Op.lte] = new Date(to);
    }

    const { count, rows } = await AuditLog.findAndCountAll({
      where,
      order: [['createdAt', 'DESC']],
      limit: parseInt(limit),
      offset: parseInt(offset),
    });

    res.json({ total: count, logs: rows });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
