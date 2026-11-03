/* Stieber-App – Reiter „Anfragen“ (Leads), Version 2.0, Stand 01.11.2026
   Umzug aus dem Ankauf-Dashboard (leads.js, Leads 1.0 vom 26.10.2026).
   Alle Anfragen als Zeilen mit Filtern für alle Felder. Start ist „Heute dran“ (Neues, Überfälliges, heute Fälliges),
   „Alle“ zeigt die neueste Anfrage oben (Oli 01.11.2026). Spalten: letzter Kontakt, besprochen, wie weiter, nächster Kontakt.
   Kontakt erfassen (Ergebnis, besprochen, wie weiter, nächster Kontakt), Rückkehr vom Anruf öffnet das Fenster von selbst,
   Neue Anfrage, Nachfass-Entwurf, Push-Benachrichtigung, „Verkaufsakte anlegen“ bei Status 5 (Termin vereinbart).
   Die Gesamtliste kommt von der Edge Function leads_liste (nur lesend), alles andere von leads_api
   (Rollenprüfung verkauf/admin in beiden) mit denselben Aktionen und Nutzdaten wie im Dashboard:
     me · faellig · lead · kontakt · neu · entwurf · push_abo · push_test · vapid_init
   Baut auf window.EG aus eingang-core.js auf (EG.h, EG.dialog, EG.onTab …).
   Diese Datei enthält KEINE Schlüssel, Listen-IDs oder Kundendaten. Es wird nie automatisch gesendet:
   WhatsApp und Mail öffnen sich nur als Entwurf bzw. als leerer Chat (wa.me / mailto).
   Im Browser (localStorage) steht nur: der Schalter „Nur meine“ sowie Anfrage-ID und Uhrzeit des letzten Anrufs.
   Demo (?demo=1): keine Netzaufrufe, zwölf erfundene Anfragen, Aktionen wirken nur im Speicher. */
(function () {
  'use strict';
  var EG = window.EG;
  if (!EG) { console.error('eingang-leads.js: eingang-core.js fehlt.'); return; }
  var h = EG.h;

  var LS_MEINE = 'eg_anfragen_nur_meine';      // '1' = nur eigene und nicht zugeteilte Anfragen
  var LS_ANRUF = 'eg_anfragen_anruf';          // { id, t }: Anfrage, bei der zuletzt auf Telefon/WhatsApp getippt wurde
  var ANRUF_MS = 30 * 60 * 1000;               // so lange gilt der Merker
  var ANRUF_WARTE_MS = 3000;                   // bleibt die Seite so lange sichtbar (PC), öffnet sich das Fenster gleich

  /* ====================================================================
     Zustand
     ==================================================================== */
  var S = {
    root: null, me: null, initP: null, liste: null, sig: '', alle: null, alleAm: 0,
    f: { schnell: 'heute', suche: '', felder: {}, offen: false, nurMeine: false }, auf: null, max: 100, box: null, zahlEl: null,
    hinweisEl: null, chipEls: [],
    offenId: null, bekannt: null, timer: null, laedt: false, letzte: 0,
    pushMsg: null, swRegistriert: false, visHook: false, anrufTimer: null, anrufLaeuft: false
  };

  // Aus einem Push-Link (#anfragen&id=123 oder alt #leads&id=123) den Lead merken und den Reiter vorwählen.
  (function hashLesen() {
    var m = /^#(?:anfragen|leads)&id=(\d+)/.exec(location.hash || '');
    if (!m) return;
    S.offenId = m[1];
    try { localStorage.setItem('eg_tab', 'anfragen'); } catch (e) { /* privater Modus */ }
  })();

  /* ====================================================================
     Stile (nur .ld-…; der Rest kommt aus eingang.css)
     ==================================================================== */
  var CSS = ''
    + '.ld-leiste{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin:0 0 12px}'
    + '.ld-zahl:empty{display:none}'
    + '.ld-suche{margin:0 0 10px}'
    + '.ld-feldfilter{background:#fff;border:1px solid var(--border);border-radius:14px;margin:0 0 12px}'
    + '.ld-feldfilter > summary{cursor:pointer;min-height:48px;display:flex;align-items:center;gap:8px;padding:0 14px;font-weight:700}'
    + '.ld-felder{display:grid;grid-template-columns:repeat(auto-fill,minmax(190px,1fr));gap:4px 12px;padding:4px 14px 12px}'
    + '.ld-felder .feld{margin-bottom:6px}'
    + '.ld-zaehler{display:flex;flex-wrap:wrap;align-items:center;gap:10px;margin:0 0 10px;font-size:15px;font-weight:600}'
    + '.ld-tabelle{background:#fff;border:1px solid var(--border);border-radius:var(--radius);box-shadow:var(--schatten);overflow:hidden}'
    /* Raster am PC: neun Spalten, genau die in SPALTEN (Anfrage | Name | Fahrzeug | Verk. | Status | Letzter Kontakt | Besprochen | Wie weiter | Nächster Kontakt) */
    + '.ld-reihe{display:grid;grid-template-columns:66px minmax(0,1.3fr) minmax(0,1.2fr) 58px 142px 72px minmax(0,1.25fr) minmax(118px,.8fr) 86px;align-items:center;gap:8px;width:100%;min-height:48px;padding:6px 12px;border:0;border-top:1px solid var(--border);border-left:6px solid transparent;background:#fff;font-family:var(--font-body);font-size:14px;color:var(--ink);text-align:left;cursor:pointer}'
    + '.ld-reihe:hover,.ld-reihe:focus-visible{background:#F4F8FD}'
    + '.ld-reihe > span{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}'
    + '.ld-reihe.rot{border-left-color:var(--rot-text)}'
    + '.ld-reihe.zu{background:#FAFBFD;color:var(--sub)}'
    + '.ld-reihe.auf{background:#E8F0FB}'
    + '.ld-kopfreihe{min-height:38px;border-top:0;background:#EEF1F5;font-size:13px;font-weight:700;color:var(--sub);cursor:default}'
    + '.ld-kopfreihe:hover{background:#EEF1F5}'
    + '.ld-kopfreihe > span{white-space:normal;line-height:1.15}'
    + '.ld-reihe .pill{font-size:13px;padding:2px 8px}'
    + '.ld-l1{display:block;overflow:hidden;text-overflow:ellipsis}'
    + '.ld-sub{display:block;font-size:13px;line-height:1.3;color:var(--sub);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}'
    + '.ld-mk{display:inline-block;margin-left:4px;padding:0 5px;border-radius:6px;background:#E8F0FB;color:var(--blau-dark);font-size:11px;font-weight:700;line-height:16px;vertical-align:middle}'
    + '.ld-sub .ld-mk:first-child{margin-left:0}'
    + '.ld-reihe > .ld-nz{font-size:11px;line-height:1.15;white-space:normal;color:var(--sub)}'
    + '.ld-c-status .pill,.ld-m-rechts .pill{max-width:100%;overflow:hidden;text-overflow:ellipsis;vertical-align:bottom}'
    + '.ld-m{display:none}'
    + '.ld-offen{padding:10px 12px;background:#F4F8FD;border-top:1px solid var(--border)}'
    + '.ld-offen .ld-karte{margin:0}'
    + '.ld-mehr{display:flex;justify-content:center;padding:10px}'
    + '.ld-bearb{padding:0}'
    + '.ld-pop-zeile{padding:10px 12px;margin-bottom:8px;background:#F4F8FD;border-radius:12px;font-size:15px}'
    + '.ld-hinweis{font-size:14px;font-weight:400;color:var(--sub)}'
    /* Zwischenbreite: gleiche neun Spalten, enger */
    + '.ld-c-bes,.ld-c-ww{white-space:normal !important;display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:2;line-height:1.25}'
    + '@media (min-width:900px) and (max-width:1099px){.ld-reihe{grid-template-columns:58px minmax(0,1.2fr) minmax(0,1.1fr) 54px 124px 68px minmax(0,1.1fr) minmax(100px,.8fr) 78px;gap:6px;padding:6px 10px;font-size:13px}}'
    /* Handy (unter 900 px): drei Zeilen. Name | Status + nächster Kontakt / Fahrzeug · Verkäufer · IZ · Fin / letzter Kontakt: besprochen → wie weiter */
    + '@media (max-width:899px){.ld-reihe{grid-template-columns:minmax(0,1fr) fit-content(58%);grid-template-areas:"n r" "f f" "l l";gap:0 8px;padding:8px 10px;align-items:start}'
    +   '.ld-reihe > .ld-c-x,.ld-reihe > .ld-c-an,.ld-kopfreihe,.ld-c-name .ld-sub{display:none !important}'
    +   '.ld-c-name{grid-area:n;white-space:normal !important;font-size:16px;line-height:1.3}'
    +   '.ld-c-name .ld-l1{overflow:visible;white-space:normal}'
    +   '.ld-reihe > .ld-m{display:block}'
    +   '.ld-reihe > .ld-m-rechts{grid-area:r;display:flex;flex-wrap:wrap;justify-content:flex-end;align-items:center;gap:4px 6px}'
    +   '.ld-reihe > .ld-m-fzg{grid-area:f;margin-top:2px;font-size:14px}'
    +   '.ld-reihe > .ld-m-letzt{grid-area:l;margin-top:2px;font-size:13px;color:var(--sub)}}'
    + '.ld-h{display:flex;align-items:center;gap:8px;margin:20px 0 10px;font-size:18px}'
    + 'summary.ld-h{cursor:pointer;min-height:44px}'
    + '.ld-zahl{background:#E8F0FB;color:var(--blau-dark);border-radius:999px;padding:1px 11px;font-size:14px;font-weight:700}'
    + '.ld-karte{display:flex;flex-direction:column;margin-bottom:14px;overflow-wrap:anywhere}'
    + '.raster > .ld-karte{margin-bottom:0}'
    + '.ld-hell{outline:3px solid rgba(0,123,255,.45)}'
    + '.ld-name{font-family:var(--font-heading);font-weight:700;font-size:18px}'
    + '.ld-pills{display:flex;flex-wrap:wrap;gap:6px;align-items:center}'
    + '.ld-zeile{font-size:15px;margin:5px 0}'
    + '.ld-zeile a{color:var(--blau-dark);font-weight:600}'
    + '.ld-tel a{display:inline-flex;align-items:center;min-height:44px}'
    + '.ld-tel .ld-wa{margin-left:16px}'
    + '.ld-kv{margin:8px 0;padding:8px 0;border-top:1px solid var(--border);border-bottom:1px solid var(--border)}'
    + '.ld-kv dd{white-space:pre-wrap}'
    + '.ld-h3{margin:10px 0 0;font-size:13px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:var(--sub)}'
    + '.ld-notiz{white-space:pre-wrap;font-size:14px;color:var(--sub);background:#F4F8FD;border-radius:10px;padding:8px 10px;margin:4px 0 8px;max-height:280px;overflow:auto}'
    + '.ld-aktion{display:flex;flex-wrap:wrap;gap:8px;margin-top:auto;padding-top:10px}'
    + '.ld-aktion .btn{flex:1 1 150px}'
    + '.ld-akte{border-color:var(--gruen-text);color:var(--gruen-text)}'
    + '.ld-radio{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin:0 0 14px}'
    + '.ld-radio label{display:flex;align-items:center;gap:8px;border:2px solid var(--border);border-radius:12px;padding:8px 12px;min-height:48px;font-size:15px;font-weight:600;cursor:pointer;background:#fff}'
    + '.ld-radio input{width:20px;height:20px;accent-color:#007BFF;flex:none}'
    + '.ld-radio label.an{border-color:var(--blau);background:#E8F0FB;color:var(--blau-dark)}'
    + '.ld-radio label:last-child:nth-child(odd){grid-column:1 / -1}'
    + '.ld-schnell{margin-top:8px}'
    + '.ld-dritter .btn{margin-top:8px}'
    + '.ld-check{display:flex;gap:10px;align-items:center;font-size:15px;margin:0 0 14px;min-height:44px}'
    + '.ld-check input{width:22px;height:22px;accent-color:#007BFF;flex:none}'
    + '.ld-vor{background:#F4F8FD;border:1px dashed #9CC3F5;border-radius:12px;padding:10px 12px;font-size:14px;margin:8px 0}'
    + '.ld-vor b{display:inline-block;min-width:96px}'
    + '.ld-vor span{white-space:pre-wrap}'
    + '.ld-toast{cursor:pointer}'
    + '@media (max-width:420px){.ld-radio label{padding:8px 10px;font-size:14px}.ld-aktion .btn{flex:1 1 100%}.ld-leiste .btn{flex:1 1 100%}}';
  function css() {
    if (document.getElementById('ld-css')) return;
    var s = document.createElement('style'); s.id = 'ld-css'; s.textContent = CSS; document.head.appendChild(s);
  }

  /* ====================================================================
     Hilfen
     ==================================================================== */
  function berlinYmd(d) { return new Date(d).toLocaleDateString('sv-SE', { timeZone: 'Europe/Berlin' }); }
  function heuteBerlin() { return berlinYmd(new Date()); }
  function ymdPlus(ymd, n) { var p = ymd.split('-').map(Number); return new Date(Date.UTC(p[0], p[1] - 1, p[2] + n)).toISOString().slice(0, 10); }
  function istTermin(z) { return /^\s*5/.test(String((z && z.status) || '')); }
  function vollerName(z) { return [z.vorname, z.name].filter(Boolean).join(' '); }
  function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* privater Modus */ } }
  function lsWeg(k) { try { localStorage.removeItem(k); } catch (e) { /* privater Modus */ } }
  /** Mehrzeiligen Text auf eine Zeile bringen (für Zeilenansicht). */
  function flach(t) { return String(t == null ? '' : t).replace(/\s+/g, ' ').trim(); }
  function kz(v) { return String(v == null ? '' : v).trim().toUpperCase(); }
  /** Zugeteilt = der Verkäufer steht unter den aktiven Verkäufern. Leer, ausgeschieden oder „sonstige“ = nicht zugeteilt. */
  function zugeteilt(z) {
    var v = kz(z.verkaeufer); if (!v) return false;
    var akt = S.me && S.me.verkaeufer_aktiv;
    if (!Array.isArray(akt)) return true;   // älteres Backend ohne Liste: jeder eingetragene Verkäufer gilt als zugeteilt
    return akt.some(function (a) { return kz(a) === v; });
  }
  /** „Nur meine“: eigene plus nicht zugeteilte Anfragen. */
  function istMeine(z) { var me = S.me && S.me.kuerzel; return !!me && (kz(z.verkaeufer) === kz(me) || !zugeteilt(z)); }
  /** 'JJJJ-MM-TT' → '30.10.' (im laufenden Jahr), sonst '30.10.25' */
  function tagMonat(ymd) {
    if (!ymd) return '';
    var p = EG.fmtDatum(ymd).split('.');
    return p[0] + '.' + p[1] + '.' + (p[2] === heuteBerlin().slice(0, 4) ? '' : p[2].slice(2));
  }
  /** 'JJJJ-MM-TT' + optional 'HH:MM' → '30.10.2026, 14:05 Uhr' */
  function datumZeit(ymd, hm) { return ymd ? EG.fmtDatum(ymd) + (hm ? ', ' + hm + ' Uhr' : '') : ''; }
  /** 'JJJJ-MM-TTTHH:MM' (Berliner Ortszeit, wie vom Server geliefert) → '05.11.2026, 14:00 Uhr'. Keine Zeitzonenrechnung. */
  function fmtLokal(s) {
    var m = /^(\d{4}-\d{2}-\d{2})(?:[T ](\d{2}:\d{2}))?/.exec(String(s || ''));
    return m ? datumZeit(m[1], m[2]) : '';
  }
  /** Rohwert mit Zeitzone (z. B. aus der Testmodus-Vorschau) → '01.11.2026, 15:05 Uhr' in Berliner Zeit */
  function berlinZeit(w) {
    var d = new Date(w); if (isNaN(d.getTime())) return String(w);
    return datumZeit(berlinYmd(d), d.toLocaleTimeString('sv-SE', { timeZone: 'Europe/Berlin', hour: '2-digit', minute: '2-digit' }).slice(0, 5));
  }
  /** Jetzt in Berlin als 'JJJJ-MM-TTTHH:MM' (zum Vergleich mit Terminen) */
  function jetztBerlin() {
    var d = new Date();
    return berlinYmd(d) + 'T' + d.toLocaleTimeString('sv-SE', { timeZone: 'Europe/Berlin', hour: '2-digit', minute: '2-digit' }).slice(0, 5);
  }
  function wochentag(ymd) { return new Date(ymd + 'T12:00:00Z').toLocaleDateString('de-DE', { weekday: 'long', timeZone: 'UTC' }); }

  /** Ruft die Edge Function leads_api auf – gleiche Aktion und gleiche Nutzdaten wie im Dashboard. */
  async function api(aktion, body) {
    if (EG.demo) return demoApi(aktion, body || {});
    var r = await EG.sb.functions.invoke('leads_api', { body: Object.assign({ aktion: aktion }, body || {}) });
    if (r.error) {
      var msg = r.error.message || 'Fehler', status = null;
      var ctx = r.error.context;
      if (ctx && typeof ctx.json === 'function') {
        status = ctx.status || null;
        try { var j = await ctx.json(); if (j && j.fehler) msg = j.fehler; } catch (e) { /* Text bleibt */ }
      }
      var err = new Error(msg); err.status = status; throw err;
    }
    return r.data || {};
  }

  /* ====================================================================
     Ton und Hinweis bei neuer Anfrage
     ==================================================================== */
  function ton() {
    if (EG.demo) return;
    try {
      var AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
      var c = new AC(), o = c.createOscillator(), g = c.createGain();
      o.type = 'sine'; o.frequency.value = 880; g.gain.value = 0.15;
      o.connect(g); g.connect(c.destination); o.start();
      g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + 0.5); o.stop(c.currentTime + 0.5);
    } catch (e) { /* kein Ton möglich */ }
  }
  function neueAnfrageHinweis(text, id) {
    var box = document.getElementById('toasts'); if (!box) return;
    var t = h('div', { class: 'toast ld-toast', role: 'status', text: text, onclick: function () { t.remove(); oeffneLead(id); } });
    box.appendChild(t); ton();
    setTimeout(function () { if (t.parentNode) t.remove(); }, 15000);
  }
  /** Großes Fenster bei neuer Anfrage, in jedem Reiter. Ist schon ein Dialog offen, nur der kleine Hinweis (Eingaben gehen vor). */
  function popupNeu(neu) {
    function fzg(z) { return [z.hersteller, z.modell, z.fahrzeugnr].filter(Boolean).join(' ') || 'Fahrzeug unbekannt'; }
    if (document.querySelector('.dlg-ueber')) {
      neueAnfrageHinweis(neu.length > 1 ? neu.length + ' neue Anfragen' : 'Neue Anfrage: ' + fzg(neu[0]), neu[0].id);
      return;
    }
    ton();
    var zeilen = neu.slice(0, 5).map(function (z) {
      return h('div', { class: 'ld-pop-zeile' },
        h('strong', { text: vollerName(z) || '(ohne Name)' }),
        h('div', { text: fzg(z) }),
        h('div', { class: 'muted klein', text: [z.herkunft, z.ueber, z.telefon].filter(Boolean).join(' · ') }),
        /^BITTE PRÜFEN/.test(String(z.notiz || '')) ? h('div', { class: 'klein', style: 'margin-top:4px;font-weight:700', text: 'Bitte prüfen, die Mail war nicht eindeutig.' }) : null);
    });
    if (neu.length > 5) zeilen.push(h('p', { class: 'muted', text: 'und ' + (neu.length - 5) + ' weitere' }));
    EG.dialog({
      titel: neu.length > 1 ? neu.length + ' neue Anfragen' : 'Neue Anfrage', inhalt: zeilen, keinFokus: true,
      knoepfe: [{ text: 'Später', art: 'ghost', wert: null }, { text: 'Öffnen', art: 'primary', wert: 'auf' }]
    }).then(function (w) { if (w) oeffneLead(neu[0].id); });
  }
  /** Zeigt das Pop-up mit Beispieldaten. Es wird nichts gespeichert und nichts gesendet. */
  function testPopup() {
    popupNeu([{ id: null, name: 'Muster', vorname: 'Test', hersteller: 'Testfahrzeug', herkunft: 'Nur ein Test, es wurde nichts gespeichert' }]);
  }
  EG.testPopup = testPopup;
  /** Reiter „Anfragen“ zeigen und (optional) einen bestimmten Lead hervorheben. */
  function oeffneLead(id) {
    S.offenId = id || null;
    EG.zeigeTab('anfragen');
  }

  /* ====================================================================
     Daten laden
     ==================================================================== */
  var ALLE_MS = 5 * 60 * 1000;
  /** Alle Anfragen (Edge Function leads_liste, nur lesend). */
  async function holeAlle() {
    if (EG.demo) return (await demoApi('alle', {})).leads;
    var r = await EG.sb.functions.invoke('leads_liste', { body: {} });
    if (r.error) {
      var text = '';
      try { var j = await r.error.context.json(); text = j.fehler || ''; } catch (e) { /* keine JSON-Antwort */ }
      throw new Error(text || r.error.message);
    }
    return (r.data && r.data.leads) || [];
  }

  async function laden(still) {
    if (S.laedt) { if (!still) S.nochmal = true; return; }   // läuft gerade im Hintergrund: danach sichtbar nachladen
    S.laedt = true;
    try {
      var d = await api('faellig');
      var sig = JSON.stringify(d), geaendert = sig !== S.sig;
      S.liste = d; S.letzte = Date.now();
      var ids = {}, neu = [];
      d.neu_ohne_verkaeufer.forEach(function (z) { ids[z.id] = z; });
      if (S.bekannt) Object.keys(ids).forEach(function (k) { if (!S.bekannt[k]) neu.push(ids[k]); });
      S.bekannt = ids;
      if (neu.length) popupNeu(neu);
      // Gesamtliste nur, wenn der Reiter sichtbar ist: beim Öffnen und Aktualisieren, bei Änderung, sonst spätestens alle 5 Minuten
      var sichtbar = !!S.root && S.root.offsetParent !== null;
      var alleNeu = !still || (sichtbar && (!S.alle || geaendert || Date.now() - S.alleAm > ALLE_MS));
      if (alleNeu) { S.alle = await holeAlle(); S.alleAm = Date.now(); }
      // Während ein Dialog offen ist, nicht neu zeichnen (sonst gehen Eingaben verloren)
      // (S.alle da, aber noch nichts gezeichnet: z. B. weil beim Start schon ein Dialog offen war)
      if (S.root && S.root.offsetParent !== null && !document.querySelector('.dlg-ueber') && (alleNeu || (S.alle && !S.box))) {
        S.sig = sig;
        if (still && S.box && S.box.isConnected) fuelleZeilen(); else zeichnen();   // still: Filterfelder und Tastatur bleiben
      }
    } catch (e) {
      if (S.root && !still) {
        S.root.querySelectorAll('.ld-ladefehler').forEach(function (x) { x.remove(); });
        var b = EG.banner(e.message || 'Laden fehlgeschlagen', 'fehler'); b.classList.add('ld-ladefehler');
        S.root.insertBefore(b, S.root.firstChild);
      }
    } finally {
      S.laedt = false;
      if (S.nochmal) { S.nochmal = false; laden(false); }
    }
  }

  /** Solange das Fenster sichtbar ist, in jedem Reiter nach neuen Anfragen schauen (Pop-up, Oli 01.11.2026). */
  function tick() { if (S.me && !document.hidden) laden(true); }
  function sichtbarkeit() {
    if (document.hidden) { clearTimeout(S.anrufTimer); S.anrufTimer = null; return; }   // App wurde verdeckt (Anruf, WhatsApp): nicht mehr „gleich“ öffnen
    if (!S.me) return;
    anrufPruefen();
    if (Date.now() - S.letzte > 60000) laden(true);
  }

  /* ====================================================================
     Rückkehr vom Anruf: nach Tippen auf Telefon oder WhatsApp fragt die App „Wie lief es?“.
     Gemerkt wird nur Anfrage-ID und Uhrzeit (localStorage), keine Kundendaten.
     ==================================================================== */
  function anrufLesen() {
    var r = lsGet(LS_ANRUF); if (!r) return null;
    try { var m = JSON.parse(r); return m && m.id && m.t ? m : null; } catch (e) { return null; }
  }
  function anrufMerken(id) {
    lsSet(LS_ANRUF, JSON.stringify({ id: String(id), t: Date.now() }));
    clearTimeout(S.anrufTimer);
    // Wird die Seite nicht verdeckt (PC ohne Telefon-App), öffnet sich das Fenster nach 3 Sekunden gleich.
    S.anrufTimer = setTimeout(function () { S.anrufTimer = null; if (!document.hidden) anrufPruefen(); }, ANRUF_WARTE_MS);
  }
  /** Öffnet „Kontakt erfassen“ für den gemerkten Anruf, höchstens einmal. Ist schon ein Dialog offen, passiert nichts. */
  async function anrufPruefen() {
    var m = anrufLesen();
    if (!m || !S.me || S.anrufLaeuft) return;
    if (Date.now() - m.t > ANRUF_MS) { lsWeg(LS_ANRUF); return; }
    if (document.querySelector('.dlg-ueber')) return;
    S.anrufLaeuft = true;
    try {
      var z = (S.alle || []).filter(function (x) { return x.id === String(m.id); })[0];
      if (!z) { try { z = (await api('lead', { id: m.id })).lead; } catch (e) { z = null; } }
      if (!z) { lsWeg(LS_ANRUF); return; }
      if (document.querySelector('.dlg-ueber')) return;   // währenddessen ist ein anderer Dialog aufgegangen
      lsWeg(LS_ANRUF);                                    // einmalig
      dlgKontakt(z).catch(EG.fehler);
    } finally { S.anrufLaeuft = false; }
  }
  function timerStarten() {
    if (!S.timer) S.timer = setInterval(tick, 60000);
    if (!S.visHook) { S.visHook = true; document.addEventListener('visibilitychange', sichtbarkeit); }
  }

  /* ====================================================================
     Darstellung
     ==================================================================== */
  function karte(z, hell) {
    var fzg = [z.hersteller, z.modell].filter(Boolean).join(' ') || 'Fahrzeug unbekannt';
    var fzgEl = z.fahrzeugnr
      ? h('a', { href: 'https://www.autohaus-stieber.de/details.php?fahrzeug=' + encodeURIComponent(z.fahrzeugnr), target: '_blank', rel: 'noopener', text: fzg + ' · ' + z.fahrzeugnr })
      : fzg;
    var heute = heuteBerlin(), nz = !zugeteilt(z);
    var tage = z.wiedervorlage ? Math.round((new Date(heute) - new Date(z.wiedervorlage)) / 86400000) : 0;
    var verk = nz ? EG.pill('nicht zugeteilt', 'rot') : EG.pill(z.verkaeufer, 'grau');
    if (nz && z.verkaeufer) verk.title = 'Eingetragen ist ' + z.verkaeufer + ', aber das ist kein aktiver Verkäufer.';
    var pills = [];
    pills.push(EG.pill((z.herkunft || '–') + ' · ' + (z.ueber || '–'), 'grau'));
    if (z.anfrage) pills.push(EG.pill('Anfrage ' + EG.fmtDatum(z.anfrage), 'grau'));
    if (z.inzahlungnahme) pills.push(EG.pill('Inzahlungnahme', ''));
    if (z.finanzierung) pills.push(EG.pill('Finanzierung', ''));
    var wa = waNummer(z.telefon);
    var tel = z.telefon ? h('div', { class: 'ld-zeile ld-tel' }, '☎ ',
      h('a', { href: 'tel:' + z.telefon.replace(/[^\d+]/g, ''), text: z.telefon, onclick: function () { anrufMerken(z.id); } }),
      wa ? h('a', { class: 'ld-wa', href: 'https://wa.me/' + wa, target: '_blank', rel: 'noopener', text: 'WhatsApp', 'aria-label': 'WhatsApp an ' + z.telefon, onclick: function () { anrufMerken(z.id); } }) : null) : null;
    var mail = z.email ? h('div', { class: 'ld-zeile ld-tel' }, '✉ ', h('a', { href: 'mailto:' + z.email, text: z.email })) : null;
    var anlagen = z.anlagen ? h('div', { class: 'ld-zeile ld-tel' },
      /^https:\/\//i.test(String(z.sp_url || '')) ? h('a', { href: z.sp_url, target: '_blank', rel: 'noopener', text: 'Anlagen in SharePoint' }) : 'Anlagen vorhanden (in SharePoint, Link fehlt)') : null;
    // Kontaktblock: nur belegte Zeilen
    var kv = [];
    function kvZeile(name, wert) { kv.push(h('dt', { text: name }), h('dd', {}, wert)); }
    if (z.letzter_kontakt) kvZeile('Letzter Kontakt', datumZeit(z.letzter_kontakt, z.letzter_kontakt_zeit));
    if (z.besprochen) kvZeile('Besprochen', z.besprochen);
    if (z.naechster_schritt) kvZeile('Wie weiter', z.naechster_schritt);
    if (z.wiedervorlage) {
      var wvText = EG.fmtDatum(z.wiedervorlage) + (!istZu(z) && tage > 0 ? ' (' + tage + ' T überfällig)' : '');
      kvZeile('Nächster Kontakt', istZu(z) ? wvText : (tage > 0 ? EG.pill(wvText, 'rot') : (tage === 0 ? EG.pill(wvText + ' (heute)', 'gold') : wvText)));
    }
    if (z.termin_am) kvZeile('Termin am', fmtLokal(z.termin_am));
    if (z.erste_reaktion) kvZeile('Erste Reaktion', fmtLokal(z.erste_reaktion));
    return h('div', { class: 'karte ld-karte' + (hell ? ' ld-hell' : ''), 'data-id': z.id },
      h('div', { class: 'karte-kopf' },
        h('div', { class: 'ld-name', text: vollerName(z) || '(ohne Name)' }),
        h('div', { class: 'ld-pills' }, verk,
          EG.pill(z.status || 'ohne Status', istTermin(z) ? 'gruen' : ''))),
      h('div', { class: 'ld-zeile' }, fzgEl, z.interne_nr ? ' · Int.-Nr. ' + z.interne_nr : '', z.typ ? ' · ' + z.typ : ''),
      z.grund ? h('div', { class: 'ld-zeile', text: 'Grund nicht gekauft: ' + z.grund }) : null,
      h('div', { class: 'ld-pills' }, pills),
      tel, mail, anlagen,
      kv.length ? h('dl', { class: 'kv ld-kv' }, kv) : null,
      z.notiz ? h('div', { class: 'ld-h3', text: 'Kontaktverlauf' }) : null,
      z.notiz ? h('div', { class: 'ld-notiz', text: z.notiz }) : null,
      h('div', { class: 'ld-aktion' },
        h('button', { type: 'button', class: 'btn btn-primary', text: 'Kontakt erfassen', onclick: function () { dlgKontakt(z); } }),
        h('button', { type: 'button', class: 'btn btn-ghost', text: 'Bearbeiten', onclick: function () { dlgBearbeiten(z); } }),
        h('button', { type: 'button', class: 'btn btn-ghost', text: 'Nachfass-Entwurf', onclick: function () { dlgEntwurf(z, false); } }),
        istTermin(z) ? h('button', { type: 'button', class: 'btn btn-ghost ld-akte', text: 'Verkaufsakte anlegen', onclick: function () { verkaufsakteAnlegen(z); } }) : null));
  }

  /* ---------- Zeilenansicht mit Filtern (Oli 01.11.2026) ---------- */
  function istZu(z) { return /^\s*[67]/.test(String(z.status || '')); }
  /** Der Lead-Eingang war unsicher: Vermerk steht oben in der Notiz, von Hand prüfen. */
  function bittePruefen(z) { return /^BITTE PRÜFEN/.test(String(z.notiz || '')); }
  /** Neu = Status 1 und Anfrage in den letzten 30 Tagen. */
  function istNeu(z, t) { return /^\s*1/.test(String(z.status || '')) && !!z.anfrage && z.anfrage >= ymdPlus(t, -30); }
  /** Schnellfilter oben (Reihenfolge fest): außer „Alle“ immer nur offene Anfragen.
      Heute dran = neu, oder nächster Kontakt heute bzw. höchstens 30 Tage überfällig. Alt = über 30 Tage überfällig. */
  var SCHNELL = [
    ['heute', 'Heute dran', function (z, t) { return !istZu(z) && (istNeu(z, t) || (!!z.wiedervorlage && z.wiedervorlage <= t && z.wiedervorlage >= ymdPlus(t, -30))); }],
    ['neu', 'Neu', function (z, t) { return !istZu(z) && istNeu(z, t); }],
    ['ueber', 'Überfällig', function (z, t) { return !istZu(z) && !!z.wiedervorlage && z.wiedervorlage < t && z.wiedervorlage >= ymdPlus(t, -30); }],
    ['offen', 'Offen', function (z) { return !istZu(z); }],
    ['alle', 'Alle', function () { return true; }],
    ['alt', 'Alt', function (z, t) { return !istZu(z) && !!z.wiedervorlage && z.wiedervorlage < ymdPlus(t, -30); }]
  ];
  /** Filter je Feld: [Schlüssel, Beschriftung, Art]. text = enthält, wahl = gleich, janein = Ja/Nein (Schalter), von/bis = Datumsgrenze. */
  var FELD_FILTER = [
    ['name', 'Name', 'text'], ['fahrzeugnr', 'Fahrzeugnummer', 'text'], ['interne_nr', 'Int.-Nr.', 'text'],
    ['telefon', 'Telefon', 'text'], ['email', 'E-Mail', 'text'], ['hersteller', 'Hersteller', 'text'],
    ['modell', 'Modell', 'text'], ['typ', 'Typ', 'text'], ['besprochen', 'Besprochen', 'text'],
    ['naechster_schritt', 'Wie weiter', 'text'], ['notiz', 'Kontaktverlauf', 'text'],
    ['verkaeufer', 'Verkäufer', 'wahl'], ['status', 'Status', 'wahl'], ['herkunft', 'Herkunft', 'wahl'],
    ['ueber', 'über', 'wahl'], ['grund', 'Grund nicht gekauft', 'wahl'],
    ['inzahlungnahme', 'Inzahlungnahme', 'janein'], ['finanzierung', 'Finanzierung', 'janein'],
    ['anfrage_von', 'Anfrage von', 'von', 'anfrage'], ['anfrage_bis', 'Anfrage bis', 'bis', 'anfrage'],
    ['lk_von', 'Letzter Kontakt von', 'von', 'letzter_kontakt'], ['lk_bis', 'Letzter Kontakt bis', 'bis', 'letzter_kontakt'],
    ['wv_von', 'Nächster Kontakt von', 'von', 'wiedervorlage'], ['wv_bis', 'Nächster Kontakt bis', 'bis', 'wiedervorlage']
  ];
  var KEIN_WERT = '-';   // Auswahl „(leer)“, beim Verkäufer „nicht zugeteilt“
  function kl(v) { return String(v == null ? '' : v).toLowerCase(); }
  function nurZiffern(v) { return String(v || '').replace(/\D/g, ''); }
  function feldPasst(z, def, wert) {
    if (def[2] === 'von') return !!z[def[3]] && z[def[3]] >= wert;
    if (def[2] === 'bis') return !!z[def[3]] && z[def[3]] <= wert;
    if (def[2] === 'janein') return wert === 'ja' ? !!z[def[0]] : !z[def[0]];
    if (def[2] === 'wahl') {
      if (wert === KEIN_WERT) return def[0] === 'verkaeufer' ? !zugeteilt(z) : !z[def[0]];
      return z[def[0]] === wert;
    }
    if (def[0] === 'name') return kl(vollerName(z)).indexOf(kl(wert)) >= 0;
    if (def[0] === 'telefon' && nurZiffern(wert)) return nurZiffern(z.telefon).indexOf(nurZiffern(wert)) >= 0;
    return kl(z[def[0]]).indexOf(kl(wert)) >= 0;
  }
  /** Durchsuchbarer Text einer Anfrage, einmal kleingeschrieben und gemerkt (der Verlauf kann lang sein). */
  function suchtext(z) {
    if (z._h === undefined) {
      z._h = kl([vollerName(z), z.fahrzeugnr, z.interne_nr, z.telefon, nurZiffern(z.telefon), z.email, z.hersteller, z.modell, z.typ,
        z.verkaeufer, zugeteilt(z) ? '' : 'nicht zugeteilt', z.status, z.herkunft, z.ueber, z.grund, z.notiz, z.besprochen, z.naechster_schritt,
        z.inzahlungnahme ? 'Inzahlungnahme' : '', z.finanzierung ? 'Finanzierung' : '',
        z.anfrage && EG.fmtDatum(z.anfrage), z.wiedervorlage && EG.fmtDatum(z.wiedervorlage), z.letzter_kontakt && EG.fmtDatum(z.letzter_kontakt),
        z.termin_am && fmtLokal(z.termin_am), z.erste_reaktion && fmtLokal(z.erste_reaktion)].join(' '));
    }
    return z._h;
  }
  function passtSuche(z, q) { return suchtext(z).indexOf(q) >= 0; }
  /** Solange Text im Suchfeld steht und „Heute dran“ aktiv ist, wird über alle Anfragen gesucht. */
  function sucheUeberAlle() { return S.f.schnell === 'heute' && !!kl(S.f.suche).trim(); }
  function basis(z) { return !S.f.nurMeine || istMeine(z); }
  function gefiltert() {
    var t = heuteBerlin(), f = S.f, q = kl(f.suche).trim();
    var sch = SCHNELL.filter(function (s) { return s[0] === f.schnell; })[0] || SCHNELL[0];
    var ueberAlle = sucheUeberAlle();
    var aktiv = FELD_FILTER.filter(function (d) { return f.felder[d[0]]; });
    var l = (S.alle || []).filter(function (z) {
      if (!basis(z)) return false;
      if (!ueberAlle && !sch[2](z, t)) return false;
      if (q && !passtSuche(z, q)) return false;
      return aktiv.every(function (d) { return feldPasst(z, d, f.felder[d[0]]); });
    });
    return l.sort(sch[0] === 'heute' && !ueberAlle ? heuteSortierung(t) : neusteZuerst);
  }
  /** Neueste Anfrage oben; am selben Tag entscheidet die höhere ID. */
  function neusteZuerst(a, b) {
    return String(b.anfrage || '').localeCompare(String(a.anfrage || '')) || (Number(b.id) - Number(a.id));
  }
  /** „Heute dran“: erst Neues (neueste zuerst), dann Überfälliges (ältester Termin zuerst), dann heute Fälliges. */
  function heuteSortierung(t) {
    function rang(z) { return istNeu(z, t) ? 0 : (z.wiedervorlage && z.wiedervorlage < t ? 1 : 2); }
    return function (a, b) {
      var ra = rang(a), rb = rang(b);
      if (ra !== rb) return ra - rb;
      if (ra === 1) return String(a.wiedervorlage).localeCompare(String(b.wiedervorlage)) || neusteZuerst(a, b);
      return neusteZuerst(a, b);
    };
  }
  function filterAnzahl() { return FELD_FILTER.filter(function (d) { return S.f.felder[d[0]]; }).length; }

  function kurzDatum(ymd) { return ymd ? EG.fmtDatum(ymd).replace(/\.\d{2}(\d{2})$/, '.$1') : '–'; }
  function wvMarke(z) {
    if (!z.wiedervorlage) return h('span', { class: 'muted', text: '–' });
    var t = heuteBerlin(), d = kurzDatum(z.wiedervorlage);
    if (istZu(z)) return h('span', { class: 'muted', text: d });
    if (z.wiedervorlage < t) return EG.pill(d, 'rot');
    if (z.wiedervorlage === t) return EG.pill('heute', 'gold');
    return h('span', { text: d });
  }
  /** Eine Zeile (ein <button>, keine Links darin). Am PC neun Spalten wie SPALTEN, am Handy drei Zeilen (.ld-m-…, siehe CSS). */
  function reihe(z) {
    var fzg = [z.hersteller, z.modell].filter(Boolean).join(' ') || 'Fahrzeug unbekannt';
    var t = heuteBerlin(), zu = istZu(z), rot = !zu && !!z.wiedervorlage && z.wiedervorlage < t;
    var nz = !zugeteilt(z), verkText = nz ? 'nicht zugeteilt' : z.verkaeufer;
    var herk = [z.herkunft, z.ueber].filter(Boolean).join(' · ');
    var besprochen = flach(z.besprochen), schritt = flach(z.naechster_schritt);
    function zelle(klasse, text, titel) { return h('span', { class: 'ld-c-x ' + klasse + (text ? '' : ' muted'), text: text || '–', title: titel || text || '' }); }
    function statusPill() {
      var p = EG.pill(z.status || 'ohne', istTermin(z) ? 'gruen' : (zu ? 'grau' : ''));
      p.title = z.status || 'ohne Status'; return p;
    }
    var marken = [];
    if (z.inzahlungnahme) marken.push(h('span', { class: 'ld-mk', text: 'IZ', title: 'Inzahlungnahme' }));
    if (z.finanzierung) marken.push(h('span', { class: 'ld-mk', text: 'Fin', title: 'Finanzierung' }));
    // dritte Zeile am Handy: „30.10.: besprochen → wie weiter“; ohne letzten Kontakt entfällt sie
    var letzt = null;
    if (z.letzter_kontakt) {
      var teile = [besprochen, schritt].filter(Boolean);
      letzt = h('span', { class: 'ld-m ld-m-letzt', text: tagMonat(z.letzter_kontakt) + ': ' + (teile.length ? teile.join(' → ') : 'Kontakt') });
    }
    return h('button', {
      type: 'button', role: 'listitem', class: 'ld-reihe' + (rot ? ' rot' : '') + (zu ? ' zu' : '') + (S.auf === z.id ? ' auf' : ''),
      'data-id': z.id, 'aria-expanded': S.auf === z.id ? 'true' : 'false',
      onclick: function () { S.auf = S.auf === z.id ? null : z.id; fuelleZeilen(); }
    },
      h('span', { class: 'ld-c-an', text: kurzDatum(z.anfrage) }),
      h('span', { class: 'ld-c-name', title: [vollerName(z), herk].filter(Boolean).join(' · ') },
        h('span', { class: 'ld-l1' },
          h('strong', { text: vollerName(z) || '(ohne Name)' }),
          bittePruefen(z) ? ' ' : null, bittePruefen(z) ? EG.pill('prüfen', 'gold') : null),
        h('span', { class: 'ld-sub', text: herk || '–' })),
      h('span', { class: 'ld-c-x ld-c-fzg', title: [fzg, z.fahrzeugnr].filter(Boolean).join(' · ') },
        h('span', { class: 'ld-l1', text: fzg }),
        h('span', { class: 'ld-sub' }, z.fahrzeugnr || (marken.length ? '' : '–'), marken)),
      h('span', { class: 'ld-c-x ld-c-verk' + (nz ? ' ld-nz' : ''), text: verkText || '–', title: nz ? 'nicht zugeteilt' + (z.verkaeufer ? ' (eingetragen: ' + z.verkaeufer + ')' : '') : verkText }),
      h('span', { class: 'ld-c-x ld-c-status' }, statusPill()),
      zelle('ld-c-lk', z.letzter_kontakt ? kurzDatum(z.letzter_kontakt) : '', z.letzter_kontakt ? EG.fmtDatum(z.letzter_kontakt) : ''),
      zelle('ld-c-bes', besprochen, z.besprochen ? String(z.besprochen).trim().slice(0, 600) : ''),
      zelle('ld-c-ww', schritt, z.naechster_schritt),
      h('span', { class: 'ld-c-x ld-c-wv' }, wvMarke(z)),
      // nur am Handy sichtbar
      h('span', { class: 'ld-m ld-m-rechts' }, statusPill(), z.wiedervorlage ? wvMarke(z) : null),
      h('span', { class: 'ld-m ld-m-fzg', text: [fzg, verkText, z.inzahlungnahme ? 'IZ' : '', z.finanzierung ? 'Fin' : ''].filter(Boolean).join(' · ') }),
      letzt);
  }
  var SPALTEN = ['Anfrage', 'Name', 'Fahrzeug', 'Verk.', 'Status', 'Letzter Kontakt', 'Besprochen', 'Wie weiter', 'Nächster Kontakt'];
  function leerText(gesamt) {
    if (!gesamt) return 'Noch keine Anfragen.';
    if (S.f.schnell === 'heute' && !kl(S.f.suche).trim() && !filterAnzahl()) {
      return (S.f.nurMeine ? 'Heute ist bei dir nichts dran.' : 'Heute ist nichts dran.') + ' Unter „Offen“ oder „Alle“ findest du den Rest.';
    }
    return 'Keine Anfrage passt zu diesen Filtern.';
  }
  /** Zahlen und Auswahl der Schnellfilter nachziehen (Nur meine ändert die Zahlen). */
  function chipsAktualisieren() {
    if (!S.alle) return;
    var t = heuteBerlin();
    S.chipEls.forEach(function (c) {
      var n = S.alle.filter(function (z) { return basis(z) && c.s[2](z, t); }).length;
      c.el.textContent = c.s[1] + ' (' + n + ')';
      c.el.setAttribute('aria-pressed', S.f.schnell === c.s[0] ? 'true' : 'false');
    });
    var m = document.getElementById('ld-meine'); if (m) m.setAttribute('aria-pressed', S.f.nurMeine ? 'true' : 'false');
  }
  /** Zeichnet nur die Zeilen neu: Filterfelder und Tastatur bleiben unberührt. */
  function fuelleZeilen() {
    var box = S.box; if (!box) return;
    var l = gefiltert(), gesamt = (S.alle || []).length;
    if (S.zahlEl) S.zahlEl.textContent = l.length + ' von ' + gesamt + ' Anfragen';
    if (S.hinweisEl) S.hinweisEl.textContent = sucheUeberAlle() ? 'Gesucht wird in allen Anfragen, nicht nur in „Heute dran“.' : '';
    chipsAktualisieren();
    box.replaceChildren();
    if (!l.length) { box.appendChild(h('div', { class: 'leer', text: leerText(gesamt) })); return; }
    box.appendChild(h('div', { class: 'ld-reihe ld-kopfreihe', 'aria-hidden': 'true' }, SPALTEN.map(function (s) { return h('span', { text: s }); })));
    l.slice(0, S.max).forEach(function (z) {
      box.appendChild(reihe(z));
      if (S.auf === z.id) box.appendChild(h('div', { class: 'ld-offen' }, karte(z, false)));
    });
    if (l.length > S.max) {
      box.appendChild(h('div', { class: 'ld-mehr' }, h('button', {
        type: 'button', class: 'btn btn-ghost', text: 'Weitere anzeigen (' + (l.length - S.max) + ' übrig)',
        onclick: function () { S.max += 100; fuelleZeilen(); }
      })));
    }
  }
  function filterGeaendert() { S.max = 100; fuelleZeilen(); }
  /** Auswahlwerte aus den vorhandenen Anfragen, damit auch alte Werte filterbar sind. */
  function werteVon(k) {
    var w = {};
    (S.alle || []).forEach(function (z) { if (z[k]) w[z[k]] = true; });
    return Object.keys(w).sort(function (a, b) { return a.localeCompare(b, 'de', { numeric: true }); });
  }
  function feldFilterEl(d) {
    var id = 'ld-f-' + d[0], wert = S.f.felder[d[0]] || '', el;
    if (d[2] === 'wahl') {
      el = h('select', { id: id },
        h('option', { value: '', text: 'Alle' }),
        h('option', { value: KEIN_WERT, text: d[0] === 'verkaeufer' ? 'nicht zugeteilt' : '(leer)' }),
        werteVon(d[0]).map(function (v) { return h('option', { value: v, text: v }); }));
      el.value = wert;
    } else if (d[2] === 'janein') {
      el = h('select', { id: id },
        h('option', { value: '', text: 'Alle' }), h('option', { value: 'ja', text: 'Ja' }), h('option', { value: 'nein', text: 'Nein' }));
      el.value = wert;
    } else {
      el = h('input', { id: id, type: d[2] === 'text' ? 'search' : 'date', autocomplete: 'off', value: wert });
    }
    el.addEventListener(d[2] === 'text' ? 'input' : 'change', function () {
      if (el.value) S.f.felder[d[0]] = el.value; else delete S.f.felder[d[0]];
      var z = document.getElementById('ld-f-zahl'); if (z) z.textContent = filterAnzahl() ? String(filterAnzahl()) : '';
      filterGeaendert();
    });
    return EG.feld(d[1], el);
  }

  function zeichnen() {
    var root = S.root; if (!root) return;
    var me = S.me, out = [];
    if (EG.demo) out.push(EG.banner('Demo: Die Anfragen sind erfunden. Aktionen wirken nur in diesem Fenster.', 'info'));
    if (me && me.testmodus) out.push(EG.banner([h('strong', { text: 'Testmodus' }), ' – nichts wird gespeichert. Kontakt und Neuanlage zeigen nur eine Vorschau.'], 'warn'));
    out.push(h('div', { class: 'ld-leiste' },
      h('button', { type: 'button', class: 'btn btn-primary', text: '+ Neue Anfrage', onclick: dlgNeu }),
      h('button', { type: 'button', class: 'btn btn-ghost', text: 'Aktualisieren', onclick: function () { laden(false); } }),
      h('button', { type: 'button', class: 'btn btn-ghost', text: 'Benachrichtigungen einschalten', onclick: function () { pushEinschalten().catch(EG.fehler); } }),
      h('button', { type: 'button', class: 'btn btn-ghost', text: 'Test-Pop-up', onclick: testPopup })));
    out.push(h('div', { id: 'ld-push-info' }));

    S.chipEls = [];
    if (!S.alle) {
      S.box = null; S.zahlEl = null; S.hinweisEl = null;
      out.push(h('p', { class: 'muted', text: 'Lade …' }));
    } else {
      var such = h('input', { type: 'search', id: 'ld-suche', placeholder: 'Suchen in allen Feldern …', 'aria-label': 'Suchen in allen Feldern', autocomplete: 'off', value: S.f.suche });
      such.addEventListener('input', function () { S.f.suche = such.value; filterGeaendert(); });
      out.push(h('div', { class: 'ld-suche' }, such));

      var chips = h('div', { class: 'chips' });
      SCHNELL.forEach(function (s) {
        var b = h('button', {
          type: 'button', class: 'chip', 'aria-pressed': S.f.schnell === s[0] ? 'true' : 'false', text: s[1],
          onclick: function () { S.f.schnell = s[0]; S.max = 100; fuelleZeilen(); }
        });
        S.chipEls.push({ el: b, s: s });
        chips.appendChild(b);
      });
      // „Nur meine“ gibt es nur mit Kürzel; gemerkt wird der Schalter im Browser
      if (me && me.kuerzel) {
        chips.appendChild(h('button', {
          type: 'button', class: 'chip', id: 'ld-meine', 'aria-pressed': S.f.nurMeine ? 'true' : 'false', text: 'Nur meine',
          title: 'Zeigt deine und die nicht zugeteilten Anfragen',
          onclick: function () { S.f.nurMeine = !S.f.nurMeine; lsSet(LS_MEINE, S.f.nurMeine ? '1' : '0'); S.max = 100; fuelleZeilen(); }
        }));
      }
      out.push(h('div', { class: 'leiste' }, chips));

      var det = h('details', { class: 'ld-feldfilter' },
        h('summary', {}, 'Filter nach Feldern ', h('span', { class: 'ld-zahl', id: 'ld-f-zahl', text: filterAnzahl() ? String(filterAnzahl()) : '' })),
        h('div', { class: 'ld-felder' }, FELD_FILTER.map(feldFilterEl)));
      det.open = S.f.offen;
      det.addEventListener('toggle', function () { S.f.offen = det.open; });
      out.push(det);

      S.zahlEl = h('span', {});
      S.hinweisEl = h('span', { class: 'ld-hinweis' });
      out.push(h('div', { class: 'ld-zaehler' }, S.zahlEl, S.hinweisEl,
        h('button', { type: 'button', class: 'linklike', text: 'Alle Filter zurücksetzen', onclick: function () {
          S.f.schnell = 'heute'; S.f.suche = ''; S.f.felder = {}; S.max = 100; zeichnen();
        } })));
      S.box = h('div', { class: 'ld-tabelle', role: 'list' });
      out.push(S.box);
    }
    root.replaceChildren.apply(root, out);
    pushInfo();
    if (S.box) fuelleZeilen();
    if (S.alle && S.offenId) zeigeLead(S.offenId);
  }

  /** Eine bestimmte Anfrage aufklappen und hinscrollen (Push-Link, Hinweis). Filter weichen, wenn sie die Anfrage verstecken. */
  function zeigeLead(id) {
    S.offenId = null;
    var z = S.alle.filter(function (x) { return x.id === String(id); })[0];
    if (!z) { ladeEinzelnen(id); return; }
    if (gefiltert().indexOf(z) < 0) { S.f.schnell = 'alle'; S.f.suche = ''; S.f.felder = {}; S.f.nurMeine = false; S.offenId = id; zeichnen(); return; }
    S.auf = z.id;
    S.max = Math.max(S.max, gefiltert().indexOf(z) + 1);
    fuelleZeilen();
    var k = S.box.querySelector('.ld-reihe[data-id="' + z.id + '"]');
    if (k) k.scrollIntoView({ block: 'center' });
  }
  async function ladeEinzelnen(id) {
    try { var r = await api('lead', { id: id }); S.alle.push(r.lead); S.offenId = id; zeichnen(); }
    catch (e) { /* Lead nicht gefunden: kein Eintrag */ }
  }

  /* ====================================================================
     Verkaufsakte anlegen (Status 5)
     ==================================================================== */
  function verkaufsakteAnlegen(z) {
    if (typeof window.VK_AKTE_ANLEGEN !== 'function') { EG.toast('Verkaufs-Reiter noch nicht geladen'); return; }
    var p;
    try {
      p = window.VK_AKTE_ANLEGEN({
        lead_ref: z.id,                              // ID in der Lead Liste (SharePoint)
        kunde_name: vollerName(z),
        kunde_telefon: z.telefon || '',
        kunde_email: z.email || '',
        autrado_nr: z.fahrzeugnr || '',
        interne_nr: '',                              // liefert leads_api nicht; der Verkauf-Reiter ergänzt sie aus der Masterliste
        hersteller: z.hersteller || '',
        modell: z.modell || '',
        verkaeufer: z.verkaeufer || (S.me && S.me.kuerzel) || ''
      });
    } catch (e) { EG.fehler(e); return; }
    if (p && typeof p.then === 'function') p.then(null, EG.fehler);
  }

  /* ====================================================================
     Dialog-Hilfen
     ==================================================================== */
  /** Der „Speichern“-Knopf des zuletzt geöffneten Dialogs (EG.dialog baut das DOM sofort auf). */
  function primaerKnopf() {
    var alle = document.querySelectorAll('.dlg-ueber');
    var d = alle.length ? alle[alle.length - 1] : null;
    return d ? d.querySelector('.dlg-fuss .btn-primary') : null;
  }
  var FELDNAME = {
    Title: 'Nachname', field_1: 'Vorname', field_2: 'Verkäufer', field_3: 'Status', field_4: 'Herkunft', field_5: 'über',
    field_6: 'E-Mail', field_7: 'Telefon', field_8: 'Hersteller', field_9: 'Modell', field_10: 'Typ', field_11: 'Angebots-Nr.',
    field_15: 'Kontaktverlauf',                          // war im Dashboard fälschlich „Kontaktstatus“
    field_19: 'Grund nicht gekauft', Anfragedatum: 'Anfrage Datum', N_x00e4_chsteWiedervorlage: 'Nächster Kontakt',
    LetzterKontakt: 'Letzter Kontakt', Besprochen: 'Besprochen', NaechsterSchritt: 'Wie weiter', TerminAm: 'Termin am',
    ErsteReaktion: 'Erste Reaktion', Inzahlungnahme: 'Inzahlungnahme', Finanzierung: 'Finanzierung'
  };
  var ZEIT_FELDER = { LetzterKontakt: true, TerminAm: true, ErsteReaktion: true };   // Datum mit Uhrzeit
  function vorschauEl(r) {
    var v = r.vorschau; if (!v) return null;
    var liste = h('div', { class: 'ld-vor' });
    Object.keys(v.felder).forEach(function (k) {
      var w = v.felder[k];
      if (k === 'N_x00e4_chsteWiedervorlage' || k === 'Anfragedatum') w = EG.fmtDatum(berlinYmd(w));
      else if (ZEIT_FELDER[k] && w) w = berlinZeit(w);
      else if (typeof w === 'boolean') w = w ? 'Ja' : 'Nein';
      liste.appendChild(h('div', {}, h('b', { text: FELDNAME[k] || k }), ' ', h('span', { text: String(w) })));
    });
    return h('div', {},
      EG.banner('Testmodus – nichts wurde gespeichert. So würde die Liste ' + (v.methode === 'POST' ? 'einen neuen Eintrag bekommen' : 'geändert') + ':', 'ok'),
      liste);
  }

  /* ====================================================================
     Kontakt erfassen
     ==================================================================== */
  /** Kontakt erfassen: Ergebnis, was besprochen, wie weiter, nächster Kontakt (Pflicht, außer bei „Kein Interesse“).
      Bei „Termin“ stattdessen Datum und Uhrzeit des Termins. Nichts davon wird ohne Speichern abgeschickt. */
  async function dlgKontakt(z) {
    var me = S.me, heute = heuteBerlin();
    var grund = (me.auswahl && me.auswahl.field_19) || [];
    var folge = Number(z.nicht_erreicht_folge) || 0;   // so oft hintereinander „nicht erreicht“
    var wvManuell = false, fertig = false, ergebnisR = null, ergebnisWert = null;

    // Ergebnis
    var radios = h('div', { class: 'ld-radio' });
    var radioEls = [];
    [['erreicht', 'Erreicht'], ['nicht_erreicht', 'Nicht erreicht'], ['termin', 'Termin'], ['angebot', 'Angebot geschickt'], ['kein_interesse', 'Kein Interesse']].forEach(function (o, i) {
      var inp = h('input', { type: 'radio', name: 'ld-erg', value: o[0], checked: i === 0, onchange: umschalten });
      radioEls.push(inp);
      radios.appendChild(h('label', {}, inp, o[1]));
    });

    // Vorschlag nach zwei Fehlversuchen (nur ein Hinweis, nichts passiert von allein)
    var vorschlag = EG.banner([
      'Das wäre der ' + (folge + 1) + '. Versuch ohne Erfolg. Mit Grund „keine Rückmeldung“ abschließen?',
      h('div', {}, h('button', { type: 'button', class: 'btn btn-ghost btn-klein', text: 'Als „Kein Interesse“ abschließen', onclick: abschliessenVorschlagen }))], 'warn');
    vorschlag.hidden = true;

    // Termin
    var tDatum = h('input', { type: 'date', id: 'ld-k-tdatum', min: heute });
    var tZeit = h('input', { type: 'time', id: 'ld-k-tzeit' });
    var terminZeile = h('div', { class: 'zeile2' }, EG.feld('Datum des Termins *', tDatum), EG.feld('Uhrzeit *', tZeit));
    terminZeile.hidden = true;

    // Kein Interesse
    var grundSel = h('select', { id: 'ld-k-grund' }, h('option', { value: '', text: 'bitte wählen' }), grund.map(function (g) { return h('option', { value: g, text: g }); }));
    var grundFeld = EG.feld('Grund nicht gekauft *', grundSel); grundFeld.hidden = true;

    // Was wurde besprochen (freiwillig)
    var notiz = h('textarea', { id: 'ld-k-notiz', style: 'min-height:80px' });
    var notizFeld = EG.feld('Was wurde besprochen? (freiwillig)', notiz);

    // Wie weiter: Textfeld plus Schnellknöpfe, ein Knopf füllt das Feld
    var weiter = h('input', { type: 'text', id: 'ld-k-weiter', maxLength: 255, autocomplete: 'off', placeholder: 'oder eigener Text' });
    var weiterKnoepfe = ['Anrufen', 'WhatsApp', 'Mail', 'Angebot', 'Wartet auf Kunde'].map(function (w) {
      return h('button', { type: 'button', class: 'chip', 'aria-pressed': 'false', text: w, onclick: function () { weiter.value = w; weiterAktualisieren(); } });
    });
    var weiterFeld = h('div', { class: 'feld' }, h('label', { for: 'ld-k-weiter', text: 'Wie weiter' }), weiter, h('div', { class: 'chips ld-schnell' }, weiterKnoepfe));
    function weiterAktualisieren() {
      weiterKnoepfe.forEach(function (b) { b.setAttribute('aria-pressed', b.textContent === weiter.value.trim() ? 'true' : 'false'); });
    }
    weiter.addEventListener('input', weiterAktualisieren);

    // Nächster Kontakt: Vorgabe nicht erreicht +1, sonst +2 Werktage, bis von Hand gewählt
    var wvInp = h('input', { type: 'date', id: 'ld-k-wv', min: heute, value: EG.plusWerktage(heute, 2) });
    var wvHinweis = h('div', { class: 'feld-hinweis' });
    var WV = [['Morgen', EG.plusWerktage(heute, 1)], ['2 Tage', EG.plusWerktage(heute, 2)], ['1 Woche', ymdPlus(heute, 7)]];
    var wvKnoepfe = WV.map(function (w) {
      return h('button', {
        type: 'button', class: 'chip', 'aria-pressed': 'false', text: w[0], title: wochentag(w[1]) + ', ' + EG.fmtDatum(w[1]),
        onclick: function () { wvInp.value = w[1]; wvManuell = true; wvAktualisieren(); }
      });
    });
    var wvFeld = h('div', { class: 'feld' }, h('label', { for: 'ld-k-wv', text: 'Nächster Kontakt *' }), wvInp, wvHinweis, h('div', { class: 'chips ld-schnell' }, wvKnoepfe));
    function wvAktualisieren() {
      wvKnoepfe.forEach(function (b, i) { b.setAttribute('aria-pressed', WV[i][1] === wvInp.value ? 'true' : 'false'); });
      wvHinweis.textContent = wvInp.value ? wochentag(wvInp.value) + ', ' + EG.fmtDatum(wvInp.value) : 'Bitte ein Datum wählen.';
    }
    wvInp.addEventListener('input', function () { wvManuell = true; wvAktualisieren(); });
    wvInp.addEventListener('change', function () { wvManuell = true; wvAktualisieren(); });

    var uebern = null, uebernZeile;
    if (me.kuerzel) {
      uebern = h('input', { type: 'checkbox', id: 'ld-k-uebern', checked: !zugeteilt(z) });
      uebernZeile = h('label', { class: 'ld-check' }, uebern, 'Lead übernehmen (Verkäufer = ' + me.kuerzel + ')');
    } else {
      uebernZeile = h('p', { class: 'feld-hinweis', style: 'margin-bottom:14px', text: 'Für dein Konto ist noch kein Kürzel hinterlegt – „übernehmen“ ist deaktiviert.' });
    }
    var meld = h('div', {});

    function erg() { var c = radioEls.filter(function (r) { return r.checked; })[0]; return c ? c.value : 'erreicht'; }
    function umschalten() {
      var e = erg(), weiterfuehrend = e !== 'termin' && e !== 'kein_interesse';
      radioEls.forEach(function (r) { r.parentNode.classList.toggle('an', r.checked); });
      vorschlag.hidden = !(e === 'nicht_erreicht' && folge >= 2);
      terminZeile.hidden = e !== 'termin';
      grundFeld.hidden = e !== 'kein_interesse';
      weiterFeld.hidden = wvFeld.hidden = !weiterfuehrend;
      if (!wvManuell) wvInp.value = EG.plusWerktage(heute, e === 'nicht_erreicht' ? 1 : 2);
      wvAktualisieren();
    }
    /** Schaltet auf „Kein Interesse“ und wählt den Grund „keine Rückmeldung“, falls es ihn in der Liste gibt. */
    function abschliessenVorschlagen() {
      var ki = radioEls.filter(function (r) { return r.value === 'kein_interesse'; })[0];
      ki.checked = true; umschalten();
      var passend = grund.filter(function (g) { return kl(g) === 'keine rückmeldung'; })[0];
      if (passend) grundSel.value = passend;
    }
    umschalten();

    var inhalt = h('div', {},
      h('p', { style: 'margin:0 0 10px;font-size:15px', text: (vollerName(z) || '(ohne Name)') + ' · ' + (z.status || 'ohne Status') }),
      radios, vorschlag, terminZeile, grundFeld, notizFeld, weiterFeld, wvFeld, uebernZeile, meld);

    var prim = null;
    var p = EG.dialog({
      titel: 'Kontakt erfassen', inhalt: inhalt,
      knoepfe: [
        { text: 'Schließen', art: 'ghost', wert: null },
        {
          text: 'Speichern', art: 'primary', wert: 'ok',
          aktion: async function () {
            if (fertig) return true;
            var e = erg(), terminAm = '';
            if (e === 'termin') {
              if (!tDatum.value || !tZeit.value) { (tDatum.value ? tZeit : tDatum).focus(); return 'Bitte Datum und Uhrzeit des Termins eintragen.'; }
              terminAm = tDatum.value + 'T' + tZeit.value.slice(0, 5);
              if (terminAm < jetztBerlin()) { tDatum.focus(); return 'Der Termin liegt in der Vergangenheit. Bitte Datum und Uhrzeit prüfen.'; }
            } else if (e === 'kein_interesse') {
              if (!grundSel.value) { grundSel.focus(); return 'Bitte den Grund wählen.'; }
            } else {
              if (!wvInp.value) { wvInp.focus(); return 'Bitte den nächsten Kontakt eintragen: Datum wählen oder Morgen, 2 Tage oder 1 Woche antippen.'; }
              if (wvInp.value < heute) { wvInp.focus(); return 'Der nächste Kontakt liegt in der Vergangenheit. Bitte ein Datum ab heute wählen.'; }
            }
            var daten = { id: z.id, ergebnis: e, notiz: notiz.value, grund: e === 'kein_interesse' ? grundSel.value : '', uebernehmen: !!(uebern && uebern.checked) };
            if (e === 'termin') { daten.schritt = 'Termin'; daten.termin_am = terminAm; daten.wiedervorlage = tDatum.value; }
            else if (e === 'kein_interesse') { daten.schritt = ''; daten.wiedervorlage = ''; }
            else { daten.schritt = weiter.value.trim(); daten.wiedervorlage = wvInp.value; }
            meld.replaceChildren();
            var r;
            try { r = await api('kontakt', daten); }
            catch (err) { meld.appendChild(EG.banner(err.message, 'fehler')); return false; }
            if (r.trocken) {
              var vo = vorschauEl(r); if (vo) meld.appendChild(vo);
              fertig = true; if (prim) prim.textContent = 'Fertig';
              return false;
            }
            ergebnisR = r; ergebnisWert = e;
            return true;
          }
        }
      ]
    });
    prim = primaerKnopf();
    await p;
    if (!ergebnisR && !S.box && S.alle && S.root && S.root.offsetParent !== null && !document.querySelector('.dlg-ueber')) zeichnen();   // Liste nachholen, falls der Dialog schon beim Start offen war
    if (ergebnisR) {
      EG.toast('Kontakt gespeichert', 'ok');
      laden(false);
      if (ergebnisWert === 'termin') {
        var ja = await EG.bestaetigen('Termin ist eingetragen. Soll jetzt die Verkaufsakte angelegt werden?', { titel: 'Verkaufsakte anlegen?', ja: 'Verkaufsakte anlegen', nein: 'Später' });
        if (ja) verkaufsakteAnlegen(z);
        zeichnen();
      }
    }
  }

  /* ====================================================================
     Neue Anfrage
     ==================================================================== */
  async function dlgNeu() {
    var A = S.me.auswahl || {};
    function auswahlFeld(id, liste, vorgabe) {
      var l = liste || [];
      var s = h('select', { id: id }, l.map(function (v) { return h('option', { value: v, text: v }); }));
      if (l.indexOf(vorgabe) >= 0) s.value = vorgabe;
      return s;
    }
    var name = h('input', { type: 'text', id: 'ld-n-name', autocomplete: 'off' });
    var vor = h('input', { type: 'text', id: 'ld-n-vor', autocomplete: 'off' });
    var tel = h('input', { type: 'text', id: 'ld-n-tel', inputMode: 'tel', autocomplete: 'off' });
    var mail = h('input', { type: 'email', id: 'ld-n-mail', autocomplete: 'off' });
    var nr = h('input', { type: 'text', id: 'ld-n-nr', inputMode: 'numeric', autocomplete: 'off' });
    var herk = auswahlFeld('ld-n-herk', A.field_4, 'Showroom');
    var ueber = auswahlFeld('ld-n-ueber', A.field_5, 'Telefon');
    var notiz = h('textarea', { id: 'ld-n-notiz' });
    var meld = h('div', {});
    var fertig = false, angelegt = null, prim = null;

    var p = EG.dialog({
      titel: 'Neue Anfrage erfassen',
      inhalt: h('div', {},
        EG.feld('Nachname *', name), EG.feld('Vorname', vor), EG.feld('Telefon', tel), EG.feld('E-Mail', mail),
        EG.feld('Fahrzeug-Nr. (6-stellig)', nr), EG.feld('Herkunft', herk), EG.feld('Über', ueber), EG.feld('Notiz', notiz), meld),
      knoepfe: [
        { text: 'Schließen', art: 'ghost', wert: null },
        {
          text: 'Anlegen', art: 'primary', wert: 'ok',
          aktion: async function () {
            if (fertig) return true;
            if (!name.value.trim()) return 'Bitte den Nachnamen eintragen.';
            meld.replaceChildren();
            var r;
            try {
              r = await api('neu', {
                name: name.value, vorname: vor.value, telefon: tel.value, email: mail.value,
                fahrzeugnr: nr.value, herkunft: herk.value, ueber: ueber.value, notiz: notiz.value
              });
            } catch (err) { meld.appendChild(EG.banner(err.message, 'fehler')); return false; }
            var zus = [];
            if (r.dublette) zus.push(EG.banner('Dublette: gleiche Fahrzeug-Nr. und E-Mail in den letzten 30 Tagen – die Notiz wird im vorhandenen Eintrag ergänzt, es entsteht kein neuer.', 'ok'));
            if (r.weitere_zum_fahrzeug) zus.push(h('p', { class: 'ld-zeile', text: 'Hinweis: ' + r.weitere_zum_fahrzeug + ' weitere Anfrage(n) zu diesem Fahrzeug in den letzten 30 Tagen.' }));
            if (r.hinweis === 'fahrzeug_nicht_in_masterliste') zus.push(h('p', { class: 'ld-zeile', text: 'Fahrzeug-Nr. nicht in der Masterliste gefunden – Hersteller und Modell bleiben leer.' }));
            if (r.trocken) {
              meld.appendChild(h('div', {}, zus, vorschauEl(r) || ''));
              fertig = true; if (prim) prim.textContent = 'Fertig';
              return false;
            }
            angelegt = r;
            return true;
          }
        }
      ]
    });
    prim = primaerKnopf();
    await p;
    if (angelegt) {
      EG.toast(angelegt.dublette ? 'Dublette: Notiz im vorhandenen Eintrag ergänzt' : 'Anfrage angelegt', 'ok');
      laden(false);
    }
  }

  /* ====================================================================
     Anfrage bearbeiten (Edge Function leads_bearbeiten; nur geänderte Felder werden gesendet)
     ==================================================================== */
  /** [Schlüssel, Beschriftung, Art]. Art: field_N = Auswahl vom Server, datum = Datum, zeit = Datum und Uhrzeit, janein = Ja/Nein (Werte ja/nein). */
  var BEARB_FELDER = [
    ['verkaeufer', 'Verkäufer', 'field_2'], ['status', 'Status', 'field_3'], ['wiedervorlage', 'Nächster Kontakt', 'datum'],
    ['naechster_schritt', 'Wie weiter'], ['termin_am', 'Termin am', 'zeit'],
    ['name', 'Nachname *'], ['vorname', 'Vorname'], ['telefon', 'Telefon'], ['email', 'E-Mail'],
    ['fahrzeugnr', 'Fahrzeugnummer'], ['interne_nr', 'Int.-Nr.'], ['hersteller', 'Hersteller'], ['modell', 'Modell'], ['typ', 'Typ'],
    ['inzahlungnahme', 'Inzahlungnahme', 'janein'], ['finanzierung', 'Finanzierung', 'janein'],
    ['herkunft', 'Herkunft', 'field_4'], ['ueber', 'über', 'field_5'], ['grund', 'Grund nicht gekauft', 'field_19']
  ];
  /** Aktueller Wert eines Feldes als Text, so wie das Eingabefeld ihn zeigt. */
  function bearbWert(z, d) { return d[2] === 'janein' ? (z[d[0]] ? 'ja' : 'nein') : (z[d[0]] || ''); }
  async function speichereBearbeitung(id, felder) {
    if (EG.demo) return demoApi('bearbeiten', { id: id, felder: felder });
    var r = await EG.sb.functions.invoke('leads_bearbeiten', { body: { id: id, felder: felder } });
    if (r.error) {
      var text = '';
      try { var j = await r.error.context.json(); text = j.fehler || ''; } catch (e) { /* keine JSON-Antwort */ }
      throw new Error(text || r.error.message);
    }
    return r.data || {};
  }
  async function dlgBearbeiten(z) {
    var auswahl = (S.me && S.me.auswahl) || {}, el = {}, fertig = false, gespeichert = false, prim = null;
    var meld = h('div', {});
    var felder = BEARB_FELDER.map(function (d) {
      var wert = bearbWert(z, d), id = 'ld-b-' + d[0];
      if (d[2] === 'datum') el[d[0]] = h('input', { type: 'date', id: id, value: wert });
      else if (d[2] === 'zeit') el[d[0]] = h('input', { type: 'datetime-local', id: id, value: wert });
      else if (d[2] === 'janein') {
        el[d[0]] = h('select', { id: id }, h('option', { value: 'nein', text: 'Nein' }), h('option', { value: 'ja', text: 'Ja' }));
        el[d[0]].value = wert;
      } else if (d[2]) {
        var opt = (auswahl[d[2]] || []).slice();
        if (wert && opt.indexOf(wert) < 0) opt.unshift(wert);
        el[d[0]] = h('select', { id: id }, h('option', { value: '', text: '–' }), opt.map(function (o) { return h('option', { value: o, text: o }); }));
        el[d[0]].value = wert;
      } else el[d[0]] = h('input', { type: d[0] === 'email' ? 'email' : 'text', id: id, autocomplete: 'off', value: wert, maxLength: d[0] === 'naechster_schritt' ? 255 : null });
      return EG.feld(d[1], el[d[0]]);
    });
    var p = EG.dialog({
      titel: 'Anfrage bearbeiten', breit: true, keinFokus: true,
      inhalt: h('div', {}, h('div', { class: 'ld-felder ld-bearb' }, felder), meld),
      knoepfe: [
        { text: 'Schließen', art: 'ghost', wert: null },
        {
          text: 'Speichern', art: 'primary', wert: 'ok',
          aktion: async function () {
            if (fertig) return true;
            meld.replaceChildren();
            var aend = {};
            BEARB_FELDER.forEach(function (d) {
              var neu = el[d[0]].value.trim();
              if (neu !== bearbWert(z, d)) aend[d[0]] = neu;
            });
            if (!Object.keys(aend).length) return true;
            if (aend.name === '') return 'Bitte den Nachnamen eintragen.';
            var r;
            try { r = await speichereBearbeitung(z.id, aend); }
            catch (err) { meld.appendChild(EG.banner(err.message, 'fehler')); return false; }
            if (r.trocken) {
              meld.appendChild(vorschauEl(r) || '');
              fertig = true; if (prim) prim.textContent = 'Fertig';
              return false;
            }
            gespeichert = true;
            return true;
          }
        }
      ]
    });
    prim = primaerKnopf();
    await p;
    if (gespeichert) { EG.toast('Änderung gespeichert', 'ok'); laden(false); }
  }

  /* ====================================================================
     Nachfass-Entwurf (nichts wird gesendet)
     ==================================================================== */
  function dlgEntwurf(z, trotzdem) {
    var box = h('div', {}, h('p', { class: 'muted', text: 'Entwurf wird erstellt …' }));
    EG.dialog({ titel: 'Nachfass-Entwurf', inhalt: box, breit: true, keinFokus: true, knoepfe: [{ text: 'Schließen', art: 'ghost', wert: null }] });
    entwurfLaden(box, z, trotzdem);
  }
  async function entwurfLaden(box, z, trotzdem) {
    var r;
    try { r = await api('entwurf', { id: z.id, trotzdem: !!trotzdem }); }
    catch (err) { box.replaceChildren(EG.banner(err.message, 'fehler')); return; }
    if (r.nachfass_bereits && !r.whatsapp) {
      box.replaceChildren(
        EG.banner(r.hinweis || 'Es wurde schon nachgefasst.', 'fehler'),
        h('button', { type: 'button', class: 'btn btn-ghost', text: 'Trotzdem Entwurf zeigen', onclick: function () { box.replaceChildren(h('p', { class: 'muted', text: 'Entwurf wird erstellt …' })); entwurfLaden(box, z, true); } }));
      return;
    }
    var wa = h('textarea', { id: 'ld-e-wa', style: 'min-height:160px', value: r.whatsapp.text });
    var betr = h('input', { type: 'text', id: 'ld-e-betr', value: r.email.betreff, style: 'margin-bottom:8px' });
    var mail = h('textarea', { id: 'ld-e-mail', style: 'min-height:200px', value: r.email.text });
    var waLink = h('a', { class: 'btn btn-primary btn-block', target: '_blank', rel: 'noopener', text: 'In WhatsApp öffnen' });
    var mailLink = h('a', { class: 'btn btn-primary btn-block', text: 'Mail-Entwurf öffnen' });
    function links() {
      waLink.href = 'https://wa.me/' + (r.whatsapp.nummer || '') + '?text=' + encodeURIComponent(wa.value);
      mailLink.href = 'mailto:' + encodeURIComponent(r.email.an || '') + '?subject=' + encodeURIComponent(betr.value) + '&body=' + encodeURIComponent(mail.value);
    }
    [wa, betr, mail].forEach(function (el) { el.addEventListener('input', links); });
    links();
    box.replaceChildren(
      (r.hinweise || []).map(function (t) { return EG.banner(t, 'fehler'); }),
      h('p', { class: 'feld-hinweis', style: 'margin-bottom:10px', text: 'Es wird nichts automatisch gesendet. Du prüfst den Text und sendest selbst.' }),
      EG.feld('WhatsApp', wa),
      r.whatsapp.nummer ? null : h('p', { class: 'rot-text klein', style: 'margin-bottom:8px', text: 'Keine gültige Handynummer hinterlegt – WhatsApp-Link ohne Empfänger.' }),
      waLink,
      h('div', { style: 'margin-top:18px' }, EG.feld('E-Mail an ' + (r.email.an || '(keine Adresse)'), h('div', {}, betr, mail))),
      mailLink);
  }

  /* ====================================================================
     Push-Benachrichtigung
     ==================================================================== */
  function b64uZuBytes(s) {
    var p = (s + '='.repeat((4 - (s.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/');
    var raw = atob(p), out = new Uint8Array(raw.length);
    for (var i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
    return out;
  }
  function istIos() { return /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1); }
  function istInstalliert() { return (window.matchMedia && matchMedia('(display-mode: standalone)').matches) || navigator.standalone === true; }
  /** pushInfo(text, istFehler) setzt eine Meldung; pushInfo() zeichnet den Standardzustand. */
  function pushInfo(text, fehler) {
    if (text !== undefined) S.pushMsg = text ? { text: text, fehler: !!fehler } : null;
    var el = document.getElementById('ld-push-info'); if (!el) return;
    el.replaceChildren();
    if (S.pushMsg) { el.appendChild(EG.banner(S.pushMsg.text, S.pushMsg.fehler ? 'fehler' : 'ok')); return; }
    var me = S.me;
    if (me && me.push_abos > 0) {
      el.appendChild(EG.banner([
        'Benachrichtigungen sind auf diesem Konto eingeschaltet (' + me.push_abos + ' Gerät/e). ',
        h('button', { type: 'button', class: 'linklike', text: 'Testnachricht senden', onclick: pushTest })], 'ok'));
    } else {
      // Kein Gerät angemeldet: Erinnerungen kämen nur per Mail (auf jedem Gerät, nicht nur am iPhone)
      if (me && me.push_abos === 0) {
        el.appendChild(EG.banner('Auf diesem Konto sind noch keine Benachrichtigungen eingeschaltet. Ohne sie kommt die Erinnerung nur per Mail.', 'warn'));
      }
      if (istIos() && !istInstalliert()) {
        el.appendChild(EG.banner('iPhone: Zuerst unten auf „Teilen“ tippen → „Zum Home-Bildschirm“, dann die App von dort öffnen und die Benachrichtigungen einschalten.', 'info'));
      }
    }
  }
  async function pushTest() {
    try {
      var r = await api('push_test');
      pushInfo(r.gesendet ? 'Testnachricht ist unterwegs.' : 'Kein Gerät erreicht' + (r.hinweis ? ' (' + r.hinweis + ')' : '') + '.', !r.gesendet);
    } catch (e) { pushInfo(e.message, true); }
  }
  function swBereit() {
    return Promise.race([
      navigator.serviceWorker.ready,
      new Promise(function (_, nein) { setTimeout(function () { nein(new Error('Der Service Worker (sw.js) ist in dieser App nicht aktiv – Benachrichtigungen sind hier noch nicht eingerichtet.')); }, 8000); })
    ]);
  }
  // Auch der Reiter „Verkauf“ schaltet Benachrichtigungen ein (Rolle dispo, eingang-verkauf.js)
  window.LD_PUSH = { b64uZuBytes: b64uZuBytes, istIos: istIos, istInstalliert: istInstalliert, swBereit: swBereit };
  async function pushEinschalten() {
    if (EG.demo) { pushInfo('Im Demo-Modus gibt es keine Benachrichtigungen.', true); return; }
    try {
      if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
        pushInfo(istIos() ? 'Auf dem iPhone geht das nur mit der App auf dem Home-Bildschirm (Teilen → „Zum Home-Bildschirm“).' : 'Dieser Browser unterstützt keine Benachrichtigungen.', true); return;
      }
      if (istIos() && !istInstalliert()) { pushInfo('Auf dem iPhone zuerst „Teilen“ → „Zum Home-Bildschirm“, dann von dort öffnen.', true); return; }
      var pub = S.me.vapid_public;
      if (!pub && S.me.rolle === 'admin') { var vi = await api('vapid_init'); pub = vi.pub; S.me.vapid_public = pub; }
      if (!pub) { pushInfo('Die Benachrichtigung ist serverseitig noch nicht eingerichtet (Admin muss einmal starten).', true); return; }
      var perm = await Notification.requestPermission();
      if (perm !== 'granted') { pushInfo('Benachrichtigungen wurden im Browser nicht erlaubt.', true); return; }
      var reg = await swBereit();
      var sub = await reg.pushManager.getSubscription();
      if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64uZuBytes(pub) });
      var j = sub.toJSON();
      await api('push_abo', { endpoint: j.endpoint, p256dh: j.keys.p256dh, auth: j.keys.auth });
      S.me.push_abos = Math.max(1, S.me.push_abos || 0);
      EG.toast('Benachrichtigungen sind eingeschaltet.', 'ok');
      pushInfo(null);
      pushInfo();
    } catch (e) { pushInfo(e.message || String(e), true); }
  }

  /* ====================================================================
     Start des Reiters
     ==================================================================== */
  function swRegistrieren() {
    if (S.swRegistriert || EG.demo || !('serviceWorker' in navigator)) return;
    S.swRegistriert = true;
    navigator.serviceWorker.register('sw.js').catch(function () { /* sw.js fehlt: nur kein Push */ });
    navigator.serviceWorker.addEventListener('message', function (ev) {
      var d = ev.data || {};
      if (d.typ === 'lead-neu') laden(true);   // Push ist da: gleich nachsehen, das Pop-up kommt aus laden()
      if (d.typ === 'lead-oeffnen') { var m = /id=(\d+)/.exec(d.url || ''); oeffneLead(m ? m[1] : null); }
    });
  }
  function init() {
    if (S.me) return Promise.resolve(true);
    if (S.initP) return S.initP;
    S.initP = (async function () {
      try {
        S.me = await api('me');
        if (S.me.kuerzel) S.f.nurMeine = lsGet(LS_MEINE) === '1';   // „Nur meine“ merkt sich der Browser
        swRegistrieren(); return true;
      }
      catch (e) { S.initFehler = e; return false; }
      finally { S.initP = null; }
    })();
    return S.initP;
  }

  /** Nach dem Anmelden: Verkauf und Admin bekommen das Pop-up in jedem Reiter, nicht erst im Reiter „Anfragen“. */
  document.addEventListener('eg-bereit', function () {
    if (EG.rolle !== 'admin' && EG.rolle !== 'verkauf') return;
    css();
    init().then(function (ok) {
      if (!ok) return;
      laden(true); timerStarten();
      anrufPruefen();   // das iPhone kann die App beim Anruf schließen: beim Start nachsehen, ob gerade telefoniert wurde
    });
  });

  EG.onTab('anfragen', async function (root) {
    css();
    S.root = root;
    if (!S.me) {
      root.replaceChildren(h('p', { class: 'muted', text: 'Lade …' }));
      var ok = await init();
      if (!ok) {
        var e = S.initFehler;
        root.replaceChildren(EG.banner('Kein Zugriff auf die Anfragen' + (e && e.message ? ': ' + e.message : '.'), 'fehler'));
        return;
      }
    }
    zeichnen();
    await laden(false);
    timerStarten();
  });

  /* ====================================================================
     DEMO: zwölf erfundene Anfragen, nur im Speicher
     ==================================================================== */
  var D = null;
  // Auswahlwerte wie in der echten Lead Liste; Kürzel sind erfunden (M3 gilt als ausgeschieden = nicht zugeteilt)
  var DEMO_AUSWAHL = {
    field_2: ['M1', 'M2', 'M3', 'sonstige'],
    field_3: ['1 neu', '2 Kontakt', '3 Kontakt', '4. Kontakt', '5 Termin vereinbart', '6 Verkauft', '7 nicht gekauft', 'Angebot versendet'],
    field_4: ['Showroom', 'Website', 'mobile.de', 'AutoScout24', 'Telefon'],
    field_5: ['Telefon', 'E-Mail', 'WhatsApp', 'Formular', 'Vor Ort'],
    field_19: ['kauft später', 'zu teuer', 'wo anders gekauft', 'keine Rückmeldung', 'sonstige Gründe']
  };
  var DEMO_AKTIV = ['M1', 'M2'];
  var DEMO_FZG = {
    '900001': { hersteller: 'Hyundai', modell: 'Tucson 1.6 T-GDI Demo', typ: 'Demo' },
    '900002': { hersteller: 'Kia', modell: 'Sportage 1.6 Demo', typ: 'Demo' },
    '900003': { hersteller: 'Nissan', modell: 'Qashqai 1.3 Demo', typ: 'Demo' },
    '900004': { hersteller: 'Opel', modell: 'Mokka Demo Edition', typ: 'Demo' }
  };
  /** Alle Felder einer Anfrage mit leeren Vorgaben, so wie leads_liste sie liefert. */
  function demoStandard(t) {
    return { id: '', name: '', vorname: '', verkaeufer: '', status: DEMO_AUSWAHL.field_3[0], herkunft: 'Website', ueber: 'Formular', email: '', telefon: '', hersteller: '', modell: '', typ: '', fahrzeugnr: '', interne_nr: '', grund: '', notiz: '',
      anfrage: t, anfrage_iso: '', wiedervorlage: '', inzahlungnahme: false, finanzierung: false, anlagen: false, sp_url: '',
      letzter_kontakt: '', letzter_kontakt_zeit: '', besprochen: '', naechster_schritt: '', termin_am: '', erste_reaktion: '', nicht_erreicht_folge: 0 };
  }
  /** Zwölf erfundene Anfragen, jede zeigt eine andere Anzeige: neu, überfällig, heute, Alt, Termin, dritter Versuch, Anlage, nicht zugeteilt … */
  function demoStart() {
    if (D) return;
    var t = heuteBerlin();
    var mk = function (id, o) {
      var r = Object.assign(demoStandard(t), { id: String(id) }, DEMO_FZG[o.fahrzeugnr] || {}, o);
      if (!r.anfrage_iso) r.anfrage_iso = r.anfrage + 'T08:30:00Z';
      return r;
    };
    var T = function (n) { return ymdPlus(t, n); };
    D = { next: 9100, leads: [
      // neu, mit Inzahlungnahme und Anlage
      mk(9001, { name: 'Muster', vorname: 'Erika', herkunft: 'mobile.de', ueber: 'E-Mail', email: 'erika.muster@beispiel.example', telefon: '0711 0000001', fahrzeugnr: '900001', wiedervorlage: T(1), inzahlungnahme: true, anlagen: true, sp_url: 'https://beispiel.example/anlagen-demo', notiz: 'Demo-Anfrage über mobile.de.' }),
      // neu seit gestern, mit Finanzierung
      mk(9002, { name: 'Mustermann', vorname: 'Max', herkunft: 'AutoScout24', ueber: 'WhatsApp', telefon: '0171 0000002', fahrzeugnr: '900002', anfrage: T(-1), wiedervorlage: T(0), finanzierung: true, notiz: 'Fragt nach Probefahrt am Wochenende (Demo).' }),
      // heute fällig, mit Kontakt
      mk(9003, { name: 'Beispiel', vorname: 'Berta', verkaeufer: 'M1', status: '2 Kontakt', herkunft: 'Website', ueber: 'Formular', email: 'berta.beispiel@beispiel.example', telefon: '0711 0000003', fahrzeugnr: '900003', interne_nr: '9103', anfrage: T(-4), wiedervorlage: T(0), finanzierung: true,
        letzter_kontakt: T(-2), letzter_kontakt_zeit: '10:30', erste_reaktion: T(-4) + 'T09:12', besprochen: 'will sich die Finanzierung ansehen', naechster_schritt: 'Anrufen',
        notiz: EG.fmtDatum(T(-2)) + ' - M1: Kunde erreicht\n- will sich die Finanzierung ansehen\n- Weiter: Anrufen\n\n' + EG.fmtDatum(T(-4)) + ' - M1: Anfrage Website per Formular' }),
      // überfällig, zwei Mal nicht erreicht: der nächste Versuch wäre der dritte
      mk(9004, { name: 'Probe', vorname: 'Paul', verkaeufer: 'M2', status: '3 Kontakt', herkunft: 'Telefon', ueber: 'Telefon', telefon: '0711 0000004', fahrzeugnr: '900004', anfrage: T(-10), wiedervorlage: T(-3), nicht_erreicht_folge: 2,
        letzter_kontakt: T(-4), letzter_kontakt_zeit: '15:20', erste_reaktion: T(-10) + 'T10:05', besprochen: 'nicht erreicht: Mailbox', naechster_schritt: 'Anrufen',
        notiz: EG.fmtDatum(T(-4)) + ' - M2: nicht erreicht\n- Mailbox\n\n' + EG.fmtDatum(T(-7)) + ' - M2: nicht erreicht' }),
      // Termin vereinbart
      mk(9005, { name: 'Testfrau', vorname: 'Tina', verkaeufer: 'M1', status: '5 Termin vereinbart', herkunft: 'Showroom', ueber: 'Vor Ort', email: 'tina.testfrau@beispiel.example', telefon: '0171 0000005', fahrzeugnr: '900001', anfrage: T(-6), wiedervorlage: T(2), inzahlungnahme: true,
        letzter_kontakt: T(-1), letzter_kontakt_zeit: '16:45', erste_reaktion: T(-6) + 'T11:00', termin_am: T(2) + 'T14:00', besprochen: 'Probefahrt und Übergabe besprochen', naechster_schritt: 'Termin',
        notiz: EG.fmtDatum(T(-1)) + ' - M1: Termin vereinbart\n- Termin: ' + EG.fmtDatum(T(2)) + ' 14:00 Uhr\n- Weiter: Termin' }),
      // Alt: nächster Kontakt vor mehr als 30 Tagen, nie Kontakt gehabt
      mk(9006, { name: 'Altmann', vorname: 'Oskar', verkaeufer: 'M2', status: '2 Kontakt', herkunft: 'AutoScout24', ueber: 'E-Mail', email: 'oskar.altmann@beispiel.example', telefon: '0711 0000006', fahrzeugnr: '900002', anfrage: T(-70), wiedervorlage: T(-45) }),
      // überfällig, Verkäufer nicht mehr aktiv: nicht zugeteilt
      mk(9007, { name: 'Ohnezuteilung', vorname: 'Carla', verkaeufer: 'M3', status: '3 Kontakt', herkunft: 'mobile.de', ueber: 'WhatsApp', telefon: '0172 0000007', fahrzeugnr: '900003', anfrage: T(-8), wiedervorlage: T(-1),
        letzter_kontakt: T(-9), letzter_kontakt_zeit: '09:50', besprochen: 'wartet auf Rückruf des Partners', naechster_schritt: 'Wartet auf Kunde' }),
      // Angebot versendet, langer Text
      mk(9008, { name: 'Langtext', vorname: 'Dora', verkaeufer: 'M1', status: 'Angebot versendet', herkunft: 'Website', ueber: 'Formular', email: 'dora.langtext@beispiel.example', telefon: '0711 0000008', fahrzeugnr: '900004', anfrage: T(-12), wiedervorlage: T(4), finanzierung: true,
        letzter_kontakt: T(-1), letzter_kontakt_zeit: '11:15', besprochen: 'Angebot per Mail geschickt, Kundin vergleicht noch mit einem zweiten Händler, möchte die Winterräder dazu und fragt nach der Lieferzeit für die Anhängerkupplung', naechster_schritt: 'Angebot' }),
      // abgeschlossen
      mk(9009, { name: 'Erledigt', vorname: 'Emil', verkaeufer: 'M2', status: '7 nicht gekauft', grund: 'zu teuer', herkunft: 'AutoScout24', ueber: 'E-Mail', telefon: '0711 0000009', fahrzeugnr: '900001', anfrage: T(-20), wiedervorlage: T(-14),
        letzter_kontakt: T(-14), letzter_kontakt_zeit: '13:00', besprochen: 'kein Interesse' }),
      // Status 1, aber vor mehr als 30 Tagen: nicht neu, nur unter Alt
      mk(9010, { name: 'Frühling', vorname: 'Fritz', herkunft: 'Telefon', ueber: 'Telefon', telefon: '0711 0000010', fahrzeugnr: '900002', anfrage: T(-40), wiedervorlage: T(-38) }),
      // überfällig, aber noch keine 30 Tage
      mk(9011, { name: 'Gestern', vorname: 'Gerda', verkaeufer: 'M2', status: '2 Kontakt', herkunft: 'Website', ueber: 'Formular', email: 'gerda.gestern@beispiel.example', telefon: '0711 0000011', fahrzeugnr: '900004', anfrage: T(-15), wiedervorlage: T(-12),
        letzter_kontakt: T(-13), letzter_kontakt_zeit: '08:40', besprochen: 'will sich melden', naechster_schritt: 'Mail' }),
      // heute fällig, älter
      mk(9012, { name: 'Heutig', vorname: 'Hans', verkaeufer: 'M1', status: '4. Kontakt', herkunft: 'Showroom', ueber: 'Vor Ort', telefon: '0711 0000012', fahrzeugnr: '900003', anfrage: T(-20), wiedervorlage: T(0),
        letzter_kontakt: T(-3), letzter_kontakt_zeit: '17:05', besprochen: 'Preis passt, Finanzierung offen', naechster_schritt: 'WhatsApp' })
    ] };
  }
  /** Nur Demo: neue Anfrage simulieren, um das Pop-up zu zeigen. */
  EG.demoNeueAnfrage = async function () { if (EG.demo) { await demoApi('demo_neu', {}); await laden(true); } };
  function kurzNotiz(n) { return n ?String(n).split(/\r?\n/).filter(function (z) { return z.trim(); }).slice(0, 6).join('\n').slice(0, 420) : ''; }
  function kopieZeile(z) { var k = Object.assign({}, z); k.notiz = kurzNotiz(z.notiz); return k; }
  function waNummer(tel) {
    var d = String(tel || '').replace(/[^\d+]/g, '');
    if (d.charAt(0) === '+') d = d.slice(1); else if (d.indexOf('00') === 0) d = d.slice(2); else if (d.charAt(0) === '0') d = '49' + d.slice(1);
    return /^\d{8,15}$/.test(d) ? d : '';
  }
  function demoStufeNach(s) {
    var wahl = function (re) { return DEMO_AUSWAHL.field_3.filter(function (x) { return re.test(x); })[0]; };
    s = String(s || '').trim();
    if (!s || /^1/.test(s)) return wahl(/^2/);
    if (/^2/.test(s)) return wahl(/^3/);
    if (/^3/.test(s)) return wahl(/^4/);
    return undefined;
  }
  async function demoApi(aktion, b) {
    demoStart();
    await new Promise(function (ok) { setTimeout(ok, 80); });
    var t = heuteBerlin(), kuerzel = 'M1';
    var finde = function (id) {
      var z = D.leads.filter(function (x) { return x.id === String(id); })[0];
      if (!z) { var e = new Error('Lead nicht gefunden'); e.status = 404; throw e; }
      return z;
    };
    var block = function (ueber, zeilen) { return [EG.fmtDatum(t) + ' - ' + kuerzel + ': ' + ueber].concat(zeilen.filter(Boolean).map(function (x) { return '- ' + x; })).join('\n'); };
    switch (aktion) {
      case 'me':
        return { email: EG.nutzer(), rolle: EG.rolle, kuerzel: kuerzel, name: EG.nutzerName(), testmodus: false, push_abos: 0, vapid_public: null, auswahl: DEMO_AUSWAHL, verkaeufer_aktiv: DEMO_AKTIV.slice() };
      case 'faellig': {
        var grenzeNeu = ymdPlus(t, -30);
        var offen = D.leads.filter(function (z) { return !/^\s*[67]/.test(z.status); });
        var neuOhne = offen.filter(function (z) { return /^\s*1/.test(z.status) && !z.verkaeufer && z.anfrage >= grenzeNeu; });
        var faellig = offen.filter(function (z) { return neuOhne.indexOf(z) < 0 && z.wiedervorlage && z.wiedervorlage <= t; })
          .sort(function (a, c) { return c.wiedervorlage.localeCompare(a.wiedervorlage); });
        neuOhne.sort(function (a, c) { return c.anfrage.localeCompare(a.anfrage); });
        return { heute: t, faellig: faellig.map(kopieZeile), neu_ohne_verkaeufer: neuOhne.map(kopieZeile) };
      }
      case 'lead': return { lead: kopieZeile(finde(b.id)) };
      case 'alle': return { leads: D.leads.map(function (x) { return Object.assign({}, x); }) };
      case 'bearbeiten': {
        var bz = finde(b.id), namen = [];
        Object.keys(b.felder).forEach(function (k) {
          var w = b.felder[k];
          if (k === 'inzahlungnahme' || k === 'finanzierung') w = w === 'ja';   // Ja/Nein kommt als 'ja'/'nein'
          bz[k] = w; namen.push(k);
        });
        bz.notiz = EG.fmtDatum(t) + ' - ' + kuerzel + ': geändert: ' + namen.join(', ') + (bz.notiz ? '\n\n' + bz.notiz : '');
        return { trocken: false, id: bz.id, gespeichert: namen };
      }
      case 'demo_neu': {
        var dn = Object.assign(demoStandard(t), { id: String(D.next++), name: 'Neukunde', vorname: 'Nora', herkunft: 'AutoScout24', ueber: 'E-Mail', telefon: '0711 0000099', hersteller: 'Kia', modell: 'Sportage 1.6 Demo', fahrzeugnr: '900002', notiz: 'Demo: gerade eingegangen.', anfrage_iso: t + 'T08:30:00Z', wiedervorlage: ymdPlus(t, 1) });
        D.leads.push(dn);
        return { id: dn.id };
      }
      case 'kontakt': {
        // Verhalten wie im Vertrag zur Aktion „kontakt“ (Backend), hier nur im Speicher
        var z = finde(b.id), e = b.ergebnis;
        var text = { erreicht: 'Kunde erreicht', termin: 'Termin vereinbart', angebot: 'Angebot geschickt', nicht_erreicht: 'nicht erreicht', kein_interesse: 'kein Interesse' }[e];
        if (!text) throw new Error('unbekanntes Ergebnis');
        var jetzt = jetztBerlin(), terminText = '', mitTermin = false;
        if (e === 'termin') {
          if (b.termin_am) {
            if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(b.termin_am)) throw new Error('Termin ungültig');
            if (b.termin_am < jetzt) throw new Error('Der Termin liegt in der Vergangenheit');
            terminText = 'Termin: ' + fmtLokal(b.termin_am); mitTermin = true;
          } else if (String(b.termin || '').trim()) terminText = 'Termin: ' + b.termin;   // altes Dashboard: Freitext
          else throw new Error('Termin fehlt');
        }
        if (e === 'kein_interesse' && (!b.grund || DEMO_AUSWAHL.field_19.indexOf(b.grund) < 0)) throw new Error('Grund fehlt oder unbekannt');
        var wv = b.wiedervorlage;
        if (e !== 'kein_interesse' && wv && (!/^\d{4}-\d{2}-\d{2}$/.test(wv) || wv < t)) throw new Error('Wiedervorlage ungültig');
        // Status
        if (e === 'erreicht') { var neuStatus = demoStufeNach(z.status); if (neuStatus) z.status = neuStatus; }
        else if (e === 'termin') z.status = DEMO_AUSWAHL.field_3[4];
        else if (e === 'angebot') { if (!/^\s*5/.test(z.status)) z.status = DEMO_AUSWAHL.field_3[7]; }   // ein Status 5 bleibt stehen
        else if (e === 'kein_interesse') { z.status = DEMO_AUSWAHL.field_3[6]; z.grund = b.grund; }
        // Spalten
        var notizText = String(b.notiz || '').trim();
        z.letzter_kontakt = t; z.letzter_kontakt_zeit = jetzt.slice(11);
        if (!z.erste_reaktion) z.erste_reaktion = jetzt;
        z.besprochen = (e === 'nicht_erreicht' && notizText ? 'nicht erreicht: ' + notizText : (notizText || text)).slice(0, 1500);
        if (b.schritt !== undefined) z.naechster_schritt = e === 'kein_interesse' ? '' : String(b.schritt || '').slice(0, 255);   // fehlt „schritt“ (altes Dashboard): nicht anfassen
        if (mitTermin) { z.termin_am = b.termin_am; z.wiedervorlage = b.termin_am.slice(0, 10); }
        else if (e === 'kein_interesse') z.termin_am = '';
        else z.wiedervorlage = wv || EG.plusWerktage(t, e === 'nicht_erreicht' ? 1 : 2);
        z.nicht_erreicht_folge = e === 'nicht_erreicht' ? (z.nicht_erreicht_folge || 0) + 1 : 0;
        if (b.uebernehmen === true) z.verkaeufer = kuerzel;
        var nb = block(text, [terminText, e === 'kein_interesse' ? 'Grund: ' + b.grund : ''].concat(notizText.split(/\r?\n/).map(function (x) { return x.trim(); }),
          [b.schritt ? 'Weiter: ' + b.schritt : '', e !== 'kein_interesse' && z.wiedervorlage ? 'Nächster Kontakt: ' + EG.fmtDatum(z.wiedervorlage) : '']));
        z.notiz = nb + (z.notiz ? '\n\n' + z.notiz : '');
        return { trocken: false, id: z.id, gespeichert: ['demo'] };
      }
      case 'neu': {
        if (!String(b.name || '').trim()) throw new Error('Name fehlt');
        if (DEMO_AUSWAHL.field_4.indexOf(b.herkunft) < 0) throw new Error('Herkunft unbekannt');
        if (DEMO_AUSWAHL.field_5.indexOf(b.ueber) < 0) throw new Error('über unbekannt');
        var nr = String(b.fahrzeugnr || '').trim();
        if (nr && !/^\d{4,8}$/.test(nr)) throw new Error('Fahrzeugnr ungültig');
        var mail = String(b.email || '').trim();
        var nb2 = block('Anfrage ' + b.herkunft + ' per ' + b.ueber + ' (erfasst im Dashboard)', String(b.notiz || '').split(/\r?\n/).map(function (x) { return x.trim(); }));
        var dub = null, weitere = 0, g = ymdPlus(t, -30);
        if (nr) D.leads.forEach(function (x) {
          if (x.fahrzeugnr !== nr || (x.anfrage && x.anfrage < g)) return;
          if (mail && x.email.toLowerCase() === mail.toLowerCase()) { dub = dub || x; } else weitere++;
        });
        if (dub) { dub.notiz = nb2 + (dub.notiz ? '\n\n' + dub.notiz : ''); return { trocken: false, dublette: true, id: dub.id, weitere_zum_fahrzeug: weitere }; }
        var f = nr ? DEMO_FZG[nr] : null;
        var neu = Object.assign(demoStandard(t), { id: String(D.next++), name: String(b.name).trim(), vorname: String(b.vorname || '').trim(), verkaeufer: kuerzel, herkunft: b.herkunft, ueber: b.ueber,
          email: mail, telefon: String(b.telefon || '').trim(), hersteller: f ? f.hersteller : '', modell: f ? f.modell : '', typ: f ? f.typ : '', fahrzeugnr: nr, notiz: nb2, anfrage_iso: t + 'T08:30:00Z', wiedervorlage: ymdPlus(t, 1) });
        D.leads.push(neu);
        return { trocken: false, dublette: false, id: neu.id, weitere_zum_fahrzeug: weitere, hinweis: nr && !f ? 'fahrzeug_nicht_in_masterliste' : undefined };
      }
      case 'entwurf': {
        var l = finde(b.id), hinweise = [];
        if (/^\s*[67]/.test(l.status)) hinweise.push('Lead ist auf Verkauft/nicht gekauft – kein Nachfassen von sich aus.');
        var bereits = /nachfass/i.test(l.notiz);
        if (bereits && b.trotzdem !== true) return { nachfass_bereits: true, hinweis: 'In der Notiz steht schon ein Nachfassen. Es wird höchstens einmal nachgefasst – Entscheidung liegt beim Verkäufer.', hinweise: hinweise };
        var fz = [l.hersteller, l.modell].filter(Boolean).join(' ') || 'Fahrzeug', nrt = l.fahrzeugnr ? ' (Nr. ' + l.fahrzeugnr + ')' : '';
        var anrede = ('Guten Tag ' + vollerName(l)).trim();
        return {
          nachfass_bereits: bereits, hinweise: hinweise, gesendet: false,
          whatsapp: { text: anrede + ',\n\nkurze Rückmeldung von mir zum ' + fz + nrt + '. Ist das Thema noch aktuell?\n\nViele Grüße,\n' + EG.nutzerName() + ', Autohaus Stieber (Demo)', nummer: waNummer(l.telefon) },
          email: { an: l.email, betreff: 'Ihre Anfrage zum ' + fz + nrt, text: anrede + ',\n\nich melde mich noch einmal zu Ihrer Anfrage zum ' + fz + nrt + '. Ist das Thema für Sie noch aktuell?\n\nFreundliche Grüße\n' + EG.nutzerName() + '\nAutohaus Stieber (Demo)' }
        };
      }
      default: throw new Error('Im Demo-Modus nicht verfügbar');
    }
  }
})();
