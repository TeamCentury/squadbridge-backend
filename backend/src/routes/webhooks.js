const router = require('express').Router();
const validateSquadSig = require('../middleware/validateSquadSig');
const redis = require('../config/redis');
const { Student, Transaction, School, AuditLog } = require('../models');
const whatsappService = require('../services/whatsappService');
const logger = require('../config/logger');

// POST /webhooks/squad/payment
router.post('/squad/payment', validateSquadSig, async (req, res) => {
  // Respond immediately to Squad — processing is async
  res.status(202).json({ status: 'accepted' });

  const payload = req.body;
  const txId = payload?.data?.transaction_ref || payload?.transaction_ref;

  if (!txId) {
    return logger.warn({ event: 'webhook_missing_tx_id', payload });
  }

  try {
    // Idempotency check: skip if already processed
    const dedupeKey = `webhook:${txId}`;
    const already = await redis.get(dedupeKey);
    if (already) {
      return logger.info({ event: 'webhook_duplicate', txId });
    }
    await redis.set(dedupeKey, '1', 'EX', 86400);

    const amount = parseFloat(payload?.data?.transaction_amount || payload?.amount || 0);
    const linkId = payload?.data?.payment_link_ref || payload?.payment_link_ref;
    const status = payload?.data?.transaction_status || payload?.transaction_status;

    if (status !== 'successful' && status !== 'success') {
      return logger.info({ event: 'webhook_non_success', status, txId });
    }

    // Find the student by payment link
    const student = linkId
      ? await Student.findOne({ where: { payment_link_id: linkId } })
      : null;

    // Record transaction
    const tx = await Transaction.create({
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

    // Update student payment status
    if (student) {
      const newPaid = parseFloat(student.amount_paid) + amount;
      const newStatus = newPaid >= parseFloat(student.fee_amount) ? 'paid'
        : newPaid > 0 ? 'partial' : 'unpaid';
      await student.update({ amount_paid: newPaid, fee_status: newStatus });
    }

    // Audit
    if (student?.school_id) {
      await AuditLog.create({
        school_id: student.school_id,
        event_type: 'PAYMENT_RECEIVED',
        amount,
        squad_transaction_id: txId,
        description: `Payment received from ${student?.name || 'unknown'}`,
      });

      // Real-time dashboard push via Socket.io
      const io = req.app.get('io');
      if (io) {
        const school = await School.findByPk(student.school_id);
        const allStudents = await Student.findAll({ where: { school_id: student.school_id } });
        const totalCollected = allStudents.reduce((s, st) => s + parseFloat(st.amount_paid), 0);
        const paidCount = allStudents.filter((st) => st.fee_status === 'paid').length;

        io.to(`school:${student.school_id}`).emit('payment_received', {
          transaction_id: txId,
          student_name: student.name,
          amount,
          total_collected: totalCollected,
          students_paid: paidCount,
          total_students: allStudents.length,
        });

        // WhatsApp notification
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

module.exports = router;
