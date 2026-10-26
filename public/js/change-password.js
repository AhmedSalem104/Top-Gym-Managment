(function () {
    'use strict';

    const form = document.getElementById('forcedPasswordChangeForm');
    const message = document.getElementById('passwordChangeMessage');
    const submit = document.getElementById('passwordChangeSubmit');
    const submitLabel = submit?.querySelector('.password-change-submit-label');
    const identity = document.getElementById('passwordChangeIdentity');
    const i18n = window.TopGymI18n;
    const tr = (key, params) => i18n?.t?.(`passwordChange.${key}`, params) || key;
    const recoveryToken = new URLSearchParams(String(window.location.hash || '').slice(1)).get('recovery') || '';
    const recoveryMode = Boolean(recoveryToken);
    let identityName = '';
    let localMessageKey = '';

    function applyPasswordChangeLocale() {
        i18n?.apply?.(document);
        if (recoveryMode) {
            document.title = tr('recovery.pageTitle');
            const eyebrow = document.querySelector('.password-change-eyebrow');
            const title = document.getElementById('passwordChangeTitle');
            const description = document.getElementById('passwordChangeDescription');
            const note = document.querySelector('.password-change-note');
            if (eyebrow) eyebrow.textContent = tr('recovery.eyebrow');
            if (title) title.textContent = tr('recovery.title');
            if (description) description.textContent = tr('recovery.description');
            if (note) note.hidden = true;
        }
        if (submitLabel) {
            const loading = submit?.getAttribute('aria-busy') === 'true';
            submitLabel.textContent = tr(loading ? 'submit.loading' : 'submit');
        }
        if (identityName && identity) {
            identity.textContent = tr('identity', { name: identityName });
            identity.hidden = false;
        }
        if (localMessageKey && message) message.textContent = tr(localMessageKey);
        document.querySelectorAll('[data-password-toggle]').forEach((toggle) => {
            const kind = toggle.dataset.passwordToggleKind;
            const visible = toggle.getAttribute('aria-pressed') === 'true';
            const key = kind === 'new'
                ? `password.${visible ? 'hideNew' : 'showNew'}`
                : kind === 'confirm'
                    ? `password.${visible ? 'hideConfirm' : 'showConfirm'}`
                    : `password.${visible ? 'hide' : 'show'}`;
            toggle.setAttribute('aria-label', tr(key));
        });
        const theme = window.TopGymTheme?.get?.() || document.documentElement.dataset.theme || 'light';
        const nextThemeKey = theme === 'dark' ? 'theme.enableLight' : 'theme.enableDark';
        const themeButton = document.querySelector('[data-theme-toggle]');
        themeButton?.setAttribute('aria-label', tr(nextThemeKey));
        themeButton?.setAttribute('title', tr(nextThemeKey));
        const themeLabel = themeButton?.querySelector('[data-theme-toggle-label]');
        if (themeLabel) themeLabel.textContent = tr(theme === 'dark' ? 'theme.light' : 'theme.dark');
    }

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
        localMessageKey = '';
        message.textContent = String(text || '');
        message.className = `password-change-message${type === 'success' ? ' is-success' : ''}${type === 'info' ? ' is-info' : ''}`;
        message.hidden = !text;
    }

    function setLocalizedMessage(key, type = 'error') {
        localMessageKey = key;
        setMessage(tr(key), type);
        localMessageKey = key;
    }

    function setLoading(loading) {
        if (!submit) return;
        submit.disabled = Boolean(loading);
        submit.setAttribute('aria-busy', String(Boolean(loading)));
        if (submitLabel) submitLabel.textContent = tr(loading ? 'submit.loading' : recoveryMode ? 'recovery.submit' : 'submit');
    }

    async function request(url, options = {}) {
        const response = await window.fetch(url, {
            credentials: 'same-origin',
            cache: 'no-store',
            ...options,
            headers: { Accept: 'application/json', ...(options.headers || {}) }
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
            const error = new Error(data.error || tr('error.request'));
            if (typeof data.code === 'string') error.code = data.code;
            throw error;
        }
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
        if (recoveryMode) {
            if (!TOKEN_PATTERN.test(recoveryToken)) {
                setLocalizedMessage('error.recoveryInvalid');
                form.hidden = true;
                return;
            }
            document.body.dataset.passwordChangeReady = 'true';
            window.setTimeout(() => document.getElementById('forceNewPassword')?.focus(), 0);
            return;
        }
        try {
            const user = await currentSession();
            if (!user) return;
            if (!isPasswordChangeRequired(user)) {
                routeForUser(user);
                return;
            }
            if (identity && user.name) {
                identityName = String(user.name);
                identity.textContent = tr('identity', { name: identityName });
                identity.hidden = false;
            }
            document.body.dataset.passwordChangeReady = 'true';
            window.setTimeout(() => document.getElementById('forceNewPassword')?.focus(), 0);
        } catch (error) {
            setMessage(error.message || tr('error.session'));
        }
    }

    async function submitPassword(event) {
        event.preventDefault();
        const newPassword = document.getElementById('forceNewPassword')?.value || '';
        const confirmPassword = document.getElementById('forceConfirmPassword')?.value || '';
        setMessage('');
        if (newPassword.length < 8) {
            setLocalizedMessage('error.short');
            return;
        }
        if (newPassword !== confirmPassword) {
            setLocalizedMessage('error.mismatch');
            return;
        }
        setLoading(true);
        try {
            await request(recoveryMode ? '/api/auth/password-recovery/complete' : '/api/auth/change-password', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(recoveryMode
                    ? { token: recoveryToken, newPassword, confirmPassword }
                    : { newPassword, confirmPassword })
            });
            if (recoveryMode) {
                form.querySelectorAll('.password-change-field').forEach((field) => {
                    field.querySelectorAll('input, button').forEach((control) => { control.disabled = true; });
                    field.hidden = true;
                });
                if (submit) submit.hidden = true;
                document.getElementById('passwordRecoveryBackToLogin')?.removeAttribute('hidden');
                setLocalizedMessage('recovery.success', 'success');
                return;
            }
            // The endpoint rotates the session. Re-read it before resolving
            // the product route so the decision comes from the fresh server
            // session, without asking the user to log in again.
            const user = await currentSession();
            if (!user || isPasswordChangeRequired(user)) {
                throw Object.assign(new Error(tr('error.sessionUpdate')), { localMessageKey: 'error.sessionUpdate' });
            }
            routeForUser(user);
        } catch (error) {
            if (error.localMessageKey) setLocalizedMessage(error.localMessageKey);
            else {
                if (recoveryMode && error.code === 'INVALID_RECOVERY_TOKEN') {
                    setLocalizedMessage('error.recoveryInvalid');
                    setLoading(false);
                    return;
                }
                const apiMessageKey = error.code ? `error.api.${error.code}` : '';
                if (apiMessageKey && tr(apiMessageKey) !== `passwordChange.${apiMessageKey}`) setLocalizedMessage(apiMessageKey);
                else setMessage(error.message || tr('error.save'));
            }
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
            const kind = toggle.dataset.passwordToggleKind;
            const key = kind === 'new'
                ? `password.${visible ? 'showNew' : 'hideNew'}`
                : kind === 'confirm'
                    ? `password.${visible ? 'showConfirm' : 'hideConfirm'}`
                    : `password.${visible ? 'show' : 'hide'}`;
            toggle.setAttribute('aria-label', tr(key));
        });
    });

    const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;
    applyPasswordChangeLocale();
    window.addEventListener('topgym:localechange', applyPasswordChangeLocale);
    window.addEventListener('topgym:themechange', applyPasswordChangeLocale);
    form?.addEventListener('submit', submitPassword);
    bootstrap();
}());
