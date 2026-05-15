const twilio = require('twilio');

module.exports = (req, res, next) => {
  // Skip signature check if AUTH_TOKEN not configured (dev/test)
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  if (!authToken) return next();

  const twilioSignature = req.headers['x-twilio-signature'];
  if (!twilioSignature) {
    return res.status(401).json({ error: 'Missing X-Twilio-Signature' });
  }

  // Build the full URL Twilio signed
  const url = `${req.protocol}://${req.get('host')}${req.originalUrl}`;
  const params = req.body || {};

  const valid = twilio.validateRequest(authToken, twilioSignature, url, params);
  if (!valid) {
    return res.status(401).json({ error: 'Invalid Twilio signature' });
  }

  next();
};
