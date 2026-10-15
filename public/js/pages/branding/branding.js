(() => {
    'use strict';

    if (window.__topGymBrandingEditorLoaded) return;
    window.__topGymBrandingEditorLoaded = true;

    const page = document.getElementById('brandingSection');
    if (!page) return;

    const $ = (id) => document.getElementById(id);
    const fallback = window.topGymBranding?.fallback?.() || {};
    const state = {
        draft: null,
        published: null,
        originalDraft: null,
        version: 1,
        metadata: null,
        audit: [],
        dirty: false,
        busy: false,
        initialized: false,
        previewTheme: 'light',
        previewSize: 'desktop',
        activeSection: 'identity',
        pendingPublish: false,
        serverValidation: null,
        statusKey: 'status.published',
        statusParams: { brand: 'Logic Fit' }
    };

    const IDENTITY_FIELDS = {
        brandingBrandName: 'brandName',
        brandingEnglishName: 'englishBrandName',
        brandingShortName: 'shortName',
        brandingCompanyName: 'companyName',
        brandingDescription: 'description',
        brandingWelcomeTitle: 'welcomeTitle',
        brandingWelcomeSubtitle: 'welcomeSubtitle',
        brandingCopyrightText: 'copyrightText'
    };
    const DOCUMENT_FIELDS = {
        brandingDocumentPhone: 'phone',
        brandingDocumentEmail: 'email',
        brandingDocumentAddress: 'address',
        brandingDocumentWebsite: 'website',
        brandingDocumentFooter: 'footer',
        brandingDocumentWatermark: 'watermark',
        brandingDocumentSignature: 'signature',
        brandingDocumentStamp: 'stamp'
    };
    const TYPOGRAPHY_FIELDS = {
        brandingBodyFont: 'bodyFont',
        brandingHeadingFont: 'headingFont',
        brandingBaseFontSize: 'baseFontSize',
        brandingHeadingWeight: 'headingWeight'
    };
    const LOGIN_FIELDS = {
        brandingLoginBackgroundColor: 'backgroundColor',
        brandingLoginGradientStart: 'gradientStart',
        brandingLoginGradientEnd: 'gradientEnd',
        brandingLoginOverlay: 'overlayOpacity',
        brandingLoginShowIllustration: 'showIllustration',
        brandingLoginShowBrandCopy: 'showBrandCopy'
    };
    const INTERFACE_FIELDS = {
        brandingRadius: 'radius',
        brandingCardStyle: 'cardStyle',
        brandingShadow: 'shadow',
        brandingSidebarStyle: 'sidebar',
        brandingActiveStyle: 'activeStyle'
    };
    const TOKEN_DEFINITIONS = [
        'primary', 'primaryHover', 'primaryActive', 'onPrimary', 'secondary', 'accent', 'background', 'surface', 'surfaceSecondary',
        'card', 'cardHover', 'elevated', 'sidebar', 'header', 'textPrimary', 'textSecondary', 'textMuted', 'textDisabled',
        'border', 'borderSecondary', 'borderHover', 'inputBackground', 'tableHeader', 'scrollbarTrack', 'scrollbarThumb', 'success', 'warning', 'danger', 'info'
    ];
    const ASSET_DEFINITIONS = [
        ['primaryLogo', 'primaryLogo'], ['horizontalLogo', 'horizontalLogo'], ['lightLogo', 'lightLogo'], ['darkLogo', 'darkLogo'],
        ['compactLogo', 'compactLogo'], ['favicon', 'favicon'], ['appIcon', 'appIcon'], ['loginBackground', 'loginBackground'],
        ['loginIllustration', 'loginIllustration'], ['defaultAvatar', 'defaultAvatar'], ['printLogo', 'printLogo'], ['watermark', 'watermark']
    ];
    const AUDIT_LABEL_KEYS = { draft_saved: 'saved', published: 'published', reset: 'reset', asset_uploaded: 'uploaded', asset_removed: 'removed' };
    const DEFAULT_LOGO_URL = '/assets/logic-fit-app-icon.svg?v=2';
    const DEFAULT_ASSET_URLS = {
        primaryLogo: '/assets/logic-fit-logo-horizontal.svg?v=1',
        horizontalLogo: '/assets/logic-fit-logo-horizontal.svg?v=1',
        lightLogo: '/assets/logic-fit-logo-light.svg?v=1',
        darkLogo: '/assets/logic-fit-logo-dark.svg?v=1',
        compactLogo: DEFAULT_LOGO_URL,
        favicon: DEFAULT_LOGO_URL,
        appIcon: DEFAULT_LOGO_URL,
        printLogo: '/assets/logic-fit-logo-horizontal.svg?v=1'
    };

    function clone(value) {
        return JSON.parse(JSON.stringify(value));
    }

    function isObject(value) {
        return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
    }

    function merge(base, override) {
        const result = clone(base || {});
        if (!isObject(override)) return result;
        Object.entries(override).forEach(([key, value]) => {
            result[key] = isObject(value) && isObject(result[key]) ? merge(result[key], value) : value;
        });
        return result;
    }

    function config() {
        return state.draft || merge(fallback, {});
    }

    function setPath(path, value) {
        const parts = path.split('.');
        let target = state.draft;
        parts.slice(0, -1).forEach((part) => {
            if (!isObject(target[part])) target[part] = {};
            target = target[part];
        });
        target[parts.at(-1)] = value;
    }

    function getPath(source, path, defaultValue = '') {
        return path.split('.').reduce((value, part) => value?.[part], source) ?? defaultValue;
    }

    function escapeHtml(value) {
        return String(value ?? '').replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[character]));
    }

    function brandingText(key, params) {
        return window.TopGymI18n?.t?.(`branding.${key}`, params) || '';
    }

    function locale() {
        return window.TopGymI18n?.get?.() || document.documentElement.lang?.toLowerCase().startsWith('en') && 'en' || 'ar';
    }

    function setNodeText(element, key, params) {
        const value = brandingText(key, params);
        if (element && value) element.textContent = value;
    }

    function setControlLabel(id, key) {
        const control = $(id);
        const label = control?.closest('label') || (control?.id ? page.querySelector(`label[for="${CSS.escape(control.id)}"]`) : null);
        if (!label) return;
        const textNode = [...label.childNodes].find((node) => node.nodeType === Node.TEXT_NODE && node.nodeValue.trim());
        if (textNode) {
            let value = brandingText(key);
            if (/\s\*$/.test(textNode.nodeValue) && !/\s\*$/.test(value)) value += ' *';
            textNode.nodeValue = value;
        }
        else label.insertBefore(document.createTextNode(brandingText(key)), label.firstChild);
    }

    function setOptionLabels(id, valueKeys) {
        const select = $(id);
        if (!select) return;
        [...select.options].forEach((option) => {
            const key = valueKeys[option.value];
            if (key) option.textContent = brandingText(key);
        });
    }

    function applyBrandingLocale() {
        if (!window.TopGymI18n?.t) return;
        const setText = (selector, key) => {
            const element = page.querySelector(selector);
            const value = brandingText(key);
            if (element && value) element.textContent = value;
        };
        setText('.branding-page-head .branding-eyebrow', 'page.eyebrow');
        setText('#brandingPageTitle', 'page.title');
        setText('.branding-page-head p', 'page.description');
        const panelTitles = {
            identity: 'identity', assets: 'assets', light: 'light', dark: 'dark', typography: 'typography',
            login: 'login', interface: 'interface', documents: 'documents'
        };
        Object.entries(panelTitles).forEach(([panelName, key]) => {
            const panel = page.querySelector(`[data-branding-panel="${panelName}"]`);
            if (panel) {
                setNodeText(panel.querySelector('.branding-section-head h3'), `panel.${key}.title`);
                setNodeText(panel.querySelector('.branding-section-head .branding-eyebrow'), `panel.${key}.eyebrow`);
            }
        });
        setNodeText($('brandingPaymentMethodsTitle'), 'payments.title');
        setNodeText($('brandingPreviewTitle'), 'preview.title');
        setNodeText($('brandingAuditTitle'), 'audit.title');
        setNodeText(page.querySelector('[data-branding-panel="identity"] > .branding-section-head p'), 'identity.description');
        setNodeText(page.querySelector('[data-branding-panel="identity"] .branding-payment-panel-head .branding-eyebrow'), 'payments.eyebrow');
        setNodeText(page.querySelector('[data-branding-panel="identity"] .branding-payment-panel-actions [data-page-tab-link="member-payment-methods"]'), 'payments.open');
        setNodeText(page.querySelector('[data-branding-panel="identity"] .branding-inline-note span'), 'identity.defaultsNote');
        setNodeText(page.querySelector('[data-branding-panel="assets"] .branding-section-head p'), 'assets.description');
        setNodeText(page.querySelector('[data-branding-panel="assets"] > .branding-hint'), 'assets.limit');
        setNodeText(page.querySelector('[data-branding-panel="light"] .branding-section-head p'), 'theme.light.description');
        setNodeText(page.querySelector('[data-branding-panel="dark"] .branding-section-head p'), 'theme.dark.description');
        setNodeText(page.querySelector('[data-branding-panel="typography"] .branding-section-head p'), 'typography.description');
        setNodeText(page.querySelector('[data-branding-panel="typography"] > .branding-hint'), 'typography.fallback');
        setNodeText(page.querySelector('[data-branding-panel="login"] .branding-section-head p'), 'login.description');
        setNodeText(page.querySelector('[data-branding-panel="login"] .branding-inline-note span'), 'login.note');
        setNodeText(page.querySelector('[data-branding-panel="interface"] .branding-section-head p'), 'interface.description');
        setNodeText(page.querySelector('[data-branding-panel="interface"] .branding-inline-note span'), 'interface.note');
        setNodeText(page.querySelector('[data-branding-panel="documents"] .branding-section-head p'), 'documents.description');
        setNodeText(page.querySelector('[data-branding-panel="documents"] .branding-inline-note span'), 'documents.note');
        setNodeText(page.querySelector('.branding-preview-head .branding-preview-kicker'), 'preview.kicker');
        setNodeText(page.querySelector('.branding-preview-head p'), 'preview.description');
        setNodeText(page.querySelector('.branding-audit-card .branding-section-head p'), 'audit.description');
        setNodeText(page.querySelector('.branding-audit-card .branding-eyebrow'), 'audit.kicker');

        const fieldKeys = {
            ...Object.fromEntries(Object.keys(IDENTITY_FIELDS).map((id) => [id, `identity.label.${IDENTITY_FIELDS[id] === 'brandName' ? 'brand' : IDENTITY_FIELDS[id] === 'englishBrandName' ? 'english' : IDENTITY_FIELDS[id] === 'shortName' ? 'short' : IDENTITY_FIELDS[id] === 'companyName' ? 'company' : IDENTITY_FIELDS[id] === 'welcomeTitle' ? 'welcomeTitle' : IDENTITY_FIELDS[id] === 'welcomeSubtitle' ? 'welcomeSubtitle' : IDENTITY_FIELDS[id] === 'copyrightText' ? 'copyright' : 'description'}`])),
            brandingDocumentPhone: 'documents.phone', brandingDocumentEmail: 'documents.email', brandingDocumentAddress: 'documents.address',
            brandingDocumentWebsite: 'documents.website', brandingDocumentFooter: 'documents.footer', brandingDocumentWatermark: 'documents.watermark',
            brandingDocumentSignature: 'documents.signature', brandingDocumentStamp: 'documents.stamp', brandingBodyFont: 'typography.body',
            brandingHeadingFont: 'typography.heading', brandingBaseFontSize: 'typography.size', brandingHeadingWeight: 'typography.weight',
            brandingLoginBackgroundColor: 'login.background', brandingLoginGradientStart: 'login.gradientStart', brandingLoginGradientEnd: 'login.gradientEnd',
            brandingLoginOverlay: 'login.overlay', brandingRadius: 'interface.radius', brandingCardStyle: 'interface.cards', brandingShadow: 'interface.shadows',
            brandingSidebarStyle: 'interface.sidebar', brandingActiveStyle: 'interface.active'
        };
        Object.entries(fieldKeys).forEach(([id, key]) => setControlLabel(id, key));
        setNodeText($('brandingLoginShowIllustration')?.closest('label')?.querySelector('span'), 'login.showIllustration');
        setNodeText($('brandingLoginShowBrandCopy')?.closest('label')?.querySelector('span'), 'login.showCopy');
        setOptionLabels('brandingHeadingWeight', { 600: 'typography.weight.medium', 700: 'typography.weight.bold', 800: 'typography.weight.extraBold' });
        setOptionLabels('brandingShadow', { none: 'interface.shadow.none', soft: 'interface.shadow.soft', medium: 'interface.shadow.medium' });
        setOptionLabels('brandingRadius', { sharp: 'interface.radius.sharp', small: 'interface.radius.small', medium: 'interface.radius.medium', large: 'interface.radius.large' });
        setOptionLabels('brandingCardStyle', { flat: 'interface.cards.flat', border: 'interface.cards.border', 'soft-shadow': 'interface.cards.softShadow' });
        setOptionLabels('brandingSidebarStyle', { brand: 'interface.sidebar.brand', light: 'interface.sidebar.light', dark: 'interface.sidebar.dark', auto: 'interface.sidebar.auto' });
        setOptionLabels('brandingActiveStyle', { background: 'interface.active.background', indicator: 'interface.active.indicator', pill: 'interface.active.pill' });

        setNodeText(page.querySelector('[data-branding-panel="identity"] .branding-payment-panel-head p'), 'payments.description');
        setNodeText(page.querySelector('[data-branding-panel="identity"] .branding-payment-panel > .branding-hint'), 'payments.notice');
        const editor = page.querySelector('.branding-editor-card');
        const editorLabel = brandingText('editor.aria');
        if (editor && editorLabel) editor.setAttribute('aria-label', editorLabel);
        const sectionNav = page.querySelector('.branding-editor-nav');
        const sectionNavLabel = brandingText('editor.sections.aria');
        if (sectionNav && sectionNavLabel) sectionNav.setAttribute('aria-label', sectionNavLabel);

        const sectionKeys = {
            identity: 'section.identity', assets: 'section.assets', light: 'section.light', dark: 'section.dark',
            typography: 'section.typography', login: 'section.login', interface: 'section.interface', documents: 'section.documents'
        };
        page.querySelectorAll('[data-branding-section]').forEach((button) => {
            const label = button.querySelector('span');
            const value = brandingText(sectionKeys[button.dataset.brandingSection]);
            if (label && value) {
                label.textContent = value;
                button.setAttribute('aria-label', value);
                button.title = value;
            }
        });

        const actionLabels = {
            brandingDiscardButton: 'actions.discard', brandingResetButton: 'actions.reset',
            brandingSaveDraftButton: 'actions.save', brandingPublishButton: 'actions.publish'
        };
        Object.entries(actionLabels).forEach(([id, key]) => {
            const button = $(id);
            const busyKey = button?.dataset.brandingBusyLabelKey;
            const value = brandingText(busyKey || key);
            if (button && value) {
                button.textContent = value;
                button.setAttribute('aria-label', value);
                button.title = value;
            }
        });
        const addPayment = $('brandingAddPaymentMethod');
        if (addPayment) {
            addPayment.textContent = brandingText('payments.add');
            addPayment.setAttribute('aria-label', brandingText('payments.add'));
            addPayment.title = brandingText('payments.add');
        }
        const titleKey = state.dirty ? 'actions.title.dirty' : state.pendingPublish ? 'actions.title.pending' : 'actions.title.clean';
        const hintKey = state.dirty || state.pendingPublish ? 'actions.hint.dirty' : 'actions.hint.clean';
        const actionTitle = $('brandingActionTitle');
        const actionHint = $('brandingActionHint');
        if (actionTitle) actionTitle.textContent = brandingText(titleKey) || actionTitle.textContent;
        if (actionHint) actionHint.textContent = brandingText(hintKey) || actionHint.textContent;
        const previewThemeGroup = page.querySelector('.branding-preview-toolbar .branding-preview-switch:first-child');
        const previewSizeGroup = page.querySelector('.branding-preview-toolbar .branding-preview-switch:nth-child(2)');
        if (previewThemeGroup) previewThemeGroup.setAttribute('aria-label', brandingText('preview.theme.aria'));
        if (previewSizeGroup) previewSizeGroup.setAttribute('aria-label', brandingText('preview.size.aria'));
        setText('[data-branding-preview-theme="light"]', 'preview.theme.light');
        setText('[data-branding-preview-theme="dark"]', 'preview.theme.dark');
        setText('[data-branding-preview-size="desktop"]', 'preview.size.desktop');
        setText('[data-branding-preview-size="mobile"]', 'preview.size.mobile');
        page.querySelectorAll('[data-branding-preview-theme], [data-branding-preview-size]').forEach((button) => {
            const key = button.dataset.brandingPreviewTheme
                ? `preview.theme.${button.dataset.brandingPreviewTheme}`
                : `preview.size.${button.dataset.brandingPreviewSize}`;
            const label = brandingText(key);
            button.setAttribute('aria-label', label);
            button.title = label;
        });

        renderPaymentMethods();
        renderAssets();
        renderTokens('light');
        renderTokens('dark');
        renderValidation(state.serverValidation);
        renderAudit();
        updateVersionMeta();
        renderPreview();
        setStatus(state.statusKey, state.statusParams, state.dirty || state.pendingPublish);
    }

    function showToast(icon, titleKey, detailKey = '') {
        const title = brandingText(titleKey) || titleKey;
        const text = brandingText(detailKey);
        if (window.Swal) {
            window.Swal.fire({ toast: true, position: 'top-start', icon, title, text, showConfirmButton: false, timer: icon === 'error' ? 5200 : 3400, timerProgressBar: true, customClass: { popup: 'top-gym-alert top-gym-toast' } });
            return;
        }
        const status = $('brandingStatusCopy');
        if (status) status.textContent = text ? `${title} · ${text}` : title;
    }

    function setStatus(key, params = {}, dirty = state.dirty) {
        state.statusKey = key;
        state.statusParams = params;
        const status = $('brandingStatusCopy');
        const actionTitle = $('brandingActionTitle');
        const actionHint = $('brandingActionHint');
        if (status) {
            status.textContent = brandingText(key, params) || key;
            status.classList.toggle('is-dirty', dirty);
        }
        const titleKey = state.dirty ? 'actions.title.dirty' : state.pendingPublish ? 'actions.title.pending' : 'actions.title.clean';
        const hintKey = state.dirty || state.pendingPublish ? 'actions.hint.dirty' : 'actions.hint.clean';
        if (actionTitle) actionTitle.textContent = brandingText(titleKey) || actionTitle.textContent;
        if (actionHint) actionHint.textContent = brandingText(hintKey) || actionHint.textContent;
    }

    function setBusy(button, busy, labelKey) {
        if (!button) return;
        button.disabled = busy;
        if (busy) {
            button.dataset.brandingBusyLabelKey = labelKey;
            button.textContent = brandingText(labelKey);
        } else if (button.dataset.brandingBusyLabelKey) {
            delete button.dataset.brandingBusyLabelKey;
            applyBrandingLocale();
        }
    }

    function markDirty(key = 'status.changed', params = {}) {
        state.dirty = true;
        setStatus(key, params, true);
        renderValidation();
        renderPreview();
    }

    function setField(id, value) {
        const element = $(id);
        if (!element) return;
        if (element.type === 'checkbox') element.checked = Boolean(value);
        else element.value = value ?? '';
    }

    function paymentMethods() {
        const current = config();
        if (!isObject(current.identity)) current.identity = {};
        if (!Array.isArray(current.identity.paymentMethods)) current.identity.paymentMethods = [];
        return current.identity.paymentMethods;
    }

    function renderPaymentMethods() {
        const container = $('brandingPaymentMethods');
        if (!container) return;
        const methods = paymentMethods();
        if (!methods.length) {
            container.innerHTML = `<div class="branding-payment-empty"><strong>${escapeHtml(brandingText('payment.empty.title'))}</strong><span>${escapeHtml(brandingText('payment.empty.body'))}</span></div>`;
            return;
        }
        container.innerHTML = methods.map((method, index) => {
            const value = (key) => escapeHtml(method?.[key] ?? '');
            const checked = method?.isActive !== false ? ' checked' : '';
            const number = window.TopGymI18n?.format?.('number', index + 1) ?? index + 1;
            const removeLabel = brandingText('payment.remove');
            return `<article class="branding-payment-row" data-branding-payment-row="${index}">
                <div class="branding-payment-row-head"><strong>${escapeHtml(brandingText('payment.method', { count: number }))}</strong><button class="btn btn-danger btn-small" type="button" data-branding-payment-remove="${index}" aria-label="${escapeHtml(removeLabel)}" title="${escapeHtml(removeLabel)}">${escapeHtml(removeLabel)}</button></div>
                <div class="branding-payment-fields">
                    <div class="field"><label>${escapeHtml(brandingText('payment.name'))} <span aria-hidden="true">*</span><input data-branding-payment-field="name" data-branding-payment-index="${index}" value="${value('name')}" maxlength="120" required placeholder="${escapeHtml(brandingText('payment.name.placeholder'))}"></label></div>
                    <div class="field"><label>${escapeHtml(brandingText('payment.reference'))} <span aria-hidden="true">*</span><input data-branding-payment-field="accountReference" data-branding-payment-index="${index}" value="${value('accountReference')}" maxlength="160" dir="ltr" required placeholder="${escapeHtml(brandingText('payment.reference.placeholder'))}"></label></div>
                    <div class="field"><label>${escapeHtml(brandingText('payment.recipient'))}<input data-branding-payment-field="recipientName" data-branding-payment-index="${index}" value="${value('recipientName')}" maxlength="160"></label></div>
                    <div class="field"><label>${escapeHtml(brandingText('payment.sortOrder'))}<input data-branding-payment-field="sortOrder" data-branding-payment-index="${index}" value="${value('sortOrder')}" type="number" min="0" max="999" step="1"></label></div>
                    <div class="field field-full"><label>${escapeHtml(brandingText('payment.instructions'))}<textarea data-branding-payment-field="instructions" data-branding-payment-index="${index}" maxlength="1000" rows="2" placeholder="${escapeHtml(brandingText('payment.instructions.placeholder'))}"></textarea></label></div>
                </div>
                <label class="checkbox-field branding-payment-active"><input type="checkbox" data-branding-payment-field="isActive" data-branding-payment-index="${index}"${checked}><span>${escapeHtml(brandingText('payment.active'))}</span></label>
            </article>`;
        }).join('');
        [...container.querySelectorAll('[data-branding-payment-field="instructions"]')].forEach((field, index) => {
            field.value = methods[index]?.instructions ?? '';
        });
    }

    function renderForm() {
        const current = config();
        Object.entries(IDENTITY_FIELDS).forEach(([id, key]) => setField(id, current.identity?.[key]));
        Object.entries(DOCUMENT_FIELDS).forEach(([id, key]) => setField(id, current.documents?.[key]));
        Object.entries(TYPOGRAPHY_FIELDS).forEach(([id, key]) => setField(id, current.typography?.[key]));
        Object.entries(LOGIN_FIELDS).forEach(([id, key]) => setField(id, current.login?.[key]));
        Object.entries(INTERFACE_FIELDS).forEach(([id, key]) => setField(id, current.interface?.[key]));
        renderPaymentMethods();
        const overlayValue = $('brandingLoginOverlayValue');
        if (overlayValue) overlayValue.textContent = `${Math.round(Number(current.login?.overlayOpacity || 0.72) * 100)}%`;
    }

    function hexToRgb(value) {
        const match = String(value || '').trim().match(/^#([\da-f]{6})$/i);
        if (!match) return null;
        const hex = match[1];
        return { r: parseInt(hex.slice(0, 2), 16), g: parseInt(hex.slice(2, 4), 16), b: parseInt(hex.slice(4, 6), 16) };
    }

    function contrast(first, second) {
        const one = hexToRgb(first);
        const two = hexToRgb(second);
        if (!one || !two) return 0;
        const luminance = (rgb) => {
            const channel = (value) => {
                const normalized = value / 255;
                return normalized <= 0.03928 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
            };
            return 0.2126 * channel(rgb.r) + 0.7152 * channel(rgb.g) + 0.0722 * channel(rgb.b);
        };
        const firstLuminance = luminance(one);
        const secondLuminance = luminance(two);
        return (Math.max(firstLuminance, secondLuminance) + 0.05) / (Math.min(firstLuminance, secondLuminance) + 0.05);
    }

    function renderValidation(serverValidation = state.serverValidation) {
        const box = $('brandingValidation');
        if (!box) return;
        state.serverValidation = serverValidation;
        const current = config();
        const errors = [];
        const warnings = [];
        if (!String(current.identity?.brandName || '').trim()) errors.push(brandingText('validation.brandRequired'));
        ['light', 'dark'].forEach((themeName) => {
            const theme = current.themes?.[themeName] || {};
            const localizedTheme = brandingText(`theme.${themeName}.name`);
            if (contrast(theme.textPrimary, theme.background) < 4.5) errors.push(brandingText('validation.textContrast', { theme: localizedTheme }));
            if (contrast(theme.onPrimary, theme.primary) < 4.5) errors.push(brandingText('validation.primaryContrast', { theme: localizedTheme }));
            if (contrast(theme.textSecondary, theme.background) < 3) warnings.push(brandingText('validation.secondaryContrast', { theme: localizedTheme }));
        });
        (serverValidation?.errors || []).forEach((item) => { if (!errors.includes(item.message)) errors.push(item.message); });
        (serverValidation?.warnings || []).forEach((item) => { if (!warnings.includes(item.message)) warnings.push(item.message); });
        if (!errors.length && !warnings.length) {
            box.hidden = false;
            box.className = 'branding-validation is-success';
            box.innerHTML = `<strong>${escapeHtml(brandingText('validation.ready.title'))}</strong><span>${escapeHtml(brandingText('validation.ready.body'))}</span>`;
            return;
        }
        box.hidden = false;
        box.className = `branding-validation ${errors.length ? 'is-error' : 'is-warning'}`;
        const count = window.TopGymI18n?.format?.('number', errors.length) ?? errors.length;
        box.innerHTML = `${errors.length ? `<strong>${escapeHtml(brandingText('validation.errors', { count }))}</strong><ul>${errors.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>` : ''}${warnings.length ? `<strong>${escapeHtml(brandingText('validation.warnings'))}</strong><ul>${warnings.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>` : ''}`;
    }

    function renderTokens(themeName) {
        const container = $(`branding${themeName[0].toUpperCase()}${themeName.slice(1)}Tokens`);
        if (!container) return;
        const theme = config().themes?.[themeName] || {};
        container.innerHTML = TOKEN_DEFINITIONS.map((key) => {
            const value = /^#[\da-f]{6}$/i.test(String(theme[key] || '')) ? theme[key] : '#000000';
            const label = brandingText(`tokens.${key}`);
            const colorLabel = brandingText('tokens.hexValue', { label });
            return `<div class="branding-color-field"><label for="branding-${themeName}-${key}">${escapeHtml(label)}<code>${escapeHtml(key)}</code></label><div class="branding-color-control"><input id="branding-${themeName}-${key}" type="color" value="${value}" data-branding-color="${themeName}" data-branding-token="${key}" aria-label="${escapeHtml(label)}"><input type="text" value="${escapeHtml(value)}" maxlength="7" inputmode="text" dir="ltr" data-branding-color-text="${themeName}" data-branding-token="${key}" aria-label="${escapeHtml(colorLabel)}"></div></div>`;
        }).join('');
    }

    function renderAssets() {
        const container = $('brandingAssetGrid');
        if (!container) return;
        const current = config();
        container.innerHTML = ASSET_DEFINITIONS.map(([key, labelKey]) => {
            const asset = current.assets?.[key];
            const url = asset?.url || DEFAULT_ASSET_URLS[key] || '';
            const label = brandingText(`asset.${labelKey}`);
            const hint = brandingText(`asset.${labelKey}.hint`);
            const preview = url ? `<img src="${escapeHtml(url)}" alt="${escapeHtml(label)}" loading="lazy" decoding="async">` : `<span>${escapeHtml(current.identity?.shortName?.trim()?.charAt(0) || brandingText('asset.preview.initialFallback'))}</span>`;
            const uploaded = brandingText('asset.uploaded');
            const defaultState = brandingText('asset.defaultActive');
            const upload = brandingText('asset.upload');
            const remove = brandingText('asset.remove');
            return `<article class="branding-asset-card"><div class="branding-asset-preview ${url ? 'has-asset' : ''}">${preview}</div><div class="branding-asset-copy"><strong>${escapeHtml(label)}</strong><small>${escapeHtml(hint)}</small>${asset ? `<em>${escapeHtml(asset.fileName || uploaded)} · ${Number(asset.width || 0)}×${Number(asset.height || 0)}</em>` : `<em>${escapeHtml(defaultState)}</em>`}</div><div class="branding-asset-actions"><input id="branding-file-${key}" type="file" accept="image/*" data-branding-file="${key}" hidden><button class="btn btn-light btn-small" type="button" data-branding-file-trigger="${key}">${escapeHtml(upload)}</button>${asset ? `<button class="btn btn-danger btn-small" type="button" data-branding-remove="${key}" aria-label="${escapeHtml(remove)}" title="${escapeHtml(remove)}">${escapeHtml(remove)}</button>` : ''}</div></article>`;
        }).join('');
    }

    function comparable(source) {
        const value = clone(source || {});
        value.assets = Object.fromEntries(ASSET_DEFINITIONS.map(([key]) => [key, value.assets?.[key]?.key || null]));
        return value;
    }

    function draftsDiffer() {
        return JSON.stringify(comparable(state.draft)) !== JSON.stringify(comparable(state.published));
    }

    function renderAudit() {
        const container = $('brandingAuditList');
        if (!container) return;
        const rows = (state.audit || []).map((item) => {
            const actionKey = AUDIT_LABEL_KEYS[item.action];
            const action = actionKey ? brandingText(`audit.${actionKey}`) : brandingText('audit.operation');
            const date = item.createdAt ? new Date(item.createdAt).toLocaleString(locale() === 'en' ? 'en' : 'ar-EG') : brandingText('audit.dash');
            const actor = item.actorUserId ? brandingText('audit.account', { id: item.actorUserId }) : brandingText('audit.system');
            const detail = item.details || (item.version ? brandingText('audit.version', { version: item.version }) : '');
            return `<div class="branding-audit-row"><strong>${escapeHtml(action)}</strong><span>${escapeHtml(date)} · ${escapeHtml(actor)}</span><small>${escapeHtml(detail)}</small></div>`;
        }).join('');
        container.innerHTML = rows || `<p class="branding-hint">${escapeHtml(brandingText('audit.empty'))}</p>`;
    }

    function renderPreview() {
        const frame = $('brandingPreviewFrame');
        if (!frame) return;
        const current = config();
        const theme = current.themes?.[state.previewTheme] || fallback.themes?.[state.previewTheme] || {};
        const properties = { background: 'background', surface: 'surface', card: 'card', cardHover: 'cardHover', sidebar: 'sidebar', primary: 'primary', primaryHover: 'primaryHover', onPrimary: 'onPrimary', sidebarText: 'onPrimary', text: 'textPrimary', muted: 'textMuted', border: 'border', soft: 'primarySoft' };
        Object.entries(properties).forEach(([property, key]) => frame.style.setProperty(`--preview-${property}`, theme[key] || 'transparent'));
        frame.classList.toggle('is-mobile', state.previewSize === 'mobile');
        frame.dataset.previewTheme = state.previewTheme;
        const name = $('brandingPreviewName');
        const welcome = $('brandingPreviewWelcome');
        if (name) name.textContent = current.identity?.brandName || 'Logic Fit';
        if (welcome) welcome.textContent = current.identity?.welcomeSubtitle || brandingText('preview.welcomeFallback');
        const previewText = (selector, key) => setNodeText(frame.querySelector(selector), key);
        [
            ['.branding-preview-sidebar .branding-preview-nav-item:nth-of-type(1)', 'preview.nav.home'],
            ['.branding-preview-sidebar .branding-preview-nav-item:nth-of-type(2)', 'preview.nav.members'],
            ['.branding-preview-sidebar .branding-preview-nav-item:nth-of-type(3)', 'preview.nav.reports']
        ].forEach(([selector, key]) => previewText(selector, key));
        ['preview.metric.members', 'preview.metric.attendance', 'preview.metric.revenue'].forEach((key, index) => setNodeText(frame.querySelectorAll('.branding-preview-kpi span')[index], key));
        setNodeText(frame.querySelector('.branding-preview-card-sample header strong'), 'preview.sample.card');
        setNodeText(frame.querySelector('.branding-preview-card-sample header span'), 'preview.sample.today');
        setNodeText(frame.querySelector('.branding-preview-controls .branding-preview-button'), 'preview.sample.action');
        const previewInput = frame.querySelector('.branding-preview-input');
        if (previewInput) {
            const searchLabel = brandingText('preview.sample.search');
            previewInput.placeholder = searchLabel;
            if (searchLabel) previewInput.setAttribute('aria-label', searchLabel);
        }
        const rows = frame.querySelectorAll('.branding-preview-table-wrap tbody tr');
        rows.forEach((row, index) => {
            const cells = row.querySelectorAll('td');
            setNodeText(cells[0], `preview.sample.${index ? 'memberTwo' : 'memberOne'}`);
            setNodeText(cells[1]?.querySelector('.branding-preview-badge'), 'preview.sample.status');
            setNodeText(cells[2], `preview.sample.${index ? 'edit' : 'view'}`);
        });
        setNodeText(frame.querySelector('.branding-preview-modal > strong'), 'preview.sample.modal');
        setNodeText(frame.querySelector('.branding-preview-modal > p'), 'preview.sample.modalBody');
        setNodeText(frame.querySelector('.branding-preview-modal > .branding-preview-button'), 'preview.sample.confirm');
        const headers = frame.querySelectorAll('.branding-preview-table-wrap thead th');
        ['preview.table.member', 'preview.table.status', 'preview.table.action'].forEach((key, index) => setNodeText(headers[index], key));
        frame.querySelectorAll('.branding-preview-kpi strong').forEach((element, index) => {
            if (index === 2) {
                element.textContent = brandingText('preview.metric.revenueValue');
                return;
            }
            const numericText = String(element.textContent).replace(/[٠-٩]/gu, (digit) => String(digit.charCodeAt(0) - 0x0660));
            const numericValue = Number(numericText.replace(/[^\d.]/g, ''));
            if (Number.isFinite(numericValue) && numericValue) element.textContent = window.TopGymI18n?.format?.('number', numericValue) ?? String(numericValue);
        });
        const logoShell = document.querySelector('[data-branding-preview-logo]');
        const logo = current.assets?.primaryLogo?.url || current.assets?.horizontalLogo?.url || current.assets?.compactLogo?.url || DEFAULT_LOGO_URL;
        if (logoShell) {
            if (logo) logoShell.innerHTML = `<img src="${escapeHtml(logo)}" alt="${escapeHtml(current.identity?.brandName || 'Logic Fit')}">`;
            else logoShell.textContent = current.identity?.shortName?.trim()?.charAt(0) || 'ج';
        }
        document.querySelectorAll('[data-branding-preview-theme]').forEach((button) => button.classList.toggle('active', button.dataset.brandingPreviewTheme === state.previewTheme));
        document.querySelectorAll('[data-branding-preview-size]').forEach((button) => button.classList.toggle('active', button.dataset.brandingPreviewSize === state.previewSize));
    }

    function updateVersionMeta() {
        const element = $('brandingVersionMeta');
        if (!element) return;
        const publishedAt = state.metadata?.publishedAt
            ? new Date(state.metadata.publishedAt).toLocaleString(locale() === 'en' ? 'en' : 'ar-EG')
            : brandingText('version.unpublished');
        const version = window.TopGymI18n?.format?.('number', state.version) ?? state.version;
        element.textContent = `v${version}${brandingText('version.separator')}${publishedAt}`;
    }

    function renderAll(serverValidation = null) {
        state.serverValidation = serverValidation;
        renderForm();
        renderAssets();
        renderTokens('light');
        renderTokens('dark');
        renderValidation(serverValidation);
        renderAudit();
        updateVersionMeta();
        renderPreview();
        if (state.dirty) setStatus('status.changed', {}, true);
        else if (state.pendingPublish) setStatus('status.draft', { brand: config().identity?.brandName || 'Logic Fit' }, true);
        else setStatus('status.published', { brand: config().identity?.brandName || 'Logic Fit' }, false);
    }

    async function readError(response) {
        const data = await response.json().catch(() => ({}));
        return new Error(data.error || brandingText('error.operation'));
    }

    async function loadSettings() {
        if (!window.topGymAuth?.isOwner?.()) return false;
        try {
            const result = await window.topGymAuth.api('/api/branding/settings', { method: 'GET' });
            state.draft = merge(fallback, result.draft || {});
            state.published = merge(fallback, result.published || {});
            state.originalDraft = clone(state.draft);
            state.version = Number(result.version || 1);
            state.metadata = result.metadata || null;
            state.audit = result.audit || [];
            state.dirty = false;
            state.pendingPublish = draftsDiffer();
            state.initialized = true;
            renderAll(result.validation || null);
            return true;
        } catch (error) {
            showToast('error', 'error.load', 'error.retry');
            setStatus('error.loadDetail', {}, false);
            return false;
        }
    }

    function handleFormChange(target) {
        const id = target.id;
        if (IDENTITY_FIELDS[id]) setPath(`identity.${IDENTITY_FIELDS[id]}`, target.value);
        else if (DOCUMENT_FIELDS[id]) {
            const value = id === 'brandingDocumentPhone'
                ? (window.LogicFitPhoneInputs?.normalizeForTransport?.(target.value, target.dataset.phoneCountry || '') || target.value)
                : target.value;
            setPath(`documents.${DOCUMENT_FIELDS[id]}`, value);
        }
        else if (TYPOGRAPHY_FIELDS[id]) setPath(`typography.${TYPOGRAPHY_FIELDS[id]}`, target.type === 'number' ? Number(target.value) : target.value);
        else if (LOGIN_FIELDS[id]) setPath(`login.${LOGIN_FIELDS[id]}`, target.type === 'checkbox' ? target.checked : target.type === 'range' ? Number(target.value) : target.value);
        else if (INTERFACE_FIELDS[id]) setPath(`interface.${INTERFACE_FIELDS[id]}`, target.value);
        else return;
        if (id === 'brandingLoginOverlay') {
            const value = $('brandingLoginOverlayValue');
            if (value) value.textContent = `${Math.round(Number(target.value || 0) * 100)}%`;
        }
        markDirty();
    }

    function handlePaymentMethodChange(target) {
        const index = Number(target.dataset.brandingPaymentIndex);
        const field = target.dataset.brandingPaymentField;
        const methods = paymentMethods();
        if (!Number.isInteger(index) || index < 0 || index >= methods.length || !field) return;
        const value = target.type === 'checkbox' ? target.checked : target.type === 'number' ? Number(target.value) : target.value;
        methods[index][field] = field === 'sortOrder' && !Number.isFinite(value) ? index : value;
        markDirty();
    }

    function addPaymentMethod() {
        const methods = paymentMethods();
        methods.push({ id: '', name: '', accountReference: '', recipientName: '', instructions: '', isActive: true, sortOrder: methods.length });
        markDirty('status.addedPayment');
        renderPaymentMethods();
        document.querySelector('[data-branding-payment-field="name"][data-branding-payment-index="' + (methods.length - 1) + '"]')?.focus();
    }

    function removePaymentMethod(index) {
        const methods = paymentMethods();
        if (!Number.isInteger(index) || index < 0 || index >= methods.length) return;
        methods.splice(index, 1);
        markDirty('status.removedPayment');
        renderPaymentMethods();
    }

    function handleColorChange(target) {
        const themeName = target.dataset.brandingColor || target.dataset.brandingColorText;
        const token = target.dataset.brandingToken;
        if (!themeName || !token) return;
        const value = target.value.trim().toUpperCase();
        const valid = /^#[\da-f]{6}$/i.test(value);
        const textInput = [...document.querySelectorAll('[data-branding-color-text]')].find((element) => element.dataset.brandingColorText === themeName && element.dataset.brandingToken === token);
        const colorInput = [...document.querySelectorAll('[data-branding-color]')].find((element) => element.dataset.brandingColor === themeName && element.dataset.brandingToken === token);
        target.classList.toggle('is-invalid', !valid);
        if (!valid) return;
        setPath(`themes.${themeName}.${token}`, value);
        if (textInput && target !== textInput) textInput.value = value;
        if (colorInput && target !== colorInput) colorInput.value = value;
        markDirty();
    }

    function activateEditorSection(sectionName) {
        state.activeSection = sectionName;
        document.querySelectorAll('[data-branding-section]').forEach((button) => button.classList.toggle('active', button.dataset.brandingSection === sectionName));
        document.querySelectorAll('[data-branding-panel]').forEach((panel) => { panel.hidden = panel.dataset.brandingPanel !== sectionName; });
    }

    function readImageDimensions(file) {
        return new Promise((resolve) => {
            if (!file) return resolve({ width: 0, height: 0 });
            if (file.type === 'image/svg+xml') {
                const reader = new FileReader();
                reader.onload = () => {
                    const source = String(reader.result || '');
                    const viewBox = source.match(/viewBox\s*=\s*["']\s*[-+\d.]+\s+[-+\d.]+\s+([\d.]+)\s+([\d.]+)\s*["']/i);
                    const width = Number(source.match(/\bwidth\s*=\s*["']([\d.]+)/i)?.[1] || viewBox?.[1] || 0);
                    const height = Number(source.match(/\bheight\s*=\s*["']([\d.]+)/i)?.[1] || viewBox?.[2] || 0);
                    resolve({ width, height });
                };
                reader.onerror = () => resolve({ width: 0, height: 0 });
                reader.readAsText(file);
                return;
            }
            const url = URL.createObjectURL(file);
            const image = new Image();
            image.onload = () => { URL.revokeObjectURL(url); resolve({ width: image.naturalWidth, height: image.naturalHeight }); };
            image.onerror = () => { URL.revokeObjectURL(url); resolve({ width: 0, height: 0 }); };
            image.src = url;
        });
    }

    async function uploadAsset(file, key) {
        if (!file || state.busy) return;
        if (file.size > 2 * 1024 * 1024) {
            showToast('error', 'error.fileSize', 'error.fileLimit');
            return;
        }
        state.busy = true;
        const dimensions = await readImageDimensions(file);
        try {
            const response = await window.fetch('/api/branding/assets', {
                method: 'POST', credentials: 'same-origin', cache: 'no-store',
                headers: {
                    'Content-Type': 'application/octet-stream',
                    'X-Branding-Asset-Key': key,
                    'X-Branding-Asset-Mime': file.type || 'application/octet-stream',
                    'X-Branding-Asset-Name': file.name,
                    'X-Branding-Asset-Width': String(Math.round(dimensions.width || 0)),
                    'X-Branding-Asset-Height': String(Math.round(dimensions.height || 0))
                },
                body: file
            });
            if (!response.ok) throw await readError(response);
            const result = await response.json();
            state.draft.assets[key] = result.asset;
            const assetLabel = brandingText(`asset.${key}`) || brandingText('audit.operation');
            markDirty('status.savedAsset', { asset: assetLabel });
            renderAssets();
            showToast('success', 'success.assetUploaded', 'success.assetUploadedDetail');
        } catch {
            showToast('error', 'error.assetUpload', 'error.retry');
        } finally {
            state.busy = false;
        }
    }

    async function removeAsset(key) {
        if (state.busy) return;
        let confirmed = true;
        if (window.Swal) {
            const result = await window.Swal.fire({ position: 'center', icon: 'warning', title: brandingText('confirm.removeAsset.title'), text: brandingText('confirm.removeAsset.body'), showCancelButton: true, confirmButtonText: brandingText('confirm.removeAsset.confirm'), cancelButtonText: brandingText('confirm.removeAsset.cancel'), buttonsStyling: false, customClass: { popup: 'top-gym-alert', confirmButton: 'btn btn-danger', cancelButton: 'btn btn-light' } });
            confirmed = result.isConfirmed;
        } else confirmed = window.confirm(brandingText('confirm.removeAsset.fallback'));
        if (!confirmed) return;
        state.busy = true;
        try {
            const result = await window.topGymAuth.api(`/api/branding/assets/${encodeURIComponent(key)}`, { method: 'DELETE' });
            if (state.draft.assets) state.draft.assets[key] = null;
            markDirty('status.removedAsset');
            renderAssets();
            showToast('success', 'success.assetRemoved', result?.key ? 'success.assetRestored' : 'success.done');
        } catch {
            showToast('error', 'error.assetRemove', 'error.retry');
        } finally {
            state.busy = false;
        }
    }

    async function saveDraft(button = $('brandingSaveDraftButton')) {
        if (state.busy || !state.draft) return false;
        const phoneInput = $('brandingDocumentPhone');
        const phoneValidation = window.LogicFitPhoneInputs?.validateInput?.(phoneInput, { show: true });
        if (phoneValidation && !phoneValidation.valid) {
            phoneInput?.focus();
            showToast('error', 'error.phone');
            return false;
        }
        state.busy = true;
        setBusy(button, true, 'loading.save');
        try {
            const result = await window.topGymAuth.api('/api/branding/draft', { method: 'PUT', body: JSON.stringify({ config: state.draft }) });
            state.draft = merge(fallback, result.draft || state.draft);
            state.published = merge(fallback, result.published || state.published);
            state.originalDraft = clone(state.draft);
            state.version = Number(result.version || state.version);
            state.metadata = result.metadata || state.metadata;
            state.audit = result.audit || state.audit;
            state.dirty = false;
            state.pendingPublish = draftsDiffer();
            renderAll(result.validation || null);
            showToast('success', 'success.saved', 'success.savedDetail');
            return true;
        } catch {
            showToast('error', 'error.save', 'error.saveDetail');
            return false;
        } finally {
            state.busy = false;
            setBusy(button, false);
        }
    }

    async function publish(button = $('brandingPublishButton')) {
        if (state.busy || !state.draft) return;
        state.busy = true;
        setBusy(button, true, 'loading.publish');
        try {
            if (state.dirty) {
                state.busy = false;
                const saved = await saveDraft($('brandingSaveDraftButton'));
                if (!saved) return;
                state.busy = true;
            }
            const result = await window.topGymAuth.api('/api/branding/publish', { method: 'POST', body: JSON.stringify({}) });
            state.draft = merge(fallback, result.draft || state.draft);
            state.published = merge(fallback, result.published || state.published);
            state.originalDraft = clone(state.draft);
            state.version = Number(result.version || state.version);
            state.metadata = result.metadata || state.metadata;
            state.audit = result.audit || state.audit;
            state.dirty = false;
            state.pendingPublish = false;
            renderAll(result.validation || null);
            window.topGymBranding?.refresh?.();
            showToast('success', 'success.published', 'success.publishedDetail');
        } catch {
            showToast('error', 'error.publish', 'error.publishDetail');
        } finally {
            state.busy = false;
            setBusy(button, false);
        }
    }

    async function discard() {
        if (!state.originalDraft || state.busy) return;
        const loaded = await loadSettings();
        if (loaded) showToast('info', 'success.discarded', 'success.discardedDetail');
    }

    async function resetToDefault() {
        if (state.busy) return;
        let confirmed = false;
        if (window.Swal) {
            const result = await window.Swal.fire({ position: 'center', icon: 'warning', title: brandingText('confirm.reset.title'), html: `<p>${escapeHtml(brandingText('confirm.reset.body'))}</p>`, showCancelButton: true, confirmButtonText: brandingText('confirm.reset.confirm'), cancelButtonText: brandingText('confirm.cancel'), buttonsStyling: false, customClass: { popup: 'top-gym-alert', confirmButton: 'btn btn-danger', cancelButton: 'btn btn-light' } });
            confirmed = result.isConfirmed;
        } else confirmed = window.confirm(brandingText('confirm.reset.fallback'));
        if (!confirmed) return;
        const button = $('brandingResetButton');
        state.busy = true;
        setBusy(button, true, 'loading.resetting');
        try {
            const result = await window.topGymAuth.api('/api/branding/reset', { method: 'POST', body: JSON.stringify({}) });
            state.draft = merge(fallback, result.draft || fallback);
            state.published = merge(fallback, result.published || state.published);
            state.originalDraft = clone(state.draft);
            state.version = Number(result.version || state.version);
            state.metadata = result.metadata || state.metadata;
            state.audit = result.audit || state.audit;
            state.dirty = true;
            state.pendingPublish = true;
            renderAll(result.validation || null);
            setStatus('status.resetDraft', {}, true);
            showToast('success', 'success.reset', 'success.resetDetail');
        } catch {
            showToast('error', 'error.reset', 'error.retry');
        } finally {
            state.busy = false;
            setBusy(button, false);
        }
    }

    async function confirmLeave() {
        if (!state.dirty) return true;
        if (window.Swal) {
            const result = await window.Swal.fire({ position: 'center', icon: 'warning', title: brandingText('confirm.leave.title'), text: brandingText('confirm.leave.body'), showCancelButton: true, confirmButtonText: brandingText('confirm.leave.discard'), cancelButtonText: brandingText('confirm.leave.stay'), buttonsStyling: false, customClass: { popup: 'top-gym-alert', confirmButton: 'btn btn-danger', cancelButton: 'btn btn-light' } });
            if (!result.isConfirmed) return false;
        } else if (!window.confirm(brandingText('confirm.leave.fallback'))) return false;
        await discard();
        return true;
    }

    function bind() {
        if (page.dataset.brandingBound) return;
        page.dataset.brandingBound = 'true';
        page.addEventListener('input', (event) => {
            const target = event.target;
            if (target.matches('[data-branding-payment-field]')) handlePaymentMethodChange(target);
            else if (target.matches('[data-branding-color], [data-branding-color-text]')) handleColorChange(target);
            else handleFormChange(target);
        });
        page.addEventListener('change', (event) => {
            const target = event.target;
            if (target.matches('[data-branding-file]')) {
                void uploadAsset(target.files?.[0], target.dataset.brandingFile);
                target.value = '';
            } else if (target.matches('[data-branding-payment-field]')) handlePaymentMethodChange(target);
            else if (target.matches('[data-branding-color], [data-branding-color-text]')) handleColorChange(target);
            else handleFormChange(target);
        });
        page.addEventListener('click', (event) => {
            const fileTrigger = event.target.closest('[data-branding-file-trigger]');
            if (fileTrigger) {
                event.preventDefault();
                $(`branding-file-${fileTrigger.dataset.brandingFileTrigger}`)?.click();
                return;
            }
            const addPaymentButton = event.target.closest('#brandingAddPaymentMethod');
            if (addPaymentButton) { addPaymentMethod(); return; }
            const removePaymentButton = event.target.closest('[data-branding-payment-remove]');
            if (removePaymentButton) { removePaymentMethod(Number(removePaymentButton.dataset.brandingPaymentRemove)); return; }
            const sectionButton = event.target.closest('[data-branding-section]');
            if (sectionButton) activateEditorSection(sectionButton.dataset.brandingSection);
            const themeButton = event.target.closest('[data-branding-preview-theme]');
            if (themeButton) { state.previewTheme = themeButton.dataset.brandingPreviewTheme; renderPreview(); }
            const sizeButton = event.target.closest('[data-branding-preview-size]');
            if (sizeButton) { state.previewSize = sizeButton.dataset.brandingPreviewSize; renderPreview(); }
            const removeButton = event.target.closest('[data-branding-remove]');
            if (removeButton) void removeAsset(removeButton.dataset.brandingRemove);
        });
        $('brandingSaveDraftButton')?.addEventListener('click', () => void saveDraft());
        $('brandingPublishButton')?.addEventListener('click', () => void publish());
        $('brandingDiscardButton')?.addEventListener('click', () => void discard());
        $('brandingResetButton')?.addEventListener('click', () => void resetToDefault());
        window.addEventListener('beforeunload', (event) => {
            if (!state.dirty) return;
            event.preventDefault();
            event.returnValue = '';
        });
        window.addEventListener('topgym:brandingchange', () => { if (!state.dirty) renderPreview(); });
    }

    async function init() {
        if (state.initialized || !window.topGymAuth?.isOwner?.()) return;
        applyBrandingLocale();
        bind();
        await loadSettings();
    }

    window.addEventListener('topgym:localechange', applyBrandingLocale);

    window.topGymBrandingEditor = Object.freeze({
        hasUnsaved: () => state.dirty,
        confirmLeave
    });

    if (window.topGymAuthReady) window.topGymAuthReady.then(init).catch(() => null);
    else window.setTimeout(() => void init(), 0);
})();
