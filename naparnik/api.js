// naparnik/api.js

// ⬇️ ВСТАВЬТЕ СЮДА ВАШУ ССЫЛКУ ИЗ CLOUDFLARE ⬇️
const BACKEND_URL = 'https://back.igravvity.workers.dev/api/explain';


export const IS_MOCK = false;

export async function sendMessage(payload, { onDelta, onDone, onError, onMeta, onStatus, signal }) {
  try {
    const response = await fetch(BACKEND_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
      signal,
    });

    if (!response.ok) {
      // Пытаемся прочитать текстовую ошибку, если сервер вернул плохой статус
      const errText = await response.text().catch(() => 'Неизвестная ошибка');
      if (onError) onError({ code: 'api_error', message: errText });
      return;
    }

    if (!response.body) {
      if (onError) onError({ code: 'empty', message: 'Поток данных пуст или не поддерживается.' });
      return;
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder('utf-8');
    
    let buffer = '';
    let fullText = '';
    let isDoneCalled = false;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      // Декодируем бинарный чанк в строку и пушим в буфер
      buffer += decoder.decode(value, { stream: true });

      // Режем буфер по SSE-событиям (\n\n), учитывая возможные \r
      let events = buffer.split(/\r?\n\r?\n/);
      buffer = events.pop() || ''; // Неполный кусок оставляем на следующий цикл

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

            // 1. Ловим ID диалога
            if (parsed.__meta) {
              if (onMeta) onMeta(parsed.__meta.conversation_uuid);
              continue;
            }

            // 2. Ловим фейковые статусы для котика
            if (parsed.fake_status) {
              if (onStatus) onStatus(parsed.fake_status);
              continue;
            }

            // 3. Ловим ошибки
            if (parsed.error) {
              if (onError) onError({ code: 'api_error', message: parsed.error });
              return;
            }

            // 4. Пропускаем reasoning_content (если прилетит)
            if (parsed.content_delta && parsed.content_delta.reasoning_content) {
              continue;
            }

            // 5. Ловим реальный текст ответа
            if (parsed.content_delta && parsed.content_delta.content) {
              const delta = parsed.content_delta.content;
              fullText += delta;
              if (onDelta) onDelta(delta);
            }

            // 6. Ловим оригинальный финальный пакет от 1С
            if (parsed.finished && parsed.content && parsed.content.content) {
              if (!isDoneCalled) {
                isDoneCalled = true;
                if (onDone) onDone(parsed.content.content, parsed.uuid);
              }
            }

            // 7. Дополнительная страховка: ловим финальный пакет нашего воркера
            if (parsed.done) {
              if (!isDoneCalled) {
                isDoneCalled = true;
                if (onDone) onDone(parsed.final_text || fullText, parsed.parent_uuid);
              }
            }

          } catch (e) {
            // Игнорируем битый JSON
          }
        }
      }
    }

    // Закрытие потока без явного флага done
    if (!isDoneCalled) {
      if (fullText) {
        if (onDone) onDone(fullText);
      } else {
        if (onError) onError({ code: 'empty', message: 'Сервер закрыл соединение без ответа.' });
      }
    }

  } catch (err) {
    if (err.name === 'AbortError') return; // Запрос отменен пользователем
    if (onError) onError({ code: 'network', message: err.message || 'Ошибка сети' });
  }
}
