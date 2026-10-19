(() => {
    'use strict';
    if (window.__topGymMemberFeedbackLoaded) return;
    window.__topGymMemberFeedbackLoaded = true;

    const $ = (id) => document.getElementById(id);
    const filtersForm = $('memberFeedbackFilters');
    const section = $('feedbackSection');
    const listElement = $('memberFeedbackList');
    const metaElement = $('memberFeedbackMeta');
    const paginationElement = $('memberFeedbackPagination');
    const state = { page: 1, pageSize: 10, controller: null, loading: false, view: 'loading', items: [], pagination: null };
    const fallbackText = {
        'feedback.value.unavailable': '—',
        'feedback.error.description': 'حدثت مشكلة أثناء تحميل التقييمات. حاول مرة أخرى.'
    };
    const t = (key, params) => window.TopGymI18n?.t?.(key, params) ?? fallbackText[key] ?? key;
    const locale = () => window.TopGymI18n?.get?.() === 'en' ? 'en' : 'ar';
    const brandName = () => String(window.topGymBranding?.get?.().identity?.brandName || 'Logic Fit').trim() || 'Logic Fit';
    const typeKeys = Object.freeze({
        general: 'feedback.type.general',
        problem: 'feedback.type.problem',
        complaint: 'feedback.type.complaint',
        suggestion: 'feedback.type.suggestion',
        feature_request: 'feedback.type.featureRequest'
    });
    const escapeHtml = (value) => String(value ?? '').replace(/[&<>\'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[character]));
    const displayPhone = (value, iso = '') => window.LogicFitPhoneInputs?.formatForDisplay?.(value, iso) || String(value || '');
    const formatNumber = (value) => window.TopGymI18n?.format?.('number', Number(value || 0)) ?? String(Number(value || 0));
    const formatDateTime = (value) => {
        if (!value) return t('feedback.value.unavailable');
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) return String(value);
        return window.TopGymI18n?.format?.('time', date.toISOString(), { dateStyle: 'medium', timeStyle: 'short' })
            || new Intl.DateTimeFormat(locale() === 'en' ? 'en-EG' : 'ar-EG', { dateStyle: 'medium', timeStyle: 'short' }).format(date);
    };
    const setText = (element, key, params) => { if (element) element.textContent = t(key, params); };
    const setLabel = (id, key) => {
        const label = section?.querySelector(`label[for="${id}"]`) || section?.querySelector(`label:has(#${id})`);
        if (!label) return;
        const textNode = [...label.childNodes].find((node) => node.nodeType === Node.TEXT_NODE && node.nodeValue.trim());
        if (textNode) textNode.nodeValue = ` ${t(key)} `;
    };

    function setTodayDateDefaults() {
        const now = new Date();
        const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
        ['memberFeedbackFromFilter', 'memberFeedbackToFilter'].forEach((id) => {
            const input = $(id);
            if (!input) return;
            input.defaultValue = today;
            if (!input.value) input.value = today;
        });
    }

    function configureFilterChoices() {
        ['memberFeedbackRatingFilter', 'memberFeedbackTypeFilter'].forEach((id) => {
            const select = $(id);
            window.LogicFitFilterChoiceGroup?.hydrate?.(select);
            const choices = section?.querySelector(`[data-filter-choices-for="${id}"]`);
            choices?.classList.add('logicfit-filter-choices--outlined', 'logicfit-filter-choices--wrap');
        });
    }

    function applyStaticTranslations() {
        if (!section) return;
        setText(section.querySelector('.member-feedback-kicker'), 'feedback.kicker');
        setText($('memberFeedbackTitle'), 'feedback.title');
        setText(section.querySelector('[data-brand-template="feedbackDescription"]'), 'feedback.description');
        setText($('memberFeedbackRefresh'), 'feedback.refresh');
        setLabel('memberFeedbackRatingFilter', 'feedback.filter.rating');
        setLabel('memberFeedbackTypeFilter', 'feedback.filter.type');
        setLabel('memberFeedbackFromFilter', 'feedback.filter.from');
        setLabel('memberFeedbackToFilter', 'feedback.filter.to');
        setLabel('memberFeedbackSearch', 'feedback.filter.search');
        setText($('memberFeedbackReset'), 'feedback.reset');
        const search = $('memberFeedbackSearch');
        if (search) search.placeholder = t('feedback.filter.search.placeholder');

        const ratingOptions = $('memberFeedbackRatingFilter')?.options;
        if (ratingOptions?.length) {
            ratingOptions[0].textContent = t('feedback.filter.rating.all');
            ratingOptions[1].textContent = t('feedback.filter.rating.stars', { count: '5' });
            ratingOptions[2].textContent = t('feedback.filter.rating.stars', { count: '4' });
            ratingOptions[3].textContent = t('feedback.filter.rating.stars', { count: '3' });
            ratingOptions[4].textContent = t('feedback.filter.rating.two');
            ratingOptions[5].textContent = t('feedback.filter.rating.one');
        }
        const typeOptions = $('memberFeedbackTypeFilter')?.options;
        if (typeOptions?.length) {
            typeOptions[0].textContent = t('feedback.filter.type.all');
            for (let index = 1; index < typeOptions.length; index += 1) {
                const option = typeOptions[index];
                const key = typeKeys[option.value];
                if (key) option.textContent = t(key, { brand: brandName() });
            }
        }
        configureFilterChoices();
    }

    function stars(rating) {
        const value = Math.max(0, Math.min(5, Number(rating || 0)));
        return `<span class="feedback-stars" aria-label="${escapeHtml(t('feedback.rating.aria', { count: formatNumber(value) }))}">${Array.from({ length: 5 }, (_, index) => `<span class="${index < value ? 'is-filled' : ''}" aria-hidden="true">★</span>`).join('')}</span>`;
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
            listElement.innerHTML = `<div class="member-feedback-empty"><strong>${escapeHtml(t('feedback.empty.title'))}</strong><span>${escapeHtml(t('feedback.empty.description'))}</span></div>`;
            return;
        }
        const rows = items.map((item) => {
            const typeKey = typeKeys[item.noteType];
            const label = typeKey ? t(typeKey, { brand: brandName() }) : t('feedback.value.unavailable');
            return `<tr>
                <td><div class="feedback-member-cell"><strong>${escapeHtml(item.memberName || t('feedback.value.unavailable'))}</strong><span class="feedback-phone" dir="ltr">${escapeHtml(displayPhone(item.phone, item.phoneCountry) || t('feedback.value.unavailable'))}</span></div></td>
                <td>${stars(item.rating)}</td>
                <td><span class="feedback-type feedback-type-${escapeHtml(item.noteType)}">${escapeHtml(label)}</span></td>
                <td><p class="feedback-message-cell">${escapeHtml(item.message)}</p></td>
                <td class="feedback-date" dir="ltr">${escapeHtml(formatDateTime(item.submittedAt))}</td>
                <td><button class="btn btn-light btn-small feedback-details-button" type="button" data-feedback-action="details" data-member-id="${Number(item.memberId) || 0}">${escapeHtml(t('feedback.action.memberDetails'))}</button></td>
            </tr>`;
        }).join('');
        listElement.innerHTML = `<div class="member-feedback-table-scroll"><table class="member-feedback-table"><thead><tr><th>${escapeHtml(t('feedback.table.member'))}</th><th>${escapeHtml(t('feedback.table.rating'))}</th><th>${escapeHtml(t('feedback.table.type'))}</th><th>${escapeHtml(t('feedback.table.message'))}</th><th>${escapeHtml(t('feedback.table.date'))}</th><th>${escapeHtml(t('feedback.table.action'))}</th></tr></thead><tbody>${rows}</tbody></table></div>`;
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
        paginationElement.innerHTML = `<span>${escapeHtml(t('feedback.pagination.range', { from: formatNumber(from), to: formatNumber(to), total: formatNumber(total) }))}</span><div class="feedback-pagination-actions"><button class="btn btn-light btn-small" type="button" data-feedback-page="prev" ${pagination.hasPrevious ? '' : 'disabled'}>${escapeHtml(t('feedback.pagination.previous'))}</button><strong>${escapeHtml(t('feedback.pagination.page', { page: formatNumber(page), pages: formatNumber(totalPages) }))}</strong><button class="btn btn-light btn-small" type="button" data-feedback-page="next" ${pagination.hasNext ? '' : 'disabled'}>${escapeHtml(t('feedback.pagination.next'))}</button></div>`;
    }

    function renderLoading() {
        if (!listElement) return;
        listElement.innerHTML = `<div class="member-feedback-loading"><span class="loading"></span><span>${escapeHtml(t('feedback.loading'))}</span></div>`;
    }

    function renderError() {
        if (!listElement) return;
        listElement.innerHTML = `<div class="member-feedback-error"><strong>${escapeHtml(t('feedback.error.title'))}</strong><span>${escapeHtml(t('feedback.error.description'))}</span><button class="btn btn-light btn-small" type="button" data-feedback-action="retry">${escapeHtml(t('feedback.retry'))}</button></div>`;
        if (paginationElement) paginationElement.hidden = true;
    }

    function renderCurrentState() {
        if (state.view === 'loading') renderLoading();
        else if (state.view === 'error') renderError();
        else {
            renderRows(state.items);
            renderPagination(state.pagination || {});
            if (metaElement) setText(metaElement, 'feedback.meta.total', { count: formatNumber(state.pagination?.total || state.items.length) });
        }
    }

    async function load() {
        if (!listElement || state.loading) return;
        state.loading = true;
        state.view = 'loading';
        state.controller?.abort();
        state.controller = new AbortController();
        renderCurrentState();
        try {
            const data = await window.topGymApi.request(`/api/member-feedback?${queryString()}`, { signal: state.controller.signal });
            state.items = Array.isArray(data.feedback) ? data.feedback : [];
            state.pagination = data.pagination || null;
            state.view = 'results';
            renderCurrentState();
        } catch (error) {
            if (error.name === 'AbortError') return;
            state.view = 'error';
            renderCurrentState();
        } finally {
            state.loading = false;
        }
    }

    function resetFilters() {
        filtersForm?.reset();
        state.page = 1;
        void load();
    }

    setTodayDateDefaults();
    applyStaticTranslations();
    renderCurrentState();
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
    window.addEventListener('topgym:localechange', () => {
        applyStaticTranslations();
        renderCurrentState();
    });
    window.addEventListener('topgym:tab-changed', (event) => {
        if (event.detail?.name === 'feedback') void load();
    });
    window.addEventListener('topgym:brandingchange', () => {
        applyStaticTranslations();
        if (document.querySelector('[data-page-tab="feedback"]')?.classList.contains('active')) void load();
    });
})();
