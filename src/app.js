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
const requireSchoolOwnership = require('./middleware/requireSchoolOwnership');
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
const adminRoutes = require('./routes/admin');
const traderRoutes = require('./routes/traders');
const graduateRoutes = require('./routes/graduates');
const employerRoutes = require('./routes/employers');
const gigRoutes = require('./routes/gigs');
const badgeRoutes = require('./routes/badges');
const vapiRoutes = require('./routes/vapi');
const twilioRoutes = require('./routes/twilio');
const opportunityRoutes = require('./routes/opportunities');

const path = require('path');

const app = express();

// Trust Azure App Service / load balancer headers (fixes express-rate-limit X-Forwarded-For error)
app.set('trust proxy', 1);

// Security & parsing
app.use(helmet());
const corsOrigin = process.env.FRONTEND_URL
  ? process.env.FRONTEND_URL.split(',').map((o) => o.trim())
  : (process.env.NODE_ENV === 'production' ? false : 'http://localhost:3000');
app.use(cors({ origin: corsOrigin, credentials: true }));
app.use(compression());
app.use(morgan('combined'));

// Raw body for webhook signature verification (before json parser)
// Stash the exact bytes on req.rawBody so validateSquadSig can HMAC them without re-serialization
app.use('/webhooks', express.raw({ type: 'application/json' }), (req, res, next) => {
  if (Buffer.isBuffer(req.body)) {
    req.rawBody = req.body;
    req.body = JSON.parse(req.body.toString());
  }
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
      tryItOutEnabled: process.env.NODE_ENV !== 'production',
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
app.use('/api/v1/admin', adminRoutes);

// Phase 2 — Trader/Artisan
app.use('/api/v1/traders', traderRoutes);

// Phase 3 — Graduate
app.use('/api/v1/graduates', graduateRoutes);

// Phase 4 — Employers, Gig Marketplace, Badges, Opportunities
app.use('/api/v1/employers', employerRoutes);
app.use('/api/v1/gigs', gigRoutes);
app.use('/api/v1/badges', badgeRoutes);
app.use('/api/v1/opportunities', opportunityRoutes);

// Voice channels
app.use('/api/v1/vapi', vapiRoutes);
app.use('/api/v1/twilio', twilioRoutes);

app.use('/ussd', ussdRoutes);
app.use('/webhooks', webhookRoutes);

// Schools — /onboard is public; auth is enforced inside the router after that route
app.use('/api/v1/schools', schoolRoutes);
app.use('/api/v1/schools/:id/payment-links', authMiddleware, requireSchoolOwnership, paymentLinkRoutes);
app.use('/api/v1/schools/:id/payroll', authMiddleware, requireSchoolOwnership, payrollRoutes);
app.use('/api/v1/schools/:id/forecast', authMiddleware, requireSchoolOwnership, forecastRoutes);
app.use('/api/v1/schools/:id/audit', authMiddleware, requireSchoolOwnership, auditRoutes);
app.use('/api/v1/voice', authMiddleware, voiceRoutes);

// 404 handler
app.use((req, res) => res.status(404).json({ error: 'Route not found' }));

// Global error handler
app.use(errorHandler);

module.exports = app;
