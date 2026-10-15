(() => {
    'use strict';
    if (window.__topGymPortalAnalyticsLoaded) return;
    window.__topGymPortalAnalyticsLoaded = true;

    const $ = (id) => document.getElementById(id);
    const dailyHost = $('portalAnalyticsDaily');
    const rangeSelect = $('portalAnalyticsRange');
    const refreshButton = $('portalAnalyticsRefresh');
    const status = $('portalAnalyticsStatus');
    const rangeLabel = $('portalAnalyticsRangeLabel');
    const state = { days: Number(rangeSelect?.value || 30), loading: false, sequence: 0, result: null, selectedRange: null, statusKey: '' };
    const t = (key, params) => window.TopGymI18n?.t?.(`portalAnalytics.${key}`, params) || key;
    const number = (value) => window.TopGymI18n?.format?.('number', Number(value || 0)) ?? String(Number(value || 0));
    const date = (value) => window.TopGymI18n?.format?.('date', value, { dateStyle: 'medium' }) || String(value ?? '');
    const escapeHtml = (value) => String(value ?? '').replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[character]));

    function setStaticText(selector, key) {
        const element = $('portalAnalyticsSection')?.querySelector(selector);
        if (!element) return;
        const textNode = [...element.childNodes].find((node) => node.nodeType === Node.TEXT_NODE && node.nodeValue.trim());
        if (textNode) textNode.nodeValue = textNode.nodeValue.replace(textNode.nodeValue.trim(), t(key));
        else if (!element.children.length) element.textContent = t(key);
    }

    function applyStaticTranslations() {
        const section = $('portalAnalyticsSection');
        if (!section) return;
        setStaticText('#portalAnalyticsTitle', 'title');
        setStaticText('.portal-analytics-heading > div > p', 'description');
        setStaticText('.portal-analytics-kicker', 'kicker');
        setStaticText('.portal-analytics-actions > label', 'range.label');
        if (!window.topGymFeedback?.isLoading?.(refreshButton)) setStaticText('#portalAnalyticsRefresh > span', 'refresh');
        setStaticText('.portal-analytics-card-views .portal-analytics-card-label', 'card.pageViews');
        setStaticText('.portal-analytics-card-views small', 'card.pageViewsHint');
        setStaticText('.portal-analytics-card-visitors .portal-analytics-card-label', 'card.uniqueVisitors');
        setStaticText('.portal-analytics-card-visitors small', 'card.uniqueVisitorsHint');
        setStaticText('.portal-analytics-card-members .portal-analytics-card-label', 'card.authenticatedMembers');
        setStaticText('.portal-analytics-card-members small', 'card.authenticatedMembersHint');
        setStaticText('.portal-analytics-section-head .portal-analytics-kicker', 'trend.kicker');
        setStaticText('#portalAnalyticsDailyTitle', 'trend.title');
        setStaticText('.portal-analytics-section-head p', 'trend.description');
        for (const days of [7, 30, 90]) {
            const option = rangeSelect?.querySelector(`option[value="${days}"]`);
            if (option) option.textContent = t(`range.${days}`);
        }
        if (refreshButton) refreshButton.dataset.loadingText = t('refresh.loading');
    }

    function localDate(value) {
        const dateValue = new Date(value);
        const year = dateValue.getFullYear();
        const month = String(dateValue.getMonth() + 1).padStart(2, '0');
        const day = String(dateValue.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }

    function range() {
        const end = new Date();
        const start = new Date(end);
        start.setDate(start.getDate() - Math.max(1, state.days - 1));
        return { from: localDate(start), to: localDate(end) };
    }

    function setStatus(message = '', error = false) {
        if (!status) return;
        status.textContent = message;
        status.hidden = !message;
        status.classList.toggle('is-error', error);
    }

    function notify(message, kind = 'info') {
        if (window.topGymFeedback?.toast) window.topGymFeedback.toast(message, kind);
        else if (typeof window.showToast === 'function') window.showToast(message, kind === 'error', kind);
    }

    function buttonLoading(loading) {
        if (!refreshButton) return;
        if (window.topGymFeedback) {
            if (loading && !window.topGymFeedback.isLoading(refreshButton)) window.topGymFeedback.start(refreshButton, { loadingText: t('refresh.loading') });
            else if (loading) {
                const label = refreshButton.querySelector('.logicfit-button-label');
                if (label) label.textContent = t('refresh.loading');
                refreshButton.setAttribute('aria-label', t('refresh.loading'));
            }
            if (!loading) {
                window.topGymFeedback.stop(refreshButton);
                applyStaticTranslations();
            }
            return;
        }
        refreshButton.disabled = loading;
        if (loading) {
            refreshButton.dataset.portalAnalyticsOriginalText = refreshButton.textContent;
            const label = refreshButton.querySelector('span');
            if (label) label.textContent = t('refresh.loading');
            else refreshButton.textContent = t('refresh.loading');
        } else if (refreshButton.dataset.portalAnalyticsOriginalText) {
            const label = refreshButton.querySelector('span');
            if (label) label.textContent = t('refresh');
            else refreshButton.textContent = refreshButton.dataset.portalAnalyticsOriginalText;
            delete refreshButton.dataset.portalAnalyticsOriginalText;
        }
        if (!loading) applyStaticTranslations();
    }

    function renderTotals(totals = {}) {
        $('portalAnalyticsPageViews').textContent = number(totals.pageViews);
        $('portalAnalyticsUniqueVisitors').textContent = number(totals.uniqueVisitors);
        $('portalAnalyticsAuthenticatedMembers').textContent = number(totals.authenticatedMembers);
    }

    function renderDaily(daily = [], mostVisitedDay = null) {
        if (!dailyHost) return;
        if (!daily.length) {
            dailyHost.innerHTML = `<div class="portal-analytics-empty"><strong>${escapeHtml(t('state.empty.title'))}</strong><span>${escapeHtml(t('state.empty.description'))}</span></div>`;
            return;
        }
        const max = Math.max(1, ...daily.flatMap((item) => [Number(item.pageViews || 0), Number(item.uniqueVisitors || 0), Number(item.authenticatedMembers || 0)]));
        dailyHost.innerHTML = `<div class="portal-analytics-legend"><span><i class="portal-bar-key portal-bar-key-views"></i>${escapeHtml(t('series.pageViews'))}</span><span><i class="portal-bar-key portal-bar-key-visitors"></i>${escapeHtml(t('series.uniqueVisitors'))}</span><span><i class="portal-bar-key portal-bar-key-members"></i>${escapeHtml(t('series.authenticatedMembers'))}</span></div><div class="portal-analytics-daily-list">${daily.map((item) => {
            const views = Number(item.pageViews || 0);
            const visitors = Number(item.uniqueVisitors || 0);
            const members = Number(item.authenticatedMembers || 0);
            const viewText = views ? t('day.views', { count: number(views) }) : t('day.noViews');
            return `<article class="portal-analytics-day"><div class="portal-analytics-day-meta"><strong dir="ltr">${escapeHtml(date(item.date))}</strong><span>${escapeHtml(viewText)}</span></div><div class="portal-analytics-bars"><div class="portal-analytics-bar-row"><span>${escapeHtml(t('series.views'))}</span><div class="portal-analytics-bar-track"><i class="portal-analytics-bar portal-analytics-bar-views" style="--portal-bar-size:${Math.min(100, (views / max) * 100)}%"></i></div><strong>${escapeHtml(number(views))}</strong></div><div class="portal-analytics-bar-row"><span>${escapeHtml(t('series.visitors'))}</span><div class="portal-analytics-bar-track"><i class="portal-analytics-bar portal-analytics-bar-visitors" style="--portal-bar-size:${Math.min(100, (visitors / max) * 100)}%"></i></div><strong>${escapeHtml(number(visitors))}</strong></div><div class="portal-analytics-bar-row"><span>${escapeHtml(t('series.members'))}</span><div class="portal-analytics-bar-track"><i class="portal-analytics-bar portal-analytics-bar-members" style="--portal-bar-size:${Math.min(100, (members / max) * 100)}%"></i></div><strong>${escapeHtml(number(members))}</strong></div></div></article>`;
        }).join('')}</div>${mostVisitedDay ? `<p class="portal-analytics-highlight">${escapeHtml(t('highlight.mostVisited', { date: date(mostVisitedDay.date), count: number(mostVisitedDay.pageViews) }))}</p>` : ''}`;
    }

    function renderLoadedResult() {
        if (!state.result) return;
        renderTotals(state.result.totals || {});
        renderDaily(state.result.daily || [], state.result.mostVisitedDay);
    }

    function renderLoading() {
        if (!dailyHost || dailyHost.dataset.portalAnalyticsLoaded) return;
        dailyHost.innerHTML = `<div class="portal-analytics-loading"><span class="loading"></span><span>${escapeHtml(t('state.loading'))}</span></div>`;
    }

    function renderError() {
        if (!dailyHost || dailyHost.dataset.portalAnalyticsLoaded) return;
        dailyHost.innerHTML = `<div class="portal-analytics-error"><strong>${escapeHtml(t('state.error.title'))}</strong><span>${escapeHtml(t('state.error.description'))}</span></div>`;
    }

    async function load() {
        if (!dailyHost || state.loading || !window.topGymAuth?.isOwner?.()) return;
        state.loading = true;
        const sequence = ++state.sequence;
        buttonLoading(true);
        renderLoading();
        const selectedRange = range();
        state.selectedRange = selectedRange;
        try {
            const result = await window.topGymAuth.api(`/api/portal/analytics?from=${encodeURIComponent(selectedRange.from)}&to=${encodeURIComponent(selectedRange.to)}`, { method: 'GET', cache: 'no-store' });
            if (sequence !== state.sequence) return;
            state.result = result;
            state.statusKey = '';
            renderLoadedResult();
            dailyHost.dataset.portalAnalyticsLoaded = 'true';
            if (rangeLabel) rangeLabel.textContent = `${date(selectedRange.from)} → ${date(selectedRange.to)}`;
            setStatus('');
        } catch (error) {
            if (sequence !== state.sequence) return;
            state.statusKey = 'status.error';
            setStatus(t(state.statusKey), true);
            notify(t('toast.error'), 'error');
            renderError();
        } finally {
            if (sequence === state.sequence) {
                state.loading = false;
                buttonLoading(false);
            }
        }
    }

    rangeSelect?.addEventListener('change', () => { state.days = Number(rangeSelect.value) || 30; void load(); });
    refreshButton?.addEventListener('click', () => { if (!state.loading) void load(); });
    window.topGymPortalAnalyticsRefresh = load;
    applyStaticTranslations();
    window.addEventListener('topgym:localechange', () => {
        applyStaticTranslations();
        if (state.result) renderLoadedResult();
        else if (state.loading) renderLoading();
        else renderErrorIfNeeded();
        if (state.statusKey) setStatus(t(state.statusKey), true);
        if (rangeSelect) state.days = Number(rangeSelect.value) || state.days;
        if (state.result && rangeLabel) {
            const selectedRange = state.selectedRange || range();
            rangeLabel.textContent = `${date(selectedRange.from)} → ${date(selectedRange.to)}`;
        }
        if (state.loading) buttonLoading(true);
    });
    function renderErrorIfNeeded() {
        if (state.statusKey) renderError();
    }
    window.addEventListener('topgym:tab-changed', (event) => { if (event.detail?.name === 'portal-analytics') void load(); });
})();
