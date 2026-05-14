const request = require('supertest');

// Mock sequelize before loading app
jest.mock('../models', () => ({
  sequelize: { authenticate: jest.fn(), sync: jest.fn(), close: jest.fn() },
  School: {}, Student: {}, Transaction: {}, PayrollConfig: {},
  PayrollStaff: {}, PayrollLog: {}, Forecast: {}, AuditLog: {},
}));

jest.mock('../config/redis', () => ({
  get: jest.fn(), set: jest.fn(), on: jest.fn(),
}));

const app = require('../app');

describe('GET /health', () => {
  it('returns 200 with status ok', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });
});

describe('Unknown route', () => {
  it('returns 404', async () => {
    const res = await request(app).get('/api/v1/nonexistent');
    expect(res.status).toBe(404);
  });
});
