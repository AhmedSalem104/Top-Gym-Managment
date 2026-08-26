(() => {
    'use strict';
    if (window.__topGymMemberFeedbackLoaded) return;
    window.__topGymMemberFeedbackLoaded = true;

    const $ = (id) => document.getElementById(id);
    const filtersForm = $('memberFeedbackFilters');
    const listElement = $('memberFeedbackList');
    const metaElement = $('memberFeedbackMeta');
    const paginationElement = $('memberFeedbackPagination');
    const typeLabels = {
        general: 'رأي عام',
        problem: 'مشكلة',
        complaint: 'شكوى',
        suggestion: 'اقتراح',
        feature_request: 'إضافة يحتاجها الجيم'
    };
    const state = { page: 1, pageSize: 10, controller: null, loading: false };
    const brandName = () => String(window.topGymBranding?.get?.().identity?.brandName || 'الجيم').trim() || 'الجيم';
    const typeLabel = (value) => value === 'feature_request' ? `إضافة يحتاجها ${brandName()}` : typeLabels[value] || value || '—';

    const escapeHtml = (value) => String(value ?? '').replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[character]));
    const formatNumber = (value) => Number(value || 0).toLocaleString('ar-EG');
    const formatDateTime = (value) => {
        if (!value) return '—';
        const date = new Date(value);
        return Number.isNaN(date.getTime()) ? String(value) : new Intl.DateTimeFormat('ar-EG-u-ca-gregory', { dateStyle: 'medium', timeStyle: 'short' }).format(date);
    };

    function stars(rating) {
        const value = Number(rating || 0);
        return `<span class="feedback-stars" aria-label="${value} من 5 نجوم">${Array.from({ length: 5 }, (_, index) => `<span class="${index < value ? 'is-filled' : ''}" aria-hidden="true">★</span>`).join('')}</span>`;
    }

    function queryString() {
        const params = new URLSearchParams({
            page: String(state.page),
            pageSize: String(state.pageSize),
            rating: $('memberFeedbackRatingFilter')?.value || '',
            noteType: $('memberFeedbackTypeFilter')?.value || '',
            from: $('memberFeedbackFromFilter')?.value || '',
            to: $('memberFeedbackToFilter')?.value || '',
            search: $('memberFeedbackSearch')?.value.trim() || ''
        });
        return params.toString();
    }

    function renderRows(items) {
        if (!items.length) {
            listElement.innerHTML = '<div class="member-feedback-empty"><strong>لا توجد تقييمات مطابقة</strong><span>ستظهر آراء المشتركين هنا بعد إرسالها من بوابة العضوية.</span></div>';
            return;
        }
        const rows = items.map((item) => `<tr>
            <td><div class="feedback-member-cell"><strong>${escapeHtml(item.memberName || '—')}</strong><span class="feedback-phone" dir="ltr">${escapeHtml(item.phone || '—')}</span></div></td>
            <td>${stars(item.rating)}</td>
            <td><span class="feedback-type feedback-type-${escapeHtml(item.noteType)}">${escapeHtml(typeLabel(item.noteType))}</span></td>
            <td><p class="feedback-message-cell">${escapeHtml(item.message)}</p></td>
            <td class="feedback-date" dir="ltr">${escapeHtml(formatDateTime(item.submittedAt))}</td>
            <td><button class="btn btn-light btn-small feedback-details-button" type="button" data-feedback-action="details" data-member-id="${Number(item.memberId) || 0}">تفاصيل العضو</button></td>
        </tr>`).join('');
        listElement.innerHTML = `<div class="member-feedback-table-scroll"><table class="member-feedback-table"><thead><tr><th>المشترك</th><th>التقييم</th><th>نوع الملاحظة</th><th>الرأي أو المشكلة</th><th>تاريخ الإرسال</th><th>الإجراء</th></tr></thead><tbody>${rows}</tbody></table></div>`;
    }

    function renderPagination(pagination = {}) {
        const page = Number(pagination.page || state.page);
        const total = Number(pagination.total || 0);
        const pageSize = Number(pagination.pageSize || state.pageSize);
        const totalPages = Math.max(1, Number(pagination.totalPages || 1));
        if (!paginationElement) return;
        if (total <= pageSize) {
            paginationElement.hidden = true;
            paginationElement.innerHTML = '';
            return;
        }
        const from = total ? ((page - 1) * pageSize) + 1 : 0;
        const to = Math.min(total, page * pageSize);
        paginationElement.hidden = false;
        paginationElement.innerHTML = `<span>عرض ${formatNumber(from)}–${formatNumber(to)} من ${formatNumber(total)} تقييم</span><div class="feedback-pagination-actions"><button class="btn btn-light btn-small" type="button" data-feedback-page="prev" ${pagination.hasPrevious ? '' : 'disabled'}>السابق</button><strong>صفحة ${formatNumber(page)} من ${formatNumber(totalPages)}</strong><button class="btn btn-light btn-small" type="button" data-feedback-page="next" ${pagination.hasNext ? '' : 'disabled'}>التالي</button></div>`;
    }

    async function load() {
        if (!listElement || state.loading) return;
        state.loading = true;
        state.controller?.abort();
        state.controller = new AbortController();
        listElement.innerHTML = '<div class="member-feedback-loading"><span class="loading"></span><span>جاري تحميل التقييمات…</span></div>';
        try {
            const data = await window.topGymApi.request(`/api/member-feedback?${queryString()}`, { signal: state.controller.signal });
            const items = Array.isArray(data.feedback) ? data.feedback : [];
            renderRows(items);
            renderPagination(data.pagination);
            if (metaElement) metaElement.textContent = `إجمالي النتائج: ${formatNumber(data.pagination?.total || items.length)}`;
        } catch (error) {
            if (error.name === 'AbortError') return;
            listElement.innerHTML = `<div class="member-feedback-error"><strong>تعذر تحميل التقييمات</strong><span>${escapeHtml(error.message || 'حاول مرة أخرى.')}</span><button class="btn btn-light btn-small" type="button" data-feedback-action="retry">إعادة المحاولة</button></div>`;
            if (paginationElement) paginationElement.hidden = true;
        } finally {
            state.loading = false;
        }
    }

    function resetFilters() {
        filtersForm?.reset();
        state.page = 1;
        void load();
    }

    filtersForm?.addEventListener('submit', (event) => {
        event.preventDefault();
        state.page = 1;
        void load();
    });
    $('memberFeedbackReset')?.addEventListener('click', resetFilters);
    $('memberFeedbackRefresh')?.addEventListener('click', () => void load());
    let searchTimer;
    $('memberFeedbackSearch')?.addEventListener('input', () => {
        window.clearTimeout(searchTimer);
        searchTimer = window.setTimeout(() => { state.page = 1; void load(); }, 300);
    });
    paginationElement?.addEventListener('click', (event) => {
        const button = event.target.closest('[data-feedback-page]');
        if (!button || button.disabled) return;
        state.page += button.dataset.feedbackPage === 'next' ? 1 : -1;
        void load();
    });
    listElement?.addEventListener('click', (event) => {
        const button = event.target.closest('[data-feedback-action]');
        if (!button) return;
        if (button.dataset.feedbackAction === 'retry') { void load(); return; }
        if (button.dataset.feedbackAction === 'details') {
            const memberId = Number(button.dataset.memberId || 0);
            if (memberId) window.dispatchEvent(new CustomEvent('topgym:report-member-action', { detail: { action: 'details', id: memberId } }));
        }
    });
    window.topGymFeedbackRefresh = load;
    window.addEventListener('topgym:tab-changed', (event) => {
        if (event.detail?.name === 'feedback') void load();
    });
    window.addEventListener('topgym:brandingchange', () => {
        if (document.querySelector('[data-page-tab="feedback"]')?.classList.contains('active')) void load();
    });
    if (document.querySelector('[data-page-tab="feedback"]')?.classList.contains('active')) void load();
})();
