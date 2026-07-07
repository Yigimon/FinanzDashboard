// KI-Assistent: Claude-API mit eigenem Schlüssel, Kontext = aktuelle Finanzdaten
(function (FC) {
  const { esc } = FC.ui;
  const { months, MN, IVL, mkey } = FC;
  const { totals } = FC.calc;
  let history = [];

  function init(el){
    el.innerHTML = `
<div class="card" style="margin-bottom:14px;">
<p class="sechead" style="margin:0 0 8px;"><i class="ti ti-key" aria-hidden="true" style="color:var(--violet);"></i> API-Schlüssel</p>
<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;">
<input id="ki-key" type="password" placeholder="API Key…" style="flex:1;min-width:180px;">
<select id="ki-provider" style="width:auto;">
<option value="anthropic">Anthropic</option>
<option value="google">Google AI Studio</option>
<option value="groq">Groq</option>
</select>
<select id="ki-model" style="width:auto;">
<optgroup label="Anthropic">
<option value="claude-haiku-4-5-20251001">Haiku 4.5 — schnell</option>
<option value="claude-sonnet-5">Sonnet 5 — gründlich</option>
</optgroup>
<optgroup label="Google AI Studio">
<option value="gemini-2.5-flash">Gemini 2.5 Flash — empfohlen ⚡⚡</option>
<option value="gemini-3.5-flash">Gemini 3.5 Flash — neuest ⚡⚡</option>
<option value="gemini-2.5-flash-lite">Gemini 2.5 Flash-Lite — kostenlos ⚡⚡⚡</option>
<option value="gemini-2.5-pro">Gemini 2.5 Pro — gründlich</option>
<option value="gemini-2.0-flash">Gemini 2.0 Flash — stabil ⚡</option>
<option value="gemini-2.0-flash-lite">Gemini 2.0 Flash-Lite — sehr schnell ⚡⚡</option>
<option value="gemini-flash-latest">Gemini Flash Latest — immer aktuell</option>
</optgroup>
<optgroup label="Groq (OpenAI-kompatibel)">
<option value="llama-3.3-70b-versatile">Llama 3.3 70B — kostenlos schnell</option>
<option value="llama-3.1-8b-instant">Llama 3.1 8B Instant — sehr schnell ⚡⚡</option>
<option value="mixtral-8x7b-32768">Mixtral 8x7B — gut für Deutsch</option>
<option value="gemma2-9b-it">Gemma2 9B — Google/Groq</option>
</optgroup>
</select>
<button id="ki-keysave">Speichern</button>
</div>
<p id="ki-status" class="subtext" style="margin:8px 0 0;"></p>
</div>
<div id="ki-suggestions" class="list" style="gap:8px;margin-bottom:14px;"></div>
<div id="ki-log" style="display:flex;flex-direction:column;gap:8px;margin-bottom:12px;"></div>
<div style="display:flex;gap:8px;align-items:flex-end;">
<textarea id="ki-input" rows="2" placeholder="Eigene Frage, z. B.: Wie viel gebe ich pro Jahr für Mobilität aus?" style="flex:1;resize:vertical;"></textarea>
<button id="ki-send" class="primary" style="height:44px;">Fragen</button>
</div>`;

    document.getElementById('ki-key').value = FC.state.settings.apiKey || '';
    document.getElementById('ki-provider').value = FC.state.settings.aiProvider || 'anthropic';
    // Gespeichertes Modell prüfen — existiert es noch in der Auswahl?
    const modelSel = document.getElementById('ki-model');
    const validModels = [...modelSel.options].map(o => o.value);
    const savedModel = FC.state.settings.model;
    const provider = FC.state.settings.aiProvider || 'anthropic';
    const defaults = { anthropic:'claude-haiku-4-5-20251001', google:'gemini-2.5-flash', groq:'llama-3.3-70b-versatile' };
    modelSel.value = validModels.includes(savedModel) ? savedModel : (defaults[provider] || validModels[0]);
    updateStatus();
    document.getElementById('ki-provider').addEventListener('change', e => {
      const provider = e.target.value;
      const cur = document.getElementById('ki-model').value;
      const defaults = { anthropic:'claude-haiku-4-5-20251001', google:'gemini-2.5-flash', groq:'llama-3.3-70b-versatile' };
      const belongs = { anthropic: cur.startsWith('claude-'), google: cur.startsWith('gemini-'), groq: cur.startsWith('llama-') || cur.startsWith('mixtral-') || cur.startsWith('gemma') };
      if (!belongs[provider]) document.getElementById('ki-model').value = defaults[provider];
      updateStatus();
    });
    document.getElementById('ki-keysave').addEventListener('click', () => {
      FC.state.settings.apiKey = document.getElementById('ki-key').value.trim();
      FC.state.settings.aiProvider = document.getElementById('ki-provider').value;
      FC.state.settings.model = document.getElementById('ki-model').value;
      FC.persist();
      updateStatus(true);
    });
    document.getElementById('ki-send').addEventListener('click', send);
    document.getElementById('ki-input').addEventListener('keydown', e => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
    });
    el.addEventListener('click', e => {
      const kb = e.target.closest('[data-prompt]');
      if (!kb) return;
      ask(kb.dataset.prompt);
    });
    renderSuggestions();
  }

  function updateStatus(saved){
    const st = document.getElementById('ki-status');
    if (FC.state.settings.apiKey) {
      if (FC.state.settings.aiProvider === 'google') {
        st.textContent = (saved ? 'Gespeichert. ' : '') + 'Anfragen gehen direkt an Google AI Studio. Der Schlüssel liegt im localStorage dieses Browsers — nutze die App nur auf eigenen Geräten.';      } else if (FC.state.settings.aiProvider === 'grok') {
        st.textContent = (saved ? 'Gespeichert. ' : '') + 'Anfragen gehen direkt an Groq. Der Schlüssel liegt im localStorage dieses Browsers — nutze die App nur auf eigenen Geräten.';      } else {
        st.textContent = (saved ? 'Gespeichert. ' : '') + 'Anfragen gehen direkt an die Claude-API (Modell: ' +
          (FC.state.settings.model.includes('haiku') ? 'Haiku' : 'Sonnet') + '). Der Schlüssel liegt im localStorage dieses Browsers — nutze die App nur auf eigenen Geräten.';
      }
    } else {
      st.textContent = 'Hinterlege deinen API-Schlüssel, um den Assistenten zu nutzen.';
    }
  }

  function buildDynamicSuggestions(){
    const suggestions = [];
    const expenses = FC.state.items.filter(i => i.type !== 'in');
    const catSum = expenses.reduce((acc, item) => {
      const cat = item.cat || 'Sonstiges';
      acc[cat] = (acc[cat] || 0) + item.amount;
      return acc;
    }, {});
    const sortedCats = Object.entries(catSum).sort((a, b) => b[1] - a[1]);

    if (sortedCats.length) {
      const [topCat] = sortedCats[0];
      suggestions.push({
        label: `Prüfe meine Ausgaben in "${topCat}" und nenne konkrete Einsparmöglichkeiten.`,
        prompt: `Analysiere meine Ausgaben in der Kategorie "${topCat}" und nenne konkrete Einsparpotenziale in dieser Kategorie im Verhältnis zu meinen anderen Ausgaben.`
      });
      if (sortedCats.length > 1) {
        const [secondCat] = sortedCats[1];
        suggestions.push({
          label: `Vergleiche "${topCat}" mit "${secondCat}" und finde das größte Sparpotenzial.`,
          prompt: `Vergleiche meine Ausgaben in den Kategorien "${topCat}" und "${secondCat}" und nenne, wo ich am schnellsten sparen kann.`
        });
      }
    }

    if (FC.state.goals.length) {
      const goal = FC.state.goals[0];
      suggestions.push({
        label: `Wie erreiche ich das Ziel "${goal.name}" schneller?`,
        prompt: `Mein Sparziel heißt "${goal.name}". Analysiere meinen aktuellen Stand und schlage konkrete Maßnahmen vor, um das Ziel schneller zu erreichen.`
      });
    }

    if (FC.state.positions.length) {
      suggestions.push({
        label: 'Bewerte mein Depot und nenne mögliche Verbesserungen.',
        prompt: 'Bewerte meine Depot-Aufteilung und nenne mögliche Verbesserungen, Diversifikation und Sparraten.'
      });
    }

    const liquid = Number(FC.state.settings.liquid) || 0;
    if (liquid > 0 && liquid < 2000) {
      suggestions.push({
        label: 'Wie kann ich mein verfügbares Guthaben verbessern?',
        prompt: 'Gib mir konkrete Tipps, wie ich mein verfügbares Guthaben verbessern kann, unter Berücksichtigung meiner aktuellen Einnahmen und Ausgaben.'
      });
    }

    return suggestions.slice(0, 4);
  }

  function renderSuggestions(){
    const container = document.getElementById('ki-suggestions');
    container.innerHTML = '';
    const staticPrompts = [
      { label:'Erstelle mir personalisierte Spartipps auf Basis meiner Daten', prompt:'Erstelle mir personalisierte, konkrete Spartipps auf Basis meiner Daten. Priorisiere nach Einsparpotenzial.' },
      { label:'Analysiere meine Ausgaben und finde Auffälligkeiten', prompt:'Analysiere meine Ausgaben gründlich: Auffälligkeiten, Monatsvergleiche, Verhältnis Fixkosten zu variablen Kosten, Vergleich mit üblichen Richtwerten.' },
      { label:'Schreibe mir einen kompakten Monatsbericht', prompt:'Schreibe mir einen kompakten Monatsbericht für den aktuellen Monat: Einnahmen, Ausgaben, Saldo, Besonderheiten, Ausblick.' },
      { label:'Bewerte meine Depot-Aufteilung und Sparraten', prompt:'Bewerte meine Depot-Aufteilung und Sparraten: Diversifikation, Verhältnis von Sparrate zu freiem Budget, realistische Rendite-Annahmen.' }
    ];
    const dynamic = buildDynamicSuggestions();
    [...staticPrompts, ...dynamic].forEach(item => {
      const btn = document.createElement('button');
      btn.className = 'kibtn';
      btn.textContent = item.label;
      btn.dataset.prompt = item.prompt;
      container.appendChild(btn);
    });
  }

  // Kompakter Kontext: ~80% weniger Tokens als volles JSON
  function fdata(){
    const r0 = v => Math.round(v);
    const { totals, avgSaldo, avgExp, avgInc, byCategory } = FC.calc;
    const t0 = totals(months[0]);
    const inc0 = r0(t0.inc), exp0 = r0(t0.exp), sal0 = r0(t0.saldo);
    const avgSal = r0(avgSaldo()), avgE = r0(avgExp()), avgI = r0(avgInc());
    const sq = inc0 > 0 ? Math.round((1 - exp0 / inc0) * 100) : 0;
    const depot = r0(FC.state.positions.reduce((a, p) => a + p.value, 0));
    const sparrate = r0(FC.state.positions.reduce((a, p) => a + p.rate, 0));
    const liquid = r0(Number(FC.state.settings.liquid) || 0);

    // Ausgaben nach Kategorie (aktueller Monat)
    const byCat = byCategory([months[0]], 'out');
    const topCats = Object.entries(byCat).sort((a, b) => b[1] - a[1]).slice(0, 6)
      .map(([n, v]) => n + ' ' + r0(v) + '€').join(', ');

    // Einmalige Posten kurz
    const einmalig = FC.state.items.filter(i => i.interval === 0)
      .map(i => i.name + ' ' + r0(i.amount) + '€').join(', ');

    // Wiederkehrende Posten
    const fixItems = FC.state.items.filter(i => i.interval !== 0)
      .map(i => (i.type === 'in' ? '+' : '-') + i.name + ' ' + r0(FC.calc.effAmount(i)) + '€/' +
        (i.interval === 1 ? 'M' : i.interval === 'w' ? 'W' : i.interval + 'M')).join(', ');

    // Depot
    const depotStr = FC.state.positions.map(p => p.name + ' ' + r0(p.value) + '€ (' + p.rate + '€/M, ' + p.ret + '% p.a.)').join('; ');

    // Ziele
    const zieleStr = FC.state.goals.map(g => g.name + ': ' + r0(g.saved) + '/' + r0(g.target) + '€').join('; ');

    // Verlauf letzte 3 Snapshots
    const snapStr = FC.state.history.slice(-3).map(s => s.month + ': +' + s.inc + '€/-' + s.exp + '€').join(', ');

    return [
      'Stand: ' + mkey(months[0]),
      'Monat: Einnahmen ' + inc0 + '€, Ausgaben ' + exp0 + '€, Saldo ' + sal0 + '€, Sparquote ' + sq + '%',
      'Ø/Monat: Einnahmen ' + avgI + '€, Ausgaben ' + avgE + '€, Saldo ' + avgSal + '€',
      'Top-Ausgaben: ' + (topCats || '–'),
      'Posten: ' + (fixItems || '–'),
      einmalig ? 'Einmalig: ' + einmalig : '',
      'Depot: ' + (depotStr || '–') + ' | Gesamt: ' + depot + '€, Sparrate: ' + sparrate + '€/M',
      'Guthaben: ' + liquid + '€',
      zieleStr ? 'Ziele: ' + zieleStr : '',
      snapStr ? 'Verlauf: ' + snapStr : ''
    ].filter(Boolean).join('\n');
  }

  function msg(role, text){
    const log = document.getElementById('ki-log');
    const div = document.createElement('div');
    div.className = 'msg ' + role;
    div.textContent = text;
    log.appendChild(div);
    div.scrollIntoView({ behavior:'smooth', block:'nearest' });
    return div;
  }

  function send(){
    const q = document.getElementById('ki-input').value.trim();
    if (!q) return;
    document.getElementById('ki-input').value = '';
    ask(q);
  }

  async function ask(q){
    if (!FC.state.settings.apiKey) {
      msg('err', 'Kein API-Schlüssel hinterlegt. Trage oben deinen API-Schlüssel ein und klicke auf Speichern.');
      return;
    }
    msg('user', q);
    const wait = msg('ai', 'Denke nach…');
    history.push({ role:'user', content:q });
    try {
      const provider = FC.state.settings.aiProvider || 'anthropic';
      let url, headers, body;

      if (provider === 'google') {
        url = 'https://generativelanguage.googleapis.com/v1beta/models/' + encodeURIComponent(FC.state.settings.model) + ':generateContent';
        const apiKey = FC.state.settings.apiKey;
        headers = { 'content-type':'application/json', 'x-goog-api-key': apiKey };
        if (apiKey.startsWith('Bearer ') || apiKey.startsWith('ya29.')) {
          headers.Authorization = apiKey.startsWith('Bearer ') ? apiKey : 'Bearer ' + apiKey;
        }
        const systemText = 'Du bist ein deutschsprachiger Finanzassistent in der Web-App "Finanz-Cockpit". Finanzdaten des Nutzers:\n' + fdata() + '\nAntworte knapp, konkret, mit Zahlen aus den Daten. Kein Markdown.';
        const contents = [
          { role: 'user', parts: [{ text: systemText }] },
          ...history.map(entry => ({
            role: entry.role === 'assistant' ? 'model' : entry.role,
            parts: [{ text: entry.content }]
          }))
        ];
        body = JSON.stringify({ contents });
      } else if (provider === 'groq') {
        url = 'https://api.groq.com/openai/v1/chat/completions';
        const apiKey = FC.state.settings.apiKey;
        headers = { 'content-type':'application/json', 'Authorization': apiKey.startsWith('Bearer ') ? apiKey : 'Bearer ' + apiKey };
        const systemText = 'Du bist ein deutschsprachiger Finanzassistent in der Web-App "Finanz-Cockpit". Finanzdaten des Nutzers:\n' + fdata() + '\nAntworte knapp, konkret, mit Zahlen aus den Daten. Kein Markdown.';
        const messages = [
          { role: 'system', content: systemText },
          ...history.map(entry => ({ role: entry.role, content: entry.content }))
        ];
        body = JSON.stringify({ model: FC.state.settings.model, messages });
      } else {
        url = 'https://api.anthropic.com/v1/messages';
        headers = { 'content-type':'application/json', 'x-api-key':FC.state.settings.apiKey,
          'anthropic-version':'2023-06-01', 'anthropic-dangerous-direct-browser-access':'true' };
        body = JSON.stringify({ model: FC.state.settings.model, max_tokens: 1500,
          system: 'Du bist ein deutschsprachiger Finanzassistent in der Web-App "Finanz-Cockpit". Finanzdaten des Nutzers:\n' + fdata() + '\nAntworte knapp, konkret, mit Zahlen aus den Daten. Kein Markdown.',
          messages: history.slice(-10) });
      }

      let res = await fetch(url, { method:'POST', headers, body });
      // Bei 503 (Überlast) einmal automatisch auf Gemini 1.5 Flash zurückfallen
      if (res.status === 503 && provider === 'google') {
        const fallback = 'gemini-1.5-flash';
        const fallbackUrl = 'https://generativelanguage.googleapis.com/v1beta/models/' + fallback + ':generateContent';
        res = await fetch(fallbackUrl, { method:'POST', headers, body });
      }
      if (!res.ok) {
        const t = await res.text();
        let hint = '';
        try { const j = JSON.parse(t); hint = j.error?.message || ''; } catch {}
        if (res.status === 503) throw new Error('Modell derzeit überlastet (503). Versuche es in einem Moment erneut oder wähle ein anderes Modell (z. B. Gemini 1.5 Flash). ' + (hint ? '(' + hint.slice(0, 120) + ')' : ''));
        if (res.status === 401 || res.status === 403) throw new Error('API-Schlüssel ungültig oder kein Zugriff (HTTP ' + res.status + '). Prüfe deinen Schlüssel im API-Tab.');
        if (res.status === 429) throw new Error('Rate-Limit erreicht (429). Kurz warten und erneut versuchen.');
        throw new Error('HTTP ' + res.status + (hint ? ' — ' + hint.slice(0, 200) : ' — ' + t.slice(0, 200)));
      }
      const j = await res.json();
      const txt = j.candidates?.[0]?.content?.parts?.[0]?.text ||
        j.choices?.[0]?.message?.content ||
        j.choices?.[0]?.text ||
        j.output_text ||
        j.text ||
        (j.content || []).filter(b => b.type === 'text').map(b => b.text).join('\n') ||
        j.output ||
        (typeof j === 'string' ? j : '') ||
        '(leere Antwort)';
      history.push({ role:'assistant', content:txt });
      wait.textContent = txt;
    } catch (err) {
      wait.remove();
      history.pop();
      msg('err', 'API-Aufruf fehlgeschlagen: ' + err.message +
        '\nPrüfe Schlüssel und Guthaben. Bei "401" ist der Schlüssel ungültig, bei "CORS/Failed to fetch" blockiert das Netzwerk den Aufruf.');
    }
  }

  FC.views.ki = { init, render(){} };
})(window.FC);
