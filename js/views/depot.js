// Depot: Positionen, Asset Allocation, Szenario-Prognose, FIRE-Rechner
(function (FC) {
  const { eur, eur0, tile, chart, ax, kindIcon, esc } = FC.ui;
  const { KINDS, PIE, curY } = FC;
  const { project, projectAll, avgExp } = FC.calc;
  let editId = null;

  function init(el){
    el.innerHTML = `
<div class="grid-tiles" id="d-tiles"></div>
<div style="display:flex;align-items:center;gap:12px;margin-bottom:14px;">
<span style="font-size:13px;color:var(--text2);">Anlagedauer</span>
<input id="d-years" type="range" min="1" max="40" step="1" value="10" style="flex:1;">
<span id="d-years-out" class="num" style="font-size:14px;font-weight:600;min-width:66px;">10 Jahre</span>
</div>
<div class="card" style="margin-bottom:14px;">
<div class="legendrow">
<span><span class="swl" style="background:#c1552f;"></span>realistisch</span>
<span><span class="swl" style="background:#1f7a5c;"></span>optimistisch (+3 %)</span>
<span><span class="swl" style="background:#b23b3b;"></span>pessimistisch (−3 %)</span>
<span><span class="swl" style="background:#8b8a7c;"></span>Einzahlungen</span>
</div>
<div class="chartbox"><canvas id="chart-depot" role="img" aria-label="Depotprognose in drei Szenarien gegenüber den Einzahlungen"></canvas></div>
</div>
<p class="sechead">Asset Allocation</p>
<div class="card"><div class="piewrap" id="d-allocwrap">
<div class="chartbox sm"><canvas id="chart-alloc" role="img" aria-label="Kuchendiagramm der Portfolioaufteilung nach Anlageklasse"></canvas></div>
<div id="d-alloclegend" style="display:flex;flex-direction:column;gap:6px;"></div>
</div></div>
<p class="sechead">Positionen und Sparpläne</p>
<button id="dp-new" class="wide" style="margin-bottom:14px;"><i class="ti ti-plus" aria-hidden="true"></i> Neue Position / Sparplan</button>
<div id="dp-form" class="card" style="display:none;border-color:var(--accent);margin-bottom:14px;">
<p id="dp-form-title" class="sechead" style="margin:0 0 12px;">Neue Position</p>
<div class="formgrid">
<label class="lbl">Name<input id="dp-name" placeholder="z. B. MSCI World ETF"></label>
<label class="lbl">Art<select id="dp-kind"></select></label>
<label class="lbl">Aktueller Wert (€)<input id="dp-value" type="number" min="0" step="100" placeholder="0"></label>
<label class="lbl">Sparrate / Monat (€)<input id="dp-rate" type="number" min="0" step="10" placeholder="0"></label>
<label class="lbl">Erwartete Rendite p. a. (%)<input id="dp-ret" type="number" min="-20" max="30" step="0.5" placeholder="6"></label>
</div>
<div style="display:flex;gap:8px;margin-top:14px;">
<button id="dp-save" class="primary" style="flex:1;">Speichern</button>
<button id="dp-cancel" style="flex:1;">Abbrechen</button>
</div>
</div>
<div id="dp-list" class="list" style="margin-bottom:14px;"></div>
<button id="d-sync" class="wide" style="margin-bottom:20px;">Summe der Sparraten als monatliche Ausgabe „Depot-Sparpläne" übernehmen</button>
<p class="sechead">FIRE-Rechner — finanzielle Unabhängigkeit</p>
<div class="card">
<div class="formgrid" style="margin-bottom:12px;">
<label class="lbl">Monatliche Ausgaben im Ruhestand (€)<input id="fire-exp" type="number" min="0" step="50"></label>
<label class="lbl">Entnahmerate (%)<input id="fire-swr" type="number" min="2" max="6" step="0.25" value="4"></label>
</div>
<div class="grid-tiles" id="fire-tiles" style="margin:0;"></div>
<p class="subtext" style="margin:10px 0 0;">Nach der 4-%-Regel brauchst du das 25-Fache deiner Jahresausgaben. Die Prognose nutzt deine aktuellen Positionen, Sparraten und die wertgewichtete Rendite.</p>
</div>`;

    document.getElementById('d-years').addEventListener('input', render);
    document.getElementById('fire-exp').addEventListener('input', renderFire);
    document.getElementById('fire-swr').addEventListener('input', renderFire);
    document.getElementById('dp-new').addEventListener('click', () => openForm(null));
    document.getElementById('dp-cancel').addEventListener('click', () => { document.getElementById('dp-form').style.display = 'none'; editId = null; });
    document.getElementById('dp-save').addEventListener('click', save);
    document.getElementById('d-sync').addEventListener('click', sync);
    el.addEventListener('click', e => {
      const eb = e.target.closest('[data-dpedit]');
      if (eb) { openForm(FC.state.positions.find(p => p.id === Number(eb.dataset.dpedit))); return; }
      const db = e.target.closest('[data-dpdel]');
      if (db) { FC.state.positions = FC.state.positions.filter(p => p.id !== Number(db.dataset.dpdel)); FC.changed(); }
    });
  }

  function openForm(p){
    editId = p ? p.id : null;
    document.getElementById('dp-form-title').textContent = p ? 'Position bearbeiten' : 'Neue Position';
    document.getElementById('dp-kind').innerHTML = KINDS.map(k => `<option>${k[0]}</option>`).join('');
    document.getElementById('dp-name').value = p ? p.name : '';
    document.getElementById('dp-kind').value = p ? p.kind : KINDS[0][0];
    document.getElementById('dp-value').value = p ? p.value : '';
    document.getElementById('dp-rate').value = p ? p.rate : '';
    document.getElementById('dp-ret').value = p ? p.ret : 6;
    document.getElementById('dp-form').style.display = 'block';
    document.getElementById('dp-name').focus();
  }

  function save(){
    const name = document.getElementById('dp-name').value.trim();
    if (!name) return;
    const obj = { id: editId || FC.nextId(FC.state.positions), name,
      kind: document.getElementById('dp-kind').value,
      value: parseFloat(document.getElementById('dp-value').value) || 0,
      rate: parseFloat(document.getElementById('dp-rate').value) || 0,
      ret: parseFloat(document.getElementById('dp-ret').value) || 0 };
    if (editId) FC.state.positions = FC.state.positions.map(p => p.id === editId ? obj : p);
    else FC.state.positions.push(obj);
    document.getElementById('dp-form').style.display = 'none';
    editId = null;
    FC.changed();
  }

  function sync(){
    const rate = FC.state.positions.reduce((a, p) => a + p.rate, 0);
    if (!(rate > 0)) return;
    const ex = FC.state.items.find(i => i.name === 'Depot-Sparpläne');
    if (ex) ex.amount = rate;
    else FC.state.items.push({ id: FC.nextId(FC.state.items), name:'Depot-Sparpläne', amount:rate,
      type:'out', cat:'Sparen & Vorsorge', interval:1, ref:0, start:null, end:null, once:null });
    FC.changed();
    const b = document.getElementById('d-sync');
    b.textContent = 'Übernommen — Sparraten sind jetzt monatliche Ausgabe';
    setTimeout(() => { b.textContent = 'Summe der Sparraten als monatliche Ausgabe „Depot-Sparpläne" übernehmen'; }, 2500);
  }

  function renderFire(){
    const inp = document.getElementById('fire-exp');
    if (!inp.value) inp.value = Math.round(avgExp());
    const mExp = parseFloat(inp.value) || 0;
    const swr = parseFloat(document.getElementById('fire-swr').value) || 4;
    const f = FC.calc.fire(mExp, swr);
    document.getElementById('fire-tiles').innerHTML =
      tile('Zielvermögen', eur0(f.target), '', 'bei ' + String(swr).replace('.', ',') + ' % Entnahme') +
      tile('Erreicht in', f.years === null ? 'über 60 J.' : 'ca. ' + f.years + ' Jahren',
        f.years !== null && f.years <= 30 ? 'pos' : '', 'bei ' + (Math.round(f.wRet * 10) / 10).toLocaleString('de-DE') + ' % Ø-Rendite') +
      tile('Monatliche Entnahme', eur0(f.withdrawal), 'pos', 'ab Zielerreichung');
  }

  function render(){
    const years = Number(document.getElementById('d-years').value);
    document.getElementById('d-years-out').textContent = years + (years === 1 ? ' Jahr' : ' Jahre');
    const A = ax();
    const real = projectAll(years);
    const opt = projectAll(years, 3);
    const pess = projectAll(years, -3);
    const cur = FC.state.positions.reduce((a, p) => a + p.value, 0);
    const rate = FC.state.positions.reduce((a, p) => a + p.rate, 0);
    const gain = real.vv[years] - real.pp[years];
    document.getElementById('d-tiles').innerHTML =
      tile('Wert heute', eur0(cur)) + tile('Sparrate / Monat', eur0(rate)) +
      tile('Wert nach ' + years + ' J.', eur0(real.vv[years]), '', 'realistisches Szenario') +
      tile('davon Kursgewinn', eur0(gain), gain >= 0 ? 'pos' : 'neg');

    chart('chart-depot', { type:'line',
      data:{ labels: real.vv.map((_, i) => curY + i), datasets: [
        {label:'realistisch', data:real.vv.map(x => Math.round(x)), borderColor:'#c1552f', backgroundColor:'#c1552f1a', fill:true, borderWidth:2, pointRadius:0, tension:.25},
        {label:'optimistisch', data:opt.vv.map(x => Math.round(x)), borderColor:'#1f7a5c', borderWidth:2, borderDash:[6,4], pointRadius:0, fill:false, tension:.25},
        {label:'pessimistisch', data:pess.vv.map(x => Math.round(x)), borderColor:'#b23b3b', borderWidth:2, borderDash:[6,4], pointRadius:0, fill:false, tension:.25},
        {label:'Einzahlungen', data:real.pp.map(x => Math.round(x)), borderColor:'#8b8a7c', borderDash:[2,3], borderWidth:2, pointRadius:0, fill:false}
      ]},
      options:{ responsive:true, maintainAspectRatio:false,
        plugins:{ legend:{display:false}, tooltip:{callbacks:{label:c => c.dataset.label + ': ' + eur0(c.parsed.y)}} },
        scales:{ x:{ticks:{color:A.muted, maxTicksLimit:10}, grid:{display:false}, border:{color:A.grid}},
          y:{ticks:{color:A.muted, callback:x => new Intl.NumberFormat('de-DE', {notation:x >= 100000 ? 'compact' : 'standard'}).format(x) + ' €'}, grid:{color:A.grid}, border:{color:A.grid}} } } });

    // Asset Allocation nach Art
    const byKind = {};
    FC.state.positions.forEach(p => { byKind[p.kind] = (byKind[p.kind] || 0) + p.value; });
    const kinds = Object.keys(byKind).filter(k => byKind[k] > 0);
    const kvals = kinds.map(k => byKind[k]);
    const ktotal = kvals.reduce((a, b) => a + b, 0);
    chart('chart-alloc', { type:'doughnut',
      data:{ labels:kinds, datasets:[{ data:kvals, backgroundColor:kinds.map((_, i) => PIE[i % PIE.length]), borderWidth:2, borderColor:A.surface }] },
      options:{ responsive:true, maintainAspectRatio:false, cutout:'62%',
        plugins:{ legend:{display:false}, tooltip:{callbacks:{label:c => c.label + ': ' + eur0(c.parsed)}} } } });
    document.getElementById('d-alloclegend').innerHTML = ktotal ? kinds.map((k, i) =>
      `<div style="display:flex;align-items:center;gap:8px;font-size:13px;">
<span class="sw" style="background:${PIE[i % PIE.length]};"></span>
<i class="ti ${kindIcon(k)}" aria-hidden="true" style="font-size:14px;color:var(--text2);"></i>
<span style="flex:1;">${esc(k)}</span>
<span class="num" style="color:var(--text2);">${Math.round(kvals[i] / ktotal * 100)} %</span>
<span class="num" style="font-weight:600;min-width:88px;text-align:right;">${eur0(kvals[i])}</span></div>`).join('')
      : '<p class="empty">Keine Positionen mit Wert</p>';

    // Positionsliste
    document.getElementById('dp-list').innerHTML = FC.state.positions.length ? FC.state.positions.map(p => {
      const pr = project(p, years);
      return `<div class="itemcard">
<span class="ic" style="background:color-mix(in srgb,var(--accent) 13%,transparent);color:var(--accent);"><i class="ti ${kindIcon(p.kind)}" aria-hidden="true"></i></span>
<span class="mid"><span class="nm">${esc(p.name)} <span class="chip">${esc(p.kind)}</span></span>
<span class="sb">Wert ${eur0(p.value)} · Rate ${eur0(p.rate)}/Monat · ${String(p.ret).replace('.', ',')} % p. a.</span></span>
<span style="text-align:right;"><span class="num" style="display:block;font-weight:600;">${eur0(pr.vv[years])}</span><span style="display:block;font-size:11px;color:var(--muted);">in ${years} J.</span></span>
<button class="iconbtn" data-dpedit="${p.id}" aria-label="Bearbeiten"><i class="ti ti-edit" style="font-size:17px"></i></button>
<button class="iconbtn" data-dpdel="${p.id}" aria-label="Löschen"><i class="ti ti-trash" style="font-size:17px"></i></button></div>`;
    }).join('') : '<p class="empty">Noch keine Positionen — lege deinen ersten Sparplan an</p>';

    renderFire();
  }

  FC.views.depot = { init, render };
})(window.FC);
