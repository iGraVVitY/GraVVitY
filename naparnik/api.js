// naparnik/api.js

const BACKEND_URL = 'https://back.igravvity.workers.dev/api/explain';
export const IS_MOCK = false;

export async function sendMessage(payload, { onDelta, onDone, onError, onMeta, onStatus, signal }) {
  const MAX_ATTEMPTS = 3;
  let lastError = null;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    let receivedText = false;
    let isDoneCalled = false;

    try {
      if (attempt > 1 && onStatus) {
        onStatus(`Повторная попытка ${attempt} из ${MAX_ATTEMPTS}...`);
      }

      const response = await fetch(BACKEND_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal,
      });

      if (!response.ok) {
        const errText = await response.text().catch(() => 'Неизвестная ошибка');
        throw new Error(errText);
      }

      if (!response.body) {
        throw new Error('Поток данных пуст или не поддерживается.');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder('utf-8');
      
      let buffer = '';
      let fullText = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        let events = buffer.split(/\r?\n\r?\n/);
        buffer = events.pop() || '';

        for (const event of events) {
          const trimmedEvent = event.trim();
          if (!trimmedEvent) continue;
          if (trimmedEvent.startsWith(':')) continue; // Игнорируем пинги

          for (let line of trimmedEvent.split(/\r?\n/)) {
            line = line.trim();
            if (!line || !line.startsWith('data:')) continue;

            try {
              const dataStr = line.substring(5).trim();
              const parsed = JSON.parse(dataStr);

              if (parsed.ping) continue;

              if (parsed.__meta) {
                if (onMeta) onMeta(parsed.__meta.conversation_uuid);
                continue;
              }

              if (parsed.fake_status) {
                if (onStatus) onStatus(parsed.fake_status);
                continue;
              }

              if (parsed.error) {
                throw new Error(parsed.error.message || parsed.error);
              }

              if (parsed.content_delta && parsed.content_delta.reasoning_content) {
                continue;
              }

              if (parsed.content_delta && parsed.content_delta.content) {
                const delta = parsed.content_delta.content;
                receivedText = true; // Начали получать реальный текст
                fullText += delta;
                if (onDelta) onDelta(delta);
              }

              if (parsed.finished && parsed.content && parsed.content.content) {
                if (!isDoneCalled) {
                  isDoneCalled = true;
                  if (onDone) onDone(parsed.content.content, parsed.uuid);
                }
              }
            } catch (e) {
              if (e.message && e.message !== 'Unexpected end of JSON input') {
                throw e; // Пробрасываем реальную ошибку от сервера
              }
            }
          }
        }
      }

      // Если поток закончился, но onDone не был вызван
      if (!isDoneCalled) {
        if (fullText) {
          if (onDone) onDone(fullText);
          return;
        } else {
          throw new Error('Сервер закрыл соединение без ответа.');
        }
      } else {
        return; // Успех
      }

    } catch (err) {
      if (err.name === 'AbortError') return; // Пользователь сам отменил
      lastError = err;

      // Если мы уже начали получать текст, авто-ретрай делать нельзя (будет дубль)
      if (receivedText) {
        if (onError) onError({ code: 'broken_stream', message: 'Соединение прервалось во время ответа.' });
        return;
      }

      if (attempt === MAX_ATTEMPTS) {
        if (onError) onError({ code: 'max_retries', message: lastError.message || 'Не удалось получить ответ.' });
        return;
      }

      // Ждем 1.5 секунды перед следующей попыткой
      await new Promise(resolve => setTimeout(resolve, 1500));
    }
  }
}