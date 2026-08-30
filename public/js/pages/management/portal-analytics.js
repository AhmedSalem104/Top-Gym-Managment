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
    const state = { days: Number(rangeSelect?.value || 30), loading: false, sequence: 0 };
    const number = (value) => Number(value || 0).toLocaleString('ar-EG');
    const escapeHtml = (value) => String(value ?? '').replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[character]));

    function localDate(value) {
        const date = new Date(value);
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
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

    function buttonLoading(loading, label = 'جاري تحديث الإحصائيات...') {
        if (!refreshButton) return;
        if (window.topGymFeedback) {
            if (loading && !window.topGymFeedback.isLoading(refreshButton)) window.topGymFeedback.start(refreshButton, { loadingText: label });
            if (!loading) window.topGymFeedback.stop(refreshButton);
            return;
        }
        refreshButton.disabled = loading;
        if (loading) {
            refreshButton.dataset.portalAnalyticsOriginalText = refreshButton.textContent;
            refreshButton.textContent = label;
        } else if (refreshButton.dataset.portalAnalyticsOriginalText) {
            refreshButton.textContent = refreshButton.dataset.portalAnalyticsOriginalText;
            delete refreshButton.dataset.portalAnalyticsOriginalText;
        }
    }

    function renderTotals(totals = {}) {
        $('portalAnalyticsPageViews').textContent = number(totals.pageViews);
        $('portalAnalyticsUniqueVisitors').textContent = number(totals.uniqueVisitors);
        $('portalAnalyticsAuthenticatedMembers').textContent = number(totals.authenticatedMembers);
    }

    function renderDaily(daily = [], mostVisitedDay = null) {
        if (!dailyHost) return;
        if (!daily.length) {
            dailyHost.innerHTML = '<div class="portal-analytics-empty"><strong>لا توجد زيارات مسجلة خلال الفترة</strong><span>ستظهر حركة البوابة هنا بعد دخول الأعضاء إليها.</span></div>';
            return;
        }
        const max = Math.max(1, ...daily.flatMap((item) => [Number(item.pageViews || 0), Number(item.uniqueVisitors || 0), Number(item.authenticatedMembers || 0)]));
        dailyHost.innerHTML = `<div class="portal-analytics-legend"><span><i class="portal-bar-key portal-bar-key-views"></i>مشاهدات الصفحات</span><span><i class="portal-bar-key portal-bar-key-visitors"></i>الزوار الفريدون</span><span><i class="portal-bar-key portal-bar-key-members"></i>الأعضاء المسجلون</span></div><div class="portal-analytics-daily-list">${daily.map((item) => {
            const views = Number(item.pageViews || 0);
            const visitors = Number(item.uniqueVisitors || 0);
            const members = Number(item.authenticatedMembers || 0);
            return `<article class="portal-analytics-day"><div class="portal-analytics-day-meta"><strong dir="ltr">${escapeHtml(item.date)}</strong><span>${views ? `${number(views)} مشاهدة` : 'بدون مشاهدات'}</span></div><div class="portal-analytics-bars"><div class="portal-analytics-bar-row"><span>مشاهدات</span><div class="portal-analytics-bar-track"><i class="portal-analytics-bar portal-analytics-bar-views" style="--portal-bar-size:${Math.min(100, (views / max) * 100)}%"></i></div><strong>${number(views)}</strong></div><div class="portal-analytics-bar-row"><span>زوار</span><div class="portal-analytics-bar-track"><i class="portal-analytics-bar portal-analytics-bar-visitors" style="--portal-bar-size:${Math.min(100, (visitors / max) * 100)}%"></i></div><strong>${number(visitors)}</strong></div><div class="portal-analytics-bar-row"><span>أعضاء</span><div class="portal-analytics-bar-track"><i class="portal-analytics-bar portal-analytics-bar-members" style="--portal-bar-size:${Math.min(100, (members / max) * 100)}%"></i></div><strong>${number(members)}</strong></div></div></article>`;
        }).join('')}</div>${mostVisitedDay ? `<p class="portal-analytics-highlight">أكثر يوم زيارة: <strong dir="ltr">${escapeHtml(mostVisitedDay.date)}</strong> · ${number(mostVisitedDay.pageViews)} مشاهدة صفحة</p>` : ''}`;
    }

    async function load() {
        if (!dailyHost || state.loading || !window.topGymAuth?.isOwner?.()) return;
        state.loading = true;
        const sequence = ++state.sequence;
        buttonLoading(true);
        if (!dailyHost.dataset.portalAnalyticsLoaded) dailyHost.innerHTML = '<div class="portal-analytics-loading"><span class="loading"></span><span>جارٍ تحميل الإحصائيات…</span></div>';
        const selectedRange = range();
        try {
            const result = await window.topGymAuth.api(`/api/portal/analytics?from=${encodeURIComponent(selectedRange.from)}&to=${encodeURIComponent(selectedRange.to)}`, { method: 'GET', cache: 'no-store' });
            if (sequence !== state.sequence) return;
            renderTotals(result.totals || {});
            renderDaily(result.daily || [], result.mostVisitedDay);
            dailyHost.dataset.portalAnalyticsLoaded = 'true';
            if (rangeLabel) rangeLabel.textContent = `${selectedRange.from} → ${selectedRange.to}`;
            setStatus('');
        } catch (error) {
            if (sequence !== state.sequence) return;
            setStatus('تعذر تحميل إحصائيات البوابة. حاول مرة أخرى.', true);
            notify('تعذر تحميل إحصائيات البوابة.', 'error');
            if (!dailyHost.dataset.portalAnalyticsLoaded) dailyHost.innerHTML = '<div class="portal-analytics-error"><strong>تعذر تحميل الإحصائيات</strong><span>تحقق من الاتصال والصلاحيات ثم أعد المحاولة.</span></div>';
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
    window.addEventListener('topgym:tab-changed', (event) => { if (event.detail?.name === 'portal-analytics') void load(); });
    if (document.documentElement.dataset.topGymActiveTab === 'portal-analytics') void load();
})();
