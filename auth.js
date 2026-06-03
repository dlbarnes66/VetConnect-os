// VetConnect OS — auth.js v3.0
// Zero hardcoded tokens — all Airtable calls go through Netlify functions

const VetConnectAuth = (() => {

  const ROLE_PERMISSIONS = {
    super_admin: { label:'Super Admin',        color:'#7C3AED', redirectTo:'admin.html' },
    admin:       { label:'Admin',              color:'#2563EB', redirectTo:'admin.html' },
    developer:   { label:'Developer',          color:'#0F766E', redirectTo:'admin.html' },
    employee:    { label:'Employee',           color:'#059669', redirectTo:'admin.html' },
    org_admin:   { label:'Organization Admin', color:'#2563EB', redirectTo:'admin.html' },
    case_manager:{ label:'Case Manager',       color:'#059669', redirectTo:'admin.html' }
  };

  const ROLE_DEFAULTS = {
    super_admin:{ view_veterans:true,edit_veterans:true,delete_records:true,export_data:true,view_crm:true,edit_crm:true,view_fund1:true,manage_outreach:true,use_agents:true,run_automations:true,marketing_hub:true,calendar_tasks:true,view_payments:true,manage_vouchers:true,view_properties:true,manage_team:true,change_roles:true,view_settings:true,view_admin:true,manage_api:true },
    admin:      { view_veterans:true,edit_veterans:true,delete_records:false,export_data:true,view_crm:true,edit_crm:true,view_fund1:true,manage_outreach:true,use_agents:true,run_automations:true,marketing_hub:true,calendar_tasks:true,view_payments:true,manage_vouchers:true,view_properties:true,manage_team:false,change_roles:false,view_settings:false,view_admin:false,manage_api:false },
    developer:  { view_veterans:true,edit_veterans:true,delete_records:true,export_data:true,view_crm:true,edit_crm:true,view_fund1:false,manage_outreach:false,use_agents:true,run_automations:true,marketing_hub:true,calendar_tasks:true,view_payments:false,manage_vouchers:false,view_properties:true,manage_team:false,change_roles:false,view_settings:true,view_admin:false,manage_api:true },
    employee:   { view_veterans:true,edit_veterans:true,delete_records:false,export_data:false,view_crm:false,edit_crm:false,view_fund1:false,manage_outreach:false,use_agents:true,run_automations:false,marketing_hub:false,calendar_tasks:true,view_payments:false,manage_vouchers:false,view_properties:true,manage_team:false,change_roles:false,view_settings:false,view_admin:false,manage_api:false }
  };

  const ALL_RIGHTS = {
    data:     { label:'Data Access',       rights:{ view_veterans:{label:'View veterans',desc:'See veteran records'}, edit_veterans:{label:'Edit veterans',desc:'Add and update records'}, delete_records:{label:'Delete records',desc:'Permanently delete any record'}, export_data:{label:'Export data',desc:'Download CSVs and reports'} } },
    crm:      { label:'CRM & Investors',   rights:{ view_crm:{label:'View CRM',desc:'See investor pipeline'}, edit_crm:{label:'Edit CRM',desc:'Add and update CRM records'}, view_fund1:{label:'View Fund I',desc:'Access VCG Fund I LP pipeline'}, manage_outreach:{label:'Manage outreach',desc:'Send investor outreach'} } },
    platform: { label:'Platform Features', rights:{ use_agents:{label:'Use AI agents',desc:'Access all 16 AI agents'}, run_automations:{label:'Run automations',desc:'Trigger automations'}, marketing_hub:{label:'Marketing Hub',desc:'Create marketing assets'}, calendar_tasks:{label:'Calendar & Tasks',desc:'Create events and tasks'} } },
    finance:  { label:'Finance & Housing', rights:{ view_payments:{label:'View payments',desc:'See payment records'}, manage_vouchers:{label:'Manage vouchers',desc:'Edit housing vouchers'}, view_properties:{label:'View properties',desc:'Access property listings'} } },
    admin:    { label:'Administration',    rights:{ manage_team:{label:'Manage team',desc:'Invite employees'}, change_roles:{label:'Change roles',desc:'Modify role assignments'}, view_settings:{label:'View settings',desc:'Access platform settings'}, view_admin:{label:'Admin panel',desc:'Access the admin section'}, manage_api:{label:'API access',desc:'Manage API keys'} } }
  };

  function getSession() {
    try { return JSON.parse(sessionStorage.getItem('vcos_session')); }
    catch(e) { return null; }
  }

  function requireAuth() {
    var s = getSession();
    if (!s) { window.location.href = 'login.html'; return null; }
    if (Date.now() - s.loginTime > 28800000) { logout(); return null; }
    if (s.role === 'super_admin' && (!s.rights || Object.keys(s.rights).length === 0)) {
      s.rights = ROLE_DEFAULTS.super_admin;
      sessionStorage.setItem('vcos_session', JSON.stringify(s));
    }
    return s;
  }

  function hasRight(right) {
    var s = getSession();
    if (!s) return false;
    if (s.role === 'super_admin') return true;
    return !!(s.rights && s.rights[right]);
  }

  function logout() {
    sessionStorage.removeItem('vcos_session');
    if (window._presenceInterval) clearInterval(window._presenceInterval);
    window.location.href = 'login.html';
  }

  function applyRoleNav(session) {
    if (!session || session.role === 'super_admin') return;
    var rights = session.rights || {};
    var navMap = { investors:rights.view_crm, crm:rights.view_crm, outreach:rights.manage_outreach, documents:true, dealroom:rights.view_crm, analytics:rights.export_data, integrations:rights.manage_api, settings:rights.view_settings, admin:rights.view_admin, marketing:rights.marketing_hub, team:rights.manage_team, automations:rights.run_automations, calendar:rights.calendar_tasks, tasks:rights.calendar_tasks };
    document.querySelectorAll('.nav-item').forEach(function(btn) {
      var match = (btn.getAttribute('onclick')||'').match(/showSection\('([^']+)'\)/);
      if (match && match[1] in navMap && !navMap[match[1]]) btn.style.display = 'none';
    });
  }

  async function login(email, password) {
    try {
      var res = await fetch('/.netlify/functions/login', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({email,password}) });
      var data = await res.json();
      if (!data.success) return data;
      var role = data.session.role || 'employee';
      data.session.permissions = ROLE_PERMISSIONS[role] || ROLE_PERMISSIONS.employee;
      data.session.avatar_url = null;
      if (!data.session.rights || Object.keys(data.session.rights).length === 0) {
        data.session.rights = ROLE_DEFAULTS[role] || ROLE_DEFAULTS.employee;
      }
      sessionStorage.setItem('vcos_session', JSON.stringify(data.session));
      startPresenceHeartbeat(data.session.id);
      return { success:true, session:data.session };
    } catch(err) {
      return { success:false, message:'Connection error. Please try again.' };
    }
  }

  function startPresenceHeartbeat(recordId) {
    if (window._presenceInterval) clearInterval(window._presenceInterval);
    function ping() {
      fetch('/.netlify/functions/presence', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({recordId}) }).catch(function(){});
    }
    ping();
    window._presenceInterval = setInterval(ping, 90000);
    window.addEventListener('beforeunload', function(){ clearInterval(window._presenceInterval); });
  }

  async function createInvite(email, role, invitedBy) {
    try {
      var res = await fetch('/.netlify/functions/invite', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({email,role,invitedBy}) });
      var data = await res.json();
      if (!data.success) return { success:false, message:data.message };
      return { success:true, inviteUrl:window.location.origin+'/signup.html?token='+data.token, token:data.token };
    } catch(err) { return { success:false, message:err.message }; }
  }

  async function validateInviteToken(token) {
    try { var res = await fetch('/.netlify/functions/invite?token='+encodeURIComponent(token)); return await res.json(); }
    catch(err) { return { valid:false, message:err.message }; }
  }

  async function query(tableId, filter, opts) {
    opts = opts || {};
    var token = localStorage.getItem('vcg_airtable_token_full');
    if (!token) return { records:[], error:'No token — set in Settings' };
    var url = 'https://api.airtable.com/v0/appooo5Vcblwu8Ysn/'+tableId+'?maxRecords='+(opts.max||200)+(filter?'&filterByFormula='+encodeURIComponent(filter):'');
    try { var res = await fetch(url,{headers:{'Authorization':'Bearer '+token}}); return await res.json(); }
    catch(err) { return { records:[], error:err.message }; }
  }

  async function airtableFetch(table, opts) {
    opts = opts || {};
    var token = localStorage.getItem('vcg_airtable_token_full');
    if (!token) return { error:{ message:'No token — go to Settings' } };
    var res = await fetch('https://api.airtable.com/v0/appooo5Vcblwu8Ysn/'+table+(opts.query||''), { method:opts.method||'GET', headers:{'Authorization':'Bearer '+token,'Content-Type':'application/json'}, body:opts.body?JSON.stringify(opts.body):undefined });
    return res.json();
  }

  return { login, logout, getSession, requireAuth, hasRight, applyRoleNav, createInvite, validateInviteToken, startPresenceHeartbeat, query, airtableFetch, ROLE_PERMISSIONS, ROLE_DEFAULTS, ALL_RIGHTS };

})();

(function() {
  var publicPages = ['login.html','signup.html','index.html',''];
  var currentPage = window.location.pathname.split('/').pop();
  if (publicPages.indexOf(currentPage) !== -1) return;
  var s = VetConnectAuth.getSession();
  if (!s) { window.location.href = 'login.html'; return; }
  if (Date.now() - s.loginTime > 28800000) { VetConnectAuth.logout(); return; }
  VetConnectAuth.startPresenceHeartbeat(s.id);
})();
