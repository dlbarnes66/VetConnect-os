/**
 * VetConnect OS — Veteran Risk Monitor Agent
 * Watches stability scores, income, employment, contact recency.
 * Catches housing instability before it becomes a crisis.
 */

const {
  airtableGet, airtablePatch, askClaude,
  logAction, sendEmailAlert, daysSince
} = require('./agent-utils');

const VETERANS_TABLE = 'tbl4tCL2wag2MKKTK';
const ALERT_EMAIL    = 'dlbarnes@dbglobalinvestments.com';

const SYSTEM_PROMPT = `You are an AI agent for VetConnect OS, a veteran housing platform.
You analyze veteran stability data and identify housing instability risk.
Always respond with ONLY valid JSON, no markdown, no explanation.
Format:
{
  "severity": "critical|high|medium|low",
  "risk_factors": ["list of specific risk factors you identified"],
  "subject": "email subject line",
  "message": "2-3 sentences explaining the situation and why this veteran needs attention",
  "action": "one specific action the case manager should take within 24 hours",
  "urgency": "immediate|this_week|this_month"
}`;

exports.handler = async function(event, context) {
  console.log('[VeteranRiskAgent] Starting run...');
  const results = { checked: 0, alerts: [], errors: [] };

  try {
    const veterans = await airtableGet(VETERANS_TABLE);
    results.checked = veterans.length;
    console.log(`[VeteranRiskAgent] Checking ${veterans.length} veterans...`);

    for (const veteran of veterans) {
      const f           = veteran.fields;
      const name        = f.Name || 'Unknown Veteran';
      const score       = Number(f['Stability Score']) || 0;
      const income      = Number(f['Monthly Income'])  || 0;
      const risk        = f['Risk level']              || 'Unknown';
      const employment  = f['Employment Status']       || 'Unknown';
      const benefit     = f['Benefit Status']          || 'Unknown';
      const caseManager = f['case manager']            || 'Unassigned';

      // Build risk factor list
      const riskFactors = [];
      if (score < 40)                          riskFactors.push(`Critical stability score: ${score}/100`);
      else if (score < 60)                     riskFactors.push(`Low stability score: ${score}/100`);
      if (income === 0)                        riskFactors.push('Zero monthly income reported');
      else if (income < 800)                   riskFactors.push(`Very low income: $${income}/mo`);
      if (employment === 'Unemployed')         riskFactors.push('Currently unemployed');
      if (risk === 'High')                     riskFactors.push('Flagged as high risk');
      if (caseManager === 'Unassigned')        riskFactors.push('No case manager assigned');

      // Only alert if there are actual risk factors
      if (riskFactors.length === 0) continue;

      // Ask Claude for intelligent analysis
      const analysis = await askClaude(SYSTEM_PROMPT,
        `Veteran: ${name}
VA File: ${f['VA File Number'] || 'N/A'}
Stability Score: ${score}/100
Monthly Income: $${income}
Employment: ${employment}
Risk Level: ${risk}
Benefit Status: ${benefit}
Case Manager: ${caseManager}
Identified Risk Factors: ${riskFactors.join(', ')}

Analyze this veteran's housing stability risk and generate an alert.`
      );

      const severity = analysis.severity || (score < 40 || income === 0 ? 'critical' : score < 60 ? 'high' : 'medium');

      await logAction({
        agentName:   'Veteran Risk Monitor',
        severity,
        recordType:  'veteran',
        recordName:  name,
        message:     analysis.message || `${name} shows ${riskFactors.length} risk factors`,
        actionTaken: analysis.action  || 'Alert sent to case manager',
        emailSent:   true
      });

      await sendEmailAlert({
        to:      ALERT_EMAIL,
        subject: analysis.subject || `[${severity.toUpperCase()}] Veteran Risk Alert: ${name}`,
        body:    `${analysis.message}\n\nRisk Factors:\n${(analysis.risk_factors || riskFactors).map(r => `• ${r}`).join('\n')}\n\nRecommended Action: ${analysis.action}\nUrgency: ${analysis.urgency || 'this_week'}\n\nCase Manager: ${caseManager}\nStability Score: ${score}/100`
      });

      results.alerts.push({ veteran: name, severity, riskFactors, score });
      console.log(`[VeteranRiskAgent] Alert: ${name} — score ${score} — ${severity}`);
      await new Promise(r => setTimeout(r, 300));
    }

    console.log(`[VeteranRiskAgent] Done. ${results.alerts.length} alerts fired.`);
    return {
      statusCode: 200,
      body: JSON.stringify({ agent: 'VeteranRiskAgent', ...results })
    };

  } catch(err) {
    console.error('[VeteranRiskAgent] Error:', err.message);
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
