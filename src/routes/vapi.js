const router = require('express').Router();
const { Op } = require('sequelize');
const validateVapiSecret = require('../middleware/validateVapiSecret');
const { Trader, Graduate, School, GigPost, GigApplication, ConversationSession } = require('../models');
const squadService = require('../services/squadService');
const { scoreUser } = require('../services/creditScoringService');
const { matchForUser } = require('../services/opportunityService');
const logger = require('../config/logger');

router.use(validateVapiSecret);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function resolveCallerByPhone(phone) {
  if (!phone) return { user: null, userType: 'unknown' };
  const normalized = phone.replace(/^\+234/, '0').replace(/^\+/, '');
  const last10 = normalized.slice(-10);

  const trader = await Trader.findOne({ where: { phone: { [Op.like]: `%${last10}` } } });
  if (trader) return { user: trader, userType: 'trader' };

  const grad = await Graduate.findOne({ where: { phone: { [Op.like]: `%${last10}` } } });
  if (grad) return { user: grad, userType: 'graduate' };

  const school = await School.findOne({ where: { phone: { [Op.like]: `%${last10}` } } });
  if (school) return { user: school, userType: 'school' };

  return { user: null, userType: 'unknown' };
}

function buildSystemPrompt(user, userType) {
  const base = `You are the SquadBridge Voice Assistant — Nigeria's economic opportunity platform.
Speak clear, warm Nigerian English. Keep all responses under 3 sentences.
Never read out bullet points — speak naturally like a helpful colleague.
Always confirm before taking any action on behalf of the caller.`;

  if (!user) {
    return `${base}

The caller is NOT yet registered on SquadBridge.
Guide them to register as a trader, graduate, or employer.
You can collect their name and trade to start the registration flow using the register_trader or register_graduate tools.`;
  }

  const firstName = user.name?.split(' ')[0] || 'there';

  if (userType === 'trader') {
    return `${base}

Caller: ${user.name} (Trader) | Skills: ${Array.isArray(user.skills) ? user.skills.join(', ') : user.skills || 'not set'} | Location: ${user.state || 'unknown'} | Rating: ${user.rating || 'N/A'}/5
You can check their credit score, find gig opportunities, check active applications, or help with payments.`;
  }

  if (userType === 'graduate') {
    return `${base}

Caller: ${user.name} (Graduate) | Field: ${user.field_of_study || 'unknown'} | Skills: ${Array.isArray(user.skills) ? user.skills.join(', ') : user.skills || 'not set'} | University: ${user.university || 'unknown'}
You can check their credit score, find gig opportunities, check active gig applications, or help with payments.`;
  }

  if (userType === 'school') {
    return `${base}

Caller: ${user.name} (School Admin) | Students: ${user.student_count || 0} | Language: ${user.preferred_language || 'en-NG'}
You can check their platform balance, payroll status, or help with fee collection.`;
  }

  return base;
}

function buildFirstMessage(user, userType) {
  if (!user) {
    return "Welcome to SquadBridge! I'm your voice assistant. I can help you find jobs, manage payments, or get you registered on our platform. What would you like to do?";
  }
  const firstName = user.name?.split(' ')[0] || 'there';
  if (userType === 'school') {
    return `Hello ${firstName}! Welcome back to SquadBridge. I can help with your school balance, payroll, or fee collection. What do you need?`;
  }
  return `Hello ${firstName}! Welcome back to SquadBridge. How can I help you today — opportunities, your credit score, or something else?`;
}

const TOOL_DEFINITIONS = [
  {
    type: 'function',
    function: {
      name: 'get_credit_score',
      description: "Get the caller's current credit score and a brief interpretation",
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_balance',
      description: 'Get the platform balance (for school administrators only)',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'find_opportunities',
      description: 'Find open gig or job opportunities matching the caller',
      parameters: {
        type: 'object',
        properties: {
          skill: { type: 'string', description: 'Specific skill to search for (optional)' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'check_applications',
      description: "Check the caller's active gig applications and their statuses",
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'apply_for_gig',
      description: 'Apply for a specific gig on behalf of the caller',
      parameters: {
        type: 'object',
        properties: {
          gig_id: { type: 'string', description: 'The ID of the gig to apply for' },
        },
        required: ['gig_id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'register_trader',
      description: 'Start the trader registration flow for an unregistered caller',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          trade: { type: 'string', description: 'Type of trade or skill (e.g. plumber, tailor, welder)' },
        },
        required: ['name', 'trade'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'register_graduate',
      description: 'Start the graduate registration flow for an unregistered caller',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          field: { type: 'string', description: 'Field of study or degree' },
        },
        required: ['name', 'field'],
      },
    },
  },
];

// ---------------------------------------------------------------------------
// Tool executor
// ---------------------------------------------------------------------------

async function executeTool(fnName, args, phone) {
  const { user, userType } = await resolveCallerByPhone(phone);

  if (fnName === 'get_credit_score') {
    if (!user || (userType !== 'trader' && userType !== 'graduate')) {
      return "I couldn't find your account. Please register on SquadBridge first by visiting squadbridge.ng or sending a WhatsApp to our number.";
    }
    const profile = await scoreUser(user.id, userType);
    const band = profile.score >= 750 ? 'excellent — you qualify for premium gigs and working capital loans!'
      : profile.score >= 700 ? 'very good. Keep completing jobs to reach the top tier.'
      : profile.score >= 600 ? 'good. A few more completed jobs will move you up.'
      : profile.score >= 500 ? 'fair. Focus on completing more jobs and on-time payments.'
      : 'building. Each job you complete improves your score.';
    return `Your credit score is ${profile.score} out of 850 — that's ${band}`;
  }

  if (fnName === 'get_balance') {
    if (userType !== 'school') {
      return 'Balance information is only available to registered school administrators.';
    }
    const balRes = await squadService.getBalance().catch(() => null);
    const balance = balRes?.data?.balance ?? 0;
    return `Your platform balance is ₦${Number(balance).toLocaleString()}. Would you like to know anything else about your account?`;
  }

  if (fnName === 'find_opportunities') {
    const where = { status: 'open', expires_at: { [Op.gt]: new Date() } };
    if (args.skill) where.skills_required = { [Op.like]: `%${args.skill}%` };
    const gigs = await GigPost.findAll({ where, limit: 3, order: [['budget_fixed', 'DESC']] });
    if (!gigs.length) {
      return 'No open gigs match right now. I can send you a WhatsApp notification as soon as matching gigs are posted — would you like that?';
    }
    const list = gigs.map((g, i) => `${i + 1}: ${g.title} paying ₦${g.budget_fixed?.toLocaleString() || 'negotiable'}`).join('. ');
    return `I found ${gigs.length} open gig${gigs.length > 1 ? 's' : ''}: ${list}. Would you like me to apply for any of these or send the details to your WhatsApp?`;
  }

  if (fnName === 'check_applications') {
    if (!user || (userType !== 'trader' && userType !== 'graduate')) {
      return 'I need your registered account to check applications. Please register on SquadBridge first.';
    }
    const apps = await GigApplication.findAll({
      where: { applicant_id: user.id },
      include: [{ model: GigPost, as: 'gig', attributes: ['title', 'budget_fixed'] }],
      limit: 5,
      order: [['createdAt', 'DESC']],
    });
    if (!apps.length) return "You don't have any gig applications yet. Would you like me to find open opportunities for you?";
    const summary = apps.map((a) => `${a.gig?.title || 'a gig'}: ${a.status}`).join('. ');
    return `You have ${apps.length} recent application${apps.length > 1 ? 's' : ''}: ${summary}.`;
  }

  if (fnName === 'apply_for_gig') {
    if (!user || (userType !== 'trader' && userType !== 'graduate')) {
      return 'You need to be registered on SquadBridge to apply for gigs. Shall I help you register?';
    }
    const gig = await GigPost.findByPk(args.gig_id);
    if (!gig || gig.status !== 'open') return 'That gig is no longer available. Would you like me to find other open gigs?';
    const existing = await GigApplication.findOne({ where: { gig_id: args.gig_id, applicant_id: user.id } });
    if (existing) return `You've already applied for "${gig.title}". I'll let you know when there's an update.`;
    await GigApplication.create({
      gig_id: args.gig_id,
      applicant_id: user.id,
      applicant_type: userType,
      status: 'pending',
    });
    return `Done! I've submitted your application for "${gig.title}" paying ₦${gig.budget_fixed?.toLocaleString() || 'negotiable'}. You'll get a WhatsApp notification when the employer responds.`;
  }

  if (fnName === 'register_trader') {
    return `Great, ${args.name}! To complete your trader registration as a ${args.trade}, I'll send you a WhatsApp link to fill in your BVN and bank details. You'll get your virtual account number right after. Should I send that now?`;
  }

  if (fnName === 'register_graduate') {
    return `Perfect, ${args.name}! To complete your graduate registration in ${args.field}, I'll send you a WhatsApp setup link. You'll get your SquadBridge account and start receiving curated job opportunities by 8am daily. Should I send that now?`;
  }

  return "I'm not sure how to help with that right now. Try WhatsApp for more options or visit squadbridge.ng.";
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

/**
 * POST /api/v1/vapi/assistant-request
 * Vapi calls this at the start of every call — we return a dynamic assistant config
 * tailored to the specific caller (identified by phone number).
 */
router.post('/assistant-request', async (req, res) => {
  try {
    const phone = req.body?.call?.customer?.number || req.body?.message?.call?.customer?.number;
    const { user, userType } = await resolveCallerByPhone(phone);

    logger.info({ fn: 'vapi.assistant-request', phone, userType, userId: user?.id });

    res.json({
      assistant: {
        name: 'SquadBridge',
        transcriber: { provider: 'deepgram', model: 'nova-3' },
        model: {
          provider: 'anthropic',
          model: 'claude-3-5-haiku-20241022',
          systemPrompt: buildSystemPrompt(user, userType),
          tools: TOOL_DEFINITIONS,
        },
        voice: { provider: 'vapi', voiceId: 'Elliot' },
        firstMessage: buildFirstMessage(user, userType),
        firstMessageMode: 'assistant-speaks-first',
        silenceTimeoutSeconds: 30,
        maxDurationSeconds: 600,
        endCallMessage: 'Thank you for calling SquadBridge. Good luck with your opportunities!',
        serverUrl: `${process.env.BACKEND_URL}/v1/vapi/webhook`,
        serverSecret: process.env.VAPI_WEBHOOK_SECRET,
      },
    });
  } catch (err) {
    logger.error({ fn: 'vapi.assistant-request', error: err.message });
    res.status(500).json({ error: 'Internal error' });
  }
});

/**
 * POST /api/v1/vapi/function-call
 * Legacy endpoint for older Vapi message format.
 */
router.post('/function-call', async (req, res) => {
  try {
    const phone = req.body?.call?.customer?.number;
    const { name: fnName, parameters: args = {} } = req.body?.functionCall || {};
    logger.info({ fn: 'vapi.function-call', function: fnName, phone });
    const result = await executeTool(fnName, args, phone);
    res.json({ result });
  } catch (err) {
    logger.error({ fn: 'vapi.function-call', error: err.message });
    res.json({ result: 'Sorry, I had trouble with that. Please try again.' });
  }
});

/**
 * POST /api/v1/vapi/call-end
 * Save transcript when a call finishes.
 */
router.post('/call-end', async (req, res) => {
  try {
    const call = req.body?.call || req.body?.message?.call;
    const phone = call?.customer?.number;
    const messages = call?.messages || [];
    const callId = call?.id;

    if (callId) {
      await ConversationSession.create({
        session_id: callId,
        phone,
        channel: 'vapi',
        messages: JSON.stringify(
          messages.map((m) => ({ role: m.role, content: m.message || m.content, ts: m.time }))
        ),
        ended_at: new Date(),
        last_active_at: new Date(),
      });
      logger.info({ fn: 'vapi.call-end', callId, phone, messageCount: messages.length });
    }

    res.json({ received: true });
  } catch (err) {
    logger.error({ fn: 'vapi.call-end', error: err.message });
    res.json({ received: true });
  }
});

/**
 * POST /api/v1/vapi/webhook
 * Unified webhook — Vapi sends ALL server messages here.
 * Routes internally to the right handler based on message.type.
 */
router.post('/webhook', async (req, res) => {
  const message = req.body?.message || req.body;
  const type = message?.type;

  logger.info({ fn: 'vapi.webhook', type });

  // Dynamic assistant config per caller
  if (type === 'assistant-request') {
    req.body = { call: message.call };
    return router.handle(req, res, () => res.status(404).end());
  }

  // Tool/function calls (current Vapi format — toolCallList)
  if (type === 'tool-calls') {
    try {
      const phone = message.call?.customer?.number;
      const toolCallList = message.toolCallList || [];
      const results = await Promise.all(
        toolCallList.map(async (tc) => {
          const fnName = tc.function?.name;
          const args = (() => {
            try { return JSON.parse(tc.function?.arguments || '{}'); } catch { return {}; }
          })();
          logger.info({ fn: 'vapi.tool-calls', function: fnName, phone });
          const result = await executeTool(fnName, args, phone);
          return { toolCallId: tc.id, result };
        })
      );
      return res.json({ results });
    } catch (err) {
      logger.error({ fn: 'vapi.tool-calls', error: err.message });
      return res.json({ results: [{ toolCallId: '', result: 'Sorry, something went wrong. Please try again.' }] });
    }
  }

  // Legacy function-call format
  if (type === 'function-call') {
    req.body = { call: message.call, functionCall: message.functionCall };
    return router.handle(req, res, () => res.status(404).end());
  }

  // Save transcript at end of call
  if (type === 'end-of-call-report') {
    req.body = { message };
    return router.handle(req, res, () => res.status(404).end());
  }

  // Status updates (call ringing, answered, etc.) — acknowledge and ignore
  if (type === 'status-update') {
    logger.info({ fn: 'vapi.status-update', status: message.status, callId: message.call?.id });
    return res.json({ received: true });
  }

  // Speech events — acknowledge and ignore
  if (type === 'speech-update' || type === 'transcript') {
    return res.json({ received: true });
  }

  logger.warn({ fn: 'vapi.webhook', unhandledType: type });
  res.json({ received: true });
});

module.exports = router;
