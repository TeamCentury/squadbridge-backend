const router = require('express').Router();
const validateSquadSig = require('../middleware/validateSquadSig');
const validateMetaSig = require('../middleware/validateMetaSig');
const redis = require('../config/redis');
const { Student, Transaction, School, Forecast, AuditLog, Trader, Graduate } = require('../models');
const { Op } = require('sequelize');
const squadService = require('../services/squadService');
const whatsappService = require('../services/whatsappService');
const { transcribeAudio, generateTTS } = require('../services/spitchService');
const { handleWhatsAppChat, explainForecast, handleWorkerChat } = require('../services/claudeService');
const { matchForUser } = require('../services/opportunityService');
const { scoreUser } = require('../services/creditScoringService');
const logger = require('../config/logger');

// Credit protection constants
const VOICE_DAILY_PER_USER = 3;   // max 3 voice msgs per user per day
const VOICE_DAILY_GLOBAL   = 20;  // max 20 voice msgs total per day across all users

async function checkVoiceQuota(phone) {
  const today = new Date().toISOString().split('T')[0];
  const userKey   = `voice:user:${phone}:${today}`;
  const globalKey = `voice:global:${today}`;

  const [userCount, globalCount] = await Promise.all([
    redis.incr(userKey),
    redis.incr(globalKey),
  ]);
  if (userCount === 1)   await redis.expire(userKey,   86400);
  if (globalCount === 1) await redis.expire(globalKey, 86400);

  if (globalCount > VOICE_DAILY_GLOBAL) return { allowed: false, reason: 'global' };
  if (userCount   > VOICE_DAILY_PER_USER) return { allowed: false, reason: 'user' };
  return { allowed: true };
}

/**
 * @swagger
 * /webhooks/squad/payment:
 *   post:
 *     summary: Squad payment webhook receiver
 *     description: |
 *       **Called by Squad — not by your frontend.**
 *
 *       Processes incoming payment events:
 *       1. Verifies HMAC-SHA256 signature in `x-squad-signature` header
 *       2. Deduplicates via Redis (24hr TTL on `transaction_id`)
 *       3. Updates student fee status and school collected amount
 *       4. Emits Socket.io `payment_received` event to connected dashboard clients
 *       5. Sends WhatsApp notification to school bursar
 *
 *       Always responds **HTTP 202** immediately; processing is async.
 *     tags: [Webhooks]
 *     security: []
 *     parameters:
 *       - in: header
 *         name: x-squad-signature
 *         required: true
 *         schema:
 *           type: string
 *         description: HMAC-SHA256 of the raw request body signed with your webhook secret
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               data:
 *                 type: object
 *                 properties:
 *                   transaction_ref:
 *                     type: string
 *                   transaction_amount:
 *                     type: number
 *                   transaction_status:
 *                     type: string
 *                     example: successful
 *                   payment_link_ref:
 *                     type: string
 *                   payment_type:
 *                     type: string
 *                     example: card
 *     responses:
 *       202:
 *         description: Accepted — processing asynchronously
 *       401:
 *         description: Invalid or missing Squad signature
 */
router.post('/squad/payment', validateSquadSig, async (req, res) => {
  res.status(202).json({ status: 'accepted' });

  const payload = req.body;
  const txId = payload?.data?.transaction_ref || payload?.transaction_ref;

  if (!txId) {
    return logger.warn({ event: 'webhook_missing_tx_id', payload });
  }

  try {
    const dedupeKey = `webhook:${txId}`;
    const already = await redis.get(dedupeKey);
    if (already) return logger.info({ event: 'webhook_duplicate', txId });
    await redis.set(dedupeKey, '1', 'EX', 86400);

    const webhookStatus = payload?.data?.transaction_status || payload?.transaction_status;
    if (webhookStatus !== 'successful' && webhookStatus !== 'success') {
      return logger.info({ event: 'webhook_non_success', status: webhookStatus, txId });
    }

    // Verify the transaction server-side before trusting webhook amounts
    let verified;
    try {
      const verifyRes = await squadService.verifyTransaction(txId);
      verified = verifyRes?.data;
    } catch (verifyErr) {
      logger.warn({ event: 'webhook_verify_failed', txId, error: verifyErr.message });
      return; // Silently drop — do not update balances on unverifiable transactions
    }

    if (!verified || (verified.transaction_status !== 'successful' && verified.transaction_status !== 'success')) {
      return logger.warn({ event: 'webhook_verify_mismatch', txId, status: verified?.transaction_status });
    }

    // Use verified amounts from Squad, not the webhook payload
    const amount = parseFloat(verified.transaction_amount || 0);
    const linkId = verified.payment_link_ref || payload?.data?.payment_link_ref;

    const student = linkId
      ? await Student.findOne({ where: { payment_link_id: linkId } })
      : null;

    await Transaction.create({
      school_id: student?.school_id,
      student_id: student?.id,
      squad_transaction_id: txId,
      amount,
      status: 'successful',
      payment_method: payload?.data?.payment_type,
      payment_link_id: linkId,
      webhook_received_at: new Date(),
      squad_payload: JSON.stringify(payload),
    });

    if (student) {
      const newPaid = parseFloat(student.amount_paid) + amount;
      const newStatus = newPaid >= parseFloat(student.fee_amount) ? 'paid'
        : newPaid > 0 ? 'partial' : 'unpaid';
      await student.update({ amount_paid: newPaid, fee_status: newStatus });
    }

    if (student?.school_id) {
      await AuditLog.create({
        school_id: student.school_id,
        event_type: 'PAYMENT_RECEIVED',
        amount,
        squad_transaction_id: txId,
        description: `Payment received from ${student?.name || 'unknown'}`,
      });

      const io = req.app.get('io');
      if (io) {
        const school = await School.findByPk(student.school_id);
        const allStudents = await Student.findAll({ where: { school_id: student.school_id } });
        const totalCollected = allStudents.reduce((s, st) => s + parseFloat(st.amount_paid), 0);
        const paidCount = allStudents.filter((st) => st.fee_status === 'paid').length;

        io.to(`school:${student.school_id}`).emit('payment_received', {
          transaction_id: txId, student_name: student.name, amount,
          total_collected: totalCollected, students_paid: paidCount, total_students: allStudents.length,
        });

        if (school) {
          await whatsappService.notifyPaymentReceived(school.phone, amount, student.name, totalCollected);
        }
      }
    }

    logger.info({ event: 'webhook_processed', txId, amount, student: student?.name });
  } catch (err) {
    logger.error({ event: 'webhook_processing_error', txId, error: err.message });
  }
});

/**
 * @swagger
 * /webhooks/whatsapp:
 *   get:
 *     summary: WhatsApp webhook verification
 *     tags: [Webhooks]
 *     security: []
 */
router.get('/whatsapp', (req, res) => {
  const { 'hub.mode': mode, 'hub.verify_token': token, 'hub.challenge': challenge } = req.query;
  if (mode === 'subscribe' && token === process.env.WHATSAPP_VERIFY_TOKEN) {
    return res.status(200).send(challenge);
  }
  res.sendStatus(403);
});

// ── WhatsApp constants ───────────────────────────────────────────────────────

const GREETINGS = ['hi', 'hello', 'hey', 'menu', 'start', 'help', 'helo', 'hai'];

const SCHOOL_MENU_BUTTONS = [
  { id: 'btn_forecast', title: 'Cash Flow' },
  { id: 'btn_fees',     title: 'Fee Collections' },
  { id: 'btn_pl',       title: 'P&L Report' },
];
const SCHOOL_FOLLOWUP = [
  { id: 'btn_menu', title: 'Main Menu' },
  { id: 'btn_ask',  title: 'Ask a Question' },
];
const WORKER_FOLLOWUP = [
  { id: 'btn_jobs',  title: 'Find Jobs' },
  { id: 'btn_score', title: 'My Score' },
  { id: 'btn_menu',  title: 'Main Menu' },
];

// ── Session helpers (Redis, 30-day TTL) ─────────────────────────────────────

async function getWASession(phone) {
  try {
    const raw = await redis.get(`wa:sess:${phone}`);
    return raw ? JSON.parse(raw) : {};
  } catch { return {}; }
}

async function setWASession(phone, updates) {
  try {
    const current = await getWASession(phone);
    await redis.set(`wa:sess:${phone}`, JSON.stringify({ ...current, ...updates }), 'EX', 30 * 24 * 3600);
  } catch {}
}

// ── User lookup ──────────────────────────────────────────────────────────────

async function findUserByPhone(phone) {
  const norm = phone.replace(/^\+234/, '0').slice(-10);
  const like = { [Op.like]: `%${norm}` };
  const [school, trader, graduate] = await Promise.all([
    School.findOne({ where: { phone: like } }),
    Trader.findOne({ where: { phone: like } }),
    Graduate.findOne({ where: { phone: like } }),
  ]);
  if (school)   return { user: school,   userType: 'school' };
  if (trader)   return { user: trader,   userType: 'trader' };
  if (graduate) return { user: graduate, userType: 'graduate' };
  return { user: null, userType: null };
}

// ── Intent detection (keyword-first, no API cost) ────────────────────────────

function detectIntent(text) {
  const t = text.toLowerCase();
  if (/\b(job|work|gig|opport|find me|looking for|hire me|vacancy|intern|employ)\b/.test(t)) return 'job_search';
  if (/\b(score|credit|loan|eligible|borrow|lending)\b/.test(t)) return 'credit_score';
  if (/\b(balance|wallet|naira|account balance|how much)\b/.test(t)) return 'balance';
  if (/\b(forecast|cash flow|projection|30 day|60 day|90 day)\b/.test(t)) return 'forecast';
  if (/\b(p&l|profit|loss|income|revenue|expense|annual)\b/.test(t)) return 'pl_report';
  if (/\b(fee|student|collection|paid|unpaid|term|invoice)\b/.test(t)) return 'fee_collections';
  return 'general';
}

// ── Main menu ────────────────────────────────────────────────────────────────

async function sendMainMenu(phone, user, userType) {
  const name = user?.name?.split(' ')[0] || 'there';
  if (userType === 'school') {
    await whatsappService.sendButtons(
      phone,
      `Hi ${name}! 👋 Welcome to *SquadBridge*.\n\nI can give you live financial data about your school. What would you like to check?`,
      SCHOOL_MENU_BUTTONS
    );
  } else {
    await whatsappService.sendButtons(
      phone,
      `Hi ${name}! 👋 I'm your *SquadBridge* assistant.\n\nI can help you find jobs, check your credit score, or answer any questions. What would you like to do?`,
      WORKER_FOLLOWUP
    );
  }
}

// ── Intent executor ──────────────────────────────────────────────────────────

async function executeIntent(intent, user, userType, rawText, language) {
  try {
    if (intent === 'job_search') {
      const opps = await matchForUser(user.id, userType, user.skills || '[]', 5);
      if (!opps.length) {
        const skills = (() => { try { return JSON.parse(user.skills || '[]').join(', '); } catch { return ''; } })();
        return `No matching opportunities right now. 🔍 New gigs are posted daily — check back tomorrow!\n\nYour skills on record: ${skills || 'none set. Update your profile to improve matches.'}`;
      }
      const list = opps.slice(0, 3).map((o, i) =>
        `*${i + 1}. ${o.title}*\n${o.organization || 'SquadBridge Platform'}${o.deadline ? `\nDeadline: ${o.deadline}` : ''}`
      ).join('\n\n');
      return `Here are your top matches 🎯\n\n${list}\n\nTap *Find Jobs* again to refresh, or ask me about any of these.`;
    }

    if (intent === 'credit_score') {
      const profile = await scoreUser(user.id, userType);
      const tier = profile.score >= 700 ? 'Excellent 🌟' : profile.score >= 600 ? 'Good ✅' : profile.score >= 500 ? 'Fair 📈' : 'Building 🔧';
      const advice = profile.score >= 650
        ? 'You qualify for working capital loans. Reply *loan* to learn more.'
        : 'Complete more gigs and ensure payments are made on time to improve your score.';
      return `Your SquadBridge credit score:\n\n*${profile.score}/850* — ${tier}\n\n${advice}`;
    }

    if (intent === 'balance') {
      const balRes = await squadService.getBalance().catch(() => null);
      const balance = balRes?.data?.balance || 0;
      return `Your SquadBridge balance: *₦${Number(balance).toLocaleString()}*`;
    }

    if (intent === 'forecast' && userType === 'school') {
      const forecast = await Forecast.findOne({ where: { school_id: user.id }, order: [['generated_at', 'DESC']] });
      if (!forecast) return 'No forecast yet — your school needs at least a few transactions first. Check back after some payments come in.';
      const explanation = await explainForecast(forecast, user.name, 0) || '';
      return `📊 *Cash Flow Forecast for ${user.name}*\n\n30 days: ₦${Number(forecast.day30).toLocaleString()}\n60 days: ₦${Number(forecast.day60).toLocaleString()}\n90 days: ₦${Number(forecast.day90).toLocaleString()}\n\n${explanation}`;
    }

    if (intent === 'pl_report' && userType === 'school') {
      const s = parseFloat(user.student_count || 0);
      const f = parseFloat(user.fee_per_term || 0);
      const sc = parseFloat(user.staff_count || 0);
      const sa = parseFloat(user.avg_salary || 0);
      const annual_income = f * s * 3;
      const salary_expense = sa * sc * 12;
      const total_expenses = salary_expense + (3000 * 0.8 * s * 12) + (2500 * 0.7 * s * 12) + (150000 * 12) + (100000 * 12);
      const net = annual_income - total_expenses;
      const status = net >= 0 ? `✅ Surplus of ₦${Math.abs(net).toLocaleString()}` : `⚠️ Deficit of ₦${Math.abs(net).toLocaleString()}`;
      return `📋 *P&L Summary — ${user.name}*\n\nAnnual Income: ₦${annual_income.toLocaleString()}\nTotal Expenses: ₦${total_expenses.toLocaleString()}\nNet Position: ${status}`;
    }

    if (intent === 'fee_collections' && userType === 'school') {
      const students = await Student.findAll({ where: { school_id: user.id } });
      const paid     = students.filter((s) => s.fee_status === 'paid').length;
      const partial  = students.filter((s) => s.fee_status === 'partial').length;
      const unpaid   = students.filter((s) => s.fee_status === 'unpaid').length;
      const collected = students.reduce((sum, s) => sum + parseFloat(s.amount_paid || 0), 0);
      const expected  = students.reduce((sum, s) => sum + parseFloat(s.fee_amount || 0), 0);
      return `💰 *Fee Collections — ${user.name}*\n\n✅ Paid: ${paid}\n⏳ Partial: ${partial}\n❌ Unpaid: ${unpaid}\n\nCollected: ₦${collected.toLocaleString()} of ₦${expected.toLocaleString()}`;
    }

    // General — Claude AI (user-type-aware)
    if (userType === 'school') {
      const ctx = { name: user.name, student_count: user.student_count, fee_per_term: user.fee_per_term, balance: 0 };
      return await handleWhatsAppChat(rawText, ctx, language);
    }
    const workerCtx = { name: user.name, type: userType, skills: user.skills, state: user.state };
    return await handleWorkerChat(rawText, workerCtx, language);
  } catch (err) {
    logger.error({ fn: 'wa.executeIntent', intent, userType, error: err.message });
    return "I'm having trouble with that right now. Please try again.";
  }
}

/**
 * @swagger
 * /webhooks/whatsapp:
 *   post:
 *     summary: Incoming WhatsApp messages — unified handler for all user types
 *     tags: [Webhooks]
 *     security: []
 */
router.post('/whatsapp', validateMetaSig, async (req, res) => {
  res.sendStatus(200);

  try {
    const message = req.body?.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
    if (!message) return;

    const senderPhone = `+${message.from}`;
    await whatsappService.markAsRead(message.id);
    await whatsappService.showTyping(message.id);

    const { user, userType } = await findUserByPhone(senderPhone);

    // ── Unregistered user ────────────────────────────────────────────────────
    if (!user) {
      const bodyText = message.text?.body?.trim().toLowerCase() || '';
      if (GREETINGS.includes(bodyText)) {
        await whatsappService.sendText(
          senderPhone,
          `👋 Hi! I'm the *SquadBridge* assistant.\n\nSquadBridge connects traders, graduates, and businesses across Nigeria.\n\n` +
          `• *Trader or Graduate?* Register at ${process.env.FRONTEND_URL}/onboarding — takes 2 minutes.\n` +
          `• *School or business?* Same link — you'll get your own financial dashboard here.\n` +
          `• *Already registered?* Make sure you signed up with this phone number.`
        );
      } else {
        await whatsappService.sendText(
          senderPhone,
          `I don't have your number on record yet. 📋\n\nComplete registration at ${process.env.FRONTEND_URL}/onboarding, then come back here to chat!`
        );
      }
      return;
    }

    const session = await getWASession(senderPhone);
    let userText = '';
    let isVoiceMessage = false;
    let language = session.language || 'en-NG';

    // ── Voice note ───────────────────────────────────────────────────────────
    if (message.type === 'audio') {
      const quota = await checkVoiceQuota(senderPhone);
      if (!quota.allowed) {
        await whatsappService.sendText(
          senderPhone,
          quota.reason === 'global'
            ? 'Our voice service is at capacity for today. Please type your message instead.'
            : `You've used your ${VOICE_DAILY_PER_USER} voice messages for today. Type your question and I'll still help!`
        );
        return;
      }

      const { buffer, mimeType } = await whatsappService.downloadMedia(message.audio.id);
      const stt = await transcribeAudio(buffer, mimeType);
      if (!stt?.transcript) {
        await whatsappService.sendText(senderPhone, "Sorry, I couldn't make out that voice note. Could you try again or type your question?");
        return;
      }

      userText = stt.transcript;
      isVoiceMessage = true;
      language = stt.language || language;
      await setWASession(senderPhone, { language });

      // First voice note — ask reply format preference, hold transcript
      if (!session.reply_format) {
        await setWASession(senderPhone, { pending_transcript: userText, pending_language: language });
        await whatsappService.sendText(
          senderPhone,
          `🎤 _You said:_ "${userText.slice(0, 120)}${userText.length > 120 ? '...' : ''}"\n\nHow would you like my replies?\n\n*1* — Voice notes 🎤\n*2* — Text messages 📝`
        );
        return;
      }
    }

    // ── Text message ─────────────────────────────────────────────────────────
    else if (message.type === 'text') {
      userText = message.text?.body?.trim() || '';

      // Handle reply-format preference response
      if (session.pending_transcript && (userText === '1' || userText === '2')) {
        const format = userText === '1' ? 'voice' : 'text';
        const pendingText = session.pending_transcript;
        const pendingLang = session.pending_language || language;
        await setWASession(senderPhone, { reply_format: format, pending_transcript: null, pending_language: null });
        userText = pendingText;
        isVoiceMessage = format === 'voice';
        language = pendingLang;
      }
    }

    // ── Interactive (button tap) ─────────────────────────────────────────────
    else if (message.type === 'interactive') {
      const ir = message.interactive;
      const buttonId = ir.type === 'button_reply' ? ir.button_reply?.id : ir.list_reply?.id;
      const buttonTitle = ir.type === 'button_reply' ? ir.button_reply?.title : ir.list_reply?.title;

      if (buttonId === 'btn_menu' || buttonId === 'btn_ask') {
        await sendMainMenu(senderPhone, user, userType);
        return;
      }
      const intentMap = {
        btn_jobs:     'find me jobs',
        btn_score:    'what is my credit score',
        btn_forecast: 'cash flow forecast',
        btn_fees:     'fee collections summary',
        btn_pl:       'show p&l report',
      };
      userText = intentMap[buttonId] || buttonTitle || '';
    }

    if (!userText) return;

    // ── Greeting → main menu ─────────────────────────────────────────────────
    if (GREETINGS.includes(userText.toLowerCase())) {
      await sendMainMenu(senderPhone, user, userType);
      return;
    }

    // ── Detect intent and execute ────────────────────────────────────────────
    const intent = detectIntent(userText);
    const replyText = await executeIntent(intent, user, userType, userText, language);

    // ── Send reply (voice or text based on stored preference) ────────────────
    const replyFormat = session.reply_format || 'text';
    if (isVoiceMessage && replyFormat === 'voice') {
      const tts = await generateTTS(replyText, language).catch(() => null);
      if (tts?.audio_url) {
        await whatsappService.sendAudio(senderPhone, tts.audio_url);
      } else {
        // TTS failed — fall back to text with transcript header
        await whatsappService.sendText(senderPhone, `🎤 _You said:_ "${userText}"\n\n${replyText}`);
      }
    } else {
      // For voice-in text-out, show transcript so the user knows it was understood
      const prefix = isVoiceMessage ? `🎤 _You said:_ "${userText}"\n\n` : '';
      await whatsappService.sendText(senderPhone, `${prefix}${replyText}`);
    }

    // Follow-up buttons (skip after audio reply — buttons don't render on audio messages)
    if (!(isVoiceMessage && replyFormat === 'voice')) {
      const followup = userType === 'school' ? SCHOOL_FOLLOWUP : WORKER_FOLLOWUP;
      await whatsappService.sendButtons(senderPhone, 'What would you like to do next?', followup);
    }

    logger.info({ event: 'whatsapp_msg', from: senderPhone, userType, intent, isVoice: isVoiceMessage });
  } catch (err) {
    logger.error(`whatsapp_webhook_error: ${err.message}`, { stack: err.stack, response: err.response?.data });
  }
});

module.exports = router;
