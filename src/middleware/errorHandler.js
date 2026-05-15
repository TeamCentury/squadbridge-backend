const logger = require('../config/logger');

const isProd = process.env.NODE_ENV === 'production';

module.exports = (err, req, res, next) => {
  logger.error({ message: err.message, stack: err.stack, path: req.path, method: req.method });

  if (err.name === 'SequelizeValidationError') {
    return res.status(400).json({
      error: 'Validation error',
      details: err.errors.map((e) => ({ field: e.path, message: e.message })),
    });
  }

  if (err.name === 'SequelizeUniqueConstraintError') {
    return res.status(409).json({ error: 'Record already exists' });
  }

  const status = err.status || err.statusCode || 500;
  res.status(status).json({
    // Never leak internal error details to clients in production
    error: isProd && status === 500 ? 'Internal server error' : (err.message || 'Internal server error'),
  });
};
