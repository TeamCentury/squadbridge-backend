const axios = require('axios');
const crypto = require('crypto');
const logger = require('../config/logger');

const BASE_URL = 'https://graph.facebook.com/v19.0';

function getAppSecretProof() {
  const token = process.env.META_WHATSAPP_TOKEN;
  const secret = process.env.META_APP_SECRET;
  if (!token || !secret) return null;
  return crypto.createHmac('sha256', secret).update(token).digest('hex');
}

function makeClient() {
  const proof = getAppSecretProof();
  return axios.create({
    baseURL: `${BASE_URL}/${process.env.WHATSAPP_PHONE_NUMBER_ID}`,
    headers: {
      Authorization: `Bearer ${process.env.META_WHATSAPP_TOKEN}`,
      'Content-Type': 'application/json',
    },
    params: proof ? { appsecret_proof: proof } : {},
  });
}

async function sendMessage(to, templateName, components = []) {
  try {
    const res = await makeClient().post('/messages', {
      messaging_product: 'whatsapp',
      to: to.replace('+', ''),
      type: 'template',
      template: {
        name: templateName,
        language: { code: 'en_NG' },
        components,
      },
    });
    return res.data;
  } catch (err) {
    logger.error({ service: 'whatsapp', error: err.response?.data || err.message });
  }
}

async function sendText(to, text) {
  try {
    const res = await makeClient().post('/messages', {
      messaging_product: 'whatsapp',
      to: to.replace('+', ''),
      type: 'text',
      text: { body: text },
    });
    return res.data;
  } catch (err) {
    logger.error({ service: 'whatsapp', error: err.response?.data || err.message });
  }
}

function notifyPaymentReceived(phone, amount, studentName, total) {
  return sendText(phone, `SquadBridge: ₦${amount.toLocaleString()} received from ${studentName}. Total collected: ₦${total.toLocaleString()}. View: ${process.env.FRONTEND_URL}`);
}

function notifyPayrollComplete(phone, staffCount, total, balance, batchId) {
  return sendText(phone, `SquadBridge: Payroll executed. ${staffCount} staff paid ₦${total.toLocaleString()}. Balance: ₦${balance.toLocaleString()}. Ref: ${batchId}`);
}

function notifyForecastAlert(phone, projectedBalance, payroll, date) {
  return sendText(phone, `SquadBridge Alert: At current pace, balance on ${date} will be ₦${projectedBalance.toLocaleString()} — below payroll of ₦${payroll.toLocaleString()}. Review: ${process.env.FRONTEND_URL}/forecast`);
}

function notifyOnboarding(phone, nuban) {
  return sendText(phone, `Welcome to SquadBridge! Your account number: ${nuban}. Log in: ${process.env.FRONTEND_URL}`);
}

module.exports = {
  sendMessage,
  sendText,
  notifyPaymentReceived,
  notifyPayrollComplete,
  notifyForecastAlert,
  notifyOnboarding,
};
