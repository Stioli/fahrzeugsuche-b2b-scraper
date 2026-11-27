/* Stieber-App – Übergabe an die Dispo: Hinweise je Verkaufsakte (Version 1.0, Stand 27.11.2026)
   Plan: Projekte/Übergaben/2026-11-27_Plan-Uebergabe-an-Dispo_v1.md (P2/P3). SQL: sql/2026-11-27_uebergabe_dispo_v1.sql
   window.VK_HW
   - fuerAkten(ids)           → { akte_id: [hinweis, …] } – EINE Abfrage je 30 Akten; fehlende Tabelle/kein Leserecht → {}
   - block(akte, liste, opt)  → Element „Übergabe von OS“ für den Reiter Dispo (Hinweise abhaken, „Übernommen“, neuer Hinweis)
                                opt: { uebernommenVon, uebergabeOffen, neuLaden }
   - banner(box, akte)        → schmales Banner unter dem Kopf der Verkaufsakte (lädt selbst; nichts offen → leer)
   Daten: verkauf.hinweis (lesen: admin, dispo, buchhaltung, verkauf) · schreiben nur über die RPCs
          verkauf.hinweis_anlegen / verkauf.hinweis_status / verkauf.uebergabe_uebernehmen (admin, dispo, buchhaltung; übernehmen: admin, dispo)
   Fehlt die Tabelle (SQL noch nicht eingespielt), bleibt alles still ausgeblendet.
   Demo (?demo=1): schreibt direkt in den Demo-Speicher. */
(function () {
  'use strict';
  var EG = window.EG, h = EG && EG.h;
  if (!EG) return;

  var SCHREIBEN = ['admin', 'dispo', 'buchhaltung'];
  var UEBERNEHMEN = ['admin', 'dispo'];
  var ART = { fehlt: ['fehlt', 'rot'], abweichung: ['Abweichung', 'gold'], wartet: ['wartet', 'grau'], aufgabe: ['Aufgabe', 'blau'], info: ['Info', 'grau'] };
  var ABT = { dispo: 'Dispo', buchhaltung: 'Buchhaltung', verkauf: 'Verkauf', oli: 'OS' };
  var tabelleFehlt = false;

  (function stil() {
    if (document.getElementById('hw-stil')) return;
    var st = document.createElement('style'); st.id = 'hw-stil';
    st.textContent = [
      '.hw-block{border:2px solid var(--blau);border-radius:14px;padding:10px 12px;margin:0 0 12px;background:#F5F9FF}',
      '.hw-block.offen{border-color:var(--gold);background:#FFFBEF}',
      '.hw-block h3{margin:0 0 6px;font-size:16px;color:var(--blau-dark)}',
      '.hw-zeile{display:grid;grid-template-columns:1fr auto;gap:4px 10px;padding:7px 0;border-top:1px solid var(--border);align-items:start}',
      '.hw-zeile:first-of-type{border-top:none}',
      '.hw-text{font-weight:600}',
      '.hw-meta{font-size:13px;color:var(--sub)}',
      '.hw-meta.rot{color:var(--rot-text);font-weight:700}',
      '.hw-knoepfe{display:flex;gap:6px;flex-wrap:wrap}',
      '.hw-knoepfe .btn{min-height:36px;padding:0 10px;font-size:14px}',
      '.hw-erledigt{margin-top:6px} .hw-erledigt summary{cursor:pointer;font-size:14px;color:var(--sub)}',
      '.hw-erledigt .hw-text{font-weight:400;text-decoration:line-through;color:var(--sub)}',
      '.hw-banner{display:block;width:100%;text-align:left;border:2px solid var(--gold);background:#FFFBEF;border-radius:14px;padding:10px 12px;margin:0 0 12px;font:inherit;color:var(--ink);cursor:pointer}',
      '.hw-banner.ok{border-color:var(--gruen);background:#F2FBF5}',
      '.hw-banner strong{font-family:var(--font-heading)}'
    ].join(' ');
    document.head.appendChild(st);
  })();

  function darfSchreiben() { return SCHREIBEN.indexOf(EG.rolle) >= 0; }
  function darfUebernehmen() { return UEBERNEHMEN.indexOf(EG.rolle) >= 0; }
  function heute() { return EG.heute(); }
  function fehltTab(e) { var m = String((e && (e.code || '')) + ' ' + (e && e.message || '')); return /42P01|PGRST205|does not exist|schema cache/i.test(m); }
  function sortiere(l) {
    return l.slice().sort(function (a, b) {
      var fa = a.frist || '9999', fb = b.frist || '9999';
      return fa.localeCompare(fb) || String(a.created_at || '').localeCompare(String(b.created_at || ''));
    });
  }

  /* ---------------- Laden ---------------- */
  async function fuerAkten(ids) {
    var m = {};
    ids = (ids || []).filter(Boolean);
    if (!ids.length || tabelleFehlt) return m;
    for (var i = 0; i < ids.length; i += 30) {
      var t = ids.slice(i, i + 30);
      var r = await EG.tab('verkauf', 'hinweis').select('id,akte_id,interne_nr,text,art,abteilung,frist,schluessel,status,grund,quelle,erstellt_von_name,erledigt_von_name,erledigt_am,created_at').in('akte_id', t);
      if (r.error) { if (fehltTab(r.error)) tabelleFehlt = true; else console.warn('Hinweise:', r.error.message); return m; }
      (r.data || []).forEach(function (x) { (m[x.akte_id] = m[x.akte_id] || []).push(x); });
    }
    return m;
  }

  /* ---------------- Schreiben ---------------- */
  async function anlegen(akte, text, art, frist) {
    if (EG.demo) {
      var ins = await EG.tab('verkauf', 'hinweis').insert({ id: EG.uuid(), akte_id: akte.id, interne_nr: akte.interne_nr || null, text: text, art: art, abteilung: 'dispo', frist: frist || null, status: 'offen', quelle: EG.rolle === 'admin' ? 'os' : EG.rolle, erstellt_von_name: EG.nutzerName(), created_at: new Date().toISOString() });
      if (ins.error) throw ins.error; return;
    }
    var r = await EG.sb.schema('verkauf').rpc('hinweis_anlegen', { p_akte_id: akte.id, p_text: text, p_art: art, p_abteilung: 'dispo', p_frist: frist || null, p_schluessel: null, p_quelle: null });
    if (r.error) throw r.error;
  }
  async function status(hw, st, grund) {
    if (EG.demo) {
      var w = { status: st, grund: st === 'entfaellt' ? grund : null, erledigt_von_name: st === 'offen' ? null : EG.nutzerName(), erledigt_am: st === 'offen' ? null : new Date().toISOString() };
      var u = await EG.tab('verkauf', 'hinweis').update(w).eq('id', hw.id);
      if (u.error) throw u.error; return;
    }
    var r = await EG.sb.schema('verkauf').rpc('hinweis_status', { p_id: hw.id, p_status: st, p_grund: grund || null });
    if (r.error) throw r.error;
  }
  async function uebernehmen(akte) {
    if (EG.demo) {
      var u = await EG.tab('laufzettel', 'aufgabe').update({ status: 'uebernommen', uebernommen_von_name: EG.nutzerName() || 'Demo' }).eq('interne_nr', akte.interne_nr).eq('abteilung', 'dispo').eq('status', 'offen');
      if (u.error) throw u.error; return 0;
    }
    var r = await EG.sb.schema('verkauf').rpc('uebergabe_uebernehmen', { p_akte_id: akte.id, p_name: EG.nutzerName() || null });
    if (r.error) throw r.error;
    return r.data;
  }

  async function aktion(fn, ok, danach) {
    try { await fn(); EG.toast(ok, 'ok'); if (danach) await danach(); }
    catch (e) { EG.toast('Nicht gespeichert: ' + ((e && e.message) || e), 'fehler'); }
  }

  /* ---------------- Zeilen ---------------- */
  function zeile(hw, danach, mitKnoepfen) {
    var a = ART[hw.art] || ART.info;
    var rot = hw.status === 'offen' && hw.frist && hw.frist < heute();
    var meta = [a[0], hw.abteilung && hw.abteilung !== 'dispo' ? 'für ' + (ABT[hw.abteilung] || hw.abteilung) : '',
      hw.frist ? (rot ? 'überfällig seit ' : 'bis ') + EG.fmtDatum(hw.frist) : '',
      hw.erstellt_von_name ? 'von ' + hw.erstellt_von_name + (hw.quelle === 'claude' ? ' (Claude)' : '') : ''].filter(Boolean).join(' · ');
    if (hw.status !== 'offen') meta = (hw.status === 'entfaellt' ? 'entfällt' + (hw.grund ? ': ' + hw.grund : '') : 'erledigt') + (hw.erledigt_von_name ? ' von ' + hw.erledigt_von_name : '') + (hw.erledigt_am ? ' am ' + EG.fmtDatum(hw.erledigt_am) : '');
    var kn = null;
    if (mitKnoepfen && darfSchreiben()) {
      kn = h('div', { class: 'hw-knoepfe' });
      if (hw.status === 'offen') {
        kn.appendChild(h('button', { type: 'button', class: 'btn', text: 'Erledigt', onclick: function () { aktion(function () { return status(hw, 'erledigt'); }, 'Hinweis erledigt.', danach); } }));
        kn.appendChild(h('button', { type: 'button', class: 'btn btn-ghost', text: 'Entfällt …', onclick: async function () {
          var g = await EG.eingabe('Warum entfällt „' + hw.text + '“?', { titel: 'Entfällt', ok: 'Speichern' });
          if (!g || !String(g).trim()) return;
          aktion(function () { return status(hw, 'entfaellt', String(g).trim()); }, 'Als entfällt markiert.', danach);
        } }));
      } else {
        kn.appendChild(h('button', { type: 'button', class: 'btn btn-ghost', text: 'Wieder öffnen', onclick: function () { aktion(function () { return status(hw, 'offen'); }, 'Wieder offen.', danach); } }));
      }
    }
    return h('div', { class: 'hw-zeile' },
      h('div', {}, h('div', { class: 'hw-text', text: hw.text }), h('div', { class: 'hw-meta' + (rot ? ' rot' : ''), text: meta })),
      kn || h('span', {}, EG.pill(a[0], rot ? 'rot' : a[1])));
  }

  async function neuerHinweis(akte, danach) {
    var text = await EG.eingabe('Neuer Hinweis zur Übergabe (ohne Kundennamen):', { titel: 'Hinweis für die Dispo', ok: 'Anlegen' });
    if (!text || String(text).trim().length < 3) return;
    aktion(function () { return anlegen(akte, String(text).trim(), 'aufgabe', null); }, 'Hinweis angelegt.', danach);
  }

  /* ---------------- Reiter Dispo: Block „Übergabe von OS“ ---------------- */
  function block(akte, liste, opt) {
    opt = opt || {};
    if (tabelleFehlt || !akte) return null;
    liste = liste || [];
    var offen = sortiere(liste.filter(function (x) { return x.status === 'offen'; }));
    var fertig = sortiere(liste.filter(function (x) { return x.status !== 'offen'; }));
    if (!offen.length && !fertig.length && !opt.uebergabeOffen && !opt.uebernommenVon) return null;
    var danach = opt.neuLaden || null;
    var box = h('div', { class: 'hw-block' + (opt.uebergabeOffen || offen.length ? ' offen' : '') }, h('h3', { text: 'Übergabe von OS' }));
    if (opt.uebernommenVon) box.appendChild(h('div', { class: 'hw-meta', style: 'margin-bottom:6px', text: 'Übernommen von ' + opt.uebernommenVon + '.' }));
    else if (opt.uebergabeOffen) {
      var z = h('div', { class: 'hw-knoepfe', style: 'margin-bottom:8px;align-items:center' },
        h('span', { class: 'hw-meta', text: 'Freigabe Verkauf ist erteilt – die Akte liegt bei der Dispo. ' }));
      if (darfUebernehmen()) z.appendChild(h('button', { type: 'button', class: 'btn', id: 'hw-uebernehmen-' + akte.id, text: 'Übernommen', onclick: function () {
        aktion(function () { return uebernehmen(akte); }, 'Übernommen – die Dispo-Aufgaben stehen auf dich.', danach);
      } }));
      box.appendChild(z);
    }
    if (offen.length) offen.forEach(function (x) { box.appendChild(zeile(x, danach, true)); });
    else box.appendChild(h('div', { class: 'hw-meta', text: 'Keine offenen Hinweise.' }));
    if (fertig.length) {
      var d = h('details', { class: 'hw-erledigt' }, h('summary', { text: 'Erledigt (' + fertig.length + ')' }));
      fertig.forEach(function (x) { d.appendChild(zeile(x, danach, true)); });
      box.appendChild(d);
    }
    if (darfSchreiben()) box.appendChild(h('div', { class: 'hw-knoepfe', style: 'margin-top:8px' },
      h('button', { type: 'button', class: 'btn btn-ghost', text: '+ Hinweis', onclick: function () { neuerHinweis(akte, danach); } })));
    return box;
  }

  /* ---------------- Verkaufsakte: Banner unter dem Kopf ---------------- */
  var bannerAuf = {};
  async function banner(box, akte) {
    if (!box || !akte) return;
    box.innerHTML = '';
    if (['admin', 'dispo', 'buchhaltung', 'verkauf'].indexOf(EG.rolle) < 0) return;
    var m, aufg = [];
    try {
      m = await fuerAkten([akte.id]);
      if (akte.interne_nr) {
        var r = await EG.tab('laufzettel', 'aufgabe').select('aufgabe_key,status,uebernommen_von_name').eq('interne_nr', akte.interne_nr).eq('aufgabe_key', 'v_int_auftrag');
        if (!r.error) aufg = r.data || [];
      }
    } catch (e) { console.warn('Hinweise:', e && e.message); return; }
    if (tabelleFehlt) return;
    var liste = m[akte.id] || [], offen = sortiere(liste.filter(function (x) { return x.status === 'offen'; }));
    var ia = aufg.filter(function (t) { return t.status === 'uebernommen'; })[0];
    if (!offen.length) return;   // nichts offen → kein Banner
    var rot = offen.filter(function (x) { return x.frist && x.frist < heute(); }).length;
    var neu = function () { return banner(box, akte); };
    var kopf = h('button', { type: 'button', class: 'hw-banner', 'aria-expanded': bannerAuf[akte.id] ? 'true' : 'false', onclick: function () { bannerAuf[akte.id] = !bannerAuf[akte.id]; neu(); } },
      h('strong', { text: 'Übergabe an Dispo: ' + offen.length + ' Hinweis' + (offen.length === 1 ? '' : 'e') + ' offen' }),
      rot ? [' ', EG.pill(rot + ' überfällig', 'rot')] : null,
      h('span', { class: 'hw-meta', text: ' · ' + (ia ? 'übernommen von ' + (ia.uebernommen_von_name || '?') : 'noch nicht übernommen') + ' · ' + (bannerAuf[akte.id] ? 'zuklappen' : 'antippen zum Aufklappen') }));
    box.appendChild(kopf);
    if (bannerAuf[akte.id]) {
      var l = h('div', { class: 'hw-block offen', style: 'margin-top:-6px' });
      offen.forEach(function (x) { l.appendChild(zeile(x, neu, true)); });
      if (darfSchreiben()) l.appendChild(h('div', { class: 'hw-knoepfe', style: 'margin-top:8px' },
        h('button', { type: 'button', class: 'btn btn-ghost', text: '+ Hinweis', onclick: function () { neuerHinweis(akte, neu); } })));
      box.appendChild(l);
    }
  }

  window.VK_HW = { fuerAkten: fuerAkten, block: block, banner: banner, anlegen: anlegen, status: status, uebernehmen: uebernehmen };
})();
