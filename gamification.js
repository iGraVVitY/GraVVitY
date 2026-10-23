/* =========================================================
   GAMIFICATION MODULE
   Фича 1: Серия дней (streak)
   Фича 2: Дневная цель (daily goal) + Плашка квеста
   Фича 3: Опыт (XP) и уровни (привязка к файлу)
   Фича 4: Достижения (badges) (привязка к файлу)
   Фича 5: Ежедневные квесты
   ========================================================= */
(function () {
  "use strict";

  const STORAGE_KEY = "gamification:streak";
  const GOAL_KEY = "gamification:goal";
  const MILESTONES = [7, 14, 30, 100, 365];

  // Шкала уровней
  const LEVELS = [
    { lvl: 1, name: "Новичок", xp: 0 }, { lvl: 2, name: "Стажер", xp: 100 },
    { lvl: 3, name: "Ученик", xp: 250 }, { lvl: 4, name: "Практик", xp: 500 },
    { lvl: 5, name: "Специалист", xp: 850 }, { lvl: 6, name: "Профи", xp: 1300 },
    { lvl: 7, name: "Эксперт", xp: 1900 }, { lvl: 8, name: "Гуру", xp: 2700 },
    { lvl: 9, name: "Мастер", xp: 3700 }, { lvl: 10, name: "Легенда", xp: 5000 }
  ];

  // Список всех достижений (привязаны к файлу)
  const BADGES = [
    { id: "first_step", icon: "👶", name: "Первый шаг", desc: "Ответить на 1 вопрос", cat: "activity" },
    { id: "hundred", icon: "💯", name: "Сотка", desc: "Ответить на 100 вопросов", cat: "activity" },
    { id: "five_hundred", icon: "🔥", name: "Пятисотка", desc: "Ответить на 500 вопросов", cat: "activity" },
    { id: "thousand", icon: "🧠", name: "Тысячник", desc: "Ответить на 1000 вопросов", cat: "activity" },
    { id: "no_life", icon: "💀", name: "У тебя нет жизни", desc: "Ответить на 10 000 вопросов", cat: "activity" },
    { id: "streak_3", icon: "🔥", name: "Разогрев", desc: "3 дня подряд", cat: "streak" },
    { id: "streak_7", icon: "💪", name: "Неделя силы", desc: "7 дней подряд", cat: "streak" },
    { id: "streak_14", icon: "🛡️", name: "Железная дисциплина", desc: "14 дней подряд", cat: "streak" },
    { id: "comeback", icon: "🔄", name: "Возвращение", desc: "Вернуться после 7+ дней перерыва", cat: "streak" },
    { id: "early_bird", icon: "🐦", name: "Ранняя пташка", desc: "Ответить до 7:00", cat: "time" },
    { id: "night_owl", icon: "🦉", name: "Ночной дозор", desc: "Ответить после 23:00", cat: "time" },
    { id: "marathon", icon: "🏃", name: "Марафонец", desc: "Ответить на 50 вопросов за день", cat: "time" },
    { id: "quest_10", icon: "📜", name: "Исполнительный", desc: "Выполнить 10 квестов", cat: "quest" },
    { id: "quest_30", icon: "👑", name: "Победитель", desc: "Выполнить 30 квестов", cat: "quest" },
    { id: "sniper", icon: "🎯", name: "Снайпер", desc: "10 правильных ответов подряд", cat: "accuracy" },
    { id: "machine_gun", icon: "🔫", name: "Пулеметчик", desc: "25 правильных ответов подряд", cat: "accuracy" },
    { id: "perfect", icon: "💎", name: "Безупречный", desc: "Пройти сессию (10+ вопросов) без ошибок", cat: "accuracy" },
    { id: "clean", icon: "🧹", name: "Чистовик", desc: "Закрыть все активные ошибки", cat: "accuracy" },
    { id: "explorer", icon: "🔭", name: "Исследователь", desc: "Ответить хотя бы раз из каждой темы", cat: "topic" },
    { id: "first_topic", icon: "⭐", name: "Первая тема", desc: "Освоить 100% одной темы", cat: "topic" },
    { id: "excellent", icon: "🎓", name: "Отличник", desc: "Освоить 100% всех тем", cat: "topic" },
	{ id: "absolute_mind", icon: "🧠", name: "Абсолютный разум", desc: "Победить Пожирателя Лицензий без ошибок", cat: "quest" },
	{ id: "are_you_kidding", icon: "🤡", name: "Ты же пошутил?", desc: "Пройти сессию, ответив неверно на все вопросы", cat: "accuracy" }
  ];

  // Пул ежедневных квестов
  const QUEST_POOL = [
    { id: "q5", title: "Разминка", desc: "Ответить на 5 вопросов", type: "questions", target: 5, xp: 20 },
    { id: "q15", title: "Трудяга", desc: "Ответить на 15 вопросов", type: "questions", target: 15, xp: 20 },
    { id: "q30", title: "Марафонец", desc: "Ответить на 30 вопросов", type: "questions", target: 30, xp: 30 },
    { id: "err2", title: "Охотник за ошибками", desc: "Закрыть 2 активные ошибки", type: "errors", target: 2, xp: 30 },
    { id: "err5", title: "Чистильщик", desc: "Закрыть 5 активных ошибок", type: "errors", target: 5, xp: 50 },
    { id: "st3", title: "Внимательность", desc: "Дать 3 правильных ответа подряд", type: "streak", target: 3, xp: 20 },
    { id: "t5", title: "Таймер", desc: "Позаниматься 5 минут", type: "time", target: 5, xp: 20 },
    { id: "t15", title: "Таймер+", desc: "Позаниматься 15 минут", type: "time", target: 15, xp: 30 }
  ];

  const state = {
    current: 0, best: 0, lastActiveDate: null, todayCount: 0, todayGoalDone: false,
    dailyGoalType: "random_all", dailyTarget: 0, goalProgress: 0, goalStreakCorrect: 0,
    targetErrorsStart: 0, targetTopicId: null, targetTopicTitle: "", questTypeName: "",
    cardHidden: false, questCompleteCardShown: false,
    totalXp: 0, currentLevel: 1, sessionXp: 0, sessionCorrectStreak: 0,
    unlockedBadges: [],
    counters: { totalAnswered: 0, questsDone: 0 },
    // Daily Quests
    dailyQuests: [],
    dailyQuestsDoneBonus: false
  };

  /* ---------- Утилиты ---------- */
  function todayStr() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }
  function yesterdayStr() {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }
  function getFileKey() {
    if (window.TestApp && window.TestApp.fileKey) return window.TestApp.fileKey;
    if (window.TestApp && window.TestApp.state && window.TestApp.state.fileKey) return window.TestApp.state.fileKey;
    return "default";
  }
  function getXpKey() { return "gamification:xp:" + getFileKey(); }
  function getBadgesKey() { return "gamification:badges:" + getFileKey(); }
  function getCountersKey() { return "gamification:counters:" + getFileKey(); }
  function getQuestsKey() { return "gamification:quests:" + getFileKey(); }

  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) { const parsed = JSON.parse(raw); Object.keys(parsed).forEach(k => { if (state.hasOwnProperty(k)) state[k] = parsed[k]; }); }
      
      const rawGoal = localStorage.getItem(GOAL_KEY);
      if (rawGoal) {
        const g = JSON.parse(rawGoal);
        if (g.date === todayStr()) {
          state.dailyGoalType = g.type; state.dailyTarget = g.target;
          state.goalProgress = g.progress; state.goalStreakCorrect = g.streakCorrect;
          state.targetErrorsStart = g.errorsStart; state.targetTopicId = g.topicId;
          state.targetTopicTitle = g.topicTitle; state.todayGoalDone = g.done;
          state.questTypeName = g.questTypeName || "";
        }
      }

      const rawXp = localStorage.getItem(getXpKey());
      if (rawXp) { const xpData = JSON.parse(rawXp); state.totalXp = xpData.totalXp || 0; state.currentLevel = xpData.currentLevel || 1; }

      const rawBadges = localStorage.getItem(getBadgesKey());
      if (rawBadges) { state.unlockedBadges = JSON.parse(rawBadges) || []; }

      const rawCounters = localStorage.getItem(getCountersKey());
      if (rawCounters) { const c = JSON.parse(rawCounters); state.counters = { totalAnswered: c.totalAnswered || 0, questsDone: c.questsDone || 0 }; }

      // Загрузка ежедневных квестов
      const rawQuests = localStorage.getItem(getQuestsKey());
      if (rawQuests) {
        const qData = JSON.parse(rawQuests);
        if (qData.date === todayStr()) {
          state.dailyQuests = qData.quests || [];
          state.dailyQuestsDoneBonus = qData.allDoneBonusGiven || false;
        }
      }
    } catch (e) { console.warn("[gamification] load failed", e); }
  }

  function save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ current: state.current, best: state.best, lastActiveDate: state.lastActiveDate, todayCount: state.todayCount, todayGoalDone: state.todayGoalDone }));
      localStorage.setItem(GOAL_KEY, JSON.stringify({ date: todayStr(), type: state.dailyGoalType, target: state.dailyTarget, progress: state.goalProgress, streakCorrect: state.goalStreakCorrect, errorsStart: state.targetErrorsStart, topicId: state.targetTopicId, topicTitle: state.targetTopicTitle, done: state.todayGoalDone, questTypeName: state.questTypeName }));
    } catch (e) {}
  }
  function saveXp() { try { localStorage.setItem(getXpKey(), JSON.stringify({ totalXp: state.totalXp, currentLevel: state.currentLevel })); } catch (e) {} }
  function saveBadges() { try { localStorage.setItem(getBadgesKey(), JSON.stringify(state.unlockedBadges)); } catch (e) {} }
  function saveCounters() { try { localStorage.setItem(getCountersKey(), JSON.stringify(state.counters)); } catch (e) {} }
  function saveQuests() {
    if (!state.dailyQuests || state.dailyQuests.length === 0) return; // <-- Защита
    try {
      localStorage.setItem(getQuestsKey(), JSON.stringify({
        date: todayStr(),
        quests: state.dailyQuests,
        allDoneBonusGiven: state.dailyQuestsDoneBonus
      }));
    } catch (e) {}
  }

  function toast(text, type = "info", ms = 4000) {
    const container = document.getElementById("gamificationToasts");
    if (!container) return;
    const el = document.createElement("div");
    el.textContent = text;
    el.style.cssText = `pointer-events:auto; padding:10px 16px; border-radius:10px; font-size:14px; font-weight:600; box-shadow:0 4px 16px rgba(0,0,0,.15); transition:opacity .3s, transform .3s; opacity:0; transform:translateY(10px); max-width:min(90vw,480px); text-align:center;`;
    if (type === "ok") { el.style.background = "var(--ok-bg)"; el.style.color = "var(--ok)"; el.style.border = "1px solid var(--ok)"; }
    else if (type === "warn") { el.style.background = "var(--warn-bg)"; el.style.color = "var(--warn)"; el.style.border = "1px solid var(--warn)"; }
    else if (type === "err") { el.style.background = "var(--err-bg)"; el.style.color = "var(--err)"; el.style.border = "1px solid var(--err)"; }
    else { el.style.background = "var(--bg)"; el.style.color = "var(--text)"; el.style.border = "1px solid var(--border)"; }
    container.appendChild(el);
    requestAnimationFrame(() => { el.style.opacity = "1"; el.style.transform = "translateY(0)"; });
    setTimeout(() => { el.style.opacity = "0"; el.style.transform = "translateY(10px)"; setTimeout(() => el.remove(), 350); }, ms);
  }

  /* ---------- XP и Уровни ---------- */
  function addXp(amount) {
    if (amount <= 0) return;
    state.totalXp += amount;
    state.sessionXp += amount;
    let newLevel = 1;
    for (let i = LEVELS.length - 1; i >= 0; i--) { if (state.totalXp >= LEVELS[i].xp) { newLevel = LEVELS[i].lvl; break; } }
    if (newLevel > state.currentLevel) {
      const lvlData = LEVELS.find(l => l.lvl === newLevel);
      toast(`🎉 Новый уровень: ${lvlData.name}!`, "ok", 6000);
      state.currentLevel = newLevel;
    }
    saveXp(); renderXpBadge();
  }
  function getLevelInfo() {
    let current = LEVELS[0]; let next = LEVELS[1] || LEVELS[0];
    for (let i = 0; i < LEVELS.length; i++) { if (state.totalXp >= LEVELS[i].xp) { current = LEVELS[i]; next = LEVELS[i + 1] || null; } else { break; } }
    return { current, next };
  }
  function renderXpBadge() {
    const el = document.getElementById("gamificationXpBadge");
    if (!el) return;
    const { current, next } = getLevelInfo();
    let tooltip = `Уровень: ${current.name} (${state.totalXp} XP)`;
    if (next) tooltip += `\nДо следующего: ${next.xp - state.totalXp} XP`; else tooltip += `\nМаксимальный уровень!`;
    el.style.cssText = `font-size:13px; font-weight:600; color:var(--accent); cursor:help; margin-left:8px;`;
    el.textContent = `⭐ ${current.lvl}`; el.title = tooltip;
  }

  /* ---------- Достижения ---------- */
  function unlockBadge(id) {
    if (state.unlockedBadges.includes(id)) return;
    const badge = BADGES.find(b => b.id === id);
    if (!badge) return;
    state.unlockedBadges.push(id);
    saveBadges(); renderBadgeCount();
    toast(`🏆 Достижение: ${badge.name}!`, "ok", 5000);
    addXp(20);
  }
  function checkBadges() {
    const all = (window.TestApp && window.TestApp.getAllQuestionsFlat) ? window.TestApp.getAllQuestionsFlat() : [];
    const topics = (window.TestApp && window.TestApp.state.topics) ? window.TestApp.state.topics : [];
    
    if (state.counters.totalAnswered >= 1) unlockBadge("first_step");
    if (state.counters.totalAnswered >= 100) unlockBadge("hundred");
    if (state.counters.totalAnswered >= 500) unlockBadge("five_hundred");
    if (state.counters.totalAnswered >= 1000) unlockBadge("thousand");
    if (state.counters.totalAnswered >= 10000) unlockBadge("no_life");
    
    if (state.current >= 3) unlockBadge("streak_3");
    if (state.current >= 7) unlockBadge("streak_7");
    if (state.current >= 14) unlockBadge("streak_14");
    
    const hour = new Date().getHours();
    if (hour < 7) unlockBadge("early_bird");
    if (hour >= 23) unlockBadge("night_owl");
    if (state.todayCount >= 50) unlockBadge("marathon");
    
    if (state.counters.questsDone >= 10) unlockBadge("quest_10");
    if (state.counters.questsDone >= 30) unlockBadge("quest_30");
    
    if (state.sessionCorrectStreak >= 10) unlockBadge("sniper");
    if (state.sessionCorrectStreak >= 25) unlockBadge("machine_gun");
    
    const activeErrors = all.filter(q => window.TestApp.getStat(q).err > 0);
    if (all.length > 0 && activeErrors.length === 0 && state.counters.totalAnswered > 0) unlockBadge("clean");
    
    if (all.length > 0) {
      const exploredTopics = topics.filter(t => t.questions.some(q => window.TestApp.getStat({ ...q, _topicId: t.id }).ok > 0 || window.TestApp.getStat({ ...q, _topicId: t.id }).err > 0));
      if (exploredTopics.length === topics.length) unlockBadge("explorer");
      
      const masteredTopics = topics.filter(t => t.questions.every(q => window.TestApp.getStat({ ...q, _topicId: t.id }).ok > 0));
      if (masteredTopics.length >= 1) unlockBadge("first_topic");
      if (topics.length > 0 && masteredTopics.length === topics.length) unlockBadge("excellent");
    }
  }
  function renderBadgeCount() {
    const el = document.getElementById("gamificationBadgesCount");
    if (el) el.textContent = state.unlockedBadges.length;
  }
  function openBadgesModal() {
    const modal = document.getElementById("badgesModal");
    const grid = document.getElementById("badgesGrid");
    if (!modal || !grid) return;
    
    const categories = { activity: "Активность", streak: "Серия дней", time: "Время", quest: "Квесты", accuracy: "Точность", topic: "Темы" };
    let html = "";
    
    Object.keys(categories).forEach(cat => {
      html += `<div style="grid-column: 1 / -1; margin-top: 10px; font-weight: bold; color: var(--text); border-bottom: 1px solid var(--border); padding-bottom: 5px;">${categories[cat]}</div>`;
      
      BADGES.filter(b => b.cat === cat).forEach(b => {
        const unlocked = state.unlockedBadges.includes(b.id);
        
        const isSecret = ["are_you_kidding", "absolute_mind"].includes(b.id);
        const showSecret = !unlocked && isSecret;
        
        const iconText = showSecret ? "❓" : b.icon;
        const nameText = showSecret ? "???" : b.name;
        const descText = showSecret ? "Секретное достижение" : b.desc;
        const filterStyle = unlocked ? 'none' : 'grayscale(100%)';
        
        html += `<div style="display:flex; flex-direction:column; align-items:center; text-align:center; padding:12px; border:1px solid var(--border); border-radius:8px; background:${unlocked ? 'var(--card)' : 'var(--bg)'}; opacity:${unlocked ? '1' : '0.6'};">
            <div style="font-size:32px; margin-bottom:8px; filter:${filterStyle};">${iconText}</div>
            <div style="font-weight:600; font-size:14px; color:var(--text);">${nameText}</div>
            <div style="font-size:11px; color:var(--muted); margin-top:4px;">${descText}</div>
          </div>`;
      });
    });
    
    grid.innerHTML = html;
    modal.style.display = "flex";
  }

  /* ---------- ЕЖЕДНЕВНЫЕ КВЕСТЫ ---------- */
  function generateDailyQuests() {
    // Собираем доступные квесты
    const all = (window.TestApp && window.TestApp.getAllQuestionsFlat) ? window.TestApp.getAllQuestionsFlat() : [];
    let activeErrors = 0;
    all.forEach(q => { if (window.TestApp.getStat(q).err > 0) activeErrors++; });

    // Фильтруем пул
    const available = QUEST_POOL.filter(q => {
      if (q.id.startsWith("err") && activeErrors < q.target) return false;
      return true;
    });

    // Перемешиваем и берем 3
    const shuffled = available.sort(() => 0.5 - Math.random());
    state.dailyQuests = shuffled.slice(0, 3).map(q => ({
      id: q.id, progress: 0, target: q.target, done: false, title: q.title, desc: q.desc, xp: q.xp, type: q.type, startErrors: activeErrors
    }));
    state.dailyQuestsDoneBonus = false;
    saveQuests();
    renderQuestsCount();
  }

      function checkDailyQuests(item, isCorrect) {
    if (!state.dailyQuests || state.dailyQuests.length === 0) return;
    
    let changed = false;
    const all = (window.TestApp && window.TestApp.getAllQuestionsFlat) ? window.TestApp.getAllQuestionsFlat() : [];
    let currentErrors = 0;
    all.forEach(q => { if (window.TestApp.getStat(q).err > 0) currentErrors++; });

    state.dailyQuests.forEach(q => {
      if (q.done) return;
      
      const oldProgress = q.progress;
      
      // Обновляем прогресс
      if (q.type === "questions") {
        q.progress++;
      } else if (q.type === "streak") {
        if (isCorrect) q.progress++; else q.progress = 0;
      } else if (q.type === "errors") {
        // Считаем, сколько всего ошибок было закрыто с начала квеста
        const startErrors = q.startErrors || 0;
        const closedCount = startErrors - currentErrors;
        
        // Если закрыли больше, чем было (или столько же) - это прогресс.
        // Если появились новые ошибки, closedCount может быть отрицательным, 
        // но мы не должны уменьшать уже достигнутый прогресс.
        // Поэтому берем максимум из текущего прогресса и нового значения.
        q.progress = Math.max(q.progress, closedCount);
      }
      
      // Если прогресс изменился, помечаем для сохранения
      if (q.progress !== oldProgress) changed = true;

      // Проверка на выполнение (для ошибок цель - сколько нужно закрыть)
      if (q.type !== "time" && q.progress >= q.target && !q.done) {
        q.done = true; changed = true;
        addXp(q.xp);
        state.counters.questsDone++; saveCounters();
        toast(`📋 Квест выполнен: ${q.title}! (+${q.xp} XP)`, "ok", 4000);
      }
    });

    if (changed) saveQuests();
    renderQuestsCount();
    checkAllQuestsDone();
  }

  function checkAllQuestsDone() {
    if (state.dailyQuestsDoneBonus) return;
    if (state.dailyQuests.length > 0 && state.dailyQuests.every(q => q.done)) {
      state.dailyQuestsDoneBonus = true;
      addXp(50);
      toast(`🎉 Все ежедневные квесты выполнены! (+50 XP)`, "ok", 6000);
      saveQuests();
    }
  }

  function renderQuestsCount() {
    const el = document.getElementById("questsCount");
    if (!el) return;
    const done = state.dailyQuests.filter(q => q.done).length;
    el.textContent = `${done}/${state.dailyQuests.length || 3}`;
  }

  function openQuestsModal() {
    const modal = document.getElementById("questsModal");
    const content = document.getElementById("questsListContent");
    if (!modal || !content) return;

    if (!state.dailyQuests || state.dailyQuests.length === 0) {
      content.innerHTML = `<div style="text-align:center; color:var(--muted);">Квесты на сегодня не сгенерированы.</div>`;
    } else {
      let html = "";
      state.dailyQuests.forEach(q => {
        let progressText = `${q.progress} / ${q.target}`;
        if (q.type === "errors") progressText = `${q.progress} / ${q.target}`;
        if (q.type === "time") progressText = `${q.progress} / ${q.target} мин`;
        
        html += `<div class="quest-item ${q.done ? 'done' : ''}">
          <div class="quest-check">✓</div>
          <div class="quest-info">
            <div class="quest-title">${q.title}</div>
            <div class="quest-desc">${q.desc} (${progressText})</div>
          </div>
          <div class="quest-xp">+${q.xp} XP</div>
        </div>`;
      });
      content.innerHTML = html;
    }
    modal.style.display = "flex";
  }

  /* ---------- Логика целей ---------- */
  function generateQuest() {
    const all = (window.TestApp && window.TestApp.getAllQuestionsFlat) ? window.TestApp.getAllQuestionsFlat() : [];
    let availableErrors = 0;
    all.forEach(q => { if (window.TestApp.getStat(q).err > 0) availableErrors++; });
    const types = ["q10", "q20", "rand_q", "t15", "st5"];
    if (availableErrors > 0) { types.push("err3", "err5"); }
    if (Math.random() > 0.5) types.push("topic");
    const chosen = types[Math.floor(Math.random() * types.length)];
    applyGoalType(chosen, availableErrors);
  }

  function applyGoalType(type, availableErrors) {
    state.dailyGoalType = type;
    state.questCompleteCardShown = false;
    state.goalProgress = 0; state.goalStreakCorrect = 0;
    state.targetTopicId = null; state.targetTopicTitle = "";
    state.todayGoalDone = false; state.targetErrorsStart = availableErrors;

    let target = 0, topicId = null, topicTitle = "", questName = "";
    switch (type) {
      case "q10": target = 10; questName = "Ответить на 10 вопросов"; break;
      case "q20": target = 20; questName = "Ответить на 20 вопросов"; break;
      case "q30": target = 30; questName = "Ответить на 30 вопросов"; break;
      case "q50": target = 50; questName = "Ответить на 50 вопросов"; break;
      case "rand_q": target = Math.floor(Math.random() * 16) + 5; questName = `Ответить на ${target} вопросов`; break;
      case "t15": target = 15; questName = "Позаниматься 15 минут"; break;
      case "t30": target = 30; questName = "Позаниматься 30 минут"; break;
      case "err3": target = Math.min(3, availableErrors); questName = `Закрыть ${target} ошибок`; break;
      case "err5": target = Math.min(5, availableErrors); questName = `Закрыть ${target} ошибок`; break;
      case "err10": target = Math.min(10, availableErrors); questName = `Закрыть ${target} ошибок`; break;
      case "st5": target = 5; questName = "5 правильных ответов подряд"; break;
      case "st10": target = 10; questName = "10 правильных ответов подряд"; break;
      case "st15": target = 15; questName = "15 правильных ответов подряд"; break;
      case "topic": 
        target = 1; 
        const topics = (window.TestApp && window.TestApp.state.topics) ? window.TestApp.state.topics : [];
        const unfinishedTopics = topics.filter(t => t.questions.some(q => window.TestApp.getStat({ ...q, _topicId: t.id }).ok === 0));
        if (unfinishedTopics.length > 0) {
          const t = unfinishedTopics[Math.floor(Math.random() * unfinishedTopics.length)];
          topicId = t.id; topicTitle = t.title; questName = `Решить тему «${t.title}»`;
        } else if (topics.length > 0) {
          topicId = topics[0].id; topicTitle = topics[0].title; questName = `Решить тему «${topics[0].title}»`;
        }
        break;
    }
    if (type.startsWith("err") && availableErrors === 0) target = 0;
    state.dailyTarget = target; state.targetTopicId = topicId;
    state.targetTopicTitle = topicTitle; state.questTypeName = questName;
    save(); renderQuestCard();
  }

  function initDailyGoal() {
    const savedSetting = localStorage.getItem("gamification:goalType") || "random_all";
    state.dailyGoalType = savedSetting;
    const all = (window.TestApp && window.TestApp.getAllQuestionsFlat) ? window.TestApp.getAllQuestionsFlat() : [];
    let availableErrors = 0;
    all.forEach(q => { if (window.TestApp.getStat(q).err > 0) availableErrors++; });
    if (savedSetting === "off") return;
    if (savedSetting === "random_all") generateQuest();
    else applyGoalType(savedSetting, availableErrors);
  }

  function checkGoalCompletion() {
    if (state.dailyGoalType === "off" || state.todayGoalDone) return;
    let done = false;
    switch (state.dailyGoalType) {
      case "q10": case "q20": case "q30": case "q50": case "rand_q": case "t15": case "t30": done = state.goalProgress >= state.dailyTarget; break;
      case "err3": case "err5": case "err10":
        let currentErrors = 0;
        const all = (window.TestApp && window.TestApp.getAllQuestionsFlat) ? window.TestApp.getAllQuestionsFlat() : [];
        all.forEach(q => { if (window.TestApp.getStat(q).err > 0) currentErrors++; });
        done = currentErrors <= (state.targetErrorsStart - state.dailyTarget);
        state.goalProgress = (state.targetErrorsStart - currentErrors); break;
      case "st5": case "st10": case "st15": done = state.goalStreakCorrect >= state.dailyTarget; state.goalProgress = state.goalStreakCorrect; break;
      case "topic":
        if (state.targetTopicId) {
          const topic = window.TestApp.state.topics.find(t => t.id === state.targetTopicId);
          if (topic) {
            done = topic.questions.every(q => window.TestApp.getStat({ ...q, _topicId: topic.id }).ok > 0);
            const closed = topic.questions.filter(q => window.TestApp.getStat({ ...q, _topicId: topic.id }).ok > 0).length;
            state.goalProgress = closed; state.dailyTarget = topic.questions.length;
          }
        }
        break;
    }
    if (done && !state.todayGoalDone) {
      state.todayGoalDone = true;
      addXp(50);
      toast(`✅ Дневная цель выполнена! (+50 XP)`, "ok", 6000);
      save(); renderQuestCard();
      checkBadges();
    }
  }

  /* ---------- Бейджи и Плашки ---------- */
  function renderBadge() {
    const el = document.getElementById("gamificationBadge");
    if (!el) return;
    const today = todayStr();
    const activeToday = state.lastActiveDate === today;
    let streakColor = state.current > 0 ? (activeToday ? "var(--err)" : "var(--warn)") : "var(--muted)";
    let streakHtml = `<span style="font-size:13px;font-weight:600;color:${streakColor};cursor:help" title="Серия дней: ${state.current}. Рекорд: ${state.best}">🔥 ${state.current}</span>`;

    let goalHtml = "";
    if (state.dailyGoalType !== "off") {
      let icon = "🎯", label = `${state.goalProgress}/${state.dailyTarget}`;
      let tooltip = `Квест: ${state.questTypeName}. Прогресс: ${label}`;
      if (state.dailyGoalType.startsWith("t")) { icon = "⏱"; tooltip = `Квест: ${state.questTypeName}. Время: ${label} мин`; }
      if (state.dailyGoalType.startsWith("err")) { icon = "❌"; tooltip = `Квест: ${state.questTypeName}. Осталось: ${state.dailyTarget - state.goalProgress}`; }
      if (state.dailyGoalType.startsWith("st")) { icon = "⚡"; tooltip = `Квест: ${state.questTypeName}. Серия: ${label}`; }
      if (state.dailyGoalType === "topic") { icon = "📚"; label = state.todayGoalDone ? "✅" : "0/1"; tooltip = `Квест: ${state.questTypeName}. Статус: ${state.todayGoalDone ? "Выполнено" : "В процессе"}`; }
      let color = state.todayGoalDone ? "var(--ok)" : "var(--muted)";
      if (state.todayGoalDone) tooltip = "✅ Квест дня выполнен!";
      goalHtml = `<span style="font-size:13px;font-weight:600;color:${color};margin-left:10px;cursor:help;" title="${tooltip}">${icon} ${label}</span>`;
    }
    el.innerHTML = streakHtml + goalHtml;
  }

  function renderQuestCard() {
    const card = document.getElementById("gamificationQuestCard");
    const content = document.getElementById("questCardContent");
    if (!card || !content) return;
    if (state.dailyGoalType === "off" || state.cardHidden) { card.style.display = "none"; return; }
    let icon = "🎲";
    if (state.dailyGoalType.startsWith("q") || state.dailyGoalType === "rand_q") icon = "🎯";
    if (state.dailyGoalType.startsWith("t")) icon = "⏱";
    if (state.dailyGoalType.startsWith("err")) icon = "❌";
    if (state.dailyGoalType.startsWith("st")) icon = "⚡";
    if (state.dailyGoalType === "topic") icon = "📚";

    if (state.todayGoalDone) {
      if (state.questCompleteCardShown) { card.style.display = "none"; return; }
      card.style.display = "flex"; card.style.background = "var(--ok-bg)";
      card.style.borderColor = "var(--ok)"; card.style.borderLeftColor = "var(--ok)"; card.style.color = "var(--ok)";
      content.innerHTML = `<span style="font-size:16px;">✅</span> <b>Квест дня выполнен!</b> <span style="margin-left:8px; opacity:0.8;">+50 XP</span>`;
      state.questCompleteCardShown = true;
      setTimeout(() => { card.style.display = "none"; }, 5000);
    } else {
      card.style.display = "flex"; card.style.background = "var(--card)";
      card.style.borderColor = "var(--border)"; card.style.borderLeftColor = "var(--accent)"; card.style.color = "var(--text)";
      let progressText = "";
      if (state.dailyGoalType.startsWith("q") || state.dailyGoalType === "rand_q") progressText = `Осталось: ${state.dailyTarget - state.goalProgress}`;
      else if (state.dailyGoalType.startsWith("t")) progressText = `Еще ${state.dailyTarget - state.goalProgress} мин.`;
      else if (state.dailyGoalType.startsWith("err")) progressText = `Осталось: ${state.dailyTarget - state.goalProgress}`;
      else if (state.dailyGoalType.startsWith("st")) progressText = `Сейчас: ${state.goalProgress} / ${state.dailyTarget}`;
      else if (state.dailyGoalType === "topic") progressText = `Закрой все вопросы темы`;
      content.innerHTML = `<span style="font-size:18px;">${icon}</span> <span><b>Квест дня:</b> ${state.questTypeName}</span> <span style="color:var(--muted); font-size:13px; margin-left:auto; padding-left:10px; white-space:nowrap;">${progressText}</span>`;
    }
  }

  function getThreshold() {
    let goalLimit = 10;
    if (state.dailyGoalType !== "off" && !state.dailyGoalType.startsWith("t") && state.dailyGoalType !== "topic") {
       if (state.dailyTarget < 10) goalLimit = state.dailyTarget;
    }
    return goalLimit;
  }

  /* ---------- Обработка ответа ---------- */
  function onAnswer(item, isCorrect) {
    const today = todayStr();
    if (state.lastActiveDate && state.lastActiveDate !== today && state.lastActiveDate !== yesterdayStr()) {
      const d1 = new Date(state.lastActiveDate); const d2 = new Date(today);
      const diffDays = Math.ceil(Math.abs(d2 - d1) / (1000 * 60 * 60 * 24));
      if (diffDays >= 7) unlockBadge("comeback");
    }

    if (state.lastActiveDate && state.lastActiveDate !== today && state.lastActiveDate !== yesterdayStr()) {
      if (state.current >= 2) toast(`Серия сброшена. Была: ${state.current} дн. Начинаем заново 💪`, "warn", 6000);
      state.current = 0;
    }

    state.todayCount += 1;
    state.counters.totalAnswered += 1;
    saveCounters();
    
    if (isCorrect) state.sessionCorrectStreak += 1;
    else state.sessionCorrectStreak = 0;

    addXp(isCorrect ? 5 : 1);

    if (state.dailyGoalType !== "off" && !state.todayGoalDone) {
      if (state.dailyGoalType.startsWith("q") || state.dailyGoalType === "rand_q") state.goalProgress += 1;
      if (state.dailyGoalType.startsWith("st")) { if (isCorrect) state.goalStreakCorrect++; else state.goalStreakCorrect = 0; }
      checkGoalCompletion();
    }

    const threshold = getThreshold();
    const dayDone = state.todayCount >= threshold || state.todayGoalDone;

    if (dayDone && state.lastActiveDate !== today) {
      const wasYesterday = state.lastActiveDate === yesterdayStr();
      state.current = wasYesterday ? state.current + 1 : 1;
      state.lastActiveDate = today;
      if (state.current > state.best) state.best = state.current;

      if (state.current === 3) { addXp(15); toast(`🔥 3 дня подряд! (+15 XP)`, "ok", 5000); }
      else if (state.current === 7) { addXp(30); toast(`🔥 Неделя подряд! (+30 XP)`, "ok", 6000); }
      else if (state.current === 30) { addXp(100); toast(`🔥 Месяц подряд! (+100 XP)`, "ok", 6000); }
      else if (MILESTONES.includes(state.current)) toast(`🏆 ${state.current} дней подряд!`, "ok", 6000);
      else if (state.current === 1) toast(`🔥 Серия началась! День 1`, "ok", 4000);
      else toast(`🔥 День ${state.current} — серия продлена!`, "ok", 3000);
    }

    save();
    renderBadge();
    renderQuestCard();
    checkBadges();
    checkDailyQuests(item, isCorrect);
	
	    // Обновление рекордов (день, серия, закрытые ошибки)
    if (window.TestApp && window.TestApp.fileKey) {
      const recKey = "gamification:records:" + window.TestApp.fileKey;
      try {
        const rec = JSON.parse(localStorage.getItem(recKey)) || {};
        
        // Лучший день
        if (!rec.bestDayCount || state.todayCount > rec.bestDayCount) {
          rec.bestDayCount = state.todayCount;
        }
        
        // Лучшая серия подряд (за всё время)
        if (!rec.bestCorrectStreak || state.sessionCorrectStreak > rec.bestCorrectStreak) {
          rec.bestCorrectStreak = state.sessionCorrectStreak;
        }
        
        // Стрик
        if (!rec.bestStreak || state.best > rec.bestStreak) {
          rec.bestStreak = state.best;
        }

        // Ошибки закрыто за день (приблизительно)
        const all = window.TestApp.getAllQuestionsFlat();
        const activeErrors = all.filter(q => window.TestApp.getStat(q).err > 0).length;
        if (state.dailyQuests) {
          // Найдем квест на ошибки и посмотрим его прогресс
          const errQuest = state.dailyQuests.find(q => q.type === "errors");
          if (errQuest && errQuest.progress > (rec.bestErrorsClosed || 0)) {
            rec.bestErrorsClosed = errQuest.progress;
          }
        }

        localStorage.setItem(recKey, JSON.stringify(rec));
      } catch (e) {}
    }
	
  }

  function tickTimeGoal() {
    if (state.dailyGoalType === "t15" || state.dailyGoalType === "t30") {
      if (state.todayGoalDone) return;
const mins = (window.TestApp && window.TestApp.getTodayActiveMinutes) ? window.TestApp.getTodayActiveMinutes() : 0;
      state.goalProgress = mins;
      checkGoalCompletion();
      renderBadge(); renderQuestCard(); save();
    }
    
    // Квесты на время
	if (state.dailyQuests) {
      let changed = false;
    const mins = (window.TestApp && window.TestApp.getTodayActiveMinutes) ? window.TestApp.getTodayActiveMinutes() : 0;
      state.dailyQuests.forEach(q => {
        if (q.type === "time" && !q.done) {
          q.progress = mins;
          if (q.progress >= q.target) { 
            q.done = true; changed = true; 
            addXp(q.xp); 
            toast(`📋 Квест выполнен: ${q.title}! (+${q.xp} XP)`, "ok", 4000); 
          }
        }
      });
      if (changed) { saveQuests(); renderQuestsCount(); checkAllQuestsDone(); }
    }
  }

  /* ---------- Инициализация ---------- */
  window.GameApp = {
    onAnswer, toast, addXp, unlockBadge,
    get state() { return state; },
    getThreshold,
    getSessionXp: () => state.sessionXp,
    resetSessionXp: () => { state.sessionXp = 0; },
    _refreshBadge: () => { renderBadge(); renderXpBadge(); },
    _refreshCard: renderQuestCard,
    _reload: function() {
      state.totalXp = 0; state.currentLevel = 1; state.sessionXp = 0; state.sessionCorrectStreak = 0;
      const rawXp = localStorage.getItem(getXpKey());
      if (rawXp) { try { const xpData = JSON.parse(rawXp); state.totalXp = xpData.totalXp || 0; state.currentLevel = xpData.currentLevel || 1; } catch (e) {} }
      const rawBadges = localStorage.getItem(getBadgesKey());
      if (rawBadges) { try { state.unlockedBadges = JSON.parse(rawBadges) || []; } catch (e) {} } else { state.unlockedBadges = []; }
      const rawCounters = localStorage.getItem(getCountersKey());
      if (rawCounters) { try { const c = JSON.parse(rawCounters); state.counters = { totalAnswered: c.totalAnswered || 0, questsDone: c.questsDone || 0 }; } catch (e) {} } else { state.counters = { totalAnswered: 0, questsDone: 0 }; }
      
      // Квесты
      const rawQuests = localStorage.getItem(getQuestsKey());
      if (rawQuests) {
        try {
          const qData = JSON.parse(rawQuests);
          if (qData.date === todayStr()) { state.dailyQuests = qData.quests || []; state.dailyQuestsDoneBonus = qData.allDoneBonusGiven || false; }
          else { generateDailyQuests(); }
        } catch (e) {}
      } else { generateDailyQuests(); }

      renderXpBadge(); renderBadgeCount(); renderQuestsCount();
    },
  };

  function init() {
    const today = todayStr();
    const savedQuestDate = localStorage.getItem("gamification:questDate");
    
    if (savedQuestDate !== today) { localStorage.setItem("gamification:questDate", today); initDailyGoal(); generateDailyQuests(); } 
    else { 
        load(); 
        if (!state.dailyQuests || state.dailyQuests.length === 0) generateDailyQuests();
    }

    const sel = document.getElementById("dailyGoalSelect");
    if (sel) {
      const savedType = localStorage.getItem("gamification:goalType") || "random_all";
      sel.value = savedType;
      sel.addEventListener("change", (e) => {
        const newType = e.target.value;
        localStorage.setItem("gamification:goalType", newType);
        state.dailyGoalType = newType;
        state.cardHidden = false;
        if (newType === "random_all") generateQuest();
        else applyGoalType(newType, 0);
        renderBadge(); renderQuestCard();
      });
    }

    const closeBtn = document.getElementById("questCardClose");
    if (closeBtn) closeBtn.addEventListener("click", () => { state.cardHidden = true; renderQuestCard(); });

    const badgesBtn = document.getElementById("gamificationBadgesBtn");
    if (badgesBtn) badgesBtn.addEventListener("click", openBadgesModal);
    const closeBadgesBtn = document.getElementById("closeBadgesBtn");
    if (closeBadgesBtn) closeBadgesBtn.addEventListener("click", () => { document.getElementById("badgesModal").style.display = "none"; });

    const questsBtn = document.getElementById("questsBtn");
    if (questsBtn) questsBtn.addEventListener("click", openQuestsModal);
    const closeQuestsBtn = document.getElementById("closeQuestsBtn");
    if (closeQuestsBtn) closeQuestsBtn.addEventListener("click", () => { document.getElementById("questsModal").style.display = "none"; });

    renderBadge(); renderXpBadge(); renderQuestCard(); renderBadgeCount(); renderQuestsCount();
    setInterval(tickTimeGoal, 30000);
    setTimeout(checkBadges, 2000);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();