const axios = require('axios');
const { BlobServiceClient } = require('@azure/storage-blob');
const logger = require('../config/logger');

const SPITCH_BASE = 'https://api.spitch.co/v1';

const client = axios.create({
  baseURL: SPITCH_BASE,
  headers: {
    Authorization: `Bearer ${process.env.SPITCH_API_KEY}`,
    'Content-Type': 'application/json',
  },
  timeout: 15000,
  responseType: 'arraybuffer',
});

async function generateTTS(text, language = 'en-NG', voice = 'female') {
  try {
    const res = await client.post('/tts', { text, language, voice, format: 'mp3' });
    const audioBuffer = Buffer.from(res.data);
    const url = await uploadToBlob(audioBuffer, language);
    return { audio_url: url };
  } catch (err) {
    logger.error({ service: 'spitch', error: err.message });
    return null;
  }
}

async function uploadToBlob(buffer, language) {
  const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING;
  const blobClient = BlobServiceClient.fromConnectionString(connectionString);
  const container = blobClient.getContainerClient('audio');
  const blobName = `tts-${Date.now()}-${language}.mp3`;
  const blockBlob = container.getBlockBlobClient(blobName);
  await blockBlob.upload(buffer, buffer.length, { blobHTTPHeaders: { blobContentType: 'audio/mpeg' } });
  return blockBlob.url;
}

function buildPayrollText(staffCount, total, balance) {
  return `Payroll complete. ${staffCount} staff paid ${formatAmount(total)}. Your balance is ${formatAmount(balance)}.`;
}

function buildBalanceText(balance) {
  return `Your Squad balance is ${formatAmount(balance)} as of today.`;
}

function buildForecastAlertText(projectedBalance, payroll) {
  return `Warning: Your projected balance in thirty days is ${formatAmount(projectedBalance)}, which is below your payroll of ${formatAmount(payroll)}.`;
}

function formatAmount(amount) {
  return new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN' }).format(amount).replace('NGN', 'naira');
}

// STT — transcribe audio buffer, returns { transcript, language }
// language is BCP-47: 'en-NG', 'yo-NG', 'ig-NG', 'ha-NG'
async function transcribeAudio(audioBuffer, mimeType = 'audio/ogg') {
  try {
    const formData = new FormData();
    const blob = new Blob([audioBuffer], { type: mimeType });
    formData.append('audio', blob, 'voice.ogg');
    formData.append('detect_language', 'true');

    const res = await fetch(`${SPITCH_BASE}/stt`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.SPITCH_API_KEY}` },
      body: formData,
      signal: AbortSignal.timeout(20000),
    });

    if (!res.ok) {
      const text = await res.text();
      logger.error({ service: 'spitch', fn: 'transcribeAudio', status: res.status, body: text });
      return null;
    }

    const data = await res.json();
    return {
      transcript: data.transcript || data.text || '',
      language: data.language || data.detected_language || 'en-NG',
    };
  } catch (err) {
    logger.error({ service: 'spitch', fn: 'transcribeAudio', error: err.message });
    return null;
  }
}

module.exports = { generateTTS, transcribeAudio, buildPayrollText, buildBalanceText, buildForecastAlertText };
