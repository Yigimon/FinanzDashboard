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
  // API-Schlüssel bleibt bewusst außen vor — er gehört nicht in Export-Dateien
  function payload(){
    const s = Object.assign({}, FC.state.settings);
    delete s.apiKey;
    return JSON.stringify({ app:'finanz-cockpit', version:1, exportiert:new Date().toISOString(),
      items:FC.state.items, cats:FC.state.cats, positions:FC.state.positions,
      goals:FC.state.goals, history:FC.state.history, years:FC.state.years, settings:s }, null, 2);
  }

  function setStat(txt, ok){
    const el = document.getElementById('dat-status');
    if (el) { el.textContent = txt; el.style.color = ok ? 'var(--pos)' : 'var(--text2)'; }
  }

  function exportData(){
    const blob = new Blob([payload()], {type:'application/json'});
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'finanz-cockpit-' + new Date().toISOString().slice(0, 10) + '.json';
    a.click();
    URL.revokeObjectURL(a.href);
  }

  function importData(file){
    const rd = new FileReader();
    rd.onload = () => {
      try {
        const d = JSON.parse(rd.result);
        if (d.app !== 'finanz-cockpit' || !Array.isArray(d.items) || !Array.isArray(d.cats))
          throw new Error('Keine gültige Finanz-Cockpit-Datei');
        FC.state.items = d.items;
        FC.state.cats = d.cats;
        FC.state.positions = d.positions || [];
        FC.state.goals = d.goals || [];
        FC.state.history = d.history || [];
        FC.state.years = d.years || [];
        FC.state.settings = Object.assign({}, FC.state.settings, d.settings || {});
        FC.persist();
        location.reload();
      } catch (e) {
        setStat('Import fehlgeschlagen: ' + e.message);
      }
    };
    rd.readAsText(file);
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
    el.innerHTML = `
<div class="card" style="margin-bottom:14px;">
<p class="sechead" style="margin:0 0 8px;"><i class="ti ti-database-export" aria-hidden="true" style="color:var(--accent);"></i> Sichern und übertragen</p>
<p class="subtext">Sichert <b>alles</b>: Posten, Kategorien, Depot, Ziele, Budgets, die <b>komplette Monats-Historie</b> und <b>abgeschlossene Jahre</b> (fortlaufend, ohne Limit) sowie Einstellungen. Der API-Schlüssel wird aus Sicherheitsgründen nie mit exportiert.</p>
<p id="dat-counts" class="subtext" style="margin:-4px 0 10px;"></p>
<div style="display:flex;gap:8px;flex-wrap:wrap;">
<button id="dat-export"><i class="ti ti-download" aria-hidden="true"></i> Als JSON exportieren</button>
<button id="dat-importbtn"><i class="ti ti-upload" aria-hidden="true"></i> Aus JSON importieren</button>
<input id="dat-import" type="file" accept=".json,application/json" style="display:none;">
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
<div class="card">
<p class="sechead" style="margin:0 0 8px;"><i class="ti ti-trash" aria-hidden="true" style="color:var(--neg);"></i> Zurücksetzen</p>
<p class="subtext">Löscht alle Daten in diesem Browser und lädt die Beispieldaten neu. Vorher exportieren!</p>
<button id="dat-reset">Alle Daten löschen</button>
</div>`;

    document.getElementById('dat-export').addEventListener('click', exportData);
    document.getElementById('dat-importbtn').addEventListener('click', () => document.getElementById('dat-import').click());
    document.getElementById('dat-import').addEventListener('change', e => {
      if (e.target.files[0]) importData(e.target.files[0]);
    });
    const bytes = new Blob([payload()]).size;
    document.getElementById('dat-counts').textContent =
      `Aktuell: ${FC.state.items.length} Posten, ${FC.state.history.length} Monate Historie, ${FC.state.years.length} abgeschlossene Jahre, ${FC.state.positions.length} Depot-Positionen — Dateigröße ≈ ${(bytes / 1024).toFixed(1)} KB.`;
    if (fsSupport) document.getElementById('dat-connect').addEventListener('click', connectBackup);
    document.getElementById('dat-reset').addEventListener('click', async () => {
      if (confirm('Wirklich alle Daten löschen? Das kann nicht rückgängig gemacht werden.')) {
        ['items','cats','positions','goals','history','years','settings'].forEach(k => localStorage.removeItem('fc:' + k));
        await clearBackupHandle();
        location.reload();
      }
    });
    restoreBackup();
  }

  FC.views.daten = { init, render(){} };
})(window.FC);
