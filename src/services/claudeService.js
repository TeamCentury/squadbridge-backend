const Anthropic = require('@anthropic-ai/sdk');
const logger = require('../config/logger');

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const SYSTEM_PROMPT = `You are SquadBridge AI, an intelligent financial assistant built into the SquadBridge platform for Nigerian schools. SquadBridge automates school fee collection, payroll, and cash flow management.

You are speaking with a verified school administrator (proprietor or bursar) who has already been authenticated by the system. Never assume they are a parent or student — they are always a school operator.

You help them understand:
- Cash flow forecasts in plain, actionable language
- P&L analysis with practical Nigerian-market recommendations
- How to improve fee collection and manage payroll sustainably

Tone: Warm, professional, and practical. Use Nigerian context (₦, NUBAN, school terms). Keep responses concise and actionable — school owners are busy people.

Rules:
- Always give specific numbered recommendations
- Use ₦ for all naira amounts
- When forecasts look bad, be honest but constructive
- Never invent financial data — only analyze what you are given
- Never suggest they contact their school — they ARE the school
- Limit responses to what was asked; don't pad`;

async function explainForecast(forecastData, schoolName, monthlyPayroll) {
  const { day30, day60, day90, daily_rate, lower30, lower90 } = forecastData;

  try {
    const message = await client.messages.create({
      model: 'claude-opus-4-7',
      max_tokens: 512,
      thinking: { type: 'adaptive' },
      system: [{ type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
      messages: [{
        role: 'user',
        content: `Explain this 30/60/90-day cash flow forecast for ${schoolName} in 3-4 sentences a school owner will understand. Then give 2-3 specific actions they should take now.

Forecast:
- Day 30 balance: ₦${Number(day30).toLocaleString()}
- Day 60 balance: ₦${Number(day60).toLocaleString()}
- Day 90 balance: ₦${Number(day90).toLocaleString()}
- Conservative Day 30: ₦${Number(lower30).toLocaleString()}
- Conservative Day 90: ₦${Number(lower90).toLocaleString()}
- Daily collection rate: ₦${Number(daily_rate).toLocaleString()}/day
- Monthly payroll: ₦${Number(monthlyPayroll || 0).toLocaleString()}`,
      }],
    });

    return message.content.find((b) => b.type === 'text')?.text || null;
  } catch (err) {
    logger.error({ service: 'claude', fn: 'explainForecast', error: err.message });
    return null;
  }
}

async function generatePLRecommendation(plData, schoolName) {
  const { annual_income, total_expenses, net_position, salary_expense, student_count, fee_per_term, staff_count } = plData;

  try {
    const message = await client.messages.create({
      model: 'claude-opus-4-7',
      max_tokens: 600,
      thinking: { type: 'adaptive' },
      system: [{ type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
      messages: [{
        role: 'user',
        content: `Give a 3-5 sentence P&L assessment for ${schoolName}, then list exactly 3 concrete recommendations with specific numbers.

P&L:
- Annual income: ₦${Number(annual_income).toLocaleString()}
- Total expenses: ₦${Number(total_expenses).toLocaleString()}
- Net position: ₦${Number(net_position).toLocaleString()} (${net_position < 0 ? 'DEFICIT' : 'SURPLUS'})
- Salary expense: ₦${Number(salary_expense).toLocaleString()} (${Math.round((salary_expense / total_expenses) * 100)}% of costs)
- Students: ${student_count} | Fee per term: ₦${Number(fee_per_term).toLocaleString()}
- Staff: ${staff_count}

If in deficit, tell them exactly how much fee increase or how many more students would fix it.`,
      }],
    });

    return message.content.find((b) => b.type === 'text')?.text || null;
  } catch (err) {
    logger.error({ service: 'claude', fn: 'generatePLRecommendation', error: err.message });
    return null;
  }
}

const LANG_NAMES = {
  'en-NG': 'Nigerian English',
  'yo-NG': 'Yoruba',
  'ig-NG': 'Igbo',
  'ha-NG': 'Hausa',
  'pcm-NG': 'Nigerian Pidgin English',
};

async function handleWhatsAppChat(userMessage, schoolContext, language = 'en-NG') {
  const ctx = schoolContext
    ? `School: ${schoolContext.name} | Balance: ₦${Number(schoolContext.balance || 0).toLocaleString()} | Students: ${schoolContext.student_count} | Fee/term: ₦${Number(schoolContext.fee_per_term || 0).toLocaleString()}`
    : 'No school context';

  const langName = LANG_NAMES[language] || 'English';
  const langInstruction = language !== 'en-NG'
    ? `IMPORTANT: The user spoke in ${langName}. You MUST reply in ${langName}.`
    : 'Reply in clear Nigerian English.';

  try {
    const message = await client.messages.create({
      model: 'claude-opus-4-7',
      max_tokens: 300,
      thinking: { type: 'adaptive' },
      system: [{ type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
      messages: [{
        role: 'user',
        content: `Context: ${ctx}\n\nMessage from school operator: "${userMessage}"\n\n${langInstruction} Reply in 1-3 sentences. Be direct and helpful. If they ask about numbers, use the context above.`,
      }],
    });

    return message.content.find((b) => b.type === 'text')?.text
      || "I'm unable to process your request right now. Please try again.";
  } catch (err) {
    logger.error({ service: 'claude', fn: 'handleWhatsAppChat', error: err.message });
    return "I'm unable to process your request right now. Please try again.";
  }
}

const WORKER_SYSTEM_PROMPT = `You are SquadBridge AI — a helpful assistant for Nigerian traders and graduates on the SquadBridge platform.

SquadBridge helps informal workers find verified gigs and jobs, build a credit score through Squad transaction history, receive payments safely via virtual accounts, and access working capital loans as their score grows.

The user is a registered SquadBridge member who has verified their identity. Be warm, brief, and practical. Use Nigerian context (₦, local references). Maximum 3 sentences unless asked for more.

Rules:
- Never invent job listings — tell them to use the platform search if they want jobs
- Keep responses conversational and to the point
- Respond in the user's language if it is not English`;

async function handleWorkerChat(userMessage, workerContext, language = 'en-NG') {
  const ctx = workerContext
    ? `Name: ${workerContext.name} | Type: ${workerContext.type} | Skills: ${workerContext.skills || 'not set'} | Location: ${workerContext.state || 'Nigeria'}`
    : 'Worker context unavailable';

  const langName = LANG_NAMES[language] || 'English';
  const langInstruction = language !== 'en-NG'
    ? `IMPORTANT: The user spoke in ${langName}. You MUST reply in ${langName}.`
    : 'Reply in clear Nigerian English.';

  try {
    const message = await client.messages.create({
      model: 'claude-opus-4-7',
      max_tokens: 300,
      thinking: { type: 'adaptive' },
      system: [{ type: 'text', text: WORKER_SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
      messages: [{
        role: 'user',
        content: `Context: ${ctx}\n\nMessage: "${userMessage}"\n\n${langInstruction} Reply in 1-3 sentences. Be direct and helpful.`,
      }],
    });

    return message.content.find((b) => b.type === 'text')?.text
      || "I'm unable to process your request right now. Please try again.";
  } catch (err) {
    logger.error({ service: 'claude', fn: 'handleWorkerChat', error: err.message });
    return "I'm unable to process your request right now. Please try again.";
  }
}

async function translateResponse(text, language) {
  if (!text || language === 'en-NG') return text;
  const langName = LANG_NAMES[language] || language;
  try {
    const msg = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 500,
      messages: [{
        role: 'user',
        content: `Translate this WhatsApp message into ${langName}. Keep all ₦ amounts, numbers, job titles, organisation names, URLs, emojis, and WhatsApp bold (*text*) exactly as written. Return only the translated text, no explanation.\n\n${text}`,
      }],
    });
    return msg.content.find((b) => b.type === 'text')?.text || text;
  } catch {
    return text;
  }
}

module.exports = { explainForecast, generatePLRecommendation, handleWhatsAppChat, handleWorkerChat, translateResponse };
