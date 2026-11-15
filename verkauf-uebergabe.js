/* Stieber-App – Übergabe: Mail mit Foto, Bewertungs- und Umfrage-Link, Reklamation bei Unzufriedenheit (window.VK_UEBERGABE)
   Version 4.5 (VA8, 15.11.2026). Gehört zu Phase p10 „Vorbereitung und Auslieferung“ (Punkte p10.kunde_zufrieden, p10.uebergabe_mail)
   und Phase p11 (Punkt „Reklamation“). Die App SENDET NICHTS: Sie öffnet den bekannten Mail-Dialog (EG.mailMitAnhang),
   der Verkäufer prüft die Mail und sendet sie aus seinem eigenen Postfach.

   Schnittstelle (VA6 baut die Aufrufe in eingang-verkauf.js ein):
     VK_UEBERGABE.mailKnopf(akte, kontext) → HTMLElement (Knopf „Übergabe-Mail öffnen“). Wirft nie.
        akte: Zeile aus verkauf.akte (id, kunde_name, kunde_email, hersteller, modell, verkaeufer, …)
        kontext (alles optional):
          fotoPfade: [..]            Pfade der Übergabefotos (sonst liest der Knopf den Punkt v9.uebergabefotos der Akte)
          verkaeuferName: '..'       Name für Gruß und Signatur (sonst der angemeldete Nutzer, zuletzt das Kürzel der Akte)
          onGesendet: function ()    wird aufgerufen, wenn der Nutzer im Dialog „Gesendet“ bestätigt hat (z. B. um p10.uebergabe_mail abzuhaken)
     VK_UEBERGABE.nachZufriedenheit(akte, wert) → Promise<boolean>. wert 'Nein' → Reklamation in Phase 11 auf NOK mit Grund
        „Kunde bei Übergabe nicht zufrieden“ (true = geändert), 'Ja' → nichts (false). Wirft nie.
     Zusätzlich (für Tests): VK_UEBERGABE.baueMail(daten), VK_UEBERGABE.VORLAGE.

   Umfrage-Link: Funktion verkauf.umfrage_token_anlegen(akte_id) liefert den Einmal-Token (die Rolle verkauf darf die Tabelle nicht lesen).
   Im Demo-Modus (?demo=1) wird ein Zufalls-Token erzeugt, die Mail öffnet sich wie im Echtbetrieb.
   Baut auf window.EG aus eingang-core.js auf. */
(function () {
  'use strict';

  /* ====================================================================
     EINSTELLUNGEN – hier trägt Oli die echten Werte ein
     ==================================================================== */
  // Link zum Google-Bewertungsformular (Google-Unternehmensprofil → „Bewertungen einholen“ → Link kopieren).
  var BEWERTUNGS_LINK = 'https://g.page/r/Cd6PqfC4HrGuEBM/review';   // Google-Unternehmensprofil „Um Rezensionen bitten“, abgelesen und geprüft 15.11.2026
  // Basis-Adresse der Umfrage-Seite (umfrage.html). Der Token wird als ?t=… angehängt.
  var UMFRAGE_URL = 'https://stioli.github.io/fahrzeugsuche-b2b-scraper/umfrage.html';
  // Telefon für die Signatur (wie in der Zahlungseinladung)
  var TELEFON = '0711 80 60 94 0';
  // Text der Reklamation, die bei „Kunde nicht zufrieden“ geöffnet wird
  var GRUND_UNZUFRIEDEN = 'Kunde bei Übergabe nicht zufrieden';

  /* ====================================================================
     Mailvorlage (Text von Oli am 15.11.2026 freigegeben, siehe 2026-11-15_Entwurf-Uebergabe-Mail_v1.md)
     Platzhalter: {{Kundenname}} {{Fahrzeug}} {{Verkäufer}} {{Bewertungslink}} {{Umfrage-Link}} {{Telefon}}
     [[FOTO: …]] = Absatz nur, wenn ein Übergabefoto angehängt wird.
     ==================================================================== */
  var VORLAGE = {
    betreff: 'Vielen Dank für Ihr Vertrauen – Ihr {{Fahrzeug}}',
    text: [
      'Guten Tag{{Anrede}},',
      '',
      'vielen Dank, dass Sie sich für Ihren {{Fahrzeug}} bei uns im Autohaus Stieber entschieden haben. Es war uns eine Freude, Ihnen das Fahrzeug heute zu übergeben. Wir wünschen Ihnen allzeit gute Fahrt!',
      '',
      '[[FOTO: Im Anhang finden Sie ein Foto von der Übergabe als Erinnerung.',
      '',
      ']]Wenn Sie sich einen Moment Zeit nehmen, freuen wir uns über eine Bewertung, so wie Sie uns erlebt haben. Hier geht es direkt dorthin:',
      '{{Bewertungslink}}',
      '',
      'Damit wir noch besser werden, haben wir außerdem eine kurze Umfrage vorbereitet (dauert weniger als eine Minute):',
      '{{Umfrage-Link}}',
      '',
      'Wenn Sie Fragen zu Ihrem Fahrzeug haben, rufen Sie mich einfach an: {{Telefon}}.',
      '',
      'Herzliche Grüße',
      '{{Verkäufer}}',
      'Ihr Team vom Autohaus Stieber'
    ].join('\n')
  };

  var EG = window.EG, h = EG && EG.h;
  var demoTokens = {};   // Demo: ein Token je Akte, damit der Link beim zweiten Öffnen gleich bleibt

  /* ====================================================================
     Reine Funktionen
     ==================================================================== */
  function leer(s) { return s == null || String(s).replace(/\s+/g, '') === ''; }
  function ersetze(text, werte) {
    return text.replace(/\{\{([^}]+)\}\}/g, function (m, k) { return werte[k] != null ? werte[k] : m; });
  }
  /** „Probe, Peter“ → „Peter Probe“; „Peter Probe“ bleibt. Leer → ''. */
  function anzeigeName(n) {
    n = String(n || '').replace(/\s+/g, ' ').trim();
    var i = n.indexOf(',');
    if (i > 0) n = (n.slice(i + 1).trim() + ' ' + n.slice(0, i).trim()).trim();
    return n;
  }
  function fahrzeugText(akte) {
    var t = [akte && akte.hersteller, akte && akte.modell].filter(function (x) { return !leer(x); }).join(' ').trim();
    return t || 'Fahrzeug';
  }
  function umfrageUrl(token, basis) {
    basis = basis || UMFRAGE_URL;
    return basis + (basis.indexOf('?') >= 0 ? '&' : '?') + 't=' + encodeURIComponent(token);
  }
  function istEchterLink(u) { return /^https?:\/\/\S+$/i.test(u || ''); }

  /** daten: { kundenname, fahrzeug, verkaeufer, bewertungslink, umfragelink, mitFoto } → { betreff, text } */
  function baueMail(d) {
    d = d || {};
    var name = anzeigeName(d.kundenname);
    var w = {
      'Anrede': name ? ' ' + name : '',
      'Kundenname': name,
      'Fahrzeug': d.fahrzeug || 'Wagen',   // Ersatz passt grammatisch zu „Ihren …“ / „Ihr …“
      'Verkäufer': d.verkaeufer || 'Ihr Verkaufsberater',
      'Bewertungslink': d.bewertungslink || BEWERTUNGS_LINK,
      'Umfrage-Link': d.umfragelink || '',
      'Telefon': d.telefon || TELEFON
    };
    var text = VORLAGE.text.replace(/\[\[FOTO: ([\s\S]*?)\]\]/g, function (m, inner) { return d.mitFoto ? inner : ''; });
    return { betreff: ersetze(VORLAGE.betreff, w), text: ersetze(text, w) };
  }

  /* ====================================================================
     Datenbank / Umgebung
     ==================================================================== */
  function zufallsToken() {
    try { if (window.crypto && crypto.randomUUID) return crypto.randomUUID(); } catch (e) { /* weiter */ }
    var s = '';
    for (var i = 0; i < 32; i++) s += Math.floor(Math.random() * 16).toString(16);
    return s.slice(0, 8) + '-' + s.slice(8, 12) + '-4' + s.slice(13, 16) + '-a' + s.slice(17, 20) + '-' + s.slice(20, 32);
  }
  /** Token holen: Echtbetrieb über die Funktion, Demo zufällig (je Akte stabil). */
  async function holeToken(akte) {
    if (EG.demo) { return demoTokens[akte.id] || (demoTokens[akte.id] = zufallsToken()); }
    var r = await EG.sb.schema('verkauf').rpc('umfrage_token_anlegen', { p_akte_id: akte.id });
    if (r.error) throw new Error('Umfrage-Link konnte nicht angelegt werden: ' + (r.error.message || r.error));
    if (!r.data) throw new Error('Umfrage-Link konnte nicht angelegt werden (leere Antwort).');
    return String(r.data);
  }
  /** Übergabefotos der Akte: Punkt v9.uebergabefotos (heutiger Speicher-Schlüssel, Phase 10 Punkt „Übergabefoto“). */
  async function holeFotoPfade(akte) {
    try {
      var def = punktDef('uebergabefotos'), ziel = (def && def.schreibeIn) || { phase: 'v9', k: 'uebergabefotos' };
      var r = await EG.tab('verkauf', 'punkt').select('fotos').eq('akte_id', akte.id).eq('phase', ziel.phase).eq('punkt_key', ziel.k).maybeSingle();
      if (r.error || !r.data) return [];
      return (r.data.fotos || []).filter(function (f) { return typeof f === 'string' && f; });
    } catch (e) { return []; }
  }
  function punktDef(k) {
    var PH = window.VK_PHASEN || [], res = null;
    PH.forEach(function (ph) { (ph.punkte || []).forEach(function (p) { if (p.k === k && ph.key === (k === 'reklamation' ? 'p11' : 'p10')) res = p; }); });
    return res;
  }
  function meinName(kontext, akte) {
    if (kontext && !leer(kontext.verkaeuferName)) return kontext.verkaeuferName;
    var n = EG && EG.nutzerName && EG.nutzerName();
    if (!leer(n)) return n;
    return (akte && akte.verkaeufer) || '';
  }

  /* ====================================================================
     Übergabe-Mail
     ==================================================================== */
  async function oeffneMail(akte, kontext, knopf) {
    try {
      if (!akte || !akte.id) { EG.toast('Keine Akte übergeben.', 'fehler'); return false; }
      if (!EG.demo && (!istEchterLink(BEWERTUNGS_LINK) || !istEchterLink(UMFRAGE_URL))) {
        EG.toast('Bewertungs- und Umfrage-Link fehlen noch: Oli trägt sie oben in verkauf-uebergabe.js ein.', 'fehler');
        return false;
      }
      if (knopf) knopf.disabled = true;
      var token = await holeToken(akte);
      var pfade = (kontext && kontext.fotoPfade) ? kontext.fotoPfade.slice() : await holeFotoPfade(akte);
      var bew = istEchterLink(BEWERTUNGS_LINK) ? BEWERTUNGS_LINK : 'https://bewertung.demo.example/stieber';
      var link = umfrageUrl(token, istEchterLink(UMFRAGE_URL) ? UMFRAGE_URL : 'https://umfrage.demo.example/umfrage.html');   // Platzhalter nur im Demo
      var m = baueMail({ kundenname: akte.kunde_name, fahrzeug: fahrzeugText(akte), verkaeufer: meinName(kontext, akte), bewertungslink: bew, umfragelink: link, mitFoto: pfade.length > 0 });
      if (leer(akte.kunde_email)) EG.toast('Bei dieser Akte ist keine Kunden-E-Mail hinterlegt – Adresse im Dialog von Hand eintragen.', 'fehler');
      var gesendet = await EG.mailMitAnhang({ an: akte.kunde_email || '', betreff: m.betreff, text: m.text, fotoPfade: pfade, titel: 'Übergabe-Mail', knopfText: 'Gesendet' });
      if (gesendet && kontext && typeof kontext.onGesendet === 'function') {
        try { await kontext.onGesendet(); } catch (e2) { EG.fehler(e2); }
      }
      return !!gesendet;
    } catch (e) {
      try { EG.fehler(e); } catch (e3) { /* nichts */ }
      return false;
    } finally {
      if (knopf) knopf.disabled = false;
    }
  }
  function mailKnopf(akte, kontext) {
    try {
      var b = h('button', { type: 'button', class: 'btn btn-primary', text: 'Übergabe-Mail öffnen' });
      b.addEventListener('click', function () { oeffneMail(akte, kontext, b); });
      return b;
    } catch (e) {
      return document.createElement('span');
    }
  }

  /* ====================================================================
     Kunde nicht zufrieden → Reklamation (Phase 11) auf NOK
     ==================================================================== */
  async function nachZufriedenheit(akte, wert) {
    try {
      var w = wert && typeof wert === 'object' ? (wert.auswahl || wert.text || '') : wert;
      if (String(w || '').trim().toLowerCase() !== 'nein') return false;
      if (!akte || !akte.id) return false;
      var def = punktDef('reklamation'), ziel = (def && def.schreibeIn) || { phase: 'v10', k: 'reklamation' };
      var T = EG.tab('verkauf', 'punkt');
      var alt = await T.select('*').eq('akte_id', akte.id).eq('phase', ziel.phase).eq('punkt_key', ziel.k).maybeSingle();
      var row = alt && alt.data ? alt.data : null;
      if (row && row.status === 'nok' && row.grund) return false;   // schon offen
      var jetzt = new Date().toISOString();
      var name = (EG.nutzerName && EG.nutzerName()) || (EG.nutzer && EG.nutzer()) || null;
      var r = await T.upsert({
        akte_id: akte.id, phase: ziel.phase, punkt_key: ziel.k, status: 'nok', grund: GRUND_UNZUFRIEDEN,
        wert: row ? row.wert || null : null, fotos: row && row.fotos ? row.fotos : [],
        erledigt_von_name: name, erledigt_am: jetzt, updated_at: jetzt
      }, { onConflict: 'akte_id,phase,punkt_key' }).select().single();
      if (r.error) throw new Error('Reklamation konnte nicht angelegt werden: ' + (r.error.message || r.error));
      try { EG.toast('Reklamation in Phase 11 geöffnet (Kunde nicht zufrieden).', 'ok'); } catch (e2) { /* nichts */ }
      return true;
    } catch (e) {
      try { EG.fehler(e); } catch (e3) { /* nichts */ }
      return false;
    }
  }

  window.VK_UEBERGABE = { mailKnopf: mailKnopf, nachZufriedenheit: nachZufriedenheit, baueMail: baueMail, VORLAGE: VORLAGE };
})();
