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
        <div class="nap-title">🤖 Напарник</div>
        <div class="nap-sub">${IS_MOCK ? '<span class="nap-badge-mock">заглушка</span>' : ''} Разбор вопроса</div>
        <button class="nap-close" type="button" aria-label="Закрыть">✕</button>
      </div>
      <div class="nap-messages" id="napMessages"></div>
      <div class="nap-input-row">
        <textarea class="nap-input" id="napInput"
                  placeholder="Спросите что-нибудь по этому вопросу… (Ctrl+Enter — отправить)"
                  rows="2"></textarea>
        <div class="nap-input-actions">
          <button class="nap-stop" id="napStop" type="button" style="display:none;">Стоп</button>
          <button class="nap-send" id="napSend" type="button">Отправить</button>
        </div>
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

  if (history.length === 0) {
    setTimeout(() => sendInternal('Разбери, пожалуйста, этот вопрос.'), 60);
  } else {
    inputEl.focus();
  }

  sendBtn.addEventListener('click', () => {
    const text = inputEl.value.trim();
    if (!text) return;
    inputEl.value = '';
    sendInternal(text);
  });

  inputEl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      sendBtn.click();
    }
  });

  stopBtn.addEventListener('click', () => {
    if (currentAbort) {
      try { currentAbort.abort(); } catch (e) {}
      currentAbort = null;
    }
  });

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

    streamingText = '';
    streamingEl = appendMessage('assistant', '', true);
    streamingEl.innerHTML = '<span class="nap-cursor">▍</span>';

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
      onDelta: (delta) => {
        streamingText += delta;
        streamingEl.innerHTML = renderMarkdown(streamingText) + '<span class="nap-cursor">▍</span>';
        scrollBottom();
      },
      onDone: (fullText) => {
        const finalText = fullText || streamingText;
        streamingEl.classList.remove('nap-streaming');
        streamingEl.innerHTML = renderMarkdown(finalText);
        history.push({ role: 'assistant', content: finalText });
        saveHistory(ctx.fileKey, ctx.conversationId, history);
        finishStreaming();
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
    inputEl.focus();
    scrollBottom();
  }
}

// Минимальный markdown → HTML (код, **жирный**, *курсив*, переносы)
function renderMarkdown(text) {
  if (text == null) return '';
  let s = escapeHtml(String(text));
  s = s.replace(/```([\s\S]*?)```/g, (_, code) => '<pre><code>' + code.replace(/^\n/, '') + '</code></pre>');
  s = s.replace(/`([^`\n]+)`/g, '<code>$1</code>');
  s = s.replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>');
  s = s.replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<i>$2</i>');
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