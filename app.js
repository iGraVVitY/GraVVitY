
/* =========================================================
   SHA-1 и ключ набора (по названиям тем)
   ========================================================= */
function sha1(str) {
  function rotl(n, s) { return (n << s) | (n >>> (32 - s)); }
  function toHex(n) { return ("00000000" + n.toString(16)).slice(-8); }
  const utf8 = unescape(encodeURIComponent(String(str)));
  const words = [];
  for (let i = 0; i < utf8.length * 8; i += 8) {
    words[i >> 5] = (words[i >> 5] || 0) | (utf8.charCodeAt(i / 8) << (24 - i % 32));
  }
  const bitLen = utf8.length * 8;
  words[bitLen >> 5] = (words[bitLen >> 5] || 0) | (0x80 << (24 - bitLen % 32));
  words[((bitLen + 64 >> 9) << 4) + 15] = bitLen;
  let H0 = 0x67452301, H1 = 0xEFCDAB89, H2 = 0x98BADCFE, H3 = 0x10325476, H4 = 0xC3D2E1F0;
  const K = [0x5A827999, 0x6ED9EBA1, 0x8F1BBCDC, 0xCA62C1D6];
  for (let i = 0; i < words.length; i += 16) {
    const W = [];
    for (let j = 0; j < 16; j++) W[j] = words[i + j] | 0;
    for (let j = 16; j < 80; j++) W[j] = rotl(W[j - 3] ^ W[j - 8] ^ W[j - 14] ^ W[j - 16], 1);
    let A = H0, B = H1, C = H2, D = H3, E = H4;
    for (let j = 0; j < 80; j++) {
      let F, k;
      if (j < 20) { F = (B & C) | (~B & D); k = K[0]; }
      else if (j < 40) { F = B ^ C ^ D; k = K[1]; }
      else if (j < 60) { F = (B & C) | (B & D) | (C & D); k = K[2]; }
      else { F = B ^ C ^ D; k = K[3]; }
      const tmp = (rotl(A, 5) + F + E + k + W[j]) | 0;
      E = D; D = C; C = rotl(B, 30); B = A; A = tmp;
    }
    H0 = (H0 + A) | 0; H1 = (H1 + B) | 0; H2 = (H2 + C) | 0; H3 = (H3 + D) | 0; H4 = (H4 + E) | 0;
  }
  return toHex(H0) + toHex(H1) + toHex(H2) + toHex(H3) + toHex(H4);
}

// Ключ набора — по отсортированным названиям тем
function computeFileKey(topics) {
  if (!Array.isArray(topics) || topics.length === 0) return "h:empty";
  const titles = topics.map(t => String(t.title || "")).sort();
  return "h:" + sha1(titles.join("|")).slice(0, 16);
}


/* =========================================================
   НАСТРОЙКИ
   ========================================================= */
const CONFIG = {
  mode: "training",
  shuffleQuestions: false,
  shuffleAnswers: true,
  showVerdict: true,
  autoAdvanceAfterCorrect: true,
  autoAdvanceDelayMs: 1000,
  showImages: true,
};

const state = {
  topics: [],
  selectedTopicIds: new Set(),
  order: [],
  optionOrders: {},
  answers: {},
  current: 0,
  finished: false,
  showingReview: false,
  showingTop: false,
  _autoAdvanceTimer: null,
  fileKey: "",
  favorites: new Set(),
  stats: {},
  reviewFilterErrors: false,
};

/* =========================================================
   МЕНЕДЖЕР СЛОЕВ (Z-INDEX МАТЕМАТИКА)
   ========================================================= */
let globalZIndex = 2000; // Базовый уровень для всех модалок

// Функция, которая "поднимает" модалку наверх
function bringToFront(element) {
  if (!element) return;
  globalZIndex++;
  element.style.zIndex = globalZIndex;
}

// Отслеживаем открытие любых модалок
const observer = new MutationObserver((mutations) => {
  mutations.forEach((mutation) => {
    if (mutation.type === 'attributes' && mutation.attributeName === 'class') {
      const el = mutation.target;
      // Если элементу добавили класс 'active' (модалка открылась)
      if (el.classList.contains('modal-overlay') && el.classList.contains('active')) {
        bringToFront(el);
      }
    }
  });
});

// Наблюдаем за изменениями класса у всех модалок
document.querySelectorAll('.modal-overlay').forEach(el => {
  observer.observe(el, { attributes: true });
});

const BOSS_FINAL_NAMES = [
  "Ошибка Транзакции", "Правки В Закрытом Периоде", "Павший Сервер",
  "Отвалившаяся Хран", "Нагрузочный Тест", "Несошедшийся Баланс",
  "{Объект Не Найден}", "Кривой RLS", "Твой Стажер", "Сгнивший Бэкап",
  "Звонок Из Бухгалтерии", "Расчет Себестоимости"
];

// Наборы иконок
const BOSS_ICONS = ["🐉", "👹", "👾", "💀", "🤖", "👻", "🧟", "🦑", "🐙", "🦂", "🐺", "🦁", "🐻", "🐲", "🔮", "☠️", "🦇", "🕷️"];

// НОВОЕ: Наборы скинов (цветовые схемы)
const BOSS_SKINS = [
  { name: "Огненный", color: "#e53e3e", bg: "rgba(229, 62, 62, 0.1)", glow: "rgba(229, 62, 62, 0.4)" },
  { name: "Ледяной", color: "#3182ce", bg: "rgba(49, 130, 206, 0.1)", glow: "rgba(49, 130, 206, 0.4)" },
  { name: "Ядовитый", color: "#38a169", bg: "rgba(56, 161, 105, 0.1)", glow: "rgba(56, 161, 105, 0.4)" },
  { name: "Теневой", color: "#805ad5", bg: "rgba(128, 90, 213, 0.1)", glow: "rgba(128, 90, 213, 0.4)" },
  { name: "Золотой", color: "#d69e2e", bg: "rgba(214, 158, 46, 0.1)", glow: "rgba(214, 158, 46, 0.4)" }
];

function getRandomBossIcon() {
  return BOSS_ICONS[Math.floor(Math.random() * BOSS_ICONS.length)];
}

// НОВОЕ: Получить случайный скин
function getRandomBossSkin() {
  return BOSS_SKINS[Math.floor(Math.random() * BOSS_SKINS.length)];
}


const $ = (s) => document.querySelector(s);
const quizEl = $("#quiz");
const counterEl = $("#counter");
const progressEl = $("#progressFill");
const topicsListEl = $("#topicsList");
const titleEl = $("#title");
const subtitleEl = $("#subtitle");
const topicsSummaryEl = $("#topicsSummary");
const modeSelect = $("#modeSelect");
const fileInput = $("#fileInput");
const fileStatus = $("#fileStatus");
const settingsPanel = $("#settingsPanel");
const settingsToggle = $("#settingsToggle");
const favCountEl = $("#favCount");
const errCountEl = $("#errCount");
const lightboxEl = $("#lightbox");
const lightboxImg = $("#lightboxImg");
const exportBtn = $("#exportBtn");
const exportStatus = $("#exportStatus");
const exportProgress = $("#exportProgress");

const skinSelect = $("#skinSelect");
const skinLoadBtn = $("#skinLoadBtn");
const skinLoadMultipleBtn = $("#skinLoadMultipleBtn");
const skinResetBtn = $("#skinResetBtn");
const skinFileInput = $("#skinFileInput");

/* =========================================================
   УТИЛИТЫ
   ========================================================= */
// Утилита для получения даты в формате YYYY-MM-DD (не зависит от локали)
function getTodayDateStr() {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[c]));
}
function isTraining() { return CONFIG.mode === "training"; }
function isLearning() { return CONFIG.mode === "learning"; }
function isExam()     { return CONFIG.mode === "exam"; }
function qKey(item) { return item._topicId + ":" + item.id; }
function clearAutoAdvance() {
  if (state._autoAdvanceTimer) {
    clearTimeout(state._autoAdvanceTimer);
    state._autoAdvanceTimer = null;
  }
}

/* =========================================================
   ЛАЙТБОКС
   ========================================================= */
function openLightbox(src) {
  if (!src) return;
  lightboxImg.src = src;
  lightboxEl.classList.add("open");
}

function refreshTopicCompletion() {
  if (!state.topics || state.topics.length === 0) return;
  const labels = topicsListEl.querySelectorAll("label");
  labels.forEach(label => {
    const cb = label.querySelector("input[type=checkbox]");
    if (!cb) return;
    const topic = state.topics.find(t => t.id === cb.value);
    if (!topic) return;
    if (isTopicCompleted(topic)) {
      label.classList.add("topic-completed");
      label.title = "Все вопросы этой темы хотя бы раз отвечены правильно";
    } else {
      label.classList.remove("topic-completed");
      label.title = "";
    }
  });
}

function closeLightbox() {
  lightboxEl.classList.remove("open");
  lightboxImg.src = "";
}
lightboxEl.addEventListener("click", closeLightbox);
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && lightboxEl.classList.contains("open")) closeLightbox();
});

/* =========================================================
   СКИНЫ
   ========================================================= */
const SKIN_KEY_PREFIX = "skins:";
const ACTIVE_SKIN_KEY = "ui:skin";

function applySkin(name) {
  const styleId = "user-skin-style";
  let styleEl = document.getElementById(styleId);
  if (name === "default" || !name) {
    if (styleEl) styleEl.remove();
    try { localStorage.setItem(ACTIVE_SKIN_KEY, "default"); } catch (e) {}
    return;
  }
  const css = localStorage.getItem(SKIN_KEY_PREFIX + name);
  if (!css) {
    if (styleEl) styleEl.remove();
    try { localStorage.setItem(ACTIVE_SKIN_KEY, "default"); } catch (e) {}
    return;
  }
  if (!styleEl) {
    styleEl = document.createElement("style");
    styleEl.id = styleId;
    document.head.appendChild(styleEl);
  }
  styleEl.textContent = css;
  try { localStorage.setItem(ACTIVE_SKIN_KEY, name); } catch (e) {}
}

function listSkins() {
  const list = ["default"];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(SKIN_KEY_PREFIX)) {
        list.push(k.slice(SKIN_KEY_PREFIX.length));
      }
    }
  } catch (e) {}
  return list;
}

function rebuildSkinSelect() {
  const current = (() => {
    try { return localStorage.getItem(ACTIVE_SKIN_KEY) || "default"; } catch (e) { return "default"; }
  })();
  const list = listSkins();
  skinSelect.innerHTML = "";
  list.forEach(name => {
    const opt = document.createElement("option");
    opt.value = name;
    opt.textContent = name === "default" ? "По умолчанию" : name;
    skinSelect.appendChild(opt);
  });
  if (list.includes(current)) {
    skinSelect.value = current;
  } else {
    skinSelect.value = "default";
    applySkin("default");
  }
}

function loadSkinFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const css = String(reader.result);
      const name = file.name.replace(/\.css$/i, "");
      try {
        localStorage.setItem(SKIN_KEY_PREFIX + name, css);
        resolve(name);
      } catch (e) {
        reject(e);
      }
    };
    reader.onerror = () => reject(new Error("Не удалось прочитать файл"));
    reader.readAsText(file, "utf-8");
  });
}

skinLoadBtn.addEventListener("click", () => {
  skinFileInput.multiple = false;
  skinFileInput.value = "";
  skinFileInput.click();
});
skinLoadMultipleBtn.addEventListener("click", () => {
  skinFileInput.multiple = true;
  skinFileInput.value = "";
  skinFileInput.click();
});

skinFileInput.addEventListener("change", async (e) => {
  const files = [...(e.target.files || [])];
  if (files.length === 0) return;
  const loadedNames = [];
  for (const f of files) {
    try {
      const name = await loadSkinFile(f);
      loadedNames.push(name);
    } catch (err) {
      alert("Не удалось загрузить скин «" + f.name + "»: " + err.message);
    }
  }
  if (loadedNames.length > 0) {
    rebuildSkinSelect();
    applySkin(loadedNames[loadedNames.length - 1]);
    skinSelect.value = loadedNames[loadedNames.length - 1];
    alert("Загружено скинов: " + loadedNames.length + ".\nПрименён: " + loadedNames[loadedNames.length - 1]);
  }
});

skinResetBtn.addEventListener("click", () => {
  if (!confirm("Удалить все загруженные скины? Внешний вид вернётся к «По умолчанию».")) return;
  const toDelete = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(SKIN_KEY_PREFIX)) toDelete.push(k);
    }
  } catch (e) {}
  toDelete.forEach(k => { try { localStorage.removeItem(k); } catch (e) {} });
  try { localStorage.removeItem(ACTIVE_SKIN_KEY); } catch (e) {}
  rebuildSkinSelect();
  applySkin("default");
});

skinSelect.addEventListener("change", (e) => {
  applySkin(e.target.value);
});

/* =========================================================
   ЛОКАЛЬНОЕ ХРАНИЛИЩЕ
   ========================================================= */
function loadLocal() {
  const fk = state.fileKey;
  if (!fk) return;
  try {
    const favRaw = localStorage.getItem("fav:" + fk);
    state.favorites = new Set(favRaw ? JSON.parse(favRaw) : []);
  } catch (e) { state.favorites = new Set(); }
  try {
    const stRaw = localStorage.getItem("stats:" + fk);
    state.stats = stRaw ? JSON.parse(stRaw) : {};
  } catch (e) { state.stats = {}; }
}
function saveFavorites() {
  if (!state.fileKey) return;
  try { localStorage.setItem("fav:" + state.fileKey, JSON.stringify([...state.favorites])); } catch (e) {}
}
function saveStats() {
  if (!state.fileKey) return;
  try { localStorage.setItem("stats:" + state.fileKey, JSON.stringify(state.stats)); } catch (e) {}
}

/* =========================================================
   СЕССИЯ — сохранение и восстановление прогресса
   ========================================================= */
const SESSION_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;  // 30 дней

function sessionKey() {
  return "session:" + (state.fileKey || "default");
}

function saveSession() {
  if (!state.fileKey) return;
  if (state.topics.length === 0) return;
  try {
    const orderIds = state.order.map(item => [item._topicId, item.id]);
    const optionOrders = {};
    state.order.forEach(item => {
      const key = item._topicId + ":" + item.id;
      optionOrders[key] = state.optionOrders[item.id] || [];
    });
    const answers = {};
    state.order.forEach(item => {
      const key = item._topicId + ":" + item.id;
      if (state.answers[item.id] !== undefined) {
        answers[key] = state.answers[item.id];
      }
    });
    const payload = {
      ts: Date.now(),
      fileKey: state.fileKey,
      orderIds,
      optionOrders,
      answers,
      current: state.current,
      finished: state.finished,
      showingReview: state.showingReview,
      showingTop: state.showingTop,
      mode: CONFIG.mode,
      shuffleQ: $("#shuffleQ").checked,
      shuffleA: $("#shuffleA").checked,
      autoAdvance: $("#autoAdvance").checked,
      showImages: $("#showImages").checked,
    };
    localStorage.setItem(sessionKey(), JSON.stringify(payload));
  } catch (e) {
    console.warn("[session] Не удалось сохранить:", e);
  }
}

function readSession() {
  if (!state.fileKey) return null;
  try {
    const raw = localStorage.getItem(sessionKey());
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data || !Array.isArray(data.orderIds)) return null;
    if (Date.now() - (data.ts || 0) > SESSION_MAX_AGE_MS) {
      // устарела — удаляем
      localStorage.removeItem(sessionKey());
      return null;
    }
    return data;
  } catch (e) {
    return null;
  }
}

function clearSession() {
  if (!state.fileKey) return;
  try { localStorage.removeItem(sessionKey()); } catch (e) {}
}

function formatSessionTs(ts) {
  const d = new Date(ts);
  const p = (n) => String(n).padStart(2, "0");
  return p(d.getDate()) + "." + p(d.getMonth() + 1) + "." + d.getFullYear()
       + ", " + p(d.getHours()) + ":" + p(d.getMinutes());
}

/**
 * Пытается восстановить сессию. Возвращает true, если восстановление удалось.
 * Не трогает DOM напрямую — только state и настройки.
 */
function applySession(data) {
  // 1) Настройки
  CONFIG.mode = data.mode || "training";
  CONFIG.autoAdvanceAfterCorrect = data.autoAdvance !== false;
  CONFIG.showImages = data.showImages !== false;

  // 2) Собираем актуальные объекты вопросов по (topicId, qid)
  const byKey = new Map();
  getAllQuestionsFlat().forEach(q => {
    byKey.set(q._topicId + ":" + q.id, q);
  });

  const order = [];
  const missing = [];
  data.orderIds.forEach(([topicId, qid]) => {
    const key = topicId + ":" + qid;
    const q = byKey.get(key);
    if (q) order.push(q);
    else missing.push(key);
  });

  if (order.length === 0) {
    console.warn("[session] Ни один вопрос из сессии не найден в текущем файле.");
    return false;
  }
  if (missing.length > 0) {
    console.warn("[session] Не найдены вопросы:", missing);
  }

  // 3) optionOrders
  const optionOrders = {};
  order.forEach(q => {
    const key = q._topicId + ":" + q.id;
    const saved = data.optionOrders && data.optionOrders[key];
    if (Array.isArray(saved) && saved.length === q.options.length) {
      // проверим, что это валидная перестановка
      const sorted = [...saved].sort((a, b) => a - b);
      const valid = sorted.every((v, i) => v === i);
      optionOrders[q.id] = valid ? saved : q.options.map((_, i) => i);
    } else {
      optionOrders[q.id] = q.options.map((_, i) => i);
    }
  });

  // 4) answers
  const answers = {};
  order.forEach(q => {
    const key = q._topicId + ":" + q.id;
    const a = data.answers && data.answers[key];
    if (a !== undefined) answers[q.id] = a;
  });

  // 5) Состояние
  state.order = order;
  state.optionOrders = optionOrders;
  state.answers = answers;
  state.current = Math.min(Math.max(0, data.current | 0), Math.max(0, order.length - 1));
  state.finished = !!data.finished;
  state.showingReview = !!data.showingReview;
  state.showingTop = !!data.showingTop;

  // 6) Обновляем UI настроек
  modeSelect.value = CONFIG.mode;
  $("#shuffleQ").checked = data.shuffleQ !== false ? !!data.shuffleQ : false;
  $("#shuffleA").checked = data.shuffleA !== false ? !!data.shuffleA : true;
  $("#autoAdvance").checked = CONFIG.autoAdvanceAfterCorrect;
  $("#showImages").checked = CONFIG.showImages;

  return true;
}

function saveSelectedTopics() {
  if (!state.fileKey) return;
  try {
    localStorage.setItem("sel:" + state.fileKey, JSON.stringify([...state.selectedTopicIds]));
  } catch (e) {}
}
function loadSelectedTopics() {
  if (!state.fileKey) return null;
  try {
    const raw = localStorage.getItem("sel:" + state.fileKey);
    if (!raw) return null;
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return null;
    return arr;
  } catch (e) {
    return null;
  }
}

function isTopicCompleted(topic) {
  const qs = topic.questions || [];
  if (qs.length === 0) return false;
  return qs.every(q => {
    const k = topic.id + ":" + q.id;
    const s = state.stats[k];
    return s && s.ok > 0;
  });
}

function getStat(item) {
  return state.stats[qKey(item)] || { ok: 0, err: 0 };
}
function bumpStat(item, isCorrect) {
  const k = qKey(item);
  const s = state.stats[k] || { ok: 0, err: 0, okStreak: 0 };
  s.lastDate = Date.now();
  
  if (isCorrect) {
    s.ok++;
    s.okStreak = (s.okStreak || 0) + 1;
    // Если серия из 3+ правильных ответов, сбрасываем активные ошибки
    if (s.okStreak >= 3) {
      s.err = 0;
    }
  } else {
    s.err++;
    s.okStreak = 0; // При ошибке серия сбрасывается
  }
  
  state.stats[k] = s;
  saveStats();
}
function clearErrFor(item) {
  const k = qKey(item);
  const s = state.stats[k];
  if (!s) return;
  s.err = 0;
  state.stats[k] = s;
  saveStats();
}
function toggleFavorite(item) {
  const k = qKey(item);
  if (state.favorites.has(k)) state.favorites.delete(k);
  else state.favorites.add(k);
  saveFavorites();
  updateSpecialCounts();
}

/* =========================================================
   ПОДСЧЁТ
   ========================================================= */
function getAllQuestionsFlat() {
  const result = [];
  state.topics.forEach(t => {
    t.questions.forEach(q => {
      result.push({ ...q, _topicId: t.id, _topicTitle: t.title });
    });
  });
  return result;
}
function countFavorites() {
  return getAllQuestionsFlat().filter(q => state.favorites.has(qKey(q))).length;
}
function countErrors() {
  // Теперь ошибочным считается вопрос, где err > 0 (но bumpStat уже обнулит err, если серия 3+)
  return getAllQuestionsFlat().filter(q => getStat(q).err > 0).length;
}
function updateSpecialCounts() {
  favCountEl.textContent = countFavorites();
  errCountEl.textContent = countErrors();
}

/* =========================================================
   ПАРСИНГ
   ========================================================= */
function parseTopicsFromText(text) {
  const trimmed = text.trim();
  if (trimmed.startsWith("[")) {
    const data = JSON.parse(trimmed);
    if (!Array.isArray(data)) throw new Error("JSON должен быть массивом тем.");
    return data;
  }
  let src = trimmed;
  const idx = src.indexOf("TOPICS");
  if (idx === -1) throw new Error("В файле не найден объект TOPICS.");
  const start = src.indexOf("[", idx);
  if (start === -1) throw new Error("В файле не найден массив TOPICS.");
  let depth = 0, inString = false, stringChar = "", escape = false, end = -1;
  for (let i = start; i < src.length; i++) {
    const ch = src[i];
    if (inString) {
      if (escape) { escape = false; continue; }
      if (ch === "\\") { escape = true; continue; }
      if (ch === stringChar) inString = false;
      continue;
    } else {
      if (ch === '"' || ch === "'" || ch === "`") { inString = true; stringChar = ch; continue; }
    }
    if (ch === "[") depth++;
    else if (ch === "]") { depth--; if (depth === 0) { end = i; break; } }
  }
  if (end === -1) throw new Error("Не удалось найти конец массива TOPICS.");
  const arraySrc = src.slice(start, end + 1);
  let parsed;
  try {
    parsed = new Function("return (" + arraySrc + ");")();
  } catch (e) {
    throw new Error("Ошибка разбора файла: " + e.message);
  }
  if (!Array.isArray(parsed)) throw new Error("TOPICS должен быть массивом.");
  return parsed;
}

/* =========================================================
   ЗАГРУЗКА ТЕМ
   ========================================================= */
/* =========================================================
   Миграция прогресса со старого ключа (имя файла) на новый (хэш)
   ========================================================= */

  /* =========================================================
   Полная очистка прогресса набора (по хэшу и по имени файла)
   ========================================================= */
function clearAllProgressForSet() {
  if (!state.fileKey) {
    alert("Файл вопросов не загружен.");
    return false;
  }

  const currentKey = state.fileKey; // "h:abc123..." (новый)
  const possibleKeys = new Set([currentKey]);

  // Ищем старые ключи по имени файла (до миграции)
  // Если у пользователя раньше был "questions.js", "my_questions.json" и т.п.
  try {
    // Проходим по всем ключам и ищем "stats:<что-то>", "fav:<что-то>" и т.д.
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k) continue;
      // Если это наш хэш — пропускаем
      if (k.endsWith(currentKey)) continue;
      
      // Проверяем, есть ли метка миграции ОТ старого ключа К нашему
      const migKey = "migration:" + k.replace(/^(stats:|fav:|session:|sel:|gamification:[a-z]+:)/, "");
      const migRaw = localStorage.getItem(migKey);
      if (migRaw) {
        try {
          const mig = JSON.parse(migRaw);
          if (mig && mig.to === currentKey) {
            possibleKeys.add(migKey.replace("migration:", ""));
          }
        } catch (e) {}
      }
    }
  } catch (e) {}

  // Плюс — на всякий случай, ключ "questions.js", если в нём остались данные
  possibleKeys.add("questions.js");
  possibleKeys.add("questions");
  possibleKeys.add("default");

  const prefixes = [
    "stats:", "fav:", "session:", "sel:",
    "gamification:xp:", "gamification:badges:",
    "gamification:counters:", "gamification:quests:",
    "gamification:records:", "gamification:bosses:"
  ];

  const keysToDelete = [];
  possibleKeys.forEach(key => {
    if (!key || key === currentKey && prefixes.every(p => !localStorage.getItem(p + key))) {
      // уже нет данных — не добавляем
    }
    prefixes.forEach(prefix => {
      const fullKey = prefix + key;
      if (localStorage.getItem(fullKey) !== null) {
        keysToDelete.push(fullKey);
      }
    });
  });

  // Убираем дубликаты
  const uniqueKeys = Array.from(new Set(keysToDelete));

  if (uniqueKeys.length === 0) {
    return 0; // нечего чистить
  }

  // Удаляем
  uniqueKeys.forEach(k => {
    try { localStorage.removeItem(k); } catch (e) {}
  });

  // Сбрасываем в памяти
  state.stats = {};
  state.favorites = new Set();
  state.answers = {};
  state.order = [];
  state.finished = false;
  state.showingReview = false;
  state.showingTop = false;

  // Сбрасываем GameApp
  if (window.GameApp && window.GameApp._reload) {
    window.GameApp._reload();
  }

  // Обновляем счётчики в UI
  if (typeof updateSpecialCounts === "function") updateSpecialCounts();
  if (typeof syncGamificationUI === "function") syncGamificationUI();

  return uniqueKeys.length;
}

function migrateProgress(oldKey, newKey) {
  if (!oldKey || !newKey || oldKey === newKey) return { migrated: 0, keys: [] };

  const prefixes = [
    "stats:", "fav:", "sel:",
    "gamification:xp:", "gamification:badges:",
    "gamification:counters:", "gamification:quests:",
    "gamification:records:", "gamification:bosses:"
  ];
  const migratedKeys = [];

  prefixes.forEach(prefix => {
    const oldVal = localStorage.getItem(prefix + oldKey);
    if (oldVal == null) return;

    const newVal = localStorage.getItem(prefix + newKey);

    try {
      if (prefix === "stats:") {
        // Слияние по topicId:qid — при конфликте берём более свежий lastDate
        const oldStats = JSON.parse(oldVal);
        const newStats = newVal ? JSON.parse(newVal) : {};
        Object.keys(oldStats).forEach(k => {
          const o = oldStats[k] || {};
          const n = newStats[k] || {};
          if (!newStats[k] || (o.lastDate || 0) > (n.lastDate || 0)) {
            newStats[k] = o;
          }
        });
        localStorage.setItem(prefix + newKey, JSON.stringify(newStats));
      } else if (prefix === "fav:") {
        // Массив — объединение
        const oldArr = JSON.parse(oldVal);
        const newArr = newVal ? JSON.parse(newVal) : [];
        const merged = Array.from(new Set([...oldArr, ...newArr]));
        localStorage.setItem(prefix + newKey, JSON.stringify(merged));
      } else if (prefix === "sel:") {
        // Массив тем — объединение
        const oldArr = JSON.parse(oldVal);
        const newArr = newVal ? JSON.parse(newVal) : [];
        const merged = Array.from(new Set([...oldArr, ...newArr]));
        localStorage.setItem(prefix + newKey, JSON.stringify(merged));
      } else if (prefix === "gamification:xp:" || prefix === "gamification:counters:") {
        // Числовые поля — берём максимум
        const oldObj = JSON.parse(oldVal);
        const newObj = newVal ? JSON.parse(newVal) : {};
        Object.keys(oldObj).forEach(k => {
          if (typeof oldObj[k] === "number") {
            newObj[k] = Math.max(newObj[k] || 0, oldObj[k]);
          } else if (newObj[k] === undefined) {
            newObj[k] = oldObj[k];
          }
        });
        localStorage.setItem(prefix + newKey, JSON.stringify(newObj));
      } else if (prefix === "gamification:badges:") {
        // Массив достижений — объединение
        const oldArr = JSON.parse(oldVal);
        const newArr = newVal ? JSON.parse(newVal) : [];
        const merged = Array.from(new Set([...oldArr, ...newArr]));
        localStorage.setItem(prefix + newKey, JSON.stringify(merged));
      } else if (prefix === "gamification:quests:") {
        // Если новый уже есть — оставляем его (квесты актуальнее)
        if (!newVal) localStorage.setItem(prefix + newKey, oldVal);
      } else if (prefix === "gamification:records:") {
        // Рекорды — максимум по числовым полям
        const oldObj = JSON.parse(oldVal);
        const newObj = newVal ? JSON.parse(newVal) : {};
        Object.keys(oldObj).forEach(k => {
          if (typeof oldObj[k] === "number") {
            newObj[k] = Math.max(newObj[k] || 0, oldObj[k]);
          } else if (newObj[k] === undefined) {
            newObj[k] = oldObj[k];
          }
        });
        localStorage.setItem(prefix + newKey, JSON.stringify(newObj));
      } else if (prefix === "gamification:bosses:") {
        // Победы, имена, скины — берём старые, если новых нет
        if (!newVal) {
          localStorage.setItem(prefix + newKey, oldVal);
        } else {
          const oldObj = JSON.parse(oldVal);
          const newObj = JSON.parse(newVal);
          // defeatedTopics / topicNames / topicIcons / topicSkins — объединяем
          ["defeatedTopics", "topicNames", "topicIcons", "topicSkins"].forEach(field => {
            if (oldObj[field]) {
              newObj[field] = Object.assign({}, oldObj[field], newObj[field] || {});
            }
          });
          // day / finalBoss / ultraBoss — берём новый, если он «свежее»; иначе старый
          ["day", "finalBoss", "ultraBoss"].forEach(field => {
            if (!newObj[field] && oldObj[field]) newObj[field] = oldObj[field];
            else if (oldObj[field] && oldObj[field].defeated && !newObj[field].defeated) {
              newObj[field] = oldObj[field];
            }
          });
          localStorage.setItem(prefix + newKey, JSON.stringify(newObj));
        }
      }
      migratedKeys.push(prefix + newKey);
    } catch (e) {
      console.warn("[migrate] ошибка для", prefix, e);
    }
  });

  // Помечаем, что миграция была (для отладки)
  try { localStorage.setItem("migration:" + oldKey, JSON.stringify({ to: newKey, ts: Date.now(), keys: migratedKeys })); } catch (e) {}

  return { migrated: migratedKeys.length, keys: migratedKeys };
}


function loadTopics(topics, sourceLabel, fileKey) {
  if (!Array.isArray(topics) || topics.length === 0) {
    fileStatus.textContent = "Пустой файл — нет тем.";
    fileStatus.className = "file-status err";
    return;
  }
  
  state.topics = topics;

  // Хэш-ключ по названиям тем + миграция со старого ключа (если передан)
  const newKey = computeFileKey(topics);
  const oldKey = fileKey || sourceLabel || "default";

  if (newKey !== oldKey) {
    const mig = migrateProgress(oldKey, newKey);
    if (mig.migrated > 0 && window.GameApp && window.GameApp.toast) {
      // Тост чуть позже, чтобы не перекрыть загрузку
      setTimeout(() => window.GameApp.toast("♻️ Прогресс перенесён на новый ID набора", "ok", 4000), 600);
    }
  }

  state.fileKey = newKey;
  state.selectedTopicIds = new Set(topics.map(t => t.id));
  loadLocal(); // 2. Грузим статистику для этого ключа
  initTopicsUI();
  updateSpecialCounts();
  fileStatus.textContent = "Загружено: " + sourceLabel + " (" + topics.length + " тем)";
  fileStatus.className = "file-status ok";
  
  // 3. ВАЖНО: Принудительно перезагружаем GameApp ТЕПЕРЬ, когда ключ сменился
  if (window.GameApp && window.GameApp._reload) {
    window.GameApp._reload();
  }
  
  // 4. Обновляем мобильную шапку
  if (typeof syncGamificationUI === 'function') {
    setTimeout(syncGamificationUI, 100);
  }

  // --- Попытка восстановить сессию ---
  const session = readSession();
  if (session && !session.finished && (Object.keys(session.answers || {}).length > 0 || session.current > 0)) {
    const total = session.orderIds.length;
    const answered = Object.keys(session.answers || {}).length;
    const restore = confirm(
      "Найдена незавершённая сессия от " + formatSessionTs(session.ts) + ".\n\n" +
      "Отвечено: " + answered + " из " + total + ".\n\n" +
      "Продолжить?"
    );
    if (restore) {
      const ok = applySession(session);
      if (ok) {
                // Правки для iOS: восстановленная сессия помечается, чтобы «Начать тест» её продолжил, а не начал заново
        state._resumePending = true;
        render();
        return;
      }
    }
    // отказ или ошибка — удаляем и идём с начала
    clearSession();
  }

  start();
}

function initTopicsUI() {
  topicsListEl.innerHTML = "";
  if (state.topics.length === 0) {
    topicsListEl.innerHTML = `<div style="color:var(--muted);font-size:13px;">Нет загруженных тем.</div>`;
    return;
  }

  // восстанавливаем сохранённый набор выбранных тем
  const saved = loadSelectedTopics();
  if (saved && saved.length > 0) {
    const validIds = new Set(state.topics.map(t => t.id));
    // сохраняем только те id, что реально существуют в текущем файле
    state.selectedTopicIds = new Set(saved.filter(id => validIds.has(id)));
    // если ни один не подошёл — оставляем «все выбранные» (как было)
    if (state.selectedTopicIds.size === 0) {
      state.selectedTopicIds = new Set(state.topics.map(t => t.id));
    }
  }

  state.topics.forEach(t => {
    const id = "topic_" + t.id;
    const label = document.createElement("label");
    label.innerHTML = `<input type="checkbox" id="${id}" value="${t.id}"> ${escapeHtml(t.title)}`;
    if (isTopicCompleted(t)) {
      label.classList.add("topic-completed");
      label.title = "Все вопросы этой темы хотя бы раз отвечены правильно";
    }
    topicsListEl.appendChild(label);
    const cb = label.querySelector("input");
    cb.addEventListener("change", () => {
      if (cb.checked) state.selectedTopicIds.add(t.id);
      else state.selectedTopicIds.delete(t.id);
      saveSelectedTopics();
      start();
    });
  });
  syncTopicCheckboxes();
}
function syncTopicCheckboxes() {
  topicsListEl.querySelectorAll("input[type=checkbox]").forEach(cb => {
    cb.checked = state.selectedTopicIds.has(cb.value);
  });
}

/* =========================================================
   СБОР ВОПРОСОВ
   ========================================================= */
function getSelectedTopics() {
  return state.topics.filter(t => state.selectedTopicIds.has(t.id));
}
function isSpecialMode() {
  return $("#specialFav").checked || $("#specialErr").checked;
}
function collectQuestions() {
  if (isSpecialMode()) {
    let pool = getAllQuestionsFlat();
    if ($("#specialFav").checked) pool = pool.filter(q => state.favorites.has(qKey(q)));
    if ($("#specialErr").checked) pool = pool.filter(q => getStat(q).err > 0);
    if (isTraining() || isLearning()) return pool;
    const byTopic = {};
    pool.forEach(q => {
      if (!byTopic[q._topicId]) byTopic[q._topicId] = [];
      byTopic[q._topicId].push(q);
    });
    return shuffle(Object.values(byTopic).map(arr => arr[Math.floor(Math.random() * arr.length)]));
  }
  const selected = getSelectedTopics();
  if (selected.length === 0) return [];
  if (isTraining() || isLearning()) {
    const result = [];
    selected.forEach(t => t.questions.forEach(q => {
      result.push({ ...q, _topicId: t.id, _topicTitle: t.title });
    }));
    return result;
  }
  const picks = [];
  selected.forEach(t => {
    if (!t.questions || t.questions.length === 0) return;
    const idx = Math.floor(Math.random() * t.questions.length);
    picks.push({ ...t.questions[idx], _topicId: t.id, _topicTitle: t.title });
  });
  return shuffle(picks);
}

/* =========================================================
   ШАПКА
   ========================================================= */
function buildHeader() {
const modeLabel = isTraining() ? "тренировка" : isLearning() ? "обучение" : "экзамен";
const modeCls   = isTraining() ? "training"   : isLearning() ? "learning"  : "exam";

  if (state.showingTop) {
    titleEl.innerHTML = "🏆 Топ ошибок";
    subtitleEl.textContent = "Файл: " + (state.fileKey || "—");
    topicsSummaryEl.style.display = "none";
    return;
  }

  if (isSpecialMode()) {
    const parts = [];
    if ($("#specialFav").checked) parts.push("избранное");
    if ($("#specialErr").checked) parts.push("ошибки");
    titleEl.innerHTML = `Особый набор: ${parts.join(" + ")}` +
      `<span class="mode-badge special">${modeLabel}</span>`;
    subtitleEl.textContent = "Чекбоксы тем игнорируются, пока включён особый набор.";
    topicsSummaryEl.style.display = "none";
    return;
  }

  const selected = getSelectedTopics();
  if (selected.length === 0) {
    titleEl.textContent = "Ничего не выбрано";
    subtitleEl.textContent = "Отметь хотя бы одну тему.";
    topicsSummaryEl.style.display = "none";
    return;
  }

  const totalQuestions = selected.reduce((acc, t) => acc + t.questions.length, 0);

  if (selected.length === 1) {
    titleEl.innerHTML = escapeHtml(selected[0].title) +
      `<span class="mode-badge ${modeCls}">${modeLabel}</span>`;
    subtitleEl.textContent = selected[0].subtitle || "";
    topicsSummaryEl.style.display = "none";
  } else {
    titleEl.innerHTML = `Сборный тест (${selected.length} тем)` +
      `<span class="mode-badge ${modeCls}">${modeLabel}</span>`;
    subtitleEl.textContent = `Вопросов в наборе: ${totalQuestions}`;
    topicsSummaryEl.style.display = "inline-block";
    if (topicsSummaryEl.dataset.expanded === "1") {
      topicsSummaryEl.classList.add("expanded");
      topicsSummaryEl.textContent = selected.map(t => t.title).join(" · ");
    } else {
      topicsSummaryEl.classList.remove("expanded");
      topicsSummaryEl.textContent = `Показать темы (${selected.length})`;
    }
    topicsSummaryEl.title = selected.map(t => t.title).join("\n");
  }
}

/* =========================================================
   ПОРЯДОК
   ========================================================= */
function buildOrders() {
  clearAutoAdvance();
  const doShuffleQ = $("#shuffleQ").checked;
  const doShuffleA = $("#shuffleA").checked;
  let qs = collectQuestions();
  if (doShuffleQ && isTraining()) qs = shuffle(qs);
  state.order = qs;
  state.optionOrders = {};
  state.answers = {};
  state.showingReview = false;
  state.showingTop = false;
  qs.forEach(item => {
    let idxs = item.options.map((_, i) => i);
    const allowShuffle = item.shuffle !== false;
    if (doShuffleA && allowShuffle) idxs = shuffle(idxs);
    state.optionOrders[item.id] = idxs;
  });
  state.current = 0;
  state.finished = false;
}

/* =========================================================
   ТРЕКЕР АКТИВНОСТИ (ВРЕМЯ В ПРИЛОЖЕНИИ)
   ========================================================= */

const activityStats = {
  isActive: false,
  lastTick: 0,
  totalActiveSeconds: 0,
  todayDate: new Date().toLocaleDateString('ru-RU'),
  // Локальное хранилище для истории
  history: JSON.parse(localStorage.getItem("stats:activity") || '{"days":{}}') 
};

// Проверка: вкладка активна И окно в фокусе
function checkActivity() {
  // Правки для iOS: на iPhone document.hasFocus() часто false — время активности не считалось; для сенсорных устройств достаточно видимой вкладки
  const isFocused = document.hasFocus() || ('ontouchstart' in window && document.visibilityState === 'visible');
  const isVisible = document.visibilityState === 'visible';
  
  if (isFocused && isVisible) {
    if (!activityStats.isActive) {
      activityStats.isActive = true;
      activityStats.lastTick = Date.now();
    }
  } else {
    // Если ушли в фон — сохраняем накопленное время
    if (activityStats.isActive) {
      saveActiveTime();
      activityStats.isActive = false;
    }
  }
}

function saveActiveTime() {
  const now = Date.now();
  const diffSeconds = Math.floor((now - activityStats.lastTick) / 1000);
  
  // Игнорируем, если прошло больше 2 минут (значит комп уснул или вкладка висела)
  if (diffSeconds > 0 && diffSeconds < 120) {
    activityStats.totalActiveSeconds += diffSeconds;
    
    const today = getTodayDateStr();
    if (!activityStats.history.days[today]) {
      activityStats.history.days[today] = { time: 0, answers: 0, answersTime: 0 };
    }
    activityStats.history.days[today].time += diffSeconds;
    
    localStorage.setItem("stats:activity", JSON.stringify(activityStats.history));
  }
}

// Запускаем таймер: каждые 5 секунд проверяем активность
setInterval(() => {
  checkActivity();
  if (activityStats.isActive) {
    saveActiveTime();
    activityStats.lastTick = Date.now();
  }
}, 5000);

// Слушаем уход/возврат на вкладку
document.addEventListener("visibilitychange", checkActivity);
window.addEventListener("blur", checkActivity);
window.addEventListener("focus", checkActivity);

// Слушаем движения мыши/клавиатуры, чтобы сбрасывать "сон"
let lastInteraction = Date.now();
// Правки для iOS: на телефоне нет mousemove — активность фиксируем и по touchstart
['mousemove', 'keydown', 'scroll', 'click', 'touchstart'].forEach(evt => {
  window.addEventListener(evt, () => { lastInteraction = Date.now(); }, { passive: true });
});


/* =========================================================
   РЕНДЕР
   ========================================================= */
function render() {
  // Переназначаем ссылку на актуальный элемент #quiz
  const quizEl = document.getElementById('quiz');
  if (!quizEl) {
    console.error("Критическая ошибка: #quiz не найден в DOM!");
    return;
  }
  
  refreshTopicCompletion();
   // Управление темой
  if (state._bossFight) {
    // Если идет бой с боссом — всегда темная тема
    document.body.classList.add('dark-theme');
  } else {
    // Если обычный тест — убираем принудительную тему, возвращаемся к системной
    document.body.classList.remove('dark-theme');
  }
  if (state.topics.length === 0) {
    quizEl.innerHTML = `<div class="card empty"><h2>Файл не загружен</h2></div>`;
    if (typeof counterEl !== 'undefined') counterEl.textContent = "—";
    progressEl.style.width = "0%";
    return;
  }

  if (!state._questionStartTime) state._questionStartTime = Date.now();
  
  if (state.showingTop) { renderTop(); return; }
  if (state.showingReview) { renderReview(); return; }
  
  if (state.order.length === 0) {
    quizEl.innerHTML = `<div class="card"><div class="q-text">Нет вопросов.</div></div>`;
    if (typeof counterEl !== 'undefined') counterEl.textContent = "—";
    progressEl.style.width = "0%";
    return;
  }
  
  buildHeader();
  
  // Если это был бой с боссом, мы не рендерим стандартный финал
  if (state.finished) { 
    if (state._bossFight) {
      renderBossFinal(); // Отдельная функция для боя
    } else {
      renderFinal(); 
    }
    return; 
  }

  const total = state.order.length;
  const item = state.order[state.current];
  const optOrder = state.optionOrders[item.id];
  const chosen = state.answers[item.id];
  const stat = getStat(item);
  const isFav = state.favorites.has(qKey(item));

  const isBossFight = !!state._bossFight;
  const isAnswered = chosen !== undefined;
  const isCorrect = isAnswered && optOrder[chosen] === (item.correct - 1);
  
  // Определяем правильный заголовок для босса
  let bossTitle = "Босс";
  if (isBossFight) {
    if (state._bossFight.type === 'day') bossTitle = "Босс дня";
    else if (state._bossFight.type === 'topic') bossTitle = "Босс темы";
    else if (state._bossFight.type === 'final') bossTitle = "Финальный босс";
    else if (state._bossFight.type === 'ultra') bossTitle = "Ультра-босс";
  }
  
  let cardClass = "card";
  let cardStyle = "";
  
  if (isBossFight) {
    cardClass += " boss-arena";


    // Считаем ХП
    let correctAnswers = 0;
    state.order.forEach(q => {
      const ans = state.answers[q.id];
      if (ans !== undefined && state.optionOrders[q.id][ans] === (q.correct - 1)) {
        correctAnswers++;
      }
    });
    const hpPercent = Math.max(0, 100 - ((correctAnswers / total) * 100));

    // 1. Если ХП < 20% (но не 0), включаем вампиризм
    if (hpPercent > 0 && hpPercent <= 20) {
      cardClass += " anim-vampire";
    }
    
    // 2. Если ХП = 0 и ответ правильный — взрываем
    if (hpPercent === 0 && isCorrect) {
      cardClass += " anim-explosion";
      
      // ЗАПУСКАЕМ ТАЙМЕР ПЕРЕХОДА НА ФИНАЛ (через 1.5 сек)
      if (!state._explosionTimer) {
        state._explosionTimer = setTimeout(() => {
          state._explosionTimer = null;
          state.finished = true;
          render(); // Рендерим финальный экран
        }, 1500); // Ждем ровно столько, сколько длится анимация
      }
    } else if (isAnswered) {
      cardClass += isCorrect ? " answered-correct" : " answered-wrong";
    }
    
    if (state._bossFight.skin && state._bossFight.skin.color) {
      cardStyle = `style="--boss-color: ${state._bossFight.skin.color};"`;
    }
  }

  if (typeof counterEl !== 'undefined') {
    counterEl.textContent = isBossFight ? "Бой" : `Вопрос ${state.current + 1} из ${total}`;
  }
  progressEl.style.width = ((state.current) / total * 100) + "%";

  let html = `<div class="${cardClass}" ${cardStyle} data-id="${item.id}">`;

  // === ШАПКА КАРТОЧКИ (БОСС ИЛИ ВОПРОС) ===
  if (isBossFight) {
    const b = state._bossFight;
    const skinColor = b.skin ? b.skin.color : 'var(--err)';
    
    // Считаем ХП
    let correctAnswers = 0;
    state.order.forEach(q => {
      const ans = state.answers[q.id];
      if (ans !== undefined && state.optionOrders[q.id][ans] === (q.correct - 1)) {
        correctAnswers++;
      }
    });
    const hpPercent = Math.max(0, 100 - ((correctAnswers / total) * 100));
    const hpLeft = total - correctAnswers;

    html += `<div class="boss-card-header" style="display:flex; flex-direction:column; gap:10px; margin-bottom:20px; padding-bottom:16px; border-bottom:1px solid var(--border);">
      <div class="boss-header" style="--boss-color: ${skinColor}; justify-content: flex-start;">
        <span class="boss-avatar" style="font-size:32px;">${b.icon || "⚔️"}</span>
        <div>
          <div class="boss-name" style="font-size:18px;">${b.bossName}</div>
          <div style="font-size:13px; color:var(--muted); margin-top:2px;">${bossTitle}</div>
        </div>
      </div>
      
      <div class="boss-hp-container" style="margin-top:0; padding:0; border:none; background:transparent;">
        <div class="boss-hp-labels" style="color:var(--text);">
          <span>❤️ Здоровье</span>
          <span>${hpLeft} / ${total}</span>
        </div>
        <div class="boss-hp-bar" style="height:10px; background:var(--bg); border:1px solid var(--border);">
          <div class="boss-hp-fill" style="width: ${hpPercent}%; background: linear-gradient(90deg, #ef4444, #b91c1c);"></div>
        </div>
      </div>
    </div>`;
  } else {
    // Обычный режим
    html += `<div class="card-actions">`;
    const isActiveError = stat.err > 0;
    const errText = isActiveError ? `<span style="color:var(--err); font-weight:bold;">${stat.err}</span>` : "0";
    html += `<span class="icon-btn stat" title="Верно / Активные ошибки" style="gap:4px;">${stat.ok}/${errText}</span>`;
    html += `<button class="icon-btn ${isFav ? "active" : ""}" id="favBtn" title="В избранное">${isFav ? "★" : "☆"}</button>`;
    if (stat.err > 0) {
      html += `<button class="icon-btn danger" id="clearErrBtn" title="Убрать из ошибок">🗑</button>`;
    }
    html += `</div>`;
    
    html += isTraining()

  ? `<div class="q-num" style="display: flex; justify-content: space-between; align-items: center;">
       <span>Вопрос ${item.id}</span>
       <span>${state.current + 1} из ${total}</span>
     </div>`
  : `<div class="q-num" style="display: flex; justify-content: space-between; align-items: center;">
       <span>Вопрос ${state.current + 1} из ${total}</span>
     </div>`;
  }

  // === ТЕКСТ ВОПРОСА ===
  html += `<div class="q-text">${escapeHtml(item.q)}</div>`;

  if (item.image && CONFIG.showImages) {
    const imgSrc = escapeHtml(item.image);
    html += `<img class="q-image" src="${imgSrc}" alt="Иллюстрация" data-src="${imgSrc}" onclick="openLightbox('${imgSrc}')">`;
  }

  // === ВАРИАНТЫ ОТВЕТОВ ===
  html += `<div class="options">`;
  const revealAnswer = isLearning() || (isTraining() && chosen !== undefined);
  
  optOrder.forEach((origIdx, i) => {
    const isChosen = chosen === i;
    const isCorrectOpt = origIdx === (item.correct - 1);
    let cls = "opt";
    let disabled = false;
    const alreadyAnswered = chosen !== undefined;
    
    if (isLearning()) {
      if (isCorrectOpt) cls += " correct";
      if (alreadyAnswered) {
        cls += " locked";
        if (isChosen && !isCorrectOpt) cls += " wrong";
        disabled = true;
      }
    } else if (revealAnswer) {
      cls += " locked";
      if (isCorrectOpt) cls += " correct";
      else if (isChosen) cls += " wrong";
      disabled = true;
    } else if (isChosen) {
      cls += " chosen-plain";
    }
    
    html += `<label class="${cls}">`;
    html += `<input type="radio" name="q_${item.id}" value="${i}" ${isChosen ? "checked" : ""} ${disabled ? "disabled" : ""}>`;
    html += `<span>${escapeHtml(item.options[origIdx])}</span>`;
    html += `</label>`;
  });
  html += `</div>`;

  if (CONFIG.showVerdict) {
    if (isLearning() && chosen === undefined) {
      html += `<div class="verdict" style="color:var(--muted);font-weight:500;">Правильный ответ выделен.</div>`;
    } else if (revealAnswer) {
      html += `<div class="verdict ${isCorrect ? "ok" : "err"}">${isCorrect ? "✓ Верно" : "✗ Неверною. Вопрос добавлен в список ошибок."}</div>`;
    }
  }

  // === НАВИГАЦИЯ ===
  html += `<div class="nav" style="display:flex; gap:12px; margin-top:24px;">`;
  html += `<button class="btn-secondary" id="prevBtn" ${state.current === 0 ? "disabled" : ""}><span>←</span> Назад</button>`;
  
  let nextBtnStyle = "flex:1;";
  if (isBossFight && chosen === undefined) {
    nextBtnStyle += " background: var(--accent);";
  } else if (isBossFight && chosen !== undefined) {
    nextBtnStyle += isCorrect ? " background: var(--ok);" : " background: var(--err);";
  }

  let nextBtnText = state.current === total - 1 ? "Завершить" : (isBossFight ? "Атаковать" : "Далее");
  let nextBtnArrow = state.current === total - 1 ? "" : `<span>→</span>`;

  html += `<button class="btn-primary" id="nextBtn" style="${nextBtnStyle}">${nextBtnText} ${nextBtnArrow}</button>`;
  html += `</div>`;

  // === СПИСОК ВОПРОСОВ И СБЕЖАТЬ ===
  html += `<div class="action-buttons-wrap">`;
  
  html += `<button id="toggleJumpBtn" class="test-action-btn">
    <span>📋</span> Список вопросов (${total}) ▾
  </button>`;
  html += `<div class="jump" id="jumpPanel" style="display: none; margin-top: 12px; gap:8px; grid-template-columns: repeat(auto-fill, minmax(50px, 1fr));"></div>`;
  
  if (isBossFight) {
    html += `<button class="test-action-btn danger" id="finishTestBtn">
      <span>🏃</span> Сбежать с поля боя
    </button>`;
  } else {
    html += `<button class="test-action-btn" id="finishTestBtn" style="color: var(--muted);">
      <span></span> Завершить тест
    </button>`;
  }
  
  html += `</div>`;
  html += `</div>`; // конец card
  quizEl.innerHTML = html;

  // === ПРИВЯЗКА СОБЫТИЙ ===
  quizEl.querySelectorAll('input[type="radio"]').forEach(inp => inp.addEventListener("change", onAnswer));
  const prevBtn = $("#prevBtn");
  if (prevBtn) prevBtn.addEventListener("click", goPrev);
  const nextBtn = $("#nextBtn");
  if (nextBtn) nextBtn.addEventListener("click", goNext);
  const favBtn = $("#favBtn");
  if (favBtn) favBtn.addEventListener("click", () => { toggleFavorite(item); render(); });
  const clearErrBtn = $("#clearErrBtn");
  if (clearErrBtn) clearErrBtn.addEventListener("click", () => { clearErrFor(item); render(); });
  
  const panel = $("#jumpPanel");
  if (panel) {
    let jumpHtml = "";
    state.order.forEach((qItem, i) => {
      let btnClass = "jump-btn";
      let style = "";
      if (i === state.current) btnClass += " current";
      
      const ans = state.answers[qItem.id];
      if (ans !== undefined) {
        const chosenOrig = state.optionOrders[qItem.id][ans];
        const ok = chosenOrig === (qItem.correct - 1);
        if (ok) style = "background: var(--ok-bg); border-color: var(--ok); color: var(--ok);";
        else style = "background: var(--err-bg); border-color: var(--err); color: var(--err);";
      } else if (i === state.current) {
        style = "background: var(--accent); color: white;";
      }
      jumpHtml += `<button class="${btnClass}" style="${style}" data-idx="${i}">${qItem.id}</button>`;
    });
    
    panel.innerHTML = jumpHtml;
    panel.querySelectorAll("button").forEach(b => {
      b.addEventListener("click", () => {
        state.current = parseInt(b.dataset.idx, 10);
        render();
      });
    });
  }
  
  updateBossDayButton();
  
  setTimeout(() => {
    const mobileQuiz = document.getElementById('mobileQuiz');
    if (mobileQuiz) mobileQuiz.scrollTo({ top: 0, behavior: 'smooth' });
  }, 10); 

  const finishBtn = $("#finishTestBtn");
  if (finishBtn) {
    finishBtn.addEventListener("click", () => {
      if (confirm(isBossFight ? "Сбежать из боя?" : "Завершить тест?")) {
        state.finished = true;
        render();
      }
    });
  }

  const toggleJumpBtn = $("#toggleJumpBtn");
  if (toggleJumpBtn && panel) {
    toggleJumpBtn.addEventListener("click", () => {
      const isHidden = panel.style.display === "none";
      panel.style.display = isHidden ? "grid" : "none";
      toggleJumpBtn.innerHTML = isHidden ? `<span>📋</span> Скрыть список ▴` : `<span>📋</span> Список вопросов (${total}) ▾`;
    });
  }
}
function renderJumpPanel() {
   const panel = $("#jumpPanel");
  if (panel) {
    let jumpHtml = `<div class="jump-grid">`;
    state.order.forEach((qItem, i) => {
      let btnClass = "jump-btn";
      if (i === state.current) btnClass += " current";
      
      const ans = state.answers[qItem.id];
      if (ans !== undefined) {
        const chosenOrig = state.optionOrders[qItem.id][ans];
        const ok = chosenOrig === (qItem.correct - 1);
        btnClass += ok ? " correct" : " wrong";
      }
      
      jumpHtml += `<button class="${btnClass}" data-idx="${i}">${qItem.id}</button>`;
    });
    jumpHtml += `</div>`;
    panel.innerHTML = jumpHtml;
    
    panel.querySelectorAll("button").forEach(b => {
      b.addEventListener("click", () => {
        state.current = parseInt(b.dataset.idx, 10);
        render();
      });
    });
  }
}

function onAnswer(e) {
  const item = state.order[state.current];
  const val = parseInt(e.target.value, 10);
  state.answers[item.id] = val;
  const chosenOrig = state.optionOrders[item.id][val];
  const isCorrect = chosenOrig === (item.correct - 1);
  
  bumpStat(item, isCorrect);
  
  if (window.GameApp && typeof window.GameApp.onAnswer === "function") {
  try { 
    window.GameApp.onAnswer(item, isCorrect); 
  } catch (err) { console.error("[gamification]", err); }
}

  // --- Учет времени на ответ и счетчик ответов ---
  const now = Date.now();
  const answerTime = state._questionStartTime ? Math.floor((now - state._questionStartTime) / 1000) : 0;
  state._questionStartTime = null; // сбрасываем
  
  const today = getTodayDateStr();
  if (!activityStats.history.days[today]) {
    activityStats.history.days[today] = { time: 0, answers: 0, answersTime: 0 };
  }
  
  // Записываем 1 ответ и время, потраченное на него
  if (answerTime > 0 && answerTime < 300) { // Если дольше 5 минут — не считаем (ушли пить чай)
    activityStats.history.days[today].answers += 1;
    activityStats.history.days[today].answersTime += answerTime;
    
    // НОВОЕ: Сохраняем время по каждой теме отдельно
    if (!activityStats.history.topics) activityStats.history.topics = {};
    if (!activityStats.history.topics[item._topicId]) {
      activityStats.history.topics[item._topicId] = { totalTime: 0, count: 0 };
    }
    activityStats.history.topics[item._topicId].totalTime += answerTime;
    activityStats.history.topics[item._topicId].count += 1;
  }
  
  localStorage.setItem("stats:activity", JSON.stringify(activityStats.history));
  // ------------------------------------------------
  
  refreshTopicCompletion();
  render();

  try { saveSession(); } catch (e) {} // Правки для iOS: сессия сохраняется сразу после каждого ответа (раньше — только при закрытии, которого на iOS «не бывает»)
  
  // ▼▼▼ ДОБАВЛЯЕМ ОБНОВЛЕНИЕ XP ▼▼▼
  if (typeof syncGamificationUI === 'function') {
    syncGamificationUI();
  }
  
  // Автопереход или автозавершение при правильном ответе
  if (CONFIG.autoAdvanceAfterCorrect && (isTraining() || isLearning()) && isCorrect) {
    clearAutoAdvance();
    state._autoAdvanceTimer = setTimeout(() => {
      state._autoAdvanceTimer = null;
      
      // Защита: не срабатываем, если уже ушли с вопроса или открыли модалку
      if (state.finished || state.showingReview || state.showingTop) return;

      if (state.current < state.order.length - 1) {
        // Обычный переход к следующему вопросу
        state.current++;
      } else {
        // Это был последний вопрос — завершаем тест
        state.finished = true;
      }
      
      saveSession();
      render();
    }, CONFIG.autoAdvanceDelayMs);
  }
}

function goPrev() {
  clearAutoAdvance();
  if (state.current > 0) {
    state.current--;
    saveSession();
    render();
  }
}

function goNext() {
  clearAutoAdvance();
  if (state.current < state.order.length - 1) {
    state.current++;
    saveSession();
    render();
  } else {
    state.finished = true;
    saveSession();
    render();
  }
}


function goNext() {
  clearAutoAdvance();
  if (state.current < state.order.length - 1) {
    state.current++;
    saveSession();
    render();
  } else {
    state.finished = true;
    saveSession();
    render();
  }
}

/* =========================================================
   ФИНАЛ
   ========================================================= */


function renderBossFinal() {

 // Сбрасываем темную тему (бой завершен)
  document.body.classList.remove('dark-theme');

  // СБРОС МОДАЛКИ БОССА ПЕРЕД ПОКАЗОМ
  const bossFightModal = document.getElementById("bossFightModal");
  if (bossFightModal) bossFightModal.classList.remove("active");

  const total = state.order.length;
  let correctCount = 0;
  
  state.order.forEach(item => {
    const chosen = state.answers[item.id];
    if (chosen === undefined) return;
    const chosenOrig = state.optionOrders[item.id][chosen];
    if (chosenOrig === (item.correct - 1)) correctCount++;
  });
  
  const pct = total > 0 ? Math.round(correctCount / total * 100) : 0;
  const currentBoss = state._bossFight; // Сохраняем ссылку!
  
  if (!currentBoss) return; // Защита
  
  const isWin = checkBossResult(correctCount, total);
  const bossType = currentBoss.type;
  let xpReward = 100;
  if (bossType === 'day') xpReward = 150;
  if (bossType === 'final') xpReward = 500;
  if (bossType === 'ultra') xpReward = 1000;

  // Очищаем тест, чтобы под модалкой было пусто
  quizEl.innerHTML = "";
  //const mobileQuiz = document.getElementById('mobileQuiz');
 // if (mobileQuiz) mobileQuiz.innerHTML = "";

  // Показываем модалку
  const modal = document.getElementById("bossResultModal");
  if (modal) {
    const card = modal.querySelector('.card');
    const iconEl = document.getElementById("bossResultIcon");
    const titleEl = document.getElementById("bossResultTitle");
    
    card.className = "card"; 
    
    if (isWin) {
      if (window.GameApp && window.GameApp.addXp) window.GameApp.addXp(xpReward);
      
      card.classList.add('win-card');
      iconEl.className = "win-icon";
      titleEl.className = "win-title";
      
      iconEl.textContent = "🏆";
      titleEl.textContent = "Победа!";
document.getElementById("bossResultDesc").innerHTML = `Вы повергли: <span style="color: ${currentBoss.skin ? currentBoss.skin.color : 'var(--ok)'}; font-weight: 700; text-shadow: 0 0 8px ${currentBoss.skin ? currentBoss.skin.glow : 'transparent'};">${currentBoss.bossName}</span>`;
      document.getElementById("bossResultXp").textContent = `+${xpReward} XP`;
      document.getElementById("bossResultXp").style.color = "var(--ok)";
      
      for(let i=0; i<50; i++) {
        const conf = document.createElement('div');
        conf.className = 'confetti-piece';
        conf.style.left = Math.random() * 100 + 'vw';
        conf.style.backgroundColor = ['#ef4444', '#3b82f6', '#10b981', '#f59e0b', '#8b5cf6'][Math.floor(Math.random()*5)];
        conf.style.animationDelay = Math.random() * 2 + 's';
        document.body.appendChild(conf);
        setTimeout(() => conf.remove(), 5000);
      }
    } else {
      card.classList.add('lose-card');
      iconEl.className = "lose-icon";
      titleEl.className = "lose-title";
      
      iconEl.textContent = "💀";
      titleEl.textContent = "Поражение";
document.getElementById("bossResultDesc").innerHTML = `Вас одолел: <span style="color: ${currentBoss.skin ? currentBoss.skin.color : 'var(--err)'}; font-weight: 700; text-shadow: 0 0 8px ${currentBoss.skin ? currentBoss.skin.glow : 'transparent'};">${currentBoss.bossName}</span>. Нужно ${currentBoss.threshold}%.`;
 document.getElementById("bossResultDesc").style.color = "var(--warn)";
const xpEl = document.getElementById("bossResultXp");
xpEl.textContent = "Попробуйте ещё раз...";
xpEl.style.color = "var(--muted)";
xpEl.style.fontStyle = "italic"; // Можно добавить курсив для грусти
    }
    
    modal.style.display = "flex";
    if (typeof bringToFront === 'function') bringToFront(modal);
  }
  
  // Обнуляем флаг ТОЛЬКО ПОСЛЕ того, как всё отрисовали
  state._bossFight = null; 
}

function renderFinal() {
  const total = state.order.length;
  let correctCount = 0, answeredCount = 0;
  
  state.order.forEach(item => {
    const chosen = state.answers[item.id];
    if (chosen === undefined) return;
    answeredCount++;
    const chosenOrig = state.optionOrders[item.id][chosen];
    if (chosenOrig === (item.correct - 1)) correctCount++;
  });
  
  const pct = answeredCount ? Math.round(correctCount / total * 100) : 0;
  
  // Убираем темную тему (если это был обычный тест)
  document.body.classList.remove('dark-theme');

  const titleText = "Тест завершён";
  const titleColor = "var(--text)";

  let finalHtml = `<div class="final-screen" style="text-align:center; padding: 40px 20px;">
    <h2 style="font-size:32px; margin:0 0 10px 0; font-weight: 800; color: ${titleColor};">${titleText}</h2>
    <div style="font-size:64px; font-weight:900; color:var(--accent); margin:16px 0; line-height:1; letter-spacing: -2px;">${correctCount} <span style="color:var(--border);">/</span> ${total}</div>
    <div style="color:var(--muted); font-size:16px; font-weight: 500;">${pct}% правильных ответов</div>
  </div>`;

  if (window.GameApp && window.GameApp.getSessionXp) {
    const sessionXp = window.GameApp.getSessionXp();
    if (sessionXp > 0) {
      finalHtml += `<div style="margin-top:12px; font-size:16px; font-weight:600; color:var(--accent); text-align:center;">⭐ Получено за тест: +${sessionXp} XP</div>`;
    }
  }
  
  finalHtml += `<div class="final-buttons">
    <button class="btn-final-primary" onclick="startAgain()">Пройти заново</button>
    <button class="btn-final-secondary" onclick="repeatErrors()">Повторить ошибки</button>
    <button class="btn-final-secondary" onclick="startAgain(true)">🔀 Перемешать и повторить</button>
    <button class="btn-final-secondary" onclick="renderReview()">Разбор ответов</button>
    <button class="btn-final-ghost" onclick="closeTestModal()">← В главное меню</button>
  </div>`;

  quizEl.innerHTML = finalHtml;
}
// Глобальные функции для финала
window.startAgain = function(shuffle = false) {
  if (shuffle) $("#shuffleQ").checked = true;
  if (window.GameApp && window.GameApp.resetSessionXp) window.GameApp.resetSessionXp();
  clearSession();
  start();
};

window.repeatErrors = function() {
  const errorQuestions = state.order.filter(item => {
    const chosen = state.answers[item.id];
    if (chosen === undefined) return false;
    return state.optionOrders[item.id][chosen] !== (item.correct - 1);
  });
  
  if (errorQuestions.length === 0) {
    alert("У вас нет ошибок в этом тесте! Так держать.");
    return;
  }
  
  state.order = errorQuestions;
  state.optionOrders = {};
  state.answers = {};
  state.current = 0;
  state.finished = false;
  state.showingReview = false;
  state.showingTop = false;

  errorQuestions.forEach(item => {
    let idxs = item.options.map((_, i) => i);
    if (item.shuffle !== false) idxs = shuffle(idxs);
    state.optionOrders[item.id] = idxs;
  });

  render();
};
/* =========================================================
   РАЗБОР
   ========================================================= */
// Глобальная переменная для хранения открытого вопроса в разборе
window.reviewOpenId = null;
window.reviewFilter = "all"; // "all" или "errors"

function renderReview() {
  const reviewBody = document.getElementById('reviewBody');
  if (!reviewBody) return;

  const total = state.order.length;
  let correctCount = 0, wrongCount = 0, skippedCount = 0;
  
  state.order.forEach(item => {
    const chosen = state.answers[item.id];
    if (chosen === undefined) { skippedCount++; return; }
    const chosenOrig = state.optionOrders[item.id][chosen];
    if (chosenOrig === (item.correct - 1)) correctCount++;
    else wrongCount++;
  });

  // Шапка с фильтрами
  let html = `
    <div style="position: sticky; top: -16px; background: var(--bg); z-index: 10; padding: 10px 0 16px; display: flex; gap: 8px; flex-wrap: wrap; border-bottom: 1px solid var(--border); margin-bottom: 16px;">
      <button class="btn-secondary" style="flex: 1; padding: 10px; font-size: 13px;" onclick="setReviewFilter('all')">
        Все (${total})
      </button>
      <button class="btn-secondary" style="flex: 1; padding: 10px; font-size: 13px;" onclick="setReviewFilter('errors')">
        Ошибки (${wrongCount + skippedCount})
      </button>
    </div>
  `;

  let renderedItems = 0;
  state.order.forEach(item => {
    const chosen = state.answers[item.id];
    const correctIdx = item.correct - 1;
    const chosenOrig = chosen !== undefined ? state.optionOrders[item.id][chosen] : undefined;
    const isCorrect = chosenOrig === correctIdx;

    // Фильтрация
    if (window.reviewFilter === "errors" && isCorrect) return;
    renderedItems++;

    let statusClass = "skipped";
    let statusText = "Без ответа";
    let statusIcon = "⚪";
    if (chosen !== undefined) {
      if (isCorrect) { statusClass = "correct"; statusText = "Верно"; statusIcon = "✅"; }
      else { statusClass = "wrong"; statusText = "Неверно"; statusIcon = "❌"; }
    }

    const isOpen = window.reviewOpenId === item.id;

    html += `
      <div class="review-accordion ${isOpen ? 'open' : ''} ${statusClass}" style="margin-bottom: 10px; border-radius: 12px; border: 1px solid var(--border); overflow: hidden; background: var(--card);">
        <!-- Заголовок аккордеона -->
        <div class="review-header" onclick="toggleReviewItem('${item.id}')" style="display: flex; align-items: center; justify-content: space-between; padding: 16px; cursor: pointer;">
          <div style="display: flex; align-items: center; gap: 10px;">
            <span style="font-size: 18px;">${statusIcon}</span>
            <div>
              <div style="font-weight: 700; font-size: 14px; color: var(--text);">Вопрос ${item.id}</div>
              <div style="font-size: 12px; color: var(--muted);">${escapeHtml(item._topicTitle)}</div>
            </div>
          </div>
          <div style="color: var(--muted); font-size: 20px; transform: rotate(${isOpen ? '180deg' : '0'}); transition: transform 0.3s;">▼</div>
        </div>

        <!-- Тело аккордеона (скрыто, если не открыто) -->
        <div class="review-body" style="display: ${isOpen ? 'block' : 'none'}; padding: 0 16px 16px 16px; border-top: 1px solid var(--border);">
          <div style="font-size: 15px; font-weight: 600; margin: 12px 0; line-height: 1.4; color: var(--text);">${escapeHtml(item.q)}</div>
    `;

    if (item.image && CONFIG.showImages) {
      const imgSrc = escapeHtml(item.image);
      html += `<img class="q-image" src="${imgSrc}" alt="Иллюстрация" style="max-height: 200px; margin-bottom: 12px;" onclick="openLightbox('${imgSrc}')">`;
    }

    html += `<div style="display: flex; flex-direction: column; gap: 8px;">`;
    
    state.optionOrders[item.id].forEach((origIdx, i) => {
      const isCorrect = origIdx === correctIdx;
      const isChosen = (chosen !== undefined) && (chosen === i);
      
      let bg = "var(--bg)";
      let border = "1px solid var(--border)";
      let marker = "○";
      let textColor = "var(--text)";
      let label = "";

      if (isCorrect) { 
        bg = "var(--ok-bg)"; border = "1px solid var(--ok)"; marker = "✓"; textColor = "var(--ok)";
        if (isChosen) label = `<span style="font-size:10px; background:var(--ok); color:#fff; padding:2px 6px; border-radius:4px; margin-left:8px;">ВАШ ВЫБОР</span>`;
        else label = `<span style="font-size:10px; border:1px solid var(--ok); color:var(--ok); padding:1px 6px; border-radius:4px; margin-left:8px;">ПРАВИЛЬНО</span>`;
      } else if (isChosen) { 
        bg = "var(--err-bg)"; border = "1px solid var(--err)"; marker = "✗"; textColor = "var(--err)";
        label = `<span style="font-size:10px; background:var(--err); color:#fff; padding:2px 6px; border-radius:4px; margin-left:8px;">ВАШ ВЫБОР</span>`;
      }

      html += `
        <div style="padding: 12px; border-radius: 8px; background: ${bg}; border: ${border}; display: flex; gap: 10px; align-items: flex-start;">
          <span style="font-weight: 800; color: ${textColor};">${marker}</span>
          <span style="font-size: 14px; color: var(--text); line-height: 1.4;">${escapeHtml(item.options[origIdx])}${label}</span>
        </div>
      `;
    });

    html += `</div></div></div>`;
  });

  if (renderedItems === 0 && window.reviewFilter === "errors") {
    html += `<div style="text-align:center; padding:40px; color:var(--ok); font-weight:bold; font-size:16px;">Отлично! В этом тесте нет ошибок.</div>`;
  }

  reviewBody.innerHTML = html;
  
  const reviewModal = document.getElementById('reviewModal');
  if (reviewModal) {
    reviewModal.classList.add('active');
    bringToFront(reviewModal);
  }
}

// Вспомогательные функции для аккордеона
window.toggleReviewItem = function(id) {
  if (window.reviewOpenId === id) {
    window.reviewOpenId = null; // Закрываем, если уже открыт
  } else {
    window.reviewOpenId = id; // Открываем новый
  }
  renderReview(); // Перерисовываем
};

window.setReviewFilter = function(filter) {
  window.reviewFilter = filter;
  renderReview();
};

window.closeReviewModal = function() {
  const reviewModal = document.getElementById('reviewModal');
  if (reviewModal) reviewModal.classList.remove('active');
  window.reviewOpenId = null; // Сбрасываем стейт при закрытии
};
/* =========================================================
   ТОП ОШИБОК
   ========================================================= */
function getTopFilterValue() {
  const v = $("#topFilter") ? $("#topFilter").value : "1";
  return parseInt(v, 10);
}
function getTopSortValue() {
  const v = $("#topSort") ? $("#topSort").value : "count";
  return v;
}

function renderTop() {
  counterEl.textContent = "Топ ошибок";
  progressEl.style.width = "100%";
  titleEl.innerHTML = "🏆 Топ ошибок";
  subtitleEl.textContent = "Файл: " + (state.fileKey || "—");
  topicsSummaryEl.style.display = "none";

  const all = getAllQuestionsFlat();
  const withErr = all
    .map(item => {
      const stat = getStat(item);
      const total = stat.ok + stat.err;
      return { item, ok: stat.ok, err: stat.err, total, ratio: total > 0 ? stat.err / total : 0 };
    })
    .filter(x => x.err > 0);

  const minErr = getTopFilterValue();
  const filtered = withErr.filter(x => x.err >= minErr);

  const sortMode = getTopSortValue();
  if (sortMode === "ratio") {
    filtered.sort((a, b) => {
      if (b.ratio !== a.ratio) return b.ratio - a.ratio;
      return b.err - a.err;
    });
  } else {
    filtered.sort((a, b) => {
      if (b.err !== a.err) return b.err - a.err;
      return b.ratio - a.ratio;
    });
  }

  const top = filtered.slice(0, 20);
  let html = "";

  html += `<div class="top-panel">`;
  html += `<label>Минимум ошибок: <select id="topFilter">
    <option value="1">1 и более</option>
    <option value="2">2 и более</option>
    <option value="3">3 и более</option>
    <option value="5">5 и более</option>
  </select></label>`;
  html += `<label>Сортировка: <select id="topSort">
    <option value="count">По числу ошибок</option>
    <option value="ratio">По доле ошибок</option>
  </select></label>`;
  html += `<button class="ghost" id="topBackBtn" style="margin-left:auto;">← Вернуться к тесту</button>`;
  html += `</div>`;

  html += `<div class="top-summary">`;
  if (all.length === 0) {
    html += `Нет загруженных вопросов.`;
  } else if (withErr.length === 0) {
    html += `Пока ни одной ошибки. Так держать!`;
  } else {
    html += `Всего вопросов с ошибками: <b>${withErr.length}</b>. `;
    if (minErr > 1) html += `С ошибками ≥${minErr}: <b>${filtered.length}</b>. `;
    html += `Показано: <b>${top.length}</b>.`;
  }
  html += `</div>`;

  if (top.length === 0) {
    if (withErr.length === 0 && all.length > 0) {
      html += `<div class="top-empty">Пока ошибок нет. Проходи тест дальше, чтобы статистика накопилась.</div>`;
    } else if (filtered.length === 0 && withErr.length > 0) {
      html += `<div class="top-empty">Среди вопросов с ошибками нет таких, у которых ошибок ≥${minErr}. Попробуй понизить фильтр.</div>`;
    } else {
      html += `<div class="top-empty">Нет данных. Сначала загрузи файл вопросов.</div>`;
    }
  } else {
    top.forEach((row, i) => {
      const item = row.item;
      const rank = i + 1;
      const pct = row.total > 0 ? Math.round(row.ratio * 100) : 0;
      const idx = state.order.findIndex(x => x.id === item.id && x._topicId === item._topicId);
      const inCurrent = idx !== -1;

      html += `<div class="top-item">`;
      html += `<div class="ti-rank">${rank}</div>`;
      html += `<div class="ti-id">${escapeHtml(item.id)}</div>`;
      html += `<div>`;
      html += `<div class="ti-q">${escapeHtml(item.q)}</div>`;
      html += `<div class="ti-topic">${escapeHtml(item._topicTitle || "")}</div>`;
      html += `</div>`;
      html += `<div class="ti-stats">`;
      html += `Ошибок: <b class="err">${row.err}</b> · Верно: <b class="ok">${row.ok}</b> · Доля: ${pct}%`;
      html += `</div>`;
      html += `<div class="ti-actions">`;
      if (inCurrent) {
        html += `<button class="ghost" data-top-idx="${idx}">Перейти →</button>`;
      } else {
        html += `<button class="ghost" disabled title="Вопрос не входит в текущий тест.">не в тесте</button>`;
      }
      html += `</div></div>`;
    });
  }

  quizEl.innerHTML = html;

  const topFilter = $("#topFilter");
  const topSort = $("#topSort");
  if (topFilter) {
    topFilter.value = String(minErr);
    topFilter.addEventListener("change", renderTop);
  }
  if (topSort) {
    topSort.value = sortMode;
    topSort.addEventListener("change", renderTop);
  }
  const backBtn = $("#topBackBtn");
  if (backBtn) {
    backBtn.addEventListener("click", () => {
      state.showingTop = false;
      state.finished = false;
      render();
    });
  }
  quizEl.querySelectorAll("button[data-top-idx]").forEach(b => {
    b.addEventListener("click", () => {
      const idx = parseInt(b.dataset.topIdx, 10);
      state.showingTop = false;
      state.finished = false;
      state.showingReview = false;
      state.current = idx;
      render();
    });
  });
}

/* =========================================================
   ЭКСПОРТ В HTML
   ========================================================= */
function imageToDataUrl(src) {
  return new Promise((resolve) => {
    if (!src) { resolve(null); return; }
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0);
        const dataUrl = canvas.toDataURL("image/png");
        resolve(dataUrl);
      } catch (e) {
        resolve(null);
      }
    };
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

function escapeHtmlForExport(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
    .replace(/\n/g, "<br>");
}

async function buildExportHtml() {
  const topics = state.topics;
  const totalQuestions = topics.reduce((acc, t) => acc + t.questions.length, 0);
  const now = new Date();
  const dateStr = now.toLocaleDateString("ru-RU");
  const fileKeyClean = (state.fileKey || "questions").replace(/\.(js|json|txt)$/i, "");

  let html = `<!DOCTYPE html>
<html lang="ru">
<head>
<meta charset="UTF-8">
<title>${escapeHtmlForExport(fileKeyClean)} — вопросы с ответами</title>
<style>
  * { box-sizing: border-box; }
  body {
    font-family: "Segoe UI", -apple-system, BlinkMacSystemFont, Roboto, Arial, sans-serif;
    background: #eef1f6;
    color: #1c1f26;
    margin: 0;
    padding: 24px 12px 60px;
    line-height: 1.55;
  }
  .wrap {
    max-width: 1100px; margin: 0 auto; background: #fff;
    padding: 30px 40px; box-shadow: 0 1px 4px rgba(0,0,0,.08);
    border-radius: 8px;
  }
  h1 { font-size: 24px; margin: 0 0 8px; color: #1c1f26; }
  .doc-sub { color: #4a4a4a; font-size: 14px; margin-bottom: 8px; }
  .hint {
    border: 1px solid #d0d0d0; border-radius: 6px;
    padding: 10px 14px; margin: 16px 0 24px;
    background: #fafafa; font-size: 13px;
  }
  .hint b { background: #e8e8e8; padding: 1px 5px; border-radius: 3px; }
  .hint .check { font-weight: 700; color: #2f7a2f; }

  h2.topic {
    font-size: 18px; margin: 32px 0 12px;
    padding-bottom: 6px; border-bottom: 2px solid #e0e0e0;
  }

  table.q {
    width: 100%; border-collapse: collapse; margin-bottom: 4px;
    page-break-inside: avoid;
  }
  table.q td {
    border: 1px solid #cfcfcf; padding: 10px 12px;
    vertical-align: top; font-size: 14px;
  }
  table.q td.num {
    width: 60px; font-weight: 700; color: #2a5db0; white-space: nowrap;
    background: #f4f7fc;
  }
  table.q td.qtext {
    width: 34%; font-weight: 600;
  }
  table.q td.opts { }
  .q-image {
    display: block; max-width: 100%; max-height: 360px;
    margin: 8px 0; border: 1px solid #ddd; border-radius: 4px;
  }

  /* Каждый вариант ответа — отдельным блоком */
  .opt-line {
    display: block;
    padding: 4px 8px;
    margin: 2px 0;
    border-radius: 4px;
    border: 1px solid transparent;
    line-height: 1.4;
  }
  .opt-line .opt-num {
    font-weight: 700;
    color: #555;
    margin-right: 4px;
  }
  .opt-line.correct {
    background: #e6ffed;
    border-color: #2f855a;
    font-weight: 700;
    color: #1c4532;
  }
  .opt-line.correct .opt-num { color: #2f855a; }
  .badge-correct {
    display: inline-block;
    margin-left: 8px;
    padding: 1px 8px;
    border-radius: 10px;
    background: #2f855a;
    color: #fff;
    font-size: 11px;
    font-weight: 700;
    letter-spacing: .3px;
    vertical-align: middle;
    text-transform: uppercase;
  }

  .print-btn {
    position: fixed; top: 20px; right: 20px;
    padding: 10px 18px; border: none; border-radius: 6px;
    background: #2b6cb0; color: #fff; font-weight: 600;
    cursor: pointer; box-shadow: 0 2px 8px rgba(0,0,0,.15);
    font-size: 14px;
  }
  .print-btn:hover { background: #1f4e80; }

  @media print {
    body { background: #fff; padding: 0; }
    .wrap { box-shadow: none; max-width: 100%; padding: 0; border-radius: 0; }
    .print-btn { display: none; }
    h2.topic { page-break-after: avoid; }
    table.q { page-break-inside: avoid; }
    table.q td { font-size: 12px; padding: 6px 8px; }
    .opt-line { padding: 2px 6px; }
  }
    /* Стилизация скроллбара для темной темы */
  ::-webkit-scrollbar {
    width: 8px;
    height: 8px;
  }
  ::-webkit-scrollbar-track {
    background: var(--bg);
  }
  ::-webkit-scrollbar-thumb {
    background: var(--border);
    border-radius: 4px;
  }
  ::-webkit-scrollbar-thumb:hover {
    background: var(--muted);
  }
  
  /* Для Firefox */
  * {
    scrollbar-width: thin;
    scrollbar-color: var(--border) var(--bg);
  }

  /* Отдельно стилизуем скроллбар в модалках, чтобы он не наследовал чужие стили */
  .card ::-webkit-scrollbar-track,
  #badgesModal ::-webkit-scrollbar-track,
  #questsModal ::-webkit-scrollbar-track,
  #recordsModal ::-webkit-scrollbar-track,
  #reviewListContent::-webkit-scrollbar-track,
  #badgesGrid::-webkit-scrollbar-track {
    background: var(--bg);
    border-radius: 8px;
  }
  
  .card ::-webkit-scrollbar-thumb,
  #badgesModal ::-webkit-scrollbar-thumb,
  #questsModal ::-webkit-scrollbar-thumb,
  #recordsModal ::-webkit-scrollbar-thumb,
  #reviewListContent::-webkit-scrollbar-thumb,
  #badgesGrid::-webkit-scrollbar-thumb {
    background: var(--border);
    border-radius: 8px;
  }
    /* 1. Указываем браузеру, что цветовая схема зависит от темы */
  :root {
    color-scheme: light dark;
  }

  /* 2. Убираем стрелочки у скроллбара (для Chrome/Edge/Safari) */
  ::-webkit-scrollbar-button {
    display: none !important;
    width: 0 !important;
    height: 0 !important;
  }

  /* 3. Стилизуем сам скроллбар */
  ::-webkit-scrollbar {
    width: 8px;
    height: 8px;
  }
  
  ::-webkit-scrollbar-track {
    background: transparent; /* Прозрачная дорожка */
  }
  
  ::-webkit-scrollbar-thumb {
    background: var(--border);
    border-radius: 4px;
  }
  
  ::-webkit-scrollbar-thumb:hover {
    background: var(--muted);
  }

  /* 4. Для Firefox (он не понимает ::-webkit) */
  * {
    scrollbar-width: thin;
    scrollbar-color: var(--border) transparent;
  }
  
    /* Принудительно задаем цветовую схему для темной темы */
  :root {
    color-scheme: dark light;
  }
  @media (prefers-color-scheme: light) {
    :root {
      color-scheme: light dark;
    }
  }

  /* Перебиваем скроллбар для всех контейнеров */
  ::-webkit-scrollbar {
    width: 6px !important;
    height: 6px !important;
    background-color: transparent !important;
  }
  
  ::-webkit-scrollbar-track {
    background-color: transparent !important;
  }
  
  ::-webkit-scrollbar-thumb {
    background-color: var(--border) !important;
    border-radius: 3px !important;
  }
  
  ::-webkit-scrollbar-thumb:hover {
    background-color: var(--muted) !important;
  }

  /* Убираем углы и кнопки */
  ::-webkit-scrollbar-button {
    display: none !important;
    width: 0 !important;
    height: 0 !important;
  }
  
  ::-webkit-scrollbar-corner {
    background-color: transparent !important;
  }

  /* Заставляем Firefox тоже уважать тему */
  * {
    scrollbar-width: thin !important;
    scrollbar-color: var(--border) transparent !important;
  }
  /* =========================================================
   ФИНАЛЬНЫЕ ШТРИХИ ДЛЯ ГЛАВНОГО ЭКРАНА
   ========================================================= */

/* 1. Еще больше уменьшаем высоту главной кнопки (делаем тоньше) */
.btn-hero {
  padding: 10px 20px !important; /* Уменьшили отступы */
  font-size: 16px !important;
  border-radius: 12px !important;
  font-weight: 700 !important;
}

/* 2. Красивый поиск с иконкой лупы */
#mobileSearchInput {
  padding: 12px 16px 12px 40px !important; /* Отступ слева под иконку */
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%236b7280' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Ccircle cx='11' cy='11' r='8'%3E%3C/circle%3E%3Cline x1='21' y1='21' x2='16.65' y2='16.65'%3E%3C/line%3E%3C/svg%3E") !important;
  background-repeat: no-repeat !important;
  background-position: 14px center !important;
  background-size: 18px !important;
}

/* Корректируем цвет иконки для темной темы */
@media (prefers-color-scheme: dark) {
  #mobileSearchInput {
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%2394a3b8' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Ccircle cx='11' cy='11' r='8'%3E%3C/circle%3E%3Cline x1='21' y1='21' x2='16.65' y2='16.65'%3E%3C/line%3E%3C/svg%3E") !important;
  }
}

/* --- ФИКСЫ ИНТЕРФЕЙСА --- */
.q-text { padding-right: 0 !important; text-align: left; } /* Текст на всю ширину */

#gamificationToasts > div {
  max-width: 90vw !important;
  min-width: 280px !important;
  width: max-content !important;
  padding: 12px 20px !important;
  font-size: 15px !important;
  box-shadow: 0 4px 16px rgba(0,0,0,0.2) !important;
}
@media (min-width: 768px) {
  #gamificationToasts > div {
    max-width: 400px !important; /* На ПК шире */
  }
}

/* Кнопки закрытия в модалках (Квесты, Карта) */
.modal-close-btn {
  background: var(--bg); border: none; width: 32px; height: 32px; border-radius: 50%;
  font-size: 16px; cursor: pointer; color: var(--muted);
  display: flex; align-items: center; justify-content: center; padding: 0; line-height: 1;
}

/* Карта прогресса (компоновка) */
.map-card {
  display: grid !important;
  grid-template-columns: 1fr auto !important;
  gap: 12px !important;
  align-items: center !important;
  padding: 16px !important;
}
.map-card-content { min-width: 0; }
.map-card-title { font-size: 15px; font-weight: 700; margin-bottom: 6px; line-height: 1.3; }
.map-card-status-badge {
  display: inline-block; padding: 4px 10px; border-radius: 12px; font-size: 12px; font-weight: 600;
}
.status-badge-red { background: var(--err-bg); color: var(--err); }
.status-badge-green { background: var(--ok-bg); color: var(--ok); }
.status-badge-yellow { background: var(--warn-bg); color: var(--warn); }
.status-badge-gray { background: var(--bg); color: var(--muted); border: 1px solid var(--border); }

/* Кнопки на финале */
.final-buttons { display: flex; flex-direction: column; gap: 10px; margin-top: 20px; }
.btn-final-primary { background: var(--accent); color: #fff; padding: 16px; border-radius: 12px; font-weight: bold; font-size: 16px; border: none; cursor: pointer; }
.btn-final-secondary { background: transparent; color: var(--accent); padding: 16px; border-radius: 12px; font-weight: bold; font-size: 16px; border: 1px solid var(--accent); cursor: pointer; }
.btn-final-ghost { background: transparent; color: var(--muted); padding: 16px; border-radius: 12px; font-weight: bold; font-size: 16px; border: none; cursor: pointer; }

/* Конфетти (Анимация победы) */
@keyframes confetti-fall {
  0% { transform: translateY(-100vh) rotate(0deg); opacity: 1; }
  100% { transform: translateY(100vh) rotate(720deg); opacity: 0; }
}
.confetti-piece {
  position: fixed; top: -10px; width: 10px; height: 10px; z-index: 9999;
  animation: confetti-fall 3s linear forwards; pointer-events: none;
}

#bossFightStart {
  background: var(--accent) !important;
  color: #fff !important;
  border: none !important;
  padding: 14px 28px !important;
  border-radius: 12px !important;
  font-size: 16px !important;
  font-weight: 700 !important;
  cursor: pointer;
  box-shadow: 0 4px 12px rgba(43,108,176,0.3);
}
#bossFightCancel {
  background: transparent !important;
  color: var(--muted) !important;
  border: 1px solid var(--border) !important;
  padding: 14px 28px !important;
  border-radius: 12px !important;
  font-size: 16px !important;
  font-weight: 600 !important;
  cursor: pointer;
}

.review-item {
  background: var(--card) !important;
  border: 1px solid var(--border) !important;
  border-radius: 16px !important;
  padding: 16px !important;
  margin-bottom: 12px !important;
}
.review-item.correct { border-left: 4px solid var(--ok) !important; }
.review-item.wrong { border-left: 4px solid var(--err) !important; }
.review-item.skipped { border-left: 4px solid var(--muted) !important; }

.r-opt {
  border-radius: 12px !important;
  padding: 12px 16px !important;
  font-size: 14px !important;
}
.r-opt.chosen-correct, .r-opt.correct { background: var(--ok-bg) !important; border-color: var(--ok) !important; }
.r-opt.chosen-wrong { background: var(--err-bg) !important; border-color: var(--err) !important; }

</style>
</head>
<body>
<button class="print-btn" onclick="window.print()">🖨 Печать / Сохранить в PDF</button>
<div class="wrap">
<h1>«${escapeHtmlForExport(fileKeyClean)}» — вопросы с ответами</h1>
<div class="doc-sub">Набор от ${dateStr}, ${topics.length} тем, ${totalQuestions} вопросов.</div>
<div class="hint">
  Правильный вариант выделен <b>зелёной заливкой</b>, <b>рамкой</b>, <b>жирным шрифтом</b>
  и меткой <span class="check">✓ ПРАВИЛЬНЫЙ ОТВЕТ</span>.
  Порядок вариантов в самом тесте может отличаться — ориентируйтесь на текст ответа.
</div>
`;

  for (const topic of topics) {
    html += `<h2 class="topic">${escapeHtmlForExport(topic.title)} (${topic.questions.length} вопр.)</h2>`;

    for (const q of topic.questions) {
      let imgHtml = "";
      if (q.image) {
        const dataUrl = await imageToDataUrl(q.image);
        if (dataUrl) {
          imgHtml = `<img class="q-image" src="${dataUrl}" alt="">`;
        } else {
          imgHtml = `<div style="color:#b03030;font-size:12px;">[картинка не найдена: ${escapeHtmlForExport(q.image)}]</div>`;
        }
      }

      const correctIdx = q.correct - 1;
      let optsHtml = imgHtml;
      q.options.forEach((opt, i) => {
        const isCorrect = i === correctIdx;
        const badge = isCorrect
          ? `<span class="badge-correct">✓ Правильный</span>`
          : "";
        optsHtml += `<span class="opt-line${isCorrect ? " correct" : ""}">`
          + `<span class="opt-num">${i + 1}.</span>`
          + `${escapeHtmlForExport(opt)}${badge}`
          + `</span>`;
      });

      html += `<table class="q">
        <tr>
          <td class="num">${escapeHtmlForExport(q.id)}</td>
          <td class="qtext">${escapeHtmlForExport(q.q)}</td>
          <td class="opts">${optsHtml}</td>
        </tr>
      </table>`;
    }
  }

  html += `</div>
</body>
</html>`;

  return { html, fileKeyClean };
}

async function exportToHtml() {
  if (state.topics.length === 0) {
    exportStatus.textContent = "Сначала загрузите файл вопросов.";
    exportStatus.className = "export-status err";
    return;
  }
  exportBtn.disabled = true;
  exportStatus.textContent = "";
  exportStatus.className = "export-status";
  exportProgress.textContent = "Готовим файл…";

  const totalQuestions = state.topics.reduce((acc, t) => acc + t.questions.length, 0);
  const totalImages = state.topics.reduce((acc, t) =>
    acc + t.questions.filter(q => q.image).length, 0);

  exportProgress.textContent = `Тем: ${state.topics.length}, вопросов: ${totalQuestions}, картинок: ${totalImages}. Обработка…`;

  try {
    // Дадим браузеру передохнуть перед асинхронной работой
    await new Promise(r => setTimeout(r, 50));
    const { html, fileKeyClean } = await buildExportHtml();

    const dateStr = new Date().toISOString().slice(0, 10);
    const fileName = fileKeyClean + "_вопросы_" + dateStr + ".html";

    // Правки для iOS: скачивание через <a download> на iPhone не работает — отдаём файл через «Поделиться» → «Сохранить в Файлы» (deliverFile)
    const blob = new Blob([html], { type: "text/html;charset=utf-8" });
    window.deliverFile(blob, fileName);

    exportStatus.textContent = "Готово: " + fileName;
    exportStatus.className = "export-status ok";
    exportProgress.textContent = "";
  } catch (err) {
    exportStatus.textContent = "Ошибка: " + err.message;
    exportStatus.className = "export-status err";
    exportProgress.textContent = "";
  } finally {
    exportBtn.disabled = false;
  }
}

exportBtn.addEventListener("click", exportToHtml);

/* =========================================================
   СТАРТ
   ========================================================= */
function start() {
  state._explosionTimer = null;
  state._resumePending = false;
  state._bossFight = null;
  clearAutoAdvance();
  buildOrders();
  updateSpecialCounts();
  state._sessionStartTime = Date.now();
  if (window.GameApp && window.GameApp._reload) window.GameApp._reload();
  state._bossFight = null;
  updateBossDayButton();
  render();
}

/* =========================================================
   ЗАГРУЗКА ФАЙЛА
   ========================================================= */
fileInput.addEventListener("change", (e) => {
  const file = e.target.files && e.target.files[0];
  if (!file) return;
  fileStatus.textContent = "Чтение файла…";
  fileStatus.className = "file-status";
  const reader = new FileReader();
  reader.onload = (ev) => {
    try {
      // Правки для iOS: загруженный файл вопросов запоминается на устройстве (IndexedDB) и открывается сам после перезапуска
      const __text = String(ev.target.result);
      const topics = parseTopicsFromText(__text, file.name);
      
      window.__CURRENT_QUESTIONS_TEXT = __text;

      loadTopics(topics, file.name, file.name);
      if (typeof window.iosRememberSet === "function") window.iosRememberSet(file.name, __text, topics);
    } catch (err) {
      fileStatus.textContent = "Ошибка: " + err.message;
      fileStatus.className = "file-status err";
    }
  };
  reader.onerror = () => {
    fileStatus.textContent = "Не удалось прочитать файл.";
    fileStatus.className = "file-status err";
  };
  reader.readAsText(file, "utf-8");
});

/* =========================================================
   НАСТРОЙКИ — свёртка
   ========================================================= */
function openSettings(open) {
  settingsPanel.classList.toggle("open", open);
  settingsToggle.classList.toggle("open", open);
  try { localStorage.setItem("ui:settingsOpen", open ? "1" : "0"); } catch (e) {}
}
settingsToggle.addEventListener("click", () => {
  openSettings(!settingsPanel.classList.contains("open"));
});

/* =========================================================
   ОБРАБОТЧИКИ
   ========================================================= */
$("#shuffleQ").addEventListener("change", () => { start(); saveSession(); });
$("#shuffleA").addEventListener("change", () => { start(); saveSession(); });
$("#restartBtn").addEventListener("click", () => {
  if (!confirm("Начать заново? Текущий прогресс сессии будет сброшен.")) return;
  clearSession();
  start();
});
$("#specialFav").addEventListener("change", start);
$("#specialErr").addEventListener("change", start);
$("#showImages").addEventListener("change", (e) => {
  CONFIG.showImages = e.target.checked;
  saveSession();
  render();
});

$("#topBtn").addEventListener("click", () => {
  if (state.topics.length === 0) {
    alert("Сначала загрузите файл вопросов.");
    return;
  }
  state.showingTop = true;
  state.showingReview = false;
  state.finished = false;
  render();
});

$("#resetStatsBtn").addEventListener("click", () => {
  if (!confirm("Сбросить всю статистику ошибок для этого набора вопросов?")) return;
  state.stats = {};
  saveStats();
  updateSpecialCounts();
  start();
});

$("#clearAllProgressBtn")?.addEventListener("click", () => {
  if (!confirm("⚠️ Удалить ВСЮ статистику, достижения, XP, избранное, рекорды и боссов для текущего набора?\n\nЭто действие НЕОБРАТИМО.")) return;
  if (!confirm("Точно удалить? Отменить будет невозможно.")) return;
  
  const deletedCount = clearAllProgressForSet();
  if (deletedCount > 0) {
    alert(`✅ Удалено ${deletedCount} записей.`);
    start();
  } else {
    alert("Нечего очищать — прогресс уже пуст.");
  }
});

modeSelect.addEventListener("change", () => {
  CONFIG.mode = modeSelect.value;
  start();
  saveSession();
});

$("#topicsAll").addEventListener("click", (e) => {
  e.preventDefault();
  state.selectedTopicIds = new Set(state.topics.map(t => t.id));
  syncTopicCheckboxes();
  saveSelectedTopics();
  start();
});
$("#topicsNone").addEventListener("click", (e) => {
  e.preventDefault();
  state.selectedTopicIds = new Set();
  syncTopicCheckboxes();
  saveSelectedTopics();
  start();
});

$("#shuffleQ").checked = CONFIG.shuffleQuestions;
$("#shuffleA").checked = CONFIG.shuffleAnswers;
$("#autoAdvance").checked = CONFIG.autoAdvanceAfterCorrect;
$("#showImages").checked = CONFIG.showImages;
modeSelect.value = CONFIG.mode;

$("#autoAdvance").addEventListener("change", (e) => {
  CONFIG.autoAdvanceAfterCorrect = e.target.checked;
  clearAutoAdvance();
  saveSession();
});

/* =========================================================
   ПОИСК
   ========================================================= */
const searchInput = $("#searchInput");
const searchResults = $("#searchResults");
const searchBlock = $("#searchBlock");

function highlight(text, query) {
  if (!query) return escapeHtml(text);
  const lower = String(text).toLowerCase();
  const q = query.toLowerCase();
  const idx = lower.indexOf(q);
  if (idx === -1) return escapeHtml(text);
  return escapeHtml(text.slice(0, idx)) + "<mark>" + escapeHtml(text.slice(idx, idx + q.length)) + "</mark>" + escapeHtml(text.slice(idx + q.length));
}
function findQuestions(query) {
  if (!query || query.trim().length < 2) return [];
  const q = query.trim().toLowerCase();
  const scored = [];
  getAllQuestionsFlat().forEach(item => {
    let score = 0;
    if (item.id.toLowerCase() === q) score = 100;
    else if (item.id.toLowerCase().includes(q)) score = 80;
    if (item.q.toLowerCase().includes(q)) score = Math.max(score, 60);
    if (item.options.some(o => o.toLowerCase().includes(q))) score = Math.max(score, 40);
    if ((item._topicTitle || "").toLowerCase().includes(q)) score = Math.max(score, 20);
    if (score > 0) scored.push({ item, score });
  });
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, 15).map(x => x.item);
}
function renderSearchResults(query) {
  const results = findQuestions(query);
  if (!query || query.trim().length < 2) {
    searchResults.classList.remove("open");
    searchResults.innerHTML = "";
    return;
  }
  if (results.length === 0) {
    searchResults.innerHTML = `<div class="search-empty">Ничего не найдено</div>`;
    searchResults.classList.add("open");
    return;
  }
  const q = query.trim();
  let html = "";
  results.forEach(item => {
    const idx = state.order.findIndex(x => x.id === item.id && x._topicId === item._topicId);
    const inCurrent = idx !== -1;
    const status = inCurrent
      ? `<span style="color:var(--ok);font-size:12px;">— в текущем тесте, вопрос №${idx + 1}</span>`
      : `<span style="color:var(--muted);font-size:12px;">— не входит в текущий тест</span>`;
    const stat = getStat(item);
    const statStr = (stat.ok || stat.err) ? ` · <span style="color:var(--muted);font-size:12px;">${stat.ok}/${stat.err}</span>` : "";
    const imgStr = item.image ? ` · <span style="font-size:12px;">🖼</span>` : "";
    html += `<div class="search-item" data-id="${item.id}" data-topic="${item._topicId}" data-idx="${idx}">`;
    html += `<div><span class="sr-id">${escapeHtml(item.id)}</span>`;
    html += `<span class="sr-topic">${escapeHtml(item._topicTitle || "")} ${status}${statStr}${imgStr}</span></div>`;
    html += `<div class="sr-q">${highlight(item.q, q)}</div>`;
    html += `</div>`;
  });
  searchResults.innerHTML = html;
  searchResults.classList.add("open");
  searchResults.querySelectorAll(".search-item").forEach(el => {
    el.addEventListener("click", () => {
      const idx = parseInt(el.dataset.idx, 10);
      if (idx >= 0) {
        clearAutoAdvance();
        state.current = idx;
        state.finished = false;
        state.showingReview = false;
        state.showingTop = false;
        render();
        searchResults.classList.remove("open");
        searchInput.value = "";
      } else {
        const topic = el.dataset.topic;
        const topicTitle = state.topics.find(t => t.id === topic)?.title || "";
        alert(`Вопрос ${el.dataset.id} есть в теме «${topicTitle}», но не входит в текущий тест.`);
        searchResults.classList.remove("open");
      }
    });
  });
}
//searchInput.addEventListener("input", (e) => renderSearchResults(e.target.value));
searchInput.addEventListener("focus", (e) => {
  if (e.target.value && e.target.value.trim().length >= 2) renderSearchResults(e.target.value);
});
document.addEventListener("click", (e) => {
  if (e.target.id === "closeBossResultBtn") {
    document.getElementById("bossResultModal").style.display = "none";
    closeTestModal(); // Закрываем тест и возвращаемся на главный экран
  }
});
searchInput.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    searchInput.value = "";
    searchResults.classList.remove("open");
    searchInput.blur();
  }
});

/* =========================================================
   Сводка тем
   ========================================================= */
topicsSummaryEl.addEventListener("click", () => {
  const expanded = topicsSummaryEl.dataset.expanded === "1";
  topicsSummaryEl.dataset.expanded = expanded ? "0" : "1";
  buildHeader();
});

/* =========================================================
   ИНИЦИАЛИЗАЦИЯ
   ========================================================= */
(function init() {
  rebuildSkinSelect();
document.getElementById("bossDayBtn")?.addEventListener("click", () => {
  const data = loadBossData();
  const today = getTodayDateStr();
  
  if (data.day.date === today && data.day.defeated) {
    const modal = document.getElementById("bossResultModal");
    if (modal) {
      document.getElementById("bossResultIcon").textContent = "👑";
      document.getElementById("bossResultTitle").textContent = "Босс уже повержен!";
      document.getElementById("bossResultDesc").textContent = `Сегодня Вы уже победили: ${data.day.name}. Возвращайтесь завтра за новым боссом.`;
      document.getElementById("bossResultXp").textContent = "🏆 Вы великолепны!";
      document.getElementById("bossResultIcon").className = "boss-win-anim";
      modal.style.display = "flex";
    }
    return;
  }
  
  // Если босс на сегодня еще не сгенерирован, генерируем всё: имя, иконку, скин
  if (data.day.date !== today) {
    data.day.date = today;
    data.day.name = generateRandomBossName();
    data.day.icon = getRandomBossIcon(); // Генерируем уникальную иконку
    data.day.skin = getRandomBossSkin(); // Генерируем скин
    data.day.defeated = false;
    saveBossData(data);
  }
  
  // Передаем иконку и скин в модалку
  showBossModal("day", null, "Босс дня", data.day.name, 100, data.day.icon, data.day.skin);
});
  const savedSkin = (() => {
    try { return localStorage.getItem(ACTIVE_SKIN_KEY) || "default"; } catch (e) { return "default"; }
  })();
  if (skinSelect.options.length && [...skinSelect.options].some(o => o.value === savedSkin)) {
    skinSelect.value = savedSkin;
    applySkin(savedSkin);
  } else {
    applySkin("default");
  }

  let settingsOpen = false;
  try { settingsOpen = localStorage.getItem("ui:settingsOpen") === "1"; } catch (e) {}
  openSettings(settingsOpen);

  // Правки для iOS: сначала загружаем набор вопросов, сохранённый на устройстве (IndexedDB), и только потом встроенный questions.js — на iPhone нельзя каждый раз выбирать файл заново
  let __bootLoaded = false;
  if (window.__BOOT_SET && window.__BOOT_SET.text) {
    try {
      const __t = parseTopicsFromText(window.__BOOT_SET.text);
      if (Array.isArray(__t) && __t.length) { loadTopics(__t, window.__BOOT_SET.name + " (сохранён на устройстве)", window.__BOOT_SET.name); __bootLoaded = true; }
    } catch (e) { console.warn("[ios] сохранённый набор не разобран", e); }
  }
  if (__bootLoaded) {
    /* загружен набор пользователя */
} else if (typeof TOPICS !== "undefined" && Array.isArray(TOPICS) && TOPICS.length > 0) {
    // Если загружаем встроенный файл, берем его исходный код из скрипта на странице
    const qScript = document.getElementById('src-questions') || Array.from(document.scripts).find(s => s.src.includes('questions.js'));
    window.__CURRENT_QUESTIONS_TEXT = qScript ? (qScript.textContent || "") : "";
    
    loadTopics(TOPICS, "questions.js (автозагрузка)", "questions.js");
} else {
    render();
  }
})();

/* =========================================================
   СОХРАНЕНИЕ СЕССИИ ПРИ ЗАКРЫТИИ СТРАНИЦЫ
   ========================================================= */
function __saveOnLeave() {
  if (state.topics.length > 0 && state.order.length > 0) {
    saveSession();
  }
  try { if (activityStats.isActive) saveActiveTime(); } catch (e) {}
}
window.addEventListener("beforeunload", __saveOnLeave);
// iOS Safari / PWA: beforeunload не срабатывает — сохраняемся при сворачивании и закрытии
window.addEventListener("pagehide", __saveOnLeave);
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") __saveOnLeave(); });

/* =========================================================
   МОДУЛЬ СТАТИСТИКИ И ГРАФИКОВ
   ========================================================= */

const statsOverlay = $("#statsOverlay");
let chartSummaryInstance = null;
let chartTopicsInstance = null;
let chartHardInstance = null;

$("#statsBtn").addEventListener("click", () => {
  if (state.topics.length === 0) {
    alert("Сначала загрузите вопросы.");
    return;
  }
  buildStatistics();
  statsOverlay.style.display = "flex";
  document.body.style.overflow = "hidden";
});

$("#closeStatsBtn").addEventListener("click", () => {
  statsOverlay.style.display = "none";
  document.body.style.overflow = "";
});

function buildStatistics() {
  // Правки для iOS: Chart.js теперь встроен локально (CDN не грузился офлайн и при file://); если всё же нет — графики пропускаются без ошибки
  if (typeof Chart === "undefined") { console.warn("Chart.js не загружен — графики пропущены"); return; }
  const isDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  const gridColor = isDark ? 'rgba(255, 255, 255, 0.15)' : 'rgba(0, 0, 0, 0.05)';
  const tickColor = isDark ? '#8a93a1' : '#6b7280';

  const allQuestions = getAllQuestionsFlat();
  
  let learnedCount = 0;
  let problemCount = 0;
  let newCount = 0;

  const topicLabels = [];
  const topicLearnedData = [];
  const topicProblemData = [];

  state.topics.forEach(topic => {
    let tLearned = 0;
    let tProblem = 0;
    const totalInTopic = topic.questions.length;
    
    topic.questions.forEach(q => {
      const key = topic.id + ":" + q.id;
      const stat = state.stats[key] || { ok: 0, err: 0 };
      
      if (stat.err > 0) {
        tProblem++;
        problemCount++;
      } else if (stat.ok > 0) {
        tLearned++;
        learnedCount++;
      } else {
        newCount++;
      }
    });

    const shortTitle = topic.title.length > 20 ? topic.title.substring(0, 20) + '...' : topic.title;
    topicLabels.push(shortTitle);
    topicLearnedData.push(totalInTopic > 0 ? (tLearned / totalInTopic) * 100 : 0);
    topicProblemData.push(totalInTopic > 0 ? (tProblem / totalInTopic) * 100 : 0);
  });

  const total = allQuestions.length;
  const pct = total > 0 ? Math.round((learnedCount / total) * 100) : 0;
  $("#summaryText").innerHTML = `
    <div style="font-size:24px; font-weight:bold; color:var(--ok); margin-bottom:4px;">${pct}%</div>
    Освоено вопросов: <b>${learnedCount}</b> из ${total}<br>
    <span style="color:var(--err); font-size:13px;">Активных ошибок: ${problemCount}</span> · 
    <span style="color:var(--muted); font-size:13px;">Не начатых: ${newCount}</span>
  `;

  // --- 1. Пончик (Общий прогресс) ---
  if (chartSummaryInstance) chartSummaryInstance.destroy();
  chartSummaryInstance = new Chart($("#chartSummary"), {
    type: 'doughnut',
    data: {
      labels: ['Освоено', 'Активные ошибки', 'Не начато'],
      datasets: [{ data: [learnedCount, problemCount, newCount], backgroundColor: ['#2f855a', '#c53030', '#e2e6ee'], borderWidth: 0 }]
    },
    options: { cutout: '70%', plugins: { legend: { display: false } } }
  });

  // --- 2. Прогресс по темам ---
  if (chartTopicsInstance) chartTopicsInstance.destroy();
  chartTopicsInstance = new Chart($("#chartTopics"), {
    type: 'bar',
    data: {
      labels: topicLabels,
      datasets: [
        { label: 'Освоено', data: topicLearnedData, backgroundColor: '#2f855a' },
        { label: 'С ошибками', data: topicProblemData, backgroundColor: '#c53030' }
      ]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      scales: {
        x: { stacked: true, ticks: { color: tickColor, font: { size: 10 } }, grid: { display: false } },
        y: { stacked: true, beginAtZero: true, max: 100, ticks: { stepSize: 20, color: tickColor, callback: function(v) { return v + '%'; } }, grid: { color: gridColor } }
      },
      plugins: { legend: { position: 'bottom', labels: { color: tickColor } } }
    }
  });

  // --- 3. Топ-5 сложных ---
  const sortedByErr = [...allQuestions].map(q => ({ q, err: getStat(q).err })).filter(x => x.err > 0).sort((a, b) => b.err - a.err).slice(0, 5);
  const hardLabels = sortedByErr.map(x => `${x.q.id} (${x.q._topicTitle.split('.')[0]})`);
  const hardData = sortedByErr.map(x => x.err);

  if (chartHardInstance) chartHardInstance.destroy();
  chartHardInstance = new Chart($("#chartHard"), {
    type: 'bar',
    data: {
      labels: hardLabels.length ? hardLabels : ["Нет ошибок! Так держать!"],
      datasets: [{ label: 'Ошибок', data: hardData.length ? hardData : [0], backgroundColor: '#e53e3e', borderRadius: 4, barThickness: 20 }]
    },
    options: {
      indexAxis: 'y', responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: { x: { beginAtZero: true, ticks: { stepSize: 1, color: tickColor }, grid: { color: gridColor } }, y: { ticks: { color: tickColor }, grid: { display: false } } }
    }
  });

  // --- 4. Точность ответов ---
  let totalOk = 0; let totalErr = 0;
  allQuestions.forEach(q => { const st = getStat(q); totalOk += st.ok; totalErr += st.err; });

  if (window.chartAccuracyInstance) window.chartAccuracyInstance.destroy();
  window.chartAccuracyInstance = new Chart($("#chartAccuracy"), {
    type: 'pie',
    data: { labels: ['Верно', 'Неверно'], datasets: [{ data: [totalOk, totalErr], backgroundColor: ['#2f855a', '#c53030'], borderWidth: 0 }] },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom', labels: { color: tickColor } } } }
  });

  // --- 5. Среднее время ответа ---
  const speedLabels = []; const speedData = []; const topicTimes = activityStats.history.topics || {};
  state.topics.forEach(t => {
    speedLabels.push(t.title.length > 15 ? t.title.substring(0, 15) + '...' : t.title);
    const tData = topicTimes[t.id];
    speedData.push((tData && tData.count > 0) ? Math.round(tData.totalTime / tData.count) : 0);
  });

  if (window.chartSpeedInstance) window.chartSpeedInstance.destroy();
  window.chartSpeedInstance = new Chart($("#chartSpeed"), {
    type: 'bar',
    data: { labels: speedLabels, datasets: [{ label: 'Секунд', data: speedData, backgroundColor: '#4a9eff', borderRadius: 4 }] },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, ticks: { color: tickColor }, grid: { color: gridColor } }, x: { ticks: { color: tickColor }, grid: { display: false } } } }
  });

  // --- 6. Графики активности (ФИКС ДАТ) ---
  const dates = []; const timeData = []; const answersData = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    // Формат для отображения (ДД.ММ)
    dates.push(d.toLocaleDateString('ru-RU').substring(0, 5)); 
    // Формат для поиска в базе (YYYY-MM-DD)
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const key = `${y}-${m}-${day}`;
    
    const dayData = activityStats.history.days[key] || { time: 0, answers: 0 };
    timeData.push(Math.round(dayData.time / 60));
    answersData.push(dayData.answers);
  }

  if (window.chartTimeInstance) window.chartTimeInstance.destroy();
  window.chartTimeInstance = new Chart($("#chartTime"), {
    type: 'line',
    data: { labels: dates, datasets: [{ label: 'Минут', data: timeData, borderColor: '#4a9eff', backgroundColor: 'rgba(74, 158, 255, 0.2)', fill: true, tension: 0.3 }] },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { ticks: { color: tickColor }, grid: { color: gridColor } }, x: { ticks: { color: tickColor }, grid: { display: false } } } }
  });

  if (window.chartAnswersInstance) window.chartAnswersInstance.destroy();
  window.chartAnswersInstance = new Chart($("#chartAnswers"), {
    type: 'bar',
    data: { labels: dates, datasets: [{ label: 'Вопросов', data: answersData, backgroundColor: '#2f855a', borderRadius: 4 }] },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, ticks: { stepSize: 1, color: tickColor }, grid: { color: gridColor } }, x: { ticks: { color: tickColor }, grid: { display: false } } } }
  });

  // --- 8. Радар компетенций ---
  const radarLabels = state.topics.map(t => t.title.length > 20 ? t.title.substring(0, 20) + '...' : t.title);
  const radarData = state.topics.map(t => {
    let learned = 0;
    t.questions.forEach(q => {
      const st = state.stats[t.id + ":" + q.id] || { ok: 0, err: 0 };
      if (st.err === 0 && st.ok > 0) learned++;
    });
    return t.questions.length > 0 ? Math.round((learned / t.questions.length) * 100) : 0;
  });

  if (window.chartRadarInstance) window.chartRadarInstance.destroy();
  window.chartRadarInstance = new Chart($("#chartRadar"), {
    type: 'radar',
    data: {
      labels: radarLabels,
      datasets: [{ label: 'Освоено (%)', data: radarData, backgroundColor: 'rgba(74, 158, 255, 0.2)', borderColor: '#4a9eff', pointBackgroundColor: '#4a9eff' }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      scales: { r: { angleLines: { color: gridColor }, grid: { color: gridColor }, pointLabels: { color: tickColor, font: { size: 11 } }, ticks: { display: false, min: 0, max: 100, stepSize: 20 } } },
      plugins: { legend: { display: false } }
    }
  });

  // --- 9. Структура базы ---
  let withImages = 0; let noShuffle = 0; let standard = 0;
  state.topics.forEach(t => {
    t.questions.forEach(q => {
      let counted = false;
      if (q.image) { withImages++; counted = true; }
      if (q.shuffle === false) { noShuffle++; counted = true; }
      if (!counted) standard++;
    });
  });

  if (window.chartStructureInstance) window.chartStructureInstance.destroy();
  window.chartStructureInstance = new Chart($("#chartStructure"), {
    type: 'bar',
    data: { labels: ['Стандартные', 'С картинками', 'Без перемешивания'], datasets: [{ data: [standard, withImages, noShuffle], backgroundColor: ['#6b7280', '#4a9eff', '#e53e3e'], borderRadius: 4 }] },
    options: { indexAxis: 'y', responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { x: { beginAtZero: true, ticks: { stepSize: 1, color: tickColor }, grid: { color: gridColor } }, y: { ticks: { color: tickColor }, grid: { display: false } } } }
  });

  // --- 10. Кривая забывания ---
  const daysAgo = { "Сегодня": 0, "1-3 дня": 0, "4-7 дней": 0, "1-2 недели": 0, "> 2 недель": 0 };
  const now = Date.now(); const dayMs = 24 * 60 * 60 * 1000;
  state.topics.forEach(t => {
    t.questions.forEach(q => {
      const st = state.stats[t.id + ":" + q.id];
      if (!st || !st.lastDate) return;
      const daysPassed = Math.floor((now - st.lastDate) / dayMs);
      if (daysPassed === 0) daysAgo["Сегодня"]++;
      else if (daysPassed <= 3) daysAgo["1-3 дня"]++;
      else if (daysPassed <= 7) daysAgo["4-7 дней"]++;
      else if (daysPassed <= 14) daysAgo["1-2 недели"]++;
      else daysAgo["> 2 недель"]++;
    });
  });

  if (window.chartForgettingInstance) window.chartForgettingInstance.destroy();
  window.chartForgettingInstance = new Chart($("#chartForgetting"), {
    type: 'bar',
    data: { labels: Object.keys(daysAgo), datasets: [{ label: 'Количество вопросов', data: Object.values(daysAgo), backgroundColor: ['#2f855a', '#68d391', '#ecc94b', '#ed8936', '#e53e3e'], borderRadius: 4 }] },
    options: {
      responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } },
      scales: { x: { ticks: { color: tickColor }, grid: { display: false } }, y: { beginAtZero: true, ticks: { stepSize: 1, color: tickColor }, grid: { color: gridColor } } },
      onClick: (e, elements) => {
        if (elements.length > 0) showQuestionsForCategory(Object.keys(daysAgo)[elements[0].index]);
      }
    }
  });

  // --- 12. Распределение ответов ---
  const maxOptions = Math.max(...allQuestions.map(q => q.options.length), 0);
  const optionGroups = {}; 
  allQuestions.forEach(q => {
    const optCount = q.options.length;
    if (!optionGroups[optCount]) optionGroups[optCount] = Array(optCount).fill(0);
    if (q.correct >= 1 && q.correct <= optCount) optionGroups[optCount][q.correct - 1]++;
  });

  const yLabels = []; const datasets = []; const colorPalette = ['#4a9eff', '#2f855a', '#b7791f', '#9f7aea', '#e53e3e', '#38b2ac'];
  const optionsCounts = Object.keys(optionGroups).sort((a, b) => a - b);
  optionsCounts.forEach(count => yLabels.push(`Вопросов с ${count} вариантами`));

  for (let pos = 1; pos <= maxOptions; pos++) {
    const data = optionsCounts.map(count => {
      const group = optionGroups[count]; const tot = group.reduce((a, b) => a + b, 0);
      return tot === 0 ? 0 : Math.round((group[pos - 1] / tot) * 100);
    });
    datasets.push({ label: `Позиция ${pos}`, data: data, backgroundColor: colorPalette[(pos - 1) % colorPalette.length], barPercentage: 0.9 });
  }

  if (window.chartAnswerDistInstance) window.chartAnswerDistInstance.destroy();
  window.chartAnswerDistInstance = new Chart($("#chartAnswerDist"), {
    type: 'bar',
    data: { labels: yLabels, datasets: datasets },
    options: {
      indexAxis: 'y', responsive: true, maintainAspectRatio: false,
      plugins: { legend: { position: 'bottom', labels: { color: tickColor, boxWidth: 12, font: {size: 11} } } },
      scales: { x: { stacked: true, beginAtZero: true, max: 100, ticks: { callback: v => v + '%', color: tickColor }, grid: { color: gridColor } }, y: { stacked: true, grid: { display: false }, ticks: { color: tickColor } } }
    }
  });

  renderHeatmap();
}
function renderHeatmap() {
  const container = $("#heatmapContainer");
  if (!container) return;
  
  // Убрали проверку offsetParent, так как она ломает отрисовку на десктопе

  container.innerHTML = "";

  const today = new Date();
  today.setHours(0,0,0,0); 
  
  const daysMap = activityStats.history.days || {};
  const daysNames = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
  
  const currentDayOfWeek = today.getDay() === 0 ? 7 : today.getDay();
  const startDate = new Date(today);
  startDate.setDate(today.getDate() - (currentDayOfWeek - 1) - 98);

  const grid = document.createElement("div");
  grid.style.display = "grid";
  grid.style.gridTemplateColumns = "20px repeat(15, 14px)";
  grid.style.gap = "4px";
  grid.style.alignItems = "center";

  const formatDate = (d) => {
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const formatDateOld = (d) => {
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    return `${day}.${month}.${year}`;
  };

  for (let i = 0; i < 7; i++) {
    const label = document.createElement("div");
    label.textContent = daysNames[i];
    label.style.fontSize = "10px";
    label.style.color = "var(--muted)";
    label.style.textAlign = "right";
    label.style.paddingRight = "4px";
    grid.appendChild(label);

    for (let w = 0; w < 15; w++) {
      const d = new Date(startDate);
      d.setDate(startDate.getDate() + (w * 7) + i);
      
      const box = document.createElement("div");
      box.style.width = "14px";
      box.style.height = "14px";
      box.style.borderRadius = "2px";
      
      if (d > today) {
        box.style.backgroundColor = "transparent";
      } else {
        const dateStrNew = formatDate(d);
        const dateStrOld = formatDateOld(d);
        
        const dayData = daysMap[dateStrNew] || daysMap[dateStrOld];
        
        box.style.backgroundColor = "var(--border)"; 
        
        if (dayData && dayData.time > 0) {
          const mins = dayData.time / 60;
          if (mins < 5) box.style.backgroundColor = "#9ae6b4";
          else if (mins < 15) box.style.backgroundColor = "#68d391";
          else if (mins < 30) box.style.backgroundColor = "#38a169";
          else box.style.backgroundColor = "#2f855a";
        }
        
        box.title = `${dateStrOld}: ${dayData ? Math.round(dayData.time / 60) : 0} мин.`;
        box.style.cursor = "help";
      }
      
      grid.appendChild(box);
    }
  }
  
  container.appendChild(grid);
}

function showQuestionsForCategory(categoryName) {
  const now = Date.now();
  const dayMs = 24 * 60 * 60 * 1000;
  const list = [];

  state.topics.forEach(t => {
    t.questions.forEach(q => {
      const st = state.stats[t.id + ":" + q.id];
      if (!st || !st.lastDate) return;
      
      const daysPassed = Math.floor((now - st.lastDate) / dayMs);
      let match = false;
      
      if (categoryName === "Сегодня" && daysPassed === 0) match = true;
      else if (categoryName === "1-3 дня" && daysPassed > 0 && daysPassed <= 3) match = true;
      else if (categoryName === "4-7 дней" && daysPassed > 3 && daysPassed <= 7) match = true;
      else if (categoryName === "1-2 недели" && daysPassed > 7 && daysPassed <= 14) match = true;
      else if (categoryName === "> 2 недель" && daysPassed > 14) match = true;

      if (match) list.push({ q, topicTitle: t.title, daysPassed });
    });
  });

  list.sort((a, b) => b.daysPassed - a.daysPassed);

  const overlay = document.getElementById('reviewListOverlay');
  const title = document.getElementById('reviewListTitle');
  const content = document.getElementById('reviewListContent');
  const startBtn = document.getElementById('startReviewSetBtn');

  title.textContent = `Вопросы категории: ${categoryName} (${list.length} шт.)`;
  
  if (list.length === 0) {
    content.innerHTML = `<div style="color:var(--muted); text-align:center; padding:20px;">В этой категории пока нет вопросов.</div>`;
    startBtn.style.display = "none";
  } else {
    let html = "";
    list.forEach(item => {
      html += `<div style="border:1px solid var(--border); border-radius:6px; padding:12px; background:#f9fafb; color: var(--text);">`;
      html += `<div style="font-size:12px; color:var(--muted); margin-bottom:4px;">`;
      html += `Тема: ${escapeHtml(item.topicTitle)} · Вопрос ${item.q.id} · Не отвечал ${item.daysPassed} дн.`;
      html += `</div>`;
      html += `<div style="font-size:14px;">${escapeHtml(item.q.q)}</div>`;
      html += `</div>`;
    });
    content.innerHTML = html;
    
    startBtn.style.display = "block";
    startBtn.onclick = () => {
      overlay.style.display = "none";
      statsOverlay.style.display = "none";
      document.body.style.overflow = "";

      const customQuestions = list.map(item => ({
        ...item.q,
        _topicId: item.q._topicId,
        _topicTitle: item.topicTitle
      }));

      state.order = customQuestions;
      state.optionOrders = {};
      state.answers = {};
      state.current = 0;
      state.finished = false;
      state.showingReview = false;
      state.showingTop = false;

      customQuestions.forEach(item => {
        let idxs = item.options.map((_, i) => i);
        if (item.shuffle !== false) idxs = shuffle(idxs);
        state.optionOrders[item.id] = idxs;
      });

      CONFIG.mode = "training";
      $("#modeSelect").value = "training";

      // ▼▼▼ ВАЖНО: Вызываем мобильную модалку ▼▼▼
      if (typeof launchMobileTest === 'function') {
        launchMobileTest();
      } else {
        render(); // Фолбэк
      }
    };
  } // ЗАКРЫВАЕМ else

  overlay.style.display = "flex";
} // ЗАКРЫВАЕМ функцию showQuestionsForCategory
/* =========================================================
   КАРТА ПРОГРЕССА ПО ТЕМАМ
   ========================================================= */
(function initMap() {
  // Ждём полной загрузки DOM
  function setup() {
    const mapBtn = document.getElementById("mapBtn");
    const mapOverlay = document.getElementById("mapOverlay");
    const mapGrid = document.getElementById("mapGrid");
    const closeBtn = document.getElementById("closeMapBtn");

    // Если элементов нет — выходим (карта не подключена в HTML)
    if (!mapBtn || !mapOverlay || !mapGrid) {
      console.warn("[map] Элементы карты не найдены в DOM");
      return;
    }

       function buildMap() {
        if (!state.topics || state.topics.length === 0) {
          mapGrid.innerHTML = `<div style="grid-column:1/-1; text-align:center; color:var(--muted); padding:40px;">Нет загруженных тем.</div>`;
          return;
        }

        let html = "";
        
        state.topics.forEach(t => {
          const total = t.questions.length;
          let mastered = 0;
          let withErrors = 0;
          let notStarted = 0;

          t.questions.forEach(q => {
            const s = state.stats[t.id + ":" + q.id] || { ok: 0, err: 0 };
            if (s.err > 0) {
              withErrors++;
            } else if (s.ok > 0) {
              mastered++;
            } else {
              notStarted++;
            }
          });

          const pct = total > 0 ? Math.round((mastered / total) * 100) : 0;
          
          // Бейджи (Светофор)
          let statusBadge = "";
          if (withErrors > 0) {
            statusBadge = `<span class="map-card-status-badge status-badge-red">🔴 Есть ошибки</span>`;
          } else if (pct >= 100) {
            statusBadge = `<span class="map-card-status-badge status-badge-green">🟢 Освоено</span>`;
          } else if (pct > 0) {
            statusBadge = `<span class="map-card-status-badge status-badge-yellow">🟡 В процессе</span>`;
          } else {
            statusBadge = `<span class="map-card-status-badge status-badge-gray">⚪ Не начато</span>`;
          }

          const tooltip = `Освоено: ${mastered}\nС ошибками: ${withErrors}\nНе начато: ${notStarted}`;

          // --- ЛОГИКА ДЛЯ ПРАВОЙ ЧАСТИ КАРТОЧКИ (КРУГ ИЛИ БОСС) ---
          const bossData = loadBossData();
          const isDefeated = bossData.defeatedTopics[t.id];
          
          let rightIconHtml = "";
          let cardClass = "map-card";

          if (pct === 100) {
            // Тема освоена — показываем босса
            let bossIcon = bossData.topicIcons[t.id];
            let bossSkin = bossData.topicSkins[t.id];
            
            // Если босса ещё нет, генерируем
            if (!bossIcon) {
              bossIcon = getRandomBossIcon();
              bossSkin = getRandomBossSkin();
              bossData.topicIcons[t.id] = bossIcon;
              bossData.topicSkins[t.id] = bossSkin;
              saveBossData(bossData);
            }
            
            const glowColor = bossSkin ? bossSkin.color : 'var(--err)';
            
            if (isDefeated) {
              cardClass += " map-boss-defeated"; // Золотая карточка
            }
            
            // Иконка всегда кликабельна (можно переиграть)
            rightIconHtml = `<div class="map-boss-icon" data-topic="${t.id}" title="Сразиться с боссом" style="text-shadow: 0 0 15px ${glowColor};">${bossIcon}</div>`;
          } else {
            // Тема не освоена — показываем круг
            const circleLength = 125.6;
            const dashArray = `${(pct / 100) * circleLength} ${circleLength}`;
            rightIconHtml = `
              <div class="map-card-circle">
                <svg viewBox="0 0 48 48">
                  <circle class="bg" cx="24" cy="24" r="20"></circle>
                  <circle class="fg" cx="24" cy="24" r="20" stroke-dasharray="${dashArray}"></circle>
                </svg>
                <div class="pct">${pct}%</div>
              </div>`;
          }

          // --- СБОРКА КАРТОЧКИ ---
          html += `<div class="${cardClass}" data-topic-id="${t.id}" title="${tooltip}" onclick="startTopicFromMap('${t.id}')">
            <div class="map-card-content">
              <div class="map-card-title">${escapeHtml(t.title)}</div>
              <div style="margin-bottom:8px;">${statusBadge}</div>
              <div class="map-card-meta">
                ${mastered} / ${total} вопр.
              </div>
            </div>
            ${rightIconHtml}
          </div>`;
        });

        // Блок боссов внизу

        const finalData = loadBossData();
        const finalName = getBossName();
        const isFinalDefeated = finalData.finalBoss.defeated;
        const isUltraDefeated = finalData.ultraBoss.defeated;

        const finalClass = isFinalDefeated ? "boss-final-btn boss-defeated" : "boss-final-btn";
        const ultraClass = isUltraDefeated ? "boss-ultra-btn boss-defeated" : "boss-ultra-btn";

        const finalHtml = `
          <div class="boss-bottom-grid">
            <div class="map-card ${finalClass}" id="finalBossBtn">
              <div class="boss-btn-icon">🌙</div>
              <div class="boss-btn-title">Финальный босс</div>
              <div class="boss-btn-desc">${finalName} (20% базы)</div>
            </div>
            <div class="map-card ${ultraClass}" id="ultraBossBtn">
              <div class="boss-btn-icon">👹</div>
              <div class="boss-btn-title">Пожиратель Лицензий</div>
              <div class="boss-btn-desc">Вся база (80% успех)</div>
            </div>
          </div>
        `;
        mapGrid.innerHTML = html + finalHtml;

        // Обработчик клика по иконке босса (тема)
        mapGrid.querySelectorAll('.map-boss-icon').forEach(icon => {
          icon.addEventListener('click', (e) => {
            e.stopPropagation(); // Не запускаем тест по теме
            const topicId = icon.dataset.topic;
            if (!topicId) return; 
            
            const data = loadBossData();
            const bossName = data.topicNames[topicId] || generateRandomBossName();
            
            if (!data.topicNames[topicId]) { 
              data.topicNames[topicId] = bossName; 
              saveBossData(data); 
            }
            
            const skin = data.topicSkins[topicId] || getRandomBossSkin();
            const iconEmoji = data.topicIcons[topicId] || "⚔️";
            
            if (typeof showBossModal === "function") {
              showBossModal("topic", topicId, "Босс темы", bossName, 100, iconEmoji, skin);
            }
          });
        });

        // Обработчики для финального и ультра босса
        document.getElementById("finalBossBtn").addEventListener("click", (e) => {
          e.preventDefault();
          const d = loadBossData();
          const icon = d.finalBoss.icon || "🌙";
          const skin = d.finalBoss.skin || getRandomBossSkin();
          if (typeof showBossModal === "function") showBossModal("final", null, "Финальный босс", finalName, 100, icon, skin);
        });
        
        document.getElementById("ultraBossBtn").addEventListener("click", (e) => {
          e.preventDefault();
          const d = loadBossData();
          const skin = d.ultraBoss.skin || getRandomBossSkin();
          if (typeof showBossModal === "function") showBossModal("ultra", null, "Ультра-босс", "Пожиратель Лицензий", 80, "👹", skin);
        });
      }


		mapGrid.querySelectorAll(".map-boss-btn").forEach(btn => {
		  btn.addEventListener("click", (e) => {
			e.stopPropagation(); // чтобы не сработал клик по карточке
			const topicId = btn.dataset.topicId;
			const topic = state.topics.find(t => t.id === topicId);
			const data = loadBossData();
			const bossName = data.topicNames[topicId] || generateRandomBossName();
			
			    // Генерируем иконку и скин, если их нет
			if (!data.topicNames[topicId]) { data.topicNames[topicId] = bossName; }
			if (!data.topicIcons[topicId]) { data.topicIcons[topicId] = getRandomBossIcon(); }
			if (!data.topicSkins[topicId]) { data.topicSkins[topicId] = getRandomBossSkin(); }
			saveBossData(data);
			
			// Сохраним имя, если его не было
			if (!data.topicNames[topicId]) { data.topicNames[topicId] = bossName; saveBossData(data); }
			 const icon = data.topicIcons[topicId] || "⚔️";
const skin = data.topicSkins[topicId] || getRandomBossSkin();
		showBossModal("topic", topicId, "Босс темы", bossName, 100, icon, skin);
		  });
		});

    function openMap() {
      if (!state.topics || state.topics.length === 0) {
        alert("Сначала загрузите файл с вопросами.");
        return;
      }
      buildMap();
      
      const mapOverlay = document.getElementById("mapOverlay");
      if (mapOverlay) {
        mapOverlay.classList.add("active"); // Добавляем класс
        mapOverlay.style.display = "flex";  // Оставляем, если где-то перебивается
        bringToFront(mapOverlay);         
      }
      
     // document.body.style.overflow = "hidden";
    }

function closeMap() {
  const mapOverlay = document.getElementById("mapOverlay");
  if (mapOverlay) {
    mapOverlay.style.display = "none";
    mapOverlay.classList.remove("active");
  }

  // Принудительно снимаем любые блокировки скролла
  document.body.style.removeProperty('overflow');
  document.body.style.removeProperty('overflow-y');
  document.body.style.removeProperty('position');
  document.body.style.removeProperty('top');
  document.body.style.removeProperty('height');
  document.documentElement.style.removeProperty('overflow');
  document.documentElement.style.removeProperty('overflow-y');
  
  document.body.classList.remove('test-is-open', 'dark-theme');
  
  requestAnimationFrame(() => {
    window.scrollTo(0, window.scrollY);
  });
}

    mapBtn.addEventListener("click", openMap);
    if (closeBtn) closeBtn.addEventListener("click", closeMap);
    
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && mapOverlay.style.display === "flex") closeMap();
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", setup);
  } else {
    setup();
  }
})();

/* =========================================================
   РЕКОРДЫ (PERSONAL BESTS)
   ========================================================= */
function getRecordsKey() {
  return "gamification:records:" + (state.fileKey || "default");
}

function loadRecords() {
  try {
    const raw = localStorage.getItem(getRecordsKey());
    if (raw) return JSON.parse(raw);
  } catch (e) {}
  return {
    bestCorrectStreak: 0,
    bestDayCount: 0,
    bestStreak: 0,
    bestErrorsClosed: 0,
    bestSessionScore: 0,
    bestSessionInfo: null, // { correct, total, pct }
    bestSpeedScore: 0,
    bestSpeedInfo: null // { total, seconds }
  };
}

function saveRecords(records) {
  try {
    localStorage.setItem(getRecordsKey(), JSON.stringify(records));
  } catch (e) {}
}

function updateRecordsOnSessionEnd() {
  let records = loadRecords();
  let changed = false;

  let correct = 0;
  const total = state.order.length;
  
  state.order.forEach(item => {
    const chosen = state.answers[item.id];
    if (chosen === undefined) return;
    const chosenOrig = state.optionOrders[item.id][chosen];
    if (chosenOrig === (item.correct - 1)) correct++;
  });

  const timeSec = state._sessionTimeSec || 0;
  
  console.log("[records] Сессия:", { correct, total, time: timeSec });

  // 1. Лучшая сессия по очкам
  if (total > 0) {
    const score = Math.round(correct * (total / 10));
    console.log("[records] Очки за сессию:", score, "(было:", records.bestSessionScore || 0, ")");
    
    if (score > (records.bestSessionScore || 0)) {
      records.bestSessionScore = score;
      records.bestSessionInfo = { correct, total, pct: Math.round(correct/total*100) };
      changed = true;
    }
  }

  // 2. Быстрейшая сессия
  if (total > 0 && timeSec > 0) {
    const speedScore = Math.round((total / timeSec) * 100);
    console.log("[records] Скорость:", speedScore, "(было:", records.bestSpeedScore || 0, ")");
    
    if (speedScore > (records.bestSpeedScore || 0)) {
      records.bestSpeedScore = speedScore;
      records.bestSpeedInfo = { total, seconds: timeSec };
      changed = true;
    }
  }

  if (changed) {
    saveRecords(records);
    console.log("[records] Рекорды успешно сохранены!");
  } else {
    console.log("[records] Рекорд не побит, изменений нет.");
  }
}

function openRecordsModal() {
  const modal = document.getElementById("recordsModal");
  const list = document.getElementById("recordsList");
  if (!modal || !list) return;

  const records = loadRecords();
  // Синхронизируем стрик из GamApp
  if (window.GameApp) {
    records.bestStreak = Math.max(records.bestStreak, window.GameApp.state.best);
  }

  let html = "";
  
  html += `<div class="record-item"><span>🔥 Лучшая серия правильных ответов</span> <b>${records.bestCorrectStreak}</b></div>`;
  html += `<div class="record-item"><span>📅 Лучший день по вопросам</span> <b>${records.bestDayCount}</b></div>`;
  html += `<div class="record-item"><span>🛡️ Самая длинная серия дней</span> <b>${records.bestStreak}</b></div>`;
  html += `<div class="record-item"><span>🧹 Больше всего ошибок закрыто за день</span> <b>${records.bestErrorsClosed}</b></div>`;
  
  if (records.bestSessionInfo) {
    const info = records.bestSessionInfo;
    html += `<div class="record-item"><span>🏆 Лучшая сессия</span> <b>${info.correct} / ${info.total} (${info.pct}%) · ${records.bestSessionScore} очков</b></div>`;
  } else {
    html += `<div class="record-item"><span>🏆 Лучшая сессия</span> <b>—</b></div>`;
  }

  if (records.bestSpeedInfo) {
    const info = records.bestSpeedInfo;
    const m = Math.floor(info.seconds / 60);
    const s = info.seconds % 60;
    html += `<div class="record-item"><span>⚡ Быстрейшая сессия</span> <b>${m} мин ${s} сек (${info.total} вопр.) · ${records.bestSpeedScore} очков</b></div>`;
  } else {
    html += `<div class="record-item"><span>⚡ Быстрейшая сессия</span> <b>—</b></div>`;
  }

  list.innerHTML = html;
  modal.style.display = "flex";
}

// Навешиваем кнопки
document.getElementById("recordsBtn")?.addEventListener("click", openRecordsModal);

// Делегирование для закрытия (работает, даже если кнопка появится позже)
document.addEventListener("click", function(e) {
  if (e.target && e.target.id === "closeRecordsBtn") {
    const modal = document.getElementById("recordsModal");
    if (modal) modal.style.display = "none";
  }
});

/* =========================================================
   ПРОВЕРКА МОБИЛЬНОГО УСТРОЙСТВА И PWA
   ========================================================= */
const isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

if (isMobile && !isStandalone) {
  if (!localStorage.getItem("ui:installPromptShown")) {
    setTimeout(() => {
      const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
      let msg = "";
      
      if (isIOS) {
        msg = "💡 Чтобы добавить приложение на рабочий стол:\n\n1. Нажмите кнопку 'Поделиться' (квадрат со стрелкой вверх) внизу экрана.\n2. Выберите 'На экран «Домой»'.\n\nТогда тестер будет открываться как обычное приложение, без адресной строки!";
      } else {
        msg = "💡 Чтобы добавить приложение на рабочий стол:\n\n1. Нажмите на три точки в правом верхнем углу браузера.\n2. Выберите 'Добавить на главный экран' или 'Установить приложение'.\n\nТогда тестер будет открываться как обычное приложение!";
      }
      
      if (confirm(msg)) {
        localStorage.setItem("ui:installPromptShown", "1");
      }
    }, 2000);
  }
}

/* =========================================================
   ГЕНЕРАТОР МОБИЛЬНОГО БИЛДА И СЕТЬ
   ========================================================= */
/* =========================================================
   ЛОГИКА МОБИЛЬНОГО БИЛДА (Сервер + Локальный файл)
   ========================================================= */
const requiredBuildFiles = [
  { id: 'index',     name: 'index.html',                  label: 'Разметка (index.html)',          required: true },
  { id: 'app',       name: 'app.js',                      label: 'Основной скрипт (app.js)',       required: true },
  { id: 'questions', name: 'questions.js',                label: 'База вопросов (questions.js)',    required: true },
  { id: 'css',       name: 'style.css',                   label: 'Стили (style.css)',              required: true },
  { id: 'boot',      name: 'boot.js',                     label: 'Загрузчик (boot.js)',            required: true },
  { id: 'ios',       name: 'ios.js',                      label: 'Скрипт для iOS (ios.js)',        required: true },
  { id: 'game',      name: 'gamification.js',             label: 'Геймификация (gamification.js)', required: false },
  { id: 'chart',     name: 'vendor/chart.umd.min.js',     label: 'Графики (chart.umd.min.js)',     required: true }
];

let buildFilesData = {}; // Сюда будем сохранять прочитанный текст локальных файлов

window.openBuildModal = function() {
  buildFilesData = {};
  const isServer = window.location.protocol === 'http:' || window.location.protocol === 'https:';
  
  const statusEl = document.getElementById('buildEnvStatus');
  const listEl = document.getElementById('buildFileList');
  const instrEl = document.getElementById('buildInstructions');
  const startBtn = document.getElementById('startBuildBtn');

  if (isServer) {
    // РЕЖИМ СЕРВЕРА
    statusEl.style.display = 'block';
    statusEl.style.background = 'var(--ok-bg)';
    statusEl.style.color = 'var(--ok)';
    statusEl.textContent = '✅ Отлично! Сайт запущен на сервере. Все файлы скачаются автоматически.';
    
    listEl.style.display = 'none';
    instrEl.style.display = 'none';
    startBtn.disabled = false;
  } else {
    // РЕЖИМ ЛОКАЛЬНОГО ФАЙЛА
    statusEl.style.display = 'block';
    statusEl.style.background = 'var(--warn-bg)';
    statusEl.style.color = 'var(--warn)';
    statusEl.textContent = '⚠️ Локальный запуск (file://). Браузер не может читать диск. Выберите файлы вручную:';
    
    listEl.style.display = 'flex';
    instrEl.style.display = 'block';
    startBtn.disabled = true; // Будем активировать по мере выбора

    // Генерируем поля для выбора файлов
    listEl.innerHTML = requiredBuildFiles.map(f => `
      <div style="background:var(--card); border:1px solid var(--border); border-radius:8px; padding:10px;">
        <div style="font-size:13px; font-weight:600; margin-bottom:6px; color:var(--text);">${f.label} ${f.required ? '<span style="color:var(--err)">*</span>' : ''}</div>
        <input type="file" id="build_input_${f.id}" data-fid="${f.id}" data-req="${f.required}" style="font-size:12px; width:100%;">
      </div>
    `).join('');

    // Навешиваем обработчики на инпуты
    listEl.querySelectorAll('input[type="file"]').forEach(input => {
      input.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const fid = e.target.dataset.fid;
        const req = e.target.dataset.req === 'true';
        
        try {
          // Читаем файл
          const text = await new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (ev) => resolve(String(ev.target.result));
            reader.onerror = () => reject(new Error("Ошибка чтения"));
            reader.readAsText(file, 'utf-8');
          });
          
          buildFilesData[fid] = text;
          e.target.style.borderColor = 'var(--ok)';
          
          // Проверяем, все ли обязательные файлы выбраны
          const allRequiredChosen = requiredBuildFiles
            .filter(f => f.required)
            .every(f => buildFilesData[f.id] !== undefined);
            
          document.getElementById('startBuildBtn').disabled = !allRequiredChosen;
        } catch (err) {
          alert("Не удалось прочитать файл: " + err.message);
          e.target.style.borderColor = 'var(--err)';
        }
      });
    });
  }

  document.getElementById('buildModal').classList.add('active');
};

window.closeBuildModal = function() {
  document.getElementById('buildModal').classList.remove('active');
};

window.executeBuild = async function() {
  const btn = document.getElementById('startBuildBtn');
  const oldText = btn.textContent;
  const isServer = window.location.protocol === 'http:' || window.location.protocol === 'https:';

  btn.textContent = "⏳ Сборка...";
  btn.disabled = true;

  try {
    // ═══════════════════════════════════════════════════════
    // Вспомогалки: fetch (сервер) или чтение из памяти (file://)
    // ═══════════════════════════════════════════════════════
    const getText = async (serverUrl, localId) => {
      if (isServer) {
        const res = await fetch(serverUrl);
        if (!res.ok) throw new Error(`Не удалось загрузить ${serverUrl} (код ${res.status})`);
        return await res.text();
      } else {
        const txt = buildFilesData[localId];
        if (txt === undefined) throw new Error(`Не выбран файл для «${localId}»`);
        return txt;
      }
    };

    // ═══════════════════════════════════════════════════════
    // 1. Читаем ВСЕ исходники (не из DOM, а из файлов!)
    // ═══════════════════════════════════════════════════════
    // Достаем сохраненный текст текущих вопросов
    let questionsCode = window.__CURRENT_QUESTIONS_TEXT;
    
    // Если по какой-то причине текста нет (например, старый браузер), делаем фолбэк
    if (!questionsCode) {
        if (state.topics && state.topics.length > 0) {
            // Если текста нет, генерируем из объектов в памяти (потеряются комментарии, но работать будет)
            questionsCode = "const TOPICS = " + JSON.stringify(state.topics, null, 2) + ";\n";
        } else {
            questionsCode = await getText('questions.js', 'questions');
        }
    }

    const [
      indexHtml,
      cssCode,
      chartCode,
      appCode,
      gamificationCode,
      iosCode,
      bootCode
    ] = await Promise.all([
      getText('index.html',                'index'),
      getText('style.css',                 'css'),
      getText('vendor/chart.umd.min.js',   'chart'),
      getText('app.js',                    'app'),
      getText('gamification.js',           'game'),
      getText('ios.js',                    'ios'),
      getText('boot.js',                   'boot')
    ]);

    // ═══════════════════════════════════════════════════════
    // 2. Разбираем index.html как строку, чтобы вырезать
    //    все <script src> и <link rel="stylesheet">
    // ═══════════════════════════════════════════════════════
    let bodyHtml = indexHtml;

    // 2.1. Удаляем <link rel="stylesheet" href="..."> — стили вставим в <style>
    bodyHtml = bodyHtml.replace(/<link[^>]*rel=["']stylesheet["'][^>]*>/gi, '');

    // 2.2. Удаляем <script src="..."></script> — их содержимое вставим как <script type="text/plain">
    bodyHtml = bodyHtml.replace(/<script[^>]*\bsrc=["'][^"']+["'][^>]*>\s*<\/script>/gi, '');

    // 2.3. Удаляем встроенный inline-скрипт с setTimeout, который прячет #nojsWarning
    //      (этот скрипт есть в index.html и тоже будет в билде — его можно оставить,
    //      он безвреден, но если хотите чистоты — уберите)
    // bodyHtml = bodyHtml.replace(/<script>[\s\S]*?document\.getElementById\('nojsWarning'\)[\s\S]*?<\/script>/i, '');

    // 2.4. Вырезаем всё содержимое между <body> и </body> — нам нужен только внутренний HTML
    const bodyMatch = bodyHtml.match(/<body[^>]*>([\s\S]*)<\/body>/i);
    if (!bodyMatch) throw new Error('Не удалось найти <body> в index.html');
    const cleanBodyHtml = bodyMatch[1];

    // 2.5. Вставляем CSS внутрь <head> вместо удалённого <link>
    bodyHtml = indexHtml
      .replace(/<link[^>]*rel=["']stylesheet["'][^>]*>/gi, `<style>${cssCode}</style>`)
      .replace(/<script[^>]*\bsrc=["'][^"']+["'][^>]*>\s*<\/script>/gi, '');

    // ═══════════════════════════════════════════════════════
    // 3. Собираем итоговый HTML
    // ═══════════════════════════════════════════════════════
    const finalHtml = bodyHtml.replace(
      /<\/body>/i,
      `
<script type="text/plain" id="src-chart">${chartCode.replace(/<\/script/gi, '<\\/script')}</script>
<script type="text/plain" id="src-questions">${questionsCode.replace(/<\/script/gi, '<\\/script')}</script>
<script type="text/plain" id="src-app">${appCode.replace(/<\/script/gi, '<\\/script')}</script>
<script type="text/plain" id="src-gamification">${gamificationCode.replace(/<\/script/gi, '<\\/script')}</script>
<script type="text/plain" id="src-ios">${iosCode.replace(/<\/script/gi, '<\\/script')}</script>

<script>
  // Передаем управление загрузчику (boot.js)
  ${bootCode.replace(/<\/script/gi, '<\\/script')}
</script>
</body>`
    );

    // ═══════════════════════════════════════════════════════
    // 4. Скачиваем
    // ═══════════════════════════════════════════════════════
    const blob = new Blob([finalHtml], { type: 'text/html;charset=utf-8' });
    if (typeof window.deliverFile === 'function') {
      window.deliverFile(blob, '1C_Test_Single.html');
    } else {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = '1C_Test_Single.html';
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }

    closeBuildModal();
    alert('Готово! Файл собран и скачан.');

  } catch (err) {
    alert('Ошибка сборки: ' + err.message);
    console.error(err);
  } finally {
    btn.textContent = oldText;
    btn.disabled = false;
  }
};
/* =========================================================
   БОССЫ
   ========================================================= */

// НОВОЕ: Обновить структуру данных босса (добавляем скин)
function updateBossDataWithSkins(data) {
  if (!data.topicSkins) data.topicSkins = {};
  if (!data.day.skin) data.day.skin = getRandomBossSkin();
  if (!data.finalBoss.skin) data.finalBoss.skin = getRandomBossSkin();
  if (!data.ultraBoss.skin) data.ultraBoss.skin = getRandomBossSkin();
  return data;
}

function getBossDataKey() { return "gamification:bosses:" + (state.fileKey || "default"); }

function loadBossData() {
  try {
    const raw = localStorage.getItem(getBossDataKey());
    if (raw) {
      const data = JSON.parse(raw);
      // Защита на случай старых сохранений без иконок и скинов
      if (!data.topicIcons) data.topicIcons = {};
      if (!data.topicSkins) data.topicSkins = {};
      if (!data.day.icon) data.day.icon = "⚔️";
      if (!data.day.skin) data.day.skin = getRandomBossSkin();
      if (!data.finalBoss.icon) data.finalBoss.icon = "🌙";
      if (!data.finalBoss.skin) data.finalBoss.skin = getRandomBossSkin();
      if (!data.ultraBoss.skin) data.ultraBoss.skin = getRandomBossSkin();
      return data;
    }
  } catch (e) {}
  return { 
    defeatedTopics: {}, 
    topicNames: {}, 
    topicIcons: {}, 
    topicSkins: {}, // НОВОЕ
    day: { date: null, name: null, icon: "⚔️", skin: getRandomBossSkin(), defeated: false }, 
    finalBoss: { name: null, icon: "🌙", skin: getRandomBossSkin(), defeated: false }, 
    ultraBoss: { defeated: false, perfect: false, skin: getRandomBossSkin() } 
  };
}

function saveBossData(data) {
  try { localStorage.setItem(getBossDataKey(), JSON.stringify(data)); } catch (e) {}
}

function updateBossDayButton() {
  const btn = document.getElementById("bossDayBtn");
  if (!btn) return;
  const data = loadBossData();
  const today = getTodayDateStr();
  
  if (data.day.date === today && data.day.defeated) {
    btn.innerHTML = "✅ Босс дня";
    btn.style.color = "var(--ok)";
    btn.style.borderColor = "var(--ok)";
    btn.title = "Босс дня уже побежден. Возвращайтесь завтра!";
  } else {
    btn.innerHTML = "⚔️ Босс дня";
    btn.style.color = "";
    btn.style.borderColor = "";
    btn.title = "Сразиться с ежедневным боссом";
  }
}

function getBossName() {
  const data = loadBossData();
  if (!data.finalBoss.name) {
    data.finalBoss.name = BOSS_FINAL_NAMES[Math.floor(Math.random() * BOSS_FINAL_NAMES.length)];
    saveBossData(data);
  }
  return data.finalBoss.name;
}

// Генератор имен для тем и дня
const BOSS_ADJ = ["Тёмный", "Кровавый", "Бесконечный", "Проклятый", "Стальной", "Цифровой", "Хаотичный", "Легендарный", "Забытый", "Кибернетический", "Багованный"];
const BOSS_NOUN = ["Демон", "Дракон", "Лорд", "Страж", "Хранитель", "Голем", "Призрак", "Мутант", "Архитектор", "Оракул"];
const BOSS_ADD = ["Регистров", "Отчетов", "Проводок", "Справочников", "Конфигураций", "Транзакций", "Багов", "Синтаксиса", "Ссылок", "Блокировок"];

function generateRandomBossName() {
  return `${BOSS_ADJ[Math.floor(Math.random()*BOSS_ADJ.length)]} ${BOSS_NOUN[Math.floor(Math.random()*BOSS_NOUN.length)]} ${BOSS_ADD[Math.floor(Math.random()*BOSS_ADD.length)]}`;
}

let pendingBossFight = null; 

function showBossModal(type, topicId, title, desc, threshold, icon, skin) {
  
if (!desc || !icon) return;
  
  pendingBossFight = { type, topicId, threshold, bossName: desc, icon, skin };
  
  const titleEl = document.getElementById("bossFightTitle");
  const iconEl = document.getElementById("bossFightIcon");
  const modalCard = document.querySelector("#bossFightModal .card");
  
  titleEl.textContent = title;
  document.getElementById("bossFightDesc").textContent = desc;
  iconEl.textContent = icon || "⚔️";

  // Применяем скин и включаем дыхание
  if (skin) {
    titleEl.style.color = skin.color; 
    iconEl.style.textShadow = `0 0 20px ${skin.color}, 0 0 10px ${skin.color}`;
    if (modalCard) {
      modalCard.classList.add("boss-intro-card");
      modalCard.style.setProperty("--boss-color", skin.color);
      modalCard.style.border = `2px solid ${skin.color}`;
      modalCard.style.boxShadow = `0 0 30px ${skin.glow}`;
    }
  } else {
    titleEl.style.color = "var(--text)";
    iconEl.style.textShadow = "none";
    if (modalCard) {
      modalCard.classList.remove("boss-intro-card");
      modalCard.style.removeProperty("--boss-color");
      modalCard.style.border = "1px solid var(--border)";
      modalCard.style.boxShadow = "0 1px 2px rgba(0,0,0,.03)";
    }
  }

  document.getElementById("bossFightModal").style.display = "flex";
  const bossFightModal = document.getElementById("bossFightModal");
  if (bossFightModal) bossFightModal.classList.add("active");
}

function closeBossModal() {
  document.getElementById("bossFightModal").style.display = "none";
}

// Навешиваем кнопки (можно через делегирование)
// ЕДИНЫЙ ОБРАБОТЧИК ДЛЯ ВСЕХ КЛИКОВ В МОДАЛКЕ
document.addEventListener("click", (e) => {
  // Закрытие
  if (e.target.id === "bossFightCancel") {
    closeBossModal();
    const mapOverlay = document.getElementById('mapOverlay');
      if (mapOverlay && mapOverlay.style.display === 'flex') {
        const mapBtn = document.getElementById('mapBtn');
        if (mapBtn) mapBtn.click(); // Заново вызываем построение карты
      }
   }
  // Начало боя
  if (e.target.id === "bossFightStart") {
    if (!pendingBossFight) {
        console.warn("Нет данных для боя (pendingBossFight пуст)");
        return;
    }
    const { type, topicId, threshold } = pendingBossFight;
    closeBossModal();
    startBossFight(type, topicId, threshold);
  }
});


function startBossFight(type, topicId, threshold, bossNameFromModal, iconFromModal, skinFromModal) {
  
  // 1. Закрываем модалки
 // const mapOverlay = document.getElementById('mapOverlay');
 // if (mapOverlay) mapOverlay.style.display = 'none';
  
  const bossFightModal = document.getElementById('bossFightModal');
  if (bossFightModal) bossFightModal.style.display = 'none';
  
  // 2. Готовим пул вопросов
  let pool = [];
  const bossData = loadBossData();
  if (!bossData.day.skin) bossData.day.skin = getRandomBossSkin();
  if (type === 'topic' && !bossData.topicSkins[topicId]) {
    bossData.topicSkins[topicId] = getRandomBossSkin();
  }
  saveBossData(bossData);
  
  let bossName = bossNameFromModal || ""; // Берем имя из модалки!
  

  if (type === 'topic') {
    const topic = state.topics.find(t => t.id === topicId);
    if (!topic) return;
    pool = topic.questions.map(q => ({ ...q, _topicId: topic.id, _topicTitle: topic.title }));
    pool = shuffle(pool);
    if (pool.length > 10) pool = pool.slice(0, 10);
    const data = loadBossData();
    if (!data.topicNames[topicId]) {
      data.topicNames[topicId] = generateRandomBossName();
      saveBossData(data);
    }
    bossName = data.topicNames[topicId];
  } else if (type === 'day') {
    const all = getAllQuestionsFlat();
    const withErr = all.filter(q => getStat(q).err > 0);
    const unanswered = all.filter(q => getStat(q).ok === 0 && getStat(q).err === 0);
    const rest = all.filter(q => !withErr.includes(q) && !unanswered.includes(q));
    pool = [...shuffle(withErr), ...shuffle(unanswered), ...shuffle(rest)].slice(0, 10);
    const data = loadBossData();
    const today = getTodayDateStr();
    if (data.day.date !== today) {
      data.day.date = today;
      data.day.name = generateRandomBossName();
	  data.day.icon = getRandomBossIcon();
      data.day.defeated = false;
      saveBossData(data);
    }
    bossName = data.day.name;
  } else if (type === 'final') {
    const all = getAllQuestionsFlat();
    const count = Math.max(10, Math.round(all.length * 0.2));
    pool = shuffle(all).slice(0, count);
    bossName = getBossName();
  } else if (type === 'ultra') {
    pool = shuffle(getAllQuestionsFlat());
    bossName = "Пожиратель Лицензий";
  }

  if (pool.length === 0) {
    alert("Нет вопросов для боя.");
    return;
  }

  state.order = pool;
  state.optionOrders = {};
  state.answers = {};
  state.current = 0;
  state.finished = false;
  state.showingReview = false;
  state.showingTop = false;

  // Сохраняем контекст боя в state
  const currentData = loadBossData();
  let currentSkin = null;
  let currentIcon = "⚔️";

  if (type === 'topic') {
    currentSkin = currentData.topicSkins[topicId];
    currentIcon = currentData.topicIcons[topicId] || "⚔️";
  } else if (type === 'day') {
    currentSkin = currentData.day.skin;
    currentIcon = currentData.day.icon || "⚔️";
  } else if (type === 'final') {
    currentSkin = currentData.finalBoss.skin;
    currentIcon = currentData.finalBoss.icon || "🌙";
  } else if (type === 'ultra') {
    currentSkin = currentData.ultraBoss.skin;
    currentIcon = "👹";
  }

  state._bossFight = { type, topicId, bossName, threshold, total: pool.length, icon: currentIcon, skin: currentSkin };
  state._sessionStartTime = Date.now();

  pool.forEach(item => {
    let idxs = item.options.map((_, i) => i);
    if (item.shuffle !== false) idxs = shuffle(idxs);
    state.optionOrders[item.id] = idxs;
  });

  if (!pendingBossFight) {
    console.warn("Нет данных для старта боя");
    return;
  }
  pendingBossFight = null; 

  CONFIG.mode = "training";
  $("#modeSelect").value = "training";
  render();
    if (typeof launchMobileTest === 'function') {
    launchMobileTest();
  }
}

// Проверка результата боя в renderFinal
function checkBossResult(correct, total) {
  if (!state._bossFight) return;
  const { type, topicId, bossName, threshold } = state._bossFight;
  const pct = total > 0 ? (correct / total) * 100 : 0;
  
  if (pct >= threshold) {
    // Победа
    const data = loadBossData();
    if (type === 'topic') {
      data.defeatedTopics[topicId] = true;
    } else if (type === 'day') {
      data.day.defeated = true;
    } else if (type === 'final') {
      data.finalBoss.defeated = true;
    } else if (type === 'ultra') {
      data.ultraBoss.defeated = true;
      if (pct === 100) {
        data.ultraBoss.perfect = true;
        // Секретная ачивка
        if (window.GameApp && window.GameApp.unlockBadge) {
          window.GameApp.unlockBadge("absolute_mind");
        }
      }
    }
    saveBossData(data);
    return true;
  }
  return false;
}

/* =========================================================
   ПУБЛИЧНЫЙ API ДЛЯ ВНЕШНИХ МОДУЛЕЙ (редактор и т.п.)
   ========================================================= */
window.TestApp = {
  computeFileKey: computeFileKey,
  migrateProgress: migrateProgress,
  sha1: sha1,
  get state()        { return state; },
  get CONFIG()       { return CONFIG; },
  get topics()       { return state.topics; },
  get fileKey()      { return state.fileKey; },
  
   getTodayActiveMinutes() {
    const today = getTodayDateStr();
    const dayData = activityStats.history.days[today];
    return dayData ? Math.floor(dayData.time / 60) : 0;
  },

  start,
  render,
  loadTopics,
  saveFavorites,
  saveStats,
  updateSpecialCounts,
  getAllQuestionsFlat,
  getStat,
  qKey,
  escapeHtml,
  shuffle,
  $,
  $$: (s) => document.querySelectorAll(s),
  onTopicsChanged: null,
  notifyTopicsChanged() {
    if (typeof this.onTopicsChanged === "function") {
      try { this.onTopicsChanged(); } catch (e) { console.error(e); }
    }
  },
};

/* =========================================================
   ЭКСПОРТ / ИМПОРТ КЛЮЧА ОТВЕТОВ
   ========================================================= */
const exportKeyBtn = $("#exportKeyBtn");
const importKeyBtn = $("#importKeyBtn");
const importKeyInput = $("#importKeyInput");

function buildKeyData(mode, includeShuffle) {
  const questionsList = [];
  state.topics.forEach(topic => {
    topic.questions.forEach(q => {
      const item = {};
      item.topicId = topic.id; 
      item.id = q.id;
      if (mode === 'text' || mode === 'full') item.question = q.q;
      if (mode === 'full') {
        const correctText = q.options && q.options[q.correct - 1] ? q.options[q.correct - 1] : "—";
        item.answerText = correctText;
      }
      item.correct = q.correct;
      if (includeShuffle) item.shuffle = q.shuffle !== false;
      questionsList.push(item);
    });
  });
  return { version: 3, fileKey: state.fileKey || "questions.js", exportedAt: new Date().toISOString(), mode: mode, questions: questionsList };
}

function downloadJsonKey(data, filename) {
  // Правки для iOS: отдача JSON-файла через «Поделиться»/скачивание (deliverFile) вместо <a download>
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json;charset=utf-8" });
  window.deliverFile(blob, filename);
}

exportKeyBtn.addEventListener("click", () => {
  if (state.topics.length === 0) return alert("Сначала загрузите файл вопросов.");
  const modeChoice = prompt("Выберите формат выгрузки ключа:\n\n1 — Краткий (только ID и номер ответа)\n2 — С текстом вопроса\n3 — Расширенный (текст вопроса, текст ответа, номер ответа)\n\nВведите цифру 1, 2 или 3:", "3");
  if (!modeChoice) return;
  let mode = 'full';
  if (modeChoice === "1") mode = 'short'; else if (modeChoice === "2") mode = 'text'; else if (modeChoice === "3") mode = 'full';
  let includeShuffle = false;
  if (mode !== 'short') includeShuffle = confirm("Включить в ключ настройку шафла (перемешивания) для каждого вопроса?");
  const data = buildKeyData(mode, includeShuffle);
  const timestamp = new Date().toISOString().slice(0, 10);
  const cleanFileKey = (state.fileKey || "questions").replace(/\.(js|json|txt)$/i, "");
  downloadJsonKey(data, cleanFileKey + "_key_" + timestamp + ".json");
});

function applyKeyData(keyData) {
  if (!keyData) throw new Error("Файл пустой или некорректный.");
  let keyQuestions = [];
  if (Array.isArray(keyData.topics)) {
    keyData.topics.forEach(t => { if (Array.isArray(t.questions)) t.questions.forEach(q => keyQuestions.push({ ...q, topicId: q.topicId || t.topicId })); });
  } else if (Array.isArray(keyData.questions)) {
    keyQuestions = keyData.questions;
  } else throw new Error("В файле не найден ни массив 'topics', ни массив 'questions'.");

  const currentMap = new Map();
  state.topics.forEach(topic => topic.questions.forEach(q => currentMap.set(topic.id + ":" + q.id, q)));

  let actuallyUpdated = 0; let unchanged = 0; let errors = []; let notFound = [];
  keyQuestions.forEach(item => {
    const key = item.topicId + ":" + item.id;
    const q = currentMap.get(key);
    if (!q) { notFound.push(key); return; }
    if (typeof item.correct !== 'number' || item.correct < 1 || item.correct > q.options.length) {
      errors.push(`${key} (correct = ${item.correct}, вариантов = ${q.options.length})`); return;
    }
    let isChanged = false;
    if (q.correct !== item.correct) { q.correct = item.correct; isChanged = true; }
    if (typeof item.shuffle === 'boolean') {
      const currentShuffle = q.shuffle !== false;
      if (currentShuffle !== item.shuffle) { if (item.shuffle) delete q.shuffle; else q.shuffle = false; isChanged = true; }
    }
    if (isChanged) actuallyUpdated++; else unchanged++;
  });

  let msg = `Результат импорта:\n✅ Изменено вопросов: ${actuallyUpdated}\n➖ Без изменений: ${unchanged}\n⚠️ Не найдено: ${notFound.length}\n❌ Ошибок: ${errors.length}`;
  if (errors.length > 0) msg += `\n\nДетали ошибок:\n` + errors.slice(0, 10).join("\n") + (errors.length > 10 ? "\n...и другие" : "");
  if (notFound.length > 0) msg += `\n\nНе найдены ключи:\n` + notFound.slice(0, 10).join("\n") + (notFound.length > 10 ? "\n...и другие" : "");

  if (actuallyUpdated > 0) {
    msg += `\n\nПрименить изменения и скачать обновленный questions.js?`;
    if (confirm(msg)) {
      start();
      const body = "// Автоматически сгенерировано тестером (после импорта ключа).\n// Дата: " + new Date().toLocaleString("ru-RU") + "\n\nconst TOPICS = " + JSON.stringify(state.topics, null, 2) + ";\n";
      const blob = new Blob(["\uFEFF" + body], { type: "application/javascript;charset=utf-8" });
      // Правки для iOS: отдача обновлённого файла вопросов через «Поделиться»/скачивание (deliverFile)
      window.deliverFile(blob, (state.fileKey || "questions").replace(/\.(js|json|txt)$/i, "") + "_updated.js");
    } else alert("Изменения применены только в памяти.");
  } else if (actuallyUpdated === 0 && errors.length === 0 && notFound.length === 0) {
    alert("Все ответы в ключе уже совпадают с текущими. Изменений нет.");
  } else alert(msg);
}

importKeyBtn.addEventListener("click", () => { importKeyInput.value = ""; importKeyInput.click(); });
importKeyInput.addEventListener("change", (e) => {
  const file = e.target.files && e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (ev) => {
    try {
      const data = JSON.parse(ev.target.result);
      if (data.fileKey && state.fileKey && data.fileKey !== state.fileKey) {
        if (!confirm(`Внимание! Ключ выгружен из «${data.fileKey}», а сейчас открыт «${state.fileKey}».\n\nПродолжить?`)) return;
      }
      applyKeyData(data);
    } catch (err) { alert("Ошибка при чтении ключа: " + err.message); }
  };
  reader.onerror = () => alert("Не удалось прочитать файл.");
  reader.readAsText(file, "utf-8");
});
/* =========================================================
   МОСТИК (ВЕРСИЯ 6 - БЕЗ КОНФЛИКТОВ СОБЫТИЙ)
   ========================================================= */

// 1. Статистика (исправлен размер и графики)
function openStats() {
  const statsBody = document.getElementById('mobileStatsBody');
  if (statsBody) {
    const oldStats = document.getElementById('statsOverlay');
    if (oldStats) {
      // Копируем только внутренний контейнер с карточками
      const grid = oldStats.querySelector('div[style*="display:grid"]');
      if (grid) statsBody.innerHTML = grid.innerHTML;
    }
    
    // Уменьшаем отступы для мобилки, чтобы графики влезли
    statsBody.style.padding = '12px';
    statsBody.style.display = 'grid';
    statsBody.style.gridTemplateColumns = '1fr';
    statsBody.style.gap = '12px';

    setTimeout(() => { if (typeof buildStatistics === 'function') buildStatistics(); }, 100);
  }
  document.getElementById('mobileStatsModal').classList.add('active');
}

// 2. Топ ошибок (полноценный, из старого интерфейса)
function openMobileTop() {
  if (!state.topics || state.topics.length === 0) return alert("Сначала загрузите вопросы.");

  const topBody = document.getElementById('mobileTopBody');
  
  // Функция для отрисовки списка
  function renderTopList() {
    const all = getAllQuestionsFlat();
    
    // Фильтруем только вопросы с ошибками
    const withErr = all.map(item => {
      const stat = getStat(item);
      return { item, ok: stat.ok, err: stat.err, total: stat.ok + stat.err };
    }).filter(x => x.err > 0);

    // Сортировка (по умолчанию по числу ошибок)
    withErr.sort((a, b) => b.err - a.err);
    
    // Берем топ-20
    const top = withErr.slice(0, 20);

    let html = `
      <div class="top-filters">
        <label>Сортировка:
          <select id="mobTopSort">
            <option value="count">По числу ошибок</option>
          </select>
        </label>
      </div>
      <div style="font-size: 13px; color: var(--muted); margin-bottom: 12px;">
        Всего вопросов с ошибками: <b>${withErr.length}</b>. Показано: <b>${top.length}</b>.
      </div>
    `;

    if (top.length === 0) {
      html += `<div style="text-align:center; padding: 30px; color: var(--muted);">Пока ошибок нет. Так держать!</div>`;
    } else {
      top.forEach((row, i) => {
        const item = row.item;
        const pct = row.total > 0 ? Math.round((row.err / row.total) * 100) : 0;
        
        html += `
          <div class="top-list-card">
            <div class="top-card-header">
              <span class="top-card-id">${escapeHtml(item.id)}</span>
              <span class="top-card-stats">Ошибок: <b style="color:var(--err)">${row.err}</b> · Верно: <b style="color:var(--ok)">${row.ok}</b> (${pct}%)</span>
            </div>
            <div class="top-card-q">${escapeHtml(item.q)}</div>
            <div class="top-card-topic">${escapeHtml(item._topicTitle || "")}</div>
            <button class="top-card-btn" data-topic="${item._topicId}" data-id="${item.id}">Перейти к вопросу →</button>
          </div>
        `;
      });
    }

    topBody.innerHTML = html;

    // Обработчик кнопки "Перейти"
    topBody.querySelectorAll('.top-card-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const topicId = btn.dataset.topic;
        const qId = btn.dataset.id;
        
        // Находим вопрос в базе
        const topic = state.topics.find(t => t.id === topicId);
        if (!topic) return;
        const question = topic.questions.find(q => q.id === qId);
        if (!question) return;

        // Запускаем одиночный тест из этого вопроса
        state.order = [{ ...question, _topicId: topicId, _topicTitle: topic.title }];
        state.optionOrders = {};
        state.answers = {};
        state.current = 0;
        state.finished = false;
        state.showingReview = false;
        state.showingTop = false;
        
        // Перемешиваем варианты (если нужно)
        let idxs = question.options.map((_, i) => i);
        if (question.shuffle !== false) idxs = shuffle(idxs);
        state.optionOrders[question.id] = idxs;

        // Закрываем модалку топа и запускаем тест
        document.getElementById('mobileTopModal').classList.remove('active');
        if (typeof launchMobileTest === 'function') launchMobileTest();
      });
    });
  }

  // Первичная отрисовка
  renderTopList();

  // Открываем модалку
  document.getElementById('mobileTopModal').classList.add('active');
}

// 3. Синхронизация геймификации (Стрик, Уровень, Достижения)
function syncGamificationUI() {
  // Если геймификация не подключена, просто выходим
  if (!window.GameApp || !window.GameApp.state) return;
  

  // 1. Стрик (огонек)
  const streakEl = document.getElementById('mobileStreakBadge');
  if (streakEl) {
    const current = window.GameApp.state.current || 0;
    const lastDate = window.GameApp.state.lastActiveDate;
    const isActive = lastDate === getTodayDateStr();
    streakEl.innerHTML = `🔥 ${current}`;
    streakEl.style.color = current > 0 ? (isActive ? "var(--err)" : "var(--warn)") : "var(--muted)";
  }

  // 2. Общий Опыт (XP)
  const xpEl = document.getElementById('mobileXpLevel');
  if (xpEl) {
    const totalXp = window.GameApp.state.totalXp || 0;
    xpEl.innerHTML = `⭐ ${totalXp} XP`;
    const oldXp = document.getElementById('gamificationXpBadge');
    if (oldXp && oldXp.title) {
      xpEl.title = oldXp.title;
      xpEl.style.cursor = 'help';
    }
  }

  // 3. Уровень
  const levelTextEl = document.getElementById('mobileLevelText');
  if (levelTextEl) {
    const oldXp = document.getElementById('gamificationXpBadge');
    if (oldXp && oldXp.title) {
      const match = oldXp.title.match(/Уровень:\s*([^(]+)/);
      if (match) levelTextEl.textContent = match[1].trim();
    } else {
      const totalXp = window.GameApp.state.totalXp || 0;
      if (totalXp < 100) levelTextEl.textContent = "Новичок";
      else if (totalXp < 250) levelTextEl.textContent = "Стажер";
      else if (totalXp < 500) levelTextEl.textContent = "Ученик";
      else if (totalXp < 850) levelTextEl.textContent = "Практик";
      else levelTextEl.textContent = "Специалист";
    }
  }

  // 4. Достижения
  const badgeCount = document.getElementById('mobileBadgesCount');
  if (badgeCount) {
    const oldCount = document.getElementById('gamificationBadgesCount');
    if (oldCount) badgeCount.textContent = oldCount.textContent;
  }

  // 5. Квест дня
  const goalBadge = document.getElementById('mobileGoalBadge');
  const goalDesc = document.getElementById('mobileGoalDesc');
  if (goalBadge && goalDesc) {
    const goalType = window.GameApp.state.dailyGoalType || "off";
    if (goalType === "off") {
      goalBadge.textContent = "Выключен";
      goalDesc.textContent = "Вы можете включить его в настройках.";
    } else {
      let label = `${window.GameApp.state.goalProgress || 0}/${window.GameApp.state.dailyTarget || 0}`;
      if (goalType.startsWith("t")) label = `${window.GameApp.state.goalProgress || 0} мин / ${window.GameApp.state.dailyTarget || 0} мин`;
      if (goalType.startsWith("err")) label = `Осталось: ${(window.GameApp.state.dailyTarget || 0) - (window.GameApp.state.goalProgress || 0)}`;
      
      goalBadge.textContent = window.GameApp.state.todayGoalDone ? "✅ Выполнено!" : label;
      goalBadge.style.color = window.GameApp.state.todayGoalDone ? "var(--ok)" : "var(--accent)";
      goalDesc.textContent = window.GameApp.state.questTypeName || "Случайная цель";
    }
  }

   
  // 5. Аватарка по уровню (без дублирования)
  const avatarEl = document.querySelector('.avatar');
  if (avatarEl) {
    const lvl = (window.GameApp.state.currentLevel || 1);
    
    // Набор аватаров для каждого уровня (используем одиночные эмодзи)
    const avatars = {
      1:  "👶", // Новичок
      2:  "👨‍🎓", // Стажер
      3:  "😎", // Практик
      4:  "🧙‍♂️", // Ученик
      5:  "🕵️", // Специалист
      6:  "🤓", // Эксперт
      7:  "👽", // Профи
      8:  "🦸", // Мастер
      9:  "🤖", // Легенда
      10: "👑"  // Гуру
    };
  



    // Берем нужный, если уровень выше 10 — оставляем корону
    const currentAvatar = avatars[lvl] || avatars[10];
    
    // Чтобы не было двух аватаров, очищаем элемент перед вставкой
    avatarEl.textContent = ""; 
    avatarEl.textContent = currentAvatar;

    // Динамический цвет фона под уровень
    if (lvl >= 8) {
      avatarEl.style.background = "linear-gradient(135deg, #ffaa01, #fde400)"; // Золотой
    } else if (lvl >= 6) {
      avatarEl.style.background = "linear-gradient(135deg, #805ad5, #544674)"; // Фиолетовый
    } else if (lvl >= 4) {
      avatarEl.style.background = "linear-gradient(135deg, #3182ce, #63778c)"; // Синий
    } else {
      avatarEl.style.background = "linear-gradient(135deg, #4a5568, #2d3748)"; // Серый
    }
  }
}


// Вызываем синхронизацию при загрузке страницы
document.addEventListener("DOMContentLoaded", syncGamificationUI);

// И при ответе на вопрос (чтобы стрик обновлялся)
const originalOnAnswer = window.GameApp ? window.GameApp.onAnswer : null;
if (window.GameApp) {
  window.GameApp.onAnswer = function(item, isCorrect) {
    if (originalOnAnswer) originalOnAnswer(item, isCorrect);
    syncGamificationUI();
  };
}

// 2. Запуск и закрытие теста
function launchMobileTest() {
  // 1. Скрываем оверлеи
 // const mapOverlay = document.getElementById('mapOverlay');
 // if (mapOverlay) mapOverlay.style.display = 'none';
  
  const bossFightModal = document.getElementById('bossFightModal');
  if (bossFightModal) bossFightModal.style.display = 'none';
  
  document.body.style.overflow = '';

  // 2. Управление темой (строго по флагу босса)
  if (state._bossFight) {
    document.body.classList.add('dark-theme'); // Бой — темная тема
  } else {
    document.body.classList.remove('dark-theme'); // Обычный тест — системная тема
  }

  // 3. Запуск теста (если это не продолжение сессии и не бой)
  if (!state._bossFight) {
    // Правки для iOS: «Начать тест» продолжает восстановленную сессию
    if (state._resumePending && !state.finished) state._resumePending = false;
    else if (typeof start === 'function') start();
  }
  
  // 4. Перенос контейнеров в модалку
  let oldQuiz = document.getElementById('quiz');
  if (!oldQuiz) {
    oldQuiz = document.createElement('div');
    oldQuiz.id = 'quiz';
    const oldWrapper = document.getElementById('oldWrapper');
    if (oldWrapper) oldWrapper.appendChild(oldQuiz);
  }
  
  const mobileQuiz = document.getElementById('mobileQuiz');
  if (mobileQuiz) {
    while (mobileQuiz.firstChild) mobileQuiz.removeChild(mobileQuiz.firstChild);
    mobileQuiz.appendChild(oldQuiz);
  }

  const oldCounter = document.getElementById('counter');
  const mobileCounter = document.getElementById('mobileCounter');
  if (oldCounter && mobileCounter) {
    mobileCounter.innerHTML = '';
    mobileCounter.appendChild(oldCounter);
  }
  
  // 5. Открываем модалку теста
  const testModal = document.getElementById('testModal');
  if (testModal) {
    testModal.classList.add('active');
    bringToFront(testModal); 
    
    const content = testModal.querySelector('.modal-content');
    
    // Настройка стилей для боя
    if (state._bossFight && state._bossFight.skin) {
      const skin = state._bossFight.skin;
      if (content) {
        content.classList.add('boss-mode');
        content.style.setProperty('--boss-color', skin.color);
      }
    } else {
      if (content) {
        content.classList.remove('boss-mode');
        content.style.removeProperty('--boss-color');
      }
    }
  }
  
  document.body.style.overflow = 'hidden';
}

function closeTestModal() {
    if (state._explosionTimer) {
    clearTimeout(state._explosionTimer);
    state._explosionTimer = null;
  }
  const oldQuiz = document.getElementById('quiz');
  const oldWrapper = document.getElementById('oldWrapper');
  if (oldQuiz && oldWrapper) oldWrapper.appendChild(oldQuiz);
  
  const testModal = document.getElementById('testModal');
  if (testModal) {
    testModal.classList.remove('active');
    
    // Убираем классы боя и темной темы
    document.body.classList.remove('dark-theme');
    const content = testModal.querySelector('.modal-content');
    if (content) {
      content.classList.remove('boss-mode');
      content.style.removeProperty('--boss-color');
    }


  }
  
  // Фикс залипания скролла
  document.body.style.overflow = '';
  document.body.style.overflowY = '';
  document.documentElement.style.overflow = '';
  document.documentElement.style.overflowY = '';
  
  const scrollY = window.scrollY;
  setTimeout(() => {
    window.scrollTo(0, scrollY);
  }, 10);


  // Если карта открыта — перерисовываем её
  const mapOverlay = document.getElementById('mapOverlay');
  if (mapOverlay && mapOverlay.style.display === 'flex') {
    const mapBtn = document.getElementById('mapBtn');
    if (mapBtn) mapBtn.click(); 
  }
}

// 3. Настройки (работает как есть)
function openMobileSettings() {
  const body = document.getElementById('mobileSettingsBody');

  body.innerHTML = `
    <div class="settings-cell">
      <div class="cell-head">Файл вопросов</div>
      <input type="file" id="mobFileInput" style="width:100%; padding:10px; border:1px solid var(--border); border-radius:8px;">
      <div style="font-size:12px; color:var(--muted); margin-top:4px;" id="mobFileStatus">Файл не выбран</div>
    </div>



    <div class="settings-cell">
      <div class="cell-head">Режим</div>
      <select id="mobModeSelect" style="width:100%; padding:10px; border-radius:8px; border:1px solid var(--border);">
        <option value="training" ${CONFIG.mode === 'training' ? 'selected' : ''}>Тренировка</option>
        <option value="learning" ${CONFIG.mode === 'learning' ? 'selected' : ''}>Обучение</option>
        <option value="exam" ${CONFIG.mode === 'exam' ? 'selected' : ''}>Экзамен</option>
      </select>
    </div>

    <div class="settings-cell">
      <div class="cell-head">Поведение</div>
      <label style="display:flex; gap:8px; margin-bottom:8px;"><input type="checkbox" id="mobAutoAdvance" ${$("#autoAdvance").checked ? 'checked' : ''}> Автопереход</label>
      <label style="display:flex; gap:8px; margin-bottom:8px;"><input type="checkbox" id="mobShowImages" ${$("#showImages").checked ? 'checked' : ''}> Картинки</label>
    </div>

    <!-- === НОВЫЙ БЛОК: Экспорт и печать === -->
    <div class="settings-cell">
      <div class="cell-head">📄 Экспорт и печать</div>
      <p style="font-size:12px; color:var(--muted); margin:4px 0 10px;">
        Создать красивый HTML со всеми вопросами и правильными ответами (для печати или PDF).
      </p>
      <button class="btn-secondary" id="mobExportHtmlBtn" style="width:100%; padding:14px;">🖨 Экспорт в HTML (с ответами)</button>
      <div id="mobExportStatus" style="font-size:12px; color:var(--muted); margin-top:6px;"></div>
    </div>

    <!-- === НОВЫЙ БЛОК: Ключ ответов === -->
    <div class="settings-cell">
      <div class="cell-head">🔑 Ключ ответов</div>
      <p style="font-size:12px; color:var(--muted); margin:4px 0 10px;">
        Выгрузить или загрузить правильные ответы в формате JSON.
      </p>
      <div style="display:flex; gap:8px; flex-wrap:wrap;">
        <button class="btn-secondary" id="mobExportKeyBtn" style="flex:1; padding:14px; min-width:140px;">⬇ Выгрузить ключ</button>
        <button class="btn-secondary" id="mobImportKeyBtn" style="flex:1; padding:14px; min-width:140px;">⬆ Загрузить ключ</button>
      </div>
      <input type="file" id="mobImportKeyInput" accept=".json" style="display:none;">
    </div>
    <!-- === НОВЫЙ БЛОК: Полная очистка прогресса === -->
    <div class="settings-cell" style="border-color: var(--err);">
      <div class="cell-head" style="color: var(--err);">🗑 Очистка прогресса набора</div>
      <p style="font-size:12px; color:var(--muted); margin:4px 0 10px;">
        Удалит <b>всю</b> статистику, избранное, достижения, серии дней, рекорды и боссов для текущего набора вопросов.
      </p>
      <button class="btn-secondary" id="mobClearAllProgressBtn" style="width:100%; padding:14px; border-color:var(--err); color:var(--err);">🗑 Полностью очистить прогресс</button>
    </div>
    <button class="btn-secondary" onclick="openBuildModal(); closeMobileSettings();" style="margin-top:10px; padding:14px; border-color:var(--ok); color:var(--ok);">📱 Собрать мобильный билд (всё в 1 файл)</button>
    <button class="btn-primary" id="mobSaveSettings" style="margin-top:10px; padding:14px;">Применить и закрыть</button>
  `;

  // --- Старая логика (файл, темы, режим, поведение) ---
  const fileInput = body.querySelector('#mobFileInput');
  fileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const text = String(ev.target.result);
        const topics = parseTopicsFromText(text);
        loadTopics(topics, file.name, file.name);
        if (typeof window.iosRememberSet === "function") window.iosRememberSet(file.name, text, topics);
        body.querySelector('#mobFileStatus').textContent = "Загружено: " + file.name + " (" + topics.length + " тем) — запомнен на устройстве";
        window.__CURRENT_QUESTIONS_TEXT = text;
        if (typeof syncGamificationUI === 'function') syncGamificationUI();
      } catch (err) { body.querySelector('#mobFileStatus').textContent = "Ошибка: " + err.message; }
    };
    reader.readAsText(file, "utf-8");
  });


  body.querySelector('#mobModeSelect').addEventListener('change', (e) => { CONFIG.mode = e.target.value; $("#modeSelect").value = CONFIG.mode; start(); });

  const syncBehavior = (mobId, oldId) => { body.querySelector(mobId).addEventListener('change', (e) => { const old = $(oldId); if(old) { old.checked = e.target.checked; old.dispatchEvent(new Event('change')); } }); };
  syncBehavior('#mobAutoAdvance', '#autoAdvance');
  syncBehavior('#mobShowImages', '#showImages');

  body.querySelector('#mobSaveSettings').addEventListener('click', closeMobileSettings);
  if (typeof window.iosAugmentSettings === 'function') window.iosAugmentSettings(body);

  // === НОВОЕ: Экспорт HTML ===
  body.querySelector('#mobExportHtmlBtn').addEventListener('click', async () => {
    if (state.topics.length === 0) {
      body.querySelector('#mobExportStatus').textContent = "Сначала загрузите файл вопросов.";
      return;
    }
    const statusEl = body.querySelector('#mobExportStatus');
    const btn = body.querySelector('#mobExportHtmlBtn');
    btn.disabled = true;
    btn.textContent = "⏳ Готовим файл…";
    statusEl.textContent = "Обработка картинок и сборка…";
    
    try {
      // Вызываем существующую функцию из app.js
      const { html, fileKeyClean } = await buildExportHtml();
      const dateStr = new Date().toISOString().slice(0, 10);
      const fileName = fileKeyClean + "_вопросы_" + dateStr + ".html";
      
      // Правки для iOS: используем deliverFile (Поделиться / Сохранить в Файлы)
      const blob = new Blob([html], { type: "text/html;charset=utf-8" });
      if (typeof window.deliverFile === "function") {
        window.deliverFile(blob, fileName);
      } else {
        // Фолбэк
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url; a.download = fileName;
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 60000);
      }
      
      statusEl.textContent = "✅ Готово: " + fileName;
      statusEl.style.color = "var(--ok)";
    } catch (err) {
      statusEl.textContent = "❌ Ошибка: " + err.message;
      statusEl.style.color = "var(--err)";
    } finally {
      btn.disabled = false;
      btn.textContent = "🖨 Экспорт в HTML (с ответами)";
    }
  });

  // === НОВОЕ: Экспорт ключа (3 формата) ===
  body.querySelector('#mobExportKeyBtn').addEventListener('click', () => {
    if (state.topics.length === 0) return alert("Сначала загрузите файл вопросов.");
    
    const modeChoice = prompt(
      "Выберите формат выгрузки ключа:\n\n" +
      "1 — Краткий (только ID и номер ответа)\n" +
      "2 — С текстом вопроса\n" +
      "3 — Расширенный (текст вопроса + текст ответа + номер)\n\n" +
      "Введите цифру 1, 2 или 3:", "3"
    );
    if (!modeChoice) return;
    
    let mode = 'full';
    if (modeChoice === "1") mode = 'short';
    else if (modeChoice === "2") mode = 'text';
    else if (modeChoice === "3") mode = 'full';
    
    let includeShuffle = false;
    if (mode !== 'short') {
      includeShuffle = confirm("Включить в ключ настройку шафла (перемешивания) для каждого вопроса?");
    }
    
    // Вызываем существующую функцию
    const data = buildKeyData(mode, includeShuffle);
    const timestamp = new Date().toISOString().slice(0, 10);
    const cleanFileKey = (state.fileKey || "questions").replace(/\.(js|json|txt)$/i, "");
    const filename = cleanFileKey + "_key_" + timestamp + ".json";
    
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json;charset=utf-8" });
    if (typeof window.deliverFile === "function") {
      window.deliverFile(blob, filename);
    } else {
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = filename;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    }
  });

  // === НОВОЕ: Импорт ключа ===
  const importKeyInput = body.querySelector('#mobImportKeyInput');
  body.querySelector('#mobImportKeyBtn').addEventListener('click', () => {
    importKeyInput.value = "";
    importKeyInput.click();
  });
  importKeyInput.addEventListener('change', (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const data = JSON.parse(ev.target.result);
        if (data.fileKey && state.fileKey && data.fileKey !== state.fileKey) {
          if (!confirm(`Внимание! Ключ выгружен из «${data.fileKey}», а сейчас открыт «${state.fileKey}».\n\nПродолжить?`)) return;
        }
        applyKeyData(data);
      } catch (err) { alert("Ошибка при чтении ключа: " + err.message); }
    };
    reader.onerror = () => alert("Не удалось прочитать файл.");
    reader.readAsText(file, "utf-8");
  });

  document.getElementById('mobileSettingsModal').classList.add('active');

    // === НОВОЕ: Полная очистка прогресса ===
  body.querySelector('#mobClearAllProgressBtn').addEventListener('click', () => {
    if (!confirm("⚠️ ВНИМАНИЕ!\n\nБудут удалены ВСЕ данные для текущего набора вопросов:\n— Статистика ответов\n— Избранное\n— Достижения\n— XP и уровни\n— Серии дней\n— Рекорды\n— Боссы\n\nЭто действие НЕОБРАТИМО. Продолжить?")) return;

    // Второе подтверждение для надёжности
    if (!confirm("Точно удалить? Отменить это действие будет невозможно.")) return;

    const deletedCount = clearAllProgressForSet();
    
    if (deletedCount > 0) {
      alert(`✅ Удалено ${deletedCount} записей прогресса.\n\nПерезапустим тест с чистого листа.`);
      // Перезапускаем тест
      start();
      // Обновляем модалку настроек
      setTimeout(() => openMobileSettings(), 100);
    } else {
      alert("Нечего очищать — прогресс уже пуст.");
    }
  });
}

function closeMobileSettings() {
  document.getElementById('mobileSettingsModal').classList.remove('active');
}

;

/* =========================================================
   ФИКС КАРТЫ (КЛИКИ ПО ТЕМАМ И БОССАМ)
   ========================================================= */
document.addEventListener("click", (e) => {
  // 1. Клик по карточке темы (запуск тренировки)
  const mapCard = e.target.closest('.map-card[data-topic-id]');
  if (mapCard && !e.target.closest('.map-boss-btn')) {
    const topicId = mapCard.dataset.topicId;
    state.selectedTopicIds = new Set([topicId]);


    CONFIG.mode = "training";
    const modeSelect = document.getElementById("modeSelect");
    if (modeSelect) modeSelect.value = "training";
    const mobModeSelect = document.getElementById("mobModeSelect");
    if (mobModeSelect) mobModeSelect.value = "training";

    
    if (typeof syncTopicCheckboxes === "function") syncTopicCheckboxes();
    if (typeof saveSelectedTopics === "function") saveSelectedTopics();
    
    const favCb = document.getElementById("specialFav");
    const errCb = document.getElementById("specialErr");
    if (favCb) favCb.checked = false;
    if (errCb) errCb.checked = false;
    
    // Запускаем тест (модалка карты закроется сама, так как мы вызываем launchMobileTest)
    if (typeof launchMobileTest === 'function') launchMobileTest();
    return; // Выходим, чтобы не сработали другие обработчики
  }

  // 2. Клик по кнопке "Сразиться с боссом"
  const bossBtn = e.target.closest('.map-boss-btn');
  if (bossBtn) {
    e.stopPropagation();
    e.preventDefault();
    const topicId = bossBtn.dataset.topicId;
    const data = loadBossData();
    
    const bossName = data.topicNames[topicId] || generateRandomBossName();
    if (!data.topicNames[topicId]) { data.topicNames[topicId] = bossName; }
    if (!data.topicIcons[topicId]) { data.topicIcons[topicId] = getRandomBossIcon(); }
    if (!data.topicSkins[topicId]) { data.topicSkins[topicId] = getRandomBossSkin(); }
    saveBossData(data);
    
    const icon = data.topicIcons[topicId] || "⚔️";
    const skin = data.topicSkins[topicId] || getRandomBossSkin();
    
    // Открываем модалку босса ПОВЕРХ карты (не закрываем карту)
    if (typeof showBossModal === "function") {
      showBossModal("topic", topicId, "Босс темы", bossName, 100, icon, skin);
    }
    return;
  }

  // 3. Финальный босс
  if (e.target.closest('#finalBossBtn')) {
    e.preventDefault();
    const finalName = getBossName();
    const data = loadBossData();
    const icon = data.finalBoss.icon || "🌙";
    const skin = data.finalBoss.skin || getRandomBossSkin();
    
    // Открываем модалку ПОВЕРХ карты
    if (typeof showBossModal === "function") showBossModal("final", null, "Финальный босс", finalName, 100, icon, skin);
    return;
  }
  
  // 4. Ультра-босс
  if (e.target.closest('#ultraBossBtn')) {
    e.preventDefault();
    const data = loadBossData();
    const skin = data.ultraBoss.skin || getRandomBossSkin();
    
    // Открываем модалку ПОВЕРХ карты
    if (typeof showBossModal === "function") showBossModal("ultra", null, "Ультра-босс", "Пожиратель Лицензий", 80, "👹", skin);
    return;
  }
});
/* =========================================================
   ПОИСК В МОБИЛЬНОМ ИНТЕРФЕЙСЕ (СТРОГО ПО ТЕКУЩЕМУ ФАЙЛУ)
   ========================================================= */
const mobileSearchInput = document.getElementById('mobileSearchInput');
const mobileSearchResults = document.getElementById('mobileSearchResults');

function renderMobileSearchResults(query) {
  if (!query || query.trim().length < 2) {
    mobileSearchResults.classList.remove("open");
    mobileSearchResults.innerHTML = "";
    return;
  }
  
  const q = query.trim().toLowerCase();
  
  // ВАЖНО: Берем вопросы ТОЛЬКО из state.topics (текущий загруженный файл)
  const results = [];
  state.topics.forEach(topic => {
    topic.questions.forEach(qItem => {
      const item = { ...qItem, _topicId: topic.id, _topicTitle: topic.title };
      if (
        item.id.toLowerCase().includes(q) || 
        item.q.toLowerCase().includes(q) ||
        item.options.some(o => o.toLowerCase().includes(q))
      ) {
        results.push(item);
      }
    });
  });

  // Ограничиваем до 15 результатов
  const topResults = results.slice(0, 15);

  if (topResults.length === 0) {
    mobileSearchResults.innerHTML = `<div class="search-empty">Ничего не найдено в текущем файле</div>`;
    mobileSearchResults.classList.add("open");
    return;
  }

  let html = "";
  topResults.forEach(item => {
    // Проверяем, есть ли этот вопрос в текущей сессии теста
    const idx = state.order.findIndex(x => x.id === item.id && x._topicId === item._topicId);
    const inCurrent = idx !== -1;
    
    const status = inCurrent
      ? `<span style="color:var(--ok);font-size:12px;">— В тесте, №${idx + 1}</span>`
      : `<span style="color:var(--muted);font-size:12px;">— Не в тесте</span>`;
      
    // Подсветка найденного текста
    const lowerQ = item.q.toLowerCase();
    const matchIdx = lowerQ.indexOf(q);
    let highlightedQ = escapeHtml(item.q);
    if (matchIdx !== -1) {
      highlightedQ = escapeHtml(item.q.slice(0, matchIdx)) + 
                     "<mark>" + escapeHtml(item.q.slice(matchIdx, matchIdx + q.length)) + "</mark>" + 
                     escapeHtml(item.q.slice(matchIdx + q.length));
    }
      
    html += `<div class="search-item" data-idx="${idx}" data-id="${item.id}" data-topic="${item._topicId}">`;
    html += `<div><span class="sr-id">${escapeHtml(item.id)}</span> <span class="sr-topic">${escapeHtml(item._topicTitle || "")} ${status}</span></div>`;
    html += `<div class="sr-q">${highlightedQ}</div>`;
    html += `</div>`;
  });
  
  mobileSearchResults.innerHTML = html;
  mobileSearchResults.classList.add("open");

  mobileSearchResults.querySelectorAll(".search-item").forEach(el => {
    el.addEventListener("click", () => {
      const idx = parseInt(el.dataset.idx, 10);
      if (idx >= 0) {
        // Если вопрос в текущем тесте — переходим к нему
        state.current = idx;
        state.finished = false;
        state.showingReview = false;
        state.showingTop = false;
        render();
        if (typeof launchMobileTest === 'function') launchMobileTest();
      } else {
        // Если вопроса нет в текущем тесте, запускаем его отдельно
        const topicId = el.dataset.topic;
        const qId = el.dataset.id;
        const topic = state.topics.find(t => t.id === topicId);
        if (!topic) return;
        const question = topic.questions.find(q => q.id === qId);
        if (!question) return;

        state.order = [{ ...question, _topicId: topicId, _topicTitle: topic.title }];
        state.optionOrders = {};
        state.answers = {};
        state.current = 0;
        state.finished = false;
        state.showingReview = false;
        state.showingTop = false;
        
        let idxs = question.options.map((_, i) => i);
        if (question.shuffle !== false) idxs = shuffle(idxs);
        state.optionOrders[question.id] = idxs;

        render();
        if (typeof launchMobileTest === 'function') launchMobileTest();
      }
      mobileSearchResults.classList.remove("open");
      mobileSearchInput.value = "";
    });
  });
}

mobileSearchInput.addEventListener("input", (e) => renderMobileSearchResults(e.target.value));
mobileSearchInput.addEventListener("blur", () => {
  setTimeout(() => mobileSearchResults.classList.remove("open"), 200);
});

/* =========================================================
   ГЛОБАЛЬНЫЕ ФУНКЦИИ ДЛЯ HTML (КАРТА И РАЗБОР)
   ========================================================= */

// Запуск теста по конкретной теме прямо из карты
window.startTopicFromMap = function(topicId) {
  
  CONFIG.mode = "training";
  const modeSelect = document.getElementById("modeSelect");
  if (modeSelect) modeSelect.value = "training";
  const mobModeSelect = document.getElementById("mobModeSelect");
  if (mobModeSelect) mobModeSelect.value = "training";

  state._bossFight = null;
  state.selectedTopicIds = new Set([topicId]);
  if (typeof syncTopicCheckboxes === "function") syncTopicCheckboxes();
  if (typeof saveSelectedTopics === "function") saveSelectedTopics();
  
  const favCb = document.getElementById("specialFav");
  const errCb = document.getElementById("specialErr");
  if (favCb) favCb.checked = false;
  if (errCb) errCb.checked = false;

  // Закрываем карту
  //const mapOverlay = document.getElementById("mapOverlay");
  //if (mapOverlay) mapOverlay.style.display = "none";
  
  // Запускаем тест и открываем модалку
  if (typeof launchMobileTest === 'function') {
    launchMobileTest();
  } else {
    start(); 
    document.body.classList.add('test-is-open');
  }
};

// Переключатель "Только ошибки" в разборе
window.toggleReviewFilter = function() {
  state.reviewFilterErrors = !state.reviewFilterErrors;
  render();
};

/* =========================================================
   МОДАЛКА ВЫБОРА ТЕМ ПЕРЕД СТАРТОМ
   ========================================================= */
function openStartOptionsModal() {
  if (!state.topics || state.topics.length === 0) {
    alert("Сначала загрузите файл вопросов.");
    return;
  }
  renderStartOptions();
  const modal = document.getElementById("startOptionsModal");
  if (modal) {
    modal.classList.add("active");
    bringToFront(modal);
  }
  document.body.style.overflow = "hidden";
}

function closeStartOptionsModal() {
  const modal = document.getElementById("startOptionsModal");
  if (modal) modal.classList.remove("active");
  document.body.style.overflow = "";
}

function syncStartBehaviorButtons() {
  const q = document.getElementById("shuffleQ")?.checked;
  const a = document.getElementById("shuffleA")?.checked;
  const qBtn = document.getElementById("startShuffleQBtn");
  const aBtn = document.getElementById("startShuffleABtn");
  if (qBtn) qBtn.classList.toggle("active", !!q);
  if (aBtn) aBtn.classList.toggle("active", !!a);
}

function renderStartOptions() {
  const list = document.getElementById("startTopicsList");
  if (!list) return;

  const favCount = countFavorites();
  const errCount = countErrors();

  const favEl = document.getElementById("presetFavoritesCount");
  const errEl = document.getElementById("presetErrorsCount");
  if (favEl) favEl.textContent = favCount;
  if (errEl) errEl.textContent = errCount;

  const favBtn = document.getElementById("presetFavoritesBtn");
  const errBtn = document.getElementById("presetErrorsBtn");
  if (favBtn) favBtn.disabled = (favCount === 0);
  if (errBtn) errBtn.disabled = (errCount === 0);

  const specialFav = document.getElementById("specialFav")?.checked;
  const specialErr = document.getElementById("specialErr")?.checked;
  const isSpecialModeActive = specialFav || specialErr;

  // Обновляем активное состояние пресетов
  document.querySelectorAll("#startPresets .preset-btn").forEach(btn => {
    btn.classList.remove("active");
    const p = btn.dataset.preset;
    if (p === "favorites" && specialFav) btn.classList.add("active");
    if (p === "errors" && specialErr) btn.classList.add("active");
  });


  
  // Отрисовка тем
  let html = "";
  state.topics.forEach(topic => {
    const total = topic.questions.length;
    const mastered = topic.questions.filter(q => {
      const st = state.stats[topic.id + ":" + q.id] || {};
      return st.err === 0 && st.ok > 0;
    }).length;
    
    const isSelected = state.selectedTopicIds.has(topic.id) && !isSpecialModeActive;
    
    html += `
      <div class="topic-pick-card ${isSelected ? "active" : ""}" data-topic-id="${topic.id}" ${isSpecialModeActive ? 'style="opacity: 0.5; pointer-events: none;"' : ''}>
        <div class="topic-pick-card-content">
          <div class="topic-pick-card-title">${escapeHtml(topic.title)}</div>
          <div class="topic-pick-card-meta">${mastered} / ${total} освоено</div>
        </div>
      </div>
    `;
  });

  list.innerHTML = html;

  // Навешиваем обработчики на карточки
  list.querySelectorAll(".topic-pick-card").forEach(card => {
    card.addEventListener("click", () => {
      if (isSpecialModeActive) return;
      const id = card.dataset.topicId;
      if (state.selectedTopicIds.has(id)) state.selectedTopicIds.delete(id);
      else state.selectedTopicIds.add(id);
      
      saveSelectedTopics();
      renderStartOptions();
    });
  });

  // Синхронизация кнопок перемешивания с реальными чекбоксами
  const sqBtn = document.getElementById("startShuffleQBtn");
  const saBtn = document.getElementById("startShuffleABtn");
  const oldSq = document.getElementById("shuffleQ");
  const oldSa = document.getElementById("shuffleA");
  
  if (sqBtn && oldSq) sqBtn.classList.toggle("active", oldSq.checked);
  if (saBtn && oldSa) saBtn.classList.toggle("active", oldSa.checked);

  // Обновляем футер
  const countEl = document.getElementById("startOptionsCount");
  const goBtn = document.getElementById("startOptionsGoBtn");

  let totalQuestions = 0;
  if (specialFav) totalQuestions = favCount;
  else if (specialErr) totalQuestions = errCount;
  else {
    totalQuestions = Array.from(state.selectedTopicIds).reduce((acc, id) => {
      const t = state.topics.find(x => x.id === id);
      return acc + (t ? t.questions.length : 0);
    }, 0);
  }

  let summaryText = "";
  if (specialFav) summaryText = `⭐ Избранное (${favCount} вопросов)`;
  else if (specialErr) summaryText = `❌ Ошибки (${errCount} вопросов)`;
  else summaryText = `Выбрано: ${state.selectedTopicIds.size} тем (${totalQuestions} вопросов)`;

  if (countEl) countEl.textContent = summaryText;
  if (goBtn) goBtn.disabled = (!specialFav && !specialErr && totalQuestions === 0);
}

function startFromOptions() {
  closeStartOptionsModal();
  if (window.GameApp && window.GameApp.resetSessionXp) window.GameApp.resetSessionXp();
  clearSession();
  start();
  launchMobileTest();
}

document.addEventListener("click", (e) => {
  const btn = e.target.closest("[data-behavior]");
  if (!btn) return;
  const which = btn.dataset.behavior; // "shuffleQ" | "shuffleA"
  const oldId = which === "shuffleQ" ? "shuffleQ" : "shuffleA";
  const old = document.getElementById(oldId);
  if (old) {
    old.checked = !old.checked;
    old.dispatchEvent(new Event("change"));
  }
  btn.classList.toggle("active", !!old?.checked);
});

document.addEventListener("click", (e) => {
  const btn = e.target.closest("#startPresets .preset-btn");
  if (!btn) return;
  const preset = btn.dataset.preset;
  const favCb = document.getElementById("specialFav");
  const errCb = document.getElementById("specialErr");

  if (preset === "all") {
    state.selectedTopicIds = new Set(state.topics.map(t => t.id));
    if (favCb) favCb.checked = false;
    if (errCb) errCb.checked = false;
    saveSelectedTopics();
  } else if (preset === "none") {
    state.selectedTopicIds = new Set();
    if (favCb) favCb.checked = false;
    if (errCb) errCb.checked = false;
    saveSelectedTopics();
  } else if (preset === "errors") {
    if (favCb) favCb.checked = false;
    if (errCb) errCb.checked = true;
  } else if (preset === "favorites") {
    if (favCb) favCb.checked = true;
    if (errCb) errCb.checked = false;
  }
  renderStartOptions();
});

["startShuffleQ", "startShuffleA"].forEach(id => {
  const el = document.getElementById(id);
  if (!el) return;
  el.addEventListener("change", (e) => {
    const oldId = id === "startShuffleQ" ? "shuffleQ" : "shuffleA";
    const old = document.getElementById(oldId);
    if (old) {
      old.checked = e.target.checked;
      old.dispatchEvent(new Event("change"));
    }
  });
});

window.openStartOptionsModal = openStartOptionsModal;
window.closeStartOptionsModal = closeStartOptionsModal;
window.startFromOptions = startFromOptions;
function resetZIndexIfEmpty() {
  const activeModals = document.querySelectorAll('.modal-overlay.active');
  if (activeModals.length === 0) {
    globalZIndex = 2000; // Сбрасываем при закрытии всех
  }
}


