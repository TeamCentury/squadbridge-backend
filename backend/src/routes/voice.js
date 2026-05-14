const router = require('express').Router();
const { body, validationResult } = require('express-validator');
const { generateTTS } = require('../services/spitchService');

// POST /api/v1/voice/tts
router.post('/tts', [
  body('text').notEmpty().withMessage('Text is required'),
  body('language').optional().isIn(['en-NG', 'yo-NG', 'ha-NG', 'pcm-NG']),
  body('voice').optional().isIn(['male', 'female']),
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { text, language = 'en-NG', voice = 'female' } = req.body;
    const result = await generateTTS(text, language, voice);

    if (!result) return res.status(502).json({ error: 'TTS generation failed' });
    res.json(result);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
