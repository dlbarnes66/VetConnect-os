// netlify/functions/verify.js
// VetConnect OS — Email verification handler
// Lead clicks the verification link from their email →
//   1) Find the record in Airtable by token
//   2) Update status to "Email Verified" + log timestamp
//   3) Redirect them to the Google Drive pitch deck

const {
  AIRTABLE_TOKEN,
  AIRTABLE_BASE_ID,
  AIRTABLE_TABLE_NAME,
  PITCH_DECK_URL,       // Google Drive shareable link
  MARKETING_BASE_URL,   // https://vetconnectos.com (for error fallback)
} = process.env;

function airtableUrl(path = '') {
  const base = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${encodeURIComponent(AIRTABLE_TABLE_NAME)}`;
  return path ? `${base}/${path}` : base;
}

// HTML response for verification failure (token invalid/expired/already used)
function errorPage(reason) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Verification problem — VetConnect OS</title>
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    :root { --ink:#1a1a17; --forest:#2d3e2d; --brass:#b08740; --cream:#f4efe6; --cream-deep:#eae1ce; --muted:#76705f; }
    * { box-sizing:border-box; }
    body { margin:0; padding:0; background:var(--cream); color:var(--ink); font-family:'Georgia',serif; min-height:100vh; display:flex; align-items:center; justify-content:center; padding:24px; }
    .card { background:#fff; max-width:560px; width:100%; border-radius:14px; padding:48px 40px; box-shadow:0 6px 24px rgba(0,0,0,0.06); text-align:center; }
    .mark { display:inline-block; width:48px; height:48px; background:var(--brass); border-radius:50%; line-height:48px; color:var(--cream); font-size:22px; font-weight:bold; margin-bottom:24px; }
    h1 { font-size:26px; margin:0 0 16px 0; color:var(--ink); }
    p { font-family:'Calibri',Arial,sans-serif; color:var(--muted); line-height:1.6; margin:0 0 20px 0; font-size:15px; }
    a.btn { display:inline-block; padding:13px 30px; background:var(--brass); color:var(--ink); text-decoration:none; font-family:'Calibri',Arial,sans-serif; font-weight:bold; border-radius:6px; margin-top:8px; }
    a.btn:hover { background:#c99b47; }
    .small { font-size:12px; color:var(--muted); margin-top:24px; font-family:'Calibri',Arial,sans-serif; }
  </style>
</head>
<body>
  <div class="card">
    <div class="mark">V</div>
    <h1>This verification link didn't work.</h1>
    <p>${reason}</p>
    <a class="btn" href="${MARKETING_BASE_URL}">Back to vetconnectos.com</a>
    <div class="small">Need help? Email <a href="mailto:dlbarnes@vcgnow.com" style="color:var(--brass);">dlbarnes@vcgnow.com</a></div>
  </div>
</body>
</html>`;
}

exports.handler = async (event) => {
  const token = event.queryStringParameters?.token;

  if (!token || token.length < 20) {
    return {
      statusCode: 400,
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
      body: errorPage('The verification link is missing or malformed. Please use the link from your email exactly as it was sent.'),
    };
  }

  // Look up the record by Verification Token
  // Airtable filterByFormula — exact match on the token field
  const filterFormula = encodeURIComponent(`{Verification Token} = "${token}"`);
  const searchUrl = `${airtableUrl()}?filterByFormula=${filterFormula}&maxRecords=1`;

  let record;
  try {
    const res = await fetch(searchUrl, {
      headers: { 'Authorization': `Bearer ${AIRTABLE_TOKEN}` },
    });
    if (!res.ok) {
      const errBody = await res.text();
      console.error('Airtable lookup failed:', res.status, errBody);
      return {
        statusCode: 500,
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
        body: errorPage('Something went wrong on our end. Please try again in a moment.'),
      };
    }
    const data = await res.json();
    if (!data.records || data.records.length === 0) {
      return {
        statusCode: 404,
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
        body: errorPage('We couldn\'t find a matching verification record. The link may have expired or been used already.'),
      };
    }
    record = data.records[0];
  } catch (err) {
    console.error('Verify lookup error:', err);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
      body: errorPage('Something went wrong on our end. Please try again in a moment.'),
    };
  }

  // Update the record — mark as verified
  try {
    const updateRes = await fetch(airtableUrl(record.id), {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${AIRTABLE_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        fields: {
          'Status':       'Email Verified',
          'Verified At':  new Date().toISOString().slice(0, 10),  // YYYY-MM-DD
        },
        typecast: true,
      }),
    });
    if (!updateRes.ok) {
      const errBody = await updateRes.text();
      console.error('Airtable update failed:', updateRes.status, errBody);
      // Non-fatal — they still get the deck. Failing here would punish the lead for our bug.
    }
  } catch (err) {
    console.error('Verify update error:', err);
    // Non-fatal — proceed to redirect
  }

  // Redirect to the pitch deck
  return {
    statusCode: 302,
    headers: {
      'Location': PITCH_DECK_URL,
      'Cache-Control': 'no-store',
    },
    body: '',
  };
};
