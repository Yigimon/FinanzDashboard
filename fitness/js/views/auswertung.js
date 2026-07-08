// Auswertung: BMI/Trend, Körperfett, BMR/TDEE, Zielprognose fürs aktive Profil
(function (FT) {
  const { tile, chart, ax, kg, num1 } = FT.ui;
  const { bmi, bmiCategory, bodyFatNavy, bmr, tdee, trendRatePerWeek, etaWeeks, entriesFor, latestEntry } = FT.calc;
  const { MN } = FT;

  function activeProfile(){
    return FT.state.profiles.find(p => p.id === FT.state.settings.activeProfileId) || FT.state.profiles[0] || null;
  }

  function init(el){
    el.innerHTML = `
<div id="a-empty" class="empty" style="display:none;">Noch kein Profil angelegt — zuerst im Tab „Profile" ein Profil anlegen.</div>
<div id="a-body">
<div class="grid-tiles" id="a-tiles" style="margin-bottom:16px;"></div>
<p class="sechead" style="margin-top:0;">Gewichtsverlauf</p>
<div class="card" style="margin-bottom:16px;"><div class="chartbox"><canvas id="chart-gewicht" role="img" aria-label="Gewichtsverlauf über die Zeit"></canvas></div></div>
<p class="sechead">Körperfett-Schätzung (US-Navy-Methode)</p>
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
    const p = activeProfile();
    document.getElementById('a-empty').style.display = p ? 'none' : 'block';
    document.getElementById('a-body').style.display = p ? 'block' : 'none';
    if (!p) return;

    const entries = entriesFor(p.id);
    const latest = latestEntry(p.id);
    const current = latest ? latest.weightKg : p.startWeightKg;
    const bmiVal = bmi(current, p.heightCm);
    const rate = trendRatePerWeek(entries);

    document.getElementById('a-tiles').innerHTML =
      tile('Aktuelles Gewicht', kg(current), '') +
      tile('BMI', num1(bmiVal), '', bmiCategory(bmiVal)) +
      tile('Zielgewicht', kg(p.targetWeightKg), '') +
      tile('Trend / Woche', rate != null ? (rate > 0 ? '+' : '') + num1(rate) + ' kg' : '—', rate != null ? (rate < 0 ? 'pos' : rate > 0 ? 'neg' : '') : '',
        rate != null ? 'gleitender Durchschnitt, 28 Tage' : 'zu wenige Einträge');

    const A = ax();
    if (entries.length) {
      chart('chart-gewicht', {
        data: { labels: entries.map(e => e.date), datasets: [
          { type:'line', label:'Gewicht', data: entries.map(e => e.weightKg), borderColor:'#c1552f', backgroundColor:'#c1552f1a', fill:true, borderWidth:2, pointRadius:3, tension:.25 }
        ]},
        options: { responsive:true, maintainAspectRatio:false,
          plugins:{ legend:{display:false}, tooltip:{callbacks:{label:c => kg(c.parsed.y)}} },
          scales:{ x:{ticks:{color:A.muted, maxTicksLimit:8}, grid:{display:false}, border:{color:A.grid}},
            y:{ticks:{color:A.muted, callback:v => num1(v) + ' kg'}, grid:{color:A.grid}, border:{color:A.grid}} } }
      });
    } else {
      const c = document.getElementById('chart-gewicht');
      const cx = c && c.getContext('2d');
      if (cx) cx.clearRect(0, 0, c.width, c.height);
    }

    const bf = latest ? bodyFatNavy(p, latest) : null;
    document.getElementById('a-bodyfat').innerHTML = bf != null
      ? tile('Körperfett', num1(bf) + ' %', '', 'geschätzt aus Taille/Hals' + (p.sex === 'f' ? '/Hüfte' : ''))
      : '<p class="empty">Taillen-' + (p.sex === 'f' ? '/Hüft-' : '') + 'und Halsumfang im aktuellsten Eintrag angeben, um Körperfett zu berechnen (Tab „Gewicht").</p>';

    const bmrVal = bmr(p, current);
    const tdeeVal = bmrVal != null ? tdee(bmrVal, p.activityLevel) : null;
    document.getElementById('a-cal').innerHTML =
      tile('Grundumsatz (BMR)', bmrVal != null ? Math.round(bmrVal) + ' kcal' : '—', '', 'Mifflin-St-Jeor') +
      tile('Gesamtumsatz (TDEE)', tdeeVal != null ? Math.round(tdeeVal) + ' kcal' : '—', '', 'BMR × Aktivitätslevel');

    document.getElementById('a-eta').innerHTML = `<p style="margin:0;font-size:14px;color:var(--text2);">${etaText(current, p.targetWeightKg, rate)}</p>`;
  }

  FT.views.auswertung = { init, render };
})(window.FT);
