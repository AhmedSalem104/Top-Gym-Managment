(() => {
    if (window.__topGymPermissionsPageLoaded) return;
    window.__topGymPermissionsPageLoaded = true;

    const state = { users: [], selectedId: null, catalog: [], grants: new Set(), lastModified: null, loaded: false, loading: false };
    const GROUP_KEYS = {
        dashboard: 'dashboard', members: 'members', memberships: 'memberships', payments: 'payments',
        trainees: 'trainees', coaching: 'coaching', attendance: 'attendance', finance: 'finance',
        reports: 'reports', pricing: 'pricing', day_passes: 'day_passes', library: 'library',
        management: 'management', feedback: 'feedback', permissions: 'permissions'
    };

    const $ = (id) => document.getElementById(id);
    const t = (key, params) => window.TopGymI18n?.t?.(`permissionsScreen.${key}`, params) ?? key;
    const escapeHtml = (value) => String(value ?? '').replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[character]));

    function localizeStaticContent() {
        const section = $('permissionsSection');
        if (!section) return;
        const set = (selector, key) => {
            const element = section.querySelector(selector);
            if (element) element.textContent = t(key);
        };
        set('.permissions-header .permissions-kicker', 'ownerOnly');
        set('#permissionsTitle', 'title');
        set('#permissionsDescription', 'description');
        set('.permissions-owner-badge', 'ownerNotice');
        set('.permissions-account-copy .permissions-kicker', 'accountsKicker');
        set('#permissionsAccountsTitle', 'accountsTitle');
        set('.permissions-account-copy p', 'accountsDescription');
        const metrics = section.querySelectorAll('.permissions-account-metric > span');
        ['totalAssistants', 'activeAccounts', 'disabledAccounts'].forEach((key, index) => { if (metrics[index]) metrics[index].textContent = t(key); });
        section.querySelector('.permissions-account-metrics')?.setAttribute('aria-label', t('assistantsSummary'));
        set('.permissions-auth-users-panel .permissions-kicker', 'accountsKicker');
        set('#authUsersTitle', 'accountsTitle');
        set('.permissions-auth-users-panel .auth-users-head p', 'accountsDescription');
        set('#authAddAssistantButton', 'addAssistant');
        set('.permissions-subheading > div > span', 'accounts');
        set('#permissionsUsersTitle', 'chooseAssistant');
        set('.permissions-editor-kicker', 'accessMatrix');
        const reasonLabel = section.querySelector('label[for="permissionsReason"] > span');
        if (reasonLabel) reasonLabel.textContent = t('reason');
        $('permissionsReason')?.setAttribute('placeholder', t('reasonPlaceholder'));
        set('#permissionsReset', 'reset');
        set('#permissionsSave', 'save');
        const tabLabel = document.querySelector('[data-page-tab="permissions"] span');
        if (tabLabel) tabLabel.textContent = t('tab');
    }

    function localizedPermission(item) {
        const [resource] = String(item.code || '').split('.');
        const action = String(item.code || '').split('.').at(-1) || 'view';
        const actionText = t(`action.${action}`);
        const resourceText = t(`resource.${resource === 'member' ? 'member' : resource}`);
        if (window.TopGymI18n?.get?.() !== 'en') return { label: item.label, description: item.description || '' };
        if (actionText.startsWith('action.') || resourceText.startsWith('resource.')) return { label: item.label, description: item.description || '' };
        return {
            label: t('permissionLabel', { action: actionText, resource: resourceText }),
            description: t('permissionDescription', { action: actionText.toLowerCase(), resource: resourceText })
        };
    }

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
        if (count) count.textContent = window.TopGymI18n?.format?.('number', state.users.length) ?? String(state.users.length);
        if (total) total.textContent = window.TopGymI18n?.format?.('number', state.users.length) ?? String(state.users.length);
        if (active) active.textContent = window.TopGymI18n?.format?.('number', state.users.filter((user) => user.status === 'Active').length) ?? String(state.users.filter((user) => user.status === 'Active').length);
        if (disabled) disabled.textContent = window.TopGymI18n?.format?.('number', state.users.filter((user) => user.status === 'Disabled').length) ?? String(state.users.filter((user) => user.status === 'Disabled').length);
        if (!state.users.length) {
            host.innerHTML = `<div class="permissions-empty-state">${escapeHtml(t('noAccounts'))}</div>`;
            state.selectedId = null;
            renderGrid();
            return;
        }
        host.innerHTML = state.users.map((user) => {
            const statusKey = user.status === 'Disabled' ? 'status.disabled' : 'status.active';
            return `<button class="permissions-user-button${Number(user.id) === Number(state.selectedId) ? ' active' : ''}" type="button" data-permission-user="${escapeHtml(user.id)}"><span class="permissions-user-avatar">${escapeHtml(initials(user.name))}</span><span class="permissions-user-copy"><strong>${escapeHtml(user.name)}</strong><small>${escapeHtml(user.email)}</small></span><span class="permissions-user-status${user.status === 'Disabled' ? ' disabled' : ''}" title="${escapeHtml(t(statusKey))}" aria-label="${escapeHtml(t(statusKey))}"></span></button>`;
        }).join('');
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
        if (title) title.textContent = selected ? selected.name : t('selectAccount');
        if (badge) {
            badge.hidden = !selected;
            badge.textContent = selected ? t('readOnly') : '';
        }
        if (meta) {
            const audit = state.lastModified;
            const auditDate = audit?.at ? window.TopGymI18n?.format?.('date', audit.at, { dateStyle: 'medium', timeStyle: 'short' }) || '' : '';
            const lastModified = audit ? t('auditLastChange', { name: audit.by?.name || 'Owner', date: auditDate }).replace(/\s*·\s*$/u, '') : t('auditNoChanges');
            meta.textContent = selected
                ? `${selected.email} · ${t(selected.status === 'Active' ? 'accountActive' : 'accountDisabled')} · ${lastModified} · ${t('reasonRequired')}`
                : t('auditNotice');
        }
        setEditorEnabled(Boolean(selected));
        if (!grid) return;
        if (!selected) {
            grid.innerHTML = `<div class="permissions-empty-state">${escapeHtml(state.users.length ? t('noAssistantSelected') : t('noAccountsAvailable'))}</div>`;
            return;
        }
        if (!state.catalog.length) {
            grid.innerHTML = `<div class="permissions-empty-state">${escapeHtml(t('noPermissions'))}</div>`;
            return;
        }
        const openGroups = new Set([...grid.querySelectorAll('details[open][data-permission-group]')].map((element) => element.dataset.permissionGroup));
        grid.innerHTML = groupItems().map(([group, items], index) => {
            const readonly = groupIsReadOnly(items);
            const options = items.map((item) => {
                const copy = localizedPermission(item);
                return `<label class="permission-option"><input type="checkbox" data-permission-code="${escapeHtml(item.code)}"${state.grants.has(item.code) ? ' checked' : ''}><span class="permission-option-copy"><strong>${escapeHtml(copy.label)}</strong><small>${escapeHtml(copy.description)}</small></span></label>`;
            }).join('');
            const hasRead = items.some((item) => item.code.endsWith('.read'));
            const granted = items.filter((item) => state.grants.has(item.code)).length;
            const control = hasRead
                ? `<label class="permission-readonly-toggle"><input type="checkbox" data-readonly-group="${escapeHtml(group)}"${readonly ? ' checked' : ''}><span>${escapeHtml(t('readOnlyMode'))}</span></label>`
                : `<span class="permission-group-readonly">${escapeHtml(t('readOnlyGroup'))}</span>`;
            const summaryControl = hasRead
                ? `<span class="permission-readonly-summary">${escapeHtml(t(readonly ? 'readOnlyMode' : 'customizable'))}</span>`
                : `<span class="permission-group-readonly">${escapeHtml(t('readOnlyGroup'))}</span>`;
            const groupKey = GROUP_KEYS[group];
            const groupLabel = groupKey ? t(`group.${groupKey}`) : group;
            const grantedCount = window.TopGymI18n?.format?.('number', granted) ?? String(granted);
            const totalCount = window.TopGymI18n?.format?.('number', items.length) ?? String(items.length);
            const open = openGroups.has(group) || (!openGroups.size && index === 0);
            return `<details class="permission-group-card" data-permission-group="${escapeHtml(group)}"${open ? ' open' : ''}><summary class="permission-group-head"><span class="permission-group-title"><strong>${escapeHtml(groupLabel)}</strong><small>${escapeHtml(t('permissionCount', { granted: grantedCount, total: totalCount }))}</small></span><span class="permission-group-summary"><span>${summaryControl}</span><span class="permission-group-chevron" aria-hidden="true"><svg class="permission-group-chevron-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m7 9 5 5 5-5"/></svg></span></span></summary><div class="permission-group-body">${hasRead ? `<div class="permission-group-controls">${control}</div>` : ''}${options}</div></details>`;
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
            showStatus(t('error.load'), 'error');
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
        if (summary) summary.textContent = t('permissionCount', {
            granted: window.TopGymI18n?.format?.('number', inputs.filter((input) => input.checked).length) ?? String(inputs.filter((input) => input.checked).length),
            total: window.TopGymI18n?.format?.('number', inputs.length) ?? String(inputs.length)
        });
        const readonly = card.querySelector('[data-readonly-group]')?.checked;
        const readonlySummary = card.querySelector('.permission-readonly-summary');
        if (readonlySummary) readonlySummary.textContent = t(readonly ? 'readOnlyMode' : 'customizable');
    }

    function captureEditorDraft() {
        return {
            permissions: Object.fromEntries([...document.querySelectorAll('[data-permission-code]')].map((input) => [input.dataset.permissionCode, input.checked])),
            readOnlyGroups: Object.fromEntries([...document.querySelectorAll('[data-readonly-group]')].map((input) => [input.dataset.readonlyGroup, input.checked])),
            reason: $('permissionsReason')?.value ?? ''
        };
    }

    function restoreEditorDraft(draft) {
        Object.entries(draft.permissions).forEach(([code, checked]) => {
            const input = [...document.querySelectorAll('[data-permission-code]')].find((element) => element.dataset.permissionCode === code);
            if (input) input.checked = checked;
        });
        Object.entries(draft.readOnlyGroups).forEach(([group, checked]) => {
            const input = [...document.querySelectorAll('[data-readonly-group]')].find((element) => element.dataset.readonlyGroup === group);
            if (input) input.checked = checked;
        });
        if ($('permissionsReason')) $('permissionsReason').value = draft.reason;
        document.querySelectorAll('[data-permission-group]').forEach(updateGroupSummary);
    }

    async function save(event) {
        event.preventDefault();
        if (!state.selectedId) return;
        const reason = $('permissionsReason').value.trim();
        if (!reason) {
            showStatus(t('error.reason'), 'error');
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
            showStatus(t('success.save'), 'success');
        } catch (error) {
            showStatus(t('error.save'), 'error');
        } finally {
            button.disabled = false;
        }
    }

    async function reset() {
        if (!state.selectedId) return;
        const reason = $('permissionsReason').value.trim() || t('resetReason');
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
            showStatus(t('success.reset'), 'success');
        } catch (error) {
            showStatus(t('error.reset'), 'error');
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

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            bindEvents();
            localizeStaticContent();
        }, { once: true });
    } else {
        bindEvents();
        localizeStaticContent();
    }

    window.addEventListener('topgym:localechange', () => {
        const draft = captureEditorDraft();
        localizeStaticContent();
        renderUsers();
        renderGrid();
        restoreEditorDraft(draft);
    });

    window.addEventListener('topgym:tab-changed', (event) => {
        if (event.detail?.name === 'permissions') void load();
    });
})();
