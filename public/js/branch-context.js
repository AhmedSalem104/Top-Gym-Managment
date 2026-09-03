(() => {
    if (window.__topGymBranchContextLoaded) return;
    window.__topGymBranchContextLoaded = true;

    const storageKey = 'logicfit.branchId';
    const $ = (id) => document.getElementById(id);
    const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[character]));
    const notify = (message, isError = false) => {
        if (window.showToast) window.showToast(message, isError);
        else if (isError) console.error(message);
    };
    let bootstrap = null;

    function readStoredBranch() {
        try { return sessionStorage.getItem(storageKey); } catch { return null; }
    }

    function writeStoredBranch(value) {
        try {
            if (value) sessionStorage.setItem(storageKey, String(value));
            else sessionStorage.removeItem(storageKey);
        } catch {
            // A disabled session store must not prevent navigation.
        }
    }

    function ensureBranchTab() {
        const rail = $('pageTabs');
        if (!rail || rail.querySelector('[data-page-tab="branches"]')) return;
        const button = document.createElement('button');
        button.className = 'page-tab branch-page-tab';
        button.type = 'button';
        button.dataset.pageTab = 'branches';
        button.dataset.ownerOnly = '';
        button.dataset.branchTabReady = 'true';
        button.setAttribute('aria-selected', 'false');
        button.setAttribute('aria-label', 'الفروع');
        button.title = 'الفروع';
        button.innerHTML = '<svg class="ui-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 20h16"/><path d="M6 20V8l6-4 6 4v12"/><path d="M9 11h.01M15 11h.01M9 15h.01M15 15h.01"/></svg><span>الفروع</span>';
        const store = rail.querySelector('[data-page-tab="store"]');
        rail.insertBefore(button, store?.nextSibling || null);
    }

    function ensureBranchPanel() {
        if ($('branchesSection')) return;
        const panel = document.createElement('section');
        panel.className = 'branches-page panel';
        panel.id = 'branchesSection';
        panel.hidden = true;
        panel.dataset.ownerOnly = '';
        panel.dataset.pageTabPanel = 'branches';
        panel.setAttribute('aria-labelledby', 'branchesTitle');
        panel.innerHTML = `
            <header class="branches-page-header">
                <div class="branches-page-heading"><span class="branches-page-kicker">OPERATIONAL LOCATIONS</span><h2 id="branchesTitle">إدارة فروع الجيم</h2><p>أضف الفروع وحدد بيانات التشغيل. تظل كل الفروع داخل نفس حساب الجيم وTenant.</p></div>
                <div class="branches-page-summary" aria-label="ملخص الفروع"><span><strong id="branchesActiveCount">0</strong><small>فروع نشطة</small></span><span><strong id="branchesLimitValue">—</strong><small>حد الباقة</small></span></div>
            </header>
            <div class="branches-layout">
                <section class="branches-card">
                    <div class="branches-card-header"><div><span class="branches-card-kicker">NEW BRANCH</span><h3>إضافة فرع</h3><p>سيتم حفظه كفرع تابع لنفس الجيم.</p></div></div>
                    <form id="branchCreateForm" class="branches-form" novalidate>
                        <label>كود الفرع<input id="branchCodeInput" name="code" required maxlength="40" dir="ltr" placeholder="nasr-city"></label>
                        <label>اسم الفرع<input id="branchNameInput" name="name" required maxlength="160" placeholder="فرع مدينة نصر"></label>
                        <label>العنوان<input id="branchAddressInput" name="address" maxlength="300"></label>
                        <label>الهاتف<input id="branchPhoneInput" name="phone" maxlength="40" dir="ltr"></label>
                        <label class="branches-check-field"><input type="checkbox" name="storeEnabled" checked> تفعيل Store</label>
                        <label class="branches-check-field"><input type="checkbox" name="barEnabled"> تفعيل Bar وإنشاء موقع البيع</label>
                        <button class="btn btn-primary" type="submit">إضافة الفرع</button>
                    </form>
                    <p class="branches-form-status" id="branchFormStatus" role="status" aria-live="polite"></p>
                </section>
                <section class="branches-card branches-list-card">
                    <div class="branches-card-header"><div><span class="branches-card-kicker">BRANCH DIRECTORY</span><h3>الفروع الحالية</h3><p>الأرشفة تحفظ السجل ولا تحذف البيانات التشغيلية.</p></div><button class="btn btn-light btn-small" id="branchesRefresh" type="button">تحديث</button></div>
                    <div id="branchesList" class="branches-list"><div class="loading">جارٍ تحميل الفروع…</div></div>
                </section>
            </div>`;
        const feedback = $('feedbackSection');
        feedback?.parentElement?.insertBefore(panel, feedback);
    }

    function setTabVisibility(show) {
        const tab = document.querySelector('[data-page-tab="branches"]');
        if (tab) {
            tab.hidden = !show;
            tab.setAttribute('aria-hidden', String(!show));
            tab.toggleAttribute('inert', !show);
        }
        const panel = $('branchesSection');
        if (!show) {
            if (panel) panel.hidden = true;
            if (window.location.hash === '#branches') window.history.replaceState(null, '', '#dashboard');
        }
    }

    function renderSelector(data) {
        const shell = $('branchContextShell');
        const select = $('branchContextSelect');
        if (!shell || !select) return;
        const active = Array.isArray(data?.activeBranches) ? data.activeBranches : [];
        const allowed = Array.isArray(data?.branches) ? data.branches : active;
        shell.hidden = !data?.hasMultipleActiveBranches || allowed.length < 2;
        select.innerHTML = '';
        if (data?.canUseAllBranches && active.length > 1) select.append(new Option('كل الفروع', ''));
        allowed.forEach((branch) => select.append(new Option(branch.name, String(branch.id))));
        const stored = readStoredBranch();
        const allowedIds = new Set(allowed.map((branch) => String(branch.id)));
        if (stored && allowedIds.has(stored)) select.value = stored;
        else if (allowed.length === 1) { select.value = String(allowed[0].id); writeStoredBranch(select.value); }
        else { select.value = ''; writeStoredBranch(''); }
        const selected = active.find((branch) => String(branch.id) === select.value);
        $('branchContextStatus').textContent = selected ? `${selected.status === 'active' ? 'نشط' : 'غير نشط'}` : 'عرض موحد';
    }

    function renderManager(data) {
        const active = Array.isArray(data?.activeBranches) ? data.activeBranches : [];
        const limit = data?.branchLimit == null ? '—' : Number(data.branchLimit).toLocaleString('ar-EG');
        if ($('branchesActiveCount')) $('branchesActiveCount').textContent = active.length.toLocaleString('ar-EG');
        if ($('branchesLimitValue')) $('branchesLimitValue').textContent = limit;
        const list = $('branchesList');
        if (!list) return;
        list.innerHTML = active.length ? active.map((branch) => `<article class="branch-list-item" data-branch-row="${escapeHtml(branch.id)}"><div class="branch-list-marker" aria-hidden="true"></div><div class="branch-list-copy"><strong>${escapeHtml(branch.name)}</strong><span dir="ltr">${escapeHtml(branch.code)}</span><small>${escapeHtml(branch.address || 'بدون عنوان')} · ${branch.isMain ? 'الفرع الرئيسي' : 'فرع تشغيلي'}</small></div><div class="branch-list-actions"><span class="branch-status ${escapeHtml(branch.status)}">${branch.status === 'active' ? 'نشط' : branch.status === 'inactive' ? 'متوقف' : 'مؤرشف'}</span>${!branch.isMain && branch.status !== 'archived' ? `<button class="btn btn-light btn-small" type="button" data-branch-archive="${escapeHtml(branch.id)}">أرشفة</button>` : ''}</div></article>`).join('') : '<div class="empty">لا توجد فروع نشطة.</div>';
    }

    function renderManagerWithCommerce(data) {
        const active = Array.isArray(data?.activeBranches) ? data.activeBranches : [];
        const limit = data?.branchLimit == null ? '—' : Number(data.branchLimit).toLocaleString('ar-EG');
        if ($('branchesActiveCount')) $('branchesActiveCount').textContent = active.length.toLocaleString('ar-EG');
        if ($('branchesLimitValue')) $('branchesLimitValue').textContent = limit;
        const list = $('branchesList');
        if (!list) return;
        list.innerHTML = active.length ? active.map((branch) => {
            const storeLabel = branch.storeEnabled ? 'ON' : 'OFF';
            const barLabel = branch.barEnabled ? 'ON' : 'OFF';
            const toggleLabel = branch.barEnabled ? 'إيقاف Bar' : 'تفعيل Bar';
            return `<article class="branch-list-item" data-branch-row="${escapeHtml(branch.id)}"><div class="branch-list-marker" aria-hidden="true"></div><div class="branch-list-copy"><strong>${escapeHtml(branch.name)}</strong><span dir="ltr">${escapeHtml(branch.code)}</span><small>${escapeHtml(branch.address || 'بدون عنوان')} · ${branch.isMain ? 'الفرع الرئيسي' : 'فرع تشغيلي'}</small><div class="branch-commerce-chips" aria-label="إعدادات Commerce"><span class="branch-commerce-chip ${branch.storeEnabled ? 'is-on' : ''}">Store ${storeLabel}</span><span class="branch-commerce-chip ${branch.barEnabled ? 'is-on' : ''}">Bar ${barLabel}</span></div></div><div class="branch-list-actions"><span class="branch-status ${escapeHtml(branch.status)}">${branch.status === 'active' ? 'نشط' : branch.status === 'inactive' ? 'متوقف' : 'مؤرشف'}</span><button class="btn btn-light btn-small" type="button" data-branch-commerce="${escapeHtml(branch.id)}" data-next-bar="${branch.barEnabled ? 'false' : 'true'}">${toggleLabel}</button>${!branch.isMain && branch.status !== 'archived' ? `<button class="btn btn-light btn-small" type="button" data-branch-archive="${escapeHtml(branch.id)}">أرشفة</button>` : ''}</div></article>`;
        }).join('') : '<div class="empty">لا توجد فروع نشطة.</div>';
    }

    async function toggleBranchBar(branchId, enabled) {
        const branch = bootstrap?.activeBranches?.find((item) => String(item.id) === String(branchId));
        if (!branch) return;
        try {
            await window.topGymApi.patch(`/api/branches/${encodeURIComponent(branchId)}`, { name: branch.name, address: branch.address, phone: branch.phone, workingHours: branch.workingHours, storeEnabled: branch.storeEnabled, barEnabled: enabled });
            await loadBranches();
        } catch (error) { notify(error.message || 'تعذر تحديث إعدادات Bar.', true); }
    }

    async function loadBranches() {
        if (!window.topGymAuth?.isReady?.() || !window.topGymAuth.getUser?.()) return;
        const user = window.topGymAuth.getUser();
        const isGym = user.tenantType === 'gym';
        setTabVisibility(isGym && user.role === 'Owner');
        const shell = $('branchContextShell');
        if (!isGym) { if (shell) shell.hidden = true; return; }
        try {
            bootstrap = await window.topGymApi.request('/api/branches/bootstrap');
            renderSelector(bootstrap);
            renderManagerWithCommerce({ ...bootstrap, branchLimit: bootstrap.branchLimit });
        } catch (error) {
            if (shell) shell.hidden = true;
            if (user.role === 'Owner') notify(error.message || 'تعذر تحميل سياق الفروع.', true);
        }
    }

    async function createBranch(event) {
        event.preventDefault();
        const form = event.currentTarget;
        const status = $('branchFormStatus');
        const payload = Object.fromEntries(new FormData(form).entries());
        status.textContent = '';
        try {
            await window.topGymApi.post('/api/branches', payload);
            form.reset();
            status.textContent = 'تمت إضافة الفرع بنجاح.';
            await loadBranches();
        } catch (error) {
            status.textContent = error.message || 'تعذر إضافة الفرع.';
            notify(status.textContent, true);
        }
    }

    async function archiveBranch(branchId) {
        if (!window.confirm('سيتم إيقاف العمليات الجديدة مع الاحتفاظ بالسجل. هل تريد المتابعة؟')) return;
        try { await window.topGymApi.post(`/api/branches/${encodeURIComponent(branchId)}/archive`, {}); await loadBranches(); }
        catch (error) { notify(error.message || 'تعذر أرشفة الفرع.', true); }
    }

    function bind() {
        ensureBranchTab();
        ensureBranchPanel();
        $('branchCreateForm')?.addEventListener('submit', createBranch);
        $('branchesRefresh')?.addEventListener('click', () => void loadBranches());
        $('branchContextSelect')?.addEventListener('change', (event) => {
            const value = event.currentTarget.value;
            writeStoredBranch(value);
            const active = bootstrap?.activeBranches?.find((branch) => String(branch.id) === value);
            $('branchContextStatus').textContent = active ? 'نشط' : 'عرض موحد';
            window.dispatchEvent(new CustomEvent('topgym:branch-context-changed', { detail: { branchId: value ? Number(value) : null } }));
        });
        $('branchesList')?.addEventListener('click', (event) => {
            const button = event.target.closest('[data-branch-archive]');
            if (button) void archiveBranch(button.dataset.branchArchive);
            const commerceButton = event.target.closest('[data-branch-commerce]');
            if (commerceButton) void toggleBranchBar(commerceButton.dataset.branchCommerce, commerceButton.dataset.nextBar === 'true');
        });
        void (window.topGymAuthReady?.then(loadBranches) || loadBranches());
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bind, { once: true });
    else bind();
})();
