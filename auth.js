// VetConnect OS — auth.js v2.0
// Roles: super_admin, admin, developer, employee
// Includes: invite system, presence heartbeat, granular rights

const VetConnectAuth = (() => {
  const BASE    = 'appooo5Vcblwu8Ysn';
  const TOKEN   = 'patvMD6jn0HcCxaKq.7a8f85732a9e74a55e7a81c482fc5dea2d1b492cbb2f7b2bda041aa69894df91';
  const USERS   = 'tblUsers';

  // ── RIGHTS SCHEMA ──────────────────────────────────────
  // 20 granular rights across 5 categories
  // Each right can be toggled per user independently of role
  const ALL_RIGHTS = {
    data: {
      label: 'Data Access',
      rights: {
        view_veterans:   { label: 'View veterans',       desc: 'See veteran records and case files' },
        edit_veterans:   { label: 'Edit veterans',       desc: 'Add and update veteran records' },
        delete_records:  { label: 'Delete records',      desc: 'Permanently delete any record' },
        export_data:     { label: 'Export data',         desc: 'Download CSVs and reports' }
      }
    },
    crm: {
      label: 'CRM & Investors',
      rights: {
        view_crm:        { label: 'View CRM',            desc: 'See investor pipeline and leads' },
        edit_crm:        { label: 'Edit CRM',            desc: 'Add and update CRM records' },
        view_fund1:      { label: 'View Fund I',         desc: 'Access VCG Fund I LP pipeline' },
        manage_outreach: { label: 'Manage outreach',     desc: 'Send and schedule investor outreach' }
      }
    },
    platform: {
      label: 'Platform Features',
      rights: {
        use_agents:      { label: 'Use AI agents',       desc: 'Access all 16 AI agents' },
        run_automations: { label: 'Run automations',     desc: 'Trigger and configure automations' },
        marketing_hub:   { label: 'Marketing Hub',       desc: 'Create and manage marketing assets' },
        calendar_tasks:  { label: 'Calendar & Tasks',    desc: 'Create and edit calendar events and tasks' }
      }
    },
    finance: {
      label: 'Finance & Housing',
      rights: {
        view_payments:   { label: 'View payments',       desc: 'See payment records and financials' },
        manage_vouchers: { label: 'Manage vouchers',     desc: 'Edit and assign housing vouchers' },
        view_properties: { label: 'View properties',    desc: 'Access property listings and markets' }
      }
    },
    admin: {
      label: 'Administration',
      rights: {
        manage_team:     { label: 'Manage team',         desc: 'Invite employees and assign roles' },
        change_roles:    { label: 'Change roles',        desc: 'Modify role assignments' },
        view_settings:   { label: 'View settings',       desc: 'Access platform settings and tokens' },
        view_admin:      { label: 'Admin panel',         desc: 'Access the admin section' },
        manage_api:      { label: 'API access',          desc: 'View and manage API keys and integrations' }
      }
    }
  };

  // ── DEFAULT RIGHTS PER ROLE ─────────────────────────────
  const ROLE_DEFAULTS = {
    super_admin: {
      // All rights on
      view_veterans:true, edit_veterans:true, delete_records:true, export_data:true,
      view_crm:true, edit_crm:true, view_fund1:true, manage_outreach:true,
      use_agents:true, run_automations:true, marketing_hub:true, calendar_tasks:true,
      view_payments:true, manage_vouchers:true, view_properties:true,
      manage_team:true, change_roles:true, view_settings:true, view_admin:true, manage_api:true
    },
    admin: {
      view_veterans:true, edit_veterans:true, delete_records:false, export_data:true,
      view_crm:true, edit_crm:true, view_fund1:true, manage_outreach:true,
      use_agents:true, run_automations:true, marketing_hub:true, calendar_tasks:true,
      view_payments:true, manage_vouchers:true, view_properties:true,
      manage_team:false, change_roles:false, view_settings:false, view_admin:false, manage_api:false
    },
    developer: {
      view_veterans:true, edit_veterans:true, delete_records:true, export_data:true,
      view_crm:true, edit_crm:true, view_fund1:false, manage_outreach:false,
      use_agents:true, run_automations:true, marketing_hub:true, calendar_tasks:true,
      view_payments:false, manage_vouchers:false, view_properties:true,
      manage_team:false, change_roles:false, view_settings:true, view_admin:false, manage_api:true
    },
    employee: {
      view_veterans:true, edit_veterans:true, delete_records:false, export_data:false,
      view_crm:false, edit_crm:false, view_fund1:false, manage_outreach:false,
      use_agents:true, run_automations:false, marketing_hub:false, calendar_tasks:true,
      view_payments:false, manage_vouchers:false, view_properties:true,
      manage_team:false, change_roles:false, view_settings:false, view_admin:false, manage_api:false
    }
  };

  // ── ROLE UI CONFIG ──────────────────────────────────────
  const ROLE_PERMISSIONS = {
    super_admin: { label:'Super Admin',         color:'#7C3AED', redirectTo:'admin.html' },
    admin:       { label:'Admin',               color:'#2563EB', redirectTo:'admin.html' },
    developer:   { label:'Developer',           color:'#0F766E', redirectTo:'admin.html' },
    employee:    { label:'Employee',            color:'#059669', redirectTo:'admin.html' },
    org_admin:   { label:'Organization Admin',  color:'#2563EB', redirectTo:'admin.html' },
    case_manager:{ label:'Case Manager',        color:'#059669', redirectTo:'admin.html' }
  };

  // ── HELPERS ────────────────────────────────────────────
  async function hashPassword(pw) {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(pw));
    return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2,'0')).join('');
  }

  async function airtableFetch(table, opts = {}) {
    const storedToken = localStorage.getItem('vcg_airtable_token_full') || TOKEN;
    const url = `https://api.airtable.com/v0/${BASE}/${table}${opts.query || ''}`;
    const res = await fetch(url, {
      method: opts.method || 'GET',
      headers: { 'Authorization': `Bearer ${storedToken}`, 'Content-Type': 'application/json' },
      body: opts.body ? JSON.stringify(opts.body) : undefined
    });
    return res.json();
  }

  // ── LOGIN ──────────────────────────────────────────────
  async function login(email, password) {
    const enc = encodeURIComponent;
    const data = await airtableFetch('Users', {
      query: `?filterByFormula=${enc(`{email}="${email}"`)}&maxRecords=1`
    });
    if (!data.records?.length) return { success: false, message: 'No account found with that email.' };
    const rec = data.records[0];
    const f = rec.fields;
    if (f.status !== 'Active') return { success: false, message: 'Account is inactive. Contact your admin.' };
    const hash = await hashPassword(password);
    if (hash !== f.password_hash) return { success: false, message: 'Incorrect password. Please try again.' };

    // Parse rights — stored in Airtable as JSON string or use role defaults
    let rights = {};
    try { rights = f.rights ? JSON.parse(f.rights) : (ROLE_DEFAULTS[f.role] || ROLE_DEFAULTS.employee); }
    catch(e) { rights = ROLE_DEFAULTS[f.role] || ROLE_DEFAULTS.employee; }

    const role = f.role || 'employee';
    const perms = ROLE_PERMISSIONS[role] || ROLE_PERMISSIONS.employee;
    const session = {
      id: rec.id, full_name: f.full_name, email: f.email,
      role, rights, permissions: perms,
      org_id: f.org_id?.[0] || 'vcg', org_name: f.org_name || 'VCG',
      avatar_url: null, loginTime: Date.now()
    };
    sessionStorage.setItem('vcos_session', JSON.stringify(session));

    // Update last_login + last_seen
    await airtableFetch('Users/' + rec.id, {
      method: 'PATCH',
      body: { fields: { last_login: new Date().toISOString(), last_seen: new Date().toISOString() } }
    });
    startPresenceHeartbeat(rec.id);
    return { success: true, session };
  }

  // ── PRESENCE HEARTBEAT ─────────────────────────────────
  let _heartbeatInterval = null;
  function startPresenceHeartbeat(recordId) {
    if (_heartbeatInterval) clearInterval(_heartbeatInterval);
    const ping = () => {
      const storedToken = localStorage.getItem('vcg_airtable_token_full') || TOKEN;
      fetch(`https://api.airtable.com/v0/${BASE}/Users/${recordId}`, {
        method: 'PATCH',
        headers: { 'Authorization': `Bearer ${storedToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ fields: { last_seen: new Date().toISOString() } })
      }).catch(() => {});
    };
    ping();
    _heartbeatInterval = setInterval(ping, 90000); // every 90 seconds
    window.addEventListener('beforeunload', () => clearInterval(_heartbeatInterval));
  }

  // ── INVITE SYSTEM ──────────────────────────────────────
  async function createInvite(email, role, invitedBy) {
    const token = btoa(email + ':' + Date.now() + ':' + Math.random().toString(36).slice(2));
    const expires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    // Store invite token in Users table as a pending record
    const res = await airtableFetch('Users', {
      method: 'POST',
      body: {
        fields: {
          email, role,
          status: 'Invited',
          invite_token: token,
          invite_expires: expires,
          invited_by: invitedBy,
          org_id: ['recigauG7MdP4MR4m'],
          full_name: email.split('@')[0]
        }
      }
    });
    if (res.error) return { success: false, error: res.error.message };
    const inviteUrl = window.location.origin + '/signup.html?token=' + token;
    return { success: true, inviteUrl, token, expires };
  }

  async function validateInviteToken(token) {
    const enc = encodeURIComponent;
    const data = await airtableFetch('Users', {
      query: `?filterByFormula=${enc(`{invite_token}="${token}"`)}&maxRecords=1`
    });
    if (!data.records?.length) return { valid: false, message: 'Invalid or expired invite link.' };
    const rec = data.records[0];
    if (rec.fields.status !== 'Invited') return { valid: false, message: 'This invite has already been used.' };
    if (new Date(rec.fields.invite_expires) < new Date()) return { valid: false, message: 'This invite link has expired.' };
    return { valid: true, record: rec };
  }

  async function completeSignup(token, fullName, password) {
    const inv = await validateInviteToken(token);
    if (!inv.valid) return { success: false, message: inv.message };
    const rec = inv.record;
    const hash = await hashPassword(password);
    const role = rec.fields.role || 'employee';
    const rights = ROLE_DEFAULTS[role] || ROLE_DEFAULTS.employee;
    const res = await airtableFetch('Users/' + rec.id, {
      method: 'PATCH',
      body: {
        fields: {
          full_name: fullName,
          password_hash: hash,
          status: 'Active',
          invite_token: '',
          rights: JSON.stringify(rights),
          last_login: new Date().toISOString(),
          last_seen: new Date().toISOString()
        }
      }
    });
    if (res.error) return { success: false, message: res.error.message };
    return { success: true };
  }

  // ── SESSION ────────────────────────────────────────────
  function getSession() {
    try { return JSON.parse(sessionStorage.getItem('vcos_session')); } catch(e) { return null; }
  }

  function hasRight(right) {
    const s = getSession();
    if (!s) return false;
    if (s.role === 'super_admin') return true;
    return !!(s.rights && s.rights[right]);
  }

  function logout() {
    sessionStorage.removeItem('vcos_session');
    if (_heartbeatInterval) clearInterval(_heartbeatInterval);
    window.location.href = 'login.html';
  }

  async function query(table, filter, opts = {}) {
    const enc = encodeURIComponent;
    const q = filter ? `?filterByFormula=${enc(filter)}&maxRecords=${opts.max||200}` : `?maxRecords=${opts.max||200}`;
    return airtableFetch(table + q);
  }

  return { login, logout, getSession, hasRight, createInvite, validateInviteToken,
           completeSignup, startPresenceHeartbeat, ROLE_PERMISSIONS, ROLE_DEFAULTS,
           ALL_RIGHTS, query, airtableFetch };
})();

// ── AUTH GUARD ─────────────────────────────────────────
// Skips login.html, signup.html, index.html — only protects admin pages
(function() {
  const publicPages = ['login.html', 'signup.html', 'index.html', '/'];
  const currentPage = window.location.pathname.split('/').pop() || 'index.html';
  if (publicPages.includes(currentPage)) return; // no guard on public pages

  const s = VetConnectAuth.getSession();
  if (!s) { window.location.href = 'login.html'; return; }
  if (Date.now() - s.loginTime > 28800000) { VetConnectAuth.logout(); return; }
  // Restart presence heartbeat on page reload
  if (s.id) VetConnectAuth.startPresenceHeartbeat(s.id);
})();
