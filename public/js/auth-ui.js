(() => {
    if (window.__topGymAuthUiLoaded) return;
    window.__topGymAuthUiLoaded = true;

    const nativeFetch = window.fetch.bind(window);
    const allowedTabs = ['dashboard', 'members', 'trainees', 'management', 'attendance', 'expenses', 'library', 'reports'];
    const assistantTabs = ['members', 'trainees', 'attendance', 'library'];
    const state = { user: null, ready: false, redirecting: false };

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
        const actions = document.querySelector('.top-actions');
        if (!actions || $('authLogoutButton')) return $('authLogoutButton');
        const button = document.createElement('button');
        button.id = 'authLogoutButton';
        button.type = 'button';
        button.className = 'btn btn-light btn-small auth-logout-button';
        button.textContent = 'تسجيل الخروج';
        button.hidden = true;
        actions.appendChild(button);
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
        const tabs = isOwner ? allowedTabs : assistantTabs;
        document.body.dataset.topGymRole = user?.role || '';
        document.body.dataset.topGymUserId = user?.id ? String(user.id) : '';
        document.querySelectorAll('[data-page-tab]').forEach((button) => {
            const allowed = tabs.includes(button.dataset.pageTab);
            button.hidden = !allowed;
            button.setAttribute('aria-hidden', String(!allowed));
        });
        const managementPanel = $('authUsersPanel');
        if (managementPanel) managementPanel.hidden = !isOwner;
        const profileName = document.querySelector('.header-profile-copy strong');
        const profileRole = document.querySelector('.header-profile-copy small');
        const profileAvatar = document.querySelector('.profile-avatar');
        if (profileName) profileName.textContent = user?.name || 'TOP GYM';
        if (profileRole) profileRole.textContent = roleLabel(user?.role);
        if (profileAvatar) profileAvatar.textContent = initials(user?.name);
        const logout = ensureLogoutButton();
        if (logout) logout.hidden = !user;
        if (!isOwner && !assistantTabs.includes(window.location.hash.slice(1))) {
            window.location.hash = '#members';
        }
    }

    function showAuthenticated(user) {
        state.user = user;
        state.ready = true;
        document.body.classList.remove('auth-pending', 'auth-locked');
        document.body.dataset.topGymAuthenticated = 'true';
        const screen = $('authScreen');
        if (screen) screen.hidden = true;
        applyNavigation(user);
    }

    function showLogin(message = '', setupRequired = false) {
        if (!state.ready && message && message.includes('انتهت جلسة')) return;
        state.user = null;
        state.ready = true;
        document.body.classList.remove('auth-pending');
        document.body.classList.add('auth-locked');
        document.body.dataset.topGymAuthenticated = 'false';
        const screen = $('authScreen');
        if (screen) screen.hidden = false;
        const form = $('loginForm');
        if (form) form.hidden = false;
        document.querySelector('.auth-loading')?.remove();
        const setupNote = $('loginSetupNote');
        if (setupNote) setupNote.hidden = !setupRequired;
        clearMessage();
        if (message) showMessage(message);
        ensureLogoutButton()?.setAttribute('hidden', '');
        window.setTimeout(() => $('loginEmail')?.focus(), 50);
    }

    async function requestApi(path, options = {}) {
        const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
        const response = await nativeFetch(path, { ...options, credentials: 'same-origin', headers });
        if (response.status === 204) return null;
        const data = await response.json().catch(() => ({}));
        if (response.status === 401 && state.ready) showLogin('انتهت جلسة الدخول. سجّل الدخول مرة أخرى.');
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
        canAccessTab: (tab) => state.user?.role === 'Owner' || assistantTabs.includes(tab),
        getUser: () => state.user,
        isOwner: () => state.user?.role === 'Owner',
        isReady: () => state.ready,
        logout: () => $('authLogoutButton')?.click(),
        refresh: checkSession
    };

    window.fetch = async (...args) => {
        const input = args[0];
        const url = String(typeof input === 'string' ? input : input?.url || '');
        const protectedApi = url.includes('/api/') && !url.includes('/api/auth/');
        if (protectedApi && !state.ready) await ready.catch(() => null);
        const response = await nativeFetch(...args);
        if (response.status === 401 && state.ready && url.includes('/api/') && !url.includes('/api/auth/')) showLogin('انتهت جلسة الدخول. سجّل الدخول مرة أخرى.');
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
