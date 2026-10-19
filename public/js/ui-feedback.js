(() => {
    'use strict';

    if (window.LogicFitFeedback) return;

    const activeButtons = new WeakMap();
    const iconMarkup = Object.freeze({
        success: '<svg class="ui-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m5 12 4 4L19 6"/></svg>',
        error: '<svg class="ui-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m7 7 10 10M17 7 7 17"/></svg>',
        warning: '<svg class="ui-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3 2.5 20h19L12 3Z"/><path d="M12 9v4M12 17h.01"/></svg>',
        info: '<svg class="ui-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 10v6M12 7h.01"/></svg>'
    });

    function text(value) {
        return String(value ?? '').replace(/\s+/g, ' ').trim();
    }

    function inferLoadingText(button, fallback = 'جاري التنفيذ...') {
        const explicit = text(button?.dataset?.loadingText || button?.dataset?.feedbackLoadingText);
        if (explicit) return explicit;
        const label = text(button?.getAttribute?.('aria-label') || button?.textContent);
        if (/تسجيل الدخول|دخول|login/i.test(label)) return 'جاري تسجيل الدخول...';
        if (/تسجيل الحضور|check.?in/i.test(label)) return 'جاري تسجيل الحضور...';
        if (/تسجيل الانصراف|check.?out/i.test(label)) return 'جاري تسجيل الانصراف...';
        if (/إنشاء.*نسخ|نسخة.*محفوظة|backup/i.test(label)) return 'جاري إنشاء النسخة...';
        if (/استرجاع|restore/i.test(label)) return 'جاري الاسترجاع...';
        if (/رفع|upload/i.test(label)) return 'جاري رفع الملف...';
        if (/اعتماد|قبول|approve/i.test(label)) return 'جاري اعتماد الطلب...';
        if (/رفض|reject/i.test(label)) return 'جاري رفض الطلب...';
        if (/حذف|delete/i.test(label)) return 'جاري الحذف...';
        if (/تحديث|refresh/i.test(label)) return 'جاري التحديث...';
        if (/بحث|search/i.test(label)) return 'جاري البحث...';
        if (/إرسال|ارسال|send/i.test(label)) return 'جاري الإرسال...';
        if (/إضافة|اضافة|إنشاء|انشاء|create/i.test(label)) return 'جاري الإضافة...';
        if (/حفظ|save/i.test(label)) return 'جاري الحفظ...';
        if (/تعديل|تطبيق|apply|update/i.test(label)) return 'جاري تطبيق التغييرات...';
        if (/طباعة|print|تنزيل|download/i.test(label)) return 'جاري التجهيز...';
        return fallback;
    }

    function ensureLiveRegion() {
        let region = document.querySelector('[data-logicfit-live]');
        if (region) return region;
        region = document.createElement('div');
        region.dataset.logicfitLive = 'true';
        region.setAttribute('aria-live', 'polite');
        region.setAttribute('aria-atomic', 'true');
        region.className = 'visually-hidden';
        document.body.appendChild(region);
        return region;
    }

    function announce(message) {
        const region = ensureLiveRegion();
        region.textContent = '';
        window.requestAnimationFrame(() => { region.textContent = text(message); });
    }

    function ensureToastHost() {
        const existing = document.getElementById('toast');
        if (existing) return existing;
        let host = document.querySelector('[data-logicfit-toast-stack]');
        if (host) return host;
        host = document.createElement('div');
        host.dataset.logicfitToastStack = 'true';
        host.className = 'logicfit-feedback-toast-stack';
        host.setAttribute('aria-live', 'polite');
        host.setAttribute('aria-relevant', 'additions text');
        document.body.appendChild(host);
        return host;
    }

    function toast(message, type = 'info', detail = '') {
        const kind = ['success', 'error', 'warning', 'info'].includes(type) ? type : 'info';
        const safeMessage = text(message) || 'تم تحديث الحالة.';
        // The main application already owns its richer Toast/Dialog bridge.
        if (typeof window.showToast === 'function' && !window.showToast.__logicFitFeedback) {
            window.showToast(detail ? `${safeMessage} — ${text(detail)}` : safeMessage, kind === 'error', kind);
            announce(safeMessage);
            return null;
        }
        const host = ensureToastHost();
        const item = document.createElement('div');
        item.className = `toast-item logicfit-feedback-toast ${kind}`;
        item.setAttribute('role', kind === 'error' ? 'alert' : 'status');
        item.innerHTML = `<span class="toast-icon" aria-hidden="true">${iconMarkup[kind]}</span><span class="toast-message"></span><button class="toast-close" type="button" aria-label="إغلاق">×</button>`;
        const messageElement = item.querySelector('.toast-message');
        if (messageElement) messageElement.textContent = detail ? `${safeMessage} — ${text(detail)}` : safeMessage;
        host.appendChild(item);
        host.classList.add('show');
        let timer = window.setTimeout(close, kind === 'error' ? 5600 : 3600);
        function close() {
            if (item.dataset.closed) return;
            item.dataset.closed = 'true';
            window.clearTimeout(timer);
            item.classList.add('is-leaving');
            window.setTimeout(() => {
                item.remove();
                if (!host.children.length) host.classList.remove('show');
            }, 180);
        }
        item.querySelector('.toast-close')?.addEventListener('click', close);
        announce(safeMessage);
        return close;
    }

    function start(button, options = {}) {
        if (!button || typeof button !== 'object') return null;
        const current = activeButtons.get(button);
        if (current) return current;
        const rect = typeof button.getBoundingClientRect === 'function' ? button.getBoundingClientRect() : null;
        const record = {
            button,
            originalHtml: button.innerHTML,
            originalDisabled: Boolean(button.disabled),
            originalMinWidth: button.style?.minWidth || '',
            originalWidth: button.style?.width || '',
            originalBoxSizing: button.style?.boxSizing || '',
            originalAriaLabel: button.getAttribute?.('aria-label'),
            originalLoading: button.getAttribute?.('data-loading'),
            originalFeedbackLoading: button.getAttribute?.('data-feedback-loading'),
            stopped: false,
            successTimer: null
        };
        const loadingText = inferLoadingText(button, options.loadingText || 'جاري التنفيذ...');
        activeButtons.set(button, record);
        button.dataset.feedbackLoading = 'true';
        button.dataset.loading = 'true';
        button.classList.add('is-loading');
        button.setAttribute('aria-busy', 'true');
        button.setAttribute('aria-label', loadingText);
        button.disabled = true;
        if (rect?.width > 0 && !options.allowLayoutShift) {
            // min-width alone is content-box sized, so replacing a text label
            // with the spinner/feedback label can still widen the button by
            // its padding and border. Lock the measured outer width instead.
            button.style.boxSizing = 'border-box';
            button.style.width = `${rect.width}px`;
        }
        button.innerHTML = `<span class="logicfit-button-spinner" aria-hidden="true"></span><span class="logicfit-button-label"></span>`;
        button.querySelector('.logicfit-button-label').textContent = loadingText;
        announce(loadingText);
        return record;
    }

    function stop(button, options = {}) {
        const record = button && activeButtons.get(button);
        if (!record || record.stopped) return;
        record.stopped = true;
        window.clearTimeout(record.successTimer);
        activeButtons.delete(button);
        releaseLegacyBridge(button, record);
        if (options.successText) {
            button.classList.add('is-success');
            button.innerHTML = `<span class="logicfit-button-success" aria-hidden="true">${iconMarkup.success}</span><span class="logicfit-button-label"></span>`;
            button.querySelector('.logicfit-button-label').textContent = options.successText;
            announce(options.successText);
            record.successTimer = window.setTimeout(() => restore(button, record), Math.max(250, Number(options.successDuration) || 900));
            return;
        }
        restore(button, record);
    }

    function releaseLegacyBridge(button, record) {
        const bridgeRecord = button?.__topGymLoading;
        if (!bridgeRecord || bridgeRecord !== record) return;
        bridgeRecord.stopped = true;
        window.clearTimeout(bridgeRecord.finishTimer);
        window.clearTimeout(bridgeRecord.safetyTimer);
        delete button.__topGymLoading;
        if (button.form?.__topGymLoadingButton === button) delete button.form.__topGymLoadingButton;
    }

    function restore(button, record) {
        if (!button || !record) return;
        button.innerHTML = record.originalHtml;
        button.classList.remove('is-loading', 'is-success');
        button.removeAttribute('aria-busy');
        if (record.originalLoading == null) delete button.dataset.loading;
        else button.setAttribute('data-loading', record.originalLoading);
        if (record.originalFeedbackLoading == null) delete button.dataset.feedbackLoading;
        else button.setAttribute('data-feedback-loading', record.originalFeedbackLoading);
        button.disabled = record.originalDisabled;
        button.style.minWidth = record.originalMinWidth;
        button.style.width = record.originalWidth;
        button.style.boxSizing = record.originalBoxSizing;
        if (record.originalAriaLabel == null) button.removeAttribute('aria-label');
        else button.setAttribute('aria-label', record.originalAriaLabel);
    }

    async function run(button, task, options = {}) {
        const record = start(button, options);
        if (!record) return { skipped: true };
        try {
            const result = await task();
            if (options.successMessage) toast(options.successMessage, 'success');
            if (options.successText) stop(button, { successText: options.successText, successDuration: options.successDuration });
            else stop(button);
            return result;
        } catch (error) {
            if (options.errorMessage) toast(options.errorMessage, 'error');
            stop(button);
            throw error;
        }
    }

    const filterChoiceIds = new Set(['statusFilter', 'attendanceStatusFilter', 'platformRequestStatus', 'requestStatusFilter', 'gymRegistrationStatusFilter', 'tenantStatusFilter', 'memberSubscriptionRequestStatus', 'reportsMembershipStatus', 'reportsCoachingStatus', 'memberFeedbackTypeFilter', 'tenantTypeFilter']);
    const filterTone = (value) => {
        const normalized = String(value || '').toLowerCase();
        if (!normalized) return 'neutral';
        if (/expired|rejected|cancelled|failed|inactive|suspended/.test(normalized)) return 'danger';
        if (/active|approved|inside|completed|success/.test(normalized)) return 'success';
        if (/pending|expiring|paused|frozen|review/.test(normalized)) return 'warning';
        if (/^all$|checked_out|archived|draft/.test(normalized)) return 'neutral';
        return 'primary';
    };

    function syncFilterChoices(select, group) {
        if (!select?.isConnected || !group?.isConnected) return;
        group.replaceChildren(...[...select.options].map((option, index) => {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'logicfit-filter-choice';
            button.setAttribute('role', 'radio');
            button.setAttribute('aria-checked', String(option.value === select.value));
            button.tabIndex = option.value === select.value || (!select.value && index === 0) ? 0 : -1;
            button.dataset.filterValue = option.value;
            button.dataset.filterTone = filterTone(option.value);
            button.disabled = option.disabled;
            button.textContent = option.label || option.textContent;
            button.addEventListener('click', () => chooseFilter(select, group, option.value, true));
            button.addEventListener('keydown', (event) => handleFilterKeydown(event, select, group, button));
            return button;
        }));
        group.setAttribute('aria-label', select.getAttribute('aria-label') || select.labels?.[0]?.textContent?.trim() || 'Filter');
    }

    function chooseFilter(select, group, value, dispatch) {
        const changed = select.value !== value;
        select.value = value;
        syncFilterChoices(select, group);
        group.querySelector('[aria-checked="true"]')?.focus({ preventScroll: true });
        if (changed && dispatch) select.dispatchEvent(new Event('change', { bubbles: true }));
    }

    function handleFilterKeydown(event, select, group, button) {
        const enabled = [...group.querySelectorAll('[role="radio"]:not(:disabled)')];
        const index = enabled.indexOf(button);
        let nextIndex = index;
        if (event.key === 'Home') nextIndex = 0;
        else if (event.key === 'End') nextIndex = enabled.length - 1;
        else if (['ArrowRight', 'ArrowDown'].includes(event.key)) nextIndex = (index + (document.documentElement.dir === 'rtl' && event.key === 'ArrowRight' ? -1 : 1) + enabled.length) % enabled.length;
        else if (['ArrowLeft', 'ArrowUp'].includes(event.key)) nextIndex = (index + (document.documentElement.dir === 'rtl' && event.key === 'ArrowLeft' ? 1 : -1) + enabled.length) % enabled.length;
        else return;
        event.preventDefault();
        const target = enabled[nextIndex];
        if (target) chooseFilter(select, group, target.dataset.filterValue, true);
    }

    function enhanceFilter(select) {
        if (!filterChoiceIds.has(select.id) || select.options.length < 2 || select.options.length > 6) return;
        if (select.dataset.filterChoicesReady === 'true') {
            const existing = document.querySelector(`[data-filter-choices-for="${CSS.escape(select.id)}"]`);
            if (existing) syncFilterChoices(select, existing);
            return;
        }
        select.dataset.filterChoicesReady = 'true';
        select.classList.add('logicfit-filter-native-source');
        select.tabIndex = -1;
        select.setAttribute('aria-hidden', 'true');
        const group = document.createElement('div');
        group.className = 'logicfit-filter-choices';
        group.setAttribute('role', 'radiogroup');
        group.setAttribute('aria-orientation', 'horizontal');
        group.dataset.filterChoicesFor = select.id;
        const field = select.closest('label.members-filter-field') || select.closest('label');
        (field || select).insertAdjacentElement('afterend', group);
        select.addEventListener('change', () => syncFilterChoices(select, group));
        new MutationObserver(() => syncFilterChoices(select, group)).observe(select, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ['aria-label'] });
        syncFilterChoices(select, group);
    }

    function hydrateFilterChoices(root = document) {
        if (root.matches?.('select')) enhanceFilter(root);
        root.querySelectorAll?.('select').forEach(enhanceFilter);
    }

    function initializeFilterChoices() {
        hydrateFilterChoices();
        const observer = new MutationObserver((mutations) => mutations.forEach((mutation) => mutation.addedNodes.forEach((node) => {
            if (node.nodeType === Node.ELEMENT_NODE) hydrateFilterChoices(node);
        })));
        observer.observe(document.body, { childList: true, subtree: true });
    }

    window.LogicFitFeedback = Object.freeze({ inferLoadingText, start, stop, run, toast, announce, isLoading: (button) => Boolean(button && activeButtons.has(button)) });
    window.topGymFeedback = window.LogicFitFeedback;
    window.topGymStartButtonLoading = start;
    window.topGymStopButtonLoading = stop;
    window.topGymRunAction = run;
    window.LogicFitFilterChoiceGroup = Object.freeze({ hydrate: hydrateFilterChoices });
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initializeFilterChoices, { once: true });
    else initializeFilterChoices();
    window.addEventListener('topgym:localechange', () => hydrateFilterChoices());
})();
