const axios = require('axios');
const { EscrowAccount } = require('../models');
const squadService = require('./squadService');
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
 * Create a dynamic virtual account for a specific job (escrow).
 * Squad Dynamic VA v2 — per-transaction, time-limited.
 */
async function createEscrow({ employerId, workerId, workerType, gigPostId, agreedAmount, jobTitle, jobDescription, durationDays, workerPhone, employerPhone }) {
  const escrow = await EscrowAccount.create({
    employer_id: employerId,
    worker_id: workerId,
    worker_type: workerType,
    gig_post_id: gigPostId || null,
    agreed_amount: agreedAmount,
    job_title: jobTitle,
    job_description: jobDescription,
    duration_days: durationDays || null,
    status: 'pending',
  });

  // Create Squad Dynamic Virtual Account
  let dynamicNuban = null;
  try {
    const res = await squadClient.post('/virtual-account/dynamic', {
      customer_identifier: `escrow_${escrow.id}`,
      amount: Math.round(agreedAmount * 100), // kobo
      beneficiary_account: '0000000000',
      return_url: `${process.env.FRONTEND_URL}/escrow/${escrow.id}/funded`,
      description: `Escrow: ${jobTitle}`,
    });
    dynamicNuban = res.data?.data?.virtual_account_number;
    const vaId = res.data?.data?.id;
    await escrow.update({ squad_dynamic_nuban: dynamicNuban, squad_virtual_account_id: vaId });
  } catch (err) {
    logger.warn({ fn: 'escrow.createEscrow', msg: 'Dynamic VA failed — using static NUBAN as fallback', error: err.response?.data || err.message });
    // Fallback: use platform static account — employer pays amount + ref
    await escrow.update({ squad_dynamic_nuban: process.env.PLATFORM_NUBAN || '0000000000' });
  }

  // Notify employer with payment details
  if (employerPhone) {
    const nuban = dynamicNuban || process.env.PLATFORM_NUBAN;
    sendText(employerPhone,
      `SquadBridge Escrow Created ✓\n\nJob: ${jobTitle}\nAmount to deposit: ₦${Number(agreedAmount).toLocaleString()}\n\nPay into this account:\nAccount: ${nuban}\nBank: GTBank\nRef: ESCROW-${escrow.id.slice(0, 8).toUpperCase()}\n\nFunds will be held safely until the job is confirmed complete.`
    ).catch(() => {});
  }

  // Notify worker
  if (workerPhone) {
    sendText(workerPhone,
      `SquadBridge: Your job has been confirmed!\n\nJob: ${jobTitle}\nPay: ₦${Number(agreedAmount).toLocaleString()}\n\nThe employer is funding escrow now. You'll receive your payment when the job is marked complete.\n\nEscrow ID: ${escrow.id.slice(0, 8).toUpperCase()}`
    ).catch(() => {});
  }

  return escrow;
}

/**
 * Mark escrow as funded (called from Squad webhook on payment received).
 */
async function markFunded(escrowId, squadTransactionId) {
  const escrow = await EscrowAccount.findByPk(escrowId);
  if (!escrow) throw new Error(`Escrow ${escrowId} not found`);
  await escrow.update({ status: 'funded', funded_at: new Date(), squad_transaction_id: squadTransactionId });
  return escrow;
}

/**
 * Release escrow funds to the worker after job completion.
 * Deducts platform fee (2.5%) before transfer.
 */
async function releaseEscrow(escrowId, workerBankCode, workerAccount, workerName, workerPhone) {
  const escrow = await EscrowAccount.findByPk(escrowId);
  if (!escrow) throw new Error(`Escrow ${escrowId} not found`);
  if (escrow.status !== 'funded' && escrow.status !== 'work_done') {
    throw new Error(`Cannot release escrow in status: ${escrow.status}`);
  }

  const gross = Number(escrow.agreed_amount);
  const fee = gross * (Number(escrow.platform_fee_pct) / 100);
  const net = gross - fee;

  // Transfer net amount to worker
  const txRef = `${process.env.SQUAD_MERCHANT_ID || 'SB'}_escrow_${escrowId.slice(0, 8)}_${Date.now()}`;
  await squadService.singleTransfer({
    transaction_reference: txRef,
    amount: Math.round(net * 100), // kobo
    bank_code: workerBankCode,
    account_number: workerAccount,
    account_name: workerName,
    currency_id: 'NGN',
    remark: `SquadBridge escrow release - ${escrow.job_title}`,
  });

  await escrow.update({ status: 'released', released_at: new Date() });

  if (workerPhone) {
    sendText(workerPhone,
      `SquadBridge: Payment released! ✓\n\n₦${net.toLocaleString()} sent for: ${escrow.job_title}\nPlatform fee: ₦${fee.toLocaleString()} (${escrow.platform_fee_pct}%)\n\nCheck your bank account shortly.`
    ).catch(() => {});
  }

  return { escrow, net_paid: net, fee };
}

/**
 * Raise a dispute on an escrow.
 */
async function raiseDispute(escrowId, reason, raisedByPhone) {
  const escrow = await EscrowAccount.findByPk(escrowId);
  if (!escrow) throw new Error(`Escrow ${escrowId} not found`);
  await escrow.update({ status: 'disputed', dispute_reason: reason });

  if (raisedByPhone) {
    sendText(raisedByPhone,
      `SquadBridge: Dispute raised for escrow ${escrowId.slice(0, 8).toUpperCase()}.\n\nReason: ${reason}\n\nOur team will review within 24 hours. Funds are safe.`
    ).catch(() => {});
  }

  return escrow;
}

module.exports = { createEscrow, markFunded, releaseEscrow, raiseDispute };
