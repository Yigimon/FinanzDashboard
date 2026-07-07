// App-Start: Tabs, Initialisierung, zentrales Re-Rendering
(function (FC) {
  const TABS = ['dash','posten','monate','analyse','verlauf','tipps','ziele','erfolge','kalender','depot','ki','daten'];
  let active = 'dash';

  FC.showTab = function (name) {
    active = name;
    TABS.forEach(t => {
      document.getElementById('tab-' + t).hidden = t !== name;
      document.querySelector(`#tabs [data-tab="${t}"]`).classList.toggle('on', t === name);
    });
    FC.views[name].render();
    window.scrollTo({ top: 0 });
  };

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
