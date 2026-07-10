// Berechnungen: Alter, BMI, Körperfett (US-Navy), BMR/TDEE (Mifflin-St-Jeor), Gewichtstrend, Zielprognose
(function (FT) {
  const DAY = 86400000;

  function entriesFor(profileId){
    return FT.state.weightEntries
      .filter(e => e.profileId === profileId)
      .slice()
      .sort((a, b) => a.date.localeCompare(b.date));
  }
  function latestEntry(profileId){
    const es = entriesFor(profileId);
    return es.length ? es[es.length - 1] : null;
  }

  function ageFromDob(dob){
    if (!dob) return null;
    const d = new Date(dob), now = new Date();
    let age = now.getFullYear() - d.getFullYear();
    const hadBirthday = (now.getMonth() > d.getMonth()) ||
      (now.getMonth() === d.getMonth() && now.getDate() >= d.getDate());
    if (!hadBirthday) age--;
    return age;
  }

  // BMI = kg / m² (WHO-Standard)
  function bmi(weightKg, heightCm){
    if (!weightKg || !heightCm) return null;
    const h = heightCm / 100;
    return weightKg / (h * h);
  }
  function bmiCategory(v){
    if (v == null) return '';
    if (v < 18.5) return 'Untergewicht';
    if (v < 25) return 'Normalgewicht';
    if (v < 30) return 'Übergewicht';
    return 'Adipositas';
  }

  // US-Navy-Methode (metrisch, cm) — braucht Taille+Hals (+ Hüfte bei Frauen)
  function bodyFatNavy(profile, entry){
    if (!profile || !entry) return null;
    const { heightCm, sex } = profile;
    const { waistCm, neckCm, hipCm } = entry;
    if (!heightCm || !waistCm || !neckCm) return null;
    if (sex === 'f') {
      if (!hipCm) return null;
      return 495 / (1.29579 - 0.35004 * Math.log10(waistCm + hipCm - neckCm) + 0.22100 * Math.log10(heightCm)) - 450;
    }
    return 495 / (1.0324 - 0.19077 * Math.log10(waistCm - neckCm) + 0.15456 * Math.log10(heightCm)) - 450;
  }

  // Mifflin-St-Jeor
  function bmr(profile, weightKg){
    if (!profile || !weightKg) return null;
    const age = ageFromDob(profile.dob);
    if (age == null || !profile.heightCm) return null;
    const base = 10 * weightKg + 6.25 * profile.heightCm - 5 * age;
    return profile.sex === 'f' ? base - 161 : base + 5;
  }
  function tdee(bmrVal, activityLevel){
    if (!bmrVal || !activityLevel) return null;
    return bmrVal * activityLevel;
  }

  // Fettfreie Masse & Fettmasse (kg) aus geschätztem Körperfettanteil
  function leanBodyMass(weightKg, bodyFatPct){
    if (!weightKg || bodyFatPct == null) return null;
    return weightKg * (1 - bodyFatPct / 100);
  }
  function fatMass(weightKg, bodyFatPct){
    if (!weightKg || bodyFatPct == null) return null;
    return weightKg * (bodyFatPct / 100);
  }

  // Katch-McArdle: genauer als Mifflin-St-Jeor, sobald die fettfreie Masse bekannt ist
  function bmrKatch(lbmKg){
    if (!lbmKg) return null;
    return 370 + 21.6 * lbmKg;
  }

  // Taille-zu-Größe-Verhältnis (WHtR) — laut Studien besserer Gesundheitsindikator als BMI
  function whtr(waistCm, heightCm){
    if (!waistCm || !heightCm) return null;
    return waistCm / heightCm;
  }
  function whtrCategory(v){
    if (v == null) return '';
    if (v < 0.4) return 'Niedrig';
    if (v < 0.5) return 'Gesund';
    if (v < 0.6) return 'Erhöht';
    return 'Hoch';
  }

  // Idealgewichts-Spanne für Normalgewicht (BMI 18,5–24,9)
  function idealWeightRange(heightCm){
    if (!heightCm) return null;
    const h = heightCm / 100;
    return { min: 18.5 * h * h, max: 24.9 * h * h };
  }

  // Empfohlene Tageskalorien für ein gesundes Tempo (0,5 kg/Woche ≈ 550 kcal/Tag; 7700 kcal/kg)
  // mit Sicherheitsuntergrenze (nie unter Grundumsatz bzw. 1200/1500 kcal)
  function calorieTarget(tdeeVal, bmrVal, currentWeight, targetWeight, sex){
    if (tdeeVal == null || !currentWeight || !targetWeight) return null;
    const diff = currentWeight - targetWeight;
    if (Math.abs(diff) < 0.5) return { kcal: Math.round(tdeeVal), mode: 'maintenance', ratePerWeek: 0 };
    const loss = diff > 0;
    const dailyAdjust = 0.5 * 7700 / 7; // ≈ 550 kcal/Tag
    let kcal = loss ? tdeeVal - dailyAdjust : tdeeVal + dailyAdjust;
    const floor = Math.max(bmrVal || 0, sex === 'f' ? 1200 : 1500);
    if (loss && kcal < floor) kcal = floor;
    return { kcal: Math.round(kcal), mode: loss ? 'deficit' : 'surplus', ratePerWeek: loss ? -0.5 : 0.5 };
  }

  // Gleitender Durchschnitt der letzten N Tage (ab dem jüngsten Eintrag)
  function movingAvg(entries, days){
    if (!entries.length) return null;
    const endDate = new Date(entries[entries.length - 1].date);
    const startDate = new Date(endDate.getTime() - (days - 1) * DAY);
    const within = entries.filter(e => new Date(e.date) >= startDate && new Date(e.date) <= endDate);
    if (!within.length) return null;
    return within.reduce((a, e) => a + e.weightKg, 0) / within.length;
  }

  // Trend/Woche: Vergleich zweier gleitender Durchschnitte über ein Lookback-Fenster (glättet Wasser-Schwankungen)
  function trendRatePerWeek(entries, lookbackDays){
    lookbackDays = lookbackDays || 28;
    if (entries.length < 2) return null;
    const endDate = new Date(entries[entries.length - 1].date);
    const windowStart = new Date(endDate.getTime() - lookbackDays * DAY);
    const windowEntries = entries.filter(e => new Date(e.date) >= windowStart);
    if (windowEntries.length < 2) return null;
    const recentAvg = movingAvg(windowEntries, 7);
    // Ältere Referenz: erste 7 Tage des Lookback-Fensters
    const olderStart = new Date(windowEntries[0].date);
    const olderEnd = new Date(olderStart.getTime() + 6 * DAY);
    const olderWithin = windowEntries.filter(e => { const d = new Date(e.date); return d >= olderStart && d <= olderEnd; });
    if (!olderWithin.length || recentAvg == null) return null;
    const olderAvg = olderWithin.reduce((a, e) => a + e.weightKg, 0) / olderWithin.length;
    const daysBetween = (endDate - olderStart) / DAY;
    if (daysBetween < 7) return null;
    return (recentAvg - olderAvg) / (daysBetween / 7);
  }

  // Zielprognose (analog Ziele-ETA): Wochen bis Zielgewicht bei aktueller Trendrate
  function etaWeeks(currentWeight, targetWeight, ratePerWeek){
    const diff = currentWeight - targetWeight; // >0: muss abnehmen, <0: muss zunehmen
    if (Math.abs(diff) < 0.05) return { done:true };
    if (!ratePerWeek) return { noRate:true };
    // Rate muss in Richtung des Ziels zeigen (gleiches Vorzeichen wie diff)
    if ((diff > 0 && ratePerWeek >= 0) || (diff < 0 && ratePerWeek <= 0)) return { wrongDirection:true };
    const weeks = Math.ceil(Math.abs(diff) / Math.abs(ratePerWeek));
    const date = new Date(Date.now() + weeks * 7 * DAY);
    return { weeks, date };
  }

  FT.calc = { entriesFor, latestEntry, ageFromDob, bmi, bmiCategory, bodyFatNavy, bmr, tdee,
    leanBodyMass, fatMass, bmrKatch, whtr, whtrCategory, idealWeightRange, calorieTarget,
    movingAvg, trendRatePerWeek, etaWeeks };
})(window.FT);
