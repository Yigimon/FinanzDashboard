// Analyse: Kategorien, Monatsvergleich, Trend, Fix/Einmalig, Liquidität, Fixkostenquote, Pareto
(function (FC) {
  const { eur, eur0, tile, chart, ax, catIcon, esc } = FC.ui;
  const { months, MN, MS, PIE } = FC;
  const { totals, monthEntries, effAmount, byCategory, avgExp, avgInc, fixExpense } = FC.calc;
  let anScope = '12', anType = 'out', trendCat = '', heatMonth = '';

  function init(el){
    el.innerHTML = `
<div class="grid-tiles" id="an-kpis"></div>
<p class="sechead" style="margin-top:0;">Verteilung nach Kategorie</p>
<div class="pill-row">
<select id="an-scope" style="width:auto;"></select>
<button id="an-out" class="tabbtn on">Ausgaben</button>
<button id="an-in" class="tabbtn">Einnahmen</button>
</div>
<div class="card"><div class="piewrap" id="an-piewrap">
<div class="chartbox sm"><canvas id="chart-pie" role="img" aria-label="Kuchendiagramm der Beträge nach Kategorie"></canvas></div>
<div id="an-legend" style="display:flex;flex-direction:column;gap:6px;"></div>
</div></div>
<p class="sechead">Liquidität und Notgroschen</p>
<div class="card" style="margin-bottom:4px;">
<label class="lbl" style="max-width:280px;">Verfügbares Guthaben (Konto + Tagesgeld)
<input id="an-liquid" type="number" min="0" step="100"></label>
<div class="grid-tiles" style="margin:12px 0 0;" id="an-liqtiles"></div>
</div>
<p class="sechead">Geldfluss (Sankey)</p>
<p class="subtext">Wohin fließt dein Geld im aktuellen Monat: von den Einnahmequellen über das Budget in die Ausgaben-Kategorien und den Überschuss. Kleine Kategorien sind unter „Weitere" zusammengefasst.</p>
<div class="card"><div class="sankey-wrap" id="an-sankey"></div></div>
<p class="sechead">Händleranalyse</p>
<p class="subtext">Aggregiert alle einzelnen datierten Buchungen (mit Datum erfasste Einmalzahlungen) nach Händler.</p>
<div class="card" id="an-merchants" style="margin-bottom:4px;"></div>
<p class="sechead">Ausgaben-Heatmap</p>
<p class="subtext">Zeigt <b>einzelne Ausgaben mit Datum</b> (einmalige Zahlungen) — nicht die monatlichen Fixkosten, da diese keinen bestimmten Tag haben. So legst du sie an: Tab <b>Posten → Neuer Posten</b>, bei Zahlungsintervall <b>„einmalige Zahlung"</b> wählen und ein Datum setzen. Oder im Tab <b>Monate</b> einen Monat aufklappen und dort eine Buchung mit Datum erfassen.</p>
<div class="pill-row"><select id="an-heatmonth" style="width:auto;"></select></div>
<div class="card" id="an-heatmap"></div>
<p class="sechead">Budgets je Kategorie</p>
<p class="subtext">Lege pro Ausgaben-Kategorie ein Monatsbudget fest. Der Balken zeigt die Ausschöpfung im aktuellen Monat; Warnungen erscheinen im Tipps-Tab.</p>
<div class="card" id="an-budgets" style="margin-bottom:4px;"></div>
<p class="sechead">Fixkostenquote und Pareto</p>
<div class="grid-tiles" id="an-fixpareto" style="grid-template-columns:repeat(auto-fit,minmax(260px,1fr));"></div>
<p class="sechead">Ausgaben im Monatsvergleich — Abweichung vom Ø</p>
<p class="subtext">Rot = teurer als der 12-Monats-Durchschnitt, grün = günstiger.</p>
<div class="card"><div class="chartbox sm"><canvas id="chart-dev" role="img" aria-label="Abweichung der monatlichen Ausgaben vom Durchschnitt"></canvas></div></div>
<p class="sechead">Kategorie-Trend über 12 Monate</p>
<select id="an-trendcat" style="width:auto;margin-bottom:10px;"></select>
<div class="card"><div class="chartbox sm"><canvas id="chart-trend" role="img" aria-label="Monatliche Beträge der gewählten Kategorie"></canvas></div></div>
<p class="sechead">Wiederkehrend vs. einmalig (Ausgaben)</p>
<div class="legendrow">
<span><span class="sw" style="background:#4a4e8f;"></span>Wiederkehrend</span>
<span><span class="sw" style="background:#c1698f;"></span>Einmalig</span>
</div>
<div class="card"><div class="chartbox sm"><canvas id="chart-fix" role="img" aria-label="Wiederkehrende und einmalige Ausgaben pro Monat"></canvas></div></div>`;

    document.getElementById('an-scope').innerHTML = '<option value="12">Alle 12 Monate</option>' +
      months.map((mo, i) => `<option value="${i}">${MN[mo.m]} ${mo.y}</option>`).join('');
    document.getElementById('an-heatmonth').innerHTML = months.map((mo, i) => `<option value="${FC.mkey(mo)}">${MN[mo.m]} ${mo.y}</option>`).join('');
    heatMonth = FC.mkey(months[0]);
    document.getElementById('an-scope').addEventListener('change', e => { anScope = e.target.value; render(); });
    document.getElementById('an-heatmonth').addEventListener('change', e => { heatMonth = e.target.value; renderHeat(); });
    document.getElementById('an-trendcat').addEventListener('change', e => { trendCat = e.target.value; render(); });
    document.getElementById('an-out').addEventListener('click', () => setType('out'));
    document.getElementById('an-in').addEventListener('click', () => setType('in'));
    document.getElementById('an-liquid').addEventListener('change', e => {
      FC.state.settings.liquid = parseFloat(e.target.value) || 0;
      FC.changed();
    });
    document.getElementById('an-budgets').addEventListener('change', e => {
      const inp = e.target.closest('[data-budget]');
      if (!inp) return;
      const v = parseFloat(inp.value);
      if (v > 0) FC.state.settings.budgets[inp.dataset.budget] = v;
      else delete FC.state.settings.budgets[inp.dataset.budget];
      FC.changed();
    });
  }

  function setType(t){
    anType = t;
    document.getElementById('an-out').classList.toggle('on', t === 'out');
    document.getElementById('an-in').classList.toggle('on', t === 'in');
    render();
  }

  function renderSankey(){
    const inc = byCategory([months[0]], 'in');
    const exp = byCategory([months[0]], 'out');
    const totalInc = Object.values(inc).reduce((a, b) => a + b, 0);
    const totalExp = Object.values(exp).reduce((a, b) => a + b, 0);
    const host = document.getElementById('an-sankey');
    if (totalInc === 0 && totalExp === 0) { host.innerHTML = '<p class="empty">Noch keine Einnahmen oder Ausgaben erfasst.</p>'; return; }

    // Kleine Kategorien (<4 %) zu „Weitere" bündeln
    function group(obj, total){
      const arr = Object.entries(obj).sort((a, b) => b[1] - a[1]);
      const big = [], rest = [];
      arr.forEach(([n, v]) => (v / total >= 0.04 ? big : rest).push([n, v]));
      const restSum = rest.reduce((a, x) => a + x[1], 0);
      if (restSum > 0) big.push(['Weitere', restSum]);
      return big;
    }
    let left = group(inc, totalInc || 1);
    let right = group(exp, totalExp || 1);
    const surplus = totalInc - totalExp;
    if (surplus >= 0.5) right.push(['Überschuss / Sparen', surplus]);
    else if (surplus <= -0.5) left.push(['aus Rücklagen', -surplus]);
    const leftTotal = left.reduce((a, x) => a + x[1], 0);
    const rightTotal = right.reduce((a, x) => a + x[1], 0);
    const total = Math.max(leftTotal, rightTotal) || 1;

    const A = ax();
    const W = 900, padT = 14, gap = 6;
    const nodeCount = Math.max(left.length, right.length);
    const H = Math.max(300, nodeCount * 46 + 28);
    const usable = H - padT * 2 - gap * (nodeCount - 1);
    const scale = usable / total;
    const lx0 = 150, lw = 16, hubX0 = 430, hubW = 40, rx0 = 734, rw = 16;
    const incCol = '#1f7a5c', hubCol = A.muted, surCol = '#1f7a5c';
    const money = v => new Intl.NumberFormat('de-DE', {maximumFractionDigits:0}).format(v) + ' €';

    function stack(list){
      let y = padT; const out = [];
      list.forEach(([n, v]) => { const h = Math.max(2, v * scale); out.push({n, v, y, h}); y += h + gap; });
      return out;
    }
    const L = stack(left), R = stack(right);
    // Hub-Bänder in Reihenfolge der jeweiligen Seite
    let hy = padT; const hubLeftBands = L.map(nd => { const b = {y:hy, h:nd.h}; hy += nd.h + gap; return b; });
    hy = padT; const hubRightBands = R.map(nd => { const b = {y:hy, h:nd.h}; hy += nd.h + gap; return b; });
    const hubY = padT, hubH = leftTotal * scale;

    function ribbon(x0, y0, x1, y1, h, color){
      const cx = (x0 + x1) / 2;
      return `<path d="M ${x0} ${y0} C ${cx} ${y0}, ${cx} ${y1}, ${x1} ${y1} L ${x1} ${y1 + h} C ${cx} ${y1 + h}, ${cx} ${y0 + h}, ${x0} ${y0 + h} Z" fill="${color}" opacity="0.32"/>`;
    }
    let svg = `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="Sankey-Diagramm des Geldflusses" style="max-width:100%;height:auto;min-width:640px;">`;
    // Links Einnahmen → Hub
    L.forEach((nd, i) => { svg += ribbon(lx0 + lw, nd.y, hubX0, hubLeftBands[i].y, nd.h, incCol); });
    // Hub → Ausgaben
    R.forEach((nd, i) => { const c = nd.n.startsWith('Überschuss') ? surCol : PIE[i % PIE.length]; svg += ribbon(hubX0 + hubW, hubRightBands[i].y, rx0, nd.y, nd.h, c); });
    // Hub-Knoten
    svg += `<rect x="${hubX0}" y="${hubY}" width="${hubW}" height="${Math.max(2, hubH)}" rx="3" fill="${hubCol}"/>`;
    svg += `<text x="${hubX0 + hubW / 2}" y="${hubY - 3}" text-anchor="middle" font-size="12" fill="${A.muted}">Budget</text>`;
    // Einnahmen-Knoten + Labels (links)
    L.forEach(nd => {
      svg += `<rect x="${lx0}" y="${nd.y}" width="${lw}" height="${nd.h}" rx="3" fill="${incCol}"/>`;
      svg += `<text x="${lx0 - 6}" y="${nd.y + nd.h / 2 + 4}" text-anchor="end" font-size="12" fill="var(--text)">${esc(nd.n)} · ${money(nd.v)}</text>`;
    });
    // Ausgaben-Knoten + Labels (rechts)
    R.forEach((nd, i) => {
      const c = nd.n.startsWith('Überschuss') ? surCol : PIE[i % PIE.length];
      svg += `<rect x="${rx0}" y="${nd.y}" width="${rw}" height="${nd.h}" rx="3" fill="${c}"/>`;
      svg += `<text x="${rx0 + rw + 6}" y="${nd.y + nd.h / 2 + 4}" text-anchor="start" font-size="12" fill="var(--text)">${esc(nd.n)} · ${money(nd.v)}</text>`;
    });
    svg += '</svg>';
    host.innerHTML = svg;
  }

  function renderHeat(){
    const key = heatMonth || FC.mkey(months[0]);
    const [y, m] = key.split('-').map(Number);
    const daily = FC.calc.dailyExpense(key);
    const daysInMonth = new Date(y, m, 0).getDate();
    const firstDow = (new Date(y, m - 1, 1).getDay() + 6) % 7; // Mo=0
    const max = Math.max(1, ...Object.values(daily));
    const cells = [];
    ['Mo','Di','Mi','Do','Fr','Sa','So'].forEach(d => cells.push(`<div class="heathead">${d}</div>`));
    for (let i = 0; i < firstDow; i++) cells.push('<div></div>');
    for (let d = 1; d <= daysInMonth; d++) {
      const v = daily[d] || 0;
      const t = v / max;
      const bg = v ? `color-mix(in srgb, var(--neg) ${Math.round(18 + t * 62)}%, var(--surface2))` : 'var(--surface2)';
      const col = t > 0.55 ? '#fff' : 'var(--text2)';
      cells.push(`<div class="heatcell" style="background:${bg};color:${col};" title="${d}. ${MN[m - 1]}: ${eur(v)}">${d}</div>`);
    }
    const sum = Object.values(daily).reduce((a, b) => a + b, 0);
    // Welche Monate im Fenster haben überhaupt datierte Ausgaben?
    const monthsWithData = months.filter(mo => {
      const k = FC.mkey(mo);
      return FC.calc.transactions('out').some(t => t.date.slice(0, 7) === k);
    });
    // Auswahlfeld: Monate mit Buchungen mit einem Punkt markieren
    const sel = document.getElementById('an-heatmonth');
    const dataKeys = new Set(monthsWithData.map(mo => FC.mkey(mo)));
    sel.innerHTML = months.map(mo => {
      const k = FC.mkey(mo);
      return `<option value="${k}"${k === key ? ' selected' : ''}>${MN[mo.m]} ${mo.y}${dataKeys.has(k) ? ' •' : ''}</option>`;
    }).join('');
    let hint;
    if (sum > 0) {
      hint = `Je dunkler der Tag, desto mehr wurde ausgegeben. Summe datierter Ausgaben in diesem Monat: <b class="num">${eur(sum)}</b>.`;
    } else if (monthsWithData.length) {
      hint = `Keine datierten Buchungen in ${MN[m - 1]} ${y}. Vorhanden in: <b>${monthsWithData.map(mo => MN[mo.m] + ' ' + mo.y).join(', ')}</b> — oben im Auswahlfeld umschalten.`;
    } else {
      hint = 'Noch keine einzelnen datierten Ausgaben erfasst. Lege im Tab Posten einen Posten mit Intervall „einmalige Zahlung" und Datum an — er erscheint dann hier am jeweiligen Tag.';
    }
    document.getElementById('an-heatmap').innerHTML =
      `<div class="heatgrid">${cells.join('')}</div>
<p class="subtext" style="margin:10px 0 0;">${hint}</p>`;
  }

  function render(){
    const A = ax();
    const data = months.map(mo => totals(mo));
    const aExp = avgExp();
    const maxI = data.reduce((a, d, i) => d.exp > data[a].exp ? i : a, 0);
    const minI = data.reduce((a, d, i) => d.exp < data[a].exp ? i : a, 0);
    let big = null;
    months.forEach(mo => monthEntries(mo).forEach(e => {
      if (e.type === 'out') { const v = effAmount(e); if (!big || v > big.v) big = {n:e.name, v, mo}; }
    }));
    document.getElementById('an-kpis').innerHTML =
      tile('Teuerster Monat', MN[months[maxI].m], '', eur0(data[maxI].exp) + ' Ausgaben') +
      tile('Günstigster Monat', MN[months[minI].m], '', eur0(data[minI].exp) + ' Ausgaben') +
      tile('Ø Ausgaben / Monat', eur0(aExp), '', 'über 12 Monate') +
      (big ? tile('Größte Einzelbelastung', esc(big.n), '', eur0(big.v) + ' im ' + MN[big.mo.m]) : '');

    // Kuchendiagramm + Legende
    const scope = anScope === '12' ? months : [months[Number(anScope)]];
    const by = byCategory(scope, anType);
    const order = FC.sortedCatNames().filter(n => by[n]);
    Object.keys(by).forEach(n => { if (!order.includes(n)) order.push(n); });
    const vals = order.map(n => by[n]);
    const total = vals.reduce((a, b) => a + b, 0);
    chart('chart-pie', { type:'doughnut',
      data:{ labels:order, datasets:[{ data:vals.map(v => Math.round(v * 100) / 100),
        backgroundColor:order.map((_, i) => PIE[i % PIE.length]), borderWidth:2, borderColor:A.surface }] },
      options:{ responsive:true, maintainAspectRatio:false, cutout:'62%',
        plugins:{ legend:{display:false}, tooltip:{callbacks:{label:c => c.label + ': ' + eur(c.parsed)}} } } });
    document.getElementById('an-legend').innerHTML = total ? order.map((n, i) => {
      const p = Math.round(vals[i] / total * 100);
      return `<div style="display:flex;align-items:center;gap:8px;font-size:13px;">
<span class="sw" style="background:${PIE[i % PIE.length]};flex-shrink:0;"></span>
<i class="ti ${catIcon(n)}" aria-hidden="true" style="font-size:14px;color:var(--text2);"></i>
<span style="flex:1;">${esc(n)}</span>
<span class="num" style="color:var(--text2);">${p} %</span>
<span class="num" style="font-weight:600;min-width:88px;text-align:right;">${eur(vals[i])}</span></div>`;
    }).join('') + `<div style="border-top:1px solid var(--border);margin-top:4px;padding-top:8px;display:flex;font-size:13px;font-weight:600;"><span style="flex:1;">Gesamt</span><span class="num">${eur(total)}</span></div>`
      : '<p class="empty">Keine Daten im gewählten Zeitraum</p>';
    document.getElementById('an-piewrap').classList.toggle('empty-data', !total);

    // Liquidität / Notgroschen
    const liquid = Number(FC.state.settings.liquid) || 0;
    document.getElementById('an-liquid').value = liquid;
    const reichweite = aExp > 0 ? liquid / aExp : 0;
    const ngPct = aExp > 0 ? Math.min(100, Math.round(reichweite / 6 * 100)) : 0;
    document.getElementById('an-liqtiles').innerHTML =
      tile('Reichweite', aExp > 0 ? ((Math.round(reichweite * 10) / 10).toLocaleString('de-DE') + ' Monate') : '—',
        aExp > 0 ? (reichweite >= 6 ? 'pos' : reichweite >= 3 ? '' : 'neg') : '', 'bei aktuellem Ausgabeverhalten') +
      tile('Notgroschen-Ziel', eur0(aExp * 6), '', '6 Monatsausgaben') +
      `<div class="tile"><p class="tl">Notgroschen-Fortschritt</p><p class="tv num">${ngPct} %</p>
<span class="pbar"><span style="width:${ngPct}%;background:${ngPct >= 100 ? 'var(--pos)' : 'var(--accent)'};"></span></span></div>`;

    renderSankey();

    // Händleranalyse
    const bm = FC.calc.byMerchant('out');
    const mEntries = Object.entries(bm).sort((a, b) => b[1] - a[1]);
    const mTotal = mEntries.reduce((a, x) => a + x[1], 0);
    document.getElementById('an-merchants').innerHTML = mEntries.length ? mEntries.map(([n, v]) => {
      const p = Math.round(v / mTotal * 100);
      return `<div class="trendrow">
<i class="ti ti-building-store" aria-hidden="true" style="color:var(--text2);"></i>
<span style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${esc(n)}</span>
<span class="pbar" style="margin:0;width:90px;flex-shrink:0;"><span style="width:${p}%;background:var(--accent);"></span></span>
<span class="num" style="font-weight:600;min-width:80px;text-align:right;">${eur0(v)}</span></div>`;
    }).join('') : '<p class="empty">Noch keine datierten Buchungen mit Händler. Erfasse Einmalzahlungen im Posten- oder Monate-Tab mit Datum und Händler.</p>';

    renderHeat();

    // Budgets je Kategorie (Ist = aktueller Monat)
    const budgets = FC.state.settings.budgets || {};
    const curBy = byCategory([months[0]], 'out');
    const budgetCats = FC.sortedCatNames()
      .filter(n => curBy[n] || budgets[n] || FC.state.items.some(i => i.cat === n && i.type === 'out'));
    document.getElementById('an-budgets').innerHTML = budgetCats.length ? budgetCats.map(n => {
      const ist = Math.round((curBy[n] || 0) * 100) / 100;
      const bud = budgets[n];
      const p = bud ? Math.round(ist / bud * 100) : null;
      const col = p === null ? 'var(--border-strong)' : p >= 100 ? 'var(--neg)' : p >= 80 ? 'var(--warn)' : 'var(--pos)';
      return `<div style="display:grid;grid-template-columns:minmax(120px,1fr) 110px minmax(80px,1fr) 60px;gap:10px;align-items:center;padding:6px 0;font-size:13px;">
<span style="min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;"><i class="ti ${catIcon(n)}" aria-hidden="true" style="color:var(--text2);"></i> ${esc(n)}</span>
<input data-budget="${esc(n)}" type="number" min="0" step="10" placeholder="kein Budget" value="${bud || ''}" style="min-height:32px;padding:4px 8px;font-size:12.5px;">
<span class="pbar" style="margin:0;">${bud ? `<span style="width:${Math.min(100, p)}%;background:${col};"></span>` : ''}</span>
<span class="num" style="text-align:right;color:${bud ? col : 'var(--muted)'};">${bud ? p + ' %' : eur0(ist)}</span>
</div>`;
    }).join('') : '<p class="empty">Noch keine Ausgaben-Kategorien in Verwendung</p>';

    // Fixkostenquote + Pareto
    const inc = avgInc();
    const fixM = fixExpense();
    const fq = inc > 0 ? Math.round(fixM / inc * 100) : 0;
    const byAll = byCategory(months, 'out');
    const sorted = Object.entries(byAll).sort((a, b) => b[1] - a[1]);
    const totExp = sorted.reduce((a, x) => a + x[1], 0);
    let cum = 0; const pareto = [];
    for (const [n, v] of sorted) { if (cum / totExp >= 0.8) break; cum += v; pareto.push([n, v]); }
    document.getElementById('an-fixpareto').innerHTML = `
<div class="card"><p class="tl" style="font-size:12px;color:var(--text2);margin:0 0 4px;">Fixkostenquote</p>
<p class="tv num" style="font-size:26px;font-weight:600;margin:0;">${fq} %</p>
<span class="pbar"><span style="width:${Math.min(100, fq)}%;background:${fq <= 50 ? 'var(--pos)' : fq <= 65 ? 'var(--warn)' : 'var(--neg)'};"></span></span>
<p style="font-size:12px;color:var(--text2);margin:6px 0 0;">${eur0(fixM)}/Monat unvermeidbare Kosten (Miete, Energie, Versicherung, Kredite…). Richtwert: unter 50 % der Einnahmen.</p></div>
<div class="card"><p class="tl" style="font-size:12px;color:var(--text2);margin:0 0 8px;">Pareto: ~80 % deiner Ausgaben entstehen durch</p>
${pareto.map(([n, v]) => `<div style="display:flex;align-items:center;gap:8px;font-size:13px;padding:3px 0;">
<i class="ti ${catIcon(n)}" aria-hidden="true" style="color:var(--text2);"></i><span style="flex:1;">${esc(n)}</span>
<span class="num" style="font-weight:600;">${eur0(v)}</span>
<span class="num" style="color:var(--text2);min-width:40px;text-align:right;">${Math.round(v / totExp * 100)} %</span></div>`).join('') || '<p class="empty">Keine Ausgaben erfasst</p>'}</div>`;

    // Abweichung vom Durchschnitt
    const devs = data.map(d => Math.round((d.exp - aExp) * 100) / 100);
    chart('chart-dev', { type:'bar',
      data:{ labels:months.map(mo => MS[mo.m]),
        datasets:[{ data:devs, backgroundColor:devs.map(v => v > 0 ? '#b23b3b' : '#1f7a5c'), borderRadius:4, maxBarThickness:20 }] },
      options:{ responsive:true, maintainAspectRatio:false,
        plugins:{ legend:{display:false}, tooltip:{callbacks:{label:c => (c.parsed.y > 0 ? '+' : '') + eur(c.parsed.y) + ' ggü. Ø'}} },
        scales:{ x:{ticks:{color:A.muted, autoSkip:false}, grid:{display:false}, border:{color:A.grid}},
          y:{ticks:{color:A.muted, callback:v => (v > 0 ? '+' : '') + new Intl.NumberFormat('de-DE').format(v) + ' €'}, grid:{color:A.grid}, border:{color:A.grid}} } } });

    // Kategorie-Trend — alle Kategorien wählbar (auch selbst angelegte ohne Buchung)
    const used = new Set(FC.state.items.map(i => i.cat));
    const allCats = FC.sortedCatNames();
    if (!trendCat || !allCats.includes(trendCat))
      trendCat = allCats.find(n => used.has(n) && FC.state.items.some(i => i.cat === n && i.type === 'out')) || allCats.find(n => used.has(n)) || allCats[0] || '';
    document.getElementById('an-trendcat').innerHTML = allCats.map(n => `<option${n === trendCat ? ' selected' : ''}>${esc(n)}</option>`).join('');
    const tvals = months.map(mo => {
      let s = 0;
      monthEntries(mo).forEach(e => { if (e.cat === trendCat) s += effAmount(e); });
      return Math.round(s * 100) / 100;
    });
    const tavg = tvals.reduce((a, b) => a + b, 0) / 12;
    chart('chart-trend', {
      data:{ labels:months.map(mo => MS[mo.m]), datasets:[
        {type:'bar', label:trendCat, data:tvals, backgroundColor:'#c1552f', borderRadius:4, maxBarThickness:20},
        {type:'line', label:'Ø', data:Array(12).fill(Math.round(tavg * 100) / 100), borderColor:'#8b8a7c', borderDash:[5,4], borderWidth:2, pointRadius:0}
      ]},
      options:{ responsive:true, maintainAspectRatio:false,
        plugins:{ legend:{display:false}, tooltip:{callbacks:{label:c => c.dataset.label + ': ' + eur(c.parsed.y)}} },
        scales:{ x:{ticks:{color:A.muted, autoSkip:false}, grid:{display:false}, border:{color:A.grid}},
          y:{ticks:{color:A.muted, callback:v => new Intl.NumberFormat('de-DE').format(v) + ' €'}, grid:{color:A.grid}, border:{color:A.grid}} } } });

    // Wiederkehrend vs. einmalig
    const fixV = months.map(mo => { let s = 0; monthEntries(mo).forEach(e => { if (e.type === 'out' && e.interval !== 0) s += effAmount(e); }); return Math.round(s * 100) / 100; });
    const varV = months.map(mo => { let s = 0; monthEntries(mo).forEach(e => { if (e.type === 'out' && e.interval === 0) s += effAmount(e); }); return Math.round(s * 100) / 100; });
    chart('chart-fix', { type:'bar',
      data:{ labels:months.map(mo => MS[mo.m]), datasets:[
        {label:'Wiederkehrend', data:fixV, backgroundColor:'#4a4e8f', borderRadius:4, maxBarThickness:20},
        {label:'Einmalig', data:varV, backgroundColor:'#c1698f', borderRadius:4, maxBarThickness:20}
      ]},
      options:{ responsive:true, maintainAspectRatio:false,
        plugins:{ legend:{display:false}, tooltip:{callbacks:{label:c => c.dataset.label + ': ' + eur(c.parsed.y)}} },
        scales:{ x:{stacked:true, ticks:{color:A.muted, autoSkip:false}, grid:{display:false}, border:{color:A.grid}},
          y:{stacked:true, ticks:{color:A.muted, callback:v => new Intl.NumberFormat('de-DE').format(v) + ' €'}, grid:{color:A.grid}, border:{color:A.grid}} } } });
  }

  FC.views.analyse = { init, render };
})(window.FC);
