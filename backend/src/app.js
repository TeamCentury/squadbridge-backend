require('dotenv').config();
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const morgan = require('morgan');
const compression = require('compression');

const { rateLimiter, webhookLimiter } = require('./middleware/rateLimiter');
const authMiddleware = require('./middleware/auth');
const errorHandler = require('./middleware/errorHandler');

const authRoutes = require('./routes/auth');
const schoolRoutes = require('./routes/schools');
const paymentLinkRoutes = require('./routes/paymentLinks');
const payrollRoutes = require('./routes/payroll');
const forecastRoutes = require('./routes/forecast');
const webhookRoutes = require('./routes/webhooks');
const ussdRoutes = require('./routes/ussd');
const voiceRoutes = require('./routes/voice');
const auditRoutes = require('./routes/auditLog');

const app = express();

// Security & parsing
app.use(helmet());
app.use(cors({ origin: process.env.FRONTEND_URL || '*', credentials: true }));
app.use(compression());
app.use(morgan('combined'));

// Raw body for webhook signature verification (before json parser)
app.use('/webhooks', express.raw({ type: 'application/json' }), (req, res, next) => {
  if (Buffer.isBuffer(req.body)) req.body = JSON.parse(req.body.toString());
  next();
});

app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));

// Rate limiting
app.use('/api', rateLimiter);
app.use('/webhooks', webhookLimiter);

// Health check (no auth)
app.get('/health', (req, res) => res.json({ status: 'ok', timestamp: new Date().toISOString() }));

// Public routes
app.use('/api/v1/auth', authRoutes);
app.use('/ussd', ussdRoutes);
app.use('/webhooks', webhookRoutes);

// Protected routes
app.use('/api/v1/schools', authMiddleware, schoolRoutes);
app.use('/api/v1/schools/:id/payment-links', authMiddleware, paymentLinkRoutes);
app.use('/api/v1/schools/:id/payroll', authMiddleware, payrollRoutes);
app.use('/api/v1/schools/:id/forecast', authMiddleware, forecastRoutes);
app.use('/api/v1/schools/:id/audit', authMiddleware, auditRoutes);
app.use('/api/v1/voice', authMiddleware, voiceRoutes);

// 404 handler
app.use((req, res) => res.status(404).json({ error: 'Route not found' }));

// Global error handler
app.use(errorHandler);

module.exports = app;
