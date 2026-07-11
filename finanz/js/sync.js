// Auth + Server-Sync für das Finanz-Cockpit (Accounts, /api/finance, Live-Sync-Polling, Konflikte).
// localStorage bleibt Offline-Cache & sofortige UI; der Server (pro Nutzer) ist die Wahrheit.
(function (FC) {
  const AUTH = '/api/auth';
  const FIN = '/api/finance';
  const POLL_MS = 15000;

  let token = '';
  try { token = localStorage.getItem('fc:token') || ''; } catch (e) { token = ''; }
  let username = '';
  let version = 0;
  let authed = false;
  let allowSeed = true;
  let pushTimer = null, pushPending = false, pollTimer = null;

  const authHeaders = () => ({ 'content-type': 'application/json', 'Authorization': 'Bearer ' + token });

  // Antwort als JSON lesen; liefert der Server HTML (z.B. 404 ohne laufende API), klare Meldung
  // statt "Unexpected token '<'".
  async function jsonOrThrow(res){
    const text = await res.text();
    try { return JSON.parse(text); }
    catch (e) { throw new Error('API nicht erreichbar (HTTP ' + res.status + '). Läuft das Deployment mit /api-Functions?'); }
  }

  async function fetchState(){
    const res = await fetch(FIN, { headers: authHeaders() });
    if (res.status === 401) { const e = new Error('unauthorized'); e.code = 401; throw e; }
    if (!res.ok) { const e = new Error('http ' + res.status); e.code = res.status; throw e; }
    return res.json();
  }

  function hasData(s){
    return ['items','cats','positions','accounts','goals','history','years']
      .some(k => Array.isArray(s[k]) && s[k].length > 0);
  }

  // Server-Stand übernehmen (aus GET oder aus 409-Antwort).
  function applyState(s){
    version = typeof s.version === 'number' ? s.version : version;
    FC.applyServerState(s);
    if (FC.reload) FC.reload();
  }

  // Konflikt-Merge: Server-Basis + lokale Änderungen nach Schlüssel vereinen, damit weder
  // fremde noch eigene Einträge verloren gehen (bei gleichem Schlüssel gewinnt lokal).
  // Bekannte Grenze: gleichzeitige Löschungen propagieren nicht (kein Tombstone).
  const MERGE_KEY = { items:'id', positions:'id', accounts:'id', goals:'id', cats:'n', history:'month', years:'year' };
  function mergeStates(server, local){
    const out = {};
    Object.keys(MERGE_KEY).forEach(slice => {
      const key = MERGE_KEY[slice];
      const map = new Map();
      (Array.isArray(server[slice]) ? server[slice] : []).forEach(x => map.set(x[key], x));
      (Array.isArray(local[slice]) ? local[slice] : []).forEach(x => map.set(x[key], x));
      out[slice] = [...map.values()];
    });
    out.settings = Object.assign({}, server.settings || {}, local.settings || {});
    out.version = server.version;
    return out;
  }

  async function doPush(retries){
    if (!authed) { pushPending = false; return; }
    const body = { baseVersion: version };
    FC.SLICE_KEYS.forEach(k => { body[k] = FC.state[k]; });
    try {
      const res = await fetch(FIN, { method: 'POST', headers: authHeaders(), body: JSON.stringify(body) });
      if (res.status === 409) {
        // Konflikt: jemand anderes hat inzwischen geschrieben. Server-Stand mit unseren
        // lokalen Änderungen mergen (beide bleiben erhalten), dann den Merge hochladen.
        const server = await res.json();
        const merged = mergeStates(server, FC.state);
        applyState(merged);
        if ((retries || 0) < 3) return doPush((retries || 0) + 1);
      } else if (res.ok) {
        const j = await res.json();
        if (typeof j.version === 'number') version = j.version;
      } else if (res.status === 401) {
        handleAuthLost();
      }
    } catch (e) { /* offline — localStorage bleibt, nächste Änderung versucht erneut */ }
    pushPending = false;
  }

  // Öffentlich: entprellter Push (aus FC.persist()). No-op bis authentifiziert.
  function push(){
    if (!authed) return;
    pushPending = true;
    clearTimeout(pushTimer);
    pushTimer = setTimeout(() => doPush(0), 600);
  }

  // Live-Sync: regelmäßig prüfen, ob ein anderes Gerät geschrieben hat.
  function startPolling(){
    if (pollTimer) return;
    pollTimer = setInterval(async () => {
      if (!authed || pushPending) return;
      try {
        const s = await fetchState();
        if (typeof s.version === 'number' && s.version > version) applyState(s);
      } catch (e) { if (e.code === 401) handleAuthLost(); }
    }, POLL_MS);
  }

  // Nach erfolgreichem Login/Registrierung: Server-Stand laden (oder neuen Account seeden).
  async function afterAuth(){
    authed = true;
    // Silent-Boot mit gespeichertem Token kennt username noch nicht — nachladen.
    if (!username) {
      try {
        const me = await (await fetch(AUTH, { method: 'POST', headers: authHeaders(),
          body: JSON.stringify({ action: 'me' }) })).json();
        username = me.username || '';
      } catch (e) { /* egal, dann bleibt Admin-Bereich verborgen */ }
    }
    FC.isAdmin = username === 'admin';
    const nav = document.getElementById('nav-admin');
    const navGroup = document.getElementById('navgroup-admin');
    if (nav) nav.hidden = !FC.isAdmin;
    if (navGroup) navGroup.hidden = !FC.isAdmin;
    const server = await fetchState();
    if (hasData(server)) {
      applyState(server);
    } else {
      // Leerer Account → seeden (Demo) oder leer starten (seed_new_users=aus).
      version = typeof server.version === 'number' ? server.version : 0;
      if (allowSeed !== false) FC.applySeed(); else FC.applyEmpty();
      if (FC.reload) FC.reload();
      await doPush(0);
    }
    removeOverlay();
    showImpersonationBanner();
    startPolling();
  }

  // Admin-Impersonation: liegt ein gemerkter Admin-Token vor, Rückkehr-Leiste zeigen.
  function showImpersonationBanner(){
    let adminTok = '';
    try { adminTok = localStorage.getItem('fc:admintoken') || ''; } catch (e) {}
    if (!adminTok || document.getElementById('imp-banner')) return;
    const bar = document.createElement('div');
    bar.id = 'imp-banner';
    bar.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:900;background:var(--warn);color:#fff;padding:6px 12px;font-size:13px;display:flex;align-items:center;justify-content:center;gap:12px;';
    bar.innerHTML = 'Angemeldet als <b>' + esc(username) + '</b> (Admin-Ansicht) <button id="imp-back" style="min-height:0;padding:3px 10px;background:#fff;color:var(--warn);border:none;border-radius:6px;font-weight:600;cursor:pointer;">Zurück zu Admin</button>';
    document.body.appendChild(bar);
    document.getElementById('imp-back').addEventListener('click', () => {
      try {
        localStorage.setItem('fc:token', adminTok);
        localStorage.removeItem('fc:admintoken');
      } catch (e) {}
      FC.clearCache();
      location.reload();
    });
  }

  function handleAuthLost(){
    authed = false;
    token = '';
    try { localStorage.removeItem('fc:token'); } catch (e) {}
    if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
    showAuthForm('Sitzung abgelaufen — bitte erneut anmelden.');
  }

  // ---------- Overlay: Ladezustand → Login/Registrierung ----------
  let overlay = null;
  function buildOverlay(){
    overlay = document.createElement('div');
    overlay.id = 'auth-gate';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.style.cssText = 'position:fixed;inset:0;z-index:1000;background:var(--bg);display:flex;align-items:center;justify-content:center;padding:24px;';
    overlay.innerHTML = '<div class="card" style="max-width:360px;width:100%;text-align:center;color:var(--text2);"><i class="ti ti-loader-2" style="font-size:22px;"></i><p class="subtext" style="margin:10px 0 0;">Lade…</p></div>';
    document.body.appendChild(overlay);
  }
  function removeOverlay(){ if (overlay) { overlay.remove(); overlay = null; } }

  let mode = 'login';
  function showAuthForm(msg){
    if (!overlay) buildOverlay();
    const isLogin = mode === 'login';
    overlay.innerHTML = `
<div class="card" style="max-width:360px;width:100%;">
  <p class="sechead" style="margin:0 0 6px;"><i class="ti ti-user-shield" aria-hidden="true" style="color:var(--accent);"></i> ${isLogin ? 'Anmelden' : 'Registrieren'}</p>
  <p class="subtext" style="margin:0 0 14px;">${isLogin ? 'Melde dich mit deinem Konto an.' : 'Lege ein neues Konto an — deine Daten sind privat.'}</p>
  <input id="au-user" placeholder="Benutzername" autocomplete="username" style="width:100%;margin-bottom:10px;">
  <input id="au-pass" type="password" placeholder="Passwort" autocomplete="${isLogin ? 'current-password' : 'new-password'}" style="width:100%;margin-bottom:10px;">
  <button id="au-submit" class="primary wide">${isLogin ? 'Anmelden' : 'Konto erstellen'}</button>
  <p id="au-error" class="subtext" style="margin:10px 0 0;color:var(--neg);min-height:1.2em;">${msg ? esc(msg) : ''}</p>
  <p class="subtext" style="margin:12px 0 0;text-align:center;">
    ${isLogin ? 'Noch kein Konto?' : 'Schon ein Konto?'}
    <a id="au-toggle" href="#" style="color:var(--accent);">${isLogin ? 'Registrieren' : 'Anmelden'}</a>
  </p>
</div>`;
    const user = overlay.querySelector('#au-user');
    const pass = overlay.querySelector('#au-pass');
    const btn = overlay.querySelector('#au-submit');
    const submit = () => doAuth(user.value, pass.value, btn);
    btn.addEventListener('click', submit);
    pass.addEventListener('keydown', e => { if (e.key === 'Enter') submit(); });
    user.addEventListener('keydown', e => { if (e.key === 'Enter') pass.focus(); });
    overlay.querySelector('#au-toggle').addEventListener('click', e => { e.preventDefault(); mode = isLogin ? 'register' : 'login'; showAuthForm(); });
    user.focus();
  }
  function setAuthError(msg){ const e = overlay && overlay.querySelector('#au-error'); if (e) e.textContent = msg || ''; }
  function esc(s){ return String(s).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])); }

  async function doAuth(user, pass, btn){
    user = (user || '').trim();
    if (!user || !pass) { setAuthError('Benutzername und Passwort eingeben.'); return; }
    if (btn) { btn.disabled = true; btn.textContent = 'Bitte warten…'; }
    try {
      const res = await fetch(AUTH, { method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: mode, username: user, password: pass }) });
      const j = await jsonOrThrow(res);
      if (!res.ok) throw new Error(j.error || ('HTTP ' + res.status));
      token = j.token; username = j.username;
      if (mode === 'register') allowSeed = j.seed !== false;
      try { localStorage.setItem('fc:token', token); } catch (e) {}
      await afterAuth();
    } catch (e) {
      if (btn) { btn.disabled = false; btn.textContent = mode === 'login' ? 'Anmelden' : 'Konto erstellen'; }
      setAuthError(e.message || 'Fehlgeschlagen.');
    }
  }

  // ---------- Logout ----------
  FC.logout = async function(){
    try { await fetch(AUTH, { method: 'POST', headers: authHeaders(), body: JSON.stringify({ action: 'logout' }) }); } catch (e) {}
    try { localStorage.removeItem('fc:token'); } catch (e) {}
    FC.clearCache();
    location.reload();
  };

  async function boot(){
    buildOverlay();
    if (token) {
      try {
        await afterAuth(); // validiert Token via GET und lädt/seedet
        return;
      } catch (e) {
        if (e.code === 401) { token = ''; try { localStorage.removeItem('fc:token'); } catch (er) {} }
        else { removeOverlay(); return; } // Netzwerkfehler → offline aus localStorage weiterarbeiten
      }
    }
    showAuthForm();
  }

  FC.sync = { push };
  FC.authHeaders = authHeaders;
  boot();
})(window.FC);
