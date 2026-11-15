/* Stieber-App – Bewertungen zuordnen (VA9: Bewertung → Verkäufer, Provision), Version 4.6, Stand 15.11.2026
   Plan „Anpassungen Verkaufsablauf“ v2, Phase 11 (Zeile 111, Frage 5/5a), Bauplan v1 E5 (halbautomatisch).

   Ablauf
   - Claude liest wöchentlich neue Google-Rezensionen und trägt Vorschläge in verkauf.bewertung_vorschlag ein (nur mit Admin-Zugang, nichts wird bestätigt).
   - Dieser Abschnitt im Reiter „Übersicht“ (nur admin, dispo, buchhaltung) zeigt die offenen Vorschläge. Ein Klick auf „Bestätigen“ ruft
     verkauf.bewertung_bestaetigen(vorschlag_id, akte_id) auf: Haken p11.bewertung_zugeordnet an der Akte, Name und Zeit.
     „Verwerfen“ und „Keine Akte“ setzen nur den Status (verkauf.bewertung_status_setzen). Erst bestätigte Bewertungen zählen für die Provision.
   - Darunter „Provision“: je Verkäufer, diesen und letzten Monat (Ansicht verkauf.v_bewertung_provision). Es zählen NUR bestätigte Bewertungen mit 5 Sternen
     (Entscheidung Oli 15.11.2026); alle bestätigten bleiben der Akte zugeordnet und sichtbar (Spalte anzahl_bestaetigt). Kunden gegenüber wird das nie erwähnt.
   - Nirgends Beträge. Es werden nur der öffentliche Anzeigename des Rezensenten und ein kurzer Textauszug gezeigt.

   Einhängen: verkauf-uebersicht.js ruft window.VK_BEWERTUNGEN.abschnitt(root, { onGeaendert }) nach dem Zeichnen der Übersicht auf (nur Büro-Rollen).
   Demo-Modus (?demo=1): erfundene Rezensionen zu den Demo-Akten 90101–90104; Bestätigen schreibt über den Demo-Client dieselben Zeilen wie die Datenbankfunktion. */
(function () {
  'use strict';
  var EG = window.EG, h = EG && EG.h;
  if (!EG) return;

  var BUERO = ['admin', 'dispo', 'buchhaltung'];
  var S = { root: null, opts: null, vorschlaege: [], akten: [], provision: [], fehler: '', laedt: false, gewaehlt: {}, busy: false };

  /* ---------- Demo-Daten (erfundene Rezensionen, passend zu den Demo-Akten 90101–90104) ---------- */
  (function demo() {
    if (!EG.demo || !EG.demoSeed) return;
    function tag(n) { var x = new Date(); x.setDate(x.getDate() + n); return EG.isoDatum(x); }
    function gid(nr) { return 'a0000001-0000-4000-8000-0000000000' + (nr < 10 ? '0' : '') + nr; }
    var letzterMonat = new Date(); letzterMonat.setDate(1); letzterMonat.setDate(0); letzterMonat.setHours(12, 0, 0, 0);
    function v(nr, o) {
      return Object.assign({ id: 'f9000000-0000-4000-8000-0000000000' + (nr < 10 ? '0' : '') + nr, quelle: 'google', status: 'offen', akte_id: null, begruendung: '', verkaeufer_kuerzel: null,
        bestaetigt_von_name: null, bestaetigt_am: null, created_at: new Date().toISOString() }, o);
    }
    EG.demoSeed('verkauf.bewertung_vorschlag', [
      v(1, { rezension_autor: 'Max M.', rezension_datum: tag(-2), sterne: 5, rezension_schluessel: 'demo-1', akte_id: gid(1),
        text_kurz: 'Sehr freundliche Beratung, der Tucson war genau wie beschrieben. Probefahrt ohne Druck, alles war schnell geklärt. Gerne wieder!',
        begruendung: 'Name „Max M.“ passt zu „Muster, Max“; Fahrzeug im Text: Tucson (Akte 90101 Hyundai Tucson); Rezension nach dem Verkaufsgespräch.' }),
      v(2, { rezension_autor: 'Erika B.', rezension_datum: tag(-3), sterne: 5, rezension_schluessel: 'demo-2', akte_id: gid(2),
        text_kurz: 'Unser neuer Sportage wurde pünktlich und sauber übergeben. Vielen Dank an das ganze Team.',
        begruendung: 'Name „Erika B.“ passt zu „Beispiel, Erika“; Fahrzeug im Text: Sportage (Akte 90102 Kia Sportage); Rezension 3 Tage nach dem Übergabetermin.' }),
      v(3, { rezension_autor: 'P. Probe', rezension_datum: tag(-1), sterne: 4, rezension_schluessel: 'demo-3', akte_id: gid(3),
        text_kurz: 'Mokka läuft super. Übergabe hat etwas gedauert, sonst alles gut.',
        begruendung: 'Nachname „Probe“ passt zu „Probe, Peter“; Fahrzeug im Text: Mokka (Akte 90103 Opel Mokka).' }),
      v(4, { rezension_autor: 'Sabine K.', rezension_datum: tag(-4), sterne: 5, rezension_schluessel: 'demo-4', akte_id: null,
        text_kurz: 'Kompetent und ehrlich. Ich habe mich beim Kauf eines Kleinwagens sehr gut aufgehoben gefühlt.',
        begruendung: 'Keine Akte mit passendem Namen in den letzten 60 Tagen gefunden. Fahrzeug im Text nicht genannt.' }),
      v(5, { rezension_autor: 'Demo Altkunde', rezension_datum: tag(-40), sterne: 5, rezension_schluessel: 'demo-5', akte_id: gid(4), status: 'bestaetigt', verkaeufer_kuerzel: 'OS',
        text_kurz: 'Alles bestens (Demo, letzter Monat).', begruendung: 'Demo: im letzten Monat bestätigt.', bestaetigt_von_name: 'Dispo (Demo)', bestaetigt_am: letzterMonat.toISOString() })
    ]);
  })();

  (function stil() {
    try {
      if (document.getElementById('vkb-stil')) return;
      var st = document.createElement('style'); st.id = 'vkb-stil';
      st.textContent = [
        '.vkb-box{margin-top:24px;padding-top:12px;border-top:2px solid var(--line,#E2E8F0)}',
        '.vkb-box h2{font-size:20px;margin:0 0 4px}',
        '.vkb-karte{border:1px solid var(--line,#E2E8F0);border-radius:16px;padding:12px 14px;margin:10px 0;background:var(--card,#fff)}',
        '.vkb-kopf{display:flex;flex-wrap:wrap;gap:6px 14px;align-items:baseline}',
        '.vkb-sterne{color:#B7791F;letter-spacing:1px;font-size:16px}',
        '.vkb-text{margin:6px 0;font-style:italic}',
        '.vkb-vorschlag{margin:6px 0}',
        '.vkb-wahl{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin:8px 0}',
        '.vkb-wahl select{min-height:44px;max-width:100%;border-radius:12px;border:1px solid var(--line,#CBD5E1);padding:0 10px;font:inherit}',
        '.vkb-knoepfe{display:flex;flex-wrap:wrap;gap:8px;margin-top:6px}',
        '.vkb-tab{border-collapse:collapse;margin:6px 0}',
        '.vkb-tab th,.vkb-tab td{padding:6px 14px;text-align:left;border-bottom:1px solid var(--line,#E2E8F0)}',
        '.vkb-tab td.z,.vkb-tab th.z{text-align:right}'
      ].join('\n');
      document.head.appendChild(st);
    } catch (e) { /* egal */ }
  })();

  function chk(r) { if (r && r.error) throw r.error; return r; }
  function sterneText(n) { n = Math.max(0, Math.min(5, n | 0)); return new Array(n + 1).join('★') + new Array(6 - n).join('☆'); }
  function norm(s) { var t = String(s == null ? '' : s).trim().toUpperCase(); return t || null; }
  function akteName(a) { return [a.hersteller, a.modell].filter(Boolean).join(' ') || 'Fahrzeug'; }
  function akteZeile(a) { return (a.interne_nr || '–') + ' · ' + akteName(a) + ' · ' + (a.kunde_name || 'Kunde fehlt') + ' · Verkäufer ' + (a.verkaeufer || '–'); }
  function monatKey(d) { return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2); }
  function akteVon(id) { return S.akten.filter(function (a) { return a.id === id; })[0] || null; }

  /* ====================================================================
     Laden
     ==================================================================== */
  async function laden() {
    S.fehler = '';
    try {
      S.vorschlaege = chk(await EG.tab('verkauf', 'bewertung_vorschlag').select('*').order('rezension_datum', { ascending: false })).data || [];
      S.akten = chk(await EG.tab('verkauf', 'akte').select('id,interne_nr,hersteller,modell,kunde_name,verkaeufer,uebergabe_termin,phase_aktuell')).data || [];
      S.akten = S.akten.filter(function (a) { return a.phase_aktuell !== 'abgebrochen'; });
      S.akten.sort(function (a, b) { return String(b.interne_nr || '').localeCompare(String(a.interne_nr || '')); });
      if (EG.demo) {
        // Demo: Ansicht aus der Tabelle nachbilden (gleiche Regel wie verkauf.v_bewertung_provision)
        var z = {};
        S.vorschlaege.filter(function (v) { return v.status === 'bestaetigt' && v.bestaetigt_am; }).forEach(function (v) {
          var m = monatKey(new Date(v.bestaetigt_am)) + '-01', k = (v.verkaeufer_kuerzel || '?') + '|' + m;
          z[k] = z[k] || { verkaeufer: v.verkaeufer_kuerzel || '?', monat: m, anzahl: 0, anzahl_bestaetigt: 0 }; z[k].anzahl_bestaetigt++; if (Number(v.sterne) === 5) z[k].anzahl++;
        });
        S.provision = Object.keys(z).map(function (k) { return z[k]; });
      } else {
        S.provision = chk(await EG.tab('verkauf', 'v_bewertung_provision').select('verkaeufer,monat,anzahl,anzahl_bestaetigt')).data || [];
      }
    } catch (e) {
      S.fehler = 'Die Bewertungen konnten nicht geladen werden' + (e && e.message ? ' (' + e.message + ')' : '') + '. Ist das SQL „VA9 Bewertungen“ eingespielt?';
      S.vorschlaege = []; S.akten = []; S.provision = [];
    }
  }

  /* ====================================================================
     Aktionen
     ==================================================================== */
  async function bestaetigen(v, akteId) {
    if (EG.demo) {
      var a = akteVon(akteId); if (!a) throw new Error('Verkaufsakte nicht gefunden.');
      var kz = norm(a.verkaeufer), name = EG.nutzerName(), jetzt = new Date().toISOString();
      chk(await EG.tab('verkauf', 'bewertung_vorschlag').update({ status: 'bestaetigt', akte_id: akteId, verkaeufer_kuerzel: kz, bestaetigt_von_name: name, bestaetigt_am: jetzt }).eq('id', v.id));
      chk(await EG.tab('verkauf', 'punkt').upsert([{ akte_id: akteId, phase: 'p11', punkt_key: 'bewertung_zugeordnet', status: 'ok',
        wert: { autor: v.rezension_autor, datum: v.rezension_datum, sterne: v.sterne, verkaeufer: kz }, grund: null, fotos: [], erledigt_von_name: name, erledigt_am: jetzt }], { onConflict: 'akte_id,phase,punkt_key' }));
    } else {
      chk(await EG.sb.schema('verkauf').rpc('bewertung_bestaetigen', { p_vorschlag_id: v.id, p_akte_id: akteId }));
    }
  }
  async function statusSetzen(v, status) {
    if (EG.demo) chk(await EG.tab('verkauf', 'bewertung_vorschlag').update({ status: status }).eq('id', v.id));
    else chk(await EG.sb.schema('verkauf').rpc('bewertung_status_setzen', { p_vorschlag_id: v.id, p_status: status }));
  }
  async function aktion(fn, meldung) {
    if (S.busy) return;
    S.busy = true;
    try {
      await fn();
      EG.toast(meldung, 'ok');
      await laden();
      zeichne();
      if (S.opts && typeof S.opts.onGeaendert === 'function') { try { await S.opts.onGeaendert(); } catch (e) { console.warn('Übersicht neu laden:', e && e.message); } }
    } catch (e) { EG.fehler(e); }
    finally { S.busy = false; }
  }

  /* ====================================================================
     Zeichnen
     ==================================================================== */
  function karte(v) {
    var vorschlag = v.akte_id ? akteVon(v.akte_id) : null;
    var wahl = S.gewaehlt[v.id] !== undefined ? S.gewaehlt[v.id] : (v.akte_id || '');
    var auswahl = h('select', { 'aria-label': 'Akte für diese Bewertung wählen' },
      h('option', { value: '', text: '– Akte wählen –' }),
      S.akten.map(function (a) { var o = h('option', { value: a.id, text: akteZeile(a) }); if (a.id === wahl) o.selected = true; return o; }));
    var bestBtn = h('button', { type: 'button', class: 'btn btn-primary', text: 'Bestätigen' });
    function btnStand() { bestBtn.disabled = !auswahl.value; }
    auswahl.addEventListener('change', function () { S.gewaehlt[v.id] = auswahl.value; btnStand(); });
    btnStand();
    bestBtn.addEventListener('click', function () {
      var id = auswahl.value; if (!id) return;
      var a = akteVon(id);
      aktion(function () { return bestaetigen(v, id); }, 'Bewertung bestätigt' + (a && a.verkaeufer ? (Number(v.sterne) === 5 ? ' – zählt für ' + a.verkaeufer : ' – der Akte zugeordnet, zählt nicht für die Provision (nur 5 Sterne)') : '') + '.');
    });
    var anfang = String(v.text_kurz || '');
    if (anfang.length > 200) anfang = anfang.slice(0, 200) + ' …';
    return h('div', { class: 'vkb-karte', role: 'listitem' },
      h('div', { class: 'vkb-kopf' }, h('strong', { text: v.rezension_autor }), h('span', { class: 'muted', text: EG.fmtDatum(v.rezension_datum) }),
        h('span', { class: 'vkb-sterne', 'aria-label': v.sterne + ' von 5 Sternen', text: sterneText(v.sterne) })),
      anfang ? h('p', { class: 'vkb-text', text: '„' + anfang + '“' }) : null,
      h('p', { class: 'vkb-vorschlag' }, h('strong', { text: 'Vorschlag: ' }),
        vorschlag ? akteZeile(vorschlag) : 'keine passende Akte gefunden – bitte selbst wählen oder „Keine Akte“'),
      v.begruendung ? h('p', { class: 'muted klein', text: 'Warum: ' + v.begruendung }) : null,
      h('div', { class: 'vkb-wahl' }, h('span', { class: 'klein', text: 'Akte:' }), auswahl),
      h('div', { class: 'vkb-knoepfe' }, bestBtn,
        h('button', { type: 'button', class: 'btn btn-ghost', text: 'Verwerfen', title: 'Die Bewertung gehört zu keinem Verkauf bzw. ist unbrauchbar',
          onclick: function () { aktion(function () { return statusSetzen(v, 'verworfen'); }, 'Vorschlag verworfen.'); } }),
        h('button', { type: 'button', class: 'btn btn-ghost', text: 'Keine Akte', title: 'Die Bewertung ist echt, gehört aber zu keiner Verkaufsakte',
          onclick: function () { aktion(function () { return statusSetzen(v, 'keine_akte'); }, 'Als „Keine Akte“ vermerkt.'); } })));
  }

  function provisionTab() {
    var jetzt = new Date(), vorm = new Date(jetzt.getFullYear(), jetzt.getMonth() - 1, 1);
    var mDiese = monatKey(jetzt), mLetzte = monatKey(vorm), je = {};
    S.provision.forEach(function (p) {
      var m = String(p.monat || '').slice(0, 7), k = p.verkaeufer || '?';
      if (m !== mDiese && m !== mLetzte) return;
      je[k] = je[k] || { d: 0, l: 0, da: 0, la: 0 };
      var z5 = Number(p.anzahl) || 0, alle = p.anzahl_bestaetigt == null ? z5 : (Number(p.anzahl_bestaetigt) || 0);
      if (m === mDiese) { je[k].d += z5; je[k].da += alle; } else { je[k].l += z5; je[k].la += alle; }
    });
    var namen = Object.keys(je).sort();
    if (!namen.length) return h('p', { class: 'muted', text: 'Noch keine bestätigte Bewertung in diesem oder im letzten Monat.' });
    function zelle(n, alle, th) {
      return h(th ? 'th' : 'td', { class: 'z' }, String(n), alle > n ? h('span', { class: 'muted klein', text: ' (von ' + alle + ' bestätigt)' }) : null);
    }
    var summeD = 0, summeL = 0, alleD = 0, alleL = 0;
    var zeilen = namen.map(function (k) {
      summeD += je[k].d; summeL += je[k].l; alleD += je[k].da; alleL += je[k].la;
      return h('tr', {}, h('td', { text: k }), zelle(je[k].d, je[k].da), zelle(je[k].l, je[k].la));
    });
    zeilen.push(h('tr', {}, h('th', { text: 'Summe' }), zelle(summeD, alleD, true), zelle(summeL, alleL, true)));
    return h('table', { class: 'vkb-tab' },
      h('thead', {}, h('tr', {}, h('th', { text: 'Verkäufer' }), h('th', { class: 'z', text: 'Diesen Monat (5 Sterne)' }), h('th', { class: 'z', text: 'Letzten Monat (5 Sterne)' }))),
      h('tbody', {}, zeilen));
  }

  function zeichne() {
    if (!S.root) return;
    S.root.innerHTML = '';
    S.root.appendChild(h('h2', { text: 'Bewertungen zuordnen' }));
    S.root.appendChild(h('p', { class: 'muted klein', text: 'Neue Google-Rezensionen mit dem Vorschlag, zu welchem Verkauf sie gehören. Zugeordnet wird jede bestätigte Bewertung; für die Provision des Verkäufers zählen aber nur 5 Sterne.' }));
    if (S.fehler) { S.root.appendChild(EG.banner(S.fehler, 'warn')); return; }
    var offen = S.vorschlaege.filter(function (v) { return v.status === 'offen'; });
    S.root.appendChild(h('h3', { text: 'Offene Vorschläge (' + offen.length + ')' }));
    if (!offen.length) S.root.appendChild(h('p', { class: 'muted', text: 'Keine offenen Vorschläge. Claude trägt neue Rezensionen im Wochenlauf ein.' }));
    else S.root.appendChild(h('div', { role: 'list' }, offen.map(karte)));
    S.root.appendChild(h('h3', { text: 'Provision: bestätigte 5-Sterne-Bewertungen je Verkäufer' }));
    S.root.appendChild(h('p', { class: 'muted klein', text: 'Für die Provision zählen nur Bewertungen mit 5 Sternen. Alle bestätigten Bewertungen bleiben der Akte zugeordnet und sichtbar. Die Bitte um eine Bewertung geht weiter an jeden Kunden – das nennst du Kunden gegenüber nie.' }));
    S.root.appendChild(provisionTab());
  }

  /** Abschnitt in den Reiter Übersicht hängen (nur Büro-Rollen). opts.onGeaendert: wird nach Bestätigen/Verwerfen aufgerufen (Übersicht neu laden). */
  async function abschnitt(root, opts) {
    if (!root) return;
    if (BUERO.indexOf(EG.rolle) < 0) { root.innerHTML = ''; return; }
    S.root = root; S.opts = opts || null;
    if (S.laedt) return;
    S.laedt = true;
    try {
      root.innerHTML = '';
      root.appendChild(h('p', { class: 'muted', text: 'Lade Bewertungen …' }));
      await laden();
    } finally { S.laedt = false; }
    zeichne();
  }

  window.VK_BEWERTUNGEN = { abschnitt: abschnitt };
})();
