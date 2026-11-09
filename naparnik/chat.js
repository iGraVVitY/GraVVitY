// naparnik/chat.js
import { sendMessage, IS_MOCK } from './api.js';
import { loadHistory, saveHistory } from './storage.js';

export function openChat(ctx) {
  // ctx = { fileKey, conversationId, topic, questionText, options,
  //         correctOptionId, userOptionId, onClose }

  const history = loadHistory(ctx.fileKey, ctx.conversationId);

  const overlay = document.createElement('div');
  overlay.className = 'nap-overlay';
  overlay.innerHTML = `
    <div class="nap-panel" role="dialog" aria-modal="true" aria-label="Напарник">
      <div class="nap-header">
        <div class="nap-title">🐱 Напарник</div>
        <div class="nap-sub">${IS_MOCK ? '<span class="nap-badge-mock">заглушка</span>' : ''} Разбор вопроса</div>
        <button class="nap-close" type="button" aria-label="Закрыть">✕</button>
      </div>
      <div class="nap-messages" id="napMessages"></div>
      <div class="nap-input-row">
        <textarea class="nap-input" id="napInput" placeholder="Спросите что-нибудь..." rows="1"></textarea>
        <button class="nap-stop" id="napStop" type="button" style="display:none;" title="Остановить">⏹</button>
        <button class="nap-send" id="napSend" type="button" title="Отправить">
          <svg viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>
        </button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  document.body.style.overflow = 'hidden';

  const messagesEl = overlay.querySelector('#napMessages');
  const inputEl = overlay.querySelector('#napInput');
  const sendBtn = overlay.querySelector('#napSend');
  const stopBtn = overlay.querySelector('#napStop');
  const closeBtn = overlay.querySelector('.nap-close');

  let currentAbort = null;
  let streamingEl = null;
  let streamingText = '';

  function close() {
    if (currentAbort) {
      try { currentAbort.abort(); } catch (e) {}
      currentAbort = null;
    }
    overlay.remove();
    document.body.style.overflow = '';
    document.removeEventListener('keydown', onKey);
    if (typeof ctx.onClose === 'function') ctx.onClose();
  }
  function onKey(e) { if (e.key === 'Escape') close(); }

  closeBtn.addEventListener('click', close);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
  document.addEventListener('keydown', onKey);

  renderHistory();
  // Всегда отрисовываем карточку контекста вверху
  renderContextCard();

  if (history.length === 0) {
    // Отправляем короткий запрос, контекст уже улетел в payload
    setTimeout(() => sendInternal('Разбери, пожалуйста, этот вопрос.'), 100);
  } 

  sendBtn.addEventListener('click', () => {
    const text = inputEl.value.trim();
    if (!text) return;
    inputEl.value = '';
    inputEl.blur();
    sendInternal(text);
  });

  inputEl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      sendBtn.click();
    }
  });

    // Автоматическое увеличение высоты textarea
  inputEl.addEventListener('input', () => {
    inputEl.style.height = 'auto';
    inputEl.style.height = (inputEl.scrollHeight) + 'px';
    // Ограничиваем максимальную высоту (примерно 4 строки)
    if (inputEl.scrollHeight > 100) {
      inputEl.style.height = '100px';
    }
  });

  stopBtn.addEventListener('click', () => {
    if (currentAbort) {
      try { currentAbort.abort(); } catch (e) {}
      currentAbort = null;
    }
  });

  function renderContextCard() {
    const el = document.createElement('div');
    el.className = 'nap-context-card';
    
    let optionsHtml = '';
    ctx.options.forEach((opt, i) => {
      const isUserChoice = (String(opt.id) === String(ctx.userOptionId));
      const isCorrect = (String(opt.id) === String(ctx.correctOptionId));
      
      let cls = 'nap-context-opt';
      if (isUserChoice) cls += ' is-user';
      
      optionsHtml += `<div class="${cls}">
        <span class="nap-context-opt-num">${i + 1}.</span>
        <span class="nap-context-opt-text">${escapeHtml(opt.text)}</span>
        ${isUserChoice ? '<span class="nap-context-opt-badge">Ваш выбор</span>' : ''}
      </div>`;
    });

    el.innerHTML = `
      <div class="nap-context-topic">📚 ${escapeHtml(ctx.topic || 'Вопрос')}</div>
      <div class="nap-context-question">${escapeHtml(ctx.questionText)}</div>
      <div class="nap-context-options">${optionsHtml}</div>
    `;
    
    // Вставляем карточку в начало списка сообщений
     messagesEl.prepend(el);
    scrollBottom();
  }

  function renderHistory() {
    messagesEl.innerHTML = '';
    if (history.length === 0) {
      messagesEl.innerHTML = `<div class="nap-empty">Загрузка разбора…</div>`;
      return;
    }
    for (const msg of history) appendMessage(msg.role, msg.content, false);
    scrollBottom();
  }

  function appendMessage(role, content, isStreaming) {
    const el = document.createElement('div');
    el.className = 'nap-msg nap-msg-' + role + (isStreaming ? ' nap-streaming' : '');
    el.innerHTML = renderMarkdown(content);
    messagesEl.appendChild(el);
    scrollBottom();
    return el;
  }

  function scrollBottom() {
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  function sendInternal(text) {
    const empty = messagesEl.querySelector('.nap-empty');
    if (empty) empty.remove();

    history.push({ role: 'user', content: text });
    appendMessage('user', text, false);

   
       // Показываем котика, который печатает (вставляем напрямую, без Markdown)
    streamingEl = document.createElement('div');
    streamingEl.className = 'nap-msg nap-msg-assistant nap-streaming';
    streamingEl.innerHTML = `
      <div class="nap-cat-typing">
        <span class="nap-cat-emoji">🐱</span>
        <span>Котик печатает<span class="nap-cat-dots"></span></span>
      </div>
    `;
    messagesEl.appendChild(streamingEl);
    scrollBottom();

    sendBtn.disabled = true;
    inputEl.disabled = true;
    stopBtn.style.display = '';

    currentAbort = new AbortController();

    const payload = {
      conversation_id: ctx.conversationId,
      topic: ctx.topic,
      question_text: ctx.questionText,
      options: ctx.options,
      correct_option_id: ctx.correctOptionId,
      user_option_id: ctx.userOptionId,
      history: history.slice(0, -1),
      message: text,
    };

    sendMessage(payload, {
      onDelta: () => {}, // Нам больше не нужны дельты от сервера
      onDone: (fullText) => {
        const finalText = fullText || '';
        streamingEl.classList.remove('nap-streaming');
        streamingEl.innerHTML = '';
        
        history.push({ role: 'assistant', content: finalText });
        saveHistory(ctx.fileKey, ctx.conversationId, history);

        // ФЕЙКОВЫЙ СТРИМИНГ (печатаем текст по кусочкам)
        let i = 0;
        const speed = 15; // Задержка между кадрами (мс)
        const chunkSize = 3; // Сколько символов добавлять за кадр
        
        const typeInterval = setInterval(() => {
          i += chunkSize;
          if (i >= finalText.length) {
            clearInterval(typeInterval);
            streamingEl.innerHTML = renderMarkdown(finalText);
            finishStreaming();
          } else {
            streamingEl.innerHTML = renderMarkdown(finalText.slice(0, i)) + '<span class="nap-cursor">▍</span>';
            scrollBottom();
          }
        }, speed);
      },
      onError: (err) => {
        streamingEl.classList.remove('nap-streaming');
        streamingEl.innerHTML = `<span class="nap-error">⚠️ Ошибка: ${escapeHtml((err && err.message) || 'неизвестная')}</span>`;
        if (history.length && history[history.length - 1].role === 'user') history.pop();
        finishStreaming();
      },
      signal: currentAbort.signal,
    });
  }

  function finishStreaming() {
    streamingEl = null;
    streamingText = '';
    currentAbort = null;
    sendBtn.disabled = false;
    inputEl.disabled = false;
    stopBtn.style.display = 'none';
     inputEl.blur();
    scrollBottom();
  }
}

// Минимальный markdown → HTML (код, **жирный**, *курсив*, переносы)
// Используем библиотеку marked для рендера
function renderMarkdown(text) {
  if (text == null) return '';
  
  // Если библиотека загрузилась, используем её
  if (window.marked) {
    // Настройка для безопасности (чтобы не выполнялись скрипты, если они вдруг придут)
    window.marked.setOptions({
      breaks: true, // Переносы строк превращаются в <br>
      gfm: true     // Поддержка таблиц и списков (GitHub Flavored Markdown)
    });
    return window.marked.parse(String(text));
  }
  
  // Если библиотека почему-то не загрузилась, используем старый (простой) вариант
  let s = escapeHtml(String(text));
  s = s.replace(/```([\s\S]*?)```/g, (_, code) => '<pre><code>' + code.replace(/^\n/, '') + '</code></pre>');
  s = s.replace(/`([^`\n]+)`/g, '<code>$1</code>');
  s = s.replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>');
  s = s.replace(/\n/g, '<br>');
  return s;
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}