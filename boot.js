// Правки для iOS [начало]: boot.js — новый файл (в оригинале его не было). Причина: на iPhone прогресс терялся
// (Яндекс/Chrome с file:// и Safari чистят localStorage), а модули грузились отдельными <script src>, которые
// в 1-файловой версии недоступны. Здесь: резервная копия localStorage в IndexedDB, восстановление, загрузка модулей.
/* =========================================================
   BOOT (iOS): хранилище + загрузка модулей
   1) прячет предупреждение «JavaScript не работает» (Quick Look)
   2) восстанавливает localStorage из резервной копии IndexedDB, если iOS его очистил
   3) зеркалирует каждое изменение localStorage в IndexedDB
   4) просит у браузера «постоянное» хранилище (navigator.storage.persist)
   5) по очереди загружает модули приложения
   ========================================================= */
(function () {
  "use strict";
  var IS_SINGLE = !!document.getElementById("src-app");
  // Правки для iOS: для пересборки 1-файловой версии с другим набором вопросов запоминаем исходный HTML страницы
  if (IS_SINGLE) {
    // Нетронутая копия страницы — нужна для пересборки 1-файловой версии с другим набором вопросов
    window.__PRISTINE_HTML = "<!DOCTYPE html>\n" + document.documentElement.outerHTML;
  }
  // Правки для iOS: JS запустился — прячем экран «Кнопки не работают» (он виден только в превью без JS: Telegram, «Файлы», Quick Look)
  var w = document.getElementById("nojsWarning");
  if (w) w.style.display = "none";
  document.documentElement.classList.add("js-ok");

  // Правки для iOS: отдельная база IndexedDB для резервной копии прогресса и загруженных наборов вопросов
  var DB_NAME = "trainer-ios", DB_VER = 1;
  var STAMP = "__backup:savedAt";
  var INTERNAL = /^__backup:/;

  /* ---------------- IndexedDB ---------------- */
  var dbPromise = null;
  // Правки для iOS: открытие IndexedDB с тайм-аутом: на iOS indexedDB.open иногда «зависает» и не вызывает ни success, ни error
  function idb() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise(function (resolve) {
      try {
        if (!window.indexedDB) return resolve(null);
        var req = indexedDB.open(DB_NAME, DB_VER);
        req.onupgradeneeded = function () {
          var db = req.result;
          if (!db.objectStoreNames.contains("kv")) db.createObjectStore("kv");
          if (!db.objectStoreNames.contains("sets")) db.createObjectStore("sets");
        };
        req.onsuccess = function () { resolve(req.result); };
        req.onerror = function () { resolve(null); };
        req.onblocked = function () { resolve(null); };
        setTimeout(function () { resolve(null); }, 3000); // iOS иногда «зависает» на open
      } catch (e) { resolve(null); }
    });
    return dbPromise;
  }
  function idbReq(store, mode, fn) {
    return idb().then(function (db) {
      if (!db) return undefined;
      return new Promise(function (resolve) {
        try {
          var tx = db.transaction(store, mode);
          var r = fn(tx.objectStore(store));
          tx.oncomplete = function () { resolve(r && "result" in r ? r.result : true); };
          tx.onerror = tx.onabort = function () { resolve(undefined); };
        } catch (e) { resolve(undefined); }
      });
    });
  }
  var IDB = {
    get: function (store, key) { return idbReq(store, "readonly", function (s) { return s.get(key); }); },
    put: function (store, key, val) { return idbReq(store, "readwrite", function (s) { return s.put(val, key); }); },
    del: function (store, key) { return idbReq(store, "readwrite", function (s) { return s.delete(key); }); },
    all: function (store) { return idbReq(store, "readonly", function (s) { return s.getAll(); }); }
  };

  /* ---------------- Зеркало localStorage -> IndexedDB ---------------- */
  // Правки для iOS: проверка доступности localStorage (в приватном режиме/некоторых WebView запись падает с исключением)
  var ls = null;
  try { ls = window.localStorage; ls.setItem("__backup:probe", "1"); ls.removeItem("__backup:probe"); } catch (e) { ls = null; }

  var proto = window.Storage && Storage.prototype;
  var origSet = proto && proto.setItem, origRemove = proto && proto.removeItem, origClear = proto && proto.clear;
  var suspended = false, timer = null, lastBackupAt = 0;

  // Правки для iOS: снимок всех ключей прогресса (служебные __backup:* не включаем)
  function snapshot() {
    var data = {};
    if (!ls) return data;
    for (var i = 0; i < ls.length; i++) {
      var k = ls.key(i);
      if (k && !INTERNAL.test(k)) data[k] = ls.getItem(k);
    }
    return data;
  }
  // Правки для iOS: запись снимка localStorage в IndexedDB; пустым снимком существующую копию не затираем
  function backupNow(force) {
    clearTimeout(timer); timer = null;
    if (!ls) return Promise.resolve(false);
    var data = snapshot();
    var n = Object.keys(data).length;
    if (!n && !force) return Promise.resolve(false); // не затираем копию пустотой
    var savedAt = Date.now();
    return IDB.put("kv", "snapshot", { savedAt: savedAt, count: n, data: data }).then(function (ok) {
      if (ok) {
        lastBackupAt = savedAt;
        try { origSet.call(ls, STAMP, String(savedAt)); } catch (e) {}
      }
      return !!ok;
    });
  }
  function schedule() {
    if (suspended) return;
    clearTimeout(timer);
    // Правки для iOS (v5): задержка копии 600 → 300 мс — меньше шанс потерять последний ответ при закрытии приложения
    timer = setTimeout(backupNow, 300);
  }
  // Правки для iOS (v5): копия «почти сразу» (в том же цикле событий собираем все записи ответа в одну транзакцию) — вызывается после каждого ответа
  function backupSoon() {
    if (suspended || !ls) return;
    clearTimeout(timer);
    timer = setTimeout(backupNow, 0);
  }
  // Правки для iOS (v5): переполнение localStorage (лимит Safari ~5 МБ: наборы вопросов, черновики редактора) раньше молча
  // обрывало сохранение статистики. Теперь при переполнении удаляем черновики редактора и повторяем запись; если не помогло — предупреждаем.
  var quotaWarned = false;
  function isQuotaError(e) { return e && (e.name === "QuotaExceededError" || e.code === 22 || e.code === 1014 || /quota/i.test(String(e.message || ""))); }
  function freeSpace() {
    var freed = 0;
    try {
      var del = [];
      for (var i = 0; i < ls.length; i++) { var k = ls.key(i); if (k && /^editor:draft:/.test(k)) del.push(k); }
      del.forEach(function (k) { origRemove.call(ls, k); freed++; });
    } catch (e) {}
    return freed;
  }
  function warnQuota() {
    if (quotaWarned) return; quotaWarned = true;
    console.error("[boot] localStorage переполнен — прогресс может не сохраниться");
    setTimeout(function () {
      var msg = "⚠️ Память браузера переполнена — прогресс может не сохраниться. Сохраните копию (💾 Прогресс → Экспорт) и удалите лишние наборы/черновики.";
      if (window.GameApp && window.GameApp.toast) window.GameApp.toast(msg, "err", 8000); else alert(msg);
    }, 300);
  }
  // Правки для iOS: перехват setItem/removeItem/clear: любое изменение прогресса через 0,6 с зеркалируется в IndexedDB — код оригинала менять не нужно
  if (proto && ls) {
    proto.setItem = function (k, v) {
      var r;
      try { r = origSet.call(this, k, v); }
      catch (e) {
        // Правки для iOS (v5): при переполнении — чистим черновики редактора и пробуем ещё раз
        if (this !== ls || !isQuotaError(e) || !freeSpace()) { if (this === ls && isQuotaError(e)) warnQuota(); throw e; }
        try { r = origSet.call(this, k, v); } catch (e2) { warnQuota(); throw e2; }
      }
      if (this === ls && !INTERNAL.test(k)) schedule();
      return r;
    };
    proto.removeItem = function (k) { var r = origRemove.call(this, k); if (this === ls && !INTERNAL.test(k)) schedule(); return r; };
    proto.clear = function () { var r = origClear.call(this); if (this === ls) schedule(); return r; };
  }
  // iOS не присылает beforeunload — сохраняемся при сворачивании/закрытии
  // Правки для iOS: iOS не присылает beforeunload — досохраняем копию при сворачивании (visibilitychange) и закрытии (pagehide)
  // Правки для iOS (v5): раньше копия делалась только если был «отложенный» таймер. Но этот обработчик срабатывает РАНЬШЕ,
  // чем app.js сохраняет сессию при сворачивании, — последняя сессия в копию не попадала. Теперь пишем копию всегда,
  // плюс ещё раз сразу после остальных обработчиков (setTimeout 0).
  function flush() { if (suspended) return; backupNow(); setTimeout(function () { if (timer) backupNow(); }, 0); }
  document.addEventListener("visibilitychange", function () { if (document.visibilityState === "hidden") flush(); });
  window.addEventListener("pagehide", flush);

  // Правки для iOS: если iOS/браузер очистил localStorage (или копия в IndexedDB новее) — восстанавливаем ключи из копии; флаг empty = хранилище полностью пустое (показываем экран «Восстановить из файла»)
  function restoreIfNeeded() {
    if (!ls) return Promise.resolve({ restored: false });
    var localCount0 = Object.keys(snapshot()).length;
    return IDB.get("kv", "snapshot").then(function (snap) {
      // «Пустое хранилище»: нет данных ни в localStorage, ни в резервной копии IndexedDB
      // (типично для file:// в Chrome/Яндексе на iPhone — адрес файла меняется при каждом открытии)
      if (!snap || !snap.data || !Object.keys(snap.data).length) return { restored: false, empty: localCount0 === 0 };
      lastBackupAt = snap.savedAt || 0;
      var localCount = localCount0;
      var localStamp = parseInt(ls.getItem(STAMP) || "0", 10) || 0;
      if (localCount === 0 || (snap.savedAt || 0) > localStamp + 1000) {
        var n = 0;
        Object.keys(snap.data).forEach(function (k) {
          try { if (ls.getItem(k) !== snap.data[k]) { origSet.call(ls, k, snap.data[k]); n++; } } catch (e) {}
        });
        try { origSet.call(ls, STAMP, String(snap.savedAt || Date.now())); } catch (e) {}
        return { restored: n > 0, count: n, localWasEmpty: localCount === 0 };
      }
      return { restored: false };
    });
  }

  /* ---------------- Постоянное хранилище ---------------- */
  // Правки для iOS: просим «постоянное» хранилище (navigator.storage.persist), чтобы Safari не удалял данные через 7 дней без посещений
  var persistState = { supported: !!(navigator.storage && navigator.storage.persist), granted: null };
  function requestPersist() {
    if (!persistState.supported) return Promise.resolve(false);
    return navigator.storage.persisted().then(function (p) {
      if (p) return true;
      return navigator.storage.persist();
    }).then(function (g) { persistState.granted = !!g; return !!g; })
      .catch(function () { return false; });
  }

  /* ---------------- Отдача файлов (скачать / поделиться) ---------------- */
  // Правки для iOS: скачивание через ссылку <a download> — запасной путь, если «Поделиться» недоступно
  function downloadBlob(blob, filename) {
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url; a.download = filename; a.rel = "noopener";
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 60000);
  }
  // Правки для iOS: на iPhone файл отдаётся через Web Share («Поделиться» → «Сохранить в Файлы»); share() требует свежего тапа, поэтому показываем лист с кнопкой
  function deliverFile(blob, filename) {
    var file = null;
    try { file = new File([blob], filename, { type: blob.type || "application/octet-stream" }); } catch (e) {}
    var canShare = !!(file && navigator.canShare && navigator.share && navigator.canShare({ files: [file] }));
    if (!canShare) { downloadBlob(blob, filename); return; }
    // На iPhone: отдельный тап по кнопке = свежий «жест пользователя» для share()
    var old = document.getElementById("iosFileSheet"); if (old) old.remove();
    var el = document.createElement("div");
    el.id = "iosFileSheet"; el.className = "ios-sheet-overlay";
    el.innerHTML =
      '<div class="ios-sheet" role="dialog" aria-modal="true">' +
      '<div class="ios-sheet-title">Файл готов</div>' +
      '<div class="ios-sheet-sub"></div>' +
      '<button class="btn-primary" data-act="share">📤 Поделиться / Сохранить в «Файлы»</button>' +
      '<button class="btn-secondary" data-act="download">⬇️ Скачать</button>' +
      '<button class="btn-secondary" data-act="close">Отмена</button></div>';
    el.querySelector(".ios-sheet-sub").textContent = filename;
    el.addEventListener("click", function (e) {
      var act = e.target && e.target.getAttribute && e.target.getAttribute("data-act");
      if (e.target === el) act = "close";
      if (!act) return;
      if (act === "share") {
        navigator.share({ files: [file], title: filename }).then(function () { el.remove(); })
          .catch(function (err) { if (!err || err.name !== "AbortError") { downloadBlob(blob, filename); el.remove(); } });
      } else if (act === "download") { downloadBlob(blob, filename); el.remove(); }
      else el.remove();
    });
    document.body.appendChild(el);
  }

  // Правки для iOS: общий API хранилища для ios.js (резервная копия, IndexedDB, «сырой» доступ к localStorage без зеркалирования)
  window.IOSStore = {
    IDB: IDB,
    backupNow: backupNow,
    backupSoon: backupSoon, // Правки для iOS (v5): копия сразу после ответа
    suspend: function (v) { suspended = v !== false; if (suspended) { clearTimeout(timer); timer = null; } },
    lastBackupAt: function () { return lastBackupAt; },
    persistState: persistState,
    requestPersist: requestPersist,
    snapshot: snapshot,
    rawSet: function (k, v) { origSet.call(ls, k, v); },
    rawRemove: function (k) { origRemove.call(ls, k); },
    rawClear: function () { origClear.call(ls); },
    lsAvailable: !!ls,
    isSingle: IS_SINGLE
  };
  window.deliverFile = deliverFile;
  window.downloadBlob = downloadBlob;

  /* ---------------- Загрузка модулей ---------------- */
  // Правки для iOS: в 1-файловой версии модули лежат в <script type="text/plain"> и запускаются по очереди отсюда — так нет внешних файлов, которые iOS не может подгрузить при file://
  function runInline(id) {
    var src = document.getElementById(id);
    if (!src) return Promise.resolve();
    var s = document.createElement("script");
    s.textContent = src.textContent + "\n//# sourceURL=" + id + ".js";
    document.body.appendChild(s);
    return Promise.resolve();
  }
  function loadSrc(url, optional) {
    return new Promise(function (resolve) {
      var s = document.createElement("script");
      s.src = url; s.async = false;
      s.onload = function () { resolve(true); };
      s.onerror = function () { if (!optional) console.error("[boot] не загрузился " + url); resolve(false); };
      document.body.appendChild(s);
    });
  }
  // Правки для iOS: строгий порядок загрузки: Chart.js → вопросы → app → gamification → ios (в PWA — отдельные файлы, в 1-файловой — встроенные блоки)
  function loadModules() {
    var list = IS_SINGLE
      ? ["src-chart", "src-questions", "src-app", "src-gamification", "src-ios"]
      : ["vendor/chart.umd.min.js", "questions.js", "app.js", "gamification.js", "ios.js"];
    var p = Promise.resolve();
    // Правки для iOS (v5): questions.js на сайте может отсутствовать (наборы грузятся из sets/ с GitHub) — он необязательный, без ошибки в консоли
    list.forEach(function (item) { p = p.then(function () { return IS_SINGLE ? runInline(item) : loadSrc(item, item === "questions.js"); }); });
    if (!IS_SINGLE) p = p.then(function () { return loadSrc("editor.js", true); }); // необязательный модуль
    return p;
  }

  // Правки для iOS: если пользователь раньше загрузил свой файл вопросов — подхватываем его из IndexedDB до старта приложения
  function prepareBootSet() {
    // Если пользователь раньше загрузил свой файл вопросов — подхватываем его из IndexedDB
    var name = null;
    try { name = ls && ls.getItem("ios:activeSet"); } catch (e) {}
    if (!name) return Promise.resolve();
    return IDB.get("sets", name).then(function (rec) {
      // Правки для iOS (v5): передаём и отображаемое имя набора (ключ в базе — хэш тем)
      if (rec && rec.text) window.__BOOT_SET = { name: rec.name || name, displayName: rec.displayName || rec.name || name, text: rec.text };
    });
  }

  var started = false;
  // Правки для iOS: старт приложения после восстановления прогресса; класс app-ready и событие trainer:ready нужны модулям и тестам
  function go(info) {
    if (started) return; started = true;
    window.__IOS_RESTORE_INFO = info || { restored: false };
    loadModules().then(function () {
      document.documentElement.classList.add("app-ready");
      if (typeof window.syncGamificationUI === "function") window.syncGamificationUI();
      window.dispatchEvent(new Event("trainer:ready"));
    });
  }
  // Правки для iOS: страховка: если IndexedDB не ответила за 4 с — всё равно запускаем приложение
  var safety = setTimeout(function () { go({ restored: false, timeout: true }); }, 4000);
  restoreIfNeeded().catch(function () { return { restored: false }; })
    .then(function (info) { return prepareBootSet().catch(function () {}).then(function () { return info; }); })
    .then(function (info) { clearTimeout(safety); go(info); });
  requestPersist();
})();
// Правки для iOS [конец]: boot.js
