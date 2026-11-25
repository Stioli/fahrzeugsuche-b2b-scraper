/* =====================================================================
   Fahrzeugeingang-Tool · Reiter „Inzahlungnahmen“ (Paket P4)
   Autohaus Stieber GmbH · Stand 25.11.2026 (Paket 2 Inzahlung: Ankauf-Ansicht statt Detailfenster) · vorher Paket 1, 30.10.2026
   NEU 25.11.2026 (Paket 2, Oli-Freigabe, freigegebene Vorschau akte-vorschau/liste-vorschau):
   · Detailfenster entfällt: Klick auf eine Listenzeile öffnet direkt die Ankauf-Ansicht (Formular, Modus Bearbeiten)
   · Sticky Kopfleiste unter der Reiterleiste (Fahrzeug, Int.-Nr., Status, Bearbeiter, Datum; ← Liste, Speichern,
     Drucken ▾ mit Kaufvertrag/Zustandsbericht/Übergabeprotokoll, Fahrzeug übernehmen); Handy: feste Leiste unten
   · Block „Übernahme bei der Abgabe“ oben im Formular (nur wenn uebernahme_status gesetzt), Entscheidung nur admin
   · Sprungleiste mit ✓/! je Abschnitt (gleiche Pflichtregeln wie beim Speichern, live), Abschnitte auf-/zuklappbar
   · Banner „Ungespeicherte Änderungen“, Rückfrage beim Verlassen (← Liste, Reiterwechsel, beforeunload)
   · Liste: Statusfilter als Knöpfe; Spalten Kunde · Fahrzeug · Kennzeichen · Fgst.-Nr. · Int.-Nr. · Datum · Status · Kaufpreis
   · Fahrzeugschein per Foto/Scan einlesen (aus alter App v5.2; Edge Function „fahrzeugschein-lesen“ unverändert,
     Speichern gesperrt bis „Daten geprüft“; im Demo-Modus simuliert); PLZ mit Ziffern-Tastatur
   Zuvor 25.11.2026 (Paket 1, Oli-Freigabe, Plan 2026-11-25_Plan-Inzahlungnahme-zusammenfuehren_v1):
   · Zusicherungen als Ja/Nein-Pflichtfragen wie alte App v5 (ZUS_ROWS, Merker zus_ja_nein; Umkehrlogik
     für Hagel/Nachlack/Mietwagen/EU-Import; alte Datensätze ohne Merker: nicht Angehakte = offen)
   · Feld „Schäden laut Verkäufer“ (vk_schaeden) und Prüfzeile „Fahrzeug überprüft“ (fz_geprueft*)
   · Marge-Hinweis unter dem Ankaufspreis entfernt (Statistik-Kacheln waren schon entfernt)
   · Kaufvertrag: alles schwarz (Logo bleibt farbig), echtes Logo-Bild statt Text-SVG (auch Übergabeprotokoll
     und Zustandsbericht), § 4 neu wie alte App v5 (Ja/Nein-Tabelle, KD, Schäden, Unterschrift zu § 4),
     Seitenumbrüche gestrafft; Druck wartet, bis das Logo geladen ist

   Übernimmt 1:1 alle Funktionen der alten Fahrzeugankauf-App
   (stioli.github.io/fahrzeugankauf-app, Stand 22.06.2026):
   Liste mit Filter/Sortierung/Statistik, Formular mit allen Feldern der
   Tabelle public.fahrzeugankauf, Bearbeiten, Detailansicht, Lightbox und
   die Druckansichten Kaufvertrag, Zustandsbericht, Übergabeprotokoll.
   NEU: „Fahrzeug übernehmen“ (Übernahme-Checkliste bei der Abgabe mit
   automatischem Abgleich zur Bewertung).

   Erwartet window.EG (eingang-core.js):
     EG.sb · EG.nutzerName() · EG.toast(t) · EG.bestaetigen(t)
     EG.fotoHochladen(file, pfad) · EG.fotoAnzeigen(pfad)
     EG.onTab('inzahlung', renderFn(container)) · EG.demo
   Alle Schnittstellen werden defensiv benutzt (Rückfälle eingebaut).

   Datenschutz: Dieser Code enthält keine Kundendaten. Die Demo-Daten sind
   frei erfunden. Kundendaten liegen nur in Supabase.
   ===================================================================== */
(function () {
  'use strict';

  /* ===================================================================
     0. Konstanten
     =================================================================== */
  var TAB = 'inzahlung';
  var BUCKET_NEU = 'eingang-fotos';   // privat
  var BUCKET_ALT = 'ankauf-fotos';    // alt, öffentlich (wird später umgezogen)
  var GRENZE_EURO = 100;              // bis 100 € einigt sich der Verkauf selbst, darüber entscheidet Oli
  var KM_TOLERANZ = 500;              // km-Abweichung (±), ab der ein Unterschied rot wird (Oli, 30.10.2026)

  // Mängel-Zeilen (wie alte App)
  var MN_ROWS = [
    { key: 'hu', label: 'Hauptuntersuchung (HU)' },
    { key: 'kd', label: 'Kundendienst' },
    { key: 'vorderachse', label: 'Vorderachse' },
    { key: 'hinterachse', label: 'Hinterachse' },
    { key: 'unterboden', label: 'Unterboden' },
    { key: 'motor', label: 'Motor' },
    { key: 'getriebe', label: 'Getriebe' },
    { key: 'reifen', label: 'Reifen' },
    { key: 'bremsen', label: 'Bremsen' },
    { key: 'karosserie1', label: 'Karosserie/Lack 1' },
    { key: 'karosserie2', label: 'Karosserie/Lack 2' },
    { key: 'karosserie3', label: 'Karosserie/Lack 3' },
    { key: 'karosserie4', label: 'Karosserie/Lack 4' },
    { key: 'karosserie5', label: 'Karosserie/Lack 5' },
    { key: 'aufbereitung', label: 'Aufbereitung' },
    { key: 'garantie', label: 'Garantierückstellung' }
  ];
  var MN_PLACEHOLDER = {
    hu: 'z.B. HU fällig, abgelaufen…', kd: 'z.B. Öl + Filter, Zahnriemen…',
    vorderachse: 'z.B. Traggelenke, Spurstangen…', hinterachse: 'z.B. Längslenker, Silentbuchsen…',
    unterboden: 'z.B. Rostschäden, Auspuff…', motor: 'z.B. Ölverlust, Motorgeräusch…',
    getriebe: 'z.B. Schaltprobleme, undicht…', reifen: 'z.B. Reifen erneuern…',
    bremsen: 'z.B. Beläge + Scheiben VA…',
    karosserie1: 'z.B. Delle Fahrertür…', karosserie2: 'z.B. Kratzer Stoßstange…',
    karosserie3: 'z.B. Steinschlag Motorhaube…', karosserie4: '', karosserie5: '',
    aufbereitung: 'z.B. Innen- und Außenpflege…', garantie: 'z.B. Getriebegarantie 12 Monate…'
  };
  var LACK_POINTS = [
    { key: 'motorhaube', label: 'Motorhaube' },
    { key: 'dach', label: 'Dach' },
    { key: 'heckklappe', label: 'Heckklappe / Kofferraum' },
    { key: 'kotfluegel_vl', label: 'Kotflügel vorne links' },
    { key: 'tuer_vl', label: 'Tür vorne links' },
    { key: 'tuer_hl', label: 'Tür hinten links' },
    { key: 'seitenwand_hl', label: 'Seitenwand hinten links' },
    { key: 'schweller_l', label: 'Schweller links' },
    { key: 'kotfluegel_vr', label: 'Kotflügel vorne rechts' },
    { key: 'tuer_vr', label: 'Tür vorne rechts' },
    { key: 'tuer_hr', label: 'Tür hinten rechts' },
    { key: 'seitenwand_hr', label: 'Seitenwand hinten rechts' },
    { key: 'schweller_r', label: 'Schweller rechts' }
  ];
  var AUSST = [
    ['ausstattung_navi', '🗺️ Navigation (Werks)', 'Navigation (Werks)'],
    ['ausstattung_soundsystem', '📱 Apple CarPlay / Android Auto', 'Apple CarPlay / Android Auto'],
    ['ausstattung_klimaautomatik', '❄️ Klimaautomatik', 'Klimaautomatik'],
    ['ausstattung_sitzheizung', '🪑 Sitzheizung vorne', 'Sitzheizung vorne'],
    ['ausstattung_shz_hinten', '🪑 Sitzheizung hinten', 'Sitzheizung hinten'],
    ['ausstattung_leder', '✨ Lederausstattung', 'Lederausstattung'],
    ['ausstattung_panorama', '🔲 Panoramadach', 'Panoramadach'],
    ['ausstattung_ahk', '🔗 Anhängerkupplung', 'Anhängerkupplung'],
    ['ausstattung_standhz', '🌡️ Standheizung', 'Standheizung'],
    ['ausstattung_lenkradheizung', '🎯 Lenkradheizung', 'Lenkradheizung'],
    ['ausstattung_eph_vorne', '🔊 Einparkhilfe vorne (EPH)', 'EPH vorne'],
    ['ausstattung_eph_hinten', '🔊 Einparkhilfe hinten (EPH)', 'EPH hinten'],
    ['ausstattung_kamera_hinten', '📷 Rückfahrkamera', 'Rückfahrkamera'],
    ['ausstattung_kamera_360', '📷 360°-Kamera', '360°-Kamera'],
    ['ausstattung_serviceheft', '📘 Serviceheft vorhanden', 'Serviceheft vorhanden'] // in der Tabelle vorhanden, neu im Formular
  ];
  var ZUSICH = [
    ['zusicherung_unfallfrei', '✅ Unfallfrei', 'Fahrzeug ist unfallfrei', 'Unfallfrei'],
    ['zusicherung_kein_hagel', '✅ Kein Hagelschaden', 'Kein Hagelschaden', 'Kein Hagelschaden'],
    ['zusicherung_kein_nachlack', '✅ Nicht nachlackiert', 'Nicht nachlackiert', 'Nicht nachlackiert'],
    ['zusicherung_kein_mietwagen', '✅ Kein Mietfahrzeug', 'Kein ehemaliges Mietfahrzeug', 'Kein Mietfahrzeug'],
    ['zusicherung_kein_eu_import', '✅ Kein EU-Import', 'Kein EU-Import', 'Kein EU-Import']
  ];
  /* Zusicherungen als Ja/Nein-Fragen (wie alte App v5, Wortlaut 1:1).
     umgekehrt: Frage ist positiv formuliert („Hagelschaden?“), die Spalte aber verneint
     („zusicherung_kein_hagel“) → Antwort Ja wird als false gespeichert. */
  var ZUS_ROWS = [
    { key: 'unfallfrei', label: 'Unfallfrei', vertrag: 'Fahrzeug ist unfallfrei', umgekehrt: false },
    { key: 'kein_hagel', label: 'Hagelschaden', vertrag: 'Hagelschaden', umgekehrt: true },
    { key: 'kein_nachlack', label: 'Nachlackiert', vertrag: 'Nachlackiert', umgekehrt: true },
    { key: 'kein_mietwagen', label: 'Mietfahrzeug', vertrag: 'Ehemaliges Mietfahrzeug', umgekehrt: true },
    { key: 'kein_eu_import', label: 'EU-Import', vertrag: 'EU-Import', umgekehrt: true }
  ];
  var REIFEN = [
    { typ: 'sommer', icon: '☀️', name: 'Sommerreifen', ph: '6,5' },
    { typ: 'winter', icon: '❄️', name: 'Winterreifen', ph: '5,0' },
    { typ: 'ganzjahres', icon: '🌦️', name: 'Ganzjahresreifen', ph: '5,5' }
  ];
  // Status wie in der Tabelle erlaubt (CHECK-Constraint): neu · bewertet · vertrag_erstellt · abgeschlossen · abgelehnt
  var STATUS_OPT = [
    ['neu', 'Neu'], ['bewertet', 'Bewertet'], ['vertrag_erstellt', 'Angekauft (Vertrag erstellt)'],
    ['abgeschlossen', 'Abgeschlossen'], ['abgelehnt', 'Abgelehnt']
  ];
  var STATUS_LABEL = {
    neu: 'Neu', bewertet: 'Bewertet', vertrag_erstellt: 'Angekauft', abgeschlossen: 'Abgeschlossen',
    abgelehnt: 'Abgelehnt', uebernommen: 'Übernommen', abweichung_offen: 'Abweichung offen'
  };

  /* Felder der Tabelle public.fahrzeugankauf, die im Formular stehen.
     c = Spalte (= DOM-Id mit Präfix iz_), t = Typ, n = leer → null,
     up = Großbuchstaben, z0 = 0 ist ein gültiger Wert */
  var F_KUNDE = [
    { c: 'vk_vorname', l: 'Vorname *', t: 'text', ph: 'Max' },
    { c: 'vk_nachname', l: 'Nachname *', t: 'text', ph: 'Mustermann' },
    { c: 'vk_strasse', l: 'Straße + Hausnummer', t: 'text', ph: 'Musterstraße 1', full: 1 },
    { c: 'vk_plz', l: 'PLZ', t: 'text', ph: '70439', im: 'numeric' },
    { c: 'vk_ort', l: 'Ort', t: 'text', ph: 'Stuttgart' },
    { c: 'vk_telefon', l: 'Telefon', t: 'tel', ph: '0711 12345678' },
    { c: 'vk_email', l: 'E-Mail', t: 'email', ph: 'max@email.de' },
    { c: 'vk_ausweis_nr', l: 'Ausweis-Nr.', t: 'text', ph: 'optional' } // in der Tabelle vorhanden, neu im Formular
  ];
  var F_FAHRZEUG = [
    { c: 'interne_nr', l: 'Interne Nr.', t: 'text', ph: 'z.B. A-2026-0234' },
    { c: 'fz_hersteller', l: 'Hersteller *', t: 'text', ph: 'VW, BMW, Mercedes…' },
    { c: 'fz_modell', l: 'Modell *', t: 'text', ph: 'Golf, 3er, A-Klasse…' },
    { c: 'fz_typ', l: 'Typ / Ausstattungslinie', t: 'text', ph: 'GTI, Sport, Elegance…' },
    { c: 'fz_kennzeichen', l: 'Kennzeichen', t: 'text', ph: 'S-AB 1234', up: 1 },
    { c: 'fz_fahrgestellnr', l: 'Fahrgestellnummer (FIN)', t: 'text', ph: 'WVW…', up: 1 },
    { c: 'fz_erstzulassung', l: 'Erstzulassung (TT.MM.JJJJ)', t: 'date', n: 1 },
    { c: 'fz_km_stand', l: 'KM-Stand', t: 'int', ph: '85000', n: 1 },
    { c: 'fz_kraftstoff', l: 'Kraftstoff', t: 'select', o: ['Benzin', 'Diesel', 'Hybrid', 'Plug-in-Hybrid', 'Elektro', 'Gas (CNG)'] },
    { c: 'fz_getriebe', l: 'Getriebe', t: 'select', o: ['Schaltgetriebe', 'Automatik', 'Doppelkupplungsgetriebe'] },
    { c: 'fz_antrieb', l: 'Antrieb', t: 'select', o: ['2WD (Frontantrieb)', '2WD (Heckantrieb)', '4WD / Allrad'] },
    { c: 'fz_leistung_kw', l: 'Leistung (PS)', t: 'int', ph: '150', n: 1 },
    { c: 'fz_hubraum', l: 'Hubraum (cm³)', t: 'int', ph: '1498', n: 1 }, // in der Tabelle vorhanden, neu im Formular
    { c: 'fz_farbe', l: 'Farbe', t: 'text', ph: 'Silber Metallic' },
    { c: 'fz_sitzplaetze', l: 'Anzahl Sitzplätze', t: 'select', n: 1, o: ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'mehr als 9'] },
    { c: 'fz_halteranzahl', l: 'Anzahl Vorbesitzer', t: 'int', ph: '1', n: 1, min: 1 },
    { c: 'fz_hu_datum', l: 'HU bis', t: 'month', n: 1 },
    { c: 'fz_anzahl_schluessel', l: 'Anzahl Schlüssel', t: 'int', ph: '2', n: 1, min: 0, z0: 1 }
  ];
  var F_KD = [
    { c: 'kd_km_faellig', l: 'Nächster KD fällig bei (km)', t: 'int', ph: 'z.B. 90000', n: 1, step: 1000 },
    { c: 'kd_datum_faellig', l: 'Nächster KD fällig am', t: 'date', n: 1 }
  ];
  var F_STATUS = [
    { c: 'bearbeiter_name', l: 'Bearbeiter', t: 'text', ph: 'Name des Mitarbeiters' },
    { c: 'notizen', l: 'Interne Notizen', t: 'area', ph: 'Interne Anmerkungen…', full: 1, rows: 3 }
  ];
  // alle Eingabefelder (ohne Checkboxen/Mängel/Lack/Reifen, die gesondert behandelt werden)
  var F_ALLE = [].concat(F_KUNDE, F_FAHRZEUG, F_KD, F_STATUS, [
    { c: 'vk_bekannte_maengel', l: '', t: 'area' },
    { c: 'mn_bemerkungen', l: '', t: 'area', n: 1 },
    { c: 'lack_bemerkung', l: '', t: 'area', n: 1 },
    { c: 'vk_schaeden', l: '', t: 'area', n: 1 },
    { c: 'fz_geprueft_datum', l: '', t: 'date', n: 1 },
    { c: 'fz_pruefer_name', l: '', t: 'text', n: 1 },
    { c: 'ankaufspreis', l: '', t: 'dec', n: 1 },
    { c: 'status', l: '', t: 'select' }
  ]);
  var CHECKS = [].concat(
    AUSST.map(function (x) { return x[0]; }),
    ['kd_alle_durchgefuehrt', 'fz_geprueft']
  );

  /* ===================================================================
     1. Zustand
     =================================================================== */
  var S = {
    root: null,          // dauerhaftes Wurzelelement des Reiters
    view: 'liste',       // liste | form
    alle: [],            // geladene Ankäufe
    editId: null,        // id des bearbeiteten Ankaufs (null = neu)
    newId: null,         // vorab erzeugte id für neue Ankäufe (Foto-Pfad)
    fotos: [],           // Pfade des aktuell bearbeiteten Ankaufs
    uploads: [],         // in dieser Sitzung hochgeladene Pfade (zum Aufräumen)
    entfernt: [],        // entfernte, bereits gespeicherte Pfade
    sortField: 'erstellt_am', sortDir: 'desc',
    filter: { q: '', owner: 'all', status: '', cols: {} },
    userId: null, userEmail: null,
    dirty: false,        // ungespeicherte Änderungen im Formular (Paket 2)
    rec: null,           // geöffneter Ankauf (null = neuer Ankauf)
    huRoh: null          // unlesbares altes HU-Format wird beim Speichern erhalten
  };
  
  /* ===================================================================
     2. Kleine Helfer
     =================================================================== */
  function EGx() { return window.EG || {}; }
  function istDemo() { return !!EGx().demo; }
  function q(sel) { return S.root ? S.root.querySelector(sel) : null; }
  function qi(id) { return q('#iz_' + id); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function uuid() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
      var r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 3 | 8)).toString(16);
    });
  }
  function toast(t, typ) {
    var eg = EGx();
    var art = typ === 'success' ? 'ok' : typ === 'error' ? 'fehler' : ''; // EG.toast kennt '', 'ok', 'fehler'
    if (typeof eg.toast === 'function') eg.toast(t, art); else console.log('[Toast]', t);
  }
  async function bestaetigen(t, o) {
    var eg = EGx();
    if (typeof eg.bestaetigen === 'function') return !!(await eg.bestaetigen(t, o));
    return window.confirm(t);
  }
  function nutzerName() {
    var eg = EGx();
    try { if (typeof eg.nutzerName === 'function') return eg.nutzerName() || ''; } catch (e) { /* ignorieren */ }
    return (S.userEmail || '').split('@')[0];
  }
  function fmtDatum(iso) {
    if (!iso) return '–';
    var d = new Date(iso); if (isNaN(d)) return '–';
    return d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
  }
  function fmtDatumZeit(iso) {
    if (!iso) return '–';
    var d = new Date(iso); if (isNaN(d)) return '–';
    return d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' }) + ' ' +
      d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
  }
  function fmtDatumDE(s) {
    if (!s) return '–';
    var p = String(s).split('-');
    if (p.length >= 3) return p[2].slice(0, 2) + '.' + p[1] + '.' + p[0];
    if (p.length === 2) return p[1] + '.' + p[0];
    return s;
  }
  function fmtEuro(n) {
    return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(n);
  }
  function fmtEuroRund(n) { // ohne Cent (Liste)
    return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(Math.round(Number(n)));
  }
  function kundenName(a) { return ((a.vk_vorname || '') + ' ' + (a.vk_nachname || '')).trim(); }
  function fmtKm(n) { return n != null && n !== '' ? Number(n).toLocaleString('de-DE') + ' km' : '–'; }
  function parseDez(s) {
    if (s == null) return null;
    var t = String(s).trim().replace(',', '.');
    if (t === '') return null;
    var n = parseFloat(t);
    return isNaN(n) ? null : n;
  }
  function pnum(x) { var n = parseFloat(x); return isNaN(n) ? 0 : n; }
  /* Antwort auf die angezeigte Frage: true = Ja, false = Nein, null = offen.
     Alte Datensätze (ohne Merker zus_ja_nein): false heißt nur „nicht angehakt“ → offen. */
  function zusAnzeige(a, r) {
    var val = a['zusicherung_' + r.key], g = null;
    if (val === true) g = true;
    else if (val === false && a.zus_ja_nein) g = false;
    if (g === null) return null;
    return r.umgekehrt ? !g : g;
  }
  // Antwort im Formular (true = Ja, false = Nein, null = offen)
  function zusWert(r) {
    if (qi('zus_' + r.key + '_ja') && qi('zus_' + r.key + '_ja').checked) return true;
    if (qi('zus_' + r.key + '_nein') && qi('zus_' + r.key + '_nein').checked) return false;
    return null;
  }
  // Wert für die Spalte aus der Antwort
  function zusSpeicherwert(r) {
    var w = zusWert(r);
    if (w === null) return null;
    return r.umgekehrt ? !w : w;
  }
  function summeKosten(a) {
    return MN_ROWS.reduce(function (s, r) { return s + pnum(a['mn_' + r.key + '_kosten']); }, 0);
  }
  function fzBez(a) { return [a.fz_hersteller, a.fz_modell, a.fz_typ].filter(Boolean).join(' '); }
  function reifenProfilLabel(a, typ) {
    var va = a['reifen_' + typ + '_profil_vorne'], ha = a['reifen_' + typ + '_profil_hinten'], old = a['reifen_' + typ + '_profil'];
    var parts = [];
    if (va != null && va !== '') parts.push('VA: ' + va + ' mm');
    if (ha != null && ha !== '') parts.push('HA: ' + ha + ' mm');
    if (parts.length) return ' (' + parts.join(' / ') + ')';
    if (old != null && old !== '') return ' (' + old + ' mm Profil)';
    return '';
  }
  function parseMonat(s) { // → Monatszahl (Jahr*12+Monat) oder null
    if (!s) return null; s = String(s).trim(); var m;
    if ((m = s.match(/^(\d{4})-(\d{1,2})/))) return +m[1] * 12 + +m[2];
    if ((m = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/))) return +m[3] * 12 + +m[2];
    if ((m = s.match(/^(\d{1,2})[.\/-](\d{4})$/))) return +m[2] * 12 + +m[1];
    return null;
  }
  function monatAnzeige(s) {
    var n = parseMonat(s); if (n == null) return s || '–';
    var y = Math.floor((n - 1) / 12), m = n - y * 12;
    return (m < 10 ? '0' : '') + m + '/' + y;
  }

  /* ===================================================================
     3. Daten (Supabase oder Demo)
     =================================================================== */
  /* Demo-Modus (EG.demo): Der Kern bringt eine Mock-Datenbank mit gleicher Schnittstelle wie supabase-js.
     Hier werden 3 frei erfundene Ankäufe vorbelegt (keine echten Namen, FINs oder Kennzeichen). */
  var demoBereit = false;
  async function demoVorbereiten() {
    if (demoBereit || !istDemo()) return;
    demoBereit = true;
    var eg = EGx(), jetzt = new Date();
    function vor(tage) { return new Date(jetzt.getTime() - tage * 86400000).toISOString(); }
    async function bild(id, nr, text) {
      var pfad = 'inzahlung/' + id + '/demo-' + nr + '.jpg';
      try { await eg.sb.storage.from(BUCKET_NEU).upload(pfad, await eg.demoFoto(text)); } catch (e) { /* ignorieren */ }
      return pfad;
    }
    var basis = function (o) {
      var r = { status: 'neu', fotos: [], lack_messung: null, vk_ausweis_nr: '' };
      MN_ROWS.forEach(function (m) { r['mn_' + m.key] = null; r['mn_' + m.key + '_kosten'] = null; });
      CHECKS.forEach(function (c) { r[c] = false; });
      REIFEN.forEach(function (t) {
        r['reifen_' + t.typ] = false; r['reifen_' + t.typ + '_profil_vorne'] = null; r['reifen_' + t.typ + '_profil_hinten'] = null;
      });
      for (var k in o) r[k] = o[k];
      return r;
    };
    var id1 = 'a0000001-0000-4000-8000-000000000001', id2 = 'a0000001-0000-4000-8000-000000000002', id3 = 'a0000001-0000-4000-8000-000000000003';
    var f1 = [await bild(id1, 1, 'Vorne'), await bild(id1, 2, 'Seite')], f2 = [await bild(id2, 1, 'Heck')];
    eg.demoSeed('public.fahrzeugankauf', [
      basis({
        id: id1, erstellt_am: vor(3), interne_nr: 'DEMO-0001', status: 'vertrag_erstellt', bearbeiter_name: 'Demo Verkauf',
        vk_vorname: 'Erika', vk_nachname: 'Beispiel', vk_strasse: 'Teststraße 1', vk_plz: '00000', vk_ort: 'Musterstadt',
        vk_telefon: '0000 000000', vk_email: 'erika@example.invalid',
        vk_bekannte_maengel: 'Kleiner Steinschlag in der Frontscheibe, rechts hinten Kratzer an der Stoßstange.',
        fz_hersteller: 'Demo-Marke', fz_modell: 'Testmodell', fz_typ: 'Comfort', fz_kennzeichen: 'XX-DE 123',
        fz_fahrgestellnr: 'TESTFIN0000000001', fz_erstzulassung: '2019-05-01', fz_km_stand: 85000,
        fz_kraftstoff: 'Benzin', fz_getriebe: 'Automatik', fz_antrieb: '2WD (Frontantrieb)', fz_leistung_kw: 150,
        fz_farbe: 'Silber Metallic', fz_sitzplaetze: '5', fz_halteranzahl: 2, fz_hu_datum: '2027-03', fz_anzahl_schluessel: 2,
        ausstattung_navi: true, ausstattung_klimaautomatik: true, ausstattung_sitzheizung: true,
        reifen_sommer: true, reifen_sommer_profil_vorne: 6.5, reifen_sommer_profil_hinten: 6,
        reifen_winter: true, reifen_winter_profil_vorne: 5, reifen_winter_profil_hinten: 5,
        zusicherung_unfallfrei: true, zusicherung_kein_nachlack: true, zusicherung_kein_mietwagen: true,
        mn_reifen: 'Hinterreifen bald erneuern', mn_reifen_kosten: 180, mn_karosserie2: 'Kratzer Stoßstange hinten', mn_karosserie2_kosten: 120,
        mn_aufbereitung: 'Innen- und Außenpflege', mn_aufbereitung_kosten: 90,
        aufwendungen_gesamt: 390, ankaufspreis: 12500,
        lack_messung: { motorhaube: 110, dach: 105, heckklappe: 240, kotfluegel_vl: 120 }, lack_bemerkung: 'Heckklappe vermutlich nachlackiert.',
        fotos: f1, notizen: 'Demo-Eintrag – frei erfunden.'
      }),
      basis({
        id: id2, erstellt_am: vor(1), interne_nr: 'DEMO-0002', status: 'bewertet', bearbeiter_name: 'Demo Verkauf',
        vk_vorname: 'Hans', vk_nachname: 'Probe', vk_strasse: 'Beispielweg 7', vk_plz: '00001', vk_ort: 'Teststadt',
        vk_bekannte_maengel: 'Keine Mängel bekannt',
        fz_hersteller: 'Demo-Marke', fz_modell: 'Probe SUV', fz_typ: 'Sport', fz_kennzeichen: 'XX-PR 77',
        fz_fahrgestellnr: 'TESTFIN0000000002', fz_erstzulassung: '2021-09-01', fz_km_stand: 42000,
        fz_kraftstoff: 'Diesel', fz_getriebe: 'Doppelkupplungsgetriebe', fz_antrieb: '4WD / Allrad', fz_leistung_kw: 190,
        fz_farbe: 'Schwarz', fz_sitzplaetze: '5', fz_halteranzahl: 1, fz_hu_datum: '2026-12', fz_anzahl_schluessel: 1,
        ausstattung_panorama: true, ausstattung_ahk: true, ausstattung_leder: true,
        reifen_ganzjahres: true, reifen_ganzjahres_profil_vorne: 5.5, reifen_ganzjahres_profil_hinten: 5.5,
        zusicherung_unfallfrei: true, zusicherung_kein_hagel: true,
        mn_hu: 'HU läuft bald ab', mn_hu_kosten: 120, aufwendungen_gesamt: 120, ankaufspreis: 27900, fotos: f2
      }),
      basis({
        id: id3, erstellt_am: vor(20), interne_nr: 'DEMO-0003', status: 'abgeschlossen', bearbeiter_name: 'Demo Werkstatt',
        vk_vorname: 'Anna', vk_nachname: 'Muster', vk_ort: 'Beispieldorf',
        vk_bekannte_maengel: 'Keine Mängel bekannt',
        fz_hersteller: 'Demo-Marke', fz_modell: 'Kleinwagen', fz_kennzeichen: 'XX-KW 9',
        fz_fahrgestellnr: 'TESTFIN0000000003', fz_erstzulassung: '2016-02-01', fz_km_stand: 120000,
        fz_kraftstoff: 'Benzin', fz_getriebe: 'Schaltgetriebe', fz_leistung_kw: 90, fz_farbe: 'Rot', fz_anzahl_schluessel: 2,
        ankaufspreis: 5200, aufwendungen_gesamt: 0,
        uebernahme_status: 'ok', uebernahme_am: vor(10), uebernahme_von_name: 'Demo Verkauf', uebernahme_km: 120000, uebernahme_schluessel: 2,
        uebernahme_abweichungen: [], uebernahme_checkliste: {}
      })
    ]);
  }

  // Für den Abschnitt „Inzahlungnahmen“ im Reiter Anlieferung (eingang-anlieferung-iz.js)
  window.IZ_INFO = { demo: demoVorbereiten, LACK_POINTS: LACK_POINTS, AUSST: AUSST };

  async function holeUser() {
    if (S.userId) return;
    var eg = EGx();
    try {
      if (eg.user && eg.user.id) { S.userId = eg.user.id; S.userEmail = eg.user.email; return; }
      if (eg.sb) {
        var r = await eg.sb.auth.getSession();
        var u = r && r.data && r.data.session && r.data.session.user;
        if (u) { S.userId = u.id; S.userEmail = u.email; }
      }
    } catch (e) { /* ignorieren */ }
  }
  async function istAdmin() {
    var eg = EGx();
    try {
      if (typeof eg.istAdmin === 'function') return !!(await eg.istAdmin());
      if (eg.rolle) return eg.rolle === 'admin';
      if (eg.sb && !istDemo()) { // Rückfall ohne Kern-Helfer
        var r = await eg.sb.schema('shared').rpc('aktuelle_rolle');
        return !r.error && r.data === 'admin';
      }
    } catch (e) { /* ignorieren */ }
    return false;
  }

  var Daten = {
    async laden() {
      var r = await EGx().sb.from('fahrzeugankauf').select('*').order('erstellt_am', { ascending: false });
      if (r.error) throw r.error;
      return r.data || [];
    },
    async neu(payload) {
      if (istDemo() && !payload.erstellt_am) payload.erstellt_am = new Date().toISOString(); // Mock kennt keine Spalten-Vorgaben
      var r = await EGx().sb.from('fahrzeugankauf').insert([payload]).select('*').single();
      if (r.error) throw r.error;
      return r.data;
    },
    async aendern(id, patch) {
      var r = await EGx().sb.from('fahrzeugankauf').update(patch).eq('id', id).select('*').single();
      if (r.error) throw r.error;
      return r.data;
    }
  };
  function fehlerText(e) {
    var m = (e && (e.message || e.error_description)) || String(e);
    if (/uebernahme_|abweichung_/.test(m) && /column|spalte|schema cache/i.test(m)) {
      return 'Die Datenbank hat die neuen Übernahme-Spalten noch nicht (Migration P1 fehlt): ' + m;
    }
    return m;
  }

  /* ===================================================================
     4. Fotos
     =================================================================== */
  async function fotoUrl(p) {
    if (!p) return '';
    if (/^(data:|blob:|https?:)/i.test(p)) return p;
    var u = '', eg = EGx();
    if (p.indexOf('inzahlung/') === 0) {            // neuer, privater Speicher (EG cached die Adresse selbst)
      try { if (typeof eg.fotoAnzeigen === 'function') u = await eg.fotoAnzeigen(p); } catch (e) { u = ''; }
      if (!u && eg.sb) {
        try { var r = await eg.sb.storage.from(BUCKET_NEU).createSignedUrl(p, 600); u = (r && r.data && r.data.signedUrl) || ''; } catch (e2) { u = ''; }
      }
    } else if (eg.sb) {                              // alt: öffentlicher Speicher ankauf-fotos
      try { u = eg.sb.storage.from(BUCKET_ALT).getPublicUrl(p).data.publicUrl; } catch (e3) { u = ''; }
    }
    return u || '';
  }
  async function bilderLaden(root) {
    var imgs = root.querySelectorAll('img[data-pfad]');
    for (var i = 0; i < imgs.length; i++) {
      (function (img) {
        fotoUrl(img.getAttribute('data-pfad')).then(function (u) { if (u) img.src = u; else img.alt = 'Foto nicht ladbar'; });
      })(imgs[i]);
    }
  }
  function thumbHtml(p, mitLoeschen, idx) {
    return '<div class="iz-thumb"><img data-pfad="' + esc(p) + '" alt="Foto" loading="lazy" data-lb="1">' +
      (mitLoeschen ? '<button type="button" class="iz-thumb-del" title="Foto entfernen" data-fotodel="' + idx + '">✕</button>' : '') + '</div>';
  }
  function verkleinern(file, maxDim, qual) {
    maxDim = maxDim || 1600; qual = qual || 0.8;
    return new Promise(function (resolve, reject) {
      var url = URL.createObjectURL(file), img = new Image();
      img.onload = function () {
        var w = img.naturalWidth, h = img.naturalHeight;
        if (w > maxDim || h > maxDim) { var r = Math.min(maxDim / w, maxDim / h); w = Math.round(w * r); h = Math.round(h * r); }
        var c = document.createElement('canvas'); c.width = w; c.height = h;
        c.getContext('2d').drawImage(img, 0, 0, w, h);
        URL.revokeObjectURL(url);
        c.toBlob(function (b) { b ? resolve(b) : reject(new Error('Verkleinern fehlgeschlagen')); }, 'image/jpeg', qual);
      };
      img.onerror = function () { URL.revokeObjectURL(url); reject(new Error('Bild nicht lesbar (Format?)')); };
      img.src = url;
    });
  }
  /* Speichert ein Foto unter inzahlung/<id>/…, gibt den Pfad zurück.
     EG.fotoHochladen verkleinert selbst (ca. 300 KB) und lädt in den privaten Speicher. */
  async function fotoSpeichern(file, ankaufId, praefix) {
    var name = (praefix ? praefix + '-' : '') + uuid() + '.jpg';
    var pfad = 'inzahlung/' + ankaufId + '/' + name;
    var eg = EGx(), r;
    if (typeof eg.fotoHochladen === 'function') {
      r = await eg.fotoHochladen(file, pfad);
    } else {
      var klein = await verkleinern(file);
      var up = await eg.sb.storage.from(BUCKET_NEU).upload(pfad, klein, { contentType: 'image/jpeg', upsert: false });
      if (up.error) throw up.error;
    }
    var endpfad = (typeof r === 'string' && r) ? r : pfad;
    S.uploads.push(endpfad);
    return endpfad;
  }
  async function fotosEntfernen(pfade) {
    if (!pfade.length || !EGx().sb) return 0;
    var fehler = 0;
    var neu = pfade.filter(function (p) { return p.indexOf('inzahlung/') === 0; });
    var alt = pfade.filter(function (p) { return p.indexOf('inzahlung/') !== 0 && !/^(data:|blob:|https?:)/i.test(p); });
    try {
      if (neu.length) { var r = await EGx().sb.storage.from(BUCKET_NEU).remove(neu); if (r.error) fehler++; }
      if (alt.length) { var r2 = await EGx().sb.storage.from(BUCKET_ALT).remove(alt); if (r2.error) fehler++; }
    } catch (e) { fehler++; }
    return fehler;
  }
  function oeffneLightbox(url) {
    var lb = document.getElementById('iz-lightbox');
    if (!lb) {
      lb = document.createElement('div'); lb.id = 'iz-lightbox'; lb.className = 'iz-lightbox';
      lb.innerHTML = '<button type="button" class="iz-lb-close" aria-label="Schließen">✕</button><img alt="Foto">';
      lb.addEventListener('click', function () { lb.classList.remove('active'); });
      document.body.appendChild(lb);
    }
    lb.querySelector('img').src = url;
    lb.classList.add('active');
  }
  // Klick auf ein Foto (überall) → Lightbox
  document.addEventListener('click', function (ev) {
    var t = ev.target;
    if (t && t.tagName === 'IMG' && t.getAttribute('data-lb') === '1' && t.src) {
      ev.preventDefault(); oeffneLightbox(t.src);
    }
  });

  /* ===================================================================
     5. Stil (eigenständig eingebettet, Präfix iz-)
     =================================================================== */
  function stilEinbetten() {
    if (document.getElementById('iz-style')) return;
    var st = document.createElement('style'); st.id = 'iz-style';
    st.textContent = [
      '.iz-root{--iz-blau:#007BFF;--iz-blau-d:#0A5CD0;--iz-rot:#C1121A;--iz-gruen:#1e6e42;--iz-gold:#8a6410;--iz-ink:#1A2333;--iz-sub:#4A5F78;--iz-rahmen:#E3E9F2;--iz-bg:#F4F8FD;--iz-r:16px;',
      ' font-family:"DM Sans",system-ui,-apple-system,"Segoe UI",Arial,sans-serif;color:var(--iz-ink);font-size:16px;line-height:1.5;max-width:1400px;margin:0 auto;padding:16px}',
      '.iz-root *{box-sizing:border-box}',
      '.iz-root h2,.iz-root h3,.iz-root h4{font-family:"Plus Jakarta Sans",system-ui,sans-serif;font-weight:700;letter-spacing:-.01em;line-height:1.2;color:var(--iz-ink);margin:0}',
      '.iz-root em{font-style:normal;color:var(--iz-blau-d)}',
      /* Statistik */
      '.iz-stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;margin-bottom:20px}',
      '.iz-stat{background:#fff;border:1px solid var(--iz-rahmen);border-top:3px solid var(--iz-blau);border-radius:var(--iz-r);padding:14px 16px;box-shadow:0 2px 10px rgba(0,123,255,.06)}',
      '.iz-stat.rot{border-top-color:var(--iz-rot)}',
      '.iz-stat-l{font-size:12px;text-transform:uppercase;letter-spacing:1px;color:var(--iz-sub);font-weight:700}',
      '.iz-stat-v{font-family:"Plus Jakarta Sans",system-ui,sans-serif;font-size:30px;font-weight:800;color:var(--iz-blau-d);line-height:1.1}',
      '.iz-stat.rot .iz-stat-v{color:var(--iz-rot)}',
      '.iz-kopf{display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;margin-bottom:12px}',
      '.iz-kopf h2{font-size:24px}',
      '.iz-ctrl{display:flex;gap:10px;flex-wrap:wrap;align-items:center}',
      /* Eingabefelder */
      '.iz-root input,.iz-root select,.iz-root textarea{font:inherit;font-size:16px;color:var(--iz-ink);background:#fff;border:1.5px solid var(--iz-rahmen);border-radius:12px;padding:11px 14px;min-height:48px;width:100%}',
      '.iz-root textarea{min-height:90px;resize:vertical}',
      '.iz-root input:focus,.iz-root select:focus,.iz-root textarea:focus{outline:none;border-color:var(--iz-blau);box-shadow:0 0 0 4px rgba(0,123,255,.12)}',
      '.iz-ctrl input,.iz-ctrl select{width:auto;min-width:150px}',
      /* Buttons */
      '.iz-btn{font:inherit;font-size:16px;font-weight:600;border:1.5px solid transparent;border-radius:12px;padding:10px 20px;min-height:48px;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;gap:8px;transition:background .15s,transform .1s;white-space:nowrap}',
      '.iz-btn:active{transform:translateY(1px)}',
      '.iz-btn[disabled]{opacity:.55;cursor:not-allowed}',
      '.iz-btn-p{background:var(--iz-blau-d);color:#fff}',
      '.iz-btn-p:hover{background:#084aa8}',
      '.iz-btn-g{background:var(--iz-gruen);color:#fff}',
      '.iz-btn-o{background:#fff;color:var(--iz-blau-d);border-color:var(--iz-blau-d)}',
      '.iz-btn-o:hover{background:#eef5ff}',
      '.iz-btn-r{background:var(--iz-rot);color:#fff}',
      '.iz-btn-sm{min-height:40px;padding:6px 14px;font-size:14px}',
      /* Tabelle */
      /* Tabelle in derselben Optik wie die Zeilen der anderen Reiter (Anfragen, Verkauf …): 14 px, Zeile 48 px, Kopf grau 13 px und fest unter der Reiterleiste.
         overflow:clip statt hidden, sonst bleibt der Kopf nicht stehen. */
      '.iz-tabelle{background:#fff;border:1px solid var(--border);border-radius:var(--radius);overflow:clip;box-shadow:var(--schatten)}',
      '.iz-tabelle table{width:100%;border-collapse:collapse}',
      '.iz-tabelle thead{position:sticky;top:var(--tabs-h,52px);z-index:20;box-shadow:0 3px 8px rgba(26,35,51,.06)}',
      '.iz-tabelle th{background:#EEF1F5;padding:8px 10px;text-align:left;font-size:13px;font-weight:700;line-height:1.15;color:var(--sub);vertical-align:middle}',
      '.iz-tabelle th.sort{cursor:pointer;user-select:none}',
      '.iz-tabelle th.sort:hover{color:var(--iz-blau-d)}',
      '.iz-tabelle th.sort::after{content:" ⇅";opacity:.35;font-size:10px}',
      '.iz-tabelle th.asc::after{content:" ▲";opacity:1;color:var(--iz-blau-d)}',
      '.iz-tabelle th.desc::after{content:" ▼";opacity:1;color:var(--iz-blau-d)}',
      '.iz-tabelle tr.fil th{background:#fff;padding:6px 8px 7px;border-top:1px solid var(--border)}',
      '.iz-tabelle tr.fil input,.iz-tabelle tr.fil select{min-height:32px;height:32px;padding:2px 8px;font-size:13px;border-radius:8px}',
      '.iz-tabelle td{padding:6px 10px;height:48px;border-top:1px solid var(--border);font-size:14px;vertical-align:middle}',
      '.iz-tabelle tbody tr:hover td{background:#F4F8FD}',
      '.iz-tabelle tbody tr.iz-zeile-klick{cursor:pointer}',
      /* Ganze Zeile öffnet die Details, deshalb Spalte „Aktion“ ausgeblendet; Zellen enger, damit alle Spalten Platz haben */
      '.iz-tabelle th:first-child,.iz-tabelle td:first-child{padding-left:18px}',
      /* feste Spaltenbreiten, Zellen einzeilig wie in den anderen Reitern (nur das Fahrzeug darf umbrechen) */
      '.iz-tabelle table{table-layout:fixed}',
      /* Spalten (Paket 2): 1 Kunde · 2 Fahrzeug · 3 Kennzeichen · 4 Fgst.-Nr. · 5 Int.-Nr. · 6 Datum · 7 Status · 8 Kaufpreis */
      '.iz-tabelle thead tr:first-child th:nth-child(3){width:112px}.iz-tabelle thead tr:first-child th:nth-child(4){width:176px}',
      '.iz-tabelle thead tr:first-child th:nth-child(5){width:120px}.iz-tabelle thead tr:first-child th:nth-child(6){width:100px}',
      '.iz-tabelle thead tr:first-child th:nth-child(7){width:178px}.iz-tabelle thead tr:first-child th:nth-child(8){width:104px}',
      '.iz-tabelle tbody td{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
      '.iz-tabelle tbody td:nth-child(2){white-space:normal;line-height:1.3}',
      '.iz-tabelle th:nth-child(8),.iz-tabelle td:nth-child(8){text-align:right}.iz-tabelle th:last-child,.iz-tabelle td:last-child{padding-right:18px}',
      /* Statusfilter als Knöpfe */
      '.iz-fk{display:flex;gap:8px;flex-wrap:wrap;margin:0 0 14px}',
      '.iz-fk button{min-height:44px;border-radius:999px;border:2px solid var(--iz-rahmen);background:#fff;font-family:"Plus Jakarta Sans",system-ui,sans-serif;font-size:15px;font-weight:700;padding:0 16px;cursor:pointer;color:var(--iz-blau-d)}',
      '.iz-fk button:hover{border-color:var(--iz-blau)}',
      '.iz-fk button[aria-pressed="true"]{background:var(--iz-blau-d);border-color:var(--iz-blau-d);color:#fff}',
      '.iz-fk button.rot{color:var(--iz-rot);border-color:var(--iz-rot)}',
      '.iz-fk button.rot[aria-pressed="true"]{background:var(--iz-rot);color:#fff}',
      '.iz-nr{font-weight:600;color:var(--ink)}',
      '.iz-fin{font-family:ui-monospace,Consolas,monospace;font-size:13px;color:var(--ink)}',
      '.iz-badge{display:inline-block;padding:2px 8px;border-radius:999px;font-size:13px;font-weight:700;line-height:1.4;white-space:nowrap}',
      '.iz-b-neu{background:#dbeafe;color:#1e40af}.iz-b-bewertet{background:#fef9c3;color:#854d0e}.iz-b-vertrag_erstellt{background:#dcfce7;color:#166534}',
      '.iz-b-abgeschlossen{background:#f3e8ff;color:#6b21a8}.iz-b-abgelehnt{background:#fee2e2;color:#991b1b}',
      '.iz-b-uebernommen{background:#166534;color:#fff}.iz-b-abweichung_offen{background:var(--iz-rot);color:#fff}',
      '.iz-leer,.iz-laden{text-align:center;padding:48px 16px;color:var(--iz-sub)}',
      '.iz-mobilbar{display:none}',
      /* Ankauf-Ansicht (Paket 2) */
      '.iz-root{--iz-top:var(--tabs-h,52px)}',
      '.ak-kopf{position:sticky;top:var(--iz-top);z-index:25;background:#fff;border:1px solid var(--iz-rahmen);border-radius:var(--iz-r);box-shadow:0 4px 14px rgba(0,123,255,.10);padding:12px 16px 10px;margin-bottom:16px}',
      '.ak-zeile1{display:flex;gap:14px;align-items:center}',
      '.ak-titel{flex:1;min-width:0}',
      '.ak-titel h2{font-size:24px;line-height:1.15;overflow-wrap:anywhere}',
      '.ak-meta{display:flex;flex-wrap:wrap;gap:6px 14px;align-items:center;font-size:14.5px;color:var(--iz-sub);margin-top:4px}',
      '.ak-meta2{font-size:14.5px;color:var(--iz-sub);margin-top:2px}',
      '.ak-nr{font-weight:700;color:var(--iz-ink)}',
      '.ak-aktionen{display:flex;gap:10px;align-items:center;flex-shrink:0;position:relative}',
      '.ak-aktionen .btn,.ak-leiste .btn{white-space:nowrap}',
      '.ak-aktionen .btn:not(.btn-primary){font-size:15px;padding:0 14px}',
      '.ak-menuewrap{position:relative;display:inline-block}',
      '.ak-menue{position:absolute;right:0;top:calc(100% + 6px);min-width:240px;background:#fff;border:1px solid var(--iz-rahmen);border-radius:14px;box-shadow:0 10px 30px rgba(26,35,51,.18);padding:6px;z-index:60;display:none}',
      '.ak-menue.offen{display:block}',
      '.ak-menue button{display:flex;width:100%;text-align:left;gap:10px;align-items:center;min-height:46px;padding:0 12px;border:none;background:none;border-radius:10px;font:inherit;font-size:16px;font-weight:600;color:var(--iz-blau-d);cursor:pointer}',
      '.ak-menue button:hover{background:#EEF5FF}',
      '.ak-menue .ak-trenner{border-top:1px solid var(--iz-rahmen);margin:4px 0}',
      '.ak-dirty{display:flex;gap:8px;align-items:center;margin-top:10px;background:#FFF6D6;border:1px solid #F5C842;border-radius:10px;padding:6px 12px;font-size:14.5px}',
      '.ak-dirty[hidden]{display:none}',
      '.ak-dirty b{font-family:"Plus Jakarta Sans",system-ui,sans-serif}',
      '.ak-dirty .pkt{width:9px;height:9px;border-radius:50%;background:#B7791F;flex-shrink:0}',
      '.ak-sprung{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:8px;margin-top:10px}',
      '.ak-sp{display:inline-flex;align-items:center;justify-content:center;gap:6px;min-height:44px;padding:0 6px;border:2px solid var(--iz-rahmen);border-radius:14px;background:#fff;color:var(--iz-blau-d);font-family:"Plus Jakarta Sans",system-ui,sans-serif;font-size:14px;font-weight:700;white-space:nowrap;cursor:pointer;min-width:0}',
      '.ak-sp:hover{border-color:var(--iz-blau)}',
      '.ak-sp .n{display:inline-flex;align-items:center;justify-content:center;width:24px;height:24px;border-radius:8px;background:var(--iz-blau-d);color:#fff;font-size:14px;flex-shrink:0}',
      '.ak-sp .nm{overflow:hidden;text-overflow:ellipsis}',
      '.ak-sp .ok{color:var(--iz-gruen);font-size:17px}',
      '.ak-sp .warn{display:inline-flex;align-items:center;justify-content:center;width:22px;height:22px;border-radius:50%;background:var(--iz-rot);color:#fff;font-size:15px;font-weight:800;flex-shrink:0}',
      '.ak-sp.hat-fehler{border-color:var(--iz-rot)}',
      '.ak-alle{display:flex;justify-content:flex-end;gap:6px;margin:-6px 0 8px;flex-wrap:wrap}',
      '.ak-link{background:none;border:none;color:var(--iz-blau-d);font:inherit;font-size:15px;text-decoration:underline;cursor:pointer;min-height:44px;padding:0 8px}',
      '.ak-link.rot{color:var(--iz-rot)}',
      '.iz-root .ak-sek{padding:0;scroll-margin-top:calc(var(--iz-top) + var(--iz-kopf-h,150px) + 14px)}',
      '.ak-sek-kopf{display:flex;align-items:center;gap:12px;width:100%;min-height:68px;padding:16px 24px;border:none;background:none;text-align:left;cursor:pointer;font:inherit;color:inherit;border-radius:var(--iz-r)}',
      '.ak-sek-kopf:focus-visible{outline:3px solid rgba(0,123,255,.35);outline-offset:-3px}',
      '.ak-sek-kopf .t{font-family:"Plus Jakarta Sans",system-ui,sans-serif;font-size:20px;font-weight:700;flex:1}',
      '.ak-st{font-size:14px;font-weight:700;white-space:nowrap}',
      '.ak-st.ok{color:var(--iz-gruen)}.ak-st.warn{color:var(--iz-rot)}',
      '.ak-chev{font-size:18px;color:var(--iz-sub);transition:transform .15s}',
      '.ak-sek.open .ak-chev{transform:rotate(180deg)}',
      '.ak-sek-body{display:none;padding:18px 24px 24px;border-top:1px solid var(--iz-rahmen)}',
      '.ak-sek.open .ak-sek-body{display:block}',
      '.iz-root .ak-uebernahme{border:2px solid var(--iz-rot);padding:20px 24px;margin-bottom:16px}',
      '.ak-uebernahme h3{font-size:20px;margin-bottom:10px;display:flex;gap:10px;align-items:center;flex-wrap:wrap}',
      '.ak-ueb-grid{display:grid;grid-template-columns:1fr 1fr;gap:0 28px;align-items:start}',
      '.ak-ueb-ent{display:flex;gap:14px;align-items:flex-end;margin-top:12px}',
      '.ak-ueb-ent .iz-fg{flex:1}',
      '.ak-ueb-ent textarea{min-height:60px}',
      '.ak-leiste{display:none}',
      '#iz-v-form .ak-leiste[hidden]{display:none}',
      /* Fahrzeugschein einlesen */
      '.iz-fzs{border:1.5px dashed var(--iz-blau-d);background:var(--iz-bg);border-radius:12px;padding:14px 16px;margin-bottom:18px}',
      '.iz-fzs-kopf{display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap}',
      '.iz-fzs-titel{font-family:"Plus Jakarta Sans",system-ui,sans-serif;font-size:18px;font-weight:700}',
      '.iz-fzs-text{font-size:14px;color:var(--iz-sub);margin-top:4px;max-width:560px}',
      '.iz-fzs-knoepfe{display:flex;gap:10px;flex-wrap:wrap}',
      '.iz-fzs-status{margin-top:12px;padding:12px 14px;border-radius:12px;font-size:14.5px;background:#fff;border:1px solid var(--iz-rahmen)}',
      '.iz-fzs-status.ok{border-color:#e0b100;background:#fffbe6}',
      '.iz-fzs-status.fehler{border-color:var(--iz-rot);background:#fff5f5;color:#7a0a10}',
      '.iz-fzs-status ul{margin:6px 0 10px 18px}',
      '.iz-fzs-status[hidden]{display:none}',
      '.iz-root .iz-scan-pruefen{background:#fff3b0!important;border-color:#e0b100!important}',
      /* Formular */
      '.iz-sec{background:#fff;border:1px solid var(--iz-rahmen);border-radius:var(--iz-r);padding:24px;margin-bottom:16px;box-shadow:0 2px 10px rgba(0,123,255,.06)}',
      '.iz-sec-t{font-family:"Plus Jakarta Sans",system-ui,sans-serif;font-size:20px;font-weight:700;margin-bottom:18px;padding-bottom:14px;border-bottom:1px solid var(--iz-rahmen);display:flex;gap:12px;align-items:center}',
      '.iz-nummer{width:34px;height:34px;border-radius:10px;background:var(--iz-blau-d);color:#fff;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:16px;flex-shrink:0}',
      '.iz-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:14px}',
      '.iz-fg{display:flex;flex-direction:column;gap:6px}',
      '.iz-fg.full{grid-column:1/-1}',
      '.iz-fg>label,.iz-lbl{font-size:13px;font-weight:600;color:var(--iz-sub)}',
      '.iz-sub{margin-top:20px;padding-top:18px;border-top:1px dashed var(--iz-rahmen)}',
      '.iz-sub-l{font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:var(--iz-sub);margin-bottom:12px}',
      '.iz-cbgrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:10px}',
      '.iz-cb{display:flex;align-items:center;gap:12px;padding:10px 14px;min-height:52px;border:1.5px solid var(--iz-rahmen);border-radius:12px;cursor:pointer;background:#fff;user-select:none}',
      '.iz-cb:hover{border-color:var(--iz-blau)}',
      '.iz-cb input{width:22px;height:22px;min-height:0;flex-shrink:0;accent-color:var(--iz-blau-d);padding:0}',
      '.iz-cb span{font-size:15px;font-weight:500}',
      '.iz-reifen{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:12px}',
      '.iz-reifen-b{border:1.5px solid var(--iz-rahmen);border-radius:12px;padding:12px 14px}',
      '.iz-reifen-b.aktiv{border-color:var(--iz-blau);background:rgba(0,123,255,.04)}',
      '.iz-profil{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:10px}',
      '.iz-profil label{font-size:12px;color:var(--iz-sub)}',
      '.iz-mn-kopf,.iz-mn-zeile{display:grid;grid-template-columns:22% 1fr 150px;gap:8px;align-items:center}',
      '.iz-mn-kopf{font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.7px;background:var(--iz-bg);padding:10px 12px;border-radius:10px;margin-bottom:6px}',
      '.iz-mn-zeile{padding:5px 0;border-bottom:1px solid var(--iz-rahmen)}',
      '.iz-mn-zeile .nm{font-weight:600;font-size:14px;color:var(--iz-sub)}',
      '.iz-mn-zeile input[type=number]{text-align:right}',
      '.iz-mn-summe{display:flex;justify-content:space-between;align-items:center;background:var(--iz-blau-d);color:#fff;font-weight:700;padding:12px 16px;border-radius:12px;margin-top:10px;font-size:19px}',
      '.iz-lack{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:10px 14px}',
      '.iz-hinweis{background:#fffbf0;border-left:4px solid #c8982a;border-radius:8px;padding:10px 14px;font-size:14.5px;margin-top:12px}',
      '.iz-hinweis.rot{background:#fdecec;border-left-color:var(--iz-rot);color:#7a0a10;font-weight:600}',
      '.iz-hinweis.blau{background:#eef5ff;border-left-color:var(--iz-blau-d)}',
      '.iz-hinweis.gruen{background:#e8f6ee;border-left-color:var(--iz-gruen);color:#14532d}',
      '.iz-zus-liste{display:grid;gap:10px}',
      '.iz-zus-row{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:10px 14px;min-height:60px;border:1.5px solid var(--iz-rahmen);border-radius:12px;background:#fff}',
      '.iz-zus-row.iz-zus-leer{border-color:var(--iz-rot);background:#fff5f5}',
      '.iz-zus-l{font-size:16px;font-weight:600}',
      '.iz-zus-opts{display:flex;gap:8px;flex-shrink:0}',
      '.iz-zus-opt{display:inline-flex;align-items:center;justify-content:center;gap:8px;min-height:48px;min-width:96px;padding:0 18px;border:2px solid var(--iz-rahmen);border-radius:12px;font-size:16px;font-weight:700;cursor:pointer;background:#fff;user-select:none}',
      '.iz-root .iz-zus-opt input{width:22px;height:22px;min-height:0;padding:0;margin:0;flex-shrink:0;accent-color:var(--iz-blau-d)}',
      '.iz-zus-opt:has(input:checked){border-color:var(--iz-blau-d);background:#E8F0FB;color:var(--iz-blau-d)}',
      '.iz-pruef{display:grid;grid-template-columns:minmax(220px,1.1fr) 1fr 1.4fr;gap:14px;align-items:end;grid-column:1/-1}',
      '.iz-pflicht{border-color:var(--iz-rot)!important;box-shadow:0 0 0 3px rgba(193,18,26,.1)}',
      '.iz-aktionen{display:flex;gap:12px;justify-content:flex-end;flex-wrap:wrap;margin-top:8px}',
      '.iz-fotos{display:grid;grid-template-columns:repeat(auto-fill,minmax(130px,1fr));gap:10px;margin-top:12px}',
      '.iz-thumb{position:relative;aspect-ratio:4/3;border-radius:10px;overflow:hidden;border:1.5px solid var(--iz-rahmen);background:var(--iz-bg)}',
      '.iz-thumb img{width:100%;height:100%;object-fit:cover;display:block;cursor:zoom-in;min-height:0;border:0;border-radius:0;padding:0}',
      '.iz-thumb-del{position:absolute;top:4px;right:4px;width:34px;height:34px;min-height:0;border-radius:50%;border:none;background:rgba(193,18,26,.92);color:#fff;font-size:16px;cursor:pointer;display:flex;align-items:center;justify-content:center;padding:0}',
      '.iz-fotobtns{display:flex;gap:10px;flex-wrap:wrap}',
      '.iz-fotobtn{border:2px dashed var(--iz-blau-d);color:var(--iz-blau-d);background:var(--iz-bg);border-radius:12px;padding:12px 18px;min-height:52px;display:inline-flex;align-items:center;gap:8px;font-weight:600;cursor:pointer}',
      '.iz-fotobtn input{display:none}',
      /* Modal */
      '.iz-ov{position:fixed;inset:0;background:rgba(26,35,51,.55);z-index:5000;display:flex;align-items:flex-start;justify-content:center;padding:16px;overflow-y:auto}',
      '.iz-modal{background:#fff;border-radius:20px;padding:26px;max-width:760px;width:100%;margin:auto;box-shadow:0 12px 48px rgba(0,60,160,.25);font-family:"DM Sans",system-ui,sans-serif;color:var(--iz-ink);font-size:16px;line-height:1.5}',
      '.iz-modal *{box-sizing:border-box}',
      '.iz-modal input,.iz-modal select,.iz-modal textarea{font:inherit;font-size:16px;color:var(--iz-ink);background:#fff;border:1.5px solid var(--iz-rahmen);border-radius:12px;padding:11px 14px;min-height:48px;width:100%}',
      '.iz-modal textarea{min-height:80px}',
      '.iz-modal input:focus,.iz-modal textarea:focus,.iz-modal select:focus{outline:none;border-color:var(--iz-blau);box-shadow:0 0 0 4px rgba(0,123,255,.12)}',
      '.iz-modal h3{font-family:"Plus Jakarta Sans",system-ui,sans-serif;font-size:22px;font-weight:700;margin:0}',
      '.iz-modal-kopf{display:flex;justify-content:space-between;align-items:flex-start;gap:12px;margin-bottom:16px;padding-bottom:14px;border-bottom:1px solid var(--iz-rahmen)}',
      '.iz-x{border:none;background:none;font-size:26px;cursor:pointer;color:var(--iz-sub);min-height:44px;min-width:44px;width:auto!important;padding:0!important}',
      '.iz-zeile{display:flex;justify-content:space-between;gap:12px;padding:8px 0;border-bottom:1px solid var(--iz-rahmen);font-size:15px}',
      '.iz-zeile span:first-child{color:var(--iz-sub)}.iz-zeile span:last-child{font-weight:600;text-align:right}',
      '.iz-preis{background:linear-gradient(135deg,#f8fbff,#eef4fd);border:1px solid rgba(0,123,255,.2);border-radius:14px;padding:16px 20px;margin-top:14px;display:flex;justify-content:space-between;align-items:center}',
      '.iz-preis b{font-family:"Plus Jakarta Sans",system-ui,sans-serif;font-size:28px;color:var(--iz-blau-d)}',
      '.iz-modal-akt{display:flex;gap:10px;flex-wrap:wrap;margin-top:20px}',
      '.iz-chips{display:flex;flex-wrap:wrap;gap:6px}',
      '.iz-chip{background:var(--iz-bg);border:1px solid var(--iz-rahmen);border-radius:20px;padding:2px 12px;font-size:13.5px}',
      '.iz-abw{background:#fdecec;border:1.5px solid var(--iz-rot);border-radius:12px;padding:10px 14px;margin-top:8px}',
      '.iz-abw ul{margin:6px 0 0 18px;padding:0;color:#7a0a10}',
      '.iz-abw li{margin:3px 0;font-weight:600}',
      '.iz-ok{background:#e8f6ee;border:1.5px solid var(--iz-gruen);border-radius:12px;padding:10px 14px;margin-top:8px;color:#14532d;font-weight:600}',
      '.iz-soll{font-size:13.5px;color:var(--iz-sub);margin-top:2px}',
      '.iz-soll.rot{color:var(--iz-rot);font-weight:700}',
      '.iz-schaden{border:1.5px solid var(--iz-rahmen);border-radius:12px;padding:12px;margin-top:10px;display:grid;gap:8px}',
      '.iz-lightbox{position:fixed;inset:0;background:rgba(0,0,0,.92);z-index:9000;display:none;align-items:center;justify-content:center;padding:20px;cursor:zoom-out}',
      '.iz-lightbox.active{display:flex}',
      '.iz-lightbox img{max-width:100%;max-height:100%;border-radius:8px}',
      '.iz-lb-close{position:absolute;top:16px;right:20px;width:48px;height:48px;border-radius:50%;border:none;background:rgba(255,255,255,.18);color:#fff;font-size:22px;cursor:pointer}',
      /* Handy / Tablet */
      '@media (max-width:900px){.iz-tabelle tr.fil{display:none}.iz-mobilbar{display:flex;gap:10px;flex-wrap:wrap;margin-bottom:12px}.iz-mobilbar select{flex:1;min-width:140px}',
      /* Handy: ein Fahrzeug = eine Karte. Zeile 1 Fahrzeug | Kaufpreis, Zeile 2 Kunde | Status, Zeile 3 Int.-Nr. · Datum · Kennzeichen. Tippen öffnet den Ankauf. */
      ' .iz-tabelle thead{display:none}.iz-tabelle table,.iz-tabelle tbody{display:block;width:100%}',
      ' .iz-tabelle tbody tr{display:grid;grid-template-columns:auto auto minmax(0,1fr) auto;align-items:center;gap:3px 10px;padding:10px 12px 10px 16px;border-top:1px solid var(--border);min-height:64px}',
      ' .iz-tabelle tbody tr:first-child{border-top:0}',
      ' .iz-tabelle td{padding:0;height:auto;border:none;font-size:14px;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
      ' .iz-tabelle td:first-child{padding-left:0}',
      ' .iz-tabelle td:nth-child(2){grid-column:1/4;grid-row:1;font-size:15px;white-space:normal;line-height:1.3}',
      ' .iz-tabelle td:nth-child(8){grid-column:4;grid-row:1;text-align:right}',
      ' .iz-tabelle td:nth-child(1){grid-column:1/4;grid-row:2;color:var(--iz-sub)}',
      ' .iz-tabelle td:nth-child(7){grid-column:4;grid-row:2;text-align:right}',
      ' .iz-tabelle td:nth-child(5){grid-column:1;grid-row:3;color:var(--iz-sub)}',
      ' .iz-tabelle td:nth-child(6){grid-column:2;grid-row:3;color:var(--iz-sub)}',
      ' .iz-tabelle td:nth-child(3){grid-column:3;grid-row:3;color:var(--iz-sub)}',
      ' .iz-tabelle td:nth-child(4){display:none}.iz-tabelle td:last-child{padding-right:0}}',
      '@media (max-width:720px){.iz-stats{grid-template-columns:repeat(3,1fr);gap:8px}.iz-stat{padding:10px}.iz-stat-v{font-size:24px}.iz-stat-l{font-size:11px;letter-spacing:.4px}',
      ' .iz-root{padding:10px}.iz-sec{padding:16px 14px}.iz-grid{grid-template-columns:1fr}.iz-cbgrid{grid-template-columns:1fr}',
      ' .iz-zus-row{flex-direction:column;align-items:stretch}.iz-zus-opts{justify-content:stretch}.iz-zus-opts .iz-zus-opt{flex:1}.iz-pruef{grid-template-columns:1fr}',
      ' .iz-mn-kopf{display:none}.iz-mn-zeile{grid-template-columns:1fr;gap:6px;padding:12px 0}.iz-mn-zeile .nm{color:var(--iz-blau-d);font-weight:700}',
      ' .iz-aktionen{flex-direction:column-reverse}.iz-aktionen .iz-btn{width:100%}.iz-ctrl{width:100%}.iz-ctrl input,.iz-ctrl select{width:100%}',
      ' .iz-modal{padding:18px 14px;border-radius:16px}.iz-zeile{flex-direction:column;gap:0}.iz-zeile span:last-child{text-align:left}',
      ' .iz-modal-akt .iz-btn{flex:1 1 100%}.iz-profil{grid-template-columns:1fr}',
      /* Ankauf-Ansicht am Handy: Reiterleiste scrollt weg (sonst bis zu 6 Reihen fest), Kopf klebt oben, Speichern/Drucken fest unten */
      ' body.iz-akte .tabs{position:static}body.iz-akte .iz-root{--iz-top:0px}',
      ' .ak-aktionen.pc{display:none}.ak-zeile1{align-items:flex-start;gap:10px}',
      ' .ak-titel h2{font-size:19px}.ak-meta{font-size:13.5px;gap:4px 10px}.ak-meta2{font-size:13px}',
      ' .ak-kopf{padding:10px 12px 8px;border-radius:14px;margin-bottom:12px}',
      ' .ak-zurueck .lz{display:none}.ak-zurueck{padding:0;width:44px;min-width:44px}',
      ' .ak-dirty{margin-top:8px;padding:4px 10px;font-size:13.5px}.ak-dirty .bsp{display:none}',
      ' .ak-sprung{gap:4px;margin-top:8px}.ak-sp{padding:0 2px;gap:3px;min-height:44px;border-radius:12px}.ak-sp .nm{display:none}',
      ' .ak-sp .n{width:22px;height:22px;font-size:13px}.ak-sp .ok{font-size:15px}.ak-sp .warn{width:20px;height:20px;font-size:13px}',
      ' .ak-sek-kopf{padding:12px 14px;min-height:60px}.ak-sek-kopf .t{font-size:17px}.ak-sek-body{padding:14px 14px 16px}.ak-st .txt{display:none}',
      ' .iz-root .ak-uebernahme{padding:14px}.ak-ueb-ent{flex-direction:column;align-items:stretch}',
      ' .ak-leiste{display:flex;position:fixed;left:0;right:0;bottom:0;z-index:70;gap:10px;background:#fff;border-top:1px solid var(--iz-rahmen);box-shadow:0 -6px 18px rgba(26,35,51,.12);padding:10px 12px calc(10px + env(safe-area-inset-bottom))}',
      ' .ak-leiste .btn-primary{flex:1}.ak-leiste .ak-menue{top:auto;bottom:calc(100% + 8px);right:0}',
      ' #iz-v-form{padding-bottom:92px}',
      ' .iz-fzs-knoepfe,.iz-fzs-knoepfe .iz-fotobtn{width:100%;justify-content:center}}',
      '@media (max-width:900px){.ak-ueb-grid{grid-template-columns:1fr}}',
      '@media print{.iz-root,.iz-ov{display:none!important}}'
    ].join('\n');
    document.head.appendChild(st);
  }

  /* ===================================================================
     6. Anzeige-Status & Filter/Sortierung
     =================================================================== */
  function anzeigeStatus(a) {
    if (a.uebernahme_status === 'abweichung_offen') return 'abweichung_offen';
    if (a.uebernahme_status === 'ok' || a.uebernahme_status === 'abweichung_geklaert') return 'uebernommen';
    return a.status;
  }
  function badge(a) {
    var s = anzeigeStatus(a);
    var t = STATUS_LABEL[s] || s;
    if (a.uebernahme_status === 'abweichung_geklaert') t = 'Übernommen (Abw. geklärt)';
    return '<span class="iz-badge iz-b-' + esc(s) + '">' + esc(t) + '</span>';
  }
  function sortWert(a, f) {
    if (f === 'status') return STATUS_LABEL[anzeigeStatus(a)] || a.status;
    if (f === 'fz_hersteller') return fzBez(a);
    if (f === 'kunde') return kundenName(a);
    return a[f];
  }
  function gefiltert() {
    var Fi = S.filter, qtxt = Fi.q.toLowerCase().trim();
    var c = Fi.cols;
    var erg = S.alle.filter(function (a) {
      if (Fi.owner === 'me' && S.userId && a.erstellt_von !== S.userId) return false;
      if (qtxt) {
        var blob = [a.interne_nr, a.fz_hersteller, a.fz_modell, a.fz_typ, a.fz_kennzeichen, a.fz_fahrgestellnr,
          a.vk_vorname, a.vk_nachname, a.vk_ort, a.vk_telefon, a.vk_email, a.bearbeiter_name, a.notizen]
          .filter(Boolean).join(' ').toLowerCase();
        if (blob.indexOf(qtxt) < 0) return false;
      }
      function has(v, f) { return !f || String(v || '').toLowerCase().indexOf(f) >= 0; }
      if (!has(a.interne_nr, c.interne_nr)) return false;
      if (c.erstellt_am && fmtDatum(a.erstellt_am).toLowerCase().indexOf(c.erstellt_am) < 0) return false;
      if (c.fz_hersteller && fzBez(a).toLowerCase().indexOf(c.fz_hersteller) < 0) return false;
      if (!has(a.fz_fahrgestellnr, c.fz_fahrgestellnr)) return false;
      if (!has(a.fz_kennzeichen, c.fz_kennzeichen)) return false;
      if (c.kunde && kundenName(a).toLowerCase().indexOf(c.kunde) < 0) return false;
      if (c.ankaufspreis && String(Math.round(Number(a.ankaufspreis) || 0)).indexOf(c.ankaufspreis.replace(/[.,€\s]/g, '')) < 0) return false;
      if (Fi.status && anzeigeStatus(a) !== Fi.status) return false;
      return true;
    });
    var f = S.sortField, dir = S.sortDir;
    erg.sort(function (a, b) {
      var va = sortWert(a, f), vb = sortWert(b, f);
      if (va == null && vb == null) return 0;
      if (va == null) return 1; if (vb == null) return -1;
      if (typeof va === 'number' && typeof vb === 'number') return dir === 'asc' ? va - vb : vb - va;
      va = String(va).toLowerCase(); vb = String(vb).toLowerCase();
      return dir === 'asc' ? (va < vb ? -1 : va > vb ? 1 : 0) : (va < vb ? 1 : va > vb ? -1 : 0);
    });
    return erg;
  }

  /* ===================================================================
     7. Liste
     =================================================================== */
  var SPALTEN = [
    ['kunde', 'Kunde', 'Name'], ['fz_hersteller', 'Fahrzeug', 'Marke/Modell'], ['fz_kennzeichen', 'Kennzeichen', 'Kennz.'],
    ['fz_fahrgestellnr', 'Fgst.-Nr.', 'FIN'], ['interne_nr', 'Int.-Nr.', 'filtern…'], ['erstellt_am', 'Datum', 'z.B. 17.11'],
    ['status', 'Status', ''], ['ankaufspreis', 'Kaufpreis', '€']
  ];
  var STATUS_FILTER = [['', 'Alle'], ['neu', 'Neu'], ['bewertet', 'Bewertet'], ['vertrag_erstellt', 'Angekauft'],
    ['uebernommen', 'Übernommen'], ['abweichung_offen', 'Abweichung offen'], ['abgeschlossen', 'Abgeschlossen'], ['abgelehnt', 'Abgelehnt']];
  // Statusfilter als Knöpfe (Oli, 25.11.2026): Alle · Neu · Bewertet · Vertrag · Übernommen · Abweichung (rot)
  var STATUS_KNOEPFE = [['', 'Alle'], ['neu', 'Neu'], ['bewertet', 'Bewertet'], ['vertrag_erstellt', 'Angekauft'],
    ['uebernommen', 'Übernommen'], ['abweichung_offen', 'Abweichung', 'rot']];

  function setzeStatusFilter(wert) {
    S.filter.status = wert || '';
    var r = S.root; if (!r) return;
    var sel = r.querySelector('#iz-f-status'); if (sel) sel.value = S.filter.status;
    r.querySelectorAll('#iz-fk button').forEach(function (b) { b.setAttribute('aria-pressed', b.getAttribute('data-f') === S.filter.status ? 'true' : 'false'); });
    zeichneTabelle();
  }

  function baueGeruest() {
    S.root.innerHTML =
      '<div id="iz-v-liste">' +
      '<div class="iz-kopf"><h2>Alle <em>Inzahlungnahmen</em></h2><div class="iz-ctrl">' +
      '<select id="iz-owner"><option value="all">Alle Mitarbeiter</option><option value="me">Nur meine Ankäufe</option></select>' +
      '<input type="search" id="iz-suche" placeholder="🔍 Volltextsuche…">' +
      '<button class="iz-btn iz-btn-o iz-btn-sm" id="iz-reload" type="button">↻ Aktualisieren</button>' +
      '<button class="iz-btn iz-btn-p" id="iz-neu" type="button">➕ Neuer Ankauf</button></div></div>' +
      '<div class="iz-fk" id="iz-fk" role="group" aria-label="Status filtern">' + STATUS_KNOEPFE.map(function (s) {
        return '<button type="button" data-f="' + s[0] + '" aria-pressed="' + (s[0] === '' ? 'true' : 'false') + '"' + (s[2] ? ' class="' + s[2] + '"' : '') + '>' + s[1] + '</button>';
      }).join('') + '</div>' +
      '<div class="iz-mobilbar">' +
      '<select id="iz-m-sort" aria-label="Sortierung"><option value="erstellt_am|desc">Neueste zuerst</option><option value="erstellt_am|asc">Älteste zuerst</option><option value="kunde|asc">Kunde A–Z</option><option value="fz_hersteller|asc">Fahrzeug A–Z</option><option value="ankaufspreis|desc">Preis hoch</option><option value="status|asc">Status</option></select></div>' +
      '<div class="iz-tabelle"><div id="iz-laden" class="iz-laden">Lade Daten…</div><div id="iz-leer" class="iz-leer" style="display:none"><div style="font-size:48px">🚗</div><h3>Keine Ankäufe gefunden</h3><p>Mit „Neuer Ankauf“ geht es los.</p></div>' +
      '<table id="iz-tab" style="display:none"><thead><tr>' +
      SPALTEN.map(function (s) { return '<th class="sort" data-sort="' + s[0] + '" id="iz-th-' + s[0] + '">' + s[1] + '</th>'; }).join('') + '</tr>' +
      '<tr class="fil">' + SPALTEN.map(function (s) {
        if (s[0] === 'status') return '<th><select id="iz-f-status" aria-label="Status filtern">' + STATUS_FILTER.map(function (o) { return '<option value="' + o[0] + '">' + o[1] + '</option>'; }).join('') + '</select></th>';
        return '<th><input type="text" data-col="' + s[0] + '" placeholder="' + s[2] + '" aria-label="' + s[1] + ' filtern"></th>';
      }).join('') + '</tr></thead><tbody id="iz-body"></tbody></table></div></div>' +
      '<div id="iz-v-form" style="display:none"></div>';

    var r = S.root;
    r.querySelector('#iz-suche').addEventListener('input', function (e) { S.filter.q = e.target.value; zeichneTabelle(); });
    r.querySelector('#iz-owner').addEventListener('change', function (e) { S.filter.owner = e.target.value; zeichneTabelle(); });
    r.querySelector('#iz-reload').addEventListener('click', function () { ladeListe(true); });
    r.querySelector('#iz-neu').addEventListener('click', function () { neuerAnkauf(); });
    r.querySelectorAll('input[data-col]').forEach(function (inp) {
      inp.addEventListener('input', function () { S.filter.cols[inp.getAttribute('data-col')] = inp.value.toLowerCase().trim(); zeichneTabelle(); });
    });
    r.querySelector('#iz-f-status').addEventListener('change', function (e) { setzeStatusFilter(e.target.value); });
    r.querySelector('#iz-fk').addEventListener('click', function (e) {
      var b = e.target.closest('button[data-f]'); if (b) setzeStatusFilter(b.getAttribute('data-f'));
    });
    r.querySelector('#iz-m-sort').addEventListener('change', function (e) {
      var p = e.target.value.split('|'); S.sortField = p[0]; S.sortDir = p[1]; zeichneTabelle();
    });
    r.querySelectorAll('th[data-sort]').forEach(function (th) {
      th.addEventListener('click', function () {
        var f = th.getAttribute('data-sort');
        if (S.sortField === f) S.sortDir = S.sortDir === 'asc' ? 'desc' : 'asc'; else { S.sortField = f; S.sortDir = 'asc'; }
        zeichneTabelle();
      });
    });
    // Klick (oder Enter) auf eine Zeile öffnet direkt die Ankauf-Ansicht
    r.querySelector('#iz-body').addEventListener('click', function (e) {
      var tr = e.target.closest('tr[data-open]'); if (tr) bearbeiten(tr.getAttribute('data-open'));
    });
    r.querySelector('#iz-body').addEventListener('keydown', function (e) {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      var tr = e.target.closest('tr[data-open]'); if (tr) { e.preventDefault(); bearbeiten(tr.getAttribute('data-open')); }
    });
  }

  function aktualisiereStats() {
    var ziel = S.root && S.root.querySelector('#iz-stats');
    if (!ziel) return;   // 25.11.2026: Statistik-Kacheln auf Olis Wunsch entfernt
    var data = S.alle, jetzt = new Date();
    var monat = data.filter(function (a) { var d = new Date(a.erstellt_am); return d.getMonth() === jetzt.getMonth() && d.getFullYear() === jetzt.getFullYear(); }).length;
    var offen = data.filter(function (a) { return ['neu', 'bewertet', 'vertrag_erstellt'].indexOf(a.status) >= 0; }).length;
    var abg = data.filter(function (a) { return a.status === 'abgeschlossen'; }).length;
    var angekauft = data.filter(function (a) { return a.status === 'vertrag_erstellt' && !/^(ok|abweichung_geklaert|abweichung_offen)$/.test(a.uebernahme_status || ''); }).length;
    var uebern = data.filter(function (a) { return a.uebernahme_status === 'ok' || a.uebernahme_status === 'abweichung_geklaert'; }).length;
    var abw = data.filter(function (a) { return a.uebernahme_status === 'abweichung_offen'; }).length;
    var kacheln = [['Gesamt', data.length], ['Diesen Monat', monat], ['In Bearbeitung', offen], ['Abgeschlossen', abg],
      ['Angekauft, Übernahme offen', angekauft], ['Übernommen', uebern], ['Abweichung offen', abw, abw > 0]];
    S.root.querySelector('#iz-stats').innerHTML = kacheln.map(function (k) {
      return '<div class="iz-stat' + (k[2] ? ' rot' : '') + '"><div class="iz-stat-l">' + k[0] + '</div><div class="iz-stat-v">' + k[1] + '</div></div>';
    }).join('');
  }

  function zeichneTabelle() {
    var r = S.root; if (!r) return;
    var daten = gefiltert();
    SPALTEN.forEach(function (s) {
      var th = r.querySelector('#iz-th-' + s[0]); if (!th) return;
      th.classList.remove('asc', 'desc');
      if (S.sortField === s[0]) th.classList.add(S.sortDir);
    });
    var tab = r.querySelector('#iz-tab'), leer = r.querySelector('#iz-leer');
    if (!daten.length) { tab.style.display = 'none'; leer.style.display = 'block'; return; }
    leer.style.display = 'none'; tab.style.display = 'table';
    r.querySelector('#iz-body').innerHTML = daten.map(function (a) {
      return '<tr class="iz-zeile-klick" tabindex="0" data-open="' + esc(a.id) + '">' +
        '<td data-l="Kunde">' + esc(kundenName(a) || '–') + '</td>' +
        '<td data-l="Fahrzeug"><strong>' + esc(fzBez(a) || '–') + '</strong></td>' +
        '<td data-l="Kennzeichen">' + esc(a.fz_kennzeichen || '–') + '</td>' +
        '<td data-l="Fgst.-Nr."><span class="iz-fin">' + esc(a.fz_fahrgestellnr || '–') + '</span></td>' +
        '<td data-l="Int.-Nr."><span class="iz-nr">' + esc(a.interne_nr || '–') + '</span></td>' +
        '<td data-l="Datum">' + fmtDatum(a.erstellt_am) + '</td>' +
        '<td data-l="Status">' + badge(a) + '</td>' +
        '<td data-l="Kaufpreis"><strong>' + (a.ankaufspreis ? fmtEuroRund(a.ankaufspreis) : '–') + '</strong></td></tr>';
    }).join('');
  }

  async function ladeListe(meldung) {
    var r = S.root; if (!r) return;
    await holeUser();
    r.querySelector('#iz-laden').style.display = 'block';
    r.querySelector('#iz-tab').style.display = 'none';
    r.querySelector('#iz-leer').style.display = 'none';
    try {
      S.alle = await Daten.laden();
    } catch (e) {
      r.querySelector('#iz-laden').style.display = 'none';
      toast('Fehler beim Laden: ' + fehlerText(e), 'error');
      return;
    }
    r.querySelector('#iz-laden').style.display = 'none';
    aktualisiereStats();
    zeichneTabelle();
    if (meldung) toast('Aktualisiert.', 'success');
  }

  function zeigeListe() {
    S.view = 'liste';
    S.root.querySelector('#iz-v-liste').style.display = '';
    S.root.querySelector('#iz-v-form').style.display = 'none';
    setzeAkteKlasse();
    window.scrollTo(0, 0);
  }

  /* ===================================================================
     8. Formular
     =================================================================== */
  function feldHtml(f) {
    var id = 'iz_' + f.c, cls = 'iz-fg' + (f.full ? ' full' : '');
    var inp;
    switch (f.t) {
      case 'select':
        inp = '<select id="' + id + '"><option value="">– wählen –</option>' + f.o.map(function (o) { return '<option>' + esc(o) + '</option>'; }).join('') + '</select>'; break;
      case 'area':
        inp = '<textarea id="' + id + '" rows="' + (f.rows || 3) + '" placeholder="' + esc(f.ph || '') + '"></textarea>'; break;
      case 'int':
        inp = '<input type="number" id="' + id + '" inputmode="numeric" placeholder="' + esc(f.ph || '') + '"' + (f.min != null ? ' min="' + f.min + '"' : '') + (f.step ? ' step="' + f.step + '"' : '') + '>'; break;
      default:
        inp = '<input type="' + (f.t === 'text' ? 'text' : f.t) + '" id="' + id + '" placeholder="' + esc(f.ph || '') + '"' + (f.im ? ' inputmode="' + f.im + '"' : '') + (f.up ? ' style="text-transform:uppercase"' : '') + '>';
    }
    return '<div class="' + cls + '"><label for="' + id + '">' + esc(f.l) + '</label>' + inp + '</div>';
  }
  function cbHtml(id, label) {
    return '<label class="iz-cb"><input type="checkbox" id="iz_' + id + '"><span>' + label + '</span></label>';
  }
  var SEK_NAMEN = ['Verkäufer', 'Fahrzeug', 'Ausstattung', 'Zusicherungen', 'Mängel', 'Status'];
  function sekt(nr, titel, inhalt) {
    return '<section class="iz-sec ak-sek" id="iz-sek' + nr + '" data-sek="' + nr + '">' +
      '<button type="button" class="ak-sek-kopf" aria-expanded="false" aria-controls="iz-sekb' + nr + '"><span class="iz-nummer">' + nr + '</span><span class="t">' + titel + '</span>' +
      '<span class="ak-st ok" data-st="' + nr + '"></span><span class="ak-chev" aria-hidden="true">▾</span></button>' +
      '<div class="ak-sek-body" id="iz-sekb' + nr + '">' + inhalt + '</div></section>';
  }

  // Drucken-Menü (Kopf: ohne, feste Leiste am Handy: mit „Fahrzeug übernehmen“)
  function menueHtml(mitUebernehmen) {
    return '<span class="ak-menuewrap" data-nur-edit>' +
      '<button type="button" class="btn btn-ghost" data-menue aria-haspopup="true" aria-expanded="false">Drucken ▾</button>' +
      '<div class="ak-menue" role="menu">' +
      '<button type="button" role="menuitem" data-druck="kauf">🖨️ Kaufvertrag</button>' +
      '<button type="button" role="menuitem" data-druck="zustand">📋 Zustandsbericht</button>' +
      '<button type="button" role="menuitem" data-druck="uebergabe">🖨️ Übergabeprotokoll</button>' +
      (mitUebernehmen ? '<div data-uebern hidden><div class="ak-trenner"></div><button type="button" role="menuitem" data-ak="uebernehmen"><span data-uebern-text>🚗 Fahrzeug übernehmen</span></button></div>' : '') +
      '</div></span>';
  }
  function kopfHtml() {
    return '<div class="ak-kopf" id="iz-kopf"><div class="ak-zeile1">' +
      '<button type="button" class="btn btn-ghost btn-klein ak-zurueck" id="iz-zurueck" aria-label="Zur Liste"><span>←</span><span class="lz"> Liste</span></button>' +
      '<div class="ak-titel"><h2 id="iz-form-titel">Neuer Ankauf</h2><div class="ak-meta" id="iz-form-meta"></div><div class="ak-meta2" id="iz-form-meta2"></div></div>' +
      '<div class="ak-aktionen pc"><button type="button" class="btn btn-primary" id="iz_speichern" data-ak="speichern">💾 Speichern</button>' + menueHtml(false) +
      '<button type="button" class="btn btn-ghost" data-ak="uebernehmen" data-uebern hidden><span data-uebern-text>🚗 Fahrzeug übernehmen</span></button></div></div>' +
      '<div class="ak-dirty" id="iz-dirty" hidden role="status"><span class="pkt"></span><b>Ungespeicherte Änderungen</b><span class="bsp">– bitte „Speichern“ nicht vergessen</span></div>' +
      '<nav class="ak-sprung" aria-label="Zu Abschnitt springen">' + SEK_NAMEN.map(function (nm, i) {
        return '<button type="button" class="ak-sp" data-sp="' + (i + 1) + '"><span class="n">' + (i + 1) + '</span><span class="nm">' + nm + '</span><span class="st"></span></button>';
      }).join('') + '</nav></div>';
  }
  function fzsHtml() {
    return '<div class="iz-fzs" id="iz_fzs"><div class="iz-fzs-kopf"><div><div class="iz-fzs-titel">📷 Fahrzeugschein einlesen</div>' +
      '<div class="iz-fzs-text">Foto oder Scan der Zulassungsbescheinigung Teil I – die Daten werden in die leeren Felder übernommen. Das Bild wird nicht gespeichert.</div></div>' +
      '<div class="iz-fzs-knoepfe"><label class="iz-fotobtn">📷 Foto aufnehmen<input type="file" accept="image/*" capture="environment" id="iz_fzs_kamera"></label>' +
      '<label class="iz-fotobtn">📄 Datei wählen<input type="file" accept="image/*,application/pdf" id="iz_fzs_datei"></label></div></div>' +
      '<div class="iz-fzs-status" id="iz_fzs_status" hidden></div></div>';
  }

  function baueFormular() {
    var h = '';
    h += kopfHtml();
    h += '<div id="iz_ueb_platz"></div>';
    h += '<div class="ak-alle"><button type="button" class="ak-link rot" id="iz_leeren">Formular leeren</button><button type="button" class="ak-link" id="iz-alle">Alle aufklappen</button></div>';
    h += sekt(1, 'Verkäufer (Privatkunde)', fzsHtml() + '<div class="iz-grid">' + F_KUNDE.map(feldHtml).join('') + '</div>');
    // 2 Fahrzeug
    h += sekt(2, 'Fahrzeugdaten',
      '<div class="iz-grid">' + F_FAHRZEUG.map(feldHtml).join('') + '</div>' +
      '<div class="iz-sub"><div class="iz-sub-l">Bereifung</div><div class="iz-reifen">' +
      REIFEN.map(function (t) {
        return '<div class="iz-reifen-b" id="iz-reifen-' + t.typ + '"><label class="iz-cb" style="border:none;padding:0;min-height:40px"><input type="checkbox" id="iz_reifen_' + t.typ + '"><span>' + t.icon + ' ' + t.name + '</span></label>' +
          '<div class="iz-profil"><div><label for="iz_reifen_' + t.typ + '_profil_vorne">Profil vorne (mm)</label><input type="text" inputmode="decimal" id="iz_reifen_' + t.typ + '_profil_vorne" placeholder="' + t.ph + '"></div>' +
          '<div><label for="iz_reifen_' + t.typ + '_profil_hinten">Profil hinten (mm)</label><input type="text" inputmode="decimal" id="iz_reifen_' + t.typ + '_profil_hinten" placeholder="' + t.ph + '"></div></div></div>';
      }).join('') + '</div></div>');
    // 3 Ausstattung
    h += sekt(3, 'Ausstattung', '<div class="iz-cbgrid">' + AUSST.map(function (x) { return cbHtml(x[0], x[1]); }).join('') + '</div>');
    // 4 Zusicherungen + bekannte Mängel + KD
    h += sekt(4, 'Zusicherungen des Verkäufers',
      '<div class="iz-zus-liste" id="iz_zus_liste">' + ZUS_ROWS.map(function (r) {
        return '<div class="iz-zus-row" id="iz_zus_row_' + r.key + '"><span class="iz-zus-l">' + esc(r.label) + ' *</span><span class="iz-zus-opts">' +
          '<label class="iz-zus-opt"><input type="radio" name="iz_zus_' + r.key + '" id="iz_zus_' + r.key + '_ja" value="ja">Ja</label>' +
          '<label class="iz-zus-opt"><input type="radio" name="iz_zus_' + r.key + '" id="iz_zus_' + r.key + '_nein" value="nein">Nein</label></span></div>';
      }).join('') + '</div>' +
      '<div class="iz-sub"><div class="iz-sub-l">Bekannte Mängel (vom Verkäufer angegeben)</div>' +
      '<div class="iz-fg full"><label for="iz_vk_bekannte_maengel">Dem Verkäufer sind folgende Mängel bekannt *</label>' +
      '<textarea id="iz_vk_bekannte_maengel" rows="4" placeholder="z.B. Klimaanlage kühlt nicht richtig, Steinschlag in Frontscheibe, … Falls dem Verkäufer KEINE Mängel bekannt sind, bitte explizit eintragen: \'Keine Mängel bekannt\'."></textarea>' +
      '<small style="color:var(--iz-sub)">Pflichtfeld – wird in den Kaufvertrag übernommen (rechtlich relevant: Verkäufer haftet bei arglistig verschwiegenen Mängeln).</small></div></div>' +
      '<div class="iz-sub"><div class="iz-sub-l">Schäden laut Verkäufer (welche und wo)</div>' +
      '<div class="iz-fg full"><label for="iz_vk_schaeden">Der Verkäufer gibt folgende Schäden an (Art und Stelle am Fahrzeug)</label>' +
      '<textarea id="iz_vk_schaeden" rows="4" placeholder="z.B. Parkrempler hinten links (Stoßfänger, 2024 repariert), Hagel auf Motorhaube und Dach, Kratzer Tür vorne rechts, … Falls keine Schäden: \'Keine Schäden bekannt\'."></textarea>' +
      '<small style="color:var(--iz-sub)">Wird in den Kaufvertrag (§ 4) übernommen und vom Verkäufer dort gesondert unterschrieben.</small></div></div>' +
      '<div class="iz-sub"><div class="iz-sub-l">Kundendiensthistorie</div><div class="iz-grid">' + F_KD.map(feldHtml).join('') +
      '<div class="iz-fg" style="justify-content:flex-end">' + cbHtml('kd_alle_durchgefuehrt', '✅ Alle KD lückenlos nachgewiesen') + '</div></div></div>');
    // 5 Mängel & Bewertung
    h += sekt(5, 'Mängel &amp; Bewertung',
      '<div class="iz-mn-kopf"><div>Baugruppe</div><div>Mängelbeschreibung</div><div style="text-align:right">Instandsetzung (€)</div></div>' +
      MN_ROWS.map(function (r) {
        return '<div class="iz-mn-zeile"><div class="nm">' + r.label + '</div><input type="text" id="iz_mn_' + r.key + '" placeholder="' + esc(MN_PLACEHOLDER[r.key] || '') + '" aria-label="' + esc(r.label) + ' Beschreibung">' +
          '<input type="number" id="iz_mn_' + r.key + '_kosten" placeholder="Kosten in € (0)" step="10" inputmode="decimal" aria-label="' + esc(r.label) + ' Kosten"></div>';
      }).join('') +
      '<div class="iz-mn-summe"><span>Gesamt Instandsetzungskosten</span><span id="iz_mn_gesamt">0,00 €</span></div>' +
      '<div class="iz-sub"><div class="iz-sub-l">Bemerkungen zur Mängel-Bewertung</div><div class="iz-fg full"><textarea id="iz_mn_bemerkungen" rows="3" placeholder="Interne Notizen zur Bewertung: Zustand allgemein, Auffälligkeiten bei der Besichtigung, Probefahrt-Eindrücke …"></textarea></div></div>' +
      '<div class="iz-sub"><div class="iz-sub-l">🎨 Lackschichtdicken-Messung (µm)</div>' +
      '<p style="font-size:14px;color:var(--iz-sub);margin:-2px 0 12px">Werkslack i.&nbsp;d.&nbsp;R. ca. 80–150&nbsp;µm. Werte über 200&nbsp;µm deuten auf Nachlackierung/Spachtel hin und werden im Prüfbericht hervorgehoben. Felder leer lassen, wenn nicht gemessen.</p>' +
      '<div class="iz-lack">' + LACK_POINTS.map(function (p) {
        return '<div class="iz-fg"><label for="iz_lack_' + p.key + '">' + p.label + '</label><input type="number" id="iz_lack_' + p.key + '" placeholder="µm" min="0" step="1" inputmode="numeric" data-lack="1"></div>';
      }).join('') + '</div>' +
      '<div class="iz-fg full" style="margin-top:12px"><label for="iz_lack_bemerkung">Bemerkung zur Lackmessung</label><textarea id="iz_lack_bemerkung" rows="2" placeholder="z.B. Heckklappe nachlackiert (Steinschlag), sonst durchgängig Werkslack."></textarea></div></div>' +
      '<div class="iz-sub"><div class="iz-sub-l">Fotos vom Fahrzeug</div>' +
      '<p style="font-size:14px;color:var(--iz-sub);margin:0 0 10px">Am Handy/Tablet öffnet „Foto aufnehmen“ die Kamera, „Aus Galerie / Datei“ wählt vorhandene Fotos. Die Fotos liegen im privaten Speicher.</p>' +
      '<div class="iz-fotobtns"><label class="iz-fotobtn">📷 Foto aufnehmen<input type="file" accept="image/*" capture="environment" id="iz_foto_kamera"></label>' +
      '<label class="iz-fotobtn">🖼️ Aus Galerie / Datei<input type="file" accept="image/*" multiple id="iz_foto_datei"></label></div>' +
      '<div class="iz-fotos" id="iz_fotos"></div></div>' +
      '<div class="iz-grid" style="margin-top:20px"><div class="iz-fg"><label for="iz_ankaufspreis">Ankaufspreis (€) *</label><input type="number" id="iz_ankaufspreis" placeholder="8500" step="100" inputmode="decimal"></div></div>' +
      '<div class="iz-hinweis rot">Auszahlung nur per Überweisung – nie bar.</div>');
    // 6 Status & Notizen
    h += sekt(6, 'Status &amp; Notizen',
      '<div class="iz-grid"><div class="iz-fg"><label for="iz_status">Status</label><select id="iz_status">' +
      STATUS_OPT.map(function (o) { return '<option value="' + o[0] + '">' + o[1] + '</option>'; }).join('') + '</select></div>' +
      feldHtml(F_STATUS[0]) +
      '<div class="iz-pruef">' + cbHtml('fz_geprueft', '✅ Fahrzeug überprüft') +
      '<div class="iz-fg"><label for="iz_fz_geprueft_datum">Datum</label><input type="date" id="iz_fz_geprueft_datum"></div>' +
      '<div class="iz-fg"><label for="iz_fz_pruefer_name">Name Prüfer</label><input type="text" id="iz_fz_pruefer_name" placeholder="Name des Prüfers"></div></div>' +
      feldHtml(F_STATUS[1]) + '</div>');
    // feste Leiste unten (nur Handy sichtbar)
    h += '<div class="ak-leiste" id="iz-leiste"><button type="button" class="btn btn-primary" data-ak="speichern">💾 Speichern</button>' + menueHtml(true) + '</div>';

    var v = S.root.querySelector('#iz-v-form');
    v.innerHTML = h;
    // Ereignisse
    v.querySelector('#iz-zurueck').addEventListener('click', formVerlassen);
    v.querySelector('#iz_leeren').addEventListener('click', async function () {
      if (await bestaetigen('Formular wirklich leeren? Nicht gespeicherte Eingaben gehen verloren.')) { await aufraeumenUploads(); setzeFormZurueck(); initAbschnitte(); }
    });
    v.querySelector('#iz-alle').addEventListener('click', function () {
      var zu = !!v.querySelector('.ak-sek:not(.open)');
      for (var n = 1; n <= 6; n++) oeffneSektion(n, zu);
    });
    v.addEventListener('click', function (e) {
      var t = e.target; if (!t.closest) return;
      var b;
      if ((b = t.closest('.ak-sek-kopf'))) { var s = b.parentNode; oeffneSektion(+s.getAttribute('data-sek'), !s.classList.contains('open')); return; }
      if ((b = t.closest('[data-sp]'))) { springeZu(+b.getAttribute('data-sp')); return; }
      if ((b = t.closest('[data-menue]'))) {
        var wrap = b.closest('.ak-menuewrap'), m = wrap.querySelector('.ak-menue'), war = m.classList.contains('offen');
        v.querySelectorAll('.ak-menue.offen').forEach(function (x) { x.classList.remove('offen'); });
        v.querySelectorAll('[data-menue]').forEach(function (x) { x.setAttribute('aria-expanded', 'false'); });
        if (!war) { m.classList.add('offen'); b.setAttribute('aria-expanded', 'true'); }
        return;
      }
      if ((b = t.closest('[data-druck]'))) { druckAnsicht(b.getAttribute('data-druck')); return; }
      if ((b = t.closest('[data-ak]'))) {
        var akt = b.getAttribute('data-ak');
        if (akt === 'speichern') speichern(); else if (akt === 'uebernehmen') uebernehmenStart();
        return;
      }
      if ((b = t.closest('[data-entscheiden]'))) { entscheidungSpeichern(b); return; }
      if ((b = t.closest('[data-fzs-geprueft]'))) { fzsGeprueft(); return; }
    });
    // ungespeicherte Änderungen + Live-Prüfung der Pflichtfelder
    var statusTimer = null;
    function eingabe(e) {
      var t = e.target;
      if (!t || t.type === 'file' || (t.closest && t.closest('#iz_ueb_platz'))) return;   // Scan-Dateien und Entscheidung (Admin) zählen nicht
      markDirty();
      clearTimeout(statusTimer); statusTimer = setTimeout(aktualisiereStatus, 120);
    }
    v.addEventListener('input', eingabe);
    v.addEventListener('change', eingabe);
    v.querySelectorAll('[id^="iz_mn_"][id$="_kosten"], #iz_ankaufspreis').forEach(function (el) { el.addEventListener('input', rechneSumme); });
    v.querySelectorAll('[data-lack]').forEach(function (el) { el.addEventListener('input', function () { lackPruefen(el); }); });
    REIFEN.forEach(function (t) {
      var cbx = v.querySelector('#iz_reifen_' + t.typ);
      var upd = function () { v.querySelector('#iz-reifen-' + t.typ).classList.toggle('aktiv', cbx.checked); };
      cbx.addEventListener('change', upd);
      ['vorne', 'hinten'].forEach(function (s) {
        v.querySelector('#iz_reifen_' + t.typ + '_profil_' + s).addEventListener('input', function () { if (!cbx.checked) { cbx.checked = true; upd(); } });
      });
    });
    v.querySelector('#iz_foto_kamera').addEventListener('change', fotoAuswahl);
    v.querySelector('#iz_foto_datei').addEventListener('change', fotoAuswahl);
    v.querySelector('#iz_fzs_kamera').addEventListener('change', function () { fahrzeugscheinLesen(this); });
    v.querySelector('#iz_fzs_datei').addEventListener('change', function () { fahrzeugscheinLesen(this); });
    v.querySelector('#iz_fotos').addEventListener('click', async function (e) {
      var b = e.target.closest('[data-fotodel]'); if (!b) return;
      var idx = +b.getAttribute('data-fotodel'), p = S.fotos[idx];
      if (!p || !(await bestaetigen('Foto wirklich entfernen?'))) return;
      S.fotos.splice(idx, 1);
      var ui = S.uploads.indexOf(p);
      if (ui >= 0) { S.uploads.splice(ui, 1); fotosEntfernen([p]); } else S.entfernt.push(p);
      zeichneFormFotos(); markDirty();
    });
    // Kopfhöhe messen (Abschnitte scrollen mit richtigem Abstand unter den festen Kopf)
    if (window.ResizeObserver) new ResizeObserver(kopfHoehe).observe(v.querySelector('#iz-kopf'));
    window.addEventListener('resize', kopfHoehe);
  }

  /* ---- Ankauf-Ansicht: Kopf, Abschnitte, Pflichtprüfung, Änderungsmerker ---- */
  function kopfHoehe() {
    var k = q('#iz-kopf'); if (!k || !S.root) return;
    S.root.style.setProperty('--iz-kopf-h', (k.offsetHeight || 150) + 'px');
  }
  function uebernehmbar(a) {
    return !!a && a.status === 'vertrag_erstellt' && ['ok', 'abweichung_geklaert'].indexOf(a.uebernahme_status) < 0;
  }
  function zeichneKopf(a) {
    var neu = !a, f = S.root.querySelector('#iz-v-form');
    q('#iz-form-titel').textContent = neu ? 'Neuer Ankauf' : (fzBez(a) || 'Ankauf');
    q('#iz-form-meta').innerHTML = neu ? '<span class="iz-badge iz-b-neu">Neu</span>'
      : '<span class="ak-nr">' + esc(a.interne_nr || 'ohne Int.-Nr.') + '</span>' + badge(a);
    q('#iz-form-meta2').textContent = 'Bearbeiter: ' + ((neu ? nutzerName() : a.bearbeiter_name) || '–') + ' · ' + (neu ? heute() : fmtDatum(a.erstellt_am));
    f.querySelectorAll('[data-nur-edit]').forEach(function (e) { e.hidden = neu; });
    var ub = uebernehmbar(a), txt = a && a.uebernahme_status === 'abweichung_offen' ? '🚗 Übernahme neu erfassen' : '🚗 Fahrzeug übernehmen';
    f.querySelectorAll('[data-uebern]').forEach(function (e) { e.hidden = !ub; });
    f.querySelectorAll('[data-uebern-text]').forEach(function (e) { e.textContent = txt; });
    var le = q('#iz_leeren'); if (le) le.hidden = !neu;   // „Formular leeren“ nur beim neuen Ankauf
    kopfHoehe();
  }
  function markDirty() {
    S.dirty = true;
    var d = q('#iz-dirty'); if (d) d.hidden = false;
  }
  function markClean() {
    S.dirty = false;
    var d = q('#iz-dirty'); if (d) d.hidden = true;
  }
  function wertVon(id) { var e = qi(id); return e && e.value != null ? String(e.value).trim() : ''; }
  function scanOffen() { return !!(S.root && S.root.querySelector('#iz-v-form .iz-scan-pruefen')); }
  // Pflichtfelder je Abschnitt – dieselben Regeln wie beim Speichern
  function pflichtLuecken() {
    var l = { 1: [], 2: [], 3: [], 4: [], 5: [], 6: [] };
    if (!wertVon('fz_hersteller')) l[2].push('Hersteller');
    if (!wertVon('fz_modell')) l[2].push('Modell');
    if (!wertVon('vk_bekannte_maengel')) l[4].push('Bekannte Mängel');
    ZUS_ROWS.forEach(function (r) { if (zusWert(r) === null) l[4].push(r.label); });
    if (scanOffen()) l[1].push('Fahrzeugschein-Daten prüfen');
    return l;
  }
  function aktualisiereStatus() {
    if (!S.root || !qi('vk_vorname')) return;
    var l = pflichtLuecken();
    for (var n = 1; n <= 6; n++) {
      var fehl = l[n].length > 0;
      var st = q('[data-st="' + n + '"]');
      if (st) {
        st.className = 'ak-st ' + (fehl ? 'warn' : 'ok');
        st.innerHTML = fehl ? '!<span class="txt"> ' + (n === 1 ? 'Daten prüfen' : 'Pflichtfeld fehlt') + '</span>' : '✓<span class="txt"> vollständig</span>';
      }
      var sp = q('[data-sp="' + n + '"]');
      if (sp) {
        sp.classList.toggle('hat-fehler', fehl);
        sp.querySelector('.st').innerHTML = fehl ? '<span class="warn" aria-hidden="true">!</span>' : '<span class="ok" aria-hidden="true">✓</span>';
        sp.setAttribute('aria-label', 'Abschnitt ' + n + ' ' + SEK_NAMEN[n - 1] + (fehl ? ': offen – ' + l[n].join(', ') : ': vollständig'));
      }
    }
    // erledigte Markierungen wieder wegnehmen
    ['fz_hersteller', 'fz_modell', 'vk_bekannte_maengel'].forEach(function (id) { if (wertVon(id)) qi(id).classList.remove('iz-pflicht'); });
    ZUS_ROWS.forEach(function (r) { if (zusWert(r) !== null) { var row = q('#iz_zus_row_' + r.key); if (row) row.classList.remove('iz-zus-leer'); } });
  }
  function oeffneSektion(n, offen) {
    var s = q('#iz-sek' + n); if (!s) return;
    s.classList.toggle('open', !!offen);
    var b = s.querySelector('.ak-sek-kopf'); if (b) b.setAttribute('aria-expanded', offen ? 'true' : 'false');
    var al = q('#iz-alle'); if (al) al.textContent = q('#iz-v-form .ak-sek:not(.open)') ? 'Alle aufklappen' : 'Alle zuklappen';
  }
  function springeZu(n) {
    oeffneSektion(n, true);
    var s = q('#iz-sek' + n); if (s) s.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  // Beim Öffnen: Abschnitte mit „!“ aufgeklappt, Abschnitt 1 immer, der Rest zu
  function initAbschnitte() {
    var l = pflichtLuecken();
    for (var n = 1; n <= 6; n++) oeffneSektion(n, n === 1 || l[n].length > 0);
    aktualisiereStatus();
  }

  function lackPruefen(el) {
    var val = parseDez(el.value), hi = val != null && val > 200;
    el.style.background = hi ? '#fff3cd' : ''; el.style.borderColor = hi ? '#c8982a' : '';
  }
  function rechneSumme() {
    var total = MN_ROWS.reduce(function (s, r) { var e = qi('mn_' + r.key + '_kosten'); return s + (e ? pnum(e.value) : 0); }, 0);
    qi('mn_gesamt').textContent = fmtEuro(total);
    return total;
  }
  function zeichneFormFotos() {
    var g = qi('fotos'); if (!g) return;
    g.innerHTML = S.fotos.map(function (p, i) { return thumbHtml(p, true, i); }).join('');
    bilderLaden(g);
  }
  async function fotoAuswahl(ev) {
    var files = Array.prototype.slice.call(ev.target.files || []);
    ev.target.value = '';
    var id = S.editId || S.newId;
    for (var i = 0; i < files.length; i++) {
      var f = files[i];
      if (!/^image\//.test(f.type) && !/\.(jpe?g|png|webp|heic|heif)$/i.test(f.name)) { toast('Nur Bilddateien erlaubt: ' + f.name, 'error'); continue; }
      try { S.fotos.push(await fotoSpeichern(f, id)); zeichneFormFotos(); markDirty(); }
      catch (e) { toast('Foto-Upload fehlgeschlagen: ' + fehlerText(e), 'error'); }
    }
  }
  async function aufraeumenUploads() {
    var weg = S.uploads.slice(); S.uploads = [];
    if (weg.length) await fotosEntfernen(weg);
  }

  function setzeFormZurueck() {
    S.editId = null; S.newId = uuid(); S.fotos = []; S.uploads = []; S.entfernt = []; S.huRoh = null; S.rec = null;
    var v = S.root.querySelector('#iz-v-form');
    v.querySelectorAll('input,select,textarea').forEach(function (el) {
      if (el.type === 'checkbox' || el.type === 'radio') el.checked = false; else if (el.type === 'file') el.value = ''; else el.value = '';
    });
    v.querySelectorAll('.iz-zus-row').forEach(function (r) { r.classList.remove('iz-zus-leer'); });
    qi('status').value = 'neu';
    qi('bearbeiter_name').value = nutzerName();
    qi('fz_pruefer_name').value = nutzerName();   // Prüfer mit angemeldetem Namen vorbelegen
    v.querySelectorAll('.iz-reifen-b').forEach(function (b) { b.classList.remove('aktiv'); });
    v.querySelectorAll('[data-lack]').forEach(lackPruefen);
    v.querySelectorAll('.iz-pflicht').forEach(function (el) { el.classList.remove('iz-pflicht'); });
    fzsZuruecksetzen();
    q('#iz_ueb_platz').innerHTML = '';
    rechneSumme(); zeichneFormFotos();
    zeichneKopf(null);
    markClean();
  }
  function setzeAkteKlasse() {
    var sec = S.root && S.root.closest ? S.root.closest('section') : null;
    document.body.classList.toggle('iz-akte', S.view === 'form' && !!sec && !sec.hidden);
  }
  function zeigeFormular() {
    S.view = 'form';
    S.root.querySelector('#iz-v-liste').style.display = 'none';
    S.root.querySelector('#iz-v-form').style.display = '';
    setzeAkteKlasse(); kopfHoehe();
    window.scrollTo(0, 0);
  }
  function neuerAnkauf() {
    if (!S.root.querySelector('#iz_vk_vorname')) baueFormular();
    setzeFormZurueck(); initAbschnitte(); markClean(); zeigeFormular();
  }
  async function formVerlassen() {
    if (S.dirty || S.uploads.length) {
      if (!(await bestaetigen('Du hast ungespeicherte Änderungen. Wirklich zur Liste zurück? Die Änderungen und neu hochgeladene Fotos gehen verloren.', { ja: 'Verwerfen', nein: 'Weiter bearbeiten', gefahr: true }))) return;
    }
    await aufraeumenUploads();
    markClean();
    zeigeListe(); ladeListe();
  }
  // Rückfrage vor dem Reiterwechsel (EG.zeigeTab wird in anmelden() umhüllt)
  function formHatAenderungen() { return S.view === 'form' && (S.dirty || S.uploads.length > 0); }

  /* Block „Übernahme bei der Abgabe“ (früher im Detailfenster), nur wenn uebernahme_status gesetzt */
  function uebernahmeHtml(a, admin) {
    var u = a.uebernahme_status; if (!u) return '';
    var abw = Array.isArray(a.uebernahme_abweichungen) ? a.uebernahme_abweichungen : [];
    var stand = { offen: 'offen', ok: 'übernommen, ohne Abweichung', abweichung_offen: 'Abweichung offen', abweichung_geklaert: 'übernommen, Abweichung geklärt' }[u] || u;
    var kmSchl = [];
    if (a.uebernahme_km != null) kmSchl.push(fmtKm(a.uebernahme_km));
    if (a.uebernahme_schluessel != null) kmSchl.push(a.uebernahme_schluessel + (a.uebernahme_schluessel === 1 ? ' Schlüssel' : ' Schlüssel'));
    var html = '<section class="iz-sec ak-uebernahme" id="iz_ueb"><h3>Übernahme bei der Abgabe ' + badge(a) + '</h3><div class="ak-ueb-grid"><div>' +
      '<div class="iz-zeile"><span>Stand</span><span>' + esc(stand) + '</span></div>' +
      (a.uebernahme_am ? '<div class="iz-zeile"><span>Übernommen am / von</span><span>' + fmtDatumZeit(a.uebernahme_am) + ' · ' + esc(a.uebernahme_von_name || '–') + '</span></div>' : '') +
      (kmSchl.length ? '<div class="iz-zeile"><span>km / Schlüssel bei Übernahme</span><span>' + esc(kmSchl.join(' · ')) + '</span></div>' : '') +
      (a.abweichung_betrag != null ? '<div class="iz-zeile"><span>Geschätzter Betrag</span><span>' + fmtEuro(a.abweichung_betrag) + '</span></div>' : '') +
      (u === 'abweichung_offen' ? '<div class="iz-hinweis rot" style="margin-top:8px">Betrag über ' + GRENZE_EURO + ' €: Oli entscheidet.</div>' : '') +
      '</div><div>' + (abw.length ? abweichungenHtml(abw) : '<div class="iz-ok" style="margin-top:0">Keine Abweichung zur Bewertung.</div>') + '</div></div>' +
      (a.abweichung_entscheidung ? '<div class="iz-hinweis blau"><b>Entscheidung</b> (' + esc(a.abweichung_entschieden_von_name || '–') + ', ' + fmtDatumZeit(a.abweichung_entschieden_am) + ')<div style="white-space:pre-wrap">' + esc(a.abweichung_entscheidung) + '</div></div>' : '');
    var cl = a.uebernahme_checkliste || {};
    var uf = [];
    if (cl.km_foto) uf.push(cl.km_foto);
    (cl.neue_schaeden || []).forEach(function (s) { if (s.foto) uf.push(s.foto); });
    if (uf.length) html += '<div class="iz-fotos">' + uf.map(function (p) { return thumbHtml(p, false); }).join('') + '</div>';
    if (u === 'abweichung_offen') {
      if (admin) {
        html += '<div class="ak-ueb-ent"><div class="iz-fg"><label for="iz-ent">Entscheidung Oli – Betrag über ' + GRENZE_EURO + ' €, Preisanpassung (z. B. um … €)</label><textarea id="iz-ent" rows="2"></textarea></div>' +
          '<div><button type="button" class="iz-btn iz-btn-g" data-entscheiden>✔ Entscheidung speichern</button></div></div>';
      } else {
        html += '<div class="iz-hinweis rot">Das Fahrzeug wird nicht ohne Klärung übernommen. Oli entscheidet über die Preisanpassung (Betrag über ' + GRENZE_EURO + ' €).</div>';
      }
    }
    return html + '</section>';
  }
  async function entscheidungSpeichern(btn) {
    if (!S.editId) return;
    if (S.dirty) { toast('Bitte zuerst speichern (es gibt ungespeicherte Änderungen).', 'error'); return; }
    var feld = q('#iz-ent'), txt = feld ? feld.value.trim() : '';
    if (!txt) { toast('Bitte die Entscheidung als Text eintragen.', 'error'); return; }
    var id = S.editId;
    btn.disabled = true;
    try {
      await Daten.aendern(id, {
        uebernahme_status: 'abweichung_geklaert', abweichung_entscheidung: txt,
        abweichung_entschieden_von_name: nutzerName(), abweichung_entschieden_am: new Date().toISOString()
      });
      toast('Entscheidung gespeichert ✓', 'success');
      await ladeListe(); await bearbeiten(id);
    } catch (er) { toast('Fehler: ' + fehlerText(er), 'error'); btn.disabled = false; }
  }
  function uebernehmenStart() {
    if (!S.editId) return;
    if (S.dirty) { toast('Bitte zuerst speichern, dann übernehmen (es gibt ungespeicherte Änderungen).', 'error'); return; }
    oeffneUebernahme(S.editId);
  }
  async function druckAnsicht(art) {
    if (!S.editId) return;
    if (S.dirty && !(await bestaetigen('Du hast ungespeicherte Änderungen. Gedruckt wird der zuletzt gespeicherte Stand. Trotzdem drucken?', { ja: 'Trotzdem drucken', nein: 'Abbrechen' }))) return;
    druck(S.editId, art);
  }

  /* ===== Fahrzeugschein per Foto/Scan einlesen (aus der alten App v5.2; Edge Function „fahrzeugschein-lesen“ unverändert) ===== */
  // Formularfeld ← Feld aus der Antwort der Edge Function
  var FZS_ZUORDNUNG = [
    ['vk_vorname', function (f) { return f.halter_vorname; }],
    ['vk_nachname', function (f) { return f.halter_name; }],
    ['vk_strasse', function (f) { return f.halter_strasse; }],
    ['vk_plz', function (f) { return f.halter_plz; }],
    ['vk_ort', function (f) { return f.halter_ort; }],
    ['fz_hersteller', function (f) { return f.marke; }],
    ['fz_modell', function (f) { return f.modell; }],
    ['fz_kennzeichen', function (f) { return f.kennzeichen ? String(f.kennzeichen).toUpperCase() : null; }],
    ['fz_fahrgestellnr', function (f) { return f.fin ? String(f.fin).replace(/\s/g, '').toUpperCase() : null; }],
    ['fz_erstzulassung', function (f) { return /^\d{4}-\d{2}-\d{2}$/.test(f.erstzulassung || '') ? f.erstzulassung : null; }],   // Feld type=date
    ['fz_kraftstoff', function (f) { return f.kraftstoff; }],
    ['fz_leistung_kw', function (f) { return f.leistung_kw ? Math.round(Number(f.leistung_kw) * 1.35962) : null; }],   // Feld zeigt PS
    ['fz_farbe', function (f) { return f.farbe; }],
    ['fz_sitzplaetze', function (f) { return f.sitzplaetze ? (Number(f.sitzplaetze) > 9 ? 'mehr als 9' : String(f.sitzplaetze)) : null; }],
    ['fz_hu_datum', function (f) { return /^\d{4}-\d{2}$/.test(f.hu_monat || '') ? f.hu_monat : null; }]   // Feld type=month
  ];
  var FZS_UNSICHER_KEY = { vk_vorname: 'halter_vorname', vk_nachname: 'halter_name', vk_strasse: 'halter_strasse', vk_plz: 'halter_plz', vk_ort: 'halter_ort',
    fz_hersteller: 'marke', fz_modell: 'modell', fz_kennzeichen: 'kennzeichen', fz_fahrgestellnr: 'fin', fz_erstzulassung: 'erstzulassung',
    fz_kraftstoff: 'kraftstoff', fz_leistung_kw: 'leistung_kw', fz_farbe: 'farbe', fz_sitzplaetze: 'sitzplaetze', fz_hu_datum: 'hu_monat' };
  // Demo-Modus: erfundene Werte statt echtem Aufruf
  var FZS_DEMO = { ist_fahrzeugschein: true, halter_vorname: 'Demo', halter_name: 'Mustermann', halter_strasse: 'Beispielweg 1', halter_plz: '00000', halter_ort: 'Musterstadt',
    marke: 'Demo-Marke', modell: 'Testmodell', kennzeichen: 'xx-de 4711', fin: 'TESTFIN0000000099', erstzulassung: '2020-03-15', kraftstoff: 'Benzin',
    leistung_kw: 110, farbe: 'Blau', sitzplaetze: 5, hu_monat: '2027-06', unsicher: ['fin'] };

  function fzsLabel(el) {
    var fg = el.closest ? el.closest('.iz-fg') : null, lb = fg ? fg.querySelector('label') : null;
    return ((lb && lb.textContent) || el.id).replace(/\s*\*$/, '').replace(/\s*\(TT\.MM\.JJJJ\)/, '').trim();
  }
  function fzsStatus(html, art) {
    var box = qi('fzs_status'); if (!box) return;
    box.innerHTML = html; box.className = 'iz-fzs-status' + (art ? ' ' + art : ''); box.hidden = false;
  }
  function fzsZuruecksetzen() {
    if (!S.root) return;
    S.root.querySelectorAll('#iz-v-form .iz-scan-pruefen').forEach(function (el) { el.classList.remove('iz-scan-pruefen'); });
    var box = qi('fzs_status'); if (box) { box.hidden = true; box.innerHTML = ''; }
  }
  // Bild verkleinern (max. 2000 px, JPEG) bzw. PDF unverändert als Base64
  function fzsDateiVorbereiten(file) {
    return new Promise(function (resolve, reject) {
      if (file.type === 'application/pdf') {
        if (file.size > 4.5 * 1024 * 1024) return reject(new Error('PDF ist zu groß (max. 4,5 MB).'));
        var r = new FileReader();
        r.onload = function () { resolve({ daten: String(r.result).split(',')[1], typ: 'application/pdf' }); };
        r.onerror = function () { reject(new Error('Datei konnte nicht gelesen werden.')); };
        return r.readAsDataURL(file);
      }
      var url = URL.createObjectURL(file), img = new Image();
      img.onload = function () {
        var max = 2000, f = Math.min(1, max / Math.max(img.width, img.height));
        var c = document.createElement('canvas');
        c.width = Math.round(img.width * f); c.height = Math.round(img.height * f);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(url);
        resolve({ daten: c.toDataURL('image/jpeg', 0.88).split(',')[1], typ: 'image/jpeg' });
      };
      img.onerror = function () { URL.revokeObjectURL(url); reject(new Error('Bildformat wird nicht unterstützt – bitte als JPG oder PNG versuchen.')); };
      img.src = url;
    });
  }
  async function fahrzeugscheinLesen(input) {
    var file = input.files && input.files[0];
    input.value = '';
    if (!file) return;
    fzsStatus('⏳ Fahrzeugschein wird gelesen … (ca. 5–15 Sekunden)');
    try {
      if (istDemo()) {   // Demo: nichts hochladen, erfundene Werte
        await new Promise(function (r) { setTimeout(r, 500); });
        fzsUebernehmen(FZS_DEMO);
        return;
      }
      var vorb = await fzsDateiVorbereiten(file);
      var res = await EGx().sb.functions.invoke('fahrzeugschein-lesen', { body: vorb });
      if (res.error) throw new Error(res.error.message || 'Aufruf fehlgeschlagen');
      if (!res.data || !res.data.ok) throw new Error((res.data && res.data.error) || 'Keine Daten erkannt');
      fzsUebernehmen(res.data.felder || {});
    } catch (e) {
      fzsStatus('⚠️ Einlesen fehlgeschlagen: ' + esc(e.message || e) + '<br>Bitte noch einmal mit einem scharfen, gerade aufgenommenen Foto versuchen oder die Daten von Hand eintragen.', 'fehler');
    }
  }
  function fzsUebernehmen(f) {
    if (f.ist_fahrzeugschein === false) {
      fzsStatus('⚠️ Auf dem Bild wurde kein Fahrzeugschein erkannt. Bitte die Vorderseite der Zulassungsbescheinigung Teil I fotografieren.', 'fehler');
      return;
    }
    var unsicher = Array.isArray(f.unsicher) ? f.unsicher : [];
    var uebernommen = [], abweichend = [];
    FZS_ZUORDNUNG.forEach(function (z) {
      var id = z[0], el = qi(id); if (!el) return;
      var wert = z[1](f);
      if (wert === null || wert === undefined || String(wert).trim() === '') return;
      wert = String(wert).trim();
      var alt = String(el.value || '').trim();
      if (alt) {   // nur leere Felder füllen
        if (alt.toUpperCase() !== wert.toUpperCase()) abweichend.push({ label: fzsLabel(el), alt: alt, wert: wert });
        return;
      }
      if (el.tagName === 'SELECT') {   // Wert muss in der Auswahl stehen (Groß-/Kleinschreibung egal)
        var treffer = Array.prototype.filter.call(el.options, function (o) { return o.value && o.value.toLowerCase() === wert.toLowerCase(); })[0];
        if (!treffer) return;
        el.value = treffer.value; wert = treffer.value;
      } else el.value = wert;
      el.classList.add('iz-scan-pruefen');
      var weg = function () { el.classList.remove('iz-scan-pruefen'); aktualisiereStatus(); };
      el.addEventListener('input', weg, { once: true });
      el.addEventListener('change', weg, { once: true });
      var sek = el.closest('.ak-sek'); if (sek) oeffneSektion(+sek.getAttribute('data-sek'), true);   // gelbe Felder sichtbar machen
      var anzeige = el.type === 'date' ? wert.split('-').reverse().join('.') : el.type === 'month' ? wert.split('-').reverse().join('/') : wert;
      uebernommen.push({ label: fzsLabel(el), wert: anzeige, unsicher: unsicher.indexOf(FZS_UNSICHER_KEY[id]) >= 0 });
    });
    if (!uebernommen.length && !abweichend.length) {
      fzsStatus('ℹ️ Es konnten keine Felder gelesen werden. Bitte ein schärferes Foto versuchen.', 'fehler');
      return;
    }
    var html = '';
    if (uebernommen.length) {
      html += '<strong>' + uebernommen.length + ' Felder übernommen</strong> (gelb markiert) – bitte mit dem Fahrzeugschein vergleichen:<ul>' +
        uebernommen.map(function (u) { return '<li>' + esc(u.label) + ': <strong>' + esc(u.wert) + '</strong>' + (u.unsicher ? ' <span style="color:var(--iz-rot);font-weight:700">(schwer lesbar – genau prüfen)</span>' : '') + '</li>'; }).join('') + '</ul>';
    }
    if (abweichend.length) {
      html += '<strong>Nicht überschrieben</strong> (Feld war schon ausgefüllt, Fahrzeugschein sagt etwas anderes):<ul>' +
        abweichend.map(function (a) { return '<li>' + esc(a.label) + ': Formular „' + esc(a.alt) + '“ · Fahrzeugschein „' + esc(a.wert) + '“</li>'; }).join('') + '</ul>';
    }
    html += 'Leistung wurde von kW in PS umgerechnet. KM-Stand, Getriebe, Vorbesitzer und Schlüssel stehen nicht im Fahrzeugschein.';
    if (uebernommen.length) html += '<div style="margin-top:10px"><button type="button" class="iz-btn iz-btn-g iz-btn-sm" data-fzs-geprueft>✓ Daten geprüft</button></div>';
    fzsStatus(html, 'ok');
    if (uebernommen.length) markDirty();
    aktualisiereStatus();
  }
  function fzsGeprueft() {
    S.root.querySelectorAll('#iz-v-form .iz-scan-pruefen').forEach(function (el) { el.classList.remove('iz-scan-pruefen'); });
    fzsStatus('✓ Übernommene Fahrzeugschein-Daten wurden geprüft.', '');
    aktualisiereStatus();
  }

  async function bearbeiten(id) {
    var a = S.alle.find(function (x) { return x.id === id; }); if (!a) return;
    var admin = await istAdmin();
    if (!S.root.querySelector('#iz_vk_vorname')) baueFormular();
    setzeFormZurueck();
    S.editId = id; S.newId = null; S.rec = a;
    qi('fz_pruefer_name').value = '';   // beim Bearbeiten nur den gespeicherten Prüfer zeigen
    F_ALLE.forEach(function (f) {
      var el = qi(f.c); if (!el) return;
      var val = a[f.c];
      if (f.c === 'fz_erstzulassung' && val) el.value = String(val).length <= 7 ? val + '-01' : String(val).slice(0, 10);
      else if (f.c === 'fz_hu_datum') {
        var n = parseMonat(val);
        if (n != null) { var y = Math.floor((n - 1) / 12), m = n - y * 12; el.value = y + '-' + (m < 10 ? '0' : '') + m; S.huRoh = null; }
        else { el.value = ''; S.huRoh = val || null; }
      }
      else if (val !== null && val !== undefined) el.value = val;
    });
    CHECKS.forEach(function (c) { var el = qi(c); if (el) el.checked = !!a[c]; });
    ZUS_ROWS.forEach(function (r) {
      var w = zusAnzeige(a, r);
      qi('zus_' + r.key + '_ja').checked = w === true;
      qi('zus_' + r.key + '_nein').checked = w === false;
    });
    REIFEN.forEach(function (t) {
      qi('reifen_' + t.typ).checked = !!a['reifen_' + t.typ];
      var alt = a['reifen_' + t.typ + '_profil'];
      ['vorne', 'hinten'].forEach(function (s) {
        var w = a['reifen_' + t.typ + '_profil_' + s];
        var anz = w != null ? w : (alt != null ? alt : '');
        qi('reifen_' + t.typ + '_profil_' + s).value = String(anz).replace('.', ',');
      });
      q('#iz-reifen-' + t.typ).classList.toggle('aktiv', !!a['reifen_' + t.typ]);
    });
    MN_ROWS.forEach(function (r) {
      if (a['mn_' + r.key]) qi('mn_' + r.key).value = a['mn_' + r.key];
      if (a['mn_' + r.key + '_kosten'] != null) qi('mn_' + r.key + '_kosten').value = a['mn_' + r.key + '_kosten'];
    });
    var lm = a.lack_messung || {};
    LACK_POINTS.forEach(function (p) { var el = qi('lack_' + p.key); el.value = lm[p.key] != null ? lm[p.key] : ''; lackPruefen(el); });
    S.fotos = Array.isArray(a.fotos) ? a.fotos.slice() : [];
    zeichneFormFotos(); rechneSumme();
    zeichneKopf(a);
    var ub = q('#iz_ueb_platz'); ub.innerHTML = uebernahmeHtml(a, admin); bilderLaden(ub);
    initAbschnitte(); markClean();
    zeigeFormular();
  }

  function sammle() {
    var o = {};
    function rv(id) { var e = qi(id); return e && e.value != null ? String(e.value).trim() : ''; }
    F_ALLE.forEach(function (f) {
      var raw = rv(f.c), val;
      switch (f.t) {
        case 'int': { var n = parseInt(raw, 10); val = isNaN(n) ? null : (n === 0 && !f.z0 ? null : n); break; }
        case 'dec': val = parseDez(raw); break;
        case 'date': case 'month': val = raw || null; break;
        default: val = raw; if (f.up) val = val.toUpperCase(); if (f.n && val === '') val = null;
      }
      o[f.c] = val;
    });
    if (!o.fz_hu_datum && S.huRoh) o.fz_hu_datum = S.huRoh;
    CHECKS.forEach(function (c) { o[c] = !!(qi(c) && qi(c).checked); });
    ZUS_ROWS.forEach(function (r) { o['zusicherung_' + r.key] = zusSpeicherwert(r); });
    o.zus_ja_nein = true;   // Merker: Zusicherungen mit Ja/Nein erfasst (alte Datensätze: false = nur „nicht angehakt“)
    REIFEN.forEach(function (t) {
      var an = qi('reifen_' + t.typ).checked;
      o['reifen_' + t.typ] = an;
      o['reifen_' + t.typ + '_profil_vorne'] = an ? parseDez(rv('reifen_' + t.typ + '_profil_vorne')) : null;
      o['reifen_' + t.typ + '_profil_hinten'] = an ? parseDez(rv('reifen_' + t.typ + '_profil_hinten')) : null;
    });
    var total = 0;
    MN_ROWS.forEach(function (r) {
      o['mn_' + r.key] = rv('mn_' + r.key) || null;
      var k = parseFloat(qi('mn_' + r.key + '_kosten').value);
      o['mn_' + r.key + '_kosten'] = isNaN(k) || k === 0 ? null : k;
      total += isNaN(k) ? 0 : k;
    });
    var lm = {};
    LACK_POINTS.forEach(function (p) { var w = parseDez(rv('lack_' + p.key)); if (w != null) lm[p.key] = w; });
    o.lack_messung = Object.keys(lm).length ? lm : null;
    o.aufwendungen_gesamt = total || null;
    o.fotos = S.fotos.slice();
    return o;
  }

  function speichernKnoepfe(busy) {
    S.root.querySelectorAll('[data-ak="speichern"]').forEach(function (b) {
      b.disabled = !!busy; b.textContent = busy ? '⏳ Speichern…' : '💾 Speichern';
    });
  }
  function zeigeFehlerFeld(sekNr, el) {
    oeffneSektion(sekNr, true);
    if (!el) return;
    el.classList.add('iz-pflicht');
    if (el.scrollIntoView) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    try { el.focus({ preventScroll: true }); } catch (e) { /* ignorieren */ }
  }

  async function speichern() {
    // Fahrzeugschein-Daten müssen geprüft sein (gelb markierte Felder)
    if (scanOffen()) {
      oeffneSektion(1, true);
      var sb = qi('fzs_status'); if (sb && sb.scrollIntoView) sb.scrollIntoView({ behavior: 'smooth', block: 'center' });
      toast('Bitte die gelb markierten Fahrzeugschein-Daten prüfen und „Daten geprüft“ klicken.', 'error');
      return;
    }
    var o = sammle();
    if (!o.fz_hersteller || !o.fz_modell) {
      var fehl = !o.fz_hersteller ? qi('fz_hersteller') : qi('fz_modell');
      if (!o.fz_hersteller) qi('fz_hersteller').classList.add('iz-pflicht');
      if (!o.fz_modell) qi('fz_modell').classList.add('iz-pflicht');
      zeigeFehlerFeld(2, fehl);
      toast('Bitte Hersteller und Modell angeben!', 'error'); return;
    }
    var bm = qi('vk_bekannte_maengel');
    if (!o.vk_bekannte_maengel) {
      zeigeFehlerFeld(4, bm);
      toast('Bitte „Bekannte Mängel“ ausfüllen (Pflichtfeld). Falls keine bekannt: „Keine Mängel bekannt“ eintragen.', 'error');
      return;
    }
    bm.classList.remove('iz-pflicht');
    // Zusicherungen: jede Zeile braucht Ja oder Nein
    var offeneZus = ZUS_ROWS.filter(function (r) { return zusWert(r) === null; });
    ZUS_ROWS.forEach(function (r) { var row = q('#iz_zus_row_' + r.key); if (row) row.classList.toggle('iz-zus-leer', zusWert(r) === null); });
    if (offeneZus.length) {
      oeffneSektion(4, true);
      var zr = q('#iz_zus_row_' + offeneZus[0].key);
      if (zr && zr.scrollIntoView) zr.scrollIntoView({ behavior: 'smooth', block: 'center' });
      toast('Bitte bei allen Zusicherungen Ja oder Nein ankreuzen (offen: ' + offeneZus.map(function (r) { return r.label; }).join(', ') + ').', 'error');
      return;
    }
    speichernKnoepfe(true);
    try {
      await holeUser();
      if (S.editId) {
        await Daten.aendern(S.editId, o);
      } else {
        o.id = S.newId;
        if (S.userId) o.erstellt_von = S.userId;
        await Daten.neu(o);
      }
      var f = await fotosEntfernen(S.entfernt.slice());
      var neu = !S.editId;
      if (f) toast('Gespeichert. Entfernte Foto-Dateien konnten nicht gelöscht werden (Löschen darf nur ein Admin).', 'info');
      else toast(neu ? 'Ankauf gespeichert ✓' : 'Ankauf aktualisiert ✓', 'success');
      S.uploads = []; S.entfernt = []; S.fotos = [];
      markClean();
      speichernKnoepfe(false);
      zeigeListe(); await ladeListe();
      return;
    } catch (e) {
      toast('Fehler: ' + fehlerText(e), 'error');
    }
    speichernKnoepfe(false);
  }

  /* ===================================================================
     9. Übernahme-Hilfen (das frühere Detailfenster ist in der Ankauf-Ansicht aufgegangen)
     =================================================================== */
  function schliesseModal(ov) { if (ov && ov.parentNode) ov.parentNode.removeChild(ov); }
  function neuesModal(inner, fest) {
    var ov = document.createElement('div'); ov.className = 'iz-ov';
    ov.innerHTML = '<div class="iz-modal" role="dialog" aria-modal="true">' + inner + '</div>';
    if (!fest) ov.addEventListener('mousedown', function (e) { if (e.target === ov) schliesseModal(ov); });
    document.body.appendChild(ov);
    return ov;
  }

  function abweichungenHtml(liste) {
    if (!liste || !liste.length) return '';
    return '<div class="iz-abw"><b style="color:var(--iz-rot)">Abweichungen zur Bewertung</b><ul>' +
      liste.map(function (x) { return '<li>' + esc(x.text || x) + '</li>'; }).join('') + '</ul></div>';
  }

  /* ===================================================================
     10. Übernahme bei der Abgabe (NEU)
     =================================================================== */
  /* Reine Rechenfunktion: Vergleich Bewertung (a) ↔ Eingaben bei der Übernahme (e).
     e = { km, schluessel, zb1, zb2, halter, hu, schaeden:[{text,betrag,foto}], reifen:{sommer,..}, zusicherungen:{spalte:bool} } */
  function berechneAbweichungen(a, e) {
    var l = [];
    if (a.fz_km_stand != null && e.km != null) {
      var d = e.km - a.fz_km_stand;
      if (Math.abs(d) > KM_TOLERANZ) l.push({
        feld: 'km', soll: a.fz_km_stand, ist: e.km,
        text: d > 0 ? 'Mehr km als bewertet: ' + fmtKm(e.km) + ' statt ' + fmtKm(a.fz_km_stand) + ' (+' + d.toLocaleString('de-DE') + ' km)'
          : 'Weniger km als bewertet: ' + fmtKm(e.km) + ' statt ' + fmtKm(a.fz_km_stand) + ' (' + d.toLocaleString('de-DE') + ' km) – bitte prüfen'
      });
    }
    if (a.fz_anzahl_schluessel != null && e.schluessel != null && e.schluessel < a.fz_anzahl_schluessel) {
      l.push({ feld: 'schluessel', soll: a.fz_anzahl_schluessel, ist: e.schluessel, text: 'Weniger Schlüssel: ' + e.schluessel + ' statt ' + a.fz_anzahl_schluessel });
    }
    var huSoll = parseMonat(a.fz_hu_datum), huIst = parseMonat(e.hu);
    if (huSoll != null && huIst != null && huIst < huSoll) {
      l.push({ feld: 'hu', soll: a.fz_hu_datum, ist: e.hu, text: 'HU früher fällig: ' + monatAnzeige(e.hu) + ' statt ' + monatAnzeige(a.fz_hu_datum) });
    }
    if (!e.zb1) l.push({ feld: 'zb1', soll: 'vorhanden', ist: 'fehlt', text: 'Zulassungsbescheinigung Teil I fehlt' });
    if (!e.zb2) l.push({ feld: 'zb2', soll: 'vorhanden', ist: 'fehlt', text: 'Zulassungsbescheinigung Teil II fehlt' });
    if (!e.halter) l.push({ feld: 'halter', soll: 'Halter = Kunde', ist: 'abweichend', text: 'Halter in der Zulassungsbescheinigung ist nicht der Kunde' });
    REIFEN.forEach(function (t) {
      if (a['reifen_' + t.typ] && !(e.reifen && e.reifen[t.typ])) {
        l.push({ feld: 'reifen_' + t.typ, soll: 'vorhanden', ist: 'fehlt', text: t.name + ' laut Bewertung, aber nicht übergeben' });
      }
    });
    ZUSICH.forEach(function (z) {
      if (a[z[0]] && !(e.zusicherungen && e.zusicherungen[z[0]])) {
        l.push({ feld: z[0], soll: 'zugesichert', ist: 'nicht bestätigt', text: 'Zusicherung nicht bestätigt: ' + z[3] });
      }
    });
    (e.schaeden || []).forEach(function (s, i) {
      l.push({ feld: 'schaden_' + (i + 1), soll: 'keiner', ist: s.text, text: 'Neuer Schaden: ' + s.text + (s.betrag ? ' (ca. ' + fmtEuro(s.betrag) + ')' : '') });
    });
    return l;
  }

  function oeffneUebernahme(id) {
    var a = S.alle.find(function (x) { return x.id === id; }); if (!a) return;
    var name = ((a.vk_vorname || '') + ' ' + (a.vk_nachname || '')).trim() || 'Kunde';
    var reifenSoll = REIFEN.filter(function (t) { return a['reifen_' + t.typ]; });
    var zusSoll = ZUSICH.filter(function (z) { return a[z[0]]; });
    var photo = { tacho: null }; // lokaler Zustand
    var schaeden = [];           // {text, betrag, foto}
    var ov;

    var html = '<div class="iz-modal-kopf"><h3>🚗 Fahrzeug übernehmen</h3><button type="button" class="iz-x" data-x aria-label="Schließen">✕</button></div>' +
      '<p style="margin:0 0 6px"><b>' + esc(fzBez(a)) + '</b> · ' + esc(a.fz_kennzeichen || 'ohne Kennzeichen') + ' · Kunde: ' + esc(name) + '</p>' +
      '<div class="iz-hinweis blau">Alles prüfen und eintragen. Das Tool vergleicht sofort mit der Bewertung; Abweichungen werden rot.</div>' +
      /* km */
      '<div class="iz-sub"><div class="iz-sub-l">1 · Kilometerstand (mit Tacho-Foto)</div><div class="iz-fg"><label for="u_km">km bei Übernahme *</label><input type="number" id="u_km" inputmode="numeric" min="0">' +
      '<div class="iz-soll" id="u_km_soll">Bewertung: ' + (a.fz_km_stand != null ? fmtKm(a.fz_km_stand) : 'nicht erfasst') + '</div></div>' +
      '<div class="iz-fotobtns" style="margin-top:10px"><label class="iz-fotobtn">📷 Tacho-Foto<input type="file" accept="image/*" capture="environment" id="u_tacho"></label></div><div class="iz-fotos" id="u_tacho_vorschau"></div></div>' +
      /* Schlüssel */
      '<div class="iz-sub"><div class="iz-sub-l">2 · Schlüssel</div><div class="iz-fg"><label for="u_schl">Anzahl Schlüssel übergeben *</label><input type="number" id="u_schl" inputmode="numeric" min="0">' +
      '<div class="iz-soll" id="u_schl_soll">Bewertung: ' + (a.fz_anzahl_schluessel != null ? a.fz_anzahl_schluessel : 'nicht erfasst') + '</div></div></div>' +
      /* Papiere */
      '<div class="iz-sub"><div class="iz-sub-l">3 · Papiere</div><div class="iz-cbgrid">' +
      '<label class="iz-cb"><input type="checkbox" id="u_zb1"><span>Zulassungsbescheinigung Teil I vorhanden</span></label>' +
      '<label class="iz-cb"><input type="checkbox" id="u_zb2"><span>Zulassungsbescheinigung Teil II vorhanden</span></label>' +
      '<label class="iz-cb"><input type="checkbox" id="u_halter"><span>Halter in ZB = Kunde (' + esc(name) + ')</span></label></div></div>' +
      /* HU */
      '<div class="iz-sub"><div class="iz-sub-l">4 · Hauptuntersuchung</div><div class="iz-fg"><label for="u_hu">HU bis' + (a.fz_hu_datum ? ' *' : '') + '</label><input type="month" id="u_hu">' +
      '<div class="iz-soll" id="u_hu_soll">Bewertung: ' + (a.fz_hu_datum ? esc(monatAnzeige(a.fz_hu_datum)) : 'nicht erfasst') + '</div></div></div>' +
      /* Schäden */
      '<div class="iz-sub"><div class="iz-sub-l">5 · Neue Schäden gegenüber der Bewertung</div>' +
      '<label class="iz-cb"><input type="checkbox" id="u_keine_schaeden"><span>Keine neuen Schäden festgestellt</span></label>' +
      '<div id="u_schaeden"></div><button type="button" class="iz-btn iz-btn-o iz-btn-sm" id="u_add_schaden" style="margin-top:10px">➕ Neuen Schaden erfassen</button></div>' +
      /* Zubehör / Reifen */
      '<div class="iz-sub"><div class="iz-sub-l">6 · Zubehör &amp; Reifensätze laut Bewertung</div>' +
      (reifenSoll.length ? '<div class="iz-cbgrid">' + reifenSoll.map(function (t) {
        return '<label class="iz-cb"><input type="checkbox" data-reifen="' + t.typ + '"><span>' + t.icon + ' ' + t.name + ' übergeben' + esc(reifenProfilLabel(a, t.typ)) + '</span></label>';
      }).join('') + '</div>' : '<div class="iz-soll">Laut Bewertung keine Reifensätze erfasst.</div>') +
      '<div class="iz-fg full" style="margin-top:10px"><label for="u_zubehoer">Weiteres Zubehör (Ladekabel, Warndreieck, Anleitung …)</label><textarea id="u_zubehoer" rows="2"></textarea></div></div>' +
      /* Zusicherungen */
      '<div class="iz-sub"><div class="iz-sub-l">7 · Zusicherungen bestätigt</div>' +
      (zusSoll.length ? '<div class="iz-cbgrid">' + zusSoll.map(function (z) {
        return '<label class="iz-cb"><input type="checkbox" data-zus="' + z[0] + '"><span>' + esc(z[3]) + ' – bestätigt</span></label>';
      }).join('') + '</div>' : '<div class="iz-soll">Laut Bewertung keine Zusicherungen.</div>') + '</div>' +
      /* Ergebnis */
      '<div class="iz-sub"><div class="iz-sub-l">Abgleich mit der Bewertung</div><div id="u_abgleich"></div>' +
      '<div id="u_betrag_block" style="display:none"><div class="iz-fg" style="margin-top:12px"><label for="u_betrag">Geschätzter Betrag der Abweichung (€) *</label><input type="number" id="u_betrag" inputmode="decimal" min="0" step="10"></div>' +
      '<div id="u_klass"></div>' +
      '<div class="iz-fg full" id="u_ent_block" style="display:none;margin-top:10px"><label for="u_ent">Einigung mit dem Kunden (Entscheidung) *</label><textarea id="u_ent" rows="3" placeholder="Was wurde mit dem Kunden vereinbart? z. B. Preisnachlass 60 € oder Kunde liefert Schlüssel nach"></textarea></div></div>' +
      '<div class="iz-fg full" style="margin-top:12px"><label for="u_bem">Bemerkung (optional)</label><textarea id="u_bem" rows="2"></textarea></div>' +
      '<div class="iz-hinweis rot">Auszahlung bzw. Verrechnung nur per Überweisung – nie bar.</div></div>' +
      '<div class="iz-modal-akt"><button type="button" class="iz-btn iz-btn-o" data-x>Abbrechen</button><button type="button" class="iz-btn iz-btn-g" id="u_speichern">✔ Übernahme speichern</button></div>';

    ov = neuesModal(html, true); // Übernahme: nicht durch Klick daneben schließen
    var $ = function (sel) { return ov.querySelector(sel); };

    function lies() {
      var km = $('#u_km').value === '' ? null : parseInt($('#u_km').value, 10);
      var sc = $('#u_schl').value === '' ? null : parseInt($('#u_schl').value, 10);
      var re = {}; ov.querySelectorAll('[data-reifen]').forEach(function (c) { re[c.getAttribute('data-reifen')] = c.checked; });
      var zu = {}; ov.querySelectorAll('[data-zus]').forEach(function (c) { zu[c.getAttribute('data-zus')] = c.checked; });
      var sch = schaeden.filter(function (s) { return s.text && s.text.trim(); }).map(function (s) { return { text: s.text.trim(), betrag: s.betrag, foto: s.foto }; });
      return { km: isNaN(km) ? null : km, schluessel: isNaN(sc) ? null : sc, zb1: $('#u_zb1').checked, zb2: $('#u_zb2').checked, halter: $('#u_halter').checked,
        hu: $('#u_hu').value || null, schaeden: sch, reifen: re, zusicherungen: zu };
    }
    function zeichneSchaeden() {
      $('#u_schaeden').innerHTML = schaeden.map(function (s, i) {
        return '<div class="iz-schaden"><div class="iz-fg"><label>Schaden ' + (i + 1) + ' – Beschreibung *</label><input type="text" data-s-text="' + i + '" value="' + esc(s.text) + '" placeholder="z. B. Delle Tür hinten links"></div>' +
          '<div class="iz-fg"><label>Geschätzte Kosten (€, optional)</label><input type="number" data-s-betrag="' + i + '" value="' + (s.betrag != null ? s.betrag : '') + '" min="0" step="10" inputmode="decimal"></div>' +
          '<div class="iz-fotobtns"><label class="iz-fotobtn">📷 Foto (Pflicht)<input type="file" accept="image/*" capture="environment" data-s-foto="' + i + '"></label>' +
          '<button type="button" class="iz-btn iz-btn-r iz-btn-sm" data-s-del="' + i + '">Entfernen</button></div>' +
          (s.foto ? '<div class="iz-fotos">' + thumbHtml(s.foto, false) + '</div>' : '<div class="iz-soll rot">Foto fehlt</div>') + '</div>';
      }).join('');
      bilderLaden($('#u_schaeden'));
    }
    function aktualisieren() {
      var e = lies(), bereit = e.km != null && e.schluessel != null;
      var abw = bereit ? berechneAbweichungen(a, e) : berechneAbweichungen(a, e).filter(function (x) { return /^schaden_/.test(x.feld); });
      // Soll/Ist rot einfärben
      $('#u_km_soll').classList.toggle('rot', abw.some(function (x) { return x.feld === 'km'; }));
      $('#u_schl_soll').classList.toggle('rot', abw.some(function (x) { return x.feld === 'schluessel'; }));
      $('#u_hu_soll').classList.toggle('rot', abw.some(function (x) { return x.feld === 'hu'; }));
      var block = $('#u_betrag_block');
      if (abw.length) {
        $('#u_abgleich').innerHTML = abweichungenHtml(abw);
        block.style.display = '';
        var sum = e.schaeden.reduce(function (s, x) { return s + (x.betrag || 0); }, 0);
        var bi = $('#u_betrag');
        if (!bi.dataset.manuell && sum > 0) bi.value = sum;
        var betrag = bi.value === '' ? null : parseFloat(bi.value);
        if (betrag == null || isNaN(betrag)) {
          $('#u_klass').innerHTML = '<div class="iz-hinweis">Bitte den geschätzten Betrag eintragen. Bis ' + GRENZE_EURO + ' € einigt sich der Verkauf mit dem Kunden, darüber entscheidet Oli.</div>';
          $('#u_ent_block').style.display = 'none';
        } else if (betrag <= GRENZE_EURO) {
          $('#u_klass').innerHTML = '<div class="iz-hinweis blau"><b>Bis ' + GRENZE_EURO + ' €:</b> Verkauf einigt sich mit dem Kunden.</div>';
          $('#u_ent_block').style.display = '';
        } else {
          $('#u_klass').innerHTML = '<div class="iz-hinweis rot">Über ' + GRENZE_EURO + ' €: Oli entscheidet über die Preisanpassung. Das Fahrzeug wird nicht ohne Klärung übernommen (Status „Abweichung offen“).</div>';
          $('#u_ent_block').style.display = 'none';
        }
      } else {
        $('#u_abgleich').innerHTML = bereit
          ? '<div class="iz-ok">Keine Abweichung zur Bewertung.</div>' : '<div class="iz-soll">Sobald km und Schlüssel eingetragen sind, erscheint der vollständige Abgleich.</div>';
        block.style.display = 'none';
      }
    }

    ov.addEventListener('input', function (ev) {
      var t = ev.target;
      if (t.id === 'u_betrag') t.dataset.manuell = '1';
      if (t.hasAttribute('data-s-text')) schaeden[+t.getAttribute('data-s-text')].text = t.value;
      if (t.hasAttribute('data-s-betrag')) { var v = parseFloat(t.value); schaeden[+t.getAttribute('data-s-betrag')].betrag = isNaN(v) ? null : v; }
      aktualisieren();
    });
    ov.addEventListener('change', async function (ev) {
      var t = ev.target;
      if (t.id === 'u_tacho' && t.files[0]) {
        try { photo.tacho = await fotoSpeichern(t.files[0], id, 'uebernahme-tacho'); $('#u_tacho_vorschau').innerHTML = thumbHtml(photo.tacho, false); bilderLaden($('#u_tacho_vorschau')); }
        catch (er) { toast('Foto-Upload fehlgeschlagen: ' + fehlerText(er), 'error'); }
        t.value = '';
      } else if (t.hasAttribute('data-s-foto') && t.files[0]) {
        var i = +t.getAttribute('data-s-foto');
        try { schaeden[i].foto = await fotoSpeichern(t.files[0], id, 'uebernahme-schaden'); zeichneSchaeden(); aktualisieren(); }
        catch (er2) { toast('Foto-Upload fehlgeschlagen: ' + fehlerText(er2), 'error'); }
      } else aktualisieren();
    });
    ov.addEventListener('click', async function (ev) {
      var t = ev.target.closest('button'); if (!t) return;
      if (t.hasAttribute('data-x')) { schliesseModal(ov); await aufraeumenUploads(); }
      else if (t.id === 'u_add_schaden') { schaeden.push({ text: '', betrag: null, foto: null }); $('#u_keine_schaeden').checked = false; zeichneSchaeden(); aktualisieren(); }
      else if (t.hasAttribute('data-s-del')) { schaeden.splice(+t.getAttribute('data-s-del'), 1); zeichneSchaeden(); aktualisieren(); }
      else if (t.id === 'u_speichern') await speichereUebernahme();
    });

    async function speichereUebernahme() {
      var e = lies();
      var fehler = null;
      if (e.km == null) fehler = 'Bitte den km-Stand bei der Übernahme eintragen.';
      else if (!photo.tacho) fehler = 'Bitte ein Tacho-Foto aufnehmen.';
      else if (e.schluessel == null) fehler = 'Bitte die Anzahl der Schlüssel eintragen (0 ist erlaubt).';
      else if (a.fz_hu_datum && parseMonat(a.fz_hu_datum) != null && !e.hu) fehler = 'Bitte das HU-Datum eintragen (laut Bewertung: ' + monatAnzeige(a.fz_hu_datum) + ').';
      else if (!e.schaeden.length && !$('#u_keine_schaeden').checked) fehler = 'Bitte „Keine neuen Schäden festgestellt“ bestätigen oder einen Schaden erfassen.';
      else if (schaeden.some(function (s) { return !s.text.trim() || !s.foto; })) fehler = 'Jeder neue Schaden braucht eine Beschreibung und ein Foto.';
      if (fehler) { toast(fehler, 'error'); return; }

      var abw = berechneAbweichungen(a, e);
      var betrag = null, status = 'ok', entscheidung = null, entVon = null, entAm = null;
      if (abw.length) {
        betrag = parseFloat($('#u_betrag').value);
        if (isNaN(betrag) || betrag < 0) { toast('Bitte den geschätzten Betrag der Abweichung eintragen.', 'error'); $('#u_betrag').focus(); return; }
        if (betrag <= GRENZE_EURO) {
          entscheidung = $('#u_ent').value.trim();
          if (!entscheidung) { toast('Bitte die Einigung mit dem Kunden als Text eintragen.', 'error'); $('#u_ent').focus(); return; }
          status = 'abweichung_geklaert'; entVon = nutzerName(); entAm = new Date().toISOString();
        } else status = 'abweichung_offen';
      }
      var checkliste = {
        version: 1, km: e.km, km_foto: photo.tacho, schluessel: e.schluessel, zb1: e.zb1, zb2: e.zb2, halter_ist_kunde: e.halter, hu_datum: e.hu,
        keine_neuen_schaeden: !e.schaeden.length, neue_schaeden: e.schaeden.map(function (s) { return { beschreibung: s.text, betrag: s.betrag, foto: s.foto }; }),
        reifen: e.reifen, zubehoer_notiz: $('#u_zubehoer').value.trim() || null, zusicherungen: e.zusicherungen, bemerkung: $('#u_bem').value.trim() || null
      };
      var patch = {
        uebernahme_status: status, uebernahme_am: new Date().toISOString(), uebernahme_von_name: nutzerName(),
        uebernahme_km: e.km, uebernahme_schluessel: e.schluessel, uebernahme_checkliste: checkliste, uebernahme_abweichungen: abw,
        abweichung_betrag: abw.length ? betrag : null, abweichung_entscheidung: entscheidung,
        abweichung_entschieden_von_name: entVon, abweichung_entschieden_am: entAm
      };
      var btn = $('#u_speichern'); btn.disabled = true;
      try {
        await Daten.aendern(id, patch);
        S.uploads = [];
        toast(status === 'ok' ? 'Fahrzeug übernommen ✓ – keine Abweichung.' :
          status === 'abweichung_geklaert' ? 'Fahrzeug übernommen ✓ – Abweichung bis ' + GRENZE_EURO + ' € geklärt.' :
            'Gespeichert – Abweichung über ' + GRENZE_EURO + ' €: Oli entscheidet über die Preisanpassung.', status === 'abweichung_offen' ? 'info' : 'success');
        schliesseModal(ov); await ladeListe();
        await bearbeiten(id);   // Ansicht mit dem neuen Übernahme-Stand neu aufbauen
      } catch (er) { toast('Fehler: ' + fehlerText(er), 'error'); btn.disabled = false; }
    }
    aktualisieren();
  }

  /* ===================================================================
     11. Druckansichten (Wortlaut 1:1 aus der alten App)
     =================================================================== */
  /* Logo: echtes Bild wie in der Zahlungsaufstellung (der frühere Text-SVG wurde im Druck abgeschnitten).
     Beim Drucken wird das Bild als data-URL eingebettet (Rückfall: die URL selbst). */
  var LOGO_URL = (window.VK_ZE && window.VK_ZE.LOGO_URL) || 'https://www.autohaus-stieber.de/idbilder/logo.jpg';
  function logoHtml() {
    return '<img class="logo" src="' + LOGO_URL + '" alt="Autohaus Stieber GmbH – MehrmarkenCenter" width="260" style="display:block;width:260px;max-width:100%;height:auto">';
  }
  var logoCache = null;
  async function logoDataUrl() {
    if (logoCache) return logoCache;
    try {
      var ctl = (typeof AbortController !== 'undefined') ? new AbortController() : null;
      var t = ctl ? setTimeout(function () { ctl.abort(); }, 4000) : null;
      var r = await fetch(LOGO_URL, ctl ? { signal: ctl.signal } : undefined);
      if (t) clearTimeout(t);
      if (!r.ok) return LOGO_URL;
      var b = await r.blob();
      logoCache = await new Promise(function (ok) { var fr = new FileReader(); fr.onload = function () { ok(String(fr.result)); }; fr.onerror = function () { ok(LOGO_URL); }; fr.readAsDataURL(b); });
      return logoCache;
    } catch (err) { return LOGO_URL; }
  }
  var ADR_ZEILE = 'Autohaus Stieber GmbH · Emerholzweg 5 · 70439 Stuttgart-Stammheim<br>Tel. 0711 80 60 94 - 0 · service@autohaus-stieber.de';
  var FUSS_ZEILE = 'Autohaus Stieber GmbH · Emerholzweg 5 · 70439 Stuttgart-Stammheim · Tel. 0711 80 60 94 - 0 · service@autohaus-stieber.de';

  function heute() { return new Date().toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' }); }
  function euroPlain(n) { return fmtEuro(n); }

  // wartet, bis alle Bilder des Dokuments geladen/dekodiert sind (Logo, Fotos) – höchstens 8 s
  var BILDER_WARTEN = 'Promise.race([Promise.all(Array.prototype.slice.call(document.images).map(function(i){return i.decode?i.decode().catch(function(){}):(i.complete?Promise.resolve():new Promise(function(r){i.onload=i.onerror=r}))})),new Promise(function(r){setTimeout(r,8000)})])';
  async function druckFenster(html, breite, hoehe) {
    // Fenster sofort öffnen (Klick-Geste), Inhalt danach schreiben
    var w = null;
    try { w = window.open('', '_blank', 'width=' + breite + ',height=' + hoehe); } catch (e) { w = null; }
    var logo = await logoDataUrl();
    html = html.split('src="' + LOGO_URL + '"').join('src="' + logo + '"');
    if (w) {
      var mitDruck = html.replace('<!--DRUCK-->', '<script>window.onload=function(){' + BILDER_WARTEN + '.then(function(){setTimeout(function(){window.print()},150)})}<\/script>');
      w.document.write(mitDruck); w.document.close(); return;
    }
    // Rückfall: unsichtbarer Rahmen (wenn Pop-ups blockiert sind)
    var fr = document.createElement('iframe');
    fr.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0';
    document.body.appendChild(fr);
    fr.contentDocument.open(); fr.contentDocument.write(html.replace('<!--DRUCK-->', '')); fr.contentDocument.close();
    var imgs = Array.prototype.slice.call(fr.contentDocument.images).map(function (i) {
      return i.decode ? i.decode().catch(function () { }) : (i.complete ? Promise.resolve() : new Promise(function (r) { i.onload = i.onerror = r; }));
    });
    await Promise.race([Promise.all(imgs), new Promise(function (r) { setTimeout(r, 8000); })]);
    setTimeout(function () { try { fr.contentWindow.focus(); fr.contentWindow.print(); } catch (e) { toast('Drucken nicht möglich – bitte Pop-ups erlauben.', 'error'); } }, 300);
    setTimeout(function () { if (fr.parentNode) fr.parentNode.removeChild(fr); }, 120000);
  }

  function ausstListe(a) { return AUSST.filter(function (x) { return a[x[0]]; }).map(function (x) { return x[2]; }); }
  function reifenListe(a) { return REIFEN.filter(function (t) { return a['reifen_' + t.typ]; }).map(function (t) { return t.name + reifenProfilLabel(a, t.typ); }); }

  function htmlZustandsbericht(a, fotoUrls) {
    var fz = fzBez(a), tot = summeKosten(a);
    var ausstItems = ausstListe(a); // Wortlaut wie alte App
    var reifenItems = reifenListe(a);
    var fotosHtml = fotoUrls.length ? '<div class="sec" style="page-break-inside:avoid;"><div class="sec-title">Fotos (' + fotoUrls.length + ')</div>' +
      '<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:6pt;">' +
      fotoUrls.map(function (u) { return '<img src="' + esc(u) + '" style="width:100%;aspect-ratio:4/3;object-fit:cover;border-radius:4pt;border:1px solid #ddd;">'; }).join('') + '</div></div>' : '';
    var mangelRows = MN_ROWS.map(function (r) {
      var desc = a['mn_' + r.key] || '', kost = pnum(a['mn_' + r.key + '_kosten']);
      return '<tr><td style="padding:5pt 6pt;border-bottom:1px solid #eee;font-size:9.5pt;">' + r.label + '</td>' +
        '<td style="padding:5pt 6pt;border-bottom:1px solid #eee;font-size:9.5pt;">' + (esc(desc) || '–') + '</td>' +
        '<td style="padding:5pt 6pt;border-bottom:1px solid #eee;font-size:9.5pt;text-align:right;">' + (kost > 0 ? euroPlain(kost) : '–') + '</td></tr>';
    }).join('');
    var lm = a.lack_messung || {};
    var lackVals = LACK_POINTS.map(function (p) { return [p, lm[p.key]]; }).filter(function (x) { return x[1] != null; });
    var lackRows = lackVals.map(function (x) {
      var hi = x[1] > 200;
      return '<tr><td style="padding:4pt 6pt;border-bottom:1px solid #eee;font-size:9.5pt;">' + x[0].label + '</td>' +
        '<td style="padding:4pt 6pt;border-bottom:1px solid #eee;font-size:9.5pt;text-align:right;' + (hi ? 'color:#b00020;font-weight:700;' : '') + '">' + String(x[1]).replace('.', ',') + ' µm' + (hi ? ' ⚠' : '') + '</td></tr>';
    }).join('');
    var lackHtml = (lackVals.length || a.lack_bemerkung) ? '<div class="sec" style="page-break-inside:avoid;"><div class="sec-title">Lackschichtdicken-Messung</div>' +
      (lackVals.length ? '<table class="daten"><tbody>' + lackRows + '</tbody></table><div style="margin-top:6pt;font-size:8pt;color:#888;">Werkslack üblich ca. 80–150 µm · Werte über 200 µm (⚠) deuten auf Nachlackierung/Spachtel hin.</div>' : '') +
      (a.lack_bemerkung ? '<div style="margin-top:8pt;background:#f5f8fc;border-left:3px solid #003366;padding:7pt 10pt;font-size:9pt;color:#333;line-height:1.5;"><strong>Bemerkung:</strong> ' + esc(a.lack_bemerkung) + '</div>' : '') + '</div>' : '';
    var zeile = function (lab, val) { return val ? '<tr><td>' + lab + '</td><td>' + val + '</td></tr>' : ''; };
    return '<!DOCTYPE html><html lang="de"><head><meta charset="UTF-8"><title>Zustandsbericht – ' + esc(fz) + '</title><style>' +
      '*{box-sizing:border-box;margin:0;padding:0}body{font-family:Arial,sans-serif;font-size:11pt;color:#111;background:white;padding:18mm 20mm;line-height:1.5}' +
      '.hd{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:3px solid #003366;padding-bottom:10pt;margin-bottom:14pt}' +
      '.adr{font-size:8.5pt;color:#444;margin-top:5pt;line-height:1.6}.doc-info{text-align:right;font-size:9pt;color:#555;line-height:1.8}' +
      'h1{font-size:16pt;font-weight:700;color:#003366;font-family:Georgia,serif;text-align:center;margin:12pt 0 4pt}' +
      '.subtitle{text-align:center;font-size:9pt;color:#888;margin-bottom:16pt;text-transform:uppercase;letter-spacing:1px}.sec{margin-bottom:14pt}' +
      '.sec-title{font-size:10pt;font-weight:700;text-transform:uppercase;letter-spacing:0.8px;color:#003366;border-bottom:1.5px solid #c8982a;padding-bottom:3pt;margin-bottom:8pt}' +
      'table.daten{width:100%;border-collapse:collapse;font-size:9.5pt}table.daten td{padding:4pt 6pt;border-bottom:1px solid #eee;vertical-align:top}' +
      'table.daten td:first-child{color:#555;font-weight:600;width:42%;white-space:nowrap}table.mn{width:100%;border-collapse:collapse}' +
      'table.mn th{background:#003366;color:white;padding:7pt 6pt;font-size:9pt;text-align:left;font-weight:600;text-transform:uppercase;letter-spacing:0.5px}table.mn th:last-child{text-align:right;width:110pt}' +
      '.total-row td{background:#003366;color:white;font-weight:700;padding:8pt 6pt;font-size:10pt}.total-row td:last-child{text-align:right}' +
      '.preis-box{background:#003366;color:white;border-radius:6pt;padding:12pt 16pt;margin-top:14pt;display:flex;justify-content:space-between;align-items:center}' +
      '.preis-label{font-size:10pt;opacity:0.75}.preis-value{font-size:22pt;font-weight:700;color:#c8982a;font-family:Georgia,serif}' +
      '.footer{margin-top:20pt;border-top:1px solid #ddd;padding-top:6pt;font-size:7.5pt;color:#aaa;text-align:center;line-height:1.7}' +
      '@media print{body{padding:10mm 14mm}@page{margin:10mm}}</style></head><body>' +
      '<div class="hd"><div>' + logoHtml() + '<div class="adr" style="margin-top:8pt;">' + ADR_ZEILE + '</div></div>' +
      '<div class="doc-info"><strong style="color:#003366;font-size:11pt;">ZUSTANDSBERICHT</strong><br>' +
      (a.interne_nr ? 'Interne Nr.: <strong>' + esc(a.interne_nr) + '</strong><br>' : '') + 'Datum: ' + heute() + (a.bearbeiter_name ? '<br>Bearbeiter: ' + esc(a.bearbeiter_name) : '') + '</div></div>' +
      '<h1>Fahrzeug-Zustandsbericht</h1><div class="subtitle">Interne Ankaufsbewertung – Autohaus Stieber GmbH</div>' +
      '<div class="sec"><div class="sec-title">Fahrzeugdaten</div><table class="daten">' +
      (a.interne_nr ? '<tr><td>Interne Nr.:</td><td><strong>' + esc(a.interne_nr) + '</strong></td></tr>' : '') +
      '<tr><td>Fahrzeug:</td><td><strong>' + (esc(fz) || '–') + '</strong></td></tr>' +
      zeile('Kennzeichen:', esc(a.fz_kennzeichen)) + zeile('Fahrgestellnr. (FIN):', esc(a.fz_fahrgestellnr)) +
      zeile('Erstzulassung:', a.fz_erstzulassung ? fmtDatumDE(a.fz_erstzulassung) : '') +
      zeile('Kilometerstand:', a.fz_km_stand ? Number(a.fz_km_stand).toLocaleString('de-DE') + ' km' : '') +
      zeile('Kraftstoff:', esc(a.fz_kraftstoff)) + zeile('Getriebe:', esc(a.fz_getriebe)) + zeile('Antrieb:', esc(a.fz_antrieb)) +
      zeile('Leistung:', a.fz_leistung_kw ? a.fz_leistung_kw + ' PS' : '') + zeile('Farbe:', esc(a.fz_farbe)) +
      zeile('Sitzplätze:', esc(a.fz_sitzplaetze)) + zeile('Vorbesitzer:', a.fz_halteranzahl) + zeile('HU gültig bis:', esc(a.fz_hu_datum)) +
      (a.fz_anzahl_schluessel != null ? '<tr><td>Anzahl Schlüssel:</td><td>' + a.fz_anzahl_schluessel + '</td></tr>' : '') +
      zeile('Bereifung:', esc(reifenItems.join(' · '))) + zeile('Ausstattung:', esc(ausstItems.join(' · '))) +
      '</table></div>' +
      (a.vk_bekannte_maengel ? '<div class="sec"><div class="sec-title">Vom Verkäufer angegebene bekannte Mängel</div><div style="background:#fffbf0;border-left:3px solid #c8982a;padding:8pt 12pt;font-size:9.5pt;color:#333;line-height:1.6;white-space:pre-wrap;">' + esc(a.vk_bekannte_maengel) + '</div></div>' : '') +
      '<div class="sec"><div class="sec-title">Mängel &amp; Instandsetzungskosten</div><table class="mn"><thead><tr><th>Baugruppe</th><th>Mängelbeschreibung</th><th style="text-align:right;">Kosten (€)</th></tr></thead>' +
      '<tbody>' + mangelRows + '</tbody><tfoot><tr class="total-row"><td colspan="2">Gesamt Instandsetzungskosten</td><td style="text-align:right;">' + euroPlain(tot) + '</td></tr></tfoot></table>' +
      (a.mn_bemerkungen ? '<div style="margin-top:8pt;background:#f5f8fc;border-left:3px solid #003366;padding:7pt 10pt;font-size:9pt;color:#333;line-height:1.5;"><strong>Bemerkungen:</strong> ' + esc(a.mn_bemerkungen) + '</div>' : '') + '</div>' +
      lackHtml +
      (a.ankaufspreis ? '<div class="preis-box"><div class="preis-label">Vereinbarter Ankaufspreis</div><div class="preis-value">' + euroPlain(a.ankaufspreis) + '</div></div>' : '') +
      fotosHtml +
      '<div class="footer">' + FUSS_ZEILE + '<br>Dieser Zustandsbericht ist ein internes Dokument zur Ankaufsdokumentation.</div><!--DRUCK--></body></html>';
  }

  /* Seite „Fahrzeugübergabe-Protokoll“ – in Kaufvertrag (Seite 2) und einzeln gleich */
  function uebergabeSeite(a, fuss) {
    var fz = fzBez(a), vkName = ((a.vk_vorname || '') + ' ' + (a.vk_nachname || '')).trim();
    return '<div class="ue"><div class="hd"><div>' + logoHtml() + '</div><div class="doc-info"><div class="kv-nr">FAHRZEUGÜBERGABE</div><div>Datum: ' + heute() + '</div></div></div>' +
      '<h1 style="margin-bottom:6pt;">Fahrzeugübergabe-Protokoll</h1><div class="subtitle">' + esc(fz) + ' · ' + esc(a.fz_kennzeichen || '') + '</div>' +
      '<div class="sec"><div class="sec-title">Übergabe durch Verkäufer an Käufer</div><table class="daten">' +
      '<tr><td>Übergabedatum:</td><td>___________________________</td></tr><tr><td>Übergabezeit:</td><td>_______________ Uhr</td></tr>' +
      '<tr><td>Übergabeort:</td><td>Emerholzweg 5, 70439 Stuttgart-Stammheim</td></tr><tr><td>KM-Stand bei Übergabe:</td><td>___________________________ km</td></tr></table></div>' +
      '<div class="sec"><div class="sec-title">Verkäufer übergibt an Käufer</div><table class="daten">' +
      '<tr><td>Zulassungsbescheinigung Teil I (Fahrzeugschein):</td><td>☐ übergeben &nbsp; ☐ nicht vorhanden</td></tr>' +
      '<tr><td>Zulassungsbescheinigung Teil II (Fahrzeugbrief):</td><td>☐ übergeben &nbsp; ☐ nicht vorhanden</td></tr>' +
      '<tr><td>Fahrzeugschlüssel (Anzahl):</td><td>' + (a.fz_anzahl_schluessel != null ? a.fz_anzahl_schluessel : '___') + ' Stück</td></tr>' +
      '<tr><td>HU-Bescheinigung:</td><td>☐ übergeben &nbsp; ☐ nicht vorhanden</td></tr><tr><td>Serviceheft / Bordbuch:</td><td>☐ übergeben &nbsp; ☐ nicht vorhanden</td></tr>' +
      '<tr><td>Amtliches Kennzeichen:</td><td>☐ verbleibt am Fahrzeug &nbsp; ☐ wird abgemeldet</td></tr></table></div>' +
      '<div class="sec"><div class="sec-title">Käufer bestätigt Zahlung des Kaufpreises</div><table class="daten">' +
      '<tr><td>Kaufpreis:</td><td><strong>' + (a.ankaufspreis ? euroPlain(a.ankaufspreis) : '– €') + '</strong></td></tr>' +
      '<tr><td>Zahlungsart:</td><td>Überweisung auf ein Konto des Verkäufers bzw. Verrechnung mit dem Kaufpreis des Neufahrzeugs – keine Barauszahlung</td></tr><tr><td>Betrag erhalten am:</td><td>___________________________</td></tr></table>' +
      '<div class="box-info" style="margin-top:10pt;">Der Verkäufer bestätigt den vollständigen Erhalt des Kaufpreises. Mit Unterzeichnung dieses Übergabeprotokolls gilt das Fahrzeug als ordnungsgemäß übergeben und die Kaufabwicklung als abgeschlossen.</div></div>' +
      '<div class="unt" style="margin-top:18pt;"><div class="unt-block"><div class="unt-linie"></div><strong>' + (esc(vkName) || 'Verkäufer') + '</strong><br>Ort, Datum &amp; Unterschrift Verkäufer</div>' +
      '<div class="unt-block"><div class="unt-linie"></div><strong>Autohaus Stieber GmbH</strong><br>Ort, Datum &amp; Unterschrift Käufer</div></div>' +
      '<div class="footer">' + FUSS_ZEILE + '<br>' + fuss + '</div></div>';
  }
  /* Kaufvertrag + Übergabeprotokoll: alles schwarz auf weiß (Oli, 25.11.2026) – nur das Logo bleibt farbig.
     Umbrüche: Paragraphen dürfen umbrechen; zusammen bleiben nur Überschrift + erster Inhalt, Tabellenzeilen, Unterschriftsblöcke. */
  var KV_CSS = '*{box-sizing:border-box;margin:0;padding:0}body{font-family:Arial,Helvetica,sans-serif;font-size:10.5pt;color:#000;background:#fff;padding:20mm 20mm;line-height:1.5}' +
    '.hd{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:3px solid #000;padding-bottom:10pt;margin-bottom:14pt;page-break-inside:avoid}' +
    '.adr{font-size:8.5pt;color:#000;margin-top:5pt;line-height:1.6}.doc-info{text-align:right;font-size:9pt;color:#000;line-height:1.8}.kv-nr{font-size:11pt;font-weight:700;color:#000}' +
    'h1,h2{page-break-after:avoid}h1{font-size:16pt;font-weight:700;color:#000;font-family:Georgia,serif;text-align:center;margin:14pt 0 4pt}' +
    '.subtitle{text-align:center;font-size:9pt;color:#000;margin-bottom:16pt;text-transform:uppercase;letter-spacing:1px;page-break-after:avoid}.sec{margin-bottom:13pt}' +
    '.sec-title{font-size:10pt;font-weight:700;text-transform:uppercase;letter-spacing:0.8px;color:#000;border-bottom:1.5pt solid #000;padding-bottom:3pt;margin-bottom:8pt;page-break-after:avoid}' +
    '.zwei{display:grid;grid-template-columns:1fr 1fr;gap:18pt}table.daten{width:100%;border-collapse:collapse;font-size:9.5pt}tr{page-break-inside:avoid}' +
    'table.daten td{padding:4pt 6pt;border-bottom:0.5pt solid #000;vertical-align:top;color:#000}table.daten td:first-child{color:#000;font-weight:600;width:44%;white-space:nowrap}' +
    '.preis-box{background:#fff;border:2px solid #000;border-radius:6pt;padding:10pt 14pt;margin:10pt 0;page-break-inside:avoid}.preis-label{font-size:8.5pt;color:#000;margin-bottom:2pt}' +
    '.preis-wert{font-size:22pt;font-weight:700;color:#000;font-family:Georgia,serif}.preis-text{font-size:8.5pt;color:#000;margin-top:3pt}' +
    'ul.checks{list-style:none;padding:0}ul.checks li{padding:2.5pt 0;font-size:9.5pt}ul.checks li::before{content:\'✓  \';color:#000;font-weight:700}' +
    '.box-warn{background:#fff;border:1pt solid #000;border-left:3px solid #000;padding:8pt 12pt;font-size:9pt;color:#000;line-height:1.6;margin-top:8pt}' +
    '.box-info{background:#fff;border:1pt solid #000;border-left:3px solid #000;padding:8pt 12pt;font-size:9pt;color:#000;line-height:1.6;margin-top:8pt;page-break-inside:avoid}' +
    '.box-text{background:#fff;border:1pt solid #000;border-radius:4pt;padding:9pt 12pt;font-size:9.5pt;color:#000;line-height:1.55;white-space:pre-wrap}' +
    '.zusammen{page-break-inside:avoid}' +
    '.unt{margin-top:22pt;display:grid;grid-template-columns:1fr 1fr;gap:36pt;page-break-inside:avoid}.unt-block{border-top:1.5pt solid #000;padding-top:5pt;font-size:8.5pt;color:#000;line-height:1.6}' +
    '.unt-linie{height:32pt;border-bottom:0.5pt solid #000;margin-bottom:5pt}.footer{margin-top:22pt;border-top:0.5pt solid #000;padding-top:7pt;font-size:7.5pt;color:#000;text-align:center;line-height:1.7;page-break-inside:avoid}' +
    '.ue .sec{margin-bottom:9pt}.ue h1{margin:6pt 0 2pt}.ue .subtitle{margin-bottom:8pt}.ue .unt{margin-top:16pt}.ue .unt-linie{height:26pt}.ue .footer{margin-top:12pt}' +
    '.page-break{page-break-before:always;padding-top:0}@media print{body{padding:0 4mm}@page{size:A4;margin:12mm 12mm 16mm;@bottom-center{content:"Seite " counter(page) " von " counter(pages);font:8pt Arial,sans-serif;color:#000}}}' +
    'table.mn2{width:100%;border-collapse:collapse}table.mn2 th{background:#fff;color:#000;border-top:1.5pt solid #000;border-bottom:1.5pt solid #000;padding:6pt;font-size:8.5pt;text-align:left}table.mn2 th:last-child{text-align:right}' +
    'table.mn2 td{padding:4pt 6pt;border-bottom:0.5pt solid #000;font-size:9pt;vertical-align:top;color:#000}table.mn2 td:last-child{text-align:right;white-space:nowrap}';

  function htmlKaufvertrag(a) {
    var fz = fzBez(a), vkName = ((a.vk_vorname || '') + ' ' + (a.vk_nachname || '')).trim();
    var vkAdresse = [a.vk_strasse, a.vk_plz && a.vk_ort ? a.vk_plz + ' ' + a.vk_ort : ''].filter(Boolean).join(', ');
    var tot = summeKosten(a);
    var ausstL = ausstListe(a), reifenL = reifenListe(a);
    var bekannte = MN_ROWS.filter(function (r) { return a['mn_' + r.key] || pnum(a['mn_' + r.key + '_kosten']) > 0; }).map(function (r) {
      return '<tr><td>' + r.label + '</td><td>' + (esc(a['mn_' + r.key]) || '–') +
        '</td><td style="text-align:right;">' + (a['mn_' + r.key + '_kosten'] > 0 ? euroPlain(a['mn_' + r.key + '_kosten']) : '–') + '</td></tr>';
    }).join('');
    var z = function (lab, val) { return val ? '<tr><td>' + lab + '</td><td>' + val + '</td></tr>' : ''; };
    var kdAn = a.kd_km_faellig || a.kd_datum_faellig || a.kd_alle_durchgefuehrt;
    return '<!DOCTYPE html><html lang="de"><head><meta charset="UTF-8"><title>Kaufvertrag – ' + esc(fz) + '</title><style>' + KV_CSS + '</style></head><body>' +
      '<div class="hd"><div>' + logoHtml() + '<div class="adr" style="margin-top:8pt;">' + ADR_ZEILE + '</div></div>' +
      '<div class="doc-info"><div class="kv-nr">KAUFVERTRAG</div>' + (a.interne_nr ? '<div>Interne Nr.: <strong>' + esc(a.interne_nr) + '</strong></div>' : '') +
      '<div>Datum: ' + heute() + '</div>' + (a.bearbeiter_name ? '<div>Bearbeiter: ' + esc(a.bearbeiter_name) + '</div>' : '') + '</div></div>' +
      '<h1>Kaufvertrag für ein gebrauchtes Kraftfahrzeug</h1><div class="subtitle">Privatkauf – Privat an Gewerbetreibenden</div>' +
      '<div class="sec"><div class="sec-title">§ 1 · Vertragsparteien</div><div class="zwei"><div><strong style="font-size:8.5pt;text-transform:uppercase;">Verkäufer (Privat)</strong>' +
      '<table class="daten" style="margin-top:6pt"><tr><td>Name:</td><td>' + (esc(vkName) || '–') + '</td></tr><tr><td>Adresse:</td><td>' + (esc(vkAdresse) || '–') + '</td></tr>' +
      z('Telefon:', esc(a.vk_telefon)) + z('E-Mail:', esc(a.vk_email)) + '</table></div>' +
      '<div><strong style="font-size:8.5pt;text-transform:uppercase;">Käufer (Gewerbetreibender)</strong><table class="daten" style="margin-top:6pt">' +
      '<tr><td>Firma:</td><td>Autohaus Stieber GmbH</td></tr><tr><td>Adresse:</td><td>Emerholzweg 5, 70439 Stuttgart-Stammheim</td></tr><tr><td>Vertreten durch:</td><td>Oliver Stieber</td></tr></table></div></div></div>' +
      '<div class="sec"><div class="sec-title">§ 2 · Kaufgegenstand – Fahrzeug</div><table class="daten">' +
      (a.interne_nr ? '<tr><td>Interne Nr.:</td><td><strong>' + esc(a.interne_nr) + '</strong></td></tr>' : '') +
      '<tr><td>Fahrzeug:</td><td><strong>' + (esc(fz) || '–') + '</strong></td></tr>' + z('Kennzeichen:', esc(a.fz_kennzeichen)) + z('Fahrgestellnummer (FIN):', esc(a.fz_fahrgestellnr)) +
      z('Erstzulassung:', a.fz_erstzulassung ? fmtDatumDE(a.fz_erstzulassung) : '') + z('Kilometerstand:', a.fz_km_stand ? Number(a.fz_km_stand).toLocaleString('de-DE') + ' km (lt. Tacho)' : '') +
      z('Kraftstoff:', esc(a.fz_kraftstoff)) + z('Getriebe:', esc(a.fz_getriebe)) + z('Antrieb:', esc(a.fz_antrieb)) + z('Leistung:', a.fz_leistung_kw ? a.fz_leistung_kw + ' PS' : '') +
      z('Farbe:', esc(a.fz_farbe)) + z('Anzahl Sitzplätze:', esc(a.fz_sitzplaetze)) + z('Anzahl Vorhalter:', a.fz_halteranzahl) + z('HU/AU gültig bis:', esc(a.fz_hu_datum)) +
      (a.fz_anzahl_schluessel != null ? '<tr><td>Anzahl Schlüssel:</td><td>' + a.fz_anzahl_schluessel + '</td></tr>' : '') +
      z('Bereifung:', esc(reifenL.join(' · '))) + z('Ausstattung:', esc(ausstL.join(' · '))) + '</table></div>' +
      '<div class="sec"><div class="sec-title">§ 3 · Kaufpreis und Zahlung</div><div class="preis-box"><div class="preis-label">Vereinbarter Kaufpreis (brutto, inkl. gesetzl. MwSt.)</div>' +
      '<div class="preis-wert">' + (a.ankaufspreis ? euroPlain(a.ankaufspreis) : '– €') + '</div><div class="preis-text">Der Kaufpreis wird per Überweisung auf ein Konto des Verkäufers gezahlt oder mit dem Kaufpreis eines Neufahrzeugs verrechnet. Eine Barauszahlung ist nicht möglich.</div></div>' +
      '<p style="font-size:9pt;margin-top:6pt;">Der Kaufpreis ist fällig und zahlbar bei Übergabe des Fahrzeugs. Mit vollständiger Zahlung gehen Besitz, Nutzen und Gefahr auf den Käufer über.</p></div>' +
      /* § 4 wie alte App v5: immer gedruckt (gesonderte Unterschrift des Verkäufers); Wortlaut 1:1, ohne eigene Kilometer-Zeile */
      '<div class="sec"><div class="sec-title">§ 4 · Zusicherungen des Verkäufers</div>' +
      '<p style="font-size:9pt;margin-bottom:6pt;">Der Verkäufer erklärt ausdrücklich:</p><table class="daten">' +
      ZUS_ROWS.map(function (r) {
        var w = zusAnzeige(a, r);
        return '<tr><td>' + esc(r.vertrag) + ':</td><td>' + (w === true ? '☒' : '☐') + ' Ja &nbsp;&nbsp; ' + (w === false ? '☒' : '☐') + ' Nein</td></tr>';
      }).join('') + '</table>' +
      (kdAn ? '<table class="daten" style="margin-top:8pt">' + (a.kd_alle_durchgefuehrt ? '<tr><td>Kundendiensthistorie:</td><td>Alle Kundendienste lückenlos nachgewiesen</td></tr>' : '') +
        (a.kd_km_faellig ? '<tr><td>Nächster KD fällig bei:</td><td>' + Number(a.kd_km_faellig).toLocaleString('de-DE') + ' km</td></tr>' : '') +
        (a.kd_datum_faellig ? '<tr><td>Nächster KD fällig am:</td><td>' + fmtDatumDE(a.kd_datum_faellig) + '</td></tr>' : '') + '</table>' : '') +
      '<p style="font-size:9pt;margin:10pt 0 5pt;page-break-after:avoid;"><strong>Schäden laut Verkäufer (welche und wo):</strong></p>' +
      '<div class="box-text" style="min-height:30pt;">' + (a.vk_schaeden ? esc(a.vk_schaeden) : '______________________________________________________________________________\n______________________________________________________________________________') + '</div>' +
      '<div class="zusammen"><p style="font-size:8.5pt;margin-top:8pt;">Der Verkäufer bestätigt mit seiner Unterschrift, dass die Zusicherungen und die Angaben zu Schäden in diesem Paragraphen vollständig und wahrheitsgemäß sind.</p>' +
      '<div class="unt" style="margin-top:10pt;grid-template-columns:1fr;max-width:50%;"><div class="unt-block" style="border-top:none;padding-top:0"><div class="unt-linie"></div><strong>' + (esc(vkName) || 'Verkäufer') + '</strong><br>Ort, Datum &amp; Unterschrift Verkäufer zu § 4</div></div></div></div>' +
      '<div class="sec"><div class="sec-title">§ 5 · Bekannte Mängel und Zustand</div>' +
      (a.vk_bekannte_maengel ? '<p style="font-size:9pt;margin-bottom:5pt;"><strong>Vom Verkäufer ausdrücklich angegeben (Pflichtangabe):</strong></p>' +
        '<div class="box-text" style="margin-bottom:10pt;">' + esc(a.vk_bekannte_maengel) + '</div>' : '') +
      (bekannte ? '<p style="font-size:9pt;margin-bottom:7pt;page-break-after:avoid;">Folgende Mängel wurden vom Käufer dokumentiert und werden bei der Kaufpreisfindung berücksichtigt:</p>' +
        '<table class="mn2"><thead><tr><th style="width:25%">Baugruppe</th><th>Beschreibung</th><th style="width:100pt;text-align:right;">Kosten (€)</th></tr></thead><tbody>' + bekannte + '</tbody>' +
        (tot > 0 ? '<tfoot><tr><td colspan="2" style="padding:6pt;font-weight:700;border-top:1.5pt solid #000;">Gesamt Instandsetzungskosten</td><td style="padding:6pt;font-weight:700;text-align:right;border-top:1.5pt solid #000;">' + euroPlain(tot) + '</td></tr></tfoot>' : '') + '</table>' : '') + '</div>' +
      '<div class="sec"><div class="sec-title">§ 6 · Gewährleistung und Haftungsausschluss</div><div class="box-warn">' +
      'Das Fahrzeug wird als gebrauchtes Kraftfahrzeug <strong>unter Ausschluss jeglicher Gewährleistung</strong> verkauft, soweit nicht durch zwingende gesetzliche Vorschriften eine Haftung vorgesehen ist. Arglistig verschwiegene Mängel und zugesicherte Eigenschaften sind von diesem Ausschluss ausgenommen.<br><br>' +
      'Der Käufer hat das Fahrzeug besichtigt und den technischen Zustand geprüft. Das Fahrzeug wird im gegenwärtigen Zustand verkauft und übernommen.<br><br>' +
      '<strong>Klausel zu unbekannten Mängeln:</strong> Werden bei der Fahrzeugübergabe weitere Mängel festgestellt, die zum Zeitpunkt der Vertragsunterzeichnung nicht bekannt waren und im vorliegenden Vertrag nicht dokumentiert sind, werden die anfallenden Instandsetzungskosten vom vereinbarten Kaufpreis in Abzug gebracht. Der Verkäufer erkennt dieses Verfahren mit seiner Unterschrift ausdrücklich an.</div></div>' +
      '<div class="sec"><div class="sec-title">§ 7 · Sondervereinbarungen</div><div style="min-height:36pt;border:0.5pt solid #000;border-radius:4pt;padding:8pt;font-size:9pt;color:#000;">' +
      '______________________________________________________________________________________<br>______________________________________________________________________________________</div></div>' +
      '<div class="unt"><div class="unt-block"><div class="unt-linie"></div><strong>' + (esc(vkName) || 'Verkäufer') + '</strong><br>Ort, Datum &amp; Unterschrift Verkäufer<br><span style="font-size:7.5pt;">– Privat –</span></div>' +
      '<div class="unt-block"><div class="unt-linie"></div><strong>Autohaus Stieber GmbH</strong><br>Ort, Datum &amp; Unterschrift Käufer<br><span style="font-size:7.5pt;">– Gewerbetreibender –</span></div></div>' +
      '<div class="footer">' + FUSS_ZEILE + '<br>Kaufvertrag · Erstellt am ' + heute() + '</div>' +
      '<div class="page-break">' + uebergabeSeite(a, 'Kaufvertrag – Fahrzeugübergabe-Protokoll') + '</div><!--DRUCK--></body></html>';
  }
  function htmlUebergabe(a) {
    return '<!DOCTYPE html><html lang="de"><head><meta charset="UTF-8"><title>Fahrzeugübergabe-Protokoll – ' + esc(fzBez(a)) + '</title><style>' + KV_CSS + '</style></head><body>' +
      uebergabeSeite(a, 'Fahrzeugübergabe-Protokoll zum Kaufvertrag') + '<!--DRUCK--></body></html>';
  }

  async function druck(id, art) {
    var a = S.alle.find(function (x) { return x.id === id; }); if (!a) return;
    try {
      if (art === 'zustand') {
        var urls = [];
        var fotos = Array.isArray(a.fotos) ? a.fotos : [];
        for (var i = 0; i < fotos.length; i++) { var u = await fotoUrl(fotos[i]); if (u) urls.push(u); }
        druckFenster(htmlZustandsbericht(a, urls), 900, 750);
      } else if (art === 'kauf') druckFenster(htmlKaufvertrag(a), 960, 800);
      else if (art === 'uebergabe') druckFenster(htmlUebergabe(a), 960, 800);
    } catch (e) { toast('Drucken fehlgeschlagen: ' + fehlerText(e), 'error'); }
  }

  /* ===================================================================
     12. Anbindung an das Tool (EG)
     =================================================================== */
  async function render(container) {
    stilEinbetten();
    await demoVorbereiten();
    if (!S.root) {
      S.root = document.createElement('div');
      S.root.className = 'iz-root';
      baueGeruest();
      S.newId = uuid();
    }
    if (S.root.parentNode !== container) { container.innerHTML = ''; container.appendChild(S.root); }
    if (S.view === 'liste') ladeListe();
    setzeAkteKlasse(); kopfHoehe();
  }

  var angemeldet = false;
  function anmelden() {
    if (angemeldet) return true;
    var eg = window.EG;
    if (!eg || typeof eg.onTab !== 'function') return false;
    eg.onTab(TAB, render);
    /* Reiterwechsel: bei ungespeicherten Änderungen erst fragen (App-Dialog), Rest wie bisher.
       Der Reiter wird über EG.zeigeTab umgeschaltet – wir hüllen die Funktion ein. */
    if (typeof eg.zeigeTab === 'function' && !eg.zeigeTab.izGeschuetzt) {
      var orig = eg.zeigeTab;
      var geschuetzt = function (name) {
        var sec = S.root && S.root.closest ? S.root.closest('section') : null;
        var hier = !!sec && !sec.hidden;
        if (hier && name !== TAB && formHatAenderungen()) {
          var args = arguments;
          bestaetigen('Du hast ungespeicherte Änderungen im Ankauf. Reiter wirklich wechseln? Die Änderungen gehen verloren.', { ja: 'Verwerfen und wechseln', nein: 'Hier bleiben', gefahr: true }).then(async function (ok) {
            if (!ok) return;
            await aufraeumenUploads(); markClean(); zeigeListe();
            orig.apply(eg, args); setzeAkteKlasse();
          });
          return;
        }
        var r = orig.apply(eg, arguments);
        setzeAkteKlasse();
        return r;
      };
      geschuetzt.izGeschuetzt = true;
      eg.zeigeTab = geschuetzt;
    }
    return true;
  }
  // Neu laden / Fenster schließen mit ungespeicherten Änderungen: Standard-Hinweis des Browsers
  window.addEventListener('beforeunload', function (e) {
    if (formHatAenderungen()) { e.preventDefault(); e.returnValue = ''; return ''; }
  });
  // Drucken-Menüs schließen, wenn woanders geklickt wird
  document.addEventListener('click', function (e) {
    if (!S.root) return;
    if (e.target && e.target.closest && e.target.closest('[data-menue]')) return;
    S.root.querySelectorAll('.ak-menue.offen').forEach(function (m) { m.classList.remove('offen'); });
    S.root.querySelectorAll('[data-menue]').forEach(function (b) { b.setAttribute('aria-expanded', 'false'); });
  });
  if (!anmelden()) {
    // eingang-core.js noch nicht geladen → kurz warten
    var versuche = 0;
    var iv = setInterval(function () { if (anmelden() || ++versuche > 100) clearInterval(iv); }, 50);
    document.addEventListener('DOMContentLoaded', function () { anmelden(); });
  }

  // Für Tests und Fehlersuche
  window.EG_INZAHLUNG = {
    render: render, berechneAbweichungen: berechneAbweichungen, htmlKaufvertrag: htmlKaufvertrag,
    htmlZustandsbericht: htmlZustandsbericht, htmlUebergabe: htmlUebergabe, anzeigeStatus: anzeigeStatus, parseMonat: parseMonat,
    GRENZE_EURO: GRENZE_EURO, KM_TOLERANZ: KM_TOLERANZ, _S: S, bearbeiten: bearbeiten, neuerAnkauf: neuerAnkauf, pflichtLuecken: pflichtLuecken
  };
})();
