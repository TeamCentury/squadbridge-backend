const router = require('express').Router();
const validateSquadSig = require('../middleware/validateSquadSig');
const validateMetaSig = require('../middleware/validateMetaSig');
const redis = require('../config/redis');
const { Student, Transaction, School, Forecast, AuditLog } = require('../models');
const squadService = require('../services/squadService');
const whatsappService = require('../services/whatsappService');
const { generateTTS, transcribeAudio } = require('../services/spitchService');
const { handleWhatsAppChat, explainForecast } = require('../services/claudeService');
const logger = require('../config/logger');

// Credit protection constants
const VOICE_DAILY_PER_USER = 3;   // max 3 voice msgs per user per day
const VOICE_DAILY_GLOBAL   = 20;  // max 20 voice msgs total per day across all users
const TTS_MAX_CHARS        = 280; // only do TTS if reply is short enough

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
 *     description: Meta Cloud API verification handshake — returns hub.challenge if token matches.
 *     tags: [Webhooks]
 *     security: []
 *     parameters:
 *       - in: query
 *         name: hub.mode
 *         schema: { type: string }
 *       - in: query
 *         name: hub.verify_token
 *         schema: { type: string }
 *       - in: query
 *         name: hub.challenge
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Verification challenge echoed back
 *       403:
 *         description: Token mismatch
 */
router.get('/whatsapp', (req, res) => {
  const { 'hub.mode': mode, 'hub.verify_token': token, 'hub.challenge': challenge } = req.query;
  if (mode === 'subscribe' && token === process.env.WHATSAPP_VERIFY_TOKEN) {
    return res.status(200).send(challenge);
  }
  res.sendStatus(403);
});

/**
 * @swagger
 * /webhooks/whatsapp:
 *   post:
 *     summary: Incoming WhatsApp messages
 *     description: |
 *       Receives messages from WhatsApp Business API. Looks up the school by sender phone number
 *       and uses Claude AI to generate a contextual reply.
 *     tags: [Webhooks]
 *     security: []
 *     responses:
 *       200:
 *         description: Message processed
 */
const GREETINGS = ['hi', 'hello', 'hey', 'menu', 'start', 'help', 'helo', 'hai'];
const MAIN_MENU_BUTTONS = [
  { id: 'btn_forecast', title: 'Cash Flow Forecast' },
  { id: 'btn_pl',       title: 'P&L Report' },
  { id: 'btn_fees',     title: 'Fee Collections' },
];
const FOLLOWUP_BUTTONS = [
  { id: 'btn_menu',     title: 'Main Menu' },
  { id: 'btn_ask',      title: 'Ask a Question' },
];

async function sendMainMenu(phone, school) {
  const name = school?.name || 'there';
  await whatsappService.sendButtons(
    phone,
    `Hi ${name}! 👋 Welcome to *SquadBridge*.\n\nI can give you live financial data about your school. What would you like to check?`,
    MAIN_MENU_BUTTONS
  );
}

async function handleButtonAction(buttonId, phone, school) {
  if (buttonId === 'btn_menu' || buttonId === 'btn_ask') {
    return sendMainMenu(phone, school);
  }

  if (!school) {
    await whatsappService.sendButtons(
      phone,
      'Your phone number is not linked to a SquadBridge school. Please onboard at squadbridge.com or contact support.',
      [{ id: 'btn_menu', title: 'Main Menu' }]
    );
    return;
  }

  if (buttonId === 'btn_forecast') {
    const forecast = await Forecast.findOne({ where: { school_id: school.id }, order: [['generated_at', 'DESC']] });
    if (!forecast) {
      await whatsappService.sendButtons(
        phone,
        'No forecast yet — your school needs at least a few transactions first. Check back after some payments come in.',
        [{ id: 'btn_menu', title: 'Main Menu' }]
      );
      return;
    }
    const explanation = await explainForecast(forecast, school.name, 0) || 'Forecast data retrieved.';
    await whatsappService.sendText(phone, `📊 *Cash Flow Forecast for ${school.name}*\n\n30 days: ₦${Number(forecast.day30).toLocaleString()}\n60 days: ₦${Number(forecast.day60).toLocaleString()}\n90 days: ₦${Number(forecast.day90).toLocaleString()}\n\n${explanation}`);
    await whatsappService.sendButtons(phone, 'What would you like to do next?', FOLLOWUP_BUTTONS);
    return;
  }

  if (buttonId === 'btn_pl') {
    const s = parseFloat(school.student_count);
    const f = parseFloat(school.fee_per_term);
    const sc = parseFloat(school.staff_count);
    const sa = parseFloat(school.avg_salary);
    const annual_income = f * s * 3;
    const salary_expense = sa * sc * 12;
    const total_expenses = salary_expense + (3000 * 0.8 * s * 12) + (2500 * 0.7 * s * 12) + (150000 * 12) + (100000 * 12);
    const net = annual_income - total_expenses;
    const status = net >= 0 ? `✅ Surplus of ₦${Math.abs(net).toLocaleString()}` : `⚠️ Deficit of ₦${Math.abs(net).toLocaleString()}`;
    await whatsappService.sendText(phone, `📋 *P&L Summary — ${school.name}*\n\nAnnual Income: ₦${annual_income.toLocaleString()}\nTotal Expenses: ₦${total_expenses.toLocaleString()}\nNet Position: ${status}`);
    await whatsappService.sendButtons(phone, 'Would you like an AI recommendation on this?', [
      { id: 'btn_pl_ai', title: 'Get Recommendation' },
      { id: 'btn_menu',  title: 'Main Menu' },
    ]);
    return;
  }

  if (buttonId === 'btn_pl_ai') {
    const s = parseFloat(school.student_count);
    const f = parseFloat(school.fee_per_term);
    const sc = parseFloat(school.staff_count);
    const sa = parseFloat(school.avg_salary);
    const annual_income = f * s * 3;
    const salary_expense = sa * sc * 12;
    const total_expenses = salary_expense + (3000 * 0.8 * s * 12) + (2500 * 0.7 * s * 12) + (150000 * 12) + (100000 * 12);
    const net_position = annual_income - total_expenses;
    const { generatePLRecommendation } = require('../services/claudeService');
    const rec = await generatePLRecommendation({ annual_income, total_expenses, net_position, salary_expense, student_count: s, fee_per_term: f, staff_count: sc }, school.name);
    await whatsappService.sendText(phone, `🤖 *AI Analysis*\n\n${rec || 'Unable to generate recommendation right now.'}`);
    await whatsappService.sendButtons(phone, 'What would you like to do next?', FOLLOWUP_BUTTONS);
    return;
  }

  if (buttonId === 'btn_fees') {
    const students = await Student.findAll({ where: { school_id: school.id } });
    const paid = students.filter(s => s.fee_status === 'paid').length;
    const partial = students.filter(s => s.fee_status === 'partial').length;
    const unpaid = students.filter(s => s.fee_status === 'unpaid').length;
    const totalCollected = students.reduce((sum, s) => sum + parseFloat(s.amount_paid || 0), 0);
    const totalExpected = students.reduce((sum, s) => sum + parseFloat(s.fee_amount || 0), 0);
    await whatsappService.sendText(
      phone,
      `💰 *Fee Collections — ${school.name}*\n\n✅ Fully paid: ${paid} students\n⏳ Partial: ${partial} students\n❌ Unpaid: ${unpaid} students\n\nCollected: ₦${totalCollected.toLocaleString()} of ₦${totalExpected.toLocaleString()}`
    );
    await whatsappService.sendButtons(phone, 'What would you like to do next?', FOLLOWUP_BUTTONS);
    return;
  }
}

router.post('/whatsapp', validateMetaSig, async (req, res) => {
  res.sendStatus(200);

  try {
    const entry = req.body?.entry?.[0];
    const change = entry?.changes?.[0];
    const message = change?.value?.messages?.[0];

    if (!message) return;

    const senderPhone = `+${message.from}`;

    await whatsappService.markAsRead(message.id);
    await whatsappService.showTyping(message.id);

    // ── Voice note handling ──────────────────────────────────────────────────
    if (message.type === 'audio') {
      const quota = await checkVoiceQuota(senderPhone);
      if (!quota.allowed) {
        const msg = quota.reason === 'global'
          ? 'Our voice service is at capacity for today. Please type your question instead.'
          : `You've used your ${VOICE_DAILY_PER_USER} voice messages for today. Type your question and I'll still help!`;
        await whatsappService.sendText(senderPhone, msg);
        return;
      }

      const { buffer, mimeType } = await whatsappService.downloadMedia(message.audio.id);
      const stt = await transcribeAudio(buffer, mimeType);

      if (!stt?.transcript) {
        await whatsappService.sendText(senderPhone, "Sorry, I couldn't make out that voice note. Could you try again or type your question?");
        return;
      }

      const detectedLang = stt.language || 'en-NG';
      const school = await School.findOne({ where: { phone: senderPhone } });
      const schoolCtx = school
        ? { name: school.name, student_count: school.student_count, fee_per_term: school.fee_per_term, balance: 0 }
        : null;

      const reply = await handleWhatsAppChat(stt.transcript, schoolCtx, detectedLang);

      // Send TTS audio only if reply is short enough to keep costs down
      if (reply.length <= TTS_MAX_CHARS) {
        const tts = await generateTTS(reply, detectedLang).catch(() => null);
        if (tts?.audio_url) await whatsappService.sendAudio(senderPhone, tts.audio_url);
      }

      // Always send text too as fallback
      await whatsappService.sendText(senderPhone, `🎤 _You said:_ "${stt.transcript}"\n\n${reply}`);
      await whatsappService.sendButtons(senderPhone, 'What would you like to do next?', FOLLOWUP_BUTTONS);

      logger.info({ event: 'whatsapp_voice', from: senderPhone, lang: detectedLang, school: school?.name });
      return;
    }
    // ────────────────────────────────────────────────────────────────────────

    // Extract text or button selection
    let userText = '';
    let buttonId = null;

    if (message.type === 'text') {
      userText = message.text?.body?.trim() || '';
    } else if (message.type === 'interactive') {
      const ir = message.interactive;
      if (ir.type === 'button_reply') {
        buttonId = ir.button_reply.id;
        userText = ir.button_reply.title;
      } else if (ir.type === 'list_reply') {
        buttonId = ir.list_reply.id;
        userText = ir.list_reply.title;
      }
    }

    if (!userText && !buttonId) return;

    const school = await School.findOne({ where: { phone: senderPhone } });

    // Unknown number — politely explain what SquadBridge is
    if (!school && !buttonId && GREETINGS.includes(userText.toLowerCase())) {
      await whatsappService.sendText(
        senderPhone,
        `👋 Hi! I'm the *SquadBridge* assistant.\n\nSquadBridge helps Nigerian schools automate fee collection, payroll, and cash flow management.\n\n` +
        `• *School administrator?* Register your school at squadbridge.com to access your financial dashboard here.\n` +
        `• *Parent paying fees?* Ask your school bursar for your personalised payment link.\n` +
        `• *Questions?* Email support@squadbridge.com`
      );
      return;
    }

    // Route: greeting → main menu
    if (GREETINGS.includes(userText.toLowerCase()) || buttonId === 'btn_menu') {
      await sendMainMenu(senderPhone, school);
      logger.info({ event: 'whatsapp_menu', from: senderPhone });
      return;
    }

    // Route: button tap → dedicated handler
    if (buttonId) {
      await handleButtonAction(buttonId, senderPhone, school);
      logger.info({ event: 'whatsapp_button', from: senderPhone, buttonId });
      return;
    }

    // Route: free text → Claude (school users only) or onboarding nudge
    if (!school) {
      await whatsappService.sendText(
        senderPhone,
        `I don't have your school on record yet. 🏫\n\nTo use SquadBridge:\n1. Register at squadbridge.com\n2. Use the same phone number you sign up with\n\nOnce registered, text *menu* to get started.\n\nFor help: support@squadbridge.com`
      );
      return;
    }

    const schoolContext = { name: school.name, student_count: school.student_count, fee_per_term: school.fee_per_term, balance: 0 };
    const reply = await handleWhatsAppChat(userText, schoolContext);
    await whatsappService.sendText(senderPhone, reply);
    await whatsappService.sendButtons(senderPhone, 'What would you like to do next?', FOLLOWUP_BUTTONS);

    logger.info({ event: 'whatsapp_chat', from: senderPhone, school: school?.name });
  } catch (err) {
    logger.error(`whatsapp_webhook_error: ${err.message}`, { stack: err.stack, response: err.response?.data });
  }
});

module.exports = router;
