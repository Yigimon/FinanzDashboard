// Daten: Export/Import als JSON (+ komprimiert), Zurücksetzen
(function (FT) {
  function payload(){
    return JSON.stringify({ app:'fitness-tracker', version:1, exportiert:new Date().toISOString(),
      profiles:FT.state.profiles, weightEntries:FT.state.weightEntries, settings:FT.state.settings }, null, 2);
  }
  async function gzip(text){
    const cs = new CompressionStream('gzip');
    return new Response(new Blob([text]).stream().pipeThrough(cs)).blob();
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
      'fitness-tracker-' + new Date().toISOString().slice(0, 10) + '.json');
  }
  async function exportGz(){
    if (typeof CompressionStream === 'undefined') { setStat('Komprimierung wird von diesem Browser nicht unterstützt — nutze den normalen JSON-Export.'); return; }
    try {
      const blob = await gzip(payload());
      download(blob, 'fitness-tracker-' + new Date().toISOString().slice(0, 10) + '.json.gz');
      const raw = new Blob([payload()]).size;
      setStat('Komprimiert exportiert: ' + (blob.size / 1024).toFixed(1) + ' KB (statt ' + (raw / 1024).toFixed(1) + ' KB).', true);
    } catch (e) { setStat('Komprimierter Export fehlgeschlagen: ' + e.message); }
  }
  function applyImport(text){
    const d = JSON.parse(text);
    if (d.app !== 'fitness-tracker' || !Array.isArray(d.profiles))
      throw new Error('Keine gültige Fitness-Tracker-Datei');
    FT.state.profiles = d.profiles;
    FT.state.weightEntries = d.weightEntries || [];
    FT.state.settings = Object.assign({}, FT.state.settings, d.settings || {});
    FT.persist();
    location.reload();
  }
  function importData(file){
    const rd = new FileReader();
    rd.onload = async () => {
      try {
        const buf = new Uint8Array(rd.result);
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

  function init(el){
    const gzSupport = typeof CompressionStream !== 'undefined';
    el.innerHTML = `
<div class="card" style="margin-bottom:14px;">
<p class="sechead" style="margin:0 0 8px;"><i class="ti ti-database-export" aria-hidden="true" style="color:var(--accent);"></i> Sichern und übertragen</p>
<p class="subtext">Sichert alle Profile und Gewichtseinträge. Import erkennt normale <b>.json</b>- und komprimierte <b>.json.gz</b>-Dateien automatisch.</p>
<div style="display:flex;gap:8px;flex-wrap:wrap;">
<button id="dat-export"><i class="ti ti-download" aria-hidden="true"></i> Als JSON exportieren</button>
${gzSupport ? '<button id="dat-exportgz"><i class="ti ti-file-zip" aria-hidden="true"></i> Komprimiert (.gz)</button>' : ''}
<button id="dat-importbtn"><i class="ti ti-upload" aria-hidden="true"></i> Importieren</button>
<input id="dat-import" type="file" accept=".json,.gz,application/json,application/gzip" style="display:none;">
</div>
<p id="dat-status" class="subtext" style="margin:10px 0 0;"></p>
</div>
<div class="card">
<p class="sechead" style="margin:0 0 8px;"><i class="ti ti-trash" aria-hidden="true" style="color:var(--neg);"></i> Daten zurücksetzen</p>
<p class="subtext">Leert alle Profile und Gewichtseinträge. Direkt danach per „Rückgängig" wiederherstellbar.</p>
<button id="dat-reset">Alle Daten zurücksetzen</button>
</div>`;

    document.getElementById('dat-export').addEventListener('click', exportData);
    if (gzSupport) document.getElementById('dat-exportgz').addEventListener('click', exportGz);
    document.getElementById('dat-importbtn').addEventListener('click', () => document.getElementById('dat-import').click());
    document.getElementById('dat-import').addEventListener('change', e => {
      if (e.target.files[0]) importData(e.target.files[0]);
    });
    document.getElementById('dat-reset').addEventListener('click', () => {
      if (!confirm('Alle Profile und Gewichtseinträge zurücksetzen?')) return;
      const snap = { profiles: FT.state.profiles, weightEntries: FT.state.weightEntries, activeProfileId: FT.state.settings.activeProfileId };
      FT.state.profiles = []; FT.state.weightEntries = []; FT.state.settings.activeProfileId = null;
      FT.changed();
      FT.ui.toast('Alle Daten zurückgesetzt', { duration: 9000, label: 'Rückgängig', onAction: () => {
        FT.state.profiles = snap.profiles; FT.state.weightEntries = snap.weightEntries;
        FT.state.settings.activeProfileId = snap.activeProfileId;
        FT.changed();
      } });
    });
    render();
  }

  function render(){}

  FT.views.daten = { init, render };
})(window.FT);
