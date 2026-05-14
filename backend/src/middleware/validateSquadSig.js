const crypto = require('crypto');

module.exports = (req, res, next) => {
  const signature = req.headers['x-squad-signature'] || req.headers['x-squad-encrypted-body'];
  if (!signature) {
    return res.status(401).json({ error: 'Missing Squad webhook signature' });
  }

  const secret = process.env.SQUAD_WEBHOOK_SECRET;
  const body = JSON.stringify(req.body);
  const expected = crypto.createHmac('sha256', secret).update(body).digest('hex');

  if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) {
    return res.status(401).json({ error: 'Invalid webhook signature' });
  }

  next();
};
