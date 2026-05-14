const router = require('express').Router();
const validateSquadSig = require('../middleware/validateSquadSig');
const redis = require('../config/redis');
const { Student, Transaction, School, AuditLog } = require('../models');
const whatsappService = require('../services/whatsappService');
const { handleWhatsAppChat } = require('../services/claudeService');
const logger = require('../config/logger');

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

    const amount = parseFloat(payload?.data?.transaction_amount || payload?.amount || 0);
    const linkId = payload?.data?.payment_link_ref || payload?.payment_link_ref;
    const status = payload?.data?.transaction_status || payload?.transaction_status;

    if (status !== 'successful' && status !== 'success') {
      return logger.info({ event: 'webhook_non_success', status, txId });
    }

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
router.post('/whatsapp', async (req, res) => {
  res.sendStatus(200);

  try {
    const entry = req.body?.entry?.[0];
    const change = entry?.changes?.[0];
    const message = change?.value?.messages?.[0];

    if (!message || message.type !== 'text') return;

    const senderPhone = `+${message.from}`;
    const userText = message.text?.body;

    if (!userText) return;

    const school = await School.findOne({ where: { phone: senderPhone } });
    const schoolContext = school
      ? { name: school.name, student_count: school.student_count, fee_per_term: school.fee_per_term, balance: 0 }
      : null;

    const reply = await handleWhatsAppChat(userText, schoolContext);
    await whatsappService.sendText(senderPhone, reply);

    logger.info({ event: 'whatsapp_chat', from: senderPhone, school: school?.name });
  } catch (err) {
    logger.error({ event: 'whatsapp_webhook_error', error: err.message });
  }
});

module.exports = router;
