(() => {
  'use strict';

  if (window.topGymNotificationCenter) return;

  const state = {
    open: false,
    loaded: false,
    loading: false,
    unread: 0,
    page: 1,
    hasNext: false,
    category: '',
    items: []
  };
  const categoryMeta = Object.freeze({
    coaching: { label: '\u0627\u0644\u062a\u062f\u0631\u064a\u0628', tone: 'info', icon: 'coaching' },
    registration: { label: 'التسجيل', tone: 'info', icon: 'registration' },
    membership: { label: 'العضويات', tone: 'success', icon: 'membership' },
    payment: { label: 'المدفوعات', tone: 'warning', icon: 'payment' },
    system: { label: 'النظام', tone: 'neutral', icon: 'system' },
    default: { label: 'تنبيه', tone: 'neutral', icon: 'default' }
  });
  const iconPaths = Object.freeze({
    registration: '<path d="M12 5v14M5 12h14"/>',
    membership: '<path d="M7 4h10v16H7z"/><path d="M9.5 8h5M9.5 12h5M9.5 16h3"/>',
    coaching: '<path d="M4 6h16v12H4z"/><path d="M8 10h8M8 14h5"/>',
    payment: '<path d="M5 7h14v10H5z"/><path d="M5 10h14M8 14h3"/>',
    system: '<path d="M12 3l8 4.5v9L12 21l-8-4.5v-9L12 3z"/><path d="M12 8v5M12 16h.01"/>',
    default: '<path d="M18 9a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"/>'
  });
  let root;
  let list;
  let badge;
  let markAllButton;
  let refreshButton;
  let loadMoreButton;
  let triggerElement;
  let summaryElement;
  let apiBase = '/api/notifications';
  let realtimeSource;
  let realtimeReconnectTimer;
  let sessionReady = false;
  let liveToast;
  let liveToastTimer;

  const formatDate = (value) => {
    if (!value) return '';
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? '' : new Intl.DateTimeFormat('ar-EG-u-ca-gregory', { dateStyle: 'medium', timeStyle: 'short' }).format(date);
  };

  function setBadge(value) {
    state.unread = Math.max(0, Number(value) || 0);
    if (badge) {
      badge.textContent = state.unread > 99 ? '99+' : String(state.unread);
      badge.hidden = state.unread === 0;
    }
    if (summaryElement) {
      summaryElement.textContent = state.unread
        ? `${state.unread.toLocaleString('ar-EG')} غير مقروءة`
        : 'كل التنبيهات مقروءة';
    }
  }

  function safeActionUrl(value) {
    const candidate = String(value || '').trim();
    return candidate.startsWith('/') && !candidate.startsWith('//') ? candidate : '';
  }

  function apiPath(suffix = '') { return `${apiBase}${suffix}`; }

  function startRealtime() {
    if (realtimeSource || realtimeReconnectTimer || !sessionReady || typeof window.EventSource !== 'function') return;
    realtimeSource = new EventSource(apiPath('/stream'), { withCredentials: true });
    realtimeSource.addEventListener('open', () => {
      if (realtimeReconnectTimer) {
        clearTimeout(realtimeReconnectTimer);
        realtimeReconnectTimer = null;
      }
    });
    realtimeSource.addEventListener('notification', (event) => {
      try {
        const incoming = JSON.parse(event.data || '{}');
        if (!incoming.id || state.items.some((item) => Number(item.id) === Number(incoming.id))) return;
        state.items = [incoming, ...state.items].slice(0, 50);
        state.loaded = true;
        renderNotifications(state.items);
        setBadge(state.unread + 1);
        showLiveToast(incoming);
      } catch (_) { /* malformed push data is ignored; next refresh reconciles it */ }
    });
    realtimeSource.addEventListener('error', () => {
      if (realtimeSource) {
        realtimeSource.close();
        realtimeSource = null;
      }
      if (sessionReady && !realtimeReconnectTimer) {
        realtimeReconnectTimer = window.setTimeout(() => {
          realtimeReconnectTimer = null;
          startRealtime();
        }, 5000);
      }
    });
  }

  function showLiveToast(item) {
    if (!document.body || !item?.id) return;
    if (liveToastTimer) window.clearTimeout(liveToastTimer);
    liveToast?.remove();

    const toast = document.createElement('aside');
    toast.className = 'notification-center-live-toast';
    toast.setAttribute('role', 'status');
    toast.setAttribute('aria-live', 'polite');

    const title = document.createElement('strong');
    title.className = 'notification-center-live-toast-title';
    title.textContent = item.title || 'إشعار جديد';
    const message = document.createElement('span');
    message.className = 'notification-center-live-toast-message';
    message.textContent = item.message || '';
    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'notification-center-live-toast-close';
    close.setAttribute('aria-label', 'إغلاق الإشعار');
    close.textContent = '×';
    close.addEventListener('click', () => toast.remove());
    toast.append(title, message, close);

    const actionUrl = safeActionUrl(item.actionUrl);
    if (actionUrl) {
      toast.classList.add('is-actionable');
      toast.addEventListener('click', (event) => {
        if (event.target !== close) window.location.assign(actionUrl);
      });
    }

    document.body.appendChild(toast);
    liveToast = toast;
    liveToastTimer = window.setTimeout(() => {
      toast.remove();
      if (liveToast === toast) liveToast = null;
    }, 6500);
  }

  function getCategoryMeta(item) {
    const key = String(item?.category || item?.type || '').trim().toLowerCase();
    return categoryMeta[key] || categoryMeta.default;
  }

  function iconMarkup(kind) {
    return `<svg class="notification-center-icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${iconPaths[kind] || iconPaths.default}</svg>`;
  }

  function setMessage(text, className = 'notification-center-empty') {
    if (!list) return;
    list.replaceChildren();
    const message = document.createElement('div');
    message.className = className;
    message.textContent = text;
    list.appendChild(message);
  }

  function renderNotifications(items = []) {
    if (!list) return;
    list.replaceChildren();
    if (!items.length) {
      setMessage('لا توجد إشعارات جديدة.');
      return;
    }

    items.forEach((item) => {
      const meta = getCategoryMeta(item);
      const article = document.createElement('article');
      article.className = `notification-center-item${item.read ? '' : ' is-unread'}`;
      article.dataset.notificationId = String(item.id || '');
      article.dataset.notificationTone = meta.tone;

      const icon = document.createElement('span');
      icon.className = 'notification-center-item-icon';
      icon.innerHTML = iconMarkup(meta.icon);

      const body = document.createElement('div');
      body.className = 'notification-center-item-body';

      const heading = document.createElement('div');
      heading.className = 'notification-center-item-heading';
      const category = document.createElement('span');
      category.className = 'notification-center-item-category';
      category.textContent = meta.label;
      heading.appendChild(category);
      if (!item.read) {
        const unread = document.createElement('span');
        unread.className = 'notification-center-item-unread';
        unread.textContent = 'غير مقروء';
        heading.appendChild(unread);
      }

      const actionUrl = safeActionUrl(item.actionUrl);
      const content = document.createElement(actionUrl ? 'a' : 'div');
      content.className = 'notification-center-item-link';
      if (actionUrl) content.href = actionUrl;
      const title = document.createElement('strong');
      title.className = 'notification-center-item-title';
      title.textContent = item.title || 'إشعار';
      const message = document.createElement('span');
      message.className = 'notification-center-item-message';
      message.textContent = item.message || '';
      content.append(title, message);

      const metaLine = document.createElement('div');
      metaLine.className = 'notification-center-item-meta';
      const timestamp = document.createElement('time');
      timestamp.dateTime = item.createdAt || '';
      timestamp.textContent = formatDate(item.createdAt);
      metaLine.appendChild(timestamp);

      body.append(heading, content, metaLine);
      article.append(icon, body);

      if (!item.read) {
        const readButton = document.createElement('button');
        readButton.type = 'button';
        readButton.className = 'notification-center-item-action';
        readButton.setAttribute('aria-label', 'تمييز الإشعار كمقروء');
        readButton.title = 'تمييز كمقروء';
        readButton.innerHTML = '<svg class="notification-center-action-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4 4L19 7"/></svg>';
        readButton.addEventListener('click', () => markRead(item.id));
        article.appendChild(readButton);
      }
      list.appendChild(article);
    });
  }

  async function requestJson(url, options = {}) {
    const response = await fetch(url, { credentials: 'same-origin', headers: { Accept: 'application/json', ...(options.headers || {}) }, ...options });
    if (response.status === 401 || response.status === 403) return null;
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || 'تعذر تحميل الإشعارات.');
    return payload;
  }

  async function refreshUnread() {
    const payload = await requestJson(apiPath('/unread-count'));
    if (payload) {
      sessionReady = true;
      setBadge(payload.unread);
      startRealtime();
    }
  }

  async function load({ append = false } = {}) {
    if (state.loading) return;
    state.loading = true;
    if (!append) setMessage('جاري تحميل الإشعارات...', 'notification-center-loading');
    try {
      const page = append ? state.page + 1 : 1;
      const params = new URLSearchParams({ page: String(page), pageSize: '8' });
      if (state.category) params.set('category', state.category);
      const payload = await requestJson(`${apiBase}?${params}`);
      if (!payload) {
        sessionReady = false;
        if (realtimeSource) {
          realtimeSource.close();
          realtimeSource = null;
        }
        if (realtimeReconnectTimer) {
          clearTimeout(realtimeReconnectTimer);
          realtimeReconnectTimer = null;
        }
        setMessage('سجّل الدخول لعرض إشعاراتك.');
        state.loaded = true;
        return;
      }
      sessionReady = true;
      const incoming = Array.isArray(payload.notifications) ? payload.notifications : [];
      state.items = append ? [...state.items, ...incoming] : incoming;
      state.page = page;
      state.hasNext = Boolean(payload.pagination?.hasNext);
      renderNotifications(state.items);
      loadMoreButton.hidden = !state.hasNext;
      state.loaded = true;
      startRealtime();
      try { await refreshUnread(); } catch (_) { /* list remains usable */ }
    } catch (_) {
      setMessage('تعذر تحميل الإشعارات. حاول مرة أخرى.', 'notification-center-error');
    } finally {
      state.loading = false;
    }
  }

  async function markRead(id) {
    const numericId = Number(id);
    if (!Number.isInteger(numericId) || numericId <= 0) return;
    try {
      const payload = await requestJson(apiPath(`/${numericId}/read`), { method: 'POST' });
      if (payload) {
        state.items = state.items.map((item) => item.id === numericId ? { ...item, read: true } : item);
        renderNotifications(state.items);
        await refreshUnread();
      }
    } catch (_) { /* a later refresh will reconcile the state */ }
  }

  async function markAllRead() {
    if (markAllButton) markAllButton.disabled = true;
    try {
      const payload = await requestJson(apiPath('/read-all'), { method: 'POST' });
      if (payload) {
        state.items = state.items.map((item) => ({ ...item, read: true }));
        renderNotifications(state.items);
        setBadge(0);
      }
    } catch (_) { /* keep the panel usable */ }
    finally { if (markAllButton) markAllButton.disabled = false; }
  }

  function toggle(open = !state.open) {
    state.open = Boolean(open);
    root.classList.toggle('is-open', state.open);
    const panel = root.querySelector('.notification-center-panel');
    panel.hidden = !state.open;
    triggerElement?.setAttribute('aria-expanded', String(state.open));
    if (state.open && !state.loaded) void load();
  }

  function create(host) {
    if (!host || host.querySelector('[data-notification-center]')) return;
    root = document.createElement('div');
    root.className = 'notification-center';
    root.dataset.notificationCenter = 'true';
    apiBase = host.dataset.notificationScope === 'portal'
      ? '/api/member-portal/notifications'
      : '/api/notifications';

    const trigger = document.createElement('button');
    triggerElement = trigger;
    trigger.type = 'button';
    trigger.className = 'notification-center-trigger';
    trigger.setAttribute('aria-label', 'الإشعارات');
    trigger.setAttribute('aria-expanded', 'false');
    trigger.setAttribute('aria-controls', 'notificationCenterPanel');
    trigger.innerHTML = '<svg class="ui-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 9a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"/></svg>';
    badge = document.createElement('span');
    badge.className = 'notification-center-badge';
    badge.hidden = true;
    badge.setAttribute('aria-live', 'polite');
    trigger.appendChild(badge);

    const panel = document.createElement('section');
    panel.id = 'notificationCenterPanel';
    panel.className = 'notification-center-panel';
    panel.hidden = true;
    panel.setAttribute('aria-label', 'مركز الإشعارات');
    panel.innerHTML = '<header class="notification-center-head"><div class="notification-center-heading"><span class="notification-center-eyebrow">مركز الحساب</span><h2>الإشعارات</h2><small>آخر التنبيهات الخاصة بحسابك</small></div><div class="notification-center-head-actions"><label class="notification-center-filter-wrap" for="notificationCategoryFilter"><span class="visually-hidden">تصفية الإشعارات</span><select id="notificationCategoryFilter" class="notification-center-filter"><option value="">كل الإشعارات</option><option value="registration">التسجيل</option><option value="membership">العضويات</option><option value="payment">المدفوعات</option><option value="system">النظام</option></select></label><button type="button" class="notification-center-icon-button" data-notification-refresh aria-label="تحديث الإشعارات" title="تحديث"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 11a8 8 0 0 0-14.5-4.7L4 8"/><path d="M4 4v4h4"/><path d="M4 13a8 8 0 0 0 14.5 4.7L20 16"/><path d="M20 20v-4h-4"/></svg></button></div></header><div class="notification-center-toolbar"><span class="notification-center-summary" data-notification-summary>كل التنبيهات مقروءة</span><span class="notification-center-toolbar-hint">تحديثات آمنة حسب صلاحياتك</span></div><div class="notification-center-list" data-notification-list role="list" aria-live="polite"><div class="notification-center-empty">افتح المركز لعرض الإشعارات.</div></div><footer class="notification-center-footer"><button type="button" class="notification-center-action" data-notification-more hidden>تحميل المزيد</button><button type="button" class="notification-center-action notification-center-read-all" data-notification-read-all><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4 4L19 7"/></svg><span>تمييز الكل كمقروء</span></button></footer>';
    root.append(trigger, panel);
    host.prepend(root);

    list = panel.querySelector('[data-notification-list]');
    summaryElement = panel.querySelector('[data-notification-summary]');
    markAllButton = panel.querySelector('[data-notification-read-all]');
    refreshButton = panel.querySelector('[data-notification-refresh]');
    loadMoreButton = panel.querySelector('[data-notification-more]');
    const categoryFilter = panel.querySelector('#notificationCategoryFilter');
    const coachingOption = document.createElement('option');
    coachingOption.value = 'coaching';
    coachingOption.textContent = '\u0627\u0644\u062a\u062f\u0631\u064a\u0628';
    categoryFilter.appendChild(coachingOption);
    trigger.addEventListener('click', () => toggle());
    refreshButton.addEventListener('click', () => void load());
    categoryFilter.addEventListener('change', () => { state.category = categoryFilter.value; state.loaded = false; state.page = 1; void load(); });
    markAllButton.addEventListener('click', () => void markAllRead());
    loadMoreButton.addEventListener('click', () => void load({ append: true }));
    document.addEventListener('click', (event) => { if (state.open && !root.contains(event.target)) toggle(false); });
  }

  window.topGymNotificationCenter = { refresh: () => load(), toggle };
  const host = document.querySelector('.topbar-quick-actions, .platform-topbar-actions, .trainer-workspace-actions, .portal-notification-host');
  if (host) {
    create(host);
    void load();
  }
})();
