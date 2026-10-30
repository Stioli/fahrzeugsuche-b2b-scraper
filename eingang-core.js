/* Fahrzeugeingang-Tool – gemeinsame Helfer (window.EG)
   Paket P3, Stand 30.10.2026.
   Wird von eingang-anlieferung.js und eingang-inzahlung.js genutzt.

   Überblick der Schnittstelle (Details siehe jeweils am Funktionskopf):
     EG.demo, EG.sb, EG.tab(schema, tabelle), EG.rolle, EG.istAdmin(), EG.nutzer(), EG.nutzerName()
     EG.onTab(name, fn)  ·  EG.start()
     EG.h(tag, attrs, ...kinder)  ·  EG.feld(...)  ·  EG.pill(...)  ·  EG.banner(...)
     EG.toast(text, art)  ·  EG.fehler(e)  ·  EG.dialog(opt)  ·  EG.bestaetigen(text, opt)  ·  EG.eingabe(frage, opt)
     EG.fotoHochladen(file, pfad)  ·  EG.fotoAnzeigen(pfad)  ·  EG.fotoBlob(pfad)  ·  EG.fotoBlock(opt)  ·  EG.fotoThumb(pfad)
     EG.mailMitAnhang({an, betreff, text, fotoPfade})
     EG.heute(), EG.fmtDatum(), EG.fmtZeit(), EG.plusWerktage(), EG.werktageSeit(), EG.kopieren()
     EG.demoSeed(schluessel, zeilen)  (nur im Demo-Modus wirksam)
*/
(function () {
  'use strict';

  var SUPA_URL = 'https://mnglpqeqmoxccqnztqez.supabase.co';
  var SUPA_KEY = 'sb_publishable_CDpY6_W07WdHFKYv0cx59g_GDm7UlZF';   // Publishable/anon-Key, darf wie im Dashboard im HTML stehen
  var BUCKET = 'eingang-fotos';
  var LS_NAME = 'eg_name_werkstatt';
  var LS_TAB = 'eg_tab';

  var EG = window.EG = {
    version: '0.1 (P3)',
    demo: /[?&]demo=1(&|$)/.test(location.search),
    sb: null,            // Supabase-Client (im Demo: Mock mit gleicher Schnittstelle)
    user: null,          // { email }
    rolle: null,         // 'admin' | 'verkauf' | ... (aus shared.aktuelle_rolle())
    anzeigename: ''      // aus shared.benutzer
  };

  function $(id) { return document.getElementById(id); }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* privater Modus */ } }

  /* ====================================================================
     DOM-Helfer
     ==================================================================== */
  function anhaengen(el, k) {
    if (k == null || k === false) return;
    if (Array.isArray(k)) { k.forEach(function (x) { anhaengen(el, x); }); return; }
    el.appendChild(k.nodeType ? k : document.createTextNode(String(k)));
  }
  /** EG.h('div', {class:'x', text:'..', onclick:fn, value:'..'}, kind1, [kind2, kind3]) → Element.
      attrs: class, text, html (nur für feste Texte!), style (String), on<ereignis> (Funktion),
      sonst Eigenschaft bzw. Attribut. null/false werden übersprungen. */
  EG.h = function (tag, attrs) {
    var e = document.createElement(tag), spaeter = null;
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        var v = attrs[k];
        if (v == null || v === false) return;
        if (k === 'class') e.className = v;
        else if (k === 'text') e.textContent = v;
        else if (k === 'html') e.innerHTML = v;
        else if (k === 'style') e.style.cssText = v;
        else if (k === 'value') spaeter = v;          // erst nach den Kindern (select!)
        else if (k.slice(0, 2) === 'on' && typeof v === 'function') e.addEventListener(k.slice(2), v);
        else if (k === 'for' || k.slice(0, 5) === 'aria-' || k.slice(0, 5) === 'data-' || k === 'role') e.setAttribute(k, v === true ? '' : v);
        else if (k in e) { try { e[k] = v; } catch (x) { e.setAttribute(k, v); } }
        else e.setAttribute(k, v === true ? '' : v);
      });
    }
    for (var i = 2; i < arguments.length; i++) anhaengen(e, arguments[i]);
    if (spaeter !== null) e.value = spaeter;
    return e;
  };
  var h = EG.h;

  /** Beschriftetes Feld: EG.feld('Label', inputElement, 'Hinweistext') */
  EG.feld = function (label, control, hinweis) {
    var id = control && control.id;
    return h('div', { class: 'feld' },
      label ? h('label', { for: id, text: label }) : null,
      control,
      hinweis ? h('div', { class: 'feld-hinweis', text: hinweis }) : null);
  };
  /** Kleine Statusmarke. art: '' | 'grau' | 'gruen' | 'rot' | 'gold' */
  EG.pill = function (text, art) { return h('span', { class: 'pill' + (art ? ' ' + art : ''), text: text }); };
  /** Hinweiskasten. art: 'info' | 'warn' | 'fehler' | 'ok' */
  EG.banner = function (text, art) {
    var b = h('div', { class: 'banner ' + (art || 'info') });
    anhaengen(b, text);
    return b;
  };

  /* ====================================================================
     Datum
     ==================================================================== */
  EG.isoDatum = function (d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); };
  /** heutiges Datum lokal als 'JJJJ-MM-TT' */
  EG.heute = function () { return EG.isoDatum(new Date()); };
  /** 'JJJJ-MM-TT' oder ISO-Zeitstempel → Date (lokal, Mitternacht) */
  EG.parseDatum = function (s) {
    if (!s) return null;
    if (s instanceof Date) return new Date(s.getFullYear(), s.getMonth(), s.getDate());
    var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
    if (!m) return null;
    if (String(s).length > 10) { var d = new Date(s); return new Date(d.getFullYear(), d.getMonth(), d.getDate()); }
    return new Date(+m[1], +m[2] - 1, +m[3]);
  };
  /** → 'TT.MM.JJJJ' */
  EG.fmtDatum = function (s) { var d = EG.parseDatum(s); return d ? pad(d.getDate()) + '.' + pad(d.getMonth() + 1) + '.' + d.getFullYear() : ''; };
  /** → 'TT.MM.JJJJ, HH:MM Uhr' */
  EG.fmtZeit = function (s) { if (!s) return ''; var d = new Date(s); return EG.fmtDatum(s) + ', ' + pad(d.getHours()) + ':' + pad(d.getMinutes()) + ' Uhr'; };
  function istWerktag(d) { var w = d.getDay(); return w > 0 && w < 6; }   // Feiertage bleiben unberücksichtigt
  /** n Werktage (Mo–Fr) nach s → 'JJJJ-MM-TT' */
  EG.plusWerktage = function (s, n) {
    var d = new Date(EG.parseDatum(s) || new Date()), c = 0;
    d = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    while (c < n) { d.setDate(d.getDate() + 1); if (istWerktag(d)) c++; }
    return EG.isoDatum(d);
  };
  /** Anzahl Werktage zwischen s (exklusive) und heute (inklusive) */
  EG.werktageSeit = function (s) {
    var d = EG.parseDatum(s); if (!d) return 0;
    var heute = EG.parseDatum(EG.heute()), c = 0;
    while (d < heute) { d.setDate(d.getDate() + 1); if (istWerktag(d)) c++; }
    return c;
  };
  EG.uuid = function () {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) { var r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 3 | 8)).toString(16); });
  };

  /* ====================================================================
     Toast, Fehler
     ==================================================================== */
  /** Kurze Meldung unten. art: '' | 'ok' | 'fehler' */
  EG.toast = function (text, art) {
    var box = $('toasts'); if (!box) return;
    var t = h('div', { class: 'toast' + (art ? ' ' + art : ''), text: text, role: 'status' });
    box.appendChild(t);
    setTimeout(function () { if (t.parentNode) t.parentNode.removeChild(t); }, art === 'fehler' ? 7000 : 3500);
  };
  EG.fehler = function (e) {
    console.error(e);
    var m = (e && (e.message || e.error_description || e.details)) || String(e);
    EG.toast('Fehler: ' + m, 'fehler');
  };

  /* ====================================================================
     Dialog
     ==================================================================== */
  var dlgZaehler = 0;
  /** EG.dialog({titel, inhalt (Node|String|Array), knoepfe:[{text, art:'primary'|'ghost'|'gefahr', wert, aktion}], breit, schliessbar})
      → Promise<wert des Knopfes | null bei Schließen>.
      aktion (optional, async): läuft beim Klick; nur wenn sie true liefert, wird geschlossen
      (String = Fehlertext als Toast, Dialog bleibt offen). */
  EG.dialog = function (o) {
    return new Promise(function (resolve) {
      var ueber = h('div', { class: 'dlg-ueber' });
      ueber.style.zIndex = String(100 + dlgZaehler * 2);
      var schliessbar = o.schliessbar !== false;
      var box = h('div', { class: 'dlg' + (o.breit ? ' breit' : ''), role: 'dialog', 'aria-modal': 'true', 'aria-label': o.titel || 'Dialog' });
      var inhalt = h('div', { class: 'dlg-inhalt' });
      anhaengen(inhalt, o.inhalt);
      var fuss = h('div', { class: 'dlg-fuss' });
      var fertig = function (w) {
        document.removeEventListener('keydown', taste, true);
        if (ueber.parentNode) ueber.parentNode.removeChild(ueber);
        dlgZaehler = Math.max(0, dlgZaehler - 1);
        if (!dlgZaehler) document.body.classList.remove('dlg-offen');
        resolve(w);
      };
      var taste = function (e) {
        if (e.key === 'Escape' && schliessbar && ueber.style.zIndex === String(100 + (dlgZaehler - 1) * 2)) { e.stopPropagation(); fertig(null); }
      };
      (o.knoepfe || []).forEach(function (k) {
        var b = h('button', { type: 'button', class: 'btn ' + (k.art === 'primary' ? 'btn-primary' : k.art === 'gefahr' ? 'btn-gefahr' : 'btn-ghost'), text: k.text });
        b.addEventListener('click', async function () {
          if (k.aktion) {
            b.disabled = true; var r = false;
            try { r = await k.aktion(); } catch (e) { EG.fehler(e); r = false; }
            b.disabled = false;
            if (r !== true) { if (typeof r === 'string') EG.toast(r, 'fehler'); return; }
          }
          fertig(k.wert === undefined ? true : k.wert);
        });
        fuss.appendChild(b);
      });
      box.appendChild(h('div', { class: 'dlg-kopf' }, h('h2', { text: o.titel || '' }),
        schliessbar ? h('button', { type: 'button', class: 'dlg-x', 'aria-label': 'Schließen', text: '×', onclick: function () { fertig(null); } }) : null));
      box.appendChild(inhalt);
      if (fuss.childNodes.length) box.appendChild(fuss);
      ueber.appendChild(box);
      ueber.addEventListener('mousedown', function (e) { if (e.target === ueber && schliessbar) fertig(null); });
      document.body.appendChild(ueber);
      dlgZaehler++;
      document.body.classList.add('dlg-offen');
      document.addEventListener('keydown', taste, true);
      var ersterFokus = box.querySelector('input:not([type=hidden]),select,textarea');
      if (ersterFokus && !o.keinFokus) setTimeout(function () { try { ersterFokus.focus(); } catch (e) { /* egal */ } }, 30);
    });
  };
  /** EG.bestaetigen('Frage?', {ja:'Ja', nein:'Abbrechen', gefahr:true}) → Promise<boolean> */
  EG.bestaetigen = function (text, o) {
    o = o || {};
    return EG.dialog({
      titel: o.titel || 'Bitte bestätigen', inhalt: h('p', { text: text, style: 'white-space:pre-wrap' }),
      knoepfe: [{ text: o.nein || 'Abbrechen', art: 'ghost', wert: false }, { text: o.ja || 'Ja', art: o.gefahr ? 'gefahr' : 'primary', wert: true }]
    }).then(function (w) { return w === true; });
  };
  /** EG.eingabe('Wie heißt du?', {vorgabe:'', platzhalter:'', pflicht:true, titel:''}) → Promise<String|null> */
  EG.eingabe = function (frage, o) {
    o = o || {};
    var inp = h('input', { type: 'text', value: o.vorgabe || '', placeholder: o.platzhalter || '', autocomplete: 'off', id: 'eg-eingabe' });
    var knoepfe = [];
    if (!o.pflicht) knoepfe.push({ text: 'Abbrechen', art: 'ghost', wert: null });
    knoepfe.push({
      text: o.ok || 'OK', art: 'primary', wert: 'x',
      aktion: function () { if (!inp.value.trim()) return 'Bitte etwas eintragen.'; return true; }
    });
    inp.addEventListener('keydown', function (e) { if (e.key === 'Enter') { var ok = inp.closest('.dlg').querySelector('.btn-primary'); if (ok) ok.click(); } });
    return EG.dialog({ titel: o.titel || frage, inhalt: [o.titel ? h('p', { text: frage, style: 'margin-bottom:10px' }) : null, inp], knoepfe: knoepfe, schliessbar: !o.pflicht })
      .then(function (w) { return w === 'x' ? inp.value.trim() : null; });
  };

  /** Text in die Zwischenablage → Promise<boolean> */
  EG.kopieren = function (text) {
    function alt() {
      var ta = h('textarea', { value: text, style: 'position:fixed;left:-9999px;top:0' });
      document.body.appendChild(ta); ta.select();
      var ok = false; try { ok = document.execCommand('copy'); } catch (e) { /* egal */ }
      ta.remove(); return ok;
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text).then(function () { return true; }, function () { return alt(); });
    }
    return Promise.resolve(alt());
  };

  /* ====================================================================
     Fotos: verkleinern, hochladen, anzeigen
     ==================================================================== */
  function alsBild(blob) {
    return new Promise(function (ok, fail) {
      var url = URL.createObjectURL(blob), img = new Image();
      img.onload = function () { URL.revokeObjectURL(url); ok(img); };
      img.onerror = function () { URL.revokeObjectURL(url); fail(new Error('Das Bild konnte nicht gelesen werden.')); };
      img.src = url;
    });
  }
  function alsJpeg(canvas, q) { return new Promise(function (ok) { canvas.toBlob(ok, 'image/jpeg', q); }); }
  /** Verkleinert ein Foto auf höchstens 1600 px lange Seite, JPEG ca. 0,8 (Ziel etwa 300 KB) → Promise<Blob> */
  EG.fotoVerkleinern = async function (file) {
    var bmp;
    try { bmp = await createImageBitmap(file, { imageOrientation: 'from-image' }); }
    catch (e) { bmp = await alsBild(file); }
    var w = bmp.width || bmp.naturalWidth, hh = bmp.height || bmp.naturalHeight;
    var sk = Math.min(1, 1600 / Math.max(w, hh));
    var c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(w * sk)); c.height = Math.max(1, Math.round(hh * sk));
    var ctx = c.getContext('2d');
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
    ctx.drawImage(bmp, 0, 0, c.width, c.height);
    if (bmp.close) bmp.close();
    var q = 0.8, blob = await alsJpeg(c, q);
    while (blob && blob.size > 350 * 1024 && q > 0.5) { q -= 0.1; blob = await alsJpeg(c, q); }
    return blob;
  };
  function dateiname() {
    var d = new Date();
    return d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate()) + '-' + pad(d.getHours()) + pad(d.getMinutes()) + pad(d.getSeconds()) + '-' + Math.random().toString(36).slice(2, 6) + '.jpg';
  }
  /** EG.fotoHochladen(file, pfad) → Promise<String Speicherpfad>
      file: File/Blob (Kamera, Galerie). pfad: Ordner (z. B. 'lieferant/<fahrzeug_id>' – Dateiname wird erzeugt)
      ODER kompletter Pfad, der auf .jpg endet. Bucket: privater Speicher 'eingang-fotos'. */
  EG.fotoHochladen = async function (file, pfad) {
    var blob = await EG.fotoVerkleinern(file);
    var voll = /\.jpe?g$/i.test(pfad) ? pfad : pfad.replace(/\/+$/, '') + '/' + dateiname();
    var r = await EG.sb.storage.from(BUCKET).upload(voll, blob, { contentType: 'image/jpeg', upsert: false });
    if (r.error) throw r.error;
    return voll;
  };
  var urlCache = {};
  /** Signierte, kurz gültige URL (nur zur Anzeige im Tool) → Promise<String> */
  EG.fotoAnzeigen = async function (pfad) {
    var c = urlCache[pfad];
    if (c && c.bis > Date.now()) return c.url;
    var r = await EG.sb.storage.from(BUCKET).createSignedUrl(pfad, 600);
    if (r.error) throw r.error;
    urlCache[pfad] = { url: r.data.signedUrl, bis: Date.now() + 8 * 60 * 1000 };
    return r.data.signedUrl;
  };
  /** Foto als Blob laden (für den Mail-Anhang) → Promise<Blob> */
  EG.fotoBlob = async function (pfad) {
    var r = await EG.sb.storage.from(BUCKET).download(pfad);
    if (r.error) throw r.error;
    return r.data;
  };
  /** Vorschaubild (Knopf mit img); Tipp öffnet Großansicht. */
  EG.fotoThumb = function (pfad, o) {
    o = o || {};
    var img = h('img', { alt: 'Foto' });
    var b = h('button', { type: 'button', class: 'thumb laedt', 'aria-label': 'Foto groß anzeigen' }, img);
    EG.fotoAnzeigen(pfad).then(function (u) { img.src = u; b.classList.remove('laedt'); }, function () { b.classList.remove('laedt'); b.title = 'Foto nicht ladbar'; });
    b.addEventListener('click', function () { EG.fotoGross(pfad); });
    if (o.entfernen) {
      b.appendChild(h('span', {
        class: 'weg', role: 'button', 'aria-label': 'Foto entfernen', text: '×',
        onclick: function (e) { e.stopPropagation(); o.entfernen(pfad); }
      }));
    }
    return b;
  };
  EG.fotoGross = async function (pfad) {
    var img = h('img', { class: 'foto-gross', alt: 'Foto' });
    try { img.src = await EG.fotoAnzeigen(pfad); } catch (e) { EG.fehler(e); return; }
    EG.dialog({ titel: 'Foto', inhalt: img, breit: true, knoepfe: [{ text: 'Schließen', art: 'ghost', wert: null }], keinFokus: true });
  };
  /** EG.fotoBlock({pfad:'lieferant/<id>', fotos:[...], onChange:fn(arr)}) → {el, get(), set(arr), anzahl()}
      Fertiger Block „Foto aufnehmen / aus Galerie / Vorschau“. Lädt sofort hoch, merkt nur die Pfade. */
  EG.fotoBlock = function (o) {
    var liste = (o.fotos || []).slice();
    var reihe = h('div', { class: 'fotos' });
    var offen = 0;
    var kamera = h('input', { type: 'file', accept: 'image/*', capture: 'environment', hidden: true });
    var galerie = h('input', { type: 'file', accept: 'image/*', multiple: true, hidden: true });
    function geaendert() { if (o.onChange) o.onChange(liste.slice()); }
    function zeichne() {
      reihe.innerHTML = '';
      liste.forEach(function (p) {
        reihe.appendChild(EG.fotoThumb(p, { entfernen: function (x) { liste = liste.filter(function (y) { return y !== x; }); zeichne(); geaendert(); } }));
      });
      for (var i = 0; i < offen; i++) reihe.appendChild(h('div', { class: 'thumb laedt' }));
    }
    async function dateien(fl) {
      var arr = Array.prototype.slice.call(fl || []);
      for (var i = 0; i < arr.length; i++) {
        offen++; zeichne();
        try { liste.push(await EG.fotoHochladen(arr[i], o.pfad)); }
        catch (e) { EG.fehler(e); }
        offen--; zeichne(); geaendert();
      }
    }
    kamera.addEventListener('change', function () { dateien(kamera.files).then(function () { kamera.value = ''; }); });
    galerie.addEventListener('change', function () { dateien(galerie.files).then(function () { galerie.value = ''; }); });
    var knoepfe = h('div', { class: 'foto-knoepfe' },
      h('button', { type: 'button', class: 'btn btn-ghost btn-klein', text: 'Foto aufnehmen', onclick: function () { kamera.click(); } }),
      h('button', { type: 'button', class: 'btn btn-ghost btn-klein', text: 'Aus Galerie', onclick: function () { galerie.click(); } }),
      EG.demo ? h('button', { type: 'button', class: 'btn btn-ghost btn-klein', text: 'Demo-Foto', onclick: async function () { dateien([await EG.demoFoto('Demo-Foto ' + (liste.length + 1))]); } }) : null);
    var el = h('div', { class: 'fotoblock' }, reihe, knoepfe, kamera, galerie);
    zeichne();
    return {
      el: el,
      get: function () { return liste.slice(); },
      set: function (a) { liste = (a || []).slice(); zeichne(); },
      anzahl: function () { return liste.length; },
      laedt: function () { return offen > 0; }
    };
  };

  /* ====================================================================
     E-Mail mit Foto-Anhang
     ==================================================================== */
  function istMobil() { return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent || ''); }
  function blobZuBase64(blob) {
    return new Promise(function (ok, fail) {
      var r = new FileReader();
      r.onload = function () { ok(String(r.result).split(',')[1] || ''); };
      r.onerror = fail; r.readAsDataURL(blob);
    });
  }
  function textZuBase64(s) {
    var bytes = new TextEncoder().encode(s), bin = '', i;
    for (i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(bin);
  }
  function umbrechen76(b64) { return (b64.match(/.{1,76}/g) || []).join('\r\n'); }
  function kopfBase64(s) {   // RFC 2047, in Stücken ≤ 45 Byte (nie mitten in einem Zeichen)
    if (/^[\x20-\x7e]*$/.test(s)) return s;
    var teile = [], akt = '', enc = new TextEncoder();
    Array.from(s).forEach(function (z) {
      if (enc.encode(akt + z).length > 45) { teile.push(akt); akt = ''; }
      akt += z;
    });
    if (akt) teile.push(akt);
    return teile.map(function (t) { return '=?UTF-8?B?' + textZuBase64(t) + '?='; }).join('\r\n ');
  }
  /** Baut eine .eml-Datei (Entwurf, Header X-Unsent: 1) → Promise<Blob> */
  async function emlBauen(an, betreff, text, blobs) {
    var grenze = '----=_EG_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
    var z = [];
    z.push('X-Unsent: 1');
    z.push('To: ' + (an || ''));
    z.push('Subject: ' + kopfBase64(betreff));
    z.push('MIME-Version: 1.0');
    z.push('Content-Type: multipart/mixed; boundary="' + grenze + '"');
    z.push('');
    z.push('--' + grenze);
    z.push('Content-Type: text/plain; charset="utf-8"');
    z.push('Content-Transfer-Encoding: base64');
    z.push('');
    z.push(umbrechen76(textZuBase64(text.replace(/\r?\n/g, '\r\n'))));
    for (var i = 0; i < blobs.length; i++) {
      var name = 'Foto_' + (i + 1) + '.jpg';
      z.push('--' + grenze);
      z.push('Content-Type: image/jpeg; name="' + name + '"');
      z.push('Content-Transfer-Encoding: base64');
      z.push('Content-Disposition: attachment; filename="' + name + '"');
      z.push('');
      z.push(umbrechen76(await blobZuBase64(blobs[i])));
    }
    z.push('--' + grenze + '--');
    z.push('');
    return new Blob([z.join('\r\n')], { type: 'message/rfc822' });
  }
  function herunterladen(blob, name) {
    var url = URL.createObjectURL(blob), a = h('a', { href: url, download: name, style: 'display:none' });
    document.body.appendChild(a); a.click();
    setTimeout(function () { a.remove(); URL.revokeObjectURL(url); }, 4000);
  }

  /** EG.mailMitAnhang({an, betreff, text, fotoPfade}) → Promise<boolean>
      Zeigt den Versand-Dialog (Empfänger groß mit „Adresse kopieren“, Teilen mit Fotos, am PC .eml-Entwurf,
      Ersatzweg: Fotos einzeln + mailto). true = Person hat „Gesendet“ bestätigt, false = abgebrochen. */
  EG.mailMitAnhang = async function (o) {
    var an = (o.an || '').trim(), betreff = o.betreff || '', text = o.text || '', pfade = o.fotoPfade || [];
    var blobs = [], dateien = [], ladeFehler = null;
    var inhalt = h('div', {});
    var status = h('p', { class: 'muted klein', text: pfade.length ? 'Fotos werden geladen …' : '' });
    var teilenBtn = h('button', { type: 'button', class: 'btn btn-primary btn-block', text: 'Teilen: Mail-App öffnen', hidden: true, style: 'margin-bottom:8px' });
    var emlBtn = h('button', { type: 'button', class: 'btn btn-ghost btn-block', text: 'Outlook-Entwurf laden (.eml)', hidden: true, style: 'margin-bottom:8px' });
    var fotosBtn = h('button', { type: 'button', class: 'btn btn-ghost btn-block', text: 'Fotos einzeln laden', style: 'margin-bottom:8px' });
    var mailtoBtn = h('button', { type: 'button', class: 'btn btn-ghost btn-block', text: 'Mail mit Text öffnen (ohne Fotos)', style: 'margin-bottom:8px' });
    var ersatz = h('details', { class: 'klappe' }, h('summary', { text: 'Geht das Teilen nicht? Ersatzweg' }), fotosBtn, mailtoBtn,
      h('p', { class: 'feld-hinweis', text: 'Fotos laden, dann „Mail mit Text öffnen“ tippen und die Fotos von Hand anhängen.' }));
    var vorschau = h('textarea', { class: 'mail-vorschau', readOnly: true, value: text });

    inhalt.appendChild(h('div', { class: 'empf' },
      h('div', { class: 'feld-label', text: 'Empfänger' }),
      h('div', { class: 'empf-adresse', text: an || '(keine Adresse hinterlegt)' }),
      h('button', { type: 'button', class: 'btn btn-ghost btn-klein', text: 'Adresse kopieren', disabled: !an, onclick: async function () { EG.toast((await EG.kopieren(an)) ? 'Adresse kopiert' : 'Kopieren nicht möglich – bitte von Hand abtippen', 'ok'); } })));
    inhalt.appendChild(h('div', { class: 'schritt' }, h('span', { class: 'schritt-nr', text: '1' }), h('span', { text: 'Mail mit Fotos vorbereiten' })));
    inhalt.appendChild(h('p', { class: 'feld-hinweis', style: 'margin:0 0 8px 40px', text: 'Das Teilen kennt keinen Empfänger. Kopiere zuerst die Adresse und füge sie in der Mail-App ein.' }));
    inhalt.appendChild(status);
    inhalt.appendChild(teilenBtn);
    inhalt.appendChild(emlBtn);
    inhalt.appendChild(ersatz);
    inhalt.appendChild(h('div', { class: 'schritt' }, h('span', { class: 'schritt-nr', text: '2' }), h('span', { text: 'Mail prüfen und aus deinem Postfach senden' })));
    inhalt.appendChild(h('div', { class: 'feld', style: 'margin-top:6px' },
      h('div', { class: 'feld-label', text: 'Betreff' }), h('div', { class: 'umbruch', text: betreff, style: 'font-weight:600' }),
      h('div', { style: 'display:flex;gap:8px;margin:6px 0 10px;flex-wrap:wrap' },
        h('button', { type: 'button', class: 'btn btn-ghost btn-klein', text: 'Betreff kopieren', onclick: async function () { EG.toast((await EG.kopieren(betreff)) ? 'Betreff kopiert' : 'Kopieren nicht möglich', 'ok'); } }),
        h('button', { type: 'button', class: 'btn btn-ghost btn-klein', text: 'Text kopieren', onclick: async function () { EG.toast((await EG.kopieren(text)) ? 'Text kopiert' : 'Kopieren nicht möglich', 'ok'); } })),
      h('div', { class: 'feld-label', text: 'Text (' + pfade.length + ' Foto' + (pfade.length === 1 ? '' : 's') + ' im Anhang)' }), vorschau));
    inhalt.appendChild(h('div', { class: 'schritt' }, h('span', { class: 'schritt-nr', text: '3' }), h('span', { text: 'Danach hier „Gesendet“ tippen' })));

    // Fotos vorab laden, damit navigator.share() ohne Wartezeit aus dem Tipp heraus aufgerufen wird
    var geladen = (async function () {
      try {
        for (var i = 0; i < pfade.length; i++) {
          var b = await EG.fotoBlob(pfade[i]);
          blobs.push(b);
          dateien.push(new File([b], 'Foto_' + (i + 1) + '.jpg', { type: 'image/jpeg' }));
        }
        status.textContent = pfade.length ? pfade.length + ' Foto(s) bereit.' : '';
        var kannTeilen = false;
        try { kannTeilen = !!(navigator.canShare && dateien.length && navigator.canShare({ files: dateien })); } catch (e) { kannTeilen = false; }
        teilenBtn.hidden = !kannTeilen;
        emlBtn.hidden = istMobil() && !EG.demo;
        if (!kannTeilen && istMobil()) ersatz.open = true;   // Handy ohne Teilen mit Anhang: Ersatzweg gleich aufklappen
      } catch (e) {
        ladeFehler = e; status.textContent = 'Fotos konnten nicht geladen werden: ' + (e.message || e);
        status.className = 'rot-text fett';
      }
    })();

    teilenBtn.addEventListener('click', async function () {
      try { await navigator.share({ title: betreff, text: text, files: dateien }); }
      catch (e) { if (e && e.name !== 'AbortError') EG.toast('Teilen nicht möglich: ' + (e.message || e) + ' – nimm den Ersatzweg.', 'fehler'); }
    });
    emlBtn.addEventListener('click', async function () {
      try { herunterladen(await emlBauen(an, betreff, text, blobs), 'Ruege_' + EG.heute() + '.eml'); EG.toast('Entwurf geladen – öffne die Datei, Outlook zeigt sie als Entwurf.', 'ok'); }
      catch (e) { EG.fehler(e); }
    });
    fotosBtn.addEventListener('click', function () {
      blobs.forEach(function (b, i) { setTimeout(function () { herunterladen(b, 'Foto_' + (i + 1) + '.jpg'); }, i * 400); });
      if (!blobs.length) EG.toast('Keine Fotos vorhanden.');
    });
    mailtoBtn.addEventListener('click', function () {
      location.href = 'mailto:' + encodeURIComponent(an).replace(/%40/g, '@') + '?subject=' + encodeURIComponent(betreff) + '&body=' + encodeURIComponent(text);
    });

    var w = await EG.dialog({
      titel: 'Rüge versenden', inhalt: inhalt, breit: true, keinFokus: true,
      knoepfe: [
        { text: 'Abbrechen', art: 'ghost', wert: false },
        {
          text: 'Gesendet', art: 'primary', wert: true,
          aktion: async function () {
            if (ladeFehler) return 'Die Fotos konnten nicht geladen werden – so ist die Mail unvollständig. Bitte abbrechen und neu versuchen.';
            await geladen;
            return EG.bestaetigen('Hast du die Mail wirklich abgeschickt (mit den Fotos im Anhang)?', { ja: 'Ja, gesendet', nein: 'Noch nicht' });
          }
        }
      ]
    });
    return w === true;
  };

  /* ====================================================================
     Benutzer, Rolle, Name
     ==================================================================== */
  EG.nutzer = function () { return (EG.user && EG.user.email) || ''; };
  EG.istWerkstatt = function () { return /^werkstatt@/i.test(EG.nutzer()); };
  EG.istAdmin = function () { return EG.rolle === 'admin'; };
  /** Name für „erfasst von“/„gesendet von“: bei werkstatt@ der auf dem Gerät gemerkte Name, sonst anzeigename. */
  EG.nutzerName = function () {
    if (EG.istWerkstatt()) return lsGet(LS_NAME) || '';
    return EG.anzeigename || EG.nutzer().split('@')[0];
  };
  /** Fragt bei werkstatt@ den Namen ab (erzwingen=true: ohne Abbrechen). → Promise<String> */
  EG.nameAbfragen = async function (erzwingen) {
    if (!EG.istWerkstatt()) return EG.nutzerName();
    var alt = lsGet(LS_NAME) || '';
    var n = await EG.eingabe('Trage deinen Namen ein. Er wird bei jedem Haken gespeichert.', {
      titel: alt ? 'Name ändern' : 'Wer bist du?', vorgabe: alt, platzhalter: 'Vorname Nachname', pflicht: !!erzwingen || !alt, ok: 'Speichern'
    });
    if (n) lsSet(LS_NAME, n);
    return EG.nutzerName();
  };
  function namenAnzeigen() {
    var b = $('btn-name');
    var n = EG.nutzerName();
    if (EG.istWerkstatt()) { b.textContent = (n || 'Name eintragen') + ' (ändern)'; b.disabled = false; }
    else { b.textContent = n || EG.nutzer(); b.disabled = true; }
    b.title = EG.nutzer();
  }

  /* ====================================================================
     Reiter
     ==================================================================== */
  var tabFns = {}, aktivTab = null, appBereit = false;
  /** EG.onTab('anlieferung' | 'inzahlung', function (container) {...})
      Registriert die Zeichenfunktion eines Reiters. Sie wird bei JEDEM Aktivieren des Reiters aufgerufen
      (erstes Zeigen, Wechsel zurück, nach Anmeldung). container = <section id="tab-NAME">. */
  EG.onTab = function (name, fn) {
    tabFns[name] = fn;
    if (appBereit && aktivTab === name) rufeTab(name);
  };
  function rufeTab(name) {
    var sec = $('tab-' + name), fn = tabFns[name];
    if (!sec) return;
    if (!fn) { sec.innerHTML = ''; sec.appendChild(EG.banner('Dieser Reiter wird in Paket P4 ergänzt.', 'info')); return; }
    try { var p = fn(sec); if (p && p.catch) p.catch(EG.fehler); } catch (e) { EG.fehler(e); }
  }
  EG.zeigeTab = function (name) {
    aktivTab = name;
    ['anlieferung', 'inzahlung'].forEach(function (n) {
      $('tab-' + n).hidden = n !== name;
      $('tabk-' + n).setAttribute('aria-selected', n === name ? 'true' : 'false');
    });
    lsSet(LS_TAB, name);
    rufeTab(name);
  };

  /* ====================================================================
     Ansichten, Anmeldung (wie im Dashboard)
     ==================================================================== */
  function ansicht(id) {
    ['view-login', 'view-recovery', 'view-keinzugriff', 'view-app'].forEach(function (v) { $(v).hidden = v !== id; });
  }
  function msg(id, text, ok) {
    var m = $(id); m.className = 'msg ' + (ok ? 'ok' : 'err'); m.textContent = text;
    setTimeout(function () { m.className = 'msg'; }, 7000);
  }
  var recoveryModus = false;
  var RECOVERY_URL = location.origin + location.pathname + '?recovery=1';

  async function passwortVergessen() {
    var email = $('login-email').value.trim();
    if (!email) { msg('login-msg', 'Bitte oben die E-Mail-Adresse eintragen und dann noch einmal „Passwort vergessen?“ tippen.', false); return; }
    var r = await EG.sb.auth.resetPasswordForEmail(email, { redirectTo: RECOVERY_URL });
    if (r.error) { msg('login-msg', 'Anfrage fehlgeschlagen: ' + r.error.message, false); return; }
    msg('login-msg', 'Wenn es ein Konto für ' + email + ' gibt, ist jetzt eine E-Mail unterwegs. Der Link darin führt hierher zurück.', true);
  }
  function zeigeRecovery(hatSitzung) {
    ansicht('view-recovery');
    $('rec-form').hidden = !hatSitzung;
    $('rec-abgelaufen').hidden = !!hatSitzung;
  }
  async function passwortSetzen() {
    var p1 = $('rec-pass').value, p2 = $('rec-pass2').value;
    if (p1.length < 8) { msg('rec-msg', 'Mindestens 8 Zeichen.', false); return; }
    if (p1 !== p2) { msg('rec-msg', 'Die beiden Eingaben stimmen nicht überein.', false); return; }
    var r = await EG.sb.auth.updateUser({ password: p1 });
    if (r.error) { msg('rec-msg', 'Speichern fehlgeschlagen: ' + r.error.message, false); return; }
    msg('rec-msg', 'Passwort gespeichert. Du wirst angemeldet …', true);
    history.replaceState(null, '', location.pathname);
    setTimeout(function () { location.reload(); }, 1200);
  }
  async function anmelden() {
    var r = await EG.sb.auth.signInWithPassword({ email: $('login-email').value.trim(), password: $('login-pass').value });
    if (r.error) { msg('login-msg', 'Anmeldung fehlgeschlagen: ' + r.error.message, false); return; }
    await nachAnmeldung(r.data.user);
  }
  async function abmelden() {
    if (!EG.demo && EG.sb) await EG.sb.auth.signOut();
    location.reload();
  }
  async function nachAnmeldung(user) {
    EG.user = { email: (user.email || '').toLowerCase() };
    try {
      var r = await EG.sb.schema('shared').rpc('aktuelle_rolle');
      EG.rolle = r.data || null;
      if (!r.error && !EG.rolle) { ansicht('view-keinzugriff'); return; }   // Konto ohne Rolle: Server liefert sonst nur leere Listen
    } catch (e) { console.warn('Rolle nicht ermittelbar', e); }
    try {
      var b = await EG.sb.schema('shared').from('benutzer').select('anzeigename').eq('email', EG.user.email).maybeSingle();
      EG.anzeigename = (b.data && b.data.anzeigename) || '';
    } catch (e) { /* Fallback: E-Mail-Anfang */ }
    await startApp();
  }
  async function startApp() {
    if (EG.istWerkstatt() && !lsGet(LS_NAME)) await EG.nameAbfragen(true);
    namenAnzeigen();
    ansicht('view-app');
    appBereit = true;
    var t = lsGet(LS_TAB), hash = (location.hash || '').replace('#', '');
    EG.zeigeTab(tabFns[hash] || hash === 'inzahlung' || hash === 'anlieferung' ? hash : (t === 'inzahlung' ? 'inzahlung' : 'anlieferung'));
  }

  /* ====================================================================
     Start
     ==================================================================== */
  /** Startet die Seite. Echt: Supabase-Sitzung prüfen. Demo (?demo=1): sofort mit Mock-Daten. */
  EG.start = async function () {
    $('btn-logout').addEventListener('click', abmelden);
    $('kz-logout').addEventListener('click', abmelden);
    $('btn-name').addEventListener('click', async function () { await EG.nameAbfragen(false); namenAnzeigen(); if (aktivTab) rufeTab(aktivTab); });
    document.querySelectorAll('.tab-knopf').forEach(function (b) { b.addEventListener('click', function () { EG.zeigeTab(b.getAttribute('data-tab')); }); });

    if (EG.demo) { await demoStart(); return; }

    $('login-ok').addEventListener('click', function () { anmelden().catch(EG.fehler); });
    $('login-vergessen').addEventListener('click', function () { passwortVergessen().catch(EG.fehler); });
    $('login-pass').addEventListener('keydown', function (e) { if (e.key === 'Enter') anmelden().catch(EG.fehler); });
    $('rec-ok').addEventListener('click', function () { passwortSetzen().catch(EG.fehler); });
    $('rec-zurueck').addEventListener('click', function () { history.replaceState(null, '', location.pathname); location.reload(); });

    if (!window.supabase) {
      ansicht('view-login');
      msg('login-msg', 'Die Verbindungsbibliothek (supabase-js) konnte nicht geladen werden. Bitte Internetverbindung prüfen und neu laden.', false);
      return;
    }
    EG.sb = window.supabase.createClient(SUPA_URL, SUPA_KEY);
    recoveryModus = /recovery/.test(location.search) || /type=recovery/.test(location.hash);
    EG.sb.auth.onAuthStateChange(function (ev) { if (ev === 'PASSWORD_RECOVERY') { recoveryModus = true; zeigeRecovery(true); } });
    var s = await EG.sb.auth.getSession();
    if (recoveryModus) { zeigeRecovery(!!(s.data && s.data.session)); return; }
    if (s.data && s.data.session) await nachAnmeldung(s.data.session.user); else ansicht('view-login');
  };

  /** Tabelle ansprechen, egal ob echt oder Demo: EG.tab('eingang', 'fahrzeug').select('*')... */
  EG.tab = function (schema, tabelle) { return EG.sb.schema(schema).from(tabelle); };

  /* ====================================================================
     DEMO-MODUS: Mock mit gleicher Schnittstelle wie supabase-js
     (nur die hier genutzten Teile: select/insert/update/upsert/delete, Filter, order, limit, single,
      rpc, functions.invoke, storage). Alles nur im Speicher dieser Seite.
     ==================================================================== */
  var store = {};          // 'schema.tabelle' → Array von Zeilen
  var blobSpeicher = {};   // Speicherpfad → Blob
  var PK = { 'eingang.lieferant_kontakt': 'lieferant' };
  var STANDARD = {
    'eingang.fahrzeug': function () { return { quelle: 'hand', status: 'erwartet', nicht_mehr_in_masterliste: false }; },
    'eingang.mangel': function () { return { ruege_status: 'offen', fotos: [] }; },
    'eingang.pruefpunkt': function () { return { erfasst_am: new Date().toISOString() }; }
  };
  function tabelle(k) { return store[k] || (store[k] = []); }
  function kopie(x) { return x === undefined ? x : JSON.parse(JSON.stringify(x)); }
  function vergleich(a, b) {
    if (a == null && b == null) return 0;
    if (a == null) return 1;
    if (b == null) return -1;
    return a < b ? -1 : a > b ? 1 : 0;
  }
  function Q(schema, name) {
    this.key = schema + '.' + name; this.op = 'select'; this.f = []; this.ord = []; this.lim = null; this.eins = null;
    this.zeilen = null; this.wert = null; this.konf = null; this.rueck = true;
  }
  Q.prototype.select = function () { this.rueck = true; return this; };
  Q.prototype.insert = function (z) { this.op = 'insert'; this.zeilen = Array.isArray(z) ? z : [z]; this.rueck = false; return this; };
  Q.prototype.upsert = function (z, o) { this.op = 'upsert'; this.zeilen = Array.isArray(z) ? z : [z]; this.konf = ((o && o.onConflict) || PK[this.key] || 'id').split(',').map(function (s) { return s.trim(); }); this.rueck = false; return this; };
  Q.prototype.update = function (w) { this.op = 'update'; this.wert = w; this.rueck = false; return this; };
  Q.prototype.delete = function () { this.op = 'delete'; this.rueck = false; return this; };
  Q.prototype.eq = function (c, v) { this.f.push(function (r) { return v === null ? r[c] == null : r[c] === v; }); return this; };
  Q.prototype.neq = function (c, v) { this.f.push(function (r) { return r[c] !== v; }); return this; };
  Q.prototype.in = function (c, a) { this.f.push(function (r) { return a.indexOf(r[c]) >= 0; }); return this; };
  Q.prototype.is = function (c, v) { this.f.push(function (r) { return v === null ? r[c] == null : r[c] === v; }); return this; };
  Q.prototype.not = function (c, op, v) { this.f.push(function (r) { return op === 'is' ? (v === null ? r[c] != null : r[c] !== v) : r[c] !== v; }); return this; };
  Q.prototype.gt = function (c, v) { this.f.push(function (r) { return r[c] != null && r[c] > v; }); return this; };
  Q.prototype.gte = function (c, v) { this.f.push(function (r) { return r[c] != null && r[c] >= v; }); return this; };
  Q.prototype.lt = function (c, v) { this.f.push(function (r) { return r[c] != null && r[c] < v; }); return this; };
  Q.prototype.lte = function (c, v) { this.f.push(function (r) { return r[c] != null && r[c] <= v; }); return this; };
  Q.prototype.ilike = function (c, p) {
    var re = new RegExp('^' + String(p).replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/%/g, '.*').replace(/_/g, '.') + '$', 'i');
    this.f.push(function (r) { return r[c] != null && re.test(String(r[c])); }); return this;
  };
  Q.prototype.or = function () { throw new Error('Demo-Mock: .or() wird nicht unterstützt'); };
  Q.prototype.order = function (c, o) { this.ord.push({ c: c, auf: !(o && o.ascending === false), nf: o && o.nullsFirst }); return this; };
  Q.prototype.limit = function (n) { this.lim = n; return this; };
  Q.prototype.single = function () { this.eins = 'single'; return this; };
  Q.prototype.maybeSingle = function () { this.eins = 'maybe'; return this; };
  Q.prototype.then = function (ok, fail) { return this.ausfuehren().then(ok, fail); };
  Q.prototype.ausfuehren = function () {
    var self = this;
    return new Promise(function (resolve) {
      try { resolve(self.lauf()); } catch (e) { resolve({ data: null, error: { message: e.message } }); }
    });
  };
  Q.prototype.lauf = function () {
    var self = this, T = tabelle(self.key), pk = PK[self.key] || 'id', jetzt = new Date().toISOString(), ergebnis = [];
    function passt(r) { return self.f.every(function (fn) { return fn(r); }); }
    function neu(z) {
      var r = Object.assign({}, STANDARD[self.key] ? STANDARD[self.key]() : {}, kopie(z));
      if (pk === 'id' && !r.id) r.id = EG.uuid();
      if (!('created_at' in r) && pk === 'id') r.created_at = jetzt;
      if (T.some(function (x) { return x[pk] === r[pk]; })) throw new Error('Doppelter Schlüssel (' + pk + ')');
      T.push(r); return r;
    }
    if (self.op === 'select') ergebnis = T.filter(passt);
    else if (self.op === 'insert') ergebnis = self.zeilen.map(neu);
    else if (self.op === 'upsert') {
      ergebnis = self.zeilen.map(function (z) {
        var vorh = T.filter(function (x) { return self.konf.every(function (c) { return x[c] === z[c]; }); })[0];
        if (vorh) { Object.assign(vorh, kopie(z)); if ('updated_at' in vorh) vorh.updated_at = jetzt; return vorh; }
        return neu(z);
      });
    } else if (self.op === 'update') {
      ergebnis = T.filter(passt);
      ergebnis.forEach(function (r) { Object.assign(r, kopie(self.wert)); if ('updated_at' in r) r.updated_at = jetzt; });
    } else if (self.op === 'delete') {
      ergebnis = T.filter(passt);
      store[self.key] = T.filter(function (r) { return ergebnis.indexOf(r) < 0; });
    }
    ergebnis = ergebnis.slice();
    self.ord.slice().reverse().forEach(function (o) {
      ergebnis.sort(function (a, b) {
        var an = a[o.c] == null, bn = b[o.c] == null;
        if (an || bn) { if (an && bn) return 0; var nullErste = o.nf != null ? o.nf : !o.auf; return (an ? 1 : -1) * (nullErste ? -1 : 1); }
        return (o.auf ? 1 : -1) * vergleich(a[o.c], b[o.c]);
      });
    });
    if (self.lim != null) ergebnis = ergebnis.slice(0, self.lim);
    var daten = kopie(ergebnis);
    if (!self.rueck) return { data: null, error: null };
    if (self.eins) {
      if (daten.length === 1) return { data: daten[0], error: null };
      if (self.eins === 'maybe' && daten.length === 0) return { data: null, error: null };
      return { data: null, error: { message: 'Erwartet wurde genau eine Zeile, gefunden: ' + daten.length } };
    }
    return { data: daten, error: null };
  };
  function mockClient() {
    var c = {
      from: function (t) { return new Q('public', t); },
      schema: function (s) {
        return {
          from: function (t) { return new Q(s, t); },
          rpc: function (n) { return Promise.resolve({ data: n === 'aktuelle_rolle' ? EG.rolle : null, error: null }); }
        };
      },
      rpc: function () { return Promise.resolve({ data: null, error: null }); },
      functions: { invoke: function (n) { return Promise.resolve({ data: { ok: true, demo: true, funktion: n }, error: null }); } },
      storage: {
        from: function () {
          return {
            upload: async function (p, blob) { blobSpeicher[p] = blob; return { data: { path: p }, error: null }; },
            download: async function (p) { return blobSpeicher[p] ? { data: blobSpeicher[p], error: null } : { data: null, error: { message: 'Foto nicht gefunden: ' + p } }; },
            createSignedUrl: async function (p) { return blobSpeicher[p] ? { data: { signedUrl: URL.createObjectURL(blobSpeicher[p]) }, error: null } : { data: null, error: { message: 'Foto nicht gefunden' } }; },
            remove: async function (a) { (a || []).forEach(function (p) { delete blobSpeicher[p]; }); return { data: [], error: null }; }
          };
        }
      },
      auth: { signOut: function () { return Promise.resolve({}); } }
    };
    return c;
  }
  /** Demo: Zeilen für 'schema.tabelle' vorbelegen (nur wirksam, wenn die Tabelle noch leer ist). */
  EG.demoSeed = function (schluessel, zeilen) {
    if (!EG.demo) return;
    if (!tabelle(schluessel).length) store[schluessel] = kopie(zeilen);
  };
  /** Demo-Foto (Platzhalterbild mit Beschriftung) → Promise<Blob> */
  EG.demoFoto = function (beschriftung) {
    var c = document.createElement('canvas'); c.width = 800; c.height = 600;
    var x = c.getContext('2d'), g = x.createLinearGradient(0, 0, 800, 600);
    g.addColorStop(0, '#E8F0FB'); g.addColorStop(1, '#BCD3F3');
    x.fillStyle = g; x.fillRect(0, 0, 800, 600);
    x.fillStyle = '#0A5CD0'; x.fillRect(180, 300, 440, 110);        // Karosserie
    x.fillRect(260, 230, 280, 90);                                  // Kabine
    x.fillStyle = '#1A2333'; x.beginPath(); x.arc(270, 420, 48, 0, 7); x.arc(530, 420, 48, 0, 7); x.fill();
    x.fillStyle = '#EC1C24'; x.fillRect(420, 280, 90, 18);          // „Schaden“
    x.fillStyle = '#1A2333'; x.font = 'bold 40px sans-serif'; x.textAlign = 'center';
    x.fillText(beschriftung || 'Demo-Foto', 400, 90);
    x.font = '24px sans-serif'; x.fillText('DEMO – kein echtes Fahrzeugfoto', 400, 540);
    return new Promise(function (ok) { c.toBlob(ok, 'image/jpeg', 0.85); });
  };

  async function demoDatenAnlegen() {
    var d = function (n) { var x = new Date(); x.setDate(x.getDate() + n); return EG.isoDatum(x); };
    var vor = function (n, std) { var x = new Date(); x.setDate(x.getDate() - n); x.setHours(std || 9, 15, 0, 0); return x.toISOString(); };
    var lief = 'Demo-Autohaus Nord GmbH', lief2 = 'Beispiel Fahrzeughandel KG';
    EG.demoSeed('eingang.lieferant_kontakt', [{ lieferant: lief, email: 'ruege@demo-autohaus-nord.example', notiz: 'Demo-Adresse, nicht echt' }]);
    var fz = function (id, o) {
      return Object.assign({ id: id, quelle: 'masterliste', ml_ref: 'demo_' + id, nicht_mehr_in_masterliste: false, created_at: vor(12), updated_at: vor(1) }, o);
    };
    EG.demoSeed('eingang.fahrzeug', [
      fz('f0000001-0000-4000-8000-000000000001', { interne_nr: '90001', autrado_nr: '900001', fin: 'DEMO0000000000001', hersteller: 'Hyundai', modell: 'Tucson 1.6 T-GDI Demo', farbe: 'Polar White', lieferant: lief, lief_bestell_datum: d(-10), gepl_anlieferung: d(1), status: 'erwartet' }),
      fz('f0000001-0000-4000-8000-000000000002', { interne_nr: '90002', autrado_nr: '900002', fin: 'DEMO0000000000002', hersteller: 'Kia', modell: 'Sportage 1.6 Demo', farbe: 'Deep Chroma Blue', lieferant: lief2, lief_bestell_datum: d(-7), gepl_anlieferung: d(3), status: 'erwartet' }),
      fz('f0000001-0000-4000-8000-000000000003', { interne_nr: '90003', autrado_nr: '900003', fin: 'DEMO0000000000003', hersteller: 'Nissan', modell: 'Qashqai 1.3 Demo', farbe: 'Pearl Black', lieferant: lief, lief_bestell_datum: d(-14), gepl_anlieferung: d(-5), status: 'angeliefert', angeliefert_am: vor(5, 10), angeliefert_von_name: 'Demo Mitarbeiter' }),
      fz('f0000001-0000-4000-8000-000000000004', { interne_nr: '90004', autrado_nr: '900004', fin: 'DEMO0000000000004', hersteller: 'Opel', modell: 'Mokka Demo Edition', farbe: 'Rot', lieferant: lief, lief_bestell_datum: d(-9), gepl_anlieferung: d(0), status: 'pruefung_laeuft', angeliefert_am: vor(0, 8), angeliefert_von_name: 'Demo Mitarbeiter', km: 12 }),
      fz('f0000001-0000-4000-8000-000000000005', { interne_nr: '90005', autrado_nr: '900005', fin: 'DEMO0000000000005', hersteller: 'Opel', modell: 'Corsa Demo', farbe: 'Grau', lieferant: lief2, lief_bestell_datum: d(-20), gepl_anlieferung: d(-9), status: 'geprueft_ok', angeliefert_am: vor(9, 9), angeliefert_von_name: 'Demo Mitarbeiter', geprueft_am: vor(9, 11), geprueft_von_name: 'Demo Mitarbeiter', km: 8 }),
      fz('f0000001-0000-4000-8000-000000000006', { interne_nr: '90006', autrado_nr: '900006', fin: 'DEMO0000000000006', hersteller: 'Hyundai', modell: 'Tucson Hybrid Demo', farbe: 'Schwarz', lieferant: lief, lief_bestell_datum: d(-18), gepl_anlieferung: d(-8), status: 'ruege_gesendet', angeliefert_am: vor(8, 9), geprueft_am: vor(8, 12), geprueft_von_name: 'Demo Mitarbeiter' }),
      fz('f0000001-0000-4000-8000-000000000007', { interne_nr: '90007', autrado_nr: '900007', fin: 'DEMO0000000000007', hersteller: 'Kia', modell: 'Ceed Demo', farbe: 'Orange', lieferant: lief, lief_bestell_datum: d(-8), gepl_anlieferung: d(-1), status: 'wartet_oli', angeliefert_am: vor(1, 9), angeliefert_von_name: 'Demo Mitarbeiter', geprueft_am: vor(1, 11), geprueft_von_name: 'Demo Mitarbeiter', km: 14 }),
      fz(null, { quelle: 'hand', ml_ref: null, interne_nr: '', fin: '', hersteller: 'Opel', modell: 'Vivaro Demo (von Hand angelegt)', farbe: 'Weiß', lieferant: lief2, lief_bestell_datum: d(-3), gepl_anlieferung: d(6), status: 'erwartet', nicht_mehr_in_masterliste: false })
    ].map(function (z, i) { if (!z.id) z.id = 'f0000001-0000-4000-8000-000000000008'; return z; }));
    // Prüfpunkte und ein offener Mangel (Fahrzeug 7, wartet auf Oli)
    var f4 = 'f0000001-0000-4000-8000-000000000004', f7 = 'f0000001-0000-4000-8000-000000000007';
    var pp = function (fid, block, punkt, erg, notiz) { return { id: EG.uuid(), fahrzeug_id: fid, block: block, punkt: punkt, ergebnis: erg, notiz: notiz || null, erfasst_von_name: 'Demo Mitarbeiter', erfasst_am: vor(0, 9) }; };
    var ppMangel = pp(f7, 'Schäden', 'Rundgang außen', 'mangel', 'Delle Beifahrertür, ca. 4 cm');
    EG.demoSeed('eingang.pruefpunkt', [
      pp(f4, 'Papiere', 'COC vorhanden', 'ok'), pp(f4, 'Papiere', 'Serviceheft / Garantieunterlagen', 'ok'), pp(f4, 'Identität', 'FIN am Fahrzeug = Papiere', 'ok'),
      ppMangel
    ]);
    var foto1 = 'lieferant/' + f7 + '/demo-delle-1.jpg';
    if (EG.demo && !blobSpeicher[foto1]) blobSpeicher[foto1] = await EG.demoFoto('Delle Beifahrertür');
    EG.demoSeed('eingang.mangel', [{
      id: EG.uuid(), fahrzeug_id: f7, pruefpunkt_id: ppMangel.id, kategorie: 'Delle', klasse: 'ab_100',
      beschreibung: 'Beifahrertür, ca. 4 cm Durchmesser, Lack unversehrt', fotos: [foto1], ruege_status: 'wartet_oli', erfasst_von_name: 'Demo Mitarbeiter', created_at: vor(1, 10)
    }]);
  }

  var demoKonten = {
    admin: { email: 'oli@demo.example', rolle: 'admin', name: 'Oli (Demo)' },
    verkauf: { email: 'verkauf@demo.example', rolle: 'verkauf', name: 'Verkäufer (Demo)' },
    werkstatt: { email: 'werkstatt@demo.example', rolle: 'werkstatt', name: '' }
  };
  async function demoKontoSetzen(art) {
    var k = demoKonten[art] || demoKonten.admin;
    EG.user = { email: k.email }; EG.rolle = k.rolle; EG.anzeigename = k.name;
    if (art === 'werkstatt' && !lsGet(LS_NAME)) await EG.nameAbfragen(true);
    namenAnzeigen();
    if (aktivTab) rufeTab(aktivTab);
  }
  async function demoStart() {
    $('demo-band').hidden = false;
    document.title = 'DEMO · ' + document.title;
    EG.sb = mockClient();
    await demoDatenAnlegen();
    $('demo-reset').addEventListener('click', function () { location.reload(); });
    $('demo-konto').addEventListener('change', function () { demoKontoSetzen($('demo-konto').value).catch(EG.fehler); });
    var k = demoKonten.admin;
    EG.user = { email: k.email }; EG.rolle = k.rolle; EG.anzeigename = k.name;
    await startApp();
  }
})();
