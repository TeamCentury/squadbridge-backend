const axios = require('axios');
const { sendText } = require('./whatsappService');
const logger = require('../config/logger');

const BASE_URL = process.env.SQUAD_BASE_URL || 'https://sandbox-api-d.squadco.com';

const squadClient = axios.create({
  baseURL: BASE_URL,
  headers: {
    Authorization: `Bearer ${process.env.SQUAD_SECRET_KEY}`,
    'Content-Type': 'application/json',
  },
  timeout: 30000,
});

/**
 * Create a direct debit mandate for recurring payments.
 * Used for recurring platform fees, subscription plans, etc.
 */
async function createMandate({ customerId, customerName, customerEmail, customerPhone, amount, frequency, startDate, endDate, description }) {
  try {
    const res = await squadClient.post('/direct-debit/mandate', {
      customer_id: customerId,
      customer_name: customerName,
      customer_email: customerEmail,
      customer_mobile: customerPhone?.replace(/^\+/, ''),
      amount: Math.round(amount * 100), // kobo
      frequency,          // e.g. 'monthly', 'weekly'
      start_date: startDate,
      end_date: endDate,
      description: description || 'SquadBridge recurring fee',
    });

    logger.info({ fn: 'directDebit.createMandate', customerId, amount });
    return res.data;
  } catch (err) {
    logger.error({ fn: 'directDebit.createMandate', error: err.response?.data || err.message });
    throw new Error(err.response?.data?.message || err.message);
  }
}

/**
 * Debit an existing mandate — triggers a charge on the linked account.
 */
async function chargeMandate({ mandateId, amount, transactionReference }) {
  try {
    const res = await squadClient.post('/direct-debit/charge', {
      mandate_id: mandateId,
      amount: Math.round(amount * 100),
      transaction_reference: transactionReference,
    });

    logger.info({ fn: 'directDebit.chargeMandate', mandateId, amount });
    return res.data;
  } catch (err) {
    logger.error({ fn: 'directDebit.chargeMandate', error: err.response?.data || err.message });
    throw new Error(err.response?.data?.message || err.message);
  }
}

/**
 * Cancel a direct debit mandate.
 */
async function cancelMandate(mandateId) {
  try {
    const res = await squadClient.post(`/direct-debit/mandate/${mandateId}/cancel`, {});
    return res.data;
  } catch (err) {
    logger.error({ fn: 'directDebit.cancelMandate', error: err.response?.data || err.message });
    throw new Error(err.response?.data?.message || err.message);
  }
}

/**
 * Get mandate status.
 */
async function getMandateStatus(mandateId) {
  try {
    const res = await squadClient.get(`/direct-debit/mandate/${mandateId}`);
    return res.data;
  } catch (err) {
    logger.error({ fn: 'directDebit.getMandateStatus', error: err.response?.data || err.message });
    throw new Error(err.response?.data?.message || err.message);
  }
}

/**
 * Process school payroll via direct debit from school's linked bank.
 * Charges amount and notifies school admin.
 */
async function processPayrollDebit({ schoolId, mandateId, totalAmount, staffCount, month, adminPhone }) {
  const txRef = `SB_payroll_${schoolId}_${month}_${Date.now()}`;

  const result = await chargeMandate({
    mandateId,
    amount: totalAmount,
    transactionReference: txRef,
  });

  if (adminPhone) {
    sendText(adminPhone,
      `SquadBridge Payroll ✓\n\nMonth: ${month}\nStaff paid: ${staffCount}\nTotal: ₦${Number(totalAmount).toLocaleString()}\nRef: ${txRef}\n\nFunds will be disbursed within 2 business days.`
    ).catch(() => {});
  }

  return { ...result, txRef };
}

module.exports = { createMandate, chargeMandate, cancelMandate, getMandateStatus, processPayrollDebit };
