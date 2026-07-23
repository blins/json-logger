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

// ---------- Автоматическое логирование кликов ----------
/**
 * Включает автоматический сбор кликов по ссылкам, кнопкам и элементам с ролью button.
 * @param {Object} options
 * @param {string} options.excludeSelector - CSS-селектор для исключения элементов (по умолчанию '[data-log-exclude]')
 * @param {string[]} options.includeSelectors - массив селекторов, которые нужно отслеживать
 * @param {Function} options.dataExtractor - функция, получающая элемент и возвращающая доп. поля для события
 * @param {boolean} options.preventDefault - отменять стандартное действие ссылок (обычно false)
 * @returns {Function} функция для отключения авто-логирования
 */
function enableAutoLogging(options = {}) {
  const {
    excludeSelector = '[data-log-exclude]',
    includeSelectors = ['a', 'button', '[role="button"]', 'input[type="button"]', 'input[type="submit"]'],
    dataExtractor = null,
    preventDefault = false,
  } = options;

  // Основной обработчик кликов (делегирование)
  const clickHandler = (event) => {
    const target = event.target.closest(includeSelectors.join(','));
    if (!target) return;

    // Проверяем, не исключён ли элемент
    if (target.matches(excludeSelector)) return;

    // При необходимости отменяем переход по ссылке (например, для логирования перед уходом)
    if (preventDefault && target.tagName === 'A') {
      event.preventDefault();
    }

    // Собираем базовые данные об элементе
    const eventData = {
      type: 'click',
      element: target.tagName.toLowerCase(),
      text: target.textContent?.trim().slice(0, 200) || '', // обрезаем длинные тексты
      id: target.id || undefined,
      classes: target.className || undefined,
      href: target.href || undefined,
      data: extractDataAttributes(target),
    };

    // Добавляем кастомные поля, если передана функция
    if (dataExtractor) {
      Object.assign(eventData, dataExtractor(target));
    }

    // Отправляем событие
    logEvent(eventData);
  };

  // Вешаем обработчик на документ (срабатывает на фазе всплытия)
  document.addEventListener('click', clickHandler);

  // Возвращаем функцию отключения
  return () => {
    document.removeEventListener('click', clickHandler);
  };
}

// Вспомогательная функция извлечения всех data-* атрибутов
function extractDataAttributes(element) {
  const data = {};
  for (const attr of element.attributes) {
    if (attr.name.startsWith('data-')) {
      const key = attr.name.slice(5); // убираем 'data-'
      data[key] = attr.value;
    }
  }
  return data;
}

function enableAutoChanges(options = {}) {
  const { excludeSelector = '[data-log-exclude]', includeSelectors = ['input', 'select', 'textarea'] } = options;
  const handler = (event) => {
    const target = event.target.closest(includeSelectors.join(','));
    if (!target || target.matches(excludeSelector)) return;
    logEvent({
      type: 'change',
      element: target.tagName.toLowerCase(),
      name: target.name,
      value: target.value,
      checked: target.checked,
      // ...
    });
  };
  document.addEventListener('change', handler);
  return () => document.removeEventListener('change', handler);
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
  // Добавляем возможность включить авто-клики
  enableAutoClicks: enableAutoLogging,
};

