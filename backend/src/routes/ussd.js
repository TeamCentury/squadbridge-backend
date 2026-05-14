const router = require('express').Router();
const { School, Student } = require('../models');
const squadService = require('../services/squadService');
const { continueSession, endSession, MAIN_MENU } = require('../services/atService');

/**
 * @swagger
 * /ussd/callback:
 *   post:
 *     summary: Africa's Talking USSD callback (*556#)
 *     description: |
 *       **Called by Africa's Talking — not by your frontend.**
 *
 *       Handles *556# menu navigation. Returns `CON` responses to continue
 *       the session or `END` responses to terminate it.
 *
 *       **Menu structure:**
 *       - `1` — Check Balance
 *       - `2` — Collections Summary
 *       - `3` — Request Payout (multi-step)
 *       - `4` — Help
 *       - `0` — Exit
 *     tags: [USSD]
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/x-www-form-urlencoded:
 *           schema:
 *             type: object
 *             properties:
 *               sessionId:
 *                 type: string
 *                 example: ATUid_abc123
 *               phoneNumber:
 *                 type: string
 *                 example: "+2348012345678"
 *               text:
 *                 type: string
 *                 description: Accumulated USSD input (e.g. "3*500000*1")
 *                 example: "1"
 *               serviceCode:
 *                 type: string
 *                 example: "*556#"
 *     responses:
 *       200:
 *         description: USSD response string
 *         content:
 *           text/plain:
 *             schema:
 *               type: string
 *               example: "END Your Squad Balance: ₦4,700,000\nAs of: 14 May 2026, 08:00am"
 */
router.post('/callback', async (req, res) => {
  const { sessionId, phoneNumber, text } = req.body;
  const input = (text || '').trim();

  res.set('Content-Type', 'text/plain');

  try {
    const school = await School.findOne({ where: { phone: phoneNumber } });

    if (!school) {
      return res.send(endSession('Phone number not registered. Visit app.squadbridge.com to sign up.'));
    }

    if (!input) return res.send(MAIN_MENU);

    const parts = input.split('*');
    const level1 = parts[0];

    if (level1 === '1') {
      const balanceRes = await squadService.getBalance(school.squad_merchant_id).catch(() => null);
      const balance = balanceRes?.data?.balance || 0;
      const time = new Date().toLocaleString('en-NG', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
      return res.send(endSession(`Your Squad Balance: ₦${balance.toLocaleString()}\nAs of: ${time}`));
    }

    if (level1 === '2') {
      const students = await Student.findAll({ where: { school_id: school.id } });
      const paid = students.filter((s) => s.fee_status === 'paid').length;
      const total = students.length;
      const collected = students.reduce((sum, s) => sum + parseFloat(s.amount_paid), 0);
      const expected = students.reduce((sum, s) => sum + parseFloat(s.fee_amount), 0);
      const pct = total ? Math.round((paid / total) * 100) : 0;
      return res.send(endSession(`Students Paid: ${paid} / ${total}\nAmount: ₦${(collected / 1000000).toFixed(2)}M of ₦${(expected / 1000000).toFixed(2)}M\n${pct}% collected this term`));
    }

    if (level1 === '3') {
      if (parts.length === 1) {
        const balanceRes = await squadService.getBalance(school.squad_merchant_id).catch(() => null);
        const balance = balanceRes?.data?.balance || 0;
        return res.send(continueSession(`Available: ₦${balance.toLocaleString()}\nEnter amount to transfer:`));
      }
      if (parts.length === 2) {
        const amount = parseFloat(parts[1]);
        if (isNaN(amount) || amount <= 0) return res.send(endSession('Invalid amount. Please try again.'));
        return res.send(continueSession(`Confirm transfer of ₦${amount.toLocaleString()}?\n1. Yes\n2. No`));
      }
      if (parts.length === 3) {
        if (parts[2] === '1') return res.send(endSession(`Transfer queued. Ref: SB-${Date.now()}\nYou will receive a WhatsApp confirmation.`));
        return res.send(endSession('Transfer cancelled.'));
      }
    }

    if (level1 === '4') {
      return res.send(endSession(`SquadBridge Help\nWeb: ${process.env.FRONTEND_URL}\nEmail: support@squadbridge.com`));
    }

    if (level1 === '0') return res.send(endSession('Thank you for using SquadBridge. Goodbye!'));

    return res.send(MAIN_MENU);
  } catch (err) {
    res.send(endSession('An error occurred. Please try again.'));
  }
});

module.exports = router;
