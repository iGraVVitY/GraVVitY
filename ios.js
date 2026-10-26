// Правки для iOS [начало]: ios.js — новый файл (в оригинале его не было). Всё, чего не хватало на iPhone:
// перенос прогресса файлом, автонапоминание о копии, экран восстановления, наборы вопросов в IndexedDB,
// подсказка «На экран Домой», service worker, сборка 1-файловой версии.
/* =========================================================
   iOS-МОДУЛЬ: прогресс (экспорт/импорт), наборы вопросов,
   подсказка «На экран Домой», service worker, сборка 1-файловой версии
   ========================================================= */
(function () {
  "use strict";
  var S = window.IOSStore || {};
  var IDB = S.IDB;
  // Правки для iOS: метка формата файла копии прогресса — по ней импорт отличает «свой» файл (формат совместим с версиями 1–3)
  var EXPORT_APP = "1c-trainer-progress";
  var BACKUP_FILE = "trainer-progress.json";
  // Правки для iOS: номер версии iOS-сборки — виден в окне «💾 Прогресс и данные» (ключи хранения прогресса между версиями не меняются)
  var IOS_VERSION = "4.0";
  var IOS_VERSION_DATE = "25.10.2026";
  window.IOS_TRAINER_VERSION = IOS_VERSION;

  function $id(id) { return document.getElementById(id); }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function fmtTs(ts) { if (!ts) return "никогда"; try { return new Date(+ts).toLocaleString("ru-RU"); } catch (e) { return String(ts); } }
  function isStandalone() { return (window.matchMedia && matchMedia("(display-mode: standalone)").matches) || navigator.standalone === true; }
  function ua() { return navigator.userAgent || ""; }
  function isIOS() { return /iPhone|iPad|iPod/.test(ua()) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1); }
  // Правки для iOS: определяем браузер (Яндекс/Chrome/Safari…) для понятных подсказок пользователю
  function browserName() {
    var u = ua();
    if (/YaBrowser/i.test(u)) return "Яндекс Браузер";
    if (/CriOS/i.test(u)) return "Chrome";
    if (/FxiOS/i.test(u)) return "Firefox";
    if (/EdgiOS/i.test(u)) return "Edge";
    if (/Telegram/i.test(u)) return "Telegram";
    if (/Safari/i.test(u) && !/Chrome|Chromium|Android/i.test(u)) return "Safari";
    return "браузер";
  }
  function setName() { return (window.TestApp && window.TestApp.fileKey) || "questions.js"; }
  // Правки для iOS: уведомления через тосты геймификации (если она не загрузилась — обычный alert)
  function toast(msg, type, ms) {
    if (window.GameApp && window.GameApp.toast) return window.GameApp.toast(msg, type || "ok", ms || 3500);
    alert(msg);
  }

  /* ---------------- Экспорт / импорт прогресса ---------------- */
  function isUserKey(k) { return k && !/^__backup:/.test(k); }
  // Правки для iOS: экспорт прогресса: в оригинале его не было, а на iPhone данные браузера могут пропасть — собираем ВСЕ ключи localStorage в один JSON
  function collectProgress() {
    var keys = {};
    for (var i = 0; i < localStorage.length; i++) {
      var k = localStorage.key(i);
      if (isUserKey(k)) keys[k] = localStorage.getItem(k);
    }
    return {
      app: EXPORT_APP, version: 1,
      exportedAt: new Date().toISOString(),
      activeSet: setName(),
      device: ua(),
      keys: keys
    };
  }
  // Правки для iOS: ручной экспорт: имя файла постоянное (trainer-progress.json) — в «Файлах» новая копия заменяет старую, а не плодит дубликаты
  function exportProgress() {
    var data = collectProgress();
    var blob = new Blob([JSON.stringify(data, null, 1)], { type: "application/json" });
    // Имя постоянное — в «Файлах» новая копия заменяет старую
    window.deliverFile(blob, BACKUP_FILE);
    markBackedUp();
    renderDataModal();
  }
  // Правки для iOS: импорт копии: заменяет localStorage целиком (наборы вопросов в IndexedDB не трогаем), затем перезагрузка; opts.noConfirm — без вопроса (экран восстановления)
  function importProgressText(text, opts) {
    var data;
    try { data = JSON.parse(text); } catch (e) { alert("Это не JSON-файл прогресса: " + e.message); return false; }
    if (!data || data.app !== EXPORT_APP || !data.keys || typeof data.keys !== "object") {
      alert("Файл не похож на экспорт прогресса этого тренажёра."); return false;
    }
    var n = Object.keys(data.keys).length;
    if (!(opts && opts.noConfirm) && !confirm("Импортировать прогресс от " + fmtTs(Date.parse(data.exportedAt)) + "?\n\nЗаписей: " + n + ".\nТекущий прогресс на этом устройстве будет ЗАМЕНЁН.")) return false;
    try {
      // Пользовательские наборы вопросов (в IndexedDB) не трогаем; заменяем только localStorage
      var keep = {};
      ["ios:activeSet"].forEach(function (k) { var v = localStorage.getItem(k); if (v != null) keep[k] = v; });
      var toRemove = [];
      for (var i = 0; i < localStorage.length; i++) { var k = localStorage.key(i); if (isUserKey(k)) toRemove.push(k); }
      toRemove.forEach(function (k) { localStorage.removeItem(k); });
      Object.keys(data.keys).forEach(function (k) { localStorage.setItem(k, String(data.keys[k])); });
      Object.keys(keep).forEach(function (k) { if (!(k in data.keys)) localStorage.setItem(k, keep[k]); });
      // Если активный набор из файла недоступен — вернёмся к встроенному
      var active = localStorage.getItem("ios:activeSet");
      var p = Promise.resolve();
      if (active && IDB) p = IDB.get("sets", active).then(function (rec) { if (!rec) localStorage.removeItem("ios:activeSet"); });
      p.then(function () { return S.backupNow ? S.backupNow(true) : null; }).then(function () {
        alert("Прогресс импортирован (" + n + " записей). Страница перезагрузится.");
        location.reload();
      });
      return true;
    } catch (e) { alert("Ошибка импорта: " + e.message); return false; }
  }
  // Правки для iOS: выбор файла без accept: на iPhone фильтр по расширению делает .js/.json «серыми» и их нельзя выбрать
  function pickFile(cb) {
    // accept не указываем: на iPhone фильтр по расширению часто делает файлы «серыми»
    var input = document.createElement("input");
    input.type = "file";
    input.style.display = "none";
    input.addEventListener("change", function () {
      var f = input.files && input.files[0];
      input.remove();
      if (!f) return;
      var r = new FileReader();
      r.onload = function () { cb(String(r.result), f); };
      r.onerror = function () { alert("Не удалось прочитать файл."); };
      r.readAsText(f, "utf-8");
    });
    document.body.appendChild(input);
    input.click();
  }

  /* ---------------- Наборы вопросов (IndexedDB) ---------------- */
  // Правки для iOS: загруженный файл вопросов запоминается в IndexedDB — после перезапуска не нужно выбирать его снова
function rememberSet(name, text, count, displayName) {
  if (!IDB) return Promise.resolve(false);
  return IDB.put("sets", name, {
    name: name,
    displayName: displayName || name,
    text: text,
    savedAt: Date.now(),
    topics: count || 0
  }).then(function (ok) {
    if (ok) { try { localStorage.setItem("ios:activeSet", name); } catch (e) {} }
    return ok;
  });
}
 window.iosRememberSet = function (name, text, topics) {
    // Ключ — хэш по названиям тем (как в app.js), чтобы совпадал с state.fileKey
    var key = name;
    try {
      if (window.computeFileKey && Array.isArray(topics)) {
        key = window.computeFileKey(topics);
      }
    } catch (e) {}
    // Сохраняем оригинальное имя внутри записи (для отображения пользователю)
    return rememberSet(key, text, Array.isArray(topics) ? topics.length : 0, name);
};
  function activateBuiltIn() {
    try { localStorage.removeItem("ios:activeSet"); } catch (e) {}
    setTimeout(function () { location.reload(); }, 150);
  }
  function activateSet(name) {
    try { localStorage.setItem("ios:activeSet", name); } catch (e) {}
    setTimeout(function () { location.reload(); }, 150);
  }
  // Правки для iOS: загрузка своего файла вопросов из окна «Прогресс и данные»
  function uploadSet() {
    pickFile(function (text, f) {
      var topics;
      try { topics = parseTopicsFromText(text); } catch (e) { alert("Ошибка в файле вопросов: " + e.message); return; }
      if (!Array.isArray(topics) || !topics.length) { alert("В файле нет тем."); return; }
      rememberSet(f.name, text, topics.length).then(function () {
        loadTopics(topics, f.name, f.name);
        if (typeof syncGamificationUI === "function") syncGamificationUI();
        toast("Загружено: " + f.name + " (" + topics.length + " тем). Файл запомнен на устройстве.", "ok", 4000);
        renderDataModal();
      });
    });
  }

  /* ---------------- Окно «Прогресс и данные» ---------------- */
  // Правки для iOS: новое окно «💾 Прогресс и данные»: состояние хранилища, экспорт/импорт, частота автокопии, наборы вопросов
  function ensureDataModal() {
    var m = $id("iosDataModal");
    if (m) return m;
    m = document.createElement("div");
    m.id = "iosDataModal";
    m.className = "modal-overlay";
    m.innerHTML = '<div class="modal-content full-screen"><div class="modal-header"><h2>💾 Прогресс и данные</h2>' +
      '<button class="icon-btn-close" data-ios="close" aria-label="Закрыть">✕</button></div>' +
      '<div class="modal-body" id="iosDataBody"></div></div>';
    m.addEventListener("click", function (e) {
      var t = e.target.closest ? e.target.closest("[data-ios]") : null;
      if (!t) { if (e.target === m) closeDataModal(); return; }
      var act = t.getAttribute("data-ios");
      if (act === "close") closeDataModal();
      else if (act === "export") exportProgress();
      else if (act === "import") pickFile(function (text) { importProgressText(text); });
      else if (act === "persist") S.requestPersist && S.requestPersist().then(renderDataModal);
      else if (act === "upload") uploadSet();
      else if (act === "builtin") activateBuiltIn();
      else if (act === "open") activateSet(t.getAttribute("data-name"));
      else if (act === "delete") {
        var name = t.getAttribute("data-name");
        if (!confirm("Удалить набор «" + name + "» с устройства? Прогресс по нему останется.")) return;
        IDB.del("sets", name).then(function () {
          if (localStorage.getItem("ios:activeSet") === name) activateBuiltIn(); else renderDataModal();
        });
      }
      else if (act === "build") window.iosBuildSingleFile();
    });
    document.body.appendChild(m);
    return m;
  }
  // Правки для iOS: содержимое окна: предупреждения про file:// и вкладку браузера, дата последней копии, настройки автокопии, версия
  function renderDataModal() {
    var body = $id("iosDataBody");
    if (!body) return;
    var proto = location.protocol;
    var standalone = isStandalone();
    var ps = S.persistState || {};
    var lastExp = localStorage.getItem("ios:lastExport");
    var warn = "";
    if (proto === "file:") warn = '<div class="ios-note ios-note-err">⚠️ Страница открыта как файл (file://). В таком режиме iOS-браузеры (особенно Яндекс) могут не сохранять прогресс. Откройте тренажёр по https-ссылке в Safari и добавьте на экран «Домой».</div>';
    else if (isIOS() && !standalone) warn = '<div class="ios-note">ℹ️ Сейчас открыто во вкладке (' + esc(browserName()) + '). Safari может удалить данные сайта, если его не открывать 7 дней. Надёжнее всего — «Поделиться» → «На экран «Домой»» в Safari и запускать с иконки.</div>';
    var active = localStorage.getItem("ios:activeSet");
    body.innerHTML =
      warn +
      '<div class="settings-cell"><div class="cell-head">Состояние хранилища</div>' +
      '<div class="ios-kv"><span>Версия тренажёра</span><b id="iosVersion">iOS ' + IOS_VERSION + ' от ' + IOS_VERSION_DATE + '</b></div>' +
      '<div class="ios-kv"><span>Набор вопросов</span><b>' + esc(setName()) + '</b></div>' +
      '<div class="ios-kv"><span>Режим запуска</span><b>' + (standalone ? "Приложение (экран «Домой») ✅" : esc(browserName()) + " · вкладка") + '</b></div>' +
      '<div class="ios-kv"><span>Протокол</span><b>' + esc(proto.replace(":", "")) + '</b></div>' +
      '<div class="ios-kv"><span>Постоянное хранилище</span><b>' + (ps.granted ? "да ✅" : (ps.supported ? "не выдано" : "не поддерживается")) + '</b></div>' +
      '<div class="ios-kv"><span>Резервная копия (IndexedDB)</span><b>' + fmtTs(S.lastBackupAt && S.lastBackupAt()) + '</b></div>' +
      '<div class="ios-kv"><span>Последняя копия в файл</span><b id="iosLastBackupFile">' + fmtTs(lastExp) + '</b></div>' +
      '<div class="ios-kv"><span>Изменения после копии</span><b>' + (hasProgress() && progressChanged() ? "есть" : "нет") + '</b></div>' +
      (ps.supported && !ps.granted ? '<button class="btn-secondary" data-ios="persist">🔒 Запросить постоянное хранилище</button>' : '') +
      '</div>' +
      '<div class="settings-cell"><div class="cell-head">Перенос прогресса</div>' +
      '<p class="ios-p">Сохраните файл в «Файлы»/iCloud или отправьте себе — по нему можно восстановить весь прогресс (статистика, избранное, XP, достижения, серии, рекорды, боссы) на этом или другом устройстве.</p>' +
      '<button class="btn-primary" data-ios="export">📤 Экспорт прогресса</button>' +
      '<button class="btn-secondary" data-ios="import">📥 Импорт прогресса</button>' +
      '</div>' +
      // Правки для iOS: блок настройки частоты автокопии: после теста / каждые N ответов (5/10/20/50) / раз в день / выключено
      '<div class="settings-cell"><div class="cell-head">Автонапоминание о копии</div>' +
      '<p class="ios-p">iOS не разрешает сайту записывать файлы без нажатия, поэтому тренажёр показывает плашку «Сохранить копию» — один тап, и файл <b>' + BACKUP_FILE + '</b> уходит в «Поделиться» → «Сохранить в Файлы» (заменяет старую копию).</p>' +
      '<label class="ios-field"><span>Когда предлагать</span><select id="iosBackupFreq">' +
        '<option value="test">После каждого теста</option><option value="answers">Каждые N ответов</option>' +
        '<option value="daily">Раз в день</option><option value="off">Выключено</option></select></label>' +
      '<label class="ios-field" id="iosBackupNWrap"><span>N ответов</span><select id="iosBackupN">' +
        '<option value="5">5</option><option value="10">10</option><option value="20">20</option><option value="50">50</option></select></label>' +
      '</div>' +
      '<div class="settings-cell"><div class="cell-head">Наборы вопросов</div>' +
      '<div id="iosSetsList" class="ios-sets"><div class="ios-p">Загрузка…</div></div>' +
      '<button class="btn-secondary" data-ios="upload">📂 Загрузить файл вопросов (.js / .json)</button>' +
      '<button class="btn-secondary" data-ios="build">📱 Собрать 1-файловую версию с текущим набором</button>' +
      '<p class="ios-p">Загруженный файл запоминается на устройстве и открывается автоматически. Прогресс хранится отдельно для каждого набора (по имени файла).</p>' +
      '</div>';
    // Правки для iOS: сохранение выбранной частоты автокопии в localStorage (ключи ios:backupFreq, ios:backupEveryN)
    var fSel = $id("iosBackupFreq"), nSel = $id("iosBackupN"), nWrap = $id("iosBackupNWrap");
    fSel.value = backupFreq(); nSel.value = String(backupN());
    nWrap.style.display = fSel.value === "answers" ? "" : "none";
    fSel.addEventListener("change", function () { localStorage.setItem("ios:backupFreq", fSel.value); localStorage.setItem("ios:answersSincePrompt", "0"); nWrap.style.display = fSel.value === "answers" ? "" : "none"; if (fSel.value === "off") hideBackupBar(); });
    nSel.addEventListener("change", function () { localStorage.setItem("ios:backupEveryN", nSel.value); });
    var list = $id("iosSetsList");
    var rows = ['<div class="ios-set' + (!active ? " active" : "") + '"><div><b>Встроенный (questions.js)</b></div>' +
      (active ? '<button class="ios-mini" data-ios="builtin">Открыть</button>' : '<span class="ios-tag">активен</span>') + '</div>'];
    (IDB ? IDB.all("sets") : Promise.resolve([])).then(function (sets) {
      (sets || []).sort(function (a, b) { return (b.savedAt || 0) - (a.savedAt || 0); }).forEach(function (s) {
        var isA = s.displayName || s.name === active;
        rows.push('<div class="ios-set' + (isA ? " active" : "") + '"><div><b>' + esc(s.name) + '</b><div class="ios-p">тем: ' + (s.topics || "?") + ' · ' + fmtTs(s.savedAt) + '</div></div>' +
          '<div class="ios-set-btns">' + (isA ? '<span class="ios-tag">активен</span>' : '<button class="ios-mini" data-ios="open" data-name="' + esc(s.name) + '">Открыть</button>') +
          '<button class="ios-mini ios-mini-del" data-ios="delete" data-name="' + esc(s.name) + '" aria-label="Удалить">🗑</button></div></div>');
      });
      list.innerHTML = rows.join("");
    });
  }
  function openDataModal() { ensureDataModal(); renderDataModal(); $id("iosDataModal").classList.add("active"); document.body.style.overflow = "hidden"; }
  function closeDataModal() { var m = $id("iosDataModal"); if (m) m.classList.remove("active"); document.body.style.overflow = ""; }
  window.openIosDataModal = openDataModal;
  window.iosExportProgress = exportProgress;
  window.iosImportProgressText = importProgressText;

  // Кнопка на главном экране
  // Правки для iOS: кнопка «💾 Прогресс» на главном экране — вход в экспорт/импорт и наборы
  (function addDashboardButton() {
    var actions = document.querySelector("#mobileDashboard .bottom-actions");
    if (!actions || $id("iosDataBtn")) return;
    var b = document.createElement("button");
    b.id = "iosDataBtn"; b.className = "btn-secondary ios-data-btn"; b.type = "button";
    b.textContent = "💾 Прогресс: экспорт / импорт";
    b.addEventListener("click", openDataModal);
    actions.parentNode.insertBefore(b, actions.nextSibling);
  })();

  // Дополнение окна настроек (вызывается из openMobileSettings)
  // Правки для iOS: в окно настроек оригинала добавляем кнопку «Прогресс и наборы вопросов» (вызов вставлен в openMobileSettings)
  window.iosAugmentSettings = function (body) {
    if (!body || body.querySelector("#iosSettingsDataBtn")) return;
    var b = document.createElement("button");
    b.id = "iosSettingsDataBtn"; b.className = "btn-secondary"; b.type = "button";
    b.style.marginTop = "10px";
    b.textContent = "💾 Прогресс и наборы вопросов";
    b.addEventListener("click", function () { if (typeof closeMobileSettings === "function") closeMobileSettings(); openDataModal(); });
    var save = body.querySelector("#mobSaveSettings");
    if (save) body.insertBefore(b, save); else body.appendChild(b);
  };

  /* ---------------- Автонапоминание о резервной копии ----------------
     iOS не даёт сайту писать файлы без жеста пользователя, поэтому:
     плашка «Сохранить копию» → один тап → Web Share с trainer-progress.json (иначе — скачивание).
     Режимы (ios:backupFreq): test — после каждого теста/экзамена (по умолчанию),
     answers — каждые N ответов (ios:backupEveryN, по умолчанию 10; в экзамене — после завершения),
     daily — раз в день, off — выключено. Во всех режимах, кроме off, плашка показывается и
     при первом открытии за день, если есть несохранённые изменения. */
  // Правки для iOS: какие ключи считаются прогрессом и какие игнорируются при сравнении с последней копией (служебные ios:, ui:, __backup:)
  var PROGRESS_RE = /^(stats:|fav:|session:|sel:|gamification:|stats:activity)/;
  var IGNORE_RE = /^(ios:|ui:|__backup:|gamification:questDate$)/;
  function todayKey() { var d = new Date(); return d.getFullYear() + "-" + (d.getMonth() + 1) + "-" + d.getDate(); }
  function backupFreq() { 
    var v = localStorage.getItem("ios:backupFreq"); 
    // Если это не iOS, по умолчанию ставим "off"
    if (!isIOS() && !v) return "off"; 
    return /^(test|answers|daily|off)$/.test(v || "") ? v : "test"; 
  }


  function backupN() { var n = parseInt(localStorage.getItem("ios:backupEveryN") || "10", 10); return [5, 10, 20, 50].indexOf(n) >= 0 ? n : 10; }
  // Правки для iOS: хэш прогресса: плашку показываем, только если с последней копии что-то изменилось
  function progressHash() {
    var keys = [];
    for (var i = 0; i < localStorage.length; i++) { var k = localStorage.key(i); if (k && !IGNORE_RE.test(k)) keys.push(k); }
    keys.sort();
    var h = 5381, str;
    for (var j = 0; j < keys.length; j++) {
      str = keys[j] + "=" + localStorage.getItem(keys[j]) + ";";
      for (var c = 0; c < str.length; c++) h = ((h * 33) ^ str.charCodeAt(c)) >>> 0;
    }
    return String(h) + ":" + keys.length;
  }
  function hasProgress() {
    for (var i = 0; i < localStorage.length; i++) { var k = localStorage.key(i); if (k && PROGRESS_RE.test(k) && !IGNORE_RE.test(k)) return true; }
    return false;
  }
  function progressChanged() { return progressHash() !== localStorage.getItem("ios:lastExportHash"); }
  // Правки для iOS: отметка «копия сделана»: дата (видна в окне «Прогресс»), хэш, сброс счётчика ответов
  function markBackedUp() {
    try {
      localStorage.setItem("ios:lastExport", String(Date.now()));
      localStorage.setItem("ios:lastExportHash", progressHash());
      localStorage.setItem("ios:answersSincePrompt", "0");
    } catch (e) {}
  }
  // Правки для iOS: в идущем экзамене плашку не показываем — откладываем до экрана результата
  function inRunningExam() {
    try { return typeof isExam === "function" && isExam() && state && state.order && state.order.length && !state.finished; } catch (e) { return false; }
  }
  function testModalOpen() { var m = $id("testModal"); return !!(m && m.classList.contains("active")); }

  // Правки для iOS: один тап «Сохранить копию» → сразу Web Share с trainer-progress.json (вызов внутри тапа — иначе iOS запретит share); нет «Поделиться» → скачивание
  function shareBackupNow() {
    // Вызывается прямо из обработчика тапа — у iOS есть «жест пользователя» для navigator.share
    var data = collectProgress();
    var text = JSON.stringify(data, null, 1);
    var blob = new Blob([text], { type: "application/json" });
    var file = null;
    try { file = new File([blob], BACKUP_FILE, { type: "application/json" }); } catch (e) {}
    var done = function (how) {
      markBackedUp(); hideBackupBar();
      toast("💾 Копия прогресса сохранена" + (how ? " (" + how + ")" : ""), "ok", 3000);
      renderDataModal();
    };
    if (file && navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
      navigator.share({ files: [file], title: BACKUP_FILE }).then(function () { done(); }).catch(function (err) {
        if (err && err.name === "AbortError") return; // пользователь закрыл меню — плашка остаётся
        window.downloadBlob(blob, BACKUP_FILE); done("скачан файл");
      });
    } else {
      window.downloadBlob(blob, BACKUP_FILE); done("скачан файл");
    }
  }

  function hideBackupBar() { var el = $id("iosBackupBar"); if (el) el.remove(); }
  // Правки для iOS: плашка «Сохранить копию»: во время теста встраивается над вопросом (не перекрывает варианты и «Далее»), вне теста — внизу экрана
  function showBackupBar(reason) {
    hideBackupBar();
    var ib = $id("iosInstallBanner"); if (ib) ib.remove();
    var last = localStorage.getItem("ios:lastExport");
    var el = document.createElement("div");
    el.id = "iosBackupBar";
    el.setAttribute("data-reason", reason || "");
    el.innerHTML =
      '<div class="ios-backup-text"><b>💾 Сохранить копию прогресса?</b><span>Последняя копия: ' + esc(fmtTs(last)) + '</span></div>' +
      '<div class="ios-backup-btns">' +
      '<button type="button" class="btn-primary" data-bk="save">Сохранить копию</button>' +
      '<button type="button" class="ios-mini" data-bk="later">Позже</button>' +
      '<button type="button" class="ios-mini" data-bk="settings" aria-label="Настройка частоты">⚙︎</button></div>';
    el.addEventListener("click", function (e) {
      var t = e.target.closest ? e.target.closest("[data-bk]") : null; if (!t) return;
      var a = t.getAttribute("data-bk");
      if (a === "save") shareBackupNow();
      else if (a === "later") { try { localStorage.setItem("ios:answersSincePrompt", "0"); } catch (x) {} hideBackupBar(); }
      else if (a === "settings") { hideBackupBar(); openDataModal(); var f = $id("iosBackupFreq"); if (f && f.scrollIntoView) f.scrollIntoView({ block: "center" }); }
    });
    // Во время теста — встраиваем в поток над вопросом (ничего не перекрывает), иначе — плашка снизу
    var mq = $id("mobileQuiz");
    if (testModalOpen() && mq) { el.className = "ios-backup-bar inline"; mq.insertBefore(el, mq.firstChild); mq.scrollTop = 0; }
    else { el.className = "ios-backup-bar floating"; document.body.appendChild(el); }
    try { localStorage.setItem("ios:answersSincePrompt", "0"); } catch (x) {}
  }
  var finalPromptSig = null;
  // Правки для iOS: решаем, показывать ли плашку: по завершении теста, после N ответов, при первом открытии за день — и только при несохранённых изменениях
  function maybePromptBackup(reason) {
    var f = backupFreq();
    if (f === "off" || !hasProgress() || !progressChanged() || $id("iosRestoreScreen")) return false;
    if (reason === "final") {
      var sig = progressHash(); if (sig === finalPromptSig) return false; // повторный render финала — не дёргаем
      finalPromptSig = sig;
      if (f === "daily") { var le = +(localStorage.getItem("ios:lastExport") || 0); if (le && new Date(le).toDateString() === new Date().toDateString()) return false; }
      if (f === "answers" && localStorage.getItem("ios:backupPending") !== "1" && +(localStorage.getItem("ios:answersSincePrompt") || 0) < 1) return false;
    } else if (reason === "answers") {
      if (f !== "answers") return false;
    } else if (reason === "startup") {
      if (localStorage.getItem("ios:backupPromptDay") === todayKey()) return false;
      localStorage.setItem("ios:backupPromptDay", todayKey());
    }
    try { localStorage.removeItem("ios:backupPending"); } catch (e) {}
    showBackupBar(reason);
    return true;
  }
  // Правки для iOS: режим «каждые N ответов»: считаем ответы с последней копии; в экзамене ставим отложенный запрос (ios:backupPending)
  function onAnswerForBackup() {
    if (backupFreq() !== "answers") return;
    var n = +(localStorage.getItem("ios:answersSincePrompt") || 0) + 1;
    localStorage.setItem("ios:answersSincePrompt", String(n));
    if (n < backupN() || $id("iosBackupBar")) return;
    if (inRunningExam()) { localStorage.setItem("ios:backupPending", "1"); return; } // в экзамене — после завершения
    setTimeout(function () { maybePromptBackup("answers"); }, 50);
  }

  /* ---------- Экран «Восстановить прогресс» при пустом хранилище ---------- */
  // Правки для iOS: экран «Восстановить прогресс»: хранилище пустое (новый телефон/браузер, Яндекс «забыл» данные file://) — выбрать файл копии или начать заново
  function showRestoreScreen() {
    var el = document.createElement("div");
    el.id = "iosRestoreScreen";
    el.innerHTML =
      '<div class="ios-restore-card"><div style="font-size:46px">📂</div>' +
      '<h2>Восстановить прогресс?</h2>' +
      '<p>Сохранённого прогресса на этом устройстве (в этом браузере) не найдено. Если у вас есть копия <b>' + BACKUP_FILE + '</b> — выберите её, и статистика, XP, серии и достижения вернутся.</p>' +
      '<button type="button" class="btn-primary" data-rs="pick">📥 Выбрать файл копии</button>' +
      '<button type="button" class="btn-secondary" data-rs="fresh">Начать заново</button>' +
      '<p class="ios-p" id="iosRestoreStatus"></p></div>';
    el.addEventListener("click", function (e) {
      var t = e.target.closest ? e.target.closest("[data-rs]") : null; if (!t) return;
      if (t.getAttribute("data-rs") === "fresh") { try { localStorage.setItem("ios:freshStart", String(Date.now())); } catch (x) {} el.remove(); }
      else pickFile(function (text) {
        var ok = importProgressText(text, { noConfirm: true });
        if (!ok) $id("iosRestoreStatus").textContent = "Не удалось импортировать этот файл. Выберите trainer-progress.json.";
      });
    });
    document.body.appendChild(el);
  }

  // Правки для iOS: подключение автокопии: обёртки над renderFinal (финал теста/экзамена) и closeTestModal (перенос плашки вниз), экран восстановления, проверка при запуске
  function initAutoBackup() {
    // финал теста / экзамена / боя с боссом
    if (typeof window.renderFinal === "function" && !window.renderFinal.__ios) {
      var rf = window.renderFinal;
      window.renderFinal = function () {
        var r = rf.apply(this, arguments);
        setTimeout(function () { maybePromptBackup("final"); }, 400);
        return r;
      };
      window.renderFinal.__ios = true;
    }
    // плашка в тесте встроена в окно теста — при закрытии переносим вниз экрана
    if (typeof window.closeTestModal === "function" && !window.closeTestModal.__ios) {
      var ct = window.closeTestModal;
      window.closeTestModal = function () {
        var had = $id("iosBackupBar"); var reason = had && had.getAttribute("data-reason");
        var r = ct.apply(this, arguments);
        if (had) { hideBackupBar(); showBackupBar(reason); }
        return r;
      };
      window.closeTestModal.__ios = true;
    }
    var info = window.__IOS_RESTORE_INFO || {};
    if (info.empty) { showRestoreScreen(); return; }
    setTimeout(function () { maybePromptBackup("startup"); }, 1200);
  }
  window.iosBackup = { prompt: maybePromptBackup, share: shareBackupNow, changed: progressChanged, hash: progressHash, file: BACKUP_FILE };

  /* ---------------- Подсказка «Установить на экран Домой» ---------------- */
  // Правки для iOS: ненавязчивый баннер «На экран Домой» вместо confirm() оригинала, который на iPhone всплывал при каждом открытии
  function showInstallBanner() {
    if (isStandalone()) return;
    var dismissed = +(localStorage.getItem("ios:installBannerDismissed") || 0);
    if (Date.now() - dismissed < 3 * 24 * 3600 * 1000) return;
    var proto = location.protocol, html = "";
    var bn = browserName();
    if (proto === "file:") {
      html = "<b>Открыто как файл.</b> Прогресс может не сохраниться. Откройте тренажёр по <b>https-ссылке в Safari</b> и добавьте на экран «Домой».";
    } else if (!isIOS()) {
      return;
    } else if (bn === "Safari") {
      html = "Установите тренажёр: нажмите <b>Поделиться</b> <span class='ios-share-ico'>⬆︎</span> → <b>«На экран «Домой»»</b>. Так прогресс хранится надёжно и работает без интернета.";
    } else {
      html = "Вы в браузере «" + esc(bn) + "». Для надёжного сохранения прогресса <b>откройте эту ссылку в Safari</b> и добавьте на экран «Домой» (Поделиться → «На экран «Домой»»).";
    }
    var el = document.createElement("div");
    el.id = "iosInstallBanner"; el.className = "ios-install-banner";
    el.innerHTML = '<div class="ios-install-text">' + html + '</div><button type="button" aria-label="Закрыть">✕</button>';
    el.querySelector("button").addEventListener("click", function () {
      try { localStorage.setItem("ios:installBannerDismissed", String(Date.now())); } catch (e) {}
      el.remove();
    });
    document.body.appendChild(el);
  }

  /* ---------------- Service worker ---------------- */
  // Правки для iOS: регистрация service worker (только PWA по http/https) и баннер «Доступна новая версия»
  function registerSW() {
    if (!("serviceWorker" in navigator) || !/^https?:$/.test(location.protocol) || S.isSingle) return;
    var hadController = !!navigator.serviceWorker.controller;
    navigator.serviceWorker.register("sw.js").then(function (reg) {
      window.__swReg = reg;
      if (reg.update) setInterval(function () { reg.update().catch(function () {}); }, 60 * 60 * 1000);
    }).catch(function (e) { console.warn("[sw] register failed", e); });
    navigator.serviceWorker.addEventListener("controllerchange", function () {
      if (!hadController) { hadController = true; return; }
      var el = document.createElement("div");
      el.className = "ios-install-banner ios-update";
      el.innerHTML = '<div class="ios-install-text">Доступна новая версия тренажёра.</div><button type="button" class="ios-mini">Обновить</button>';
      el.querySelector("button").addEventListener("click", function () { location.reload(); });
      document.body.appendChild(el);
    });
  }

  /* ---------------- Сборка 1-файловой версии с текущим набором ---------------- */
  // Правки для iOS: «Собрать 1-файловую версию»: в оригинале требовалось выбрать gamification.js/editor.js (на iPhone невозможно) — теперь берём готовый шаблон и подставляем текущие вопросы
  window.iosBuildSingleFile = function () {
    if (!window.TestApp || !state || !state.topics || !state.topics.length) { alert("Сначала загрузите вопросы."); return; }
    var getTemplate = window.__PRISTINE_HTML
      ? Promise.resolve(window.__PRISTINE_HTML)
      : fetch("single/trainer.html", { cache: "no-cache" }).then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status); return r.text(); });
    getTemplate.then(function (tpl) {
      var a = tpl.indexOf("/*__QUESTIONS_START__*/"), b = tpl.indexOf("/*__QUESTIONS_END__*/");
      if (a < 0 || b < 0) throw new Error("шаблон повреждён");
      var json = JSON.stringify(state.topics).replace(/<\//g, "<\\/").replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029");
      var html = tpl.slice(0, a) + "/*__QUESTIONS_START__*/\nconst TOPICS = " + json + ";\n" + tpl.slice(b);
      var base = String(setName()).replace(/\.(js|json|txt)$/i, "").replace(/[^\wА-Яа-яЁё.-]+/g, "_");
      window.deliverFile(new Blob([html], { type: "text/html" }), "trainer_" + base + ".html");
    }).catch(function (e) {
      alert("Не удалось собрать файл: " + e.message + (location.protocol === "file:" ? "\n(Откройте тренажёр через http/https.)" : ""));
    });
  };

  /* ---------------- Прочее ---------------- */
  // Синхронизация мобильной шапки после каждого ответа (в оригинале обёртка ставилась до загрузки GameApp)
  // Правки для iOS: в оригинале обёртка onAnswer ставилась до загрузки GameApp и не работала — мобильная шапка (XP, серия) не обновлялась после ответа; здесь же счётчик для автокопии
  if (window.GameApp && window.GameApp.onAnswer && !window.GameApp.__iosWrapped) {
    var orig = window.GameApp.onAnswer;
    window.GameApp.onAnswer = function () { var r = orig.apply(this, arguments); if (typeof syncGamificationUI === "function") syncGamificationUI(); try { onAnswerForBackup(); } catch (e) { console.warn(e); } return r; };
    window.GameApp.__iosWrapped = true;
  }
  // Сообщение, если прогресс был восстановлен из резервной копии
  // Правки для iOS: сообщаем пользователю, что прогресс восстановлен из резервной копии IndexedDB
  var info = window.__IOS_RESTORE_INFO;
  if (info && info.restored) setTimeout(function () { toast("♻️ Прогресс восстановлен из резервной копии (" + info.count + " записей)", "ok", 5000); }, 800);

  // Правки для iOS: запуск автокопии; баннер установки не показываем поверх плашки или экрана восстановления
  initAutoBackup();
  setTimeout(function () { if (!$id("iosBackupBar") && !$id("iosRestoreScreen")) showInstallBanner(); }, 1500);
  registerSW();
})();
// Правки для iOS [конец]: ios.js
