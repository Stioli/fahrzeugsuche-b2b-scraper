/* =====================================================================
   Fahrzeugeingang-Tool · Reiter „Inzahlungnahmen“ (Paket P4)
   Autohaus Stieber GmbH · Stand 30.10.2026

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
    { c: 'vk_plz', l: 'PLZ', t: 'text', ph: '70439' },
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
    { c: 'ankaufspreis', l: '', t: 'dec', n: 1 },
    { c: 'status', l: '', t: 'select' }
  ]);
  var CHECKS = [].concat(
    AUSST.map(function (x) { return x[0]; }),
    ZUSICH.map(function (x) { return x[0]; }),
    ['kd_alle_durchgefuehrt']
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
  async function bestaetigen(t) {
    var eg = EGx();
    if (typeof eg.bestaetigen === 'function') return !!(await eg.bestaetigen(t));
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
  function fmtKm(n) { return n != null && n !== '' ? Number(n).toLocaleString('de-DE') + ' km' : '–'; }
  function parseDez(s) {
    if (s == null) return null;
    var t = String(s).trim().replace(',', '.');
    if (t === '') return null;
    var n = parseFloat(t);
    return isNaN(n) ? null : n;
  }
  function pnum(x) { var n = parseFloat(x); return isNaN(n) ? 0 : n; }
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
      '.iz-tabelle{background:#fff;border:1px solid var(--iz-rahmen);border-radius:var(--iz-r);overflow:hidden;box-shadow:0 2px 10px rgba(0,123,255,.06)}',
      '.iz-tabelle table{width:100%;border-collapse:collapse}',
      '.iz-tabelle th{background:var(--iz-bg);padding:12px 14px;text-align:left;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.8px;border-bottom:1px solid var(--iz-rahmen);color:var(--iz-ink)}',
      '.iz-tabelle th.sort{cursor:pointer;user-select:none;white-space:nowrap}',
      '.iz-tabelle th.sort:hover{color:var(--iz-blau-d)}',
      '.iz-tabelle th.sort::after{content:" ⇅";opacity:.35;font-size:10px}',
      '.iz-tabelle th.asc::after{content:" ▲";opacity:1;color:var(--iz-blau-d)}',
      '.iz-tabelle th.desc::after{content:" ▼";opacity:1;color:var(--iz-blau-d)}',
      '.iz-tabelle tr.fil th{background:#fafbfc;padding:6px 8px}',
      '.iz-tabelle tr.fil input,.iz-tabelle tr.fil select{min-height:38px;padding:6px 10px;font-size:13px;border-radius:8px}',
      '.iz-tabelle td{padding:12px 14px;border-bottom:1px solid var(--iz-rahmen);font-size:14.5px;vertical-align:middle}',
      '.iz-tabelle tbody tr:hover td{background:#f7faff}',
      '.iz-tabelle tbody tr:last-child td{border-bottom:none}',
      '.iz-nr{font-family:"Plus Jakarta Sans",system-ui,sans-serif;font-weight:700;color:var(--iz-blau-d)}',
      '.iz-fin{font-family:"Courier New",monospace;font-size:12.5px;color:var(--iz-sub)}',
      '.iz-badge{display:inline-block;padding:3px 11px;border-radius:20px;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.4px;white-space:nowrap}',
      '.iz-b-neu{background:#dbeafe;color:#1e40af}.iz-b-bewertet{background:#fef9c3;color:#854d0e}.iz-b-vertrag_erstellt{background:#dcfce7;color:#166534}',
      '.iz-b-abgeschlossen{background:#f3e8ff;color:#6b21a8}.iz-b-abgelehnt{background:#fee2e2;color:#991b1b}',
      '.iz-b-uebernommen{background:#166534;color:#fff}.iz-b-abweichung_offen{background:var(--iz-rot);color:#fff}',
      '.iz-leer,.iz-laden{text-align:center;padding:48px 16px;color:var(--iz-sub)}',
      '.iz-mobilbar{display:none}',
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
      ' .iz-tabelle thead{display:none}.iz-tabelle table,.iz-tabelle tbody,.iz-tabelle tr,.iz-tabelle td{display:block;width:100%}',
      ' .iz-tabelle tbody tr{padding:12px 14px;border-bottom:8px solid var(--iz-bg)}',
      ' .iz-tabelle td{display:flex;justify-content:space-between;gap:12px;padding:4px 0;border:none}',
      ' .iz-tabelle td::before{content:attr(data-l);color:var(--iz-sub);font-size:13px;flex-shrink:0}',
      ' .iz-tabelle td:last-child{justify-content:flex-end;padding-top:8px}.iz-tabelle td:last-child::before{content:none}}',
      '@media (max-width:720px){.iz-stats{grid-template-columns:repeat(3,1fr);gap:8px}.iz-stat{padding:10px}.iz-stat-v{font-size:24px}.iz-stat-l{font-size:11px;letter-spacing:.4px}',
      ' .iz-root{padding:10px}.iz-sec{padding:16px 14px}.iz-grid{grid-template-columns:1fr}.iz-cbgrid{grid-template-columns:1fr}',
      ' .iz-mn-kopf{display:none}.iz-mn-zeile{grid-template-columns:1fr;gap:6px;padding:12px 0}.iz-mn-zeile .nm{color:var(--iz-blau-d);font-weight:700}',
      ' .iz-aktionen{flex-direction:column-reverse}.iz-aktionen .iz-btn{width:100%}.iz-ctrl{width:100%}.iz-ctrl input,.iz-ctrl select{width:100%}',
      ' .iz-modal{padding:18px 14px;border-radius:16px}.iz-zeile{flex-direction:column;gap:0}.iz-zeile span:last-child{text-align:left}',
      ' .iz-modal-akt .iz-btn{flex:1 1 100%}.iz-profil{grid-template-columns:1fr}}',
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
      if (c.vk_nachname && ((a.vk_vorname || '') + ' ' + (a.vk_nachname || '')).toLowerCase().indexOf(c.vk_nachname) < 0) return false;
      if (c.fz_km_stand && String(a.fz_km_stand || '').indexOf(c.fz_km_stand.replace(/\./g, '')) < 0) return false;
      if (c.ankaufspreis && String(a.ankaufspreis || '').indexOf(c.ankaufspreis.replace(/[.,€\s]/g, '')) < 0) return false;
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
    ['interne_nr', 'Interne Nr.', 'filtern…'], ['erstellt_am', 'Datum', 'z.B. 17.05'], ['fz_hersteller', 'Fahrzeug', 'Marke/Modell'],
    ['fz_fahrgestellnr', 'Fgst.-Nr.', 'FIN'], ['fz_kennzeichen', 'Kennzeichen', 'Kennz.'], ['vk_nachname', 'Verkäufer', 'Name'],
    ['fz_km_stand', 'KM-Stand', 'km'], ['ankaufspreis', 'Ankaufspreis', '€'], ['status', 'Status', '']
  ];
  var STATUS_FILTER = [['', 'Alle'], ['neu', 'Neu'], ['bewertet', 'Bewertet'], ['vertrag_erstellt', 'Angekauft'],
    ['uebernommen', 'Übernommen'], ['abweichung_offen', 'Abweichung offen'], ['abgeschlossen', 'Abgeschlossen'], ['abgelehnt', 'Abgelehnt']];

  function baueGeruest() {
    S.root.innerHTML =
      '<div id="iz-v-liste">' +
      '<div class="iz-stats" id="iz-stats"></div>' +
      '<div class="iz-kopf"><h2>Alle <em>Inzahlungnahmen</em></h2><div class="iz-ctrl">' +
      '<select id="iz-owner"><option value="all">Alle Mitarbeiter</option><option value="me">Nur meine Ankäufe</option></select>' +
      '<input type="search" id="iz-suche" placeholder="🔍 Volltextsuche…">' +
      '<button class="iz-btn iz-btn-o iz-btn-sm" id="iz-reload" type="button">↻ Aktualisieren</button>' +
      '<button class="iz-btn iz-btn-p" id="iz-neu" type="button">➕ Neuer Ankauf</button></div></div>' +
      '<div class="iz-mobilbar"><select id="iz-m-status">' + STATUS_FILTER.map(function (s) { return '<option value="' + s[0] + '">' + (s[0] ? s[1] : 'Alle Status') + '</option>'; }).join('') + '</select>' +
      '<select id="iz-m-sort"><option value="erstellt_am|desc">Neueste zuerst</option><option value="erstellt_am|asc">Älteste zuerst</option><option value="fz_hersteller|asc">Fahrzeug A–Z</option><option value="ankaufspreis|desc">Preis hoch</option><option value="status|asc">Status</option></select></div>' +
      '<div class="iz-tabelle"><div id="iz-laden" class="iz-laden">Lade Daten…</div><div id="iz-leer" class="iz-leer" style="display:none"><div style="font-size:48px">🚗</div><h3>Keine Ankäufe gefunden</h3><p>Mit „Neuer Ankauf“ geht es los.</p></div>' +
      '<table id="iz-tab" style="display:none"><thead><tr>' +
      SPALTEN.map(function (s) { return '<th class="sort" data-sort="' + s[0] + '" id="iz-th-' + s[0] + '">' + s[1] + '</th>'; }).join('') + '<th>Aktion</th></tr>' +
      '<tr class="fil">' + SPALTEN.map(function (s) {
        if (s[0] === 'status') return '<th><select id="iz-f-status">' + STATUS_FILTER.map(function (o) { return '<option value="' + o[0] + '">' + o[1] + '</option>'; }).join('') + '</select></th>';
        return '<th><input type="text" data-col="' + s[0] + '" placeholder="' + s[2] + '"></th>';
      }).join('') + '<th></th></tr></thead><tbody id="iz-body"></tbody></table></div></div>' +
      '<div id="iz-v-form" style="display:none"></div>';

    var r = S.root;
    r.querySelector('#iz-suche').addEventListener('input', function (e) { S.filter.q = e.target.value; zeichneTabelle(); });
    r.querySelector('#iz-owner').addEventListener('change', function (e) { S.filter.owner = e.target.value; zeichneTabelle(); });
    r.querySelector('#iz-reload').addEventListener('click', function () { ladeListe(true); });
    r.querySelector('#iz-neu').addEventListener('click', function () { neuerAnkauf(); });
    r.querySelectorAll('input[data-col]').forEach(function (inp) {
      inp.addEventListener('input', function () { S.filter.cols[inp.getAttribute('data-col')] = inp.value.toLowerCase().trim(); zeichneTabelle(); });
    });
    r.querySelector('#iz-f-status').addEventListener('change', function (e) { S.filter.status = e.target.value; r.querySelector('#iz-m-status').value = e.target.value; zeichneTabelle(); });
    r.querySelector('#iz-m-status').addEventListener('change', function (e) { S.filter.status = e.target.value; r.querySelector('#iz-f-status').value = e.target.value; zeichneTabelle(); });
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
    r.querySelector('#iz-body').addEventListener('click', function (e) {
      var b = e.target.closest('[data-detail]'); if (b) zeigeDetail(b.getAttribute('data-detail'));
    });
  }

  function aktualisiereStats() {
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
      return '<tr>' +
        '<td data-l="Interne Nr."><span class="iz-nr">' + esc(a.interne_nr || '–') + '</span></td>' +
        '<td data-l="Datum">' + fmtDatum(a.erstellt_am) + '</td>' +
        '<td data-l="Fahrzeug"><strong>' + esc(fzBez(a)) + '</strong></td>' +
        '<td data-l="Fgst.-Nr."><span class="iz-fin">' + esc(a.fz_fahrgestellnr || '–') + '</span></td>' +
        '<td data-l="Kennzeichen">' + esc(a.fz_kennzeichen || '–') + '</td>' +
        '<td data-l="Verkäufer">' + esc(((a.vk_vorname || '') + ' ' + (a.vk_nachname || '')).trim() || '–') + '</td>' +
        '<td data-l="KM-Stand">' + (a.fz_km_stand ? fmtKm(a.fz_km_stand) : '–') + '</td>' +
        '<td data-l="Ankaufspreis"><strong>' + (a.ankaufspreis ? fmtEuro(a.ankaufspreis) : '–') + '</strong></td>' +
        '<td data-l="Status">' + badge(a) + '</td>' +
        '<td><button type="button" class="iz-btn iz-btn-o iz-btn-sm" data-detail="' + esc(a.id) + '">Details</button></td></tr>';
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
        inp = '<input type="' + (f.t === 'text' ? 'text' : f.t) + '" id="' + id + '" placeholder="' + esc(f.ph || '') + '"' + (f.up ? ' style="text-transform:uppercase"' : '') + '>';
    }
    return '<div class="' + cls + '"><label for="' + id + '">' + esc(f.l) + '</label>' + inp + '</div>';
  }
  function cbHtml(id, label) {
    return '<label class="iz-cb"><input type="checkbox" id="iz_' + id + '"><span>' + label + '</span></label>';
  }
  function sekt(nr, titel, inhalt) {
    return '<div class="iz-sec"><div class="iz-sec-t"><div class="iz-nummer">' + nr + '</div>' + titel + '</div>' + inhalt + '</div>';
  }

  function baueFormular() {
    var h = '';
    h += '<div class="iz-kopf"><h2 id="iz-form-titel">Neuer <em>Ankauf</em></h2><button type="button" class="iz-btn iz-btn-o iz-btn-sm" id="iz-zurueck">← Zur Liste</button></div>';
    h += sekt(1, 'Verkäufer (Privatkunde)', '<div class="iz-grid">' + F_KUNDE.map(feldHtml).join('') + '</div>');
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
      '<div class="iz-cbgrid">' + ZUSICH.map(function (x) { return cbHtml(x[0], x[1]); }).join('') + '</div>' +
      '<div class="iz-sub"><div class="iz-sub-l">Bekannte Mängel (vom Verkäufer angegeben)</div>' +
      '<div class="iz-fg full"><label for="iz_vk_bekannte_maengel">Dem Verkäufer sind folgende Mängel bekannt *</label>' +
      '<textarea id="iz_vk_bekannte_maengel" rows="4" placeholder="z.B. Klimaanlage kühlt nicht richtig, Steinschlag in Frontscheibe, … Falls dem Verkäufer KEINE Mängel bekannt sind, bitte explizit eintragen: \'Keine Mängel bekannt\'."></textarea>' +
      '<small style="color:var(--iz-sub)">Pflichtfeld – wird in den Kaufvertrag übernommen (rechtlich relevant: Verkäufer haftet bei arglistig verschwiegenen Mängeln).</small></div></div>' +
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
      '<div class="iz-grid" style="margin-top:20px"><div class="iz-fg"><label for="iz_ankaufspreis">Ankaufspreis (€) *</label><input type="number" id="iz_ankaufspreis" placeholder="8500" step="100" inputmode="decimal"></div>' +
      '<div class="iz-fg" style="justify-content:flex-end"><div class="iz-soll" id="iz_marge">→ Marge = Ankaufspreis − Gesamtkosten</div></div></div>' +
      '<div class="iz-hinweis rot">Auszahlung nur per Überweisung – nie bar.</div>');
    // 6 Status & Notizen
    h += sekt(6, 'Status &amp; Notizen',
      '<div class="iz-grid"><div class="iz-fg"><label for="iz_status">Status</label><select id="iz_status">' +
      STATUS_OPT.map(function (o) { return '<option value="' + o[0] + '">' + o[1] + '</option>'; }).join('') + '</select></div>' +
      F_STATUS.map(feldHtml).join('') + '</div>');
    h += '<div class="iz-aktionen"><button type="button" class="iz-btn iz-btn-o" id="iz_leeren">Formular leeren</button>' +
      '<button type="button" class="iz-btn iz-btn-p" id="iz_speichern">💾 Ankauf speichern</button></div>';

    var v = S.root.querySelector('#iz-v-form');
    v.innerHTML = h;
    // Ereignisse
    v.querySelector('#iz-zurueck').addEventListener('click', formVerlassen);
    v.querySelector('#iz_leeren').addEventListener('click', async function () {
      if (await bestaetigen('Formular wirklich leeren? Nicht gespeicherte Eingaben gehen verloren.')) { await aufraeumenUploads(); setzeFormZurueck(); }
    });
    v.querySelector('#iz_speichern').addEventListener('click', speichern);
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
    v.querySelector('#iz_fotos').addEventListener('click', async function (e) {
      var b = e.target.closest('[data-fotodel]'); if (!b) return;
      var idx = +b.getAttribute('data-fotodel'), p = S.fotos[idx];
      if (!p || !(await bestaetigen('Foto wirklich entfernen?'))) return;
      S.fotos.splice(idx, 1);
      var ui = S.uploads.indexOf(p);
      if (ui >= 0) { S.uploads.splice(ui, 1); fotosEntfernen([p]); } else S.entfernt.push(p);
      zeichneFormFotos();
    });
  }

  function lackPruefen(el) {
    var val = parseDez(el.value), hi = val != null && val > 200;
    el.style.background = hi ? '#fff3cd' : ''; el.style.borderColor = hi ? '#c8982a' : '';
  }
  function rechneSumme() {
    var total = MN_ROWS.reduce(function (s, r) { var e = qi('mn_' + r.key + '_kosten'); return s + (e ? pnum(e.value) : 0); }, 0);
    qi('mn_gesamt').textContent = fmtEuro(total);
    var preis = pnum(qi('ankaufspreis').value);
    qi('marge').textContent = '→ Marge = Ankaufspreis − Gesamtkosten' + (preis ? ': ' + fmtEuro(preis - total) : '');
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
      try { S.fotos.push(await fotoSpeichern(f, id)); zeichneFormFotos(); }
      catch (e) { toast('Foto-Upload fehlgeschlagen: ' + fehlerText(e), 'error'); }
    }
  }
  async function aufraeumenUploads() {
    var weg = S.uploads.slice(); S.uploads = [];
    if (weg.length) await fotosEntfernen(weg);
  }

  function setzeFormZurueck() {
    S.editId = null; S.newId = uuid(); S.fotos = []; S.uploads = []; S.entfernt = []; S.huRoh = null;
    var v = S.root.querySelector('#iz-v-form');
    v.querySelectorAll('input,select,textarea').forEach(function (el) {
      if (el.type === 'checkbox') el.checked = false; else if (el.type === 'file') el.value = ''; else el.value = '';
    });
    qi('status').value = 'neu';
    qi('bearbeiter_name').value = nutzerName();
    qi('speichern').textContent = '💾 Ankauf speichern';
    q('#iz-form-titel').innerHTML = 'Neuer <em>Ankauf</em>';
    v.querySelectorAll('.iz-reifen-b').forEach(function (b) { b.classList.remove('aktiv'); });
    v.querySelectorAll('[data-lack]').forEach(lackPruefen);
    qi('vk_bekannte_maengel').classList.remove('iz-pflicht');
    rechneSumme(); zeichneFormFotos();
  }
  function zeigeFormular() {
    S.view = 'form';
    S.root.querySelector('#iz-v-liste').style.display = 'none';
    S.root.querySelector('#iz-v-form').style.display = '';
    window.scrollTo(0, 0);
  }
  function neuerAnkauf() {
    if (!S.root.querySelector('#iz_vk_vorname')) baueFormular();
    setzeFormZurueck(); zeigeFormular();
  }
  async function formVerlassen() {
    if (S.uploads.length) {
      if (!(await bestaetigen('Nicht gespeicherte Eingaben und Fotos verwerfen?'))) return;
    }
    await aufraeumenUploads();
    zeigeListe(); ladeListe();
  }

  function bearbeiten(id) {
    var a = S.alle.find(function (x) { return x.id === id; }); if (!a) return;
    if (!S.root.querySelector('#iz_vk_vorname')) baueFormular();
    setzeFormZurueck();
    S.editId = id; S.newId = null;
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
    qi('speichern').textContent = '✏️ Änderungen speichern';
    q('#iz-form-titel').innerHTML = 'Ankauf <em>bearbeiten</em>';
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

  async function speichern() {
    var btn = qi('speichern'), txt = S.editId ? '✏️ Änderungen speichern' : '💾 Ankauf speichern';
    var o = sammle();
    if (!o.fz_hersteller || !o.fz_modell) { toast('Bitte Hersteller und Modell angeben!', 'error'); return; }
    var bm = qi('vk_bekannte_maengel');
    if (!o.vk_bekannte_maengel) {
      bm.classList.add('iz-pflicht'); bm.focus(); bm.scrollIntoView({ behavior: 'smooth', block: 'center' });
      toast('Bitte „Bekannte Mängel“ ausfüllen (Pflichtfeld). Falls keine bekannt: „Keine Mängel bekannt“ eintragen.', 'error');
      return;
    }
    bm.classList.remove('iz-pflicht');
    btn.disabled = true; btn.textContent = '⏳ Speichern…';
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
      if (f) toast('Gespeichert. Entfernte Foto-Dateien konnten nicht gelöscht werden (Löschen darf nur ein Admin).', 'info');
      else toast(S.editId ? 'Ankauf aktualisiert ✓' : 'Ankauf gespeichert ✓', 'success');
      S.uploads = []; S.entfernt = []; S.fotos = [];
      zeigeListe(); await ladeListe();
    } catch (e) {
      toast('Fehler: ' + fehlerText(e), 'error');
    }
    btn.disabled = false; btn.textContent = txt;
  }

  /* ===================================================================
     9. Detailansicht
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

  async function zeigeDetail(id) {
    var a = S.alle.find(function (x) { return x.id === id; }); if (!a) return;
    var admin = await istAdmin();
    var gesamt = summeKosten(a);
    var rows = [
      ['Interne Nr.', a.interne_nr || '–'], ['Datum', fmtDatum(a.erstellt_am)], ['Kennzeichen', a.fz_kennzeichen || '–'],
      ['Fahrgestell', a.fz_fahrgestellnr || '–'], ['Erstzulassung', a.fz_erstzulassung ? fmtDatumDE(a.fz_erstzulassung) : '–'],
      ['KM-Stand', a.fz_km_stand ? fmtKm(a.fz_km_stand) : '–'], ['Kraftstoff', a.fz_kraftstoff || '–'], ['Getriebe', a.fz_getriebe || '–'],
      ['Antrieb', a.fz_antrieb || '–'], ['Leistung', a.fz_leistung_kw ? a.fz_leistung_kw + ' PS' : '–'],
      ['Hubraum', a.fz_hubraum ? a.fz_hubraum + ' cm³' : '–'],
      ['Farbe', a.fz_farbe || '–'], ['Sitzplätze', a.fz_sitzplaetze || '–'], ['Vorbesitzer', a.fz_halteranzahl || '–'],
      ['HU bis', a.fz_hu_datum || '–'], ['Anzahl Schlüssel', a.fz_anzahl_schluessel != null ? a.fz_anzahl_schluessel : '–'],
      ['Verkäufer', ((a.vk_vorname || '') + ' ' + (a.vk_nachname || '')).trim() || '–'], ['Telefon', a.vk_telefon || '–'],
      ['Gesamtkosten', gesamt > 0 ? fmtEuro(gesamt) : '–']
    ];
    var ausst = AUSST.filter(function (x) { return a[x[0]]; }).map(function (x) { return x[2]; });
    var reif = REIFEN.filter(function (t) { return a['reifen_' + t.typ]; }).map(function (t) { return t.name + reifenProfilLabel(a, t.typ); });
    var zus = ZUSICH.filter(function (x) { return a[x[0]]; }).map(function (x) { return x[2]; });
    var chips = function (arr) { return arr.length ? '<div class="iz-chips">' + arr.map(function (x) { return '<span class="iz-chip">' + esc(x) + '</span>'; }).join('') + '</div>' : '–'; };
    var lm = a.lack_messung || {};
    var lackTxt = LACK_POINTS.filter(function (p) { return lm[p.key] != null; }).map(function (p) { return p.label + ': ' + String(lm[p.key]).replace('.', ',') + ' µm' + (lm[p.key] > 200 ? ' ⚠' : ''); });
    var fotos = Array.isArray(a.fotos) ? a.fotos : [];
    var uebernehmbar = a.status === 'vertrag_erstellt' && ['ok', 'abweichung_geklaert'].indexOf(a.uebernahme_status) < 0;
    var u = a.uebernahme_status;

    var html = '<div class="iz-modal-kopf"><h3>' + esc(fzBez(a) || 'Fahrzeugdetails') + '</h3><button type="button" class="iz-x" data-x aria-label="Schließen">✕</button></div>' +
      rows.map(function (r) { return '<div class="iz-zeile"><span>' + r[0] + '</span><span>' + esc(r[1]) + '</span></div>'; }).join('') +
      '<div class="iz-zeile"><span>Status</span><span>' + badge(a) + '</span></div>' +
      '<div class="iz-zeile"><span>Bearbeiter</span><span>' + esc(a.bearbeiter_name || '–') + '</span></div>' +
      '<div class="iz-zeile"><span>Ausstattung</span><span>' + chips(ausst) + '</span></div>' +
      '<div class="iz-zeile"><span>Bereifung</span><span>' + chips(reif) + '</span></div>' +
      '<div class="iz-zeile"><span>Zusicherungen</span><span>' + chips(zus) + '</span></div>' +
      (lackTxt.length ? '<div class="iz-zeile"><span>Lackmessung</span><span>' + chips(lackTxt) + '</span></div>' : '') +
      (a.vk_bekannte_maengel ? '<div class="iz-hinweis"><b style="font-size:12px;text-transform:uppercase;letter-spacing:.8px">Bekannte Mängel (vom Verkäufer)</b><div style="white-space:pre-wrap">' + esc(a.vk_bekannte_maengel) + '</div></div>' : '') +
      (a.ankaufspreis ? '<div class="iz-preis"><span class="iz-soll">Ankaufspreis</span><b>' + fmtEuro(a.ankaufspreis) + '</b></div>' : '') +
      '<div class="iz-hinweis rot">Auszahlung nur per Überweisung – nie bar.</div>';

    // Übernahme-Block
    if (u) {
      var abw = Array.isArray(a.uebernahme_abweichungen) ? a.uebernahme_abweichungen : [];
      html += '<div class="iz-sub"><div class="iz-sub-l">Übernahme bei der Abgabe</div>' +
        '<div class="iz-zeile"><span>Stand</span><span>' + ({ offen: 'offen', ok: 'übernommen, ohne Abweichung', abweichung_offen: 'Abweichung offen', abweichung_geklaert: 'übernommen, Abweichung geklärt' }[u] || esc(u)) + '</span></div>' +
        (a.uebernahme_am ? '<div class="iz-zeile"><span>Übernommen am / von</span><span>' + fmtDatumZeit(a.uebernahme_am) + ' · ' + esc(a.uebernahme_von_name || '–') + '</span></div>' : '') +
        (a.uebernahme_km != null ? '<div class="iz-zeile"><span>km bei Übernahme</span><span>' + fmtKm(a.uebernahme_km) + '</span></div>' : '') +
        (a.uebernahme_schluessel != null ? '<div class="iz-zeile"><span>Schlüssel bei Übernahme</span><span>' + a.uebernahme_schluessel + '</span></div>' : '') +
        abweichungenHtml(abw) +
        (a.abweichung_betrag != null ? '<div class="iz-zeile"><span>Geschätzter Betrag</span><span>' + fmtEuro(a.abweichung_betrag) + '</span></div>' : '') +
        (a.abweichung_entscheidung ? '<div class="iz-hinweis blau"><b>Entscheidung</b> (' + esc(a.abweichung_entschieden_von_name || '–') + ', ' + fmtDatumZeit(a.abweichung_entschieden_am) + ')<div style="white-space:pre-wrap">' + esc(a.abweichung_entscheidung) + '</div></div>' : '');
      var cl = a.uebernahme_checkliste || {};
      var uf = [];
      if (cl.km_foto) uf.push(cl.km_foto);
      (cl.neue_schaeden || []).forEach(function (s) { if (s.foto) uf.push(s.foto); });
      if (uf.length) html += '<div class="iz-fotos">' + uf.map(function (p) { return thumbHtml(p, false); }).join('') + '</div>';
      if (u === 'abweichung_offen') {
        if (admin) {
          html += '<div class="iz-hinweis rot" style="margin-top:12px">Betrag über ' + GRENZE_EURO + ' €: Oli entscheidet über die Preisanpassung.</div>' +
            '<div class="iz-fg full" style="margin-top:10px"><label for="iz-ent">Entscheidung (z. B. Preisanpassung um … €)</label><textarea id="iz-ent" rows="3"></textarea></div>' +
            '<div class="iz-modal-akt"><button type="button" class="iz-btn iz-btn-g" data-entscheiden>✔ Entscheidung speichern</button></div>';
        } else {
          html += '<div class="iz-hinweis rot" style="margin-top:12px">Das Fahrzeug wird nicht ohne Klärung übernommen. Oli entscheidet über die Preisanpassung (Betrag über ' + GRENZE_EURO + ' €).</div>';
        }
      }
    }
    if (fotos.length) html += '<div class="iz-sub"><div class="iz-sub-l">Fotos (' + fotos.length + ')</div><div class="iz-fotos">' + fotos.map(function (p) { return thumbHtml(p, false); }).join('') + '</div></div>';

    html += '<div class="iz-modal-akt">' +
      '<button type="button" class="iz-btn iz-btn-o" data-x>Schließen</button>' +
      '<button type="button" class="iz-btn iz-btn-p" data-edit>✏️ Bearbeiten</button>' +
      '<button type="button" class="iz-btn iz-btn-o" data-druck="zustand">📋 Zustandsbericht</button>' +
      '<button type="button" class="iz-btn iz-btn-o" data-druck="kauf">🖨️ Kaufvertrag drucken</button>' +
      '<button type="button" class="iz-btn iz-btn-o" data-druck="uebergabe">🖨️ Übergabeprotokoll</button>' +
      (uebernehmbar ? '<button type="button" class="iz-btn iz-btn-g" data-uebernehmen>🚗 ' + (u === 'abweichung_offen' ? 'Übernahme neu erfassen' : 'Fahrzeug übernehmen') + '</button>' : '') +
      '</div>';

    var ov = neuesModal(html);
    bilderLaden(ov);
    ov.addEventListener('click', async function (e) {
      var t = e.target.closest('button'); if (!t) return;
      if (t.hasAttribute('data-x')) schliesseModal(ov);
      else if (t.hasAttribute('data-edit')) { schliesseModal(ov); bearbeiten(id); }
      else if (t.hasAttribute('data-druck')) druck(id, t.getAttribute('data-druck'));
      else if (t.hasAttribute('data-uebernehmen')) { schliesseModal(ov); oeffneUebernahme(id); }
      else if (t.hasAttribute('data-entscheiden')) {
        var txt = ov.querySelector('#iz-ent').value.trim();
        if (!txt) { toast('Bitte die Entscheidung als Text eintragen.', 'error'); return; }
        t.disabled = true;
        try {
          await Daten.aendern(id, {
            uebernahme_status: 'abweichung_geklaert', abweichung_entscheidung: txt,
            abweichung_entschieden_von_name: nutzerName(), abweichung_entschieden_am: new Date().toISOString()
          });
          toast('Entscheidung gespeichert ✓', 'success'); schliesseModal(ov); await ladeListe();
        } catch (er) { toast('Fehler: ' + fehlerText(er), 'error'); t.disabled = false; }
      }
    });
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
        zeigeDetail(id);
      } catch (er) { toast('Fehler: ' + fehlerText(er), 'error'); btn.disabled = false; }
    }
    aktualisieren();
  }

  /* ===================================================================
     11. Druckansichten (Wortlaut 1:1 aus der alten App)
     =================================================================== */
  var LOGO_SVG = '<svg viewBox="0 0 1100 240" width="280" height="61" xmlns="http://www.w3.org/2000/svg" aria-label="Autohaus Stieber GmbH MehrmarkenCenter">' +
    '<text x="550" y="78" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-weight="900" font-size="76" fill="#1d54a8" letter-spacing="0">AUTOHAUS STIEBER GMBH</text>' +
    '<line x1="80" y1="108" x2="1020" y2="108" stroke="#9aa4b3" stroke-width="1.4"/>' +
    '<text x="550" y="200" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-weight="500" font-size="80" fill="#5a6474" letter-spacing="6">MehrmarkenCenter</text></svg>';
  var ADR_ZEILE = 'Autohaus Stieber GmbH · Emerholzweg 5 · 70439 Stuttgart-Stammheim<br>Tel. 0711 80 60 94 - 0 · service@autohaus-stieber.de';
  var FUSS_ZEILE = 'Autohaus Stieber GmbH · Emerholzweg 5 · 70439 Stuttgart-Stammheim · Tel. 0711 80 60 94 - 0 · service@autohaus-stieber.de';

  function heute() { return new Date().toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' }); }
  function euroPlain(n) { return fmtEuro(n); }

  function druckFenster(html, breite, hoehe) {
    var mitDruck = html.replace('<!--DRUCK-->', '<script>window.onload=function(){window.print()}<\/script>');
    var w = null;
    try { w = window.open('', '_blank', 'width=' + breite + ',height=' + hoehe); } catch (e) { w = null; }
    if (w) { w.document.write(mitDruck); w.document.close(); return; }
    // Rückfall: unsichtbarer Rahmen (wenn Pop-ups blockiert sind)
    var fr = document.createElement('iframe');
    fr.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0';
    document.body.appendChild(fr);
    fr.contentDocument.open(); fr.contentDocument.write(html.replace('<!--DRUCK-->', '')); fr.contentDocument.close();
    setTimeout(function () { try { fr.contentWindow.focus(); fr.contentWindow.print(); } catch (e) { toast('Drucken nicht möglich – bitte Pop-ups erlauben.', 'error'); } }, 700);
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
      '<div class="hd"><div>' + LOGO_SVG + '<div class="adr" style="margin-top:8pt;">' + ADR_ZEILE + '</div></div>' +
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
    return '<div class="hd"><div>' + LOGO_SVG + '</div><div class="doc-info"><div class="kv-nr">FAHRZEUGÜBERGABE</div><div>Datum: ' + heute() + '</div></div></div>' +
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
      '<div class="unt" style="margin-top:32pt;"><div class="unt-block"><div class="unt-linie"></div><strong>' + (esc(vkName) || 'Verkäufer') + '</strong><br>Ort, Datum &amp; Unterschrift Verkäufer</div>' +
      '<div class="unt-block"><div class="unt-linie"></div><strong>Autohaus Stieber GmbH</strong><br>Ort, Datum &amp; Unterschrift Käufer</div></div>' +
      '<div class="footer">' + FUSS_ZEILE + '<br>' + fuss + '</div>';
  }
  var KV_CSS = '*{box-sizing:border-box;margin:0;padding:0}body{font-family:Arial,Helvetica,sans-serif;font-size:10.5pt;color:#111;background:white;padding:20mm 20mm;line-height:1.5}' +
    '.hd{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:3px solid #003366;padding-bottom:10pt;margin-bottom:14pt}' +
    '.adr{font-size:8.5pt;color:#444;margin-top:5pt;line-height:1.6}.doc-info{text-align:right;font-size:9pt;color:#555;line-height:1.8}.kv-nr{font-size:11pt;font-weight:700;color:#003366}' +
    'h1{font-size:16pt;font-weight:700;color:#003366;font-family:Georgia,serif;text-align:center;margin:14pt 0 4pt}' +
    '.subtitle{text-align:center;font-size:9pt;color:#888;margin-bottom:16pt;text-transform:uppercase;letter-spacing:1px}.sec{margin-bottom:13pt;page-break-inside:avoid}' +
    '.sec-title{font-size:10pt;font-weight:700;text-transform:uppercase;letter-spacing:0.8px;color:#003366;border-bottom:1.5px solid #c8982a;padding-bottom:3pt;margin-bottom:8pt}' +
    '.zwei{display:grid;grid-template-columns:1fr 1fr;gap:18pt}table.daten{width:100%;border-collapse:collapse;font-size:9.5pt}' +
    'table.daten td{padding:4pt 6pt;border-bottom:1px solid #eee;vertical-align:top}table.daten td:first-child{color:#555;font-weight:600;width:44%;white-space:nowrap}' +
    '.preis-box{background:#f0f5ff;border:2px solid #003366;border-radius:6pt;padding:10pt 14pt;margin:10pt 0}.preis-label{font-size:8.5pt;color:#555;margin-bottom:2pt}' +
    '.preis-wert{font-size:22pt;font-weight:700;color:#003366;font-family:Georgia,serif}.preis-text{font-size:8.5pt;color:#888;margin-top:3pt}' +
    'ul.checks{list-style:none;padding:0}ul.checks li{padding:2.5pt 0;font-size:9.5pt}ul.checks li::before{content:\'✓  \';color:#1e6e42;font-weight:700}' +
    '.box-warn{background:#fffbf0;border-left:3px solid #c8982a;padding:8pt 12pt;font-size:9pt;color:#333;line-height:1.6;margin-top:8pt}' +
    '.box-info{background:#f0f5ff;border-left:3px solid #003366;padding:8pt 12pt;font-size:9pt;color:#333;line-height:1.6;margin-top:8pt}' +
    '.unt{margin-top:22pt;display:grid;grid-template-columns:1fr 1fr;gap:36pt;page-break-inside:avoid}.unt-block{border-top:1.5px solid #333;padding-top:5pt;font-size:8.5pt;color:#555;line-height:1.6}' +
    '.unt-linie{height:32pt;border-bottom:1px dashed #bbb;margin-bottom:5pt}.footer{margin-top:22pt;border-top:1px solid #ddd;padding-top:7pt;font-size:7.5pt;color:#aaa;text-align:center;line-height:1.7}' +
    '.page-break{page-break-before:always;padding-top:16pt}@media print{body{padding:12mm 14mm}@page{margin:12mm}}' +
    'table.mn2 th{background:#003366;color:white;padding:6pt;font-size:8.5pt;text-align:left}table.mn2 th:last-child{text-align:right}' +
    'table.mn2 td{padding:4pt 6pt;border-bottom:1px solid #eee;font-size:9pt;vertical-align:top}table.mn2 td:last-child{text-align:right;white-space:nowrap}';

  function htmlKaufvertrag(a) {
    var fz = fzBez(a), vkName = ((a.vk_vorname || '') + ' ' + (a.vk_nachname || '')).trim();
    var vkAdresse = [a.vk_strasse, a.vk_plz && a.vk_ort ? a.vk_plz + ' ' + a.vk_ort : ''].filter(Boolean).join(', ');
    var tot = summeKosten(a);
    var ausstL = ausstListe(a), reifenL = reifenListe(a);
    var zusL = ZUSICH.filter(function (z) { return a[z[0]]; }).map(function (z) { return z[2]; });
    var bekannte = MN_ROWS.filter(function (r) { return a['mn_' + r.key] || pnum(a['mn_' + r.key + '_kosten']) > 0; }).map(function (r) {
      return '<tr><td style="padding:4pt 6pt;border-bottom:1px solid #eee;font-size:9pt;">' + r.label + '</td><td style="padding:4pt 6pt;border-bottom:1px solid #eee;font-size:9pt;">' + (esc(a['mn_' + r.key]) || '–') +
        '</td><td style="padding:4pt 6pt;border-bottom:1px solid #eee;font-size:9pt;text-align:right;">' + (a['mn_' + r.key + '_kosten'] > 0 ? euroPlain(a['mn_' + r.key + '_kosten']) : '–') + '</td></tr>';
    }).join('');
    var z = function (lab, val) { return val ? '<tr><td>' + lab + '</td><td>' + val + '</td></tr>' : ''; };
    var kdAn = a.kd_km_faellig || a.kd_datum_faellig || a.kd_alle_durchgefuehrt;
    return '<!DOCTYPE html><html lang="de"><head><meta charset="UTF-8"><title>Kaufvertrag – ' + esc(fz) + '</title><style>' + KV_CSS + '</style></head><body>' +
      '<div class="hd"><div>' + LOGO_SVG + '<div class="adr" style="margin-top:8pt;">' + ADR_ZEILE + '</div></div>' +
      '<div class="doc-info"><div class="kv-nr">KAUFVERTRAG</div>' + (a.interne_nr ? '<div>Interne Nr.: <strong>' + esc(a.interne_nr) + '</strong></div>' : '') +
      '<div>Datum: ' + heute() + '</div>' + (a.bearbeiter_name ? '<div>Bearbeiter: ' + esc(a.bearbeiter_name) + '</div>' : '') + '</div></div>' +
      '<h1>Kaufvertrag für ein gebrauchtes Kraftfahrzeug</h1><div class="subtitle">Privatkauf – Privat an Gewerbetreibenden</div>' +
      '<div class="sec"><div class="sec-title">§ 1 · Vertragsparteien</div><div class="zwei"><div><strong style="font-size:8.5pt;text-transform:uppercase;color:#555;">Verkäufer (Privat)</strong>' +
      '<table class="daten" style="margin-top:6pt"><tr><td>Name:</td><td>' + (esc(vkName) || '–') + '</td></tr><tr><td>Adresse:</td><td>' + (esc(vkAdresse) || '–') + '</td></tr>' +
      z('Telefon:', esc(a.vk_telefon)) + z('E-Mail:', esc(a.vk_email)) + '</table></div>' +
      '<div><strong style="font-size:8.5pt;text-transform:uppercase;color:#555;">Käufer (Gewerbetreibender)</strong><table class="daten" style="margin-top:6pt">' +
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
      '<p style="font-size:9pt;color:#555;margin-top:6pt;">Der Kaufpreis ist fällig und zahlbar bei Übergabe des Fahrzeugs. Mit vollständiger Zahlung gehen Besitz, Nutzen und Gefahr auf den Käufer über.</p></div>' +
      (zusL.length || kdAn ? '<div class="sec"><div class="sec-title">§ 4 · Zusicherungen des Verkäufers</div>' +
        (zusL.length ? '<p style="font-size:9pt;margin-bottom:6pt;">Der Verkäufer versichert ausdrücklich:</p><ul class="checks">' + zusL.map(function (x) { return '<li>' + x + '</li>'; }).join('') + '</ul>' : '') +
        (kdAn ? '<table class="daten" style="margin-top:8pt">' + (a.kd_alle_durchgefuehrt ? '<tr><td>Kundendiensthistorie:</td><td>Alle Kundendienste lückenlos nachgewiesen</td></tr>' : '') +
          (a.kd_km_faellig ? '<tr><td>Nächster KD fällig bei:</td><td>' + Number(a.kd_km_faellig).toLocaleString('de-DE') + ' km</td></tr>' : '') +
          (a.kd_datum_faellig ? '<tr><td>Nächster KD fällig am:</td><td>' + fmtDatumDE(a.kd_datum_faellig) + '</td></tr>' : '') + '</table>' : '') + '</div>' : '') +
      '<div class="sec"><div class="sec-title">§ 5 · Bekannte Mängel und Zustand</div>' +
      (a.vk_bekannte_maengel ? '<p style="font-size:9pt;margin-bottom:5pt;"><strong>Vom Verkäufer ausdrücklich angegeben (Pflichtangabe):</strong></p>' +
        '<div style="background:#fffbf0;border:1.5px solid #c8982a;border-radius:4pt;padding:9pt 12pt;font-size:9.5pt;color:#222;line-height:1.55;white-space:pre-wrap;margin-bottom:10pt;">' + esc(a.vk_bekannte_maengel) + '</div>' : '') +
      (bekannte ? '<p style="font-size:9pt;margin-bottom:7pt;">Folgende Mängel wurden vom Käufer dokumentiert und werden bei der Kaufpreisfindung berücksichtigt:</p>' +
        '<table class="mn2" style="width:100%;border-collapse:collapse;"><thead><tr><th style="width:25%">Baugruppe</th><th>Beschreibung</th><th style="width:100pt;text-align:right;">Kosten (€)</th></tr></thead><tbody>' + bekannte + '</tbody>' +
        (tot > 0 ? '<tfoot><tr><td colspan="2" style="padding:6pt;font-weight:700;background:#f0f5ff;border-top:1.5px solid #003366;">Gesamt Instandsetzungskosten</td><td style="padding:6pt;font-weight:700;text-align:right;background:#f0f5ff;border-top:1.5px solid #003366;">' + euroPlain(tot) + '</td></tr></tfoot>' : '') + '</table>' : '') + '</div>' +
      '<div class="sec"><div class="sec-title">§ 6 · Gewährleistung und Haftungsausschluss</div><div class="box-warn">' +
      'Das Fahrzeug wird als gebrauchtes Kraftfahrzeug <strong>unter Ausschluss jeglicher Gewährleistung</strong> verkauft, soweit nicht durch zwingende gesetzliche Vorschriften eine Haftung vorgesehen ist. Arglistig verschwiegene Mängel und zugesicherte Eigenschaften sind von diesem Ausschluss ausgenommen.<br><br>' +
      'Der Käufer hat das Fahrzeug besichtigt und den technischen Zustand geprüft. Das Fahrzeug wird im gegenwärtigen Zustand verkauft und übernommen.<br><br>' +
      '<strong>Klausel zu unbekannten Mängeln:</strong> Werden bei der Fahrzeugübergabe weitere Mängel festgestellt, die zum Zeitpunkt der Vertragsunterzeichnung nicht bekannt waren und im vorliegenden Vertrag nicht dokumentiert sind, werden die anfallenden Instandsetzungskosten vom vereinbarten Kaufpreis in Abzug gebracht. Der Verkäufer erkennt dieses Verfahren mit seiner Unterschrift ausdrücklich an.</div></div>' +
      '<div class="sec"><div class="sec-title">§ 7 · Sondervereinbarungen</div><div style="min-height:36pt;border:1px dashed #ccc;border-radius:4pt;padding:8pt;font-size:9pt;color:#aaa;">' +
      '______________________________________________________________________________________<br>______________________________________________________________________________________</div></div>' +
      '<div class="unt"><div class="unt-block"><div class="unt-linie"></div><strong>' + (esc(vkName) || 'Verkäufer') + '</strong><br>Ort, Datum &amp; Unterschrift Verkäufer<br><span style="font-size:7.5pt;">– Privat –</span></div>' +
      '<div class="unt-block"><div class="unt-linie"></div><strong>Autohaus Stieber GmbH</strong><br>Ort, Datum &amp; Unterschrift Käufer<br><span style="font-size:7.5pt;">– Gewerbetreibender –</span></div></div>' +
      '<div class="footer">' + FUSS_ZEILE + '<br>Kaufvertrag Seite 1 von 2 · Erstellt am ' + heute() + '</div>' +
      '<div class="page-break">' + uebergabeSeite(a, 'Kaufvertrag Seite 2 von 2 – Fahrzeugübergabe-Protokoll') + '</div><!--DRUCK--></body></html>';
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
  }

  var angemeldet = false;
  function anmelden() {
    if (angemeldet) return true;
    var eg = window.EG;
    if (!eg || typeof eg.onTab !== 'function') return false;
    eg.onTab(TAB, render);
    angemeldet = true;
    return true;
  }
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
    GRENZE_EURO: GRENZE_EURO, KM_TOLERANZ: KM_TOLERANZ, _S: S
  };
})();
