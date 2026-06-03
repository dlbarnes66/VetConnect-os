// netlify/functions/invite.js
// Creates and validates invite tokens — token server-side only
exports.handler = async function(event) {
  const token = process.env.AIRTABLE_TOKEN;
  const base  = 'appooo5Vcblwu8Ysn';
  const enc   = encodeURIComponent;

  if (event.httpMethod === 'POST') {
    // Create invite
    try {
      const { email, role, invitedBy } = JSON.parse(event.body);
      // Check if already exists
      const check = await fetch(
        `https://api.airtable.com/v0/${base}/Users?filterByFormula=${enc(`{email}="${email}"`)}&maxRecords=1`,
        { headers: { 'Authorization': `Bearer ${token}` } }
      ).then(r => r.json());

      if (check.records?.length && check.records[0].fields.status !== 'Invited') {
        return { statusCode: 200, body: JSON.stringify({ success: false, message: 'An account with this email already exists.' }) };
      }

      const invToken  = require('crypto').randomBytes(32).toString('hex');
      const expires   = new Date(Date.now() + 7*24*60*60*1000).toISOString();
      const method    = check.records?.length ? 'PATCH' : 'POST';
      const url       = check.records?.length
        ? `https://api.airtable.com/v0/${base}/Users/${check.records[0].id}`
        : `https://api.airtable.com/v0/${base}/Users`;

      const fields = { email, role, status:'Invited', invite_token:invToken, invite_expires:expires, invited_by:invitedBy, full_name:email.split('@')[0], org_id:['recigauG7MdP4MR4m'] };
      const res = await fetch(url, {
        method,
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(method === 'POST' ? { fields } : { fields })
      }).then(r => r.json());

      if (res.error) return { statusCode: 200, body: JSON.stringify({ success: false, message: res.error.message }) };
      return { statusCode: 200, body: JSON.stringify({ success: true, token: invToken }) };
    } catch(err) {
      return { statusCode: 500, body: JSON.stringify({ success: false, message: err.message }) };
    }
  }

  if (event.httpMethod === 'GET') {
    // Validate invite token
    try {
      const invToken = event.queryStringParameters?.token;
      if (!invToken) return { statusCode: 400, body: JSON.stringify({ valid: false, message: 'No token provided.' }) };
      const data = await fetch(
        `https://api.airtable.com/v0/${base}/Users?filterByFormula=${enc(`{invite_token}="${invToken}"`)}&maxRecords=1`,
        { headers: { 'Authorization': `Bearer ${token}` } }
      ).then(r => r.json());
      if (!data.records?.length) return { statusCode: 200, body: JSON.stringify({ valid: false, message: 'Invalid or expired invite link.' }) };
      const rec = data.records[0];
      if (rec.fields.status !== 'Invited') return { statusCode: 200, body: JSON.stringify({ valid: false, message: 'This invite has already been used.' }) };
      if (new Date(rec.fields.invite_expires) < new Date()) return { statusCode: 200, body: JSON.stringify({ valid: false, message: 'This invite link has expired.' }) };
      return { statusCode: 200, body: JSON.stringify({ valid: true, email: rec.fields.email, role: rec.fields.role, recordId: rec.id }) };
    } catch(err) {
      return { statusCode: 500, body: JSON.stringify({ valid: false, message: err.message }) };
    }
  }

  return { statusCode: 405, body: 'Method Not Allowed' };
};
