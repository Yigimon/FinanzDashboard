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
    FC.views[name].render();
    enhanceInfo(document.getElementById('tab-' + name));
    window.scrollTo({ top: 0 });
    const main = document.getElementById('main');
    if (main) main.focus({ preventScroll: true });
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
    // Auf schmalen Screens als breite Karte unten am Bildschirm (per CSS-Klasse), sonst am Button verankern
    if (window.innerWidth <= 640) {
      pop.classList.add('sheet');
      pop.style.left = ''; pop.style.top = '';
      return;
    }
    pop.classList.remove('sheet');
    const r = btn.getBoundingClientRect();
    let left = r.right - pop.offsetWidth; if (left < 8) left = 8;
    let top = r.bottom + 6;
    if (top + pop.offsetHeight > window.innerHeight - 8) top = Math.max(8, r.top - pop.offsetHeight - 6);
    pop.style.left = left + 'px'; pop.style.top = top + 'px';
  }
  // (i)-Symbol an eine Überschrift hängen (bzw. weitere Erklärung anhängen)
  function attachInfo(head, html){
    let btn = head.querySelector(':scope > .infobtn');
    if (btn) { btn._html += '<div class="infosep"></div>' + html; return; }
    head.classList.add('has-info');
    btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'infobtn';
    btn.setAttribute('aria-label', 'Erklärung anzeigen');
    btn.setAttribute('aria-expanded', 'false');
    btn.innerHTML = '<i class="ti ti-info-circle" aria-hidden="true"></i>';
    btn._html = html;
    btn.addEventListener('click', e => { e.stopPropagation(); showPop(btn, btn._html); });
    head.appendChild(btn);
  }

  // (i)-Symbol neben dem Seitentitel für einleitende Tab-Erklärungen ohne Überschrift
  let pageInfoBtn = null;
  function ensurePageInfo(){
    if (pageInfoBtn) return pageInfoBtn;
    const head = document.querySelector('.topbar-head');
    pageInfoBtn = document.createElement('button');
    pageInfoBtn.type = 'button';
    pageInfoBtn.className = 'infobtn topinfo';
    pageInfoBtn.hidden = true;
    pageInfoBtn.setAttribute('aria-label', 'Erklärung anzeigen');
    pageInfoBtn.setAttribute('aria-expanded', 'false');
    pageInfoBtn.innerHTML = '<i class="ti ti-info-circle" aria-hidden="true"></i>';
    pageInfoBtn.addEventListener('click', e => { e.stopPropagation(); showPop(pageInfoBtn, pageInfoBtn._html || ''); });
    const bar = document.querySelector('.topbar');
    if (bar) bar.appendChild(pageInfoBtn);
    return pageInfoBtn;
  }
  function updatePageInfo(root){
    const btn = ensurePageInfo();
    const html = root && root.dataset.leadInfo;
    if (html) { btn._html = html; btn.hidden = false; }
    else { btn.hidden = true; if (popBtn === btn) hidePop(); }
  }

  function enhanceInfo(root){
    if (!root) return;
    const heads = Array.prototype.slice.call(root.querySelectorAll('.sechead'));
    root.querySelectorAll('p.subtext:not([id]):not([data-live])').forEach(sub => {
      // Nächste Überschrift in Dokumentreihenfolge, die vor dem Text steht
      let anchor = null;
      for (let i = 0; i < heads.length; i++) {
        if (heads[i].compareDocumentPosition(sub) & Node.DOCUMENT_POSITION_FOLLOWING) anchor = heads[i];
        else break;
      }
      const html = sub.innerHTML;
      if (anchor) { attachInfo(anchor, html); }
      else { root.dataset.leadInfo = (root.dataset.leadInfo ? root.dataset.leadInfo + '<div class="infosep"></div>' : '') + html; }
      sub.remove();
    });
    updatePageInfo(root);
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

  // Nach Übernahme eines Server-Stands (sync.js): Theme + aktuellen Tab neu aufbauen,
  // ohne lokal erneut zu speichern (applyServerState hat bereits gecacht).
  FC.reload = function () {
    applyTheme();
    FC.autoSnapshot();
    FC.views[active].render();
    enhanceInfo(document.getElementById('tab-' + active));
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
