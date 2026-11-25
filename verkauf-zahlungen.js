/* Stieber-App – Reiter „Zahlungen“ (Bereich A1: Zahlungen Kunde und Lieferant), Version 4.2, Stand 25.11.2026 (P4b: Felder bearbeiten, P4c: Zahlungsaufstellung drucken;
   v4.2 Oli „A umsetzen“: Punkt 65 „Zahlungsaufstellung für die Buchhaltung“ gilt auch als erledigt, wenn ein PDF der Art zahlungsaufstellung in den Unterlagen der Akte liegt – VK_DU.dokumenteFuerAkten → pm.dok, Anzeige mit Sprung zu #du-box)
   Paket VA4 des Bauplans Verkaufsablauf. Plan: „Anpassungen Verkaufsablauf“ v2 (A1, Zeilen 55–70), Bauplan v1 (E1, E6).
   Sichtbar und bedienbar nur für admin, dispo, buchhaltung (zusätzlich zur Rollenliste in eingang.html und zur Sperre in der Datenbank).

   Was der Reiter kann
   - Liste der laufenden Verkaufsakten mit je einer Ampel „Kunde“ (a1_kunde) und „Lieferant“ (a1_lieferant) aus VK_AMPEL, dem Zahlungsstand
     (bezahlt / teilweise / offen), Filter „Offen“ / „Alle“ und Suche (Nr., Kunde, Modell, FIN).
   - Detail je Akte: alle Punkte der Bereiche a1_kunde und a1_lieferant aus VK_PHASEN abhaken bzw. Eingaben speichern
     (E1: gespeichert wird in verkauf.punkt unter „schreibeIn“, also unter den heutigen Schlüsseln v7.* bzw. a1_lieferant.rechnung_geprueft).
     Gleiche Logik wie früher in Phase v7: Eingaben (Betrag, Text, Auswahl), Foto beim Bar-Beleg, „entfällt“ nur mit Grund,
     „Voll bezahlt“ erst, wenn alle anderen Pflichtpunkte des Bereichs Kunde erledigt sind.
   - Punkte ohne beschreibbare Quelle (nurLesen: Masterliste, bestand.zahlung, bestand.einkauf) werden nur angezeigt („kommt aus der Masterliste“, Schritt 1a).
     Die Felder aus bestand.zahlung und bestand.einkauf stehen zusätzlich in einer Lesekarte.
   - Knöpfe „Zahlungseinladung erstellen“ (VK_ZE) und „Zahlungsbestätigung erstellen“ (VK_ZB) hängen an den Punkten zahlungseinladung,
     anzahlung_da und restzahlung. Die beiden Module bleiben unverändert; sie bekommen Akte und Punkt-Map im selben Format wie früher.
   - Netting-Regel (Oli 14.11.2026): erledigt, wenn bestand.einkauf.ek_finanzierung_abloese_datum gesetzt ist; ohne EK-Finanzierung entfällt der Punkt.

   Schnittstelle für andere Reiter:  window.VK_ZAHLUNGEN.oeffne(akte_id)  → springt in den Reiter und öffnet die Akte.
   Link-Form: #zahlungen&id=<akte_id>

   v4.1 (25.11.2026, P4b): Die Lesekarte „Daten aus der Masterliste“ ist für admin/dispo/buchhaltung bearbeitbar (Knöpfe „Kunde bearbeiten“ und
   „Lieferant bearbeiten“). Gespeichert wird über window.EG_FZ.felderBearbeiten (eingang-fahrzeuge.js) = derselbe Weg wie im Reiter Fahrzeuge:
   Edge Function bestand_schreiben (erst Masterliste, dann Import nach Supabase), Rechte je Feld aus bestand.feld_katalog (aendern), Konfliktschutz
   per eTag, Protokoll in bestand.aenderung_log. Hier gibt es KEINE zweite Schreiblogik. Nach dem Speichern wird die Akte neu geladen.
   Demo (?demo=1): nichts geht an die Masterliste; die Werte werden nur im Speicher der Seite übernommen.
   v4.1 (P4c): Knopf „Zahlungsaufstellung drucken“ im Kopf der Akte → verkauf-zahlungsaufstellung.js (A4-Druckansicht).

   Nicht Aufgabe dieses Reiters: akte.phase_aktuell nachführen (macht der Reiter Verkauf).
   Demo (?demo=1): legt – nur wenn sie fehlen – die Demo-Akten mit fahrzeug_id ST-26-9001, ST-26-9002, ST-26-9003 samt bestand.zahlung,
   bestand.einkauf und einigen A1-Häkchen an. Vorhandene Zeilen werden nie überschrieben.
   Baut auf window.EG (eingang-core.js), window.VK_PHASEN (verkauf-phasen.js) und window.VK_AMPEL (verkauf-ampel.js) auf. */
(function () {
  'use strict';
  var EG = window.EG, h = EG && EG.h, PH = window.VK_PHASEN, AMP = window.VK_AMPEL;
  if (!EG) return;
  if (!PH || !AMP) { console.error('verkauf-phasen.js bzw. verkauf-ampel.js fehlt – Reiter Zahlungen nicht aktiv.'); return; }

  var ROLLEN = ['admin', 'dispo', 'buchhaltung'];
  var BEREICHE = ['a1_kunde', 'a1_lieferant'];
  var PH_BY = {}; PH.forEach(function (p) { PH_BY[p.key] = p; });
  if (!PH_BY.a1_kunde || !PH_BY.a1_lieferant) { console.error('Bereiche a1_kunde/a1_lieferant fehlen in VK_PHASEN – Reiter Zahlungen nicht aktiv.'); return; }
  var AMPEL_TEXT = { gruen: 'Fertig', gelb: 'In Arbeit', rot: 'Achtung', grau: 'Entfällt' };
  var AMPEL_PILL = { gruen: 'gruen', gelb: 'gold', rot: 'rot', grau: 'grau' };
  var STATUS_LABEL = { ok: 'OK', nok: 'NOK', entfaellt: 'entfällt' };
  var STAND_TEXT = { bezahlt: 'Bezahlt', teilweise: 'Teilweise bezahlt', offen: 'Offen' };
  var STAND_PILL = { bezahlt: 'gruen', teilweise: 'gold', offen: 'grau' };

  /* ---------- eigene Stile (Präfix vkz-), einmalig ---------- */
  (function stil() {
    try {
      if (document.getElementById('vkz-stil')) return;
      var st = document.createElement('style'); st.id = 'vkz-stil';
      st.textContent = [
        '.ac-zeile.vkz-zeile{grid-template-columns:64px minmax(150px,1.5fr) minmax(110px,1fr) 96px 150px 150px 150px}',
        '.vkz-zeile > span{white-space:normal}',
        '.vkz-ampel{display:inline-flex;align-items:center;gap:6px;font-size:14px}',
        '.vkz-ampel .vk-dot{width:14px;height:14px}',
        '.vkz-mobil{display:none}',
        '.vkz-sub{display:block;font-size:13px;color:var(--sub)}',
        '.vkz-kopfpills{display:flex;flex-wrap:wrap;gap:8px;margin:8px 0 2px}',
        '.vkz-spalten{display:grid;grid-template-columns:1fr;gap:12px}',
        '.vkz-lese h3{font-size:16px;margin:0 0 6px;color:var(--blau-dark)}',
        '.vkz-lese dl.kv{margin:0}',
        '.vkz-herkunft{font-size:14px;color:var(--sub);margin:4px 0 0}',
        '.vkz-wert{font-weight:700}',
        '@media(min-width:900px){.vkz-spalten{grid-template-columns:1fr 1fr}}',
        '@media(max-width:760px){',
        '.ac-zeile.vkz-zeile{grid-template-columns:minmax(0,1fr) auto;align-items:start}',
        '.vkz-c-nr,.vkz-c-kunde,.vkz-c-ueb,.vkz-c-kd,.vkz-c-lf{display:none !important}',
        '.vkz-mobil{display:block;font-size:13px;line-height:1.3}',
        '.vkz-mobil.fett{font-size:14px;color:var(--ink)}',
        '}'
      ].join(' ');
      document.head.appendChild(st);
    } catch (e) { /* Stil nicht kritisch */ }
  })();

  /* ====================================================================
     Zustand und Zugriff
     ==================================================================== */
  var S = {
    root: null, id: null, akte: null, pm: {}, zahlung: null, einkauf: null, calc: null, offen: {}, geoeffnetFuer: null,
    akten: [], pmAlle: {}, zahlstandAlle: {}, zahlstand: null, zahlungAlle: {}, einkaufAlle: {}, listCalc: {}, filter: 'offen', suche: '', listenBox: null, chipBox: null,
    kopfBox: null, bestandKarteBox: null, fehltBox: null, bereicheBox: null, bestandHinweis: '', demoFertig: false, verkaufAngestossen: false
  };
  (function hashLesen() {
    var m = /^#zahlungen&id=([0-9a-f-]{36})/i.exec(location.hash || '');
    if (m) S.id = m[1];
  })();
  var T = {
    akte: function () { return EG.tab('verkauf', 'akte'); },
    punkt: function () { return EG.tab('verkauf', 'punkt'); },
    zahlung: function () { return EG.tab('bestand', 'zahlung'); },
    einkauf: function () { return EG.tab('bestand', 'einkauf'); }
  };
  function chk(r) { if (r && r.error) throw r.error; return r; }
  function jetzt() { return new Date().toISOString(); }
  function darf() { return ROLLEN.indexOf(EG.rolle) >= 0; }
  function istLaufend(a) { return a.phase_aktuell !== 'abgeschlossen' && a.phase_aktuell !== 'abgebrochen'; }
  function akteTitel(a) { return [a.hersteller, a.modell].filter(Boolean).join(' ') || 'Fahrzeug'; }
  var queue = Promise.resolve();
  /** Speichervorgänge laufen nacheinander (schnelles Tippen darf nichts überholen). */
  function seriell(fn) { var p = queue.then(fn); queue = p.catch(function () { /* Fehler meldet der Aufrufer */ }); return p; }

  function fmtBetrag(n) { return Number(n).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €'; }
  /** '1.234,50' | '12,5' | '300' → Zahl · leer → null · ungültig → NaN (ohne Backslash-Muster) */
  function parseBetrag(s) {
    s = String(s == null ? '' : s).split('€').join('').split(' ').join('').split(String.fromCharCode(160)).join('');
    if (!s) return null;
    if (s.indexOf(',') >= 0) s = s.split('.').join('').replace(',', '.');
    else if (/^[0-9]{1,3}([.][0-9]{3})+$/.test(s)) s = s.split('.').join('');
    var n = parseFloat(s);
    return isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : NaN;
  }
  function betragFeld(n) { return Number(n).toFixed(2).replace('.', ','); }
  function istAcZeile(r) { return r.phase === 'v8' && /^ac_/.test(r.punkt_key); }
  function zuMap(rows) {
    var m = {};
    (rows || []).forEach(function (r) { if (istAcZeile(r)) return; (m[r.phase] = m[r.phase] || {})[r.punkt_key] = r; });
    return m;
  }
  /** PDFs in den Unterlagen (verkauf.dokument) für viele Akten → { akte_id: { art: Zeile } }; ohne Modul/Leserecht {} (Quelle zählt nicht). */
  async function dokumenteLaden(akten) {
    if (!window.VK_DU || typeof window.VK_DU.dokumenteFuerAkten !== 'function') return {};
    try { return await window.VK_DU.dokumenteFuerAkten((akten || []).map(function (a) { return a.id; })); } catch (e) { console.warn('Unterlagen als Quelle:', e && e.message); return {}; }
  }
  function dokInPm(pm, dokMap) {
    if (window.VK_DU && typeof window.VK_DU.dokumenteInPm === 'function') window.VK_DU.dokumenteInPm(pm, dokMap || {}); else pm.dok = {};
  }
  function zeilenAus(pm) {
    var z = [];
    Object.keys(pm).forEach(function (ph) {
      Object.keys(pm[ph]).forEach(function (k) { var r = pm[ph][k]; z.push({ phase: ph, punkt_key: k, status: r.status || 'offen', wert: r.wert, grund: r.grund }); });
    });
    return z;
  }
  function defVon(key, k) {
    var l = PH_BY[key].punkte;
    for (var i = 0; i < l.length; i++) if (l[i].k === k) return l[i];
    return null;
  }

  /* ====================================================================
     Berechnung (Ampel aus VK_AMPEL, Zahlungsstand)
     ==================================================================== */
  function betragOk(pm, ph, k) {
    var r = pm[ph] && pm[ph][k];
    return r && r.status === 'ok' && r.wert && Number(r.wert.betrag) > 0 ? Number(r.wert.betrag) : 0;
  }
  /** Rückfall: eigene Ableitung (gleiche Regel wie die Ansicht verkauf.v_zahlstand). Gilt nur, wenn die Ansicht für die Akte nichts liefert. */
  function zahlungsstandRueckfall(pm, z) {
    var vb = pm.v7 && pm.v7.voll_bezahlt && pm.v7.voll_bezahlt.status === 'ok';
    if (vb || (z && z.kd_geldeingang === 'komplett erhalten')) return 'bezahlt';
    if ((z && z.kd_geldeingang === 'Teilzahlung') || betragOk(pm, 'v7', 'anzahlung_da') || betragOk(pm, 'v7', 'restzahlung')) return 'teilweise';
    return 'offen';
  }
  function kontextFuer(pm, z, e, stand) {
    var daten = {};
    [['bestand.zahlung.', z], ['bestand.einkauf.', e]].forEach(function (t) {
      if (t[1]) Object.keys(t[1]).forEach(function (k) { daten[t[0] + k] = t[1][k]; });
    });
    return { zahlung: stand, transportstatus: e ? e.transportstatus : undefined, daten: daten };
  }
  /** → { res (VK_AMPEL-Ergebnis), kunde, lief, stand } */
  function berechne(pm, z, e, standAnsicht) {
    var stand = standAnsicht || zahlungsstandRueckfall(pm, z);   // Quelle: verkauf.v_zahlstand (Reiter Verkauf und Übersicht lesen dieselbe)
    var res = AMP.berechne(PH, zeilenAus(pm), kontextFuer(pm, z, e, stand));
    return { res: res, kunde: res.nachKey.a1_kunde, lief: res.nachKey.a1_lieferant, stand: stand };
  }
  function a1Offen(c) { return [c.kunde, c.lief].some(function (r) { return r.ampel === 'gelb' || r.ampel === 'rot'; }); }
  function neuBerechnen() { S.calc = berechne(S.pm, S.zahlung, S.einkauf, S.zahlstand); }

  /* ====================================================================
     Reiter registrieren
     ==================================================================== */
  EG.onTab('zahlungen', async function (root) {
    S.root = root;
    if (!darf()) {
      root.innerHTML = '';
      root.appendChild(EG.banner('Der Bereich „Zahlungen“ ist nur für OS, Dispo und Buchhaltung.', 'warn'));
      return;
    }
    if (EG.demo && !S.verkaufAngestossen) {
      // Demo: Der Reiter Verkauf legt seine Demo-Daten nur an, solange die Tabelle leer ist. Damit er nicht von meinen Akten
      // verdrängt wird, lasse ich ihn einmal zuerst laufen, wenn noch keine Akte da ist.
      S.verkaufAngestossen = true;
      var vorhanden = chk(await T.akte().select('*').limit(1)).data || [];
      if (!vorhanden.length) { EG.zeigeTab('verkauf'); EG.zeigeTab('zahlungen'); return; }
    }
    return S.id ? ladeDetail() : ladeListe();
  });
  window.VK_ZAHLUNGEN = {
    oeffne: function (akteId) {
      if (!darf()) { EG.toast('Der Reiter Zahlungen ist nur für OS, Dispo und Buchhaltung.', 'fehler'); return; }
      S.id = akteId; S.geoeffnetFuer = null; EG.zeigeTab('zahlungen');
    }
  };

  /* ====================================================================
     LISTE
     ==================================================================== */
  async function ladeBestandListe(akten) {
    S.zahlungAlle = {}; S.einkaufAlle = {}; S.bestandHinweis = '';
    var fids = [];
    akten.forEach(function (a) { if (a.fahrzeug_id && fids.indexOf(a.fahrzeug_id) < 0) fids.push(a.fahrzeug_id); });
    try {
      for (var i = 0; i < fids.length; i += 40) {
        var teil = fids.slice(i, i + 40);
        var z = chk(await T.zahlung().select('*').in('fahrzeug_id', teil));
        var e = chk(await T.einkauf().select('*').in('fahrzeug_id', teil));
        (z.data || []).forEach(function (r) { S.zahlungAlle[r.fahrzeug_id] = r; });
        (e.data || []).forEach(function (r) { S.einkaufAlle[r.fahrzeug_id] = r; });
      }
    } catch (err) {
      S.bestandHinweis = 'Zahlungs- und Einkaufsdaten konnten nicht gelesen werden: ' + (err && err.message ? err.message : err);
    }
  }
  async function ladeListe() {
    S.id = null; S.akte = null;
    S.root.innerHTML = '';
    S.root.appendChild(h('p', { class: 'muted', text: 'Lade Zahlungen …' }));
    await demoSeed();
    var r = chk(await T.akte().select('*').order('created_at', { ascending: false }));
    S.akten = (r.data || []).filter(istLaufend);
    var ids = S.akten.map(function (a) { return a.id; }), teile = [];
    for (var i = 0; i < ids.length; i += 5) teile.push(ids.slice(i, i + 5));   // die Data API liefert höchstens 1000 Zeilen je Abfrage
    var res = await Promise.all(teile.map(function (t) { return T.punkt().select('*').in('akte_id', t); }));
    S.pmAlle = {}; S.listCalc = {};
    res.forEach(function (x) {
      chk(x);
      (x.data || []).forEach(function (row) {
        if (istAcZeile(row)) return;
        var m = (S.pmAlle[row.akte_id] = S.pmAlle[row.akte_id] || {}); (m[row.phase] = m[row.phase] || {})[row.punkt_key] = row;
      });
    });
    await ladeBestandListe(S.akten);
    var dokAlle = await dokumenteLaden(S.akten);
    S.zahlstandAlle = window.VK_ZAHLSTAND ? await window.VK_ZAHLSTAND.lade(S.akten.map(function (a) { return a.id; })) : {};
    S.akten.forEach(function (a) {
      var pm = S.pmAlle[a.id] = S.pmAlle[a.id] || {};
      dokInPm(pm, dokAlle[a.id]);
      S.listCalc[a.id] = berechne(pm, S.zahlungAlle[a.fahrzeug_id] || null, S.einkaufAlle[a.fahrzeug_id] || null, S.zahlstandAlle[a.id]);
    });
    zeichneListe();
  }
  function passtSuche(a) {
    var q = (S.suche || '').trim().toLowerCase();
    if (!q) return true;
    return [a.interne_nr, a.autrado_nr, a.fin, a.hersteller, a.modell, a.kunde_name, a.verkaeufer, a.fahrzeug_id].join(' ').toLowerCase().indexOf(q) >= 0;
  }
  function zeichneListe() {
    S.root.innerHTML = '';
    var suchFeld = h('input', { type: 'search', id: 'vkz-suche', placeholder: 'Suchen: Nr., Kunde, Modell, FIN …', value: S.suche, 'aria-label': 'Suche' });
    suchFeld.addEventListener('input', function () { S.suche = suchFeld.value; chips(); fuelleListe(); });
    S.chipBox = h('div', { class: 'chips' });
    function chips() {
      S.chipBox.innerHTML = '';
      var basis = S.akten.filter(passtSuche);
      [['offen', 'Offen', function (a) { return a1Offen(S.listCalc[a.id]); }], ['alle', 'Alle', null]].forEach(function (c) {
        var n = basis.filter(function (a) { return !c[2] || c[2](a); }).length;
        S.chipBox.appendChild(h('button', {
          type: 'button', class: 'chip', 'aria-pressed': S.filter === c[0] ? 'true' : 'false', text: c[1] + ' (' + n + ')',
          onclick: function () { S.filter = c[0]; chips(); fuelleListe(); }
        }));
      });
    }
    chips();
    var zeile2 = h('div', { class: 'leiste-zeile' },
      h('button', { type: 'button', class: 'btn btn-ghost', text: 'Liste aktualisieren', onclick: function () { ladeListe().catch(EG.fehler); } }));
    S.root.appendChild(h('div', { class: 'leiste' }, h('div', { class: 'leiste-zeile' }, suchFeld), zeile2, S.chipBox));
    if (S.bestandHinweis) S.root.appendChild(EG.banner(S.bestandHinweis, 'warn'));
    S.listenBox = h('div', { role: 'list' });
    var kopf = h('div', { class: 'ac-zeile ac-kopfzeile vkz-zeile' },
      h('span', { class: 'vkz-c-nr', text: 'Nr.' }), h('span', { text: 'Fahrzeug' }), h('span', { class: 'vkz-c-kunde', text: 'Kunde' }),
      h('span', { class: 'vkz-c-ueb', text: 'Übergabe' }), h('span', { text: 'Zahlungsstand' }), h('span', { class: 'vkz-c-kd', text: 'Ampel Kunde' }), h('span', { class: 'vkz-c-lf', text: 'Ampel Lieferant' }));
    S.root.appendChild(h('div', { class: 'ac-tabelle' }, kopf, S.listenBox));
    fuelleListe();
  }
  function fuelleListe() {
    var box = S.listenBox; box.innerHTML = '';
    var l = S.akten.filter(function (a) {
      if (!passtSuche(a)) return false;
      return S.filter === 'alle' || a1Offen(S.listCalc[a.id]);
    });
    l.sort(function (a, b) {
      var x = a.uebergabe_termin || '9999-12-31', y = b.uebergabe_termin || '9999-12-31';
      return x < y ? -1 : x > y ? 1 : 0;
    });
    if (!l.length) { box.appendChild(h('div', { class: 'leer', text: S.akten.length ? 'Keine Akten in dieser Ansicht.' : 'Keine laufende Verkaufsakte.' })); return; }
    l.forEach(function (a) { box.appendChild(akteZeile(a)); });
  }
  function ampelZelle(r, name, klasse) {
    return h('span', { class: klasse }, h('span', { class: 'vkz-ampel' },
      h('span', { class: 'vk-dot ' + r.ampel, 'aria-hidden': 'true' }), h('span', { text: name + ': ' + AMPEL_TEXT[r.ampel] })));
  }
  function akteZeile(a) {
    var c = S.listCalc[a.id], ueb = a.uebergabe_termin ? EG.fmtDatum(a.uebergabe_termin) : '';
    var ueber = a.uebergabe_termin && a.uebergabe_termin < EG.heute();
    return h('button', {
      type: 'button', role: 'listitem', class: 'ac-zeile vz-zeile vkz-zeile' + (c.kunde.ampel === 'rot' || c.lief.ampel === 'rot' ? ' rot' : ''),
      'aria-label': akteTitel(a) + ', ' + (a.kunde_name || 'Kunde fehlt') + ', Zahlung ' + STAND_TEXT[c.stand] + ', Kunde ' + AMPEL_TEXT[c.kunde.ampel] + ', Lieferant ' + AMPEL_TEXT[c.lief.ampel],
      onclick: function () { oeffne(a.id).catch(EG.fehler); }
    },
      h('span', { class: 'vkz-c-nr' + (a.interne_nr ? '' : ' muted'), text: a.interne_nr || '–' }),
      h('span', {}, h('strong', { text: akteTitel(a) }),
        h('span', { class: 'vkz-sub', text: a.fin ? 'FIN ' + a.fin : (a.fahrzeug_id || '') }),
        h('span', { class: 'vkz-mobil fett', text: a.kunde_name || 'Kunde fehlt' }),
        h('span', { class: 'vkz-mobil muted', text: [a.interne_nr ? 'Nr. ' + a.interne_nr : '', ueb ? 'Übergabe ' + ueb : ''].filter(Boolean).join(' · ') }),
        h('span', { class: 'vkz-mobil' }, ampelZelle(c.kunde, 'Kunde', ''), ' ', ampelZelle(c.lief, 'Lieferant', ''))),
      h('span', { class: 'vkz-c-kunde' + (a.kunde_name ? ' fett' : ' muted'), text: a.kunde_name || 'Kunde fehlt' }),
      h('span', { class: 'vkz-c-ueb' + (ueber ? ' rot-text fett' : ''), text: ueb ? ueb + (ueber ? ' (überschritten)' : '') : '–' }),
      h('span', {}, EG.pill(STAND_TEXT[c.stand], STAND_PILL[c.stand])),
      ampelZelle(c.kunde, 'Kunde', 'vkz-c-kd'),
      ampelZelle(c.lief, 'Lieferant', 'vkz-c-lf'));
  }

  /* ====================================================================
     DETAIL
     ==================================================================== */
  async function oeffne(id) { S.id = id; S.geoeffnetFuer = null; await ladeDetail(); window.scrollTo(0, 0); }
  async function ladeDetail() {
    await demoSeed();
    var x = await Promise.all([
      T.akte().select('*').eq('id', S.id).single(),
      T.punkt().select('*').eq('akte_id', S.id)
    ]);
    if (x[0].error || !x[0].data) { EG.toast('Akte nicht gefunden.', 'fehler'); S.id = null; return ladeListe(); }
    chk(x[1]);
    S.akte = x[0].data; S.pm = zuMap(x[1].data);
    dokInPm(S.pm, (await dokumenteLaden([S.akte]))[S.akte.id]);
    S.zahlung = null; S.einkauf = null; S.bestandHinweis = '';
    if (S.akte.fahrzeug_id) {
      try {
        var b = await Promise.all([
          T.zahlung().select('*').eq('fahrzeug_id', S.akte.fahrzeug_id).maybeSingle(),
          T.einkauf().select('*').eq('fahrzeug_id', S.akte.fahrzeug_id).maybeSingle()
        ]);
        chk(b[0]); chk(b[1]);
        S.zahlung = b[0].data || null; S.einkauf = b[1].data || null;
      } catch (err) { S.bestandHinweis = 'Zahlungs- und Einkaufsdaten konnten nicht gelesen werden: ' + (err && err.message ? err.message : err); }
    } else S.bestandHinweis = 'Die Akte hat keine Fahrzeug-ID (fahrzeug_id). Zahlungs- und Einkaufsdaten aus der Masterliste fehlen deshalb.';
    await holeStand();
    neuBerechnen();
    if (S.geoeffnetFuer !== S.id) { S.geoeffnetFuer = S.id; S.offen = {}; }
    zeichneDetail();
  }
  /** Zahlungsstand der offenen Akte aus der Ansicht verkauf.v_zahlstand (null → Rückfall in berechne). */
  async function holeStand() {
    S.zahlstand = null;
    if (!window.VK_ZAHLSTAND || !S.akte) return;
    var m = await window.VK_ZAHLSTAND.lade([S.akte.id]);
    S.zahlstand = m[S.akte.id] || null;
  }
  function zurListe() { S.id = null; ladeListe().catch(EG.fehler); window.scrollTo(0, 0); }
  function zeichneDetail() {
    var y = window.scrollY, root = S.root;
    root.innerHTML = '';
    root.appendChild(h('button', { type: 'button', class: 'btn btn-ghost zurueck', text: '← Zur Liste', onclick: zurListe }));
    S.kopfBox = h('div', {}); S.fehltBox = h('div', {}); S.bereicheBox = h('div', { class: 'vk-phasen' });
    root.appendChild(S.kopfBox);
    root.appendChild(S.fehltBox);
    root.appendChild(h('h2', { text: 'Zahlungen abhaken', style: 'margin:18px 0 8px' }));
    root.appendChild(S.bereicheBox);
    root.appendChild(bestandKarte());
    zeichneKopf(); zeichneBereiche();
    window.scrollTo(0, y);
  }
  function zeichneKopf() {
    S.kopfBox.innerHTML = ''; S.fehltBox.innerHTML = '';
    S.kopfBox.appendChild(kopfKarte());
    S.fehltBox.appendChild(fehltKarte());
  }
  function zeichneBereiche() {
    var y = window.scrollY;
    S.bereicheBox.innerHTML = '';
    BEREICHE.forEach(function (k) { S.bereicheBox.appendChild(bereichKarte(k)); });
    window.scrollTo(0, y);
  }
  /** Nach jeder Änderung: neu rechnen, Kopf und „Was fehlt noch“ neu (voll = false: Bereiche bleiben stehen, damit Tastatur und Fokus bleiben). */
  function aktualisiere(voll) {
    neuBerechnen();
    if (!S.kopfBox) return;
    zeichneKopf();
    if (voll) zeichneBereiche();
    // Stand neu aus der Ansicht holen (die Datenbank hat ihn nach dem Speichern neu gerechnet) und Kopf nachziehen
    var id = S.id;
    holeStand().then(function () { if (S.id !== id || !S.kopfBox) return; neuBerechnen(); zeichneKopf(); }).catch(function () { /* Rückfall bleibt */ });
  }

  function kopfKarte() {
    var a = S.akte, c = S.calc;
    var dl = h('dl', { class: 'kv' });
    function z(label, inhalt) { dl.appendChild(h('dt', { text: label })); dl.appendChild(h('dd', {}, inhalt == null || inhalt === '' ? '–' : inhalt)); }
    z('Kunde', a.kunde_name);
    z('Telefon', a.kunde_telefon ? h('a', { href: 'tel:' + String(a.kunde_telefon).split(' ').join(''), text: a.kunde_telefon }) : '');
    z('E-Mail', a.kunde_email ? h('a', { href: 'mailto:' + a.kunde_email, text: a.kunde_email, class: 'umbruch' }) : '');
    z('Interne Nr. / Autrado-Nr.', (a.interne_nr || '–') + ' / ' + (a.autrado_nr || '–'));
    z('Fahrzeug-ID', a.fahrzeug_id);
    z('Verkäufer', a.verkaeufer);
    z('Verkaufspreis', a.vk_preis != null ? fmtBetrag(a.vk_preis) : '');
    var ueber = a.uebergabe_termin && a.uebergabe_termin < EG.heute();
    z('Übergabetermin', a.uebergabe_termin ? h('span', {}, EG.fmtDatum(a.uebergabe_termin), ueber ? [' ', EG.pill('überschritten', 'rot')] : null) : 'noch nicht festgelegt');
    var knoepfe = h('div', { style: 'margin-top:10px' });
    if (typeof window.VK_AKTE_OEFFNEN === 'function') {
      knoepfe.appendChild(h('button', { type: 'button', class: 'btn btn-ghost btn-klein', text: 'Zur Verkaufsakte', onclick: function () { window.VK_AKTE_OEFFNEN(a.id); } }));
    }
    if (window.VK_ZAHLUNGSAUFSTELLUNG) {   // P4c: A4-Druckansicht nach Blatt „10. Zahlungsaufstellung“
      knoepfe.appendChild(h('button', { type: 'button', class: 'btn btn-primary btn-klein', style: 'margin-left:8px', text: 'Zahlungsaufstellung drucken',
        onclick: function () { window.VK_ZAHLUNGSAUFSTELLUNG.oeffnen({ akte: S.akte, zahlung: S.zahlung, einkauf: S.einkauf }).catch(EG.fehler); } }));
    }
    return h('div', { class: 'karte' },
      h('div', { class: 'karte-kopf' }, h('h2', { text: akteTitel(a) }), EG.pill('Zahlung: ' + STAND_TEXT[c.stand], STAND_PILL[c.stand])),
      (a.farbe || a.fin) ? h('div', { class: 'fz-zeile', text: [a.farbe, a.fin ? 'FIN ' + a.fin : ''].filter(Boolean).join(' · ') }) : null,
      h('div', { class: 'vkz-kopfpills' },
        EG.pill('Kunde: ' + (c.kunde.entfaellt ? 'entfällt' : AMPEL_TEXT[c.kunde.ampel]), AMPEL_PILL[c.kunde.ampel]),
        EG.pill('Lieferant: ' + (c.lief.entfaellt ? 'entfällt' : AMPEL_TEXT[c.lief.ampel]), AMPEL_PILL[c.lief.ampel])),
      h('div', { class: 'abstand' }), dl,
      knoepfe.childNodes.length ? knoepfe : null);
  }

  /* ---------- Was fehlt noch ---------- */
  function fehltKarte() {
    var c = S.calc, karte = h('div', { class: 'karte vk-fehlt' }, h('h2', { text: 'Was fehlt noch' }));
    var liste = c.res.fehlt.filter(function (f) { return BEREICHE.indexOf(f.phase) >= 0; });
    if (!liste.length) { karte.appendChild(EG.banner('Zahlungen Kunde und Lieferant sind vollständig.', 'ok')); return karte; }
    karte.appendChild(h('p', { class: 'muted klein', text: liste.length + ' offene' + (liste.length === 1 ? 'r Punkt' : ' Punkte') + '. Tippe auf einen Eintrag, dann springst du hin.' }));
    var box = h('div', { class: 'vk-fehlt-liste' });
    liste.forEach(function (f) {
      box.appendChild(h('button', { type: 'button', class: 'vk-fehlt-item', onclick: function () { springeZu(f.phase, f.k); } },
        h('span', { class: 'vk-fehlt-phase', text: f.phaseName }),
        h('span', { class: 'vk-fehlt-text', text: f.text + (f.wer ? ' (' + f.wer + ')' : '') }),
        f.status === 'nok' ? EG.pill('NOK', 'rot') : null));
    });
    karte.appendChild(box);
    return karte;
  }
  function springeZu(phKey, punktKey) {
    S.offen[phKey] = true;
    var det = document.getElementById('vkz-ph-' + phKey);
    if (det) det.open = true;
    var ziel = punktKey ? document.getElementById('vkz-p-' + phKey + '-' + punktKey) : det;
    if (ziel) setTimeout(function () {
      ziel.scrollIntoView({ behavior: 'smooth', block: punktKey ? 'center' : 'start' });
      ziel.classList.add('vk-blink'); setTimeout(function () { ziel.classList.remove('vk-blink'); }, 1600);
    }, 40);
  }

  /* ---------- Bearbeiten (P4b): Masterliste-Feld → Spalte in bestand.zahlung/einkauf bzw. verkauf.akte (nur für die Demo-Übernahme und die Vorgabe) ---------- */
  /* Art: z = Zahl, d = Datum, t = Text, b = ja/nein, l = Liste */
  var ZUORD = {
    Fertig: ['zahlung', 'kd_geldeingang', 't'], Kd_x002d_Zahlart: ['zahlung', 'kd_zahlart', 'l'],
    Kd_x002d_Barzahlung: ['zahlung', 'kd_bar', 'z'], Ld_x002d_Barz_x002d_Datum: ['zahlung', 'kd_bar_datum', 'd'],
    Kd_x002d_1Uebw: ['zahlung', 'kd_1uebw', 'z'], Kd_x002d__x00dc_berw_x002d_Datum: ['zahlung', 'kd_1uebw_datum', 'd'],
    Kd_x002d_2Uebw: ['zahlung', 'kd_2uebw', 'z'], _x0031_DatumGeldeingang: ['zahlung', 'kd_2uebw_datum', 'd'],
    Kd_x002d_3Uebw: ['zahlung', 'kd_3uebw', 'z'], _x0033_DatumGeldeingang: ['zahlung', 'kd_3uebw_datum', 'd'],
    Kd_x002d_Finz: ['zahlung', 'kd_finanzierung_betrag', 'z'], Kd_x002d_Finz_x002d_Datum: ['zahlung', 'kd_finanzierung_datum', 'd'],
    Inzahlungnahme: ['zahlung', 'inzahlung', 'b'], Inz_x002d_Betrag: ['zahlung', 'inz_wert', 'z'], Inz_x002d_Datum: ['zahlung', 'inz_datum', 'd'],
    InzAbloese: ['zahlung', 'inz_abloese_betrag', 'z'], InzAbloeseDatum: ['zahlung', 'inz_abloese_datum', 'd'], InzAbloeseBank: ['zahlung', 'inz_abloese_bank', 't'],
    Netting: ['zahlung', 'netting_betrag', 'z'], Netting_x002d_Datum: ['zahlung', 'netting_datum', 'd'],
    _x20ac__x002d_Geldaus_x002d_EKFi: ['zahlung', 'netting_abbuchung_betrag', 'z'], EK_x002d_Abl_x00f6_se_x002d_Kto: ['zahlung', 'netting_abbuchung_datum', 'd'],
    VK_x002d_Preis_x002d_Kunde: ['zahlung', 'ml_vk_preis', 'z'], Zusatzrechnung: ['akte', 'kd_zusatz_rg', 'z'], KdZusatzRgDatum: ['akte', 'kd_zusatz_rg_datum', 'd'],
    Lieferant: ['einkauf', 'lieferant', 't'], Lieferant_x002d_Nr_x002e_: ['einkauf', 'lieferant_nr', 't'], Rechnung_x002d_Lieferant: ['einkauf', 'lief_rg_nr', 't'],
    Rg_x002d_Datum: ['einkauf', 'lief_rg_datum', 'd'], Lief_x002d_Rg_x002d_Betr_x002d_b: ['einkauf', 'lief_rg_betrag_brutto', 'z'], Kaufpreisnetto: ['einkauf', 'ek_netto', 'z'],
    Fahrzeugbezahlt: ['einkauf', 'lief_fzg_bezahlt', 'b'], Lief_x002d_Rg_x002d_bezahlt: ['einkauf', 'lief_rg_bezahlt_datum', 'd'],
    EK_x002d_Finanz: ['einkauf', 'ek_finanzierung', 'b'], EK_x002d_Betrag: ['einkauf', 'ek_finanzierung_betrag', 'z'],
    EK_x002d_Geldeingang: ['einkauf', 'ek_finanzierung_geldeingang_datum', 'd'], DatumEK_x002d_Abl_x00f6_se: ['einkauf', 'ek_finanzierung_abloese_datum', 'd']
  };
  var FELDER_KUNDE = ['#Rechnung', 'VK_x002d_Preis_x002d_Kunde', 'Zusatzrechnung', 'KdZusatzRgDatum', '#Zahlung', 'Fertig', 'Kd_x002d_Zahlart',
    'Kd_x002d_Barzahlung', 'Ld_x002d_Barz_x002d_Datum', 'Kd_x002d_1Uebw', 'Kd_x002d__x00dc_berw_x002d_Datum', 'Kd_x002d_2Uebw', '_x0031_DatumGeldeingang',
    'Kd_x002d_3Uebw', '_x0033_DatumGeldeingang', 'Kd_x002d_Finz', 'Kd_x002d_Finz_x002d_Datum',
    '#Inzahlungnahme', 'Inzahlungnahme', 'Inz_x002d_Betrag', 'Inz_x002d_Datum', 'InzAbloese', 'InzAbloeseDatum', 'InzAbloeseBank',
    '#Netting Openbank', 'Netting', 'Netting_x002d_Datum', '_x20ac__x002d_Geldaus_x002d_EKFi', 'EK_x002d_Abl_x00f6_se_x002d_Kto'];
  var FELDER_LIEF = ['#Lieferant', 'Lieferant', 'Lieferant_x002d_Nr_x002e_', '#Rechnung und Zahlung', 'Rechnung_x002d_Lieferant', 'Rg_x002d_Datum',
    'Lief_x002d_Rg_x002d_Betr_x002d_b', 'Kaufpreisnetto', 'Fahrzeugbezahlt', 'Lief_x002d_Rg_x002d_bezahlt',
    '#EK-Finanzierung (Openbank)', 'EK_x002d_Finanz', 'EK_x002d_Betrag', 'EK_x002d_Geldeingang', 'DatumEK_x002d_Abl_x00f6_se'];
  function zeileVon(tab) { return tab === 'zahlung' ? S.zahlung : tab === 'einkauf' ? S.einkauf : S.akte; }
  /** Nur Demo: aktuelle Werte der Felder (Text/ja-nein/Liste) als Vorgabe für den Dialog */
  function demoVorgabe(liste) {
    var v = {};
    liste.forEach(function (sp) {
      var zu = ZUORD[sp], row = zu && zeileVon(zu[0]);
      if (!zu || !row || row[zu[1]] == null) return;
      v[sp] = zu[2] === 'b' ? (row[zu[1]] ? 'ja' : 'nein') : row[zu[1]];
    });
    return v;
  }
  /** Nur Demo: geänderte Werte im Speicher der Seite übernehmen (nichts geht in die Masterliste) */
  function demoUebernehmen(werte) {
    Object.keys(werte).forEach(function (sp) {
      var zu = ZUORD[sp], row = zu && zeileVon(zu[0]); if (!zu || !row) return;
      var w = werte[sp], art = zu[2], leer = w == null || w === '' || (Array.isArray(w) && !w.length);
      if (art === 'z') { var n = parseBetrag(w); row[zu[1]] = leer || isNaN(n) ? null : n; }
      else if (art === 'b') row[zu[1]] = leer ? null : w === 'ja';
      else if (art === 'l') row[zu[1]] = Array.isArray(w) ? w : [];
      else row[zu[1]] = leer ? null : w;
    });
  }
  /** Knopf „Kunde bearbeiten“ / „Lieferant bearbeiten“ → Mehrfeld-Dialog des Reiters Fahrzeuge (Weg: bestand_schreiben) */
  async function bearbeiten(gruppe) {
    if (!darf() || !S.akte || !S.akte.fahrzeug_id) return;
    if (!window.EG_FZ || !window.EG_FZ.felderBearbeiten) { EG.toast('Das Bearbeiten ist gerade nicht verfügbar (eingang-fahrzeuge.js fehlt).', 'fehler'); return; }
    var liste = gruppe === 'kunde' ? FELDER_KUNDE : FELDER_LIEF;
    var id = S.id;
    var r = await window.EG_FZ.felderBearbeiten(S.akte.fahrzeug_id, liste, {
      titel: (gruppe === 'kunde' ? 'Zahlung Kunde' : 'Zahlung Lieferant') + ' bearbeiten – ' + akteTitel(S.akte),
      vorgabe: EG.demo ? demoVorgabe(liste) : null
    });
    if (!r || !r.gespeichert || S.id !== id) return;
    if (r.demo) { demoUebernehmen(r.werte); aktualisiere(true); S.bestandKarteBox && S.bestandKarteBox.replaceWith(S.bestandKarteBox = bestandKarte()); return; }
    await ladeDetail();   // frisch aus der Datenbank (Import hat nachgezogen; sonst zeigt der nächste Neuladen den Stand)
  }

  /* ---------- Lesekarte: Felder aus bestand.zahlung und bestand.einkauf ---------- */
  function bestandKarte() {
    var z = S.zahlung, e = S.einkauf;
    var karte = h('div', { class: 'karte vkz-lese', style: 'margin-top:18px' }, h('h2', { text: 'Daten aus der Masterliste' }));
    var kannBearb = darf() && !!S.akte.fahrzeug_id && !!window.EG_FZ;
    karte.appendChild(h('p', { class: 'vkz-herkunft', text: kannBearb
      ? 'Diese Felder gehören zur Masterliste. Mit „Bearbeiten“ änderst du sie hier: Die Änderung geht zuerst in die Masterliste und ist nach wenigen Sekunden in der App (nur Felder, die deine Rolle ändern darf).'
      : 'Diese Felder kommen aus der Masterliste und lassen sich hier nur ansehen.' }));
    if (S.bestandHinweis) karte.appendChild(EG.banner(S.bestandHinweis, 'warn'));
    function dl(zeilen) {
      var d = h('dl', { class: 'kv' });
      zeilen.forEach(function (x) { d.appendChild(h('dt', { text: x[0] })); d.appendChild(h('dd', {}, x[1] == null || x[1] === '' ? '–' : x[1])); });
      return d;
    }
    function bd(betrag, datum) {
      var t = [betrag != null ? fmtBetrag(betrag) : '', datum ? EG.fmtDatum(datum) : ''].filter(Boolean).join(' am ');
      return t;
    }
    function jn(v) { return v === true ? 'ja' : v === false ? 'nein' : ''; }
    var kd = z ? [
      ['Geldeingang', z.kd_geldeingang],
      ['Zahlart', (z.kd_zahlart || []).join(', ')],
      ['Bar', bd(z.kd_bar, z.kd_bar_datum)],
      ['1. Überweisung', bd(z.kd_1uebw, z.kd_1uebw_datum)],
      ['2. Überweisung', bd(z.kd_2uebw, z.kd_2uebw_datum)],
      ['3. Überweisung', bd(z.kd_3uebw, z.kd_3uebw_datum)],
      ['Finanzierung (Bank)', bd(z.kd_finanzierung_betrag, z.kd_finanzierung_datum)],
      ['Inzahlungnahme', z.inzahlung ? 'ja' + (z.inz_wert != null ? ', Wert ' + fmtBetrag(z.inz_wert) : '') : 'nein'],
      ['Ablöse Inzahlungnahme', bd(z.inz_abloese_betrag, z.inz_abloese_datum) + (z.inz_abloese_bank ? ' (' + z.inz_abloese_bank + ')' : '')],
      ['Netting Openbank', bd(z.netting_betrag, z.netting_datum)],
      ['Netting Abbuchung', bd(z.netting_abbuchung_betrag, z.netting_abbuchung_datum)]
    ] : [['Kunde', 'Keine Zahlungsdaten vorhanden (bestand.zahlung).']];
    var lf = e ? [
      ['Lieferant', e.lieferant],
      ['Lieferantenrechnung', [e.lief_rg_nr, e.lief_rg_datum ? EG.fmtDatum(e.lief_rg_datum) : '', e.lief_rg_betrag_brutto != null ? fmtBetrag(e.lief_rg_betrag_brutto) + ' brutto' : ''].filter(Boolean).join(' · ')],
      ['Einkaufspreis', e.ek_netto != null ? fmtBetrag(e.ek_netto) + ' netto' : ''],
      ['Fahrzeug bezahlt', jn(e.lief_fzg_bezahlt) + (e.lief_rg_bezahlt_datum ? ' am ' + EG.fmtDatum(e.lief_rg_bezahlt_datum) : '')],
      ['EK-Finanzierung (Openbank)', e.ek_finanzierung ? 'ja' + (e.ek_finanzierung_betrag != null ? ', ' + fmtBetrag(e.ek_finanzierung_betrag) : '') : (e.ek_finanzierung === false ? 'nein' : '')],
      ['Geldeingang EK-Finanzierung', e.ek_finanzierung_geldeingang_datum ? EG.fmtDatum(e.ek_finanzierung_geldeingang_datum) : ''],
      ['Ablöse EK-Finanzierung (Netting)', e.ek_finanzierung_abloese_datum ? EG.fmtDatum(e.ek_finanzierung_abloese_datum) : '']
    ] : [['Lieferant', 'Keine Einkaufsdaten vorhanden (bestand.einkauf).']];
    karte.appendChild(h('div', { class: 'vkz-spalten' },
      h('div', {}, h('h3', { text: 'Kunde' }), dl(kd), kannBearb ? h('button', { type: 'button', class: 'btn btn-ghost btn-klein', style: 'margin-top:8px', text: 'Kunde bearbeiten', onclick: function () { bearbeiten('kunde').catch(EG.fehler); } }) : null),
      h('div', {}, h('h3', { text: 'Lieferant' }), dl(lf), kannBearb ? h('button', { type: 'button', class: 'btn btn-ghost btn-klein', style: 'margin-top:8px', text: 'Lieferant bearbeiten', onclick: function () { bearbeiten('lief').catch(EG.fehler); } }) : null)));
    S.bestandKarteBox = karte;
    return karte;
  }

  /* ---------- Bereich (Kunde / Lieferant) ---------- */
  function bereichKarte(key) {
    var info = S.calc.res.nachKey[key], ph = PH_BY[key];
    var det = h('details', { class: 'vk-phase ' + info.ampel, id: 'vkz-ph-' + key });
    det.open = key in S.offen ? !!S.offen[key] : true;
    det.addEventListener('toggle', function () { S.offen[key] = det.open; });
    var kurz = info.entfaellt ? 'entfällt' : info.pflichtErledigt + ' von ' + info.pflichtGesamt + ' Pflichtpunkten';
    det.appendChild(h('summary', { class: 'vk-ph-kopf' },
      h('span', { class: 'vk-dot gross ' + info.ampel, 'aria-hidden': 'true' }),
      h('span', { class: 'vk-ph-name', text: ph.name }),
      h('span', { class: 'vk-ph-info', text: kurz + (info.nok ? ' · ' + info.nok + ' mit NOK' : '') }),
      EG.pill(info.entfaellt ? 'Entfällt' : AMPEL_TEXT[info.ampel], AMPEL_PILL[info.ampel])));
    var body = h('div', { class: 'vk-ph-body' });
    body.appendChild(h('div', { class: 'klein muted', text: 'Abhaken: ' + ph.wer }));
    if (ph.hinweis) body.appendChild(h('div', { class: 'klein muted', style: 'margin-top:2px', text: ph.hinweis }));
    info.punkte.forEach(function (pe) { body.appendChild(punktKarte(key, pe)); });
    det.appendChild(body);
    return det;
  }

  /** Wert aus dem Datenfeld „bestand.tabelle.spalte“ (Masterliste) als Text */
  function datenWert(quelle) {
    if (!quelle) return null;
    var t = quelle.split('.'), tab = t[1], spalte = t[2];
    var row = tab === 'zahlung' ? S.zahlung : tab === 'einkauf' ? S.einkauf : null;
    if (!row || row[spalte] === undefined || row[spalte] === null || row[spalte] === '') return null;
    var v = row[spalte];
    if (v === true) return 'ja';
    if (v === false) return 'nein';
    if (typeof v === 'string' && /^[0-9]{4}-[0-9]{2}-[0-9]{2}/.test(v)) return EG.fmtDatum(v);
    return String(v);
  }

  /* ---------- Punkt ---------- */
  function ownRow(p) {
    var s = p.schreibeIn;
    return s && S.pm[s.phase] ? S.pm[s.phase][s.k] || null : null;
  }
  function statusZeile(pe, row) {
    var bits = [];
    if (row && row.status && row.status !== 'offen' && (row.erledigt_von_name || row.erledigt_am)) {
      bits.push(h('div', { class: 'klein muted', text: (row.status === 'ok' ? 'Erledigt' : row.status === 'nok' ? 'NOK gemeldet' : 'Entfällt') + (row.erledigt_von_name ? ' von ' + row.erledigt_von_name : '') + (row.erledigt_am ? ', ' + EG.fmtZeit(row.erledigt_am) : '') }));
    }
    if (row && (row.status === 'nok' || row.status === 'entfaellt') && row.grund) bits.push(h('div', { class: 'klein vk-grund umbruch', text: 'Grund: ' + row.grund }));
    return bits.length ? h('div', { class: 'vk-status' }, bits) : null;
  }
  function punktKarte(key, pe) {
    var p = defVon(key, pe.k), st = pe.status, row = ownRow(p), ownSt = row ? row.status || 'offen' : 'offen';
    var lesen = !!p.nurLesen && !p.schreibeIn;
    var ed = darf() && !pe.auto && !lesen;
    var karte = h('div', {
      class: 'punkt vk-punkt' + (st === 'ok' ? ' ok' : st === 'nok' ? ' vk-nok' : st === 'entfaellt' ? ' entfaellt' : '') + (!ed ? ' vk-lesen' : ''),
      id: 'vkz-p-' + key + '-' + p.k
    });
    var titel = h('div', { class: 'punkt-titel' }, p.text, p.pflicht ? null : h('span', { class: 'vk-opt', text: ' (freiwillig)' }));
    karte.appendChild(titel);
    if (pe.auto) {   // entfällt automatisch (oder erledigt aus Datenfeld)
      karte.appendChild(h('div', { class: 'vk-auto', text: (st === 'entfaellt' ? 'Entfällt: ' : st === 'ok' ? 'Erledigt: ' : 'Offen: ') + (pe.grund || '') }));
      return karte;
    }
    if (p.hinweis) karte.appendChild(h('div', { class: 'punkt-hinweis', text: p.hinweis }));
    if (lesen) {   // Masterliste / bestand.* : nur anzeigen
      var dv = datenWert(p.datenquelle), dd = datenWert(p.datumQuelle);
      var zeile = (st === 'ok' ? 'Erledigt' : st === 'nok' ? 'NOK' : st === 'entfaellt' ? 'Entfällt' : 'Offen') +
        (dv && p.datenquelle ? ' · Wert in der Masterliste: ' + dv : '') + (dd ? ' (' + dd + ')' : '');
      karte.appendChild(h('div', { class: 'vk-auto', text: zeile }));
      var dqs = (p.quelle || []).filter(function (q) { return q.dokument; });
      karte.appendChild(h('div', { class: 'klein muted', style: 'margin-top:4px', text: dqs.length ? 'Kommt aus der Masterliste (Schritt 1a) oder aus den Unterlagen (PDF) – hier nur lesbar.' : 'Kommt aus der Masterliste (Schritt 1a) – hier nur lesbar.' }));
      if (dqs.length) {
        var dd2 = S.pm.dok && S.pm.dok[dqs[0].dokument];
        var dz = h('div', { class: 'vk-auto vk-dok' + (dd2 ? ' vk-dok-da' : ' vk-dok-fehlt'), 'data-dok-art': dqs[0].dokument,
          text: dd2 ? 'Erledigt – PDF in den Unterlagen' + (dd2.wert && dd2.wert.text ? ' (' + dd2.wert.text + ')' : '') : 'Noch kein PDF in den Unterlagen – der Punkt gilt als erledigt, sobald es dort liegt.' });
        dz.appendChild(h('button', { type: 'button', class: 'btn btn-ghost btn-klein', style: 'margin-left:8px', text: 'Zu den Unterlagen', onclick: function () { if (window.VK_DU && S.akte) window.VK_DU.springe(S.akte.id); } }));
        karte.appendChild(dz);
      }
      karte.appendChild(h('div', { style: 'margin-top:6px' }, EG.pill(st === 'ok' ? 'Erledigt' : st === 'nok' ? 'NOK' : st === 'entfaellt' ? 'Entfällt' : 'Offen', st === 'ok' ? 'gruen' : st === 'nok' ? 'rot' : 'grau')));
      return karte;
    }
    if (st === 'ok' && ownSt !== 'ok') karte.appendChild(h('div', { class: 'klein muted', text: 'Schon erledigt laut Masterliste bzw. Import.' }));
    if (p.eingabe) karte.appendChild(eingabeBlock(key, p, row, ed));
    if (p.k === 'zahlungseinladung' && window.VK_ZE && window.VK_ZE.darfSehen(EG.rolle)) {   // Formular + Mail zum Kopieren (verkauf-zahlungseinladung.js)
      karte.appendChild(h('button', { type: 'button', class: 'btn btn-primary vk-ze-knopf', text: 'Zahlungseinladung erstellen', onclick: function () { window.VK_ZE.oeffnen(S.akte, S.pm); } }));
    }
    if ((p.k === 'anzahlung_da' || p.k === 'restzahlung') && window.VK_ZB && window.VK_ZB.darfSehen(EG.rolle)) {   // Formular + Mail (verkauf-zahlungsbestaetigung.js)
      var zbArt = p.k === 'anzahlung_da' ? 'anzahlung' : 'komplett';
      karte.appendChild(h('button', { type: 'button', class: 'btn btn-primary vk-ze-knopf', text: 'Zahlungsbestätigung erstellen', onclick: function () { window.VK_ZB.oeffnen(S.akte, S.pm, zbArt); } }));
    }
    if (p.foto) karte.appendChild(fotoBereich(key, p, row, ed));
    karte.appendChild(segment(key, p, ownSt, ed));
    var sz = statusZeile(pe, row); if (sz) karte.appendChild(sz);
    return karte;
  }
  function segment(key, p, ownSt, ed) {
    var liste = p.seg || ['ok', 'nok', 'entfaellt'];
    if (p.keinEntfaellt) liste = liste.filter(function (x) { return x !== 'entfaellt'; });
    var labels = Object.assign({}, STATUS_LABEL, p.segLabels || {}), cls = { ok: 'seg-ok', nok: 'seg-mangel', entfaellt: 'seg-entfaellt' };
    var seg = h('div', { class: 'seg vk-seg', role: 'group', 'aria-label': p.text, style: 'grid-template-columns:repeat(' + liste.length + ',1fr)' });
    liste.forEach(function (x) {
      seg.appendChild(h('button', {
        type: 'button', class: 'seg-b ' + cls[x] + (ownSt === x ? ' aktiv' : ''), 'aria-pressed': ownSt === x ? 'true' : 'false', disabled: !ed, text: labels[x],
        onclick: function () { statusKlick(key, p, x).catch(EG.fehler); }
      }));
    });
    return seg;
  }

  /* ---------- Eingabefelder ---------- */
  function wertKopie(row) { return Object.assign({}, (row && row.wert && typeof row.wert === 'object') ? row.wert : {}); }
  function wertVon(p, w) {
    if (!w || typeof w !== 'object') return null;
    switch (p.eingabe) {
      case 'auswahl': return w.auswahl == null || w.auswahl === '' ? null : w.auswahl;
      case 'datum': return w.datum || null;
      case 'betrag': return w.betrag == null ? null : w.betrag;
      case 'text': return w.text || null;
      default: return null;
    }
  }
  function eingabeBlock(key, p, row, ed) {
    var w = wertKopie(row), id = 'vkz-e-' + key + '-' + p.k, label = p.label;
    var box = h('div', { class: 'extra vk-eingabe' });
    function aendereWert(neu, auto) { return aendern(key, p, { wert: neu, auto: auto ? true : undefined }).catch(EG.fehler); }
    if (p.eingabe === 'auswahl') {
      var sel = h('select', { id: id, disabled: !ed }, h('option', { value: '', text: '– bitte wählen –' }), (p.optionen || []).map(function (o) { return h('option', { value: o, text: o }); }));
      sel.value = w.auswahl || '';
      sel.addEventListener('change', function () {
        var neu = Object.assign({}, w); if (sel.value) neu.auswahl = sel.value; else delete neu.auswahl;
        if (!p.textBei || p.textBei.indexOf(sel.value) < 0) delete neu.text;
        aendereWert(neu, true);
      });
      box.appendChild(EG.feld(label || 'Auswahl', sel));
      if (p.textBei && p.textBei.indexOf(w.auswahl) >= 0) {
        var textFeld = h('textarea', { id: id + '-grund', disabled: !ed, value: w.text || '', placeholder: 'Grund (Pflicht)' });
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
    }
    return box;
  }

  /* ---------- Fotos (Bar-Beleg) ---------- */
  function fotoBereich(key, p, row, ed) {
    var fotos = (row && row.fotos) || [];
    var box = h('div', { class: 'extra' });
    box.appendChild(h('div', { class: 'feld-label', text: p.fotoPflicht ? 'Foto (Pflicht)' : 'Foto' }));
    if (!ed) {
      box.appendChild(fotos.length ? h('div', { class: 'fotos' }, fotos.map(function (f) { return EG.fotoThumb(f); })) : h('div', { class: 'klein muted', text: 'Kein Foto.' }));
      return box;
    }
    var fb = EG.fotoBlock({
      pfad: 'verkauf/' + S.id, fotos: fotos,
      onChange: function (arr) { aendern(key, p, { fotos: arr }).catch(EG.fehler); }
    });
    box.appendChild(fb.el);
    return box;
  }

  /* ---------- Statuswechsel ---------- */
  async function statusKlick(key, p, wunsch) {
    if (!darf() || !p.schreibeIn) return;
    var row = ownRow(p), ownSt = row ? row.status || 'offen' : 'offen';
    if (ownSt === wunsch) { await aendern(key, p, { status: 'offen', grund: null, render: true }); return; }   // Tipp auf den aktiven Knopf nimmt zurück
    if (wunsch === 'ok') { await aendern(key, p, { status: 'ok', grund: null, render: true }); return; }
    var frage = wunsch === 'nok' ? 'Was ist nicht in Ordnung?' : 'Warum entfällt dieser Punkt?';
    var g = await EG.eingabe(frage, { titel: p.text, vorgabe: (row && row.grund) || '', platzhalter: 'Grund (Pflicht)', ok: 'Speichern' });
    if (!g) return;
    await aendern(key, p, { status: wunsch, grund: g, render: true });
  }
  /** Prüft vor „OK“, ob alles Nötige da ist. → Fehlertext oder null */
  function pruefeOk(key, p, neu) {
    var w = neu.wert || {};
    if (p.eingabe === 'auswahl' && !w.auswahl) return 'Bitte erst „' + (p.label || 'Auswahl') + '“ wählen.';
    if (p.eingabe === 'datum' && !w.datum) return 'Bitte erst „' + (p.label || 'Datum') + '“ eintragen.';
    if (p.eingabe === 'betrag' && (w.betrag == null || w.betrag === '')) return 'Bitte erst „' + (p.label || 'Betrag') + '“ eintragen.';
    if (p.eingabe === 'text' && p.wertPflicht && !String(w.text || '').trim()) return 'Bitte erst „' + (p.label || 'Eintrag') + '“ eintragen.';
    if (p.textBei && w.auswahl && p.textBei.indexOf(w.auswahl) >= 0 && !String(w.text || '').trim()) return 'Bitte den Grund eintragen.';
    if (p.fotoPflicht && !(neu.fotos || []).length) return 'Dafür brauchst du mindestens ein Foto.';
    if (p.nurNachAllen) {
      var info = S.calc.res.nachKey[key];
      var rest = info.punkte.filter(function (x) { return x.k !== p.k && x.pflicht && x.status !== 'ok' && x.status !== 'entfaellt'; });
      if (rest.length) return 'Erst müssen die anderen Pflichtpunkte dieses Bereichs erledigt sein (noch ' + rest.length + ' offen).';
    }
    return null;
  }
  /** Ändert einen Punkt und speichert sofort (upsert verkauf.punkt unter „schreibeIn“, Konflikt akte_id,phase,punkt_key).
      patch: { status?, wert?, grund?, fotos?, auto? (Wert eingegeben → OK, wenn alles stimmt, sonst offen), render? } → Promise<boolean> */
  function aendern(key, p, patch) {
    return seriell(async function () {
      var ziel = p.schreibeIn;
      if (!ziel) return false;
      var pm = (S.pm[ziel.phase] = S.pm[ziel.phase] || {}), row = pm[ziel.k] || null, alt = row ? row.status : 'offen';
      var neu = {
        status: patch.status !== undefined ? patch.status : alt,
        wert: patch.wert !== undefined ? patch.wert : (row ? row.wert : null),
        grund: patch.grund !== undefined ? patch.grund : (row ? row.grund : null),
        fotos: patch.fotos !== undefined ? patch.fotos : (row && row.fotos ? row.fotos : [])
      };
      if (patch.auto) {   // Wert eingegeben bzw. gelöscht → Status folgt
        var leer = wertVon(p, neu.wert) === null;
        neu.status = leer ? 'offen' : 'ok';
        if (neu.status === 'ok' && pruefeOk(key, p, neu)) neu.status = 'offen';
      } else if (neu.status === 'ok') {
        var fehler = pruefeOk(key, p, neu);
        if (fehler) { EG.toast(fehler, 'fehler'); return false; }
      }
      if ((neu.status === 'nok' || neu.status === 'entfaellt') && !neu.grund) { EG.toast('Bitte einen Grund eintragen.', 'fehler'); return false; }
      if (neu.status === 'ok' || neu.status === 'offen') neu.grund = null;
      var name = EG.nutzerName() || EG.nutzer(), gesetzt = neu.status !== 'offen';
      var data = {
        akte_id: S.id, phase: ziel.phase, punkt_key: ziel.k, status: neu.status, wert: neu.wert, grund: neu.grund, fotos: neu.fotos,
        erledigt_von_name: gesetzt ? name : null, erledigt_am: gesetzt ? jetzt() : null, updated_at: jetzt()
      };
      var r = chk(await T.punkt().upsert(data, { onConflict: 'akte_id,phase,punkt_key' }).select().single());
      pm[ziel.k] = r.data;
      var voll = neu.status !== alt || (p.eingabe && p.eingabe !== 'text') || !!patch.render || patch.fotos !== undefined;
      aktualisiere(voll);
      return true;
    });
  }

  /* ====================================================================
     DEMO-DATEN (nur ?demo=1): Akten mit fahrzeug_id ST-26-9001 … 9003
     Nur Fehlendes wird ergänzt; vorhandene Zeilen (z. B. vom Reiter Verkauf) bleiben unangetastet.
     ==================================================================== */
  function demoDefinition() {
    function tag(n) { var x = new Date(); x.setDate(x.getDate() + n); return EG.isoDatum(x); }
    function vor(n, std) { var x = new Date(); x.setDate(x.getDate() - n); x.setHours(std || 10, 20, 0, 0); return x.toISOString(); }
    function pz(a, ph, k, st, wert, grund) {
      return {
        id: EG.uuid(), akte_id: a, phase: ph, punkt_key: k, status: st || 'ok', wert: wert || null, grund: grund || null, fotos: [],
        erledigt_von_name: st === 'offen' ? null : 'Demo Mitarbeiter', erledigt_am: st === 'offen' ? null : vor(2), updated_at: vor(2)
      };
    }
    var basisAkte = { ml_ref: null, lead_ref: null, job_nr: null, kunde_telefon: '0711 000000', phase_aktuell: 'p07', created_at: vor(9), updated_at: vor(1), erstellt_von_name: 'Demo Mitarbeiter', nachtrag: false };
    var id1 = 'a0000009-0000-4000-8000-000000009001', id2 = 'a0000009-0000-4000-8000-000000009002', id3 = 'a0000009-0000-4000-8000-000000009003';
    var ML = function (id, offenKonto) {   // Masterliste-Büro-Häkchen (nur lesbar in der App)
      var l = [pz(id, 'nach_verkauf', 'repdoc_zubehoerrechnung', 'ok', null)];
      if (!offenKonto) l.push(pz(id, 'nach_verkauf', 'kontoplanung', 'ok', null), pz(id, 'nach_verkauf', 'zahlungsaufstellung_bh', 'ok', null));
      return l;
    };
    return [
      {   // 1: Teilzahlung, Lagerwagen mit EK-Finanzierung (Netting offen) – nicht vollständig abhakbar, dient der Ansicht „offen“
        fid: 'ST-26-9001',
        akte: Object.assign({}, basisAkte, { id: id1, interne_nr: '90201', autrado_nr: '900201', fin: 'DEMO0000000009001', hersteller: 'Hyundai', modell: 'Tucson 1.6 T-GDI Demo (A1)', farbe: 'Polar White',
          kunde_name: 'Muster, Max', kunde_email: 'max.muster@demo.example', verkaeufer: 'NP', bestell_nr: '2611-9001', uebergabe_termin: tag(6), fahrzeug_id: 'ST-26-9001', vk_preis: 31900, kd_zusatz_rg: 250 }),
        punkte: function (a) {
          return [pz(a, 'v2', 'finanzierung', 'ok', { auswahl: 'Nein' }), pz(a, 'v2', 'inzahlung', 'ok', { auswahl: 'Nein' }), pz(a, 'v5', 'zahlungsart', 'ok', { auswahl: 'Überweisung' }),
            pz(a, 'v5', 'anzahlung', 'ok', { betrag: 2000 }), pz(a, 'v7', 'repdoc_rechnung', 'ok', { text: 'RE-26-4711' }), pz(a, 'v7', 'zahlungseinladung', 'ok', null),
            pz(a, 'v7', 'anzahlung_da', 'ok', { betrag: 2000 }), pz(a, 'v7', 'lief_rechnung', 'ok', { auswahl: 'Kommt nach Zahlung' })].concat(ML(a, true));
        },
        zahlung: { kd_geldeingang: 'Teilzahlung', kd_zahlart: ['Anzahlung', 'Überweisung'], kd_1uebw: 2000, kd_1uebw_datum: tag(-2), inzahlung: false },
        einkauf: { lieferant: 'Demo-Autohaus Nord GmbH', lief_rg_nr: 'L-2026-0815', lief_rg_datum: tag(-8), lief_rg_betrag_brutto: 27800, ek_netto: 23361.34, lief_fzg_bezahlt: false,
          ek_finanzierung: true, ek_finanzierung_betrag: 26000, ek_finanzierung_geldeingang_datum: tag(-7), ek_finanzierung_abloese_datum: null, transportstatus: '5 im Haus' }
      },
      {   // 2: Finanzierung, Lieferant fertig (Netting erledigt), Kunde offen
        fid: 'ST-26-9002',
        akte: Object.assign({}, basisAkte, { id: id2, interne_nr: '90202', autrado_nr: '900202', fin: 'DEMO0000000009002', hersteller: 'Kia', modell: 'Sportage 1.6 Demo (A1)', farbe: 'Deep Chroma Blue',
          kunde_name: 'Beispiel, Erika', kunde_email: 'erika.beispiel@demo.example', verkaeufer: 'OS', bestell_nr: '2611-9002', uebergabe_termin: tag(3), fahrzeug_id: 'ST-26-9002', vk_preis: 28500 }),
        punkte: function (a) {
          return [pz(a, 'v2', 'finanzierung', 'ok', { auswahl: 'Ja' }), pz(a, 'v2', 'inzahlung', 'ok', { auswahl: 'Nein' }), pz(a, 'v5', 'zahlungsart', 'ok', { auswahl: 'Finanzierung' }),
            pz(a, 'v5', 'anzahlung', 'entfaellt', null, 'Keine Anzahlung vereinbart'), pz(a, 'v7', 'repdoc_rechnung', 'ok', { text: 'RE-26-4712' }), pz(a, 'v7', 'zahlungseinladung', 'ok', null),
            pz(a, 'v7', 'lief_rechnung', 'ok', { auswahl: 'Liegt vor (mit Einladung)' }), pz(a, 'a1_lieferant', 'rechnung_geprueft', 'ok', null)].concat(ML(a, false));
        },
        zahlung: { kd_geldeingang: 'nein', kd_zahlart: ['Finanzierung SCB'], kd_finanzierung_betrag: 28500, inzahlung: false },
        einkauf: { lieferant: 'Beispiel Fahrzeughandel KG', lief_rg_nr: 'L-2026-0902', lief_rg_datum: tag(-10), lief_rg_betrag_brutto: 24900, ek_netto: 20924.37, lief_fzg_bezahlt: true, lief_rg_bezahlt_datum: tag(-5),
          ek_finanzierung: true, ek_finanzierung_betrag: 22000, ek_finanzierung_geldeingang_datum: tag(-9), ek_finanzierung_abloese_datum: tag(-4), transportstatus: '5 im Haus' }
      },
      {   // 3: Barzahlung, nichts abgehakt – in der Demo komplett abhakbar (Kunde und Lieferant grün)
        fid: 'ST-26-9003',
        akte: Object.assign({}, basisAkte, { id: id3, interne_nr: '90203', autrado_nr: '900203', fin: 'DEMO0000000009003', hersteller: 'Opel', modell: 'Mokka Demo Edition (A1)', farbe: 'Rot',
          kunde_name: 'Probe, Peter', kunde_email: 'peter.probe@demo.example', verkaeufer: 'AI', bestell_nr: '2611-9003', uebergabe_termin: tag(1), fahrzeug_id: 'ST-26-9003', vk_preis: 18900 }),
        punkte: function (a) {
          return [pz(a, 'v2', 'finanzierung', 'ok', { auswahl: 'Nein' }), pz(a, 'v2', 'inzahlung', 'ok', { auswahl: 'Nein' }), pz(a, 'v5', 'zahlungsart', 'ok', { auswahl: 'Bar' }),
            pz(a, 'v5', 'anzahlung', 'entfaellt', null, 'Keine Anzahlung vereinbart')].concat(ML(a, false));
        },
        zahlung: { kd_geldeingang: 'nein', kd_zahlart: ['Bar'], inzahlung: false },
        einkauf: { lieferant: 'Demo-Autohaus Nord GmbH', lief_rg_nr: 'L-2026-0950', lief_rg_datum: tag(-6), lief_rg_betrag_brutto: 15900, ek_netto: 13361.34, lief_fzg_bezahlt: true, lief_rg_bezahlt_datum: tag(-3),
          ek_finanzierung: false, transportstatus: '5 im Haus' }
      }
    ];
  }
  async function demoSeed() {
    if (!EG.demo || S.demoFertig) return;
    S.demoFertig = true;
    try {
      var ak = chk(await T.akte().select('*')).data || [];
      var defs = demoDefinition();
      for (var i = 0; i < defs.length; i++) {
        var d = defs[i], a = ak.filter(function (x) { return x.fahrzeug_id === d.fid; })[0];
        if (!a) { chk(await T.akte().insert(d.akte)); a = d.akte; ak.push(a); }
        var vorh = chk(await T.punkt().select('*').eq('akte_id', a.id)).data || [], hat = {};
        vorh.forEach(function (r) { hat[r.phase + '.' + r.punkt_key] = 1; });
        var neu = d.punkte(a.id).filter(function (r) { return !hat[r.phase + '.' + r.punkt_key]; });
        if (neu.length) chk(await T.punkt().insert(neu));
        var zr = chk(await T.zahlung().select('*').eq('fahrzeug_id', d.fid)).data || [];
        if (!zr.length) chk(await T.zahlung().insert(Object.assign({ fahrzeug_id: d.fid, kd_zahlart: [], inzahlung: false }, d.zahlung)));
        var er = chk(await T.einkauf().select('*').eq('fahrzeug_id', d.fid)).data || [];
        if (!er.length) chk(await T.einkauf().insert(Object.assign({ fahrzeug_id: d.fid }, d.einkauf)));
      }
    } catch (err) { console.warn('Demo-Daten Zahlungen konnten nicht angelegt werden:', err); }
  }
})();
