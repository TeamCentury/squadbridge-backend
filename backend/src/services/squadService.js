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
    logger.error({ service: 'squad', error: err.response?.data || err.message });
    throw err;
  }
);

async function createVirtualAccount(payload) {
  const res = await client.post('/virtual-account', payload);
  return res.data;
}

async function createSubMerchant(payload) {
  const res = await client.post('/merchant/create-sub-merchant', payload);
  return res.data;
}

async function verifyBVN(bvn, payload) {
  const res = await client.post('/api/v1/merchant/verify-account-number', { bvn, ...payload });
  return res.data;
}

async function createPaymentLink(payload) {
  const res = await client.post('/payment-link/otp', payload);
  return res.data;
}

async function getBalance(merchantId) {
  const res = await client.get(`/merchant/balance?merchant_id=${merchantId}`);
  return res.data;
}

async function bulkTransfer(payload) {
  const res = await client.post('/payout/bulk', payload);
  return res.data;
}

async function singleTransfer(payload) {
  const res = await client.post('/payout/transfer', payload);
  return res.data;
}

async function getPayoutHistory(merchantId) {
  const res = await client.get(`/payout/list?merchant_id=${merchantId}`);
  return res.data;
}

module.exports = {
  createVirtualAccount,
  createSubMerchant,
  verifyBVN,
  createPaymentLink,
  getBalance,
  bulkTransfer,
  singleTransfer,
  getPayoutHistory,
};
