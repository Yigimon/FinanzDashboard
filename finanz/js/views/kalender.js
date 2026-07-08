// Finanzkalender: fällige Zahlungen der nächsten 12 Monate
(function (FC) {
  const { eur, eur0, catIcon, esc } = FC.ui;
  const { months, MN } = FC;
  const { monthEntries, effAmount } = FC.calc;

  function init(el){
    el.innerHTML = `
<p class="subtext">Alle fälligen Zahlungen der nächsten 12 Monate. Monatlich und wöchentlich wiederkehrende Posten sind je Monat zusammengefasst, besondere Zahlungen einzeln aufgeführt.</p>
<div class="calgrid" id="cal-grid"></div>`;
  }

  function render(){
    const rate = FC.state.positions.reduce((a, p) => a + p.rate, 0);
    document.getElementById('cal-grid').innerHTML = months.map(mo => {
      const entries = monthEntries(mo);
      const special = entries.filter(e => e.interval === 0 || (typeof e.interval === 'number' && e.interval > 1));
      const regular = entries.filter(e => e.interval === 1 || e.interval === 'w');
      const regIn = regular.filter(e => e.type === 'in').reduce((a, e) => a + effAmount(e), 0);
      const regOut = regular.filter(e => e.type === 'out').reduce((a, e) => a + effAmount(e), 0);
      const lines = [];
      special.sort((a, b) => effAmount(b) - effAmount(a)).forEach(e => {
        lines.push(`<div class="calline"><i class="ti ${catIcon(e.cat)}" aria-hidden="true" style="font-size:14px;"></i>
<span>${esc(e.name)}</span>${e.interval === 0 ? '<span class="chip">einmalig</span>' : ''}
<span class="amt num ${e.type === 'in' ? 'pos' : 'neg'}">${e.type === 'in' ? '+' : '−'}${eur(effAmount(e))}</span></div>`);
      });
      if (regIn > 0) lines.push(`<div class="calline"><i class="ti ti-repeat" aria-hidden="true" style="font-size:14px;"></i><span>Wiederkehrende Einnahmen</span><span class="amt num pos">+${eur0(regIn)}</span></div>`);
      if (regOut > 0) lines.push(`<div class="calline"><i class="ti ti-repeat" aria-hidden="true" style="font-size:14px;"></i><span>Wiederkehrende Ausgaben</span><span class="amt num neg">−${eur0(regOut)}</span></div>`);
      if (rate > 0) lines.push(`<div class="calline"><i class="ti ti-chart-line" aria-hidden="true" style="font-size:14px;"></i><span>Depot-Sparpläne</span><span class="amt num" style="color:var(--accent);">${eur0(rate)}</span></div>`);
      return `<div class="card calmonth"><h3>${MN[mo.m]} ${mo.y}</h3>${lines.join('') || '<p class="empty" style="padding:8px;">Keine Zahlungen</p>'}</div>`;
    }).join('');
  }

  FC.views.kalender = { init, render };
})(window.FC);
