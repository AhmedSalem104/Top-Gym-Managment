(() => {
  'use strict';

  if (window.topGymNotificationCenter) return;

  const state = { open: false, loaded: false, loading: false, unread: 0, page: 1, hasNext: false, category: '' };
  let root;
  let list;
  let badge;
  let markAllButton;
  let refreshButton;
  let loadMoreButton;
  let triggerElement;

  const formatDate = (value) => {
    if (!value) return '';
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? '' : new Intl.DateTimeFormat('ar-EG-u-ca-gregory', { dateStyle: 'medium', timeStyle: 'short' }).format(date);
  };

  function setBadge(value) {
    state.unread = Math.max(0, Number(value) || 0);
    if (!badge) return;
    badge.textContent = state.unread > 99 ? '99+' : String(state.unread);
    badge.hidden = state.unread === 0;
  }

  function safeActionUrl(value) {
    const candidate = String(value || '').trim();
    return candidate.startsWith('/') && !candidate.startsWith('//') ? candidate : '';
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
      const article = document.createElement('article');
      article.className = `notification-center-item${item.read ? '' : ' is-unread'}`;
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
      const meta = document.createElement('small');
      meta.className = 'notification-center-item-meta';
      meta.textContent = formatDate(item.createdAt);
      content.append(title, message, meta);
      article.appendChild(content);
      if (!item.read) {
        const readButton = document.createElement('button');
        readButton.type = 'button';
        readButton.className = 'notification-center-action';
        readButton.textContent = 'تمييز كمقروء';
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
    const payload = await requestJson('/api/notifications/unread-count');
    if (payload) setBadge(payload.unread);
  }

  async function load({ append = false } = {}) {
    if (state.loading) return;
    state.loading = true;
    if (!append) setMessage('جاري تحميل الإشعارات...');
    try {
      const page = append ? state.page + 1 : 1;
      const params = new URLSearchParams({ page: String(page), pageSize: '8' });
      if (state.category) params.set('category', state.category);
      const payload = await requestJson(`/api/notifications?${params}`);
      if (!payload) {
        setMessage('سجّل الدخول لعرض إشعاراتك.');
        state.loaded = true;
        return;
      }
      const incoming = Array.isArray(payload.notifications) ? payload.notifications : [];
      const current = append ? [...(state.items || []), ...incoming] : incoming;
      state.items = current;
      state.page = page;
      state.hasNext = Boolean(payload.pagination?.hasNext);
      renderNotifications(current);
      loadMoreButton.hidden = !state.hasNext;
      state.loaded = true;
      await refreshUnread();
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
      const payload = await requestJson(`/api/notifications/${numericId}/read`, { method: 'POST' });
      if (payload) {
        state.items = (state.items || []).map((item) => item.id === numericId ? { ...item, read: true } : item);
        renderNotifications(state.items);
        await refreshUnread();
      }
    } catch (_) { /* a later refresh will reconcile the state */ }
  }

  async function markAllRead() {
    if (markAllButton) markAllButton.disabled = true;
    try {
      const payload = await requestJson('/api/notifications/read-all', { method: 'POST' });
      if (payload) {
        state.items = (state.items || []).map((item) => ({ ...item, read: true }));
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
    const trigger = document.createElement('button');
    triggerElement = trigger;
    trigger.type = 'button';
    trigger.className = 'notification-center-trigger';
    trigger.setAttribute('aria-label', 'الإشعارات');
    trigger.setAttribute('aria-expanded', 'false');
    trigger.innerHTML = '<svg class="ui-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 9a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"/></svg>';
    badge = document.createElement('span');
    badge.className = 'notification-center-badge';
    badge.hidden = true;
    badge.setAttribute('aria-live', 'polite');
    trigger.appendChild(badge);
    const panel = document.createElement('section');
    panel.className = 'notification-center-panel';
    panel.hidden = true;
    panel.setAttribute('aria-label', 'مركز الإشعارات');
    panel.innerHTML = '<header class="notification-center-head"><div><h2>الإشعارات</h2><small>آخر التنبيهات الخاصة بحسابك</small></div><button type="button" class="notification-center-action" data-notification-refresh>تحديث</button></header><div class="notification-center-list" data-notification-list><div class="notification-center-empty">افتح المركز لعرض الإشعارات.</div></div><footer class="notification-center-footer"><button type="button" class="notification-center-action" data-notification-more hidden>تحميل المزيد</button><button type="button" class="notification-center-action" data-notification-read-all>تمييز الكل كمقروء</button></footer>';
    root.append(trigger, panel);
    const categoryLabel = document.createElement('label');
    categoryLabel.className = 'visually-hidden';
    categoryLabel.htmlFor = 'notificationCategoryFilter';
    categoryLabel.textContent = 'Filter notifications';
    const categoryFilter = document.createElement('select');
    categoryFilter.id = 'notificationCategoryFilter';
    categoryFilter.className = 'notification-center-filter';
    [['', 'All notifications'], ['registration', 'Registration'], ['system', 'System']].forEach(([value, label]) => {
      const option = document.createElement('option');
      option.value = value;
      option.textContent = label;
      categoryFilter.appendChild(option);
    });
    const headActions = document.createElement('div');
    headActions.className = 'notification-center-head-actions';
    const header = panel.querySelector('.notification-center-head');
    const existingRefresh = panel.querySelector('[data-notification-refresh]');
    if (header && existingRefresh) {
      headActions.append(categoryLabel, categoryFilter, existingRefresh);
      header.appendChild(headActions);
    }
    host.prepend(root);
    list = panel.querySelector('[data-notification-list]');
    markAllButton = panel.querySelector('[data-notification-read-all]');
    refreshButton = panel.querySelector('[data-notification-refresh]');
    loadMoreButton = panel.querySelector('[data-notification-more]');
    trigger.addEventListener('click', () => toggle());
    refreshButton.addEventListener('click', () => void load());
    categoryFilter.addEventListener('change', () => { state.category = categoryFilter.value; state.loaded = false; state.page = 1; void load(); });
    markAllButton.addEventListener('click', () => void markAllRead());
    loadMoreButton.addEventListener('click', () => void load({ append: true }));
    document.addEventListener('click', (event) => { if (state.open && !root.contains(event.target)) toggle(false); });
  }

  window.topGymNotificationCenter = { refresh: () => load(), toggle };
  const host = document.querySelector('.topbar-quick-actions, .platform-topbar-actions, .trainer-workspace-actions');
  if (host) create(host);
})();
