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

    const crypto = require('crypto');
    const hash = crypto.createHash('sha256').update(password).digest('hex');

    if (hash !== f.password_hash) {
      return { statusCode: 200, body: JSON.stringify({ success: false, message: 'Incorrect password. Please try again.' }) };
    }

    const ROLE_DEFAULTS = {
      super_admin:{ view_veterans:true,edit_veterans:true,delete_records:true,export_data:true,view_crm:true,edit_crm:true,view_fund1:true,manage_outreach:true,use_agents:true,run_automations:true,marketing_hub:true,calendar_tasks:true,view_payments:true,manage_vouchers:true,view_properties:true,manage_team:true,change_roles:true,view_settings:true,view_admin:true,manage_api:true },
      admin:      { view_veterans:true,edit_veterans:true,delete_records:false,export_data:true,view_crm:true,edit_crm:true,view_fund1:true,manage_outreach:true,use_agents:true,run_automations:true,marketing_hub:true,calendar_tasks:true,view_payments:true,manage_vouchers:true,view_properties:true,manage_team:false,change_roles:false,view_settings:false,view_admin:false,manage_api:false },
      developer:  { view_veterans:true,edit_veterans:true,delete_records:true,export_data:true,view_crm:true,edit_crm:true,view_fund1:false,manage_outreach:false,use_agents:true,run_automations:true,marketing_hub:true,calendar_tasks:true,view_payments:false,manage_vouchers:false,view_properties:true,manage_team:false,change_roles:false,view_settings:true,view_admin:false,manage_api:true },
      employee:   { view_veterans:true,edit_veterans:true,delete_records:false,export_data:false,view_crm:false,edit_crm:false,view_fund1:false,manage_outreach:false,use_agents:true,run_automations:false,marketing_hub:false,calendar_tasks:true,view_payments:false,manage_vouchers:false,view_properties:true,manage_team:false,change_roles:false,view_settings:false,view_admin:false,manage_api:false }
    };

    const role = f.role || 'employee';
    let rights = ROLE_DEFAULTS[role] || ROLE_DEFAULTS.employee;
    if (f.rights) {
      try { const saved = JSON.parse(f.rights); if (Object.keys(saved).length > 0) rights = saved; } catch(e) {}
    }

    await fetch(`https://api.airtable.com/v0/${base}/Users/${rec.id}`, {
      method: 'PATCH',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ fields: { last_login: new Date().toISOString(), last_seen: new Date().toISOString() } })
    });

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({
        success: true,
        session: {
          id:        rec.id,
          full_name: f.full_name,
          email:     f.email,
          role:      role,
          rights:    rights,
          org_id:    f.org_id?.[0] || 'vcg',
          org_name:  f.org_name || 'VCG',
          loginTime: Date.now()
        }
      })
    };

  } catch(err) {
    return { statusCode: 500, body: JSON.stringify({ success: false, message: 'Server error: ' + err.message }) };
  }
};
