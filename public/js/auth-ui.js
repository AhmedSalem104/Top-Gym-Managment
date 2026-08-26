(() => {
    if (window.__topGymAuthUiLoaded) return;
    window.__topGymAuthUiLoaded = true;

    const nativeFetch = window.fetch.bind(window);
    const permissions = window.topGymPermissions;
    const rememberEmailKey = 'topgym.login.email';
    const state = { user: null, ready: false, redirecting: false };
    const brandName = () => window.topGymBranding?.get?.().identity?.brandName || 'الجيم';

    document.body.classList.add('auth-pending');

    const $ = (id) => document.getElementById(id);
    const escapeHtml = (value) => String(value ?? '').replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[character]));

    function showMessage(message, type = 'error') {
        const element = $('loginMessage');
        if (!element) return;
        element.textContent = String(message || 'تعذر تنفيذ العملية.');
        element.className = `auth-message${type === 'info' ? ' info' : ''}`;
        element.hidden = false;
    }

    function clearMessage() {
        const element = $('loginMessage');
        if (!element) return;
        element.hidden = true;
        element.textContent = '';
    }

    function permissionValueAllowed(user, value) {
        const required = String(value || '').split(',').map((item) => item.trim()).filter(Boolean);
        return !required.length || required.every((code) => permissions.hasPermission(user, code));
    }

    function annotatePermissionControls() {
        const idPermissions = {
            topAddMemberButton: 'members.create,memberships.create,payments.create',
            addMemberButton: 'members.create,memberships.create,payments.create',
            topPricingButton: 'pricing.read',
            pricingButton: 'pricing.read',
            membershipTypesButton: 'pricing.read',
            libraryAddButton: 'library.create',
            attendanceCheckInButton: 'attendance.check_in',
            attendanceCheckOutButton: 'attendance.check_out',
            dayPassSaveButton: 'day_passes.create,payments.create',
            dashboardDayPassAdd: 'day_passes.create,payments.create',
            dashboardDayPassManage: 'day_passes.read',
            addExpenseButton: 'finance.create',
            expenseSave: 'finance.create',
            addMembershipPlanButton: 'pricing.create',
            addMembershipTypeButton: 'pricing.create',
            pricingSave: 'pricing.update',
            dayPassPricingSave: 'pricing.update',
            dashboardPrintPricingButton: 'pricing.read',
            reportsExportButton: 'reports.export',
            addExpenseFromTabButton: 'finance.create',
            brandingSaveDraftButton: 'branding.edit',
            brandingPublishButton: 'branding.publish',
            brandingResetButton: 'branding.reset'
        };
        Object.entries(idPermissions).forEach(([id, code]) => {
            const element = $(id);
            if (element && !element.dataset.requiredPermission) element.dataset.requiredPermission = code;
        });
        const setPermission = (element, code) => {
            if (element && code && !element.dataset.requiredPermission) element.dataset.requiredPermission = code;
        };
        document.querySelectorAll('[data-member-coaching-action]').forEach((element) => {
            const action = element.dataset.memberCoachingAction || '';
            const permission = action === 'profile' || action.startsWith('print-') || action.startsWith('pdf-')
                ? 'coaching.read'
                : action.startsWith('edit-') ? 'coaching.update'
                    : action.startsWith('delete-') ? 'coaching.delete'
                        : action === 'delete' ? 'coaching.delete' : 'coaching.create';
            setPermission(element, permission);
        });
        document.querySelectorAll('[data-coaching-action]').forEach((element) => {
            const action = element.dataset.coachingAction || '';
            const permission = action === 'profile' || action === 'toggle-more'
                ? 'coaching.read'
                : action === 'delete-diet' ? 'coaching.delete'
                    : action.startsWith('print-') || action.startsWith('pdf-') ? 'coaching.read'
                        : action.startsWith('edit-') ? 'coaching.update'
                            : action.startsWith('delete-') ? 'coaching.delete'
                    : ['workout', 'diet'].includes(action) ? 'coaching.create' : '';
            setPermission(element, permission);
        });
        document.querySelectorAll('[data-profile-action], [data-measurement-action], [data-checkin-action]').forEach((element) => {
            const action = element.dataset.profileAction || element.dataset.measurementAction || element.dataset.checkinAction || '';
            const permission = action === 'subscribe'
                ? 'memberships.create,payments.create'
                : action === 'edit-client'
                    ? 'coaching.update'
                    : action === 'profile' || action.startsWith('print-') || action.startsWith('pdf-')
                        ? 'coaching.read'
                    : ['delete', 'delete-diet', 'delete-measurement'].includes(action)
                        ? 'coaching.delete'
                        : ['edit', 'edit-workout', 'edit-diet', 'edit-measurement'].includes(action)
                            ? 'coaching.update' : 'coaching.create';
            setPermission(element, permission);
        });
        document.querySelectorAll('[data-builder-action]').forEach((element) => setPermission(element, 'coaching.update'));
        document.querySelectorAll('[data-expense-action="edit"]').forEach((element) => setPermission(element, 'finance.update'));
        document.querySelectorAll('[data-expense-action="delete"]').forEach((element) => setPermission(element, 'finance.delete'));
        document.querySelectorAll('[data-library-action="details"]').forEach((element) => setPermission(element, 'library.read'));
        document.querySelectorAll('[data-library-action="edit"]').forEach((element) => setPermission(element, 'library.update'));
        document.querySelectorAll('[data-library-action="delete"]').forEach((element) => setPermission(element, 'library.delete'));
        document.querySelectorAll('[data-day-pass-whatsapp]').forEach((element) => setPermission(element, 'day_passes.whatsapp'));
        document.querySelectorAll('[data-day-pass-edit]').forEach((element) => setPermission(element, 'day_passes.update'));
        document.querySelectorAll('[data-day-pass-delete], [data-day-pass-void]').forEach((element) => setPermission(element, 'day_passes.delete'));
        document.querySelectorAll('[data-alert-whatsapp], [data-report-whatsapp]').forEach((element) => setPermission(element, 'members.alerts'));
        document.querySelectorAll('[data-day-pass-report-whatsapp]').forEach((element) => setPermission(element, 'day_passes.whatsapp'));
        document.querySelectorAll('[data-report-member-action="details"]').forEach((element) => setPermission(element, 'members.read'));
        document.querySelectorAll('[data-report-member-action="payment"]').forEach((element) => setPermission(element, 'payments.create'));
        document.querySelectorAll('[data-report-diet-id]').forEach((element) => setPermission(element, 'coaching.delete'));
        document.querySelectorAll('[data-report-coaching-action]').forEach((element) => setPermission(element, 'coaching.read'));
        document.querySelectorAll('[data-report-backup-id]').forEach((element) => setPermission(element, 'management.backup.read'));
        document.querySelectorAll('[data-report-backup-delete-id]').forEach((element) => setPermission(element, 'management.backup.delete'));
    }

    function applyPermissionControls(user) {
        annotatePermissionControls();
        document.querySelectorAll('[data-owner-only]').forEach((element) => {
            const allowed = user?.role === 'Owner';
            const tabManagedPanel = element.hasAttribute('data-page-tab-panel');
            if (tabManagedPanel) {
                // The tab router owns visibility for page panels. Permission
                // checks may close access, but an allowed Owner panel must not
                // be unhidden here or it will appear on every tab.
                if (!allowed) {
                    element.hidden = true;
                    element.setAttribute('aria-hidden', 'true');
                    element.toggleAttribute('inert', true);
                }
                return;
            }
            element.hidden = !allowed;
            element.toggleAttribute('aria-hidden', !allowed);
            element.toggleAttribute('inert', !allowed);
            if ('disabled' in element) element.disabled = !allowed;
            if (!allowed && element.matches('dialog[open]')) element.close();
        });
        document.querySelectorAll('[data-required-permission]').forEach((element) => {
            const allowed = user?.role === 'Owner' || permissionValueAllowed(user, element.dataset.requiredPermission);
            element.hidden = !allowed;
            element.toggleAttribute('aria-hidden', !allowed);
            if (!allowed && 'disabled' in element) element.disabled = true;
        });
        document.querySelectorAll('[data-financial-data]').forEach((element) => {
            const allowed = user?.role === 'Owner' || permissions.hasPermission(user, 'finance.read');
            element.hidden = !allowed;
            element.toggleAttribute('aria-hidden', !allowed);
        });
        const financeAllowed = user?.role === 'Owner' || permissions.hasPermission(user, 'finance.read');
        [
            $('dashboardDayPassTotal')?.closest('.dashboard-day-pass-kpi'),
            $('dayPassPriceBox'),
            $('dayPassTableWrap'),
            $('dashboardDayPassTableWrap')
        ].filter(Boolean).forEach((element) => {
            element.hidden = !financeAllowed;
            element.toggleAttribute('aria-hidden', !financeAllowed);
        });
    }

    function loadAuthVisuals() {
        document.querySelectorAll('[data-auth-lazy-src]').forEach((image) => {
            if (!image.getAttribute('src')) image.setAttribute('src', image.dataset.authLazySrc);
        });
    }

    function setSubmitLoading(loading) {
        const button = $('loginSubmit');
        if (!button) return;
        button.disabled = Boolean(loading);
        button.setAttribute('aria-busy', String(Boolean(loading)));
    }

    function roleLabel(role) { return role === 'Owner' ? 'مالك النظام' : 'مساعد الإدارة'; }

    function initials(name) {
        const parts = String(name || 'TG').trim().split(/\s+/).filter(Boolean);
        return (parts.slice(0, 2).map((part) => [...part][0]).join('') || 'TG').toUpperCase();
    }

    function ensureLogoutButton() {
        const actions = document.querySelector('.auth-account-bar') || document.querySelector('.top-actions');
        if (!actions) return null;
        let button = $('authLogoutButton');
        if (!button) {
            button = document.createElement('button');
            button.id = 'authLogoutButton';
            button.type = 'button';
            button.className = 'btn btn-light btn-small auth-logout-button';
            button.textContent = 'تسجيل الخروج';
            button.hidden = true;
            button.setAttribute('aria-label', 'تسجيل الخروج');
            button.title = 'تسجيل الخروج';
            button.innerHTML = '<svg class="ui-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10 17l5-5-5-5"/><path d="M15 12H3"/><path d="M21 19V5a2 2 0 0 0-2-2h-5"/></svg>';
            actions.appendChild(button);
        }
        if (button.dataset.bound === 'true') return button;
        button.dataset.bound = 'true';
        button.addEventListener('click', async () => {
            button.disabled = true;
            try {
                await nativeFetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' } });
            } finally {
                window.location.reload();
            }
        });
        return button;
    }

    function applyNavigation(user) {
        const isOwner = user?.role === 'Owner';
        const tabs = permissions.tabsForUser(user);
        document.body.dataset.topGymRole = user?.role || '';
        document.body.dataset.topGymUserId = user?.id ? String(user.id) : '';
        document.body.dataset.topGymFinanceVisible = String(permissions.hasPermission(user, 'finance.read'));
        const accountBar = $('authAccountBar');
        const pageTabs = $('pageTabs');
        const topbarControls = document.querySelector('.topbar-controls');
        const accountHost = topbarControls || pageTabs;
        if (accountBar && accountHost && accountBar.parentElement !== accountHost) accountHost.appendChild(accountBar);
        document.querySelectorAll('[data-page-tab]').forEach((button) => {
            const allowed = button.hasAttribute('data-owner-only') ? isOwner : tabs.includes(button.dataset.pageTab);
            if (!allowed && button === document.activeElement) button.blur();
            button.hidden = !allowed;
            button.toggleAttribute('inert', !allowed);
            button.setAttribute('aria-hidden', String(!allowed));
        });
        const managementPanel = $('authUsersPanel');
        if (managementPanel) managementPanel.hidden = !isOwner;
        const profileName = document.querySelector('.header-profile-copy strong');
        const profileRole = document.querySelector('.header-profile-copy small');
        const profileAvatar = document.querySelector('.profile-avatar');
        if (profileName) profileName.textContent = user?.name || brandName();
        if (profileRole) profileRole.textContent = roleLabel(user?.role);
        if (profileAvatar) profileAvatar.textContent = initials(user?.name);
        const welcomeName = $('topbarWelcomeName');
        const welcomeContext = $('topbarWelcomeContext');
        if (welcomeName) welcomeName.textContent = user?.name || `مدير ${brandName()}`;
        if (welcomeContext) welcomeContext.textContent = user ? `${roleLabel(user.role)} · جاهز لمتابعة يومك التشغيلي` : 'إليك ملخص يومك التشغيلي في مكان واحد';
        const logout = ensureLogoutButton();
        if (logout) logout.hidden = !user;
        if (accountBar) accountBar.hidden = !user;
        const accountName = $('authAccountName');
        const accountEmail = $('authAccountEmail');
        const accountAvatar = $('authAccountAvatar');
        if (accountName) accountName.textContent = user?.name || brandName();
        if (accountEmail) accountEmail.textContent = user?.email || '—';
        if (accountAvatar) accountAvatar.textContent = initials(user?.name);
        if (!isOwner && !permissions.canAccessTab(user, window.location.hash.slice(1))) {
            window.location.hash = `#${permissions.firstAccessibleTab(user)}`;
        }
        applyPermissionControls(user);
    }

    function showAuthenticated(user) {
        state.user = user;
        state.ready = true;
        document.body.dataset.topGymAuthenticated = 'true';
        document.body.classList.add('top-gym-navigation-pending');
        applyNavigation(user);
        const screen = $('authScreen');
        if (screen) screen.hidden = true;
        document.body.classList.remove('auth-pending', 'auth-locked');
    }

    function showLogin(message = '', setupRequired = false) {
        if (!state.ready && message && message.includes('انتهت جلسة')) return;
        state.user = null;
        state.ready = true;
        document.body.classList.add('auth-locked');
        document.body.dataset.topGymAuthenticated = 'false';
        const screen = $('authScreen');
        loadAuthVisuals();
        if (screen) screen.hidden = false;
        const form = $('loginForm');
        if (form) form.hidden = false;
        const heading = form?.querySelector('.auth-form-heading p');
        if (heading) heading.textContent = 'أدخل بيانات حسابك للمتابعة';
        document.querySelector('.auth-loading')?.remove();
        const setupNote = $('loginSetupNote');
        if (setupNote) setupNote.hidden = !setupRequired;
        clearMessage();
        if (message) showMessage(message);
        ensureLogoutButton()?.setAttribute('hidden', '');
        const accountBar = $('authAccountBar');
        if (accountBar) accountBar.hidden = true;
        document.body.classList.remove('auth-pending', 'top-gym-navigation-pending');
        window.setTimeout(() => $('loginEmail')?.focus(), 50);
    }

    async function requestApi(path, options = {}) {
        if (!state.ready) await ready.catch(() => null);
        if (!state.user) {
            const error = new Error('تحتاج إلى تسجيل الدخول أولًا.');
            error.code = 'AUTH_REQUIRED';
            throw error;
        }
        const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
        const response = await nativeFetch(path, { ...options, credentials: 'same-origin', headers });
        if (response.status === 204) return null;
        const data = await response.json().catch(() => ({}));
        if (response.status === 401 && state.user) showLogin('انتهت جلسة الدخول. سجّل الدخول مرة أخرى.');
        if (!response.ok) {
            const error = new Error(data.error || 'تعذر تنفيذ الطلب.');
            error.code = data.code || null;
            throw error;
        }
        return data;
    }

    async function submitLogin(event) {
        event.preventDefault();
        clearMessage();
        const email = $('loginEmail')?.value.trim() || '';
        const password = $('loginPassword')?.value || '';
        if (!email || !password) {
            showMessage('أدخل البريد الإلكتروني وكلمة المرور.');
            return;
        }
        setSubmitLoading(true);
        try {
            const response = await nativeFetch('/api/auth/login', {
                method: 'POST',
                credentials: 'same-origin',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password })
            });
            const data = await response.json().catch(() => ({}));
            if (!response.ok) throw Object.assign(new Error(data.error || 'البريد الإلكتروني أو كلمة المرور غير صحيحة.'), { code: data.code });
            try {
                if ($('loginRememberMe')?.checked) localStorage.setItem(rememberEmailKey, email);
                else localStorage.removeItem(rememberEmailKey);
            } catch {
                // Storage may be disabled; authentication must continue normally.
            }
            window.location.reload();
        } catch (error) {
            showMessage(error.message || 'البريد الإلكتروني أو كلمة المرور غير صحيحة.');
            setSubmitLoading(false);
        }
    }

    function bindLoginUi() {
        const form = $('loginForm');
        if (!form || form.dataset.bound) return;
        form.dataset.bound = 'true';
        form.hidden = true;
        try {
            const rememberedEmail = localStorage.getItem(rememberEmailKey);
            if (rememberedEmail && !$('loginEmail')?.value) {
                $('loginEmail').value = rememberedEmail;
                if ($('loginRememberMe')) $('loginRememberMe').checked = true;
            }
        } catch {
            // Storage may be disabled; leave the login form usable.
        }
        const heading = form.querySelector('.auth-form-heading p');
        if (heading) heading.textContent = 'جاري التحقق من جلسة الدخول…';
        const loading = document.createElement('p');
        loading.className = 'auth-loading auth-setup-note';
        loading.textContent = 'جاري تجهيز بوابة الدخول…';
        form.insertBefore(loading, form.firstChild);
        form.addEventListener('submit', submitLogin);
        $('loginPasswordToggle')?.addEventListener('click', () => {
            const input = $('loginPassword');
            if (!input) return;
            const visible = input.type === 'text';
            input.type = visible ? 'password' : 'text';
            $('loginPasswordToggle').setAttribute('aria-label', visible ? 'إظهار كلمة المرور' : 'إخفاء كلمة المرور');
        });
    }

    async function checkSession() {
        try {
            const response = await nativeFetch('/api/auth/session', { credentials: 'same-origin', cache: 'no-store' });
            const data = await response.json().catch(() => ({}));
            if (!response.ok) throw new Error(data.error || 'تعذر التحقق من جلسة الدخول.');
            if (data.authenticated && data.user) showAuthenticated(data.user);
            else showLogin('', Boolean(data.setupRequired));
        } catch (error) {
            showLogin('تعذر الاتصال بخدمة تسجيل الدخول. حاول مرة أخرى.');
        }
    }

    window.topGymAuth = {
        api: requestApi,
        canAccessTab: (tab) => permissions.canAccessTab(state.user, tab),
        hasPermission: (code) => permissions.hasPermission(state.user, code),
        getPermissions: () => [...(state.user?.permissions || [])],
        getUser: () => state.user,
        isOwner: () => state.user?.role === 'Owner',
        isReady: () => state.ready,
        logout: () => $('authLogoutButton')?.click(),
        refresh: checkSession
    };

    const permissionObserver = new MutationObserver(() => {
        if (state.ready) applyPermissionControls(state.user);
    });
    permissionObserver.observe(document.body, { childList: true, subtree: true });

    window.fetch = async (...args) => {
        const input = args[0];
        const url = String(typeof input === 'string' ? input : input?.url || '');
        const protectedApi = url.includes('/api/') && !url.includes('/api/auth/');
        if (protectedApi && !state.ready) await ready.catch(() => null);
        if (protectedApi && !state.user) {
            return new Response(JSON.stringify({ error: 'تحتاج إلى تسجيل الدخول أولًا.', code: 'AUTH_REQUIRED' }), {
                status: 401,
                headers: { 'Content-Type': 'application/json' }
            });
        }
        const response = await nativeFetch(...args);
        if (response.status === 401 && state.user && url.includes('/api/') && !url.includes('/api/auth/')) showLogin('انتهت جلسة الدخول. سجّل الدخول مرة أخرى.');
        return response;
    };

    const ready = (async () => {
        bindLoginUi();
        await checkSession();
        return state.user;
    })();
    window.topGymAuthReady = ready;
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bindLoginUi, { once: true });
})();
