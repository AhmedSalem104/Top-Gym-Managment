(() => {
    'use strict';
    if (window.__topGymMemberSubscriptionRequestsLoaded) return;
    window.__topGymMemberSubscriptionRequestsLoaded = true;

    const $ = (id) => document.getElementById(id);
    const table = $('memberSubscriptionRequestsTable');
    const statusFilter = $('memberSubscriptionRequestStatus');
    const refreshButton = $('memberSubscriptionRequestsRefresh');
    const summary = $('memberSubscriptionRequestsSummary');
    const pagination = $('memberSubscriptionRequestsPagination');
    const statusMessage = $('memberSubscriptionRequestsStatus');
    const t = (key, params) => window.TopGymI18n?.t?.(key, params) || key;
    const state = { page: 1, pageSize: 15, loading: false, sequence: 0, requests: [], pagination: {}, reviewing: new Set(), loadErrorKey: '', loadErrorCode: '', statusKey: '', loaded: false };

    const statusLabels = Object.freeze({ pending: 'memberSubscriptionRequests.status.pending', approved: 'memberSubscriptionRequests.status.approved', rejected: 'memberSubscriptionRequests.status.rejected', cancelled: 'memberSubscriptionRequests.status.cancelled' });
    const requestTypeLabels = Object.freeze({ membership: 'memberSubscriptionRequests.type.membership', extension: 'memberSubscriptionRequests.type.extension', renewal: 'memberSubscriptionRequests.type.renewal' });
    const errorLabels = Object.freeze({
        MEMBER_SUBSCRIPTION_REQUEST_NOT_FOUND: 'memberSubscriptionRequests.error.notFound',
        MEMBER_SUBSCRIPTION_REQUEST_ALREADY_REVIEWED: 'memberSubscriptionRequests.error.alreadyReviewed',
        PAYMENT_PROOF_REQUIRED: 'memberSubscriptionRequests.error.proofRequired',
        PAYMENT_PROOF_INTEGRITY_FAILED: 'memberSubscriptionRequests.error.proofIntegrity',
        PAYMENT_PROOF_UNAVAILABLE: 'memberSubscriptionRequests.error.proofUnavailable',
        PAYMENT_PROOF_CHANGED: 'memberSubscriptionRequests.error.proofChanged',
        PAYMENT_DATE_REQUIRED: 'memberSubscriptionRequests.error.paymentDateRequired',
        PAYMENT_DATE_IN_FUTURE: 'memberSubscriptionRequests.error.paymentDateFuture',
        OBJECT_STORAGE_PROVIDER_NOT_CONFIGURED: 'memberSubscriptionRequests.error.storageNotConfigured',
        MEMBER_PAYMENT_PROOF_STORAGE_NOT_CONFIGURED: 'memberSubscriptionRequests.error.storageNotConfigured',
        MEMBER_PAYMENT_PROOF_STORAGE_UNAVAILABLE: 'memberSubscriptionRequests.error.storageUnavailable',
        MEMBERSHIP_PLAN_NOT_AVAILABLE: 'memberSubscriptionRequests.error.planUnavailable',
        MEMBERSHIP_TYPE_NOT_AVAILABLE: 'memberSubscriptionRequests.error.typeUnavailable',
        MEMBER_RENEWAL_REQUIRES_EXISTING: 'memberSubscriptionRequests.error.renewalRequiresExisting',
        MEMBERSHIP_FREEZE_ACTIVE: 'memberSubscriptionRequests.error.freezeActive',
        MEMBERSHIP_START_OVERLAPS_CURRENT: 'memberSubscriptionRequests.error.overlap',
        MEMBERSHIP_RENEWAL_SNAPSHOT_INVALID: 'memberSubscriptionRequests.error.snapshotInvalid',
        MEMBERSHIP_CURRENT_DATES_INVALID: 'memberSubscriptionRequests.error.currentDatesInvalid'
    });

    const escapeHtml = (value) => String(value ?? '').replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[character]));
    const number = (value) => window.TopGymI18n?.format?.('number', Number(value || 0)) || String(Number(value || 0));
    const date = (value) => {
        if (!value) return t('memberSubscriptionRequests.value.unknown');
        const parsed = new Date(value);
        return Number.isNaN(parsed.getTime()) ? t('memberSubscriptionRequests.value.unknown') : (window.TopGymI18n?.format?.('date', parsed.toISOString(), { dateStyle: 'medium', timeStyle: 'short' }) || parsed.toLocaleString());
    };
    const dateOnly = (value) => {
        if (!value) return t('memberSubscriptionRequests.value.dash');
        const source = String(value);
        const parsed = new Date(/^\d{4}-\d{2}-\d{2}$/u.test(source) ? `${source}T00:00:00Z` : source);
        return Number.isNaN(parsed.getTime()) ? source : (window.TopGymI18n?.format?.('date', parsed.toISOString(), { dateStyle: 'medium', timeZone: 'UTC' }) || source);
    };
    const amount = (value, currency) => {
        const formatted = window.TopGymI18n?.format?.('number', Number(value || 0), { minimumFractionDigits: 2, maximumFractionDigits: 2 }) || Number(value || 0).toFixed(2);
        const code = String(currency || 'EGP').toUpperCase();
        return `${formatted} ${code === 'EGP' ? t('memberSubscriptionRequests.value.currency') : code}`;
    };
    const membershipCodeLabel = (value) => {
        if (typeof value === 'string') return value;
        if (value && typeof value === 'object') return String(value.maskedCode || '');
        return '';
    };
    const safeError = (error, fallbackKey = 'memberSubscriptionRequests.error.operation') => t(errorLabels[error?.code] || fallbackKey);

    function applyStaticTranslations() {
        const translations = [
            ['.member-requests-kicker', 'memberSubscriptionRequests.kicker'],
            ['#memberSubscriptionRequestsTitle', 'memberSubscriptionRequests.title'],
            ['.member-requests-heading p', 'memberSubscriptionRequests.description']
        ];
        translations.forEach(([selector, key]) => {
            const element = pageQuery(selector);
            if (element) element.textContent = t(key);
        });
        const refreshLabel = refreshButton?.querySelector('span');
        if (refreshLabel && !refreshButton.disabled) refreshLabel.textContent = t('memberSubscriptionRequests.refresh');
        if (refreshButton) refreshButton.dataset.loadingText = t('memberSubscriptionRequests.refresh.loading');
        if (statusFilter) {
            const label = statusFilter.closest('label');
            const labelText = [...(label?.childNodes || [])].find((node) => node.nodeType === Node.TEXT_NODE && node.nodeValue.trim());
            if (labelText) labelText.nodeValue = `${t('memberSubscriptionRequests.filter.label')} `;
            [...statusFilter.options].forEach((option) => {
                const key = ({ pending: 'memberSubscriptionRequests.filter.pending', approved: 'memberSubscriptionRequests.filter.approved', rejected: 'memberSubscriptionRequests.filter.rejected', '': 'memberSubscriptionRequests.filter.all' })[option.value];
                if (key) option.textContent = t(key);
            });
        }
    }

    function pageQuery(selector) {
        return $('memberSubscriptionRequestsSection')?.querySelector(selector) || null;
    }

    function notify(message, kind = 'info') {
        if (window.topGymFeedback?.toast) window.topGymFeedback.toast(message, kind);
        else if (typeof window.showToast === 'function') window.showToast(message, kind === 'error', kind);
    }

    function setStatus(message = '', isError = false, translationKey = '') {
        if (!statusMessage) return;
        state.statusKey = translationKey;
        const renderedMessage = translationKey ? t(translationKey) : message;
        statusMessage.textContent = renderedMessage;
        statusMessage.hidden = !renderedMessage;
        statusMessage.classList.toggle('is-error', isError);
    }

    function setButtonLoading(button, loading, text = 'جاري التنفيذ...') {
        if (!button) return;
        if (window.topGymFeedback) {
            if (loading && !window.topGymFeedback.isLoading(button)) window.topGymFeedback.start(button, { loadingText: text });
            if (!loading) window.topGymFeedback.stop(button);
            return;
        }
        if (loading) {
            button.dataset.memberRequestOriginalText = button.textContent;
            button.textContent = text;
            button.disabled = true;
        } else {
            button.textContent = button.dataset.memberRequestOriginalText || button.textContent;
            delete button.dataset.memberRequestOriginalText;
            button.disabled = false;
        }
    }

    function query() {
        const params = new URLSearchParams({ page: String(state.page), pageSize: String(state.pageSize) });
        if (statusFilter?.value) params.set('status', statusFilter.value);
        return params.toString();
    }

    function renderLoading() {
        if (table) table.innerHTML = `<div class="member-requests-loading"><span class="loading"></span><span>${escapeHtml(t('memberSubscriptionRequests.loading'))}</span></div>`;
        if (summary) summary.textContent = t('memberSubscriptionRequests.summary.loading');
    }

    function statusMarkup(value) {
        const normalized = String(value || '').toLowerCase();
        return `<span class="member-request-status member-request-status-${escapeHtml(normalized)}">${escapeHtml(statusLabels[normalized] ? t(statusLabels[normalized]) : t('memberSubscriptionRequests.value.unknown'))}</span>`;
    }

    function renderRows(requests) {
        if (!table) return;
        if (!requests.length) {
            table.innerHTML = `<div class="member-requests-empty"><strong>${escapeHtml(t('memberSubscriptionRequests.empty.title'))}</strong><span>${escapeHtml(t('memberSubscriptionRequests.empty.body'))}</span></div>`;
            return;
        }
        table.innerHTML = `<div class="member-requests-table-scroll"><table class="member-requests-table"><thead><tr><th>${escapeHtml(t('memberSubscriptionRequests.column.member'))}</th><th>${escapeHtml(t('memberSubscriptionRequests.column.request'))}</th><th>${escapeHtml(t('memberSubscriptionRequests.column.amount'))}</th><th>${escapeHtml(t('memberSubscriptionRequests.column.proof'))}</th><th>${escapeHtml(t('memberSubscriptionRequests.column.date'))}</th><th>${escapeHtml(t('memberSubscriptionRequests.column.status'))}</th></tr></thead><tbody>${requests.map((request) => {
            const pending = request.status === 'pending';
            const proof = request.proof?.id && request.proof?.verified
                ? `<a class="btn btn-light btn-small" href="/api/member-subscription-requests/proofs/${Number(request.proof.id)}/file" target="_blank" rel="noopener noreferrer">${escapeHtml(t('memberSubscriptionRequests.action.viewProof'))}</a>`
                : `<span class="member-request-muted">${escapeHtml(t('memberSubscriptionRequests.value.noProof'))}</span>`;
            const membership = request.membership || {};
            const membershipCode = membershipCodeLabel(request.member?.membershipCode);
            return `<tr data-member-request-id="${Number(request.id) || 0}">
                <td><div class="member-request-member"><strong>${escapeHtml(request.member?.name || t('memberSubscriptionRequests.value.unknown'))}</strong><span>${escapeHtml(membershipCode || t('memberSubscriptionRequests.value.noCode'))}</span></div></td>
                <td><div class="member-request-membership"><strong>${escapeHtml(requestTypeLabels[request.requestType] ? t(requestTypeLabels[request.requestType]) : t('memberSubscriptionRequests.column.request'))}</strong><span>${escapeHtml(membership.plan || t('memberSubscriptionRequests.value.dash'))} · ${escapeHtml(membership.type || t('memberSubscriptionRequests.value.dash'))}</span><small>${dateOnly(membership.startDate)} → ${dateOnly(membership.endDate)}</small><small>${escapeHtml(t('memberSubscriptionRequests.value.collection'))}: ${request.paymentDate ? escapeHtml(dateOnly(request.paymentDate)) : escapeHtml(t('memberSubscriptionRequests.value.paymentDateNeeded'))}</small></div></td>
                <td><strong class="member-request-amount">${escapeHtml(amount(request.pricing?.amountDue, request.pricing?.currency))}</strong><small class="member-request-price-detail">${escapeHtml(t('memberSubscriptionRequests.value.price'))} ${escapeHtml(amount(request.pricing?.listPrice, request.pricing?.currency))}</small></td>
                <td>${proof}</td>
                <td class="member-request-date" dir="ltr">${escapeHtml(date(request.createdAt))}</td>
                <td><div class="member-request-actions">${statusMarkup(request.status)}${pending ? `<div class="member-request-action-buttons"><button class="btn btn-primary btn-small" type="button" data-async-action="false" data-member-request-action="approve" data-request-id="${Number(request.id) || 0}" data-loading-text="${escapeHtml(t('memberSubscriptionRequests.action.approve'))}">${escapeHtml(t('memberSubscriptionRequests.action.approve'))}</button><button class="btn btn-danger btn-small" type="button" data-async-action="false" data-member-request-action="reject" data-request-id="${Number(request.id) || 0}" data-loading-text="${escapeHtml(t('memberSubscriptionRequests.action.reject'))}">${escapeHtml(t('memberSubscriptionRequests.action.reject'))}</button></div>` : `<small class="member-request-review-note">${escapeHtml(request.reviewNotes || t('memberSubscriptionRequests.action.reviewed'))}</small>`}</div></td>
            </tr>`;
        }).join('')}</tbody></table></div>`;
    }

    function annotateRequestTable() {
        const requestTable = table?.querySelector('.member-requests-table');
        if (!requestTable) return;
        requestTable.setAttribute('role', 'table');
        requestTable.querySelector('thead')?.setAttribute('role', 'rowgroup');
        requestTable.querySelector('tbody')?.setAttribute('role', 'rowgroup');
        requestTable.querySelectorAll('thead tr').forEach((row) => {
            row.setAttribute('role', 'row');
            row.querySelectorAll('th').forEach((cell) => cell.setAttribute('role', 'columnheader'));
        });
        const labelKeys = ['member', 'request', 'amount', 'proof', 'date', 'status'];
        requestTable.querySelectorAll('tbody tr').forEach((row) => {
            row.setAttribute('role', 'row');
            row.querySelectorAll('td').forEach((cell, index) => {
                cell.setAttribute('role', 'cell');
                const labelKey = labelKeys[index];
                if (labelKey) {
                    const label = t(`memberSubscriptionRequests.column.${labelKey}`);
                    cell.dataset.label = label;
                    cell.setAttribute('aria-label', label);
                }
            });
            const requestId = Number(row.dataset.memberRequestId) || 0;
            if (!state.reviewing.has(requestId)) return;
            row.querySelectorAll('[data-member-request-action]').forEach((button) => {
                const key = button.dataset.memberRequestAction === 'approve'
                    ? 'memberSubscriptionRequests.action.approving'
                    : 'memberSubscriptionRequests.action.rejecting';
                button.disabled = true;
                button.textContent = t(key);
                button.dataset.loadingText = t(key);
            });
        });
    }

    function renderPagination() {
        annotateRequestTable();
        if (!pagination) return;
        const total = Number(state.pagination?.total || 0);
        const page = Number(state.pagination?.page || state.page || 1);
        const pages = Math.max(1, Number(state.pagination?.pages || 1));
        if (summary && !state.loading && !state.loadErrorKey) summary.textContent = total ? t('memberSubscriptionRequests.total', { count: total }) : t('memberSubscriptionRequests.empty.title');
        pagination.hidden = pages <= 1;
        if (pages <= 1) { pagination.innerHTML = ''; return; }
        pagination.innerHTML = `<span>${escapeHtml(t('memberSubscriptionRequests.pagination.page', { page, pages }))}</span><div><button class="btn btn-light btn-small" type="button" data-member-request-page="prev" ${page <= 1 ? 'disabled' : ''}>${escapeHtml(t('memberSubscriptionRequests.pagination.previous'))}</button><button class="btn btn-light btn-small" type="button" data-member-request-page="next" ${page >= pages ? 'disabled' : ''}>${escapeHtml(t('memberSubscriptionRequests.pagination.next'))}</button></div>`;
    }

    function renderLoadError() {
        if (!table) return;
        table.innerHTML = `<div class="member-requests-error"><strong>${escapeHtml(t('memberSubscriptionRequests.error.load.title'))}</strong><span>${escapeHtml(safeError({ code: state.loadErrorCode }))}</span><button class="btn btn-light btn-small" type="button" data-member-request-action="retry">${escapeHtml(t('memberSubscriptionRequests.error.load.retry'))}</button></div>`;
        if (pagination) pagination.hidden = true;
        if (summary) summary.textContent = t('memberSubscriptionRequests.error.load.title');
    }

    async function load() {
        if (!table || state.loading || !window.topGymAuth?.isOwner?.()) return;
        state.loading = true;
        state.loadErrorKey = '';
        state.loadErrorCode = '';
        const sequence = ++state.sequence;
        renderLoading();
        try {
            const result = await window.topGymAuth.api(`/api/member-subscription-requests?${query()}`, { method: 'GET', cache: 'no-store' });
            if (sequence !== state.sequence) return;
            state.requests = Array.isArray(result.requests) ? result.requests : [];
            state.pagination = result.pagination || {};
            state.loaded = true;
            renderRows(state.requests);
            renderPagination();
            setStatus('');
            if (summary && !state.pagination.total) summary.textContent = t('memberSubscriptionRequests.empty.title');
        } catch (error) {
            if (sequence !== state.sequence) return;
            state.loadErrorKey = 'memberSubscriptionRequests.error.load.title';
            state.loadErrorCode = error?.code || '';
            renderLoadError();
        } finally {
            if (sequence === state.sequence) {
                state.loading = false;
                setButtonLoading(refreshButton, false);
            }
        }
    }

    async function askRejectionReason() {
        if (window.Swal) {
            const result = await window.Swal.fire({ position: 'center', title: t('memberSubscriptionRequests.dialog.reject.title'), input: 'textarea', inputLabel: t('memberSubscriptionRequests.dialog.reject.reason'), inputPlaceholder: t('memberSubscriptionRequests.dialog.reject.placeholder'), inputAttributes: { maxlength: 1000, 'aria-label': t('memberSubscriptionRequests.dialog.reject.reason') }, showCancelButton: true, confirmButtonText: t('memberSubscriptionRequests.dialog.reject.confirm'), cancelButtonText: t('memberSubscriptionRequests.dialog.cancel'), buttonsStyling: false, customClass: { popup: 'top-gym-alert', confirmButton: 'btn btn-danger', cancelButton: 'btn btn-light' }, inputValidator: (value) => String(value || '').trim() ? undefined : t('memberSubscriptionRequests.dialog.reject.required') });
            return result.isConfirmed ? String(result.value || '').trim().slice(0, 1000) : null;
        }
        const reason = window.prompt(t('memberSubscriptionRequests.dialog.reject.placeholder'));
        return reason?.trim().slice(0, 1000) || null;
    }

    async function confirmApproval(request) {
        const paymentDate = request?.paymentDate || new Date().toISOString().slice(0, 10);
        if (window.Swal) {
            const result = await window.Swal.fire({ position: 'center', icon: 'warning', title: t('memberSubscriptionRequests.dialog.approve.title'), text: t('memberSubscriptionRequests.dialog.approve.body'), input: 'date', inputValue: paymentDate, inputLabel: t('memberSubscriptionRequests.dialog.paymentDate'), inputAttributes: { max: new Date().toISOString().slice(0, 10), 'aria-label': t('memberSubscriptionRequests.dialog.paymentDate') }, showCancelButton: true, confirmButtonText: t('memberSubscriptionRequests.dialog.approve.confirm'), cancelButtonText: t('memberSubscriptionRequests.dialog.cancel'), buttonsStyling: false, customClass: { popup: 'top-gym-alert', confirmButton: 'btn btn-primary', cancelButton: 'btn btn-light' }, inputValidator: (value) => String(value || '').trim() ? undefined : t('memberSubscriptionRequests.dialog.paymentDate.required') });
            return { confirmed: result.isConfirmed, paymentDate: result.isConfirmed ? result.value : null };
        }
        return { confirmed: window.confirm(t('memberSubscriptionRequests.dialog.approve.fallback')), paymentDate };
    }

    async function review(requestId, action, button) {
        if (!requestId || state.reviewing.has(requestId)) return;
        const request = state.requests.find((item) => Number(item.id) === Number(requestId));
        const reviewInput = action === 'reject' ? await askRejectionReason() : await confirmApproval(request);
        const reason = action === 'reject' ? reviewInput : reviewInput?.confirmed ? reviewInput : null;
        if (action === 'reject' && !reason) return;
        if (action === 'approve' && !reason) return;
        state.reviewing.add(requestId);
        setButtonLoading(button, true, t(action === 'approve' ? 'memberSubscriptionRequests.action.approving' : 'memberSubscriptionRequests.action.rejecting'));
        try {
            const body = action === 'reject' ? { reason } : { paymentDate: reason.paymentDate };
            await window.topGymAuth.api(`/api/member-subscription-requests/${requestId}/${action}`, { method: 'POST', body: JSON.stringify(body) });
            notify(t(action === 'approve' ? 'memberSubscriptionRequests.status.approvedNotice' : 'memberSubscriptionRequests.status.rejectedNotice'), 'success');
            await load();
        } catch (error) {
            const fallbackKey = action === 'approve' ? 'memberSubscriptionRequests.status.approveError' : 'memberSubscriptionRequests.status.rejectError';
            const errorKey = errorLabels[error?.code] || fallbackKey;
            const message = t(errorKey);
            notify(message, 'error');
            // A second review attempt is expected to receive 409 after the
            // first transaction has already changed the request status. Sync
            // the table so the stale Pending row cannot be acted on again.
            if (error?.code === 'MEMBER_SUBSCRIPTION_REQUEST_ALREADY_REVIEWED') {
                await load();
            }
            setStatus(message, true, errorKey);
        } finally {
            state.reviewing.delete(requestId);
            setButtonLoading(button, false);
            if (state.loaded && !state.loading && !state.loadErrorKey) {
                renderRows(state.requests);
                renderPagination();
            }
        }
    }

    refreshButton?.addEventListener('click', () => {
        if (state.loading) return;
        setButtonLoading(refreshButton, true, t('memberSubscriptionRequests.refresh.loading'));
        void load();
    });
    statusFilter?.addEventListener('change', () => { state.page = 1; void load(); });
    pagination?.addEventListener('click', (event) => {
        const button = event.target.closest('[data-member-request-page]');
        if (!button || button.disabled) return;
        state.page += button.dataset.memberRequestPage === 'next' ? 1 : -1;
        void load();
    });
    table?.addEventListener('click', (event) => {
        const button = event.target.closest('[data-member-request-action]');
        if (!button) return;
        const action = button.dataset.memberRequestAction;
        if (action === 'retry') { void load(); return; }
        if (action === 'approve' || action === 'reject') void review(Number(button.dataset.requestId), action, button);
    });

    window.topGymMemberSubscriptionRequestsRefresh = load;
    applyStaticTranslations();
    renderLoading();
    window.addEventListener('topgym:localechange', () => {
        applyStaticTranslations();
        if (state.loading) renderLoading();
        else if (state.loadErrorKey) renderLoadError();
        else if (state.loaded) {
            renderRows(state.requests);
            renderPagination();
        }
        if (state.statusKey) setStatus('', Boolean(statusMessage?.classList.contains('is-error')), state.statusKey);
    });
    window.addEventListener('topgym:tab-changed', (event) => { if (event.detail?.name === 'member-subscription-requests') void load(); });
})();
