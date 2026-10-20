(() => {
    if (window.__topGymBranchContextLoaded) return;
    window.__topGymBranchContextLoaded = true;

    const storageKey = 'logicfit.branchId';
    const sectionStorageKey = 'logicfit.sectionId';
    const $ = (id) => document.getElementById(id);
    const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[character]));
    const translate = (key, fallbackAr, params = {}) => {
        const value = window.TopGymI18n?.t?.(`branchesScreen.${key}`, params);
        return value && value !== `branchesScreen.${key}` ? value : fallbackAr;
    };
    const translateShared = (key, fallbackAr) => {
        const value = window.TopGymI18n?.t?.(key);
        return value && value !== key ? value : fallbackAr;
    };
    const formatNumber = (value) => window.TopGymI18n?.format?.('number', Number(value)) ?? Number(value).toLocaleString('ar-EG');
    const localizedMarkup = (key, fallbackAr, tag = 'span', attributes = '') =>
        `<${tag} data-i18n="branchesScreen.${escapeHtml(key)}" data-branches-fallback="${escapeHtml(fallbackAr)}"${attributes}>${escapeHtml(translate(key, fallbackAr))}</${tag}>`;
    const notify = (message, isError = false) => {
        if (window.showToast) window.showToast(message, isError);
        else if (isError) console.error(message);
    };
    let bootstrap = null;
    let branchesRequest = null;
    let branchesLoadFailed = false;

    function mountContextShell() {
        const shell = $('branchContextShell');
        const row = document.querySelector('.topbar-mobile-row');
        const actions = row?.querySelector(':scope > .topbar-mobile-actions');
        if (shell && row && shell.parentElement !== row) row.insertBefore(shell, actions || null);
    }

    function updateMobileContextTrigger() {
        const trigger = $('branchContextMobileTrigger');
        const branch = $('branchContextSelect');
        const section = $('sectionContextSelect');
        if (!trigger || !branch || !section) return;
        const branchName = branch.selectedOptions[0]?.textContent?.trim() || translate('context.allBranches', 'كل الفروع');
        const sectionName = section.hidden || section.disabled
            ? translate('context.allSections', 'كل الأقسام')
            : section.selectedOptions[0]?.textContent?.trim() || translate('context.allSections', 'كل الأقسام');
        $('branchContextMobileBranch').textContent = branchName;
        $('branchContextMobileSection').textContent = sectionName;
        const label = translateShared('shell.context', 'سياق العمل');
        trigger.setAttribute('aria-label', `${label}: ${branchName}، ${sectionName}`);
        trigger.title = `${branchName} · ${sectionName}`;
    }

    function initMobileContextTrigger() {
        const shell = $('branchContextShell');
        const trigger = $('branchContextMobileTrigger');
        if (!shell || !trigger) return;
        const close = (restoreFocus = true) => {
            shell.removeAttribute('data-context-open');
            trigger.setAttribute('aria-expanded', 'false');
            if (restoreFocus) trigger.focus({ preventScroll: true });
        };
        trigger.addEventListener('click', () => {
            const open = shell.dataset.contextOpen === 'true';
            shell.dataset.contextOpen = String(!open);
            trigger.setAttribute('aria-expanded', String(!open));
            if (!open) window.requestAnimationFrame(() => shell.querySelector('.branch-context-trigger:not(:disabled)')?.focus({ preventScroll: true }));
            else close(false);
        });
        document.addEventListener('pointerdown', (event) => {
            if (shell.dataset.contextOpen === 'true' && !shell.contains(event.target)) close(false);
        });
        document.addEventListener('keydown', (event) => {
            if (event.key !== 'Escape' || shell.dataset.contextOpen !== 'true') return;
            event.preventDefault();
            close();
        });
        updateMobileContextTrigger();
    }

    function syncContextBar() {
        const shell = $('branchContextShell');
        if (shell) shell.dataset.contextReady = shell.hidden ? 'false' : 'true';
    }

    function syncDashboardScopeSummary() {
        const branchSelect = $('branchContextSelect');
        const sectionSelect = $('sectionContextSelect');
        const branchSummary = $('dashboardScopeBranch');
        const sectionSummary = $('dashboardScopeSection');
        if (!branchSelect || !sectionSelect || !branchSummary || !sectionSummary) return;
        branchSummary.textContent = branchSelect.selectedOptions[0]?.textContent?.trim()
            || translate('context.allBranches', 'كل الفروع');
        sectionSummary.textContent = sectionSelect.disabled || sectionSelect.hidden
            ? translate('context.allSections', 'كل الأقسام')
            : sectionSelect.selectedOptions[0]?.textContent?.trim() || translate('context.allSections', 'كل الأقسام');
    }

    function getScopeOptions(branchId) {
        const active = Array.isArray(bootstrap?.activeBranches) ? bootstrap.activeBranches : [];
        const allowed = Array.isArray(bootstrap?.branches) ? bootstrap.branches : active;
        const branches = [];
        if (bootstrap?.canUseAllBranches && active.length > 1) {
            branches.push({ value: '', label: translate('context.allBranches', 'كل الفروع') });
        }
        allowed.forEach((branch) => branches.push({ value: String(branch.id), label: String(branch.name || '') }));
        const selectedBranch = String(branchId ?? $('branchContextSelect')?.value ?? '');
        const sectionsForBranch = selectedBranch
            ? (Array.isArray(bootstrap?.sections) ? bootstrap.sections : [])
                .filter((section) => String(section.branchId) === selectedBranch && section.active !== false)
                .map((section) => ({ value: String(section.id), label: sectionLabel(section) }))
            : [];
        const sections = [{ value: '', label: translate('context.allSections', 'كل الأقسام') }, ...sectionsForBranch];
        return { branches, sections, loading: Boolean(branchesRequest), error: branchesLoadFailed };
    }

    function applyDashboardScope(branchId, sectionId) {
        const branchSelect = $('branchContextSelect');
        const sectionSelect = $('sectionContextSelect');
        if (!branchSelect || !sectionSelect || !bootstrap) return { ok: false, changed: false };
        const nextBranch = String(branchId ?? '');
        const nextSection = String(sectionId ?? '');
        const options = getScopeOptions(nextBranch);
        if (!options.branches.some((option) => option.value === nextBranch)) return { ok: false, changed: false };
        if (nextSection && !options.sections.some((option) => option.value === nextSection)) return { ok: false, changed: false };
        if (nextSection && !nextBranch) return { ok: false, changed: false };
        const previousBranch = branchSelect.value;
        const previousSection = sectionSelect.value;
        if (previousBranch === nextBranch && previousSection === nextSection) return { ok: true, changed: false };

        // Commit the authorized pair as one context transition. Do not fire the
        // native selects' individual change handlers, which would emit two
        // reload events and clear the newly selected section between them.
        writeStoredBranch(nextBranch);
        writeStoredSection(nextSection);
        branchSelect.value = nextBranch;
        renderSelector(bootstrap);
        sectionSelect.value = nextSection;
        writeStoredSection(sectionSelect.value);
        updateMobileContextTrigger();
        syncDashboardScopeSummary();
        const activeBranch = bootstrap?.activeBranches?.find((branch) => String(branch.id) === nextBranch);
        $('branchContextStatus').textContent = activeBranch
            ? translate(activeBranch.status === 'active' ? 'status.active' : 'status.inactive', activeBranch.status === 'active' ? 'نشط' : 'غير نشط')
            : translate('context.allBranchesView', 'عرض موحد');
        window.dispatchEvent(new CustomEvent('topgym:branch-context-changed', {
            detail: { branchId: nextBranch ? Number(nextBranch) : null, sectionId: sectionSelect.value ? Number(sectionSelect.value) : null }
        }));
        return { ok: true, changed: true };
    }

    function initDashboardScopeDialog() {
        const dialog = $('dashboardScopeDialog');
        const trigger = $('dashboardScopeOpen');
        const form = $('dashboardScopeForm');
        const branchSelect = $('dashboardScopeBranchSelect');
        const sectionSelect = $('dashboardScopeSectionSelect');
        const branchSearch = $('dashboardScopeBranchSearch');
        const sectionSearch = $('dashboardScopeSectionSearch');
        const fields = $('dashboardScopeFields');
        const preview = $('dashboardScopePreview');
        const status = $('dashboardScopeStatus');
        const applyButton = $('dashboardScopeApply');
        if (!dialog || !trigger || !form || !branchSelect || !sectionSelect || !fields || !preview || !status || !applyButton) return;

        const staged = { branchId: '', sectionId: '', branchOptions: [], sectionOptions: [], requestId: 0 };
        const close = () => {
            if (!dialog.open) return;
            dialog.close();
            trigger.focus({ preventScroll: true });
        };
        const option = (label, value) => new Option(label, value);
        const filteredOptions = (items, query, selectedValue) => {
            const normalized = String(query || '').trim().toLocaleLowerCase();
            if (!normalized) return items;
            const filtered = items.filter((item) => item.label.toLocaleLowerCase().includes(normalized));
            const selected = items.find((item) => item.value === selectedValue);
            return selected && !filtered.some((item) => item.value === selectedValue) ? [selected, ...filtered] : filtered;
        };
        const renderBranchOptions = () => {
            const visible = filteredOptions(staged.branchOptions, branchSearch?.value, staged.branchId);
            branchSelect.replaceChildren(option(translate('context.selectBranch', 'اختر الفرع'), '__unavailable__'), ...visible.map((item) => option(item.label, item.value)));
            branchSelect.value = visible.some((item) => item.value === staged.branchId) ? staged.branchId : '__unavailable__';
        };
        const renderSectionOptions = () => {
            staged.sectionOptions = getScopeOptions(staged.branchId).sections;
            const visible = filteredOptions(staged.sectionOptions, sectionSearch?.value, staged.sectionId);
            sectionSelect.replaceChildren(...visible.map((item) => option(item.label, item.value)));
            sectionSelect.disabled = !staged.branchId || staged.sectionOptions.length <= 1;
            if (!staged.sectionOptions.some((item) => item.value === staged.sectionId)) staged.sectionId = '';
            sectionSelect.value = visible.some((item) => item.value === staged.sectionId) ? staged.sectionId : '__unavailable__';
            if (!staged.branchId) sectionSelect.value = '';
        };
        const syncPreview = () => {
            const branch = staged.branchOptions.find((item) => item.value === staged.branchId);
            const section = staged.sectionOptions.find((item) => item.value === staged.sectionId);
            $('dashboardScopePreviewBranch').textContent = branch?.label || '—';
            $('dashboardScopePreviewSection').textContent = section?.label || translate('context.allSections', 'كل الأقسام');
        };
        const setSearchVisibility = () => {
            if (branchSearch) branchSearch.hidden = staged.branchOptions.length <= 6;
            if (sectionSearch) sectionSearch.hidden = staged.sectionOptions.length <= 6;
        };
        const resetStaged = () => {
            staged.branchId = String($('branchContextSelect')?.value || '');
            staged.sectionId = String($('sectionContextSelect')?.value || '');
            if (branchSearch) branchSearch.value = '';
            if (sectionSearch) sectionSearch.value = '';
        };

        trigger.addEventListener('click', async () => {
            resetStaged();
            const requestId = ++staged.requestId;
            fields.hidden = true;
            preview.hidden = true;
            status.hidden = false;
            status.textContent = translateShared('dashboard.scope.loading', 'جارٍ تحميل النطاقات المسموح بها…');
            applyButton.disabled = true;
            dialog.showModal();
            try {
                const options = await window.topGymBranchContext?.getScopeOptions?.();
                if (!dialog.open || requestId !== staged.requestId) return;
                if (!options || options.error || options.branches.length === 0) {
                    status.textContent = translateShared(options?.error ? 'dashboard.scope.error' : 'dashboard.scope.empty', options?.error ? 'تعذر تحميل النطاقات. أغلق النافذة وحاول مرة أخرى.' : 'لا توجد نطاقات متاحة لحسابك.');
                    applyButton.disabled = true;
                    return;
                }
                staged.branchOptions = options.branches;
                if (!staged.branchOptions.some((item) => item.value === staged.branchId)) staged.branchId = staged.branchOptions[0].value;
                renderBranchOptions();
                renderSectionOptions();
                setSearchVisibility();
                syncPreview();
                status.hidden = true;
                fields.hidden = false;
                preview.hidden = false;
                applyButton.disabled = false;
            } catch {
                if (!dialog.open || requestId !== staged.requestId) return;
                status.textContent = translateShared('dashboard.scope.error', 'تعذر تحميل النطاقات. أغلق النافذة وحاول مرة أخرى.');
                applyButton.disabled = true;
            }
        });

        branchSelect.addEventListener('change', () => {
            if (branchSelect.value === '__unavailable__') return;
            staged.branchId = branchSelect.value;
            staged.sectionId = '';
            if (sectionSearch) sectionSearch.value = '';
            renderSectionOptions();
            setSearchVisibility();
            syncPreview();
        });
        sectionSelect.addEventListener('change', () => {
            if (sectionSelect.value === '__unavailable__') return;
            staged.sectionId = sectionSelect.value;
            syncPreview();
        });
        branchSearch?.addEventListener('input', renderBranchOptions);
        sectionSearch?.addEventListener('input', renderSectionOptions);
        [branchSearch, sectionSearch].forEach((search) => search?.addEventListener('keydown', (event) => {
            if (event.key === 'Enter') event.preventDefault();
        }));
        $('dashboardScopeClose')?.addEventListener('click', close);
        $('dashboardScopeCancel')?.addEventListener('click', close);
        dialog.addEventListener('cancel', (event) => { event.preventDefault(); close(); });
        dialog.addEventListener('click', (event) => { if (event.target === dialog) close(); });
        dialog.addEventListener('close', () => {
            staged.requestId += 1;
            resetStaged();
            trigger.focus({ preventScroll: true });
        });
        form.addEventListener('submit', (event) => {
            event.preventDefault();
            const result = window.topGymBranchContext?.applyDashboardScope?.(staged.branchId, staged.sectionId);
            if (!result?.ok) {
                status.hidden = false;
                status.textContent = translateShared('dashboard.scope.invalid', 'اختيار النطاق غير متاح لحسابك.');
                return;
            }
            close();
        });
        window.addEventListener('topgym:tab-changed', (event) => {
            if (event.detail?.name !== 'dashboard') close();
        });
    }

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

    function readStoredSection() {
        try { return sessionStorage.getItem(sectionStorageKey); } catch { return null; }
    }

    function writeStoredSection(value) {
        try {
            if (value) sessionStorage.setItem(sectionStorageKey, String(value));
            else sessionStorage.removeItem(sectionStorageKey);
        } catch {
            // A disabled session store must not prevent navigation.
        }
    }

    function sectionLabel(section) {
        const labels = {
            men: ['section.type.men', 'رجال'],
            women: ['section.type.women', 'سيدات'],
            mixed: ['section.type.mixed', 'مختلط']
        };
        const typeCode = String(section?.type || '').toLowerCase();
        const type = labels[typeCode];
        const typeLabel = type ? translate(type[0], type[1]) : section?.name || translate('section.type.unknown', 'قسم');
        const canonicalNames = { men: ['men', 'رجال'], women: ['women', 'سيدات'], mixed: ['mixed', 'مختلط'] }[typeCode] || [];
        return section?.name && section.name !== typeLabel && !canonicalNames.includes(String(section.name).toLowerCase()) ? `${typeLabel} · ${section.name}` : typeLabel;
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
        button.setAttribute('aria-label', translateShared('nav.branches', 'الفروع والأقسام'));
        button.title = translateShared('nav.branches', 'الفروع والأقسام');
        button.innerHTML = '<svg class="ui-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 20h16"/><path d="M6 20V8l6-4 6 4v12"/><path d="M9 11h.01M15 11h.01M9 15h.01M15 15h.01"/></svg><span data-i18n="nav.branches">الفروع والأقسام</span>';
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
                <div class="branches-page-heading"><span class="branches-page-kicker" data-i18n="branchesScreen.header.kicker" data-branches-fallback="إدارة الفروع">${escapeHtml(translate('header.kicker', 'إدارة الفروع'))}</span><h2 id="branchesTitle" data-i18n="branchesScreen.header.title" data-branches-fallback="إدارة فروع الجيم">${escapeHtml(translate('header.title', 'إدارة فروع الجيم'))}</h2><p data-i18n="branchesScreen.header.description" data-branches-fallback="أضف الفروع وحدد بيانات التشغيل داخل حساب الجيم.">${escapeHtml(translate('header.description', 'أضف الفروع وحدد بيانات التشغيل داخل حساب الجيم.'))}</p></div>
                <div class="branches-page-actions"><div class="branches-page-summary" aria-label="${escapeHtml(translate('summary.label', 'ملخص الفروع'))}"><span><strong id="branchesActiveCount">0</strong><small data-i18n="branchesScreen.summary.active" data-branches-fallback="فروع نشطة">${escapeHtml(translate('summary.active', 'فروع نشطة'))}</small></span><span><strong id="branchesLimitValue">—</strong><small data-i18n="branchesScreen.summary.limit" data-branches-fallback="حد الباقة">${escapeHtml(translate('summary.limit', 'حد الباقة'))}</small></span></div><button class="btn btn-primary branches-create-trigger" id="branchCreateOpen" type="button"><span aria-hidden="true">+</span> ${localizedMarkup('actions.addBranch', 'إضافة فرع')}</button></div>
            </header>
            <section class="branches-card branches-list-card">
                    <div class="branches-card-header"><div><span class="branches-card-kicker" data-i18n="branchesScreen.list.kicker" data-branches-fallback="دليل الفروع">${escapeHtml(translate('list.kicker', 'دليل الفروع'))}</span><h3 data-i18n="branchesScreen.list.title" data-branches-fallback="الفروع الحالية">${escapeHtml(translate('list.title', 'الفروع الحالية'))}</h3><p data-i18n="branchesScreen.list.description" data-branches-fallback="الأرشفة تحفظ السجل ولا تحذف البيانات التشغيلية.">${escapeHtml(translate('list.description', 'الأرشفة تحفظ السجل ولا تحذف البيانات التشغيلية.'))}</p></div><button class="btn btn-light btn-small" id="branchesRefresh" type="button">${localizedMarkup('actions.refresh', 'تحديث')}</button></div>
                    <div id="branchesList" class="branches-list"><div class="loading" data-i18n="branchesScreen.loading" data-branches-fallback="جارٍ تحميل الفروع…">${escapeHtml(translate('loading', 'جارٍ تحميل الفروع…'))}</div></div>
            </section>
            <dialog id="branchCreateDialog" class="branch-create-dialog lf-modal-shell lf-modal--md lf-modal--structured">
                <form id="branchCreateForm" class="dialog-body branches-form" novalidate>
                    <div class="details-dialog-head"><div><span class="branches-card-kicker" data-i18n="branchesScreen.dialog.kicker" data-branches-fallback="فرع جديد">${escapeHtml(translate('dialog.kicker', 'فرع جديد'))}</span><h3 data-i18n="branchesScreen.dialog.title" data-branches-fallback="إضافة فرع">${escapeHtml(translate('dialog.title', 'إضافة فرع'))}</h3><p data-i18n="branchesScreen.dialog.description" data-branches-fallback="سيتم حفظه كفرع تابع لنفس الجيم.">${escapeHtml(translate('dialog.description', 'سيتم حفظه كفرع تابع لنفس الجيم.'))}</p></div><button class="btn btn-light btn-small" id="branchCreateDialogClose" type="button">${localizedMarkup('actions.close', 'إغلاق')}</button></div>
                    <div class="branch-create-fields">
                        <label class="form-label"><span data-i18n="branchesScreen.fields.code" data-branches-fallback="كود الفرع">${escapeHtml(translate('fields.code', 'كود الفرع'))}</span><input id="branchCodeInput" name="code" required maxlength="40" dir="ltr" placeholder="nasr-city"></label>
                        <label class="form-label"><span data-i18n="branchesScreen.fields.name" data-branches-fallback="اسم الفرع">${escapeHtml(translate('fields.name', 'اسم الفرع'))}</span><input id="branchNameInput" name="name" required maxlength="160" placeholder="فرع مدينة نصر" data-i18n-placeholder="branchesScreen.fields.namePlaceholder" data-branches-placeholder-fallback="فرع مدينة نصر"></label>
                        <label class="form-label"><span data-i18n="branchesScreen.fields.address" data-branches-fallback="العنوان">${escapeHtml(translate('fields.address', 'العنوان'))}</span><input id="branchAddressInput" name="address" maxlength="300"></label>
                        <label class="form-label"><span data-i18n="branchesScreen.fields.phone" data-branches-fallback="الهاتف">${escapeHtml(translate('fields.phone', 'الهاتف'))}</span><input id="branchPhoneInput" name="phone" type="tel" inputmode="numeric" autocomplete="tel" data-phone-input maxlength="40" dir="ltr"></label>
                    </div>
                    <div class="branch-create-options"><label class="checkbox-field branches-check-field"><input type="checkbox" name="storeEnabled" checked> ${localizedMarkup('fields.enableStore', 'تفعيل المتجر')}</label><label class="checkbox-field branches-check-field"><input type="checkbox" name="barEnabled"> ${localizedMarkup('fields.enableBarAndPos', 'تفعيل البار وإنشاء موقع البيع')}</label></div>
                    <p class="branches-form-status" id="branchFormStatus" role="status" aria-live="polite"></p>
                    <div class="dialog-actions"><button class="btn btn-light" id="branchCreateCancel" type="button">${localizedMarkup('actions.cancel', 'إلغاء')}</button><button class="btn btn-primary" type="submit">${localizedMarkup('actions.submitAddBranch', 'إضافة الفرع')}</button></div>
                </form>
            </dialog>`;
        const feedback = $('feedbackSection');
        feedback?.parentElement?.insertBefore(panel, feedback);
    }

    function openBranchCreateDialog() {
        const dialog = $('branchCreateDialog');
        const form = $('branchCreateForm');
        if (!dialog) return;
        form?.reset();
        const status = $('branchFormStatus');
        if (status) status.textContent = '';
        if (typeof dialog.showModal === 'function' && !dialog.open) dialog.showModal();
        else dialog.setAttribute('open', '');
        window.setTimeout(() => $('branchCodeInput')?.focus(), 40);
    }

    function closeBranchCreateDialog() {
        const dialog = $('branchCreateDialog');
        if (typeof dialog?.close === 'function' && dialog.open) dialog.close();
        else dialog?.removeAttribute('open');
    }

    function refreshContextDropdown(select) {
        const field = select?.closest('[data-context-field]');
        const trigger = field?.querySelector('.branch-context-trigger');
        const menu = field?.querySelector('.branch-context-menu');
        if (!select || !field || !trigger || !menu) return;

        const selectedOption = select.options[select.selectedIndex];
        const selectedValue = String(select.value || '');
        const selectedLabel = selectedOption?.textContent?.trim() || '—';
        const valueElement = trigger.querySelector('[data-context-value]');
        if (valueElement) valueElement.textContent = selectedLabel;
        updateMobileContextTrigger();
        const isSection = field.dataset.contextField === 'section';
        const contextLabel = translate(isSection ? 'context.section' : 'context.branch', isSection ? 'القسم' : 'الفرع');
        trigger.setAttribute('aria-label', translate(isSection ? 'context.currentSection' : 'context.currentBranch', `${contextLabel} الحالي: {{name}}`, { name: selectedLabel }));
        trigger.setAttribute('title', translate(isSection ? 'context.sectionTitle' : 'context.branchTitle', `${contextLabel}: {{name}}`, { name: selectedLabel }));
        trigger.setAttribute('dir', 'rtl');
        if (valueElement) valueElement.setAttribute('dir', 'auto');
        trigger.disabled = Boolean(select.disabled);
        trigger.setAttribute('aria-disabled', String(Boolean(select.disabled)));
        trigger.setAttribute('aria-expanded', String(field.classList.contains('is-open')));

        menu.innerHTML = Array.from(select.options).map((option) => {
            const value = String(option.value || '');
            const selected = value === selectedValue;
            return `<button type="button" class="branch-context-option${selected ? ' is-selected' : ''}" role="option" aria-selected="${selected}" data-context-option="${escapeHtml(value)}"${select.disabled ? ' disabled' : ''}>${escapeHtml(option.textContent || '')}</button>`;
        }).join('');

        menu.querySelectorAll('[data-context-option]').forEach((optionButton) => {
            optionButton.addEventListener('click', () => {
                if (select.disabled) return;
                select.value = optionButton.dataset.contextOption || '';
                select.dispatchEvent(new Event('change', { bubbles: true }));
                closeContextField(field);
            });
        });

        menu.onkeydown = (event) => {
            const options = [...menu.querySelectorAll('[data-context-option]:not(:disabled)')];
            if (!options.length) return;
            const currentIndex = options.indexOf(document.activeElement);
            let nextIndex = currentIndex;
            if (event.key === 'ArrowDown') nextIndex = currentIndex < 0 ? 0 : (currentIndex + 1) % options.length;
            else if (event.key === 'ArrowUp') nextIndex = currentIndex < 0 ? options.length - 1 : (currentIndex - 1 + options.length) % options.length;
            else if (event.key === 'Home') nextIndex = 0;
            else if (event.key === 'End') nextIndex = options.length - 1;
            else return;
            event.preventDefault();
            options.forEach((option) => { option.tabIndex = -1; });
            options[nextIndex].focus({ preventScroll: true });
        };
    }

    function closeContextField(field, { restoreFocus = true } = {}) {
        if (!field) return false;
        const wasOpen = field.classList.contains('is-open');
        const trigger = field.querySelector('.branch-context-trigger');
        field.classList.remove('is-open');
        trigger?.setAttribute('aria-expanded', 'false');
        if (restoreFocus && wasOpen && trigger && !trigger.disabled) {
            trigger.focus({ preventScroll: true });
        }
        return wasOpen;
    }

    function closeOpenContextFields(event) {
        if (event.key !== 'Escape') return;
        const openFields = [...document.querySelectorAll('[data-context-field].is-open')];
        if (!openFields.length) return;
        event.preventDefault();
        event.stopPropagation();
        openFields.forEach((field) => closeContextField(field));
    }

    function ensureContextDropdown(select, field) {
        if (!select || !field) return;
        if (!field.querySelector('.branch-context-trigger')) {
            const trigger = document.createElement('button');
            trigger.className = 'branch-context-trigger';
            trigger.type = 'button';
            trigger.setAttribute('aria-haspopup', 'listbox');
            trigger.setAttribute('aria-expanded', 'false');
            trigger.setAttribute('aria-label', select.getAttribute('aria-label') || translate(field.dataset.contextField === 'section' ? 'context.sectionCurrent' : 'context.branchCurrent', field.dataset.contextField === 'section' ? 'القسم الحالي' : 'الفرع الحالي'));
            trigger.innerHTML = '<span data-context-value>—</span><span class="branch-context-trigger-chevron" aria-hidden="true"></span>';
            const menu = document.createElement('div');
            menu.className = 'branch-context-menu';
            menu.id = `${select.id}Menu`;
            menu.setAttribute('role', 'listbox');
            menu.setAttribute('aria-orientation', 'vertical');
            trigger.setAttribute('aria-controls', menu.id);
            field.querySelector('.branch-context-field-copy')?.append(trigger);
            field.append(menu);

            trigger.addEventListener('click', () => {
                if (select.disabled) return;
                if (field.classList.contains('is-open')) {
                    closeContextField(field);
                    return;
                }
                document.querySelectorAll('[data-context-field].is-open').forEach((openField) => {
                    if (openField !== field) closeContextField(openField, { restoreFocus: false });
                });
                field.classList.add('is-open');
                trigger.setAttribute('aria-expanded', 'true');
                window.requestAnimationFrame(() => {
                    const selected = field.querySelector('.branch-context-option.is-selected:not(:disabled)');
                    const firstAvailable = field.querySelector('.branch-context-option:not(:disabled)');
                    (selected || firstAvailable)?.focus({ preventScroll: true });
                });
            });
            trigger.addEventListener('keydown', (event) => {
                if (event.key === 'Escape') {
                    event.preventDefault();
                    closeContextField(field);
                }
            });
            select.addEventListener('change', () => {
                refreshContextDropdown(select);
                closeContextField(field, { restoreFocus: false });
            });
        }
        refreshContextDropdown(select);
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
        const sectionSelect = $('sectionContextSelect');
        if (!shell || !select) return;
        const active = Array.isArray(data?.activeBranches) ? data.activeBranches : [];
        const allowed = Array.isArray(data?.branches) ? data.branches : active;
        const allSections = Array.isArray(data?.sections) ? data.sections : [];
        shell.hidden = (!data?.hasMultipleActiveBranches || allowed.length < 2) && allSections.length === 0;
        select.innerHTML = '';
        if (data?.canUseAllBranches && active.length > 1) select.append(new Option(translate('context.allBranches', 'كل الفروع'), ''));
        allowed.forEach((branch) => select.append(new Option(branch.name, String(branch.id))));
        const stored = readStoredBranch();
        const allowedIds = new Set(allowed.map((branch) => String(branch.id)));
        if (stored && allowedIds.has(stored)) select.value = stored;
        else {
            const activeMain = active.find((branch) => branch.isMain && allowedIds.has(String(branch.id)));
            const permittedDefault = data?.defaultBranch && allowedIds.has(String(data.defaultBranch.id))
                ? data.defaultBranch
                : null;
            const initialBranch = activeMain || permittedDefault || allowed[0] || null;
            select.value = initialBranch ? String(initialBranch.id) : '';
            writeStoredBranch(select.value);
        }
        const selected = active.find((branch) => String(branch.id) === select.value);
        $('branchContextStatus').textContent = selected ? translate(selected.status === 'active' ? 'status.active' : 'status.inactive', selected.status === 'active' ? 'نشط' : 'غير نشط') : translate('context.allBranchesView', 'عرض موحد');
        refreshContextDropdown(select);
        if (sectionSelect) {
            const sectionField = document.getElementById('sectionContextField');
            const sections = (Array.isArray(data?.sections) ? data.sections : [])
                .filter((section) => String(section.branchId) === String(select.value) && section.active !== false);
            sectionSelect.innerHTML = '';
            sectionSelect.append(new Option(translate('context.allSections', 'كل الأقسام'), ''));
            sections.forEach((section) => sectionSelect.append(new Option(sectionLabel(section), String(section.id))));
            const storedSection = readStoredSection();
            const allowedSectionIds = new Set(sections.map((section) => String(section.id)));
            if (storedSection && allowedSectionIds.has(storedSection) && select.value) sectionSelect.value = storedSection;
            else { sectionSelect.value = ''; writeStoredSection(''); }
            sectionSelect.disabled = !select.value || sections.length === 0;
            sectionSelect.hidden = !select.value;
            if (sectionField) sectionField.hidden = sectionSelect.hidden;
            refreshContextDropdown(sectionSelect);
        }
        syncContextBar();
        syncDashboardScopeSummary();
    }

    function renderManager(data) {
        const active = Array.isArray(data?.activeBranches) ? data.activeBranches : [];
        const limit = data?.branchLimit == null ? '—' : formatNumber(data.branchLimit);
        if ($('branchesActiveCount')) $('branchesActiveCount').textContent = formatNumber(active.length);
        if ($('branchesLimitValue')) $('branchesLimitValue').textContent = limit;
        const list = $('branchesList');
        if (!list) return;
        list.innerHTML = active.length ? active.map((branch) => {
            const statusKey = branch.status === 'active' ? 'status.active' : branch.status === 'inactive' ? 'status.inactive' : 'status.archived';
            const statusFallback = branch.status === 'active' ? 'نشط' : branch.status === 'inactive' ? 'متوقف' : 'مؤرشف';
            return `<article class="branch-list-item" data-branch-row="${escapeHtml(branch.id)}"><div class="branch-list-marker" aria-hidden="true"></div><div class="branch-list-copy"><strong>${escapeHtml(branch.name)}</strong><span dir="ltr">${escapeHtml(branch.code)}</span><small>${escapeHtml(branch.address || translate('branch.noAddress', 'بدون عنوان'))} · ${escapeHtml(translate(branch.isMain ? 'branch.main' : 'branch.operational', branch.isMain ? 'الفرع الرئيسي' : 'فرع تشغيلي'))}</small></div><div class="branch-list-actions"><span class="branch-status ${escapeHtml(branch.status)}" data-i18n="branchesScreen.${statusKey}" data-branches-fallback="${escapeHtml(statusFallback)}">${escapeHtml(translate(statusKey, statusFallback))}</span>${!branch.isMain && branch.status !== 'archived' ? `<button class="btn btn-light btn-small" type="button" data-branch-archive="${escapeHtml(branch.id)}">${localizedMarkup('actions.archive', 'أرشفة الفرع')}</button>` : ''}</div></article>`;
        }).join('') : `<div class="empty" data-i18n="branchesScreen.empty" data-branches-fallback="لا توجد فروع نشطة.">${escapeHtml(translate('empty', 'لا توجد فروع نشطة.'))}</div>`;
    }

    function renderManagerWithCommerce(data) {
        // The existing archive endpoint is the safe delete contract: it removes a
        // branch from active operations while preserving its historical data.
        function decorateBranchArchiveActions() {
            document.querySelectorAll('[data-branch-archive]').forEach((button) => {
                button.classList.remove('btn-danger');
                button.classList.add('btn-light');
                button.innerHTML = localizedMarkup('actions.archive', 'أرشفة الفرع');
                const name = button.closest('[data-branch-row]')?.querySelector('.branch-list-copy strong')?.textContent?.trim();
                button.title = translate('actions.archive', 'أرشفة الفرع');
                button.setAttribute('aria-label', name ? translate('actions.archiveNamed', 'أرشفة الفرع {{name}}', { name }) : translate('actions.archive', 'أرشفة الفرع'));
            });
        }

        const active = Array.isArray(data?.activeBranches) ? data.activeBranches : [];
        const limit = data?.branchLimit == null ? '—' : formatNumber(data.branchLimit);
        if ($('branchesActiveCount')) $('branchesActiveCount').textContent = formatNumber(active.length);
        if ($('branchesLimitValue')) $('branchesLimitValue').textContent = limit;
        const list = $('branchesList');
        if (!list) return;
        list.innerHTML = active.length ? active.map((branch) => {
            const statusKey = branch.status === 'active' ? 'status.active' : branch.status === 'inactive' ? 'status.inactive' : 'status.archived';
            const statusFallback = branch.status === 'active' ? 'نشط' : branch.status === 'inactive' ? 'متوقف' : 'مؤرشف';
            const storeKey = branch.storeEnabled ? 'status.enabled' : 'status.disabled';
            const barKey = branch.barEnabled ? 'status.enabled' : 'status.disabled';
            const toggleKey = branch.barEnabled ? 'actions.disableBar' : 'actions.enableBar';
            const toggleFallback = branch.barEnabled ? 'إيقاف البار' : 'تفعيل البار';
            return `<article class="branch-list-item" data-branch-row="${escapeHtml(branch.id)}"><div class="branch-list-marker" aria-hidden="true"></div><div class="branch-list-copy"><strong>${escapeHtml(branch.name)}</strong><span dir="ltr">${escapeHtml(branch.code)}</span><small>${escapeHtml(branch.address || translate('branch.noAddress', 'بدون عنوان'))} · ${escapeHtml(translate(branch.isMain ? 'branch.main' : 'branch.operational', branch.isMain ? 'الفرع الرئيسي' : 'فرع تشغيلي'))}</small><div class="branch-commerce-chips" aria-label="${escapeHtml(translate('commerce.settings', 'إعدادات التجارة'))}"><span class="branch-commerce-chip ${branch.storeEnabled ? 'is-on' : ''}">${localizedMarkup('commerce.store', 'المتجر')} ${localizedMarkup(storeKey, branch.storeEnabled ? 'مفعل' : 'غير مفعل')}</span><span class="branch-commerce-chip ${branch.barEnabled ? 'is-on' : ''}">${localizedMarkup('commerce.bar', 'البار')} ${localizedMarkup(barKey, branch.barEnabled ? 'مفعل' : 'غير مفعل')}</span></div></div><div class="branch-list-actions"><span class="branch-status ${escapeHtml(branch.status)}" data-i18n="branchesScreen.${statusKey}" data-branches-fallback="${escapeHtml(statusFallback)}">${escapeHtml(translate(statusKey, statusFallback))}</span><button class="btn btn-light btn-small" type="button" data-branch-commerce="${escapeHtml(branch.id)}" data-next-bar="${branch.barEnabled ? 'false' : 'true'}">${localizedMarkup(toggleKey, toggleFallback)}</button>${!branch.isMain && branch.status !== 'archived' ? `<button class="btn btn-light btn-small" type="button" data-branch-archive="${escapeHtml(branch.id)}">${localizedMarkup('actions.archive', 'أرشفة الفرع')}</button>` : ''}</div></article>`;
        }).join('') : `<div class="empty" data-i18n="branchesScreen.empty" data-branches-fallback="لا توجد فروع نشطة.">${escapeHtml(translate('empty', 'لا توجد فروع نشطة.'))}</div>`;
        decorateBranchArchiveActions();
    }

    async function toggleBranchBar(branchId, enabled) {
        const branch = bootstrap?.activeBranches?.find((item) => String(item.id) === String(branchId));
        if (!branch) return;
        try {
            await window.topGymApi.patch(`/api/branches/${encodeURIComponent(branchId)}`, { name: branch.name, address: branch.address, phone: branch.phone, workingHours: branch.workingHours, storeEnabled: branch.storeEnabled, barEnabled: enabled });
            await loadBranches();
        } catch (error) { notify(error.message || translate('errors.updateBar', 'تعذر تحديث إعدادات البار.'), true); }
    }

    async function loadBranches() {
        if (!window.topGymAuth?.isReady?.() || !window.topGymAuth.getUser?.()) return;
        const user = window.topGymAuth.getUser();
        // A forced-password session is authenticated but deliberately locked.
        // Do not bootstrap tenant/branch data until the password rotation has
        // completed; the server will correctly reject it, but the UI should
        // not make that forbidden request during the lock screen.
        if (user.mustChangePassword) {
            setTabVisibility(false);
            const lockedShell = $('branchContextShell');
            if (lockedShell) lockedShell.hidden = true;
            syncContextBar();
            writeStoredSection('');
            return;
        }
        const isGym = user.tenantType === 'gym';
        setTabVisibility(isGym && user.role === 'Owner');
        const shell = $('branchContextShell');
        if (!isGym) { if (shell) shell.hidden = true; syncContextBar(); writeStoredSection(''); return; }
        if (branchesRequest) return branchesRequest;
        const loadPromise = (async () => {
            try {
                bootstrap = await window.topGymApi.request('/api/branches/bootstrap');
                branchesLoadFailed = false;
                const previousBranch = readStoredBranch();
                renderSelector(bootstrap);
                const selectedBranch = $('branchContextSelect')?.value || '';
                if (selectedBranch && selectedBranch !== previousBranch) {
                    window.dispatchEvent(new CustomEvent('topgym:branch-context-changed', {
                        detail: { branchId: Number(selectedBranch), sectionId: null }
                    }));
                }
                renderManagerWithCommerce({ ...bootstrap, branchLimit: bootstrap.branchLimit });
            } catch (error) {
                branchesLoadFailed = true;
                // Never keep sending a branch selected in an older session
                // after the authoritative bootstrap failed. The next request
                // can then resolve the tenant's single/default branch instead
                // of failing with a stale "Branch was not found" context.
                writeStoredBranch('');
                writeStoredSection('');
                if (shell) shell.hidden = true;
                syncContextBar();
                if (user.role === 'Owner') notify(error.message || translate('errors.load', 'تعذر تحميل سياق الفروع.'), true);
            }
        })();
        const trackedPromise = loadPromise.finally(() => {
            if (branchesRequest === trackedPromise) branchesRequest = null;
        });
        branchesRequest = trackedPromise;
        return trackedPromise;
    }

    // The members form reuses this already-authorized bootstrap instead of
    // issuing a second branches request. It exposes no raw authorization data;
    // consumers only receive the same scoped branch/section catalog rendered
    // by the context switcher.
    async function getBootstrap() {
        if (!bootstrap) await loadBranches();
        return bootstrap || {};
    }

    window.topGymBranchContext = Object.freeze({
        getBootstrap,
        getScopeOptions: async () => {
            if (!bootstrap && !branchesLoadFailed) await getBootstrap();
            return getScopeOptions();
        },
        applyDashboardScope,
        getSelectedBranchId: () => {
            const value = $('branchContextSelect')?.value;
            return value ? Number(value) : null;
        },
        getSelectedSectionId: () => {
            const value = $('sectionContextSelect')?.value;
            return value ? Number(value) : null;
        }
    });

    async function createBranch(event) {
        event.preventDefault();
        const form = event.currentTarget;
        const status = $('branchFormStatus');
        const payload = Object.fromEntries(new FormData(form).entries());
        status.textContent = '';
        try {
            await window.topGymApi.post('/api/branches', payload);
            form.reset();
            status.textContent = translate('messages.created', 'تمت إضافة الفرع بنجاح.');
            await loadBranches();
        } catch (error) {
            status.textContent = error.message || translate('errors.create', 'تعذر إضافة الفرع.');
            notify(status.textContent, true);
        }
    }

    async function archiveBranch(branchId) {
        if (!window.confirm(translate('confirm.archive', 'سيتم إيقاف العمليات الجديدة مع الاحتفاظ بالسجل. هل تريد المتابعة؟'))) return;
        try { await window.topGymApi.post(`/api/branches/${encodeURIComponent(branchId)}/archive`, {}); await loadBranches(); }
        catch (error) { notify(error.message || translate('errors.archive', 'تعذر أرشفة الفرع.'), true); }
    }

    function applyBranchTranslations() {
        const root = $('branchesSection');
        root?.querySelectorAll('[data-i18n][data-branches-fallback]').forEach((element) => {
            const key = element.dataset.i18n;
            const value = window.TopGymI18n?.t?.(key);
            element.textContent = value && value !== key ? value : element.dataset.branchesFallback;
        });
        root?.querySelectorAll('[data-i18n-placeholder][data-branches-placeholder-fallback]').forEach((element) => {
            const key = element.dataset.i18nPlaceholder;
            const value = window.TopGymI18n?.t?.(key);
            element.placeholder = value && value !== key ? value : element.dataset.branchesPlaceholderFallback;
        });
        const summary = root?.querySelector('.branches-page-summary');
        if (summary) summary.setAttribute('aria-label', translate('summary.label', 'ملخص الفروع'));
        root?.querySelectorAll('.branch-commerce-chips').forEach((element) => {
            element.setAttribute('aria-label', translate('commerce.settings', 'إعدادات التجارة'));
        });
        const tab = document.querySelector('[data-page-tab="branches"]');
        if (tab) {
            const label = translateShared('nav.branches', 'الفروع والأقسام');
            tab.title = label;
            tab.setAttribute('aria-label', label);
            const text = tab.querySelector('span');
            if (text) text.textContent = label;
        }
    }

    function refreshBranchLocale() {
        applyBranchTranslations();
        if (!bootstrap) return;
        // Use only the already-authorized in-memory bootstrap. Switching locale
        // must not issue a request or change the selected branch/section.
        renderSelector(bootstrap);
        renderManagerWithCommerce(bootstrap);
        applyBranchTranslations();
    }

    function bind() {
        window.addEventListener('topgym:localechange', refreshBranchLocale);
        document.addEventListener('keydown', closeOpenContextFields, true);
        document.addEventListener('pointerdown', (event) => {
            document.querySelectorAll('[data-context-field].is-open').forEach((field) => {
                if (!field.contains(event.target)) closeContextField(field, { restoreFocus: false });
            });
        }, true);
        mountContextShell();
        initMobileContextTrigger();
        ensureBranchTab();
        ensureBranchPanel();
        ensureContextDropdown($('branchContextSelect'), document.querySelector('[data-context-field="branch"]'));
        ensureContextDropdown($('sectionContextSelect'), $('sectionContextField'));
        $('branchCreateForm')?.addEventListener('submit', createBranch);
        $('branchCreateOpen')?.addEventListener('click', openBranchCreateDialog);
        $('branchCreateDialogClose')?.addEventListener('click', closeBranchCreateDialog);
        $('branchCreateCancel')?.addEventListener('click', closeBranchCreateDialog);
        $('branchCreateDialog')?.addEventListener('cancel', closeBranchCreateDialog);
        $('branchesRefresh')?.addEventListener('click', () => void loadBranches());
        $('branchContextSelect')?.addEventListener('change', (event) => {
            const value = event.currentTarget.value;
            writeStoredBranch(value);
            writeStoredSection('');
            const active = bootstrap?.activeBranches?.find((branch) => String(branch.id) === value);
            $('branchContextStatus').textContent = active ? 'نشط' : 'عرض موحد';
            renderSelector(bootstrap || {});
            window.dispatchEvent(new CustomEvent('topgym:branch-context-changed', { detail: { branchId: value ? Number(value) : null, sectionId: null } }));
        });
        $('sectionContextSelect')?.addEventListener('change', (event) => {
            const value = event.currentTarget.value;
            writeStoredSection(value);
            updateMobileContextTrigger();
            window.dispatchEvent(new CustomEvent('topgym:branch-context-changed', { detail: {
                branchId: $('branchContextSelect')?.value ? Number($('branchContextSelect').value) : null,
                sectionId: value ? Number(value) : null
            } }));
        });
        $('branchContextSelect')?.addEventListener('change', syncDashboardScopeSummary);
        $('sectionContextSelect')?.addEventListener('change', syncDashboardScopeSummary);
        $('dashboardScopeOpen')?.addEventListener('focus', syncDashboardScopeSummary);
        initDashboardScopeDialog();
        $('branchesList')?.addEventListener('click', (event) => {
            const button = event.target.closest('[data-branch-archive]');
            if (button) void archiveBranch(button.dataset.branchArchive);
            const commerceButton = event.target.closest('[data-branch-commerce]');
            if (commerceButton) void toggleBranchBar(commerceButton.dataset.branchCommerce, commerceButton.dataset.nextBar === 'true');
        });
        const schedule = window.requestIdleCallback
            ? (callback) => window.requestIdleCallback(callback, { timeout: 1200 })
            : (callback) => window.setTimeout(callback, 180);
        const start = () => schedule(() => { void loadBranches(); });
        if (window.topGymAuthReady) window.topGymAuthReady.then(start).catch(() => {});
        else start();
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bind, { once: true });
    else bind();
})();
