/* Fahrzeugeingang-Tool – Reiter „Anlieferung“: Aufgaben nach der Anlieferung + Abschnitt „Inzahlungnahmen“
   Stand 19.11.2026 (App 4.9). Reihenfolge nach Olis Abstimmung (Gesamtliste-Entwurf v1):
   A Beim Abladen · B Prüfen im Detail · C Papierkram und verkaufsbereit machen.
   Gilt für Inzahlungnahmen (IZ, public.fahrzeugankauf nach „Fahrzeug übernehmen“) und Lieferantenfahrzeuge (L, eingang.fahrzeug).
   Bei L stehen FIN, Papiere, Schlüssel, Schäden, Ausstattung und Zubehör in der Eingangsprüfung (OK/Mangel/Rüge), deshalb hier nicht doppelt.
   Daten: eingang.inzahlung_aufgabe (ankauf_id ODER fahrzeug_id, punkt, status, notiz, fotos, daten, Name, Datum).
   Vorschläge werden nur angezeigt und erst mit einem Tipp übernommen (Oli, 19.11.2026).
   Baut auf window.EG (eingang-core.js) und window.IZ_INFO (eingang-inzahlung.js) auf. */
(function () {
  'use strict';
  var EG = window.EG, h = EG.h;

  var UEBERNOMMEN = ['ok', 'abweichung_geklaert'];
  var GRUPPEN = { A: 'Beim Abladen', B: 'Prüfen im Detail', C: 'Papierkram und verkaufsbereit machen' };
  // k = Schlüssel in eingang.inzahlung_aufgabe.punkt (nicht ändern, sonst gehen Häkchen verloren). fuer: L und/oder IZ.
  var PUNKTE = [
    { g: 'A', k: 'fin', t: 'FIN am Fahrzeug = Ankauf', fuer: ['IZ'], foto: true, hinweis: 'FIN an Typschild bzw. Scheibe mit Kaufvertrag und Zulassungsbescheinigung vergleichen.' },
    { g: 'A', k: 'km', t: 'Kilometerstand mit Tacho-Foto', fuer: ['IZ'], foto: true },
    { g: 'A', k: 'papiere', t: 'Papiere: ZB I, ZB II, Serviceheft', fuer: ['IZ'], foto: true },
    { g: 'A', k: 'schluessel', t: 'Schlüssel: Anzahl und Funktion', fuer: ['IZ'] },
    { g: 'A', k: 'schaeden_optisch', t: 'Schäden optisch (außen und innen)', fuer: ['IZ'], foto: true, hinweis: 'Rundgang: Lack, Dellen, Kratzer, Felgen, Scheiben, Leuchten, Innenraum – jeder Schaden mit Foto.' },
    { g: 'A', k: 'schaeden_technik', t: 'Schäden technisch', fuer: ['IZ'], foto: true, hinweis: 'Warnleuchten nach Motorstart, kurze Probefahrt.' },
    { g: 'A', k: 'cmr', t: 'CMR an Lieferant bzw. Spedition', fuer: ['L'], foto: true, hinweis: 'Nur bei Transportschaden: Schaden auf dem Frachtbrief (CMR) vermerken, vom Fahrer gegenzeichnen lassen und an Lieferant bzw. Spedition senden. Ohne Schaden: „Entfällt“.' },
    { g: 'A', k: 'interne_nr', t: 'Interne Nummer ins Fahrzeug gestellt', fuer: ['L', 'IZ'] },
    { g: 'A', k: 'ablage', t: 'Papiere und Zweitschlüssel abgelegt', fuer: ['L', 'IZ'], hinweis: 'Papiere in den Tresor, Zweitschlüssel in den Schlüsselkasten.' },
    { g: 'B', k: 'raeder', t: 'Räder erfasst', fuer: ['L', 'IZ'], erfassen: 'raeder', hinweis: 'Je Radsatz (montiert und eingelagert): Sommer, Winter oder Ganzjahr, Profiltiefe vorne/hinten, Reifenmarke, Felge Alu/Stahl mit Größe, Foto.' },
    { g: 'B', k: 'lackmessung', t: 'Lackschichtmessung', fuer: ['L', 'IZ'], erfassen: 'lack', hinweis: 'Bei Neuwagen: „Entfällt“.' },
    { g: 'B', k: 'ausstattung', t: 'Ausstattung geprüft', fuer: ['IZ'], hinweis: 'Mit der Bewertung und der FIN-Abfrage vergleichen.' },
    { g: 'B', k: 'zubehoer', t: 'Zubehör und Fehlteile geprüft', fuer: ['IZ'], foto: true, hinweis: 'Ladekabel (E/PHEV), Warndreieck, Verbandkasten, Bordwerkzeug, Anleitung, Kofferraumabdeckung.' },
    { g: 'B', k: 'werkstatt', t: 'Werkstatt bzw. Aufbereitung beauftragt', fuer: ['L', 'IZ'], hinweis: 'HU/Service fällig? Mängel? Auftrag anlegen bzw. Aufbereitung einplanen.' },
    { g: 'C', k: 'abmelden', t: 'Fahrzeug abmelden', fuer: ['IZ'], hinweis: 'Außerbetriebsetzung bei der Zulassungsstelle; Kennzeichen entwerten lassen.' },
    { g: 'C', k: 'abloesung_bank', t: 'Ablösung bei der Bank des Kunden', fuer: ['IZ'], hinweis: 'Nur nötig, wenn das Fahrzeug finanziert ist bzw. die ZB II bei der Bank liegt. Ablösebetrag anfragen, ablösen, ZB II anfordern.' },
    { g: 'C', k: 'einfinanzieren', t: 'Einfinanzieren (EK-Finanzierung)', fuer: ['L', 'IZ'], hinweis: 'Fahrzeug bei der Einkaufsfinanzierung anmelden.' },
    { g: 'C', k: 'repdoc_ankauf', t: 'Ankauf in Repdoc durchgeführt', fuer: ['L', 'IZ'], hinweis: 'Handelsakte mit Ankauf (Preis, Datum, Besteuerung).' },
    { g: 'C', k: 'masterliste', t: 'In Masterliste / Stieber-App eingetragen', fuer: ['L', 'IZ'], hinweis: 'Inklusive Bereifung (Kurztext unter „Räder erfasst“).' },
    { g: 'C', k: 'fahrzeugbilder', t: 'Fahrzeugbilder für die Börsen', fuer: ['L', 'IZ'] },
    { g: 'C', k: 'autrado', t: 'Fahrzeug in Autrado angelegt bzw. abgeglichen', fuer: ['L', 'IZ'], hinweis: 'Inklusive Räder und Ausstattung.' },
    { g: 'C', k: 'preisschild', t: 'Preisschild gedruckt und ins Fahrzeug', fuer: ['L', 'IZ'] }
  ];
  function punkteFuer(art) { return PUNKTE.filter(function (p) { return p.fuer.indexOf(art) >= 0; }); }
  var ST_TEXT = { erledigt: 'Erledigt', entfaellt: 'Entfällt', offen: 'Offen' };
  var RAD_ARTEN = ['Sommer', 'Winter', 'Ganzjahr'];
  var REIFEN_BEW = [['sommer', 'Sommer'], ['winter', 'Winter'], ['ganzjahres', 'Ganzjahr']];

  function chk(r) { if (r && r.error) throw r.error; return r; }
  function jetzt() { return new Date().toISOString(); }
  function info() { return window.IZ_INFO || {}; }
  function TA() { return EG.tab('eingang', 'inzahlung_aufgabe'); }
  function erledigt(row) { return !!row && (row.status === 'erledigt' || row.status === 'entfaellt'); }
  function zahl(s) { if (s === '' || s == null) return null; var n = parseFloat(String(s).replace(',', '.')); return isNaN(n) ? null : n; }
  function mm(n) { return n == null ? '–' : String(n).replace('.', ','); }

  /** Kurztext der Räder für Masterliste und Akte, z. B. „Sommer Alu 17″ Michelin 6/5 mm (montiert) · Winter Stahl 16″ Conti 5/5 mm“. */
  function raederText(daten) {
    var rs = (daten && daten.radsaetze) || [];
    return rs.map(function (r) {
      return [r.art, r.felge, r.zoll ? r.zoll + '″' : '', r.marke, (r.va != null || r.ha != null) ? mm(r.va) + '/' + mm(r.ha) + ' mm' : '', r.montiert ? '(montiert)' : '(eingelagert)']
        .filter(Boolean).join(' ');
    }).join(' · ');
  }

  /* ====================================================================
     Aufgaben-Block (für IZ und L): EG-Element, das sich selbst lädt und neu zeichnet.
     o = { art: 'IZ'|'L', besitzer: Zeile (fahrzeugankauf bzw. eingang.fahrzeug), onAenderung?: fn() }
     ==================================================================== */
  function block(o) {
    var B = { art: o.art, x: o.besitzer, rows: {}, bestand: null, el: h('div', { class: 'aufg-block' }) };
    B.spalte = o.art === 'IZ' ? 'ankauf_id' : 'fahrzeug_id';
    B.pfad = (o.art === 'IZ' ? 'inzahlung/' : 'lieferant/') + B.x.id;
    B.el.appendChild(h('p', { class: 'muted', text: 'Lade Aufgaben …' }));
    (async function () {
      var r = chk(await TA().select('*').eq(B.spalte, B.x.id));
      (r.data || []).forEach(function (z) { B.rows[z.punkt] = z; });
      B.bestand = await bestandFinden(B.x.interne_nr, o.art === 'IZ' ? B.x.fz_fahrgestellnr : B.x.fin);
      zeichneBlock(B, o);
    })().catch(function (e) {
      B.el.innerHTML = '';
      var m = String((e && e.message) || e);
      B.el.appendChild(EG.banner(/fahrzeug_id|inzahlung_aufgabe|daten|fotos/.test(m) ? 'Die Aufgabenliste ist in der Datenbank noch nicht vollständig eingerichtet.' : 'Aufgaben konnten nicht geladen werden: ' + m, 'warn'));
    });
    return B.el;
  }
  async function bestandFinden(nr, fin) {
    try {
      fin = (fin || '').toUpperCase();
      var t = [];
      if (nr) t = t.concat(chk(await EG.tab('bestand', 'fahrzeug').select('stieber_id,ml_ref,interne_nr,fin,fahrzeugstatus,bereifung').eq('interne_nr', nr)).data || []);
      if (!t.length && fin.length === 17) t = t.concat(chk(await EG.tab('bestand', 'fahrzeug').select('stieber_id,ml_ref,interne_nr,fin,fahrzeugstatus,bereifung').eq('fin', fin)).data || []);
      return t[0] || null;
    } catch (e) { return null; }
  }
  function zeichneBlock(B, o) {
    var y = window.scrollY, el = B.el, liste = punkteFuer(B.art);
    el.innerHTML = '';
    var n = liste.filter(function (p) { return erledigt(B.rows[p.k]); }).length;
    el.appendChild(h('h2', { text: 'Nach der Anlieferung zu tun', style: 'margin:18px 0 4px' }));
    el.appendChild(h('p', { class: 'muted klein', text: n + ' von ' + liste.length + ' Punkten erledigt oder entfallen.' + (B.art === 'L' ? ' FIN, Papiere, Schlüssel, Schäden und Ausstattung stehen oben in der Eingangsprüfung.' : '') }));
    Object.keys(GRUPPEN).forEach(function (g) {
      var pg = liste.filter(function (p) { return p.g === g; });
      if (!pg.length) return;
      var ng = pg.filter(function (p) { return erledigt(B.rows[p.k]); }).length;
      el.appendChild(h('div', { class: 'block-kopf' }, h('h3', { text: g + ' · ' + GRUPPEN[g] }), h('span', { class: 'klein muted', text: ng + ' / ' + pg.length })));
      pg.forEach(function (p) { el.appendChild(punktKarte(B, o, p)); });
    });
    if (n === liste.length) el.appendChild(EG.banner('Alle Punkte sind erledigt.', 'ok'));
    window.scrollTo(0, y);
  }

  /** Vorschlag je Punkt: { text, status?, notiz?, rot? } oder null. Wird nur angezeigt, übernommen erst per Tipp. */
  function vorschlag(B, p) {
    var a = B.x, iz = B.art === 'IZ', cl = (iz && a.uebernahme_checkliste) || {};
    if (p.k === 'km' && iz && a.uebernahme_km != null) {
      var t = 'Bei der Übernahme erfasst: ' + Number(a.uebernahme_km).toLocaleString('de-DE') + ' km' + (cl.km_foto ? ' (mit Tacho-Foto)' : '');
      return { text: t, status: 'erledigt', notiz: t, fotos: cl.km_foto ? [cl.km_foto] : undefined };
    }
    if (p.k === 'papiere' && iz && (cl.zb1 != null || cl.zb2 != null)) {
      var tp = 'Bei der Übernahme: ZB I ' + (cl.zb1 ? 'vorhanden' : 'fehlt') + ', ZB II ' + (cl.zb2 ? 'vorhanden' : 'fehlt (z. B. bei der Bank)');
      return { text: tp, status: 'erledigt', notiz: tp, rot: cl.zb2 === false };
    }
    if (p.k === 'schluessel' && iz && a.uebernahme_schluessel != null) {
      var ts = 'Bei der Übernahme: ' + a.uebernahme_schluessel + ' Schlüssel' + (a.fz_anzahl_schluessel != null ? ' (Bewertung: ' + a.fz_anzahl_schluessel + ')' : '');
      return { text: ts + ' – Funktion noch prüfen.', status: 'erledigt', notiz: ts };
    }
    if (p.k === 'schaeden_optisch' && iz && cl.keine_neuen_schaeden != null) {
      var ns = cl.neue_schaeden || [];
      var tsch = cl.keine_neuen_schaeden ? 'Bei der Übernahme: keine neuen Schäden gegenüber der Bewertung.' : 'Bei der Übernahme erfasst: ' + ns.map(function (s) { return s.beschreibung; }).join('; ');
      return { text: tsch, status: 'erledigt', notiz: tsch, fotos: ns.map(function (s) { return s.foto; }).filter(Boolean) };
    }
    if (p.k === 'abloesung_bank') {
      if (cl.zb2 === true) return { text: 'Die ZB II lag bei der Übernahme vor – eine Ablösung ist vermutlich nicht nötig.', status: 'entfaellt', notiz: 'ZB II lag bei der Übernahme vor' };
      if (cl.zb2 === false) return { text: 'Die ZB II lag bei der Übernahme nicht vor (z. B. bei der Bank). Ablösung mit dem Kunden und der Bank klären.', rot: true };
      return null;
    }
    if (p.k === 'masterliste' && B.bestand) {
      var b = B.bestand, tm = 'Im Bestand gefunden: ' + [b.stieber_id, b.ml_ref ? 'Masterliste Id ' + b.ml_ref : '', b.fahrzeugstatus].filter(Boolean).join(' · ');
      var rr = B.rows.raeder, rt = rr && raederText(rr.daten);
      var abw = rt && (b.bereifung || '') !== rt;
      return { text: tm + (abw ? '. Bereifung in der Masterliste noch nachtragen: „' + rt + '“' : ''), status: abw ? undefined : 'erledigt', notiz: tm };
    }
    if (p.k === 'ausstattung' && iz) {
      var au = (info().AUSST || []).filter(function (x) { return a[x[0]]; }).map(function (x) { return x[2]; });
      if (au.length) return { text: 'Laut Bewertung: ' + au.join(', ') + '.' };
    }
    if (p.k === 'lackmessung' && iz) {
      var lm = a.lack_messung || {};
      if (Object.keys(lm).some(function (k) { return lm[k] != null; })) return { text: 'Werte aus der Bewertung liegen vor – „Messwerte eintragen“ übernimmt sie als Vorgabe.' };
    }
    if (p.k === 'raeder' && iz && REIFEN_BEW.some(function (r) { return a['reifen_' + r[0]]; })) {
      return { text: 'Laut Bewertung: ' + REIFEN_BEW.filter(function (r) { return a['reifen_' + r[0]]; }).map(function (r) {
        return r[1] + ' ' + mm(a['reifen_' + r[0] + '_profil_vorne']) + '/' + mm(a['reifen_' + r[0] + '_profil_hinten']) + ' mm';
      }).join(', ') + ' – „Räder erfassen“ übernimmt das als Vorgabe.' };
    }
    return null;
  }

  function punktKarte(B, o, p) {
    var row = B.rows[p.k], st = row ? row.status : 'offen', vs = vorschlag(B, p), fertig = erledigt(row);
    var karte = h('div', { class: 'punkt' + (st === 'erledigt' ? ' ok' : st === 'entfaellt' ? ' entfaellt' : vs && vs.rot ? ' mangel' : '') },
      h('div', { class: 'punkt-titel', text: p.t }),
      p.hinweis ? h('div', { class: 'punkt-hinweis', text: p.hinweis }) : null);
    if (vs && (!fertig || p.k === 'ausstattung')) {
      karte.appendChild(h('div', { class: 'klein' + (vs.rot ? ' rot-text fett' : ' muted'), style: 'margin:4px 0 8px', text: (vs.rot && !vs.status ? '' : 'Vorschlag: ') + vs.text }));
      if (vs.status && !fertig) karte.appendChild(h('button', {
        type: 'button', class: 'btn btn-ghost btn-klein', style: 'margin-bottom:6px',
        text: 'Vorschlag übernehmen (' + ST_TEXT[vs.status] + ')',
        onclick: function () { speichern(B, o, p, { status: vs.status, notiz: vs.notiz, fotos: vs.fotos }).catch(EG.fehler); }
      }));
    }
    // Erfassen-Punkte: eigener Knopf; Erledigt entsteht beim Speichern der Werte
    if (p.erfassen === 'raeder') {
      var rt = row && raederText(row.daten);
      if (rt) karte.appendChild(h('div', { class: 'extra' }, h('div', { class: 'fett klein', text: 'Kurztext für Masterliste und Akte:' }), h('div', { class: 'umbruch', text: rt }),
        h('button', { type: 'button', class: 'btn btn-ghost btn-klein', style: 'margin-top:6px', text: 'Kurztext kopieren', onclick: function () { EG.kopieren(rt); } })));
    }
    if (p.erfassen === 'lack' && row && row.daten && row.daten.lack) karte.appendChild(h('div', { class: 'extra klein', text: lackText(row.daten.lack) }));
    var seg = h('div', { class: 'seg', role: 'group', 'aria-label': p.t });
    var knoepfe = p.erfassen ? [['erfassen', p.erfassen === 'raeder' ? 'Räder erfassen' : 'Messwerte eintragen', 'seg-ok'], ['entfaellt', 'Entfällt', 'seg-entfaellt'], ['offen', 'Offen', 'seg-offen']]
      : [['erledigt', 'Erledigt', 'seg-ok'], ['entfaellt', 'Entfällt', 'seg-entfaellt'], ['offen', 'Offen', 'seg-offen']];
    knoepfe.forEach(function (e) {
      var aktiv = (e[0] === 'erfassen' ? st === 'erledigt' : st === e[0]) && (row || e[0] !== 'offen');
      seg.appendChild(h('button', {
        type: 'button', class: 'seg-b ' + e[2] + (aktiv ? ' aktiv' : ''), 'aria-pressed': aktiv ? 'true' : 'false', text: e[1],
        onclick: function () {
          var pr = e[0] === 'erfassen' ? (p.erfassen === 'raeder' ? raederDialog(B, o, p) : lackDialog(B, o, p)) : setzen(B, o, p, e[0]);
          pr.catch(EG.fehler);
        }
      }));
    });
    karte.appendChild(seg);
    if (fertig) karte.appendChild(h('div', { class: 'klein muted', style: 'margin-top:6px', text: ST_TEXT[row.status] + (row.erledigt_von_name ? ' von ' + row.erledigt_von_name : '') + (row.erledigt_am ? ', ' + EG.fmtDatum(row.erledigt_am) : '') }));
    if (row && row.notiz) karte.appendChild(h('div', { class: 'extra klein', style: 'white-space:pre-wrap', text: row.notiz }));
    if (row && (row.fotos || []).length) karte.appendChild(h('div', { class: 'fotos', style: 'margin-top:8px' }, row.fotos.map(function (f) { return EG.fotoThumb(f); })));
    karte.appendChild(h('div', { style: 'margin-top:8px' },
      h('button', { type: 'button', class: 'btn btn-ghost btn-klein', text: (p.foto || p.erfassen === 'raeder' ? 'Notiz / Foto' : 'Notiz') + (fertig ? ' / Datum' : ''), onclick: function () { notizDialog(B, o, p).catch(EG.fehler); } })));
    return karte;
  }
  function lackText(lm) {
    var lp = info().LACK_POINTS || [];
    return Object.keys(lm).filter(function (k) { return lm[k] != null; }).map(function (k) {
      var x = lp.filter(function (q) { return q.key === k; })[0];
      return (x ? x.label : k) + ' ' + mm(lm[k]) + ' µm' + (lm[k] > 200 ? ' ⚠' : '');
    }).join(' · ');
  }

  async function name() {
    var n = EG.nutzerName();
    if (!n) n = await EG.nameAbfragen(true);
    return n;
  }
  /** Speichert einen Punkt. w = { status, notiz?, fotos?, daten?, am? } (nicht angegebene Felder bleiben). */
  async function speichern(B, o, p, w) {
    var alt = B.rows[p.k];
    var data = { punkt: p.k, status: w.status, updated_at: jetzt() };
    data[B.spalte] = B.x.id;
    if (w.status === 'offen') { data.erledigt_von_name = null; data.erledigt_am = null; }
    else {
      var gleich = !!alt && alt.status === w.status;   // nur Notiz/Datum/Fotos geändert: Name bleibt
      data.erledigt_von_name = gleich && alt.erledigt_von_name ? alt.erledigt_von_name : await name();
      data.erledigt_am = w.am || (gleich && alt.erledigt_am ? alt.erledigt_am : jetzt());
    }
    if (w.notiz !== undefined) data.notiz = w.notiz;
    if (w.fotos !== undefined) data.fotos = w.fotos;
    if (w.daten !== undefined) data.daten = w.daten;
    var r = chk(await TA().upsert(data, { onConflict: B.spalte + ',punkt' }).select().single());
    B.rows[p.k] = r.data;
    zeichneBlock(B, o);
    if (o.onAenderung) o.onAenderung();
  }
  async function setzen(B, o, p, status) {
    var alt = B.rows[p.k];
    if (status === 'offen' && !alt) return;
    if (status === 'offen' && erledigt(alt)) {
      var ja = await EG.bestaetigen('„' + p.t + '“ wieder auf offen setzen? Name und Datum werden entfernt.', { ja: 'Auf offen setzen' });
      if (!ja) return;
    }
    await speichern(B, o, p, { status: status });
  }
  function datumFeld(row) {
    return row && erledigt(row) ? h('input', { type: 'date', value: row.erledigt_am ? String(row.erledigt_am).slice(0, 10) : EG.heute(), max: EG.heute() }) : null;
  }
  function datumLesen(feld, row) {
    if (!feld) return { am: undefined };
    if (!feld.value) return { fehler: 'Bitte ein Datum eintragen.' };
    if (feld.value > EG.heute()) return { fehler: 'Das Datum darf nicht in der Zukunft liegen.' };
    return { am: feld.value !== String(row.erledigt_am || '').slice(0, 10) ? new Date(feld.value + 'T12:00:00').toISOString() : undefined };
  }
  async function notizDialog(B, o, p) {
    var row = B.rows[p.k];
    var ta = h('textarea', { value: (row && row.notiz) || '', placeholder: 'Notiz (optional)' });
    var datum = datumFeld(row);
    var fb = p.foto || p.erfassen === 'raeder' ? EG.fotoBlock({ pfad: B.pfad, fotos: (row && row.fotos) || [] }) : null;
    await EG.dialog({
      titel: p.t,
      inhalt: h('div', {}, EG.feld('Notiz', ta), fb ? h('div', {}, h('div', { class: 'feld-label', text: 'Fotos' }), fb.el) : null,
        datum ? EG.feld('Erledigt am', datum, 'Falls der Punkt schon früher erledigt wurde.') : null),
      knoepfe: [{ text: 'Abbrechen', art: 'ghost', wert: null }, {
        text: 'Speichern', art: 'primary', wert: 'ok',
        aktion: async function () {
          if (fb && fb.laedt()) return 'Ein Foto lädt noch – bitte kurz warten.';
          var d = datumLesen(datum, row); if (d.fehler) return d.fehler;
          await speichern(B, o, p, { status: row ? row.status : 'offen', notiz: ta.value.trim() || null, fotos: fb ? fb.get() : undefined, am: d.am });
          return true;
        }
      }]
    });
  }

  /* ---------- Räder erfassen ---------- */
  function raederVorgabe(B) {
    var a = B.x;
    if (B.art !== 'IZ') return [{ art: 'Sommer', montiert: true }];
    var l = REIFEN_BEW.filter(function (r) { return a['reifen_' + r[0]]; }).map(function (r, i) {
      return { art: r[1], montiert: i === 0, va: a['reifen_' + r[0] + '_profil_vorne'], ha: a['reifen_' + r[0] + '_profil_hinten'] };
    });
    return l.length ? l : [{ art: 'Sommer', montiert: true }];
  }
  async function raederDialog(B, o, p) {
    var row = B.rows[p.k];
    var saetze = JSON.parse(JSON.stringify((row && row.daten && row.daten.radsaetze) || raederVorgabe(B)));
    var box = h('div', {}), felder = [];
    function zeichne() {
      box.innerHTML = ''; felder = [];
      saetze.forEach(function (s, i) {
        var F = {
          art: h('select', {}, RAD_ARTEN.map(function (x) { return h('option', { value: x, text: x, selected: s.art === x }); })),
          montiert: h('select', {}, [['1', 'montiert'], ['0', 'eingelagert']].map(function (x) { return h('option', { value: x[0], text: x[1], selected: (s.montiert ? '1' : '0') === x[0] }); })),
          va: h('input', { type: 'text', inputmode: 'decimal', value: s.va != null ? mm(s.va) : '', placeholder: 'z. B. 6,5' }),
          ha: h('input', { type: 'text', inputmode: 'decimal', value: s.ha != null ? mm(s.ha) : '', placeholder: 'z. B. 6' }),
          marke: h('input', { type: 'text', value: s.marke || '', placeholder: 'z. B. Michelin' }),
          felge: h('select', {}, ['', 'Alu', 'Stahl'].map(function (x) { return h('option', { value: x, text: x || '– wählen –', selected: (s.felge || '') === x }); })),
          zoll: h('input', { type: 'text', inputmode: 'numeric', value: s.zoll || '', placeholder: 'z. B. 17' }),
          fb: EG.fotoBlock({ pfad: B.pfad, fotos: s.fotos || [] })
        };
        felder.push(F);
        box.appendChild(h('div', { class: 'punkt' },
          h('div', { class: 'block-kopf', style: 'margin:0 0 8px' }, h('strong', { text: 'Radsatz ' + (i + 1) }),
            saetze.length > 1 ? h('button', { type: 'button', class: 'btn btn-ghost btn-klein', text: 'Entfernen', onclick: function () { lesen(); saetze.splice(i, 1); zeichne(); } }) : null),
          h('div', { class: 'zeile2' }, EG.feld('Art', F.art), EG.feld('Zustand', F.montiert)),
          h('div', { class: 'zeile2' }, EG.feld('Profil vorne (mm)', F.va), EG.feld('Profil hinten (mm)', F.ha)),
          EG.feld('Reifenmarke', F.marke),
          h('div', { class: 'zeile2' }, EG.feld('Felge', F.felge), EG.feld('Größe (Zoll)', F.zoll)),
          h('div', { class: 'feld-label', text: 'Foto' }), F.fb.el));
      });
      box.appendChild(h('button', { type: 'button', class: 'btn btn-ghost btn-klein', text: '+ Radsatz hinzufügen', onclick: function () { lesen(); saetze.push({ art: 'Winter', montiert: false }); zeichne(); } }));
    }
    function lesen() {
      saetze = felder.map(function (F) {
        return { art: F.art.value, montiert: F.montiert.value === '1', va: zahl(F.va.value), ha: zahl(F.ha.value), marke: F.marke.value.trim() || null,
          felge: F.felge.value || null, zoll: F.zoll.value.trim() || null, fotos: F.fb.get() };
      });
    }
    zeichne();
    await EG.dialog({
      titel: 'Räder erfassen', inhalt: box, breit: true,
      knoepfe: [{ text: 'Abbrechen', art: 'ghost', wert: null }, {
        text: 'Speichern', art: 'primary', wert: 'ok',
        aktion: async function () {
          if (felder.some(function (F) { return F.fb.laedt(); })) return 'Ein Foto lädt noch – bitte kurz warten.';
          lesen();
          if (!saetze.length) return 'Bitte mindestens einen Radsatz erfassen.';
          for (var i = 0; i < saetze.length; i++) {
            var s = saetze[i];
            if (s.va == null || s.ha == null) return 'Radsatz ' + (i + 1) + ': bitte Profiltiefe vorne und hinten eintragen.';
            if (s.va > 15 || s.ha > 15 || s.va < 0 || s.ha < 0) return 'Radsatz ' + (i + 1) + ': Profiltiefe in mm (0 bis 15).';
            if (!s.felge) return 'Radsatz ' + (i + 1) + ': bitte Alu oder Stahl wählen.';
          }
          var fotos = []; saetze.forEach(function (s) { fotos = fotos.concat(s.fotos || []); });
          await speichern(B, o, p, { status: 'erledigt', daten: { radsaetze: saetze }, fotos: fotos });
          return true;
        }
      }]
    });
  }

  /* ---------- Lackschichtmessung ---------- */
  async function lackDialog(B, o, p) {
    var row = B.rows[p.k], lp = info().LACK_POINTS || [];
    var vorgabe = (row && row.daten && row.daten.lack) || (B.art === 'IZ' && B.x.lack_messung) || {};
    var inp = {};
    var raster = h('div', { class: 'zeile2' }, lp.map(function (q) {
      inp[q.key] = h('input', { type: 'text', inputmode: 'decimal', value: vorgabe[q.key] != null ? mm(vorgabe[q.key]) : '', placeholder: 'µm' });
      return EG.feld(q.label, inp[q.key]);
    }));
    var hinweis = B.art === 'IZ' && !(row && row.daten && row.daten.lack) && Object.keys(vorgabe).length ? EG.banner('Vorgabe: Werte aus der Bewertung. Bitte bei der Anlieferung nachmessen und anpassen.', 'info') : null;
    await EG.dialog({
      titel: 'Lackschichtmessung', inhalt: h('div', {}, hinweis, h('p', { class: 'klein muted', text: 'Werte in µm. Über 200 µm deutet auf Nachlackierung hin.' }), raster), breit: true,
      knoepfe: [{ text: 'Abbrechen', art: 'ghost', wert: null }, {
        text: 'Speichern', art: 'primary', wert: 'ok',
        aktion: async function () {
          var lm = {};
          lp.forEach(function (q) { var w = zahl(inp[q.key].value); if (w != null) lm[q.key] = w; });
          if (!Object.keys(lm).length) return 'Bitte mindestens einen Messwert eintragen (oder „Entfällt“ wählen).';
          await speichern(B, o, p, { status: 'erledigt', daten: { lack: lm } });
          return true;
        }
      }]
    });
  }

  /* ====================================================================
     Abschnitt „Inzahlungnahmen“ im Reiter Anlieferung (Liste + Detail)
     ==================================================================== */
  var D = { liste: [], aufgaben: {}, geladen: false, laedt: null };   // aufgaben[ankauf_id][punkt] = Zeile
  function fzTitel(a) { return [a.fz_hersteller, a.fz_modell, a.fz_typ].filter(Boolean).join(' ') || 'Fahrzeug'; }
  function anzahlFertig(a) { var m = D.aufgaben[a.id] || {}; return punkteFuer('IZ').filter(function (p) { return erledigt(m[p.k]); }).length; }
  function istFertig(a) { return anzahlFertig(a) === punkteFuer('IZ').length; }
  function zb2Fehlt(a) { return (a.uebernahme_checkliste || {}).zb2 === false; }

  async function laden() {
    if (EG.demo && info().demo) await info().demo();
    var r = chk(await EG.sb.from('fahrzeugankauf').select('*').in('uebernahme_status', UEBERNOMMEN).order('uebernahme_am', { ascending: false }));
    D.liste = r.data || [];
    D.aufgaben = {};
    var ids = D.liste.map(function (a) { return a.id; });
    if (ids.length) {
      var x = chk(await TA().select('ankauf_id,punkt,status').in('ankauf_id', ids));
      (x.data || []).forEach(function (z) { (D.aufgaben[z.ankauf_id] = D.aufgaben[z.ankauf_id] || {})[z.punkt] = z; });
    }
    D.geladen = true;
  }
  function passtSuche(a, q) {
    q = (q || '').trim().toLowerCase(); if (!q) return true;
    return [a.fz_hersteller, a.fz_modell, a.fz_typ, a.fz_fahrgestellnr, a.interne_nr, a.fz_kennzeichen, a.vk_nachname, a.fz_farbe].join(' ').toLowerCase().indexOf(q) >= 0;
  }
  /** o = { filter: 'offen'|'erledigt'|'alle', suche: '', oeffne: fn(id) } */
  function abschnitt(o) {
    var box = h('div', { class: 'iz-an-abschnitt' });
    box.appendChild(h('div', { class: 'block-kopf' }, h('h3', { text: 'Inzahlungnahmen' }), h('span', { class: 'klein muted', text: 'nach „Fahrzeug übernehmen“' })));
    var liste = h('div', { role: 'list' });
    box.appendChild(liste);
    liste.appendChild(h('p', { class: 'muted', text: 'Lade Inzahlungnahmen …' }));
    var p = D.geladen ? Promise.resolve() : (D.laedt = D.laedt || laden().finally(function () { D.laedt = null; }));
    p.then(function () { fuellen(liste, o); }).catch(function (e) {
      liste.innerHTML = '';
      liste.appendChild(EG.banner('Inzahlungnahmen konnten nicht geladen werden: ' + String((e && e.message) || e), 'warn'));
    });
    return box;
  }
  function fuellen(liste, o) {
    liste.innerHTML = '';
    var l = D.liste.filter(function (a) {
      var f = istFertig(a);
      return (o.filter === 'offen' ? !f : o.filter === 'erledigt' ? f : true) && passtSuche(a, o.suche);
    });
    if (!l.length) { liste.appendChild(h('div', { class: 'leer', text: 'Keine Inzahlungnahmen in dieser Ansicht.' })); return; }
    l.forEach(function (a) { liste.appendChild(zeile(a, o)); });
  }
  function zeile(a, o) {
    var n = anzahlFertig(a), gesamt = punkteFuer('IZ').length, fertig = n === gesamt, m = D.aufgaben[a.id] || {};
    var bankRot = zb2Fehlt(a) && !erledigt(m.abloesung_bank);
    var termin = 'Übernommen ' + (EG.fmtDatum(a.uebernahme_am) || '–');
    var stand = n + ' von ' + gesamt + ' erledigt';
    function hinweise() { return bankRot ? [h('span', { class: 'rot-text fett', text: 'ZB II bei der Bank' })] : []; }
    return h('button', {
      type: 'button', role: 'listitem', class: 'ac-zeile an-zeile' + (fertig ? ' fertig' : ''),
      'aria-label': fzTitel(a) + (a.interne_nr ? ', Nr. ' + a.interne_nr : '') + ', Inzahlungnahme, ' + stand,
      onclick: function () { o.oeffne(a.id); }
    },
      h('span', { class: 'an-c-termin', text: termin }),
      h('span', { class: 'an-c-nr' + (a.interne_nr ? '' : ' muted'), text: a.interne_nr || '–' }),
      h('span', { class: 'an-c-fz' }, h('strong', { text: fzTitel(a) }), a.fz_farbe ? h('span', { class: 'muted', text: ' · ' + a.fz_farbe }) : null,
        h('span', { class: 'ac-nur-handy an-handy fz-fin' + (a.fz_fahrgestellnr ? '' : ' muted'), text: 'FIN ' + (a.fz_fahrgestellnr || '–') }),
        h('span', { class: 'ac-nur-handy an-handy muted', text: [a.interne_nr ? 'Nr. ' + a.interne_nr : '', 'Inzahlungnahme', termin].filter(Boolean).join(' · ') }),
        bankRot ? h('span', { class: 'ac-nur-handy an-handy' }, hinweise()) : null),
      h('span', { class: 'an-c-lief', text: 'Inzahlungnahme' }),
      h('span', { class: 'an-c-fin fz-fin' + (a.fz_fahrgestellnr ? '' : ' muted'), text: a.fz_fahrgestellnr || '–' }),
      h('span', { class: 'an-c-hinw' }, hinweise()),
      h('span', { class: 'an-c-status' }, EG.pill(fertig ? 'Alles erledigt' : stand, fertig ? 'gruen' : n ? 'gold' : '')));
  }

  /* Detail einer Inzahlungnahme */
  async function detail(root, id, zurueck) {
    if (!D.geladen || !D.liste.some(function (a) { return a.id === id; })) await laden();
    var a = D.liste.filter(function (x) { return x.id === id; })[0] || null;
    root.innerHTML = '';
    root.appendChild(h('button', { type: 'button', class: 'btn btn-ghost zurueck', text: '← Zur Liste', onclick: function () { zurueck(); } }));
    if (!a) { root.appendChild(EG.banner('Diese Inzahlungnahme wurde nicht gefunden.', 'warn')); return; }
    root.appendChild(kopf(a));
    root.appendChild(block({ art: 'IZ', besitzer: a, onAenderung: function () { D.geladen = false; } }));
  }
  function kopf(a) {
    var cl = a.uebernahme_checkliste || {};
    var zeilen = [['FIN', a.fz_fahrgestellnr || '–'], ['Interne Nr.', a.interne_nr || '–'], ['Kennzeichen', a.fz_kennzeichen || '–'],
      ['Kunde', [a.vk_vorname, a.vk_nachname].filter(Boolean).join(' ') || '–'],
      ['Übernommen', (EG.fmtZeit(a.uebernahme_am) || '–') + (a.uebernahme_von_name ? ' (' + a.uebernahme_von_name + ')' : '')],
      ['km / Schlüssel', (a.uebernahme_km != null ? Number(a.uebernahme_km).toLocaleString('de-DE') + ' km' : '–') + ' / ' + (a.uebernahme_schluessel != null ? a.uebernahme_schluessel : '–')],
      ['ZB II bei Übernahme', cl.zb2 === true ? 'vorhanden' : cl.zb2 === false ? 'nicht vorhanden' : '–']];
    var dl = h('dl', { class: 'kv' });
    zeilen.forEach(function (z) { dl.appendChild(h('dt', { text: z[0] })); dl.appendChild(h('dd', { text: z[1] })); });
    return h('div', { class: 'karte' }, h('div', { class: 'karte-kopf' }, h('h2', { text: fzTitel(a) }), EG.pill('Inzahlungnahme', 'grau')), dl);
  }

  /** Lieferantenfahrzeuge: Anzahl erledigter Aufgaben je fahrzeug_id → { id: [n, gesamt] } (für den Hinweis in der Liste). */
  async function standLieferant(ids) {
    var erg = {}, gesamt = punkteFuer('L').length;
    if (!ids.length) return erg;
    try {
      var r = chk(await TA().select('fahrzeug_id,punkt,status').in('fahrzeug_id', ids));
      ids.forEach(function (id) { erg[id] = [0, gesamt]; });
      (r.data || []).forEach(function (z) { if (erledigt(z) && erg[z.fahrzeug_id] && punkteFuer('L').some(function (p) { return p.k === z.punkt; })) erg[z.fahrzeug_id][0]++; });
    } catch (e) { /* ohne Stand weiter */ }
    return erg;
  }

  window.AN_IZ = {
    abschnitt: abschnitt,
    detail: detail,
    block: block,                       // AN_IZ.block({ art: 'L', besitzer: fahrzeug }) für die Detailseite der Lieferantenfahrzeuge
    standLieferant: standLieferant,
    raederText: raederText,
    neuLaden: function () { D.geladen = false; }
  };
})();
