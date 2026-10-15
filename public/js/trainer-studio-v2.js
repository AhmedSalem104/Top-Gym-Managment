(() => {
    'use strict';

    const shell = document.querySelector('.trainer-workspace-shell');
    if (!shell) return;

    const $ = (selector, root = document) => root.querySelector(selector);
    const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
    const studioT = (key, fallback, params) => {
        const catalogKey = `trainerStudioV2.${key}`;
        const translated = window.TopGymI18n?.t(catalogKey, params);
        return translated && translated !== catalogKey ? translated : (fallback || key);
    };
    const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));
    const displayPhone = (value, iso = '') => window.LogicFitPhoneInputs?.formatForDisplay?.(value, iso) || String(value || '');
    const formatNumber = (value) => window.TopGymI18n?.format?.('number', Number(value || 0)) || Number(value || 0).toLocaleString('ar-EG');
    const formatMoney = (value) => window.TopGymI18n?.format?.('currency', Number(value || 0), { currency: 'EGP', minimumFractionDigits: 2, maximumFractionDigits: 2 }) || `${Number(value || 0).toLocaleString('ar-EG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ج.م`;
    const formatDate = (value, withTime = false) => {
        if (!value) return '—';
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) return String(value);
        return window.TopGymI18n?.format?.('date', date, withTime ? { dateStyle: 'medium', timeStyle: 'short' } : { dateStyle: 'medium' })
            || new Intl.DateTimeFormat('ar-EG', withTime ? { dateStyle: 'medium', timeStyle: 'short' } : { dateStyle: 'medium' }).format(date);
    };
    const trainerEntitlementState = { status: 'loading', tenantStatus: null, subscription: null, entitlements: null };
    const trainerRouteFeatures = Object.freeze({
        // Trainer Studio's dashboard is the client-operations shell; it is
        // entitled through the Trainer `clients` capability rather than the
        // Gym-only dashboard catalog entry.
        dashboard: 'clients', clients: 'clients', calendar: 'sessions', sessions: 'sessions',
        training: 'coaching', nutrition: 'nutrition', exercises: 'library', muscles: 'library', foods: 'library',
        measurements: 'assessments', progress: 'progress', checkins: 'clients', goals: 'goals', packages: 'packages',
        sales: 'payments', renewals: 'packages', finance: 'payments', reports: 'reports', portal: 'portal',
        notifications: 'notifications', tasks: 'tasks', templates: 'templates'
    });
    const BILLING_TERM_LABELS = Object.freeze({
        get monthly() { return window.TopGymI18n?.t('saasBilling.plans.monthly') || 'شهر واحد'; },
        get quarterly() { return window.TopGymI18n?.t('saasBilling.plans.quarterly') || '3 شهور'; },
        get semiannual() { return window.TopGymI18n?.t('saasBilling.plans.semiannual') || '6 شهور'; },
        get annual() { return window.TopGymI18n?.t('saasBilling.plans.annual') || '12 شهرًا'; }
    });
    const billingTermLabel = (code) => BILLING_TERM_LABELS[code] || code;
    const limitLabel = (value) => value == null
        ? (window.TopGymI18n?.t('saasBilling.common.unlimited') || 'غير محدود')
        : formatNumber(value);
    function planTerms(plan) {
        return Array.isArray(plan?.terms) && plan.terms.length
            ? plan.terms.filter((term) => term?.isActive !== false)
            : [];
    }
    function trainerPlanCard(plan, currentCode, featureCatalog) {
        const terms = planTerms(plan);
        const selected = terms.find((term) => term.code === 'monthly') || terms[0] || { code: 'monthly', price: plan.price, currency: plan.currency || 'EGP' };
        const features = (Array.isArray(featureCatalog) ? featureCatalog : [])
            .filter((feature) => plan.features?.[feature.key] !== false)
            .slice(0, 8);
        return `<article class="trainer-studio-plan-card ${String(plan.code) === String(currentCode) ? 'is-current' : ''}" data-trainer-plan-card="${escapeHtml(plan.code)}"><div class="trainer-studio-plan-card-head"><div><span class="trainer-panel-kicker">${String(plan.code) === String(currentCode) ? 'الخطة الحالية' : 'خطة متاحة'}</span><h3>${escapeHtml(plan.name || plan.code)}</h3></div>${String(plan.code) === String(currentCode) ? '<span class="trainer-studio-plan-current">نشطة</span>' : ''}</div><p>${escapeHtml(plan.description || 'خطة تشغيل لمساحة المدرب.')}</p><label class="trainer-studio-plan-term">مدة الفوترة<select data-trainer-plan-term aria-label="مدة فوترة ${escapeHtml(plan.name || plan.code)}">${terms.map((term) => `<option value="${escapeHtml(term.code)}" data-price="${escapeHtml(term.price)}" data-currency="${escapeHtml(term.currency || plan.currency || 'EGP')}" ${term.code === selected.code ? 'selected' : ''}>${escapeHtml(billingTermLabel(term.code))} — ${escapeHtml(formatMoney(term.price))}</option>`).join('')}</select></label><strong class="trainer-studio-plan-price" data-trainer-plan-price>${escapeHtml(formatMoney(selected.price))}<small> / ${escapeHtml(billingTermLabel(selected.code))}</small></strong><div class="trainer-studio-plan-limits"><span>العملاء <b>${escapeHtml(limitLabel(plan.maxClients))}</b></span><span>المستخدمون <b>${escapeHtml(limitLabel(plan.maxUsers))}</b></span><span>AI شهريًا <b>${escapeHtml(limitLabel(plan.maxAiGenerations))}</b></span><span>التخزين <b>${escapeHtml(limitLabel(plan.maxStorageMb))} MB</b></span></div><ul class="trainer-studio-plan-features">${features.map((feature) => `<li><span aria-hidden="true">✓</span>${escapeHtml(feature.description || feature.key)}</li>`).join('')}</ul></article>`;
    }

    function bindTrainerPlanTerms(host) {
        host?.addEventListener('change', (event) => {
            const select = event.target.closest('[data-trainer-plan-term]');
            if (!select || !host.contains(select)) return;
            const option = select.selectedOptions?.[0];
            const price = select.closest('[data-trainer-plan-card]')?.querySelector('[data-trainer-plan-price]');
            if (!option || !price) return;
            price.innerHTML = `${escapeHtml(formatMoney(option.dataset.price, option.dataset.currency))}<small> / ${escapeHtml(billingTermLabel(option.value))}</small>`;
        });
    }
    const icon = (name) => ({
        dashboard: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></svg>',
        users: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="9" cy="8" r="3"/><path d="M3.5 20a5.5 5.5 0 0 1 11 0M16 11a3 3 0 1 0 0-6M16 14.5a5.5 5.5 0 0 1 4.5 5.5"/></svg>',
        calendar: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4M17 3v4M3 10h18M7 14h3M7 17h5"/></svg>',
        plan: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 4.5A2.5 2.5 0 0 1 7.5 2H20v17H7.5A2.5 2.5 0 0 0 5 21.5z"/><path d="M5 4.5v17M9 7h7M9 11h7"/></svg>',
        chart: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 19V5M4 19h17"/><path d="m7 15 4-4 3 2 5-6"/></svg>',
        wallet: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6.5A2.5 2.5 0 0 1 6.5 4H20v16H6.5A2.5 2.5 0 0 1 4 17.5z"/><path d="M4 7h16M16 13h2"/></svg>',
        book: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v16H6.5A2.5 2.5 0 0 0 4 21.5z"/><path d="M4 5.5v16M8 7h8M8 11h6"/></svg>',
        activity: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 12h4l2-6 4 12 2-6h6"/></svg>',
        settings: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z"/><path d="m19 13 2-1-2-1-.4-2 1.3-1.7-1.8-1.8-1.7 1.3-2-.4-1-2-1 2-2 .4-1.7-1.3-1.8 1.8L6.2 8l-.4 2-2 1 2 1 .4 2-1.3 1.7 1.8 1.8 1.7-1.3 2 .4 1 2 1-2 2-.4 1.7 1.3 1.8-1.8L18.6 15Z"/></svg>',
        plus: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>',
        arrow: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>',
        logout: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10 5H6.5A2.5 2.5 0 0 0 4 7.5v9A2.5 2.5 0 0 0 6.5 19H10"/><path d="M14 8l4 4-4 4M18 12H9"/></svg>'
    }[name] || icon('activity'));

    const routeMeta = Object.freeze({
        goals: { label: '\u0627\u0644\u0623\u0647\u062f\u0627\u0641', eyebrow: '\u0645\u0633\u0627\u0631 \u0627\u0644\u062a\u0642\u062f\u0645', description: '\u0623\u0647\u062f\u0627\u0641 \u0642\u0627\u0628\u0644\u0629 \u0644\u0644\u0642\u064a\u0627\u0633 \u0645\u0631\u062a\u0628\u0637\u0629 \u0628\u0643\u0644 \u0639\u0645\u064a\u0644.' },
        notifications: { label: '\u0627\u0644\u062a\u0646\u0628\u064a\u0647\u0627\u062a', eyebrow: '\u0645\u0631\u0643\u0632 \u0627\u0644\u0625\u062c\u0631\u0627\u0621', description: '\u062a\u0646\u0628\u064a\u0647\u0627\u062a \u0645\u0633\u062a\u0645\u062f\u0629 \u0645\u0646 \u0627\u0644\u062c\u0644\u0633\u0627\u062a \u0648\u0627\u0644\u0645\u062a\u0627\u0628\u0639\u0627\u062a \u0648\u0627\u0644\u0628\u0627\u0642\u0627\u062a.' },
        tasks: { label: '\u0645\u0647\u0627\u0645\u064a', eyebrow: '\u0645\u0631\u0643\u0632 \u0627\u0644\u0625\u062c\u0631\u0627\u0621', description: '\u0645\u0647\u0627\u0645 \u0645\u0631\u062a\u0628\u0637\u0629 \u0628\u0627\u0644\u0639\u0645\u0644\u0627\u0621 \u0648\u0645\u0648\u0627\u0639\u064a\u062f \u0627\u0644\u0645\u062a\u0627\u0628\u0639\u0629.' },
        templates: { label: '\u0627\u0644\u0642\u0648\u0627\u0644\u0628', eyebrow: '\u0645\u0643\u062a\u0628\u0629 \u0627\u0644\u0645\u062f\u0631\u0628', description: '\u0642\u0648\u0627\u0644\u0628 \u0645\u062d\u0641\u0648\u0638\u0629 \u0644\u0625\u0639\u0627\u062f\u0629 \u0627\u0644\u0627\u0633\u062a\u062e\u062f\u0627\u0645 \u0628\u0623\u0645\u0627\u0646 \u0645\u0639 \u0627\u0644\u0639\u0645\u0644\u0627\u0621.' },
        dashboard: { label: 'لوحة التحكم', eyebrow: 'مساحة المدرب', description: 'صورة تشغيلية سريعة ليومك وعملائك.' },
        clients: { label: 'العملاء', eyebrow: 'إدارة العملاء', description: 'ملفات تدريبية مرتبة من أول تواصل إلى آخر متابعة.' },
        calendar: { label: 'الجدول', eyebrow: 'إدارة الوقت', description: 'مواعيد الجلسات القادمة في مساحة واحدة.' },
        sessions: { label: 'الجلسات', eyebrow: 'التنفيذ', description: 'راجع الجلسات وحالتها وارتباطها بالباقات.' },
        training: { label: 'خطط التدريب', eyebrow: 'البرمجة التدريبية', description: 'الخطط المحفوظة لعملائك من المصدر الحالي.' },
        nutrition: { label: 'خطط التغذية', eyebrow: 'التغذية', description: 'الخطط الغذائية المرتبطة بملفات العملاء.' },
        exercises: { label: 'مكتبة التمارين', eyebrow: 'المكتبة', description: 'تمارين مصورة جاهزة للاستخدام داخل برامج التدريب.' },
        muscles: { label: 'العضلات', eyebrow: 'خريطة الجسم', description: 'استكشف العضلات المستهدفة وصورها ومناطقها.' },
        foods: { label: 'مكتبة الأطعمة', eyebrow: 'التغذية', description: 'أطعمة ومكونات مصورة مع القيم الغذائية الحالية.' },
        measurements: { label: 'القياسات', eyebrow: 'التقييم', description: 'آخر قياسات العملاء وتاريخ تحديث الملف.' },
        progress: { label: 'التقدم', eyebrow: 'النتائج', description: 'مؤشرات التدريب والقياسات المسجلة فعليًا.' },
        checkins: { label: 'المتابعات', eyebrow: 'العناية بالعميل', description: 'العملاء الذين يحتاجون خطوة متابعة منك.' },
        packages: { label: 'الباقات', eyebrow: 'الخدمات', description: 'خدمات التدريب وأسعارها ومدتها.' },
        sales: { label: 'المبيعات والتحصيلات', eyebrow: 'الإيرادات', description: 'مشتريات الباقات والمدفوع والمتبقي.' },
        renewals: { label: 'التجديدات', eyebrow: 'الاحتفاظ بالعملاء', description: 'الباقات التي تحتاج قرار تجديد أو متابعة تحصيل.' },
        finance: { label: 'المالية', eyebrow: 'الصورة المالية', description: 'ملخص التحصيلات والأرصدة من السجل الحالي.' },
        reports: { label: 'التقارير', eyebrow: 'قراءة النشاط', description: 'أداء التدريب خلال الفترة المحددة.' },
        portal: { label: 'بوابة العميل', eyebrow: 'تجربة العميل', description: 'إصدار دخول العميل ومتابعة تجربة التدريب.' },
        settings: { label: 'الإعدادات', eyebrow: 'إدارة المساحة', description: 'بيانات المساحة والاشتراك والتفضيلات المتاحة.' }
    });

    const routeEyebrows = Object.freeze({
        dashboard: 'eyebrow.dashboard', clients: 'eyebrow.dailyWork', calendar: 'eyebrow.dailyWork', sessions: 'eyebrow.execution',
        training: 'eyebrow.programming', nutrition: 'eyebrow.nutrition', exercises: 'eyebrow.library', muscles: 'eyebrow.bodyMap',
        foods: 'eyebrow.nutrition', measurements: 'eyebrow.assessment', progress: 'eyebrow.results', checkins: 'eyebrow.clientCare',
        goals: 'eyebrow.results', packages: 'eyebrow.services', sales: 'eyebrow.revenue', renewals: 'eyebrow.retention',
        finance: 'eyebrow.finance', reports: 'eyebrow.activity', portal: 'eyebrow.clientExperience', notifications: 'eyebrow.actionCenter',
        tasks: 'eyebrow.actionCenter', templates: 'eyebrow.trainerLibrary', settings: 'eyebrow.workspace'
    });

    const routeName = (route) => studioT(`route.${route}`, routeMeta[route]?.label || route);
    const groupKeys = ['daily', 'training', 'business', 'workspace'];

    const dashboardCopy = [
        ['.trainer-workspace-summary', 'aria-label', 'dashboard.metricsLabel'],
        ['.trainer-workspace-summary article:nth-child(1) .trainer-card-eyebrow', 'text', 'dashboard.clientsBase'],
        ['.trainer-workspace-summary article:nth-child(1) small', 'text', 'dashboard.activeClients'],
        ['.trainer-workspace-summary article:nth-child(2) .trainer-card-eyebrow', 'text', 'dashboard.todayRhythm'],
        ['.trainer-workspace-summary article:nth-child(2) small', 'text', 'dashboard.todaySessions'],
        ['.trainer-workspace-summary article:nth-child(3) .trainer-card-eyebrow', 'text', 'dashboard.upcoming'],
        ['.trainer-workspace-summary article:nth-child(3) small', 'text', 'dashboard.scheduledSessions'],
        ['.trainer-workspace-summary article:nth-child(4) .trainer-card-eyebrow', 'text', 'dashboard.businessAlert'],
        ['.trainer-workspace-summary article:nth-child(4) small', 'text', 'dashboard.expiringPackages'],
        ['.trainer-workspace-summary article:nth-child(5) .trainer-card-eyebrow', 'text', 'dashboard.collections'],
        ['.trainer-workspace-summary article:nth-child(5) small', 'text', 'dashboard.outstanding'],
        ['.trainer-quick-actions .trainer-panel-kicker', 'text', 'dashboard.quickKicker'],
        ['#trainerQuickActionsTitle', 'text', 'dashboard.quickTitle'],
        ['#trainerAddClient strong', 'text', 'dashboard.addClient'],
        ['#trainerAddClient small', 'text', 'dashboard.addClientDescription'],
        ['#trainerAddSession strong', 'text', 'dashboard.scheduleSession'],
        ['#trainerAddSession small', 'text', 'dashboard.scheduleDescription'],
        ['#trainerAddPackage strong', 'text', 'dashboard.createPackage'],
        ['#trainerAddPackage small', 'text', 'dashboard.packageDescription'],
        ['#trainerToday .trainer-schedule-panel .trainer-panel-kicker', 'text', 'dashboard.todayKicker'],
        ['#trainerSessionsTitle', 'text', 'dashboard.sessionsTitle'],
        ['#trainerToday .trainer-schedule-panel .trainer-panel-header p', 'text', 'dashboard.sessionsDescription'],
        ['#trainerScheduleSession', 'text', 'dashboard.scheduleAction'],
        ['#trainerActivityTitle', 'text', 'dashboard.followupTitle'],
        ['#trainerToday .trainer-activity-panel .trainer-panel-kicker', 'text', 'dashboard.followupKicker'],
        ['#trainerToday .trainer-activity-panel .trainer-panel-header p', 'text', 'dashboard.followupDescription'],
        ['.trainer-priority-item:nth-child(1) > div > span', 'text', 'dashboard.followupItem'],
        ['.trainer-priority-item:nth-child(2) > div > span', 'text', 'dashboard.measurements'],
        ['.trainer-priority-item:nth-child(3) > div > span', 'text', 'dashboard.checkins'],
        ['.trainer-availability-note p', 'text', 'dashboard.priorityNote']
    ];

    function localizeDashboard() {
        dashboardCopy.forEach(([selector, kind, key]) => {
            const element = $(selector);
            if (!element) return;
            if (!element.dataset.studioArabicFallback) element.dataset.studioArabicFallback = element.textContent;
            const localized = studioT(key, element.dataset.studioArabicFallback);
            if (kind === 'aria-label') element.setAttribute(kind, localized);
            else element.textContent = localized;
        });
        const sessionMessage = $('#trainerSessionsMessage');
        if (sessionMessage) {
            const localizeSessionCount = () => {
                const sourceText = sessionMessage.textContent.trim();
                if (!sourceText) {
                    delete sessionMessage.dataset.studioSessionCount;
                    delete sessionMessage.dataset.studioSessionRendered;
                    return;
                }
                const sourceCount = sourceText.match(/^([\d٠-٩۰-۹٬,]+)\s+جلسة$/u)?.[1];
                if (sourceCount) {
                    const normalizedCount = sourceCount.replace(/[٠-٩۰-۹]/gu, (digit) => String('٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹'.indexOf(digit) % 10)).replace(/[٬,]/gu, '');
                    if (/^\d+$/u.test(normalizedCount)) sessionMessage.dataset.studioSessionCount = normalizedCount;
                } else if (sourceText !== sessionMessage.dataset.studioSessionRendered) return;
                const count = Number(sessionMessage.dataset.studioSessionCount);
                if (!Number.isFinite(count)) return;
                const formattedCount = formatNumber(count);
                const localizedText = studioT('dashboard.sessionCount', `${formattedCount} جلسة`, { count: formattedCount });
                if (sourceText !== localizedText) {
                    sessionMessage.dataset.studioSessionRendered = localizedText;
                    sessionMessage.textContent = localizedText;
                }
            };
            if (sessionMessage.dataset.studioCountLocalizer !== 'true') {
                sessionMessage.dataset.studioCountLocalizer = 'true';
                new MutationObserver(localizeSessionCount).observe(sessionMessage, { childList: true, characterData: true, subtree: true });
            }
            localizeSessionCount();
        }
        const packageMessage = $('#trainerPackagesMessage');
        if (packageMessage) {
            const localizePackageCount = () => {
                const sourceCount = packageMessage.textContent.trim().match(/[\d٠-٩۰-۹]+/u)?.[0];
                if (!sourceCount) return;
                const normalizedCount = sourceCount.replace(/[٠-٩۰-۹]/gu, (digit) => String('٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹'.indexOf(digit) % 10));
                const localizedText = window.TopGymI18n?.t('trainerWorkspaceScreen.state.packageCount', { count: formatNumber(Number(normalizedCount)) });
                if (localizedText && localizedText !== packageMessage.textContent.trim()) packageMessage.textContent = localizedText;
            };
            if (packageMessage.dataset.studioPackageCountLocalizer !== 'true') {
                packageMessage.dataset.studioPackageCountLocalizer = 'true';
                new MutationObserver(localizePackageCount).observe(packageMessage, { childList: true, characterData: true, subtree: true });
            }
            localizePackageCount();
        }
        const purchaseMessage = $('#trainerPurchasesMessage');
        if (purchaseMessage) {
            const localizePurchaseCount = () => {
                const sourceCount = purchaseMessage.textContent.trim().match(/[\d٠-٩۰-۹]+/u)?.[0];
                if (!sourceCount) return;
                const normalizedCount = sourceCount.replace(/[٠-٩۰-۹]/gu, (digit) => String('٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹'.indexOf(digit) % 10));
                const localizedText = window.TopGymI18n?.t('trainerWorkspaceScreen.state.purchaseCount', { count: formatNumber(Number(normalizedCount)) });
                if (localizedText && localizedText !== purchaseMessage.textContent.trim()) purchaseMessage.textContent = localizedText;
            };
            if (purchaseMessage.dataset.studioPurchaseCountLocalizer !== 'true') {
                purchaseMessage.dataset.studioPurchaseCountLocalizer = 'true';
                new MutationObserver(localizePurchaseCount).observe(purchaseMessage, { childList: true, characterData: true, subtree: true });
            }
            localizePurchaseCount();
        }
    }

    function localizeStudioShell() {
        const currentRoute = resolveRoute();
        const pageTitle = window.TopGymI18n?.t('trainerWorkspaceScreen.page.title');
        if (pageTitle) document.title = pageTitle;
        const workspaceBrand = $('#trainerWorkspaceBrand');
        if (workspaceBrand && workspaceBrand.dataset.tenantName !== 'true') {
            workspaceBrand.textContent = window.TopGymI18n?.t('trainerWorkspaceScreen.brand') || workspaceBrand.textContent;
        }
        $('.trainer-studio-topbar')?.setAttribute('aria-label', studioT('shell.topbar', 'الشريط العلوي لمساحة المدرب'));
        $('#trainerStudioSidebar')?.setAttribute('aria-label', studioT('shell.sidebar', 'قائمة Trainer Studio'));
        $('#trainerStudioSidebarClose')?.setAttribute('aria-label', studioT('shell.closeNavigation', 'إغلاق القائمة'));
        $('#trainerStudioMenuButton')?.setAttribute('aria-label', studioT('shell.openNavigation', 'فتح قائمة Trainer Studio'));
        if (!$('.trainer-studio-topbar-status')) {
            $('.trainer-studio-topbar-status-slot')?.replaceChildren(document.createTextNode(studioT('shell.workspaceStatus', 'مساحة خاصة')));
        }
        $('.trainer-studio-topbar-logout-slot span:last-child')?.replaceChildren(document.createTextNode(studioT('shell.logout', 'تسجيل الخروج')));
        $('.trainer-studio-sidebar-footer span:last-child')?.replaceChildren(document.createTextNode(studioT('shell.privateWorkspace', 'مساحة خاصة وآمنة')));
        $('.trainer-studio-route-meta span:last-child')?.replaceChildren(document.createTextNode(studioT('shell.dashboardData', 'بيانات مساحتك التدريبية')));
        $$('.trainer-studio-nav-group').forEach((group, index) => {
            const key = groupKeys[index] || 'workspace';
            const label = studioT(`group.${key}`, group.dataset.studioArabicLabel || '');
            group.querySelector('.trainer-studio-nav-label')?.replaceChildren(document.createTextNode(label));
            group.querySelector('nav')?.setAttribute('aria-label', label);
        });
        $$('.trainer-studio-nav-link').forEach((link) => {
            const label = routeName(link.dataset.studioRoute);
            link.querySelector(':scope > span:last-child')?.replaceChildren(document.createTextNode(label));
            link.setAttribute('aria-label', label);
        });
        const themeButton = $('.trainer-studio-topbar [data-theme-toggle]');
        if (themeButton) {
            const nextTheme = themeButton.getAttribute('aria-pressed') === 'true' ? 'light' : 'dark';
            const key = nextTheme === 'dark' ? 'shell.enableDark' : 'shell.enableLight';
            const label = studioT(key, nextTheme === 'dark' ? 'تفعيل الوضع الداكن' : 'تفعيل الوضع الفاتح');
            themeButton.setAttribute('aria-label', label);
            themeButton.setAttribute('title', label);
        }
        setRouteChrome(currentRoute);
        localizeDashboard();
        $('.trainer-operations-grid')?.setAttribute('aria-label', studioT('ui.operationsGridLabel', 'Trainer services and operations'));
        [
            ['.trainer-report-stat:nth-child(1) > span', 'trainerWorkspaceScreen.reports.netRevenue'],
            ['.trainer-report-stat:nth-child(2) > span', 'trainerWorkspaceScreen.reports.newClients'],
            ['.trainer-report-stat:nth-child(3) > span', 'trainerWorkspaceScreen.reports.completedSessions'],
            ['.trainer-report-stat:nth-child(4) > span', 'trainerWorkspaceScreen.reports.totalSessions'],
            ['.trainer-report-stat:nth-child(5) > span', 'trainerWorkspaceScreen.reports.outstanding'],
            ['.trainer-report-stat:nth-child(6) > span', 'trainerWorkspaceScreen.reports.progress']
        ].forEach(([selector, key]) => {
            const label = $(selector);
            const translation = window.TopGymI18n?.t(key);
            if (label && translation && translation !== key) label.textContent = translation;
        });
    }

    const navGroups = [
        { label: 'العمل اليومي', items: [['dashboard', 'لوحة التحكم', 'dashboard'], ['clients', 'العملاء', 'users'], ['calendar', 'الجدول', 'calendar'], ['sessions', 'الجلسات', 'activity']] },
        { label: 'التدريب والمتابعة', items: [['training', 'خطط التدريب', 'plan'], ['nutrition', 'خطط التغذية', 'plan'], ['exercises', 'مكتبة التمارين', 'book'], ['muscles', 'العضلات', 'activity'], ['foods', 'مكتبة الأطعمة', 'activity'], ['measurements', 'القياسات', 'activity'], ['progress', 'التقدم', 'chart'], ['checkins', 'المتابعات', 'activity']] },
        { label: 'الأعمال', items: [['packages', 'الباقات', 'plan'], ['sales', 'المبيعات والتحصيلات', 'wallet'], ['renewals', 'التجديدات', 'arrow'], ['finance', 'المالية', 'wallet'], ['reports', 'التقارير', 'chart'], ['portal', 'بوابة العميل', 'users']] },
        { label: 'المساحة', items: [['settings', 'الإعدادات', 'settings']] }
    ];

    navGroups[1].items.splice(6, 0, ['goals', '\u0627\u0644\u0623\u0647\u062f\u0627\u0641', 'chart']);
    navGroups[2].items.splice(5, 0, ['notifications', '\u0627\u0644\u062a\u0646\u0628\u064a\u0647\u0627\u062a', 'activity']);
    navGroups[2].items.splice(6, 0, ['tasks', '\u0645\u0647\u0627\u0645\u064a', 'activity']);
    navGroups[3].items.unshift(['templates', '\u0627\u0644\u0642\u0648\u0627\u0644\u0628', 'book']);

    async function api(path, options = {}) {
        const response = await fetch(path, { credentials: 'same-origin', ...options, headers: { 'Content-Type': 'application/json', ...(options.headers || {}) } });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw Object.assign(new Error(payload.error || 'تعذر تحميل البيانات.'), { status: response.status, code: payload.code });
        return payload;
    }

    function trainerFeatureAccess(route) {
        const feature = trainerRouteFeatures[route];
        if (!feature) return { allowed: true, state: 'available', feature: null };
        if (trainerEntitlementState.status !== 'ready') return { allowed: false, state: trainerEntitlementState.status === 'error' ? 'not_ready' : 'pending', feature };
        const status = String(trainerEntitlementState.subscription?.status || '').toLowerCase();
        if (status === 'suspended' || ['suspended', 'disabled', 'archived'].includes(String(trainerEntitlementState.tenantStatus || '').toLowerCase())) return { allowed: false, state: 'suspended', feature };
        if (!['active', 'trial'].includes(status)) return { allowed: false, state: 'expired', feature };
        const catalogEntry = (trainerEntitlementState.entitlements?.featureCatalog || []).find((item) => item?.key === feature);
        if (!catalogEntry) return { allowed: false, state: 'not_included', feature, plan: trainerEntitlementState.subscription?.plan || null };
        const enabled = trainerEntitlementState.entitlements?.features?.[feature];
        const allowed = enabled === true || enabled === 1 || enabled === '1' || String(enabled).toLowerCase() === 'true';
        return { allowed, state: allowed ? 'available' : 'not_included', feature, plan: trainerEntitlementState.subscription?.plan || null };
    }

    function applyTrainerEntitlementVisibility() {
        $$('.trainer-studio-nav-link').forEach((link) => {
            const access = trainerFeatureAccess(link.dataset.studioRoute);
            link.hidden = access.allowed !== true;
            link.toggleAttribute('inert', access.allowed !== true);
            link.setAttribute('aria-hidden', String(access.allowed !== true));
            link.dataset.entitlementFeature = access.feature || '';
        });
    }

    function renderTrainerFeatureAccessState(route, access) {
        const dynamic = $('#trainerStudioDynamicView');
        if (!dynamic) return;
        const feature = access.feature || trainerRouteFeatures[route] || route;
        const plan = access.plan?.name || access.plan?.code || studioT('ui.entitlement.currentPlan', 'باقتك الحالية');
        const stateKeys = {
            not_included: ['ui.entitlement.notIncluded.title', 'ui.entitlement.notIncluded.description'],
            expired: ['ui.entitlement.expired.title', 'ui.entitlement.expired.description'],
            suspended: ['ui.entitlement.suspended.title', 'ui.entitlement.suspended.description'],
            not_ready: ['ui.entitlement.notReady.title', 'ui.entitlement.notReady.description'],
            pending: ['ui.entitlement.pending.title', 'ui.entitlement.pending.description']
        };
        const [titleKey, descriptionKey] = stateKeys[access.state] || ['ui.entitlement.unavailable.title', 'ui.entitlement.unavailable.description'];
        const title = studioT(titleKey, 'الميزة غير متاحة حاليًا');
        const description = studioT(descriptionKey, 'لا يمكن فتح {{feature}} بحالة الاشتراك الحالية.', { feature, plan });
        const label = studioT('ui.entitlement.label', 'الوصول حسب الباقة · {{feature}}', { feature });
        const viewPlans = studioT('ui.entitlement.viewPlans', 'عرض الخطط');
        const offerPlans = ['not_included', 'expired'].includes(access.state);
        dynamic.innerHTML = `<section class="trainer-studio-feature-access" role="status"><div class="trainer-studio-feature-access-icon">!</div><span data-i18n="trainerStudioV2.ui.entitlement.label" data-i18n-param-feature="${escapeHtml(feature)}">${escapeHtml(label)}</span><h1 data-i18n="trainerStudioV2.${titleKey}">${escapeHtml(title)}</h1><p data-i18n="trainerStudioV2.${descriptionKey}" data-i18n-param-plan="${escapeHtml(plan)}" data-i18n-param-feature="${escapeHtml(feature)}">${escapeHtml(description)}</p>${offerPlans ? `<a class="btn btn-primary" href="/trainer-workspace/settings" data-i18n="trainerStudioV2.ui.entitlement.viewPlans">${escapeHtml(viewPlans)}</a>` : ''}</section>`;
        dynamic.hidden = false;
    }

    async function loadTrainerEntitlements() {
        try {
            let data = await api('/api/saas/entitlements');
            if (!data.entitlements && !data.recovery) {
                const legacy = await api('/api/saas/subscription');
                data = {
                    tenantStatus: legacy.tenant?.status || null,
                    subscription: legacy.subscription,
                    entitlements: {
                        tenantType: legacy.tenant?.tenantType || 'independent_trainer',
                        features: legacy.subscription?.plan?.features || {},
                        limits: legacy.subscription?.plan?.limits || {},
                        featureCatalog: legacy.featureCatalog || []
                    }
                };
            }
            trainerEntitlementState.status = 'ready';
            trainerEntitlementState.tenantStatus = data.tenantStatus || null;
            trainerEntitlementState.subscription = data.subscription || data.entitlements?.subscription || null;
            trainerEntitlementState.entitlements = data.entitlements || {};
        } catch (_) {
            trainerEntitlementState.status = 'error';
        }
        applyTrainerEntitlementVisibility();
        renderRoute(resolveRoute());
    }

    function buildShell() {
        if ($('#trainerStudioSidebar')) return;
        document.body.classList.add('trainer-studio-v2');
        shell.dataset.studioVersion = 'trainer-studio-v2';
        const legacyHeader = $('.trainer-workspace-header');
        if (legacyHeader) {
            const preserved = {
                brand: $('#trainerWorkspaceBrand'),
                message: $('#trainerWorkspaceMessage'),
                plan: $('#trainerWorkspacePlan'),
                status: $('#trainerWorkspaceStatus'),
                theme: $('[data-theme-toggle]', legacyHeader),
                language: $('#languageToggleButton', legacyHeader),
                logout: $('#trainerWorkspaceLogout')
            };
            legacyHeader.className = 'trainer-studio-topbar';
            legacyHeader.setAttribute('aria-label', 'الشريط العلوي لمساحة المدرب');
            legacyHeader.innerHTML = '<div class="trainer-studio-topbar-brand"><span class="trainer-studio-topbar-mark"><img src="/assets/logic-fit-app-icon.svg?v=2" alt=""></span><div><span class="trainer-studio-topbar-kicker">Logic Fit · Trainer Studio</span><span class="trainer-studio-topbar-brand-slot"></span><span class="trainer-studio-runtime-message-slot"></span></div></div><div class="trainer-studio-topbar-context"><span class="trainer-studio-topbar-badge"><span class="trainer-studio-topbar-dot" aria-hidden="true"></span><span class="trainer-studio-topbar-status-slot"></span></span><span class="trainer-studio-topbar-plan-slot"></span></div><div class="trainer-studio-topbar-actions"><span class="trainer-studio-topbar-language-slot"></span><span class="trainer-studio-topbar-theme-slot"></span><span class="trainer-studio-topbar-logout-slot"></span></div>';
            const slot = (selector) => $(selector, legacyHeader);
            if (preserved.brand) { preserved.brand.className = 'trainer-studio-topbar-tenant'; slot('.trainer-studio-topbar-brand-slot')?.append(preserved.brand); }
            if (preserved.message) { preserved.message.className = 'trainer-studio-runtime-message'; preserved.message.setAttribute('role', 'status'); slot('.trainer-studio-runtime-message-slot')?.append(preserved.message); }
            if (preserved.status) { preserved.status.className = 'trainer-studio-topbar-status'; slot('.trainer-studio-topbar-status-slot')?.append(preserved.status); }
            else if (slot('.trainer-studio-topbar-status-slot')) slot('.trainer-studio-topbar-status-slot').textContent = 'مساحة خاصة';
            if (preserved.plan) { preserved.plan.className = 'trainer-studio-topbar-plan'; slot('.trainer-studio-topbar-plan-slot')?.append(preserved.plan); }
            if (preserved.language) { preserved.language.className = 'theme-toggle-button trainer-studio-topbar-button'; slot('.trainer-studio-topbar-language-slot')?.append(preserved.language); }
            if (preserved.theme) { preserved.theme.className = 'theme-toggle-button trainer-studio-topbar-button'; slot('.trainer-studio-topbar-theme-slot')?.append(preserved.theme); }
            if (preserved.logout) { preserved.logout.className = 'trainer-studio-logout-button'; preserved.logout.innerHTML = `<span class="trainer-studio-logout-icon">${icon('logout')}</span><span>تسجيل الخروج</span>`; slot('.trainer-studio-topbar-logout-slot')?.append(preserved.logout); }
        }
        const existingContent = [...shell.children];
        const content = document.createElement('div');
        content.className = 'trainer-studio-content';
        existingContent.forEach((child) => content.append(child));
        const sidebar = document.createElement('aside');
        sidebar.className = 'trainer-studio-sidebar';
        sidebar.id = 'trainerStudioSidebar';
        sidebar.setAttribute('aria-label', 'قائمة Trainer Studio');
        sidebar.innerHTML = `<div class="trainer-studio-sidebar-brand"><span class="trainer-studio-brand-mark"><img src="/assets/logic-fit-app-icon.svg?v=2" alt=""></span><div><strong>Trainer Studio</strong><small>Logic Fit</small></div><button type="button" class="trainer-studio-sidebar-close" id="trainerStudioSidebarClose">×</button></div><div class="trainer-studio-sidebar-scroll">${navGroups.map((group, index) => `<section class="trainer-studio-nav-group" data-studio-group="${groupKeys[index] || 'workspace'}" data-studio-arabic-label="${escapeHtml(group.label)}"><span class="trainer-studio-nav-label">${escapeHtml(group.label)}</span><nav aria-label="${escapeHtml(group.label)}">${group.items.map(([route, , iconName]) => `<a href="/trainer-workspace/${route}" class="trainer-studio-nav-link" data-studio-route="${route}"><span class="trainer-studio-nav-icon">${icon(iconName)}</span><span>${escapeHtml(routeName(route))}</span></a>`).join('')}</nav></section>`).join('')}</div><div class="trainer-studio-sidebar-footer"><span class="trainer-studio-secure-dot"></span><span>مساحة خاصة وآمنة</span></div>`;
        const routeBar = document.createElement('div');
        routeBar.className = 'trainer-studio-route-bar';
        routeBar.id = 'trainerStudioRouteBar';
        routeBar.innerHTML = '<button type="button" class="trainer-studio-menu-button" id="trainerStudioMenuButton" aria-controls="trainerStudioSidebar" aria-expanded="false"><span></span><span></span><span></span></button><div><span class="trainer-studio-route-eyebrow" id="trainerStudioRouteEyebrow"></span><h2 id="trainerStudioRouteTitle"></h2></div><div class="trainer-studio-route-meta"><span class="trainer-studio-live-indicator"></span><span></span></div>';
        content.prepend(routeBar);
        const dynamic = document.createElement('section');
        dynamic.id = 'trainerStudioDynamicView';
        dynamic.className = 'trainer-studio-dynamic-view';
        dynamic.hidden = true;
        content.append(dynamic);
        observeTrainerStudioContent(dynamic);
        shell.append(sidebar, content);
        $('.trainer-workspace-nav')?.setAttribute('hidden', '');
        markStaticSurfaces();
        $('#trainerStudioMenuButton')?.addEventListener('click', () => setSidebarOpen(true));
        $('#trainerStudioSidebarClose')?.addEventListener('click', () => setSidebarOpen(false));
        $$('.trainer-studio-nav-link').forEach((link) => link.addEventListener('click', (event) => {
            event.preventDefault();
            if (trainerFeatureAccess(link.dataset.studioRoute).allowed !== true) return;
            navigate(link.dataset.studioRoute);
        }));
        applyTrainerEntitlementVisibility();
        window.addEventListener('popstate', () => {
            const route = resolveRoute();
            renderRoute(route);
            document.dispatchEvent(new CustomEvent('trainer-studio-route-enter', { detail: { route } }));
        });
        localizeStudioShell();
    }

    function markStaticSurfaces() {
        const marks = [['.trainer-welcome-strip', 'dashboard'], ['.trainer-workspace-summary', 'dashboard'], ['.trainer-quick-actions', 'dashboard'], ['#trainerToday', 'dashboard'], ['#trainerClients', 'clients'], ['#trainerPackages', 'packages'], ['#trainerPurchases', 'sales'], ['#trainerReports', 'reports']];
        marks.forEach(([selector, route]) => {
            const element = $(selector);
            if (!element) return;
            element.dataset.studioSurface = route;
            if (selector === '.trainer-welcome-strip') element.hidden = true;
            if (['clients', 'packages', 'sales', 'reports'].includes(route)) observeTrainerStudioContent(element);
        });
        ['trainerClientDialog', 'trainerClientDetailsDialog', 'trainerTimelineDialog', 'trainerMeasurementDialog', 'trainerCheckinDialog', 'trainerPackageDialog', 'trainerSessionDialog', 'trainerPurchaseDialog', 'trainerPaymentDialog']
            .forEach((id) => observeTrainerStudioContent(document.getElementById(id)));
    }

    const trainerContentLocaleSkip = [
        '.trainer-studio-row-main',
        '.trainer-clients-list', '.trainer-compact-list', '.trainer-reports-grid', '.trainer-inline-message',
        '.trainer-client-details', '.trainer-timeline-list',
        '.trainer-studio-plan-card h3', '.trainer-studio-plan-card > p', '.trainer-studio-plan-features',
        '.trainer-library-visual-card', '.trainer-library-card-content',
        '.trainer-studio-notification-row', '.trainer-studio-settings-card h2',
        '.trainer-studio-plan-price', '.trainer-ai-draft-head h2', '.trainer-ai-draft-head > div > p',
        '.trainer-ai-draft-list', '.trainer-ai-draft-metrics strong', '.trainer-ai-warning > span'
    ].join(',');

    function localizeTrainerStudioContent(root = $('#trainerStudioDynamicView')) {
        const i18n = window.TopGymI18n;
        if (!root || !i18n?.annotateText) return;
        i18n.annotateText(root, 'trainerWorkspaceScreen.', trainerContentLocaleSkip);
        i18n.annotateText(root, 'trainerStudioV2.ui.', trainerContentLocaleSkip);
        i18n.annotateText(root, 'saasBilling.', trainerContentLocaleSkip);
    }

    function observeTrainerStudioContent(root) {
        if (!root || root.dataset.studioLocaleObserver === 'ready' || typeof MutationObserver !== 'function') return;
        root.dataset.studioLocaleObserver = 'ready';
        const observer = new MutationObserver(() => localizeTrainerStudioContent(root));
        observer.observe(root, { childList: true, subtree: true });
        localizeTrainerStudioContent(root);
    }

    function setSidebarOpen(open) {
        document.body.classList.toggle('trainer-sidebar-open', Boolean(open));
        const button = $('#trainerStudioMenuButton');
        button?.setAttribute('aria-expanded', String(Boolean(open)));
    }

    function resolveRoute() {
        const prefix = '/trainer-workspace';
        const path = window.location.pathname.startsWith(prefix) ? window.location.pathname.slice(prefix.length) : '';
        const route = path.split('/').filter(Boolean)[0] || 'dashboard';
        return routeMeta[route] ? route : 'dashboard';
    }

    function navigate(route) {
        const nextRoute = routeMeta[route] ? route : 'dashboard';
        closeLegacyDialogs();
        const nextPath = `/trainer-workspace/${nextRoute}`;
        if (window.location.pathname !== nextPath) window.history.pushState({ route: nextRoute }, '', nextPath);
        renderRoute(nextRoute);
        document.dispatchEvent(new CustomEvent('trainer-studio-route-enter', { detail: { route: nextRoute } }));
        setSidebarOpen(false);
    }

    function closeLegacyDialogs() {
        $$('dialog[open]').forEach((dialog) => {
            try { dialog.close(); } catch (_) { dialog.removeAttribute('open'); }
        });
    }

    function setRouteChrome(route) {
        const meta = routeMeta[route] || routeMeta.dashboard;
        const title = $('#trainerStudioRouteTitle');
        const eyebrow = $('#trainerStudioRouteEyebrow');
        if (title) title.textContent = routeName(route);
        if (eyebrow) eyebrow.textContent = studioT(routeEyebrows[route] || 'eyebrow.workspace', meta.eyebrow);
        $$('.trainer-studio-nav-link').forEach((link) => link.classList.toggle('is-active', link.dataset.studioRoute === route));
        document.body.dataset.trainerRoute = route;
    }

    function hideAllSurfaces() {
        $$('[data-studio-surface]').forEach((element) => { element.hidden = true; });
        const dynamic = $('#trainerStudioDynamicView');
        if (dynamic) dynamic.hidden = true;
    }

    function showStatic(route) {
        $$(`[data-studio-surface="${route}"]`).forEach((element) => { element.hidden = false; });
    }

    function pageFrame(route, content) {
        const meta = routeMeta[route] || routeMeta.dashboard;
        return `<div class="trainer-studio-page-head"><div><p data-i18n="trainerStudioV2.description.${escapeHtml(route)}">${escapeHtml(studioT(`description.${route}`, meta.description))}</p></div><span class="trainer-studio-page-tag">Trainer Studio</span></div>${content}`;
    }

    function emptyState(title, body = 'ستظهر البيانات هنا عند توفرها.', bodyKey = '', titleKey = '') {
        return `<div class="trainer-studio-empty"><span class="trainer-studio-empty-mark">—</span><strong${titleKey ? ` data-i18n="${escapeHtml(titleKey)}"` : ''}>${escapeHtml(title)}</strong>${body ? `<p${bodyKey ? ` data-i18n="${escapeHtml(bodyKey)}"` : ''}>${escapeHtml(body)}</p>` : ''}</div>`;
    }

    function errorState(message) {
        const title = studioT('ui.loadFailure', 'تعذر تحميل هذه المساحة');
        const retry = studioT('ui.retry', 'إعادة المحاولة');
        const description = message || studioT('ui.tryAgain', 'حاول تحديث الصفحة مرة أخرى.');
        return `<div class="trainer-studio-error" role="alert"><strong data-i18n="trainerStudioV2.ui.loadFailure">${escapeHtml(title)}</strong><p${message ? '' : ' data-i18n="trainerStudioV2.ui.tryAgain"'}>${escapeHtml(description)}</p><button type="button" class="btn btn-light btn-small" data-studio-retry data-i18n="trainerStudioV2.ui.retry">${escapeHtml(retry)}</button></div>`;
    }

    function renderListPage(route, title, rows, renderer, emptyTitle, actions = '', emptyBody, emptyBodyKey = '', emptyTitleKey = '') {
        const dynamic = $('#trainerStudioDynamicView');
        if (!dynamic) return;
        const titleKeys = {
            checkins: 'ui.heading.followUps', renewals: 'ui.heading.renewals', portal: 'ui.heading.clientPortal',
            notifications: 'ui.heading.actionCenter', templates: 'ui.heading.templates'
        };
        const displayTitleKey = titleKeys[route] ? `trainerStudioV2.${titleKeys[route]}` : '';
        const displayTitle = titleKeys[route] ? studioT(titleKeys[route], title) : title;
        const routeTitle = routeName(route).replace(/\s+/gu, ' ').trim();
        const repeatsRouteTitle = displayTitle.replace(/\s+/gu, ' ').trim() === routeTitle;
        const renderedRows = rows.length
            ? (renderer.length === 0 ? renderer() : rows.map(renderer).join(''))
            : emptyState(emptyTitle, emptyBody === undefined ? 'ستظهر البيانات هنا عند توفرها.' : emptyBody, emptyBodyKey, emptyTitleKey);
        const panelContext = repeatsRouteTitle ? '' : `<div><span class="trainer-panel-kicker">مصدر البيانات الحالي</span><h2${displayTitleKey ? ` data-i18n="${displayTitleKey}"` : ''}>${displayTitle}</h2></div>`;
        dynamic.innerHTML = pageFrame(route, `<section class="trainer-studio-data-panel"><div class="trainer-studio-data-panel-head">${panelContext}<div class="trainer-studio-panel-actions">${actions}<span class="trainer-studio-count-chip" data-i18n="trainerStudioV2.ui.itemCount" data-i18n-param-count="${rows.length}">${formatNumber(rows.length)} عنصر</span></div></div><div class="trainer-studio-data-list">${renderedRows}</div></section>`);
        dynamic.hidden = false;
    }

    async function renderSessionsPage(route = 'calendar') {
        const dynamic = $('#trainerStudioDynamicView');
        dynamic.innerHTML = pageFrame(route, '<section class="trainer-studio-data-panel"><div class="trainer-studio-loading"><span class="trainer-studio-spinner"></span>جاري تحميل الجدول...</div></section>');
        dynamic.hidden = false;
        try {
            const range = new URLSearchParams(window.location.search).get('range') || 'upcoming';
            const now = new Date();
            const end = new Date(now);
            if (range === 'today') { end.setHours(23, 59, 59, 999); now.setHours(0, 0, 0, 0); }
            if (range === 'week') end.setDate(end.getDate() + 7);
            if (range === 'month') end.setDate(end.getDate() + 31);
            const query = range === 'all' ? '' : `?from=${encodeURIComponent(now.toISOString())}&to=${encodeURIComponent(end.toISOString())}`;
            const payload = await api(`/api/trainer/sessions${query}`);
            const sessions = Array.isArray(payload.sessions) ? payload.sessions : [];
            renderListPage(route, 'جلساتك القادمة', sessions, (item) => `<article class="trainer-studio-data-row"><div class="trainer-studio-row-icon">${icon('calendar')}</div><div class="trainer-studio-row-main"><strong>${escapeHtml(item.clientName || 'عميل')}</strong><span>${formatDate(item.scheduledStart, true)} · ${formatDate(item.scheduledEnd, true)}</span></div><span class="trainer-status-pill trainer-status-pill--${escapeHtml(item.status || 'scheduled')}">${escapeHtml({ scheduled: 'مجدولة', completed: 'مكتملة', cancelled: 'ملغاة', no_show: 'لم يحضر' }[item.status] || item.status || '—')}</span>${item.status === 'scheduled' ? `<button type="button" class="btn btn-light btn-small trainer-studio-row-action" data-studio-session-id="${escapeHtml(item.id)}" data-studio-session-status="completed">إكمال</button><button type="button" class="btn btn-light btn-small trainer-studio-row-action" data-studio-session-id="${escapeHtml(item.id)}" data-studio-session-status="cancelled">إلغاء</button>` : ''}</article>`, 'لا توجد جلسات في الفترة الحالية.', `<label class="trainer-studio-range-control"><span>الفترة</span><select id="trainerStudioSessionRange"><option value="upcoming" ${range === 'upcoming' ? 'selected' : ''}>القادمة</option><option value="today" ${range === 'today' ? 'selected' : ''}>اليوم</option><option value="week" ${range === 'week' ? 'selected' : ''}>7 أيام</option><option value="month" ${range === 'month' ? 'selected' : ''}>31 يومًا</option><option value="all" ${range === 'all' ? 'selected' : ''}>الكل</option></select></label><button type="button" class="btn btn-primary btn-small" data-studio-schedule-session><span>${icon('plus')}</span>جدولة جلسة</button>`);
            $('#trainerStudioSessionRange')?.addEventListener('change', (event) => {
                const next = event.target.value;
                const target = next === 'upcoming' ? `/trainer-workspace/${route}` : `/trainer-workspace/${route}?range=${encodeURIComponent(next)}`;
                window.history.replaceState({ route }, '', target);
                renderSessionsPage(route);
            });
        } catch (error) { dynamic.innerHTML = pageFrame(route, errorState(error.message)); }
    }

    async function getTrainerClients() {
        const payload = await api('/api/trainer/clients?page=1&pageSize=100');
        return Array.isArray(payload.clients) ? payload.clients : [];
    }

    async function getBuilderCatalog() {
        const payload = await api('/api/trainer/library/catalog');
        return {
            exercises: Array.isArray(payload.exercises) ? payload.exercises : [],
            foods: Array.isArray(payload.foods) ? payload.foods : [],
            muscles: Array.isArray(payload.muscles) ? payload.muscles : [],
            options: payload.options || {},
            pagination: payload.pagination || {}
        };
    }

    function selectOptions(items, valueKey, labelKey, placeholder) {
        return `<option value="">${placeholder}</option>${items.map((item) => `<option value="${escapeHtml(item[valueKey])}">${escapeHtml(item[labelKey] || item.name || item.nameAr || '—')}</option>`).join('')}`;
    }

    function renderPlanEditor(route, isNutrition, clients, catalog) {
        const exerciseOptions = selectOptions(catalog.exercises || [], 'id', 'nameAr', 'اختر تمرينًا');
        const foodOptions = selectOptions(catalog.foods || [], 'id', 'nameAr', 'اختر طعامًا');
        const clientOptions = selectOptions(clients, 'id', 'fullName', 'اختر العميل');
        return `<section class="trainer-studio-editor-panel" aria-labelledby="trainerStudioEditorTitle"><div class="trainer-studio-data-panel-head"><div><span class="trainer-panel-kicker">عملية مرتبطة ببيانات فعلية</span><h2 id="trainerStudioEditorTitle">${isNutrition ? 'إنشاء خطة تغذية' : 'إنشاء خطة تدريب'}</h2></div><button type="button" class="btn btn-light btn-small" data-studio-close-editor>إغلاق</button></div><form class="trainer-studio-editor-form" id="trainerStudioPlanForm" data-plan-kind="${isNutrition ? 'nutrition' : 'training'}"><div class="trainer-studio-editor-grid"><label>العميل<select name="clientId" required>${clientOptions}</select></label><label>اسم الخطة<input name="name" required maxlength="160" placeholder="مثال: برنامج القوة — المرحلة الأولى"></label><label>تاريخ البداية<input name="startDate" type="date" required></label><label>المدة ${isNutrition ? 'بالأيام' : 'بالأسابيع'}<input name="duration" type="number" min="1" max="520" value="${isNutrition ? '' : '4'}" required></label>${isNutrition ? `<label>اسم الوجبة<input name="mealName" required maxlength="120" value="الإفطار"></label><label>الطعام<select name="foodId" required>${foodOptions}</select></label><label>الكمية<input name="quantity" type="number" min="0.001" step="0.001" value="100" required></label><label>الوحدة<input name="unit" maxlength="40" value="جرام"></label><label>السعرات المستهدفة<input name="targetCalories" type="number" min="0" step="1"></label><label>البروتين المستهدف<input name="targetProtein" type="number" min="0" step="0.1"></label>` : `<label>الهدف<input name="goal" maxlength="60" placeholder="مثال: بناء القوة"></label><label>المستوى<select name="level"><option value="beginner">مبتدئ</option><option value="intermediate" selected>متوسط</option><option value="advanced">متقدم</option></select></label><label>اسم يوم التدريب<input name="routineName" required maxlength="160" value="اليوم الأول"></label><label>يوم الأسبوع<input name="dayOfWeek" type="number" min="1" max="7" value="1" required></label><label>التمرين<select name="exerciseId" required>${exerciseOptions}</select></label><label>المجموعات<input name="sets" type="number" min="1" max="100" value="3" required></label><label>التكرارات<input name="reps" type="number" min="1" max="1000" value="10" required></label><label>الراحة بالثواني<input name="restSeconds" type="number" min="0" max="7200" value="60" required></label>`}</div><p class="trainer-studio-form-message" id="trainerStudioPlanMessage" role="alert"></p><div class="trainer-studio-editor-actions"><button type="submit" class="btn btn-primary" data-studio-save-plan><span>${icon('plus')}</span>حفظ الخطة</button></div></form></section>`;
    }

    function localizePlanEditor() {
        const form = $('#trainerStudioPlanForm');
        if (!form) return;
        const labels = {
            clientId: 'plan.client', name: 'plan.name', startDate: 'plan.startDate', duration: 'plan.duration',
            mealName: 'plan.mealName', foodId: 'plan.food', quantity: 'plan.quantity', unit: 'plan.unit',
            targetCalories: 'plan.targetCalories', targetProtein: 'plan.targetProtein', goal: 'plan.goal',
            level: 'plan.level', routineName: 'plan.routineName', dayOfWeek: 'plan.dayOfWeek',
            exerciseId: 'plan.exercise', sets: 'plan.sets', reps: 'plan.reps', restSeconds: 'plan.restSeconds'
        };
        Object.entries(labels).forEach(([name, key]) => {
            const control = form.elements.namedItem(name);
            const label = control?.closest('label');
            const textNode = label && [...label.childNodes].find((node) => node.nodeType === Node.TEXT_NODE && node.nodeValue.trim());
            if (textNode) textNode.nodeValue = studioT(key, textNode.nodeValue.trim());
        });
        const durationText = form.elements.namedItem('duration')?.closest('label')?.childNodes;
        const durationNode = durationText && [...durationText].find((node) => node.nodeType === Node.TEXT_NODE && node.nodeValue.trim());
        if (durationNode) {
            const unitKey = form.dataset.planKind === 'nutrition' ? 'plan.days' : 'plan.weeks';
            durationNode.nodeValue = `${studioT('plan.duration', 'Duration')} ${studioT(unitKey, form.dataset.planKind === 'nutrition' ? 'in days' : 'in weeks')}`;
        }
        const levels = { beginner: 'plan.level.beginner', intermediate: 'plan.level.intermediate', advanced: 'plan.level.advanced' };
        form.querySelectorAll('[name="level"] option').forEach((option) => {
            if (levels[option.value]) option.textContent = studioT(levels[option.value], option.textContent);
        });
        const heading = $('#trainerStudioEditorTitle');
        if (heading) heading.textContent = studioT(form.dataset.planKind === 'nutrition' ? 'plan.createNutrition' : 'plan.createTraining', heading.textContent);
        const panelKicker = form.closest('.trainer-studio-editor-panel')?.querySelector('.trainer-panel-kicker');
        if (panelKicker) panelKicker.textContent = studioT('plan.dataBacked', panelKicker.textContent);
        const close = $('[data-studio-close-editor]');
        if (close) close.textContent = studioT('ui.close', close.textContent);
        const save = $('[data-studio-save-plan]');
        if (save) {
            const textNode = [...save.childNodes].find((node) => node.nodeType === Node.TEXT_NODE && node.nodeValue.trim());
            if (textNode) textNode.nodeValue = studioT('plan.save', textNode.nodeValue.trim());
        }
    }

    async function openPlanEditor(route, isNutrition) {
        const dynamic = $('#trainerStudioDynamicView');
        dynamic.innerHTML = pageFrame(route, '<section class="trainer-studio-data-panel"><div class="trainer-studio-loading"><span class="trainer-studio-spinner"></span>جاري تجهيز النموذج...</div></section>');
        try {
            const [clients, catalog] = await Promise.all([getTrainerClients(), getBuilderCatalog()]);
            dynamic.innerHTML = pageFrame(route, renderPlanEditor(route, isNutrition, clients, catalog));
            localizePlanEditor();
            const form = $('#trainerStudioPlanForm');
            form?.addEventListener('submit', async (event) => {
                event.preventDefault();
                const data = new FormData(form);
                const message = $('#trainerStudioPlanMessage');
                const save = $('[data-studio-save-plan]');
                save.disabled = true;
                try {
                    const clientId = Number(data.get('clientId'));
                    if (!clientId) throw new Error('اختر العميل أولًا.');
                    const startDate = String(data.get('startDate') || '').trim();
                    if (!startDate) throw new Error('حدد تاريخ البداية.');
                    const payload = isNutrition ? {
                        clientId, name: data.get('name'), startDate, mealsPerDay: 1,
                        targetCalories: data.get('targetCalories') || null, targetProtein: data.get('targetProtein') || null,
                        meals: [{ name: data.get('mealName'), mealTime: '08:00', sortOrder: 0, items: [{ foodId: Number(data.get('foodId')), assignedQuantity: Number(data.get('quantity')), servingUnit: data.get('unit') }] }]
                    } : {
                        clientId, name: data.get('name'), startDate, durationWeeks: Number(data.get('duration')), daysPerWeek: 1,
                        goal: data.get('goal'), level: data.get('level'), routines: [{ name: data.get('routineName'), dayOfWeek: Number(data.get('dayOfWeek')), sortOrder: 0, exercises: [{ exerciseId: Number(data.get('exerciseId')), sets: Number(data.get('sets')), repsMin: Number(data.get('reps')), repsMax: Number(data.get('reps')), restSeconds: Number(data.get('restSeconds')) }] }]
                    };
                    await api(isNutrition ? '/api/trainer/nutrition-plans' : '/api/trainer/training-plans', { method: 'POST', body: JSON.stringify(payload) });
                    await renderTrainingPage(route, isNutrition);
                } catch (error) { message.textContent = error.message || 'تعذر حفظ الخطة.'; }
                finally { save.disabled = false; }
            });
            $('[data-studio-close-editor]')?.addEventListener('click', () => renderTrainingPage(route, isNutrition));
        } catch (error) { dynamic.innerHTML = pageFrame(route, errorState(error.message)); }
    }

    async function renderTrainingPage(route, isNutrition = false) {
        const dynamic = $('#trainerStudioDynamicView');
        dynamic.innerHTML = pageFrame(route, '<section class="trainer-studio-data-panel"><div class="trainer-studio-loading"><span class="trainer-studio-spinner"></span>جاري تحميل الخطط...</div></section>');
        dynamic.hidden = false;
        try {
            const payload = await api(isNutrition ? '/api/trainer/nutrition-plans' : '/api/trainer/training-plans');
            const plans = Array.isArray(payload.plans) ? payload.plans : [];
            const statusLabel = (status) => {
                const normalized = String(status || 'active').toLowerCase();
                const key = ['active', 'archived'].includes(normalized) ? `ui.planStatus.${normalized}` : '';
                return key ? studioT(key, normalized) : String(status || studioT('ui.planStatus.active', 'نشطة'));
            };
            renderListPage(route, isNutrition ? 'خطط التغذية المحفوظة' : 'خطط التدريب المحفوظة', plans, (item) => {
                const archived = item.status === 'archived';
                const normalizedStatus = String(item.status || 'active').toLowerCase();
                const statusKey = ['active', 'archived'].includes(normalizedStatus) ? `trainerStudioV2.ui.planStatus.${normalizedStatus}` : '';
                const actionKey = archived ? 'ui.reactivate' : 'ui.archive';
                return `<article class="trainer-studio-data-row"><div class="trainer-studio-row-icon">${icon(isNutrition ? 'activity' : 'plan')}</div><div class="trainer-studio-row-main"><strong>${escapeHtml(item.name || studioT('ui.plan.fallbackName', 'خطة بدون اسم'))}</strong><span>${escapeHtml(item.memberName || item.clientName || studioT('ui.plan.fallbackClient', 'مرتبطة بعميل'))} · ${escapeHtml(item.goal || item.level || item.status || studioT('ui.plan.fallbackDetails', 'بيانات محفوظة'))}</span></div><span class="trainer-status-pill trainer-status-pill--${escapeHtml(item.status || 'active')}"${statusKey ? ` data-i18n="${statusKey}"` : ''}>${escapeHtml(statusLabel(item.status))}</span><button type="button" class="btn btn-light btn-small trainer-studio-row-action" data-studio-plan-id="${escapeHtml(item.id)}" data-studio-plan-kind="${isNutrition ? 'nutrition' : 'training'}" data-studio-plan-status="${archived ? 'active' : 'archived'}" data-i18n="trainerStudioV2.${actionKey}">${escapeHtml(studioT(actionKey, archived ? 'إعادة تفعيل' : 'أرشفة'))}</button></article>`;
            }, isNutrition ? 'لا توجد خطط تغذية محفوظة.' : 'لا توجد خطط تدريب محفوظة.', `<button type="button" class="btn btn-primary btn-small" data-studio-open-editor><span>${icon('plus')}</span>إنشاء خطة</button>`);
        } catch (error) { dynamic.innerHTML = pageFrame(route, errorState(error.message)); }
    }

    let trainerLibraryState = { type: 'exercises', catalog: null };

    function trainerLibraryLabel(type, item) {
        if (type === 'foods') return item.nameAr || item.nameEn || 'طعام';
        if (type === 'muscles') return item.nameAr || item.name || 'عضلة';
        return item.nameAr || item.name || 'تمرين';
    }

    function renderTrainerLibraryItems(type, items) {
        if (!items.length) return emptyState(type === 'foods' ? 'لا توجد أطعمة مطابقة.' : type === 'muscles' ? 'لا توجد عضلات مطابقة.' : 'لا توجد تمارين مطابقة.', 'جرّب كلمة بحث أو تصنيفًا مختلفًا.');
        return items.slice(0, 100).map((item) => {
            const label = trainerLibraryLabel(type, item);
            const detail = type === 'foods'
                ? `${formatNumber(item.calories)} سعرة · ${formatNumber(item.protein)}g بروتين · ${escapeHtml(item.servingSize || 0)} ${escapeHtml(item.servingUnit || '')}`
                : type === 'muscles'
                    ? `${escapeHtml(item.bodyPart || 'منطقة عضلية')} · ${escapeHtml(item.descriptionAr || item.description || 'مرجع لاختيار التمرين')}`
                    : `${escapeHtml(item.targetMuscleNameAr || item.targetMuscleName || item.category || 'عضلة مستهدفة غير محددة')} · ${escapeHtml(item.difficulty || 'كل المستويات')}`;
            return `<article class="trainer-studio-exercise-card trainer-library-card"><div class="trainer-studio-row-icon">${icon(type === 'foods' ? 'activity' : type === 'muscles' ? 'chart' : 'book')}</div><strong>${escapeHtml(label)}</strong><span>${detail}</span>${type === 'exercises' && item.equipment ? `<small>${escapeHtml(item.equipment)}</small>` : ''}</article>`;
        }).join('');
    }

    const trainerCatalogMeta = Object.freeze({
        exercises: { title: 'مكتبة التمارين', eyebrow: 'المكتبة المصورة', search: 'ابحث باسم التمرين أو العضلة أو المعدة...', empty: 'لا توجد تمارين مطابقة.' },
        muscles: { title: 'العضلات', eyebrow: 'خريطة الجسم', search: 'ابحث باسم العضلة أو منطقة الجسم...', empty: 'لا توجد عضلات مطابقة.' },
        foods: { title: 'مكتبة الأطعمة', eyebrow: 'التغذية المصورة', search: 'ابحث باسم الطعام أو التصنيف...', empty: 'لا توجد أطعمة مطابقة.' }
    });

    function catalogTag(label, tone = 'neutral') {
        return label ? `<span class="trainer-library-tag trainer-library-tag--${tone}">${escapeHtml(label)}</span>` : '';
    }

    function catalogMedia(type, item) {
        const title = trainerLibraryLabel(type, item);
        if (type === 'exercises' && window.TopGymExerciseAssets?.imageMarkup) {
            return window.TopGymExerciseAssets.imageMarkup(item, 'start', { className: 'trainer-library-card-media', alt: title, loading: 'lazy' });
        }
        if (type === 'muscles' && window.TopGymMuscleAssets?.imageMarkup) {
            return window.TopGymMuscleAssets.imageMarkup(item, 'main', { className: 'trainer-library-card-media', alt: title, loading: 'lazy' });
        }
        if (type === 'foods' && window.TopGymFoodAssets?.imageMarkup) {
            return window.TopGymFoodAssets.imageMarkup(item, { className: 'trainer-library-card-media', alt: title, loading: 'lazy' });
        }
        return `<span class="trainer-library-card-media trainer-library-card-media--fallback" aria-hidden="true"></span>`;
    }

    function renderCatalogCard(type, item) {
        const title = trainerLibraryLabel(type, item);
        const english = type === 'foods' ? item.nameEn : item.name;
        const tags = type === 'exercises'
            ? [catalogTag(item.targetMuscleNameAr || item.targetMuscleName, 'primary'), catalogTag(item.equipment, 'sky'), catalogTag(item.difficulty, 'neutral')].join('')
            : type === 'muscles'
                ? [catalogTag(item.bodyPart, 'primary'), catalogTag(item.name, 'sky')].join('')
                : [catalogTag(`${formatNumber(item.calories)} سعرة`, 'primary'), catalogTag(`${formatNumber(item.protein, 1)}g بروتين`, 'mint'), catalogTag(item.category, 'neutral')].join('');
        const detail = type === 'exercises'
            ? (item.descriptionAr || item.description || 'تمرين جاهز للاستخدام داخل برنامج تدريبي.')
            : type === 'muscles'
                ? (item.descriptionAr || item.description || 'معلومة تشريحية تساعدك على اختيار التمرين المناسب.')
                : `${formatNumber(item.carbs, 1)}g كربوهيدرات · ${formatNumber(item.fat, 1)}g دهون لكل ${formatNumber(item.servingSize, 1)} ${item.servingUnit || 'حصة'}`;
        return `<article class="trainer-library-visual-card trainer-library-visual-card--${type}">
            <div class="trainer-library-card-media-wrap">${catalogMedia(type, item)}<span class="trainer-library-card-index">${escapeHtml(type === 'exercises' ? 'تمرين' : type === 'muscles' ? 'عضلة' : 'طعام')}</span></div>
            <div class="trainer-library-card-body"><div class="trainer-library-card-heading"><div><h3>${escapeHtml(title)}</h3>${english ? `<small dir="ltr">${escapeHtml(english)}</small>` : ''}</div><span class="trainer-library-card-arrow" aria-hidden="true">↗</span></div><p>${escapeHtml(detail)}</p><div class="trainer-library-tags">${tags}</div></div>
        </article>`;
    }

    function renderCatalogGrid(type, items) {
        if (!items.length) return emptyState(trainerCatalogMeta[type].empty, 'جرّب كلمة بحث أو تصنيفًا مختلفًا.');
        return items.map((item) => renderCatalogCard(type, item)).join('');
    }

    async function renderTrainerCatalogPage(type = 'exercises', page = 1, search = '') {
        const dynamic = $('#trainerStudioDynamicView');
        const meta = trainerCatalogMeta[type] || trainerCatalogMeta.exercises;
        const catalogTitle = studioT(`route.${type}`, meta.title);
        const catalogSearch = studioT(type === 'exercises' ? 'ui.library.searchExercisePlaceholder' : 'ui.library.searchPlaceholder', meta.search);
        dynamic.innerHTML = pageFrame(type, `<section class="trainer-library-loading"><span class="trainer-studio-spinner"></span>${studioT('ui.loading.library', 'جاري تجهيز المكتبة المصورة...')}</section>`);
        dynamic.hidden = false;
        try {
            const [optionsPayload, collection] = await Promise.all([
                api('/api/trainer/library/options'),
                api(`/api/trainer/library/${encodeURIComponent(type)}?page=${Number(page) || 1}&pageSize=48&search=${encodeURIComponent(search)}`)
            ]);
            const items = Array.isArray(collection.items) ? collection.items : [];
            if (type === 'exercises') await (window.TopGymExerciseAssets?.load?.() || Promise.resolve()).catch(() => null);
            if (type === 'muscles') await (window.TopGymMuscleAssets?.load?.() || Promise.resolve()).catch(() => null);
            const counts = optionsPayload.counts || {};
            const pagination = collection.pagination || { page: 1, totalPages: 1, totalItems: items.length };
            const stat = type === 'exercises' ? counts.exercises : type === 'muscles' ? counts.muscles : counts.foods;
            dynamic.innerHTML = pageFrame(type, `<section class="trainer-library-page" data-trainer-library-type="${escapeHtml(type)}">
                <header class="trainer-library-hero"><div class="trainer-library-hero-mark" aria-hidden="true">${type === 'exercises' ? '✦' : type === 'muscles' ? '◌' : '◈'}</div><div><span class="trainer-panel-kicker">${studioT('eyebrow.library', meta.eyebrow)}</span><h2>${catalogTitle}</h2><p>${studioT('ui.library.description', 'استخدم الكتالوج المصور لبناء برامج تدريب دقيقة ومناسبة لكل عميل.')}</p></div><div class="trainer-library-hero-stat"><strong>${formatNumber(stat)}</strong><span>${studioT('ui.availableItemCount', 'عنصر متاح', { count: formatNumber(stat) })}</span></div></header>
                <section class="trainer-library-toolbar" aria-label="${studioT('ui.library.search', 'بحث المكتبة')}"><form id="trainerCatalogSearchForm" class="trainer-library-search-form"><label><span class="sr-only">${catalogSearch}</span><span class="trainer-library-search-icon" aria-hidden="true">⌕</span><input id="trainerCatalogSearch" type="search" value="${escapeHtml(search)}" placeholder="${catalogSearch}" autocomplete="off"></label><button type="submit" class="btn btn-primary btn-small">${studioT('ui.search', 'بحث')}</button></form><div class="trainer-library-toolbar-meta"><span class="trainer-studio-count-chip">${studioT(type === 'exercises' ? 'ui.exerciseCount' : 'ui.itemCount', '{{count}} عنصر', { count: formatNumber(pagination.totalItems) })}</span>${type === 'exercises' ? `<button type="button" class="btn btn-light btn-small" data-studio-go-training>${studioT('ui.library.trainingProgram', 'إنشاء برنامج من المكتبة')}</button>` : ''}</div></section>
                <div class="trainer-library-grid" id="trainerCatalogGrid">${items.length ? renderCatalogGrid(type, items) : emptyState(studioT('ui.noData', meta.empty), studioT('ui.library.helper', 'جرّب كلمة بحث أو تصنيفًا مختلفًا.'))}</div>
                <footer class="trainer-library-pagination"><span>${studioT('ui.library.page', 'صفحة {{page}} من {{total}}', { page: formatNumber(pagination.page), total: formatNumber(pagination.totalPages) })}</span><div><button type="button" class="btn btn-light btn-small" data-trainer-catalog-page="${Math.max(1, Number(pagination.page) - 1)}" ${pagination.page <= 1 ? 'disabled' : ''}>${studioT('ui.previous', 'السابق')}</button><button type="button" class="btn btn-light btn-small" data-trainer-catalog-page="${Math.min(Number(pagination.totalPages), Number(pagination.page) + 1)}" ${pagination.page >= pagination.totalPages ? 'disabled' : ''}>${studioT('ui.next', 'التالي')}</button></div></footer>
            </section>`);
            window.TopGymExerciseAssets?.hydrate?.(dynamic);
            window.TopGymMuscleAssets?.hydrate?.(dynamic);
            window.TopGymFoodAssets?.hydrate?.(dynamic);
            $('#trainerCatalogSearchForm')?.addEventListener('submit', (event) => { event.preventDefault(); renderTrainerCatalogPage(type, 1, $('#trainerCatalogSearch')?.value.trim() || ''); });
            $$('[data-trainer-catalog-page]').forEach((button) => button.addEventListener('click', () => renderTrainerCatalogPage(type, Number(button.dataset.trainerCatalogPage), search)));
        } catch (error) {
            dynamic.innerHTML = pageFrame(type, errorState(error.message));
        }
    }

    async function renderTrainerLibraryPage() {
        const dynamic = $('#trainerStudioDynamicView');
        dynamic.innerHTML = pageFrame('exercises', '<section class="trainer-studio-data-panel"><div class="trainer-studio-loading"><span class="trainer-studio-spinner"></span>جاري تحميل التمارين والتغذية والعضلات...</div></section>');
        dynamic.hidden = false;
        try {
            const payload = await api('/api/trainer/library/catalog');
            trainerLibraryState = { type: 'exercises', catalog: payload };
            const types = [['exercises', 'التمارين'], ['foods', 'التغذية والأطعمة'], ['muscles', 'العضلات']];
            const currentItems = Array.isArray(payload.exercises) ? payload.exercises : [];
            dynamic.innerHTML = pageFrame('exercises', `<section class="trainer-studio-data-panel trainer-library-panel"><div class="trainer-studio-data-panel-head"><div><span class="trainer-panel-kicker">المصدر المشترك الآمن</span><h2>مكتبة المدرب</h2><p class="trainer-library-subtitle">نفس كتالوج الجيم، معزول داخل مساحة المدرب ويُستخدم مباشرة داخل محرر الخطط.</p></div><span class="trainer-studio-count-chip">${formatNumber(payload.options?.counts?.exercises || currentItems.length)} تمرين · ${formatNumber(payload.options?.counts?.foods || payload.foods?.length || 0)} طعام</span></div><div class="trainer-library-tabs" role="tablist">${types.map(([type, label]) => `<button type="button" class="trainer-library-tab ${type === 'exercises' ? 'is-active' : ''}" role="tab" aria-selected="${type === 'exercises'}" data-trainer-library-tab="${type}">${label}<span>${formatNumber(payload.options?.counts?.[type] || payload[type]?.length || 0)}</span></button>`).join('')}</div><label class="trainer-studio-search"><span class="sr-only">بحث في مكتبة المدرب</span>${icon('activity')}<input type="search" id="trainerStudioLibrarySearch" placeholder="ابحث باسم التمرين أو الطعام أو العضلة..."></label><div class="trainer-studio-exercise-grid" id="trainerStudioLibraryGrid">${renderTrainerLibraryItems('exercises', currentItems)}</div><p class="trainer-library-pagination-note">يعرض الكتالوج أول 100 عنصر مع دعم البحث داخل المصدر المشترك. اختر عنصرًا لاستخدامه في محرر الخطة.</p></section>`);
            $$('.trainer-library-tab').forEach((button) => button.addEventListener('click', () => {
                const type = button.dataset.trainerLibraryTab;
                trainerLibraryState.type = type;
                $$('.trainer-library-tab').forEach((tab) => { const active = tab === button; tab.classList.toggle('is-active', active); tab.setAttribute('aria-selected', String(active)); });
                const term = String($('#trainerStudioLibrarySearch')?.value || '').trim().toLowerCase();
                const items = Array.isArray(payload[type]) ? payload[type] : [];
                $('#trainerStudioLibraryGrid').innerHTML = renderTrainerLibraryItems(type, term ? items.filter((item) => JSON.stringify(item).toLowerCase().includes(term)) : items);
            }));
            $('#trainerStudioLibrarySearch')?.addEventListener('input', (event) => {
                const term = event.target.value.trim().toLowerCase();
                const items = Array.isArray(payload[trainerLibraryState.type]) ? payload[trainerLibraryState.type] : [];
                $('#trainerStudioLibraryGrid').innerHTML = renderTrainerLibraryItems(trainerLibraryState.type, term ? items.filter((item) => JSON.stringify(item).toLowerCase().includes(term)) : items);
            });
        } catch (error) { dynamic.innerHTML = pageFrame('exercises', errorState(error.message)); }
    }

    async function renderExercisesPage() {
        const dynamic = $('#trainerStudioDynamicView');
        dynamic.innerHTML = pageFrame('exercises', '<section class="trainer-studio-data-panel"><div class="trainer-studio-loading"><span class="trainer-studio-spinner"></span>جاري تحميل المكتبة...</div></section>');
        dynamic.hidden = false;
        try {
            const payload = await api('/api/trainer/library/catalog');
            const exercises = Array.isArray(payload.exercises) ? payload.exercises : [];
            dynamic.innerHTML = pageFrame('exercises', `<section class="trainer-studio-data-panel"><div class="trainer-studio-data-panel-head"><div><span class="trainer-panel-kicker">المكتبة المشتركة الآمنة</span><h2>مكتبة التمارين</h2></div><span class="trainer-studio-count-chip">${formatNumber(exercises.length)} تمرين</span></div><label class="trainer-studio-search"><span class="sr-only">بحث في التمارين</span>${icon('activity')}<input type="search" id="trainerStudioExerciseSearch" placeholder="ابحث باسم التمرين أو العضلة..."></label><div class="trainer-studio-exercise-grid" id="trainerStudioExerciseGrid">${renderExerciseRows(exercises)}</div></section>`);
            $('#trainerStudioExerciseSearch')?.addEventListener('input', (event) => { const term = event.target.value.trim().toLowerCase(); $('#trainerStudioExerciseGrid').innerHTML = renderExerciseRows(exercises.filter((item) => `${item.nameAr || ''} ${item.name || ''} ${item.muscle || ''} ${item.bodyPart || ''}`.toLowerCase().includes(term))); });
        } catch (error) { dynamic.innerHTML = pageFrame('exercises', errorState(error.message)); }
    }

    function renderExerciseRows(exercises) {
        if (!exercises.length) return emptyState('لا توجد تمارين مطابقة.', 'جرّب كلمة بحث مختلفة.');
        return exercises.slice(0, 80).map((item) => `<article class="trainer-studio-exercise-card"><div class="trainer-studio-row-icon">${icon('activity')}</div><strong>${escapeHtml(item.nameAr || item.name || 'تمرين')}</strong><span>${escapeHtml(item.bodyPart || item.muscle || item.category || 'تصنيف غير محدد')}</span></article>`).join('');
    }

    async function renderClientsDataPage(route, kind) {
        const dynamic = $('#trainerStudioDynamicView');
        dynamic.innerHTML = pageFrame(route, '<section class="trainer-studio-data-panel"><div class="trainer-studio-loading"><span class="trainer-studio-spinner"></span>جاري تحميل ملفات العملاء...</div></section>');
        dynamic.hidden = false;
        try {
            const payload = await api('/api/trainer/clients?page=1&pageSize=100');
            const clients = Array.isArray(payload.clients) ? payload.clients : [];
            const renderer = (item) => {
                if (kind === 'checkins') {
                    const reasonKeys = {
                        assessment_due: 'ui.followUpReason.assessmentDue',
                        checkin_due: 'ui.followUpReason.checkinDue',
                        package_expiring: 'ui.followUpReason.packageExpiring',
                        payment_outstanding: 'ui.followUpReason.paymentOutstanding'
                    };
                    const reasons = (item.reasons || []).map((reason) => studioT(reasonKeys[reason] || '', reason)).join(' · ');
                    const statusKey = item.lastCheckinAt ? 'ui.followUpPresent' : 'ui.followUpNeeded';
                    const statusFallback = item.lastCheckinAt ? 'Follow-up recorded' : 'Follow-up needed';
                    return `<article class="trainer-studio-data-row"><div class="trainer-studio-row-icon trainer-studio-row-icon--warning">${icon('activity')}</div><div class="trainer-studio-row-main"><strong>${escapeHtml(item.clientName)}</strong><span>${escapeHtml(reasons)}</span></div><span class="trainer-status-pill trainer-status-pill--${item.lastCheckinAt ? 'active' : 'scheduled'}">${escapeHtml(studioT(statusKey, statusFallback))}</span><span class="trainer-studio-inline-number">${formatMoney(item.outstandingBalance)}</span><button type="button" class="btn btn-light btn-small trainer-studio-row-action" data-studio-open-client="${escapeHtml(item.clientId)}">${escapeHtml(studioT('ui.openProfile', 'Open profile'))}</button></article>`;
                }
                if (kind === 'progress') {
                    const summary = studioT('ui.trainingFoodMeasurementCount', '{{training}} training · {{nutrition}} nutrition · {{measurement}} measurements', {
                        training: formatNumber(item.workoutCount),
                        nutrition: formatNumber(item.nutritionCount),
                        measurement: formatNumber(item.measurementCount)
                    });
                    return `<article class="trainer-studio-data-row"><div class="trainer-studio-row-icon">${icon('chart')}</div><div class="trainer-studio-row-main"><strong>${escapeHtml(item.fullName)}</strong><span>${escapeHtml(summary)}</span></div><span class="trainer-studio-inline-number">${formatNumber(item.checkinCount)}</span><button type="button" class="btn btn-light btn-small trainer-studio-row-action" data-studio-open-client="${escapeHtml(item.id)}">${escapeHtml(studioT('ui.openProfile', 'Open profile'))}</button></article>`;
                }
                if (kind === 'measurements') {
                    const measurementCount = studioT('ui.measurementCount', '{{count}} measurements', { count: formatNumber(item.measurementCount) });
                    const measurementDate = item.lastMeasurementAt
                        ? studioT('ui.lastMeasurementUpdate', 'Last updated {{date}}', { date: formatDate(item.lastMeasurementAt) })
                        : studioT('ui.noMeasurementRecorded', 'No measurement recorded yet');
                    return `<article class="trainer-studio-data-row"><div class="trainer-studio-row-icon">${icon('activity')}</div><div class="trainer-studio-row-main"><strong>${escapeHtml(item.fullName)}</strong><span>${escapeHtml(measurementCount)} · ${escapeHtml(measurementDate)}</span></div><span class="trainer-studio-inline-number">${formatNumber(item.measurementCount)}</span><button type="button" class="btn btn-light btn-small trainer-studio-row-action" data-studio-open-client="${escapeHtml(item.id)}">${escapeHtml(studioT('ui.openProfile', 'Open profile'))}</button></article>`;
                }
                const open = `<button type="button" class="btn btn-light btn-small trainer-studio-row-action" data-studio-open-client="${escapeHtml(item.id)}">فتح الملف</button>`;
                if (kind === 'checkins') return `<article class="trainer-studio-data-row"><div class="trainer-studio-row-icon">${icon('activity')}</div><div class="trainer-studio-row-main"><strong>${escapeHtml(item.fullName)}</strong><span>${item.lastCheckinAt ? `آخر متابعة ${formatDate(item.lastCheckinAt)}` : 'لا توجد متابعة مسجلة'} · ${item.lastMeasurementAt ? `آخر قياس ${formatDate(item.lastMeasurementAt)}` : 'لا يوجد قياس حديث'}</span></div><span class="trainer-status-pill trainer-status-pill--${item.lastCheckinAt ? 'active' : 'scheduled'}">${item.lastCheckinAt ? 'متابعة موجودة' : 'تحتاج متابعة'}</span>${open}</article>`;
                if (kind === 'measurements') return `<article class="trainer-studio-data-row"><div class="trainer-studio-row-icon">${icon('activity')}</div><div class="trainer-studio-row-main"><strong>${escapeHtml(item.fullName)}</strong><span>${formatNumber(item.measurementCount)} قياس · ${item.lastMeasurementAt ? `آخر تحديث ${formatDate(item.lastMeasurementAt)}` : 'لم يسجل قياس بعد'}</span></div><span class="trainer-studio-inline-number">${formatNumber(item.measurementCount)}</span>${open}</article>`;
                return `<article class="trainer-studio-data-row"><div class="trainer-studio-row-icon">${icon('chart')}</div><div class="trainer-studio-row-main"><strong>${escapeHtml(item.fullName)}</strong><span>${formatNumber(item.workoutCount)} تدريب · ${formatNumber(item.nutritionCount)} تغذية · ${formatNumber(item.measurementCount)} قياس</span></div><span class="trainer-studio-inline-number">${formatNumber(item.checkinCount)}</span>${open}</article>`;
            };
            const title = kind === 'checkins' ? 'العملاء الذين يحتاجون متابعة' : kind === 'measurements' ? 'تحديث القياسات' : 'ملخص تقدم العملاء';
            renderListPage(route, studioT(`route.${route}`, title), clients, renderer, 'لا توجد ملفات عملاء بعد.');
        } catch (error) { dynamic.innerHTML = pageFrame(route, errorState(error.message)); }
    }

    async function renderFollowUpPage() {
        const dynamic = $('#trainerStudioDynamicView');
        dynamic.innerHTML = pageFrame('checkins', '<section class="trainer-studio-data-panel"><div class="trainer-studio-loading"><span class="trainer-studio-spinner"></span>جاري حساب الأولويات...</div></section>');
        dynamic.hidden = false;
        try {
            const payload = await api('/api/trainer/follow-up?limit=100');
            const clients = Array.isArray(payload.clients) ? payload.clients : [];
            const reasonKeys = {
                assessment_due: 'ui.followUpReason.assessmentDue',
                checkin_due: 'ui.followUpReason.checkinDue',
                package_expiring: 'ui.followUpReason.packageExpiring',
                payment_outstanding: 'ui.followUpReason.paymentOutstanding'
            };
            renderListPage('checkins', studioT('ui.heading.followUps', 'Follow-up center'), clients.filter((item) => Array.isArray(item.reasons) && item.reasons.length), (item) => {
                const reasons = item.reasons.map((reason) => studioT(reasonKeys[reason] || '', reason)).join(' · ');
                return `<article class="trainer-studio-data-row"><div class="trainer-studio-row-icon trainer-studio-row-icon--warning">${icon('activity')}</div><div class="trainer-studio-row-main"><strong>${escapeHtml(item.clientName)}</strong><span>${escapeHtml(reasons)}</span></div><span class="trainer-studio-inline-number">${formatMoney(item.outstandingBalance)}</span><button type="button" class="btn btn-light btn-small trainer-studio-row-action" data-studio-open-client="${escapeHtml(item.clientId)}">${escapeHtml(studioT('ui.openProfile', 'Open profile'))}</button></article>`;
            }, studioT('ui.followUpsEmpty', 'There are no follow-ups due right now.'));
            return;
            renderListPage('checkins', 'مركز المتابعات', clients.filter((item) => Array.isArray(item.reasons) && item.reasons.length), (item) => `<article class="trainer-studio-data-row"><div class="trainer-studio-row-icon trainer-studio-row-icon--warning">${icon('activity')}</div><div class="trainer-studio-row-main"><strong>${escapeHtml(item.clientName)}</strong><span>${(item.reasons || []).map((reason) => ({ assessment_due: 'قياس مستحق', checkin_due: 'متابعة مستحقة', package_expiring: 'الباقة تقترب من الانتهاء', payment_outstanding: 'رصيد مستحق' }[reason] || reason)).join(' · ')}</span></div><span class="trainer-studio-inline-number">${formatMoney(item.outstandingBalance)}</span><button type="button" class="btn btn-light btn-small trainer-studio-row-action" data-studio-open-client="${escapeHtml(item.clientId)}">فتح الملف</button></article>`, 'لا توجد متابعات مستحقة حاليًا.');
        } catch (error) { dynamic.innerHTML = pageFrame('checkins', errorState(error.message)); }
    }

    async function renderFinancePage() {
        const dynamic = $('#trainerStudioDynamicView');
        dynamic.innerHTML = pageFrame('finance', '<section class="trainer-studio-data-panel"><div class="trainer-studio-loading"><span class="trainer-studio-spinner"></span>جاري تحميل السجل المالي...</div></section>');
        dynamic.hidden = false;
        try {
            const [reports, paymentPayload] = await Promise.all([api('/api/trainer/reports/summary'), api('/api/trainer/payments')]);
            const summary = reports.summary || {};
            const payments = Array.isArray(paymentPayload.payments) ? paymentPayload.payments : [];
            const financeCards = [
                [studioT('ui.finance.netRevenue', 'Net revenue'), formatMoney(summary.netRevenue), 'wallet'],
                [studioT('ui.finance.outstanding', 'Outstanding balance'), formatMoney(summary.outstandingBalance), 'activity'],
                [studioT('ui.finance.payments', 'Recorded payments'), formatNumber(summary.paidTransactions), 'chart'],
                [studioT('ui.finance.refunds', 'Refunds'), formatNumber(summary.refundTransactions), 'activity']
            ];
            const paymentCount = studioT('ui.finance.paymentCount', '{{count}} payments', { count: formatNumber(payments.length) });
            const paymentRows = payments.slice(0, 50).map((item) => {
                const clientName = item.clientName || item.memberName || studioT('ui.fallback.client', 'Client');
                const packageName = item.packageName || studioT('ui.fallback.trainingPackage', 'Training package');
                return `<article class="trainer-studio-data-row"><div class="trainer-studio-row-icon">${icon('wallet')}</div><div class="trainer-studio-row-main"><strong>${escapeHtml(clientName)}</strong><span>${formatDate(item.paidAt || item.createdAt)} · ${escapeHtml(packageName)}</span></div><span class="trainer-studio-inline-number">${formatMoney(item.amountPaid || item.amount || 0)}</span></article>`;
            }).join('');
            dynamic.innerHTML = pageFrame('finance', `<section class="trainer-studio-finance-grid">${financeCards.map(([label, value, iconName]) => `<article class="trainer-studio-finance-card"><span class="trainer-studio-row-icon">${icon(iconName)}</span><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></article>`).join('')}</section><section class="trainer-studio-data-panel"><div class="trainer-studio-data-panel-head"><div><span class="trainer-panel-kicker">${escapeHtml(studioT('ui.finance.currentLedger', 'Current ledger'))}</span><h2>${escapeHtml(studioT('ui.latestPayments', 'Latest payments'))}</h2></div><span class="trainer-studio-count-chip">${escapeHtml(paymentCount)}</span></div><div class="trainer-studio-data-list">${payments.length ? paymentRows : emptyState(studioT('ui.finance.emptyPayments', 'No payments recorded yet.'))}</div></section>`);
            dynamic.hidden = false;
            return;
            const cards = [['الإيراد الصافي', formatMoney(summary.netRevenue), 'wallet'], ['الرصيد المستحق', formatMoney(summary.outstandingBalance), 'activity'], ['الدفعات المسجلة', formatNumber(summary.paidTransactions), 'chart'], ['الاستردادات', formatNumber(summary.refundTransactions), 'activity']];
            dynamic.innerHTML = pageFrame('finance', `<section class="trainer-studio-finance-grid">${cards.map(([label, value, iconName]) => `<article class="trainer-studio-finance-card"><span class="trainer-studio-row-icon">${icon(iconName)}</span><span>${label}</span><strong>${value}</strong></article>`).join('')}</section><section class="trainer-studio-data-panel"><div class="trainer-studio-data-panel-head"><div><span class="trainer-panel-kicker">السجل الحالي</span><h2>آخر الدفعات</h2></div><span class="trainer-studio-count-chip">${formatNumber(payments.length)} دفعة</span></div><div class="trainer-studio-data-list">${payments.length ? payments.slice(0, 50).map((item) => `<article class="trainer-studio-data-row"><div class="trainer-studio-row-icon">${icon('wallet')}</div><div class="trainer-studio-row-main"><strong>${escapeHtml(item.clientName || item.memberName || 'عميل')}</strong><span>${formatDate(item.paidAt || item.createdAt)} · ${escapeHtml(item.packageName || 'باقة تدريب')}</span></div><span class="trainer-studio-inline-number">${formatMoney(item.amountPaid || item.amount || 0)}</span></article>`).join('') : emptyState('لا توجد دفعات مسجلة بعد.')}</div></section>`);
            dynamic.hidden = false;
        } catch (error) { dynamic.innerHTML = pageFrame('finance', errorState(error.message)); }
    }

    async function renderPortalPage() {
        const dynamic = $('#trainerStudioDynamicView');
        dynamic.innerHTML = pageFrame('portal', '<section class="trainer-studio-data-panel"><div class="trainer-studio-loading"><span class="trainer-studio-spinner"></span>جاري تحميل عملائك...</div></section>');
        dynamic.hidden = false;
        try {
            const payload = await api('/api/trainer/clients?page=1&pageSize=100');
            const clients = Array.isArray(payload.clients) ? payload.clients : [];
            renderListPage('portal', 'دخول بوابة العملاء', clients, (item) => `<article class="trainer-studio-data-row"><div class="trainer-studio-row-icon">${icon('users')}</div><div class="trainer-studio-row-main"><strong>${escapeHtml(item.fullName)}</strong><span>${item.email ? escapeHtml(item.email) : escapeHtml(item.phone ? displayPhone(item.phone, item.phoneCountry) : 'لا توجد وسيلة تواصل')}</span></div><span class="trainer-studio-portal-note">يُصدر من ملف العميل</span></article>`, 'أضف عميلًا أولًا لإصدار دخول البوابة.');
        } catch (error) { dynamic.innerHTML = pageFrame('portal', errorState(error.message)); }
    }

    async function renderRenewalsPage() {
        const dynamic = $('#trainerStudioDynamicView');
        dynamic.innerHTML = pageFrame('renewals', '<section class="trainer-studio-data-panel"><div class="trainer-studio-loading"><span class="trainer-studio-spinner"></span>جاري تحليل الباقات...</div></section>');
        dynamic.hidden = false;
        try {
            const payload = await api('/api/trainer/package-purchases');
            const purchases = Array.isArray(payload.purchases) ? payload.purchases : [];
            const now = Date.now();
            const renewals = purchases.filter((item) => {
                const expiry = item.endsOn ? new Date(`${item.endsOn}T23:59:59`).getTime() : null;
                return item.status === 'expired' || Number(item.sessionsRemaining || 0) <= 2 || Number(item.amountRemaining || 0) > 0 || (expiry && expiry <= now + 14 * 86400000);
            });
            renderListPage('renewals', studioT('route.renewals', 'Renewals'), renewals, (item) => {
                const packageName = item.packageName || studioT('ui.fallback.trainingPackage', 'Training package');
                const expiry = item.endsOn
                    ? studioT('ui.renewal.expires', 'Expires {{date}}', { date: formatDate(item.endsOn) })
                    : studioT('ui.renewal.noExpiry', 'No expiry date');
                const remaining = studioT('ui.renewal.sessionsRemaining', '{{count}} sessions remaining', { count: formatNumber(item.sessionsRemaining) });
                return `<article class="trainer-studio-data-row"><div class="trainer-studio-row-icon trainer-studio-row-icon--warning">${icon('arrow')}</div><div class="trainer-studio-row-main"><strong>${escapeHtml(item.clientName || studioT('ui.fallback.client', 'Client'))}</strong><span>${escapeHtml(packageName)} · ${escapeHtml(expiry)} · ${escapeHtml(remaining)}</span></div><span class="trainer-studio-inline-number">${formatMoney(item.amountRemaining)}</span><button type="button" class="btn btn-light btn-small trainer-studio-row-action" data-studio-go-sales>${escapeHtml(studioT('ui.action.openSales', 'Open sales'))}</button></article>`;
            }, studioT('ui.renewalsEmpty', 'No packages currently need follow-up.'));
            return;
            renderListPage('renewals', 'مركز التجديدات', renewals, (item) => `<article class="trainer-studio-data-row"><div class="trainer-studio-row-icon trainer-studio-row-icon--warning">${icon('arrow')}</div><div class="trainer-studio-row-main"><strong>${escapeHtml(item.clientName || 'عميل')}</strong><span>${escapeHtml(item.packageName || 'باقة تدريب')} · ${item.endsOn ? `تنتهي ${formatDate(item.endsOn)}` : 'بدون تاريخ انتهاء'} · ${formatNumber(item.sessionsRemaining)} جلسة متبقية</span></div><span class="trainer-studio-inline-number">${formatMoney(item.amountRemaining)}</span><button type="button" class="btn btn-light btn-small trainer-studio-row-action" data-studio-go-sales>فتح التحصيلات</button></article>`, 'لا توجد باقات تحتاج متابعة حاليًا.');
        } catch (error) { dynamic.innerHTML = pageFrame('renewals', errorState(error.message)); }
    }

    async function renderSettingsPage() {
        const dynamic = $('#trainerStudioDynamicView');
        dynamic.innerHTML = pageFrame('settings', '<section class="trainer-studio-data-panel"><div class="trainer-studio-loading"><span class="trainer-studio-spinner"></span>جاري تحميل إعدادات المساحة...</div></section>');
        dynamic.hidden = false;
        try {
            const payload = await api('/api/saas/subscription');
            const tenant = payload.tenant || {};
            const subscription = payload.subscription || {};
            const currentPlan = subscription.plan ? {
                ...subscription.plan,
                ...(subscription.limitsSnapshot || {}),
                features: subscription.featuresSnapshot || subscription.plan.features || {},
                terms: [{
                    code: subscription.termCodeSnapshot || 'monthly',
                    price: subscription.priceSnapshot ?? subscription.plan.price,
                    currency: subscription.currencySnapshot || subscription.plan.currency || 'EGP',
                    isActive: true
                }]
            } : null;
            const plans = Array.isArray(payload.plans) ? payload.plans : [];
            const featureCatalog = Array.isArray(payload.featureCatalog) ? payload.featureCatalog : [];
            const currentStatus = String(subscription.status || 'غير محددة');
            const currentDates = subscription.startsAt || subscription.expiresAt
                ? `<div class="trainer-studio-plan-dates"><span>البداية <b>${escapeHtml(formatDate(subscription.startsAt))}</b></span><span>الانتهاء <b>${escapeHtml(formatDate(subscription.expiresAt))}</b></span></div>`
                : '';
            const currentLimits = currentPlan ? `<div class="trainer-studio-plan-limits trainer-studio-plan-limits--current"><span>العملاء <b>${escapeHtml(limitLabel(currentPlan.maxClients))}</b></span><span>المستخدمون <b>${escapeHtml(limitLabel(currentPlan.maxUsers))}</b></span><span>AI شهريًا <b>${escapeHtml(limitLabel(currentPlan.maxAiGenerations))}</b></span><span>التخزين <b>${escapeHtml(limitLabel(currentPlan.maxStorageMb))} MB</b></span></div>` : '';
            const currentFeatures = currentPlan ? featureCatalog.filter((feature) => currentPlan.features?.[feature.key] !== false).slice(0, 8).map((feature) => `<li><span aria-hidden="true">✓</span>${escapeHtml(feature.description || feature.key)}</li>`).join('') : '';
            const availablePlansMarkup = plans.length
                ? plans.map((plan) => trainerPlanCard(plan, currentPlan?.code, featureCatalog)).join('')
                : '<div class="trainer-studio-empty"><span class="trainer-studio-empty-mark">—</span><strong>لا توجد خطط متاحة</strong><p>تواصل مع إدارة المنصة لمعرفة الخيارات المتاحة.</p></div>';
            dynamic.innerHTML = pageFrame('settings', `<section class="trainer-studio-settings-grid"><article class="trainer-studio-settings-card"><span class="trainer-panel-kicker">الهوية</span><h2>${escapeHtml(tenant.name || 'مساحة المدرب')}</h2><p>تفضيلات المظهر متاحة من زر الوضع في الشريط العلوي. بيانات الهوية لا يتم تعديلها من هذه الشاشة دون مسار إعدادات مدعوم.</p></article><article class="trainer-studio-settings-card trainer-studio-current-plan-card"><div class="trainer-studio-settings-card-head"><div><span class="trainer-panel-kicker">الاشتراك الحالي</span><h2>${escapeHtml(currentPlan?.name || 'لا يوجد اشتراك')}</h2></div><span class="trainer-studio-plan-current">${escapeHtml(currentStatus)}</span></div>${currentPlan ? `<p>المدة: <strong>${escapeHtml(BILLING_TERM_LABELS[currentPlan.terms[0].code] || currentPlan.terms[0].code)}</strong> · السعر المحفوظ: <strong>${escapeHtml(formatMoney(currentPlan.terms[0].price))}</strong></p>${currentDates}${currentLimits}<ul class="trainer-studio-plan-features">${currentFeatures}</ul>` : '<p>لا يمكن تشغيل مساحة المدرب بدون اشتراك صالح. راجع إدارة المنصة.</p>'}</article></section><section class="trainer-studio-data-panel trainer-studio-available-plans" aria-labelledby="trainerAvailablePlansTitle"><div class="trainer-studio-data-panel-head"><div><span class="trainer-panel-kicker">منصة Logic Fit</span><h2 id="trainerAvailablePlansTitle">الخطط المتاحة لمساحة المدرب</h2><p>اختر مدة الفوترة لمقارنة السعر والمزايا. القيم المعروضة مصدرها إعدادات المنصة الحالية.</p></div><span class="trainer-studio-count-chip"><span>${formatNumber(plans.length)}</span> <span data-i18n="trainerStudioV2.ui.planCount">${escapeHtml(studioT('ui.planCount', 'خطط'))}</span></span></div><div class="trainer-studio-plan-grid" data-trainer-plan-grid>${availablePlansMarkup}</div></section>`);
            const billingSummary = dynamic.querySelector('.trainer-studio-current-plan-card > p');
            if (billingSummary && currentPlan) {
                const values = billingSummary.querySelectorAll('strong');
                if (values.length === 2) {
                    const termCode = currentPlan.terms[0].code;
                    if (Object.prototype.hasOwnProperty.call(BILLING_TERM_LABELS, termCode)) values[0].dataset.i18n = `saasBilling.plans.${termCode}`;
                    const durationLabel = document.createElement('span');
                    durationLabel.dataset.i18n = 'trainerStudioV2.ui.durationLabel';
                    durationLabel.textContent = studioT('ui.durationLabel', 'المدة:');
                    const priceLabel = document.createElement('span');
                    priceLabel.dataset.i18n = 'trainerStudioV2.ui.savedPrice';
                    priceLabel.textContent = studioT('ui.savedPrice', 'السعر المحفوظ:');
                    billingSummary.replaceChildren(durationLabel, document.createTextNode(' '), values[0], document.createTextNode(' · '), priceLabel, document.createTextNode(' '), values[1]);
                }
            }
            bindTrainerPlanTerms(dynamic.querySelector('[data-trainer-plan-grid]'));
            dynamic.hidden = false;
        } catch (error) { dynamic.innerHTML = pageFrame('settings', errorState(error.message)); }
    }

    const goalStatusKeys = Object.freeze({ active: 'active', completed: 'completed', paused: 'paused', archived: 'archived' });
    const goalTypeKeys = Object.freeze({ weight_loss: 'fatLoss', muscle_gain: 'hypertrophy', strength: 'strength', fitness: 'general', performance: 'performance', custom: 'custom' });
    const goalTypeLabel = (value) => {
        const key = goalTypeKeys[value];
        if (!key) return String(value || '');
        const translationKey = key === 'performance' || key === 'custom' ? `ui.goalType.${key}` : `ui.goal.${key}`;
        return studioT(translationKey, key);
    };
    const templateTypeLabels = Object.freeze({ training: '\u062a\u062f\u0631\u064a\u0628', nutrition: '\u062a\u063a\u0630\u064a\u0629', assessment: '\u062a\u0642\u064a\u064a\u0645', checkin: '\u0645\u062a\u0627\u0628\u0639\u0629', package: '\u0628\u0627\u0642\u0629' });

    function newIdempotencyKey(prefix) {
        return `${prefix}-${globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`}`;
    }

    function renderGoalRows(goals) {
        if (!goals.length) return emptyState(studioT('ui.goals.emptyTitle', '\u0644\u0627 \u062a\u0648\u062c\u062f \u0623\u0647\u062f\u0627\u0641 \u0645\u0633\u062c\u0644\u0629'), studioT('ui.goals.emptyDescription', '\u0623\u0636\u0641 \u0647\u062f\u0641\u064b\u0627 \u0648\u0627\u0631\u0628\u0637\u0647 \u0628\u0639\u0645\u064a\u0644 \u0644\u0645\u062a\u0627\u0628\u0639\u0629 \u0627\u0644\u062a\u0642\u062f\u0645.'), 'trainerStudioV2.ui.goals.emptyDescription', 'trainerStudioV2.ui.goals.emptyTitle');
        return goals.map((goal) => {
            const status = String(goal.status || 'active').toLowerCase();
            const value = [goal.currentValue, goal.targetValue].every((item) => item !== null && item !== undefined) ? `${goal.currentValue} / ${goal.targetValue}${goal.unit ? ` ${escapeHtml(goal.unit)}` : ''}` : `<span data-i18n="trainerStudioV2.ui.goal.valueUnset">${studioT('ui.goal.valueUnset', 'لم يتم تحديد القيمة')}</span>`;
            const actionKey = status === 'active' ? 'ui.goalAction.markComplete' : 'ui.reactivate';
            const actionLabel = studioT(actionKey, status === 'active' ? 'تعليم كمكتمل' : 'إعادة تفعيل');
            const actions = status === 'archived' ? '' : `<button type="button" class="btn btn-light btn-small trainer-studio-row-action" data-studio-goal-id="${escapeHtml(goal.id)}" data-studio-goal-status="${status === 'active' ? 'completed' : 'active'}" data-i18n="trainerStudioV2.${actionKey}">${actionLabel}</button><button type="button" class="btn btn-light btn-small trainer-studio-row-action trainer-studio-row-action--danger" data-studio-goal-archive="${escapeHtml(goal.id)}" data-i18n="trainerStudioV2.ui.archive">${studioT('ui.archive', 'أرشفة')}</button>`;
            const goalTypeKey = goalTypeKeys[goal.goalType];
            const goalTypeLabel = goalTypeKey ? studioT(`ui.goal.${goalTypeKey}`, goalTypeKey === 'performance' || goalTypeKey === 'custom' ? studioT(`ui.goalType.${goalTypeKey}`, goalTypeKey) : goalTypeKey) : escapeHtml(goal.goalType || studioT('ui.goal', 'الهدف'));
            const goalStatusLabel = goalStatusKeys[status] ? studioT(`ui.goalStatus.${goalStatusKeys[status]}`, status) : escapeHtml(status);
            const goalTypeI18nKey = goalTypeKey ? `trainerStudioV2.ui.goal.${goalTypeKey}` : '';
            const goalStatusI18nKey = goalStatusKeys[status] ? `trainerStudioV2.ui.goalStatus.${goalStatusKeys[status]}` : '';
            return `<article class="trainer-studio-data-row"><div class="trainer-studio-row-icon">${icon('chart')}</div><div class="trainer-studio-row-main"><strong>${escapeHtml(goal.title)}</strong><span>${escapeHtml(goal.clientName || studioT('ui.client', 'العميل'))} · <span${goalTypeI18nKey ? ` data-i18n="${goalTypeI18nKey}"` : ''}>${escapeHtml(goalTypeLabel)}</span> · ${value}${goal.deadline ? ` · <span data-i18n="trainerStudioV2.ui.deadline">${studioT('ui.deadline', 'الموعد')}</span> ${formatDate(goal.deadline)}` : ''}</span></div><span class="trainer-status-pill trainer-status-pill--${escapeHtml(status)}"${goalStatusI18nKey ? ` data-i18n="${goalStatusI18nKey}"` : ''}>${escapeHtml(goalStatusLabel)}</span><div class="trainer-studio-row-actions">${actions}</div></article>`;
        }).join('');
    }

    async function renderGoalsPage() {
        const dynamic = $('#trainerStudioDynamicView');
        dynamic.innerHTML = pageFrame('goals', '<section class="trainer-studio-data-panel"><div class="trainer-studio-loading"><span class="trainer-studio-spinner"></span>\u062c\u0627\u0631\u064a \u062a\u062d\u0645\u064a\u0644 \u0627\u0644\u0623\u0647\u062f\u0627\u0641...</div></section>');
        dynamic.hidden = false;
        try {
            const payload = await api('/api/trainer/goals');
            const goals = Array.isArray(payload.goals) ? payload.goals : [];
            renderListPage('goals', studioT('route.goals', 'الأهداف'), goals, () => renderGoalRows(goals), studioT('ui.goals.emptyTitle', 'لا توجد أهداف مسجلة.'), `<button type="button" class="btn btn-primary btn-small" data-studio-open-goal-editor><span>${icon('plus')}</span>${studioT('ui.addGoal', 'إضافة هدف')}</button>`, studioT('ui.goals.emptyDescription', 'أضف هدفًا واربطه بعميل لمتابعة التقدم.'), 'trainerStudioV2.ui.goals.emptyDescription', 'trainerStudioV2.ui.goals.emptyTitle');
        } catch (error) { dynamic.innerHTML = pageFrame('goals', errorState(error.message)); }
    }

    async function openGoalEditor() {
        const dynamic = $('#trainerStudioDynamicView');
        dynamic.innerHTML = pageFrame('goals', '<section class="trainer-studio-data-panel"><div class="trainer-studio-loading"><span class="trainer-studio-spinner"></span>\u062c\u0627\u0631\u064a \u062a\u062c\u0647\u064a\u0632 \u0646\u0645\u0648\u0630\u062c \u0627\u0644\u0647\u062f\u0641...</div></section>');
        dynamic.hidden = false;
        try {
            const clients = await getTrainerClients();
            const options = selectOptions(clients, 'id', 'fullName', '\u0627\u062e\u062a\u0631 \u0627\u0644\u0639\u0645\u064a\u0644');
            const goalOptions = Object.entries(goalTypeKeys).map(([value]) => `<option value="${escapeHtml(value)}">${escapeHtml(goalTypeLabel(value))}</option>`).join('');
            dynamic.innerHTML = pageFrame('goals', `<section class="trainer-studio-editor-panel"><div class="trainer-studio-data-panel-head"><div><span class="trainer-panel-kicker">\u0645\u062a\u0627\u0628\u0639\u0629 \u0642\u0627\u0628\u0644\u0629 \u0644\u0644\u0642\u064a\u0627\u0633</span><h2>\u0625\u0636\u0627\u0641\u0629 \u0647\u062f\u0641</h2></div><button type="button" class="btn btn-light btn-small" data-studio-cancel-goal-editor>\u0625\u0644\u063a\u0627\u0621</button></div><form class="trainer-studio-editor-form" data-studio-goal-form><div class="trainer-studio-editor-grid"><label>\u0627\u0644\u0639\u0645\u064a\u0644<select name="memberId" required>${options}</select></label><label>\u0646\u0648\u0639 \u0627\u0644\u0647\u062f\u0641<select name="goalType" required>${goalOptions}</select></label><label>\u0639\u0646\u0648\u0627\u0646 \u0627\u0644\u0647\u062f\u0641<input name="title" maxlength="160" required placeholder="\u0645\u062b\u0627\u0644: \u0648\u0632\u0646 \u0645\u0633\u062a\u0647\u062f\u0641"></label><label>\u0648\u062d\u062f\u0629 \u0627\u0644\u0642\u064a\u0627\u0633<input name="unit" maxlength="24" placeholder="\u0643\u062c\u0645"></label><label>\u0627\u0644\u0642\u064a\u0645\u0629 \u0627\u0644\u0628\u062f\u0627\u064a\u0629<input name="startValue" type="number" step="0.001"></label><label>\u0627\u0644\u0642\u064a\u0645\u0629 \u0627\u0644\u0645\u0633\u062a\u0647\u062f\u0641\u0629<input name="targetValue" type="number" step="0.001"></label><label>\u0627\u0644\u0642\u064a\u0645\u0629 \u0627\u0644\u062d\u0627\u0644\u064a\u0629<input name="currentValue" type="number" step="0.001"></label><label>\u062a\u0627\u0631\u064a\u062e \u0627\u0644\u0628\u062f\u0627\u064a\u0629<input name="startsOn" type="date" value="${new Date().toISOString().slice(0, 10)}" required></label><label>\u0627\u0644\u0645\u0648\u0639\u062f \u0627\u0644\u0646\u0647\u0627\u0626\u064a<input name="deadline" type="date"></label><label class="trainer-studio-field-wide">\u0645\u0644\u0627\u062d\u0638\u0627\u062a<textarea name="notes" maxlength="1000" rows="3"></textarea></label></div><p class="trainer-studio-form-message" data-studio-form-message role="alert"></p><div class="trainer-studio-editor-actions"><button type="submit" class="btn btn-primary">\u062d\u0641\u0638 \u0627\u0644\u0647\u062f\u0641</button></div></form></section>`);
        } catch (error) { dynamic.innerHTML = pageFrame('goals', errorState(error.message)); }
    }

    async function submitGoalForm(form) {
        const message = $('[data-studio-form-message]', form);
        const button = $('button[type="submit"]', form);
        button.disabled = true;
        try {
            const data = new FormData(form);
            await api('/api/trainer/goals', { method: 'POST', body: JSON.stringify({
                memberId: Number(data.get('memberId')), goalType: data.get('goalType'), title: data.get('title'), unit: data.get('unit'),
                startValue: data.get('startValue') || null, targetValue: data.get('targetValue') || null, currentValue: data.get('currentValue') || null,
                startsOn: data.get('startsOn'), deadline: data.get('deadline') || null, notes: data.get('notes'), idempotencyKey: newIdempotencyKey('goal')
            }) });
            await renderGoalsPage();
        } catch (error) { message.textContent = error.message || '\u062a\u0639\u0630\u0631 \u062d\u0641\u0638 \u0627\u0644\u0647\u062f\u0641.'; button.disabled = false; }
    }

    async function renderNotificationsPage() {
        const dynamic = $('#trainerStudioDynamicView');
        dynamic.innerHTML = pageFrame('notifications', '<section class="trainer-studio-data-panel"><div class="trainer-studio-loading"><span class="trainer-studio-spinner"></span>\u062c\u0627\u0631\u064a \u062a\u062c\u0645\u064a\u0639 \u0627\u0644\u062a\u0646\u0628\u064a\u0647\u0627\u062a...</div></section>');
        dynamic.hidden = false;
        try {
            const payload = await api('/api/trainer/notifications?limit=100');
            const notifications = Array.isArray(payload.notifications) ? payload.notifications : [];
            const content = notifications.length ? notifications.map((item) => `<article class="trainer-studio-notification-row trainer-studio-notification-row--${escapeHtml(item.severity || 'info')}"><div class="trainer-studio-row-icon">${icon(item.kind === 'session' ? 'calendar' : item.kind === 'package' ? 'wallet' : 'activity')}</div><div class="trainer-studio-row-main"><strong>${escapeHtml(item.title)}</strong><span>${escapeHtml(item.clientName || '')}${item.occurredAt ? ` · ${formatDate(item.occurredAt, true)}` : ''}</span></div>${item.clientId ? `<button type="button" class="btn btn-light btn-small" data-studio-open-client="${escapeHtml(item.clientId)}">${escapeHtml(item.action?.label || '\u0641\u062a\u062d \u0627\u0644\u0645\u0644\u0641')}</button>` : `<button type="button" class="btn btn-light btn-small" data-studio-notification-route="${escapeHtml(item.action?.route || 'sessions')}">${escapeHtml(item.action?.label || '\u0641\u062a\u062d')}</button>`}</article>`).join('') : emptyState('\u0644\u0627 \u062a\u0648\u062c\u062f \u062a\u0646\u0628\u064a\u0647\u0627\u062a \u062c\u062f\u064a\u062f\u0629.', '\u0633\u062a\u0638\u0647\u0631 \u0647\u0646\u0627 \u0627\u0644\u062c\u0644\u0633\u0627\u062a \u0648\u0627\u0644\u0645\u062a\u0627\u0628\u0639\u0627\u062a \u0627\u0644\u0645\u0647\u0645\u0629.');
            renderListPage('notifications', routeName('notifications'), notifications, () => content, studioT('ui.noData', 'لا توجد تنبيهات حاليًا.'), `<span class="trainer-studio-count-chip">${formatNumber(payload.counts?.warning || 0)} ${studioT('ui.item', 'مهم')}</span>`);
        } catch (error) { dynamic.innerHTML = pageFrame('notifications', errorState(error.message)); }
    }

    function taskStatusLabel(status) {
        const statusKey = ({ open: 'ui.taskStatus.open', in_progress: 'ui.taskStatus.inProgress', completed: 'ui.taskStatus.completed', dismissed: 'ui.taskStatus.dismissed' })[status];
        if (statusKey) return studioT(statusKey, status);
        return ({ open: 'مفتوحة', in_progress: 'قيد التنفيذ', completed: 'مكتملة', dismissed: 'مستبعدة' }[status] || status || '—');
    }

    function taskTypeLabel(type) {
        const typeKey = ({ follow_up: 'ui.taskType.followUp', measurement: 'ui.taskType.measurement', program: 'ui.taskType.program', payment: 'ui.taskType.payment', renewal: 'ui.taskType.renewal', session: 'ui.taskType.session', custom: 'ui.taskType.custom' })[type];
        if (typeKey) return studioT(typeKey, type);
        return ({ follow_up: 'متابعة', measurement: 'قياسات', program: 'برنامج', payment: 'تحصيل', renewal: 'تجديد', session: 'جلسة', custom: 'مخصصة' }[type] || type || 'مهمة');
    }

    async function renderTasksPage() {
        const dynamic = $('#trainerStudioDynamicView');
        if (!dynamic) return;
        dynamic.innerHTML = pageFrame('tasks', '<section class="trainer-studio-data-panel"><div class="trainer-studio-loading"><span class="trainer-studio-spinner"></span>جاري تحميل المهام...</div></section>');
        try {
            const [taskPayload, clientsPayload] = await Promise.all([
                api('/api/trainer/tasks?limit=100'),
                api('/api/trainer/clients?page=1&pageSize=100')
            ]);
            const tasks = Array.isArray(taskPayload.tasks) ? taskPayload.tasks : [];
            const clients = Array.isArray(clientsPayload.clients) ? clientsPayload.clients : [];
            if (window.TopGymI18n) {
                const t = (key, fallback, params) => studioT(`ui.task.${key}`, fallback, params);
                const rows = tasks.length ? tasks.map((task) => {
                    const due = task.dueOn ? studioT('ui.taskDue', 'Due {{date}}', { date: formatDate(task.dueOn) }) : '';
                    const details = [taskTypeLabel(task.taskType), task.clientName || '', due].filter(Boolean).join(' · ');
                    const actions = task.status !== 'completed' && task.status !== 'dismissed'
                        ? `<button type="button" class="btn btn-primary btn-small" data-studio-task-complete="${escapeHtml(task.id)}">${escapeHtml(t('complete', 'Complete'))}</button><button type="button" class="btn btn-light btn-small" data-studio-task-dismiss="${escapeHtml(task.id)}">${escapeHtml(t('dismiss', 'Dismiss'))}</button>`
                        : '';
                    return `<article class="trainer-studio-data-row trainer-studio-task-row"><div class="trainer-studio-row-icon ${task.status === 'completed' ? 'trainer-studio-row-icon--success' : ''}">${icon(task.status === 'completed' ? 'chart' : 'activity')}</div><div class="trainer-studio-row-main"><strong>${escapeHtml(task.title)}</strong><span>${escapeHtml(details)}</span>${task.notes ? `<small>${escapeHtml(task.notes)}</small>` : ''}</div><span class="trainer-status-pill trainer-status-pill--${escapeHtml(task.status)}">${escapeHtml(taskStatusLabel(task.status))}</span><div class="trainer-studio-row-actions">${actions}</div></article>`;
                }).join('') : emptyState(studioT('ui.noOpenTasks', 'There are no open tasks.'), studioT('ui.createTaskHint', 'Create a clear reminder for follow-up, collection, or preparing a client program.'));
                const typeOptions = [['follow_up', 'followUp'], ['measurement', 'measurement'], ['program', 'program'], ['payment', 'payment'], ['renewal', 'renewal'], ['session', 'session'], ['custom', 'custom']]
                    .map(([value, type]) => `<option value="${value}">${escapeHtml(studioT(`ui.taskType.${type}`, type))}</option>`).join('');
                const clientOptions = selectOptions(clients, 'id', 'fullName', t('selectClient', 'Select a client'));
                const count = studioT('ui.taskCount', '{{count}} tasks', { count: formatNumber(tasks.length) });
                dynamic.innerHTML = pageFrame('tasks', `<section class="trainer-studio-data-panel"><div class="trainer-studio-data-panel-head"><div><span class="trainer-panel-kicker">${escapeHtml(t('dailyCenter', 'Daily work center'))}</span><h2>${escapeHtml(t('listTitle', 'Your tasks and follow-ups'))}</h2></div><div class="trainer-studio-panel-actions"><button type="button" class="btn btn-primary btn-small" data-studio-open-task-editor><span>${icon('plus')}</span>${escapeHtml(t('new', 'New task'))}</button><span class="trainer-studio-count-chip">${escapeHtml(count)}</span></div></div><div class="trainer-studio-data-list">${rows}</div></section><section class="trainer-studio-editor-panel" data-studio-task-editor hidden><div class="trainer-studio-data-panel-head"><div><span class="trainer-panel-kicker">${escapeHtml(t('addFollowUp', 'Add follow-up'))}</span><h2>${escapeHtml(t('new', 'New task'))}</h2></div><button type="button" class="btn btn-light btn-small" data-studio-cancel-task-editor>${escapeHtml(t('cancel', 'Cancel'))}</button></div><form class="trainer-studio-editor-form" data-studio-task-form><div class="trainer-studio-editor-grid"><label>${escapeHtml(t('title', 'Title'))}<input name="title" maxlength="160" required placeholder="${escapeHtml(t('titleExample', 'Example: Review the client plan'))}"></label><label>${escapeHtml(t('type', 'Type'))}<select name="taskType">${typeOptions}</select></label><label>${escapeHtml(t('client', 'Client'))}<select name="memberId"><option value="">${escapeHtml(t('noClient', 'No specific client'))}</option>${clientOptions}</select></label><label>${escapeHtml(t('due', 'Due date'))}<input type="date" name="dueOn"></label><label class="trainer-studio-editor-field-wide">${escapeHtml(t('notes', 'Notes'))}<textarea name="notes" maxlength="1000" rows="3" placeholder="${escapeHtml(t('nextStep', 'What is the next step?'))}"></textarea></label></div><p class="trainer-studio-form-message" data-studio-form-message role="alert"></p><div class="trainer-studio-editor-actions"><button type="submit" class="btn btn-primary">${escapeHtml(t('save', 'Save task'))}</button></div></form></section>`);
                return;
            }
            const rows = tasks.length ? tasks.map((task) => `<article class="trainer-studio-data-row trainer-studio-task-row"><div class="trainer-studio-row-icon ${task.status === 'completed' ? 'trainer-studio-row-icon--success' : ''}">${icon(task.status === 'completed' ? 'chart' : 'activity')}</div><div class="trainer-studio-row-main"><strong>${escapeHtml(task.title)}</strong><span>${escapeHtml(taskTypeLabel(task.taskType))}${task.clientName ? ` · ${escapeHtml(task.clientName)}` : ''}${task.dueOn ? ` · الموعد ${formatDate(task.dueOn)}` : ''}</span>${task.notes ? `<small>${escapeHtml(task.notes)}</small>` : ''}</div><span class="trainer-status-pill trainer-status-pill--${escapeHtml(task.status)}">${escapeHtml(taskStatusLabel(task.status))}</span><div class="trainer-studio-row-actions">${task.status !== 'completed' && task.status !== 'dismissed' ? `<button type="button" class="btn btn-primary btn-small" data-studio-task-complete="${escapeHtml(task.id)}">إكمال</button><button type="button" class="btn btn-light btn-small" data-studio-task-dismiss="${escapeHtml(task.id)}">استبعاد</button>` : ''}</div></article>`).join('') : emptyState('لا توجد مهام مفتوحة.', 'أنشئ تذكيرًا واضحًا للمتابعة أو التحصيل أو تجهيز برنامج عميل.');
            dynamic.innerHTML = pageFrame('tasks', `<section class="trainer-studio-data-panel"><div class="trainer-studio-data-panel-head"><div><span class="trainer-panel-kicker">مركز العمل اليومي</span><h2>مهامك ومتابعاتك</h2></div><div class="trainer-studio-panel-actions"><button type="button" class="btn btn-primary btn-small" data-studio-open-task-editor><span>${icon('plus')}</span>مهمة جديدة</button><span class="trainer-studio-count-chip">${formatNumber(tasks.length)} مهمة</span></div></div><div class="trainer-studio-data-list">${rows}</div></section><section class="trainer-studio-editor-panel" data-studio-task-editor hidden><div class="trainer-studio-data-panel-head"><div><span class="trainer-panel-kicker">إضافة متابعة</span><h2>مهمة جديدة</h2></div><button type="button" class="btn btn-light btn-small" data-studio-cancel-task-editor>إلغاء</button></div><form class="trainer-studio-editor-form" data-studio-task-form><div class="trainer-studio-editor-grid"><label>العنوان<input name="title" maxlength="160" required placeholder="مثال: مراجعة خطة أحمد"></label><label>النوع<select name="taskType"><option value="follow_up">متابعة</option><option value="measurement">قياسات</option><option value="program">برنامج</option><option value="payment">تحصيل</option><option value="renewal">تجديد</option><option value="session">جلسة</option><option value="custom">مخصصة</option></select></label><label>العميل<select name="memberId"><option value="">بدون عميل محدد</option>${selectOptions(clients, 'id', 'fullName', 'اختر العميل')}</select></label><label>الموعد<input type="date" name="dueOn"></label><label class="trainer-studio-editor-field-wide">ملاحظات<textarea name="notes" maxlength="1000" rows="3" placeholder="ما الخطوة التالية؟"></textarea></label></div><p class="trainer-studio-form-message" data-studio-form-message role="alert"></p><div class="trainer-studio-editor-actions"><button type="submit" class="btn btn-primary">حفظ المهمة</button></div></form></section>`);
        } catch (error) { dynamic.innerHTML = pageFrame('tasks', errorState(error.message)); }
    }

    function renderTemplateRows(templates) {
        if (!templates.length) return emptyState(studioT('ui.templates.emptyTitle', '\u0644\u0627 \u062a\u0648\u062c\u062f \u0642\u0648\u0627\u0644\u0628 \u0645\u062d\u0641\u0648\u0638\u0629.'), studioT('ui.templates.emptyDescription', '\u0627\u0628\u062f\u0623 \u0628\u062d\u0641\u0638 \u0642\u0627\u0644\u0628 \u0644\u0644\u062a\u062f\u0631\u064a\u0628 \u0623\u0648 \u0627\u0644\u062a\u063a\u0630\u064a\u0629.'), 'trainerStudioV2.ui.templates.emptyDescription', 'trainerStudioV2.ui.templates.emptyTitle');
        return templates.map((template) => `<article class="trainer-studio-data-row"><div class="trainer-studio-row-icon">${icon('book')}</div><div class="trainer-studio-row-main"><strong>${escapeHtml(template.name)}</strong><span>${escapeHtml(templateTypeLabels[template.templateType] || template.templateType)}${template.description ? ` · ${escapeHtml(template.description)}` : ''}</span></div><span class="trainer-status-pill trainer-status-pill--${escapeHtml(template.status || 'active')}">${template.status === 'archived' ? '\u0645\u0624\u0631\u0634\u0641' : '\u0646\u0634\u0637'}</span><div class="trainer-studio-row-actions">${['training', 'nutrition'].includes(template.templateType) && template.status !== 'archived' ? `<button type="button" class="btn btn-primary btn-small" data-studio-template-apply="${escapeHtml(template.id)}" data-studio-template-type="${escapeHtml(template.templateType)}">\u062a\u0637\u0628\u064a\u0642</button>` : ''}<button type="button" class="btn btn-light btn-small" data-studio-template-status-id="${escapeHtml(template.id)}" data-studio-template-status="${template.status === 'archived' ? 'active' : 'archived'}">${template.status === 'archived' ? '\u0625\u0639\u0627\u062f\u0629 \u062a\u0641\u0639\u064a\u0644' : '\u0623\u0631\u0634\u0641'}</button></div></article>`).join('');
    }

    async function renderTemplatesPage() {
        const dynamic = $('#trainerStudioDynamicView');
        dynamic.innerHTML = pageFrame('templates', '<section class="trainer-studio-data-panel"><div class="trainer-studio-loading"><span class="trainer-studio-spinner"></span>\u062c\u0627\u0631\u064a \u062a\u062d\u0645\u064a\u0644 \u0627\u0644\u0642\u0648\u0627\u0644\u0628...</div></section>');
        dynamic.hidden = false;
        try {
            const payload = await api('/api/trainer/templates?includeArchived=true');
            const templates = Array.isArray(payload.templates) ? payload.templates : [];
            renderListPage('templates', routeName('templates'), templates, renderTemplateRows, studioT('ui.noData', 'لا توجد قوالب محفوظة.'), `<button type="button" class="btn btn-primary btn-small" data-studio-open-template-editor><span>${icon('plus')}</span>\u0625\u0646\u0634\u0627\u0621 \u0642\u0627\u0644\u0628</button>`, '');
        } catch (error) { dynamic.innerHTML = pageFrame('templates', errorState(error.message)); }
    }

    async function openTemplateEditor() {
        const dynamic = $('#trainerStudioDynamicView');
        const templateOptions = Object.entries(templateTypeLabels).map(([value, label]) => '<option value="' + escapeHtml(value) + '">' + escapeHtml(label) + '</option>').join('');
        const formHtml = [
            '<section class="trainer-studio-editor-panel">',
            '<div class="trainer-studio-data-panel-head"><div><span class="trainer-panel-kicker">بيانات محفوظة وقابلة لإعادة الاستخدام</span><h2>إنشاء قالب</h2></div><button type="button" class="btn btn-light btn-small" data-studio-cancel-template-editor>إلغاء</button></div>',
            '<form class="trainer-studio-editor-form" data-studio-template-form>',
            '<div class="trainer-studio-editor-grid">',
            '<label>نوع القالب<select name="templateType" required>', templateOptions, '</select></label>',
            '<label>اسم القالب<input name="name" maxlength="160" required></label>',
            '<label class="trainer-studio-field-wide">الوصف<textarea name="description" maxlength="1000" rows="2"></textarea></label>',
            '<label class="trainer-studio-field-wide">بيانات JSON<code class="trainer-studio-json-hint">يجب أن تكون كائنًا JSON صحيحًا يطابق عقد الخطة.</code><textarea name="payload" rows="10" required>{}</textarea></label>',
            '</div><p class="trainer-studio-form-message" data-studio-form-message role="alert"></p><div class="trainer-studio-editor-actions"><button type="submit" class="btn btn-primary">حفظ القالب</button></div></form></section>'
        ].join('');
        dynamic.innerHTML = pageFrame('templates', formHtml);
        dynamic.hidden = false;
    }

    async function submitTemplateForm(form) {
        const message = $('[data-studio-form-message]', form);
        const button = $('button[type="submit"]', form);
        button.disabled = true;
        try {
            const data = new FormData(form);
            let payload;
            try { payload = JSON.parse(String(data.get('payload') || '{}')); } catch (_) { throw new Error('\u0628\u064a\u0627\u0646\u0627\u062a JSON \u063a\u064a\u0631 \u0635\u062d\u064a\u062d\u0629.'); }
            await api('/api/trainer/templates', { method: 'POST', body: JSON.stringify({ templateType: data.get('templateType'), name: data.get('name'), description: data.get('description'), payload, idempotencyKey: newIdempotencyKey('template') }) });
            await renderTemplatesPage();
        } catch (error) { message.textContent = error.message || '\u062a\u0639\u0630\u0631 \u062d\u0641\u0638 \u0627\u0644\u0642\u0627\u0644\u0628.'; button.disabled = false; }
    }

    async function openTemplateApply(templateId, templateType) {
        const dynamic = $('#trainerStudioDynamicView');
        dynamic.innerHTML = pageFrame('templates', '<section class="trainer-studio-data-panel"><div class="trainer-studio-loading"><span class="trainer-studio-spinner"></span>\u062c\u0627\u0631\u064a \u062a\u062c\u0647\u064a\u0632 \u062a\u0637\u0628\u064a\u0642 \u0627\u0644\u0642\u0627\u0644\u0628...</div></section>');
        try {
            const clients = await getTrainerClients();
            dynamic.innerHTML = pageFrame('templates', `<section class="trainer-studio-editor-panel"><div class="trainer-studio-data-panel-head"><div><span class="trainer-panel-kicker">${escapeHtml(templateTypeLabels[templateType] || templateType)}</span><h2>\u062a\u0637\u0628\u064a\u0642 \u0627\u0644\u0642\u0627\u0644\u0628 \u0644\u0639\u0645\u064a\u0644</h2></div><button type="button" class="btn btn-light btn-small" data-studio-cancel-template-apply>\u0625\u0644\u063a\u0627\u0621</button></div><form class="trainer-studio-editor-form" data-studio-template-apply-form data-template-id="${escapeHtml(templateId)}"><div class="trainer-studio-editor-grid"><label>\u0627\u0644\u0639\u0645\u064a\u0644<select name="memberId" required>${selectOptions(clients, 'id', 'fullName', '\u0627\u062e\u062a\u0631 \u0627\u0644\u0639\u0645\u064a\u0644')}</select></label></div><p class="trainer-studio-form-message" data-studio-form-message role="alert"></p><div class="trainer-studio-editor-actions"><button type="submit" class="btn btn-primary">\u062a\u0637\u0628\u064a\u0642 \u0627\u0644\u0642\u0627\u0644\u0628</button></div></form></section>`);
            dynamic.hidden = false;
        } catch (error) { dynamic.innerHTML = pageFrame('templates', errorState(error.message)); }
    }

    async function submitTemplateApplyForm(form) {
        const message = $('[data-studio-form-message]', form);
        const button = $('button[type="submit"]', form);
        button.disabled = true;
        try {
            const data = new FormData(form);
            await api(`/api/trainer/templates/${encodeURIComponent(form.dataset.templateId)}/instantiate`, { method: 'POST', body: JSON.stringify({ memberId: Number(data.get('memberId')) }) });
            message.textContent = '\u062a\u0645 \u062a\u0637\u0628\u064a\u0642 \u0627\u0644\u0642\u0627\u0644\u0628 \u0628\u0646\u062c\u0627\u062d.';
            button.disabled = false;
        } catch (error) { message.textContent = error.message || '\u062a\u0639\u0630\u0631 \u062a\u0637\u0628\u064a\u0642 \u0627\u0644\u0642\u0627\u0644\u0628.'; button.disabled = false; }
    }

    async function submitTaskForm(form) {
        const message = $('[data-studio-form-message]', form);
        const button = $('button[type="submit"]', form);
        button.disabled = true;
        try {
            const data = new FormData(form);
            await api('/api/trainer/tasks', { method: 'POST', headers: { 'Idempotency-Key': newIdempotencyKey('task') }, body: JSON.stringify({ title: data.get('title'), taskType: data.get('taskType'), memberId: data.get('memberId') ? Number(data.get('memberId')) : null, dueOn: data.get('dueOn') || null, notes: data.get('notes') || null }) });
            await renderTasksPage();
        } catch (error) { message.textContent = error.message || 'تعذر حفظ المهمة.'; button.disabled = false; }
    }

    let generatedTrainerDraft = null;
    let generatedTrainerType = null;
    let generatedTrainerCatalog = null;

    function trainerClientOptions(clients) {
        return selectOptions(clients, 'id', 'fullName', 'اختر العميل');
    }

    function trainerSuggestionPreview(type, result, catalog) {
        const draft = result?.suggestion || result?.draft;
        if (!draft) return errorState('لم يرجع محرك الإنشاء مسودة صالحة للمراجعة.');
        const exercises = new Map((catalog?.exercises || []).map((item) => [Number(item.id), item.nameAr || item.name || `تمرين ${item.id}`]));
        const foods = new Map((catalog?.foods || []).map((item) => [Number(item.id), item.nameAr || item.nameEn || `طعام ${item.id}`]));
        const structure = type === 'training'
            ? (draft.routines || []).map((routine) => `<li><strong>${escapeHtml(routine.name)}</strong><span>${formatNumber((routine.exercises || []).length)} تمارين · ${(routine.exercises || []).slice(0, 3).map((item) => escapeHtml(exercises.get(Number(item.exerciseId)) || `#${item.exerciseId}`)).join('، ')}</span></li>`).join('')
            : (draft.meals || []).map((meal) => `<li><strong>${escapeHtml(meal.name)}</strong><span>${(meal.items || []).slice(0, 3).map((item) => escapeHtml(foods.get(Number(item.foodId)) || `#${item.foodId}`)).join('، ')}</span></li>`).join('');
        return `<section class="trainer-ai-draft-panel"><div class="trainer-ai-draft-head"><div><span class="trainer-panel-kicker">مسودة قابلة للمراجعة</span><h2>${escapeHtml(draft.name || 'مسودة جديدة')}</h2><p>${escapeHtml(draft.description || '')}</p></div><span class="trainer-status-pill trainer-status-pill--scheduled">مراجعة المدرب مطلوبة</span></div><div class="trainer-ai-draft-metrics"><div><span>${type === 'training' ? 'أيام التدريب' : 'الوجبات اليومية'}</span><strong>${formatNumber(type === 'training' ? draft.daysPerWeek : draft.mealsPerDay)}</strong></div><div><span>${type === 'training' ? 'المدة' : 'السعرات المستهدفة'}</span><strong>${formatNumber(type === 'training' ? draft.durationWeeks : draft.targetCalories)} ${type === 'training' ? 'أسبوع' : 'سعرة'}</strong></div><div><span>المصدر</span><strong>مكتبة Logic Fit</strong></div></div><ul class="trainer-ai-draft-list">${structure || '<li>لا توجد عناصر في المسودة.</li>'}</ul>${(result.warnings || []).length ? `<div class="trainer-ai-warning"><strong>تنبيه قبل الاعتماد</strong><span>${escapeHtml(result.warnings.join(' '))}</span></div>` : ''}<form id="trainerStudioAiRefineForm" class="trainer-ai-refine-form"><label>تعديل على المسودة<textarea name="instruction" maxlength="500" rows="2" placeholder="مثال: أضف تمارين للصدر أو اجعلها 4 وجبات"></textarea></label><button type="submit" class="btn btn-light btn-small">تطبيق التعديل</button></form><div class="trainer-studio-editor-actions"><button type="button" class="btn btn-primary" data-studio-save-generated>اعتماد وحفظ المسودة</button><button type="button" class="btn btn-light" data-studio-back-to-generator>إنشاء مسودة أخرى</button></div></section>`;
    }

    async function openTrainerAutoGenerator(route, isNutrition) {
        const dynamic = $('#trainerStudioDynamicView');
        dynamic.innerHTML = pageFrame(route, '<section class="trainer-studio-data-panel"><div class="trainer-studio-loading"><span class="trainer-studio-spinner"></span>جاري تجهيز الإنشاء التلقائي من مكتبة Logic Fit...</div></section>');
        dynamic.hidden = false;
        try {
            const [clients, catalog] = await Promise.all([getTrainerClients(), getBuilderCatalog()]);
            generatedTrainerCatalog = catalog;
            dynamic.innerHTML = pageFrame(route, `<section class="trainer-studio-editor-panel"><div class="trainer-studio-data-panel-head"><div><span class="trainer-panel-kicker">الإنشاء التلقائي الآمن</span><h2>${isNutrition ? 'إنشاء خطة تغذية تلقائيًا' : 'إنشاء برنامج تدريب تلقائيًا'}</h2><p>${isNutrition ? 'يحسب السعرات ويختار الأطعمة من مكتبة التغذية المشتركة.' : 'يوزع الأيام والتمارين من مكتبة التمارين والعضلات المشتركة.'} ستظل المسودة تحت مراجعتك قبل الحفظ.</p></div><button type="button" class="btn btn-light btn-small" data-studio-close-auto>إغلاق</button></div><form id="trainerStudioAutoForm" class="trainer-studio-editor-form" data-auto-kind="${isNutrition ? 'nutrition' : 'training'}"><div class="trainer-studio-editor-grid"><label>العميل<select name="clientId" required>${trainerClientOptions(clients)}</select></label><label>الهدف<select name="goal"><option value="general">لياقة عامة</option><option value="strength">زيادة القوة</option><option value="hypertrophy">بناء العضلات</option><option value="fat_loss">خسارة الدهون</option><option value="weight_gain">زيادة الكتلة</option>${isNutrition ? '' : '<option value="mobility">المرونة والحركة</option>'}</select></label>${isNutrition ? `<label>عدد الوجبات اليومية<select name="mealsPerDay"><option>3</option><option selected>4</option><option>5</option><option>6</option></select></label><label>الوزن كجم<input name="weightKg" type="number" min="1" step="0.1"></label><label>الطول سم<input name="heightCm" type="number" min="1" step="0.1"></label><label>العمر<input name="age" type="number" min="1" max="120"></label><label>النوع<select name="gender"><option value="male">ذكر</option><option value="female">أنثى</option></select></label><label>النشاط<select name="activity"><option value="sedentary">قليل</option><option value="light">خفيف</option><option value="moderate" selected>متوسط</option><option value="high">مرتفع</option></select></label><label>حساسيات/استبعادات<input name="allergies" maxlength="500" placeholder="مثال: مكسرات، لبن"></label>` : `<label>المستوى<select name="level"><option value="beginner">مبتدئ</option><option value="intermediate" selected>متوسط</option><option value="advanced">متقدم</option></select></label><label>أيام التدريب أسبوعيًا<input name="daysPerWeek" type="number" min="2" max="6" value="3" required></label><label>المدة بالأسابيع<input name="durationWeeks" type="number" min="1" max="52" value="4" required></label><label>قيود أو تمارين مستبعدة<input name="limitations" maxlength="500" placeholder="مثال: ركبة، قفز"></label>`}</div><p class="trainer-studio-form-message" id="trainerStudioAutoMessage" role="alert"></p><div class="trainer-studio-editor-actions"><button type="submit" class="btn btn-primary" id="trainerStudioAutoSubmit">إنشاء مسودة من المكتبة</button></div></form></section>`);
            const form = $('#trainerStudioAutoForm');
            form?.addEventListener('submit', async (event) => {
                event.preventDefault();
                const data = new FormData(form);
                const button = $('#trainerStudioAutoSubmit');
                const message = $('#trainerStudioAutoMessage');
                button.disabled = true;
                message.textContent = 'جاري بناء المسودة من البيانات الفعلية...';
                try {
                    const body = { clientId: Number(data.get('clientId')), goal: data.get('goal') };
                    if (isNutrition) Object.assign(body, { mealsPerDay: Number(data.get('mealsPerDay')), weightKg: data.get('weightKg') || null, heightCm: data.get('heightCm') || null, age: data.get('age') || null, gender: data.get('gender'), activity: data.get('activity'), allergies: data.get('allergies') || '' });
                    else Object.assign(body, { level: data.get('level'), daysPerWeek: Number(data.get('daysPerWeek')), durationWeeks: Number(data.get('durationWeeks')), limitations: data.get('limitations') || '' });
                    const result = await api(isNutrition ? '/api/trainer/intelligence/diet-suggestions' : '/api/trainer/intelligence/workout-suggestions', { method: 'POST', body: JSON.stringify(body) });
                    generatedTrainerType = isNutrition ? 'nutrition' : 'training';
                    generatedTrainerDraft = result.suggestion || result.draft;
                    dynamic.innerHTML = pageFrame(route, trainerSuggestionPreview(generatedTrainerType, result, generatedTrainerCatalog));
                    bindTrainerGeneratedActions(route, isNutrition);
                } catch (error) { message.textContent = error.message || 'تعذر إنشاء المسودة.'; button.disabled = false; }
            });
            $('[data-studio-close-auto]')?.addEventListener('click', () => renderTrainingPage(route, isNutrition));
        } catch (error) { dynamic.innerHTML = pageFrame(route, errorState(error.message)); }
    }

    function bindTrainerGeneratedActions(route, isNutrition) {
        $('#trainerStudioAiRefineForm')?.addEventListener('submit', async (event) => {
            event.preventDefault();
            const form = event.currentTarget;
            const instruction = String(new FormData(form).get('instruction') || '').trim();
            if (!instruction || !generatedTrainerDraft) return;
            const result = await api('/api/trainer/intelligence/refine', { method: 'POST', body: JSON.stringify({ type: generatedTrainerType === 'nutrition' ? 'diet' : 'workout', memberId: generatedTrainerDraft.memberId, draft: generatedTrainerDraft, instruction }) });
            generatedTrainerDraft = result.draft;
            const dynamic = $('#trainerStudioDynamicView');
            dynamic.innerHTML = pageFrame(route, trainerSuggestionPreview(generatedTrainerType, result, generatedTrainerCatalog));
            bindTrainerGeneratedActions(route, isNutrition);
        });
        $('[data-studio-save-generated]')?.addEventListener('click', async (event) => {
            const button = event.currentTarget;
            button.disabled = true;
            try {
                await api(generatedTrainerType === 'nutrition' ? '/api/trainer/nutrition-plans' : '/api/trainer/training-plans', { method: 'POST', body: JSON.stringify(generatedTrainerDraft) });
                await renderTrainingPage(route, isNutrition);
            } catch (error) { button.disabled = false; window.alert(error.message || 'تعذر حفظ المسودة.'); }
        });
        $('[data-studio-back-to-generator]')?.addEventListener('click', () => openTrainerAutoGenerator(route, isNutrition));
    }

    function injectTrainerAutoButton(route, isNutrition) {
        const actions = $('.trainer-studio-panel-actions');
        if (!actions || actions.querySelector('[data-studio-auto-generate]')) return;
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'btn btn-light btn-small';
        button.dataset.studioAutoGenerate = isNutrition ? 'nutrition' : 'training';
        button.textContent = studioT('ui.auto.safe', 'إنشاء تلقائي');
        button.addEventListener('click', () => openTrainerAutoGenerator(route, isNutrition));
        actions.prepend(button);
    }

    let routeRenderToken = 0;
    function renderRoute(route) {
        const token = ++routeRenderToken;
        buildShell();
        setRouteChrome(route);
        hideAllSurfaces();
        const access = trainerFeatureAccess(route);
        if (access.allowed !== true) {
            renderTrainerFeatureAccessState(route, access);
            return;
        }
        if (route === 'dashboard') showStatic('dashboard');
        else if (route === 'clients') showStatic('clients');
        else if (route === 'packages') showStatic('packages');
        else if (route === 'sales') showStatic('sales');
        else if (route === 'reports') showStatic('reports');
        else {
            const dynamic = $('#trainerStudioDynamicView');
            if (dynamic) dynamic.hidden = false;
            const task = route === 'calendar' || route === 'sessions' ? renderSessionsPage(route) : route === 'training' ? renderTrainingPage(route) : route === 'nutrition' ? renderTrainingPage(route, true) : ['exercises', 'muscles', 'foods'].includes(route) ? renderTrainerCatalogPage(route) : route === 'measurements' ? renderClientsDataPage(route, 'measurements') : route === 'progress' ? renderClientsDataPage(route, 'progress') : route === 'checkins' ? renderFollowUpPage() : route === 'goals' ? renderGoalsPage() : route === 'notifications' ? renderNotificationsPage() : route === 'tasks' ? renderTasksPage() : route === 'templates' ? renderTemplatesPage() : route === 'renewals' ? renderRenewalsPage() : route === 'finance' ? renderFinancePage() : route === 'portal' ? renderPortalPage() : renderSettingsPage();
            Promise.resolve(task).then(() => { if (token !== routeRenderToken) return; if (route === 'training' || route === 'nutrition') injectTrainerAutoButton(route, route === 'nutrition'); }).catch(() => {});
        }
    }

    document.addEventListener('submit', (event) => {
        const goalForm = event.target.closest('[data-studio-goal-form]');
        if (goalForm) { event.preventDefault(); submitGoalForm(goalForm); return; }
        const templateForm = event.target.closest('[data-studio-template-form]');
        if (templateForm) { event.preventDefault(); submitTemplateForm(templateForm); return; }
        const applyForm = event.target.closest('[data-studio-template-apply-form]');
        if (applyForm) { event.preventDefault(); submitTemplateApplyForm(applyForm); }
        const taskForm = event.target.closest('[data-studio-task-form]');
        if (taskForm) { event.preventDefault(); submitTaskForm(taskForm); }
    });

    document.addEventListener('click', (event) => {
        if (event.target.closest('[data-studio-retry]')) renderRoute(resolveRoute());
        if (event.target.closest('[data-studio-open-goal-editor]')) openGoalEditor();
        if (event.target.closest('[data-studio-cancel-goal-editor]')) renderGoalsPage();
        if (event.target.closest('[data-studio-open-template-editor]')) openTemplateEditor();
        if (event.target.closest('[data-studio-cancel-template-editor]')) renderTemplatesPage();
        if (event.target.closest('[data-studio-cancel-template-apply]')) renderTemplatesPage();
        if (event.target.closest('[data-studio-open-task-editor]')) $('[data-studio-task-editor]')?.removeAttribute('hidden');
        if (event.target.closest('[data-studio-cancel-task-editor]')) $('[data-studio-task-editor]')?.setAttribute('hidden', '');
        const completeTaskButton = event.target.closest('[data-studio-task-complete]');
        if (completeTaskButton) {
            completeTaskButton.disabled = true;
            api(`/api/trainer/tasks/${encodeURIComponent(completeTaskButton.dataset.studioTaskComplete)}`, { method: 'PATCH', body: JSON.stringify({ status: 'completed' }) })
                .then(() => renderTasksPage()).catch((error) => { completeTaskButton.disabled = false; window.alert(error.message || 'تعذر إكمال المهمة.'); });
        }
        const dismissTaskButton = event.target.closest('[data-studio-task-dismiss]');
        if (dismissTaskButton) {
            dismissTaskButton.disabled = true;
            api(`/api/trainer/tasks/${encodeURIComponent(dismissTaskButton.dataset.studioTaskDismiss)}/dismiss`, { method: 'POST' })
                .then(() => renderTasksPage()).catch((error) => { dismissTaskButton.disabled = false; window.alert(error.message || 'تعذر استبعاد المهمة.'); });
        }
        const notificationRoute = event.target.closest('[data-studio-notification-route]');
        if (notificationRoute) navigate(notificationRoute.dataset.studioNotificationRoute);
        const goalStatusButton = event.target.closest('[data-studio-goal-id]');
        if (goalStatusButton) {
            goalStatusButton.disabled = true;
            api(`/api/trainer/goals/${encodeURIComponent(goalStatusButton.dataset.studioGoalId)}/status`, { method: 'PATCH', body: JSON.stringify({ status: goalStatusButton.dataset.studioGoalStatus }) })
                .then(() => renderGoalsPage()).catch((error) => { goalStatusButton.disabled = false; window.alert(error.message || 'تعذر تحديث حالة الهدف.'); });
        }
        const goalArchiveButton = event.target.closest('[data-studio-goal-archive]');
        if (goalArchiveButton) {
            goalArchiveButton.disabled = true;
            api(`/api/trainer/goals/${encodeURIComponent(goalArchiveButton.dataset.studioGoalArchive)}`, { method: 'DELETE' })
                .then(() => renderGoalsPage()).catch((error) => { goalArchiveButton.disabled = false; window.alert(error.message || 'تعذر أرشفة الهدف.'); });
        }
        const templateStatusButton = event.target.closest('[data-studio-template-status-id]');
        if (templateStatusButton) {
            templateStatusButton.disabled = true;
            api(`/api/trainer/templates/${encodeURIComponent(templateStatusButton.dataset.studioTemplateStatusId)}`, { method: 'PATCH', body: JSON.stringify({ status: templateStatusButton.dataset.studioTemplateStatus }) })
                .then(() => renderTemplatesPage()).catch((error) => { templateStatusButton.disabled = false; window.alert(error.message || 'تعذر تحديث حالة القالب.'); });
        }
        const applyTemplateButton = event.target.closest('[data-studio-template-apply]');
        if (applyTemplateButton) openTemplateApply(applyTemplateButton.dataset.studioTemplateApply, applyTemplateButton.dataset.studioTemplateType);
        const editorButton = event.target.closest('[data-studio-open-editor]');
        if (editorButton) {
            const route = resolveRoute();
            openPlanEditor(route, route === 'nutrition');
        }
        const statusButton = event.target.closest('[data-studio-plan-id]');
        if (statusButton) {
            statusButton.disabled = true;
            const kind = statusButton.dataset.studioPlanKind;
            const endpoint = kind === 'nutrition' ? '/api/trainer/nutrition-plans/' : '/api/trainer/training-plans/';
            api(`${endpoint}${encodeURIComponent(statusButton.dataset.studioPlanId)}/status`, { method: 'PATCH', body: JSON.stringify({ status: statusButton.dataset.studioPlanStatus }) })
                .then(() => renderRoute(resolveRoute()))
                .catch((error) => { statusButton.disabled = false; window.alert(error.message || 'تعذر تحديث حالة الخطة.'); });
        }
        if (event.target.closest('[data-studio-go-sales]')) navigate('sales');
        if (event.target.closest('[data-studio-go-training]')) navigate('training');
        const scheduleButton = event.target.closest('[data-studio-schedule-session]');
        if (scheduleButton) document.dispatchEvent(new CustomEvent('trainer-studio-open-session'));
        const sessionButton = event.target.closest('[data-studio-session-id]');
        if (sessionButton) {
            sessionButton.disabled = true;
            api(`/api/trainer/sessions/${encodeURIComponent(sessionButton.dataset.studioSessionId)}/status`, { method: 'PATCH', body: JSON.stringify({ status: sessionButton.dataset.studioSessionStatus }) })
                .then(() => renderSessionsPage(resolveRoute()))
                .catch((error) => { sessionButton.disabled = false; window.alert(error.message || 'تعذر تحديث حالة الجلسة.'); });
        }
        const clientButton = event.target.closest('[data-studio-open-client]');
        if (clientButton) {
            navigate('clients');
            document.dispatchEvent(new CustomEvent('trainer-studio-open-client', { detail: { clientId: clientButton.dataset.studioOpenClient } }));
        }
    });

    buildShell();
    renderRoute(resolveRoute());
    window.addEventListener('topgym:localechange', () => {
        localizeStudioShell();
        localizePlanEditor();
        const dynamic = $('#trainerStudioDynamicView');
        if (!dynamic || dynamic.hidden) return;
        setRouteChrome(resolveRoute());
        localizeTrainerStudioContent(dynamic);
    });
    void loadTrainerEntitlements();
})();
