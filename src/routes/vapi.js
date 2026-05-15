const router = require('express').Router();
const validateVapiSecret = require('../middleware/validateVapiSecret');
const { Trader, Graduate, School, ConversationSession } = require('../models');
const squadService = require('../services/squadService');
const { scoreUser } = require('../services/creditScoringService');
const { sendAllDigests } = require('../services/opportunityService');
const logger = require('../config/logger');

router.use(validateVapiSecret);

/**
 * @swagger
 * /api/v1/vapi/assistant-request:
 *   post:
 *     summary: Vapi assistant-request webhook — dynamic system prompt per caller
 *     tags: [Vapi Voice]
 *     security: []
 */
router.post('/assistant-request', async (req, res) => {
  try {
    const { call } = req.body;
    const phone = call?.customer?.number;

    // Find user by phone
    let user = null; let userType = 'unknown';
    if (phone) {
      const normalized = phone.replace(/^\+234/, '0').replace(/^\+/, '');
      const trader = await Trader.findOne({ where: { phone: { [require('sequelize').Op.like]: `%${normalized.slice(-10)}` } } });
      if (trader) { user = trader; userType = 'trader'; }
      if (!user) {
        const grad = await Graduate.findOne({ where: { phone: { [require('sequelize').Op.like]: `%${normalized.slice(-10)}` } } });
        if (grad) { user = grad; userType = 'graduate'; }
      }
    }

    const firstName = user?.name?.split(' ')[0] || 'there';
    const systemPrompt = `You are SquadBridge Voice Assistant — Nigeria's economic opportunity voice agent.
You speak clear Nigerian English. Be warm, brief, and helpful.
${user ? `The caller is ${user.name} (${userType}). Skills: ${user.skills || 'not set'}.` : 'The caller is not registered yet.'}

You can help with:
- Checking balance and credit score
- Finding job/gig opportunities
- Setting up payments and escrow
- Registering as a trader or graduate
- Explaining SquadBridge features

When the caller asks for something you need data for, use the function tools available.
Keep responses under 3 sentences. Speak naturally, no bullet points.`;

    res.json({
      assistant: {
        name: 'SquadBridge Assistant',
        voice: { provider: 'playht', voiceId: 'jennifer' },
        model: {
          provider: 'anthropic',
          model: 'claude-opus-4-7',
          systemPrompt,
          tools: [
            {
              type: 'function',
              function: {
                name: 'get_credit_score',
                description: 'Get the caller\'s current credit score',
                parameters: { type: 'object', properties: {} },
              },
            },
            {
              type: 'function',
              function: {
                name: 'get_balance',
                description: 'Get the platform balance (for school admins)',
                parameters: { type: 'object', properties: {} },
              },
            },
            {
              type: 'function',
              function: {
                name: 'find_opportunities',
                description: 'Find job or gig opportunities matching the caller\'s skills',
                parameters: { type: 'object', properties: { skill: { type: 'string' } } },
              },
            },
            {
              type: 'function',
              function: {
                name: 'register_trader',
                description: 'Start trader registration flow',
                parameters: {
                  type: 'object',
                  properties: {
                    name: { type: 'string' },
                    trade: { type: 'string' },
                  },
                  required: ['name', 'trade'],
                },
              },
            },
          ],
        },
        firstMessage: user
          ? `Hello ${firstName}! Welcome back to SquadBridge. How can I help you today?`
          : `Welcome to SquadBridge! I'm your voice assistant. I can help you find jobs, manage payments, or register on our platform. What would you like to do?`,
      },
    });
  } catch (err) {
    logger.error({ fn: 'vapi.assistant-request', error: err.message });
    res.status(500).json({ error: err.message });
  }
});

/**
 * @swagger
 * /api/v1/vapi/function-call:
 *   post:
 *     summary: Vapi function-call webhook — execute tool calls from voice agent
 *     tags: [Vapi Voice]
 *     security: []
 */
router.post('/function-call', async (req, res) => {
  try {
    const { call, functionCall } = req.body;
    const phone = call?.customer?.number;
    const fnName = functionCall?.name;
    const args = functionCall?.parameters || {};

    logger.info({ fn: 'vapi.function-call', function: fnName, phone });

    if (fnName === 'get_credit_score') {
      let user = null; let userType = 'trader';
      if (phone) {
        const normalized = phone.replace(/^\+234/, '0');
        user = await Trader.findOne({ where: { phone: { [require('sequelize').Op.like]: `%${normalized.slice(-10)}` } } });
        if (!user) {
          user = await Graduate.findOne({ where: { phone: { [require('sequelize').Op.like]: `%${normalized.slice(-10)}` } } });
          if (user) userType = 'graduate';
        }
      }
      if (!user) return res.json({ result: "I couldn't find your account. Please register on SquadBridge first." });

      const profile = await scoreUser(user.id, userType);
      return res.json({
        result: `Your credit score is ${profile.score} out of 850. ${profile.score >= 650 ? "That's a good score — you qualify for premium gigs!" : profile.score >= 500 ? "You're building well. Complete more jobs to improve." : "Keep completing jobs and payments to build your score."}`,
      });
    }

    if (fnName === 'get_balance') {
      // Only expose balance to registered school admins identified by phone
      if (!phone) return res.json({ result: 'I need to verify your identity to share balance information.' });
      const normalized = phone.replace(/^\+234/, '0').slice(-10);
      const school = await School.findOne({ where: { phone: { [require('sequelize').Op.like]: `%${normalized}` } } });
      if (!school) return res.json({ result: 'Balance information is available to registered school administrators only.' });

      const balRes = await squadService.getBalance().catch(() => null);
      const balance = balRes?.data?.balance || 0;
      return res.json({ result: `Your platform balance is ₦${Number(balance).toLocaleString()}.` });
    }

    if (fnName === 'find_opportunities') {
      const { GigPost } = require('../models');
      const { Op } = require('sequelize');
      const where = { status: 'open', expires_at: { [Op.gt]: new Date() } };
      if (args.skill) where.skills_required = { [Op.like]: `%${args.skill}%` };
      const gigs = await GigPost.findAll({ where, limit: 3, order: [['createdAt', 'DESC']] });
      if (!gigs.length) return res.json({ result: 'No open gigs match your skill right now. Check back tomorrow or try WhatsApp for curated opportunities.' });
      const list = gigs.map((g, i) => `${i + 1}. ${g.title} — ₦${g.budget_fixed?.toLocaleString() || 'negotiable'}`).join('. ');
      return res.json({ result: `I found ${gigs.length} open gigs: ${list}. Should I send these to your WhatsApp for details?` });
    }

    if (fnName === 'register_trader') {
      return res.json({
        result: `To register as a ${args.trade || 'trader'}, I'll need your full name, phone number, and BVN. Visit squadbridge.ng or send a WhatsApp to our number to complete registration quickly. Would you like me to send you the link?`,
      });
    }

    res.json({ result: 'I can help with that. Please try again or visit our website.' });
  } catch (err) {
    logger.error({ fn: 'vapi.function-call', error: err.message });
    res.json({ result: 'Sorry, I had trouble processing that. Please try again.' });
  }
});

/**
 * @swagger
 * /api/v1/vapi/call-end:
 *   post:
 *     summary: Vapi call-end webhook — save session transcript
 *     tags: [Vapi Voice]
 *     security: []
 */
router.post('/call-end', async (req, res) => {
  try {
    const { call } = req.body;
    const phone = call?.customer?.number;
    const messages = call?.messages || [];
    const callId = call?.id;

    await ConversationSession.create({
      session_id: callId,
      phone,
      channel: 'vapi',
      messages: JSON.stringify(messages.map((m) => ({ role: m.role, content: m.message, ts: m.time }))),
      ended_at: new Date(),
      last_active_at: new Date(),
    });

    res.json({ received: true });
  } catch (err) {
    logger.error({ fn: 'vapi.call-end', error: err.message });
    res.json({ received: true });
  }
});

// Unified webhook — Vapi sends all server messages to one URL
router.post('/webhook', async (req, res) => {
  const type = req.body?.message?.type;
  if (type === 'assistant-request') {
    req.url = '/assistant-request';
    return router.handle(req, res, () => res.status(404).end());
  }
  if (type === 'function-call') {
    // Re-shape body so /function-call handler works as-is
    req.body = { call: req.body.message.call, functionCall: req.body.message.functionCall };
    req.url = '/function-call';
    return router.handle(req, res, () => res.status(404).end());
  }
  if (type === 'end-of-call-report') {
    req.body = { call: req.body.message.call };
    req.url = '/call-end';
    return router.handle(req, res, () => res.status(404).end());
  }
  res.json({ received: true });
});

module.exports = router;
