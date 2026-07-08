// Übersicht: Finanzscore, Monatszusammenfassung, Schnellinfos, Hauptchart, Hinweise
(function (FC) {
  const { eur, eur0, tile, chart, ax } = FC.ui;
  const { totals, monthEntries, avgSaldo, effAmount, byCategory, score, parseYM, ymNum } = FC.calc;
  const { months, MN, MS, curM } = FC;

  function init(el){
    el.innerHTML = `
<div class="card" style="margin-bottom:16px;">
  <p class="sechead" style="margin:0 0 12px;">Finanzscore</p>
  <div class="scorering">
    <span class="scorenum num" id="dash-score">–</span>
    <span class="scorerows" id="dash-scorerows"></span>
  </div>
</div>
<div class="card" style="margin-bottom:16px;">
  <p class="sechead" style="margin:0 0 8px;">Monatszusammenfassung — ${MN[curM]}</p>
  <div id="dash-summary-text" style="font-size:14px;color:var(--text2);line-height:1.7;"></div>
</div>
<div class="grid-tiles" id="dash-tiles"></div>
<div class="card" style="margin-bottom:12px;">
  <div class="legendrow">
    <span><span class="sw" style="background:var(--pos);"></span>Einnahmen</span>
    <span><span class="sw" style="background:var(--neg);"></span>Ausgaben</span>
    <span><span class="swl" style="background:#c99a3f;"></span>Saldo</span>
  </div>
  <div class="chartbox"><canvas id="chart-main" role="img" aria-label="Einnahmen, Ausgaben und Saldo pro Monat über 12 Monate"></canvas></div>
</div>
<div class="list" id="dash-insights"></div>`;
  }

  function render(){
    const sc = score();
    document.getElementById('dash-score').textContent = sc.total;
    document.getElementById('dash-score').style.color = sc.total >= 70 ? 'var(--pos)' : sc.total >= 40 ? 'var(--warn)' : 'var(--neg)';
    document.getElementById('dash-scorerows').innerHTML = sc.parts.map(p => `
<span class="scorerow"><span>${p.name}</span><span class="pbar"><span style="width:${Math.round(p.val)}%;background:${p.val >= 70 ? 'var(--pos)' : p.val >= 40 ? 'var(--warn)' : 'var(--neg)'};"></span></span><span class="num" style="text-align:right;">${Math.round(p.val)}</span></span>
<span style="font-size:11px;color:var(--muted);margin:-4px 0 2px;">${p.info}</span>`).join('');

    const t0 = totals(months[0]);
    const avg = avgSaldo();
    const byOut = byCategory([months[0]], 'out');
    const topOut = Object.entries(byOut).sort((a, b) => b[1] - a[1])[0];
    const q = t0.inc > 0 ? Math.round((1 - t0.exp / t0.inc) * 100) : 0;
    const sent = [];
    sent.push(`Diesen Monat stehen Ausgaben von <b class="num">${eur0(t0.exp)}</b> Einnahmen von <b class="num">${eur0(t0.inc)}</b> gegenüber — Saldo <b class="num ${t0.saldo >= 0 ? 'pos' : 'neg'}">${eur0(t0.saldo)}</b>.`);
    if (t0.inc > 0) sent.push(`Die Sparquote beträgt <b>${q} %</b>.`);
    if (topOut) sent.push(`Die größten Ausgaben entstehen im Bereich <b>${topOut[0]}</b> (${eur0(topOut[1])}).`);
    const depot = FC.state.positions.reduce((a, p) => a + p.value, 0);
    if (depot > 0) sent.push(`Das Depot ist aktuell <b class="num">${eur0(depot)}</b> wert.`);
    sent.push(`Über 12 Monate bleibt im Schnitt <b class="num ${avg >= 0 ? 'pos' : 'neg'}">${eur0(avg)}</b> pro Monat übrig.`);
    document.getElementById('dash-summary-text').innerHTML = sent.join(' ');

    let big = null, bigIn = null;
    monthEntries(months[0]).forEach(e => {
      const v = effAmount(e);
      if (e.type === 'out' && (!big || v > big.v)) big = {n:e.name, v};
      if (e.type === 'in' && (!bigIn || v > bigIn.v)) bigIn = {n:e.name, v};
    });
    document.getElementById('dash-tiles').innerHTML =
      tile('Einnahmen (' + MS[curM] + ')', eur(t0.inc), 'pos') +
      tile('Ausgaben (' + MS[curM] + ')', eur(t0.exp), 'neg') +
      tile('Saldo (' + MS[curM] + ')', eur(t0.saldo), t0.saldo >= 0 ? 'pos' : 'neg') +
      tile('Ø Saldo / 12 Monate', eur(avg), avg >= 0 ? 'pos' : 'neg') +
      (topOut ? tile('Teuerste Kategorie', topOut[0], '', eur0(topOut[1]) + ' im ' + MS[curM]) : '') +
      (big ? tile('Größte Ausgabe', big.n, '', eur0(big.v)) : '') +
      (bigIn ? tile('Höchste Einnahme', bigIn.n, '', eur0(bigIn.v)) : '') +
      tile('Depot heute', eur0(depot), '', FC.state.positions.length + ' Positionen') +
      (function(){
        const budgets = FC.state.settings.budgets || {};
        const keys = Object.keys(budgets);
        if (!keys.length) return '';
        const over = keys.filter(c => (byOut[c] || 0) > budgets[c]);
        return tile('Budgets', over.length ? over.length + ' überschritten' : 'alle eingehalten',
          over.length ? 'neg' : 'pos', over.length ? over.join(', ') : keys.length + ' Budget' + (keys.length > 1 ? 's' : '') + ' aktiv');
      })();

    const data = months.map(mo => totals(mo));
    const A = ax();
    chart('chart-main', {
      data: { labels: months.map(mo => MS[mo.m]), datasets: [
        {type:'bar', label:'Einnahmen', data:data.map(d => d.inc), backgroundColor:'#1f7a5c', borderRadius:4, maxBarThickness:16},
        {type:'bar', label:'Ausgaben', data:data.map(d => d.exp), backgroundColor:'#b23b3b', borderRadius:4, maxBarThickness:16},
        {type:'line', label:'Saldo', data:data.map(d => d.saldo), borderColor:'#c99a3f', backgroundColor:'#c99a3f', borderWidth:2, pointRadius:3, tension:.3}
      ]},
      options: { responsive:true, maintainAspectRatio:false,
        plugins:{ legend:{display:false}, tooltip:{callbacks:{label:c => c.dataset.label + ': ' + eur(c.parsed.y)}} },
        scales:{ x:{ticks:{color:A.muted, autoSkip:false}, grid:{display:false}, border:{color:A.grid}},
          y:{ticks:{color:A.muted, callback:v => new Intl.NumberFormat('de-DE').format(v) + ' €'}, grid:{color:A.grid}, border:{color:A.grid}} } }
    });

    const out = [];
    const ws = ymNum(months[0]), we = ymNum(months[11]);
    FC.state.items.forEach(it => {
      if (it.interval === 0) return;
      const s = parseYM(it.start), e = parseYM(it.end);
      if (s !== null && s > ws && s <= we) {
        const mo = months.find(m => ymNum(m) === s);
        out.push(`<div class="card" style="padding:10px 14px;font-size:13px;color:var(--text2);"><i class="ti ti-arrow-bar-to-right pos" aria-hidden="true"></i> Ab <b>${MN[mo.m]} ${mo.y}</b> kommt <b>${FC.ui.esc(it.name)}</b> dazu</div>`);
      }
      if (e !== null && e >= ws && e < we) {
        const mo = months.find(m => ymNum(m) === e);
        out.push(`<div class="card" style="padding:10px 14px;font-size:13px;color:var(--text2);"><i class="ti ti-flag" aria-hidden="true" style="color:var(--warn);"></i> <b>${FC.ui.esc(it.name)}</b> endet nach <b>${MN[mo.m]} ${mo.y}</b></div>`);
      }
    });
    document.getElementById('dash-insights').innerHTML = out.join('');
  }

  FC.views.dash = { init, render };
})(window.FC);
