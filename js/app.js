// App-Start: Tabs, Initialisierung, zentrales Re-Rendering
(function (FC) {
  const TABS = ['dash','posten','monate','analyse','verlauf','tipps','ziele','erfolge','kalender','depot','ki','daten'];
  // Titel + Untertitel für die Topbar je Bereich
  const META = {
    dash:    ['Übersicht',      'Finanzscore, Monatslage und Kennzahlen auf einen Blick'],
    posten:  ['Posten',         'Wiederkehrende und einmalige Einnahmen & Ausgaben verwalten'],
    monate:  ['Monate',         '12-Monats-Vorschau mit Details je Monat'],
    analyse: ['Analyse',        'Kategorien, Sankey, Heatmap, Budgets und Trends'],
    verlauf: ['Verlauf',        'Vermögens- und Saldo-Entwicklung über die Zeit'],
    tipps:   ['Tipps',          'Automatische Spar- und Budget-Hinweise'],
    ziele:   ['Ziele',          'Sparziele planen und den Fortschritt verfolgen'],
    erfolge: ['Erfolge',        'Level, Meilensteine und Vermögens-Badges'],
    kalender:['Kalender',       'Zahlungen nach Fälligkeit im Monat'],
    depot:   ['Depot',          'Anlagen, Sparpläne und Prognose-Szenarien'],
    ki:      ['KI-Berater',     'Persönliche Finanzanalyse per KI'],
    daten:   ['Sichern & Reset','Export, Import, automatisches Backup und Zurücksetzen']
  };
  let active = 'dash';

  FC.showTab = function (name) {
    active = name;
    TABS.forEach(t => {
      document.getElementById('tab-' + t).hidden = t !== name;
      document.querySelector(`#tabs [data-tab="${t}"]`).classList.toggle('on', t === name);
    });
    const m = META[name];
    if (m) {
      const tEl = document.getElementById('page-title'); if (tEl) tEl.textContent = m[0];
      const sEl = document.getElementById('page-sub');   if (sEl) sEl.textContent = m[1];
    }
    closeNav();
    FC.views[name].render();
    enhanceInfo(document.getElementById('tab-' + name));
    window.scrollTo({ top: 0 });
  };

  // ---- Info-Popover: verschiebt Abschnitts-Erklärungen hinter ein anklickbares (i)-Symbol ----
  let popEl = null, popBtn = null;
  function ensurePop(){
    if (popEl) return popEl;
    popEl = document.createElement('div');
    popEl.className = 'infopop';
    popEl.hidden = true;
    document.body.appendChild(popEl);
    document.addEventListener('click', e => {
      if (popEl.hidden) return;
      if (popBtn && popBtn.contains(e.target)) return;
      if (!popEl.contains(e.target)) hidePop();
    });
    document.addEventListener('keydown', e => { if (e.key === 'Escape') hidePop(); });
    window.addEventListener('scroll', hidePop, true);
    window.addEventListener('resize', hidePop);
    return popEl;
  }
  function hidePop(){ if (popEl) popEl.hidden = true; if (popBtn) { popBtn.setAttribute('aria-expanded', 'false'); popBtn = null; } }
  function showPop(btn, html){
    const pop = ensurePop();
    if (popBtn === btn) { hidePop(); return; }
    if (popBtn) popBtn.setAttribute('aria-expanded', 'false');
    pop.innerHTML = html;
    pop.hidden = false;
    popBtn = btn; btn.setAttribute('aria-expanded', 'true');
    const r = btn.getBoundingClientRect();
    let left = r.right - pop.offsetWidth; if (left < 8) left = 8;
    let top = r.bottom + 6;
    if (top + pop.offsetHeight > window.innerHeight - 8) top = Math.max(8, r.top - pop.offsetHeight - 6);
    pop.style.left = left + 'px'; pop.style.top = top + 'px';
  }
  function enhanceInfo(root){
    if (!root) return;
    root.querySelectorAll('.sechead').forEach(head => {
      if (head.dataset.infoDone) return;
      const next = head.nextElementSibling;
      if (!next || !next.classList.contains('subtext')) return;
      head.dataset.infoDone = '1';
      head.classList.add('has-info');
      const html = next.innerHTML;
      next.remove();
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'infobtn';
      btn.setAttribute('aria-label', 'Erklärung anzeigen');
      btn.setAttribute('aria-expanded', 'false');
      btn.innerHTML = '<i class="ti ti-info-circle" aria-hidden="true"></i>';
      btn.addEventListener('click', e => { e.stopPropagation(); showPop(btn, html); });
      head.appendChild(btn);
    });
  }
  FC.enhanceInfo = enhanceInfo;

  // Mobile: Seitenleiste ein-/ausblenden
  const sidebar = document.querySelector('.sidebar');
  const scrim = document.getElementById('nav-scrim');
  function openNav(){ if (sidebar) sidebar.classList.add('open'); if (scrim) scrim.hidden = false; }
  function closeNav(){ if (sidebar) sidebar.classList.remove('open'); if (scrim) scrim.hidden = true; }
  const navToggle = document.getElementById('nav-toggle');
  if (navToggle) navToggle.addEventListener('click', openNav);
  if (scrim) scrim.addEventListener('click', closeNav);

  // Aktuellen Monat fortlaufend als Snapshot festhalten (Upsert; nur der laufende Monat wird berührt)
  FC.autoSnapshot = function () {
    const snap = FC.calc.snapshotNow();
    const i = FC.state.history.findIndex(s => s.month === snap.month);
    if (i >= 0) FC.state.history[i] = Object.assign({}, FC.state.history[i], snap);
    else FC.state.history.push(snap);
    FC.state.history.sort((a, b) => a.month.localeCompare(b.month));
  };

  // Nach jeder Datenänderung: Snapshot aktualisieren + speichern + neu zeichnen + Datei-Backup
  FC.changed = function () {
    FC.autoSnapshot();
    FC.persist();
    FC.views[active].render();
    enhanceInfo(document.getElementById('tab-' + active));
    if (FC.backupWrite) FC.backupWrite();
  };

  // Theme: 'auto' folgt dem System, 'light'/'dark' übersteuern es
  function applyTheme(){
    const t = FC.state.settings.theme || 'auto';
    if (t === 'auto') delete document.documentElement.dataset.theme;
    else document.documentElement.dataset.theme = t;
    const icon = document.querySelector('#theme-toggle i');
    if (icon) icon.className = 'ti ti-' + (FC.ui.isDark() ? 'sun' : 'moon');
  }
  FC.applyTheme = applyTheme;
  applyTheme();
  document.getElementById('theme-toggle').addEventListener('click', () => {
    FC.state.settings.theme = FC.ui.isDark() ? 'light' : 'dark';
    FC.persist();
    applyTheme();
    FC.views[active].render();
  });

  // Beim Start den laufenden Monat als Snapshot sicherstellen
  FC.autoSnapshot();
  FC.persist();

  TABS.forEach(t => FC.views[t].init(document.getElementById('tab-' + t)));
  document.getElementById('tabs').addEventListener('click', e => {
    const b = e.target.closest('[data-tab]');
    if (b) FC.showTab(b.dataset.tab);
  });
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { applyTheme(); FC.views[active].render(); });
  FC.showTab('dash');
})(window.FC);
