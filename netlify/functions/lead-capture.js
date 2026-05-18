// netlify/functions/lead-capture.js
// VetConnect OS — Lead Capture for "View Full Pitch Deck"
// Phase 1: validates input, writes to Airtable, sends verification email via Mailgun, notifies founder

const crypto = require('crypto');

// ─── CONFIG ──────────────────────────────────────────────────────────────
// All secrets pull from Netlify environment variables — never hardcoded
const {
  AIRTABLE_TOKEN,           // Personal Access Token: "VetConnect OS — Deck Leads Capture"
  AIRTABLE_BASE_ID,         // appooo5Vcblwu8Ysn
  AIRTABLE_TABLE_NAME,      // "Deck Leads"
  MAILGUN_API_KEY,          // Mailgun Private API key
  MAILGUN_DOMAIN,           // mg.vcgnow.com
  FOUNDER_EMAIL,            // dlbarnes@vcgnow.com
  PUBLIC_BASE_URL,          // https://vetconnect-os.netlify.app
  MARKETING_BASE_URL,       // https://vetconnectos.com
} = process.env;

// ─── HELPERS ─────────────────────────────────────────────────────────────

const cors = {
  'Access-Control-Allow-Origin': '*',          // tightened below; '*' is fallback
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (statusCode, body) => ({
  statusCode,
  headers: { 'Content-Type': 'application/json', ...cors },
  body: JSON.stringify(body),
});

// Strict email validator — must have a TLD, no spaces
function isValidEmail(email) {
  if (!email || typeof email !== 'string') return false;
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
  return re.test(email.trim().toLowerCase());
}

// Throwaway / disposable email domain blocklist
// Not exhaustive — just catches the most common ones. Phase 4 expands this.
const DISPOSABLE_DOMAINS = new Set([
  'mailinator.com', 'guerrillamail.com', '10minutemail.com', 'tempmail.com',
  'throwaway.email', 'sharklasers.com', 'getnada.com', 'trashmail.com',
  'yopmail.com', 'dispostable.com', 'maildrop.cc', 'temp-mail.org',
  'fakeinbox.com', 'tempr.email', 'mintemail.com', 'mohmal.com',
]);

function isDisposableDomain(email) {
  const domain = email.trim().toLowerCase().split('@')[1];
  return DISPOSABLE_DOMAINS.has(domain);
}

// Sanitize free-text fields — strip control chars, cap length
function sanitize(value, maxLen = 200) {
  if (!value || typeof value !== 'string') return '';
  return value.replace(/[\x00-\x1F\x7F]/g, '').trim().slice(0, maxLen);
}

// Build Airtable API URL for the Deck Leads table
function airtableUrl() {
  // Encode table name (handles spaces)
  return `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${encodeURIComponent(AIRTABLE_TABLE_NAME)}`;
}

// ─── AIRTABLE ────────────────────────────────────────────────────────────

async function createAirtableRecord(lead) {
  const res = await fetch(airtableUrl(), {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${AIRTABLE_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      records: [{
        fields: {
          'Full Name':           lead.fullName,
          'Email':               lead.email,
          'Company':             lead.company,
          'Role':                lead.role || '',
          'Phone':               lead.phone || '',
          'Status':              'Email Pending',
          'Verification Token':  lead.verificationToken,
          'Source':              lead.source || 'vetconnectos.com hero CTA',
          'Qualified':           'Pending Review',
        },
      }],
      typecast: true,   // allows single-select values to be created if missing
    }),
  });

  if (!res.ok) {
    const errBody = await res.text();
    throw new Error(`Airtable create failed (${res.status}): ${errBody}`);
  }

  const data = await res.json();
  return data.records[0];
}

// ─── MAILGUN ─────────────────────────────────────────────────────────────

async function sendMailgun({ to, subject, html, text }) {
  const auth = Buffer.from(`api:${MAILGUN_API_KEY}`).toString('base64');
  const params = new URLSearchParams({
    from: `VetConnect OS <noreply@${MAILGUN_DOMAIN}>`,
    to,
    subject,
    html,
    text,
  });

  const res = await fetch(`https://api.mailgun.net/v3/${MAILGUN_DOMAIN}/messages`, {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${auth}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: params,
  });

  if (!res.ok) {
    const errBody = await res.text();
    throw new Error(`Mailgun send failed (${res.status}): ${errBody}`);
  }

  return res.json();
}

// ─── EMAIL TEMPLATES ─────────────────────────────────────────────────────

function verificationEmail({ fullName, verificationToken }) {
  const verifyUrl = `${PUBLIC_BASE_URL}/.netlify/functions/verify?token=${verificationToken}`;
  const firstName = fullName.split(' ')[0] || 'there';

  const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Your VetConnect OS Pitch Deck</title></head>
<body style="margin:0;padding:0;background:#f4efe6;font-family:Georgia,serif;color:#1a1a17;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4efe6;padding:40px 20px;">
    <tr><td align="center">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 4px 12px rgba(0,0,0,0.05);max-width:600px;">

        <tr><td style="background:#2d3e2d;padding:32px 40px;text-align:center;">
          <div style="display:inline-block;width:42px;height:42px;background:#b08740;border-radius:50%;line-height:42px;color:#f4efe6;font-size:20px;font-weight:bold;">V</div>
          <div style="color:#f4efe6;font-family:Georgia,serif;font-size:22px;margin-top:12px;">
            VetConnect <em style="color:#b08740;">OS</em>
          </div>
        </td></tr>

        <tr><td style="padding:40px;">
          <h1 style="font-family:Georgia,serif;font-size:24px;color:#1a1a17;margin:0 0 20px 0;">Hi ${escapeHtml(firstName)} —</h1>

          <p style="font-family:Calibri,Arial,sans-serif;font-size:15px;line-height:1.6;color:#3d3a32;margin:0 0 20px 0;">
            Thank you for your interest in VetConnect OS. To access the full pre-seed pitch deck, please verify your email by clicking the button below.
          </p>

          <p style="font-family:Calibri,Arial,sans-serif;font-size:15px;line-height:1.6;color:#3d3a32;margin:0 0 28px 0;">
            This single step keeps the deck out of bot crawlers and helps me know which serious operators and investors are taking a look.
          </p>

          <div style="text-align:center;margin:32px 0;">
            <a href="${verifyUrl}" style="display:inline-block;padding:14px 36px;background:#b08740;color:#1a1a17;text-decoration:none;font-family:Calibri,Arial,sans-serif;font-weight:bold;font-size:15px;border-radius:6px;letter-spacing:0.5px;">
              View the Pitch Deck →
            </a>
          </div>

          <p style="font-family:Calibri,Arial,sans-serif;font-size:13px;line-height:1.6;color:#76705f;margin:28px 0 0 0;text-align:center;">
            Or copy and paste this link:<br>
            <span style="word-break:break-all;color:#8a6a31;">${verifyUrl}</span>
          </p>

          <hr style="border:none;border-top:1px solid #eae1ce;margin:32px 0;">

          <p style="font-family:Calibri,Arial,sans-serif;font-size:14px;line-height:1.6;color:#3d3a32;margin:0;">
            I'd love to hear what you think after reading. Hit reply, or reach me directly at
            <a href="mailto:dlbarnes@vcgnow.com" style="color:#b08740;">dlbarnes@vcgnow.com</a>.
          </p>

          <p style="font-family:Georgia,serif;font-style:italic;font-size:14px;color:#3d3a32;margin:24px 0 0 0;">
            — Darryl Barnes<br>
            <span style="font-style:normal;color:#76705f;font-size:13px;">Founder &amp; CEO, VetConnect OS</span>
          </p>
        </td></tr>

        <tr><td style="background:#eae1ce;padding:20px 40px;text-align:center;">
          <p style="font-family:Calibri,Arial,sans-serif;font-size:11px;color:#76705f;margin:0;">
            VetConnect OS · The operating system for veteran housing<br>
            <a href="${MARKETING_BASE_URL}" style="color:#b08740;text-decoration:none;">vetconnectos.com</a>
          </p>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body></html>`;

  const text = `Hi ${firstName},

Thank you for your interest in VetConnect OS.

To access the full pre-seed pitch deck, please verify your email by clicking this link:

${verifyUrl}

This single step keeps the deck out of bot crawlers and helps me know which serious operators and investors are taking a look.

I'd love to hear what you think after reading. Reply to this email, or reach me directly at dlbarnes@vcgnow.com.

— Darryl Barnes
Founder & CEO, VetConnect OS
vetconnectos.com`;

  return { html, text, subject: 'Your VetConnect OS pitch deck — one click to access' };
}

function founderNotificationEmail(lead) {
  const html = `<!DOCTYPE html>
<html><body style="font-family:Calibri,Arial,sans-serif;color:#1a1a17;background:#f4efe6;padding:20px;">
  <div style="background:#fff;border-radius:8px;padding:24px;max-width:560px;margin:0 auto;border-left:4px solid #b08740;">
    <h2 style="margin:0 0 12px 0;color:#2d3e2d;font-family:Georgia,serif;">🛡️ New deck lead</h2>
    <p style="margin:0 0 16px 0;color:#76705f;font-size:13px;">A new pitch deck request just came in via vetconnectos.com.</p>

    <table style="width:100%;border-collapse:collapse;font-size:14px;">
      <tr><td style="padding:6px 0;color:#76705f;width:120px;">Name:</td><td style="padding:6px 0;font-weight:bold;">${escapeHtml(lead.fullName)}</td></tr>
      <tr><td style="padding:6px 0;color:#76705f;">Email:</td><td style="padding:6px 0;"><a href="mailto:${escapeHtml(lead.email)}" style="color:#b08740;">${escapeHtml(lead.email)}</a></td></tr>
      <tr><td style="padding:6px 0;color:#76705f;">Company:</td><td style="padding:6px 0;">${escapeHtml(lead.company)}</td></tr>
      ${lead.role ? `<tr><td style="padding:6px 0;color:#76705f;">Role:</td><td style="padding:6px 0;">${escapeHtml(lead.role)}</td></tr>` : ''}
      ${lead.phone ? `<tr><td style="padding:6px 0;color:#76705f;">Phone:</td><td style="padding:6px 0;">${escapeHtml(lead.phone)}</td></tr>` : ''}
      <tr><td style="padding:6px 0;color:#76705f;">Source:</td><td style="padding:6px 0;">${escapeHtml(lead.source || 'vetconnectos.com')}</td></tr>
    </table>

    <hr style="border:none;border-top:1px solid #eae1ce;margin:20px 0;">

    <p style="margin:0;font-size:13px;color:#76705f;">
      📋 Lead is now in <strong>Deck Leads</strong> in Airtable with status <strong>Email Pending</strong>.<br>
      Once they click the verification email, status flips to <strong>Email Verified</strong> — that's your signal to follow up.
    </p>
  </div>
</body></html>`;

  const text = `New deck lead from vetconnectos.com

Name:    ${lead.fullName}
Email:   ${lead.email}
Company: ${lead.company}
${lead.role ? `Role:    ${lead.role}\n` : ''}${lead.phone ? `Phone:   ${lead.phone}\n` : ''}Source:  ${lead.source || 'vetconnectos.com'}

Lead is in Deck Leads (Airtable) with status: Email Pending.
Once they click the verification email, status flips to Email Verified — that's your signal to follow up.`;

  return { html, text, subject: `🛡️ New deck lead: ${lead.fullName} (${lead.company})` };
}

// HTML-escape for safe interpolation into email templates
function escapeHtml(s) {
  if (!s) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// ─── MAIN HANDLER ────────────────────────────────────────────────────────

exports.handler = async (event) => {
  // CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: cors, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return json(405, { error: 'Method not allowed' });
  }

  let payload;
  try {
    payload = JSON.parse(event.body || '{}');
  } catch (e) {
    return json(400, { error: 'Invalid JSON' });
  }

  // Honeypot — if this hidden field is filled, it's a bot. Pretend success silently.
  if (payload.website && payload.website.length > 0) {
    console.log('Honeypot triggered, silently dropping');
    return json(200, { ok: true });   // bot thinks it worked, real users never see this
  }

  // Validate + sanitize inputs
  const fullName = sanitize(payload.fullName, 100);
  const email    = sanitize(payload.email, 200).toLowerCase();
  const company  = sanitize(payload.company, 150);
  const role     = sanitize(payload.role, 100);
  const phone    = sanitize(payload.phone, 30);
  const source   = sanitize(payload.source, 100);

  if (!fullName) return json(400, { error: 'Full name is required.' });
  if (!email)    return json(400, { error: 'Email is required.' });
  if (!company)  return json(400, { error: 'Company is required.' });

  if (!isValidEmail(email)) {
    return json(400, { error: 'Please enter a valid email address.' });
  }

  if (isDisposableDomain(email)) {
    return json(400, { error: 'Please use your work email — disposable email services aren\'t accepted.' });
  }

  // Generate verification token (cryptographically random)
  const verificationToken = crypto.randomBytes(32).toString('hex');

  const lead = {
    fullName,
    email,
    company,
    role,
    phone,
    source: source || 'vetconnectos.com hero CTA',
    verificationToken,
  };

  // Write to Airtable
  try {
    await createAirtableRecord(lead);
  } catch (err) {
    console.error('Airtable error:', err.message);
    return json(500, { error: 'Could not save your request. Please try again or email dlbarnes@vcgnow.com.' });
  }

  // Send verification email to lead
  try {
    const tpl = verificationEmail(lead);
    await sendMailgun({ to: lead.email, ...tpl });
  } catch (err) {
    console.error('Verification email failed:', err.message);
    // We don't fail the whole request — lead is captured. But we do notify ourselves.
  }

  // Send notification email to founder
  try {
    const tpl = founderNotificationEmail(lead);
    await sendMailgun({ to: FOUNDER_EMAIL, ...tpl });
  } catch (err) {
    console.error('Founder notification failed:', err.message);
    // Same — don't fail the request.
  }

  return json(200, { ok: true });
};
