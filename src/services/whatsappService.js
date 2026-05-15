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

async function downloadMedia(mediaId) {
  const proof = getAppSecretProof();
  const params = proof ? `?appsecret_proof=${proof}` : '';

  // Step 1: resolve media URL
  const metaRes = await fetch(`https://graph.facebook.com/v19.0/${mediaId}${params}`, {
    headers: { Authorization: `Bearer ${process.env.META_WHATSAPP_TOKEN}` },
  });
  if (!metaRes.ok) throw new Error(`Media lookup failed: ${metaRes.status}`);
  const { url, mime_type } = await metaRes.json();

  // Step 2: download the file
  const audioRes = await fetch(url, {
    headers: { Authorization: `Bearer ${process.env.META_WHATSAPP_TOKEN}` },
  });
  if (!audioRes.ok) throw new Error(`Media download failed: ${audioRes.status}`);
  const arrayBuf = await audioRes.arrayBuffer();
  return { buffer: Buffer.from(arrayBuf), mimeType: mime_type || 'audio/ogg' };
}

async function sendAudio(to, audioUrl) {
  try {
    const res = await makeClient().post('/messages', {
      messaging_product: 'whatsapp',
      to: to.replace('+', ''),
      type: 'audio',
      audio: { link: audioUrl },
    });
    return res.data;
  } catch (err) {
    logger.error({ service: 'whatsapp', fn: 'sendAudio', error: err.response?.data || err.message });
  }
}

async function sendButtons(to, bodyText, buttons) {
  // buttons: array of { id, title } — max 3, title max 20 chars
  try {
    const res = await makeClient().post('/messages', {
      messaging_product: 'whatsapp',
      to: to.replace('+', ''),
      type: 'interactive',
      interactive: {
        type: 'button',
        body: { text: bodyText },
        action: {
          buttons: buttons.slice(0, 3).map((b) => ({
            type: 'reply',
            reply: { id: b.id, title: b.title.slice(0, 20) },
          })),
        },
      },
    });
    return res.data;
  } catch (err) {
    logger.error({ service: 'whatsapp', fn: 'sendButtons', error: err.response?.data || err.message });
    // Fallback: plain text with options listed
    const options = buttons.map((b, i) => `${i + 1}. ${b.title}`).join('\n');
    await sendText(to, `${bodyText}\n\n${options}`);
  }
}

async function markAsRead(messageId) {
  try {
    await makeClient().post('/messages', {
      messaging_product: 'whatsapp',
      status: 'read',
      message_id: messageId,
    });
  } catch (err) {
    logger.warn({ service: 'whatsapp', fn: 'markAsRead', error: err.response?.data || err.message });
  }
}

async function showTyping(incomingMessageId) {
  try {
    await makeClient().post('/messages', {
      messaging_product: 'whatsapp',
      status: 'typing',
      message_id: incomingMessageId,
    });
  } catch {
    // Typing indicator is best-effort — never block message delivery
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
  sendButtons,
  sendAudio,
  downloadMedia,
  markAsRead,
  showTyping,
  notifyPaymentReceived,
  notifyPayrollComplete,
  notifyForecastAlert,
  notifyOnboarding,
};
