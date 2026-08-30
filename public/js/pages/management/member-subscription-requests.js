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
    const state = { page: 1, pageSize: 15, loading: false, sequence: 0, requests: [], pagination: {}, reviewing: new Set() };

    const statusLabels = Object.freeze({ pending: 'قيد المراجعة', approved: 'معتمد', rejected: 'مرفوض', cancelled: 'ملغى' });
    const requestTypeLabels = Object.freeze({ membership: 'اشتراك جديد', renewal: 'تجديد عضوية' });
    const errorLabels = Object.freeze({
        MEMBER_SUBSCRIPTION_REQUEST_NOT_FOUND: 'الطلب غير موجود أو لم يعد متاحًا.',
        MEMBER_SUBSCRIPTION_REQUEST_ALREADY_REVIEWED: 'تمت مراجعة هذا الطلب بالفعل. حدّث القائمة.',
        PAYMENT_PROOF_REQUIRED: 'لا يمكن الاعتماد قبل رفع إثبات دفع موثّق.',
        PAYMENT_PROOF_INTEGRITY_FAILED: 'تعذر التحقق من سلامة إثبات الدفع.',
        PAYMENT_PROOF_UNAVAILABLE: 'إثبات الدفع غير متاح حاليًا.',
        PAYMENT_PROOF_CHANGED: 'تغير إثبات الدفع أثناء المراجعة. حدّث القائمة وحاول مرة أخرى.',
        OBJECT_STORAGE_PROVIDER_NOT_CONFIGURED: 'التخزين الخاص غير مهيأ حاليًا.',
        MEMBERSHIP_PLAN_NOT_AVAILABLE: 'الباقة المطلوبة لم تعد متاحة.',
        MEMBERSHIP_TYPE_NOT_AVAILABLE: 'نوع العضوية المطلوب لم يعد متاحًا.'
    });

    const escapeHtml = (value) => String(value ?? '').replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[character]));
    const number = (value) => Number(value || 0).toLocaleString('ar-EG');
    const date = (value) => {
        if (!value) return 'غير محدد';
        const parsed = new Date(value);
        return Number.isNaN(parsed.getTime()) ? 'غير محدد' : new Intl.DateTimeFormat('ar-EG-u-ca-gregory', { dateStyle: 'medium', timeStyle: 'short' }).format(parsed);
    };
    const amount = (value, currency) => `${Number(value || 0).toLocaleString('ar-EG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency || 'EGP'}`;
    const safeError = (error, fallback = 'تعذر تنفيذ العملية. حاول مرة أخرى.') => errorLabels[error?.code] || fallback;

    function notify(message, kind = 'info') {
        if (window.topGymFeedback?.toast) window.topGymFeedback.toast(message, kind);
        else if (typeof window.showToast === 'function') window.showToast(message, kind === 'error', kind);
    }

    function setStatus(message = '', isError = false) {
        if (!statusMessage) return;
        statusMessage.textContent = message;
        statusMessage.hidden = !message;
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
        if (table) table.innerHTML = '<div class="member-requests-loading"><span class="loading"></span><span>جارٍ تحميل طلبات الأعضاء…</span></div>';
        if (summary) summary.textContent = 'جارٍ تحديث الطلبات…';
    }

    function statusMarkup(value) {
        const normalized = String(value || '').toLowerCase();
        return `<span class="member-request-status member-request-status-${escapeHtml(normalized)}">${escapeHtml(statusLabels[normalized] || normalized || 'غير محدد')}</span>`;
    }

    function renderRows(requests) {
        if (!table) return;
        if (!requests.length) {
            table.innerHTML = '<div class="member-requests-empty"><strong>لا توجد طلبات مطابقة</strong><span>ستظهر طلبات الاشتراك والتجديد هنا بعد إرسالها من بوابة العضو.</span></div>';
            return;
        }
        table.innerHTML = `<div class="member-requests-table-scroll"><table class="member-requests-table"><thead><tr><th>العضو</th><th>الطلب والعضوية</th><th>المبلغ</th><th>إثبات الدفع</th><th>تاريخ الطلب</th><th>الحالة والإجراء</th></tr></thead><tbody>${requests.map((request) => {
            const pending = request.status === 'pending';
            const proof = request.proof?.id && request.proof?.verified
                ? `<a class="btn btn-light btn-small" href="/api/member-subscription-requests/proofs/${Number(request.proof.id)}/file" target="_blank" rel="noopener noreferrer">عرض الإثبات</a>`
                : '<span class="member-request-muted">غير مرفق/غير موثّق</span>';
            const membership = request.membership || {};
            return `<tr data-member-request-id="${Number(request.id) || 0}">
                <td><div class="member-request-member"><strong>${escapeHtml(request.member?.name || 'غير محدد')}</strong><span>${escapeHtml(request.member?.membershipCode || 'بدون كود عضوية')}</span></div></td>
                <td><div class="member-request-membership"><strong>${escapeHtml(requestTypeLabels[request.requestType] || request.requestType || 'طلب عضوية')}</strong><span>${escapeHtml(membership.plan || '—')} · ${escapeHtml(membership.type || '—')}</span><small>${escapeHtml(membership.startDate || '—')} → ${escapeHtml(membership.endDate || '—')}</small></div></td>
                <td><strong class="member-request-amount">${escapeHtml(amount(request.pricing?.amountDue, request.pricing?.currency))}</strong><small class="member-request-price-detail">السعر ${escapeHtml(amount(request.pricing?.listPrice, request.pricing?.currency))}</small></td>
                <td>${proof}</td>
                <td class="member-request-date" dir="ltr">${escapeHtml(date(request.createdAt))}</td>
                <td><div class="member-request-actions">${statusMarkup(request.status)}${pending ? `<div class="member-request-action-buttons"><button class="btn btn-primary btn-small" type="button" data-async-action="false" data-member-request-action="approve" data-request-id="${Number(request.id) || 0}" data-loading-text="جاري الاعتماد...">اعتماد وتفعيل</button><button class="btn btn-danger btn-small" type="button" data-async-action="false" data-member-request-action="reject" data-request-id="${Number(request.id) || 0}" data-loading-text="جاري الرفض...">رفض</button></div>` : `<small class="member-request-review-note">${escapeHtml(request.reviewNotes || 'تمت المراجعة')}</small>`}</div></td>
            </tr>`;
        }).join('')}</tbody></table></div>`;
    }

    function renderPagination() {
        if (!pagination) return;
        const total = Number(state.pagination?.total || 0);
        const page = Number(state.pagination?.page || state.page || 1);
        const pages = Math.max(1, Number(state.pagination?.pages || 1));
        pagination.hidden = pages <= 1;
        if (pages <= 1) { pagination.innerHTML = ''; return; }
        pagination.innerHTML = `<span>صفحة ${number(page)} من ${number(pages)}</span><div><button class="btn btn-light btn-small" type="button" data-member-request-page="prev" ${page <= 1 ? 'disabled' : ''}>السابق</button><button class="btn btn-light btn-small" type="button" data-member-request-page="next" ${page >= pages ? 'disabled' : ''}>التالي</button></div>`;
        if (summary && total) summary.textContent = `إجمالي النتائج: ${number(total)}`;
    }

    async function load() {
        if (!table || state.loading || !window.topGymAuth?.isOwner?.()) return;
        state.loading = true;
        const sequence = ++state.sequence;
        renderLoading();
        try {
            const result = await window.topGymAuth.api(`/api/member-subscription-requests?${query()}`, { method: 'GET', cache: 'no-store' });
            if (sequence !== state.sequence) return;
            state.requests = Array.isArray(result.requests) ? result.requests : [];
            state.pagination = result.pagination || {};
            renderRows(state.requests);
            renderPagination();
            setStatus('');
            if (summary && !state.pagination.total) summary.textContent = 'لا توجد طلبات مطابقة';
        } catch (error) {
            if (sequence !== state.sequence) return;
            if (table) table.innerHTML = `<div class="member-requests-error"><strong>تعذر تحميل الطلبات</strong><span>${escapeHtml(safeError(error))}</span><button class="btn btn-light btn-small" type="button" data-member-request-action="retry">إعادة المحاولة</button></div>`;
            if (pagination) pagination.hidden = true;
            if (summary) summary.textContent = 'تعذر تحميل الطلبات';
        } finally {
            if (sequence === state.sequence) {
                state.loading = false;
                setButtonLoading(refreshButton, false);
            }
        }
    }

    async function askRejectionReason() {
        if (window.Swal) {
            const result = await window.Swal.fire({ position: 'center', title: 'رفض طلب الاشتراك', input: 'textarea', inputLabel: 'سبب الرفض', inputPlaceholder: 'اكتب سببًا واضحًا للعضو', inputAttributes: { maxlength: 1000, 'aria-label': 'سبب الرفض' }, showCancelButton: true, confirmButtonText: 'رفض الطلب', cancelButtonText: 'إلغاء', buttonsStyling: false, customClass: { popup: 'top-gym-alert', confirmButton: 'btn btn-danger', cancelButton: 'btn btn-light' }, inputValidator: (value) => String(value || '').trim() ? undefined : 'سبب الرفض مطلوب.' });
            return result.isConfirmed ? String(result.value || '').trim().slice(0, 1000) : null;
        }
        const reason = window.prompt('اكتب سبب رفض طلب الاشتراك:');
        return reason?.trim().slice(0, 1000) || null;
    }

    async function confirmApproval() {
        if (window.Swal) {
            const result = await window.Swal.fire({ position: 'center', icon: 'warning', title: 'اعتماد طلب الاشتراك؟', text: 'سيتم إنشاء/تجديد العضوية وتسجيل الدفعة داخل معاملة واحدة.', showCancelButton: true, confirmButtonText: 'اعتماد وتفعيل', cancelButtonText: 'إلغاء', buttonsStyling: false, customClass: { popup: 'top-gym-alert', confirmButton: 'btn btn-primary', cancelButton: 'btn btn-light' } });
            return result.isConfirmed;
        }
        return window.confirm('سيتم تفعيل العضوية وتسجيل الدفعة. هل تريد المتابعة؟');
    }

    async function review(requestId, action, button) {
        if (!requestId || state.reviewing.has(requestId)) return;
        const reason = action === 'reject' ? await askRejectionReason() : await confirmApproval();
        if (action === 'reject' && !reason) return;
        if (action === 'approve' && !reason) return;
        state.reviewing.add(requestId);
        setButtonLoading(button, true, button?.dataset.loadingText || 'جاري التنفيذ...');
        try {
            const body = action === 'reject' ? { reason } : {};
            await window.topGymAuth.api(`/api/member-subscription-requests/${requestId}/${action}`, { method: 'POST', body: JSON.stringify(body) });
            notify(action === 'approve' ? 'تم اعتماد الطلب وتفعيل العضوية.' : 'تم رفض الطلب.', 'success');
            await load();
        } catch (error) {
            notify(safeError(error, action === 'approve' ? 'تعذر اعتماد الطلب.' : 'تعذر رفض الطلب.'), 'error');
            setStatus(safeError(error), true);
        } finally {
            state.reviewing.delete(requestId);
            setButtonLoading(button, false);
        }
    }

    refreshButton?.addEventListener('click', () => {
        if (state.loading) return;
        setButtonLoading(refreshButton, true, 'جاري تحديث الطلبات...');
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
    window.addEventListener('topgym:tab-changed', (event) => { if (event.detail?.name === 'member-subscription-requests') void load(); });
    if (document.documentElement.dataset.topGymActiveTab === 'member-subscription-requests') void load();
})();
