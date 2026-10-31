/* Stieber-App – Reiter „Verkauf“ (Verkaufsakten mit 10 Phasen zum Abhaken)
   Stand 31.10.2026. Plan: „Verkauf in Phasen zum Abhaken“, Teil B. Datenvertrag: 08b Fahrzeug-Verkauft/Verkaufs-App/LIESMICH.md
   Daten: Schema verkauf (akte, punkt, freigabe). Haken-Listen: verkauf-phasen.js (window.VK_PHASEN).
   Baut auf window.EG aus eingang-core.js auf.

   Für andere Reiter (z. B. Anfragen):
     window.VK_AKTE_ANLEGEN(vorbelegung) → Promise<akte_id | null>
        vorbelegung (alles optional): interne_nr, autrado_nr, fin, hersteller, modell, farbe, ml_ref, lead_ref, bestell_nr,
        kunde_name, kunde_telefon, kunde_email, verkaeufer, uebergabe_termin, kanal (→ Punkt „Anfrage ist da“)
        Gibt es zu ml_ref oder lead_ref schon eine Akte, wird diese geöffnet. Sonst Dialog, danach öffnet sich die neue Akte.
     window.VK_AKTE_OEFFNEN(akte_id)

   Regeln (kurz):
   - Punkt-Status: offen · ok · nok · entfaellt (Grund Pflicht bei nok/entfällt). Ein Tipp auf den aktiven Knopf nimmt zurück auf „offen“.
   - Phase grün = alle Pflichtpunkte ok oder entfällt UND kein NOK in der Phase (oder die ganze Phase entfällt).
     rot = NOK offen oder Übergabetermin überschritten (V1–V9, Phase nicht grün) · gelb = begonnen · grau = sonst.
   - Sperren: Phase n+1 nur, wenn die vorige (nicht entfallene) Phase grün ist · Zahlung erst nach Olis Freigabe in „Prüfung durch Oli“ ·
     Übergabe erst, wenn „Voll bezahlt“ in „Zahlung“ abgehakt ist. Nur admin hebt eine Sperre mit Grund auf (verkauf.freigabe). */
(function () {
  'use strict';
  var EG = window.EG, h = EG && EG.h, PH = window.VK_PHASEN;
  if (!EG) return;
  if (!PH) { console.error('verkauf-phasen.js fehlt – Reiter Verkauf nicht aktiv.'); return; }

  // verkauf.css selbst nachladen, falls die Seite sie nicht eingebunden hat
  try {
    var hatCss = Array.prototype.some.call(document.querySelectorAll('link[rel=stylesheet]'), function (l) { return /verkauf\.css/.test(l.getAttribute('href') || ''); });
    if (!hatCss) { var lk = document.createElement('link'); lk.rel = 'stylesheet'; lk.href = 'verkauf.css'; document.head.appendChild(lk); }
  } catch (e) { /* egal */ }

  /* ====================================================================
     Festwerte
     ==================================================================== */
  var PH_BY = {}; PH.forEach(function (p, i) { PH_BY[p.key] = p; p.idx = i; });
  var VERKAEUFER = ['OS', 'NP', 'AI'];
  var ANLEGEN_ROLLEN = ['admin', 'verkauf', 'dispo'];
  var AMPEL_TEXT = { gruen: 'Fertig', gelb: 'In Arbeit', rot: 'Achtung', grau: 'Noch nicht dran' };
  var AMPEL_PILL = { gruen: 'gruen', gelb: 'gold', rot: 'rot', grau: 'grau' };
  var STATUS_LABEL = { ok: 'OK', nok: 'NOK', entfaellt: 'entfällt' };

  var S = {
    root: null, id: null, akte: null, pm: {}, frei: [], calc: null, offen: {}, geoeffnetFuer: null,
    akten: [], pmAlle: {}, freiAlle: {}, listCalc: {}, filter: 'offen', suche: '', listenBox: null, gesaet: false,
    kopfBox: null, fehltBox: null, phasenBox: null
  };
  var T = {
    akte: function () { return EG.tab('verkauf', 'akte'); },
    punkt: function () { return EG.tab('verkauf', 'punkt'); },
    frei: function () { return EG.tab('verkauf', 'freigabe'); }
  };
  function chk(r) { if (r && r.error) throw r.error; return r; }
  function jetzt() { return new Date().toISOString(); }
  function akteTitel(a) { return [a.hersteller, a.modell].filter(Boolean).join(' ') || 'Fahrzeug'; }
  function meineRolle() { return EG.istWerkstatt() ? 'werkstatt' : EG.rolle; }
  function erlaubtAnlegen() { return ANLEGEN_ROLLEN.indexOf(meineRolle()) >= 0; }
  function istOffen(a) { return a.phase_aktuell !== 'abgeschlossen' && a.phase_aktuell !== 'abgebrochen'; }
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
  function zuMap(rows) {
    var m = {};
    (rows || []).forEach(function (r) { (m[r.phase] = m[r.phase] || {})[r.punkt_key] = r; });
    return m;
  }

  /* ====================================================================
     REGELN: Ampel, Bedingungen, Sperren  (reine Berechnung, kein Speichern)
     ==================================================================== */
  /** Wert, den eine Bedingung vergleicht: bei „auswahl“ die Auswahl, sonst der Rohwert. */
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
  function bedingungErfuellt(c, eff) {
    var e = eff[c.phase] && eff[c.phase][c.k];
    if (!e) return false;
    if (c.status && e.st !== c.status) return false;
    if (c.wert !== undefined) return e.st === 'ok' && String(e.wert == null ? '' : e.wert).toLowerCase() === String(c.wert).toLowerCase();
    if (c.nichtIn) return e.st === 'ok' && e.wert != null && c.nichtIn.indexOf(e.wert) < 0;
    return true;
  }
  function ersteBedingung(liste, eff) {
    var l = liste || [];
    for (var i = 0; i < l.length; i++) if (bedingungErfuellt(l[i], eff)) return l[i];
    return null;
  }
  function findeFrei(frei, art, phase) {
    var r = null;
    (frei || []).forEach(function (f) { if (f.art === art && f.phase === phase) r = f; });
    return r;
  }

  /** Gesamtberechnung einer Akte.
      → { phasen:[info], aktuell:'v3'|'abgeschlossen', aktuellIdx, fehltBis, eff }
      info: { def, key, idx, punkte:[{def,row,st,auto,grund,wert,offen}], gruen, ampel, begonnen, nok, offenPflicht, pflichtGesamt, pflichtErledigt,
              phaseEntfaellt, phaseAuto, phaseGrund, sperren:[{typ,text}], rotGrund } */
  function berechne(akte, pm, frei) {
    var heute = EG.heute();
    var offenAkte = akte.phase_aktuell !== 'abgeschlossen' && akte.phase_aktuell !== 'abgebrochen';
    var terminUeber = offenAkte && !!akte.uebergabe_termin && akte.uebergabe_termin < heute;
    var eff = {}, res = [];
    PH.forEach(function (ph, idx) {
      var rows = pm[ph.key] || {}, effPh = (eff[ph.key] = {});
      var pr = rows._phase, auto = ersteBedingung(ph.entfaelltWenn, eff);
      var phEnt = !!auto || !!(pr && pr.status === 'entfaellt');
      var info = {
        def: ph, key: ph.key, idx: idx, punkte: [], phaseEntfaellt: phEnt, phaseAuto: !!auto, phaseGrund: auto ? (auto.grund || '') : ((pr && pr.grund) || ''),
        begonnen: !!(pr && pr.status === 'entfaellt'), nok: 0, offenPflicht: 0, pflichtGesamt: 0, pflichtErledigt: 0, sperren: [], rotGrund: ''
      };
      ph.punkte.forEach(function (p) {
        var row = rows[p.k] || null, st = row ? (row.status || 'offen') : 'offen', istAuto = false, grund = row ? row.grund : null;
        var b = ersteBedingung(p.entfaelltWenn, eff);
        if (p.abgeleitet) {
          var q = eff[p.abgeleitet.phase] && eff[p.abgeleitet.phase][p.abgeleitet.k];
          istAuto = true;
          if (q && q.st === 'ok') { st = 'ok'; grund = 'Kommt aus der Phase „' + PH_BY[p.abgeleitet.phase].name + '“: voll bezahlt.'; }
          else {
            var ov = findeFrei(frei, 'uebergabe_vor_zahlung', 'v9');
            if (ov) { st = 'entfaellt'; grund = 'Ausnahme von Oli: ' + ov.grund; } else { st = 'offen'; grund = 'Wartet auf „Voll bezahlt“ in der Phase „' + PH_BY[p.abgeleitet.phase].name + '“.'; }
          }
        } else if (b) { st = 'entfaellt'; istAuto = true; grund = b.grund || 'Entfällt automatisch'; }
        if (!istAuto && row && row.status && row.status !== 'offen') info.begonnen = true;
        var wert = wertVon(p, row);
        effPh[p.k] = { st: st, wert: wert };
        var offen = !!p.pflicht && st !== 'ok' && st !== 'entfaellt';
        if (p.pflicht && !(istAuto && st === 'entfaellt')) { info.pflichtGesamt++; if (!offen) info.pflichtErledigt++; }
        if (offen) info.offenPflicht++;
        if (st === 'nok') info.nok++;
        info.punkte.push({ def: p, row: row, st: st, auto: istAuto, grund: grund, wert: wert, offen: offen });
      });
      info.gruen = phEnt || (info.offenPflicht === 0 && info.nok === 0);
      var terminRot = terminUeber && idx <= 8 && !info.gruen;
      info.ampel = info.gruen ? 'gruen' : (info.nok > 0 || terminRot) ? 'rot' : info.begonnen ? 'gelb' : 'grau';
      if (!info.gruen) info.rotGrund = info.nok > 0 ? (info.nok + ' Punkt' + (info.nok === 1 ? '' : 'e') + ' mit NOK') : terminRot ? 'Übergabetermin überschritten' : '';

      // Sperren (nur „Phase vorher“ zählt; entfallene Phasen werden übersprungen)
      // Ausnahme: Vorbereitung (v8) läuft parallel zur Zahlung (v7) – Voraussetzung ist Olis Prüfung (v6),
      // damit die Dispo z. B. Räder bestellen kann, bevor das Geld da ist (Planner 31.10.2026, Fall 2881).
      var j = ph.key === 'v8' ? idx - 2 : idx - 1;
      while (j > 0 && res[j].phaseEntfaellt) j--;
      var prev = j >= 0 ? res[j] : null;
      var aufgehoben = !!findeFrei(frei, 'sperre_aufheben', ph.key);
      // Nachgetragene Akte: Reihenfolge nicht erzwingen (feste Sperren für Zahlung und Übergabe bleiben)
      // Olis Freigabe öffnet Zahlung und Vorbereitung auch, wenn in der Prüfung noch ein NOK steht (z. B. eVB fehlt)
      var olisFreigabe = (ph.key === 'v7' || ph.key === 'v8') && eff.v6 && eff.v6.freigabe && eff.v6.freigabe.st === 'ok';
      if (prev && !prev.gruen && !aufgehoben && !akte.nachtrag && !olisFreigabe) info.sperren.push({ typ: 'vorphase', text: 'Erst muss die Phase „' + prev.def.name + '“ grün sein.' });
      if ((ph.key === 'v7' || ph.key === 'v8') && !aufgehoben && prev && (prev.gruen || akte.nachtrag)) {
        var fr = eff.v6 && eff.v6.freigabe;
        if (!fr || fr.st !== 'ok') info.sperren.push({ typ: 'freigabe', text: 'Wartet auf Olis Freigabe in „Prüfung durch Oli“.' });
      }
      if (ph.key === 'v9' && !findeFrei(frei, 'uebergabe_vor_zahlung', 'v9')) {
        var vb = eff.v7 && eff.v7.voll_bezahlt;
        if (!vb || vb.st !== 'ok') info.sperren.push({ typ: 'zahlung', text: 'Die Zahlung ist noch nicht „voll bezahlt“. Übergabe erst danach – oder mit einer Ausnahme von Oli.' });
      }
      res.push(info);
    });
    var erster = -1, letzteBegonnene = -1;
    res.forEach(function (r, i) { if (erster < 0 && !r.gruen) erster = i; if (r.begonnen && !r.phaseEntfaellt) letzteBegonnene = i; });
    return {
      phasen: res, eff: eff, aktuellIdx: erster, aktuell: erster < 0 ? 'abgeschlossen' : PH[erster].key,
      fehltBis: erster < 0 ? -1 : Math.max(erster, letzteBegonnene)
    };
  }

  /* ---------- Rechte ---------- */
  function darfPunkt(ph, p) { return (p.rollen || ph.rollen).indexOf(meineRolle()) >= 0; }
  function darfPhaseIrgendwas(ph) { return ph.punkte.some(function (p) { return darfPunkt(ph, p); }); }

  /* ====================================================================
     Reiter registrieren
     ==================================================================== */
  EG.onTab('verkauf', function (root) {
    S.root = root;
    demoSaen();
    return S.id ? ladeDetail() : ladeListe();
  });
  window.VK_AKTE_OEFFNEN = function (id) { S.id = id; S.geoeffnetFuer = null; EG.zeigeTab('verkauf'); };
  window.VK_AKTE_ANLEGEN = async function (vb) {
    vb = vb || {};
    if (!erlaubtAnlegen()) { EG.toast('Verkaufsakten legen Verkauf, Dispo und Oli an.', 'fehler'); return null; }
    var vorh = await findeBestehende(vb);
    if (vorh) { EG.toast('Für diesen Fall gibt es schon eine Verkaufsakte. Sie wird geöffnet.'); window.VK_AKTE_OEFFNEN(vorh); return vorh; }
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
    var ids = S.akten.filter(istOffen).map(function (a) { return a.id; }), teile = [];
    for (var i = 0; i < ids.length; i += 5) teile.push(ids.slice(i, i + 5));
    var res = await Promise.all(teile.map(function (t) { return T.punkt().select('*').in('akte_id', t); }));
    var fr = chk(await T.frei().select('*'));
    S.pmAlle = {}; S.freiAlle = {}; S.listCalc = {};
    res.forEach(function (x) {
      chk(x);
      (x.data || []).forEach(function (row) { var m = (S.pmAlle[row.akte_id] = S.pmAlle[row.akte_id] || {}); (m[row.phase] = m[row.phase] || {})[row.punkt_key] = row; });
    });
    (fr.data || []).forEach(function (f) { (S.freiAlle[f.akte_id] = S.freiAlle[f.akte_id] || []).push(f); });
    S.akten.forEach(function (a) { if (istOffen(a)) S.listCalc[a.id] = berechne(a, S.pmAlle[a.id] || {}, S.freiAlle[a.id] || []); });
    zeichneListe();
  }

  function passtSuche(a) {
    var q = S.suche.trim().toLowerCase(); if (!q) return true;
    return [a.hersteller, a.modell, a.kunde_name, a.interne_nr, a.autrado_nr, a.fin, a.bestell_nr, a.verkaeufer, a.farbe].join(' ').toLowerCase().indexOf(q) >= 0;
  }
  /** Mitarbeiter der Werkstatt sehen nur Akten, bei denen die Auslieferungs-Checkliste ansteht. */
  function passtRolle(a) {
    if (meineRolle() !== 'werkstatt') return true;
    var c = S.listCalc[a.id]; if (!c) return false;
    var v8 = c.phasen[PH_BY.v8.idx];
    return !v8.gruen && !v8.sperren.length && !v8.phaseEntfaellt;
  }
  function zeichneListe() {
    S.root.innerHTML = '';
    var werk = meineRolle() === 'werkstatt';
    var suchFeld = h('input', { type: 'search', id: 'vk-suche', placeholder: 'Suchen: Kunde, Fahrzeug, Nr., FIN …', value: S.suche, 'aria-label': 'Suche' });
    suchFeld.addEventListener('input', function () { S.suche = suchFeld.value; fuelleListe(); });
    var chipLeiste = h('div', { class: 'chips' });
    function chips() {
      chipLeiste.innerHTML = '';
      [['offen', 'Offen', istOffen], ['abgeschlossen', 'Abgeschlossen', function (a) { return !istOffen(a); }], ['alle', 'Alle', null]].forEach(function (c) {
        var n = S.akten.filter(function (a) { return passtRolle(a) && (!c[2] || c[2](a)); }).length;
        chipLeiste.appendChild(h('button', {
          type: 'button', class: 'chip', 'aria-pressed': S.filter === c[0] ? 'true' : 'false', text: c[1] + ' (' + n + ')',
          onclick: function () { S.filter = c[0]; chips(); fuelleListe(); }
        }));
      });
    }
    if (!werk) chips();
    var zeile2 = h('div', { class: 'leiste-zeile' },
      h('button', { type: 'button', class: 'btn btn-ghost', text: 'Liste aktualisieren', onclick: function () { ladeListe().catch(EG.fehler); } }),
      erlaubtAnlegen() ? h('button', { type: 'button', class: 'btn btn-primary', text: 'Neue Verkaufsakte', onclick: function () { neueAkte().catch(EG.fehler); } }) : null,
      erlaubtAnlegen() ? h('button', { type: 'button', class: 'btn btn-ghost', text: 'Akte nachtragen', title: 'Für einen Verkauf, der schon passiert ist', onclick: function () { neueAkte({ nachtrag: true }).catch(EG.fehler); } }) : null);
    S.root.appendChild(h('div', { class: 'leiste' }, h('div', { class: 'leiste-zeile' }, suchFeld), zeile2, werk ? null : chipLeiste));
    if (werk) S.root.appendChild(EG.banner('Du siehst nur Fahrzeuge, bei denen die Auslieferungs-Checkliste ansteht.', 'info'));
    S.listenBox = h('div', { class: 'raster' });
    S.root.appendChild(S.listenBox);
    fuelleListe();
  }
  function fuelleListe() {
    var box = S.listenBox; box.innerHTML = '';
    var l = S.akten.filter(function (a) {
      if (!passtRolle(a) || !passtSuche(a)) return false;
      if (meineRolle() === 'werkstatt') return true;
      return S.filter === 'alle' || (S.filter === 'offen' ? istOffen(a) : !istOffen(a));
    });
    l.sort(function (a, b) {
      var oa = istOffen(a), ob = istOffen(b);
      if (oa !== ob) return oa ? -1 : 1;
      if (oa) { var x = a.uebergabe_termin || '9999-12-31', y = b.uebergabe_termin || '9999-12-31'; return x < y ? -1 : x > y ? 1 : 0; }
      var u = a.updated_at || '', v = b.updated_at || ''; return u < v ? 1 : u > v ? -1 : 0;
    });
    if (!l.length) { box.appendChild(h('div', { class: 'leer', style: 'grid-column:1/-1', text: S.akten.length ? 'Keine Akten in dieser Ansicht.' : 'Noch keine Verkaufsakte. Lege mit „Neue Verkaufsakte“ die erste an.' })); return; }
    l.forEach(function (a) { box.appendChild(akteKarte(a)); });
  }
  function ampelZeile(phasen) {
    var wrap = h('div', { class: 'vk-dots', role: 'list' });
    phasen.forEach(function (p) {
      wrap.appendChild(h('span', { class: 'vk-dot ' + p.ampel, role: 'listitem', title: p.name + ': ' + p.text, 'aria-label': p.name + ': ' + p.text }));
    });
    return wrap;
  }
  function akteKarte(a) {
    var c = S.listCalc[a.id], phasen, aktText, aktArt = 'grau', zeilePhase = '', rot = false;
    if (!istOffen(a)) {
      var abg = a.phase_aktuell === 'abgebrochen';
      phasen = PH.map(function (p) { return { name: p.name, ampel: abg ? 'grau' : 'gruen', text: abg ? 'abgebrochen' : 'fertig' }; });
      aktText = abg ? 'Abgebrochen' : 'Abgeschlossen'; aktArt = abg ? 'grau' : 'gruen';
    } else {
      phasen = c.phasen.map(function (p) { return { name: p.def.name, ampel: p.ampel, text: p.phaseEntfaellt ? 'entfällt' : AMPEL_TEXT[p.ampel].toLowerCase() }; });
      var cur = c.aktuellIdx >= 0 ? c.phasen[c.aktuellIdx] : null;
      aktText = cur ? cur.def.name : 'Alles grün'; aktArt = cur ? AMPEL_PILL[cur.ampel] : 'gruen';
      if (cur) zeilePhase = 'Jetzt: ' + cur.def.name + ' – ' + cur.pflichtErledigt + ' von ' + cur.pflichtGesamt + ' Pflichtpunkten erledigt' + (cur.rotGrund ? ' (' + cur.rotGrund + ')' : '');
      rot = c.phasen.some(function (p) { return p.ampel === 'rot'; });
    }
    var ueber = istOffen(a) && a.uebergabe_termin && a.uebergabe_termin < EG.heute();
    return h('button', { type: 'button', class: 'karte fz-karte vk-karte' + (rot ? ' rot' : ''), onclick: function () { oeffne(a.id).catch(EG.fehler); } },
      h('div', { class: 'karte-kopf' }, h('div', { class: 'fz-titel', text: akteTitel(a) }), EG.pill(aktText, aktArt)),
      h('div', { class: 'fz-zeile fett', text: a.kunde_name || 'Kunde fehlt' }),
      h('div', { class: 'fz-zeile', text: [a.interne_nr ? 'Nr. ' + a.interne_nr : '', a.autrado_nr ? 'Autrado ' + a.autrado_nr : '', a.verkaeufer ? 'Verkäufer ' + a.verkaeufer : ''].filter(Boolean).join(' · ') || 'ohne Nummer' }),
      ampelZeile(phasen),
      zeilePhase ? h('div', { class: 'fz-zeile', text: zeilePhase }) : null,
      a.uebergabe_termin ? h('div', { class: 'fz-zeile' + (ueber ? ' rot-text fett' : ''), text: 'Übergabe: ' + EG.fmtDatum(a.uebergabe_termin) + (ueber ? ' (überschritten)' : '') }) : null);
  }

  async function neueAkte(vb) {
    var id = await akteDialog(vb || {}, null);
    if (id) await oeffne(id);
  }

  /* ---------- Akte anlegen / Daten ändern ---------- */
  /** Dialog Neue Akte (vorhanden=null) oder Daten ändern (vorhanden=Akte). → Promise<akte_id | null> */
  async function akteDialog(vb, vorhanden) {
    var v = vorhanden || vb || {};
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
      verk: h('select', { id: 'vk-f-verk' }, h('option', { value: '', text: '– noch offen –' }), VERKAEUFER.map(function (k) { return h('option', { value: k, text: k }); })),
      termin: h('input', { type: 'date', id: 'vk-f-termin', value: v.uebergabe_termin || '' }),
      bestell: h('input', { type: 'text', id: 'vk-f-bestell', value: v.bestell_nr || '', placeholder: 'z. B. 2610-12345' }),
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
      h('div', { class: 'zeile2' }, EG.feld('Verkäufer', F.verk), EG.feld('Übergabetermin', F.termin)),
      EG.feld('Bestell-Nr.', F.bestell),
      h('label', { class: 'vk-nachtrag-wahl', style: 'display:flex;gap:10px;align-items:flex-start;margin-top:10px;cursor:pointer' }, F.nachtrag,
        h('span', {}, h('strong', { text: 'Akte nachtragen' }), h('br'),
          h('span', { class: 'muted klein', text: 'Der Verkauf ist schon passiert. Die Phasen müssen nicht der Reihe nach grün sein. Zahlung bleibt bis zu Olis Freigabe gesperrt, Übergabe bis „voll bezahlt“.' }))));
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
          var felder = {
            interne_nr: nr || null, autrado_nr: F.autrado.value.trim() || null, hersteller: F.hersteller.value.trim() || null, modell: F.modell.value.trim(),
            farbe: F.farbe.value.trim() || null, fin: fin || null, kunde_name: F.kunde.value.trim(), kunde_telefon: F.tel.value.trim() || null,
            kunde_email: F.mail.value.trim() || null, verkaeufer: F.verk.value || null, uebergabe_termin: F.termin.value || null, bestell_nr: F.bestell.value.trim() || null,
            nachtrag: !!F.nachtrag.checked
          };
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
            phase_aktuell: 'v1', erstellt_von_name: EG.nutzerName() || EG.nutzer()
          }, felder);
          var r = chk(await T.akte().insert(rec).select().single());
          neu.id = r.data.id;
          // bekannte Angaben gleich als erledigt eintragen
          var name = EG.nutzerName() || EG.nutzer();
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
      T.frei().select('*').eq('akte_id', S.id).order('am', { ascending: true })
    ]);
    if (x[0].error || !x[0].data) { EG.toast('Akte nicht gefunden.', 'fehler'); S.id = null; return ladeListe(); }
    chk(x[1]); chk(x[2]);
    S.akte = x[0].data; S.pm = zuMap(x[1].data); S.frei = x[2].data || [];
    neuBerechnen();
    if (S.geoeffnetFuer !== S.id) {   // beim ersten Öffnen: aktuelle Phase aufklappen
      S.geoeffnetFuer = S.id; S.offen = {};
      if (S.calc.aktuellIdx >= 0) S.offen[S.calc.aktuell] = true;
    }
    zeichneDetail();
  }
  function neuBerechnen() { S.calc = berechne(S.akte, S.pm, S.frei); }
  function zurListe() { S.id = null; ladeListe().catch(EG.fehler); window.scrollTo(0, 0); }

  function zeichneDetail() {
    var y = window.scrollY, root = S.root;
    root.innerHTML = '';
    root.appendChild(h('button', { type: 'button', class: 'btn btn-ghost zurueck', text: '← Zur Liste', onclick: zurListe }));
    S.kopfBox = h('div', {}); S.fehltBox = h('div', {}); S.phasenBox = h('div', { class: 'vk-phasen' });
    root.appendChild(S.kopfBox); root.appendChild(S.fehltBox);
    root.appendChild(h('h2', { text: 'Phasen', style: 'margin:18px 0 8px' }));
    root.appendChild(S.phasenBox);
    root.appendChild(untenKarte());
    zeichneKopf(); zeichnePhasen();
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
    S.calc.phasen.forEach(function (info) { S.phasenBox.appendChild(phaseKarte(info)); });
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
    var ueber = istOffen(a) && a.uebergabe_termin && a.uebergabe_termin < EG.heute();
    z('Übergabetermin', a.uebergabe_termin ? h('span', {}, EG.fmtDatum(a.uebergabe_termin), ueber ? [' ', EG.pill('überschritten', 'rot')] : null) : 'noch nicht festgelegt');
    var cur = c.aktuellIdx >= 0 ? c.phasen[c.aktuellIdx] : null;
    var art = !istOffen(a) ? (a.phase_aktuell === 'abgebrochen' ? 'grau' : 'gruen') : cur ? AMPEL_PILL[cur.ampel] : 'gruen';
    var txt = a.phase_aktuell === 'abgebrochen' ? 'Abgebrochen' : cur ? 'Jetzt: ' + cur.def.name : 'Abgeschlossen';
    return h('div', { class: 'karte' },
      h('div', { class: 'karte-kopf' }, h('h2', { text: akteTitel(a) }), EG.pill(txt, art)),
      (a.farbe || a.fin) ? h('div', { class: 'fz-zeile', text: [a.farbe, a.fin ? 'FIN ' + a.fin : ''].filter(Boolean).join(' · ') }) : null,
      h('div', { class: 'abstand' }), dl,
      a.nachtrag && istOffen(a) ? EG.banner('Nachgetragene Akte: Du kannst jede Phase sofort abhaken. Zahlung öffnet erst nach Olis Freigabe, Übergabe erst nach „voll bezahlt“.', 'info') : null,
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
    c.phasen.forEach(function (info) {
      var txt = info.phaseEntfaellt ? 'entfällt' : AMPEL_TEXT[info.ampel];
      leiste.appendChild(h('button', {
        type: 'button', class: 'vk-ph-chip' + (info.idx === c.aktuellIdx ? ' aktuell' : ''),
        'aria-label': info.def.name + ': ' + txt, title: info.def.name + ': ' + txt,
        onclick: function () { springeZu(info.key); }
      }, h('span', { class: 'vk-dot gross ' + info.ampel, 'aria-hidden': 'true' }), h('span', { text: info.def.name })));
    });
    return leiste;
  }

  /* ---------- Was fehlt noch ---------- */
  function fehltKarte() {
    var c = S.calc, a = S.akte;
    var karte = h('div', { class: 'karte vk-fehlt' }, h('h2', { text: 'Was fehlt noch' }));
    if (a.phase_aktuell === 'abgebrochen') { karte.appendChild(h('p', { class: 'muted', text: 'Verkauf abgebrochen – nichts mehr offen.' })); return karte; }
    if (c.aktuellIdx < 0) { karte.appendChild(EG.banner('Alles erledigt. Alle zehn Phasen sind grün.', 'ok')); return karte; }
    var liste = h('div', { class: 'vk-fehlt-liste' }), n = 0;
    for (var i = 0; i <= c.fehltBis; i++) {
      var info = c.phasen[i];
      if (info.gruen) continue;
      if (info.sperren.length && i === c.aktuellIdx) {
        info.sperren.forEach(function (s) { liste.appendChild(h('div', { class: 'vk-fehlt-sperre', text: 'Gesperrt: ' + s.text })); });
      }
      var acOffen = 0, acErste = null;
      info.punkte.forEach(function (pe) {
        if (!(pe.offen || pe.st === 'nok')) return;
        n++;
        if (pe.def.gruppe === 'ac') { acOffen++; if (!acErste) acErste = pe; return; }
        liste.appendChild(fehltEintrag(info, pe, pe.def.text));
      });
      if (acOffen) liste.appendChild(fehltEintrag(info, acErste, 'Auslieferungs-Checkliste: ' + acOffen + ' Punkt' + (acOffen === 1 ? '' : 'e') + ' offen'));
    }
    var cur = c.phasen[c.aktuellIdx];
    karte.appendChild(h('p', { class: 'muted klein', text: n + ' offene' + (n === 1 ? 'r Punkt' : ' Punkte') + ' bis die Phase „' + cur.def.name + '“ grün ist. Tippe auf einen Eintrag, dann springst du hin.' }));
    karte.appendChild(liste);
    return karte;
  }
  function fehltEintrag(info, pe, text) {
    return h('button', { type: 'button', class: 'vk-fehlt-item', onclick: function () { springeZu(info.key, pe.def.k); } },
      h('span', { class: 'vk-fehlt-phase', text: info.def.name }),
      h('span', { class: 'vk-fehlt-text', text: text }),
      pe.st === 'nok' ? EG.pill('NOK', 'rot') : null);
  }
  function springeZu(phKey, punktKey) {
    S.offen[phKey] = true;
    var det = document.getElementById('vk-ph-' + phKey);
    if (det) det.open = true;
    var ziel = punktKey ? document.getElementById('vk-p-' + phKey + '-' + punktKey) : det;
    if (ziel) {
      var p = ziel.parentNode;
      while (p && p !== S.phasenBox) { if (p.tagName === 'DETAILS') { p.open = true; if (p.getAttribute('data-gruppe')) S.offen['gr_' + phKey] = true; } p = p.parentNode; }
      setTimeout(function () {
        ziel.scrollIntoView({ behavior: 'smooth', block: punktKey ? 'center' : 'start' });
        ziel.classList.add('vk-blink'); setTimeout(function () { ziel.classList.remove('vk-blink'); }, 1600);
      }, 40);
    }
  }

  /* ---------- Phase ---------- */
  function phaseKarte(info) {
    var ph = info.def, det = h('details', { class: 'vk-phase ' + info.ampel, id: 'vk-ph-' + ph.key });
    det.open = !!S.offen[ph.key];
    det.addEventListener('toggle', function () { S.offen[ph.key] = det.open; });
    var gesperrt = info.sperren.length > 0;
    var kurz = info.phaseEntfaellt ? 'entfällt' : info.pflichtErledigt + ' von ' + info.pflichtGesamt + ' Pflichtpunkten';
    var pillText = gesperrt ? 'Gesperrt' : info.phaseEntfaellt ? 'Entfällt' : (info.ampel === 'grau' && info.idx === S.calc.aktuellIdx) ? 'Jetzt dran' : AMPEL_TEXT[info.ampel];
    det.appendChild(h('summary', { class: 'vk-ph-kopf' },
      h('span', { class: 'vk-dot gross ' + info.ampel, 'aria-hidden': 'true' }),
      h('span', { class: 'vk-ph-name', text: ph.name }),
      h('span', { class: 'vk-ph-info', text: kurz + (info.rotGrund && !info.phaseEntfaellt ? ' · ' + info.rotGrund : '') }),
      EG.pill(pillText, gesperrt ? 'grau' : info.phaseEntfaellt ? 'grau' : AMPEL_PILL[info.ampel])));
    var body = h('div', { class: 'vk-ph-body' });
    body.appendChild(h('div', { class: 'klein muted', text: 'Abhaken: ' + ph.wer }));
    if (ph.hinweis) body.appendChild(h('div', { class: 'klein muted', style: 'margin-top:2px', text: ph.hinweis }));
    if (gesperrt) body.appendChild(sperrBanner(info));
    var ovs = S.frei.filter(function (f) { return (f.art === 'sperre_aufheben' && f.phase === ph.key) || (f.art === 'uebergabe_vor_zahlung' && ph.key === 'v9'); });
    ovs.forEach(function (f) {
      body.appendChild(EG.banner([h('strong', { text: 'Sperre aufgehoben ' }), 'von ' + (f.von_name || 'Oli') + (f.am ? ' am ' + EG.fmtDatum(f.am) : '') + ': ' + f.grund], 'warn'));
    });
    if (!darfPhaseIrgendwas(ph)) body.appendChild(EG.banner('Du siehst diese Phase nur. Abhaken: ' + ph.wer + '.', 'info'));
    var darfPhase = darfPhaseIrgendwas(ph) && !gesperrt;
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
        body.appendChild(punktKarte(info, pe, false));
      });
      if (ph.entfaellbar && darfPhase) {
        body.appendChild(h('div', { style: 'margin-top:12px' }, h('button', { type: 'button', class: 'btn btn-ghost btn-klein', text: 'Ganze Phase entfällt …', onclick: function () { phaseEntfaellt(info, true).catch(EG.fehler); } })));
      }
    }
    det.appendChild(body);
    return det;
  }
  function sperrBanner(info) {
    var box = h('div', { class: 'banner warn vk-sperre' },
      h('strong', { text: 'Gesperrt – du kannst die Punkte ansehen, aber noch nicht abhaken.' }),
      h('ul', {}, info.sperren.map(function (s) { return h('li', { text: s.text }); })));
    if (EG.istAdmin()) {
      box.appendChild(h('button', { type: 'button', class: 'btn btn-ghost btn-klein', text: 'Sperre aufheben (nur Oli) …', onclick: function () { sperreAufheben(info).catch(EG.fehler); } }));
    } else {
      box.appendChild(h('div', { class: 'klein', text: 'Nur Oli kann eine Sperre mit Begründung aufheben.' }));
    }
    return box;
  }
  async function sperreAufheben(info) {
    if (!EG.istAdmin()) { EG.toast('Nur Oli kann eine Sperre aufheben.', 'fehler'); return; }
    var ta = h('textarea', { id: 'vk-sperre-grund', placeholder: 'Warum darf die Phase trotzdem starten?' });
    var ok = await EG.dialog({
      titel: 'Sperre aufheben: ' + info.def.name,
      inhalt: [h('ul', { style: 'margin:0 0 10px 20px' }, info.sperren.map(function (s) { return h('li', { text: s.text }); })), EG.feld('Begründung (Pflicht)', ta)],
      knoepfe: [{ text: 'Abbrechen', art: 'ghost', wert: null }, {
        text: 'Sperre aufheben', art: 'primary', wert: 'ok',
        aktion: async function () {
          if (!ta.value.trim()) return 'Bitte eine Begründung eintragen.';
          var arten = {};
          info.sperren.forEach(function (s) { arten[s.typ === 'zahlung' ? 'uebergabe_vor_zahlung' : 'sperre_aufheben'] = 1; });
          var keys = Object.keys(arten);
          for (var i = 0; i < keys.length; i++) await freigabeSchreiben(keys[i], info.key, ta.value.trim(), null);
          return true;
        }
      }]
    });
    if (ok === 'ok') { EG.toast('Sperre aufgehoben. Der Eintrag bleibt als Nachweis stehen.', 'ok'); aktualisiere(true); }
  }
  async function freigabeSchreiben(art, phase, grund, betrag) {
    var r = chk(await T.frei().insert({ akte_id: S.id, art: art, phase: phase, grund: grund, betrag: betrag == null ? null : betrag, von_name: EG.nutzerName() || EG.nutzer(), am: jetzt() }).select().single());
    S.frei.push(r.data);
    return r.data;
  }
  async function phaseEntfaellt(info, an) {
    if (an) {
      var g = await EG.eingabe('Warum entfällt die ganze Phase „' + info.def.name + '“?', { titel: 'Phase entfällt', platzhalter: 'Grund', ok: 'Entfällt' });
      if (!g) return;
      await seriell(async function () {
        S.pm[info.key] = S.pm[info.key] || {};
        S.pm[info.key]._phase = await punktRoh(S.id, info.key, '_phase', { status: 'entfaellt', grund: g, name: EG.nutzerName() || EG.nutzer() });
      });
    } else {
      await seriell(async function () {
        S.pm[info.key] = S.pm[info.key] || {};
        S.pm[info.key]._phase = await punktRoh(S.id, info.key, '_phase', { status: 'offen' });
      });
    }
    await nachSpeichern({});
    aktualisiere(true);
  }

  /* ---------- Auslieferungs-Checkliste (Gruppe in V8) ---------- */
  function acGruppe(info) {
    var pes = info.punkte.filter(function (pe) { return pe.def.gruppe === 'ac'; });
    var zaehlt = pes.filter(function (pe) { return pe.def.pflicht && !(pe.auto && pe.st === 'entfaellt'); });
    var erl = zaehlt.filter(function (pe) { return pe.st === 'ok' || pe.st === 'entfaellt'; }).length;
    var key = 'gr_' + info.key;
    var det = h('details', { class: 'vk-gruppe', 'data-gruppe': 'ac' });
    det.open = !!S.offen[key];
    det.addEventListener('toggle', function () { S.offen[key] = det.open; });
    det.appendChild(h('summary', { class: 'vk-gr-kopf' }, h('span', { class: 'vk-ph-name', text: 'Auslieferungs-Checkliste' }),
      h('span', { class: 'vk-ph-info', text: erl + ' von ' + zaehlt.length + ' Punkten' }), EG.pill(erl === zaehlt.length ? 'Fertig' : 'Offen', erl === zaehlt.length ? 'gruen' : 'grau')));
    var body = h('div', { class: 'vk-gr-body' });
    body.appendChild(h('p', { class: 'klein muted', text: 'Jeder Punkt: OK, NOK oder entfällt – mit Name und Zeit. Die Werkstatt hakt hier über das Werkstatt-Konto mit Namenseintrag ab.' }));
    var blockName = null;
    pes.forEach(function (pe) {
      if (pe.def.block !== blockName) {
        blockName = pe.def.block;
        var inBlock = pes.filter(function (x) { return x.def.block === blockName; });
        var okB = inBlock.filter(function (x) { return x.st === 'ok' || x.st === 'entfaellt'; }).length;
        body.appendChild(h('div', { class: 'block-kopf' }, h('h3', { text: blockName }), h('span', { class: 'klein muted', text: okB + ' / ' + inBlock.length })));
      }
      body.appendChild(punktKarte(info, pe, true));
    });
    det.appendChild(body);
    return det;
  }

  /* ---------- Punkt ---------- */
  function statusZeile(pe) {
    var row = pe.row, bits = [];
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
        type: 'button', class: 'seg-b ' + cls[x] + (pe.st === x ? ' aktiv' : ''), 'aria-pressed': pe.st === x ? 'true' : 'false', disabled: !ed, text: labels[x],
        onclick: function () { statusKlick(info, pe, x).catch(EG.fehler); }
      }));
    });
    return seg;
  }
  function punktKarte(info, pe, kompakt) {
    var p = pe.def, st = pe.st;
    var darf = darfPunkt(info.def, p), ed = darf && !pe.auto && info.sperren.length === 0;
    var karte = h('div', {
      class: 'punkt vk-punkt' + (st === 'ok' ? ' ok' : st === 'nok' ? ' vk-nok' : st === 'entfaellt' ? ' entfaellt' : '') + (kompakt ? ' vk-ac' : '') + (!ed ? ' vk-lesen' : ''),
      id: 'vk-p-' + info.key + '-' + p.k
    });
    var titel = h('div', { class: 'punkt-titel' }, p.text, p.pflicht ? null : h('span', { class: 'vk-opt', text: ' (freiwillig)' }));
    if (pe.auto) {
      karte.appendChild(titel);
      karte.appendChild(h('div', { class: 'vk-auto', text: (st === 'entfaellt' ? 'Entfällt: ' : st === 'ok' ? 'Erledigt: ' : 'Offen: ') + (pe.grund || '') }));
      return karte;
    }
    if (kompakt) karte.appendChild(h('div', { class: 'vk-ac-zeile' }, titel, segment(info, pe, ed)));
    else karte.appendChild(titel);
    if (p.hinweis) karte.appendChild(h('div', { class: 'punkt-hinweis', text: p.hinweis }));
    if (p.eingabe) karte.appendChild(eingabeBlock(info, pe, ed));
    if (p.spezial === 'nachlass') karte.appendChild(nachlassBlock(info, pe, ed));
    if (p.foto) karte.appendChild(fotoBereich(info, pe, ed));
    if (!kompakt) karte.appendChild(segment(info, pe, ed));
    var sz = statusZeile(pe); if (sz) karte.appendChild(sz);
    return karte;
  }

  /* ---------- Eingabefelder ---------- */
  function wertKopie(pe) { return Object.assign({}, (pe.row && pe.row.wert && typeof pe.row.wert === 'object') ? pe.row.wert : {}); }
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
      t.addEventListener('change', function () { var neu = Object.assign({}, w); if (t.value.trim()) neu.text = t.value.trim(); else delete neu.text; aendereWert(neu, false); });
      box.appendChild(EG.feld(label || 'Eintrag', t));
    } else if (p.eingabe === 'bestaetigung') {
      var bw = wertVon(p, pe.row);
      box.appendChild(h('div', { class: bw ? 'fett' : 'muted', text: bw ? 'Bestätigt von ' + bw.name + ' am ' + EG.fmtDatum(bw.datum) : 'Noch nicht bestätigt.' }));
      if (bw && ed) box.appendChild(h('button', { type: 'button', class: 'btn btn-ghost btn-klein', style: 'margin-top:6px', text: 'Name / Datum ändern', onclick: function () { bestaetigen(info, pe).catch(EG.fehler); } }));
    }
    return box;
  }
  /** Dialog Name + Datum (Endkontrolle). → true wenn gespeichert */
  async function bestaetigen(info, pe) {
    var alt = wertVon(pe.def, pe.row);
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
    var p = pe.def, fotos = (pe.row && pe.row.fotos) || [];
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
     SPEICHERN (je Punkt sofort)
     ==================================================================== */
  async function statusKlick(info, pe, wunsch) {
    var p = pe.def;
    if (!darfPunkt(info.def, p) || info.sperren.length || pe.auto) return;
    if (pe.st === wunsch) { await aendern(info, p, { status: 'offen', grund: null }); return; }   // Tipp auf den aktiven Knopf nimmt zurück
    if (wunsch === 'ok') {
      if (p.eingabe === 'bestaetigung' && !wertVon(p, pe.row)) { await bestaetigen(info, pe); return; }
      await aendern(info, p, { status: 'ok', grund: null });
      return;
    }
    var frage = wunsch === 'nok'
      ? (p.k === 'freigabe' ? 'Welche Rückfrage hast du an den Verkauf?' : 'Was ist nicht in Ordnung?')
      : 'Warum entfällt dieser Punkt?';
    var g = await EG.eingabe(frage, { titel: p.text, vorgabe: (pe.row && pe.row.grund) || '', platzhalter: 'Grund (Pflicht)', ok: 'Speichern' });
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
  async function namePflicht() {
    var n = EG.nutzerName();
    if (!n && EG.istWerkstatt()) n = await EG.nameAbfragen(true);
    return n || EG.nutzer();
  }

  /** Ändert einen Punkt und speichert sofort (upsert verkauf.punkt, Konflikt akte_id,phase,punkt_key).
      patch: { status?, wert?, grund?, fotos?, auto? (Wert eingegeben → OK, wenn alles stimmt, sonst offen), render?, nachher? } → Promise<boolean> */
  function aendern(info, p, patch) {
    return seriell(async function () {
      var pm = (S.pm[info.key] = S.pm[info.key] || {}), row = pm[p.k] || null, alt = row ? row.status : 'offen';
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
      var name = await namePflicht(), gesetzt = neu.status !== 'offen';
      var data = {
        akte_id: S.id, phase: info.key, punkt_key: p.k, status: neu.status, wert: neu.wert, grund: neu.grund, fotos: neu.fotos,
        erledigt_von_name: gesetzt ? name : null, erledigt_am: gesetzt ? jetzt() : null, updated_at: jetzt()
      };
      var r = chk(await T.punkt().upsert(data, { onConflict: 'akte_id,phase,punkt_key' }).select().single());
      pm[p.k] = r.data;
      if (patch.nachher) await patch.nachher();
      // Nebenwirkungen auf die Akte
      var extra = {};
      if (neu.status === 'ok' && neu.wert) {
        if (p.setzeVerkaeufer && neu.wert.auswahl) extra.verkaeufer = neu.wert.auswahl;
        if (p.setzeBestellNr && neu.wert.text) extra.bestell_nr = neu.wert.text;
        if (p.setzeUebergabetermin && neu.wert.datum) extra.uebergabe_termin = neu.wert.datum;
      }
      if (info.key === 'v6' && p.k === 'freigabe' && neu.status === 'ok' && !findeFrei(S.frei, 'akte_frei', 'v6')) {
        await freigabeSchreiben('akte_frei', 'v6', 'Freigabe an die Dispo', null);
      }
      await nachSpeichern(extra);
      var voll = neu.status !== alt || (p.eingabe && p.eingabe !== 'text') || Object.keys(extra).length > 0 || !!patch.render;
      aktualisiere(voll);
      return true;
    });
  }
  /** Phase der Akte nachführen (und Felder aus den Punkten übernehmen). */
  async function nachSpeichern(extra) {
    neuBerechnen();
    var upd = Object.assign({}, extra), a = S.akte;
    if (EG.istWerkstatt()) return;   // werkstatt darf die Akte nicht ändern (RLS); die Phase führt der nächste Verkauf/Dispo-Aufruf nach
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
      var a2 = Object.assign({}, S.akte, { phase_aktuell: 'v1' });
      var c = berechne(a2, S.pm, S.frei);
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
     DEMO-DATEN (nur ?demo=1): 3 erfundene Akten
     ==================================================================== */
  function demoSaen() {
    if (!EG.demo || S.gesaet) return;
    S.gesaet = true;
    var heute = new Date();
    function tag(n) { var x = new Date(heute); x.setDate(x.getDate() + n); return EG.isoDatum(x); }
    function vor(n, std) { var x = new Date(heute); x.setDate(x.getDate() - n); x.setHours(std || 10, 20, 0, 0); return x.toISOString(); }
    var rows = [], frei = [];
    function akte(id, o) {
      return Object.assign({
        id: id, interne_nr: '', autrado_nr: '', fin: '', hersteller: '', modell: '', farbe: '', ml_ref: null, lead_ref: null, bestell_nr: null, job_nr: null,
        kunde_name: '', kunde_telefon: '0711 000000', kunde_email: null, verkaeufer: 'OS', phase_aktuell: 'v1', uebergabe_termin: null, notiz: null,
        created_at: vor(8), updated_at: vor(1), erstellt_von_name: 'Demo Mitarbeiter'
      }, o);
    }
    var A = akte('a0000001-0000-4000-8000-000000000001', { interne_nr: '90101', autrado_nr: '900101', fin: 'DEMO0000000000101', hersteller: 'Hyundai', modell: 'Tucson 1.6 T-GDI Demo', farbe: 'Polar White', kunde_name: 'Muster, Max', kunde_email: 'max.muster@demo.example', verkaeufer: 'NP', created_at: vor(3) });
    var B = akte('a0000001-0000-4000-8000-000000000002', { interne_nr: '90102', autrado_nr: '900102', fin: 'DEMO0000000000102', hersteller: 'Kia', modell: 'Sportage 1.6 Demo', farbe: 'Deep Chroma Blue', kunde_name: 'Beispiel, Erika', kunde_email: 'erika.beispiel@demo.example', verkaeufer: 'OS', bestell_nr: '2610-90102', uebergabe_termin: tag(5), created_at: vor(9) });
    var C = akte('a0000001-0000-4000-8000-000000000003', { interne_nr: '90103', autrado_nr: '900103', fin: 'DEMO0000000000103', hersteller: 'Opel', modell: 'Mokka Demo Edition', farbe: 'Rot', kunde_name: 'Probe, Peter', kunde_email: 'peter.probe@demo.example', verkaeufer: 'AI', bestell_nr: '2610-90103', uebergabe_termin: tag(2), created_at: vor(14) });
    var pmA = {}, pmB = {}, pmC = {};

    function standardWert(p, set) {
      switch (p.eingabe) {
        case 'auswahl': return { auswahl: set && set.auswahl ? set.auswahl : p.optionen[0] };
        case 'datum': return { datum: set && set.datum ? set.datum : tag(-2) };
        case 'betrag': return { betrag: set && set.betrag != null ? set.betrag : 1000 };
        case 'text': return { text: set && set.text ? set.text : 'Demo' };
        case 'bestaetigung': return { name: 'Demo Mitarbeiter', datum: EG.heute() };
        default: return null;
      }
    }
    function zeile(a, ph, key, f) {
      var r = {
        id: EG.uuid(), akte_id: a.id, phase: ph, punkt_key: key, status: f.status || 'ok', wert: f.wert || null, grund: f.grund || null, fotos: [],
        erledigt_von_name: f.status === 'offen' ? null : 'Demo Mitarbeiter', erledigt_am: f.status === 'offen' ? null : vor(2), updated_at: vor(2)
      };
      rows.push(r);
      return r;
    }
    /** Füllt alle bedienbaren Punkte einer Phase als „ok“; set[k] = {auswahl|datum|betrag|text|status|grund} überschreibt, nicht[k] lässt weg. */
    function fuelle(a, pm, phKey, set, bis) {
      set = set || {};
      var c = berechne(a, pm, frei), info = c.phasen[PH_BY[phKey].idx], m = (pm[phKey] = pm[phKey] || {}), n = 0;
      info.punkte.forEach(function (pe) {
        if (pe.auto) return;
        if (bis != null && n >= bis) return;
        var s = set[pe.def.k] || {};
        if (s.weglassen) return;
        n++;
        var st = s.status || 'ok';
        m[pe.def.k] = zeile(a, phKey, pe.def.k, { status: st, wert: st === 'ok' ? standardWert(pe.def, s) : null, grund: s.grund });
      });
    }
    function phaseEntf(a, pm, phKey, grund) { (pm[phKey] = pm[phKey] || {})._phase = zeile(a, phKey, '_phase', { status: 'entfaellt', grund: grund }); }
    function fertig(a, pm) { a.phase_aktuell = berechne(a, pm, frei).aktuell; }

    // A: Muster, Max – in der Beratung
    fuelle(A, pmA, 'v1', { anfrage_da: { auswahl: 'mobile.de' }, verkaeufer_zugeteilt: { auswahl: 'NP' }, kunde_angerufen: { auswahl: 'erreicht' }, ergebnis: { auswahl: 'Termin steht' }, termin_vereinbart: { datum: tag(-1) } });
    fuelle(A, pmA, 'v2', { kunde_da: { auswahl: 'mit Termin' }, inzahlung: { auswahl: 'Nein' }, finanzierung: { auswahl: 'Ja' }, probefahrt: { auswahl: 'Ja' }, bedarf: { text: 'Familienauto, Anhängerkupplung wichtig' }, fahrzeug_gezeigt: { weglassen: true }, ergebnis: { weglassen: true } }, 4);
    fertig(A, pmA);

    // B: Beispiel, Erika – in der Zahlung (Prüfung durch Oli ist grün)
    phaseEntf(B, pmB, 'v1', 'Kundin kam ohne Anfrage direkt ins Haus');
    fuelle(B, pmB, 'v2', { kunde_da: { auswahl: 'ohne Termin' }, inzahlung: { auswahl: 'Ja' }, finanzierung: { auswahl: 'Nein' }, probefahrt: { auswahl: 'Nein' }, ergebnis: { auswahl: 'Weiter zum Angebot' } });
    fuelle(B, pmB, 'v4', { nachlass: { status: 'entfaellt', grund: 'Kein Nachlass vereinbart' }, angebot: { betrag: 31900 }, zugaben: { betrag: 250 }, inz_verrechnet: { betrag: 2000 }, ergebnis: { auswahl: 'Kunde bestellt' } });
    fuelle(B, pmB, 'v5', { zahlungsart: { auswahl: 'Überweisung' }, anzahlung: { betrag: 2000 }, abholung_lieferung: { auswahl: 'Abholung' }, wunschtermin: { datum: tag(5) }, bestellung_autrado: { text: '2610-90102' }, zul_evb: { text: 'DEMO1234567' }, zul_wunschkennzeichen: { weglassen: true } });
    fuelle(B, pmB, 'v6', {});
    frei.push({ id: EG.uuid(), akte_id: B.id, art: 'akte_frei', phase: 'v6', grund: 'Freigabe an die Dispo', betrag: null, von_name: 'Oli (Demo)', am: vor(3) });
    fuelle(B, pmB, 'v7', { lief_rechnung: { auswahl: 'Kommt nach Zahlung' }, anzahlung_da: { betrag: 2000 }, abloese: { weglassen: true }, restzahlung: { weglassen: true }, voll_bezahlt: { weglassen: true } });
    fertig(B, pmB);

    // C: Probe, Peter – in der Vorbereitung, Auslieferungs-Checkliste halb abgehakt
    fuelle(C, pmC, 'v1', { anfrage_da: { auswahl: 'Website' }, verkaeufer_zugeteilt: { auswahl: 'AI' }, kunde_angerufen: { auswahl: 'nicht erreicht' }, ergebnis: { auswahl: 'Termin steht' }, termin_vereinbart: { datum: tag(-12) } });
    fuelle(C, pmC, 'v2', { kunde_da: { auswahl: 'mit Termin' }, inzahlung: { auswahl: 'Nein' }, finanzierung: { auswahl: 'Ja' }, probefahrt: { auswahl: 'Ja' }, ergebnis: { auswahl: 'Weiter zum Angebot' } });
    fuelle(C, pmC, 'v3', { ergebnis: { auswahl: 'Weiter zum Angebot' } });
    fuelle(C, pmC, 'v4', { nachlass: { betrag: 300, grund: 'Treuebonus, von Oli freigegeben' }, fin_antrag: { auswahl: 'Zusage' }, ergebnis: { auswahl: 'Kunde bestellt' } });
    pmC.v4.nachlass.wert = { betrag: 300, grund: 'Treuebonus (Demo)' };
    frei.push({ id: EG.uuid(), akte_id: C.id, art: 'nachlass', phase: 'v4', grund: 'Treuebonus (Demo)', betrag: 300, von_name: 'Oli (Demo)', am: vor(9) });
    fuelle(C, pmC, 'v5', { zahlungsart: { auswahl: 'Finanzierung' }, abholung_lieferung: { auswahl: 'Lieferung' }, wunschtermin: { datum: tag(2) }, bestellung_autrado: { text: '2610-90103' }, zul_evb: { text: 'DEMO7654321' } });
    fuelle(C, pmC, 'v6', {});
    frei.push({ id: EG.uuid(), akte_id: C.id, art: 'akte_frei', phase: 'v6', grund: 'Freigabe an die Dispo', betrag: null, von_name: 'Oli (Demo)', am: vor(6) });
    fuelle(C, pmC, 'v7', { lief_rechnung: { auswahl: 'Liegt vor (mit Einladung)' }, anzahlung_da: { betrag: 3000 }, restzahlung: { betrag: 18900 } });
    // V8: Punkte 1–4 ok, Auslieferungs-Checkliste etwa zur Hälfte, E/PHEV-Laden entfällt
    var v8 = PH_BY.v8.punkte, m8 = (pmC.v8 = {}), acZaehler = 0;
    v8.forEach(function (p) {
      if (!p.gruppe && ['repdoc_kunde', 'repdoc_fahrzeug', 'auftrag', 'arbeiten_erledigt'].indexOf(p.k) >= 0) { m8[p.k] = zeile(C, 'v8', p.k, { status: 'ok', wert: standardWert(p, { text: p.k === 'auftrag' ? 'Auftrag 90103' : 'Demo' }) }); return; }
      if (p.gruppe !== 'ac') return;
      if (p.k === 'ac_laden') { m8[p.k] = zeile(C, 'v8', p.k, { status: 'entfaellt', grund: 'Verbrenner, kein Ladekabel nötig' }); acZaehler++; return; }
      if (p.k.indexOf('ac_end_') === 0) return;
      acZaehler++;
      if (acZaehler <= 20) m8[p.k] = zeile(C, 'v8', p.k, { status: 'ok', wert: standardWert(p, {}) });
    });
    fertig(C, pmC);

    EG.demoSeed('verkauf.akte', [A, B, C]);
    EG.demoSeed('verkauf.punkt', rows);
    EG.demoSeed('verkauf.freigabe', frei);
  }
})();
