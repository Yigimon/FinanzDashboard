// Posten: Einnahmen/Ausgaben verwalten, eigene Kategorien mit Icon, Suche/Filter, Änderung ab Monat
(function (FC) {
  const { eur, catIcon, esc, monthLabel, toast } = FC.ui;
  const { months, MN, MS, IVL, mkey, curM } = FC;
  let editId = null, ncIcon = 'ti-dots';
  let search = '', filterCat = '', sortBy = 'name';

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
<label class="lbl" id="f-scope-wrap" style="display:none;">Änderung gilt<select id="f-scope"><option value="all">für alle Monate</option><option value="future">erst ab ${MN[curM]} (Verlauf bleibt)</option></select></label>
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
<div class="pill-row">
<input id="p-search" placeholder="Suchen (Name, Kategorie, Händler)…" aria-label="Posten durchsuchen" style="flex:1;min-width:150px;">
<select id="p-filtercat" style="width:auto;" aria-label="Nach Kategorie filtern"></select>
<select id="p-sort" style="width:auto;" aria-label="Sortierung"><option value="name">Name A–Z</option><option value="amount">Betrag (hoch → niedrig)</option><option value="cat">Kategorie</option></select>
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
    document.getElementById('p-search').addEventListener('input', e => { search = e.target.value.trim(); render(); });
    document.getElementById('p-filtercat').addEventListener('change', e => { filterCat = e.target.value; render(); });
    document.getElementById('p-sort').addEventListener('change', e => { sortBy = e.target.value; render(); });
    el.addEventListener('click', e => {
      const eb = e.target.closest('[data-edit]');
      if (eb) { openForm(FC.state.items.find(i => i.id === Number(eb.dataset.edit))); return; }
      const db = e.target.closest('[data-del]');
      if (db) delItem(Number(db.dataset.del));
    });
  }

  function delItem(id){
    const idx = FC.state.items.findIndex(i => i.id === id);
    if (idx < 0) return;
    const removed = FC.state.items[idx];
    FC.state.items.splice(idx, 1);
    FC.changed();
    toast('„' + removed.name + '" gelöscht', { label: 'Rückgängig', onAction: () => {
      FC.state.items.splice(Math.min(idx, FC.state.items.length), 0, removed);
      FC.changed();
    } });
  }

  function fillCats(){
    document.getElementById('f-cat').innerHTML =
      FC.sortedCats().map(c => `<option>${esc(c.n)}</option>`).join('') + '<option value="__new">+ Neue Kategorie…</option>';
  }
  function fillFilterCats(){
    const sel = document.getElementById('p-filtercat');
    const cur = sel.value;
    sel.innerHTML = '<option value="">Alle Kategorien</option>' + FC.sortedCatNames().map(n => `<option value="${esc(n)}">${esc(n)}</option>`).join('');
    if ([...sel.options].some(o => o.value === cur)) sel.value = cur; else filterCat = '';
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
    // „Änderung gilt" nur beim Bearbeiten eines wiederkehrenden Postens anbieten
    document.getElementById('f-scope-wrap').style.display = (editId && v !== '0') ? 'flex' : 'none';
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
    document.getElementById('f-scope').value = 'all';
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
    const fields = { name, amount, type, cat, interval: iv,
      ref: (typeof iv === 'number' && iv > 1) ? Number(document.getElementById('f-ref').value) : 0,
      once: iv === 0 ? date.slice(0, 7) : null,
      date: iv === 0 ? date : null,
      merchant: iv === 0 ? document.getElementById('f-merchant').value.trim() : '',
      start: iv === 0 ? null : (document.getElementById('f-start').value || null),
      end: iv === 0 ? null : (document.getElementById('f-end').value || null) };

    const scope = document.getElementById('f-scope').value;
    const curKey = mkey(months[0]);
    const old = editId ? FC.state.items.find(i => i.id === editId) : null;
    // „Ab diesem Monat": altes Segment im Vormonat beenden, neues ab aktuellem Monat anlegen
    const canSplit = old && iv !== 0 && scope === 'future' &&
      !(old.start && FC.calc.parseYM(old.start) >= FC.calc.parseYM(curKey));

    if (canSplit) {
      const pd = new Date(months[0].y, months[0].m - 1, 1);
      const prevKey = pd.getFullYear() + '-' + String(pd.getMonth() + 1).padStart(2, '0');
      old.end = prevKey;
      FC.state.items.push(Object.assign({ id: FC.nextId(FC.state.items) }, fields, { start: curKey }));
      toast('Änderung ab ' + MN[curM] + ' übernommen — der vorherige Verlauf bleibt erhalten.', { duration: 7000 });
    } else if (editId) {
      FC.state.items = FC.state.items.map(i => i.id === editId ? Object.assign({ id: editId }, fields) : i);
    } else {
      FC.state.items.push(Object.assign({ id: FC.nextId(FC.state.items) }, fields));
    }
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

  function filteredList(t){
    let list = FC.state.items.filter(i => i.type === t);
    if (filterCat) list = list.filter(i => i.cat === filterCat);
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(i => (i.name || '').toLowerCase().includes(q) ||
        (i.cat || '').toLowerCase().includes(q) || (i.merchant || '').toLowerCase().includes(q));
    }
    return list.slice().sort((a, b) => {
      if (sortBy === 'amount') return FC.calc.effAmount(b) - FC.calc.effAmount(a);
      if (sortBy === 'cat') return a.cat.localeCompare(b.cat, 'de') || a.name.localeCompare(b.name, 'de');
      return a.name.localeCompare(b.name, 'de');
    });
  }

  function render(){
    fillFilterCats();
    const active = search || filterCat;
    ['in', 'out'].forEach(t => {
      const list = filteredList(t);
      const emptyMsg = active
        ? 'Keine Treffer für die aktuelle Suche/Filter'
        : `Noch keine ${t === 'in' ? 'Einnahmen' : 'Ausgaben'} angelegt`;
      document.getElementById('list-' + t).innerHTML = list.length ? list.map(itemRow).join('') :
        `<p class="empty">${emptyMsg}</p>`;
    });
  }

  FC.views.posten = { init, render };
})(window.FC);
