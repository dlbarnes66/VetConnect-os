// netlify/functions/save-investors.js
// Receives investor data from the Discovery Agent and writes to Airtable Investor Outreach table

exports.handler = async function(event) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const AIRTABLE_TOKEN = process.env.AIRTABLE_TOKEN;
  const BASE_ID = 'appooo5Vcblwu8Ysn';
  const TABLE_ID = 'tblwOqhwXxHlA1Ka9'; // Investor Outreach table

  if (!AIRTABLE_TOKEN) {
    return {
      statusCode: 500,
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ success: false, error: 'AIRTABLE_TOKEN not set in environment variables' })
    };
  }

  let investors;
  try {
    const body = JSON.parse(event.body);
    investors = body.investors; // array of investor objects
    if (!investors || !Array.isArray(investors) || investors.length === 0) {
      return {
        statusCode: 400,
        headers: { 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify({ success: false, error: 'No investors provided. Expected { investors: [...] }' })
      };
    }
  } catch (err) {
    return {
      statusCode: 400,
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ success: false, error: 'Invalid JSON body: ' + err.message })
    };
  }

  const results = [];
  const errors = [];

  // Airtable batch limit is 10 records per request
  const chunks = [];
  for (let i = 0; i < investors.length; i += 10) {
    chunks.push(investors.slice(i, i + 10));
  }

  for (const chunk of chunks) {
    const records = chunk.map(inv => ({
      fields: {
        // Required
        'Name': inv.name || inv.full_name || 'Unknown',

        // Firm / contact
        'Firm': inv.firm || inv.company || '',
        'Lead Type': inv.lead_type || 'VC / Investor',
        'Stage Focus': inv.stage || inv.stage_focus || '',

        // Outreach tracking
        'Outreach Status': inv.outreach_status || 'Not Started',
        'Source': inv.source || 'AI Discovery Agent',

        // Fit scoring
        'Fit Score': inv.fit_score ? String(inv.fit_score) : '',

        // Notes — combine why-fit reasoning + contact approach
        'Notes': buildNotes(inv),

        // Outreach draft if agent wrote one
        ...(inv.outreach_draft ? { 'Outreach Draft': inv.outreach_draft } : {}),

        // Email if provided
        ...(inv.email ? { 'Email': inv.email } : {}),

        // LinkedIn if provided
        ...(inv.linkedin ? { 'LinkedIn': inv.linkedin } : {}),
      }
    }));

    try {
      const response = await fetch(
        `https://api.airtable.com/v0/${BASE_ID}/${TABLE_ID}`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${AIRTABLE_TOKEN}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ records })
        }
      );

      const data = await response.json();

      if (!response.ok) {
        errors.push({ chunk: chunk.map(i => i.name), error: data.error?.message || JSON.stringify(data) });
      } else {
        results.push(...(data.records || []).map(r => ({ id: r.id, name: r.fields['Name'] })));
      }
    } catch (err) {
      errors.push({ chunk: chunk.map(i => i.name), error: err.message });
    }
  }

  return {
    statusCode: 200,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*'
    },
    body: JSON.stringify({
      success: errors.length === 0,
      saved: results.length,
      records: results,
      errors: errors.length > 0 ? errors : undefined,
      message: errors.length === 0
        ? `${results.length} investor${results.length === 1 ? '' : 's'} saved to CRM successfully`
        : `${results.length} saved, ${errors.length} failed`
    })
  };
};

function buildNotes(inv) {
  const parts = [];
  const ts = new Date().toISOString().split('T')[0];

  if (inv.why_fit || inv.reason) {
    parts.push(`WHY FIT: ${inv.why_fit || inv.reason}`);
  }
  if (inv.contact_approach) {
    parts.push(`CONTACT APPROACH: ${inv.contact_approach}`);
  }
  if (inv.thesis) {
    parts.push(`THESIS: ${inv.thesis}`);
  }
  if (inv.portfolio_overlap) {
    parts.push(`PORTFOLIO OVERLAP: ${inv.portfolio_overlap}`);
  }
  if (inv.warm_intro) {
    parts.push(`WARM INTRO: ${inv.warm_intro}`);
  }
  if (inv.notes) {
    parts.push(inv.notes);
  }

  parts.push(`Added by AI Discovery Agent on ${ts}`);
  return parts.join('\n\n');
}
