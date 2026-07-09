// Server-Sync für die Fitness-App (Turso via /api/state) + Passwort-Gate.
(function (FT) {
  const API = '/api/state';
  const SLICE_KEYS = ['profiles', 'weightEntries', 'settings'];
  let authed = false;
  let pw = '';
  try { pw = localStorage.getItem('ft:pw') || ''; } catch (e) { pw = ''; }
  let pushTimer = null;

  async function fetchState(){
    const res = await fetch(API, { headers: { 'x-app-password': pw } });
    if (res.status === 401) { const e = new Error('unauthorized'); e.code = 401; throw e; }
    if (!res.ok) { const e = new Error('http ' + res.status); e.code = res.status; throw e; }
    return res.json();
  }

  async function doPush(){
    if (!authed) return;
    const body = {};
    SLICE_KEYS.forEach(k => { body[k] = FT.state[k]; });
    try {
      await fetch(API, { method: 'POST', headers: { 'content-type': 'application/json', 'x-app-password': pw }, body: JSON.stringify(body) });
    } catch (e) { /* offline — ignore */ }
  }

  function push(){
    if (!authed) return;
    clearTimeout(pushTimer);
    pushTimer = setTimeout(doPush, 600);
  }

  async function reconcile(){
    const server = await fetchState();
    const hasServerData = server && Object.keys(server).length > 0;
    if (hasServerData) {
      SLICE_KEYS.forEach(k => {
        if (server[k] === undefined) return;
        FT.state[k] = server[k];
      });
      try { FT.persist(); } catch (e) {}
      if (FT.reload) FT.reload();
    } else {
      // DB leer -> push local state
      await doPush();
    }
  }

  // Passwort-Overlay (einfacher Dialog)
  let overlay = null;
  function buildOverlay(){
    overlay = document.createElement('div');
    overlay.id = 'pw-gate-ft';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.style.cssText = 'position:fixed;inset:0;z-index:1000;background:var(--bg);display:flex;align-items:center;justify-content:center;padding:24px;';
    overlay.innerHTML = `
<div class="card" style="max-width:360px;width:100%;">
  <p class="sechead" style="margin:0 0 6px;"><i class="ti ti-lock" aria-hidden="true" style="color:var(--accent);"></i> Geschützter Zugang</p>
  <p class="subtext" style="margin:0 0 14px;">Dieser Bereich ist passwortgeschützt. Die Daten werden geräteübergreifend geteilt.</p>
  <input id="pw-input-ft" type="password" placeholder="Passwort" autocomplete="current-password" style="width:100%;margin-bottom:10px;">
  <button id="pw-submit-ft" class="primary wide">Entsperren</button>
  <p id="pw-error-ft" class="subtext" style="margin:10px 0 0;color:var(--neg);min-height:1.2em;"></p>
</div>`;
    document.body.appendChild(overlay);
    const input = overlay.querySelector('#pw-input-ft');
    const btn = overlay.querySelector('#pw-submit-ft');
    const submit = () => tryPassword(input.value, btn);
    btn.addEventListener('click', submit);
    input.addEventListener('keydown', e => { if (e.key === 'Enter') submit(); });
    input.focus();
  }
  function setError(msg){ const e = overlay && overlay.querySelector('#pw-error-ft'); if (e) e.textContent = msg || ''; }
  function removeOverlay(){ if (overlay) { overlay.remove(); overlay = null; } }

  async function tryPassword(value, btn){
    pw = (value || '').trim();
    if (!pw) { setError('Bitte Passwort eingeben.'); return; }
    if (btn) { btn.disabled = true; btn.textContent = 'Prüfe…'; }
    try {
      await fetchState();
      try { localStorage.setItem('ft:pw', pw); } catch (e) {}
      authed = true;
      removeOverlay();
      await reconcile();
    } catch (e) {
      if (btn) { btn.disabled = false; btn.textContent = 'Entsperren'; }
      setError(e.code === 401 ? 'Falsches Passwort.' : 'Verbindungsfehler — später erneut versuchen.');
    }
  }

  async function boot(){
    if (pw) {
      try {
        await fetchState();
        authed = true;
        await reconcile();
        return;
      } catch (e) {
        if (e.code !== 401) return;
        try { localStorage.removeItem('ft:pw'); } catch (er) {}
        pw = '';
      }
    }
    buildOverlay();
  }

  // Expose sync hooks
  if (!FT.sync) FT.sync = { push };
  else FT.sync.push = push;
  boot();
})(window.FT);
