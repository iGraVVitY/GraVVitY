// naparnik/api.js

// ⬇️ ВСТАВЬТЕ СЮДА ВАШУ ССЫЛКУ ИЗ CLOUDFLARE ⬇️
const BACKEND_URL = 'https://back.igravvity.workers.dev/api/explain';

export const IS_MOCK = false;

export function sendMessage(payload, { onDelta, onDone, onError, onMeta, onStatus, signal }) {
  return new Promise((resolve) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', BACKEND_URL, true);
    xhr.setRequestHeader('Content-Type', 'application/json');
    
    let lastIndex = 0;
    let buffer = '';
    let fullText = '';
    let isDoneCalled = false;
    let isError = false;

    // Ловим meta-данные из заголовков (если сервер их отправит)
    xhr.onreadystatechange = () => {
      if (xhr.readyState === 2) { // HEADERS_RECEIVED
        const convUuid = xhr.getResponseHeader('X-Conversation-Uuid');
        if (convUuid && onMeta) {
          onMeta(convUuid);
        }
      }
    };

    xhr.onprogress = () => {
      const currentText = xhr.responseText;
      if (currentText.length > lastIndex) {
        const newChunk = currentText.substring(lastIndex);
        lastIndex = currentText.length;
        
        buffer += newChunk;
        const events = buffer.split('\n\n');
        buffer = events.pop() || '';

        for (const event of events) {
          if (!event.trim()) continue;
          
          // Игнорируем SSE-комментарии (пинги)
          if (event.trim().startsWith(':')) continue;
          
          for (const line of event.split('\n')) {
            if (line.startsWith('data:')) {
              const dataStr = line.replace(/^data:\s*/, '');
              try {
                const parsed = JSON.parse(dataStr);
                
                // 1. Пропускаем технический пинг
                if (parsed.ping) continue;

                // 2. Ловим ID диалога
                if (parsed.__meta) { 
                  if (onMeta) onMeta(parsed.__meta.conversation_uuid); 
                  continue; 
                }

                // 3. Ловим фейковые статусы для котика
                if (parsed.fake_status) { 
                  if (onStatus) onStatus(parsed.fake_status); 
                  continue; 
                }

                // 4. Ловим ошибки
                if (parsed.error) { 
                  isError = true;
                  if (onError) onError({ code: 'api_error', message: parsed.error.message || 'Ошибка сервера' }); 
                  return; 
                }

                // 5. Игнорируем "мысли" модели (reasoning_content)
                if (parsed.content_delta && parsed.content_delta.reasoning_content) {
                  continue; 
                }

                // 6. Ловим реальный текст ответа
                if (parsed.content_delta && parsed.content_delta.content) {
                  const delta = parsed.content_delta.content;
                  fullText += delta;
                  if (onDelta) onDelta(delta);
                }

                // 7. Ловим финальный пакет
                if (parsed.finished && parsed.content && parsed.content.content) {
                  if (!isDoneCalled) {
                    isDoneCalled = true;
                    if (onDone) onDone(parsed.content.content, parsed.uuid);
                  }
                }
              } catch (e) {
                // Игнорируем невалидный JSON
              }
            }
          }
        }
      }
    };

    xhr.onload = () => {
      if (!isDoneCalled && !isError) {
        if (fullText) {
          if (onDone) onDone(fullText);
        } else {
          if (onError) onError({ code: 'empty', message: 'Сервер закрыл соединение без ответа.' });
        }
      }
      resolve();
    };

    xhr.onerror = () => {
      if (!isError) {
        if (onError) onError({ code: 'network', message: 'Ошибка сети (XHR).' });
      }
      resolve();
    };

    if (signal) {
      signal.addEventListener('abort', () => {
        xhr.abort();
        resolve();
      });
    }

    xhr.send(JSON.stringify(payload));
  });
}