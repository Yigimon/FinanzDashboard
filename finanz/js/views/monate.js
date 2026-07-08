// Monate: aufklappbare 12-Monats-Tabelle mit Schnell-Erfassung von Einmalzahlungen
(function (FC) {
  const { eur, catIcon, esc } = FC.ui;
  const { months, MN, mkey } = FC;
  const { totals, monthEntries, effAmount } = FC.calc;
  const expanded = new Set();

  function init(el){
    el.innerHTML = `
<p class="subtext">Monat anklicken zum Aufklappen — dort lassen sich einmalige Zahlungen wie Tanken direkt erfassen oder löschen.</p>
<div class="grid-tiles" id="mon-kpis"></div>
<div class="tablecard">
<table><thead><tr><th>Monat</th><th>Einnahmen</th><th>Ausgaben</th><th>Saldo</th></tr></thead><tbody id="tbody"></tbody></table>
</div>`;
    el.addEventListener('click', e => {
      const db = e.target.closest('[data-del]');
      if (db) { FC.state.items = FC.state.items.filter(i => i.id !== Number(db.dataset.del)); FC.changed(); return; }
      const qa = e.target.closest('[data-qadd]');
      if (qa) { quickAdd(qa.dataset.qadd); return; }
      const tr = e.target.closest('tr[data-row]');
      if (tr && !e.target.closest('input,select,button')) {
        const i = Number(tr.dataset.row);
        expanded.has(i) ? expanded.delete(i) : expanded.add(i);
        render();
      }
    });
  }

  function quickAdd(i){
    const g = f => document.querySelector(`[data-f="${f}"][data-mo="${i}"]`);
    const name = g('name').value.trim(), amount = parseFloat(g('amount').value);
    if (!name || !(amount > 0)) return;
    const dateEl = g('date');
    const mo = months[Number(i)];
    const date = (dateEl && dateEl.value) || (mkey(mo) + '-01');
    FC.state.items.push({ id: FC.nextId(FC.state.items), name, amount,
      type: g('type').value, cat: g('cat').value, interval: 0, ref: 0, start: null, end: null,
      once: date.slice(0, 7), date, merchant: (g('merchant').value || '').trim() });
    FC.changed();
  }

  function render(){
    const data = months.map(mo => totals(mo));
    const maxI = data.reduce((a, d, i) => d.exp > data[a].exp ? i : a, 0);
    const minI = data.reduce((a, d, i) => d.exp < data[a].exp ? i : a, 0);
    const bestI = data.reduce((a, d, i) => d.saldo > data[a].saldo ? i : a, 0);
    const sum = data.reduce((a, d) => a + d.saldo, 0);
    document.getElementById('mon-kpis').innerHTML =
      FC.ui.tile('Sparmeister', MN[months[bestI].m], 'pos', eur(data[bestI].saldo) + ' Saldo') +
      FC.ui.tile('Teuerster Monat', MN[months[maxI].m], '', eur(data[maxI].exp) + ' Ausgaben') +
      FC.ui.tile('Günstigster Monat', MN[months[minI].m], '', eur(data[minI].exp) + ' Ausgaben') +
      FC.ui.tile('Ø Überschuss', eur(sum / 12), sum >= 0 ? 'pos' : 'neg', 'pro Monat');

    let rows = '';
    months.forEach((mo, i) => {
      const t = data[i];
      const open = expanded.has(i);
      rows += `<tr data-row="${i}" style="cursor:pointer;border-bottom:1px solid var(--border);">
<td><i class="ti ti-chevron-${open ? 'up' : 'down'}" aria-hidden="true" style="font-size:13px;color:var(--muted);"></i> ${MN[mo.m]} ${mo.y}</td>
<td class="num pos">${eur(t.inc)}</td><td class="num neg">${eur(t.exp)}</td>
<td class="num ${t.saldo >= 0 ? 'pos' : 'neg'}" style="font-weight:600;">${eur(t.saldo)}</td></tr>`;
      if (open) {
        const det = monthEntries(mo).map(e => `<div style="display:flex;align-items:center;gap:8px;padding:3px 0;font-size:12.5px;">
<span style="flex:1;color:var(--text2);text-align:left;"><i class="ti ${catIcon(e.cat)}" aria-hidden="true" style="font-size:13px;"></i> ${esc(e.name)}${e.interval === 0 ? ' <span class="chip">einmalig</span>' : e.interval === 'w' ? ' <span class="chip">wöchentlich</span>' : ''}</span>
<span class="num ${e.type === 'in' ? 'pos' : 'neg'}">${e.type === 'in' ? '+' : '−'}${eur(effAmount(e))}</span>
${e.interval === 0 ? `<button class="iconbtn" data-del="${e.id}" aria-label="Zahlung löschen"><i class="ti ti-x" style="font-size:14px"></i></button>` : '<span style="width:28px;"></span>'}</div>`).join('');
        rows += `<tr style="background:var(--surface2);"><td colspan="4" style="text-align:left;border-bottom:1px solid var(--border);">
${det || '<span style="font-size:12px;color:var(--muted);">Keine Posten in diesem Monat</span>'}
<div class="qadd">
<input data-f="name" data-mo="${i}" placeholder="z. B. Tanken" style="flex:2;min-width:100px;">
<input data-f="amount" data-mo="${i}" type="number" min="0" step="0.01" placeholder="€" style="width:76px;">
<input data-f="date" data-mo="${i}" type="date" value="${mkey(mo)}-15" style="width:auto;">
<input data-f="merchant" data-mo="${i}" placeholder="Händler" style="width:100px;">
<select data-f="type" data-mo="${i}" style="width:auto;"><option value="out">Ausgabe</option><option value="in">Einnahme</option></select>
<select data-f="cat" data-mo="${i}" style="width:auto;max-width:140px;">${FC.sortedCats().map(c => `<option>${esc(c.n)}</option>`).join('')}</select>
<button data-qadd="${i}"><i class="ti ti-plus" aria-hidden="true"></i> Buchung</button>
</div></td></tr>`;
      }
    });
    rows += `<tr style="background:var(--surface2);"><td style="font-weight:600;">Ø / Gesamt</td>
<td colspan="2" style="color:var(--text2);font-size:12px;">Ø Saldo: <span class="num" style="color:var(--text);">${eur(sum / 12)}</span></td>
<td class="num ${sum >= 0 ? 'pos' : 'neg'}" style="font-weight:600;">${eur(sum)}</td></tr>`;
    document.getElementById('tbody').innerHTML = rows;
    FC.ui.selectAll(document.getElementById('tbody'), 'select[data-f="type"], select[data-f="cat"]');
  }

  FC.views.monate = { init, render };
})(window.FC);
