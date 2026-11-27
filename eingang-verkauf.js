/* Stieber-App – Reiter „Verkauf“ (Verkaufsakten mit 11 Phasen, Version 4.10; 27.11.2026: Banner „Übergabe an Dispo“ unter dem Kopf (verkauf-hinweise.js, #hw-box); 25.11.2026 (Oli „A umsetzen“): PDFs in den Unterlagen zählen als Quelle für Punkt 45/65 (VK_DU.dokumenteFuerAkten → pm.dok, an Liste, Übersicht und Akte), Hinweise mit Sprung zu #du-box an Punkt 99/102; 25.11.2026: Bereich „Unterlagen“ + Lieferanten-AB über verkauf-unterlagen.js, Link #verkauf&nr=<interne_nr>)
   Stand 15.11.2026 (Verkaufsablauf, Paket VA3; Nachträge Welle 4: eVB-Nr. aus der Akte, „Gesehen“ für OS an Freigabe in Vertretung und schlechter Umfrage). Plan: „Anpassungen Verkaufsablauf“ v2 (Abschnitte 2, 3, 6), Bauplan Verkaufsablauf v1 (E1, E2, E6).
   Daten: Schema verkauf (akte, punkt, freigabe). Phasen und Haken: verkauf-phasen.js (window.VK_PHASEN, 11 Phasen p01–p11 plus Bereiche a1_*, a2_*),
   Ampel und „Was fehlt noch, bei wem“: verkauf-ampel.js (window.VK_AMPEL, Berechnung im Browser, E2).
   Speichern nach E1: Jeder Punkt wird unter seinem SPEICHER-Schlüssel (`schreibeIn` der Definition) in verkauf.punkt abgelegt (v1…v10, p04, p09, p10, p11 …).
   Die Auslieferungs-Checkliste (Schlüssel ac_*) liegt weiter in verkauf.auslieferung_punkt (über akte.interne_nr) und wird über AC_UI angezeigt.
   Punkte ohne beschreibbare Quelle (Masterliste, Datenfelder aus bestand.*) zeigt der Reiter nur an („kommt aus der Masterliste“).
   Nicht mehr hier: Zahlungs-Häkchen (A1) und die Knöpfe Zahlungseinladung/Zahlungsbestätigung – die wandern in den Reiter Zahlungen (VA4).
   Transportstatus (A2): kleine Statuszeile über window.VK_TRANSPORT (Reiter Transport, VA5); fehlt er, steht dort „Transport: keine Angabe“.
   Baut auf window.EG aus eingang-core.js auf. Dieser Reiter ist für admin, verkauf, dispo, buchhaltung – nicht für werkstatt.

   Für andere Reiter (z. B. Anfragen):
     window.VK_AKTE_ANLEGEN(vorbelegung) → Promise<akte_id | null>
        vorbelegung (alles optional): interne_nr, autrado_nr, fin, hersteller, modell, farbe, ml_ref, lead_ref, bestell_nr, fahrzeug_id,
        kunde_name, kunde_telefon, kunde_email, verkaeufer, uebergabe_termin, kanal (→ Punkt „Anfrage ist da“),
        kunde_id (schon gewählter Kunde), herkunft_anfrage (Kanal der Anfrage), nachricht (→ notiz, falls leer)
        Ist window.VK_KUNDE da und keine kunde_id übergeben, ruft die App vor dem Speichern await VK_KUNDE.waehle(vorbelegung) auf (→ kunde_id | null = neuer Kunde | undefined = Abbruch).
        Gibt es zu ml_ref oder lead_ref schon eine Akte, wird diese geöffnet. Sonst Dialog, danach öffnet sich die neue Akte.
     window.VK_AKTE_OEFFNEN(akte_id)

   Regeln (kurz):
   - Punkt-Status: offen · ok · nok · entfaellt (Grund Pflicht bei nok/entfällt). Ein Tipp auf den aktiven Knopf nimmt zurück auf „offen“.
   - Ampel je Phase (VK_AMPEL): grün = alle Pflichtpunkte ok oder entfällt und kein NOK · rot = NOK (oder Übergabetermin überschritten) · gelb = Pflichtpunkt offen · grau = Phase entfällt.
   - Keine feste Reihenfolge mehr (Plan v2): Gesperrt ist nur die Freigabe Auslieferung (Phase 9), solange nicht voll bezahlt ist.
     OS, Dispo oder Buchhaltung heben die Sperre mit Pflicht-Grund auf (verkauf.freigabe art sperre_aufgehoben); die Akte bleibt dann als „Übergabe vor voller Zahlung“ markiert.
   - Phase 5 Freigabe Verkauf: OS gibt frei (verkauf.freigabe art verkauf, vertretung false); Dispo/Buchhaltung nur „in Vertretung“ (vertretung true). Verkauf sieht den Stand.
   - Verkäufer-Zuteilung: beim Anlegen der Akte setzt sie jeder, danach ändern nur OS, Dispo und Buchhaltung (Provision).
   - akte.phase_aktuell wird künftig mit p01…p11 (oder abgeschlossen) geschrieben; Akten mit alten v-Werten werden richtig angezeigt, die Ampel kommt aus den Haken. */
(function () {
  'use strict';
  var EG = window.EG, h = EG && EG.h, PH = window.VK_PHASEN, AMP = window.VK_AMPEL, AC_UI = window.AC_UI;
  if (!EG) return;
  if (!PH) { console.error('verkauf-phasen.js fehlt – Reiter Verkauf nicht aktiv.'); return; }
  if (!AMP) { console.error('verkauf-ampel.js fehlt – Reiter Verkauf nicht aktiv.'); return; }
  if (!AC_UI) { console.error('eingang-auslieferung.js fehlt (muss vor eingang-verkauf.js geladen werden) – Reiter Verkauf nicht aktiv.'); return; }

  // verkauf.css selbst nachladen, falls die Seite sie nicht eingebunden hat
  try {
    var hatCss = Array.prototype.some.call(document.querySelectorAll('link[rel=stylesheet]'), function (l) { return /verkauf\.css/.test(l.getAttribute('href') || ''); });
    if (!hatCss) { var lk = document.createElement('link'); lk.rel = 'stylesheet'; lk.href = 'verkauf.css'; document.head.appendChild(lk); }
  } catch (e) { /* egal */ }

  /* ====================================================================
     Festwerte
     ==================================================================== */
  var PH_BY = {}; PH.forEach(function (p, i) { PH_BY[p.key] = p; p.idx = i; });
  var PHASEN_ANZ = PH.filter(function (p) { return p.typ === 'phase'; });   // p01 … p11 (die Reiter-Anzeige)
  var VERKAEUFER = ['OS', 'NP', 'AI'];
  var ANLEGEN_ROLLEN = ['admin', 'verkauf', 'dispo', 'buchhaltung'];   // Buchhaltung seit 10.11.2026 (Oli)
  var BUERO = ['admin', 'dispo', 'buchhaltung'];
  var ROLLENNAME = { admin: 'OS', dispo: 'Dispo', buchhaltung: 'Buchhaltung', verkauf: 'Verkauf', werkstatt: 'Werkstatt' };
  var AMPEL_TEXT = { gruen: 'Fertig', gelb: 'In Arbeit', rot: 'Achtung', grau: 'Entfällt' };
  var AMPEL_PILL = { gruen: 'gruen', gelb: 'gold', rot: 'rot', grau: 'grau' };
  var STATUS_LABEL = { ok: 'OK', nok: 'NOK', entfaellt: 'entfällt' };
  var ZAHL_TEXT = { bezahlt: 'Bezahlt', teilweise: 'Teilweise bezahlt', offen: 'Offen' };
  var ZAHL_PILL = { bezahlt: 'gruen', teilweise: 'gold', offen: 'gold' };

  var S = {
    root: null, id: null, akte: null, pm: {}, frei: [], umfragen: [], kx: null, calc: null, offen: {}, geoeffnetFuer: null,
    akten: [], pmAlle: {}, freiAlle: {}, kxAlle: {}, listCalc: {}, filter: 'offen', suche: '', listenBox: null, gesaet: false,
    kopfBox: null, fehltBox: null, phasenBox: null, duBox: null, nr: null, filterGesetzt: false, pushMe: null, swDa: false, trCache: {}
  };
  // Aus einem Link der Meldung (#verkauf&id=<akte_id>) gleich die Akte öffnen
  (function hashLesen() {
    var m = /^#verkauf&id=([0-9a-f-]{36})/i.exec(location.hash || '');
    if (m) S.id = m[1];
    var n = /^#verkauf&nr=([^&]+)/i.exec(location.hash || '');   // Link über die interne Nummer (für Automaten): #verkauf&nr=<interne_nr>
    if (n && !m) S.nr = decodeURIComponent(n[1]);
  })();
  var T = {
    akte: function () { return EG.tab('verkauf', 'akte'); },
    punkt: function () { return EG.tab('verkauf', 'punkt'); },
    frei: function () { return EG.tab('verkauf', 'freigabe'); },
    ac: function () { return EG.tab('verkauf', 'auslieferung_punkt'); },
    umfrage: function () { return EG.tab('verkauf', 'umfrage'); }
  };
  function chk(r) { if (r && r.error) throw r.error; return r; }
  function jetzt() { return new Date().toISOString(); }
  function akteTitel(a) { return [a.hersteller, a.modell].filter(Boolean).join(' ') || 'Fahrzeug'; }
  function meineRolle() { return EG.rolle; }
  function istBuero() { return BUERO.indexOf(meineRolle()) >= 0; }
  function erlaubtAnlegen() { return ANLEGEN_ROLLEN.indexOf(meineRolle()) >= 0; }
  function istOffen(a) { return a.phase_aktuell !== 'abgeschlossen' && a.phase_aktuell !== 'abgebrochen'; }
  function rollenText(rollen) { return (rollen || []).map(function (r) { return ROLLENNAME[r] || r; }).join(', '); }
  function meinName() { return EG.nutzerName() || EG.nutzer(); }
  var queue = Promise.resolve();
  /** Speichervorgänge laufen nacheinander (schnelles Tippen darf nichts überholen). */
  function seriell(fn) { var p = queue.then(fn); queue = p.catch(function () { /* Fehler meldet der Aufrufer */ }); return p; }

  function fmtBetrag(n) { return Number(n).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €'; }
  /** '1.234,50' | '12,5' | '300' → Zahl · leer → null · ungültig → NaN */
  function parseBetrag(s) {
    s = String(s == null ? '' : s).replace(/[€\s]/g, '');
    if (!s) return null;
    if (s.indexOf(',') >= 0) s = s.replace(/\./g, '').replace(',', '.');
    else if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');
    var n = parseFloat(s);
    return isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : NaN;
  }
  /** Zahl → Text fürs Eingabefeld: 29900.5 → '29900,50' */
  function betragFeld(n) { return Number(n).toFixed(2).replace('.', ','); }
  /** Auslieferungs-Punkte (v8, ac_*) kommen aus verkauf.auslieferung_punkt – Altzeilen in verkauf.punkt werden ignoriert. */
  function istAcZeile(r) { return r.phase === 'v8' && /^ac_/.test(r.punkt_key); }
  function zuMap(rows) {
    var m = {};
    (rows || []).forEach(function (r) { if (istAcZeile(r)) return; (m[r.phase] = m[r.phase] || {})[r.punkt_key] = r; });
    return m;
  }

  /* ====================================================================
     Daten aus bestand.* (nur Lesen, nie ein Fehler): Zahlungsstand, Transport, Fehlteile, Einkauf (nur Büro)
     ==================================================================== */
  async function sichereAbfrage(schema, tabelle, spalten, spalte, werte) {
    var out = [], teile = [];
    werte = (werte || []).filter(Boolean);
    for (var i = 0; i < werte.length; i += 40) teile.push(werte.slice(i, i + 40));
    for (var j = 0; j < teile.length; j++) {
      try {
        var r = await EG.tab(schema, tabelle).select(spalten).in(spalte, teile[j]);
        if (!r.error && r.data) out = out.concat(r.data);
      } catch (e) { /* Tabelle fehlt oder kein Recht: dann gibt es dazu keine Angabe */ }
    }
    return out;
  }
  function eindeutig(l) { return l.filter(function (x, i) { return x && l.indexOf(x) === i; }); }
  /* ---------- Zahlungsstand: EINE Quelle = Ansicht verkauf.v_zahlstand (akte_id → bezahlt | teilweise | offen), VA6 ----------
     Die Reiter Verkauf (Phase 6, Sperre Phase 9), Zahlungen und Übersicht lesen nur diese Ansicht.
     Rückfall (nur wenn die Ansicht für eine Akte nichts liefert): die alte Ableitung. Demo: Nachbildung der Ansichtsregel aus den Demo-Tabellen. */
  async function demoZahlstandNeu() {
    if (!EG.demo) return;
    var rolle = meineRolle();
    if (['admin', 'dispo', 'buchhaltung', 'verkauf'].indexOf(rolle) < 0) return;
    var ak = chk(await T.akte().select('id,fahrzeug_id,phase_aktuell')).data || [];
    var pu = chk(await T.punkt().select('akte_id,phase,punkt_key,status')).data || [];
    var za = chk(await EG.tab('bestand', 'zahlung').select('fahrzeug_id,kd_geldeingang')).data || [];
    var zm = {}; za.forEach(function (z) { zm[z.fahrzeug_id] = z; });
    function ok(id, ph, ks) { return pu.some(function (p) { return p.akte_id === id && p.phase === ph && ks.indexOf(p.punkt_key) >= 0 && p.status === 'ok'; }); }
    var rows = ak.filter(function (a) { return a.phase_aktuell !== 'abgebrochen'; }).map(function (a) {
      var z = a.fahrzeug_id ? zm[a.fahrzeug_id] : null, st = 'offen';
      if ((z && z.kd_geldeingang === 'komplett erhalten') || ok(a.id, 'v7', ['voll_bezahlt'])) st = 'bezahlt';
      else if ((z && z.kd_geldeingang === 'Teilzahlung') || ok(a.id, 'v7', ['anzahlung_da', 'restzahlung'])) st = 'teilweise';
      return { akte_id: a.id, fahrzeug_id: a.fahrzeug_id, zahlstand: st };
    });
    chk(await EG.tab('verkauf', 'v_zahlstand').upsert(rows, { onConflict: 'akte_id' }));
  }
  /** akteIds → Promise<{ [akte_id]: 'bezahlt'|'teilweise'|'offen' }> (nur Akten, zu denen die Ansicht etwas liefert; wirft nie) */
  async function ladeZahlstand(akteIds) {
    var out = {};
    try {
      await demoZahlstandNeu();
      var rows = await sichereAbfrage('verkauf', 'v_zahlstand', 'akte_id,fahrzeug_id,zahlstand', 'akte_id', akteIds);
      rows.forEach(function (r) { if (r.akte_id && /^(bezahlt|teilweise|offen)$/.test(r.zahlstand)) out[r.akte_id] = r.zahlstand; });
    } catch (e) { /* kein Recht oder Ansicht fehlt: Rückfall der Aufrufer */ }
    return out;
  }
  window.VK_ZAHLSTAND = { lade: ladeZahlstand, text: ZAHL_TEXT, pill: ZAHL_PILL };

  /** → { [akte.id]: { zahlung:'bezahlt'|'teilweise'|'offen'|undefined, transport, fahrzeug, einkauf } } */
  async function ladeBestand(akten) {
    var ids = eindeutig(akten.map(function (a) { return a.fahrzeug_id; }));
    var nrs = eindeutig(akten.filter(function (a) { return !a.fahrzeug_id; }).map(function (a) { return a.interne_nr; }));
    var buero = istBuero();
    var x = await Promise.all([
      sichereAbfrage('bestand', 'v_verkauf_sicht', 'stieber_id,interne_nr,bezahlt', 'stieber_id', ids),
      sichereAbfrage('bestand', 'v_verkauf_sicht', 'stieber_id,interne_nr,bezahlt', 'interne_nr', nrs),
      sichereAbfrage('bestand', 'v_transport_sicht', '*', 'stieber_id', ids),
      sichereAbfrage('bestand', 'v_transport_sicht', '*', 'interne_nr', nrs),
      sichereAbfrage('bestand', 'fahrzeug', 'stieber_id,fehlteile', 'stieber_id', ids),
      buero ? sichereAbfrage('bestand', 'zahlung', 'fahrzeug_id,kd_geldeingang', 'fahrzeug_id', ids) : Promise.resolve([]),
      buero ? sichereAbfrage('bestand', 'einkauf', '*', 'fahrzeug_id', ids) : Promise.resolve([]),
      ladeZahlstand(akten.map(function (a) { return a.id; }))
    ]);
    function index(rows, feld) { var m = {}; rows.forEach(function (r) { if (r[feld] != null) m[r[feld]] = r; }); return m; }
    var sichtId = index(x[0], 'stieber_id'), sichtNr = index(x[1], 'interne_nr');
    var trId = index(x[2], 'stieber_id'), trNr = index(x[3], 'interne_nr');
    var fzId = index(x[4], 'stieber_id'), zahlId = index(x[5], 'fahrzeug_id'), ekId = index(x[6], 'fahrzeug_id');
    var out = {};
    akten.forEach(function (a) {
      var sicht = (a.fahrzeug_id && sichtId[a.fahrzeug_id]) || (a.interne_nr && sichtNr[a.interne_nr]) || null;
      var zr = a.fahrzeug_id ? zahlId[a.fahrzeug_id] : null;
      var zahlung = x[7][a.id];   // Quelle: verkauf.v_zahlstand
      if (!zahlung && sicht) {   // Rückfall: Ansicht liefert nichts für diese Akte
        zahlung = sicht.bezahlt === true ? 'bezahlt' : 'offen';
        if (zr && /teil/i.test(String(zr.kd_geldeingang || ''))) zahlung = 'teilweise';
        if (zr && /komplett/i.test(String(zr.kd_geldeingang || ''))) zahlung = 'bezahlt';
      }
      out[a.id] = {
        zahlung: zahlung,
        transport: (a.fahrzeug_id && trId[a.fahrzeug_id]) || (a.interne_nr && trNr[a.interne_nr]) || null,
        fahrzeug: a.fahrzeug_id ? (fzId[a.fahrzeug_id] || null) : null,
        einkauf: a.fahrzeug_id ? (ekId[a.fahrzeug_id] || null) : null
      };
    });
    return out;
  }
  /** Zeilen der Auslieferungs-Checkliste je interne Nr. (ALLE Schlüssel, auch die beiden Übergabe-Punkte aus der Masterliste) → { nr: { punkt_key: Zeile } } */
  async function ladeAc(nrs) {
    var rows = await sichereAbfrage('verkauf', 'auslieferung_punkt', '*', 'interne_nr', eindeutig((nrs || []).map(function (n) { return String(n == null ? '' : n).trim(); })));
    var out = {};
    rows.forEach(function (r) { (out[r.interne_nr] = out[r.interne_nr] || {})[r.punkt_key] = r; });
    return out;
  }

  /* ====================================================================
     REGELN: Ampel über VK_AMPEL (reine Berechnung, kein Speichern)
     ==================================================================== */
  function findeFrei(frei, art, phase) {
    var r = null;
    (frei || []).forEach(function (f) { if (f.art === art && (phase == null || f.phase === phase)) r = f; });
    return r;
  }
  /** Wert, den ein Eingabefeld zeigt: bei „auswahl“ die Auswahl, sonst der Rohwert. */
  function wertVon(p, row) {
    var w = row && row.wert;
    if (!w || typeof w !== 'object') return null;
    switch (p.eingabe) {
      case 'auswahl': return w.auswahl == null ? null : w.auswahl;
      case 'datum': return w.datum || null;
      case 'betrag': return w.betrag == null ? null : w.betrag;
      case 'text': return w.text || null;
      case 'bestaetigung': return (w.name && w.datum) ? w : null;
      default: return null;
    }
  }
  /** PDFs in den Unterlagen (verkauf.dokument) für viele Akten mit einer Abfrage-Gruppe → { akte_id: { art: Zeile } }. Fehlt das Modul oder das Leserecht: {} (Quelle zählt nicht). */
  async function dokumenteLaden(akten) {
    if (!window.VK_DU || typeof window.VK_DU.dokumenteFuerAkten !== 'function') return {};
    try { return await window.VK_DU.dokumenteFuerAkten((akten || []).map(function (a) { return a.id; })); } catch (e) { console.warn('Unterlagen als Quelle:', e && e.message); return {}; }
  }
  /** Legt die Unterlagen der Akte als virtuelle Haken unter pm.dok ab (nie gespeichert); die Quelle { dokument: art } in verkauf-phasen.js liest sie. */
  function dokInPm(pm, dokMap) {
    if (window.VK_DU && typeof window.VK_DU.dokumenteInPm === 'function') window.VK_DU.dokumenteInPm(pm, dokMap || {}); else pm.dok = {};
  }
  function zeilenAus(pm) {
    var z = [];
    Object.keys(pm).forEach(function (ph) {
      Object.keys(pm[ph] || {}).forEach(function (k) {
        var r = pm[ph][k];
        if (r) z.push({ phase: ph, punkt_key: k, status: r.status || 'offen', wert: r.wert, grund: r.grund });
      });
    });
    return z;
  }
  function baueKontext(akte, frei, kx) {
    kx = kx || {};
    var k = {
      zahlung: kx.zahlung, sperreAufgehoben: !!(findeFrei(frei, 'sperre_aufgehoben') || findeFrei(frei, 'uebergabe_vor_zahlung')),
      daten: { 'verkauf.akte.zubehoer': String(akte.zubehoer == null ? '' : akte.zubehoer).trim(), 'verkauf.akte.evb_nr': String(akte.evb_nr == null ? '' : akte.evb_nr).trim() }
    };
    if (kx.transport) {
      var t = kx.transport;
      k.transportstatus = t.transportstatus;
      k.daten['bestand.einkauf.abholfreigabe'] = t.abholfreigabe;
      k.daten['bestand.einkauf.spedition_beauftragt'] = t.spedition_beauftragt;
      k.daten['bestand.einkauf.papiere_eingang_ahs'] = t.papiere_eingang_ahs;
    }
    if (kx.fahrzeug) k.daten['bestand.fahrzeug.fehlteile'] = String(kx.fahrzeug.fehlteile == null ? '' : kx.fahrzeug.fehlteile).trim();
    if (kx.einkauf) {
      ['lief_fzg_bezahlt', 'ek_finanzierung', 'ek_finanzierung_abloese_datum', 'lief_rg_bezahlt_datum'].forEach(function (f) {
        if (kx.einkauf[f] !== undefined) k.daten['bestand.einkauf.' + f] = kx.einkauf[f];
      });
    }
    return k;
  }
  /** Zeile, die zu einem Punkt gehört: bevorzugt die Quelle mit dem erreichten Status, sonst die eigene (schreibeIn), sonst irgendeine. */
  function zeileFuer(p, pm, st) {
    var q = p.quelle || [], rows = q.map(function (x) { return (pm[x.phase] || {})[x.k] || null; });
    for (var i = 0; i < q.length; i++) {
      if (rows[i] && (rows[i].status || 'offen') === st && st !== 'offen') {
        if (q[i].okWerte && st === 'ok' && q[i].okWerte.indexOf(AMP.wertAus(rows[i].wert)) < 0) continue;
        return rows[i];
      }
    }
    if (p.schreibeIn) { var e = (pm[p.schreibeIn.phase] || {})[p.schreibeIn.k]; if (e) return e; }
    for (var j = 0; j < rows.length; j++) if (rows[j]) return rows[j];
    return null;
  }
  function handEntfaellt(ph, pm) {
    return !!(ph.phaseQuelle && ph.phaseQuelle.length && ph.phaseQuelle.every(function (q) { var r = (pm[q.phase] || {})._phase; return !!r && r.status === 'entfaellt'; }));
  }

  /** Gesamtberechnung einer Akte.
      → { phasen:[info] (alle 14), nach:{key:info}, aktuell:'p03'|'abgeschlossen', aktuellIdx, fehlt:[…], gesamt }
      info: { def, key, idx, res, punkte:[{def,row,eigen,eigenSt,st,auto,grund,wert,offen}], gruen, ampel, nok, offenPflicht, pflichtGesamt, pflichtErledigt,
              phaseEntfaellt, phaseAuto, phaseGrund, sperren:[{typ,text}], warnungen:[…], rotGrund } */
  function berechne(akte, pm, frei, kx) {
    var erg = AMP.berechne(PH, zeilenAus(pm), baueKontext(akte, frei, kx));
    var heute = EG.heute(), terminUeber = istOffen(akte) && !!akte.uebergabe_termin && akte.uebergabe_termin < heute;
    var res = [], nach = {};
    PH.forEach(function (ph, idx) {
      var r = erg.nachKey[ph.key], hand = handEntfaellt(ph, pm);
      var info = {
        def: ph, key: ph.key, idx: idx, res: r, punkte: [], phaseEntfaellt: r.entfaellt, phaseAuto: r.entfaellt && !hand, phaseGrund: r.entfaelltGrund || '',
        nok: r.nok, offenPflicht: r.offenPflicht, pflichtGesamt: r.pflichtGesamt, pflichtErledigt: r.pflichtErledigt,
        sperren: (r.sperren || []).slice(), warnungen: (r.warnungen || []).slice(), rotGrund: ''
      };
      if (hand) { var pr = (pm[ph.phaseQuelle[0].phase] || {})._phase; info.phaseGrund = (pr && pr.grund) || 'Phase von Hand entfallen'; }
      ph.punkte.forEach(function (p, i) {
        var it = r.punkte[i], st = it.status, row = zeileFuer(p, pm, st);
        var eigen = p.schreibeIn ? ((pm[p.schreibeIn.phase] || {})[p.schreibeIn.k] || null) : null;
        info.punkte.push({
          def: p, row: row, eigen: eigen, eigenSt: eigen ? (eigen.status || 'offen') : 'offen', st: st, auto: it.auto, grund: it.grund, wert: wertVon(p, row),
          offen: !!p.pflicht && st !== 'ok' && st !== 'entfaellt'
        });
      });
      info.ampel = r.ampel;
      if (ph.typ === 'phase' && terminUeber && idx <= 9 && r.ampel === 'gelb') { info.ampel = 'rot'; info.rotGrund = 'Übergabetermin überschritten'; }
      else if (r.nok > 0) info.rotGrund = r.nok + ' Punkt' + (r.nok === 1 ? '' : 'e') + ' mit NOK';
      info.gruen = info.ampel === 'gruen' || info.ampel === 'grau';
      res.push(info); nach[ph.key] = info;
    });
    var erster = -1;
    PHASEN_ANZ.forEach(function (ph, i) { var inf = nach[ph.key]; if (erster < 0 && !inf.phaseEntfaellt && inf.ampel !== 'gruen') erster = i; });
    return {
      phasen: res, nach: nach, aktuellIdx: erster, aktuell: erster < 0 ? 'abgeschlossen' : PHASEN_ANZ[erster].key,
      fehlt: erg.fehlt, gesamt: erg.gesamt
    };
  }
  function zahlungVon(c) { return c && c.zahlung; }
  /** Sperre aufgehoben, aber noch nicht voll bezahlt → „Übergabe vor voller Zahlung“ */
  function uebergabeVorZahlung(frei, kx) {
    var f = findeFrei(frei, 'sperre_aufgehoben') || findeFrei(frei, 'uebergabe_vor_zahlung');
    return (f && (!kx || kx.zahlung !== 'bezahlt')) ? f : null;
  }

  /* ---------- Rechte ---------- */
  function darfPunkt(ph, p) { return !!p.schreibeIn && !p.nurLesen && (p.rollen || ph.rollen).indexOf(meineRolle()) >= 0; }
  function darfPhaseIrgendwas(ph) { return ph.punkte.some(function (p) { return darfPunkt(ph, p); }); }

  /* ====================================================================
     Reiter registrieren
     ==================================================================== */
  EG.onTab('verkauf', function (root) {
    S.root = root;
    return demoNachladen().then(async function () {
      if (S.nr && !S.id) {   // Link #verkauf&nr=<interne_nr>: Akte über die interne Nummer suchen
        var nr = S.nr; S.nr = null;
        try { var rr = await T.akte().select('id').eq('interne_nr', nr).limit(1); if (rr.data && rr.data[0]) S.id = rr.data[0].id; else EG.toast('Keine Akte zur Nummer ' + nr + ' gefunden.', 'fehler'); } catch (e) { console.warn('Akte nach Nr.:', e && e.message); }
      }
      if (!S.filterGesetzt) { S.filterGesetzt = true; if (meineRolle() === 'dispo' || meineRolle() === 'buchhaltung') S.filter = 'dispo'; }   // Startansicht der Dispo (und der Buchhaltung)
      return S.id ? ladeDetail() : ladeListe();
    });
  });
  document.addEventListener('eg-bereit', function () { if (meineRolle() === 'dispo' || meineRolle() === 'admin') swStart(); });
  window.VK_AKTE_AKTUELL = function () { return S.id; };   // für VK_DU.springe
  // Unterlagen hochgeladen oder gelöscht (verkauf-unterlagen.js): Stand der Punkte in der offenen Akte neu rechnen
  document.addEventListener('vk-dokumente-geaendert', function (ev) {
    var id = ev && ev.detail && ev.detail.akteId;
    if (!id || S.id !== id || !S.akte || !S.pm) return;
    dokumenteLaden([S.akte]).then(function (m) { dokInPm(S.pm, m[id]); aktualisiere(true); }).catch(function (e) { console.warn('Unterlagen neu rechnen:', e && e.message); });
  });
  window.VK_AKTE_OEFFNEN = function (id) { S.id = id; S.geoeffnetFuer = null; EG.zeigeTab('verkauf'); };
  window.VK_AKTE_ANLEGEN = async function (vb) {
    vb = vb || {};
    if (!erlaubtAnlegen()) { EG.toast('Verkaufsakten legen Verkauf, Dispo und Oli an.', 'fehler'); return null; }
    var vorh = await findeBestehende(vb);
    if (vorh) { EG.toast('Für diesen Fall gibt es schon eine Verkaufsakte. Sie wird geöffnet.'); window.VK_AKTE_OEFFNEN(vorh); return vorh; }
    // Kunden-Abgleich (VA7, window.VK_KUNDE): ohne übergebene kunde_id vorher fragen. Ergebnis: kunde_id | null (neuer Kunde / kein Abgleich) | undefined (Abbruch)
    if (!vb.kunde_id && window.VK_KUNDE && typeof window.VK_KUNDE.waehle === 'function') {
      var kw;
      try { kw = await window.VK_KUNDE.waehle(vb); } catch (e) { console.warn('VK_KUNDE.waehle:', e && e.message); kw = null; }
      if (kw === undefined) return null;   // Abbruch → Anlegen abbrechen
      vb = Object.assign({}, vb, { kunde_id: kw || null });
    }
    var id = await akteDialog(vb, null);
    if (id) window.VK_AKTE_OEFFNEN(id);
    return id;
  };
  async function findeBestehende(vb) {
    var feld = vb.ml_ref ? ['ml_ref', vb.ml_ref] : vb.lead_ref ? ['lead_ref', vb.lead_ref] : null;
    if (!feld) return null;
    var r = chk(await T.akte().select('id').eq(feld[0], String(feld[1])).limit(1));
    return r.data && r.data[0] ? r.data[0].id : null;
  }

  /* ====================================================================
     LISTE
     ==================================================================== */
  async function ladeListe() {
    S.id = null; S.akte = null;
    S.root.innerHTML = '';
    S.root.appendChild(h('p', { class: 'muted', text: 'Lade Verkaufsakten …' }));
    var r = chk(await T.akte().select('*').order('created_at', { ascending: false }));
    S.akten = r.data || [];
    // Punkte nur für offene Akten, in kleinen Gruppen (die Data API liefert höchstens 1000 Zeilen je Abfrage)
    var offene = S.akten.filter(istOffen);
    var ids = offene.map(function (a) { return a.id; }), teile = [];
    for (var i = 0; i < ids.length; i += 5) teile.push(ids.slice(i, i + 5));
    var x = await Promise.all([
      Promise.all(teile.map(function (t) { return T.punkt().select('*').in('akte_id', t); })),
      T.frei().select('*'),
      ladeAc(offene.map(function (a) { return a.interne_nr; })),   // Auslieferungs-Checkliste je interne Nr.
      ladeBestand(offene),
      dokumenteLaden(offene)   // PDFs in den Unterlagen (Quelle für Punkt 45/65)
    ]);
    var fr = chk(x[1]), acAlle = x[2], dokAlle = x[4];
    S.pmAlle = {}; S.freiAlle = {}; S.listCalc = {}; S.kxAlle = x[3];
    x[0].forEach(function (res) {
      chk(res);
      (res.data || []).forEach(function (row) {
        if (istAcZeile(row)) return;
        var m = (S.pmAlle[row.akte_id] = S.pmAlle[row.akte_id] || {}); (m[row.phase] = m[row.phase] || {})[row.punkt_key] = row;
      });
    });
    (fr.data || []).forEach(function (f) { (S.freiAlle[f.akte_id] = S.freiAlle[f.akte_id] || []).push(f); });
    offene.forEach(function (a) {
      var pm = S.pmAlle[a.id] = S.pmAlle[a.id] || {};
      pm.ac = a.interne_nr ? (acAlle[a.interne_nr] || {}) : {};
      dokInPm(pm, dokAlle[a.id]);
      S.listCalc[a.id] = berechne(a, pm, S.freiAlle[a.id] || [], S.kxAlle[a.id]);
    });
    zeichneListe();
  }

  /** Für den Reiter Übersicht (A4, VA6): alle laufenden Akten mit Ampel-Berechnung – dieselbe Rechnung wie die Liste hier (eine Quelle: VK_AMPEL).
      opts.filter(akte) → bool wählt die Akten VOR dem Laden der Haken (z. B. Verkäufer = ich). Ändert keinen Zustand des Reiters Verkauf.
      → Promise<[{ akte, calc, kx, frei }]>   (calc = Ergebnis von berechne(): calc.nach[key].ampel, calc.fehlt …) */
  window.VK_BERECHNUNG = {
    ladeAlle: async function (opts) {
      opts = opts || {};
      var r = chk(await T.akte().select('*').order('created_at', { ascending: false }));
      var offene = (r.data || []).filter(istOffen).filter(function (a) { return !opts.filter || opts.filter(a); });
      var ids = offene.map(function (a) { return a.id; }), teile = [];
      for (var i = 0; i < ids.length; i += 5) teile.push(ids.slice(i, i + 5));
      var x = await Promise.all([
        Promise.all(teile.map(function (t) { return T.punkt().select('*').in('akte_id', t); })),
        T.frei().select('*'),
        ladeAc(offene.map(function (a) { return a.interne_nr; })),
        ladeBestand(offene),
        dokumenteLaden(offene)
      ]);
      var pmA = {}, frA = {};
      x[0].forEach(function (res) {
        chk(res);
        (res.data || []).forEach(function (row) {
          if (istAcZeile(row)) return;
          var m = (pmA[row.akte_id] = pmA[row.akte_id] || {}); (m[row.phase] = m[row.phase] || {})[row.punkt_key] = row;
        });
      });
      (chk(x[1]).data || []).forEach(function (f) { (frA[f.akte_id] = frA[f.akte_id] || []).push(f); });
      return offene.map(function (a) {
        var pm = pmA[a.id] = pmA[a.id] || {};
        pm.ac = a.interne_nr ? (x[2][a.interne_nr] || {}) : {};
        dokInPm(pm, x[4][a.id]);
        return { akte: a, calc: berechne(a, pm, frA[a.id] || [], x[3][a.id]), kx: x[3][a.id] || {}, frei: frA[a.id] || [] };
      });
    }
  };

  function passtSuche(a) {
    var q = S.suche.trim().toLowerCase(); if (!q) return true;
    return [a.hersteller, a.modell, a.kunde_name, a.interne_nr, a.autrado_nr, a.fin, a.bestell_nr, a.verkaeufer, a.farbe].join(' ').toLowerCase().indexOf(q) >= 0;
  }
  /** Für die Dispo offen: Verkauf ist freigegeben (Phase 5), und Zahlung, Aufbereitung, Zulassung oder Freigabe Auslieferung sind noch nicht grün.
      → { rest:[info], frei, vertretung } | null.   Zählt der Haken der Freigabe, nicht phase_aktuell: nachgetragene Akten stehen dort oft noch auf einer frühen Phase. */
  function dispoStand(a) {
    var c = S.listCalc[a.id];
    if (!c || !istOffen(a)) return null;
    var p05 = c.nach.p05, fr = p05.punkte[0];
    if (!fr || fr.st !== 'ok') return null;
    var rest = ['p06', 'p07', 'p08', 'p09'].map(function (k) { return c.nach[k]; }).filter(function (i) { return !i.gruen; });
    if (!rest.length) return null;
    var f = findeFrei(S.freiAlle[a.id], 'verkauf') || findeFrei(S.freiAlle[a.id], 'akte_frei', 'v6');
    return { rest: rest, frei: f };
  }
  function istDispoOffen(a) { return !!dispoStand(a); }
  function phasenStand(p) { return p.def.name + (p.gruen ? ' fertig' : ' ' + p.pflichtErledigt + ' von ' + p.pflichtGesamt); }

  /* ---------- Benachrichtigungen im Reiter (Rolle dispo; der Reiter „Anfragen“ fehlt ihr) ---------- */
  async function meldungApi(aktion, body) {
    var r = await EG.sb.functions.invoke('verkauf_meldung', { body: Object.assign({ aktion: aktion }, body || {}) });
    if (r.error) {
      var msg = r.error.message || 'Fehler', ctx = r.error.context;
      if (ctx && typeof ctx.json === 'function') { try { var j = await ctx.json(); if (j && j.fehler) msg = j.fehler; } catch (e) { /* Text bleibt */ } }
      throw new Error(msg);
    }
    return r.data || {};
  }
  function swStart() {
    if (S.swDa || EG.demo || !('serviceWorker' in navigator)) return;
    S.swDa = true;
    navigator.serviceWorker.register('sw.js').catch(function () { /* sw.js fehlt: nur kein Push */ });
    navigator.serviceWorker.addEventListener('message', function (ev) {
      var d = ev.data || {};
      if (d.typ === 'akte-neu' && S.root && !S.id) ladeListe().catch(EG.fehler);
      if (d.typ === 'akte-oeffnen') { var m = /id=([0-9a-f-]{36})/i.exec(d.url || ''); if (m) window.VK_AKTE_OEFFNEN(m[1]); else EG.zeigeTab('verkauf'); }
    });
  }
  function pushKasten() {
    var box = h('div', { class: 'vk-push' });
    function zeige(inhalt, art) { box.replaceChildren(EG.banner(inhalt, art)); }
    function stand() {
      var me = S.pushMe; if (!me) return;
      if (me.push_abos > 0) zeige(['Benachrichtigungen sind auf diesem Konto eingeschaltet (' + me.push_abos + ' Gerät/e). ', h('button', { type: 'button', class: 'linklike', text: 'Testnachricht senden', onclick: testen })], 'ok');
      else zeige(['Neue Freigaben kommen bisher nur per Mail. ', h('button', { type: 'button', class: 'linklike', text: 'Benachrichtigungen einschalten', onclick: einschalten })], 'warn');
    }
    async function testen() {
      try { var r = await meldungApi('push_test'); zeige(r.gesendet ? 'Testnachricht ist unterwegs.' : 'Kein Gerät erreicht.', r.gesendet ? 'ok' : 'fehler'); }
      catch (e) { zeige(e.message, 'fehler'); }
    }
    async function einschalten() {
      var P = window.LD_PUSH;
      try {
        if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
          zeige(P.istIos() ? 'Auf dem iPhone geht das nur mit der App auf dem Home-Bildschirm (Teilen → „Zum Home-Bildschirm“).' : 'Dieser Browser unterstützt keine Benachrichtigungen.', 'fehler'); return;
        }
        if (P.istIos() && !P.istInstalliert()) { zeige('Auf dem iPhone zuerst „Teilen“ → „Zum Home-Bildschirm“, dann von dort öffnen.', 'fehler'); return; }
        if (!S.pushMe.vapid_public) { zeige('Die Benachrichtigung ist serverseitig noch nicht eingerichtet.', 'fehler'); return; }
        if (await Notification.requestPermission() !== 'granted') { zeige('Benachrichtigungen wurden im Browser nicht erlaubt.', 'fehler'); return; }
        var reg = await P.swBereit(), sub = await reg.pushManager.getSubscription();
        if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: P.b64uZuBytes(S.pushMe.vapid_public) });
        var j = sub.toJSON();
        await meldungApi('push_abo', { endpoint: j.endpoint, p256dh: j.keys.p256dh, auth: j.keys.auth });
        S.pushMe.push_abos = Math.max(1, S.pushMe.push_abos || 0);
        EG.toast('Benachrichtigungen sind eingeschaltet.', 'ok');
        stand();
      } catch (e) { zeige(e.message || String(e), 'fehler'); }
    }
    if (EG.demo) { zeige('Demo: Hier schaltet die Dispo die Benachrichtigungen ein.', 'info'); return box; }
    if (S.pushMe) stand();
    else meldungApi('me').then(function (me) { S.pushMe = me; stand(); }).catch(function (e) { zeige(e.message, 'fehler'); });
    return box;
  }

  function zeichneListe() {
    S.root.innerHTML = '';
    var suchFeld = h('input', { type: 'search', id: 'vk-suche', placeholder: 'Suchen: Kunde, Fahrzeug, Nr., FIN …', value: S.suche, 'aria-label': 'Suche' });
    suchFeld.addEventListener('input', function () { S.suche = suchFeld.value; fuelleListe(); });
    var chipLeiste = h('div', { class: 'chips' });
    function chips() {
      chipLeiste.innerHTML = '';
      [['offen', 'Offen', istOffen], ['dispo', 'Für Dispo offen', istDispoOffen], ['abgeschlossen', 'Abgeschlossen', function (a) { return !istOffen(a); }], ['alle', 'Alle', null]].forEach(function (c) {
        var n = S.akten.filter(function (a) { return !c[2] || c[2](a); }).length;
        chipLeiste.appendChild(h('button', {
          type: 'button', class: 'chip', 'aria-pressed': S.filter === c[0] ? 'true' : 'false', text: c[1] + ' (' + n + ')',
          onclick: function () { S.filter = c[0]; chips(); fuelleListe(); }
        }));
      });
    }
    chips();
    var zeile2 = h('div', { class: 'leiste-zeile' },
      h('button', { type: 'button', class: 'btn btn-ghost', text: 'Liste aktualisieren', onclick: function () { ladeListe().catch(EG.fehler); } }),
      erlaubtAnlegen() ? h('button', { type: 'button', class: 'btn btn-primary', text: 'Neue Verkaufsakte', onclick: function () { neueAkte().catch(EG.fehler); } }) : null,
      erlaubtAnlegen() ? h('button', { type: 'button', class: 'btn btn-ghost', text: 'Akte nachtragen', title: 'Für einen Verkauf, der schon passiert ist', onclick: function () { neueAkte({ nachtrag: true }).catch(EG.fehler); } }) : null);
    if (meineRolle() === 'dispo') S.root.appendChild(pushKasten());
    S.root.appendChild(h('div', { class: 'leiste' }, h('div', { class: 'leiste-zeile' }, suchFeld), zeile2, chipLeiste));
    S.sp = S.sp || { f: {}, sort: null };   // Spaltenfilter und Sortierung bleiben beim Neuzeichnen erhalten
    S.listenBox = h('div', { role: 'list' });
    S.root.appendChild(h('div', { class: 'ac-tabelle' }, EG.zeilenKopf('vz-zeile', SPALTEN, S.sp, fuelleListe, S.akten), S.listenBox));
    fuelleListe();
  }
  /** Spalten der Zeilenansicht (Kopf mit Sortierung und Filter: EG.zeilenKopf). Auf dem Handy bleiben Fahrzeug/Kunde (mit Kurzzeilen), Stand und Phasen-Punkte.
      „Stand“ als Textfilter, weil er in der Ansicht „Für Dispo offen“ anders lautet. */
  var SPALTEN = [
    { t: 'Übergabe', c: 'vz-c-ueb', w: function (a) { return a.uebergabe_termin ? EG.fmtDatum(a.uebergabe_termin) : ''; }, s: function (a) { return a.uebergabe_termin || ''; }, ph: 'z.B. 14.11' },
    { t: 'Nr.', c: 'vz-c-nr', w: function (a) { return a.interne_nr || ''; }, ph: 'Nr.' },
    { t: 'Fahrzeug', c: 'vz-c-fz', w: function (a) { return akteTitel(a) + (a.autrado_nr ? ' Autrado ' + a.autrado_nr : ''); }, s: akteTitel, ph: 'Marke/Modell' },
    { t: 'FIN', c: 'vz-c-fin', w: function (a) { return a.fin || ''; }, ph: 'FIN' },
    { t: 'Kunde', c: 'vz-c-kunde', w: function (a) { return a.kunde_name || ''; }, ph: 'Name' },
    { t: 'Verk.', c: 'vz-c-verk', w: function (a) { return a.verkaeufer || ''; }, wahl: true },
    { t: 'Phasen', c: 'vz-c-dots', aus: true },
    { t: 'Stand', c: 'vz-c-stand', w: function (a) { var x = standVon(a); return x.aktText + (x.zeilePhase ? ' ' + x.zeilePhase : ''); }, s: function (a) { return standVon(a).aktText; }, ph: 'z.B. Zahlung' }
  ];
  function fuelleListe() {
    var box = S.listenBox; box.innerHTML = '';
    var l = S.akten.filter(function (a) {
      if (!passtSuche(a)) return false;
      if (S.filter === 'dispo') return istDispoOffen(a);
      return S.filter === 'alle' || (S.filter === 'offen' ? istOffen(a) : !istOffen(a));
    });
    l.sort(function (a, b) {
      var oa = istOffen(a), ob = istOffen(b);
      if (oa !== ob) return oa ? -1 : 1;
      if (oa) { var x = a.uebergabe_termin || '9999-12-31', y = b.uebergabe_termin || '9999-12-31'; return x < y ? -1 : x > y ? 1 : 0; }
      var u = a.updated_at || '', v = b.updated_at || ''; return u < v ? 1 : u > v ? -1 : 0;
    });
    l = EG.zeilenFiltern(l, SPALTEN, S.sp);
    if (!l.length) { box.appendChild(h('div', { class: 'leer', text: S.filter === 'dispo' ? 'Gerade keine freigegebene Akte offen.' : S.akten.length ? 'Keine Akten in dieser Ansicht.' : 'Noch keine Verkaufsakte. Lege mit „Neue Verkaufsakte“ die erste an.' })); return; }
    l.forEach(function (a) { box.appendChild(akteZeile(a)); });
  }
  function ampelZeile(phasen) {
    var wrap = h('div', { class: 'vk-dots', role: 'list' });
    phasen.forEach(function (p) {
      wrap.appendChild(h('span', { class: 'vk-dot ' + p.ampel, role: 'listitem', title: p.name + ': ' + p.text, 'aria-label': p.name + ': ' + p.text }));
    });
    return wrap;
  }
  /** Stand einer Akte für Zeile, Filter und Sortierung → { phasen, aktText, aktArt, zeilePhase, rot, vorZahlung } */
  function standVon(a) {
    var c = S.listCalc[a.id], phasen, aktText, aktArt = 'grau', zeilePhase = '', rot = false, vorZahlung = false;
    if (!istOffen(a)) {
      var abg = a.phase_aktuell === 'abgebrochen';
      phasen = PHASEN_ANZ.map(function (p) { return { name: p.name, ampel: abg ? 'grau' : 'gruen', text: abg ? 'abgebrochen' : 'fertig' }; });
      aktText = abg ? 'Abgebrochen' : 'Abgeschlossen'; aktArt = abg ? 'grau' : 'gruen';
    } else {
      phasen = PHASEN_ANZ.map(function (ph) { var p = c.nach[ph.key]; return { name: p.def.name, ampel: p.ampel, text: p.phaseEntfaellt ? 'entfällt' : AMPEL_TEXT[p.ampel].toLowerCase() }; });
      var cur = c.aktuellIdx >= 0 ? c.nach[PHASEN_ANZ[c.aktuellIdx].key] : null;
      aktText = cur ? cur.def.name : 'Alles grün'; aktArt = cur ? AMPEL_PILL[cur.ampel] : 'gruen';
      if (cur) zeilePhase = 'Jetzt: ' + cur.def.name + ' – ' + cur.pflichtErledigt + ' von ' + cur.pflichtGesamt + ' Pflichtpunkten erledigt' + (cur.rotGrund ? ' (' + cur.rotGrund + ')' : '');
      rot = PHASEN_ANZ.some(function (ph) { return c.nach[ph.key].ampel === 'rot'; });
      var ds = S.filter === 'dispo' ? dispoStand(a) : null;
      if (ds) {   // Ansicht der Dispo: Stand von Zahlung, Aufbereitung, Zulassung, Freigabe Auslieferung statt der frühesten offenen Phase
        var dran = ds.rest[0];
        aktText = dran.def.name; aktArt = AMPEL_PILL[dran.ampel];
        zeilePhase = [ds.frei ? 'Freigegeben am ' + EG.fmtDatum(ds.frei.am) + (ds.frei.vertretung ? ' (in Vertretung)' : '') : ''].concat(ds.rest.map(phasenStand)).filter(Boolean).join(' · ');
      }
      vorZahlung = !!uebergabeVorZahlung(S.freiAlle[a.id], S.kxAlle[a.id]);
      if (vorZahlung) rot = true;
    }
    return { phasen: phasen, aktText: aktText, aktArt: aktArt, zeilePhase: zeilePhase, rot: rot, vorZahlung: vorZahlung };
  }
  /** Eine Verkaufsakte = eine Zeile. Tippen öffnet die Akte. */
  function akteZeile(a) {
    var sv = standVon(a), phasen = sv.phasen, aktText = sv.aktText, aktArt = sv.aktArt, zeilePhase = sv.zeilePhase, rot = sv.rot;
    var ueber = istOffen(a) && a.uebergabe_termin && a.uebergabe_termin < EG.heute();
    var ueb = a.uebergabe_termin ? EG.fmtDatum(a.uebergabe_termin) : '';
    var nrText = [a.interne_nr ? 'Nr. ' + a.interne_nr : '', a.autrado_nr ? 'Autrado ' + a.autrado_nr : ''].filter(Boolean).join(' · ');
    var dots = ampelZeile(phasen); dots.classList.add('vz-dots');
    return h('button', {
      type: 'button', role: 'listitem', class: 'ac-zeile vz-zeile' + (rot ? ' rot' : '') + (istOffen(a) ? '' : ' fertig'),
      title: zeilePhase || aktText,
      'aria-label': akteTitel(a) + ', ' + (a.kunde_name || 'Kunde fehlt') + (a.interne_nr ? ', Nr. ' + a.interne_nr : '') + ', ' + (zeilePhase || aktText) + (ueb ? ', Übergabe ' + ueb + (ueber ? ' überschritten' : '') : '') + (sv.vorZahlung ? ', Übergabe vor voller Zahlung' : ''),
      onclick: function () { oeffne(a.id).catch(EG.fehler); }
    },
      h('span', { class: 'vz-c-ueb' + (ueber ? ' rot-text fett' : ueb ? '' : ' muted'), text: ueb ? ueb + (ueber ? ' (überschritten)' : '') : '–' }),
      h('span', { class: 'vz-c-nr' + (a.interne_nr ? '' : ' muted'), text: a.interne_nr || '–' }),
      h('span', { class: 'vz-c-fz' }, h('strong', { text: akteTitel(a) }),
        a.autrado_nr ? h('span', { class: 'vz-sub vz-nur-pc', text: 'Autrado ' + a.autrado_nr }) : null,
        h('span', { class: 'ac-nur-handy vz-handy fz-fin' + (a.fin ? '' : ' muted'), text: 'FIN ' + (a.fin || '–') }),
        h('span', { class: 'ac-nur-handy vz-handy fett', text: a.kunde_name || 'Kunde fehlt' }),
        h('span', { class: 'ac-nur-handy vz-handy muted', text: [nrText, a.verkaeufer, ueb ? 'Übergabe ' + ueb : ''].filter(Boolean).join(' · ') }),
        ueber ? h('span', { class: 'ac-nur-handy vz-handy rot-text fett', text: 'Übergabe überschritten' }) : null),
      h('span', { class: 'vz-c-fin fz-fin' + (a.fin ? '' : ' muted'), text: a.fin || '–' }),
      h('span', { class: 'vz-c-kunde' + (a.kunde_name ? ' fett' : ' muted'), text: a.kunde_name || 'Kunde fehlt' }),
      h('span', { class: 'vz-c-verk' + (a.verkaeufer ? '' : ' muted'), text: a.verkaeufer || '–' }),
      h('span', { class: 'vz-c-dots' }, dots),
      h('span', { class: 'vz-c-stand' }, EG.pill(aktText, aktArt),
        sv.vorZahlung ? EG.pill('Übergabe vor voller Zahlung', 'rot') : null,
        zeilePhase ? h('span', { class: 'vz-sub', text: zeilePhase.replace(/^Jetzt: [^–]+– /, '') }) : null));
  }

  async function neueAkte(vb) {
    var id = await akteDialog(vb || {}, null);
    if (id) await oeffne(id);
  }

  /* ---------- Akte anlegen / Daten ändern ---------- */
  /** Dialog Neue Akte (vorhanden=null) oder Daten ändern (vorhanden=Akte). → Promise<akte_id | null>
      Verkäufer: beim Anlegen darf ihn jeder setzen (Verkauf muss ihn sogar wählen), danach ändern nur OS, Dispo, Buchhaltung. */
  async function akteDialog(vb, vorhanden) {
    var v = vorhanden || vb || {};
    var verkErlaubt = !vorhanden || istBuero();
    var F = {
      interne: h('input', { type: 'text', id: 'vk-f-nr', value: v.interne_nr || '', autocomplete: 'off', inputmode: 'numeric' }),
      autrado: h('input', { type: 'text', id: 'vk-f-autrado', value: v.autrado_nr || '', autocomplete: 'off', inputmode: 'numeric' }),
      hersteller: h('input', { type: 'text', id: 'vk-f-herst', value: v.hersteller || '', placeholder: 'z. B. Hyundai' }),
      modell: h('input', { type: 'text', id: 'vk-f-modell', value: v.modell || '', placeholder: 'z. B. Tucson 1.6 T-GDI' }),
      farbe: h('input', { type: 'text', id: 'vk-f-farbe', value: v.farbe || '' }),
      fin: h('input', { type: 'text', id: 'vk-f-fin', value: v.fin || '', maxLength: 17, autocapitalize: 'characters', placeholder: '17 Stellen (optional)' }),
      kunde: h('input', { type: 'text', id: 'vk-f-kunde', value: v.kunde_name || '', placeholder: 'Nachname, Vorname oder Firma', autocomplete: 'off' }),
      tel: h('input', { type: 'text', id: 'vk-f-tel', value: v.kunde_telefon || '', inputmode: 'tel', autocomplete: 'off' }),
      mail: h('input', { type: 'email', id: 'vk-f-mail', value: v.kunde_email || '', autocomplete: 'off' }),
      verk: h('select', { id: 'vk-f-verk', disabled: !verkErlaubt }, h('option', { value: '', text: '– noch offen –' }), VERKAEUFER.map(function (k) { return h('option', { value: k, text: k }); })),
      termin: h('input', { type: 'date', id: 'vk-f-termin', value: v.uebergabe_termin || '' }),
      bestell: h('input', { type: 'text', id: 'vk-f-bestell', value: v.bestell_nr || '', placeholder: 'z. B. 2610-12345' }),
      zubehoer: h('textarea', { id: 'vk-f-zubehoer', value: v.zubehoer || '', placeholder: 'z. B. Winterräder, Fußmatten, Anhängerkupplung (leer lassen, wenn es kein Zubehör gibt)', style: 'min-height:64px' }),
      nachtrag: h('input', { type: 'checkbox', id: 'vk-f-nachtrag' })
    };
    F.nachtrag.checked = !!v.nachtrag;
    F.verk.value = VERKAEUFER.indexOf(v.verkaeufer) >= 0 ? v.verkaeufer : '';
    var inhalt = h('div', {},
      vorhanden ? null : h('p', { class: 'muted klein', style: 'margin-bottom:10px', text: 'Mit der internen Nr. findest du die Akte später in der Suche. Alles andere kannst du in der Akte nachtragen.' }),
      h('div', { class: 'zeile2' }, EG.feld('Interne Nr.', F.interne), EG.feld('Autrado-Nr.', F.autrado)),
      h('div', { class: 'zeile2' }, EG.feld('Hersteller', F.hersteller), EG.feld('Modell *', F.modell)),
      h('div', { class: 'zeile2' }, EG.feld('Farbe', F.farbe), EG.feld('FIN', F.fin)),
      EG.feld('Kunde *', F.kunde),
      h('div', { class: 'zeile2' }, EG.feld('Telefon', F.tel), EG.feld('E-Mail', F.mail)),
      h('div', { class: 'zeile2' }, EG.feld(verkErlaubt ? 'Verkäufer' : 'Verkäufer (nur OS, Dispo, Buchhaltung ändern)', F.verk), EG.feld('Übergabetermin', F.termin)),
      !vorhanden && meineRolle() === 'verkauf' ? h('p', { class: 'muted klein', style: 'margin:-4px 0 8px', text: 'Bitte jetzt den Verkäufer wählen: Danach können ihn nur OS, Dispo und Buchhaltung ändern (Provision).' }) : null,
      EG.feld('Bestell-Nr.', F.bestell),
      EG.feld('Zubehör (Feld Zubehör)', F.zubehoer),
      h('label', { class: 'vk-nachtrag-wahl', style: 'display:flex;gap:10px;align-items:flex-start;margin-top:10px;cursor:pointer' }, F.nachtrag,
        h('span', {}, h('strong', { text: 'Akte nachtragen' }), h('br'),
          h('span', { class: 'muted klein', text: 'Der Verkauf ist schon passiert. Die Phasen müssen nicht der Reihe nach grün sein. Die Freigabe Auslieferung bleibt gesperrt, bis voll bezahlt ist.' }))));
    var neu = { id: null };
    var wert = await EG.dialog({
      titel: vorhanden ? 'Daten ändern' : (v.nachtrag ? 'Akte nachtragen' : 'Neue Verkaufsakte'), inhalt: inhalt, breit: true,
      knoepfe: [{ text: 'Abbrechen', art: 'ghost', wert: null }, {
        text: vorhanden ? 'Speichern' : 'Akte anlegen', art: 'primary', wert: 'ok',
        aktion: async function () {
          var fin = F.fin.value.trim().toUpperCase(), nr = F.interne.value.trim();
          if (!F.modell.value.trim()) return 'Bitte das Fahrzeug (Modell) eintragen.';
          if (!F.kunde.value.trim()) return 'Bitte den Kunden eintragen.';
          if (fin && fin.length !== 17) return 'Die FIN hat 17 Stellen (oder leer lassen).';
          if (!vorhanden && meineRolle() === 'verkauf' && !F.verk.value) return 'Bitte den Verkäufer wählen (später ändern ihn nur OS, Dispo und Buchhaltung).';
          var felder = {
            interne_nr: nr || null, autrado_nr: F.autrado.value.trim() || null, hersteller: F.hersteller.value.trim() || null, modell: F.modell.value.trim(),
            farbe: F.farbe.value.trim() || null, fin: fin || null, kunde_name: F.kunde.value.trim(), kunde_telefon: F.tel.value.trim() || null,
            kunde_email: F.mail.value.trim() || null, uebergabe_termin: F.termin.value || null, bestell_nr: F.bestell.value.trim() || null,
            zubehoer: F.zubehoer.value.trim() || null, nachtrag: !!F.nachtrag.checked
          };
          if (verkErlaubt) felder.verkaeufer = F.verk.value || null;   // Verkäufer nur senden, wenn die Rolle ihn setzen darf (Datenbank-Sperre)
          if (vb && vb.fahrzeug_id && !vorhanden) felder.fahrzeug_id = vb.fahrzeug_id;
          if (!vorhanden && vb) {
            if (vb.kunde_id) felder.kunde_id = vb.kunde_id;
            if (vb.herkunft_anfrage) felder.herkunft_anfrage = String(vb.herkunft_anfrage);
            if (vb.nachricht && !felder.notiz) felder.notiz = String(vb.nachricht);
          }
          if (vorhanden) {
            felder.updated_at = jetzt();
            var u = chk(await T.akte().update(felder).eq('id', vorhanden.id).select().single());
            neu.id = u.data.id; return true;
          }
          if (nr) {
            var dup = chk(await T.akte().select('id,kunde_name').eq('interne_nr', nr).limit(1));
            if (dup.data && dup.data[0]) {
              var wahl = await EG.dialog({
                titel: 'Es gibt schon eine Akte', inhalt: h('p', { text: 'Zur Nr. ' + nr + ' gibt es schon eine Verkaufsakte (' + (dup.data[0].kunde_name || 'ohne Kunde') + ').' }),
                knoepfe: [{ text: 'Abbrechen', art: 'ghost', wert: null }, { text: 'Trotzdem neue Akte', art: 'ghost', wert: 'neu' }, { text: 'Bestehende öffnen', art: 'primary', wert: 'alt' }]
              });
              if (wahl === 'alt') { neu.id = dup.data[0].id; return true; }
              if (wahl !== 'neu') return false;
            }
          }
          var rec = Object.assign({
            ml_ref: vb.ml_ref ? String(vb.ml_ref) : null, lead_ref: vb.lead_ref ? String(vb.lead_ref) : null, job_nr: vb.job_nr || null,
            phase_aktuell: 'p01', erstellt_von_name: meinName()
          }, felder);
          var r = chk(await T.akte().insert(rec).select().single());
          neu.id = r.data.id;
          // bekannte Angaben gleich als erledigt eintragen (Speicher-Schlüssel der Phase „Anfrage“)
          var name = meinName();
          if (vb.kanal) await punktRoh(neu.id, 'v1', 'anfrage_da', { status: 'ok', wert: { auswahl: vb.kanal }, name: name });
          if (felder.verkaeufer) await punktRoh(neu.id, 'v1', 'verkaeufer_zugeteilt', { status: 'ok', wert: { auswahl: felder.verkaeufer }, name: name });
          return true;
        }
      }]
    });
    return wert === 'ok' ? neu.id : null;
  }

  /** Schreibt einen Punkt ohne Zustand der Detailansicht (für Anlegen). */
  async function punktRoh(akteId, phase, key, f) {
    var data = {
      akte_id: akteId, phase: phase, punkt_key: key, status: f.status || 'offen', wert: f.wert || null, grund: f.grund || null, fotos: f.fotos || [],
      erledigt_von_name: f.status && f.status !== 'offen' ? f.name || null : null, erledigt_am: f.status && f.status !== 'offen' ? jetzt() : null, updated_at: jetzt()
    };
    var r = chk(await T.punkt().upsert(data, { onConflict: 'akte_id,phase,punkt_key' }).select().single());
    return r.data;
  }

  /* ====================================================================
     DETAIL
     ==================================================================== */
  async function oeffne(id) { S.id = id; S.geoeffnetFuer = null; await ladeDetail(); window.scrollTo(0, 0); }
  async function ladeDetail() {
    var x = await Promise.all([
      T.akte().select('*').eq('id', S.id).single(),
      T.punkt().select('*').eq('akte_id', S.id),
      T.frei().select('*').eq('akte_id', S.id).order('am', { ascending: true }),
      ladeUmfragen(S.id)
    ]);
    if (x[0].error || !x[0].data) { EG.toast('Akte nicht gefunden.', 'fehler'); S.id = null; return ladeListe(); }
    chk(x[1]); chk(x[2]);
    S.akte = x[0].data; S.pm = zuMap(x[1].data); S.frei = x[2].data || []; S.umfragen = x[3]; S.trCache = {};
    // Auslieferungs-Checkliste: eigene Tabelle, Schlüssel = interne Nr. der Akte; dazu Zahlungsstand, Transport, Fehlteile
    var nr = S.akte.interne_nr;
    var y = await Promise.all([nr ? ladeAc([nr]) : Promise.resolve({}), ladeBestand([S.akte]), dokumenteLaden([S.akte])]);
    S.pm.ac = nr ? (y[0][nr] || {}) : {};
    dokInPm(S.pm, y[2][S.akte.id]);
    S.kx = y[1][S.akte.id] || {};
    neuBerechnen();
    if (S.geoeffnetFuer !== S.id) {   // beim ersten Öffnen: aktuelle Phase aufklappen
      S.geoeffnetFuer = S.id; S.offen = {}; S.fehltOffen = {};
      if (S.calc.aktuellIdx >= 0) S.offen[S.calc.aktuell] = true;
    }
    zeichneDetail();
  }
  /** Umfrage-Antworten der Akte: nur OS (admin) darf die Tabelle lesen; für alle anderen leer. Fehlt die Spalte „gesehen“ (SQL noch nicht eingespielt), bleibt die Liste leer. */
  async function ladeUmfragen(akteId) {
    if (meineRolle() !== 'admin') return [];
    try {
      var r = await T.umfrage().select('id,beantwortet_am,note_gesamt,gesehen_am,gesehen_von_name').eq('akte_id', akteId);
      if (r.error) { console.warn('Umfragen:', r.error.message); return []; }
      return (r.data || []).filter(function (u) { return u.beantwortet_am; });
    } catch (e) { console.warn('Umfragen:', e && e.message); return []; }
  }
  /** OS quittiert einen roten Cockpit-Punkt (art: 'freigabe' | 'umfrage'). Echt über verkauf.rot_gesehen (nur admin), Demo direkt in der Demo-Tabelle. */
  async function gesehenSetzen(art, id) {
    if (EG.demo) {
      var tabelle = art === 'freigabe' ? T.frei() : T.umfrage();
      chk(await tabelle.update({ gesehen_am: jetzt(), gesehen_von_name: meinName() }).eq('id', id));
    } else {
      chk(await EG.sb.schema('verkauf').rpc('rot_gesehen', { art: art, id: id }));
    }
    EG.toast('Als gesehen vermerkt. Der Punkt verschwindet aus dem Cockpit.', 'ok');
    await ladeDetail();
  }
  function gesehenZeile(zeile, art) {
    if (zeile.gesehen_am) return h('div', { class: 'klein muted', style: 'margin-top:6px', text: 'Gesehen' + (zeile.gesehen_von_name ? ' von ' + zeile.gesehen_von_name : '') + ' am ' + EG.fmtZeit(zeile.gesehen_am) + '. Nicht mehr im Cockpit.' });
    return h('div', { style: 'margin-top:6px' },
      h('button', { type: 'button', class: 'btn btn-ghost btn-klein', text: 'Gesehen', title: 'Nimmt den roten Punkt aus dem Cockpit (nur OS)',
        onclick: function () { gesehenSetzen(art, zeile.id).catch(EG.fehler); } }));
  }
  /** Schlechte Umfrage (Gesamtnote 1–2) für OS in Phase 10 – nur sichtbar, wenn es eine gibt. */
  function umfrageBlock() {
    var schlecht = (S.umfragen || []).filter(function (u) { return u.note_gesamt != null && u.note_gesamt <= 2; });
    if (!schlecht.length || meineRolle() !== 'admin') return null;
    var box = h('div', { class: 'punkt vk-punkt vk-nok', id: 'vk-umfrage-schlecht' });
    box.appendChild(h('div', { class: 'punkt-titel', text: 'Umfrage: schlechte Bewertung' }));
    schlecht.forEach(function (u) {
      box.appendChild(h('div', { class: 'klein', text: 'Gesamtnote ' + u.note_gesamt + ' von 5, beantwortet am ' + EG.fmtDatum(u.beantwortet_am) + '.' + (u.gesehen_am ? '' : ' Steht im Cockpit, bis du sie als gesehen vermerkst.') }));
      box.appendChild(gesehenZeile(u, 'umfrage'));
    });
    return box;
  }
  function neuBerechnen() { S.calc = berechne(S.akte, S.pm, S.frei, S.kx); }
  function zurListe() { S.id = null; ladeListe().catch(EG.fehler); window.scrollTo(0, 0); }

  function zeichneDetail() {
    var y = window.scrollY, root = S.root;
    root.innerHTML = '';
    root.appendChild(h('button', { type: 'button', class: 'btn btn-ghost zurueck', text: '← Zur Liste', onclick: zurListe }));
    S.kopfBox = h('div', {}); S.fehltBox = h('div', {}); S.phasenBox = h('div', { class: 'vk-phasen' });
    S.hwBox = h('div', { id: 'hw-box' });   // Übergabe an Dispo: Banner mit offenen Hinweisen (verkauf-hinweise.js), leer wenn nichts offen
    root.appendChild(S.kopfBox); root.appendChild(S.hwBox); root.appendChild(S.fehltBox);
    if (window.VK_HW) window.VK_HW.banner(S.hwBox, S.akte).catch(function (e) { console.warn('Hinweise:', e && e.message); });
    root.appendChild(h('h2', { text: 'Phasen', style: 'margin:18px 0 8px' }));
    root.appendChild(S.phasenBox);
    S.duBox = h('div', { id: 'du-box' });   // Unterlagen + Lieferanten-AB (verkauf-unterlagen.js); blendet sich aus, solange die Tabelle fehlt
    root.appendChild(S.duBox);
    root.appendChild(untenKarte());
    zeichneKopf(); zeichnePhasen();
    if (window.VK_DU) window.VK_DU.zeichne(S.duBox, S.akte, function (neu) { if (neu) S.akte = neu; });
    window.scrollTo(0, y);
  }
  function zeichneKopf() {
    S.kopfBox.innerHTML = ''; S.fehltBox.innerHTML = '';
    S.kopfBox.appendChild(kopfKarte());
    S.kopfBox.appendChild(phasenLeiste());
    S.fehltBox.appendChild(fehltKarte());
  }
  function zeichnePhasen() {
    var y = window.scrollY;
    S.phasenBox.innerHTML = '';
    PHASEN_ANZ.forEach(function (ph) { S.phasenBox.appendChild(phaseKarte(S.calc.nach[ph.key])); });
    window.scrollTo(0, y);
  }
  /** Nach jeder Änderung: Berechnung, Kopf, Phasen neu (voll=false: nur Kopf und „Was fehlt noch“, damit Tastatur und Fokus bleiben). */
  function aktualisiere(voll) {
    neuBerechnen();
    if (!S.kopfBox) return;
    zeichneKopf();
    if (voll) zeichnePhasen();
  }

  /* ---------- Kopf ---------- */
  function kopfKarte() {
    var a = S.akte, c = S.calc;
    var dl = h('dl', { class: 'kv' });
    function z(label, inhalt) { dl.appendChild(h('dt', { text: label })); dl.appendChild(h('dd', {}, inhalt == null || inhalt === '' ? '–' : inhalt)); }
    z('Kunde', a.kunde_name);
    z('Telefon', a.kunde_telefon ? h('a', { href: 'tel:' + a.kunde_telefon.replace(/[^\d+]/g, ''), text: a.kunde_telefon }) : '');
    z('E-Mail', a.kunde_email ? h('a', { href: 'mailto:' + a.kunde_email, text: a.kunde_email, class: 'umbruch' }) : '');
    z('Interne Nr. / Autrado-Nr.', (a.interne_nr || '–') + ' / ' + (a.autrado_nr || '–'));
    z('Bestell-Nr.', a.bestell_nr);
    z('Verkäufer', a.verkaeufer);
    z('Zubehör', a.zubehoer);
    var ueber = istOffen(a) && a.uebergabe_termin && a.uebergabe_termin < EG.heute();
    z('Übergabetermin', a.uebergabe_termin ? h('span', {}, EG.fmtDatum(a.uebergabe_termin), ueber ? [' ', EG.pill('überschritten', 'rot')] : null) : 'noch nicht festgelegt');
    z('Zahlungsstand', S.kx && S.kx.zahlung ? EG.pill(ZAHL_TEXT[S.kx.zahlung], ZAHL_PILL[S.kx.zahlung]) : 'keine Angabe');
    var fv = freigabeVerkaufInfo();
    if (fv) z('Freigabe Verkauf', fv.text);
    var cur = c.aktuellIdx >= 0 ? c.nach[PHASEN_ANZ[c.aktuellIdx].key] : null;
    var art = !istOffen(a) ? (a.phase_aktuell === 'abgebrochen' ? 'grau' : 'gruen') : cur ? AMPEL_PILL[cur.ampel] : 'gruen';
    var txt = a.phase_aktuell === 'abgebrochen' ? 'Abgebrochen' : cur ? 'Jetzt: ' + cur.def.name : 'Abgeschlossen';
    var vz = uebergabeVorZahlung(S.frei, S.kx);
    return h('div', { class: 'karte' },
      h('div', { class: 'karte-kopf' }, h('h2', { text: akteTitel(a) }), EG.pill(txt, art)),
      (a.farbe || a.fin) ? h('div', { class: 'fz-zeile', text: [a.farbe, a.fin ? 'FIN ' + a.fin : ''].filter(Boolean).join(' · ') }) : null,
      h('div', { class: 'abstand' }), dl,
      vz ? EG.banner([h('strong', { text: 'Übergabe vor voller Zahlung. ' }), 'Die Sperre wurde von ' + (vz.von_name || 'OS') + (vz.am ? ' am ' + EG.fmtDatum(vz.am) : '') + ' aufgehoben: ' + vz.grund + ' Die Akte bleibt rot, bis das Geld da ist.'], 'warn') : null,
      a.nachtrag && istOffen(a) ? EG.banner('Nachgetragene Akte: Du kannst jede Phase sofort abhaken. Die Freigabe Auslieferung bleibt gesperrt, bis voll bezahlt ist.', 'info') : null,
      a.phase_aktuell === 'abgebrochen' ? EG.banner('Dieser Verkauf wurde abgebrochen. Unten kannst du die Akte wieder öffnen.', 'warn') : null,
      !istOffen(a) && a.phase_aktuell === 'abgeschlossen' ? EG.banner('Alle Phasen sind grün. Die Akte ist abgeschlossen.', 'ok') : null,
      erlaubtAnlegen() ? h('div', { style: 'margin-top:10px' }, h('button', { type: 'button', class: 'btn btn-ghost btn-klein', text: 'Daten ändern', onclick: function () { datenAendern().catch(EG.fehler); } })) : null);
  }
  async function datenAendern() {
    var id = await akteDialog({}, S.akte);
    if (id) { EG.toast('Gespeichert.', 'ok'); await ladeDetail(); }
  }
  function phasenLeiste() {
    var c = S.calc, leiste = h('div', { class: 'vk-leiste', 'aria-label': 'Phasen der Akte' });
    PHASEN_ANZ.forEach(function (ph) {
      var info = c.nach[ph.key], txt = info.phaseEntfaellt ? 'entfällt' : AMPEL_TEXT[info.ampel];
      leiste.appendChild(h('button', {
        type: 'button', class: 'vk-ph-chip' + (info.key === (c.aktuellIdx >= 0 ? PHASEN_ANZ[c.aktuellIdx].key : '') ? ' aktuell' : ''),
        'aria-label': info.def.nr + ' ' + info.def.name + ': ' + txt, title: info.def.name + ': ' + txt,
        onclick: function () { springeZu(info.key); }
      }, h('span', { class: 'vk-dot gross ' + info.ampel, 'aria-hidden': 'true' }), h('span', { text: info.def.nr + ' ' + info.def.name })));
    });
    return leiste;
  }

  /* ---------- Was fehlt noch (bei wem) ---------- */
  function fehltSichtbar(f) { return !(/^a1_/.test(f.phase)) || istBuero(); }   // Zahlungen (A1) sieht der Verkäufer nicht
  function fehltKarte() {
    var c = S.calc, a = S.akte;
    var karte = h('div', { class: 'karte vk-fehlt' }, h('h2', { text: 'Was fehlt noch – und bei wem' }));
    if (a.phase_aktuell === 'abgebrochen') { karte.appendChild(h('p', { class: 'muted', text: 'Verkauf abgebrochen – nichts mehr offen.' })); return karte; }
    var liste = h('div', { class: 'vk-fehlt-liste' }), n = 0;
    if (!S.fehltOffen) S.fehltOffen = {};
    var aktKey = c.aktuellIdx >= 0 ? PHASEN_ANZ[c.aktuellIdx].key : '';
    PH.forEach(function (ph) {
      var info = c.nach[ph.key];
      if (info.phaseEntfaellt) return;
      var eintraege = c.fehlt.filter(function (f) { return f.phase === ph.key && fehltSichtbar(f); });
      if (!eintraege.length) return;
      var body = h('div', { class: 'vk-fehlt-gr-body' }), nok = false;
      if (info.sperren.length) info.sperren.forEach(function (s) { body.appendChild(h('div', { class: 'vk-fehlt-sperre', text: 'Gesperrt: ' + s.text })); });
      eintraege.forEach(function (f) {
        if (f.status === 'nok') nok = true;
        body.appendChild(fehltEintrag(info, f));
      });
      n += eintraege.length;
      liste.appendChild(fehltGruppe(info, ph.key === aktKey, eintraege.length, nok, body));
    });
    if (!liste.childNodes.length) { karte.appendChild(EG.banner('Alles erledigt. Alle elf Phasen sind grün.', 'ok')); return karte; }
    karte.appendChild(h('p', { class: 'muted klein', text: n + ' offene' + (n === 1 ? 'r Punkt' : ' Punkte') + ', nach Phase geordnet; rechts steht, wer ihn erledigt. Tippe auf eine Phase zum Auf- oder Zuklappen, auf einen Eintrag, dann springst du hin.' }));
    karte.appendChild(liste);
    return karte;
  }
  function fehltGruppe(info, aktuell, m, nok, body) {
    var key = info.key, det = h('details', { class: 'vk-fehlt-gruppe ' + info.ampel + (aktuell ? ' aktuell' : '') });
    det.open = key in S.fehltOffen ? S.fehltOffen[key] : aktuell;
    det.addEventListener('toggle', function () { S.fehltOffen[key] = det.open; });
    det.appendChild(h('summary', {},
      h('span', { class: 'vk-dot ' + info.ampel, 'aria-hidden': 'true' }),
      h('span', { class: 'vk-fehlt-gr-name', text: (info.def.nr ? info.def.nr + ' ' : '') + info.def.name }),
      h('span', { class: 'vk-fehlt-gr-zahl', text: m + ' offen' }),
      nok ? EG.pill('NOK', 'rot') : null,
      aktuell ? EG.pill('jetzt') : null));
    det.appendChild(body);
    return det;
  }
  function fehltEintrag(info, f) {
    var bereich = info.def.typ === 'bereich';
    return h('button', {
      type: 'button', class: 'vk-fehlt-item',
      title: bereich ? 'Öffnet den Reiter ' + (/^a1_/.test(info.key) ? 'Zahlungen' : 'Transport') : 'Springt zum Punkt',
      onclick: function () { if (bereich) EG.zeigeTab(/^a1_/.test(info.key) ? 'zahlungen' : 'transport'); else springeZu(info.key, f.k); }
    },
      h('span', { class: 'vk-fehlt-phase', text: info.def.name }),
      h('span', { class: 'vk-fehlt-text', text: f.text }),
      h('span', { class: 'vk-fehlt-wer klein muted', text: 'bei: ' + (f.wer || rollenText(f.rollen)) }),
      f.status === 'nok' ? EG.pill('NOK', 'rot') : null);
  }
  function springeZu(phKey, punktKey) {
    S.offen[phKey] = true;
    var det = document.getElementById('vk-ph-' + phKey);
    if (det) det.open = true;
    var ziel = punktKey ? document.getElementById('vk-p-' + phKey + '-' + punktKey) : det;
    if (!ziel && punktKey) ziel = det;
    if (ziel) {
      var p = ziel.parentNode;
      while (p && p !== S.phasenBox) { if (p.tagName === 'DETAILS') { p.open = true; if (p.getAttribute('data-gruppe')) S.offen['gr_' + phKey] = true; } p = p.parentNode; }
      setTimeout(function () {
        ziel.scrollIntoView({ behavior: 'smooth', block: punktKey ? 'center' : 'start' });
        ziel.classList.add('vk-blink'); setTimeout(function () { ziel.classList.remove('vk-blink'); }, 1600);
      }, 40);
    }
  }

  /* ---------- Transportstatus (A2) in den Phasen mit transportAnzeigen ---------- */
  function transportZeile(akte) {
    var box = h('div', { class: 'vk-transport' });
    function keine() { box.replaceChildren(h('span', { class: 'klein muted', text: 'Transport: keine Angabe' })); }
    try {
      var TR = window.VK_TRANSPORT, id = akte.fahrzeug_id;
      if (!TR || typeof TR.ladeStatus !== 'function' || !id) { keine(); return box; }
      box.replaceChildren(h('span', { class: 'klein muted', text: 'Transport: lädt …' }));
      if (!S.trCache[id]) S.trCache[id] = Promise.resolve(TR.ladeStatus([id]));
      S.trCache[id].then(function (m) {
        var e = m && m[id];
        if (!e || typeof TR.statusZeile !== 'function') { keine(); return; }
        var el = TR.statusZeile(e);
        if (el && el.nodeType) box.replaceChildren(el); else keine();
      }).catch(keine);
    } catch (e) { keine(); }
    return box;
  }

  /* ---------- Phase ---------- */
  function phaseKarte(info) {
    var ph = info.def, det = h('details', { class: 'vk-phase ' + info.ampel, id: 'vk-ph-' + ph.key });
    det.open = !!S.offen[ph.key];
    det.addEventListener('toggle', function () { S.offen[ph.key] = det.open; });
    var gesperrt = info.sperren.length > 0;
    var kurz = info.phaseEntfaellt ? 'entfällt' : info.pflichtErledigt + ' von ' + info.pflichtGesamt + ' Pflichtpunkten';
    var pillText = info.phaseEntfaellt ? 'Entfällt' : (gesperrt && ph.key === 'p09') ? 'Gesperrt' : AMPEL_TEXT[info.ampel];
    det.appendChild(h('summary', { class: 'vk-ph-kopf' },
      h('span', { class: 'vk-dot gross ' + info.ampel, 'aria-hidden': 'true' }),
      h('span', { class: 'vk-ph-name', text: ph.nr + ' ' + ph.name }),
      h('span', { class: 'vk-ph-info', text: kurz + (info.rotGrund && !info.phaseEntfaellt ? ' · ' + info.rotGrund : '') }),
      EG.pill(pillText, info.phaseEntfaellt ? 'grau' : (gesperrt && ph.key === 'p09') ? 'grau' : AMPEL_PILL[info.ampel])));
    var body = h('div', { class: 'vk-ph-body' });
    body.appendChild(h('div', { class: 'klein muted', text: (ph.art === 'anzeige' ? 'Gepflegt von: ' : 'Abhaken: ') + ph.wer }));
    if (ph.hinweis) body.appendChild(h('div', { class: 'klein muted', style: 'margin-top:2px', text: ph.hinweis }));
    if (ph.transportAnzeigen) body.appendChild(transportZeile(S.akte));
    if (ph.art === 'anzeige' && ph.rollen.indexOf(meineRolle()) < 0) {
      body.appendChild(EG.banner('Für dich nur Anzeige (Stand). Gepflegt wird das von: ' + ph.wer + '.' + (ph.key === 'p07' ? ' Du bestätigst nur die Endkontrolle „Verkäufer“.' : ''), 'info'));
    }
    var darfPhase = darfPhaseIrgendwas(ph);
    if (info.phaseEntfaellt) {
      body.appendChild(EG.banner([h('strong', { text: 'Diese Phase entfällt' }), (info.phaseAuto ? ' (automatisch)' : '') + (info.phaseGrund ? ': ' + info.phaseGrund : '')], 'info'));
      if (!info.phaseAuto && darfPhase) body.appendChild(h('button', { type: 'button', class: 'btn btn-ghost btn-klein', text: 'Phase wieder aktivieren', onclick: function () { phaseEntfaellt(info, false).catch(EG.fehler); } }));
    } else {
      var acFertig = false;
      info.punkte.forEach(function (pe) {
        if (pe.def.gruppe === 'ac') {
          if (!acFertig) { body.appendChild(acGruppe(info)); acFertig = true; }
          return;
        }
        if (ph.key === 'p05' && pe.def.k === 'freigabe') { body.appendChild(freigabeVerkaufBlock(info, pe)); return; }
        if (ph.key === 'p09' && pe.def.k === 'freigabe_auslieferung') { body.appendChild(freigabeAuslieferungBlock(info, pe)); return; }
        if (ph.key === 'p06' && pe.def.k === 'zahlungsstand') { body.appendChild(zahlstandBlock(info, pe)); return; }
        body.appendChild(punktKarte(info, pe));
      });
      if (ph.key === 'p10') { var ub = umfrageBlock(); if (ub) body.appendChild(ub); }
      if (ph.entfaellbar && darfPhase) {
        body.appendChild(h('div', { style: 'margin-top:12px' }, h('button', { type: 'button', class: 'btn btn-ghost btn-klein', text: 'Ganze Phase entfällt …', onclick: function () { phaseEntfaellt(info, true).catch(EG.fehler); } })));
      }
    }
    det.appendChild(body);
    return det;
  }
  async function phaseEntfaellt(info, an) {
    var quellen = info.def.phaseQuelle || [];
    if (!quellen.length) return;
    var g = null;
    if (an) {
      g = await EG.eingabe('Warum entfällt die ganze Phase „' + info.def.name + '“?', { titel: 'Phase entfällt', platzhalter: 'Grund', ok: 'Entfällt' });
      if (!g) return;
    }
    await seriell(async function () {
      for (var i = 0; i < quellen.length; i++) {
        var q = quellen[i];
        S.pm[q.phase] = S.pm[q.phase] || {};
        S.pm[q.phase]._phase = await punktRoh(S.id, q.phase, '_phase', an ? { status: 'entfaellt', grund: g, name: meinName() } : { status: 'offen' });
      }
    });
    await nachSpeichern({});
    aktualisiere(true);
  }

  /* ---------- Freigabe Verkauf (Phase 5): OS gibt frei, Dispo/Buchhaltung in Vertretung ---------- */
  /** → { text, vertretung, name, am } wenn freigegeben, sonst null (auch für Akten, die nur den alten Haken v6.freigabe haben) */
  function freigabeVerkaufInfo() {
    var inf = S.calc && S.calc.nach.p05, pe = inf && inf.punkte[0];
    if (!pe || pe.st !== 'ok') return null;
    var fv = findeFrei(S.frei, 'verkauf'), alt = findeFrei(S.frei, 'akte_frei', 'v6'), row = pe.row;
    var name = (fv && fv.von_name) || (row && row.erledigt_von_name) || (alt && alt.von_name) || 'OS', am = (fv && fv.am) || (row && row.erledigt_am) || (alt && alt.am);
    var vertr = !!(fv && fv.vertretung);
    return {
      vertretung: vertr, name: name, am: am, row: fv,
      text: vertr ? 'Freigabe in Vertretung durch ' + name + (am ? ' am ' + EG.fmtDatum(am) : '') : 'Freigegeben durch OS (' + name + ')' + (am ? ' am ' + EG.fmtDatum(am) : '')
    };
  }
  function freigabeVerkaufBlock(info, pe) {
    var p = pe.def, rolle = meineRolle(), darf = darfPunkt(info.def, p), admin = rolle === 'admin';
    var karte = h('div', { class: 'punkt vk-punkt vk-freigabe' + (pe.st === 'ok' ? ' ok' : pe.st === 'nok' ? ' vk-nok' : ''), id: 'vk-p-' + info.key + '-' + p.k });
    karte.appendChild(h('div', { class: 'punkt-titel', text: p.text }));
    var fv = freigabeVerkaufInfo();
    if (pe.st === 'ok' && fv) karte.appendChild(EG.banner([h('strong', { text: fv.text })], fv.vertretung ? 'warn' : 'ok'));
    else if (pe.st === 'nok') karte.appendChild(EG.banner([h('strong', { text: 'Rückfrage: ' }), pe.grund || ''], 'warn'));
    else karte.appendChild(EG.banner('Noch nicht freigegeben.', 'info'));
    if (fv && fv.vertretung) {
      var gesehen = fv.row && fv.row.gesehen_am;
      if (!gesehen) karte.appendChild(h('div', { class: 'klein muted', text: 'Der Fall steht im Cockpit, bis OS ihn als gesehen vermerkt.' }));
      if (admin && fv.row) karte.appendChild(gesehenZeile(fv.row, 'freigabe'));
      else if (gesehen) karte.appendChild(h('div', { class: 'klein muted', text: 'OS hat die Vertretung gesehen.' }));
    }
    if (!darf) { karte.appendChild(h('div', { class: 'klein muted', text: 'Du siehst nur den Stand. Freigeben: OS, in Vertretung Dispo und Buchhaltung.' })); return karte; }
    var knoepfe = h('div', { class: 'vk-knoepfe', style: 'margin-top:8px' });
    if (pe.st !== 'ok') {
      knoepfe.appendChild(h('button', { type: 'button', class: 'btn btn-primary', text: admin ? 'Freigeben (OS)' : 'In Vertretung freigeben', onclick: function () { verkaufFreigeben(info, pe).catch(EG.fehler); } }));
      if (pe.st !== 'nok') knoepfe.appendChild(h('button', { type: 'button', class: 'btn btn-ghost', text: 'Rückfrage', onclick: function () { statusKlick(info, pe, 'nok').catch(EG.fehler); } }));
      else knoepfe.appendChild(h('button', { type: 'button', class: 'btn btn-ghost', text: 'Rückfrage zurücknehmen', onclick: function () { aendern(info, p, { status: 'offen', grund: null, render: true }).catch(EG.fehler); } }));
    } else {
      knoepfe.appendChild(h('button', { type: 'button', class: 'btn btn-ghost', text: 'Freigabe zurücknehmen', onclick: function () { aendern(info, p, { status: 'offen', grund: null, render: true }).catch(EG.fehler); } }));
    }
    karte.appendChild(knoepfe);
    if (!admin) karte.appendChild(h('div', { class: 'klein muted', style: 'margin-top:6px', text: 'Du gibst nur in Vertretung von OS frei; die App vermerkt „Freigabe in Vertretung durch ' + (meinName() || 'dir') + '“.' }));
    return karte;
  }
  async function verkaufFreigeben(info, pe) {
    var p = pe.def, vertretung = meineRolle() !== 'admin', name = meinName();
    if (vertretung) {
      var ja = await EG.bestaetigen('Du gibst den Verkauf in Vertretung von OS frei. In der Akte steht dann „Freigabe in Vertretung durch ' + name + '“ und der Fall erscheint im Cockpit.', { ja: 'In Vertretung freigeben', titel: 'Freigabe in Vertretung' });
      if (!ja) return;
    }
    await aendern(info, p, {
      status: 'ok', grund: null, render: true,
      nachher: async function () {
        await freigabeSchreiben('verkauf', 'p05', vertretung ? 'Freigabe in Vertretung durch ' + name : 'Freigabe Verkauf durch OS', null, vertretung);
        if (!findeFrei(S.frei, 'akte_frei', 'v6')) await freigabeSchreiben('akte_frei', 'v6', 'Freigabe an die Dispo', null);   // alte Meldung an die Dispo bleibt erhalten
      }
    });
    EG.toast(vertretung ? 'Freigabe in Vertretung gespeichert.' : 'Verkauf freigegeben.', 'ok');
  }

  /* ---------- Phase 6: Zahlungsstand (nur Stand, keine Beträge) ---------- */
  function zahlstandBlock(info, pe) {
    var z = S.kx && S.kx.zahlung;
    var karte = h('div', { class: 'punkt vk-punkt' + (z === 'bezahlt' ? ' ok' : ''), id: 'vk-p-' + info.key + '-' + pe.def.k });
    karte.appendChild(h('div', { class: 'punkt-titel', text: 'Zahlungsstand' }));
    karte.appendChild(h('div', { class: 'vk-zahlstand' }, z ? EG.pill(ZAHL_TEXT[z], ZAHL_PILL[z]) : EG.pill('keine Angabe', 'grau'),
      h('span', { class: 'klein muted', text: z === 'bezahlt' ? 'Das Fahrzeug ist voll bezahlt.' : z ? 'Noch nicht voll bezahlt.' : 'Zum Fahrzeug liegt keine Zahlungsangabe vor (Fahrzeug nicht verknüpft?).' })));
    karte.appendChild(h('div', { class: 'klein muted', text: 'Nur der Stand, keine Beträge. Einzelheiten pflegen Dispo und Buchhaltung im Reiter Zahlungen.' }));
    if (istBuero()) karte.appendChild(h('button', { type: 'button', class: 'btn btn-ghost btn-klein', style: 'margin-top:8px', text: 'Zum Reiter Zahlungen', onclick: function () { EG.zeigeTab('zahlungen'); } }));
    return karte;
  }

  /* ---------- Phase 9: Freigabe Auslieferung (Sperre „voll bezahlt“, Grund bei offenen Phasen) ---------- */
  function freigabeAuslieferungBlock(info, pe) {
    var p = pe.def, darf = darfPunkt(info.def, p), gesperrt = info.sperren.length > 0;
    var karte = h('div', { class: 'punkt vk-punkt vk-freigabe' + (pe.st === 'ok' ? ' ok' : pe.st === 'nok' ? ' vk-nok' : ''), id: 'vk-p-' + info.key + '-' + p.k });
    karte.appendChild(h('div', { class: 'punkt-titel', text: p.text }));
    // Sperre
    if (gesperrt) {
      var sb = h('div', { class: 'banner warn vk-sperre' }, h('strong', { text: 'Gesperrt – ' }), info.sperren.map(function (s) { return s.text; }).join(' '));
      if (darf) sb.appendChild(h('div', { style: 'margin-top:8px' }, h('button', { type: 'button', class: 'btn btn-ghost btn-klein', text: 'Sperre aufheben …', onclick: function () { sperreAufheben(info).catch(EG.fehler); } })));
      else sb.appendChild(h('div', { class: 'klein', style: 'margin-top:4px', text: 'Aufheben dürfen nur OS, Dispo und Buchhaltung (mit Grund).' }));
      karte.appendChild(sb);
    }
    var ov = findeFrei(S.frei, 'sperre_aufgehoben') || findeFrei(S.frei, 'uebergabe_vor_zahlung');
    if (ov) karte.appendChild(EG.banner([h('strong', { text: 'Sperre aufgehoben ' }), 'von ' + (ov.von_name || 'OS') + (ov.am ? ' am ' + EG.fmtDatum(ov.am) : '') + ': ' + ov.grund + (S.kx && S.kx.zahlung === 'bezahlt' ? '' : ' – Übergabe vor voller Zahlung, die Akte bleibt rot, bis das Geld da ist.')], 'warn'));
    // Warnungen: Aufbereitung, Zulassung, Transport nicht grün
    if (info.warnungen.length) {
      karte.appendChild(EG.banner([h('strong', { text: 'Noch nicht grün: ' }), info.warnungen.map(function (w) { return w.name; }).join(', '), '. Freigabe geht trotzdem, die App verlangt dann einen Grund.'], 'warn'));
    }
    // Stand
    var fa = findeFrei(S.frei, 'auslieferung');
    if (pe.st === 'ok') {
      var wer = (fa && fa.von_name) || (pe.row && pe.row.erledigt_von_name) || 'Büro', am = (fa && fa.am) || (pe.row && pe.row.erledigt_am);
      karte.appendChild(EG.banner([h('strong', { text: 'Auslieferung freigegeben ' }), 'von ' + wer + (am ? ' am ' + EG.fmtDatum(am) : '') + (fa && fa.grund && fa.grund !== 'Freigabe Auslieferung' ? '. Grund: ' + fa.grund : '')], 'ok'));
    } else if (pe.st === 'nok') karte.appendChild(EG.banner([h('strong', { text: 'Rückfrage: ' }), pe.grund || ''], 'warn'));
    else if (!gesperrt) karte.appendChild(EG.banner('Noch nicht freigegeben.', 'info'));
    if (!darf) { karte.appendChild(h('div', { class: 'klein muted', text: 'Du siehst nur den Stand. Freigeben: OS, Dispo und Buchhaltung.' })); return karte; }
    var knoepfe = h('div', { class: 'vk-knoepfe', style: 'margin-top:8px' });
    if (pe.st !== 'ok') {
      knoepfe.appendChild(h('button', { type: 'button', class: 'btn btn-primary', text: 'Auslieferung freigeben', disabled: gesperrt, onclick: function () { auslieferungFreigeben(info, pe).catch(EG.fehler); } }));
      if (pe.st !== 'nok') knoepfe.appendChild(h('button', { type: 'button', class: 'btn btn-ghost', text: 'Rückfrage', onclick: function () { statusKlick(info, pe, 'nok').catch(EG.fehler); } }));
      else knoepfe.appendChild(h('button', { type: 'button', class: 'btn btn-ghost', text: 'Rückfrage zurücknehmen', onclick: function () { aendern(info, p, { status: 'offen', grund: null, render: true }).catch(EG.fehler); } }));
    } else {
      knoepfe.appendChild(h('button', { type: 'button', class: 'btn btn-ghost', text: 'Freigabe zurücknehmen', onclick: function () { aendern(info, p, { status: 'offen', grund: null, render: true }).catch(EG.fehler); } }));
    }
    karte.appendChild(knoepfe);
    return karte;
  }
  async function auslieferungFreigeben(info, pe) {
    if (info.sperren.length) { EG.toast('Erst die Sperre aufheben (mit Grund) oder warten, bis voll bezahlt ist.', 'fehler'); return; }
    var grund = 'Freigabe Auslieferung';
    if (info.warnungen.length) {
      var frage = 'Noch nicht grün: ' + info.warnungen.map(function (w) { return w.name; }).join(', ') + '. Warum gibst du die Auslieferung trotzdem frei?';
      var g = await EG.eingabe(frage, { titel: 'Freigabe mit offenen Punkten', platzhalter: 'Grund (Pflicht)', ok: 'Trotzdem freigeben' });
      if (!g) return;
      grund = g;
    }
    await aendern(info, pe.def, { status: 'ok', grund: null, render: true, nachher: function () { return freigabeSchreiben('auslieferung', 'p09', grund, null); } });
    EG.toast('Auslieferung freigegeben.', 'ok');
  }
  async function sperreAufheben(info) {
    if (!istBuero()) { EG.toast('Die Sperre heben nur OS, Dispo und Buchhaltung auf.', 'fehler'); return; }
    var ta = h('textarea', { id: 'vk-sperre-grund', placeholder: 'Warum darf die Übergabe vor der vollen Zahlung stattfinden?' });
    var ok = await EG.dialog({
      titel: 'Sperre aufheben: Freigabe Auslieferung',
      inhalt: [h('ul', { style: 'margin:0 0 10px 20px' }, info.sperren.map(function (s) { return h('li', { text: s.text }); })),
        h('p', { class: 'klein muted', style: 'margin-bottom:8px', text: 'Name und Zeit werden gespeichert. Die Akte bleibt als „Übergabe vor voller Zahlung“ markiert, bis das Geld da ist.' }),
        EG.feld('Begründung (Pflicht, mindestens 5 Zeichen)', ta)],
      knoepfe: [{ text: 'Abbrechen', art: 'ghost', wert: null }, {
        text: 'Sperre aufheben', art: 'primary', wert: 'ok',
        aktion: async function () {
          if (ta.value.trim().length < 5) return 'Bitte eine Begründung mit mindestens 5 Zeichen eintragen.';
          await freigabeSchreiben('sperre_aufgehoben', 'p09', ta.value.trim(), null);
          return true;
        }
      }]
    });
    if (ok === 'ok') { EG.toast('Sperre aufgehoben. Der Eintrag bleibt als Nachweis stehen.', 'ok'); aktualisiere(true); }
  }
  async function freigabeSchreiben(art, phase, grund, betrag, vertretung) {
    var rec = { akte_id: S.id, art: art, phase: phase, grund: grund, betrag: betrag == null ? null : betrag, von_name: meinName(), am: jetzt() };
    if (art === 'verkauf') rec.vertretung = !!vertretung;   // Spalte gibt es nur zusammen mit der neuen Art (VA2)
    var r = chk(await T.frei().insert(rec).select().single());
    S.frei.push(r.data);
    return r.data;
  }

  /* ---------- Auslieferungs-Checkliste (Gruppe in Phase 7) ---------- */
  /** Zeigt dieselbe Checkliste wie der Reiter „Auslieferung“ (AC_UI). Gespeichert wird in verkauf.auslieferung_punkt über die interne Nr. */
  function acGruppe(info) {
    var pes = info.punkte.filter(function (pe) { return pe.def.gruppe === 'ac'; });
    var nr = S.akte.interne_nr, key = 'gr_' + info.key;
    var ac = AC_UI.zaehle(S.pm.ac || {});
    var det = h('details', { class: 'vk-gruppe', 'data-gruppe': 'ac' });
    det.open = !!S.offen[key];
    det.addEventListener('toggle', function () { S.offen[key] = det.open; });
    var ende = pes.filter(function (pe) { return pe.def.block === 'Endkontrolle'; }), endeOk = ende.filter(function (pe) { return pe.st === 'ok'; }).length;
    det.appendChild(h('summary', { class: 'vk-gr-kopf' }, h('span', { class: 'vk-ph-name', text: 'Auslieferungs-Checkliste' }),
      h('span', { class: 'vk-ph-info', text: nr ? ac.erledigt + ' von ' + ac.gesamt + ' Punkten · Endkontrolle ' + endeOk + ' von ' + ende.length : 'interne Nr. fehlt' }),
      nr ? EG.pill(endeOk === ende.length ? 'Fertig' : 'Offen', endeOk === ende.length ? 'gruen' : 'grau') : EG.pill('Nr. fehlt', 'gold')));
    var body = h('div', { class: 'vk-gr-body' });
    if (!nr) {
      body.appendChild(EG.banner('Diese Akte hat noch keine interne Nr. Trage sie oben unter „Daten ändern“ ein, dann erscheint hier die Auslieferungs-Checkliste.', 'warn'));
    } else {
      body.appendChild(h('p', { class: 'klein muted', text: 'Die einzelnen Punkte sind eine Arbeitsliste (freiwillig); nur die drei Endkontrollen zählen für die Ampel. Aufbereiter und Meister haken im Reiter „Auslieferung“ ab, hier siehst du denselben Stand.' }));
      S.pm.ac = S.pm.ac || {};
      body.appendChild(AC_UI.liste({
        interneNr: nr, rows: S.pm.ac, gesperrt: false, idPrefix: 'vk-p-' + info.key + '-',
        // Haken ist gespeichert → Phase der Akte nachführen, Ampel und „Was fehlt noch“ neu rechnen (neu zeichnen nur bei Statuswechsel)
        onChange: function (c) {
          seriell(async function () { await nachSpeichern({}); aktualisiere(c.voll); }).catch(EG.fehler);
        }
      }));
    }
    det.appendChild(body);
    return det;
  }

  /* ---------- Punkt ---------- */
  function statusZeile(pe) {
    var row = pe.eigen || pe.row, bits = [];
    if (pe.auto) return null;
    if (row && pe.st !== 'offen' && (row.erledigt_von_name || row.erledigt_am)) {
      bits.push(h('div', { class: 'klein muted', text: (pe.st === 'ok' ? 'Erledigt' : pe.st === 'nok' ? 'NOK gemeldet' : 'Entfällt') + (row.erledigt_von_name ? ' von ' + row.erledigt_von_name : '') + (row.erledigt_am ? ', ' + EG.fmtZeit(row.erledigt_am) : '') }));
    }
    if ((pe.st === 'nok' || pe.st === 'entfaellt') && pe.grund) bits.push(h('div', { class: 'klein vk-grund umbruch', text: 'Grund: ' + pe.grund }));
    return bits.length ? h('div', { class: 'vk-status' }, bits) : null;
  }
  function segment(info, pe, ed) {
    var p = pe.def, liste = p.seg || ['ok', 'nok', 'entfaellt'];
    if (p.keinEntfaellt) liste = liste.filter(function (x) { return x !== 'entfaellt'; });
    var labels = Object.assign({}, STATUS_LABEL, p.segLabels || {}), cls = { ok: 'seg-ok', nok: 'seg-mangel', entfaellt: 'seg-entfaellt' };
    var seg = h('div', { class: 'seg vk-seg', role: 'group', 'aria-label': p.text, style: 'grid-template-columns:repeat(' + liste.length + ',1fr)' });
    liste.forEach(function (x) {
      seg.appendChild(h('button', {
        type: 'button', class: 'seg-b ' + cls[x] + (pe.eigenSt === x ? ' aktiv' : ''), 'aria-pressed': pe.eigenSt === x ? 'true' : 'false', disabled: !ed, text: labels[x],
        onclick: function () { statusKlick(info, pe, x).catch(EG.fehler); }
      }));
    });
    return seg;
  }
  /** Erste Unterlagen-Quelle { dokument: art } eines Punktes (oder null). */
  function dokQuelle(p) {
    var l = (p.quelle || []).filter(function (q) { return q.dokument; });
    return l.length ? { art: l[0].dokument } : null;
  }
  /** Zeile „PDF in den Unterlagen“ mit Sprung zu #du-box. Liegt ein PDF der Art vor → textDa (+ Datum, von), sonst textFehlt. */
  function dokZeile(art, textDa, textFehlt) {
    var d = (S.pm && S.pm.dok && S.pm.dok[art]) || null, akteId = S.akte && S.akte.id;
    var z = h('div', { class: 'vk-auto vk-dok' + (d ? ' vk-dok-da' : ' vk-dok-fehlt'), 'data-dok-art': art, text: d ? (textDa + (d.wert && d.wert.text ? ' (' + d.wert.text + ')' : '')) : textFehlt });
    if (akteId) z.appendChild(h('button', { type: 'button', class: 'btn btn-ghost btn-klein', style: 'margin-left:8px', text: 'Zu den Unterlagen', onclick: function () { if (window.VK_DU) window.VK_DU.springe(akteId); } }));
    return z;
  }
  /** Woher kommt der Stand, wenn der Punkt nicht in der App beschreibbar ist? */
  function herkunftText(p) {
    if (p.quelle && p.quelle.some(function (q) { return q.dokument; })) return 'Kommt aus der Masterliste oder aus den Unterlagen (PDF).';
    if (p.quelle && p.quelle.length && p.quelle.every(function (q) { return q.nurLesen; })) return 'Kommt aus der Masterliste.';
    if (p.datenquelle) return 'Kommt aus den Fahrzeugdaten (' + p.datenquelle + ').';
    return 'Kommt aus einer anderen Quelle.';
  }
  /** Karte eines Punktes; unter „Übergabe-Mail“ (p10) hängt – falls vorhanden – der Knopf aus window.VK_UEBERGABE (VA8). Fehlt das Modul, passiert nichts. */
  function punktKarte(info, pe) {
    var karte = punktKarteBasis(info, pe);
    try {
      if (info.key === 'p10' && pe.def.k === 'uebergabe_mail' && window.VK_UEBERGABE && typeof window.VK_UEBERGABE.mailKnopf === 'function') {
        var el = window.VK_UEBERGABE.mailKnopf(S.akte, {
          phase: info.key, punkt: pe.def.k, stand: pe.st, rolle: meineRolle(),
          // „Gesendet“ bestätigt → Punkt über die normale Speicherfunktion auf ok (Name/Zeit wie beim Abhaken), Akte neu zeichnen
          onGesendet: function () { return aendern(info, pe.def, { status: 'ok', grund: null, render: true }); }
        });
        if (el && el.nodeType === 1) karte.appendChild(el);
      }
    } catch (e) { console.warn('VK_UEBERGABE.mailKnopf:', e && e.message); }
    return karte;
  }
  function punktKarteBasis(info, pe) {
    var p = pe.def, st = pe.st;
    var darf = darfPunkt(info.def, p), ed = darf && !pe.auto;
    var karte = h('div', {
      class: 'punkt vk-punkt' + (st === 'ok' ? ' ok' : st === 'nok' ? ' vk-nok' : st === 'entfaellt' ? ' entfaellt' : '') + (!ed ? ' vk-lesen' : ''),
      id: 'vk-p-' + info.key + '-' + p.k
    });
    var titel = h('div', { class: 'punkt-titel' }, p.text, p.pflicht ? null : h('span', { class: 'vk-opt', text: ' (freiwillig)' }));
    if (pe.auto) {
      karte.appendChild(titel);
      karte.appendChild(h('div', { class: 'vk-auto', text: (st === 'entfaellt' ? 'Entfällt: ' : st === 'ok' ? 'Erledigt: ' : 'Offen: ') + (pe.grund || '') }));
      return karte;
    }
    karte.appendChild(titel);
    if (p.hinweis) karte.appendChild(h('div', { class: 'punkt-hinweis', text: p.hinweis }));
    if (p.dokHinweis) karte.appendChild(dokZeile(p.dokHinweis.art, p.dokHinweis.text, p.dokHinweis.fehlt));
    if (p.nurLesen) {   // Masterliste oder Datenfeld: nur Stand anzeigen
      var raw = pe.row ? AMP.wertAus(pe.row.wert) : null;
      karte.appendChild(h('div', { class: 'vk-auto', text: herkunftText(p) + ' Stand: ' + (st === 'ok' ? 'erledigt' : st === 'nok' ? 'NOK' : st === 'entfaellt' ? 'entfällt' : 'offen') + (raw ? ' (' + raw + ')' : '') + (pe.grund && st !== 'ok' ? ' – ' + pe.grund : '') }));
      var szl = statusZeile(pe); if (szl) karte.appendChild(szl);
      var dq = dokQuelle(p);
      if (dq) karte.appendChild(dokZeile(dq.art, 'Erledigt – PDF in den Unterlagen', 'Noch kein PDF in den Unterlagen – der Punkt gilt als erledigt, sobald es dort liegt.'));
      return karte;
    }
    if (st === 'ok' && pe.eigenSt !== 'ok') karte.appendChild(h('div', { class: 'vk-auto', text: p.datenquelle === 'verkauf.akte.evb_nr' && S.akte && S.akte.evb_nr ? 'Erledigt: eVB-Nr. steht in der Akte (' + S.akte.evb_nr + ').' : 'Erledigt laut Masterliste oder anderem Eintrag.' }));
    if (p.eingabe) karte.appendChild(eingabeBlock(info, pe, ed));
    if (p.spezial === 'nachlass') karte.appendChild(nachlassBlock(info, pe, ed));
    if (p.foto) karte.appendChild(fotoBereich(info, pe, ed));
    karte.appendChild(segment(info, pe, ed));
    var sz = statusZeile(pe); if (sz) karte.appendChild(sz);
    if (!darf) karte.appendChild(h('div', { class: 'klein muted', style: 'margin-top:6px', text: 'Nur ansehen. Abhaken: ' + rollenText(p.rollen || info.def.rollen) + '.' }));
    return karte;
  }

  /* ---------- Eingabefelder ---------- */
  function wertKopie(pe) { var r = pe.eigen || pe.row; return Object.assign({}, (r && r.wert && typeof r.wert === 'object') ? r.wert : {}); }
  function eingabeBlock(info, pe, ed) {
    var p = pe.def, w = wertKopie(pe), id = 'vk-e-' + info.key + '-' + p.k, label = p.label;
    var box = h('div', { class: 'extra vk-eingabe' });
    function aendereWert(neu, auto) {
      return aendern(info, p, { wert: neu, auto: auto ? true : undefined }).catch(EG.fehler);
    }
    if (p.eingabe === 'auswahl') {
      var sel = h('select', { id: id, disabled: !ed }, h('option', { value: '', text: '– bitte wählen –' }), (p.optionen || []).map(function (o) { return h('option', { value: o, text: o }); }));
      sel.value = w.auswahl || '';
      var textFeld = null;
      sel.addEventListener('change', function () {
        var neu = Object.assign({}, w); if (sel.value) neu.auswahl = sel.value; else delete neu.auswahl;
        if (!p.textBei || p.textBei.indexOf(sel.value) < 0) delete neu.text;
        aendereWert(neu, true);
      });
      box.appendChild(EG.feld(label || 'Auswahl', sel));
      if (p.textBei && p.textBei.indexOf(w.auswahl) >= 0) {
        textFeld = h('textarea', { id: id + '-grund', disabled: !ed, value: w.text || '', placeholder: 'Grund (Pflicht)' });
        textFeld.addEventListener('change', function () { var neu = Object.assign({}, w, { text: textFeld.value.trim() }); aendereWert(neu, true); });
        box.appendChild(EG.feld('Grund', textFeld));
      }
    } else if (p.eingabe === 'datum') {
      var d = h('input', { type: 'date', id: id, disabled: !ed, value: w.datum || '' });
      d.addEventListener('change', function () { var neu = Object.assign({}, w); if (d.value) neu.datum = d.value; else delete neu.datum; aendereWert(neu, true); });
      box.appendChild(EG.feld(label || 'Datum', d));
    } else if (p.eingabe === 'betrag') {
      var b = h('input', { type: 'text', id: id, inputmode: 'decimal', disabled: !ed, value: w.betrag == null ? '' : betragFeld(w.betrag), placeholder: '0,00' });
      b.addEventListener('change', function () {
        var n = parseBetrag(b.value);
        if (n !== null && isNaN(n)) { EG.toast('Das ist kein gültiger Betrag.', 'fehler'); b.value = w.betrag == null ? '' : betragFeld(w.betrag); return; }
        var neu = Object.assign({}, w); if (n === null) delete neu.betrag; else neu.betrag = n;
        aendereWert(neu, true);
      });
      box.appendChild(EG.feld(label || 'Betrag in €', b));
    } else if (p.eingabe === 'text') {
      var t = p.mehrzeilig ? h('textarea', { id: id, disabled: !ed, value: w.text || '', style: 'min-height:72px' }) : h('input', { type: 'text', id: id, disabled: !ed, value: w.text || '', autocomplete: 'off' });
      // Ein reiner Textwert ohne Pflicht (z. B. „Name Fahrzeugannehmer“) wird mit dem Eintrag erledigt (auto), Pflicht-Texte folgen der Prüfung wie bisher
      t.addEventListener('change', function () { var neu = Object.assign({}, w); if (t.value.trim()) neu.text = t.value.trim(); else delete neu.text; aendereWert(neu, !p.pflicht || !!p.wertPflicht ? false : true); });
      box.appendChild(EG.feld(label || 'Eintrag', t));
    } else if (p.eingabe === 'bestaetigung') {
      var bw = wertVon(p, pe.eigen || pe.row);
      box.appendChild(h('div', { class: bw ? 'fett' : 'muted', text: bw ? 'Bestätigt von ' + bw.name + ' am ' + EG.fmtDatum(bw.datum) : 'Noch nicht bestätigt.' }));
      if (bw && ed) box.appendChild(h('button', { type: 'button', class: 'btn btn-ghost btn-klein', style: 'margin-top:6px', text: 'Name / Datum ändern', onclick: function () { bestaetigen(info, pe).catch(EG.fehler); } }));
    }
    return box;
  }
  /** Dialog Name + Datum (Endkontrolle). → true wenn gespeichert */
  async function bestaetigen(info, pe) {
    var alt = wertVon(pe.def, pe.eigen || pe.row);
    var name = h('input', { type: 'text', id: 'vk-b-name', value: alt ? alt.name : (EG.nutzerName() || ''), placeholder: 'Vorname Nachname', autocomplete: 'off' });
    var datum = h('input', { type: 'date', id: 'vk-b-datum', value: alt ? alt.datum : EG.heute() });
    var ok = await EG.dialog({
      titel: pe.def.text, inhalt: [h('p', { class: 'muted klein', style: 'margin-bottom:10px', text: 'Wer hat kontrolliert? Name und Datum werden gespeichert.' }), EG.feld('Name', name), EG.feld('Datum', datum)],
      knoepfe: [{ text: 'Abbrechen', art: 'ghost', wert: null }, {
        text: 'Bestätigen', art: 'primary', wert: 'ok',
        aktion: function () { if (!name.value.trim()) return 'Bitte den Namen eintragen.'; if (!datum.value) return 'Bitte das Datum eintragen.'; return true; }
      }]
    });
    if (ok !== 'ok') return false;
    return aendern(info, pe.def, { status: 'ok', grund: null, wert: { name: name.value.trim(), datum: datum.value } });
  }

  /* ---------- Fotos ---------- */
  function fotoBereich(info, pe, ed) {
    var p = pe.def, fotos = ((pe.eigen || pe.row) && (pe.eigen || pe.row).fotos) || [];
    var box = h('div', { class: 'extra' });
    box.appendChild(h('div', { class: 'feld-label', text: p.fotoPflicht ? 'Foto (Pflicht)' : 'Foto' }));
    if (!ed) {
      box.appendChild(fotos.length ? h('div', { class: 'fotos' }, fotos.map(function (f) { return EG.fotoThumb(f); })) : h('div', { class: 'klein muted', text: 'Kein Foto.' }));
      return box;
    }
    var fb = EG.fotoBlock({
      pfad: 'verkauf/' + S.id, fotos: fotos,
      onChange: function (arr) { aendern(info, p, { fotos: arr }).catch(EG.fehler); }
    });
    box.appendChild(fb.el);
    return box;
  }

  /* ---------- Nachlass (Antrag durch Verkauf, Freigabe nur Oli) ---------- */
  function nachlassBlock(info, pe, ed) {
    var w = wertKopie(pe), box = h('div', { class: 'extra vk-nachlass' });
    if (pe.st === 'ok') {
      box.appendChild(EG.banner([h('strong', { text: 'Freigegeben: ' + (w.betrag != null ? fmtBetrag(w.betrag) : '') }), w.grund ? ' – ' + w.grund : ''], 'ok'));
    } else if (w.beantragt != null) {
      box.appendChild(EG.banner([h('strong', { text: 'Beantragt: ' + fmtBetrag(w.beantragt) }), ' – wartet auf Oli' + (w.begruendung ? '. Begründung: ' + w.begruendung : '')], 'warn'));
    }
    if (!ed) return box;
    var knoepfe = h('div', { class: 'vk-knoepfe' });
    if (pe.st !== 'ok') knoepfe.appendChild(h('button', { type: 'button', class: 'btn btn-ghost btn-klein', text: w.beantragt != null ? 'Antrag ändern' : 'Nachlass beantragen', onclick: function () { nachlassAntrag(info, pe).catch(EG.fehler); } }));
    if (EG.istAdmin() && pe.st !== 'ok') knoepfe.appendChild(h('button', { type: 'button', class: 'btn btn-primary btn-klein', text: 'Nachlass freigeben', onclick: function () { nachlassFreigeben(info, pe).catch(EG.fehler); } }));
    if (EG.istAdmin() && pe.st === 'ok') knoepfe.appendChild(h('button', { type: 'button', class: 'btn btn-ghost btn-klein', text: 'Freigabe zurücknehmen', onclick: function () { aendern(info, pe.def, { status: 'offen', grund: null, wert: { beantragt: w.betrag, begruendung: w.grund }, render: true }).catch(EG.fehler); } }));
    box.appendChild(knoepfe);
    return box;
  }
  function betragGrundDialog(titel, betrag0, grund0, okText, hinweis) {
    var b = h('input', { type: 'text', id: 'vk-n-betrag', inputmode: 'decimal', value: betrag0 == null ? '' : betragFeld(betrag0), placeholder: '0,00' });
    var g = h('textarea', { id: 'vk-n-grund', value: grund0 || '', placeholder: 'Warum?' });
    var res = {};
    return EG.dialog({
      titel: titel, inhalt: [hinweis ? h('p', { class: 'muted klein', style: 'margin-bottom:10px', text: hinweis }) : null, EG.feld('Nachlass in €', b), EG.feld('Begründung (Pflicht)', g)],
      knoepfe: [{ text: 'Abbrechen', art: 'ghost', wert: null }, {
        text: okText, art: 'primary', wert: 'ok',
        aktion: function () {
          var n = parseBetrag(b.value);
          if (n === null || isNaN(n) || n <= 0) return 'Bitte einen Betrag über 0 € eintragen.';
          if (!g.value.trim()) return 'Bitte eine Begründung eintragen.';
          res.betrag = n; res.grund = g.value.trim(); return true;
        }
      }]
    }).then(function (w) { return w === 'ok' ? res : null; });
  }
  async function nachlassAntrag(info, pe) {
    var w = wertKopie(pe);
    var r = await betragGrundDialog('Nachlass beantragen', w.beantragt, w.begruendung, 'Antrag speichern', 'Oli entscheidet über den Nachlass und gibt ihn hier frei.');
    if (!r) return;
    await aendern(info, pe.def, { status: 'offen', grund: null, wert: { beantragt: r.betrag, begruendung: r.grund }, render: true });
    EG.toast('Antrag gespeichert. Sag Oli Bescheid.', 'ok');
  }
  async function nachlassFreigeben(info, pe) {
    if (!EG.istAdmin()) { EG.toast('Nur Oli kann den Nachlass freigeben.', 'fehler'); return; }
    var w = wertKopie(pe);
    var r = await betragGrundDialog('Nachlass freigeben', w.beantragt, w.begruendung, 'Freigeben', null);
    if (!r) return;
    await aendern(info, pe.def, {
      status: 'ok', grund: null, wert: { betrag: r.betrag, grund: r.grund },
      nachher: function () { return freigabeSchreiben('nachlass', 'v4', r.grund, r.betrag); }
    });
    EG.toast('Nachlass freigegeben.', 'ok');
  }

  /* ====================================================================
     SPEICHERN (je Punkt sofort, unter dem Speicher-Schlüssel schreibeIn)
     ==================================================================== */
  async function statusKlick(info, pe, wunsch) {
    var p = pe.def;
    if (!darfPunkt(info.def, p) || pe.auto) return;
    if (pe.eigenSt === wunsch) { await aendern(info, p, { status: 'offen', grund: null }); return; }   // Tipp auf den aktiven Knopf nimmt zurück
    if (wunsch === 'ok') {
      if (p.eingabe === 'bestaetigung' && !wertVon(p, pe.eigen || pe.row)) { await bestaetigen(info, pe); return; }
      await aendern(info, p, { status: 'ok', grund: null });
      return;
    }
    var frage = wunsch === 'nok'
      ? ((p.k === 'freigabe' || p.k === 'freigabe_auslieferung') ? 'Welche Rückfrage hast du?' : 'Was ist nicht in Ordnung?')
      : 'Warum entfällt dieser Punkt?';
    var g = await EG.eingabe(frage, { titel: p.text, vorgabe: ((pe.eigen || pe.row) && (pe.eigen || pe.row).grund) || '', platzhalter: 'Grund (Pflicht)', ok: 'Speichern' });
    if (!g) return;
    await aendern(info, p, { status: wunsch, grund: g });
  }

  function pruefeOk(info, p, neu) {
    var w = neu.wert || {};
    if (p.eingabe === 'auswahl' && !w.auswahl) return 'Bitte erst „' + (p.label || 'Auswahl') + '“ wählen.';
    if (p.eingabe === 'datum' && !w.datum) return 'Bitte erst „' + (p.label || 'Datum') + '“ eintragen.';
    if (p.eingabe === 'betrag' && (w.betrag == null || w.betrag === '')) return 'Bitte erst „' + (p.label || 'Betrag') + '“ eintragen.';
    if (p.eingabe === 'text' && p.wertPflicht && !String(w.text || '').trim()) return 'Bitte erst „' + (p.label || 'Eintrag') + '“ eintragen.';
    if (p.eingabe === 'bestaetigung' && !(w.name && w.datum)) return 'Bitte Name und Datum bestätigen.';
    if (p.textBei && w.auswahl && p.textBei.indexOf(w.auswahl) >= 0 && !String(w.text || '').trim()) return 'Bitte den Grund eintragen.';
    if (p.fotoPflicht && !(neu.fotos || []).length) return 'Dafür brauchst du mindestens ein Foto.';
    if (p.nurNachAllen) {
      // nokReicht (Olis Freigabe): ein Punkt mit NOK und Grund gilt als geprüft – „freigeben, Rest nachholen“ (Oli 31.10.2026)
      var rest = info.punkte.filter(function (x) { return x.def !== p && x.def.pflicht && x.st !== 'ok' && x.st !== 'entfaellt' && !(p.nokReicht && x.st === 'nok'); });
      if (rest.length) return 'Erst müssen die anderen Pflichtpunkte dieser Phase ' + (p.nokReicht ? 'geprüft' : 'erledigt') + ' sein (noch ' + rest.length + ' offen).';
    }
    return null;
  }

  /** Eine Zeile unter dem Speicher-Schlüssel ablegen: verkauf.punkt (Phase/Schlüssel) oder, für ac_*, verkauf.auslieferung_punkt (über die interne Nr.). */
  async function schreibeZeile(ziel, d) {
    if (ziel.phase === 'ac') {
      if (!S.akte.interne_nr) throw new Error('Diese Akte hat keine interne Nr. – die Auslieferungs-Checkliste braucht sie.');
      var ra = chk(await T.ac().upsert({
        interne_nr: S.akte.interne_nr, punkt_key: ziel.k, status: d.status, wert: d.wert, grund: d.grund, fotos: d.fotos,
        erledigt_von_name: d.name, erledigt_am: d.am, updated_at: jetzt()
      }, { onConflict: 'interne_nr,punkt_key' }).select().single());
      return ra.data;
    }
    var r = chk(await T.punkt().upsert({
      akte_id: S.id, phase: ziel.phase, punkt_key: ziel.k, status: d.status, wert: d.wert, grund: d.grund, fotos: d.fotos,
      erledigt_von_name: d.name, erledigt_am: d.am, updated_at: jetzt()
    }, { onConflict: 'akte_id,phase,punkt_key' }).select().single());
    return r.data;
  }

  /** Ändert einen Punkt und speichert sofort.
      patch: { status?, wert?, grund?, fotos?, auto? (Wert eingegeben → OK, wenn alles stimmt, sonst offen), render?, nachher? } → Promise<boolean> */
  function aendern(info, p, patch) {
    return seriell(async function () {
      var ziel = p.schreibeIn;
      if (!ziel) { EG.toast('Dieser Punkt kommt aus der Masterliste oder den Fahrzeugdaten und lässt sich hier nicht ändern.', 'fehler'); return false; }
      var pm = (S.pm[ziel.phase] = S.pm[ziel.phase] || {}), row = pm[ziel.k] || null, alt = row ? (row.status || 'offen') : 'offen';
      var neu = {
        status: patch.status !== undefined ? patch.status : alt,
        wert: patch.wert !== undefined ? patch.wert : (row ? row.wert : null),
        grund: patch.grund !== undefined ? patch.grund : (row ? row.grund : null),
        fotos: patch.fotos !== undefined ? patch.fotos : (row && row.fotos ? row.fotos : [])
      };
      if (patch.auto) {   // Wert eingegeben bzw. gelöscht → Status folgt
        var leer = !wertVon(p, { wert: neu.wert });
        neu.status = leer ? 'offen' : 'ok';
        if (neu.status === 'ok' && pruefeOk(info, p, neu)) neu.status = 'offen';
      } else if (neu.status === 'ok') {
        var fehler = pruefeOk(info, p, neu);
        if (fehler) { EG.toast(fehler, 'fehler'); return false; }
      }
      if ((neu.status === 'nok' || neu.status === 'entfaellt') && !neu.grund) { EG.toast('Bitte einen Grund eintragen.', 'fehler'); return false; }
      if (neu.status === 'ok' || neu.status === 'offen') neu.grund = null;
      var gesetzt = neu.status !== 'offen';
      pm[ziel.k] = await schreibeZeile(ziel, { status: neu.status, wert: neu.wert, grund: neu.grund, fotos: neu.fotos, name: gesetzt ? meinName() : null, am: gesetzt ? jetzt() : null });
      if (patch.nachher) await patch.nachher();
      if (ziel.phase === 'p10' && ziel.k === 'kunde_zufrieden' && neu.status === 'ok' && neu.wert && neu.wert.auswahl && window.VK_UEBERGABE && typeof window.VK_UEBERGABE.nachZufriedenheit === 'function') {
        try { await window.VK_UEBERGABE.nachZufriedenheit(S.akte, neu.wert.auswahl); } catch (e) { console.warn('VK_UEBERGABE.nachZufriedenheit:', e && e.message); }
      }
      // Nebenwirkungen auf die Akte
      var extra = {};
      if (neu.status === 'ok' && neu.wert) {
        if (p.setzeVerkaeufer && neu.wert.auswahl && istBuero()) extra.verkaeufer = neu.wert.auswahl;
        if (p.setzeBestellNr && neu.wert.text) extra.bestell_nr = neu.wert.text;
        if (p.setzeUebergabetermin && neu.wert.datum) extra.uebergabe_termin = neu.wert.datum;
      }
      await nachSpeichern(extra);
      var voll = neu.status !== alt || (p.eingabe && p.eingabe !== 'text') || Object.keys(extra).length > 0 || !!patch.render;
      aktualisiere(voll);
      return true;
    });
  }
  /** Phase der Akte nachführen (p01…p11, abgeschlossen) und Felder aus den Punkten übernehmen. */
  async function nachSpeichern(extra) {
    neuBerechnen();
    var upd = Object.assign({}, extra), a = S.akte;
    if (a.phase_aktuell !== 'abgebrochen' && a.phase_aktuell !== S.calc.aktuell) upd.phase_aktuell = S.calc.aktuell;
    if (!Object.keys(upd).length) return;
    upd.updated_at = jetzt();
    var r = chk(await T.akte().update(upd).eq('id', S.id).select().single());
    S.akte = r.data;
    neuBerechnen();
  }

  /* ---------- unten: Notiz, Abbrechen, Löschen ---------- */
  function untenKarte() {
    var a = S.akte;
    var ta = h('textarea', { id: 'vk-notiz', value: a.notiz || '', placeholder: 'Eigene Notiz zur Akte (optional)' });
    ta.addEventListener('change', function () {
      seriell(async function () {
        var r = chk(await T.akte().update({ notiz: ta.value.trim() || null, updated_at: jetzt() }).eq('id', S.id).select().single());
        S.akte = r.data;
      }).catch(EG.fehler);
    });
    var karte = h('div', { class: 'karte', style: 'margin-top:18px' }, EG.feld('Notiz zur Akte', ta));
    var zeile = h('div', { class: 'vk-knoepfe' });
    if (erlaubtAnlegen()) {
      if (a.phase_aktuell === 'abgebrochen') zeile.appendChild(h('button', { type: 'button', class: 'btn btn-ghost', text: 'Akte wieder öffnen', onclick: function () { wiederOeffnen().catch(EG.fehler); } }));
      else zeile.appendChild(h('button', { type: 'button', class: 'btn btn-ghost', text: 'Verkauf abbrechen …', onclick: function () { abbrechen().catch(EG.fehler); } }));
    }
    if (EG.istAdmin()) zeile.appendChild(h('button', { type: 'button', class: 'btn btn-gefahr', text: 'Akte löschen …', onclick: function () { loeschen().catch(EG.fehler); } }));
    if (zeile.childNodes.length) karte.appendChild(zeile);
    return karte;
  }
  async function abbrechen() {
    var g = await EG.eingabe('Warum wird der Verkauf abgebrochen?', { titel: 'Verkauf abbrechen', platzhalter: 'Grund (z. B. Kunde kauft nicht)', ok: 'Abbrechen' });
    if (!g) return;
    await seriell(async function () {
      var notiz = (S.akte.notiz ? S.akte.notiz + '\n' : '') + 'Abgebrochen am ' + EG.fmtDatum(EG.heute()) + ': ' + g;
      var r = chk(await T.akte().update({ phase_aktuell: 'abgebrochen', notiz: notiz, updated_at: jetzt() }).eq('id', S.id).select().single());
      S.akte = r.data;
    });
    await ladeDetail();
  }
  async function wiederOeffnen() {
    await seriell(async function () {
      var a2 = Object.assign({}, S.akte, { phase_aktuell: 'p01' });
      var c = berechne(a2, S.pm, S.frei, S.kx);
      var r = chk(await T.akte().update({ phase_aktuell: c.aktuell, updated_at: jetzt() }).eq('id', S.id).select().single());
      S.akte = r.data;
    });
    await ladeDetail();
  }
  async function loeschen() {
    if (!EG.istAdmin()) return;
    var ja = await EG.bestaetigen('Die Akte „' + akteTitel(S.akte) + '“ (' + (S.akte.kunde_name || 'ohne Kunde') + ') mit allen Haken wird endgültig gelöscht. Das lässt sich nicht rückgängig machen.', { ja: 'Endgültig löschen', gefahr: true, titel: 'Akte löschen?' });
    if (!ja) return;
    chk(await T.akte().delete().eq('id', S.id));
    EG.toast('Akte gelöscht.', 'ok');
    zurListe();
  }

  /* ====================================================================
     DEMO-DATEN (nur ?demo=1)
     Drei Akten im neuen Ablauf (fahrzeug_id ST-26-9001 … 9003, interne Nr. 9001 … 9003; die Reiter Zahlungen und Transport nutzen dieselben IDs):
       9001 früh (Phase 2 Verkaufsgespräch) · 9002 mittendrin (Phase 7, mit Inzahlungnahme und offener Zahlung, Freigabe in Vertretung durch Dispo)
       9003 kurz vor der Auslieferung (Phase 9, bezahlt, Fehlteile eingetragen)
     Dazu eine Alt-Akte mit v-Werten (phase_aktuell v8, ohne Fahrzeug-ID), damit man sieht, dass alte Akten richtig angezeigt werden.
     Die Akten, Haken, Freigaben und bestand.v_verkauf_sicht werden sofort beim Laden angelegt (EG.demoSeed), die Auslieferungs-Checkliste
     und ein paar bestand.*-Felder beim Öffnen des Reiters (über den Demo-Client, damit nichts überschrieben wird).
     ==================================================================== */
  var DEMO = { akten: null, acRows: null, bestand: null };
  function demoBauen() {
    var heute = new Date();
    function tag(n) { var x = new Date(heute); x.setDate(x.getDate() + n); return EG.isoDatum(x); }
    function vor(n, std) { var x = new Date(heute); x.setDate(x.getDate() - n); x.setHours(std || 10, 20, 0, 0); return x.toISOString(); }
    var rows = [], frei = [], uuidZaehler = 0;
    function gid(nr) { return 'a0000001-0000-4000-8000-0000000000' + (nr < 10 ? '0' : '') + nr; }
    function akte(nr, o) {
      return Object.assign({
        id: gid(nr), interne_nr: '', autrado_nr: '', fin: '', hersteller: '', modell: '', farbe: '', ml_ref: null, lead_ref: null, bestell_nr: null, job_nr: null,
        kunde_name: '', kunde_telefon: '0711 000000', kunde_email: null, verkaeufer: 'OS', phase_aktuell: 'p01', uebergabe_termin: null, notiz: null, nachtrag: false,
        fahrzeug_id: null, zubehoer: null, evb_nr: null, created_at: vor(8), updated_at: vor(1), erstellt_von_name: 'Demo Mitarbeiter'
      }, o);
    }
    var A = akte(1, { interne_nr: '90101', autrado_nr: '909001', fahrzeug_id: 'ST-26-9001', fin: 'DEMO0000000009001', hersteller: 'Hyundai', modell: 'Tucson 1.6 T-GDI Demo', farbe: 'Polar White', kunde_name: 'Muster, Max', kunde_email: 'max.muster@demo.example', verkaeufer: 'NP', phase_aktuell: 'p02', zubehoer: 'Fußmatten, Dachträger', evb_nr: 'DEMO-EVB-0001', created_at: vor(3) });
    var B = akte(2, { interne_nr: '90102', autrado_nr: '909002', fahrzeug_id: 'ST-26-9002', fin: 'DEMO0000000009002', hersteller: 'Kia', modell: 'Sportage 1.6 Demo', farbe: 'Deep Chroma Blue', kunde_name: 'Beispiel, Erika', kunde_email: 'erika.beispiel@demo.example', verkaeufer: 'OS', bestell_nr: '2610-9002', uebergabe_termin: tag(5), phase_aktuell: 'p07', zubehoer: 'Winterräder (4 Stück)', created_at: vor(9) });
    var C = akte(3, { interne_nr: '90103', autrado_nr: '909003', fahrzeug_id: 'ST-26-9003', fin: 'DEMO0000000009003', hersteller: 'Opel', modell: 'Mokka Demo Edition', farbe: 'Rot', kunde_name: 'Probe, Peter', kunde_email: 'peter.probe@demo.example', verkaeufer: 'AI', bestell_nr: '2610-9003', uebergabe_termin: tag(2), phase_aktuell: 'p09', created_at: vor(14) });
    var D = akte(4, { interne_nr: '90104', autrado_nr: '900104', fin: 'DEMO0000000090104', hersteller: 'Skoda', modell: 'Octavia Demo (Altakte mit v-Werten)', farbe: 'Grau', kunde_name: 'Alt, Anton', verkaeufer: 'OS', bestell_nr: '2610-90104', uebergabe_termin: tag(9), phase_aktuell: 'v8', created_at: vor(20) });

    function zeileDemo(a, phase, key, f) {
      var r = {
        id: 'd0000002-0000-4000-8000-' + ('000000000000' + (++uuidZaehler)).slice(-12), akte_id: a.id, phase: phase, punkt_key: key, status: f.status || 'ok', wert: f.wert || null, grund: f.grund || null, fotos: [],
        erledigt_von_name: f.status === 'offen' ? null : 'Demo Mitarbeiter', erledigt_am: f.status === 'offen' ? null : vor(2), updated_at: vor(2)
      };
      rows.push(r);
      return r;
    }
    function stdWert(p, q, s) {
      if (s.wertObjekt) return s.wertObjekt;
      if (q.okWerte) return { wert: s.wert || q.okWerte[0] };
      switch (p.eingabe) {
        case 'auswahl': return { auswahl: s.auswahl || (p.optionen || [])[0] };
        case 'datum': return { datum: s.datum || tag(-2) };
        case 'betrag': return { betrag: s.betrag != null ? s.betrag : 1000 };
        case 'text': return { text: s.text || 'Demo' };
        case 'bestaetigung': return { name: 'Demo Mitarbeiter', datum: EG.heute() };
        default: return null;
      }
    }
    /** Füllt die Pflichtpunkte einer Phase (unter ihren Speicher-Schlüsseln) als „ok“. o: { set:{k:{…}}, nur:[k], ohne:[k], alle:bool } */
    function fuelle(a, phKey, o) {
      o = o || {};
      var set = o.set || {}, gesehen = fuelle.gesehen = fuelle.gesehen || {};
      PH_BY[phKey].punkte.forEach(function (p) {
        var q = p.schreibeIn || (p.quelle && p.quelle[0]);
        if (!q || p.gruppe === 'ac' || q.phase === 'ac') return;
        if (o.nur && o.nur.indexOf(p.k) < 0) return;
        if (o.ohne && o.ohne.indexOf(p.k) >= 0) return;
        if (!p.pflicht && !o.alle && !(o.nur && o.nur.indexOf(p.k) >= 0) && !set[p.k]) return;
        var s = set[p.k] || {};
        if (s.status === 'offen') return;
        var id = a.id + q.phase + '.' + q.k;
        if (gesehen[id]) return; gesehen[id] = true;
        var st = s.status || 'ok';
        zeileDemo(a, q.phase, q.k, { status: st, wert: st === 'ok' ? stdWert(p, q, s) : null, grund: s.grund });
      });
    }
    function phaseEntf(a, ph, grund) { zeileDemo(a, ph, '_phase', { status: 'entfaellt', grund: grund }); }

    // ---- A: Muster, Max – im Verkaufsgespräch (Phase 2)
    fuelle(A, 'p01', { set: { anfrage_da: { auswahl: 'mobile.de' }, verkaeufer_zugeteilt: { auswahl: 'NP' }, kunde_angerufen: { auswahl: 'erreicht' }, ergebnis: { auswahl: 'Termin steht' }, termin_vereinbart: { datum: tag(-1) } } });
    fuelle(A, 'p02', { nur: ['kundendaten', 'inzahlung', 'finanzierung', 'probefahrt', 'fuehrerschein', 'ausweis_probefahrt'], set: { inzahlung: { auswahl: 'Nein' }, finanzierung: { auswahl: 'Ja' }, probefahrt: { auswahl: 'Ja' }, kunde_da: { auswahl: 'mit Termin' } } });

    // ---- B: Beispiel, Erika – Phase 7 (Aufbereitung), Inzahlungnahme, Zahlung offen, Freigabe in Vertretung durch Dispo
    phaseEntf(B, 'v1', 'Kundin kam ohne Anfrage direkt ins Haus');
    fuelle(B, 'p02', {
      ohne: ['fuehrerschein', 'ausweis_probefahrt', 'vertrag', 'kennzeichen_versicherung', 'km_vorher', 'km_nachher'],
      set: { inzahlung: { auswahl: 'Ja' }, finanzierung: { auswahl: 'Nein' }, probefahrt: { auswahl: 'Nein' }, ergebnis: { auswahl: 'Weiter zum Angebot' }, angebot: { betrag: 31900 },
        zugaben: { status: 'entfaellt', grund: 'Keine Zugaben' }, nachlass: { status: 'entfaellt', grund: 'Kein Nachlass vereinbart' } }
    });
    fuelle(B, 'p03', {
      ohne: ['fin_gerechnet', 'fin_antrag', 'finanzierungsunterlagen_pruefen', 'zul_wunschkennzeichen'],
      set: { zahlungsart: { auswahl: 'Überweisung' }, anzahlung: { betrag: 2000 }, abholung_lieferung: { auswahl: 'Abholung' }, wunschtermin: { datum: tag(5) }, bestellung_autrado: { text: '2610-9002' }, zul_evb: { text: 'DEMO1234567' } }
    });
    fuelle(B, 'p04', { set: { inz_verrechnet: { betrag: 2000 }, abloese_geklaert: { status: 'entfaellt', grund: 'Keine Ablöse' } } });
    fuelle(B, 'p05');
    frei.push({ id: EG.uuid(), akte_id: B.id, art: 'akte_frei', phase: 'v6', grund: 'Freigabe an die Dispo', betrag: null, von_name: 'Dispo (Demo)', am: vor(3) });
    frei.push({ id: EG.uuid(), akte_id: B.id, art: 'verkauf', phase: 'p05', grund: 'Freigabe in Vertretung durch Dispo (Demo)', betrag: null, von_name: 'Dispo (Demo)', am: vor(3), vertretung: true });
    fuelle(B, 'p07', { nur: ['repdoc_kunde', 'repdoc_fahrzeug', 'auftrag'] });
    fuelle(B, 'a1_kunde', { nur: ['repdoc_rechnung', 'zahlungseinladung', 'anzahlung_da'], set: { anzahlung_da: { betrag: 2000 } } });

    // ---- C: Probe, Peter – kurz vor der Auslieferung (Phase 9), bezahlt
    fuelle(C, 'p01', { set: { anfrage_da: { auswahl: 'Website' }, verkaeufer_zugeteilt: { auswahl: 'AI' }, kunde_angerufen: { auswahl: 'nicht erreicht' }, ergebnis: { auswahl: 'Termin steht' }, termin_vereinbart: { datum: tag(-12) } } });
    fuelle(C, 'p02', {
      set: { inzahlung: { auswahl: 'Nein' }, finanzierung: { auswahl: 'Ja' }, probefahrt: { auswahl: 'Ja' }, ergebnis: { auswahl: 'Weiter zum Angebot' }, zugaben: { betrag: 250 },
        nachlass: { wertObjekt: { betrag: 300, grund: 'Treuebonus (Demo)' } }, km_vorher: { text: '12 km, Tank voll' }, km_nachher: { text: '19 km' } }
    });
    frei.push({ id: EG.uuid(), akte_id: C.id, art: 'nachlass', phase: 'v4', grund: 'Treuebonus (Demo)', betrag: 300, von_name: 'Oli (Demo)', am: vor(9) });
    fuelle(C, 'p03', { set: { zahlungsart: { auswahl: 'Finanzierung' }, anzahlung: { status: 'entfaellt', grund: 'Keine Anzahlung' }, abholung_lieferung: { auswahl: 'Lieferung' }, wunschtermin: { datum: tag(2) }, bestellung_autrado: { text: '2610-9003' }, zul_evb: { text: 'DEMO7654321' } } });
    fuelle(C, 'p05');
    frei.push({ id: EG.uuid(), akte_id: C.id, art: 'akte_frei', phase: 'v6', grund: 'Freigabe an die Dispo', betrag: null, von_name: 'Oli (Demo)', am: vor(6) });
    frei.push({ id: EG.uuid(), akte_id: C.id, art: 'verkauf', phase: 'p05', grund: 'Freigabe Verkauf durch OS', betrag: null, von_name: 'Oli (Demo)', am: vor(6), vertretung: false });
    fuelle(C, 'p07');
    fuelle(C, 'p08');
    fuelle(C, 'a1_kunde', { set: { restzahlung: { betrag: 18900 }, anzahlung_da: { status: 'entfaellt', grund: 'Keine Anzahlung vereinbart' } } });
    fuelle(C, 'a1_lieferant', { set: { lief_rechnung: { auswahl: 'Liegt vor (mit Einladung)' } } });

    // ---- D: Alt-Akte (v-Werte, phase_aktuell v8, keine Fahrzeug-ID)
    fuelle(D, 'p01', { set: { anfrage_da: { auswahl: 'Kleinanzeigen' }, verkaeufer_zugeteilt: { auswahl: 'OS' } } });
    fuelle(D, 'p02', { set: { inzahlung: { auswahl: 'Nein' }, finanzierung: { auswahl: 'Nein' }, probefahrt: { auswahl: 'Nein' }, ergebnis: { auswahl: 'Weiter zum Angebot' }, nachlass: { status: 'entfaellt', grund: 'Kein Nachlass' }, zugaben: { status: 'entfaellt', grund: 'Keine Zugaben' } }, ohne: ['fuehrerschein', 'ausweis_probefahrt', 'vertrag', 'kennzeichen_versicherung', 'km_vorher', 'km_nachher'] });
    fuelle(D, 'p03', { ohne: ['fin_gerechnet', 'fin_antrag', 'finanzierungsunterlagen_pruefen'], set: { zahlungsart: { auswahl: 'Überweisung' }, anzahlung: { status: 'entfaellt', grund: 'Keine Anzahlung' }, abholung_lieferung: { auswahl: 'Abholung' }, wunschtermin: { datum: tag(9) }, bestellung_autrado: { text: '2610-90104' }, zul_evb: { text: 'DEMO0000001' } } });
    fuelle(D, 'p05');
    frei.push({ id: EG.uuid(), akte_id: D.id, art: 'akte_frei', phase: 'v6', grund: 'Freigabe an die Dispo', betrag: null, von_name: 'Oli (Demo)', am: vor(12) });
    fuelle(D, 'a1_kunde', { nur: ['repdoc_rechnung', 'zahlungseinladung'] });
    fuelle(D, 'p07', { nur: ['repdoc_kunde', 'repdoc_fahrzeug', 'auftrag'] });

    // Auslieferungs-Checkliste (verkauf.auslieferung_punkt), später über den Demo-Client eingetragen
    var ac = [];
    function acZeile(nr, def, st, o) {
      o = o || {};
      var wert = null;
      if (st === 'ok' && def.eingabe === 'text') wert = { text: def.k === 'ac_reifendruck' ? '2,4 / 2,6' : '-25' };
      if (st === 'ok' && def.eingabe === 'bestaetigung') wert = { name: 'Demo Aufbereiter', datum: EG.heute() };
      ac.push({ id: 'd0000003-0000-4000-8000-' + ('000000000000' + (ac.length + 1)).slice(-12), interne_nr: nr, punkt_key: def.k, status: st, wert: wert, grund: o.grund || null, fotos: [],
        erledigt_von_name: 'Demo Aufbereiter', erledigt_am: vor(1), updated_at: vor(1) });
    }
    window.VK_AC.punkte.forEach(function (d, i) {
      var end = d.k.indexOf('ac_end_') === 0;
      if (d.k === 'ac_ichfreumich') { acZeile('90103', d, 'ok'); return; }
      acZeile('90103', d, d.k === 'ac_laden' ? 'entfaellt' : 'ok', { grund: 'Verbrenner, kein Ladekabel nötig' });   // 9003: alles erledigt inkl. Endkontrolle
      if (!end && i < 14) acZeile('90102', d, d.k === 'ac_laden' ? 'entfaellt' : 'ok', { grund: 'Verbrenner, kein Ladekabel nötig' });   // 9002: etwa ein Drittel
    });

    DEMO.akten = [A, B, C, D];
    DEMO.rows = rows; DEMO.frei = frei; DEMO.acRows = ac;
    DEMO.bestand = {
      fahrzeug: [{ stieber_id: 'ST-26-9001', fehlteile: '' }, { stieber_id: 'ST-26-9002', fehlteile: '' }, { stieber_id: 'ST-26-9003', fehlteile: 'Ladekabel Typ 2, Zweitschlüssel' }]
    };
    EG.demoSeed('verkauf.akte', DEMO.akten);
    EG.demoSeed('verkauf.punkt', DEMO.rows);
    EG.demoSeed('verkauf.freigabe', DEMO.frei);
    // Demo-Umfragen (nur OS liest sie): C schlecht (Note 2, noch nicht gesehen), B gut
    EG.demoSeed('verkauf.umfrage', [
      { id: EG.uuid(), akte_id: C.id, token: EG.uuid(), erstellt_am: vor(5), erstellt_von_name: 'Demo', beantwortet_am: vor(1), antworten: { gesamt: 2, weiterempfehlung: 'nein' }, note_gesamt: 2, gesehen_am: null, gesehen_von_name: null },
      { id: EG.uuid(), akte_id: B.id, token: EG.uuid(), erstellt_am: vor(6), erstellt_von_name: 'Demo', beantwortet_am: vor(2), antworten: { gesamt: 5, weiterempfehlung: 'ja' }, note_gesamt: 5, gesehen_am: null, gesehen_von_name: null }
    ]);
    EG.demoSeed('bestand.v_verkauf_sicht', [
      { stieber_id: 'ST-26-9001', interne_nr: '90101', zahlbetrag_kunde: 31900, bezahlt: false, standtage: 12 },
      { stieber_id: 'ST-26-9002', interne_nr: '90102', zahlbetrag_kunde: 28900, bezahlt: false, standtage: 31 },
      { stieber_id: 'ST-26-9003', interne_nr: '90103', zahlbetrag_kunde: 21900, bezahlt: true, standtage: 44 }
    ]);
    // Ansicht verkauf.v_zahlstand (Startwerte; beim Lesen rechnet die Demo sie nach der Ansichtsregel aus den Demo-Tabellen neu – siehe demoZahlstandNeu)
    EG.demoSeed('verkauf.v_zahlstand', [
      { akte_id: gid(1), fahrzeug_id: 'ST-26-9001', zahlstand: 'offen' },
      { akte_id: gid(2), fahrzeug_id: 'ST-26-9002', zahlstand: 'teilweise' },
      { akte_id: gid(3), fahrzeug_id: 'ST-26-9003', zahlstand: 'bezahlt' },
      { akte_id: gid(4), fahrzeug_id: null, zahlstand: 'offen' }
    ]);
  }
  /** Beim Öffnen des Reiters: Auslieferungs-Checkliste und bestand.*-Felder der Demo-Akten über den Demo-Client eintragen (ergänzt, überschreibt nichts Fremdes). */
  async function demoNachladen() {
    if (!EG.demo || S.gesaet) return;
    S.gesaet = true;
    try {
      AC_UI.demoSaen();   // Haken der Auslieferungs-Checkliste (gleiche Tabelle wie im Reiter „Auslieferung“)
      if (DEMO.acRows && DEMO.acRows.length) chk(await T.ac().upsert(DEMO.acRows, { onConflict: 'interne_nr,punkt_key' }));
      if (DEMO.bestand) chk(await EG.tab('bestand', 'fahrzeug').upsert(DEMO.bestand.fahrzeug, { onConflict: 'stieber_id' }));
    } catch (e) { console.warn('Demo-Nachladen:', e && e.message); }
  }
  if (EG.demo) { try { demoBauen(); } catch (e) { console.error('Demo-Daten Verkauf:', e); } }
})();
