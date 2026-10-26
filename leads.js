/* Leads 1.0 (26.10.2026) – Reiter "Leads" im Ankauf-Dashboard.
   Fällige Nachkontakte, Kontakt erfassen, Schnellerfassung, Nachfass-Entwurf, Push-Benachrichtigung.
   Eingebunden aus index.html:  LEADS.boot(db, { url: SUPABASE_URL, key: SUPABASE_KEY })  nach der Rollenprüfung
                                LEADS.show(container)                                      beim Öffnen des Reiters
   Alle Daten kommen von der Edge Function leads_api (Rollenprüfung verkauf/admin dort).
   Diese Datei enthält KEINE Schlüssel, Listen-IDs oder Kundendaten. Es wird nie automatisch gesendet:
   WhatsApp und Mail öffnen sich nur als Entwurf (wa.me / mailto). */
(function () {
  "use strict";
  var CFG = null, DB = null, ME = null, LISTE = null, FILTER = null;
  var ROOT = null, TIMER = null, BEKANNT = null, BOOTED = false, OFFEN_ID = null;

  var CSS = ""
    + ".ld{font-family:var(--font-body,'DM Sans',system-ui,sans-serif);color:var(--ink,#1A2333)}"
    + ".ld-test{background:#FFF4D6;border:1px solid #F0C95A;color:#6B4E00;border-radius:12px;padding:10px 14px;margin:0 0 12px;font-size:14px;font-weight:600}"
    + ".ld-leiste{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin:0 0 12px}"
    + ".ld-knopf{font-family:var(--font-heading,'Plus Jakarta Sans',system-ui,sans-serif);font-weight:700;font-size:15px;border:none;border-radius:14px;padding:11px 18px;min-height:44px;cursor:pointer;background:#007BFF;color:#fff}"
    + ".ld-knopf:hover{background:#0A5CD0}.ld-knopf:disabled{background:#8E9FB4;cursor:default}"
    + ".ld-leise{background:#fff;color:#0A5CD0;border:1px solid var(--border,#E0E8F0);font-size:14px;padding:8px 14px;min-height:40px}"
    + ".ld-leise:hover{background:#EEF3FA}"
    + ".ld-sel,.ld input[type=text],.ld input[type=email],.ld input[type=tel],.ld input[type=date],.ld select,.ld textarea{font:inherit;font-size:16px;color:var(--ink,#1A2333);background:#fff;border:1px solid var(--border,#E0E8F0);border-radius:12px;padding:10px 12px;min-height:44px;width:100%;box-sizing:border-box}"
    + ".ld textarea{min-height:90px;resize:vertical}"
    + ".ld input:focus,.ld select:focus,.ld textarea:focus{outline:2px solid rgba(0,123,255,.35);border-color:#007BFF}"
    + ".ld-h{font-family:var(--font-heading,'Plus Jakarta Sans',system-ui,sans-serif);font-size:17px;font-weight:700;margin:18px 0 8px;display:flex;align-items:center;gap:8px}"
    + ".ld-zahl{background:#EEF3FA;color:#0A5CD0;border-radius:999px;padding:1px 10px;font-size:13px}"
    + ".ld-karte{border:1px solid var(--border,#E0E8F0);border-radius:16px;padding:12px 14px;margin:0 0 10px;background:#fff;box-shadow:0 4px 14px rgba(26,109,212,.06)}"
    + ".ld-karte.ld-hell{outline:3px solid rgba(0,123,255,.45)}"
    + ".ld-kopf{display:flex;justify-content:space-between;gap:8px;align-items:flex-start;flex-wrap:wrap}"
    + ".ld-name{font-weight:700;font-size:16px}"
    + ".ld-chip{display:inline-block;border-radius:999px;padding:2px 9px;font-size:12px;font-weight:600;background:#EEF3FA;color:#4A5F78;margin:2px 4px 2px 0}"
    + ".ld-chip.rot{background:rgba(231,76,60,.12);color:#C0392B}.ld-chip.gruen{background:rgba(31,155,84,.12);color:#157A3A}"
    + ".ld-zeile{font-size:14px;margin:4px 0;word-break:break-word}"
    + ".ld-zeile a{color:#0A5CD0;font-weight:600}"
    + ".ld-notiz{white-space:pre-wrap;font-size:13px;color:var(--sub,#4A5F78);background:#F8FBFF;border-radius:10px;padding:8px 10px;margin:8px 0;max-height:120px;overflow:auto}"
    + ".ld-aktion{display:flex;flex-wrap:wrap;gap:8px;margin-top:8px}"
    + ".ld-leer{font-size:14px;color:var(--sub,#4A5F78);padding:6px 2px}"
    + ".ld-fehler{background:rgba(231,76,60,.12);color:#C0392B;border-radius:12px;padding:10px 14px;margin:8px 0;font-size:14px}"
    + ".ld-ok{background:rgba(31,155,84,.12);color:#157A3A;border-radius:12px;padding:10px 14px;margin:8px 0;font-size:14px}"
    + ".ld-dlg{border:none;border-radius:18px;padding:0;width:min(560px,calc(100vw - 16px));max-height:calc(100vh - 16px);box-shadow:0 12px 40px rgba(26,109,212,.25)}"
    + ".ld-dlg::backdrop{background:rgba(26,35,51,.45)}"
    + ".ld-dlgi{padding:16px 16px 14px;font-family:var(--font-body,'DM Sans',system-ui,sans-serif);color:var(--ink,#1A2333)}"
    + ".ld-dlgi h3{font-family:var(--font-heading,'Plus Jakarta Sans',system-ui,sans-serif);margin:0 0 10px;font-size:18px}"
    + ".ld-f{display:block;margin:0 0 10px;font-size:12px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:var(--sub,#4A5F78)}"
    + ".ld-f>*:not(span){margin-top:4px;text-transform:none;letter-spacing:0;font-weight:400}"
    + ".ld-radio{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin:0 0 10px}"
    + ".ld-radio label{display:flex;align-items:center;gap:8px;border:1px solid var(--border,#E0E8F0);border-radius:12px;padding:10px 12px;min-height:44px;font-size:14px;cursor:pointer;box-sizing:border-box}"
    + ".ld-radio input{width:18px;height:18px;accent-color:#007BFF;flex:none}"
    + ".ld-radio label.an{border-color:#007BFF;background:#EEF6FF}"
    + ".ld-check{display:flex;gap:8px;align-items:center;font-size:14px;margin:0 0 10px}"
    + ".ld-check input{width:18px;height:18px;accent-color:#007BFF}"
    + ".ld-vor{background:#F8FBFF;border:1px dashed #9CC3F5;border-radius:12px;padding:10px 12px;font-size:13px;margin:8px 0}"
    + ".ld-vor b{display:inline-block;min-width:84px}"
    + ".ld-toast{position:fixed;left:8px;right:8px;bottom:12px;z-index:9999;max-width:460px;margin:0 auto;background:#1A2333;color:#fff;border-radius:14px;padding:12px 16px;font-size:15px;box-shadow:0 12px 40px rgba(0,0,0,.3);cursor:pointer}"
    + "@media (max-width:420px){.ld-radio{grid-template-columns:1fr}.ld-knopf{width:100%}.ld-leise{width:auto}}";

  // ---------- Hilfen ----------
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function $(sel, el) { return (el || document).querySelector(sel); }
  function heuteBerlin() { return new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Berlin" }); }
  function ymdPlus(ymd, n) { var p = ymd.split("-").map(Number); return new Date(Date.UTC(p[0], p[1] - 1, p[2] + n)).toISOString().slice(0, 10); }
  function werktagePlus(ymd, n) {
    var t = ymd;
    for (var i = 0; i < n; i++) { do { t = ymdPlus(t, 1); var w = new Date(t + "T00:00:00Z").getUTCDay(); } while (w === 0 || w === 6); }
    return t;
  }
  function de(ymd) { return ymd ? ymd.split("-").reverse().join(".") : ""; }
  function css() {
    if (document.getElementById("ld-css")) return;
    var s = document.createElement("style"); s.id = "ld-css"; s.textContent = CSS; document.head.appendChild(s);
  }

  async function api(aktion, body) {
    var s = await DB.auth.getSession();
    var tok = s && s.data && s.data.session && s.data.session.access_token;
    if (!tok) throw new Error("Nicht angemeldet");
    var r = await fetch(CFG.url + "/functions/v1/leads_api", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + tok, apikey: CFG.key },
      body: JSON.stringify(Object.assign({ aktion: aktion }, body || {}))
    });
    var j = await r.json().catch(function () { return {}; });
    if (!r.ok) { var e = new Error(j.fehler || ("Fehler " + r.status)); e.status = r.status; throw e; }
    return j;
  }

  // ---------- Ton und Popup ----------
  function ton() {
    try {
      var AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
      var c = new AC(), o = c.createOscillator(), g = c.createGain();
      o.type = "sine"; o.frequency.value = 880; g.gain.value = 0.15;
      o.connect(g); g.connect(c.destination); o.start();
      g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + 0.5); o.stop(c.currentTime + 0.5);
    } catch (e) { /* kein Ton möglich */ }
  }
  function toast(text, id) {
    var t = document.createElement("div"); t.className = "ld-toast"; t.textContent = text;
    t.onclick = function () { t.remove(); openLeadTab(id); };
    document.body.appendChild(t); ton();
    setTimeout(function () { if (t.parentNode) t.remove(); }, 15000);
  }
  function openLeadTab(id) {
    OFFEN_ID = id || null;
    if (typeof window.showTab === "function") window.showTab("leads");
  }

  // ---------- Daten laden ----------
  async function laden(still) {
    try {
      var d = await api("faellig");
      var neuAlt = BEKANNT;
      LISTE = d;
      var ids = {};
      d.neu_ohne_verkaeufer.forEach(function (z) { ids[z.id] = z; });
      if (neuAlt) {
        Object.keys(ids).forEach(function (k) {
          if (!neuAlt[k]) toast("Neue Anfrage: " + [ids[k].hersteller, ids[k].modell, ids[k].fahrzeugnr].filter(Boolean).join(" "), k);
        });
      }
      BEKANNT = ids;
      if (ROOT && ROOT.offsetParent !== null && !document.querySelector("dialog[open].ld-dlg")) zeichnen();
    } catch (e) {
      if (ROOT && !still) ROOT.innerHTML = '<div class="ld-fehler">' + esc(e.message) + "</div>";
    }
  }

  // ---------- Darstellung ----------
  function karte(z, hell) {
    var fzg = [z.hersteller, z.modell].filter(Boolean).join(" ") || "Fahrzeug unbekannt";
    var fzgHtml = z.fahrzeugnr
      ? '<a href="https://www.autohaus-stieber.de/details.php?fahrzeug=' + encodeURIComponent(z.fahrzeugnr) + '" target="_blank" rel="noopener">' + esc(fzg) + " · " + esc(z.fahrzeugnr) + "</a>"
      : esc(fzg);
    var heute = heuteBerlin();
    var tage = z.wiedervorlage ? Math.round((new Date(heute) - new Date(z.wiedervorlage)) / 86400000) : 0;
    var wv = z.wiedervorlage ? '<span class="ld-chip ' + (tage > 2 ? "rot" : "") + '">Wiedervorlage ' + de(z.wiedervorlage) + (tage > 0 ? " (" + tage + " T überfällig)" : "") + "</span>" : "";
    var tel = z.telefon ? '<div class="ld-zeile">&#9742; <a href="tel:' + esc(z.telefon.replace(/[^\d+]/g, "")) + '">' + esc(z.telefon) + "</a></div>" : "";
    var mail = z.email ? '<div class="ld-zeile">&#9993; <a href="mailto:' + esc(z.email) + '">' + esc(z.email) + "</a></div>" : "";
    return '<div class="ld-karte' + (hell ? " ld-hell" : "") + '" data-id="' + esc(z.id) + '">'
      + '<div class="ld-kopf"><div class="ld-name">' + esc([z.vorname, z.name].filter(Boolean).join(" ") || "(ohne Name)") + "</div><div>"
      + (z.verkaeufer ? '<span class="ld-chip">' + esc(z.verkaeufer) + "</span>" : '<span class="ld-chip rot">nicht zugeteilt</span>')
      + '<span class="ld-chip">' + esc(z.status) + "</span></div></div>"
      + '<div class="ld-zeile">' + fzgHtml + "</div>"
      + '<div class="ld-zeile"><span class="ld-chip">' + esc(z.herkunft) + " · " + esc(z.ueber) + "</span>" + wv
      + (z.anfrage ? '<span class="ld-chip">Anfrage ' + de(z.anfrage) + "</span>" : "") + "</div>"
      + tel + mail
      + (z.notiz ? '<div class="ld-notiz">' + esc(z.notiz) + "</div>" : "")
      + '<div class="ld-aktion"><button class="ld-knopf" data-akt="kontakt">Kontakt erfassen</button>'
      + '<button class="ld-knopf ld-leise" data-akt="entwurf">Nachfass-Entwurf</button></div></div>';
  }

  function zeichnen() {
    if (!ROOT) return;
    var h = [];
    if (ME && ME.testmodus) h.push('<div class="ld-test">Testmodus &ndash; nichts wird gespeichert. Kontakt und Neuanlage zeigen nur eine Vorschau.</div>');
    h.push('<div class="ld-leiste"><button class="ld-knopf" data-akt="neu">+ Neue Anfrage</button>'
      + '<button class="ld-knopf ld-leise" data-akt="reload">Aktualisieren</button>'
      + '<button class="ld-knopf ld-leise" data-akt="push">Benachrichtigungen einschalten</button></div>');
    h.push('<div id="ld-push-info"></div>');
    var verk = (ME && ME.auswahl && ME.auswahl.field_2) || [];
    h.push('<label class="ld-f"><span>Verkäufer</span><select id="ld-filter"><option value="">Alle</option>'
      + verk.map(function (v) { return '<option value="' + esc(v) + '"' + (FILTER === v ? " selected" : "") + ">" + esc(v) + "</option>"; }).join("")
      + '<option value="-"' + (FILTER === "-" ? " selected" : "") + ">nicht zugeteilt</option></select></label>");
    if (!LISTE) { h.push('<div class="ld-leer">Lade &hellip;</div>'); ROOT.innerHTML = '<div class="ld">' + h.join("") + "</div>"; verdrahten(); return; }

    var neu = LISTE.neu_ohne_verkaeufer;
    h.push('<div class="ld-h">Neu, nicht zugeteilt <span class="ld-zahl">' + neu.length + "</span></div>");
    h.push(neu.length ? neu.map(function (z) { return karte(z, z.id === OFFEN_ID); }).join("") : '<div class="ld-leer">Keine neuen Anfragen ohne Verkäufer.</div>');

    var heute = heuteBerlin(), grenzeAlt = ymdPlus(heute, -30);
    var f = LISTE.faellig.filter(function (z) { return !FILTER ? true : FILTER === "-" ? !z.verkaeufer : z.verkaeufer === FILTER; });
    var aktuell = f.filter(function (z) { return z.wiedervorlage >= grenzeAlt; });
    var alt = f.filter(function (z) { return z.wiedervorlage < grenzeAlt; });
    h.push('<div class="ld-h">Fällig heute / überfällig <span class="ld-zahl">' + aktuell.length + "</span></div>");
    h.push(aktuell.length ? aktuell.map(function (z) { return karte(z, z.id === OFFEN_ID); }).join("") : '<div class="ld-leer">Nichts fällig.</div>');
    if (alt.length) {
      h.push('<details><summary class="ld-h" style="cursor:pointer">Älter als 30 Tage <span class="ld-zahl">' + alt.length + "</span></summary>"
        + alt.map(function (z) { return karte(z, z.id === OFFEN_ID); }).join("") + "</details>");
    }
    ROOT.innerHTML = '<div class="ld">' + h.join("") + "</div>";
    verdrahten();
    pushInfo();
    if (OFFEN_ID) {
      var k = ROOT.querySelector('.ld-karte[data-id="' + OFFEN_ID + '"]');
      if (k) { var det = k.closest("details"); if (det) det.open = true; k.scrollIntoView({ block: "center" }); }
      else { ladeEinzelnen(OFFEN_ID); }
      OFFEN_ID = null;
    }
  }

  async function ladeEinzelnen(id) {
    try {
      var r = await api("lead", { id: id });
      var div = document.createElement("div");
      div.innerHTML = karte(r.lead, true);
      var anker = ROOT.querySelector(".ld");
      var h = document.createElement("div"); h.className = "ld-h"; h.textContent = "Geöffnete Anfrage";
      anker.insertBefore(div.firstChild, anker.firstChild.nextSibling);
      anker.insertBefore(h, anker.firstChild.nextSibling);
      verdrahten();
    } catch (e) { /* Lead nicht gefunden: kein Eintrag */ }
  }

  function verdrahten() {
    var fi = $("#ld-filter", ROOT);
    if (fi) fi.onchange = function () { FILTER = fi.value || null; zeichnen(); };
    ROOT.querySelectorAll("[data-akt]").forEach(function (b) {
      b.onclick = function () {
        var akt = b.getAttribute("data-akt");
        var kk = b.closest(".ld-karte"); var id = kk && kk.getAttribute("data-id");
        if (akt === "reload") laden(false);
        else if (akt === "neu") dlgNeu();
        else if (akt === "push") pushEinschalten();
        else if (akt === "kontakt") dlgKontakt(findeLead(id));
        else if (akt === "entwurf") dlgEntwurf(findeLead(id));
      };
    });
  }
  function findeLead(id) {
    var alle = (LISTE ? LISTE.faellig.concat(LISTE.neu_ohne_verkaeufer) : []);
    for (var i = 0; i < alle.length; i++) if (alle[i].id === id) return alle[i];
    return { id: id, name: "", vorname: "", status: "", verkaeufer: "" };
  }

  // ---------- Dialoge ----------
  function dialog(html) {
    var d = document.createElement("dialog"); d.className = "ld-dlg ld";
    d.innerHTML = '<div class="ld-dlgi">' + html + "</div>";
    document.body.appendChild(d);
    d.addEventListener("close", function () { d.remove(); });
    if (d.showModal) d.showModal(); else d.setAttribute("open", "");
    d.querySelectorAll("[data-zu]").forEach(function (b) { b.onclick = function () { d.close ? d.close() : d.remove(); }; });
    return d;
  }
  var FELDNAME = { Title: "Nachname", field_1: "Vorname", field_2: "Verkäufer", field_3: "Status", field_4: "Herkunft", field_5: "über", field_6: "E-Mail", field_7: "Telefon", field_8: "Hersteller", field_9: "Modell", field_10: "Typ", field_11: "Angebots-Nr.", field_15: "Kontaktstatus", field_19: "Grund nicht gekauft", Anfragedatum: "Anfrage Datum", N_x00e4_chsteWiedervorlage: "Nächste Wiedervorlage" };
  function vorschauHtml(r) {
    var v = r.vorschau; if (!v) return "";
    var zeilen = Object.keys(v.felder).map(function (k) {
      var w = v.felder[k];
      if (k === "N_x00e4_chsteWiedervorlage" || k === "Anfragedatum") w = de(new Date(w).toLocaleDateString("sv-SE", { timeZone: "Europe/Berlin" }));
      return '<div><b>' + esc(FELDNAME[k] || k) + "</b> " + esc(w).replace(/\n/g, "<br>") + "</div>";
    }).join("");
    return '<div class="ld-ok">Testmodus &ndash; nichts wurde gespeichert. So würde die Liste ' + (v.methode === "POST" ? "einen neuen Eintrag bekommen" : "geändert") + ":</div>"
      + '<div class="ld-vor">' + zeilen + "</div>";
  }

  function dlgKontakt(z) {
    var heute = heuteBerlin();
    var grund = ((ME.auswahl && ME.auswahl.field_19) || []);
    var d = dialog('<h3>Kontakt erfassen</h3>'
      + '<div style="font-size:14px;margin:0 0 10px">' + esc([z.vorname, z.name].filter(Boolean).join(" ")) + " · " + esc(z.status) + "</div>"
      + '<div class="ld-radio" id="k-erg">'
      + '<label><input type="radio" name="erg" value="erreicht" checked> Erreicht</label>'
      + '<label><input type="radio" name="erg" value="termin"> Termin vereinbart</label>'
      + '<label><input type="radio" name="erg" value="nicht_erreicht"> Nicht erreicht</label>'
      + '<label><input type="radio" name="erg" value="kein_interesse"> Kein Interesse</label></div>'
      + '<label class="ld-f" id="k-termin-f" style="display:none"><span>Termin (Datum und Uhrzeit)</span><input type="text" id="k-termin" placeholder="z. B. Do 29.10., 14 Uhr"></label>'
      + '<label class="ld-f" id="k-grund-f" style="display:none"><span>Grund nicht gekauft</span><select id="k-grund"><option value="">bitte wählen</option>'
      + grund.map(function (g) { return "<option>" + esc(g) + "</option>"; }).join("") + "</select></label>"
      + '<label class="ld-f"><span>Notiz</span><textarea id="k-notiz" placeholder="Was wurde besprochen?"></textarea></label>'
      + '<label class="ld-f" id="k-wv-f"><span>Nächste Wiedervorlage</span><input type="date" id="k-wv" min="' + heute + '" value="' + werktagePlus(heute, 2) + '"></label>'
      + (ME.kuerzel ? '<label class="ld-check"><input type="checkbox" id="k-uebern"' + (!z.verkaeufer ? " checked" : "") + '> Lead übernehmen (Verkäufer = ' + esc(ME.kuerzel) + ")</label>"
        : '<div class="ld-zeile" style="color:#4A5F78">Für dein Konto ist noch kein Kürzel hinterlegt &ndash; „übernehmen“ ist deaktiviert.</div>')
      + '<div id="k-meld"></div>'
      + '<div class="ld-aktion"><button class="ld-knopf" id="k-ok">Speichern</button><button class="ld-knopf ld-leise" data-zu>Abbrechen</button></div>');
    var wvManuell = false;
    function umschalten() {
      var e = $('input[name=erg]:checked', d).value;
      d.querySelectorAll("#k-erg label").forEach(function (l) { l.classList.toggle("an", l.firstChild.checked); });
      $("#k-termin-f", d).style.display = e === "termin" ? "" : "none";
      $("#k-grund-f", d).style.display = e === "kein_interesse" ? "" : "none";
      $("#k-wv-f", d).style.display = e === "kein_interesse" ? "none" : "";
      if (!wvManuell) $("#k-wv", d).value = werktagePlus(heute, e === "nicht_erreicht" ? 1 : 2);
    }
    d.querySelectorAll("input[name=erg]").forEach(function (i) { i.onchange = umschalten; });
    $("#k-wv", d).onchange = function () { wvManuell = true; };
    umschalten();
    $("#k-ok", d).onclick = async function () {
      var btn = this, meld = $("#k-meld", d), e = $('input[name=erg]:checked', d).value;
      meld.innerHTML = "";
      btn.disabled = true;
      try {
        var r = await api("kontakt", {
          id: z.id, ergebnis: e, notiz: $("#k-notiz", d).value, termin: $("#k-termin", d).value,
          grund: $("#k-grund", d).value, wiedervorlage: e === "kein_interesse" ? "" : $("#k-wv", d).value,
          uebernehmen: !!($("#k-uebern", d) && $("#k-uebern", d).checked)
        });
        if (r.trocken) { meld.innerHTML = vorschauHtml(r); btn.textContent = "Fertig"; btn.disabled = false; btn.onclick = function () { d.close(); }; }
        else { d.close(); laden(false); }
      } catch (err) { meld.innerHTML = '<div class="ld-fehler">' + esc(err.message) + "</div>"; btn.disabled = false; }
    };
  }

  function dlgNeu() {
    var A = ME.auswahl || {};
    var opt = function (l, sel) { return (l || []).map(function (v) { return "<option" + (v === sel ? " selected" : "") + ">" + esc(v) + "</option>"; }).join(""); };
    var d = dialog('<h3>Neue Anfrage erfassen</h3>'
      + '<label class="ld-f"><span>Nachname *</span><input type="text" id="n-name" autocomplete="off"></label>'
      + '<label class="ld-f"><span>Vorname</span><input type="text" id="n-vor" autocomplete="off"></label>'
      + '<label class="ld-f"><span>Telefon</span><input type="tel" id="n-tel" autocomplete="off"></label>'
      + '<label class="ld-f"><span>E-Mail</span><input type="email" id="n-mail" autocomplete="off"></label>'
      + '<label class="ld-f"><span>Fahrzeug-Nr. (6-stellig)</span><input type="text" id="n-nr" inputmode="numeric" autocomplete="off"></label>'
      + '<label class="ld-f"><span>Herkunft</span><select id="n-herk">' + opt(A.field_4, "Showroom") + "</select></label>"
      + '<label class="ld-f"><span>Über</span><select id="n-ueber">' + opt(A.field_5, "Telefon") + "</select></label>"
      + '<label class="ld-f"><span>Notiz</span><textarea id="n-notiz"></textarea></label>'
      + '<div id="n-meld"></div>'
      + '<div class="ld-aktion"><button class="ld-knopf" id="n-ok">Anlegen</button><button class="ld-knopf ld-leise" data-zu>Abbrechen</button></div>');
    $("#n-ok", d).onclick = async function () {
      var btn = this, meld = $("#n-meld", d);
      meld.innerHTML = ""; btn.disabled = true;
      try {
        var r = await api("neu", {
          name: $("#n-name", d).value, vorname: $("#n-vor", d).value, telefon: $("#n-tel", d).value, email: $("#n-mail", d).value,
          fahrzeugnr: $("#n-nr", d).value, herkunft: $("#n-herk", d).value, ueber: $("#n-ueber", d).value, notiz: $("#n-notiz", d).value
        });
        var zus = (r.dublette ? '<div class="ld-ok">Dublette: gleiche Fahrzeug-Nr. und E-Mail in den letzten 30 Tagen &ndash; die Notiz wird im vorhandenen Eintrag ergänzt, es entsteht kein neuer.</div>' : "")
          + (r.weitere_zum_fahrzeug ? '<div class="ld-zeile">Hinweis: ' + r.weitere_zum_fahrzeug + " weitere Anfrage(n) zu diesem Fahrzeug in den letzten 30 Tagen.</div>" : "")
          + (r.hinweis === "fahrzeug_nicht_in_masterliste" ? '<div class="ld-zeile">Fahrzeug-Nr. nicht in der Masterliste gefunden &ndash; Hersteller und Modell bleiben leer.</div>' : "");
        if (r.trocken) { meld.innerHTML = zus + vorschauHtml(r); btn.textContent = "Fertig"; btn.disabled = false; btn.onclick = function () { d.close(); }; }
        else { d.close(); laden(false); }
      } catch (err) { meld.innerHTML = '<div class="ld-fehler">' + esc(err.message) + "</div>"; btn.disabled = false; }
    };
  }

  async function dlgEntwurf(z, trotzdem) {
    var d = dialog('<h3>Nachfass-Entwurf</h3><div id="e-inhalt" class="ld-leer">Entwurf wird erstellt &hellip;</div>'
      + '<div class="ld-aktion"><button class="ld-knopf ld-leise" data-zu>Schließen</button></div>');
    var box = $("#e-inhalt", d);
    try {
      var r = await api("entwurf", { id: z.id, trotzdem: !!trotzdem });
      if (r.nachfass_bereits && !r.whatsapp) {
        box.innerHTML = '<div class="ld-fehler">' + esc(r.hinweis) + '</div><button class="ld-knopf ld-leise" id="e-trotz">Trotzdem Entwurf zeigen</button>';
        $("#e-trotz", d).onclick = function () { d.close(); dlgEntwurf(z, true); };
        return;
      }
      box.className = "";
      box.innerHTML = (r.hinweise || []).map(function (h) { return '<div class="ld-fehler">' + esc(h) + "</div>"; }).join("")
        + '<div class="ld-zeile" style="color:#4A5F78">Es wird nichts automatisch gesendet. Du prüfst den Text und sendest selbst.</div>'
        + '<label class="ld-f"><span>WhatsApp</span><textarea id="e-wa" style="min-height:160px"></textarea></label>'
        + '<div class="ld-aktion"><a class="ld-knopf" id="e-wa-link" target="_blank" rel="noopener" style="text-decoration:none;display:inline-flex;align-items:center">In WhatsApp öffnen</a></div>'
        + (r.whatsapp.nummer ? "" : '<div class="ld-zeile" style="color:#C0392B">Keine gültige Handynummer hinterlegt &ndash; WhatsApp-Link ohne Empfänger.</div>')
        + '<label class="ld-f" style="margin-top:14px"><span>E-Mail an ' + esc(r.email.an || "(keine Adresse)") + "</span>"
        + '<input type="text" id="e-betr" style="margin-bottom:8px"><textarea id="e-mail" style="min-height:200px"></textarea></label>'
        + '<div class="ld-aktion"><a class="ld-knopf" id="e-mail-link" style="text-decoration:none;display:inline-flex;align-items:center">Mail-Entwurf öffnen</a></div>';
      $("#e-wa", d).value = r.whatsapp.text; $("#e-betr", d).value = r.email.betreff; $("#e-mail", d).value = r.email.text;
      function links() {
        $("#e-wa-link", d).href = "https://wa.me/" + (r.whatsapp.nummer || "") + "?text=" + encodeURIComponent($("#e-wa", d).value);
        $("#e-mail-link", d).href = "mailto:" + encodeURIComponent(r.email.an || "") + "?subject=" + encodeURIComponent($("#e-betr", d).value) + "&body=" + encodeURIComponent($("#e-mail", d).value);
      }
      ["#e-wa", "#e-betr", "#e-mail"].forEach(function (s) { $(s, d).oninput = links; });
      links();
    } catch (err) { box.className = ""; box.innerHTML = '<div class="ld-fehler">' + esc(err.message) + "</div>"; }
  }

  // ---------- Push ----------
  function b64uZuBytes(s) {
    var p = (s + "=".repeat((4 - (s.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
    var raw = atob(p), out = new Uint8Array(raw.length);
    for (var i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
    return out;
  }
  function istIos() { return /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1); }
  function istInstalliert() { return (window.matchMedia && matchMedia("(display-mode: standalone)").matches) || navigator.standalone === true; }
  function pushInfo(text, fehler) {
    var el = $("#ld-push-info", ROOT); if (!el) return;
    if (text) { el.innerHTML = '<div class="' + (fehler ? "ld-fehler" : "ld-ok") + '">' + text + "</div>"; return; }
    var teile = [];
    if (ME && ME.push_abos > 0) teile.push('<div class="ld-ok">Benachrichtigungen sind auf diesem Konto eingeschaltet (' + ME.push_abos + ' Gerät/e). <a href="#" id="ld-ptest">Testnachricht senden</a></div>');
    else if (istIos() && !istInstalliert()) teile.push('<div class="ld-zeile">iPhone: Zuerst unten auf „Teilen“ tippen &rarr; „Zum Home-Bildschirm“, dann das Dashboard von dort öffnen und die Benachrichtigungen einschalten.</div>');
    el.innerHTML = teile.join("");
    var t = $("#ld-ptest", el);
    if (t) t.onclick = async function (ev) { ev.preventDefault(); try { var r = await api("push_test"); pushInfo(r.gesendet ? "Testnachricht ist unterwegs." : "Kein Gerät erreicht" + (r.hinweis ? " (" + esc(r.hinweis) + ")" : "") + ".", !r.gesendet); } catch (e) { pushInfo(esc(e.message), true); } };
  }
  async function pushEinschalten() {
    try {
      if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
        pushInfo(istIos() ? "Auf dem iPhone geht das nur mit dem Dashboard auf dem Home-Bildschirm (Teilen &rarr; „Zum Home-Bildschirm“)." : "Dieser Browser unterstützt keine Benachrichtigungen.", true); return;
      }
      if (istIos() && !istInstalliert()) { pushInfo("Auf dem iPhone zuerst „Teilen“ &rarr; „Zum Home-Bildschirm“, dann von dort öffnen.", true); return; }
      var pub = ME.vapid_public;
      if (!pub && ME.rolle === "admin") { var vi = await api("vapid_init"); pub = vi.pub; ME.vapid_public = pub; }
      if (!pub) { pushInfo("Die Benachrichtigung ist serverseitig noch nicht eingerichtet (Admin muss einmal starten).", true); return; }
      var perm = await Notification.requestPermission();
      if (perm !== "granted") { pushInfo("Benachrichtigungen wurden im Browser nicht erlaubt.", true); return; }
      var reg = await navigator.serviceWorker.ready;
      var sub = await reg.pushManager.getSubscription();
      if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64uZuBytes(pub) });
      var j = sub.toJSON();
      await api("push_abo", { endpoint: j.endpoint, p256dh: j.keys.p256dh, auth: j.keys.auth });
      ME.push_abos = Math.max(1, ME.push_abos || 0);
      pushInfo("Benachrichtigungen sind eingeschaltet. Mit „Testnachricht senden“ prüfst du das.");
      pushInfo();
    } catch (e) { pushInfo(esc(e.message || e), true); }
  }

  // ---------- Öffentliche Schnittstelle ----------
  function hashPruefen(h) {
    var m = /^#leads(?:&id=(\d+))?/.exec(h || "");
    if (!m) return false;
    OFFEN_ID = m[1] || null;
    return true;
  }

  async function boot(db, cfg) {
    if (BOOTED) return;
    BOOTED = true; DB = db; CFG = cfg; css();
    try {
      if ("serviceWorker" in navigator) {
        navigator.serviceWorker.register("sw.js").catch(function () {});
        navigator.serviceWorker.addEventListener("message", function (ev) {
          var d = ev.data || {};
          if (d.typ === "lead-neu") { toast(d.text || "Neue Anfrage"); }
          if (d.typ === "lead-oeffnen") { var m = /id=(\d+)/.exec(d.url || ""); openLeadTab(m ? m[1] : null); laden(false); }
        });
      }
      ME = await api("me");
    } catch (e) { BOOTED = false; return; } // 401/403: Reiter bleibt verborgen
    var tab = document.getElementById("tab-leads"); if (tab) tab.style.display = "";
    await laden(true);
    TIMER = setInterval(function () { if (document.visibilityState === "visible") laden(true); }, 60000);
    if (hashPruefen(location.hash)) openLeadTab(OFFEN_ID);
  }

  function show(container) {
    css(); ROOT = container;
    if (!ME) { container.innerHTML = '<div class="ld-fehler">Kein Zugriff auf die Leads.</div>'; return; }
    zeichnen();
    laden(false);
  }

  window.LEADS = { boot: boot, show: show };
})();
