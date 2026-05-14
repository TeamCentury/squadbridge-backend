const router = require('express').Router({ mergeParams: true });
const { AuditLog } = require('../models');
const { Op } = require('sequelize');

// GET /api/v1/schools/:id/audit
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
