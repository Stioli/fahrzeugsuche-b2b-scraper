/* Stieber-App – „Zahlungsaufstellung drucken“ (P4c, Stand 25.11.2026 v1.1: + window.VK_ZA.html(akte_id) für Automaten)
   Druckansicht (A4, 1 Seite) nach dem Blatt „10. Zahlungsaufstellung“ der alten Excel-Fahrzeugakte.
   Wird im Reiter Zahlungen (verkauf-zahlungen.js) je Akte über einen Knopf geöffnet.

   Schnittstelle:  window.VK_ZAHLUNGSAUFSTELLUNG.oeffnen({ akte, zahlung, einkauf })  → Vorschau im Fenster mit Knopf „Drucken“ (window.print())
                   window.VK_ZAHLUNGSAUFSTELLUNG.bauen(daten)  → { html }  (reine Berechnung + HTML, für Tests)
   Inhalt: nur belegte Werte (verkauf.akte, bestand.zahlung, bestand.einkauf; Kundennummer aus crm.kunde, NW/GW aus der Fahrzeugzeile,
   sofern die Rolle sie lesen darf). Alles Leere bleibt leer; Empfänger-, Prüfer- und Abzeichenfelder bleiben zum Abzeichnen frei.
   Automaten (v1.1): window.VK_ZA.html(akte_id) → Promise<String> mit einem vollständigen, eigenständigen HTML-Dokument (CSS eingebettet, Logo als data-URL,
   falls ladbar, sonst absolute URL; A4, 1 Seite) – lokal speichern und mit Edge headless zu PDF drucken. Liest die Daten selbst (wie der Reiter Zahlungen).
   Es wird nichts gespeichert und nichts versendet.
   Baut auf window.EG (eingang-core.js) auf; Druck-CSS blendet beim Drucken alles außer dem Blatt aus. */
(function () {
  'use strict';
  var EG = window.EG;
  if (!EG) return;

  var LOGO_URL = (window.VK_ZE && window.VK_ZE.LOGO_URL) || 'https://www.autohaus-stieber.de/idbilder/logo.jpg';

  /* ---------- Stile (einmalig) ---------- */
  var CSS = [
    '#vkza-ov{position:fixed;inset:0;z-index:9000;background:#e7e9ee;overflow:auto;padding:12px 8px 40px}',
    '#vkza-ov .vkza-leiste{max-width:210mm;position:sticky;left:0;margin:0 auto 10px;display:flex;gap:8px;flex-wrap:wrap;align-items:center}',
    '#vkza-ov .vkza-leiste .vkza-hinweis{flex:1 1 220px;font-size:13px;color:#444}',
    '#vkza-ov .vkza-leiste button{min-height:44px;padding:8px 18px;border-radius:12px;border:1px solid #888;background:#fff;font:600 15px DM Sans,Arial,sans-serif;cursor:pointer}',
    '#vkza-ov .vkza-leiste button.vkza-druck{background:#007BFF;border-color:#007BFF;color:#fff}',
    '.vkza-blatt{box-sizing:border-box;width:210mm;min-width:210mm;margin:0 auto;background:#fff;color:#000;padding:8mm 10mm 6mm;font:9.5pt/1.15 "DM Sans",Arial,Helvetica,sans-serif;box-shadow:0 2px 10px rgba(0,0,0,.25)}',
    '.vkza-kopf{display:flex;align-items:center;justify-content:space-between;gap:10px;margin:0 0 6px}',
    '.vkza-kopf img{height:38px;width:auto;display:block}',
    '.vkza-kopf .vkza-titel{font:700 15pt "Plus Jakarta Sans",Arial,sans-serif;margin:0;text-align:right}',
    '.vkza-blatt table{border-collapse:collapse;width:100%;table-layout:fixed}',
    '.vkza-blatt td,.vkza-blatt th{border:1px solid #555;padding:0.7mm 2mm;vertical-align:middle;font-weight:400;text-align:left;overflow-wrap:anywhere}',
    '.vkza-blatt .k{white-space:nowrap;background:#eee;font-weight:600;font-size:9pt}',
    '.vkza-blatt .abschnitt{background:#d9d9d9;text-align:center;font:700 10.5pt "Plus Jakarta Sans",Arial,sans-serif}',
    '.vkza-blatt .r{text-align:right;white-space:nowrap}',
    '.vkza-blatt .fett{font-weight:700}',
    '.vkza-blatt .leerzelle{height:4.8mm}',
    '.vkza-blatt .kopfzelle{font-size:8pt;color:#555;text-align:center;background:#f4f4f4}',
    '.vkza-blatt .box{display:inline-block;width:3.4mm;height:3.4mm;border:1px solid #000;margin-right:1.6mm;vertical-align:-0.5mm;text-align:center;line-height:3.2mm;font-size:9pt;font-weight:700}',
    '.vkza-blatt .zeichen td{height:8mm;font-size:9pt}',
    '.vkza-blatt .klein{font-size:8pt;color:#555;vertical-align:top}',
    '.vkza-stand{margin:2mm 0 0;font-size:8pt;color:#555}',
    '@page{size:A4 portrait;margin:8mm}',
    '@media print{',
    'html,body{background:#fff !important}',
    'body > *:not(#vkza-ov){display:none !important}',
    '#vkza-ov{position:static;inset:auto;overflow:visible;background:none;padding:0}',
    '#vkza-ov .vkza-leiste{display:none !important}',
    '.vkza-blatt{box-shadow:none;width:auto;min-width:0;margin:0;padding:0}',
    '}'
  ].join('\n');
  function stilEinbauen() {
    if (document.getElementById('vkza-stil')) return;
    var st = document.createElement('style'); st.id = 'vkza-stil'; st.textContent = CSS; document.head.appendChild(st);
  }

  /* ---------- Hilfen ---------- */
  function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function zahl(v) { if (v == null || v === '') return null; var n = Number(v); return isFinite(n) ? n : null; }
  function euro(n) { return n == null ? '' : n.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €'; }
  function datum(d) { if (!d) return ''; return (EG.fmtDatum ? EG.fmtDatum(String(d)) : '') || String(d); }
  function summe(l) { var s = 0, hat = false; l.forEach(function (x) { if (x != null) { s += x; hat = true; } }); return hat ? Math.round(s * 100) / 100 : null; }
  function haken(an) { return '<span class="box">' + (an ? 'X' : '') + '</span>'; }

  /** Datenmodell der Aufstellung aus den Akten-/Bestandsdaten (nur belegte Werte). */
  function modell(ctx) {
    var a = ctx.akte || {}, z = ctx.zahlung || {}, e = ctx.einkauf || {}, x = ctx.extra || {};
    var arten = (z.kd_zahlart || []).map(String);
    var hatArt = function (re) { return arten.some(function (t) { return re.test(t); }); };
    var vk = zahl(z.ml_vk_preis) != null ? zahl(z.ml_vk_preis) : zahl(a.vk_preis);
    var zusatz = zahl(a.kd_zusatz_rg);
    var gesamtRg = vk != null || zusatz != null ? summe([vk, zusatz]) : null;
    var ueb = [[z.kd_1uebw, z.kd_1uebw_datum], [z.kd_2uebw, z.kd_2uebw_datum], [z.kd_3uebw, z.kd_3uebw_datum]]
      .map(function (p) { return { b: zahl(p[0]), d: p[1] || '' }; });
    var inz = z.inzahlung === false ? null : zahl(z.inz_wert);
    var finz = zahl(z.kd_finanzierung_betrag), bar = zahl(z.kd_bar);
    var geld = summe([inz, finz, bar].concat(ueb.map(function (u) { return u.b; })));
    var bezahlt = e.lief_fzg_bezahlt === true;
    return {
      kunde: a.kunde_name || '', kdnr: x.kdnr || '', verkaeufer: a.verkaeufer || '', intnr: a.interne_nr || '',
      fahrzeug: [a.hersteller, a.modell].filter(Boolean).join(' '), termin: a.uebergabe_termin || '', fin: a.fin || '',
      nw: x.nwgw === 'NW', gw: x.nwgw === 'GW',
      lief: {
        name: e.lieferant || '', nr: e.lieferant_nr || '', rg: zahl(e.lief_rg_betrag_brutto), rgDatum: e.lief_rg_datum || '',
        gesamt: bezahlt ? zahl(e.lief_rg_betrag_brutto) : null, bezahltAm: bezahlt ? (e.lief_rg_bezahlt_datum || '') : ''
      },
      zahler: a.kunde_name || '',
      art: { bar: hatArt(/^bar/i), ueb: hatArt(/berweis/i), finz: hatArt(/^finanz/i), leasing: hatArt(/leasing/i) },
      vk: vk, zusatz: zusatz, zusatzDatum: a.kd_zusatz_rg_datum || '', gesamtRg: gesamtRg,
      inz: inz, finz: finz, finzDatum: z.kd_finanzierung_datum || '', bar: bar, barDatum: z.kd_bar_datum || '', ueb: ueb, geld: geld
    };
  }

  /** HTML des Blatts. */
  function bauen(ctx) {
    var m = modell(ctx);
    function zeile(label, betrag, dat, rest, fett) {
      return '<tr><td class="k' + (fett ? ' fett' : '') + '">' + esc(label) + '</td><td class="r' + (fett ? ' fett' : '') + '">' + esc(euro(betrag)) + '</td><td>' + esc(datum(dat)) + '</td>' + rest + '</tr>';
    }
    var leer = '<td class="leerzelle"></td>';
    var h = [];
    h.push('<div class="vkza-blatt">');
    h.push('<div class="vkza-kopf"><img src="' + esc(LOGO_URL) + '" alt="Autohaus Stieber GmbH" onerror="this.style.visibility=\'hidden\'"><h1 class="vkza-titel">Zahlungsaufstellung</h1></div>');
    h.push('<table><colgroup><col style="width:21%"><col style="width:33%"><col style="width:20%"><col style="width:26%"></colgroup>');
    h.push('<tr><td class="k">Kunde</td><td>' + esc(m.kunde) + '</td><td class="k">Kd-Nr.</td><td>' + esc(m.kdnr) + '</td></tr>');
    h.push('<tr><td class="k">Verkäufer</td><td>' + esc(m.verkaeufer) + '</td><td class="k">Int.-Nr.</td><td>' + esc(m.intnr) + '</td></tr>');
    h.push('<tr><td class="k">Fahrzeug</td><td>' + esc(m.fahrzeug) + '</td><td class="k">Ausl.-Termin</td><td>' + esc(datum(m.termin)) + '</td></tr>');
    h.push('<tr><td class="k">Fgst.-Nr.</td><td colspan="3">' + esc(m.fin) + '</td></tr>');
    h.push('<tr><td>' + haken(true) + 'Verkauf</td><td>' + haken(false) + 'Ankauf</td><td>' + haken(m.nw) + 'NW</td><td>' + haken(m.gw) + 'GW</td></tr>');
    h.push('</table>');

    /* Zahlungsausgang */
    h.push('<table style="margin-top:2.5mm"><colgroup><col style="width:21%"><col style="width:21%"><col style="width:16%"><col style="width:21%"><col style="width:21%"></colgroup>');
    h.push('<tr><td class="abschnitt" colspan="5">Zahlungsausgang</td></tr>');
    h.push('<tr><td class="k">Zahlungsempfänger</td><td colspan="2">' + esc(m.lief.name) + '</td><td class="k">Lief.-Nr.</td><td>' + esc(m.lief.nr) + '</td></tr>');
    h.push('<tr><td class="k">Zahlungsart</td><td colspan="4" class="leerzelle"></td></tr>');
    h.push('<tr><td class="kopfzelle"></td><td class="kopfzelle">Betrag</td><td class="kopfzelle">Datum</td><td class="kopfzelle">Empfänger</td><td class="kopfzelle">Prüfer</td></tr>');
    function aus(label, betrag, dat, fett) {
      return '<tr><td class="k' + (fett ? ' fett' : '') + '">' + esc(label) + '</td><td class="r' + (fett ? ' fett' : '') + '">' + esc(euro(betrag)) + '</td><td>' + esc(datum(dat)) + '</td>' + leer + leer + '</tr>';
    }
    h.push(aus('Rechnungsbetrag', m.lief.rg, m.lief.rgDatum));
    h.push(aus('abzüglich GS', null, ''));
    h.push(aus('abzgl. Inzahlung', null, ''));
    h.push(aus('Zahlungsbetrag', null, ''));
    h.push(aus('1. Anzahlung', null, ''));
    h.push(aus('2. Anzahlung', null, ''));
    h.push(aus('Restzahlung', null, ''));
    h.push(aus('Gesamt Geld-Ausgang', m.lief.gesamt, m.lief.bezahltAm, true));
    h.push('</table>');

    /* Zahlungseingang */
    h.push('<table style="margin-top:2.5mm"><colgroup><col style="width:30%"><col style="width:22%"><col style="width:18%"><col style="width:30%"></colgroup>');
    h.push('<tr><td class="abschnitt" colspan="4">Zahlungseingang</td></tr>');
    h.push('<tr><td class="k">Zahlungsempfänger</td><td colspan="3">AHS – Autohaus Stieber GmbH</td></tr>');
    h.push('<tr><td class="k">Zahler</td><td colspan="3">' + esc(m.zahler) + '</td></tr>');
    h.push('<tr><td class="k">Zahlungsart</td><td colspan="3">' + haken(m.art.bar) + 'Bar &nbsp; ' + haken(m.art.ueb) + 'Überweisung &nbsp; ' + haken(m.art.finz) + 'Finanzierung &nbsp; ' + haken(m.art.leasing) + 'Leasing</td></tr>');
    h.push('<tr><td class="kopfzelle"></td><td class="kopfzelle">Betrag</td><td class="kopfzelle">Datum</td><td class="kopfzelle">Zahler</td></tr>');
    h.push(zeile('Rechnungsbetrag', m.vk, '', leer));
    h.push(zeile('Zusatzrechnung', m.zusatz, m.zusatzDatum, leer));
    h.push(zeile('Gesamt Rg.-Betrag', m.gesamtRg, '', leer, true));
    h.push(zeile('Inzahlungnahme', m.inz, '', leer));
    h.push(zeile('Finanzierung', m.finz, m.finzDatum, leer));
    h.push(zeile('Barzahlung', m.bar, m.barDatum, leer));
    m.ueb.forEach(function (u, i) { h.push(zeile((i + 1) + '. Anzahlung / Überweisung', u.b, u.d, leer)); });
    h.push(zeile('Gesamt Geldeingang', m.geld, '', leer, true));
    h.push('</table>');

    /* Abzeichnen */
    h.push('<table class="zeichen" style="margin-top:2.5mm"><colgroup><col style="width:50%"><col style="width:25%"><col style="width:25%"></colgroup>');
    ['Zahlungsaufstellung an BH', 'Betrag vollständig erhalten', 'BUCHHALTUNG Betrag vollständig erhalten'].forEach(function (t) {
      h.push('<tr><td class="k">' + esc(t) + '</td><td class="klein">Datum</td><td class="klein">Name</td></tr>');
    });
    h.push('</table>');
    h.push('<p class="vkza-stand">Ausdruck aus der Stieber-App vom ' + esc(datum(EG.heute ? EG.heute() : new Date().toISOString().slice(0, 10))) + ' – Werte laut Masterliste, leere Felder zum Ausfüllen bzw. Abzeichnen.</p>');
    h.push('</div>');
    return { html: h.join('\n') };
  }

  /** Zusatzwerte nachladen: Kundennummer (crm.kunde) und NW/GW (Fahrzeugzeile). Fehlendes bleibt leer. */
  async function extraLaden(a) {
    var x = {};
    try {
      if (a.kunde_id && EG.tab) {
        var r = await EG.tab('crm', 'kunde').select('repdoc_kdnr').eq('id', a.kunde_id).maybeSingle();
        if (r && r.data && r.data.repdoc_kdnr) x.kdnr = r.data.repdoc_kdnr;
      }
    } catch (err) { console.warn('Kundennummer nicht lesbar:', err); }
    try {
      if (a.fahrzeug_id && EG.sb) {
        var f = await EG.sb.schema('bestand').rpc('fahrzeuge_lesen', { p_stieber_id: a.fahrzeug_id });
        var z = f && f.data && f.data[0];
        var v = z && z.felder && z.felder.NW_x002f_GW;
        if (v) x.nwgw = String(v && v.wert != null ? v.wert : v);
      }
    } catch (err) { console.warn('NW/GW nicht lesbar:', err); }
    return x;
  }

  /* ---------- Eigenständiges HTML für Automaten (Edge headless → PDF) ---------- */
  async function logoDataUrl() {
    try {
      var ctl = (typeof AbortController !== 'undefined') ? new AbortController() : null;
      var t = ctl ? setTimeout(function () { ctl.abort(); }, 4000) : null;
      var r = await fetch(LOGO_URL, ctl ? { signal: ctl.signal } : undefined);
      if (t) clearTimeout(t);
      if (!r.ok) return LOGO_URL;
      var b = await r.blob();
      return await new Promise(function (ok) { var fr = new FileReader(); fr.onload = function () { ok(String(fr.result)); }; fr.onerror = function () { ok(LOGO_URL); }; fr.readAsDataURL(b); });
    } catch (err) { return LOGO_URL; }
  }
  function stilBlatt() {
    return CSS.split('\n').filter(function (l) { return l.indexOf('.vkza-') === 0; }).join('\n') +
      '\n@page{size:A4 portrait;margin:8mm}\nhtml,body{background:#fff;margin:0}\n.vkza-blatt{box-shadow:none;width:auto;min-width:0;margin:0;padding:0}';
  }
  /** Akte laden wie im Reiter Zahlungen: verkauf.akte + bestand.zahlung + bestand.einkauf (+ Kundennummer, NW/GW). */
  async function datenLaden(akteId) {
    var T = function (sch, t) { return EG.tab(sch, t); };
    var ra = await T('verkauf', 'akte').select('*').eq('id', akteId).maybeSingle();
    if (ra.error) throw ra.error;
    if (!ra.data) throw new Error('Akte nicht gefunden: ' + akteId);
    var a = ra.data, z = null, e = null;
    if (a.fahrzeug_id) {
      try {
        var b = await Promise.all([T('bestand', 'zahlung').select('*').eq('fahrzeug_id', a.fahrzeug_id).maybeSingle(), T('bestand', 'einkauf').select('*').eq('fahrzeug_id', a.fahrzeug_id).maybeSingle()]);
        z = (b[0] && b[0].data) || null; e = (b[1] && b[1].data) || null;
      } catch (err) { console.warn('Zahlungs-/Einkaufsdaten nicht lesbar:', err); }
    }
    return { akte: a, zahlung: z, einkauf: e, extra: EG.demo ? {} : await extraLaden(a) };
  }
  /** → Promise<String>: komplettes HTML-Dokument der Zahlungsaufstellung (gleiche Ansicht wie der Druck im Reiter Zahlungen). */
  async function htmlDokument(akteId) {
    var ctx = await datenLaden(akteId);
    var blatt = bauen(ctx).html;
    var logo = await logoDataUrl();
    blatt = blatt.split('src="' + esc(LOGO_URL) + '"').join('src="' + esc(logo) + '"');
    return '<!doctype html>\n<html lang="de"><head><meta charset="utf-8"><title>Zahlungsaufstellung ' + esc(ctx.akte.interne_nr || '') + '</title>\n' +
      '<meta name="viewport" content="width=device-width,initial-scale=1">\n' +
      '<link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Plus+Jakarta+Sans:wght@600;700;800&display=swap" rel="stylesheet">\n' +
      '<style>\n' + stilBlatt() + '\n</style></head><body>\n' + blatt + '\n</body></html>';
  }

  var offen = null;
  function schliessen() { if (offen) { offen.remove(); offen = null; } }
  async function oeffnen(ctx) {
    stilEinbauen(); schliessen();
    var ctx2 = Object.assign({}, ctx);
    ctx2.extra = Object.assign({}, ctx.extra || {}, EG.demo ? {} : await extraLaden(ctx.akte || {}));
    var ov = document.createElement('div'); ov.id = 'vkza-ov'; ov.setAttribute('role', 'dialog'); ov.setAttribute('aria-label', 'Zahlungsaufstellung');
    ov.innerHTML = '<div class="vkza-leiste"><button type="button" class="vkza-druck">Drucken</button><button type="button" class="vkza-zu">Schließen</button>' +
      '<span class="vkza-hinweis">Vorschau (A4, 1 Seite). Beim Drucken „Hintergrundgrafiken“ nicht nötig, Ränder: Standard.</span></div>' + bauen(ctx2).html;
    document.body.appendChild(ov); offen = ov;
    ov.querySelector('.vkza-druck').addEventListener('click', function () { window.print(); });
    ov.querySelector('.vkza-zu').addEventListener('click', schliessen);
    document.addEventListener('keydown', function esk(ev) { if (ev.key === 'Escape') { schliessen(); document.removeEventListener('keydown', esk); } });
    ov.scrollTop = 0;
  }

  window.VK_ZAHLUNGSAUFSTELLUNG = { oeffnen: oeffnen, bauen: bauen, modell: modell };
  window.VK_ZA = { html: htmlDokument };   // für Automaten (siehe Kopf)
})();
