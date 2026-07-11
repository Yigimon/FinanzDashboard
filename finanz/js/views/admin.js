// Admin: Nutzerverwaltung, System-Einstellungen, Backup, Audit (nur Account "admin").
(function (FC) {
  const { esc, toast } = FC.ui;
  const TL = { items:'Posten', categories:'Kategorien', positions:'Depot', accounts:'Konten', goals:'Ziele', history:'Historie', years:'Jahre', settings:'Einstell.' };
  let data = null;

  function init(el){
    el.innerHTML = `
<div class="grid-tiles" id="adm-stats" style="margin-bottom:16px;"></div>

<p class="sechead" style="margin-top:0;">System</p>
<div class="card" style="margin-bottom:16px;">
  <label class="lbl" style="flex-direction:row;align-items:center;gap:10px;margin-bottom:10px;"><input type="checkbox" id="set-reg" style="width:auto;min-height:0;"> Registrierung neuer Konten erlaubt</label>
  <label class="lbl" style="flex-direction:row;align-items:center;gap:10px;margin-bottom:14px;"><input type="checkbox" id="set-seed" style="width:auto;min-height:0;"> Neue Konten mit Demo-Daten starten</label>
  <div style="display:flex;gap:8px;flex-wrap:wrap;">
    <button id="adm-export"><i class="ti ti-download" aria-hidden="true"></i> DB exportieren</button>
    <button id="adm-importbtn"><i class="ti ti-upload" aria-hidden="true"></i> DB importieren</button>
    <input id="adm-import" type="file" accept="application/json,.json" style="display:none;">
    <button id="adm-cleanup"><i class="ti ti-eraser" aria-hidden="true"></i> Verwaiste Daten aufräumen</button>
  </div>
</div>

<p class="sechead">Nutzer</p>
<div id="adm-users" class="list" style="margin-bottom:16px;"></div>

<p class="sechead">Fehlgeschlagene Logins</p>
<div class="card" id="adm-failed" style="margin-bottom:16px;"></div>

<p class="sechead">Audit-Log</p>
<div class="card" id="adm-audit"></div>`;

    el.addEventListener('click', onClick);
    document.getElementById('set-reg').addEventListener('change', e => setSetting('registration_enabled', e.target.checked));
    document.getElementById('set-seed').addEventListener('change', e => setSetting('seed_new_users', e.target.checked));
    document.getElementById('adm-export').addEventListener('click', exportDb);
    document.getElementById('adm-importbtn').addEventListener('click', () => document.getElementById('adm-import').click());
    document.getElementById('adm-import').addEventListener('change', e => { if (e.target.files[0]) importDb(e.target.files[0]); });
    document.getElementById('adm-cleanup').addEventListener('click', cleanup);
    render();
  }

  async function api(method, body){
    const opt = { method, headers: FC.authHeaders() };
    if (body) opt.body = JSON.stringify(body);
    const res = await fetch('/api/admin', opt);
    const j = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(j.error || ('HTTP ' + res.status));
    return j;
  }

  async function post(body, okMsg){
    try { await api('POST', body); if (okMsg) toast(okMsg); await render(); }
    catch (e) { toast('Fehler: ' + e.message); }
  }
  const setSetting = (key, value) => post({ action:'set-setting', key, value }, 'Gespeichert');

  function onClick(e){
    const b = e.target.closest('[data-act]');
    if (!b) return;
    const id = Number(b.dataset.id), name = b.dataset.name, act = b.dataset.act;
    if (act === 'delete') { if (confirm('Account „' + name + '" + ALLE Daten löschen?')) post({ action:'delete-user', userId:id }, 'Gelöscht'); }
    else if (act === 'block') post({ action:'set-blocked', userId:id, blocked:true }, 'Gesperrt');
    else if (act === 'unblock') post({ action:'set-blocked', userId:id, blocked:false }, 'Entsperrt');
    else if (act === 'kick') post({ action:'kick-sessions', userId:id }, 'Sessions beendet');
    else if (act === 'rename') { const nn = prompt('Neuer Benutzername für „' + name + '":', name); if (nn && nn.trim()) post({ action:'rename-user', userId:id, newName:nn.trim() }, 'Umbenannt'); }
    else if (act === 'resetpw') { const pw = prompt('Neues Passwort für „' + name + '" (min. 6):'); if (pw) post({ action:'reset-password', userId:id, newPassword:pw }, 'Passwort gesetzt'); }
    else if (act === 'impersonate') impersonate(id, name);
  }

  async function impersonate(id, name){
    if (!confirm('Als „' + name + '" anmelden (Admin-Ansicht)? Deine Admin-Sitzung bleibt gespeichert.')) return;
    try {
      const j = await api('POST', { action:'impersonate', userId:id });
      const adminTok = localStorage.getItem('fc:token');
      localStorage.setItem('fc:admintoken', adminTok);
      localStorage.setItem('fc:token', j.token);
      FC.clearCache();
      location.reload();
    } catch (e) { toast('Fehler: ' + e.message); }
  }

  async function exportDb(){
    try {
      const dump = await api('POST', { action:'export-db' });
      const blob = new Blob([JSON.stringify(dump)], { type:'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'finanz-db-' + new Date().toISOString().slice(0,10) + '.json';
      a.click(); URL.revokeObjectURL(a.href);
      toast('Export erstellt');
    } catch (e) { toast('Export fehlgeschlagen: ' + e.message); }
  }

  function importDb(file){
    if (!confirm('Import ersetzt ALLE Konten und Daten (außer aktive Sessions). Fortfahren?')) return;
    const rd = new FileReader();
    rd.onload = async () => {
      try {
        const dump = JSON.parse(rd.result);
        await api('POST', { action:'import-db', dump });
        toast('Import ok — ggf. neu anmelden');
        await render();
      } catch (e) { toast('Import fehlgeschlagen: ' + e.message); }
    };
    rd.readAsText(file);
  }

  function cleanup(){
    post({ action:'cleanup-orphans' }, 'Aufgeräumt');
  }

  function ts(v){ return v ? new Date(v).toLocaleString('de-DE') : '—'; }
  function countsLine(c){ return Object.entries(c).filter(([,n]) => n>0).map(([k,n]) => n+' '+(TL[k]||k)).join(' · ') || 'keine Daten'; }

  async function render(){
    try { data = await api('GET'); }
    catch (e) { document.getElementById('adm-users').innerHTML = '<p class="empty">Laden fehlgeschlagen: ' + esc(e.message) + '</p>'; return; }

    // Statistik
    const t = data.stats.totals;
    document.getElementById('adm-stats').innerHTML =
      FC.ui.tile('Konten', String(data.stats.userCount), '') +
      FC.ui.tile('Posten gesamt', String(t.items), '') +
      FC.ui.tile('Konten (Bank)', String(t.accounts), '') +
      FC.ui.tile('Depot-Pos.', String(t.positions), '');

    // Settings
    document.getElementById('set-reg').checked = !!data.settings.registration_enabled;
    document.getElementById('set-seed').checked = !!data.settings.seed_new_users;

    // Nutzer
    document.getElementById('adm-users').innerHTML = data.users.map(u => {
      const self = u.username === 'admin';
      const acts = [
        `<button class="iconbtn" data-act="impersonate" data-id="${u.id}" data-name="${esc(u.username)}" title="Als Nutzer ansehen" aria-label="Ansehen"><i class="ti ti-eye" style="font-size:17px"></i></button>`,
        `<button class="iconbtn" data-act="resetpw" data-id="${u.id}" data-name="${esc(u.username)}" title="Passwort zurücksetzen" aria-label="Passwort"><i class="ti ti-key" style="font-size:17px"></i></button>`,
        `<button class="iconbtn" data-act="rename" data-id="${u.id}" data-name="${esc(u.username)}" title="Umbenennen" aria-label="Umbenennen"><i class="ti ti-edit" style="font-size:17px"></i></button>`,
        u.sessions ? `<button class="iconbtn" data-act="kick" data-id="${u.id}" data-name="${esc(u.username)}" title="Sessions beenden" aria-label="Kick"><i class="ti ti-plug-off" style="font-size:17px"></i></button>` : '',
        self ? '' : `<button class="iconbtn" data-act="${u.blocked ? 'unblock' : 'block'}" data-id="${u.id}" data-name="${esc(u.username)}" title="${u.blocked ? 'Entsperren' : 'Sperren'}" aria-label="Sperren"><i class="ti ti-${u.blocked ? 'lock-open' : 'lock'}" style="font-size:17px"></i></button>`,
        self ? '' : `<button class="iconbtn" data-act="delete" data-id="${u.id}" data-name="${esc(u.username)}" title="Löschen" aria-label="Löschen"><i class="ti ti-trash" style="font-size:17px"></i></button>`
      ].join('');
      const badges = (self ? ' <span class="chip">du</span>' : '') + (u.blocked ? ' <span class="chip" style="background:color-mix(in srgb,var(--neg) 15%,transparent);color:var(--neg);">gesperrt</span>' : '');
      return `<div class="itemcard">
<span class="ic" style="background:color-mix(in srgb,var(--accent) 13%,transparent);color:var(--accent);"><i class="ti ti-user" aria-hidden="true"></i></span>
<span class="mid"><span class="nm">${esc(u.username)}${badges}</span>
<span class="sb">letzter Login ${ts(u.lastLogin)} · ${u.sessions} Session(s) · ${esc(countsLine(u.counts))}</span></span>
${acts}</div>`;
    }).join('');

    // Fehl-Logins
    document.getElementById('adm-failed').innerHTML = data.failedLogins.length
      ? data.failedLogins.map(f => `<div style="display:flex;justify-content:space-between;font-size:12.5px;padding:3px 0;color:var(--text2);"><span>${esc(f.username || '—')}</span><span class="num">${ts(f.ts)}</span></div>`).join('')
      : '<p class="empty" style="margin:0;">Keine fehlgeschlagenen Logins.</p>';

    // Audit
    document.getElementById('adm-audit').innerHTML = data.audit.length
      ? data.audit.map(a => `<div style="display:flex;gap:10px;font-size:12.5px;padding:3px 0;color:var(--text2);"><span class="num" style="flex-shrink:0;">${ts(a.ts)}</span><span><b>${esc(a.action)}</b> ${esc(a.target || '')} ${a.detail ? '('+esc(a.detail)+')' : ''}</span></div>`).join('')
      : '<p class="empty" style="margin:0;">Kein Audit-Log.</p>';
  }

  FC.views.admin = { init, render };
})(window.FC);
