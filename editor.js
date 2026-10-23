/* =========================================================
   editor.js — редактор набора вопросов для тестера.
   Подключается к index.html как <script src="editor.js"></script>.
   Работает только если на странице есть window.TestApp.
   ========================================================= */
(function () {
  "use strict";

  // ---------- 1. Проверка: есть ли тестер ----------
  if (!window.TestApp || !window.TestApp.state) {
    // Тестер не инициализирован — тихо выходим, ничего не делаем.
    return;
  }

  const App = window.TestApp;
  const state = App.state;

  // ---------- 2. Константы ----------
  const LS_DRAFT_PREFIX = "editor:draft:";
  const LS_UI_PREFIX = "editor:ui:";
  const UNDO_LIMIT = 50;

  // Локальное состояние редактора (не путать с App.state)
  const ed = {
    open: false,
    overlayEl: null,
    currentTopicId: null,
    currentQuestionIdx: null,
    collapsed: new Set(),
    undoStack: [],
    redoStack: [],
    draftTimer: null,
    dirty: false,
    baselineSnapshot: "",
    lastAutosaveTs: 0,
    formBuffer: null,
    formOriginalKey: null,
    modalEl: null,
    modalTopicId: null,
    searchQuery: "",
    _prevDocTitle: null,
  };

  // ---------- 3. Утилиты ----------
  const $ = (s, root = document) => root.querySelector(s);
  const $$ = (s, root = document) => Array.from(root.querySelectorAll(s));
  const esc = App.escapeHtml;
  const deepClone = (o) => JSON.parse(JSON.stringify(o));

  function nowHHMMSS() {
    const d = new Date();
    const p = (n) => String(n).padStart(2, "0");
    return p(d.getHours()) + ":" + p(d.getMinutes()) + ":" + p(d.getSeconds());
  }

  function draftKey() {
    return LS_DRAFT_PREFIX + (App.fileKey || "default");
  }

  // ---------- 4. Инжект стилей редактора ----------
    function injectStyles() {
    if ($("#editor-styles")) return;
    const style = document.createElement("style");
    style.id = "editor-styles";
    style.textContent = `
      #editor-overlay {
        position: fixed; inset: 0; z-index: 2000;
        background: var(--bg, #f4f6fa);
        color: var(--text, #1c1f26);
        font-family: var(--font, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif);
        display: none;
        flex-direction: column;
        line-height: 1.5;
      }
      #editor-overlay.open { display: flex; }

      /* ---------- Шапка ---------- */
      .ed-header {
        display: flex; align-items: center; gap: 12px;
        padding: 12px 20px;
        background: var(--card, #fff);
        border-bottom: 1px solid var(--border, #e2e6ee);
        flex-shrink: 0;
      }
      .ed-header h1 {
        font-size: 17px; margin: 0; font-weight: 700;
        white-space: nowrap;
      }
      .ed-header .ed-sub {
        color: var(--muted, #6b7280); font-size: 13px;
        white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
        max-width: 40vw;
      }
      .ed-header .ed-actions {
        margin-left: auto; display: flex; gap: 8px; flex-wrap: wrap;
      }
      .ed-header button {
        font: inherit; padding: 7px 14px; border-radius: 8px;
        border: 1px solid var(--border, #e2e6ee);
        background: var(--card, #fff); color: var(--text, #1c1f26);
        cursor: pointer; font-weight: 600; font-size: 13px;
        transition: background .15s, border-color .15s, color .15s;
      }
      .ed-header button:hover {
        background: var(--bg, #f0f4fa);
        border-color: var(--accent, #2b6cb0);
      }
      .ed-header button.primary {
        background: var(--accent, #2b6cb0); color: #fff;
        border-color: var(--accent, #2b6cb0);
      }
      .ed-header button.primary:hover {
        background: var(--accent-hover, #1f4e80);
        border-color: var(--accent-hover, #1f4e80);
      }
      .ed-header button.danger {
        border-color: var(--err, #c53030);
        color: var(--err, #c53030);
        background: transparent;
      }
      .ed-header button.danger:hover {
        background: var(--err-bg, #ffecec);
      }

      .ed-header button:disabled,
      .ed-header button:disabled:hover {
        opacity: .45;
        cursor: not-allowed;
        background: var(--bg, #f0f0f0);
        color: var(--muted, #6b7280);
        border-color: var(--border, #e2e6ee);
      }
      .ed-header button.primary:disabled,
      .ed-header button.primary:disabled:hover {
        background: var(--muted, #b8c0cf);
        color: var(--card, #fff);
        border-color: var(--muted, #b8c0cf);
        opacity: .6;
      }
      .ed-header button.danger:disabled,
      .ed-header button.danger:disabled:hover {
        background: transparent;
        color: var(--muted, #6b7280);
        border-color: var(--border, #e2e6ee);
        opacity: .4;
      }

      /* ---------- Тело ---------- */
      .ed-body {
        flex: 1; display: grid;
        grid-template-columns: 320px 1fr;
        min-height: 0;
      }
      @media (max-width: 760px) {
        .ed-body { grid-template-columns: 1fr; }
      }

      .ed-left {
        background: var(--card, #fff);
        border-right: 1px solid var(--border, #e2e6ee);
        overflow-y: auto;
        padding: 12px 8px;
      }
      .ed-right {
        background: var(--bg, #f4f6fa);
        overflow-y: auto;
        padding: 20px 24px 60px;
      }

      /* ---------- Скроллбары (в т.ч. для тёмной темы) ---------- */
      .ed-left::-webkit-scrollbar,
      .ed-right::-webkit-scrollbar,
      .ed-modal::-webkit-scrollbar {
        width: 10px; height: 10px;
      }
      .ed-left::-webkit-scrollbar-track,
      .ed-right::-webkit-scrollbar-track,
      .ed-modal::-webkit-scrollbar-track {
        background: var(--bg, #f4f6fa);
      }
      .ed-left::-webkit-scrollbar-thumb,
      .ed-right::-webkit-scrollbar-thumb,
      .ed-modal::-webkit-scrollbar-thumb {
        background: var(--border, #cfd7e3);
        border-radius: 5px;
        border: 2px solid var(--bg, #f4f6fa);
      }
      .ed-left::-webkit-scrollbar-thumb:hover,
      .ed-right::-webkit-scrollbar-thumb:hover,
      .ed-modal::-webkit-scrollbar-thumb:hover {
        background: var(--muted, #8a93a1);
      }

      /* ---------- Дерево тем ---------- */
      .ed-topic { margin-bottom: 6px; }
      .ed-topic-head {
        display: flex; align-items: center; gap: 6px;
        padding: 6px 8px; border-radius: 8px;
        cursor: pointer; user-select: none;
        font-weight: 600; font-size: 13px;
        transition: background .12s;
      }
      .ed-topic-head:hover { background: rgba(74,158,255,.12); }
      .ed-topic-head.active {
        background: rgba(74,158,255,.18);
        color: var(--accent, #2b6cb0);
      }
      .ed-topic-head .ed-caret {
        display: inline-block; width: 12px; transition: transform .15s;
        color: var(--muted, #6b7280); font-size: 11px;
      }
      .ed-topic.collapsed .ed-caret { transform: rotate(-90deg); }
      .ed-topic.collapsed .ed-q-list { display: none; }
      .ed-topic-head .ed-topic-title {
        flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
      }
      .ed-topic-head .ed-count {
        color: var(--muted, #6b7280); font-weight: 400; font-size: 12px;
      }

      .ed-q-list {
        margin: 2px 0 6px 18px;
        display: flex; flex-direction: column; gap: 1px;
      }
      .ed-q-item {
        display: flex; align-items: center; gap: 6px;
        padding: 4px 8px; border-radius: 6px;
        cursor: pointer; font-size: 13px;
        color: var(--muted, #6b7280);
        transition: background .12s, color .12s;
        position: relative;
      }
      .ed-q-item:hover {
        background: rgba(74,158,255,.12);
        color: var(--text, #1c1f26);
      }
      .ed-q-item.active {
        background: var(--accent, #2b6cb0); color: #fff;
      }
      .ed-q-item .ed-q-id {
        font-weight: 700; color: var(--accent, #2b6cb0); min-width: 34px;
      }
      .ed-q-item.active .ed-q-id { color: #fff; }
      .ed-q-item .ed-q-text {
        flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
      }

      .ed-empty {
        padding: 30px 20px; text-align: center;
        color: var(--muted, #6b7280); font-size: 14px;
      }

      /* ---------- Заглушки ---------- */
      .ed-form-placeholder {
        border: 2px dashed var(--border, #e2e6ee);
        border-radius: var(--radius, 12px);
        padding: 40px 24px; text-align: center;
        color: var(--muted, #6b7280);
      }
      .ed-form-placeholder h2 {
        margin: 0 0 6px; color: var(--text, #1c1f26); font-size: 16px;
      }

      /* ---------- Статусбар ---------- */
      .ed-statusbar {
        flex-shrink: 0;
        padding: 6px 20px;
        background: var(--card, #fff);
        border-top: 1px solid var(--border, #e2e6ee);
        font-size: 12px; color: var(--muted, #6b7280);
        display: flex; gap: 16px; align-items: center;
      }
      .ed-statusbar .ed-dot {
        width: 8px; height: 8px; border-radius: 50%;
        background: var(--ok, #2f855a); display: inline-block;
      }
      .ed-statusbar .ed-dot.dirty { background: var(--warn, #b7791f); }

      /* ---------- Форма ---------- */
      .ed-form { max-width: 820px; }
      .ed-form-head {
        display: flex; align-items: baseline; gap: 12px;
        margin-bottom: 18px; padding-bottom: 10px;
        border-bottom: 1px solid var(--border, #e2e6ee);
        flex-wrap: wrap;
      }
      .ed-form-head h2 { margin: 0; font-size: 18px; }
      .ed-form-pos { color: var(--muted, #6b7280); font-size: 13px; }

      .ed-field { margin-bottom: 18px; }
      .ed-field > label {
        display: block; font-weight: 600;
        margin-bottom: 6px; font-size: 13px;
        color: var(--text, #1c1f26);
      }
      .ed-field input[type="text"],
      .ed-field textarea,
      .ed-field select {
        width: 100%; box-sizing: border-box;
        font: inherit; font-size: 14px;
        padding: 8px 10px;
        border: 1px solid var(--border, #cfd7e3);
        border-radius: 6px;
        background: var(--card, #fff);
        color: var(--text, #1c1f26);
        transition: border-color .15s, box-shadow .15s;
      }
      .ed-field input[type="text"]:focus,
      .ed-field textarea:focus,
      .ed-field select:focus {
        outline: none;
        border-color: var(--accent, #2b6cb0);
        box-shadow: 0 0 0 3px rgba(74,158,255,.22);
      }
      .ed-field textarea {
        resize: vertical; min-height: 60px;
        font-family: inherit;
      }
      .ed-hint {
        color: var(--muted, #6b7280); font-size: 12px;
        margin-top: 4px;
      }

      /* ---------- Варианты ответов ---------- */
      .ed-options {
        display: flex; flex-direction: column; gap: 6px;
      }
      .ed-opt-row {
        display: flex; align-items: center; gap: 8px;
        padding: 6px 8px;
        border: 1px solid var(--border, #e2e6ee);
        border-radius: 6px;
        background: var(--card, #fff);
        color: var(--text, #1c1f26);
      }
      .ed-opt-row input[type="radio"] {
        flex-shrink: 0; margin: 0;
        accent-color: var(--accent, #2b6cb0);
      }
      .ed-opt-num {
        color: var(--muted, #6b7280); font-size: 13px;
        min-width: 22px;
      }
      .ed-opt-text {
        flex: 1;
        border: 1px solid transparent !important;
        background: transparent !important;
        padding: 4px 6px !important;
        font-size: 14px;
        color: var(--text, #1c1f26);
      }
      .ed-opt-text:focus {
        background: var(--bg, #fff) !important;
        border-color: var(--accent, #2b6cb0) !important;
        box-shadow: none !important;
      }
      .ed-opt-text::placeholder {
        color: var(--muted, #6b7280);
      }

      /* ---------- Кнопки редактора ---------- */
      .ed-btn {
        font: inherit; font-size: 13px; font-weight: 600;
        padding: 7px 14px; border-radius: 8px;
        border: 1px solid var(--border, #e2e6ee);
        background: var(--card, #fff); color: var(--text, #1c1f26);
        cursor: pointer;
        transition: background .15s, border-color .15s, color .15s;
      }
      .ed-btn:hover {
        background: var(--bg, #f0f4fa);
        border-color: var(--accent, #2b6cb0);
      }
      .ed-btn.primary {
        background: var(--accent, #2b6cb0); color: #fff;
        border-color: var(--accent, #2b6cb0);
      }
      .ed-btn.primary:hover {
        background: var(--accent-hover, #1f4e80);
        border-color: var(--accent-hover, #1f4e80);
      }
      .ed-btn.danger {
        border-color: var(--err, #c53030); color: var(--err, #c53030);
        background: transparent;
      }
      .ed-btn.danger:hover { background: var(--err-bg, #ffecec); }
      .ed-btn:disabled { opacity: .45; cursor: not-allowed; }
      .ed-btn.small { padding: 3px 9px; font-size: 12px; }

      .ed-form-actions {
        display: flex; gap: 8px; flex-wrap: wrap;
        margin-top: 24px; padding-top: 16px;
        border-top: 1px solid var(--border, #e2e6ee);
      }
      .ed-form-nav {
        display: flex; gap: 8px; flex-wrap: wrap;
        margin-top: 12px;
        justify-content: space-between;
      }

      /* ---------- Действия темы ---------- */
      .ed-topic-actions {
        display: flex; gap: 2px;
        padding: 0 8px 4px 24px;
        margin-top: -2px;
      }
      .ed-icon-btn {
        font: inherit; font-size: 13px;
        width: 24px; height: 24px; padding: 0;
        border: 1px solid transparent; border-radius: 5px;
        background: transparent; color: var(--muted, #6b7280);
        cursor: pointer; display: inline-flex;
        align-items: center; justify-content: center;
        transition: background .12s, color .12s, border-color .12s;
      }
      .ed-icon-btn:hover {
        background: rgba(74,158,255,.15);
        color: var(--accent, #2b6cb0);
        border-color: var(--border, #e2e6ee);
      }
      .ed-icon-btn.danger:hover {
        background: var(--err-bg, #ffecec); color: var(--err, #c53030);
        border-color: var(--err, #c53030);
      }
      .ed-icon-btn:disabled { opacity: .3; cursor: not-allowed; }
      .ed-icon-btn:disabled:hover {
        background: transparent; color: var(--muted, #6b7280);
        border-color: transparent;
      }

      /* ---------- Модальное окно ---------- */
      .ed-modal-backdrop {
        position: fixed; inset: 0; z-index: 3000;
        background: rgba(0,0,0,.45);
        display: none; align-items: center; justify-content: center;
        padding: 20px;
      }
      .ed-modal-backdrop.open { display: flex; }
      .ed-modal {
        background: var(--card, #fff);
        color: var(--text, #1c1f26);
        border-radius: var(--radius, 12px);
        padding: 22px 26px 20px;
        max-width: 520px; width: 100%;
        max-height: 90vh; overflow-y: auto;
        box-shadow: 0 10px 40px rgba(0,0,0,.25);
      }
      .ed-modal h2 { margin: 0 0 18px; font-size: 18px; }
      .ed-modal-actions {
        display: flex; gap: 8px; align-items: center;
        margin-top: 22px; padding-top: 14px;
        border-top: 1px solid var(--border, #e2e6ee);
      }

      /* ---------- Блок перемещения ---------- */
      .ed-move-block {
        margin-top: 22px; padding: 12px 14px;
        background: rgba(74,158,255,.06);
        border: 1px solid var(--border, #e2e6ee);
        border-radius: 8px;
        display: flex; flex-direction: column; gap: 8px;
      }
      .ed-move-row {
        display: flex; gap: 8px; align-items: center; flex-wrap: wrap;
      }
      .ed-move-label {
        font-size: 13px; color: var(--muted, #6b7280);
        min-width: 110px;
      }
      .ed-move-select {
        font: inherit; font-size: 13px;
        padding: 5px 8px;
        border: 1px solid var(--border, #cfd7e3);
        border-radius: 6px;
        background: var(--card, #fff);
        color: var(--text, #1c1f26);
        min-width: 180px;
      }

      /* ---------- Кнопки перемещения вопроса в дереве ---------- */
      .ed-q-actions { display: none; gap: 1px; flex-shrink: 0; }
      .ed-q-item:hover .ed-q-actions,
      .ed-q-item.active .ed-q-actions { display: inline-flex; }
      .ed-q-act {
        font: inherit; font-size: 12px; line-height: 1;
        width: 20px; height: 20px; padding: 0;
        border: 1px solid transparent; border-radius: 4px;
        background: transparent; color: var(--muted, #6b7280);
        cursor: pointer;
        display: inline-flex; align-items: center; justify-content: center;
        transition: background .12s, color .12s, border-color .12s;
      }
      .ed-q-act:hover {
        background: rgba(74,158,255,.15);
        color: var(--accent, #2b6cb0);
        border-color: var(--accent, #2b6cb0);
      }
      .ed-q-act:disabled { opacity: .3; cursor: not-allowed; }
      .ed-q-act:disabled:hover {
        background: transparent; color: var(--muted, #6b7280);
        border-color: transparent;
      }
      .ed-q-item.active .ed-q-act { color: #fff; }
      .ed-q-item.active .ed-q-act:hover {
        background: rgba(255,255,255,.25); color: #fff;
        border-color: rgba(255,255,255,.5);
      }

      /* ---------- Строка ID ---------- */
      .ed-id-row { display: flex; gap: 8px; align-items: stretch; }
      .ed-id-row input[type="text"] { flex: 1; }
      .ed-id-row input[type="text"][readonly] {
        background: var(--bg, #f7f9fc);
        color: var(--muted, #6b7280);
        cursor: default;
      }
    `;
    document.head.appendChild(style);
  }

  // ---------- 5. Сборка DOM редактора ----------
  function buildOverlay() {
    if (ed.overlayEl) return ed.overlayEl;

    const overlay = document.createElement("div");
    overlay.id = "editor-overlay";
    overlay.innerHTML = `
      <div class="ed-header">
        <h1>✏️ Редактор вопросов</h1>
        <span class="ed-sub" id="ed-file-label">—</span>
        <div class="ed-actions">
          <button id="ed-undo" title="Отменить (Ctrl+Z)" disabled>↶ Undo</button>
          <button id="ed-redo" title="Вернуть (Ctrl+Y)" disabled>↷ Redo</button>
          <button id="ed-recalc-ids" title="Пересчитать все авто-id по позиции">🔁 Пересчитать id</button>
          <button id="ed-clear-drafts" title="Удалить все сохранённые черновики редактора">🧹 Черновики</button>
          <button id="ed-export-js" class="primary" title="Скачать .js (Ctrl+S)">💾 .js</button>
          <button id="ed-export-json" title="Скачать .json (Ctrl+Shift+S)">💾 .json</button>
          <button id="ed-close" class="danger" title="Закрыть редактор (Esc)">← Тест</button>
        </div>
      </div>

      <div class="ed-body">
        <div class="ed-left" id="ed-left">
          <div class="ed-empty">Загрузка…</div>
        </div>
        <div class="ed-right" id="ed-right">
          <div class="ed-form-placeholder">
            <h2>Выберите вопрос слева</h2>
            <p>Или добавьте новую тему / вопрос.</p>
          </div>
        </div>
      </div>

      <div class="ed-statusbar">
        <span><span class="ed-dot" id="ed-dot"></span> <span id="ed-status-text">Готово</span></span>
        <span id="ed-autosave-text"></span>
        <span style="margin-left:auto;" id="ed-counts">—</span>
      </div>
    `;
    document.body.appendChild(overlay);
    ed.overlayEl = overlay;

    // обработчики верхней панели
    $("#ed-close", overlay).addEventListener("click", tryCloseEditor);
    $("#ed-undo", overlay).addEventListener("click", () => doUndo());
    $("#ed-redo", overlay).addEventListener("click", () => doRedo());
    $("#ed-export-js", overlay).addEventListener("click", () => exportAs("js"));
    $("#ed-export-json", overlay).addEventListener("click", () => exportAs("json"));

    const recalcBtn = $("#ed-recalc-ids", overlay);
    if (recalcBtn) recalcBtn.addEventListener("click", forceRecalcAllIds);

    const clearDraftsBtn = $("#ed-clear-drafts", overlay);
    if (clearDraftsBtn) clearDraftsBtn.addEventListener("click", clearAllDrafts);

    return overlay;
  }

  // ---------- 6. Рендер левой панели: дерево тем и вопросов ----------
  function renderLeft() {
    const el = $("#ed-left");
    if (!el) return;

    const allTopics = App.topics || [];
    const q = (ed.searchQuery || "").trim().toLowerCase();

    // фильтрация
    const topics = allTopics.map(t => {
      if (!q) return t;
      // оставляем тему, если её название содержит q,
      // или хотя бы один вопрос содержит q
      const matchTopic = (t.title || "").toLowerCase().includes(q);
      const matchedQuestions = (t.questions || []).filter(qq =>
        (String(qq.id || "").toLowerCase().includes(q)) ||
        (String(qq.q || "").toLowerCase().includes(q)) ||
        (qq.options || []).some(o => String(o).toLowerCase().includes(q))
      );
      if (matchTopic) return t;
      if (matchedQuestions.length > 0) {
        return Object.assign({}, t, { questions: matchedQuestions });
      }
      return null;
    }).filter(Boolean);

    let html = "";

    // — поиск —
    html += `<div style="padding:0 6px 8px;">`;
    html += `<input type="search" id="ed-search" placeholder="Поиск по id, тексту, вариантам…" value="${esc(ed.searchQuery || "")}" style="width:100%;box-sizing:border-box;font:inherit;font-size:13px;padding:6px 10px;border:1px solid var(--border,#cfd7e3);border-radius:6px;background:var(--card,#fff);color:var(--text,#1c1f26);">`;
    html += `</div>`;

    // — кнопка «+ Новая тема» —
    html += `<div style="padding:0 6px 8px;">`;
    html += `<button type="button" class="ed-btn primary" id="ed-add-topic" style="width:100%;">+ Новая тема</button>`;
    html += `</div>`;

    // — если поиск ничего не нашёл —
    if (q && topics.length === 0) {
      html += `<div class="ed-empty" style="padding:20px 10px;font-size:13px;">Ничего не найдено по запросу «${esc(ed.searchQuery)}»</div>`;
      el.innerHTML = html;
      bindLeftHandlers(el);
      return;
    }

    if (topics.length === 0) {
      html += `<div class="ed-empty">
        Набор пуст.<br>Нажмите «+ Новая тема» или загрузите файл вопросов в тестере.
      </div>`;
      el.innerHTML = html;
      bindLeftHandlers(el);
      return;
    }

    if (topics.length === 0) {
      html += `<div class="ed-empty">
        Набор пуст.<br>Нажмите «+ Новая тема» или загрузите файл вопросов в тестере.
      </div>`;
      el.innerHTML = html;
      bindLeftHandlers(el);
      return;
    }

    topics.forEach((t, topicIdx) => {
      const questions = t.questions || [];
      const isCollapsed = ed.collapsed.has(t.id);
      const isActiveTopic = (ed.currentTopicId === t.id);

      html += `<div class="ed-topic${isCollapsed ? " collapsed" : ""}" data-topic="${esc(t.id)}">`;

      // — шапка темы —
      html += `<div class="ed-topic-head${isActiveTopic && ed.currentQuestionIdx === null ? " active" : ""}" data-topic="${esc(t.id)}">`;
      html += `<span class="ed-caret">▼</span>`;
      html += `<span class="ed-topic-title" title="${esc(t.title || "")}">${esc(t.title || "Без названия")}</span>`;
      html += `<span class="ed-count">${questions.length}</span>`;
      html += `</div>`;

      // — панель действий темы —
      html += `<div class="ed-topic-actions">`;
      html += `<button type="button" class="ed-icon-btn" data-act="up"   data-topic="${esc(t.id)}" ${topicIdx === 0 ? "disabled" : ""} title="Вверх">↑</button>`;
      html += `<button type="button" class="ed-icon-btn" data-act="down" data-topic="${esc(t.id)}" ${topicIdx === topics.length - 1 ? "disabled" : ""} title="Вниз">↓</button>`;
      html += `<button type="button" class="ed-icon-btn" data-act="edit" data-topic="${esc(t.id)}" title="Редактировать тему">✎</button>`;
      html += `<button type="button" class="ed-icon-btn" data-act="dup"  data-topic="${esc(t.id)}" title="Дублировать тему">⧉</button>`;
      html += `<button type="button" class="ed-icon-btn danger" data-act="del" data-topic="${esc(t.id)}" title="Удалить тему">🗑</button>`;
      html += `</div>`;

      // — список вопросов —
      html += `<div class="ed-q-list">`;
      if (questions.length === 0) {
        html += `<div class="ed-q-item" style="cursor:default;color:var(--muted);font-style:italic;">— нет вопросов —</div>`;
      } else {
        questions.forEach((q, idx) => {
          const isActiveQ = (ed.currentTopicId === t.id && ed.currentQuestionIdx === idx);
          const qid = q.id != null ? q.id : "?";
          html += `<div class="ed-q-item${isActiveQ ? " active" : ""}" data-topic="${esc(t.id)}" data-idx="${idx}">`;
          html += `<span class="ed-q-id">${esc(qid)}</span>`;
          html += `<span class="ed-q-text">${esc(q.q || "(пусто)")}</span>`;
          html += `<span class="ed-q-actions">`;
          html += `<button type="button" class="ed-q-act" data-act="q-up"   data-topic="${esc(t.id)}" data-idx="${idx}" ${idx === 0 ? "disabled" : ""} title="Вверх">↑</button>`;
          html += `<button type="button" class="ed-q-act" data-act="q-down" data-topic="${esc(t.id)}" data-idx="${idx}" ${idx === questions.length - 1 ? "disabled" : ""} title="Вниз">↓</button>`;
          html += `</span>`;
          html += `</div>`;
        });
      }
      html += `</div>`;

      html += `</div>`;
    });

    el.innerHTML = html;
    bindLeftHandlers(el);
  }

  function bindLeftHandlers(el) {
        // — поиск —
    const searchInp = $("#ed-search", el);
    if (searchInp) {
      // сохраняем позицию курсора, если поле уже было в фокусе
      const wasFocused = document.activeElement === searchInp;
      const selStart = searchInp.selectionStart;
      const selEnd = searchInp.selectionEnd;

      searchInp.addEventListener("input", (e) => {
        ed.searchQuery = e.target.value;
        renderLeft();
        // после перерисовки возвращаем фокус в поле
        const again = $("#ed-search");
        if (again) {
          again.focus();
          try { again.setSelectionRange(again.value.length, again.value.length); } catch (err) {}
        }
      });
      searchInp.addEventListener("keydown", (e) => {
        if (e.key === "Escape") {
          e.preventDefault();
          e.stopPropagation();     // ← не даём событию дойти до document
          ed.searchQuery = "";
          renderLeft();
        }
      });

      if (wasFocused) {
        // после перерисовки — вернуть фокус
        setTimeout(() => {
          const again = $("#ed-search");
          if (again) {
            again.focus();
            try { again.setSelectionRange(selStart, selEnd); } catch (err) {}
          }
        }, 0);
      }
    }
	
	// — кнопка «+ Новая тема» —
    const addTopicBtn = $("#ed-add-topic", el);
    if (addTopicBtn) addTopicBtn.addEventListener("click", addNewTopic);

    // — клик по шапке темы: свернуть/развернуть + выбрать тему —
    $$(".ed-topic-head", el).forEach(head => {
      head.addEventListener("click", (e) => {
        e.stopPropagation();
        const id = head.dataset.topic;
        if (ed.currentTopicId !== id) {
          ed.currentTopicId = id;
          ed.currentQuestionIdx = null;
          ed.formBuffer = null;
          ed.formOriginalKey = null;
        }
        if (ed.collapsed.has(id)) ed.collapsed.delete(id);
        else ed.collapsed.add(id);
        renderLeft();
        renderRight();
      });
    });

    // — клик по вопросу —
    $$(".ed-q-item", el).forEach(item => {
      if (item.dataset.idx === undefined) return;
      item.addEventListener("click", (e) => {
        if (e.target.closest(".ed-q-act")) return;
        e.stopPropagation();
        const topicId = item.dataset.topic;
        const idx = parseInt(item.dataset.idx, 10);
        ed.currentTopicId = topicId;
        ed.currentQuestionIdx = idx;
        ed.formBuffer = null;
        ed.formOriginalKey = null;
        ed.collapsed.delete(topicId);
        renderLeft();
        renderRight();
      });
    });

    // — кнопки перемещения вопроса в списке —
    $$(".ed-q-act", el).forEach(btn => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        if (btn.disabled) return;
        const act = btn.dataset.act;
        const topicId = btn.dataset.topic;
        const idx = parseInt(btn.dataset.idx, 10);
        if (act === "q-up")   moveQuestion(topicId, idx, -1);
        if (act === "q-down") moveQuestion(topicId, idx, +1);
      });
    });

    // — панель действий темы —
    $$(".ed-icon-btn[data-act]", el).forEach(btn => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        if (btn.disabled) return;
        const act = btn.dataset.act;
        const topicId = btn.dataset.topic;
        if (act === "up")   moveTopic(topicId, -1);
        if (act === "down") moveTopic(topicId, +1);
        if (act === "edit") editTopic(topicId);
        if (act === "dup")  duplicateTopic(topicId);
        if (act === "del")  deleteTopic(topicId);
      });
    });

    // — прокрутка к активному вопросу —
    const active = $(".ed-q-item.active", el);
    if (active && typeof active.scrollIntoView === "function") {
      active.scrollIntoView({ block: "nearest" });
    }
  }

  // ---------- 7. Правая панель: форма редактирования ----------
  function renderRight() {
    const el = $("#ed-right");
    if (!el) return;

    if (ed.currentTopicId === null) {
      el.innerHTML = `<div class="ed-form-placeholder">
        <h2>Выберите вопрос слева</h2>
        <p>Или создайте новую тему / вопрос.</p>
      </div>`;
      return;
    }

    const topic = App.topics.find(t => t.id === ed.currentTopicId);
    if (!topic) {
      el.innerHTML = `<div class="ed-form-placeholder"><h2>Тема не найдена</h2></div>`;
      return;
    }

    if (ed.currentQuestionIdx === null) {
      el.innerHTML = `
        <div class="ed-form-placeholder">
          <h2>Тема «${esc(topic.title)}»</h2>
          <p>Вопросов: ${(topic.questions || []).length}.</p>
          <p style="margin-top:16px;">
            <button class="ed-btn primary" id="ed-add-first-q">+ Добавить вопрос в эту тему</button>
          </p>
        </div>`;
      const btn = $("#ed-add-first-q", el);
      if (btn) btn.addEventListener("click", addNewQuestion);
      return;
    }

    const q = (topic.questions || [])[ed.currentQuestionIdx];
    if (!q) {
      el.innerHTML = `<div class="ed-form-placeholder"><h2>Вопрос не найден</h2></div>`;
      return;
    }

    const key = ed.currentTopicId + ":" + ed.currentQuestionIdx;
    if (ed.formOriginalKey !== key || !ed.formBuffer) {
      ed.formBuffer = deepClone(q);
      ed.formOriginalKey = key;
    }

    renderQuestionForm(el, topic);
  }

  // ---------- 7.5. Управление темами ----------
  function moveTopic(topicId, delta) {
    const topics = App.topics;
    const idx = topics.findIndex(t => t.id === topicId);
    if (idx === -1) return;
    const newIdx = idx + delta;
    if (newIdx < 0 || newIdx >= topics.length) return;

    pushUndo();
    const [t] = topics.splice(idx, 1);
    topics.splice(newIdx, 0, t);

    syncWithTester();
    renderLeft();
    renderRight();
    updateStatusbar();
  }

  function editTopic(topicId) {
    const topic = App.topics.find(t => t.id === topicId);
    if (!topic) return;
    openTopicModal(topic, "edit");
  }

  function addNewTopic() {
    let maxId = 0;
    App.topics.forEach(t => {
      const n = parseInt(t.id, 10);
      if (!isNaN(n) && n > maxId) maxId = n;
    });
    const newId = String(maxId + 1);

    const newTopic = {
      id: newId,
      title: "Новая тема",
      subtitle: "",
      questions: [],
    };
    openTopicModal(newTopic, "create");
  }

  function duplicateTopic(topicId) {
    const topic = App.topics.find(t => t.id === topicId);
    if (!topic) return;

    let maxId = 0;
    App.topics.forEach(t => {
      const n = parseInt(t.id, 10);
      if (!isNaN(n) && n > maxId) maxId = n;
    });
    const newId = String(maxId + 1);

    const copy = deepClone(topic);
    copy.id = newId;
    copy.title = (topic.title || "") + " (копия)";

    const idx = App.topics.findIndex(t => t.id === topicId);
    pushUndo();
    App.topics.splice(idx + 1, 0, copy);

    ed.currentTopicId = newId;
    ed.currentQuestionIdx = null;
    ed.formBuffer = null;
    ed.formOriginalKey = null;

    syncWithTester();
    renderLeft();
    renderRight();
    updateStatusbar();
  }

  function deleteTopic(topicId) {
    const topic = App.topics.find(t => t.id === topicId);
    if (!topic) return;
    const n = (topic.questions || []).length;
    const msg = n > 0
      ? `Удалить тему «${topic.title}»? В ней ${n} вопрос(ов). Это действие нельзя отменить.`
      : `Удалить тему «${topic.title}»?`;
    if (!confirm(msg)) return;

    const idx = App.topics.findIndex(t => t.id === topicId);
    pushUndo();
    App.topics.splice(idx, 1);

    if (ed.currentTopicId === topicId) {
      if (App.topics.length > 0) {
        ed.currentTopicId = App.topics[0].id;
        ed.currentQuestionIdx = (App.topics[0].questions && App.topics[0].questions.length > 0) ? 0 : null;
      } else {
        ed.currentTopicId = null;
        ed.currentQuestionIdx = null;
      }
    }
    ed.formBuffer = null;
    ed.formOriginalKey = null;

    syncWithTester();
    renderLeft();
    renderRight();
    updateStatusbar();
  }

  // ---------- 7.6. Модальное окно редактирования темы ----------
  function openTopicModal(topic, mode) {
    buildModalIfNeeded();
    const modal = ed.modalEl;
    ed.modalTopicId = (mode === "edit") ? topic.id : null;

    const titleEl = $("#ed-modal-title", modal);
    const idInput = $("#ed-modal-id", modal);
    const titleInput = $("#ed-modal-name", modal);
    const subtitleInput = $("#ed-modal-subtitle", modal);
    const delBtn = $("#ed-modal-delete", modal);

    if (titleEl) titleEl.textContent = (mode === "edit") ? "Редактирование темы" : "Новая тема";
    if (idInput) idInput.value = topic.id || "";
    if (titleInput) titleInput.value = topic.title || "";
    if (subtitleInput) subtitleInput.value = topic.subtitle || "";
    if (delBtn) delBtn.style.display = (mode === "edit") ? "" : "none";

    modal.dataset.mode = mode;
    modal.classList.add("open");

    setTimeout(() => { if (idInput) idInput.focus(); }, 50);
  }

  function closeTopicModal() {
    if (ed.modalEl) ed.modalEl.classList.remove("open");
    ed.modalTopicId = null;
  }

  function buildModalIfNeeded() {
    if (ed.modalEl) return;
    const modal = document.createElement("div");
    modal.className = "ed-modal-backdrop";
    modal.innerHTML = `
      <div class="ed-modal">
        <h2 id="ed-modal-title">Тема</h2>
        <div class="ed-field">
          <label for="ed-modal-id">ID темы (число)</label>
          <input type="text" id="ed-modal-id" placeholder="1">
          <div class="ed-hint">Уникальный числовой идентификатор. Используется в ключах избранного и статистики.</div>
        </div>
        <div class="ed-field">
          <label for="ed-modal-name">Название</label>
          <input type="text" id="ed-modal-name" placeholder="Тема 1. …">
        </div>
        <div class="ed-field">
          <label for="ed-modal-subtitle">Подзаголовок (необязательно)</label>
          <input type="text" id="ed-modal-subtitle" placeholder="">
        </div>
        <div class="ed-modal-actions">
          <button type="button" class="ed-btn primary" id="ed-modal-save">Сохранить</button>
          <button type="button" class="ed-btn" id="ed-modal-cancel">Отмена</button>
          <button type="button" class="ed-btn danger" id="ed-modal-delete" style="margin-left:auto;">Удалить</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
    ed.modalEl = modal;

    $("#ed-modal-save", modal).addEventListener("click", saveTopicModal);
    $("#ed-modal-cancel", modal).addEventListener("click", closeTopicModal);
    $("#ed-modal-delete", modal).addEventListener("click", () => {
      if (ed.modalTopicId) {
        const id = ed.modalTopicId;
        closeTopicModal();
        deleteTopic(id);
      }
    });
    modal.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && e.target.tagName !== "TEXTAREA") {
        e.preventDefault();
        saveTopicModal();
      } else if (e.key === "Escape") {
        e.preventDefault();
        closeTopicModal();
      }
    });
    modal.addEventListener("click", (e) => {
      if (e.target === modal) closeTopicModal();
    });
  }

  function saveTopicModal() {
    if (!ed.modalEl) return;
    const mode = ed.modalEl.dataset.mode || "edit";
    const idInput = $("#ed-modal-id", ed.modalEl);
    const titleInput = $("#ed-modal-name", ed.modalEl);
    const subtitleInput = $("#ed-modal-subtitle", ed.modalEl);

    const newId = String(idInput.value || "").trim();
    const newTitle = String(titleInput.value || "").trim();
    const newSubtitle = String(subtitleInput.value || "").trim();

    if (!newId) { alert("ID темы не может быть пустым."); idInput.focus(); return; }
    if (!/^\d+$/.test(newId)) { alert("ID темы должен быть числом."); idInput.focus(); return; }
    if (!newTitle) { alert("Название темы не может быть пустым."); titleInput.focus(); return; }

    const clash = App.topics.some(t => t.id === newId && t.id !== ed.modalTopicId);
    if (clash) { alert(`Тема с id «${newId}» уже существует.`); idInput.focus(); return; }

    if (mode === "create") {
      const newTopic = {
        id: newId,
        title: newTitle,
        questions: [],
      };
      if (newSubtitle) newTopic.subtitle = newSubtitle;
      pushUndo();
      App.topics.push(newTopic);

      ed.currentTopicId = newId;
      ed.currentQuestionIdx = null;
      ed.formBuffer = null;
      ed.formOriginalKey = null;
    } else {
      const topic = App.topics.find(t => t.id === ed.modalTopicId);
      if (!topic) { closeTopicModal(); return; }
      pushUndo();
      const idChanged = (topic.id !== newId);
      topic.title = newTitle;
      if (newSubtitle) topic.subtitle = newSubtitle;
      else delete topic.subtitle;
      topic.id = newId;

      if (idChanged) {
        recalcTopicAutoIds(topic);
      }
      if (idChanged && ed.currentTopicId === ed.modalTopicId) {
        ed.currentTopicId = newId;
      }
      ed.modalTopicId = null;
    }

    closeTopicModal();
    syncWithTester();
    renderLeft();
    renderRight();
    updateStatusbar();
  }

  function renderQuestionForm(root, topic) {
    const q = ed.formBuffer;
    const total = (topic.questions || []).length;
    const posNum = ed.currentQuestionIdx + 1;

    let html = `<div class="ed-form">`;

    html += `<div class="ed-form-head">`;
    html += `<h2>Вопрос <span style="color:var(--accent);">${esc(q.id != null ? q.id : "—")}</span></h2>`;
    html += `<div class="ed-form-pos">${posNum} из ${total} · тема «${esc(topic.title)}»</div>`;
    html += `</div>`;

    // — ID —
    const isAuto = (q.idLocked !== true);
    html += `<div class="ed-field">`;
    html += `<label for="ed-f-id">ID вопроса</label>`;
    html += `<div class="ed-id-row">`;
    html += `<input type="text" id="ed-f-id" value="${esc(q.id != null ? q.id : "")}" placeholder="Например, 1.1" ${isAuto ? "readonly" : ""}>`;
    html += `<button type="button" class="ed-btn small" id="ed-f-id-toggle">${isAuto ? "🔓 Авто" : "🔒 Зафиксирован"}</button>`;
    html += `</div>`;
    if (isAuto) {
      html += `<div class="ed-hint">Режим «Авто»: id = <b>${esc(topic.id)}</b>.<span style="color:var(--accent);">${ed.currentQuestionIdx + 1}</span>, обновляется автоматически при перемещении.</div>`;
    } else {
      html += `<div class="ed-hint">id зафиксирован и не меняется при перемещении. Нажмите «🔒 Зафиксирован», чтобы переключить в авто-режим.</div>`;
    }
    html += `</div>`;

    // — Текст вопроса —
    html += `<div class="ed-field">`;
    html += `<label for="ed-f-q">Текст вопроса</label>`;
    html += `<textarea id="ed-f-q" rows="3">${esc(q.q || "")}</textarea>`;
    html += `</div>`;

    // — Картинка —
    html += `<div class="ed-field">`;
    html += `<label for="ed-f-img">Картинка (путь)</label>`;
    html += `<div style="display:flex;gap:8px;">`;
    html += `<input type="text" id="ed-f-img" value="${esc(q.image || "")}" placeholder="img/1.1.png" style="flex:1;">`;
    html += `<button type="button" class="ed-btn" id="ed-f-img-clear" title="Очистить">✕</button>`;
    html += `</div>`;
    html += `<div class="ed-hint">Относительный путь к файлу или URL. Оставьте пустым, если картинки нет.</div>`;
    html += `</div>`;

    // — Варианты ответов —
    html += `<div class="ed-field">`;
    html += `<label>Варианты ответов</label>`;
    html += `<div class="ed-options" id="ed-f-options">`;
    (q.options || []).forEach((opt, i) => {
      html += renderOptionRow(opt, i, q.correct === i + 1);
    });
    html += `</div>`;
    html += `<div style="margin-top:8px;">`;
    html += `<button type="button" class="ed-btn" id="ed-f-add-opt">+ Добавить вариант</button>`;
    html += `</div>`;
    html += `<div class="ed-hint">Радио-кнопка слева отмечает правильный ответ.</div>`;
    html += `</div>`;

    // — Перемешивание —
    html += `<div class="ed-field">`;
    html += `<label style="display:flex;align-items:center;gap:8px;font-weight:400;cursor:pointer;">`;
    html += `<input type="checkbox" id="ed-f-shuffle" ${q.shuffle === false ? "" : "checked"}>`;
    html += `Разрешить перемешивание вариантов`;
    html += `</label>`;
    html += `<div class="ed-hint">Если снять — порядок вариантов всегда будет таким, как здесь.</div>`;
    html += `</div>`;

    // — Кнопки действий —
    html += `<div class="ed-form-actions">`;
    html += `<button type="button" class="ed-btn primary" id="ed-f-save">💾 Сохранить</button>`;
    html += `<button type="button" class="ed-btn" id="ed-f-cancel">Отмена</button>`;
    html += `<button type="button" class="ed-btn" id="ed-f-dup">Дублировать</button>`;
    html += `<button type="button" class="ed-btn danger" id="ed-f-del">Удалить</button>`;
    html += `</div>`;

    // — Перемещение —
    const allTopics = App.topics;
    const canMoveUp   = posNum > 1;
    const canMoveDown = posNum < total;
    const otherTopics = allTopics.filter(t => t.id !== topic.id);
    const canMoveToOther = otherTopics.length > 0;

    html += `<div class="ed-move-block">`;
    html += `<div class="ed-move-row">`;
    html += `<span class="ed-move-label">Перемещение:</span>`;
    html += `<button type="button" class="ed-btn small" id="ed-f-move-up"   ${canMoveUp ? "" : "disabled"} title="Вверх внутри темы">↑ Вверх</button>`;
    html += `<button type="button" class="ed-btn small" id="ed-f-move-down" ${canMoveDown ? "" : "disabled"} title="Вниз внутри темы">↓ Вниз</button>`;
    html += `</div>`;

    if (canMoveToOther) {
      html += `<div class="ed-move-row">`;
      html += `<span class="ed-move-label">В другую тему:</span>`;
      html += `<select id="ed-f-move-target" class="ed-move-select">`;
      otherTopics.forEach(t => {
        html += `<option value="${esc(t.id)}">${esc(t.title || "Тема " + t.id)} (${(t.questions || []).length})</option>`;
      });
      html += `</select>`;
      html += `<button type="button" class="ed-btn small primary" id="ed-f-move-go">Перенести →</button>`;
      html += `</div>`;
    }
    html += `</div>`;

    // — Навигация —
    html += `<div class="ed-form-nav">`;
    html += `<button type="button" class="ed-btn" id="ed-f-prev" ${posNum <= 1 ? "disabled" : ""}>← Предыдущий</button>`;
    html += `<button type="button" class="ed-btn" id="ed-f-new">+ Новый вопрос</button>`;
    html += `<button type="button" class="ed-btn" id="ed-f-next" ${posNum >= total ? "disabled" : ""}>Следующий →</button>`;
    html += `</div>`;
    root.innerHTML = html;

    bindFormHandlers(root);
  }

  function renderOptionRow(text, idx, isCorrect) {
    return `<div class="ed-opt-row" data-idx="${idx}">`
      + `<input type="radio" name="ed-f-correct" value="${idx + 1}" ${isCorrect ? "checked" : ""} title="Правильный ответ">`
      + `<span class="ed-opt-num">${idx + 1}.</span>`
      + `<input type="text" class="ed-opt-text" value="${esc(text)}" placeholder="Текст варианта ${idx + 1}">`
      + `<button type="button" class="ed-btn small ed-opt-del" title="Удалить вариант">×</button>`
      + `</div>`;
  }

  function bindFormHandlers(root) {
    // — ID —
    const idInput = $("#ed-f-id", root);
    if (idInput) idInput.addEventListener("input", (e) => { ed.formBuffer.id = e.target.value; });

    // — Текст вопроса —
    const qInput = $("#ed-f-q", root);
    if (qInput) qInput.addEventListener("input", (e) => { ed.formBuffer.q = e.target.value; });

    // — Картинка —
    const imgInput = $("#ed-f-img", root);
    if (imgInput) imgInput.addEventListener("input", (e) => {
      ed.formBuffer.image = e.target.value.trim();
      if (!ed.formBuffer.image) delete ed.formBuffer.image;
    });
    const imgClear = $("#ed-f-img-clear", root);
    if (imgClear) imgClear.addEventListener("click", () => {
      const inp = $("#ed-f-img", root);
      if (inp) inp.value = "";
      delete ed.formBuffer.image;
    });

    // — Варианты: текст и радио —
    $$(".ed-opt-row", root).forEach(row => {
      const idx = parseInt(row.dataset.idx, 10);
      const textInput = $(".ed-opt-text", row);
      if (textInput) textInput.addEventListener("input", (e) => {
        ed.formBuffer.options[idx] = e.target.value;
      });
    });
    $$('input[name="ed-f-correct"]', root).forEach(radio => {
      radio.addEventListener("change", (e) => {
        ed.formBuffer.correct = parseInt(e.target.value, 10);
      });
    });

    // — Удаление варианта —
    $$(".ed-opt-del", root).forEach(btn => {
      btn.addEventListener("click", () => {
        const row = btn.closest(".ed-opt-row");
        const idx = parseInt(row.dataset.idx, 10);
        const opts = ed.formBuffer.options || [];
        if (opts.length <= 2) {
          alert("Должно остаться минимум 2 варианта ответа.");
          return;
        }
        opts.splice(idx, 1);
        if (ed.formBuffer.correct === idx + 1) {
          ed.formBuffer.correct = 1;
        } else if (ed.formBuffer.correct > idx + 1) {
          ed.formBuffer.correct -= 1;
        }
        renderQuestionForm(root, App.topics.find(t => t.id === ed.currentTopicId));
      });
    });

    // — Добавление варианта —
    const addOptBtn = $("#ed-f-add-opt", root);
    if (addOptBtn) addOptBtn.addEventListener("click", () => {
      const opts = ed.formBuffer.options || [];
      opts.push("");
      if (!ed.formBuffer.correct) ed.formBuffer.correct = 1;
      renderQuestionForm(root, App.topics.find(t => t.id === ed.currentTopicId));
      const rows = $$(".ed-opt-row", root);
      const last = rows[rows.length - 1];
      if (last) {
        const inp = $(".ed-opt-text", last);
        if (inp) inp.focus();
      }
    });

    // — Перемешивание —
    const shuffleCb = $("#ed-f-shuffle", root);
    if (shuffleCb) shuffleCb.addEventListener("change", (e) => {
      if (e.target.checked) delete ed.formBuffer.shuffle;
      else ed.formBuffer.shuffle = false;
    });

    // — Кнопки —
    const saveBtn = $("#ed-f-save", root);
    if (saveBtn) saveBtn.addEventListener("click", () => saveCurrentQuestion());
    const cancelBtn = $("#ed-f-cancel", root);
    if (cancelBtn) cancelBtn.addEventListener("click", () => {
      ed.formBuffer = null;
      ed.formOriginalKey = null;
      renderRight();
    });
    const dupBtn = $("#ed-f-dup", root);
    if (dupBtn) dupBtn.addEventListener("click", () => duplicateCurrentQuestion());
    const delBtn = $("#ed-f-del", root);
    if (delBtn) delBtn.addEventListener("click", () => deleteCurrentQuestion());

    // — Навигация —
    const prevBtn = $("#ed-f-prev", root);
    if (prevBtn) prevBtn.addEventListener("click", (e) => {
      if (prevBtn.disabled) return;
      e.preventDefault();
      if (ed.currentQuestionIdx > 0) {
        ed.currentQuestionIdx--;
        ed.formBuffer = null;
        ed.formOriginalKey = null;
        renderLeft();
        renderRight();
      }
    });
    const nextBtn = $("#ed-f-next", root);
    if (nextBtn) nextBtn.addEventListener("click", (e) => {
      if (nextBtn.disabled) return;
      e.preventDefault();
      const topic = App.topics.find(t => t.id === ed.currentTopicId);
      if (topic && ed.currentQuestionIdx < (topic.questions || []).length - 1) {
        ed.currentQuestionIdx++;
        ed.formBuffer = null;
        ed.formOriginalKey = null;
        renderLeft();
        renderRight();
      }
    });
    const newBtn = $("#ed-f-new", root);
    if (newBtn) newBtn.addEventListener("click", addNewQuestion);

    // — Перемещение вверх/вниз —
    const moveUpBtn = $("#ed-f-move-up", root);
    if (moveUpBtn) moveUpBtn.addEventListener("click", (e) => {
      if (moveUpBtn.disabled) return;
      e.preventDefault();
      if (ed.currentTopicId && ed.currentQuestionIdx !== null) {
        moveQuestion(ed.currentTopicId, ed.currentQuestionIdx, -1);
      }
    });
    const moveDownBtn = $("#ed-f-move-down", root);
    if (moveDownBtn) moveDownBtn.addEventListener("click", (e) => {
      if (moveDownBtn.disabled) return;
      e.preventDefault();
      if (ed.currentTopicId && ed.currentQuestionIdx !== null) {
        moveQuestion(ed.currentTopicId, ed.currentQuestionIdx, +1);
      }
    });

    // — Перенос в другую тему —
    const moveGoBtn = $("#ed-f-move-go", root);
    if (moveGoBtn) moveGoBtn.addEventListener("click", () => {
      const sel = $("#ed-f-move-target", root);
      if (!sel) return;
      const toId = sel.value;
      if (ed.currentTopicId && ed.currentQuestionIdx !== null && toId) {
        const topic = App.topics.find(t => t.id === ed.currentTopicId);
        const q = topic && topic.questions ? topic.questions[ed.currentQuestionIdx] : null;
        const qLabel = q ? (q.id != null ? q.id : "без id") : "?";
        if (!confirm(`Перенести вопрос «${qLabel}» в тему «${sel.options[sel.selectedIndex].text}»?`)) return;
        moveQuestionToTopic(ed.currentTopicId, ed.currentQuestionIdx, toId);
      }
    });

    // — переключатель авто/фикс id —
    const idToggle = $("#ed-f-id-toggle", root);
    if (idToggle) idToggle.addEventListener("click", () => {
      const isAuto = (ed.formBuffer.idLocked !== true);
      if (isAuto) {
        ed.formBuffer.idLocked = true;
      } else {
        ed.formBuffer.idLocked = false;
        const topic = App.topics.find(t => t.id === ed.currentTopicId);
        if (topic) {
          ed.formBuffer.id = computeAutoId(topic, ed.currentQuestionIdx);
        }
      }
      renderQuestionForm(root, App.topics.find(t => t.id === ed.currentTopicId));
    });
  }

  function validateQuestion(q) {
    const errs = [];
    if (!q.q || !q.q.trim()) errs.push("Текст вопроса не может быть пустым.");
    const opts = q.options || [];
    if (opts.length < 2) errs.push("Нужно минимум 2 варианта ответа.");
    opts.forEach((o, i) => {
      if (!o || !o.trim()) errs.push("Вариант " + (i + 1) + " пустой.");
    });
    if (q.correct == null || q.correct < 1 || q.correct > opts.length) {
      errs.push("Не выбран правильный ответ.");
    }
    return errs;
  }

  function saveCurrentQuestion() {
    const topic = App.topics.find(t => t.id === ed.currentTopicId);
    if (!topic) return;

    const q = ed.formBuffer;
    const errs = validateQuestion(q);
    if (errs.length > 0) {
      alert("Не сохранить:\n\n• " + errs.join("\n• "));
      return;
    }

    const isAuto = q.idLocked !== true;
    const clean = {
      id: isAuto
        ? computeAutoId(topic, ed.currentQuestionIdx)
        : ((q.id || "").trim() || computeAutoId(topic, ed.currentQuestionIdx)),
      q: q.q.trim(),
      options: q.options.map(o => String(o).trim()),
      correct: q.correct,
    };
    if (q.image) clean.image = q.image;
    if (q.shuffle === false) clean.shuffle = false;
    if (isAuto) {
      // авто-id не фиксируем
    } else {
      clean.idLocked = true;
    }

    pushUndo();
    topic.questions[ed.currentQuestionIdx] = clean;

    ed.formBuffer = deepClone(clean);
    ed.formOriginalKey = ed.currentTopicId + ":" + ed.currentQuestionIdx;

    syncWithTester();
    markClean();
    renderLeft();
    renderRight();
    updateStatusbar();
    alert("Вопрос сохранён.");
  }

  function deleteCurrentQuestion() {
    const topic = App.topics.find(t => t.id === ed.currentTopicId);
    if (!topic) return;
    const total = (topic.questions || []).length;
    if (total === 0) return;
    if (!confirm("Удалить вопрос «" + (topic.questions[ed.currentQuestionIdx].id || "?") + "»?")) return;

    pushUndo();
    topic.questions.splice(ed.currentQuestionIdx, 1);
    recalcTopicAutoIds(topic);

    if (topic.questions.length === 0) {
      ed.currentQuestionIdx = null;
    } else if (ed.currentQuestionIdx >= topic.questions.length) {
      ed.currentQuestionIdx = topic.questions.length - 1;
    }

    ed.formBuffer = null;
    ed.formOriginalKey = null;

    syncWithTester();
    renderLeft();
    renderRight();
    updateStatusbar();
  }

  function duplicateCurrentQuestion() {
    const topic = App.topics.find(t => t.id === ed.currentTopicId);
    if (!topic) return;
    const q = topic.questions[ed.currentQuestionIdx];
    if (!q) return;

    const copy = deepClone(q);
    pushUndo();
    topic.questions.splice(ed.currentQuestionIdx + 1, 0, copy);
    recalcTopicAutoIds(topic);

    ed.currentQuestionIdx++;
    ed.formBuffer = null;
    ed.formOriginalKey = null;

    syncWithTester();
    renderLeft();
    renderRight();
    updateStatusbar();
  }

  function addNewQuestion() {
    const topic = App.topics.find(t => t.id === ed.currentTopicId);
    if (!topic) return;

    if (!topic.questions) topic.questions = [];
    const newQ = {
      id: "",
      q: "",
      options: ["", "", "", ""],
      correct: 1,
      idLocked: false,
    };
    pushUndo();
    topic.questions.push(newQ);
    recalcTopicAutoIds(topic);

    ed.currentQuestionIdx = topic.questions.length - 1;
    ed.formBuffer = null;
    ed.formOriginalKey = null;

    syncWithTester();
    renderLeft();
    renderRight();
    updateStatusbar();

    setTimeout(() => {
      const inp = $("#ed-f-q");
      if (inp) inp.focus();
    }, 50);
  }

  // Снять «снимок чистоты»: после этого редактор считает, что всё сохранено.
  function markClean() {
    ed.baselineSnapshot = JSON.stringify(App.topics || []);
    ed.dirty = false;
  }

  function updateDocTitleIndicator() {
    const base = "Тест: подготовка к сертификации 1С";
    if (!ed._prevDocTitle) ed._prevDocTitle = document.title || base;
    if (ed.open && ed.dirty) {
      if (!document.title.startsWith("● ")) {
        document.title = "● " + ed._prevDocTitle;
      }
    } else {
      document.title = ed._prevDocTitle;
    }
  }


  // ---------- 7.7. Управление вопросами ----------
  function moveQuestion(topicId, idx, delta) {
    const topic = App.topics.find(t => t.id === topicId);
    if (!topic) return;
    const qs = topic.questions || [];
    const newIdx = idx + delta;
    if (newIdx < 0 || newIdx >= qs.length) return;

    pushUndo();
    const [q] = qs.splice(idx, 1);
    qs.splice(newIdx, 0, q);
    recalcTopicAutoIds(topic);

    if (ed.currentTopicId === topicId && ed.currentQuestionIdx === idx) {
      ed.currentQuestionIdx = newIdx;
    } else if (ed.currentTopicId === topicId) {
      if (ed.currentQuestionIdx === newIdx) ed.currentQuestionIdx = idx;
    }
    ed.formBuffer = null;
    ed.formOriginalKey = null;

    syncWithTester();
    renderLeft();
    renderRight();
    updateStatusbar();
  }

  function moveQuestionToTopic(fromTopicId, fromIdx, toTopicId) {
    if (fromTopicId === toTopicId) return;

    const fromTopic = App.topics.find(t => t.id === fromTopicId);
    const toTopic   = App.topics.find(t => t.id === toTopicId);
    if (!fromTopic || !toTopic) return;

    const fromQs = fromTopic.questions || [];
    if (fromIdx < 0 || fromIdx >= fromQs.length) return;

    pushUndo();
    const [q] = fromQs.splice(fromIdx, 1);
    if (!toTopic.questions) toTopic.questions = [];
    toTopic.questions.push(q);

    recalcTopicAutoIds(fromTopic);
    recalcTopicAutoIds(toTopic);

    ed.currentTopicId = toTopicId;
    ed.currentQuestionIdx = toTopic.questions.length - 1;
    ed.formBuffer = null;
    ed.formOriginalKey = null;
    ed.collapsed.delete(toTopicId);

    syncWithTester();
    renderLeft();
    renderRight();
    updateStatusbar();
  }

  // ---------- 7.8. Динамические id ----------
  function computeAutoId(topic, qIdx) {
    return topic.id + "." + (qIdx + 1);
  }

  function recalcTopicAutoIds(topic) {
    (topic.questions || []).forEach((q, i) => {
      if (q.idLocked !== true) {
        q.id = computeAutoId(topic, i);
      }
    });
  }

  function recalcAllAutoIds() {
    let changed = 0;
    App.topics.forEach(topic => {
      (topic.questions || []).forEach((q, i) => {
        if (q.idLocked !== true) {
          const newId = computeAutoId(topic, i);
          if (q.id !== newId) {
            q.id = newId;
            changed++;
          }
        }
      });
    });
    return changed;
  }

  function forceRecalcAllIds() {
    const autoCount = App.topics.reduce((acc, t) =>
      acc + (t.questions || []).filter(q => q.idLocked !== true).length, 0);

    if (autoCount === 0) {
      alert("Нет ни одного вопроса в режиме «Авто» — все id зафиксированы.");
      return;
    }

    const msg = "Будут пересчитаны id у " + autoCount + " вопрос(ов) в режиме «Авто».\n\n"
      + "Важно: избранное и статистика тестера привязаны к старому id. "
      + "После пересчёта они могут «отвязаться» от этих вопросов.\n\nПродолжить?";
    if (!confirm(msg)) return;

    pushUndo();
    const changed = recalcAllAutoIds();

    syncWithTester();
    renderLeft();
    renderRight();
    updateStatusbar();

    alert("Пересчитано id: " + changed + ".");
  }

  // ---------- 7.9. Undo / Redo ----------
  function snapshotTopics() {
    return {
      topics: deepClone(App.topics || []),
      currentTopicId: ed.currentTopicId,
      currentQuestionIdx: ed.currentQuestionIdx,
    };
  }

  function pushUndo() {
    ed.undoStack.push(snapshotTopics());
    if (ed.undoStack.length > UNDO_LIMIT) ed.undoStack.shift();
    ed.redoStack.length = 0;
    updateUndoRedoButtons();
  }

  function applySnapshot(snap) {
    App.topics.length = 0;
    snap.topics.forEach(t => App.topics.push(t));

    const topics = App.topics || [];
    if (snap.currentTopicId !== null &&
        topics.some(t => t.id === snap.currentTopicId)) {
      ed.currentTopicId = snap.currentTopicId;
      const t = topics.find(t => t.id === snap.currentTopicId);
      const qLen = (t.questions || []).length;
      if (snap.currentQuestionIdx !== null && snap.currentQuestionIdx < qLen) {
        ed.currentQuestionIdx = snap.currentQuestionIdx;
      } else {
        ed.currentQuestionIdx = qLen > 0 ? 0 : null;
      }
    } else if (topics.length > 0) {
      ed.currentTopicId = topics[0].id;
      ed.currentQuestionIdx = (topics[0].questions && topics[0].questions.length > 0) ? 0 : null;
    } else {
      ed.currentTopicId = null;
      ed.currentQuestionIdx = null;
    }

    ed.formBuffer = null;
    ed.formOriginalKey = null;

    syncWithTester();
    renderLeft();
    renderRight();
    updateStatusbar();
  }

  function doUndo() {
    if (ed.undoStack.length === 0) return;
    const current = snapshotTopics();
    const prev = ed.undoStack.pop();
    ed.redoStack.push(current);
    if (ed.redoStack.length > UNDO_LIMIT) ed.redoStack.shift();
    updateUndoRedoButtons();
    applySnapshot(prev);
  }

  function doRedo() {
    if (ed.redoStack.length === 0) return;
    const current = snapshotTopics();
    const next = ed.redoStack.pop();
    ed.undoStack.push(current);
    if (ed.undoStack.length > UNDO_LIMIT) ed.undoStack.shift();
    updateUndoRedoButtons();
    applySnapshot(next);
  }

  // ---------- 8. Экспорт ----------
  function getExportFileNameBase() {
    const raw = App.fileKey || "questions";
    return raw.replace(/\.(js|json|txt)$/i, "");
  }

  function dateTimeFileStr() {
    const d = new Date();
    const p = (n) => String(n).padStart(2, "0");
    return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate())
      + "_" + p(d.getHours()) + "-" + p(d.getMinutes()) + "-" + p(d.getSeconds());
  }

  function getExportDateTimeStr() {
    const d = new Date();
    const p = (n) => String(n).padStart(2, "0");
    return p(d.getDate()) + "." + p(d.getMonth() + 1) + "." + d.getFullYear()
      + ", " + p(d.getHours()) + ":" + p(d.getMinutes()) + ":" + p(d.getSeconds());
  }

  function downloadBlob(fileName, content, mime) {
    const blob = new Blob([content], { type: mime + ";charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function exportAs(kind) {
    if (!App.topics || App.topics.length === 0) {
      alert("Нечего экспортировать: набор пуст.");
      return;
    }

    if (ed.formBuffer && ed.formOriginalKey) {
      const proceed = confirm(
        "В форме открыт вопрос с несохранёнными правками.\n\n" +
        "Они не попадут в экспорт.\n\n" +
        "Продолжить экспорт текущих данных?"
      );
      if (!proceed) return;
    }

    const baseName = getExportFileNameBase();
    const tsStr = getExportDateTimeStr();

    try {
      if (kind === "js") {
        const json = JSON.stringify(App.topics, null, 2);
        const header =
          "// Автоматически сгенерировано редактором вопросов.\n" +
          "// Дата: " + tsStr + "\n" +
          "// Источник: " + (App.fileKey || "—") + "\n" +
          "// Вопросов: " + App.topics.reduce((acc, t) => acc + (t.questions || []).length, 0) +
          ", тем: " + App.topics.length + "\n\n";
        const body = header + "const TOPICS = " + json + ";\n";
        const content = "\uFEFF" + body;

        const fileName = baseName + "_edited_" + dateTimeFileStr() + ".js";
        downloadBlob(fileName, content, "application/javascript");
        onExportSuccess(fileName);
      } else if (kind === "json") {
        const json = JSON.stringify(App.topics, null, 2);
        const fileName = baseName + "_edited_" + dateTimeFileStr() + ".json";
        downloadBlob(fileName, json, "application/json");
        onExportSuccess(fileName);
      } else {
        throw new Error("Неизвестный формат: " + kind);
      }
    } catch (e) {
      console.error("[editor] Ошибка экспорта:", e);
      alert("Ошибка экспорта: " + e.message);
    }
  }

  function onExportSuccess(fileName) {
    clearDraftFromStorage();
    ed.baselineSnapshot = JSON.stringify(App.topics || []);
    ed.dirty = false;
    updateStatusbar();
    updateUndoRedoButtons();
    alert("Файл скачан: " + fileName);
  }

  function clearAllDrafts() {
    const keys = [];
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.startsWith(LS_DRAFT_PREFIX)) keys.push(k);
      }
    } catch (e) {}
    if (keys.length === 0) {
      alert("Черновиков не найдено.");
      return;
    }
    if (!confirm("Удалить все черновики редактора (" + keys.length + ")?\n\nТекущие данные тестера не затрагиваются.")) return;
    keys.forEach(k => { try { localStorage.removeItem(k); } catch (e) {} });
    ed.lastAutosaveTs = 0;
    updateAutosaveLabel();
    alert("Удалено черновиков: " + keys.length + ".");
  }

  // ---------- 9. Автосохранение черновика ----------
  const AUTOSAVE_DEBOUNCE_MS = 500;
  let autosaveTimer = null;

  function writeDraftToStorage() {
    if (!App.fileKey) return;
    try {
      const payload = {
        ts: Date.now(),
        fileKey: App.fileKey,
        topics: App.topics,
        currentTopicId: ed.currentTopicId,
        currentQuestionIdx: ed.currentQuestionIdx,
      };
      localStorage.setItem(draftKey(), JSON.stringify(payload));
      ed.lastAutosaveTs = payload.ts;
      updateAutosaveLabel();
    } catch (e) {
      console.warn("[editor] Не удалось записать черновик:", e);
    }
  }

  function readDraftFromStorage() {
    if (!App.fileKey) return null;
    try {
      const raw = localStorage.getItem(draftKey());
      if (!raw) return null;
      const data = JSON.parse(raw);
      if (!data || !Array.isArray(data.topics)) return null;
      return data;
    } catch (e) {
      console.warn("[editor] Не удалось прочитать черновик:", e);
      return null;
    }
  }

  function clearDraftFromStorage() {
    if (!App.fileKey) return;
    try {
      localStorage.removeItem(draftKey());
      ed.lastAutosaveTs = 0;
      updateAutosaveLabel();
    } catch (e) {}
  }

  function scheduleAutosave() {
    if (autosaveTimer) clearTimeout(autosaveTimer);
    autosaveTimer = setTimeout(() => {
      autosaveTimer = null;
      writeDraftToStorage();
    }, AUTOSAVE_DEBOUNCE_MS);
  }

  function updateAutosaveLabel() {
    const el = ed.overlayEl && $("#ed-autosave-text", ed.overlayEl);
    if (!el) return;
    if (!ed.lastAutosaveTs) {
      el.textContent = "Автосохранение: —";
      el.style.color = "";
      return;
    }
    const d = new Date(ed.lastAutosaveTs);
    const p = (n) => String(n).padStart(2, "0");
    el.textContent = "Автосохранение: " + p(d.getHours()) + ":" + p(d.getMinutes()) + ":" + p(d.getSeconds());
    el.style.color = "var(--ok, #2f855a)";
  }

  // ---------- 10. Открытие / закрытие ----------
  function openEditor() {
    if (!App.topics || App.topics.length === 0) {
      alert("Сначала загрузите файл вопросов в тестере.");
      return;
    }
    injectStyles();
    const overlay = buildOverlay();
    ed.open = true;
    overlay.classList.add("open");
    document.body.style.overflow = "hidden";

    const label = $("#ed-file-label", overlay);
    if (label) label.textContent = App.fileKey || "—";

    (App.topics || []).forEach(t => {
      (t.questions || []).forEach(q => {
        if (q.idLocked === undefined) q.idLocked = true;
      });
    });

    ed.baselineSnapshot = JSON.stringify(App.topics || []);
    ed.undoStack.length = 0;
    ed.redoStack.length = 0;

    // — проверяем черновик в localStorage —
    const draft = readDraftFromStorage();
    if (draft && Array.isArray(draft.topics) && draft.topics.length > 0) {
      const d = new Date(draft.ts);
      const p = (n) => String(n).padStart(2, "0");
      const tsStr = p(d.getHours()) + ":" + p(d.getMinutes()) + ":" + p(d.getSeconds())
                  + " " + p(d.getDate()) + "." + p(d.getMonth() + 1) + "." + d.getFullYear();
      const restore = confirm(
        "Найден черновик редактора от " + tsStr + ".\n\n" +
        "Восстановить его?\n\n" +
        "• OK — работать с черновиком (данные тестера будут заменены).\n" +
        "• Отмена — удалить черновик и работать с загруженным файлом."
      );
      if (restore) {
        const beforeRestore = {
          topics: deepClone(App.topics || []),
          currentTopicId: ed.currentTopicId,
          currentQuestionIdx: ed.currentQuestionIdx,
        };

        ed.undoStack.length = 0;
        ed.redoStack.length = 0;
        ed.undoStack.push(beforeRestore);

        App.state.topics.length = 0;
        draft.topics.forEach(t => App.state.topics.push(t));

        if (draft.currentTopicId && App.topics.some(t => t.id === draft.currentTopicId)) {
          ed.currentTopicId = draft.currentTopicId;
          const t = App.topics.find(x => x.id === draft.currentTopicId);
          const qLen = (t.questions || []).length;
          if (typeof draft.currentQuestionIdx === "number" &&
              draft.currentQuestionIdx >= 0 && draft.currentQuestionIdx < qLen) {
            ed.currentQuestionIdx = draft.currentQuestionIdx;
          } else {
            ed.currentQuestionIdx = qLen > 0 ? 0 : null;
          }
        }

        ed.baselineSnapshot = JSON.stringify(App.topics || []);

        App.start();
        App.notifyTopicsChanged();

        ed.lastAutosaveTs = draft.ts;
        updateAutosaveLabel();
      } else {
        clearDraftFromStorage();
      }
    }

    const topics = App.topics || [];
    if (topics.length > 0 && ed.currentTopicId === null) {
      ed.currentTopicId = topics[0].id;
      ed.currentQuestionIdx = (topics[0].questions && topics[0].questions.length > 0) ? 0 : null;
    }

    renderLeft();
    renderRight();
    updateStatusbar();
  }

  function tryCloseEditor() {
    if (ed.dirty) {
      if (!confirm("В редакторе есть несохранённые изменения. Закрыть без сохранения?")) return;
    }
    closeEditor();
  }

  function closeEditor() {
    if (autosaveTimer) {
      clearTimeout(autosaveTimer);
      autosaveTimer = null;
      writeDraftToStorage();
    }

    ed.open = false;
    if (ed.overlayEl) ed.overlayEl.classList.remove("open");
    document.body.style.overflow = "";
    App.notifyTopicsChanged();
	updateDocTitleIndicator();
  }

  // ---------- 11. Статусная строка ----------
  function updateStatusbar() {
    const overlay = ed.overlayEl;
    if (!overlay) return;
    const dot = $("#ed-dot", overlay);
    const statusText = $("#ed-status-text", overlay);
    const counts = $("#ed-counts", overlay);

    const topics = App.topics || [];
    let qTotal = 0;
    topics.forEach(t => { qTotal += (t.questions || []).length; });

    const currentSnap = JSON.stringify(topics);
    const changed = currentSnap !== ed.baselineSnapshot;
    ed.dirty = changed;

    if (dot) dot.classList.toggle("dirty", changed);
    if (statusText) statusText.textContent = changed ? "Есть несохранённые изменения" : "Сохранено";

    let posInfo = "";
    if (ed.currentTopicId !== null) {
      const t = topics.find(x => x.id === ed.currentTopicId);
      if (t) {
        posInfo = ` · Выбрано: тема «${t.title}»`;
        if (ed.currentQuestionIdx !== null) {
          posInfo += `, вопрос ${ed.currentQuestionIdx + 1}`;
        }
      }
    }
    if (counts) counts.textContent = `Тем: ${topics.length} · Вопросов: ${qTotal}${posInfo}`;

    // undo/redo
    updateUndoRedoButtons();

    // автозахват времени последнего сохранения
    updateAutosaveLabel();
	
    // индикатор «грязно» в заголовке вкладки
    updateDocTitleIndicator();
	
  }

  // ---------- 12. Кнопка в тулбаре тестера ----------
  function injectToolbarButton() {
    if ($("#editorOpenBtn")) return;
    const toolbar = document.querySelector(".toolbar .nav-right");
    if (!toolbar) return;
    const btn = document.createElement("button");
    btn.id = "editorOpenBtn";
    btn.className = "ghost";
    btn.textContent = "✏️ Редактор";
    btn.title = "Открыть редактор вопросов";
    btn.addEventListener("click", openEditor);
    toolbar.insertBefore(btn, toolbar.firstChild);
  }

  function updateUndoRedoButtons() {
    const overlay = ed.overlayEl;
    if (!overlay) return;
    const undoBtn = $("#ed-undo", overlay);
    const redoBtn = $("#ed-redo", overlay);
    if (undoBtn) undoBtn.disabled = (ed.undoStack.length === 0);
    if (redoBtn) redoBtn.disabled = (ed.redoStack.length === 0);
  }

  function syncWithTester() {
    App.start();
    App.notifyTopicsChanged();
    scheduleAutosave();
  }

  // ---------- 13. Горячие клавиши ----------
  document.addEventListener("keydown", (e) => {
    if (!ed.open) return;
    if (ed.modalEl && ed.modalEl.classList.contains("open")) return;

    const tag = (e.target && e.target.tagName) || "";
    const inEditable = tag === "INPUT" || tag === "TEXTAREA" || e.target.isContentEditable;

    if (e.key === "Escape") {
      e.preventDefault();
      const isSearchFocused = (e.target && e.target.id === "ed-search");
      if (isSearchFocused) {
        ed.searchQuery = "";
        renderLeft();
        return;
      }
      if (ed.searchQuery) {
        ed.searchQuery = "";
        renderLeft();
        return;
      }
      tryCloseEditor();
      return;
    }

    const ctrl = e.ctrlKey || e.metaKey;
    // e.code — латинский, независимо от раскладки
    const code = e.code || "";
    // e.key — для совместимости (латиница + цифры + символы)
    const key  = (e.key || "").toLowerCase();

    // Ctrl+S — экспорт .js
    if (ctrl && (code === "KeyS" || key === "s") && !e.shiftKey) {
      e.preventDefault();
      exportAs("js");
      return;
    }
    // Ctrl+Shift+S — экспорт .json
    if (ctrl && (code === "KeyS" || key === "s") && e.shiftKey) {
      e.preventDefault();
      exportAs("json");
      return;
    }
    // Ctrl+E — быстрое закрытие
    if (ctrl && (code === "KeyE" || key === "e") && !e.shiftKey) {
      e.preventDefault();
      closeEditor();
      return;
    }

    if (inEditable) return;

    // Ctrl+Z — Undo
    if (ctrl && (code === "KeyZ" || key === "z") && !e.shiftKey) {
      e.preventDefault();
      doUndo();
      return;
    }
    // Ctrl+Y или Ctrl+Shift+Z — Redo
    if (ctrl && ((code === "KeyY" || key === "y") || ((code === "KeyZ" || key === "z") && e.shiftKey))) {
      e.preventDefault();
      doRedo();
      return;
    }
  });

  // ---------- 14. Инициализация ----------
  function init() {
    injectToolbarButton();
    setTimeout(injectToolbarButton, 500);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

  window.__Editor = {
    open: openEditor,
    close: closeEditor,
    state: ed,
  };

})();