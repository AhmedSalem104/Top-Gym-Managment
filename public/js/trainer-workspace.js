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
    const workspaceDataState = { clients: 'idle', operations: 'idle', reports: 'idle', workspace: 'idle' };
    let clientsCache = [];
    let clientsPagination = {};
    let packagesCache = [];
    let purchasesCache = [];
    let sessionsCache = [];

    const i18n = () => window.TopGymI18n;
    const t = (key, params = {}) => i18n()?.t(`trainerWorkspaceScreen.${key}`, params) || key;
    function localizeTrainerContent(root = document.body) {
        if (!root || !i18n()) return;
        i18n().annotateText(root, 'trainerWorkspaceScreen.');
    }
    const setText = (element, value) => {
        if (!element) return;
        element.removeAttribute('data-i18n');
        Object.keys(element.dataset).filter((key) => key.startsWith('i18nParam')).forEach((key) => delete element.dataset[key]);
        element.textContent = String(value ?? '');
        localizeTrainerContent(element);
    };
    function setI18nText(element, key, params = {}) {
        if (!element) return;
        element.dataset.i18n = `trainerWorkspaceScreen.${key}`;
        Object.entries(params).forEach(([name, value]) => {
            const dataName = `i18nParam${name[0].toUpperCase()}${name.slice(1)}`;
            element.dataset[dataName] = String(value);
        });
        element.textContent = t(key, params);
    }
    function translatedMarkup(key, params = {}) {
        const fullKey = `trainerWorkspaceScreen.${key}`;
        const attrs = Object.entries(params).map(([name, value]) => ` data-i18n-param-${name}="${escapeHtml(value)}"`).join('');
        return `<span data-i18n="${fullKey}"${attrs}>${escapeHtml(t(key, params))}</span>`;
    }
    function formattedMarkup(kind, value) {
        const raw = String(value ?? '');
        const rendered = kind === 'currency'
            ? (i18n()?.format('currency', raw, { currency: 'EGP' }) || moneyValue(raw))
            : formatDate(raw, kind === 'time');
        return `<span data-i18n-format="${kind}" data-i18n-value="${escapeHtml(raw)}"${kind === 'currency' ? ' data-i18n-currency="EGP"' : ''}>${escapeHtml(rendered)}</span>`;
    }
    const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));
    const displayPhone = (value, iso = '') => window.LogicFitPhoneInputs?.formatForDisplay?.(value, iso) || String(value || '');
    const api = async (path, options = {}) => {
        const response = await fetch(path, { credentials: 'same-origin', ...options, headers: { 'Content-Type': 'application/json', ...(options.headers || {}) } });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw Object.assign(new Error(payload.error || t('error.loadClients')), { code: payload.code, status: response.status });
        return payload;
    };

    function beginRegionLoading(target, markup) {
        if (!target || !window.topGymSkeleton) return;
        const hasContent = Boolean(target.firstElementChild && !target.querySelector(':scope > .loading'));
        if (hasContent) window.topGymSkeleton.refresh(target);
        else window.topGymSkeleton.start(target, markup);
    }

    function setClientsMessage(value, isError = false) {
        if (!clientsMessage) return;
        clientsMessage.removeAttribute('data-i18n');
        Object.keys(clientsMessage.dataset).filter((key) => key.startsWith('i18nParam')).forEach((key) => delete clientsMessage.dataset[key]);
        clientsMessage.textContent = value || '';
        clientsMessage.classList.toggle('is-error', Boolean(isError));
        localizeTrainerContent(clientsMessage);
    }

    function setSectionMessage(id, value, isError = false) {
        const element = byId(id);
        if (!element) return;
        element.removeAttribute('data-i18n');
        Object.keys(element.dataset).filter((key) => key.startsWith('i18nParam')).forEach((key) => delete element.dataset[key]);
        element.textContent = value || '';
        element.classList.toggle('is-error', Boolean(isError));
        localizeTrainerContent(element);
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
        if (i18n()) return i18n().format(withTime ? 'time' : 'date', value, withTime ? { dateStyle: 'medium', timeStyle: 'short' } : { dateStyle: 'medium' });
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
        if (i18n()) return i18n().format('currency', Number(value || 0), { currency: 'EGP' });
        return `${Number(value || 0).toLocaleString('ar-EG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ج.م`;
    }

    function statusLabel(value) {
        const keys = { scheduled: 'status.session.scheduled', completed: 'status.session.completed', cancelled: 'status.session.cancelled', no_show: 'status.session.noShow', active: 'status.purchase.active', completed_purchase: 'status.purchase.completed' };
        return keys[value] ? t(keys[value]) : value || '—';
    }
    function statusMarkup(value) {
        const keys = { scheduled: 'status.session.scheduled', completed: 'status.session.completed', cancelled: 'status.session.cancelled', no_show: 'status.session.noShow', active: 'status.purchase.active', completed_purchase: 'status.purchase.completed' };
        return keys[value] ? translatedMarkup(keys[value]) : escapeHtml(value || '—');
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
        populateSelect(id, clientsCache.map((client) => ({ id: client.id, label: client.fullName })), value, t('form.client'));
    }

    function populatePackageSelect(id, value = '') {
        populateSelect(id, packagesCache.filter((item) => item.status === 'active').map((item) => ({ id: item.id, label: `${item.name} · ${moneyValue(item.price)}` })), value, t('form.package'));
    }

    function populatePurchaseSelect(id, memberId = '', value = '') {
        const items = purchasesCache.filter((item) => !memberId || Number(item.memberId) === Number(memberId));
        populateSelect(id, items.map((item) => ({ id: item.id, label: `${item.packageName || t('form.package')} · ${t('money.remaining')} ${moneyValue(item.amountRemaining)}` })), value, t('option.noPackage'));
    }

    function renderEmpty(messageText = 'لا يوجد عملاء بعد.') {
        if (clientsList) {
            clientsList.innerHTML = `<div class="trainer-empty-state"><strong>${escapeHtml(messageText)}</strong><span>${escapeHtml(t('empty.clientsHint'))}</span></div>`;
            localizeTrainerContent(clientsList);
        }
    }

    function renderClients(payload) {
        const clients = Array.isArray(payload?.clients) ? payload.clients : [];
        clientsCache = clients;
        clientsPagination = payload?.pagination || {};
        if (!clients.length) { renderEmpty(search?.value ? t('empty.search') : t('empty.clients')); renderPagination({}); return; }
        clientsList.innerHTML = clients.map((client) => `
            <article class="trainer-client-row" data-client-id="${Number(client.id)}">
                <div class="trainer-client-name"><strong title="${escapeHtml(client.fullName)}">${escapeHtml(client.fullName)}</strong><span>${escapeHtml(client.phone ? displayPhone(client.phone, client.phoneCountry) : (client.email || t('empty.contact')))}</span></div>
                <div class="trainer-client-goal" title="${escapeHtml(client.primaryGoal || '')}">${escapeHtml(client.primaryGoal || t('empty.goal'))}</div>
                <div class="trainer-client-stat"><strong>${Number(client.workoutCount || 0)}</strong><span>${translatedMarkup('stat.training')}</span></div>
                <div class="trainer-client-stat"><strong>${Number(client.nutritionCount || 0)}</strong><span>${translatedMarkup('stat.nutrition')}</span></div>
                <div class="trainer-client-stat"><strong>${Number(client.measurementCount || 0)}</strong><span>${translatedMarkup('stat.measurements')}</span></div>
                <div class="trainer-client-actions"><button type="button" data-client-action="details">${translatedMarkup('action.open')}</button><button type="button" data-client-action="edit">${translatedMarkup('action.edit')}</button></div>
            </article>`).join('');
        localizeTrainerContent(clientsList);
        renderPagination(payload?.pagination);
    }

    function renderPagination(info = {}) {
        if (!pagination) return;
        const totalPages = Number(info.totalPages || 0);
        pagination.hidden = totalPages <= 1;
        if (pagination.hidden) return;
        pagination.innerHTML = `<button type="button" data-page="prev" ${info.hasPrevious ? '' : 'disabled'} aria-label="${escapeHtml(t('pagination.previous'))}">‹</button><span>${Number(info.page || 1)} / ${totalPages}</span><button type="button" data-page="next" ${info.hasNext ? '' : 'disabled'} aria-label="${escapeHtml(t('pagination.next'))}">›</button>`;
        localizeTrainerContent(pagination);
    }

    async function loadClients(pageNumber = currentPage) {
        workspaceDataState.clients = 'loading';
        currentPage = pageNumber;
        setClientsMessage(t('state.loadingClients'));
        beginRegionLoading(clientsList, window.topGymSkeleton?.list({ rows: 5, className: 'trainer-clients-skeleton' }));
        try {
            const payload = await api(`/api/trainer/clients?page=${currentPage}&pageSize=20&search=${encodeURIComponent(search?.value || '')}`);
            renderClients(payload);
            const total = Number(payload.pagination?.total || 0);
            if (total) {
                setI18nText(clientsMessage, total === 1 ? 'state.clientCountSingular' : 'state.clientCount', { count: total });
            } else setClientsMessage('');
        } catch (error) {
            setClientsMessage(error.message || t('error.loadClients'), true);
            renderEmpty(t('error.loadClientList'));
        } finally {
            window.topGymSkeleton?.ready(clientsList);
            workspaceDataState.clients = 'ready';
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
        const payments = byId('trainerMetricPayments');
        if (metrics.outstandingPayments == null) {
            setText(payments, '—');
        } else {
            payments.dataset.i18nFormat = 'currency';
            payments.dataset.i18nValue = String(metrics.outstandingPayments);
            payments.dataset.i18nCurrency = 'EGP';
            payments.textContent = moneyValue(metrics.outstandingPayments);
        }
    }

    function resetClientForm(client = null) {
        byId('trainerClientForm')?.reset();
        if (byId('trainerClientId')) byId('trainerClientId').value = client?.id || '';
        byId('trainerClientName').value = client?.fullName || '';
        window.LogicFitPhoneInputs?.setValue?.(byId('trainerClientPhone'), client?.phoneNational || client?.phone || '', client?.phoneCountry || '');
        byId('trainerClientEmail').value = client?.email || '';
        byId('trainerClientGoal').value = client?.primaryGoal || '';
        byId('trainerClientStatus').value = client?.status || 'active';
        byId('trainerClientNotes').value = client?.notes || '';
        setText(byId('trainerClientDialogTitle'), client ? t('dialog.editClient') : t('action.addClient'));
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
        container.innerHTML = `<p>${escapeHtml(t('state.loadingProfile'))}</p>`;
        if (typeof detailsDialog?.showModal === 'function') detailsDialog.showModal();
        const payload = await api(`/api/trainer/clients/${Number(id)}`);
        const client = payload.client || {};
        container.dataset.clientId = String(Number(id));
        container.innerHTML = `<div class="trainer-client-details-grid">
            <div class="trainer-detail-stat"><span>${escapeHtml(t('details.name'))}</span><strong>${escapeHtml(client.fullName)}</strong></div>
            <div class="trainer-detail-stat"><span>${escapeHtml(t('details.phone'))}</span><strong>${escapeHtml(displayPhone(client.phone, client.phoneCountry) || '—')}</strong></div>
            <div class="trainer-detail-stat"><span>${escapeHtml(t('details.trainingPlans'))}</span><strong>${Number(payload.trainingPlans?.length || 0)}</strong></div>
            <div class="trainer-detail-stat"><span>${escapeHtml(t('details.nutritionPlans'))}</span><strong>${Number(payload.nutritionPlans?.length || 0)}</strong></div>
            <div class="trainer-detail-stat"><span>${escapeHtml(t('details.measurements'))}</span><strong>${Number(payload.measurements?.length || 0)}</strong></div>
            <div class="trainer-detail-stat"><span>${escapeHtml(t('details.checkins'))}</span><strong>${Number(payload.checkins?.length || 0)}</strong></div>
        </div><p class="trainer-detail-note"><strong>${escapeHtml(t('details.goal'))}</strong> ${escapeHtml(client.primaryGoal || t('details.noGoal'))}<br><strong>${escapeHtml(t('details.notes'))}</strong> ${escapeHtml(client.notes || t('details.noNotes'))}</p><div class="trainer-detail-actions"><button type="button" class="btn btn-light btn-small" data-detail-action="timeline">${escapeHtml(t('action.viewTimeline'))}</button><button type="button" class="btn btn-light btn-small" data-detail-action="measurement">${escapeHtml(t('action.addMeasurement'))}</button><button type="button" class="btn btn-light btn-small" data-detail-action="checkin">${escapeHtml(t('action.addCheckin'))}</button><button type="button" class="btn btn-primary btn-small" data-detail-action="portal">${escapeHtml(t('action.issuePortalAccess'))}</button></div><p id="trainerClientDetailsPortalMessage" class="trainer-inline-message" role="status"></p>`;
        localizeTrainerContent(container);
    }

    async function editClient(id) {
        try { const payload = await api(`/api/trainer/clients/${Number(id)}`); openClientDialog(payload.client); } catch (error) { setClientsMessage(error.message, true); }
    }

    async function saveClient(event) {
        event.preventDefault();
        const saveButton = byId('trainerClientSave');
        const id = byId('trainerClientId')?.value;
        const phonePayload = window.LogicFitPhoneInputs?.getSubmissionPayload?.(byId('trainerClientPhone')) || {};
        const payload = {
            fullName: byId('trainerClientName').value.trim(),
            phone: phonePayload.phone || '',
            phoneNational: phonePayload.phoneNational || '',
            phoneCountry: phonePayload.phoneCountry || '',
            email: byId('trainerClientEmail').value.trim(),
            primaryGoal: byId('trainerClientGoal').value.trim(),
            status: byId('trainerClientStatus').value,
            notes: byId('trainerClientNotes').value.trim()
        };
        if (!payload.fullName || !payload.phone) { setText(byId('trainerClientFormMessage'), t('validation.clientRequired')); return; }
        saveButton.disabled = true;
        setText(byId('trainerClientFormMessage'), t('state.saving'));
        try {
            if (id) await api(`/api/trainer/clients/${Number(id)}`, { method: 'PATCH', body: JSON.stringify(payload) });
            else await api('/api/trainer/clients', { method: 'POST', body: JSON.stringify(payload) });
            clientDialog?.close();
            await Promise.all([loadClients(currentPage), loadWorkspace()]);
        } catch (error) { setText(byId('trainerClientFormMessage'), error.message || t('error.saveClient')); }
        finally { saveButton.disabled = false; }
    }

    function renderPackages(payload) {
        packagesCache = Array.isArray(payload?.packages) ? payload.packages : [];
        const target = byId('trainerPackagesList');
        if (!target) return;
        target.innerHTML = packagesCache.length ? packagesCache.map((item) => `
            <article class="trainer-compact-row">
                <div class="trainer-compact-row-main"><strong>${escapeHtml(item.name)}</strong><span>${formattedMarkup('currency', item.price)} · ${item.sessionCount ? translatedMarkup('duration.sessions', { count: Number(item.sessionCount) }) : translatedMarkup('duration.days', { count: Number(item.durationDays) })} · ${translatedMarkup(item.serviceMode === 'online' ? 'option.online' : item.serviceMode === 'in_person' ? 'option.inPerson' : 'service.hybrid')}</span></div>
                <span class="trainer-status-pill trainer-status-pill--${escapeHtml(item.status)}">${statusMarkup(item.status)}</span>
            </article>`).join('') : `<div class="trainer-empty-state"><strong>${escapeHtml(t('empty.packages'))}</strong><span>${escapeHtml(t('empty.packagesHint'))}</span></div>`;
        localizeTrainerContent(target);
        populatePackageSelect('trainerPurchasePackage');
    }

    function renderSessions(payload) {
        sessionsCache = Array.isArray(payload?.sessions) ? payload.sessions : [];
        const target = byId('trainerSessionsList');
        if (!target) return;
        target.innerHTML = sessionsCache.length ? sessionsCache.map((item) => `
            <article class="trainer-compact-row" data-session-id="${Number(item.id)}">
                <div class="trainer-compact-row-main"><strong>${escapeHtml(item.clientName || t('form.client'))}</strong><span>${formattedMarkup('time', item.scheduledStart)} · ${formattedMarkup('time', item.scheduledEnd)}</span></div>
                <div class="trainer-compact-row-actions"><span class="trainer-status-pill trainer-status-pill--${escapeHtml(item.status)}">${statusMarkup(item.status)}</span>${item.status === 'scheduled' ? `<button type="button" class="trainer-inline-action" data-session-action="complete">${escapeHtml(t('action.complete'))}</button><button type="button" class="trainer-inline-action" data-session-action="cancel">${escapeHtml(t('action.cancel'))}</button>` : ''}</div>
            </article>`).join('') : `<div class="trainer-empty-state"><strong>${escapeHtml(t('empty.sessions'))}</strong><span>${escapeHtml(t('empty.sessionsHint'))}</span></div>`;
        localizeTrainerContent(target);
    }

    function renderPurchases(payload) {
        purchasesCache = Array.isArray(payload?.purchases) ? payload.purchases : [];
        const target = byId('trainerPurchasesList');
        if (!target) return;
        target.innerHTML = purchasesCache.length ? purchasesCache.map((item) => `
            <article class="trainer-compact-row">
                <div class="trainer-compact-row-main"><strong>${escapeHtml(item.clientName || t('form.client'))} · ${escapeHtml(item.packageName || t('form.package'))}</strong><span>${formattedMarkup('currency', item.amountPaid)} ${translatedMarkup('money.paidFrom')} ${formattedMarkup('currency', item.amountDue)} · ${translatedMarkup('money.remaining')} ${formattedMarkup('currency', item.amountRemaining)} · ${formattedMarkup('date', item.startsOn)}</span></div>
                <div class="trainer-compact-row-actions"><span class="trainer-status-pill trainer-status-pill--${escapeHtml(item.status)}">${statusMarkup(item.status)}</span>${Number(item.amountRemaining) > 0 && item.status !== 'cancelled' ? `<button type="button" class="trainer-inline-action" data-purchase-action="payment" data-purchase-id="${Number(item.id)}">${escapeHtml(t('action.payment'))}</button>` : ''}</div>
            </article>`).join('') : `<div class="trainer-empty-state"><strong>${escapeHtml(t('empty.purchases'))}</strong><span>${escapeHtml(t('empty.purchasesHint'))}</span></div>`;
        localizeTrainerContent(target);
        populatePurchaseSelect('trainerSessionPurchase', byId('trainerSessionClient')?.value || '');
    }

    async function loadOperations() {
        workspaceDataState.operations = 'loading';
        const operationTargets = [
            [byId('trainerPackagesList'), window.topGymSkeleton?.list({ rows: 3, className: 'trainer-packages-skeleton' })],
            [byId('trainerSessionsList'), window.topGymSkeleton?.list({ rows: 4, className: 'trainer-sessions-skeleton' })],
            [byId('trainerPurchasesList'), window.topGymSkeleton?.list({ rows: 3, className: 'trainer-purchases-skeleton' })]
        ];
        operationTargets.forEach(([target, markup]) => beginRegionLoading(target, markup));
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
            operationTargets.forEach(([target]) => {
                if (target?.querySelector('.skeleton-list')) {
                    target.innerHTML = `<div class="trainer-empty-state"><strong>${escapeHtml(text)}</strong><span>حاول تحديث هذا القسم مرة أخرى.</span></div>`;
                }
            });
        } finally {
            operationTargets.forEach(([target]) => window.topGymSkeleton?.ready(target));
            workspaceDataState.operations = 'ready';
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
        workspaceDataState.reports = 'loading';
        try {
            renderReports(await api('/api/trainer/reports/summary'));
        } catch (error) {
            setSectionMessage('trainerReportsMessage', error.message || t('error.loadReport'), true);
        } finally {
            workspaceDataState.reports = 'ready';
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
        target.innerHTML = rows.length ? rows.map((item) => `<article class="trainer-timeline-item"><span class="trainer-timeline-dot" aria-hidden="true"></span><div><strong>${escapeHtml(item.title || item.type || t('timeline.activity'))}</strong><span>${formatDate(item.occurredAt, true)}</span>${item.details ? `<p>${escapeHtml(item.details)}</p>` : ''}</div></article>`).join('') : `<div class="trainer-empty-state"><strong>${translatedMarkup('empty.timeline')}</strong><span>${translatedMarkup('empty.timelineHint')}</span></div>`;
    }

    async function openTimeline(clientId) {
        const target = byId('trainerTimelineList');
        setI18nText(target, 'state.loadingTimeline');
        openDialog(byId('trainerTimelineDialog'));
        try { renderTimeline(await api(`/api/trainer/clients/${Number(clientId)}/timeline?limit=100`)); }
        catch (error) { setText(target, error.message || t('error.loadTimeline')); }
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
        workspaceDataState.workspace = 'loading';
        const summary = document.querySelector('.trainer-workspace-summary[data-skeleton-region="trainer-metrics"]');
        window.topGymSkeleton?.start(summary, '', { preserve: true });
        try {
            const payload = await api('/api/trainer/workspace');
            setMetrics(payload);
            const billing = await api('/api/saas/subscription');
            const tenant = billing.tenant || {};
            brand.dataset.tenantName = tenant.name ? 'true' : 'false';
            setText(brand, tenant.name || t('brand'));
            setText(plan, billing.subscription?.plan?.name || '—');
            setText(status, billing.subscription?.status === 'active' ? 'نشط' : (billing.subscription?.status || '—'));
            setText(message, 'مساحة العمل جاهزة بالبيانات المتاحة لحسابك.');
        } catch (error) {
            if (error?.status === 401 || error?.code === 'TENANT_ACCESS_REQUIRED') return window.location.replace('/');
            setText(message, error.message || 'تعذر تحميل مساحة العمل.');
        } finally {
            window.topGymSkeleton?.ready(summary);
            workspaceDataState.workspace = 'ready';
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
        try { if (button.dataset.clientAction === 'details') await openDetails(id); else await editClient(id); } catch (error) { setClientsMessage(error.message || t('error.openClientFile'), true); }
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

    document.addEventListener('trainer-studio-route-enter', (event) => {
        const route = event.detail?.route;
        if (route === 'clients' && workspaceDataState.clients === 'idle') void loadClients(1);
        if (['dashboard', 'packages', 'sales'].includes(route) && workspaceDataState.operations === 'idle') void loadOperations();
        if (route === 'dashboard' && workspaceDataState.workspace === 'idle') void loadWorkspace();
        if (route === 'reports' && workspaceDataState.reports === 'idle') void loadReports();
    });

    document.addEventListener('trainer-studio-open-client', (event) => {
        const clientId = Number(event.detail?.clientId);
        if (clientId > 0) openDetails(clientId);
    });
    document.addEventListener('trainer-studio-open-session', () => openSessionDialog());

    function trainerStudioInitialRoute() {
        const prefix = '/trainer-workspace';
        const suffix = window.location.pathname.startsWith(prefix) ? window.location.pathname.slice(prefix.length) : '';
        return suffix.split('/').filter(Boolean)[0] || 'dashboard';
    }

    async function init() {
        try {
            const session = await api('/api/auth/session');
            const user = session.user;
            const tenantType = String(user?.tenantType || '').trim().toLowerCase();
            if (!user || user.mustChangePassword || user.role === 'PlatformAdmin' || tenantType !== 'independent_trainer') return window.location.replace('/');
            setText(byId('trainerWorkspaceName'), user.name || 'أيها المدرب');
            // Trainer Studio V2 owns route composition. Keep the legacy
            // handlers available for its forms, but avoid bootstrapping every
            // unrelated trainer surface on every deep link.
            const route = trainerStudioInitialRoute();
            const tasks = [loadWorkspace()];
            if (['dashboard', 'packages', 'sales', 'calendar', 'sessions'].includes(route)) tasks.push(loadOperations());
            if (['clients', 'portal'].includes(route)) tasks.push(loadClients(1));
            if (route === 'reports') tasks.push(loadReports());
            await Promise.all(tasks);
        } catch (_) { window.location.replace('/'); }
    }
    init();
})();
