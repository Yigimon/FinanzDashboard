// Gewicht: tägliche Erfassung je Profil (Gewicht + optionale Umfänge für Körperfett)
(function (FT) {
  const { esc, kg } = FT.ui;
  let editId = null;

  function activeProfile(){
    return FT.state.profiles.find(p => p.id === FT.state.settings.activeProfileId) || FT.state.profiles[0] || null;
  }

  function init(el){
    el.innerHTML = `
<div class="pill-row" style="margin-bottom:14px;"><select id="w-profile" style="width:auto;"></select></div>
<div id="w-empty" class="empty" style="display:none;">Noch kein Profil angelegt — zuerst im Tab „Profile" ein Profil anlegen.</div>
<div id="w-body">
<button id="w-new" class="wide" style="margin-bottom:14px;"><i class="ti ti-plus" aria-hidden="true"></i> Neuer Eintrag</button>
<div id="w-form" class="card" style="display:none;border-color:var(--accent);margin-bottom:14px;">
<p id="w-form-title" class="sechead" style="margin:0 0 12px;">Neuer Eintrag</p>
<div class="formgrid">
<label class="lbl">Datum<input id="w-date" type="date"></label>
<label class="lbl">Gewicht (kg)<input id="w-weight" type="number" min="20" max="400" step="0.1" placeholder="80.0"></label>
<label class="lbl">Taille (cm) <span style="color:var(--muted);font-weight:400;">optional</span><input id="w-waist" type="number" min="30" max="200" step="0.5" placeholder="für Körperfett"></label>
<label class="lbl">Hals (cm) <span style="color:var(--muted);font-weight:400;">optional</span><input id="w-neck" type="number" min="15" max="80" step="0.5" placeholder="für Körperfett"></label>
<label class="lbl">Hüfte (cm) <span style="color:var(--muted);font-weight:400;">nur bei Frauen</span><input id="w-hip" type="number" min="40" max="200" step="0.5" placeholder="für Körperfett"></label>
</div>
<div style="display:flex;gap:8px;margin-top:14px;">
<button id="w-save" class="primary" style="flex:1;">Speichern</button>
<button id="w-cancel" style="flex:1;">Abbrechen</button>
</div>
</div>
<div id="w-list" class="list"></div>
</div>`;

    document.getElementById('w-profile').addEventListener('change', e => {
      FT.state.settings.activeProfileId = Number(e.target.value);
      FT.persist();
      render();
    });
    document.getElementById('w-new').addEventListener('click', () => openForm(null));
    document.getElementById('w-cancel').addEventListener('click', () => { document.getElementById('w-form').style.display = 'none'; editId = null; });
    document.getElementById('w-save').addEventListener('click', save);
    el.addEventListener('click', e => {
      const eb = e.target.closest('[data-wedit]');
      if (eb) { openForm(FT.state.weightEntries.find(w => w.id === Number(eb.dataset.wedit))); return; }
      const db = e.target.closest('[data-wdel]');
      if (db) {
        const id = Number(db.dataset.wdel), idx = FT.state.weightEntries.findIndex(w => w.id === id);
        if (idx < 0) return;
        const removed = FT.state.weightEntries[idx];
        FT.state.weightEntries.splice(idx, 1);
        FT.changed();
        FT.ui.toast('Eintrag vom ' + removed.date + ' gelöscht', { label: 'Rückgängig', onAction: () => {
          FT.state.weightEntries.splice(Math.min(idx, FT.state.weightEntries.length), 0, removed); FT.changed();
        } });
      }
    });
  }

  function openForm(w){
    editId = w ? w.id : null;
    document.getElementById('w-form-title').textContent = w ? 'Eintrag bearbeiten' : 'Neuer Eintrag';
    document.getElementById('w-date').value = w ? w.date : new Date().toISOString().slice(0,10);
    document.getElementById('w-weight').value = w ? w.weightKg : '';
    document.getElementById('w-waist').value = w && w.waistCm ? w.waistCm : '';
    document.getElementById('w-neck').value = w && w.neckCm ? w.neckCm : '';
    document.getElementById('w-hip').value = w && w.hipCm ? w.hipCm : '';
    document.getElementById('w-form').style.display = 'block';
    document.getElementById('w-weight').focus();
  }

  function save(){
    const p = activeProfile();
    if (!p) return;
    const date = document.getElementById('w-date').value;
    const weightKg = parseFloat(document.getElementById('w-weight').value);
    if (!date || !(weightKg > 0)) return;
    const obj = {
      id: editId || FT.nextId(FT.state.weightEntries),
      profileId: p.id, date, weightKg,
      waistCm: parseFloat(document.getElementById('w-waist').value) || null,
      neckCm: parseFloat(document.getElementById('w-neck').value) || null,
      hipCm: parseFloat(document.getElementById('w-hip').value) || null
    };
    if (editId) FT.state.weightEntries = FT.state.weightEntries.map(w => w.id === editId ? obj : w);
    else FT.state.weightEntries.push(obj);
    document.getElementById('w-form').style.display = 'none';
    editId = null;
    FT.changed();
  }

  function render(){
    const profiles = FT.state.profiles;
    const sel = document.getElementById('w-profile');
    document.getElementById('w-empty').style.display = profiles.length ? 'none' : 'block';
    document.getElementById('w-body').style.display = profiles.length ? 'block' : 'none';
    if (!profiles.length) { sel.innerHTML = ''; FT.ui.select('w-profile'); return; }
    const p = activeProfile();
    if (p && p.id !== FT.state.settings.activeProfileId) { FT.state.settings.activeProfileId = p.id; FT.persist(); }
    sel.innerHTML = profiles.map(pr => `<option value="${pr.id}"${pr.id === p.id ? ' selected' : ''}>${esc(pr.name)}</option>`).join('');
    FT.ui.select('w-profile');

    const entries = FT.calc.entriesFor(p.id).slice().reverse();
    document.getElementById('w-list').innerHTML = entries.length ? entries.map(w => `
<div class="itemcard">
<span class="ic" style="background:color-mix(in srgb,var(--accent) 13%,transparent);color:var(--accent);"><i class="ti ti-scale" aria-hidden="true"></i></span>
<span class="mid"><span class="nm">${w.date}</span>
<span class="sb">${kg(w.weightKg)}${w.waistCm ? ' · Taille ' + w.waistCm + ' cm' : ''}${w.neckCm ? ' · Hals ' + w.neckCm + ' cm' : ''}${w.hipCm ? ' · Hüfte ' + w.hipCm + ' cm' : ''}</span></span>
<button class="iconbtn" data-wedit="${w.id}" aria-label="Bearbeiten"><i class="ti ti-edit" style="font-size:17px"></i></button>
<button class="iconbtn" data-wdel="${w.id}" aria-label="Löschen"><i class="ti ti-trash" style="font-size:17px"></i></button>
</div>`).join('') : '<p class="empty">Noch keine Einträge — trage das erste Gewicht ein</p>';
  }

  FT.views.gewicht = { init, render };
})(window.FT);
