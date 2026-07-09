// Globaler Namespace + Persistenz (localStorage)
window.FT = (function () {
  const MN = ['Januar','Februar','März','April','Mai','Juni','Juli','August','September','Oktober','November','Dezember'];
  const ACTIVITY = [
    {v:1.2,   n:'Sitzend (wenig/keine Bewegung)'},
    {v:1.375, n:'Leicht aktiv (Sport 1–3× / Woche)'},
    {v:1.55,  n:'Moderat aktiv (Sport 3–5× / Woche)'},
    {v:1.725, n:'Sehr aktiv (Sport 6–7× / Woche)'},
    {v:1.9,   n:'Extrem aktiv (harte körperliche Arbeit)'}
  ];
  const ICONS = ['ti-user','ti-user-circle','ti-mars','ti-venus','ti-run','ti-barbell','ti-yoga','ti-bike','ti-heart'];
  const PIE = ['#c1552f','#1f7a5c','#4a4e8f','#c99a3f','#b23b3b','#5c8a8f','#8b5fa3','#7a8c3f'];

  function load(key, fallback){
    try {
      const raw = localStorage.getItem('ft:' + key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (e) { return fallback; }
  }
  function save(key, val){
    try { localStorage.setItem('ft:' + key, JSON.stringify(val)); } catch (e) {}
  }

  const defaultSettings = { theme:'auto', activeProfileId:null };

  const state = {
    profiles: load('profiles', []),
    weightEntries: load('weightEntries', []),
    settings: Object.assign({}, defaultSettings, load('settings', {}))
  };

  function persist(){
    save('profiles', state.profiles);
    save('weightEntries', state.weightEntries);
    save('settings', state.settings);
    // Geteilte DB aktualisieren (entprellt; No-op bis authentifiziert).
    if (window.FT && FT.sync) FT.sync.push();
  }
  function nextId(list){
    return list.reduce((a, x) => Math.max(a, x.id), 0) + 1;
  }

  return { MN, ACTIVITY, ICONS, PIE, state, persist, nextId, views:{} };
})();
