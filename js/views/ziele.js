// Ziele: Sparziele mit Fortschrittsbalken und Prognose
(function (FC) {
  const { eur0, esc } = FC.ui;
  const { MN, curM, curY } = FC;
  let editId = null, gIcon = 'ti-target-arrow';
  const GICONS = ['ti-target-arrow','ti-car','ti-plane','ti-home','ti-shield','ti-armchair','ti-gift','ti-device-laptop','ti-heart','ti-school','ti-pig-money','ti-diamond'];

  function init(el){
    el.innerHTML = `
<button id="g-new" class="wide" style="margin-bottom:14px;"><i class="ti ti-plus" aria-hidden="true"></i> Neues Sparziel</button>
<div id="g-form" class="card" style="display:none;border-color:var(--accent);margin-bottom:14px;">
<p id="g-form-title" class="sechead" style="margin:0 0 12px;">Neues Sparziel</p>
<div class="formgrid">
<label class="lbl">Name<input id="g-name" placeholder="z. B. Auto"></label>
<span class="lbl">Icon<span id="g-icons" style="display:flex;gap:5px;flex-wrap:wrap;"></span></span>
<label class="lbl">Zielbetrag (€)<input id="g-target" type="number" min="1" step="100" placeholder="10000"></label>
<label class="lbl">Bereits gespart (€)<input id="g-saved" type="number" min="0" step="100" placeholder="0"></label>
<label class="lbl">Monatliche Rate (€)<input id="g-rate" type="number" min="0" step="10" placeholder="100"></label>
</div>
<div style="display:flex;gap:8px;margin-top:14px;">
<button id="g-save" class="primary" style="flex:1;">Speichern</button>
<button id="g-cancel" style="flex:1;">Abbrechen</button>
</div>
</div>
<div id="g-list" class="list"></div>`;

    document.getElementById('g-new').addEventListener('click', () => openForm(null));
    document.getElementById('g-cancel').addEventListener('click', () => { document.getElementById('g-form').style.display = 'none'; editId = null; });
    document.getElementById('g-save').addEventListener('click', save);
    document.getElementById('g-icons').addEventListener('click', e => {
      const b = e.target.closest('[data-ico]');
      if (b) { gIcon = b.dataset.ico; renderIcons(); }
    });
    el.addEventListener('click', e => {
      const eb = e.target.closest('[data-gedit]');
      if (eb) { openForm(FC.state.goals.find(g => g.id === Number(eb.dataset.gedit))); return; }
      const db = e.target.closest('[data-gdel]');
      if (db) { FC.state.goals = FC.state.goals.filter(g => g.id !== Number(db.dataset.gdel)); FC.changed(); }
    });
  }

  function renderIcons(){
    document.getElementById('g-icons').innerHTML = GICONS.map(ic =>
      `<button type="button" class="icopick${ic === gIcon ? ' on' : ''}" data-ico="${ic}" aria-label="${ic}"><i class="ti ${ic}"></i></button>`).join('');
  }

  function openForm(g){
    editId = g ? g.id : null;
    gIcon = g ? g.icon : 'ti-target-arrow';
    document.getElementById('g-form-title').textContent = g ? 'Ziel bearbeiten' : 'Neues Sparziel';
    document.getElementById('g-name').value = g ? g.name : '';
    document.getElementById('g-target').value = g ? g.target : '';
    document.getElementById('g-saved').value = g ? g.saved : '';
    document.getElementById('g-rate').value = g ? g.rate : '';
    renderIcons();
    document.getElementById('g-form').style.display = 'block';
    document.getElementById('g-name').focus();
  }

  function save(){
    const name = document.getElementById('g-name').value.trim();
    const target = parseFloat(document.getElementById('g-target').value);
    if (!name || !(target > 0)) return;
    const obj = { id: editId || FC.nextId(FC.state.goals), name, icon: gIcon, target,
      saved: parseFloat(document.getElementById('g-saved').value) || 0,
      rate: parseFloat(document.getElementById('g-rate').value) || 0 };
    if (editId) FC.state.goals = FC.state.goals.map(g => g.id === editId ? obj : g);
    else FC.state.goals.push(obj);
    document.getElementById('g-form').style.display = 'none';
    editId = null;
    FC.changed();
  }

  function etaText(g){
    if (g.saved >= g.target) return 'Ziel erreicht';
    if (!g.rate) return 'Keine monatliche Rate festgelegt';
    const m = Math.ceil((g.target - g.saved) / g.rate);
    const d = new Date(curY, curM + m, 1);
    return 'voraussichtlich erreicht: ' + MN[d.getMonth()] + ' ' + d.getFullYear() + ' (' + m + ' Monate)';
  }

  function render(){
    const list = FC.state.goals;
    document.getElementById('g-list').innerHTML = list.length ? list.map(g => {
      const p = Math.min(100, Math.round(g.saved / g.target * 100));
      const done = g.saved >= g.target;
      return `<div class="card">
<div style="display:flex;align-items:center;gap:12px;">
<span class="ic" style="width:38px;height:38px;border-radius:9px;background:color-mix(in srgb,var(--accent) 13%,transparent);color:var(--accent);display:flex;align-items:center;justify-content:center;font-size:19px;flex-shrink:0;"><i class="ti ${g.icon}" aria-hidden="true"></i></span>
<span style="flex:1;min-width:0;">
<span style="display:block;font-size:14.5px;font-weight:600;">${esc(g.name)} ${done ? '<span class="chip" style="background:color-mix(in srgb,var(--pos) 15%,transparent);color:var(--pos);">erreicht</span>' : ''}</span>
<span style="display:block;font-size:12px;color:var(--text2);">${eur0(g.saved)} von ${eur0(g.target)}${g.rate ? ' · ' + eur0(g.rate) + '/Monat' : ''}</span>
</span>
<span class="num" style="font-size:17px;font-weight:600;color:${done ? 'var(--pos)' : 'var(--text)'};">${p} %</span>
<button class="iconbtn" data-gedit="${g.id}" aria-label="Bearbeiten"><i class="ti ti-edit" style="font-size:17px"></i></button>
<button class="iconbtn" data-gdel="${g.id}" aria-label="Löschen"><i class="ti ti-trash" style="font-size:17px"></i></button>
</div>
<span class="pbar"><span style="width:${p}%;background:${done ? 'var(--pos)' : 'var(--accent)'};"></span></span>
<p style="font-size:12px;color:var(--muted);margin:4px 0 0;">${etaText(g)}</p>
</div>`;
    }).join('') : '<p class="empty">Noch keine Ziele — lege dein erstes Sparziel an (z. B. Urlaub, Auto, Notgroschen)</p>';
  }

  FC.views.ziele = { init, render };
})(window.FC);
