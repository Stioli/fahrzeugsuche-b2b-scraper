/* Verkaufsablauf – Reiter „Transport“ (A2) und Schnittstelle window.VK_TRANSPORT
   Paket VA5, Stand 14.11.2026, Version 4.0. Nach Plan Verkaufsablauf v2 (A2) und Bauplan v1 (E6, E7).
   Daten:
     Anlieferung vom Lieferanten  → Ansicht bestand.v_transport_sicht (alle Rollen, ohne Kosten/EK). In Schritt 1a nur lesen (Masterliste führt).
     Lieferung zum Kunden         → verkauf.lieferung (lesen alle Rollen, schreiben admin/dispo/buchhaltung), je Akte.
     Transportkosten (Lieferung)  → verkauf.lieferung_kosten (nur admin/dispo/buchhaltung; für die anderen Rollen wird die Tabelle nie abgefragt).
   Wird vor eingang-verkauf.js geladen. Baut auf window.EG (eingang-core.js) auf. */
(function () {
  'use strict';
  var EG = window.EG, h = EG.h;

  var SCHREIBER = ['admin', 'dispo', 'buchhaltung'];
  var IM_HAUS = '5 im Haus';
  function rolle() { return EG.rolle || ''; }
  function darfSchreiben() { return SCHREIBER.indexOf(rolle()) >= 0; }
  function sieheKosten() { return SCHREIBER.indexOf(rolle()) >= 0; }
  function sieheAkten() { return rolle() !== 'werkstatt'; }   // werkstatt darf verkauf.akte nicht lesen

  /* ====================================================================
     Stile (einmalig, nur eigene Klassen vkt-*)
     ==================================================================== */
  function stileEinbauen() {
    if (document.getElementById('vkt-stile')) return;
    var s = document.createElement('style');
    s.id = 'vkt-stile';
    s.textContent =
      '.vkt-zeile{padding:12px 16px}' +
      '.vkt-zeile.vkt-fokus{border:2px solid var(--blau)}' +
      '.vkt-kopf{display:flex;justify-content:space-between;align-items:flex-start;gap:10px;flex-wrap:wrap}' +
      '.vkt-kopf h3{font-size:17px;margin:0}' +
      '.vkt-kv{display:grid;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:6px 18px;margin:8px 0 0;font-size:15px}' +
      '.vkt-kv div{min-width:0}' +
      '.vkt-kv dt{font-size:13px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:var(--sub)}' +
      '.vkt-kv dd{margin:0;overflow-wrap:anywhere}' +
      '.vkt-abschnitt{margin:22px 0 8px;font-size:20px}' +
      '.vkt-aktionen{margin-top:10px;display:flex;gap:10px;flex-wrap:wrap}' +
      '.vkt-statuszeile{font-size:14px;color:var(--sub)}' +
      '.vkt-statuszeile strong{color:var(--ink);font-weight:700}' +
      '.vkt-statuszeile.vkt-ok strong{color:var(--gruen-text)}' +
      '.vkt-statuszeile.vkt-warn strong{color:var(--rot-text)}';
    document.head.appendChild(s);
  }
  stileEinbauen();

  /* ====================================================================
     Hilfen
     ==================================================================== */
  function txt(v) { return v == null ? '' : String(v).trim(); }
  function leer(v) { return txt(v) === ''; }
  function datum(v) { return leer(v) ? '' : EG.fmtDatum(v); }
  function kurzDatum(v) { var d = datum(v); return d ? d.slice(0, 6) : ''; }   // 18.11.
  function euro(v) {
    if (v == null || v === '') return '–';
    var n = Number(v);
    return isNaN(n) ? String(v) : n.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' });
  }
  function statusArt(s) {
    s = txt(s);
    if (s === IM_HAUS) return 'gruen';
    if (s.indexOf('1') === 0 || s.indexOf('3') === 0) return 'gold';
    if (s.indexOf('4') === 0) return 'rot';
    if (s.indexOf('6') === 0) return 'grau';
    return '';
  }
  function istOffen(z) { return !leer(z.transportstatus) && txt(z.transportstatus) !== IM_HAUS; }
  function fzTitel(z) { return [z.hersteller, z.modell].filter(Boolean).join(' ') || 'Fahrzeug'; }
  function punktOk(r) { return r && (r.status === 'ok' || r.status == null); }
  function chunks(a, n) { var r = []; for (var i = 0; i < a.length; i += n) r.push(a.slice(i, i + n)); return r; }
  function kv(paare) {
    var dl = h('dl', { class: 'vkt-kv' });
    paare.forEach(function (p) {
      if (!p) return;
      dl.appendChild(h('div', {}, h('dt', { text: p[0] }), h('dd', { class: leer(p[1]) ? 'muted' : null, text: leer(p[1]) ? '–' : String(p[1]) })));
    });
    return dl;
  }

  /* ====================================================================
     Daten laden
     ==================================================================== */
  /** Anlieferungen aus der Ansicht (nie werfen). → { zeilen, fehler } */
  async function ladeTransportSicht(ids) {
    try {
      var out = [];
      var teile = ids ? chunks(ids, 100) : [null];
      for (var i = 0; i < teile.length; i++) {
        var q = EG.tab('bestand', 'v_transport_sicht').select('*');
        if (teile[i]) q = q.in('stieber_id', teile[i]);
        var r = await q;
        if (r.error) return { zeilen: out, fehler: r.error.message || 'Fehler' };
        out = out.concat(r.data || []);
      }
      return { zeilen: out, fehler: null };
    } catch (e) { return { zeilen: [], fehler: (e && e.message) || 'Fehler' }; }
  }
  /** Lieferungen zu Akten (ohne Kosten). akteIds = null → alle lesbaren. → { zeilen, fehler } */
  async function ladeLieferungen(akteIds) {
    try {
      var out = [];
      var teile = akteIds ? chunks(akteIds, 100) : [null];
      for (var i = 0; i < teile.length; i++) {
        var q = EG.tab('verkauf', 'lieferung').select('*');
        if (teile[i]) q = q.in('akte_id', teile[i]);
        var r = await q;
        if (r.error) return { zeilen: out, fehler: r.error.message || 'Fehler' };
        out = out.concat(r.data || []);
      }
      return { zeilen: out, fehler: null };
    } catch (e) { return { zeilen: [], fehler: (e && e.message) || 'Fehler' }; }
  }
  async function ladeKosten() {
    if (!sieheKosten()) return { zeilen: [], fehler: null };   // verkauf/werkstatt: nie abfragen
    try {
      var r = await EG.tab('verkauf', 'lieferung_kosten').select('*');
      if (r.error) return { zeilen: [], fehler: r.error.message || 'Fehler' };
      return { zeilen: r.data || [], fehler: null };
    } catch (e) { return { zeilen: [], fehler: (e && e.message) || 'Fehler' }; }
  }
  /** Akten (laufend) + Übergabeart. → { akten, art: {akte_id: 'Lieferung'|'Abholung'|…}, fehler } */
  async function ladeAkten() {
    var res = { akten: [], art: {}, fehler: null };
    if (!sieheAkten()) return res;
    try {
      var r = await EG.tab('verkauf', 'akte').select('*').order('created_at', { ascending: false });
      if (r.error) { res.fehler = r.error.message || 'Fehler'; return res; }
      res.akten = (r.data || []).filter(function (a) { return a.phase_aktuell !== 'abgebrochen'; });
      var p = await EG.tab('verkauf', 'punkt').select('akte_id,phase,punkt_key,status,wert').eq('punkt_key', 'abholung_lieferung');
      if (!p.error) (p.data || []).forEach(function (x) {
        if (!punktOk(x)) return;
        var w = x.wert && (x.wert.auswahl || x.wert);
        if (typeof w === 'string') res.art[x.akte_id] = w;
      });
    } catch (e) { res.fehler = (e && e.message) || 'Fehler'; }
    return res;
  }

  /* ====================================================================
     Reiter „Transport“
     ==================================================================== */
  var S = { root: null, filter: 'offen', suche: '', fokus: null, demoGesaet: false, zeichnet: 0 };

  async function zeichneReiter(root) {
    S.root = root;
    var lauf = ++S.zeichnet;
    root.innerHTML = '';
    root.appendChild(h('p', { class: 'muted', text: 'Lade Transport …' }));

    // Demo: die Demo-Akten entstehen erst beim ersten Öffnen des Reiters Verkauf – einmal kurz anstoßen.
    if (EG.demo && !S.demoGesaet && sieheAkten()) {
      S.demoGesaet = true;
      try {
        var t = await EG.tab('verkauf', 'akte').select('id').limit(1);
        if (!t.error && !(t.data || []).length) { EG.zeigeTab('verkauf'); EG.zeigeTab('transport'); return; }
      } catch (e) { /* egal */ }
    }

    var leerErg = { zeilen: [], fehler: null };
    var teile = await Promise.all([ladeTransportSicht(null), ladeAkten(), sieheAkten() ? ladeLieferungen(null) : leerErg, ladeKosten()]);
    if (lauf !== S.zeichnet) return;   // ein neueres Zeichnen läuft
    S.zeilen = teile[0].zeilen; S.fehlerSicht = teile[0].fehler;
    S.akten = teile[1].akten; S.art = teile[1].art; S.fehlerAkten = teile[1].fehler;
    S.lief = {}; teile[2].zeilen.forEach(function (l) { S.lief[l.akte_id] = l; }); S.fehlerLief = teile[2].fehler;
    S.kosten = {}; teile[3].zeilen.forEach(function (k) { S.kosten[k.akte_id] = k; });
    zeichne();
  }

  function passtSuche(werte) {
    var q = S.suche.toLowerCase();
    if (!q) return true;
    return werte.filter(Boolean).join(' ').toLowerCase().indexOf(q) >= 0;
  }

  function zeichne() {
    var root = S.root; if (!root) return;
    root.innerHTML = '';
    root.appendChild(h('h2', { text: 'Transport' }));
    root.appendChild(EG.banner('Anlieferung vom Lieferanten: Die Angaben kommen aus der Masterliste und werden hier nur angezeigt (Bearbeiten folgt später).' +
      (darfSchreiben() ? ' Die Lieferung zum Kunden pflegst du hier.' : ' Die Lieferung zum Kunden ändern Dispo, Buchhaltung und Oli.'), 'info'));

    var offenAnz = S.zeilen.filter(istOffen).length;
    var suche = h('input', { type: 'search', placeholder: 'Suchen: Fahrzeug, Nr., Spedition, Kunde …', value: S.suche, 'aria-label': 'Transport durchsuchen' });
    suche.addEventListener('input', function () { S.suche = suche.value; zeichneListen(); });
    var chips = h('div', { class: 'chips' });
    [['offen', 'Unterwegs / offen (' + offenAnz + ')'], ['alle', 'Alle (' + S.zeilen.length + ')']].forEach(function (c) {
      chips.appendChild(h('button', {
        type: 'button', class: 'chip', 'aria-pressed': S.filter === c[0] ? 'true' : 'false', text: c[1],
        onclick: function () { S.filter = c[0]; zeichne(); }
      }));
    });
    root.appendChild(h('div', { class: 'leiste' }, h('div', { class: 'leiste-zeile' }, suche), h('div', { class: 'leiste-zeile' }, chips)));
    S.listenBox = h('div', {});
    root.appendChild(S.listenBox);
    zeichneListen();
    if (S.fokus) {
      var el = root.querySelector('.vkt-fokus');
      if (el && el.scrollIntoView) el.scrollIntoView({ block: 'center' });
    }
  }

  function zeichneListen() {
    var box = S.listenBox; if (!box) return;
    box.innerHTML = '';

    /* --- Anlieferung vom Lieferanten --- */
    box.appendChild(h('h3', { class: 'vkt-abschnitt', text: 'Anlieferung vom Lieferanten' }));
    if (S.fehlerSicht) box.appendChild(EG.banner('Die Anlieferungen konnten nicht geladen werden (' + S.fehlerSicht + ').', 'warn'));
    var liste = S.zeilen.filter(function (z) {
      if (S.fokus && z.stieber_id === S.fokus) return true;
      return S.filter === 'alle' || istOffen(z);
    }).filter(function (z) {
      return passtSuche([z.stieber_id, z.interne_nr, z.hersteller, z.modell, z.spedition, z.transportstatus, z.abholadresse]);
    });
    liste.sort(function (a, b) {
      if (S.fokus) { if (a.stieber_id === S.fokus) return -1; if (b.stieber_id === S.fokus) return 1; }
      var da = txt(a.gepl_anlieferung), db = txt(b.gepl_anlieferung);
      if (da === db) return txt(a.stieber_id) < txt(b.stieber_id) ? -1 : 1;
      if (!da) return 1; if (!db) return -1;
      return da < db ? -1 : 1;
    });
    if (!liste.length && !S.fehlerSicht) box.appendChild(h('div', { class: 'leer', text: S.filter === 'offen' ? 'Keine Fahrzeuge unterwegs oder offen.' : 'Keine Fahrzeuge gefunden.' }));
    liste.forEach(function (z) { box.appendChild(anlieferungKarte(z)); });

    /* --- Lieferung zum Kunden --- */
    box.appendChild(h('h3', { class: 'vkt-abschnitt', text: 'Lieferung zum Kunden' }));
    if (!sieheAkten()) {
      box.appendChild(EG.banner('Die Lieferung zum Kunden enthält Kundendaten und wird der Werkstatt nicht angezeigt. Übergabetermine siehst du im Reiter Auslieferung.', 'info'));
      return;
    }
    if (S.fehlerAkten || S.fehlerLief) box.appendChild(EG.banner('Die Lieferungen konnten nicht vollständig geladen werden (' + (S.fehlerAkten || S.fehlerLief) + ').', 'warn'));
    var fzIndex = {};
    S.zeilen.forEach(function (z) { if (!leer(z.interne_nr)) fzIndex[z.interne_nr] = z; });
    var eintraege = (S.akten || []).filter(function (a) { return S.art[a.id] === 'Lieferung' || S.lief[a.id]; }).map(function (a) {
      return { akte: a, lief: S.lief[a.id] || null, kosten: S.kosten[a.id] || null, fz: fzIndex[a.interne_nr] || null };
    }).filter(function (e) {
      if (S.fokus && e.fz && e.fz.stieber_id === S.fokus) return true;
      if (S.filter === 'offen' && e.lief && !leer(e.lief.ausgeliefert_am)) return false;
      return true;
    }).filter(function (e) {
      return passtSuche([e.akte.kunde_name, e.akte.interne_nr, e.akte.hersteller, e.akte.modell, e.lief && e.lief.lieferadresse, e.lief && e.lief.spedition]);
    });
    eintraege.sort(function (a, b) {
      var ta = txt(a.lief && a.lief.liefertermin), tb = txt(b.lief && b.lief.liefertermin);
      if (ta === tb) return 0;
      if (!ta) return 1; if (!tb) return -1;
      return ta < tb ? -1 : 1;
    });
    if (!eintraege.length && !S.fehlerAkten) box.appendChild(h('div', { class: 'leer', text: S.filter === 'offen' ? 'Keine offenen Lieferungen zum Kunden.' : 'Keine Verkaufsakten mit Lieferung.' }));
    eintraege.forEach(function (e) { box.appendChild(lieferungKarte(e)); });
  }

  function anlieferungKarte(z) {
    var fokus = S.fokus && z.stieber_id === S.fokus;
    var angekommen = txt(z.transportstatus) === IM_HAUS;
    var papiere = !leer(z.papiere_eingang_ahs) ? 'da seit ' + datum(z.papiere_eingang_ahs) :
      (!leer(z.papiere_angefordert) ? 'angefordert am ' + datum(z.papiere_angefordert) : 'noch nicht da');
    var k = h('div', { class: 'karte vkt-zeile' + (fokus ? ' vkt-fokus' : ''), 'data-stieber': z.stieber_id || '' },
      h('div', { class: 'vkt-kopf' },
        h('div', {}, h('h3', { text: fzTitel(z) }), h('div', { class: 'klein muted', text: [z.stieber_id, z.interne_nr ? 'Nr. ' + z.interne_nr : ''].filter(Boolean).join(' · ') })),
        EG.pill(leer(z.transportstatus) ? 'Kein Status' : z.transportstatus, leer(z.transportstatus) ? 'grau' : statusArt(z.transportstatus))),
      kv([
        ['Abholfreigabe', z.abholfreigabe],
        ['Abholadresse', z.abholadresse],
        ['Spedition', z.spedition],
        ['Spedition beauftragt', z.spedition_beauftragt],
        ['Geplante Anlieferung', datum(z.gepl_anlieferung)],
        ['Angekommen', angekommen ? 'Ja' + (leer(z.fzg_anlieferung_ahs) ? '' : ', ' + datum(z.fzg_anlieferung_ahs)) : (leer(z.fzg_anlieferung_ahs) ? 'Noch nicht' : datum(z.fzg_anlieferung_ahs))],
        ['Papiere (ZB II / COC)', papiere + (leer(z.papiere_standort) ? '' : ' · ' + z.papiere_standort)]
      ]));
    return k;
  }

  function lieferungKarte(e) {
    var a = e.akte, l = e.lief, fokus = S.fokus && e.fz && e.fz.stieber_id === S.fokus;
    var aus = l && !leer(l.ausgeliefert_am);
    var pill = aus ? EG.pill('Ausgeliefert ' + datum(l.ausgeliefert_am), 'gruen') : (l && (!leer(l.liefertermin) || !leer(l.lieferadresse)) ? EG.pill('Geplant', '') : EG.pill('Noch keine Angaben', 'grau'));
    var paare = [
      ['Kunde', a.kunde_name],
      ['Lieferadresse', l && l.lieferadresse],
      ['Liefertermin', l && datum(l.liefertermin)],
      ['Spedition', l && l.spedition],
      ['Ausgeliefert am', l && datum(l.ausgeliefert_am)],
      ['Notiz', l && l.notiz]
    ];
    if (sieheKosten()) paare.push(['Transportkosten', e.kosten ? euro(e.kosten.kosten) + (leer(e.kosten.notiz) ? '' : ' · ' + e.kosten.notiz) : '']);
    var k = h('div', { class: 'karte vkt-zeile' + (fokus ? ' vkt-fokus' : ''), 'data-akte': a.id },
      h('div', { class: 'vkt-kopf' },
        h('div', {}, h('h3', { text: [a.hersteller, a.modell].filter(Boolean).join(' ') || 'Fahrzeug' }), h('div', { class: 'klein muted', text: a.interne_nr ? 'Nr. ' + a.interne_nr : '' })),
        pill),
      kv(paare));
    if (l && !leer(l.erledigt_von_name)) k.appendChild(h('div', { class: 'klein muted', style: 'margin-top:6px', text: 'Zuletzt gepflegt von ' + l.erledigt_von_name }));
    if (darfSchreiben()) {
      k.appendChild(h('div', { class: 'vkt-aktionen' },
        h('button', { type: 'button', class: 'btn btn-ghost btn-klein', text: l ? 'Lieferung bearbeiten' : 'Lieferung erfassen', onclick: function () { bearbeiten(e).catch(EG.fehler); } })));
    } else {
      k.appendChild(h('div', { class: 'klein muted', style: 'margin-top:6px', text: 'Nur lesen – ändern dürfen Dispo, Buchhaltung und Oli.' }));
    }
    return k;
  }

  async function bearbeiten(e) {
    if (!darfSchreiben()) { EG.toast('Die Lieferung zum Kunden ändern nur Dispo, Buchhaltung und Oli.', 'fehler'); return; }
    var l = e.lief || {}, ko = e.kosten || {};
    var fAdr = h('textarea', { id: 'vkt-adr', value: l.lieferadresse || '', rows: 3 });
    var fTer = h('input', { type: 'date', id: 'vkt-ter', value: l.liefertermin || '' });
    var fSpe = h('input', { type: 'text', id: 'vkt-spe', value: l.spedition || '', autocomplete: 'off' });
    var fAus = h('input', { type: 'date', id: 'vkt-aus', value: l.ausgeliefert_am || '' });
    var fNot = h('textarea', { id: 'vkt-not', value: l.notiz || '', rows: 2 });
    var fKos = h('input', { type: 'number', id: 'vkt-kos', step: '0.01', min: '0', value: ko.kosten == null ? '' : ko.kosten });
    var fKn = h('input', { type: 'text', id: 'vkt-kn', value: ko.notiz || '', autocomplete: 'off' });
    var inhalt = [
      h('p', { class: 'muted', text: [e.akte.hersteller, e.akte.modell].filter(Boolean).join(' ') + ' · ' + (e.akte.kunde_name || 'ohne Kunde') }),
      EG.feld('Lieferadresse', fAdr),
      h('div', { class: 'zeile2' }, EG.feld('Liefertermin', fTer), EG.feld('Spedition / Fahrer', fSpe)),
      EG.feld('Ausgeliefert am', fAus, 'Erst eintragen, wenn das Fahrzeug beim Kunden angekommen ist.'),
      EG.feld('Notiz', fNot),
      sieheKosten() ? h('div', {}, h('h3', { text: 'Transportkosten (nur Dispo, Buchhaltung, Oli)', style: 'margin:6px 0 8px' }),
        h('div', { class: 'zeile2' }, EG.feld('Kosten in Euro', fKos), EG.feld('Notiz zu den Kosten', fKn))) : null
    ];
    var w = await EG.dialog({
      titel: 'Lieferung zum Kunden', inhalt: inhalt, breit: true,
      knoepfe: [
        { text: 'Abbrechen', art: 'ghost', wert: false },
        { text: 'Speichern', art: 'primary', wert: true, aktion: async function () {
          var zeile = {
            akte_id: e.akte.id,
            lieferadresse: fAdr.value.trim() || null, liefertermin: fTer.value || null, spedition: fSpe.value.trim() || null,
            ausgeliefert_am: fAus.value || null, notiz: fNot.value.trim() || null, erledigt_von_name: EG.nutzerName()
          };
          var r = await EG.tab('verkauf', 'lieferung').upsert(zeile, { onConflict: 'akte_id' });
          if (r.error) return 'Speichern nicht möglich: ' + (r.error.message || 'Fehler');
          if (sieheKosten() && (fKos.value !== '' || fKn.value.trim() !== '' || e.kosten)) {
            var kz = { akte_id: e.akte.id, kosten: fKos.value === '' ? null : Number(fKos.value), notiz: fKn.value.trim() || null };
            var r2 = await EG.tab('verkauf', 'lieferung_kosten').upsert(kz, { onConflict: 'akte_id' });
            if (r2.error) return 'Kosten nicht gespeichert: ' + (r2.error.message || 'Fehler');
          }
          return true;
        } }
      ]
    });
    if (w === true) {
      EG.toast('Lieferung gespeichert.', 'ok');
      var teile = await Promise.all([ladeLieferungen(null), ladeKosten()]);
      S.lief = {}; teile[0].zeilen.forEach(function (x) { S.lief[x.akte_id] = x; }); S.fehlerLief = teile[0].fehler;
      S.kosten = {}; teile[1].zeilen.forEach(function (x) { S.kosten[x.akte_id] = x; });
      zeichne();
    }
  }

  EG.onTab('transport', function (root) { return zeichneReiter(root); });

  /* ====================================================================
     Schnittstelle für den Reiter Verkauf (VA3)
     ==================================================================== */
  window.VK_TRANSPORT = {
    /** fahrzeugIds (stieber_id) → Promise<{ [fahrzeug_id]: eintrag }>. Wirft nie. */
    ladeStatus: async function (fahrzeugIds) {
      var ergebnis = {};
      try {
        var ids = (fahrzeugIds || []).filter(function (x, i, a) { return !leer(x) && a.indexOf(x) === i; });
        if (!ids.length) return ergebnis;
        var sicht = await ladeTransportSicht(ids);
        sicht.zeilen.forEach(function (z) {
          ergebnis[z.stieber_id] = {
            stieber_id: z.stieber_id,
            transportstatus: z.transportstatus || null,
            gepl_anlieferung: z.gepl_anlieferung || null,
            fzg_anlieferung_ahs: z.fzg_anlieferung_ahs || null,
            papiere_eingang_ahs: z.papiere_eingang_ahs || null,
            papiere_standort: z.papiere_standort || null,
            spedition: z.spedition || null,
            angekommen: txt(z.transportstatus) === IM_HAUS,
            lieferung: null,
            _interne_nr: z.interne_nr || null
          };
        });
        // Lieferung zum Kunden über die Akte (nur wenn lesbar; werkstatt bekommt hier nichts)
        if (sieheAkten()) {
          try {
            var nrs = Object.keys(ergebnis).map(function (k) { return ergebnis[k]._interne_nr; }).filter(Boolean);
            var akten = [];
            for (var i = 0, t = chunks(nrs, 100); i < t.length; i++) {
              var ra = await EG.tab('verkauf', 'akte').select('id,interne_nr,phase_aktuell').in('interne_nr', t[i]);
              if (!ra.error) akten = akten.concat(ra.data || []);
            }
            akten = akten.filter(function (a) { return a.phase_aktuell !== 'abgebrochen'; });
            if (akten.length) {
              var lf = await ladeLieferungen(akten.map(function (a) { return a.id; }));
              var nachAkte = {}; lf.zeilen.forEach(function (x) { nachAkte[x.akte_id] = x; });
              akten.forEach(function (a) {
                var l = nachAkte[a.id]; if (!l) return;
                Object.keys(ergebnis).forEach(function (k) {
                  if (ergebnis[k]._interne_nr === a.interne_nr) ergebnis[k].lieferung = { liefertermin: l.liefertermin || null, ausgeliefert_am: l.ausgeliefert_am || null, spedition: l.spedition || null };
                });
              });
            }
          } catch (e2) { /* Lieferung bleibt leer */ }
        }
        Object.keys(ergebnis).forEach(function (k) { delete ergebnis[k]._interne_nr; });
      } catch (e) { /* leeres/Teil-Ergebnis */ }
      return ergebnis;
    },

    /** eintrag → HTMLElement mit kurzer Statuszeile, ohne Kosten. Wirft nie. */
    statusZeile: function (eintrag) {
      var el = h('div', { class: 'vkt-statuszeile' });
      try {
        if (!eintrag || leer(eintrag.transportstatus)) { el.textContent = 'Transport: keine Angabe'; return el; }
        el.appendChild(document.createTextNode('Transport: '));
        el.appendChild(h('strong', { text: eintrag.transportstatus }));
        var teile = [];
        if (eintrag.angekommen) {
          teile.push(!leer(eintrag.fzg_anlieferung_ahs) ? 'angekommen ' + kurzDatum(eintrag.fzg_anlieferung_ahs) : 'angekommen');
        } else if (!leer(eintrag.gepl_anlieferung)) {
          teile.push('Anlieferung ' + kurzDatum(eintrag.gepl_anlieferung));
        }
        teile.push(!leer(eintrag.papiere_eingang_ahs) ? 'Papiere da' : 'Papiere offen');
        var l = eintrag.lieferung;
        if (l) {
          if (!leer(l.ausgeliefert_am)) teile.push('ausgeliefert ' + kurzDatum(l.ausgeliefert_am));
          else if (!leer(l.liefertermin)) teile.push('Lieferung zum Kunden ' + kurzDatum(l.liefertermin));
        }
        el.appendChild(document.createTextNode(' · ' + teile.join(' · ')));
        if (eintrag.angekommen) el.className += ' vkt-ok';
      } catch (e) { el.textContent = 'Transport: keine Angabe'; }
      return el;
    },

    /** Springt in den Reiter Transport und zeigt das Fahrzeug (stieber_id). */
    oeffne: function (fahrzeugId) {
      try {
        S.fokus = leer(fahrzeugId) ? null : String(fahrzeugId);
        S.suche = '';
        S.filter = 'alle';
        EG.zeigeTab('transport');
      } catch (e) { /* nichts */ }
    }
  };

  /* ====================================================================
     DEMO-DATEN (nur ?demo=1). Akten ST-26-9001..9003 entsprechen den Demo-Akten 90101..90103 aus VA3/eingang-verkauf.js
     (Zuordnung über interne_nr). Seed wirkt nur, wenn die Tabelle noch leer ist.
     ==================================================================== */
  if (EG.demo) {
    var tag = function (n) { var x = new Date(); x.setDate(x.getDate() + n); return EG.isoDatum(x); };
    EG.demoSeed('bestand.v_transport_sicht', [
      { stieber_id: 'ST-26-9001', interne_nr: '90101', hersteller: 'Hyundai', modell: 'Tucson 1.6 T-GDI Demo', spedition: null, abholfreigabe: null, spedition_beauftragt: null,
        abholadresse: null, transportstatus: '6 bestellt', fzg_anlieferung_ahs: null, papiere_angefordert: null, papiere_eingang_ahs: null, papiere_standort: null, gepl_anlieferung: tag(12) },
      { stieber_id: 'ST-26-9002', interne_nr: '90102', hersteller: 'Kia', modell: 'Sportage 1.6 Demo', spedition: 'Demo-Spedition Süd', abholfreigabe: 'ja', spedition_beauftragt: 'ja',
        abholadresse: 'Demo-Autohaus Nord, Musterweg 1, 12345 Musterstadt', transportstatus: '2 geplant', fzg_anlieferung_ahs: null, papiere_angefordert: tag(-3), papiere_eingang_ahs: null, papiere_standort: 'beim Lieferanten', gepl_anlieferung: tag(4) },
      { stieber_id: 'ST-26-9003', interne_nr: '90103', hersteller: 'Opel', modell: 'Mokka Demo Edition', spedition: 'Demo-Spedition Süd', abholfreigabe: 'ja', spedition_beauftragt: 'ja',
        abholadresse: 'Beispiel Fahrzeughandel, Testallee 7, 54321 Beispielstadt', transportstatus: '5 im Haus', fzg_anlieferung_ahs: tag(-4), papiere_angefordert: tag(-9), papiere_eingang_ahs: tag(-3), papiere_standort: 'Büro (Fahrzeugakte)', gepl_anlieferung: tag(-5) },
      { stieber_id: 'ST-26-9101', interne_nr: '90201', hersteller: 'Nissan', modell: 'Qashqai Demo', spedition: 'Demo-Fahrdienst West', abholfreigabe: 'ja', spedition_beauftragt: 'nein',
        abholadresse: 'Demo-Autohaus West, Probestraße 3, 11111 Westdorf', transportstatus: '3 abholbereit nicht geplant', fzg_anlieferung_ahs: null, papiere_angefordert: null, papiere_eingang_ahs: null, papiere_standort: null, gepl_anlieferung: null },
      { stieber_id: 'ST-26-9102', interne_nr: '90202', hersteller: 'Opel', modell: 'Corsa Demo', spedition: 'Demo-Spedition Süd', abholfreigabe: 'nicht erforderlich', spedition_beauftragt: 'ja',
        abholadresse: null, transportstatus: '1 wird gebracht', fzg_anlieferung_ahs: null, papiere_angefordert: tag(-6), papiere_eingang_ahs: tag(-1), papiere_standort: 'Büro (Fahrzeugakte)', gepl_anlieferung: tag(1) }
    ]);
    // Lieferung zum Kunden für die Demo-Akte C (interne Nr. 90103, Übergabeart „Lieferung“)
    EG.demoSeed('verkauf.lieferung', [
      { akte_id: 'a0000001-0000-4000-8000-000000000003', lieferadresse: 'Demo-Weg 5, 70000 Musterstadt', liefertermin: tag(2), spedition: 'Demo-Fahrdienst West',
        ausgeliefert_am: null, notiz: 'Kunde ab 10 Uhr zu Hause (Demo)', erledigt_von_name: 'Dispo (Demo)', updated_at: new Date().toISOString() }
    ]);
    EG.demoSeed('verkauf.lieferung_kosten', [
      { akte_id: 'a0000001-0000-4000-8000-000000000003', kosten: 180, notiz: 'Demo-Pauschale', updated_at: new Date().toISOString() }
    ]);
  }
})();
