(() => {
    if (window.__topGymMonthlyFinanceLoaded) return;
    window.__topGymMonthlyFinanceLoaded = true;

    const nativeFetch = window.fetch.bind(window);
    let refreshTimer = null;
    let financeRequest = null;
    let financeData = null;

    function canReadFinance() {
        return window.topGymAuth?.isOwner?.() === true || window.topGymAuth?.hasPermission?.('finance.read') === true;
    }

    function isFinanceMutation(url, method) {
        if (method === 'GET' || method === 'HEAD') return false;
        return /^\/api\/(members(?:\/|$)|memberships(?:\/|$)|expenses(?:\/|$))/.test(url);
    }

    function isFinanceTabVisible() {
        const activeTab = document.documentElement.dataset.topGymActiveTab
            || window.location.hash.slice(1)
            || 'dashboard';
        return activeTab === 'dashboard' || activeTab === 'expenses';
    }

    function isDashboardTabVisible() {
        const activeTab = document.documentElement.dataset.topGymActiveTab
            || window.location.hash.slice(1)
            || 'dashboard';
        return activeTab === 'dashboard';
    }

    function queueRefresh() {
        window.clearTimeout(refreshTimer);
        refreshTimer = window.setTimeout(() => {
            if (canReadFinance() && isFinanceTabVisible()) {
                loadFinance();
                window.topGymRefreshDashboardAnalytics?.();
            }
        }, 180);
    }

    window.fetch = (...args) => {
        const input = args[0];
        const options = args[1] || {};
        const url = typeof input === 'string' ? input : input?.url || '';
        const method = String(options.method || input?.method || 'GET').toUpperCase();
        return nativeFetch(...args).then((response) => {
            if (response.ok && isFinanceMutation(url, method)) queueRefresh();
            return response;
        });
    };

    function $(id) {
        return document.getElementById(id);
    }

    function money(value) {
        return `${Number(value || 0).toLocaleString('ar-EG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ج.م`;
    }

    function formatDate(value) {
        if (!value) return '—';
        return new Intl.DateTimeFormat('ar-EG', { dateStyle: 'medium' })
            .format(new Date(`${String(value).slice(0, 10)}T00:00:00`));
    }

    function todayIso() {
        const now = new Date();
        return new Date(now.getTime() - now.getTimezoneOffset() * 60000)
            .toISOString()
            .slice(0, 10);
    }

    function escapeHtml(value) {
        return String(value ?? '').replace(/[&<>'"]/g, (character) => ({
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            "'": '&#39;',
            '"': '&quot;'
        }[character]));
    }

    function getExpenseById(id) {
        return financeData?.expenses?.items?.find((item) => String(item.id) === String(id)) || null;
    }

    function enhanceExpenseItems() {
        const list = $('monthlyExpensesList');
        const items = financeData?.expenses?.items || [];
        if (!list) return;
        list.querySelectorAll('.monthly-expense-item').forEach((article, index) => {
            if (article.querySelector('[data-expense-action]')) return;
            const item = items[index];
            if (!item) return;
            article.dataset.expenseId = String(item.id);
            article.insertAdjacentHTML('beforeend', `<div class="monthly-expense-actions"><button class="monthly-expense-action edit" type="button" data-expense-action="edit" data-required-permission="finance.update" data-expense-id="${item.id}" title="تعديل المصروف" aria-label="تعديل المصروف"><svg class="ui-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4Z"/></svg></button><button class="monthly-expense-action delete" type="button" data-expense-action="delete" data-required-permission="finance.delete" data-expense-id="${item.id}" title="حذف المصروف" aria-label="حذف المصروف"><svg class="ui-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/></svg></button></div>`);
        });
    }

    function ensureDashboardSnapshot() {
        const overview = document.querySelector('.overview-grid');
        if (!overview || $('monthlyFinanceSnapshot')) return;
        const snapshot = document.createElement('section');
        snapshot.className = 'monthly-finance-snapshot panel';
        snapshot.id = 'monthlyFinanceSnapshot';
        snapshot.hidden = !isDashboardTabVisible();
        snapshot.setAttribute('aria-labelledby', 'monthlyFinanceSnapshotTitle');
        snapshot.innerHTML = `<div class="monthly-finance-snapshot-head"><div class="monthly-finance-heading"><span class="monthly-finance-icon" aria-hidden="true"><svg class="ui-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19V5"/><path d="M4 19h16"/><path d="m7 15 3-4 3 2 5-6"/></svg></span><div><span class="monthly-finance-eyebrow">الحسابات</span><h3 id="monthlyFinanceSnapshotTitle">ملخص الشهر الحالي</h3><p id="monthlyFinanceSnapshotPeriod">جاري تحميل حسابات الشهر…</p></div></div><button class="btn btn-light btn-small open-expenses-tab-button" id="openExpensesTabButton" type="button">إدارة المصروفات</button></div><div class="monthly-finance-snapshot-metrics"><article class="monthly-finance-snapshot-metric subscriptions"><span>إجمالي الاشتراكات</span><strong id="monthlySubscriptionsSnapshotTotal">0.00 ج.م</strong></article><article class="monthly-finance-snapshot-metric expenses"><span>المصروفات</span><strong id="monthlyExpensesSnapshotTotal">0.00 ج.م</strong></article><article class="monthly-finance-snapshot-metric net"><span>المتبقي / صافي الشهر</span><strong id="monthlyNetSnapshotTotal">0.00 ج.م</strong></article></div>`;
        const metricIcons = [
            '<span class="monthly-finance-snapshot-metric-icon" aria-hidden="true"><svg class="ui-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></svg></span>',
            '<span class="monthly-finance-snapshot-metric-icon" aria-hidden="true"><svg class="ui-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7h18v12H3z"/><path d="m3 7 2-3h14l2 3M16 13h5"/><circle cx="16" cy="13" r="1"/></svg></span>',
            '<span class="monthly-finance-snapshot-metric-icon" aria-hidden="true"><svg class="ui-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="17" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/><path d="m8 15 2 2 5-5"/></svg></span>'
        ];
        snapshot.querySelectorAll('.monthly-finance-snapshot-metric').forEach((metric, index) => {
            if (!metric.querySelector('.monthly-finance-snapshot-metric-icon')) metric.insertAdjacentHTML('afterbegin', metricIcons[index]);
        });
        const dayPassCard = overview.querySelector(':scope > #dashboardDayPassCard');
        const alerts = overview.querySelector(':scope > #alertsSection');
        const analytics = $('dashboardAnalytics');
        const main = overview.parentElement;
        if (dayPassCard && alerts && dayPassCard.parentElement === overview && alerts.parentElement === overview) {
            overview.insertBefore(dayPassCard, alerts);
        }
        if (analytics && main === analytics.parentElement) {
            main.insertBefore(snapshot, analytics);
        } else if (alerts && alerts.parentElement === overview) {
            alerts.insertAdjacentElement('afterend', snapshot);
        } else {
            overview.appendChild(snapshot);
        }
        const stats = overview.querySelector(':scope > .stats-grid');
        if (stats) {
            stats.classList.add('snapshot-membership-stats');
            const statusHeading = document.createElement('div');
            statusHeading.className = 'snapshot-membership-status-head';
            statusHeading.innerHTML = '<span>حالة العضويات</span><small>ملخص سريع للمشتركين</small>';
            const metrics = snapshot.querySelector('.monthly-finance-snapshot-metrics');
            snapshot.insertBefore(statusHeading, metrics);
            snapshot.insertBefore(stats, metrics);
        }
    }

    function ensureExpensesTab() {
        const main = $('dashboardSection');
        if (!main) return null;
        let section = $('expensesSection');
        if (!section) {
            section = document.createElement('section');
            section.className = 'expenses-tab-panel panel';
            section.id = 'expensesSection';
            section.hidden = true;
            section.innerHTML = '<div class="expenses-tab-heading"><div class="expenses-tab-heading-copy"><span>الحسابات</span><h3>إدارة المصروفات</h3><p>أضف وعدّل واحذف مصروفات الشهر الحالي من مكان واحد.</p></div><button class="btn btn-primary expenses-tab-add-button" id="addExpenseFromTabButton" type="button"><span aria-hidden="true">+</span> إضافة مصروف</button></div><div id="expensesTabHost"></div>';
            main.appendChild(section);
        }
        return section;
    }

    function showFinanceToast(icon, title, text = '') {
        if (!window.Swal) return;
        window.Swal.fire({
            toast: true,
            position: 'top-start',
            icon,
            title,
            text,
            showConfirmButton: false,
            timer: 3200,
            timerProgressBar: true,
            customClass: { popup: 'top-gym-alert top-gym-toast' }
        });
    }

    function renderFinance(data) {
        financeData = data;
        const period = data.period || {};
        const periodDate = period.startDate
            ? new Date(`${period.startDate}T00:00:00Z`)
            : new Date();
        const periodLabel = new Intl.DateTimeFormat('ar-EG', {
            month: 'long',
            year: 'numeric'
        }).format(periodDate);
        const subscriptions = data.subscriptions || {};
        const dayPasses = data.dayPasses || {};
        const expenses = data.expenses || {};
        const net = Number(data.net || 0);

        $('monthlyFinancePeriod').textContent = periodLabel;
        $('monthlySubscriptionsTotal').textContent = money(subscriptions.total);
        if ($('monthlyDayPassesTotal')) $('monthlyDayPassesTotal').textContent = money(dayPasses.total);
        $('monthlyExpensesTotal').textContent = money(expenses.total);
        $('monthlyNetTotal').textContent = money(net);
        $('monthlyNetTotal').classList.toggle('negative', net < 0);
        $('monthlySubscriptionsMeta').textContent = `${Number(subscriptions.count || 0).toLocaleString('ar-EG')} عملية تحصيل خلال الشهر`;
        if ($('monthlyDayPassesMeta')) $('monthlyDayPassesMeta').textContent = dayPasses.count ? `${Number(dayPasses.count).toLocaleString('ar-EG')} حصة مسجلة خلال الشهر` : 'لا توجد حصص مسجلة';
        $('monthlyExpensesMeta').textContent = expenses.count
            ? `${Number(expenses.count).toLocaleString('ar-EG')} مصروف مسجل خلال الشهر`
            : 'لا توجد مصروفات مسجلة';
        $('monthlyFinanceStatus').textContent = 'محدث الآن';

        if ($('monthlyFinanceSnapshotPeriod')) $('monthlyFinanceSnapshotPeriod').textContent = periodLabel;
        if ($('monthlySubscriptionsSnapshotTotal')) $('monthlySubscriptionsSnapshotTotal').textContent = money(subscriptions.total);
        if ($('monthlyExpensesSnapshotTotal')) $('monthlyExpensesSnapshotTotal').textContent = money(expenses.total);
        if ($('monthlyNetSnapshotTotal')) {
            $('monthlyNetSnapshotTotal').textContent = money(net);
            $('monthlyNetSnapshotTotal').classList.toggle('negative', net < 0);
        }
        const items = expenses.items || [];
        $('monthlyExpensesList').innerHTML = items.length
            ? `<div class="monthly-expenses-list-head" aria-hidden="true"><span>البند والتاريخ</span><span>القيمة</span><span>الإجراءات</span></div>${items.map((item) => `<article class="monthly-expense-item"><div class="monthly-expense-copy"><strong title="${escapeHtml(item.name)}">${escapeHtml(item.name)}</strong><span>${formatDate(item.expenseDate)}</span></div><span class="monthly-expense-amount">${money(item.amount)}</span></article>`).join('')}`
            : '<span class="monthly-expenses-empty">لا توجد مصروفات مسجلة في الشهر الحالي.</span>';
    }

    async function loadFinance() {
        if (!canReadFinance() || !isFinanceTabVisible()) return null;
        if (!$('monthlyFinanceCard')) return;
        if (financeRequest) return financeRequest;
        $('monthlyFinanceStatus').textContent = 'جاري التحديث…';
        financeRequest = (async () => {
            try {
                const response = await nativeFetch('/api/monthly-finance', {
                    cache: 'no-store',
                    headers: { Accept: 'application/json' }
                });
                const data = await response.json().catch(() => ({}));
                if (!response.ok) throw new Error(data.error || 'تعذر تحميل الحسابات الشهرية.');
                renderFinance(data);
            } catch (error) {
                $('monthlyFinanceStatus').textContent = 'تعذر التحديث';
                $('monthlyExpensesList').innerHTML = `<span class="monthly-expenses-empty">${escapeHtml(error.message || 'تعذر تحميل الحسابات الشهرية.')}</span>`;
            } finally {
                financeRequest = null;
            }
        })();
        return financeRequest;
    }

    function openExpenseDialog(expense = null) {
        const form = $('expenseForm');
        form.reset();
        $('editingExpenseId').value = expense?.id ? String(expense.id) : '';
        $('expenseDialogTitle').textContent = expense ? 'تعديل المصروف' : 'إضافة مصروف';
        $('expenseDialogDescription').textContent = expense
            ? 'عدّل بيانات المصروف وسيتم تحديث إجمالي المصروفات وصافي الشهر تلقائيًا.'
            : 'سجّل مصروفًا جديدًا ليُخصم مباشرة من صافي الشهر الحالي.';
        $('expenseSave').textContent = expense ? 'حفظ التعديل' : 'حفظ المصروف';
        $('expenseName').value = expense?.name || '';
        $('expenseAmount').value = expense?.amount ?? '';
        $('expenseDate').value = expense?.expenseDate || todayIso();
        $('expenseNotes').value = expense?.notes || '';
        const dialog = $('expenseDialog');
        if (typeof dialog.showModal === 'function') dialog.showModal();
        else dialog.setAttribute('open', '');
        $('expenseName').focus();
    }

    function closeExpenseDialog() {
        const dialog = $('expenseDialog');
        if (typeof dialog.close === 'function' && dialog.open) dialog.close();
        else dialog.removeAttribute('open');
    }

    async function submitExpense(event) {
        event.preventDefault();
        const expenseId = $('editingExpenseId').value;
        const body = {
            name: $('expenseName').value,
            amount: Number($('expenseAmount').value || 0),
            expenseDate: $('expenseDate').value,
            notes: $('expenseNotes').value
        };
        try {
            const response = await window.fetch(expenseId ? `/api/expenses/${encodeURIComponent(expenseId)}` : '/api/expenses', {
                method: expenseId ? 'PUT' : 'POST',
                headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
                body: JSON.stringify(body)
            });
            const data = await response.json().catch(() => ({}));
            if (!response.ok) throw new Error(data.error || 'تعذر حفظ المصروف.');
            closeExpenseDialog();
            await loadFinance();
            showFinanceToast('success', 'تم حفظ المصروف ✅', 'تم تحديث ملخص الشهر وصافي الحساب تلقائيًا.');
        } catch (error) {
            showFinanceToast('error', 'تعذر حفظ المصروف', error.message || 'حاول مرة أخرى.');
        }
    }

    async function confirmDeleteExpense(name) {
        if (window.Swal) {
            const result = await window.Swal.fire({
                position: 'center',
                backdrop: window.topGymThemeValue('--overlay'),
                icon: 'warning',
                title: 'تأكيد حذف المصروف',
                text: `هل تريد حذف المصروف «${name}»؟`,
                showCancelButton: true,
                confirmButtonText: 'نعم، احذف',
                cancelButtonText: 'إلغاء',
                buttonsStyling: false,
                customClass: { popup: 'delete-confirm-alert' }
            });
            return result.isConfirmed;
        }
        return window.confirm(`هل تريد حذف المصروف «${name}»؟`);
    }

    async function deleteExpense(id) {
        const expense = getExpenseById(id);
        if (!expense || !(await confirmDeleteExpense(expense.name))) return;
        try {
            const response = await window.fetch(`/api/expenses/${encodeURIComponent(id)}`, { method: 'DELETE' });
            const data = await response.json().catch(() => ({}));
            if (!response.ok) throw new Error(data.error || 'تعذر حذف المصروف.');
            await loadFinance();
            showFinanceToast('success', 'تم حذف المصروف ✅', 'تم تحديث إجمالي المصروفات وصافي الشهر.');
        } catch (error) {
            showFinanceToast('error', 'تعذر حذف المصروف', error.message || 'حاول مرة أخرى.');
        }
    }

    function initializeFinance() {
        const expenseDialog = $('expenseDialog');
        if (expenseDialog && expenseDialog.parentElement !== document.body) {
            document.body.appendChild(expenseDialog);
        }
        ensureDashboardSnapshot();
        const monthlyFinanceCard = $('monthlyFinanceCard');
        const expensesSection = ensureExpensesTab();
        const expensesTabHost = expensesSection?.querySelector('#expensesTabHost');
        if (monthlyFinanceCard && expensesTabHost && monthlyFinanceCard.parentElement !== expensesTabHost) {
            expensesTabHost.appendChild(monthlyFinanceCard);
        }
        $('addExpenseButton')?.addEventListener('click', openExpenseDialog);
        $('addExpenseFromTabButton')?.addEventListener('click', openExpenseDialog);
        $('expenseDialogClose')?.addEventListener('click', closeExpenseDialog);
        $('expenseCancel')?.addEventListener('click', closeExpenseDialog);
        $('expenseForm')?.addEventListener('submit', submitExpense);
        $('openExpensesTabButton')?.addEventListener('click', () => window.topGymActivateTab?.('expenses'));
        const expenseList = $('monthlyExpensesList');
        if (expenseList) {
            const expenseObserver = new MutationObserver(enhanceExpenseItems);
            expenseObserver.observe(expenseList, { childList: true, subtree: true });
            expenseList.addEventListener('click', (event) => {
                const button = event.target.closest('[data-expense-action]');
                if (!button) return;
                const id = button.dataset.expenseId;
                if (button.dataset.expenseAction === 'edit') openExpenseDialog(getExpenseById(id));
                if (button.dataset.expenseAction === 'delete') deleteExpense(id);
            });
        }
        const startFinance = () => { if (canReadFinance() && isFinanceTabVisible()) void loadFinance(); };
        if (window.topGymAuthReady) window.topGymAuthReady.then(startFinance).catch(() => {});
        else startFinance();
        window.addEventListener('topgym:tab-changed', (event) => {
            if (['dashboard', 'expenses'].includes(event.detail?.name) && canReadFinance()) {
                void loadFinance();
            }
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initializeFinance, { once: true });
    } else {
        initializeFinance();
    }

    window.topGymRefreshMonthlyFinance = loadFinance;
})();
