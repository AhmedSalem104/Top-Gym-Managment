(() => {
    'use strict';

    const shell = document.querySelector('.trainer-workspace-shell');
    if (!shell) return;

    const $ = (selector, root = document) => root.querySelector(selector);
    const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
    const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));
    const formatNumber = (value) => Number(value || 0).toLocaleString('ar-EG');
    const formatMoney = (value) => `${Number(value || 0).toLocaleString('ar-EG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ج.م`;
    const formatDate = (value, withTime = false) => {
        if (!value) return '—';
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) return String(value);
        return new Intl.DateTimeFormat('ar-EG', withTime ? { dateStyle: 'medium', timeStyle: 'short' } : { dateStyle: 'medium' }).format(date);
    };
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
                logout: $('#trainerWorkspaceLogout')
            };
            legacyHeader.className = 'trainer-studio-topbar';
            legacyHeader.setAttribute('aria-label', 'الشريط العلوي لمساحة المدرب');
            legacyHeader.innerHTML = '<div class="trainer-studio-topbar-brand"><span class="trainer-studio-topbar-mark">L</span><div><span class="trainer-studio-topbar-kicker">Logic Fit · Trainer Studio</span><span class="trainer-studio-topbar-brand-slot"></span><span class="trainer-studio-runtime-message-slot"></span></div></div><div class="trainer-studio-topbar-context"><span class="trainer-studio-topbar-badge"><span class="trainer-studio-topbar-dot" aria-hidden="true"></span><span class="trainer-studio-topbar-status-slot"></span></span><span class="trainer-studio-topbar-plan-slot"></span></div><div class="trainer-studio-topbar-actions"><span class="trainer-studio-topbar-theme-slot"></span><span class="trainer-studio-topbar-logout-slot"></span></div>';
            const slot = (selector) => $(selector, legacyHeader);
            if (preserved.brand) { preserved.brand.className = 'trainer-studio-topbar-tenant'; slot('.trainer-studio-topbar-brand-slot')?.append(preserved.brand); }
            if (preserved.message) { preserved.message.className = 'trainer-studio-runtime-message'; preserved.message.setAttribute('role', 'status'); slot('.trainer-studio-runtime-message-slot')?.append(preserved.message); }
            if (preserved.status) { preserved.status.className = 'trainer-studio-topbar-status'; slot('.trainer-studio-topbar-status-slot')?.append(preserved.status); }
            else if (slot('.trainer-studio-topbar-status-slot')) slot('.trainer-studio-topbar-status-slot').textContent = 'مساحة خاصة';
            if (preserved.plan) { preserved.plan.className = 'trainer-studio-topbar-plan'; slot('.trainer-studio-topbar-plan-slot')?.append(preserved.plan); }
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
        sidebar.innerHTML = `<div class="trainer-studio-sidebar-brand"><span class="trainer-studio-brand-mark">L</span><div><strong>Trainer Studio</strong><small>Logic Fit</small></div><button type="button" class="trainer-studio-sidebar-close" id="trainerStudioSidebarClose" aria-label="إغلاق القائمة">×</button></div><div class="trainer-studio-sidebar-scroll">${navGroups.map((group) => `<section class="trainer-studio-nav-group"><span class="trainer-studio-nav-label">${group.label}</span><nav aria-label="${group.label}">${group.items.map(([route, label, iconName]) => `<a href="/trainer-workspace/${route}" class="trainer-studio-nav-link" data-studio-route="${route}"><span class="trainer-studio-nav-icon">${icon(iconName)}</span><span>${label}</span></a>`).join('')}</nav></section>`).join('')}</div><div class="trainer-studio-sidebar-footer"><span class="trainer-studio-secure-dot"></span><span>مساحة خاصة وآمنة</span></div>`;
        const routeBar = document.createElement('div');
        routeBar.className = 'trainer-studio-route-bar';
        routeBar.id = 'trainerStudioRouteBar';
        routeBar.innerHTML = '<button type="button" class="trainer-studio-menu-button" id="trainerStudioMenuButton" aria-controls="trainerStudioSidebar" aria-expanded="false" aria-label="فتح قائمة Trainer Studio"><span></span><span></span><span></span></button><div><span class="trainer-studio-route-eyebrow" id="trainerStudioRouteEyebrow">مساحة المدرب</span><h2 id="trainerStudioRouteTitle">لوحة التحكم</h2></div><div class="trainer-studio-route-meta"><span class="trainer-studio-live-indicator"></span><span>بيانات مساحتك التدريبية</span></div>';
        content.prepend(routeBar);
        const dynamic = document.createElement('section');
        dynamic.id = 'trainerStudioDynamicView';
        dynamic.className = 'trainer-studio-dynamic-view';
        dynamic.hidden = true;
        content.append(dynamic);
        shell.append(sidebar, content);
        $('.trainer-workspace-nav')?.setAttribute('hidden', '');
        markStaticSurfaces();
        $('#trainerStudioMenuButton')?.addEventListener('click', () => setSidebarOpen(true));
        $('#trainerStudioSidebarClose')?.addEventListener('click', () => setSidebarOpen(false));
        $$('.trainer-studio-nav-link').forEach((link) => link.addEventListener('click', (event) => {
            event.preventDefault();
            navigate(link.dataset.studioRoute);
        }));
        window.addEventListener('popstate', () => renderRoute(resolveRoute()));
    }

    function markStaticSurfaces() {
        const marks = [['.trainer-welcome-strip', 'dashboard'], ['.trainer-workspace-summary', 'dashboard'], ['.trainer-quick-actions', 'dashboard'], ['#trainerToday', 'dashboard'], ['#trainerClients', 'clients'], ['#trainerPackages', 'packages'], ['#trainerPurchases', 'sales'], ['#trainerReports', 'reports']];
        marks.forEach(([selector, route]) => { const element = $(selector); if (element) { element.dataset.studioSurface = route; if (selector === '.trainer-welcome-strip') element.hidden = true; } });
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
        if (title) title.textContent = meta.label;
        if (eyebrow) eyebrow.textContent = meta.eyebrow;
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
        return `<div class="trainer-studio-page-head"><div><span class="trainer-panel-kicker">${meta.eyebrow}</span><h1>${meta.label}</h1><p>${meta.description}</p></div><span class="trainer-studio-page-tag">Trainer Studio</span></div>${content}`;
    }

    function emptyState(title, body = 'ستظهر البيانات هنا عند توفرها.') {
        return `<div class="trainer-studio-empty"><span class="trainer-studio-empty-mark">—</span><strong>${escapeHtml(title)}</strong><p>${escapeHtml(body)}</p></div>`;
    }

    function errorState(message) {
        return `<div class="trainer-studio-error" role="alert"><strong>تعذر تحميل هذه المساحة</strong><p>${escapeHtml(message || 'حاول تحديث الصفحة مرة أخرى.')}</p><button type="button" class="btn btn-light btn-small" data-studio-retry>إعادة المحاولة</button></div>`;
    }

    function renderListPage(route, title, rows, renderer, emptyTitle, actions = '') {
        const dynamic = $('#trainerStudioDynamicView');
        if (!dynamic) return;
        const renderedRows = rows.length
            ? (renderer.length === 0 ? renderer() : rows.map(renderer).join(''))
            : emptyState(emptyTitle);
        dynamic.innerHTML = pageFrame(route, `<section class="trainer-studio-data-panel"><div class="trainer-studio-data-panel-head"><div><span class="trainer-panel-kicker">مصدر البيانات الحالي</span><h2>${title}</h2></div><div class="trainer-studio-panel-actions">${actions}<span class="trainer-studio-count-chip">${formatNumber(rows.length)} عنصر</span></div></div><div class="trainer-studio-data-list">${renderedRows}</div></section>`);
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

    async function openPlanEditor(route, isNutrition) {
        const dynamic = $('#trainerStudioDynamicView');
        dynamic.innerHTML = pageFrame(route, '<section class="trainer-studio-data-panel"><div class="trainer-studio-loading"><span class="trainer-studio-spinner"></span>جاري تجهيز النموذج...</div></section>');
        try {
            const [clients, catalog] = await Promise.all([getTrainerClients(), getBuilderCatalog()]);
            dynamic.innerHTML = pageFrame(route, renderPlanEditor(route, isNutrition, clients, catalog));
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
            renderListPage(route, isNutrition ? 'خطط التغذية المحفوظة' : 'خطط التدريب المحفوظة', plans, (item) => `<article class="trainer-studio-data-row"><div class="trainer-studio-row-icon">${icon(isNutrition ? 'activity' : 'plan')}</div><div class="trainer-studio-row-main"><strong>${escapeHtml(item.name || 'خطة بدون اسم')}</strong><span>${escapeHtml(item.memberName || item.clientName || 'مرتبطة بعميل')} · ${escapeHtml(item.goal || item.level || item.status || 'بيانات محفوظة')}</span></div><span class="trainer-status-pill trainer-status-pill--${escapeHtml(item.status || 'active')}">${escapeHtml(item.status || 'نشطة')}</span><button type="button" class="btn btn-light btn-small trainer-studio-row-action" data-studio-plan-id="${escapeHtml(item.id)}" data-studio-plan-kind="${isNutrition ? 'nutrition' : 'training'}" data-studio-plan-status="${item.status === 'archived' ? 'active' : 'archived'}">${item.status === 'archived' ? 'إعادة تفعيل' : 'أرشفة'}</button></article>`, isNutrition ? 'لا توجد خطط تغذية محفوظة.' : 'لا توجد خطط تدريب محفوظة.', `<button type="button" class="btn btn-primary btn-small" data-studio-open-editor><span>${icon('plus')}</span>إنشاء خطة</button>`);
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
        dynamic.innerHTML = pageFrame(type, '<section class="trainer-library-loading"><span class="trainer-studio-spinner"></span>جاري تجهيز المكتبة المصورة...</section>');
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
                <header class="trainer-library-hero"><div class="trainer-library-hero-mark" aria-hidden="true">${type === 'exercises' ? '✦' : type === 'muscles' ? '◌' : '◈'}</div><div><span class="trainer-panel-kicker">${meta.eyebrow}</span><h2>${meta.title}</h2><p>${type === 'exercises' ? 'استخدم الكتالوج المصور لبناء برامج تدريب دقيقة ومناسبة لكل عميل.' : type === 'muscles' ? 'صور وبيانات تشريحية تساعدك على ربط كل حركة بالعضلة المستهدفة.' : 'مرجع غذائي عملي لبناء خطط تغذية واقعية من البيانات الحالية.'}</p></div><div class="trainer-library-hero-stat"><strong>${formatNumber(stat)}</strong><span>عنصر متاح</span></div></header>
                <section class="trainer-library-toolbar" aria-label="بحث المكتبة"><form id="trainerCatalogSearchForm" class="trainer-library-search-form"><label><span class="sr-only">${meta.search}</span><span class="trainer-library-search-icon" aria-hidden="true">⌕</span><input id="trainerCatalogSearch" type="search" value="${escapeHtml(search)}" placeholder="${meta.search}" autocomplete="off"></label><button type="submit" class="btn btn-primary btn-small">بحث</button></form><div class="trainer-library-toolbar-meta"><span class="trainer-studio-count-chip">${formatNumber(pagination.totalItems)} ${type === 'exercises' ? 'تمرين' : type === 'muscles' ? 'عضلة' : 'طعام'}</span>${type === 'exercises' ? '<button type="button" class="btn btn-light btn-small" data-studio-go-training>إنشاء برنامج من المكتبة</button>' : ''}</div></section>
                <div class="trainer-library-grid" id="trainerCatalogGrid">${renderCatalogGrid(type, items)}</div>
                <footer class="trainer-library-pagination"><span>صفحة ${formatNumber(pagination.page)} من ${formatNumber(pagination.totalPages)}</span><div><button type="button" class="btn btn-light btn-small" data-trainer-catalog-page="${Math.max(1, Number(pagination.page) - 1)}" ${pagination.page <= 1 ? 'disabled' : ''}>السابق</button><button type="button" class="btn btn-light btn-small" data-trainer-catalog-page="${Math.min(Number(pagination.totalPages), Number(pagination.page) + 1)}" ${pagination.page >= pagination.totalPages ? 'disabled' : ''}>التالي</button></div></footer>
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
                const open = `<button type="button" class="btn btn-light btn-small trainer-studio-row-action" data-studio-open-client="${escapeHtml(item.id)}">فتح الملف</button>`;
                if (kind === 'checkins') return `<article class="trainer-studio-data-row"><div class="trainer-studio-row-icon">${icon('activity')}</div><div class="trainer-studio-row-main"><strong>${escapeHtml(item.fullName)}</strong><span>${item.lastCheckinAt ? `آخر متابعة ${formatDate(item.lastCheckinAt)}` : 'لا توجد متابعة مسجلة'} · ${item.lastMeasurementAt ? `آخر قياس ${formatDate(item.lastMeasurementAt)}` : 'لا يوجد قياس حديث'}</span></div><span class="trainer-status-pill trainer-status-pill--${item.lastCheckinAt ? 'active' : 'scheduled'}">${item.lastCheckinAt ? 'متابعة موجودة' : 'تحتاج متابعة'}</span>${open}</article>`;
                if (kind === 'measurements') return `<article class="trainer-studio-data-row"><div class="trainer-studio-row-icon">${icon('activity')}</div><div class="trainer-studio-row-main"><strong>${escapeHtml(item.fullName)}</strong><span>${formatNumber(item.measurementCount)} قياس · ${item.lastMeasurementAt ? `آخر تحديث ${formatDate(item.lastMeasurementAt)}` : 'لم يسجل قياس بعد'}</span></div><span class="trainer-studio-inline-number">${formatNumber(item.measurementCount)}</span>${open}</article>`;
                return `<article class="trainer-studio-data-row"><div class="trainer-studio-row-icon">${icon('chart')}</div><div class="trainer-studio-row-main"><strong>${escapeHtml(item.fullName)}</strong><span>${formatNumber(item.workoutCount)} تدريب · ${formatNumber(item.nutritionCount)} تغذية · ${formatNumber(item.measurementCount)} قياس</span></div><span class="trainer-studio-inline-number">${formatNumber(item.checkinCount)}</span>${open}</article>`;
            };
            const title = kind === 'checkins' ? 'العملاء الذين يحتاجون متابعة' : kind === 'measurements' ? 'تحديث القياسات' : 'ملخص تقدم العملاء';
            renderListPage(route, title, clients, renderer, 'لا توجد ملفات عملاء بعد.');
        } catch (error) { dynamic.innerHTML = pageFrame(route, errorState(error.message)); }
    }

    async function renderFollowUpPage() {
        const dynamic = $('#trainerStudioDynamicView');
        dynamic.innerHTML = pageFrame('checkins', '<section class="trainer-studio-data-panel"><div class="trainer-studio-loading"><span class="trainer-studio-spinner"></span>جاري حساب الأولويات...</div></section>');
        dynamic.hidden = false;
        try {
            const payload = await api('/api/trainer/follow-up?limit=100');
            const clients = Array.isArray(payload.clients) ? payload.clients : [];
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
            renderListPage('portal', 'دخول بوابة العملاء', clients, (item) => `<article class="trainer-studio-data-row"><div class="trainer-studio-row-icon">${icon('users')}</div><div class="trainer-studio-row-main"><strong>${escapeHtml(item.fullName)}</strong><span>${item.email ? escapeHtml(item.email) : escapeHtml(item.phone || 'لا توجد وسيلة تواصل')}</span></div><span class="trainer-studio-portal-note">يُصدر من ملف العميل</span></article>`, 'أضف عميلًا أولًا لإصدار دخول البوابة.');
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
            dynamic.innerHTML = pageFrame('settings', `<section class="trainer-studio-settings-grid"><article class="trainer-studio-settings-card"><span class="trainer-panel-kicker">الهوية</span><h2>${escapeHtml(tenant.name || 'مساحة المدرب')}</h2><p>تفضيلات المظهر متاحة من زر الوضع في الشريط العلوي. بيانات الهوية لا يتم تعديلها من هذه الشاشة دون مسار إعدادات مدعوم.</p></article><article class="trainer-studio-settings-card"><span class="trainer-panel-kicker">الاشتراك</span><h2>${escapeHtml(subscription.plan?.name || 'الخطة الحالية')}</h2><p>الحالة: <strong>${escapeHtml(subscription.status || 'غير محددة')}</strong></p></article></section>`);
            dynamic.hidden = false;
        } catch (error) { dynamic.innerHTML = pageFrame('settings', errorState(error.message)); }
    }

    const goalStatusLabels = Object.freeze({ active: '\u0646\u0634\u0637', completed: '\u0645\u0643\u062a\u0645\u0644', paused: '\u0645\u062a\u0648\u0642\u0641', archived: '\u0645\u0624\u0631\u0634\u0641' });
    const goalTypeLabels = Object.freeze({ weight_loss: '\u062e\u0633\u0627\u0631\u0629 \u0648\u0632\u0646', muscle_gain: '\u0632\u064a\u0627\u062f\u0629 \u0639\u0636\u0644\u0627\u062a', strength: '\u0642\u0648\u0629', fitness: '\u0644\u064a\u0627\u0642\u0629', performance: '\u0623\u062f\u0627\u0621', custom: '\u0645\u062e\u0635\u0635' });
    const templateTypeLabels = Object.freeze({ training: '\u062a\u062f\u0631\u064a\u0628', nutrition: '\u062a\u063a\u0630\u064a\u0629', assessment: '\u062a\u0642\u064a\u064a\u0645', checkin: '\u0645\u062a\u0627\u0628\u0639\u0629', package: '\u0628\u0627\u0642\u0629' });

    function newIdempotencyKey(prefix) {
        return `${prefix}-${globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`}`;
    }

    function renderGoalRows(goals) {
        if (!goals.length) return emptyState('\u0644\u0627 \u062a\u0648\u062c\u062f \u0623\u0647\u062f\u0627\u0641 \u0645\u0633\u062c\u0644\u0629.', '\u0623\u0636\u0641 \u0647\u062f\u0641\u064b\u0627 \u0648\u0627\u0631\u0628\u0637\u0647 \u0628\u0639\u0645\u064a\u0644 \u0644\u0645\u062a\u0627\u0628\u0639\u0629 \u0627\u0644\u062a\u0642\u062f\u0645.');
        return goals.map((goal) => {
            const status = String(goal.status || 'active').toLowerCase();
            const value = [goal.currentValue, goal.targetValue].every((item) => item !== null && item !== undefined) ? `${goal.currentValue} / ${goal.targetValue}${goal.unit ? ` ${escapeHtml(goal.unit)}` : ''}` : '\u0644\u0645 \u064a\u062a\u0645 \u062a\\u062d\u062f\u064a\u062f \u0627\u0644\u0642\u064a\u0645\u0629';
            const actions = status === 'archived' ? '' : `<button type="button" class="btn btn-light btn-small trainer-studio-row-action" data-studio-goal-id="${escapeHtml(goal.id)}" data-studio-goal-status="${status === 'active' ? 'completed' : 'active'}">${status === 'active' ? '\u062a\u0639\u0644\u064a\u0645 \u0643\u0645\u0643\u062a\u0645\u0644' : '\u0625\u0639\u0627\u062f\u0629 \u062a\u0646\u0634\u064a\u0637'}</button><button type="button" class="btn btn-light btn-small trainer-studio-row-action trainer-studio-row-action--danger" data-studio-goal-archive="${escapeHtml(goal.id)}">\u0623\u0631\u0634\u0641</button>`;
            return `<article class="trainer-studio-data-row"><div class="trainer-studio-row-icon">${icon('chart')}</div><div class="trainer-studio-row-main"><strong>${escapeHtml(goal.title)}</strong><span>${escapeHtml(goal.clientName || '\u0639\u0645\u064a\u0644')} · ${goalTypeLabels[goal.goalType] || escapeHtml(goal.goalType || '\u0647\u062f\u0641')} · ${value}${goal.deadline ? ` · \u0627\u0644\u0645\u0648\u0639\u062f ${formatDate(goal.deadline)}` : ''}</span></div><span class="trainer-status-pill trainer-status-pill--${escapeHtml(status)}">${goalStatusLabels[status] || escapeHtml(status)}</span><div class="trainer-studio-row-actions">${actions}</div></article>`;
        }).join('');
    }

    async function renderGoalsPage() {
        const dynamic = $('#trainerStudioDynamicView');
        dynamic.innerHTML = pageFrame('goals', '<section class="trainer-studio-data-panel"><div class="trainer-studio-loading"><span class="trainer-studio-spinner"></span>\u062c\u0627\u0631\u064a \u062a\u062d\u0645\u064a\u0644 \u0627\u0644\u0623\u0647\u062f\u0627\u0641...</div></section>');
        dynamic.hidden = false;
        try {
            const payload = await api('/api/trainer/goals');
            const goals = Array.isArray(payload.goals) ? payload.goals : [];
            renderListPage('goals', '\u0623\u0647\u062f\u0627\u0641 \u0627\u0644\u0639\u0645\u0644\u0627\u0621', goals, renderGoalRows, '\u0644\u0627 \u062a\u0648\u062c\u062f \u0623\u0647\u062f\u0627\u0641 \u0645\u0633\u062c\u0644\u0629.', `<button type="button" class="btn btn-primary btn-small" data-studio-open-goal-editor><span>${icon('plus')}</span>\u0625\u0636\u0627\u0641\u0629 \u0647\u062f\u0641</button>`);
        } catch (error) { dynamic.innerHTML = pageFrame('goals', errorState(error.message)); }
    }

    async function openGoalEditor() {
        const dynamic = $('#trainerStudioDynamicView');
        dynamic.innerHTML = pageFrame('goals', '<section class="trainer-studio-data-panel"><div class="trainer-studio-loading"><span class="trainer-studio-spinner"></span>\u062c\u0627\u0631\u064a \u062a\u062c\u0647\u064a\u0632 \u0646\u0645\u0648\u0630\u062c \u0627\u0644\u0647\u062f\u0641...</div></section>');
        dynamic.hidden = false;
        try {
            const clients = await getTrainerClients();
            const options = selectOptions(clients, 'id', 'fullName', '\u0627\u062e\u062a\u0631 \u0627\u0644\u0639\u0645\u064a\u0644');
            dynamic.innerHTML = pageFrame('goals', `<section class="trainer-studio-editor-panel"><div class="trainer-studio-data-panel-head"><div><span class="trainer-panel-kicker">\u0645\u062a\u0627\u0628\u0639\u0629 \u0642\u0627\u0628\u0644\u0629 \u0644\u0644\u0642\u064a\u0627\u0633</span><h2>\u0625\u0636\u0627\u0641\u0629 \u0647\u062f\u0641</h2></div><button type="button" class="btn btn-light btn-small" data-studio-cancel-goal-editor>\u0625\u0644\u063a\u0627\u0621</button></div><form class="trainer-studio-editor-form" data-studio-goal-form><div class="trainer-studio-editor-grid"><label>\u0627\u0644\u0639\u0645\u064a\u0644<select name="memberId" required>${options}</select></label><label>\u0646\u0648\u0639 \u0627\u0644\u0647\u062f\u0641<select name="goalType" required>${Object.entries(goalTypeLabels).map(([value, label]) => `<option value="${value}">${label}</option>`).join('')}</select></label><label>\u0639\u0646\u0648\u0627\u0646 \u0627\u0644\u0647\u062f\u0641<input name="title" maxlength="160" required placeholder="\u0645\u062b\u0627\u0644: \u0648\u0632\u0646 \u0645\u0633\u062a\u0647\u062f\u0641"></label><label>\u0648\u062d\u062f\u0629 \u0627\u0644\u0642\u064a\u0627\u0633<input name="unit" maxlength="24" placeholder="\u0643\u062c\u0645"></label><label>\u0627\u0644\u0642\u064a\u0645\u0629 \u0627\u0644\u0628\u062f\u0627\u064a\u0629<input name="startValue" type="number" step="0.001"></label><label>\u0627\u0644\u0642\u064a\u0645\u0629 \u0627\u0644\u0645\u0633\u062a\u0647\u062f\u0641\u0629<input name="targetValue" type="number" step="0.001"></label><label>\u0627\u0644\u0642\u064a\u0645\u0629 \u0627\u0644\u062d\u0627\u0644\u064a\u0629<input name="currentValue" type="number" step="0.001"></label><label>\u062a\u0627\u0631\u064a\u062e \u0627\u0644\u0628\u062f\u0627\u064a\u0629<input name="startsOn" type="date" value="${new Date().toISOString().slice(0, 10)}" required></label><label>\u0627\u0644\u0645\u0648\u0639\u062f \u0627\u0644\u0646\u0647\u0627\u0626\u064a<input name="deadline" type="date"></label><label class="trainer-studio-field-wide">\u0645\u0644\u0627\u062d\u0638\u0627\u062a<textarea name="notes" maxlength="1000" rows="3"></textarea></label></div><p class="trainer-studio-form-message" data-studio-form-message role="alert"></p><div class="trainer-studio-editor-actions"><button type="submit" class="btn btn-primary">\u062d\u0641\u0638 \u0627\u0644\u0647\u062f\u0641</button></div></form></section>`);
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
            renderListPage('notifications', '\u0645\u0631\u0643\u0632 \u0627\u0644\u0625\u062c\u0631\u0627\u0621', notifications, () => content, '\u0644\u0627 \u062a\u0648\u062c\u062f \u062a\u0646\u0628\u064a\u0647\u0627\u062a \u062d\u0627\u0644\u064a\u064b\u0627.', `<span class="trainer-studio-count-chip">${formatNumber(payload.counts?.warning || 0)} \u0645\u0647\u0645</span>`);
        } catch (error) { dynamic.innerHTML = pageFrame('notifications', errorState(error.message)); }
    }

    function taskStatusLabel(status) {
        return ({ open: 'مفتوحة', in_progress: 'قيد التنفيذ', completed: 'مكتملة', dismissed: 'مستبعدة' }[status] || status || '—');
    }

    function taskTypeLabel(type) {
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
            const rows = tasks.length ? tasks.map((task) => `<article class="trainer-studio-data-row trainer-studio-task-row"><div class="trainer-studio-row-icon ${task.status === 'completed' ? 'trainer-studio-row-icon--success' : ''}">${icon(task.status === 'completed' ? 'chart' : 'activity')}</div><div class="trainer-studio-row-main"><strong>${escapeHtml(task.title)}</strong><span>${escapeHtml(taskTypeLabel(task.taskType))}${task.clientName ? ` · ${escapeHtml(task.clientName)}` : ''}${task.dueOn ? ` · الموعد ${formatDate(task.dueOn)}` : ''}</span>${task.notes ? `<small>${escapeHtml(task.notes)}</small>` : ''}</div><span class="trainer-status-pill trainer-status-pill--${escapeHtml(task.status)}">${escapeHtml(taskStatusLabel(task.status))}</span><div class="trainer-studio-row-actions">${task.status !== 'completed' && task.status !== 'dismissed' ? `<button type="button" class="btn btn-primary btn-small" data-studio-task-complete="${escapeHtml(task.id)}">إكمال</button><button type="button" class="btn btn-light btn-small" data-studio-task-dismiss="${escapeHtml(task.id)}">استبعاد</button>` : ''}</div></article>`).join('') : emptyState('لا توجد مهام مفتوحة.', 'أنشئ تذكيرًا واضحًا للمتابعة أو التحصيل أو تجهيز برنامج عميل.');
            dynamic.innerHTML = pageFrame('tasks', `<section class="trainer-studio-data-panel"><div class="trainer-studio-data-panel-head"><div><span class="trainer-panel-kicker">مركز العمل اليومي</span><h2>مهامك ومتابعاتك</h2></div><div class="trainer-studio-panel-actions"><button type="button" class="btn btn-primary btn-small" data-studio-open-task-editor><span>${icon('plus')}</span>مهمة جديدة</button><span class="trainer-studio-count-chip">${formatNumber(tasks.length)} مهمة</span></div></div><div class="trainer-studio-data-list">${rows}</div></section><section class="trainer-studio-editor-panel" data-studio-task-editor hidden><div class="trainer-studio-data-panel-head"><div><span class="trainer-panel-kicker">إضافة متابعة</span><h2>مهمة جديدة</h2></div><button type="button" class="btn btn-light btn-small" data-studio-cancel-task-editor>إلغاء</button></div><form class="trainer-studio-editor-form" data-studio-task-form><div class="trainer-studio-editor-grid"><label>العنوان<input name="title" maxlength="160" required placeholder="مثال: مراجعة خطة أحمد"></label><label>النوع<select name="taskType"><option value="follow_up">متابعة</option><option value="measurement">قياسات</option><option value="program">برنامج</option><option value="payment">تحصيل</option><option value="renewal">تجديد</option><option value="session">جلسة</option><option value="custom">مخصصة</option></select></label><label>العميل<select name="memberId"><option value="">بدون عميل محدد</option>${selectOptions(clients, 'id', 'fullName', 'اختر العميل')}</select></label><label>الموعد<input type="date" name="dueOn"></label><label class="trainer-studio-editor-field-wide">ملاحظات<textarea name="notes" maxlength="1000" rows="3" placeholder="ما الخطوة التالية؟"></textarea></label></div><p class="trainer-studio-form-message" data-studio-form-message role="alert"></p><div class="trainer-studio-editor-actions"><button type="submit" class="btn btn-primary">حفظ المهمة</button></div></form></section>`);
        } catch (error) { dynamic.innerHTML = pageFrame('tasks', errorState(error.message)); }
    }

    function renderTemplateRows(templates) {
        if (!templates.length) return emptyState('\u0644\u0627 \u062a\u0648\u062c\u062f \u0642\u0648\u0627\u0644\u0628 \u0645\u062d\u0641\u0648\u0638\u0629.', '\u0627\u0628\u062f\u0623 \u0628\u062d\u0641\u0638 \u0642\u0627\u0644\u0628 \u0644\u0644\u062a\u062f\u0631\u064a\u0628 \u0623\u0648 \u0627\u0644\u062a\u063a\u0630\u064a\u0629.');
        return templates.map((template) => `<article class="trainer-studio-data-row"><div class="trainer-studio-row-icon">${icon('book')}</div><div class="trainer-studio-row-main"><strong>${escapeHtml(template.name)}</strong><span>${escapeHtml(templateTypeLabels[template.templateType] || template.templateType)}${template.description ? ` · ${escapeHtml(template.description)}` : ''}</span></div><span class="trainer-status-pill trainer-status-pill--${escapeHtml(template.status || 'active')}">${template.status === 'archived' ? '\u0645\u0624\u0631\u0634\u0641' : '\u0646\u0634\u0637'}</span><div class="trainer-studio-row-actions">${['training', 'nutrition'].includes(template.templateType) && template.status !== 'archived' ? `<button type="button" class="btn btn-primary btn-small" data-studio-template-apply="${escapeHtml(template.id)}" data-studio-template-type="${escapeHtml(template.templateType)}">\u062a\u0637\u0628\u064a\u0642</button>` : ''}<button type="button" class="btn btn-light btn-small" data-studio-template-status-id="${escapeHtml(template.id)}" data-studio-template-status="${template.status === 'archived' ? 'active' : 'archived'}">${template.status === 'archived' ? '\u0625\u0639\u0627\u062f\u0629 \u062a\u0641\u0639\u064a\u0644' : '\u0623\u0631\u0634\u0641'}</button></div></article>`).join('');
    }

    async function renderTemplatesPage() {
        const dynamic = $('#trainerStudioDynamicView');
        dynamic.innerHTML = pageFrame('templates', '<section class="trainer-studio-data-panel"><div class="trainer-studio-loading"><span class="trainer-studio-spinner"></span>\u062c\u0627\u0631\u064a \u062a\u062d\u0645\u064a\u0644 \u0627\u0644\u0642\u0648\u0627\u0644\u0628...</div></section>');
        dynamic.hidden = false;
        try {
            const payload = await api('/api/trainer/templates?includeArchived=true');
            const templates = Array.isArray(payload.templates) ? payload.templates : [];
            renderListPage('templates', '\u0645\u0643\u062a\u0628\u0629 \u0627\u0644\u0642\u0648\u0627\u0644\u0628', templates, renderTemplateRows, '\u0644\u0627 \u062a\u0648\u062c\u062f \u0642\u0648\u0627\u0644\u0628 \u0645\u062d\u0641\u0648\u0638\u0629.', `<button type="button" class="btn btn-primary btn-small" data-studio-open-template-editor><span>${icon('plus')}</span>\u0625\u0646\u0634\u0627\u0621 \u0642\u0627\u0644\u0628</button>`);
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
        button.textContent = 'إنشاء تلقائي';
        button.addEventListener('click', () => openTrainerAutoGenerator(route, isNutrition));
        actions.prepend(button);
    }

    let routeRenderToken = 0;
    function renderRoute(route) {
        const token = ++routeRenderToken;
        buildShell();
        setRouteChrome(route);
        hideAllSurfaces();
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
})();
