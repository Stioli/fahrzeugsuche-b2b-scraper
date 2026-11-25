/* Stieber-App – Reiter „Fahrzeuge“ (Etappe 1b, B3 + B4, Plan 25.11.2026)                     Stand 25.11.2026 v1.2 (P4b: Mehrfeld-Dialog für den Reiter Zahlungen)
   Alle Felder der Masterliste je Fahrzeug – lesen, bearbeiten, neu anlegen. Eine Quelle für Rechte und Felder:
   bestand.feld_katalog (Oli 25.11.2026: admin, Dispo, Buchhaltung sehen/ändern alles und legen an; übrige Rollen
   lesen ohne EK/Zahlung/Ertrag und ändern nur ihre Punkte).
   Lesen:   RPC bestand.feld_katalog_meine()  +  bestand.fahrzeuge_lesen(p_stieber_id)   (filtert nach Rolle)
   Ändern:  Edge Function bestand_schreiben  (zeile → aktueller Masterliste-Wert + stand; aendern; anlegen)
            schreibt zuerst in die Masterliste, der Import zieht nach Supabase nach (wenige Sekunden).
            Schalter bestand.einstellung 'fahrzeug_schreiben' = probe → nichts wird gespeichert (Hinweis in der App).
   v1.2: window.EG_FZ.felderBearbeiten(stieberId, [sp_intern …]) – ein Dialog für mehrere Felder (nur geänderte Werte gehen an
         bestand_schreiben, mit Konfliktschutz). Nutzt der Reiter Zahlungen; eine Schreiblogik für beide Reiter.
   Baut auf window.EG (eingang-core.js) auf. Demo (?demo=1): erfundene Fahrzeuge, nichts verlässt die Seite. */
(function () {
  'use strict';
  var EG = window.EG, h = EG && EG.h;
  if (!EG) return;

  var ABSCHNITTE = [
    ['fahrzeug', 'Fahrzeug'], ['aufbereitung', 'Aufbereitung'], ['transport', 'Transport'], ['papiere', 'Papiere'],
    ['haken_fahrzeug', 'Haken Fahrzeug'], ['verkauf', 'Verkauf'], ['kunde', 'Kunde'], ['einkauf', 'Einkauf & Lieferant'],
    ['zahlung', 'Zahlung Kunde'], ['inzahlung', 'Inzahlungnahme & Ablöse'], ['finanzierung', 'Finanzierung & Netting'], ['kennzahlen', 'Kennzahlen']
  ];
  var NR = 'InterneNr_x002e_', HERST = 'FahrzeugModell', MODELL = 'Modell', FIN = 'Fgst_x002e__x002d_Nr_x002e__x003', AUTRADO = 'AutradoNr_x002e_';
  var STATUS = 'Status0', STANDORT = 'Status', STANDTAGE = 'Standtage';
  /* Geldbeträge, die in der Masterliste Zahl/berechnet sind, trotzdem mit € anzeigen */
  var GELD_BERECHNET = ['Kaufpreis', 'Zahlbetrag_x0020_Kunde', 'Kd_x2011_Ges_x2011_Zahlbetrag', 'Kd_x2011_Gesamtzahlung', 'InzRestwert', 'AufwandGesamt', 'UmsatzNetto', 'Ertrag', 'Zusatzrechnung'];
  /* Ansichts-Vorlagen statt der 12 SharePoint-Ansichten (Spalten, die die Rolle nicht lesen darf, fallen weg). */
  var VORLAGEN = [
    { k: 'bestand', t: 'Im Bestand', filter: function (f) { return txt(f[STATUS]) !== 'ausgeliefert'; },
      sp: [NR, HERST, MODELL, 'Farbe', STATUS, STANDORT, 'Transportstatus', 'gepl_x002d_Anlieferung', STANDTAGE, 'Innen', 'Aussen', 'Werkstatt0'] },
    { k: 'transport', t: 'Transport', filter: function (f) { var s = txt(f.Transportstatus); return !!s && s !== '5 im Haus'; },
      sp: [NR, HERST, MODELL, 'Lieferant', 'Transportstatus', 'Abholfreigabe', 'Speditionbeauftragt', 'Spedition', 'gepl_x002d_Anlieferung'] },
    { k: 'anlieferung', t: 'Anlieferung', filter: function (f) { return txt(f[STATUS]) === 'bestellt' || !!f.gepl_x002d_Anlieferung && !f.FahrzeuganlieferungAHS; },
      sp: [NR, HERST, MODELL, 'Lieferant', 'Bestelldatum', 'gepl_x002d_Anlieferung', 'FahrzeuganlieferungAHS', 'Transportstatus'] },
    { k: 'papiere', t: 'Papiere', filter: function (f) { var p = txt(f.Papiere); return p !== 'Kunde' && txt(f[STATUS]) !== 'ausgeliefert'; },
      sp: [NR, HERST, MODELL, 'Papiere', 'Papiereangefordert', 'PapiereEingangAHS', 'Lieferant'] },
    { k: 'geldeingang', t: 'Geldeingang', filter: function (f) { return !!f.KaufvertragDatum && txt(f.Fertig) !== 'komplett erhalten'; },
      sp: [NR, HERST, MODELL, 'KaufvertragDatum', 'VK_x002d_Preis_x002d_Kunde', 'Fertig', 'Kd_x002d_Zahlart', 'Kd_x2011_Gesamtzahlung', 'Verk_x00e4_ufer1'] },
    { k: 'standtage', t: 'Standtage', filter: function (f) { return txt(f[STATUS]) !== 'ausgeliefert' && num(f[STANDTAGE]) != null; },
      sp: [NR, HERST, MODELL, STATUS, 'FahrzeuganlieferungAHS', STANDTAGE, 'Bilder', 'LetztePreisanpassung'], sort: { sp: STANDTAGE, dir: -1 } },
    { k: 'auswertung', t: 'Auswertung', filter: function (f) { return txt(f[STATUS]) === 'ausgeliefert'; },
      sp: [NR, HERST, MODELL, 'KaufvertragDatum', 'Kd_x002d_Fzg_x002d_Rg_x002d_Datu', 'VK_x002d_Preis_x002d_Kunde', 'Kaufpreisnetto', 'AufwandGesamt', 'UmsatzNetto', 'Ertrag', 'ErtragProzent'] },
    { k: 'alle', t: 'Alle', filter: function () { return true; }, sp: [NR, HERST, MODELL, 'Farbe', FIN, STATUS, STANDORT, 'Lieferant', 'KaufvertragDatum'] }
  ];

  var S = { root: null, kat: [], katMap: {}, daten: [], vorlage: 'bestand', suche: '', sort: null, laedt: false, detail: null };

  EG.onTab('fahrzeuge', function (root) { S.root = root; return laden(); });

  /* Verknüpfung Kunde ↔ Fahrzeug (K2, 25.11.2026): der Reiter „Kunden“ öffnet hierüber ein Fahrzeug. */
  window.EG_FZ = {
    darf: function () { var b = document.getElementById('tabk-fahrzeuge'); return !!b && !b.hidden; },
    katalog: katalogSichern,
    felderBearbeiten: felderBearbeiten,
    oeffnen: async function (stieberId) {
      if (!S.kat.length) {
        var k = EG.demo ? demoKatalog() : (chk(await EG.sb.schema('bestand').rpc('feld_katalog_meine')).data || []);
        S.kat = k; S.katMap = {}; k.forEach(function (f) { S.katMap[f.sp_intern] = f; });
      }
      if (!S.daten.some(function (d) { return d.stieber_id === stieberId; })) {
        var n = EG.demo ? demoFahrzeuge().filter(function (d) { return d.stieber_id === stieberId; })
          : (chk(await EG.sb.schema('bestand').rpc('fahrzeuge_lesen', { p_stieber_id: stieberId })).data || []);
        if (!n[0]) { EG.toast('Fahrzeug ' + stieberId + ' nicht gefunden.'); return; }
        S.daten = S.daten.concat(n);
      }
      return detail(stieberId);
    }
  };

  /** Katalog der Rolle laden (einmalig). */
  async function katalogSichern() {
    if (!S.kat.length) {
      var k = EG.demo ? demoKatalog() : (chk(await EG.sb.schema('bestand').rpc('feld_katalog_meine')).data || []);
      S.kat = k; S.katMap = {}; k.forEach(function (f) { S.katMap[f.sp_intern] = f; });
    }
    return S.katMap;
  }
  /** Gleicher Vergleichswert für „geändert?“ (Zahl, Datum, Liste, Text). */
  function vergleich(f, v) {
    if (v == null || v === '') return '';
    if (Array.isArray(v)) return v.slice().sort().join(';');
    if (f.typ === 'Number' || f.typ === 'Currency') { var n = num(String(v).replace(',', '.')); return n == null ? String(v) : String(n); }
    if (f.typ === 'DateTime') return String(v).slice(0, 10);
    return String(v).trim();
  }
  /** P4b (25.11.2026): mehrere Felder eines Fahrzeugs in einem Dialog ändern – über denselben Weg wie ✎ im Reiter Fahrzeuge
      (Edge Function bestand_schreiben: aktuell lesen + stand, dann aendern). Einträge, die mit „#“ beginnen, sind Zwischenüberschriften.
      opts: { titel, vorgabe (nur Demo: sp_intern → Wert) } → Promise<{ gespeichert, werte (nur die geänderten), probe, demo } | null> */
  async function felderBearbeiten(stieberId, liste, opts) {
    opts = opts || {};
    await katalogSichern();
    var felder = liste.filter(function (k) { return k.charAt(0) === '#' || (S.katMap[k] && S.katMap[k].darf_aendern); });
    var echte = felder.filter(function (k) { return k.charAt(0) !== '#'; });
    if (!echte.length) { EG.toast('Keines dieser Felder darf deine Rolle ändern.', 'fehler'); return null; }
    var aktuell = {}, stand = '';
    if (EG.demo) { aktuell = Object.assign({}, opts.vorgabe || {}); }
    else {
      var z = await EG.sb.functions.invoke('bestand_schreiben', { body: { aktion: 'zeile', stieber_id: stieberId, felder: echte } });
      if (z.error) throw new Error(await fehlerText(z.error));
      aktuell = z.data.werte || {}; stand = z.data.stand;
    }
    var ein = {}, inhalt = [];
    felder.forEach(function (k) {
      if (k.charAt(0) === '#') { inhalt.push(h('h3', { class: 'fz-zwischen', text: k.slice(1).trim() })); return; }
      var f = S.katMap[k];
      ein[k] = eingabeFuer(f, aktuell[k]);
      inhalt.push(EG.feld(f.anzeigename, ein[k].el));
    });
    inhalt.push(h('p', { class: 'klein muted', text: 'Geändert wird nur, was du hier anders einträgst. Die Änderung geht direkt in die Masterliste und ist in wenigen Sekunden in der App.' }));
    var ergebnis = null, geaendert = {};
    var ok = await EG.dialog({
      titel: opts.titel || 'Felder ändern', inhalt: h('div', { class: 'fz-mehrfeld' }, inhalt), breit: true,
      knoepfe: [{ text: 'Abbrechen', art: 'ghost', wert: null }, {
        text: 'Speichern', art: 'primary', wert: 'ok',
        aktion: async function () {
          geaendert = {};
          echte.forEach(function (k) {
            var f = S.katMap[k], neu = ein[k].wert();
            if (vergleich(f, neu) !== vergleich(f, aktuell[k])) geaendert[k] = neu;
          });
          if (!Object.keys(geaendert).length) return 'Es wurde nichts geändert.';
          if (EG.demo) { ergebnis = { gesendet: true, demo: true }; return true; }
          var r = await EG.sb.functions.invoke('bestand_schreiben', { body: { aktion: 'aendern', stieber_id: stieberId, stand: stand, werte: geaendert } });
          if (r.error) return await fehlerText(r.error);
          ergebnis = r.data; return true;
        }
      }]
    });
    if (ok !== 'ok' || !ergebnis) return null;
    if (ergebnis.modus === 'probe') { EG.toast('Probe: Die Änderung wurde geprüft, aber noch NICHT gespeichert (Schreiben ist noch aus).'); return { gespeichert: false, probe: true, werte: geaendert }; }
    EG.toast(EG.demo ? 'Demo: geändert (nur auf dieser Seite).' : 'Gespeichert. Die App aktualisiert in wenigen Sekunden.', 'ok');
    if (!EG.demo) await warte(6000);
    return { gespeichert: true, demo: !!EG.demo, werte: geaendert };
  }

  /** Tabelle so hoch, dass ihr unterer Rand (mit der waagrechten Bildlaufleiste) im Fenster bleibt. */
  function hoeheAnpassen() {
    var el = S.tabBox && S.tabBox.querySelector('.fz-scroll');
    if (!el || !el.offsetParent) return;
    var oben = el.getBoundingClientRect().top + window.scrollY;
    el.style.maxHeight = Math.max(260, window.innerHeight - oben - 16) + 'px';
  }
  window.addEventListener('resize', hoeheAnpassen);

  function chk(r) { if (r && r.error) throw r.error; return r; }
  function txt(v) { if (v == null) return ''; if (typeof v === 'object' && !Array.isArray(v)) return String(v.wert != null ? (v.wert.wert != null ? v.wert.wert : v.wert) : (v.status || '')); return Array.isArray(v) ? v.join('; ') : String(v); }
  function num(v) { if (v == null || v === '') return null; var n = Number(v); return isFinite(n) ? n : null; }
  function darfAnlegen() { return ['admin', 'dispo', 'buchhaltung'].indexOf(EG.rolle) >= 0; }
  function darfVerlauf() { return ['admin', 'dispo', 'buchhaltung'].indexOf(EG.rolle) >= 0; }

  /* ---------------------------------------------------------------- Laden */
  async function laden() {
    if (S.laedt) return;
    S.laedt = true;
    S.root.innerHTML = '';
    S.root.appendChild(h('p', { class: 'muted', text: 'Lade Fahrzeuge …' }));
    try {
      var k, d;
      if (EG.demo) { k = demoKatalog(); d = demoFahrzeuge(); }
      else {
        k = chk(await EG.sb.schema('bestand').rpc('feld_katalog_meine')).data || [];
        d = chk(await EG.sb.schema('bestand').rpc('fahrzeuge_lesen', { p_stieber_id: null })).data || [];
      }
      S.kat = k; S.katMap = {}; k.forEach(function (f) { S.katMap[f.sp_intern] = f; });
      S.daten = d;
      zeichnen();
    } catch (e) {
      console.error(e);
      S.root.innerHTML = '';
      S.root.appendChild(EG.banner([h('strong', { text: 'Die Fahrzeuge konnten nicht geladen werden. ' }), (e && (e.message || e.details)) || String(e)], 'fehler'));
      S.root.appendChild(h('button', { type: 'button', class: 'btn btn-ghost', text: 'Erneut versuchen', onclick: function () { laden().catch(EG.fehler); } }));
    } finally { S.laedt = false; }
  }

  /* ---------------------------------------------------------------- Werte anzeigen */
  function anzeigen(sp, v) {
    var f = S.katMap[sp];
    if (v == null || v === '') return '';
    if (typeof v === 'object' && !Array.isArray(v)) {           // Haken {status, wert, von, am}
      var w = v.wert;
      if (w && typeof w === 'object' && !Array.isArray(w)) w = w.wert != null ? w.wert : (w.text != null ? w.text : JSON.stringify(w));
      var teil = w != null && w !== '' && w !== true ? anzeigen1(f, w) : (v.status === 'erledigt' || w === true ? '✓' : (v.status || ''));
      return teil + (v.am ? ' (' + EG.fmtDatum(v.am) + ')' : '');
    }
    return anzeigen1(f, v);
  }
  function anzeigen1(f, v) {
    if (Array.isArray(v)) return v.join(', ');
    if (typeof v === 'boolean') return v ? 'ja' : 'nein';
    var typ = f && f.typ;
    if (typ === 'DateTime' || (/^\d{4}-\d{2}-\d{2}/.test(String(v)) && String(v).length <= 25)) return EG.fmtDatum(String(v)) || String(v);
    if (typ === 'Currency' || (f && GELD_BERECHNET.indexOf(f.sp_intern) >= 0)) { var n = num(v); return n == null ? String(v) : n.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €'; }
    if (f && f.sp_intern === 'ErtragProzent') { var p = num(v); return p == null ? String(v) : (Math.abs(p) <= 1 ? p * 100 : p).toLocaleString('de-DE', { maximumFractionDigits: 1 }) + ' %'; }
    if (typ === 'Number' || typ === 'Calculated') { var z = num(v); return z == null ? String(v) : (Number.isInteger(z) ? String(z) : z.toLocaleString('de-DE', { maximumFractionDigits: 2 })); }
    return String(v);
  }
  function titel(x) { var f = x.felder || {}; return [x.interne_nr ? 'Nr. ' + x.interne_nr : '', [txt(f[HERST]), txt(f[MODELL])].filter(Boolean).join(' ')].filter(Boolean).join(' · ') || x.stieber_id; }

  /* ---------------------------------------------------------------- Liste */
  function vorlage() { return VORLAGEN.filter(function (v) { return v.k === S.vorlage; })[0] || VORLAGEN[0]; }
  function spalten() { return vorlage().sp.filter(function (sp) { return sp === NR || S.katMap[sp]; }); }
  function sichtbar() {
    var v = vorlage(), q = S.suche.trim().toLowerCase();
    var l = S.daten.filter(function (x) {
      var f = x.felder || {};
      if (!v.filter(f)) return false;
      if (!q) return true;
      return [x.interne_nr, x.stieber_id, txt(f[HERST]), txt(f[MODELL]), txt(f[FIN]), txt(f[AUTRADO]), txt(f.Lieferant)].join(' ').toLowerCase().indexOf(q) >= 0;
    });
    var s = S.sort || (v.sort ? { sp: v.sort.sp, dir: v.sort.dir } : { sp: NR, dir: -1 });
    var wert = function (x) { var w = s.sp === NR ? x.interne_nr : (x.felder || {})[s.sp]; var n = num(txt(w)); return n != null && !/^\d{4}-/.test(txt(w)) ? n : txt(w); };
    return l.map(function (x, i) { return { x: x, i: i, v: wert(x) }; }).sort(function (a, b) {
      var la = a.v === '' || a.v == null, lb = b.v === '' || b.v == null;
      if (la !== lb) return la ? 1 : -1;
      var c = typeof a.v === 'number' && typeof b.v === 'number' ? a.v - b.v : String(a.v).localeCompare(String(b.v), 'de', { numeric: true });
      return c * s.dir || a.i - b.i;
    }).map(function (o) { return o.x; });
  }

  function zeichnen() {
    var root = S.root; root.innerHTML = '';
    var such = h('input', { type: 'search', placeholder: 'Suchen: Nr., Modell, FIN, Autrado-Nr., Lieferant …', 'aria-label': 'Fahrzeuge suchen', value: S.suche,
      oninput: function () { S.suche = such.value; tabelleNeu(); } });
    var wahl = h('select', { 'aria-label': 'Ansicht', onchange: function () { S.vorlage = wahl.value; S.sort = null; zeichnen(); } },
      VORLAGEN.map(function (v) { return h('option', { value: v.k, text: 'Ansicht: ' + v.t }); }));
    wahl.value = S.vorlage;
    var knoepfe = h('div', { class: 'chips' },
      h('button', { type: 'button', class: 'btn btn-ghost btn-klein', text: 'Aktualisieren', onclick: function () { laden().catch(EG.fehler); } }),
      h('button', { type: 'button', class: 'btn btn-ghost btn-klein', text: 'Export (Excel)', onclick: exportieren }),
      darfAnlegen() ? h('button', { type: 'button', class: 'btn btn-primary btn-klein', text: 'Neues Fahrzeug', onclick: function () { anlegen().catch(EG.fehler); } }) : null);
    root.appendChild(h('div', { class: 'leiste' }, h('div', { class: 'leiste-zeile' }, such, wahl), knoepfe));
    S.tabBox = h('div', { class: 'fz-box' });
    root.appendChild(S.tabBox);
    tabelleNeu();
  }

  function tabelleNeu() {
    var box = S.tabBox; if (!box) return;
    box.innerHTML = '';
    var sp = spalten(), l = sichtbar();
    box.appendChild(h('p', { class: 'klein muted', text: l.length + ' von ' + S.daten.length + ' Fahrzeugen · Zeile antippen für alle Felder' }));
    if (!l.length) { box.appendChild(h('div', { class: 'leer', text: 'Keine Fahrzeuge in dieser Ansicht.' })); return; }
    var kopf = h('tr', {}, sp.map(function (k) {
      var an = S.sort && S.sort.sp === k;
      return h('th', { scope: 'col' }, h('button', { type: 'button', class: 'fz-th', title: 'Sortieren',
        onclick: function () { S.sort = !an ? { sp: k, dir: 1 } : S.sort.dir > 0 ? { sp: k, dir: -1 } : null; tabelleNeu(); } },
        k === NR ? 'Nr.' : (S.katMap[k] ? S.katMap[k].anzeigename : k), an ? (S.sort.dir > 0 ? ' ▲' : ' ▼') : ''));
    }));
    var rumpf = h('tbody', {}, l.slice(0, 500).map(function (x) {
      return h('tr', { tabindex: '0', class: 'fz-zeile', onclick: function () { detail(x.stieber_id).catch(EG.fehler); },
        onkeydown: function (e) { if (e.key === 'Enter') detail(x.stieber_id).catch(EG.fehler); } },
        sp.map(function (k) { return h('td', { text: k === NR ? (x.interne_nr || '–') : anzeigen(k, (x.felder || {})[k]) }); }));
    }));
    box.appendChild(h('div', { class: 'fz-scroll' }, h('table', { class: 'fz-tabelle' }, h('thead', {}, kopf), rumpf)));
    if (l.length > 500) box.appendChild(h('p', { class: 'klein muted', text: 'Nur die ersten 500 angezeigt – bitte suchen oder Ansicht wählen.' }));
    requestAnimationFrame(hoeheAnpassen);
  }

  /** Export als CSV (Semikolon, UTF-8 mit BOM – öffnet in Excel), nur sichtbare Zeilen und Spalten der Ansicht. */
  function exportieren() {
    var sp = spalten(), l = sichtbar();
    var esc = function (s) { s = String(s == null ? '' : s); return /[";\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
    var zeilen = [sp.map(function (k) { return esc(k === NR ? 'Interne Nr.' : S.katMap[k].anzeigename); }).join(';')];
    l.forEach(function (x) { zeilen.push(sp.map(function (k) { return esc(k === NR ? x.interne_nr : anzeigen(k, (x.felder || {})[k])); }).join(';')); });
    var blob = new Blob(['﻿' + zeilen.join('\r\n')], { type: 'text/csv;charset=utf-8' });
    var a = h('a', { href: URL.createObjectURL(blob), download: 'Fahrzeuge_' + vorlage().t.replace(/\W+/g, '_') + '_' + EG.heute() + '.csv' });
    document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  }

  /* ---------------------------------------------------------------- Detail */
  async function detail(stieberId) {
    var x = S.daten.filter(function (d) { return d.stieber_id === stieberId; })[0];
    if (!x) return;
    var inhalt = h('div', { class: 'fz-detail' });
    function aufbauen(x) {
      inhalt.innerHTML = '';
      inhalt.appendChild(h('p', { class: 'klein muted', text: 'Stieber-ID ' + x.stieber_id + (x.ml_ref ? ' · Masterliste-Zeile ' + x.ml_ref : ' · ohne Masterliste-Zeile') }));
      if (window.EG_KD && window.EG_KD.darf()) {        // Kunde zu diesem Fahrzeug (Reiter „Kunden“, K2)
        var kdPlatz = h('div', { class: 'kd-zum-kunden' });
        inhalt.appendChild(kdPlatz);
        window.EG_KD.fuerFahrzeug(x.stieber_id).then(function (k) {
          if (!k) return;
          kdPlatz.appendChild(h('button', { type: 'button', class: 'btn btn-ghost btn-klein', text: 'Kunde öffnen: ' + (k.name || 'Kunde') + ' ›',
            onclick: function () { window.EG_KD.oeffnen(k.id).catch(EG.fehler); } }));
        }).catch(function (e) { console.warn('Kunde zum Fahrzeug', e); });
      }
      ABSCHNITTE.forEach(function (a) {
        var felder = S.kat.filter(function (f) { return f.abschnitt === a[0]; });
        if (!felder.length) return;
        var dl = h('dl', { class: 'fz-dl' });
        felder.forEach(function (f) {
          var v = (x.felder || {})[f.sp_intern];
          var wert = h('dd', {}, h('span', { text: anzeigen(f.sp_intern, v) || '–', class: anzeigen(f.sp_intern, v) ? '' : 'muted' }));
          if (f.darf_aendern && x.ml_ref) {
            wert.appendChild(h('button', { type: 'button', class: 'fz-edit', 'aria-label': f.anzeigename + ' ändern', title: 'ändern', text: '✎',
              onclick: function () { feldAendern(x, f).then(function (neu) { if (neu) aufbauen(neu); }).catch(EG.fehler); } }));
          }
          dl.appendChild(h('div', { class: 'fz-paar' }, h('dt', { text: f.anzeigename }), wert));
        });
        inhalt.appendChild(h('details', { class: 'fz-abschnitt', open: ['fahrzeug', 'aufbereitung', 'transport'].indexOf(a[0]) >= 0 },
          h('summary', { text: a[1] + ' (' + felder.length + ')' }), dl));
      });
      if (darfVerlauf() && !EG.demo) {
        var verlauf = h('details', { class: 'fz-abschnitt' }, h('summary', { text: 'Änderungsverlauf' }));
        verlauf.addEventListener('toggle', function () { if (verlauf.open && !verlauf.dataset.geladen) { verlauf.dataset.geladen = '1'; verlaufLaden(x, verlauf).catch(EG.fehler); } });
        inhalt.appendChild(verlauf);
      }
    }
    aufbauen(x);
    await EG.dialog({ titel: titel(x), inhalt: inhalt, breit: true, knoepfe: [{ text: 'Schließen', art: 'ghost', wert: null }] });
  }

  async function verlaufLaden(x, box) {
    var r = chk(await EG.tab('bestand', 'aenderung_log').select('am,von_name,sp_intern,alt,neu,ergebnis').eq('stieber_id', x.stieber_id).order('am', { ascending: false }).limit(30));
    var l = r.data || [];
    if (!l.length) { box.appendChild(h('p', { class: 'klein muted', text: 'Noch keine Änderung aus der App.' })); return; }
    box.appendChild(h('ul', { class: 'fz-verlauf' }, l.map(function (z) {
      var f = S.katMap[z.sp_intern];
      return h('li', { text: EG.fmtZeit(z.am) + ' · ' + (z.von_name || '?') + ' · ' + (f ? f.anzeigename : (z.sp_intern || 'angelegt')) + ': „' + (z.alt || '–') + '“ → „' + (z.neu || '–') + '“' + (z.ergebnis === 'gesendet' ? '' : ' (' + z.ergebnis + ')') });
    })));
  }

  /* ---------------------------------------------------------------- Ändern */
  function eingabeFuer(f, wert) {
    var id = 'fz-ein-' + f.sp_intern;
    if (f.typ === 'Choice') {
      var s = h('select', { id: id }, h('option', { value: '', text: '– leer –' }), (f.auswahl || []).map(function (w) { return h('option', { value: w, text: w }); }));
      s.value = wert == null ? '' : String(wert);
      return { el: s, wert: function () { return s.value; } };
    }
    if (f.typ === 'MultiChoice') {
      var gew = Array.isArray(wert) ? wert : (wert ? String(wert).split(/;\s*/) : []);
      var boxen = (f.auswahl || []).map(function (w) { var c = h('input', { type: 'checkbox', value: w, checked: gew.indexOf(w) >= 0 }); return { c: c, el: h('label', { class: 'fz-multi' }, c, ' ' + w) }; });
      return { el: h('div', { id: id }, boxen.map(function (b) { return b.el; })), wert: function () { return boxen.filter(function (b) { return b.c.checked; }).map(function (b) { return b.c.value; }); } };
    }
    if (f.typ === 'DateTime') { var d = h('input', { type: 'date', id: id, value: wert ? String(wert).slice(0, 10) : '' }); return { el: d, wert: function () { return d.value; } }; }
    if (f.typ === 'Number' || f.typ === 'Currency') { var n = h('input', { type: 'text', inputmode: 'decimal', id: id, value: wert == null ? '' : String(wert).replace('.', ',') }); return { el: n, wert: function () { return n.value.trim(); } }; }
    if (f.typ === 'Note') { var t = h('textarea', { id: id, rows: 4, value: wert == null ? '' : String(wert) }); return { el: t, wert: function () { return t.value; } }; }
    if (f.typ === 'User') {
      var u = h('select', { id: id }, h('option', { value: '', text: '– leer –' }), ['OS', 'AI', 'DG', 'NP'].map(function (k) { return h('option', { value: k, text: k }); }));
      u.value = wert == null ? '' : String(wert);
      return { el: u, wert: function () { return u.value; } };
    }
    var i = h('input', { type: 'text', id: id, value: wert == null ? '' : String(wert) });
    return { el: i, wert: function () { return i.value.trim(); } };
  }

  /** Öffnet den Bearbeiten-Dialog für ein Feld. Liest vorher den aktuellen Masterliste-Wert (Konfliktschutz). → neues Fahrzeug-Objekt oder null */
  async function feldAendern(x, f) {
    var aktuell, stand = '';
    if (EG.demo) { aktuell = (x.felder || {})[f.sp_intern]; if (aktuell && typeof aktuell === 'object' && !Array.isArray(aktuell)) aktuell = aktuell.wert; }
    else {
      var z = await EG.sb.functions.invoke('bestand_schreiben', { body: { aktion: 'zeile', stieber_id: x.stieber_id, felder: [f.sp_intern] } });
      if (z.error) throw new Error(await fehlerText(z.error));
      aktuell = z.data.werte[f.sp_intern]; stand = z.data.stand;
    }
    var ein = eingabeFuer(f, aktuell);
    var ergebnis = null;
    var ok = await EG.dialog({
      titel: f.anzeigename + ' ändern',
      inhalt: [EG.feld(f.anzeigename, ein.el, 'Aktuell in der Masterliste: ' + (anzeigen1(f, aktuell) || '–')),
        h('p', { class: 'klein muted', text: 'Die Änderung geht direkt in die Masterliste und ist in wenigen Sekunden in der App.' })],
      knoepfe: [{ text: 'Abbrechen', art: 'ghost', wert: null }, {
        text: 'Speichern', art: 'primary', wert: 'ok',
        aktion: async function () {
          var neu = ein.wert();
          if (EG.demo) { x.felder[f.sp_intern] = neu; ergebnis = { gesendet: true, demo: true }; return true; }
          var body = { aktion: 'aendern', stieber_id: x.stieber_id, stand: stand, werte: {} };
          body.werte[f.sp_intern] = neu;
          var r = await EG.sb.functions.invoke('bestand_schreiben', { body: body });
          if (r.error) return await fehlerText(r.error);
          ergebnis = r.data; return true;
        }
      }]
    });
    if (ok !== 'ok' || !ergebnis) return null;
    if (ergebnis.modus === 'probe') { EG.toast('Probe: Die Änderung wurde geprüft, aber noch NICHT gespeichert (Schreiben ist noch aus).'); return null; }
    EG.toast(EG.demo ? 'Demo: geändert (nur auf dieser Seite).' : 'Gespeichert. Die App aktualisiert in wenigen Sekunden.', 'ok');
    if (EG.demo) return x;
    await warte(6000);
    var n = chk(await EG.sb.schema('bestand').rpc('fahrzeuge_lesen', { p_stieber_id: x.stieber_id })).data || [];
    if (n[0]) { S.daten = S.daten.map(function (d) { return d.stieber_id === x.stieber_id ? n[0] : d; }); tabelleNeu(); return n[0]; }
    return x;
  }
  function warte(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  async function fehlerText(err) {
    try { var t = await err.context.json(); return t.text || t.fehler || err.message; } catch (e) { return (err && err.message) || String(err); }
  }

  /* ---------------------------------------------------------------- Anlegen */
  var ANLEGEN_FELDER = [HERST, MODELL, 'Type', 'Farbe', FIN, NR, AUTRADO, 'NW_x002f_GW', STANDORT, 'Lieferant', 'Bestelldatum', 'Lief_x002d_Best_x002d_Nr_x003a_', 'gepl_x002d_Anlieferung', 'Kaufpreisnetto', 'Eink_x00e4_ufer', 'Transportstatus'];
  async function anlegen() {
    var felder = ANLEGEN_FELDER.map(function (k) { return S.katMap[k]; }).filter(function (f) { return f && f.darf_aendern; });
    var ein = {};
    var inhalt = h('div', {}, felder.map(function (f) {
      ein[f.sp_intern] = eingabeFuer(f, f.sp_intern === STANDORT ? 'bestellt' : f.sp_intern === 'Transportstatus' ? '6 bestellt' : null);
      return EG.feld(f.anzeigename + (f.pflicht_anlegen ? ' *' : ''), ein[f.sp_intern].el);
    }), h('p', { class: 'klein muted', text: '* Pflichtfeld. Weitere Felder danach im Fahrzeug ergänzen. Die Stieber-ID vergibt der Import in wenigen Sekunden.' }));
    var ergebnis = null;
    var ok = await EG.dialog({
      titel: 'Neues Fahrzeug anlegen', inhalt: inhalt, breit: true,
      knoepfe: [{ text: 'Abbrechen', art: 'ghost', wert: null }, {
        text: 'Anlegen', art: 'primary', wert: 'ok',
        aktion: async function () {
          var werte = {};
          for (var k in ein) { var v = ein[k].wert(); if (v !== '' && !(Array.isArray(v) && !v.length)) werte[k] = v; }
          var fehlt = felder.filter(function (f) { return f.pflicht_anlegen && !werte[f.sp_intern]; }).map(function (f) { return f.anzeigename; });
          if (fehlt.length) return 'Bitte ausfüllen: ' + fehlt.join(', ');
          if (EG.demo) { ergebnis = { gesendet: true, demo: true }; return true; }
          var r = await EG.sb.functions.invoke('bestand_schreiben', { body: { aktion: 'anlegen', werte: werte } });
          if (r.error) return await fehlerText(r.error);
          ergebnis = r.data; return true;
        }
      }]
    });
    if (ok !== 'ok' || !ergebnis) return;
    if (ergebnis.modus === 'probe') { EG.toast('Probe: Das Fahrzeug wurde geprüft, aber noch NICHT angelegt (Schreiben ist noch aus).'); return; }
    EG.toast(EG.demo ? 'Demo: angelegt (nur auf dieser Seite).' : 'Angelegt in der Masterliste. Es erscheint in wenigen Sekunden.', 'ok');
    if (!EG.demo) { await warte(8000); await laden(); }
  }

  /* ====================================================================
     DEMO (nur ?demo=1): Katalog-Auszug und erfundene Fahrzeuge, Rechte wie in der Datenbank nachgebildet
     ==================================================================== */
  var ALLE = ['admin', 'dispo', 'buchhaltung', 'verkauf', 'werkstatt', 'aufbereitung'], BUERO = ['admin', 'dispo', 'buchhaltung'];
  function dk(sp, name, typ, abschnitt, lesen, aendern, auswahl, pflicht) { return { sp_intern: sp, anzeigename: name, typ: typ, abschnitt: abschnitt, lesen: lesen, aendern: aendern, auswahl: auswahl || null, pflicht_anlegen: !!pflicht }; }
  var DEMO_KAT = [
    dk(NR, 'Interne Nr.', 'Number', 'fahrzeug', ALLE, BUERO), dk(HERST, 'Hersteller', 'Text', 'fahrzeug', ALLE, BUERO, null, true), dk(MODELL, 'Modell', 'Text', 'fahrzeug', ALLE, BUERO, null, true),
    dk('Farbe', 'Farbe', 'Choice', 'fahrzeug', ALLE, BUERO, ['schwarz', 'weiß', 'grau', 'blau', 'rot', 'silber']), dk(FIN, 'Fgst.-Nr.', 'Text', 'fahrzeug', ALLE, BUERO),
    dk('NW_x002f_GW', 'NW / GW', 'Choice', 'fahrzeug', ALLE, BUERO, ['NW', 'GW', 'TZ'], true), dk('KMStand', 'KM Stand', 'Number', 'fahrzeug', ALLE, BUERO.concat(['werkstatt'])),
    dk(STATUS, 'Status', 'Choice', 'aufbereitung', ALLE, BUERO.concat(['werkstatt', 'aufbereitung']), ['bestellt', 'Transport', 'im Haus', 'Werkstatt', 'Aufbereitung', 'Endkontrolle', 'fertig', 'ausgeliefert']),
    dk('Innen', 'Innen', 'Choice', 'aufbereitung', ALLE, BUERO.concat(['werkstatt', 'aufbereitung']), ['fertig', 'nein', 'in Arbeit', 'für Showroom']),
    dk('Aussen', 'Aussen', 'Choice', 'aufbereitung', ALLE, BUERO.concat(['werkstatt', 'aufbereitung']), ['nein', 'fertig', 'in Arbeit', 'für Showroom']),
    dk('Werkstatt0', 'Werkstatt', 'Choice', 'aufbereitung', ALLE, BUERO.concat(['werkstatt', 'aufbereitung']), ['nicht begonnen', 'fertig', 'in arbeit']),
    dk(STANDORT, 'Standort', 'Choice', 'transport', ALLE, BUERO, ['AH Stieber', 'Transport', 'Lieferant', 'bestellt', 'Kunde'], true),
    dk('Transportstatus', 'Transportstatus', 'Choice', 'transport', ALLE, BUERO, ['1 wird gebracht', '2 geplant', '3 abholbereit nicht geplant', '4 bei Lieferant - offen', '5 im Haus', '6 bestellt']),
    dk('gepl_x002d_Anlieferung', 'gepl-Anlieferung', 'DateTime', 'transport', ALLE, BUERO), dk('FahrzeuganlieferungAHS', 'Fzg-Anlieferung AHS', 'DateTime', 'transport', ALLE, BUERO),
    dk('Papiere', 'Papiere akt. Status', 'Choice', 'papiere', ALLE, BUERO, ['AH Stieber', 'Kunde', 'Lieferant', 'Zulassung', 'SCB eingelagert']),
    dk('Bilder', 'Bilder', 'Choice', 'haken_fahrzeug', ALLE, BUERO.concat(['aufbereitung']), ['NOK', 'OK', 'provisorisch']),
    dk('Lieferant', 'Lieferant', 'Text', 'einkauf', BUERO, BUERO, null, true), dk('Kaufpreisnetto', 'Fzg-EK ohne MwSt', 'Currency', 'einkauf', BUERO, BUERO),
    dk('KaufvertragDatum', 'Kaufvertrag Datum', 'DateTime', 'verkauf', ALLE, BUERO), dk('Verk_x00e4_ufer1', 'Verkäufer', 'User', 'verkauf', ALLE, BUERO),
    dk('VK_x002d_Preis_x002d_Kunde', 'Kd-Fzg-VK Preis', 'Currency', 'zahlung', BUERO, BUERO), dk('Fertig', 'Kd-Geldeingang', 'Choice', 'zahlung', BUERO, BUERO, ['nein', 'Teilzahlung', 'komplett erhalten']),
    dk('Kd_x002d_Zahlart', 'Kd-Zahlart', 'MultiChoice', 'zahlung', BUERO, BUERO, ['Bar', 'Überweisung', 'Finanzierung SCB', 'Anzahlung', 'Inzahlungnahme']),
    /* Zahlung/Einkauf (nur Demo, für den Reiter Zahlungen) */
    dk('Kd_x002d_Barzahlung', 'Kd-Bar', 'Currency', 'zahlung', BUERO, BUERO), dk('Ld_x002d_Barz_x002d_Datum', 'Kd-Bar-Dat', 'DateTime', 'zahlung', BUERO, BUERO),
    dk('Kd_x002d_1Uebw', 'Kd-1Uebw', 'Currency', 'zahlung', BUERO, BUERO), dk('Kd_x002d__x00dc_berw_x002d_Datum', 'Kd-1Uebw-Dat', 'DateTime', 'zahlung', BUERO, BUERO),
    dk('Kd_x002d_2Uebw', 'Kd-2Uebw', 'Currency', 'zahlung', BUERO, BUERO), dk('_x0031_DatumGeldeingang', 'Kd-2Uebw-Dat', 'DateTime', 'zahlung', BUERO, BUERO),
    dk('Kd_x002d_3Uebw', 'Kd-3Uebw', 'Currency', 'zahlung', BUERO, BUERO), dk('_x0033_DatumGeldeingang', 'Kd-3Uebw-Dat', 'DateTime', 'zahlung', BUERO, BUERO),
    dk('Kd_x002d_Finz', 'Kd-Finz-€', 'Currency', 'zahlung', BUERO, BUERO), dk('Kd_x002d_Finz_x002d_Datum', 'Kd-Finz-Dat', 'DateTime', 'zahlung', BUERO, BUERO),
    dk('Inz_x002d_Betrag', 'Inz-Wert', 'Currency', 'inzahlung', BUERO, BUERO), dk('Inz_x002d_Datum', 'Inz-Datum', 'DateTime', 'inzahlung', BUERO, BUERO),
    dk('Inzahlungnahme', 'Inz ?', 'Choice', 'inzahlung', BUERO, BUERO, ['nein', 'ja']),
    dk('Zusatzrechnung', 'Kd-Zusatz-Rg', 'Number', 'zahlung', BUERO, BUERO), dk('KdZusatzRgDatum', 'Kd Zusatz Rg Datum', 'DateTime', 'zahlung', BUERO, BUERO),
    dk('Lieferant_x002d_Nr_x002e_', 'Lief-Nr', 'Text', 'einkauf', BUERO, BUERO), dk('Rechnung_x002d_Lieferant', 'Lief-Rg-Nr', 'Text', 'einkauf', BUERO, BUERO),
    dk('Rg_x002d_Datum', 'Lief-Rg-Datum', 'DateTime', 'einkauf', BUERO, BUERO), dk('Lief_x002d_Rg_x002d_Betr_x002d_b', 'Lief-Rg-Betr-brutto', 'Currency', 'einkauf', BUERO, BUERO),
    dk('Fahrzeugbezahlt', 'Lief-Fzg bezahlt', 'Choice', 'einkauf', BUERO, BUERO, ['nein', 'ja']), dk('Lief_x002d_Rg_x002d_bezahlt', 'Lief-Rg-bez-Datum', 'DateTime', 'einkauf', BUERO, BUERO),
    dk('EK_x002d_Finanz', 'EK-Finz', 'Choice', 'finanzierung', BUERO, BUERO, ['nein', 'ja']), dk('EK_x002d_Betrag', 'EK-Finz-€', 'Currency', 'finanzierung', BUERO, BUERO),
    dk('EK_x002d_Geldeingang', 'EK-Finz-Geldein-Datum', 'DateTime', 'finanzierung', BUERO, BUERO), dk('DatumEK_x002d_Abl_x00f6_se', 'EK-Finz-Abl-Datum', 'DateTime', 'finanzierung', BUERO, BUERO),
    dk(STANDTAGE, 'Standtage', 'Calculated', 'kennzahlen', BUERO, []), dk('Ertrag', 'Ertrag', 'Calculated', 'kennzahlen', BUERO, [])
  ];
  function demoKatalog() {
    return DEMO_KAT.filter(function (f) { return f.lesen.indexOf(EG.rolle) >= 0; })
      .map(function (f) { return Object.assign({}, f, { darf_aendern: f.aendern.indexOf(EG.rolle) >= 0 }); });
  }
  var demoDaten = null;
  function demoFahrzeuge() {
    if (!demoDaten) {
      var d = function (n) { var x = new Date(); x.setDate(x.getDate() + n); return EG.isoDatum(x); };
      var fz = function (id, nr, o) { var f = {}; f[NR] = nr; return { stieber_id: id, ml_ref: 'demo', interne_nr: nr, felder: Object.assign(f, o) }; };
      demoDaten = [
        fz('ST-26-9001', '90001', { FahrzeugModell: 'Hyundai', Modell: 'Tucson 1.6 Demo', Farbe: 'weiß', NW_x002f_GW: 'NW', Status0: 'im Haus', Status: 'AH Stieber', Transportstatus: '5 im Haus', FahrzeuganlieferungAHS: d(-20), Standtage: 20, Innen: 'fertig', Aussen: 'in Arbeit', Werkstatt0: 'fertig', Lieferant: 'Demo-Autohaus Nord', Kaufpreisnetto: 24500, Bilder: { status: 'erledigt', wert: 'OK', am: d(-15) } }),
        fz('ST-26-9002', '90002', { FahrzeugModell: 'Kia', Modell: 'Sportage Demo', Farbe: 'grau', NW_x002f_GW: 'GW', Status0: 'bestellt', Status: 'bestellt', Transportstatus: '2 geplant', gepl_x002d_Anlieferung: d(3), Lieferant: 'Beispiel Fahrzeughandel', Kaufpreisnetto: 19800 }),
        fz('ST-26-9003', '90003', { FahrzeugModell: 'Opel', Modell: 'Mokka Demo', Farbe: 'rot', NW_x002f_GW: 'TZ', Status0: 'ausgeliefert', Status: 'Kunde', Transportstatus: '5 im Haus', KaufvertragDatum: d(-30), Verk_x00e4_ufer1: 'NP', VK_x002d_Preis_x002d_Kunde: 27990, Fertig: 'komplett erhalten', Kd_x002d_Zahlart: ['Überweisung'], Kaufpreisnetto: 21000, Ertrag: 1240.5, Lieferant: 'Demo-Autohaus Nord' }),
        fz('ST-26-9004', '90004', { FahrzeugModell: 'Nissan', Modell: 'Qashqai Demo', Farbe: 'schwarz', NW_x002f_GW: 'NW', Status0: 'im Haus', Status: 'AH Stieber', Transportstatus: '5 im Haus', FahrzeuganlieferungAHS: d(-75), Standtage: 75, KaufvertragDatum: d(-2), Verk_x00e4_ufer1: 'AI', VK_x002d_Preis_x002d_Kunde: 31990, Fertig: 'Teilzahlung', Kd_x002d_Zahlart: ['Anzahlung', 'Finanzierung SCB'], Lieferant: 'Beispiel Fahrzeughandel', Kaufpreisnetto: 25500 })
      ];
    }
    var lesbar = {}; demoKatalog().forEach(function (f) { lesbar[f.sp_intern] = true; });
    return demoDaten.map(function (x) {
      var f = {}; Object.keys(x.felder).forEach(function (k) { if (lesbar[k]) f[k] = x.felder[k]; });
      return { stieber_id: x.stieber_id, ml_ref: x.ml_ref, interne_nr: x.interne_nr, felder: f };
    });
  }
})();
