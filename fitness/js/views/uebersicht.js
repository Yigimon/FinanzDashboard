// Übersicht: alle Profile im Vergleich (kein Login nötig — gemeinsames Gerät)
(function (FT) {
  const { esc, kg, num1 } = FT.ui;
  const { bmi, bmiCategory, latestEntry, entriesFor, trendRatePerWeek } = FT.calc;

  function init(el){
    el.innerHTML = `
<div id="u-empty" class="empty" style="display:none;">Noch keine Profile — lege im Tab „Profile" das erste Profil an.</div>
<div id="u-list" class="list"></div>`;
  }

  function render(){
    const profiles = FT.state.profiles;
    document.getElementById('u-empty').style.display = profiles.length ? 'none' : 'block';
    document.getElementById('u-list').innerHTML = profiles.map(p => {
      const latest = latestEntry(p.id);
      const current = latest ? latest.weightKg : p.startWeightKg;
      const bmiVal = bmi(current, p.heightCm);
      const rate = trendRatePerWeek(entriesFor(p.id));
      const wantsLoss = p.targetWeightKg < p.startWeightKg;
      const favorable = rate == null ? null : (wantsLoss ? rate < 0 : rate > 0);
      const arrowIcon = rate == null ? 'ti-minus' : rate < 0 ? 'ti-trending-down' : rate > 0 ? 'ti-trending-up' : 'ti-minus';
      const arrowCol = favorable == null ? 'var(--muted)' : favorable ? 'var(--pos)' : 'var(--neg)';
      const totalToGo = Math.abs(p.startWeightKg - p.targetWeightKg) || 1;
      const done = Math.abs(p.startWeightKg - current);
      const pct = Math.max(0, Math.min(100, Math.round(done / totalToGo * 100)));
      return `<div class="card">
<div style="display:flex;align-items:center;gap:12px;">
<span class="ic" style="width:38px;height:38px;border-radius:9px;background:color-mix(in srgb,var(--accent) 13%,transparent);color:var(--accent);display:flex;align-items:center;justify-content:center;font-size:19px;flex-shrink:0;"><i class="ti ${p.icon}" aria-hidden="true"></i></span>
<span style="flex:1;min-width:0;">
<span style="display:block;font-size:14.5px;font-weight:600;">${esc(p.name)}</span>
<span style="display:block;font-size:12px;color:var(--text2);">${kg(current)} · BMI ${num1(bmiVal)} (${bmiCategory(bmiVal)})</span>
</span>
<span style="color:${arrowCol};font-weight:600;display:flex;align-items:center;gap:4px;"><i class="ti ${arrowIcon}" aria-hidden="true"></i>${rate != null ? (rate > 0 ? '+' : '') + num1(rate) + ' kg/W' : '—'}</span>
</div>
<span class="pbar" style="margin-top:10px;"><span style="width:${pct}%;background:${pct >= 100 ? 'var(--pos)' : 'var(--accent)'};"></span></span>
<p style="font-size:12px;color:var(--muted);margin:4px 0 0;">${pct} % Richtung Ziel (${kg(p.startWeightKg)} → ${kg(p.targetWeightKg)})</p>
</div>`;
    }).join('');
  }

  FT.views.uebersicht = { init, render };
})(window.FT);
