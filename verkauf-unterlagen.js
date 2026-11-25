/* Stieber-App – Bereich „Unterlagen“ und Feld „Lieferanten-AB“ in der Verkaufsakte (Version 1.1, Stand 25.11.2026, Skill dispo-unterlagen P1/P2)
   v1.1 (25.11.2026, Oli „A umsetzen“): PDFs in den Unterlagen zählen als Quelle für Punkte des Verkaufsablaufs (verkauf-phasen.js, Quelle { dokument: '<art>' }):
   - VK_DU.dokumenteFuerAkten(ids) → { akte_id: { art: neueste Zeile } } – EINE Abfrage für viele Akten (je 30 Akten ein Aufruf); Rollen ohne Leserecht oder fehlende Tabelle → leer, kein Fehler
   - VK_DU.dokumenteInPm(pm, dokMap) → setzt pm.dok.<art> = Zeile mit status 'ok' (so rechnen Ampel, Fortschritt und alle Reiter damit wie mit jedem Haken)
   - VK_DU.springe(akteId) → scrollt zu #du-box (öffnet bei Bedarf zuerst die Akte im Reiter Verkauf)
   - Nach Upload/Löschen meldet das Modul das Ereignis „vk-dokumente-geaendert“ ({ akteId }) – der Reiter Verkauf rechnet dann neu.
   Eingebunden von eingang-verkauf.js (Detailansicht der Akte): window.VK_DU.zeichne(box, akte, beiAkteNeu).

   Daten (SQL: 08b Fahrzeug-Verkauft/Skills/dispo-unterlagen/sql/2026-11-25_dispo_unterlagen_p1-p3_v1.sql, im Hauptprojekt erst nach Olis Ja):
   - Privater Bucket „akte-dokumente“ (nur PDF, 20 MB), Pfad <akte_id>/<art>_<JJJJMMTT-HHMMSS>.pdf, art = ab | uebergabeprotokoll | zahlungsaufstellung | schild
   - Tabelle verkauf.dokument (akte_id, art, pfad, dateiname; Name/Nummer/Zeit setzt die Datenbank)
   - verkauf.akte.lieferant_ab_datum (+ lieferant_ab_von_name, setzt der Trigger)
   Fehlen Tabelle oder Spalte (SQL noch nicht eingespielt), wird der jeweilige Teil still ausgeblendet – kein Fehler.

   Rollen: sehen = admin, dispo, buchhaltung, verkauf (nur lesend) · hochladen und Lieferanten-AB ändern = admin, dispo, buchhaltung · löschen = nur admin.
   werkstatt/aufbereitung sehen nichts (der Reiter Verkauf ist für sie ohnehin nicht da; hier zusätzlich geprüft).

   Für Automaten (stabile ids): Datei-Eingabe  #du-upload-ab · #du-upload-uebergabeprotokoll · #du-upload-zahlungsaufstellung · #du-upload-schild
                               Statusanzeige   #du-status (Text „gespeichert“ nach dem Upload) · Lieferanten-AB: #du-ab-datum, #du-ab-speichern, #du-ab-leeren
   Demo (?demo=1): gleiche Ansicht mit Demo-Speicher; Upload geht in den Speicher der Seite (nichts wird hochgeladen). */
(function () {
  'use strict';
  var EG = window.EG, h = EG && EG.h;
  if (!EG) return;

  var BUCKET = 'akte-dokumente';
  var MAX_BYTES = 20 * 1024 * 1024;
  var SEHEN = ['admin', 'dispo', 'buchhaltung', 'verkauf'];
  var SCHREIBEN = ['admin', 'dispo', 'buchhaltung'];
  var ARTEN = [
    { art: 'ab', name: 'Auftragsbestätigung' },
    { art: 'uebergabeprotokoll', name: 'Übergabeprotokoll' },
    { art: 'zahlungsaufstellung', name: 'Zahlungsaufstellung' },
    { art: 'schild', name: 'Begrüßungsschild' }
  ];

  var CSS = [
    '#du-box .du-zeile{display:flex;flex-wrap:wrap;align-items:center;gap:8px 12px;padding:10px 0;border-top:1px solid var(--border,#d5dbe5)}',
    '#du-box .du-zeile:first-of-type{border-top:0}',
    '#du-box .du-name{flex:0 0 190px;font-weight:700}',
    '#du-box .du-info{flex:1 1 220px;min-width:0;font-size:15px}',
    '#du-box .du-knoepfe{display:flex;flex-wrap:wrap;gap:8px;align-items:center}',
    '#du-box .du-datei{position:relative;display:inline-flex;overflow:hidden}',
    '#du-box .du-datei input[type=file]{position:absolute;left:0;top:0;width:100%;height:100%;opacity:0;cursor:pointer;font-size:0}',
    '#du-box details.du-aelter{flex:1 1 100%;margin-top:2px}',
    '#du-box details.du-aelter > summary{cursor:pointer;color:var(--blau-dark,#0A5CD0);font-weight:600;min-height:32px;display:flex;align-items:center}',
    '#du-box .du-alt{display:flex;flex-wrap:wrap;align-items:center;gap:6px 12px;padding:6px 0 6px 12px;border-left:3px solid var(--border,#d5dbe5);margin:4px 0}',
    '#du-box .du-alt span.du-info{flex:1 1 200px}',
    '#du-box .du-ab{display:flex;flex-wrap:wrap;gap:8px 12px;align-items:center}',
    '#du-box .du-ab input[type=date]{min-height:44px;font:inherit;padding:0 10px;border:1px solid var(--border,#d5dbe5);border-radius:12px}',
    '#du-box .du-hinweis{font-size:14px;color:var(--sub,#5b6778);margin:6px 0 0}',
    '#du-status{font-weight:700;color:var(--gruen-text,#1a7f37)}'
  ].join('\n');
  function stilEinbauen() {
    if (document.getElementById('du-stil')) return;
    var st = document.createElement('style'); st.id = 'du-stil'; st.textContent = CSS; document.head.appendChild(st);
  }

  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function stempel() { var d = new Date(); return d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate()) + '-' + pad(d.getHours()) + pad(d.getMinutes()) + pad(d.getSeconds()); }
  function darfSehen() { return SEHEN.indexOf(EG.rolle) >= 0; }
  function darfSchreiben() { return SCHREIBEN.indexOf(EG.rolle) >= 0; }
  function darfLoeschen() { return EG.rolle === 'admin'; }
  function datumZeit(s) { return s ? (EG.fmtZeit ? EG.fmtZeit(s) : String(s)) : '–'; }
  function bucket() { return EG.sb.storage.from(BUCKET); }

  /* ---------- Demo: ein Mini-PDF + zwei Beispielzeilen, damit die Ansicht etwas zeigt ---------- */
  var demoFertig = false;
  async function demoSaat() {
    if (!EG.demo || demoFertig) return;
    demoFertig = true;
    try {
      var akteId = 'a0000001-0000-4000-8000-000000000002';   // Demo-Akte 90102
      var pdf = '%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 300 120]>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF';
      var blob = new Blob([pdf], { type: 'application/pdf' });
      var zeilen = [
        { art: 'ab', t: '20261120-101500', n: 'AB_Demo_v1.pdf', ts: '2026-11-20T10:15:00Z' },
        { art: 'ab', t: '20261122-143000', n: 'AB_Demo_v2.pdf', ts: '2026-11-22T14:30:00Z' },
        { art: 'zahlungsaufstellung', t: '20261123-090000', n: 'Zahlungsaufstellung_Demo.pdf', ts: '2026-11-23T09:00:00Z' },
        { art: 'schild', t: '20261124-081000', n: 'Schild_Demo.pdf', ts: '2026-11-24T08:10:00Z' }
      ];
      var rows = [];
      for (var i = 0; i < zeilen.length; i++) {
        var z = zeilen[i], pfad = akteId + '/' + z.art + '_' + z.t + '.pdf';
        await bucket().upload(pfad, blob);
        rows.push({ id: EG.uuid(), akte_id: akteId, interne_nr: '90102', art: z.art, pfad: pfad, dateiname: z.n, erstellt_von_name: 'Dispo (Demo)', created_at: z.ts });
      }
      EG.demoSeed('verkauf.dokument', rows);
    } catch (e) { console.warn('Demo Unterlagen:', e && e.message); }
  }

  /* ---------- Laden ---------- */
  /** → { ok:false } wenn die Tabelle fehlt/nicht lesbar ist, sonst { ok:true, liste } (neueste zuerst). */
  async function dokumenteLaden(akteId) {
    try {
      var r = await EG.tab('verkauf', 'dokument').select('*').eq('akte_id', akteId).order('created_at', { ascending: false });
      if (r.error) { console.warn('Unterlagen nicht verfügbar (SQL eingespielt?):', r.error.message); return { ok: false, liste: [] }; }
      return { ok: true, liste: r.data || [] };
    } catch (e) { console.warn('Unterlagen:', e && e.message); return { ok: false, liste: [] }; }
  }

  /* ---------- Quelle für den Verkaufsablauf (v1.1) ---------- */
  /** Neueste PDF je Art für viele Akten mit wenigen Abfragen. → { akte_id: { art: Zeile } }. Kein Leserecht / Tabelle fehlt → {} (Quelle zählt dann einfach nicht). */
  async function dokumenteFuerAkten(ids) {
    var out = {};
    ids = (ids || []).filter(Boolean);
    if (!darfSehen() || !ids.length) return out;
    try {
      await demoSaat();
      var teile = [];
      for (var i = 0; i < ids.length; i += 30) teile.push(ids.slice(i, i + 30));
      var res = await Promise.all(teile.map(function (t) {
        return EG.tab('verkauf', 'dokument').select('akte_id,art,created_at,erstellt_von_name,dateiname').in('akte_id', t).order('created_at', { ascending: false });
      }));
      res.forEach(function (r) {
        if (r.error) { console.warn('Unterlagen (Quelle für Punkte) nicht lesbar:', r.error.message); return; }
        (r.data || []).forEach(function (d) {
          var m = (out[d.akte_id] = out[d.akte_id] || {});
          if (!m[d.art]) m[d.art] = d;   // neueste zuerst
        });
      });
    } catch (e) { console.warn('Unterlagen (Quelle für Punkte):', e && e.message); }
    return out;
  }
  /** Legt je vorhandener Art eine „ok“-Zeile unter pm.dok ab (wird bei jedem Laden neu gesetzt, nie gespeichert). */
  function dokumenteInPm(pm, dokMap) {
    var m = {};
    Object.keys(dokMap || {}).forEach(function (art) {
      var d = dokMap[art];
      m[art] = { status: 'ok', wert: { text: EG.fmtDatum(d.created_at) + (d.erstellt_von_name ? ', von ' + d.erstellt_von_name : '') },
        erledigt_von_name: d.erstellt_von_name || null, erledigt_am: d.created_at || null, grund: null, dokument: true, dateiname: d.dateiname || null };
    });
    pm.dok = m;
    return pm;
  }
  function melde(akteId) {
    try { document.dispatchEvent(new CustomEvent('vk-dokumente-geaendert', { detail: { akteId: akteId } })); } catch (e) { /* egal */ }
  }
  /** Springt zu #du-box. Ist die Akte nicht offen, wird sie im Reiter Verkauf geöffnet und dann gescrollt. */
  function springe(akteId) {
    function los() {
      var b = document.getElementById('du-box');
      if (b) { try { b.scrollIntoView({ behavior: 'smooth', block: 'start' }); } catch (e) { b.scrollIntoView(); } return true; }
      return false;
    }
    var box = document.getElementById('du-box');
    var offen = !!box && box.offsetParent !== null && window.VK_AKTE_AKTUELL && window.VK_AKTE_AKTUELL() === akteId;
    if (offen && los()) return;
    if (typeof window.VK_AKTE_OEFFNEN === 'function') window.VK_AKTE_OEFFNEN(akteId);
    var n = 0, t = setInterval(function () {
      n++;
      var b = document.getElementById('du-box');
      if ((b && b.childNodes.length && los()) || n > 50) clearInterval(t);
    }, 150);
  }

  /* ---------- Öffnen ---------- */
  async function oeffnen(d) {
    var w = null;
    try { w = window.open('', '_blank'); } catch (e) { w = null; }
    try {
      var r = await bucket().createSignedUrl(d.pfad, 600);
      if (r.error) throw r.error;
      var url = r.data.signedUrl;
      if (w) { try { w.opener = null; } catch (e) { /* egal */ } w.location.href = url; } else window.open(url, '_blank', 'noopener');
    } catch (err) { if (w) w.close(); EG.fehler(err); }
  }

  /* ---------- Hochladen ---------- */
  async function hochladen(akte, art, datei, neuZeichnen) {
    if (!datei) return;
    var istPdf = datei.type === 'application/pdf' || /\.pdf$/i.test(datei.name || '');
    if (!istPdf) { EG.toast('Nur PDF-Dateien sind erlaubt.', 'fehler'); return; }
    if (datei.size > MAX_BYTES) { EG.toast('Die Datei ist größer als 20 MB.', 'fehler'); return; }
    var pfad = akte.id + '/' + art + '_' + stempel() + '.pdf';
    var st = document.getElementById('du-status');
    if (st) st.textContent = 'Lade hoch …';
    var up = await bucket().upload(pfad, datei, { contentType: 'application/pdf', upsert: false });
    if (up.error) throw up.error;
    var row = { akte_id: akte.id, art: art, pfad: pfad, dateiname: datei.name || (art + '.pdf') };
    if (EG.demo) { row.interne_nr = akte.interne_nr || null; row.erstellt_von_name = EG.nutzerName(); }
    var ins = await EG.tab('verkauf', 'dokument').insert(row);
    if (ins && ins.error) {
      try { await bucket().remove([pfad]); } catch (e) { /* Datei bleibt ggf. liegen; Admin kann sie löschen */ }
      throw ins.error;
    }
    EG.toast('gespeichert', 'ok');
    await neuZeichnen('gespeichert');
    melde(akte.id);
  }

  /* ---------- Löschen (nur admin) ---------- */
  async function loeschen(d, neuZeichnen) {
    if (!darfLoeschen()) return;
    var ja = await EG.bestaetigen('Die Datei „' + d.dateiname + '“ (' + (ARTEN.filter(function (a) { return a.art === d.art; })[0] || {}).name + ', ' + datumZeit(d.created_at) + ') wird endgültig gelöscht. Das lässt sich nicht rückgängig machen.', { ja: 'Endgültig löschen', gefahr: true, titel: 'Unterlage löschen?' });
    if (!ja) return;
    var r = await EG.tab('verkauf', 'dokument').delete().eq('id', d.id);
    if (r && r.error) throw r.error;
    try { await bucket().remove([d.pfad]); } catch (e) { console.warn('Datei im Bucket nicht entfernt:', e && e.message); }
    EG.toast('Unterlage gelöscht.', 'ok');
    await neuZeichnen();
    melde(d.akte_id);
  }

  /* ---------- Darstellung ---------- */
  function infoText(d) { return datumZeit(d.created_at) + ' · von ' + (d.erstellt_von_name || '–') + ' · ' + d.dateiname; }

  function zeile(akte, def, liste, neuZeichnen) {
    var neu = liste[0], aelter = liste.slice(1);
    var z = h('div', { class: 'du-zeile', 'data-art': def.art });
    z.appendChild(h('div', { class: 'du-name', text: def.name }));
    z.appendChild(h('div', { class: 'du-info' }, neu ? h('span', { text: infoText(neu) }) : h('span', { class: 'muted', text: 'noch nicht vorhanden' })));
    var kn = h('div', { class: 'du-knoepfe' });
    if (neu) kn.appendChild(h('button', { type: 'button', class: 'btn btn-ghost btn-klein', id: 'du-oeffnen-' + def.art, text: 'Öffnen', onclick: function () { oeffnen(neu); } }));
    if (darfSchreiben()) {
      var inp = h('input', { type: 'file', accept: 'application/pdf', id: 'du-upload-' + def.art, 'aria-label': def.name + ' hochladen' });
      inp.addEventListener('change', function () {
        var f = inp.files && inp.files[0];
        hochladen(akte, def.art, f, neuZeichnen).catch(EG.fehler).then(function () { inp.value = ''; });
      });
      kn.appendChild(h('label', { class: 'btn btn-ghost btn-klein du-datei' }, 'PDF hochladen', inp));
    }
    if (neu && darfLoeschen()) kn.appendChild(h('button', { type: 'button', class: 'btn btn-gefahr btn-klein', text: 'Löschen …', onclick: function () { loeschen(neu, neuZeichnen).catch(EG.fehler); } }));
    z.appendChild(kn);
    if (aelter.length) {
      var det = h('details', { class: 'du-aelter' }, h('summary', { text: aelter.length + (aelter.length === 1 ? ' ältere Fassung' : ' ältere Fassungen') }));
      aelter.forEach(function (d) {
        var a = h('div', { class: 'du-alt' }, h('span', { class: 'du-info', text: infoText(d) }),
          h('button', { type: 'button', class: 'btn btn-ghost btn-klein', text: 'Öffnen', onclick: function () { oeffnen(d); } }));
        if (darfLoeschen()) a.appendChild(h('button', { type: 'button', class: 'btn btn-gefahr btn-klein', text: 'Löschen …', onclick: function () { loeschen(d, neuZeichnen).catch(EG.fehler); } }));
        det.appendChild(a);
      });
      z.appendChild(det);
    }
    return z;
  }

  function abFeld(akte, beiAkteNeu, neuZeichnen) {
    var kopf = h('h3', { text: 'Lieferanten-AB liegt vor', style: 'margin:0 0 8px;font-size:17px' });
    var k = h('div', {}, kopf);
    var hat = akte.lieferant_ab_datum;
    if (darfSchreiben()) {
      var inp = h('input', { type: 'date', id: 'du-ab-datum', value: hat || '', 'aria-label': 'Datum der Lieferanten-AB' });
      var zeile1 = h('div', { class: 'du-ab' }, inp,
        h('button', { type: 'button', class: 'btn btn-primary btn-klein', id: 'du-ab-speichern', text: 'Speichern', onclick: function () {
          if (!inp.value) { EG.toast('Bitte ein Datum wählen (oder „Leeren“).', 'fehler'); return; }
          abSetzen(akte, inp.value, beiAkteNeu, neuZeichnen).catch(EG.fehler);
        } }),
        hat ? h('button', { type: 'button', class: 'btn btn-ghost btn-klein', id: 'du-ab-leeren', text: 'Leeren', onclick: function () { abSetzen(akte, null, beiAkteNeu, neuZeichnen).catch(EG.fehler); } }) : null);
      k.appendChild(zeile1);
    } else {
      k.appendChild(h('div', { text: hat ? EG.fmtDatum(hat) : 'noch nicht eingetragen', class: hat ? 'fett' : 'muted' }));
    }
    if (hat) k.appendChild(h('p', { class: 'du-hinweis', text: 'Eingetragen von ' + (akte.lieferant_ab_von_name || '–') + (darfSchreiben() ? '' : '.') }));
    k.appendChild(h('p', { class: 'du-hinweis', text: 'Bei Bestellfahrzeugen: Datum setzen, sobald die Auftragsbestätigung des Lieferanten da ist – dann entsteht die Aufgabe ‚Auftragsbestätigung an den Kunden‘.' }));
    return k;
  }
  async function abSetzen(akte, datum, beiAkteNeu, neuZeichnen) {
    var upd = { lieferant_ab_datum: datum, updated_at: new Date().toISOString() };
    if (EG.demo) upd.lieferant_ab_von_name = datum ? EG.nutzerName() : null;   // echt setzt der Trigger den Namen
    var r = await EG.tab('verkauf', 'akte').update(upd).eq('id', akte.id).select().single();
    if (r.error) throw r.error;
    if (r.data) { Object.assign(akte, r.data); if (beiAkteNeu) beiAkteNeu(r.data); }
    EG.toast(datum ? 'Lieferanten-AB eingetragen.' : 'Lieferanten-AB geleert.', 'ok');
    await neuZeichnen();
  }

  /** Zeichnet den Bereich in box. beiAkteNeu(akteZeile) wird nach Änderung der Akte gerufen. Fehler → Bereich bleibt leer. */
  async function zeichne(box, akte, beiAkteNeu) {
    if (!box || !akte) return;
    stilEinbauen();
    box.innerHTML = '';
    if (!darfSehen()) return;
    var meldung = null;
    async function neuZeichnen(m) { meldung = m || null; await bauen(); }
    async function bauen() {
      await demoSaat();
      var dok = await dokumenteLaden(akte.id);
      var abDa = EG.demo || Object.prototype.hasOwnProperty.call(akte, 'lieferant_ab_datum');
      box.innerHTML = '';
      if (!dok.ok && !abDa) return;   // nichts davon eingespielt → Bereich ausgeblendet
      var karte = h('div', { class: 'karte', style: 'margin-top:18px' });
      if (dok.ok) {
        karte.appendChild(h('div', { class: 'karte-kopf' }, h('h2', { text: 'Unterlagen' }),
          h('span', { id: 'du-status', role: 'status', text: meldung || '' })));
        ARTEN.forEach(function (def) {
          karte.appendChild(zeile(akte, def, dok.liste.filter(function (d) { return d.art === def.art; }), neuZeichnen));
        });
        if (!darfSchreiben()) karte.appendChild(h('p', { class: 'du-hinweis', text: 'Du kannst die Unterlagen öffnen. Hochladen und Ändern machen Dispo, Buchhaltung und Oli.' }));
      }
      if (abDa) {
        var ab = abFeld(akte, beiAkteNeu, neuZeichnen);
        ab.style.marginTop = dok.ok ? '16px' : '0';
        if (dok.ok) ab.style.borderTop = '1px solid var(--border,#d5dbe5)', ab.style.paddingTop = '12px';
        else karte.appendChild(h('div', { class: 'karte-kopf' }, h('h2', { text: 'Lieferanten-AB' })));
        karte.appendChild(ab);
      }
      box.appendChild(karte);
      if (meldung) setTimeout(function () { var s = document.getElementById('du-status'); if (s && s.textContent === meldung) s.textContent = ''; }, 6000);
    }
    await bauen();
  }

  window.VK_DU = {
    version: '1.1',
    ARTEN: ARTEN,
    dokumenteFuerAkten: dokumenteFuerAkten,
    dokumenteInPm: dokumenteInPm,
    springe: springe,
    zeichne: function (box, akte, beiAkteNeu) { return zeichne(box, akte, beiAkteNeu).catch(function (e) { console.warn('Unterlagen:', e && e.message); if (box) box.innerHTML = ''; }); }
  };
})();
