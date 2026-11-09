// Funciona sin conexión después de la primera visita: muestra lo guardado y actualiza en segundo plano.
const CACHE = "al-articulo-v3";
const BASICOS = ["./", "index.html", "estilos.css", "app.js", "manifest.webmanifest", "icono.svg", "datos/indice.json"];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(BASICOS)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", e => {
  if (e.request.method !== "GET" || new URL(e.request.url).origin !== location.origin) return;
  e.respondWith(caches.open(CACHE).then(async cache => {
    const guardado = await cache.match(e.request);
    const red = fetch(e.request).then(r => { if (r.ok) cache.put(e.request, r.clone()); return r; }).catch(() => guardado);
    return guardado || red;
  }));
});
