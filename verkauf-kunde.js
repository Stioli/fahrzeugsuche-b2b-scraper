/* Stieber-App – Kunden-Abgleich „ohne Dubletten“ (Phase 1 der Verkaufsakte), Version 4.2, Stand 15.11.2026
   Paket VA7 des Bauplans Verkaufsablauf. Plan: „Anpassungen Verkaufsablauf“ v2 (Phase 1), Bauplan v1 (VA7).

   Aufgabe: Kommt eine Verkaufsakte aus einer Anfrage (Lead-Liste), wird der Kunde zuerst gegen die vorhandenen Kunden
   (crm.kunde) abgeglichen. Gibt es Treffer, schlägt die App sie vor („diesen Kunden nehmen“), statt einen zweiten
   Kunden anzulegen.

   Schnittstelle (wird von VK_AKTE_ANLEGEN in eingang-verkauf.js aufgerufen):
     window.VK_KUNDE.abgleich({name, email, telefon})
        → Promise<{treffer:[{id, name, ort, telefon_ende, email_maskiert, art, arten}], fehler?}>   (wirft nie)
     window.VK_KUNDE.waehle(vorbelegung)   (liest kunde_name, kunde_email, kunde_telefon, herkunft_anfrage)
        → Promise<uuid | null | undefined>
          uuid      = ausgewählter oder neu angelegter Kunde
          null      = keine Kunden-ID möglich (Rolle darf nicht anlegen, Datenbankfehler); die Akte kann ohne kunde_id weiterlaufen
          undefined = Abbruch durch den Benutzer: die Akte wird nicht angelegt

   Abgleich (Spalten email_norm und telefon_ende8 erzeugt die Datenbank selbst):
     E-Mail    gleich (klein, getrimmt)                       → art „email“
     Telefon   letzte 8 Ziffern gleich (mind. 6 Ziffern)      → art „telefon“
     Name      alle Namensteile (mind. 2) kommen im Namen vor → art „name“ (schwächster Treffer, nie vorausgewählt)
   Rechte: Lesen admin/dispo/buchhaltung/verkauf, Anlegen admin/dispo/verkauf (Richtlinien auf crm.kunde, Rollentest im Protokoll).
   Es werden nur id, name, ort, telefon_ende8 und email_norm gelesen; angezeigt werden die letzten 4 Telefonziffern und die E-Mail maskiert.
   Demo-Modus (?demo=1): Abgleich gegen erfundene Demo-Kunden (EG.demoSeed('crm.kunde', …)). */
(function () {
  'use strict';
  var EG = window.EG;
  if (!EG) return;
  var h = EG.h;
  var ANLEGER = { admin: 1, dispo: 1, verkauf: 1 };
  var LESER = { admin: 1, dispo: 1, buchhaltung: 1, verkauf: 1 };
  var ART_TEXT = { email: 'gleiche E-Mail', telefon: 'gleiche Telefonnummer', name: 'ähnlicher Name' };
  var STAERKE = { email: 3, telefon: 2, name: 1 };

  function demoSaat() {
    if (!EG.demo || !EG.demoSeed) return;
    EG.demoSeed('crm.kunde', [
      { id: '00000000-0000-4000-8000-0000000d0001', name: 'Hannelore Beispiel', ort: 'Stuttgart', telefon: '+49 711 5550101', email: 'hannelore.beispiel@demo.example', herkunft: 'Demo' },
      { id: '00000000-0000-4000-8000-0000000d0002', name: 'Karl-Heinz Muster', ort: 'Ludwigsburg', telefon: '0171 5550202', email: 'k.muster@demo.example', herkunft: 'Demo' },
      { id: '00000000-0000-4000-8000-0000000d0004', name: 'Tina Testfrau', ort: 'Korntal', telefon: '0171 0000005', email: 'Tina.Testfrau@beispiel.example', herkunft: 'Demo (Bestandskundin der Demo-Anfrage)' },
      { id: '00000000-0000-4000-8000-0000000d0003', name: 'Hannelore Beispiel-Schmidt', ort: 'Esslingen', telefon: '+49 711 5550303', email: 'beispiel-schmidt@demo.example', herkunft: 'Demo' }
    ].map(function (k) { k.email_norm = k.email.toLowerCase(); k.telefon_ende8 = String(k.telefon).replace(/\D/g, '').slice(-8); return k; }));
  }

  function txt(x) { return x == null ? '' : String(x).trim(); }
  function ziffern8(t) { var z = txt(t).replace(/\D/g, ''); return z.length >= 6 ? z.slice(-8) : ''; }
  function emailNorm(t) { var e = txt(t).toLowerCase(); return /^[^\s@]+@[^\s@]+$/.test(e) ? e : ''; }
  /** Namensteile (klein, ohne Sonderzeichen, die in Filtern stören); weniger als 2 Teile → kein Namensabgleich */
  function namensteile(t) {
    return txt(t).toLowerCase().replace(/[%_*\\"(),;]/g, ' ').split(/[\s]+/).filter(function (s) { return s.length >= 2; });
  }
  function maskMail(e) {
    var m = /^(.)[^@]*@(.+)$/.exec(txt(e)); return m ? m[1] + '***@' + m[2] : '';
  }
  function rolleOk(liste) { return !!liste[EG.rolle]; }

  function abgleich(daten) {
    return (async function () {
      var d = daten || {};
      try {
        demoSaat();
        if (!EG.sb) return { treffer: [], fehler: 'Keine Verbindung' };
        if (!rolleOk(LESER)) return { treffer: [], fehler: 'Keine Leserechte auf Kunden' };
        var mail = emailNorm(d.email), tel = ziffern8(d.telefon), teile = namensteile(d.name);
        var cols = 'id,name,ort,telefon_ende8,email_norm';
        var proben = [];
        if (mail) proben.push(['email', EG.tab('crm', 'kunde').select(cols).eq('email_norm', mail).limit(10)]);
        if (tel) proben.push(['telefon', EG.tab('crm', 'kunde').select(cols).eq('telefon_ende8', tel).limit(10)]);
        if (teile.length >= 2) {
          var q = EG.tab('crm', 'kunde').select(cols);
          teile.slice(0, 4).forEach(function (t) { q = q.ilike('name', '%' + t + '%'); });
          proben.push(['name', q.limit(10)]);
        }
        var res = await Promise.all(proben.map(function (p) { return p[1]; }));
        var map = {}, fehler = '';
        res.forEach(function (r, i) {
          if (r.error) { fehler = r.error.message || 'Abfrage fehlgeschlagen'; return; }
          (r.data || []).forEach(function (k) {
            var x = map[k.id] || (map[k.id] = { id: k.id, name: k.name || '', ort: k.ort || '', telefon_ende: k.telefon_ende8 ? String(k.telefon_ende8).slice(-4) : '', email_maskiert: maskMail(k.email_norm), arten: [] });
            if (x.arten.indexOf(proben[i][0]) < 0) x.arten.push(proben[i][0]);
          });
        });
        var treffer = Object.keys(map).map(function (id) {
          var x = map[id];
          x.arten.sort(function (a, b) { return STAERKE[b] - STAERKE[a]; });
          x.art = x.arten[0];
          return x;
        }).sort(function (a, b) { return (STAERKE[b.art] * 10 + b.arten.length) - (STAERKE[a.art] * 10 + a.arten.length); }).slice(0, 8);
        var erg = { treffer: treffer };
        if (fehler) erg.fehler = fehler;
        return erg;
      } catch (e) {
        return { treffer: [], fehler: (e && e.message) || 'Abgleich fehlgeschlagen' };
      }
    })();
  }

  /** Neuen Kunden anlegen → uuid | null. Nur Rollen admin/dispo/verkauf (so auch in der Datenbank). */
  async function anlegen(vb) {
    try {
      if (!rolleOk(ANLEGER)) { EG.toast('Kunden legen Verkauf, Dispo und Oli an. Die Akte wird ohne Kunden-Verknüpfung angelegt.', 'fehler'); return null; }
      var name = txt(vb.kunde_name);
      if (!name) { EG.toast('Ohne Namen kann kein Kunde angelegt werden.', 'fehler'); return null; }
      var zeile = { name: name, email: txt(vb.kunde_email) || null, telefon: txt(vb.kunde_telefon) || null, herkunft: txt(vb.herkunft_anfrage) || 'Verkaufs-App' };
      if (EG.demo) { zeile.email_norm = emailNorm(zeile.email) || null; zeile.telefon_ende8 = ziffern8(zeile.telefon) || null; }   // in der Datenbank erzeugt sie die Spalte selbst (nie mitschicken)
      var r = await EG.tab('crm', 'kunde').insert(zeile).select('id').single();
      if (r.error || !r.data) { EG.toast('Kunde konnte nicht angelegt werden: ' + ((r.error && r.error.message) || 'unbekannter Fehler'), 'fehler'); return null; }
      return r.data.id;
    } catch (e) { EG.toast('Kunde konnte nicht angelegt werden: ' + ((e && e.message) || e), 'fehler'); return null; }
  }

  function waehle(vb) {
    return (async function () {
      vb = vb || {};
      try {
        var erg = await abgleich({ name: vb.kunde_name, email: vb.kunde_email, telefon: vb.kunde_telefon });
        if (erg.fehler && !erg.treffer.length) {
          // Abgleich nicht möglich: keinen blinden Neuanlage-Versuch (Dublettengefahr), Akte läuft ohne Kunden-ID weiter
          EG.toast('Kunden-Abgleich nicht möglich (' + erg.fehler + '). Die Akte wird ohne Kunden-Verknüpfung angelegt.', 'fehler');
          return null;
        }
        if (!erg.treffer.length) return await anlegen(vb);

        var gewaehlt = null;
        var stark = erg.treffer[0].art !== 'name';
        if (stark) gewaehlt = erg.treffer[0].id;
        var zeilen = erg.treffer.map(function (t) {
          var rb = h('input', { type: 'radio', name: 'vk-kunde-wahl', value: t.id, checked: gewaehlt === t.id });
          rb.addEventListener('change', function () { gewaehlt = t.id; });
          var fein = [t.ort, t.telefon_ende ? 'Telefon …' + t.telefon_ende : '', t.email_maskiert].filter(Boolean).join(' · ');
          return h('label', { style: 'display:flex;gap:10px;align-items:flex-start;padding:10px 12px;border:1px solid #D7E2F1;border-radius:12px;margin:0 0 8px;cursor:pointer' },
            rb, h('span', {}, h('strong', { text: t.name || '(ohne Namen)' }), h('br'),
              h('span', { class: 'muted klein', text: fein || 'keine weiteren Angaben' }), h('br'),
              h('span', { class: 'klein', style: 'font-weight:600;color:#0A5CD0', text: t.arten.map(function (a) { return ART_TEXT[a]; }).join(' + ') })));
        });
        var inhalt = [
          h('p', { style: 'margin-bottom:10px', text: 'Zu „' + (txt(vb.kunde_name) || 'dieser Anfrage') + '“ gibt es schon Kunden. Bitte den passenden auswählen, damit kein zweiter angelegt wird.' }),
          h('div', {}, zeilen)
        ];
        var w = await EG.dialog({
          titel: 'Kunde schon vorhanden?', inhalt: inhalt, breit: true,
          knoepfe: [
            { text: 'Abbrechen', art: 'ghost', wert: 'abbruch' },
            { text: 'Neuer Kunde', art: 'ghost', wert: 'neu' },
            { text: 'Diesen Kunden nehmen', art: 'primary', wert: 'nimm', aktion: function () { return gewaehlt ? true : 'Bitte einen Kunden auswählen oder „Neuer Kunde“ wählen.'; } }
          ]
        });
        if (w === 'nimm') return gewaehlt;
        if (w === 'neu') return await anlegen(vb);
        return undefined;
      } catch (e) {
        EG.toast('Kunden-Abgleich fehlgeschlagen: ' + ((e && e.message) || e), 'fehler');
        return null;
      }
    })();
  }

  window.VK_KUNDE = { abgleich: abgleich, waehle: waehle };
})();
