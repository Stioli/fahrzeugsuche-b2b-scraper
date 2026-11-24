/* Leads 1.1 (24.11.2026) – Reiter "Leads" stillgelegt.
   Die Anfragen werden in der Stieber-App bearbeitet (eingang.html#anfragen).
   Diese Datei macht KEINE Aufrufe an leads_api, kein Polling, keine Push-Anmeldung und enthält keine Kundendaten.
   Alte Fassung (1.0, 26.10.2026): Git-Stand vor diesem Commit. */
(function () {
  "use strict";
  var ZIEL = "eingang.html#anfragen";

  // alte Lesezeichen und Links: index.html#leads oder #leads&id=123 -> direkt in die Stieber-App
  function weiterleiten() {
    var m = /^#leads(?:&id=(\d+))?/.exec(location.hash || "");
    if (!m) return false;
    location.replace(ZIEL + (m[1] ? "&id=" + m[1] : ""));
    return true;
  }

  function boot() {
    if (weiterleiten()) return;
    var tab = document.getElementById("tab-leads");
    if (tab) { tab.style.display = ""; tab.textContent = "Anfragen (Stieber-App)"; }
  }

  function show(container) {
    if (!container) return;
    container.innerHTML = '<div style="padding:12px 4px;font-size:15px">'
      + 'Die Anfragen werden jetzt in der Stieber-App bearbeitet. '
      + '<a href="' + ZIEL + '" style="color:#0A5CD0;font-weight:600">Zur Stieber-App, Reiter Anfragen</a>'
      + '</div>';
  }

  window.LEADS = { boot: boot, show: show };
})();
