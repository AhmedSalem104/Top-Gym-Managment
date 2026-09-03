(() => {
    'use strict';

    const byId = (id) => document.getElementById(id);
    const message = byId('trainerWorkspaceMessage');
    const plan = byId('trainerWorkspacePlan');
    const status = byId('trainerWorkspaceStatus');
    const brand = byId('trainerWorkspaceBrand');
    const logout = byId('trainerWorkspaceLogout');
    const clientsList = byId('trainerClientsList');
    const clientsMessage = byId('trainerClientsMessage');
    const search = byId('trainerClientSearch');
    const pagination = byId('trainerClientsPagination');
    const clientDialog = byId('trainerClientDialog');
    const detailsDialog = byId('trainerClientDetailsDialog');
    let currentPage = 1;
    let searchTimer;
    let clientsCache = [];
    let packagesCache = [];
    let purchasesCache = [];
    let sessionsCache = [];

    const setText = (element, value) => { if (element) element.textContent = String(value ?? ''); };
    const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));
    const api = async (path, options = {}) => {
        const response = await fetch(path, { credentials: 'same-origin', ...options, headers: { 'Content-Type': 'application/json', ...(options.headers || {}) } });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw Object.assign(new Error(payload.error || 'تعذر تحميل البيانات.'), { code: payload.code, status: response.status });
        return payload;
    };

    function setClientsMessage(value, isError = false) {
        if (!clientsMessage) return;
        clientsMessage.textContent = value || '';
        clientsMessage.classList.toggle('is-error', Boolean(isError));
    }

    function setSectionMessage(id, value, isError = false) {
        const element = byId(id);
        if (!element) return;
        element.textContent = value || '';
        element.classList.toggle('is-error', Boolean(isError));
    }

    function localDateValue(date = new Date()) {
        const local = new Date(date.getTime() - (date.getTimezoneOffset() * 60000));
        return local.toISOString().slice(0, 10);
    }

    function localDateTimeValue(date = new Date()) {
        const local = new Date(date.getTime() - (date.getTimezoneOffset() * 60000));
        return local.toISOString().slice(0, 16);
    }

    function formatDate(value, withTime = false) {
        if (!value) return '—';
        // SQL DATE values are calendar dates, not instants. Parse them in a
        // stable UTC context so the browser timezone cannot render the
        // previous day for users in positive-offset timezones.
        if (!withTime && /^\d{4}-\d{2}-\d{2}$/.test(String(value))) {
            const [year, month, day] = String(value).split('-').map(Number);
            return new Intl.DateTimeFormat('ar-EG', { dateStyle: 'medium', timeZone: 'UTC' }).format(new Date(Date.UTC(year, month - 1, day)));
        }
        const parsed = new Date(value);
        if (Number.isNaN(parsed.getTime())) return String(value);
        return new Intl.DateTimeFormat('ar-EG', withTime ? { dateStyle: 'medium', timeStyle: 'short' } : { dateStyle: 'medium' }).format(parsed);
    }

    function moneyValue(value) {
        return `${Number(value || 0).toLocaleString('ar-EG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ج.م`;
    }

    function statusLabel(value) {
        return ({ scheduled: 'مجدولة', completed: 'مكتملة', cancelled: 'ملغاة', no_show: 'لم يحضر', active: 'نشطة', completed_purchase: 'مكتملة' }[value] || value || '—');
    }

    function openDialog(dialog) {
        if (!dialog) return;
        if (typeof dialog.showModal === 'function') dialog.showModal();
        else dialog.setAttribute('open', '');
    }

    function closeDialog(dialog) { dialog?.close?.(); }

    function populateSelect(id, rows, value = '', emptyLabel = 'اختر') {
        const select = byId(id);
        if (!select) return;
        const options = rows.map((row) => `<option value="${Number(row.id)}">${escapeHtml(row.label || row.fullName || row.name || row.packageName || `#${row.id}`)}</option>`).join('');
        select.innerHTML = `<option value="">${escapeHtml(emptyLabel)}</option>${options}`;
        if (value != null && value !== '') select.value = String(value);
    }

    function populateClientSelect(id, value = '') {
        populateSelect(id, clientsCache.map((client) => ({ id: client.id, label: client.fullName })), value, 'اختر العميل');
    }

    function populatePackageSelect(id, value = '') {
        populateSelect(id, packagesCache.filter((item) => item.status === 'active').map((item) => ({ id: item.id, label: `${item.name} · ${moneyValue(item.price)}` })), value, 'اختر الباقة');
    }

    function populatePurchaseSelect(id, memberId = '', value = '') {
        const items = purchasesCache.filter((item) => !memberId || Number(item.memberId) === Number(memberId));
        populateSelect(id, items.map((item) => ({ id: item.id, label: `${item.packageName || 'باقة'} · متبقي ${moneyValue(item.amountRemaining)}` })), value, 'بدون باقة');
    }

    function renderEmpty(messageText = 'لا يوجد عملاء بعد.') {
        if (clientsList) clientsList.innerHTML = `<div class="trainer-empty-state"><strong>${escapeHtml(messageText)}</strong><span>أضف أول عميل لبدء بناء ملفه التدريبي.</span></div>`;
    }

    function renderClients(payload) {
        const clients = Array.isArray(payload?.clients) ? payload.clients : [];
        clientsCache = clients;
        if (!clients.length) { renderEmpty(search?.value ? 'لم نعثر على نتائج مطابقة.' : 'لا يوجد عملاء بعد.'); renderPagination({}); return; }
        clientsList.innerHTML = clients.map((client) => `
            <article class="trainer-client-row" data-client-id="${Number(client.id)}">
                <div class="trainer-client-name"><strong title="${escapeHtml(client.fullName)}">${escapeHtml(client.fullName)}</strong><span>${escapeHtml(client.phone || client.email || 'لا توجد وسيلة تواصل')}</span></div>
                <div class="trainer-client-goal" title="${escapeHtml(client.primaryGoal || '')}">${escapeHtml(client.primaryGoal || 'لم يحدد هدفًا بعد')}</div>
                <div class="trainer-client-stat"><strong>${Number(client.workoutCount || 0)}</strong><span>تدريب</span></div>
                <div class="trainer-client-stat"><strong>${Number(client.nutritionCount || 0)}</strong><span>تغذية</span></div>
                <div class="trainer-client-stat"><strong>${Number(client.measurementCount || 0)}</strong><span>قياس</span></div>
                <div class="trainer-client-actions"><button type="button" data-client-action="details">فتح</button><button type="button" data-client-action="edit">تعديل</button></div>
            </article>`).join('');
        renderPagination(payload?.pagination);
    }

    function renderPagination(info = {}) {
        if (!pagination) return;
        const totalPages = Number(info.totalPages || 0);
        pagination.hidden = totalPages <= 1;
        if (pagination.hidden) return;
        pagination.innerHTML = `<button type="button" data-page="prev" ${info.hasPrevious ? '' : 'disabled'} aria-label="الصفحة السابقة">‹</button><span>${Number(info.page || 1)} / ${totalPages}</span><button type="button" data-page="next" ${info.hasNext ? '' : 'disabled'} aria-label="الصفحة التالية">›</button>`;
    }

    async function loadClients(pageNumber = currentPage) {
        currentPage = pageNumber;
        setClientsMessage('جارٍ تحميل العملاء...');
        if (clientsList) clientsList.setAttribute('aria-busy', 'true');
        try {
            const payload = await api(`/api/trainer/clients?page=${currentPage}&pageSize=20&search=${encodeURIComponent(search?.value || '')}`);
            renderClients(payload);
            const total = Number(payload.pagination?.total || 0);
            setClientsMessage(total ? `${total} عميل` : '');
        } catch (error) {
            setClientsMessage(error.message || 'تعذر تحميل العملاء.', true);
            renderEmpty('تعذر تحميل قائمة العملاء.');
        } finally {
            if (clientsList) clientsList.removeAttribute('aria-busy');
        }
    }

    function setMetrics(workspace) {
        const metrics = workspace?.metrics || {};
        setText(byId('trainerMetricClients'), metrics.activeClients ?? 0);
        setText(byId('trainerMetricPlans'), metrics.activeTrainingPlans ?? 0);
        setText(byId('trainerMetricFollowUp'), metrics.clientsNeedingFollowUp ?? 0);
        setText(byId('trainerMetricMeasurements'), metrics.recentMeasurements ?? 0);
        setText(byId('trainerMetricCheckins'), metrics.recentCheckins ?? 0);
        setText(byId('trainerMetricSessions'), metrics.sessionsToday ?? 0);
        setText(byId('trainerMetricUpcoming'), metrics.upcomingSessions ?? 0);
        setText(byId('trainerMetricPackages'), metrics.packagesExpiring ?? 0);
        setText(byId('trainerMetricPayments'), metrics.outstandingPayments == null ? '—' : `${Number(metrics.outstandingPayments).toLocaleString('ar-EG')} ج.م`);
    }

    function resetClientForm(client = null) {
        byId('trainerClientForm')?.reset();
        if (byId('trainerClientId')) byId('trainerClientId').value = client?.id || '';
        byId('trainerClientName').value = client?.fullName || '';
        byId('trainerClientPhone').value = client?.phone || '';
        byId('trainerClientEmail').value = client?.email || '';
        byId('trainerClientGoal').value = client?.primaryGoal || '';
        byId('trainerClientStatus').value = client?.status || 'active';
        byId('trainerClientNotes').value = client?.notes || '';
        setText(byId('trainerClientDialogTitle'), client ? 'تعديل ملف العميل' : 'إضافة عميل');
        setText(byId('trainerClientFormMessage'), '');
    }

    function openClientDialog(client = null) {
        resetClientForm(client);
        if (typeof clientDialog?.showModal === 'function') clientDialog.showModal();
        else clientDialog?.setAttribute('open', '');
        byId('trainerClientName')?.focus();
    }

    async function openDetails(id) {
        const container = byId('trainerClientDetails');
        if (!container) return;
        container.innerHTML = '<p>جارٍ تحميل الملف...</p>';
        if (typeof detailsDialog?.showModal === 'function') detailsDialog.showModal();
        const payload = await api(`/api/trainer/clients/${Number(id)}`);
        const client = payload.client || {};
        container.dataset.clientId = String(Number(id));
        container.innerHTML = `<div class="trainer-client-details-grid">
            <div class="trainer-detail-stat"><span>الاسم</span><strong>${escapeHtml(client.fullName)}</strong></div>
            <div class="trainer-detail-stat"><span>الهاتف</span><strong>${escapeHtml(client.phone || '—')}</strong></div>
            <div class="trainer-detail-stat"><span>خطط التدريب</span><strong>${Number(payload.trainingPlans?.length || 0)}</strong></div>
            <div class="trainer-detail-stat"><span>خطط التغذية</span><strong>${Number(payload.nutritionPlans?.length || 0)}</strong></div>
            <div class="trainer-detail-stat"><span>القياسات</span><strong>${Number(payload.measurements?.length || 0)}</strong></div>
            <div class="trainer-detail-stat"><span>المتابعات</span><strong>${Number(payload.checkins?.length || 0)}</strong></div>
        </div><p class="trainer-detail-note"><strong>الهدف:</strong> ${escapeHtml(client.primaryGoal || 'لم يحدد بعد')}<br><strong>ملاحظات:</strong> ${escapeHtml(client.notes || 'لا توجد ملاحظات.')}</p><div class="trainer-detail-actions"><button type="button" class="btn btn-light btn-small" data-detail-action="timeline">عرض الخط الزمني</button><button type="button" class="btn btn-light btn-small" data-detail-action="measurement">إضافة قياس</button><button type="button" class="btn btn-light btn-small" data-detail-action="checkin">إضافة متابعة</button><button type="button" class="btn btn-primary btn-small" data-detail-action="portal">إصدار دخول البوابة</button></div><p id="trainerClientDetailsPortalMessage" class="trainer-inline-message" role="status"></p>`;
    }

    async function editClient(id) {
        try { const payload = await api(`/api/trainer/clients/${Number(id)}`); openClientDialog(payload.client); } catch (error) { setClientsMessage(error.message, true); }
    }

    async function saveClient(event) {
        event.preventDefault();
        const saveButton = byId('trainerClientSave');
        const id = byId('trainerClientId')?.value;
        const payload = { fullName: byId('trainerClientName').value.trim(), phone: byId('trainerClientPhone').value.trim(), email: byId('trainerClientEmail').value.trim(), primaryGoal: byId('trainerClientGoal').value.trim(), status: byId('trainerClientStatus').value, notes: byId('trainerClientNotes').value.trim() };
        if (!payload.fullName || !payload.phone) { setText(byId('trainerClientFormMessage'), 'الاسم ورقم الهاتف مطلوبان.'); return; }
        saveButton.disabled = true;
        setText(byId('trainerClientFormMessage'), 'جارٍ الحفظ...');
        try {
            if (id) await api(`/api/trainer/clients/${Number(id)}`, { method: 'PATCH', body: JSON.stringify(payload) });
            else await api('/api/trainer/clients', { method: 'POST', body: JSON.stringify(payload) });
            clientDialog?.close();
            await Promise.all([loadClients(currentPage), loadWorkspace()]);
        } catch (error) { setText(byId('trainerClientFormMessage'), error.message || 'تعذر حفظ العميل.'); }
        finally { saveButton.disabled = false; }
    }

    function renderPackages(payload) {
        packagesCache = Array.isArray(payload?.packages) ? payload.packages : [];
        const target = byId('trainerPackagesList');
        if (!target) return;
        target.innerHTML = packagesCache.length ? packagesCache.map((item) => `
            <article class="trainer-compact-row">
                <div class="trainer-compact-row-main"><strong>${escapeHtml(item.name)}</strong><span>${moneyValue(item.price)} · ${item.sessionCount ? `${Number(item.sessionCount)} جلسة` : `${Number(item.durationDays)} يوم`} · ${item.serviceMode === 'online' ? 'أونلاين' : item.serviceMode === 'in_person' ? 'حضوري' : 'هجين'}</span></div>
                <span class="trainer-status-pill trainer-status-pill--${escapeHtml(item.status)}">${escapeHtml(statusLabel(item.status))}</span>
            </article>`).join('') : '<div class="trainer-empty-state"><strong>لا توجد باقات بعد.</strong><span>أضف أول باقة لربط الخدمات بالتحصيل والجلسات.</span></div>';
        populatePackageSelect('trainerPurchasePackage');
    }

    function renderSessions(payload) {
        sessionsCache = Array.isArray(payload?.sessions) ? payload.sessions : [];
        const target = byId('trainerSessionsList');
        if (!target) return;
        target.innerHTML = sessionsCache.length ? sessionsCache.map((item) => `
            <article class="trainer-compact-row" data-session-id="${Number(item.id)}">
                <div class="trainer-compact-row-main"><strong>${escapeHtml(item.clientName || 'عميل')}</strong><span>${formatDate(item.scheduledStart, true)} · ${formatDate(item.scheduledEnd, true)}</span></div>
                <div class="trainer-compact-row-actions"><span class="trainer-status-pill trainer-status-pill--${escapeHtml(item.status)}">${escapeHtml(statusLabel(item.status))}</span>${item.status === 'scheduled' ? '<button type="button" class="trainer-inline-action" data-session-action="complete">إتمام</button><button type="button" class="trainer-inline-action" data-session-action="cancel">إلغاء</button>' : ''}</div>
            </article>`).join('') : '<div class="trainer-empty-state"><strong>لا توجد جلسات مجدولة.</strong><span>ستظهر المواعيد القادمة هنا بعد جدولتها.</span></div>';
    }

    function renderPurchases(payload) {
        purchasesCache = Array.isArray(payload?.purchases) ? payload.purchases : [];
        const target = byId('trainerPurchasesList');
        if (!target) return;
        target.innerHTML = purchasesCache.length ? purchasesCache.map((item) => `
            <article class="trainer-compact-row">
                <div class="trainer-compact-row-main"><strong>${escapeHtml(item.clientName || 'عميل')} · ${escapeHtml(item.packageName || 'باقة')}</strong><span>${moneyValue(item.amountPaid)} مدفوع من ${moneyValue(item.amountDue)} · متبقي ${moneyValue(item.amountRemaining)} · ${formatDate(item.startsOn)}</span></div>
                <div class="trainer-compact-row-actions"><span class="trainer-status-pill trainer-status-pill--${escapeHtml(item.status)}">${escapeHtml(statusLabel(item.status))}</span>${Number(item.amountRemaining) > 0 && item.status !== 'cancelled' ? `<button type="button" class="trainer-inline-action" data-purchase-action="payment" data-purchase-id="${Number(item.id)}">دفعة</button>` : ''}</div>
            </article>`).join('') : '<div class="trainer-empty-state"><strong>لا توجد مشتريات بعد.</strong><span>سجّل بيع أول باقة لبدء متابعة المدفوعات.</span></div>';
        populatePurchaseSelect('trainerSessionPurchase', byId('trainerSessionClient')?.value || '');
    }

    async function loadOperations() {
        try {
            const [packages, sessions, purchases] = await Promise.all([
                api('/api/trainer/packages'),
                api('/api/trainer/sessions'),
                api('/api/trainer/package-purchases')
            ]);
            renderPackages(packages);
            renderSessions(sessions);
            renderPurchases(purchases);
            setSectionMessage('trainerPackagesMessage', packagesCache.length ? `${packagesCache.length} باقة` : '');
            setSectionMessage('trainerSessionsMessage', sessionsCache.length ? `${sessionsCache.length} جلسة` : '');
            setSectionMessage('trainerPurchasesMessage', purchasesCache.length ? `${purchasesCache.length} عملية شراء` : '');
        } catch (error) {
            const text = error.message || 'تعذر تحميل العمليات التجارية.';
            setSectionMessage('trainerPackagesMessage', text, true);
            setSectionMessage('trainerSessionsMessage', text, true);
            setSectionMessage('trainerPurchasesMessage', text, true);
        }
    }

    function renderReports(payload) {
        const summary = payload?.summary || {};
        setText(byId('trainerReportRevenue'), moneyValue(summary.netRevenue));
        setText(byId('trainerReportNewClients'), Number(summary.newClients || 0));
        setText(byId('trainerReportCompletedSessions'), Number(summary.completedSessions || 0));
        setText(byId('trainerReportTotalSessions'), Number(summary.totalSessions || 0));
        setText(byId('trainerReportOutstanding'), moneyValue(summary.outstandingBalance));
        setText(byId('trainerReportProgress'), `${Number(summary.measurements || 0)} / ${Number(summary.checkins || 0)}`);
        const period = payload?.period;
        if (period?.from && period?.to) setText(byId('trainerReportsPeriod'), `${formatDate(period.from)} — ${formatDate(period.to)}`);
        setSectionMessage('trainerReportsMessage', '');
    }

    async function loadReports() {
        try {
            renderReports(await api('/api/trainer/reports/summary'));
        } catch (error) {
            setSectionMessage('trainerReportsMessage', error.message || 'تعذر تحميل التقرير.', true);
        }
    }

    function resetPackageForm() {
        byId('trainerPackageForm')?.reset();
        setText(byId('trainerPackageFormMessage'), '');
    }

    function openPackageDialog() {
        resetPackageForm();
        openDialog(byId('trainerPackageDialog'));
        byId('trainerPackageName')?.focus();
    }

    async function savePackage(event) {
        event.preventDefault();
        const button = byId('trainerPackageSave');
        const payload = {
            name: byId('trainerPackageName')?.value.trim(),
            price: Number(byId('trainerPackagePrice')?.value),
            durationDays: byId('trainerPackageDuration')?.value || null,
            sessionCount: byId('trainerPackageSessions')?.value || null,
            serviceMode: byId('trainerPackageMode')?.value,
            description: byId('trainerPackageDescription')?.value.trim()
        };
        if (!payload.name || !Number.isFinite(payload.price) || (payload.durationDays == null && payload.sessionCount == null)) {
            setText(byId('trainerPackageFormMessage'), 'أدخل اسمًا وسعرًا وحدد مدة أو عدد جلسات.');
            return;
        }
        button.disabled = true;
        try {
            await api('/api/trainer/packages', { method: 'POST', body: JSON.stringify(payload) });
            closeDialog(byId('trainerPackageDialog'));
            await Promise.all([loadOperations(), loadWorkspace(), loadReports()]);
        } catch (error) { setText(byId('trainerPackageFormMessage'), error.message || 'تعذر حفظ الباقة.'); }
        finally { button.disabled = false; }
    }

    function resetSessionForm() {
        byId('trainerSessionForm')?.reset();
        populateClientSelect('trainerSessionClient');
        populatePurchaseSelect('trainerSessionPurchase');
        const start = new Date();
        const end = new Date(start.getTime() + 60 * 60000);
        byId('trainerSessionStart').value = localDateTimeValue(start);
        byId('trainerSessionEnd').value = localDateTimeValue(end);
        setText(byId('trainerSessionFormMessage'), '');
    }

    function openSessionDialog() {
        resetSessionForm();
        openDialog(byId('trainerSessionDialog'));
        byId('trainerSessionClient')?.focus();
    }

    function dateTimeToIso(value) {
        const date = new Date(value);
        return value && !Number.isNaN(date.getTime()) ? date.toISOString() : null;
    }

    function requestKey(prefix) {
        return `${prefix}-${typeof globalThis.crypto?.randomUUID === 'function' ? globalThis.crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`}`;
    }

    async function saveSession(event) {
        event.preventDefault();
        const button = byId('trainerSessionSave');
        const payload = {
            clientId: Number(byId('trainerSessionClient')?.value),
            packagePurchaseId: byId('trainerSessionPurchase')?.value || null,
            scheduledStart: dateTimeToIso(byId('trainerSessionStart')?.value),
            scheduledEnd: dateTimeToIso(byId('trainerSessionEnd')?.value),
            notes: byId('trainerSessionNotes')?.value.trim(),
            idempotencyKey: requestKey('trainer-session')
        };
        if (!payload.clientId || !payload.scheduledStart || !payload.scheduledEnd) { setText(byId('trainerSessionFormMessage'), 'اختر العميل وموعد البداية والنهاية.'); return; }
        button.disabled = true;
        try {
            await api('/api/trainer/sessions', { method: 'POST', body: JSON.stringify(payload) });
            closeDialog(byId('trainerSessionDialog'));
            await Promise.all([loadOperations(), loadWorkspace(), loadReports()]);
        } catch (error) { setText(byId('trainerSessionFormMessage'), error.message || 'تعذر حفظ الجلسة.'); }
        finally { button.disabled = false; }
    }

    function resetPurchaseForm() {
        byId('trainerPurchaseForm')?.reset();
        populateClientSelect('trainerPurchaseClient');
        populatePackageSelect('trainerPurchasePackage');
        byId('trainerPurchaseStart').value = localDateValue();
        byId('trainerPurchasePaidAt').value = localDateValue();
        setText(byId('trainerPurchaseFormMessage'), '');
    }

    function openPurchaseDialog() {
        resetPurchaseForm();
        openDialog(byId('trainerPurchaseDialog'));
        byId('trainerPurchaseClient')?.focus();
    }

    async function savePurchase(event) {
        event.preventDefault();
        const button = byId('trainerPurchaseSave');
        const amount = Number(byId('trainerPurchasePaid')?.value || 0);
        const payload = {
            clientId: Number(byId('trainerPurchaseClient')?.value),
            packageId: Number(byId('trainerPurchasePackage')?.value),
            startsOn: byId('trainerPurchaseStart')?.value,
            amountPaid: amount,
            paymentMethod: byId('trainerPurchaseMethod')?.value,
            notes: byId('trainerPurchaseNotes')?.value.trim(),
            idempotencyKey: requestKey('trainer-purchase')
        };
        if (amount > 0) payload.paidAt = byId('trainerPurchasePaidAt')?.value;
        if (!payload.clientId || !payload.packageId || !payload.startsOn) { setText(byId('trainerPurchaseFormMessage'), 'اختر العميل والباقة وتاريخ البداية.'); return; }
        button.disabled = true;
        try {
            await api('/api/trainer/package-purchases', { method: 'POST', body: JSON.stringify(payload) });
            closeDialog(byId('trainerPurchaseDialog'));
            await Promise.all([loadOperations(), loadWorkspace(), loadReports()]);
        } catch (error) { setText(byId('trainerPurchaseFormMessage'), error.message || 'تعذر حفظ شراء الباقة.'); }
        finally { button.disabled = false; }
    }

    function openPaymentDialog(purchaseId) {
        const purchase = purchasesCache.find((item) => Number(item.id) === Number(purchaseId));
        if (!purchase) return;
        byId('trainerPaymentForm')?.reset();
        byId('trainerPaymentPurchaseId').value = purchase.id;
        byId('trainerPaymentAmount').value = Number(purchase.amountRemaining || 0).toFixed(2);
        byId('trainerPaymentPaidAt').value = localDateValue();
        setText(byId('trainerPaymentFormMessage'), `متبقي ${moneyValue(purchase.amountRemaining)} على ${purchase.clientName || 'العميل'}.`);
        openDialog(byId('trainerPaymentDialog'));
        byId('trainerPaymentAmount')?.focus();
    }

    async function savePayment(event) {
        event.preventDefault();
        const button = byId('trainerPaymentSave');
        const purchaseId = Number(byId('trainerPaymentPurchaseId')?.value);
        const amount = Number(byId('trainerPaymentAmount')?.value);
        if (!purchaseId || !Number.isFinite(amount) || amount <= 0) { setText(byId('trainerPaymentFormMessage'), 'أدخل مبلغًا صحيحًا.'); return; }
        button.disabled = true;
        const payload = { amountPaid: amount, paymentMethod: byId('trainerPaymentMethod')?.value, paidAt: byId('trainerPaymentPaidAt')?.value, notes: byId('trainerPaymentNotes')?.value.trim(), idempotencyKey: requestKey('trainer-payment') };
        try {
            await api(`/api/trainer/package-purchases/${purchaseId}/payments`, { method: 'POST', body: JSON.stringify(payload) });
            closeDialog(byId('trainerPaymentDialog'));
            await Promise.all([loadOperations(), loadWorkspace(), loadReports()]);
        } catch (error) { setText(byId('trainerPaymentFormMessage'), error.message || 'تعذر حفظ الدفعة.'); }
        finally { button.disabled = false; }
    }

    async function updateSessionStatus(sessionId, statusValue, button) {
        button.disabled = true;
        try {
            await api(`/api/trainer/sessions/${Number(sessionId)}/status`, { method: 'PATCH', body: JSON.stringify({ status: statusValue }) });
            await Promise.all([loadOperations(), loadWorkspace(), loadReports()]);
        } catch (error) { setSectionMessage('trainerSessionsMessage', error.message || 'تعذر تحديث الجلسة.', true); }
        finally { button.disabled = false; }
    }

    function renderTimeline(payload) {
        const target = byId('trainerTimelineList');
        const rows = Array.isArray(payload?.timeline) ? payload.timeline : [];
        if (!target) return;
        target.innerHTML = rows.length ? rows.map((item) => `<article class="trainer-timeline-item"><span class="trainer-timeline-dot" aria-hidden="true"></span><div><strong>${escapeHtml(item.title || item.type || 'نشاط')}</strong><span>${formatDate(item.occurredAt, true)}</span>${item.details ? `<p>${escapeHtml(item.details)}</p>` : ''}</div></article>`).join('') : '<div class="trainer-empty-state"><strong>لا توجد أحداث بعد.</strong><span>ستظهر القياسات والخطط والجلسات والمدفوعات هنا.</span></div>';
    }

    async function openTimeline(clientId) {
        const target = byId('trainerTimelineList');
        setText(target, 'جارٍ تحميل الخط الزمني...');
        openDialog(byId('trainerTimelineDialog'));
        try { renderTimeline(await api(`/api/trainer/clients/${Number(clientId)}/timeline?limit=100`)); }
        catch (error) { setText(target, error.message || 'تعذر تحميل الخط الزمني.'); }
    }

    function openMeasurementDialog(clientId) {
        byId('trainerMeasurementForm')?.reset();
        byId('trainerMeasurementClientId').value = Number(clientId);
        byId('trainerMeasurementDate').value = localDateValue();
        setText(byId('trainerMeasurementFormMessage'), '');
        openDialog(byId('trainerMeasurementDialog'));
        byId('trainerMeasurementWeight')?.focus();
    }

    function numericOrNull(id) {
        const value = byId(id)?.value;
        return value === '' || value == null ? null : Number(value);
    }

    async function saveMeasurement(event) {
        event.preventDefault();
        const button = byId('trainerMeasurementSave');
        const clientId = Number(byId('trainerMeasurementClientId')?.value);
        const payload = {
            measuredAt: byId('trainerMeasurementDate')?.value,
            weightKg: numericOrNull('trainerMeasurementWeight'),
            heightCm: numericOrNull('trainerMeasurementHeight'),
            bodyFatPercent: numericOrNull('trainerMeasurementFat'),
            chestCm: numericOrNull('trainerMeasurementChest'),
            waistCm: numericOrNull('trainerMeasurementWaist'),
            hipsCm: numericOrNull('trainerMeasurementHips'),
            armsCm: numericOrNull('trainerMeasurementArms'),
            thighsCm: numericOrNull('trainerMeasurementThighs'),
            notes: byId('trainerMeasurementNotes')?.value.trim()
        };
        if (!clientId || !payload.measuredAt || !Object.values(payload).some((value) => typeof value === 'number' && Number.isFinite(value))) { setText(byId('trainerMeasurementFormMessage'), 'أدخل التاريخ وقيمة قياس واحدة على الأقل.'); return; }
        button.disabled = true;
        try {
            await api(`/api/trainer/clients/${clientId}/measurements`, { method: 'POST', body: JSON.stringify(payload) });
            closeDialog(byId('trainerMeasurementDialog'));
            await loadWorkspace();
            await openDetails(clientId);
        } catch (error) { setText(byId('trainerMeasurementFormMessage'), error.message || 'تعذر حفظ القياس.'); }
        finally { button.disabled = false; }
    }

    function openCheckinDialog(clientId) {
        byId('trainerCheckinForm')?.reset();
        byId('trainerCheckinClientId').value = Number(clientId);
        byId('trainerCheckinDate').value = localDateValue();
        setText(byId('trainerCheckinFormMessage'), '');
        openDialog(byId('trainerCheckinDialog'));
        byId('trainerCheckinWeight')?.focus();
    }

    async function saveCheckin(event) {
        event.preventDefault();
        const button = byId('trainerCheckinSave');
        const clientId = Number(byId('trainerCheckinClientId')?.value);
        const payload = {
            checkinDate: byId('trainerCheckinDate')?.value,
            bodyweightKg: numericOrNull('trainerCheckinWeight'),
            sleepQuality: numericOrNull('trainerCheckinSleepQuality'),
            fatigue: numericOrNull('trainerCheckinFatigue'),
            mood: numericOrNull('trainerCheckinMood'),
            notes: byId('trainerCheckinNotes')?.value.trim()
        };
        if (!clientId || !payload.checkinDate || !Object.values(payload).some((value) => typeof value === 'number' && Number.isFinite(value))) { setText(byId('trainerCheckinFormMessage'), 'أدخل التاريخ وقيمة متابعة واحدة على الأقل.'); return; }
        button.disabled = true;
        try {
            await api(`/api/trainer/clients/${clientId}/checkins`, { method: 'POST', body: JSON.stringify(payload) });
            closeDialog(byId('trainerCheckinDialog'));
            await loadWorkspace();
            await openDetails(clientId);
        } catch (error) { setText(byId('trainerCheckinFormMessage'), error.message || 'تعذر حفظ المتابعة.'); }
        finally { button.disabled = false; }
    }

    byId('trainerClientDetails')?.addEventListener('click', async (event) => {
        const button = event.target.closest('[data-detail-action]');
        const clientId = Number(button?.closest('#trainerClientDetails')?.dataset.clientId);
        if (!button || !clientId) return;
        button.disabled = true;
        try {
            if (button.dataset.detailAction === 'timeline') await openTimeline(clientId);
            if (button.dataset.detailAction === 'measurement') openMeasurementDialog(clientId);
            if (button.dataset.detailAction === 'checkin') openCheckinDialog(clientId);
            if (button.dataset.detailAction === 'portal') {
                const result = await api(`/api/trainer/clients/${clientId}/portal-access`, { method: 'POST', body: JSON.stringify({}) });
                setText(byId('trainerClientDetailsPortalMessage'), `رمز البوابة: ${result.membershipCode || 'تم الإصدار'}${result.portalUrl ? ` · ${result.portalUrl}` : ''}`);
            }
        } catch (error) { setText(byId('trainerClientDetailsPortalMessage'), error.message || 'تعذر تنفيذ العملية.'); }
        finally { button.disabled = false; }
    });

    async function loadWorkspace() {
        try {
            const payload = await api('/api/trainer/workspace');
            setMetrics(payload);
            const billing = await api('/api/saas/subscription');
            const tenant = billing.tenant || {};
            setText(brand, tenant.name || 'Logic Fit');
            setText(plan, billing.subscription?.plan?.name || '—');
            setText(status, billing.subscription?.status === 'active' ? 'نشط' : (billing.subscription?.status || '—'));
            setText(message, 'مساحة العمل جاهزة بالبيانات المتاحة لحسابك.');
        } catch (error) {
            if (error?.status === 401 || error?.code === 'TENANT_ACCESS_REQUIRED') return window.location.replace('/');
            setText(message, error.message || 'تعذر تحميل مساحة العمل.');
        }
    }

    logout?.addEventListener('click', async () => { logout.disabled = true; try { await api('/api/auth/logout', { method: 'POST' }); } finally { window.location.assign('/'); } });
    byId('trainerAddClient')?.addEventListener('click', () => openClientDialog());
    byId('trainerAddClientSecondary')?.addEventListener('click', () => openClientDialog());
    byId('trainerRefreshClients')?.addEventListener('click', () => loadClients(1));
    byId('trainerRefreshReports')?.addEventListener('click', () => loadReports());
    byId('trainerClientForm')?.addEventListener('submit', saveClient);
    byId('trainerClientCancel')?.addEventListener('click', () => clientDialog?.close());
    byId('trainerClientDialogClose')?.addEventListener('click', () => clientDialog?.close());
    byId('trainerClientDetailsClose')?.addEventListener('click', () => detailsDialog?.close());
    byId('trainerTimelineDialogClose')?.addEventListener('click', () => closeDialog(byId('trainerTimelineDialog')));
    byId('trainerMeasurementForm')?.addEventListener('submit', saveMeasurement);
    byId('trainerMeasurementCancel')?.addEventListener('click', () => closeDialog(byId('trainerMeasurementDialog')));
    byId('trainerMeasurementDialogClose')?.addEventListener('click', () => closeDialog(byId('trainerMeasurementDialog')));
    byId('trainerCheckinForm')?.addEventListener('submit', saveCheckin);
    byId('trainerCheckinCancel')?.addEventListener('click', () => closeDialog(byId('trainerCheckinDialog')));
    byId('trainerCheckinDialogClose')?.addEventListener('click', () => closeDialog(byId('trainerCheckinDialog')));
    byId('trainerAddPackage')?.addEventListener('click', openPackageDialog);
    byId('trainerAddPackageSecondary')?.addEventListener('click', openPackageDialog);
    byId('trainerPackageForm')?.addEventListener('submit', savePackage);
    byId('trainerPackageCancel')?.addEventListener('click', () => closeDialog(byId('trainerPackageDialog')));
    byId('trainerPackageDialogClose')?.addEventListener('click', () => closeDialog(byId('trainerPackageDialog')));
    byId('trainerAddSession')?.addEventListener('click', openSessionDialog);
    byId('trainerScheduleSession')?.addEventListener('click', openSessionDialog);
    byId('trainerSessionForm')?.addEventListener('submit', saveSession);
    byId('trainerSessionCancel')?.addEventListener('click', () => closeDialog(byId('trainerSessionDialog')));
    byId('trainerSessionDialogClose')?.addEventListener('click', () => closeDialog(byId('trainerSessionDialog')));
    byId('trainerSessionClient')?.addEventListener('change', (event) => populatePurchaseSelect('trainerSessionPurchase', event.target.value));
    byId('trainerAddPurchase')?.addEventListener('click', openPurchaseDialog);
    byId('trainerPurchaseForm')?.addEventListener('submit', savePurchase);
    byId('trainerPurchaseCancel')?.addEventListener('click', () => closeDialog(byId('trainerPurchaseDialog')));
    byId('trainerPurchaseDialogClose')?.addEventListener('click', () => closeDialog(byId('trainerPurchaseDialog')));
    byId('trainerPaymentForm')?.addEventListener('submit', savePayment);
    byId('trainerPaymentCancel')?.addEventListener('click', () => closeDialog(byId('trainerPaymentDialog')));
    byId('trainerPaymentDialogClose')?.addEventListener('click', () => closeDialog(byId('trainerPaymentDialog')));
    clientsList?.addEventListener('click', async (event) => {
        const button = event.target.closest('[data-client-action]');
        if (!button) return;
        const id = button.closest('[data-client-id]')?.dataset.clientId;
        if (!id) return;
        button.disabled = true;
        try { if (button.dataset.clientAction === 'details') await openDetails(id); else await editClient(id); } catch (error) { setClientsMessage(error.message || 'تعذر فتح الملف.', true); }
        finally { button.disabled = false; }
    });
    byId('trainerSessionsList')?.addEventListener('click', async (event) => {
        const button = event.target.closest('[data-session-action]');
        if (!button) return;
        const sessionId = button.closest('[data-session-id]')?.dataset.sessionId;
        const statusValue = button.dataset.sessionAction === 'complete' ? 'completed' : button.dataset.sessionAction === 'no_show' ? 'no_show' : 'cancelled';
        if (sessionId) await updateSessionStatus(sessionId, statusValue, button);
    });
    byId('trainerPurchasesList')?.addEventListener('click', (event) => {
        const button = event.target.closest('[data-purchase-action="payment"]');
        if (button) openPaymentDialog(button.dataset.purchaseId);
    });
    pagination?.addEventListener('click', (event) => { const action = event.target.closest('[data-page]')?.dataset.page; if (action === 'prev') loadClients(Math.max(1, currentPage - 1)); if (action === 'next') loadClients(currentPage + 1); });
    search?.addEventListener('input', () => { clearTimeout(searchTimer); searchTimer = setTimeout(() => loadClients(1), 240); });

    document.querySelectorAll('[data-trainer-nav]').forEach((link) => {
        link.addEventListener('click', () => {
            document.querySelectorAll('[data-trainer-nav]').forEach((item) => item.classList.toggle('is-active', item === link));
        });
    });

    async function init() {
        try {
            const session = await api('/api/auth/session');
            const user = session.user;
            const tenantType = String(user?.tenantType || '').trim().toLowerCase();
            if (!user || user.mustChangePassword || user.role === 'PlatformAdmin' || tenantType !== 'independent_trainer') return window.location.replace('/');
            setText(byId('trainerWorkspaceName'), user.name || 'أيها المدرب');
            await Promise.all([loadWorkspace(), loadClients(1), loadReports()]);
            await loadOperations();
        } catch (_) { window.location.replace('/'); }
    }
    init();
})();
