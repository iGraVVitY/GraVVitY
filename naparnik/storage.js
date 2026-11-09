// naparnik/storage.js
// История чата по паре (fileKey, questionKey) в localStorage.

const PREFIX = 'nap:history:';

function makeKey(fileKey, questionKey) {
  return PREFIX + (fileKey || 'default') + ':' + questionKey;
}

export function loadHistory(fileKey, questionKey) {
  try {
    const raw = localStorage.getItem(makeKey(fileKey, questionKey));
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch (e) {
    return [];
  }
}

export function saveHistory(fileKey, questionKey, history) {
  try {
    localStorage.setItem(makeKey(fileKey, questionKey), JSON.stringify(history || []));
  } catch (e) {
    // переполнение localStorage для чата — не критично
  }
}

export function clearHistory(fileKey, questionKey) {
  try { localStorage.removeItem(makeKey(fileKey, questionKey)); } catch (e) {}
}