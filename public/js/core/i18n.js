(() => {
    'use strict';

    if (window.TopGymI18n) return;

    const STORAGE_KEY = 'logic-fit-ui-locale';
    const localeMeta = Object.freeze({
        ar: Object.freeze({ lang: 'ar', dir: 'rtl' }),
        en: Object.freeze({ lang: 'en', dir: 'ltr' })
    });

    const loginScreenArabic = Object.freeze({
        'login.page.title': 'تسجيل الدخول | Logic Fit',
        'login.screen.label': 'بوابة تسجيل الدخول',
        'login.controls.label': 'إعدادات العرض',
        'login.locale.label': 'لغة الواجهة',
        'login.form.section': 'قسم تسجيل الدخول',
        'login.features.label': 'مزايا Logic Fit',
        'login.hero.title': 'جيمك. متصل.',
        'login.hero.description': 'مساحة واحدة لإدارة عملك ومدربيك ومشتركيك.',
        'login.form.label': 'نموذج تسجيل الدخول',
        'login.welcome.title': 'مرحبًا بعودتك',
        'login.welcome.description': 'سجّل الدخول إلى حسابك لمتابعة عملك',
        'login.email.label': 'البريد الإلكتروني',
        'login.email.placeholder': 'أدخل البريد الإلكتروني',
        'login.password.label': 'كلمة المرور',
        'login.password.placeholder': 'أدخل كلمة المرور',
        'login.password.show': 'إظهار كلمة المرور',
        'login.password.hide': 'إخفاء كلمة المرور',
        'login.remember': 'تذكرني',
        'login.forgot': 'نسيت كلمة المرور؟',
        'login.setupRequired': 'تعذر بدء جلسة الدخول حاليًا. حاول مرة أخرى لاحقًا.',
        'login.submit': 'تسجيل الدخول',
        'login.submit.loading': 'جارٍ تسجيل الدخول...',
        'login.register.divider': 'أو',
        'login.register.prompt': 'ليس لديك حساب؟',
        'login.register.action': 'إنشاء حساب جديد',
        'login.register.close': 'إغلاق',
        'login.register.title': 'كيف ستستخدم Logic Fit؟',
        'login.register.description': 'اختر مساحة العمل المناسبة لك للمتابعة إلى التسجيل.',
        'login.register.gym': 'منصة جيم',
        'login.register.gym.description': 'أدر الجيم، الفريق، المدربين والأعضاء من مكان واحد.',
        'login.register.trainer': 'مدرب حر',
        'login.register.trainer.description': 'أدر عملاءك، برامجك، جلساتك ومتابعاتك بشكل مستقل.',
        'login.recovery.kicker': 'مساعدة تسجيل الدخول',
        'login.recovery.title': 'استعادة الوصول',
        'login.recovery.description': 'أدخل بريد حسابك، وإذا كان مرتبطًا بحساب نشط فستصلك رسالة برابط آمن صالح لمرة واحدة.',
        'login.recovery.submit': 'إرسال رابط الاستعادة',
        'login.recovery.submit.loading': 'جارٍ إرسال الطلب…',
        'login.recovery.accepted': 'إذا كان البريد مرتبطًا بحساب نشط، فستصلك تعليمات الاستعادة قريبًا.',
        'login.recovery.unavailable': 'خدمة الاستعادة غير متاحة حاليًا. تواصل مع مسؤول الحساب.',
        'login.recovery.close': 'إغلاق',
        'login.copyright': 'جميع الحقوق محفوظة',
        'login.feature.management': 'إدارة متكاملة',
        'login.feature.management.description': 'لجيمك أو عملك',
        'login.feature.trainers': 'مصممة للمدربين الأحرار',
        'login.feature.trainers.description': 'طوّر عملك وابنِ علامتك',
        'login.feature.members': 'تجربة أفضل للأعضاء',
        'login.feature.members.description': 'متابعة، تحفيز، نتائج',
        'login.error.required': 'أدخل البريد الإلكتروني وكلمة المرور.',
        'login.error.invalidCredentials': 'البريد الإلكتروني أو كلمة المرور غير صحيحة.',
        'login.error.rateLimited': 'محاولات دخول كثيرة. حاول بعد قليل.',
        'login.error.accountDisabled': 'هذا الحساب معطل. تواصل مع مالك النظام.',
        'login.error.generic': 'تعذر تنفيذ العملية.'
    });

    const loginScreenEnglish = Object.freeze({
        'login.page.title': 'Sign in | Logic Fit',
        'login.screen.label': 'Sign-in portal',
        'login.controls.label': 'Display settings',
        'login.locale.label': 'Interface language',
        'login.form.section': 'Sign-in section',
        'login.features.label': 'Logic Fit benefits',
        'login.hero.title': 'Your gym. Connected.',
        'login.hero.description': 'One workspace for your business, trainers and members.',
        'login.form.label': 'Sign-in form',
        'login.welcome.title': 'Welcome back',
        'login.welcome.description': 'Sign in to your account to continue your work',
        'login.email.label': 'Email address',
        'login.email.placeholder': 'Enter your email address',
        'login.password.label': 'Password',
        'login.password.placeholder': 'Enter your password',
        'login.password.show': 'Show password',
        'login.password.hide': 'Hide password',
        'login.remember': 'Remember me',
        'login.forgot': 'Forgot password?',
        'login.setupRequired': 'Sign-in is temporarily unavailable. Please try again later.',
        'login.submit': 'Sign in',
        'login.submit.loading': 'Signing in...',
        'login.register.divider': 'or',
        'login.register.prompt': 'Don’t have an account?',
        'login.register.action': 'Create a new account',
        'login.register.close': 'Close',
        'login.register.title': 'How will you use Logic Fit?',
        'login.register.description': 'Choose the workspace that fits you to continue registration.',
        'login.register.gym': 'Gym platform',
        'login.register.gym.description': 'Manage your gym, team, trainers, and members in one place.',
        'login.register.trainer': 'Independent trainer',
        'login.register.trainer.description': 'Manage your clients, programs, sessions, and follow-ups independently.',
        'login.recovery.kicker': 'Sign-in help',
        'login.recovery.title': 'Recover access',
        'login.recovery.description': 'Enter your account email. If it belongs to an active account, a secure one-time recovery link will be sent.',
        'login.recovery.submit': 'Send recovery link',
        'login.recovery.submit.loading': 'Sending request…',
        'login.recovery.accepted': 'If this email belongs to an active account, recovery instructions will arrive shortly.',
        'login.recovery.unavailable': 'Password recovery is temporarily unavailable. Contact your account administrator.',
        'login.recovery.close': 'Close',
        'login.copyright': 'All rights reserved',
        'login.feature.management': 'Complete management',
        'login.feature.management.description': 'For your gym or business',
        'login.feature.trainers': 'Built for independent trainers',
        'login.feature.trainers.description': 'Grow your work and build your brand',
        'login.feature.members': 'A better member experience',
        'login.feature.members.description': 'Progress, motivation, results',
        'login.error.required': 'Enter your email address and password.',
        'login.error.invalidCredentials': 'The email address or password is incorrect.',
        'login.error.rateLimited': 'Too many sign-in attempts. Please try again shortly.',
        'login.error.accountDisabled': 'This account is disabled. Contact your system owner.',
        'login.error.generic': 'The operation could not be completed.'
    });

    window.__TopGymI18nLoginCatalog = Object.freeze({ ar: loginScreenArabic, en: loginScreenEnglish });
    let messages = Object.freeze({
        ar: loginScreenArabic,
        en: loginScreenEnglish
    });
    let catalogLoaded = false;
    let catalogLoadPromise = null;
    let setupComplete = false;
    const catalogSource = '/js/core/i18n-catalog.js?v=4109989005e6f9ce';

    function registerCatalog(catalog) {
        if (!catalog || !catalog.ar || !catalog.en) return false;
        messages = Object.freeze({
            ar: Object.freeze({ ...catalog.ar, ...loginScreenArabic }),
            en: Object.freeze({ ...catalog.en, ...loginScreenEnglish })
        });
        catalogLoaded = true;
        window.__TopGymI18nCatalog = catalog;
        if (setupComplete) {
            annotationCatalogs.clear();
            set(currentLocale, { persist: false });
        }
        return true;
    }

    function loadCatalog() {
        if (catalogLoaded) return Promise.resolve(true);
        if (catalogLoadPromise) return catalogLoadPromise;
        catalogLoadPromise = new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = catalogSource;
            script.async = true;
            script.dataset.topGymI18nCatalog = 'true';
            script.onload = () => catalogLoaded ? resolve(true) : reject(new Error('Translation catalog did not register.'));
            script.onerror = () => {
                script.remove();
                reject(new Error('Translation catalog failed to load.'));
            };
            document.head.appendChild(script);
        }).catch((error) => {
            catalogLoadPromise = null;
            throw error;
        });
        return catalogLoadPromise;
    }

    const text = (value) => String(value ?? '');

    function readSavedLocale() {
        try {
            const saved = window.localStorage.getItem(STORAGE_KEY);
            if (saved === 'ar' || saved === 'en') return saved;
        } catch {
            // Storage can be unavailable in private browsing or embedded views.
        }
        return document.documentElement.lang?.toLowerCase().startsWith('en') ? 'en' : 'ar';
    }

    let currentLocale = readSavedLocale();
    let languageButton = null;
    let languageHostObserver = null;
    let navigationObserver = null;

    function t(key, params = {}) {
        const template = messages[currentLocale][key] ?? messages.ar[key] ?? key;
        // Return plain text only. Callers place it with textContent, never HTML.
        return template.replace(/\{\{\s*([\w.-]+)\s*\}\}/gu, (match, name) => (
            Object.prototype.hasOwnProperty.call(params, name) ? (name === 'count' && typeof params[name] === 'number' ? format('number', params[name]) : text(params[name])) : match
        ));
    }

    const intlFormatterCache = new Map();
    const INTL_FORMATTER_CACHE_LIMIT = 32;

    function getIntlFormatter(kind, Formatter, locale, options) {
        let cacheKey;
        try {
            cacheKey = `${kind}:${locale}:${JSON.stringify(Object.keys(options).sort().map((key) => [key, options[key]]))}`;
        } catch {
            return new Formatter(locale, options);
        }
        if (intlFormatterCache.has(cacheKey)) {
            const cached = intlFormatterCache.get(cacheKey);
            intlFormatterCache.delete(cacheKey);
            intlFormatterCache.set(cacheKey, cached);
            return cached;
        }
        const formatter = new Formatter(locale, options);
        if (intlFormatterCache.size >= INTL_FORMATTER_CACHE_LIMIT) {
            intlFormatterCache.delete(intlFormatterCache.keys().next().value);
        }
        intlFormatterCache.set(cacheKey, formatter);
        return formatter;
    }

    function format(kind, value, options = {}) {
        const locale = currentLocale === 'en' ? 'en-EG' : 'ar-EG';
        if (kind === 'number') {
            const number = Number(value);
            return Number.isFinite(number) ? getIntlFormatter(kind, Intl.NumberFormat, locale, options).format(number) : '';
        }
        if (kind === 'currency') {
            const number = Number(value);
            const formatterOptions = { style: 'currency', currency: options.currency || 'EGP', ...options };
            return Number.isFinite(number) ? getIntlFormatter(kind, Intl.NumberFormat, locale, formatterOptions).format(number) : '';
        }
        if (kind === 'date') {
            if (!value) return '';
            const source = String(value);
            const normalized = /^\d{4}-\d{2}-\d{2}$/u.test(source) ? `${source}T00:00:00Z` : source;
            const date = new Date(normalized);
            if (Number.isNaN(date.getTime())) return source;
            const hasStyle = Boolean(options.dateStyle || options.timeStyle);
            const hasDateComponents = ['weekday', 'era', 'year', 'month', 'day'].some((key) => options[key] !== undefined);
            const formatterOptions = hasStyle || hasDateComponents
                ? options
                : { year: 'numeric', month: '2-digit', day: '2-digit' };
            return getIntlFormatter(kind, Intl.DateTimeFormat, locale, formatterOptions).format(date);
        }
        if (kind === 'time') {
            if (!value) return '';
            const source = String(value);
            const date = new Date(source);
            if (Number.isNaN(date.getTime())) return source;
            const hasStyle = Boolean(options.dateStyle || options.timeStyle);
            const formatterOptions = hasStyle
                ? options
                : { hour: 'numeric', minute: '2-digit', ...options };
            return getIntlFormatter(kind, Intl.DateTimeFormat, locale, formatterOptions).format(date);
        }
        return String(value ?? '');
    }

    function setText(selector, value) {
        document.querySelectorAll(selector).forEach((element) => { element.textContent = value; });
    }

    function renderText(element, key, params = {}) {
        if (!element) return element;
        element.textContent = t(key, params);
        return element;
    }

    const annotationCatalogs = new Map();
    const translationSelector = '[data-i18n], [data-i18n-placeholder], [data-i18n-title], [data-i18n-aria-label], [data-i18n-format]';
    const translationAttributes = [
        ['i18nPlaceholder', 'placeholder'],
        ['i18nTitle', 'title'],
        ['i18nAriaLabel', 'aria-label'],
        ['i18nDataLoadingText', 'data-loading-text']
    ];
    const annotationAttributes = [
        ['placeholder', 'i18nPlaceholder'],
        ['title', 'i18nTitle'],
        ['aria-label', 'i18nAriaLabel'],
        ['data-loading-text', 'i18nDataLoadingText']
    ];

    function applyTranslations(root = document) {
        const applyElement = (element) => {
            if (element.closest?.('[data-i18n-preserve]')) return;
            let params;
            for (const name in element.dataset) {
                if (!name.startsWith('i18nParam')) continue;
                const parameter = name.slice(9, 10).toLowerCase() + name.slice(10);
                const value = element.dataset[name];
                params ||= {};
                params[parameter] = parameter === 'count' && /^\d+(?:\.\d+)?$/u.test(value) ? Number(value) : value;
            }
            const translationParams = params || {};
            const textKey = element.dataset.i18n;
            if (textKey) {
                const translated = t(textKey, translationParams);
                let textNode = null;
                for (const node of element.childNodes) {
                    if (node.nodeType === Node.TEXT_NODE && node.nodeValue.trim()) {
                        textNode = node;
                        break;
                    }
                }
                if (textNode) {
                    const leading = textNode.nodeValue.match(/^\s*/u)?.[0] || '';
                    const trailing = textNode.nodeValue.match(/\s*$/u)?.[0] || '';
                    const value = `${leading}${translated}${trailing}`;
                    if (textNode.nodeValue !== value) textNode.nodeValue = value;
                } else if (!element.children.length && element.textContent !== translated) element.textContent = translated;
            }
            for (const [dataKey, attribute] of translationAttributes) {
                const key = element.dataset[dataKey];
                if (!key) continue;
                const value = t(key, translationParams);
                if (element.getAttribute(attribute) !== value) element.setAttribute(attribute, value);
            }
            if (element.dataset.i18nFormat) {
                const formatted = format(element.dataset.i18nFormat, element.dataset.i18nValue, { currency: element.dataset.i18nCurrency || undefined });
                if (element.textContent !== formatted) element.textContent = formatted;
            }
        };

        if (typeof Element === 'function' && root instanceof Element && root.matches(translationSelector)) applyElement(root);
        root.querySelectorAll?.(translationSelector).forEach(applyElement);
    }

    function annotateText(root, prefix, skipSelector = '') {
        if (!root?.ownerDocument && root !== document) return;
        let catalog = annotationCatalogs.get(prefix);
        if (!catalog) {
            catalog = new Map(Object.entries(messages.ar).filter(([key]) => key.startsWith(prefix)).map(([key, value]) => [value, key]));
            annotationCatalogs.set(prefix, catalog);
        }
        const annotateElement = (element) => {
            if (element.closest('[data-i18n-preserve]') || (skipSelector && element.closest(skipSelector))) return;
            for (const [attribute, dataKey] of annotationAttributes) {
                const value = element.getAttribute(attribute);
                const key = value && catalog.get(value.trim());
                if (key) element.dataset[dataKey] = key;
            }
        };
        if (typeof Element === 'function' && root instanceof Element) annotateElement(root);
        const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
        while (walker.nextNode()) {
            const node = walker.currentNode;
            if (node.nodeType === Node.ELEMENT_NODE) {
                annotateElement(node);
                continue;
            }
            const parent = node.parentElement;
            if (!parent || parent.closest('[data-i18n-preserve]') || (skipSelector && parent.closest(skipSelector))) continue;
            const source = node.nodeValue.trim();
            if (!source || parent.dataset.i18n) continue;
            const key = catalog.get(source);
            if (key) parent.dataset.i18n = key;
        }
        applyTranslations(root);
    }

    function applyNavigationLabels() {
        const rail = document.getElementById('pageTabs');
        if (!rail) return;
        rail.querySelectorAll('[data-page-tab]').forEach((button) => {
            const label = button.querySelector('span:not(.visually-hidden)');
            const key = `nav.${button.dataset.pageTab}`;
            if (!label || !Object.prototype.hasOwnProperty.call(messages[currentLocale], key)) return;
            const translated = t(key);
            if (label.textContent !== translated) label.textContent = translated;
            button.dataset.sidebarLabel = translated;
            button.setAttribute('aria-label', translated);
            button.setAttribute('title', translated);
        });
        rail.querySelectorAll('.sidebar-section-label[data-nav-group-label]').forEach((element) => {
            const key = `nav.group.${element.dataset.navGroupLabel}`;
            const label = element.querySelector('span') || element;
            const translated = t(key);
            if (label.textContent !== translated) label.textContent = translated;
        });
    }

    function applyLoginLabels() {
        const rootLogin = (window.location?.pathname === '/' || window.location?.pathname === '/index.html')
            && Boolean(document.querySelector('#authScreen[data-auth-stage="login"]'));
        if (document.body?.dataset.authEntry !== 'login' && !rootLogin) return;
        const direction = localeMeta[currentLocale].dir;
        [
            '.auth-screen[data-auth-stage="login"] .auth-shell',
            '.auth-screen[data-auth-stage="login"] .auth-form-panel',
            '.auth-screen[data-auth-stage="login"] .auth-form',
            '.auth-screen[data-auth-stage="login"] .auth-account-row',
            '.auth-screen[data-auth-stage="login"] .auth-registration-entry',
            '.auth-screen[data-auth-stage="login"] .auth-reference-features',
            '.auth-screen[data-auth-stage="login"] .auth-reference-marketing-copy',
            '.auth-screen[data-auth-stage="login"] .auth-choice-dialog'
        ].forEach((selector) => document.querySelectorAll(selector).forEach((element) => { element.style.direction = direction; }));
        document.title = t('login.page.title');
        document.getElementById('authScreen')?.setAttribute('aria-label', t('login.screen.label'));
        document.querySelector('#loginForm')?.setAttribute('aria-label', t('login.form.label'));
        document.querySelector('#authScreen .auth-reference-controls')?.setAttribute('aria-label', t('login.controls.label'));
        document.querySelector('#authScreen .auth-login-column')?.setAttribute('aria-label', t('login.form.section'));
        document.querySelector('#authScreen .auth-reference-features')?.setAttribute('aria-label', t('login.features.label'));
        const textTargets = [
            ['.auth-reference-hero-title', 'login.hero.title'],
            ['.auth-reference-hero-description', 'login.hero.description'],
            ['.auth-form-heading h2', 'login.welcome.title'],
            ['.auth-form-heading p', 'login.welcome.description'],
            ['label[for="loginEmail"]', 'login.email.label'],
            ['label[for="loginPassword"]', 'login.password.label'],
            ['.auth-remember span', 'login.remember'],
            ['#authForgotHelp', 'login.forgot'],
            ['#loginSetupNote', 'login.setupRequired'],
            ['.auth-submit-label', 'login.submit'],
            ['.auth-registration-divider i', 'login.register.divider'],
            ['#authRegisterOpen', 'login.register.action'],
            ['#authRegistrationTitle', 'login.register.title'],
            ['#authRegistrationDialog > p', 'login.register.description'],
            ['.auth-choice-option[href="/register-gym"] strong', 'login.register.gym'],
            ['.auth-choice-option[href="/register-gym"] small', 'login.register.gym.description'],
            ['.auth-choice-option[href="/register-trainer"] strong', 'login.register.trainer'],
            ['.auth-choice-option[href="/register-trainer"] small', 'login.register.trainer.description'],
            ['#authRecoveryDialog .auth-choice-kicker', 'login.recovery.kicker'],
            ['#authRecoveryTitle', 'login.recovery.title'],
            ['#authRecoveryDialog > p', 'login.recovery.description'],
            ['#authRecoveryDialog .auth-dialog-confirm', 'login.recovery.close'],
            ['#authRecoverySubmit [data-i18n]', 'login.recovery.submit'],
            ['[data-login-copyright-label]', 'login.copyright'],
            ['.auth-reference-features article:nth-child(1) strong', 'login.feature.management'],
            ['.auth-reference-features article:nth-child(1) small', 'login.feature.management.description'],
            ['.auth-reference-features article:nth-child(2) strong', 'login.feature.trainers'],
            ['.auth-reference-features article:nth-child(2) small', 'login.feature.trainers.description'],
            ['.auth-reference-features article:nth-child(3) strong', 'login.feature.members'],
            ['.auth-reference-features article:nth-child(3) small', 'login.feature.members.description']
        ];
        textTargets.forEach(([selector, key]) => setText(selector, t(key)));
        const registerPrompt = document.querySelector('.auth-registration-entry > p');
        if (registerPrompt) {
            const prompt = [...registerPrompt.childNodes].find((node) => node.nodeType === Node.TEXT_NODE && node.nodeValue.trim());
            if (prompt) prompt.nodeValue = `${t('login.register.prompt')} `;
        }
        const closeButtons = document.querySelectorAll('.auth-choice-close');
        closeButtons.forEach((button) => {
            button.setAttribute('aria-label', t('login.register.close'));
            button.setAttribute('title', t('login.register.close'));
        });
        const email = document.getElementById('loginEmail');
        const password = document.getElementById('loginPassword');
        if (email) email.placeholder = t('login.email.placeholder');
        if (password) password.placeholder = t('login.password.placeholder');
        const passwordToggle = document.getElementById('loginPasswordToggle');
        if (passwordToggle) {
            const key = password?.type === 'text' ? 'login.password.hide' : 'login.password.show';
            passwordToggle.setAttribute('aria-label', t(key));
            passwordToggle.setAttribute('title', t(key));
        }
        const submit = document.getElementById('loginSubmit');
        if (submit) submit.dataset.loadingText = t('login.submit.loading');
        const message = document.getElementById('loginMessage');
        if (message?.dataset.i18n) applyTranslations(message);
    }

    function updateLanguageButton() {
        const authenticated = document.body?.dataset.topGymAuthenticated === 'true';
        const segmented = authenticated
            ? document.querySelector('.topbar-language-toggle[data-locale-segmented]')
            : document.querySelector('#authScreen .auth-locale-segmented[data-locale-segmented]');
        if (segmented) {
            const target = currentLocale === 'ar' ? 'en' : 'ar';
            const switchKey = target === 'en' ? 'language.switchToEnglish' : 'language.switchToArabic';
            const exposeLoginToggle = !authenticated;
            segmented.querySelectorAll('[data-locale-choice]').forEach((button) => {
                const locale = button.dataset.localeChoice;
                button.setAttribute('aria-pressed', String(locale === currentLocale));
                button.setAttribute('lang', locale);
                button.setAttribute('dir', localeMeta[locale]?.dir || 'ltr');
                const localeLabel = t(locale === 'ar' ? 'language.arabic.option' : 'language.english.option');
                button.setAttribute('aria-label', localeLabel);
                button.setAttribute('title', localeLabel);
                if (locale === target && exposeLoginToggle) {
                    button.id = 'languageToggleButton';
                    button.setAttribute('aria-label', t(switchKey));
                    button.setAttribute('title', t(switchKey));
                } else {
                    button.removeAttribute('id');
                }
            });
            const host = segmented.closest('.auth-reference-controls');
            segmented.setAttribute('aria-label', t('login.locale.label'));
            host?.setAttribute('aria-label', t('login.controls.label'));
            return;
        }
        if (!languageButton) return;
        const target = currentLocale === 'ar' ? 'en' : 'ar';
        languageButton.textContent = t('language.short');
        const switchKey = target === 'en' ? 'language.switchToEnglish' : 'language.switchToArabic';
        languageButton.setAttribute('aria-label', t(switchKey));
        languageButton.setAttribute('title', t(switchKey));
        languageButton.setAttribute('lang', currentLocale);
        languageButton.setAttribute('dir', currentLocale === 'ar' ? 'ltr' : 'rtl');
    }

    function applyShell() {
        const root = document.documentElement;
        root.lang = localeMeta[currentLocale].lang;
        root.dir = localeMeta[currentLocale].dir;
        root.dataset.locale = currentLocale;
        if (document.body) {
            document.body.lang = localeMeta[currentLocale].lang;
            document.body.dir = localeMeta[currentLocale].dir;
        }

        applyNavigationLabels();
        applyTranslations(document);
        applyLoginLabels();

        setText('.mobile-nav-heading > strong', t('nav.mobile.heading'));
        document.getElementById('pageTabs')?.setAttribute('aria-label', t('nav.aria'));
        const mobileNav = document.getElementById('mobileNavToggle');
        if (mobileNav) {
            const navOpen = document.querySelector('.app-shell.mobile-nav-open');
            const menuLabel = t(navOpen ? 'nav.mobile.close' : 'nav.mobile.menu');
            mobileNav.setAttribute('aria-label', menuLabel);
            mobileNav.setAttribute('title', menuLabel);
            const hiddenLabel = mobileNav.querySelector('[data-mobile-nav-label]');
            if (hiddenLabel) hiddenLabel.textContent = t('nav.mobile.menu');
        }
        const close = document.getElementById('mobileNavClose');
        if (close) {
            close.setAttribute('aria-label', t('nav.mobile.close'));
            close.setAttribute('title', t('nav.mobile.close'));
            const hiddenLabel = close.querySelector('.visually-hidden');
            if (hiddenLabel) hiddenLabel.textContent = t('nav.mobile.close');
        }

        const shellLabels = [
            ['#branchContextShell .branch-context-kicker strong', 'shell.context'],
            ['#branchContextShell .branch-context-kicker small', 'shell.context.subtitle'],
            ['#branchContextShell [data-context-field="branch"] .branch-context-field-copy > small', 'shell.branch'],
            ['#branchContextShell [data-context-field="section"] .branch-context-field-copy > small', 'shell.section']
        ];
        shellLabels.forEach(([selector, key]) => setText(selector, t(key)));
        document.getElementById('branchContextSelect')?.setAttribute('aria-label', t('shell.branch.current'));
        document.getElementById('sectionContextSelect')?.setAttribute('aria-label', t('shell.section.current'));
        document.querySelector('label[for="branchContextSelect"]')?.replaceChildren(document.createTextNode(t('shell.branch.current')));
        document.querySelector('label[for="sectionContextSelect"]')?.replaceChildren(document.createTextNode(t('shell.section.current')));

        const shellText = [
            ['#topAddMemberButton > span', 'shell.addMember'],
            ['#refreshButton > span', 'shell.refresh'],
            ['#authLogoutButton > span', 'shell.logout']
        ];
        shellText.forEach(([selector, key]) => setText(selector, t(key)));
        document.getElementById('authAccountBar')?.setAttribute('aria-label', t('shell.account'));
        document.querySelectorAll('[data-theme-toggle]').forEach((button) => {
            const next = button.getAttribute('aria-pressed') === 'true' ? 'light' : 'dark';
            const key = next === 'dark' ? 'shell.theme.dark' : 'shell.theme.light';
            button.setAttribute('aria-label', t(key));
            button.setAttribute('title', t(key));
            const label = button.querySelector('[data-theme-toggle-label]');
            if (label) label.textContent = t(next === 'dark' ? 'shell.theme.darkName' : 'shell.theme.lightName');
        });
        document.getElementById('globalKioskToggle')?.setAttribute('aria-label', t('shell.fullscreen'));
        document.getElementById('globalKioskToggle')?.setAttribute('title', t('shell.fullscreen'));
        document.getElementById('mobileKioskAction')?.setAttribute('aria-label', t('shell.fullscreen'));
        document.getElementById('mobileKioskAction')?.setAttribute('title', t('shell.fullscreen'));
        document.getElementById('mobileLogoutAction')?.setAttribute('aria-label', t('shell.logout'));
        document.getElementById('mobileLogoutAction')?.setAttribute('title', t('shell.logout'));
        updateLanguageButton();
    }

    function set(locale, { persist = true } = {}) {
        if (locale !== 'ar' && locale !== 'en') return currentLocale;
        currentLocale = locale;
        applyShell();
        if (persist) {
            try { window.localStorage.setItem(STORAGE_KEY, locale); } catch { /* Locale change still works in memory. */ }
        }
        window.dispatchEvent(new CustomEvent('topgym:localechange', { detail: { locale, dir: localeMeta[locale].dir } }));
        return currentLocale;
    }

    function installLanguageButton() {
        const loginPage = document.body?.dataset.authEntry === 'login';
        const authenticated = document.body?.dataset.topGymAuthenticated === 'true';
        const topbarActions = document.querySelector('.topbar-more-items') || document.querySelector('.topbar-mobile-actions');
        const rootLoginActions = document.querySelector('#authScreen[data-auth-stage="login"] .auth-reference-controls[data-i18n-switcher]');
        const genericSwitcher = document.querySelector('[data-i18n-switcher]');
        const actions = loginPage
            ? (genericSwitcher || document.querySelector('.auth-form-heading'))
            : authenticated
                ? (topbarActions || genericSwitcher || rootLoginActions)
                : (rootLoginActions || genericSwitcher || topbarActions);
        if (!actions) return;
        const segmented = actions.querySelector('[data-locale-segmented]');
        if (segmented) {
            segmented.querySelectorAll('[data-locale-choice]').forEach((button) => {
                if (button.dataset.localeChoiceBound === 'true') return;
                button.addEventListener('click', () => set(button.dataset.localeChoice));
                button.dataset.localeChoiceBound = 'true';
            });
            updateLanguageButton();
            return;
        }
        languageButton = document.getElementById('languageToggleButton');
        if (!languageButton || languageButton.matches('[data-locale-choice]')) {
            languageButton = document.createElement('button');
            languageButton.id = 'languageToggleButton';
            languageButton.type = 'button';
        }
        const isRootLoginHost = typeof actions.matches === 'function'
            && actions.matches('#authScreen[data-auth-stage="login"] .auth-reference-controls[data-i18n-switcher]');
        const portalHost = typeof actions.hasAttribute === 'function'
            ? actions.hasAttribute('data-i18n-switcher') && !isRootLoginHost
            : Object.prototype.hasOwnProperty.call(actions.dataset || {}, 'i18nSwitcher') && !isRootLoginHost;
        languageButton.className = loginPage
            ? 'auth-language-toggle'
            : isRootLoginHost
                ? 'auth-language-control'
                : portalHost
                    ? 'portal-theme-toggle theme-toggle-button portal-language-toggle'
                    : 'topbar-theme-toggle theme-toggle-button topbar-language-toggle';
        languageButton.setAttribute('data-locale-toggle', '');
        if (languageButton.parentElement !== actions) {
            const themeButton = actions.querySelector('[data-theme-toggle]');
            if (loginPage && !actions.hasAttribute('data-i18n-switcher')) actions.insertBefore(languageButton, actions.firstChild);
            else actions.insertBefore(languageButton, themeButton || null);
        }
        if (languageButton.dataset.localeToggleBound !== 'true') {
            languageButton.addEventListener('click', () => set(currentLocale === 'ar' ? 'en' : 'ar'));
            languageButton.dataset.localeToggleBound = 'true';
        }
        updateLanguageButton();
    }

    window.TopGymI18n = Object.freeze({
        get: () => currentLocale,
        dir: () => localeMeta[currentLocale].dir,
        t,
        format,
        renderText,
        apply: applyTranslations,
        annotateText,
        set,
        toggle: () => set(currentLocale === 'ar' ? 'en' : 'ar'),
        loadCatalog,
        registerCatalog,
        isCatalogLoaded: () => catalogLoaded,
        applyShell
    });

    function setup() {
        installLanguageButton();
        if (document.body && typeof MutationObserver === 'function' && !languageHostObserver) {
            languageHostObserver = new MutationObserver(() => installLanguageButton());
            languageHostObserver.observe(document.body, { attributes: true, attributeFilter: ['data-top-gym-authenticated'] });
        }
        set(currentLocale, { persist: false });
        setupComplete = true;
        const rail = document.getElementById('pageTabs');
        if (rail && typeof MutationObserver === 'function') {
            navigationObserver = new MutationObserver(applyNavigationLabels);
            navigationObserver.observe(rail, { childList: true, subtree: true });
        }
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', setup, { once: true });
    else setup();
})();
