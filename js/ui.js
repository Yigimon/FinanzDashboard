// UI-Hilfsfunktionen und Chart-Theme
(function (FC) {
  const eur = v => new Intl.NumberFormat('de-DE', {style:'currency', currency:'EUR'}).format(v);
  const eur0 = v => new Intl.NumberFormat('de-DE', {style:'currency', currency:'EUR', maximumFractionDigits:0}).format(v);
  const pct = v => new Intl.NumberFormat('de-DE', {maximumFractionDigits:1}).format(v) + ' %';
  const $ = sel => document.querySelector(sel);

  // Chart.js global an das Design anpassen + Animation bei „reduzierter Bewegung" abschalten
  if (window.Chart) {
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    Chart.defaults.animation = reduced ? false : { duration: 350, easing: 'easeOutQuart' };
    Chart.defaults.font.family = "'IBM Plex Sans', system-ui, sans-serif";
  }

  // Toast mit optionaler Aktion (z. B. „Rückgängig"). Stapelt sich, verschwindet automatisch.
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

  function catIcon(cat){
    const f = FC.state.cats.find(c => c.n === cat);
    return f ? f.i : 'ti-dots';
  }
  function kindIcon(k){
    const f = FC.KINDS.find(x => x[0] === k);
    return f ? f[1] : 'ti-coins';
  }

  function tile(label, value, cls, sub){
    return `<div class="tile"><p class="tl">${label}</p><p class="tv num ${cls || ''}">${value}</p>${sub ? `<p class="ts">${sub}</p>` : ''}</div>`;
  }

  function tipCard(icon, color, title, body, btn){
    return `<div class="card tipcard">
<span class="ic" style="background:color-mix(in srgb,${color} 14%,transparent);color:${color};"><i class="ti ${icon}" aria-hidden="true"></i></span>
<span style="flex:1;"><span class="tt">${title}</span><span class="tb">${body}</span>${btn || ''}</span></div>`;
  }

  function esc(s){
    return String(s).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
  }

  function monthLabel(s){
    const [y, m] = s.split('-');
    return FC.MS[m - 1] + ' ' + y;
  }

  FC.ui = { eur, eur0, pct, $, ax, isDark, chart, catIcon, kindIcon, tile, tipCard, esc, monthLabel, toast };
})(window.FC);
