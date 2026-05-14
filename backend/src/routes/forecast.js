const router = require('express').Router({ mergeParams: true });
const { School, Forecast } = require('../models');
const squadService = require('../services/squadService');
const { computeForecast } = require('../services/forecastService');

/**
 * @swagger
 * /api/v1/schools/{id}/forecast:
 *   get:
 *     summary: Get the latest 30/60/90-day cash flow forecast
 *     description: |
 *       Returns the most recent nightly forecast computed by the Azure Functions timer.
 *       Use POST /forecast/refresh to trigger an immediate recalculation.
 *     tags: [Forecast]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Latest forecast
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Forecast'
 *       404:
 *         description: No forecast available yet
 */
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

/**
 * @swagger
 * /api/v1/schools/{id}/forecast/refresh:
 *   post:
 *     summary: Manually refresh the cash flow forecast
 *     description: |
 *       Fetches current Squad balance, runs exponential smoothing (α=0.3) on
 *       the last 30 days of transactions, and stores a new forecast record.
 *     tags: [Forecast]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Freshly computed forecast
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Forecast'
 *       404:
 *         description: School not found
 */
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
