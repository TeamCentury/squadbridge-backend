require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const { sequelize } = require('../models');
const { runScrape, sendAllDigests } = require('../services/opportunityService');
const logger = require('../config/logger');

const { app } = require('@azure/functions');

// Scrape at 6AM WAT (5AM UTC) daily
app.timer('opportunityScrape', {
  schedule: '0 0 5 * * *',
  handler: async (myTimer, context) => {
    try {
      await sequelize.authenticate();
      logger.info({ fn: 'opportunityScrape', msg: 'Starting daily opportunity scrape' });
      const result = await runScrape();
      logger.info({ fn: 'opportunityScrape', result });
      context.log(`Scrape complete: ${result.saved} saved, ${result.skipped} skipped`);
    } catch (err) {
      logger.error({ fn: 'opportunityScrape', error: err.message });
      context.log.error('Scrape failed:', err.message);
    }
  },
});

// Send digests at 8AM WAT (7AM UTC) daily
app.timer('opportunityDigest', {
  schedule: '0 0 7 * * *',
  handler: async (myTimer, context) => {
    try {
      await sequelize.authenticate();
      logger.info({ fn: 'opportunityDigest', msg: 'Starting daily opportunity digest' });
      const totalSent = await sendAllDigests();
      logger.info({ fn: 'opportunityDigest', totalSent });
      context.log(`Digest sent to ${totalSent} users`);
    } catch (err) {
      logger.error({ fn: 'opportunityDigest', error: err.message });
      context.log.error('Digest failed:', err.message);
    }
  },
});
