// naparnik/api.js

// ⬇️ ВСТАВЬТЕ СЮДА ВАШУ ССЫЛКУ ИЗ CLOUDFLARE ⬇️
const API_URL = 'https://back.igravvity.workers.dev/api'; 

export const IS_MOCK = false; 

export async function sendMessage(payload, { onDelta, onDone, onError, onMeta, onStatus, signal }) {
  try {
    // 1. Отправляем задачу
    const response = await fetch(`${API_URL}/explain`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      cache: 'no-store'
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Ошибка сервера: ${response.status} ${errText}`);
    }
    
    const { taskId } = await response.json();

    // 2. Начинаем поллинг (опрос)
    let isDone = false;
    
    // Показываем котику фейковые статусы, чтобы пользователь не скучал
    const statuses = ["Думаю...", "Анализирую...", "Проверяю...", "Формулирую ответ...", "Ищу ошибки...", "Играю с хвостом..."];
    let statusIdx = 0;

    while (!isDone) {
      if (signal && signal.aborted) throw new DOMException('Aborted', 'AbortError');
      
      // Ждем 4 секунды перед следующим запросом
      await new Promise(r => setTimeout(r, 4000));

      if (attempts > 30) {
        throw new Error('Превышено время ожидания сервера. Попробуйте еще раз.');
      }


      // Обновляем статус на экране
      if (onStatus) onStatus(statuses[statusIdx % statuses.length]);
      statusIdx++;

      const check = await fetch(`${API_URL}/result?taskId=${taskId}`, { cache: 'no-store' });
      const data = await check.json();

      if (data.status === 'pending') {
        continue; // Еще не готово, спрашиваем дальше
      }

      if (data.status === 'error') {
        throw new Error(data.message || 'Ошибка на сервере 1С');
      }

      if (data.status === 'done') {
        isDone = true;
        if (onMeta) onMeta(data.conversation_uuid);
        // Отдаем весь текст сразу
        onDelta(data.text); 
        onDone(data.text, data.parent_uuid);
      }
    }

  } catch (err) {
    if (err.name === 'AbortError') return;
    onError({ code: 'network', message: err.message });
  }
}