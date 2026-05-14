const swaggerJsdoc = require('swagger-jsdoc');

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'SquadBridge API',
      version: '1.0.0',
      description: `
## Nigeria's Conversational Economic Operating System

SquadBridge formalizes Nigeria's informal economy through financial inclusion.
Every Squad transaction becomes a creditworthiness data point.

### Authentication
All \`/api/v1/*\` routes (except \`/api/v1/auth/login\`) require a **Bearer JWT** token.

Obtain a token via **POST /api/v1/auth/login**, then include it in every request:
\`\`\`
Authorization: Bearer <token>
\`\`\`

### Webhooks
Squad payment webhooks are posted to **POST /webhooks/squad/payment**.
They are verified via HMAC-SHA256 signature in the \`x-squad-signature\` header.

### Real-time
Connect to the Socket.io server with \`?school_id=<id>\` to receive live dashboard events.
      `,
      contact: {
        name: 'SquadBridge Support',
        email: 'support@squadbridge.com',
        url: 'https://squadbridge.com',
      },
      license: { name: 'MIT' },
    },
    servers: [
      { url: 'http://localhost:3001', description: 'Local development' },
      { url: 'https://api.squadbridge.com', description: 'Production' },
    ],
    components: {
      securitySchemes: {
        BearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: 'JWT token obtained from POST /api/v1/auth/login',
        },
      },
      schemas: {
        Error: {
          type: 'object',
          properties: {
            error: { type: 'string', example: 'Something went wrong' },
          },
        },
        ValidationError: {
          type: 'object',
          properties: {
            errors: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  field: { type: 'string' },
                  message: { type: 'string' },
                },
              },
            },
          },
        },
        School: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            name: { type: 'string', example: 'Sunrise Academy' },
            phone: { type: 'string', example: '+2348012345678' },
            state: { type: 'string', example: 'Lagos' },
            lga: { type: 'string', example: 'Ikeja' },
            nuban: { type: 'string', example: '0123456789' },
            student_count: { type: 'integer', example: 150 },
            fee_per_term: { type: 'number', example: 65000 },
            staff_count: { type: 'integer', example: 20 },
            avg_salary: { type: 'number', example: 85000 },
            bvn_verified: { type: 'boolean', example: true },
            onboarding_status: { type: 'string', enum: ['pending', 'verified', 'onboarded'] },
            createdAt: { type: 'string', format: 'date-time' },
          },
        },
        Student: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            school_id: { type: 'string', format: 'uuid' },
            name: { type: 'string', example: 'Adaeze Obi' },
            class: { type: 'string', example: 'JSS 3' },
            parent_phone: { type: 'string', example: '+2348098765432' },
            fee_amount: { type: 'number', example: 65000 },
            amount_paid: { type: 'number', example: 65000 },
            fee_status: { type: 'string', enum: ['unpaid', 'partial', 'paid'] },
            payment_link_id: { type: 'string' },
            squad_link_url: { type: 'string', format: 'uri' },
            term: { type: 'string', example: 'Term 1' },
          },
        },
        Transaction: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            school_id: { type: 'string', format: 'uuid' },
            student_id: { type: 'string', format: 'uuid' },
            squad_transaction_id: { type: 'string' },
            amount: { type: 'number', example: 65000 },
            status: { type: 'string', enum: ['pending', 'successful', 'failed', 'reversed'] },
            payment_method: { type: 'string', example: 'card' },
            createdAt: { type: 'string', format: 'date-time' },
          },
        },
        PL: {
          type: 'object',
          properties: {
            annual_income: { type: 'number', example: 29250000 },
            salary_expense: { type: 'number', example: 20400000 },
            transport_estimate: { type: 'number', example: 4320000 },
            feeding_estimate: { type: 'number', example: 3150000 },
            utilities_estimate: { type: 'number', example: 1800000 },
            maintenance_estimate: { type: 'number', example: 1200000 },
            total_expenses: { type: 'number', example: 30870000 },
            net_position: { type: 'number', example: -1620000 },
            recommendation: { type: 'string', nullable: true, example: 'Consider increasing fees to ₦70,000' },
          },
        },
        Forecast: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            school_id: { type: 'string', format: 'uuid' },
            generated_at: { type: 'string', format: 'date-time' },
            day30: { type: 'number', example: 4700000 },
            day60: { type: 'number', example: 8200000 },
            day90: { type: 'number', example: 5400000 },
            upper30: { type: 'number', example: 5405000 },
            lower30: { type: 'number', example: 3995000 },
            daily_rate: { type: 'number', example: 157000 },
          },
        },
        PayrollConfig: {
          type: 'object',
          properties: {
            config_id: { type: 'string', format: 'uuid' },
            payroll_day: { type: 'integer', example: 20 },
            total_amount: { type: 'number', example: 1700000 },
            staff_count: { type: 'integer', example: 20 },
          },
        },
        PayrollLog: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            executed_at: { type: 'string', format: 'date-time' },
            total_amount: { type: 'number', example: 1700000 },
            staff_count: { type: 'integer', example: 20 },
            squad_batch_id: { type: 'string' },
            status: { type: 'string', enum: ['completed', 'failed', 'partial'] },
            audio_url: { type: 'string', format: 'uri', nullable: true },
          },
        },
        AuditLog: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            event_type: {
              type: 'string',
              enum: ['PAYMENT_RECEIVED', 'PAYROLL_EXECUTED', 'LINK_GENERATED', 'ONBOARDED', 'WEBHOOK_RECEIVED', 'FORECAST_UPDATED', 'PAYOUT_REQUESTED'],
            },
            description: { type: 'string' },
            amount: { type: 'number', nullable: true },
            squad_transaction_id: { type: 'string', nullable: true },
            status: { type: 'string', enum: ['success', 'failed', 'pending'] },
            createdAt: { type: 'string', format: 'date-time' },
          },
        },
      },
    },
    security: [{ BearerAuth: [] }],
    tags: [
      { name: 'Auth', description: 'Authentication — obtain JWT tokens' },
      { name: 'Schools', description: 'School onboarding, profile, P&L, and dashboard' },
      { name: 'Collections', description: 'Student fee payment links and status' },
      { name: 'Payroll', description: 'Configure and execute staff salary disbursements' },
      { name: 'Forecast', description: '30/60/90-day cash flow projections' },
      { name: 'Webhooks', description: 'Squad payment event handlers (called by Squad, not client)' },
      { name: 'USSD', description: 'Africa\'s Talking *556# callback (called by AT, not client)' },
      { name: 'Voice', description: 'Spitch TTS audio generation' },
      { name: 'Audit', description: 'Filterable audit trail of all financial events' },
      { name: 'Health', description: 'Server health check' },
    ],
  },
  apis: ['./src/routes/*.js'],
};

module.exports = swaggerJsdoc(options);
