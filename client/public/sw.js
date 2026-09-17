/* App-shell service worker (design.md §9).
 * HTML — всегда с сети (network-first): иначе после деплоя новой сборки
 * старый index.html (со старым именем JS/CSS) кэшируется навечно.
 * Хэшированные JS/CSS/иконки — cache-first (имя файла меняется при каждой
 * сборке, так что кэшировать их безопасно и полезно для офлайн-режима).
 * /api/* и /ws — никогда не кэшируются (живые данные счёта). */
const CACHE = 'terminal-shell-v4';
const SHELL = ['./manifest.webmanifest', './favicon.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(SHELL)).catch(() => undefined),
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET' || !request.url.startsWith(self.location.origin)) return;

  const url = new URL(request.url);

  // API и WS — всегда напрямую с сервера, никогда не кэшируем (живые данные счёта).
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/ws')) {
    event.respondWith(fetch(request));
    return;
  }

  // HTML-документ (навигация или прямой запрос index.html) — network-first,
  // с откатом на кэш только если сеть недоступна (офлайн).
  if (request.mode === 'navigate' || url.pathname.endsWith('/') || url.pathname.endsWith('index.html')) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(CACHE).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(() => caches.match(request, { ignoreSearch: true })),
    );
    return;
  }

  // Остальное (хэшированные assets, иконки) — cache-first.
  event.respondWith(
    caches.match(request, { ignoreSearch: true }).then(
      (cached) =>
        cached ||
        fetch(request).then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(CACHE).then((cache) => cache.put(request, copy));
          }
          return response;
        }),
    ),
  );
});
