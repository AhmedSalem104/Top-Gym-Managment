(() => {
    'use strict';

    if (window.__topGymBrandingLoaded) return;
    window.__topGymBrandingLoaded = true;

    const root = document.documentElement;
    const FALLBACK = {
        schemaVersion: 1,
        identity: {
            brandName: 'الجيم', englishBrandName: 'ELGYM', shortName: 'الجيم',
            description: 'منصة الإدارة الذكية للجيم واللياقة.',
            welcomeTitle: 'كل تمرينة تقرّبك لهدفك.', welcomeSubtitle: 'إدارة أذكى لجيم أقوى.',
            companyName: 'الجيم', copyrightText: '© الجيم — إدارة أذكى، أداء أفضل',
            phone: '', address: '', email: '', website: ''
        },
        assets: {},
        themes: {
            light: {
                primary: '#1769E8', primaryHover: '#0F56C9', primaryActive: '#0D47A1', onPrimary: '#FFFFFF',
                secondary: '#41516A', accent: '#7C3AED', background: '#F5F7FB', surface: '#FFFFFF', surfaceSecondary: '#EEF3F9',
                card: '#FFFFFF', cardHover: '#F8FBFF', elevated: '#FFFFFF', sidebar: '#132238', header: '#132238',
                textPrimary: '#172033', textSecondary: '#41516A', textMuted: '#718096', textDisabled: '#98A3B5',
                border: '#D9E2EF', borderSecondary: '#E7EDF5', borderHover: '#B9D1F8', inputBackground: '#FFFFFF',
                tableHeader: '#F1F5F9', scrollbarTrack: '#EEF3F9', scrollbarThumb: '#CBD7E6', success: '#0F9F6E', warning: '#BD7604', danger: '#D74343', info: '#2563EB',
                primarySoft: 'rgb(23 105 232 / 0.10)', primaryBorder: 'rgb(23 105 232 / 0.24)', successSoft: 'rgb(15 159 110 / 0.10)', successBorder: 'rgb(15 159 110 / 0.25)', warningSoft: 'rgb(189 118 4 / 0.10)', warningBorder: 'rgb(189 118 4 / 0.25)', dangerSoft: 'rgb(215 67 67 / 0.10)', dangerBorder: 'rgb(215 67 67 / 0.25)', infoSoft: 'rgb(37 99 235 / 0.10)', infoBorder: 'rgb(37 99 235 / 0.25)', overlay: 'rgb(2 6 23 / 0.58)', focusRing: 'rgb(23 105 232 / 0.18)'
            },
            dark: {
                primary: '#7C3AED', primaryHover: '#8B5CF6', primaryActive: '#6D28D9', onPrimary: '#FFFFFF',
                secondary: '#CBD5E1', accent: '#A78BFA', background: '#070D16', surface: '#0F1826', surfaceSecondary: '#0C1421',
                card: '#111C2B', cardHover: '#162235', elevated: '#182437', sidebar: '#09111D', header: '#0C1421',
                textPrimary: '#F8FAFC', textSecondary: '#CBD5E1', textMuted: '#94A3B8', textDisabled: '#64748B',
                border: '#243247', borderSecondary: '#1B293B', borderHover: '#35465E', inputBackground: '#0B1522',
                tableHeader: '#0C1624', scrollbarTrack: '#09111D', scrollbarThumb: '#35465E', success: '#22C55E', warning: '#F59E0B', danger: '#F43F5E', info: '#3B82F6',
                primarySoft: 'rgb(124 58 237 / 0.14)', primaryBorder: 'rgb(139 92 246 / 0.30)', successSoft: 'rgb(34 197 94 / 0.13)', successBorder: 'rgb(34 197 94 / 0.25)', warningSoft: 'rgb(245 158 11 / 0.13)', warningBorder: 'rgb(245 158 11 / 0.25)', dangerSoft: 'rgb(244 63 94 / 0.13)', dangerBorder: 'rgb(244 63 94 / 0.30)', infoSoft: 'rgb(59 130 246 / 0.13)', infoBorder: 'rgb(59 130 246 / 0.25)', overlay: 'rgb(2 6 23 / 0.75)', focusRing: 'rgb(124 58 237 / 0.18)'
            }
        },
        typography: { arabicFont: 'Cairo', englishFont: 'Cairo', headingFont: 'Cairo', bodyFont: 'Cairo', baseFontSize: 16, headingWeight: 800, bodyWeight: 400 },
        login: { backgroundColor: '#070D16', gradientStart: '#7C3AED', gradientEnd: '#070D16', overlayOpacity: 0.72, showIllustration: true, showBrandCopy: true },
        interface: { radius: 'medium', cardStyle: 'border', shadow: 'soft', sidebar: 'brand', activeStyle: 'background' },
        documents: { phone: '', address: '', email: '', website: '', footer: 'إدارة أذكى، أداء أفضل.', watermark: '', signature: '', stamp: '' }
    };

    const TOKEN_ALIASES = {
        primary: ['--brand-primary', '--primary', '--color-primary', '--store-primary'],
        primaryHover: ['--brand-primary-hover', '--primary-hover', '--color-primary-hover', '--store-primary-dark'],
        primaryActive: ['--brand-primary-active', '--primary-active'],
        primarySoft: ['--brand-primary-soft', '--primary-soft', '--color-primary-soft', '--nav-active-bg'],
        primaryBorder: ['--brand-primary-border', '--primary-border', '--nav-active-border'],
        onPrimary: ['--brand-on-primary', '--text-on-primary'],
        secondary: ['--brand-secondary', '--color-secondary'],
        accent: ['--brand-accent'],
        background: ['--brand-background', '--bg-app', '--color-bg', '--color-page'],
        surface: ['--brand-surface', '--bg-surface', '--color-surface'],
        surfaceSecondary: ['--brand-surface-secondary', '--color-bg-subtle'],
        card: ['--brand-card-background', '--bg-card', '--color-surface-elevated'],
        cardHover: ['--brand-card-hover', '--bg-card-hover', '--color-surface-muted'],
        elevated: ['--brand-elevated', '--bg-elevated'],
        sidebar: ['--brand-sidebar', '--bg-sidebar', '--sidebar-bg'],
        header: ['--brand-header', '--bg-header', '--color-navy'],
        textPrimary: ['--brand-text-primary', '--text-primary', '--color-text'],
        textSecondary: ['--brand-text-secondary', '--text-secondary', '--color-text-soft'],
        textMuted: ['--brand-text-muted', '--text-muted', '--color-text-muted', '--store-muted'],
        textDisabled: ['--brand-text-disabled', '--text-disabled', '--color-text-subtle'],
        border: ['--brand-border', '--border-primary', '--border-color', '--store-border'],
        borderSecondary: ['--brand-border-secondary', '--border-secondary', '--color-border-soft'],
        borderHover: ['--brand-border-hover', '--border-hover', '--border-strong'],
        inputBackground: ['--brand-input-background', '--bg-input'],
        tableHeader: ['--brand-table-header', '--table-header-bg'],
        scrollbarTrack: ['--brand-scrollbar-track', '--scrollbar-track'],
        scrollbarThumb: ['--brand-scrollbar-thumb', '--scrollbar-thumb'],
        success: ['--brand-success', '--success', '--color-success', '--success-text'],
        successSoft: ['--brand-success-soft', '--success-soft', '--color-success-soft'],
        successBorder: ['--brand-success-border', '--success-border'],
        warning: ['--brand-warning', '--warning', '--color-warning', '--warning-text', '--color-warning-strong'],
        warningSoft: ['--brand-warning-soft', '--warning-soft', '--color-warning-soft', '--warning-border'],
        warningBorder: ['--brand-warning-border', '--warning-border'],
        danger: ['--brand-danger', '--danger', '--color-danger', '--danger-text'],
        dangerSoft: ['--brand-danger-soft', '--danger-soft', '--color-danger-soft'],
        dangerBorder: ['--brand-danger-border', '--danger-border'],
        info: ['--brand-info', '--info', '--color-info', '--info-text'],
        infoSoft: ['--brand-info-soft', '--info-soft', '--color-info-soft'],
        infoBorder: ['--brand-info-border', '--info-border'],
        overlay: ['--brand-overlay', '--overlay'],
        focusRing: ['--brand-focus-ring', '--focus-ring']
    };

    const TEXT_FIELDS = new Set(['brandName', 'englishBrandName', 'shortName', 'description', 'welcomeTitle', 'welcomeSubtitle', 'companyName', 'copyrightText', 'phone', 'address', 'email', 'website', 'footer', 'watermark', 'signature', 'stamp']);
    const FONT_NAMES = new Set(['Cairo', 'Alexandria', 'IBM Plex Sans Arabic']);
    const FONT_URLS = {
        Alexandria: 'https://fonts.googleapis.com/css2?family=Alexandria:wght@400;500;600;700;800&display=swap',
        'IBM Plex Sans Arabic': 'https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Arabic:wght@400;500;600;700&display=swap'
    };
    const DEFAULT_ASSET_URLS = Object.freeze({
        primaryLogo: '/assets/gym-brand-horizontal.svg?v=1',
        horizontalLogo: '/assets/gym-brand-horizontal.svg?v=1',
        lightLogo: '/assets/gym-brand-light.svg?v=1',
        darkLogo: '/assets/gym-brand-dark.svg?v=1',
        compactLogo: '/assets/gym-brand.svg?v=1',
        favicon: '/assets/gym-brand.svg?v=1',
        appIcon: '/assets/gym-brand.svg?v=1',
        printLogo: '/assets/gym-brand-horizontal.svg?v=1'
    });
    const ASSET_FALLBACK_KEYS = Object.freeze({
        primaryLogo: ['primaryLogo', 'horizontalLogo', 'lightLogo', 'darkLogo', 'compactLogo'],
        horizontalLogo: ['horizontalLogo', 'primaryLogo', 'lightLogo', 'darkLogo', 'compactLogo'],
        lightLogo: ['lightLogo', 'primaryLogo', 'horizontalLogo', 'compactLogo'],
        darkLogo: ['darkLogo', 'primaryLogo', 'horizontalLogo', 'compactLogo'],
        compactLogo: ['compactLogo', 'lightLogo', 'darkLogo', 'primaryLogo', 'horizontalLogo'],
        favicon: ['favicon', 'compactLogo', 'primaryLogo', 'horizontalLogo'],
        appIcon: ['appIcon', 'compactLogo', 'primaryLogo', 'horizontalLogo'],
        printLogo: ['printLogo', 'horizontalLogo', 'primaryLogo', 'lightLogo', 'darkLogo', 'compactLogo']
    });

    // Branding is tenant-specific. Do not hydrate the UI from a global
    // localStorage entry: the previous tenant's logo/name could briefly (or
    // permanently, after an API failure) appear for the next tenant.
    let branding = merge(FALLBACK, {});
    let version = 1;

    function clone(value) { return JSON.parse(JSON.stringify(value)); }
    function isObject(value) { return Boolean(value) && typeof value === 'object' && !Array.isArray(value); }
    function merge(base, override) {
        const result = clone(base);
        if (!isObject(override)) return result;
        for (const [key, value] of Object.entries(override)) {
            if (isObject(value) && isObject(result[key])) result[key] = merge(result[key], value);
            else if (value !== undefined) result[key] = value;
        }
        return result;
    }
    function currentTheme() { return root.dataset.theme === 'dark' ? 'dark' : 'light'; }

    function tenantHint() {
        const fromBody = document.body?.dataset?.brandingTenant || '';
        if (fromBody) return String(fromBody).trim().toLowerCase();
        try { return String(new URLSearchParams(window.location.search).get('tenant') || '').trim().toLowerCase(); } catch (_) { return ''; }
    }

    function loadFont(name) {
        const href = FONT_URLS[name];
        if (!href || document.querySelector(`link[data-brand-font="${name}"]`)) return;
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = href;
        link.dataset.brandFont = name;
        document.head.appendChild(link);
    }

    function contrastRatio(first, second) {
        const toRgb = (value) => {
            const match = String(value || '').match(/^#([\da-f]{6})$/i);
            if (!match) return null;
            return [parseInt(match[1].slice(0, 2), 16), parseInt(match[1].slice(2, 4), 16), parseInt(match[1].slice(4, 6), 16)];
        };
        const luminance = (value) => {
            const rgb = toRgb(value);
            if (!rgb) return 0;
            return rgb.reduce((total, channel, index) => {
                const normalized = channel / 255;
                const linear = normalized <= 0.03928 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
                return total + linear * [0.2126, 0.7152, 0.0722][index];
            }, 0);
        };
        const one = luminance(first);
        const two = luminance(second);
        return (Math.max(one, two) + 0.05) / (Math.min(one, two) + 0.05);
    }

    function applyTokens(config, themeName = currentTheme(), target = root) {
        const tokens = config.themes?.[themeName] || FALLBACK.themes[themeName];
        Object.entries(TOKEN_ALIASES).forEach(([key, names]) => {
            const value = tokens[key];
            if (!value) return;
            names.forEach((name) => target.style.setProperty(name, value));
        });
        const typography = config.typography || FALLBACK.typography;
        const bodyFont = FONT_NAMES.has(typography.bodyFont) ? typography.bodyFont : 'Cairo';
        const headingFont = FONT_NAMES.has(typography.headingFont) ? typography.headingFont : bodyFont;
        loadFont(bodyFont);
        loadFont(headingFont);
        target.style.setProperty('--brand-font-body', `'${bodyFont}', 'Cairo', 'Tahoma', sans-serif`);
        target.style.setProperty('--brand-font-heading', `'${headingFont}', '${bodyFont}', 'Cairo', 'Tahoma', sans-serif`);
        target.style.setProperty('--font-body', `var(--brand-font-body)`);
        target.style.setProperty('--font-latin', `var(--brand-font-body)`);
        target.style.setProperty('--font-heading', `var(--brand-font-heading)`);
        target.style.setProperty('--brand-base-font-size', `${Math.min(18, Math.max(14, Number(typography.baseFontSize) || 16))}px`);
        const interfaceOptions = config.interface || FALLBACK.interface;
        const radius = { sharp: 6, small: 8, medium: 12, large: 18 }[interfaceOptions.radius] || 12;
        target.style.setProperty('--brand-radius-base', `${radius}px`);
        target.style.setProperty('--radius-xs', `${Math.max(4, radius - 6)}px`);
        target.style.setProperty('--radius-sm', `${Math.max(6, radius - 4)}px`);
        target.style.setProperty('--radius-md', `${Math.max(8, radius - 2)}px`);
        target.style.setProperty('--radius-lg', `${radius}px`);
        target.style.setProperty('--radius-xl', `${radius + 4}px`);
        const shadow = { none: 'none', soft: themeName === 'dark' ? '0 8px 24px rgb(0 0 0 / 0.18)' : '0 8px 24px rgb(15 23 42 / 0.06)', medium: themeName === 'dark' ? '0 14px 32px rgb(0 0 0 / 0.28)' : '0 14px 32px rgb(15 23 42 / 0.12)' }[interfaceOptions.shadow] || 'var(--shadow-card)';
        target.style.setProperty('--shadow-card', shadow);
        const sidebarBackground = tokens.sidebar || '#132238';
        const sidebarLight = contrastRatio('#FFFFFF', sidebarBackground) >= contrastRatio('#172033', sidebarBackground) ? '#FFFFFF' : '#172033';
        target.style.setProperty('--text-primary-soft', tokens.accent || tokens.primaryHover || tokens.primary);
        target.style.setProperty('--border-strong', tokens.borderHover || tokens.border);
        target.style.setProperty('--border-focus', tokens.primaryHover || tokens.primary);
        target.style.setProperty('--color-pale-blue', tokens.primarySoft || 'transparent');
        target.style.setProperty('--color-warning-surface', tokens.warningSoft || 'transparent');
        target.style.setProperty('--color-outstanding', tokens.danger || '#D74343');
        target.style.setProperty('--sidebar-bg-deep', tokens.background || sidebarBackground);
        target.style.setProperty('--sidebar-active-bg', tokens.primary || '#1769E8');
        target.style.setProperty('--nav-active-text', tokens.accent || tokens.primary);
        target.style.setProperty('--nav-active-shadow', shadow);
        target.style.setProperty('--shadow-primary', `0 8px 20px color-mix(in srgb, ${tokens.primary} 18%, transparent)`);
        target.style.setProperty('--shadow-primary-strong', `0 8px 20px color-mix(in srgb, ${tokens.primary} 24%, transparent)`);
        target.style.setProperty('--anatomy-selection', tokens.accent || tokens.primary);
        target.style.setProperty('--anatomy-rim-light', tokens.primary);
        target.style.setProperty('--builder-workout-accent', tokens.primary);
        target.style.setProperty('--builder-workout-accent-strong', tokens.primaryHover || tokens.primary);
        target.style.setProperty('--builder-workout-soft', tokens.primarySoft || 'transparent');
        target.style.setProperty('--builder-workout-border', tokens.primaryBorder || tokens.border);
        target.style.setProperty('--builder-workout-stage-bg', tokens.card || tokens.background);
        target.style.setProperty('--sidebar-text', sidebarLight);
        target.style.setProperty('--sidebar-text-muted', sidebarLight === '#FFFFFF' ? 'rgb(203 213 225 / 0.78)' : 'rgb(65 81 106 / 0.82)');
        target.style.setProperty('--sidebar-active-text', tokens.onPrimary || '#FFFFFF');
        target.style.setProperty('--sidebar-border', tokens.border || 'transparent');
        target.style.setProperty('--sidebar-divider', tokens.borderSecondary || tokens.border || 'transparent');
        target.style.setProperty('--sidebar-hover-bg', tokens.primarySoft || 'transparent');
        target.style.setProperty('--sidebar-active-shadow', shadow);
        target.dataset.brandCardStyle = interfaceOptions.cardStyle || 'border';
        target.dataset.brandActiveStyle = interfaceOptions.activeStyle || 'background';
        target.dataset.brandSidebarStyle = interfaceOptions.sidebar || 'brand';
    }

    function assetUrl(key) {
        const candidates = ASSET_FALLBACK_KEYS[key] || [key];
        for (const candidate of candidates) {
            const url = branding.assets?.[candidate]?.url;
            if (url) return url;
        }
        return DEFAULT_ASSET_URLS[key] || '';
    }
    function textValue(key) {
        if (key === 'footer') return branding.documents?.footer || FALLBACK.documents.footer;
        if (TEXT_FIELDS.has(key)) return branding.identity?.[key] || FALLBACK.identity[key] || '';
        return '';
    }

    function templateValue(key) {
        const name = branding.identity?.brandName || FALLBACK.identity.brandName;
        const english = branding.identity?.englishBrandName || FALLBACK.identity.englishBrandName;
        const values = {
            storeKicker: `${english} STORE`,
            intelligenceKicker: `${english} INTELLIGENCE`,
            libraryKicker: `مرجع ${name}`,
            feedbackDescription: `راجع آراء الأعضاء ومشكلاتهم واقتراحاتهم لتحسين تجربة ${name}.`,
            feedbackFeatureOption: `إضافة يحتاجها ${name}`,
            backupDescription: `أنشئ نسخة ${name} بصيغة .json.gz أو .bak، ثم افحصها واسترجعها بأمان من هذه الشاشة.`,
            libraryFormDescription: `أدخل البيانات ثم احفظها في مكتبة ${name}.`,
            backupRestoreDescription: `اختر ملف ${name} المضغوط. سيتم فحصه أولًا ولن يبدأ الاسترجاع إلا بعد تأكيدك.`,
            assistantLabel: `مساعدة ${name}`,
            portalSecurityDescription: `أدخل الكود كما استلمته من إدارة ${name}، ولا تشاركه مع أي شخص.`,
            portalFeedbackCardDescription: `شاركنا رأيك في ${name} والمدربين`,
            portalFeedbackDescription: `شاركنا رأيك في ${name} والمدربين، وأخبرنا بما يمكننا تحسينه.`,
            portalFeedbackFeatureOption: `إضافة يحتاجها ${name}`,
            portalFeedbackPlaceholder: `اكتب رأيك في ${name} والمدربين والإيجابيات والسلبيات أو أي اقتراح لديك...`
        };
        return values[key] || '';
    }

    function applyTextAndAssets() {
        const brandName = String(branding.identity?.brandName || FALLBACK.identity.brandName).trim() || FALLBACK.identity.brandName;
        root.style.setProperty('--brand-name', JSON.stringify(brandName));
        document.querySelectorAll('[data-brand-text]').forEach((element) => {
            const key = element.dataset.brandText;
            const value = textValue(key);
            if (value !== '') element.textContent = value;
        });
        document.querySelectorAll('[data-brand-template]').forEach((element) => {
            const value = templateValue(element.dataset.brandTemplate);
            if (value) element.textContent = value;
        });
        document.querySelectorAll('[data-brand-placeholder]').forEach((element) => {
            const value = templateValue(element.dataset.brandPlaceholder);
            if (value) element.setAttribute('placeholder', value);
        });
        document.querySelectorAll('[data-brand-logo], [data-brand-asset]').forEach((element) => {
            const key = element.dataset.brandLogo || element.dataset.brandAsset;
            const url = assetUrl(key);
            if (element.tagName === 'IMG') {
                element.alt = branding.identity?.brandName || FALLBACK.identity.brandName;
                element.hidden = !url;
                if (url && element.src !== new URL(url, window.location.href).href) {
                    element.src = url;
                    element.dataset.brandLoadedUrl = url;
                }
                element.onerror = () => { element.hidden = true; element.closest('[data-brand-logo-shell]')?.querySelector('[data-brand-logo-fallback]')?.removeAttribute('hidden'); };
                element.onload = () => element.closest('[data-brand-logo-shell]')?.querySelector('[data-brand-logo-fallback]')?.setAttribute('hidden', '');
            } else if (url) {
                element.style.backgroundImage = `url("${url.replaceAll('"', '\\"')}")`;
            }
        });
        document.querySelectorAll('[data-brand-logo-fallback]').forEach((element) => {
            element.textContent = (branding.identity?.shortName || FALLBACK.identity.shortName).trim().charAt(0) || 'ج';
            const shell = element.closest('[data-brand-logo-shell]');
            const image = shell?.querySelector('img[data-brand-logo]');
            if (image) element.hidden = Boolean(image.src && !image.hidden && image.dataset.brandLoadedUrl);
        });
        document.title = `${brandName} | إدارة الجيم`;
        document.querySelectorAll('.auth-branding-copy').forEach((element) => { element.hidden = branding.login?.showBrandCopy === false; });
        root.style.setProperty('--brand-login-background', branding.login?.backgroundColor || FALLBACK.login.backgroundColor);
        root.style.setProperty('--brand-login-gradient-start', branding.login?.gradientStart || FALLBACK.login.gradientStart);
        root.style.setProperty('--brand-login-gradient-end', branding.login?.gradientEnd || FALLBACK.login.gradientEnd);
        root.style.setProperty('--brand-login-overlay-opacity', String(branding.login?.overlayOpacity || FALLBACK.login.overlayOpacity));
        const loginUrl = assetUrl('loginBackground');
        if (loginUrl) root.style.setProperty('--brand-login-image', `url("${loginUrl.replaceAll('"', '\\"')}")`);
        else root.style.removeProperty('--brand-login-image');
        const favicon = assetUrl('favicon') || assetUrl('compactLogo');
        if (favicon) document.querySelectorAll('link[rel~="icon"], link[rel="shortcut icon"]').forEach((link) => { link.href = favicon; });
        document.querySelector('meta[name="theme-color"]')?.setAttribute('content', branding.themes?.[currentTheme()]?.background || '#F5F7FB');
    }

    function apply(nextBranding = branding, nextVersion = version) {
        branding = merge(FALLBACK, nextBranding || {});
        version = Number(nextVersion || 1);
        applyTokens(branding, currentTheme());
        applyTextAndAssets();
        root.dataset.brandVersion = String(version);
        window.dispatchEvent(new CustomEvent('topgym:brandingchange', { detail: { branding: clone(branding), version } }));
    }

    function requestedScope(options = {}) {
        const explicitScope = String(options?.scope || '').trim().toLowerCase();
        if (explicitScope === 'platform' || explicitScope === 'tenant') return explicitScope;
        return document.body?.dataset?.brandingEntry === 'saas' ? 'platform' : 'tenant';
    }

    async function refresh(options = {}) {
        const scope = requestedScope(options);
        try {
            const hint = scope === 'tenant' ? tenantHint() : '';
            const endpoint = scope === 'platform'
                ? '/api/branding?scope=platform'
                : hint ? `/api/branding?tenant=${encodeURIComponent(hint)}` : '/api/branding';
            const response = await window.fetch(endpoint, { credentials: 'same-origin', cache: 'no-store' });
            if (!response.ok) throw new Error(`Branding request failed (${response.status})`);
            const data = await response.json();
            if (data?.branding) {
                apply(data.branding, data.version || 1);
            }
        } catch (_) {
            // Never keep a previous tenant's identity as the anonymous/platform
            // fallback. A failed platform request must remain on the safe
            // default until the authenticated tenant is resolved.
            apply(scope === 'platform' ? FALLBACK : branding, scope === 'platform' ? 1 : version);
        }
        return { branding: clone(branding), version, scope };
    }

    window.topGymBranding = Object.freeze({
        get: () => clone(branding),
        getVersion: () => version,
        refresh,
        apply: (config, nextVersion) => apply(config, nextVersion),
        fallback: () => clone(FALLBACK),
        assetUrl
    });

    window.addEventListener('topgym:themechange', () => { applyTokens(branding, currentTheme()); applyTextAndAssets(); });
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => { apply(); void refresh(); }, { once: true });
    else { apply(); void refresh(); }
})();
