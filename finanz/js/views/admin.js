// Admin: Nutzerverwaltung (nur sichtbar für Account "admin")
(function (FC) {
  const { esc, toast } = FC.ui;
  const TABLE_LABEL = { items:'Posten', categories:'Kategorien', positions:'Depot', accounts:'Konten', goals:'Ziele', history:'Historie', years:'Jahre', settings:'Einstellungen' };

  function init(el){
    el.innerHTML = `
<div class="card" style="margin-bottom:14px;">
<p class="subtext">Nur für den Account „admin" sichtbar. Zeigt alle registrierten Konten mit Datenmengen; Löschen entfernt einen Account inkl. aller Daten unwiderruflich.</p>
</div>
<div id="adm-list" class="list"></div>`;
    el.addEventListener('click', e => {
      const b = e.target.closest('[data-admdel]');
      if (!b) return;
      const id = Number(b.dataset.admdel), name = b.dataset.admname;
      if (!confirm('Account „' + name + '" und ALLE seine Daten unwiderruflich löschen?')) return;
      deleteUser(id, name);
    });
    render();
  }

  async function fetchUsers(){
    const res = await fetch('/api/admin', { headers: FC.authHeaders() });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return (await res.json()).users;
  }

  async function deleteUser(id, name){
    try {
      const res = await fetch('/api/admin', { method:'POST', headers: FC.authHeaders(),
        body: JSON.stringify({ action:'delete-user', userId:id }) });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || ('HTTP ' + res.status));
      toast('Account „' + name + '" gelöscht');
      render();
    } catch (e) { toast('Löschen fehlgeschlagen: ' + e.message); }
  }

  function countsLine(counts){
    return Object.entries(counts)
      .filter(([, n]) => n > 0)
      .map(([k, n]) => n + ' ' + (TABLE_LABEL[k] || k))
      .join(' · ') || 'keine Daten';
  }

  async function render(){
    const list = document.getElementById('adm-list');
    if (!list) return;
    list.innerHTML = '<p class="empty">Lade…</p>';
    let users;
    try { users = await fetchUsers(); }
    catch (e) { list.innerHTML = '<p class="empty">Laden fehlgeschlagen: ' + esc(e.message) + '</p>'; return; }

    list.innerHTML = users.map(u => {
      const created = u.createdAt ? new Date(u.createdAt).toLocaleDateString('de-DE') : '—';
      const isSelf = u.username === 'admin';
      return `<div class="itemcard">
<span class="ic" style="background:color-mix(in srgb,var(--accent) 13%,transparent);color:var(--accent);"><i class="ti ti-user" aria-hidden="true"></i></span>
<span class="mid"><span class="nm">${esc(u.username)}${isSelf ? ' <span class="chip">du</span>' : ''}</span>
<span class="sb">seit ${created} · v${u.version} · ${esc(countsLine(u.counts))}</span></span>
${isSelf ? '' : `<button class="iconbtn" data-admdel="${u.id}" data-admname="${esc(u.username)}" aria-label="Löschen"><i class="ti ti-trash" style="font-size:17px"></i></button>`}
</div>`;
    }).join('') || '<p class="empty">Keine Nutzer.</p>';
  }

  FC.views.admin = { init, render };
})(window.FC);
