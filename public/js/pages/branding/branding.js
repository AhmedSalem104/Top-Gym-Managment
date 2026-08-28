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
        pendingPublish: false
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
        ['primary', 'Primary'], ['primaryHover', 'Primary Hover'], ['primaryActive', 'Primary Active'], ['onPrimary', 'نص الزر الأساسي'],
        ['secondary', 'Secondary'], ['accent', 'Accent'], ['background', 'خلفية التطبيق'], ['surface', 'Surface'], ['surfaceSecondary', 'سطح ثانوي'],
        ['card', 'خلفية البطاقات'], ['cardHover', 'بطاقة عند المرور'], ['elevated', 'عنصر مرتفع'], ['sidebar', 'القائمة الجانبية'], ['header', 'الشريط العلوي'],
        ['textPrimary', 'النص الأساسي'], ['textSecondary', 'النص الثانوي'], ['textMuted', 'النص الهادئ'], ['textDisabled', 'النص المعطل'],
        ['border', 'الحدود الأساسية'], ['borderSecondary', 'الحدود الهادئة'], ['borderHover', 'الحد عند المرور'], ['inputBackground', 'خلفية الحقول'],
        ['tableHeader', 'رأس الجدول'], ['scrollbarTrack', 'مسار التمرير'], ['scrollbarThumb', 'مقبض التمرير'], ['success', 'Success'],
        ['warning', 'Warning'], ['danger', 'Danger'], ['info', 'Info']
    ];
    const ASSET_DEFINITIONS = [
        ['primaryLogo', 'الشعار الأساسي', 'يظهر في الشريط العلوي والتقارير.'],
        ['horizontalLogo', 'الشعار الأفقي', 'نسخة كاملة للاستخدام في شاشة الدخول والمستندات.'],
        ['lightLogo', 'شعار الخلفية الداكنة', 'نسخة فاتحة للاستخدام فوق الأسطح الداكنة.'],
        ['darkLogo', 'شعار الخلفية الفاتحة', 'نسخة داكنة للاستخدام فوق الأسطح الفاتحة.'],
        ['compactLogo', 'الشعار المختصر', 'للـSidebar المغلق والأحجام الصغيرة.'],
        ['favicon', 'Favicon', 'أيقونة التبويب والمتصفح.'],
        ['appIcon', 'App Icon', 'أيقونة التطبيق عند التثبيت.'],
        ['loginBackground', 'خلفية تسجيل الدخول', 'صورة اختيارية لخلفية شاشة الدخول.'],
        ['loginIllustration', 'توضيح تسجيل الدخول', 'صورة اختيارية بجانب نموذج الدخول.'],
        ['defaultAvatar', 'الصورة الافتراضية', 'صورة بديلة للمشترك عند عدم وجود صورة.'],
        ['printLogo', 'شعار الطباعة', 'نسخة واضحة للمستندات وملفات PDF.'],
        ['watermark', 'Watermark', 'علامة مائية اختيارية للمستندات.']
    ];
    const AUDIT_LABELS = { draft_saved: 'حفظ مسودة', published: 'نشر الهوية', reset: 'استعادة الافتراضي', asset_uploaded: 'رفع أصل', asset_removed: 'إزالة أصل' };
    const DEFAULT_LOGO_URL = '/assets/gym-brand.svg?v=2';
    const DEFAULT_ASSET_URLS = {
        primaryLogo: '/assets/gym-brand-horizontal.svg?v=2',
        horizontalLogo: '/assets/gym-brand-horizontal.svg?v=2',
        lightLogo: '/assets/gym-brand-light.svg?v=2',
        darkLogo: '/assets/gym-brand-dark.svg?v=2',
        compactLogo: DEFAULT_LOGO_URL,
        favicon: DEFAULT_LOGO_URL,
        appIcon: DEFAULT_LOGO_URL,
        printLogo: '/assets/gym-brand-horizontal.svg?v=2'
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

    function showToast(icon, title, text = '') {
        if (window.Swal) {
            window.Swal.fire({ toast: true, position: 'top-start', icon, title, text, showConfirmButton: false, timer: icon === 'error' ? 5200 : 3400, timerProgressBar: true, customClass: { popup: 'top-gym-alert top-gym-toast' } });
            return;
        }
        const status = $('brandingStatusCopy');
        if (status) status.textContent = text ? `${title} · ${text}` : title;
    }

    function setStatus(message, dirty = state.dirty) {
        const status = $('brandingStatusCopy');
        const actionTitle = $('brandingActionTitle');
        const actionHint = $('brandingActionHint');
        if (status) {
            status.textContent = message;
            status.classList.toggle('is-dirty', dirty);
        }
        if (actionTitle) actionTitle.textContent = state.dirty ? 'لديك تغييرات غير محفوظة' : state.pendingPublish ? 'مسودة محفوظة ولم تُنشر' : 'لا توجد تغييرات غير محفوظة';
        if (actionHint) actionHint.textContent = state.dirty || state.pendingPublish ? 'راجع المعاينة، ثم انشر الهوية لتطبيقها على كامل المنصة.' : 'التعديلات الحالية مطابقة للهوية المنشورة.';
    }

    function setBusy(button, busy, label) {
        if (!button) return;
        button.disabled = busy;
        if (busy) {
            button.dataset.brandingOriginalLabel = button.textContent;
            button.textContent = label;
        } else if (button.dataset.brandingOriginalLabel) {
            button.textContent = button.dataset.brandingOriginalLabel;
            delete button.dataset.brandingOriginalLabel;
        }
    }

    function markDirty(message = 'مسودة الهوية بها تغييرات جديدة') {
        state.dirty = true;
        setStatus(message, true);
        renderValidation();
        renderPreview();
    }

    function setField(id, value) {
        const element = $(id);
        if (!element) return;
        if (element.type === 'checkbox') element.checked = Boolean(value);
        else element.value = value ?? '';
    }

    function renderForm() {
        const current = config();
        Object.entries(IDENTITY_FIELDS).forEach(([id, key]) => setField(id, current.identity?.[key]));
        Object.entries(DOCUMENT_FIELDS).forEach(([id, key]) => setField(id, current.documents?.[key]));
        Object.entries(TYPOGRAPHY_FIELDS).forEach(([id, key]) => setField(id, current.typography?.[key]));
        Object.entries(LOGIN_FIELDS).forEach(([id, key]) => setField(id, current.login?.[key]));
        Object.entries(INTERFACE_FIELDS).forEach(([id, key]) => setField(id, current.interface?.[key]));
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

    function renderValidation(serverValidation = null) {
        const box = $('brandingValidation');
        if (!box) return;
        const current = config();
        const errors = [];
        const warnings = [];
        if (!String(current.identity?.brandName || '').trim()) errors.push('اسم العلامة التجارية مطلوب.');
        ['light', 'dark'].forEach((themeName) => {
            const theme = current.themes?.[themeName] || {};
            if (contrast(theme.textPrimary, theme.background) < 4.5) errors.push(`تباين النص الأساسي في وضع ${themeName === 'light' ? 'Light' : 'Dark'} أقل من WCAG AA.`);
            if (contrast(theme.onPrimary, theme.primary) < 4.5) errors.push(`تباين نص الزر الأساسي في وضع ${themeName === 'light' ? 'Light' : 'Dark'} غير كافٍ.`);
            if (contrast(theme.textSecondary, theme.background) < 3) warnings.push(`النص الثانوي في وضع ${themeName === 'light' ? 'Light' : 'Dark'} منخفض التباين.`);
        });
        (serverValidation?.errors || []).forEach((item) => { if (!errors.includes(item.message)) errors.push(item.message); });
        (serverValidation?.warnings || []).forEach((item) => { if (!warnings.includes(item.message)) warnings.push(item.message); });
        if (!errors.length && !warnings.length) {
            box.hidden = false;
            box.className = 'branding-validation is-success';
            box.innerHTML = '<strong>الهوية جاهزة للنشر</strong><span>تم فحص الاسم والتباين والقيم الأساسية بنجاح.</span>';
            return;
        }
        box.hidden = false;
        box.className = `branding-validation ${errors.length ? 'is-error' : 'is-warning'}`;
        box.innerHTML = `${errors.length ? `<strong>يجب إصلاح ${errors.length} مشكلة قبل النشر</strong><ul>${errors.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>` : ''}${warnings.length ? `<strong>ملاحظات الوصول والوضوح</strong><ul>${warnings.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>` : ''}`;
    }

    function renderTokens(themeName) {
        const container = $(`branding${themeName[0].toUpperCase()}${themeName.slice(1)}Tokens`);
        if (!container) return;
        const theme = config().themes?.[themeName] || {};
        container.innerHTML = TOKEN_DEFINITIONS.map(([key, label]) => {
            const value = /^#[\da-f]{6}$/i.test(String(theme[key] || '')) ? theme[key] : '#000000';
            return `<div class="branding-color-field"><label for="branding-${themeName}-${key}">${escapeHtml(label)}<code>${escapeHtml(key)}</code></label><div class="branding-color-control"><input id="branding-${themeName}-${key}" type="color" value="${value}" data-branding-color="${themeName}" data-branding-token="${key}" aria-label="${escapeHtml(label)}"><input type="text" value="${escapeHtml(value)}" maxlength="7" inputmode="text" dir="ltr" data-branding-color-text="${themeName}" data-branding-token="${key}" aria-label="قيمة ${escapeHtml(label)} بصيغة HEX"></div></div>`;
        }).join('');
    }

    function renderAssets() {
        const container = $('brandingAssetGrid');
        if (!container) return;
        const current = config();
        container.innerHTML = ASSET_DEFINITIONS.map(([key, label, hint]) => {
            const asset = current.assets?.[key];
            const url = asset?.url || DEFAULT_ASSET_URLS[key] || '';
            const preview = url ? `<img src="${escapeHtml(url)}" alt="${escapeHtml(label)}" loading="lazy">` : `<span>${escapeHtml(current.identity?.shortName?.trim()?.charAt(0) || 'ج')}</span>`;
            return `<article class="branding-asset-card"><div class="branding-asset-preview ${url ? 'has-asset' : ''}">${preview}</div><div class="branding-asset-copy"><strong>${escapeHtml(label)}</strong><small>${escapeHtml(hint)}</small>${asset ? `<em>${escapeHtml(asset.fileName || 'تم الرفع')} · ${Number(asset.width || 0)}×${Number(asset.height || 0)}</em>` : '<em>يستخدم الافتراضي حاليًا</em>'}</div><div class="branding-asset-actions"><input id="branding-file-${key}" type="file" accept="image/svg+xml,image/png,image/webp" data-branding-file="${key}" hidden><label class="btn btn-light btn-small" for="branding-file-${key}">رفع / استبدال</label>${asset ? `<button class="btn btn-danger btn-small" type="button" data-branding-remove="${key}">إزالة</button>` : ''}</div></article>`;
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
        const rows = (state.audit || []).map((item) => `<div class="branding-audit-row"><strong>${escapeHtml(AUDIT_LABELS[item.action] || item.action || 'عملية')}</strong><span>${escapeHtml(item.createdAt ? new Date(item.createdAt).toLocaleString('ar-EG') : '—')} · ${item.actorUserId ? `حساب #${escapeHtml(item.actorUserId)}` : 'النظام'}</span><small>${escapeHtml(item.details || `الإصدار ${item.version || '—'}`)}</small></div>`).join('');
        container.innerHTML = rows || '<p class="branding-hint">لا توجد عمليات مسجلة بعد.</p>';
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
        if (welcome) welcome.textContent = current.identity?.welcomeSubtitle || 'إدارة أذكى لجيم أقوى.';
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
        const publishedAt = state.metadata?.publishedAt ? new Date(state.metadata.publishedAt).toLocaleString('ar-EG') : 'غير منشورة بعد';
        element.textContent = `v${state.version} · ${publishedAt}`;
    }

    function renderAll(serverValidation = null) {
        renderForm();
        renderAssets();
        renderTokens('light');
        renderTokens('dark');
        renderValidation(serverValidation);
        renderAudit();
        updateVersionMeta();
        renderPreview();
        setStatus(state.dirty ? 'مسودة الهوية بها تغييرات جديدة' : state.pendingPublish ? `مسودة محفوظة: ${config().identity?.brandName || 'Logic Fit'}` : `الهوية المنشورة: ${config().identity?.brandName || 'Logic Fit'}`, state.dirty || state.pendingPublish);
    }

    async function readError(response) {
        const data = await response.json().catch(() => ({}));
        return new Error(data.error || 'تعذر تنفيذ العملية.');
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
            showToast('error', 'تعذر تحميل إعدادات الهوية', error.message || 'حاول مرة أخرى.');
            setStatus('تعذر تحميل إعدادات الهوية — تم الاحتفاظ بالافتراضي الآمن', false);
            return false;
        }
    }

    function handleFormChange(target) {
        const id = target.id;
        if (IDENTITY_FIELDS[id]) setPath(`identity.${IDENTITY_FIELDS[id]}`, target.value);
        else if (DOCUMENT_FIELDS[id]) setPath(`documents.${DOCUMENT_FIELDS[id]}`, target.value);
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
        if (!['image/svg+xml', 'image/png', 'image/webp'].includes(file.type)) {
            showToast('error', 'نوع الملف غير مدعوم', 'ارفع SVG أو PNG أو WebP فقط.');
            return;
        }
        if (file.size > 2 * 1024 * 1024) {
            showToast('error', 'حجم الملف كبير', 'الحد الأقصى لأصل الهوية هو 2MB.');
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
                    'X-Branding-Asset-Mime': file.type,
                    'X-Branding-Asset-Name': file.name,
                    'X-Branding-Asset-Width': String(Math.round(dimensions.width || 0)),
                    'X-Branding-Asset-Height': String(Math.round(dimensions.height || 0))
                },
                body: file
            });
            if (!response.ok) throw await readError(response);
            const result = await response.json();
            state.draft.assets[key] = result.asset;
            markDirty(`تم رفع ${ASSET_DEFINITIONS.find(([assetKey]) => assetKey === key)?.[1] || 'الأصل'} — يجب حفظ المسودة`);
            renderAssets();
            showToast('success', 'تم رفع الأصل', 'سيظهر في المعاينة الآن، ويظل غير منشور حتى تنشر الهوية.');
        } catch (error) {
            showToast('error', 'تعذر رفع الأصل', error.message || 'حاول مرة أخرى.');
        } finally {
            state.busy = false;
        }
    }

    async function removeAsset(key) {
        if (state.busy) return;
        let confirmed = true;
        if (window.Swal) {
            const result = await window.Swal.fire({ position: 'center', icon: 'warning', title: 'إزالة أصل الهوية؟', text: 'سيعود النظام إلى الأصل الافتراضي بعد النشر.', showCancelButton: true, confirmButtonText: 'إزالة', cancelButtonText: 'إلغاء', buttonsStyling: false, customClass: { popup: 'top-gym-alert', confirmButton: 'btn btn-danger', cancelButton: 'btn btn-light' } });
            confirmed = result.isConfirmed;
        } else confirmed = window.confirm('إزالة أصل الهوية والعودة إلى الافتراضي؟');
        if (!confirmed) return;
        state.busy = true;
        try {
            const result = await window.topGymAuth.api(`/api/branding/assets/${encodeURIComponent(key)}`, { method: 'DELETE' });
            if (state.draft.assets) state.draft.assets[key] = null;
            markDirty('تمت إزالة الأصل — احفظ المسودة أو انشر الهوية');
            renderAssets();
            showToast('success', 'تمت إزالة الأصل', result?.key ? 'تمت العودة إلى الافتراضي في المعاينة.' : 'تمت العملية.');
        } catch (error) {
            showToast('error', 'تعذر إزالة الأصل', error.message || 'حاول مرة أخرى.');
        } finally {
            state.busy = false;
        }
    }

    async function saveDraft(button = $('brandingSaveDraftButton')) {
        if (state.busy || !state.draft) return false;
        state.busy = true;
        setBusy(button, true, 'جاري الحفظ…');
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
            showToast('success', 'تم حفظ التعديلات', 'تم حفظ الهوية كمسودة ولم يتم نشرها بعد.');
            return true;
        } catch (error) {
            showToast('error', 'تعذر حفظ المسودة', error.message || 'تحقق من الألوان والبيانات.');
            return false;
        } finally {
            state.busy = false;
            setBusy(button, false);
        }
    }

    async function publish(button = $('brandingPublishButton')) {
        if (state.busy || !state.draft) return;
        state.busy = true;
        setBusy(button, true, 'جاري النشر…');
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
            showToast('success', 'تم نشر الهوية بنجاح', 'تم تطبيقها على لوحة الإدارة وبوابة المشترك والطباعة.');
        } catch (error) {
            showToast('error', 'تعذر نشر الهوية', error.message || 'أصلح أخطاء التباين ثم حاول مرة أخرى.');
        } finally {
            state.busy = false;
            setBusy(button, false);
        }
    }

    async function discard() {
        if (!state.originalDraft || state.busy) return;
        const loaded = await loadSettings();
        if (loaded) showToast('info', 'تم إلغاء التعديلات', 'عادت الشاشة إلى آخر مسودة محفوظة.');
    }

    async function resetToDefault() {
        if (state.busy) return;
        let confirmed = false;
        if (window.Swal) {
            const result = await window.Swal.fire({ position: 'center', icon: 'warning', title: 'استعادة الهوية الافتراضية؟', html: '<p>سيتم استبدال المسودة الحالية بهوية «Logic Fit» وحذف أصول المسودة. لن تتغير الهوية المنشورة إلا بعد الضغط على «نشر الهوية».</p>', showCancelButton: true, confirmButtonText: 'استعادة «Logic Fit»', cancelButtonText: 'إلغاء', buttonsStyling: false, customClass: { popup: 'top-gym-alert', confirmButton: 'btn btn-danger', cancelButton: 'btn btn-light' } });
            confirmed = result.isConfirmed;
        } else confirmed = window.confirm('استعادة الهوية الافتراضية «Logic Fit»؟');
        if (!confirmed) return;
        const button = $('brandingResetButton');
        state.busy = true;
        setBusy(button, true, 'جاري الاستعادة…');
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
            setStatus('تمت استعادة «Logic Fit» كمسودة — انشرها لتطبيقها', true);
            showToast('success', 'تمت استعادة الافتراضي', 'يمكنك مراجعة المعاينة قبل النشر.');
        } catch (error) {
            showToast('error', 'تعذر استعادة الهوية', error.message || 'حاول مرة أخرى.');
        } finally {
            state.busy = false;
            setBusy(button, false);
        }
    }

    async function confirmLeave() {
        if (!state.dirty) return true;
        if (window.Swal) {
            const result = await window.Swal.fire({ position: 'center', icon: 'warning', title: 'لديك تغييرات غير محفوظة', text: 'هل تريد مغادرة شاشة تخصيص الهوية دون حفظ التعديلات الحالية؟', showCancelButton: true, confirmButtonText: 'تجاهل التعديلات', cancelButtonText: 'البقاء', buttonsStyling: false, customClass: { popup: 'top-gym-alert', confirmButton: 'btn btn-danger', cancelButton: 'btn btn-light' } });
            if (!result.isConfirmed) return false;
        } else if (!window.confirm('لديك تغييرات غير محفوظة. هل تريد مغادرة الشاشة؟')) return false;
        await discard();
        return true;
    }

    function bind() {
        if (page.dataset.brandingBound) return;
        page.dataset.brandingBound = 'true';
        page.addEventListener('input', (event) => {
            const target = event.target;
            if (target.matches('[data-branding-color], [data-branding-color-text]')) handleColorChange(target);
            else handleFormChange(target);
        });
        page.addEventListener('change', (event) => {
            const target = event.target;
            if (target.matches('[data-branding-file]')) {
                void uploadAsset(target.files?.[0], target.dataset.brandingFile);
                target.value = '';
            } else if (target.matches('[data-branding-color], [data-branding-color-text]')) handleColorChange(target);
            else handleFormChange(target);
        });
        page.addEventListener('click', (event) => {
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
        bind();
        await loadSettings();
    }

    window.topGymBrandingEditor = Object.freeze({
        hasUnsaved: () => state.dirty,
        confirmLeave
    });

    if (window.topGymAuthReady) window.topGymAuthReady.then(init).catch(() => null);
    else window.setTimeout(() => void init(), 0);
})();
