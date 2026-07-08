// Daten: Export/Import als JSON, automatisches Datei-Backup (File System Access API), Zurücksetzen
(function (FC) {
  let fileHandle = null, writeTimer = null;

  function idb(){
    return new Promise((res, rej) => {
      const r = indexedDB.open('fc-backup', 1);
      r.onupgradeneeded = () => r.result.createObjectStore('kv');
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
  }
  async function idbSet(k, v){
    const d = await idb();
    return new Promise((res, rej) => {
      const tx = d.transaction('kv', 'readwrite');
      tx.objectStore('kv').put(v, k);
      tx.oncomplete = res; tx.onerror = () => rej(tx.error);
    });
  }
  async function idbGet(k){
    const d = await idb();
    return new Promise((res, rej) => {
      const tx = d.transaction('kv');
      const rq = tx.objectStore('kv').get(k);
      rq.onsuccess = () => res(rq.result); rq.onerror = () => rej(rq.error);
    });
  }
  async function clearBackupHandle(){
    try {
      await new Promise((res, rej) => {
        const req = indexedDB.deleteDatabase('fc-backup');
        req.onsuccess = res;
        req.onerror = () => rej(req.error);
        req.onblocked = res;
      });
    } catch (e) { /* ignore */ }
  }
  function payload(){
    const s = Object.assign({}, FC.state.settings);
    return JSON.stringify({ app:'finanz-cockpit', version:1, exportiert:new Date().toISOString(),
      items:FC.state.items, cats:FC.state.cats, positions:FC.state.positions, accounts:FC.state.accounts,
      goals:FC.state.goals, history:FC.state.history, years:FC.state.years, settings:s }, null, 2);
  }
  // Gzip-Komprimierung (falls vom Browser unterstützt) für kompakte Backups
  async function gzip(text){
    const cs = new CompressionStream('gzip');
    const blob = await new Response(new Blob([text]).stream().pipeThrough(cs)).blob();
    return blob;
  }
  async function gunzip(arrayBuffer){
    const ds = new DecompressionStream('gzip');
    const blob = await new Response(new Blob([arrayBuffer]).stream().pipeThrough(ds)).blob();
    return blob.text();
  }

  function setStat(txt, ok){
    const el = document.getElementById('dat-status');
    if (el) { el.textContent = txt; el.style.color = ok ? 'var(--pos)' : 'var(--text2)'; }
  }

  function download(blob, filename){
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    URL.revokeObjectURL(a.href);
  }
  function exportData(){
    download(new Blob([payload()], {type:'application/json'}),
      'finanz-cockpit-' + new Date().toISOString().slice(0, 10) + '.json');
  }
  async function exportGz(){
    if (typeof CompressionStream === 'undefined') { setStat('Komprimierung wird von diesem Browser nicht unterstützt — nutze den normalen JSON-Export.'); return; }
    try {
      const blob = await gzip(payload());
      download(blob, 'finanz-cockpit-' + new Date().toISOString().slice(0, 10) + '.json.gz');
      const raw = new Blob([payload()]).size;
      setStat('Komprimiert exportiert: ' + (blob.size / 1024).toFixed(1) + ' KB (statt ' + (raw / 1024).toFixed(1) + ' KB).', true);
    } catch (e) { setStat('Komprimierter Export fehlgeschlagen: ' + e.message); }
  }

  function applyImport(text){
    const d = JSON.parse(text);
    if (d.app !== 'finanz-cockpit' || !Array.isArray(d.items) || !Array.isArray(d.cats))
      throw new Error('Keine gültige Finanz-Cockpit-Datei');
    FC.state.items = d.items;
    FC.state.cats = d.cats;
    FC.state.positions = d.positions || [];
    FC.state.accounts = d.accounts || [];
    FC.state.goals = d.goals || [];
    FC.state.history = d.history || [];
    FC.state.years = d.years || [];
    FC.state.settings = Object.assign({}, FC.state.settings, d.settings || {});
    FC.persist();
    location.reload();
  }
  function importData(file){
    const rd = new FileReader();
    rd.onload = async () => {
      try {
        const buf = new Uint8Array(rd.result);
        // Gzip-Signatur 0x1f 0x8b → dekomprimieren, sonst als Text lesen
        const text = (buf[0] === 0x1f && buf[1] === 0x8b)
          ? await gunzip(rd.result)
          : new TextDecoder().decode(buf);
        applyImport(text);
      } catch (e) {
        setStat('Import fehlgeschlagen: ' + e.message);
      }
    };
    rd.readAsArrayBuffer(file);
  }

  // Automatisches Backup: schreibt bei jeder Datenänderung (entprellt) in die verbundene Datei
  FC.backupWrite = function(){
    if (!fileHandle) return;
    clearTimeout(writeTimer);
    writeTimer = setTimeout(async () => {
      try {
        const w = await fileHandle.createWritable();
        await w.write(payload());
        await w.close();
        setStat('Automatisches Backup gespeichert: ' + new Date().toLocaleTimeString('de-DE') + ' → ' + fileHandle.name, true);
      } catch (e) {
        setStat('Backup fehlgeschlagen: ' + e.message);
      }
    }, 800);
  };

  async function connectBackup(){
    try {
      fileHandle = await window.showSaveFilePicker({
        suggestedName:'finanz-cockpit-backup.json',
        types:[{description:'JSON', accept:{'application/json':['.json']}}]
      });
      await idbSet('handle', fileHandle);
      FC.backupWrite();
    } catch (e) { /* Abbruch durch Nutzer */ }
  }

  async function restoreBackup(){
    if (!('showSaveFilePicker' in window)) return;
    try {
      const h = await idbGet('handle');
      if (!h) return;
      const perm = await h.queryPermission({mode:'readwrite'});
      if (perm === 'granted') {
        fileHandle = h;
        setStat('Automatisches Backup aktiv → ' + h.name, true);
      } else {
        const btn = document.getElementById('dat-reconnect');
        btn.style.display = 'inline-block';
        btn.onclick = async () => {
          if (await h.requestPermission({mode:'readwrite'}) === 'granted') {
            fileHandle = h;
            btn.style.display = 'none';
            setStat('Automatisches Backup reaktiviert → ' + h.name, true);
            FC.backupWrite();
          }
        };
        setStat('Backup-Datei „' + h.name + '" gefunden — Zugriff muss nach dem Neuladen einmal bestätigt werden.');
      }
    } catch (e) { /* IndexedDB nicht verfügbar */ }
  }

  function init(el){
    const fsSupport = 'showSaveFilePicker' in window;
    const gzSupport = typeof CompressionStream !== 'undefined';
    el.innerHTML = `
<div class="card" style="margin-bottom:14px;">
<p class="sechead" style="margin:0 0 8px;"><i class="ti ti-database-export" aria-hidden="true" style="color:var(--accent);"></i> Sichern und übertragen</p>
<p class="subtext">Sichert <b>alles</b>: Posten, Kategorien, Konten, Depot, Ziele, Budgets, die <b>komplette Monats-Historie</b> und <b>abgeschlossene Jahre</b> sowie Einstellungen und API-Schlüssel. Import erkennt normale <b>.json</b>- und komprimierte <b>.json.gz</b>-Dateien automatisch.</p>
<p id="dat-counts" class="subtext" style="margin:-4px 0 10px;"></p>
<div style="display:flex;gap:8px;flex-wrap:wrap;">
<button id="dat-export"><i class="ti ti-download" aria-hidden="true"></i> Als JSON exportieren</button>
${gzSupport ? '<button id="dat-exportgz"><i class="ti ti-file-zip" aria-hidden="true"></i> Komprimiert (.gz)</button>' : ''}
<button id="dat-importbtn"><i class="ti ti-upload" aria-hidden="true"></i> Importieren</button>
<input id="dat-import" type="file" accept=".json,.gz,application/json,application/gzip" style="display:none;">
</div>
</div>
<div class="card" style="margin-bottom:14px;">
<p class="sechead" style="margin:0 0 8px;"><i class="ti ti-refresh" aria-hidden="true" style="color:var(--pos);"></i> Automatisches Datei-Backup</p>
<p class="subtext">${fsSupport
  ? 'Verbinde einmal eine Datei (z. B. im OneDrive-Ordner) — danach schreibt die App jede Änderung automatisch hinein. Über OneDrive sind die Daten damit auch gesichert und synchronisiert.'
  : 'Dein Browser unterstützt die File System Access API nicht (z. B. Firefox/Safari). Nutze auf diesem Gerät den manuellen JSON-Export.'}</p>
${fsSupport ? '<div style="display:flex;gap:8px;flex-wrap:wrap;"><button id="dat-connect" class="primary"><i class="ti ti-plug-connected" aria-hidden="true"></i> Backup-Datei verbinden</button><button id="dat-reconnect" style="display:none;"><i class="ti ti-lock-open" aria-hidden="true"></i> Zugriff bestätigen</button></div>' : ''}
<p id="dat-status" class="subtext" style="margin:10px 0 0;"></p>
</div>
<div class="card" style="margin-bottom:14px;">
<p class="sechead" style="margin:0 0 8px;"><i class="ti ti-tags" aria-hidden="true" style="color:var(--violet);"></i> Kategorien verwalten</p>
<p class="subtext">Ungenutzte Kategorien lassen sich löschen. Kategorien, die noch von Posten genutzt werden, sind gesperrt — so entstehen keine verwaisten Buchungen.</p>
<div id="dat-catman"></div>
</div>
<div class="card">
<p class="sechead" style="margin:0 0 8px;"><i class="ti ti-trash" aria-hidden="true" style="color:var(--neg);"></i> Daten zurücksetzen</p>
<p class="subtext">Leert alle <b>eingetragenen Daten</b> (Posten, Konten, Depot, Ziele, Historie, abgeschlossene Jahre, Budgets). <b>Kategorien</b>, Theme und KI-Schlüssel bleiben erhalten. Direkt danach per „Rückgängig" wiederherstellbar.</p>
<button id="dat-reset">Eingetragene Daten zurücksetzen</button>
</div>`;

    document.getElementById('dat-export').addEventListener('click', exportData);
    if (gzSupport) document.getElementById('dat-exportgz').addEventListener('click', exportGz);
    document.getElementById('dat-importbtn').addEventListener('click', () => document.getElementById('dat-import').click());
    document.getElementById('dat-import').addEventListener('change', e => {
      if (e.target.files[0]) importData(e.target.files[0]);
    });
    if (fsSupport) document.getElementById('dat-connect').addEventListener('click', connectBackup);

    // Kategorie löschen (nur ungenutzte, nie die letzte)
    document.getElementById('dat-catman').addEventListener('click', e => {
      const b = e.target.closest('[data-catdel]');
      if (!b) return;
      const name = b.dataset.catdel;
      if (FC.state.items.some(i => i.cat === name)) return; // Sicherheitsnetz
      if (FC.state.cats.length <= 1) { FC.ui.toast('Mindestens eine Kategorie muss bestehen bleiben.'); return; }
      const idx = FC.state.cats.findIndex(c => c.n === name);
      if (idx < 0) return;
      const removed = FC.state.cats[idx];
      FC.state.cats.splice(idx, 1);
      FC.changed();
      FC.ui.toast('Kategorie „' + name + '" gelöscht', { label: 'Rückgängig', onAction: () => {
        FC.state.cats.splice(Math.min(idx, FC.state.cats.length), 0, removed); FC.changed();
      } });
    });

    document.getElementById('dat-reset').addEventListener('click', () => {
      if (!confirm('Alle eingetragenen Daten zurücksetzen? Kategorien, Theme und KI-Schlüssel bleiben erhalten.')) return;
      const snap = { items: FC.state.items, positions: FC.state.positions, accounts: FC.state.accounts,
        goals: FC.state.goals, history: FC.state.history, years: FC.state.years,
        liquid: FC.state.settings.liquid, budgets: FC.state.settings.budgets };
      FC.state.items = []; FC.state.positions = []; FC.state.accounts = [];
      FC.state.goals = []; FC.state.history = []; FC.state.years = [];
      FC.state.settings.liquid = 0; FC.state.settings.budgets = {};
      FC.changed();
      FC.ui.toast('Alle eingetragenen Daten zurückgesetzt', { duration: 9000, label: 'Rückgängig', onAction: () => {
        FC.state.items = snap.items; FC.state.positions = snap.positions; FC.state.accounts = snap.accounts;
        FC.state.goals = snap.goals; FC.state.history = snap.history; FC.state.years = snap.years;
        FC.state.settings.liquid = snap.liquid; FC.state.settings.budgets = snap.budgets;
        FC.changed();
      } });
    });
    restoreBackup();
    render();
  }

  function render(){
    const cEl = document.getElementById('dat-counts');
    if (cEl) {
      const bytes = new Blob([payload()]).size;
      cEl.textContent = `Aktuell: ${FC.state.items.length} Posten, ${FC.state.accounts.length} Konten, ${FC.state.positions.length} Depot-Positionen, ${FC.state.history.length} Monate Historie, ${FC.state.years.length} abgeschlossene Jahre — Dateigröße ≈ ${(bytes / 1024).toFixed(1)} KB.`;
    }
    const cm = document.getElementById('dat-catman');
    if (cm) {
      const esc = FC.ui.esc;
      cm.innerHTML = FC.sortedCats().map(c => {
        const used = FC.state.items.filter(i => i.cat === c.n).length;
        return `<div class="catmanrow">
<i class="ti ${c.i}" aria-hidden="true" style="color:var(--text2);font-size:18px;"></i>
<span>${esc(c.n)}</span>
<span class="chip">${used > 0 ? used + ' Posten' : 'ungenutzt'}</span>
${used > 0
  ? '<button class="iconbtn" disabled title="Wird von ' + used + ' Posten genutzt" style="opacity:.35;cursor:not-allowed;"><i class="ti ti-trash" style="font-size:16px"></i></button>'
  : '<button class="iconbtn" data-catdel="' + esc(c.n) + '" aria-label="Kategorie löschen"><i class="ti ti-trash" style="font-size:16px"></i></button>'}
</div>`;
      }).join('');
    }
  }

  FC.views.daten = { init, render };
})(window.FC);
