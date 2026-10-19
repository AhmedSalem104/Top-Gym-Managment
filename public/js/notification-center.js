(() => {
  'use strict';

  if (window.topGymNotificationCenter) return;

  const state = {
    open: false,
    loaded: false,
    loading: false,
    loadingMore: false,
    unread: 0,
    page: 1,
    hasNext: false,
    category: '',
    items: []
  };
  const i18n = () => window.TopGymI18n;
  function t(key, arabicFallback, params = {}) {
    const fullKey = `notificationCenter.${key}`;
    const translated = i18n()?.t(fullKey, params);
    if (translated && translated !== fullKey) return translated;
    return String(arabicFallback).replace(/\{\{\s*([\w.-]+)\s*\}\}/gu, (match, name) => (
      Object.prototype.hasOwnProperty.call(params, name)
        ? (name === 'count' && typeof params[name] === 'number'
          ? (i18n()?.format('number', params[name]) || String(params[name]))
          : String(params[name]))
        : match
    ));
  }
  const locale = () => i18n()?.get?.() || (document.documentElement.lang?.startsWith('en') ? 'en' : 'ar');
  const messageState = { key: '', fallback: '', className: 'notification-center-empty', params: {} };
  const categoryMeta = {
    coaching: { key: 'category.coaching', label: 'التدريب', tone: 'info', icon: 'coaching' },
    registration: { key: 'category.registration', label: 'التسجيل', tone: 'info', icon: 'registration' },
    membership: { key: 'category.membership', label: 'العضويات', tone: 'success', icon: 'membership' },
    attendance: { key: 'category.attendance', label: 'الحضور والانصراف', tone: 'info', icon: 'attendance' },
    payment: { key: 'category.payment', label: 'المدفوعات', tone: 'warning', icon: 'payment' },
    system: { key: 'category.system', label: 'النظام', tone: 'neutral', icon: 'system' },
    default: { key: 'category.default', label: 'تنبيه', tone: 'neutral', icon: 'default' }
  };
  categoryMeta.subscription = { key: 'category.subscription', label: 'الاشتراكات', tone: 'warning', icon: 'subscription' };
  Object.freeze(categoryMeta);
  const iconPaths = Object.freeze({
    registration: '<path d="M12 5v14M5 12h14"/>',
    subscription: '<path d="M7 4h10v16H7z"/><path d="M9 8h6M9 12h6M9 16h4"/>',
    membership: '<path d="M7 4h10v16H7z"/><path d="M9.5 8h5M9.5 12h5M9.5 16h3"/>',
    coaching: '<path d="M4 6h16v12H4z"/><path d="M8 10h8M8 14h5"/>',
    attendance: '<path d="M12 3v9l6 3"/><circle cx="12" cy="12" r="9"/>',
    payment: '<path d="M5 7h14v10H5z"/><path d="M5 10h14M8 14h3"/>',
    system: '<path d="M12 3l8 4.5v9L12 21l-8-4.5v-9L12 3z"/><path d="M12 8v5M12 16h.01"/>',
    default: '<path d="M18 9a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"/>'
  });
  const eventTitles = Object.freeze({
    member_created: ['event.memberCreated', 'تمت إضافة المشترك'],
    membership_created: ['event.membershipCreated', 'تم إنشاء اشتراك'],
    membership_frozen: ['event.membershipFrozen', 'تم تجميد العضوية'],
    membership_resumed: ['event.membershipResumed', 'تم استئناف العضوية'],
    membership_renewed: ['event.membershipRenewed', 'تم تجديد العضوية'],
    membership_updated: ['event.membershipUpdated', 'تم تحديث العضوية'],
    payment_updated: ['event.paymentUpdated', 'تم تحديث الدفع'],
    attendance_checked_in: ['event.attendanceCheckedIn', 'تم تسجيل حضور'],
    attendance_auto_checked_out: ['event.attendanceAutoCheckedOut', 'تم تسجيل الانصراف تلقائيًا'],
    member_subscription_request_created: ['event.subscriptionRequestCreated', 'تم استلام طلب اشتراك'],
    member_subscription_request_approved: ['event.subscriptionRequestApproved', 'تم قبول طلب الاشتراك'],
    member_subscription_request_rejected: ['event.subscriptionRequestRejected', 'تم رفض طلب الاشتراك'],
    trainer_session_scheduled: ['event.trainerSessionScheduled', 'تم جدولة جلسة تدريب'],
    trainer_session_updated: ['event.trainerSessionUpdated', 'تم تحديث جلسة التدريب'],
    trainer_session_status_changed: ['event.trainerSessionStatusChanged', 'تغيرت حالة جلسة التدريب'],
    trainer_plan_published: ['event.trainerPlanPublished', 'تم نشر خطة تدريب'],
    system_announcement: ['event.systemAnnouncement', 'إعلان جديد']
  });
  let root;
  let panel;
  let list;
  let badge;
  let markAllButton;
  let refreshButton;
  let loadMoreButton;
  let triggerElement;
  let closeButton;
  let mobileLayer;
  let endOfListElement;
  let summaryElement;
  let apiBase = '/api/notifications';
  let realtimeSource;
  let realtimeReconnectTimer;
  let sessionReady = false;
  let authBootstrapPromise;
  let liveToast;
  let liveToastItem;
  let liveToastTimer;
  let bodyOverflowBeforeOpen = '';
  let focusBeforeOpen = null;
  let mobileViewportQuery;

  const formatDate = (value) => {
    if (!value) return '';
    const date = new Date(value);
    const dateLocale = locale() === 'en' ? 'en-EG' : 'ar-EG';
    return Number.isNaN(date.getTime()) ? '' : (i18n()?.format('date', date.toISOString(), { dateStyle: 'medium', timeStyle: 'short' })
      || new Intl.DateTimeFormat(dateLocale, { dateStyle: 'medium', timeStyle: 'short' }).format(date));
  };

  function setBadge(value) {
    state.unread = Math.max(0, Number(value) || 0);
    if (badge) {
      badge.textContent = state.unread > 99 ? '99+' : String(state.unread);
      badge.hidden = state.unread === 0;
    }
    if (summaryElement) {
      summaryElement.textContent = state.unread
        ? t('status.unreadCount', '{{count}} غير مقروءة', { count: state.unread })
        : t('status.allRead', 'كل التنبيهات مقروءة');
    }
    if (markAllButton) markAllButton.disabled = state.unread === 0 || state.loading;
  }

  function notificationCopy(item) {
    const type = String(item?.type || '').trim().toLowerCase();
    const originalMessage = String(item?.message || '').trim();
    const technical = originalMessage.match(/^Notification emitted for ([a-z0-9_-]+)\.\s*:?[ \t]*(.*)$/i);
    if (technical) {
      const key = type || technical[1].toLowerCase();
      const event = eventTitles[key];
      const detail = technical[2].trim();
      const label = event ? t(event[0], event[1]) : t('event.generic', 'إشعار جديد');
      const title = detail
        ? t(key === 'membership_created' ? 'event.withMembershipName' : 'event.withName',
          key === 'membership_created' ? '{{title}} لـ{{name}}' : '{{title}} {{name}}', { title: label, name: detail })
        : label;
      return { title, message: '' };
    }

    const suppliedTitle = String(item?.title || '').trim();
    const safeTitle = suppliedTitle && !/^[a-z][a-z0-9_-]+$/i.test(suppliedTitle)
      ? suppliedTitle
      : (eventTitles[type] ? t(eventTitles[type][0], eventTitles[type][1]) : t('event.generic', 'إشعار جديد'));
    const safeMessage = originalMessage && !/^Notification emitted for\b/i.test(originalMessage)
      ? originalMessage
      : '';
    return { title: safeTitle, message: safeMessage };
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
    const copy = notificationCopy(item);
    title.textContent = copy.title || t('event.generic', 'إشعار جديد');
    const message = document.createElement('span');
    message.className = 'notification-center-live-toast-message';
    message.textContent = item.message || '';
    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'notification-center-live-toast-close';
    close.setAttribute('aria-label', t('action.closeNotification', 'إغلاق الإشعار'));
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
    liveToastItem = item;
    liveToastTimer = window.setTimeout(() => {
      toast.remove();
      if (liveToast === toast) {
        liveToast = null;
        liveToastItem = null;
      }
    }, 6500);
  }

  function getCategoryMeta(item) {
    const key = String(item?.category || item?.type || '').trim().toLowerCase();
    const meta = categoryMeta[key] || categoryMeta.default;
    return { ...meta, label: t(meta.key, meta.label) };
  }

  function iconMarkup(kind) {
    return `<svg class="notification-center-icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${iconPaths[kind] || iconPaths.default}</svg>`;
  }

  function setMessage(text, className = 'notification-center-empty', key = '', fallback = text, params = {}) {
    if (!list) return;
    messageState.key = key;
    messageState.fallback = fallback;
    messageState.className = className;
    messageState.params = params;
    list.replaceChildren();
    const message = document.createElement('div');
    message.className = className;
    message.textContent = key ? t(key, fallback, params) : text;
    list.appendChild(message);
  }

  function refreshLocale() {
    if (!root || !panel) return;
    panel.dir = locale() === 'en' ? 'ltr' : 'rtl';
    const setLabel = (selector, key, fallback, attribute = 'textContent') => {
      const element = panel.querySelector(selector);
      if (element) {
        if (attribute === 'textContent') element.textContent = t(key, fallback);
        else element.setAttribute(attribute, t(key, fallback));
      }
    };
    triggerElement?.setAttribute('aria-label', t('trigger.label', 'الإشعارات'));
    triggerElement?.setAttribute('title', t('trigger.title', 'الإشعارات'));
    panel.setAttribute('aria-label', t('panel.label', 'الإشعارات'));
    setLabel('.notification-center-heading h2', 'panel.title', 'الإشعارات');
    setLabel('.notification-center-heading small', 'panel.description', 'آخر المستجدات في حسابك');
    setLabel('[data-notification-close]', 'action.closePanel', 'إغلاق الإشعارات', 'aria-label');
    setLabel('[data-notification-close]', 'action.close', 'إغلاق', 'title');
    setLabel('.notification-center-filter-label', 'filter.label', 'تصفية الإشعارات');
    const filter = panel.querySelector('.notification-center-filter');
    if (filter) {
      const labels = {
        '': ['filter.all', 'كل الإشعارات'],
        registration: ['category.registration', 'التسجيل'],
        membership: ['category.membership', 'العضويات'],
        payment: ['category.payment', 'المدفوعات'],
        system: ['category.system', 'النظام'],
        coaching: ['category.coaching', 'التدريب'],
        subscription: ['category.subscription', 'الاشتراكات']
      };
      [...filter.querySelectorAll('[data-notification-category]')].forEach((choice) => {
        const [key, fallback] = labels[choice.dataset.notificationCategory] || ['filter.all', 'كل الإشعارات'];
        choice.textContent = t(key, fallback);
        const selected = choice.dataset.notificationCategory === state.category;
        choice.setAttribute('aria-checked', String(selected));
        choice.tabIndex = selected ? 0 : -1;
      });
      filter.querySelector('[aria-checked="true"]')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    }
    setLabel('[data-notification-refresh]', 'action.refreshAccessible', 'تحديث الإشعارات', 'aria-label');
    setLabel('[data-notification-refresh]', 'action.refresh', 'تحديث', 'title');
    setLabel('[data-notification-read-all] span', 'action.markAllRead', 'تمييز الكل كمقروء');
    setLabel('[data-notification-more]', state.loadingMore ? 'state.loadingMore' : 'action.loadMore',
      state.loadingMore ? 'جارٍ تحميل المزيد…' : 'تحميل المزيد');
    setLabel('[data-notification-end]', 'state.endOfList', 'وصلت إلى نهاية الإشعارات');
    setBadge(state.unread);
    if (state.items.length) renderNotifications(state.items);
    else if (messageState.key) setMessage('', messageState.className, messageState.key, messageState.fallback, messageState.params);
    if (liveToast && liveToastItem) {
      const copy = notificationCopy(liveToastItem);
      const title = liveToast.querySelector('.notification-center-live-toast-title');
      const close = liveToast.querySelector('.notification-center-live-toast-close');
      if (title) title.textContent = copy.title || t('event.generic', 'إشعار جديد');
      close?.setAttribute('aria-label', t('action.closeNotification', 'إغلاق الإشعار'));
    }
  }

  function renderNotifications(items = []) {
    if (!list) return;
    list.replaceChildren();
    if (!items.length) {
      setMessage('', 'notification-center-empty', 'state.empty', 'لا توجد إشعارات جديدة.');
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
        unread.setAttribute('aria-label', t('status.unread', 'غير مقروء'));
        heading.appendChild(unread);
      }

      const actionUrl = safeActionUrl(item.actionUrl);
      const content = document.createElement(actionUrl ? 'a' : 'div');
      content.className = 'notification-center-item-link';
      if (actionUrl) content.href = actionUrl;
      const copy = notificationCopy(item);
      const title = document.createElement('strong');
      title.className = 'notification-center-item-title';
      title.textContent = copy.title;
      const message = document.createElement('span');
      message.className = 'notification-center-item-message';
      message.textContent = copy.message;
      message.hidden = !copy.message;
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
        readButton.setAttribute('aria-label', t('action.markReadAccessible', 'تمييز الإشعار كمقروء'));
        readButton.title = t('action.markRead', 'تمييز كمقروء');
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

  function authenticatedUser() {
    const ready = window.topGymAuthReady;
    if (ready && typeof ready.then === 'function') {
      if (!authBootstrapPromise) {
        authBootstrapPromise = Promise.resolve(ready).then((user) => user || null).catch(() => null);
      }
      return authBootstrapPromise;
    }
    // Platform Admin has a deliberately separate auth shell and does not
    // load auth-ui.js. Resolve its current user at call time so the first
    // unauthenticated render stays quiet while a later successful login can
    // refresh notifications without a page reload.
    return Promise.resolve(
      window.topGymAuth?.getUser?.()
      || window.topGymPlatformAdminAuth?.getUser?.()
      || null
    );
  }

  async function ensureNotificationSession() {
    const user = await authenticatedUser();
    const usable = Boolean(user) && user.mustChangePassword !== true;
    sessionReady = usable;
    if (!usable) {
      state.loaded = true;
      if (realtimeSource) {
        realtimeSource.close();
        realtimeSource = null;
      }
      setMessage('', 'notification-center-empty', 'state.signIn', 'سجّل الدخول لعرض إشعاراتك.');
    }
    return usable;
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
    if (!(await ensureNotificationSession())) return;
    if (state.loading) return;
    state.loading = true;
    state.loadingMore = append;
    if (loadMoreButton && append) {
      loadMoreButton.disabled = true;
      loadMoreButton.setAttribute('aria-busy', 'true');
      loadMoreButton.textContent = t('state.loadingMore', 'جارٍ تحميل المزيد…');
    }
    if (markAllButton) markAllButton.disabled = true;
    if (!append) setMessage('', 'notification-center-loading', 'state.loading', 'جاري تحميل الإشعارات...');
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
        setMessage('', 'notification-center-empty', 'state.signIn', 'سجّل الدخول لعرض إشعاراتك.');
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
      if (!state.hasNext && state.items.length) {
        endOfListElement.hidden = false;
      } else {
        endOfListElement.hidden = true;
      }
      state.loaded = true;
      startRealtime();
      try { await refreshUnread(); } catch (_) { /* list remains usable */ }
    } catch (_) {
      setMessage('', 'notification-center-error', 'state.loadError', 'تعذر تحميل الإشعارات. حاول مرة أخرى.');
    } finally {
      state.loading = false;
      state.loadingMore = false;
      if (loadMoreButton) {
        loadMoreButton.disabled = false;
        loadMoreButton.removeAttribute('aria-busy');
        loadMoreButton.textContent = t('action.loadMore', 'تحميل المزيد');
      }
      if (markAllButton) markAllButton.disabled = state.unread === 0;
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
    if (state.unread === 0 || state.loading) return;
    if (markAllButton) markAllButton.disabled = true;
    try {
      const payload = await requestJson(apiPath('/read-all'), { method: 'POST' });
      if (payload) {
        state.items = state.items.map((item) => ({ ...item, read: true }));
        renderNotifications(state.items);
        setBadge(0);
      }
    } catch (_) { /* keep the panel usable */ }
    finally { if (markAllButton) markAllButton.disabled = state.unread === 0; }
  }

  function movePanelToMobileLayer() {
    if (!mobileLayer) {
      mobileLayer = document.createElement('div');
      mobileLayer.className = 'notification-center-mobile-layer';
      mobileLayer.hidden = true;
      mobileLayer.setAttribute('data-notification-modal-layer', '');
      mobileLayer.addEventListener('click', (event) => {
        if (event.target === mobileLayer) toggle(false);
      });
    }
    document.body.appendChild(mobileLayer);
    mobileLayer.appendChild(panel);
    mobileLayer.hidden = false;
    panel.setAttribute('aria-modal', 'true');
  }

  function returnPanelToTrigger() {
    if (root && panel && panel.parentElement !== root) root.appendChild(panel);
    if (mobileLayer) {
      mobileLayer.hidden = true;
      mobileLayer.remove();
    }
    panel?.setAttribute('aria-modal', 'false');
  }

  function toggle(open = !state.open) {
    const nextOpen = Boolean(open);
    if (nextOpen === state.open) return;
    if (nextOpen) {
      focusBeforeOpen = document.activeElement;
      if (mobileViewportQuery?.matches) movePanelToMobileLayer();
      bodyOverflowBeforeOpen = document.body.style.overflow;
      if (mobileViewportQuery?.matches) document.body.style.overflow = 'hidden';
    } else {
      returnPanelToTrigger();
      document.body.style.overflow = bodyOverflowBeforeOpen;
    }
    state.open = nextOpen;
    root.classList.toggle('is-open', state.open);
    panel.hidden = !state.open;
    triggerElement?.setAttribute('aria-expanded', String(state.open));
    if (state.open) {
      (mobileViewportQuery?.matches ? closeButton : panel.querySelector('select, button, a'))?.focus({ preventScroll: true });
      if (!state.loaded) void load();
    } else if (focusBeforeOpen?.isConnected) {
      focusBeforeOpen.focus({ preventScroll: true });
      focusBeforeOpen = null;
    }
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
    trigger.setAttribute('title', 'الإشعارات');
    trigger.setAttribute('aria-expanded', 'false');
    trigger.setAttribute('aria-controls', 'notificationCenterPanel');
    trigger.innerHTML = '<svg class="ui-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 9a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"/></svg>';
    badge = document.createElement('span');
    badge.className = 'notification-center-badge';
    badge.hidden = true;
    badge.setAttribute('aria-live', 'polite');
    trigger.appendChild(badge);

    panel = document.createElement('section');
    panel.id = 'notificationCenterPanel';
    panel.className = 'notification-center-panel';
    panel.hidden = true;
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-modal', 'false');
    panel.setAttribute('aria-label', 'الإشعارات');
    panel.tabIndex = -1;
    panel.innerHTML = `
      <header class="notification-center-head">
        <div class="notification-center-heading"><h2>الإشعارات</h2><small>آخر المستجدات في حسابك</small></div>
        <button type="button" class="notification-center-icon-button notification-center-close" data-notification-close aria-label="إغلاق الإشعارات" title="إغلاق">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg>
        </button>
      </header>
      <div class="notification-center-toolbar">
        <div class="notification-center-toolbar-summary">
          <span class="notification-center-summary" data-notification-summary>كل التنبيهات مقروءة</span>
          <button type="button" class="notification-center-icon-button" data-notification-refresh aria-label="تحديث الإشعارات" title="تحديث">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 11a8 8 0 0 0-14.5-4.7L4 8"/><path d="M4 4v4h4"/><path d="M4 13a8 8 0 0 0 14.5 4.7L20 16"/><path d="M20 20v-4h-4"/></svg>
          </button>
        </div>
        <span class="notification-center-filter-label" id="notificationCategoryFilterLabel">تصفية الإشعارات</span>
        <div id="notificationCategoryFilter" class="notification-center-filter logicfit-filter-choices logicfit-filter-choices--wrap" role="radiogroup" aria-labelledby="notificationCategoryFilterLabel">
          <button type="button" class="logicfit-filter-choice" role="radio" aria-checked="true" tabindex="0" data-notification-category="">كل الإشعارات</button>
          <button type="button" class="logicfit-filter-choice" role="radio" aria-checked="false" tabindex="-1" data-notification-category="registration">التسجيل</button>
          <button type="button" class="logicfit-filter-choice" role="radio" aria-checked="false" tabindex="-1" data-notification-category="membership">العضويات</button>
          <button type="button" class="logicfit-filter-choice" role="radio" aria-checked="false" tabindex="-1" data-notification-category="payment">المدفوعات</button>
          <button type="button" class="logicfit-filter-choice" role="radio" aria-checked="false" tabindex="-1" data-notification-category="system">النظام</button>
          <button type="button" class="logicfit-filter-choice" role="radio" aria-checked="false" tabindex="-1" data-notification-category="coaching">التدريب</button>
          <button type="button" class="logicfit-filter-choice" role="radio" aria-checked="false" tabindex="-1" data-notification-category="subscription">الاشتراكات</button>
        </div>
      </div>
      <div class="notification-center-list" data-notification-list role="list" aria-live="polite"><div class="notification-center-empty">افتح المركز لعرض الإشعارات.</div></div>
      <footer class="notification-center-footer">
        <div class="notification-center-footer-pagination"><button type="button" class="notification-center-action" data-notification-more hidden>تحميل المزيد</button><span class="notification-center-end" data-notification-end hidden>وصلت إلى نهاية الإشعارات</span></div>
        <button type="button" class="notification-center-action notification-center-read-all" data-notification-read-all><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4 4L19 7"/></svg><span>تمييز الكل كمقروء</span></button>
      </footer>`;
    root.append(trigger, panel);
    host.prepend(root);

    list = panel.querySelector('[data-notification-list]');
    summaryElement = panel.querySelector('[data-notification-summary]');
    markAllButton = panel.querySelector('[data-notification-read-all]');
    refreshButton = panel.querySelector('[data-notification-refresh]');
    loadMoreButton = panel.querySelector('[data-notification-more]');
    endOfListElement = panel.querySelector('[data-notification-end]');
    closeButton = panel.querySelector('[data-notification-close]');
    const categoryFilter = panel.querySelector('#notificationCategoryFilter');
    refreshLocale();
    window.addEventListener('topgym:localechange', refreshLocale);
    trigger.addEventListener('click', () => toggle());
    closeButton.addEventListener('click', () => toggle(false));
    refreshButton.addEventListener('click', () => void load());
    categoryFilter.addEventListener('click', (event) => {
      const choice = event.target.closest('[data-notification-category]');
      if (!choice || !categoryFilter.contains(choice) || choice.dataset.notificationCategory === state.category) return;
      state.category = choice.dataset.notificationCategory;
      state.loaded = false;
      state.page = 1;
      refreshLocale();
      void load();
    });
    categoryFilter.addEventListener('keydown', (event) => {
      const choices = [...categoryFilter.querySelectorAll('[data-notification-category]')];
      const currentIndex = choices.indexOf(event.target);
      if (currentIndex < 0) return;
      const rtl = panel.dir === 'rtl' || (!panel.dir && document.documentElement.dir === 'rtl');
      const forwardKey = rtl ? 'ArrowLeft' : 'ArrowRight';
      const backwardKey = rtl ? 'ArrowRight' : 'ArrowLeft';
      let nextIndex = currentIndex;
      if (event.key === forwardKey) nextIndex = (currentIndex + 1) % choices.length;
      else if (event.key === backwardKey) nextIndex = (currentIndex - 1 + choices.length) % choices.length;
      else if (event.key === 'Home') nextIndex = 0;
      else if (event.key === 'End') nextIndex = choices.length - 1;
      else return;
      event.preventDefault();
      choices[nextIndex].focus();
      choices[nextIndex].click();
    });
    markAllButton.addEventListener('click', () => void markAllRead());
    loadMoreButton.addEventListener('click', () => void load({ append: true }));
    mobileViewportQuery = window.matchMedia('(max-width: 640px)');
    mobileViewportQuery.addEventListener?.('change', (event) => {
      if (!state.open) return;
      if (event.matches) {
        bodyOverflowBeforeOpen = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        movePanelToMobileLayer();
      } else {
        returnPanelToTrigger();
        document.body.style.overflow = bodyOverflowBeforeOpen;
      }
    });
    document.addEventListener('keydown', (event) => {
      if (!state.open) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        toggle(false);
        return;
      }
      if (event.key !== 'Tab' || !mobileViewportQuery?.matches) return;
      const focusable = [...panel.querySelectorAll('button:not([disabled]), select:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])')]
        .filter((element) => !element.hidden && element.getClientRects().length);
      if (!focusable.length) {
        event.preventDefault();
        panel.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && (document.activeElement === first || !panel.contains(document.activeElement))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (document.activeElement === last || !panel.contains(document.activeElement))) {
        event.preventDefault();
        first.focus();
      }
    });
    document.addEventListener('click', (event) => {
      if (state.open && !root.contains(event.target) && !panel.contains(event.target)) toggle(false);
    });
  }

  window.topGymNotificationCenter = { refresh: () => load(), toggle };
  const host = document.querySelector('.topbar-quick-actions, .platform-topbar-actions, .trainer-workspace-actions, .portal-notification-host');
  if (host) {
    create(host);
    const initialize = () => void load();
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initialize, { once: true });
    else initialize();
  }
})();
