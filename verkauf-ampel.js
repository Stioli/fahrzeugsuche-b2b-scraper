/* Stieber-App – Übersicht Vollständigkeit (A4): Ampel je Phase/Bereich (window.VK_AMPEL)
   Stand 14.11.2026 (Entwurf VA1). Reine Funktionen, kein DOM, kein Speichern. Läuft im Browser (window.VK_AMPEL) und in Node (module.exports).
   Definition: verkauf-phasen.js (window.VK_PHASEN). Regeln: Plan Verkaufsablauf v2, Abschnitt 6.

   VK_AMPEL.berechne(phasen, zeilen, kontext) → { phasen:[…], nachKey:{p01:…}, fehlt:[…], gesamt }
   - phasen:  window.VK_PHASEN (Phasen p01…p11 und Bereiche a1_kunde, a1_lieferant, a2_anlieferung)
   - zeilen:  [{ phase, punkt_key, status:'ok'|'nok'|'entfaellt'|'offen', wert?, grund? }] = die gespeicherten Haken der Akte unter den SPEICHER-SCHLÜSSELN
              (E1: v1…v10, nach_verkauf, zulassung, auslieferung, p04, p09, p10, p11, a1_lieferant; die Auslieferungs-Checkliste als phase:'ac').
              wert darf ein Text/Betrag/Datum sein oder ein Objekt { auswahl | wert | text | betrag | datum }.
              Eine Zeile { phase:'v2', punkt_key:'_phase', status:'entfaellt' } lässt die alte Phase v2 von Hand entfallen.
   - kontext: { zahlung:'bezahlt'|'teilweise'|'offen', transportstatus:'5 im Haus'|…, abholung_lieferung:'Abholung'|'Lieferung',
                sperreAufgehoben:bool, daten:{ 'bestand.einkauf.lief_fzg_bezahlt': true, … } }   (daten = Felder aus bestand.*, wo kein Haken existiert)
   Ergebnis je Phase: { key, name, typ, art, ampel:'gruen'|'gelb'|'rot'|'grau', entfaellt, entfaelltGrund, offenPflicht, nok, pflichtGesamt, pflichtErledigt,
                        punkte:[{ k, text, pflicht, status:'ok'|'nok'|'entfaellt'|'offen', auto, grund, nurLesen, wer }], fehlt:[…], sperren:[…], warnungen:[…], transportstatus? }
   fehlt-Eintrag: { phase, phaseName, k, text, status:'offen'|'nok', grund, wer (bei wem, Text), rollen:[…] }
   Regeln: grün = alle Pflichtpunkte ok oder entfällt und kein NOK · NOK → rot · Pflichtpunkt offen → gelb · grau = Phase entfällt · optionale Punkte zählen nicht.
   Zusammenlegung: ein Punkt mit mehreren Quellen ist erledigt, wenn EINE Quelle ok ist; NOK, wenn eine NOK ist und keine ok; „entfällt“, wenn eine entfällt und keine ok/NOK. */
(function () {
  'use strict';
  var W = typeof window !== 'undefined' ? window : globalThis;
  var ROLLENNAME = { admin: 'OS', dispo: 'Dispo', buchhaltung: 'Buchhaltung', verkauf: 'Verkauf', werkstatt: 'Werkstatt' };

  function norm(s) { return String(s == null ? '' : s).trim().toLowerCase(); }
  function inListe(liste, v) {
    if (v === undefined || v === null) return false;
    for (var i = 0; i < liste.length; i++) if (norm(liste[i]) === norm(v)) return true;
    return false;
  }
  /** Wert einer Zeile als einfacher Wert (Text/Zahl/Datum) */
  function wertAus(w) {
    if (w === undefined || w === null) return null;
    if (typeof w !== 'object') return w;
    var ks = ['auswahl', 'wert', 'text', 'betrag', 'datum'];
    for (var i = 0; i < ks.length; i++) if (w[ks[i]] !== undefined && w[ks[i]] !== null && w[ks[i]] !== '') return w[ks[i]];
    return null;
  }
  function statusAus(z) {
    var s = z && z.status;
    return (s === 'ok' || s === 'nok' || s === 'entfaellt') ? s : 'offen';
  }
  function werText(rollen) { return (rollen || []).map(function (r) { return ROLLENNAME[r] || r; }).join(', '); }

  function berechne(phasen, zeilen, kontext) {
    phasen = phasen || W.VK_PHASEN || [];
    kontext = kontext || {};
    var idx = {};
    (zeilen || []).forEach(function (z) { if (z && z.phase != null && z.punkt_key != null) idx[z.phase + '.' + z.punkt_key] = z; });

    function zeile(q) { return idx[q.phase + '.' + q.k] || null; }
    function kontextWert(name) {
      var v = kontext[name];
      if (v === undefined && kontext.daten) v = kontext.daten[name];
      return v;
    }
    function datenWert(quelle, feld) {
      if (kontext.daten && kontext.daten[quelle] !== undefined) return kontext.daten[quelle];
      if (feld && kontext[feld] !== undefined) return kontext[feld];
      return undefined;
    }
    /** gespeicherte Phase von Hand „entfällt“ (Zeile _phase) */
    function speicherPhaseEntf(sp) { var z = idx[sp + '._phase']; return !!z && z.status === 'entfaellt'; }
    /** roher Stand eines Speicher-Schlüssels für Bedingungen */
    function roh(key) {
      var z = idx[key];
      if (z) return { st: statusAus(z), wert: wertAus(z.wert) };
      if (key === 'v5.abholung_lieferung' && kontext.abholung_lieferung) return { st: 'ok', wert: kontext.abholung_lieferung };
      return null;
    }
    function bedingung(c) {
      if (c.kontext) {
        var kv = kontextWert(c.kontext);
        if (c.in) return inListe(c.in, kv);
        if (c.wert !== undefined) return kv !== undefined && kv !== null && norm(kv) === norm(c.wert);
        return !!kv;
      }
      if (c.datenquelle) {
        var dv = datenWert(c.datenquelle, c.kontextFeld);
        if (c.nichtWahr) return dv === false || dv === null || dv === '';
        if (c.in) return inListe(c.in, dv);
        return !!dv;
      }
      var e = roh(c.phase + '.' + c.k);
      if (!e) return false;
      if (c.status && e.st !== c.status) return false;
      if (c.wert !== undefined) return e.st === 'ok' && norm(e.wert) === norm(c.wert);
      if (c.nichtIn) return e.st === 'ok' && e.wert !== null && !inListe(c.nichtIn, e.wert);
      return true;
    }
    function ersteBedingung(liste) {
      var l = liste || [];
      for (var i = 0; i < l.length; i++) if (bedingung(l[i])) return l[i];
      return null;
    }
    function datenOk(p, v) {
      if (v === undefined || v === null || v === false || v === '') return false;
      if (p.datenOk === true) return !(typeof v === 'string' && (norm(v) === 'nein' || norm(v) === 'false'));
      if (Array.isArray(p.datenOk)) return inListe(p.datenOk, v);
      return !!v;
    }
    function quellenStatus(q) {
      var z = zeile(q), s = statusAus(z);
      if (s === 'ok' && q.okWerte && !inListe(q.okWerte, wertAus(z.wert))) s = 'offen';
      return s;
    }

    /** Stand eines Punktes → { st, auto, grund } */
    function punktStand(p) {
      var quellen = p.quelle || [], sts = quellen.map(quellenStatus), st = 'offen', grund = null;
      var istAuto = false;
      if (sts.indexOf('ok') >= 0) st = 'ok';
      else if (sts.indexOf('nok') >= 0) st = 'nok';
      else if (sts.indexOf('entfaellt') >= 0) st = 'entfaellt';
      if (p.datenquelle && st !== 'ok' && datenOk(p, datenWert(p.datenquelle, p.kontextFeld))) st = 'ok';
      // Zeilen-Grund (bei NOK / entfällt)
      quellen.forEach(function (q, i) { var z = zeile(q); if (!grund && z && z.grund && sts[i] === st) grund = z.grund; });
      // alle Quellen in von Hand entfallenen alten Phasen → entfällt
      if (st === 'offen' && quellen.length && quellen.every(function (q) { return speicherPhaseEntf(q.phase); })) { st = 'entfaellt'; grund = 'Phase entfällt'; }
      var b = ersteBedingung(p.entfaelltWenn);
      if (b) { st = 'entfaellt'; istAuto = true; grund = b.grund || 'Entfällt automatisch'; }
      return { st: st, auto: istAuto, grund: grund };
    }

    var ergebnis = [], nachKey = {}, alleFehlt = [];
    phasen.forEach(function (ph) {
      var phAuto = ersteBedingung(ph.entfaelltWenn);
      var phHand = !!(ph.phaseQuelle && ph.phaseQuelle.length && ph.phaseQuelle.every(function (q) { return speicherPhaseEntf(q.phase); }));
      var r = { key: ph.key, name: ph.name, typ: ph.typ, art: ph.art, ampel: 'grau', entfaellt: false, entfaelltGrund: '', offenPflicht: 0, nok: 0, pflichtGesamt: 0, pflichtErledigt: 0,
                punkte: [], fehlt: [], sperren: [], warnungen: [] };
      if (ph.transportAnzeigen) r.transportstatus = kontextWert('transportstatus') === undefined ? null : kontextWert('transportstatus');
      var wirklichPunkte = 0, entfallene = 0;
      (ph.punkte || []).forEach(function (p) {
        var s = punktStand(p), rollen = p.rollen || ph.rollen || [];
        var wer = p.wer || ph.wer || werText(rollen);
        var offen = !!p.pflicht && s.st !== 'ok' && s.st !== 'entfaellt';
        r.punkte.push({ k: p.k, text: p.text, pflicht: !!p.pflicht, status: s.st, auto: s.auto, grund: s.grund, nurLesen: !!p.nurLesen, wer: wer, nr: p.nr });
        wirklichPunkte++; if (s.st === 'entfaellt') entfallene++;
        if (p.pflicht && !(s.auto && s.st === 'entfaellt')) { r.pflichtGesamt++; if (!offen) r.pflichtErledigt++; }
        if (offen) r.offenPflicht++;
        if (s.st === 'nok') r.nok++;
        if (offen || s.st === 'nok') {
          r.fehlt.push({ phase: ph.key, phaseName: ph.name, k: p.k, text: p.text, status: s.st === 'nok' ? 'nok' : 'offen', grund: s.st === 'nok' ? (s.grund || '') : '', wer: wer, rollen: rollen.slice() });
        }
      });
      r.entfaellt = !!phAuto || phHand || (wirklichPunkte > 0 && entfallene === wirklichPunkte);
      if (r.entfaellt) {
        r.entfaelltGrund = phAuto ? (phAuto.grund || '') : phHand ? 'Phase von Hand entfallen' : 'Alle Punkte entfallen';
        r.ampel = 'grau'; r.fehlt = [];
      } else {
        r.ampel = r.nok > 0 ? 'rot' : r.offenPflicht > 0 ? 'gelb' : 'gruen';
      }
      // Sperre (Phase 9: voll bezahlt)
      if (ph.sperre && !r.entfaellt && !kontext.sperreAufgehoben && !bedingung(ph.sperre.bedingung)) r.sperren.push({ typ: ph.sperre.typ, text: ph.sperre.text });
      ergebnis.push(r); nachKey[ph.key] = r;
    });
    // Warnungen (Phase 9: Aufbereitung, Zulassung, Transport nicht grün → Freigabe nur mit Grund)
    phasen.forEach(function (ph) {
      if (!ph.warnWennNichtGruen) return;
      var r = nachKey[ph.key];
      ph.warnWennNichtGruen.forEach(function (k) {
        var o = nachKey[k];
        if (o && !r.entfaellt && o.ampel !== 'gruen' && o.ampel !== 'grau') r.warnungen.push({ phase: k, name: o.name, ampel: o.ampel, text: 'Phase „' + o.name + '“ ist nicht grün: Freigabe nur mit Grund.' });
      });
    });
    ergebnis.forEach(function (r) { r.fehlt.forEach(function (f) { alleFehlt.push(f); }); });

    var gesamt = 'grau';
    ergebnis.forEach(function (r) {
      if (r.ampel === 'grau') return;
      if (r.ampel === 'rot') gesamt = 'rot';
      else if (r.ampel === 'gelb' && gesamt !== 'rot') gesamt = 'gelb';
      else if (r.ampel === 'gruen' && gesamt === 'grau') gesamt = 'gruen';
    });
    return { phasen: ergebnis, nachKey: nachKey, fehlt: alleFehlt, gesamt: gesamt };
  }

  var API = { berechne: berechne, wertAus: wertAus };
  W.VK_AMPEL = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})();
