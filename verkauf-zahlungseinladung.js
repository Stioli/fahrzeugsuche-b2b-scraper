/* Stieber-App – Reiter „Verkauf“: Zahlungseinladung erstellen (window.VK_ZE)
   Stand 10.11.2026. Gehört zu Phase v7 „Zahlung“, Punkt v7.zahlungseinladung (Knopf in eingang-verkauf.js).
   Die App SENDET NICHTS: Sie baut die Mail (HTML + Klartext) mit Live-Vorschau, der Nutzer kopiert sie und fügt sie in Outlook ein.

   Aufbau:
   - Reine Funktionen (ohne Browser, in Node testbar): parseBetrag, fmtEuro, rechne, zerlegeName, briefAnrede, fristText, verwendungszweck,
     schritteAktiv, betreff, baueHtml, baueText, vorbelegung.
   - Oberfläche: VK_ZE.oeffnen(akte, punktMap) – Vollbild-Overlay mit Formular und Vorschau (braucht window.EG aus eingang-core.js).

   Mail-HTML: nur Tabellen, alle Styles inline, Farben als HEX (Outlook Desktop/Web), max. 600 px. */
(function (root) {
  'use strict';

  /* ====================================================================
     Festwerte
     ==================================================================== */
  // ACHTUNG LOGO: Öffentlich erreichbare Logo-Datei auf der Website (geprüft 10.11.2026: HTTP 200, image/jpeg, 59 KB).
  // Fällt die Datei weg, hier die neue absolute https-URL eintragen – ohne gültige URL erscheint in der Mail nur der Alt-Text.
  var LOGO_URL = 'https://www.autohaus-stieber.de/idbilder/logo.jpg';
  var BANK = { inhaber: 'Autohaus Stieber GmbH', bank: 'Volksbank Zuffenhausen', iban: 'DE51 6009 0300 0407 2620 08', bic: 'GENODES1ZUF' };
  var TELEFON = '0711 80 60 94 0';
  var ANSCHRIFT = 'Emerholzweg 5, 70439 Stuttgart';
  var WEB = 'www.autohaus-stieber.de';
  var FUSSZEILE = 'Geschäftsführer Oliver Stieber · HRB Stuttgart 8987';
  var ZE_ROLLEN = ['admin', 'dispo', 'buchhaltung'];   // wer den Knopf sieht

  var C = { blau: '#007BFF', blauDunkel: '#0A5CD0', text: '#1A2333', sub: '#4A5F78', rahmen: '#E3E9F2', hell: '#F4F8FD', weiss: '#FFFFFF' };
  var FONT = "'DM Sans',Arial,Helvetica,sans-serif";
  var FONT_H = "'Plus Jakarta Sans',Arial,sans-serif";

  var SCHRITTE_STANDARD = [
    'Überweisung des Betrags',
    'Eintreffen des Fahrzeugs bei uns',
    'Aufbereitung und technische Durchsicht, ggf. Montage des Zubehörs',
    'Vereinbarung eines Übergabetermins',
    'Übergabe Ihres Fahrzeugs'
  ];

  /* ====================================================================
     Reine Funktionen
     ==================================================================== */
  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  /** '49.282,00' | '1.234,5' | '12.5' | '300' | '300 €' → Zahl · leer → null · ungültig → NaN.
      Komma = Dezimaltrennzeichen. Nur Punkt: bei Tausendergruppen (1.234 / 1.234.567) Tausender, sonst Dezimalpunkt. */
  function parseBetrag(s) {
    if (typeof s === 'number') return isFinite(s) && s >= 0 ? Math.round(s * 100) / 100 : NaN;
    s = String(s == null ? '' : s).replace(/[€\s]/g, '');
    if (!s) return null;
    if (!/^[0-9.,]+$/.test(s)) return NaN;
    if (s.indexOf(',') >= 0) s = s.replace(/\./g, '').replace(',', '.');
    else if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');
    if (!/^\d+(\.\d+)?$/.test(s)) return NaN;
    var n = parseFloat(s);
    return isFinite(n) ? Math.round(n * 100) / 100 : NaN;
  }

  /** Cent (ganze Zahl) → '49.282,00 €' (ohne Intl, damit überall gleich) */
  function fmtCent(c) {
    var neg = c < 0; c = Math.abs(Math.round(c));
    var euro = Math.floor(c / 100), ct = c % 100;
    var es = String(euro).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    return (neg ? '−' : '') + es + ',' + (ct < 10 ? '0' : '') + ct + ' €';
  }
  function fmtEuro(n) { return fmtCent(Math.round(Number(n) * 100)); }
  /** Zahl → Eingabefeld-Text: 15034 → '15.034,00' */
  function fmtFeld(n) { return fmtEuro(n).replace(/ €$/, ''); }

  /** Positionen: [{ aktiv, vz:'+'|'-', text, betrag (Zahl|null) }] → { cent, summe (Euro), zeilen (nur aktive mit Betrag) }
      Rechnet in Cent (keine Rundungsfehler). Aktive Zeilen ohne Betrag zählen nicht. */
  function rechne(positionen) {
    var cent = 0, zeilen = [];
    (positionen || []).forEach(function (p) {
      if (!p || !p.aktiv) return;
      var b = typeof p.betrag === 'number' ? p.betrag : parseBetrag(p.betrag);
      if (b == null || isNaN(b)) return;
      var c = Math.round(b * 100), minus = p.vz === '-' || p.vz === '−';
      cent += minus ? -c : c;
      zeilen.push({ vz: minus ? '-' : '+', text: p.text, cent: c });
    });
    return { cent: cent, summe: cent / 100, zeilen: zeilen };
  }

  var FIRMA_RE = /\b(gmbh|ag|kg|ohg|gbr|ug|e\.?\s?k\.?|mbh|co\.?|se|ltd|inc|gesellschaft|autohaus|handel|vertrieb|service|verwaltung)\b|&/i;
  /** 'Mustermann, Beate' → { vor:'Beate', nach:'Mustermann', firma:false } · 'Muster GmbH' → firma · 'Beate Mustermann' → Vor/Nach über letztes Wort */
  function zerlegeName(kunde) {
    var s = String(kunde == null ? '' : kunde).replace(/\s+/g, ' ').trim();
    if (!s) return { vor: '', nach: '', firma: false };
    if (FIRMA_RE.test(s)) return { vor: '', nach: s, firma: true };
    var i = s.indexOf(',');
    if (i >= 0) return { vor: s.slice(i + 1).trim(), nach: s.slice(0, i).trim(), firma: false };
    var teile = s.split(' ');
    if (teile.length === 1) return { vor: '', nach: s, firma: false };
    return { vor: teile.slice(0, -1).join(' '), nach: teile[teile.length - 1], firma: false };
  }

  /** anrede: 'frau' | 'herr' | 'firma' | 'ohne' */
  function briefAnrede(anrede, vor, nach) {
    vor = String(vor || '').trim(); nach = String(nach || '').trim();
    if (anrede === 'frau') return 'Liebe Frau ' + nach + ',';
    if (anrede === 'herr') return 'Lieber Herr ' + nach + ',';
    if (anrede === 'firma') return 'Sehr geehrte Damen und Herren,';
    return 'Guten Tag ' + [vor, nach].filter(Boolean).join(' ') + ',';
  }

  function datumDe(iso) {
    var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ''));
    return m ? m[3] + '.' + m[2] + '.' + m[1] : String(iso || '');
  }
  /** frist: { art:'tage', tage:3 } | { art:'datum', datum:'2026-11-20' } → Satzteil */
  function fristText(f) {
    f = f || {};
    if (f.art === 'datum') return f.datum ? 'bis zum ' + datumDe(f.datum) : 'zeitnah';
    var t = parseInt(f.tage, 10);
    if (!(t > 0)) return 'zeitnah';
    return t === 1 ? 'innerhalb des nächsten Tages' : 'innerhalb der nächsten ' + t + ' Tage';
  }

  /** Vorschlag Verwendungszweck: '<Nachname> <interne Nr.>' · Firma: erstes Wort des Firmennamens */
  function verwendungszweck(anrede, nach, nr) {
    var n = String(nach || '').trim();
    if (anrede === 'firma') n = n.split(' ')[0] || '';
    return [n, String(nr || '').trim()].filter(Boolean).join(' ');
  }

  /** Schritte [{ aktiv, text }] → nur aktive mit Text, in Reihenfolge (Nummer = Position in dieser Liste) */
  function schritteAktiv(schritte) {
    return (schritte || []).filter(function (s) { return s && s.aktiv && String(s.text || '').trim(); }).map(function (s) { return String(s.text).trim(); });
  }

  function betreff(fahrzeug, nr) {
    var f = String(fahrzeug || '').trim(), n = String(nr || '').trim();
    return 'Zahlungseinladung – Ihr ' + (f || 'Fahrzeug') + (n ? ' (' + n + ')' : '');
  }

  /* ---------- Mail-HTML ---------- */
  function td(style, inhalt, attrs) { return '<td' + (attrs ? ' ' + attrs : '') + ' style="' + style + '">' + inhalt + '</td>'; }
  function tabelle(breite, inhalt, extra) {
    return '<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="' + breite + '" style="width:' + (typeof breite === 'number' ? breite + 'px' : breite) + ';border-collapse:collapse;mso-table-lspace:0pt;mso-table-rspace:0pt;' + (extra || '') + '">' + inhalt + '</table>';
  }
  function absatz(text, extra) {
    return '<p style="margin:0 0 16px 0;font-family:' + FONT + ';font-size:16px;line-height:24px;color:' + C.text + ';' + (extra || '') + '">' + text + '</p>';
  }
  function zwischen(text) {
    return '<p style="margin:0 0 12px 0;font-family:' + FONT_H + ';font-size:18px;line-height:24px;font-weight:700;color:' + C.text + ';">' + text + '</p>';
  }
  /** Einleitung (Text 10.11.2026, Oli): Dank, Glückwunsch, Bitte um Überweisung */
  function einleitung(d) {
    var f = String(d.fahrzeug || '').trim();
    return {
      dank: 'vielen Dank für Ihr Vertrauen! ' + (f ? 'Mit Ihrem ' + f + ' haben Sie sich für ein tolles Fahrzeug entschieden.' : 'Sie haben sich für ein tolles Fahrzeug entschieden.') + ' Herzlichen Glückwunsch dazu!',
      bitte: 'Damit wir Ihr Fahrzeug in Ruhe für Sie vorbereiten können, bitten wir Sie, den unten genannten Betrag ',
      bitteEnde: ' zu überweisen.',
      danach: 'Sobald Ihre Zahlung bei uns eingegangen ist, bereiten wir Ihr Fahrzeug vor und melden uns bei Ihnen, um einen Übergabetermin zu vereinbaren.',
      fragen: 'Haben Sie Fragen? Ich bin jederzeit gerne für Sie da.',
      gruss: 'Herzliche Grüße und bis bald'
    };
  }

  /** d: { anrede, vor, nach, positionen, frist, zweck, schritte, absender:{name,email,tel}, logoUrl? } → HTML-Fragment (äußere Tabelle) */
  function baueHtml(d) {
    var r = rechne(d.positionen), st = schritteAktiv(d.schritte), ab = d.absender || {};
    var logo = d.logoUrl != null ? d.logoUrl : LOGO_URL;
    var ein = einleitung(d);
    var out = '';

    // Betragstabelle
    var zeilen = '';
    r.zeilen.forEach(function (z, i) {
      var vz = z.vz === '-' ? '− ' : (i > 0 ? '+ ' : '');
      zeilen += '<tr>' +
        td('padding:9px 0;border-bottom:1px solid ' + C.rahmen + ';font-family:' + FONT + ';font-size:16px;line-height:22px;color:' + C.text + ';', esc(z.text)) +
        td('padding:9px 0 9px 12px;border-bottom:1px solid ' + C.rahmen + ';font-family:' + FONT + ';font-size:16px;line-height:22px;color:' + C.text + ';text-align:right;white-space:nowrap;', esc(vz + fmtCent(z.cent)), 'align="right"') +
        '</tr>';
    });
    if (!zeilen) zeilen = '<tr>' + td('padding:9px 0;font-family:' + FONT + ';font-size:16px;color:' + C.sub + ';', 'Keine Positionen ausgewählt.', 'colspan="2"') + '</tr>';
    var summeBox = tabelle('100%',
      '<tr>' +
      td('width:4px;background-color:' + C.blau + ';font-size:0;line-height:0;', '&nbsp;', 'width="4" bgcolor="' + C.blau + '"') +
      td('padding:14px 16px;background-color:' + C.hell + ';', tabelle('100%',
        '<tr>' +
        td('font-family:' + FONT_H + ';font-size:17px;line-height:24px;font-weight:700;color:' + C.text + ';vertical-align:middle;', 'Überweisungsbetrag') +
        td('font-family:' + FONT_H + ';font-size:26px;line-height:32px;font-weight:800;color:' + C.blauDunkel + ';text-align:right;white-space:nowrap;vertical-align:middle;', esc(fmtCent(r.cent)), 'align="right"') +
        '</tr>'), 'bgcolor="' + C.hell + '"') +
      '</tr>');

    // Bankkasten
    function bankZeile(k, v, fett) {
      return '<tr>' +
        td('padding:4px 12px 4px 0;font-family:' + FONT + ';font-size:14px;line-height:20px;color:' + C.sub + ';white-space:nowrap;vertical-align:top;', esc(k)) +
        td('padding:4px 0;font-family:' + FONT + ';font-size:16px;line-height:22px;color:' + C.text + ';' + (fett ? 'font-weight:700;' : 'font-weight:500;'), esc(v)) +
        '</tr>';
    }
    var bankKasten = tabelle('100%', '<tr>' + td('padding:14px 16px;border:1px solid ' + C.rahmen + ';border-radius:16px;', tabelle('100%',
      bankZeile('Kontoinhaber', BANK.inhaber) + bankZeile('Bank', BANK.bank) + bankZeile('IBAN', BANK.iban, true) + bankZeile('BIC', BANK.bic) +
      bankZeile('Verwendungszweck', d.zweck || '', true))) + '</tr>');

    // Schritte
    var schrittHtml = '';
    st.forEach(function (t, i) {
      schrittHtml += '<tr>' +
        td('padding:0 12px 12px 0;vertical-align:top;width:36px;', tabelle(36, '<tr>' + td('width:36px;height:36px;background-color:' + C.blau + ';border-radius:18px;text-align:center;vertical-align:middle;font-family:' + FONT_H + ';font-size:19px;line-height:36px;font-weight:700;color:#FFFFFF;', String(i + 1), 'width="36" height="36" bgcolor="' + C.blau + '" align="center"') + '</tr>'), 'width="48"') +
        td('padding:0 0 12px 0;vertical-align:middle;font-family:' + FONT + ';font-size:16px;line-height:24px;color:' + C.text + ';', esc(t)) +
        '</tr>';
    });

    // Signatur
    var sig = '<p style="margin:0;font-family:' + FONT_H + ';font-size:16px;line-height:24px;font-weight:700;color:' + C.text + ';">' + esc(ab.name || '') + '</p>' +
      '<p style="margin:0;font-family:' + FONT + ';font-size:15px;line-height:22px;color:' + C.text + ';">Autohaus Stieber GmbH<br>' + esc(ANSCHRIFT) + '<br>' +
      'Telefon: ' + esc(ab.tel || TELEFON) + '<br>' +
      (ab.email ? 'E-Mail: <a href="mailto:' + esc(ab.email) + '" style="color:' + C.blauDunkel + ';text-decoration:underline;">' + esc(ab.email) + '</a><br>' : '') +
      '<a href="https://' + WEB + '" style="color:' + C.blauDunkel + ';text-decoration:underline;">' + WEB + '</a></p>';

    var inhalt =
      // Logo + Linie
      '<tr>' + td('padding:20px 0 16px 0;text-align:center;background-color:' + C.weiss + ';',
        logo ? '<img src="' + esc(logo) + '" width="400" alt="Autohaus Stieber GmbH" style="display:block;margin:0 auto;width:400px;max-width:100%;height:auto;border:0;outline:none;text-decoration:none;font-family:' + FONT_H + ';font-size:20px;color:' + C.text + ';">' : '', 'align="center"') + '</tr>' +
      '<tr>' + td('height:4px;font-size:0;line-height:0;background-color:' + C.blau + ';', '&nbsp;', 'height="4" bgcolor="' + C.blau + '"') + '</tr>' +
      // Text
      '<tr>' + td('padding:28px 24px 8px 24px;background-color:' + C.weiss + ';',
        absatz(esc(briefAnrede(d.anrede, d.vor, d.nach))) +
        absatz(esc(ein.dank)) +
        absatz(esc(ein.bitte) + '<strong>' + esc(fristText(d.frist)) + '</strong>' + esc(ein.bitteEnde))) + '</tr>' +
      // Schritte (erst der Ablauf, dann die Zahlung – Oli 10.11.2026)
      (st.length ? '<tr>' + td('padding:0 24px 12px 24px;background-color:' + C.weiss + ';',
        zwischen('So geht es weiter') + tabelle('100%', schrittHtml)) + '</tr>' : '') +
      // Beträge
      '<tr>' + td('padding:0 24px 20px 24px;background-color:' + C.weiss + ';', zwischen('Ihre Zahlung') + tabelle('100%', zeilen) + '<div style="height:12px;line-height:12px;font-size:0;">&nbsp;</div>' + summeBox) + '</tr>' +
      // Bank
      '<tr>' + td('padding:0 24px 24px 24px;background-color:' + C.weiss + ';', bankKasten) + '</tr>' +
      // Schluss
      '<tr>' + td('padding:4px 24px 8px 24px;background-color:' + C.weiss + ';',
        absatz(esc(ein.danach)) +
        absatz(esc(ein.fragen)) +
        absatz(esc(ein.gruss))) + '</tr>' +
      // Signatur
      '<tr>' + td('padding:0 24px 24px 24px;background-color:' + C.weiss + ';', sig) + '</tr>' +
      // Fuß
      '<tr>' + td('padding:12px 24px;background-color:' + C.hell + ';border-top:1px solid ' + C.rahmen + ';text-align:center;font-family:' + FONT + ';font-size:12px;line-height:18px;color:' + C.sub + ';', esc(FUSSZEILE), 'align="center" bgcolor="' + C.hell + '"') + '</tr>';

    out = tabelle(600, inhalt, 'max-width:600px;background-color:' + C.weiss + ';margin:0 auto;');
    return out;
  }

  /* ---------- Mail-Klartext ---------- */
  function baueText(d) {
    var r = rechne(d.positionen), st = schritteAktiv(d.schritte), ab = d.absender || {};
    var breite = 0, vzt = [];
    r.zeilen.forEach(function (z, i) { vzt.push(z.vz === '-' ? '− ' : (i > 0 ? '+ ' : '')); });
    var betraege = r.zeilen.map(function (z, i) { return vzt[i] + fmtCent(z.cent); });
    betraege.push(fmtCent(r.cent));
    betraege.forEach(function (b) { if (b.length > breite) breite = b.length; });
    function links(t, b) { var l = t.length, n = Math.max(2, 44 - l); return t + new Array(n + 1).join(' ') + new Array(Math.max(0, breite - b.length) + 1).join(' ') + b; }
    var z = [], ein = einleitung(d);
    z.push(briefAnrede(d.anrede, d.vor, d.nach), '');
    z.push(ein.dank, '');
    z.push(ein.bitte + fristText(d.frist) + ein.bitteEnde, '');
    if (st.length) {
      z.push('So geht es weiter', '');
      st.forEach(function (t, i) { z.push((i + 1) + '. ' + t); });
      z.push('');
    }
    z.push('Ihre Zahlung', '');
    r.zeilen.forEach(function (x, i) { z.push(links(x.text, betraege[i])); });
    z.push(new Array(44 + breite + 3).join('-'));
    z.push(links('Überweisungsbetrag', betraege[betraege.length - 1]), '');
    function kv(k, v) { return k + new Array(Math.max(1, 19 - k.length) + 1).join(' ') + v; }
    z.push(kv('Kontoinhaber:', BANK.inhaber), kv('Bank:', BANK.bank), kv('IBAN:', BANK.iban), kv('BIC:', BANK.bic), kv('Verwendungszweck:', d.zweck || ''), '');
    z.push(ein.danach, '');
    z.push(ein.fragen, '');
    z.push(ein.gruss, '');
    z.push(ab.name || '', 'Autohaus Stieber GmbH', ANSCHRIFT, 'Telefon: ' + (ab.tel || TELEFON));
    if (ab.email) z.push('E-Mail: ' + ab.email);
    z.push(WEB);
    return z.join('\n');
  }

  /* ---------- Vorbelegung aus Akte und Punkt-Werten ---------- */
  function zahl(v) {
    if (v == null || v === '') return null;
    var n = typeof v === 'number' ? v : parseBetrag(v);
    return (n == null || isNaN(n)) ? null : n;
  }
  /** pm: { phase: { punkt_key: Zeile } } – Zeile.wert ist JSON ({ betrag }) */
  function punktBetrag(pm, phase, key) {
    var z = pm && pm[phase] && pm[phase][key], w = z && z.wert;
    if (!w) return null;
    if (typeof w === 'string') { try { w = JSON.parse(w); } catch (e) { return null; } }
    return zahl(w && w.betrag);
  }
  /** → Anfangszustand des Formulars */
  function vorbelegung(akte, pm, nutzer) {
    akte = akte || {}; nutzer = nutzer || {};
    var n = zerlegeName(akte.kunde_name), anrede = n.firma ? 'firma' : 'ohne';
    var preis = zahl(akte.vk_preis); if (!(preis > 0)) preis = punktBetrag(pm, 'v4', 'angebot');
    var zub = punktBetrag(pm, 'v4', 'zugaben'); if (!(zub > 0)) zub = zahl(akte.kd_zusatz_rg);
    function pos(text, vz, b) { return { aktiv: b != null && b > 0, vz: vz, text: text, betrag: b != null ? fmtFeld(b) : '' }; }
    var nr = akte.interne_nr || '';
    return {
      anrede: anrede, vor: n.vor, nach: n.nach,
      fahrzeug: [akte.hersteller, akte.modell].filter(Boolean).join(' '), nr: nr,
      positionen: [
        pos('Fahrzeugpreis', '+', preis),
        pos('Zubehör und Zusatzleistungen', '+', zub),
        pos('Nachlass', '-', punktBetrag(pm, 'v4', 'nachlass')),
        pos('Anzahlung', '-', punktBetrag(pm, 'v5', 'anzahlung')),
        pos('Inzahlungnahme', '-', punktBetrag(pm, 'v4', 'inz_verrechnet')),
        pos('Finanzierung durch die Bank', '-', null)
      ],
      frist: { art: 'tage', tage: 3, datum: '' },
      zweck: verwendungszweck(anrede, n.nach, nr),
      schritte: SCHRITTE_STANDARD.map(function (t) { return { aktiv: true, text: t }; }),
      absender: { name: nutzer.name || '', email: nutzer.email || '', tel: TELEFON },
      empfaenger: akte.kunde_email || '',
      betreff: betreff([akte.hersteller, akte.modell].filter(Boolean).join(' '), nr)
    };
  }

  /* ---------- .eml-Entwurf (Oli 10.11.2026: Mail auf einen Klick mit Empfänger, Betreff und HTML) ----------
     X-Unsent: 1 → Outlook öffnet die Datei als sendebereiten Entwurf (Outlook classic sicher; neues Outlook testen). */
  function b64Utf8(s) {
    var bytes = unescape(encodeURIComponent(String(s == null ? '' : s)));
    return (typeof btoa === 'function') ? btoa(bytes) : Buffer.from(bytes, 'binary').toString('base64');
  }
  function zeilen76(s) { return String(s).replace(/(.{76})/g, '$1\r\n'); }
  function kopfWort(s) { return /^[\x20-\x7E]*$/.test(String(s)) ? String(s) : '=?UTF-8?B?' + b64Utf8(s) + '?='; }
  function baueEml(d) {
    var grenze = '----=_Stieber_ZE_' + Date.now().toString(36);
    var empf = String(d.empfaenger || '').replace(/[\r\n<>,;"]/g, '').trim();
    var html = '<!DOCTYPE html><html lang="de"><head><meta http-equiv="Content-Type" content="text/html; charset=utf-8">' +
      '<meta name="viewport" content="width=device-width, initial-scale=1"><title>' + esc(d.betreff || '') + '</title></head>' +
      '<body style="margin:0;padding:0;background-color:#FFFFFF;">' + baueHtml(d) + '</body></html>';
    return [
      'MIME-Version: 1.0',
      'X-Unsent: 1',
      (empf ? 'To: ' + empf : 'To: '),
      'Subject: ' + kopfWort(String(d.betreff || '').replace(/[\r\n]+/g, ' ')),
      'Content-Type: multipart/alternative; boundary="' + grenze + '"',
      '',
      '--' + grenze,
      'Content-Type: text/plain; charset="utf-8"',
      'Content-Transfer-Encoding: base64',
      '',
      zeilen76(b64Utf8(baueText(d))),
      '',
      '--' + grenze,
      'Content-Type: text/html; charset="utf-8"',
      'Content-Transfer-Encoding: base64',
      '',
      zeilen76(b64Utf8(html)),
      '',
      '--' + grenze + '--',
      ''
    ].join('\r\n');
  }
  function emlDateiname(d) {
    var n = String(d.nach || '').trim().replace(/[^0-9A-Za-zÄÖÜäöüß_-]+/g, '_') || 'Kunde';
    var nr = String(d.nr || '').trim().replace(/[^0-9A-Za-z_-]+/g, '');
    return 'Zahlungseinladung ' + n + (nr ? ' ' + nr : '') + '.eml';
  }

  var API = {
    LOGO_URL: LOGO_URL, BANK: BANK, TELEFON: TELEFON, ROLLEN: ZE_ROLLEN, SCHRITTE_STANDARD: SCHRITTE_STANDARD,
    esc: esc, parseBetrag: parseBetrag, fmtCent: fmtCent, fmtEuro: fmtEuro, fmtFeld: fmtFeld, rechne: rechne, zerlegeName: zerlegeName,
    briefAnrede: briefAnrede, fristText: fristText, verwendungszweck: verwendungszweck, schritteAktiv: schritteAktiv, betreff: betreff,
    baueHtml: baueHtml, baueText: baueText, baueEml: baueEml, emlDateiname: emlDateiname, vorbelegung: vorbelegung, datumDe: datumDe
  };

  /* ====================================================================
     Oberfläche (nur im Browser mit window.EG)
     ==================================================================== */
  API.darfSehen = function (rolle) { return ZE_ROLLEN.indexOf(rolle) >= 0; };

  /** Öffnet das Formular. akte = verkauf.akte-Zeile, pm = Punkt-Map der Akte (S.pm). Gibt nichts zurück. */
  API.oeffnen = function (akte, pm) {
    var EG = root.EG, h = EG && EG.h;
    if (!EG || !root.document) return;
    var doc = root.document;
    var d = vorbelegung(akte, pm, { name: EG.nutzerName ? EG.nutzerName() : '', email: EG.nutzer ? EG.nutzer() : '' });
    var zweckManuell = false, betreffManuell = false;
    var el = {};   // Eingabefelder

    function txt(id, wert, ph, typ) { return h('input', { type: typ || 'text', id: id, value: wert == null ? '' : wert, placeholder: ph || '', autocomplete: 'off' }); }

    /* ---------- Vorschau und Summe ---------- */
    var vorschau = h('div', { class: 'vk-ze-vorschau', 'aria-label': 'Vorschau der Mail' });
    var summeAnz = h('div', { class: 'vk-ze-summe' });
    var betreffAnz = null;
    function sammeln() {
      d.anrede = el.anrede.value; d.vor = el.vor.value; d.nach = el.nach.value;
      d.fahrzeug = el.fahrzeug.value; d.nr = el.nr.value;
      d.frist = { art: el.fristArt.value, tage: el.fristTage.value, datum: el.fristDatum.value };
      d.zweck = el.zweck.value; d.betreff = el.betreff.value; d.empfaenger = el.empf.value.trim();
      d.absender = { name: el.abName.value.trim(), email: el.abMail.value.trim(), tel: el.abTel.value.trim() };
    }
    function aktualisieren() {
      sammeln();
      var r = rechne(d.positionen);
      summeAnz.textContent = 'Überweisungsbetrag: ' + fmtCent(r.cent);
      summeAnz.className = 'vk-ze-summe' + (r.cent <= 0 ? ' warn' : '');
      el.briefAnr.textContent = briefAnrede(d.anrede, d.vor, d.nach);
      vorschau.innerHTML = baueHtml(d);   // alle Nutzereingaben sind in baueHtml escaped
    }
    function nachNameOderNr() {
      sammeln();
      if (!zweckManuell) el.zweck.value = verwendungszweck(d.anrede, d.nach, d.nr);
      if (!betreffManuell) el.betreff.value = betreff(d.fahrzeug, d.nr);
      aktualisieren();
    }

    /* ---------- Felder ---------- */
    el.anrede = h('select', { id: 'vk-ze-anrede' },
      [['frau', 'Frau'], ['herr', 'Herr'], ['firma', 'Firma'], ['ohne', 'ohne Anrede']].map(function (o) { return h('option', { value: o[0], text: o[1] }); }));
    el.anrede.value = d.anrede;
    el.vor = txt('vk-ze-vor', d.vor, 'Vorname'); el.nach = txt('vk-ze-nach', d.nach, 'Nachname');
    el.briefAnr = h('div', { class: 'vk-ze-brief' });
    var nachLabel = h('label', { for: 'vk-ze-nach', text: 'Nachname' }), vorFeld = h('div', { class: 'feld' }, h('label', { for: 'vk-ze-vor', text: 'Vorname' }), el.vor);
    function anredeUmschalten() {
      var firma = el.anrede.value === 'firma';
      nachLabel.textContent = firma ? 'Firmenname' : 'Nachname';
      vorFeld.style.display = firma ? 'none' : '';
    }
    el.anrede.addEventListener('change', function () { anredeUmschalten(); nachNameOderNr(); });
    el.vor.addEventListener('input', nachNameOderNr); el.nach.addEventListener('input', nachNameOderNr);

    el.fahrzeug = txt('vk-ze-fz', d.fahrzeug, 'Hersteller Modell'); el.nr = txt('vk-ze-nr', d.nr, 'z. B. 2808');
    el.fahrzeug.addEventListener('input', nachNameOderNr); el.nr.addEventListener('input', nachNameOderNr);

    /* Positionen */
    var posBox = h('div', { class: 'vk-ze-pos' });
    function zeichnePositionen() {
      posBox.innerHTML = '';
      d.positionen.forEach(function (p, i) {
        var cb = h('input', { type: 'checkbox', checked: !!p.aktiv, 'aria-label': 'Zeile verwenden: ' + p.text });
        var vz = h('select', { 'aria-label': 'Vorzeichen' }, h('option', { value: '+', text: '+' }), h('option', { value: '-', text: '−' }));
        vz.value = p.vz === '-' ? '-' : '+';
        var t = h('input', { type: 'text', value: p.text, 'aria-label': 'Bezeichnung', autocomplete: 'off' });
        var b = h('input', { type: 'text', inputmode: 'decimal', value: p.betrag == null ? '' : p.betrag, placeholder: '0,00', 'aria-label': 'Betrag in Euro', autocomplete: 'off' });
        var zeile = h('div', { class: 'vk-ze-zeile' + (p.aktiv ? '' : ' aus') });
        cb.addEventListener('change', function () { p.aktiv = cb.checked; zeile.className = 'vk-ze-zeile' + (p.aktiv ? '' : ' aus'); aktualisieren(); });
        vz.addEventListener('change', function () { p.vz = vz.value; aktualisieren(); });
        t.addEventListener('input', function () { p.text = t.value; aktualisieren(); });
        b.addEventListener('input', function () {
          p.betrag = b.value;
          var n = parseBetrag(b.value);
          b.className = (n !== null && isNaN(n)) ? 'vk-ze-ungueltig' : '';
          if (n !== null && !isNaN(n) && n > 0 && !p.aktiv) { p.aktiv = true; cb.checked = true; zeile.className = 'vk-ze-zeile'; }
          aktualisieren();
        });
        b.addEventListener('blur', function () { var n = parseBetrag(b.value); if (n !== null && !isNaN(n)) { b.value = fmtFeld(n); p.betrag = b.value; aktualisieren(); } });
        var weg = h('button', { type: 'button', class: 'btn btn-ghost btn-klein vk-ze-weg', 'aria-label': 'Zeile löschen', text: '×', onclick: function () { d.positionen.splice(i, 1); zeichnePositionen(); aktualisieren(); } });
        zeile.appendChild(cb); zeile.appendChild(vz); zeile.appendChild(t); zeile.appendChild(b); zeile.appendChild(weg);
        posBox.appendChild(zeile);
      });
    }
    var posNeu = h('button', { type: 'button', class: 'btn btn-ghost btn-klein', text: '+ Zeile', onclick: function () {
      d.positionen.push({ aktiv: true, vz: '+', text: '', betrag: '' }); zeichnePositionen(); aktualisieren();
      var ts = posBox.querySelectorAll('.vk-ze-zeile input[type=text]'); if (ts.length >= 2) ts[ts.length - 2].focus();
    } });

    /* Frist */
    el.fristArt = h('select', { id: 'vk-ze-fa' }, h('option', { value: 'tage', text: 'innerhalb der nächsten … Tage' }), h('option', { value: 'datum', text: 'bis zum Datum' }));
    el.fristTage = h('input', { type: 'number', id: 'vk-ze-ft', min: '1', max: '60', value: String(d.frist.tage), inputmode: 'numeric', 'aria-label': 'Tage' });
    el.fristDatum = h('input', { type: 'date', id: 'vk-ze-fd', 'aria-label': 'Datum' });
    function fristUmschalten() { var t = el.fristArt.value === 'tage'; el.fristTage.parentNode.style.display = t ? '' : 'none'; el.fristDatum.parentNode.style.display = t ? 'none' : ''; }
    el.fristArt.addEventListener('change', function () { fristUmschalten(); aktualisieren(); });
    el.fristTage.addEventListener('input', aktualisieren); el.fristDatum.addEventListener('input', aktualisieren);

    el.zweck = txt('vk-ze-zweck', d.zweck, 'Nachname Nr.');
    el.zweck.addEventListener('input', function () { zweckManuell = true; aktualisieren(); });

    /* Schritte */
    var schrBox = h('div', { class: 'vk-ze-schritte' });
    d.schritte.forEach(function (s, i) {
      var cb = h('input', { type: 'checkbox', checked: !!s.aktiv, 'aria-label': 'Schritt verwenden' });
      var t = h('input', { type: 'text', value: s.text, 'aria-label': 'Schritt ' + (i + 1), autocomplete: 'off' });
      var z = h('div', { class: 'vk-ze-zeile schritt' + (s.aktiv ? '' : ' aus') });
      cb.addEventListener('change', function () { s.aktiv = cb.checked; z.className = 'vk-ze-zeile schritt' + (s.aktiv ? '' : ' aus'); aktualisieren(); });
      t.addEventListener('input', function () { s.text = t.value; aktualisieren(); });
      z.appendChild(cb); z.appendChild(t); schrBox.appendChild(z);
    });

    el.abName = txt('vk-ze-abn', d.absender.name, 'Vorname Nachname'); el.abMail = txt('vk-ze-abm', d.absender.email, 'name@autohaus-stieber.de', 'email'); el.abTel = txt('vk-ze-abt', d.absender.tel);
    [el.abName, el.abMail, el.abTel].forEach(function (x) { x.addEventListener('input', aktualisieren); });
    el.empf = txt('vk-ze-empf', d.empfaenger, 'E-Mail des Kunden', 'email'); el.empf.addEventListener('input', aktualisieren);
    el.betreff = txt('vk-ze-betreff', d.betreff, 'Betreff');
    el.betreff.addEventListener('input', function () { betreffManuell = true; aktualisieren(); });

    /* ---------- Knöpfe ---------- */
    function pruefen() {
      sammeln();
      var r = rechne(d.positionen);
      if (!r.zeilen.length) { EG.toast('Bitte mindestens eine Position mit Betrag auswählen.', 'fehler'); return null; }
      if (r.cent <= 0) { EG.toast('Der Überweisungsbetrag ist 0 oder negativ – bitte die Positionen prüfen.', 'fehler'); return null; }
      return r;
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
      EG.toast('Datei heruntergeladen – per Doppelklick öffnen, Rechnung anhängen, senden.', 'ok');
    }
    var knOutlook = h('button', { type: 'button', class: 'btn btn-primary', text: 'In Outlook öffnen', onclick: oeffneInOutlook });
    var knMail = h('button', { type: 'button', class: 'btn btn-ghost', text: 'Mail kopieren', onclick: kopiereMail });
    var knBetreff = h('button', { type: 'button', class: 'btn btn-ghost', text: 'Betreff kopieren', onclick: kopiereBetreff });
    var knOeffnen = h('button', { type: 'button', class: 'btn btn-ghost', text: 'Mail öffnen', onclick: function () {
      sammeln();
      if (!d.empfaenger) { EG.toast('Keine E-Mail-Adresse des Kunden eingetragen.', 'fehler'); return; }
      root.location.href = 'mailto:' + encodeURIComponent(d.empfaenger).replace(/%40/g, '@') + '?subject=' + encodeURIComponent(d.betreff);
    } });
    var knZu = h('button', { type: 'button', class: 'btn btn-ghost', text: 'Schließen', onclick: schliessen });

    /* ---------- Aufbau ---------- */
    var abschnitt = function (titel, inhalt) { return h('section', { class: 'vk-ze-abschn' }, h('h3', { text: titel }), inhalt); };
    var form = h('div', { class: 'vk-ze-form' },
      h('div', { class: 'banner info', text: 'Rechnung als PDF in Outlook anhängen. Die App sendet nichts.' }),
      abschnitt('Kunde', h('div', {},
        EG.feld('Anrede', el.anrede),
        h('div', { class: 'feld' }, nachLabel, el.nach), vorFeld,
        h('div', { class: 'vk-ze-brief-box' }, h('span', { class: 'muted klein', text: 'Anrede in der Mail: ' }), el.briefAnr))),
      abschnitt('Fahrzeug', h('div', {}, EG.feld('Fahrzeug (Hersteller Modell)', el.fahrzeug), EG.feld('Interne Nr.', el.nr))),
      abschnitt('Beträge', h('div', {}, h('p', { class: 'muted klein', text: 'Haken = Zeile kommt in die Mail. Beträge mit Komma oder Punkt eingeben.' }), posBox, posNeu, summeAnz)),
      abschnitt('Frist', h('div', {}, EG.feld('Überweisen', el.fristArt), EG.feld('Tage', el.fristTage), EG.feld('Datum', el.fristDatum))),
      abschnitt('Verwendungszweck', EG.feld('Verwendungszweck (auf der Überweisung)', el.zweck)),
      abschnitt('Nächste Schritte', h('div', {}, h('p', { class: 'muted klein', text: 'Nummeriert wird nur, was angehakt ist.' }), schrBox)),
      abschnitt('Absender', h('div', {}, EG.feld('Name', el.abName), EG.feld('E-Mail', el.abMail), EG.feld('Telefon', el.abTel))),
      abschnitt('Versand', h('div', {}, EG.feld('Empfänger (E-Mail)', el.empf), EG.feld('Betreff', el.betreff))));
    var vorKarte = h('div', { class: 'vk-ze-vorkarte' }, h('h3', { text: 'Vorschau' }), vorschau);
    var leiste = h('div', { class: 'vk-ze-leiste' }, knOutlook, knMail, knBetreff, knZu);
    var kopf = h('div', { class: 'vk-ze-kopf' }, h('h2', { text: 'Zahlungseinladung erstellen' }),
      h('button', { type: 'button', class: 'dlg-x', 'aria-label': 'Schließen', text: '×', onclick: schliessen }));
    var ueber = h('div', { class: 'vk-ze-ueber', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Zahlungseinladung erstellen' },
      h('div', { class: 'vk-ze-panel' }, kopf, h('div', { class: 'vk-ze-body' }, form, vorKarte), leiste));

    function taste(e) { if (e.key === 'Escape') { e.stopPropagation(); schliessen(); } }
    function schliessen() {
      doc.removeEventListener('keydown', taste, true);
      if (ueber.parentNode) ueber.parentNode.removeChild(ueber);
      doc.body.classList.remove('vk-ze-offen');
    }
    anredeUmschalten(); fristUmschalten(); zeichnePositionen();
    doc.body.appendChild(ueber);
    doc.body.classList.add('vk-ze-offen');
    doc.addEventListener('keydown', taste, true);
    aktualisieren();
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  else root.VK_ZE = API;
})(typeof window !== 'undefined' ? window : this);
