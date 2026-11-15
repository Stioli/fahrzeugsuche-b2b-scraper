/* Stieber-App – Reiter „Übersicht“ (A4: Vollständigkeit je Verkaufsakte), Version 4.2, Stand 15.11.2026 (Paket VA6)
   Plan: „Anpassungen Verkaufsablauf“ v2 (A4, Abschnitt 3, Frage 2, Abschnitt 6), Bauplan v1 (E2).

   Was der Reiter zeigt
   - Je laufender Verkaufsakte eine Zeile mit einer Ampel je Phase (p01–p11) und je Bereich (Zahlungen Kunde, Zahlungen Lieferant, Transport Anlieferung).
     Die Ampeln kommen aus window.VK_BERECHNUNG (eingang-verkauf.js) und damit aus VK_AMPEL – die Regeln stehen nur dort (E2).
   - Klick auf eine Ampel: „was fehlt, bei wem“ (Punkt, zuständige Rolle, Grund bei NOK) und – für Phase 9 – die Sperre „voll bezahlt“.
     Klick auf die Akte (oder „Akte öffnen“): Reiter Verkauf (VK_AKTE_OEFFNEN); für die Zahlungs-Ampeln „Zahlungen öffnen“ (VK_ZAHLUNGEN.oeffne).
   - Nirgends Beträge. Der Zahlungsstand (bezahlt / teilweise / offen) kommt aus der Ansicht verkauf.v_zahlstand.
   - Filter „Rot/Gelb“ (Standard) und „Alle“, Suche, Sortierung nach Übergabetermin (ohne Termin ans Ende).

   Sicht je Rolle (Plan v2, Frage 2)
   - admin, dispo, buchhaltung: alle laufenden Akten, alle Spalten.
   - verkauf: nur Akten mit dem eigenen Verkäufer-Kürzel; die Zahlungen sieht er nur als Stand (bezahlt / teilweise / offen) aus v_zahlstand,
     keine Einzelpunkte (A1-Haken darf er in der Datenbank nicht lesen).
   - werkstatt: nur Aufbereitung/Werkstatt (Phase 7) und Transport Anlieferung, gelesen aus verkauf.v_werkstatt_sicht (werkstatt darf verkauf.akte
     und verkauf.punkt nicht lesen). Keine Kundendaten, keine Beträge.
   VA9 (15.11.2026): für admin/dispo/buchhaltung hängt unter der Liste der Abschnitt „Bewertungen zuordnen“ (window.VK_BEWERTUNGEN, verkauf-bewertungen.js).
   Baut auf window.EG, window.VK_PHASEN, window.VK_AMPEL und window.VK_BERECHNUNG / window.VK_ZAHLSTAND (eingang-verkauf.js) auf. */
(function () {
  'use strict';
  var EG = window.EG, h = EG && EG.h, PH = window.VK_PHASEN, AMP = window.VK_AMPEL;
  if (!EG) return;
  if (!PH || !AMP) { console.error('verkauf-phasen.js bzw. verkauf-ampel.js fehlt – Reiter Übersicht nicht aktiv.'); return; }

  var BUERO = ['admin', 'dispo', 'buchhaltung'];
  var PH_BY = {}; PH.forEach(function (p) { PH_BY[p.key] = p; });
  var PHASEN = PH.filter(function (p) { return p.typ === 'phase'; });
  var BEREICHE = ['a1_kunde', 'a1_lieferant', 'a2_anlieferung'];
  var BEREICH_KURZ = { a1_kunde: 'Zahl. Kd', a1_lieferant: 'Zahl. Lf', a2_anlieferung: 'Transp.' };
  var AMPEL_TEXT = { gruen: 'Fertig', gelb: 'In Arbeit', rot: 'Achtung', grau: 'Entfällt' };
  var ZAHL_TEXT = { bezahlt: 'Bezahlt', teilweise: 'Teilweise', offen: 'Offen' };
  var ZAHL_PILL = { bezahlt: 'gruen', teilweise: 'gold', offen: 'gold' };
  var ROLLENNAME = { admin: 'OS', dispo: 'Dispo', buchhaltung: 'Buchhaltung', verkauf: 'Verkauf', werkstatt: 'Werkstatt' };
  var IM_HAUS = '5 im Haus';

  var S = { root: null, daten: [], filter: 'offen', suche: '', offen: null, hinweis: '', kuerzel: undefined, werkstatt: [], listBox: null, chipBox: null, laedt: false };

  (function stil() {
    try {
      if (document.getElementById('vku-stil')) return;
      var st = document.createElement('style'); st.id = 'vku-stil';
      st.textContent = [
        '.vku-wrap{overflow-x:auto;-webkit-overflow-scrolling:touch}',
        '.vku-tab{min-width:100%;width:max-content}',
        '.vku-zeile{display:grid;grid-template-columns:64px minmax(190px,1.4fr) 92px 52px repeat(11,28px) 12px repeat(3,56px);gap:4px;align-items:center;padding:8px 6px;border-bottom:1px solid var(--line,#E2E8F0)}',
        '.vku-zeile.vku-wk{grid-template-columns:64px minmax(210px,1.6fr) 100px 150px 150px}',
        '.vku-zeile.vku-vk{grid-template-columns:64px minmax(190px,1.4fr) 92px 52px repeat(11,28px) 12px 96px 56px}',
        '.vku-kopf{font-size:13px;font-weight:700;color:var(--sub,#5B6577);border-bottom:2px solid var(--line,#E2E8F0)}',
        '.vku-kopf span{text-align:center}.vku-kopf span:nth-child(-n+4){text-align:left}',
        '.vku-akte{background:none;border:0;padding:0;margin:0;font:inherit;text-align:left;cursor:pointer;color:inherit;display:block}',
        '.vku-akte strong{display:block}.vku-akte:hover strong{text-decoration:underline}',
        '.vku-sub{display:block;font-size:13px;color:var(--sub,#5B6577)}',
        '.vku-dot{display:inline-flex;align-items:center;justify-content:center;min-width:28px;min-height:28px;border:2px solid transparent;border-radius:50%;background:none;padding:0;cursor:pointer}',
        '.vku-dot[aria-expanded="true"]{border-color:var(--blau,#007BFF);background:rgba(0,123,255,.08)}',
        '.vku-dot .vk-dot{width:16px;height:16px;margin:0}',
        '.vku-bereich{display:inline-flex;align-items:center;justify-content:center;gap:4px;min-height:28px;min-width:48px;border:2px solid transparent;border-radius:14px;background:none;padding:0 4px;cursor:pointer;font-size:12px}',
        '.vku-bereich[aria-expanded="true"]{border-color:var(--blau,#007BFF);background:rgba(0,123,255,.08)}',
        '.vku-sp{display:block}',
        '.vku-detail{padding:12px 14px;background:var(--bg-soft,#F4F7FB);border-bottom:1px solid var(--line,#E2E8F0)}',
        '.vku-detail h3{font-size:16px;margin:0 0 6px}',
        '.vku-detail ul{margin:6px 0 10px 18px;padding:0}.vku-detail li{margin:3px 0}',
        '.vku-legende{font-size:13px;color:var(--sub,#5B6577);margin:8px 0}',
        '.vku-legende span{white-space:nowrap;margin-right:10px}',
        '.vku-knoepfe{display:flex;flex-wrap:wrap;gap:8px;margin-top:8px}',
        '@media(max-width:760px){.vku-zeile{padding:10px 4px}}'
      ].join('\n');
      document.head.appendChild(st);
    } catch (e) { /* egal */ }
  })();

  function rolle() { return EG.rolle; }
  function istBuero() { return BUERO.indexOf(rolle()) >= 0; }
  function chk(r) { if (r && r.error) throw r.error; return r; }
  function akteTitel(a) { return [a.hersteller, a.modell].filter(Boolean).join(' ') || 'Fahrzeug'; }
  function norm(s) { return String(s == null ? '' : s).trim().toUpperCase(); }

  /* ====================================================================
     Verkäufer-Kürzel des angemeldeten Benutzers (nur für die Rolle verkauf)
     Quelle: crm.verkaeufer_kuerzel (E-Mail → Kürzel, wie der Lead-Eingang), sonst shared.benutzer + shared.benutzer_kontakt.
     Nicht gefunden → null: dann zeigt der Reiter keine Akten (nie fremde).
     ==================================================================== */
  async function meinKuerzel() {
    if (S.kuerzel !== undefined) return S.kuerzel;
    var k = null;
    if (EG.demo) { k = 'NP'; }   // Demo-Konto „Verkäufer (Demo)“ = Kürzel NP
    else {
      var mail = String(EG.nutzer() || '').toLowerCase();
      try {
        var r = await EG.tab('crm', 'verkaeufer_kuerzel').select('email,kuerzel').eq('email', mail);
        if (!r.error && r.data && r.data[0] && r.data[0].kuerzel) k = r.data[0].kuerzel;
      } catch (e) { /* Schema nicht freigegeben: nächste Quelle */ }
      if (!k) {
        try {
          var b = await EG.tab('shared', 'benutzer').select('id,email').eq('email', mail);
          var id = !b.error && b.data && b.data[0] ? b.data[0].id : null;
          if (id) {
            var c = await EG.tab('shared', 'benutzer_kontakt').select('benutzer_id,kuerzel').eq('benutzer_id', id);
            if (!c.error && c.data && c.data[0] && c.data[0].kuerzel) k = c.data[0].kuerzel;
          }
        } catch (e2) { /* keine Angabe */ }
      }
    }
    S.kuerzel = k ? norm(k) : null;
    return S.kuerzel;
  }

  /* ====================================================================
     Reiter registrieren
     ==================================================================== */
  EG.onTab('uebersicht', function (root) {
    S.root = root;
    return lade().catch(EG.fehler);
  });

  async function lade() {
    if (S.laedt) return;
    S.laedt = true;
    try {
      S.root.innerHTML = '';
      S.root.appendChild(h('p', { class: 'muted', text: 'Lade Übersicht …' }));
      S.hinweis = ''; S.daten = []; S.werkstatt = [];
      if (rolle() === 'werkstatt') await ladeWerkstatt();
      else {
        if (!window.VK_BERECHNUNG) { S.hinweis = 'Der Reiter Verkauf (eingang-verkauf.js) ist nicht geladen – die Übersicht hat keine Datenquelle.'; zeichne(); return; }
        var filter = null;
        if (rolle() === 'verkauf') {
          var me = await meinKuerzel();
          if (!me) S.hinweis = 'Dein Verkäufer-Kürzel ist noch nicht hinterlegt. Deshalb zeigt die Übersicht keine Akten. Bitte OS oder Dispo bitten, es einzutragen.';
          filter = function (a) { return !!me && norm(a.verkaeufer) === me; };
        }
        S.daten = await window.VK_BERECHNUNG.ladeAlle({ filter: filter });
      }
    } finally { S.laedt = false; }
    zeichne();
  }

  /* ---------- Werkstatt: Ansicht verkauf.v_werkstatt_sicht ---------- */
  /** Demo: bildet die Ansicht aus den Demo-Tabellen nach (Regel wie verkauf.werkstatt_sicht(), nur für werkstatt/Büro). */
  async function demoWerkstattNeu() {
    if (!EG.demo) return;
    var ak = chk(await EG.tab('verkauf', 'akte').select('*')).data || [];
    var ac = chk(await EG.tab('verkauf', 'auslieferung_punkt').select('*')).data || [];
    var pu = chk(await EG.tab('verkauf', 'punkt').select('akte_id,phase,punkt_key,status')).data || [];
    var tr = chk(await EG.tab('bestand', 'v_transport_sicht').select('*')).data || [];
    var rows = ak.filter(function (a) { return a.phase_aktuell !== 'abgeschlossen' && a.phase_aktuell !== 'abgebrochen'; }).map(function (a) {
      var mine = ac.filter(function (p) { return p.interne_nr === a.interne_nr; });
      function st(k) { var x = mine.filter(function (p) { return p.punkt_key === k; })[0]; return x ? x.status : null; }
      function n(s) { return mine.filter(function (p) { return p.status === s; }).length; }
      var t = tr.filter(function (x) { return (a.fahrzeug_id && x.stieber_id === a.fahrzeug_id) || (a.interne_nr && x.interne_nr === a.interne_nr); })[0];
      var ae = pu.filter(function (p) { return p.akte_id === a.id && p.phase === 'v8' && p.punkt_key === 'arbeiten_erledigt'; })[0];
      return { akte_id: a.id, interne_nr: a.interne_nr, hersteller: a.hersteller, modell: a.modell, farbe: a.farbe, uebergabe_termin: a.uebergabe_termin,
        transportstatus: t ? t.transportstatus : null, ac_ok: n('ok'), ac_nok: n('nok'), ac_offen: n('offen'), arbeiten_erledigt: ae ? ae.status : null,
        end_aufbereiter: st('ac_end_aufbereiter'), end_meister: st('ac_end_meister'), end_verkaeufer: st('ac_end_verkaeufer') };
    });
    chk(await EG.tab('verkauf', 'v_werkstatt_sicht').upsert(rows, { onConflict: 'akte_id' }));
  }
  async function ladeWerkstatt() {
    await demoWerkstattNeu();
    var r = chk(await EG.tab('verkauf', 'v_werkstatt_sicht').select('*'));
    S.werkstatt = (r.data || []).map(werkstattZeile);
  }
  function werkstattZeile(w) {
    var fehlt = [], p07 = 'gruen';
    if (w.ac_nok > 0) { p07 = 'rot'; fehlt.push({ text: 'Checkliste: ' + w.ac_nok + ' Punkt' + (w.ac_nok === 1 ? '' : 'e') + ' mit NOK', wer: 'Werkstatt, Aufbereiter' }); }
    if (!w.ac_ok && !w.ac_nok && !w.ac_offen) { if (p07 !== 'rot') p07 = 'gelb'; fehlt.push({ text: 'Checkliste noch nicht begonnen', wer: 'Werkstatt, Aufbereiter' }); }
    else if (w.ac_offen > 0) { if (p07 !== 'rot') p07 = 'gelb'; fehlt.push({ text: 'Checkliste: noch ' + w.ac_offen + ' Punkt' + (w.ac_offen === 1 ? '' : 'e') + ' offen', wer: 'Werkstatt, Aufbereiter' }); }
    if (w.arbeiten_erledigt !== 'ok') { if (p07 !== 'rot') p07 = 'gelb'; fehlt.push({ text: 'Arbeiten erledigt', wer: 'Dispo' }); }
    [['end_aufbereiter', 'Endkontrolle Aufbereiter'], ['end_meister', 'Endkontrolle Meister'], ['end_verkaeufer', 'Endkontrolle Verkäufer']].forEach(function (e) {
      if (w[e[0]] !== 'ok') { if (p07 !== 'rot') p07 = 'gelb'; fehlt.push({ text: e[1], wer: e[0] === 'end_verkaeufer' ? 'Verkauf' : 'Werkstatt' }); }
    });
    var a2 = w.transportstatus === IM_HAUS ? 'gruen' : 'gelb', a2f = [];
    if (a2 !== 'gruen') a2f.push({ text: 'Fahrzeug im Haus angekommen (Stand: ' + (w.transportstatus || 'keine Angabe') + ')', wer: 'Dispo' });
    return { w: w, p07: { ampel: p07, fehlt: fehlt }, a2: { ampel: a2, fehlt: a2f } };
  }

  /* ====================================================================
     Zeichnen
     ==================================================================== */
  function passtSuche(txt) {
    var q = S.suche.trim().toLowerCase();
    return !q || txt.toLowerCase().indexOf(q) >= 0;
  }
  function spaltenFuerRolle() {
    var r = rolle();
    if (r === 'werkstatt') return ['p07', 'a2_anlieferung'];
    var l = PHASEN.map(function (p) { return p.key; });
    return r === 'verkauf' ? l.concat(['zahlung', 'a2_anlieferung']) : l.concat(BEREICHE);
  }
  function ampelVon(d, key) { var i = d.calc.nach[key]; return i ? i.ampel : 'grau'; }
  function hatRotGelb(d) {
    return spaltenFuerRolle().some(function (k) { return k !== 'zahlung' && (function (a) { return a === 'rot' || a === 'gelb'; })(ampelVon(d, k)); });
  }
  function sortTermin(a, b) {
    var x = a || '9999-12-31', y = b || '9999-12-31';
    return x < y ? -1 : x > y ? 1 : 0;
  }

  function zeichne() {
    S.root.innerHTML = '';
    var r = rolle();
    var suchFeld = h('input', { type: 'search', id: 'vku-suche', placeholder: 'Suchen: Nr., Kunde, Modell, FIN …', value: S.suche, 'aria-label': 'Suche' });
    suchFeld.addEventListener('input', function () { S.suche = suchFeld.value; chips(); fuelle(); });
    S.chipBox = h('div', { class: 'chips' });
    function chips() {
      S.chipBox.innerHTML = '';
      var basis = r === 'werkstatt' ? S.werkstatt.filter(function (z) { return passtSuche(wkText(z.w)); }) : S.daten.filter(function (d) { return passtSuche(datText(d)); });
      var rg = r === 'werkstatt' ? function (z) { return z.p07.ampel !== 'gruen' || z.a2.ampel !== 'gruen'; } : hatRotGelb;
      [['offen', 'Nur Rot/Gelb', rg], ['alle', 'Alle', null]].forEach(function (c) {
        var n = basis.filter(function (x) { return !c[2] || c[2](x); }).length;
        S.chipBox.appendChild(h('button', { type: 'button', class: 'chip', 'aria-pressed': S.filter === c[0] ? 'true' : 'false', text: c[1] + ' (' + n + ')',
          onclick: function () { S.filter = c[0]; chips(); fuelle(); } }));
      });
    }
    chips();
    S.root.appendChild(h('div', { class: 'leiste' },
      h('div', { class: 'leiste-zeile' }, suchFeld),
      h('div', { class: 'leiste-zeile' }, h('button', { type: 'button', class: 'btn btn-ghost', text: 'Übersicht aktualisieren', onclick: function () { lade().catch(EG.fehler); } })),
      S.chipBox));
    var intro = r === 'werkstatt' ? 'Deine Fahrzeuge in Aufbereitung und Werkstatt sowie der Stand des Transports. Antippen zeigt, was fehlt.'
      : r === 'verkauf' ? 'Deine Verkaufsakten. Antippen einer Ampel zeigt, was fehlt und bei wem. Die Zahlung siehst du nur als Stand.'
      : 'Alle laufenden Verkaufsakten. Antippen einer Ampel zeigt, was fehlt und bei wem.';
    S.root.appendChild(h('p', { class: 'muted klein', style: 'margin:6px 0', text: intro }));
    if (S.hinweis) S.root.appendChild(EG.banner(S.hinweis, 'warn'));
    if (r !== 'werkstatt') {
      S.root.appendChild(h('div', { class: 'vku-legende' }, PHASEN.map(function (p) { return h('span', { text: p.nr + ' ' + p.name }); }),
        r === 'verkauf' ? null : h('span', { text: 'Zahl. Kd = Zahlungen Kunde' }), r === 'verkauf' ? null : h('span', { text: 'Zahl. Lf = Zahlungen Lieferant' }), h('span', { text: 'Transp. = Transport Anlieferung' })));
    }
    S.listBox = h('div', { role: 'list' });
    var kopf;
    if (r === 'werkstatt') {
      kopf = h('div', { class: 'vku-zeile vku-wk vku-kopf' }, h('span', { text: 'Nr.' }), h('span', { text: 'Fahrzeug' }), h('span', { text: 'Übergabe' }), h('span', { text: 'Aufbereitung/Werkstatt' }), h('span', { text: 'Transport Anlieferung' }));
    } else {
      var spalten = [h('span', { text: 'Nr.' }), h('span', { text: 'Fahrzeug, Kunde' }), h('span', { text: 'Übergabe' }), h('span', { text: 'Verk.' })];
      PHASEN.forEach(function (p) { spalten.push(h('span', { text: String(p.nr), title: p.nr + ' ' + p.name })); });
      spalten.push(h('span', { 'aria-hidden': 'true' }));
      if (r === 'verkauf') { spalten.push(h('span', { text: 'Zahlung', title: 'Zahlungsstand' })); spalten.push(h('span', { text: BEREICH_KURZ.a2_anlieferung })); }
      else BEREICHE.forEach(function (b) { spalten.push(h('span', { text: BEREICH_KURZ[b], title: PH_BY[b].name })); });
      kopf = h('div', { class: 'vku-zeile vku-kopf' + (r === 'verkauf' ? ' vku-vk' : '') }, spalten);
    }
    S.root.appendChild(h('div', { class: 'vku-wrap' }, h('div', { class: 'vku-tab' }, kopf, S.listBox)));
    fuelle();
    bewertungenEinhaengen();
  }
  /** VA9: Abschnitt „Bewertungen zuordnen“ (verkauf-bewertungen.js) – nur admin, dispo, buchhaltung. Nach Bestätigen werden nur die Akten neu geladen. */
  function bewertungenEinhaengen() {
    if (!istBuero() || !window.VK_BEWERTUNGEN || !window.VK_BEWERTUNGEN.abschnitt) return;
    var box = h('div', { class: 'vkb-box' });
    S.root.appendChild(box);
    try {
      window.VK_BEWERTUNGEN.abschnitt(box, { onGeaendert: function () {
        if (!window.VK_BERECHNUNG) return null;
        return window.VK_BERECHNUNG.ladeAlle({ filter: null }).then(function (d) { S.daten = d; fuelle(); });
      } });
    } catch (e) { console.error('Bewertungen zuordnen:', e); }
  }
  function datText(d) { var a = d.akte; return [a.interne_nr, a.autrado_nr, a.fin, a.hersteller, a.modell, a.kunde_name, a.verkaeufer, a.farbe].join(' '); }
  function wkText(w) { return [w.interne_nr, w.hersteller, w.modell, w.farbe].join(' '); }

  function fuelle() {
    var box = S.listBox; box.innerHTML = '';
    var r = rolle();
    if (r === 'werkstatt') {
      var lw = S.werkstatt.filter(function (z) {
        return passtSuche(wkText(z.w)) && (S.filter === 'alle' || z.p07.ampel !== 'gruen' || z.a2.ampel !== 'gruen');
      });
      lw.sort(function (a, b) { return sortTermin(a.w.uebergabe_termin, b.w.uebergabe_termin); });
      if (!lw.length) { box.appendChild(h('div', { class: 'leer', text: S.werkstatt.length ? 'Keine Fahrzeuge in dieser Ansicht.' : 'Keine laufende Verkaufsakte.' })); return; }
      lw.forEach(function (z) { zeileWerkstatt(box, z); });
      return;
    }
    var l = S.daten.filter(function (d) { return passtSuche(datText(d)) && (S.filter === 'alle' || hatRotGelb(d)); });
    l.sort(function (a, b) { return sortTermin(a.akte.uebergabe_termin, b.akte.uebergabe_termin); });
    if (!l.length) { box.appendChild(h('div', { class: 'leer', text: S.daten.length ? 'Keine Akten in dieser Ansicht.' : (r === 'verkauf' ? 'Du hast keine laufende Verkaufsakte.' : 'Keine laufende Verkaufsakte.') })); return; }
    l.forEach(function (d) { zeileAkte(box, d); });
  }

  function dot(ampel) { return h('span', { class: 'vk-dot ' + ampel, 'aria-hidden': 'true' }); }

  /* ---------- Zeile einer Akte (admin, dispo, buchhaltung, verkauf) ---------- */
  function zeileAkte(box, d) {
    var a = d.akte, r = rolle(), ueb = a.uebergabe_termin ? EG.fmtDatum(a.uebergabe_termin) : '–';
    var ueber = a.uebergabe_termin && a.uebergabe_termin < EG.heute();
    var zeile = h('div', { class: 'vku-zeile' + (r === 'verkauf' ? ' vku-vk' : ''), role: 'listitem' });
    zeile.appendChild(h('span', { class: a.interne_nr ? '' : 'muted', text: a.interne_nr || '–' }));
    zeile.appendChild(h('button', { type: 'button', class: 'vku-akte', title: 'Akte öffnen', onclick: function () { akteOeffnen(a.id); } },
      h('strong', { text: akteTitel(a) }), h('span', { class: 'vku-sub', text: (a.kunde_name || 'Kunde fehlt') + (a.fin ? ' · FIN ' + a.fin : '') })));
    zeile.appendChild(h('span', { class: ueber ? 'fett' : '', text: ueb + (ueber ? ' (überschritten)' : '') }));
    zeile.appendChild(h('span', { class: a.verkaeufer ? '' : 'muted', text: a.verkaeufer || '–' }));
    PHASEN.forEach(function (p) { zeile.appendChild(dotKnopf(d, p.key, p.nr + ' ' + p.name)); });
    zeile.appendChild(h('span', { 'aria-hidden': 'true' }));
    if (r === 'verkauf') {
      var z = d.kx && d.kx.zahlung;
      zeile.appendChild(h('span', {}, z ? EG.pill(ZAHL_TEXT[z], ZAHL_PILL[z]) : EG.pill('keine Angabe', 'grau')));
      zeile.appendChild(dotKnopf(d, 'a2_anlieferung', PH_BY.a2_anlieferung.name, true));
    } else BEREICHE.forEach(function (b) { zeile.appendChild(dotKnopf(d, b, PH_BY[b].name, true)); });
    box.appendChild(zeile);
    if (S.offen && S.offen.id === a.id) box.appendChild(detailAkte(d, S.offen.key));
  }
  function dotKnopf(d, key, name, bereich) {
    var info = d.calc.nach[key], ampel = info ? info.ampel : 'grau';
    var offen = S.offen && S.offen.id === d.akte.id && S.offen.key === key;
    var b = h('button', {
      type: 'button', class: bereich ? 'vku-bereich' : 'vku-dot', 'aria-expanded': offen ? 'true' : 'false',
      'aria-label': akteTitel(d.akte) + ', ' + name + ': ' + AMPEL_TEXT[ampel], title: name + ': ' + AMPEL_TEXT[ampel],
      onclick: function () { S.offen = offen ? null : { id: d.akte.id, key: key }; fuelle(); }
    }, dot(ampel));
    return b;
  }
  function detailAkte(d, key) {
    var info = d.calc.nach[key], def = PH_BY[key], ampel = info ? info.ampel : 'grau';
    var box = h('div', { class: 'vku-detail', role: 'region', 'aria-label': 'Was fehlt: ' + def.name });
    box.appendChild(h('h3', {}, dot(ampel), ' ', (def.typ === 'phase' ? def.nr + ' ' : '') + def.name + ' – ' + AMPEL_TEXT[ampel]));
    if (info && info.phaseEntfaellt) box.appendChild(h('p', { class: 'muted', text: 'Entfällt' + (info.phaseGrund ? ': ' + info.phaseGrund : '') + '.' }));
    else if (info) {
      if (info.rotGrund) box.appendChild(h('p', { class: 'fett', text: info.rotGrund }));
      var fehlt = (info.res.fehlt || []);
      if (!fehlt.length) box.appendChild(h('p', { text: 'Alle Pflichtpunkte sind erledigt.' }));
      else {
        box.appendChild(h('p', { class: 'muted klein', text: 'Das fehlt noch (Punkt, bei wem):' }));
        box.appendChild(h('ul', {}, fehlt.map(function (f) {
          return h('li', {}, h('strong', { text: f.text }), ' – bei: ' + f.wer, f.status === 'nok' ? h('span', { class: 'fett', text: ' (NOK' + (f.grund ? ': ' + f.grund : '') + ')' }) : null);
        })));
      }
      (info.sperren || []).forEach(function (sp) { box.appendChild(EG.banner(sp.text, 'warn')); });
      (info.warnungen || []).forEach(function (w) { box.appendChild(h('p', { class: 'klein muted', text: w.text })); });
    }
    var knoepfe = h('div', { class: 'vku-knoepfe' });
    var a1 = key === 'a1_kunde' || key === 'a1_lieferant';
    if (a1 && istBuero() && window.VK_ZAHLUNGEN) knoepfe.appendChild(h('button', { type: 'button', class: 'btn btn-primary', text: 'Zahlungen öffnen', onclick: function () { window.VK_ZAHLUNGEN.oeffne(d.akte.id); } }));
    else if (key === 'a2_anlieferung') knoepfe.appendChild(h('button', { type: 'button', class: 'btn btn-ghost', text: 'Reiter Transport öffnen', onclick: function () { EG.zeigeTab('transport'); } }));
    knoepfe.appendChild(h('button', { type: 'button', class: a1 && istBuero() ? 'btn btn-ghost' : 'btn btn-primary', text: 'Akte öffnen', onclick: function () { akteOeffnen(d.akte.id); } }));
    box.appendChild(knoepfe);
    return box;
  }
  function akteOeffnen(id) {
    if (window.VK_AKTE_OEFFNEN) window.VK_AKTE_OEFFNEN(id);
    else EG.toast('Der Reiter Verkauf ist nicht geladen.', 'fehler');
  }

  /* ---------- Zeile Werkstatt ---------- */
  function zeileWerkstatt(box, z) {
    var w = z.w, ueb = w.uebergabe_termin ? EG.fmtDatum(w.uebergabe_termin) : '–';
    var zeile = h('div', { class: 'vku-zeile vku-wk', role: 'listitem' });
    zeile.appendChild(h('span', { class: w.interne_nr ? '' : 'muted', text: w.interne_nr || '–' }));
    zeile.appendChild(h('span', {}, h('strong', { text: [w.hersteller, w.modell].filter(Boolean).join(' ') || 'Fahrzeug' }), h('span', { class: 'vku-sub', text: w.farbe || '' })));
    zeile.appendChild(h('span', { text: ueb }));
    [['p07', 'Aufbereitung und Werkstatt', z.p07], ['a2_anlieferung', 'Transport Anlieferung', z.a2]].forEach(function (e) {
      var offen = S.offen && S.offen.id === w.akte_id && S.offen.key === e[0];
      zeile.appendChild(h('button', {
        type: 'button', class: 'vku-bereich', style: 'justify-content:flex-start;min-width:140px', 'aria-expanded': offen ? 'true' : 'false',
        'aria-label': (w.interne_nr || '') + ' ' + e[1] + ': ' + AMPEL_TEXT[e[2].ampel], title: e[1] + ': ' + AMPEL_TEXT[e[2].ampel],
        onclick: function () { S.offen = offen ? null : { id: w.akte_id, key: e[0] }; fuelle(); }
      }, dot(e[2].ampel), h('span', { text: AMPEL_TEXT[e[2].ampel] })));
    });
    box.appendChild(zeile);
    if (S.offen && S.offen.id === w.akte_id) {
      var e = S.offen.key === 'p07' ? z.p07 : z.a2, name = S.offen.key === 'p07' ? 'Aufbereitung und Werkstatt' : 'Transport Anlieferung';
      var det = h('div', { class: 'vku-detail', role: 'region', 'aria-label': 'Was fehlt: ' + name });
      det.appendChild(h('h3', {}, dot(e.ampel), ' ', name + ' – ' + AMPEL_TEXT[e.ampel]));
      if (!e.fehlt.length) det.appendChild(h('p', { text: 'Alles erledigt.' }));
      else det.appendChild(h('ul', {}, e.fehlt.map(function (f) { return h('li', {}, h('strong', { text: f.text }), ' – bei: ' + f.wer); })));
      if (S.offen.key === 'a2_anlieferung') det.appendChild(h('div', { class: 'vku-knoepfe' }, h('button', { type: 'button', class: 'btn btn-ghost', text: 'Reiter Transport öffnen', onclick: function () { EG.zeigeTab('transport'); } })));
      box.appendChild(det);
    }
  }
})();
