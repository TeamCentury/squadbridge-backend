const rateLimit = require('express-rate-limit');

// Azure's load balancer includes port in the IP (e.g. "1.2.3.4:56789") — strip it for rate-limit keying
const keyGenerator = (req) => (req.ip || '').replace(/:\d+$/, '');

const rateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator,
  message: { error: 'Too many requests, please try again later.' },
});

const webhookLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 300,
  keyGenerator,
  message: { error: 'Webhook rate limit exceeded.' },
});

module.exports = { rateLimiter, webhookLimiter };
