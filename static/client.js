/**
 * Отправляет событие в бэкенд через PUT-запрос.
 * @param {Object} eventData - произвольные данные события (обязательно)
 * @param {string} [endpoint] - URL вашего API (если не указан, берётся из конфига)
 * @returns {Promise<Object>} ответ сервера
 */
function logEvent(eventData, endpoint = CONFIG.LOG_ENDPOINT) {
  // Добавляем служебные поля, чтобы облегчить анализ
  const enrichedData = {
    ...eventData,
    timestamp: new Date().toISOString(),
    userAgent: navigator.userAgent,
    sessionId: getSessionId(), // см. реализацию ниже
    url: window.location.href,
  };

  return fetch(endpoint, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      // При необходимости добавьте авторизацию:
      'Authorization': CONFIG.LOG_TOKEN,
    },
    body: JSON.stringify(enrichedData),
  })
    .then(response => {
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      return response.json(); // или response.text(), если бэкенд возвращает не JSON
    })
    .catch(error => {
      console.error('❌ Ошибка отправки лога:', error);
      // Можно сохранить событие в localStorage для повторной отправки позже
      saveEventForRetry(enrichedData);
      // Пробрасываем ошибку дальше, чтобы вызывающий код мог обработать
      throw error;
    });
}

function getSessionId() {
  let sessionId = sessionStorage.getItem('log_session_id');
  if (!sessionId) {
    sessionId = 'sess_' + Date.now() + '_' + Math.random().toString(36).slice(2, 9);
    sessionStorage.setItem('log_session_id', sessionId);
  }
  return sessionId;
}

const RETRY_KEY = 'log_retry_queue';

function saveEventForRetry(eventData) {
  try {
    const queue = JSON.parse(localStorage.getItem(RETRY_KEY) || '[]');
    queue.push(eventData);
    localStorage.setItem(RETRY_KEY, JSON.stringify(queue));
    // Можно запланировать повторную отправку через некоторое время
    scheduleRetry();
  } catch (e) {
    console.warn('Не удалось сохранить событие для повторной отправки', e);
  }
}

function scheduleRetry() {
  if (window._retryTimer) return;
  window._retryTimer = setTimeout(() => {
    window._retryTimer = null;
    sendPendingEvents();
  }, 5000); // через 5 секунд
}

function sendPendingEvents() {
  const queue = JSON.parse(localStorage.getItem(RETRY_KEY) || '[]');
  if (queue.length === 0) return;

  // Отправляем по одному (можно и пакетом, если бэкенд поддерживает массив)
  const events = queue.slice(); // копия
  localStorage.setItem(RETRY_KEY, '[]'); // очищаем очередь

  Promise.allSettled(
    events.map(event => logEvent(event)) // используем ту же функцию
  ).then(results => {
    // Если какие-то снова не отправились – сохраняем их обратно
    const failed = results
      .map((res, idx) => res.status === 'rejected' ? events[idx] : null)
      .filter(Boolean);
    if (failed.length) {
      const currentQueue = JSON.parse(localStorage.getItem(RETRY_KEY) || '[]');
      const newQueue = [...currentQueue, ...failed];
      localStorage.setItem(RETRY_KEY, JSON.stringify(newQueue));
      scheduleRetry(); // повторим позже
    }
  });
}

const logger = {
  /**
   * Логирование произвольного действия
   */
  action: (name, payload = {}) => {
    return logEvent({ type: 'action', action: name, ...payload });
  },

  /**
   * Логирование ошибок
   */
  error: (message, context = {}) => {
    return logEvent({ type: 'error', message, ...context });
  },

  /**
   * Логирование страницы (например, при загрузке)
   */
  pageView: (page = window.location.pathname) => {
    return logEvent({ type: 'pageview', page });
  },
};