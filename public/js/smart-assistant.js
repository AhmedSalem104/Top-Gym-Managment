(() => {
    if (window.__topGymSmartAssistantLoaded) return;
    window.__topGymSmartAssistantLoaded = true;

    const $ = (id) => document.getElementById(id);
    const state = {
        mode: 'screen',
        screen: 'dashboard',
        selectedLabel: '',
        messages: [],
        busy: false
    };

    const SCREEN_META = Object.freeze({
        dashboard: {
            title: 'لوحة التحكم',
            description: 'نظرة سريعة على المشتركين والحضور والحركة المالية.',
            help: 'من لوحة التحكم يمكنك متابعة أهم مؤشرات الجيم، مراجعة التنبيهات، وطباعة الاشتراكات والباقات.',
            actions: ['add-member', 'print-pricing', 'open-reports']
        },
        members: {
            title: 'المشتركون',
            description: 'إدارة بيانات المشتركين والاشتراكات والمدفوعات.',
            help: 'ابحث باسم المشترك أو هاتفه، ثم افتح التفاصيل لتجديد الاشتراك أو تسجيل دفعة أو تجميد العضوية.',
            actions: ['add-member', 'search-members', 'open-pricing']
        },
        trainees: {
            title: 'متدرب خارجي',
            description: 'متابعة العملاء بدون عضوية فعالة وبرامجهم.',
            help: 'يمكنك إضافة متدرب خارجي ثم إنشاء خطة تدريب أو خطة تغذية ومتابعة القياسات والجلسات.',
            actions: ['add-trainee', 'create-workout', 'create-diet']
        },
        management: {
            title: 'الأسعار والعضويات',
            description: 'إدارة الباقات وأنواع العضويات وحسابات المساعدين.',
            help: 'تتضمن هذه الشاشة إدارة الباقات وأنواع العضويات، كما يستطيع Owner إدارة حسابات Assistant.',
            actions: ['add-plan', 'add-membership-type', 'add-assistant']
        },
        attendance: {
            title: 'الحضور والانصراف',
            description: 'تسجيل حضور المشتركين وانصرافهم ومراجعة سجل اليوم.',
            help: 'استخدم الهاتف أو QR Code لتسجيل الحضور، وسيقترح النظام الإجراء الصحيح حسب حالة المشترك.',
            actions: ['attendance-phone', 'attendance-scan', 'attendance-refresh']
        },
        expenses: {
            title: 'المصروفات',
            description: 'تسجيل ومراجعة مصروفات الجيم والحركة المالية.',
            help: 'أضف المصروف مع المبلغ والتاريخ والملاحظات، ثم استخدم الفلاتر لمراجعة إجمالي الفترة.',
            actions: ['add-expense', 'open-reports']
        },
        library: {
            title: 'المكتبة',
            description: 'تمارين وأطعمة وعضلات جاهزة للاستخدام في الخطط.',
            help: 'ابحث داخل المكتبة أو استخدم الفلاتر للوصول إلى التمرين أو الطعام أو العضلة المناسبة.',
            actions: ['search-library', 'add-library-item', 'refresh-library']
        },
        reports: {
            title: 'التقارير',
            description: 'تحليل الحضور والاشتراكات والحركة المالية.',
            help: 'حدد الفترة ونوع التقرير، ثم اعرض النتائج أو اطبعها. يمكن استخدام تقرير المتأخرات للتواصل مع العملاء.',
            actions: ['reports-focus-date', 'reports-refresh', 'open-members']
        }
    });

    const ACTIONS = Object.freeze({
        'add-member': { label: 'إضافة مشترك', icon: 'plus', type: 'navigate-click', tab: 'members', selector: '#addMemberButton', success: 'فتحت نافذة إضافة مشترك.' },
        'print-pricing': { label: 'طباعة الاشتراكات', icon: 'print', type: 'click', selector: '#dashboardPrintPricingButton', success: 'بدأت تجهيز ملف الاشتراكات والباقات.' },
        'open-reports': { label: 'فتح التقارير', icon: 'chart', type: 'navigate', tab: 'reports', success: 'فتحت شاشة التقارير.' },
        'search-members': { label: 'البحث عن مشترك', icon: 'search', type: 'focus', selector: '#searchInput', success: 'يمكنك كتابة اسم المشترك أو رقم الهاتف الآن.' },
        'open-pricing': { label: 'أسعار الباقات', icon: 'card', type: 'navigate-click', tab: 'members', selector: '#pricingButton', success: 'فتحت أسعار الباقات.' },
        'add-trainee': { label: 'إضافة متدرب', icon: 'plus', type: 'navigate-click', tab: 'trainees', selector: '#addExternalTraineeButton', success: 'فتحت نموذج إضافة متدرب خارجي.' },
        'create-workout': { label: 'إنشاء خطة تدريب', icon: 'dumbbell', type: 'navigate-click', tab: 'trainees', selector: '[data-coaching-action="workout"]', success: 'اختر المتدرب لإنشاء خطة التدريب.' },
        'create-diet': { label: 'إنشاء خطة تغذية', icon: 'heart', type: 'navigate-click', tab: 'trainees', selector: '[data-coaching-action="diet"]', success: 'اختر المتدرب لإنشاء خطة التغذية.' },
        'add-plan': { label: 'إضافة باقة', icon: 'plus', type: 'click', selector: '#addMembershipPlanButton', success: 'فتحت نموذج إضافة باقة.' },
        'add-membership-type': { label: 'إضافة نوع عضوية', icon: 'plus', type: 'click', selector: '#addMembershipTypeButton', success: 'فتحت نموذج إضافة نوع عضوية.' },
        'add-assistant': { label: 'إضافة Assistant', icon: 'user-plus', type: 'click', selector: '#authAddAssistantButton', success: 'فتحت نموذج إضافة Assistant.' },
        'attendance-phone': { label: 'تسجيل بالهاتف', icon: 'phone', type: 'click', selector: '#attendancePhoneModeButton', success: 'فعّلت التسجيل برقم الهاتف.' },
        'attendance-scan': { label: 'مسح QR Code', icon: 'qr', type: 'click', selector: '#attendanceScanButton', success: 'فتحت قارئ QR Code.' },
        'attendance-refresh': { label: 'تحديث سجل الحضور', icon: 'refresh', type: 'click', selector: '#attendanceRefreshButton', success: 'حدّثت سجل الحضور.' },
        'add-expense': { label: 'إضافة مصروف', icon: 'plus', type: 'click', selector: '#addExpenseButton', success: 'فتحت نموذج إضافة مصروف.' },
        'search-library': { label: 'البحث في المكتبة', icon: 'search', type: 'focus', selector: '#librarySearch', success: 'يمكنك البحث عن تمرين أو طعام أو عضلة الآن.' },
        'add-library-item': { label: 'إضافة عنصر', icon: 'plus', type: 'click', selector: '#libraryAddButton', success: 'فتحت نموذج إضافة عنصر للمكتبة.' },
        'refresh-library': { label: 'تحديث المكتبة', icon: 'refresh', type: 'click', selector: '#libraryRefreshButton', success: 'حدّثت بيانات المكتبة.' },
        'reports-focus-date': { label: 'اختيار فترة التقرير', icon: 'calendar', type: 'focus', selector: '#reportFrom, #reportsFrom, [data-report-from]', success: 'اختر تاريخ بداية التقرير.' },
        'reports-refresh': { label: 'عرض التقرير', icon: 'chart', type: 'click', selector: '#reportsRunButton, #loadReportButton, [data-reports-run]', success: 'حدّثت نتائج التقرير.' },
        'open-members': { label: 'فتح المشتركين', icon: 'users', type: 'navigate', tab: 'members', success: 'فتحت شاشة المشتركين.' }
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
        users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM22 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8"/>'
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

    function currentScreen() {
        const requested = document.documentElement.dataset.topGymActiveTab || window.location.hash.slice(1);
        return SCREEN_META[requested] ? requested : 'dashboard';
    }

    function isAllowedTab(tab) {
        return !tab || window.topGymAuth?.canAccessTab?.(tab) !== false;
    }

    function actionAvailable(action) {
        if (!isAllowedTab(action.tab)) return false;
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
            text.textContent = message.text;
            article.append(text);
            if (message.actions?.length) {
                const actions = document.createElement('div');
                actions.className = 'smart-assistant-message-actions';
                message.actions.forEach((action) => {
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
            actions: state.mode === 'general' ? [actionFromId('open-members'), actionFromId('open-reports')] : []
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
        if (!isAllowedTab(tab)) {
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
            state.messages.push({ role: 'assistant', text: 'هذا الإجراء غير متاح حاليًا أو يحتاج إلى فتح الشاشة أولًا.' });
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
        const navigation = [
            { pattern: /(مشترك|عضو).*(اضاف|اضيف|ضيف)|(اضاف|اضيف|ضيف).*(مشترك|عضو)/, action: 'add-member', text: 'لإضافة مشترك افتح شاشة «المشتركون» ثم استخدم زر «إضافة مشترك». يمكنني فتح النموذج لك الآن.' },
            { pattern: /(حضور|انصراف|qr|باركود)/, action: 'attendance-phone', text: 'من شاشة «الحضور والانصراف» يمكنك التسجيل بالهاتف أو استخدام QR Code، وسيتم اقتراح حضور أو انصراف حسب حالة المشترك.' },
            { pattern: /(تقرير|تقارير|report)/, action: 'open-reports', text: 'يمكنك فتح «التقارير» واختيار الفترة ونوع التقرير، ثم عرض النتائج أو طباعتها.' },
            { pattern: /(باقة|عضوي|اسعار|أسعار)/, action: 'open-pricing', text: 'إدارة الباقات وأنواع العضويات موجودة في شاشة «الأسعار والعضويات».' },
            { pattern: /(متدرب|تغذي|تدريب|تمرين|خطة)/, action: 'add-trainee', text: 'يمكنك إضافة متدرب خارجي ثم إنشاء خطة تدريب أو خطة تغذية من شاشة «متدرب خارجي».' },
            { pattern: /(مصروف|مالية|ماليات)/, action: 'add-expense', text: 'لإضافة مصروف افتح شاشة «المصروفات» ثم أدخل اسم المصروف والمبلغ والتاريخ.' },
            { pattern: /(مكتبة|تمرين|طعام|عضلة)/, action: 'search-library', text: 'المكتبة تحتوي على التمارين والأطعمة والعضلات. استخدم البحث والفلاتر للوصول إلى العنصر المطلوب.' },
            { pattern: /(مساعد|كيف تستخدم|ماذا تستطيع|مساعدة)/, action: null, text: 'أستطيع شرح الشاشة الحالية، اقتراح الإجراءات السريعة، وفتح الشاشة المناسبة لك. اكتب سؤالك بصيغة طبيعية.' }
        ];
        const match = navigation.find((item) => item.pattern.test(normalized));
        if (match) return { text: match.text, actions: match.action ? [actionFromId(match.action)] : [] };
        const meta = SCREEN_META[state.screen] || SCREEN_META.dashboard;
        if (/(كيف|ازاي|إزاى|شرح|ماذا|ما هي|اقدر|أقدر)/.test(normalized)) {
            return { text: meta.help, actions: availableActions().slice(0, 3) };
        }
        return {
            text: 'لم أجد إجابة محددة لهذا السؤال بعد. جرّب السؤال عن إضافة مشترك، الحضور، التقارير، الباقات، المكتبة، أو اكتب «كيف أستخدم هذه الشاشة؟».',
            actions: state.mode === 'general' ? [actionFromId('open-members'), actionFromId('open-reports')] : availableActions().slice(0, 3)
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
        const nextScreen = SCREEN_META[screen] ? screen : 'dashboard';
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
    window.addEventListener('topgym:member-details-opened', (event) => {
        state.selectedLabel = event.detail?.member?.fullName || event.detail?.member?.name || '';
        renderContext();
    });
    new MutationObserver(syncAuthVisibility).observe(document.body, { attributes: true, attributeFilter: ['class', 'data-top-gym-authenticated'] });
    window.topGymAuthReady?.then(syncAuthVisibility).catch(syncAuthVisibility);
    syncAuthVisibility();

    window.topGymAssistant = Object.freeze({ open, close, ask: (question) => { const answer = answerQuestion(question); state.messages.push({ role: 'user', text: question }, { role: 'assistant', text: answer.text, actions: answer.actions }); renderMessages(); open(); } });
})();
