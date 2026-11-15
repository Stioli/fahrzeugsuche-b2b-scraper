/* Stieber-App – Verkaufsablauf in 11 Phasen + Bereiche (window.VK_PHASEN)
   Stand 14.11.2026 (Entwurf VA1, ersetzt später die Live-Datei verkauf-phasen.js mit v1–v10).
   Quelle: Plan „Anpassungen Verkaufsablauf“ v2, Abschnitt 2 (Phasen), 3 (Entscheidungen) und 6 (113 Zeilen: P / o / –).
   Bauplan Verkaufsablauf v1: E1 (Speicher-Schlüssel bleiben), E2 (Ampel im Browser aus dieser Definition).
   Hier stehen Daten und die kleine Hilfsfunktion P(). Die Ampel rechnet verkauf-ampel.js.

   Aufbau
   - Phasen p01…p11 (Verkaufsablauf) und Bereiche a1_kunde, a1_lieferant (A1 Zahlungen), a2_anlieferung (A2 Transport).
   - Phase: { key, nr?, typ:'phase'|'bereich', name, wer (Anzeige: bei wem liegt die Arbeit), art:'bearbeiten'|'anzeige'|'freigabe',
              rollen:[…] (wer abhaken darf), vertretung?:[…] (Freigabe in Vertretung), entfaellbar?:bool, phaseQuelle?:[{phase,k:'_phase'}] (Knopf „Phase entfällt“),
              entfaelltWenn?:[Bedingung], transportAnzeigen?:bool (Transportstatus ohne Kosten einblenden), sperre?, warnWennNichtGruen?, hinweis?, punkte:[Punkt] }
   - Punkt:  { nr (Zeile in Plan v2 Abschnitt 6, Zahl oder Liste, null = zusätzlicher Punkt), k (Kennung in der Phase, eindeutig),
               text, pflicht:bool (P = true, o = false),
               quelle:[{phase,k,nurLesen?,okWerte?}]  … SPEICHER-SCHLÜSSEL wie heute (E1): phase = Wert in verkauf.punkt.phase
                                                         (v1…v10, nach_verkauf, zulassung, auslieferung, neu: p04, p09, p10, p11, a1_lieferant)
                                                         bzw. 'ac' für die Auslieferungs-Checkliste (verkauf.auslieferung_punkt).
               schreibeIn:{phase,k}|null … in diese Quelle schreibt die App beim Abhaken (erste nicht-Masterliste-Quelle),
               nurLesen:bool … true, wenn keine beschreibbare Quelle da ist (Masterliste-Punkte, solange der Import führt, Schritt 1a;
                              Felder aus bestand.*),
               datenquelle?:'bestand.tabelle.spalte' (Wert kommt aus bestand.*, wird nicht abgehakt), datenOk?:true|[Werte] (wann gilt die Datenquelle als erledigt),
               kontextFeld?:'name' (Ersatz, wenn der Aufrufer den Wert im Kontext statt in kontext.daten liefert),
               entfaelltWenn?:[Bedingung], wer?:'…' (überschreibt phase.wer in „was fehlt“), rollen?:[…] (überschreibt phase.rollen),
               und die bewährten Eigenschaften wie in der alten Datei: hinweis, foto, fotoPflicht, eingabe ('datum'|'betrag'|'text'|'auswahl'|'bestaetigung'),
               optionen, label, mehrzeilig, textBei, wertPflicht, keinEntfaellt, seg, segLabels, nurNachAllen, nokReicht, setzeUebergabetermin,
               setzeVerkaeufer, setzeBestellNr, spezial:'nachlass', gruppe:'ac', block }
   - Zusammengelegte Punkte haben mehrere Quellen: erledigt, wenn EINE Quelle ok ist; NOK, wenn eine Quelle NOK ist und keine ok.
     okWerte (an einer Quelle): die Quelle zählt nur als ok, wenn ihr Wert in der Liste steht (z. B. Zulassungsstatus „fertig“).
   - Bedingung (entfaelltWenn, Oder-Verknüpfung, die erste passende gewinnt, jeweils + grund):
       { phase, k, wert:'Nein' }              Speicher-Schlüssel ist ok und hat diesen Wert
       { phase, k, status:'ok'|'entfaellt' }  Speicher-Schlüssel hat diesen Status
       { phase, k, nichtIn:['Bar',…] }        Speicher-Schlüssel ist ok und der Wert steht NICHT in der Liste
       { kontext:'transportstatus', in:[…] }  Wert aus dem Kontext (z. B. Transportstatus, Zahlung, Abholung/Lieferung)
       { datenquelle:'bestand.einkauf.xyz', nichtWahr:true }  Datenfeld ist ausdrücklich false oder leer (null); fehlt es im Kontext, entfällt nichts
                                                              (Nachtrag 14.11.: 'verkauf.akte.zubehoer' → Zeile 78; 'bestand.fahrzeug.fehlteile' → p10 fehlt_zugesendet)
                                                              Datenquelle zusätzlich zum Haken (Oli 15.11.2026): 'verkauf.akte.evb_nr' → Zeile 35 eVB-Nummer (datenOk: true)
   Schlüssel-Konvention für NEUE Punkte (festgelegt 14.11.2026, das Datenbank-Paket richtet sich danach):
     p04.bewertung · p04.ankaufvertrag · p04.abloese_geklaert · p04.fahrzeug_eingegangen   (Inzahlungnahme neu)
     a1_lieferant.rechnung_geprueft                                                        (Lieferant neu; „Fahrzeug bezahlt“ kommt aus bestand.einkauf.lief_fzg_bezahlt, kein Haken)
     p09.freigabe_auslieferung                                                             (Freigabe Auslieferung)
     p10.kunde_zufrieden                                                                   (VA8: Kunde zufrieden? Ja/Nein; „Nein“ → Reklamation p11)
     p10.uebergabe_mail                                                                    (Übergabe-Mail mit Foto, Bewertungs- und Umfrage-Link)
     p10.fehlt_zugesendet · p10.name_fahrzeugannehmer                                      (Nachtrag Oli 14.11.: optional; lesend zusätzlich ac.ac_fehlt_zugesendet / ac.ac_name_fahrzeugannehmer)
     p11.bewertung_zugeordnet                                                              (bestätigte Zuordnung einer Bewertung zum Verkäufer)
   Ergänzend: window.VK_ENTFALLEN (Zeilen mit „–“ und nicht übernommene heutige Schlüssel, mit Begründung), window.VK_SYSTEM (_phase-Zeilen),
   window.VK_NEUE_SCHLUESSEL, window.VK_AC (Auslieferungs-Checkliste unverändert für den Reiter „Auslieferung“).
   Masterliste-Punkte (Phasen zulassung, auslieferung, nach_verkauf) sind in Schritt 1a nur lesbar (der Import überschreibt sonst). */
(function () {
  'use strict';
  var W = typeof window !== 'undefined' ? window : globalThis;

  var VERKAUF = ['verkauf', 'admin', 'dispo', 'buchhaltung'];   // Phasen 1–4, 10, 11
  var BUERO = ['admin', 'dispo', 'buchhaltung'];                // A1, A2, Phase 5 (mit Vertretung), 7, 8, 9
  var AC_ROLLEN = ['dispo', 'admin', 'werkstatt', 'buchhaltung'];   // Aufbereiter/Meister haken über werkstatt@ mit Namenseintrag ab
  var VERK = ['OS', 'NP', 'AI'];                                // Verkäufer-Kürzel (Lead Liste)
  var ML_PHASEN = ['zulassung', 'auslieferung', 'nach_verkauf'];   // kommen aus der Masterliste (Import)

  /* ---------- Hilfsfunktion: Punkt bauen ---------- */
  function qParse(s) {
    var o = typeof s === 'string' ? { q: s } : s, i = o.q.indexOf('.');
    var r = { phase: o.q.slice(0, i), k: o.q.slice(i + 1) };
    if (o.okWerte) r.okWerte = o.okWerte;
    if (ML_PHASEN.indexOf(r.phase) >= 0) r.nurLesen = true;
    return r;
  }
  function P(nr, k, text, pflicht, quellen, extra) {
    var q = (quellen || []).map(qParse), schreibe = null;
    q.forEach(function (x) { if (!schreibe && !x.nurLesen) schreibe = { phase: x.phase, k: x.k }; });
    var d = { nr: nr, k: k, text: text, pflicht: pflicht, quelle: q, schreibeIn: schreibe, nurLesen: !schreibe };
    Object.keys(extra || {}).forEach(function (e) { d[e] = extra[e]; });
    return d;
  }

  /* ---------- Auslieferungs-Checkliste (Texte wörtlich wie in der Fahrzeugakte-Vorlage, Stand 31.10.2026) ---------- */
  var AC_BLOECKE = [
    ['Außen', [['folien', 'Folien entfernen'], ['waesche', 'Außenwäsche'], ['motorraum', 'Motorraum & Motorhaube innen'], ['tankklappe', 'Tankklappe innen reinigen'],
      ['reifen_felgen', 'Reifen & Felgen'], ['kunststoff', 'Kunststoffteile aufarbeiten'], ['politur', 'Finish – Politur']]],
    ['Innenraum', [['sitzschoner', 'Sitzschoner & Papierfußmatte in Kfz legen'], ['umweltplakette', 'Alte Umweltplakette ggf. entfernen'],
      ['tuerfalze', 'Türfalze & Türrahmen & Innentüren reinigen + Kofferraumfalze'], ['saugen', 'Innenraum & Kofferraum aussaugen'], ['polster', 'Polsterreinigung'],
      ['himmel', 'Himmel reinigen'], ['scheiben_pano', 'Fensterscheiben & Panoramadach reinigen'], ['faecher', 'Ablagefächer & Mittelkonsole & Handschuhfach leeren & reinigen'],
      ['armaturen', 'Armaturenbrett reinigen'], ['fussmatten_sicherheitsset', 'Fußmatten & Sicherheitsset ggf. einlegen'], ['kopfstuetzen_gurte', 'Alle Kopfstützen nach unten machen, Sicherheitsgurte lösen']]],
    ['Technik', [['laden', 'Elektro- & PHEV-Fahrzeuge laden'], ['batterie', 'Batterie laden'], ['kraftstoff', '5 l Kraftstoff auffüllen – nur wenn Fahrzeug auf Reserve ist'],
      ['kennzeichenhalter', 'Kennzeichenhalter montieren'], ['oel', 'Motoröl prüfen'], ['kuehlmittel', 'Kühlflüssigkeit prüfen'], ['waschwasser', 'Scheibenwaschanlage auffüllen'],
      ['raeder_nachziehen', 'Räder nachziehen + Aufkleber in Fahrzeug'], ['reifendruck', 'Reifenluftdruck vorne / hinten'], ['service', 'Service-Intervall zurückstellen'],
      ['sprache', 'Sprache auf Deutsch umstellen'], ['bluetooth_navi', 'Alte Bluetooth-Verbindungen und Navi-Adressen entfernen'], ['rdks', 'RDKS-Programmierung prüfen'],
      ['raeder_reinigen', 'Winter-/Sommerräder (gebraucht) reinigen'], ['raeder_halle', 'Winter-/Sommerräder in Verkaufshalle stellen'], ['raeder_einlagern', 'Winter-/Sommerräder einlagern']]],
    ['Sonstiges', [['ichfreumich', '„Ich freu mich auf“ + Preisschild + CO2-Label in Kfz legen'], ['verkaufshalle', 'Verkauftes Fahrzeug nach Aufbereitung in Verkaufshalle'],
      ['fehlercode', 'Fehlercode auslesen / ausdrucken / in Akte speichern']]]
  ];
  function acExtra(key) {
    var e = {};
    if (key === 'reifendruck') { e.eingabe = 'text'; e.label = 'Druck vorne / hinten (bar)'; }
    if (key === 'kuehlmittel') { e.eingabe = 'text'; e.label = 'Frostschutz bis (°C)'; }
    if (key === 'fehlercode') { e.foto = true; e.hinweis = 'Ausdruck oder Foto des Fehlerspeichers anhängen.'; }
    return e;
  }
  // 1) VK_AC: unverändert wie heute (Reiter „Auslieferung“ nutzt sie, dort sind alle Punkte Pflicht)
  var acAlt = [];
  AC_BLOECKE.forEach(function (b) {
    b[1].forEach(function (p) {
      var def = { k: 'ac_' + p[0], text: p[1], pflicht: true, gruppe: 'ac', block: b[0], rollen: AC_ROLLEN };
      var ex = acExtra(p[0]); Object.keys(ex).forEach(function (x) { def[x] = ex[x]; });
      acAlt.push(def);
    });
  });
  var ENDE = [
    { k: 'ac_end_aufbereiter', text: 'Aufbereiter bestätigt (Name, Datum)', rollen: AC_ROLLEN, wer: 'Aufbereiter' },
    { k: 'ac_end_meister', text: 'Meister bestätigt (Name, Datum)', rollen: AC_ROLLEN, wer: 'Meister' },
    { k: 'ac_end_verkaeufer', text: 'Verkäufer bestätigt (Name, Datum)', rollen: ['verkauf', 'dispo', 'admin', 'buchhaltung'], wer: 'Verkauf' }
  ];
  ENDE.forEach(function (e) {
    acAlt.push({ k: e.k, text: e.text, pflicht: true, gruppe: 'ac', block: 'Endkontrolle', eingabe: 'bestaetigung', rollen: e.rollen, keinEntfaellt: true, seg: ['ok', 'nok'] });
  });
  W.VK_AC = { punkte: acAlt, bloecke: AC_BLOECKE.map(function (b) { return b[0]; }).concat('Endkontrolle'), rollen: AC_ROLLEN };

  // 2) die Checklisten-Punkte für Phase 7: Zeile 80 = optional (Arbeitsliste), „Ich freu mich auf“ gehört zu Zeile 99 (Phase 10)
  var acPhase7 = [];
  AC_BLOECKE.forEach(function (b) {
    b[1].forEach(function (p) {
      if (p[0] === 'ichfreumich') return;
      var ex = acExtra(p[0]); ex.gruppe = 'ac'; ex.block = b[0]; ex.rollen = AC_ROLLEN; ex.wer = 'Aufbereiter';
      acPhase7.push(P(80, 'ac_' + p[0], p[1], false, ['ac.ac_' + p[0]], ex));
    });
  });
  var acEnde = ENDE.map(function (e, i) {
    return P(81 + i, e.k, e.text, true, ['ac.' + e.k], { gruppe: 'ac', block: 'Endkontrolle', eingabe: 'bestaetigung', rollen: e.rollen, keinEntfaellt: true, seg: ['ok', 'nok'], wer: e.wer });
  });

  /* ---------- Bedingungen, die mehrfach vorkommen ---------- */
  var KEIN_INZ = { phase: 'v2', k: 'inzahlung', wert: 'Nein', grund: 'Keine Inzahlungnahme' };
  var KEINE_FIN = { phase: 'v2', k: 'finanzierung', wert: 'Nein', grund: 'Keine Finanzierung gewünscht' };
  var KEINE_PROBEFAHRT = { phase: 'v2', k: 'probefahrt', wert: 'Nein', grund: 'Kunde wünscht keine Probefahrt' };
  var ABHOLUNG = { phase: 'v5', k: 'abholung_lieferung', wert: 'Abholung', grund: 'Kunde holt ab' };
  var IM_HAUS = { kontext: 'transportstatus', in: ['5 im Haus'], grund: 'Fahrzeug ist schon im Haus' };
  var OHNE_ZULASSUNG = { phase: 'zulassung', k: 'zulassung_status', wert: 'ohne', grund: 'Fahrzeug wird ohne Zulassung übergeben' };
  var KEIN_EK_FIN = { datenquelle: 'bestand.einkauf.ek_finanzierung', nichtWahr: true, grund: 'Kein einfinanzierter Lagerwagen' };
  var ERGEBNIS_ABSCHLUSS = ['Weiter zum Angebot', 'Bedenkzeit', 'Kein Kauf'];

  W.VK_PHASEN = [
    /* ============ 1 Anfrage ============ */
    {
      key: 'p01', nr: 1, typ: 'phase', name: 'Anfrage', wer: 'Verkauf (automatisch aus der Anfrage)', art: 'bearbeiten', rollen: VERKAUF, entfaellbar: true,
      phaseQuelle: [{ phase: 'v1', k: '_phase' }], transportAnzeigen: true,
      hinweis: 'Kommt der Kunde ohne Anfrage direkt ins Haus, lass die ganze Phase mit Grund entfallen. Anfrage und Verkäufer kommen automatisch aus der Lead-Liste.',
      punkte: [
        P(1, 'anfrage_da', 'Anfrage ist da (Kanal, Fahrzeug, Zeit)', true, ['v1.anfrage_da'], { eingabe: 'auswahl', label: 'Kanal', optionen: ['mobile.de', 'AutoScout24', 'Kleinanzeigen', 'Website', 'Google', 'Telefon', 'WhatsApp', 'Persönlich', 'Sonstiges'] }),
        P(2, 'verkaeufer_zugeteilt', 'Verkäufer zugeteilt', true, ['v1.verkaeufer_zugeteilt'], { eingabe: 'auswahl', label: 'Verkäufer', optionen: VERK, setzeVerkaeufer: true, rollen: BUERO, wer: 'OS, Dispo, Buchhaltung (nach dem Anlegen)',
          hinweis: 'Beim Anlegen der Akte darf jeder den Verkäufer setzen. Ändern dürfen danach nur OS, Dispo und Buchhaltung (Provision).' }),
        P(3, 'kunde_angerufen', 'Kunde angerufen', false, ['v1.kunde_angerufen'], { eingabe: 'auswahl', label: 'Ergebnis des Anrufs', optionen: ['erreicht', 'nicht erreicht'] }),
        P(4, 'whatsapp', 'Nicht erreicht: WhatsApp mit einer Frage gesendet (Entwurf von Claude)', false, ['v1.whatsapp'],
          { entfaelltWenn: [{ phase: 'v1', k: 'kunde_angerufen', wert: 'erreicht', grund: 'Kunde wurde erreicht' }] }),
        P(5, 'antwort_mail', 'Antwort-Mail gesendet (Entwurf von Claude, du gibst frei)', false, ['v1.antwort_mail']),
        P(6, 'termin_vereinbart', 'Termin vereinbart (Beratung oder Probefahrt)', false, ['v1.termin_vereinbart'],
          { eingabe: 'datum', label: 'Termin am', hinweis: 'Kein Termin möglich? Dann „entfällt“ mit Grund – es folgt der Nachkontakt.' }),
        P(7, 'termin_bestaetigung', 'Terminbestätigung gesendet', false, ['v1.termin_bestaetigung'],
          { entfaelltWenn: [{ phase: 'v1', k: 'termin_vereinbart', status: 'entfaellt', grund: 'Kein Termin vereinbart' }] }),
        P(8, 'erinnerung_vortag', 'Erinnerung am Vortag gesendet', false, ['v1.erinnerung_vortag'],
          { entfaelltWenn: [{ phase: 'v1', k: 'termin_vereinbart', status: 'entfaellt', grund: 'Kein Termin vereinbart' }] }),
        P(9, 'nachkontakt', 'Kein Termin: Nachkontakt gemacht', false, ['v1.nachkontakt'],
          { entfaelltWenn: [{ phase: 'v1', k: 'termin_vereinbart', status: 'ok', grund: 'Termin ist vereinbart' }] }),
        P(10, 'ergebnis', 'Ergebnis der Anfrage', false, ['v1.ergebnis'], { eingabe: 'auswahl', label: 'Ergebnis', optionen: ['Termin steht', 'Nachkontakt läuft', 'Kein Interesse'], textBei: ['Kein Interesse'] })
      ]
    },
    /* ============ 2 Verkaufsgespräch (heute v2 + v3 + v4) ============ */
    {
      key: 'p02', nr: 2, typ: 'phase', name: 'Verkaufsgespräch', wer: 'Verkauf', art: 'bearbeiten', rollen: VERKAUF, entfaellbar: true,
      phaseQuelle: [{ phase: 'v2', k: '_phase' }, { phase: 'v3', k: '_phase' }, { phase: 'v4', k: '_phase' }], transportAnzeigen: true,
      hinweis: 'Zugaben bis 300 € darfst du selbst geben. Einen Nachlass entscheidet nur Oli.',
      punkte: [
        P(11, 'kunde_da', 'Kunde ist da', false, ['v2.kunde_da'], { eingabe: 'auswahl', label: 'Kunde kam', optionen: ['mit Termin', 'ohne Termin'] }),
        P(12, 'kundendaten', 'Kundendaten aufgenommen', true, ['v2.kundendaten']),
        P(13, 'bedarf', 'Bedarf besprochen', false, ['v2.bedarf'], { eingabe: 'text', label: 'Bedarf (kurz)', mehrzeilig: true }),
        P(14, 'fahrzeug_gezeigt', 'Fahrzeug gezeigt', false, ['v2.fahrzeug_gezeigt']),
        P(15, 'inzahlung', 'Inzahlungnahme? Wenn ja: im Reiter Inzahlungnahmen erfassen', true, ['v2.inzahlung'], { eingabe: 'auswahl', label: 'Inzahlungnahme', optionen: ['Ja', 'Nein'], hinweis: 'Bei „Nein“ entfällt die Phase Inzahlungnahme von selbst.' }),
        P(16, 'finanzierung', 'Finanzierung gewünscht?', true, ['v2.finanzierung'], { eingabe: 'auswahl', label: 'Finanzierung', optionen: ['Ja', 'Nein'], hinweis: 'Bei „Nein“ entfallen die Finanzierungspunkte in „Unterlagen“.' }),
        P(17, 'probefahrt', 'Probefahrt gewünscht?', true, ['v2.probefahrt'], { eingabe: 'auswahl', label: 'Probefahrt', optionen: ['Ja', 'Nein'], hinweis: 'Bei „Nein“ entfallen die Probefahrt-Punkte von selbst.' }),
        P(18, 'fuehrerschein', 'Probefahrt: Führerschein geprüft (Foto)', true, ['v3.fuehrerschein'], { foto: true, fotoPflicht: true, entfaelltWenn: [KEINE_PROBEFAHRT] }),
        P(19, 'ausweis_probefahrt', 'Probefahrt: Ausweis geprüft (Foto)', true, ['v3.ausweis'], { foto: true, fotoPflicht: true, entfaelltWenn: [KEINE_PROBEFAHRT] }),
        P(20, 'vertrag', 'Probefahrt-Vertrag unterschrieben', true, ['v3.vertrag'], { foto: true, entfaelltWenn: [KEINE_PROBEFAHRT] }),
        P(21, 'kennzeichen_versicherung', 'Probefahrt: Kennzeichen und Versicherung geprüft', true, ['v3.kennzeichen_versicherung'], { eingabe: 'text', label: 'Kennzeichen', wertPflicht: true, entfaelltWenn: [KEINE_PROBEFAHRT] }),
        // Zeile 22 „km/Tank vorher + nachher“ = ZWEI Eingaben (vorher, nachher), beide Pflicht. Je ein Punkt, damit jede Eingabe ihr Feld behält (Annahme, siehe Prüfliste).
        P(22, 'km_vorher', 'Probefahrt: km-Stand und Tankstand vorher', true, ['v3.km_vorher'], { eingabe: 'text', label: 'km und Tank vorher', wertPflicht: true, entfaelltWenn: [KEINE_PROBEFAHRT] }),
        P(22, 'km_nachher', 'Probefahrt: km-Stand nachher, keine Schäden', true, ['v3.km_nachher'], { eingabe: 'text', label: 'km nachher', wertPflicht: true, foto: true, entfaelltWenn: [KEINE_PROBEFAHRT] }),
        P(23, 'verkaeufer_faehrt_mit', 'Probefahrt: Verkäufer fährt mit', false, ['v3.verkaeufer_faehrt_mit'], { entfaelltWenn: [KEINE_PROBEFAHRT] }),
        P(24, 'eindruck', 'Probefahrt: Eindruck des Kunden notiert', false, ['v3.eindruck'], { eingabe: 'text', label: 'Eindruck', wertPflicht: true, mehrzeilig: true, entfaelltWenn: [KEINE_PROBEFAHRT] }),
        P(25, 'angebot', 'Angebot erstellt (Fahrzeug, Zubehör, Zulassung, Lieferung)', true, ['v4.angebot'], { eingabe: 'betrag', label: 'Angebotssumme in €' }),
        P(26, 'zugaben', 'Zugaben bis 300 € vereinbart', true, ['v4.zugaben'], { eingabe: 'betrag', label: 'Wert der Zugaben in €', hinweis: 'Keine Zugaben? Dann „entfällt“ mit Grund. Zubehör in der Akte eintragen (Feld Zubehör).' }),
        P(27, 'nachlass', 'Nachlass: Freigabe durch Oli in der App', true, ['v4.nachlass'], { spezial: 'nachlass', seg: ['entfaellt'], segLabels: { entfaellt: 'Kein Nachlass' },
          hinweis: 'Nachlass beantragst du hier, Oli gibt ihn frei. Gibt es keinen Nachlass: „Kein Nachlass“ (zählt als erledigt).', wer: 'Verkauf, OS (Freigabe)' }),
        P(28, 'angebot_uebergeben', 'Angebot dem Kunden übergeben', false, ['v4.angebot_uebergeben']),
        // Zeile 29: ein Ergebnis statt drei (Beratung, Probefahrt, Angebot). Geschrieben wird in v2.ergebnis, gezählt wird jede der drei Quellen.
        P(29, 'ergebnis', 'Ergebnis des Verkaufsgesprächs', true, ['v2.ergebnis', 'v3.ergebnis', 'v4.ergebnis'],
          { eingabe: 'auswahl', label: 'Ergebnis', optionen: ERGEBNIS_ABSCHLUSS, textBei: ['Kein Kauf'] })
      ]
    },
    /* ============ 3 Unterlagen (heute v5 + Finanzierung aus v4 + Masterliste) ============ */
    {
      key: 'p03', nr: 3, typ: 'phase', name: 'Unterlagen', wer: 'Verkauf', art: 'bearbeiten', rollen: VERKAUF, transportAnzeigen: true,
      punkte: [
        P(30, 'bestellung_autrado', 'Bestellung in Autrado erstellt', true, ['v5.bestellung_autrado'], { eingabe: 'text', label: 'Bestell-Nr. (z. B. 2610-12345)', wertPflicht: true, setzeBestellNr: true }),
        P(31, 'unterschrieben', 'Bestellung vom Kunden unterschrieben', true, ['v5.unterschrieben'], { foto: true }),
        P(32, 'zahlungsart', 'Zahlungsart festgelegt', true, ['v5.zahlungsart'], { eingabe: 'auswahl', label: 'Zahlungsart', optionen: ['Überweisung', 'Finanzierung', 'Bar', 'Gemischt'], hinweis: 'Bar ab 10.000 € nur mit Geldwäsche-Bogen (GwG).' }),
        P(33, 'anzahlung', 'Anzahlung vereinbart', true, ['v5.anzahlung'], { eingabe: 'betrag', label: 'Anzahlung in €', hinweis: 'Keine Anzahlung? Dann „entfällt“ mit Grund.' }),
        P(34, 'zul_ausweis', 'Ausweis (Kopie/Foto)', true, ['v5.zul_ausweis', 'nach_verkauf.ausweis_kopiert'], { foto: true }),
        P(35, 'zul_evb', 'eVB-Nummer', true, ['v5.zul_evb'], { eingabe: 'text', label: 'eVB-Nummer', wertPflicht: true, datenquelle: 'verkauf.akte.evb_nr', datenOk: true,
          hinweis: 'Zählt auch als erledigt, wenn die eVB-Nummer schon in der Akte steht (Entscheidung Oli 15.11.2026).' }),
        P(36, 'zul_sepa', 'SEPA-Mandat', true, ['v5.zul_sepa'], { foto: true }),
        P(37, 'zul_vollmacht', 'Vollmacht', true, ['v5.zul_vollmacht'], { foto: true }),
        P(38, 'zul_wunschkennzeichen', 'Wunschkennzeichen', false, ['v5.zul_wunschkennzeichen'], { eingabe: 'text', label: 'Wunschkennzeichen' }),
        P(39, 'datenschutz', 'Datenschutz-Einwilligung unterschrieben (Vorlage 71)', true, ['v2.datenschutz', 'v5.datenschutz_nachholen', 'v9.datenschutz_uebergabe'], { foto: true }),
        P(40, 'fin_gerechnet', 'Finanzierung gerechnet (Openbank)', false, ['v4.fin_gerechnet'], { entfaelltWenn: [KEINE_FIN] }),
        P(41, 'fin_antrag', 'Finanzierungsantrag gestellt: Zusage oder Ablehnung', true, ['v4.fin_antrag'], { eingabe: 'auswahl', label: 'Entscheidung der Bank', optionen: ['Zusage', 'Ablehnung'], entfaelltWenn: [KEINE_FIN] }),
        P(42, 'finanzierungsunterlagen_pruefen', 'Finanzierungsunterlagen geprüft', true,
          [{ q: 'nach_verkauf.finanzierungsunterlagen_pruefen', okWerte: ['Vollständig', 'Hat keine'] }], { entfaelltWenn: [KEINE_FIN], hinweis: 'Kommt aus der Masterliste (Dispo).' }),
        P(43, 'abholung_lieferung', 'Abholung oder Lieferung', true, ['v5.abholung_lieferung'], { eingabe: 'auswahl', label: 'Übergabe', optionen: ['Abholung', 'Lieferung'] }),
        P(44, 'wunschtermin', 'Wunschtermin des Kunden', true, ['v5.wunschtermin'], { eingabe: 'datum', label: 'Wunschtermin', setzeUebergabetermin: true }),
        P(45, 'auftragsbestaetigung_kunde', 'Auftragsbestätigung an den Kunden (Mail in OneDrive)', true, ['nach_verkauf.auftragsbestaetigung_kunde', 'nach_verkauf.auftragsbest_mail_onedrive'], { hinweis: 'Kommt aus der Masterliste (Dispo).' }),
        P(46, 'claude_eintraege', 'Claude: Masterliste, Lead Liste, Börsen/ONLINE aus, Akte angelegt', true, ['v5.claude_eintraege'], { hinweis: 'Nach dem Umschalten (1b) ohne Masterliste.' })
      ]
    },
    /* ============ 4 Inzahlungnahme (neu gruppiert, 4 neue Punkte) ============ */
    {
      key: 'p04', nr: 4, typ: 'phase', name: 'Inzahlungnahme', wer: 'Verkauf', art: 'bearbeiten', rollen: VERKAUF, entfaelltWenn: [KEIN_INZ],
      hinweis: 'Entfällt ohne Inzahlungnahme. Du siehst und pflegst hier Ankaufspreis und Ablösebetrag; die Ablöse-Überweisung steht im Bereich Zahlungen.',
      punkte: [
        P(48, 'bewertung', 'Bewertung des Inzahlungnahme-Fahrzeugs gemacht', true, ['p04.bewertung']),
        P(49, 'ankaufvertrag', 'Ankaufvertrag unterschrieben', true, ['p04.ankaufvertrag'], { foto: true }),
        P(50, 'inz_verrechnet', 'Wert der Inzahlungnahme verrechnet', true, ['v4.inz_verrechnet'], { eingabe: 'betrag', label: 'Inzahlungnahme-Wert in €' }),
        P(51, 'abloese_geklaert', 'Ablöse geklärt (Bank, Betrag)', true, ['p04.abloese_geklaert'], { eingabe: 'text', label: 'Bank und Ablösebetrag', hinweis: 'Keine Ablöse? Dann „entfällt“ mit Grund.' }),
        P(52, 'fahrzeug_eingegangen', 'Inzahlungnahme-Fahrzeug eingegangen', true, ['p04.fahrzeug_eingegangen'])
      ]
    },
    /* ============ 5 Freigabe Verkauf OS (heute v6) ============ */
    {
      key: 'p05', nr: 5, typ: 'phase', name: 'Freigabe Verkauf OS', wer: 'OS (Vertretung: Dispo, Buchhaltung)', art: 'freigabe', rollen: BUERO, vertretung: ['dispo', 'buchhaltung'],
      vertretungText: 'Freigabe in Vertretung durch …',
      hinweis: 'OS prüft anhand der Übersicht Vollständigkeit und gibt frei. Dispo und Buchhaltung dürfen vertreten; die App zeigt „Freigabe in Vertretung durch …“, der Fall erscheint im Cockpit.',
      punkte: [
        P(54, 'freigabe', 'Freigabe Verkauf durch OS (oder Rückfrage)', true, ['v6.freigabe'], { keinEntfaellt: true, nokReicht: true, seg: ['ok', 'nok'],
          segLabels: { ok: 'Freigeben', nok: 'Rückfrage' }, hinweis: 'Bei „Rückfrage“ schreibst du die Frage als Grund. Punkte mit NOK (z. B. eVB fehlt) gelten als geprüft – du kannst trotzdem freigeben, sie bleiben rot, bis sie nachgeholt sind.' })
      ]
    },
    /* ============ 6 Zahlungsstand (nur Anzeige) ============ */
    {
      key: 'p06', nr: 6, typ: 'phase', name: 'Zahlungsstand', wer: 'Dispo, Buchhaltung (in „Zahlungen“)', art: 'anzeige', rollen: BUERO,
      hinweis: 'Nur der Stand: bezahlt, teilweise oder offen. Einzelheiten sieht nur das Büro im Bereich Zahlungen.',
      punkte: [
        P(null, 'zahlungsstand', 'Kunde hat voll bezahlt', true, [], { datenquelle: 'bestand.zahlung.kd_geldeingang', kontextFeld: 'zahlung', datenOk: ['bezahlt', 'komplett erhalten'], zusatz: true,
          hinweis: 'Kommt aus bestand.zahlung (Kd-Geldeingang); der Verkäufer sieht nur bezahlt / teilweise / offen.' })
      ]
    },
    /* ============ 7 Stand Aufbereitung & Werkstattarbeiten (heute v8, Anzeige) ============ */
    {
      key: 'p07', nr: 7, typ: 'phase', name: 'Aufbereitung und Werkstatt', wer: 'Werkstatt, Aufbereiter, Dispo', art: 'anzeige', rollen: BUERO, transportAnzeigen: true,
      hinweis: 'Für den Verkäufer nur Anzeige. Die Checkliste haken Aufbereiter und Meister über werkstatt@ mit Namenseintrag ab.',
      punkte: [
        P(75, 'repdoc_kunde', 'Kunde in Repdoc vorhanden oder angelegt (inkl. DSGVO)', true, ['v8.repdoc_kunde', 'nach_verkauf.kd_repdoc_dsgvo'], { eingabe: 'text', label: 'Kundennummer Repdoc' }),
        P(76, 'repdoc_fahrzeug', 'Fahrzeug in Repdoc vorhanden oder angelegt', true, ['v8.repdoc_fahrzeug'], { eingabe: 'text', label: 'Fahrzeug in Repdoc (Nr.)' }),
        P(77, 'auftrag', 'Interner Auftrag mit Arbeiten angelegt (z. B. Winterräder bestellen/montieren, Sommerräder einlagern, Durchsicht, Batterie laden, Zubehör/Zugaben)', true,
          ['v8.auftrag', 'nach_verkauf.int_auftrag_erstellt'], { eingabe: 'text', label: 'Auftragsnummer' }),
        P(78, 'tuz_bestellt', 'Teile und Zubehör bestellt', true, ['nach_verkauf.tuz_bestellt'],
          { entfaelltWenn: [{ datenquelle: 'verkauf.akte.zubehoer', nichtWahr: true, grund: 'In der Akte ist kein Zubehör eingetragen' }],
            hinweis: 'Pflicht nur, wenn in der Akte (Feld Zubehör) etwas eingetragen ist; sonst entfällt der Punkt von selbst (kommt aus der Masterliste).' }),
        P(79, 'arbeiten_erledigt', 'Arbeiten erledigt', true, ['v8.arbeiten_erledigt'])
      ].concat(acPhase7, acEnde)
    },
    /* ============ 8 Stand Zulassung (nur Masterliste, Anzeige) ============ */
    {
      key: 'p08', nr: 8, typ: 'phase', name: 'Zulassung', wer: 'Dispo', art: 'anzeige', rollen: BUERO, entfaelltWenn: [OHNE_ZULASSUNG],
      hinweis: 'Für den Verkäufer nur Anzeige. Entfällt, wenn das Fahrzeug ohne Zulassung übergeben wird.',
      punkte: [
        P(84, 'zulassungsunterlagen_pruefen', 'Zulassungsunterlagen geprüft', true, ['zulassung.zulassungsunterlagen_pruefen']),
        P(85, 'zulassungsdienst', 'Zulassungsdienst beauftragt (ZB II aus Tresor, COC, Vollmacht, eVB, SEPA)', true, ['v8.zulassungsdienst'], { eingabe: 'auswahl', label: 'Dienst',
          optionen: ['Fa. Zeidan (Mail)', 'Kroschke (online)'], hinweis: 'Fa. Zeidan per E-Mail für Stuttgart, Ludwigsburg, Böblingen und Esslingen. Weiter weg: Kroschke über deren Online-Seite.' }),
        P(86, 'zugelassen', 'Zugelassen, Kennzeichen da', true, ['v8.zugelassen', { q: 'zulassung.zulassung_status', okWerte: ['fertig'] }]),
        P(87, 'kennz_emissionen_repdoc', 'Kennzeichen und Emissionen in Repdoc eingetragen', true, ['zulassung.kennz_emissionen_repdoc']),
        P(88, 'zlb_onedrive', 'ZB I + II in OneDrive gespeichert', true, ['zulassung.zlb_onedrive']),
        P(89, 'fsp_aek', 'FSP geschrieben und in AÜK eingetragen', true, ['zulassung.fsp_aek'], { hinweis: '„Nicht nötig weil E“ zählt als erledigt.' }),
        P(90, 'kennz_fsp_an_verkaeufer', 'Kennzeichen und FSP an den Verkäufer', true, ['zulassung.kennz_fsp_an_verkaeufer']),
        P(91, 'zlb_coc_an_bank', 'ZB II + COC an die Bank', true, ['zulassung.zlb_coc_an_bank'], { entfaelltWenn: [KEINE_FIN] }),
        P(92, 'kopie_zlb_an_lieferant', 'Kopie ZB I + II an den Lieferanten (wenn nötig)', false, ['zulassung.kopie_zlb_an_lieferant'])
      ]
    },
    /* ============ 9 Freigabe Auslieferung (neu) ============ */
    {
      key: 'p09', nr: 9, typ: 'phase', name: 'Freigabe Auslieferung', wer: 'OS, Dispo, Buchhaltung', art: 'freigabe', rollen: BUERO, transportAnzeigen: true,
      sperre: { typ: 'zahlung', bedingung: { kontext: 'zahlung', in: ['bezahlt'] }, aufhebenRollen: BUERO, grundPflicht: true,
        text: 'Die Zahlung ist noch nicht voll eingegangen. Freigabe erst danach – oder mit Aufhebung der Sperre durch OS, Dispo oder Buchhaltung (Pflicht-Grund, Name und Zeit werden gespeichert).' },
      warnWennNichtGruen: ['p07', 'p08', 'a2_anlieferung'],
      hinweis: 'Voll bezahlt ist die Sperre. Sind Aufbereitung, Zulassung oder Transport noch nicht grün, ist die Freigabe mit Pflicht-Grund trotzdem möglich.',
      punkte: [
        P(94, 'freigabe_auslieferung', 'Freigabe Auslieferung (OS, Dispo oder Buchhaltung)', true, ['p09.freigabe_auslieferung'], { keinEntfaellt: true, seg: ['ok', 'nok'],
          segLabels: { ok: 'Freigeben', nok: 'Rückfrage' }, hinweis: 'Bei offenen Punkten in Aufbereitung, Zulassung oder Transport verlangt die App einen Grund.' })
      ]
    },
    /* ============ 10 Vorbereitung & Auslieferung (heute v8-Rest, v9 + Masterliste) ============ */
    {
      key: 'p10', nr: 10, typ: 'phase', name: 'Vorbereitung und Auslieferung', wer: 'Verkauf, Dispo', art: 'bearbeiten', rollen: VERKAUF, transportAnzeigen: true,
      hinweis: 'Übergabe: Fahrzeug mit dem Kunden durchgehen, Papiere übergeben, Zufriedenheit erfragen, um eine Bewertung bitten (ohne Sternezahl), Foto Kunde mit Fahrzeug, dann die Übergabe-Mail.',
      punkte: [
        P(95, 'transport', 'Lieferung zum Kunden: Transport gebucht', true, ['v8.transport'], { rollen: BUERO, wer: 'Dispo (im Bereich Transport)', entfaelltWenn: [ABHOLUNG],
          hinweis: 'Wird im Bereich Transport gepflegt.' }),
        P(96, 'uebergabetermin', 'Übergabetermin festgelegt (→ Masterliste)', true, ['v8.uebergabetermin'], { eingabe: 'datum', label: 'Übergabe am', setzeUebergabetermin: true, rollen: VERKAUF, wer: 'Verkauf oder Dispo' }),   // Oli 15.11.: Verkäufer darf den Übergabetermin setzen
        P(97, 'bereit', 'Fahrzeug bereit', true, ['v8.bereit'], { rollen: BUERO, wer: 'Dispo', keinEntfaellt: true, seg: ['ok'], segLabels: { ok: 'Bereit' } }),   // nurNachAllen entfällt: Phase 10 enthält auch die Übergabe selbst
        P(98, 'car_garantie', 'Garantie abgeschlossen', true, [{ q: 'nach_verkauf.car_garantie', okWerte: ['Ja', 'Nein, hat keine', 'Über SCB'] }], { hinweis: '„Hat keine“ zählt als erledigt (kommt aus der Masterliste).' }),
        P(99, 'schild_co2_label', '„Ich freu mich auf“-Schild + CO2-Label in Kfz gelegt (Pkw-EnVKV)', true, ['auslieferung.schild_co2_label', 'ac.ac_ichfreumich'], { rollen: AC_ROLLEN, wer: 'Aufbereiter, Dispo' }),
        P(100, 'einweisung', 'Einweisung gemacht', false, ['v9.einweisung']),
        P(101, 'unterlagen', 'Unterlagen übergeben (ZB I, Rechnung „bezahlt“, COC, Serviceheft, Schlüssel)', true, ['v9.unterlagen']),
        P(102, 'uebergabeprotokoll', 'Übergabeprotokoll unterschrieben (Vorlage 72)', true, ['v9.uebergabeprotokoll', 'auslieferung.uebergabeprotokoll_autrado'], { foto: true, fotoPflicht: true }),
        P(103, 'eu_mitteilung', 'EU-Mitteilung (nur bei EU-Fahrzeug)', true, ['v9.eu_mitteilung'], { hinweis: 'Kein EU-Fahrzeug? Dann „entfällt“ mit Grund.' }),
        P(104, 'uebergabefotos', 'Übergabefoto: Kunde mit Fahrzeug', true, ['v9.uebergabefotos'], { foto: true, fotoPflicht: true, hinweis: 'Will der Kunde kein Foto? Dann „entfällt“ mit Grund. Mündliches Ja reicht nur für die Mail an ihn.' }),
        // VA8 (15.11.2026): Zufriedenheit bei der Übergabe. Beim Speichern ruft die App VK_UEBERGABE.nachZufriedenheit(akte, wert) auf: „Nein“ öffnet die Reklamation in Phase 11 (NOK + roter Punkt).
        P(null, 'kunde_zufrieden', 'Kunde zufrieden? (bei „Nein“ öffnet sich die Reklamation in Phase 11)', true, ['p10.kunde_zufrieden'],
          { eingabe: 'auswahl', label: 'Zufrieden mit Fahrzeug und Ablauf?', optionen: ['Ja', 'Nein'], keinEntfaellt: true,
            hinweis: 'Frag den Kunden bei der Übergabe offen. „Nein“ legt die Reklamation automatisch an, Oli sieht sie im Cockpit.' }),
        P(105, 'uebergabe_mail', 'Mail mit Foto, Bewertungs- und Umfrage-Link gesendet (Entwurf von Claude, du fügst das Foto ein)', true, ['p10.uebergabe_mail'],
          { hinweis: 'An jeden Kunden, der einverstanden ist. Ohne Einverständnis: „entfällt“ mit Grund.' }),
        P(106, 'standort_kunde', 'Masterliste: Standort „Kunde“ eingetragen', true, ['v9.standort_kunde'], { hinweis: 'Nach dem Umschalten (1b) automatisch.' }),
        // Oli 14.11.2026: zwei Punkte der Masterliste-Checkliste kommen optional in die Übergabe. Gespeichert wird in verkauf.punkt (Phase p10),
        // weil verkauf.auslieferung_punkt für die Rolle verkauf gesperrt ist (nur Endkontrolle Verkäufer). Der alte ac_*-Schlüssel bleibt als zweite (lesende) Quelle.
        P(null, 'fehlt_zugesendet', 'Fehlteile dem Kunden nachgeschickt', false, ['p10.fehlt_zugesendet', 'ac.ac_fehlt_zugesendet'],
          { entfaelltWenn: [{ datenquelle: 'bestand.fahrzeug.fehlteile', nichtWahr: true, grund: 'Am Fahrzeug sind keine Fehlteile eingetragen' }],
            hinweis: 'Nur wenn am Fahrzeug Fehlteile eingetragen sind; sonst entfällt der Punkt von selbst.' }),
        P(null, 'name_fahrzeugannehmer', 'Name des Fahrzeugannehmers', false, ['p10.name_fahrzeugannehmer', 'ac.ac_name_fahrzeugannehmer'],
          { eingabe: 'text', label: 'Name Fahrzeugannehmer', hinweis: 'Wer das Fahrzeug bei der Übergabe annimmt (Kunde oder Abholer).' })
      ]
    },
    /* ============ 11 Nachkontakt & Bewertung (heute v10, Rest v9) ============ */
    {
      key: 'p11', nr: 11, typ: 'phase', name: 'Nachkontakt und Bewertung', wer: 'Verkauf', art: 'bearbeiten', rollen: VERKAUF,
      punkte: [
        P(108, 'gutschein_einlagerung', 'Werkstatt-Gutschein und Rädereinlagerung (6 Monate) eingetragen', true, ['v9.gutschein_einlagerung']),
        P(109, 'erinnerungen', 'Erinnerungen eingerichtet (HU, Kundendienst, Ende Einlagerung)', true, ['v10.erinnerungen'], { hinweis: 'Nur mit Einwilligung. Ohne: „entfällt“ mit Grund.' }),
        P(110, 'nachfrage', 'Nachfrage nach 1–2 Wochen gemacht', true, ['v10.nachfrage']),
        P(111, 'bewertung_da', 'Bewertung ist da (wird dem Verkäufer der Akte zugeordnet, Provision)', false, ['v10.bewertung_da', 'nach_verkauf.bewertung_erhalten', 'p11.bewertung_zugeordnet'],
          { hinweis: 'Die Zuordnung zum Verkäufer bestätigen Dispo oder Buchhaltung in der App.' }),
        P(112, 'reklamation', 'Reklamation? (bis 200 € Werkstatt, darüber Oli)', false, ['v10.reklamation'], { eingabe: 'text', label: 'Worum geht es?', mehrzeilig: true,
          hinweis: 'Offene Reklamation: „NOK“ mit Grund. Sie öffnet sich automatisch, wenn der Kunde bei der Übergabe nicht zufrieden war. Gibt es keine, lass den Punkt offen.' }),
        P(113, 'akte_abgeschlossen', 'Akte abgeschlossen (→ Nachkalkulation)', true, ['v10.akte_abgeschlossen'], { keinEntfaellt: true, nurNachAllen: true, seg: ['ok'], segLabels: { ok: 'Abgeschlossen' } })
      ]
    },
    /* ============ A1 Zahlungen: Kunde ============ */
    {
      key: 'a1_kunde', typ: 'bereich', name: 'Zahlungen Kunde', wer: 'Dispo, Buchhaltung', art: 'bearbeiten', rollen: BUERO,
      hinweis: 'Eigener Reiter. Der Verkäufer sieht nur den Zahlungsstand (Phase 6). Die Sperre liegt in der Datenbank.',
      punkte: [
        P(55, 'repdoc_rechnung', 'Rechnung in Repdoc erstellt (Handelsakte → „den Verkauf durchführen“)', true, ['v7.repdoc_rechnung', 'nach_verkauf.repdoc_rechnung_erstellt'], { eingabe: 'text', label: 'Rechnungsnummer Repdoc',
          hinweis: 'Liegt die Lieferantenrechnung vor, gleich mit der Zahlungseinladung schicken. Sonst nach vollem Zahlungseingang erstellen und bei der Übergabe mit „bezahlt“ übergeben.' }),
        P(56, 'repdoc_zubehoerrechnung', 'Zubehörrechnung in Repdoc', true, ['nach_verkauf.repdoc_zubehoerrechnung'], { hinweis: '„Hat keine“ zählt als erledigt (kommt aus der Masterliste).' }),
        P(57, 'zahlungseinladung', 'Zahlungseinladung an den Kunden gesendet (Lagerfahrzeug: Mail mit Repdoc-Rechnung)', true, ['v7.zahlungseinladung', 'nach_verkauf.zahlungsaufforderung']),
        P(58, 'anzahlung_da', 'Anzahlung ist eingegangen', true, ['v7.anzahlung_da'], { eingabe: 'betrag', label: 'Eingegangen in €',
          entfaelltWenn: [{ phase: 'v5', k: 'anzahlung', status: 'entfaellt', grund: 'Keine Anzahlung vereinbart' }] }),
        P(59, 'fin_ausgezahlt', 'Finanzierung ausgezahlt (Bank)', true, ['v7.fin_ausgezahlt'], { entfaelltWenn: [KEINE_FIN] }),
        P(60, 'abloese', 'Ablöse an die Altbank überwiesen', true, ['v7.abloese'],
          { entfaelltWenn: [KEIN_INZ, { phase: 'p04', k: 'abloese_geklaert', status: 'entfaellt', grund: 'Keine Ablöse' }] }),
        P(61, 'bar_beleg', 'Bar: Beleg und GwG-Bogen', true, ['v7.bar_beleg'], { foto: true,
          entfaelltWenn: [{ phase: 'v5', k: 'zahlungsart', nichtIn: ['Bar', 'Gemischt'], grund: 'Keine Barzahlung' }] }),
        P(62, 'restzahlung', 'Restzahlung eingegangen (→ Masterliste Geldeingang)', true, ['v7.restzahlung'], { eingabe: 'betrag', label: 'Eingegangen in €' }),
        P(63, 'zahlungsbestaetigung', 'Zahlungsbestätigung an den Kunden gesendet', false, ['v7.zahlungsbestaetigung']),
        P(64, 'kontoplanung', 'Zahlungen in der Kontoplanung eingetragen', true, ['nach_verkauf.kontoplanung']),
        P(65, 'zahlungsaufstellung_bh', 'Zahlungsaufstellung für die Buchhaltung', true, ['nach_verkauf.zahlungsaufstellung_bh']),
        P(66, 'voll_bezahlt', 'Voll bezahlt – Übergabe frei', true, ['v7.voll_bezahlt'], { keinEntfaellt: true, nurNachAllen: true, seg: ['ok'], segLabels: { ok: 'Voll bezahlt' },
          hinweis: 'Erst wenn das Geld da ist.' })
      ]
    },
    /* ============ A1 Zahlungen: Lieferant ============ */
    {
      key: 'a1_lieferant', typ: 'bereich', name: 'Zahlungen Lieferant', wer: 'Dispo, Buchhaltung', art: 'bearbeiten', rollen: BUERO,
      punkte: [
        P(67, 'lief_rechnung', 'Lieferantenrechnung da?', true, ['v7.lief_rechnung'], { eingabe: 'auswahl', label: 'Rechnung', optionen: ['Liegt vor (mit Einladung)', 'Kommt nach Zahlung'] }),
        P(68, 'rechnung_geprueft', 'Lieferantenrechnung geprüft', true, ['a1_lieferant.rechnung_geprueft']),
        P(69, 'fzg_bezahlt', 'Fahrzeug beim Lieferanten bezahlt (Datum)', true, [], { datenquelle: 'bestand.einkauf.lief_fzg_bezahlt', datenOk: true, datumQuelle: 'bestand.einkauf.lief_rg_bezahlt_datum',
          hinweis: 'Kommt aus bestand.einkauf (in Schritt 1a nur lesbar).' }),
        P(70, 'ek_finanzierung', 'EK-Finanzierung / Netting Openbank erledigt', true, [], { datenquelle: 'bestand.einkauf.ek_finanzierung_abloese_datum', datenOk: true, entfaelltWenn: [KEIN_EK_FIN],
          hinweis: 'Nur bei einfinanziertem Lagerwagen. Erledigt, sobald das Ablöse-Datum der Einkaufsfinanzierung eingetragen ist.' })
      ]
    },
    /* ============ A2 Transport: Anlieferung vom Lieferanten ============ */
    {
      key: 'a2_anlieferung', typ: 'bereich', name: 'Transport Anlieferung', wer: 'Dispo, Buchhaltung, OS', art: 'bearbeiten', rollen: BUERO,
      hinweis: 'Eigener Reiter. Alle Rollen sehen den Status, Transportkosten nur OS, Dispo und Buchhaltung. Die Lieferung zum Kunden steht in Phase 10.',
      punkte: [
        P(71, 'abholfreigabe', 'Abholfreigabe vom Lieferanten', true, [], { datenquelle: 'bestand.einkauf.abholfreigabe', datenOk: ['ja', 'nicht erforderlich'], entfaelltWenn: [IM_HAUS] }),
        P(72, 'spedition_beauftragt', 'Spedition beauftragt', true, [], { datenquelle: 'bestand.einkauf.spedition_beauftragt', datenOk: ['ja'], entfaelltWenn: [IM_HAUS] }),
        P(73, 'fahrzeug_angekommen', 'Fahrzeug im Haus angekommen', true, [], { datenquelle: 'bestand.einkauf.transportstatus', kontextFeld: 'transportstatus', datenOk: ['5 im Haus'] }),
        P(74, 'papiere_da', 'Papiere da (ZB II / COC)', true, [], { datenquelle: 'bestand.einkauf.papiere_eingang_ahs', datenOk: true })
      ]
    }
  ];

  /* ---------- Nicht übernommene Zeilen und Schlüssel (mit Begründung) ---------- */
  var ML_ENT = 'In Plan v2 nicht vorgesehen (Annahme: Masterliste-Statusfeld, ersetzt durch die Auslieferungs-Checkliste bzw. nicht mehr nötig). Offene Frage in der Prüfliste.';
  W.VK_ENTFALLEN = [
    { nr: 47, text: 'Akte an Oli gegeben', quelle: ['v5.akte_an_oli'], grund: 'Plan v2 Nr. 47: Phase 5 zeigt es.' },
    { nr: 53, text: 'Prüfpunkte der Prüfung durch Oli (8) und Masterliste prüfen', grund: 'Plan v2 Nr. 53: ersetzt durch die Übersicht Vollständigkeit (A4).',
      quelle: ['v6.p_bestellung', 'v6.p_preis', 'v6.p_zahlung', 'v6.p_inzahlung', 'v6.p_finanzierung', 'v6.p_ertrag', 'v6.p_zulassung', 'v6.p_listen', 'nach_verkauf.masterliste_pruefen'] },
    { nr: 93, text: 'Info an Verkäufer', quelle: ['zulassung.info_an_verkaeufer'], grund: 'Plan v2 Nr. 93: Verkäufer sieht Phase 8.' },
    { nr: 107, text: 'Danke-Mail mit Bewertungslink', quelle: ['v10.danke_mail', 'v9.bewertung_erbeten'], grund: 'Plan v2 Nr. 107: aufgegangen in Nr. 105 (Mail schon bei der Übergabe).' },
    { nr: null, text: 'Zahlung voll (abgeleitet aus v7.voll_bezahlt)', quelle: ['v9.zahlung_voll'], grund: 'Wurde nie gespeichert; ersetzt durch die Sperre „voll bezahlt“ in Phase 9.' },
    { nr: null, text: 'Masterliste: Innen (Aufbereitungsstatus)', quelle: ['ac.ac_innen'], grund: ML_ENT },
    { nr: null, text: 'Masterliste: Außen (Aufbereitungsstatus)', quelle: ['ac.ac_aussen'], grund: ML_ENT },
    { nr: null, text: 'Masterliste: Endkontrolle (Status)', quelle: ['ac.ac_endkontrolle'], grund: ML_ENT },
    { nr: null, text: 'Masterliste: Werkstatt (Status)', quelle: ['ac.ac_werkstatt'], grund: ML_ENT }
  ];
  /* „Phase entfällt“-Zeilen der alten Phasen v1–v4 (kein Punkt): gehören zu p01 bzw. p02 (phaseQuelle) */
  W.VK_SYSTEM = [
    { phase: 'v1', k: '_phase', gehoertZu: 'p01' },
    { phase: 'v2', k: '_phase', gehoertZu: 'p02' },
    { phase: 'v3', k: '_phase', gehoertZu: 'p02' },
    { phase: 'v4', k: '_phase', gehoertZu: 'p02' }
  ];
  /* Neue Speicher-Schlüssel (gibt es heute nicht in der Datenbank; das Datenbank-Paket richtet sie ein) */
  W.VK_NEUE_SCHLUESSEL = ['p04.bewertung', 'p04.ankaufvertrag', 'p04.abloese_geklaert', 'p04.fahrzeug_eingegangen', 'a1_lieferant.rechnung_geprueft',
    'p09.freigabe_auslieferung', 'p10.kunde_zufrieden', 'p10.uebergabe_mail', 'p10.fehlt_zugesendet', 'p10.name_fahrzeugannehmer', 'p11.bewertung_zugeordnet'];

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { VK_PHASEN: W.VK_PHASEN, VK_ENTFALLEN: W.VK_ENTFALLEN, VK_SYSTEM: W.VK_SYSTEM, VK_NEUE_SCHLUESSEL: W.VK_NEUE_SCHLUESSEL, VK_AC: W.VK_AC };
  }
})();
