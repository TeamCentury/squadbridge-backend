const crypto = require('crypto');

module.exports = (req, res, next) => {
  const signature = req.headers['x-squad-signature'] || req.headers['x-squad-encrypted-body'];
  if (!signature) {
    return res.status(401).json({ error: 'Missing Squad webhook signature' });
  }

  const secret = process.env.SQUAD_WEBHOOK_SECRET;
  if (!secret) {
    return res.status(500).json({ error: 'Webhook secret not configured' });
  }

  // Sign the raw body bytes — not re-serialized JSON — to avoid normalization drift
  const rawBody = req.rawBody || Buffer.from(JSON.stringify(req.body));
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');

  const sigBuf = Buffer.from(signature);
  const expBuf = Buffer.from(expected);

  // timingSafeEqual requires equal-length buffers; mismatched lengths means invalid
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
    return res.status(401).json({ error: 'Invalid webhook signature' });
  }

  next();
};
