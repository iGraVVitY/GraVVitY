// naparnik/mock.js
// Заглушка: возвращает предсказуемые ответы с задержкой и поддержкой отмены.

const MOCK_DELAY_MS = 250;
const MOCK_CHUNK_SIZE = 12;

export async function sendMessage(payload, { onDelta, onDone, onError, signal }) {
  if (payload && payload.message && String(payload.message).includes('[error]')) {
    await sleep(300, signal);
    onError({ code: 'mock_error', message: 'Имитация ошибки API (mock)' });
    return;
  }

  const fullText = buildMockAnswer(payload);
  const chunks = fullText.match(new RegExp(`.{1,${MOCK_CHUNK_SIZE}}`, 'gs')) || [fullText];

  try {
    for (const chunk of chunks) {
      if (signal && signal.aborted) throw new DOMException('Aborted', 'AbortError');
      await sleep(MOCK_DELAY_MS, signal);
      if (signal && signal.aborted) throw new DOMException('Aborted', 'AbortError');
      onDelta(chunk);
    }
    onDone(fullText);
  } catch (err) {
    if (err && err.name === 'AbortError') return;
    onError({ code: 'unexpected', message: String((err && err.message) || err) });
  }
}

function sleep(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal && signal.aborted) {
      reject(new DOMException('Aborted', 'AbortError'));
      return;
    }
    const timer = setTimeout(resolve, ms);
    if (signal) {
      const onAbort = () => {
        clearTimeout(timer);
        reject(new DOMException('Aborted', 'AbortError'));
      };
      signal.addEventListener('abort', onAbort, { once: true });
    }
  });
}

function buildMockAnswer(payload) {
  const isFirst = !payload.history || payload.history.length === 0;
  const correctLetter = optionLetter(payload.correct_option_id);
  const userLetter = payload.user_option_id != null ? optionLetter(payload.user_option_id) : '—';
  const correctText = getOptionText(payload.correct_option_id, payload.options);
  const userText = payload.user_option_id != null
    ? getOptionText(payload.user_option_id, payload.options)
    : '—';

  if (isFirst) {
    return (
      `**Разбор вопроса** (тема: _${esc(payload.topic || '—')}_)\n\n` +
      `Правильный ответ: **${correctLetter}** — ${esc(correctText)}\n\n` +
      `Ваш ответ: **${userLetter}** — ${esc(userText)}\n\n` +
      `Почему ваш вариант неверен, а правильный — верен, здесь будет объяснять 1С:Напарник. ` +
      `Пока это заглушка: текст «печатается» по кусочкам, его можно прервать кнопкой «Стоп».\n\n` +
      `_Когда бэкенд будет готов, вместо этого текста придёт настоящий разбор._`
    );
  }

  return (
    `Уточнение по запросу: «${esc(payload.message)}».\n\n` +
    `В контексте этого вопроса важно учитывать поведение платформы 1С и настройки учётной политики. ` +
    `Подробное объяснение от ИИ появится здесь, когда подключим реальный бэкенд.\n\n` +
    `_Заглушка._`
  );
}

function optionLetter(optionId) {
  if (optionId == null) return '—';
  const idx = parseInt(optionId, 10);
  if (isNaN(idx)) return '—';
  return String.fromCharCode(65 + idx);
}

function getOptionText(optionId, options) {
  if (optionId == null || !Array.isArray(options)) return '—';
  const opt = options.find(o => String(o.id) === String(optionId));
  return opt ? String(opt.text) : '—';
}

function esc(s) {
  return String(s == null ? '' : s);
}