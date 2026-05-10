/**
 * VetConnect OS — Property Health Agent
 * Monitors HQS scores, occupancy rates, and unit availability.
 * Matches vacant units to waitlisted veterans automatically.
 */

const {
  airtableGet, askClaude, logAction, sendEmailAlert
} = require('./agent-utils');

const PROPERTIES_TABLE = 'tblopdWlgwI5gTMaA';
const VETERANS_TABLE   = 'tbl4tCL2wag2MKKTK';
const ALERT_EMAIL      = 'dlbarnes@dbglobalinvestments.com';

const SYSTEM_PROMPT = `You are an AI agent for VetConnect OS, a veteran housing platform.
You analyze property health data and identify maintenance, compliance, and occupancy risks.
Always respond with ONLY valid JSON, no markdown, no explanation.
Format:
{
  "severity": "critical|high|medium|low",
  "issue_type": "hqs_compliance|low_occupancy|maintenance|unit_available",
  "subject": "email subject line",
  "message": "2-3 sentences describing the property issue and its impact on veteran housing",
  "action": "specific action for the property manager",
  "compliance_risk": true|false
}`;

exports.handler = async function(event, context) {
  console.log('[PropertyHealthAgent] Starting run...');
  const results = { checked: 0, alerts: [], vacantUnits: [] };

  try {
    const properties = await airtableGet(PROPERTIES_TABLE);
    results.checked  = properties.length;

    // Also get veterans who need housing (high risk, no property linked)
    const veterans   = await airtableGet(VETERANS_TABLE, `{Risk level}="High"`);
    const needsHousing = veterans.filter(v => !v.fields.Property || v.fields.Property.length === 0);

    console.log(`[PropertyHealthAgent] Checking ${properties.length} properties, ${needsHousing.length} veterans need housing...`);

    for (const property of properties) {
      const f         = property.fields;
      const name      = f.Name        || property.id;
      const address   = f.Address     || '';
      const hqsScore  = Number(f['HQS Score'])    || 100;
      const totalUnits= Number(f['Total Units'])   || 0;
      const hudUnits  = Number(f['HUD Units'])     || 0;
      const market    = f.Market      || 'Unknown';

      const issues = [];

      // HQS compliance check
      if (hqsScore < 80)       issues.push({ type: 'hqs_compliance', detail: `HQS score ${hqsScore} is below 80 minimum` });
      else if (hqsScore < 90)  issues.push({ type: 'hqs_compliance', detail: `HQS score ${hqsScore} approaching threshold` });

      // Occupancy check (assume HUD units should be 90%+ occupied)
      const targetOccupancy = Math.floor(hudUnits * 0.9);
      if (hudUnits > 0 && hudUnits < targetOccupancy) {
        issues.push({ type: 'low_occupancy', detail: `${hudUnits} occupied of target ${targetOccupancy} HUD units` });
        results.vacantUnits.push({ property: name, address, market, availableUnits: targetOccupancy - hudUnits });
      }

      for (const issue of issues) {
        const analysis = await askClaude(SYSTEM_PROMPT,
          `Property: ${name}
Address: ${address}
Market: ${market}
Total Units: ${totalUnits}
HUD Units Occupied: ${hudUnits}
HQS Score: ${hqsScore}/100
Issue Detected: ${issue.type} — ${issue.detail}
Veterans Needing Housing in System: ${needsHousing.length}

Analyze this property issue and generate an alert for the property manager.`
        );

        const severity = analysis.severity || (hqsScore < 70 ? 'critical' : hqsScore < 80 ? 'high' : 'medium');

        await logAction({
          agentName:   'Property Health Agent',
          severity,
          recordType:  'property',
          recordName:  name,
          message:     analysis.message || `${name}: ${issue.detail}`,
          actionTaken: analysis.action  || 'Alert sent to property manager',
          emailSent:   true
        });

        await sendEmailAlert({
          to:      ALERT_EMAIL,
          subject: analysis.subject || `[${severity.toUpperCase()}] Property Alert: ${name}`,
          body:    `${analysis.message}\n\nIssue: ${issue.detail}\nCompliance Risk: ${analysis.compliance_risk ? 'YES — HUD inspection risk' : 'No immediate compliance risk'}\n\nProperty: ${name}\nAddress: ${address}\nHQS Score: ${hqsScore}/100\nHUD Units: ${hudUnits}\n${needsHousing.length > 0 ? `\nNote: ${needsHousing.length} veterans in the system currently need housing.` : ''}\n\nAction Required: ${analysis.action}`
        });

        results.alerts.push({ property: name, issue: issue.type, severity, hqsScore });
        console.log(`[PropertyHealthAgent] Alert: ${name} — ${issue.type} — ${severity}`);
        await new Promise(r => setTimeout(r, 300));
      }
    }

    // Veteran-to-unit matching alert
    if (results.vacantUnits.length > 0 && needsHousing.length > 0) {
      await logAction({
        agentName:   'Property Health Agent',
        severity:    'medium',
        recordType:  'property',
        recordName:  'Unit Matching',
        message:     `${results.vacantUnits.length} properties have available units. ${needsHousing.length} high-risk veterans need housing. Recommend immediate matching review.`,
        actionTaken: 'Matching opportunity alert sent',
        emailSent:   true
      });

      await sendEmailAlert({
        to:      ALERT_EMAIL,
        subject: `[ACTION] ${needsHousing.length} Veterans Need Housing — ${results.vacantUnits.length} Properties Have Availability`,
        body:    `VETERAN-TO-UNIT MATCHING OPPORTUNITY\n\nVeterans needing housing: ${needsHousing.map(v => v.fields.Name).join(', ')}\n\nAvailable units:\n${results.vacantUnits.map(p => `• ${p.property} (${p.market}) — ${p.availableUnits} units`).join('\n')}\n\nRecommended Action: Review and assign veterans to available units immediately.`
      });
    }

    console.log(`[PropertyHealthAgent] Done. ${results.alerts.length} alerts fired.`);
    return {
      statusCode: 200,
      body: JSON.stringify({ agent: 'PropertyHealthAgent', ...results })
    };

  } catch(err) {
    console.error('[PropertyHealthAgent] Error:', err.message);
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
