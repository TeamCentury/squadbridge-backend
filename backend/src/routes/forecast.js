const router = require('express').Router({ mergeParams: true });
const { School, Forecast } = require('../models');
const squadService = require('../services/squadService');
const { computeForecast } = require('../services/forecastService');
const whatsappService = require('../services/whatsappService');

// GET /api/v1/schools/:id/forecast
router.get('/', async (req, res, next) => {
  try {
    const forecast = await Forecast.findOne({
      where: { school_id: req.params.id },
      order: [['generated_at', 'DESC']],
    });

    if (!forecast) return res.status(404).json({ error: 'No forecast available yet. Check back after first transactions.' });
    res.json(forecast);
  } catch (err) {
    next(err);
  }
});

// POST /api/v1/schools/:id/forecast/refresh — manual refresh
router.post('/refresh', async (req, res, next) => {
  try {
    const school = await School.findByPk(req.params.id);
    if (!school) return res.status(404).json({ error: 'School not found' });

    const balanceRes = await squadService.getBalance(school.squad_merchant_id).catch(() => null);
    const currentBalance = balanceRes?.data?.balance || 0;

    const forecast = await computeForecast(school.id, currentBalance);
    res.json(forecast);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
