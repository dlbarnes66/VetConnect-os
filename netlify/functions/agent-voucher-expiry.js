/**
 * VetConnect OS — Voucher Expiry Agent
 * Runs daily. Checks all active vouchers for expiry risk.
 * Triggers: 90 days, 30 days, 7 days, expired today
 */

const {
  airtableGet, airtablePatch, askClaude,
  logAction, sendEmailAlert, daysUntil
} = require('./agent-utils');

const VOUCHERS_TABLE = 'tbl29ojex3jMa6IpT';
const ALERT_EMAIL    = 'dlbarnes@dbglobalinvestments.com';

const SYSTEM_PROMPT = `You are an AI agent for VetConnect OS, a veteran housing platform.
You analyze voucher expiry data and return a structured JSON alert.
Always respond with ONLY valid JSON, no markdown, no explanation.
Format:
{
  "severity": "critical|high|medium|low",
  "subject": "email subject line",
  "message": "2-3 sentence alert message explaining the situation and recommended action",
  "action": "one clear action the case manager should take immediately"
}`;

exports.handler = async function(event, context) {
  console.log('[VoucherExpiryAgent] Starting run...');
  const results = { checked: 0, alerts: [], errors: [] };

  try {
    // Get all active and pending vouchers
    const vouchers = await airtableGet(
      VOUCHERS_TABLE,
      `OR({Status}="Active", {Status}="Pending")`
    );

    results.checked = vouchers.length;
    console.log(`[VoucherExpiryAgent] Checking ${vouchers.length} vouchers...`);

    for (const voucher of vouchers) {
      const f       = voucher.fields;
      const days    = daysUntil(f['Expiry Date']);
      const vName   = Array.isArray(f.Veteran) ? f.Veteran[0] : (f.Veteran || 'Unknown');
      const vNum    = f['Voucher Number'] || voucher.id;
      const amount  = f['Monthly Amount'] ? `$${f['Monthly Amount']}/mo` : '';

      // Determine if this needs an alert
      let needsAlert = false;
      let urgencyLabel = '';

      if (days === null) continue;

      if (days < 0) {
        needsAlert   = true;
        urgencyLabel = 'EXPIRED';
      } else if (days <= 7) {
        needsAlert   = true;
        urgencyLabel = '7 DAYS';
      } else if (days <= 30) {
        needsAlert   = true;
        urgencyLabel = '30 DAYS';
      } else if (days <= 90) {
        needsAlert   = true;
        urgencyLabel = '90 DAYS';
      }

      if (!needsAlert) continue;

      // Ask Claude to analyze and craft the alert
      const analysis = await askClaude(SYSTEM_PROMPT,
        `Voucher: ${vNum}
Veteran: ${vName}
Amount: ${amount}
Status: ${f.Status}
Expiry Date: ${f['Expiry Date']}
Days Until Expiry: ${days} (${days < 0 ? 'EXPIRED' : 'remaining'})
Market: ${f.Market || 'Unknown'}
Urgency Level: ${urgencyLabel}

Generate an alert for the case manager.`
      );

      const severity = analysis.severity || (days < 0 ? 'critical' : days <= 7 ? 'critical' : days <= 30 ? 'high' : 'medium');

      // Log to AgentLog
      await logAction({
        agentName:    'Voucher Expiry Agent',
        severity,
        recordType:   'voucher',
        recordName:   `${vNum} — ${vName}`,
        message:      analysis.message || `Voucher ${vNum} expires in ${days} days`,
        actionTaken:  analysis.action  || 'Alert sent to case manager',
        emailSent:    true
      });

      // Send email alert
      await sendEmailAlert({
        to:      ALERT_EMAIL,
        subject: analysis.subject || `[${severity.toUpperCase()}] Voucher Expiry: ${vNum} — ${urgencyLabel}`,
        body:    `${analysis.message}\n\nRecommended Action: ${analysis.action}\n\nVoucher: ${vNum}\nVeteran: ${vName}\nExpiry: ${f['Expiry Date']}\nDays remaining: ${days}`
      });

      results.alerts.push({ voucher: vNum, veteran: vName, days, severity });
      console.log(`[VoucherExpiryAgent] Alert fired: ${vNum} — ${days} days — ${severity}`);

      // Small delay to avoid rate limiting
      await new Promise(r => setTimeout(r, 300));
    }

    console.log(`[VoucherExpiryAgent] Done. ${results.alerts.length} alerts fired.`);
    return {
      statusCode: 200,
      body: JSON.stringify({ agent: 'VoucherExpiryAgent', ...results })
    };

  } catch (err) {
    console.error('[VoucherExpiryAgent] Error:', err.message);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message })
    };
  }
};
