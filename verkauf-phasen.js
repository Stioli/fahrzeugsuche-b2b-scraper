/* Stieber-App – Reiter „Verkauf“: Haken je Phase (window.VK_PHASEN)
   Stand 31.10.2026. Quelle: Plan „Verkauf in Phasen zum Abhaken“, Teil B (mit Oli abgestimmt).
   Gehört zu eingang-verkauf.js. Hier stehen NUR Daten, keine Logik.

   Phase:  { key:'v1'…'v10', name, wer (Anzeige), rollen:[…], hinweis?,
             entfaelltWenn?:[Bedingung] (ganze Phase entfällt automatisch), entfaellbar?:bool (Knopf „Phase entfällt“ von Hand),
             punkte:[Punkt] }
   Punkt:  { k (Schlüssel, je Phase eindeutig = verkauf.punkt.punkt_key), text, pflicht:bool,
             hinweis?, foto?:bool (Fotoblock zeigen), fotoPflicht?:bool (OK erst mit mind. 1 Foto),
             eingabe?: 'datum' | 'betrag' | 'text' | 'auswahl' | 'bestaetigung',
             optionen?:[…] (bei auswahl), label?, mehrzeilig?:bool (Textfeld mit mehreren Zeilen), textBei?:[Option] (bei dieser Option ist ein Grund-Text Pflicht),
             wertPflicht?:bool (bei eingabe:'text': OK erst mit Text),
             rollen?:[…] (überschreibt die Rollen der Phase), keinEntfaellt?:bool, seg?:['ok','nok','entfaellt'],
             segLabels?:{ok,nok,entfaellt}, nurNachAllen?:bool (OK erst, wenn alle anderen Pflichtpunkte der Phase erledigt sind),
             entfaelltWenn?:[Bedingung] (entfällt automatisch), abgeleitet?:{phase,k} (nur Anzeige, kommt aus anderer Phase),
             setzeUebergabetermin?:bool, setzeVerkaeufer?:bool, setzeBestellNr?:bool, spezial?:'nachlass',
             gruppe?:'ac', block? (Auslieferungs-Checkliste) }
   Bedingung: { phase, k, wert:'Nein' }            → Punkt phase.k ist beantwortet (OK) und hat diesen Wert
              { phase, k, status:'ok'|'entfaellt' } → Punkt hat diesen Status
              { phase, k, nichtIn:['Bar',…] }       → Punkt ist beantwortet und der Wert steht NICHT in der Liste
              jeweils + grund:'Text, der als Grund erscheint'
   Regeln (Ampel, Sperren) stehen in eingang-verkauf.js. Phase grün = alle Pflichtpunkte ok oder entfällt und kein NOK. */
(function () {
  'use strict';

  var VERKAUF = ['verkauf', 'admin'];
  var DISPO = ['dispo', 'admin'];
  var AC_ROLLEN = ['dispo', 'admin', 'werkstatt'];   // Aufbereiter/Meister haken über werkstatt@ mit Namenseintrag ab
  var VERK = ['OS', 'NP', 'AI'];                     // Verkäufer-Kürzel (Lead Liste)

  /* ---------- Auslieferungs-Checkliste (Vorlage Auslieferungs-Checkliste.xlsx), steht in V8 an Stelle 5 ---------- */
  var AC_BLOECKE = [
    ['Außen', [['folien', 'Folien'], ['waesche', 'Wäsche'], ['motorraum', 'Motorraum'], ['tankklappe', 'Tankklappe'], ['reifen_felgen', 'Reifen/Felgen'], ['kunststoff', 'Kunststoff'], ['politur', 'Politur']]],
    ['Innen', [['sitzschoner', 'Sitzschoner/Fußmatte'], ['umweltplakette', 'Alte Umweltplakette'], ['tuerfalze', 'Türfalze'], ['saugen', 'Saugen'], ['polster', 'Polster'], ['himmel', 'Himmel'],
      ['scheiben_pano', 'Scheiben/Pano'], ['faecher', 'Fächer leeren'], ['armaturen', 'Armaturen'], ['fussmatten_sicherheitsset', 'Fußmatten/Sicherheitsset'], ['kopfstuetzen_gurte', 'Kopfstützen/Gurte']]],
    ['Technik', [['laden', 'E/PHEV laden'], ['batterie', 'Batterie'], ['kraftstoff', '5 l Kraftstoff bei Reserve'], ['kennzeichenhalter', 'Kennzeichenhalter'], ['oel', 'Öl'], ['kuehlmittel', 'Kühlmittel'],
      ['waschwasser', 'Waschwasser'], ['raeder_nachziehen', 'Räder nachziehen'], ['reifendruck', 'Reifendruck vorne/hinten'], ['service', 'Service-Intervall'], ['sprache', 'Sprache Deutsch'],
      ['bluetooth_navi', 'Bluetooth/Navi löschen'], ['rdks', 'RDKS'], ['raeder_reinigen', 'Räder reinigen / in Halle / einlagern']]],
    ['Sonstiges', [['ichfreumich', '„Ich freu mich auf“'], ['preisschild', 'Preisschild'], ['co2_label', 'CO2-Label'], ['verkaufshalle', 'Fahrzeug in die Verkaufshalle']]]
  ];
  var acPunkte = [];
  AC_BLOECKE.forEach(function (b) {
    b[1].forEach(function (p) {
      var def = { k: 'ac_' + p[0], text: p[1], pflicht: true, gruppe: 'ac', block: b[0], rollen: AC_ROLLEN };
      if (p[0] === 'reifendruck') { def.eingabe = 'text'; def.label = 'Druck vorne / hinten (bar)'; }
      acPunkte.push(def);
    });
  });
  // Endkontrolle: Aufbereiter, Meister und Verkäufer bestätigen mit Name und Datum
  acPunkte.push({ k: 'ac_end_aufbereiter', text: 'Aufbereiter bestätigt (Name, Datum)', pflicht: true, gruppe: 'ac', block: 'Endkontrolle', eingabe: 'bestaetigung', rollen: AC_ROLLEN, keinEntfaellt: true, seg: ['ok', 'nok'] });
  acPunkte.push({ k: 'ac_end_meister', text: 'Meister bestätigt (Name, Datum)', pflicht: true, gruppe: 'ac', block: 'Endkontrolle', eingabe: 'bestaetigung', rollen: AC_ROLLEN, keinEntfaellt: true, seg: ['ok', 'nok'] });
  acPunkte.push({ k: 'ac_end_verkaeufer', text: 'Verkäufer bestätigt (Name, Datum)', pflicht: true, gruppe: 'ac', block: 'Endkontrolle', eingabe: 'bestaetigung', rollen: ['verkauf', 'dispo', 'admin'], keinEntfaellt: true, seg: ['ok', 'nok'] });

  /* ---------- Bedingungen, die mehrfach vorkommen ---------- */
  var KEIN_INZ = { phase: 'v2', k: 'inzahlung', wert: 'Nein', grund: 'Keine Inzahlungnahme' };
  var KEINE_FIN = { phase: 'v2', k: 'finanzierung', wert: 'Nein', grund: 'Keine Finanzierung gewünscht' };

  window.VK_PHASEN = [
    /* ============ V1 ============ */
    {
      key: 'v1', name: 'Anfrage', wer: 'Verkauf', rollen: VERKAUF, entfaellbar: true,
      hinweis: 'Kommt der Kunde ohne Anfrage direkt ins Haus, lass die ganze Phase mit Grund entfallen.',
      punkte: [
        { k: 'anfrage_da', text: 'Anfrage ist da (Kanal, Fahrzeug, Zeit)', pflicht: true, eingabe: 'auswahl', label: 'Kanal', optionen: ['mobile.de', 'AutoScout24', 'Kleinanzeigen', 'Website', 'Google', 'Telefon', 'WhatsApp', 'Persönlich', 'Sonstiges'] },
        { k: 'verkaeufer_zugeteilt', text: 'Verkäufer zugeteilt', pflicht: true, eingabe: 'auswahl', label: 'Verkäufer', optionen: VERK, setzeVerkaeufer: true },
        { k: 'kunde_angerufen', text: 'Kunde angerufen', pflicht: true, eingabe: 'auswahl', label: 'Ergebnis des Anrufs', optionen: ['erreicht', 'nicht erreicht'] },
        { k: 'whatsapp', text: 'Nicht erreicht: WhatsApp mit einer Frage gesendet (Entwurf von Claude)', pflicht: true,
          entfaelltWenn: [{ phase: 'v1', k: 'kunde_angerufen', wert: 'erreicht', grund: 'Kunde wurde erreicht' }] },
        { k: 'antwort_mail', text: 'Antwort-Mail gesendet (Entwurf von Claude, du gibst frei)', pflicht: true },
        { k: 'termin_vereinbart', text: 'Termin vereinbart (Beratung oder Probefahrt)', pflicht: true, eingabe: 'datum', label: 'Termin am',
          hinweis: 'Kein Termin möglich? Dann „entfällt“ mit Grund – es folgt der Nachkontakt.' },
        { k: 'termin_bestaetigung', text: 'Terminbestätigung gesendet', pflicht: true,
          entfaelltWenn: [{ phase: 'v1', k: 'termin_vereinbart', status: 'entfaellt', grund: 'Kein Termin vereinbart' }] },
        { k: 'erinnerung_vortag', text: 'Erinnerung am Vortag gesendet', pflicht: true,
          entfaelltWenn: [{ phase: 'v1', k: 'termin_vereinbart', status: 'entfaellt', grund: 'Kein Termin vereinbart' }] },
        { k: 'nachkontakt', text: 'Kein Termin: Nachkontakt gemacht', pflicht: true,
          entfaelltWenn: [{ phase: 'v1', k: 'termin_vereinbart', status: 'ok', grund: 'Termin ist vereinbart' }] },
        { k: 'ergebnis', text: 'Ergebnis der Anfrage', pflicht: true, eingabe: 'auswahl', label: 'Ergebnis', optionen: ['Termin steht', 'Nachkontakt läuft', 'Kein Interesse'], textBei: ['Kein Interesse'] }
      ]
    },
    /* ============ V2 ============ */
    {
      key: 'v2', name: 'Beratung', wer: 'Verkauf', rollen: VERKAUF, entfaellbar: true,
      punkte: [
        { k: 'kunde_da', text: 'Kunde ist da', pflicht: true, eingabe: 'auswahl', label: 'Kunde kam', optionen: ['mit Termin', 'ohne Termin'] },
        { k: 'kundendaten', text: 'Kundendaten aufgenommen', pflicht: true },
        { k: 'datenschutz', text: 'Datenschutz-Einwilligung unterschrieben (Vorlage 71)', pflicht: true, foto: true },
        { k: 'inzahlung', text: 'Inzahlungnahme? Wenn ja: im Reiter Inzahlungnahmen erfassen', pflicht: true, eingabe: 'auswahl', label: 'Inzahlungnahme', optionen: ['Ja', 'Nein'] },
        { k: 'bedarf', text: 'Bedarf besprochen', pflicht: true, eingabe: 'text', label: 'Bedarf (kurz)', mehrzeilig: true },
        { k: 'fahrzeug_gezeigt', text: 'Fahrzeug gezeigt', pflicht: true },
        { k: 'finanzierung', text: 'Finanzierung gewünscht?', pflicht: true, eingabe: 'auswahl', label: 'Finanzierung', optionen: ['Ja', 'Nein'] },
        { k: 'probefahrt', text: 'Probefahrt gewünscht?', pflicht: true, eingabe: 'auswahl', label: 'Probefahrt', optionen: ['Ja', 'Nein'],
          hinweis: 'Bei „Nein“ entfällt die Phase Probefahrt von selbst.' },
        { k: 'ergebnis', text: 'Ergebnis der Beratung', pflicht: true, eingabe: 'auswahl', label: 'Ergebnis', optionen: ['Weiter zum Angebot', 'Bedenkzeit', 'Kein Kauf'], textBei: ['Kein Kauf'] }
      ]
    },
    /* ============ V3 ============ */
    {
      key: 'v3', name: 'Probefahrt', wer: 'Verkauf', rollen: VERKAUF, entfaellbar: true,
      entfaelltWenn: [{ phase: 'v2', k: 'probefahrt', wert: 'Nein', grund: 'Kunde wünscht keine Probefahrt' }],
      punkte: [
        { k: 'fuehrerschein', text: 'Führerschein geprüft (Foto)', pflicht: true, foto: true, fotoPflicht: true },
        { k: 'ausweis', text: 'Ausweis geprüft (Foto)', pflicht: true, foto: true, fotoPflicht: true },
        { k: 'vertrag', text: 'Probefahrt-Vertrag unterschrieben', pflicht: true, foto: true },
        { k: 'kennzeichen_versicherung', text: 'Kennzeichen und Versicherung geprüft', pflicht: true, eingabe: 'text', label: 'Kennzeichen', wertPflicht: true },
        { k: 'km_vorher', text: 'km-Stand und Tankstand vorher', pflicht: true, eingabe: 'text', label: 'km und Tank vorher', wertPflicht: true },
        { k: 'verkaeufer_faehrt_mit', text: 'Verkäufer fährt mit', pflicht: true },
        { k: 'km_nachher', text: 'km-Stand nachher, keine Schäden', pflicht: true, eingabe: 'text', label: 'km nachher', wertPflicht: true, foto: true },
        { k: 'eindruck', text: 'Eindruck des Kunden notiert', pflicht: true, eingabe: 'text', label: 'Eindruck', wertPflicht: true, mehrzeilig: true },
        { k: 'ergebnis', text: 'Ergebnis der Probefahrt', pflicht: true, eingabe: 'auswahl', label: 'Ergebnis', optionen: ['Weiter zum Angebot', 'Bedenkzeit', 'Kein Kauf'], textBei: ['Kein Kauf'] }
      ]
    },
    /* ============ V4 ============ */
    {
      key: 'v4', name: 'Angebot', wer: 'Verkauf, Oli', rollen: VERKAUF, entfaellbar: true,
      hinweis: 'Zugaben bis 300 € darfst du selbst geben. Einen Nachlass entscheidet nur Oli.',
      punkte: [
        { k: 'angebot', text: 'Angebot erstellt (Fahrzeug, Zubehör, Zulassung, Lieferung)', pflicht: true, eingabe: 'betrag', label: 'Angebotssumme in €' },
        { k: 'zugaben', text: 'Zugaben bis 300 € vereinbart', pflicht: true, eingabe: 'betrag', label: 'Wert der Zugaben in €', hinweis: 'Keine Zugaben? Dann „entfällt“ mit Grund.' },
        { k: 'nachlass', text: 'Nachlass: Freigabe durch Oli in der App', pflicht: true, spezial: 'nachlass', seg: ['entfaellt'], segLabels: { entfaellt: 'Kein Nachlass' },
          hinweis: 'Nachlass beantragst du hier, Oli gibt ihn frei. Gibt es keinen Nachlass: „Kein Nachlass“.' },
        { k: 'inz_verrechnet', text: 'Wert der Inzahlungnahme verrechnet', pflicht: true, eingabe: 'betrag', label: 'Inzahlungnahme-Wert in €', entfaelltWenn: [KEIN_INZ] },
        { k: 'fin_gerechnet', text: 'Finanzierung gerechnet (Openbank)', pflicht: true, entfaelltWenn: [KEINE_FIN] },
        { k: 'fin_antrag', text: 'Antrag gestellt: Zusage oder Ablehnung', pflicht: true, eingabe: 'auswahl', label: 'Entscheidung der Bank', optionen: ['Zusage', 'Ablehnung'], entfaelltWenn: [KEINE_FIN] },
        { k: 'angebot_uebergeben', text: 'Angebot dem Kunden übergeben', pflicht: true },
        { k: 'ergebnis', text: 'Ergebnis des Angebots', pflicht: true, eingabe: 'auswahl', label: 'Ergebnis', optionen: ['Kunde bestellt', 'Bedenkzeit', 'Kein Kauf'], textBei: ['Kein Kauf'] }
      ]
    },
    /* ============ V5 ============ */
    {
      key: 'v5', name: 'Bestellung', wer: 'Verkauf, Claude', rollen: VERKAUF,
      punkte: [
        { k: 'bestellung_autrado', text: 'Bestellung in Autrado erstellt', pflicht: true, eingabe: 'text', label: 'Bestell-Nr. (z. B. 2610-12345)', wertPflicht: true, setzeBestellNr: true },
        { k: 'unterschrieben', text: 'Bestellung vom Kunden unterschrieben', pflicht: true, foto: true },
        { k: 'zahlungsart', text: 'Zahlungsart festgelegt', pflicht: true, eingabe: 'auswahl', label: 'Zahlungsart', optionen: ['Überweisung', 'Finanzierung', 'Bar', 'Gemischt'],
          hinweis: 'Bar ab 10.000 € nur mit Geldwäsche-Bogen (GwG).' },
        { k: 'anzahlung', text: 'Anzahlung vereinbart', pflicht: true, eingabe: 'betrag', label: 'Anzahlung in €', hinweis: 'Keine Anzahlung? Dann „entfällt“ mit Grund.' },
        { k: 'zul_ausweis', text: 'Zulassungsunterlagen: Ausweis', pflicht: true, foto: true },
        { k: 'zul_evb', text: 'Zulassungsunterlagen: eVB-Nummer', pflicht: true, eingabe: 'text', label: 'eVB-Nummer', wertPflicht: true },
        { k: 'zul_sepa', text: 'Zulassungsunterlagen: SEPA-Mandat', pflicht: true, foto: true },
        { k: 'zul_wunschkennzeichen', text: 'Zulassungsunterlagen: Wunschkennzeichen', pflicht: false, eingabe: 'text', label: 'Wunschkennzeichen' },
        { k: 'zul_vollmacht', text: 'Zulassungsunterlagen: Vollmacht', pflicht: true, foto: true },
        { k: 'abholung_lieferung', text: 'Abholung oder Lieferung', pflicht: true, eingabe: 'auswahl', label: 'Übergabe', optionen: ['Abholung', 'Lieferung'] },
        { k: 'wunschtermin', text: 'Wunschtermin des Kunden', pflicht: true, eingabe: 'datum', label: 'Wunschtermin', setzeUebergabetermin: true },
        { k: 'datenschutz_nachholen', text: 'Datenschutz-Einwilligung (falls noch offen)', pflicht: true, foto: true,
          entfaelltWenn: [{ phase: 'v2', k: 'datenschutz', status: 'ok', grund: 'Schon in der Beratung unterschrieben' }] },
        { k: 'claude_eintraege', text: 'Claude: Masterliste, Lead Liste, Börsen/ONLINE aus, Akte angelegt', pflicht: true },
        { k: 'akte_an_oli', text: 'Akte an Oli gegeben', pflicht: true }
      ]
    },
    /* ============ V6 ============ */
    {
      key: 'v6', name: 'Prüfung durch Oli', wer: 'nur Oli', rollen: ['admin'],
      punkte: [
        { k: 'p_bestellung', text: 'Bestellung vollständig', pflicht: true },
        { k: 'p_preis', text: 'Preis, Zugaben und Nachlass wie freigegeben', pflicht: true },
        { k: 'p_zahlung', text: 'Zahlungsart und Anzahlung, GwG', pflicht: true },
        { k: 'p_inzahlung', text: 'Inzahlungnahme (Wert, Ablöse, Vertrag)', pflicht: true, entfaelltWenn: [KEIN_INZ] },
        { k: 'p_finanzierung', text: 'Finanzierungszusage liegt vor', pflicht: true, entfaelltWenn: [KEINE_FIN] },
        { k: 'p_ertrag', text: 'Ertrag plausibel', pflicht: true },
        { k: 'p_zulassung', text: 'Zulassungsunterlagen und Vollmacht', pflicht: true },
        { k: 'p_listen', text: 'Masterliste, Lead Liste, Börsen', pflicht: true },
        { k: 'freigabe', text: 'Freigabe an die Dispo (oder Rückfrage)', pflicht: true, keinEntfaellt: true, nurNachAllen: true, nokReicht: true, seg: ['ok', 'nok'],
          segLabels: { ok: 'Freigeben', nok: 'Rückfrage' }, hinweis: 'Bei „Rückfrage“ schreibst du die Frage als Grund. Erst nach „Freigeben“ öffnen sich Zahlung und Vorbereitung. Punkte mit NOK (z. B. eVB fehlt) gelten als geprüft – du kannst trotzdem freigeben, sie bleiben rot, bis sie nachgeholt sind.' }
      ]
    },
    /* ============ V7 ============ */
    {
      key: 'v7', name: 'Zahlung', wer: 'Dispo', rollen: DISPO,
      punkte: [
        { k: 'lief_rechnung', text: 'Lieferantenrechnung da?', pflicht: true, eingabe: 'auswahl', label: 'Rechnung', optionen: ['Liegt vor (mit Einladung)', 'Kommt nach Zahlung'] },
        { k: 'zahlungseinladung', text: 'Zahlungseinladung an den Kunden gesendet', pflicht: true },
        { k: 'anzahlung_da', text: 'Anzahlung ist eingegangen', pflicht: true, eingabe: 'betrag', label: 'Eingegangen in €',
          entfaelltWenn: [{ phase: 'v5', k: 'anzahlung', status: 'entfaellt', grund: 'Keine Anzahlung vereinbart' }] },
        { k: 'fin_ausgezahlt', text: 'Finanzierung ausgezahlt', pflicht: true, entfaelltWenn: [KEINE_FIN] },
        { k: 'abloese', text: 'Ablöse an die Altbank überwiesen', pflicht: true, entfaelltWenn: [KEIN_INZ] },
        { k: 'restzahlung', text: 'Restzahlung eingegangen (→ Masterliste Geldeingang)', pflicht: true, eingabe: 'betrag', label: 'Eingegangen in €' },
        { k: 'bar_beleg', text: 'Bar: Beleg und GwG-Bogen', pflicht: true, foto: true,
          entfaelltWenn: [{ phase: 'v5', k: 'zahlungsart', nichtIn: ['Bar', 'Gemischt'], grund: 'Keine Barzahlung' }] },
        { k: 'voll_bezahlt', text: 'Voll bezahlt – Übergabe frei', pflicht: true, keinEntfaellt: true, nurNachAllen: true, seg: ['ok'], segLabels: { ok: 'Voll bezahlt' },
          hinweis: 'Erst wenn das Geld da ist. Ohne diesen Haken bleibt die Übergabe gesperrt.' }
      ]
    },
    /* ============ V8 ============ */
    {
      key: 'v8', name: 'Vorbereitung', wer: 'Dispo, Werkstatt, Aufbereiter', rollen: DISPO,
      punkte: [
        { k: 'repdoc_kunde', text: 'Kunde in Repdoc vorhanden oder angelegt', pflicht: true, eingabe: 'text', label: 'Kundennummer Repdoc' },
        { k: 'repdoc_fahrzeug', text: 'Fahrzeug in Repdoc vorhanden oder angelegt', pflicht: true, eingabe: 'text', label: 'Fahrzeug in Repdoc (Nr.)' },
        { k: 'auftrag', text: 'Interner Auftrag mit Arbeiten angelegt (z. B. Winterräder bestellen/montieren, Sommerräder einlagern, Durchsicht, Batterie laden, Zubehör/Zugaben)', pflicht: true, eingabe: 'text', label: 'Auftragsnummer' },
        { k: 'arbeiten_erledigt', text: 'Arbeiten erledigt', pflicht: true }
      ].concat(acPunkte, [
        { k: 'zulassungsdienst', text: 'Zulassungsdienst beauftragt (ZB II aus Tresor, COC, Vollmacht, eVB, SEPA)', pflicht: true },
        { k: 'zugelassen', text: 'Zugelassen, Kennzeichen da', pflicht: true },
        { k: 'transport', text: 'Lieferung? Transport gebucht', pflicht: true,
          entfaelltWenn: [{ phase: 'v5', k: 'abholung_lieferung', wert: 'Abholung', grund: 'Kunde holt ab' }] },
        { k: 'uebergabetermin', text: 'Übergabetermin festgelegt (→ Masterliste)', pflicht: true, eingabe: 'datum', label: 'Übergabe am', setzeUebergabetermin: true },
        { k: 'bereit', text: 'Fahrzeug bereit', pflicht: true, keinEntfaellt: true, nurNachAllen: true, seg: ['ok'], segLabels: { ok: 'Bereit' } }
      ])
    },
    /* ============ V9 ============ */
    {
      key: 'v9', name: 'Übergabe', wer: 'Verkauf', rollen: VERKAUF,
      punkte: [
        { k: 'zahlung_voll', text: 'Zahlung voll (kommt aus „Zahlung“)', pflicht: true, abgeleitet: { phase: 'v7', k: 'voll_bezahlt' } },
        { k: 'datenschutz_uebergabe', text: 'Datenschutz-Einwilligung (falls noch offen)', pflicht: true, foto: true,
          entfaelltWenn: [{ phase: 'v2', k: 'datenschutz', status: 'ok', grund: 'Schon unterschrieben' }, { phase: 'v5', k: 'datenschutz_nachholen', status: 'ok', grund: 'Schon unterschrieben' }] },
        { k: 'einweisung', text: 'Einweisung gemacht', pflicht: true },
        { k: 'unterlagen', text: 'Unterlagen übergeben (ZB I, Rechnung „bezahlt“, COC, Serviceheft, Schlüssel)', pflicht: true },
        { k: 'uebergabeprotokoll', text: 'Übergabeprotokoll unterschrieben (Vorlage 72)', pflicht: true, foto: true, fotoPflicht: true },
        { k: 'eu_mitteilung', text: 'EU-Mitteilung (nur bei EU-Fahrzeug)', pflicht: true, hinweis: 'Kein EU-Fahrzeug? Dann „entfällt“ mit Grund.' },
        { k: 'uebergabefotos', text: 'Übergabefotos gemacht', pflicht: true, foto: true, fotoPflicht: true },
        { k: 'gutschein_einlagerung', text: 'Gutschein und Rädereinlagerung (6 Monate) eingetragen', pflicht: true },
        { k: 'bewertung_erbeten', text: 'Bewertung erbeten', pflicht: true },
        { k: 'standort_kunde', text: 'Masterliste: Standort „Kunde“ eingetragen', pflicht: true }
      ]
    },
    /* ============ V10 ============ */
    {
      key: 'v10', name: 'Nachbetreuung', wer: 'Verkauf, Werkstatt, Claude', rollen: VERKAUF,
      punkte: [
        { k: 'danke_mail', text: 'Danke-Mail mit Bildern und Bewertungslink gesendet', pflicht: true },
        { k: 'bewertung_da', text: 'Bewertung ist da (→ Masterliste, Provision)', pflicht: false },
        { k: 'erinnerungen', text: 'Erinnerungen eingerichtet (HU, Kundendienst, Ende Einlagerung)', pflicht: true },
        { k: 'nachfrage', text: 'Nachfrage nach 1–2 Wochen gemacht', pflicht: true },
        { k: 'reklamation', text: 'Reklamation? (bis 200 € Werkstatt, darüber Oli)', pflicht: false, eingabe: 'text', label: 'Worum geht es?', mehrzeilig: true,
          hinweis: 'Offene Reklamation: „NOK“ mit Grund. Gibt es keine, lass den Punkt offen.' },
        { k: 'akte_abgeschlossen', text: 'Akte abgeschlossen (→ Nachkalkulation)', pflicht: true, keinEntfaellt: true, nurNachAllen: true, seg: ['ok'], segLabels: { ok: 'Abgeschlossen' } }
      ]
    }
  ];
})();
