// Service worker de "Finanzas del hogar".
// Estrategia:
//  - Estáticos (_next/static, iconos): cache-first (stale-while-revalidate).
//  - Navegaciones: network-first con fallback a /offline cuando no hay red.
//  - Nunca cachea llamadas a Supabase ni auth.

// Subir la versión al cambiar assets del shell (p. ej. los iconos): al activarse
// borra las caches viejas y así no se sirven iconos obsoletos por cache-first.
const CACHE = "finanzas-v2";
const APP_SHELL = ["/offline", "/icon-192.png", "/icon-512.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(APP_SHELL)),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))),
      ),
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  // No tocar otras orígenes (Supabase, etc.).
  if (url.origin !== self.location.origin) return;

  // Navegaciones: network-first, fallback offline.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(() => caches.match("/offline")),
    );
    return;
  }

  // Estáticos: cache-first + revalidación en segundo plano.
  if (
    url.pathname.startsWith("/_next/static") ||
    url.pathname.startsWith("/icon-") ||
    url.pathname === "/icon.svg" ||
    url.pathname === "/apple-touch-icon.png"
  ) {
    event.respondWith(
      caches.match(request).then((cached) => {
        const network = fetch(request)
          .then((res) => {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(request, copy));
            return res;
          })
          .catch(() => cached);
        return cached || network;
      }),
    );
  }
});
