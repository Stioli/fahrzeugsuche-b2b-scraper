/* Fahrzeugeingang-Tool – Reiter „Anlieferung“, Abschnitt „Inzahlungnahmen“
   Stand 19.11.2026. Zeigt jede Inzahlungnahme nach „Fahrzeug übernehmen“ (uebernahme_status ok | abweichung_geklaert)
   mit der Aufgabenliste nach der Anlieferung. Daten: public.fahrzeugankauf (nur lesen) und eingang.inzahlung_aufgabe.
   Vorschläge (Ablösung Bank, Lackmessung, Masterliste, Ausstattung) werden nur angezeigt und erst mit einem Tipp übernommen (Oli, 19.11.2026).
   Baut auf window.EG (eingang-core.js) und window.IZ_INFO (eingang-inzahlung.js) auf. Wird von eingang-anlieferung.js aufgerufen. */
(function () {
  'use strict';
  var EG = window.EG, h = EG.h;

  var UEBERNOMMEN = ['ok', 'abweichung_geklaert'];
  // k = Schlüssel in eingang.inzahlung_aufgabe.punkt (nicht ändern, sonst gehen Häkchen verloren)
  var PUNKTE = [
    { k: 'abmelden', t: 'Fahrzeug abmelden', hinweis: 'Außerbetriebsetzung bei der Zulassungsstelle; Kennzeichen entwerten lassen.' },
    { k: 'abloesung_bank', t: 'Ablösung bei der Bank des Kunden', hinweis: 'Nur nötig, wenn das Fahrzeug finanziert ist bzw. die ZB II bei der Bank liegt. Ablösebetrag anfragen, ablösen, ZB II anfordern.' },
    { k: 'einfinanzieren', t: 'Einfinanzieren (EK-Finanzierung)', hinweis: 'Fahrzeug bei der Einkaufsfinanzierung anmelden.' },
    { k: 'fahrzeugbilder', t: 'Fahrzeugbilder gemacht' },
    { k: 'ausstattung', t: 'Ausstattung geprüft', hinweis: 'Mit der Bewertung und der FIN-Abfrage vergleichen.' },
    { k: 'lackmessung', t: 'Lackschichtmessung' },
    { k: 'repdoc_ankauf', t: 'Ankauf in Repdoc durchgeführt', hinweis: 'Handelsakte mit Ankauf (Preis, Datum, Besteuerung).' },
    { k: 'masterliste', t: 'In Masterliste / Stieber-App eingetragen' }
  ];
  var ST_TEXT = { erledigt: 'Erledigt', entfaellt: 'Entfällt', offen: 'Offen' };

  var D = { liste: [], aufgaben: {}, bestand: {}, geladen: false };   // aufgaben[ankauf_id][punkt] = Zeile
  function chk(r) { if (r && r.error) throw r.error; return r; }
  function jetzt() { return new Date().toISOString(); }
  function info() { return window.IZ_INFO || {}; }
  function TA() { return EG.tab('eingang', 'inzahlung_aufgabe'); }
  function fzTitel(a) { return [a.fz_hersteller, a.fz_modell, a.fz_typ].filter(Boolean).join(' ') || 'Fahrzeug'; }
  function erledigt(row) { return !!row && (row.status === 'erledigt' || row.status === 'entfaellt'); }
  function anzahlFertig(a) { var m = D.aufgaben[a.id] || {}; return PUNKTE.filter(function (p) { return erledigt(m[p.k]); }).length; }
  function istFertig(a) { return anzahlFertig(a) === PUNKTE.length; }
  function zb2Fehlt(a) { var cl = a.uebernahme_checkliste || {}; return cl.zb2 === false; }

  /* ====================================================================
     Laden
     ==================================================================== */
  async function laden() {
    if (EG.demo && info().demo) await info().demo();
    var r = chk(await EG.sb.from('fahrzeugankauf').select('*').in('uebernahme_status', UEBERNOMMEN).order('uebernahme_am', { ascending: false }));
    D.liste = r.data || [];
    D.aufgaben = {}; D.bestand = {};
    var ids = D.liste.map(function (a) { return a.id; });
    if (ids.length) {
      var x = chk(await TA().select('*').in('ankauf_id', ids));
      (x.data || []).forEach(function (z) { (D.aufgaben[z.ankauf_id] = D.aufgaben[z.ankauf_id] || {})[z.punkt] = z; });
      await bestandSuchen();
    }
    D.geladen = true;
  }
  /** Bestand (Masterliste) über interne Nr. bzw. FIN suchen – nur für den Vorschlag „Masterliste“. Fehler hier sind nicht schlimm. */
  async function bestandSuchen() {
    try {
      var nrs = D.liste.map(function (a) { return a.interne_nr; }).filter(Boolean);
      var fins = D.liste.map(function (a) { return (a.fz_fahrgestellnr || '').toUpperCase(); }).filter(function (f) { return f.length === 17; });
      var treffer = [];
      if (nrs.length) treffer = treffer.concat(chk(await EG.tab('bestand', 'fahrzeug').select('stieber_id,ml_ref,interne_nr,fin,fahrzeugstatus').in('interne_nr', nrs)).data || []);
      if (fins.length) treffer = treffer.concat(chk(await EG.tab('bestand', 'fahrzeug').select('stieber_id,ml_ref,interne_nr,fin,fahrzeugstatus').in('fin', fins)).data || []);
      D.liste.forEach(function (a) {
        var fin = (a.fz_fahrgestellnr || '').toUpperCase();
        var t = treffer.filter(function (b) { return (fin && b.fin && b.fin.toUpperCase() === fin) || (a.interne_nr && b.interne_nr === a.interne_nr); })[0];
        if (t) D.bestand[a.id] = t;
      });
    } catch (e) { /* ohne Bestand-Treffer weiter */ }
  }

  /* ====================================================================
     Liste (Abschnitt unter den Lieferantenfahrzeugen)
     o = { filter: 'offen'|'erledigt'|'alle', suche: '', oeffne: fn(id) }
     ==================================================================== */
  function passtSuche(a, q) {
    q = (q || '').trim().toLowerCase(); if (!q) return true;
    return [a.fz_hersteller, a.fz_modell, a.fz_typ, a.fz_fahrgestellnr, a.interne_nr, a.fz_kennzeichen, a.vk_nachname, a.fz_farbe].join(' ').toLowerCase().indexOf(q) >= 0;
  }
  function abschnitt(o) {
    var box = h('div', { class: 'iz-an-abschnitt' });
    box.appendChild(h('div', { class: 'block-kopf' }, h('h3', { text: 'Inzahlungnahmen' }), h('span', { class: 'klein muted', text: 'nach „Fahrzeug übernehmen“' })));
    var liste = h('div', { role: 'list' });
    box.appendChild(liste);
    liste.appendChild(h('p', { class: 'muted', text: 'Lade Inzahlungnahmen …' }));
    var p = D.geladen ? Promise.resolve() : (D.laedt = D.laedt || laden().finally(function () { D.laedt = null; }));
    p.then(function () { fuellen(liste, o); }).catch(function (e) {
      liste.innerHTML = '';
      var m = String((e && e.message) || e);
      liste.appendChild(EG.banner(/inzahlung_aufgabe/.test(m) ? 'Die Aufgabenliste für Inzahlungnahmen ist in der Datenbank noch nicht eingerichtet.' : 'Inzahlungnahmen konnten nicht geladen werden: ' + m, 'warn'));
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
    var n = anzahlFertig(a), fertig = n === PUNKTE.length, m = D.aufgaben[a.id] || {};
    var bankRot = zb2Fehlt(a) && !erledigt(m.abloesung_bank);
    var termin = 'Übernommen ' + (EG.fmtDatum(a.uebernahme_am) || '–');
    var stand = n + ' von ' + PUNKTE.length + ' erledigt';
    function hinweise() {
      return [bankRot ? h('span', { class: 'rot-text fett', text: 'ZB II bei der Bank' }) : null].filter(Boolean);
    }
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

  /* ====================================================================
     Detail: Aufgabenliste
     ==================================================================== */
  var DS = { root: null, id: null, zurueck: null };
  async function detail(root, id, zurueck) {
    DS.root = root; DS.id = id; DS.zurueck = zurueck;
    if (!D.geladen || !D.liste.some(function (a) { return a.id === id; })) await laden();
    zeichne();
  }
  function aktuell() { return D.liste.filter(function (a) { return a.id === DS.id; })[0] || null; }

  function zeichne() {
    var y = window.scrollY, root = DS.root, a = aktuell();
    root.innerHTML = '';
    root.appendChild(h('button', { type: 'button', class: 'btn btn-ghost zurueck', text: '← Zur Liste', onclick: function () { DS.id = null; DS.zurueck(); } }));
    if (!a) { root.appendChild(EG.banner('Diese Inzahlungnahme wurde nicht gefunden.', 'warn')); return; }
    root.appendChild(kopf(a));
    var n = anzahlFertig(a);
    root.appendChild(h('div', { class: 'block-kopf' }, h('h3', { text: 'Nach der Anlieferung zu tun' }), h('span', { class: 'klein muted', text: n + ' / ' + PUNKTE.length })));
    PUNKTE.forEach(function (p) { root.appendChild(punktKarte(a, p)); });
    if (n === PUNKTE.length) root.appendChild(EG.banner('Alle Punkte sind erledigt. Das Fahrzeug steht jetzt unter „Erledigt“.', 'ok'));
    window.scrollTo(0, y);
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
    return h('div', { class: 'karte' },
      h('div', { class: 'karte-kopf' }, h('h2', { text: fzTitel(a) }), EG.pill('Inzahlungnahme', 'grau')),
      dl);
  }

  /** Vorschlag je Punkt: { text, status, notiz, rot } oder null. Wird nur angezeigt, übernommen erst per Tipp. */
  function vorschlag(a, p) {
    var cl = a.uebernahme_checkliste || {};
    if (p.k === 'abloesung_bank') {
      if (cl.zb2 === true) return { text: 'Die ZB II lag bei der Übernahme vor – eine Ablösung ist vermutlich nicht nötig.', status: 'entfaellt', notiz: 'ZB II lag bei der Übernahme vor' };
      if (cl.zb2 === false) return { text: 'Die ZB II lag bei der Übernahme nicht vor (z. B. bei der Bank). Ablösung mit dem Kunden und der Bank klären.', rot: true };
      return null;
    }
    if (p.k === 'lackmessung') {
      var lm = a.lack_messung || {}, lp = info().LACK_POINTS || [];
      var werte = Object.keys(lm).filter(function (k) { return lm[k] != null; });
      if (!werte.length) return null;
      var label = function (k) { var x = lp.filter(function (q) { return q.key === k; })[0]; return x ? x.label : k; };
      var txt = werte.map(function (k) { return label(k) + ' ' + String(lm[k]).replace('.', ',') + ' µm' + (lm[k] > 200 ? ' ⚠' : ''); }).join(' · ');
      return { text: 'Werte aus der Bewertung: ' + txt + (a.lack_bemerkung ? ' – ' + a.lack_bemerkung : ''), status: 'erledigt', notiz: 'Werte aus der Bewertung übernommen' };
    }
    if (p.k === 'masterliste') {
      var b = D.bestand[a.id];
      if (!b) return null;
      var t = 'Im Bestand gefunden: ' + [b.stieber_id, b.ml_ref ? 'Masterliste Id ' + b.ml_ref : '', b.fahrzeugstatus].filter(Boolean).join(' · ');
      return { text: t, status: 'erledigt', notiz: t };
    }
    if (p.k === 'ausstattung') {
      var au = (info().AUSST || []).filter(function (x) { return a[x[0]]; }).map(function (x) { return x[2]; });
      if (!au.length) return null;
      return { text: 'Laut Bewertung: ' + au.join(', ') + '.' };
    }
    return null;
  }

  function punktKarte(a, p) {
    var row = (D.aufgaben[a.id] || {})[p.k], st = row ? row.status : 'offen', vs = vorschlag(a, p);
    var seg = h('div', { class: 'seg', role: 'group', 'aria-label': p.t });
    [['erledigt', 'Erledigt', 'seg-ok'], ['entfaellt', 'Entfällt', 'seg-entfaellt'], ['offen', 'Offen', 'seg-offen']].forEach(function (e) {
      var aktiv = st === e[0] && (row || e[0] !== 'offen');
      seg.appendChild(h('button', {
        type: 'button', class: 'seg-b ' + e[2] + (aktiv ? ' aktiv' : ''), 'aria-pressed': aktiv ? 'true' : 'false', text: e[1],
        onclick: function () { setzen(a, p, e[0]).catch(EG.fehler); }
      }));
    });
    var karte = h('div', { class: 'punkt' + (st === 'erledigt' ? ' ok' : st === 'entfaellt' ? ' entfaellt' : vs && vs.rot ? ' mangel' : '') },
      h('div', { class: 'punkt-titel', text: p.t }),
      p.hinweis ? h('div', { class: 'punkt-hinweis', text: p.hinweis }) : null);
    if (vs && !erledigt(row)) {
      karte.appendChild(h('div', { class: 'klein' + (vs.rot ? ' rot-text fett' : ' muted'), style: 'margin:4px 0 8px', text: (vs.rot ? '' : 'Vorschlag: ') + vs.text }));
      if (vs.status) karte.appendChild(h('button', {
        type: 'button', class: 'btn btn-ghost btn-klein', style: 'margin-bottom:6px',
        text: 'Vorschlag übernehmen (' + ST_TEXT[vs.status] + ')',
        onclick: function () { speichern(a, p, vs.status, vs.notiz).catch(EG.fehler); }
      }));
    } else if (vs && p.k === 'ausstattung') {
      karte.appendChild(h('div', { class: 'klein muted', style: 'margin:4px 0 8px', text: vs.text }));
    }
    karte.appendChild(seg);
    if (row && erledigt(row)) {
      karte.appendChild(h('div', { class: 'klein muted', style: 'margin-top:6px', text: ST_TEXT[row.status] + (row.erledigt_von_name ? ' von ' + row.erledigt_von_name : '') + (row.erledigt_am ? ', ' + EG.fmtDatum(row.erledigt_am) : '') }));
    }
    if (row && row.notiz) karte.appendChild(h('div', { class: 'extra klein', style: 'white-space:pre-wrap', text: row.notiz }));
    karte.appendChild(h('div', { style: 'margin-top:8px' },
      h('button', { type: 'button', class: 'btn btn-ghost btn-klein', text: row && erledigt(row) ? 'Notiz / Datum' : 'Notiz', onclick: function () { notizDialog(a, p).catch(EG.fehler); } })));
    return karte;
  }

  async function name() {
    var n = EG.nutzerName();
    if (!n) n = await EG.nameAbfragen(true);
    return n;
  }
  /** Speichert einen Punkt. am = ISO-Zeitpunkt (optional, sonst jetzt bzw. bisheriger Wert). */
  async function speichern(a, p, status, notiz, am) {
    var alt = (D.aufgaben[a.id] || {})[p.k];
    var data = { ankauf_id: a.id, punkt: p.k, status: status, updated_at: jetzt() };
    if (status === 'offen') { data.erledigt_von_name = null; data.erledigt_am = null; }
    else {
      var gleich = !!alt && alt.status === status;   // nur Notiz/Datum geändert: Name bleibt
      data.erledigt_von_name = gleich && alt.erledigt_von_name ? alt.erledigt_von_name : await name();
      data.erledigt_am = am || (gleich && alt.erledigt_am ? alt.erledigt_am : jetzt());
    }
    if (notiz !== undefined) data.notiz = notiz;
    var r = chk(await TA().upsert(data, { onConflict: 'ankauf_id,punkt' }).select().single());
    (D.aufgaben[a.id] = D.aufgaben[a.id] || {})[p.k] = r.data;
    zeichne();
  }
  async function setzen(a, p, status) {
    var alt = (D.aufgaben[a.id] || {})[p.k];
    if (status === 'offen' && !alt) return;
    if (status === 'offen' && erledigt(alt)) {
      var ja = await EG.bestaetigen('„' + p.t + '“ wieder auf offen setzen? Name und Datum werden entfernt.', { ja: 'Auf offen setzen' });
      if (!ja) return;
    }
    await speichern(a, p, status);
  }
  async function notizDialog(a, p) {
    var row = (D.aufgaben[a.id] || {})[p.k];
    var ta = h('textarea', { id: 'iza-notiz', value: (row && row.notiz) || '', placeholder: 'z. B. Ablösebetrag, Bank, Vorgangsnummer' });
    var datum = row && erledigt(row) ? h('input', { type: 'date', id: 'iza-datum', value: row.erledigt_am ? String(row.erledigt_am).slice(0, 10) : EG.heute(), max: EG.heute() }) : null;
    await EG.dialog({
      titel: p.t,
      inhalt: h('div', {}, EG.feld('Notiz', ta), datum ? EG.feld('Erledigt am', datum, 'Falls der Punkt schon früher erledigt wurde.') : null),
      knoepfe: [{ text: 'Abbrechen', art: 'ghost', wert: null }, {
        text: 'Speichern', art: 'primary', wert: 'ok',
        aktion: async function () {
          var am;
          if (datum) {
            if (!datum.value) return 'Bitte ein Datum eintragen.';
            if (datum.value > EG.heute()) return 'Das Datum darf nicht in der Zukunft liegen.';
            if (datum.value !== String(row.erledigt_am || '').slice(0, 10)) am = new Date(datum.value + 'T12:00:00').toISOString();
          }
          await speichern(a, p, row ? row.status : 'offen', ta.value.trim() || null, am);
          return true;
        }
      }]
    });
  }

  window.AN_IZ = {
    abschnitt: abschnitt,
    detail: detail,
    neuLaden: function () { D.geladen = false; },
    offenAnzahl: function () { return D.liste.filter(function (a) { return !istFertig(a); }).length; }
  };
})();
