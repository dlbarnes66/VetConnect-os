// netlify/functions/signup.js
// Completes employee account creation — token server-side only
exports.handler = async function(event) {
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };
  try {
    const { recordId, fullName, passwordHash, role } = JSON.parse(event.body);
    if (!recordId || !fullName || !passwordHash) {
      return { statusCode: 400, body: JSON.stringify({ success: false, message: 'Missing required fields.' }) };
    }
    const token = process.env.AIRTABLE_TOKEN;
    const base  = 'appooo5Vcblwu8Ysn';

    // Default rights per role
    const ROLE_DEFAULTS = {
      admin:    { view_veterans:true,edit_veterans:true,delete_records:false,export_data:true,view_crm:true,edit_crm:true,view_fund1:true,manage_outreach:true,use_agents:true,run_automations:true,marketing_hub:true,calendar_tasks:true,view_payments:true,manage_vouchers:true,view_properties:true,manage_team:false,change_roles:false,view_settings:false,view_admin:false,manage_api:false },
      developer:{ view_veterans:true,edit_veterans:true,delete_records:true,export_data:true,view_crm:true,edit_crm:true,view_fund1:false,manage_outreach:false,use_agents:true,run_automations:true,marketing_hub:true,calendar_tasks:true,view_payments:false,manage_vouchers:false,view_properties:true,manage_team:false,change_roles:false,view_settings:true,view_admin:false,manage_api:true },
      employee: { view_veterans:true,edit_veterans:true,delete_records:false,export_data:false,view_crm:false,edit_crm:false,view_fund1:false,manage_outreach:false,use_agents:true,run_automations:false,marketing_hub:false,calendar_tasks:true,view_payments:false,manage_vouchers:false,view_properties:true,manage_team:false,change_roles:false,view_settings:false,view_admin:false,manage_api:false }
    };
    const rights = ROLE_DEFAULTS[role] || ROLE_DEFAULTS.employee;

    const res = await fetch(`https://api.airtable.com/v0/${base}/Users/${recordId}`, {
      method: 'PATCH',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fields: {
          full_name:     fullName,
          password_hash: passwordHash,
          status:        'Active',
          invite_token:  '',
          rights:        JSON.stringify(rights),
          last_login:    new Date().toISOString(),
          last_seen:     new Date().toISOString()
        }
      })
    });
    const data = await res.json();
    if (data.error) return { statusCode: 200, body: JSON.stringify({ success: false, message: data.error.message }) };
    return { statusCode: 200, body: JSON.stringify({ success: true }) };
  } catch(err) {
    return { statusCode: 500, body: JSON.stringify({ success: false, message: err.message }) };
  }
};
