// UI-Hilfsfunktionen und Chart-Theme
(function (FT) {
  const kg = v => new Intl.NumberFormat('de-DE', {maximumFractionDigits:1}).format(v) + ' kg';
  const num1 = v => new Intl.NumberFormat('de-DE', {maximumFractionDigits:1}).format(v);
  const $ = sel => document.querySelector(sel);

  if (window.Chart) {
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    Chart.defaults.animation.duration = reduced ? 0 : 350;
    Chart.defaults.animation.easing = 'easeOutQuart';
    Chart.defaults.font.family = "'IBM Plex Sans', system-ui, sans-serif";
    // Offizielles Annotation-Plugin registrieren (Ziel-/Referenzlinien im Diagramm)
    const anno = window['chartjs-plugin-annotation'];
    if (anno) { try { Chart.register(anno); } catch (e) {} }
    // Zoom-Plugin (Wheel/Pinch/Pan) für den Gewichtsverlauf
    const zoom = window['chartjs-plugin-zoom'] || window.ChartZoom;
    if (zoom) { try { Chart.register(zoom.default || zoom); } catch (e) {} }
  }

  let toastWrap = null;
  function toast(message, opts){
    opts = opts || {};
    if (!toastWrap) {
      toastWrap = document.createElement('div');
      toastWrap.className = 'toastwrap';
      toastWrap.setAttribute('aria-live', 'polite');
      document.body.appendChild(toastWrap);
    }
    const el = document.createElement('div');
    el.className = 'toast';
    const txt = document.createElement('span');
    txt.textContent = message;
    el.appendChild(txt);
    let timer;
    const close = () => { clearTimeout(timer); el.style.animation = 'toast-out .18s ease-in forwards'; setTimeout(() => el.remove(), 180); };
    if (opts.label && opts.onAction) {
      const btn = document.createElement('button');
      btn.className = 'toast-action';
      btn.type = 'button';
      btn.textContent = opts.label;
      btn.addEventListener('click', () => { opts.onAction(); close(); });
      el.appendChild(btn);
    }
    const x = document.createElement('button');
    x.className = 'toast-close';
    x.type = 'button';
    x.setAttribute('aria-label', 'Schließen');
    x.innerHTML = '<i class="ti ti-x" aria-hidden="true"></i>';
    x.addEventListener('click', close);
    el.appendChild(x);
    toastWrap.appendChild(el);
    timer = setTimeout(close, opts.duration || 6000);
    return close;
  }

  function isDark(){
    const t = document.documentElement.dataset.theme;
    if (t === 'dark') return true;
    if (t === 'light') return false;
    return matchMedia('(prefers-color-scheme: dark)').matches;
  }
  function ax(){
    const dark = isDark();
    return { muted:'#8a919e', grid: dark ? '#262a33' : '#e5e7eb', surface: dark ? '#181b21' : '#ffffff' };
  }

  const charts = {};
  function chart(id, cfg){
    if (charts[id]) charts[id].destroy();
    const el = document.getElementById(id);
    if (!el) return null;
    charts[id] = new Chart(el, cfg);
    return charts[id];
  }

  // Themefähiges Dropdown statt nativem <select> (Browser-Standard-Dropdown/-Scrollbar).
  // Gleiches Zerstören-vor-Neuaufbau-Muster wie chart(): Optionen werden zuerst normal
  // auf dem <select> gesetzt, danach select() aufrufen, um Tom Select (neu) zu binden.
  const selects = {};
  function select(id, opts){
    if (selects[id]) { selects[id].destroy(); delete selects[id]; }
    const el = document.getElementById(id);
    if (!el || typeof TomSelect === 'undefined') return null;
    selects[id] = new TomSelect(el, Object.assign({ maxOptions:null }, opts));
    return selects[id];
  }

  // Persistentes Dropdown: Tom Select wird EINMAL erstellt und danach nur noch über seine
  // API aktualisiert (Optionen + Wert) — kein Zerstören/Neubauen bei jedem render(), das war
  // die Ursache für das „Spacken" der Nutzerauswahl. Wert wird lautlos gesetzt (keine Event-Schleife).
  function syncSelect(id, options, value, onChange){
    const el = document.getElementById(id);
    if (!el || typeof TomSelect === 'undefined') return null;
    let inst = selects[id];
    if (!inst) {
      el.innerHTML = '';
      inst = new TomSelect(el, { maxOptions:null, controlInput:null });
      selects[id] = inst;
      if (onChange) inst.on('change', v => onChange(v));
    }
    const key = options.map(o => o.value + '' + o.text).join('');
    if (inst._optKey !== key) {
      inst.clearOptions();
      options.forEach(o => inst.addOption({ value: String(o.value), text: o.text }));
      inst.refreshOptions(false);
      inst._optKey = key;
    }
    if (value != null && inst.getValue() !== String(value)) inst.setValue(String(value), true);
    return inst;
  }

  function tile(label, value, cls, sub){
    return `<div class="tile"><p class="tl">${label}</p><p class="tv num ${cls || ''}">${value}</p>${sub ? `<p class="ts">${sub}</p>` : ''}</div>`;
  }

  function esc(s){
    return String(s).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
  }

  FT.ui = { kg, num1, $, ax, isDark, chart, select, syncSelect, tile, esc, toast };
})(window.FT);
