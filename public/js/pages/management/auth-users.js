(() => {
    if (window.__topGymAuthUsersLoaded) return;
    window.__topGymAuthUsersLoaded = true;

    const $ = (id) => document.getElementById(id);
    const escapeHtml = (value) => String(value ?? '').replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[character]));
    const t = (key, params) => window.TopGymI18n?.t?.(key, params) ?? key;
    const locale = () => window.TopGymI18n?.get?.() || 'ar';
    const roleLabel = (role) => role === 'Owner' ? t('permissionsScreen.authUsers.role.owner') : t('permissionsScreen.authUsers.role.assistant');
    const statusLabel = (status) => t(status === 'Disabled' ? 'permissionsScreen.status.disabled' : 'permissionsScreen.status.active');
    const dateLabel = (value) => value
        ? window.TopGymI18n?.format?.('date', value, { dateStyle: 'medium' }) || new Intl.DateTimeFormat(locale() === 'en' ? 'en' : 'ar-EG', { dateStyle: 'medium' }).format(new Date(value))
        : t('permissionsScreen.authUsers.lastLogin.never');
    const state = { users: [], editingId: null };

    function notify(message, error = false) {
        if (window.showToast) return window.showToast(message, error, error ? 'error' : 'success');
        window.alert(message);
    }

    function applyDialogTranslations(user = null) {
        const editing = Boolean(user || state.editingId);
        $('authUserDialog').dir = locale() === 'en' ? 'ltr' : 'rtl';
        $('authUserDialogTitle').textContent = t(editing ? 'permissionsScreen.authUsers.dialog.editTitle' : 'permissionsScreen.authUsers.dialog.addTitle');
        $('authUserDialogDescription').textContent = t(editing ? 'permissionsScreen.authUsers.dialog.editDescription' : 'permissionsScreen.authUsers.dialog.addDescription');
        document.querySelector('label[for="authUserName"]').childNodes[0].textContent = `${t('permissionsScreen.authUsers.dialog.name')} `;
        document.querySelector('label[for="authUserEmail"]').childNodes[0].textContent = `${t('permissionsScreen.authUsers.dialog.email')} `;
        document.querySelector('label[for="authUserPassword"]').childNodes[0].textContent = `${t('permissionsScreen.authUsers.dialog.password')} `;
        $('authUserPasswordHint').textContent = t(editing ? 'permissionsScreen.authUsers.dialog.passwordHintEdit' : 'permissionsScreen.authUsers.dialog.passwordHintAdd');
        $('authUserDialogClose').textContent = t('permissionsScreen.authUsers.dialog.close');
        $('authUserDialogCancel').textContent = t('permissionsScreen.authUsers.dialog.cancel');
        $('authUserSave').textContent = t('permissionsScreen.authUsers.dialog.save');
    }

    function openDialog(user = null) {
        state.editingId = user ? Number(user.id) : null;
        applyDialogTranslations(user);
        $('authUserId').value = user ? String(user.id) : '';
        $('authUserName').value = user?.name || '';
        $('authUserEmail').value = user?.email || '';
        $('authUserPassword').value = '';
        $('authUserPassword').required = !user;
        $('authUserPasswordRequired').hidden = Boolean(user);
        const dialog = $('authUserDialog');
        if (typeof dialog.showModal === 'function') dialog.showModal();
        else dialog.setAttribute('open', '');
        window.setTimeout(() => $('authUserName')?.focus(), 30);
    }

    function closeDialog() {
        const dialog = $('authUserDialog');
        if (typeof dialog.close === 'function' && dialog.open) dialog.close();
        else dialog.removeAttribute('open');
        state.editingId = null;
    }

    function renderUsers() {
        const container = $('authUsersList');
        if (!container) return;
        if (!state.users.length) {
            container.innerHTML = `<div class="auth-users-empty">${escapeHtml(t('permissionsScreen.noAccounts'))}</div>`;
            return;
        }
        const rows = state.users.map((user) => {
            const assistant = user.role === 'Assistant';
            const action = assistant
                ? `<button class="btn btn-light btn-small" type="button" data-auth-user-action="edit" data-id="${user.id}">${escapeHtml(t('permissionsScreen.action.update'))}</button><button class="btn btn-light btn-small${user.status === 'Active' ? ' auth-danger' : ''}" type="button" data-auth-user-action="status" data-id="${user.id}" data-status="${user.status === 'Active' ? 'Disabled' : 'Active'}">${escapeHtml(t(user.status === 'Active' ? 'permissionsScreen.authUsers.action.disable' : 'permissionsScreen.authUsers.action.activate'))}</button><button class="btn btn-light btn-small auth-delete" type="button" data-auth-user-action="delete" data-id="${user.id}" aria-label="${escapeHtml(t('permissionsScreen.action.delete'))} ${escapeHtml(user.name)}">${escapeHtml(t('permissionsScreen.action.delete'))}</button>`
                : `<span class="table-sub">${escapeHtml(t('permissionsScreen.authUsers.primaryAccount'))}</span>`;
            return `<tr><td data-label="${escapeHtml(t('permissionsScreen.accounts'))}"><div class="auth-user-primary"><strong>${escapeHtml(user.name)}</strong><small dir="ltr">${escapeHtml(user.email)}</small></div></td><td data-label="${escapeHtml(t('permissionsScreen.authUsers.table.role'))}"><span class="auth-role-badge ${assistant ? 'assistant' : 'owner'}">${roleLabel(user.role)}</span></td><td data-label="${escapeHtml(t('members.table.status'))}"><span class="auth-status-badge ${user.status === 'Disabled' ? 'disabled' : 'active'}">${statusLabel(user.status)}</span></td><td data-label="${escapeHtml(t('permissionsScreen.authUsers.table.lastLogin'))}"><span dir="auto">${escapeHtml(dateLabel(user.lastLoginAt))}</span></td><td data-label="${escapeHtml(t('members.table.actions'))}"><div class="auth-user-actions">${action}</div></td></tr>`;
        }).join('');
        container.innerHTML = `<div class="auth-users-table-wrap"><table class="auth-users-table"><thead><tr><th>${escapeHtml(t('permissionsScreen.accounts'))}</th><th>${escapeHtml(t('permissionsScreen.authUsers.table.role'))}</th><th>${escapeHtml(t('members.table.status'))}</th><th>${escapeHtml(t('permissionsScreen.authUsers.table.lastLogin'))}</th><th>${escapeHtml(t('members.table.actions'))}</th></tr></thead><tbody>${rows}</tbody></table></div>`;
    }

    async function loadUsers() {
        const container = $('authUsersList');
        if (!container || !window.topGymAuth?.isOwner?.()) return;
        container.innerHTML = `<div class="auth-users-loading">${escapeHtml(t('permissionsScreen.loadingAccounts'))}</div>`;
        try {
            const data = await window.topGymAuth.api('/api/auth/users');
            state.users = data.users || [];
            renderUsers();
        } catch (error) {
            container.innerHTML = `<div class="auth-users-error">${escapeHtml(error.message || t('permissionsScreen.authUsers.error.load'))}</div>`;
        }
    }

    async function submitUser(event) {
        event.preventDefault();
        const button = $('authUserSave');
        const id = state.editingId;
        const body = {
            name: $('authUserName').value.trim(),
            email: $('authUserEmail').value.trim(),
            password: $('authUserPassword').value
        };
        if (!body.name || !body.email || (!id && !body.password)) {
            window.topGymShowDialogValidation?.(t('permissionsScreen.authUsers.error.requiredFields'), 'error');
            return;
        }
        button.disabled = true;
        try {
            await window.topGymAuth.api(id ? `/api/auth/users/${id}` : '/api/auth/users', { method: id ? 'PUT' : 'POST', body: JSON.stringify(body) });
            closeDialog();
            await loadUsers();
            notify(t(id ? 'permissionsScreen.authUsers.message.saved' : 'permissionsScreen.authUsers.message.created'));
        } catch (error) {
            window.topGymShowDialogValidation?.(error.message || t('permissionsScreen.authUsers.error.save'), 'error') || notify(error.message || t('permissionsScreen.authUsers.error.save'), true);
        } finally {
            button.disabled = false;
        }
    }

    async function toggleStatus(user, nextStatus) {
        const nextKey = nextStatus === 'Disabled' ? 'disable' : 'activate';
        if (!window.confirm(t(`permissionsScreen.authUsers.confirm.${nextKey}`, { name: user.name }))) return;
        try {
            await window.topGymAuth.api(`/api/auth/users/${user.id}/status`, { method: 'PATCH', body: JSON.stringify({ status: nextStatus }) });
            await loadUsers();
            notify(t(`permissionsScreen.authUsers.message.${nextKey}`, { name: user.name }));
        } catch (error) {
            notify(error.message || t('permissionsScreen.authUsers.error.status'), true);
        }
    }

    async function deleteUser(user) {
        let confirmed = false;
        if (window.Swal) {
            const result = await window.Swal.fire({
                position: 'center',
                backdrop: window.topGymThemeValue('--overlay'),
                icon: 'warning',
                title: t('permissionsScreen.authUsers.confirm.deleteTitle'),
                text: t('permissionsScreen.authUsers.confirm.deleteBody', { name: user.name }),
                showCancelButton: true,
                confirmButtonText: t('permissionsScreen.authUsers.confirm.delete'),
                cancelButtonText: t('permissionsScreen.authUsers.dialog.cancel'),
                buttonsStyling: false,
                customClass: { popup: 'delete-confirm-alert', confirmButton: 'btn btn-danger', cancelButton: 'btn btn-light' }
            });
            confirmed = Boolean(result.isConfirmed);
        } else {
            confirmed = window.confirm(t('permissionsScreen.authUsers.confirm.deleteFallback', { name: user.name }));
        }
        if (!confirmed) return;
        try {
            await window.topGymAuth.api(`/api/auth/users/${user.id}`, { method: 'DELETE' });
            await loadUsers();
            notify(t('permissionsScreen.authUsers.message.deleted', { name: user.name }));
        } catch (error) {
            notify(error.message || t('permissionsScreen.authUsers.error.delete'), true);
        }
    }

    function bind() {
        if ($('authUsersPanel')?.dataset.bound) return;
        const panel = $('authUsersPanel');
        if (!panel) return;
        panel.dataset.bound = 'true';
        $('authAddAssistantButton')?.addEventListener('click', () => openDialog());
        $('authUserDialogClose')?.addEventListener('click', closeDialog);
        $('authUserDialogCancel')?.addEventListener('click', closeDialog);
        $('authUserForm')?.addEventListener('submit', submitUser);
        $('authUsersList')?.addEventListener('click', (event) => {
            const button = event.target.closest('[data-auth-user-action]');
            if (!button) return;
            const user = state.users.find((item) => Number(item.id) === Number(button.dataset.id));
            if (!user) return;
            if (button.dataset.authUserAction === 'edit') openDialog(user);
            if (button.dataset.authUserAction === 'status') void toggleStatus(user, button.dataset.status);
            if (button.dataset.authUserAction === 'delete') void deleteUser(user);
        });
        window.addEventListener('topgym:tab-changed', (event) => {
            if (event.detail?.name === 'permissions') void loadUsers();
        });
        window.addEventListener('topgym:localechange', () => {
            if (state.users.length) renderUsers();
            else if ($('authUsersList')?.querySelector('.auth-users-empty')) renderUsers();
            const dialog = $('authUserDialog');
            if (dialog?.open) applyDialogTranslations(state.users.find((user) => Number(user.id) === state.editingId) || null);
        });
    }

    bind();
})();
