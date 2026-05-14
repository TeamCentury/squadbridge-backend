const axios = require('axios');
const { BlobServiceClient } = require('@azure/storage-blob');
const logger = require('../config/logger');

const client = axios.create({
  baseURL: 'https://api.spitch.co/v1',
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

module.exports = { generateTTS, buildPayrollText, buildBalanceText, buildForecastAlertText };
