// Globaler Namespace + Persistenz (localStorage)
window.FC = (function () {
  const MN = ['Januar','Februar','März','April','Mai','Juni','Juli','August','September','Oktober','November','Dezember'];
  const MS = ['Jan','Feb','Mär','Apr','Mai','Jun','Jul','Aug','Sep','Okt','Nov','Dez'];
  const IVL = {0:'einmalig', w:'wöchentlich', 1:'monatlich', 2:'alle 2 Monate', 3:'vierteljährlich', 4:'alle 4 Monate', 6:'halbjährlich', 12:'jährlich'};
  const PIE = ['#2a78d6','#1baf7a','#eda100','#008300','#4a3aa7','#e34948','#e87ba4','#eb6834','#888780','#0f766e','#b45309','#7f1d1d','#365314','#1e3a8a','#86198f','#78350f'];
  const ICONS = ['ti-wallet','ti-briefcase','ti-coins','ti-home','ti-bolt','ti-wifi','ti-shopping-cart','ti-bottle','ti-tools-kitchen-2','ti-shirt','ti-bus','ti-car','ti-gas-station','ti-shield','ti-credit-card','ti-device-tv','ti-confetti','ti-barbell','ti-plane','ti-heart','ti-book','ti-horse-toy','ti-paw','ti-gift','ti-sofa','ti-device-laptop','ti-pig-money','ti-receipt-tax','ti-baby-carriage','ti-armchair','ti-chart-line','ti-phone','ti-scissors','ti-music','ti-camera','ti-target-arrow','ti-dots'];
  const KINDS = [['ETF-Sparplan','ti-chart-line'],['Aktien','ti-trending-up'],['Krypto','ti-currency-bitcoin'],['Tagesgeld','ti-pig-money'],['Festgeld','ti-lock'],['Immobilien','ti-building'],['Gold & Rohstoffe','ti-diamond'],['Sonstiges','ti-coins']];
  // Kategorien, die als unvermeidbare Fixkosten gelten (für Fixkostenquote/Score)
  const FIXCATS = ['Wohnen & Miete','Energie & Strom','Internet & Telefon','Versicherung','Kredite','ÖPNV & Bahn','Steuern & Gebühren'];

  const DEFAULT_CATS = [
    {n:'Gehalt',i:'ti-wallet'},{n:'Nebeneinkommen',i:'ti-briefcase'},{n:'Kindergeld',i:'ti-baby-carriage'},
    {n:'Rente',i:'ti-armchair'},{n:'Kapitalerträge',i:'ti-chart-line'},
    {n:'Wohnen & Miete',i:'ti-home'},{n:'Energie & Strom',i:'ti-bolt'},{n:'Internet & Telefon',i:'ti-wifi'},
    {n:'Lebensmittel',i:'ti-shopping-cart'},{n:'Drogerie',i:'ti-bottle'},{n:'Restaurant & Café',i:'ti-tools-kitchen-2'},
    {n:'Kleidung',i:'ti-shirt'},{n:'ÖPNV & Bahn',i:'ti-bus'},{n:'Auto',i:'ti-car'},{n:'Tanken',i:'ti-gas-station'},
    {n:'Versicherung',i:'ti-shield'},{n:'Kredite',i:'ti-credit-card'},{n:'Abos & Streaming',i:'ti-device-tv'},
    {n:'Freizeit & Hobbys',i:'ti-confetti'},{n:'Sport & Fitness',i:'ti-barbell'},{n:'Urlaub & Reisen',i:'ti-plane'},
    {n:'Gesundheit',i:'ti-heart'},{n:'Bildung',i:'ti-book'},{n:'Kinder',i:'ti-horse-toy'},{n:'Haustier',i:'ti-paw'},
    {n:'Geschenke & Spenden',i:'ti-gift'},{n:'Haushalt & Möbel',i:'ti-sofa'},{n:'Technik',i:'ti-device-laptop'},
    {n:'Sparen & Vorsorge',i:'ti-pig-money'},{n:'Steuern & Gebühren',i:'ti-receipt-tax'},{n:'Sonstiges',i:'ti-dots'}
  ];

  const now = new Date();
  const curY = now.getFullYear(), curM = now.getMonth();
  const months = Array.from({length:12}, (_,i) => {
    const d = new Date(curY, curM + i, 1);
    return {y:d.getFullYear(), m:d.getMonth()};
  });
  const mkey = mo => mo.y + '-' + String(mo.m + 1).padStart(2, '0');

  function seedItems(){
    return [
      {id:1,name:'Gehalt',amount:3200,type:'in',cat:'Gehalt',interval:1,ref:0,start:null,end:null,once:null},
      {id:2,name:'Miete',amount:950,type:'out',cat:'Wohnen & Miete',interval:1,ref:0,start:null,end:null,once:null},
      {id:3,name:'Lebensmittel',amount:100,type:'out',cat:'Lebensmittel',interval:'w',ref:0,start:null,end:null,once:null},
      {id:4,name:'KFZ-Versicherung',amount:480,type:'out',cat:'Versicherung',interval:12,ref:2,start:null,end:null,once:null},
      {id:5,name:'Streaming-Abo',amount:13.99,type:'out',cat:'Abos & Streaming',interval:1,ref:0,start:null,end:null,once:null},
      {id:6,name:'Strom',amount:85,type:'out',cat:'Energie & Strom',interval:1,ref:0,start:null,end:null,once:null},
      {id:7,name:'Tanken',amount:65,type:'out',cat:'Tanken',interval:0,ref:0,start:null,end:null,once:mkey(months[0]),date:mkey(months[0])+'-05',merchant:'Shell'}
    ];
  }
  function seedPositions(){
    return [
      {id:1,name:'MSCI World ETF',kind:'ETF-Sparplan',value:4500,rate:150,ret:6.5},
      {id:2,name:'Tagesgeldkonto',kind:'Tagesgeld',value:2000,rate:50,ret:2.5}
    ];
  }
  // Beispiel-Verlauf: vergangene Monate als Snapshots, damit Trends sofort sichtbar sind
  function seedHistory(){
    const back = n => { const d = new Date(curY, curM - n, 1); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'); };
    return [
      {month:back(3), inc:3200, exp:1390, saldo:1810, depot:6000, liquid:5800,
        byCat:{'Wohnen & Miete':950,'Lebensmittel':390,'Restaurant & Café':55,'Tanken':55,'Freizeit & Hobbys':70,'Abos & Streaming':25}},
      {month:back(2), inc:3200, exp:1445, saldo:1755, depot:6300, liquid:6000,
        byCat:{'Wohnen & Miete':950,'Lebensmittel':405,'Restaurant & Café':68,'Tanken':60,'Freizeit & Hobbys':90,'Abos & Streaming':25}},
      {month:back(1), inc:3350, exp:1510, saldo:1840, depot:6600, liquid:6300,
        byCat:{'Wohnen & Miete':950,'Lebensmittel':420,'Restaurant & Café':82,'Tanken':62,'Freizeit & Hobbys':110,'Abos & Streaming':25}}
    ];
  }

  function seedGoals(){
    return [
      {id:1,name:'Notgroschen',icon:'ti-shield',target:10000,saved:6500,rate:200},
      {id:2,name:'Urlaub',icon:'ti-plane',target:3000,saved:1200,rate:150}
    ];
  }

  function load(key, fallback){
    try {
      const raw = localStorage.getItem('fc:' + key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (e) { return fallback; }
  }
  function save(key, val){
    try { localStorage.setItem('fc:' + key, JSON.stringify(val)); } catch (e) {}
  }

  const useEmptyStartup = load('empty', false);
  const defaultSettings = {apiKey:'', aiProvider:'anthropic', model:'claude-haiku-4-5-20251001', liquid: useEmptyStartup ? 0 : 6500, budgets:{}, theme:'auto'};

  const state = {
    items: load('items', useEmptyStartup ? [] : seedItems()),
    // Kategorien fallen immer auf die Standardliste zurück — nie leer, sonst lassen sich keine Posten anlegen
    cats: load('cats', DEFAULT_CATS),
    positions: load('positions', []),
    goals: load('goals', []),
    history: load('history', []),
    years: load('years', []),
    settings: Object.assign({}, defaultSettings, load('settings', {}))
  };

  // Migration: Einmalzahlungen älterer Stände bekommen volles Datum + Händler-Feld
  state.items.forEach(it => {
    if (it.interval === 0) {
      if (!it.date) it.date = (it.once || mkey(months[0])) + '-01';
      it.once = it.date.slice(0, 7);
      if (it.merchant === undefined) it.merchant = '';
    }
  });

  function persist(){
    localStorage.removeItem('fc:empty');
    save('items', state.items);
    save('cats', state.cats);
    save('positions', state.positions);
    save('goals', state.goals);
    save('history', state.history);
    save('years', state.years);
    save('settings', state.settings);
  }
  function nextId(list){
    return list.reduce((a, x) => Math.max(a, x.id), 0) + 1;
  }

  // Kategorien alphabetisch, „Sonstiges" immer ganz unten
  function sortedCats(){
    return state.cats.slice().sort((a, b) => {
      if (a.n === 'Sonstiges') return 1;
      if (b.n === 'Sonstiges') return -1;
      return a.n.localeCompare(b.n, 'de');
    });
  }
  function sortedCatNames(){ return sortedCats().map(c => c.n); }

  return { MN, MS, IVL, PIE, ICONS, KINDS, FIXCATS, curY, curM, months, mkey, state, persist, nextId, sortedCats, sortedCatNames, views:{} };
})();
