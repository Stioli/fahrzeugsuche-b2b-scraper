/* Sofort suchen 1.15 (14.10.2026) – Einzelsuche für Kunden direkt aus ankauf.angebote, ohne Scraper-Lauf.
   Eine Datei für Ankauf-Dashboard UND Cockpit-Modul (gleicher Inhalt, zwei Kopien):
     SOFORT.init(container, supabaseClient)   supabaseClient mit db.schema = "ankauf" und angemeldetem Konto
   Daten: db.rpc("sofort_suchen_v2") – Rollenprüfung (admin/verkauf) und RLS macht die Datenbank. Nur lesend.
   Neu in 1.15 (Funktion v2 statt v1):
     - Je Merkmal ein Dreiwege-Schalter: egal · Plus (nice to have) · Pflicht (p_pflicht / p_plus)
     - Neue Felder: PS von/bis, Farbe, Verfügbarkeit (sofort/kurzfristig/Vorlauf), Quellen ausschließen
     - „Nur passende (Gruppe C ausblenden)“ ersetzt „sicheres Nein ausblenden“
     - Ergebnis in Gruppen: A alle Pflicht erfüllt · B Pflicht teils unbekannt (?) · C Pflicht fehlt; Rang aus der Datenbank
     - Merkmalsspalten nur für gewählte Pflicht/Plus-Merkmale (Pflicht zuerst, mit ★)
     - Export: „Als HTML speichern“ und „CSV“ (Semikolon, UTF-8 mit BOM) – nur aus den geladenen Daten
     - Letzte Eingaben werden im Browser gemerkt (localStorage, nur Formularwerte), Knopf „Zurücksetzen“
   Ausstattung dreiwertig: ✔ ja · ✘ nein · ? unbekannt (Lieferant nennt nichts).
   Enthält keine Schlüssel und keine Geschäftszahlen. */
(function(){
  "use strict";
  // Reihenfolge = Anzeige. index.html liest SOFORT.AUSSTATTUNG ([kurz, Name]).
  var AUSST = [["pano","Panoramadach"],["hud","Head-up-Display"],["heckklappe","el. Heckklappe"],["acc","Abstandstempomat (ACC)"],
    ["sitzheizung","Sitzheizung"],["sitzlueftung","Sitzlüftung"],["lenkradheizung","Lenkradheizung"],["navi","Navi"],
    ["rfk","Rückfahrkamera"],["k360","360°-Kamera"],["ahk","AHK"],["leder","Leder"],["led","LED/Matrix"],["keyless","Keyless"],
    ["carplay","CarPlay/Android Auto"],["allrad","Allrad"],["sound","Soundsystem"],["standheizung","Standheizung"],
    ["totwinkel","Totwinkel-/Spurhalteassistent"]];
  var QUELLEN = ["ELN","Tabor","Carconnex","Imexso","Autoropa","Outlook-Mail","Audesk","Hellwig+Foelster","Spoticar","Staiger","ALM","Autrado","RDB"];
  var VERF = [["sofort","sofort"],["kurzfristig","kurzfristig"],["vorlauf","Vorlauf / Bestellung"]];
  var KRAFT = ["","Benzin","Diesel","Hybrid","Mild-Hybrid","Plug-in-Hybrid","Elektro"];
  var SPEICHER = "sofort-suche-v115";
  var CSS = ""
    + ".sf{font-family:var(--font-body,'DM Sans',system-ui,sans-serif);color:var(--ink,#1A2333)}"
    + ".sf-raster{display:grid;grid-template-columns:repeat(auto-fill,minmax(170px,1fr));gap:10px 12px;margin-bottom:12px}"
    + ".sf label.sf-f{display:flex;flex-direction:column;gap:4px;font-size:12px;font-weight:600;letter-spacing:.04em;text-transform:uppercase;color:var(--sub,#4A5F78)}"
    + ".sf input[type=text],.sf input[type=number],.sf select{font:inherit;font-size:15px;text-transform:none;letter-spacing:0;font-weight:400;color:var(--ink,#1A2333);background:#fff;border:1px solid var(--border,#E0E8F0);border-radius:12px;padding:10px 12px;min-height:44px;width:100%}"
    + ".sf input:focus,.sf select:focus{outline:2px solid rgba(0,123,255,.35);border-color:#007BFF}"
    + ".sf-frei{grid-column:1/-1}"
    + ".sf-checks{display:flex;flex-wrap:wrap;gap:6px 16px;margin:4px 0 12px}"
    + ".sf-checks label{display:inline-flex;gap:6px;align-items:center;font-size:14px;cursor:pointer}"
    + ".sf-checks input{width:18px;height:18px;accent-color:#007BFF}"
    + ".sf-block{border:1px solid var(--border,#E0E8F0);border-radius:14px;padding:10px 14px;margin:0 0 12px;min-width:0}"
    + ".sf-block legend{font-size:12px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:var(--sub,#4A5F78);padding:0 6px}"
    + ".sf-merk{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:6px 18px}"
    + ".sf-m{display:flex;align-items:center;justify-content:space-between;gap:8px;font-size:14px;border:0;margin:0;padding:0;min-width:0}"
    + ".sf-m legend{padding:0;float:left;font-size:14px;font-weight:400;text-transform:none;letter-spacing:0;color:var(--ink,#1A2333)}"
    + ".sf-seg{display:inline-flex;border:1px solid var(--border,#E0E8F0);border-radius:10px;overflow:hidden;flex:none}"
    + ".sf-seg label{position:relative;display:block;cursor:pointer}"
    + ".sf-seg input{position:absolute;opacity:0;inset:0;width:100%;height:100%;margin:0;cursor:pointer}"
    + ".sf-seg span{display:block;padding:6px 10px;font-size:13px;font-weight:600;color:var(--sub,#4A5F78);background:#fff;min-width:48px;text-align:center}"
    + ".sf-seg label+label span{border-left:1px solid var(--border,#E0E8F0)}"
    + ".sf-seg input:checked+span{background:#EEF3FA;color:#1A2333}"
    + ".sf-seg input[value=plus]:checked+span{background:#fff;color:#0A5CD0;box-shadow:inset 0 0 0 2px #007BFF}"
    + ".sf-seg input[value=pflicht]:checked+span{background:#007BFF;color:#fff}"
    + ".sf-seg input:focus-visible+span{outline:2px solid #0A5CD0;outline-offset:-2px}"
    + ".sf-zeile{display:flex;flex-wrap:wrap;gap:10px;align-items:center;margin-bottom:10px}"
    + ".sf-knopf{font-family:var(--font-heading,'Plus Jakarta Sans',system-ui,sans-serif);font-weight:700;font-size:16px;border:none;border-radius:14px;padding:12px 22px;min-height:46px;cursor:pointer;background:#007BFF;color:#fff}"
    + ".sf-knopf:hover{background:#0A5CD0}.sf-knopf:disabled{background:#8E9FB4;cursor:default}"
    + ".sf-leise{background:#fff;color:#0A5CD0;border:1px solid var(--border,#E0E8F0);font-size:14px;padding:8px 14px;min-height:0}"
    + ".sf-leise:hover{background:#EEF3FA}.sf-leise:disabled{background:#fff;color:#8E9FB4}"
    + ".sf-info{font-size:14px;color:var(--sub,#4A5F78);margin:8px 0}"
    + ".sf-fehler{background:rgba(231,76,60,.12);color:#C0392B;border-radius:12px;padding:10px 14px;margin:8px 0;font-size:15px}"
    + ".sf-tabwrap{overflow-x:auto;border:1px solid var(--border,#E0E8F0);border-radius:14px;background:#fff}"
    + ".sf table{border-collapse:collapse;width:100%;font-size:14px}"
    + ".sf th{background:#EEF3FA;color:var(--sub,#4A5F78);text-align:left;font-size:12px;font-weight:700;padding:8px;white-space:nowrap;position:sticky;top:0}"
    + ".sf td{padding:7px 8px;border-top:1px solid var(--border,#E0E8F0);vertical-align:top}"
    + ".sf td.r,.sf th.r{text-align:right;white-space:nowrap}"
    + ".sf .sf-klein{font-size:12px;color:var(--light,#6B7C93)}"
    + ".sf .a1{color:#157A3A;font-weight:700}.sf .a0{color:#C1121A;font-weight:700}.sf .an{color:#6B7C93}"
    + ".sf .sf-alt{color:#B88A00}"
    + ".sf .gA,.sf .gB,.sf .gC{display:inline-block;min-width:24px;text-align:center;border-radius:8px;padding:2px 8px;font-weight:700;font-size:13px}"
    + ".sf .gA{background:rgba(21,122,58,.14);color:#157A3A}.sf .gB{background:rgba(245,176,0,.2);color:#8A6500}.sf .gC{background:#E6EAF0;color:#5B6B80}"
    + "@media (max-width:600px){.sf-raster{grid-template-columns:1fr 1fr}.sf-merk{grid-template-columns:1fr}}";

  // Stil der exportierten HTML-Datei (eigenständig, Stieber-CI)
  var EXPORT_CSS = "body{font-family:'DM Sans',system-ui,sans-serif;color:#1A2333;background:#F5F8FC;margin:0;padding:24px}"
    + "h1{font-family:'Plus Jakarta Sans',system-ui,sans-serif;font-weight:800;font-size:26px;margin:0 0 4px}h1 em{font-style:normal;color:#007BFF}"
    + ".k{color:#4A5F78;font-size:14px;margin:4px 0}.k b{color:#1A2333}.w{overflow-x:auto;border:1px solid #E0E8F0;border-radius:16px;background:#fff;margin-top:14px}"
    + "table{border-collapse:collapse;width:100%;font-size:14px}th{background:#EEF3FA;color:#4A5F78;text-align:left;font-size:12px;font-weight:700;padding:8px;white-space:nowrap}"
    + "td{padding:7px 8px;border-top:1px solid #E0E8F0;vertical-align:top}.r{text-align:right;white-space:nowrap}.sf-klein{font-size:12px;color:#6B7C93}"
    + ".a1{color:#157A3A;font-weight:700}.a0{color:#C1121A;font-weight:700}.an{color:#6B7C93}.sf-alt{color:#B88A00}a{color:#0A5CD0}"
    + ".gA,.gB,.gC{display:inline-block;min-width:24px;text-align:center;border-radius:8px;padding:2px 8px;font-weight:700;font-size:13px}"
    + ".gA{background:rgba(21,122,58,.14);color:#157A3A}.gB{background:rgba(245,176,0,.2);color:#8A6500}.gC{background:#E6EAF0;color:#5B6B80}";

  function esc(s){ return String(s == null ? "" : s).replace(/[&<>"']/g, function(c){ return {"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c]; }); }
  function eur(n){ return n == null ? "–" : Math.round(Number(n)).toLocaleString("de-DE") + " €"; }
  function zahl(v){ var s = String(v == null ? "" : v).replace(/[.\s€]/g, "").split(",")[0]; if (s === "") return null; var n = parseInt(s, 10); return isNaN(n) ? null : n; }
  function ez(d){ if (!d) return "–"; var p = String(d).split("-"); return p.length >= 2 ? p[1] + "/" + p[0] : d; }
  function alter(h){ if (h == null) return "–"; if (h < 1) return "gerade"; if (h < 48) return "vor " + h + " Std."; return "vor " + Math.round(h / 24) + " Tagen"; }
  function sicherLink(u){ return /^https?:\/\//i.test(String(u || "")) ? String(u) : ""; }
  function name(k){ var n = AUSST.filter(function(a){ return a[0] === k; })[0]; return n ? n[1] : k; }
  function nachgetragen(x){ return /nachgetragen/i.test(String(x.ausstattung_norm_quelle || "")); }
  function stempel(){ var d = new Date(), z = function(n){ return (n < 10 ? "0" : "") + n; }; return d.getFullYear() + "-" + z(d.getMonth() + 1) + "-" + z(d.getDate()); }
  function laden(inhalt, dateiname, typ){
    var b = new Blob([inhalt], { type: typ }), u = URL.createObjectURL(b), a = document.createElement("a");
    a.href = u; a.download = dateiname; document.body.appendChild(a); a.click();
    setTimeout(function(){ document.body.removeChild(a); URL.revokeObjectURL(u); }, 500);
  }
  function csvZelle(v){
    if (v == null) return "";
    var s = String(v);
    if (/^[=+\-@\t\r]/.test(s) && isNaN(Number(s.replace(",", ".")))) s = "'" + s; // Formel-Einschleusung in Excel verhindern
    return /[;"\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }

  // Tabelle (für Bildschirm und Export identisch aufgebaut). cfg = { pflicht:[], plus:[] }
  function tabelleHtml(zeilen, cfg){
    var spalten = cfg.pflicht.concat(cfg.plus);
    var kopf = "<tr><th>Gr.</th><th class=\"r\">Rang</th><th>Quelle</th><th>Fahrzeug</th><th>EZ</th><th class=\"r\">km</th><th>Antrieb</th><th class=\"r\">EK netto</th><th class=\"r\">brutto</th>"
      + spalten.map(function(k){ var pf = cfg.pflicht.indexOf(k) >= 0; return '<th title="' + esc(name(k)) + (pf ? " (Pflicht)" : " (Plus)") + '">' + (pf ? "★ " : "") + esc(name(k)) + "</th>"; }).join("")
      + "<th>Abruf</th><th></th></tr>";
    var rumpf = zeilen.map(function(x){
      var l = sicherLink(x.original_link), aj = x.ausstattung || {}, g = /^[ABC]$/.test(x.gruppe) ? x.gruppe : "C";
      return "<tr>"
        + '<td><span class="g' + g + '" title="Gruppe ' + g + '">' + g + "</span></td>"
        + '<td class="r">' + (x.rang == null ? "–" : esc(x.rang)) + "</td>"
        + "<td>" + esc(x.quelle) + (x.anbieter ? '<div class="sf-klein">' + esc(x.anbieter) + "</div>" : "") + "</td>"
        + "<td><b>" + esc([x.hersteller, x.modell].filter(Boolean).join(" ")) + "</b>" + (x.linie ? " · " + esc(x.linie) : "")
        + (x.typ ? '<div class="sf-klein">' + esc(String(x.typ).slice(0, 90)) + "</div>" : "")
        + (x.farbe ? '<div class="sf-klein">' + esc(x.farbe) + "</div>" : "")
        + (nachgetragen(x) ? '<div class="sf-klein">Ausstattung nachgetragen</div>' : "") + "</td>"
        + "<td>" + ez(x.erstzulassung) + "</td>"
        + '<td class="r">' + (x.km_stand == null ? "–" : Number(x.km_stand).toLocaleString("de-DE")) + "</td>"
        + "<td>" + esc([x.kraftstoff, x.getriebe, x.ps ? x.ps + " PS" : ""].filter(Boolean).join(" · ")) + "</td>"
        + '<td class="r"><b>' + eur(x.preis_netto) + "</b></td>"
        + '<td class="r">' + eur(x.preis_brutto) + "</td>"
        + spalten.map(function(k){ var v = aj[k]; return v === 1 ? '<td class="a1" title="ja">✔</td>' : v === 0 ? '<td class="a0" title="nein">✘</td>' : '<td class="an" title="unbekannt">?</td>'; }).join("")
        + '<td class="sf-klein' + (x.alter_stunden > 72 ? " sf-alt" : "") + '">' + alter(x.alter_stunden) + (x.verfuegbarkeit ? "<br>" + esc(x.verfuegbarkeit) : "") + "</td>"
        + "<td>" + (l ? '<a href="' + esc(l) + '" target="_blank" rel="noopener noreferrer">öffnen</a>' : "") + "</td>"
        + "</tr>";
    }).join("");
    return "<table><thead>" + kopf + "</thead><tbody>" + rumpf + "</tbody></table>";
  }

  function init(root, client){
    if (!root || !client) return;
    if (!document.getElementById("sf-stil")){ var st = document.createElement("style"); st.id = "sf-stil"; st.textContent = CSS; document.head.appendChild(st); }
    var jahr = new Date().getFullYear();
    var rid = "sf" + Math.random().toString(36).slice(2, 7); // Namensraum für Radiogruppen
    function seg(k){
      var n = rid + "-" + k;
      return '<fieldset class="sf-m"><legend>' + esc(name(k)) + '</legend><span class="sf-seg">'
        + '<label><input type="radio" name="' + n + '" value="" data-m="' + k + '" checked><span>egal</span></label>'
        + '<label><input type="radio" name="' + n + '" value="plus" data-m="' + k + '"><span>Plus</span></label>'
        + '<label><input type="radio" name="' + n + '" value="pflicht" data-m="' + k + '"><span>Pflicht</span></label>'
        + "</span></fieldset>";
    }
    root.innerHTML = '<div class="sf">'
      + '<div class="sf-raster">'
      + '<label class="sf-f">Marke<input type="text" data-f="marke" placeholder="z. B. Hyundai" autocomplete="off"></label>'
      + '<label class="sf-f">Modell<input type="text" data-f="modell" placeholder="z. B. Tucson" autocomplete="off"></label>'
      + '<label class="sf-f">Linie<input type="text" data-f="linie" placeholder="z. B. N Line, Prime" autocomplete="off"></label>'
      + '<label class="sf-f">Kraftstoff<select data-f="kraftstoff">' + KRAFT.map(function(k){ return '<option value="' + k + '">' + (k || "egal") + "</option>"; }).join("") + "</select></label>"
      + '<label class="sf-f">Getriebe<select data-f="getriebe"><option value="">egal</option><option>Automatik</option><option value="Schalt">Schaltgetriebe</option></select></label>'
      + '<label class="sf-f">EZ ab (Jahr)<input type="number" data-f="ez" min="2000" max="' + (jahr + 1) + '" placeholder="z. B. ' + (jahr - 3) + '"></label>'
      + '<label class="sf-f">km höchstens<input type="text" inputmode="numeric" data-f="km" placeholder="z. B. 50000" autocomplete="off"></label>'
      + '<label class="sf-f">EK netto höchstens (€)<input type="text" inputmode="numeric" data-f="preis" placeholder="z. B. 25000" autocomplete="off"></label>'
      + '<label class="sf-f">PS von<input type="text" inputmode="numeric" data-f="psmin" placeholder="z. B. 130" autocomplete="off"></label>'
      + '<label class="sf-f">PS bis<input type="text" inputmode="numeric" data-f="psmax" placeholder="z. B. 200" autocomplete="off"></label>'
      + '<label class="sf-f">Farbe (Teiltext)<input type="text" data-f="farbe" placeholder="z. B. schwarz" autocomplete="off"></label>'
      + '<label class="sf-f sf-frei">Freitext (alle Wörter müssen vorkommen)<input type="text" data-f="frei" maxlength="120" placeholder="z. B. sportage black edition" autocomplete="off"></label>'
      + "</div>"
      + '<fieldset class="sf-block"><legend>Verfügbarkeit (leer = egal)</legend><div class="sf-checks" style="margin:0">'
      + VERF.map(function(v){ return '<label><input type="checkbox" data-verf="' + v[0] + '"> ' + esc(v[1]) + "</label>"; }).join("") + "</div></fieldset>"
      + '<fieldset class="sf-block"><legend>Merkmale: Pflicht = muss vorhanden sein · Plus = gern, sortiert nach oben</legend><div class="sf-merk">'
      + AUSST.map(function(a){ return seg(a[0]); }).join("") + "</div></fieldset>"
      + '<fieldset class="sf-block"><legend>Quellen ausschließen (angehakt = nicht durchsuchen)</legend><div class="sf-checks" style="margin:0">'
      + QUELLEN.map(function(q){ return '<label><input type="checkbox" data-qaus="' + esc(q) + '"> ' + esc(q) + "</label>"; }).join("") + "</div></fieldset>"
      + '<div class="sf-zeile">'
      + '<button class="sf-knopf" data-act="suchen">&#128269; Sofort suchen</button>'
      + '<span class="sf-checks" style="margin:0"><label><input type="checkbox" data-f="nurpassend"> Nur passende (Gruppe C ausblenden)</label></span>'
      + '<button class="sf-knopf sf-leise" data-act="leeren">Zurücksetzen</button>'
      + '<button class="sf-knopf sf-leise" data-act="html" disabled>Als HTML speichern</button>'
      + '<button class="sf-knopf sf-leise" data-act="csv" disabled>CSV</button>'
      + "</div>"
      + '<div data-r="info"></div><div data-r="liste"></div></div>';

    var letzte = null;
    function f(n){ return root.querySelector('[data-f="' + n + '"]'); }
    function mwerte(){
      var pf = [], pl = [];
      AUSST.forEach(function(a){
        var c = root.querySelector('input[data-m="' + a[0] + '"]:checked');
        if (c && c.value === "pflicht") pf.push(a[0]); else if (c && c.value === "plus") pl.push(a[0]);
      });
      return { pflicht: pf, plus: pl };
    }
    function liste(attr){ return Array.prototype.map.call(root.querySelectorAll("input[" + attr + "]:checked"), function(i){ return i.getAttribute(attr); }); }

    // ---- Eingaben merken (nur Formularwerte) ----
    function zustand(){
      var z = { f: {}, m: {}, verf: liste("data-verf"), qaus: liste("data-qaus") };
      root.querySelectorAll("[data-f]").forEach(function(e){ z.f[e.getAttribute("data-f")] = e.type === "checkbox" ? e.checked : e.value; });
      var m = mwerte(); m.pflicht.forEach(function(k){ z.m[k] = "pflicht"; }); m.plus.forEach(function(k){ z.m[k] = "plus"; });
      return z;
    }
    function merken(){ try { localStorage.setItem(SPEICHER, JSON.stringify(zustand())); } catch (e){} }
    function setzen(z){
      z = z || {}; var zf = z.f || {}, zm = z.m || {};
      root.querySelectorAll("[data-f]").forEach(function(e){
        var v = zf[e.getAttribute("data-f")];
        if (e.type === "checkbox") e.checked = v === true; else e.value = v == null ? "" : String(v);
      });
      AUSST.forEach(function(a){
        var w = zm[a[0]] === "pflicht" || zm[a[0]] === "plus" ? zm[a[0]] : "";
        var r = root.querySelector('input[data-m="' + a[0] + '"][value="' + w + '"]'); if (r) r.checked = true;
      });
      root.querySelectorAll("input[data-verf]").forEach(function(c){ c.checked = (z.verf || []).indexOf(c.getAttribute("data-verf")) >= 0; });
      root.querySelectorAll("input[data-qaus]").forEach(function(c){ c.checked = (z.qaus || []).indexOf(c.getAttribute("data-qaus")) >= 0; });
    }
    try { var gespeichert = localStorage.getItem(SPEICHER); if (gespeichert) setzen(JSON.parse(gespeichert)); } catch (e){}

    async function suchen(){
      var marke = f("marke").value.trim(), modell = f("modell").value.trim(), frei = f("frei").value.trim();
      var info = root.querySelector('[data-r="info"]'), ausgabe = root.querySelector('[data-r="liste"]');
      if (!marke && !modell && !frei){ info.innerHTML = '<div class="sf-fehler">Bitte Marke, Modell oder Freitext angeben.</div>'; return; }
      var ezj = zahl(f("ez").value), m = mwerte(), verf = liste("data-verf"), qaus = liste("data-qaus");
      var p = {
        p_marke: marke || null, p_modell: modell || null, p_linie: f("linie").value.trim() || null,
        p_kraftstoff: f("kraftstoff").value || null, p_getriebe: f("getriebe").value || null,
        p_ez_ab: ezj ? ezj + "-01-01" : null, p_km_max: zahl(f("km").value), p_preis_max: zahl(f("preis").value),
        p_ps_min: zahl(f("psmin").value), p_ps_max: zahl(f("psmax").value),
        p_pflicht: m.pflicht, p_plus: m.plus,
        p_verfuegbarkeit: verf.length ? verf : null, p_quellen_aus: qaus.length ? qaus : null,
        p_farbe: f("farbe").value.trim() || null, p_freitext: frei || null,
        p_nur_passende: f("nurpassend").checked, p_limit: 300
      };
      merken();
      var knopf = root.querySelector('[data-act="suchen"]');
      knopf.disabled = true; knopf.textContent = "Suche läuft …";
      info.innerHTML = ""; var t0 = Date.now();
      try {
        var r = await client.rpc("sofort_suchen_v2", p);
        if (r.error) throw r.error;
        letzte = { zeilen: r.data || [], cfg: { pflicht: m.pflicht.slice(), plus: m.plus.slice() }, p: p, ms: Date.now() - t0, stand: new Date() };
        zeigen();
      } catch (e){
        var msg = (e && e.message) || String(e);
        if (/Berechtigung|permission/i.test(msg)) msg = "Keine Berechtigung – die Sofort-Suche ist für Admin und Verkauf freigeschaltet. Bitte anmelden.";
        info.innerHTML = '<div class="sf-fehler">' + esc(msg) + "</div>"; ausgabe.innerHTML = "";
        letzte = null; knoepfe();
      } finally {
        knopf.disabled = false; knopf.innerHTML = "&#128269; Sofort suchen";
      }
    }
    function knoepfe(){
      var an = !!(letzte && letzte.zeilen.length);
      root.querySelector('[data-act="html"]').disabled = !an; root.querySelector('[data-act="csv"]').disabled = !an;
    }

    function zeigen(){
      if (!letzte) return;
      var info = root.querySelector('[data-r="info"]'), ausgabe = root.querySelector('[data-r="liste"]');
      var z = letzte.zeilen, cfg = letzte.cfg, n = { A: 0, B: 0, C: 0 }, quellen = {};
      z.forEach(function(x){ if (n[x.gruppe] != null) n[x.gruppe]++; quellen[x.quelle] = (quellen[x.quelle] || 0) + 1; });
      var qt = Object.keys(quellen).sort(function(a, b){ return quellen[b] - quellen[a]; }).map(function(q){ return esc(q) + " " + quellen[q]; }).join(" · ");
      info.innerHTML = '<div class="sf-info"><b>' + z.length + (z.length >= 300 ? "+" : "") + " Treffer</b> in " + (letzte.ms / 1000).toFixed(1).replace(".", ",") + " s"
        + (cfg.pflicht.length ? " · <b>Gruppe A: " + n.A + " · B: " + n.B + " · C: " + n.C + "</b>" : "")
        + (qt ? " · " + qt : "")
        + (z.length >= 300 ? " · nur die ersten 300 – bitte enger suchen" : "") + "</div>";
      knoepfe();
      if (!z.length){ ausgabe.innerHTML = '<div class="sf-info">Nichts gefunden. Tipp: Linie, Farbe und Freitext sind harte Filter – erst leeren, dann EZ/km lockern.</div>'; return; }
      ausgabe.innerHTML = '<div class="sf-tabwrap">' + tabelleHtml(z, cfg) + "</div>"
        + '<div class="sf-klein" style="margin-top:6px">? = Lieferant nennt das Merkmal nicht – Gruppe B lohnt eine Nachfrage/Live-Prüfung. '
        + "★ = Pflicht. A: alle Pflicht erfüllt · B: Pflicht teils unbekannt · C: Pflicht fehlt. "
        + "Preise wie vom Lieferanten gemeldet (netto, ohne Fracht/Zulassung). Abruf = wann der Lieferant das Fahrzeug zuletzt gemeldet hat.</div>";
    }

    // Beschreibung der Suche (für HTML-Export), nur aus den Eingaben der letzten Suche
    function konfigText(){
      var p = letzte.p, t = [];
      function a(l, v){ if (v != null && v !== "" && !(Array.isArray(v) && !v.length)) t.push([l, Array.isArray(v) ? v.join(", ") : String(v)]); }
      a("Marke", p.p_marke); a("Modell", p.p_modell); a("Linie", p.p_linie); a("Kraftstoff", p.p_kraftstoff); a("Getriebe", p.p_getriebe);
      a("EZ ab", p.p_ez_ab ? p.p_ez_ab.slice(0, 4) : null); a("km höchstens", p.p_km_max != null ? p.p_km_max.toLocaleString("de-DE") : null);
      a("EK netto höchstens", p.p_preis_max != null ? eur(p.p_preis_max) : null); a("PS von", p.p_ps_min); a("PS bis", p.p_ps_max);
      a("Farbe", p.p_farbe); a("Freitext", p.p_freitext); a("Verfügbarkeit", p.p_verfuegbarkeit);
      a("Pflicht", letzte.cfg.pflicht.map(name)); a("Plus", letzte.cfg.plus.map(name)); a("Quellen ausgeschlossen", p.p_quellen_aus);
      if (p.p_nur_passende) a("Filter", "nur passende (Gruppe C ausgeblendet)");
      return t;
    }
    function exportHtml(){
      if (!letzte || !letzte.zeilen.length) return;
      var d = letzte.stand, tag = stempel(), uhr = d.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
      var kfg = konfigText().map(function(r){ return "<b>" + esc(r[0]) + ":</b> " + esc(r[1]); }).join(" · ");
      var n = { A: 0, B: 0, C: 0 }; letzte.zeilen.forEach(function(x){ if (n[x.gruppe] != null) n[x.gruppe]++; });
      var doc = '<!doctype html><html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'
        + "<title>Sofort-Suche " + tag + "</title><style>" + EXPORT_CSS + "</style></head><body>"
        + "<h1>Sofort <em>suchen</em></h1>"
        + '<div class="k">Stand: ' + tag.split("-").reverse().join(".") + ", " + uhr + " Uhr · " + letzte.zeilen.length + " Treffer"
        + (letzte.cfg.pflicht.length ? " · Gruppe A: " + n.A + " · B: " + n.B + " · C: " + n.C : "") + "</div>"
        + '<div class="k">' + (kfg || "Keine Einschränkung") + "</div>"
        + '<div class="w">' + tabelleHtml(letzte.zeilen, letzte.cfg) + "</div>"
        + '<p class="k">★ = Pflicht · ✔ ja · ✘ nein · ? = Lieferant nennt das Merkmal nicht (Gruppe B lohnt eine Nachfrage/Live-Prüfung). Preise netto wie vom Lieferanten gemeldet.</p>'
        + "</body></html>";
      laden(doc, tag + "_Sofort-Suche_v1.html", "text/html;charset=utf-8");
    }
    function exportCsv(){
      if (!letzte || !letzte.zeilen.length) return;
      var sp = letzte.cfg.pflicht.concat(letzte.cfg.plus);
      var kopf = ["Gruppe","Rang","Quelle","Anbieter","Hersteller","Modell","Linie","Typ","Erstzulassung","km","Kraftstoff","Getriebe","PS","Farbe",
        "EK netto","brutto","Verfügbarkeit","Lieferzeit Tage","Paketangebot","Abruf vor Std.","Ausstattung Quelle","VIN","Link"]
        .concat(sp.map(function(k){ return (letzte.cfg.pflicht.indexOf(k) >= 0 ? "Pflicht: " : "Plus: ") + name(k); }));
      var zeilen = letzte.zeilen.map(function(x){
        var aj = x.ausstattung || {};
        return [x.gruppe, x.rang, x.quelle, x.anbieter, x.hersteller, x.modell, x.linie, x.typ, x.erstzulassung, x.km_stand, x.kraftstoff, x.getriebe, x.ps, x.farbe,
          x.preis_netto == null ? "" : String(Math.round(Number(x.preis_netto))), x.preis_brutto == null ? "" : String(Math.round(Number(x.preis_brutto))),
          x.verfuegbarkeit, x.lieferzeit_tage, x.paketangebot === true ? "ja" : x.paketangebot === false ? "nein" : x.paketangebot, x.alter_stunden,
          x.ausstattung_norm_quelle, x.vin, sicherLink(x.original_link)]
          .concat(sp.map(function(k){ var v = aj[k]; return v === 1 ? "ja" : v === 0 ? "nein" : "?"; }));
      });
      var csv = [kopf].concat(zeilen).map(function(r){ return r.map(csvZelle).join(";"); }).join("\r\n");
      laden("﻿" + csv, stempel() + "_Sofort-Suche_v1.csv", "text/csv;charset=utf-8");
    }

    root.addEventListener("click", function(e){
      var b = e.target.closest("[data-act]"); if (!b) return;
      var akt = b.getAttribute("data-act");
      if (akt === "suchen") suchen();
      if (akt === "html") exportHtml();
      if (akt === "csv") exportCsv();
      if (akt === "leeren"){
        setzen({}); try { localStorage.removeItem(SPEICHER); } catch (x){}
      }
    });
    root.addEventListener("keydown", function(e){ if (e.key === "Enter" && e.target.tagName === "INPUT" && e.target.type !== "checkbox" && e.target.type !== "radio"){ e.preventDefault(); suchen(); } });
    root.addEventListener("change", merken);
    root.addEventListener("input", merken);
  }

  window.SOFORT = { init: init, AUSSTATTUNG: AUSST };
})();
