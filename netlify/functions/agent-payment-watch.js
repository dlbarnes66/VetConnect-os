/**
 * VetConnect OS — Payment Intelligence Agent
 * Monitors all payment records for overdue, partial, and missing payments.
 * Generates variance reports and escalates issues.
 */

const {
  airtableGet, askClaude, logAction,
  sendEmailAlert, daysSince
} = require('./agent-utils');

const PAYMENTS_TABLE = 'tblr9DMVe1QkIHDhk';
const ALERT_EMAIL    = 'dlbarnes@dbglobalinvestments.com';

const SYSTEM_PROMPT = `You are an AI agent for VetConnect OS, a veteran housing platform.
You analyze payment records and identify financial risks for veteran housing properties.
Always respond with ONLY valid JSON, no markdown, no explanation.
Format:
{
  "severity": "critical|high|medium|low",
  "financial_risk": "brief description of the financial risk",
  "subject": "email subject line",
  "message": "2-3 sentences explaining the payment issue and its impact on veteran housing",
  "action": "specific action for the finance team or property manager",
  "amount_at_risk": number
}`;

exports.handler = async function(event, context) {
  console.log('[PaymentAgent] Starting run...');
  const results = { checked: 0, alerts: [], totalAtRisk: 0 };

  try {
    // Get pending and partial payments
    const payments = await airtableGet(
      PAYMENTS_TABLE,
      `OR({Status}="Pending", {Status}="Partial")`
    );

    results.checked = payments.length;
    console.log(`[PaymentAgent] Checking ${payments.length} pending/partial payments...`);

    for (const payment of payments) {
      const f          = payment.fields;
      const name       = f.Name       || payment.id;
      const expected   = Number(f['Expected Amount'])  || 0;
      const received   = Number(f['Received Amount'])  || 0;
      const status     = f.Status     || 'Unknown';
      const period     = f.Period     || 'Unknown';
      const dueDate    = f['Expected Date'];
      const propName   = Array.isArray(f.Property) ? f.Property[0] : (f.Property || 'Unknown Property');
      const variance   = expected - received;
      const overdueDays = dueDate ? daysSince(dueDate) : 0;

      if (variance <= 0 && overdueDays <= 0) continue;

      const analysis = await askClaude(SYSTEM_PROMPT,
        `Payment Record: ${name}
Property: ${propName}
Period: ${period}
Status: ${status}
Expected Amount: $${expected.toLocaleString()}
Received Amount: $${received.toLocaleString()}
Variance (shortfall): $${variance.toLocaleString()}
Due Date: ${dueDate || 'Not set'}
Days Overdue: ${overdueDays}

Analyze this payment issue and generate an alert for the finance team.`
      );

      const severity = analysis.severity || (overdueDays > 14 || variance > 10000 ? 'critical' : overdueDays > 7 || variance > 5000 ? 'high' : 'medium');
      const amountAtRisk = analysis.amount_at_risk || variance;
      results.totalAtRisk += amountAtRisk;

      await logAction({
        agentName:   'Payment Intelligence Agent',
        severity,
        recordType:  'payment',
        recordName:  `${name} — ${propName}`,
        message:     analysis.message || `Payment ${name} has $${variance.toLocaleString()} shortfall, ${overdueDays} days overdue`,
        actionTaken: analysis.action  || 'Alert sent to finance team',
        emailSent:   true
      });

      await sendEmailAlert({
        to:      ALERT_EMAIL,
        subject: analysis.subject || `[${severity.toUpperCase()}] Payment Issue: ${propName} — ${period}`,
        body:    `${analysis.message}\n\nFinancial Risk: ${analysis.financial_risk}\nAmount at Risk: $${amountAtRisk.toLocaleString()}\n\nProperty: ${propName}\nPeriod: ${period}\nExpected: $${expected.toLocaleString()}\nReceived: $${received.toLocaleString()}\nShortfall: $${variance.toLocaleString()}\nDays Overdue: ${overdueDays}\n\nAction Required: ${analysis.action}`
      });

      results.alerts.push({ payment: name, property: propName, variance, overdueDays, severity });
      console.log(`[PaymentAgent] Alert: ${name} — $${variance} variance — ${severity}`);
      await new Promise(r => setTimeout(r, 300));
    }

    console.log(`[PaymentAgent] Done. ${results.alerts.length} alerts. $${results.totalAtRisk.toLocaleString()} at risk.`);
    return {
      statusCode: 200,
      body: JSON.stringify({ agent: 'PaymentAgent', ...results })
    };

  } catch(err) {
    console.error('[PaymentAgent] Error:', err.message);
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
