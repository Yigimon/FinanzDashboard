// Tipps: regelbasierte, personalisierte Sparvorschläge
(function (FC) {
  const { eur, eur0, tipCard, esc } = FC.ui;
  const { months, MN } = FC;
  const { totals, monthEntries, effAmount, avgSaldo, activeIn, byCategory } = FC.calc;

  function init(el){
    el.innerHTML = `
<p class="subtext">Automatische Vorschläge auf Basis deiner Daten — aktualisieren sich bei jeder Änderung. Für eine tiefere Analyse nutze den KI-Tab.</p>
<div id="tips" class="list" style="gap:10px;"></div>`;
    el.addEventListener('click', e => {
      const ti = e.target.closest('[data-tip-invest]');
      if (ti) {
        FC.state.positions.push({ id: FC.nextId(FC.state.positions), name:'Zusätzliches Sparen',
          kind:'ETF-Sparplan', value:0, rate:Number(ti.dataset.tipInvest), ret:6.5 });
        FC.changed();
        FC.showTab('depot');
      }
      if (e.target.closest('[data-ki-jump]')) FC.showTab('ki');
    });
  }

  function render(){
    const out = [];
    const avg = avgSaldo();
    const t0 = totals(months[0]);

    if (avg > 50) {
      const sug = Math.floor(avg * 0.7 / 10) * 10;
      const r = 0.065 / 12; let v = 0;
      for (let m = 0; m < 120; m++) v = v * (1 + r) + sug;
      out.push(tipCard('ti-plant', 'var(--pos)', 'Du hast Luft zum Sparen',
        `Im Schnitt bleiben dir <b class="num">${eur0(avg)}</b> pro Monat übrig. Würdest du davon <b class="num">${eur0(sug)}</b> zusätzlich investieren (angenommen 6,5 % p. a.), hättest du nach 10 Jahren rund <b class="num">${eur0(v)}</b> zusätzlich.`,
        `<button data-tip-invest="${sug}" style="margin-top:8px;font-size:12.5px;">Als neuen Sparplan im Depot anlegen</button>`));
    } else if (avg < 0) {
      out.push(tipCard('ti-alert-triangle', 'var(--neg)', 'Achtung: negatives Budget',
        `Du gibst im Schnitt <b class="num">${eur0(-avg)}</b> mehr aus, als du einnimmst. Schau in der Analyse, welche Kategorie am stärksten zu Buche schlägt.`));
    }

    if (t0.inc > 0) {
      const q = Math.round((1 - t0.exp / t0.inc) * 100);
      // Deutsche Sparquote der privaten Haushalte: langjährig rund 10–11 %
      if (q > 11) out.push(tipCard('ti-award', 'var(--pos)', 'Über dem deutschen Durchschnitt',
        `Deine Sparquote von ${q} % liegt über dem deutschen Durchschnitt von rund 11 %.` + (q >= 20 ? ' Damit erfüllst du auch die 20-%-Empfehlung der 50/30/20-Regel.' : '')));
      else if (q < 10) out.push(tipCard('ti-percentage', 'var(--warn)', 'Niedrige Sparquote',
        `Aktuell bleiben nur ${q} % deiner Einnahmen übrig — der deutsche Durchschnitt liegt bei rund 11 %, die 50/30/20-Regel empfiehlt 20 %.`));
    }

    const abos = FC.state.items.filter(i => i.type === 'out' && i.cat === 'Abos & Streaming' && i.interval !== 0);
    if (abos.length) {
      const yearly = abos.reduce((a, i) => a + effAmount(i) * 12, 0);
      out.push(tipCard('ti-device-tv', 'var(--violet)', 'Abo-Check',
        `Du hast ${abos.length} laufende${abos.length === 1 ? 's' : ''} Abo${abos.length === 1 ? '' : 's'} (${abos.map(a => esc(a.name)).join(', ')}) mit <b class="num">${eur0(yearly)}</b> Kosten pro Jahr. Prüfe, ob du alle wirklich nutzt.`));
    }

    const by = byCategory(months, 'out');
    const exp12 = Object.values(by).reduce((a, b) => a + b, 0);
    const top = Object.entries(by).sort((a, b) => b[1] - a[1])[0];
    if (top && exp12 > 0 && top[1] / exp12 > 0.35 && top[0] !== 'Wohnen & Miete') {
      out.push(tipCard('ti-chart-pie', 'var(--warn)', 'Eine Kategorie dominiert',
        `<b>${esc(top[0])}</b> macht ${Math.round(top[1] / exp12 * 100)} % deiner Jahresausgaben aus (${eur0(top[1])}). Hier lohnt sich ein genauer Blick.`));
    }

    FC.state.items.filter(i => i.type === 'out' && typeof i.interval === 'number' && i.interval > 1).forEach(i2 => {
      const nxt = months.slice(0, 4).find(mo => activeIn(i2, mo));
      if (nxt) out.push(tipCard('ti-calendar-dollar', 'var(--accent)', 'Rücklage bilden: ' + esc(i2.name),
        `Im <b>${MN[nxt.m]} ${nxt.y}</b> werden <b class="num">${eur(i2.amount)}</b> fällig. Lege monatlich <b class="num">${eur0(i2.amount / i2.interval)}</b> zurück, dann trifft dich die Zahlung nicht auf einmal.`));
    });

    FC.state.goals.forEach(g => {
      if (g.rate > 0 && g.saved < g.target) {
        const eta = Math.ceil((g.target - g.saved) / g.rate);
        if (eta > 60) out.push(tipCard('ti-target-arrow', 'var(--warn)', 'Ziel „' + esc(g.name) + '" dauert lange',
          `Bei ${eur0(g.rate)}/Monat brauchst du noch ${eta} Monate. Eine höhere Rate würde das Ziel deutlich näher bringen.`));
      } else if (!g.rate && g.saved < g.target) {
        out.push(tipCard('ti-target-arrow', 'var(--warn)', 'Ziel „' + esc(g.name) + '" ohne Sparrate',
          'Ohne monatliche Rate kommt das Ziel nicht voran. Lege im Ziele-Tab eine Rate fest.'));
      }
    });

    const budgets = FC.state.settings.budgets || {};
    const curBy = byCategory([months[0]], 'out');
    Object.entries(budgets).forEach(([cat, bud]) => {
      const ist = curBy[cat] || 0;
      const p = Math.round(ist / bud * 100);
      if (p >= 100) out.push(tipCard('ti-alert-circle', 'var(--neg)', 'Budget überschritten: ' + esc(cat),
        `Das Budget von <b class="num">${eur0(bud)}</b> ist mit <b class="num">${eur0(ist)}</b> zu ${p} % ausgeschöpft — <b class="num">${eur0(ist - bud)}</b> darüber.`));
      else if (p >= 80) out.push(tipCard('ti-alert-triangle', 'var(--warn)', 'Budget fast erreicht: ' + esc(cat),
        `Das Budget für ${esc(cat)} wurde bereits zu <b>${p} %</b> ausgeschöpft (${eur0(ist)} von ${eur0(bud)}).`));
    });

    const totalRate = FC.state.positions.reduce((a, p) => a + p.rate, 0);
    if (totalRate > 0 && !FC.state.items.some(i => i.name === 'Depot-Sparpläne')) {
      out.push(tipCard('ti-transfer', 'var(--accent)', 'Sparraten im Budget berücksichtigen',
        `Deine Depot-Positionen haben zusammen <b class="num">${eur0(totalRate)}</b> monatliche Sparrate, die noch nicht als Ausgabe im Budget auftaucht. Im Depot-Tab kannst du sie mit einem Klick übernehmen.`));
    }

    out.push(tipCard('ti-sparkles', 'var(--violet)', 'Mehr Tipps von der KI',
      'Lass die KI deine kompletten Daten analysieren — individueller als diese Regel-Tipps.',
      '<button data-ki-jump style="margin-top:8px;font-size:12.5px;">Zum KI-Tab wechseln</button>'));

    document.getElementById('tips').innerHTML = out.join('');
  }

  FC.views.tipps = { init, render };
})(window.FC);
