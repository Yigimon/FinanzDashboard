// Server-Sync für den geteilten Finanz-Cockpit-Datensatz (Turso via /api/state) + Passwort-Gate.
// localStorage bleibt Offline-Cache & sofortige UI; der Server ist die geteilte Wahrheit.
(function (FC) {
  const API = 'api/state';
  let authed = false;
  let pw = '';
  try { pw = localStorage.getItem('fc:pw') || ''; } catch (e) { pw = ''; }
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
    FC.SLICE_KEYS.forEach(k => { body[k] = FC.state[k]; });
    try {
      await fetch(API, { method: 'POST', headers: { 'content-type': 'application/json', 'x-app-password': pw }, body: JSON.stringify(body) });
    } catch (e) { /* offline — localStorage bleibt erhalten, nächste Änderung versucht erneut */ }
  }

  // Öffentlich: entprellter Push (aus FC.persist() aufgerufen). No-op bis authentifiziert.
  function push(){
    if (!authed) return;
    clearTimeout(pushTimer);
    pushTimer = setTimeout(doPush, 600);
  }

  async function reconcile(){
    const server = await fetchState();
    const hasServerData = server && Object.keys(server).length > 0;
    if (hasServerData) {
      FC.applyServerState(server);
      if (FC.reload) FC.reload();
    } else {
      // DB leer → aktuellen lokalen Stand als Startbestand hochladen
      await doPush();
    }
  }

  // ---------- Passwort-Overlay ----------
  let overlay = null;
  function buildOverlay(){
    overlay = document.createElement('div');
    overlay.id = 'pw-gate';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.style.cssText = 'position:fixed;inset:0;z-index:1000;background:var(--bg);display:flex;align-items:center;justify-content:center;padding:24px;';
    overlay.innerHTML = `
<div class="card" style="max-width:360px;width:100%;">
  <p class="sechead" style="margin:0 0 6px;"><i class="ti ti-lock" aria-hidden="true" style="color:var(--accent);"></i> Geschützter Zugang</p>
  <p class="subtext" style="margin:0 0 14px;">Dieser Bereich ist passwortgeschützt. Die Daten werden geräteübergreifend geteilt.</p>
  <input id="pw-input" type="password" placeholder="Passwort" autocomplete="current-password" style="width:100%;margin-bottom:10px;">
  <button id="pw-submit" class="primary wide">Entsperren</button>
  <p id="pw-error" class="subtext" style="margin:10px 0 0;color:var(--neg);min-height:1.2em;"></p>
</div>`;
    document.body.appendChild(overlay);
    const input = overlay.querySelector('#pw-input');
    const btn = overlay.querySelector('#pw-submit');
    const submit = () => tryPassword(input.value, btn);
    btn.addEventListener('click', submit);
    input.addEventListener('keydown', e => { if (e.key === 'Enter') submit(); });
    input.focus();
  }
  function setError(msg){ const e = overlay && overlay.querySelector('#pw-error'); if (e) e.textContent = msg || ''; }
  function removeOverlay(){ if (overlay) { overlay.remove(); overlay = null; } }

  async function tryPassword(value, btn){
    pw = (value || '').trim();
    if (!pw) { setError('Bitte Passwort eingeben.'); return; }
    if (btn) { btn.disabled = true; btn.textContent = 'Prüfe…'; }
    try {
      await fetchState();
      try { localStorage.setItem('fc:pw', pw); } catch (e) {}
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
      // Stiller Auto-Login mit gemerktem Passwort
      try {
        await fetchState();
        authed = true;
        await reconcile();
        return;
      } catch (e) {
        // 401 → Passwort ungültig geworden, Gate zeigen.
        // Netzwerkfehler → App läuft offline aus localStorage weiter (kein Zwangs-Gate).
        if (e.code !== 401) return;
        try { localStorage.removeItem('fc:pw'); } catch (er) {}
        pw = '';
      }
    }
    buildOverlay();
  }

  FC.sync = { push, boot };
  boot();
})(window.FC);
