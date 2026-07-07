// Reine Berechnungslogik — keine DOM-Zugriffe
(function (FC) {
  const { months, mkey } = FC;

  function parseYM(s){
    if (!s) return null;
    const [a, b] = s.split('-').map(Number);
    return a * 12 + (b - 1);
  }
  const ymNum = mo => mo.y * 12 + mo.m;

  // Wöchentliche Posten werden mit 52/12 auf den Monat umgerechnet
  function effAmount(it){ return it.interval === 'w' ? it.amount * 52 / 12 : it.amount; }

  function activeIn(it, mo){
    if (it.interval === 0) return it.once === mkey(mo);
    const k = ymNum(mo), s = parseYM(it.start), e = parseYM(it.end);
    if (s !== null && k < s) return false;
    if (e !== null && k > e) return false;
    if (it.interval === 'w') return true;
    return ((mo.m - it.ref + 12) % 12) % it.interval === 0;
  }

  function monthEntries(mo){ return FC.state.items.filter(it => activeIn(it, mo)); }

  function totals(mo){
    let inc = 0, exp = 0;
    monthEntries(mo).forEach(e => { e.type === 'in' ? inc += effAmount(e) : exp += effAmount(e); });
    return { inc, exp, saldo: inc - exp };
  }

  function avgSaldo(){ return months.reduce((a, mo) => a + totals(mo).saldo, 0) / 12; }
  function avgExp(){ return months.reduce((a, mo) => a + totals(mo).exp, 0) / 12; }
  function avgInc(){ return months.reduce((a, mo) => a + totals(mo).inc, 0) / 12; }

  // Summe je Kategorie über einen Zeitraum (Array von Monaten)
  function byCategory(scope, type){
    const by = {};
    scope.forEach(mo => monthEntries(mo).forEach(e => {
      if (e.type === type) by[e.cat] = (by[e.cat] || 0) + effAmount(e);
    }));
    return by;
  }

  // Depot-Hochrechnung einer Position: monatlicher Zinseszins + Sparrate
  function project(p, years, retOverride){
    let v = p.value, paid = p.value;
    const r = (retOverride !== undefined ? retOverride : p.ret) / 100 / 12;
    const vv = [v], pp = [paid];
    for (let y = 1; y <= years; y++) {
      for (let m = 0; m < 12; m++) { v = v * (1 + r) + p.rate; paid += p.rate; }
      vv.push(v); pp.push(paid);
    }
    return { vv, pp };
  }
  function projectAll(years, retShift){
    const agg = { vv: Array(years + 1).fill(0), pp: Array(years + 1).fill(0) };
    FC.state.positions.forEach(p => {
      const r = project(p, years, retShift !== undefined ? p.ret + retShift : undefined);
      r.vv.forEach((v, i) => agg.vv[i] += v);
      r.pp.forEach((v, i) => agg.pp[i] += v);
    });
    return agg;
  }

  // Fixkostenquote: wiederkehrende Ausgaben in FIXCATS im Verhältnis zu Ø Einnahmen
  function fixExpense(){
    let fix = 0;
    months.forEach(mo => monthEntries(mo).forEach(e => {
      if (e.type === 'out' && e.interval !== 0 && FC.FIXCATS.includes(e.cat)) fix += effAmount(e);
    }));
    return fix / 12;
  }

  // Finanzscore 0–100 mit Teilwerten
  function score(){
    const inc = avgInc(), exp = avgExp(), saldo = avgSaldo();
    const liquid = Number(FC.state.settings.liquid) || 0;
    const parts = [];
    const q = inc > 0 ? (1 - exp / inc) : 0; // Sparquote
    parts.push({ name:'Sparquote', val: Math.max(0, Math.min(100, q / 0.25 * 100)), weight: 30,
      info: Math.round(q * 100) + ' % (Ziel: 25 %)' });
    const ngMonths = exp > 0 ? liquid / exp : 6;
    parts.push({ name:'Notgroschen', val: Math.max(0, Math.min(100, ngMonths / 6 * 100)), weight: 25,
      info: (Math.round(ngMonths * 10) / 10).toLocaleString('de-DE') + ' von 6 Monaten' });
    const fq = inc > 0 ? fixExpense() / inc : 1;
    parts.push({ name:'Fixkostenquote', val: Math.max(0, Math.min(100, (1 - Math.max(0, fq - 0.3) / 0.4) * 100)), weight: 20,
      info: Math.round(fq * 100) + ' % (gut: unter 50 %)' });
    parts.push({ name:'Cashflow', val: saldo > 0 ? Math.min(100, 60 + saldo / 10) : Math.max(0, 40 + saldo / 10), weight: 15,
      info: (saldo >= 0 ? '+' : '') + Math.round(saldo) + ' € Ø/Monat' });
    const rate = FC.state.positions.reduce((a, p) => a + p.rate, 0);
    const kinds = new Set(FC.state.positions.map(p => p.kind)).size;
    parts.push({ name:'Vermögensaufbau', val: Math.min(100, (rate > 0 ? 60 : 0) + kinds * 20), weight: 10,
      info: rate + ' €/Monat, ' + kinds + ' Anlageklassen' });
    const total = Math.round(parts.reduce((a, p) => a + p.val * p.weight, 0) / 100);
    return { total, parts };
  }

  // FIRE: Zielvermögen = Jahresausgaben / Entnahmerate; Jahre bis Ziel per Simulation
  function fire(monthlyExp, swr){
    const target = monthlyExp * 12 / (swr / 100);
    const rate = FC.state.positions.reduce((a, p) => a + p.rate, 0);
    let v = FC.state.positions.reduce((a, p) => a + p.value, 0);
    const totalVal = v || 1;
    const wRet = FC.state.positions.reduce((a, p) => a + p.value * p.ret, 0) / totalVal || 6;
    const r = wRet / 100 / 12;
    let m = 0;
    while (v < target && m < 720) { v = v * (1 + r) + rate; m++; }
    return { target, years: m >= 720 ? null : Math.ceil(m / 12), withdrawal: target * (swr / 100) / 12, wRet };
  }

  // Datierte Einzelbuchungen (interval 0) mit gültigem Datum
  function transactions(type){
    return FC.state.items.filter(it => it.interval === 0 && it.date && (!type || it.type === type));
  }
  // Aggregation nach Händler (nur datierte Ausgaben mit Händlernamen)
  function byMerchant(type){
    const by = {};
    transactions(type || 'out').forEach(t => {
      const m = (t.merchant || '').trim() || '(ohne Händler)';
      by[m] = (by[m] || 0) + t.amount;
    });
    return by;
  }
  // Tages-Ausgaben eines Monats (mkey), für Heatmap
  function dailyExpense(monthKey){
    const by = {};
    transactions('out').forEach(t => {
      if (t.date.slice(0, 7) === monthKey) {
        const d = Number(t.date.slice(8, 10));
        by[d] = (by[d] || 0) + t.amount;
      }
    });
    return by;
  }

  // Gesamtvermögen = Depotwert + verfügbares Guthaben (Liquidität)
  function netWorth(){
    return FC.state.positions.reduce((a, p) => a + p.value, 0) + (Number(FC.state.settings.liquid) || 0);
  }
  // Snapshot des aktuellen Live-Monats (für den Verlauf)
  function snapshotNow(){
    const mo = months[0];
    const t = totals(mo);
    return { month: mkey(mo), inc: Math.round(t.inc), exp: Math.round(t.exp), saldo: Math.round(t.saldo),
      depot: Math.round(FC.state.positions.reduce((a, p) => a + p.value, 0)),
      liquid: Math.round(Number(FC.state.settings.liquid) || 0),
      byCat: (function(){ const b = byCategory([mo], 'out'); const r = {}; Object.keys(b).forEach(k => r[k] = Math.round(b[k])); return r; })() };
  }

  // Jahre, für die Snapshots existieren (absteigend)
  function yearsInHistory(){
    const ys = new Set(FC.state.history.map(s => s.month.slice(0, 4)));
    return [...ys].sort().reverse();
  }
  // Aggregation aller Snapshots eines Kalenderjahres
  function yearAggregate(year){
    const snaps = FC.state.history.filter(s => s.month.slice(0, 4) === String(year))
      .sort((a, b) => a.month.localeCompare(b.month));
    if (!snaps.length) return null;
    let inc = 0, exp = 0; const byCat = {};
    snaps.forEach(s => {
      inc += s.inc || 0; exp += s.exp || 0;
      Object.entries(s.byCat || {}).forEach(([k, v]) => byCat[k] = (byCat[k] || 0) + v);
    });
    const first = snaps[0], last = snaps[snaps.length - 1];
    const startNw = (first.depot || 0) + (first.liquid || 0);
    const endNw = (last.depot || 0) + (last.liquid || 0);
    const bestMonth = snaps.reduce((a, s) => s.saldo > a.saldo ? s : a, snaps[0]);
    const worstMonth = snaps.reduce((a, s) => s.saldo < a.saldo ? s : a, snaps[0]);
    return { year: String(year), months: snaps.length, inc, exp, saldo: inc - exp, byCat,
      startNw, endNw, nwGrowth: endNw - startNw, savingsRate: inc > 0 ? (inc - exp) / inc : 0,
      avgSaldo: (inc - exp) / snaps.length, bestMonth: bestMonth.month, worstMonth: worstMonth.month };
  }

  FC.calc = { parseYM, ymNum, effAmount, activeIn, monthEntries, totals, avgSaldo, avgExp, avgInc,
    byCategory, project, projectAll, fixExpense, score, fire, transactions, byMerchant, dailyExpense,
    netWorth, snapshotNow, yearsInHistory, yearAggregate };
})(window.FC);
