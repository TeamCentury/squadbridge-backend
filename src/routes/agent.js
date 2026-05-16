const router = require('express').Router();
const { body, validationResult } = require('express-validator');
const { Trader, Graduate, School } = require('../models');
const { handleWorkerChat, handleWhatsAppChat } = require('../services/claudeService');
const authMiddleware = require('../middleware/auth');
const logger = require('../config/logger');

router.use(authMiddleware);

/**
 * POST /api/v1/agent/chat
 * Web-widget chat. Authenticated users get a persona-aware Claude reply.
 * Body: { message: string }
 * Response: { reply: string }
 */
router.post(
  '/chat',
  [body('message').trim().notEmpty().withMessage('message is required').isLength({ max: 1000 })],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ error: errors.array()[0].msg });

    const { message } = req.body;
    // Normalize across JWT shapes: traders/graduates use user_id/user_type,
    // employers have id/type, schools have school_id.
    const user_id   = req.user.user_id || req.user.id || req.user.school_id;
    const user_type = req.user.user_type || req.user.type || (req.user.school_id ? 'school' : 'unknown');

    logger.info({ fn: 'agent.chat', user_id, user_type, msgLen: message.length });

    try {
      let reply;

      if (user_type === 'school') {
        const school = await School.findByPk(user_id);
        const ctx = school
          ? { name: school.name, balance: 0, student_count: school.student_count, fee_per_term: school.fee_per_term }
          : null;
        reply = await handleWhatsAppChat(message, ctx);
      } else {
        let user = null;
        if (user_type === 'trader') user = await Trader.findByPk(user_id);
        else if (user_type === 'graduate') user = await Graduate.findByPk(user_id);

        const ctx = user
          ? { name: user.name, type: user_type, skills: Array.isArray(user.skills) ? user.skills.join(', ') : user.skills, state: user.state }
          : null;
        reply = await handleWorkerChat(message, ctx);
      }

      res.json({ reply });
    } catch (err) {
      logger.error({ fn: 'agent.chat', error: err.message });
      res.status(500).json({ error: 'Agent unavailable. Please try again.' });
    }
  }
);

module.exports = router;
