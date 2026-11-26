/* Stieber-App – „Auftragsbestätigung an den Kunden“ in der Verkaufsakte (window.VK_AB), Version 1.1, Stand 26.11.2026
   v1.1 (26.11.2026, Oli „Ja, umbauen“): OHNE PDF und OHNE Autrado-Sitzung. Rechtlich verlangen die Verkaufsbedingungen für die Annahme keine Form –
   die Mail selbst ist die Auftragsbestätigung („Hiermit nehmen wir Ihre Bestellung … verbindlich an“). Prüfung über die Autrado-REST-Schnittstelle.
   Plan: 08b Fahrzeug-Verkauft/Lieferanten-AB-Eingang/2026-11-26_Plan-AB-an-Kunde-in-der-App_v2.md

   Block unter „Unterlagen“ (eingebunden von verkauf-unterlagen.js: VK_AB.zeichne(box, akte)):
   1. Bindefrist: Der Kunde ist 10 Werktage (Mo–Sa, ohne Feiertage gerechnet) ab Bestelldatum an die Bestellung gebunden – Hinweis, rot kurz vor/nach Ablauf.
   2. „Jetzt prüfen“ → Edge Function ab_holen_pruefen {akte_id, quelle:'knopf'}: Autrado-Job (REST) gegen Akte/Einkauf, liefert auch Liefertermin,
      Fälligkeit, Anzahlung, Verkäufer für die Mail. Automatisch: lieferant_ab_eingang ruft sie nach der Lieferanten-Mail auf (quelle 'automatik').
   3. Ampel der letzten Prüfung (verkauf.ab_pruefung): grün / rot (sperrt die Mail) / gelb (Hinweis, sperrt nicht).
   4. „AB-Mail erstellen“: Vollbild wie die Zahlungseinladung (VK_ZE.ui.overlay), Formular + Live-Vorschau; .eml OHNE Anhang mit den drei Logos,
      Von buchhaltung@, An Kunde, CC Verkäufer, X-Unsent → Outlook classic öffnet sie als Entwurf. Gesperrt bei roter Prüfung (admin: „trotzdem“).
      Vorlage = Skill auftragsbestaetigung-kunde/assets/ab_mail_vorlage.html (VML-Formen für runde Ecken, keine Ausstattung, Schritte 1–7 abwählbar).
   5. „AB an Kunden gesendet“: Masterliste „Auftragsbestätigung Kunde“ (Nr. 125) + „Auftragsbest.Mail in OneDrive“ (Nr. 157) = heute über bestand_schreiben,
      dann Laufzettel-Aufgabe d_ab_kunde erledigen. Punkt 45 wird dadurch grün.
   Die App SENDET NICHTS. Rollen: sehen admin/dispo/buchhaltung/verkauf · handeln admin/dispo/buchhaltung.
   Stabile ids: #ab-holen, #ab-mail, #ab-gesendet, #ab-ampel, #ab-frist */
(function (root) {
  'use strict';

  var F125 = 'Auftragsbest_x00e4_tigungKunde', F157 = 'Auftragsbest_x002e_MailinOneDriv';
  var ABSENDER = 'Buchhaltung <buchhaltung@autohaus-stieber.de>';
  var LOGOS = [['logo_stieber', 'ab-logos/logo_stieber.png'], ['logo_mehrmarken', 'ab-logos/logo_mehrmarken.png'], ['logo_bosch', 'ab-logos/logo_bosch.png']];
  var SEHEN = ['admin', 'dispo', 'buchhaltung', 'verkauf'], HANDELN = ['admin', 'dispo', 'buchhaltung'];
  var SCHRITTE = [
    ['Bereitstellung beim Lieferanten', ' – wir melden uns bei Ihnen, sobald es so weit ist'],
    ['Zahlung des Kaufpreises', ''],
    ['Anlieferung Ihres Fahrzeugs bei uns im Autohaus', ''],
    ['Aufbereitung und technische Durchsicht', ''],
    ['Zulassung des Fahrzeugs', ' – durch Sie selbst oder auf Wunsch gegen gesonderte Berechnung durch uns'],
    ['Vereinbarung eines Abholtermins', ''],
    ['Abholung, Übergabe und ausführliche Einweisung', '']
  ];
  var FAELLIG_STANDARD = 'fällig, sobald das Fahrzeug beim Lieferanten zur Abholung bereitsteht';

  /* ====================================================================
     Reine Funktionen (ohne Browser testbar)
     ==================================================================== */
  function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function euro(n) { return n == null || n === '' || isNaN(Number(n)) ? '' : Number(n).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €'; }
  function datumDe(iso) { if (!iso) return ''; var m = String(iso).match(/^(\d{4})-(\d{2})-(\d{2})/); return m ? m[3] + '.' + m[2] + '.' + m[1] : String(iso); }
  function istFirma(n) { return /\b(gmbh|kg|ag|ug|e\.\s?k\.?|ohg|gbr|se|mbh)\b|^(fa\.?|firma)\s/i.test(String(n || '')); }
  function telLink(t) { var s = String(t || '').replace(/[^\d+]/g, ''); return s.charAt(0) === '0' ? '+49' + s.slice(1) : s; }
  function heute() { var d = new Date(), p = function (n) { return (n < 10 ? '0' : '') + n; }; return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()); }

  /** Vorbelegung aus Akte, Fahrzeug (typ), letzter Prüfung und Verkäufer-Kontakt. */
  function vorbelegung(akte, fz, pruefung, kontakt) {
    akte = akte || {}; fz = fz || {}; kontakt = kontakt || {};
    var lt = ((pruefung && pruefung.felder) || []).filter(function (f) { return f.feld === 'Liefertermin'; })[0];
    var dt = (pruefung && pruefung.daten) || {}, vk = dt.verkaeufer || {};
    var kurz = [akte.hersteller, akte.modell].filter(Boolean).join(' ');
    var fahrzeug = [kurz, fz.typ].filter(Boolean).join(' ');
    var name = String(akte.kunde_name || '').replace(/^(fa\.?|firma)\s+/i, '').trim();
    return {
      AB_NR: akte.bestell_nr || '', BESTELLDATUM: datumDe(akte.kaufvertrag_datum), FAHRZEUG: fahrzeug, MARKE_MODELL_KURZ: kurz, MODELL: akte.modell || '',
      FARBE: dt.farbe || akte.farbe || fz.farbe || '', AUTRADO_NR: akte.autrado_nr || '', LIEFERTERMIN: dt.liefertermin || (lt && lt.ok ? lt.ist : ''),
      KAUFPREIS: euro(akte.vk_preis), ANZAHLUNG_TEXT: dt.anzahlung || 'keine Anzahlung', FAELLIGKEIT: dt.faelligkeit || FAELLIG_STANDARD,
      ANREDE: istFirma(akte.kunde_name) || !name ? 'Sehr geehrte Damen und Herren,' : 'Guten Tag ' + name + ',',
      VERKAEUFER_NAME: vk.name || kontakt.anzeigename || '', VERKAEUFER_TEL: vk.telefon || kontakt.telefon || '', VERKAEUFER_MAIL: vk.email || kontakt.email || '',
      an: akte.kunde_email || dt.kunde_mail || '', cc: vk.email || kontakt.email || '',
      schritte: SCHRITTE.map(function () { return true; })
    };
  }
  /** Bindefrist: Bestelldatum + 10 Werktage (Mo–Sa; Feiertage nicht abgezogen) → 'JJJJ-MM-TT' oder ''. */
  function bindefrist(iso) {
    var m = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})/); if (!m) return '';
    var d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])), n = 0;
    while (n < 10) { d.setUTCDate(d.getUTCDate() + 1); if (d.getUTCDay() !== 0) n++; }
    return d.toISOString().slice(0, 10);
  }
  /** Werktage (Mo–Sa) von heute bis frist; negativ = abgelaufen. */
  function werktageBis(frist, heuteIso) {
    if (!frist) return null;
    var a = new Date(heuteIso + 'T00:00:00Z'), b = new Date(frist + 'T00:00:00Z'), st = a <= b ? 1 : -1, n = 0;
    while (a.getTime() !== b.getTime()) { a.setUTCDate(a.getUTCDate() + st); if (a.getUTCDay() !== 0) n += st; }
    return n;
  }
  function betreff(d) { return 'Ihre Auftragsbestätigung ' + (d.AB_NR || '') + ' – ' + (d.FAHRZEUG || ''); }

  var FT = "font-family:'Plus Jakarta Sans',Segoe UI,Arial,sans-serif;";
  var FD = "font-family:'DM Sans',Segoe UI,Arial,sans-serif;";
  function vmlAuf(w, hgt, fill, rand, arc) {
    return '<!--[if mso]><v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" arcsize="' + arc + '" fillcolor="' + fill + '" ' + (rand ? 'strokecolor="' + rand + '" strokeweight="1px"' : 'stroked="f"') +
      ' style="width:' + w + 'px;height:' + hgt + 'px;v-text-anchor:top;"><v:textbox inset="0,0,0,0" style="mso-fit-shape-to-text:true"><![endif]-->' +
      '<!--[if !mso]><!--><div style="background-color:' + fill + ';' + (rand ? 'border:1px solid ' + rand + ';' : '') + 'border-radius:' + (rand ? 12 : 16) + 'px;"><!--<![endif]-->';
  }
  var VML_ZU = '<!--[if !mso]><!--></div><!--<![endif]--><!--[if mso]></v:textbox></v:roundrect><![endif]-->';
  function kv(k, v, letzte) {
    var pb = letzte ? 14 : 9;
    return '<tr><td width="150" style="width:150px;padding:9px 12px ' + pb + 'px 20px;border-top:1px solid #E3E9F2;font-size:13px;line-height:20px;color:#4A5F78;vertical-align:top;">' + k + '</td>' +
      '<td width="364" style="width:364px;padding:9px 20px ' + pb + 'px 0;border-top:1px solid #E3E9F2;font-size:14px;line-height:20px;color:#1A2333;vertical-align:top;">' + v + '</td></tr>';
  }
  function bank(k, v, letzte, sp) {
    var b = 'border-top:1px solid #E3E9F2;' + (letzte ? 'border-bottom:1px solid #E3E9F2;' : '');
    return '<tr><td width="150" style="width:150px;padding:8px 12px 8px 0;' + b + 'font-size:13px;line-height:20px;color:#4A5F78;vertical-align:top;">' + k + '</td>' +
      '<td width="386" style="width:386px;padding:8px 0;' + b + 'font-size:14px;line-height:20px;color:#1A2333;vertical-align:top;' + (sp ? 'letter-spacing:0.3px;' : '') + '">' + v + '</td></tr>';
  }
  function titel(t) { return '<tr><td colspan="2" style="padding:0 0 8px 0;' + FT + 'font-size:17px;line-height:22px;font-weight:700;color:#0A5CD0;">' + t + '</td></tr>'; }

  /** Mail-Körper (Vorlage des Skills). logo(cid) → src der Logos (cid:… in der .eml, Datei-URL in der Vorschau). */
  function baueHtml(d, logo) {
    var e = function (k) { return esc(d[k]); };
    var li = SCHRITTE.map(function (s, i) {
      if (d.schritte && d.schritte[i] === false) return '';
      return '<li style="margin:0 0 8px 0;padding-left:6px;color:#007BFF;font-weight:700;"><span style="color:#1A2333;font-weight:700;">' + esc(s[0]) + '</span>' +
        (s[1] ? '<span style="color:#4A5F78;font-weight:400;">' + esc(s[1]) + '</span>' : '') + '</li>';
    }).join('');
    var weiss = 'background-color:#FFFFFF;';
    var koerper =
      '<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;max-width:100%;border-collapse:separate;border-spacing:0;' + FD + 'color:#1A2333;">' +
      '<tr><td style="padding:0;">' + vmlAuf(600, 128, '#007BFF', null, '10%') +
      '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;"><tr><td style="padding:24px 32px 0 32px;' + FT + 'font-size:12px;line-height:16px;font-weight:700;color:#FFFFFF;letter-spacing:1.5px;">AUFTRAGSBESTÄTIGUNG ' + e('AB_NR') + '</td></tr>' +
      '<tr><td style="padding:8px 32px 26px 32px;' + FT + 'font-size:24px;line-height:31px;font-weight:800;color:#FFFFFF;">Herzlichen Glückwunsch zu Ihrem neuen ' + e('MARKE_MODELL_KURZ') + '!</td></tr></table>' + VML_ZU + '</td></tr>' +
      '<tr><td style="' + weiss + 'padding:28px 32px 0 32px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">' +
      '<tr><td style="padding:0 0 16px 0;font-size:15px;line-height:24px;color:#1A2333;">' + e('ANREDE') + '</td></tr>' +
      '<tr><td style="padding:0 0 28px 0;font-size:15px;line-height:24px;color:#4A5F78;">wir freuen uns sehr, Ihnen Ihre Fahrzeugbestellung zu bestätigen, und danken Ihnen herzlich für Ihr Vertrauen in das Autohaus Stieber. Hiermit nehmen wir Ihre <b style="color:#1A2333;">Bestellung Nr. ' + e('AB_NR') + '</b>' + (d.BESTELLDATUM ? ' vom ' + e('BESTELLDATUM') : '') + ' über den <b style="color:#1A2333;">' + e('FAHRZEUG') + '</b> verbindlich an.</td></tr></table></td></tr>' +
      '<tr><td style="' + weiss + 'padding:0 32px 0 32px;">' + vmlAuf(536, 236, '#F4F8FD', '#E3E9F2', '6%') +
      '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">' +
      '<tr><td colspan="2" style="padding:16px 20px 10px 20px;' + FT + 'font-size:15px;line-height:20px;font-weight:700;color:#1A2333;">Ihre Bestellung auf einen Blick</td></tr>' +
      kv('Fahrzeug', '<b>' + e('FAHRZEUG') + '</b><br>' + [e('FARBE'), d.AUTRADO_NR ? 'Fahrzeugnr. ' + e('AUTRADO_NR') : ''].filter(Boolean).join(' · ')) +
      kv('Auftrag', '<b>' + e('AB_NR') + '</b>' + (d.BESTELLDATUM ? ' vom ' + e('BESTELLDATUM') : '')) +
      kv('Liefertermin', '<b>voraussichtlich ' + e('LIEFERTERMIN') + '</b> (unverbindlich)') +
      kv('Kaufpreis', '<b>' + e('KAUFPREIS') + '</b> brutto' + (d.ANZAHLUNG_TEXT ? ' · ' + e('ANZAHLUNG_TEXT') : ''), true) +
      '</table>' + VML_ZU + '</td></tr>' +
      '<tr><td style="' + weiss + 'padding:32px 32px 0 32px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">' + titel('Zahlung') +
      '<tr><td colspan="2" style="padding:0 0 14px 0;font-size:15px;line-height:24px;color:#4A5F78;">Wie in Ihrer Bestellung vereinbart, ist der Kaufpreis <b style="color:#1A2333;">' + e('FAELLIGKEIT') + '</b>. Wir informieren Sie rechtzeitig.</td></tr>' +
      bank('Empfänger', 'Autohaus Stieber GmbH · Volksbank Zuffenhausen') + bank('IBAN', '<b>DE51 6009 0300 0407 2620 08</b>', false, true) + bank('BIC', 'GENODES1ZUF', false, true) + bank('Verwendungszweck', '<b>' + e('AB_NR') + '</b>', true) +
      '</table></td></tr>' +
      (li ? '<tr><td style="' + weiss + 'padding:32px 32px 0 32px;"><div style="' + FT + 'font-size:17px;line-height:22px;font-weight:700;color:#0A5CD0;padding-bottom:12px;">So geht es weiter bis zur Übergabe</div>' +
        '<ol style="margin:0 0 0 24px;padding:0;' + FD + 'font-size:15px;line-height:24px;color:#007BFF;font-weight:700;">' + li + '</ol></td></tr>' : '') +
      '<tr><td style="' + weiss + 'padding:20px 32px 0 32px;font-size:15px;line-height:24px;color:#4A5F78;">Wir kümmern uns mit größter Sorgfalt um Ihre Bestellung und sorgen dafür, dass die Übergabe Ihres Fahrzeugs reibungslos und zu Ihrer vollen Zufriedenheit verläuft. Im Übrigen gelten die Vereinbarungen Ihrer unterschriebenen Bestellung und unsere Verkaufsbedingungen.</td></tr>' +
      '<tr><td style="' + weiss + 'padding:28px 32px 0 32px;">' + vmlAuf(536, 146, '#F4F8FD', '#E3E9F2', '6%') +
      '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">' +
      '<tr><td style="padding:16px 20px 4px 20px;' + FT + 'font-size:15px;line-height:20px;font-weight:700;color:#1A2333;">Ihr persönlicher Ansprechpartner</td></tr>' +
      '<tr><td style="padding:0 20px 16px 20px;font-size:14px;line-height:22px;color:#4A5F78;">Haben Sie Fragen oder Wünsche? Wir sind gern für Sie da.<br><b style="color:#1A2333;">' + e('VERKAEUFER_NAME') + '</b> · Verkaufsberater<br>' +
      'Telefon <a href="tel:' + esc(telLink(d.VERKAEUFER_TEL)) + '" style="color:#0A5CD0;text-decoration:none;">' + e('VERKAEUFER_TEL') + '</a> · E-Mail <a href="mailto:' + e('VERKAEUFER_MAIL') + '" style="color:#0A5CD0;text-decoration:none;">' + e('VERKAEUFER_MAIL') + '</a></td></tr>' +
      '</table>' + VML_ZU + '</td></tr>' +
      '<tr><td style="' + weiss + 'padding:28px 32px 30px 32px;font-size:16px;line-height:24px;font-weight:700;color:#1A2333;">Wir freuen uns schon darauf, Ihnen Ihren neuen ' + e('MODELL') + ' zu übergeben!</td></tr>' +
      '</table>';
    return koerper + signatur(logo || function (c) { return 'cid:' + c; });
  }

  function signatur(logo) {
    var F = "font-family:'DM Sans',Arial,Helvetica,sans-serif;";
    var knopf = function (t, url) { return '<td style="background-color:#0A5CD0;border-radius:16px;padding:6px 14px;' + F + 'font-size:12px;"><a href="' + url + '" style="color:#FFFFFF;text-decoration:none;">' + t + '</a></td>'; };
    var z = function (k, v) { return '<tr><td style="color:#5F6B7A;padding-right:10px;">' + k + '</td><td>' + v + '</td></tr>'; };
    return '<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;margin-top:24px;color:#1F2937;">' +
      '<tr><td style="' + F + 'font-size:14px;line-height:20px;padding-bottom:14px;">Mit freundlichen Grüßen / Best regards<br><br>Ihr Autohaus Stieber Team</td></tr>' +
      '<tr><td><table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;"><tr><td style="background-color:#007BFF;width:4px;font-size:0;line-height:0;">&nbsp;</td>' +
      '<td style="padding:2px 0 2px 14px;"><table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;' + F + 'font-size:13px;line-height:20px;">' +
      z('Telefon', '+49 711 80 60 94 29') + z('WhatsApp', '<a href="https://wa.me/4915734941536" style="color:#1F2937;text-decoration:none;">+49 1573 49 41 536</a>') +
      z('E-Mail', '<a href="mailto:buchhaltung@autohaus-stieber.de" style="color:#0A5CD0;text-decoration:none;">buchhaltung@autohaus-stieber.de</a>') +
      z('Web', '<a href="https://www.autohaus-stieber.de" style="color:#0A5CD0;text-decoration:none;">www.autohaus-stieber.de</a>') +
      '</table></td></tr></table></td></tr>' +
      '<tr><td style="padding-top:16px;"><div style="border-top:1px solid #E5E7EB;font-size:0;line-height:0;">&nbsp;</div></td></tr>' +
      '<tr><td style="padding-top:14px;"><table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;"><tr>' +
      '<td style="vertical-align:middle;"><a href="https://www.autohaus-stieber.de"><img src="' + logo('logo_stieber') + '" alt="Autohaus Stieber GmbH" height="40" style="display:block;border:0;height:40px;"></a></td>' +
      '<td style="width:22px;"></td><td style="background-color:#E5E7EB;width:1px;font-size:0;">&nbsp;</td><td style="width:22px;"></td>' +
      '<td style="vertical-align:middle;"><img src="' + logo('logo_mehrmarken') + '" alt="Mehrmarken Center" height="46" style="display:block;border:0;height:46px;"></td><td style="width:14px;"></td>' +
      '<td style="vertical-align:middle;"><a href="https://www.autohaus-stieber.de/bosch-car-service.php"><img src="' + logo('logo_bosch') + '" alt="Bosch Car Service" height="46" style="display:block;border:0;height:46px;"></a></td>' +
      '</tr></table></td></tr>' +
      '<tr><td style="' + F + 'font-size:13px;line-height:20px;padding-top:12px;">Emerholzweg 5 · 70439 Stuttgart<br>Mo – Fr 07:30 – 18:00 Uhr · Sa 09:00 – 13:00 Uhr</td></tr>' +
      '<tr><td style="padding-top:12px;"><table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:separate;"><tr>' +
      knopf('Anfahrt', 'https://www.autohaus-stieber.de/ihr-weg-zu-uns.php') + '<td style="width:8px;"></td>' +
      knopf('Werkstatttermin', 'https://www.zeitmechanik.net/zm3/web/app.php/zbooking2/web-app/v1_0?token=48731Rghj3RN8') + '<td style="width:8px;"></td>' +
      knopf('Termin Fahrzeugverkauf', 'https://www.zeitmechanik.net/zm3/web/app.php/zbooking2/web-app/v1_0?token=48731GGn62grt') +
      '</tr></table></td></tr>' +
      '<tr><td style="' + F + 'font-size:11px;line-height:16px;padding-top:14px;color:#6B7280;">Autohaus Stieber GmbH · Sitz: Stuttgart · Registergericht: Amtsgericht Stuttgart, HRB 8987 · USt-IdNr. DE147829743 · Geschäftsführer: Oliver Stieber<br>' +
      '<a href="https://www.autohaus-stieber.de/agb.php" style="color:#6B7280;">AGB</a> | <a href="https://www.autohaus-stieber.de/datenschutz.php" style="color:#6B7280;">Datenschutz</a></td></tr></table>';
  }

  /** Fehlende Pflichtwerte → Liste der Feldnamen. */
  function fehlt(d) {
    var p = [['AB_NR', 'AB-Nr.'], ['FAHRZEUG', 'Fahrzeug'], ['MODELL', 'Modell'], ['LIEFERTERMIN', 'Liefertermin'], ['KAUFPREIS', 'Kaufpreis'], ['FAELLIGKEIT', 'Fälligkeit'], ['ANREDE', 'Anrede'],
      ['VERKAEUFER_NAME', 'Verkäufer'], ['VERKAEUFER_TEL', 'Telefon Verkäufer'], ['VERKAEUFER_MAIL', 'E-Mail Verkäufer'], ['an', 'Empfänger']];
    return p.filter(function (x) { return !String(d[x[0]] || '').trim(); }).map(function (x) { return x[1]; });
  }

  /* ---------- .eml (multipart/mixed → related(alternative + Logos) + PDF) ---------- */
  function b64Utf8(s) { var b = unescape(encodeURIComponent(String(s == null ? '' : s))); return typeof btoa === 'function' ? btoa(b) : Buffer.from(b, 'binary').toString('base64'); }
  function b64Bytes(u8) {
    if (typeof btoa !== 'function') return Buffer.from(u8).toString('base64');
    var s = ''; for (var i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
    return btoa(s);
  }
  function z76(s) { return String(s).replace(/(.{76})/g, '$1\r\n'); }
  function kopfWort(s) { return /^[\x20-\x7E]*$/.test(String(s)) ? String(s) : '=?UTF-8?B?' + b64Utf8(s) + '?='; }
  function adr(s) { return String(s || '').split(/[,;]/).map(function (x) { return x.replace(/[\r\n<>"\s]/g, ''); }).filter(Boolean).join(', '); }
  /** o: { d, pdf: Uint8Array, pdfName, logos: { cid: Uint8Array } } → Text der .eml */
  function baueEml(o) {
    var d = o.d, t = Date.now().toString(36), M = '----=_AB_M' + t, R = '----=_AB_R' + t, A = '----=_AB_A' + t;
    var html = '<!DOCTYPE html><html xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office"><head><meta http-equiv="Content-Type" content="text/html; charset=utf-8">' +
      '<!--[if mso]><style>v\\:* {behavior:url(#default#VML);} o\\:* {behavior:url(#default#VML);}</style><![endif]--></head>' +
      '<body style="margin:0;padding:16px;background-color:#FFFFFF;">' + baueHtml(d) + '</body></html>';
    var text = (d.ANREDE || '') + '\r\n\r\nhiermit nehmen wir Ihre Bestellung Nr. ' + (d.AB_NR || '') + (d.BESTELLDATUM ? ' vom ' + d.BESTELLDATUM : '') + ' über den ' + (d.FAHRZEUG || '') + ' verbindlich an.\r\n\r\nMit freundlichen Grüßen\r\nIhr Autohaus Stieber Team';
    var cc = adr(d.cc), z = [
      'MIME-Version: 1.0', 'X-Unsent: 1', 'From: ' + ABSENDER, 'To: ' + adr(d.an), cc ? 'Cc: ' + cc : null,
      'Subject: ' + kopfWort(String(d.betreff || betreff(d)).replace(/[\r\n]+/g, ' ')),
      'Content-Type: multipart/mixed; boundary="' + M + '"', '',
      '--' + M, 'Content-Type: multipart/related; type="multipart/alternative"; boundary="' + R + '"', '',
      '--' + R, 'Content-Type: multipart/alternative; boundary="' + A + '"', '',
      '--' + A, 'Content-Type: text/plain; charset="utf-8"', 'Content-Transfer-Encoding: base64', '', z76(b64Utf8(text)), '',
      '--' + A, 'Content-Type: text/html; charset="utf-8"', 'Content-Transfer-Encoding: base64', '', z76(b64Utf8(html)), '',
      '--' + A + '--', ''
    ];
    Object.keys(o.logos || {}).forEach(function (cid) {
      z.push('--' + R, 'Content-Type: image/png; name="' + cid + '.png"', 'Content-Transfer-Encoding: base64', 'Content-ID: <' + cid + '>',
        'Content-Disposition: inline; filename="' + cid + '.png"', '', z76(b64Bytes(o.logos[cid])), '');
    });
    z.push('--' + R + '--', '');
    if (o.pdf) {
      var n = String(o.pdfName || 'Auftragsbestaetigung.pdf').replace(/["\r\n]/g, '');
      z.push('--' + M, 'Content-Type: application/pdf; name="' + n + '"', 'Content-Transfer-Encoding: base64', 'Content-Disposition: attachment; filename="' + n + '"', '', z76(b64Bytes(o.pdf)), '');
    }
    z.push('--' + M + '--', '');
    return z.filter(function (x) { return x !== null; }).join('\r\n');
  }

  var API = { version: '1.1', bindefrist: bindefrist, werktageBis: werktageBis, SCHRITTE: SCHRITTE, F125: F125, F157: F157, vorbelegung: vorbelegung, betreff: betreff, baueHtml: baueHtml, baueEml: baueEml, fehlt: fehlt, istFirma: istFirma, telLink: telLink, datumDe: datumDe };

  /* ====================================================================
     Oberfläche (nur im Browser mit window.EG)
     ==================================================================== */
  var CSS = [
    '#ab-kunde .ab-kopf{display:flex;flex-wrap:wrap;align-items:center;gap:8px 12px;margin:0 0 8px}',
    '#ab-kunde .ab-kopf h3{margin:0;font-size:17px}',
    '#ab-kunde .ab-knoepfe{display:flex;flex-wrap:wrap;gap:8px;margin:10px 0}',
    '#ab-kunde .ab-badge{display:inline-block;padding:2px 10px;border-radius:999px;font-weight:700;font-size:13px}',
    '#ab-kunde .ab-gruen{background:#E6F4EA;color:#1a7f37}#ab-kunde .ab-rot{background:#FDECEA;color:#B42318}#ab-kunde .ab-grau{background:#EEF1F5;color:#4A5F78}',
    '#ab-kunde table.ab-ampel{border-collapse:collapse;width:100%;font-size:14px;margin:6px 0}',
    '#ab-kunde table.ab-ampel td,#ab-kunde table.ab-ampel th{padding:6px 8px;border-top:1px solid var(--border,#d5dbe5);text-align:left;vertical-align:top}',
    '#ab-kunde .ab-scroll{overflow-x:auto}',
    '.ab-schritt{display:flex;gap:8px;align-items:flex-start;margin:4px 0}.ab-schritt.aus span{opacity:.5;text-decoration:line-through}'
  ].join('\n');
  function stil() { if (root.document.getElementById('ab-stil')) return; var s = root.document.createElement('style'); s.id = 'ab-stil'; s.textContent = CSS; root.document.head.appendChild(s); }

  function EGx() { return root.EG; }
  function darf(l) { return l.indexOf(EGx().rolle) >= 0; }
  async function invoke(name, body) {
    var EG = EGx();
    var r = await EG.sb.functions.invoke(name, { body: body });
    if (r.error) { var t; try { var j = await r.error.context.json(); t = j.fehler || j.text; } catch (e) { /* egal */ } throw new Error(t || r.error.message); }
    return r.data;
  }

  async function letztePruefung(akteId) {
    var EG = EGx();
    try {
      var r = await EG.tab('verkauf', 'ab_pruefung').select('*').eq('akte_id', akteId).order('created_at', { ascending: false }).limit(1);
      if (r.error) return { ok: false };
      return { ok: true, p: (r.data || [])[0] || null };
    } catch (e) { return { ok: false }; }
  }
  async function gesendetAm(akteId) {
    try {
      var r = await EGx().tab('verkauf', 'punkt').select('punkt_key,status,wert,erledigt_am').eq('akte_id', akteId).in('punkt_key', ['auftragsbestaetigung_kunde', 'auftragsbest_mail_onedrive']);
      var z = (r.data || []).filter(function (x) { return x.status === 'ok'; })[0];
      return z ? (z.erledigt_am || 'ja') : null;
    } catch (e) { return null; }
  }

  function ergebnisBadge(p) {
    var h = EGx().h;
    if (!p) return h('span', { class: 'ab-badge ab-grau', text: 'noch nicht geprüft' });
    var m = { gruen: ['ab-gruen', 'Prüfung grün'], rot: ['ab-rot', 'Abweichung'], fehler: ['ab-rot', 'Fehler'] }[p.ergebnis] || ['ab-grau', p.ergebnis];
    return h('span', { class: 'ab-badge ' + m[0], text: m[1] });
  }
  function ampel(p) {
    var EG = EGx(), h = EG.h;
    var box = h('div', { id: 'ab-ampel' });
    if (!p) { box.appendChild(h('p', { class: 'du-hinweis', text: 'Noch keine Prüfung. Sie läuft automatisch, sobald die Lieferanten-AB per Mail kommt – oder mit „Jetzt prüfen“.' })); return box; }
    box.appendChild(h('p', { class: 'du-hinweis', text: (EG.fmtZeit ? EG.fmtZeit(p.created_at) : p.created_at) + ' · ' + ({ automatik: 'automatisch nach der Lieferanten-Mail', knopf: 'Knopf', upload: 'mit PDF' }[p.quelle] || p.quelle) + ' · ' + (p.erstellt_von_name || '–') }));
    if (p.hinweis) box.appendChild(h('p', { class: 'du-hinweis', text: p.hinweis }));
    var f = p.felder || [];
    if (f.length) {
      var t = h('table', { class: 'ab-ampel' }, h('tr', {}, h('th', { text: '' }), h('th', { text: 'Prüfpunkt' }), h('th', { text: 'Soll' }), h('th', { text: 'In der AB' })));
      f.forEach(function (x) { t.appendChild(h('tr', {}, h('td', { text: x.ok === false ? '🔴' : x.ok ? '🟢' : '🟡' }), h('td', { text: x.feld }), h('td', { text: x.soll || '' }), h('td', { text: (x.ist || '') + (x.hinweis ? ' (' + x.hinweis + ')' : '') }))); });
      box.appendChild(h('div', { class: 'ab-scroll' }, t));
      box.appendChild(h('p', { class: 'du-hinweis', text: 'Geprüft wird der Autrado-Job gegen die Akte. Ausstattung und Sondervereinbarungen der unterschriebenen Bestellung prüft die App nicht – dafür die Bestellung ansehen. 🟡 = Hinweis, sperrt die Mail nicht.' }));
    }
    return box;
  }

  async function holen(akte, quelle, neu) {
    var EG = EGx();
    EG.toast('Prüfe den Autrado-Job …');
    if (EG.demo) { EG.toast('Demo: Prüfung nur in der echten App.', 'fehler'); return; }
    var r = await invoke('ab_holen_pruefen', { akte_id: akte.id, quelle: quelle });
    EG.toast(r.ergebnis === 'gruen' ? 'Geprüft: alles grün.' : r.ergebnis === 'rot' ? 'Geprüft: Abweichung – bitte ansehen.' : 'Fehler: ' + (r.hinweis || ''), r.ergebnis === 'gruen' ? 'ok' : 'fehler');
    try { root.document.dispatchEvent(new CustomEvent('vk-dokumente-geaendert', { detail: { akteId: akte.id } })); } catch (e) { /* egal */ }
    await neu();
  }

  async function gesendet(akte, neu) {
    var EG = EGx();
    if (!akte.fahrzeug_id && !EG.demo) { EG.toast('Die Akte ist mit keinem Fahrzeug der Masterliste verbunden.', 'fehler'); return; }
    var tag = heute();
    var ja = await EG.bestaetigen('Ist die Auftragsbestätigung an den Kunden gesendet?\n\nDie App trägt dann in der Masterliste „Auftragsbestätigung Kunde“ und „Auftragsbest.Mail in OneDrive“ mit ' + datumDe(tag) + ' ein und schließt die Aufgabe „AB an den Kunden“.', { ja: 'Ja, gesendet', titel: 'AB an Kunden gesendet' });
    if (!ja) return;
    if (EG.demo) { EG.toast('Demo: eingetragen (nur auf dieser Seite).', 'ok'); return; }
    var z = await invoke('bestand_schreiben', { aktion: 'zeile', stieber_id: akte.fahrzeug_id, felder: [F125, F157] });
    var werte = {};
    if (!(z.werte || {})[F125]) werte[F125] = tag;
    if (!(z.werte || {})[F157]) werte[F157] = tag;
    if (Object.keys(werte).length) {
      var r = await invoke('bestand_schreiben', { aktion: 'aendern', stieber_id: akte.fahrzeug_id, stand: z.stand, werte: werte });
      if (r && r.modus === 'probe') { EG.toast('Probe: Masterliste NICHT geschrieben (Schreiben ist aus).', 'fehler'); return; }
    }
    var a = await EG.tab('laufzettel', 'v_meine_aufgaben').select('id,status').eq('interne_nr', akte.interne_nr).eq('aufgabe_key', 'd_ab_kunde');
    var offen = ((a && a.data) || []).filter(function (x) { return x.status !== 'erledigt' && x.status !== 'entfaellt'; });
    for (var i = 0; i < offen.length; i++) {
      var e = await EG.sb.schema('laufzettel').rpc('erledigen', { p_id: offen[i].id, p_name: EG.nutzerName ? EG.nutzerName() : null, p_notiz: 'AB an Kunden gesendet (App)' });
      if (e && e.error) EG.toast('Aufgabe nicht geschlossen: ' + e.error.message, 'fehler');
    }
    EG.toast('Eingetragen. Die Masterliste ist in wenigen Sekunden nachgezogen.', 'ok');
    setTimeout(function () { try { root.document.dispatchEvent(new CustomEvent('vk-dokumente-geaendert', { detail: { akteId: akte.id } })); } catch (x) { /* egal */ } neu(); }, 6000);
  }

  /* ---------- Overlay „AB-Mail erstellen“ ---------- */
  async function mailOeffnen(akte, pruefung) {
    var EG = EGx(), h = EG.h, doc = root.document;
    if (!root.VK_ZE || !root.VK_ZE.ui) { EG.toast('Mail-Baustein fehlt (verkauf-zahlungseinladung.js).', 'fehler'); return; }
    var fz = {};
    if (akte.fahrzeug_id && !EG.demo) { try { var fr = await EG.tab('bestand', 'fahrzeug').select('typ,farbe').eq('stieber_id', akte.fahrzeug_id).maybeSingle(); fz = fr.data || {}; } catch (e) { /* ohne Typ */ } }
    var kontakt = await root.VK_ZE.ladeKontakt(EG, akte);
    var d = vorbelegung(akte, fz, pruefung, kontakt);
    d.betreff = betreff(d);
    var betreffManuell = false;
    var el = {};
    var FELDER = [['ANREDE', 'Anrede (erste Zeile)'], ['AB_NR', 'AB-Nr.'], ['BESTELLDATUM', 'Bestelldatum'], ['FAHRZEUG', 'Fahrzeug'], ['MARKE_MODELL_KURZ', 'Kopfzeile: Marke Modell'],
      ['MODELL', 'Schlusssatz: Modell'], ['FARBE', 'Farbe'], ['AUTRADO_NR', 'Fahrzeugnr.'], ['LIEFERTERMIN', 'Liefertermin (laut Autrado-Job)'], ['KAUFPREIS', 'Kaufpreis brutto'],
      ['ANZAHLUNG_TEXT', 'Anzahlung'], ['FAELLIGKEIT', 'Fälligkeit (… ist der Kaufpreis …)'], ['VERKAEUFER_NAME', 'Verkäufer'], ['VERKAEUFER_TEL', 'Telefon Verkäufer'], ['VERKAEUFER_MAIL', 'E-Mail Verkäufer'],
      ['an', 'An (Kunde)'], ['cc', 'CC (Verkäufer)'], ['betreff', 'Betreff']];
    var vorschau = h('div', { class: 'vk-ze-vorschau', 'aria-label': 'Vorschau der Mail' });
    var warn = h('div', { class: 'banner warn', style: 'display:none' });
    function logoUrl(c) { var x = LOGOS.filter(function (l) { return l[0] === c; })[0]; return x ? x[1] : ''; }
    function aktualisieren() {
      FELDER.forEach(function (f) { d[f[0]] = el[f[0]].value; });
      if (!betreffManuell) { d.betreff = betreff(d); el.betreff.value = d.betreff; }
      var l = fehlt(d);
      warn.textContent = l.length ? 'Noch leer: ' + l.join(', ') : '';
      warn.style.display = l.length ? '' : 'none';
      vorschau.innerHTML = baueHtml(d, logoUrl);
    }
    var form = h('div', { class: 'vk-ze-form' },
      h('div', { class: 'banner info', text: 'Die Mail ist die Auftragsbestätigung (ohne Anhang). Die Datei öffnet sich in Outlook classic als Entwurf von buchhaltung@. Die App sendet nichts.' }),
      h('div', { class: 'banner warn', text: 'Vor dem Senden: Outlook hängt unten evtl. die eigene Signatur an – diese Zeilen löschen, die Mail hat ihre Signatur schon.' }),
      warn);
    var sek = h('section', { class: 'vk-ze-abschn' }, h('h3', { text: 'Inhalt' }));
    FELDER.forEach(function (f) {
      el[f[0]] = h('input', { type: 'text', id: 'ab-f-' + f[0].toLowerCase(), value: d[f[0]] || '', autocomplete: 'off' });
      el[f[0]].addEventListener('input', function () { if (f[0] === 'betreff') betreffManuell = true; aktualisieren(); });
      sek.appendChild(EG.feld(f[1], el[f[0]]));
    });
    form.appendChild(sek);
    var schr = h('section', { class: 'vk-ze-abschn' }, h('h3', { text: 'So geht es weiter (abwählbar, Nummern passen sich an)' }));
    SCHRITTE.forEach(function (s, i) {
      var cb = h('input', { type: 'checkbox', id: 'ab-schritt-' + (i + 1) }); cb.checked = d.schritte[i];
      var z = h('label', { class: 'ab-schritt', for: 'ab-schritt-' + (i + 1) }, cb, h('span', { text: s[0] + s[1] }));
      cb.addEventListener('change', function () { d.schritte[i] = cb.checked; z.className = 'ab-schritt' + (cb.checked ? '' : ' aus'); aktualisieren(); });
      schr.appendChild(z);
    });
    form.appendChild(schr);

    async function erzeugen() {
      aktualisieren();
      var l = fehlt(d);
      if (l.length) { EG.toast('Bitte ausfüllen: ' + l.join(', '), 'fehler'); return; }
      var logos = {};
      for (var i = 0; i < LOGOS.length; i++) {
        try { var r = await fetch(LOGOS[i][1]); if (r.ok) logos[LOGOS[i][0]] = new Uint8Array(await r.arrayBuffer()); } catch (e) { /* ohne Logo */ }
      }
      var eml = baueEml({ d: d, logos: logos });
      var url = URL.createObjectURL(new Blob([eml], { type: 'message/rfc822' }));
      var a = doc.createElement('a'); a.href = url; a.download = 'Auftragsbestaetigung ' + String(d.AB_NR || '').replace(/[^0-9A-Za-z_-]/g, '') + '.eml';
      doc.body.appendChild(a); a.click(); doc.body.removeChild(a);
      setTimeout(function () { URL.revokeObjectURL(url); }, 10000);
      EG.toast('Datei geladen – per Doppelklick in Outlook öffnen, prüfen, senden und die gesendete Mail in den Fahrzeugordner legen. Danach „AB an Kunden gesendet“ drücken.', 'ok');
    }
    var ov = root.VK_ZE.ui.overlay(EG, {
      titel: 'Auftragsbestätigung an den Kunden – Mail erstellen', form: form, vorschau: vorschau,
      knoepfe: [h('button', { type: 'button', class: 'btn btn-primary', id: 'ab-eml', text: 'In Outlook öffnen (.eml)', onclick: function () { erzeugen().catch(EG.fehler); } }),
        h('button', { type: 'button', class: 'btn btn-ghost', text: 'Schließen', onclick: function () { ov.schliessen(); } })]
    });
    aktualisieren();
  }

  /** Zeichnet den Block in box (von verkauf-unterlagen.js). */
  async function zeichne(box, akte) {
    var EG = EGx();
    if (!EG || !box || !akte) return;
    var h = EG.h;
    box.innerHTML = '';
    if (!darf(SEHEN)) return;
    stil();
    async function bauen() {
      var lp = await letztePruefung(akte.id);
      if (!lp.ok && !EG.demo) { box.innerHTML = ''; return; }   // Tabelle noch nicht da → ausblenden
      var p = lp.p, gesendetText = await gesendetAm(akte.id);
      box.innerHTML = '';
      var k = h('div', { id: 'ab-kunde' },
        h('div', { class: 'ab-kopf' }, h('h3', { text: 'Auftragsbestätigung an den Kunden' }), ergebnisBadge(p),
          gesendetText ? h('span', { class: 'ab-badge ab-gruen', text: 'an Kunden gesendet' + (gesendetText !== 'ja' && EG.fmtDatum ? ' am ' + EG.fmtDatum(gesendetText) : '') }) : null));
      var frist = bindefrist(akte.kaufvertrag_datum);
      if (frist && !gesendetText) {
        var rest = werktageBis(frist, heute());
        var knapp = rest != null && rest <= 2;
        k.appendChild(h('p', { id: 'ab-frist', class: 'du-hinweis', style: knapp ? 'color:#B42318;font-weight:700' : '',
          text: (rest < 0 ? 'Bindefrist abgelaufen am ' : 'Kunde an die Bestellung gebunden bis ') + datumDe(frist) + ' (10 Werktage ab Bestellung vom ' + datumDe(akte.kaufvertrag_datum) + ')' +
            (rest >= 0 ? ' – noch ' + rest + ' Werktag' + (rest === 1 ? '' : 'e') : '') + (knapp ? '. Bitte die Bestätigung jetzt senden – notfalls schon vor der Lieferanten-AB.' : '.') }));
      }
      k.appendChild(ampel(p));
      if (darf(HANDELN)) {
        var rot = p && p.ergebnis !== 'gruen';
        var kn = h('div', { class: 'ab-knoepfe' },
          h('button', { type: 'button', class: 'btn btn-ghost btn-klein', id: 'ab-holen', text: 'Jetzt prüfen', onclick: function () { holen(akte, 'knopf', bauen).catch(EG.fehler); } }));
        var mailKn = h('button', { type: 'button', class: 'btn btn-primary btn-klein', id: 'ab-mail', text: 'AB-Mail erstellen', onclick: function () { mailOeffnen(akte, p).catch(EG.fehler); } });
        if (!p || rot) {
          if (EG.rolle === 'admin') mailKn.textContent = 'AB-Mail trotzdem erstellen (admin)';
          else mailKn.disabled = true;
        }
        kn.appendChild(mailKn);
        kn.appendChild(h('button', { type: 'button', class: 'btn btn-ghost btn-klein', id: 'ab-gesendet', text: 'AB an Kunden gesendet', onclick: function () { gesendet(akte, bauen).catch(EG.fehler); } }));
        k.appendChild(kn);
        if (!p || rot) k.appendChild(h('p', { class: 'du-hinweis', text: '„AB-Mail erstellen“ geht erst bei grüner Prüfung. Bei einer Abweichung den Job in Autrado oder die Akte korrigieren und „Jetzt prüfen“ drücken.' }));
      }
      box.appendChild(k);
    }
    await bauen();
  }

  API.zeichne = function (box, akte) { return zeichne(box, akte).catch(function (e) { console.warn('AB an Kunde:', e && e.message); if (box) box.innerHTML = ''; }); };
  API.mailOeffnen = mailOeffnen;

  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  else root.VK_AB = API;
})(typeof window !== 'undefined' ? window : this);
