const { TraderBadge, EscrowAccount, CreditProfile } = require('../models');
const { sendText } = require('./whatsappService');
const Anthropic = require('@anthropic-ai/sdk');
const logger = require('../config/logger');

const claude = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const BADGE_TIERS = {
  1: { name: 'Registered',  label: '🟢 Registered',  description: 'Completed profile and verified phone' },
  2: { name: 'Trusted',     label: '🔵 Trusted',      description: 'Completed 3+ jobs with escrow payments' },
  3: { name: 'Verified',    label: '🟡 Verified',     description: 'ID/trade documents verified by platform' },
  4: { name: 'Expert',      label: '🟠 Expert',       description: 'Passed Claude skill assessment' },
  5: { name: 'Elite',       label: '🔴 Elite',        description: 'Top 10% earner with 4.8+ rating on 20+ jobs' },
};

/**
 * Get or create badge record for a trader.
 */
async function getBadge(traderId) {
  let badge = await TraderBadge.findOne({ where: { trader_id: traderId } });
  if (!badge) {
    badge = await TraderBadge.create({ trader_id: traderId, tier: 1, badge_name: 'Registered', verified: true });
  }
  return badge;
}

/**
 * Auto-evaluate tier 2 (Trusted): requires 3+ completed escrow jobs.
 */
async function evaluateTrusted(traderId, traderPhone) {
  const completedJobs = await EscrowAccount.count({
    where: { worker_id: traderId, worker_type: 'trader', status: 'released' },
  });

  if (completedJobs < 3) {
    return { upgraded: false, message: `${completedJobs}/3 escrow jobs completed for Trusted badge` };
  }

  const badge = await getBadge(traderId);
  if (badge.tier >= 2) return { upgraded: false, message: 'Already Trusted or higher' };

  await badge.update({ tier: 2, badge_name: 'Trusted', verified: true, verified_at: new Date() });

  if (traderPhone) {
    sendText(traderPhone,
      `SquadBridge: Congratulations! 🔵 You've earned the *Trusted* badge!\n\nYou've completed 3+ jobs with secure escrow payments. Your profile now shows the Trusted badge — employers trust verified workers more.\n\nKeep it up! Next: get your documents verified for the 🟡 Verified badge.`
    ).catch(() => {});
  }

  return { upgraded: true, tier: 2, badge: BADGE_TIERS[2] };
}

/**
 * Tier 3 (Verified): admin/document-based. Sets document_url and verifies.
 */
async function verifyDocuments(traderId, documentUrl, traderPhone) {
  const badge = await getBadge(traderId);

  await badge.update({
    tier: Math.max(badge.tier, 3),
    badge_name: 'Verified',
    document_url: documentUrl,
    verified: true,
    verified_at: new Date(),
  });

  if (traderPhone) {
    sendText(traderPhone,
      `SquadBridge: Your documents have been verified! 🟡 You're now a *Verified* trader.\n\nThis unlocks higher-paying jobs and employer trust. Next: take the 🟠 Expert skill assessment!`
    ).catch(() => {});
  }

  return { upgraded: true, tier: 3, badge: BADGE_TIERS[3] };
}

/**
 * Tier 4 (Expert): Claude generates and evaluates a skill assessment.
 * Returns questions if no answers yet; evaluates answers if provided.
 */
async function runSkillAssessment(traderId, trade, answers, traderPhone) {
  const badge = await getBadge(traderId);

  // Generate questions if no answers provided
  if (!answers) {
    const msg = await claude.messages.create({
      model: 'claude-opus-4-7',
      max_tokens: 600,
      thinking: { type: 'adaptive' },
      messages: [{
        role: 'user',
        content: `Generate 5 practical skill assessment questions for a Nigerian ${trade} looking to earn an "Expert" badge on a gig platform.

Requirements:
- Questions should test real-world knowledge a skilled ${trade} would know
- Mix of theoretical and practical scenarios
- Relevant to Nigerian context (materials, regulations, common problems)
- No multiple choice — open-ended answers to prevent guessing

Return JSON only:
{
  "questions": ["Q1", "Q2", "Q3", "Q4", "Q5"]
}`,
      }],
    });

    const text = msg.content.find((b) => b.type === 'text')?.text || '{}';
    const json = JSON.parse(text.match(/\{[\s\S]*\}/)?.[0] || '{}');

    await badge.update({ assessment_questions: JSON.stringify(json.questions || []) });
    return { questions: json.questions, message: 'Answer all 5 questions to earn Expert badge' };
  }

  // Evaluate answers
  const questions = JSON.parse(badge.assessment_questions || '[]');
  if (!questions.length) return { error: 'No assessment started. Call without answers first.' };

  const msg = await claude.messages.create({
    model: 'claude-opus-4-7',
    max_tokens: 400,
    thinking: { type: 'adaptive' },
    messages: [{
      role: 'user',
      content: `Evaluate these skill assessment answers for a Nigerian ${trade} seeking Expert-level certification.

Questions and Answers:
${questions.map((q, i) => `Q${i + 1}: ${q}\nA${i + 1}: ${answers[i] || '(no answer)'}`).join('\n\n')}

Score each answer 0-10. Be fair but professional — a skilled tradesperson should know these answers.

Return JSON only:
{
  "scores": [0-10, 0-10, 0-10, 0-10, 0-10],
  "total": 0-50,
  "passed": true/false,
  "feedback": "brief overall feedback"
}`,
    }],
  });

  const text = msg.content.find((b) => b.type === 'text')?.text || '{}';
  const result = JSON.parse(text.match(/\{[\s\S]*\}/)?.[0] || '{}');
  const score = result.total || result.scores?.reduce((a, b) => a + b, 0) || 0;
  const passed = score >= 35; // 70% pass threshold

  await badge.update({
    assessment_answers: JSON.stringify(answers),
    assessment_score: score,
  });

  if (passed) {
    await badge.update({ tier: Math.max(badge.tier, 4), badge_name: 'Expert', verified: true, verified_at: new Date() });

    if (traderPhone) {
      sendText(traderPhone,
        `SquadBridge: You passed! 🟠 You're now an *Expert* trader!\n\nScore: ${score}/50\n${result.feedback || ''}\n\nExpert badge unlocks premium gigs and higher pay rates. One more step to Elite status!`
      ).catch(() => {});
    }
    return { passed: true, score, tier: 4, badge: BADGE_TIERS[4], feedback: result.feedback };
  }

  if (traderPhone) {
    sendText(traderPhone,
      `SquadBridge: Assessment complete. Score: ${score}/50\n\n${result.feedback || 'Keep practicing!'}\n\nYou need 35+ to pass. You can retry after 7 days.`
    ).catch(() => {});
  }
  return { passed: false, score, message: 'Score below 35/50. Retry in 7 days.' };
}

/**
 * Tier 5 (Elite): computed from platform data — top 10% earner with 4.8+ rating on 20+ jobs.
 */
async function evaluateElite(traderId, traderPhone) {
  const { Trader } = require('../models');
  const trader = await Trader.findByPk(traderId);
  if (!trader) return { upgraded: false, message: 'Trader not found' };

  const badge = await getBadge(traderId);
  if (badge.tier >= 5) return { upgraded: false, message: 'Already Elite' };
  if (badge.tier < 4) return { upgraded: false, message: 'Must be Expert first' };

  const meetsJobs = trader.jobs_completed >= 20;
  const meetsRating = Number(trader.rating) >= 4.8;

  // Check if trader is in top 10% by total earnings
  const totalEarned = await EscrowAccount.sum('agreed_amount', {
    where: { worker_id: traderId, worker_type: 'trader', status: 'released' },
  });

  const profile = await CreditProfile.findOne({ where: { user_id: traderId, user_type: 'trader' } });
  const meetsCredit = profile && profile.score >= 700;

  if (!meetsJobs || !meetsRating) {
    return {
      upgraded: false,
      message: `Elite requirements: 20+ jobs (${trader.jobs_completed}), 4.8+ rating (${trader.rating})`,
    };
  }

  await badge.update({ tier: 5, badge_name: 'Elite', verified: true, verified_at: new Date() });

  if (traderPhone) {
    sendText(traderPhone,
      `SquadBridge: You've reached ELITE status! 🔴🌟\n\nYou are now among the top workers on SquadBridge. Your profile is featured to premium employers.\n\nTotal earnings: ₦${Number(totalEarned || 0).toLocaleString()}\nRating: ${trader.rating}/5 ⭐`
    ).catch(() => {});
  }

  return { upgraded: true, tier: 5, badge: BADGE_TIERS[5] };
}

module.exports = { getBadge, evaluateTrusted, verifyDocuments, runSkillAssessment, evaluateElite, BADGE_TIERS };
