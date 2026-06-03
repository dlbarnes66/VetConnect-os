// netlify/functions/presence.js
// Updates last_seen for presence tracking — token server-side only
exports.handler = async function(event) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }
  try {
    const { recordId } = JSON.parse(event.body);
    if (!recordId) return { statusCode: 400, body: 'recordId required' };
    const token = process.env.AIRTABLE_TOKEN;
    await fetch(`https://api.airtable.com/v0/appooo5Vcblwu8Ysn/Users/${recordId}`, {
      method: 'PATCH',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ fields: { last_seen: new Date().toISOString() } })
    });
    return { statusCode: 200, body: JSON.stringify({ ok: true }) };
  } catch(err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
