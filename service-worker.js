// Service Worker - Pollita Mundial 2026
// IMPORTANTE: Bumpar CACHE_VERSION con cada deploy significativo
const CACHE_VERSION = "v5";
const CACHE_NAME = "mundial2026-" + CACHE_VERSION;

// Assets estáticos: cache-first (no cambian entre deploys)
const STATIC_ASSETS = [
  "./manifest.json",
  "./icon-192.png",
  "./icon-512.png",
  "./apple-touch-icon.png"
];

// Código de la app: network-first (siempre busca versión fresca)
const APP_ASSETS = [
  "./",
  "./index.html",
  "./styles.css",
  "./app.js",
  "./data.js"
];

// Instalar: pre-cachear todo
self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache =>
      cache.addAll([...STATIC_ASSETS, ...APP_ASSETS]).catch(() => {})
    )
  );
  self.skipWaiting();
});

// Activar: eliminar cachés de versiones anteriores
self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", event => {
  const url = new URL(event.request.url);
  if (event.request.method !== "GET") return;

  // Fuentes de Google: stale-while-revalidate
  if (url.hostname.includes("fonts.googleapis.com") || url.hostname.includes("fonts.gstatic.com")) {
    event.respondWith(
      caches.match(event.request).then(cached => {
        const fetchPromise = fetch(event.request).then(response => {
          if (response && response.status === 200) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
          }
          return response;
        }).catch(() => cached);
        return cached || fetchPromise;
      })
    );
    return;
  }

  if (url.origin !== self.location.origin) return;

  const isAppAsset = APP_ASSETS.some(a => url.pathname.endsWith(a.replace("./", "/"))) || url.pathname === "/";

  if (isAppAsset) {
    // Network-first: siempre intenta traer la versión más reciente
    event.respondWith(
      fetch(event.request).then(response => {
        if (response && response.status === 200) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        }
        return response;
      }).catch(() => caches.match(event.request).then(cached => cached || caches.match("./index.html")))
    );
  } else {
    // Cache-first para assets estáticos (iconos, etc.)
    event.respondWith(
      caches.match(event.request).then(cached => {
        if (cached) return cached;
        return fetch(event.request).then(response => {
          if (response && response.status === 200) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
          }
          return response;
        });
      }).catch(() => caches.match("./index.html"))
    );
  }
});

// ====== PUSH NOTIFICATIONS ======
self.addEventListener("push", event => {
  const data = event.data ? event.data.json() : {};
  event.waitUntil(
    self.registration.showNotification(data.title || "Polla Casa Estadio", {
      body:  data.body  || "",
      icon:  "./icon-192.png",
      badge: "./icon-192.png",
      data:  { url: data.url || "/" }
    })
  );
});

self.addEventListener("notificationclick", event => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || "/";
  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then(list => {
      for (const client of list) {
        if ("focus" in client) return client.focus();
      }
      return clients.openWindow(targetUrl);
    })
  );
});
