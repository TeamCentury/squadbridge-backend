const router = require('express').Router();
const { body, validationResult } = require('express-validator');
const { generateTTS } = require('../services/spitchService');

/**
 * @swagger
 * /api/v1/voice/tts:
 *   post:
 *     summary: Generate a Spitch TTS audio file
 *     description: |
 *       Converts text to speech via Spitch API, uploads the MP3 to Azure Blob Storage,
 *       and returns the public audio URL for dashboard playback.
 *
 *       **Supported languages:**
 *       - `en-NG` — Nigerian English (default)
 *       - `yo-NG` — Yoruba
 *       - `ha-NG` — Hausa
 *       - `pcm-NG` — Nigerian Pidgin
 *     tags: [Voice]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [text]
 *             properties:
 *               text:
 *                 type: string
 *                 example: "Payroll complete. Twenty staff paid three-point-eight million naira."
 *               language:
 *                 type: string
 *                 enum: [en-NG, yo-NG, ha-NG, pcm-NG]
 *                 default: en-NG
 *               voice:
 *                 type: string
 *                 enum: [male, female]
 *                 default: female
 *     responses:
 *       200:
 *         description: TTS audio generated
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 audio_url:
 *                   type: string
 *                   format: uri
 *                   example: "https://squadbridge.blob.core.windows.net/audio/tts-1716000000-en-NG.mp3"
 *       400:
 *         description: Validation error
 *       502:
 *         description: Spitch TTS API error
 */
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
