// naparnik/naparnik.js
import { openChat } from './chat.js';

const BTN_CLASS = 'nap-ask-btn';
let attached = false;

function getApp() { return window.TestApp || null; }

function getCurrentItem() {
  const app = getApp();
  if (!app || !app.state) return null;
  const s = app.state;
  if (!s.order || s.order.length === 0) return null;
  return s.order[s.current] || null;
}

function isAnswered(item) {
  const app = getApp();
  if (!app || !app.state || !item) return false;
  return app.state.answers[item.id] !== undefined;
}

function removeButton() {
  const btn = document.querySelector('.' + BTN_CLASS);
  if (btn) btn.remove();
}

function injectButton() {
  const quiz = document.getElementById('quiz');
  if (!quiz) return;

  const cardActions = quiz.querySelector('.card-actions');
  if (!cardActions) {
    // не карточка вопроса (финал, босс, разбор и т.п.)
    removeButton();
    return;
  }

  const item = getCurrentItem();
  const qKey = item ? (item._topicId + ':' + item.id) : null;
  const existing = cardActions.querySelector('.' + BTN_CLASS);

  if (!item || !isAnswered(item)) {
    if (existing) existing.remove();
    return;
  }
  if (existing && existing.dataset.qkey === qKey) return;
  if (existing) existing.remove();

  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = BTN_CLASS;
  btn.dataset.qkey = qKey;
  btn.title = 'Разобрать вопрос с 1С:Напарник';
  btn.innerHTML = '🤖 Напарник';
  btn.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    openChatForItem(item);
  });

  // Вставляем между левым блоком (счётчик/мусорка) и правым (избранное).
  if (cardActions.children.length >= 2) {
    cardActions.insertBefore(btn, cardActions.children[1]);
  } else {
    cardActions.appendChild(btn);
  }
}

function openChatForItem(item) {
  const app = getApp();
  if (!app || !app.state) return;

  const s = app.state;
  const chosen = s.answers[item.id];
  if (chosen === undefined) return;

  const optionOrder = s.optionOrders[item.id] || item.options.map((_, i) => i);
  
  // 1. Собираем варианты в том порядке, в котором их видит пользователь (перемешанные)
  const options = optionOrder.map((originalIdx, displayIdx) => ({
    id: String(displayIdx), // ID — это позиция на экране (0, 1, 2, 3...)
    text: String(item.options[originalIdx]) // Текст берем из оригинального массива
  }));
  
  // 2. Ищем, под каким номером на экране находится правильный ответ
  const correctDisplayIdx = optionOrder.indexOf(item.correct - 1);
  
  // 3. Ответ пользователя - это просто индекс того варианта, на который он нажал
  const userOptionId = String(chosen);

  openChat({
    fileKey: app.fileKey || 'default',
    conversationId: item._topicId + ':' + item.id,
    topic: item._topicTitle || '',
    questionText: item.q,
    options, // Теперь тут перемешанные варианты
    correctOptionId: String(correctDisplayIdx), // Индекс правильного ответа на экране
    userOptionId: userOptionId, // Индекс ответа пользователя на экране
    onClose: () => {},
  });
}

function attach() {
  if (attached) return;
  const quiz = document.getElementById('quiz');
  if (!quiz) {
    setTimeout(attach, 300);
    return;
  }
  attached = true;

  const obs = new MutationObserver(() => {
    try { injectButton(); } catch (e) { console.error('[naparnik]', e); }
  });
  obs.observe(quiz, { childList: true, subtree: true });

  injectButton();
  setTimeout(injectButton, 500);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', attach);
} else {
  attach();
}
window.addEventListener('trainer:ready', attach);