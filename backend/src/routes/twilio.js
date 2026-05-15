const router = require('express').Router();
const { Trader, Graduate, ConversationSession } = require('../models');
const squadService = require('../services/squadService');
const { scoreUser } = require('../services/creditScoringService');
const logger = require('../config/logger');

// Twilio's VoiceResponse helper (TwiML)
function twiml(content) {
  return `<?xml version="1.0" encoding="UTF-8"?><Response>${content}</Response>`;
}
function say(text, voice = 'Polly.Joanna') {
  return `<Say voice="${voice}">${text}</Say>`;
}
function gather(opts, inner) {
  const { action, numDigits = 1, timeout = 5, finishOnKey = '#' } = opts;
  return `<Gather action="${action}" method="POST" numDigits="${numDigits}" timeout="${timeout}" finishOnKey="${finishOnKey}">${inner}</Gather>`;
}
function redirect(url) { return `<Redirect>${url}</Redirect>`; }
function hangup() { return '<Hangup/>'; }

/**
 * @swagger
 * /api/v1/twilio/voice:
 *   post:
 *     summary: Twilio inbound voice call — IVR main menu
 *     tags: [Twilio Voice]
 *     security: []
 */
router.post('/voice', async (req, res) => {
  const { From, CallSid } = req.body;
  res.type('text/xml');

  try {
    const normalized = (From || '').replace(/^\+234/, '0').slice(-10);
    const trader = await Trader.findOne({ where: { phone: { [require('sequelize').Op.like]: `%${normalized}` } } });
    const grad = !trader && await Graduate.findOne({ where: { phone: { [require('sequelize').Op.like]: `%${normalized}` } } });
    const user = trader || grad;
    const firstName = user?.name?.split(' ')[0] || '';

    const greeting = user
      ? say(`Hello ${firstName}! Welcome back to SquadBridge.`)
      : say('Welcome to SquadBridge — Nigeria\'s economic bridge.');

    const menu = gather(
      { action: '/api/v1/twilio/menu', numDigits: 1, timeout: 8 },
      `${say('Press 1 to check your credit score.')}
       ${say('Press 2 to hear today\'s job opportunities.')}
       ${say('Press 3 to check your balance.')}
       ${say('Press 4 to register on SquadBridge.')}
       ${say('Press 0 to hear this menu again.')}`
    );

    res.send(twiml(`${greeting}${menu}${redirect('/api/v1/twilio/voice')}`));
  } catch (err) {
    logger.error({ fn: 'twilio.voice', error: err.message });
    res.send(twiml(`${say('We are experiencing a technical issue. Please try again.')}${hangup()}`));
  }
});

/**
 * @swagger
 * /api/v1/twilio/menu:
 *   post:
 *     summary: Twilio DTMF menu handler
 *     tags: [Twilio Voice]
 *     security: []
 */
router.post('/menu', async (req, res) => {
  const { Digits, From } = req.body;
  res.type('text/xml');

  try {
    const normalized = (From || '').replace(/^\+234/, '0').slice(-10);

    if (Digits === '1') {
      // Credit score
      let user = null; let userType = 'trader';
      const t = await Trader.findOne({ where: { phone: { [require('sequelize').Op.like]: `%${normalized}` } } });
      if (t) { user = t; userType = 'trader'; }
      if (!user) {
        const g = await Graduate.findOne({ where: { phone: { [require('sequelize').Op.like]: `%${normalized}` } } });
        if (g) { user = g; userType = 'graduate'; }
      }

      if (!user) {
        return res.send(twiml(`${say('You are not registered. Press 4 to register.')}${redirect('/api/v1/twilio/voice')}`));
      }

      const profile = await scoreUser(user.id, userType);
      const scoreMsg = `Your SquadBridge credit score is ${profile.score} out of 850. ${profile.score >= 650 ? 'Excellent score!' : profile.score >= 500 ? 'Good progress!' : 'Keep completing jobs to improve.'}`;
      return res.send(twiml(`${say(scoreMsg)}${redirect('/api/v1/twilio/voice')}`));
    }

    if (Digits === '2') {
      // Job opportunities
      const { GigPost } = require('../models');
      const { Op } = require('sequelize');
      const gigs = await GigPost.findAll({
        where: { status: 'open', expires_at: { [Op.gt]: new Date() } },
        limit: 3,
        order: [['createdAt', 'DESC']],
      });

      if (!gigs.length) {
        return res.send(twiml(`${say('No open gigs right now. Check WhatsApp for curated daily opportunities.')}${redirect('/api/v1/twilio/voice')}`));
      }

      const gigText = gigs.map((g, i) => `Job ${i + 1}: ${g.title}, paying ${g.budget_fixed ? '₦' + g.budget_fixed.toLocaleString() : 'negotiable'}.`).join(' ');
      return res.send(twiml(`${say(`Here are today's top jobs. ${gigText} Send WhatsApp for details.`)}${redirect('/api/v1/twilio/voice')}`));
    }

    if (Digits === '3') {
      const balRes = await squadService.getBalance().catch(() => null);
      const balance = balRes?.data?.balance || 0;
      return res.send(twiml(`${say(`Platform balance is ₦${Number(balance).toLocaleString()}.`)}${redirect('/api/v1/twilio/voice')}`));
    }

    if (Digits === '4') {
      // BVN capture for registration
      return res.send(twiml(gather(
        { action: '/api/v1/twilio/register-bvn', numDigits: 11, timeout: 15, finishOnKey: '#' },
        say('To register, please enter your 11-digit BVN followed by the hash key.')
      )));
    }

    if (Digits === '0') {
      return res.send(twiml(redirect('/api/v1/twilio/voice')));
    }

    res.send(twiml(`${say('Invalid option.')}${redirect('/api/v1/twilio/voice')}`));
  } catch (err) {
    logger.error({ fn: 'twilio.menu', error: err.message });
    res.send(twiml(`${say('Error processing request.')}${redirect('/api/v1/twilio/voice')}`));
  }
});

/**
 * @swagger
 * /api/v1/twilio/register-bvn:
 *   post:
 *     summary: Capture BVN via DTMF and prompt for trade selection
 *     tags: [Twilio Voice]
 *     security: []
 */
router.post('/register-bvn', async (req, res) => {
  const { Digits, From } = req.body;
  res.type('text/xml');

  if (!Digits || Digits.length !== 11) {
    return res.send(twiml(`${say('Invalid BVN. Please try again.')}${redirect('/api/v1/twilio/voice')}`));
  }

  return res.send(twiml(gather(
    { action: `/api/v1/twilio/register-trade?bvn=${Digits}&phone=${encodeURIComponent(From)}`, numDigits: 1, timeout: 10 },
    `${say('BVN captured. Now select your trade.')}
     ${say('Press 1 for Plumber.')}
     ${say('Press 2 for Electrician.')}
     ${say('Press 3 for Carpenter.')}
     ${say('Press 4 for Painter.')}
     ${say('Press 5 for other trade.')}`
  )));
});

/**
 * @swagger
 * /api/v1/twilio/register-trade:
 *   post:
 *     summary: Complete voice registration with trade selection
 *     tags: [Twilio Voice]
 *     security: []
 */
router.post('/register-trade', async (req, res) => {
  const { Digits } = req.body;
  const { bvn, phone } = req.query;
  res.type('text/xml');

  const tradeMap = { '1': 'plumber', '2': 'electrician', '3': 'carpenter', '4': 'painter', '5': 'general_handyperson' };
  const trade = tradeMap[Digits] || 'general_handyperson';

  try {
    // Save partial registration — user completes via WhatsApp or web
    await ConversationSession.create({
      phone: phone || '',
      channel: 'twilio',
      context: JSON.stringify({ bvn_captured: true, trade, registration_started: true }),
      last_active_at: new Date(),
    });

    res.send(twiml(`${say(`Thank you! We've started your registration as a ${trade.replace('_', ' ')}. We'll send a WhatsApp message to complete your profile. Goodbye!`)}${hangup()}`));
  } catch (err) {
    logger.error({ fn: 'twilio.register-trade', error: err.message });
    res.send(twiml(`${say('Registration error. Please try WhatsApp or our website.')}${hangup()}`));
  }
});

module.exports = router;
