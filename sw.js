// Правки для iOS [начало]: sw.js — новый файл. Service worker для PWA-версии: после установки на экран «Домой»
// тренажёр открывается и работает без интернета. Номер кэша поднимается с каждой версией, старые кэши удаляются.
/* Service worker: офлайн-работа тренажёра.
   Стратегия: сначала сеть (чтобы обновлённые файлы подхватывались сразу), при отсутствии сети — кэш.
   ВАЖНО: прогресс (localStorage / IndexedDB) service worker не хранит и не удаляет — только файлы сайта. */
// Правки для iOS (v5): версия кэша trainer-v5. Новый номер = новый sw.js => iPhone ставит новую версию и удаляет старый кэш trainer-v4
const CACHE = "trainer-v5";
// Правки для iOS (v5): список файлов приведён к составу сайта: добавлены style.css и editor.js (без них офлайн-запуск был без стилей/редактора);
// убраны questions.js и single/trainer.html (на сайте их нет — 404). Ошибка одного файла не ломает установку.
const PRECACHE = [
  "./", "index.html", "style.css", "boot.js", "app.js", "gamification.js", "ios.js", "editor.js",
  "vendor/chart.umd.min.js", "manifest.webmanifest",
  "icons/apple-touch-icon.png", "icons/icon-192.png", "icons/icon-512.png", "icons/icon-maskable-512.png"
];

// Правки для iOS: установка: кэшируем всё (каждый файл отдельно, в обход HTTP-кэша) и сразу активируем новую версию
self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) => Promise.all(
      PRECACHE.map((url) => fetch(new Request(url, { cache: "reload" }))
        .then((res) => { if (res.ok) return c.put(url, res); })
        .catch(() => { console.warn("[sw] Не удалось закэшировать:", url); }))
    )).then(() => self.skipWaiting())
  );
});

// Правки для iOS: активация: удаляем кэши прошлых версий (trainer-v1…v4), прогресс в localStorage/IndexedDB не трогается
self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => /^trainer-/.test(k) && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

function timeout(ms) { return new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), ms)); }

// Правки для iOS: стратегия «сначала сеть, потом кэш»: обновлённые файлы подхватываются сразу, без сети — из кэша
self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // GitHub API / raw-файлы наборов — напрямую
  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    // Правки для iOS (v5): сетевой запрос продолжает работать и после тайм-аута — свежий файл всё равно ляжет в кэш к следующему запуску
    const net = fetch(req, { cache: "no-cache" }).then((res) => {
      if (res && res.ok) e.waitUntil(cache.put(req, res.clone()));
      return res;
    });
    e.waitUntil(net.catch(() => {}));
    try {
      const res = await Promise.race([net, timeout(6000)]);
      if (res && res.ok) return res;
      if (res && res.status === 404) {
        // 404: отдадим из кэша, если там есть (например, файл временно пропал с хостинга)
        const cached404 = await cache.match(req, { ignoreSearch: true });
        return cached404 || res;
      }
      throw new Error("bad status " + (res && res.status));
    } catch (err) {
      const cached = await cache.match(req, { ignoreSearch: true });
      if (cached) return cached;
      if (req.mode === "navigate") {
        const idx = (await cache.match("index.html")) || (await cache.match("./"));
        if (idx) return idx;
      }
      return new Response("Нет сети и файла нет в кэше", { status: 503, headers: { "Content-Type": "text/plain; charset=utf-8" } });
    }
  })());
});
// Правки для iOS [конец]: sw.js
