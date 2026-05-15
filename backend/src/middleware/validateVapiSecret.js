module.exports = (req, res, next) => {
  const secret = process.env.VAPI_WEBHOOK_SECRET;
  if (!secret) return next(); // not configured in dev

  const provided = req.headers['x-vapi-secret'] || req.headers['authorization']?.replace('Bearer ', '');
  if (!provided || provided !== secret) {
    return res.status(401).json({ error: 'Invalid Vapi webhook secret' });
  }

  next();
};
