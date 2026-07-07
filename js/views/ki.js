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
<option value="grok">Groq</option>
</select>
<select id="ki-model" style="width:auto;">
<option value="claude-haiku-4-5-20251001">Anthropic Haiku</option>
<option value="claude-sonnet-5">Anthropic Sonnet</option>
<option value="gemini-3.5-flash">Google Gemini 3.5 Flash</option>
<option value="gemini-1.0-pro">Google Gemini 1.0 Pro</option>
<option value="gemini-1.0-ultra">Google Gemini 1.0 Ultra</option>
<option value="llama-3.3-70b-versatile">Groq Llama 3.3 70B Versatile</option>
<option value="openai/gpt-oss-20b">Groq GPT-OSS 20B</option>
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
    document.getElementById('ki-model').value = FC.state.settings.model;
    updateStatus();
    document.getElementById('ki-provider').addEventListener('change', e => {
      const provider = e.target.value;
      if (provider === 'google' && FC.state.settings.model.startsWith('claude-')) {
        document.getElementById('ki-model').value = 'gemini-3.5-flash';
      }
      if (provider === 'anthropic' && FC.state.settings.model.startsWith('gemini-')) {
        document.getElementById('ki-model').value = 'claude-haiku-4-5-20251001';
      }
      if (provider === 'grok' && (FC.state.settings.model.startsWith('claude-') || FC.state.settings.model.startsWith('gemini-'))) {
        document.getElementById('ki-model').value = 'llama-3.3-70b-versatile';
      }
      if ((provider === 'google' || provider === 'anthropic') && FC.state.settings.model.startsWith('openai/')) {
        document.getElementById('ki-model').value = provider === 'google' ? 'gemini-3.5-flash' : 'claude-haiku-4-5-20251001';
      }
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

  function fdata(){
    const r2 = v => Math.round(v * 100) / 100;
    return JSON.stringify({
      stand: mkey(months[0]),
      posten: FC.state.items.map(i => ({ name:i.name, betrag:i.amount, typ:i.type === 'in' ? 'Einnahme' : 'Ausgabe',
        kategorie:i.cat, intervall:IVL[i.interval],
        referenzmonat: (typeof i.interval === 'number' && i.interval > 1) ? MN[i.ref] : undefined,
        zahlungsmonat: i.once || undefined, start: i.start || undefined, ende: i.end || undefined })),
      depot: FC.state.positions.map(p => ({ name:p.name, art:p.kind, wert:p.value, sparrate:p.rate, rendite_pa:p.ret })),
      ziele: FC.state.goals.map(g => ({ name:g.name, ziel:g.target, gespart:g.saved, rate:g.rate })),
      verfuegbares_guthaben: FC.state.settings.liquid,
      monatsuebersicht: months.map(mo => { const t = totals(mo);
        return { monat: MN[mo.m] + ' ' + mo.y, einnahmen:r2(t.inc), ausgaben:r2(t.exp), saldo:r2(t.saldo) }; })
    });
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
        const systemText = 'Du bist ein deutschsprachiger Finanzassistent in der Web-App "Finanz-Cockpit". Hier die aktuellen Finanzdaten des Nutzers als JSON: ' + fdata() + '\nAntworten sollen knapp, konkret und mit Zahlen aus den Daten sein. Nur Fließtext und einfache Aufzählungen, kein Markdown.';
        const contents = [
          { role: 'user', parts: [{ text: systemText }] },
          ...history.map(entry => ({
            role: entry.role === 'assistant' ? 'model' : entry.role,
            parts: [{ text: entry.content }]
          }))
        ];
        body = JSON.stringify({ contents });
      } else if (provider === 'grok') {
        url = 'https://api.groq.com/openai/v1/chat/completions';
        const apiKey = FC.state.settings.apiKey;
        headers = { 'content-type':'application/json', 'Authorization': apiKey.startsWith('Bearer ') ? apiKey : 'Bearer ' + apiKey };
        const systemText = 'Du bist ein deutschsprachiger Finanzassistent in der Web-App "Finanz-Cockpit". Hier die aktuellen Finanzdaten des Nutzers als JSON: ' + fdata() + '\nAntworten sollen knapp, konkret und mit Zahlen aus den Daten sein. Nur Fließtext und einfache Aufzählungen, kein Markdown.';
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
          system: 'Du bist ein deutschsprachiger Finanzassistent in der Web-App "Finanz-Cockpit". Hier die aktuellen Finanzdaten des Nutzers als JSON: ' + fdata() +
            ' Antworte knapp, konkret und mit Zahlen aus den Daten. Nur Fließtext und einfache Aufzählungen, kein Markdown.',
          messages: history.slice(-10) });
      }

      const res = await fetch(url, { method:'POST', headers, body });
      if (!res.ok) {
        const t = await res.text();
        throw new Error('HTTP ' + res.status + ' — ' + t.slice(0, 300));
      }
      const j = await res.json();
      const txt = j.candidates?.[0]?.content?.parts?.[0]?.text ||
        (j.content || []).filter(b => b.type === 'text').map(b => b.text).join('\n') ||
        j.output || '(leere Antwort)';
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
