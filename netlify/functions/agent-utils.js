/**
 * VetConnect OS — Agent Utilities
 * Shared helpers for all AI agents
 */

const BASE_ID      = 'appooo5Vcblwu8Ysn';
const AIRTABLE_URL = `https://api.airtable.com/v0/${BASE_ID}`;
const CLAUDE_URL   = 'https://api.anthropic.com/v1/messages';
const AGENT_LOG_TABLE = 'tblWLiwRrWC6mRiQ3';
const ORG_ID       = 'recigauG7MdP4MR4m'; // VCG Foundation

// ── Airtable helpers ─────────────────────────────────────────────────────────
async function airtableGet(table, filter = '', max = 100) {
  const url = new URL(`${AIRTABLE_URL}/${encodeURIComponent(table)}`);
  if (filter) url.searchParams.set('filterByFormula', filter);
  url.searchParams.set('maxRecords', max);
  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${process.env.AIRTABLE_TOKEN}` }
  });
  const data = await res.json();
  return data.records || [];
}

async function airtablePatch(table, recordId, fields) {
  const res = await fetch(`${AIRTABLE_URL}/${encodeURIComponent(table)}/${recordId}`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${process.env.AIRTABLE_TOKEN}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ fields })
  });
  return res.json();
}

async function airtableCreate(table, fields) {
  const res = await fetch(`${AIRTABLE_URL}/${encodeURIComponent(table)}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.AIRTABLE_TOKEN}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ fields })
  });
  return res.json();
}

// ── Claude API helper ─────────────────────────────────────────────────────────
async function askClaude(systemPrompt, userMessage) {
  const res = await fetch(CLAUDE_URL, {
    method: 'POST',
    headers: {
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1024,
      system: systemPrompt,
      messages: [{ role: 'user', content: userMessage }]
    })
  });
  const data = await res.json();
  const text = data.content?.[0]?.text || '';
  // Strip markdown fences and parse JSON
  const clean = text.replace(/```json|```/g, '').trim();
  try { return JSON.parse(clean); } catch(_) { return { raw: text }; }
}

// ── Log agent action to Airtable ─────────────────────────────────────────────
async function logAction({ agentName, severity, recordType, recordName, message, actionTaken, emailSent = false }) {
  try {
    await airtableCreate(AGENT_LOG_TABLE, {
      agent_name:   agentName,
      triggered_at: new Date().toISOString(),
      severity,
      record_type:  recordType,
      record_name:  recordName,
      message,
      action_taken: actionTaken,
      email_sent:   emailSent,
      resolved:     false,
      org_id:       [ORG_ID]
    });
  } catch(e) {
    console.error('AgentLog write failed:', e.message);
  }
}

// ── Send email alert via Airtable Automations webhook ────────────────────────
// (or swap this for SendGrid/Postmark when you have the key)
async function sendEmailAlert({ to, subject, body }) {
  // If you add SendGrid: POST to https://api.sendgrid.com/v3/mail/send
  // For now, log it — wire up your email provider here
  console.log(`EMAIL ALERT → ${to}\nSUBJECT: ${subject}\n${body}`);
  return true;
}

// ── Days until a date ─────────────────────────────────────────────────────────
function daysUntil(dateStr) {
  if (!dateStr) return null;
  const target = new Date(dateStr);
  const now    = new Date();
  return Math.round((target - now) / (1000 * 60 * 60 * 24));
}

// ── Days since a date ────────────────────────────────────────────────────────
function daysSince(dateStr) {
  if (!dateStr) return null;
  const target = new Date(dateStr);
  const now    = new Date();
  return Math.round((now - target) / (1000 * 60 * 60 * 24));
}

module.exports = {
  airtableGet, airtablePatch, airtableCreate,
  askClaude, logAction, sendEmailAlert,
  daysUntil, daysSince,
  BASE_ID, ORG_ID, AGENT_LOG_TABLE
};
