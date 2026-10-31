/* Stieber-App – Reiter „Anfragen“ (Leads)
   Umzug aus dem Ankauf-Dashboard (leads.js, Leads 1.0 vom 26.10.2026), Stand 31.10.2026.
   Fällige Nachkontakte, Kontakt erfassen, Neue Anfrage, Nachfass-Entwurf, Push-Benachrichtigung,
   neu: „Verkaufsakte anlegen“ bei Status 5 (Termin vereinbart).
   Alle Daten kommen von der Edge Function leads_api (Rollenprüfung verkauf/admin dort) und werden
   mit denselben Aktionen und Nutzdaten abgefragt wie im Dashboard:
     me · faellig · lead · kontakt · neu · entwurf · push_abo · push_test · vapid_init
   Baut auf window.EG aus eingang-core.js auf (EG.h, EG.dialog, EG.onTab …).
   Diese Datei enthält KEINE Schlüssel, Listen-IDs oder Kundendaten. Es wird nie automatisch gesendet:
   WhatsApp und Mail öffnen sich nur als Entwurf (wa.me / mailto).
   Demo (?demo=1): keine Netzaufrufe, fünf erfundene Anfragen, Aktionen wirken nur im Speicher. */
(function () {
  'use strict';
  var EG = window.EG;
  if (!EG) { console.error('eingang-leads.js: eingang-core.js fehlt.'); return; }
  var h = EG.h;

  /* ====================================================================
     Zustand
     ==================================================================== */
  var S = {
    root: null, me: null, initP: null, liste: null, sig: '', filter: null,
    offenId: null, einzel: null, bekannt: null, timer: null, laedt: false, letzte: 0,
    pushMsg: null, swRegistriert: false, visHook: false
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
    + '.ld-filter{max-width:360px}'
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
    + '.ld-tel a{display:inline-block;min-height:30px;line-height:30px}'
    + '.ld-notiz{white-space:pre-wrap;font-size:14px;color:var(--sub);background:#F4F8FD;border-radius:10px;padding:8px 10px;margin:8px 0;max-height:130px;overflow:auto}'
    + '.ld-aktion{display:flex;flex-wrap:wrap;gap:8px;margin-top:auto;padding-top:10px}'
    + '.ld-aktion .btn{flex:1 1 150px}'
    + '.ld-akte{border-color:var(--gruen-text);color:var(--gruen-text)}'
    + '.ld-radio{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin:0 0 14px}'
    + '.ld-radio label{display:flex;align-items:center;gap:8px;border:2px solid var(--border);border-radius:12px;padding:8px 12px;min-height:48px;font-size:15px;font-weight:600;cursor:pointer;background:#fff}'
    + '.ld-radio input{width:20px;height:20px;accent-color:#007BFF;flex:none}'
    + '.ld-radio label.an{border-color:var(--blau);background:#E8F0FB;color:var(--blau-dark)}'
    + '.ld-check{display:flex;gap:10px;align-items:center;font-size:15px;margin:0 0 14px;min-height:44px}'
    + '.ld-check input{width:22px;height:22px;accent-color:#007BFF;flex:none}'
    + '.ld-vor{background:#F4F8FD;border:1px dashed #9CC3F5;border-radius:12px;padding:10px 12px;font-size:14px;margin:8px 0}'
    + '.ld-vor b{display:inline-block;min-width:96px}'
    + '.ld-vor span{white-space:pre-wrap}'
    + '.ld-toast{cursor:pointer}'
    + '@media (max-width:420px){.ld-radio{grid-template-columns:1fr}.ld-aktion .btn{flex:1 1 100%}.ld-leiste .btn{flex:1 1 100%}}';
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
  /** Reiter „Anfragen“ zeigen und (optional) einen bestimmten Lead hervorheben. */
  function oeffneLead(id) {
    S.offenId = id || null;
    EG.zeigeTab('anfragen');
  }

  /* ====================================================================
     Daten laden
     ==================================================================== */
  async function laden(still) {
    if (S.laedt) return;
    S.laedt = true;
    try {
      var d = await api('faellig');
      var sig = JSON.stringify(d), geaendert = sig !== S.sig;
      S.liste = d; S.letzte = Date.now();
      var ids = {}, neu = [];
      d.neu_ohne_verkaeufer.forEach(function (z) { ids[z.id] = z; });
      if (S.bekannt) Object.keys(ids).forEach(function (k) { if (!S.bekannt[k]) neu.push(ids[k]); });
      S.bekannt = ids;
      if (neu.length > 3) neueAnfrageHinweis(neu.length + ' neue Anfragen', neu[0].id);
      else neu.forEach(function (z) { neueAnfrageHinweis('Neue Anfrage: ' + ([z.hersteller, z.modell, z.fahrzeugnr].filter(Boolean).join(' ') || 'Fahrzeug unbekannt'), z.id); });
      // Während ein Dialog offen ist, nicht neu zeichnen (sonst gehen Eingaben verloren)
      if (S.root && S.root.offsetParent !== null && !document.querySelector('.dlg-ueber') && (geaendert || !still)) { S.sig = sig; zeichnen(); }
    } catch (e) {
      if (S.root && !still) {
        S.root.querySelectorAll('.ld-ladefehler').forEach(function (x) { x.remove(); });
        var b = EG.banner(e.message || 'Laden fehlgeschlagen', 'fehler'); b.classList.add('ld-ladefehler');
        S.root.insertBefore(b, S.root.firstChild);
      }
    } finally { S.laedt = false; }
  }

  /** Nur bei sichtbarem Fenster UND aktivem Reiter nachladen. */
  function reiterSichtbar() {
    return !document.hidden && !!S.root && S.root.isConnected && !S.root.hidden && S.root.offsetParent !== null;
  }
  function tick() { if (S.me && reiterSichtbar()) laden(true); }
  function sichtbarkeit() { if (S.me && reiterSichtbar() && Date.now() - S.letzte > 60000) laden(true); }
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
    var heute = heuteBerlin();
    var tage = z.wiedervorlage ? Math.round((new Date(heute) - new Date(z.wiedervorlage)) / 86400000) : 0;
    var pills = [];
    pills.push(EG.pill((z.herkunft || '–') + ' · ' + (z.ueber || '–'), 'grau'));
    if (z.wiedervorlage) pills.push(EG.pill('Wiedervorlage ' + EG.fmtDatum(z.wiedervorlage) + (tage > 0 ? ' (' + tage + ' T überfällig)' : ''), tage > 2 ? 'rot' : ''));
    if (z.anfrage) pills.push(EG.pill('Anfrage ' + EG.fmtDatum(z.anfrage), 'grau'));
    var tel = z.telefon ? h('div', { class: 'ld-zeile ld-tel' }, '☎ ', h('a', { href: 'tel:' + z.telefon.replace(/[^\d+]/g, ''), text: z.telefon })) : null;
    var mail = z.email ? h('div', { class: 'ld-zeile' }, '✉ ', h('a', { href: 'mailto:' + z.email, text: z.email })) : null;
    return h('div', { class: 'karte ld-karte' + (hell ? ' ld-hell' : ''), 'data-id': z.id },
      h('div', { class: 'karte-kopf' },
        h('div', { class: 'ld-name', text: vollerName(z) || '(ohne Name)' }),
        h('div', { class: 'ld-pills' },
          z.verkaeufer ? EG.pill(z.verkaeufer, 'grau') : EG.pill('nicht zugeteilt', 'rot'),
          EG.pill(z.status || 'ohne Status', istTermin(z) ? 'gruen' : ''))),
      h('div', { class: 'ld-zeile' }, fzgEl),
      h('div', { class: 'ld-pills' }, pills),
      tel, mail,
      z.notiz ? h('div', { class: 'ld-notiz', text: z.notiz }) : null,
      h('div', { class: 'ld-aktion' },
        h('button', { type: 'button', class: 'btn btn-primary', text: 'Kontakt erfassen', onclick: function () { dlgKontakt(z); } }),
        h('button', { type: 'button', class: 'btn btn-ghost', text: 'Nachfass-Entwurf', onclick: function () { dlgEntwurf(z, false); } }),
        istTermin(z) ? h('button', { type: 'button', class: 'btn btn-ghost ld-akte', text: 'Verkaufsakte anlegen', onclick: function () { verkaufsakteAnlegen(z); } }) : null));
  }

  function zeichnen() {
    var root = S.root; if (!root) return;
    var me = S.me, out = [];
    if (EG.demo) out.push(EG.banner('Demo: Die fünf Anfragen sind erfunden. Aktionen wirken nur in diesem Fenster.', 'info'));
    if (me && me.testmodus) out.push(EG.banner([h('strong', { text: 'Testmodus' }), ' – nichts wird gespeichert. Kontakt und Neuanlage zeigen nur eine Vorschau.'], 'warn'));
    out.push(h('div', { class: 'ld-leiste' },
      h('button', { type: 'button', class: 'btn btn-primary', text: '+ Neue Anfrage', onclick: dlgNeu }),
      h('button', { type: 'button', class: 'btn btn-ghost', text: 'Aktualisieren', onclick: function () { S.einzel = null; laden(false); } }),
      h('button', { type: 'button', class: 'btn btn-ghost', text: 'Benachrichtigungen einschalten', onclick: function () { pushEinschalten().catch(EG.fehler); } })));
    out.push(h('div', { id: 'ld-push-info' }));

    var verk = (me && me.auswahl && me.auswahl.field_2) || [];
    var sel = h('select', { id: 'ld-filter', 'aria-label': 'Verkäufer filtern' },
      h('option', { value: '', text: 'Alle' }),
      verk.map(function (v) { return h('option', { value: v, text: v }); }),
      h('option', { value: '-', text: 'nicht zugeteilt' }));
    sel.value = S.filter || '';
    sel.addEventListener('change', function () { S.filter = sel.value || null; zeichnen(); });
    out.push(h('div', { class: 'ld-filter' }, EG.feld('Verkäufer', sel)));

    if (!S.liste) {
      out.push(h('p', { class: 'muted', text: 'Lade …' }));
    } else {
      var L = S.liste, neu = L.neu_ohne_verkaeufer;
      var inListe = {};
      neu.concat(L.faellig).forEach(function (z) { inListe[z.id] = true; });
      if (S.einzel && !inListe[S.einzel.id]) {
        out.push(h('h3', { class: 'ld-h', text: 'Geöffnete Anfrage' }));
        out.push(karte(S.einzel, true));
      }
      out.push(h('h3', { class: 'ld-h' }, 'Neu, nicht zugeteilt ', h('span', { class: 'ld-zahl', text: String(neu.length) })));
      out.push(neu.length ? h('div', { class: 'raster' }, neu.map(function (z) { return karte(z, z.id === S.offenId); }))
        : h('p', { class: 'muted', text: 'Keine neuen Anfragen ohne Verkäufer.' }));

      var heute = heuteBerlin(), grenzeAlt = ymdPlus(heute, -30);
      var f = L.faellig.filter(function (z) { return !S.filter ? true : S.filter === '-' ? !z.verkaeufer : z.verkaeufer === S.filter; });
      var aktuell = f.filter(function (z) { return z.wiedervorlage >= grenzeAlt; });
      var alt = f.filter(function (z) { return z.wiedervorlage < grenzeAlt; });
      out.push(h('h3', { class: 'ld-h' }, 'Fällig heute / überfällig ', h('span', { class: 'ld-zahl', text: String(aktuell.length) })));
      out.push(aktuell.length ? h('div', { class: 'raster' }, aktuell.map(function (z) { return karte(z, z.id === S.offenId); }))
        : h('p', { class: 'muted', text: 'Nichts fällig.' }));
      if (alt.length) {
        out.push(h('details', { class: 'klappe' },
          h('summary', { class: 'ld-h' }, 'Älter als 30 Tage ', h('span', { class: 'ld-zahl', text: String(alt.length) })),
          h('div', { class: 'raster' }, alt.map(function (z) { return karte(z, z.id === S.offenId); }))));
      }
    }
    root.replaceChildren.apply(root, out);
    pushInfo();
    if (S.liste && S.offenId) {
      var id = S.offenId; S.offenId = null;
      var k = null;
      root.querySelectorAll('.ld-karte').forEach(function (x) { if (x.getAttribute('data-id') === id) k = x; });
      if (k) {
        var det = k.closest('details'); if (det) det.open = true;
        k.classList.add('ld-hell');
        k.scrollIntoView({ block: 'center' });
      } else { ladeEinzelnen(id); }
    }
  }

  async function ladeEinzelnen(id) {
    try { var r = await api('lead', { id: id }); S.einzel = r.lead; zeichnen(); }
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
    field_15: 'Notiz',                                   // war im Dashboard fälschlich „Kontaktstatus“
    field_19: 'Grund nicht gekauft', Anfragedatum: 'Anfrage Datum', N_x00e4_chsteWiedervorlage: 'Nächste Wiedervorlage'
  };
  function vorschauEl(r) {
    var v = r.vorschau; if (!v) return null;
    var liste = h('div', { class: 'ld-vor' });
    Object.keys(v.felder).forEach(function (k) {
      var w = v.felder[k];
      if (k === 'N_x00e4_chsteWiedervorlage' || k === 'Anfragedatum') w = EG.fmtDatum(berlinYmd(w));
      liste.appendChild(h('div', {}, h('b', { text: FELDNAME[k] || k }), ' ', h('span', { text: String(w) })));
    });
    return h('div', {},
      EG.banner('Testmodus – nichts wurde gespeichert. So würde die Liste ' + (v.methode === 'POST' ? 'einen neuen Eintrag bekommen' : 'geändert') + ':', 'ok'),
      liste);
  }

  /* ====================================================================
     Kontakt erfassen
     ==================================================================== */
  async function dlgKontakt(z) {
    var me = S.me, heute = heuteBerlin();
    var grund = (me.auswahl && me.auswahl.field_19) || [];
    var wvManuell = false, fertig = false, ergebnisR = null, ergebnisWert = null;

    var radios = h('div', { class: 'ld-radio' });
    var radioEls = [];
    [['erreicht', 'Erreicht'], ['termin', 'Termin vereinbart'], ['nicht_erreicht', 'Nicht erreicht'], ['kein_interesse', 'Kein Interesse']].forEach(function (o, i) {
      var inp = h('input', { type: 'radio', name: 'ld-erg', value: o[0], checked: i === 0, onchange: umschalten });
      radioEls.push(inp);
      radios.appendChild(h('label', {}, inp, o[1]));
    });
    var terminInp = h('input', { type: 'text', id: 'ld-k-termin', placeholder: 'z. B. Do 29.10., 14 Uhr', autocomplete: 'off' });
    var terminFeld = EG.feld('Termin (Datum und Uhrzeit)', terminInp); terminFeld.hidden = true;
    var grundSel = h('select', { id: 'ld-k-grund' }, h('option', { value: '', text: 'bitte wählen' }), grund.map(function (g) { return h('option', { value: g, text: g }); }));
    var grundFeld = EG.feld('Grund nicht gekauft', grundSel); grundFeld.hidden = true;
    var notiz = h('textarea', { id: 'ld-k-notiz', placeholder: 'Was wurde besprochen?' });
    var wvInp = h('input', { type: 'date', id: 'ld-k-wv', min: heute, value: EG.plusWerktage(heute, 2), onchange: function () { wvManuell = true; } });
    var wvFeld = EG.feld('Nächste Wiedervorlage', wvInp);
    var uebern = null, uebernZeile;
    if (me.kuerzel) {
      uebern = h('input', { type: 'checkbox', id: 'ld-k-uebern', checked: !z.verkaeufer });
      uebernZeile = h('label', { class: 'ld-check' }, uebern, 'Lead übernehmen (Verkäufer = ' + me.kuerzel + ')');
    } else {
      uebernZeile = h('p', { class: 'feld-hinweis', style: 'margin-bottom:14px', text: 'Für dein Konto ist noch kein Kürzel hinterlegt – „übernehmen“ ist deaktiviert.' });
    }
    var meld = h('div', {});

    function erg() { var c = radioEls.filter(function (r) { return r.checked; })[0]; return c ? c.value : 'erreicht'; }
    function umschalten() {
      var e = erg();
      radioEls.forEach(function (r) { r.parentNode.classList.toggle('an', r.checked); });
      terminFeld.hidden = e !== 'termin';
      grundFeld.hidden = e !== 'kein_interesse';
      wvFeld.hidden = e === 'kein_interesse';
      if (!wvManuell) wvInp.value = EG.plusWerktage(heute, e === 'nicht_erreicht' ? 1 : 2);
    }
    umschalten();

    var inhalt = h('div', {},
      h('p', { style: 'margin:0 0 10px;font-size:15px', text: (vollerName(z) || '(ohne Name)') + ' · ' + (z.status || 'ohne Status') }),
      radios, terminFeld, grundFeld, EG.feld('Notiz', notiz), wvFeld, uebernZeile, meld);

    var prim = null;
    var p = EG.dialog({
      titel: 'Kontakt erfassen', inhalt: inhalt,
      knoepfe: [
        { text: 'Schließen', art: 'ghost', wert: null },
        {
          text: 'Speichern', art: 'primary', wert: 'ok',
          aktion: async function () {
            if (fertig) return true;
            var e = erg();
            if (e === 'termin' && !terminInp.value.trim()) return 'Bitte den Termin eintragen.';
            if (e === 'kein_interesse' && !grundSel.value) return 'Bitte den Grund wählen.';
            meld.replaceChildren();
            var r;
            try {
              r = await api('kontakt', {
                id: z.id, ergebnis: e, notiz: notiz.value, termin: terminInp.value,
                grund: grundSel.value, wiedervorlage: e === 'kein_interesse' ? '' : wvInp.value,
                uebernehmen: !!(uebern && uebern.checked)
              });
            } catch (err) { meld.appendChild(EG.banner(err.message, 'fehler')); return false; }
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
    if (ergebnisR) {
      EG.toast('Kontakt gespeichert', 'ok');
      S.einzel = null;
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
      S.einzel = null;
      laden(false);
    }
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
    } else if (istIos() && !istInstalliert()) {
      el.appendChild(EG.banner('iPhone: Zuerst unten auf „Teilen“ tippen → „Zum Home-Bildschirm“, dann die App von dort öffnen und die Benachrichtigungen einschalten.', 'info'));
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
      if (d.typ === 'lead-neu') neueAnfrageHinweis(d.text || 'Neue Anfrage', null);
      if (d.typ === 'lead-oeffnen') { var m = /id=(\d+)/.exec(d.url || ''); oeffneLead(m ? m[1] : null); }
    });
  }
  function init() {
    if (S.me) return Promise.resolve(true);
    if (S.initP) return S.initP;
    S.initP = (async function () {
      try { S.me = await api('me'); swRegistrieren(); return true; }
      catch (e) { S.initFehler = e; return false; }
      finally { S.initP = null; }
    })();
    return S.initP;
  }

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
     DEMO: fünf erfundene Anfragen, nur im Speicher
     ==================================================================== */
  var D = null;
  var DEMO_AUSWAHL = {
    field_2: ['M1', 'M2'],
    field_3: ['1 Neu', '2 Erstkontakt', '3 Beratung', '4 Angebot versendet', '5 Termin vereinbart', '6 Verkauft', '7 Nicht gekauft'],
    field_4: ['Showroom', 'Website', 'mobile.de', 'AutoScout24', 'Telefon'],
    field_5: ['Telefon', 'E-Mail', 'WhatsApp', 'Formular', 'Vor Ort'],
    field_19: ['Preis', 'Fahrzeug anderweitig gekauft', 'Finanzierung nicht möglich', 'Kein Interesse mehr', 'Sonstiges']
  };
  var DEMO_FZG = {
    '900001': { hersteller: 'Hyundai', modell: 'Tucson 1.6 T-GDI Demo', typ: 'Demo' },
    '900002': { hersteller: 'Kia', modell: 'Sportage 1.6 Demo', typ: 'Demo' },
    '900003': { hersteller: 'Nissan', modell: 'Qashqai 1.3 Demo', typ: 'Demo' },
    '900004': { hersteller: 'Opel', modell: 'Mokka Demo Edition', typ: 'Demo' }
  };
  function demoStart() {
    if (D) return;
    var t = heuteBerlin();
    var mk = function (id, o) {
      return Object.assign({ id: String(id), name: '', vorname: '', verkaeufer: '', status: '1 Neu', herkunft: 'Website', ueber: 'Formular', email: '', telefon: '', hersteller: '', modell: '', typ: '', fahrzeugnr: '', notiz: '', anfrage: t, wiedervorlage: '' },
        DEMO_FZG[o.fahrzeugnr] || {}, o);
    };
    D = { next: 9100, leads: [
      mk(9001, { name: 'Muster', vorname: 'Erika', herkunft: 'mobile.de', ueber: 'E-Mail', email: 'erika.muster@beispiel.example', telefon: '0711 0000001', fahrzeugnr: '900001', anfrage: t, wiedervorlage: ymdPlus(t, 1), notiz: 'Demo-Anfrage über mobile.de.' }),
      mk(9002, { name: 'Mustermann', vorname: 'Max', herkunft: 'AutoScout24', ueber: 'WhatsApp', telefon: '0171 0000002', fahrzeugnr: '900002', anfrage: ymdPlus(t, -1), wiedervorlage: ymdPlus(t, 0), notiz: 'Fragt nach Probefahrt am Wochenende (Demo).' }),
      mk(9003, { name: 'Beispiel', vorname: 'Berta', verkaeufer: 'M1', status: '2 Erstkontakt', herkunft: 'Website', ueber: 'Formular', email: 'berta.beispiel@beispiel.example', telefon: '0711 0000003', fahrzeugnr: '900003', anfrage: ymdPlus(t, -4), wiedervorlage: t, notiz: '01.01. - M1: Kunde erreicht\n- will sich Finanzierung ansehen (Demo)' }),
      mk(9004, { name: 'Probe', vorname: 'Paul', verkaeufer: 'M2', status: '3 Beratung', herkunft: 'Telefon', ueber: 'Telefon', telefon: '0711 0000004', fahrzeugnr: '900004', anfrage: ymdPlus(t, -10), wiedervorlage: ymdPlus(t, -3), notiz: 'Nicht erreicht, zweiter Versuch fällig (Demo).' }),
      mk(9005, { name: 'Testfrau', vorname: 'Tina', verkaeufer: 'M1', status: '5 Termin vereinbart', herkunft: 'Showroom', ueber: 'Vor Ort', email: 'tina.testfrau@beispiel.example', telefon: '0171 0000005', fahrzeugnr: '900001', anfrage: ymdPlus(t, -6), wiedervorlage: t, notiz: 'Termin Übergabe/Kaufvertrag vereinbart (Demo).' })
    ] };
  }
  function kurzNotiz(n) { return n ? String(n).split(/\r?\n/).filter(function (z) { return z.trim(); }).slice(0, 6).join('\n').slice(0, 420) : ''; }
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
        return { email: EG.nutzer(), rolle: EG.rolle, kuerzel: kuerzel, name: EG.nutzerName(), testmodus: false, push_abos: 0, vapid_public: null, auswahl: DEMO_AUSWAHL };
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
      case 'kontakt': {
        var z = finde(b.id), e = b.ergebnis;
        var text = { erreicht: 'Kunde erreicht', termin: 'Termin vereinbart', nicht_erreicht: 'nicht erreicht', kein_interesse: 'kein Interesse' }[e];
        if (!text) throw new Error('unbekanntes Ergebnis');
        if (e === 'erreicht') { var neuStatus = demoStufeNach(z.status); if (neuStatus) z.status = neuStatus; }
        else if (e === 'termin') {
          if (!String(b.termin || '').trim()) throw new Error('Termin fehlt');
          z.status = DEMO_AUSWAHL.field_3[4];
        } else if (e === 'kein_interesse') {
          if (!b.grund || DEMO_AUSWAHL.field_19.indexOf(b.grund) < 0) throw new Error('Grund fehlt oder unbekannt');
          z.status = DEMO_AUSWAHL.field_3[6];
        }
        if (e !== 'kein_interesse') {
          var wv = b.wiedervorlage;
          if (wv && (!/^\d{4}-\d{2}-\d{2}$/.test(wv) || wv < t)) throw new Error('Wiedervorlage ungültig');
          z.wiedervorlage = wv || EG.plusWerktage(t, e === 'nicht_erreicht' ? 1 : 2);
        }
        if (b.uebernehmen === true) z.verkaeufer = kuerzel;
        var nb = block(text, [e === 'termin' ? 'Termin: ' + b.termin : '', e === 'kein_interesse' ? 'Grund: ' + b.grund : ''].concat(String(b.notiz || '').split(/\r?\n/).map(function (x) { return x.trim(); })));
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
        var neu = { id: String(D.next++), name: String(b.name).trim(), vorname: String(b.vorname || '').trim(), verkaeufer: kuerzel, status: DEMO_AUSWAHL.field_3[0], herkunft: b.herkunft, ueber: b.ueber,
          email: mail, telefon: String(b.telefon || '').trim(), hersteller: f ? f.hersteller : '', modell: f ? f.modell : '', typ: f ? f.typ : '', fahrzeugnr: nr, notiz: nb2, anfrage: t, wiedervorlage: ymdPlus(t, 1) };
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
