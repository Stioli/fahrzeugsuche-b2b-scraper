/* Stieber-App – Reiter „Aufgaben“ (Laufzettel LZ5, Plan 25.11.2026, E2/E3)              Stand 27.11.2026 v1.2 (Abteilung Buchhaltung)
   Zeigt die offenen Laufzettel-Aufgaben aus laufzettel.v_meine_aufgaben (RLS: jede Rolle sieht nur ihre,
   admin und Dispo alles). Ampel nach Frist: rot = überfällig, gelb = heute fällig, grün = später.
   Aktionen nur über RPCs (laufzettel.uebernehmen / erledigen / entfaellt); die Datenbank prüft die Rechte.
   E3: Aufgaben gehen an die Abteilung; „Übernehmen“ setzt den Namen. Beim gemeinsamen Konto werkstatt@
   wird der am Gerät gemerkte Name mitgeschickt. Baut auf window.EG (eingang-core.js) auf. */
(function () {
  'use strict';
  var EG = window.EG, h = EG && EG.h;
  if (!EG) return;

  var ABT = { vor_ort: 'Wer da ist', dispo: 'Dispo', buchhaltung: 'Buchhaltung', werkstatt: 'Werkstatt', aufbereitung: 'Aufbereitung', verkauf_akte: 'Verkäufer', oli: 'Oli' };
  var AMPEL = { rot: { t: 'Überfällig', art: 'rot' }, gelb: { t: 'Heute fällig', art: 'gold' }, gruen: { t: 'Später', art: 'gruen' } };
  var S = { root: null, zeilen: [], filter: 'meine', laedt: false };
  var V = function () { return EG.tab('laufzettel', 'v_meine_aufgaben'); };

  EG.onTab('aufgaben', function (root) { S.root = root; demoSaen(); return laden(); });

  /* Link aus Push/Mail (…/eingang.html?tab=aufgaben): nach der Anmeldung direkt den Reiter öffnen. */
  if (/[?&]tab=aufgaben(&|$)/.test(location.search)) {
    var versuche = 0;
    (function warte() {
      var k = document.getElementById('tabk-aufgaben');
      if (EG.rolle && k && !k.hidden && EG.zeigeTab) { EG.zeigeTab('aufgaben'); return; }
      if (versuche++ < 80) setTimeout(warte, 250);
    })();
  }

  function chk(r) { if (r && r.error) throw r.error; return r; }
  function fzText(a) { return [a.interne_nr ? 'Nr. ' + a.interne_nr : '', [a.hersteller, a.modell].filter(Boolean).join(' ')].filter(Boolean).join(' · ') || 'Fahrzeug'; }
  function sieheAlles() { return EG.rolle === 'admin' || EG.rolle === 'dispo'; }

  async function laden() {
    if (S.laedt) return;
    S.laedt = true;
    S.root.innerHTML = '';
    S.root.appendChild(h('p', { class: 'muted', text: 'Lade Aufgaben …' }));
    try {
      var r = chk(await V().select('*').order('frist', { ascending: true }).order('created_at', { ascending: true }));
      S.zeilen = (r.data || []).map(function (a) { if (EG.demo) a.meine = demoMeine(a); a.ampel = ampel(a.frist); return a; });
      if (!sieheAlles()) S.filter = 'meine';
      zeichnen();
      zaehlerSetzen();
    } catch (e) {
      console.error(e);
      S.root.innerHTML = '';
      S.root.appendChild(EG.banner([h('strong', { text: 'Die Aufgaben konnten nicht geladen werden. ' }), (e && (e.message || e.details)) || String(e)], 'fehler'));
      S.root.appendChild(h('button', { type: 'button', class: 'btn btn-ghost', text: 'Erneut versuchen', onclick: function () { laden().catch(EG.fehler); } }));
    } finally { S.laedt = false; }
  }

  /** Ampel im Browser nachrechnen (deutsche Zeit), damit sie auch ohne Neuladen über Mitternacht stimmt. */
  function ampel(frist) {
    if (!frist) return 'gruen';
    var heute = EG.heute();
    return frist < heute ? 'rot' : frist === heute ? 'gelb' : 'gruen';
  }

  function sichtbar() {
    return S.zeilen.filter(function (a) { return S.filter === 'alle' || a.meine; });
  }

  /** Zähler am Reiter: rote und gelbe Aufgaben, die ich bearbeiten darf. */
  function zaehlerSetzen() {
    var knopf = document.getElementById('tabk-aufgaben');
    if (!knopf) return;
    var n = S.zeilen.filter(function (a) { return a.meine && a.ampel !== 'gruen'; }).length;
    knopf.textContent = 'Aufgaben' + (n ? ' (' + n + ')' : '');
    knopf.classList.toggle('hat-rot', S.zeilen.some(function (a) { return a.meine && a.ampel === 'rot'; }));
  }

  function zeichnen() {
    var root = S.root; root.innerHTML = '';
    var kopf = h('div', { class: 'leiste' });
    var chips = h('div', { class: 'chips' });
    var meineN = S.zeilen.filter(function (a) { return a.meine; }).length;
    chips.appendChild(h('button', { type: 'button', class: 'chip', 'aria-pressed': S.filter === 'meine' ? 'true' : 'false', text: 'Meine (' + meineN + ')', onclick: function () { S.filter = 'meine'; zeichnen(); } }));
    if (sieheAlles()) {
      chips.appendChild(h('button', { type: 'button', class: 'chip', 'aria-pressed': S.filter === 'alle' ? 'true' : 'false', text: 'Alle offenen (' + S.zeilen.length + ')', onclick: function () { S.filter = 'alle'; zeichnen(); } }));
    }
    var neu = h('button', { type: 'button', class: 'btn btn-ghost', text: 'Aktualisieren', onclick: function () { laden().catch(EG.fehler); } });
    kopf.appendChild(h('div', { class: 'leiste-zeile' }, chips, neu));
    root.appendChild(kopf);

    var l = sichtbar();
    if (!l.length) {
      root.appendChild(h('div', { class: 'leer', text: S.filter === 'meine' ? 'Für dich liegt gerade nichts an.' : 'Keine offenen Aufgaben.' }));
      return;
    }
    ['rot', 'gelb', 'gruen'].forEach(function (k) {
      var gruppe = l.filter(function (a) { return a.ampel === k; });
      if (!gruppe.length) return;
      root.appendChild(h('h2', { class: 'lz-gruppe', text: AMPEL[k].t + ' (' + gruppe.length + ')' }));
      var box = h('div', { role: 'list', class: 'lz-liste' });
      gruppe.forEach(function (a) { box.appendChild(karte(a)); });
      root.appendChild(box);
    });
  }

  function karte(a) {
    var am = AMPEL[a.ampel];
    var info = [ABT[a.abteilung] || a.abteilung];
    if (a.zustaendig_kuerzel) info.push(a.zustaendig_kuerzel);
    var status = a.status === 'uebernommen'
      ? EG.pill('übernommen: ' + (a.uebernommen_von_name || '?'), 'blau')
      : EG.pill('offen', 'grau');
    var knoepfe = h('div', { class: 'lz-knoepfe' });
    if (a.meine) {
      if (a.status === 'offen') knoepfe.appendChild(h('button', { type: 'button', class: 'btn btn-ghost', text: 'Übernehmen', onclick: function () { aktion(a, 'uebernehmen'); } }));
      knoepfe.appendChild(h('button', { type: 'button', class: 'btn', text: 'Erledigt', onclick: function () { aktion(a, 'erledigen'); } }));
      knoepfe.appendChild(h('button', { type: 'button', class: 'btn btn-ghost', text: 'Entfällt …', onclick: function () { aktion(a, 'entfaellt'); } }));
    }
    return h('div', { role: 'listitem', class: 'karte lz-karte ' + (a.ampel === 'rot' ? 'rot' : '') },
      h('div', { class: 'karte-kopf' },
        h('strong', { text: a.titel }),
        EG.pill(a.frist ? 'bis ' + EG.fmtDatum(a.frist) : 'ohne Frist', am.art)),
      h('div', { class: 'klein muted', text: fzText(a) + ' · ' + info.join(' · ') }),
      h('div', { class: 'lz-status' }, status),
      a.meine ? knoepfe : h('p', { class: 'klein muted', text: 'Nur ansehen – gehört zu ' + (ABT[a.abteilung] || a.abteilung) + '.' }));
  }

  async function aktion(a, art) {
    var grund = null;
    if (art === 'entfaellt') {
      grund = window.prompt('Warum entfällt „' + a.titel + '“?');
      if (!grund || !grund.trim()) { EG.toast('Ohne Grund geht „entfällt“ nicht.', 'fehler'); return; }
    }
    var name = EG.nutzerName ? EG.nutzerName() : '';
    if (!name && EG.istWerkstatt && EG.istWerkstatt()) name = await EG.nameAbfragen(true);
    try {
      if (EG.demo) { demoAktion(a, art, grund, name); }
      else {
        var p = { p_id: a.id, p_name: name || null };
        if (art === 'entfaellt') p.p_grund = grund;
        chk(await EG.sb.schema('laufzettel').rpc(art, p));
      }
      EG.toast(art === 'uebernehmen' ? 'Übernommen.' : art === 'erledigen' ? 'Erledigt – die nächste Abteilung ist dran.' : 'Als entfällt markiert.');
      await laden();
    } catch (e) {
      EG.toast('Nicht gespeichert: ' + ((e && e.message) || e), 'fehler');
    }
  }

  /* ====================================================================
     DEMO (nur ?demo=1): erfundene Aufgaben, Rechte wie in der Datenbank nachgebildet
     ==================================================================== */
  var ROLLEN = {
    vor_ort: ['admin', 'dispo', 'verkauf', 'werkstatt', 'aufbereitung'], dispo: ['admin', 'dispo'], buchhaltung: ['admin', 'buchhaltung', 'dispo'], werkstatt: ['admin', 'werkstatt'],
    aufbereitung: ['admin', 'aufbereitung', 'werkstatt'], verkauf_akte: ['admin', 'dispo', 'verkauf'], oli: ['admin']
  };
  function demoMeine(a) { return (ROLLEN[a.abteilung] || ['admin']).indexOf(EG.rolle) >= 0; }
  function demoAktion(a, art, grund, name) {
    var w = art === 'uebernehmen' ? { status: 'uebernommen', uebernommen_von_name: name || EG.anzeigename || 'Demo' } : null;
    if (art === 'erledigen' || art === 'entfaellt') {
      return V().delete().eq('id', a.id).then(chk);   // erledigte/entfallene fallen aus der Sicht „offen“
    }
    return V().update(w).eq('id', a.id).then(chk);
  }
  var gesaet = false;
  function demoSaen() {
    if (!EG.demo || gesaet) return;
    gesaet = true;
    function tag(n) { var x = new Date(); x.setDate(x.getDate() + n); return EG.isoDatum(x); }
    function z(nr, key, titel, abt, frist, o) {
      return Object.assign({ id: EG.uuid(), interne_nr: nr, aufgabe_key: key, titel: titel, abteilung: abt, frist: frist, status: 'offen',
        uebernommen_von_name: null, created_at: new Date().toISOString(), hersteller: 'Opel', modell: 'Mokka Demo', zustaendig_kuerzel: null }, o || {});
    }
    EG.demoSeed('laufzettel.v_meine_aufgaben', [
      z('90004', 'a_abladen', 'Beim Abladen prüfen: FIN, km, Papiere, Schlüssel, Schäden', 'vor_ort', tag(-1)),
      z('90004', 'r_ruege', 'Rüge an den Lieferanten senden (selber, spätestens nächster Werktag)', 'dispo', tag(0)),
      z('90007', 'r_oli', 'Mangel ab 100 €: Rüge freigeben, Preisnachlass oder Rücktritt', 'oli', tag(0), { hersteller: 'Kia', modell: 'Ceed Demo' }),
      z('90003', 'c_tresor', 'ZB II und COC in den Tresor, Zweitschlüssel in den Schlüsselkasten', 'dispo', tag(1), { hersteller: 'Nissan', modell: 'Qashqai Demo' }),
      z('90003', 'f_aufbereitung', 'Aufbereitung: Innen, Außen, Politur, Smart-Repair', 'aufbereitung', tag(3), { hersteller: 'Nissan', modell: 'Qashqai Demo', status: 'uebernommen', uebernommen_von_name: 'Demo Aufbereiter' }),
      z('90003', 'w_werkstatt', 'Werkstattauftrag ausführen (HU, Service, Mängel, Räder)', 'werkstatt', tag(2), { hersteller: 'Nissan', modell: 'Qashqai Demo' }),
      z('90103', 'd_uebergabe', 'Übergabe mit dem Kunden vorbereiten', 'verkauf_akte', tag(4), { zustaendig_kuerzel: 'NP' })
    ]);
  }
})();
