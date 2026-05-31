// netlify/functions/save-investors.js
// Saves investors from Discovery Agent to Airtable Deck Leads table
// ONLY writes to plain text fields to avoid select option permission errors

exports.handler = async function(event) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const AIRTABLE_TOKEN = process.env.AIRTABLE_TOKEN;
  const BASE_ID = 'appooo5Vcblwu8Ysn';
  const TABLE_ID = 'tblnDM50dD7d8Fkjy'; // Deck Leads

  if (!AIRTABLE_TOKEN) {
    return {
      statusCode: 500,
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ success: false, error: 'AIRTABLE_TOKEN not configured' })
    };
  }

  let investors;
  try {
    const body = JSON.parse(event.body);
    investors = body.investors;
    if (!investors || !Array.isArray(investors) || investors.length === 0) {
      return {
        statusCode: 400,
        headers: { 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify({ success: false, error: 'No investors provided' })
      };
    }
  } catch (err) {
    return {
      statusCode: 400,
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ success: false, error: 'Invalid JSON: ' + err.message })
    };
  }

  const results = [];
  const errors  = [];
  const now     = new Date().toISOString().split('T')[0];

  const chunks = [];
  for (let i = 0; i < investors.length; i += 10) chunks.push(investors.slice(i, i + 10));

  for (const chunk of chunks) {
    const records = chunk.map(inv => {

      // Build rich notes — everything goes here so no select fields are needed
      const noteParts = [];
      if (inv.fit_score)         noteParts.push('FIT SCORE: ' + inv.fit_score + '/10');
      if (inv.why_fit)           noteParts.push('WHY FIT: ' + inv.why_fit);
      if (inv.thesis)            noteParts.push('THESIS: ' + inv.thesis);
      if (inv.stage)             noteParts.push('STAGE FOCUS: ' + inv.stage);
      if (inv.portfolio_overlap) noteParts.push('PORTFOLIO OVERLAP: ' + inv.portfolio_overlap);
      if (inv.contact_approach)  noteParts.push('CONTACT APPROACH: ' + inv.contact_approach);
      if (inv.warm_intro)        noteParts.push('WARM INTRO: ' + inv.warm_intro);
      noteParts.push('Added by AI Discovery Agent on ' + now);

      // ONLY plain text fields — no selects, no single-selects, no multi-selects
      const fields = {
        'Full Name':    inv.name || inv.full_name || 'Unknown',
        'Company':      inv.firm || inv.company || '',
        'Firm':         inv.firm || inv.company || '',
        'Source':       'AI Discovery Agent',
        'Notes':        noteParts.join('\n\n'),
        'Activity Log': now + ' — Added by AI Discovery Agent',
      };

      // Safe optional plain text fields (confirmed from table schema)
      if (inv.title)            fields['Role']             = inv.title;
      if (inv.email)            fields['Email']            = inv.email;
      if (inv.phone)            fields['Phone']            = inv.phone;
      if (inv.linkedin)         fields['LinkedIn URL']     = inv.linkedin;
      if (inv.twitter)          fields['Twitter Handle']   = inv.twitter;
      if (inv.intro_source)     fields['Intro Source']     = inv.intro_source;
      if (inv.sectors)          fields['Sectors of Interest'] = inv.sectors;
      if (inv.outreach_draft)   fields['Outreach Draft']   = inv.outreach_draft;

      return { fields };
    });

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
        const errMsg = data.error?.message || JSON.stringify(data);
        errors.push({ investors: chunk.map(i => i.name || 'Unknown'), error: errMsg });
      } else {
        results.push(...(data.records || []).map(r => ({
          id: r.id,
          name: r.fields['Full Name']
        })));
      }
    } catch (err) {
      errors.push({ investors: chunk.map(i => i.name || 'Unknown'), error: err.message });
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
      saved:   results.length,
      records: results,
      errors:  errors.length > 0 ? errors : undefined,
      message: errors.length === 0
        ? `${results.length} investor${results.length === 1 ? '' : 's'} saved to CRM`
        : `${results.length} saved, ${errors.length} failed — ${errors[0]?.error}`
    })
  };
};
