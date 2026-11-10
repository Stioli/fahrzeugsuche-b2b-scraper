/* Stieber-App – Reiter „Auslieferung“ (für Aufbereiter und Meister) und gemeinsame Auslieferungs-Checkliste
   Stand 31.10.2026. Quelle der Punkte: verkauf-phasen.js (window.VK_AC, Schlüssel ac_*).
   Baut auf window.EG aus eingang-core.js auf. Muss VOR eingang-verkauf.js geladen werden.

   Zwei Teile in dieser Datei:
   1. window.AC_UI – die Checkliste selbst (Darstellung, Rechte, Speichern). Nutzen beide Reiter:
        - Reiter „Auslieferung“ (diese Datei): Fahrzeugliste + Checkliste je Fahrzeug, ohne Verkaufsdaten
        - Reiter „Verkauf“, Phase Vorbereitung (eingang-verkauf.js): dieselbe Liste, Ampel und „Was fehlt noch“ rechnen mit
      Gespeichert wird in verkauf.auslieferung_punkt, Schlüssel = interne Nr. + Punkt (nicht mehr in verkauf.punkt).
        AC_UI.liste({ interneNr, rows, gesperrt?, idPrefix?, onChange? }) → Element
           rows = Objekt { punkt_key: Zeile }; wird beim Speichern direkt ergänzt (gleiche Referenz wie beim Aufrufer).
           onChange({ key, voll }) kommt nach jedem Speichern; voll = Status hat sich geändert (Aufrufer zeichnet neu).
        AC_UI.ladeZeilen([interne Nr.]) → Promise<{ nr: { punkt_key: Zeile } }>
        AC_UI.zaehle(rows) → { erledigt, gesamt, nok }
        AC_UI.demoSaen()  (nur im Demo-Modus wirksam)
   2. Reiter „Auslieferung“: Liste über die Edge Function auslieferung_liste (Masterliste, nur Fahrzeugdaten). */
(function () {
  'use strict';
  var EG = window.EG, h = EG && EG.h, AC = window.VK_AC;
  if (!EG) return;
  if (!AC) { console.error('verkauf-phasen.js fehlt – Reiter Auslieferung nicht aktiv.'); return; }

  /* ====================================================================
     Festwerte
     ==================================================================== */
  var BY = {}; AC.punkte.forEach(function (p) { BY[p.k] = p; });
  var STATUS_LABEL = { ok: 'OK', nok: 'NOK', entfaellt: 'entfällt' };
  var SEG_KLASSE = { ok: 'seg-ok', nok: 'seg-mangel', entfaellt: 'seg-entfaellt' };
  var ROLLE_NAME = { admin: 'Oli', dispo: 'Dispo', werkstatt: 'Werkstatt', verkauf: 'Verkauf', buchhaltung: 'Buchhaltung' };

  var T = function () { return EG.tab('verkauf', 'auslieferung_punkt'); };
  function chk(r) { if (r && r.error) throw r.error; return r; }
  function jetzt() { return new Date().toISOString(); }
  function fzTitel(f) { return [f.hersteller, f.modell].filter(Boolean).join(' ') || 'Fahrzeug'; }
  function rolle() { return EG.istWerkstatt() ? 'werkstatt' : EG.rolle; }
  function darf(def) { return def.rollen.indexOf(rolle()) >= 0; }
  var queue = Promise.resolve();
  /** Speichervorgänge laufen nacheinander (schnelles Tippen darf nichts überholen). */
  function seriell(fn) { var p = queue.then(fn); queue = p.catch(function () { /* Fehler meldet der Aufrufer */ }); return p; }
  function erledigtStatus(r) { return !!r && (r.status === 'ok' || r.status === 'entfaellt'); }

  /* ====================================================================
     TEIL 1: gemeinsame Checkliste (window.AC_UI)
     ==================================================================== */
  /** Zeilen aus verkauf.auslieferung_punkt für mehrere interne Nummern → { nr: { punkt_key: Zeile } }.
      Gruppen zu je 10 Nummern (die Data API liefert höchstens 1000 Zeilen je Abfrage, je Fahrzeug gibt es etwa 45). */
  async function ladeZeilen(nrs) {
    var seen = {}, liste = [], teile = [], out = {};
    (nrs || []).forEach(function (n) { n = String(n == null ? '' : n).trim(); if (n && !seen[n]) { seen[n] = 1; liste.push(n); } });
    for (var i = 0; i < liste.length; i += 10) teile.push(liste.slice(i, i + 10));
    var res = await Promise.all(teile.map(function (t) { return T().select('*').in('interne_nr', t); }));
    res.forEach(function (x) {
      chk(x);
      (x.data || []).forEach(function (r) { if (BY[r.punkt_key]) (out[r.interne_nr] = out[r.interne_nr] || {})[r.punkt_key] = r; });
    });
    return out;
  }
  function zaehle(rows) {
    var erl = 0, nok = 0;
    AC.punkte.forEach(function (p) {
      var r = rows && rows[p.k];
      if (erledigtStatus(r)) erl++;
      if (r && r.status === 'nok') nok++;
    });
    return { erledigt: erl, gesamt: AC.punkte.length, nok: nok };
  }

  /** Name für „erledigt von“: bei werkstatt@ der auf dem Gerät gemerkte Name (sonst Abfrage), sonst Anzeigename. */
  async function namePflicht() {
    var n = EG.nutzerName();
    if (!n && EG.istWerkstatt()) n = await EG.nameAbfragen(true);
    return n || EG.nutzer();
  }
  function bestaetigtWert(def, row) {
    var w = row && row.wert;
    return (w && typeof w === 'object' && w.name && w.datum) ? w : null;
  }
  function wertKopie(row) { return Object.assign({}, (row && row.wert && typeof row.wert === 'object') ? row.wert : {}); }

  function pruefeOk(def, neu) {
    var w = neu.wert || {};
    if (def.eingabe === 'text' && def.wertPflicht && !String(w.text || '').trim()) return 'Bitte erst „' + (def.label || 'Eintrag') + '“ eintragen.';
    if (def.eingabe === 'bestaetigung' && !(w.name && w.datum)) return 'Bitte Name und Datum bestätigen.';
    return null;
  }

  /** Ändert einen Punkt und speichert sofort (upsert verkauf.auslieferung_punkt, Konflikt interne_nr,punkt_key).
      patch: { status?, wert?, grund?, fotos? } → Promise<boolean> */
  function aendern(o, def, patch) {
    return seriell(async function () {
      var row = o.rows[def.k] || null, alt = row ? (row.status || 'offen') : 'offen';
      var neu = {
        status: patch.status !== undefined ? patch.status : alt,
        wert: patch.wert !== undefined ? patch.wert : (row ? row.wert : null),
        grund: patch.grund !== undefined ? patch.grund : (row ? row.grund : null),
        fotos: patch.fotos !== undefined ? patch.fotos : (row && row.fotos ? row.fotos : [])
      };
      if (neu.status === 'ok') {
        var fehler = pruefeOk(def, neu);
        if (fehler) { EG.toast(fehler, 'fehler'); return false; }
      }
      if ((neu.status === 'nok' || neu.status === 'entfaellt') && !neu.grund) { EG.toast('Bitte einen Grund eintragen.', 'fehler'); return false; }
      if (neu.status === 'ok' || neu.status === 'offen') neu.grund = null;
      var name = await namePflicht(), gesetzt = neu.status !== 'offen';
      var data = {
        interne_nr: o.interneNr, punkt_key: def.k, status: neu.status, wert: neu.wert, grund: neu.grund, fotos: neu.fotos,
        erledigt_von_name: gesetzt ? name : null, erledigt_am: gesetzt ? jetzt() : null, updated_at: jetzt()
      };
      var r = chk(await T().upsert(data, { onConflict: 'interne_nr,punkt_key' }).select().single());
      o.rows[def.k] = r.data;
      if (o.onChange) o.onChange({ key: def.k, voll: neu.status !== alt });
      return true;
    });
  }

  async function statusKlick(o, def, wunsch) {
    var row = o.rows[def.k] || null, st = row ? (row.status || 'offen') : 'offen';
    if (!darf(def) || o.gesperrt) return;
    if (st === wunsch) {   // Tipp auf den aktiven Knopf nimmt zurück
      var zurueck = { status: 'offen', grund: null };
      if (def.eingabe === 'bestaetigung') zurueck.wert = null;
      await aendern(o, def, zurueck);
      return;
    }
    if (wunsch === 'ok') {
      if (def.eingabe === 'bestaetigung' && !bestaetigtWert(def, row)) { await bestaetigen(o, def); return; }
      await aendern(o, def, { status: 'ok', grund: null });
      return;
    }
    var frage = wunsch === 'nok' ? 'Was ist nicht in Ordnung?' : 'Warum entfällt dieser Punkt?';
    var g = await EG.eingabe(frage, { titel: def.text, vorgabe: (row && row.grund) || '', platzhalter: 'Grund (Pflicht)', ok: 'Speichern' });
    if (!g) return;
    await aendern(o, def, { status: wunsch, grund: g });
  }

  /** Dialog Name + Datum (Endkontrolle). → true wenn gespeichert */
  async function bestaetigen(o, def) {
    var alt = bestaetigtWert(def, o.rows[def.k]);
    var name = h('input', { type: 'text', id: 'ac-b-name', value: alt ? alt.name : (EG.nutzerName() || ''), placeholder: 'Vorname Nachname', autocomplete: 'off' });
    var datum = h('input', { type: 'date', id: 'ac-b-datum', value: alt ? alt.datum : EG.heute() });
    var ok = await EG.dialog({
      titel: def.text, inhalt: [h('p', { class: 'muted klein', style: 'margin-bottom:10px', text: 'Wer hat kontrolliert? Name und Datum werden gespeichert.' }), EG.feld('Name', name), EG.feld('Datum', datum)],
      knoepfe: [{ text: 'Abbrechen', art: 'ghost', wert: null }, {
        text: 'Bestätigen', art: 'primary', wert: 'ok',
        aktion: function () { if (!name.value.trim()) return 'Bitte den Namen eintragen.'; if (!datum.value) return 'Bitte das Datum eintragen.'; return true; }
      }]
    });
    if (ok !== 'ok') return false;
    return aendern(o, def, { status: 'ok', grund: null, wert: { name: name.value.trim(), datum: datum.value } });
  }

  /* ---------- Darstellung eines Punktes ---------- */
  function segment(o, def, st, ed) {
    var liste = def.seg || ['ok', 'nok', 'entfaellt'];
    if (def.keinEntfaellt) liste = liste.filter(function (x) { return x !== 'entfaellt'; });
    var seg = h('div', { class: 'seg vk-seg', role: 'group', 'aria-label': def.text, style: 'grid-template-columns:repeat(' + liste.length + ',1fr)' });
    liste.forEach(function (x) {
      seg.appendChild(h('button', {
        type: 'button', class: 'seg-b ' + SEG_KLASSE[x] + (st === x ? ' aktiv' : ''), 'aria-pressed': st === x ? 'true' : 'false', disabled: !ed, text: STATUS_LABEL[x],
        onclick: function () { statusKlick(o, def, x).catch(EG.fehler); }
      }));
    });
    return seg;
  }
  function statusZeile(row, st) {
    var bits = [];
    if (row && st !== 'offen' && (row.erledigt_von_name || row.erledigt_am)) {
      bits.push(h('div', { class: 'klein muted', text: (st === 'ok' ? 'Erledigt' : st === 'nok' ? 'NOK gemeldet' : 'Entfällt') + (row.erledigt_von_name ? ' von ' + row.erledigt_von_name : '') + (row.erledigt_am ? ', ' + EG.fmtZeit(row.erledigt_am) : '') }));
    }
    if ((st === 'nok' || st === 'entfaellt') && row && row.grund) bits.push(h('div', { class: 'klein vk-grund umbruch', text: 'Grund: ' + row.grund }));
    return bits.length ? h('div', { class: 'vk-status' }, bits) : null;
  }
  function eingabeBlock(o, def, row, ed) {
    var w = wertKopie(row), id = (o.idPrefix || 'ac-p-') + 'e-' + def.k, box = h('div', { class: 'extra vk-eingabe' });
    if (def.eingabe === 'text') {
      var t = h('input', { type: 'text', id: id, disabled: !ed, value: w.text || '', autocomplete: 'off' });
      t.addEventListener('change', function () {
        var neu = Object.assign({}, w); if (t.value.trim()) neu.text = t.value.trim(); else delete neu.text;
        aendern(o, def, { wert: neu }).catch(EG.fehler);
      });
      box.appendChild(EG.feld(def.label || 'Eintrag', t));
    } else if (def.eingabe === 'bestaetigung') {
      var bw = bestaetigtWert(def, row);
      box.appendChild(h('div', { class: bw ? 'fett' : 'muted', text: bw ? 'Bestätigt von ' + bw.name + ' am ' + EG.fmtDatum(bw.datum) : 'Noch nicht bestätigt.' }));
      if (bw && ed) box.appendChild(h('button', { type: 'button', class: 'btn btn-ghost btn-klein', style: 'margin-top:6px', text: 'Name / Datum ändern', onclick: function () { bestaetigen(o, def).catch(EG.fehler); } }));
    }
    return box;
  }
  function fotoBereich(o, def, row, ed) {
    var fotos = (row && row.fotos) || [], box = h('div', { class: 'extra' });
    box.appendChild(h('div', { class: 'feld-label', text: 'Foto' }));
    if (!ed) {
      box.appendChild(fotos.length ? h('div', { class: 'fotos' }, fotos.map(function (f) { return EG.fotoThumb(f); })) : h('div', { class: 'klein muted', text: 'Kein Foto.' }));
      return box;
    }
    var fb = EG.fotoBlock({
      pfad: 'auslieferung/' + String(o.interneNr).replace(/[^\w.-]/g, '_'), fotos: fotos,   // Pfad verkauf/… ist für werkstatt gesperrt
      onChange: function (arr) { aendern(o, def, { fotos: arr }).catch(EG.fehler); }
    });
    box.appendChild(fb.el);
    return box;
  }
  function punktKarte(o, def) {
    var row = o.rows[def.k] || null, st = row ? (row.status || 'offen') : 'offen';
    var darfDef = darf(def), ed = darfDef && !o.gesperrt;
    var karte = h('div', {
      class: 'punkt vk-punkt vk-ac' + (st === 'ok' ? ' ok' : st === 'nok' ? ' vk-nok' : st === 'entfaellt' ? ' entfaellt' : '') + (!ed ? ' vk-lesen' : ''),
      id: (o.idPrefix || 'ac-p-') + def.k
    });
    karte.appendChild(h('div', { class: 'vk-ac-zeile' }, h('div', { class: 'punkt-titel', text: def.text }), segment(o, def, st, ed)));
    if (def.hinweis) karte.appendChild(h('div', { class: 'punkt-hinweis', text: def.hinweis }));
    if (def.eingabe) karte.appendChild(eingabeBlock(o, def, row, ed));
    if (def.foto) karte.appendChild(fotoBereich(o, def, row, ed));
    var sz = statusZeile(row, st); if (sz) karte.appendChild(sz);
    if (!darfDef) karte.appendChild(h('div', { class: 'ac-lese', text: 'Nur ansehen. Abhaken: ' + def.rollen.map(function (r) { return ROLLE_NAME[r] || r; }).join(', ') + '.' }));
    return karte;
  }
  /** Die ganze Checkliste nach Blöcken (Außen, Innenraum, Technik, Sonstiges, Endkontrolle). */
  function liste(o) {
    o.rows = o.rows || {};
    var wrap = h('div', { class: 'ac-liste' });
    AC.bloecke.forEach(function (b) {
      var defs = AC.punkte.filter(function (p) { return p.block === b; });
      var okB = defs.filter(function (p) { return erledigtStatus(o.rows[p.k]); }).length;
      wrap.appendChild(h('div', { class: 'block-kopf' }, h('h3', { text: b }), h('span', { class: 'klein muted', text: okB + ' / ' + defs.length })));
      defs.forEach(function (p) { wrap.appendChild(punktKarte(o, p)); });
    });
    return wrap;
  }

  window.AC_UI = { liste: liste, ladeZeilen: ladeZeilen, zaehle: zaehle, rolle: rolle, demoSaen: demoSaen };

  /* ====================================================================
     TEIL 2: Reiter „Auslieferung“
     ==================================================================== */
  var S = { root: null, fz: [], stand: null, geladenAm: 0, zeilen: {}, filter: 'offen', suche: '', nr: null, rows: null, listenBox: null };
  var FRISCH_MS = 5 * 60 * 1000;   // so lange gilt die geladene Liste, bevor beim Wechsel zurück neu geholt wird

  EG.onTab('auslieferung', function (root) {
    S.root = root;
    demoSaen();
    if (S.nr) return ladeDetail();
    if (S.geladenAm && Date.now() - S.geladenAm < FRISCH_MS) return zeigeListeNeu();
    return ladeListe();
  });

  /** Fahrzeuge zur Auslieferung holen (Edge Function; im Demo-Modus erfundene Fahrzeuge). */
  async function holeFahrzeuge() {
    if (EG.demo) return { fahrzeuge: demoFahrzeuge(), stand: jetzt() };
    var r = await EG.sb.functions.invoke('auslieferung_liste', { body: {} });
    if (r.error) {
      var text = '';
      try { var j = await r.error.context.json(); text = j.fehler || j.error || ''; } catch (e) { /* keine JSON-Antwort */ }
      throw new Error(text || r.error.message);
    }
    if (r.data && r.data.fehler) throw new Error(r.data.fehler);
    return { fahrzeuge: (r.data && r.data.fahrzeuge) || [], stand: (r.data && r.data.stand) || jetzt() };
  }

  /* ---------- Liste ---------- */
  async function ladeListe() {
    S.nr = null; S.rows = null;
    S.root.innerHTML = '';
    S.root.appendChild(h('p', { class: 'muted', text: 'Lade Fahrzeuge …' }));
    try {
      var d = await holeFahrzeuge();
      S.fz = d.fahrzeuge; S.stand = d.stand;
      S.zeilen = await ladeZeilen(S.fz.map(function (f) { return f.interne_nr; }));
      S.geladenAm = Date.now();
    } catch (e) {
      console.error(e);
      S.geladenAm = 0;
      S.root.innerHTML = '';
      S.root.appendChild(EG.banner([h('strong', { text: 'Die Liste konnte nicht geladen werden. ' }), (e && (e.message || e.details)) || String(e)], 'fehler'));
      S.root.appendChild(h('button', { type: 'button', class: 'btn btn-ghost', text: 'Erneut versuchen', onclick: function () { ladeListe().catch(EG.fehler); } }));
      return;
    }
    zeichneListe();
  }
  /** Liste aus dem Speicher zeigen, nur die Haken frisch holen. */
  async function zeigeListeNeu() {
    S.nr = null; S.rows = null;
    S.zeilen = await ladeZeilen(S.fz.map(function (f) { return f.interne_nr; }));
    zeichneListe();
  }
  function fortschritt(f) { return zaehle(S.zeilen[f.interne_nr]); }
  /** Fertig = Checkliste komplett oder Endkontrolle in der Masterliste „fertig“. */
  function istFertig(f) { var z = fortschritt(f); return z.erledigt >= z.gesamt || /^fertig$/i.test(f.endkontrolle || ''); }
  /** Oli 31.10.2026: Was als Nächstes ausgeliefert wird und nicht fertig ist, steht oben; fertige Fahrzeuge ans Ende. */
  function sortiere(a, b) {
    var fa = istFertig(a) ? 1 : 0, fb = istFertig(b) ? 1 : 0;
    if (fa !== fb) return fa - fb;
    return (a.termin || '9999-99-99').localeCompare(b.termin || '9999-99-99') ||
      String(a.interne_nr).localeCompare(String(b.interne_nr), 'de', { numeric: true });
  }
  function terminInfo(t) {
    if (!t) return { text: 'Termin offen', art: 'grau' };
    var heute = EG.heute(), d = EG.fmtDatum(t);
    if (t < heute) return { text: d + ' · überfällig', art: 'rot' };
    if (t === heute) return { text: d + ' · heute', art: 'gold' };
    return { text: d, art: '' };
  }
  function passtSuche(f) {
    var q = S.suche.trim().toLowerCase(); if (!q) return true;
    return [f.interne_nr, f.hersteller, f.modell, f.farbe].join(' ').toLowerCase().indexOf(q) >= 0;
  }
  function zeichneListe() {
    S.root.innerHTML = '';
    var suchFeld = h('input', { type: 'search', id: 'ac-suche', placeholder: 'Suchen: Nr., Modell, Farbe …', value: S.suche, 'aria-label': 'Suche' });
    suchFeld.addEventListener('input', function () { S.suche = suchFeld.value; fuelleListe(); });
    var chipLeiste = h('div', { class: 'chips' });
    function chips() {
      chipLeiste.innerHTML = '';
      [['offen', 'Offen', function (f) { return !istFertig(f); }], ['fertig', 'Fertig', istFertig], ['alle', 'Alle', null]].forEach(function (c) {
        var n = S.fz.filter(function (f) { return !c[2] || c[2](f); }).length;
        chipLeiste.appendChild(h('button', {
          type: 'button', class: 'chip', 'aria-pressed': S.filter === c[0] ? 'true' : 'false', text: c[1] + ' (' + n + ')',
          onclick: function () { S.filter = c[0]; chips(); fuelleListe(); }
        }));
      });
    }
    chips();
    var neu = h('button', { type: 'button', class: 'btn btn-ghost', text: 'Liste aktualisieren', onclick: function () { neu.disabled = true; ladeListe().catch(EG.fehler); } });
    S.root.appendChild(h('div', { class: 'leiste' },
      h('div', { class: 'leiste-zeile' }, suchFeld),
      h('div', { class: 'leiste-zeile ac-aktual' }, neu, h('span', { class: 'klein muted', text: 'Stand: ' + EG.fmtZeit(S.stand) })),
      chipLeiste));
    S.sp = S.sp || { f: {}, sort: null };   // Spaltenfilter und Sortierung bleiben beim Neuzeichnen erhalten
    S.listenBox = h('div', { role: 'list' });
    S.root.appendChild(h('div', { class: 'ac-tabelle' }, EG.zeilenKopf('', SPALTEN, S.sp, fuelleListe, S.fz), S.listenBox));
    fuelleListe();
  }
  function wert(k) { return function (f) { return f[k] || ''; }; }
  /** Spalten der Zeilenansicht (Kopf mit Sortierung und Filter: EG.zeilenKopf). Auf dem Handy bleiben nur Termin, Fahrzeug und Checkliste. */
  var SPALTEN = [
    { t: 'Termin', c: 'ac-c-termin', w: function (f) { return f.termin ? EG.fmtDatum(f.termin) : 'offen'; }, s: function (f) { return f.termin || ''; }, ph: 'z.B. 12.11' },
    { t: 'Nr.', c: 'ac-c-nr', w: wert('interne_nr'), ph: 'Nr.' },
    { t: 'Fahrzeug', c: 'ac-c-fz', w: function (f) { return fzTitel(f) + (f.farbe ? ' · ' + f.farbe : ''); }, ph: 'Marke/Modell' },
    { t: 'Status', c: 'ac-c-mw', w: wert('status'), wahl: true },
    { t: 'Innen', c: 'ac-c-mw', w: wert('innen'), wahl: true },
    { t: 'Außen', c: 'ac-c-mw', w: wert('aussen'), wahl: true },
    { t: 'Werkstatt', c: 'ac-c-mw', w: wert('werkstatt'), wahl: true },
    { t: 'Endkontr.', c: 'ac-c-mw', w: wert('endkontrolle'), wahl: true },
    { t: 'Checkliste', c: 'ac-c-check', w: function (f) { var z = fortschritt(f); return istFertig(f) ? 'Fertig' : z.erledigt + '/' + z.gesamt; },
      s: function (f) { var z = fortschritt(f); return z.gesamt ? z.erledigt / z.gesamt : 0; }, ph: 'z.B. Fertig' }
  ];
  function fuelleListe() {
    var box = S.listenBox; box.innerHTML = '';
    var l = S.fz.filter(function (f) {
      if (!passtSuche(f)) return false;
      return S.filter === 'alle' || (S.filter === 'offen' ? !istFertig(f) : istFertig(f));
    }).sort(sortiere);
    l = EG.zeilenFiltern(l, SPALTEN, S.sp);
    if (!l.length) { box.appendChild(h('div', { class: 'leer', text: S.fz.length ? 'Keine Fahrzeuge in dieser Ansicht.' : 'Zurzeit steht kein Fahrzeug zur Auslieferung an.' })); return; }
    l.forEach(function (f) { box.appendChild(fzZeile(f)); });
  }
  /** Vier Werte aus der Masterliste als kleine Marken (leer = grau). */
  function werteMarken(f) {
    var w = h('div', { class: 'ac-pills' });
    [['Innen', f.innen], ['Außen', f.aussen], ['Werkstatt', f.werkstatt], ['Endkontrolle', f.endkontrolle]].forEach(function (x) {
      w.appendChild(EG.pill(x[0] + ': ' + (x[1] || '–'), x[1] ? '' : 'grau'));
    });
    return w;
  }
  function fortschrittBlock(z) {
    var proz = z.gesamt ? Math.round(z.erledigt * 100 / z.gesamt) : 0;
    return h('div', { class: 'ac-fort' },
      h('div', { class: 'ac-fort-zeile' },
        h('span', { class: 'ac-fort-text', text: z.erledigt + ' von ' + z.gesamt + ' Punkten' }),
        z.nok ? EG.pill(z.nok + ' NOK', 'rot') : null,
        z.erledigt >= z.gesamt ? EG.pill('Fertig', 'gruen') : null),
      h('div', { class: 'ac-balken', role: 'presentation' }, h('span', { style: 'width:' + proz + '%' })));
  }
  /** Ein Fahrzeug = eine Zeile. Tippen öffnet die Checkliste. */
  function fzZeile(f) {
    var z = fortschritt(f), ti = terminInfo(f.termin), fertig = istFertig(f), rot = ti.art === 'rot' && !fertig;
    function mw(v) { return h('span', { class: 'ac-c-mw' + (v ? '' : ' muted'), text: v || '–' }); }
    return h('button', {
      type: 'button', role: 'listitem', class: 'ac-zeile' + (rot ? ' rot' : '') + (fertig ? ' fertig' : ''),
      'aria-label': fzTitel(f) + ', Nr. ' + f.interne_nr + ', ' + ti.text + ', ' + z.erledigt + ' von ' + z.gesamt + ' Punkten',
      onclick: function () { oeffne(f.interne_nr).catch(EG.fehler); }
    },
      h('span', { class: 'ac-c-termin' }, EG.pill(f.termin ? ti.text.replace(/\.\d{4}/, '.') : 'offen', ti.art)),
      h('span', { class: 'ac-c-nr', text: f.interne_nr }),
      h('span', { class: 'ac-c-fz' }, h('strong', { text: fzTitel(f) }), f.farbe ? h('span', { class: 'muted ac-farbe', text: ' · ' + f.farbe }) : null,
        h('span', { class: 'ac-nur-handy muted', text: ' · Nr. ' + f.interne_nr })),
      mw(f.status), mw(f.innen), mw(f.aussen), mw(f.werkstatt), mw(f.endkontrolle),
      h('span', { class: 'ac-c-check' },
        fertig ? EG.pill('Fertig', 'gruen') : h('span', { text: z.erledigt + '/' + z.gesamt }),
        z.nok ? EG.pill(z.nok + ' NOK', 'rot') : null));
  }

  /* ---------- Detail ---------- */
  async function oeffne(nr) { S.nr = nr; await ladeDetail(); window.scrollTo(0, 0); }
  async function ladeDetail() {
    var f = S.fz.filter(function (x) { return x.interne_nr === S.nr; })[0];
    if (!f) { S.nr = null; return ladeListe(); }
    var z = await ladeZeilen([S.nr]);
    S.rows = z[S.nr] || {}; S.zeilen[S.nr] = S.rows;
    zeichneDetail();
  }
  function zurListe() { S.nr = null; S.rows = null; zeichneListe(); window.scrollTo(0, 0); }
  function aktuellesFz() { return S.fz.filter(function (x) { return x.interne_nr === S.nr; })[0]; }

  function zeichneDetail() {
    var y = window.scrollY, f = aktuellesFz(), root = S.root;
    if (!f) { zurListe(); return; }
    root.innerHTML = '';
    root.appendChild(h('button', { type: 'button', class: 'btn btn-ghost zurueck', text: '← Zur Liste', onclick: zurListe }));
    root.appendChild(kopfKarte(f));
    root.appendChild(arbeitenKarte(f));
    if (EG.istWerkstatt()) {
      root.appendChild(EG.banner([
        'Du hakst ab als ', h('strong', { text: EG.nutzerName() || '(Name fehlt)' }), '. ',
        h('button', { type: 'button', class: 'linklike', text: 'Name ändern', onclick: function () { var b = document.getElementById('btn-name'); if (b) b.click(); } })
      ], 'info'));
    }
    root.appendChild(h('h2', { text: 'Auslieferungs-Checkliste', style: 'margin:18px 0 4px' }));
    root.appendChild(h('p', { class: 'muted klein', text: 'Jeder Punkt: OK, NOK oder entfällt – mit Name und Zeit. NOK und entfällt brauchen einen Grund.' }));
    root.appendChild(fortschrittBlock(zaehle(S.rows)));
    root.appendChild(liste({
      interneNr: S.nr, rows: S.rows,
      onChange: function (info) { if (info.voll) zeichneDetail(); }   // nur wenn sich ein Status geändert hat (Tastatur und Fokus bleiben beim Tippen)
    }));
    window.scrollTo(0, y);
  }
  function kopfKarte(f) {
    var ti = terminInfo(f.termin);
    var dl = h('dl', { class: 'kv' });
    [['Interne Nr.', f.interne_nr], ['Farbe', f.farbe || '–'], ['Auslieferungstermin', f.termin ? EG.fmtDatum(f.termin) : 'noch offen'], ['Status', f.status || '–']].forEach(function (z) {
      dl.appendChild(h('dt', { text: z[0] })); dl.appendChild(h('dd', { text: z[1] }));
    });
    return h('div', { class: 'karte' + (ti.art === 'rot' && !istFertig(f) ? ' rot' : '') },
      h('div', { class: 'karte-kopf' }, h('h2', { text: fzTitel(f) }), EG.pill(ti.text, ti.art)),
      dl, werteMarken(f));
  }
  function arbeitenKarte(f) {
    return h('div', { class: 'karte' },
      h('h2', { text: 'Arbeiten' }),
      f.arbeiten ? h('div', { class: 'ac-arbeiten', text: f.arbeiten }) : h('p', { class: 'muted', text: 'Keine besonderen Arbeiten eingetragen.' }),
      h('p', { class: 'klein muted', style: 'margin-top:8px', text: 'Aus der Masterliste, hier nur zum Lesen.' }));
  }

  /* ====================================================================
     DEMO-DATEN (nur ?demo=1): 4 erfundene Fahrzeuge, keine echten Daten.
     Die Haken liegen in derselben Demo-Tabelle wie im Reiter Verkauf (Fall 90103 = Akte „Probe, Peter“).
     ==================================================================== */
  function demoFahrzeuge() {
    var heute = new Date();
    function tag(n) { var x = new Date(heute); x.setDate(x.getDate() + n); return EG.isoDatum(x); }
    return [
      { sp_id: 9001, interne_nr: '90108', hersteller: 'Nissan', modell: 'Juke Demo', farbe: 'Grau', termin: tag(-1), status: 'bestellt', innen: 'fertig', aussen: 'fertig', werkstatt: 'fertig', arbeiten: 'Winterräder montieren\nSommerräder einlagern', endkontrolle: '' },
      { sp_id: 9002, interne_nr: '90107', hersteller: 'Hyundai', modell: 'i20 Demo', farbe: 'Weiß', termin: tag(0), status: 'bestellt', innen: 'fertig', aussen: 'fertig', werkstatt: '', arbeiten: 'Fußmatten (Zugabe) einlegen', endkontrolle: '' },
      { sp_id: 9003, interne_nr: '90103', hersteller: 'Opel', modell: 'Mokka Demo Edition', farbe: 'Rot', termin: tag(2), status: 'bestellt', innen: 'in Arbeit', aussen: '', werkstatt: 'offen', arbeiten: 'Winterräder bestellen und montieren\nSommerräder einlagern\nBatterie laden\nDurchsicht', endkontrolle: '' },
      { sp_id: 9004, interne_nr: '90102', hersteller: 'Kia', modell: 'Sportage 1.6 Demo', farbe: 'Deep Chroma Blue', termin: tag(5), status: 'bestellt', innen: '', aussen: '', werkstatt: '', arbeiten: '', endkontrolle: '' }
    ];
  }
  var gesaet = false;
  function demoSaen() {
    if (!EG.demo || gesaet) return;
    gesaet = true;
    var zeilen = [];
    function vor(n, std) { var x = new Date(); x.setDate(x.getDate() - n); x.setHours(std || 10, 20, 0, 0); return x.toISOString(); }
    function z(nr, def, st, o) {
      o = o || {};
      var wert = null;
      if (st === 'ok' && def.eingabe === 'text') wert = { text: def.k === 'ac_reifendruck' ? '2,4 / 2,6' : '-25' };
      if (st === 'ok' && def.eingabe === 'bestaetigung') wert = { name: 'Demo Aufbereiter', datum: EG.heute() };
      zeilen.push({
        id: EG.uuid(), interne_nr: nr, punkt_key: def.k, status: st, wert: wert, grund: o.grund || null, fotos: [],
        erledigt_von_name: 'Demo Aufbereiter', erledigt_am: vor(o.vor == null ? 1 : o.vor), updated_at: vor(1)
      });
    }
    AC.punkte.forEach(function (d, i) {
      var end = d.k.indexOf('ac_end_') === 0;
      // 90103: etwa die Hälfte erledigt, Laden entfällt
      if (!end && i < 21) z('90103', d, d.k === 'ac_laden' ? 'entfaellt' : 'ok', { grund: 'Verbrenner, kein Ladekabel nötig' });
      // 90107: alles außer Endkontrolle erledigt, Aufbereiter hat bestätigt
      if (!end || d.k === 'ac_end_aufbereiter') z('90107', d, d.k === 'ac_laden' ? 'entfaellt' : 'ok', { grund: 'Verbrenner, kein Ladekabel nötig' });
      // 90108 (überfällig): fast fertig, Reifendruck fehlt, Politur NOK
      if (!end) {
        if (d.k === 'ac_laden') z('90108', d, 'entfaellt', { grund: 'Verbrenner, kein Ladekabel nötig' });
        else if (d.k === 'ac_politur') z('90108', d, 'nok', { grund: 'Lack matt, Politur muss nochmal' });
        else if (d.k !== 'ac_reifendruck') z('90108', d, 'ok');
      }
    });
    EG.demoSeed('verkauf.auslieferung_punkt', zeilen);
  }
})();
