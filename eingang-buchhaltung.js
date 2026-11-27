/* Stieber-App – Reiter „Buchhaltung“ (Plan Dispo und Zahlungen v2, E2 + E3)                  Stand 27.11.2026 v1.0 (Testversion)
   Sichtbar für admin, buchhaltung, dispo (Rollenliste in eingang.html, Lesesperre in der Datenbank).

   Aufbau
   - Oben sechs Kacheln = Tagesbericht: A Lieferanten bezahlen · B Kundenrechnung offen · C Kundenrechnung fehlt ·
     Kundenfinanzierung offen · Einfinanzieren · Ablösen (Netting). Klick springt zum Teil.
   - „Aufgaben der Buchhaltung“: offene Laufzettel-Aufgaben der Abteilung buchhaltung mit Übernehmen / Erledigt / Entfällt
     (RPCs laufzettel.uebernehmen / erledigen / entfaellt, die Datenbank prüft die Rechte).
   - Vier Teile mit den Spalten der Masterliste: 1 Lieferanten bezahlen · 2 Kundenzahlungen · 3 Kundenfinanzierung Openbank ·
     4 Einfinanzierung Openbank.
   Quellen (nur lesen): bestand.fahrzeug, bestand.einkauf, bestand.zahlung, bestand.v_kennzahlen (Kd-Gesamtzahlung = offener Rest),
   verkauf.akte (Kunde, Übergabe), laufzettel.v_meine_aufgaben.
   Ändern: Knopf „Bearbeiten“ → window.EG_FZ.felderBearbeiten (eingang-fahrzeuge.js) = Edge Function bestand_schreiben:
   erst Masterliste, dann Import. Hier gibt es keine eigene Schreiblogik.
   „Aktuell“ blendet Altfälle aus: ausgeliefert und Auslieferung älter als 60 Tage (oder ohne Datum). „Alle“ zeigt sie mit.
   Demo (?demo=1): erfundene Fahrzeuge ST-26-98xx, nichts verlässt die Seite. Baut auf window.EG (eingang-core.js) auf. */
(function () {
  'use strict';
  var EG = window.EG, h = EG && EG.h;
  if (!EG) return;

  var ROLLEN = ['admin', 'buchhaltung', 'dispo'];
  var FINZ_WERT = 'Finanzierung SCB';          // Wahlwert in Kd-Zahlart (soll später „Finanzierung Openbank“ heißen)
  var FRIST_BANK_TAGE = 10;                    // Oli 27.11.2026: Bank-Auszahlung 10 Tage nach Auslieferung
  var ALTFALL_TAGE = 60;
  var S = { root: null, laedt: false, x: [], aufgaben: [], filter: 'aktuell', suche: '', boxen: {} };

  EG.onTab('buchhaltung', function (root) { S.root = root; return laden(); });

  /* ---------- Stil (Präfix bh-), einmalig ---------- */
  (function stil() {
    if (document.getElementById('bh-stil')) return;
    var st = document.createElement('style'); st.id = 'bh-stil';
    st.textContent = [
      '.bh-kacheln{display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:10px;margin:6px 0 16px}',
      '.bh-kachel{text-align:left;background:#fff;border:1px solid var(--border);border-left:6px solid var(--blau);border-radius:14px;padding:10px 12px;cursor:pointer;font-family:var(--font-body);color:var(--ink);box-shadow:var(--schatten)}',
      '.bh-kachel:hover{border-color:var(--blau)}',
      '.bh-kachel.rot{border-left-color:var(--rot)}',
      '.bh-kachel.gruen{border-left-color:var(--gruen)}',
      '.bh-kachel .bh-k-titel{display:block;font-size:14px;font-weight:700;color:var(--sub)}',
      '.bh-kachel .bh-k-zahl{display:block;font-family:var(--font-heading);font-size:28px;font-weight:800;line-height:1.2}',
      '.bh-kachel .bh-k-sub{display:block;font-size:13px;color:var(--sub)}',
      '.bh-kachel .bh-k-rot{display:block;font-size:13px;font-weight:700;color:var(--rot-text)}',
      '.bh-teil{margin-top:18px}',
      '.bh-teil > h2{display:flex;align-items:center;gap:10px;flex-wrap:wrap}',
      '.bh-teil h3{font-size:16px;margin:14px 0 6px;color:var(--blau-dark)}',
      '.bh-hinweis{font-size:14px;color:var(--sub);margin:2px 0 8px}',
      '.bh-scroll{overflow-x:auto;-webkit-overflow-scrolling:touch}',
      '.bh-tab{width:100%;border-collapse:collapse;font-size:14px;min-width:720px}',
      '.bh-tab th{text-align:left;font-size:13px;color:var(--sub);font-weight:700;border-bottom:2px solid var(--border);padding:6px 8px;white-space:nowrap}',
      '.bh-tab td{border-bottom:1px solid var(--border);padding:7px 8px;vertical-align:top}',
      '.bh-tab tr.rot td{background:var(--rot-bg)}',
      '.bh-tab td.zahl{text-align:right;white-space:nowrap;font-variant-numeric:tabular-nums}',
      '.bh-tab .bh-fz{font-weight:700}',
      '.bh-tab .bh-sub{display:block;font-size:12px;color:var(--sub)}',
      '.bh-tab .pill{font-size:12px;padding:2px 8px}',
      '.bh-knoepfe{display:flex;gap:6px;flex-wrap:wrap}',
      '.bh-knoepfe .btn{min-height:36px;padding:0 10px;font-size:13px}',
      '.bh-summe td{font-weight:700;border-bottom:none}',
      '.bh-alt{font-size:13px;color:var(--sub);margin:6px 0 0}',
      '.bh-aufg{display:grid;gap:8px}',
      '.bh-aufg .karte{margin:0;padding:10px 12px}',
      '.bh-aufg .karte.rot{border-color:var(--rot)}'
    ].join(' ');
    document.head.appendChild(st);
  })();

  /* ---------- kleine Helfer ---------- */
  function chk(r) { if (r && r.error) throw r.error; return r; }
  function num(v) { if (v == null || v === '') return null; var n = Number(v); return isFinite(n) ? n : null; }
  function eur(n) { return n == null ? '' : Number(n).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €'; }
  function eur0(n) { return Number(n || 0).toLocaleString('de-DE', { maximumFractionDigits: 0 }) + ' €'; }
  function dat(s) { return s ? EG.fmtDatum(s) : ''; }
  function plusTage(s, n) { var d = EG.parseDatum(s); if (!d) return null; d.setDate(d.getDate() + n); return EG.isoDatum(d); }
  function heute() { return EG.heute(); }
  function idx(rows, k) { var m = {}; (rows || []).forEach(function (r) { if (r && r[k] != null) m[r[k]] = r; }); return m; }
  function summe(l, fn) { return l.reduce(function (s, x) { return s + (num(fn(x)) || 0); }, 0); }
  function darf() { return ROLLEN.indexOf(EG.rolle) >= 0; }

  /* ====================================================================
     Laden und aufbereiten
     ==================================================================== */
  async function laden() {
    if (S.laedt) return;
    if (!darf()) { S.root.innerHTML = ''; S.root.appendChild(EG.banner('Dieser Reiter ist nur für OS, Buchhaltung und Dispo.', 'info')); return; }
    S.laedt = true;
    S.root.innerHTML = '';
    S.root.appendChild(h('p', { class: 'muted', text: 'Lade Zahlen aus der Masterliste …' }));
    try {
      if (EG.demo) await demoSaen();
      var r = await Promise.all([
        EG.tab('bestand', 'fahrzeug').select('stieber_id,interne_nr,hersteller,modell,fin,fahrzeugstatus,auslieferungstermin,ml_kunde_art'),
        EG.tab('bestand', 'einkauf').select('*'),
        EG.tab('bestand', 'zahlung').select('*'),
        EG.tab('bestand', 'v_kennzahlen').select('stieber_id,akte_id,kd_ges_zahlbetrag,kd_gesamtzahlung'),
        EG.tab('verkauf', 'akte').select('id,fahrzeug_id,interne_nr,kunde_name,uebergabe_termin,phase_aktuell,vk_preis,kd_zusatz_rg,kd_zusatz_rg_datum,kd_fzg_rg_datum,created_at'),
        EG.tab('laufzettel', 'v_meine_aufgaben').select('*').eq('abteilung', 'buchhaltung').order('frist', { ascending: true })
      ]);
      r.forEach(chk);
      S.x = vorbereiten(r[0].data, r[1].data, r[2].data, r[3].data, r[4].data);
      S.aufgaben = r[5].data || [];
      zeichnen();
    } catch (e) {
      console.error(e);
      S.root.innerHTML = '';
      S.root.appendChild(EG.banner([h('strong', { text: 'Die Zahlen konnten nicht geladen werden. ' }), (e && (e.message || e.details)) || String(e)], 'fehler'));
      S.root.appendChild(h('button', { type: 'button', class: 'btn btn-ghost', text: 'Erneut versuchen', onclick: function () { laden().catch(EG.fehler); } }));
    } finally { S.laedt = false; }
  }

  /** Ein Objekt je Fahrzeug mit allem, was die vier Teile brauchen. */
  function vorbereiten(fz, ek, za, kz, ak) {
    var E = idx(ek, 'fahrzeug_id'), Z = idx(za, 'fahrzeug_id'), A = {}, K = {};
    (ak || []).forEach(function (a) {
      if (!a.fahrzeug_id || a.phase_aktuell === 'abgebrochen') return;
      var alt = A[a.fahrzeug_id];
      if (!alt || String(a.created_at || '') > String(alt.created_at || '')) A[a.fahrzeug_id] = a;
    });
    (kz || []).forEach(function (k) {
      var a = A[k.stieber_id];
      if (!K[k.stieber_id] || (a && k.akte_id === a.id)) K[k.stieber_id] = k;
    });
    var grenzeAlt = plusTage(heute(), -ALTFALL_TAGE);
    return (fz || []).map(function (f) {
      var e = E[f.stieber_id] || {}, z = Z[f.stieber_id] || {}, a = A[f.stieber_id] || null, k = K[f.stieber_id] || {};
      var lager = f.ml_kunde_art === 'stieber';
      var ausg = f.fahrzeugstatus === 'ausgeliefert';
      var ausl = f.auslieferungstermin || (a && a.uebergabe_termin) || null;
      return {
        sid: f.stieber_id, nr: f.interne_nr || '', titel: [f.hersteller, f.modell].filter(Boolean).join(' ') || 'Fahrzeug',
        kunde: (a && a.kunde_name) || (lager ? 'Stieber (Lager)' : ''), lager: lager, status: f.fahrzeugstatus || '',
        ausg: ausg, ausl: ausl, uebergabe: (a && a.uebergabe_termin) || f.auslieferungstermin || null,
        akteId: a ? a.id : null, a: a, e: e, z: z,
        rest: a ? num(k.kd_gesamtzahlung) : null, soll: a ? num(k.kd_ges_zahlbetrag) : null,
        rgFzg: z.ml_kd_rg_datum || (a && a.kd_fzg_rg_datum) || null,
        rgZusatz: (a && a.kd_zusatz_rg_datum) || null,
        zusatz: a ? num(a.kd_zusatz_rg) : null,
        finanziert: Array.isArray(z.kd_zahlart) && z.kd_zahlart.indexOf(FINZ_WERT) >= 0,
        alt: ausg && (!ausl || ausl < grenzeAlt)
      };
    });
  }

  /* ---------- die Listen (Regeln aus dem Plan v2, Abschnitte 3 und 5) ---------- */
  var LISTEN = {
    A: function (x) { return !!x.e.lief_rg_nr && !x.e.lief_fzg_bezahlt; },
    B: function (x) { return !!(x.rgFzg || x.rgZusatz) && x.rest != null && x.rest > 0.5; },
    C: function (x) { return !!x.e.lief_rg_datum && !x.lager && !x.rgFzg; },
    F: function (x) { return x.finanziert && !x.z.kd_finanzierung_datum; },
    D: function (x) { return !!x.e.papiere_eingang_ahs && !x.e.ek_finanzierung && !x.e.ek_finanzierung_datum && !x.ausg; },
    E: function (x) { return !!(x.e.ek_finanzierung || x.e.ek_finanzierung_datum) && !x.e.ek_finanzierung_abloese_datum && !x.z.netting_datum; }
  };
  var ROT = {
    A: function (x) { return !!x.e.lief_rg_faellig && x.e.lief_rg_faellig < heute(); },
    B: function (x) { return !!x.uebergabe && !x.ausg && x.uebergabe <= EG.plusWerktage(heute(), 3); },
    C: function (x) { return !!x.uebergabe && x.uebergabe <= EG.plusWerktage(heute(), 3); },
    F: function (x) { return x.ausg && !!x.ausl && plusTage(x.ausl, FRIST_BANK_TAGE) < heute(); },
    D: function (x) { return EG.werktageSeit(x.e.papiere_eingang_ahs) >= 2; },
    E: function (x) { return !x.lager && x.rest != null && x.rest <= 0.5; }
  };
  function passtSuche(x) {
    var q = S.suche.trim().toLowerCase();
    if (!q) return true;
    return [x.nr, x.kunde, x.titel, x.e.lieferant, x.e.lief_rg_nr, x.sid].join(' ').toLowerCase().indexOf(q) >= 0;
  }
  /** → { zeilen (gefiltert), alt (ausgeblendete Altfälle), rot } */
  function liste(k) {
    var alle = S.x.filter(LISTEN[k]).filter(passtSuche);
    var zeilen = S.filter === 'alle' ? alle : alle.filter(function (x) { return !x.alt; });
    zeilen.forEach(function (x) { x['rot' + k] = ROT[k](x); });
    return { zeilen: zeilen, alt: alle.length - zeilen.length, rot: zeilen.filter(function (x) { return x['rot' + k]; }).length };
  }

  /* ====================================================================
     Zeichnen
     ==================================================================== */
  function zeichnen() {
    var root = S.root; root.innerHTML = '';
    var L = { A: liste('A'), B: liste('B'), C: liste('C'), F: liste('F'), D: liste('D'), E: liste('E') };
    L.A.zeilen.sort(function (a, b) { return String(a.e.lief_rg_faellig || '9999') < String(b.e.lief_rg_faellig || '9999') ? -1 : 1; });
    L.B.zeilen.sort(function (a, b) { return String(a.uebergabe || '9999') < String(b.uebergabe || '9999') ? -1 : 1; });
    L.C.zeilen.sort(function (a, b) { return String(a.uebergabe || '9999') < String(b.uebergabe || '9999') ? -1 : 1; });
    L.F.zeilen.sort(function (a, b) { return (b.rotF ? 1 : 0) - (a.rotF ? 1 : 0) || (String(a.ausl || '9999') < String(b.ausl || '9999') ? -1 : 1); });
    L.D.zeilen.sort(function (a, b) { return String(a.e.papiere_eingang_ahs) < String(b.e.papiere_eingang_ahs) ? -1 : 1; });
    L.E.zeilen.sort(function (a, b) { return (b.rotE ? 1 : 0) - (a.rotE ? 1 : 0) || (String(a.e.ek_finanzierung_datum || '') < String(b.e.ek_finanzierung_datum || '') ? -1 : 1); });

    // Kopf: Filter, Suche, Aktualisieren
    var chips = h('div', { class: 'chips' },
      h('button', { type: 'button', class: 'chip', 'aria-pressed': S.filter === 'aktuell' ? 'true' : 'false', text: 'Aktuell', onclick: function () { S.filter = 'aktuell'; zeichnen(); } }),
      h('button', { type: 'button', class: 'chip', 'aria-pressed': S.filter === 'alle' ? 'true' : 'false', text: 'Alle (mit Altfällen)', onclick: function () { S.filter = 'alle'; zeichnen(); } }));
    var such = h('input', { type: 'search', placeholder: 'Suche: Nr., Kunde, Modell, Lieferant', value: S.suche, style: 'min-height:44px;flex:1;min-width:200px;padding:0 12px;border:2px solid var(--border);border-radius:12px;font-size:15px' });
    such.addEventListener('input', function () { S.suche = such.value; clearTimeout(such._t); such._t = setTimeout(function () { zeichnen(); var n = S.root.querySelector('input[type=search]'); if (n) { n.focus(); n.setSelectionRange(n.value.length, n.value.length); } }, 300); });
    root.appendChild(h('div', { class: 'leiste' }, h('div', { class: 'leiste-zeile', style: 'gap:10px;flex-wrap:wrap' }, chips, such,
      h('button', { type: 'button', class: 'btn btn-ghost', text: 'Aktualisieren', onclick: function () { laden().catch(EG.fehler); } }))));
    if (EG.demo) root.appendChild(EG.banner('Demo: erfundene Fahrzeuge. „Bearbeiten“ ändert nur diese Seite.', 'info'));

    // Kacheln (Tagesbericht)
    root.appendChild(h('h2', { text: 'Tagesbericht ' + dat(heute()), style: 'margin-top:6px' }));
    var k = h('div', { class: 'bh-kacheln' });
    k.appendChild(kachel('A Lieferanten bezahlen', L.A, eur0(summe(L.A.zeilen, function (x) { return x.e.lief_rg_betrag_brutto; })), 'überfällig', 'bh-t1'));
    k.appendChild(kachel('B Kundenrechnung offen', L.B, 'Rest ' + eur0(summe(L.B.zeilen, function (x) { return x.rest; })), 'Übergabe ≤ 3 Werktage', 'bh-t2'));
    k.appendChild(kachel('C Kundenrechnung fehlt', L.C, 'Lieferantenrechnung ist da', 'Übergabe ≤ 3 Werktage', 'bh-t2c'));
    k.appendChild(kachel('Kundenfinanzierung offen', L.F, eur0(summe(L.F.zeilen, function (x) { return x.z.kd_finanzierung_betrag; })), 'über ' + FRIST_BANK_TAGE + ' Tage', 'bh-t3'));
    k.appendChild(kachel('Einfinanzieren', L.D, 'Papiere da', 'seit ≥ 2 Werktagen', 'bh-t4'));
    k.appendChild(kachel('Ablösen (Netting)', L.E, eur0(summe(L.E.zeilen, function (x) { return x.e.ek_finanzierung_betrag; })), 'Kunde voll bezahlt', 'bh-t4b'));
    root.appendChild(k);

    root.appendChild(aufgabenBox());
    root.appendChild(teil1(L.A));
    root.appendChild(teil2(L.B, L.C));
    root.appendChild(teil3(L.F));
    root.appendChild(teil4(L.D, L.E));
    zaehlerSetzen(L);
  }

  function kachel(titel, l, sub, rotText, ziel) {
    var b = h('button', { type: 'button', class: 'bh-kachel' + (l.rot ? ' rot' : l.zeilen.length ? '' : ' gruen'),
      onclick: function () { var t = document.getElementById(ziel); if (t) t.scrollIntoView({ behavior: 'smooth', block: 'start' }); } },
      h('span', { class: 'bh-k-titel', text: titel }),
      h('span', { class: 'bh-k-zahl', text: String(l.zeilen.length) }),
      h('span', { class: 'bh-k-sub', text: l.zeilen.length ? sub : 'nichts offen' }));
    if (l.rot) b.appendChild(h('span', { class: 'bh-k-rot', text: l.rot + ' × ' + rotText }));
    return b;
  }

  function zaehlerSetzen(L) {
    var knopf = document.getElementById('tabk-buchhaltung');
    if (!knopf) return;
    var rot = L.A.rot + L.B.rot + L.F.rot + L.E.rot + S.aufgaben.filter(function (a) { return a.frist && a.frist < heute(); }).length;
    knopf.textContent = 'Buchhaltung' + (rot ? ' (' + rot + ')' : '');
    knopf.classList.toggle('hat-rot', rot > 0);
  }

  /* ---------- Aufgaben der Buchhaltung (Laufzettel) ---------- */
  var ABT_NAME = 'Buchhaltung';
  function aufgabenBox() {
    var box = h('section', { class: 'karte bh-teil', id: 'bh-aufg' }, h('h2', { text: 'Aufgaben der Buchhaltung (' + S.aufgaben.length + ')' }));
    if (!S.aufgaben.length) { box.appendChild(h('p', { class: 'muted', text: 'Gerade liegt für die Buchhaltung nichts an.' })); return box; }
    var l = h('div', { class: 'bh-aufg' });
    S.aufgaben.forEach(function (a) {
      var rot = a.frist && a.frist < heute(), heuteF = a.frist === heute();
      var kn = h('div', { class: 'bh-knoepfe', style: 'margin-top:6px' });
      if (a.meine) {
        if (a.status === 'offen') kn.appendChild(h('button', { type: 'button', class: 'btn btn-ghost', text: 'Übernehmen', onclick: function () { aufgabeAktion(a, 'uebernehmen'); } }));
        kn.appendChild(h('button', { type: 'button', class: 'btn', text: 'Erledigt', onclick: function () { aufgabeAktion(a, 'erledigen'); } }));
        kn.appendChild(h('button', { type: 'button', class: 'btn btn-ghost', text: 'Entfällt …', onclick: function () { aufgabeAktion(a, 'entfaellt'); } }));
      }
      l.appendChild(h('div', { class: 'karte' + (rot ? ' rot' : '') },
        h('div', { class: 'karte-kopf' }, h('strong', { text: a.titel }),
          EG.pill(a.frist ? 'bis ' + dat(a.frist) : 'ohne Frist', rot ? 'rot' : heuteF ? 'gold' : 'gruen')),
        h('div', { class: 'klein muted', text: ['Nr. ' + (a.interne_nr || '?'), [a.hersteller, a.modell].filter(Boolean).join(' '), ABT_NAME,
          a.status === 'uebernommen' ? 'übernommen: ' + (a.uebernommen_von_name || '?') : ''].filter(Boolean).join(' · ') }),
        kn));
    });
    box.appendChild(l);
    return box;
  }
  async function aufgabeAktion(a, art) {
    var grund = null;
    if (art === 'entfaellt') {
      grund = await EG.eingabe('Warum entfällt „' + a.titel + '“?', { titel: 'Entfällt', ok: 'Speichern' });
      if (!grund || !String(grund).trim()) return;
    }
    try {
      if (EG.demo) {
        if (art === 'uebernehmen') chk(await EG.tab('laufzettel', 'v_meine_aufgaben').update({ status: 'uebernommen', uebernommen_von_name: EG.nutzerName() || 'Demo' }).eq('id', a.id));
        else chk(await EG.tab('laufzettel', 'v_meine_aufgaben').delete().eq('id', a.id));
      } else {
        var p = { p_id: a.id, p_name: EG.nutzerName() || null };
        if (art === 'entfaellt') p.p_grund = grund;
        chk(await EG.sb.schema('laufzettel').rpc(art, p));
      }
      EG.toast(art === 'uebernehmen' ? 'Übernommen.' : art === 'erledigen' ? 'Erledigt.' : 'Als entfällt markiert.', 'ok');
      await laden();
    } catch (e) { EG.toast('Nicht gespeichert: ' + ((e && e.message) || e), 'fehler'); }
  }

  /* ---------- Bausteine für die Tabellen ---------- */
  function fzZelle(x) {
    return h('td', {}, h('span', { class: 'bh-fz', text: (x.nr || x.sid) + ' ' }), h('span', { class: 'bh-sub', text: x.titel }));
  }
  function kundeZelle(x) {
    return h('td', {}, x.kunde || '–', x.status ? h('span', { class: 'bh-sub', text: x.status }) : null);
  }
  function zahlZelle(n) { return h('td', { class: 'zahl', text: n == null ? '–' : eur(n) }); }
  function textZelle(t, sub) { return h('td', {}, t || '–', sub ? h('span', { class: 'bh-sub', text: sub }) : null); }
  function pillZelle(text, art) { return h('td', {}, text ? EG.pill(text, art) : '–'); }
  function knopfZelle(x, felder, titel) {
    var kn = h('div', { class: 'bh-knoepfe' });
    if (window.EG_FZ && window.EG_FZ.felderBearbeiten) {
      kn.appendChild(h('button', { type: 'button', class: 'btn btn-ghost', text: 'Bearbeiten', onclick: function () { bearbeiten(x, felder, titel).catch(EG.fehler); } }));
    }
    if (x.akteId && window.VK_ZAHLUNGEN) kn.appendChild(h('button', { type: 'button', class: 'btn btn-ghost', text: 'Akte', title: 'Im Reiter Zahlungen öffnen', onclick: function () { window.VK_ZAHLUNGEN.oeffne(x.akteId); } }));
    return h('td', {}, kn);
  }
  function tabelle(koepfe, zeilen, zeileFn, summeZeile) {
    var tb = h('tbody');
    zeilen.forEach(function (x) { tb.appendChild(zeileFn(x)); });
    if (summeZeile) tb.appendChild(summeZeile);
    return h('div', { class: 'bh-scroll' }, h('table', { class: 'bh-tab' },
      h('thead', {}, h('tr', {}, koepfe.map(function (t) { return h('th', { text: t }); }))), tb));
  }
  function teilKopf(id, titel, l, hinweis) {
    var s = h('section', { class: 'karte bh-teil', id: id },
      h('h2', {}, titel, EG.pill(l.zeilen.length + ' offen', l.zeilen.length ? 'blau' : 'gruen'), l.rot ? EG.pill(l.rot + ' rot', 'rot') : null));
    if (hinweis) s.appendChild(h('p', { class: 'bh-hinweis', text: hinweis }));
    return s;
  }
  function altHinweis(l) {
    return l.alt ? h('p', { class: 'bh-alt', text: l.alt + ' Altfall' + (l.alt === 1 ? '' : 'e') + ' ausgeblendet (ausgeliefert vor mehr als ' + ALTFALL_TAGE + ' Tagen) – „Alle (mit Altfällen)“ zeigt sie.' }) : null;
  }
  function leerZeile(t) { return h('p', { class: 'muted', text: t }); }

  /* ---------- Teil 1 – Lieferanten bezahlen ---------- */
  var F1 = ['#Lieferantenrechnung', 'Rechnung_x002d_Lieferant', 'Rg_x002d_Datum', 'Lief_x002d_Rg_x002d_Betr_x002d_b', 'LiefRgFaellig', '#Bezahlt', 'Fahrzeugbezahlt', 'Lief_x002d_Rg_x002d_bezahlt'];
  function teil1(l) {
    var s = teilKopf('bh-t1', '1 · Lieferanten bezahlen', l, 'Lieferantenrechnung ist da, „Lief-Fzg bezahlt“ noch nicht gesetzt. Sortiert nach „Lief-Rg-fällig“. Rot = Fälligkeit überschritten.');
    if (!l.zeilen.length) s.appendChild(leerZeile('Keine offene Lieferantenrechnung.'));
    else s.appendChild(tabelle(['Fahrzeug', 'Lieferant', 'Lief-Rg-Nr / -Datum', 'Lief-Rg-Betr-brutto', 'Lief-Rg-fällig', 'Kunde', ''], l.zeilen, function (x) {
      var f = x.e.lief_rg_faellig, bald = f && !x.rotA && f <= plusTage(heute(), 2);
      return h('tr', { class: x.rotA ? 'rot' : '' }, fzZelle(x), textZelle(x.e.lieferant, x.e.lief_best_nr ? 'Best.-Nr. ' + x.e.lief_best_nr : ''),
        textZelle(x.e.lief_rg_nr, dat(x.e.lief_rg_datum)), zahlZelle(num(x.e.lief_rg_betrag_brutto)),
        pillZelle(f ? dat(f) : 'ohne Datum', x.rotA ? 'rot' : bald ? 'gold' : f ? 'gruen' : 'grau'), kundeZelle(x), knopfZelle(x, F1, 'Lieferant bezahlen'));
    }, h('tr', { class: 'bh-summe' }, h('td', { text: 'Summe' }), h('td'), h('td'), zahlZelle(summe(l.zeilen, function (x) { return x.e.lief_rg_betrag_brutto; })), h('td'), h('td'), h('td'))));
    var alt = altHinweis(l); if (alt) s.appendChild(alt);
    return s;
  }

  /* ---------- Teil 2 – Kundenzahlungen ---------- */
  var F2 = ['#Rechnung an den Kunden', 'Kd_x002d_Fzg_x002d_Rg_x002d_Datu', 'KdFzgRgNr', 'Zusatzrechnung', 'KdZusatzRgDatum', 'KdZusatzRgNr', '#Geldeingang', 'Fertig'];
  function teil2(lb, lc) {
    var s = h('section', { class: 'karte bh-teil', id: 'bh-t2' },
      h('h2', {}, '2 · Kundenzahlungen', EG.pill((lb.zeilen.length + lc.zeilen.length) + ' offen', (lb.zeilen.length + lc.zeilen.length) ? 'blau' : 'gruen'),
        (lb.rot + lc.rot) ? EG.pill((lb.rot + lc.rot) + ' rot', 'rot') : null));
    s.appendChild(h('h3', { text: 'B – Rechnung geschrieben, Geld noch nicht (ganz) da (' + lb.zeilen.length + ')' }));
    s.appendChild(h('p', { class: 'bh-hinweis', text: 'Offener Rest = Kd-Gesamtzahlung der Masterliste (Preis + Zusatz − Zahlungen − Finanzierung − Inzahlungnahme + Ablöse). Rot = Übergabe in höchstens 3 Werktagen.' }));
    if (!lb.zeilen.length) s.appendChild(leerZeile('Keine offene Kundenrechnung.'));
    else s.appendChild(tabelle(['Fahrzeug', 'Kunde', 'Kd-Fzg-Rg', 'Kd-Zusatz-Rg', 'Soll', 'Offener Rest', 'Übergabe', ''], lb.zeilen, function (x) {
      return h('tr', { class: x.rotB ? 'rot' : '' }, fzZelle(x), kundeZelle(x),
        textZelle(x.z.kd_fzg_rg_nr || (x.rgFzg ? 'ohne Nr.' : ''), dat(x.rgFzg)),
        textZelle(x.zusatz ? eur(x.zusatz) : '', [x.z.kd_zusatz_rg_nr, dat(x.rgZusatz)].filter(Boolean).join(' · ')),
        zahlZelle(x.soll), zahlZelle(x.rest), pillZelle(dat(x.uebergabe), x.rotB ? 'rot' : 'grau'), knopfZelle(x, F2, 'Kundenzahlung'));
    }, h('tr', { class: 'bh-summe' }, h('td', { text: 'Summe' }), h('td'), h('td'), h('td'), h('td'), zahlZelle(summe(lb.zeilen, function (x) { return x.rest; })), h('td'), h('td'))));
    var a1 = altHinweis(lb); if (a1) s.appendChild(a1);

    s.appendChild(h('h3', { id: 'bh-t2c', text: 'C – Lieferantenrechnung da, aber noch keine Rechnung an den Kunden (' + lc.zeilen.length + ')' }));
    s.appendChild(h('p', { class: 'bh-hinweis', text: 'Lief-Rg-Datum gesetzt, Kunde ist nicht Stieber, Kd-Fzg-Rg-Datum leer. Die Fahrzeugrechnung schreibt die Dispo (Celine) in Repdoc.' }));
    if (!lc.zeilen.length) s.appendChild(leerZeile('Bei allen Fahrzeugen mit Lieferantenrechnung ist die Kundenrechnung geschrieben.'));
    else s.appendChild(tabelle(['Fahrzeug', 'Kunde', 'Lieferantenrechnung', 'Kd-Fzg-VK Preis', 'Übergabe', ''], lc.zeilen, function (x) {
      return h('tr', { class: x.rotC ? 'rot' : '' }, fzZelle(x), kundeZelle(x), textZelle(x.e.lieferant, [x.e.lief_rg_nr, dat(x.e.lief_rg_datum)].filter(Boolean).join(' · ')),
        zahlZelle(x.a ? num(x.a.vk_preis) : num(x.z.ml_vk_preis)), pillZelle(dat(x.uebergabe) || 'offen', x.rotC ? 'rot' : 'grau'), knopfZelle(x, F2, 'Kundenrechnung'));
    }));
    var a2 = altHinweis(lc); if (a2) s.appendChild(a2);
    return s;
  }

  /* ---------- Teil 3 – Kundenfinanzierung Openbank ---------- */
  var F3 = ['#Kundenfinanzierung Openbank', 'KdFinzStatus', 'KdFinzVertragsnr', 'Kd_x002d_Finz', 'Kd_x002d_Finz_x002d_Datum', '#Netting', 'Netting', 'Netting_x002d_Datum'];
  function teil3(l) {
    var s = teilKopf('bh-t3', '3 · Kundenfinanzierung Openbank', l, 'Kd-Zahlart „' + FINZ_WERT + '“, „Kd-Finz-Dat“ (Auszahlung) noch leer. Die Bank zahlt nach der Auslieferung; rot = mehr als ' + FRIST_BANK_TAGE + ' Tage nach Auslieferung und noch nicht ausgezahlt.');
    if (!l.zeilen.length) s.appendChild(leerZeile('Keine offene Kundenfinanzierung.'));
    else s.appendChild(tabelle(['Fahrzeug', 'Kunde', 'Kd-Finz-€', 'Kd-Finz-Status', 'Kd-Finz-Vertragsnr', 'Auslieferung', 'Frist Bank', ''], l.zeilen, function (x) {
      var frist = x.ausg && x.ausl ? plusTage(x.ausl, FRIST_BANK_TAGE) : null;
      return h('tr', { class: x.rotF ? 'rot' : '' }, fzZelle(x), kundeZelle(x), zahlZelle(num(x.z.kd_finanzierung_betrag)),
        pillZelle(x.z.kd_finanzierung_status || 'ohne Status', x.z.kd_finanzierung_status === 'ausgezahlt' ? 'gruen' : x.z.kd_finanzierung_status ? 'blau' : 'grau'),
        textZelle(x.z.kd_finanzierung_vertragsnr), textZelle(dat(x.ausl), x.ausg ? 'ausgeliefert' : 'geplant'),
        pillZelle(frist ? dat(frist) : 'nach Auslieferung', x.rotF ? 'rot' : 'grau'), knopfZelle(x, F3, 'Kundenfinanzierung'));
    }, h('tr', { class: 'bh-summe' }, h('td', { text: 'Summe' }), h('td'), zahlZelle(summe(l.zeilen, function (x) { return x.z.kd_finanzierung_betrag; })), h('td'), h('td'), h('td'), h('td'), h('td'))));
    var alt = altHinweis(l); if (alt) s.appendChild(alt);
    return s;
  }

  /* ---------- Teil 4 – Einfinanzierung Openbank ---------- */
  var F4 = ['#Einfinanzierung Openbank', 'PapiereEingangAHS', 'EK_x002d_Finanz', 'EK_x002d_Betrag', 'EK_x002d_Finz_x002d_Datum', 'EK_x002d_Geldeingang', 'EKFinzVertragsnr',
    '#Ablöse / Netting', 'DatumEK_x002d_Abl_x00f6_se', 'EKFinzAblBetrag', 'Netting_x002d_Datum'];
  function teil4(ld, le) {
    var s = h('section', { class: 'karte bh-teil', id: 'bh-t4' },
      h('h2', {}, '4 · Einfinanzierung Openbank', EG.pill((ld.zeilen.length + le.zeilen.length) + ' offen', (ld.zeilen.length + le.zeilen.length) ? 'blau' : 'gruen'),
        (ld.rot + le.rot) ? EG.pill((ld.rot + le.rot) + ' rot', 'rot') : null));
    s.appendChild(h('h3', { text: 'Einfinanzieren – Papiere sind da (' + ld.zeilen.length + ')' }));
    s.appendChild(h('p', { class: 'bh-hinweis', text: '„Papiere Eingang AHS“ gesetzt, „EK-Finz“ noch nicht. Gilt für alle Fahrzeuge; passt es nicht, wählt die Dispo bei der Aufgabe „entfällt“. Rot = Papiere seit 2 Werktagen da.' }));
    if (!ld.zeilen.length) s.appendChild(leerZeile('Kein Fahrzeug wartet aufs Einfinanzieren.'));
    else s.appendChild(tabelle(['Fahrzeug', 'Kunde', 'Papiere Eingang AHS', 'Lief-Rg-Betr-brutto', 'Lieferant', ''], ld.zeilen, function (x) {
      return h('tr', { class: x.rotD ? 'rot' : '' }, fzZelle(x), kundeZelle(x), pillZelle(dat(x.e.papiere_eingang_ahs), x.rotD ? 'rot' : 'gold'),
        zahlZelle(num(x.e.lief_rg_betrag_brutto)), textZelle(x.e.lieferant), knopfZelle(x, F4, 'Einfinanzierung'));
    }));
    var a1 = altHinweis(ld); if (a1) s.appendChild(a1);

    s.appendChild(h('h3', { id: 'bh-t4b', text: 'Einfinanziert – noch nicht abgelöst (' + le.zeilen.length + ')' }));
    s.appendChild(h('p', { class: 'bh-hinweis', text: 'Ist der Kunde voll bezahlt, wird per Netting mit der Openbank abgerechnet (Oli 27.11.2026). Rot = Kunde voll bezahlt, Ablöse fehlt. Erledigt mit „EK-Finz-Abl-Datum“ oder „Netting-Datum“.' }));
    if (!le.zeilen.length) s.appendChild(leerZeile('Keine offene Ablöse.'));
    else s.appendChild(tabelle(['Fahrzeug', 'Kunde', 'EK-Finz-€', 'EK-Finz-Datum', 'EK-Finz-Vertragsnr', 'Kunde offen', ''], le.zeilen, function (x) {
      return h('tr', { class: x.rotE ? 'rot' : '' }, fzZelle(x), kundeZelle(x), zahlZelle(num(x.e.ek_finanzierung_betrag)),
        textZelle(dat(x.e.ek_finanzierung_datum), x.e.ek_finanzierung_geldeingang_datum ? 'Geld da ' + dat(x.e.ek_finanzierung_geldeingang_datum) : ''),
        textZelle(x.e.ek_finanzierung_vertragsnr),
        x.lager ? textZelle('Lager') : x.rest == null ? textZelle('ohne Akte') : x.rotE ? pillZelle('voll bezahlt → Netting', 'rot') : zahlZelle(x.rest),
        knopfZelle(x, F4, 'Einfinanzierung / Ablöse'));
    }, h('tr', { class: 'bh-summe' }, h('td', { text: 'Summe' }), h('td'), zahlZelle(summe(le.zeilen, function (x) { return x.e.ek_finanzierung_betrag; })), h('td'), h('td'), h('td'), h('td'))));
    var a2 = altHinweis(le); if (a2) s.appendChild(a2);
    return s;
  }

  /* ---------- Bearbeiten (ein Weg für alle Reiter) ---------- */
  async function bearbeiten(x, felder, titel) {
    var r = await window.EG_FZ.felderBearbeiten(x.sid, felder, {
      titel: titel + ' – ' + (x.nr || x.sid) + ' ' + x.titel, vorgabe: EG.demo ? demoVorgabe(x) : null
    });
    if (!r || !r.gespeichert) return;
    if (r.demo) { demoUebernehmen(x, r.werte); zeichnen(); return; }
    await laden();
  }

  /* ====================================================================
     DEMO (?demo=1)
     ==================================================================== */
  var DEMO_SPALTE = {   // sp_intern → [Tabelle, Spalte, Art]
    Rechnung_x002d_Lieferant: ['e', 'lief_rg_nr'], Rg_x002d_Datum: ['e', 'lief_rg_datum', 'd'], Lief_x002d_Rg_x002d_Betr_x002d_b: ['e', 'lief_rg_betrag_brutto', 'n'],
    LiefRgFaellig: ['e', 'lief_rg_faellig', 'd'], Fahrzeugbezahlt: ['e', 'lief_fzg_bezahlt', 'b'], Lief_x002d_Rg_x002d_bezahlt: ['e', 'lief_rg_bezahlt_datum', 'd'],
    PapiereEingangAHS: ['e', 'papiere_eingang_ahs', 'd'], EK_x002d_Finanz: ['e', 'ek_finanzierung', 'b'], EK_x002d_Betrag: ['e', 'ek_finanzierung_betrag', 'n'],
    EK_x002d_Finz_x002d_Datum: ['e', 'ek_finanzierung_datum', 'd'], EK_x002d_Geldeingang: ['e', 'ek_finanzierung_geldeingang_datum', 'd'], EKFinzVertragsnr: ['e', 'ek_finanzierung_vertragsnr'],
    DatumEK_x002d_Abl_x00f6_se: ['e', 'ek_finanzierung_abloese_datum', 'd'], EKFinzAblBetrag: ['e', 'ek_finanzierung_abloese_betrag', 'n'],
    Kd_x002d_Fzg_x002d_Rg_x002d_Datu: ['z', 'ml_kd_rg_datum', 'd'], KdFzgRgNr: ['z', 'kd_fzg_rg_nr'], KdZusatzRgNr: ['z', 'kd_zusatz_rg_nr'], Fertig: ['z', 'kd_geldeingang'],
    KdFinzStatus: ['z', 'kd_finanzierung_status'], KdFinzVertragsnr: ['z', 'kd_finanzierung_vertragsnr'], Kd_x002d_Finz: ['z', 'kd_finanzierung_betrag', 'n'],
    Kd_x002d_Finz_x002d_Datum: ['z', 'kd_finanzierung_datum', 'd'], Netting: ['z', 'netting_betrag', 'n'], Netting_x002d_Datum: ['z', 'netting_datum', 'd'],
    Zusatzrechnung: ['a', 'kd_zusatz_rg', 'n'], KdZusatzRgDatum: ['a', 'kd_zusatz_rg_datum', 'd']
  };
  function demoVorgabe(x) {
    var v = {};
    Object.keys(DEMO_SPALTE).forEach(function (k) {
      var d = DEMO_SPALTE[k], quelle = d[0] === 'e' ? x.e : d[0] === 'z' ? x.z : (x.a || {}), w = quelle[d[1]];
      v[k] = d[2] === 'b' ? (w ? 'Ja' : w === false ? 'Nein' : '') : w;
    });
    return v;
  }
  function demoUebernehmen(x, werte) {
    Object.keys(werte || {}).forEach(function (k) {
      var d = DEMO_SPALTE[k]; if (!d) return;
      var w = werte[k];
      if (d[2] === 'b') w = /^(ja|true|1)$/i.test(String(w));
      else if (d[2] === 'n') w = num(String(w).replace(',', '.'));
      else if (d[2] === 'd') w = w ? String(w).slice(0, 10) : null;
      var quelle = d[0] === 'e' ? x.e : d[0] === 'z' ? x.z : x.a;
      if (quelle) quelle[d[1]] = w === '' ? null : w;
    });
  }
  var gesaet = false;
  async function demoSaen() {
    if (gesaet) return; gesaet = true;
    var t = function (n) { return plusTage(heute(), n); };
    var fz = [
      ['ST-26-9801', '98001', 'Opel', 'Corsa Demo', 'im Haus', 'kunde', t(5)],
      ['ST-26-9802', '98002', 'Hyundai', 'Tucson Demo', 'bestellt', 'kunde', t(2)],
      ['ST-26-9803', '98003', 'Kia', 'Sportage Demo', 'ausgeliefert', 'kunde', t(-14)],
      ['ST-26-9804', '98004', 'Nissan', 'Qashqai Demo', 'im Haus', 'stieber', null],
      ['ST-26-9805', '98005', 'Opel', 'Mokka Demo', 'fertig', 'kunde', t(1)]
    ];
    var ek = {
      'ST-26-9801': { lieferant: 'Demo-Lieferant', lief_best_nr: 'DEMO-01', lief_rg_nr: 'R-1001', lief_rg_datum: t(-3), lief_rg_faellig: t(4), lief_rg_betrag_brutto: 17497, lief_fzg_bezahlt: false, papiere_eingang_ahs: t(-4) },
      'ST-26-9802': { lieferant: 'Demo-Lieferant', lief_rg_nr: 'R-1002', lief_rg_datum: t(-12), lief_rg_faellig: t(-2), lief_rg_betrag_brutto: 26350, lief_fzg_bezahlt: false },
      'ST-26-9803': { lieferant: 'Beispiel KG', lief_rg_nr: 'R-0950', lief_rg_datum: t(-40), lief_rg_betrag_brutto: 23100, lief_fzg_bezahlt: true, lief_rg_bezahlt_datum: t(-35), ek_finanzierung: true, ek_finanzierung_betrag: 23000, ek_finanzierung_datum: t(-30), ek_finanzierung_vertragsnr: 'OB-DEMO-7' },
      'ST-26-9804': { lieferant: 'Beispiel KG', lief_rg_nr: 'R-1010', lief_rg_datum: t(-20), lief_rg_betrag_brutto: 19800, lief_fzg_bezahlt: true, lief_rg_bezahlt_datum: t(-15), papiere_eingang_ahs: t(-10), ek_finanzierung: true, ek_finanzierung_betrag: 19000, ek_finanzierung_datum: t(-8) },
      'ST-26-9805': { lieferant: 'Demo-Lieferant', lief_rg_nr: 'R-1005', lief_rg_datum: t(-6), lief_rg_faellig: t(8), lief_rg_betrag_brutto: 21900, lief_fzg_bezahlt: true, lief_rg_bezahlt_datum: t(-2) }
    };
    var za = {
      'ST-26-9801': { kd_zahlart: ['Überweisung'] },
      'ST-26-9802': { kd_zahlart: ['Finanzierung SCB', 'Anzahlung'], kd_finanzierung_betrag: 20000, kd_finanzierung_status: 'Zusage', kd_finanzierung_vertragsnr: 'OB-K-1002' },
      'ST-26-9803': { kd_zahlart: ['Finanzierung SCB'], kd_finanzierung_betrag: 22000, kd_finanzierung_status: 'Auflagen erfüllt', ml_kd_rg_datum: t(-16), kd_fzg_rg_nr: '2260900' },
      'ST-26-9805': { kd_zahlart: ['Überweisung'], ml_kd_rg_datum: t(-1), kd_fzg_rg_nr: '2260950', kd_1uebw: 5000 }
    };
    var akten = [
      { fz: 'ST-26-9801', kunde: 'Demo Kunde A', ue: t(5), vk: 20194 },
      { fz: 'ST-26-9802', kunde: 'Demo Kunde B', ue: t(2), vk: 28900 },
      { fz: 'ST-26-9803', kunde: 'Demo Kunde C', ue: t(-14), vk: 26500 },
      { fz: 'ST-26-9805', kunde: 'Demo Kunde E', ue: t(1), vk: 24900 }
    ];
    var rest = { 'ST-26-9801': 20194, 'ST-26-9802': 8900, 'ST-26-9803': 0, 'ST-26-9805': 19900 };
    async function fehlt(s, tb, k, v) { var r = await EG.tab(s, tb).select('*').eq(k, v); return !(r.data && r.data.length); }
    for (var i = 0; i < fz.length; i++) {
      var f = fz[i], sid = f[0];
      if (await fehlt('bestand', 'fahrzeug', 'stieber_id', sid)) await EG.tab('bestand', 'fahrzeug').insert({ stieber_id: sid, interne_nr: f[1], hersteller: f[2], modell: f[3], fahrzeugstatus: f[4], ml_kunde_art: f[5], auslieferungstermin: f[6] });
      if (ek[sid] && await fehlt('bestand', 'einkauf', 'fahrzeug_id', sid)) await EG.tab('bestand', 'einkauf').insert(Object.assign({ fahrzeug_id: sid }, ek[sid]));
      if (za[sid] && await fehlt('bestand', 'zahlung', 'fahrzeug_id', sid)) await EG.tab('bestand', 'zahlung').insert(Object.assign({ fahrzeug_id: sid }, za[sid]));
    }
    for (var j = 0; j < akten.length; j++) {
      var a = akten[j];
      if (await fehlt('verkauf', 'akte', 'fahrzeug_id', a.fz)) {
        var id = EG.uuid();
        await EG.tab('verkauf', 'akte').insert({ id: id, fahrzeug_id: a.fz, interne_nr: a.fz.slice(-4), kunde_name: a.kunde, uebergabe_termin: a.ue, vk_preis: a.vk, phase_aktuell: 'v7', created_at: new Date().toISOString() });
        await EG.tab('bestand', 'v_kennzahlen').insert({ id: EG.uuid(), stieber_id: a.fz, akte_id: id, kd_ges_zahlbetrag: a.vk, kd_gesamtzahlung: rest[a.fz] });
      }
    }
    if (await fehlt('laufzettel', 'v_meine_aufgaben', 'aufgabe_key', 'z_lief_bezahlen')) {
      await EG.tab('laufzettel', 'v_meine_aufgaben').insert([
        { id: EG.uuid(), interne_nr: '98001', aufgabe_key: 'z_lief_bezahlen', titel: 'Lieferantenrechnung bezahlen und Zahlungsbeleg an Lieferant', abteilung: 'buchhaltung', frist: t(4), status: 'offen', hersteller: 'Opel', modell: 'Corsa Demo', meine: true },
        { id: EG.uuid(), interne_nr: '98002', aufgabe_key: 'z_lief_bezahlen', titel: 'Lieferantenrechnung bezahlen und Zahlungsbeleg an Lieferant', abteilung: 'buchhaltung', frist: t(-2), status: 'offen', hersteller: 'Hyundai', modell: 'Tucson Demo', meine: true },
        { id: EG.uuid(), interne_nr: '98003', aufgabe_key: 'z_bank_auszahlung', titel: 'Auszahlung Kundenfinanzierung Openbank prüfen', abteilung: 'buchhaltung', frist: t(-4), status: 'offen', hersteller: 'Kia', modell: 'Sportage Demo', meine: true }
      ]);
    }
  }
})();
