// Правки для iOS [начало]: sw.js — новый файл. Service worker для PWA-версии: после установки на экран «Домой»
// тренажёр открывается и работает без интернета. Номер кэша поднимается с каждой версией, старые кэши удаляются.
/* Service worker: офлайн-работа тренажёра.
   Стратегия: сначала сеть (чтобы обновлённый questions.js подхватывался сразу), при отсутствии сети — кэш. */
// Правки для iOS: версия кэша PWA (v4 — разметка правок, номер версии в интерфейсе)
const CACHE = "trainer-v4";
// Правки для iOS: файлы, которые кладутся в кэш при установке (включая 1-файловую версию для пересборки)
const PRECACHE = [
  "./", "index.html", "boot.js", "app.js", "gamification.js", "ios.js", "questions.js",
  "vendor/chart.umd.min.js", "manifest.webmanifest",
  "icons/apple-touch-icon.png", "icons/icon-192.png", "icons/icon-512.png", "icons/icon-maskable-512.png",
  "single/trainer.html"
];

// Правки для iOS: установка: кэшируем всё и сразу активируем новую версию
self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) => {
      // Кэшируем каждый файл по отдельности, чтобы ошибка 404 на иконке не ломала весь кэш
      return Promise.all(
        PRECACHE.map((url) => {
          return c.add(url).catch((err) => {
            console.warn("[sw] Не удалось закэшировать:", url);
          });
        })
      );
    }).then(() => self.skipWaiting())
  );
});

// Правки для iOS: активация: удаляем кэши прошлых версий (trainer-v1…v3), прогресс в localStorage/IndexedDB не трогается
self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

function timeout(ms) { return new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), ms)); }

// Правки для iOS: стратегия «сначала сеть, потом кэш»: обновлённые файлы подхватываются сразу, без сети — из кэша
self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    try {
      const res = await Promise.race([fetch(req, { cache: "no-cache" }), timeout(4000)]);
      if (res && res.ok) cache.put(req, res.clone());
      if (res && (res.ok || res.status === 404)) {
        if (res.ok) return res;
        // 404: отдадим из кэша, если там есть (например, файл временно пропал с хостинга)
        const cached404 = await cache.match(req, { ignoreSearch: true });
        return cached404 || res;
      }
      throw new Error("bad status " + (res && res.status));
    } catch (err) {
      const cached = await cache.match(req, { ignoreSearch: true });
      if (cached) return cached;
      if (req.mode === "navigate") {
        const idx = await cache.match("index.html");
        if (idx) return idx;
      }
      return new Response("Нет сети и файла нет в кэше", { status: 503, headers: { "Content-Type": "text/plain; charset=utf-8" } });
    }
  })());
});
// Правки для iOS [конец]: sw.js
