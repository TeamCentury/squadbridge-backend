/**
 * SquadBridge Credit Scoring Engine
 *
 * Produces a 300–850 score using six weighted factors.
 * Feature engineering mirrors what the production XGBoost model uses —
 * swap computeScore() for a model.predict() call when the ML model is ready.
 *
 * Score bands:
 *   300–499  Poor      (high risk)
 *   500–599  Fair      (moderate risk)
 *   600–699  Good      (low-moderate risk)
 *   700–749  Very Good (low risk)
 *   750–850  Excellent (minimal risk)
 */

const { CreditProfile, CreditEvent, TraderJob, GraduateGig } = require('../models');
const { Op } = require('sequelize');

// Factor weights — must sum to 1.0
const WEIGHTS = {
  payment_history: 0.35,
  income_volume:   0.20,
  account_age:     0.15,
  activity:        0.15,
  diversity:       0.10,
  growth:          0.05,
};

const BASE  = 300;
const RANGE = 550; // 850 - 300

function incomeVolumeTier(totalNgn) {
  if (totalNgn >= 1_000_000) return 1.0;
  if (totalNgn >= 500_000)   return 0.85;
  if (totalNgn >= 200_000)   return 0.60;
  if (totalNgn >= 50_000)    return 0.30;
  return 0;
}

function scoreBand(score) {
  if (score >= 750) return 'Excellent';
  if (score >= 700) return 'Very Good';
  if (score >= 600) return 'Good';
  if (score >= 500) return 'Fair';
  return 'Poor';
}

function recommendations(factors) {
  const tips = [];
  if (factors.payment_history < 0.5)
    tips.push('Complete more paid jobs to build a payment track record.');
  if (factors.income_volume < 0.3)
    tips.push('Increase your total earnings — more active jobs improve your score significantly.');
  if (factors.account_age < 0.3)
    tips.push('Your account is new. Consistent activity over time will raise your score.');
  if (factors.diversity < 0.4)
    tips.push('Work with more different clients to show income diversity.');
  if (factors.growth < 0.3)
    tips.push('Increase your activity in recent months compared to earlier — growth is rewarded.');
  if (tips.length === 0)
    tips.push('Great profile! Keep completing jobs on time to maintain your excellent score.');
  return tips;
}

/**
 * Compute score from raw stats.
 * All inputs are plain numbers — no DB calls here.
 */
function computeScore(stats) {
  const {
    totalTransactions,
    onTimePayments,
    totalVolumeNgn,
    accountAgeDays,
    uniqueClients,
    jobsLast90,
    jobsPrev90,
  } = stats;

  const f = {};

  // 1. Payment history — ratio of paid completions to total jobs
  f.payment_history = totalTransactions > 0
    ? Math.min(onTimePayments / totalTransactions, 1)
    : 0;

  // 2. Income/volume — tiered by NGN total
  f.income_volume = incomeVolumeTier(totalVolumeNgn);

  // 3. Account age — full credit at 365 days
  f.account_age = Math.min(accountAgeDays / 365, 1);

  // 4. Activity — 4 jobs/month in last 90 days = max
  const avgMonthlyJobs = (jobsLast90 / 3);
  f.activity = Math.min(avgMonthlyJobs / 4, 1);

  // 5. Client diversity — 10 unique clients = max
  f.diversity = Math.min(uniqueClients / 10, 1);

  // 6. Growth — recent 90 days vs previous 90 days
  const base = jobsPrev90 || 1;
  const growthRatio = jobsLast90 / base;
  f.growth = Math.min(Math.max(growthRatio, 0), 2) / 2;

  const weightedSum =
    f.payment_history * WEIGHTS.payment_history +
    f.income_volume   * WEIGHTS.income_volume +
    f.account_age     * WEIGHTS.account_age +
    f.activity        * WEIGHTS.activity +
    f.diversity       * WEIGHTS.diversity +
    f.growth          * WEIGHTS.growth;

  const score = Math.round(Math.min(Math.max(BASE + weightedSum * RANGE, BASE), 850));

  return {
    score,
    band: scoreBand(score),
    factors: f,
    sub_scores: {
      payment_history: Math.round(f.payment_history * 100),
      income_volume:   Math.round(f.income_volume * 100),
      account_age:     Math.round(f.account_age * 100),
      activity:        Math.round(f.activity * 100),
      diversity:       Math.round(f.diversity * 100),
      growth:          Math.round(f.growth * 100),
    },
    recommendations: recommendations(f),
  };
}

/**
 * Gather stats from DB and compute score for a trader or graduate.
 * Saves / updates the CreditProfile row.
 */
async function scoreUser(userId, userType) {
  const now = new Date();
  const d90ago  = new Date(now - 90 * 24 * 60 * 60 * 1000);
  const d180ago = new Date(now - 180 * 24 * 60 * 60 * 1000);

  // Pull credit events for this user
  const events = await CreditEvent.findAll({
    where: { user_id: userId, user_type: userType },
    order: [['recorded_at', 'ASC']],
  });

  const paidEvents = events.filter((e) =>
    ['payment_received', 'job_completed', 'gig_completed'].includes(e.event_type)
  );

  const accountCreated = events.find((e) => e.event_type === 'account_created');
  const accountAgeDays = accountCreated
    ? Math.floor((now - new Date(accountCreated.recorded_at)) / (1000 * 60 * 60 * 24))
    : 0;

  const totalVolumeNgn = paidEvents.reduce((s, e) => s + Number(e.amount || 0), 0);
  const uniqueClients  = new Set(paidEvents.map((e) => e.client_id).filter(Boolean)).size;

  const paidRecent = paidEvents.filter((e) => new Date(e.recorded_at) >= d90ago);
  const paidPrev   = paidEvents.filter(
    (e) => new Date(e.recorded_at) >= d180ago && new Date(e.recorded_at) < d90ago
  );

  const stats = {
    totalTransactions: paidEvents.length,
    onTimePayments:    paidEvents.length, // all completed = on-time for now
    totalVolumeNgn,
    accountAgeDays,
    uniqueClients,
    jobsLast90:  paidRecent.length,
    jobsPrev90:  paidPrev.length,
  };

  const result = computeScore(stats);

  // Upsert credit profile
  const [profile] = await CreditProfile.upsert({
    user_id:   userId,
    user_type: userType,
    score:     result.score,
    score_date: now,
    payment_history_score: result.sub_scores.payment_history,
    income_score:          result.sub_scores.income_volume,
    activity_score:        result.sub_scores.activity,
    account_age_score:     result.sub_scores.account_age,
    diversity_score:       result.sub_scores.diversity,
    growth_score:          result.sub_scores.growth,
    account_age_days:      accountAgeDays,
    total_transactions:    stats.totalTransactions,
    on_time_payments:      stats.onTimePayments,
    total_volume_ngn:      totalVolumeNgn,
    unique_clients:        uniqueClients,
    jobs_last_90_days:     stats.jobsLast90,
    factors:               JSON.stringify(result.factors),
  });

  return { ...result, profile_id: profile.id, computed_at: now };
}

/**
 * Record a credit-building event (call this after every completed job/payment).
 */
async function recordCreditEvent(userId, userType, eventType, { amount = 0, clientId = null, description = '', squadTransactionId = null } = {}) {
  return CreditEvent.create({
    user_id:              userId,
    user_type:            userType,
    event_type:           eventType,
    amount,
    client_id:            clientId,
    description,
    squad_transaction_id: squadTransactionId,
  });
}

module.exports = { scoreUser, recordCreditEvent, computeScore };
