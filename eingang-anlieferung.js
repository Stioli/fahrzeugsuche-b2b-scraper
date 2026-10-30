/* Fahrzeugeingang-Tool – Reiter „Anlieferungen“ (Lieferantenfahrzeuge)
   Paket P3, Stand 30.10.2026. Nach Plan 4a und Checkliste Eingangsprüfung (Entwurf vom 03.10.2026).
   Daten: Schema eingang (fahrzeug, pruefpunkt, mangel, lieferant_kontakt) laut Datenvertrag im LIESMICH.
   Baut auf window.EG aus eingang-core.js auf. */
(function () {
  'use strict';
  var EG = window.EG, h = EG.h;

  /* ====================================================================
     Festwerte
     ==================================================================== */
  var STATUS = {
    erwartet: ['Erwartet', ''],
    angeliefert: ['Angeliefert – Prüfung offen', ''],
    pruefung_laeuft: ['Prüfung läuft', ''],
    ruege_offen: ['Rüge offen', 'rot'],
    wartet_oli: ['Wartet auf Oli', 'gold'],
    geprueft_ok: ['Geprüft ohne Befund', 'gruen'],
    ruege_gesendet: ['Rüge gesendet', 'grau'],
    abgeschlossen: ['Abgeschlossen', 'grau']
  };
  var OFFEN = ['erwartet', 'angeliefert', 'pruefung_laeuft', 'ruege_offen', 'wartet_oli'];
  var ERLEDIGT = ['geprueft_ok', 'ruege_gesendet', 'abgeschlossen'];

  // Checkliste fürs Handy gekürzt; Quelle: Eingangsprüfung-Entwurf, Abschnitt 1 (A–H).
  // k = Prüfpunkt (wird so in eingang.pruefpunkt.punkt gespeichert, je Fahrzeug eindeutig).
  var CHECKLISTE = [
    { block: 'Papiere', punkte: [
      { k: 'COC vorhanden', hinweis: 'Papier oder elektronische Daten – ohne gültige COC keine Zulassung', kat: 'Papiere fehlen' },
      { k: 'Zulassungsbescheinigung Teil I', hinweis: 'nur falls zugelassen – FIN und Halter stimmig', kat: 'Papiere fehlen' },
      { k: 'Zulassungsbescheinigung Teil II', hinweis: 'nur falls zugelassen', kat: 'Papiere fehlen' },
      { k: 'Serviceheft / Garantieunterlagen', kat: 'Papiere fehlen' },
      { k: 'Anzahl Schlüssel', hinweis: 'laut Bestellung, Funktion jedes Schlüssels prüfen', kat: 'Schlüssel / Zubehör fehlt', notiz: true },
      { k: 'Notschlüssel / Code-Karte', kat: 'Schlüssel / Zubehör fehlt' }
    ] },
    { block: 'Identität', punkte: [
      { k: 'FIN am Fahrzeug = Papiere', hinweis: 'Typschild und Einschlag mit Bestellung, Rechnung und COC vergleichen', foto: true },
      { k: 'Modell, Motor, Getriebe = Bestellung', kat: 'Falsche Ausstattung' },
      { k: 'Farbe außen und innen = Bestellung', kat: 'Falsche Farbe' },
      { k: 'Kilometerstand mit Tacho-Foto', extra: 'km', foto: true, kat: 'Kilometerstand zu hoch' }
    ] },
    { block: 'Neuwagen', hinweis: 'nur Neuwagen, EU-Neuwagen und Tageszulassungen', punkte: [
      { k: 'Produktionsdatum festgestellt', extra: 'produktion', hinweis: 'COC, Typschild oder Herstellerabfrage', kat: 'Produktionsdatum zu alt' },
      { k: 'Keine Standschäden', hinweis: 'Reifen, Bremsen, Batterie, Lack', kat: 'Sonstiges' }
    ] },
    { block: 'Schäden', punkte: [
      { k: 'Rundgang außen', hinweis: 'Lack, Dellen, Kratzer, Steinschläge, Felgen, Reifen, Scheiben, Leuchten – jeder Schaden mit Foto' },
      { k: 'Innenraum', hinweis: 'Sitze, Himmel, Verkleidungen, Gerüche', kat: 'Innenraum (Verschmutzung, Gebrauchsspur)' },
      { k: 'Warnleuchten nach Motorstart', kat: 'Technik / Warnleuchte' }
    ] },
    { block: 'Ausstattung', punkte: [
      { k: 'Ausstattung gegen Bestellung', hinweis: 'Pakete, Assistenzsysteme, Navi, AHK, Dach, Felgen – bestellt ist bestellt', kat: 'Falsche Ausstattung' },
      { k: 'Zubehör vollständig', hinweis: 'Ladekabel (E/PHEV), Warndreieck, Verbandkasten, Bordwerkzeug, Reifenreparaturset, Anleitung', kat: 'Schlüssel / Zubehör fehlt' }
    ] },
    { block: 'Abgasnorm', hinweis: 'nur nie zugelassene Neuwagen', punkte: [
      { k: 'Abgasnorm laut COC Feld 47', extra: 'abgasnorm', kat: 'Abgasnorm' }
    ] },
    { block: 'WLTP', punkte: [
      { k: 'WLTP-Werte laut COC Feld 49', extra: 'wltp', hinweis: 'Zeile „WLTP“, nicht NEFZ. Klasse M1 oder N1 mit eintragen.', kat: 'Sonstiges' }
    ] }
  ];
  var ALLE_PUNKTE = [];
  CHECKLISTE.forEach(function (b) { b.punkte.forEach(function (p) { p.block = b.block; ALLE_PUNKTE.push(p); }); });

  // ab100: gilt immer als „ab 100 €“ (Oli, 30.10.2026). Alles andere: Vorschlag „unter 100 €“, nur nach oben änderbar.
  var KATEGORIEN = [
    { k: 'Delle', ab100: true },
    { k: 'Lackschaden', ab100: true },
    { k: 'Kratzer (leicht)' },
    { k: 'Steinschlag Scheibe', ab100: true },
    { k: 'Felge', ab100: true },
    { k: 'Technik / Warnleuchte', ab100: true },
    { k: 'Falsche Ausstattung', ab100: true },
    { k: 'Falsche Farbe', ab100: true },
    { k: 'Kilometerstand zu hoch', ab100: true },
    { k: 'Papiere fehlen', ab100: true },
    { k: 'Abgasnorm', ab100: true },
    { k: 'Produktionsdatum zu alt', ab100: true },
    { k: 'Schlüssel / Zubehör fehlt' },
    { k: 'Innenraum (Verschmutzung, Gebrauchsspur)' },
    { k: 'Sonstiges' }
  ];
  function kategorie(name) { return KATEGORIEN.filter(function (k) { return k.k === name; })[0] || null; }

  var ABGASNORMEN = ['Euro 6e (EA)', 'Euro 6e-bis (EB)', 'Euro 6d-ISC-FCM', 'Euro 6d', 'Euro 7', 'Andere'];

  /* ====================================================================
     Zustand
     ==================================================================== */
  var S = { root: null, liste: [], filter: 'offen', suche: '', id: null, fz: null, punkte: {}, maengel: [], kontakt: null, listenBox: null };

  var T = {
    fz: function () { return EG.tab('eingang', 'fahrzeug'); },
    pp: function () { return EG.tab('eingang', 'pruefpunkt'); },
    mg: function () { return EG.tab('eingang', 'mangel'); },
    kt: function () { return EG.tab('eingang', 'lieferant_kontakt'); }
  };
  function chk(r) { if (r && r.error) throw r.error; return r; }
  function fzTitel(f) { return [f.hersteller, f.modell].filter(Boolean).join(' ') || 'Fahrzeug'; }
  function jetzt() { return new Date().toISOString(); }

  /* ====================================================================
     Reiter registrieren
     ==================================================================== */
  EG.onTab('anlieferung', function (root) {
    S.root = root;
    return S.id ? ladeDetail() : ladeListe();
  });

  /* ====================================================================
     LISTE
     ==================================================================== */
  async function ladeListe() {
    S.id = null; S.fz = null;
    S.root.innerHTML = '';
    S.root.appendChild(h('p', { class: 'muted', text: 'Lade Fahrzeuge …' }));
    var r = chk(await T.fz().select('*').order('gepl_anlieferung', { ascending: true, nullsFirst: false }));
    S.liste = r.data || [];
    zeichneListe();
  }
  function ueberfaellig(f) {
    return (f.status === 'angeliefert' || f.status === 'pruefung_laeuft') && !!f.angeliefert_am && !f.geprueft_am && EG.werktageSeit(f.angeliefert_am) > 1;
  }
  function passtSuche(f) {
    var q = S.suche.trim().toLowerCase(); if (!q) return true;
    return [f.hersteller, f.modell, f.fin, f.lieferant, f.interne_nr, f.autrado_nr, f.farbe].join(' ').toLowerCase().indexOf(q) >= 0;
  }
  function zeichneListe() {
    S.root.innerHTML = '';
    var suchFeld = h('input', { type: 'search', id: 'eg-suche', placeholder: 'Suchen: Modell, FIN, Lieferant, Nummer …', value: S.suche, 'aria-label': 'Suche' });
    suchFeld.addEventListener('input', function () { S.suche = suchFeld.value; fuelleListe(); });
    var chipLeiste = h('div', { class: 'chips' });
    function chips() {
      chipLeiste.innerHTML = '';
      [['offen', 'Offen', OFFEN], ['erledigt', 'Erledigt', ERLEDIGT], ['alle', 'Alle', null]].forEach(function (c) {
        var n = S.liste.filter(function (f) { return !c[2] || c[2].indexOf(f.status) >= 0; }).length;
        chipLeiste.appendChild(h('button', {
          type: 'button', class: 'chip', 'aria-pressed': S.filter === c[0] ? 'true' : 'false', text: c[1] + ' (' + n + ')',
          onclick: function () { S.filter = c[0]; chips(); fuelleListe(); }
        }));
      });
    }
    chips();
    var sync = h('button', { type: 'button', class: 'btn btn-ghost', text: 'Liste aktualisieren', onclick: function () { aktualisieren(sync).catch(EG.fehler); } });
    S.root.appendChild(h('div', { class: 'leiste' },
      h('div', { class: 'leiste-zeile' }, suchFeld),
      h('div', { class: 'leiste-zeile' }, sync,
        h('button', { type: 'button', class: 'btn btn-ghost', text: 'Fahrzeug von Hand anlegen', onclick: function () { handAnlegen().catch(EG.fehler); } })),
      chipLeiste));
    S.listenBox = h('div', { class: 'raster' });
    S.root.appendChild(S.listenBox);
    fuelleListe();
  }
  function fuelleListe() {
    var box = S.listenBox; box.innerHTML = '';
    var fl = S.filter === 'offen' ? OFFEN : S.filter === 'erledigt' ? ERLEDIGT : null;
    var l = S.liste.filter(function (f) { return (!fl || fl.indexOf(f.status) >= 0) && passtSuche(f); });
    l.sort(function (a, b) {
      var x = a.gepl_anlieferung || '9999-12-31', y = b.gepl_anlieferung || '9999-12-31';
      return x < y ? -1 : x > y ? 1 : 0;
    });
    if (!l.length) { box.appendChild(h('div', { class: 'leer', style: 'grid-column:1/-1', text: 'Keine Fahrzeuge in dieser Ansicht.' })); return; }
    l.forEach(function (f) { box.appendChild(fzKarte(f)); });
  }
  function fzKarte(f) {
    var rot = ueberfaellig(f), st = STATUS[f.status] || [f.status, 'grau'], termin;
    if (f.status === 'erwartet') {
      var faellig = f.gepl_anlieferung && f.gepl_anlieferung < EG.heute();
      termin = 'Geplant: ' + (EG.fmtDatum(f.gepl_anlieferung) || 'kein Termin') + (faellig ? ' (Termin überschritten)' : '');
    } else if (f.geprueft_am) termin = 'Geprüft: ' + EG.fmtZeit(f.geprueft_am);
    else termin = 'Angeliefert: ' + EG.fmtZeit(f.angeliefert_am);
    return h('button', { type: 'button', class: 'karte fz-karte' + (rot ? ' rot' : ''), onclick: function () { oeffne(f.id).catch(EG.fehler); } },
      h('div', { class: 'karte-kopf' }, h('div', { class: 'fz-titel', text: fzTitel(f) }), EG.pill(st[0], st[1])),
      h('div', { class: 'fz-zeile', text: [f.farbe, f.lieferant].filter(Boolean).join(' · ') }),
      h('div', { class: 'fz-zeile fz-fin', text: 'FIN ' + (f.fin || '–') + (f.interne_nr ? ' · Nr. ' + f.interne_nr : '') }),
      h('div', { class: 'fz-zeile', text: termin }),
      rot ? h('div', { class: 'fz-zeile rot-text fett', text: 'Prüfung überfällig – seit über einem Werktag angeliefert' }) : null,
      f.nicht_mehr_in_masterliste ? h('div', { class: 'fz-zeile' }, EG.pill('nicht mehr in der Masterliste', 'gold')) : null,
      f.quelle === 'hand' ? h('div', { class: 'fz-zeile klein', text: 'von Hand angelegt' }) : null);
  }
  async function aktualisieren(btn) {
    if (EG.demo) { EG.toast('Demo: Der Abgleich mit der Masterliste wird nur simuliert.'); return; }
    btn.disabled = true;
    try {
      var r = await EG.sb.functions.invoke('eingang_masterliste_sync', { body: {} });
      if (r.error) {
        var text = '';
        try { var j = await r.error.context.json(); text = j.fehler || j.error || ''; } catch (e) { /* keine JSON-Antwort */ }
        throw new Error(text || r.error.message);
      }
      EG.toast('Liste aktualisiert.', 'ok');
      await ladeListe();
    } finally { btn.disabled = false; }
  }

  /* ---------- Fahrzeug von Hand anlegen ---------- */
  async function handAnlegen() {
    var lieferanten = {};
    S.liste.forEach(function (f) { if (f.lieferant) lieferanten[f.lieferant] = 1; });
    var F = {
      hersteller: h('input', { type: 'text', id: 'ha-herst', placeholder: 'z. B. Hyundai' }),
      modell: h('input', { type: 'text', id: 'ha-modell', placeholder: 'z. B. Tucson 1.6 T-GDI' }),
      farbe: h('input', { type: 'text', id: 'ha-farbe' }),
      fin: h('input', { type: 'text', id: 'ha-fin', maxLength: 17, placeholder: '17 Stellen', autocapitalize: 'characters' }),
      lieferant: h('input', { type: 'text', id: 'ha-lief', list: 'ha-lief-liste', autocomplete: 'off' }),
      interne: h('input', { type: 'text', id: 'ha-nr' }),
      autrado: h('input', { type: 'text', id: 'ha-autrado', inputmode: 'numeric' }),
      bestell: h('input', { type: 'date', id: 'ha-bestell' }),
      gepl: h('input', { type: 'date', id: 'ha-gepl' })
    };
    var inhalt = h('div', {},
      h('datalist', { id: 'ha-lief-liste' }, Object.keys(lieferanten).map(function (l) { return h('option', { value: l }); })),
      h('div', { class: 'zeile2' }, EG.feld('Hersteller', F.hersteller), EG.feld('Modell *', F.modell)),
      h('div', { class: 'zeile2' }, EG.feld('Farbe', F.farbe), EG.feld('FIN', F.fin)),
      EG.feld('Lieferant *', F.lieferant),
      h('div', { class: 'zeile2' }, EG.feld('Interne Nr.', F.interne), EG.feld('Autrado-Nr.', F.autrado)),
      h('div', { class: 'zeile2' }, EG.feld('Bestellt am', F.bestell), EG.feld('Geplante Anlieferung', F.gepl)));
    var neuId = await EG.dialog({
      titel: 'Fahrzeug von Hand anlegen', inhalt: inhalt,
      knoepfe: [{ text: 'Abbrechen', art: 'ghost', wert: null }, {
        text: 'Anlegen', art: 'primary', wert: 'ok',
        aktion: async function () {
          var fin = F.fin.value.trim().toUpperCase();
          if (!F.modell.value.trim()) return 'Bitte das Modell eintragen.';
          if (!F.lieferant.value.trim()) return 'Bitte den Lieferanten eintragen.';
          if (fin && fin.length !== 17) return 'Die FIN hat 17 Stellen (oder leer lassen).';
          var r = chk(await T.fz().insert({
            quelle: 'hand', status: 'erwartet', hersteller: F.hersteller.value.trim() || null, modell: F.modell.value.trim(),
            farbe: F.farbe.value.trim() || null, fin: fin || null, lieferant: F.lieferant.value.trim(), interne_nr: F.interne.value.trim() || null,
            autrado_nr: F.autrado.value.trim() || null, lief_bestell_datum: F.bestell.value || null, gepl_anlieferung: F.gepl.value || null
          }).select().single());
          F.neu = r.data.id;
          return true;
        }
      }]
    });
    if (neuId === 'ok' && F.neu) { EG.toast('Fahrzeug angelegt.', 'ok'); await oeffne(F.neu); }
  }

  /* ====================================================================
     DETAIL
     ==================================================================== */
  async function oeffne(id) { S.id = id; await ladeDetail(); window.scrollTo(0, 0); }
  async function ladeDetail() {
    var x = await Promise.all([
      T.fz().select('*').eq('id', S.id).single(),
      T.pp().select('*').eq('fahrzeug_id', S.id),
      T.mg().select('*').eq('fahrzeug_id', S.id).order('created_at', { ascending: true })
    ]);
    if (x[0].error || !x[0].data) { EG.toast('Fahrzeug nicht gefunden.', 'fehler'); S.id = null; return ladeListe(); }
    chk(x[1]); chk(x[2]);
    S.fz = x[0].data; S.punkte = {}; (x[1].data || []).forEach(function (p) { S.punkte[p.punkt] = p; });
    S.maengel = x[2].data || [];
    var k = await T.kt().select('*').eq('lieferant', S.fz.lieferant || '').maybeSingle();
    S.kontakt = k.data || null;
    zeichneDetail();
  }
  async function fzUpdate(patch) {
    patch.updated_at = jetzt();
    var r = chk(await T.fz().update(patch).eq('id', S.id).select().single());
    S.fz = r.data; return r.data;
  }
  function neuZeichnen() { return ladeDetail(); }


  function aktiveMaengel() { return S.maengel.filter(function (m) { return ['offen', 'wartet_oli', 'freigegeben'].indexOf(m.ruege_status) >= 0; }); }
  function maengelZuPunkt(row) { return row ? S.maengel.filter(function (m) { return m.pruefpunkt_id === row.id && m.ruege_status !== 'entfaellt'; }) : []; }

  function zeichneDetail() {
    var y = window.scrollY, f = S.fz, root = S.root;
    root.innerHTML = '';
    root.appendChild(h('button', { type: 'button', class: 'btn btn-ghost zurueck', text: '← Zur Liste', onclick: function () { ladeListe().catch(EG.fehler); } }));
    root.appendChild(kopfKarte(f));
    root.appendChild(anlieferKarte(f));
    if (f.status !== 'erwartet') {
      root.appendChild(h('h2', { text: 'Eingangsprüfung', style: 'margin:18px 0 4px' }));
      var beantwortet = ALLE_PUNKTE.filter(function (p) { return S.punkte[p.k]; }).length;
      root.appendChild(h('p', { class: 'muted klein', text: beantwortet + ' von ' + ALLE_PUNKTE.length + ' Punkten beantwortet. Bei jedem Mangel brauchst du Foto und Notiz.' }));
      CHECKLISTE.forEach(function (b) { root.appendChild(blockKarte(b)); });
      root.appendChild(weitereMaengel());
      root.appendChild(abschlussKarte(beantwortet));
      root.appendChild(notizKarte(f));
    }
    window.scrollTo(0, y);
  }

  function kopfKarte(f) {
    var st = STATUS[f.status] || [f.status, 'grau'];
    var zeilen = [['FIN', f.fin || '–'], ['Interne Nr. / Autrado-Nr.', (f.interne_nr || '–') + ' / ' + (f.autrado_nr || '–')], ['Farbe', f.farbe || '–'],
      ['Lieferant', f.lieferant || '–'], ['Bestellt am', EG.fmtDatum(f.lief_bestell_datum) || '–'], ['Geplante Anlieferung', EG.fmtDatum(f.gepl_anlieferung) || '–']];
    var dl = h('dl', { class: 'kv' });
    zeilen.forEach(function (z) { dl.appendChild(h('dt', { text: z[0] })); dl.appendChild(h('dd', { text: z[1] })); });
    return h('div', { class: 'karte' },
      h('div', { class: 'karte-kopf' }, h('h2', { text: fzTitel(f) }), EG.pill(st[0], st[1])),
      dl,
      f.nicht_mehr_in_masterliste ? EG.banner('Dieses Fahrzeug steht nicht mehr in der Masterliste. Bitte bei Oli nachfragen, ob es noch kommt.', 'warn') : null);
  }
  function anlieferKarte(f) {
    if (f.status === 'erwartet') {
      return h('div', { class: 'karte' },
        h('p', { text: 'Dieses Fahrzeug ist noch nicht als angeliefert eingetragen. Mit dem Tipp unten läuft die Prüffrist (§ 377 HGB): untersuchen am Ablieferungstag, spätestens am nächsten Werktag.' }),
        h('div', { class: 'abstand' }),
        h('button', {
          type: 'button', class: 'btn btn-primary btn-block', text: 'Fahrzeug ist angeliefert',
          onclick: function () { angeliefert().catch(EG.fehler); }
        }));
    }
    var rot = ueberfaellig(f);
    var frist = f.angeliefert_am ? EG.fmtDatum(EG.plusWerktage(f.angeliefert_am, 1)) : '';
    return h('div', { class: 'karte' + (rot ? ' rot' : '') },
      h('div', { class: 'fett', text: 'Angeliefert am ' + EG.fmtZeit(f.angeliefert_am) + (f.angeliefert_von_name ? ' (' + f.angeliefert_von_name + ')' : '') }),
      !f.geprueft_am && frist ? h('div', { class: 'klein muted', text: 'Prüfen spätestens bis ' + frist + ' (nächster Werktag).' }) : null,
      f.geprueft_am ? h('div', { class: 'klein muted', text: 'Geprüft am ' + EG.fmtZeit(f.geprueft_am) + (f.geprueft_von_name ? ' (' + f.geprueft_von_name + ')' : '') }) : null,
      rot ? EG.banner('Die Prüfung ist überfällig. Das Fahrzeug steht seit über einem Werktag da, ohne dass die Prüfung abgeschlossen ist. Bitte sofort prüfen und melden.', 'fehler') : null);
  }
  async function angeliefert() {
    var name = EG.nutzerName();
    if (!name) { name = await EG.nameAbfragen(true); }
    await fzUpdate({ status: 'angeliefert', angeliefert_am: jetzt(), angeliefert_von_name: name });
    EG.toast('Als angeliefert eingetragen. Jetzt prüfen.', 'ok');
    await neuZeichnen();
  }

  /* ---------- Checkliste ---------- */
  function blockKarte(b) {
    var n = b.punkte.filter(function (p) { return S.punkte[p.k]; }).length;
    var box = h('div', {},
      h('div', { class: 'block-kopf' }, h('h3', { text: b.block }), h('span', { class: 'klein muted', text: n + ' / ' + b.punkte.length })),
      b.hinweis ? h('p', { class: 'klein muted', style: 'margin:-4px 0 8px', text: b.hinweis }) : null);
    b.punkte.forEach(function (p) { box.appendChild(punktKarte(p)); });
    if (b.block === 'Neuwagen') { /* Hinweis zum spätesten Verkauf steht beim Produktionsdatum */ }
    return box;
  }
  function mangelGesendet(row) { return !!row && S.maengel.some(function (m) { return m.pruefpunkt_id === row.id && m.ruege_status === 'gesendet'; }); }

  function punktKarte(def) {
    var row = S.punkte[def.k], erg = row && row.ergebnis, gesperrt = mangelGesendet(row);
    var seg = h('div', { class: 'seg', role: 'group', 'aria-label': def.k });
    [['ok', 'OK'], ['mangel', 'Mangel'], ['entfaellt', 'entfällt']].forEach(function (e) {
      seg.appendChild(h('button', {
        type: 'button', class: 'seg-b seg-' + e[0] + (erg === e[0] ? ' aktiv' : ''), 'aria-pressed': erg === e[0] ? 'true' : 'false',
        disabled: gesperrt, text: e[1],
        onclick: function () { ergebnisSetzen(def, e[0]).catch(EG.fehler); }
      }));
    });
    var karte = h('div', { class: 'punkt' + (erg ? ' ' + erg : '') },
      h('div', { class: 'punkt-titel', text: def.k }),
      def.hinweis ? h('div', { class: 'punkt-hinweis', text: def.hinweis }) : null,
      seg);
    if (gesperrt) karte.appendChild(h('div', { class: 'klein muted', text: 'Die Rüge zu diesem Punkt ist schon gesendet.' }));
    // Eingabefelder zum Punkt
    if (def.extra === 'km') karte.appendChild(extraKm());
    if (def.extra === 'produktion') karte.appendChild(extraProduktion());
    if (def.extra === 'abgasnorm') karte.appendChild(extraAbgasnorm());
    if (def.extra === 'wltp') karte.appendChild(extraWltp());
    // Notiz/Foto bei OK/entfällt
    if (row && erg !== 'mangel') {
      var fotosPP = row.fotos || [];
      if (row.notiz || fotosPP.length) {
        karte.appendChild(h('div', { class: 'extra' },
          row.notiz ? h('div', { class: 'klein umbruch', style: 'white-space:pre-wrap', text: row.notiz }) : null,
          fotosPP.length ? h('div', { class: 'fotos' }, fotosPP.map(function (p) { return EG.fotoThumb(p); })) : null));
      }
      if (def.foto || def.notiz) {
        karte.appendChild(h('div', { style: 'margin-top:8px' },
          h('button', { type: 'button', class: 'btn btn-ghost btn-klein', text: def.foto ? 'Notiz / Foto' : 'Notiz', onclick: function () { punktNotiz(def).catch(EG.fehler); } })));
      }
    }
    // Mängel zum Punkt
    maengelZuPunkt(row).forEach(function (m) { karte.appendChild(mangelKarte(m)); });
    return karte;
  }

  async function punktSpeichern(def, ergebnis, notiz, fotos) {
    var data = {
      fahrzeug_id: S.id, block: def.block, punkt: def.k, ergebnis: ergebnis,
      erfasst_von_name: EG.nutzerName(), erfasst_am: jetzt()
    };
    if (notiz !== undefined) data.notiz = notiz;
    if (fotos !== undefined) data.fotos = fotos;
    var r = chk(await T.pp().upsert(data, { onConflict: 'fahrzeug_id,punkt' }).select().single());
    S.punkte[def.k] = r.data;
    return r.data;
  }
  async function statusAnstossen() {
    if (S.fz.status === 'angeliefert') await fzUpdate({ status: 'pruefung_laeuft' });
  }
  async function ergebnisSetzen(def, erg) {
    var row = S.punkte[def.k];
    if (erg === 'mangel') { await mangelDialog(def, maengelZuPunkt(row)[0] || null); return; }
    if (row && row.ergebnis === 'mangel') {
      var offene = maengelZuPunkt(row).filter(function (m) { return m.ruege_status !== 'gesendet'; });
      if (offene.length) {
        var ja = await EG.bestaetigen('Der erfasste Mangel zu „' + def.k + '“ wird zurückgenommen und nicht gerügt. Sicher?', { ja: 'Mangel zurücknehmen', gefahr: true });
        if (!ja) return;
        for (var i = 0; i < offene.length; i++) chk(await T.mg().update({ ruege_status: 'entfaellt' }).eq('id', offene[i].id));
        await ruegeZuruecksetzen();
      }
    }
    await punktSpeichern(def, erg);
    await statusAnstossen();
    await neuZeichnen();
    if (erg === 'ok' && def.foto && !((S.punkte[def.k] || {}).fotos || []).length) punktNotiz(def).catch(EG.fehler);
  }
  async function punktNotiz(def) {
    var row = S.punkte[def.k]; if (!row) return;
    var ta = h('textarea', { id: 'pn-text', value: row.notiz || '', placeholder: def.k === 'Anzahl Schlüssel' ? 'z. B. 2 Schlüssel, beide funktionieren' : 'Notiz (optional)' });
    var fb = def.foto ? EG.fotoBlock({ pfad: 'lieferant/' + S.id, fotos: row.fotos || [] }) : null;
    var inhalt = h('div', {}, EG.feld('Notiz', ta), fb ? h('div', {}, h('div', { class: 'feld-label', text: 'Fotos' }), fb.el) : null);
    await EG.dialog({
      titel: def.k, inhalt: inhalt,
      knoepfe: [{ text: 'Abbrechen', art: 'ghost', wert: null }, {
        text: 'Speichern', art: 'primary', wert: 'ok',
        aktion: async function () {
          if (fb && fb.laedt()) return 'Ein Foto lädt noch – bitte kurz warten.';
          await punktSpeichern(def, row.ergebnis, ta.value.trim() || null, fb ? fb.get() : undefined);
          return true;
        }
      }]
    });
    await neuZeichnen();
  }

  /* ---------- Zusatzfelder ---------- */
  async function fzQuiet(patch) { try { await fzUpdate(patch); } catch (e) { EG.fehler(e); } }

  function extraKm() {
    var inp = h('input', { type: 'number', id: 'x-km', inputmode: 'numeric', min: 0, value: S.fz.km == null ? '' : S.fz.km, placeholder: 'km laut Tacho' });
    inp.addEventListener('change', function () { fzQuiet({ km: inp.value === '' ? null : parseInt(inp.value, 10) }); });
    return h('div', { class: 'extra' }, EG.feld('Kilometerstand laut Tacho', inp, 'Bei Neuwagen: Überführungskilometer plausibel? Abweichung zur Bestellung = Mangel.'));
  }
  function neuwagenInfo(pd) {
    var d = EG.parseDatum(pd); if (!d) return null;
    var l = new Date(d.getFullYear(), d.getMonth() + 12, d.getDate());
    var tage = Math.round((l - EG.parseDatum(EG.heute())) / 86400000), datum = EG.fmtDatum(EG.isoDatum(l));
    if (tage < 0) return EG.banner([h('strong', { text: 'Frist überschritten: ' }), 'Spätester Verkauf als Neuwagen war der ' + datum + '. Das Fahrzeug ist nicht mehr fabrikneu – mit Oli klären und ggf. rügen.'], 'fehler');
    if (tage <= 90) return EG.banner([h('strong', { text: 'Achtung: ' }), 'Spätester Verkauf als Neuwagen: ' + datum + ' (noch ' + tage + ' Tage). Zügig verkaufen oder als „Lagerfahrzeug, Produktion ' + EG.fmtDatum(pd).slice(3) + '“ kennzeichnen.'], 'warn');
    return EG.banner([h('strong', { text: 'Spätester Verkauf als Neuwagen: ' + datum }), ' (12 Monate nach Produktion, gerechnet bis zum Kaufvertrag mit dem Endkunden).'], 'info');
  }
  function extraProduktion() {
    var inp = h('input', { type: 'date', id: 'x-prod', value: S.fz.produktionsdatum || '' });
    var info = h('div', {}, neuwagenInfo(S.fz.produktionsdatum));
    inp.addEventListener('change', function () {
      fzQuiet({ produktionsdatum: inp.value || null });
      info.innerHTML = ''; var b = neuwagenInfo(inp.value); if (b) info.appendChild(b);
    });
    return h('div', { class: 'extra' }, EG.feld('Produktionsdatum', inp, 'Steht nur der Monat fest, trage den 1. des Monats ein.'), info);
  }
  function abgasWarnung(norm) {
    if (!norm) return null;
    if (/6e\s*\(EA\)/i.test(norm)) return EG.banner([h('strong', { text: 'Euro 6e (EA) – mit Oli klären! ' }), 'Die letzte Erstzulassung war der 31.12.2025. Seit 01.01.2026 ist das Fahrzeug nur noch über die Auslaufserie-Ausnahme zulassungsfähig. Sofort mit Oli und dem Lieferanten klären, ggf. rügen.'], 'fehler');
    if (/6e-bis/i.test(norm)) return EG.banner('Euro 6e-bis (EB): Erstzulassung bis 31.12.2027 möglich. Zulassungstermin einplanen.', 'info');
    return null;
  }
  function extraAbgasnorm() {
    var sel = h('select', { id: 'x-abgas' }, h('option', { value: '', text: 'Bitte wählen …' }), ABGASNORMEN.map(function (n) { return h('option', { value: n, text: n }); }));
    sel.value = S.fz.abgasnorm || '';
    var warn = h('div', {}, abgasWarnung(S.fz.abgasnorm));
    sel.addEventListener('change', function () {
      fzQuiet({ abgasnorm: sel.value || null });
      warn.innerHTML = ''; var b = abgasWarnung(sel.value); if (b) warn.appendChild(b);
    });
    return h('div', { class: 'extra' }, EG.feld('Abgasnorm (COC Feld 47)', sel), warn);
  }
  function extraWltp() {
    var w = Object.assign({}, S.fz.wltp || {});
    function feld(id, label, key, ph) {
      var i = h('input', { type: 'text', id: id, inputmode: 'decimal', placeholder: ph, value: w[key] == null ? '' : String(w[key]).replace('.', ',') });
      i.addEventListener('change', function () { var v = i.value.trim().replace(',', '.'); w[key] = v === '' ? null : v; fzQuiet({ wltp: w }); });
      return EG.feld(label, i);
    }
    var klasse = h('select', { id: 'x-wltp-klasse' }, h('option', { value: '', text: 'Klasse …' }), h('option', { value: 'M1', text: 'M1 (Pkw)' }), h('option', { value: 'N1', text: 'N1 (Transporter)' }));
    klasse.value = w.klasse || '';
    klasse.addEventListener('change', function () { w.klasse = klasse.value || null; fzQuiet({ wltp: w }); });
    return h('div', { class: 'extra' },
      h('div', { class: 'zeile2' }, feld('x-wltp-co2', 'CO₂ kombiniert (g/km)', 'co2', 'z. B. 142'), feld('x-wltp-verb', 'Verbrauch kombiniert (l/100 km)', 'verbrauch', 'z. B. 6,2')),
      h('div', { class: 'zeile2' }, feld('x-wltp-strom', 'Strom (kWh/100 km), nur E/PHEV', 'strom', 'optional'), EG.feld('Fahrzeugklasse', klasse)));
  }

  /* ====================================================================
     MÄNGEL
     ==================================================================== */
  function klasseText(k) { return k === 'ab_100' ? 'Ab 100 €' : 'Unter 100 €'; }
  var RUEGE_TEXT = { offen: 'Rüge noch offen', wartet_oli: 'Wartet auf Oli', freigegeben: 'Freigegeben', gesendet: 'Gesendet', entfaellt: 'Entfallen' };
  function mangelKarte(m) {
    return h('div', { class: 'mangel' },
      h('div', { class: 'mangel-kopf' }, h('strong', { text: m.kategorie }), EG.pill(klasseText(m.klasse), m.klasse === 'ab_100' ? 'rot' : 'grau'),
        m.ruege_status !== 'offen' ? EG.pill(RUEGE_TEXT[m.ruege_status] || m.ruege_status, m.ruege_status === 'gesendet' ? 'gruen' : 'gold') : null),
      h('div', { class: 'mangel-text', text: m.beschreibung }),
      (m.fotos || []).length ? h('div', { class: 'fotos' }, m.fotos.map(function (p) { return EG.fotoThumb(p); })) : null,
      m.erfasst_von_name ? h('div', { class: 'klein muted', text: 'erfasst von ' + m.erfasst_von_name }) : null,
      m.ruege_status !== 'gesendet' && m.ruege_status !== 'entfaellt'
        ? h('div', { style: 'display:flex;gap:8px;flex-wrap:wrap;margin-top:6px' },
          h('button', { type: 'button', class: 'btn btn-ghost btn-klein', text: 'Bearbeiten', onclick: function () { mangelDialog(null, m).catch(EG.fehler); } }),
          !m.pruefpunkt_id ? h('button', { type: 'button', class: 'btn btn-gefahr btn-klein', text: 'Zurücknehmen', onclick: function () { mangelZurueck(m).catch(EG.fehler); } }) : null)
        : null);
  }
  async function mangelZurueck(m) {
    if (!(await EG.bestaetigen('Mangel „' + m.kategorie + '“ zurücknehmen? Er wird dann nicht gerügt.', { ja: 'Zurücknehmen', gefahr: true }))) return;
    chk(await T.mg().update({ ruege_status: 'entfaellt' }).eq('id', m.id));
    await ruegeZuruecksetzen();
    await neuZeichnen();
  }
  function weitereMaengel() {
    var frei = S.maengel.filter(function (m) { return !m.pruefpunkt_id && m.ruege_status !== 'entfaellt'; });
    var box = h('div', { class: 'karte', style: 'margin-top:18px' },
      h('h3', { text: 'Weitere Mängel' }),
      h('p', { class: 'klein muted', text: 'Für Schäden, die nicht zu einem Punkt oben passen, oder wenn zu einem Punkt mehrere Mängel gehören (z. B. zwei Dellen).' }));
    frei.forEach(function (m) { box.appendChild(mangelKarte(m)); });
    box.appendChild(h('div', { style: 'margin-top:10px' }, h('button', { type: 'button', class: 'btn btn-ghost', text: '+ Weiteren Mangel erfassen', onclick: function () { mangelDialog(null, null).catch(EG.fehler); } })));
    return box;
  }

  /** Mangel erfassen/ändern. def = Prüfpunkt (oder null = weiterer Mangel ohne Punkt), vorhanden = bestehender Mangel. */
  async function mangelDialog(def, vorhanden) {
    if (!def && vorhanden && vorhanden.pruefpunkt_id) {
      def = ALLE_PUNKTE.filter(function (p) { var r = S.punkte[p.k]; return r && r.id === vorhanden.pruefpunkt_id; })[0] || null;
    }
    var kat = h('select', { id: 'mg-kat' }, h('option', { value: '', text: 'Bitte wählen …' }), KATEGORIEN.map(function (k) { return h('option', { value: k.k, text: k.k }); }));
    kat.value = vorhanden ? vorhanden.kategorie : (def && def.kat) || '';
    var klasse = vorhanden ? vorhanden.klasse : null, hoch = false;   // hoch = von Hand über den Vorschlag hinaus gestuft
    var hinweis = h('div', { class: 'feld-hinweis' });
    var bUnter = h('button', { type: 'button', text: 'Unter 100 €' }), bAb = h('button', { type: 'button', text: 'Ab 100 €' });
    function mindest() { var k = kategorie(kat.value); return k && k.ab100 ? 'ab_100' : 'unter_100'; }
    function klasseZeigen() {
      var min = mindest();
      bUnter.setAttribute('aria-pressed', klasse === 'unter_100' ? 'true' : 'false');
      bAb.setAttribute('aria-pressed', klasse === 'ab_100' ? 'true' : 'false');
      bUnter.disabled = !!kat.value && min === 'ab_100';
      hinweis.textContent = !kat.value ? 'Die Einstufung schlägt das Tool nach der Kategorie vor.'
        : min === 'ab_100' ? 'Diese Kategorie gilt immer als „ab 100 €“ (Entscheidung von Oli). Die Rüge geht deshalb erst nach Olis Freigabe raus.'
          : 'Vorschlag: unter 100 €. Du kannst nur nach oben ändern, wenn der Schaden teurer aussieht.';
    }
    bUnter.addEventListener('click', function () { klasse = 'unter_100'; hoch = false; klasseZeigen(); });
    bAb.addEventListener('click', function () { klasse = 'ab_100'; hoch = mindest() !== 'ab_100'; klasseZeigen(); });
    kat.addEventListener('change', function () { klasse = mindest() === 'ab_100' || hoch ? 'ab_100' : 'unter_100'; klasseZeigen(); });
    if (vorhanden) hoch = klasse === 'ab_100' && mindest() === 'unter_100';
    else if (kat.value) klasse = mindest();
    klasseZeigen();
    var beschr = h('textarea', { id: 'mg-text', value: vorhanden ? vorhanden.beschreibung : (def && S.punkte[def.k] && S.punkte[def.k].ergebnis === 'mangel' ? S.punkte[def.k].notiz || '' : ''), placeholder: 'Was genau, wo, wie groß? z. B. Kratzer Heckklappe ca. 8 cm, bis auf Grundierung' });
    var fotos = EG.fotoBlock({ pfad: 'lieferant/' + S.id, fotos: vorhanden ? vorhanden.fotos : [] });
    var inhalt = h('div', {},
      def ? h('p', { class: 'muted klein', text: 'Prüfpunkt: ' + def.k }) : null,
      EG.feld('Kategorie *', kat),
      h('div', { class: 'feld' }, h('div', { class: 'feld-label', text: 'Geschätzte Höhe *' }), h('div', { class: 'klasse-wahl' }, bUnter, bAb), hinweis),
      EG.feld('Beschreibung *', beschr),
      h('div', { class: 'feld' }, h('div', { class: 'feld-label', text: 'Fotos * (mindestens eins: Übersicht und Nahaufnahme)' }), fotos.el));
    var ok = await EG.dialog({
      titel: vorhanden ? 'Mangel bearbeiten' : 'Mangel erfassen', inhalt: inhalt, breit: true,
      knoepfe: [{ text: 'Abbrechen', art: 'ghost', wert: null }, {
        text: 'Speichern', art: 'primary', wert: 'ok',
        aktion: async function () {
          if (!kat.value) return 'Bitte eine Kategorie wählen.';
          if (!klasse) return 'Bitte die geschätzte Höhe wählen.';
          if (!beschr.value.trim()) return 'Bitte den Mangel beschreiben (Pflicht).';
          if (fotos.laedt()) return 'Ein Foto lädt noch – bitte kurz warten.';
          if (!fotos.anzahl()) return 'Ohne Foto geht es nicht – bitte mindestens ein Foto machen.';
          var punkt = null;
          if (def) punkt = await punktSpeichern(def, 'mangel', beschr.value.trim());
          var werte = { kategorie: kat.value, klasse: klasse, beschreibung: beschr.value.trim(), fotos: fotos.get() };
          if (vorhanden) chk(await T.mg().update(werte).eq('id', vorhanden.id));
          else chk(await T.mg().insert(Object.assign({ fahrzeug_id: S.id, pruefpunkt_id: punkt ? punkt.id : null, ruege_status: 'offen', erfasst_von_name: EG.nutzerName() }, werte)));
          await ruegeZuruecksetzen();
          if (['angeliefert', 'geprueft_ok', 'abgeschlossen', 'ruege_gesendet'].indexOf(S.fz.status) >= 0) await fzUpdate({ status: 'pruefung_laeuft', geprueft_am: null, geprueft_von_name: null });
          return true;
        }
      }]
    });
    if (ok === 'ok') { EG.toast('Mangel gespeichert.', 'ok'); await neuZeichnen(); }
  }
  /** Ändert sich die Mängelliste nach „Prüfung abschließen“, muss die Rüge neu zusammengesetzt werden. */
  async function ruegeZuruecksetzen() {
    if (S.fz.status !== 'ruege_offen' && S.fz.status !== 'wartet_oli') return;
    var frisch = chk(await T.mg().select('*').eq('fahrzeug_id', S.id)).data || [];   // Stand aus der Datenbank, nicht der alte Zwischenspeicher
    var m = frisch.filter(function (x) { return ['wartet_oli', 'freigegeben'].indexOf(x.ruege_status) >= 0; });
    for (var i = 0; i < m.length; i++) chk(await T.mg().update({ ruege_status: 'offen', freigegeben_von_name: null, freigegeben_am: null }).eq('id', m[i].id));
    await fzUpdate({ status: 'pruefung_laeuft', geprueft_am: null, geprueft_von_name: null, ruege_text: null });
  }

  /* ====================================================================
     ABSCHLUSS und RÜGE
     ==================================================================== */
  function abschlussKarte(beantwortet) {
    var f = S.fz, total = ALLE_PUNKTE.length, offen = total - beantwortet, st = f.status;
    var karte = h('div', { class: 'karte', style: 'margin-top:18px' }, h('h2', { text: 'Abschluss' }));
    if (st === 'angeliefert' || st === 'pruefung_laeuft') {
      var akt = aktiveMaengel();
      karte.appendChild(h('p', { text: offen ? 'Noch ' + offen + ' Punkt' + (offen === 1 ? '' : 'e') + ' offen. Jeder Punkt braucht OK, Mangel oder entfällt.' : 'Alle Punkte sind beantwortet. Erfasste Mängel: ' + akt.length + '.' }));
      karte.appendChild(h('div', { class: 'abstand' }));
      karte.appendChild(h('button', {
        type: 'button', class: 'btn btn-primary btn-block', disabled: offen > 0, text: akt.length ? 'Prüfung abschließen und Rüge vorbereiten' : 'Prüfung abschließen: ohne Befund',
        onclick: function () { abschliessen().catch(EG.fehler); }
      }));
    } else if (st === 'geprueft_ok') {
      karte.appendChild(EG.banner('Geprüft ohne Befund am ' + EG.fmtZeit(f.geprueft_am) + (f.geprueft_von_name ? ' (' + f.geprueft_von_name + ')' : '') + '. Keine Rüge nötig.', 'ok'));
      karte.appendChild(abgeschlossenKnopf());
    } else if (st === 'ruege_gesendet') {
      var gesendet = S.maengel.filter(function (m) { return m.ruege_status === 'gesendet'; })[0];
      karte.appendChild(EG.banner('Rüge gesendet' + (gesendet && gesendet.gesendet_am ? ' am ' + EG.fmtZeit(gesendet.gesendet_am) : '') + (gesendet && gesendet.gesendet_von_name ? ' von ' + gesendet.gesendet_von_name : '') + '. Das Fahrzeug bleibt unverändert stehen (§ 379 HGB), bis der Lieferant antwortet.', 'ok'));
      if (f.ruege_text) karte.appendChild(h('details', { class: 'klappe', style: 'margin-top:10px' }, h('summary', { text: 'Gesendeten Text anzeigen' }), h('div', { class: 'mangel-text klein', text: f.ruege_text })));
      karte.appendChild(abgeschlossenKnopf());
    } else if (st === 'abgeschlossen') {
      karte.appendChild(EG.banner('Abgeschlossen.', 'ok'));
    } else if (st === 'ruege_offen' || st === 'wartet_oli') {
      karte.appendChild(ruegePanel());
    }
    return karte;
  }
  function abgeschlossenKnopf() {
    return h('button', {
      type: 'button', class: 'btn btn-ghost btn-block', style: 'margin-top:10px', text: 'Als abgeschlossen markieren',
      onclick: async function () { await fzUpdate({ status: 'abgeschlossen' }); await neuZeichnen(); }
    });
  }
  async function abschliessen() {
    var akt = aktiveMaengel(), name = EG.nutzerName();
    if (!akt.length) {
      var hatGesendet = S.maengel.some(function (m) { return m.ruege_status === 'gesendet'; });
      await fzUpdate({ status: hatGesendet ? 'ruege_gesendet' : 'geprueft_ok', geprueft_am: jetzt(), geprueft_von_name: name });
      EG.toast('Geprüft ohne Befund. Protokoll gespeichert.', 'ok');
    } else {
      var ab100 = akt.some(function (m) { return m.klasse === 'ab_100'; });
      for (var i = 0; i < akt.length; i++) chk(await T.mg().update({ ruege_status: ab100 ? 'wartet_oli' : 'offen' }).eq('id', akt[i].id));
      await fzUpdate({ status: ab100 ? 'wartet_oli' : 'ruege_offen', geprueft_am: jetzt(), geprueft_von_name: name });
      EG.toast(ab100 ? 'Rüge liegt jetzt bei Oli (ab 100 €).' : 'Rüge ist vorbereitet. Jetzt senden.', 'ok');
    }
    await neuZeichnen();
  }

  function ruegeBetreff(f) {
    return 'Mängelrüge – ' + fzTitel(f) + ', FIN ' + (f.fin || '(FIN fehlt)') + ', Ihre Bestellung' + (f.lief_bestell_datum ? ' vom ' + EG.fmtDatum(f.lief_bestell_datum) : '');
  }
  /** Rüge-Text nach Vorlage 2a (Eingangsprüfung-Entwurf, Abschnitt 2a). „[Name des Absenders]“ wird beim Senden ersetzt. */
  function ruegeText(f, maengel) {
    var zaehler = 0;
    var zeilen = maengel.map(function (m, i) {
      var n = (m.fotos || []).length, ref = '';
      if (n) { var von = zaehler + 1, bis = zaehler + n; ref = ' – Foto ' + (von === bis ? von : von + '–' + bis); zaehler += n; }
      return (i + 1) + '. ' + m.kategorie + ': ' + String(m.beschreibung || '').replace(/\s*\n\s*/g, ' ').trim() + ref;
    });
    var frist = EG.fmtDatum(EG.plusWerktage(EG.heute(), 5));
    return [
      'Sehr geehrte Damen und Herren,',
      '',
      'das oben genannte Fahrzeug (' + fzTitel(f) + ', FIN ' + (f.fin || '–') + ') wurde uns am ' + EG.fmtDatum(f.angeliefert_am) + ' abgeliefert. Bei der Eingangsprüfung am ' + EG.fmtDatum(f.geprueft_am || EG.heute()) + ' haben wir folgende Mängel festgestellt:',
      '',
      zeilen.join('\n'),
      '',
      'Die Fotos liegen dieser E-Mail als Anhang bei.',
      '',
      'Wir rügen diese Mängel hiermit gemäß § 377 HGB. Wir behalten uns alle Rechte aus §§ 437 ff. BGB vor, insbesondere Nacherfüllung, Minderung, Rücktritt und Schadensersatz, bei neu hergestellten Fahrzeugen auch den Rückgriff nach §§ 445a, 478 BGB.',
      '',
      'Bitte teilen Sie uns bis ' + frist + ' mit, wie Sie die Mängel beheben. Das Fahrzeug steht bis dahin bei uns zur Besichtigung bereit. Wir verwahren es gemäß § 379 HGB einstweilen und nehmen bis zur Klärung keine Veränderungen daran vor.',
      '',
      'Mit freundlichen Grüßen',
      '[Name des Absenders]',
      'Autohaus Stieber GmbH'
    ].join('\n');
  }
  function ruegePanel() {
    var f = S.fz, akt = aktiveMaengel(), ab100 = akt.some(function (m) { return m.klasse === 'ab_100'; });
    var wartet = f.status === 'wartet_oli', admin = EG.istAdmin();
    var box = h('div', {});
    box.appendChild(h('p', { text: akt.length + ' Mangel' + (akt.length === 1 ? '' : 'e') + ' in der Rüge: ' + (ab100 ? 'mindestens einer ab 100 €.' : 'alle unter 100 €.') }));
    var kurz = h('ul', { style: 'margin:0 0 10px 20px' });
    akt.forEach(function (m) { kurz.appendChild(h('li', { class: 'umbruch' }, h('strong', { text: m.kategorie }), ' (' + klasseText(m.klasse) + '): ' + m.beschreibung)); });
    box.appendChild(kurz);
    if (wartet) {
      box.appendChild(EG.banner([h('strong', { text: 'Wartet auf Oli. ' }), 'Oli entscheidet über diese Rüge (Mangel ab 100 €). Oli bekommt eine Push-Meldung.' + (admin ? ' Du kannst sie unten prüfen, den Text ändern und freigeben.' : ' Die Rüge muss am selben oder nächsten Werktag raus – bitte sag Oli Bescheid.')], 'warn'));
    }
    // Empfänger
    var an = h('input', { type: 'email', id: 'rg-an', value: S.kontakt ? S.kontakt.email || '' : '', placeholder: 'ruege@lieferant.de', autocomplete: 'off' });
    an.addEventListener('change', function () { kontaktSpeichern(an.value).catch(EG.fehler); });
    box.appendChild(EG.feld('Empfänger (Lieferant: ' + (f.lieferant || '–') + ')', an, S.kontakt && S.kontakt.email ? null : 'Für diesen Lieferanten ist noch keine Rüge-Adresse hinterlegt. Trag sie hier ein, sie wird für das nächste Mal gemerkt.'));
    box.appendChild(h('div', { class: 'feld' }, h('div', { class: 'feld-label', text: 'Betreff' }), h('div', { class: 'umbruch fett', text: ruegeBetreff(f) })));
    var freigegebenText = f.status === 'ruege_offen' && akt.length && akt.every(function (m) { return m.ruege_status === 'freigegeben'; }) ? f.ruege_text : '';
    var vorlage = freigegebenText || ruegeText(f, akt);
    var ta = h('textarea', { id: 'rg-text', value: vorlage, readOnly: !admin, style: 'min-height:260px' });
    box.appendChild(EG.feld(admin ? 'Text (du kannst ihn ändern)' : 'Text', ta, 'Fotos: ' + akt.reduce(function (s, m) { return s + (m.fotos || []).length; }, 0) + ' als Bild im Anhang. Frist laut Vorlage: 5 Werktage.'));
    var aktionen = h('div', { style: 'display:grid;gap:10px' });
    if (wartet) {
      if (admin) aktionen.appendChild(h('button', { type: 'button', class: 'btn btn-primary btn-block', text: 'Freigeben', onclick: function () { freigeben(ta.value).catch(EG.fehler); } }));
      else aktionen.appendChild(h('button', { type: 'button', class: 'btn btn-ghost btn-block', disabled: true, text: 'Rüge senden (erst nach Olis Freigabe)' }));
    } else {
      aktionen.appendChild(h('button', { type: 'button', class: 'btn btn-primary btn-block', text: 'Rüge senden', onclick: function () { ruegeSenden(an.value, ta.value, akt).catch(EG.fehler); } }));
    }
    box.appendChild(aktionen);
    return box;
  }
  async function kontaktSpeichern(adresse) {
    adresse = adresse.trim();
    if (!adresse) return;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(adresse)) { EG.toast('Das sieht nicht wie eine E-Mail-Adresse aus.', 'fehler'); return; }
    chk(await T.kt().upsert({ lieferant: S.fz.lieferant, email: adresse }, { onConflict: 'lieferant' }));
    S.kontakt = { lieferant: S.fz.lieferant, email: adresse };
    EG.toast('Adresse für ' + S.fz.lieferant + ' gemerkt.', 'ok');
  }
  async function freigeben(text) {
    if (!EG.istAdmin()) { EG.toast('Nur Oli kann freigeben.', 'fehler'); return; }
    var akt = aktiveMaengel(), name = EG.nutzerName();
    for (var i = 0; i < akt.length; i++) chk(await T.mg().update({ ruege_status: 'freigegeben', freigegeben_von_name: name, freigegeben_am: jetzt() }).eq('id', akt[i].id));
    await fzUpdate({ status: 'ruege_offen', ruege_text: text });
    EG.toast('Freigegeben. Jetzt kann die Rüge gesendet werden.', 'ok');
    await neuZeichnen();
  }
  async function ruegeSenden(adresse, text, akt) {
    adresse = adresse.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(adresse)) { EG.toast('Bitte erst die Empfänger-Adresse des Lieferanten eintragen.', 'fehler'); document.getElementById('rg-an').focus(); return; }
    if (!S.kontakt || S.kontakt.email !== adresse) await kontaktSpeichern(adresse);
    var name = EG.nutzerName();
    var pfade = [];
    akt.forEach(function (m) { (m.fotos || []).forEach(function (p) { pfade.push(p); }); });
    var textFinal = text.split('[Name des Absenders]').join(name);
    var ok = await EG.mailMitAnhang({ an: adresse, betreff: ruegeBetreff(S.fz), text: textFinal, fotoPfade: pfade });
    if (!ok) return;
    for (var i = 0; i < akt.length; i++) chk(await T.mg().update({ ruege_status: 'gesendet', gesendet_von_name: name, gesendet_am: jetzt() }).eq('id', akt[i].id));
    await fzUpdate({ status: 'ruege_gesendet', ruege_text: textFinal });   // bleibt als Nachweis stehen
    EG.toast('Gespeichert: Rüge gesendet von ' + name + '.', 'ok');
    await neuZeichnen();
  }

  /* ---------- Notiz zum Fahrzeug ---------- */
  function notizKarte(f) {
    var ta = h('textarea', { id: 'fz-notiz', value: f.notiz || '', placeholder: 'Eigene Notiz zum Fahrzeug (optional)' });
    ta.addEventListener('change', function () {
      fzQuiet({ notiz: ta.value.trim() || null });
    });
    return h('div', { class: 'karte', style: 'margin-top:18px' }, EG.feld('Notiz zum Fahrzeug', ta));
  }
})();
