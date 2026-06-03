// netlify/functions/login.js
// Handles login server-side — token never exposed to browser or GitHub
exports.handler = async function(event) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  try {
    const { email, password } = JSON.parse(event.body);
    if (!email || !password) {
      return { statusCode: 400, body: JSON.stringify({ success: false, message: 'Email and password required.' }) };
    }

    const token = process.env.AIRTABLE_TOKEN;
    const base  = 'appooo5Vcblwu8Ysn';
    const enc   = encodeURIComponent;

    // Look up user by email
    const res = await fetch(
      `https://api.airtable.com/v0/${base}/Users?filterByFormula=${enc(`{email}="${email}"`)}&maxRecords=1`,
      { headers: { 'Authorization': `Bearer ${token}` } }
    );
    const data = await res.json();

    if (!data.records?.length) {
      return { statusCode: 200, body: JSON.stringify({ success: false, message: 'No account found with that email.' }) };
    }

    const rec = data.records[0];
    const f   = rec.fields;

    if (f.status !== 'Active') {
      return { statusCode: 200, body: JSON.stringify({ success: false, message: 'Account is inactive. Contact your admin.' }) };
    }

    // Hash password server-side using Node crypto
    const crypto = require('crypto');
    const hash = crypto.createHash('sha256').update(password).digest('hex');

    if (hash !== f.password_hash) {
      return { statusCode: 200, body: JSON.stringify({ success: false, message: 'Incorrect password. Please try again.' }) };
    }

    // Parse rights
    let rights = {};
    try { rights = f.rights ? JSON.parse(f.rights) : {}; } catch(e) {}

    // Update last_login + last_seen
    await fetch(`https://api.airtable.com/v0/${base}/Users/${rec.id}`, {
      method: 'PATCH',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ fields: { last_login: new Date().toISOString(), last_seen: new Date().toISOString() } })
    });

    // Return session data (no token ever sent to browser)
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({
        success: true,
        session: {
          id:         rec.id,
          full_name:  f.full_name,
          email:      f.email,
          role:       f.role || 'employee',
          rights:     rights,
          org_id:     f.org_id?.[0] || 'vcg',
          org_name:   f.org_name || 'VCG',
          loginTime:  Date.now()
        }
      })
    };

  } catch(err) {
    return { statusCode: 500, body: JSON.stringify({ success: false, message: 'Server error. Please try again.' }) };
  }
};
