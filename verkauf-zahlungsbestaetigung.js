/* Stieber-App – Reiter „Verkauf“: Zahlungsbestätigung erstellen (window.VK_ZB, Version 1.0, 10.11.2026)
   Gehört zu Phase v7 „Zahlung“: Knopf an den Punkten v7.anzahlung_da (art 'anzahlung') und v7.restzahlung (art 'komplett'), Haken
   v7.zahlungsbestaetigung („Zahlungsbestätigung an den Kunden gesendet“, freiwillig).
   Die App SENDET NICHTS: Sie baut die Mail (HTML + Klartext + .eml) mit Live-Vorschau, der Nutzer öffnet sie in Outlook.

   Baut auf VK_ZE (verkauf-zahlungseinladung.js, Version 3.0) auf: Rechnen, Formate, Anrede, Name, Mail-Bausteine (VK_ZE.bau), emlAus, Formular-Teile (VK_ZE.ui).
   Aufbau wie VK_ZE:
   - Reine Funktionen (ohne Browser, in Node testbar): erledigtAnzahl, betreff, intro, baueHtml, baueText, baueEml, vorbelegung, pruefe, emlDateiname.
   - Oberfläche: VK_ZB.oeffnen(akte, pm, art[, kontakt]) – Vollbild-Overlay (braucht window.EG und VK_ZE im Browser).

   Datenmodell d: { art:'anzahlung'|'komplett', anrede, vor, nach, fahrzeug, nr, eingang:{ betrag, datum (ISO) },
     positionen:[{aktiv,vz,text,betrag}], zeigeBank, zweck, schritte:[{aktiv,text,erledigt?}],
     ansprechpartner:{name,tel,email}, absender:{name,email,tel}, empfaenger, betreff }

   Mail-HTML: nur Tabellen, alle Styles inline, Farben als HEX (Outlook Desktop/Web), max. 600 px. */
(function (root) {
  'use strict';

  var ZE = root.VK_ZE || (typeof require === 'function' ? require('./verkauf-zahlungseinladung.js') : null);
  if (!ZE) { if (typeof console !== 'undefined') console.error('VK_ZB: verkauf-zahlungseinladung.js fehlt'); return; }
  var B = ZE.bau, C = ZE.C, FONT = ZE.FONT, FONT_H = ZE.FONT_H;
  var esc = ZE.esc, fmtCent = ZE.fmtCent, fmtEuro = ZE.fmtEuro, fmtFeld = ZE.fmtFeld, datumDe = ZE.datumDe, parseBetrag = ZE.parseBetrag, rechne = ZE.rechne;
  var ZB_ROLLEN = ZE.ROLLEN;   // wer den Knopf sieht: wie VK_ZE (admin, dispo, buchhaltung)

  var SCHRITT_ERLEDIGT = 'Zahlung eingegangen';
  var SCHRITTE_STANDARD = [
    SCHRITT_ERLEDIGT,
    'Anlieferung Ihres Fahrzeugs bei uns im Autohaus',
    'Aufbereitung und technische Durchsicht, ggf. Montage des Zubehörs',
    'Zulassung Ihres Fahrzeugs',
    'Vereinbarung eines Abholtermins',
    'Abholung, Übergabe und ausführliche Einweisung'
  ];
  var TEXT_SORGFALT = 'Wir kümmern uns mit größter Sorgfalt um Ihre Bestellung und sorgen dafür, dass die Übergabe Ihres Fahrzeugs reibungslos und zu Ihrer vollen Zufriedenheit verläuft. Sobald Ihr Fahrzeug bereitsteht, melden wir uns bei Ihnen für einen Abholtermin.';
  var TEXT_REST = 'Den Restbetrag überweisen Sie bitte vor der Übergabe.';
  var TEXT_FRAGEN = 'Haben Sie Fragen? Dann wenden Sie sich gerne an Ihren Verkäufer:';
  var TEXT_GRUSS = 'Herzliche Grüße und bis bald';
  var DEMO_KONTAKT = { anzeigename: 'Max Beispiel', email: 'max.beispiel@example.test', telefon: '0711 000000-00' };

  /* ====================================================================
     Reine Funktionen
     ==================================================================== */
  function betreff(fahrzeug, nr) {
    var f = String(fahrzeug || '').trim(), n = String(nr || '').trim();
    return 'Zahlungseingang bestätigt – Ihr ' + (f || 'Fahrzeug') + (n ? ' (' + n + ')' : '');
  }

  /** Eingangsbetrag als Zahl (Euro) oder null */
  function eingangBetrag(d) {
    var b = d && d.eingang ? d.eingang.betrag : null;
    var n = typeof b === 'number' ? b : parseBetrag(b);
    return (n == null || isNaN(n)) ? null : n;
  }

  /** Anzahl der Schritte, die einen Haken statt der Nummer zeigen: 1, wenn der erste AKTIVE Schritt erledigt ist
      (Flag erledigt === true, ohne Flag: Text „Zahlung eingegangen“), sonst 0. */
  function erledigtAnzahl(schritte) {
    var erster = null;
    (schritte || []).some(function (s) { if (s && s.aktiv && String(s.text || '').trim()) { erster = s; return true; } return false; });
    if (!erster) return 0;
    var fl = erster.erledigt;
    return (fl === true || (fl === undefined && String(erster.text).trim() === SCHRITT_ERLEDIGT)) ? 1 : 0;
  }

  /** Einleitungssatz als { html (mit <strong>), text } */
  function intro(d) {
    var b = eingangBetrag(d), betrag = b > 0 ? fmtEuro(b) : '[Betrag]';
    var datum = d.eingang && d.eingang.datum ? datumDe(d.eingang.datum) : '[Datum]';
    var wort = d.art === 'anzahlung' ? 'Anzahlung' : 'Zahlung';
    // „vollständig bezahlt“ nur, wenn der Rest wirklich 0,00 € ist (sonst würde die Vorschau etwas Falsches zeigen)
    var ende = (d.art !== 'anzahlung' && rechne(d.positionen).cent === 0) ? ' Damit ist Ihre Rechnung vollständig bezahlt.' : '';
    return {
      html: 'vielen Dank! Ihre ' + wort + ' über <strong>' + esc(betrag) + '</strong> ist am <strong>' + esc(datum) + '</strong> bei uns eingegangen.' + ende,
      text: 'vielen Dank! Ihre ' + wort + ' über ' + betrag + ' ist am ' + datum + ' bei uns eingegangen.' + ende
    };
  }

  /** Ansprechpartner-Daten bereinigt; ohne Namen → null (Kasten entfällt) */
  function kontaktDaten(ap) {
    ap = ap || {};
    var name = String(ap.name || '').trim();
    if (!name) return null;
    return { name: name, tel: String(ap.tel || '').trim(), email: String(ap.email || '').trim() };
  }
  function zeigtBank(d, r) { return !!d.zeigeBank && r.cent > 0; }

  /** Kasten „Ihr Ansprechpartner“ (Rahmen wie der Bankkasten) */
  function kontaktKasten(k) {
    var inhalt =
      '<p style="margin:0 0 6px 0;font-family:' + FONT_H + ';font-size:17px;line-height:24px;font-weight:700;color:' + C.text + ';">Ihr Ansprechpartner</p>' +
      B.absatz(esc(TEXT_FRAGEN), 'margin:0 0 8px 0;') +
      '<p style="margin:0;font-family:' + FONT_H + ';font-size:16px;line-height:24px;font-weight:700;color:' + C.text + ';">' + esc(k.name) + '</p>' +
      (k.tel || k.email ? '<p style="margin:0;font-family:' + FONT + ';font-size:15px;line-height:22px;color:' + C.text + ';">' +
        (k.tel ? 'Telefon: ' + esc(k.tel) : '') + (k.tel && k.email ? '<br>' : '') +
        (k.email ? 'E-Mail: <a href="mailto:' + esc(k.email) + '" style="color:' + C.blauDunkel + ';text-decoration:underline;">' + esc(k.email) + '</a>' : '') +
        '</p>' : '');
    return B.tabelle('100%', '<tr>' + B.td('padding:14px 16px;border:1px solid ' + C.rahmen + ';border-radius:16px;', inhalt) + '</tr>');
  }

  /** d → HTML-Fragment (äußere 600-px-Tabelle) */
  function baueHtml(d) {
    var r = rechne(d.positionen), st = ZE.schritteAktiv(d.schritte), ab = d.absender || {}, k = kontaktDaten(d.ansprechpartner);
    var logo = d.logoUrl != null ? d.logoUrl : ZE.LOGO_URL;
    var bezahlt = r.cent === 0;
    var zeilen = [
      B.kopfLogo(logo), B.linie(),
      B.zeile('28px 24px 8px 24px', B.absatz(esc(ZE.briefAnrede(d.anrede, d.vor, d.nach))) + B.absatz(intro(d).html)),
      (st.length ? B.zeile('0 24px 12px 24px', B.zwischen('So geht es weiter') + B.schrittListe(st, { erledigt: erledigtAnzahl(d.schritte) })) : ''),
      B.zeile('0 24px 20px 24px', B.zwischen('Ihre Zahlung') + B.betragsTabelle(r) + '<div style="height:12px;line-height:12px;font-size:0;">&nbsp;</div>' +
        B.summenKasten(bezahlt ? 'Vollständig bezahlt' : 'Offener Restbetrag', bezahlt ? fmtCent(0) : fmtCent(r.cent)))
    ];
    if (zeigtBank(d, r)) {
      zeilen.push(B.zeile('0 24px 0 24px', B.absatz(esc(TEXT_REST))));
      zeilen.push(B.zeile('0 24px 24px 24px', B.bankKasten(d.zweck)));
    }
    zeilen.push(B.zeile('4px 24px 8px 24px', B.absatz(esc(TEXT_SORGFALT))));
    if (k) zeilen.push(B.zeile('0 24px 20px 24px', kontaktKasten(k)));
    zeilen.push(B.zeile('4px 24px 8px 24px', B.absatz(esc(TEXT_GRUSS))));
    zeilen.push(B.zeile('0 24px 24px 24px', B.signatur(ab)));
    zeilen.push(B.fuss());
    return B.seite(zeilen);
  }

  /** d → Klartext (gleiche Inhalte wie das HTML) */
  function baueText(d) {
    var r = rechne(d.positionen), st = ZE.schritteAktiv(d.schritte), ab = d.absender || {}, k = kontaktDaten(d.ansprechpartner);
    var erl = erledigtAnzahl(d.schritte), bezahlt = r.cent === 0;
    var breite = 0, vzt = [];
    r.zeilen.forEach(function (z, i) { vzt.push(z.vz === '-' ? '− ' : (i > 0 ? '+ ' : '')); });
    var betraege = r.zeilen.map(function (z, i) { return vzt[i] + fmtCent(z.cent); });
    var summe = bezahlt ? fmtCent(0) : fmtCent(r.cent);
    betraege.push(summe);
    betraege.forEach(function (b) { if (b.length > breite) breite = b.length; });
    function links(t, b) { var n = Math.max(2, 44 - t.length); return t + new Array(n + 1).join(' ') + new Array(Math.max(0, breite - b.length) + 1).join(' ') + b; }
    function kv(a, v) { return a + new Array(Math.max(1, 19 - a.length) + 1).join(' ') + v; }
    var z = [];
    z.push(ZE.briefAnrede(d.anrede, d.vor, d.nach), '');
    z.push(intro(d).text, '');
    if (st.length) {
      z.push('So geht es weiter', '');
      st.forEach(function (t, i) { z.push((i < erl ? '✓' : (i + 1) + '.') + ' ' + t); });
      z.push('');
    }
    z.push('Ihre Zahlung', '');
    r.zeilen.forEach(function (x, i) { z.push(links(x.text, betraege[i])); });
    z.push(new Array(44 + breite + 3).join('-'));
    z.push(links(bezahlt ? 'Vollständig bezahlt' : 'Offener Restbetrag', summe), '');
    if (zeigtBank(d, r)) {
      z.push(TEXT_REST, '');
      z.push(kv('Kontoinhaber:', ZE.BANK.inhaber), kv('Bank:', ZE.BANK.bank), kv('IBAN:', ZE.BANK.iban), kv('BIC:', ZE.BANK.bic), kv('Verwendungszweck:', d.zweck || ''), '');
    }
    z.push(TEXT_SORGFALT, '');
    if (k) {
      z.push('Ihr Ansprechpartner', TEXT_FRAGEN, k.name);
      if (k.tel) z.push('Telefon: ' + k.tel);
      if (k.email) z.push('E-Mail: ' + k.email);
      z.push('');
    }
    z.push(TEXT_GRUSS, '');
    z.push(ab.name || '', 'Autohaus Stieber GmbH', ZE.ANSCHRIFT, 'Telefon: ' + (ab.tel || ZE.TELEFON));
    if (ab.email) z.push('E-Mail: ' + ab.email);
    z.push(ZE.WEB);
    return z.join('\n');
  }

  function baueEml(d) {
    return ZE.emlAus({ html: baueHtml(d), text: baueText(d), betreff: d.betreff, empfaenger: d.empfaenger, grenzePrefix: '----=_Stieber_ZB_' });
  }
  function emlDateiname(d) {
    var n = String(d.nach || '').trim().replace(/[^0-9A-Za-zÄÖÜäöüß_-]+/g, '_') || 'Kunde';
    var nr = String(d.nr || '').trim().replace(/[^0-9A-Za-z_-]+/g, '');
    return 'Zahlungsbestaetigung ' + n + (nr ? ' ' + nr : '') + '.eml';
  }

  /** Prüfung vor Ausgabe → Fehlertext oder null */
  function pruefe(d) {
    var b = eingangBetrag(d);
    if (!(b > 0) || !d.eingang || !/^\d{4}-\d{2}-\d{2}/.test(String(d.eingang.datum || ''))) return 'Bitte Betrag und Datum des Zahlungseingangs eintragen.';
    var r = rechne(d.positionen);
    if (r.cent < 0) return 'Der offene Rest ist negativ – Positionen prüfen.';
    if (d.art === 'komplett' && r.cent !== 0) return 'Bei Komplettzahlung muss der offene Rest 0,00 € sein – Positionen prüfen.';
    return null;
  }

  /* ---------- Vorbelegung aus Akte und Punkt-Werten ---------- */
  function pad2(n) { return (n < 10 ? '0' : '') + n; }
  /** Zeitstempel (ISO mit Zeitzone) → lokales Datum 'JJJJ-MM-TT'; ungültig/leer → heute */
  function lokalIso(ts) {
    var dt = ts ? new Date(ts) : new Date();
    if (isNaN(dt.getTime())) dt = new Date();
    return dt.getFullYear() + '-' + pad2(dt.getMonth() + 1) + '-' + pad2(dt.getDate());
  }
  /** Eingang aus der Punkt-Zeile pm.v7[key]: nur mit Betrag > 0 und nicht „entfällt“. Datum = Zeitstempel der Zeile (erledigt_am, sonst updated_at, created_at), sonst heute. */
  function eingangAus(pm, key) {
    var z = pm && pm.v7 && pm.v7[key];
    if (!z || z.status === 'entfaellt') return null;
    var w = z.wert;
    if (typeof w === 'string') { try { w = JSON.parse(w); } catch (e) { w = null; } }
    var b = w ? parseBetrag(w.betrag) : null;
    if (!(b > 0)) return null;
    return { betrag: b, datum: lokalIso(z.erledigt_am || z.updated_at || z.created_at) };
  }
  function anzahlungText(datum) { return 'Anzahlung vom ' + datumDe(datum); }
  function zahlungText(datum) { return 'Zahlung vom ' + datumDe(datum); }

  /** Positionen und Eingang je Art (auch beim Umschalten der Art im Formular genutzt) → { positionen, eingang } */
  function positionenFuer(base, pm, art) {
    // Gesamtbetrag = Fahrzeugpreis + Zubehör − Nachlass − Inzahlungnahme (Zeilen 0, 1, 2, 4 der Zahlungseinladung; Zeile 3 ist deren Anzahlung)
    var p = base.positionen;
    var gesamt = rechne([p[0], p[1], p[2], p[4]]).cent / 100;
    var anz = eingangAus(pm, 'anzahlung_da'), rest = eingangAus(pm, 'restzahlung');
    var heute = lokalIso();
    var eingang, anzAktiv = false, zahlAktiv = false, zahlQuelle = rest;
    if (art === 'anzahlung') {
      eingang = anz; anzAktiv = !!anz;
    } else {
      if (rest) { eingang = rest; zahlAktiv = true; anzAktiv = !!anz; }
      else if (anz) { eingang = anz; zahlAktiv = true; zahlQuelle = anz; }   // Fallback: nur die Anzahlung ist erfasst
    }
    var anzD = (anz || {}).datum || heute, zahlD = (zahlQuelle || {}).datum || (eingang && eingang.datum) || heute;
    return {
      eingang: eingang ? { betrag: eingang.betrag, datum: eingang.datum } : { betrag: null, datum: heute },
      positionen: [
        { aktiv: gesamt > 0, vz: '+', text: 'Gesamtbetrag', betrag: gesamt > 0 ? fmtFeld(gesamt) : '' },
        { aktiv: anzAktiv, vz: '-', text: anzahlungText(anzD), betrag: anz ? fmtFeld(anz.betrag) : '', auto: 'anzahlung' },
        { aktiv: zahlAktiv, vz: '-', text: zahlungText(zahlD), betrag: zahlQuelle ? fmtFeld(zahlQuelle.betrag) : '', auto: 'zahlung' }
      ]
    };
  }

  /** kontakt: { name | anzeigename, email, telefon | tel } oder leer */
  function kontaktAus(k) {
    k = k || {};
    return { name: k.name || k.anzeigename || '', tel: k.tel || k.telefon || '', email: k.email || '' };
  }

  /** → Anfangszustand des Formulars (siehe Datenmodell oben) */
  function vorbelegung(akte, pm, nutzer, art, kontakt) {
    nutzer = nutzer || {};
    art = art === 'komplett' ? 'komplett' : 'anzahlung';
    var base = ZE.vorbelegung(akte, pm, nutzer);
    var pf = positionenFuer(base, pm, art);
    return {
      art: art,
      anrede: base.anrede, vor: base.vor, nach: base.nach,
      fahrzeug: base.fahrzeug, nr: base.nr,
      eingang: pf.eingang,
      positionen: pf.positionen,
      zeigeBank: art === 'anzahlung',
      zweck: base.zweck,
      schritte: SCHRITTE_STANDARD.map(function (t, i) { var s = { aktiv: true, text: t }; if (i === 0) s.erledigt = true; return s; }),
      ansprechpartner: kontaktAus(kontakt),
      absender: { name: nutzer.name || '', email: nutzer.email || '', tel: ZE.TELEFON },
      empfaenger: (akte && akte.kunde_email) || '',
      betreff: betreff(base.fahrzeug, base.nr)
    };
  }

  var API = {
    SCHRITTE_STANDARD: SCHRITTE_STANDARD, ROLLEN: ZB_ROLLEN, DEMO_KONTAKT: DEMO_KONTAKT,
    betreff: betreff, erledigtAnzahl: erledigtAnzahl, intro: intro, baueHtml: baueHtml, baueText: baueText, baueEml: baueEml,
    emlDateiname: emlDateiname, pruefe: pruefe, vorbelegung: vorbelegung, positionenFuer: positionenFuer, eingangAus: eingangAus,
    kontaktAus: kontaktAus, kontaktKasten: kontaktKasten, anzahlungText: anzahlungText, zahlungText: zahlungText
  };

  /* ====================================================================
     Oberfläche (nur im Browser mit window.EG)
     ==================================================================== */
  API.darfSehen = function (rolle) { return ZB_ROLLEN.indexOf(rolle) >= 0; };

  /** Verkäuferdaten laden → Promise<{anzeigename,email,telefon}|null>. Fehler/kein Treffer/kein Kürzel → null.
      Demo-Modus (EG.demo): feste Platzhalter. Die Datenbankfunktion shared.verkaeufer_kontakt kann noch fehlen – das ist der Normalfall bis zum Einspielen. */
  function ladeKontakt(EG, akte) {
    if (EG.demo) return Promise.resolve(DEMO_KONTAKT);
    var kz = akte && akte.verkaeufer;
    if (!kz || !EG.sb) return Promise.resolve(null);
    try {
      return Promise.resolve(EG.sb.schema('shared').rpc('verkaeufer_kontakt', { p_kuerzel: kz })).then(function (r) {
        if (!r || r.error) return null;
        var z = Array.isArray(r.data) ? r.data[0] : r.data;
        return z && (z.anzeigename || z.email || z.telefon) ? z : null;
      }, function () { return null; });
    } catch (e) { return Promise.resolve(null); }
  }
  API.ladeKontakt = ladeKontakt;

  /** Öffnet das Formular. akte = verkauf.akte-Zeile, pm = Punkt-Map der Akte (S.pm), art = 'anzahlung' | 'komplett', kontakt (optional) = Verkäuferdaten. */
  API.oeffnen = function (akte, pm, art, kontakt) {
    var EG = root.EG, h = EG && EG.h;
    if (!EG || !root.document) return;
    var doc = root.document;
    var nutzer = { name: EG.nutzerName ? EG.nutzerName() : '', email: EG.nutzer ? EG.nutzer() : '' };
    var d = vorbelegung(akte, pm, nutzer, art, kontakt);
    var zweckManuell = false, betreffManuell = false, apManuell = false;
    var el = {};

    function txt(id, wert, ph, typ) { return h('input', { type: typ || 'text', id: id, value: wert == null ? '' : wert, placeholder: ph || '', autocomplete: 'off' }); }

    /* ---------- Vorschau und Summe ---------- */
    var vorschau = h('div', { class: 'vk-ze-vorschau', 'aria-label': 'Vorschau der Mail' });
    var summeAnz = h('div', { class: 'vk-ze-summe' });
    function sammeln() {
      d.art = el.art.value; d.anrede = el.anrede.value; d.vor = el.vor.value; d.nach = el.nach.value;
      d.fahrzeug = el.fahrzeug.value; d.nr = el.nr.value;
      d.eingang = { betrag: el.eBetrag.value, datum: el.eDatum.value };
      d.zeigeBank = el.bank.checked; d.zweck = el.zweck.value; d.betreff = el.betreff.value; d.empfaenger = el.empf.value.trim();
      d.ansprechpartner = { name: el.apName.value.trim(), tel: el.apTel.value.trim(), email: el.apMail.value.trim() };
      d.absender = { name: el.abName.value.trim(), email: el.abMail.value.trim(), tel: el.abTel.value.trim() };
    }
    function aktualisieren() {
      sammeln();
      var r = rechne(d.positionen);
      summeAnz.textContent = r.cent === 0 ? 'Vollständig bezahlt: ' + fmtCent(0) : 'Offener Restbetrag: ' + fmtCent(r.cent);
      summeAnz.className = 'vk-ze-summe' + (r.cent < 0 || (d.art === 'komplett' && r.cent !== 0) ? ' warn' : '');
      el.briefAnr.textContent = ZE.briefAnrede(d.anrede, d.vor, d.nach);
      el.bankBox.style.display = d.zeigeBank ? '' : 'none';
      vorschau.innerHTML = baueHtml(d);   // alle Nutzereingaben sind in baueHtml escaped
    }
    function nachNameOderNr() {
      sammeln();
      if (!zweckManuell) el.zweck.value = ZE.verwendungszweck(d.anrede, d.nach, d.nr);
      if (!betreffManuell) el.betreff.value = betreff(d.fahrzeug, d.nr);
      aktualisieren();
    }

    /* ---------- Felder ---------- */
    el.art = h('select', { id: 'vk-zb-art' }, h('option', { value: 'anzahlung', text: 'Anzahlung eingegangen' }), h('option', { value: 'komplett', text: 'Komplettzahlung eingegangen' }));
    el.art.value = d.art;

    el.anrede = h('select', { id: 'vk-zb-anrede' },
      [['frau', 'Frau'], ['herr', 'Herr'], ['firma', 'Firma'], ['ohne', 'ohne Anrede']].map(function (o) { return h('option', { value: o[0], text: o[1] }); }));
    el.anrede.value = d.anrede;
    el.vor = txt('vk-zb-vor', d.vor, 'Vorname'); el.nach = txt('vk-zb-nach', d.nach, 'Nachname');
    el.briefAnr = h('div', { class: 'vk-ze-brief' });
    var nachLabel = h('label', { for: 'vk-zb-nach', text: 'Nachname' }), vorFeld = h('div', { class: 'feld' }, h('label', { for: 'vk-zb-vor', text: 'Vorname' }), el.vor);
    function anredeUmschalten() {
      var firma = el.anrede.value === 'firma';
      nachLabel.textContent = firma ? 'Firmenname' : 'Nachname';
      vorFeld.style.display = firma ? 'none' : '';
    }
    el.anrede.addEventListener('change', function () { anredeUmschalten(); nachNameOderNr(); });
    el.vor.addEventListener('input', nachNameOderNr); el.nach.addEventListener('input', nachNameOderNr);

    el.fahrzeug = txt('vk-zb-fz', d.fahrzeug, 'Hersteller Modell'); el.nr = txt('vk-zb-nr', d.nr, 'z. B. 2808');
    el.fahrzeug.addEventListener('input', nachNameOderNr); el.nr.addEventListener('input', nachNameOderNr);

    /* Zahlungseingang */
    el.eBetrag = h('input', { type: 'text', id: 'vk-zb-eb', inputmode: 'decimal', value: d.eingang.betrag > 0 ? fmtFeld(d.eingang.betrag) : '', placeholder: '0,00', autocomplete: 'off' });
    el.eDatum = h('input', { type: 'date', id: 'vk-zb-ed', value: d.eingang.datum });

    /* Positionen (Editor aus VK_ZE.ui) */
    var posBox = h('div', { class: 'vk-ze-pos' });
    var posEd = ZE.ui.positionen(h, d.positionen, posBox, function () { aktualisieren(); });
    var posNeu = h('button', { type: 'button', class: 'btn btn-ghost btn-klein', text: '+ Zeile', onclick: posEd.neueZeile });
    /** Eingang (Betrag/Datum) in die zugehörige Position übernehmen: bei Anzahlung die Anzahlungs-Zeile, bei Komplettzahlung die Zahlungs-Zeile */
    function eingangInPosition() {
      sammeln();
      var ziel = d.art === 'anzahlung' ? 'anzahlung' : 'zahlung';
      var n = parseBetrag(el.eBetrag.value);
      d.positionen.forEach(function (p) {
        if (p.auto !== ziel) return;
        if (n != null && !isNaN(n)) { p.betrag = fmtFeld(n); p.aktiv = n > 0; }
        if (!p.textManuell && el.eDatum.value) p.text = (ziel === 'anzahlung' ? anzahlungText : zahlungText)(el.eDatum.value);
      });
      posEd.zeichne(); aktualisieren();
    }
    el.eBetrag.addEventListener('input', eingangInPosition);
    el.eBetrag.addEventListener('blur', function () { var n = parseBetrag(el.eBetrag.value); if (n != null && !isNaN(n)) el.eBetrag.value = fmtFeld(n); });
    el.eDatum.addEventListener('input', eingangInPosition);

    /* Art umschalten: Positionen, Eingang und Bankanzeige neu aus den Punkt-Werten */
    el.art.addEventListener('change', function () {
      var base = ZE.vorbelegung(akte, pm, nutzer), pf = positionenFuer(base, pm, el.art.value);
      d.positionen.splice(0, d.positionen.length); pf.positionen.forEach(function (p) { d.positionen.push(p); });
      el.eBetrag.value = pf.eingang.betrag > 0 ? fmtFeld(pf.eingang.betrag) : ''; el.eDatum.value = pf.eingang.datum;
      el.bank.checked = el.art.value === 'anzahlung';
      posEd.zeichne(); aktualisieren();
    });

    /* Bank */
    el.bank = h('input', { type: 'checkbox', id: 'vk-zb-bank', checked: !!d.zeigeBank });
    el.bank.addEventListener('change', aktualisieren);
    el.zweck = txt('vk-zb-zweck', d.zweck, 'Nachname Nr.');
    el.zweck.addEventListener('input', function () { zweckManuell = true; aktualisieren(); });
    el.bankBox = h('div', {}, EG.feld('Verwendungszweck (auf der Überweisung)', el.zweck));

    /* Schritte */
    var schrBox = h('div', { class: 'vk-ze-schritte' });
    ZE.ui.schritte(h, d.schritte, schrBox, function () { aktualisieren(); });

    /* Ansprechpartner */
    el.apName = txt('vk-zb-apn', d.ansprechpartner.name, 'Vorname Nachname'); el.apTel = txt('vk-zb-apt', d.ansprechpartner.tel, 'Telefon'); el.apMail = txt('vk-zb-apm', d.ansprechpartner.email, 'name@autohaus-stieber.de', 'email');
    [el.apName, el.apTel, el.apMail].forEach(function (x) { x.addEventListener('input', function () { apManuell = true; aktualisieren(); }); });
    var apBanner = h('div', { class: 'banner warn', text: 'Verkäuferdaten fehlen – bitte von Hand eintragen.', style: 'display:none' });

    el.abName = txt('vk-zb-abn', d.absender.name, 'Vorname Nachname'); el.abMail = txt('vk-zb-abm', d.absender.email, 'name@autohaus-stieber.de', 'email'); el.abTel = txt('vk-zb-abt', d.absender.tel);
    [el.abName, el.abMail, el.abTel].forEach(function (x) { x.addEventListener('input', aktualisieren); });
    el.empf = txt('vk-zb-empf', d.empfaenger, 'E-Mail des Kunden', 'email'); el.empf.addEventListener('input', aktualisieren);
    el.betreff = txt('vk-zb-betreff', d.betreff, 'Betreff');
    el.betreff.addEventListener('input', function () { betreffManuell = true; aktualisieren(); });

    /* ---------- Knöpfe ---------- */
    function pruefen() {
      sammeln();
      var f = pruefe(d);
      if (f) { EG.toast(f, 'fehler'); return false; }
      return true;
    }
    function kopiereMail() {
      if (!pruefen()) return;
      EG.kopierenHtml(baueHtml(d), baueText(d)).then(function (ok) {
        EG.toast(ok ? 'Kopiert – jetzt in Outlook einfügen (Strg+V)' : 'Kopieren hat nicht geklappt. Bitte die Vorschau markieren und von Hand kopieren.', ok ? 'ok' : 'fehler');
      });
    }
    function kopiereBetreff() {
      sammeln();
      EG.kopieren(d.betreff).then(function (ok) { EG.toast(ok ? 'Betreff kopiert' : 'Kopieren hat nicht geklappt.', ok ? 'ok' : 'fehler'); });
    }
    function oeffneInOutlook() {
      if (!pruefen()) return;
      if (!d.empfaenger) { EG.toast('Keine E-Mail-Adresse des Kunden eingetragen.', 'fehler'); return; }
      var blob = new Blob([baueEml(d)], { type: 'message/rfc822' });
      var url = URL.createObjectURL(blob);
      var a = doc.createElement('a'); a.href = url; a.download = emlDateiname(d);
      doc.body.appendChild(a); a.click(); doc.body.removeChild(a);
      setTimeout(function () { URL.revokeObjectURL(url); }, 10000);
      EG.toast('Datei heruntergeladen – per Doppelklick öffnen, die von Outlook angehängte Signatur unten löschen, senden.', 'ok');
    }
    var ov = null;
    var knOutlook = h('button', { type: 'button', class: 'btn btn-primary', text: 'In Outlook öffnen', onclick: oeffneInOutlook });
    var knMail = h('button', { type: 'button', class: 'btn btn-ghost', text: 'Mail kopieren', onclick: kopiereMail });
    var knBetreff = h('button', { type: 'button', class: 'btn btn-ghost', text: 'Betreff kopieren', onclick: kopiereBetreff });
    var knZu = h('button', { type: 'button', class: 'btn btn-ghost', text: 'Schließen', onclick: function () { if (ov) ov.schliessen(); } });

    /* ---------- Aufbau ---------- */
    var abschnitt = function (titel, inhalt) { return h('section', { class: 'vk-ze-abschn' }, h('h3', { text: titel }), inhalt); };
    var form = h('div', { class: 'vk-ze-form' },
      h('div', { class: 'banner info', text: 'Die App sendet nichts. Nach dem Senden den Haken ‚Zahlungsbestätigung an den Kunden gesendet‘ setzen.' }),
      h('div', { class: 'banner warn', text: 'Vor dem Senden: Outlook hängt unten automatisch die eigene Signatur an (z. B. „Bitte bearbeiten / beachten“). Diese Zeilen löschen – die Zahlungsbestätigung hat ihre Signatur schon.' }),
      apBanner,
      abschnitt('Art', EG.feld('Was ist eingegangen?', el.art)),
      abschnitt('Kunde', h('div', {},
        EG.feld('Anrede', el.anrede),
        h('div', { class: 'feld' }, nachLabel, el.nach), vorFeld,
        h('div', { class: 'vk-ze-brief-box' }, h('span', { class: 'muted klein', text: 'Anrede in der Mail: ' }), el.briefAnr))),
      abschnitt('Fahrzeug', h('div', {}, EG.feld('Fahrzeug (Hersteller Modell)', el.fahrzeug), EG.feld('Interne Nr.', el.nr))),
      abschnitt('Zahlungseingang', h('div', {}, EG.feld('Eingegangener Betrag in €', el.eBetrag), EG.feld('Eingegangen am', el.eDatum))),
      abschnitt('Beträge', h('div', {}, h('p', { class: 'muted klein', text: 'Haken = Zeile kommt in die Mail. Ergebnis ist der offene Restbetrag. Beträge mit Komma oder Punkt eingeben.' }), posBox, posNeu, summeAnz)),
      abschnitt('Verwendungszweck', h('div', {},
        h('label', { class: 'klein', for: 'vk-zb-bank' }, el.bank, ' Bankdaten in die Mail (nur bei offenem Restbetrag)'), el.bankBox)),
      abschnitt('Nächste Schritte', h('div', {}, h('p', { class: 'muted klein', text: 'Nummeriert wird nur, was angehakt ist. Der erste Schritt „Zahlung eingegangen“ bekommt einen Haken.' }), schrBox)),
      abschnitt('Ansprechpartner (Verkäufer)', h('div', {}, EG.feld('Name', el.apName), EG.feld('Telefon', el.apTel), EG.feld('E-Mail', el.apMail))),
      abschnitt('Absender', h('div', {}, EG.feld('Name', el.abName), EG.feld('E-Mail', el.abMail), EG.feld('Telefon', el.abTel))),
      abschnitt('Versand', h('div', {}, EG.feld('Empfänger (E-Mail)', el.empf), EG.feld('Betreff', el.betreff))));

    anredeUmschalten(); posEd.zeichne();
    ov = ZE.ui.overlay(EG, { titel: 'Zahlungsbestätigung erstellen', form: form, vorschau: vorschau, knoepfe: [knOutlook, knMail, knBetreff, knZu] });
    aktualisieren();

    /* ---------- Verkäuferdaten asynchron laden (nur wenn nicht schon übergeben) ---------- */
    if (!d.ansprechpartner.name) {
      ladeKontakt(EG, akte).then(function (k) {
        if (!k) { apBanner.style.display = ''; return; }
        if (apManuell) return;   // der Nutzer hat schon selbst etwas eingetragen
        var ap = kontaktAus(k);
        el.apName.value = ap.name; el.apTel.value = ap.tel; el.apMail.value = ap.email;
        aktualisieren();
      });
    }
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  else root.VK_ZB = API;
})(typeof window !== 'undefined' ? window : this);
