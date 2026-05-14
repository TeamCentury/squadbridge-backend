require('dotenv').config();
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const morgan = require('morgan');
const compression = require('compression');
const swaggerUi = require('swagger-ui-express');
const swaggerSpec = require('./config/swagger');

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

const path = require('path');

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

/**
 * @swagger
 * /health:
 *   get:
 *     summary: Health check
 *     tags: [Health]
 *     security: []
 *     responses:
 *       200:
 *         description: Server is healthy
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: ok
 *                 timestamp:
 *                   type: string
 *                   format: date-time
 */
app.get('/health', (req, res) => res.json({ status: 'ok', timestamp: new Date().toISOString() }));

// Swagger UI — disable helmet's CSP for this route only
app.use('/api/docs',
  (req, res, next) => {
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:;");
    next();
  },
  swaggerUi.serve,
  swaggerUi.setup(swaggerSpec, {
    customSiteTitle: 'SquadBridge API Docs',
    customCss: '.swagger-ui .topbar { background-color: #1F4E79; } .swagger-ui .topbar-wrapper img { content: url("data:image/svg+xml,<svg xmlns=\'http://www.w3.org/2000/svg\' viewBox=\'0 0 100 30\'><text y=\'22\' font-size=\'18\' fill=\'white\' font-family=\'Inter,sans-serif\' font-weight=\'700\'>SquadBridge</text></svg>"); }',
    swaggerOptions: {
      persistAuthorization: true,
      displayRequestDuration: true,
      docExpansion: 'list',
      filter: true,
      tryItOutEnabled: true,
    },
  })
);

// Serve raw OpenAPI JSON spec
app.get('/api/docs.json', (req, res) => res.json(swaggerSpec));

// Privacy policy (required by Meta WhatsApp Business API)
app.get('/privacy', (req, res) => {
  res.setHeader('Content-Security-Policy', "default-src 'self'; style-src 'unsafe-inline';");
  res.sendFile(path.join(__dirname, 'public', 'privacy.html'));
});

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
