// naparnik/api.js


const BACKEND_URL = 'https://back.igravvity.workers.dev/api/explain';

export const IS_MOCK = false; 

export async function sendMessage(payload, { onDelta, onDone, onError, signal }) {
  try {
    const response = await fetch(BACKEND_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal,
      cache: 'no-store' // 👈 ДОБАВИТЬ ВОТ ЭТУ СТРОКУ
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Ошибка сервера: ${response.status} ${errText}`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let fullText = '';
    let buffer = '';

       while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
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
              
              // 1. Игнорируем наш пульс
              if (parsed.ping) continue;

              if (parsed.error) {
                onError({ code: 'api_error', message: parsed.error.message || 'Ошибка API' });
                return;
              }

              // 2. Если ИИ «думает» — показываем это пользователю
              if (parsed.content_delta && parsed.content_delta.reasoning_content) {
                onDelta('[ИИ размышляет...] '); // Покажет серый текст в пузыре
              }

              // 3. Если пришел обычный текст
              if (parsed.content_delta && parsed.content_delta.content) {
                const delta = parsed.content_delta.content;
                fullText += delta;
                onDelta(delta);
              }

              // 4. Финальный пакет
              if (parsed.finished && parsed.content && parsed.content.content) {
                if (!isDoneCalled) {
                  isDoneCalled = true;
                  onDone(parsed.content.content);
                }
              }
            } catch (e) {}
          }
        }
      }
    }
    
    // Страховка
    if (fullText && !fullText.includes('</final>')) {
      onDone(fullText);
    }

  } catch (err) {
    if (err.name === 'AbortError') return;
    onError({ code: 'network', message: err.message });
  }
}

