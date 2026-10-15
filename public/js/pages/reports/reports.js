(() => {
    if (window.__topGymReportsLoaded) return;
    window.__topGymReportsLoaded = true;

    const state = {
        activeTab: 'overview',
        data: null,
        attendance: null,
        attendanceRange: '',
        backups: null,
        requestId: 0,
        attendanceRequestId: 0,
        reportAbortController: null,
        attendanceAbortController: null,
        loadedRangeKey: '',
        loadedAt: 0
    };

    const REPORT_TABS = [
        ['overview', 'الملخص العام', 'chart'],
        ['attendance', 'الحضور والغياب', 'attendance'],
        ['memberships', 'الاشتراكات والعضويات', 'card'],
        ['finance', 'التحصيل والمصروفات', 'wallet'],
        ['coaching', 'التدريب والتغذية', 'program'],
        ['library', 'مكتبة النظام', 'library'],
        ['backups', 'النسخ الاحتياطية', 'backup']
    ];
    const REPORT_ICON_PATHS = {
        chart: '<path d="M4 19V5"/><path d="M4 19h16"/><path d="m7 15 3-4 3 2 5-6"/>',
        attendance: '<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 7h8M8 11h3M8 15h8"/><path d="m14 11 1.5 1.5L18 10"/>',
        card: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 10h18M7 15h4"/>',
        wallet: '<path d="M4 7.5A2.5 2.5 0 0 1 6.5 5H20v14H6.5A2.5 2.5 0 0 1 4 16.5z"/><path d="M4 8h14a2 2 0 0 1 2 2v5h-5a2.5 2.5 0 0 1 0-5h5"/>',
        program: '<path d="M5 4h14v16H5z"/><path d="M8 8h8M8 12h8M8 16h5"/><path d="M9 4V2h6v2"/>',
        food: '<path d="M5 4v16M5 4c3 0 5 2 5 5H5M10 9h3M15 4v16M15 4c3 0 4 2 4 5h-4"/>',
        library: '<path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v16H6.5A2.5 2.5 0 0 0 4 21.5z"/><path d="M4 5.5v16M8 7h8M8 11h6"/>',
        backup: '<path d="M12 3v12"/><path d="m7 10 5 5 5-5"/><path d="M5 20h14"/><path d="M5 4h4"/>',
        users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>',
        payment: '<path d="M4 7.5A2.5 2.5 0 0 1 6.5 5H20v14H6.5A2.5 2.5 0 0 1 4 16.5z"/><path d="M4 9h16M8 14h3"/>',
        debt: '<circle cx="12" cy="12" r="9"/><path d="M12 8v5M12 16h.01"/>',
        whatsapp: '<path d="M20 11.5a8 8 0 0 1-8 8 8.5 8.5 0 0 1-3.7-.85L4 20l1.35-4.05A8.5 8.5 0 1 1 20 11.5Z"/><path d="M8.7 9.1c.2-.45.4-.46.7-.47h.35c.2 0 .4.08.5.34l.65 1.5c.1.23.08.42-.08.62l-.42.52c.55 1.1 1.4 1.8 2.55 2.3l.45-.5c.17-.2.36-.23.6-.14l1.42.63c.25.12.34.3.31.55-.1.8-.68 1.35-1.47 1.4-2.3.12-5.98-3.5-6.1-6.75-.02-.01.17-.75.54-1.02Z"/>',
        measure: '<path d="m4 7 3-3 13 13-3 3z"/><path d="m8 8 2-2M11 11l2-2M14 14l2-2"/>',
        filter: '<path d="M4 6h16M7 12h10M10 18h4"/>',
        refresh: '<path d="M20 11a8 8 0 0 0-14.5-4L4 9"/><path d="M4 4v5h5"/><path d="M4 13a8 8 0 0 0 14.5 4L20 15"/><path d="M20 20v-5h-5"/>',
        export: '<path d="M12 3v12"/><path d="m7 10 5 5 5-5"/><path d="M5 20h14"/>',
        calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18"/>',
        check: '<circle cx="12" cy="12" r="9"/><path d="m8 12 2.5 2.5L16.5 9"/>'
    };
    const PLAN_LABELS = { gym_only: 'plan.gymOnly', gym_cardio: 'plan.gymCardio' };
    const TYPE_LABELS = { monthly: 'plan.monthly', half_month: 'plan.halfMonth', quarterly: 'plan.quarterly', semiannual: 'plan.semiannual', annual: 'plan.annual', 'two month': 'plan.twoMonths', custom_mslzyl8m: 'plan.twoMonths' };
    const PAYMENT_LABELS = { cash: 'payment.cash', card: 'payment.card', transfer: 'payment.transfer', other: 'other' };
    const STATUS_LABELS = { active: 'status.active', expiring_soon: 'status.expiring', expired: 'status.expired', frozen: 'status.frozen', none: 'status.none', upcoming: 'status.upcoming' };
    const COACHING_STATUS_LABELS = { draft: 'draft', active: 'status.active', paused: 'paused', completed: 'completed', archived: 'archived' };
    const TRANSACTION_LABELS = { subscription: 'transactions.subscription', payment: 'transactions.payment', adjustment: 'transactions.adjustment' };

    function $(id) { return document.getElementById(id); }
    function t(key, params) { return window.TopGymI18n?.t?.(`reports.${key}`, params) || key; }
    function currentLocale() { return window.TopGymI18n?.get?.() === 'en' ? 'en' : 'ar'; }
    function localizeReports(root = $('reportsSection')) {
        if (!root || !window.TopGymI18n?.annotateText) return;
        window.TopGymI18n.annotateText(root, 'reports.', '[data-i18n-preserve], .reports-table tbody strong');
    }
    function reportPeriodText(from, to, count) {
        return t('periodMembers', { from, to, count: number(count) });
    }
    function brandName() { return String(window.topGymBranding?.get?.().identity?.brandName || 'Logic Fit').trim() || 'Logic Fit'; }
    function escapeHtml(value) { return String(value ?? '').replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[character])); }
    function displayPhone(value, iso = '') { return window.LogicFitPhoneInputs?.formatForDisplay?.(value, iso) || String(value || ''); }
    function refreshReportPhoneDisplays() {
        document.querySelectorAll('.reports-members-card tbody tr > td:first-child > small').forEach((node) => {
            const text = String(node.textContent || '');
            const separator = ' · ';
            const separatorIndex = text.lastIndexOf(separator);
            if (separatorIndex > -1) {
                const prefix = text.slice(0, separatorIndex);
                const phone = text.slice(separatorIndex + separator.length);
                node.textContent = `${prefix}${separator}${displayPhone(phone)}`;
            } else {
                node.textContent = displayPhone(text);
            }
        });
    }
    function number(value) { return Number(value || 0).toLocaleString(currentLocale() === 'en' ? 'en-EG' : 'ar-EG'); }
    function money(value) {
        const locale = currentLocale() === 'en' ? 'en-EG' : 'ar-EG';
        return new Intl.NumberFormat(locale, { style: 'currency', currency: 'EGP', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(value || 0));
    }
    function label(map, key) {
        const value = map[key];
        return value ? t(value) : key || '—';
    }
    function reportIcon(name, className = 'ui-icon') { return `<svg class="${className}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${REPORT_ICON_PATHS[name] || REPORT_ICON_PATHS.chart}</svg>`; }
    function reportBadge(value, labels, prefix = '') {
        const token = String(value || 'unknown').toLowerCase().replace(/[^a-z0-9_-]/g, '-');
        return `<span class="reports-status-badge${prefix ? ` ${prefix}-badge` : ''} ${token}">${escapeHtml(label(labels, value))}</span>`;
    }
    function reportWhatsappButton(member) {
        const memberId = member?.memberId || member?.id;
        if (!memberId || !member.phone || Number(member.amountRemaining || 0) <= 0) return '';
        const title = t('whatsapp.reminder');
        return `<button type="button" class="alert-whatsapp-button reports-whatsapp-button" data-alert-whatsapp="debt" data-report-whatsapp="true" data-member-id="${escapeHtml(memberId)}" data-alert-key="${escapeHtml(member.alertKey || '')}" data-alert-name="${escapeHtml(member.fullName)}" data-alert-phone="${escapeHtml(member.phone)}" data-alert-status="${escapeHtml(member.status || '')}" data-alert-end="${escapeHtml(member.endDate || '')}" data-alert-remaining="${escapeHtml(member.amountRemaining)}" title="${title}" aria-label="${title}">${reportIcon('whatsapp')}</button>`;
    }
    function reportKpi(title, value, meta, tone, icon = 'chart') {
        return `<article class="report-kpi ${tone}"><div class="report-kpi-top"><span class="report-kpi-label">${title}</span><span class="report-kpi-icon">${reportIcon(icon)}</span></div><strong>${value}</strong><small>${meta}</small></article>`;
    }
    function dateOnly(value) {
        if (!value) return '—';
        const raw = String(value).slice(0, 10);
        const date = new Date(`${raw}T00:00:00`);
        return Number.isNaN(date.getTime()) ? String(value) : new Intl.DateTimeFormat(currentLocale() === 'en' ? 'en-EG' : 'ar-EG', { dateStyle: 'medium' }).format(date);
    }
    function dateTime(value) {
        if (!value) return '—';
        const date = new Date(value);
        return Number.isNaN(date.getTime()) ? String(value) : new Intl.DateTimeFormat(currentLocale() === 'en' ? 'en-EG' : 'ar-EG', { dateStyle: 'medium', timeStyle: 'short' }).format(date);
    }
    function alertContactMarkup(contact) {
        if (!contact?.status) return '';
        const sent = contact.status === 'sent';
        const labelText = sent ? t('contact.sent') : t('contact.opened');
        const timestamp = sent ? contact.sentAt : contact.openedAt;
        const title = timestamp ? `${labelText} — ${dateTime(timestamp)}` : labelText;
        return `<span class="alert-contact-state ${sent ? 'sent' : 'opened'}" title="${escapeHtml(title)}"><span class="alert-contact-dot" aria-hidden="true"></span>${labelText}</span>`;
    }
    function todayIso() {
        const date = new Date();
        return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
    }
    function monthStart() { return `${todayIso().slice(0, 7)}-01`; }
    function rangeValues() { return { from: $('reportsFrom')?.value || monthStart(), to: $('reportsTo')?.value || todayIso() }; }
    function selected(id, fallback = '') { return $(id)?.value || fallback; }
    function localFilterValue() { return selected('reportsLocalSearch').trim().toLocaleLowerCase('ar-EG'); }
    function contains(value, query) { return !query || String(value || '').toLocaleLowerCase('ar-EG').includes(query); }
    function canReadFinance() { return window.topGymAuth?.isOwner?.() === true || window.topGymAuth?.hasPermission?.('finance.read') === true; }
    function canExportReports() { return window.topGymAuth?.isOwner?.() === true || window.topGymAuth?.hasPermission?.('reports.export') === true; }
    function activeViewId() { const tab = state.activeTab; return `reports${tab[0].toUpperCase()}${tab.slice(1)}View`; }

    function ensurePanel() {
        const panel = $('reportsSection');
        if (!panel || panel.dataset.ready === 'true') return panel;
        panel.dataset.ready = 'true';
        panel.innerHTML = `
            <div class="reports-header">
                <div class="reports-heading"><span class="reports-icon" aria-hidden="true"><svg class="ui-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19V5"/><path d="M4 19h16"/><path d="m7 15 3-4 3 2 5-6"/></svg></span><div><span class="reports-eyebrow">مركز التقارير</span><h2 id="reportsTitle">تقارير ${brandName()}</h2><p id="reportsPeriod">اختر التقرير والفترة لعرض بيانات دقيقة وقابلة للمتابعة.</p></div></div>
                <div class="reports-actions"><button class="btn btn-light btn-small" id="reportsExportButton" type="button"><span class="reports-button-icon">${reportIcon('export')}</span><span>تصدير CSV</span></button><button class="btn btn-primary btn-small" id="reportsRefreshButton" type="button"><span class="reports-button-icon">${reportIcon('refresh')}</span><span>تحديث البيانات</span></button></div>
            </div>
            <nav class="reports-tabs" id="reportsTabs" role="tablist" aria-label="أنواع التقارير"></nav>
            <form class="reports-filters" id="reportsForm">
                <div class="reports-filter-heading"><span>خيارات العرض</span><strong>الفترة والفلاتر</strong></div>
                <div class="reports-date-fields"><label><span>من تاريخ</span><input id="reportsFrom" type="date" required></label><label><span>إلى تاريخ</span><input id="reportsTo" type="date" required></label></div>
                <div class="reports-extra-filters" id="reportsExtraFilters"></div>
                <button class="btn btn-primary reports-submit-button" type="submit"><span class="reports-button-icon">${reportIcon('filter')}</span><span>عرض التقرير</span></button>
            </form>
            <div class="reports-view" id="reportsOverviewView" role="tabpanel"></div>
            <div class="reports-view" id="reportsAttendanceView" role="tabpanel" hidden></div>
            <div class="reports-view" id="reportsMembershipsView" role="tabpanel" hidden></div>
            <div class="reports-view" id="reportsFinanceView" role="tabpanel" hidden></div>
            <div class="reports-view" id="reportsCoachingView" role="tabpanel" hidden></div>
            <div class="reports-view" id="reportsLibraryView" role="tabpanel" hidden></div>
            <div class="reports-view" id="reportsBackupsView" role="tabpanel" hidden></div>`;

        $('reportsFrom').value = monthStart();
        $('reportsTo').value = todayIso();
        renderReportTabs();
        renderExtraFilters();
        $('reportsTabs').setAttribute('aria-label', t('tabs.label'));
        $('reportsTitle').textContent = t('title', { brand: brandName() });
        $('reportsPeriod').textContent = t('description');
        $('reportsForm').addEventListener('submit', (event) => { event.preventDefault(); loadReport(true); });
        $('reportsRefreshButton').addEventListener('click', () => loadReport(true));
        $('reportsExportButton').addEventListener('click', exportCurrentReport);
        $('reportsTabs').addEventListener('click', (event) => {
            const tab = event.target.closest('[data-report-tab]');
            if (tab) activateReportTab(tab.dataset.reportTab);
        });
        $('reportsForm').addEventListener('input', (event) => {
            if (event.target.id === 'reportsLocalSearch') {
                window.clearTimeout(state.filterTimer);
                state.filterTimer = window.setTimeout(renderActiveView, 160);
            }
        });
        $('reportsForm').addEventListener('change', (event) => {
            if (event.target.closest('.reports-extra-filters')) renderActiveView();
        });
        panel.addEventListener('click', (event) => {
            const memberAction = event.target.closest('[data-report-member-action]');
            if (memberAction) {
                window.dispatchEvent(new CustomEvent('topgym:report-member-action', { detail: { action: memberAction.dataset.reportMemberAction, id: memberAction.dataset.memberId } }));
                return;
            }
            const backupButton = event.target.closest('[data-report-backup-id]');
            if (backupButton) {
                downloadBackupArchive(backupButton.dataset.reportBackupId, backupButton);
                return;
            }
            const coachingPrintButton = event.target.closest('[data-report-coaching-action]');
            if (coachingPrintButton) {
                runReportCoachingPrintAction(coachingPrintButton.dataset.reportCoachingAction, coachingPrintButton.dataset.reportCoachingId, coachingPrintButton.dataset.reportCoachingType);
                return;
            }
            const dietDeleteButton = event.target.closest('[data-report-diet-id]');
            if (dietDeleteButton) {
                deleteDietPlanFromReport(dietDeleteButton.dataset.reportDietId, dietDeleteButton.dataset.reportDietMemberId);
                return;
            }
            const backupDeleteButton = event.target.closest('[data-report-backup-delete-id]');
            if (backupDeleteButton) deleteBackupArchiveFromReport(backupDeleteButton.dataset.reportBackupDeleteId, backupDeleteButton);
        });
        localizeReports(panel);
        return panel;
    }

    function renderReportTabs() {
        const tabs = $('reportsTabs');
        if (!tabs) return;
        const canViewFinance = canReadFinance();
        const canViewBackups = window.topGymAuth?.isOwner?.() === true;
        tabs.innerHTML = REPORT_TABS
            .filter(([id]) => (id !== 'finance' || canViewFinance) && (id !== 'backups' || canViewBackups))
            .map(([id, text, icon]) => `<button class="reports-tab${id === state.activeTab ? ' active' : ''}" type="button" role="tab" aria-selected="${id === state.activeTab}" data-report-tab="${id}"><span class="reports-tab-icon">${reportIcon(icon)}</span><span class="reports-tab-label">${t(`tab.${id}`) || text}</span></button>`).join('');
    }

    function renderExtraFilters() {
        const host = $('reportsExtraFilters');
        if (!host) return;
        const tab = state.activeTab;
        if (tab === 'overview') host.innerHTML = `<span class="reports-filter-note">${t('filter.overview')}</span>`;
        if (tab === 'attendance') host.innerHTML = `<label><span>${t('filter.attendance')}</span><input id="reportsLocalSearch" type="search" placeholder="${t('filter.memberOrPhone')}"></label>`;
        if (tab === 'memberships') host.innerHTML = `<label><span>${t('filter.membershipStatus')}</span><select id="reportsMembershipStatus"><option value="">${t('filter.allStatuses')}</option><option value="active">${t('status.active')}</option><option value="expiring_soon">${t('status.expiring')}</option><option value="frozen">${t('status.frozen')}</option><option value="expired">${t('status.expired')}</option></select></label><label><span>${t('filter.plan')}</span><select id="reportsMembershipPlan"><option value="">${t('filter.allPlans')}</option><option value="gym_only">${t('plan.gymOnly')}</option><option value="gym_cardio">${t('plan.gymCardio')}</option></select></label><label class="reports-check-field"><input id="reportsDebtorsOnly" type="checkbox"><span>${t('filter.debtors')}</span></label><label><span>${t('search')}</span><input id="reportsLocalSearch" type="search" placeholder="${t('filter.nameOrPhone')}"></label>`;
        if (tab === 'finance') host.innerHTML = `<label><span>${t('filter.type')}</span><select id="reportsFinanceType"><option value="all">${t('all')}</option><option value="payments">${t('filter.collection')}</option><option value="expenses">${t('expenses')}</option></select></label><label><span>${t('filter.paymentMethod')}</span><select id="reportsPaymentMethod"><option value="">${t('filter.allMethods')}</option><option value="cash">${t('payment.cash')}</option><option value="card">${t('payment.card')}</option><option value="transfer">${t('payment.transfer')}</option><option value="other">${t('other')}</option></select></label><label><span>${t('search')}</span><input id="reportsLocalSearch" type="search" placeholder="${t('filter.memberOrExpense')}"></label>`;
        if (tab === 'coaching') host.innerHTML = `<label><span>${t('filter.systemType')}</span><select id="reportsCoachingType"><option value="all">${t('coaching')}</option><option value="workout">${t('workoutPrograms')}</option><option value="diet">${t('dietPlans')}</option></select></label><label><span>${t('filter.status')}</span><select id="reportsCoachingStatus"><option value="">${t('filter.allStatuses')}</option><option value="active">${t('status.active')}</option><option value="draft">${t('draft')}</option><option value="paused">${t('paused')}</option><option value="completed">${t('completed')}</option><option value="archived">${t('archived')}</option></select></label><label><span>${t('search')}</span><input id="reportsLocalSearch" type="search" placeholder="${t('filter.traineeOrProgram')}"></label>`;
        if (tab === 'library') host.innerHTML = `<label><span>${t('filter.librarySection')}</span><select id="reportsLibraryType"><option value="all">${t('filter.allSections')}</option><option value="foods">${t('foods')}</option><option value="exercises">${t('exercises')}</option><option value="muscles">${t('muscles')}</option></select></label>`;
        if (tab === 'backups') host.innerHTML = `<label><span>${t('filter.archiveFormat')}</span><select id="reportsBackupFormat"><option value="">${t('filter.allArchives')}</option><option value="json.gz">.json.gz</option></select></label><span class="reports-filter-note">${t('backup.retentionNote')}</span>`;
        localizeReports(host);
    }

    function relocalizeReports() {
        const panel = $('reportsSection');
        if (!panel || panel.dataset.ready !== 'true') return;
        const controls = [...panel.querySelectorAll('#reportsExtraFilters input, #reportsExtraFilters select')]
            .map((element) => ({ id: element.id, value: element.value, checked: element.type === 'checkbox' ? element.checked : undefined }));
        renderReportTabs();
        panel.querySelector('#reportsTabs')?.setAttribute('aria-label', t('tabs.label'));
        renderExtraFilters();
        controls.forEach(({ id, value, checked }) => {
            const element = $(id);
            if (!element) return;
            if (checked !== undefined) element.checked = checked;
            else element.value = value;
        });
        const title = $('reportsTitle');
        if (title) title.textContent = t('title', { brand: brandName() });
        const description = $('reportsPeriod');
        if (description && state.data) {
            const range = rangeValues();
            description.textContent = reportPeriodText(
                dateOnly(state.data.period?.from || range.from),
                dateOnly(state.data.period?.to || range.to),
                state.data.summary?.currentMembers
            );
        }
        if (state.data || state.activeTab === 'attendance' && state.attendance || state.activeTab === 'backups' && state.backups) renderActiveView();
        localizeReports(panel);
    }

    function activateReportTab(tab) {
        if (!REPORT_TABS.some(([id]) => id === tab)) return;
        if (tab === 'finance' && !canReadFinance()) {
            tab = 'overview';
        }
        if (tab === 'backups' && window.topGymAuth?.isOwner?.() !== true) tab = 'overview';
        state.activeTab = tab;
        renderReportTabs();
        renderExtraFilters();
        localizeReports($('reportsSection'));
        document.querySelectorAll('.reports-view').forEach((view) => { view.hidden = view.id !== activeViewId(); });
        if (tab === 'attendance') loadAttendanceReport();
        else if (tab === 'backups') loadBackupReport();
        else renderActiveView();
    }

    function showLoading(id, text = t('loading')) {
        const view = $(id);
        if (view) view.innerHTML = `<div class="reports-loading">${text}</div>`;
    }

    async function getJson(path, options = {}) {
        const requestOptions = { cache: 'no-store', ...options, headers: { Accept: 'application/json', ...(options.headers || {}) } };
        const response = window.topGymApi?.raw
            ? await window.topGymApi.raw(path, requestOptions)
            : await fetch(path, requestOptions);
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error || 'تعذر تحميل التقرير.');
        return data;
    }

    async function confirmDelete(title, text) {
        if (window.Swal) {
            const result = await window.Swal.fire({
                position: 'center',
                icon: 'warning',
                title,
                text,
                showCancelButton: true,
                confirmButtonText: 'نعم، احذف',
                cancelButtonText: 'إلغاء',
                buttonsStyling: false,
                customClass: { popup: 'top-gym-alert delete-confirm-alert', confirmButton: 'btn btn-danger', cancelButton: 'btn btn-light' }
            });
            return result.isConfirmed;
        }
        return window.confirm(`${title}\n${text}`);
    }

    async function requestBackupDeleteReason() {
        if (window.Swal) {
            const result = await window.Swal.fire({
                position: 'center',
                icon: 'info',
                title: 'سبب حذف النسخة',
                input: 'textarea',
                inputLabel: 'سبب الحذف مطلوب للتدقيق',
                inputPlaceholder: 'اكتب سبب حذف النسخة المحفوظة…',
                inputAttributes: { maxlength: 1000, 'aria-label': 'سبب حذف النسخة الاحتياطية' },
                showCancelButton: true,
                confirmButtonText: 'متابعة الحذف',
                cancelButtonText: 'إلغاء',
                buttonsStyling: false,
                customClass: { popup: 'top-gym-alert delete-confirm-alert', confirmButton: 'btn btn-danger', cancelButton: 'btn btn-light' },
                inputValidator: (value) => String(value || '').trim() ? undefined : 'اكتب سبب الحذف أولًا.'
            });
            return result.isConfirmed ? String(result.value || '').trim() : '';
        }
        return String(window.prompt('اكتب سبب حذف النسخة الاحتياطية:') || '').trim();
    }

    async function deleteDietPlanFromReport(id, memberId) {
        if (!id) return;
        if (!await confirmDelete('تأكيد حذف خطة التغذية', 'سيتم حذف الخطة ووجباتها وتسجيلاتها المرتبطة بها نهائيًا.')) return;
        try {
            const response = await fetch(`/api/dietplans/${encodeURIComponent(id)}`, { method: 'DELETE' });
            const data = await response.json().catch(() => ({}));
            if (!response.ok) throw new Error(data.error || 'تعذر حذف خطة التغذية.');
            if (window.Swal) window.Swal.fire({ toast: true, position: 'top-start', icon: 'success', title: 'تم حذف خطة التغذية ✅', showConfirmButton: false, timer: 2600, customClass: { popup: 'top-gym-alert top-gym-toast' } });
            window.dispatchEvent(new CustomEvent('topgym:coaching-data-changed', { detail: { type: 'diet-deleted', memberId: Number(memberId || 0) } }));
            await loadReport(true);
        } catch (error) {
            if (window.Swal) window.Swal.fire({ position: 'center', icon: 'error', title: 'تعذر حذف الخطة', text: error.message, customClass: { popup: 'top-gym-alert' } });
        }
    }

    async function loadReport(force = false) {
        if (!window.topGymAuth?.isOwner?.() && !window.topGymAuth?.hasPermission?.('reports.read')) return;
        const panel = ensurePanel();
        if (!panel) return;
        const { from, to } = rangeValues();
        if (!from || !to) return;
        const rangeKey = `${from}:${to}`;
        if (!force && state.data && state.loadedRangeKey === rangeKey && Date.now() - state.loadedAt < 20000) {
            renderActiveView();
            return;
        }
        const requestId = ++state.requestId;
        state.reportAbortController?.abort();
        state.reportAbortController = new AbortController();
        const controller = state.reportAbortController;
        state.attendance = null;
        state.attendanceRange = '';
        state.backups = null;
        showLoading(activeViewId());
        try {
            const data = await getJson(`/api/reports?${new URLSearchParams({ from, to })}`, { signal: controller.signal });
            if (requestId !== state.requestId) return;
            state.data = data;
            state.loadedRangeKey = rangeKey;
            state.loadedAt = Date.now();
            $('reportsPeriod').textContent = reportPeriodText(dateOnly(data.period?.from || from), dateOnly(data.period?.to || to), data.summary?.currentMembers);
            renderActiveView();
            if (state.activeTab === 'attendance') loadAttendanceReport();
            if (state.activeTab === 'backups') loadBackupReport();
        } catch (error) {
            if (error.name === 'AbortError') return;
            const view = $(activeViewId());
            if (view) view.innerHTML = `<div class="reports-error"><span data-i18n-preserve>${escapeHtml(error.message || t('error'))}</span></div>`;
        }
    }

    function decorateCoachingPrintActions() {
        const view = $('reportsCoachingView');
        if (!view || !state.data?.coaching) return;
        const type = selected('reportsCoachingType', 'all');
        const query = localFilterValue();
        const status = selected('reportsCoachingStatus');
        const matches = (item) => (!status || item.status === status) && (contains(item.fullName, query) || contains(item.phone, query) || contains(item.name, query));
        const programs = (state.data.coaching.workoutPrograms || []).filter(matches);
        const diets = (state.data.coaching.dietPlans || []).filter(matches);
        const addActions = (section, items, systemType) => {
            const rows = [...(section?.querySelectorAll('tbody tr') || [])];
            rows.forEach((row, index) => {
                const item = items[index];
                const cell = row.lastElementChild;
                if (!item || !cell) return;
                const actions = cell.querySelector('.reports-coaching-actions') || document.createElement('div');
                if (actions.children.length) return;
                actions.className = 'reports-debtor-actions reports-coaching-actions';
                [['edit', 'تعديل', 'light'], ['print', 'طباعة', 'light'], ['pdf', 'PDF', 'light'], ['delete', 'حذف', 'danger']].forEach(([action, label, tone]) => {
                    const button = document.createElement('button');
                    button.type = 'button';
                    button.className = `btn btn-${tone} btn-small`;
                    if (action === 'edit' || action === 'delete') {
                        button.dataset.memberCoachingAction = `${action}-${systemType}`;
                        button.dataset.memberId = item.memberId;
                        button.dataset.id = item.id;
                    } else {
                        button.dataset.reportCoachingAction = action;
                        button.dataset.reportCoachingId = item.id;
                        button.dataset.reportCoachingType = systemType;
                    }
                    button.textContent = label;
                    button.title = label + ' النظام';
                    actions.append(button);
                });
                cell.append(actions);
            });
        };
        const sections = [...view.querySelectorAll('.finance-detail-card')];
        const workoutSection = sections.find((section) => section.textContent.includes('البرامج المنشأة'));
        const dietSection = sections.find((section) => section.textContent.includes('خطط التغذية المنشأة'));
        if (type !== 'diet') addActions(workoutSection, programs, 'workout');
        if (type !== 'workout') addActions(dietSection, diets, 'diet');
    }

    async function runReportCoachingPrintAction(action, id, type) {
        const printWindow = action === 'print' ? window.open('', '_blank', 'width=980,height=820') : null;
        if (action === 'print' && !printWindow) {
            window.showToast?.('يرجى السماح بالنوافذ المنبثقة لإتمام الطباعة.', true, 'error');
            return;
        }
        try {
            await window.topGymEnsureTab?.('print');
            if (!window.topGymPrint) throw new Error('تعذر تحميل أداة الطباعة.');
            if (action === 'pdf') return window.topGymPrint.downloadCoachingPdf(id, type);
            return window.topGymPrint.printCoachingSystem(id, type, printWindow);
        } catch (error) {
            printWindow?.close();
            window.showToast?.(error.message || 'تعذر تنفيذ الطباعة.', true, 'error');
        }
    }

    function renderActiveView() {
        if (!state.data && !['attendance', 'backups'].includes(state.activeTab)) return;
        if (state.activeTab === 'overview') renderOverview();
        if (state.activeTab === 'memberships') renderMemberships();
        if (state.activeTab === 'finance') renderFinance();
        if (state.activeTab === 'coaching') {
            renderCoaching();
            decorateCoachingPrintActions();
        }
        if (state.activeTab === 'library') renderLibrary();
        if (state.activeTab === 'attendance' && state.attendance) renderAttendance();
        if (state.activeTab === 'backups' && state.backups) renderBackups();
        refreshReportPhoneDisplays();
        localizeReports($('reportsSection'));
    }

    function renderOverview() {
        const view = $('reportsOverviewView');
        if (!view || !state.data) return;
        const data = state.data;
        const summary = data.summary || {};
        const financeAllowed = canReadFinance();
        const items = [
            [t('kpi.newMembers'), number(summary.newMembers), t('kpi.inPeriod'), 'blue', 'users'],
            [t('kpi.newMemberships'), number(summary.newMemberships), t('kpi.registeredMembership'), 'indigo', 'card'],
            [t('kpi.collections'), money(summary.collected), t('kpi.paymentCount', { count: number(summary.paidTransactions) }), 'green', 'payment'],
            [t('kpi.expenses'), money(summary.expenses), t('kpi.expenseCount', { count: number(summary.expensesCount) }), 'amber', 'wallet'],
            [t('kpi.net'), money(summary.net), summary.net < 0 ? t('kpi.needsReview') : t('kpi.positiveNet'), summary.net < 0 ? 'red' : 'teal', 'chart'],
            [t('kpi.outstanding'), money(summary.outstanding), t('kpi.subscriptionCount', { count: number(summary.outstandingCount) }), 'rose', 'debt']
        ];
        const kpis = items.slice(0, financeAllowed ? items.length : 2).map(([title, value, meta, tone, icon]) => reportKpi(title, value, meta, tone, icon)).join('');
        const timeline = renderTimeline(data, financeAllowed);
        const breakdown = renderBreakdown(data, financeAllowed);
        const debtors = financeAllowed ? (data.debtors || []) : [];
        const debtorsHtml = debtors.length ? `<table class="reports-table reports-debtors-table"><thead><tr><th>${t('member')}</th><th>${t('plan')}</th><th>${t('remaining')}</th><th>${t('action')}</th></tr></thead><tbody>${debtors.map((member) => `<tr><td><strong>${escapeHtml(member.fullName)}</strong><small>${escapeHtml(displayPhone(member.phone, member.phoneCountry) || '—')}</small></td><td>${escapeHtml(label(PLAN_LABELS, member.plan))}</td><td class="has-debt">${money(member.amountRemaining)}</td><td><div class="reports-debtor-actions">${alertContactMarkup(member.alertContact)}<button class="btn btn-light btn-small" type="button" data-report-member-action="details" data-member-id="${member.id}">${t('details')}</button><button class="btn btn-primary btn-small" type="button" data-report-member-action="payment" data-member-id="${member.id}">${t('recordPayment')}</button>${reportWhatsappButton(member)}</div></td></tr>`).join('')}</tbody></table>` : `<div class="reports-empty-state">${t('noOutstanding')}</div>`;
        view.innerHTML = `<div class="reports-kpis">${kpis}</div><div class="reports-grid"><section class="report-card"><div class="report-card-head"><div><span>${t('timeline')}</span><h3>${t('dailyMovement')}</h3></div></div>${timeline}</section><section class="report-card"><div class="report-card-head"><div><span>${t('distribution')}</span><h3>${t('plansAndMethods')}</h3></div></div>${breakdown}</section></div><section class="report-card reports-members-card"${financeAllowed ? '' : ' hidden aria-hidden="true"'}><div class="report-card-head"><div><span>${t('collectionPriority')}</span><h3>${t('membersWithDues')}</h3></div><span class="reports-members-count">${t('memberCount', { count: number(summary.debtorsCount) })}</span></div><div class="reports-table-wrap">${debtorsHtml}</div></section>`;
    }

    function renderTimeline(data, includeFinance = true) {
        const rows = data.timeline || [];
        if (!rows.length) return `<div class="reports-empty-state">${t('empty.period')}</div>`;
        if (!includeFinance) {
            const enrollmentRows = rows.map((row) => `<div class="reports-day"><div class="reports-day-bars"><span class="collected" style="height:${Math.max(2, Number(row.newMembers || 0) * 10)}%" title="${t('newMembersLegend')}"></span><span class="expenses" style="height:${Math.max(2, Number(row.newMemberships || 0) * 10)}%" title="${t('newMembershipsLegend')}"></span></div><small>${escapeHtml(dateOnly(row.date))}</small><b>${number(Number(row.newMembers || 0) + Number(row.newMemberships || 0))}</b></div>`).join('');
            return `<div class="reports-timeline-wrap"><div class="reports-mini-chart">${enrollmentRows}</div><div class="reports-chart-legend"><span><i class="collected"></i>${t('newMembersLegend')}</span><span><i class="expenses"></i>${t('newMembershipsLegend')}</span></div></div>`;
        }
        const max = Math.max(1, ...rows.map((item) => Math.max(Number(item.collected || 0), Number(item.expenses || 0))));
        const bars = rows.map((row) => {
            const collectedHeight = Math.max(row.collected ? 6 : 2, (Number(row.collected || 0) / max) * 100);
            const expenseHeight = Math.max(row.expenses ? 6 : 2, (Number(row.expenses || 0) / max) * 100);
            return `<div class="reports-day"><div class="reports-day-bars"><span class="collected" style="height:${collectedHeight}%" title="${t('collections')} ${money(row.collected)}"></span><span class="expenses" style="height:${expenseHeight}%" title="${t('expensesLegend')} ${money(row.expenses)}"></span></div><small>${escapeHtml(dateOnly(row.date).replace(/\s*٢٠٢[٤-٦]/, ''))}</small><b>${number(Number(row.newMembers || 0) + Number(row.newMemberships || 0))}</b></div>`;
        }).join('');
        return `<div class="reports-timeline-wrap"><div class="reports-mini-chart">${bars}</div><div class="reports-chart-legend"><span><i class="collected"></i>${t('collections')}</span><span><i class="expenses"></i>${t('expensesLegend')}</span><span>${t('chartCountHint')}</span></div></div>`;
    }

    function renderBreakdown(data, includeFinance = true) {
        const breakdown = data.breakdown || {};
        const planRows = (breakdown.plans || []).map((item) => `<div class="breakdown-row"><span>${escapeHtml(label(PLAN_LABELS, item.key))}</span><strong>${number(item.value)}</strong></div>`).join('');
        const paymentRows = (breakdown.paymentMethods || []).map((item) => `<div class="breakdown-row"><span>${escapeHtml(label(PAYMENT_LABELS, item.key))}</span><strong>${money(item.amount)} <small>(${number(item.count)})</small></strong></div>`).join('');
        const statusRows = (breakdown.statuses || []).map((item) => `<div class="breakdown-row"><span>${escapeHtml(label(STATUS_LABELS, item.key))}</span><strong>${number(item.value)}</strong></div>`).join('');
        return `<div class="reports-breakdown"><div class="breakdown-group"><h4>${t('plans')}</h4>${planRows || `<span class="reports-empty">${t('noData')}</span>`}</div>${includeFinance ? `<div class="breakdown-group"><h4>${t('paymentMethods')}</h4>${paymentRows || `<span class="reports-empty">${t('noPayments')}</span>`}</div>` : ''}<div class="breakdown-group"><h4>${t('currentStatuses')}</h4>${statusRows || `<span class="reports-empty">${t('noData')}</span>`}</div></div>`;
    }

    function renderMemberships() {
        const view = $('reportsMembershipsView');
        const data = state.data;
        if (!view || !data) return;
        const financeAllowed = canReadFinance();
        const status = selected('reportsMembershipStatus');
        const plan = selected('reportsMembershipPlan');
        const debtorsOnly = financeAllowed && Boolean($('reportsDebtorsOnly')?.checked);
        const query = localFilterValue();
        const members = (data.memberships || data.members || []).filter((member) => (!status || member.status === status) && (!plan || member.plan === plan) && (!debtorsOnly || Number(member.amountRemaining) > 0) && (contains(member.fullName, query) || contains(member.phone, query)));
        const statuses = (data.breakdown?.statuses || []).map((item) => `<div class="report-summary-chip"><span>${escapeHtml(label(STATUS_LABELS, item.key))}</span><strong>${number(item.value)}</strong></div>`).join('');
        const rows = members.map((member) => `<tr><td><strong>${escapeHtml(member.fullName)}</strong><small>${escapeHtml(displayPhone(member.phone, member.phoneCountry) || '—')}</small></td><td>${escapeHtml(label(PLAN_LABELS, member.plan))}<small>${escapeHtml(label(TYPE_LABELS, member.type))}</small></td><td>${reportBadge(member.status, STATUS_LABELS)}</td><td>${dateOnly(member.startDate)}<small>${t('until', { date: dateOnly(member.endDate) })}</small></td><td>${money(member.amountDue)}<small>${t('paid', { amount: money(member.amountPaid) })}</small></td><td class="${Number(member.amountRemaining) > 0 ? 'has-debt' : 'paid'}">${money(member.amountRemaining)}</td><td><div class="reports-debtor-actions">${member.alertContact ? alertContactMarkup(member.alertContact) : ''}${reportWhatsappButton(member) || `<span class="reports-no-action">${t('noAction')}</span>`}</div></td></tr>`).join('');
        view.innerHTML = `<div class="report-summary-strip">${statuses}<div class="report-summary-chip total"><span>${t('inPeriod')}</span><strong>${number(members.length)}</strong></div></div><section class="report-card reports-members-card"><div class="report-card-head"><div><span>${t('membership.periodDetails')}</span><h3>${t('membership.current')}</h3></div><span class="reports-members-count">${t('resultCount', { count: number(members.length) })}</span></div><div class="reports-table-wrap">${rows ? `<table class="reports-table"><thead><tr><th>${t('member')}</th><th>${t('membership.planAndType')}</th><th>${t('membership.status')}</th><th>${t('membership.period')}</th><th>${t('account')}</th><th>${t('remaining')}</th><th>${t('contact')}</th></tr></thead><tbody>${rows}</tbody></table>` : `<div class="reports-empty-state">${t('noMatchingFilters')}</div>`}</div></section>`;
        if (!financeAllowed) {
            view.querySelectorAll('.reports-table tr').forEach((row) => [6, 5, 4].forEach((index) => row.children[index]?.remove()));
        }
    }

    function renderFinance() {
        const view = $('reportsFinanceView');
        const data = state.data;
        if (!view || !data) return;
        const mode = selected('reportsFinanceType', 'all');
        const method = selected('reportsPaymentMethod');
        const query = localFilterValue();
        const payments = (data.payments || []).filter((item) => (!method || item.paymentMethod === method) && (contains(item.fullName, query) || contains(item.phone, query)));
        const expenses = (data.expenses || []).filter((item) => contains(item.name, query) || contains(item.notes, query));
        const paymentRows = payments.map((item) => `<tr><td><strong>${escapeHtml(item.fullName)}</strong><small>${escapeHtml(displayPhone(item.phone, item.phoneCountry) || '—')}</small></td><td>${reportBadge(item.transactionType, TRANSACTION_LABELS, 'transaction')}</td><td>${dateOnly(item.date)}</td><td>${escapeHtml(label(PAYMENT_LABELS, item.paymentMethod))}</td><td class="paid">${money(item.amountPaid)}</td><td>${money(item.amountRemaining)}</td></tr>`).join('');
        const expenseRows = expenses.map((item) => `<tr><td><strong>${escapeHtml(item.name)}</strong><small>${escapeHtml(item.notes || t('withoutNotes'))}</small></td><td>${dateOnly(item.date)}</td><td class="has-debt">${money(item.amount)}</td></tr>`).join('');
        const paymentTable = `<section class="report-card finance-detail-card"><div class="report-card-head"><div><span>${t('finance.collectionMovement')}</span><h3>${t('finance.paymentsReceipts')}</h3></div><span class="reports-members-count">${t('finance.paymentCount', { count: number(payments.length) })}</span></div><div class="reports-table-wrap">${paymentRows ? `<table class="reports-table"><thead><tr><th>${t('finance.member')}</th><th>${t('finance.transaction')}</th><th>${t('date')}</th><th>${t('filter.paymentMethod')}</th><th>${t('finance.paid')}</th><th>${t('remaining')}</th></tr></thead><tbody>${paymentRows}</tbody></table>` : `<div class="reports-empty-state">${t('finance.noMatchingPayments')}</div>`}</div></section>`;
        const expenseTable = `<section class="report-card finance-detail-card"><div class="report-card-head"><div><span>${t('finance.expenseMovement')}</span><h3>${t('finance.expenseRegister')}</h3></div><span class="reports-members-count">${t('kpi.expenseCount', { count: number(expenses.length) })}</span></div><div class="reports-table-wrap">${expenseRows ? `<table class="reports-table"><thead><tr><th>${t('finance.expenseNameNotes')}</th><th>${t('date')}</th><th>${t('amount')}</th></tr></thead><tbody>${expenseRows}</tbody></table>` : `<div class="reports-empty-state">${t('finance.noMatchingExpenses')}</div>`}</div></section>`;
        const summary = data.summary || {};
        const netMeta = Number(summary.refunds || 0) > 0 ? t('finance.netWithRefunds') : t('finance.netWithoutRefunds');
        const kpis = `<div class="reports-kpis reports-kpis-compact">${reportKpi(t('finance.actualCollections'), money(summary.collected), `${t('finance.paymentCount', { count: number(summary.paidTransactions) })} · ${t('inPeriod')}`, 'green', 'payment')}${reportKpi(t('kpi.expenses'), money(summary.expenses), `${t('kpi.expenseCount', { count: number(summary.expensesCount) })} · ${t('inPeriod')}`, 'amber', 'wallet')}${reportKpi(t('finance.net'), money(summary.net), netMeta, 'teal', 'chart')}</div>`;
        view.innerHTML = `${kpis}<div class="reports-detail-grid">${mode === 'expenses' ? expenseTable : mode === 'payments' ? paymentTable : paymentTable + expenseTable}</div>`;
    }

    function renderCoaching() {
        const view = $('reportsCoachingView');
        const data = state.data?.coaching;
        if (!view || !data) return;
        const type = selected('reportsCoachingType', 'all');
        const status = selected('reportsCoachingStatus');
        const query = localFilterValue();
        const programs = (data.workoutPrograms || []).filter((item) => (!status || item.status === status) && (contains(item.fullName, query) || contains(item.phone, query) || contains(item.name, query)));
        const diets = (data.dietPlans || []).filter((item) => (!status || item.status === status) && (contains(item.fullName, query) || contains(item.phone, query) || contains(item.name, query)));
        const stats = data.summary || {};
        const executionKpis = `<div class="reports-kpis reports-kpis-coaching reports-kpis-secondary">${reportKpi(t('coaching.volume'), `${number(stats.workoutVolumeInPeriod, 0)} ${t('coaching.kilograms')}`, t('coaching.weightReps'), 'teal', 'chart')}${reportKpi(t('coaching.caloriesLogged'), number(stats.mealCaloriesInPeriod, 0), `P ${number(stats.mealProteinInPeriod, 0)} · C ${number(stats.mealCarbsInPeriod, 0)} · F ${number(stats.mealFatsInPeriod, 0)}`, 'amber', 'food')}${reportKpi(t('coaching.dailyCheckins'), number(stats.checkinsInPeriod, 0), t('coaching.recoveryPeriod'), 'purple', 'measure')}</div>`;
        const kpis = `<div class="reports-kpis reports-kpis-coaching">${reportKpi(t('workoutPrograms'), number(stats.totalWorkoutPrograms), t('coaching.activeCount', { count: number(stats.activeWorkoutPrograms) }), 'blue', 'program')}${reportKpi(t('dietPlans'), number(stats.totalDietPlans), t('coaching.activeCount', { count: number(stats.activeDietPlans) }), 'indigo', 'food')}${reportKpi(t('coaching.sessions'), number(stats.workoutSessionsInPeriod), t('coaching.completedCount', { count: number(stats.completedWorkoutSessions) }), 'green', 'attendance')}${reportKpi(t('coaching.mealLogs'), number(stats.mealLogsInPeriod), t('kpi.inPeriod'), 'amber', 'food')}${reportKpi(t('coaching.measurements'), number(stats.measurementsInPeriod), t('coaching.addedInPeriod'), 'teal', 'measure')}</div>`;
        const workoutRows = programs.map((item) => `<tr><td><strong>${escapeHtml(item.name)}</strong><small>${escapeHtml(item.fullName)} · ${escapeHtml(displayPhone(item.phone, item.phoneCountry) || '—')}</small></td><td>${dateOnly(item.startDate)}<small>${t('until', { date: dateOnly(item.endDate) })}</small></td><td>${reportBadge(item.status, COACHING_STATUS_LABELS)}</td><td>${t('coaching.routines', { count: number(item.routines) })}</td><td>${t('coaching.exerciseCount', { count: number(item.exercises) })}</td><td><div class="reports-coaching-actions"></div></td></tr>`).join('');
        const dietRows = diets.map((item) => `<tr><td><strong>${escapeHtml(item.name)}</strong><small>${escapeHtml(item.fullName)} · ${escapeHtml(displayPhone(item.phone, item.phoneCountry) || '—')}</small></td><td>${dateOnly(item.startDate)}<small>${t('until', { date: dateOnly(item.endDate) })}</small></td><td>${reportBadge(item.status, COACHING_STATUS_LABELS)}</td><td>${number(item.targetCalories)} ${t('coaching.calories')}</td><td>${t('coaching.mealFoodCount', { meals: number(item.meals), foods: number(item.foods) })}</td><td><div class="reports-coaching-actions"></div></td></tr>`).join('');
        const workoutTable = `<section class="report-card finance-detail-card"><div class="report-card-head"><div><span>${t('coaching.training')}</span><h3>${t('coaching.workoutsCreated')}</h3></div><span class="reports-members-count">${number(programs.length)}</span></div><div class="reports-table-wrap">${workoutRows ? `<table class="reports-table"><thead><tr><th>${t('coaching.planAndTrainee')}</th><th>${t('coaching.period')}</th><th>${t('membership.status')}</th><th>${t('coaching.days')}</th><th>${t('coaching.exercises')}</th><th>${t('coaching.actions')}</th></tr></thead><tbody>${workoutRows}</tbody></table>` : `<div class="reports-empty-state">${t('coaching.noPrograms')}</div>`}</div></section>`;
        const dietTable = `<section class="report-card finance-detail-card"><div class="report-card-head"><div><span>${t('coaching.nutrition')}</span><h3>${t('coaching.dietsCreated')}</h3></div><span class="reports-members-count">${number(diets.length)}</span></div><div class="reports-table-wrap">${dietRows ? `<table class="reports-table"><thead><tr><th>${t('coaching.dietAndTrainee')}</th><th>${t('coaching.period')}</th><th>${t('membership.status')}</th><th>${t('coaching.calories')}</th><th>${t('coaching.content')}</th><th>${t('coaching.actions')}</th></tr></thead><tbody>${dietRows}</tbody></table>` : `<div class="reports-empty-state">${t('coaching.noDiets')}</div>`}</div></section>`;
        view.innerHTML = `${kpis}${executionKpis}<div class="reports-detail-grid">${type === 'workout' ? workoutTable : type === 'diet' ? dietTable : workoutTable + dietTable}</div>`;
    }

    function renderLibrary() {
        const view = $('reportsLibraryView');
        const counts = state.data?.library?.counts || {};
        if (!view) return;
        const type = selected('reportsLibraryType', 'all');
        const rows = [
            ['foods', t('foods'), counts.foods, counts.newFoods, t('library.foodPlans')],
            ['exercises', t('exercises'), counts.exercises, counts.newExercises, t('library.trainingCatalog')],
            ['muscles', t('muscles'), counts.muscles, counts.newMuscles, t('library.muscleTargets')]
        ].filter((item) => type === 'all' || type === item[0]);
        view.innerHTML = `<div class="report-summary-strip library-summary-strip">${rows.map((item) => `<div class="report-summary-chip"><span>${item[1]}</span><strong>${number(item[2])}</strong><small>${t('library.addedCount', { count: number(item[3]) })}</small></div>`).join('')}</div><section class="report-card reports-members-card"><div class="report-card-head"><div><span>${t('library.reference')}</span><h3>${t('library.summary')}</h3></div></div><div class="reports-table-wrap"><table class="reports-table library-report-table"><thead><tr><th>${t('library.section')}</th><th>${t('library.totalItems')}</th><th>${t('library.addedInPeriod')}</th><th>${t('library.usage')}</th></tr></thead><tbody>${rows.map((item) => `<tr><td><strong>${item[1]}</strong></td><td>${number(item[2])}</td><td>${number(item[3])}</td><td>${item[4]}</td></tr>`).join('')}</tbody></table></div></section>`;
    }

    async function loadAttendanceReport() {
        const view = $('reportsAttendanceView');
        if (!view) return;
        const { from, to } = rangeValues();
        const rangeKey = `${from}:${to}`;
        if (state.attendance && state.attendanceRange === rangeKey) { renderAttendance(); return; }
        const requestId = ++state.attendanceRequestId;
        state.attendanceAbortController?.abort();
        state.attendanceAbortController = new AbortController();
        const controller = state.attendanceAbortController;
        showLoading('reportsAttendanceView', t('loadingAttendance'));
        try {
            const data = await getJson(`/api/attendance/report?${new URLSearchParams({ from, to })}`, { signal: controller.signal });
            if (requestId !== state.attendanceRequestId) return;
            state.attendance = data;
            state.attendanceRange = rangeKey;
            renderAttendance();
        } catch (error) {
            if (error.name === 'AbortError') return;
            view.innerHTML = `<div class="reports-error"><span data-i18n-preserve>${escapeHtml(error.message || t('error'))}</span></div>`;
        }
    }

    function renderAttendance() {
        const view = $('reportsAttendanceView');
        const data = state.attendance;
        if (!view || !data) return;
        const summary = data.summary || {};
        const query = localFilterValue();
        const members = (data.members || []).filter((item) => contains(item.fullName, query) || contains(item.phone, query));
        const absent = (data.absentMembers || []).filter((item) => contains(item.fullName, query) || contains(item.phone, query));
        const dailyRows = (data.daily || []).map((day) => `<tr><td>${dateOnly(day.date)}</td><td>${number(day.visits)}</td><td>${number(day.uniqueMembers)}</td><td>${number(day.checkedOut)}</td></tr>`).join('');
        const memberRows = members.slice(0, 100).map((member) => `<tr><td><strong>${escapeHtml(member.fullName)}</strong><small>${escapeHtml(displayPhone(member.phone, member.phoneCountry) || '—')}</small></td><td>${number(member.visits)}</td><td>${number(member.totalMinutes)} ${t('attendance.minutes')}</td><td>${dateOnly(member.lastVisitDate)}</td></tr>`).join('');
        const absentRows = absent.slice(0, 100).map((member) => `<tr><td><strong>${escapeHtml(member.fullName)}</strong><small>${escapeHtml(displayPhone(member.phone, member.phoneCountry) || '—')}</small></td><td>${dateOnly(member.membershipEndDate)}</td><td><a class="btn btn-light btn-small" href="tel:${escapeHtml(member.phone)}">${t('attendance.call')}</a></td></tr>`).join('');
        const kpis = [[t('attendance.totalVisits'), summary.totalVisits, 'blue', 'attendance'], [t('attendance.membersAttended'), summary.uniqueMembers, 'green', 'users'], [t('attendance.checkedOut'), summary.checkedOut, 'indigo', 'check'], [t('attendance.averageMinutes'), summary.averageMinutes == null ? '—' : summary.averageMinutes, 'amber', 'chart'], [t('attendance.noAttendance'), summary.absentMembers, 'red', 'debt']].map(([title, value, tone, icon]) => reportKpi(title, typeof value === 'number' ? number(value) : value, `${dateOnly(data.from)} — ${dateOnly(data.to)}`, tone, icon)).join('');
        view.innerHTML = `<div class="reports-kpis reports-kpis-attendance">${kpis}</div><section class="report-card reports-members-card"><div class="report-card-head"><div><span>${t('attendance.dailyMovement')}</span><h3>${t('attendance.dailySummary')}</h3></div><span class="reports-members-count">${t('attendance.dayCount', { count: number((data.daily || []).length) })}</span></div><div class="reports-table-wrap">${dailyRows ? `<table class="reports-table"><thead><tr><th>${t('date')}</th><th>${t('attendance.visits')}</th><th>${t('attendance.uniqueMembers')}</th><th>${t('attendance.checkedOut')}</th></tr></thead><tbody>${dailyRows}</tbody></table>` : `<div class="reports-empty-state">${t('attendance.noVisits')}</div>`}</div></section><div class="reports-detail-grid"><section class="report-card finance-detail-card"><div class="report-card-head"><div><span>${t('attendance.mostActive')}</span><h3>${t('attendance.mostVisits')}</h3></div><span class="reports-members-count">${number(members.length)}</span></div><div class="reports-table-wrap">${memberRows ? `<table class="reports-table"><thead><tr><th>${t('member')}</th><th>${t('attendance.visits')}</th><th>${t('attendance.duration')}</th><th>${t('attendance.lastVisit')}</th></tr></thead><tbody>${memberRows}</tbody></table>` : `<div class="reports-empty-state">${t('attendance.noMatchingVisits')}</div>`}</div></section><section class="report-card finance-detail-card"><div class="report-card-head"><div><span>${t('attendance.followUp')}</span><h3>${t('attendance.absentMembers')}</h3></div><span class="reports-members-count">${number(absent.length)}</span></div><div class="reports-table-wrap">${absentRows ? `<table class="reports-table"><thead><tr><th>${t('member')}</th><th>${t('attendance.membershipEnd')}</th><th>${t('action')}</th></tr></thead><tbody>${absentRows}</tbody></table>` : `<div class="reports-empty-state">${t('attendance.noOngoingAbsence')}</div>`}</div></section></div>`;
    }

    async function loadBackupReport() {
        const view = $('reportsBackupsView');
        if (!view) return;
        if (state.backups) { renderBackups(); return; }
        showLoading('reportsBackupsView', t('loadingBackups'));
        try { state.backups = await getJson('/api/backup/history?limit=3&archiveLimit=10'); renderBackups(); }
        catch (error) { view.innerHTML = `<div class="reports-error"><span data-i18n-preserve>${escapeHtml(error.message || t('error'))}</span></div>`; }
    }

    function renderBackups() {
        const view = $('reportsBackupsView');
        const data = state.backups || {};
        if (!view) return;
        const format = selected('reportsBackupFormat');
        const archives = (data.archives || []).filter((item) => !format || item.format === format);
        const operations = (data.operations || []).slice(0, 3);
        const archiveRows = archives.map((item) => `<tr><td><strong>${escapeHtml(item.fileName)}</strong><small>${dateTime(item.generatedAt || item.createdAt)}</small></td><td>${escapeHtml(String(item.format || '').toUpperCase())}</td><td>${t('backups.rowCount', { count: number(item.rowCount) })}</td><td><div class="reports-debtor-actions"><button type="button" class="btn btn-light btn-small" data-report-backup-id="${escapeHtml(item.id)}">${t('backups.download')}</button><button type="button" class="btn btn-danger btn-small" data-report-backup-delete-id="${escapeHtml(item.id)}">${t('backups.delete')}</button></div></td></tr>`).join('');
        const operationRows = operations.map((item) => `<tr><td>${escapeHtml(label({ download: 'backups.operation.download', inspect: 'backups.operation.inspect', restore: 'backups.operation.restore' }, item.operationType))}</td><td>${dateTime(item.createdAt)}</td><td>${number(item.rowCount)}</td><td><span class="backup-history-status ${item.status === 'success' ? 'success' : 'error'}">${item.status === 'success' ? t('backups.success') : t('backups.failure')}</span></td></tr>`).join('');
        view.innerHTML = `<div class="report-summary-strip"><div class="report-summary-chip"><span>${t('backups.saved')}</span><strong>${number(archives.length)}</strong><small>${t('backups.retention')}</small></div><div class="report-summary-chip"><span>${t('backups.recentOperations')}</span><strong>${number(operations.length)}</strong><small>${t('backups.lastThree')}</small></div><div class="report-summary-chip"><span>${t('backups.schedule')}</span><strong>${t('backups.scheduleTime')}</strong><small>${t('backups.cairoTime')}</small></div></div><div class="reports-detail-grid"><section class="report-card finance-detail-card"><div class="report-card-head"><div><span>${t('backups.automaticArchive')}</span><h3>${t('backups.dailyArchives')}</h3></div></div><div class="reports-table-wrap">${archiveRows ? `<table class="reports-table"><thead><tr><th>${t('backups.fileDate')}</th><th>${t('backups.extension')}</th><th>${t('backups.data')}</th><th>${t('action')}</th></tr></thead><tbody>${archiveRows}</tbody></table>` : `<div class="reports-empty-state">${t('backups.noSaved')}</div>`}</div></section><section class="report-card finance-detail-card"><div class="report-card-head"><div><span>${t('backups.followUp')}</span><h3>${t('backups.lastThreeOperations')}</h3></div></div><div class="reports-table-wrap">${operationRows ? `<table class="reports-table"><thead><tr><th>${t('backups.operation')}</th><th>${t('date')}</th><th>${t('backups.rows')}</th><th>${t('membership.status')}</th></tr></thead><tbody>${operationRows}</tbody></table>` : `<div class="reports-empty-state">${t('backups.noOperations')}</div>`}</div></section></div>`;
    }

    async function downloadBackupArchive(id, trigger) {
        if (!id || trigger?.dataset.busy === 'true') return;
        if (trigger) trigger.dataset.busy = 'true';
        try {
            const response = await fetch(`/api/backup/archives/${encodeURIComponent(id)}`, { cache: 'no-store' });
            if (!response.ok) throw new Error('تعذر تحميل النسخة المحفوظة.');
            const blob = await response.blob();
            const link = document.createElement('a');
            link.href = URL.createObjectURL(blob);
            link.download = (response.headers.get('Content-Disposition') || '').match(/filename="([^"]+)"/)?.[1] || `LOGIC-FIT-backup-${id}.json.gz`;
            link.click();
            URL.revokeObjectURL(link.href);
        } catch (error) {
            if (window.Swal) window.Swal.fire({ icon: 'error', title: 'تعذر تحميل النسخة', text: error.message, position: 'center' });
        } finally { if (trigger) delete trigger.dataset.busy; }
    }

    async function deleteBackupArchiveFromReport(id, trigger) {
        if (!id || trigger?.dataset.busy === 'true') return;
        if (!await confirmDelete('تأكيد حذف النسخة الاحتياطية', 'سيتم حذف النسخة المحفوظة من السيرفر نهائيًا، ولن يؤثر ذلك على بيانات النظام الحالية.')) return;
        const reason = await requestBackupDeleteReason();
        if (!reason) return;
        if (trigger) trigger.dataset.busy = 'true';
        try {
            const response = await fetch(`/api/backup/archives/${encodeURIComponent(id)}`, { method: 'DELETE', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify({ reason }) });
            const data = await response.json().catch(() => ({}));
            if (!response.ok) throw new Error(data.error || 'تعذر حذف النسخة الاحتياطية.');
            if (window.Swal) window.Swal.fire({ toast: true, position: 'top-start', icon: 'success', title: 'تم حذف النسخة الاحتياطية ✅', showConfirmButton: false, timer: 2600, customClass: { popup: 'top-gym-alert top-gym-toast' } });
            state.backups = null;
            await loadBackupReport();
        } catch (error) {
            if (window.Swal) window.Swal.fire({ position: 'center', icon: 'error', title: 'تعذر حذف النسخة', text: error.message, customClass: { popup: 'top-gym-alert' } });
        } finally {
            if (trigger) delete trigger.dataset.busy;
        }
    }

    function exportCurrentReport() {
        if (!state.data || !canExportReports()) return;
        if (state.activeTab === 'finance' && !canReadFinance()) return;
        const rows = [[`تقرير ${brandName()}`, state.activeTab], ['من', rangeValues().from], ['إلى', rangeValues().to], []];
        if (state.activeTab === 'finance') {
            rows.push(['النوع', 'الاسم', 'التاريخ', 'المبلغ', 'طريقة الدفع']);
            (state.data.payments || []).forEach((item) => rows.push(['تحصيل', item.fullName, item.date, item.amountPaid, label(PAYMENT_LABELS, item.paymentMethod)]));
            (state.data.expenses || []).forEach((item) => rows.push(['مصروف', item.name, item.date, item.amount, '—']));
        } else if (state.activeTab === 'memberships') {
            rows.push(['المشترك', 'الهاتف', 'الباقة', 'النوع', 'الحالة', 'البداية', 'الانتهاء', 'المستحق', 'المدفوع', 'المتبقي']);
            (state.data.memberships || []).forEach((item) => rows.push([item.fullName, item.phone, label(PLAN_LABELS, item.plan), label(TYPE_LABELS, item.type), label(STATUS_LABELS, item.status), item.startDate, item.endDate, item.amountDue, item.amountPaid, item.amountRemaining]));
        } else if (state.activeTab === 'coaching') {
            rows.push(['النوع', 'النظام', 'المتدرب', 'الهاتف', 'الحالة', 'البداية', 'النهاية']);
            (state.data.coaching?.workoutPrograms || []).forEach((item) => rows.push(['تدريب', item.name, item.fullName, item.phone, label(COACHING_STATUS_LABELS, item.status), item.startDate, item.endDate]));
            (state.data.coaching?.dietPlans || []).forEach((item) => rows.push(['تغذية', item.name, item.fullName, item.phone, label(COACHING_STATUS_LABELS, item.status), item.startDate, item.endDate]));
        } else if (state.activeTab === 'library') {
            rows.push(['القسم', 'الإجمالي', 'المضاف خلال الفترة']);
            const counts = state.data.library?.counts || {};
            rows.push(['الأطعمة', counts.foods, counts.newFoods], ['التمارين', counts.exercises, counts.newExercises], ['العضلات', counts.muscles, counts.newMuscles]);
        } else if (state.activeTab === 'backups' && state.backups) {
            rows.push(['الملف', 'الامتداد', 'التاريخ', 'الصفوف']);
            (state.backups.archives || []).forEach((item) => rows.push([item.fileName, item.format, item.generatedAt || item.createdAt, item.rowCount]));
        } else if (state.activeTab === 'attendance' && state.attendance) {
            rows.push(['المشترك', 'الهاتف', 'الزيارات', 'الدقائق', 'آخر حضور']);
            (state.attendance.members || []).forEach((item) => rows.push([item.fullName, item.phone, item.visits, item.totalMinutes, item.lastVisitDate]));
        } else {
            rows.push(['المؤشر', 'القيمة']);
            Object.entries(state.data.summary || {}).forEach(([key, value]) => rows.push([key, value]));
            rows.push([]);
            rows.push(['المشترك', 'الهاتف', 'التسجيل', 'الباقة', 'النوع', 'المستحق', 'المدفوع', 'المتبقي']);
            (state.data.members || []).forEach((item) => rows.push([item.fullName, item.phone, item.registrationDate, label(PLAN_LABELS, item.plan), label(TYPE_LABELS, item.type), item.amountDue, item.amountPaid, item.amountRemaining]));
            rows.push([]);
            rows.push(['المشترك', 'الهاتف', 'الباقة', 'النوع', 'الانتهاء', 'المتبقي']);
            (state.data.debtors || []).forEach((item) => rows.push([item.fullName, item.phone, label(PLAN_LABELS, item.plan), label(TYPE_LABELS, item.type), item.endDate, item.amountRemaining]));
        }
        const csv = '\uFEFF' + rows.map((row) => row.map((value) => `"${String(value ?? '').replace(/"/g, '""')}"`).join(',')).join('\r\n');
        const link = document.createElement('a');
        link.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
        link.download = `top-gym-${state.activeTab}-report-${rangeValues().from}-${rangeValues().to}.csv`;
        link.click();
        URL.revokeObjectURL(link.href);
    }

    function initializeReports() {
        if (!window.topGymAuth?.isOwner?.()) return;
        ensurePanel();
        window.addEventListener('topgym:tab-changed', (event) => {
            if (event.detail?.name === 'reports') {
                ensurePanel();
                loadReport();
            }
        });
        window.addEventListener('topgym:brandingchange', () => {
            const title = $('reportsTitle');
            if (title) title.textContent = t('title', { brand: brandName() });
        });
        window.addEventListener('topgym:localechange', relocalizeReports);
        window.addEventListener('topgym:branch-context-changed', () => {
            state.data = null;
            state.attendance = null;
            state.loadedRangeKey = '';
            state.loadedAt = 0;
            if (document.querySelector('[data-page-tab="reports"]')?.classList.contains('active')) void loadReport(true);
        });
        // `topgym:tab-changed` is emitted after the lazy feature is ready and
        // is the single initial load trigger for this screen.
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initializeReports, { once: true });
    else initializeReports();
})();
