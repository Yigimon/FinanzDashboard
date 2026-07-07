// Erfolge: Gamification — Level, Vermögens-Meilensteine, Sparstreak, Abzeichen
(function (FC) {
  const { eur0, esc } = FC.ui;

  const MILESTONES = [1000, 5000, 10000, 25000, 50000, 100000, 250000, 500000, 1000000];
  const LEVELS = [
    {min:0, name:'Starter', icon:'ti-seeding'},
    {min:5000, name:'Sparer', icon:'ti-pig-money'},
    {min:25000, name:'Aufbauer', icon:'ti-building-bank'},
    {min:100000, name:'Investor', icon:'ti-trending-up'},
    {min:250000, name:'Stratege', icon:'ti-chess'},
    {min:500000, name:'Vermögensprofi', icon:'ti-diamond'},
    {min:1000000, name:'Millionär', icon:'ti-crown'}
  ];

  function init(el){
    el.innerHTML = `
<div class="card" id="e-level" style="margin-bottom:16px;"></div>
<p class="sechead" style="margin-top:0;">Vermögens-Meilensteine</p>
<div class="card" id="e-milestone" style="margin-bottom:6px;"></div>
<div class="badgegrid" id="e-milestones"></div>
<p class="sechead">Sparstreak</p>
<div class="card" id="e-streak" style="margin-bottom:16px;"></div>
<p class="sechead">Abzeichen</p>
<div class="badgegrid" id="e-badges"></div>`;
  }

  // Sparstreak = aufeinanderfolgende Snapshots (bis zuletzt) mit positivem Saldo
  function streak(){
    const hist = FC.state.history.slice().sort((a, b) => a.month.localeCompare(b.month));
    let s = 0;
    for (let i = hist.length - 1; i >= 0; i--) { if (hist[i].saldo > 0) s++; else break; }
    // aktueller Live-Monat zählt mit, wenn positiv
    if (FC.calc.totals(FC.months[0]).saldo > 0) s++;
    return s;
  }

  function badgeTile(icon, title, sub, done){
    return `<div class="badge ${done ? 'on' : ''}">
<span class="badge-ic"><i class="ti ${done ? icon : 'ti-lock'}" aria-hidden="true"></i></span>
<span class="badge-tt">${esc(title)}</span>
<span class="badge-sb">${esc(sub)}</span></div>`;
  }

  function render(){
    const nw = FC.calc.netWorth();
    const lvl = LEVELS.slice().reverse().find(l => nw >= l.min) || LEVELS[0];
    const next = LEVELS.find(l => l.min > nw);
    const lvlIdx = LEVELS.indexOf(lvl);
    const prog = next ? Math.round((nw - lvl.min) / (next.min - lvl.min) * 100) : 100;
    document.getElementById('e-level').innerHTML = `
<div style="display:flex;align-items:center;gap:16px;flex-wrap:wrap;">
<span style="width:56px;height:56px;border-radius:14px;background:color-mix(in srgb,var(--accent) 16%,transparent);color:var(--accent);display:flex;align-items:center;justify-content:center;font-size:28px;flex-shrink:0;"><i class="ti ${lvl.icon}" aria-hidden="true"></i></span>
<span style="flex:1;min-width:200px;">
<span style="display:block;font-size:12px;color:var(--text2);">Level ${lvlIdx + 1} · Vermögen ${eur0(nw)}</span>
<span style="display:block;font-size:20px;font-weight:600;">${lvl.name}</span>
<span class="pbar" style="margin-top:8px;"><span style="width:${prog}%;background:var(--accent);"></span></span>
<span style="display:block;font-size:12px;color:var(--muted);margin-top:4px;">${next ? 'Noch ' + eur0(next.min - nw) + ' bis „' + next.name + '"' : 'Höchstes Level erreicht 🎉'.replace(' 🎉','')}</span>
</span></div>`;

    // Meilenstein-Fortschritt (nächster offener)
    const nextMs = MILESTONES.find(m => nw < m);
    const prevMs = MILESTONES.filter(m => nw >= m).pop() || 0;
    const msProg = nextMs ? Math.round((nw - prevMs) / (nextMs - prevMs) * 100) : 100;
    document.getElementById('e-milestone').innerHTML = nextMs ? `
<div style="display:flex;justify-content:space-between;font-size:13px;margin-bottom:2px;"><span style="color:var(--text2);">Nächster Meilenstein</span><span class="num" style="font-weight:600;">${eur0(nextMs)}</span></div>
<span class="pbar"><span style="width:${msProg}%;background:var(--pos);"></span></span>
<p style="font-size:12px;color:var(--muted);margin:6px 0 0;">Noch <b class="num">${eur0(nextMs - nw)}</b> — aktuell ${eur0(nw)}.</p>`
      : `<p style="margin:0;font-size:14px;color:var(--pos);font-weight:600;"><i class="ti ti-crown" aria-hidden="true"></i> Alle Meilensteine erreicht.</p>`;
    document.getElementById('e-milestones').innerHTML = MILESTONES.map(m =>
      badgeTile('ti-award', eur0(m), nw >= m ? 'erreicht' : 'offen', nw >= m)).join('');

    // Streak
    const st = streak();
    document.getElementById('e-streak').innerHTML = `
<div style="display:flex;align-items:center;gap:16px;flex-wrap:wrap;">
<span style="width:56px;height:56px;border-radius:14px;background:color-mix(in srgb,var(--warn) 18%,transparent);color:var(--warn);display:flex;align-items:center;justify-content:center;font-size:26px;flex-shrink:0;"><i class="ti ti-flame" aria-hidden="true"></i></span>
<span style="flex:1;min-width:180px;">
<span style="display:block;font-size:26px;font-weight:700;">${st} ${st === 1 ? 'Monat' : 'Monate'}</span>
<span style="display:block;font-size:13px;color:var(--text2);">in Folge mit positivem Saldo (Snapshots + aktueller Monat)</span>
</span></div>`;

    // Abzeichen
    const goalsDone = FC.state.goals.filter(g => g.saved >= g.target).length;
    const kinds = new Set(FC.state.positions.map(p => p.kind)).size;
    const budgets = Object.keys(FC.state.settings.budgets || {}).length;
    const exp = FC.calc.avgExp(), inc = FC.calc.avgInc();
    const q = inc > 0 ? (1 - exp / inc) : 0;
    const ng = exp > 0 ? (Number(FC.state.settings.liquid) || 0) / exp : 0;
    const badges = [
      ['ti-target-arrow','Zielerreicher', goalsDone + ' Ziel(e) erreicht', goalsDone >= 1],
      ['ti-flame','Sparfuchs', '3 Monate Streak', st >= 3],
      ['ti-shield','Notgroschen', '6 Monatsausgaben', ng >= 6],
      ['ti-percentage','Sparquote 20 %+', 'über der Empfehlung', q >= 0.2],
      ['ti-basket','Budget-Halter', budgets + ' Budget(s) gesetzt', budgets >= 1],
      ['ti-chart-pie-2','Diversifiziert', kinds + ' Anlageklassen', kinds >= 3],
      ['ti-camera','Chronist', FC.state.history.length + ' Snapshots', FC.state.history.length >= 3],
      ['ti-coin','Erstes Vermögen', '10.000 € geknackt', FC.calc.netWorth() >= 10000]
    ];
    document.getElementById('e-badges').innerHTML = badges.map(b => badgeTile(b[0], b[1], b[2], b[3])).join('');
  }

  FC.views.erfolge = { init, render };
})(window.FC);
