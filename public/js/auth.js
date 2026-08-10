(() => {
    if (window.__topGymAuthLoaded) return;
    window.__topGymAuthLoaded = true;

    const state = { user: null, setupRequired: false, users: [], audit: [] };
    const PERMISSION_BY_ID = {
        topAddMemberButton: 'members.write', addMemberButton: 'members.write',
        topPricingButton: 'settings.write', pricingButton: 'settings.write', membershipTypesButton: 'settings.write',
        backupButton: 'backup.download', refreshButton: 'dashboard.read'
    };
    const ROLE_LABELS = { manager: 'مدير', reception: 'استقبال' };
    const AUDIT_LABELS = {
        member_created: 'إضافة مشترك', member_updated: 'تعديل مشترك', member_deleted: 'حذف مشترك',
        member_frozen: 'تجميد عضوية', member_resumed: 'استئناف عضوية', membership_renewed: 'تجديد اشتراك',
        payment_updated: 'تحديث دفعة', expense_created: 'إضافة مصروف', expense_updated: 'تعديل مصروف',
        expense_deleted: 'حذف مصروف', user_created: 'إضافة مستخدم', user_updated: 'تعديل مستخدم',
        user_deactivated: 'تعطيل مستخدم', settings_created: 'إضافة إعداد', settings_updated: 'تعديل إعداد'
    };

    function $(id) { return document.getElementById(id); }
    function escapeHtml(value) { return String(value ?? '').replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[character])); }
    function initials(name) { return String(name || 'TG').trim().split(/\s+/).slice(0, 2).map((item) => item[0] || '').join('').toUpperCase() || 'TG'; }
    function can(permission) { return Boolean(state.user?.permissions?.includes(permission)); }

    async function request(path, options = {}) {
        const response = await fetch(path, {
            ...options,
            credentials: 'same-origin',
            headers: { 'Content-Type': 'application/json', ...(options.headers || {}) }
        });
        if (response.status === 204) return null;
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error || 'تعذر تنفيذ الطلب.');
        return data;
    }

    function applyPermissions() {
        document.querySelectorAll('[data-permission]').forEach((element) => {
            element.hidden = !can(element.dataset.permission);
        });
        Object.entries(PERMISSION_BY_ID).forEach(([id, permission]) => {
            const element = $(id);
            if (element && !element.dataset.permission) element.hidden = !can(permission);
        });
        document.body.classList.toggle('topgym-authenticated', Boolean(state.user));
        const userBar = $('authUserBar');
        if (userBar) userBar.hidden = !state.user;
        if ($('authUserName')) $('authUserName').textContent = state.user?.fullName || '—';
        if ($('authUserRole')) $('authUserRole').textContent = state.user ? (ROLE_LABELS[state.user.role] || state.user.role) : '—';
        if ($('authUserAvatar')) $('authUserAvatar').textContent = initials(state.user?.fullName);
    }

    function notify(message, type = 'error') {
        if (window.Swal) return window.Swal.fire({ position: 'center', icon: type, title: message, confirmButtonText: 'حسنًا', buttonsStyling: false, customClass: { popup: 'auth-alert', confirmButton: 'btn btn-primary' } });
        window.alert(message);
    }

    function ensureOverlay() {
        let overlay = $('authOverlay');
        if (!overlay) {
            overlay = document.createElement('div');
            overlay.id = 'authOverlay';
            document.body.appendChild(overlay);
        }
        return overlay;
    }

    function renderAuthView(mode, error = '') {
        const overlay = ensureOverlay();
        const setup = mode === 'setup';
        overlay.hidden = false;
        overlay.innerHTML = `<section class="auth-card" role="dialog" aria-modal="true" aria-labelledby="authTitle">
            <div class="auth-card-brand"><span class="auth-card-mark">TG</span><div><span>TOP GYM</span><small>إدارة العضويات بوضوح</small></div></div>
            <div class="auth-card-heading"><span class="auth-card-eyebrow">${setup ? 'الإعداد الأول' : 'دخول آمن'}</span><h1 id="authTitle">${setup ? 'أنشئ حساب مدير النظام' : 'مرحبًا بعودتك'}</h1><p>${setup ? 'أنشئ أول حساب مدير لتفعيل النظام. يمكنك إضافة موظفي الاستقبال بعد الدخول.' : 'سجّل الدخول للوصول إلى بيانات المشتركين وإدارة الجيم.'}</p></div>
            ${error ? `<div class="auth-error" role="alert">${escapeHtml(error)}</div>` : ''}
            <form id="authForm" class="auth-form">
                ${setup ? '<div class="field"><label for="authFullName">اسم المدير</label><input id="authFullName" maxlength="120" placeholder="مثال: أحمد عبد الحميد" required></div>' : ''}
                <div class="field"><label for="authUsername">اسم المستخدم</label><input id="authUsername" maxlength="50" pattern="[A-Za-z][A-Za-z0-9._-]{2,49}" autocomplete="username" placeholder="admin" required></div>
                <div class="field"><label for="authPassword">كلمة المرور</label><input id="authPassword" type="password" minlength="8" maxlength="128" autocomplete="${setup ? 'new-password' : 'current-password'}" placeholder="8 أحرف على الأقل" required></div>
                <button class="btn btn-primary auth-submit" type="submit">${setup ? 'تفعيل النظام' : 'تسجيل الدخول'}</button>
            </form>
            <small class="auth-card-note">تُحفظ الجلسة على جهازك بشكل آمن لمدة محددة، ويمكن إنهاؤها من زر تسجيل الخروج.</small>
        </section>`;
        $('authUsername')?.focus();
        $('authForm')?.addEventListener('submit', async (event) => {
            event.preventDefault();
            const button = event.currentTarget.querySelector('button[type="submit"]');
            button.disabled = true;
            try {
                const payload = { username: $('authUsername').value, password: $('authPassword').value };
                if (setup) payload.fullName = $('authFullName').value;
                const result = await request(setup ? '/api/auth/setup' : '/api/auth/login', { method: 'POST', body: JSON.stringify(payload) });
                state.user = result.user;
                state.setupRequired = false;
                overlay.hidden = true;
                applyPermissions();
                window.dispatchEvent(new CustomEvent('topgym:auth-ready', { detail: { user: state.user } }));
            } catch (requestError) {
                renderAuthView(mode, requestError.message);
            } finally {
                button.disabled = false;
            }
        });
    }

    function showLogin() {
        state.user = null;
        applyPermissions();
        renderAuthView(state.setupRequired ? 'setup' : 'login');
    }

    function renderUsers() {
        const list = $('usersList');
        if (!list) return;
        $('usersCount').textContent = `${state.users.length} حساب`;
        list.innerHTML = state.users.length ? state.users.map((user) => `<article class="user-list-item ${user.active ? '' : 'inactive'}">
            <span class="user-list-avatar">${escapeHtml(initials(user.fullName))}</span>
            <div class="user-list-copy"><strong>${escapeHtml(user.fullName)}</strong><span>${escapeHtml(user.username)} · ${escapeHtml(ROLE_LABELS[user.role] || user.role)}</span></div>
            <span class="user-list-status">${user.active ? 'نشط' : 'معطل'}</span>
            <div class="user-list-actions"><button class="btn btn-light btn-small" type="button" data-user-action="edit" data-user-id="${user.id}">تعديل</button>${user.active ? `<button class="btn btn-danger btn-small" type="button" data-user-action="deactivate" data-user-id="${user.id}">تعطيل</button>` : ''}</div>
        </article>`).join('') : '<div class="empty">لا توجد حسابات.</div>';
    }

    function formatDateTime(value) {
        if (!value) return '—';
        return new Intl.DateTimeFormat('ar-EG', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
    }

    function renderAudit() {
        const list = $('auditList');
        if (!list) return;
        list.innerHTML = state.audit.length ? state.audit.map((item) => `<div class="audit-item"><div><strong>${escapeHtml(AUDIT_LABELS[item.action] || item.action)}</strong><span>${escapeHtml(item.actorName || 'النظام')} · ${escapeHtml(ROLE_LABELS[item.actorRole] || item.actorRole || '')}</span></div><span>${formatDateTime(item.createdAt)}</span></div>`).join('') : '<div class="empty">لا توجد عمليات مسجلة بعد.</div>';
    }

    function resetUserForm() {
        $('editingUserId').value = '';
        $('userFormTitle').textContent = 'إضافة مستخدم';
        $('userFullName').value = '';
        $('userUsername').value = '';
        $('userUsername').readOnly = false;
        $('userPassword').value = '';
        $('userPassword').required = true;
        $('userPasswordHint').textContent = '*';
        $('userRole').value = 'reception';
        $('userActive').checked = true;
        $('userSaveButton').textContent = 'حفظ المستخدم';
    }

    function editUser(user) {
        $('editingUserId').value = user.id;
        $('userFormTitle').textContent = 'تعديل المستخدم';
        $('userFullName').value = user.fullName || '';
        $('userUsername').value = user.username || '';
        $('userUsername').readOnly = true;
        $('userPassword').value = '';
        $('userPassword').required = false;
        $('userPasswordHint').textContent = '(اختياري)';
        $('userRole').value = user.role || 'reception';
        $('userActive').checked = Boolean(user.active);
        $('userSaveButton').textContent = 'حفظ التعديل';
    }

    async function loadUsersAndAudit() {
        const [users, audit] = await Promise.all([request('/api/auth/users'), request('/api/audit-log?limit=80')]);
        state.users = users.users || [];
        state.audit = audit.audit || [];
        renderUsers();
        renderAudit();
    }

    async function openUsersDialog() {
        if (!can('users.manage')) return;
        const dialog = $('usersDialog');
        if (typeof dialog.showModal === 'function') dialog.showModal(); else dialog.setAttribute('open', '');
        try { await loadUsersAndAudit(); } catch (error) { await notify(error.message); }
    }

    async function deactivateUser(id) {
        const user = state.users.find((item) => String(item.id) === String(id));
        if (!user) return;
        const confirmed = window.Swal
            ? (await window.Swal.fire({ position: 'center', icon: 'warning', title: 'تعطيل الحساب؟', text: `سيتم منع ${user.fullName} من تسجيل الدخول.`, showCancelButton: true, confirmButtonText: 'نعم، عطّل الحساب', cancelButtonText: 'إلغاء', buttonsStyling: false, customClass: { popup: 'delete-confirm-alert', confirmButton: 'btn btn-danger', cancelButton: 'btn btn-light' } })).isConfirmed
            : window.confirm(`تعطيل حساب ${user.fullName}؟`);
        if (!confirmed) return;
        try { await request(`/api/auth/users/${id}`, { method: 'DELETE' }); await loadUsersAndAudit(); await window.topGymAuth.notifySuccess('تم تعطيل المستخدم.'); } catch (error) { await notify(error.message); }
    }

    function closeUsersDialog() {
        const dialog = $('usersDialog');
        if (typeof dialog.close === 'function' && dialog.open) dialog.close(); else dialog.removeAttribute('open');
    }

    async function submitUser(event) {
        event.preventDefault();
        const id = $('editingUserId').value;
        const body = {
            fullName: $('userFullName').value,
            username: $('userUsername').value,
            password: $('userPassword').value,
            role: $('userRole').value,
            isActive: $('userActive').checked
        };
        if (!body.password) delete body.password;
        const button = $('userSaveButton');
        button.disabled = true;
        try {
            await request(id ? `/api/auth/users/${id}` : '/api/auth/users', { method: id ? 'PUT' : 'POST', body: JSON.stringify(body) });
            resetUserForm();
            await loadUsersAndAudit();
            await window.topGymAuth.notifySuccess(id ? 'تم تعديل المستخدم.' : 'تمت إضافة المستخدم.');
        } catch (error) { await notify(error.message); } finally { button.disabled = false; }
    }

    function setupUserManagement() {
        $('usersButton')?.addEventListener('click', openUsersDialog);
        $('usersDialogClose')?.addEventListener('click', closeUsersDialog);
        $('userResetButton')?.addEventListener('click', resetUserForm);
        $('userForm')?.addEventListener('submit', submitUser);
        $('refreshAuditButton')?.addEventListener('click', async () => { try { await loadUsersAndAudit(); } catch (error) { await notify(error.message); } });
        $('usersList')?.addEventListener('click', (event) => {
            const button = event.target.closest('[data-user-action]');
            if (!button) return;
            const user = state.users.find((item) => String(item.id) === String(button.dataset.userId));
            if (button.dataset.userAction === 'edit' && user) editUser(user);
            if (button.dataset.userAction === 'deactivate') deactivateUser(button.dataset.userId);
        });
    }

    async function initialize() {
        try {
            const status = await request('/api/auth/status');
            state.setupRequired = Boolean(status.setupRequired);
            state.user = status.user || null;
            applyPermissions();
            if (state.user) window.dispatchEvent(new CustomEvent('topgym:auth-ready', { detail: { user: state.user } }));
            else renderAuthView(state.setupRequired ? 'setup' : 'login');
        } catch (error) {
            renderAuthView('login', error.message || 'تعذر الاتصال بخدمة الدخول.');
        }
    }

    window.topGymAuth = {
        can,
        get user() { return state.user; },
        applyPermissions,
        handleUnauthorized: showLogin,
        notifySuccess: (message) => notify(message, 'success'),
        request
    };

    $('authLogoutButton')?.addEventListener('click', async () => {
        try { await request('/api/auth/logout', { method: 'POST' }); } finally { showLogin(); }
    });
    setupUserManagement();
    document.addEventListener('DOMContentLoaded', initialize);
    const observer = new MutationObserver(() => applyPermissions());
    document.addEventListener('DOMContentLoaded', () => observer.observe(document.body, { childList: true, subtree: true }));
})();
