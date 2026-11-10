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

    xhr.onprogress = () => {
      const currentText = xhr.responseText;
      if (currentText.length > lastIndex) {
        const newChunk = currentText.substring(lastIndex);
        lastIndex = currentText.length;
        
        buffer += newChunk;
        const events = buffer.split('\n\n');
        buffer = events.pop();

        for (const event of events) {
          if (!event.trim()) continue;
          const lines = event.split('\n');
          for (const line of lines) {
            if (line.startsWith('data:')) {
              const dataStr = line.replace(/^data:\s*/, '');
              try {
                const parsed = JSON.parse(dataStr);
                
                if (parsed.ping) continue;
                if (parsed.__meta) { if (onMeta) onMeta(parsed.__meta.conversation_uuid); continue; }
                if (parsed.fake_status) { if (onStatus) onStatus(parsed.fake_status); continue; }
                  if (parsed.error) { 
                  onError({ code: 'api_error', message: parsed.error.message || 'Ошибка 1С' }); 
                  return; // Прерываем обработку
                }
                if (parsed.content_delta && parsed.content_delta.content) {
                  fullText += parsed.content_delta.content;
                  onDelta(parsed.content_delta.content);
                }

                if (parsed.finished && parsed.content && parsed.content.content) {
                  if (!isDoneCalled) {
                    isDoneCalled = true;
                    onDone(parsed.content.content, parsed.uuid);
                  }
                }
              } catch (e) {}
            }
          }
        }
      }
    };

    xhr.onload = () => {
      if (!isDoneCalled) {
        if (fullText) onDone(fullText);
        else onError({ code: 'empty', message: 'Сервер закрыл соединение без ответа. Возможно, 1С задумалась.' });
      }
      resolve();
    };

    xhr.onerror = () => {
      onError({ code: 'network', message: 'Ошибка сети (XHR)' });
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