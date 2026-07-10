// Auswertung: BMI/Trend, Körperzusammensetzung, BMR/TDEE, Kalorienziel, Zielprognose fürs aktive Profil
(function (FT) {
  const { tile, chart, ax, kg, num1 } = FT.ui;
  const { bmi, bmiCategory, bodyFatNavy, bmr, tdee, trendRatePerWeek, etaWeeks, entriesFor, latestEntry,
    leanBodyMass, fatMass, bmrKatch, whtr, whtrCategory, idealWeightRange, calorieTarget } = FT.calc;
  const { MN } = FT;

  function activeProfile(){
    return FT.state.profiles.find(p => p.id === FT.state.settings.activeProfileId) || FT.state.profiles[0] || null;
  }

  function init(el){
    el.innerHTML = `
<div id="a-empty" class="empty" style="display:none;">Noch kein Profil angelegt — zuerst im Tab „Profile" ein Profil anlegen.</div>
<div id="a-body">
<div class="pill-row" style="margin-bottom:14px;"><select id="a-profile" style="width:auto;" aria-label="Profil"></select></div>
<div class="grid-tiles" id="a-tiles" style="margin-bottom:16px;"></div>
<p class="sechead" style="margin-top:0;">Gewichtsverlauf</p>
<div class="card" style="margin-bottom:16px;"><div class="chartbox"><canvas id="chart-gewicht" role="img" aria-label="Gewichtsverlauf über die Zeit mit Ziel- und Idealbereich"></canvas></div></div>
<p class="sechead">Körperzusammensetzung</p>
<div class="card" id="a-bodyfat" style="margin-bottom:16px;"></div>
<p class="sechead">Kalorienbedarf</p>
<div class="grid-tiles" id="a-cal" style="margin-bottom:16px;"></div>
<p class="sechead">Zielprognose</p>
<div class="card" id="a-eta"></div>
</div>`;
  }

  function etaText(current, target, rate){
    const r = etaWeeks(current, target, rate);
    if (r.done) return 'Ziel erreicht';
    if (r.noRate) return 'Noch keine Trendrate erkennbar — mindestens zwei Einträge über mehrere Tage nötig';
    if (r.wrongDirection) return 'Aktueller Trend zeigt nicht Richtung Ziel — Rate hat falsches Vorzeichen';
    const d = r.date;
    return 'voraussichtlich erreicht: ' + MN[d.getMonth()] + ' ' + d.getFullYear() + ' (' + r.weeks + ' Wochen)';
  }

  function render(){
    const profiles = FT.state.profiles;
    const p = activeProfile();
    document.getElementById('a-empty').style.display = p ? 'none' : 'block';
    document.getElementById('a-body').style.display = p ? 'block' : 'none';
    if (!p) return;
    if (p.id !== FT.state.settings.activeProfileId) { FT.state.settings.activeProfileId = p.id; FT.persist(); }

    FT.ui.syncSelect('a-profile', profiles.map(pr => ({ value: pr.id, text: pr.name })), p.id, v => {
      FT.state.settings.activeProfileId = Number(v);
      FT.persist();
      render();
    });

    const entries = entriesFor(p.id);
    const latest = latestEntry(p.id);
    const current = latest ? latest.weightKg : p.startWeightKg;
    const bmiVal = bmi(current, p.heightCm);
    const rate = trendRatePerWeek(entries);
    const ideal = idealWeightRange(p.heightCm);

    document.getElementById('a-tiles').innerHTML =
      tile('Aktuelles Gewicht', kg(current), '') +
      tile('BMI', num1(bmiVal), '', bmiCategory(bmiVal)) +
      tile('Zielgewicht', kg(p.targetWeightKg), '') +
      tile('Trend / Woche', rate != null ? (rate > 0 ? '+' : '') + num1(rate) + ' kg' : '—',
        rate != null ? (rate < 0 ? 'pos' : rate > 0 ? 'neg' : '') : '',
        rate != null ? 'gleitender Durchschnitt, 28 Tage' : 'zu wenige Einträge') +
      (ideal ? tile('Idealgewicht', num1(ideal.min) + '–' + num1(ideal.max) + ' kg', '', 'BMI 18,5–24,9') : '');

    // Gewichtsverlauf: 0-Basis, Höchstwert (Start/max/Ziel) als Deckel, Ziel- und Idealband als Annotation
    const A = ax();
    if (entries.length) {
      const maxW = Math.max(p.startWeightKg, p.targetWeightKg, ...entries.map(e => e.weightKg));
      const yMax = Math.ceil(maxW);
      const annotations = {
        ziel: { type: 'line', yMin: p.targetWeightKg, yMax: p.targetWeightKg,
          borderColor: '#1f7a5c', borderWidth: 2, borderDash: [6, 4],
          label: { display: true, content: 'Ziel ' + num1(p.targetWeightKg) + ' kg', position: 'end',
            backgroundColor: '#1f7a5c', color: '#fff', font: { size: 11, weight: '600' }, padding: 4, borderRadius: 4 } },
        start: { type: 'line', yMin: p.startWeightKg, yMax: p.startWeightKg,
          borderColor: A.muted, borderWidth: 1, borderDash: [2, 3],
          label: { display: true, content: 'Start ' + num1(p.startWeightKg) + ' kg', position: 'start',
            backgroundColor: A.muted, color: '#fff', font: { size: 10 }, padding: 3, borderRadius: 4 } }
      };
      if (ideal) annotations.idealband = { type: 'box', yMin: ideal.min, yMax: ideal.max,
        backgroundColor: 'rgba(31,122,92,0.08)', borderWidth: 0 };

      chart('chart-gewicht', {
        data: { labels: entries.map(e => e.date), datasets: [
          { type: 'line', label: 'Gewicht', data: entries.map(e => e.weightKg), borderColor: '#c1552f',
            backgroundColor: '#c1552f1a', fill: true, borderWidth: 2, pointRadius: 3, tension: .25 }
        ]},
        options: { responsive: true, maintainAspectRatio: false,
          plugins: { legend: { display: false }, annotation: { annotations },
            tooltip: { callbacks: { label: c => kg(c.parsed.y) } } },
          scales: { x: { ticks: { color: A.muted, maxTicksLimit: 8 }, grid: { display: false }, border: { color: A.grid } },
            y: { min: 0, max: yMax, ticks: { color: A.muted, callback: v => num1(v) + ' kg' }, grid: { color: A.grid }, border: { color: A.grid } } } }
      });
    } else {
      const c = document.getElementById('chart-gewicht');
      const cx = c && c.getContext('2d');
      if (cx) cx.clearRect(0, 0, c.width, c.height);
    }

    // Körperzusammensetzung: Körperfett (US-Navy), fettfreie/Fettmasse, Taille-zu-Größe (WHtR)
    const bf = latest ? bodyFatNavy(p, latest) : null;
    const lbm = leanBodyMass(current, bf);
    const fm = fatMass(current, bf);
    const wh = latest ? whtr(latest.waistCm, p.heightCm) : null;
    const parts = [];
    if (bf != null) {
      parts.push(tile('Körperfett', num1(bf) + ' %', '', 'US-Navy-Methode'));
      parts.push(tile('Fettfreie Masse', num1(lbm) + ' kg', ''));
      parts.push(tile('Fettmasse', num1(fm) + ' kg', ''));
    }
    if (wh != null) {
      const cat = whtrCategory(wh);
      const cls = cat === 'Gesund' ? 'pos' : (cat === 'Hoch' || cat === 'Erhöht') ? 'neg' : '';
      parts.push(tile('Taille zu Größe', num1(wh), cls, cat + ' · gesund < 0,5'));
    }
    document.getElementById('a-bodyfat').innerHTML = parts.length
      ? '<div class="grid-tiles" style="margin:0">' + parts.join('') + '</div>'
      : '<p class="empty">Taille' + (p.sex === 'f' ? '-, Hüft-' : '-') + ' und Halsumfang im aktuellsten Eintrag angeben (Tab „Gewicht"), um Körperfett und Taille-zu-Größe zu berechnen.</p>';

    // Kalorienbedarf: BMR (Mifflin + ggf. Katch), TDEE, empfohlenes Kalorienziel
    const bmrVal = bmr(p, current);
    const bmrK = bmrKatch(lbm);
    const tdeeVal = bmrVal != null ? tdee(bmrVal, p.activityLevel) : null;
    const ct = calorieTarget(tdeeVal, bmrVal, current, p.targetWeightKg, p.sex);
    const ctSub = ct ? (ct.mode === 'deficit' ? 'zum Abnehmen (~0,5 kg/Woche)'
      : ct.mode === 'surplus' ? 'zum Zunehmen (~0,5 kg/Woche)' : 'zum Halten') : '';
    document.getElementById('a-cal').innerHTML =
      tile('Grundumsatz (Mifflin)', bmrVal != null ? Math.round(bmrVal) + ' kcal' : '—', '', 'Mifflin-St-Jeor') +
      (bmrK != null ? tile('Grundumsatz (Katch)', Math.round(bmrK) + ' kcal', '', 'genauer bei bek. Körperfett') : '') +
      tile('Gesamtumsatz (TDEE)', tdeeVal != null ? Math.round(tdeeVal) + ' kcal' : '—', '', 'BMR × Aktivitätslevel') +
      (ct ? tile('Kalorienziel', ct.kcal + ' kcal', 'pos', ctSub) : '');

    document.getElementById('a-eta').innerHTML = `<p style="margin:0;font-size:14px;color:var(--text2);">${etaText(current, p.targetWeightKg, rate)}</p>`;
  }

  FT.views.auswertung = { init, render };
})(window.FT);
