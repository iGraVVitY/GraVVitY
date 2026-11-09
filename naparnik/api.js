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
      cache: 'no-store'
    });

    if (!response.ok) {
      throw new Error(`Ошибка сервера: ${response.status}`);
    }

    const data = await response.json();

    if (data.error) {
      onError({ code: 'api_error', message: data.error });
      return;
    }

    onDone(data.text);

  } catch (err) {
    if (err.name === 'AbortError') return;
    onError({ code: 'network', message: err.message });
  }
}