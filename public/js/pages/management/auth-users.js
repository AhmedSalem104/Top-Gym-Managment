(() => {
    if (window.__topGymAuthUsersLoaded) return;
    window.__topGymAuthUsersLoaded = true;

    const $ = (id) => document.getElementById(id);
    const escapeHtml = (value) => String(value ?? '').replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[character]));
    const roleLabel = (role) => role === 'Owner' ? 'مالك النظام' : 'مساعد';
    const statusLabel = (status) => status === 'Disabled' ? 'معطل' : 'نشط';
    const dateLabel = (value) => value ? new Intl.DateTimeFormat('ar-EG', { dateStyle: 'medium' }).format(new Date(value)) : 'لم يسجل دخولًا';
    const state = { users: [], editingId: null };

    function notify(message, error = false) {
        if (window.showToast) return window.showToast(message, error, error ? 'error' : 'success');
        window.alert(message);
    }

    function openDialog(user = null) {
        state.editingId = user ? Number(user.id) : null;
        $('authUserDialogTitle').textContent = user ? 'تعديل حساب مساعد' : 'إضافة مساعد';
        $('authUserDialogDescription').textContent = user ? 'عدّل الاسم أو البريد، ويمكنك إدخال كلمة مرور جديدة لإعادة التعيين.' : 'أنشئ حسابًا مساعدًا بصلاحيات تشغيلية محدودة.';
        $('authUserId').value = user ? String(user.id) : '';
        $('authUserName').value = user?.name || '';
        $('authUserEmail').value = user?.email || '';
        $('authUserPassword').value = '';
        $('authUserPassword').required = !user;
        $('authUserPasswordRequired').hidden = Boolean(user);
        $('authUserPasswordHint').textContent = user ? 'اترك الحقل فارغًا للحفاظ على كلمة المرور الحالية، أو أدخل كلمة مرور جديدة لإعادة التعيين.' : 'يجب أن تكون 8 أحرف على الأقل. لا يتم عرضها أو إرسالها مرة أخرى بعد الحفظ.';
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
            container.innerHTML = '<div class="auth-users-empty">لا توجد حسابات إدارة حتى الآن.</div>';
            return;
        }
        const rows = state.users.map((user) => {
            const assistant = user.role === 'Assistant';
            const action = assistant
                ? `<button class="btn btn-light btn-small" type="button" data-auth-user-action="edit" data-id="${user.id}">تعديل</button><button class="btn btn-light btn-small${user.status === 'Active' ? ' auth-danger' : ''}" type="button" data-auth-user-action="status" data-id="${user.id}" data-status="${user.status === 'Active' ? 'Disabled' : 'Active'}">${user.status === 'Active' ? 'تعطيل' : 'تفعيل'}</button><button class="btn btn-light btn-small auth-delete" type="button" data-auth-user-action="delete" data-id="${user.id}" aria-label="حذف ${escapeHtml(user.name)}">حذف</button>`
                : '<span class="table-sub">الحساب الرئيسي</span>';
            return `<tr><td><div class="auth-user-primary"><strong>${escapeHtml(user.name)}</strong><small dir="ltr">${escapeHtml(user.email)}</small></div></td><td><span class="auth-role-badge ${assistant ? 'assistant' : 'owner'}">${roleLabel(user.role)}</span></td><td><span class="auth-status-badge ${user.status === 'Disabled' ? 'disabled' : 'active'}">${statusLabel(user.status)}</span></td><td dir="ltr">${escapeHtml(dateLabel(user.lastLoginAt))}</td><td><div class="auth-user-actions">${action}</div></td></tr>`;
        }).join('');
        container.innerHTML = `<div class="auth-users-table-wrap"><table class="auth-users-table"><thead><tr><th>الحساب</th><th>الدور</th><th>الحالة</th><th>آخر دخول</th><th>الإجراءات</th></tr></thead><tbody>${rows}</tbody></table></div>`;
    }

    async function loadUsers() {
        const container = $('authUsersList');
        if (!container || !window.topGymAuth?.isOwner?.()) return;
        container.innerHTML = '<div class="auth-users-loading">جاري تحميل حسابات الإدارة…</div>';
        try {
            const data = await window.topGymAuth.api('/api/auth/users');
            state.users = data.users || [];
            renderUsers();
        } catch (error) {
            container.innerHTML = `<div class="auth-users-error">${escapeHtml(error.message || 'تعذر تحميل الحسابات.')}</div>`;
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
            window.topGymShowDialogValidation?.('أكمل الاسم والبريد وكلمة المرور المطلوبة.', 'error');
            return;
        }
        button.disabled = true;
        try {
            await window.topGymAuth.api(id ? `/api/auth/users/${id}` : '/api/auth/users', { method: id ? 'PUT' : 'POST', body: JSON.stringify(body) });
            closeDialog();
            await loadUsers();
            notify(id ? 'تم حفظ بيانات الحساب.' : 'تم إنشاء حساب المساعد بنجاح.');
        } catch (error) {
            window.topGymShowDialogValidation?.(error.message || 'تعذر حفظ الحساب.', 'error') || notify(error.message || 'تعذر حفظ الحساب.', true);
        } finally {
            button.disabled = false;
        }
    }

    async function toggleStatus(user, nextStatus) {
        const label = nextStatus === 'Disabled' ? 'تعطيل' : 'إعادة تفعيل';
        if (!window.confirm(`هل تريد ${label} حساب ${user.name}؟`)) return;
        try {
            await window.topGymAuth.api(`/api/auth/users/${user.id}/status`, { method: 'PATCH', body: JSON.stringify({ status: nextStatus }) });
            await loadUsers();
            notify(`تم ${label} الحساب.`);
        } catch (error) {
            notify(error.message || 'تعذر تحديث حالة الحساب.', true);
        }
    }

    async function deleteUser(user) {
        let confirmed = false;
        if (window.Swal) {
            const result = await window.Swal.fire({
                position: 'center',
                backdrop: window.topGymThemeValue('--overlay'),
                icon: 'warning',
                title: 'تأكيد حذف حساب المساعد',
                text: `سيتم حذف حساب ${user.name} نهائيًا وإلغاء جلساته وصلاحياته. لا يمكن التراجع عن هذه العملية.`,
                showCancelButton: true,
                confirmButtonText: 'نعم، احذف الحساب',
                cancelButtonText: 'إلغاء',
                buttonsStyling: false,
                customClass: { popup: 'delete-confirm-alert', confirmButton: 'btn btn-danger', cancelButton: 'btn btn-light' }
            });
            confirmed = Boolean(result.isConfirmed);
        } else {
            confirmed = window.confirm(`سيتم حذف حساب ${user.name} نهائيًا وإلغاء جلساته وصلاحياته. لا يمكن التراجع عن هذه العملية. هل تريد المتابعة؟`);
        }
        if (!confirmed) return;
        try {
            await window.topGymAuth.api(`/api/auth/users/${user.id}`, { method: 'DELETE' });
            await loadUsers();
            notify('تم حذف حساب المساعد نهائيًا.');
        } catch (error) {
            notify(error.message || 'تعذر حذف حساب المساعد.', true);
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
    }

    bind();
    if (document.querySelector('[data-page-tab="permissions"]')?.classList.contains('active')) void loadUsers();
})();
