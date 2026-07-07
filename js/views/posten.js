// Posten: Einnahmen/Ausgaben verwalten, eigene Kategorien mit Icon
(function (FC) {
  const { eur, catIcon, esc, monthLabel } = FC.ui;
  const { months, MN, MS, IVL, mkey, curM } = FC;
  let editId = null, ncIcon = 'ti-dots';

  function init(el){
    el.innerHTML = `
<button id="btn-new" class="wide" style="margin-bottom:14px;"><i class="ti ti-plus" aria-hidden="true"></i> Neuer Posten</button>
<div id="form-panel" class="card" style="display:none;border-color:var(--accent);margin-bottom:14px;">
<p id="form-title" class="sechead" style="margin:0 0 12px;">Neuer Posten</p>
<div class="formgrid">
<label class="lbl">Name<input id="f-name" placeholder="z. B. Miete"></label>
<label class="lbl">Betrag (€)<input id="f-amount" type="number" min="0" step="0.01" placeholder="0,00"></label>
<label class="lbl">Typ<select id="f-type"><option value="in">Einnahme</option><option value="out">Ausgabe</option></select></label>
<label class="lbl">Kategorie<select id="f-cat"></select></label>
<label class="lbl">Zahlungsintervall<select id="f-interval"><option value="0">einmalige Zahlung</option><option value="w">wöchentlich</option><option value="1" selected>monatlich</option><option value="2">alle 2 Monate</option><option value="3">vierteljährlich</option><option value="4">alle 4 Monate</option><option value="6">halbjährlich</option><option value="12">jährlich</option></select></label>
<label class="lbl" id="f-once-wrap" style="display:none;">Datum<input id="f-once" type="date"></label>
<label class="lbl" id="f-merchant-wrap" style="display:none;">Händler (optional)<input id="f-merchant" placeholder="z. B. Rewe, Shell, Amazon"></label>
<label class="lbl" id="f-ref-wrap" style="display:none;">Referenzmonat<select id="f-ref"></select></label>
<label class="lbl" id="f-start-wrap">Start (optional)<input id="f-start" type="month"></label>
<label class="lbl" id="f-end-wrap">Ende (optional)<input id="f-end" type="month"></label>
</div>
<div id="newcat-panel" style="display:none;margin-top:12px;padding-top:12px;border-top:1px solid var(--border);">
<div class="formgrid">
<label class="lbl">Name der neuen Kategorie<input id="nc-name" placeholder="z. B. Modellbau"></label>
<span class="lbl">Icon<span id="nc-icons" style="display:flex;gap:5px;flex-wrap:wrap;"></span></span>
</div>
</div>
<div style="display:flex;gap:8px;margin-top:14px;">
<button id="btn-save" class="primary" style="flex:1;">Speichern</button>
<button id="btn-cancel" style="flex:1;">Abbrechen</button>
</div>
</div>
<p class="sechead">Einnahmen</p>
<div id="list-in" class="list" style="margin-bottom:18px;"></div>
<p class="sechead">Ausgaben</p>
<div id="list-out" class="list"></div>`;

    document.getElementById('f-ref').innerHTML = MN.map((n, i) => `<option value="${i}">${n}</option>`).join('');
    document.getElementById('f-interval').addEventListener('change', syncFields);
    document.getElementById('f-type').addEventListener('change', fillCats);
    document.getElementById('f-cat').addEventListener('change', e => {
      const isNew = e.target.value === '__new';
      document.getElementById('newcat-panel').style.display = isNew ? 'block' : 'none';
      if (isNew) { renderIcons(); document.getElementById('nc-name').focus(); }
    });
    document.getElementById('nc-icons').addEventListener('click', e => {
      const b = e.target.closest('[data-ico]');
      if (b) { ncIcon = b.dataset.ico; renderIcons(); }
    });
    document.getElementById('btn-new').addEventListener('click', () => openForm(null));
    document.getElementById('btn-cancel').addEventListener('click', () => { document.getElementById('form-panel').style.display = 'none'; editId = null; });
    document.getElementById('btn-save').addEventListener('click', saveItem);
    el.addEventListener('click', e => {
      const eb = e.target.closest('[data-edit]');
      if (eb) { openForm(FC.state.items.find(i => i.id === Number(eb.dataset.edit))); return; }
      const db = e.target.closest('[data-del]');
      if (db) { FC.state.items = FC.state.items.filter(i => i.id !== Number(db.dataset.del)); FC.changed(); }
    });
  }

  function fillCats(){
    document.getElementById('f-cat').innerHTML =
      FC.sortedCats().map(c => `<option>${esc(c.n)}</option>`).join('') + '<option value="__new">+ Neue Kategorie…</option>';
  }
  function renderIcons(){
    document.getElementById('nc-icons').innerHTML = FC.ICONS.map(ic =>
      `<button type="button" class="icopick${ic === ncIcon ? ' on' : ''}" data-ico="${ic}" aria-label="${ic}"><i class="ti ${ic}"></i></button>`).join('');
  }
  function syncFields(){
    const v = document.getElementById('f-interval').value;
    document.getElementById('f-once-wrap').style.display = v === '0' ? 'flex' : 'none';
    document.getElementById('f-merchant-wrap').style.display = v === '0' ? 'flex' : 'none';
    document.getElementById('f-ref-wrap').style.display = (v !== '0' && v !== 'w' && Number(v) > 1) ? 'flex' : 'none';
    document.getElementById('f-start-wrap').style.display = v === '0' ? 'none' : 'flex';
    document.getElementById('f-end-wrap').style.display = v === '0' ? 'none' : 'flex';
  }

  function openForm(it){
    editId = it ? it.id : null;
    document.getElementById('form-title').textContent = it ? 'Posten bearbeiten' : 'Neuer Posten';
    document.getElementById('f-name').value = it ? it.name : '';
    document.getElementById('f-amount').value = it ? it.amount : '';
    document.getElementById('f-type').value = it ? it.type : 'out';
    fillCats();
    const defaultCat = it ? it.cat : (FC.state.cats.length ? FC.state.cats[0].n : '__new');
    document.getElementById('f-cat').value = defaultCat;
    if (defaultCat === '__new') {
      document.getElementById('newcat-panel').style.display = 'block';
      renderIcons();
      document.getElementById('nc-name').focus();
    }
    document.getElementById('f-interval').value = it ? String(it.interval) : '1';
    document.getElementById('f-ref').value = it && typeof it.interval === 'number' ? it.ref : curM;
    document.getElementById('f-once').value = it && it.date ? it.date : mkey(months[0]) + '-01';
    document.getElementById('f-merchant').value = it && it.merchant ? it.merchant : '';
    document.getElementById('f-start').value = it && it.start ? it.start : '';
    document.getElementById('f-end').value = it && it.end ? it.end : '';
    syncFields();
    document.getElementById('newcat-panel').style.display = 'none';
    document.getElementById('form-panel').style.display = 'block';
    document.getElementById('f-name').focus();
  }

  function saveItem(){
    const name = document.getElementById('f-name').value.trim();
    const amount = parseFloat(document.getElementById('f-amount').value);
    if (!name || !(amount > 0)) return;
    const type = document.getElementById('f-type').value;
    let cat = document.getElementById('f-cat').value;
    if (cat === '__new') {
      const nn = document.getElementById('nc-name').value.trim();
      if (!nn) return;
      if (!FC.state.cats.some(c => c.n === nn)) FC.state.cats.push({n:nn, i:ncIcon});
      cat = nn;
    }
    const raw = document.getElementById('f-interval').value;
    const iv = raw === 'w' ? 'w' : Number(raw);
    const date = document.getElementById('f-once').value || (mkey(months[0]) + '-01');
    const obj = { id: editId || FC.nextId(FC.state.items), name, amount, type, cat, interval: iv,
      ref: (typeof iv === 'number' && iv > 1) ? Number(document.getElementById('f-ref').value) : 0,
      once: iv === 0 ? date.slice(0, 7) : null,
      date: iv === 0 ? date : null,
      merchant: iv === 0 ? document.getElementById('f-merchant').value.trim() : '',
      start: iv === 0 ? null : (document.getElementById('f-start').value || null),
      end: iv === 0 ? null : (document.getElementById('f-end').value || null) };
    if (editId) FC.state.items = FC.state.items.map(i => i.id === editId ? obj : i);
    else FC.state.items.push(obj);
    document.getElementById('form-panel').style.display = 'none';
    editId = null;
    FC.changed();
  }

  function itemRow(e){
    const acc = e.type === 'in' ? 'var(--pos)' : 'var(--neg)';
    let iv;
    if (e.interval === 0) iv = 'einmalig · ' + (e.date ? new Date(e.date).toLocaleDateString('de-DE') : monthLabel(e.once)) + (e.merchant ? ' · ' + esc(e.merchant) : '');
    else if (e.interval === 'w') iv = 'wöchentlich · ≈ ' + eur(e.amount * 52 / 12) + '/Monat';
    else iv = e.interval === 1 ? 'monatlich' : IVL[e.interval] + ' im ' + MN[e.ref];
    let rt = '';
    if (e.interval !== 0 && (e.start || e.end))
      rt = ` · ${e.start ? monthLabel(e.start) : '…'} – ${e.end ? monthLabel(e.end) : 'unbegrenzt'}`;
    const chip = e.interval === 0 ? '<span class="chip">einmalig</span>' : e.interval === 'w' ? '<span class="chip">wöchentlich</span>' : '';
    return `<div class="itemcard">
<span class="ic" style="background:color-mix(in srgb,${acc} 13%,transparent);color:${acc};"><i class="ti ${catIcon(e.cat)}" aria-hidden="true"></i></span>
<span class="mid"><span class="nm">${esc(e.name)} ${chip}</span><span class="sb">${esc(e.cat)} · ${iv}${rt}</span></span>
<span class="num" style="font-weight:600;color:${acc};">${e.type === 'in' ? '+' : '−'}${eur(e.amount)}</span>
<button class="iconbtn" data-edit="${e.id}" aria-label="Bearbeiten"><i class="ti ti-edit" style="font-size:17px"></i></button>
<button class="iconbtn" data-del="${e.id}" aria-label="Löschen"><i class="ti ti-trash" style="font-size:17px"></i></button></div>`;
  }

  function render(){
    ['in', 'out'].forEach(t => {
      const list = FC.state.items.filter(i => i.type === t).slice().sort((a, b) => (a.interval === 0) - (b.interval === 0));
      document.getElementById('list-' + t).innerHTML = list.length ? list.map(itemRow).join('') :
        `<p class="empty">Noch keine ${t === 'in' ? 'Einnahmen' : 'Ausgaben'} angelegt</p>`;
    });
  }

  FC.views.posten = { init, render };
})(window.FC);
