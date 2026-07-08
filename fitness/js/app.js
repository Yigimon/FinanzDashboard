// App-Start: Tabs, Initialisierung, zentrales Re-Rendering
(function (FT) {
  const TABS = ['uebersicht','profile','gewicht','auswertung','daten'];
  const META = {
    uebersicht: ['Übersicht',      'Alle Profile im Vergleich'],
    profile:    ['Profile',        'Personen anlegen und verwalten'],
    gewicht:    ['Gewicht',        'Tägliche Gewichtserfassung je Profil'],
    auswertung: ['Auswertung',     'BMI, Trend, Körperfett, Kalorienbedarf, Zielprognose'],
    daten:      ['Sichern & Reset','Export, Import und Zurücksetzen']
  };
  let active = 'uebersicht';

  FT.showTab = function (name) {
    active = name;
    TABS.forEach(t => {
      document.getElementById('tab-' + t).hidden = t !== name;
      const nav = document.querySelector(`#tabs [data-tab="${t}"]`);
      nav.classList.toggle('on', t === name);
      if (t === name) nav.setAttribute('aria-current', 'page');
      else nav.removeAttribute('aria-current');
    });
    const m = META[name];
    if (m) {
      const tEl = document.getElementById('page-title'); if (tEl) tEl.textContent = m[0];
      const sEl = document.getElementById('page-sub');   if (sEl) sEl.textContent = m[1];
    }
    closeNav();
    FT.views[name].render();
    window.scrollTo({ top: 0 });
    const main = document.getElementById('main');
    if (main) main.focus({ preventScroll: true });
  };

  const sidebar = document.querySelector('.sidebar');
  const scrim = document.getElementById('nav-scrim');
  function openNav(){ if (sidebar) sidebar.classList.add('open'); if (scrim) scrim.hidden = false; }
  function closeNav(){ if (sidebar) sidebar.classList.remove('open'); if (scrim) scrim.hidden = true; }
  const navToggle = document.getElementById('nav-toggle');
  if (navToggle) navToggle.addEventListener('click', openNav);
  if (scrim) scrim.addEventListener('click', closeNav);

  FT.changed = function () {
    FT.persist();
    FT.views[active].render();
  };

  function applyTheme(){
    const t = FT.state.settings.theme || 'auto';
    if (t === 'auto') delete document.documentElement.dataset.theme;
    else document.documentElement.dataset.theme = t;
    const icon = document.querySelector('#theme-toggle i');
    if (icon) icon.className = 'ti ti-' + (FT.ui.isDark() ? 'sun' : 'moon');
  }
  document.getElementById('theme-toggle').addEventListener('click', () => {
    FT.state.settings.theme = FT.ui.isDark() ? 'light' : 'dark';
    FT.persist();
    applyTheme();
    FT.views[active].render();
  });
  applyTheme();

  FT.persist();

  TABS.forEach(t => FT.views[t].init(document.getElementById('tab-' + t)));
  document.getElementById('tabs').addEventListener('click', e => {
    const b = e.target.closest('[data-tab]');
    if (b) FT.showTab(b.dataset.tab);
  });
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { applyTheme(); FT.views[active].render(); });
  FT.showTab('uebersicht');
})(window.FT);
