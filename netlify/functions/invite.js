// netlify/functions/invite.js
exports.handler = async function(event) {
  const token = process.env.AIRTABLE_TOKEN;
  const base  = 'appooo5Vcblwu8Ysn';
  const enc   = encodeURIComponent;
  const headers = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' };
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers };

  if (event.httpMethod === 'POST') {
    try {
      const { email, role, invitedBy } = JSON.parse(event.body);
      if (!email) return { statusCode: 400, headers, body: JSON.stringify({ success: false, message: 'Email required.' }) };
      const check = await fetch(
        `https://api.airtable.com/v0/${base}/Users?filterByFormula=${enc(`{email}="${email}"`)}&maxRecords=1`,
        { headers: { 'Authorization': `Bearer ${token}` } }
      ).then(r => r.json());
      if (check.error) return { statusCode: 200, headers, body: JSON.stringify({ success: false, message: 'Auth error: ' + check.error.message }) };
      if (check.records?.length && check.records[0].fields.status === 'Active') {
        return { statusCode: 200, headers, body: JSON.stringify({ success: false, message: 'An active account with this email already exists.' }) };
      }
      const invToken = require('crypto').randomBytes(32).toString('hex');
      const expires  = new Date(Date.now() + 7*24*60*60*1000).toISOString();
      const fields = {
        email, full_name: email.split('@')[0],
        invite_token: invToken, invite_expires: expires,
        invited_by: invitedBy || 'Admin', status: 'Invited',
        invite_role: role || 'employee'
      };
      const method = check.records?.length ? 'PATCH' : 'POST';
      const url = check.records?.length
        ? `https://api.airtable.com/v0/${base}/Users/${check.records[0].id}`
        : `https://api.airtable.com/v0/${base}/Users`;
      const res = await fetch(url, {
        method, headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ fields })
      }).then(r => r.json());
      if (res.error) return { statusCode: 200, headers, body: JSON.stringify({ success: false, message: res.error.message }) };
      return { statusCode: 200, headers, body: JSON.stringify({ success: true, token: invToken }) };
    } catch(err) {
      return { statusCode: 500, headers, body: JSON.stringify({ success: false, message: err.message }) };
    }
  }

  if (event.httpMethod === 'GET') {
    try {
      const invToken = event.queryStringParameters?.token;
      if (!invToken) return { statusCode: 400, headers, body: JSON.stringify({ valid: false, message: 'No token.' }) };
      const data = await fetch(
        `https://api.airtable.com/v0/${base}/Users?filterByFormula=${enc(`{invite_token}="${invToken}"`)}&maxRecords=1`,
        { headers: { 'Authorization': `Bearer ${token}` } }
      ).then(r => r.json());
      if (!data.records?.length) return { statusCode: 200, headers, body: JSON.stringify({ valid: false, message: 'Invalid invite link.' }) };
      const rec = data.records[0];
      if (rec.fields.status !== 'Invited') return { statusCode: 200, headers, body: JSON.stringify({ valid: false, message: 'Invite already used.' }) };
      if (new Date(rec.fields.invite_expires) < new Date()) return { statusCode: 200, headers, body: JSON.stringify({ valid: false, message: 'Invite link expired.' }) };
      return { statusCode: 200, headers, body: JSON.stringify({ valid: true, email: rec.fields.email, role: rec.fields.invite_role || 'employee', recordId: rec.id }) };
    } catch(err) {
      return { statusCode: 500, headers, body: JSON.stringify({ valid: false, message: err.message }) };
    }
  }
  return { statusCode: 405, headers, body: 'Method Not Allowed' };
};
