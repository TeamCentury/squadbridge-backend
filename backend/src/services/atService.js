const axios = require('axios');
const logger = require('../config/logger');

const client = axios.create({
  baseURL: 'https://api.africastalking.com/version1',
  headers: {
    apiKey: process.env.AT_API_KEY,
    Accept: 'application/json',
    'Content-Type': 'application/x-www-form-urlencoded',
  },
});

async function sendSMS(to, message) {
  try {
    const params = new URLSearchParams({
      username: process.env.AT_USERNAME || 'sandbox',
      to,
      message,
    });
    const res = await client.post('/messaging', params.toString());
    return res.data;
  } catch (err) {
    logger.error({ service: 'africa_talking', error: err.message });
  }
}

// USSD response helpers
function continueSession(message) {
  return `CON ${message}`;
}

function endSession(message) {
  return `END ${message}`;
}

const MAIN_MENU = continueSession(
  'Welcome to SquadBridge\n1. Check Balance\n2. Collections Summary\n3. Request Payout\n4. Help\n0. Exit'
);

module.exports = { sendSMS, continueSession, endSession, MAIN_MENU };
