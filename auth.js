/**
 * VetConnect OS — Authentication Engine v2.0
 * Base: appooo5Vcblwu8Ysn
 * Full-access token baked in — change after first deploy
 */
const VetConnectAuth = (() => {

  const BASE_ID    = 'appooo5Vcblwu8Ysn';
  const API_URL    = `https://api.airtable.com/v0/${BASE_ID}`;
  const META_URL   = `https://api.airtable.com/v0/meta/bases/${BASE_ID}`;
  const SESSION_KEY = 'vcos_session';
  const TOKEN_KEY   = 'vcg_airtable_token_full';
  // Full-access token — replace with new token from airtable.com/create/tokens after deploy
  const BAKED_TOKEN = 'patvMD6jn0HcCxaKq.7a8f85732a9e74a55e7a81c482fc5dea2d1b492cbb2f7b2bda041aa69894df91';

  // Bootstrap token on every page load
  (function() {
    if (!localStorage.getItem(TOKEN_KEY)) {
      localStorage.setItem(TOKEN_KEY, BAKED_TOKEN);
    }
  })();

  const ROLE_PERMISSIONS = {
    super_admin:      { label:'VetConnect OS Admin',   color:'#7C3AED', nav:['dashboard','investors','crm','outreach','documents','analytics','deal-room','integrations','settings','admin'], redirectTo:'admin.html' },
    org_admin:        { label:'Organization Admin',    color:'#2563EB', nav:['dashboard','investors','crm','outreach','documents','analytics','deal-room','integrations','settings'],        redirectTo:'index.html' },
    case_manager:     { label:'Case Manager',          color:'#059669', nav:['dashboard','crm','documents'],                                                                                redirectTo:'index.html' },
    property_manager: { label:'Property Manager',      color:'#D97706', nav:['dashboard','documents'],                                                                                     redirectTo:'index.html' },
    finance:          { label:'Finance Team',          color:'#DC2626', nav:['dashboard','analytics','documents'],                                                                          redirectTo:'index.html' },
    investor_lp:      { label:'Investor (LP)',         color:'#0891B2', nav:['deal-room'],                                                                                                  redirectTo:'deal-room.html' },
    volunteer:        { label:'Volunteer',             color:'#6B7280', nav:['dashboard'],                                                                                                  redirectTo:'tasks.html' }
  };

  function getToken() {
    return localStorage.getItem(TOKEN_KEY) || sessionStorage.getItem(TOKEN_KEY) || BAKED_TOKEN;
  }

  function authHeaders() {
    return { 'Authorization': 'Bearer ' + getToken(), 'Content-Type': 'application/json' };
  }

  async function hashPassword(password) {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(password));
    return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2,'0')).join('');
  }

  async function airtableFetch(table, params) {
    params = params || {};
    const url = new URL(`${API_URL}/${encodeURIComponent(table)}`);
    Object.entries(params).forEach(([k,v]) => url.searchParams.append(k,v));
    const res = await fetch(url.toString(), { headers: { 'Authorization': 'Bearer ' + getToken() } });
    if (!res.ok) throw new Error('AIRTABLE_' + res.status);
    return res.json();
  }

  async function login(email, password) {
    try {
      const data = await airtableFetch('Users', {
        filterByFormula: `{email} = "${email.toLowerCase().replace(/"/g,'')}"`,
        maxRecords: 1
      });
      if (!data.records || !data.records.length) return { success:false, message:'No account found with that email.' };
      const record = data.records[0];
      const f = record.fields;
      if (f.status !== 'Active') return { success:false, message:'Your account is inactive. Contact your administrator.' };
      const inputHash = await hashPassword(password);
      if (f.password_hash !== inputHash) return { success:false, message:'Incorrect password. Please try again.' };
      const perms = ROLE_PERMISSIONS[f.role] || ROLE_PERMISSIONS.volunteer;
      const orgName = Array.isArray(f['org_name (from org_id)']) ? f['org_name (from org_id)'][0] : (f.org_name || '');
      const user = {
        id: record.id, full_name: f.full_name, email: f.email,
        role: f.role, org_id: Array.isArray(f.org_id) ? f.org_id[0] : f.org_id,
        org_name: orgName, avatar_url: f.avatar_url || null,
        permissions: perms, loginTime: Date.now()
      };
      sessionStorage.setItem(SESSION_KEY, JSON.stringify(user));
      updateLastLogin(record.id);
      return { success:true, user };
    } catch(err) {
      console.error('Login error:', err);
      return { success:false, message:'Connection error. Please check your internet and try again.' };
    }
  }

  async function updateLastLogin(recordId) {
    try {
      await fetch(`${API_URL}/Users/${recordId}`, {
        method:'PATCH', headers: authHeaders(),
        body: JSON.stringify({ fields:{ last_login: new Date().toISOString() } })
      });
    } catch(_) {}
  }

  function getSession() {
    try {
      const raw = sessionStorage.getItem(SESSION_KEY);
      if (!raw) return null;
      const s = JSON.parse(raw);
      if (Date.now() - s.loginTime > 8 * 60 * 60 * 1000) { logout(); return null; }
      return s;
    } catch(_) { return null; }
  }

  function requireAuth(allowedRoles) {
    const session = getSession();
    if (!session) { window.location.href = 'login.html'; return null; }
    if (allowedRoles && !allowedRoles.includes(session.role)) { window.location.href = 'login.html'; return null; }
    return session;
  }

  function logout() {
    sessionStorage.removeItem(SESSION_KEY);
    window.location.href = 'login.html';
  }

  function canAccess(navItem) {
    const s = getSession();
    if (!s) return false;
    const p = ROLE_PERMISSIONS[s.role];
    return p ? p.nav.includes(navItem) : false;
  }

  function applyRoleNav() {
    const s = getSession();
    if (!s) return;
    const p = ROLE_PERMISSIONS[s.role];
    if (!p) return;
    const NAV_MAP = {
      dashboard:'[data-nav="dashboard"]', investors:'[data-nav="investors"]',
      crm:'[data-nav="crm"]', outreach:'[data-nav="outreach"]',
      documents:'[data-nav="documents"]', analytics:'[data-nav="analytics"]',
      'deal-room':'[data-nav="deal-room"]', integrations:'[data-nav="integrations"]',
      settings:'[data-nav="settings"]', admin:'[data-nav="admin"]'
    };
    Object.entries(NAV_MAP).forEach(([key, sel]) => {
      document.querySelectorAll(sel).forEach(el => {
        const li = el.closest('li') || el;
        li.style.display = p.nav.includes(key) ? '' : 'none';
      });
    });
    const el = (id) => document.getElementById(id);
    if (el('sidebar-user-name'))  el('sidebar-user-name').textContent  = s.full_name;
    if (el('sidebar-user-role'))  el('sidebar-user-role').textContent  = p.label;
    if (el('sidebar-user-org'))   el('sidebar-user-org').textContent   = s.org_name || '';
    if (el('sidebar-role-badge')) { el('sidebar-role-badge').style.background = p.color+'22'; el('sidebar-role-badge').style.color = p.color; el('sidebar-role-badge').textContent = p.label; }
  }

  async function query(table, extraFilter, options) {
    options = options || {};
    const s = getSession();
    if (!s) throw new Error('NOT_AUTHENTICATED');
    const bypassScope = s.role === 'super_admin' && options.allOrgs === true;
    let filter = extraFilter || '';
    if (!bypassScope && s.org_id) {
      const orgFilter = `FIND("${s.org_id}", ARRAYJOIN({org_id}))`;
      filter = filter ? `AND(${orgFilter}, ${filter})` : orgFilter;
    }
    const params = {};
    if (filter) params.filterByFormula = filter;
    if (options.sort)    params['sort[0][field]']     = options.sort;
    if (options.sortDir) params['sort[0][direction]'] = options.sortDir;
    if (options.max)     params.maxRecords             = options.max;
    if (options.view)    params.view                   = options.view;
    return airtableFetch(table, params);
  }

  function setToken(token, persist) {
    const store = persist ? localStorage : sessionStorage;
    store.setItem(TOKEN_KEY, token);
  }

  function hasToken() {
    return !!(localStorage.getItem(TOKEN_KEY) || sessionStorage.getItem(TOKEN_KEY));
  }

  return { login, logout, getSession, requireAuth, canAccess, applyRoleNav, query, setToken, hasToken, ROLE_PERMISSIONS, BASE_ID };
})();
