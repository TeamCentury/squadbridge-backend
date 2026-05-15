const axios = require('axios');
const logger = require('../config/logger');

const BASE_URL = process.env.SQUAD_BASE_URL || 'https://sandbox-api-d.squadco.com';

const client = axios.create({
  baseURL: BASE_URL,
  headers: {
    Authorization: `Bearer ${process.env.SQUAD_SECRET_KEY}`,
    'Content-Type': 'application/json',
  },
  timeout: 30000,
});

client.interceptors.response.use(
  (res) => res,
  (err) => {
    logger.error({ service: 'squad', status: err.response?.status, error: err.response?.data || err.message });
    throw err;
  }
);

// ─────────────────────────────────────────────
// Virtual Accounts
// Required: customer_identifier, first_name, last_name, mobile_num, bvn,
//           dob (MM/DD/YYYY), address, gender ('1'=male/'2'=female), beneficiary_account
// DO NOT send bank_code — Squad assigns it automatically.
// ─────────────────────────────────────────────
async function createVirtualAccount(payload) {
  const { bank_code, ...clean } = payload;
  if (!clean.beneficiary_account) clean.beneficiary_account = '0000000000';
  const res = await client.post('/virtual-account', clean);
  return res.data;
}

// ─────────────────────────────────────────────
// Sub-Merchants
// Required: display_name, account_name, account_number,
//           bank (6-digit NIP code e.g. '000013' for GTBank),
//           bank_code (3-digit CBN code e.g. '058' for GTBank)
// Common NIP/bank_code pairs:
//   GTBank:  bank='000013' bank_code='058'
//   Access:  bank='000014' bank_code='044'
//   UBA:     bank='000004' bank_code='033'
//   Zenith:  bank='000015' bank_code='057'
//   First:   bank='000016' bank_code='011'
// ─────────────────────────────────────────────
async function createSubMerchant(payload) {
  const res = await client.post('/merchant/create-sub-users', payload);
  return res.data;
}

// ─────────────────────────────────────────────
// Account Lookup / Verification
// Required: bank_code (6-digit NIP code), account_number
// Returns account_name or 424 if account not found.
// ─────────────────────────────────────────────
async function lookupAccount(nipCode, accountNumber) {
  const res = await client.post('/payout/account/lookup', {
    bank_code: nipCode,
    account_number: accountNumber,
  });
  return res.data;
}

// ─────────────────────────────────────────────
// Payment Links
// Creates an open payment link (payer enters/confirms amount at checkout).
// Amount is NOT set at link creation — store fee amounts in your DB per student.
// Required: name, hash (unique), link_status (1=active), expire_by, description
// ─────────────────────────────────────────────
async function createPaymentLink(payload) {
  // Strip amount/currency_id — not accepted by this endpoint
  const { amount, currency_id, ...clean } = payload;
  const res = await client.post('/payment_link/otp', clean);
  return res.data;
}

// ─────────────────────────────────────────────
// Balance
// ─────────────────────────────────────────────
async function getBalance(currencyId = 'NGN') {
  const res = await client.get(`/merchant/balance?currency_id=${currencyId}`);
  return res.data;
}

// ─────────────────────────────────────────────
// Transaction Verification
// ─────────────────────────────────────────────
async function verifyTransaction(transactionRef) {
  const res = await client.get(`/transaction/verify/${transactionRef}`);
  return res.data;
}

// ─────────────────────────────────────────────
// Transfers / Payroll
// PREREQUISITE: Disable "Auto-Payout" in Squad dashboard → Settings → Payout
//   before making transfer calls, or you'll get:
//   "Please turn off auto-payout to proceed"
//
// Required: transaction_reference (must include merchant ID prefix),
//           amount (in kobo), bank_code (6-digit NIP), account_number,
//           account_name, currency_id ('NGN'), remark
// ─────────────────────────────────────────────
async function singleTransfer(payload) {
  const res = await client.post('/payout/transfer', payload);
  return res.data;
}

// Squad has no native bulk endpoint — fan out to singleTransfer in parallel
async function bulkTransfer({ batch_ref, transaction_details }) {
  const results = await Promise.allSettled(
    transaction_details.map((t) =>
      singleTransfer({
        transaction_reference: t.transaction_reference,
        amount: t.amount,
        bank_code: t.bank_code,        // 6-digit NIP code
        account_number: t.account_number,
        account_name: t.account_name,
        currency_id: t.currency_id || 'NGN',
        remark: t.remark || batch_ref,
      })
    )
  );

  const succeeded = results.filter((r) => r.status === 'fulfilled').map((r) => r.value);
  const failed    = results.filter((r) => r.status === 'rejected').map((r) => r.reason?.response?.data || r.reason?.message);

  return {
    batch_ref,
    total: results.length,
    succeeded: succeeded.length,
    failed: failed.length,
    failed_details: failed,
  };
}

async function getPayoutHistory() {
  const res = await client.get('/payout/list');
  return res.data;
}

module.exports = {
  createVirtualAccount,
  createSubMerchant,
  lookupAccount,
  createPaymentLink,
  getBalance,
  verifyTransaction,
  singleTransfer,
  bulkTransfer,
  getPayoutHistory,
};
