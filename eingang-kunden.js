/* Stieber-App – Reiter „Kunden“ (Etappe 1b, K1, Oli 25.11.2026)                          Stand 25.11.2026 v1
   Alle Kunden mit Kontaktdaten und ihren Fahrzeugen – suchen, ansehen, anrufen/mailen, ändern.
   Sehen: admin, Dispo, Buchhaltung, Verkauf. Ändern: admin, Dispo, Buchhaltung (Rechte laut bestand.feld_katalog).
   Lesen:   RPC crm.kunden_lesen(p_id)  (prüft die Rolle, liefert darf_aendern je Kunde)
   Ändern:  Edge Function bestand_schreiben, Aktion kunde_aendern
            Name, Straße, PLZ, Telefon, E-Mail, KD-Nr. → in ALLE Masterliste-Zeilen des Kunden, der Import zieht nach.
            Firma, 2. Telefon, Notiz → nur in der App (crm.kunde).  Ort → nur in der Masterliste (Ortsfeld).
   Baut auf window.EG (eingang-core.js) auf. Demo (?demo=1): erfundene Kunden, nichts verlässt die Seite. */
(function () {
  'use strict';
  var EG = window.EG, h = EG && EG.h;
  if (!EG) return;

  var FELDER = [
    ['name', 'Name'], ['firma', 'Firma'], ['strasse', 'Straße & Nr.'], ['plz', 'PLZ'], ['ort', 'Ort'],
    ['telefon', 'Telefon'], ['telefon2', '2. Telefon'], ['email', 'E-Mail'], ['repdoc_kdnr', 'Repdoc-Kd.-Nr.'], ['notiz', 'Notiz']
  ];
  var NAME = {}; FELDER.forEach(function (f) { NAME[f[0]] = f[1]; });
  var NUR_APP = { firma: 1, telefon2: 1, notiz: 1 };
  var SPALTEN = [['name', 'Name'], ['ort', 'Ort'], ['telefon', 'Telefon'], ['email', 'E-Mail'], ['repdoc_kdnr', 'KD-Nr.'], ['fz', 'Fahrzeuge'], ['kauf', 'Letzter Kauf']];

  var S = { root: null, daten: [], suche: '', sort: null, laedt: false, tabBox: null };

  EG.onTab('kunden', function (root) { S.root = root; return laden(); });

  function chk(r) { if (r && r.error) throw r.error; return r; }
  function t(v) { return v == null ? '' : String(v); }
  function darfExport() { return ['admin', 'dispo', 'buchhaltung'].indexOf(EG.rolle) >= 0; }
  function letzterKauf(k) { var f = (k.fahrzeuge || [])[0]; return f && f.kaufvertrag_datum ? String(f.kaufvertrag_datum).slice(0, 10) : ''; }
  function ortZeile(k) { return [t(k.plz), t(k.ort)].filter(Boolean).join(' '); }
  function telLink(v) { var z = t(v).replace(/[^\d+]/g, ''); return z ? 'tel:' + z : null; }
  function fzText(f) { return [f.interne_nr ? 'Nr. ' + f.interne_nr : '', [t(f.hersteller), t(f.modell)].filter(Boolean).join(' ')].filter(Boolean).join(' · ') || t(f.stieber_id) || 'Fahrzeug'; }

  /* ---------------------------------------------------------------- Laden */
  async function laden() {
    if (S.laedt) return;
    S.laedt = true;
    S.root.innerHTML = '';
    S.root.appendChild(h('p', { class: 'muted', text: 'Lade Kunden …' }));
    try {
      S.daten = EG.demo ? demoKunden() : (chk(await EG.sb.schema('crm').rpc('kunden_lesen', { p_id: null })).data || []);
      zeichnen();
    } catch (e) {
      console.error(e);
      S.root.innerHTML = '';
      S.root.appendChild(EG.banner([h('strong', { text: 'Die Kunden konnten nicht geladen werden. ' }), (e && (e.message || e.details)) || String(e)], 'fehler'));
      S.root.appendChild(h('button', { type: 'button', class: 'btn btn-ghost', text: 'Erneut versuchen', onclick: function () { laden().catch(EG.fehler); } }));
    } finally { S.laedt = false; }
  }

  /* ---------------------------------------------------------------- Liste */
  function wertFuer(k, sp) {
    if (sp === 'fz') return (k.fahrzeuge || []).length;
    if (sp === 'kauf') return letzterKauf(k);
    if (sp === 'ort') return ortZeile(k);
    return t(k[sp]);
  }
  function sichtbar() {
    var q = S.suche.trim().toLowerCase(), qz = q.replace(/[^\d]/g, '');
    var l = S.daten.filter(function (k) {
      if (!q) return true;
      var fz = (k.fahrzeuge || []).map(function (f) { return [f.interne_nr, f.hersteller, f.modell, f.fin].join(' '); }).join(' ');
      var heu = [k.name, k.firma, k.strasse, k.plz, k.ort, k.email, k.repdoc_kdnr, k.notiz, fz].join(' ').toLowerCase();
      if (heu.indexOf(q) >= 0) return true;
      return qz.length >= 4 && (t(k.telefon) + ' ' + t(k.telefon2)).replace(/[^\d ]/g, '').indexOf(qz) >= 0;
    });
    var s = S.sort || { sp: 'name', dir: 1 };
    return l.map(function (k, i) { return { k: k, i: i, v: wertFuer(k, s.sp) }; }).sort(function (a, b) {
      var la = a.v === '' || a.v == null, lb = b.v === '' || b.v == null;
      if (la !== lb) return la ? 1 : -1;
      var c = typeof a.v === 'number' && typeof b.v === 'number' ? a.v - b.v : String(a.v).localeCompare(String(b.v), 'de', { numeric: true });
      return c * s.dir || a.i - b.i;
    }).map(function (o) { return o.k; });
  }

  function zeichnen() {
    var root = S.root; root.innerHTML = '';
    var such = h('input', { type: 'search', placeholder: 'Suchen: Name, Ort, Telefon, E-Mail, KD-Nr., Fahrzeug …', 'aria-label': 'Kunden suchen', value: S.suche,
      oninput: function () { S.suche = such.value; tabelleNeu(); } });
    var knoepfe = h('div', { class: 'chips' },
      h('button', { type: 'button', class: 'btn btn-ghost btn-klein', text: 'Aktualisieren', onclick: function () { laden().catch(EG.fehler); } }),
      darfExport() ? h('button', { type: 'button', class: 'btn btn-ghost btn-klein', text: 'Export (Excel)', onclick: exportieren }) : null);
    root.appendChild(h('div', { class: 'leiste' }, h('div', { class: 'leiste-zeile' }, such), knoepfe));
    S.tabBox = h('div', { class: 'fz-box' });
    root.appendChild(S.tabBox);
    tabelleNeu();
  }

  function zelle(k, sp) {
    if (sp === 'fz') return String((k.fahrzeuge || []).length || '–');
    if (sp === 'kauf') { var d = letzterKauf(k); return d ? EG.fmtDatum(d) : '–'; }
    if (sp === 'ort') return ortZeile(k) || '–';
    return t(k[sp]) || '–';
  }

  function tabelleNeu() {
    var box = S.tabBox; if (!box) return;
    box.innerHTML = '';
    var l = sichtbar();
    box.appendChild(h('p', { class: 'klein muted', text: l.length + ' von ' + S.daten.length + ' Kunden · Zeile antippen für alle Kontaktdaten und Fahrzeuge' }));
    if (!l.length) { box.appendChild(h('div', { class: 'leer', text: 'Kein Kunde gefunden.' })); return; }
    var kopf = h('tr', {}, SPALTEN.map(function (s) {
      var an = S.sort && S.sort.sp === s[0];
      return h('th', { scope: 'col' }, h('button', { type: 'button', class: 'fz-th', title: 'Sortieren',
        onclick: function () { S.sort = !an ? { sp: s[0], dir: s[0] === 'kauf' || s[0] === 'fz' ? -1 : 1 } : S.sort.dir > 0 ? { sp: s[0], dir: -1 } : null; tabelleNeu(); } },
        s[1], an ? (S.sort.dir > 0 ? ' ▲' : ' ▼') : ''));
    }));
    var rumpf = h('tbody', {}, l.slice(0, 500).map(function (k) {
      return h('tr', { tabindex: '0', class: 'fz-zeile', onclick: function () { detail(k.id).catch(EG.fehler); },
        onkeydown: function (e) { if (e.key === 'Enter') detail(k.id).catch(EG.fehler); } },
        SPALTEN.map(function (s) { return h('td', { text: zelle(k, s[0]) }); }));
    }));
    box.appendChild(h('div', { class: 'fz-scroll' }, h('table', { class: 'fz-tabelle' }, h('thead', {}, kopf), rumpf)));
    if (l.length > 500) box.appendChild(h('p', { class: 'klein muted', text: 'Nur die ersten 500 angezeigt – bitte suchen.' }));
  }

  /** Export als CSV (Semikolon, UTF-8 mit BOM – öffnet in Excel), nur die gefilterten Kunden. */
  function exportieren() {
    var l = sichtbar();
    var esc = function (s) { s = String(s == null ? '' : s); return /[";\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
    var kopf = FELDER.map(function (f) { return f[1]; }).concat(['Fahrzeuge', 'Letzter Kauf']);
    var zeilen = [kopf.map(esc).join(';')];
    l.forEach(function (k) {
      zeilen.push(FELDER.map(function (f) { return esc(k[f[0]]); })
        .concat([esc((k.fahrzeuge || []).map(fzText).join(' | ')), esc(letzterKauf(k) ? EG.fmtDatum(letzterKauf(k)) : '')]).join(';'));
    });
    var blob = new Blob(['﻿' + zeilen.join('\r\n')], { type: 'text/csv;charset=utf-8' });
    var a = h('a', { href: URL.createObjectURL(blob), download: 'Kunden_' + EG.heute() + '.csv' });
    document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  }

  /* ---------------------------------------------------------------- Detail */
  async function detail(id) {
    var k = S.daten.filter(function (d) { return d.id === id; })[0];
    if (!k) return;
    var inhalt = h('div', { class: 'fz-detail' });
    function aufbauen(k) {
      inhalt.innerHTML = '';
      var darf = k.darf_aendern || [];
      if (k.pruefen_hinweis) inhalt.appendChild(EG.banner([h('strong', { text: 'Bitte prüfen: ' }), t(k.pruefen_hinweis)], 'warn'));
      var dl = h('dl', { class: 'fz-dl' });
      FELDER.forEach(function (f) {
        var v = t(k[f[0]]);
        var anzeige;
        if (v && (f[0] === 'telefon' || f[0] === 'telefon2')) anzeige = h('a', { href: telLink(v), text: v });
        else if (v && f[0] === 'email') anzeige = h('a', { href: 'mailto:' + v, text: v });
        else anzeige = h('span', { text: v || '–', class: v ? '' : 'muted' });
        var dd = h('dd', {}, anzeige);
        if (darf.indexOf(f[0]) >= 0) {
          dd.appendChild(h('button', { type: 'button', class: 'fz-edit', 'aria-label': f[1] + ' ändern', title: 'ändern', text: '✎',
            onclick: function () { feldAendern(k, f[0]).then(function (neu) { if (neu) aufbauen(neu); }).catch(EG.fehler); } }));
        }
        var hinweis = NUR_APP[f[0]] ? 'nur in der App' : (f[0] === 'ort' && darf.length ? 'ändern nur in der Masterliste' : '');
        dl.appendChild(h('div', { class: 'fz-paar' + (f[0] === 'notiz' ? ' kd-breit' : '') },
          h('dt', {}, f[1], hinweis ? h('span', { class: 'kd-hinweis', text: ' · ' + hinweis }) : null), dd));
      });
      inhalt.appendChild(h('details', { class: 'fz-abschnitt', open: true }, h('summary', { text: 'Kontaktdaten' }), dl));

      var fz = k.fahrzeuge || [];
      var liste = fz.length ? h('ul', { class: 'kd-fz' }, fz.map(function (f) {
        var teile = [f.fin ? 'FIN ' + f.fin : '', f.kaufvertrag_datum ? 'Kaufvertrag ' + EG.fmtDatum(String(f.kaufvertrag_datum).slice(0, 10)) : '',
          f.verkaeufer ? 'Verkäufer ' + f.verkaeufer : '', f.fahrzeugstatus ? 'Status ' + f.fahrzeugstatus : '', f.phase ? 'Phase ' + f.phase : ''].filter(Boolean);
        return h('li', {}, h('strong', { text: fzText(f) }), h('div', { class: 'klein muted', text: teile.join(' · ') || '–' }));
      })) : h('p', { class: 'klein muted', text: 'Keine Fahrzeugakte zu diesem Kunden.' });
      inhalt.appendChild(h('details', { class: 'fz-abschnitt', open: true }, h('summary', { text: 'Fahrzeuge (' + fz.length + ')' }), liste));

      if (darf.length && !EG.demo) {
        var verlauf = h('details', { class: 'fz-abschnitt' }, h('summary', { text: 'Änderungsverlauf' }));
        verlauf.addEventListener('toggle', function () { if (verlauf.open && !verlauf.dataset.geladen) { verlauf.dataset.geladen = '1'; verlaufLaden(k, verlauf).catch(EG.fehler); } });
        inhalt.appendChild(verlauf);
      }
      inhalt.appendChild(h('p', { class: 'klein muted', text: darf.length
        ? 'Name, Straße, PLZ, Telefon, E-Mail und KD-Nr. werden in allen Masterliste-Einträgen dieses Kunden geändert.'
        : 'Nur lesen – Kundendaten ändern admin, Dispo und Buchhaltung.' }));
    }
    aufbauen(k);
    await EG.dialog({ titel: k.name || 'Kunde', inhalt: inhalt, breit: true, knoepfe: [{ text: 'Schließen', art: 'ghost', wert: null }] });
  }

  async function verlaufLaden(k, box) {
    var r = chk(await EG.tab('bestand', 'aenderung_log').select('am,von_name,sp_intern,interne_nr,alt,neu,ergebnis')
      .eq('aktion', 'kunde_aendern').eq('details->>kunde_id', k.id).order('am', { ascending: false }).limit(40));
    var l = r.data || [];
    if (!l.length) { box.appendChild(h('p', { class: 'klein muted', text: 'Noch keine Änderung aus der App.' })); return; }
    var spName = { Title: 'Name', 'Stra_x00df_eNr_x002e_': 'Straße & Nr.', PLZ: 'PLZ', TelfonMobil: 'Telefon', 'E_x002d_Mail': 'E-Mail', Kundennummer: 'KD-Nr.' };
    box.appendChild(h('ul', { class: 'fz-verlauf' }, l.map(function (z) {
      var feld = spName[z.sp_intern] || NAME[String(z.sp_intern || '').replace(/^kunde\./, '')] || z.sp_intern;
      return h('li', { text: EG.fmtZeit(z.am) + ' · ' + (z.von_name || '?') + ' · ' + feld + (z.interne_nr ? ' (Nr. ' + z.interne_nr + ')' : '') + ': „' + (z.alt || '–') + '“ → „' + (z.neu || '–') + '“' +
        (z.ergebnis === 'gesendet' || z.ergebnis === 'gespeichert' ? '' : ' (' + z.ergebnis + ')') });
    })));
  }

  /* ---------------------------------------------------------------- Ändern */
  async function feldAendern(k, feld) {
    var alt = t(k[feld]);
    var el = feld === 'notiz' ? h('textarea', { id: 'kd-ein', rows: 5, value: alt })
      : h('input', { id: 'kd-ein', type: feld === 'email' ? 'email' : (feld === 'telefon' || feld === 'telefon2') ? 'tel' : 'text',
          inputmode: feld === 'plz' || feld === 'repdoc_kdnr' ? 'numeric' : null, value: alt, autocomplete: 'off' });
    var ergebnis = null;
    var ok = await EG.dialog({
      titel: NAME[feld] + ' ändern',
      inhalt: [EG.feld(NAME[feld], el, 'Aktuell: ' + (alt || '–')),
        h('p', { class: 'klein muted', text: NUR_APP[feld] ? 'Wird nur in der App gespeichert.'
          : 'Die Änderung geht in alle Masterliste-Einträge dieses Kunden (' + (k.fahrzeuge || []).length + ') und ist in wenigen Sekunden in der App.' })],
      knoepfe: [{ text: 'Abbrechen', art: 'ghost', wert: null }, {
        text: 'Speichern', art: 'primary', wert: 'ok',
        aktion: async function () {
          var neu = el.value.trim();
          if (neu === alt) return 'Keine Änderung.';
          if (feld === 'name' && !neu) return 'Der Name darf nicht leer sein.';
          if (EG.demo) { k[feld] = neu; ergebnis = { gesendet: true, demo: true }; return true; }
          var r = await EG.sb.functions.invoke('bestand_schreiben', { body: { aktion: 'kunde_aendern', kunde_id: k.id, feld: feld, wert: neu } });
          if (r.error) return await fehlerText(r.error);
          ergebnis = r.data; return true;
        }
      }]
    });
    if (ok !== 'ok' || !ergebnis) return null;
    if (ergebnis.modus === 'probe') { EG.toast('Probe: Die Änderung wurde geprüft, aber noch NICHT gespeichert (Schreiben ist noch aus).'); return null; }
    if (EG.demo) { EG.toast('Demo: geändert (nur auf dieser Seite).', 'ok'); tabelleNeu(); return k; }
    if (ergebnis.app_feld) EG.toast('Gespeichert.', 'ok');
    else {
      var teil = ergebnis.von > 1 ? ' (' + ergebnis.anzahl + ' von ' + ergebnis.von + ' Masterliste-Einträgen)' : '';
      EG.toast('Gespeichert' + teil + '. Die App aktualisiert in wenigen Sekunden.', ergebnis.anzahl === ergebnis.von ? 'ok' : undefined);
      await warte(6000);
    }
    var n = chk(await EG.sb.schema('crm').rpc('kunden_lesen', { p_id: k.id })).data || [];
    if (n[0]) { S.daten = S.daten.map(function (d) { return d.id === k.id ? n[0] : d; }); tabelleNeu(); return n[0]; }
    return k;
  }
  function warte(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  async function fehlerText(err) {
    try { var x = await err.context.json(); return x.text || x.fehler || err.message; } catch (e) { return (err && err.message) || String(err); }
  }

  /* ====================================================================
     DEMO (nur ?demo=1): erfundene Kunden, Rechte wie in der Datenbank nachgebildet
     ==================================================================== */
  var demoDaten = null;
  function demoKunden() {
    var darf = ['admin', 'dispo', 'buchhaltung'].indexOf(EG.rolle) >= 0 ? ['name', 'strasse', 'plz', 'telefon', 'email', 'repdoc_kdnr', 'firma', 'telefon2', 'notiz'] : [];
    if (!demoDaten) {
      var d = function (n) { var x = new Date(); x.setDate(x.getDate() + n); return EG.isoDatum(x); };
      demoDaten = [
        { id: '00000000-0000-4000-8000-000000000001', name: 'Erika Musterfrau', firma: null, strasse: 'Beispielweg 1', plz: '70000', ort: 'Demostadt', telefon: '0170 0000001', telefon2: null, email: 'erika@example.com', repdoc_kdnr: '10001', notiz: 'Demo-Kundin, nicht echt',
          fahrzeuge: [{ stieber_id: 'ST-26-9003', interne_nr: '90003', hersteller: 'Opel', modell: 'Mokka Demo', kaufvertrag_datum: d(-30), verkaeufer: 'NP', fahrzeugstatus: 'ausgeliefert' }] },
        { id: '00000000-0000-4000-8000-000000000002', name: 'Max Mustermann', firma: 'Muster GmbH (Demo)', strasse: 'Probestraße 22', plz: '71000', ort: 'Testhausen', telefon: '0171 0000002', telefon2: '0711 000000', email: 'max@example.com', repdoc_kdnr: null, notiz: null,
          fahrzeuge: [{ stieber_id: 'ST-26-9004', interne_nr: '90004', hersteller: 'Nissan', modell: 'Qashqai Demo', kaufvertrag_datum: d(-2), verkaeufer: 'AI', fahrzeugstatus: 'im Haus' },
                      { stieber_id: 'ST-25-8001', interne_nr: '80001', hersteller: 'Kia', modell: 'Ceed Demo', kaufvertrag_datum: d(-400), verkaeufer: 'OS', fahrzeugstatus: 'ausgeliefert' }] },
        { id: '00000000-0000-4000-8000-000000000003', name: 'Beispiel Kunde', firma: null, strasse: null, plz: null, ort: null, telefon: null, telefon2: null, email: 'kunde@example.com', repdoc_kdnr: null, notiz: null,
          pruefen_hinweis: 'Demo: gleiche Telefonnummer wie ein anderer Eintrag', fahrzeuge: [] }
      ];
    }
    return demoDaten.map(function (k) { return Object.assign(k, { darf_aendern: darf }); });
  }
})();
