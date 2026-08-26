(() => {
    if (window.__topGymPermissionsPageLoaded) return;
    window.__topGymPermissionsPageLoaded = true;

    const state = { users: [], selectedId: null, catalog: [], grants: new Set(), lastModified: null, loaded: false, loading: false };
    const GROUP_LABELS = {
        dashboard: 'لوحة التحكم', members: 'المشتركون', memberships: 'العضويات', payments: 'التحصيل',
        trainees: 'المتدربون الخارجيون', coaching: 'التدريب والتغذية', attendance: 'الحضور والانصراف',
        finance: 'البيانات المالية', reports: 'التقارير', pricing: 'الأسعار والعضويات', day_passes: 'الحصص اليومية',
        library: 'المكتبة', management: 'إدارة الحسابات والنسخ', feedback: 'تقييمات المشتركين', permissions: 'الصلاحيات'
    };

    const $ = (id) => document.getElementById(id);
    const escapeHtml = (value) => String(value ?? '').replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[character]));

    function showStatus(message, type = 'success') {
        const status = $('permissionsStatus');
        if (!status) return;
        status.textContent = message;
        status.className = `permissions-status ${type}`;
        status.hidden = false;
    }

    function initials(name) {
        return String(name || 'A').trim().split(/\s+/).filter(Boolean).slice(0, 2).map((part) => [...part][0]).join('').toUpperCase() || 'A';
    }

    function setEditorEnabled(enabled) {
        $('permissionsSave').disabled = !enabled;
        $('permissionsReset').disabled = !enabled;
        $('permissionsReason').disabled = !enabled;
    }

    function renderUsers() {
        const host = $('permissionsUserList');
        const count = $('permissionsUsersCount');
        const total = $('permissionsAssistantsTotal');
        const active = $('permissionsAssistantsActive');
        const disabled = $('permissionsAssistantsDisabled');
        if (!host) return;
        if (count) count.textContent = String(state.users.length);
        if (total) total.textContent = String(state.users.length);
        if (active) active.textContent = String(state.users.filter((user) => user.status === 'Active').length);
        if (disabled) disabled.textContent = String(state.users.filter((user) => user.status === 'Disabled').length);
        if (!state.users.length) {
            host.innerHTML = '<div class="permissions-empty-state">لا توجد حسابات Assistant حتى الآن.</div>';
            state.selectedId = null;
            renderGrid();
            return;
        }
        host.innerHTML = state.users.map((user) => `<button class="permissions-user-button${Number(user.id) === Number(state.selectedId) ? ' active' : ''}" type="button" data-permission-user="${escapeHtml(user.id)}"><span class="permissions-user-avatar">${escapeHtml(initials(user.name))}</span><span class="permissions-user-copy"><strong>${escapeHtml(user.name)}</strong><small>${escapeHtml(user.email)}</small></span><span class="permissions-user-status${user.status === 'Disabled' ? ' disabled' : ''}" title="${escapeHtml(user.status)}"></span></button>`).join('');
    }

    function groupItems() {
        const groups = new Map();
        state.catalog.forEach((item) => {
            if (!groups.has(item.group)) groups.set(item.group, []);
            groups.get(item.group).push(item);
        });
        return [...groups.entries()];
    }

    function groupIsReadOnly(items) {
        const read = items.find((item) => item.code.endsWith('.read'));
        if (!read || !state.grants.has(read.code)) return false;
        return items.filter((item) => item.code !== read.code).every((item) => !state.grants.has(item.code));
    }

    function renderGrid() {
        const grid = $('permissionsGrid');
        const selected = state.users.find((user) => Number(user.id) === Number(state.selectedId));
        const title = $('permissionsSelectedUser');
        const meta = $('permissionsSelectedMeta');
        const badge = $('permissionsReadonlyBadge');
        if (title) title.textContent = selected ? selected.name : 'اختر حسابًا لعرض صلاحياته';
        if (badge) {
            badge.hidden = !selected;
            badge.textContent = selected ? 'تعديل موثق' : '';
        }
        if (meta) {
            const audit = state.lastModified;
            const auditDate = audit?.at ? new Intl.DateTimeFormat('ar-EG', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(audit.at)) : '';
            const lastModified = audit ? `آخر تعديل: ${audit.by?.name || 'Owner'}${auditDate ? ` · ${auditDate}` : ''}` : 'لم تُسجل تعديلات سابقة لهذا الحساب.';
            meta.textContent = selected ? `${selected.email} · ${selected.status === 'Active' ? 'الحساب نشط' : 'الحساب معطل'} · ${lastModified} · يتطلب الحفظ سببًا واضحًا.` : 'كل تعديل يُسجل في سجل التدقيق ويُلغي جلسة الحساب المستهدف.';
        }
        setEditorEnabled(Boolean(selected));
        if (!grid) return;
        if (!selected || !state.catalog.length) {
            grid.innerHTML = '<div class="permissions-empty-state">اختر حساب Assistant لعرض مصفوفة الصلاحيات.</div>';
            return;
        }
        grid.innerHTML = groupItems().map(([group, items], index) => {
            const readonly = groupIsReadOnly(items);
            const options = items.map((item) => `<label class="permission-option"><input type="checkbox" data-permission-code="${escapeHtml(item.code)}"${state.grants.has(item.code) ? ' checked' : ''}><span class="permission-option-copy"><strong>${escapeHtml(item.label)}</strong><small>${escapeHtml(item.description || '')}</small></span></label>`).join('');
            const hasRead = items.some((item) => item.code.endsWith('.read'));
            const granted = items.filter((item) => state.grants.has(item.code)).length;
            const control = hasRead
                ? `<label class="permission-readonly-toggle"><input type="checkbox" data-readonly-group="${escapeHtml(group)}"${readonly ? ' checked' : ''}><span>قراءة فقط</span></label>`
                : '<span class="permission-group-readonly">صلاحيات مستقلة</span>';
            const summaryControl = hasRead
                ? `<span class="permission-readonly-summary">${readonly ? 'قراءة فقط' : 'عمليات قابلة للتخصيص'}</span>`
                : '<span class="permission-group-readonly">صلاحيات مستقلة</span>';
            return `<details class="permission-group-card" data-permission-group="${escapeHtml(group)}"${index === 0 ? ' open' : ''}><summary class="permission-group-head"><span class="permission-group-title"><strong>${escapeHtml(GROUP_LABELS[group] || group)}</strong><small>${granted} من ${items.length} صلاحية مفعلة</small></span><span class="permission-group-summary"><span>${summaryControl}</span><span class="permission-group-chevron" aria-hidden="true"><svg class="permission-group-chevron-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m7 9 5 5 5-5"/></svg></span></span></summary><div class="permission-group-body">${hasRead ? `<div class="permission-group-controls">${control}</div>` : ''}${options}</div></details>`;
        }).join('');
    }

    async function loadCatalog() {
        const data = await window.topGymAuth.api('/api/auth/permissions/catalog');
        state.catalog = (data.permissions || []).filter((item) => !item.ownerOnly);
    }

    async function loadUsers() {
        const data = await window.topGymAuth.api('/api/auth/users');
        state.users = (data.users || []).filter((user) => user.role === 'Assistant');
        if (!state.users.some((user) => Number(user.id) === Number(state.selectedId))) state.selectedId = state.users[0]?.id || null;
        renderUsers();
        if (state.selectedId) await loadSelectedPermissions(state.selectedId);
    }

    async function loadSelectedPermissions(id) {
        state.selectedId = Number(id);
        renderUsers();
        const data = await window.topGymAuth.api(`/api/auth/users/${encodeURIComponent(id)}/permissions`);
        state.catalog = (data.permissions || []).filter((item) => !item.ownerOnly);
        state.grants = new Set(state.catalog.filter((item) => item.granted).map((item) => item.code));
        state.lastModified = data.lastModified || null;
        $('permissionsReason').value = '';
        $('permissionsStatus').hidden = true;
        renderGrid();
    }

    async function load() {
        if (state.loading || !window.topGymAuth?.isOwner?.()) return;
        state.loading = true;
        try {
            await loadCatalog();
            await loadUsers();
            state.loaded = true;
        } catch (error) {
            showStatus(error.message || 'تعذر تحميل الصلاحيات.', 'error');
        } finally {
            state.loading = false;
        }
    }

    function readFormPermissions() {
        const result = {};
        document.querySelectorAll('[data-permission-code]').forEach((input) => {
            result[input.dataset.permissionCode] = input.checked;
        });
        return result;
    }

    function applyReadOnly(group, enabled) {
        const card = document.querySelector(`[data-permission-group="${CSS.escape(group)}"]`);
        if (!card) return;
        const inputs = [...card.querySelectorAll('[data-permission-code]')];
        const read = inputs.find((input) => input.dataset.permissionCode.endsWith('.read'));
        if (read) read.checked = true;
        inputs.filter((input) => input !== read).forEach((input) => { input.checked = !enabled && input.checked; if (enabled) input.checked = false; });
        updateGroupSummary(card);
    }

    function updateGroupSummary(card) {
        if (!card) return;
        const inputs = [...card.querySelectorAll('[data-permission-code]')];
        const summary = card.querySelector('.permission-group-title small');
        if (summary) summary.textContent = `${inputs.filter((input) => input.checked).length} من ${inputs.length} صلاحية مفعلة`;
        const readonly = card.querySelector('[data-readonly-group]')?.checked;
        const readonlySummary = card.querySelector('.permission-readonly-summary');
        if (readonlySummary) readonlySummary.textContent = readonly ? 'قراءة فقط' : 'عمليات قابلة للتخصيص';
    }

    async function save(event) {
        event.preventDefault();
        if (!state.selectedId) return;
        const reason = $('permissionsReason').value.trim();
        if (!reason) {
            showStatus('اكتب سبب تعديل الصلاحيات قبل الحفظ.', 'error');
            $('permissionsReason').focus();
            return;
        }
        const button = $('permissionsSave');
        button.disabled = true;
        try {
            const data = await window.topGymAuth.api(`/api/auth/users/${encodeURIComponent(state.selectedId)}/permissions`, {
                method: 'PUT',
                body: JSON.stringify({ permissions: readFormPermissions(), reason })
            });
            state.catalog = (data.permissions || []).filter((item) => !item.ownerOnly);
            state.grants = new Set(state.catalog.filter((item) => item.granted).map((item) => item.code));
            state.lastModified = data.lastModified || null;
            $('permissionsReason').value = '';
            renderGrid();
            showStatus('تم حفظ الصلاحيات وإلغاء جلسة الحساب المستهدف بنجاح.', 'success');
        } catch (error) {
            showStatus(error.message || 'تعذر حفظ الصلاحيات.', 'error');
        } finally {
            button.disabled = false;
        }
    }

    async function reset() {
        if (!state.selectedId) return;
        const reason = $('permissionsReason').value.trim() || 'استعادة الصلاحيات الآمنة الافتراضية';
        const button = $('permissionsReset');
        button.disabled = true;
        try {
            const data = await window.topGymAuth.api(`/api/auth/users/${encodeURIComponent(state.selectedId)}/permissions/reset`, {
                method: 'POST',
                body: JSON.stringify({ reason })
            });
            state.catalog = (data.permissions || []).filter((item) => !item.ownerOnly);
            state.grants = new Set(state.catalog.filter((item) => item.granted).map((item) => item.code));
            state.lastModified = data.lastModified || null;
            $('permissionsReason').value = '';
            renderGrid();
            showStatus('تمت استعادة الصلاحيات الآمنة الافتراضية.', 'success');
        } catch (error) {
            showStatus(error.message || 'تعذر استعادة الصلاحيات.', 'error');
        } finally {
            button.disabled = false;
        }
    }

    function bindEvents() {
        const form = $('permissionsForm');
        if (!form || form.dataset.permissionsBound === 'true') return;
        form.dataset.permissionsBound = 'true';
        form.addEventListener('submit', save);
        $('permissionsReset')?.addEventListener('click', reset);
        $('permissionsUserList')?.addEventListener('click', (event) => {
            const button = event.target.closest('[data-permission-user]');
            if (button) void loadSelectedPermissions(button.dataset.permissionUser);
        });
        $('permissionsGrid')?.addEventListener('change', (event) => {
            if (event.target.matches('[data-readonly-group]')) applyReadOnly(event.target.dataset.readonlyGroup, event.target.checked);
            updateGroupSummary(event.target.closest('[data-permission-group]'));
        });
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bindEvents, { once: true });
    else bindEvents();

    window.addEventListener('topgym:tab-changed', (event) => {
        if (event.detail?.name === 'permissions') void load();
    });
})();
