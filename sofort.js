/* Sofort suchen (Paket 5, 10.10.2026) – Einzelsuche für Kunden direkt aus ankauf.angebote, ohne Scraper-Lauf.
   Eine Datei für Ankauf-Dashboard UND Cockpit-Modul (gleicher Inhalt, zwei Kopien):
     SOFORT.init(container, supabaseClient)   supabaseClient mit db.schema = "ankauf" und angemeldetem Konto
   Daten: db.rpc("sofort_suchen") – Rollenprüfung (admin/verkauf) und RLS macht die Datenbank. Nur lesend.
   Ausstattung dreiwertig: ✔ ja · ✘ nein (nur bei „ohne …“) · ? unbekannt (Lieferant nennt nichts). Kein Ausschluss,
   außer „sicheres Nein ausblenden“ ist angehakt. Enthält keine Schlüssel und keine Geschäftszahlen. */
(function(){
  "use strict";
  var AUSST = [["pano","Panoramadach"],["sitzlueftung","Sitzlüftung"],["heckklappe","el. Heckklappe"],["sitzheizung","Sitzheizung"],
    ["lenkradheizung","Lenkradheizung"],["navi","Navi"],["rfk","Rückfahrkamera"],["k360","360°-Kamera"],["ahk","AHK"],["leder","Leder"],
    ["led","LED/Matrix"],["acc","ACC/Abstandstempomat"],["hud","Head-up"],["keyless","Keyless"],["carplay","CarPlay/Android Auto"],
    ["allrad","Allrad"],["sound","Soundsystem"]];
  var KRAFT = ["","Benzin","Diesel","Hybrid","Mild-Hybrid","Plug-in-Hybrid","Elektro"];
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
    + ".sf-zeile{display:flex;flex-wrap:wrap;gap:10px;align-items:center;margin-bottom:10px}"
    + ".sf-knopf{font-family:var(--font-heading,'Plus Jakarta Sans',system-ui,sans-serif);font-weight:700;font-size:16px;border:none;border-radius:14px;padding:12px 22px;min-height:46px;cursor:pointer;background:#007BFF;color:#fff}"
    + ".sf-knopf:hover{background:#0A5CD0}.sf-knopf:disabled{background:#8E9FB4;cursor:default}"
    + ".sf-leise{background:#fff;color:#0A5CD0;border:1px solid var(--border,#E0E8F0);font-size:14px;padding:8px 14px;min-height:0}"
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
    + "@media (max-width:600px){.sf-raster{grid-template-columns:1fr 1fr}}";

  function esc(s){ return String(s == null ? "" : s).replace(/[&<>"']/g, function(c){ return {"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c]; }); }
  function eur(n){ return n == null ? "–" : Math.round(Number(n)).toLocaleString("de-DE") + " €"; }
  function zahl(v){ var s = String(v == null ? "" : v).replace(/[.\s€]/g, "").split(",")[0]; if (s === "") return null; var n = parseInt(s, 10); return isNaN(n) ? null : n; }
  function ez(d){ if (!d) return "–"; var p = String(d).split("-"); return p.length >= 2 ? p[1] + "/" + p[0] : d; }
  function alter(h){ if (h == null) return "–"; if (h < 1) return "gerade"; if (h < 48) return "vor " + h + " Std."; return "vor " + Math.round(h / 24) + " Tagen"; }
  function sicherLink(u){ return /^https?:\/\//i.test(String(u || "")) ? String(u) : ""; }

  function init(root, client){
    if (!root || !client) return;
    if (!document.getElementById("sf-stil")){ var st = document.createElement("style"); st.id = "sf-stil"; st.textContent = CSS; document.head.appendChild(st); }
    var jahr = new Date().getFullYear();
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
      + '<label class="sf-f sf-frei">Freitext (alle Wörter müssen vorkommen)<input type="text" data-f="frei" maxlength="120" placeholder="z. B. sportage black edition" autocomplete="off"></label>'
      + "</div>"
      + '<div class="sf-klein" style="margin-bottom:4px">Ausstattung (zeigt ✔ ja · ✘ nein · ? unbekannt – blendet nichts aus)</div>'
      + '<div class="sf-checks">' + AUSST.map(function(a){ return '<label><input type="checkbox" value="' + a[0] + '"> ' + esc(a[1]) + "</label>"; }).join("") + "</div>"
      + '<div class="sf-zeile">'
      + '<button class="sf-knopf" data-act="suchen">&#128269; Sofort suchen</button>'
      + '<span class="sf-checks" style="margin:0"><label><input type="checkbox" data-f="streng"> sicheres „Nein“ ausblenden</label>'
      + '<label><input type="checkbox" data-f="passend"> passende Ausstattung zuerst</label></span>'
      + '<button class="sf-knopf sf-leise" data-act="leeren">Eingaben leeren</button>'
      + "</div>"
      + '<div data-r="info"></div><div data-r="liste"></div></div>';

    var letzte = null;
    function f(n){ return root.querySelector('[data-f="' + n + '"]'); }
    function gewaehlt(){ return Array.prototype.map.call(root.querySelectorAll(".sf-checks input[value]:checked"), function(i){ return i.value; }); }

    async function suchen(){
      var marke = f("marke").value.trim(), modell = f("modell").value.trim(), frei = f("frei").value.trim();
      var info = root.querySelector('[data-r="info"]'), liste = root.querySelector('[data-r="liste"]');
      if (!marke && !modell && !frei){ info.innerHTML = '<div class="sf-fehler">Bitte Marke, Modell oder Freitext angeben.</div>'; return; }
      var ezj = zahl(f("ez").value);
      var p = {
        p_marke: marke || null, p_modell: modell || null, p_linie: f("linie").value.trim() || null,
        p_kraftstoff: f("kraftstoff").value || null, p_getriebe: f("getriebe").value || null,
        p_ez_ab: ezj ? ezj + "-01-01" : null, p_km_max: zahl(f("km").value), p_preis_max: zahl(f("preis").value),
        p_ausstattung: gewaehlt(), p_freitext: frei || null, p_nur_passende: f("streng").checked, p_limit: 300
      };
      var knopf = root.querySelector('[data-act="suchen"]');
      knopf.disabled = true; knopf.textContent = "Suche läuft …";
      info.innerHTML = ""; var t0 = Date.now();
      try {
        var r = await client.rpc("sofort_suchen", p);
        if (r.error) throw r.error;
        letzte = { zeilen: r.data || [], ausst: p.p_ausstattung, ms: Date.now() - t0 };
        zeigen();
      } catch (e){
        var m = (e && e.message) || String(e);
        if (/Berechtigung|permission/i.test(m)) m = "Keine Berechtigung – die Sofort-Suche ist für Admin und Verkauf freigeschaltet. Bitte anmelden.";
        info.innerHTML = '<div class="sf-fehler">' + esc(m) + "</div>"; liste.innerHTML = "";
      } finally {
        knopf.disabled = false; knopf.innerHTML = "&#128269; Sofort suchen";
      }
    }

    function zeigen(){
      if (!letzte) return;
      var info = root.querySelector('[data-r="info"]'), liste = root.querySelector('[data-r="liste"]');
      var z = letzte.zeilen.slice(), au = letzte.ausst;
      if (f("passend").checked && au.length) z.sort(function(a, b){ return (b.ausst_ja - a.ausst_ja) || (a.ausst_nein - b.ausst_nein) || (Number(a.preis_netto) - Number(b.preis_netto)); });
      var quellen = {};
      z.forEach(function(x){ quellen[x.quelle] = (quellen[x.quelle] || 0) + 1; });
      var qt = Object.keys(quellen).sort(function(a, b){ return quellen[b] - quellen[a]; }).map(function(q){ return esc(q) + " " + quellen[q]; }).join(" · ");
      var unb = au.length ? z.filter(function(x){ return x.ausst_unbekannt > 0; }).length : 0;
      info.innerHTML = '<div class="sf-info"><b>' + z.length + (z.length >= 300 ? "+" : "") + " Treffer</b> in " + (letzte.ms / 1000).toFixed(1).replace(".", ",") + " s"
        + (qt ? " · " + qt : "")
        + (au.length ? " · bei " + unb + " Fahrzeugen ist mindestens ein Ausstattungsmerkmal unbekannt (?)" : "")
        + (z.length >= 300 ? " · nur die 300 günstigsten – bitte enger suchen" : "") + "</div>";
      if (!z.length){ liste.innerHTML = '<div class="sf-info">Nichts gefunden. Tipp: Linie und Freitext sind harte Filter – erst leeren, dann EZ/km lockern.</div>'; return; }
      var kopf = "<tr><th>Quelle</th><th>Fahrzeug</th><th>EZ</th><th class=\"r\">km</th><th>Antrieb</th><th class=\"r\">EK netto</th><th class=\"r\">brutto</th>"
        + au.map(function(k){ var n = AUSST.filter(function(a){ return a[0] === k; })[0]; return '<th title="' + esc(n ? n[1] : k) + '">' + esc(n ? n[1] : k) + "</th>"; }).join("")
        + "<th>Abruf</th><th></th></tr>";
      var rumpf = z.map(function(x){
        var l = sicherLink(x.original_link), aj = x.ausstattung || {};
        return "<tr>"
          + "<td>" + esc(x.quelle) + (x.anbieter ? '<div class="sf-klein">' + esc(x.anbieter) + "</div>" : "") + "</td>"
          + "<td><b>" + esc([x.hersteller, x.modell].filter(Boolean).join(" ")) + "</b>" + (x.linie ? " · " + esc(x.linie) : "")
          + (x.typ ? '<div class="sf-klein">' + esc(String(x.typ).slice(0, 90)) + "</div>" : "")
          + (x.farbe ? '<div class="sf-klein">' + esc(x.farbe) + "</div>" : "") + "</td>"
          + "<td>" + ez(x.erstzulassung) + "</td>"
          + '<td class="r">' + (x.km_stand == null ? "–" : Number(x.km_stand).toLocaleString("de-DE")) + "</td>"
          + "<td>" + esc([x.kraftstoff, x.getriebe, x.ps ? x.ps + " PS" : ""].filter(Boolean).join(" · ")) + "</td>"
          + '<td class="r"><b>' + eur(x.preis_netto) + "</b></td>"
          + '<td class="r">' + eur(x.preis_brutto) + "</td>"
          + au.map(function(k){ var v = aj[k]; return v === 1 ? '<td class="a1" title="ja">✔</td>' : v === 0 ? '<td class="a0" title="nein">✘</td>' : '<td class="an" title="unbekannt">?</td>'; }).join("")
          + '<td class="sf-klein' + (x.alter_stunden > 72 ? " sf-alt" : "") + '">' + alter(x.alter_stunden) + (x.verfuegbarkeit ? "<br>" + esc(x.verfuegbarkeit) : "") + "</td>"
          + "<td>" + (l ? '<a href="' + esc(l) + '" target="_blank" rel="noopener noreferrer">öffnen</a>' : "") + "</td>"
          + "</tr>";
      }).join("");
      liste.innerHTML = '<div class="sf-tabwrap"><table><thead>' + kopf + "</thead><tbody>" + rumpf + "</tbody></table></div>"
        + '<div class="sf-klein" style="margin-top:6px">Preise wie vom Lieferanten gemeldet (netto, ohne Fracht/Zulassung). Abruf = wann der Lieferant das Fahrzeug zuletzt gemeldet hat.</div>';
    }

    root.addEventListener("click", function(e){
      var b = e.target.closest("[data-act]"); if (!b) return;
      if (b.getAttribute("data-act") === "suchen") suchen();
      if (b.getAttribute("data-act") === "leeren"){
        root.querySelectorAll("input[type=text],input[type=number]").forEach(function(i){ i.value = ""; });
        root.querySelectorAll("select").forEach(function(s){ s.value = ""; });
        root.querySelectorAll("input[type=checkbox]").forEach(function(c){ c.checked = false; });
      }
    });
    root.addEventListener("keydown", function(e){ if (e.key === "Enter" && e.target.tagName === "INPUT" && e.target.type !== "checkbox"){ e.preventDefault(); suchen(); } });
    root.addEventListener("change", function(e){ if (e.target.getAttribute && e.target.getAttribute("data-f") === "passend") zeigen(); });
  }

  window.SOFORT = { init: init, AUSSTATTUNG: AUSST };
})();
