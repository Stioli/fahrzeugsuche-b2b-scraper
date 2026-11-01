/* Service Worker fuer Push-Benachrichtigungen bei neuen Anfragen (Leads-Reiter).
   Kein Caching, keine Kundendaten: die Push enthaelt nur Quelle, Fahrzeug und Nummer. */
self.addEventListener("install", function () { self.skipWaiting(); });
self.addEventListener("activate", function (e) { e.waitUntil(self.clients.claim()); });
self.addEventListener("fetch", function () { /* bewusst leer: alles geht direkt ins Netz */ });

self.addEventListener("push", function (event) {
  var d = {};
  try { d = event.data ? event.data.json() : {}; } catch (e) { d = { text: event.data ? event.data.text() : "" }; }
  var zeigen = self.registration.showNotification(d.titel || "Neue Anfrage", {
    body: d.text || "",
    tag: d.tag || "lead",
    renotify: true,   // gleiche Kennung (z. B. Testnachricht): trotzdem wieder aufpoppen statt still ersetzen
    icon: "icon-192.png",
    badge: "icon-192.png",
    requireInteraction: true,
    data: { url: d.url || "" }
  });
  // offene Dashboard-Fenster zusaetzlich informieren (Popup mit Ton)
  var info = self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(function (liste) {
    liste.forEach(function (c) { c.postMessage({ typ: "lead-neu", text: d.text || "", url: d.url || "" }); });
  });
  event.waitUntil(Promise.all([zeigen, info]));
});

self.addEventListener("notificationclick", function (event) {
  event.notification.close();
  // Anfragen liegen seit 01.11.2026 in der Stieber-App: alte Links aufs Dashboard dorthin umlenken
  var roh = ((event.notification.data && event.notification.data.url) || "./eingang.html#anfragen").replace("index.html#leads", "eingang.html#anfragen");
  var ziel = new URL(roh, self.registration.scope).href;
  event.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(function (liste) {
    for (var i = 0; i < liste.length; i++) {
      if (liste[i].url.indexOf(self.registration.scope + "eingang.html") === 0) {
        liste[i].postMessage({ typ: "lead-oeffnen", url: ziel });
        return liste[i].focus();
      }
    }
    return self.clients.openWindow(ziel);
  }));
});
