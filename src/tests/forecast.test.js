const { computeForecast } = require('../services/forecastService');
const { Transaction, Forecast, PayrollConfig } = require('../models');

jest.mock('../models', () => ({
  Transaction: { findAll: jest.fn() },
  Forecast: { create: jest.fn() },
  PayrollConfig: { findOne: jest.fn() },
}));

describe('forecastService.computeForecast', () => {
  beforeEach(() => jest.clearAllMocks());

  it('creates a forecast with zero daily rate when no transactions', async () => {
    Transaction.findAll.mockResolvedValue([]);
    PayrollConfig.findOne.mockResolvedValue(null);
    Forecast.create.mockResolvedValue({ day30: 5000, day60: 5000, day90: 5000 });

    const result = await computeForecast('school-uuid-123', 5000);
    expect(Forecast.create).toHaveBeenCalledWith(
      expect.objectContaining({ school_id: 'school-uuid-123', daily_rate: 0 })
    );
    expect(result).toBeDefined();
  });

  it('deducts payroll from projections', async () => {
    Transaction.findAll.mockResolvedValue([]);
    PayrollConfig.findOne.mockResolvedValue({ total_amount: '1000' });
    Forecast.create.mockImplementation((data) => Promise.resolve(data));

    const result = await computeForecast('school-uuid-123', 5000);
    // 5000 - (1000 * 1 month in 30 days) = 4000
    expect(result.day30).toBe(4000);
  });
});
