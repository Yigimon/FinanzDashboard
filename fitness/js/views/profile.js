// Profile: Personen anlegen/bearbeiten/löschen
(function (FT) {
  const { esc } = FT.ui;
  const { ICONS, ACTIVITY } = FT;
  let editId = null, pIcon = 'ti-user';

  function init(el){
    el.innerHTML = `
<button id="p-new" class="wide" style="margin-bottom:14px;"><i class="ti ti-plus" aria-hidden="true"></i> Neues Profil</button>
<div id="p-form" class="card" style="display:none;border-color:var(--accent);margin-bottom:14px;">
<p id="p-form-title" class="sechead" style="margin:0 0 12px;">Neues Profil</p>
<div class="formgrid">
<label class="lbl">Name<input id="p-name" placeholder="z. B. Alex"></label>
<span class="lbl">Icon<span id="p-icons" style="display:flex;gap:5px;flex-wrap:wrap;"></span></span>
<label class="lbl">Geburtsdatum<input id="p-dob" type="date"></label>
<label class="lbl">Geschlecht
<select id="p-sex"><option value="m">Männlich</option><option value="f">Weiblich</option></select>
</label>
<label class="lbl">Größe (cm)<input id="p-height" type="number" min="100" max="250" step="1" placeholder="175"></label>
<label class="lbl">Startgewicht (kg)<input id="p-start" type="number" min="20" max="400" step="0.1" placeholder="80"></label>
<label class="lbl">Zielgewicht (kg)<input id="p-target" type="number" min="20" max="400" step="0.1" placeholder="70"></label>
<label class="lbl">Aktivitätslevel
<select id="p-activity"></select>
</label>
</div>
<div style="display:flex;gap:8px;margin-top:14px;">
<button id="p-save" class="primary" style="flex:1;">Speichern</button>
<button id="p-cancel" style="flex:1;">Abbrechen</button>
</div>
</div>
<div id="p-list" class="list"></div>`;

    document.getElementById('p-activity').innerHTML = ACTIVITY.map(a => `<option value="${a.v}">${a.n}</option>`).join('');

    document.getElementById('p-new').addEventListener('click', () => openForm(null));
    document.getElementById('p-cancel').addEventListener('click', () => { document.getElementById('p-form').style.display = 'none'; editId = null; });
    document.getElementById('p-save').addEventListener('click', save);
    document.getElementById('p-icons').addEventListener('click', e => {
      const b = e.target.closest('[data-ico]');
      if (b) { pIcon = b.dataset.ico; renderIcons(); }
    });
    el.addEventListener('click', e => {
      const eb = e.target.closest('[data-pedit]');
      if (eb) { openForm(FT.state.profiles.find(p => p.id === Number(eb.dataset.pedit))); return; }
      const db = e.target.closest('[data-pdel]');
      if (db) {
        const id = Number(db.dataset.pdel), idx = FT.state.profiles.findIndex(p => p.id === id);
        if (idx < 0) return;
        const removed = FT.state.profiles[idx];
        const removedEntries = FT.state.weightEntries.filter(w => w.profileId === id);
        FT.state.profiles.splice(idx, 1);
        FT.state.weightEntries = FT.state.weightEntries.filter(w => w.profileId !== id);
        if (FT.state.settings.activeProfileId === id) FT.state.settings.activeProfileId = null;
        FT.changed();
        FT.ui.toast('Profil „' + removed.name + '" gelöscht', { label: 'Rückgängig', onAction: () => {
          FT.state.profiles.splice(Math.min(idx, FT.state.profiles.length), 0, removed);
          FT.state.weightEntries.push(...removedEntries);
          FT.changed();
        } });
      }
    });
  }

  function renderIcons(){
    document.getElementById('p-icons').innerHTML = ICONS.map(ic =>
      `<button type="button" class="icopick${ic === pIcon ? ' on' : ''}" data-ico="${ic}" aria-label="${ic}"><i class="ti ${ic}"></i></button>`).join('');
  }

  function openForm(p){
    editId = p ? p.id : null;
    pIcon = p ? p.icon : 'ti-user';
    document.getElementById('p-form-title').textContent = p ? 'Profil bearbeiten' : 'Neues Profil';
    document.getElementById('p-name').value = p ? p.name : '';
    document.getElementById('p-dob').value = p ? p.dob : '';
    document.getElementById('p-sex').value = p ? p.sex : 'm';
    document.getElementById('p-height').value = p ? p.heightCm : '';
    document.getElementById('p-start').value = p ? p.startWeightKg : '';
    document.getElementById('p-target').value = p ? p.targetWeightKg : '';
    document.getElementById('p-activity').value = p ? p.activityLevel : '1.375';
    renderIcons();
    document.getElementById('p-form').style.display = 'block';
    document.getElementById('p-name').focus();
  }

  function save(){
    const name = document.getElementById('p-name').value.trim();
    const heightCm = parseFloat(document.getElementById('p-height').value);
    const startWeightKg = parseFloat(document.getElementById('p-start').value);
    const targetWeightKg = parseFloat(document.getElementById('p-target').value);
    if (!name || !(heightCm > 0) || !(startWeightKg > 0) || !(targetWeightKg > 0)) return;
    const obj = {
      id: editId || FT.nextId(FT.state.profiles),
      name, icon: pIcon,
      dob: document.getElementById('p-dob').value || null,
      sex: document.getElementById('p-sex').value,
      heightCm, startWeightKg, targetWeightKg,
      activityLevel: parseFloat(document.getElementById('p-activity').value)
    };
    if (editId) FT.state.profiles = FT.state.profiles.map(p => p.id === editId ? obj : p);
    else {
      FT.state.profiles.push(obj);
      if (!FT.state.settings.activeProfileId) FT.state.settings.activeProfileId = obj.id;
    }
    document.getElementById('p-form').style.display = 'none';
    editId = null;
    FT.changed();
  }

  function render(){
    const list = FT.state.profiles;
    document.getElementById('p-list').innerHTML = list.length ? list.map(p => {
      const latest = FT.calc.latestEntry(p.id);
      const current = latest ? latest.weightKg : p.startWeightKg;
      return `<div class="itemcard">
<span class="ic" style="background:color-mix(in srgb,var(--accent) 13%,transparent);color:var(--accent);"><i class="ti ${p.icon}" aria-hidden="true"></i></span>
<span class="mid"><span class="nm">${esc(p.name)}</span>
<span class="sb">${FT.ui.kg(current)} · Ziel ${FT.ui.kg(p.targetWeightKg)} · ${p.heightCm} cm</span></span>
<button class="iconbtn" data-pedit="${p.id}" aria-label="Bearbeiten"><i class="ti ti-edit" style="font-size:17px"></i></button>
<button class="iconbtn" data-pdel="${p.id}" aria-label="Löschen"><i class="ti ti-trash" style="font-size:17px"></i></button>
</div>`;
    }).join('') : '<p class="empty">Noch keine Profile — lege das erste Profil an</p>';
  }

  FT.views.profile = { init, render };
})(window.FT);
