(() => {
    if (window.__topGymSmartAssistantLoaded) return;
    window.__topGymSmartAssistantLoaded = true;

    const $ = (id) => document.getElementById(id);
    function brandName() {
        return String(window.topGymBranding?.get?.().identity?.brandName || 'الجيم').trim() || 'الجيم';
    }
    const state = {
        mode: 'screen',
        screen: 'dashboard',
        selectedLabel: '',
        messages: [],
        busy: false
    };

    // This is the assistant's product map. It mirrors every authenticated
    // screen/feature currently exposed by the application. It is deliberately
    // descriptive only: it never grants access and every action is checked
    // again against the central permission resolver before it is rendered or
    // executed.
    const SCREEN_META = Object.freeze({
        dashboard: {
            tab: 'dashboard',
            permission: 'dashboard.read',
            title: 'لوحة التحكم',
            description: 'نظرة سريعة على المشتركين والحضور والتنبيهات والحصص اليومية، مع المؤشرات المالية عند السماح بها.',
            help: 'من لوحة التحكم يمكنك متابعة المؤشرات التشغيلية والتنبيهات اليومية والحصص اليومية، وفتح الإجراءات السريعة المتاحة لحسابك. البيانات المالية لا تظهر إلا عند امتلاك صلاحية finance.read.',
            actions: ['add-member', 'add-day-pass', 'print-pricing', 'open-reports']
        },
        members: {
            tab: 'members',
            permission: ['members.read', 'memberships.read'],
            title: 'المشتركون',
            description: 'إدارة ملفات المشتركين والعضويات والحضور والإجراءات المرتبطة بها.',
            help: 'ابحث باسم المشترك أو هاتفه، ثم افتح التفاصيل. بحسب صلاحياتك قد تتمكن من الإضافة أو التعديل أو التجديد أو تسجيل دفعة أو التجميد أو الطباعة.',
            actions: ['add-member', 'search-members', 'open-pricing']
        },
        trainees: {
            tab: 'trainees',
            permission: 'trainees.read',
            title: 'المتدربون الخارجيون',
            description: 'متابعة العملاء بدون عضوية فعالة وبرامج التدريب والتغذية والقياسات.',
            help: 'يمكنك إضافة متدرب خارجي ثم إنشاء خطة تدريب أو خطة تغذية ومتابعة القياسات والجلسات وتسجيل الوجبات إذا كانت العملية مفعّلة لحسابك.',
            actions: ['add-trainee', 'create-workout', 'create-diet']
        },
        management: {
            tab: 'management',
            permission: 'pricing.read',
            title: 'الأسعار والعضويات',
            description: 'إدارة الباقات وأنواع العضويات وأسعارها من مساحة واحدة حسب الصلاحيات الممنوحة.',
            help: 'تستطيع مراجعة الباقات وأنواع العضويات إذا كانت صلاحية pricing.read متاحة. إدارة حسابات Assistant موجودة حصريًا في شاشة الصلاحيات.',
            actions: ['add-plan', 'add-membership-type']
        },
        'backup-history': {
            tab: 'backup-history',
            permission: 'management.backup.read',
            title: 'حماية البيانات',
            description: 'إنشاء النسخ الاحتياطية وفحصها واسترجاعها ومراجعة سجل العمليات الحساسة.',
            help: 'من شاشة حماية البيانات يمكنك تنزيل نسخة .json.gz أو .bak، فحص ملف قبل الاسترجاع، ومراجعة النسخ المحفوظة وسجل العمليات. هذه الأدوات مخصصة للOwner.',
            actions: []
        },
        attendance: {
            tab: 'attendance',
            permission: 'attendance.read',
            title: 'الحضور والانصراف',
            description: 'تسجيل حضور المشتركين وانصرافهم ومراجعة السجل والتقارير التشغيلية.',
            help: 'استخدم الهاتف أو QR Code لتسجيل الحضور، وسيقترح النظام الإجراء الصحيح حسب حالة المشترك. كل عملية تُنفّذ فقط إذا كانت صلاحيتها مفعّلة.',
            actions: ['attendance-phone', 'attendance-scan', 'attendance-refresh']
        },
        expenses: {
            tab: 'expenses',
            permission: 'finance.read',
            title: 'المصروفات والبيانات المالية',
            description: 'مراجعة المصروفات والحركة المالية عند امتلاك finance.read.',
            help: 'تظهر هذه الشاشة ومبالغها فقط مع finance.read. إضافة أو تعديل أو حذف المصروف يحتاج صلاحية العملية المقابلة، ولا يستطيع المساعد رؤية ماليات محجوبة.',
            actions: ['add-expense', 'open-reports']
        },
        library: {
            tab: 'library',
            permission: 'library.read',
            title: 'المكتبة',
            description: 'تمارين وأطعمة وعضلات جاهزة للاستخدام في الخطط.',
            help: 'ابحث داخل المكتبة أو استخدم الفلاتر للوصول إلى التمرين أو الطعام أو العضلة المناسبة. الإضافة والتعديل والحذف منفصلة الصلاحيات.',
            actions: ['search-library', 'add-library-item', 'refresh-library']
        },
        reports: {
            tab: 'reports',
            permission: 'reports.read',
            title: 'التقارير',
            description: 'تقارير الحضور والاشتراكات والحصص اليومية والبيانات المالية المسموح بها.',
            help: 'حدد الفترة ونوع التقرير ثم اعرض النتائج أو صدّرها إذا كانت reports.export متاحة. التقارير المالية والديون لا تعرض تفاصيلها دون finance.read.',
            actions: ['reports-focus-date', 'reports-refresh', 'open-members']
        },
        permissions: {
            tab: 'permissions',
            permission: 'permissions.manage',
            title: 'صلاحيات الحسابات',
            description: 'إدارة حسابات Assistant وصلاحيات كل شاشة وعملياتها من مكان واحد.',
            help: 'هذه الشاشة للمالك فقط. أنشئ أو عدّل أو عطّل حساب Assistant من قسم الحسابات، ثم اختر الحساب وخصص صلاحياته من بطاقات الشاشات. الحفظ يلغي جلسة الحساب المستهدف ويسجل التدقيق.',
            actions: ['add-assistant']
        },
        feedback: {
            tab: 'feedback',
            permission: 'feedback.read',
            title: 'تقييمات المشتركين',
            description: 'مراجعة تقييمات وآراء ومشكلات واقتراحات المشتركين.',
            help: 'هذه الشاشة للمالك فقط. استخدم فلاتر التقييم ونوع الملاحظة والتاريخ، ثم افتح تفاصيل المشترك عند الحاجة.',
            actions: ['open-members']
        },
        daypasses: {
            tab: 'dashboard',
            permission: 'day_passes.read',
            title: 'الحصص اليومية',
            description: 'تسجيل زيارة يومية للزائر ومتابعة الإيراد المستقل ورسائل واتساب.',
            help: 'يمكن تسجيل الاسم ورقم الهاتف اختياريًا؛ إذا تركتهما فارغين يُحفظ السجل كزائر. السعر يحدد من إعدادات أسعار الحصص، والإيراد يظهر في التقارير المالية عند السماح.',
            actions: ['add-day-pass', 'open-day-passes']
        }
    });

    const ACTIONS = Object.freeze({
        'open-dashboard': { label: 'فتح لوحة التحكم', icon: 'dashboard', type: 'navigate', tab: 'dashboard', permission: 'dashboard.read', success: 'فتحت لوحة التحكم.' },
        'add-member': { label: 'إضافة مشترك', icon: 'plus', type: 'navigate-click', tab: 'members', selector: '#addMemberButton', permission: 'members.create,memberships.create,payments.create', success: 'فتحت نافذة إضافة مشترك.' },
        'print-pricing': { label: 'طباعة الاشتراكات', icon: 'print', type: 'click', selector: '#dashboardPrintPricingButton', permission: 'pricing.read', success: 'بدأت تجهيز ملف الاشتراكات والباقات.' },
        'open-reports': { label: 'فتح التقارير', icon: 'chart', type: 'navigate', tab: 'reports', permission: 'reports.read', success: 'فتحت شاشة التقارير.' },
        'search-members': { label: 'البحث عن مشترك', icon: 'search', type: 'focus', selector: '#searchInput', permission: 'members.read', success: 'يمكنك كتابة اسم المشترك أو رقم الهاتف الآن.' },
        'open-members': { label: 'فتح المشتركين', icon: 'users', type: 'navigate', tab: 'members', permission: 'members.read,memberships.read', success: 'فتحت شاشة المشتركين.' },
        'open-pricing': { label: 'أسعار الباقات', icon: 'card', type: 'navigate-click', tab: 'members', selector: '#pricingButton', permission: 'pricing.read', success: 'فتحت أسعار الباقات.' },
        'add-trainee': { label: 'إضافة متدرب', icon: 'plus', type: 'navigate-click', tab: 'trainees', selector: '#addExternalTraineeButton', permission: 'trainees.create', success: 'فتحت نموذج إضافة متدرب خارجي.' },
        'create-workout': { label: 'إنشاء خطة تدريب', icon: 'dumbbell', type: 'navigate-click', tab: 'trainees', selector: '[data-coaching-action="workout"]', permission: 'coaching.create', success: 'اختر المتدرب لإنشاء خطة التدريب.' },
        'create-diet': { label: 'إنشاء خطة تغذية', icon: 'heart', type: 'navigate-click', tab: 'trainees', selector: '[data-coaching-action="diet"]', permission: 'coaching.create', success: 'اختر المتدرب لإنشاء خطة التغذية.' },
        'open-trainees': { label: 'فتح المتدربين الخارجيين', icon: 'users', type: 'navigate', tab: 'trainees', permission: 'trainees.read', success: 'فتحت شاشة المتدربين الخارجيين.' },
        'add-plan': { label: 'إضافة باقة', icon: 'plus', type: 'click', selector: '#addMembershipPlanButton', tab: 'management', permission: 'pricing.create', success: 'فتحت نموذج إضافة باقة.' },
        'add-membership-type': { label: 'إضافة نوع عضوية', icon: 'plus', type: 'click', selector: '#addMembershipTypeButton', tab: 'management', permission: 'pricing.create', success: 'فتحت نموذج إضافة نوع عضوية.' },
        'add-assistant': { label: 'إضافة Assistant', icon: 'user-plus', type: 'click', selector: '#authAddAssistantButton', tab: 'permissions', permission: 'permissions.manage', success: 'فتحت نموذج إضافة Assistant من شاشة الصلاحيات.' },
        'open-management': { label: 'فتح الأسعار والعضويات', icon: 'settings', type: 'navigate', tab: 'management', permission: 'pricing.read', success: 'فتحت شاشة الأسعار والعضويات.' },
        'open-permissions': { label: 'فتح الصلاحيات', icon: 'shield', type: 'navigate', tab: 'permissions', permission: 'permissions.manage', success: 'فتحت شاشة إدارة صلاحيات Assistant.' },
        'open-backups': { label: 'فتح النسخ الاحتياطية', icon: 'archive', type: 'navigate', tab: 'backup-history', permission: 'management.backup.read', success: 'فتحت شاشة حماية البيانات وسجل النسخ الاحتياطية.' },
        'attendance-phone': { label: 'تسجيل بالهاتف', icon: 'phone', type: 'click', selector: '#attendancePhoneModeButton', tab: 'attendance', permission: 'attendance.check_in', success: 'فعّلت التسجيل برقم الهاتف.' },
        'attendance-scan': { label: 'مسح QR Code', icon: 'qr', type: 'click', selector: '#attendanceScanButton', tab: 'attendance', permission: 'attendance.check_in', success: 'فتحت قارئ QR Code.' },
        'attendance-refresh': { label: 'تحديث سجل الحضور', icon: 'refresh', type: 'click', selector: '#attendanceRefreshButton', tab: 'attendance', permission: 'attendance.read', success: 'حدّثت سجل الحضور.' },
        'open-attendance': { label: 'فتح الحضور والانصراف', icon: 'calendar', type: 'navigate', tab: 'attendance', permission: 'attendance.read', success: 'فتحت شاشة الحضور والانصراف.' },
        'add-expense': { label: 'إضافة مصروف', icon: 'plus', type: 'click', selector: '#addExpenseButton, #addExpenseFromTabButton', tab: 'expenses', permission: 'finance.create', success: 'فتحت نموذج إضافة مصروف.' },
        'open-expenses': { label: 'فتح المصروفات', icon: 'wallet', type: 'navigate', tab: 'expenses', permission: 'finance.read', success: 'فتحت شاشة المصروفات.' },
        'add-day-pass': { label: 'إضافة حصة يومية', icon: 'ticket', type: 'navigate-click', tab: 'dashboard', selector: '#dashboardDayPassAdd', permission: 'day_passes.create,payments.create', success: 'فتحت نموذج تسجيل حصة يومية.' },
        'open-day-passes': { label: 'إدارة الحصص اليومية', icon: 'ticket', type: 'navigate-click', tab: 'dashboard', selector: '#dashboardDayPassManage', permission: 'day_passes.read', success: 'فتحت سجل الحصص اليومية.' },
        'search-library': { label: 'البحث في المكتبة', icon: 'search', type: 'focus', selector: '#librarySearch', tab: 'library', permission: 'library.read', success: 'يمكنك البحث عن تمرين أو طعام أو عضلة الآن.' },
        'add-library-item': { label: 'إضافة عنصر', icon: 'plus', type: 'click', selector: '#libraryAddButton', tab: 'library', permission: 'library.create', success: 'فتحت نموذج إضافة عنصر للمكتبة.' },
        'refresh-library': { label: 'تحديث المكتبة', icon: 'refresh', type: 'click', selector: '#libraryRefreshButton', tab: 'library', permission: 'library.read', success: 'حدّثت بيانات المكتبة.' },
        'open-library': { label: 'فتح المكتبة', icon: 'book', type: 'navigate', tab: 'library', permission: 'library.read', success: 'فتحت شاشة المكتبة.' },
        'reports-focus-date': { label: 'اختيار فترة التقرير', icon: 'calendar', type: 'focus', selector: '#reportFrom, #reportsFrom, [data-report-from]', tab: 'reports', permission: 'reports.read', success: 'اختر تاريخ بداية التقرير.' },
        'reports-refresh': { label: 'عرض التقرير', icon: 'chart', type: 'click', selector: '#reportsRunButton, #loadReportButton, [data-reports-run]', tab: 'reports', permission: 'reports.read', success: 'حدّثت نتائج التقرير.' },
        'open-feedback': { label: 'فتح تقييمات المشتركين', icon: 'star', type: 'navigate', tab: 'feedback', permission: 'feedback.read', success: 'فتحت شاشة تقييمات المشتركين.' }
    });

    const ICONS = Object.freeze({
        plus: '<path d="M12 5v14M5 12h14"/>',
        print: '<path d="M6 9V3h12v6M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2M6 14h12v7H6z"/>',
        chart: '<path d="M4 19V5M4 19h16M7 15l3-4 3 2 5-6"/>',
        search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/>',
        card: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 10h18"/>',
        user: '<circle cx="12" cy="8" r="3"/><path d="M5 21a7 7 0 0 1 14 0"/>',
        'user-plus': '<circle cx="9" cy="8" r="3"/><path d="M3 21a6 6 0 0 1 12 0M19 8v6M16 11h6"/>',
        dumbbell: '<path d="M6 8v8M18 8v8M3 11h18M8 5h8v14H8z"/>',
        heart: '<path d="M12 21c-4-2-7-5.5-7-10a5 5 0 0 1 7-4.6A5 5 0 0 1 19 11c0 4.5-3 7.8-7 10Z"/>',
        phone: '<path d="M6.5 3.5 9 3l2 5-2.3 1.6a14 14 0 0 0 5.2 5.2l1.6-2.3 5 2 .5 2.5a2 2 0 0 1-2.2 2.4C10.5 18.5 5.5 13.5 4.1 5.7A2 2 0 0 1 6.5 3.5Z"/>',
        qr: '<rect x="4" y="4" width="6" height="6"/><rect x="14" y="4" width="6" height="6"/><rect x="4" y="14" width="6" height="6"/><path d="M14 14h3v3h3M14 20h2M20 14v2"/>',
        refresh: '<path d="M20 11a8 8 0 0 0-14.8-4L3 10M3 5v5h5M4 13a8 8 0 0 0 14.8 4L21 14M21 19v-5h-5"/>',
        calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M8 3v4M16 3v4M3 10h18"/>',
        users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM22 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8"/>',
        dashboard: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
        settings: '<path d="M12 3v18M3 12h18"/><circle cx="12" cy="12" r="8"/>',
        shield: '<path d="M12 3 20 6v5c0 5-3.4 8.5-8 10-4.6-1.5-8-5-8-10V6l8-3Z"/><path d="m9 12 2 2 4-4"/>',
        archive: '<path d="M4 7h16v13H4zM3 4h18v3H3zM9 11h6"/>',
        wallet: '<path d="M3 7a2 2 0 0 1 2-2h14v14H5a2 2 0 0 1-2-2z"/><path d="M3 8h16M16 12h3"/>',
        ticket: '<path d="M4 6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v3a2 2 0 0 0 0 6v3a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-3a2 2 0 0 0 0-6Z"/><path d="M12 7v2M12 15v2"/>',
        book: '<path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v16H6.5A2.5 2.5 0 0 0 4 21.5z"/><path d="M4 5.5v16M8 7h8M8 11h6"/>',
        star: '<path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-2.9-5.6 2.9 1.1-6.2L3 9.6l6.2-.9L12 3Z"/>'
    });

    const launcher = $('smartAssistantLauncher');
    const panel = $('smartAssistantPanel');
    const context = $('smartAssistantContext');
    const screenLabel = $('smartAssistantScreenLabel');
    const quickActions = $('smartAssistantQuickActions');
    const messages = $('smartAssistantMessages');
    const input = $('smartAssistantInput');
    const submit = $('smartAssistantSubmit');
    if (!launcher || !panel || !context || !quickActions || !messages || !input) return;

    function escapeHtml(value) {
        return String(value ?? '').replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[character]));
    }

    function normalize(value) {
        return String(value || '')
            .toLocaleLowerCase('ar-EG')
            .replace(/[ًٌٍَُِّْـ]/g, '')
            .replace(/[إأآ]/g, 'ا')
            .replace(/ى/g, 'ي')
            .replace(/[؟?!.,،]/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
    }

    function permissionAllowed(required) {
        if (!required) return true;
        // Before the auth bootstrap completes, keep the assistant's DOM quiet
        // but do not make a permanent decision from an empty user object.
        if (!window.topGymAuth?.isReady?.()) return true;
        const codes = Array.isArray(required)
            ? required
            : String(required).split(',').map((code) => code.trim()).filter(Boolean);
        return codes.every((code) => window.topGymAuth?.hasPermission?.(code) === true);
    }

    function anyPermissionAllowed(required) {
        if (!required?.length) return true;
        if (!window.topGymAuth?.isReady?.()) return true;
        return required.some((code) => permissionAllowed(code));
    }

    function isAllowedTab(tab) {
        if (!window.topGymAuth?.isReady?.()) return true;
        return !tab || window.topGymAuth?.canAccessTab?.(tab) !== false;
    }

    function screenAvailable(screen) {
        const meta = SCREEN_META[screen];
        if (!meta) return false;
        if (!isAllowedTab(meta.tab)) return false;
        if (!anyPermissionAllowed(meta.permissionAny)) return false;
        return permissionAllowed(meta.permission);
    }

    function firstAvailableScreen() {
        return Object.keys(SCREEN_META).find((screen) => SCREEN_META[screen].tab && screenAvailable(screen)) || 'dashboard';
    }

    function currentScreen() {
        const requested = document.documentElement.dataset.topGymActiveTab || window.location.hash.slice(1);
        if (SCREEN_META[requested] && screenAvailable(requested)) return requested;
        return firstAvailableScreen();
    }

    function actionAvailable(action) {
        if (!action || !isAllowedTab(action.tab)) return false;
        if (!anyPermissionAllowed(action.permissionAny) || !permissionAllowed(action.permission)) return false;
        if (action.type === 'navigate' || action.type === 'navigate-click') return true;
        return [...document.querySelectorAll(action.selector || '')].some((element) => !element.disabled && !element.hidden);
    }

    function iconMarkup(name) {
        return `<svg class="ui-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name] || ICONS.plus}</svg>`;
    }

    function actionFromId(id) {
        const action = ACTIONS[id];
        return action ? { ...action, id } : null;
    }

    function availableActions() {
        const meta = SCREEN_META[state.screen] || SCREEN_META.dashboard;
        return (meta.actions || []).map(actionFromId).filter(Boolean).filter(actionAvailable);
    }

    function actionsFromIds(ids = []) {
        return ids.map(actionFromId).filter(Boolean).filter(actionAvailable);
    }

    function renderContext() {
        const meta = SCREEN_META[state.screen] || SCREEN_META.dashboard;
        screenLabel.textContent = meta.title;
        context.innerHTML = `<strong>${escapeHtml(meta.title)}${state.selectedLabel ? ` · ${escapeHtml(state.selectedLabel)}` : ''}</strong><span>${escapeHtml(meta.description)}</span>`;
    }

    function renderQuickActions() {
        quickActions.replaceChildren();
        if (state.mode !== 'screen') return;
        availableActions().forEach((action) => {
            const button = document.createElement('button');
            button.className = 'smart-assistant-quick-action';
            button.type = 'button';
            button.dataset.assistantAction = action.id;
            button.setAttribute('aria-label', action.label);
            button.innerHTML = `${iconMarkup(action.icon)}<span>${escapeHtml(action.label)}</span>`;
            quickActions.append(button);
        });
    }

    function renderMessages() {
        messages.replaceChildren();
        state.messages.forEach((message) => {
            const article = document.createElement('article');
            article.className = `smart-assistant-message ${message.role}`;
            const text = document.createElement('div');
            text.textContent = String(message.text || '').replaceAll('TOP GYM', () => brandName());
            article.append(text);
            if (message.actions?.length) {
                const actions = document.createElement('div');
                actions.className = 'smart-assistant-message-actions';
                message.actions.filter(actionAvailable).forEach((action) => {
                    const button = document.createElement('button');
                    button.className = 'smart-assistant-message-action';
                    button.type = 'button';
                    button.dataset.assistantAction = action.id;
                    button.textContent = action.label;
                    actions.append(button);
                });
                article.append(actions);
            }
            messages.append(article);
        });
        messages.scrollTop = messages.scrollHeight;
    }

    function setIntro() {
        const meta = SCREEN_META[state.screen] || SCREEN_META.dashboard;
        state.messages = [{
            role: 'assistant',
            text: state.mode === 'general'
                ? 'أنا مساعد TOP GYM. اسألني عن أي شاشة أو إجراء أو طريقة استخدام داخل النظام.'
                : `أنا هنا لمساعدتك في ${meta.title}. ${meta.help}`,
            actions: state.mode === 'general'
                ? actionsFromIds(['open-dashboard', 'open-members', 'open-attendance', 'open-library', 'open-reports'])
                : []
        }];
        renderMessages();
    }

    function setMode(mode) {
        state.mode = mode === 'general' ? 'general' : 'screen';
        document.querySelectorAll('[data-assistant-mode]').forEach((tab) => tab.setAttribute('aria-selected', String(tab.dataset.assistantMode === state.mode)));
        renderContext();
        renderQuickActions();
        setIntro();
    }

    async function activateTab(tab) {
        if (!screenAvailable(tab)) {
            state.messages.push({ role: 'assistant', text: 'هذه الشاشة غير متاحة حسب صلاحيات حسابك.' });
            renderMessages();
            return;
        }
        if (window.topGymActivateTab) await window.topGymActivateTab(tab);
        else window.location.hash = `#${tab}`;
    }

    async function runAction(id) {
        const action = actionFromId(id);
        if (!action || !actionAvailable(action)) {
            state.messages.push({ role: 'assistant', text: 'هذا الإجراء غير متاح لحسابك حاليًا أو يحتاج إلى صلاحية مستقلة.' });
            renderMessages();
            return;
        }
        if (action.type === 'navigate') {
            await activateTab(action.tab);
        } else if (action.type === 'navigate-click') {
            await activateTab(action.tab);
            window.setTimeout(() => document.querySelector(action.selector)?.click(), 120);
        } else if (action.type === 'focus') {
            document.querySelector(action.selector)?.focus();
        } else {
            document.querySelector(action.selector)?.click();
        }
        state.messages.push({ role: 'assistant', text: action.success || `تم تنفيذ: ${action.label}.` });
        renderMessages();
    }

    function answerQuestion(question) {
        const normalized = normalize(question);
        const financialQuestion = /(مصروف|مالية|ماليات|تحصيل|دفعة|دفع|رصيد|إيراد|ايراد|مدفوع|متبقي|مستحق|مبلغ|سداد)/.test(normalized);
        if (financialQuestion && !permissionAllowed('finance.read')) {
            return {
                text: 'لا يمكنني عرض أو شرح أي بيانات مالية لهذا الحساب لأن صلاحية عرض البيانات المالية غير مفعّلة. اطلب من Owner منح finance.read إذا كان ذلك مناسبًا.',
                actions: actionsFromIds(['open-members'])
            };
        }

        const topics = [
            { pattern: /(مشترك|عضو).*(اضاف|اضيف|ضيف)|(اضاف|اضيف|ضيف).*(مشترك|عضو)/, screen: 'members', action: 'add-member', text: 'لإضافة مشترك افتح شاشة «المشتركون» ثم استخدم «إضافة مشترك». سيطلب النظام البيانات الأساسية والعضوية والتحصيل حسب الصلاحيات المتاحة.' },
            { pattern: /(عضوية|تجديد|تجميد|اشتراك|بوابة|كود العضوية)/, screen: 'members', action: 'open-members', text: 'من تفاصيل المشترك يمكنك مراجعة العضوية الحالية وسجل التجديدات والحضور وكود بوابة المشترك. التجديد والتجميد وتسجيل الدفعة عمليات مستقلة وقد لا تظهر لحسابك.' },
            { pattern: /(حضور|انصراف|qr|باركود)/, screen: 'attendance', action: 'attendance-phone', text: 'من «الحضور والانصراف» يمكنك التسجيل بالهاتف أو QR Code، ثم تنفيذ الحضور أو الانصراف المقترح حسب حالة المشترك.' },
            { pattern: /(تقرير|تقارير|report)/, screen: 'reports', action: 'open-reports', text: 'من «التقارير» اختر الفترة ونوع التقرير ثم اعرض النتائج أو صدّرها إذا كانت صلاحية التصدير متاحة. ما يظهر يتحدد بصلاحيات حسابك.' },
            { pattern: /(باقة|عضوي|اسعار|أسعار|سعر)/, screen: 'management', action: 'open-management', text: 'إدارة الباقات وأنواع العضويات موجودة في «الأسعار والعضويات». العرض والتعديل والإضافة صلاحيات منفصلة.' },
            { pattern: /(متدرب|تغذي|تدريب|تمرين|خطة|جلسة|وجبة|قياس)/, screen: 'trainees', action: 'open-trainees', text: 'من «المتدربين الخارجيين» يمكنك إضافة متدرب، ثم إنشاء التدريب والتغذية والقياسات والجلسات وتسجيل الوجبات حسب الصلاحيات.' },
            { pattern: /(مصروف|مالية|ماليات|تحصيل|دفعة|دفع|رصيد|إيراد|ايراد|مدفوع|متبقي|حساب)/, screen: 'expenses', action: 'open-expenses', text: 'البيانات المالية محمية بصلاحية مستقلة. بعد السماح بها يمكنك مراجعة المصروفات والتحصيل والتقارير المالية، بينما الإضافة والتعديل والحذف لكل منها صلاحية منفصلة.' },
            { pattern: /(حصة يومية|حصص|زائر|دخول يومي|زيارة يومية)/, screen: 'daypasses', action: 'open-day-passes', text: '«الحصص اليومية» تسجل زيارة الزائر وتربطها بسعر الحصة وطريقة الدفع. الاسم والهاتف اختياريان؛ تركهما فارغين يحفظ السجل باسم «زائر». الإيراد يظهر في المواضع المالية المسموح بها.' },
            { pattern: /(مكتبة|طعام|عضلة)/, screen: 'library', action: 'open-library', text: '«المكتبة» تحتوي على التمارين والأطعمة والعضلات. استخدم البحث والتصفية والتفاصيل، وتظهر الإضافة والتعديل والحذف فقط عند امتلاك صلاحياتها.' },
            { pattern: /(صلاحية|صلاحيات|مساعد|assistant|حسابات الإدارة)/, screen: 'permissions', action: 'open-permissions', text: 'إدارة صلاحيات Assistant ومصفوفة القراءة والعمليات متاحة للOwner فقط. لا يستطيع المساعد تعديل صلاحياته أو رؤية شاشة الإدارة إذا لم تُمنح له.' },
            { pattern: /(تقييم|شكوى|اقتراح|رأي المشترك)/, screen: 'feedback', action: 'open-feedback', text: '«تقييمات المشتركين» تعرض تقييمات وآراء ومشكلات واقتراحات بوابة المشترك، وهي شاشة Owner-only مع فلاتر للتقييم والنوع والتاريخ.' },
            { pattern: /(نسخة احتياطية|باك اب|backup|استعادة)/, screen: 'backup-history', action: 'open-backups', permission: 'management.backup.read', text: 'النسخ الاحتياطية وإجراءات الإنشاء والاستعادة والحذف مخصصة للOwner، وتُسجل العمليات الحساسة في التدقيق داخل شاشة حماية البيانات.' },
            { pattern: /(تسجيل الدخول|جلسة|كلمة المرور|خروج)/, screen: null, action: null, text: 'تسجيل الدخول يعتمد على جلسة آمنة. عند انتهاء الجلسة سيطلب النظام تسجيل الدخول مرة أخرى، ولا يعرض المساعد كلمات المرور أو رموز الجلسات.' },
            { pattern: /(مساعد ذكي|كيف تستخدم|ماذا تستطيع|مساعدة)/, screen: null, action: null, text: 'أشرح لك الشاشة الحالية وكل الإجراءات التي تسمح بها صلاحياتك، وأستطيع فتح الشاشة المناسبة أو تنفيذ الإجراء السريع المتاح. لا أقترح ولا أنفذ عملية محجوبة.' }
        ];
        const match = topics.find((item) => item.pattern.test(normalized));
        if (match) {
            if (match.permission && !permissionAllowed(match.permission)) {
                return { text: 'هذا الجزء غير متاح لحسابك حسب الصلاحيات الحالية. اطلب من Owner تفعيل الصلاحية المناسبة إذا كان ذلك مطلوبًا.', actions: [] };
            }
            if (match.screen && !screenAvailable(match.screen)) {
                return { text: 'هذه الشاشة غير متاحة لحسابك حسب الصلاحيات الحالية، لذلك لن أعرض تفاصيلها أو أقترح إجراءاتها.', actions: [] };
            }
            return { text: match.text, actions: match.action ? actionsFromIds([match.action]) : [] };
        }
        const meta = SCREEN_META[state.screen] || SCREEN_META.dashboard;
        if (/(كيف|ازاي|إزاى|شرح|ماذا|ما هي|اقدر|أقدر)/.test(normalized)) {
            return { text: meta.help, actions: availableActions().slice(0, 3) };
        }
        return {
            text: 'لم أجد إجابة محددة لهذا السؤال بعد. يمكنك السؤال عن المشتركين، العضويات، الحضور، المتدربين، التدريب والتغذية، الحصص اليومية، المكتبة، التقارير، الصلاحيات، أو اكتب «كيف أستخدم هذه الشاشة؟».',
            actions: state.mode === 'general'
                ? actionsFromIds(['open-dashboard', 'open-members', 'open-attendance', 'open-library', 'open-reports'])
                : availableActions().slice(0, 3)
        };
    }

    async function submitQuestion(event) {
        event.preventDefault();
        const question = input.value.trim();
        if (!question || state.busy) return;
        state.busy = true;
        submit.disabled = true;
        state.messages.push({ role: 'user', text: question });
        const answer = answerQuestion(question);
        input.value = '';
        renderMessages();
        await new Promise((resolve) => window.setTimeout(resolve, 120));
        state.messages.push({ role: 'assistant', text: answer.text, actions: answer.actions?.filter(Boolean) });
        state.busy = false;
        submit.disabled = false;
        renderMessages();
    }

    function syncScreen(screen = currentScreen(), resetConversation = true) {
        const nextScreen = SCREEN_META[screen] && screenAvailable(screen) ? screen : firstAvailableScreen();
        const changed = nextScreen !== state.screen;
        state.screen = nextScreen;
        renderContext();
        renderQuickActions();
        if (state.mode === 'screen' && (resetConversation || changed || !state.messages.length)) setIntro();
    }

    function open() {
        syncScreen(currentScreen(), false);
        panel.hidden = false;
        launcher.setAttribute('aria-expanded', 'true');
        window.setTimeout(() => input.focus(), 40);
    }

    function close() {
        panel.hidden = true;
        launcher.setAttribute('aria-expanded', 'false');
    }

    function syncAuthVisibility() {
        const authenticated = Boolean(document.body.dataset.topGymAuthenticated === 'true' && window.topGymAuth?.getUser?.());
        launcher.hidden = !authenticated;
        if (!authenticated) close();
    }

    launcher.addEventListener('click', () => (panel.hidden ? open() : close()));
    $('smartAssistantClose')?.addEventListener('click', close);
    $('smartAssistantForm')?.addEventListener('submit', submitQuestion);
    document.querySelectorAll('[data-assistant-mode]').forEach((tab) => tab.addEventListener('click', () => setMode(tab.dataset.assistantMode)));
    document.addEventListener('click', (event) => {
        const actionButton = event.target.closest('[data-assistant-action]');
        if (actionButton && panel.contains(actionButton)) {
            void runAction(actionButton.dataset.assistantAction);
            return;
        }
        if (!panel.hidden && !panel.contains(event.target) && !launcher.contains(event.target)) close();
    });
    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape' && !panel.hidden) close();
    });
    window.addEventListener('topgym:tab-changed', (event) => syncScreen(event.detail?.name || currentScreen()));
    window.addEventListener('topgym:brandingchange', () => renderMessages());
    window.addEventListener('topgym:member-details-opened', (event) => {
        state.selectedLabel = event.detail?.member?.fullName || event.detail?.member?.name || '';
        renderContext();
    });
    new MutationObserver(syncAuthVisibility).observe(document.body, { attributes: true, attributeFilter: ['class', 'data-top-gym-authenticated'] });
    window.topGymAuthReady?.then(() => {
        syncAuthVisibility();
        syncScreen(currentScreen(), true);
    }).catch(() => {
        syncAuthVisibility();
        syncScreen(currentScreen(), true);
    });
    syncAuthVisibility();

    window.topGymAssistant = Object.freeze({
        open,
        close,
        ask: (question) => {
            const answer = answerQuestion(question);
            state.messages.push(
                { role: 'user', text: question },
                { role: 'assistant', text: answer.text, actions: answer.actions?.filter(actionAvailable) }
            );
            renderMessages();
            open();
        }
    });
})();
