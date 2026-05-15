const axios = require('axios');
const crypto = require('crypto');
const { OpportunityPool, OpportunitySent, Graduate, Trader } = require('../models');
const { Op } = require('sequelize');
const { sendText } = require('./whatsappService');
const logger = require('../config/logger');
const Anthropic = require('@anthropic-ai/sdk');

const claude = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// ─── Source definitions ────────────────────────────────────────────────────
const SOURCES = [
  { name: 'jobberman',       url: 'https://www.jobberman.com/jobs',              type: 'jobs' },
  { name: 'myjobmag',        url: 'https://www.myjobmag.com/jobs',               type: 'jobs' },
  { name: 'ngcareers',       url: 'https://ngcareers.com/jobs/',                 type: 'jobs' },
  { name: 'discovery_africa',url: 'https://www.discoveryafrica.net/opportunities',type: 'fellowships' },
  { name: 'altschool',       url: 'https://altschoolafrica.com',                 type: 'training' },
];

function urlHash(url) {
  return crypto.createHash('sha256').update(url).digest('hex').slice(0, 64);
}

/**
 * Scrape opportunities from a source using Axios + regex parsing.
 * Returns array of raw opportunity objects.
 * Full Playwright scraping runs in the Azure Function environment.
 */
async function scrapeSource(source) {
  try {
    const res = await axios.get(source.url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; SquadBridge-Bot/1.0)' },
      timeout: 15000,
    });
    const html = res.data;

    // Extract job listings via common patterns
    const opportunities = [];
    const titleMatches = html.matchAll(/<h[23][^>]*>\s*([^<]{10,200})\s*<\/h[23]>/gi);
    for (const m of titleMatches) {
      const title = m[1].replace(/&amp;/g, '&').replace(/&#\d+;/g, '').trim();
      if (title.length < 10 || title.length > 300) continue;
      opportunities.push({
        title,
        organization: source.name,
        description: `From ${source.name} — ${source.type}`,
        external_link: source.url,
        source_platform: source.name,
        opportunity_type: source.type === 'training' ? 'training' : source.type === 'fellowships' ? 'fellowship' : 'full_time',
      });
      if (opportunities.length >= 5) break;
    }
    return opportunities;
  } catch (err) {
    logger.warn({ fn: 'opportunityService.scrapeSource', source: source.name, error: err.message });
    return [];
  }
}

/**
 * Tag an opportunity with skills and user type using Claude.
 */
async function tagOpportunity(opp) {
  try {
    const msg = await claude.messages.create({
      model: 'claude-opus-4-7',
      max_tokens: 1024,
      thinking: { type: 'adaptive' },
      messages: [{
        role: 'user',
        content: `Tag this Nigerian job/opportunity for SquadBridge matching.

Title: ${opp.title}
Description: ${opp.description || ''}
Type: ${opp.opportunity_type}

Return JSON only (no markdown):
{
  "skills_required": ["skill1", "skill2"],
  "target_user_type": "graduate" | "trader" | "all",
  "pay_or_stipend": "e.g. ₦80,000/month or Free"
}`,
      }],
    });
    const text = msg.content.find((b) => b.type === 'text')?.text || '{}';
    const json = JSON.parse(text.match(/\{[\s\S]*\}/)?.[0] || '{}');
    return json;
  } catch {
    return { skills_required: [], target_user_type: 'all', pay_or_stipend: null };
  }
}

/**
 * Main scrape run — called by Azure Function at 6AM WAT daily.
 */
async function runScrape() {
  let saved = 0;
  let skipped = 0;

  for (const source of SOURCES) {
    const raw = await scrapeSource(source);
    for (const opp of raw) {
      const hash = urlHash(opp.external_link + opp.title);
      const exists = await OpportunityPool.findOne({ where: { source_url_hash: hash } });
      if (exists) { skipped++; continue; }

      const tags = await tagOpportunity(opp);
      await OpportunityPool.create({
        source_url_hash: hash,
        title: opp.title,
        organization: opp.organization,
        description: opp.description,
        skills_required: JSON.stringify(tags.skills_required || []),
        opportunity_type: opp.opportunity_type,
        target_user_type: tags.target_user_type || 'all',
        location: 'Nigeria',
        pay_or_stipend: tags.pay_or_stipend,
        external_link: opp.external_link,
        source_platform: opp.source_platform,
      });
      saved++;
    }
  }

  logger.info({ fn: 'opportunityService.runScrape', saved, skipped });
  return { saved, skipped };
}

/**
 * Match opportunities to a user's skills.
 * Returns top N opportunities not yet sent to this user.
 */
async function matchForUser(userId, userType, skillsJson, limit = 5) {
  const skills = JSON.parse(skillsJson || '[]').map((s) => s.toLowerCase());

  // Get already-sent IDs
  const sent = await OpportunitySent.findAll({
    where: { user_id: userId, user_type: userType },
    attributes: ['opportunity_id'],
  });
  const sentIds = sent.map((s) => s.opportunity_id);

  const where = {
    is_active: true,
    target_user_type: { [Op.in]: [userType, 'all'] },
    ...(sentIds.length ? { id: { [Op.notIn]: sentIds } } : {}),
  };

  const opps = await OpportunityPool.findAll({ where, order: [['scraped_at', 'DESC']], limit: limit * 3 });

  // Score each by skill overlap
  const scored = opps.map((o) => {
    const oppSkills = JSON.parse(o.skills_required || '[]').map((s) => s.toLowerCase());
    const overlap = skills.filter((s) => oppSkills.some((os) => os.includes(s) || s.includes(os))).length;
    return { opp: o, score: overlap };
  }).sort((a, b) => b.score - a.score);

  return scored.slice(0, limit).map((s) => s.opp);
}

/**
 * Send daily WhatsApp opportunity digest to a user.
 */
async function sendDigest(user, userType) {
  const skills = user.skills || '[]';
  const opps = await matchForUser(user.id, userType, skills, 5);
  if (!opps.length) return 0;

  const name = user.name.split(' ')[0];
  const lines = opps.map((o, i) => {
    const pay = o.pay_or_stipend ? ` (${o.pay_or_stipend})` : '';
    const deadline = o.deadline ? ` · Deadline: ${new Date(o.deadline).toLocaleDateString('en-NG', { day: 'numeric', month: 'short' })}` : '';
    return `${i + 1}. *${o.title}*${pay}\n   ${o.organization}${deadline}\n   ${o.external_link}`;
  }).join('\n\n');

  const msg = `Good morning ${name}! 🌅 Here are today's opportunities for you:\n\n${lines}\n\nReply with the number to apply for an internal gig, or click the link for external ones.`;

  await sendText(user.phone, msg);

  // Record as sent
  await OpportunitySent.bulkCreate(
    opps.map((o) => ({ user_id: user.id, user_type: userType, opportunity_id: o.id })),
    { ignoreDuplicates: true }
  );

  return opps.length;
}

/**
 * Send digest to all active graduates and traders — called by Azure Function at 8AM WAT.
 */
async function sendAllDigests() {
  let totalSent = 0;
  const [graduates, traders] = await Promise.all([
    Graduate.findAll({ where: { is_active: true }, attributes: ['id', 'name', 'phone', 'skills'] }),
    Trader.findAll({ where: { is_active: true }, attributes: ['id', 'name', 'phone', 'skills'] }),
  ]);

  for (const g of graduates) {
    try { totalSent += await sendDigest(g, 'graduate'); } catch (e) { logger.warn({ fn: 'sendAllDigests', user: g.id, error: e.message }); }
  }
  for (const t of traders) {
    try { totalSent += await sendDigest(t, 'trader'); } catch (e) { logger.warn({ fn: 'sendAllDigests', user: t.id, error: e.message }); }
  }

  logger.info({ fn: 'opportunityService.sendAllDigests', totalSent, graduates: graduates.length, traders: traders.length });
  return totalSent;
}

/**
 * Manually inject an opportunity (for testing / admin use).
 */
async function injectOpportunity(data) {
  const hash = urlHash(data.external_link + data.title);
  const [opp, created] = await OpportunityPool.upsert({
    source_url_hash: hash,
    title: data.title,
    organization: data.organization || 'SquadBridge',
    description: data.description,
    skills_required: JSON.stringify(data.skills_required || []),
    opportunity_type: data.opportunity_type || 'gig',
    target_user_type: data.target_user_type || 'all',
    location: data.location || 'Nigeria',
    pay_or_stipend: data.pay_or_stipend,
    external_link: data.external_link || `https://squadbridge.ng/gigs`,
    source_platform: 'manual',
    deadline: data.deadline ? new Date(data.deadline) : null,
  });
  return { opp, created };
}

module.exports = { runScrape, sendDigest, sendAllDigests, injectOpportunity, matchForUser };
