(function () {
    'use strict';

    const form = document.getElementById('forcedPasswordChangeForm');
    const message = document.getElementById('passwordChangeMessage');
    const submit = document.getElementById('passwordChangeSubmit');
    const submitLabel = submit?.querySelector('.password-change-submit-label');
    const identity = document.getElementById('passwordChangeIdentity');

    const normalizeTenantType = (user) => String(user?.tenantType ?? user?.tenant_type ?? '')
        .trim()
        .toLowerCase()
        .replace(/-/g, '_');
    const isPasswordChangeRequired = (user) => user?.mustChangePassword === true
        || user?.mustChangePassword === 1
        || user?.mustChangePassword === '1'
        || user?.mustChangePassword === 'true'
        || user?.must_change_password === true
        || user?.must_change_password === 1
        || user?.must_change_password === '1'
        || user?.must_change_password === 'true';

    function setMessage(text = '', type = 'error') {
        if (!message) return;
        message.textContent = String(text || '');
        message.className = `password-change-message${type === 'success' ? ' is-success' : ''}${type === 'info' ? ' is-info' : ''}`;
        message.hidden = !text;
    }

    function setLoading(loading) {
        if (!submit) return;
        submit.disabled = Boolean(loading);
        submit.setAttribute('aria-busy', String(Boolean(loading)));
        if (submitLabel) submitLabel.textContent = loading ? 'جارٍ حفظ كلمة المرور…' : 'حفظ كلمة المرور والمتابعة';
    }

    async function request(url, options = {}) {
        const response = await window.fetch(url, {
            credentials: 'same-origin',
            cache: 'no-store',
            ...options,
            headers: { Accept: 'application/json', ...(options.headers || {}) }
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error || 'تعذر إكمال العملية. حاول مرة أخرى.');
        return data;
    }

    function routeForUser(user) {
        const tenantType = normalizeTenantType(user);
        if (tenantType === 'independent_trainer') {
            window.location.replace('/trainer-workspace');
            return;
        }
        if (tenantType === 'gym') {
            window.location.replace('/#dashboard');
            return;
        }
        window.location.replace('/');
    }

    async function currentSession() {
        const data = await request('/api/auth/session');
        if (!data.authenticated || !data.user) {
            window.location.replace('/');
            return null;
        }
        return data.user;
    }

    async function bootstrap() {
        try {
            const user = await currentSession();
            if (!user) return;
            if (!isPasswordChangeRequired(user)) {
                routeForUser(user);
                return;
            }
            if (identity && user.name) {
                identity.textContent = `الحساب: ${user.name}`;
                identity.hidden = false;
            }
            document.body.dataset.passwordChangeReady = 'true';
            window.setTimeout(() => document.getElementById('forceNewPassword')?.focus(), 0);
        } catch (error) {
            setMessage(error.message || 'تعذر التحقق من جلسة الحساب. حاول إعادة تحميل الصفحة.');
        }
    }

    async function submitPassword(event) {
        event.preventDefault();
        const newPassword = document.getElementById('forceNewPassword')?.value || '';
        const confirmPassword = document.getElementById('forceConfirmPassword')?.value || '';
        setMessage('');
        if (newPassword.length < 8) {
            setMessage('كلمة المرور الجديدة يجب أن تكون 8 أحرف على الأقل.');
            return;
        }
        if (newPassword !== confirmPassword) {
            setMessage('كلمتا المرور غير متطابقتين.');
            return;
        }
        setLoading(true);
        try {
            await request('/api/auth/change-password', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ newPassword, confirmPassword })
            });
            // The endpoint rotates the session. Re-read it before resolving
            // the product route so the decision comes from the fresh server
            // session, without asking the user to log in again.
            const user = await currentSession();
            if (!user || isPasswordChangeRequired(user)) {
                throw new Error('لم يتم تحديث حالة الحساب بعد. أعد المحاولة.');
            }
            routeForUser(user);
        } catch (error) {
            setMessage(error.message || 'تعذر حفظ كلمة المرور. حاول مرة أخرى.');
            setLoading(false);
        }
    }

    document.querySelectorAll('[data-password-toggle]').forEach((toggle) => {
        toggle.addEventListener('click', () => {
            const input = document.getElementById(toggle.dataset.passwordToggle);
            if (!input) return;
            const visible = input.type === 'text';
            input.type = visible ? 'password' : 'text';
            toggle.setAttribute('aria-pressed', String(!visible));
            toggle.setAttribute('aria-label', visible ? 'إظهار كلمة المرور' : 'إخفاء كلمة المرور');
        });
    });

    form?.addEventListener('submit', submitPassword);
    bootstrap();
}());
