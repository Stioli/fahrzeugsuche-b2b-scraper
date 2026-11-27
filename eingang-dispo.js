/* Stieber-App – Reiter „Dispo“ (Plan Dispo und Zahlungen v2, Abschnitt 4 / E4)               Stand 27.11.2026 v1.0 (Testversion)
   Sichtbar für admin und dispo. Je Fahrzeug im Durchlauf eine Karte mit
   - der Checkliste aus dem Plan (8 Schritte von der Lieferantenrechnung bis zur Info-Mail). Der Stand jedes Schritts kommt
     aus der Masterliste bzw. dem Laufzettel: ✓ erledigt · ○ offen · rot überfällig · ⏳ wartet (noch nicht dran) · – entfällt.
   - allen offenen Laufzettel-Aufgaben der Abteilung Dispo zum Abhaken (Übernehmen / Erledigt / Entfällt über die RPCs
     laufzettel.uebernehmen / erledigen / entfaellt – Name und Datum setzt die Datenbank).
   Geld-Schritte (bezahlt, abgelöst, ausgezahlt) stehen im Reiter „Buchhaltung“ (eingang-buchhaltung.js).
   Quellen (nur lesen): bestand.fahrzeug, bestand.einkauf, bestand.zahlung, bestand.fahrzeug_punkt, verkauf.akte, laufzettel.aufgabe.
   Schritt 8 (Info-Mail) hat noch kein Feld – er wird nur angezeigt, bis Oli ein Feld dafür freigibt.
   Demo (?demo=1): erfundene Fahrzeuge ST-26-97xx. Baut auf window.EG (eingang-core.js) auf. */
(function () {
  'use strict';
  var EG = window.EG, h = EG && EG.h;
  if (!EG) return;

  var ROLLEN = ['admin', 'dispo'];
  var SCHRITT_KEYS = ['c_repdoc_ankauf', 'c_einfinanzieren', 'v_int_auftrag', 't_abholung'];   // Aufgaben, die direkt an einem Schritt hängen
  var S = { root: null, laedt: false, x: [], filter: 'aufgaben', suche: '', offen: {} };

  EG.onTab('dispo', function (root) { S.root = root; return laden(); });

  (function stil() {
    if (document.getElementById('dp-stil')) return;
    var st = document.createElement('style'); st.id = 'dp-stil';
    st.textContent = [
      '.dp-kacheln{display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:10px;margin:6px 0 14px}',
      '.dp-kachel{text-align:left;background:#fff;border:1px solid var(--border);border-left:6px solid var(--blau);border-radius:14px;padding:10px 12px;font-family:var(--font-body);color:var(--ink);box-shadow:var(--schatten)}',
      '.dp-kachel.rot{border-left-color:var(--rot)} .dp-kachel.gold{border-left-color:var(--gold)} .dp-kachel.gruen{border-left-color:var(--gruen)}',
      '.dp-kachel b{display:block;font-family:var(--font-heading);font-size:28px;line-height:1.2}',
      '.dp-kachel span{display:block;font-size:14px;font-weight:700;color:var(--sub)}',
      '.dp-liste{display:grid;gap:10px}',
      '.dp-fz{background:#fff;border:1px solid var(--border);border-radius:var(--radius);box-shadow:var(--schatten)}',
      '.dp-fz.rot{border-color:var(--rot)}',
      '.dp-fz > summary{list-style:none;cursor:pointer;padding:12px 14px;display:flex;flex-wrap:wrap;align-items:center;gap:8px 12px}',
      '.dp-fz > summary::-webkit-details-marker{display:none}',
      '.dp-fz > summary::before{content:"▸";color:var(--blau-dark);font-weight:700}',
      '.dp-fz[open] > summary::before{content:"▾"}',
      '.dp-titel{font-weight:700;font-size:16px}',
      '.dp-sub{font-size:14px;color:var(--sub)}',
      '.dp-dots{display:inline-flex;gap:4px;margin-left:auto}',
      '.dp-dot{width:14px;height:14px;border-radius:50%;border:2px solid var(--border);background:#fff}',
      '.dp-dot.ok{background:var(--gruen);border-color:var(--gruen)} .dp-dot.offen{border-color:var(--blau)} .dp-dot.rot{background:var(--rot);border-color:var(--rot)}',
      '.dp-dot.wartet{background:#EEF1F5} .dp-dot.entfaellt{background:#EEF1F5;border-style:dashed} .dp-dot.info{background:#EEF1F5;border-style:dotted}',
      '.dp-inhalt{padding:0 14px 14px}',
      '.dp-schritte{list-style:none;margin:0;padding:0;border-top:1px solid var(--border)}',
      '.dp-schritt{display:grid;grid-template-columns:30px 1fr;gap:4px 8px;padding:8px 0;border-bottom:1px solid var(--border)}',
      '.dp-sym{font-size:18px;line-height:1.3;text-align:center;font-weight:700}',
      '.dp-sym.ok{color:var(--gruen-text)} .dp-sym.offen{color:var(--blau-dark)} .dp-sym.rot{color:var(--rot-text)} .dp-sym.wartet,.dp-sym.entfaellt,.dp-sym.info{color:var(--sub)}',
      '.dp-schritt-titel{font-weight:600}',
      '.dp-schritt-info{font-size:14px;color:var(--sub)}',
      '.dp-schritt-info.rot{color:var(--rot-text);font-weight:700}',
      '.dp-knoepfe{display:flex;gap:6px;flex-wrap:wrap;margin-top:4px}',
      '.dp-knoepfe .btn{min-height:38px;padding:0 12px;font-size:14px}',
      '.dp-weitere h3{font-size:15px;margin:12px 0 4px;color:var(--blau-dark)}',
      '.dp-aufg{padding:8px 0;border-bottom:1px solid var(--border)}',
      '.dp-aufg:last-child{border-bottom:none}'
    ].join(' ');
    document.head.appendChild(st);
  })();

  function chk(r) { if (r && r.error) throw r.error; return r; }
  function num(v) { if (v == null || v === '') return null; var n = Number(v); return isFinite(n) ? n : null; }
  function eur(n) { return n == null ? '' : Number(n).toLocaleString('de-DE', { minimumFractionDigits: 0, maximumFractionDigits: 2 }) + ' €'; }
  function dat(s) { return s ? EG.fmtDatum(s) : ''; }
  function heute() { return EG.heute(); }
  function idx(rows, k) { var m = {}; (rows || []).forEach(function (r) { if (r && r[k] != null) m[r[k]] = r; }); return m; }
  function darf() { return ROLLEN.indexOf(EG.rolle) >= 0; }
  function istOffen(t) { return t && (t.status === 'offen' || t.status === 'uebernommen'); }

  /* ====================================================================
     Laden
     ==================================================================== */
  async function laden() {
    if (S.laedt) return;
    if (!darf()) { S.root.innerHTML = ''; S.root.appendChild(EG.banner('Dieser Reiter ist nur für OS und die Dispo.', 'info')); return; }
    S.laedt = true;
    S.root.innerHTML = '';
    S.root.appendChild(h('p', { class: 'muted', text: 'Lade Fahrzeuge und Aufgaben …' }));
    try {
      if (EG.demo) await demoSaen();
      var r = await Promise.all([
        EG.tab('bestand', 'fahrzeug').select('stieber_id,interne_nr,hersteller,modell,fahrzeugstatus,auslieferungstermin,ml_kunde_art,nw_gw'),
        EG.tab('bestand', 'einkauf').select('fahrzeug_id,lieferant,lief_rg_nr,lief_rg_datum,papiere_eingang_ahs,ek_finanzierung,ek_finanzierung_datum,ek_finanzierung_betrag,transportstatus,int_rg_betrag'),
        EG.tab('bestand', 'zahlung').select('fahrzeug_id,ml_kd_rg_datum,kd_fzg_rg_nr,kd_zusatz_rg_nr'),
        EG.tab('bestand', 'fahrzeug_punkt').select('fahrzeug_id,punkt_key,status,wert,erledigt_am,erledigt_von_name').in('punkt_key', ['repdoc_ankauf', 'transport_planen']),
        EG.tab('verkauf', 'akte').select('id,fahrzeug_id,interne_nr,kunde_name,uebergabe_termin,phase_aktuell,kd_zusatz_rg,kd_zusatz_rg_datum,kd_fzg_rg_datum,created_at'),
        EG.tab('laufzettel', 'aufgabe').select('id,interne_nr,aufgabe_key,titel,abteilung,zustaendig_kuerzel,frist,status,uebernommen_von_name,erledigt_von_name,erledigt_am,grund,created_at')
          .eq('abteilung', 'dispo').order('created_at', { ascending: true })
      ]);
      r.forEach(chk);
      S.x = vorbereiten(r[0].data, r[1].data, r[2].data, r[3].data, r[4].data, r[5].data);
      zeichnen();
    } catch (e) {
      console.error(e);
      S.root.innerHTML = '';
      S.root.appendChild(EG.banner([h('strong', { text: 'Der Reiter Dispo konnte nicht geladen werden. ' }), (e && (e.message || e.details)) || String(e)], 'fehler'));
      S.root.appendChild(h('button', { type: 'button', class: 'btn btn-ghost', text: 'Erneut versuchen', onclick: function () { laden().catch(EG.fehler); } }));
    } finally { S.laedt = false; }
  }

  function vorbereiten(fz, ek, za, pu, ak, lz) {
    var E = idx(ek, 'fahrzeug_id'), Z = idx(za, 'fahrzeug_id'), P = {}, A = {}, T = {};
    (pu || []).forEach(function (p) { (P[p.fahrzeug_id] = P[p.fahrzeug_id] || {})[p.punkt_key] = p; });
    (ak || []).forEach(function (a) {
      if (!a.fahrzeug_id || a.phase_aktuell === 'abgebrochen') return;
      var alt = A[a.fahrzeug_id];
      if (!alt || String(a.created_at || '') > String(alt.created_at || '')) A[a.fahrzeug_id] = a;
    });
    (lz || []).forEach(function (t) { if (t.interne_nr) (T[t.interne_nr] = T[t.interne_nr] || []).push(t); });
    var liste = [];
    (fz || []).forEach(function (f) {
      var aufg = (f.interne_nr && T[f.interne_nr]) || [];
      var offene = aufg.filter(istOffen);
      if (f.fahrzeugstatus === 'ausgeliefert' && !offene.length) return;   // fertig durch
      var a = A[f.stieber_id] || null;
      var x = {
        sid: f.stieber_id, nr: f.interne_nr || '', titel: [f.hersteller, f.modell].filter(Boolean).join(' ') || 'Fahrzeug',
        status: f.fahrzeugstatus || '', lager: f.ml_kunde_art === 'stieber', nwgw: f.nw_gw || '',
        kunde: (a && a.kunde_name) || (f.ml_kunde_art === 'stieber' ? 'Stieber (Lager)' : ''),
        uebergabe: (a && a.uebergabe_termin) || f.auslieferungstermin || null,
        a: a, akteId: a ? a.id : null, e: E[f.stieber_id] || {}, z: Z[f.stieber_id] || {}, p: P[f.stieber_id] || {},
        aufgaben: aufg, offene: offene
      };
      x.schritte = schritte(x);
      x.rot = offene.filter(function (t) { return t.frist && t.frist < heute(); }).length;
      x.heute = offene.filter(function (t) { return t.frist === heute(); }).length;
      x.naechste = offene.reduce(function (m, t) { return t.frist && (!m || t.frist < m) ? t.frist : m; }, null);
      liste.push(x);
    });
    liste.sort(function (a, b) {
      return (b.rot ? 1 : 0) - (a.rot ? 1 : 0) || String(a.naechste || '9999') .localeCompare(String(b.naechste || '9999')) ||
        String(a.uebergabe || '9999').localeCompare(String(b.uebergabe || '9999')) || String(a.nr).localeCompare(String(b.nr));
    });
    return liste;
  }

  /** Letzte Aufgabe mit diesem Schlüssel → Schrittstand oder null */
  function ausAufgabe(x, key) {
    var l = x.aufgaben.filter(function (t) { return t.aufgabe_key === key; });
    var t = l.filter(istOffen)[0] || l[l.length - 1];
    if (!t) return null;
    if (t.status === 'erledigt') return { st: 'ok', info: 'erledigt' + (t.erledigt_von_name ? ' von ' + t.erledigt_von_name : '') + (t.erledigt_am ? ' am ' + dat(t.erledigt_am) : ''), t: t };
    if (t.status === 'entfaellt') return { st: 'entfaellt', info: 'entfällt' + (t.grund ? ': ' + t.grund : ''), t: t };
    var rot = t.frist && t.frist < heute();
    return { st: rot ? 'rot' : 'offen', info: (rot ? 'überfällig seit ' : 'bis ') + (t.frist ? dat(t.frist) : '–') +
      (t.status === 'uebernommen' ? ' · übernommen von ' + (t.uebernommen_von_name || '?') : ''), t: t };
  }

  /** Die 8 Schritte aus dem Plan v2, Abschnitt 4 */
  function schritte(x) {
    var e = x.e, z = x.z, p = x.p, l = [], a;
    // 1 Lieferantenrechnung
    l.push(e.lief_rg_nr ? { st: 'ok', info: 'Rg ' + e.lief_rg_nr + (e.lief_rg_datum ? ' vom ' + dat(e.lief_rg_datum) : '') + (e.lieferant ? ' · ' + e.lieferant : '') }
      : { st: 'wartet', info: 'noch keine Lieferantenrechnung' });
    l[0].titel = 'Lieferantenrechnung eingetragen und geprüft';
    // 2 Repdoc-Ankauf
    a = ausAufgabe(x, 'c_repdoc_ankauf');
    if (!a || (a.st !== 'ok' && p.repdoc_ankauf && p.repdoc_ankauf.status === 'ok')) {
      a = p.repdoc_ankauf && p.repdoc_ankauf.status === 'ok' ? { st: 'ok', info: 'laut Masterliste „Ankauf Repdoc“' + (p.repdoc_ankauf.erledigt_am ? ' am ' + dat(p.repdoc_ankauf.erledigt_am) : '') }
        : a || (e.lief_rg_nr ? { st: 'offen', info: 'noch nicht gebucht' } : { st: 'wartet', info: 'nach der Lieferantenrechnung' });
    }
    a.titel = 'Handelsakte + Ankauf in Repdoc gebucht'; l.push(a);
    // 3 Einfinanziert
    if (e.ek_finanzierung || e.ek_finanzierung_datum) a = { st: 'ok', info: 'EK-Finz' + (e.ek_finanzierung_betrag ? ' ' + eur(num(e.ek_finanzierung_betrag)) : '') + (e.ek_finanzierung_datum ? ' am ' + dat(e.ek_finanzierung_datum) : '') };
    else {
      a = ausAufgabe(x, 'c_einfinanzieren');
      if (!a) a = e.papiere_eingang_ahs ? { st: EG.werktageSeit(e.papiere_eingang_ahs) >= 2 ? 'rot' : 'offen', info: 'Papiere da seit ' + dat(e.papiere_eingang_ahs) } : { st: 'wartet', info: 'wenn die Papiere da sind' };
    }
    a.titel = 'Einfinanziert bei der Openbank'; l.push(a);
    // 4 Interner Auftrag
    a = ausAufgabe(x, 'v_int_auftrag') || (x.a ? { st: 'offen', info: 'noch kein interner Auftrag' } : { st: 'wartet', info: 'nach dem Verkauf' });
    a.titel = 'Interner Auftrag geschrieben, Arbeitskarte gedruckt'; l.push(a);
    // 5 Abholung
    var ts = e.transportstatus || '';
    a = ausAufgabe(x, 't_abholung');
    if (!a || a.st !== 'ok') {
      if (/^[125]/.test(ts)) a = { st: 'ok', info: 'Transportstatus „' + ts + '“' };
      else if (p.transport_planen && p.transport_planen.status === 'ok') a = { st: 'ok', info: 'laut Masterliste geplant' };
      else if (!a) a = /^6/.test(ts) || !ts ? { st: 'wartet', info: ts ? 'Transportstatus „' + ts + '“' : 'noch kein Transportstatus' } : { st: 'offen', info: 'Transportstatus „' + ts + '“' };
    }
    a.titel = 'Abholung geplant'; l.push(a);
    // 6 Rechnungen
    var rg = z.ml_kd_rg_datum || (x.a && x.a.kd_fzg_rg_datum), zusatz = x.a ? num(x.a.kd_zusatz_rg) : null, zrg = x.a && x.a.kd_zusatz_rg_datum;
    if (!x.a) a = { st: 'wartet', info: 'nach dem Verkauf' };
    else if (!rg) a = { st: 'offen', info: 'Fahrzeugrechnung fehlt noch' };
    else if (zusatz && !zrg) a = { st: 'offen', info: 'Fahrzeugrechnung ' + (z.kd_fzg_rg_nr || '') + ' vom ' + dat(rg) + ' · Zusatzrechnung ' + eur(zusatz) + ' fehlt (nach den Arbeiten)' };
    else a = { st: 'ok', info: 'Rg ' + (z.kd_fzg_rg_nr || 'ohne Nr.') + ' vom ' + dat(rg) + (zrg ? ' · Zusatz-Rg ' + (z.kd_zusatz_rg_nr || '') + ' vom ' + dat(zrg) : '') };
    a.titel = 'Fahrzeugrechnung geschrieben · Zusatzrechnung nach den Arbeiten'; l.push(a);
    // 7 Nachträge
    if (num(e.int_rg_betrag) != null) a = { st: 'ok', info: 'Int-Rg ' + eur(num(e.int_rg_betrag)) + ' in der Masterliste' };
    else if (x.status === 'fertig' || x.status === 'ausgeliefert') a = { st: 'offen', info: 'Int-Rg fehlt in der Masterliste' };
    else a = { st: 'wartet', info: 'nach den Arbeiten' };
    a.titel = 'Nachträge: EK Durchlaufartikel, Fracht, Int-Rg'; l.push(a);
    // 8 Info-Mail
    l.push({ st: 'info', titel: 'Info-Mail an Buchhaltung, Dispo und Verkäufer gesendet', info: 'wird noch nicht erfasst – Haken folgt, sobald ein Feld dafür freigegeben ist' });
    return l;
  }

  /* ====================================================================
     Zeichnen
     ==================================================================== */
  var SYM = { ok: '✓', offen: '○', rot: '!', wartet: '⏳', entfaellt: '–', info: '·' };
  function passtSuche(x) {
    var q = S.suche.trim().toLowerCase();
    if (!q) return true;
    return [x.nr, x.kunde, x.titel, x.e.lieferant, x.sid].join(' ').toLowerCase().indexOf(q) >= 0;
  }
  function zeichnen() {
    var root = S.root; root.innerHTML = '';
    var mitAufg = S.x.filter(function (x) { return x.offene.length; });
    var alleOffen = [].concat.apply([], S.x.map(function (x) { return x.offene; }));
    var rot = alleOffen.filter(function (t) { return t.frist && t.frist < heute(); }).length;
    var heuteN = alleOffen.filter(function (t) { return t.frist === heute(); }).length;

    var chips = h('div', { class: 'chips' },
      h('button', { type: 'button', class: 'chip', 'aria-pressed': S.filter === 'aufgaben' ? 'true' : 'false', text: 'Mit offenen Aufgaben (' + mitAufg.length + ')', onclick: function () { S.filter = 'aufgaben'; zeichnen(); } }),
      h('button', { type: 'button', class: 'chip', 'aria-pressed': S.filter === 'alle' ? 'true' : 'false', text: 'Alle im Durchlauf (' + S.x.length + ')', onclick: function () { S.filter = 'alle'; zeichnen(); } }));
    var such = h('input', { type: 'search', placeholder: 'Suche: Nr., Kunde, Modell, Lieferant', value: S.suche, style: 'min-height:44px;flex:1;min-width:200px;padding:0 12px;border:2px solid var(--border);border-radius:12px;font-size:15px' });
    such.addEventListener('input', function () { S.suche = such.value; clearTimeout(such._t); such._t = setTimeout(function () { zeichnen(); var n = S.root.querySelector('input[type=search]'); if (n) { n.focus(); n.setSelectionRange(n.value.length, n.value.length); } }, 300); });
    root.appendChild(h('div', { class: 'leiste' }, h('div', { class: 'leiste-zeile', style: 'gap:10px;flex-wrap:wrap' }, chips, such,
      h('button', { type: 'button', class: 'btn btn-ghost', text: 'Aktualisieren', onclick: function () { laden().catch(EG.fehler); } }))));
    if (EG.demo) root.appendChild(EG.banner('Demo: erfundene Fahrzeuge und Aufgaben, nichts wird gespeichert.', 'info'));

    root.appendChild(h('div', { class: 'dp-kacheln' },
      h('div', { class: 'dp-kachel' + (rot ? ' rot' : alleOffen.length ? '' : ' gruen') }, h('span', { text: 'Offene Dispo-Aufgaben' }), h('b', { text: String(alleOffen.length) })),
      h('div', { class: 'dp-kachel' + (rot ? ' rot' : ' gruen') }, h('span', { text: 'Überfällig' }), h('b', { text: String(rot) })),
      h('div', { class: 'dp-kachel' + (heuteN ? ' gold' : ' gruen') }, h('span', { text: 'Heute fällig' }), h('b', { text: String(heuteN) })),
      h('div', { class: 'dp-kachel' }, h('span', { text: 'Fahrzeuge im Durchlauf' }), h('b', { text: String(S.x.length) }))));
    root.appendChild(h('p', { class: 'klein muted', style: 'margin:-4px 0 10px', text: '✓ erledigt · ○ offen · ! überfällig · ⏳ noch nicht dran · – entfällt. Geld-Schritte (bezahlt, abgelöst, ausgezahlt) stehen im Reiter „Buchhaltung“.' }));

    var l = (S.filter === 'aufgaben' ? mitAufg : S.x).filter(passtSuche);
    if (!l.length) { root.appendChild(h('div', { class: 'leer', text: S.filter === 'aufgaben' ? 'Für die Dispo liegt gerade nichts an.' : 'Kein Fahrzeug gefunden.' })); zaehlerSetzen(rot, alleOffen.length); return; }
    var box = h('div', { class: 'dp-liste' });
    l.forEach(function (x) { box.appendChild(karte(x, l.length === 1)); });
    root.appendChild(box);
    zaehlerSetzen(rot, alleOffen.length);
  }

  function zaehlerSetzen(rot, n) {
    var knopf = document.getElementById('tabk-dispo');
    if (!knopf) return;
    knopf.textContent = 'Dispo' + (rot ? ' (' + rot + ')' : '');
    knopf.classList.toggle('hat-rot', rot > 0);
  }

  function karte(x, aufklappen) {
    var erledigt = x.schritte.filter(function (s) { return s.st === 'ok' || s.st === 'entfaellt'; }).length;
    var zaehlbar = x.schritte.filter(function (s) { return s.st !== 'info'; }).length;
    var dots = h('span', { class: 'dp-dots', 'aria-label': erledigt + ' von ' + zaehlbar + ' Schritten erledigt' });
    x.schritte.forEach(function (s) { dots.appendChild(h('span', { class: 'dp-dot ' + s.st, title: s.titel + ': ' + s.info })); });
    var pills = [];
    if (x.rot) pills.push(EG.pill(x.rot + ' überfällig', 'rot'));
    else if (x.offene.length) pills.push(EG.pill(x.offene.length + ' Aufgabe' + (x.offene.length === 1 ? '' : 'n') + ' offen', x.heute ? 'gold' : 'blau'));
    if (x.uebergabe) pills.push(EG.pill('Übergabe ' + dat(x.uebergabe), 'grau'));
    var d = h('details', { class: 'dp-fz' + (x.rot ? ' rot' : '') },
      h('summary', {},
        h('span', { class: 'dp-titel', text: (x.nr || x.sid) + ' · ' + x.titel }),
        h('span', { class: 'dp-sub', text: [x.kunde, x.status, x.nwgw].filter(Boolean).join(' · ') }),
        pills, h('span', { class: 'dp-sub', text: erledigt + '/' + zaehlbar + ' ✓' }), dots));
    if (S.offen[x.sid] || aufklappen) d.open = true;
    d.addEventListener('toggle', function () { if (d.open) S.offen[x.sid] = true; else delete S.offen[x.sid]; });

    var inhalt = h('div', { class: 'dp-inhalt' });
    var ul = h('ol', { class: 'dp-schritte' });
    x.schritte.forEach(function (s, i) {
      var kn = s.t && istOffen(s.t) ? aufgabeKnoepfe(s.t) : null;
      ul.appendChild(h('li', { class: 'dp-schritt' },
        h('span', { class: 'dp-sym ' + s.st, text: SYM[s.st] || '?', 'aria-label': s.st }),
        h('div', {}, h('div', { class: 'dp-schritt-titel', text: (i + 1) + '. ' + s.titel }),
          h('div', { class: 'dp-schritt-info' + (s.st === 'rot' ? ' rot' : ''), text: s.info }), kn)));
    });
    inhalt.appendChild(ul);

    var weitere = x.offene.filter(function (t) { return SCHRITT_KEYS.indexOf(t.aufgabe_key) < 0; });
    if (weitere.length) {
      var w = h('div', { class: 'dp-weitere' }, h('h3', { text: 'Weitere offene Dispo-Aufgaben (' + weitere.length + ')' }));
      weitere.sort(function (a, b) { return String(a.frist || '9999').localeCompare(String(b.frist || '9999')); }).forEach(function (t) {
        var rot = t.frist && t.frist < heute();
        w.appendChild(h('div', { class: 'dp-aufg' },
          h('div', { class: 'karte-kopf' }, h('strong', { text: t.titel }), EG.pill(t.frist ? 'bis ' + dat(t.frist) : 'ohne Frist', rot ? 'rot' : t.frist === heute() ? 'gold' : 'gruen')),
          t.status === 'uebernommen' ? h('div', { class: 'klein muted', text: 'übernommen von ' + (t.uebernommen_von_name || '?') }) : null,
          aufgabeKnoepfe(t)));
      });
      inhalt.appendChild(w);
    }
    var links = h('div', { class: 'dp-knoepfe', style: 'margin-top:10px' });
    if (x.akteId && window.VK_AKTE_OEFFNEN) links.appendChild(h('button', { type: 'button', class: 'btn btn-ghost', text: 'Verkaufsakte öffnen', onclick: function () { window.VK_AKTE_OEFFNEN(x.akteId); } }));
    if (x.akteId && window.VK_ZAHLUNGEN) links.appendChild(h('button', { type: 'button', class: 'btn btn-ghost', text: 'Zahlungen', onclick: function () { window.VK_ZAHLUNGEN.oeffne(x.akteId); } }));
    if (window.EG_FZ && window.EG_FZ.darf && window.EG_FZ.darf()) links.appendChild(h('button', { type: 'button', class: 'btn btn-ghost', text: 'Alle Masterliste-Felder', onclick: function () { EG.zeigeTab('fahrzeuge'); window.EG_FZ.oeffnen(x.sid).catch(EG.fehler); } }));
    if (links.childNodes.length) inhalt.appendChild(links);
    d.appendChild(inhalt);
    return d;
  }

  function aufgabeKnoepfe(t) {
    var kn = h('div', { class: 'dp-knoepfe' });
    if (t.status === 'offen') kn.appendChild(h('button', { type: 'button', class: 'btn btn-ghost', text: 'Übernehmen', onclick: function () { aktion(t, 'uebernehmen'); } }));
    kn.appendChild(h('button', { type: 'button', class: 'btn', text: 'Erledigt', onclick: function () { aktion(t, 'erledigen'); } }));
    kn.appendChild(h('button', { type: 'button', class: 'btn btn-ghost', text: 'Entfällt …', onclick: function () { aktion(t, 'entfaellt'); } }));
    return kn;
  }

  async function aktion(t, art) {
    var grund = null;
    if (art === 'entfaellt') {
      grund = await EG.eingabe('Warum entfällt „' + t.titel + '“?', { titel: 'Entfällt', ok: 'Speichern' });
      if (!grund || !String(grund).trim()) return;
    }
    if (art === 'erledigen' && !(await EG.bestaetigen('„' + t.titel + '“ als erledigt abhaken?', { ja: 'Ja, erledigt', nein: 'Abbrechen' }))) return;
    try {
      var name = EG.nutzerName() || null;
      if (EG.demo) {
        var w = art === 'uebernehmen' ? { status: 'uebernommen', uebernommen_von_name: name || 'Demo' }
          : art === 'erledigen' ? { status: 'erledigt', erledigt_von_name: name || 'Demo', erledigt_am: new Date().toISOString() }
          : { status: 'entfaellt', grund: grund, erledigt_von_name: name || 'Demo', erledigt_am: new Date().toISOString() };
        chk(await EG.tab('laufzettel', 'aufgabe').update(w).eq('id', t.id));
      } else {
        var p = { p_id: t.id, p_name: name };
        if (art === 'entfaellt') p.p_grund = grund;
        chk(await EG.sb.schema('laufzettel').rpc(art, p));
      }
      EG.toast(art === 'uebernehmen' ? 'Übernommen.' : art === 'erledigen' ? 'Erledigt – die nächste Abteilung ist dran.' : 'Als entfällt markiert.', 'ok');
      await laden();
    } catch (e) { EG.toast('Nicht gespeichert: ' + ((e && e.message) || e), 'fehler'); }
  }

  /* ====================================================================
     DEMO (?demo=1)
     ==================================================================== */
  var gesaet = false;
  async function demoSaen() {
    if (gesaet) return; gesaet = true;
    var t = function (n) { var d = new Date(); d.setDate(d.getDate() + n); return EG.isoDatum(d); };
    async function fehlt(s, tb, k, v) { var r = await EG.tab(s, tb).select('*').eq(k, v); return !(r.data && r.data.length); }
    var fz = [
      ['ST-26-9701', '97001', 'Opel', 'Corsa Demo', 'bestellt', 'kunde', 'NW'],
      ['ST-26-9702', '97002', 'Hyundai', 'Tucson Demo', 'im Haus', 'kunde', 'GW'],
      ['ST-26-9703', '97003', 'Kia', 'Sportage Demo', 'im Haus', 'stieber', 'NW']
    ];
    var ek = {
      'ST-26-9701': { lieferant: 'Demo-Lieferant', lief_rg_nr: 'R-2001', lief_rg_datum: t(-2), transportstatus: '3 abholbereit nicht geplant' },
      'ST-26-9702': { lieferant: 'Beispiel KG', lief_rg_nr: 'R-2002', lief_rg_datum: t(-15), papiere_eingang_ahs: t(-5), transportstatus: '5 im Haus' },
      'ST-26-9703': { lieferant: 'Beispiel KG', lief_rg_nr: 'R-2003', lief_rg_datum: t(-30), papiere_eingang_ahs: t(-20), ek_finanzierung: true, ek_finanzierung_betrag: 21000, ek_finanzierung_datum: t(-18), transportstatus: '5 im Haus' }
    };
    for (var i = 0; i < fz.length; i++) {
      var f = fz[i], sid = f[0];
      if (await fehlt('bestand', 'fahrzeug', 'stieber_id', sid)) await EG.tab('bestand', 'fahrzeug').insert({ stieber_id: sid, interne_nr: f[1], hersteller: f[2], modell: f[3], fahrzeugstatus: f[4], ml_kunde_art: f[5], nw_gw: f[6] });
      if (await fehlt('bestand', 'einkauf', 'fahrzeug_id', sid)) await EG.tab('bestand', 'einkauf').insert(Object.assign({ fahrzeug_id: sid }, ek[sid]));
    }
    if (await fehlt('verkauf', 'akte', 'fahrzeug_id', 'ST-26-9701')) await EG.tab('verkauf', 'akte').insert({ id: EG.uuid(), fahrzeug_id: 'ST-26-9701', interne_nr: '97001', kunde_name: 'Demo Kunde Dispo', uebergabe_termin: t(20), phase_aktuell: 'v8', created_at: new Date().toISOString() });
    if (await fehlt('verkauf', 'akte', 'fahrzeug_id', 'ST-26-9702')) await EG.tab('verkauf', 'akte').insert({ id: EG.uuid(), fahrzeug_id: 'ST-26-9702', interne_nr: '97002', kunde_name: 'Demo Kunde Zwei', uebergabe_termin: t(3), kd_zusatz_rg: 760, phase_aktuell: 'v8', created_at: new Date().toISOString() });
    if (await fehlt('laufzettel', 'aufgabe', 'interne_nr', '97001')) {
      var z = function (nr, key, titel, frist, o) { return Object.assign({ id: EG.uuid(), interne_nr: nr, aufgabe_key: key, titel: titel, abteilung: 'dispo', frist: frist, status: 'offen', created_at: new Date().toISOString() }, o || {}); };
      await EG.tab('laufzettel', 'aufgabe').insert([
        z('97001', 'c_repdoc_ankauf', 'Handelsakte + Ankauf in Repdoc buchen', t(1)),
        z('97001', 't_abholung', 'Abholung planen: günstigste Spedition beauftragen (spätestens 2 Werktage nach Abholbereitschaft)', t(-1)),
        z('97001', 'd_ab_kunde', 'Auftragsbestätigung an den Kunden (Entwurf, Claude)', t(0)),
        z('97002', 'c_repdoc_ankauf', 'Handelsakte + Ankauf in Repdoc buchen', t(-10), { status: 'erledigt', erledigt_von_name: 'Celine (Demo)', erledigt_am: t(-11) }),
        z('97002', 'c_einfinanzieren', 'Einfinanzieren bei der Openbank (Papiere sind da)', t(-3)),
        z('97002', 'v_int_auftrag', 'Interner Auftrag mit Auslieferungstermin an Werkstatt und Aufbereitung', t(-6), { status: 'erledigt', erledigt_von_name: 'Celine (Demo)', erledigt_am: t(-6) }),
        z('97002', 'd_zulassung', 'Zulassung beauftragen bzw. prüfen', t(1)),
        z('97003', 'c_repdoc_ankauf', 'Handelsakte + Ankauf in Repdoc buchen', t(-25), { status: 'erledigt', erledigt_von_name: 'Celine (Demo)', erledigt_am: t(-25) })
      ]);
    }
  }
})();
