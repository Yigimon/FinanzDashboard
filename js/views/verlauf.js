// Verlauf: Monats-Snapshots, echte Kategorie-Trends, Vermögens- und Saldo-Verlauf
(function (FC) {
  const { eur, eur0, tile, chart, ax, catIcon, esc } = FC.ui;
  const { MN } = FC;

  let selYear = '';
  function mLabel(key){ const [y, m] = key.split('-').map(Number); return MN[m - 1] + ' ' + y; }

  function init(el){
    el.innerHTML = `
<div class="card" style="margin-bottom:14px;">
<p class="sechead" style="margin:0 0 8px;"><i class="ti ti-camera" aria-hidden="true" style="color:var(--accent);"></i> Fortlaufende Aufzeichnung</p>
<p class="subtext">Jeder Monat wird <b>automatisch</b> festgehalten (Einnahmen, Ausgaben je Kategorie, Depot, Guthaben) — so entstehen ohne Zutun echte Trends und Statistiken über Jahre. Der laufende Monat wird bei jeder Änderung aktualisiert, vergangene Monate bleiben eingefroren.</p>
<button id="v-snap"><i class="ti ti-camera-plus" aria-hidden="true"></i> Laufenden Monat jetzt aktualisieren</button>
<span id="v-snap-hint" class="subtext" style="margin-left:10px;"></span>
</div>
<div class="grid-tiles" id="v-tiles"></div>
<div class="card" style="margin-bottom:14px;">
<div class="legendrow">
<span><span class="swl" style="background:#c1552f;"></span>Vermögen (Depot + Guthaben)</span>
<span><span class="swl" style="background:#1f7a5c;"></span>Monatssaldo</span>
</div>
<div class="chartbox"><canvas id="chart-verlauf" role="img" aria-label="Verlauf von Vermögen und Monatssaldo über die gespeicherten Snapshots"></canvas></div>
</div>
<p class="sechead">Kategorie-Trends</p>
<p class="subtext">Veränderung zwischen den beiden letzten Monaten — steigende Kategorien zuerst.</p>
<div class="card" id="v-trends" style="margin-bottom:14px;"></div>
<p class="sechead">Jahresabschluss</p>
<div class="pill-row"><select id="v-year" style="width:auto;"></select></div>
<div class="grid-tiles" id="v-year-tiles"></div>
<div class="card" id="v-year-detail" style="margin-bottom:6px;"></div>
<div style="margin:10px 0 16px;"><button id="v-close-year"></button> <span id="v-close-hint" class="subtext" style="margin-left:8px;"></span></div>
<p class="sechead">Abgeschlossene Jahre</p>
<div class="card" style="margin-bottom:14px;"><div class="chartbox sm"><canvas id="chart-years" role="img" aria-label="Einnahmen, Ausgaben und Saldo je abgeschlossenem Jahr"></canvas></div></div>
<div class="list" id="v-years-list" style="margin-bottom:16px;"></div>
<p class="sechead">Gespeicherte Monate</p>
<div class="list" id="v-list"></div>`;

    document.getElementById('v-snap').addEventListener('click', () => {
      const snap = FC.calc.snapshotNow();
      const i = FC.state.history.findIndex(s => s.month === snap.month);
      if (i >= 0) FC.state.history[i] = snap; else FC.state.history.push(snap);
      FC.state.history.sort((a, b) => a.month.localeCompare(b.month));
      FC.changed();
      const h = document.getElementById('v-snap-hint');
      h.textContent = 'Gespeichert: ' + mLabel(snap.month);
      h.style.color = 'var(--pos)';
    });
    document.getElementById('v-year').addEventListener('change', e => { selYear = e.target.value; renderYear(); });
    document.getElementById('v-close-year').addEventListener('click', () => {
      const agg = FC.calc.yearAggregate(selYear);
      if (!agg) return;
      agg.closedAt = new Date().toISOString();
      const i = FC.state.years.findIndex(y => y.year === agg.year);
      if (i >= 0) FC.state.years[i] = agg; else FC.state.years.push(agg);
      FC.state.years.sort((a, b) => a.year.localeCompare(b.year));
      FC.changed();
      const h = document.getElementById('v-close-hint');
      h.textContent = 'Jahr ' + agg.year + ' abgeschlossen und archiviert.';
      h.style.color = 'var(--pos)';
    });
    el.addEventListener('click', e => {
      const d = e.target.closest('[data-vdel]');
      if (d) { FC.state.history = FC.state.history.filter(s => s.month !== d.dataset.vdel); FC.changed(); return; }
      const yd = e.target.closest('[data-ydel]');
      if (yd) { FC.state.years = FC.state.years.filter(y => y.year !== yd.dataset.ydel); FC.changed(); }
    });
  }

  function renderYear(){
    const years = FC.calc.yearsInHistory();
    const sel = document.getElementById('v-year');
    if (!selYear || !years.includes(selYear)) selYear = years[0] || '';
    sel.innerHTML = years.map(y => `<option${y === selYear ? ' selected' : ''}>${y}</option>`).join('');
    const agg = selYear ? FC.calc.yearAggregate(selYear) : null;
    const tEl = document.getElementById('v-year-tiles');
    const dEl = document.getElementById('v-year-detail');
    const btn = document.getElementById('v-close-year');
    if (!agg) {
      tEl.innerHTML = ''; dEl.innerHTML = '<p class="empty">Noch keine Monatsdaten für ein Jahr.</p>';
      btn.style.display = 'none'; return;
    }
    const archived = FC.state.years.find(y => y.year === selYear);
    tEl.innerHTML =
      tile('Einnahmen ' + selYear, eur0(agg.inc), 'pos', agg.months + ' erfasste Monate') +
      tile('Ausgaben ' + selYear, eur0(agg.exp), 'neg') +
      tile('Jahressaldo', (agg.saldo >= 0 ? '+' : '') + eur0(agg.saldo), agg.saldo >= 0 ? 'pos' : 'neg', 'Sparquote ' + Math.round(agg.savingsRate * 100) + ' %') +
      tile('Vermögenszuwachs', (agg.nwGrowth >= 0 ? '+' : '') + eur0(agg.nwGrowth), agg.nwGrowth >= 0 ? 'pos' : 'neg', eur0(agg.startNw) + ' → ' + eur0(agg.endNw));
    const top = Object.entries(agg.byCat).sort((a, b) => b[1] - a[1]).slice(0, 6);
    const totCat = Object.values(agg.byCat).reduce((a, b) => a + b, 0) || 1;
    dEl.innerHTML = `
<p style="font-size:13px;color:var(--text2);margin:0 0 8px;">Top-Ausgabenkategorien ${selYear} · bester Monat ${mLabel(agg.bestMonth)}, schwächster ${mLabel(agg.worstMonth)}</p>
${top.map(([n, v]) => `<div class="trendrow"><i class="ti ${catIcon(n)}" aria-hidden="true" style="color:var(--text2);"></i>
<span style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${esc(n)}</span>
<span class="pbar" style="margin:0;width:90px;flex-shrink:0;"><span style="width:${Math.round(v / totCat * 100)}%;background:var(--accent);"></span></span>
<span class="num" style="font-weight:600;min-width:80px;text-align:right;">${eur0(v)}</span></div>`).join('')}
${archived ? `<p class="subtext" style="margin:10px 0 0;color:var(--pos);"><i class="ti ti-lock-check" aria-hidden="true"></i> Abgeschlossen am ${new Date(archived.closedAt).toLocaleDateString('de-DE')}.</p>` : ''}`;
    btn.style.display = 'inline-block';
    btn.innerHTML = `<i class="ti ti-lock" aria-hidden="true"></i> ${archived ? 'Jahr ' + selYear + ' neu abschließen' : 'Jahr ' + selYear + ' abschließen'}`;
  }

  function render(){
    const hist = FC.state.history.slice().sort((a, b) => a.month.localeCompare(b.month));
    const A = ax();

    // Kacheln: aktuelles Vermögen + Veränderung ggü. letztem Snapshot
    const nw = FC.calc.netWorth();
    const last = hist[hist.length - 1];
    const prevNw = last ? (last.depot + last.liquid) : null;
    const delta = prevNw !== null ? nw - prevNw : null;
    document.getElementById('v-tiles').innerHTML =
      tile('Vermögen heute', eur0(nw), '', 'Depot + Guthaben') +
      (delta !== null ? tile('seit letztem Snapshot', (delta >= 0 ? '+' : '') + eur0(delta), delta >= 0 ? 'pos' : 'neg', mLabel(last.month)) : '') +
      tile('Snapshots', String(hist.length), '', hist.length ? mLabel(hist[0].month) + ' – ' + mLabel(hist[hist.length - 1].month) : 'noch keine');

    // Verlaufschart (Snapshots + Live als letzter Punkt)
    const pts = hist.concat([{ month: FC.mkey(FC.months[0]), depot: FC.state.positions.reduce((a, p) => a + p.value, 0), liquid: Number(FC.state.settings.liquid) || 0, saldo: FC.calc.totals(FC.months[0]).saldo, live: true }]);
    // Duplikat vermeiden, falls Snapshot für aktuellen Monat existiert
    const seen = {}; const uniq = [];
    pts.forEach(p => { seen[p.month] = p; });
    Object.keys(seen).sort().forEach(k => uniq.push(seen[k]));
    chart('chart-verlauf', { data:{ labels: uniq.map(p => mLabel(p.month)),
      datasets:[
        {type:'line', label:'Vermögen', data:uniq.map(p => Math.round(p.depot + p.liquid)), borderColor:'#c1552f', backgroundColor:'#c1552f1a', fill:true, borderWidth:2, pointRadius:3, tension:.25, yAxisID:'y'},
        {type:'line', label:'Saldo', data:uniq.map(p => Math.round(p.saldo)), borderColor:'#1f7a5c', borderWidth:2, pointRadius:3, borderDash:[5,4], tension:.25, yAxisID:'y'}
      ]},
      options:{ responsive:true, maintainAspectRatio:false,
        plugins:{ legend:{display:false}, tooltip:{callbacks:{label:c => c.dataset.label + ': ' + eur0(c.parsed.y)}} },
        scales:{ x:{ticks:{color:A.muted}, grid:{display:false}, border:{color:A.grid}},
          y:{ticks:{color:A.muted, callback:x => new Intl.NumberFormat('de-DE',{notation:x>=100000?'compact':'standard'}).format(x)+' €'}, grid:{color:A.grid}, border:{color:A.grid}} } } });

    // Kategorie-Trends: letzte zwei Snapshots vergleichen
    const tEl = document.getElementById('v-trends');
    if (hist.length < 2) {
      tEl.innerHTML = '<p class="empty">Mindestens zwei Snapshots nötig. Speichere den aktuellen Monat, dann zeigt sich der Trend beim nächsten.</p>';
    } else {
      const a = hist[hist.length - 2].byCat || {}, b = hist[hist.length - 1].byCat || {};
      const cats = [...new Set([...Object.keys(a), ...Object.keys(b)])];
      const rows = cats.map(c => {
        const prev = a[c] || 0, cur = b[c] || 0;
        const diff = cur - prev;
        const pct = prev > 0 ? Math.round(diff / prev * 100) : (cur > 0 ? 100 : 0);
        return { c, prev, cur, diff, pct };
      }).filter(r => r.cur || r.prev).sort((x, y) => y.pct - x.pct);
      tEl.innerHTML = rows.map(r => {
        const up = r.diff > 0, flat = r.diff === 0;
        const col = flat ? 'var(--muted)' : up ? 'var(--neg)' : 'var(--pos)';
        const ic = flat ? 'ti-minus' : up ? 'ti-trending-up' : 'ti-trending-down';
        return `<div class="trendrow">
<i class="ti ${catIcon(r.c)}" aria-hidden="true" style="color:var(--text2);"></i>
<span style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${esc(r.c)}</span>
<span class="num" style="color:var(--text2);min-width:120px;text-align:right;">${eur0(r.prev)} → ${eur0(r.cur)}</span>
<span style="color:${col};font-weight:600;min-width:74px;text-align:right;"><i class="ti ${ic}" aria-hidden="true"></i> ${flat ? '±0' : (up ? '+' : '') + r.pct + ' %'}</span></div>`;
      }).join('') || '<p class="empty">Keine vergleichbaren Kategorien.</p>';
    }

    renderYear();

    // Mehrjahres-Chart (abgeschlossene Jahre)
    const yrs = FC.state.years.slice().sort((a, b) => a.year.localeCompare(b.year));
    if (yrs.length) {
      chart('chart-years', { data:{ labels: yrs.map(y => y.year), datasets:[
        {type:'bar', label:'Einnahmen', data:yrs.map(y => Math.round(y.inc)), backgroundColor:'#1f7a5c', borderRadius:4, maxBarThickness:34},
        {type:'bar', label:'Ausgaben', data:yrs.map(y => Math.round(y.exp)), backgroundColor:'#b23b3b', borderRadius:4, maxBarThickness:34},
        {type:'line', label:'Saldo', data:yrs.map(y => Math.round(y.saldo)), borderColor:'#c99a3f', borderWidth:2, pointRadius:4, tension:.2}
      ]},
        options:{ responsive:true, maintainAspectRatio:false,
          plugins:{ legend:{display:false}, tooltip:{callbacks:{label:c => c.dataset.label + ': ' + eur0(c.parsed.y)}} },
          scales:{ x:{ticks:{color:A.muted}, grid:{display:false}, border:{color:A.grid}},
            y:{ticks:{color:A.muted, callback:x => new Intl.NumberFormat('de-DE',{notation:x>=100000?'compact':'standard'}).format(x)+' €'}, grid:{color:A.grid}, border:{color:A.grid}} } } });
    } else {
      const c = document.getElementById('chart-years'); if (c) { const cx = c.getContext('2d'); cx && cx.clearRect(0,0,c.width,c.height); }
    }
    document.getElementById('v-years-list').innerHTML = yrs.length ? yrs.slice().reverse().map((y, idx, arr) => {
      const prev = arr[idx + 1];
      const yoy = prev ? y.saldo - prev.saldo : null;
      return `<div class="itemcard">
<span class="ic" style="background:color-mix(in srgb,var(--accent) 13%,transparent);color:var(--accent);"><i class="ti ti-calendar-check" aria-hidden="true"></i></span>
<span class="mid"><span class="nm">Jahr ${y.year} <span class="chip">${y.months} Monate</span></span>
<span class="sb">Einnahmen ${eur0(y.inc)} · Ausgaben ${eur0(y.exp)} · Sparquote ${Math.round(y.savingsRate * 100)} % · Vermögen ${eur0(y.startNw)} → ${eur0(y.endNw)}${yoy !== null ? ' · ggü. Vorjahr ' + (yoy >= 0 ? '+' : '') + eur0(yoy) : ''}</span></span>
<span class="num" style="font-weight:600;color:${y.saldo >= 0 ? 'var(--pos)' : 'var(--neg)'};">${y.saldo >= 0 ? '+' : ''}${eur0(y.saldo)}</span>
<button class="iconbtn" data-ydel="${y.year}" aria-label="Jahresabschluss löschen"><i class="ti ti-trash" style="font-size:17px"></i></button></div>`;
    }).join('') : '<p class="empty">Noch kein Jahr abgeschlossen. Wähle oben ein Jahr und klicke „Jahr abschließen".</p>';

    // Snapshot-Liste
    document.getElementById('v-list').innerHTML = hist.length ? hist.slice().reverse().map(s => `
<div class="itemcard">
<span class="ic" style="background:color-mix(in srgb,var(--accent) 13%,transparent);color:var(--accent);"><i class="ti ti-calendar-stats" aria-hidden="true"></i></span>
<span class="mid"><span class="nm">${mLabel(s.month)}</span><span class="sb">Einnahmen ${eur0(s.inc)} · Ausgaben ${eur0(s.exp)} · Vermögen ${eur0(s.depot + s.liquid)}</span></span>
<span class="num" style="font-weight:600;color:${s.saldo >= 0 ? 'var(--pos)' : 'var(--neg)'};">${s.saldo >= 0 ? '+' : ''}${eur0(s.saldo)}</span>
<button class="iconbtn" data-vdel="${s.month}" aria-label="Snapshot löschen"><i class="ti ti-trash" style="font-size:17px"></i></button></div>`).join('')
      : '<p class="empty">Noch keine Snapshots gespeichert.</p>';
  }

  FC.views.verlauf = { init, render };
})(window.FC);
