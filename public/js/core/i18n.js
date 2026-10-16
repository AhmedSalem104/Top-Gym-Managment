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
        'login.setupRequired': 'لم يتم إعداد حساب المالك بعد. أضف AUTH_OWNER_EMAIL وAUTH_OWNER_PASSWORD في إعدادات الخادم ثم أعد المحاولة.',
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
        'login.recovery.description': 'لا تتوفر إعادة تعيين ذاتية لكلمة المرور حاليًا. تواصل مع مسؤول حسابك أو فريق Logic Fit لمساعدتك بأمان.',
        'login.recovery.confirm': 'حسنًا',
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
        'login.setupRequired': 'The owner account has not been configured. Add AUTH_OWNER_EMAIL and AUTH_OWNER_PASSWORD to the server settings, then try again.',
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
        'login.recovery.description': 'Self-service password reset is not currently available. Contact your account administrator or the Logic Fit team for secure assistance.',
        'login.recovery.confirm': 'Got it',
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

    const trainerWorkspaceScreenEnglish = Object.freeze({
        'trainerWorkspaceScreen.page.title': 'Trainer workspace | Logic Fit',
        'trainerWorkspaceScreen.brand': 'Independent trainer workspace',
        'trainerWorkspaceScreen.hero.title': 'Every client. Every session. Your path.',
        'trainerWorkspaceScreen.hero.description': 'A workspace designed for independent trainers to manage clients, sessions, plans, and collections in one place.',
        'trainerWorkspaceScreen.state.verifying': 'Verifying your workspace…',
        'trainerWorkspaceScreen.context': 'Your private training workspace',
        'trainerWorkspaceScreen.theme.dark': 'Dark mode', 'trainerWorkspaceScreen.logout': 'Sign out',
        'trainerWorkspaceScreen.nav.label': 'Trainer workspace navigation',
        'trainerWorkspaceScreen.nav.today': 'Today', 'trainerWorkspaceScreen.nav.clients': 'Clients',
        'trainerWorkspaceScreen.nav.packages': 'Packages', 'trainerWorkspaceScreen.nav.purchases': 'Collections',
        'trainerWorkspaceScreen.nav.reports': 'Reports', 'trainerWorkspaceScreen.welcome.label': 'Trainer overview',
        'trainerWorkspaceScreen.welcome.kicker': 'Independent workspace', 'trainerWorkspaceScreen.welcome.title': 'Start strong,',
        'trainerWorkspaceScreen.welcome.name': 'trainer', 'trainerWorkspaceScreen.welcome.description': 'Start with your upcoming sessions, then follow up with clients who need your attention.',
        'trainerWorkspaceScreen.state.refreshed': 'Data updated from the trainer workspace',
        'trainerWorkspaceScreen.metrics.label': 'Trainer metrics', 'trainerWorkspaceScreen.metrics.clients': 'Client base',
        'trainerWorkspaceScreen.metrics.activeClients': 'Active clients', 'trainerWorkspaceScreen.metrics.todayRhythm': 'Today’s rhythm',
        'trainerWorkspaceScreen.metrics.todaySessions': 'Today’s sessions', 'trainerWorkspaceScreen.metrics.upcoming': 'Upcoming appointments',
        'trainerWorkspaceScreen.metrics.scheduled': 'Scheduled sessions', 'trainerWorkspaceScreen.metrics.businessAlert': 'Business alert',
        'trainerWorkspaceScreen.metrics.expiringPackages': 'Packages expiring soon', 'trainerWorkspaceScreen.metrics.collections': 'Collections',
        'trainerWorkspaceScreen.metrics.outstanding': 'Outstanding balances', 'trainerWorkspaceScreen.quick.kicker': 'Work shortcuts',
        'trainerWorkspaceScreen.quick.title': 'Your next step', 'trainerWorkspaceScreen.action.addClient': 'Add client',
        'trainerWorkspaceScreen.action.addClientDescription': 'Create a new training profile', 'trainerWorkspaceScreen.action.scheduleSession': 'Schedule session',
        'trainerWorkspaceScreen.action.scheduleDescription': 'Plan your next appointment', 'trainerWorkspaceScreen.action.createPackage': 'Create package',
        'trainerWorkspaceScreen.action.packageDescription': 'Offer a clear service to your clients',
        'trainerWorkspaceScreen.today.kicker': 'Your daily schedule', 'trainerWorkspaceScreen.today.title': 'Today and upcoming sessions',
        'trainerWorkspaceScreen.today.description': 'Track the appointment and status, then take the right action in one place.',
        'trainerWorkspaceScreen.activity.kicker': 'Follow-up signals', 'trainerWorkspaceScreen.activity.title': 'Clients who need you',
        'trainerWorkspaceScreen.activity.description': 'Real figures from your private training profiles.',
        'trainerWorkspaceScreen.activity.followUp': 'Client needs follow-up', 'trainerWorkspaceScreen.activity.measurements': 'Measurements in the last 30 days',
        'trainerWorkspaceScreen.activity.checkins': 'Check-ins in the last 14 days', 'trainerWorkspaceScreen.activity.note': 'Priorities are calculated only from clients, sessions, packages, and collections in your trainer workspace.',
        'trainerWorkspaceScreen.clients.kicker': 'Training profiles', 'trainerWorkspaceScreen.clients.title': 'Your clients',
        'trainerWorkspaceScreen.clients.description': 'Client profile, goal, plans, measurements, and progress — separate from any organization’s data.',
        'trainerWorkspaceScreen.clients.searchLabel': 'Search clients', 'trainerWorkspaceScreen.clients.searchPlaceholder': 'Search by client name or phone',
        'trainerWorkspaceScreen.action.refresh': 'Refresh', 'trainerWorkspaceScreen.services.label': 'Trainer services',
        'trainerWorkspaceScreen.services.kicker': 'Services', 'trainerWorkspaceScreen.packages.title': 'Training packages',
        'trainerWorkspaceScreen.packages.description': 'Clear plans to sell to clients in person or online.',
        'trainerWorkspaceScreen.action.addPackage': 'Add package', 'trainerWorkspaceScreen.purchases.title': 'Client purchases',
        'trainerWorkspaceScreen.purchases.description': 'Track paid and remaining amounts for each package without a parallel ledger.',
        'trainerWorkspaceScreen.action.sellPackage': 'Sell package', 'trainerWorkspaceScreen.reports.kicker': 'Activity insights',
        'trainerWorkspaceScreen.reports.title': 'Training performance summary', 'trainerWorkspaceScreen.reports.period': 'Last 30 days',
        'trainerWorkspaceScreen.action.refreshReport': 'Refresh report', 'trainerWorkspaceScreen.reports.netRevenue': 'Net revenue',
        'trainerWorkspaceScreen.reports.newClients': 'New clients', 'trainerWorkspaceScreen.reports.completedSessions': 'Completed sessions',
        'trainerWorkspaceScreen.reports.totalSessions': 'Total sessions', 'trainerWorkspaceScreen.reports.outstanding': 'Outstanding balance',
        'trainerWorkspaceScreen.reports.progress': 'Measurements and check-ins', 'trainerWorkspaceScreen.dialog.clientFile': 'Client profile',
        'trainerWorkspaceScreen.dialog.close': 'Close', 'trainerWorkspaceScreen.form.clientName': 'Client name',
        'trainerWorkspaceScreen.form.phone': 'Phone number', 'trainerWorkspaceScreen.form.email': 'Email',
        'trainerWorkspaceScreen.form.goal': 'Primary goal', 'trainerWorkspaceScreen.form.status': 'Status',
        'trainerWorkspaceScreen.status.active': 'Active', 'trainerWorkspaceScreen.status.paused': 'Paused',
        'trainerWorkspaceScreen.status.archived': 'Archived', 'trainerWorkspaceScreen.form.notes': 'Notes',
        'trainerWorkspaceScreen.action.cancel': 'Cancel', 'trainerWorkspaceScreen.action.saveClient': 'Save client',
        'trainerWorkspaceScreen.dialog.profileOverview': 'Profile overview', 'trainerWorkspaceScreen.dialog.clientDetails': 'Client details',
        'trainerWorkspaceScreen.dialog.profileHistory': 'Profile history', 'trainerWorkspaceScreen.dialog.clientTimeline': 'Client timeline',
        'trainerWorkspaceScreen.dialog.progress': 'Assessment and progress', 'trainerWorkspaceScreen.action.addMeasurement': 'Add measurement',
        'trainerWorkspaceScreen.form.date': 'Date', 'trainerWorkspaceScreen.form.weight': 'Weight (kg)',
        'trainerWorkspaceScreen.form.height': 'Height (cm)', 'trainerWorkspaceScreen.form.bodyFat': 'Body fat percentage',
        'trainerWorkspaceScreen.form.chest': 'Chest circumference', 'trainerWorkspaceScreen.form.waist': 'Waist circumference',
        'trainerWorkspaceScreen.form.hips': 'Hip circumference', 'trainerWorkspaceScreen.form.arms': 'Arm circumference',
        'trainerWorkspaceScreen.form.thighs': 'Thigh circumference', 'trainerWorkspaceScreen.action.saveMeasurement': 'Save measurement',
        'trainerWorkspaceScreen.dialog.clientCheckin': 'Client check-in', 'trainerWorkspaceScreen.action.addCheckin': 'Add check-in',
        'trainerWorkspaceScreen.form.checkinWeight': 'Check-in weight (kg)', 'trainerWorkspaceScreen.form.sleep': 'Sleep quality (1–5)',
        'trainerWorkspaceScreen.form.fatigue': 'Energy / fatigue (1–5)', 'trainerWorkspaceScreen.form.mood': 'Mood / adherence (1–5)',
        'trainerWorkspaceScreen.form.checkinNotes': 'Check-in notes', 'trainerWorkspaceScreen.action.saveCheckin': 'Save check-in',
        'trainerWorkspaceScreen.dialog.commercialServices': 'Commercial services', 'trainerWorkspaceScreen.form.packageName': 'Package name',
        'trainerWorkspaceScreen.form.price': 'Price', 'trainerWorkspaceScreen.form.durationDays': 'Package duration in days',
        'trainerWorkspaceScreen.form.sessionCount': 'Number of sessions', 'trainerWorkspaceScreen.form.deliveryMode': 'Delivery method',
        'trainerWorkspaceScreen.option.hybrid': 'In person and online', 'trainerWorkspaceScreen.option.inPerson': 'In person',
        'trainerWorkspaceScreen.option.online': 'Online', 'trainerWorkspaceScreen.form.description': 'Description',
        'trainerWorkspaceScreen.action.savePackage': 'Save package', 'trainerWorkspaceScreen.dialog.scheduling': 'Scheduling',
        'trainerWorkspaceScreen.form.client': 'Client', 'trainerWorkspaceScreen.form.linkedPackage': 'Linked package',
        'trainerWorkspaceScreen.option.noPackage': 'No package', 'trainerWorkspaceScreen.form.startsAt': 'Starts at',
        'trainerWorkspaceScreen.form.endsAt': 'Ends at', 'trainerWorkspaceScreen.action.saveSession': 'Save session',
        'trainerWorkspaceScreen.dialog.sellPackage': 'Sell a package', 'trainerWorkspaceScreen.dialog.newPurchase': 'Record a new purchase',
        'trainerWorkspaceScreen.form.package': 'Package', 'trainerWorkspaceScreen.form.startDate': 'Start date',
        'trainerWorkspaceScreen.form.paidNow': 'Paid now', 'trainerWorkspaceScreen.form.paymentMethod': 'Payment method',
        'trainerWorkspaceScreen.option.cash': 'Cash', 'trainerWorkspaceScreen.option.card': 'Card',
        'trainerWorkspaceScreen.option.transfer': 'Transfer', 'trainerWorkspaceScreen.option.other': 'Other',
        'trainerWorkspaceScreen.form.collectionDate': 'Collection date', 'trainerWorkspaceScreen.action.recordPurchase': 'Record purchase',
        'trainerWorkspaceScreen.dialog.singlePayment': 'One-time payment', 'trainerWorkspaceScreen.dialog.recordPayment': 'Record payment',
        'trainerWorkspaceScreen.form.amount': 'Amount', 'trainerWorkspaceScreen.action.savePayment': 'Save payment',
        'trainerWorkspaceScreen.empty.clients': 'No clients yet.', 'trainerWorkspaceScreen.empty.clientsHint': 'Add your first client to start building their training profile.',
        'trainerWorkspaceScreen.empty.search': 'No matching results found.', 'trainerWorkspaceScreen.empty.goal': 'No goal selected yet',
        'trainerWorkspaceScreen.empty.contact': 'No contact method', 'trainerWorkspaceScreen.stat.training': 'Training',
        'trainerWorkspaceScreen.stat.nutrition': 'Nutrition', 'trainerWorkspaceScreen.stat.measurements': 'Measurements',
        'trainerWorkspaceScreen.action.open': 'Open', 'trainerWorkspaceScreen.action.edit': 'Edit',
        'trainerWorkspaceScreen.pagination.previous': 'Previous page', 'trainerWorkspaceScreen.pagination.next': 'Next page',
        'trainerWorkspaceScreen.state.loadingClients': 'Loading clients…', 'trainerWorkspaceScreen.state.clientCount': '{{count}} clients',
        'trainerWorkspaceScreen.state.clientCountSingular': '{{count}} client',
        'trainerWorkspaceScreen.error.loadClients': 'Could not load clients.', 'trainerWorkspaceScreen.error.loadClientList': 'Could not load the client list.',
        'trainerWorkspaceScreen.state.loadingProfile': 'Loading profile…', 'trainerWorkspaceScreen.details.name': 'Name',
        'trainerWorkspaceScreen.details.phone': 'Phone', 'trainerWorkspaceScreen.details.trainingPlans': 'Training plans',
        'trainerWorkspaceScreen.details.nutritionPlans': 'Nutrition plans', 'trainerWorkspaceScreen.details.measurements': 'Measurements',
        'trainerWorkspaceScreen.details.checkins': 'Check-ins', 'trainerWorkspaceScreen.details.goal': 'Goal:',
        'trainerWorkspaceScreen.details.noGoal': 'No goal selected', 'trainerWorkspaceScreen.details.notes': 'Notes:',
        'trainerWorkspaceScreen.details.noNotes': 'No notes.', 'trainerWorkspaceScreen.action.viewTimeline': 'View timeline',
        'trainerWorkspaceScreen.action.issuePortalAccess': 'Issue portal access', 'trainerWorkspaceScreen.status.session.scheduled': 'Scheduled',
        'trainerWorkspaceScreen.status.session.completed': 'Completed', 'trainerWorkspaceScreen.status.session.cancelled': 'Cancelled',
        'trainerWorkspaceScreen.status.session.noShow': 'No-show', 'trainerWorkspaceScreen.status.purchase.completed': 'Completed',
        'trainerWorkspaceScreen.status.purchase.active': 'Active', 'trainerWorkspaceScreen.status.purchase.cancelled': 'Cancelled',
        'trainerWorkspaceScreen.status.package.active': 'Active', 'trainerWorkspaceScreen.service.hybrid': 'Hybrid',
        'trainerWorkspaceScreen.duration.sessions': '{{count}} sessions', 'trainerWorkspaceScreen.duration.days': '{{count}} days',
        'trainerWorkspaceScreen.money.paidFrom': 'paid of', 'trainerWorkspaceScreen.money.remaining': 'remaining',
        'trainerWorkspaceScreen.empty.packages': 'No packages yet.', 'trainerWorkspaceScreen.empty.packagesHint': 'Add your first package to connect services with collections and sessions.',
        'trainerWorkspaceScreen.empty.sessions': 'No scheduled sessions.', 'trainerWorkspaceScreen.empty.sessionsHint': 'Upcoming appointments will appear here once scheduled.',
        'trainerWorkspaceScreen.empty.purchases': 'No purchases yet.', 'trainerWorkspaceScreen.empty.purchasesHint': 'Record your first package sale to track payments.',
        'trainerWorkspaceScreen.empty.timeline': 'No events yet.', 'trainerWorkspaceScreen.empty.timelineHint': 'Measurements, plans, sessions, and payments will appear here.',
        'trainerWorkspaceScreen.error.retrySection': 'Try refreshing this section.', 'trainerWorkspaceScreen.state.packageCount': '{{count}} packages',
        'trainerWorkspaceScreen.state.sessionCount': '{{count}} sessions', 'trainerWorkspaceScreen.state.purchaseCount': '{{count}} purchases',
        'trainerWorkspaceScreen.error.loadOperations': 'Could not load business operations.',
        'trainerWorkspaceScreen.validation.package': 'Enter a name and price, then set a duration or number of sessions.',
        'trainerWorkspaceScreen.error.savePackage': 'Could not save the package.',
        'trainerWorkspaceScreen.validation.session': 'Choose a client, start time, and end time.',
        'trainerWorkspaceScreen.error.saveSession': 'Could not save the session.',
        'trainerWorkspaceScreen.validation.purchase': 'Choose a client, package, and start date.',
        'trainerWorkspaceScreen.error.savePurchase': 'Could not save the package purchase.',
        'trainerWorkspaceScreen.validation.payment': 'Enter a valid amount.',
        'trainerWorkspaceScreen.error.savePayment': 'Could not save the payment.',
        'trainerWorkspaceScreen.error.updateSession': 'Could not update the session.',
        'trainerWorkspaceScreen.state.loadingTimeline': 'Loading timeline…', 'trainerWorkspaceScreen.error.loadTimeline': 'Could not load the timeline.',
        'trainerWorkspaceScreen.validation.measurement': 'Enter a date and at least one measurement value.',
        'trainerWorkspaceScreen.error.saveMeasurement': 'Could not save the measurement.',
        'trainerWorkspaceScreen.validation.checkin': 'Enter a date and at least one check-in value.',
        'trainerWorkspaceScreen.error.saveCheckin': 'Could not save the check-in.',
        'trainerWorkspaceScreen.details.portalCode': 'Portal code: {{code}}',
        'trainerWorkspaceScreen.error.operation': 'Could not complete the operation.',
        'trainerWorkspaceScreen.state.workspaceReady': 'Your workspace is ready with the data available to your account.',
        'trainerWorkspaceScreen.error.loadWorkspace': 'Could not load the workspace.',
        'trainerWorkspaceScreen.error.saveClient': 'Could not save the client.',
        'trainerWorkspaceScreen.error.loadReport': 'Could not load the report.',
        'trainerWorkspaceScreen.error.openClientFile': 'Could not open the client profile.',
        'trainerWorkspaceScreen.timeline.activity': 'Activity',
        'trainerWorkspaceScreen.default.trainer': 'Trainer',
        'trainerWorkspaceScreen.dialog.editClient': 'Edit client profile',
        'trainerWorkspaceScreen.validation.clientRequired': 'Client name and phone number are required.',
        'trainerWorkspaceScreen.state.saving': 'Saving…',
        'trainerWorkspaceScreen.action.complete': 'Complete',
        'trainerWorkspaceScreen.action.payment': 'Payment'
    });

    const trainerWorkspaceScreenArabic = Object.freeze({
        'trainerWorkspaceScreen.page.title': 'مساحة المدرب | Logic Fit',
        'trainerWorkspaceScreen.brand': 'مساحة المدرب المستقل',
        'trainerWorkspaceScreen.hero.title': 'كل عميل. كل جلسة. في مسارك.',
        'trainerWorkspaceScreen.hero.description': 'مساحة تشغيل مصممة للمدرب الحر لإدارة العملاء، الجلسات، الخطط والتحصيلات من مكان واحد.',
        'trainerWorkspaceScreen.state.verifying': 'جاري التحقق من مساحة العمل…',
        'trainerWorkspaceScreen.context': 'مساحتك التدريبية الخاصة', 'trainerWorkspaceScreen.theme.dark': 'الوضع الداكن',
        'trainerWorkspaceScreen.logout': 'تسجيل الخروج', 'trainerWorkspaceScreen.nav.label': 'تنقل مساحة المدرب',
        'trainerWorkspaceScreen.nav.today': 'اليوم', 'trainerWorkspaceScreen.nav.clients': 'العملاء',
        'trainerWorkspaceScreen.nav.packages': 'الباقات', 'trainerWorkspaceScreen.nav.purchases': 'التحصيلات',
        'trainerWorkspaceScreen.nav.reports': 'التقارير', 'trainerWorkspaceScreen.welcome.label': 'ملخص المدرب',
        'trainerWorkspaceScreen.welcome.kicker': 'مساحة تشغيل مستقلة', 'trainerWorkspaceScreen.welcome.title': 'صباح النشاط،',
        'trainerWorkspaceScreen.welcome.name': 'أيها المدرب', 'trainerWorkspaceScreen.welcome.description': 'ابدأ من جلساتك القادمة، ثم تابع العملاء الذين يحتاجون خطوة منك.',
        'trainerWorkspaceScreen.state.refreshed': 'البيانات محدثة من مساحة المدرب', 'trainerWorkspaceScreen.metrics.label': 'مؤشرات المدرب',
        'trainerWorkspaceScreen.metrics.clients': 'قاعدة العملاء', 'trainerWorkspaceScreen.metrics.activeClients': 'عملاء نشطون',
        'trainerWorkspaceScreen.metrics.todayRhythm': 'إيقاع اليوم', 'trainerWorkspaceScreen.metrics.todaySessions': 'جلسات اليوم',
        'trainerWorkspaceScreen.metrics.upcoming': 'المواعيد القادمة', 'trainerWorkspaceScreen.metrics.scheduled': 'جلسات مجدولة',
        'trainerWorkspaceScreen.metrics.businessAlert': 'تنبيه تجاري', 'trainerWorkspaceScreen.metrics.expiringPackages': 'باقات تنتهي قريبًا',
        'trainerWorkspaceScreen.metrics.collections': 'التحصيل', 'trainerWorkspaceScreen.metrics.outstanding': 'أرصدة مستحقة',
        'trainerWorkspaceScreen.quick.kicker': 'اختصارات العمل', 'trainerWorkspaceScreen.quick.title': 'خطوتك التالية',
        'trainerWorkspaceScreen.action.addClient': 'إضافة عميل', 'trainerWorkspaceScreen.action.addClientDescription': 'ابدأ ملفًا تدريبيًا جديدًا',
        'trainerWorkspaceScreen.action.scheduleSession': 'جدولة جلسة', 'trainerWorkspaceScreen.action.scheduleDescription': 'نظّم موعدك القادم',
        'trainerWorkspaceScreen.action.createPackage': 'إنشاء باقة', 'trainerWorkspaceScreen.action.packageDescription': 'قدّم خدمة واضحة لعملائك',
        'trainerWorkspaceScreen.today.kicker': 'جدولك اليومي', 'trainerWorkspaceScreen.today.title': 'جلسات اليوم والقادم',
        'trainerWorkspaceScreen.today.description': 'تابع الموعد والحالة وافتح الإجراء المناسب من نفس المكان.',
        'trainerWorkspaceScreen.activity.kicker': 'إشارات المتابعة', 'trainerWorkspaceScreen.activity.title': 'عملاء يحتاجونك',
        'trainerWorkspaceScreen.activity.description': 'أرقام حقيقية من ملفات التدريب الخاصة بك.',
        'trainerWorkspaceScreen.activity.followUp': 'عميل يحتاج متابعة', 'trainerWorkspaceScreen.activity.measurements': 'قياسات خلال آخر 30 يومًا',
        'trainerWorkspaceScreen.activity.checkins': 'متابعات خلال آخر 14 يومًا',
        'trainerWorkspaceScreen.activity.note': 'الأولوية محسوبة من العملاء والجلسات والباقات والتحصيلات الموجودة في مساحة المدرب فقط.',
        'trainerWorkspaceScreen.clients.kicker': 'ملفات التدريب', 'trainerWorkspaceScreen.clients.title': 'عملاؤك',
        'trainerWorkspaceScreen.clients.description': 'ملف العميل، هدفه، خططه، قياساته وتقدمه — بدون خلط مع بيانات أي منشأة.',
        'trainerWorkspaceScreen.clients.searchLabel': 'البحث في العملاء', 'trainerWorkspaceScreen.clients.searchPlaceholder': 'ابحث باسم العميل أو هاتفه',
        'trainerWorkspaceScreen.action.refresh': 'تحديث', 'trainerWorkspaceScreen.services.label': 'إدارة خدمات المدرب',
        'trainerWorkspaceScreen.services.kicker': 'الخدمات', 'trainerWorkspaceScreen.packages.title': 'باقات التدريب',
        'trainerWorkspaceScreen.packages.description': 'خطط بيع واضحة لعملائك حضوريًا أو أونلاين.',
        'trainerWorkspaceScreen.action.addPackage': 'إضافة باقة', 'trainerWorkspaceScreen.purchases.title': 'مشتريات العملاء',
        'trainerWorkspaceScreen.purchases.description': 'تابع المدفوع والمتبقي لكل باقة بدون سجل مالي موازٍ.',
        'trainerWorkspaceScreen.action.sellPackage': 'بيع باقة', 'trainerWorkspaceScreen.reports.kicker': 'قراءة النشاط',
        'trainerWorkspaceScreen.reports.title': 'ملخص أداء التدريب', 'trainerWorkspaceScreen.reports.period': 'آخر 30 يومًا',
        'trainerWorkspaceScreen.action.refreshReport': 'تحديث التقرير', 'trainerWorkspaceScreen.reports.netRevenue': 'الإيراد الصافي',
        'trainerWorkspaceScreen.reports.newClients': 'العملاء الجدد', 'trainerWorkspaceScreen.reports.completedSessions': 'الجلسات المكتملة',
        'trainerWorkspaceScreen.reports.totalSessions': 'إجمالي الجلسات', 'trainerWorkspaceScreen.reports.outstanding': 'الرصيد المستحق',
        'trainerWorkspaceScreen.reports.progress': 'القياسات والمتابعات', 'trainerWorkspaceScreen.dialog.clientFile': 'ملف العميل',
        'trainerWorkspaceScreen.dialog.close': 'إغلاق', 'trainerWorkspaceScreen.form.clientName': 'اسم العميل',
        'trainerWorkspaceScreen.form.phone': 'رقم الهاتف', 'trainerWorkspaceScreen.form.email': 'البريد الإلكتروني',
        'trainerWorkspaceScreen.form.goal': 'الهدف الأساسي', 'trainerWorkspaceScreen.form.status': 'الحالة',
        'trainerWorkspaceScreen.status.active': 'نشط', 'trainerWorkspaceScreen.status.paused': 'متوقف مؤقتًا',
        'trainerWorkspaceScreen.status.archived': 'مؤرشف', 'trainerWorkspaceScreen.form.notes': 'ملاحظات',
        'trainerWorkspaceScreen.action.cancel': 'إلغاء', 'trainerWorkspaceScreen.action.saveClient': 'حفظ العميل',
        'trainerWorkspaceScreen.dialog.profileOverview': 'نظرة على الملف', 'trainerWorkspaceScreen.dialog.clientDetails': 'تفاصيل العميل',
        'trainerWorkspaceScreen.dialog.profileHistory': 'سجل الملف', 'trainerWorkspaceScreen.dialog.clientTimeline': 'الخط الزمني للعميل',
        'trainerWorkspaceScreen.dialog.progress': 'تقييم وتقدم', 'trainerWorkspaceScreen.action.addMeasurement': 'إضافة قياس',
        'trainerWorkspaceScreen.form.date': 'التاريخ', 'trainerWorkspaceScreen.form.weight': 'الوزن (كجم)',
        'trainerWorkspaceScreen.form.height': 'الطول (سم)', 'trainerWorkspaceScreen.form.bodyFat': 'نسبة الدهون',
        'trainerWorkspaceScreen.form.chest': 'محيط الصدر', 'trainerWorkspaceScreen.form.waist': 'محيط الخصر',
        'trainerWorkspaceScreen.form.hips': 'محيط الأرداف', 'trainerWorkspaceScreen.form.arms': 'محيط الذراع',
        'trainerWorkspaceScreen.form.thighs': 'محيط الفخذ', 'trainerWorkspaceScreen.action.saveMeasurement': 'حفظ القياس',
        'trainerWorkspaceScreen.dialog.clientCheckin': 'متابعة العميل', 'trainerWorkspaceScreen.action.addCheckin': 'إضافة متابعة',
        'trainerWorkspaceScreen.form.checkinWeight': 'وزن المتابعة (كجم)', 'trainerWorkspaceScreen.form.sleep': 'جودة النوم (1–5)',
        'trainerWorkspaceScreen.form.fatigue': 'الطاقة/الإجهاد (1–5)', 'trainerWorkspaceScreen.form.mood': 'المزاج/الالتزام (1–5)',
        'trainerWorkspaceScreen.form.checkinNotes': 'ملاحظات المتابعة', 'trainerWorkspaceScreen.action.saveCheckin': 'حفظ المتابعة',
        'trainerWorkspaceScreen.dialog.commercialServices': 'الخدمات التجارية', 'trainerWorkspaceScreen.form.packageName': 'اسم الباقة',
        'trainerWorkspaceScreen.form.price': 'السعر', 'trainerWorkspaceScreen.form.durationDays': 'مدة الباقة بالأيام',
        'trainerWorkspaceScreen.form.sessionCount': 'عدد الجلسات', 'trainerWorkspaceScreen.form.deliveryMode': 'طريقة التقديم',
        'trainerWorkspaceScreen.option.hybrid': 'حضوري وأونلاين', 'trainerWorkspaceScreen.option.inPerson': 'حضوري',
        'trainerWorkspaceScreen.option.online': 'أونلاين', 'trainerWorkspaceScreen.form.description': 'الوصف',
        'trainerWorkspaceScreen.action.savePackage': 'حفظ الباقة', 'trainerWorkspaceScreen.dialog.scheduling': 'الجدولة',
        'trainerWorkspaceScreen.form.client': 'العميل', 'trainerWorkspaceScreen.form.linkedPackage': 'الباقة المرتبطة',
        'trainerWorkspaceScreen.option.noPackage': 'بدون باقة', 'trainerWorkspaceScreen.form.startsAt': 'تبدأ في',
        'trainerWorkspaceScreen.form.endsAt': 'تنتهي في', 'trainerWorkspaceScreen.action.saveSession': 'حفظ الجلسة',
        'trainerWorkspaceScreen.dialog.sellPackage': 'بيع باقة', 'trainerWorkspaceScreen.dialog.newPurchase': 'تسجيل شراء جديد',
        'trainerWorkspaceScreen.form.package': 'الباقة', 'trainerWorkspaceScreen.form.startDate': 'تاريخ البداية',
        'trainerWorkspaceScreen.form.paidNow': 'المدفوع الآن', 'trainerWorkspaceScreen.form.paymentMethod': 'طريقة الدفع',
        'trainerWorkspaceScreen.option.cash': 'نقدي', 'trainerWorkspaceScreen.option.card': 'بطاقة',
        'trainerWorkspaceScreen.option.transfer': 'تحويل', 'trainerWorkspaceScreen.option.other': 'أخرى',
        'trainerWorkspaceScreen.form.collectionDate': 'تاريخ التحصيل', 'trainerWorkspaceScreen.action.recordPurchase': 'تسجيل الشراء',
        'trainerWorkspaceScreen.dialog.singlePayment': 'دفعة مستقلة', 'trainerWorkspaceScreen.dialog.recordPayment': 'تسجيل دفعة',
        'trainerWorkspaceScreen.form.amount': 'المبلغ', 'trainerWorkspaceScreen.action.savePayment': 'حفظ الدفعة',
        'trainerWorkspaceScreen.empty.clients': 'لا يوجد عملاء بعد.', 'trainerWorkspaceScreen.empty.clientsHint': 'أضف أول عميل لبدء بناء ملفه التدريبي.',
        'trainerWorkspaceScreen.empty.search': 'لم نعثر على نتائج مطابقة.', 'trainerWorkspaceScreen.empty.goal': 'لم يحدد هدفًا بعد',
        'trainerWorkspaceScreen.empty.contact': 'لا توجد وسيلة تواصل', 'trainerWorkspaceScreen.stat.training': 'تدريب',
        'trainerWorkspaceScreen.stat.nutrition': 'تغذية', 'trainerWorkspaceScreen.stat.measurements': 'قياس',
        'trainerWorkspaceScreen.action.open': 'فتح', 'trainerWorkspaceScreen.action.edit': 'تعديل',
        'trainerWorkspaceScreen.pagination.previous': 'الصفحة السابقة', 'trainerWorkspaceScreen.pagination.next': 'الصفحة التالية',
        'trainerWorkspaceScreen.state.loadingClients': 'جارٍ تحميل العملاء...', 'trainerWorkspaceScreen.state.clientCount': '{{count}} عميل',
        'trainerWorkspaceScreen.state.clientCountSingular': '{{count}} عميل',
        'trainerWorkspaceScreen.error.loadClients': 'تعذر تحميل العملاء.', 'trainerWorkspaceScreen.error.loadClientList': 'تعذر تحميل قائمة العملاء.',
        'trainerWorkspaceScreen.state.loadingProfile': 'جارٍ تحميل الملف...', 'trainerWorkspaceScreen.details.name': 'الاسم',
        'trainerWorkspaceScreen.details.phone': 'الهاتف', 'trainerWorkspaceScreen.details.trainingPlans': 'خطط التدريب',
        'trainerWorkspaceScreen.details.nutritionPlans': 'خطط التغذية', 'trainerWorkspaceScreen.details.measurements': 'القياسات',
        'trainerWorkspaceScreen.details.checkins': 'المتابعات', 'trainerWorkspaceScreen.details.goal': 'الهدف:',
        'trainerWorkspaceScreen.details.noGoal': 'لم يحدد بعد', 'trainerWorkspaceScreen.details.notes': 'ملاحظات:',
        'trainerWorkspaceScreen.details.noNotes': 'لا توجد ملاحظات.', 'trainerWorkspaceScreen.action.viewTimeline': 'عرض الخط الزمني',
        'trainerWorkspaceScreen.action.issuePortalAccess': 'إصدار دخول البوابة',
        'trainerWorkspaceScreen.status.session.scheduled': 'مجدولة', 'trainerWorkspaceScreen.status.session.completed': 'مكتملة',
        'trainerWorkspaceScreen.status.session.cancelled': 'ملغاة', 'trainerWorkspaceScreen.status.session.noShow': 'لم يحضر',
        'trainerWorkspaceScreen.status.purchase.completed': 'مكتملة', 'trainerWorkspaceScreen.status.purchase.active': 'نشطة',
        'trainerWorkspaceScreen.status.purchase.cancelled': 'ملغاة', 'trainerWorkspaceScreen.status.package.active': 'نشطة',
        'trainerWorkspaceScreen.service.hybrid': 'هجين', 'trainerWorkspaceScreen.duration.sessions': '{{count}} جلسة',
        'trainerWorkspaceScreen.duration.days': '{{count}} يوم', 'trainerWorkspaceScreen.money.paidFrom': 'مدفوع من',
        'trainerWorkspaceScreen.money.remaining': 'متبقي', 'trainerWorkspaceScreen.empty.packages': 'لا توجد باقات بعد.',
        'trainerWorkspaceScreen.empty.packagesHint': 'أضف أول باقة لربط الخدمات بالتحصيل والجلسات.',
        'trainerWorkspaceScreen.empty.sessions': 'لا توجد جلسات مجدولة.', 'trainerWorkspaceScreen.empty.sessionsHint': 'ستظهر المواعيد القادمة هنا بعد جدولتها.',
        'trainerWorkspaceScreen.empty.purchases': 'لا توجد مشتريات بعد.', 'trainerWorkspaceScreen.empty.purchasesHint': 'سجّل بيع أول باقة لبدء متابعة المدفوعات.',
        'trainerWorkspaceScreen.empty.timeline': 'لا توجد أحداث بعد.', 'trainerWorkspaceScreen.empty.timelineHint': 'ستظهر القياسات والخطط والجلسات والمدفوعات هنا.',
        'trainerWorkspaceScreen.error.retrySection': 'حاول تحديث هذا القسم مرة أخرى.', 'trainerWorkspaceScreen.state.packageCount': '{{count}} باقة',
        'trainerWorkspaceScreen.state.sessionCount': '{{count}} جلسة', 'trainerWorkspaceScreen.state.purchaseCount': '{{count}} عملية شراء',
        'trainerWorkspaceScreen.error.loadOperations': 'تعذر تحميل العمليات التجارية.',
        'trainerWorkspaceScreen.validation.package': 'أدخل اسمًا وسعرًا وحدد مدة أو عدد جلسات.',
        'trainerWorkspaceScreen.error.savePackage': 'تعذر حفظ الباقة.',
        'trainerWorkspaceScreen.validation.session': 'اختر العميل وموعد البداية والنهاية.',
        'trainerWorkspaceScreen.error.saveSession': 'تعذر حفظ الجلسة.',
        'trainerWorkspaceScreen.validation.purchase': 'اختر العميل والباقة وتاريخ البداية.',
        'trainerWorkspaceScreen.error.savePurchase': 'تعذر حفظ شراء الباقة.',
        'trainerWorkspaceScreen.validation.payment': 'أدخل مبلغًا صحيحًا.', 'trainerWorkspaceScreen.error.savePayment': 'تعذر حفظ الدفعة.',
        'trainerWorkspaceScreen.error.updateSession': 'تعذر تحديث الجلسة.', 'trainerWorkspaceScreen.state.loadingTimeline': 'جارٍ تحميل الخط الزمني...',
        'trainerWorkspaceScreen.error.loadTimeline': 'تعذر تحميل الخط الزمني.',
        'trainerWorkspaceScreen.validation.measurement': 'أدخل التاريخ وقيمة قياس واحدة على الأقل.',
        'trainerWorkspaceScreen.error.saveMeasurement': 'تعذر حفظ القياس.',
        'trainerWorkspaceScreen.validation.checkin': 'أدخل التاريخ وقيمة متابعة واحدة على الأقل.',
        'trainerWorkspaceScreen.error.saveCheckin': 'تعذر حفظ المتابعة.',
        'trainerWorkspaceScreen.details.portalCode': 'رمز البوابة: {{code}}',
        'trainerWorkspaceScreen.error.operation': 'تعذر تنفيذ العملية.',
        'trainerWorkspaceScreen.state.workspaceReady': 'مساحة العمل جاهزة بالبيانات المتاحة لحسابك.',
        'trainerWorkspaceScreen.error.loadWorkspace': 'تعذر تحميل مساحة العمل.',
        'trainerWorkspaceScreen.error.saveClient': 'تعذر حفظ العميل.',
        'trainerWorkspaceScreen.error.loadReport': 'تعذر تحميل التقرير.',
        'trainerWorkspaceScreen.error.openClientFile': 'تعذر فتح ملف العميل.',
        'trainerWorkspaceScreen.timeline.activity': 'نشاط',
        'trainerWorkspaceScreen.default.trainer': 'أيها المدرب',
        'trainerWorkspaceScreen.dialog.editClient': 'تعديل ملف العميل',
        'trainerWorkspaceScreen.validation.clientRequired': 'الاسم ورقم الهاتف مطلوبان.',
        'trainerWorkspaceScreen.state.saving': 'جارٍ الحفظ…',
        'trainerWorkspaceScreen.action.complete': 'إتمام',
        'trainerWorkspaceScreen.action.payment': 'دفعة'
    });

    const platformAdminScreenEnglish = Object.freeze({
        'platformAdminScreen.shell.brandName': 'Logic Fit Platform',
        'platformAdminScreen.shell.brandDescription': 'Central platform administration',
        'platformAdminScreen.shell.sidebarCaption': 'Platform administration',
        'platformAdminScreen.shell.scopeTitle': 'Platform scope',
        'platformAdminScreen.shell.scopeDescription': 'Independent scope without a default gym',
        'platformAdminScreen.shell.topbarEyebrow': 'Logic Fit Platform',
        'platformAdminScreen.shell.roleDescription': 'Platform administrator',
        'platformAdminScreen.page.dashboard': 'Platform dashboard', 'platformAdminScreen.page.gyms': 'Gyms',
        'platformAdminScreen.page.requests': 'Subscription requests', 'platformAdminScreen.page.gymRegistrations': 'Join requests',
        'platformAdminScreen.page.paymentMethods': 'Logic Fit payment methods', 'platformAdminScreen.page.backups': 'Backup & recovery',
        'platformAdminScreen.page.plans': 'Plans', 'platformAdminScreen.page.audit': 'Platform audit log',
        'platformAdminScreen.page.settings': 'Platform settings', 'platformAdminScreen.nav.gyms': 'Gyms',
        'platformAdminScreen.nav.requests': 'Subscription requests', 'platformAdminScreen.nav.registrations': 'Join requests',
        'platformAdminScreen.nav.paymentMethods': 'Logic Fit payments', 'platformAdminScreen.nav.backups': 'Backup & recovery',
        'platformAdminScreen.nav.plans': 'Plans', 'platformAdminScreen.nav.audit': 'Platform log',
        'platformAdminScreen.nav.settings': 'Platform settings', 'platformAdminScreen.action.refresh': 'Refresh',
        'platformAdminScreen.action.refreshData': 'Refresh data', 'platformAdminScreen.action.refreshRequests': 'Refresh requests',
        'platformAdminScreen.action.addGym': '+ Add gym', 'platformAdminScreen.action.addPaymentMethod': '+ Add payment method',
        'platformAdminScreen.action.addPlan': '+ Add plan', 'platformAdminScreen.action.cleanupExpired': 'Clean up expired',
        'platformAdminScreen.action.createPlatformBackup': 'Create platform backup', 'platformAdminScreen.action.openAll': 'View all',
        'platformAdminScreen.action.manageGyms': 'Manage gyms', 'platformAdminScreen.action.fullLog': 'Full log',
        'platformAdminScreen.action.openProfile': 'Open profile', 'platformAdminScreen.action.preview': 'Preview',
        'platformAdminScreen.action.notUploaded': 'Not uploaded', 'platformAdminScreen.action.notUploadedProof': 'No confirmed payment proof uploaded',
        'platformAdminScreen.action.approve': 'Approve', 'platformAdminScreen.action.reject': 'Reject',
        'platformAdminScreen.action.edit': 'Edit', 'platformAdminScreen.action.download': 'Download',
        'platformAdminScreen.action.activate': 'Activate', 'platformAdminScreen.action.disable': 'Disable',
        'platformAdminScreen.action.archive': 'Archive', 'platformAdminScreen.action.delete': 'Delete',
        'platformAdminScreen.action.noAction': '—',
        'platformAdminScreen.filter.allCustomerTypes': 'All customer types', 'platformAdminScreen.filter.gym': 'Gym',
        'platformAdminScreen.filter.trainer': 'Independent trainer', 'platformAdminScreen.filter.allStatuses': 'All statuses',
        'platformAdminScreen.filter.active': 'Active', 'platformAdminScreen.filter.trial': 'Trial',
        'platformAdminScreen.filter.suspended': 'Suspended', 'platformAdminScreen.filter.expired': 'Expired',
        'platformAdminScreen.filter.archived': 'Archived', 'platformAdminScreen.filter.allDates': 'All dates',
        'platformAdminScreen.filter.tenantTypeLabel': 'Filter customer type', 'platformAdminScreen.filter.tenantStatusLabel': 'Filter customer status',
        'platformAdminScreen.filter.tenantPlanLabel': 'Filter customer plan', 'platformAdminScreen.filter.tenantExpiryLabel': 'Filter renewal date',
        'platformAdminScreen.filter.allPlans': 'All plans',
        'platformAdminScreen.search.tenantLabel': 'Search gyms and customers', 'platformAdminScreen.shell.navigationLabel': 'Platform administration navigation',
        'platformAdminScreen.filter.expiring7': 'Expires within 7 days', 'platformAdminScreen.filter.expiring30': 'Expires within 30 days',
        'platformAdminScreen.filter.allRequests': 'All requests', 'platformAdminScreen.filter.pending': 'Pending review',
        'platformAdminScreen.filter.approved': 'Approved', 'platformAdminScreen.filter.rejected': 'Rejected',
        'platformAdminScreen.filter.cancelled': 'Cancelled', 'platformAdminScreen.search.gyms': 'Search by name, identifier, or owner…',
        'platformAdminScreen.search.global': 'Search gyms or owners…', 'platformAdminScreen.search.label': 'Search gyms and customers',
        'platformAdminScreen.search.globalLabel': 'Search gyms and their owners',
        'platformAdminScreen.dashboard.eyebrow': 'Overview', 'platformAdminScreen.dashboard.today': 'Platform overview today',
        'platformAdminScreen.dashboard.description': 'Monitor gyms, subscriptions, and usage in one place.',
        'platformAdminScreen.dashboard.loading': 'Loading platform metrics…', 'platformAdminScreen.dashboard.health': 'Gym health',
        'platformAdminScreen.dashboard.distribution': 'Gym status distribution', 'platformAdminScreen.dashboard.actionsEyebrow': 'Quick actions',
        'platformAdminScreen.dashboard.actionsTitle': 'Platform actions', 'platformAdminScreen.dashboard.openGym': 'Open any gym profile',
        'platformAdminScreen.dashboard.reviewRequests': 'Review requests', 'platformAdminScreen.dashboard.billing': 'Payments and subscriptions',
        'platformAdminScreen.dashboard.configurePlans': 'Configure plans', 'platformAdminScreen.dashboard.limitsBenefits': 'Limits and features',
        'platformAdminScreen.dashboard.latestGyms': 'Latest gyms', 'platformAdminScreen.dashboard.latestGymsTitle': 'Recently added gyms',
        'platformAdminScreen.dashboard.activity': 'Activity log', 'platformAdminScreen.dashboard.latestActivity': 'Latest activity',
        'platformAdminScreen.dashboard.allActivity': 'Full log', 'platformAdminScreen.dashboard.gymsTotal': 'Total gyms',
        'platformAdminScreen.dashboard.gymsTotalCaption': 'All registered gyms', 'platformAdminScreen.dashboard.gymsActive': 'Active gyms',
        'platformAdminScreen.dashboard.gymsActiveCaption': 'Currently operating', 'platformAdminScreen.dashboard.gymsTrial': 'Trial gyms',
        'platformAdminScreen.dashboard.gymsTrialCaption': 'In their trial period', 'platformAdminScreen.dashboard.pendingRequests': 'Requests awaiting review',
        'platformAdminScreen.dashboard.pendingRequestsCaption': 'Require action', 'platformAdminScreen.dashboard.expiring': 'Expiring soon',
        'platformAdminScreen.dashboard.expiringCaption': 'Within 30 days', 'platformAdminScreen.dashboard.members': 'Total members',
        'platformAdminScreen.dashboard.allGyms': 'Across all gyms', 'platformAdminScreen.dashboard.users': 'System users',
        'platformAdminScreen.dashboard.ownersAssistants': 'Owners and assistants', 'platformAdminScreen.dashboard.aiUsage': 'AI usage',
        'platformAdminScreen.dashboard.thisMonth': 'This month', 'platformAdminScreen.dashboard.storage': 'Storage',
        'platformAdminScreen.dashboard.files': 'Platform and gym files', 'platformAdminScreen.dashboard.newGyms': 'New gyms',
        'platformAdminScreen.dashboard.selectedPeriod': 'During the selected period',
        'platformAdminScreen.empty.recentGyms': 'No gyms have been added yet.', 'platformAdminScreen.empty.activity': 'No activity has been recorded.',
        'platformAdminScreen.empty.tenants': 'No matching results.', 'platformAdminScreen.empty.results': 'No results',
        'platformAdminScreen.empty.requests': 'No requests.', 'platformAdminScreen.empty.registrations': 'No matching join requests.',
        'platformAdminScreen.empty.paymentMethodsTitle': 'No platform payment methods yet.',
        'platformAdminScreen.empty.paymentMethodsDescription': 'Add an active payment method so gym owners can complete registration at /register-gym.',
        'platformAdminScreen.empty.backupTenants': 'No gym backup data yet.', 'platformAdminScreen.empty.platformBackups': 'No platform backups have been created yet.',
        'platformAdminScreen.empty.backupAudit': 'No backup operations have been recorded.', 'platformAdminScreen.empty.plans': 'No plans.',
        'platformAdminScreen.empty.audit': 'No operations.', 'platformAdminScreen.status.unknownTenantType': 'Unknown type',
        'platformAdminScreen.status.noOwner': 'No owner', 'platformAdminScreen.status.requests': 'requests', 'platformAdminScreen.status.days': '{{count}} days',
        'platformAdminScreen.status.months': '{{count}} months', 'platformAdminScreen.status.monthly': 'Monthly',
        'platformAdminScreen.status.quarterly': '3 months', 'platformAdminScreen.status.semiannual': '6 months',
        'platformAdminScreen.status.annual': 'Annual', 'platformAdminScreen.status.noExpiry': 'No expiry',
        'platformAdminScreen.status.allTenants': 'platform customers', 'platformAdminScreen.summary.rows': 'Showing {{shown}} of {{total}} {{entity}}',
        'platformAdminScreen.summary.paymentMethods': '{{active}} active · {{total}} total',
        'platformAdminScreen.table.customer': 'Customer', 'platformAdminScreen.table.type': 'Type',
        'platformAdminScreen.table.owner': 'Owner', 'platformAdminScreen.table.plan': 'Plan', 'platformAdminScreen.table.status': 'Status',
        'platformAdminScreen.table.subscription': 'Subscription', 'platformAdminScreen.table.usage': 'Usage',
        'platformAdminScreen.table.lastActivity': 'Last activity', 'platformAdminScreen.table.amount': 'Amount',
        'platformAdminScreen.table.proof': 'Payment proof', 'platformAdminScreen.table.date': 'Date',
        'platformAdminScreen.table.action': 'Action', 'platformAdminScreen.table.duration': 'Duration',
        'platformAdminScreen.table.gym': 'Gym', 'platformAdminScreen.table.contact': 'Contact and owner',
        'platformAdminScreen.table.planTerm': 'Plan and term', 'platformAdminScreen.table.amountMethod': 'Amount and payment method',
        'platformAdminScreen.table.method': 'Method', 'platformAdminScreen.table.account': 'Number / account',
        'platformAdminScreen.table.recipientInstructions': 'Recipient and instructions', 'platformAdminScreen.table.order': 'Order',
        'platformAdminScreen.table.updated': 'Last updated', 'platformAdminScreen.table.time': 'Time',
        'platformAdminScreen.table.actor': 'Actor', 'platformAdminScreen.table.operation': 'Operation',
        'platformAdminScreen.table.reason': 'Reason', 'platformAdminScreen.table.details': 'Details',
        'platformAdminScreen.gyms.kicker': 'Gym directory', 'platformAdminScreen.gyms.title': 'All gyms',
        'platformAdminScreen.gyms.description': 'Manage each gym directly without signing in to the owner account.',
        'platformAdminScreen.requests.kicker': 'Manual billing',
        'platformAdminScreen.requests.description': 'Review payment proofs and activate a gym subscription manually after verification.',
        'platformAdminScreen.registrations.kicker': 'Self-service registration', 'platformAdminScreen.registrations.title': 'Join Logic Fit',
        'platformAdminScreen.registrations.description': 'Review new gym requests and payment proofs before creating a tenant and owner account.',
        'platformAdminScreen.payments.kicker': 'Logic Fit subscription collections',
        'platformAdminScreen.payments.description': 'Manage payment methods shown to gym owners during Logic Fit registration. These settings belong to the platform and are not used in gym payment portals.',
        'platformAdminScreen.payments.source': 'Payment source for /register-gym',
        'platformAdminScreen.payments.sourceDescription': 'Only active methods are shown to applicants. A method is not ready until saved and activated here. Data is not stored in the interface or source code.',
        'platformAdminScreen.payments.current': 'Current list', 'platformAdminScreen.backups.kicker': 'Platform protection',
        'platformAdminScreen.backups.description': 'Monitor gym and platform backups, and verify the latest backup before relying on it.',
        'platformAdminScreen.backups.health': 'Backup health', 'platformAdminScreen.backups.dailySummary': 'Daily backup summary',
        'platformAdminScreen.backups.recovery': 'Platform recovery', 'platformAdminScreen.backups.storageStatus': 'Private storage status',
        'platformAdminScreen.backups.platformDR': 'Platform backups', 'platformAdminScreen.backups.tenantBackups': 'Latest backup per gym',
        'platformAdminScreen.backups.history': 'Backup history', 'platformAdminScreen.backups.latestOperations': 'Latest Backup/DR operations',
        'platformAdminScreen.plans.kicker': 'Platform plans', 'platformAdminScreen.plans.title': 'Plans and limits',
        'platformAdminScreen.plans.description': 'Manage plan pricing and centrally applied features.',
        'platformAdminScreen.audit.kicker': 'Operations log', 'platformAdminScreen.audit.title': 'Platform operations log',
        'platformAdminScreen.audit.description': 'Every administrative decision is logged with its actor, time, reason, and change.',
        'platformAdminScreen.settings.description': 'Manage platform operations and customization settings in one place.',
        'platformAdminScreen.settings.sections': 'Platform settings sections',
        'platformAdminScreen.settings.instructions': 'Choose a section to manage. WhatsApp templates here are platform-wide settings only.',
        'platformAdminScreen.settings.subscriptions': 'Subscriptions and plans',
        'platformAdminScreen.settings.subscriptionsDescription': 'Manage platform plans and packages.',
        'platformAdminScreen.settings.paymentMethods': 'Payment methods',
        'platformAdminScreen.settings.paymentMethodsDescription': 'Manage platform payment methods.',
        'platformAdminScreen.settings.backups': 'Backups', 'platformAdminScreen.settings.backupsDescription': 'Review backups and safe recovery.',
        'platformAdminScreen.settings.whatsapp': 'Messages and WhatsApp',
        'platformAdminScreen.settings.whatsappDescription': 'Manage central templates used by all gyms and trainers.',
        'platformAdminScreen.settings.templatesCount': '{{count}} templates', 'platformAdminScreen.settings.back': 'Back to platform settings',
        'platformAdminScreen.settings.currentSection': 'Current section',
        'platformAdminScreen.settings.currentSectionDescription': 'Manage this section from the current screen.',
        'platformAdminScreen.whatsapp.kicker': 'PLATFORM ADMIN · SYSTEM TEMPLATES',
        'platformAdminScreen.whatsapp.description': 'Manage central WhatsApp templates used by all gyms and trainers. WhatsApp opens for manual sending.',
        'platformAdminScreen.whatsapp.centralTemplates': 'Central templates', 'platformAdminScreen.whatsapp.onePerType': 'One system template per message type.',
        'platformAdminScreen.whatsapp.listLabel': 'WhatsApp message templates', 'platformAdminScreen.whatsapp.templates': 'Templates',
        'platformAdminScreen.whatsapp.listHint': 'Choose a template to edit and preview. Central changes apply to all tenants.',
        'platformAdminScreen.whatsapp.centralListLabel': 'Central templates', 'platformAdminScreen.whatsapp.messageText': 'Message text',
        'platformAdminScreen.whatsapp.variableHint': 'Select a variable to insert it at the cursor.',
        'platformAdminScreen.whatsapp.availableVariables': 'Available variables', 'platformAdminScreen.whatsapp.noVariables': 'No variables are available for this template.',
        'platformAdminScreen.whatsapp.restoreDefault': 'Restore default', 'platformAdminScreen.whatsapp.openPreview': 'Open WhatsApp preview',
        'platformAdminScreen.whatsapp.saveChanges': 'Save changes', 'platformAdminScreen.whatsapp.previewLabel': 'Message preview',
        'platformAdminScreen.whatsapp.previewTitle': 'WhatsApp preview', 'platformAdminScreen.whatsapp.sampleData': 'Sample data',
        'platformAdminScreen.whatsapp.previewNote': 'This preview does not send a message or use real member data.',
        'platformAdminScreen.whatsapp.systemTemplate': 'System template', 'platformAdminScreen.whatsapp.empty': 'No templates are available.',
        'platformAdminScreen.whatsapp.saved': 'Saved', 'platformAdminScreen.whatsapp.unsaved': 'Unsaved changes',
        'platformAdminScreen.whatsapp.loading': 'Loading templates…', 'platformAdminScreen.whatsapp.loadError': 'Could not load templates.',
        'platformAdminScreen.whatsapp.saveError': 'Could not save the template.', 'platformAdminScreen.whatsapp.saveSuccess': 'System template saved.',
        'platformAdminScreen.whatsapp.restoreConfirm': 'The default system template text will be restored. Continue?',
        'platformAdminScreen.whatsapp.restoreError': 'Could not restore the default template.',
        'platformAdminScreen.whatsapp.restoreSuccess': 'Default template restored.',
        'platformAdminScreen.whatsapp.phonePrompt': 'Enter a test number to open WhatsApp:',
        'platformAdminScreen.whatsapp.unsavedConfirm': 'You have unsaved changes. Switch templates anyway?',
        'platformAdminScreen.whatsapp.status.platform': 'System · Platform', 'platformAdminScreen.whatsapp.status.system': 'System',
        'platformAdminScreen.whatsapp.noVariablesForTemplate': 'This template has no variables.',
        'platformAdminScreen.whatsapp.catalogLabel': 'Template catalog',
        'platformAdminScreen.whatsapp.editorLabel': 'Template editor',
        'platformAdminScreen.whatsapp.insertLabel': 'Insert variable',
        'platformAdminScreen.whatsapp.livePreview': 'Live preview',
        'platformAdminScreen.whatsapp.descriptionExact': 'Manage central WhatsApp templates used by all gyms and trainers. WhatsApp opens and messages are sent manually.',
        'platformAdminScreen.whatsapp.listHintExact': 'Choose a template to edit and preview. Central changes apply to all tenants.',
        'platformAdminScreen.settings.templatesCountFixed': '9 templates',
        'platformAdminScreen.settings.backArrow': 'Back to platform settings',
        'platformAdminScreen.filter.requestStatusLabel': 'Subscription request status',
        'platformAdminScreen.filter.registrationStatusLabel': 'Gym registration status',
        'platformAdminScreen.page.paymentMethodsTitle': 'Platform payment methods',
        'platformAdminScreen.backups.pageTitle': 'Backup and recovery',
        'platformAdminScreen.backups.today': 'Today', 'platformAdminScreen.backups.eligibleToday': 'Gyms due today',
        'platformAdminScreen.backups.verifiedToday': 'Verified backups', 'platformAdminScreen.backups.healthyDaily': 'Healthy daily backups',
        'platformAdminScreen.backups.failedToday': 'Failed backups', 'platformAdminScreen.backups.reviewRetry': 'Needs review or retry',
        'platformAdminScreen.backups.missingToday': 'Backups missing today', 'platformAdminScreen.backups.notCreated': 'Not created yet',
        'platformAdminScreen.backups.missingOrFailed': 'Missing or failed', 'platformAdminScreen.backups.lastPlatformVerified': 'Last verified platform backup',
        'platformAdminScreen.backups.restoreRehearsal': 'Verified restore rehearsal', 'platformAdminScreen.backups.recurring': 'Recurring backups',
        'platformAdminScreen.backups.dailyOnly': 'Daily only', 'platformAdminScreen.backups.tableCoverage': 'Table registry coverage',
        'platformAdminScreen.backups.reviewNeeded': 'Needs review ({{count}})', 'platformAdminScreen.backups.recentFailures': 'Recent platform backup failures',
        'platformAdminScreen.backups.unconfigured': 'Not configured', 'platformAdminScreen.backups.privateStorageRequired': 'Connect private storage before using production backups.',
        'platformAdminScreen.backups.offsitePrivacy': 'Off-site: {{status}} · Private storage paths and public file links are never shown.',
        'platformAdminScreen.backups.connected': 'Connected', 'platformAdminScreen.backups.localTesting': 'Local development only',
        'platformAdminScreen.backups.privateReady': 'Private storage is ready for verification and upload.',
        'platformAdminScreen.backups.localNotProduction': 'Local development storage only; not suitable for Production or off-site backups.',
        'platformAdminScreen.backups.complete': 'Complete', 'platformAdminScreen.backups.weekly': 'Weekly',
        'platformAdminScreen.backups.monthly': 'Monthly', 'platformAdminScreen.backups.verified': 'Verified',
        'platformAdminScreen.backups.size': 'Size', 'platformAdminScreen.backups.verification': 'Verification',
        'platformAdminScreen.backups.backupDay': 'Backup day', 'platformAdminScreen.backups.lastVerification': 'Last verified',
        'platformAdminScreen.backups.backup': 'Backup', 'platformAdminScreen.backups.result': 'Result',
        'notificationCenter.trigger.label': 'Notifications', 'notificationCenter.trigger.title': 'Notifications',
        'notificationCenter.panel.label': 'Notifications', 'notificationCenter.panel.title': 'Notifications',
        'notificationCenter.panel.description': 'Recent updates for your account',
        'notificationCenter.action.closePanel': 'Close notifications', 'notificationCenter.action.close': 'Close',
        'notificationCenter.filter.label': 'Filter notifications', 'notificationCenter.filter.all': 'All notifications',
        'notificationCenter.action.refreshAccessible': 'Refresh notifications', 'notificationCenter.action.refresh': 'Refresh',
        'notificationCenter.action.markAllRead': 'Mark all as read', 'notificationCenter.action.loadMore': 'Load more',
        'notificationCenter.state.loadingMore': 'Loading more…', 'notificationCenter.state.endOfList': 'You have reached the end of notifications.',
        'notificationCenter.action.closeNotification': 'Close notification', 'notificationCenter.action.markReadAccessible': 'Mark notification as read',
        'notificationCenter.action.markRead': 'Mark as read', 'notificationCenter.status.unread': 'Unread',
        'notificationCenter.status.unreadCount': '{{count}} unread', 'notificationCenter.status.allRead': 'All notifications are read',
        'notificationCenter.category.coaching': 'Coaching', 'notificationCenter.category.registration': 'Registration',
        'notificationCenter.category.membership': 'Memberships', 'notificationCenter.category.attendance': 'Attendance',
        'notificationCenter.category.payment': 'Payments', 'notificationCenter.category.system': 'System',
        'notificationCenter.category.subscription': 'Subscriptions', 'notificationCenter.category.default': 'Notice',
        'notificationCenter.event.memberCreated': 'Member added', 'notificationCenter.event.membershipCreated': 'Membership created',
        'notificationCenter.event.membershipFrozen': 'Membership frozen', 'notificationCenter.event.membershipResumed': 'Membership resumed',
        'notificationCenter.event.membershipRenewed': 'Membership renewed', 'notificationCenter.event.membershipUpdated': 'Membership updated',
        'notificationCenter.event.paymentUpdated': 'Payment updated', 'notificationCenter.event.attendanceCheckedIn': 'Attendance recorded',
        'notificationCenter.event.attendanceAutoCheckedOut': 'Automatic check-out recorded',
        'notificationCenter.event.subscriptionRequestCreated': 'Subscription request received',
        'notificationCenter.event.subscriptionRequestApproved': 'Subscription request approved',
        'notificationCenter.event.subscriptionRequestRejected': 'Subscription request declined',
        'notificationCenter.event.trainerSessionScheduled': 'Training session scheduled',
        'notificationCenter.event.trainerSessionUpdated': 'Training session updated',
        'notificationCenter.event.trainerSessionStatusChanged': 'Training session status changed',
        'notificationCenter.event.trainerPlanPublished': 'Training plan published',
        'notificationCenter.event.systemAnnouncement': 'New announcement', 'notificationCenter.event.generic': 'New notification',
        'notificationCenter.event.withName': '{{title}} {{name}}', 'notificationCenter.event.withMembershipName': '{{title}} for {{name}}',
        'notificationCenter.state.empty': 'There are no new notifications.', 'notificationCenter.state.signIn': 'Sign in to view your notifications.',
        'notificationCenter.state.loading': 'Loading notifications…', 'notificationCenter.state.loadError': 'Could not load notifications. Try again.',
        'platformAdminScreen.backupStatus.pending': 'Waiting', 'platformAdminScreen.backupStatus.running': 'Running',
        'platformAdminScreen.backupStatus.uploaded': 'Uploaded', 'platformAdminScreen.backupStatus.verifying': 'Verifying',
        'platformAdminScreen.backupStatus.verified': 'Verified', 'platformAdminScreen.backupStatus.failed': 'Failed',
        'platformAdminScreen.backupStatus.expired': 'Expired', 'platformAdminScreen.backupStatus.deleted': 'Deleted',
        'platformAdminScreen.backupType.platform_daily': 'Daily platform backup',
        'platformAdminScreen.backupType.platform_weekly': 'Weekly platform backup',
        'platformAdminScreen.backupType.platform_monthly': 'Monthly platform backup',
        'platformAdminScreen.backupType.platform_manual': 'Manual platform backup',
        'platformAdminScreen.backupType.tenant_daily': 'Daily gym backup',
        'platformAdminScreen.backupType.tenant_manual': 'Manual gym backup',
        'platformAdminScreen.backupType.tenant_pre_restore': 'Pre-restore safety backup',
        'platformAdminScreen.activity.member_created': 'Member added',
        'platformAdminScreen.activity.membership_created': 'Membership created',
        'platformAdminScreen.activity.attendance_checked_in': 'Member checked in',
        'platformAdminScreen.activity.operation': 'Administrative action',
        'platformAdminScreen.activity.system': 'System',
        'platformAdminScreen.login.forPlatformAdmin': 'This page is for PlatformAdmin accounts only.',
        'platformAdminScreen.theme.enableLight': 'Enable light theme', 'platformAdminScreen.theme.enableDark': 'Enable dark theme'
    });

    const trainerStudioV2Arabic = Object.freeze({
        'memberSubscriptionRequests.action.approving': 'جارٍ الاعتماد…',
        'memberSubscriptionRequests.action.rejecting': 'جارٍ الرفض…',
        'trainerStudioV2.shell.topbar': 'الشريط العلوي لمساحة المدرب',
        'trainerStudioV2.shell.sidebar': 'قائمة Trainer Studio',
        'trainerStudioV2.shell.openNavigation': 'فتح قائمة Trainer Studio',
        'trainerStudioV2.shell.closeNavigation': 'إغلاق القائمة',
        'trainerStudioV2.shell.privateWorkspace': 'مساحة خاصة وآمنة',
        'trainerStudioV2.shell.workspaceStatus': 'مساحة خاصة',
        'trainerStudioV2.shell.logout': 'تسجيل الخروج',
        'trainerStudioV2.shell.enableDark': 'تفعيل الوضع الداكن',
        'trainerStudioV2.shell.enableLight': 'تفعيل الوضع الفاتح',
        'trainerStudioV2.shell.dashboardData': 'بيانات مساحتك التدريبية',
        'trainerStudioV2.group.daily': 'العمل اليومي',
        'trainerStudioV2.group.training': 'التدريب والمتابعة',
        'trainerStudioV2.group.business': 'الأعمال',
        'trainerStudioV2.group.workspace': 'المساحة',
        'trainerStudioV2.route.dashboard': 'لوحة التحكم',
        'trainerStudioV2.route.clients': 'العملاء',
        'trainerStudioV2.route.calendar': 'الجدول',
        'trainerStudioV2.route.sessions': 'الجلسات',
        'trainerStudioV2.route.training': 'خطط التدريب',
        'trainerStudioV2.route.nutrition': 'خطط التغذية',
        'trainerStudioV2.route.exercises': 'مكتبة التمارين',
        'trainerStudioV2.route.muscles': 'العضلات',
        'trainerStudioV2.route.foods': 'مكتبة الأطعمة',
        'trainerStudioV2.route.measurements': 'القياسات',
        'trainerStudioV2.route.progress': 'التقدم',
        'trainerStudioV2.route.checkins': 'المتابعات',
        'trainerStudioV2.route.goals': 'الأهداف',
        'trainerStudioV2.route.packages': 'الباقات',
        'trainerStudioV2.route.sales': 'المبيعات والتحصيلات',
        'trainerStudioV2.route.renewals': 'التجديدات',
        'trainerStudioV2.route.finance': 'المالية',
        'trainerStudioV2.route.reports': 'التقارير',
        'trainerStudioV2.route.portal': 'بوابة العميل',
        'trainerStudioV2.route.notifications': 'التنبيهات',
        'trainerStudioV2.route.tasks': 'المهام',
        'trainerStudioV2.route.templates': 'القوالب',
        'trainerStudioV2.route.settings': 'الإعدادات',
        'trainerStudioV2.eyebrow.dashboard': 'مساحة المدرب',
        'trainerStudioV2.eyebrow.dailyWork': 'إدارة العمل اليومي',
        'trainerStudioV2.eyebrow.training': 'التدريب والمتابعة',
        'trainerStudioV2.eyebrow.execution': 'التنفيذ',
        'trainerStudioV2.eyebrow.programming': 'البرمجة التدريبية',
        'trainerStudioV2.eyebrow.nutrition': 'التغذية',
        'trainerStudioV2.eyebrow.library': 'المكتبة',
        'trainerStudioV2.eyebrow.bodyMap': 'خريطة الجسم',
        'trainerStudioV2.eyebrow.assessment': 'التقييم',
        'trainerStudioV2.eyebrow.results': 'النتائج',
        'trainerStudioV2.eyebrow.clientCare': 'العناية بالعميل',
        'trainerStudioV2.eyebrow.services': 'الخدمات',
        'trainerStudioV2.eyebrow.revenue': 'الإيرادات',
        'trainerStudioV2.eyebrow.retention': 'الاحتفاظ بالعملاء',
        'trainerStudioV2.eyebrow.finance': 'الصورة المالية',
        'trainerStudioV2.eyebrow.activity': 'قراءة النشاط',
        'trainerStudioV2.eyebrow.clientExperience': 'تجربة العميل',
        'trainerStudioV2.eyebrow.actionCenter': 'مركز الإجراءات',
        'trainerStudioV2.eyebrow.trainerLibrary': 'مكتبة المدرب',
        'trainerStudioV2.eyebrow.workspace': 'إدارة المساحة',
        'trainerStudioV2.dashboard.welcomeKicker': 'مساحة تشغيل مستقلة',
        'trainerStudioV2.dashboard.welcomeLead': 'صباح النشاط،',
        'trainerStudioV2.dashboard.welcomeFallback': 'أيها المدرب',
        'trainerStudioV2.dashboard.welcomeDescription': 'ابدأ بجلساتك القادمة، ثم تابع العملاء الذين يحتاجون إلى خطوة منك.',
        'trainerStudioV2.dashboard.dataUpdated': 'البيانات محدّثة من مساحة المدرب',
        'trainerStudioV2.dashboard.metricsLabel': 'مؤشرات المدرب',
        'trainerStudioV2.dashboard.clientsBase': 'قاعدة العملاء',
        'trainerStudioV2.dashboard.activeClients': 'عملاء نشطون',
        'trainerStudioV2.dashboard.todayRhythm': 'إيقاع اليوم',
        'trainerStudioV2.dashboard.todaySessions': 'جلسات اليوم',
        'trainerStudioV2.dashboard.upcoming': 'المواعيد القادمة',
        'trainerStudioV2.dashboard.scheduledSessions': 'جلسات مجدولة',
        'trainerStudioV2.dashboard.businessAlert': 'تنبيه تجاري',
        'trainerStudioV2.dashboard.expiringPackages': 'باقات تنتهي قريبًا',
        'trainerStudioV2.dashboard.collections': 'التحصيل',
        'trainerStudioV2.dashboard.outstanding': 'أرصدة مستحقة',
        'trainerStudioV2.dashboard.quickKicker': 'اختصارات العمل',
        'trainerStudioV2.dashboard.quickTitle': 'خطوتك التالية',
        'trainerStudioV2.dashboard.addClient': 'إضافة عميل',
        'trainerStudioV2.dashboard.addClientDescription': 'ابدأ ملفًا تدريبيًا جديدًا',
        'trainerStudioV2.dashboard.scheduleSession': 'جدولة جلسة',
        'trainerStudioV2.dashboard.scheduleDescription': 'نظّم موعدك القادم',
        'trainerStudioV2.dashboard.createPackage': 'إنشاء باقة',
        'trainerStudioV2.dashboard.packageDescription': 'قدّم خدمة واضحة لعملائك',
        'trainerStudioV2.dashboard.todayKicker': 'جدولك اليومي',
        'trainerStudioV2.dashboard.sessionsTitle': 'جلسات اليوم والقادمة',
        'trainerStudioV2.dashboard.sessionsDescription': 'تابع الموعد والحالة، وافتح الإجراء المناسب من المكان نفسه.',
        'trainerStudioV2.dashboard.scheduleAction': 'جدولة جلسة',
        'trainerStudioV2.dashboard.followupKicker': 'إشارات المتابعة',
        'trainerStudioV2.dashboard.followupTitle': 'عملاء يحتاجون إليك',
        'trainerStudioV2.dashboard.followupDescription': 'أرقام فعلية من ملفاتك التدريبية الخاصة.',
        'trainerStudioV2.dashboard.followupItem': 'عميل يحتاج إلى متابعة',
        'trainerStudioV2.dashboard.measurements': 'قياسات خلال آخر 30 يومًا',
        'trainerStudioV2.dashboard.checkins': 'متابعات خلال آخر 14 يومًا',
        'trainerStudioV2.dashboard.priorityNote': 'تُحسب الأولوية من العملاء والجلسات والباقات والتحصيلات الموجودة في مساحة المدرب فقط.',
        'trainerStudioV2.dashboard.sessionsList': 'قائمة الجلسات القادمة',
        'trainerStudioV2.dashboard.sessionCount': '{{count}} جلسة',
        'trainerStudioV2.dashboard.noSessions': 'لا توجد جلسات مجدولة في الفترة الحالية.',
        'trainerStudioV2.dashboard.noSessionsHint': 'ستظهر الجلسات القادمة هنا بعد جدولتها.',
        'trainerStudioV2.dashboard.session.scheduled': 'مجدولة',
        'trainerStudioV2.dashboard.session.completed': 'مكتملة',
        'trainerStudioV2.dashboard.session.cancelled': 'ملغاة',
        'trainerStudioV2.dashboard.session.noShow': 'لم يحضر',
        'trainerStudioV2.dashboard.session.complete': 'إكمال',
        'trainerStudioV2.dashboard.session.cancel': 'إلغاء',
        'trainerStudioV2.dashboard.workspaceLoading': 'جارٍ التحقق من مساحة العمل...',
        'trainerStudioV2.dashboard.workspaceReady': 'مساحة العمل جاهزة بالبيانات المتاحة لحسابك.',
        'trainerStudioV2.dashboard.workspaceError': 'تعذر تحميل مساحة العمل.',
        'trainerStudioV2.description.clients': 'ملفات تدريبية منظمة من أول تواصل إلى آخر متابعة.',
        'trainerStudioV2.description.calendar': 'مواعيد الجلسات القادمة في مساحة واحدة.',
        'trainerStudioV2.description.sessions': 'راجع الجلسات وحالتها وارتباطها بالباقات.',
        'trainerStudioV2.description.training': 'الخطط المحفوظة لعملائك من المصدر الحالي.',
        'trainerStudioV2.description.nutrition': 'الخطط الغذائية المرتبطة بملفات العملاء.',
        'trainerStudioV2.description.exercises': 'تمارين مصورة جاهزة للاستخدام داخل برامج التدريب.',
        'trainerStudioV2.description.muscles': 'استكشف العضلات المستهدفة وصورها ومناطقها.',
        'trainerStudioV2.description.foods': 'أطعمة ومكونات مع قيمها الغذائية الحالية.',
        'trainerStudioV2.description.measurements': 'أحدث قياسات العملاء وتاريخ تحديث الملف.',
        'trainerStudioV2.description.progress': 'مؤشرات التدريب والقياسات المسجلة فعليًا.',
        'trainerStudioV2.description.checkins': 'العملاء الذين يحتاجون خطوة متابعة منك.',
        'trainerStudioV2.description.goals': 'أهداف قابلة للقياس مرتبطة بكل عميل.',
        'trainerStudioV2.description.packages': 'خدمات التدريب وأسعارها ومددها.',
        'trainerStudioV2.description.sales': 'مشتريات الباقات والمدفوع والمتبقي.',
        'trainerStudioV2.description.renewals': 'الباقات التي تحتاج قرار تجديد أو متابعة تحصيل.',
        'trainerStudioV2.description.finance': 'ملخص التحصيلات والأرصدة من السجل الحالي.',
        'trainerStudioV2.description.reports': 'أداء التدريب خلال الفترة المحددة.',
        'trainerStudioV2.description.portal': 'إصدار دخول العميل ومتابعة تجربته التدريبية.',
        'trainerStudioV2.description.notifications': 'تنبيهات الجلسات والمتابعات والباقات.',
        'trainerStudioV2.description.tasks': 'مهام مرتبطة بالعملاء ومواعيد المتابعة.',
        'trainerStudioV2.description.templates': 'قوالب محفوظة لإعادة الاستخدام مع العملاء.',
        'trainerStudioV2.description.settings': 'بيانات المساحة والاشتراك والتفضيلات المتاحة.',
        'trainerStudioV2.ui.dataSource': 'مصدر البيانات الحالي',
        'trainerStudioV2.ui.heading.followUps': 'مركز المتابعات',
        'trainerStudioV2.ui.heading.renewals': 'مركز التجديدات',
        'trainerStudioV2.ui.heading.clientPortal': 'دخول بوابة العملاء',
        'trainerStudioV2.ui.heading.actionCenter': 'مركز الإجراء',
        'trainerStudioV2.ui.heading.templates': 'مكتبة القوالب',
        'trainerStudioV2.ui.templates.emptyDescription': 'ابدأ بحفظ قالب للتدريب أو التغذية.',
        'trainerStudioV2.ui.templates.emptyTitle': 'لا توجد قوالب محفوظة.',
        'trainerStudioV2.ui.goals.emptyDescription': 'أضف هدفًا واربطه بعميل لمتابعة التقدم.',
        'trainerStudioV2.ui.goals.emptyTitle': 'لا توجد أهداف مسجلة',
        'trainerStudioV2.ui.goalStatus.active': 'نشط',
        'trainerStudioV2.ui.goalStatus.completed': 'مكتمل',
        'trainerStudioV2.ui.goalStatus.paused': 'متوقف',
        'trainerStudioV2.ui.goalStatus.archived': 'مؤرشف',
        'trainerStudioV2.ui.goalType.performance': 'أداء',
        'trainerStudioV2.ui.goalType.custom': 'مخصص',
        'trainerStudioV2.ui.goalAction.markComplete': 'تعليم كمكتمل',
        'trainerStudioV2.ui.deadline': 'الموعد',
        'trainerStudioV2.ui.goal.valueUnset': 'لم يتم تحديد القيمة',
        'trainerStudioV2.ui.item': 'عنصر',
        'trainerStudioV2.ui.currentData': 'عملية مرتبطة ببيانات فعلية',
        'trainerStudioV2.ui.close': 'إغلاق',
        'trainerStudioV2.ui.cancel': 'إلغاء',
        'trainerStudioV2.ui.retry': 'إعادة المحاولة',
        'trainerStudioV2.ui.loading.schedule': 'جاري تحميل الجدول...',
        'trainerStudioV2.ui.loading.plan': 'جاري تجهيز النموذج...',
        'trainerStudioV2.ui.loading.plans': 'جاري تحميل الخطط...',
        'trainerStudioV2.ui.loading.library': 'جاري تجهيز المكتبة المصورة...',
        'trainerStudioV2.ui.loading.clients': 'جاري تحميل ملفات العملاء...',
        'trainerStudioV2.ui.loading.priorities': 'جاري حساب الأولويات...',
        'trainerStudioV2.ui.loading.finance': 'جاري تحميل السجل المالي...',
        'trainerStudioV2.ui.loading.portal': 'جاري تحميل عملائك...',
        'trainerStudioV2.ui.loading.renewals': 'جاري تحليل الباقات...',
        'trainerStudioV2.ui.loading.settings': 'جاري تحميل إعدادات المساحة...',
        'trainerStudioV2.ui.loading.tasks': 'جاري تحميل المهام...',
        'trainerStudioV2.ui.loading.templates': 'جاري تحميل القوالب...',
        'trainerStudioV2.ui.loading.notifications': 'جاري تجميع التنبيهات...',
        'trainerStudioV2.ui.loading.goals': 'جاري تحميل الأهداف...',
        'trainerStudioV2.ui.sessions.title': 'جلساتك القادمة',
        'trainerStudioV2.ui.sessions.empty': 'لا توجد جلسات في الفترة الحالية.',
        'trainerStudioV2.ui.period': 'الفترة',
        'trainerStudioV2.ui.period.upcoming': 'القادمة',
        'trainerStudioV2.ui.period.today': 'اليوم',
        'trainerStudioV2.ui.period.week': '7 أيام',
        'trainerStudioV2.ui.period.month': '31 يومًا',
        'trainerStudioV2.ui.all': 'الكل',
        'trainerStudioV2.ui.scheduleSession': 'جدولة جلسة',
        'trainerStudioV2.ui.client': 'العميل',
        'trainerStudioV2.ui.planName': 'اسم الخطة',
        'trainerStudioV2.ui.startDate': 'تاريخ البداية',
        'trainerStudioV2.ui.duration': 'المدة',
        'trainerStudioV2.ui.mealName': 'اسم الوجبة',
        'trainerStudioV2.ui.food': 'الطعام',
        'trainerStudioV2.ui.quantity': 'الكمية',
        'trainerStudioV2.ui.unit': 'الوحدة',
        'trainerStudioV2.ui.targetCalories': 'السعرات المستهدفة',
        'trainerStudioV2.ui.targetProtein': 'البروتين المستهدف',
        'trainerStudioV2.ui.goal': 'الهدف',
        'trainerStudioV2.ui.level': 'المستوى',
        'trainerStudioV2.ui.beginner': 'مبتدئ',
        'trainerStudioV2.ui.intermediate': 'متوسط',
        'trainerStudioV2.ui.advanced': 'متقدم',
        'trainerStudioV2.ui.trainingDayName': 'اسم يوم التدريب',
        'trainerStudioV2.ui.dayOfWeek': 'يوم الأسبوع',
        'trainerStudioV2.ui.exercise': 'التمرين',
        'trainerStudioV2.ui.sets': 'المجموعات',
        'trainerStudioV2.ui.reps': 'التكرارات',
        'trainerStudioV2.ui.restSeconds': 'الراحة بالثواني',
        'trainerStudioV2.ui.savePlan': 'حفظ الخطة',
        'trainerStudioV2.ui.chooseExercise': 'اختر تمرينًا',
        'trainerStudioV2.ui.chooseFood': 'اختر طعامًا',
        'trainerStudioV2.ui.chooseClient': 'اختر العميل',
        'trainerStudioV2.ui.plan.training': 'إنشاء خطة تدريب',
        'trainerStudioV2.ui.plan.nutrition': 'إنشاء خطة تغذية',
        'trainerStudioV2.ui.plan.trainingList': 'خطط التدريب المحفوظة',
        'trainerStudioV2.ui.plan.nutritionList': 'خطط التغذية المحفوظة',
        'trainerStudioV2.ui.plan.emptyTraining': 'لا توجد خطط تدريب محفوظة.',
        'trainerStudioV2.ui.plan.emptyNutrition': 'لا توجد خطط تغذية محفوظة.',
        'trainerStudioV2.ui.plan.create': 'إنشاء خطة',
        'trainerStudioV2.ui.library.search': 'بحث في مكتبة المدرب',
        'trainerStudioV2.ui.library.searchExercises': 'بحث في التمارين',
        'trainerStudioV2.ui.library.searchPlaceholder': 'ابحث باسم التمرين أو الطعام أو العضلة...',
        'trainerStudioV2.ui.library.searchExercisePlaceholder': 'ابحث باسم التمرين أو العضلة...',
        'trainerStudioV2.ui.library.commonSafe': 'المكتبة المشتركة الآمنة',
        'trainerStudioV2.ui.library.title': 'مكتبة المدرب',
        'trainerStudioV2.ui.library.exercises': 'مكتبة التمارين',
        'trainerStudioV2.ui.library.source': 'المصدر المشترك الآمن',
        'trainerStudioV2.ui.library.description': 'نفس كتالوج الجيم، معزول داخل مساحة المدرب ويُستخدم مباشرة داخل محرر الخطط.',
        'trainerStudioV2.ui.library.helper': 'يعرض الكتالوج أول 100 عنصر مع دعم البحث داخل المصدر المشترك. اختر عنصرًا لاستخدامه في محرر الخطة.',
        'trainerStudioV2.ui.library.trainingProgram': 'إنشاء برنامج من المكتبة',
        'trainerStudioV2.ui.library.page': 'صفحة {{page}} من {{total}}',
        'trainerStudioV2.ui.previous': 'السابق',
        'trainerStudioV2.ui.next': 'التالي',
        'trainerStudioV2.ui.openProfile': 'فتح الملف',
        'trainerStudioV2.ui.financialRecord': 'السجل الحالي',
        'trainerStudioV2.ui.latestPayments': 'آخر الدفعات',
        'trainerStudioV2.ui.payment': 'دفعة',
        'trainerStudioV2.ui.issueFromClient': 'يُصدر من ملف العميل',
        'trainerStudioV2.ui.openCollections': 'فتح التحصيلات',
        'trainerStudioV2.ui.date.start': 'البداية',
        'trainerStudioV2.ui.date.end': 'الانتهاء',
        'trainerStudioV2.ui.noPlansAvailable': 'لا توجد خطط متاحة',
        'trainerStudioV2.ui.contactPlatform': 'تواصل مع إدارة المنصة لمعرفة الخيارات المتاحة.',
        'trainerStudioV2.ui.entitlement.label': 'الوصول حسب الباقة · {{feature}}',
        'trainerStudioV2.ui.entitlement.currentPlan': 'باقتك الحالية',
        'trainerStudioV2.ui.entitlement.viewPlans': 'عرض الخطط',
        'trainerStudioV2.ui.entitlement.notIncluded.title': 'هذه الميزة غير متاحة في باقتك الحالية',
        'trainerStudioV2.ui.entitlement.notIncluded.description': 'الميزة غير مشمولة في باقة {{plan}} الحالية. يمكنك مراجعة الخطط المتاحة للترقية.',
        'trainerStudioV2.ui.entitlement.expired.title': 'انتهى اشتراكك',
        'trainerStudioV2.ui.entitlement.expired.description': 'انتهت صلاحية اشتراك المنصة. جدّد الاشتراك لاستعادة المزايا دون فقد بياناتك.',
        'trainerStudioV2.ui.entitlement.suspended.title': 'تم إيقاف الحساب',
        'trainerStudioV2.ui.entitlement.suspended.description': 'تم إيقاف الوصول التشغيلي لهذا الحساب مؤقتًا. تواصل مع إدارة المنصة.',
        'trainerStudioV2.ui.entitlement.notReady.title': 'تعذر التحقق من مزايا الاشتراك',
        'trainerStudioV2.ui.entitlement.notReady.description': 'أعد المحاولة بعد لحظات.',
        'trainerStudioV2.ui.entitlement.pending.title': 'جارٍ التحقق من مزايا الاشتراك',
        'trainerStudioV2.ui.entitlement.pending.description': 'انتظر لحظة حتى نحدد المزايا المتاحة.',
        'trainerStudioV2.ui.entitlement.unavailable.title': 'الميزة غير متاحة حاليًا',
        'trainerStudioV2.ui.entitlement.unavailable.description': 'لا يمكن فتح {{feature}} بحالة الاشتراك الحالية.',
        'trainerStudioV2.ui.plan.fallbackName': 'خطة بدون اسم',
        'trainerStudioV2.ui.plan.fallbackClient': 'مرتبطة بعميل',
        'trainerStudioV2.ui.plan.fallbackDetails': 'بيانات محفوظة',
        'trainerStudioV2.ui.identity': 'الهوية',
        'trainerStudioV2.ui.settingsReadOnly': 'تفضيلات المظهر متاحة من زر الوضع في الشريط العلوي. بيانات الهوية لا يتم تعديلها من هذه الشاشة دون مسار إعدادات مدعوم.',
        'trainerStudioV2.ui.currentSubscription': 'الاشتراك الحالي',
        'trainerStudioV2.ui.durationLabel': 'المدة:',
        'trainerStudioV2.ui.savedPrice': 'السعر المحفوظ:',
        'trainerStudioV2.ui.subscriptionRequired': 'لا يمكن تشغيل مساحة المدرب بدون اشتراك صالح. راجع إدارة المنصة.',
        'trainerStudioV2.ui.platform': 'منصة Logic Fit',
        'trainerStudioV2.ui.availablePlans': 'الخطط المتاحة لمساحة المدرب',
        'trainerStudioV2.ui.plansDescription': 'اختر مدة الفوترة لمقارنة السعر والمزايا. القيم المعروضة مصدرها إعدادات المنصة الحالية.',
        'trainerStudioV2.ui.planCount': 'خطط',
        'trainerStudioV2.ui.dailyWorkCenter': 'مركز العمل اليومي',
        'trainerStudioV2.ui.tasksTitle': 'مهامك ومتابعاتك',
        'trainerStudioV2.ui.newTask': 'مهمة جديدة',
        'trainerStudioV2.ui.task': 'مهمة',
        'trainerStudioV2.ui.addFollowUp': 'إضافة متابعة',
        'trainerStudioV2.ui.taskTitle': 'العنوان',
        'trainerStudioV2.ui.taskType': 'النوع',
        'trainerStudioV2.ui.followUp': 'متابعة',
        'trainerStudioV2.ui.measurements': 'قياسات',
        'trainerStudioV2.ui.measurementCount': '{{count}} قياس',
        'trainerStudioV2.ui.lastMeasurementUpdate': 'آخر تحديث {{date}}',
        'trainerStudioV2.ui.noMeasurementRecorded': 'لم يسجل قياس بعد',
        'trainerStudioV2.ui.followUpReason.assessmentDue': 'قياس مستحق',
        'trainerStudioV2.ui.followUpReason.checkinDue': 'متابعة مستحقة',
        'trainerStudioV2.ui.followUpReason.packageExpiring': 'الباقة تقترب من الانتهاء',
        'trainerStudioV2.ui.followUpReason.paymentOutstanding': 'رصيد مستحق',
        'trainerStudioV2.ui.followUpNeeded': 'تحتاج متابعة',
        'trainerStudioV2.ui.followUpPresent': 'متابعة موجودة',
        'trainerStudioV2.ui.followUpsEmpty': 'لا توجد متابعات مستحقة حاليًا.',
        'trainerStudioV2.ui.operationsGridLabel': 'إدارة خدمات المدرب',
        'trainerStudioV2.ui.renewal.noExpiry': 'بدون تاريخ انتهاء',
        'trainerStudioV2.ui.renewal.expires': 'تنتهي {{date}}',
        'trainerStudioV2.ui.renewal.sessionsRemaining': '{{count}} جلسة متبقية',
        'trainerStudioV2.ui.action.openSales': 'فتح التحصيلات',
        'trainerStudioV2.ui.fallback.client': 'عميل',
        'trainerStudioV2.ui.fallback.trainingPackage': 'باقة تدريب',
        'trainerStudioV2.ui.renewalsEmpty': 'لا توجد باقات تحتاج متابعة حاليًا.',
        'trainerStudioV2.ui.finance.netRevenue': 'الإيراد الصافي',
        'trainerStudioV2.ui.finance.outstanding': 'الرصيد المستحق',
        'trainerStudioV2.ui.finance.payments': 'الدفعات المسجلة',
        'trainerStudioV2.ui.finance.refunds': 'الاستردادات',
        'trainerStudioV2.ui.finance.currentLedger': 'السجل الحالي',
        'trainerStudioV2.ui.finance.paymentCount': '{{count}} دفعة',
        'trainerStudioV2.ui.finance.emptyPayments': 'لا توجد دفعات مسجلة بعد.',
        'trainerStudioV2.ui.program': 'برنامج',
        'trainerStudioV2.ui.collections': 'تحصيل',
        'trainerStudioV2.ui.renewal': 'تجديد',
        'trainerStudioV2.ui.session': 'جلسة',
        'trainerStudioV2.ui.custom': 'مخصصة',
        'trainerStudioV2.ui.noClient': 'بدون عميل محدد',
        'trainerStudioV2.ui.dueDate': 'الموعد',
        'trainerStudioV2.ui.notes': 'ملاحظات',
        'trainerStudioV2.ui.saveTask': 'حفظ المهمة',
        'trainerStudioV2.ui.template.savedData': 'بيانات محفوظة وقابلة لإعادة الاستخدام',
        'trainerStudioV2.ui.createTemplate': 'إنشاء قالب',
        'trainerStudioV2.ui.templateType': 'نوع القالب',
        'trainerStudioV2.ui.templateName': 'اسم القالب',
        'trainerStudioV2.ui.description': 'الوصف',
        'trainerStudioV2.ui.jsonData': 'بيانات JSON',
        'trainerStudioV2.ui.jsonHint': 'يجب أن تكون كائنًا JSON صحيحًا يطابق عقد الخطة.',
        'trainerStudioV2.ui.saveTemplate': 'حفظ القالب',
        'trainerStudioV2.ui.draft.reviewable': 'مسودة قابلة للمراجعة',
        'trainerStudioV2.ui.draft.reviewRequired': 'مراجعة المدرب مطلوبة',
        'trainerStudioV2.ui.source': 'المصدر',
        'trainerStudioV2.ui.logicFitLibrary': 'مكتبة Logic Fit',
        'trainerStudioV2.ui.draft.empty': 'لا توجد عناصر في المسودة.',
        'trainerStudioV2.ui.warning.beforeApproval': 'تنبيه قبل الاعتماد',
        'trainerStudioV2.ui.draft.edit': 'تعديل على المسودة',
        'trainerStudioV2.ui.applyEdit': 'تطبيق التعديل',
        'trainerStudioV2.ui.draft.approveSave': 'اعتماد وحفظ المسودة',
        'trainerStudioV2.ui.draft.createAnother': 'إنشاء مسودة أخرى',
        'trainerStudioV2.ui.auto.safe': 'الإنشاء التلقائي الآمن',
        'trainerStudioV2.ui.auto.training': 'إنشاء برنامج تدريب تلقائيًا',
        'trainerStudioV2.ui.auto.nutrition': 'إنشاء خطة تغذية تلقائيًا',
        'trainerStudioV2.ui.auto.disclaimer': 'ستظل المسودة تحت مراجعتك قبل الحفظ.',
        'trainerStudioV2.ui.goal.general': 'لياقة عامة',
        'trainerStudioV2.ui.goal.strength': 'زيادة القوة',
        'trainerStudioV2.ui.goal.hypertrophy': 'بناء العضلات',
        'trainerStudioV2.ui.goal.fatLoss': 'خسارة الدهون',
        'trainerStudioV2.ui.goal.weightGain': 'زيادة الكتلة',
        'trainerStudioV2.ui.goal.mobility': 'المرونة والحركة',
        'trainerStudioV2.ui.mealsPerDay': 'عدد الوجبات اليومية',
        'trainerStudioV2.ui.weightKg': 'الوزن كجم',
        'trainerStudioV2.ui.heightCm': 'الطول سم',
        'trainerStudioV2.ui.age': 'العمر',
        'trainerStudioV2.ui.gender': 'النوع',
        'trainerStudioV2.ui.gender.male': 'ذكر',
        'trainerStudioV2.ui.gender.female': 'أنثى',
        'trainerStudioV2.ui.activity': 'النشاط',
        'trainerStudioV2.ui.activity.low': 'قليل',
        'trainerStudioV2.ui.activity.light': 'خفيف',
        'trainerStudioV2.ui.activity.high': 'مرتفع',
        'trainerStudioV2.ui.allergies': 'حساسيات/استبعادات',
        'trainerStudioV2.ui.trainingDays': 'أيام التدريب أسبوعيًا',
        'trainerStudioV2.ui.durationWeeks': 'المدة بالأسابيع',
        'trainerStudioV2.ui.limitations': 'قيود أو تمارين مستبعدة',
        'trainerStudioV2.ui.createDraftFromLibrary': 'إنشاء مسودة من المكتبة',
        'trainerStudioV2.ui.example.planName': 'مثال: برنامج القوة — المرحلة الأولى',
        'trainerStudioV2.ui.example.goal': 'مثال: بناء القوة',
        'trainerStudioV2.ui.example.allergies': 'مثال: مكسرات، لبن',
        'trainerStudioV2.ui.example.limitations': 'مثال: ركبة، قفز',
        'trainerStudioV2.ui.itemCount': '{{count}} عنصر',
        'trainerStudioV2.ui.exerciseCount': '{{count}} تمرين',
        'trainerStudioV2.ui.availableItemCount': '{{count}} عنصر متاح',
        'trainerStudioV2.ui.trainingFoodMeasurementCount': '{{training}} تدريب · {{nutrition}} تغذية · {{measurement}} قياس',
        'trainerStudioV2.ui.schedule.complete': 'إكمال',
        'trainerStudioV2.ui.schedule.cancel': 'إلغاء',
        'trainerStudioV2.ui.noOpenTasks': 'لا توجد مهام مفتوحة.',
        'trainerStudioV2.ui.taskCount': '{{count}} مهمة',
        'trainerStudioV2.ui.taskDue': 'الموعد {{date}}',
        'trainerStudioV2.ui.taskStatus.open': 'مفتوحة',
        'trainerStudioV2.ui.taskStatus.inProgress': 'قيد التنفيذ',
        'trainerStudioV2.ui.taskStatus.completed': 'مكتملة',
        'trainerStudioV2.ui.taskStatus.dismissed': 'مستبعدة',
        'trainerStudioV2.ui.taskType.followUp': 'متابعة',
        'trainerStudioV2.ui.taskType.measurement': 'قياسات',
        'trainerStudioV2.ui.taskType.program': 'برنامج',
        'trainerStudioV2.ui.taskType.payment': 'تحصيل',
        'trainerStudioV2.ui.taskType.renewal': 'تجديد',
        'trainerStudioV2.ui.taskType.session': 'جلسة',
        'trainerStudioV2.ui.taskType.custom': 'مخصصة',
        'trainerStudioV2.ui.task.due': 'تاريخ الاستحقاق',
        'trainerStudioV2.ui.task.dailyCenter': 'مركز العمل اليومي',
        'trainerStudioV2.ui.task.listTitle': 'مهامك ومتابعاتك',
        'trainerStudioV2.ui.task.new': 'مهمة جديدة',
        'trainerStudioV2.ui.task.addFollowUp': 'إضافة متابعة',
        'trainerStudioV2.ui.task.title': 'العنوان',
        'trainerStudioV2.ui.task.type': 'النوع',
        'trainerStudioV2.ui.task.client': 'العميل',
        'trainerStudioV2.ui.task.noClient': 'بدون عميل محدد',
        'trainerStudioV2.ui.task.selectClient': 'اختر العميل',
        'trainerStudioV2.ui.task.notes': 'ملاحظات',
        'trainerStudioV2.ui.task.nextStep': 'ما الخطوة التالية؟',
        'trainerStudioV2.ui.task.titleExample': 'مثال: مراجعة خطة العميل',
        'trainerStudioV2.ui.task.save': 'حفظ المهمة',
        'trainerStudioV2.ui.task.cancel': 'إلغاء',
        'trainerStudioV2.ui.task.complete': 'إكمال',
        'trainerStudioV2.ui.task.dismiss': 'استبعاد',
        'trainerStudioV2.ui.createTaskHint': 'أنشئ تذكيرًا واضحًا للمتابعة أو التحصيل أو تجهيز برنامج عميل.',
        'trainerStudioV2.ui.addGoal': 'إضافة هدف',
        'trainerStudioV2.ui.measurableFollowUp': 'متابعة قابلة للقياس',
        'trainerStudioV2.ui.notification.open': 'فتح',
        'trainerStudioV2.ui.task.dismiss': 'استبعاد',
        'trainerStudioV2.ui.loadFailure': 'تعذر تحميل هذه المساحة',
        'trainerStudioV2.ui.tryAgain': 'حاول تحديث الصفحة مرة أخرى.',
        'trainerStudioV2.ui.planStatus.active': 'نشطة',
        'trainerStudioV2.ui.planStatus.archived': 'مؤرشفة',
        'trainerStudioV2.ui.reactivate': 'إعادة تفعيل',
        'trainerStudioV2.ui.archive': 'أرشفة',
        'trainerStudioV2.ui.submitForReview': 'إرسال للمراجعة',
        'trainerStudioV2.ui.approve': 'اعتماد',
        'trainerStudioV2.ui.reject': 'رفض',
        'trainerStudioV2.ui.save': 'حفظ',
        'trainerStudioV2.ui.edit': 'تعديل',
        'trainerStudioV2.ui.delete': 'حذف',
        'trainerStudioV2.ui.search': 'بحث',
        'trainerStudioV2.ui.refresh': 'تحديث',
        'trainerStudioV2.ui.filters': 'الفلاتر',
        'trainerStudioV2.ui.status': 'الحالة',
        'trainerStudioV2.ui.amount': 'المبلغ',
        'trainerStudioV2.ui.date': 'التاريخ',
        'trainerStudioV2.ui.clientName': 'اسم العميل',
        'trainerStudioV2.ui.noData': 'لا توجد بيانات متاحة حاليًا.',
        'trainerStudioV2.plan.dataBacked': 'عملية مرتبطة ببيانات فعلية',
        'trainerStudioV2.plan.createTraining': 'إنشاء خطة تدريب', 'trainerStudioV2.plan.createNutrition': 'إنشاء خطة تغذية',
        'trainerStudioV2.plan.client': 'العميل', 'trainerStudioV2.plan.name': 'اسم الخطة',
        'trainerStudioV2.plan.startDate': 'تاريخ البداية', 'trainerStudioV2.plan.duration': 'المدة',
        'trainerStudioV2.plan.days': 'بالأيام', 'trainerStudioV2.plan.weeks': 'بالأسابيع',
        'trainerStudioV2.plan.mealName': 'اسم الوجبة', 'trainerStudioV2.plan.food': 'الطعام',
        'trainerStudioV2.plan.quantity': 'الكمية', 'trainerStudioV2.plan.unit': 'الوحدة',
        'trainerStudioV2.plan.targetCalories': 'السعرات المستهدفة', 'trainerStudioV2.plan.targetProtein': 'البروتين المستهدف',
        'trainerStudioV2.plan.goal': 'الهدف', 'trainerStudioV2.plan.level': 'المستوى',
        'trainerStudioV2.plan.routineName': 'اسم يوم التدريب', 'trainerStudioV2.plan.dayOfWeek': 'يوم الأسبوع',
        'trainerStudioV2.plan.exercise': 'التمرين', 'trainerStudioV2.plan.sets': 'المجموعات',
        'trainerStudioV2.plan.reps': 'التكرارات', 'trainerStudioV2.plan.restSeconds': 'الراحة بالثواني',
        'trainerStudioV2.plan.level.beginner': 'مبتدئ', 'trainerStudioV2.plan.level.intermediate': 'متوسط',
        'trainerStudioV2.plan.level.advanced': 'متقدم', 'trainerStudioV2.plan.save': 'حفظ الخطة',
        'trainerStudioV2.ui.close': 'إغلاق'
    });

    const trainerStudioV2English = Object.freeze({
        'memberSubscriptionRequests.action.approving': 'Approving…',
        'memberSubscriptionRequests.action.rejecting': 'Rejecting…',
        'trainerStudioV2.shell.topbar': 'Trainer Studio top bar', 'trainerStudioV2.shell.sidebar': 'Trainer Studio navigation',
        'trainerStudioV2.shell.openNavigation': 'Open Trainer Studio navigation', 'trainerStudioV2.shell.closeNavigation': 'Close navigation',
        'trainerStudioV2.shell.privateWorkspace': 'Private and secure workspace', 'trainerStudioV2.shell.workspaceStatus': 'Private workspace',
        'trainerStudioV2.shell.logout': 'Sign out', 'trainerStudioV2.shell.enableDark': 'Enable dark theme',
        'trainerStudioV2.shell.enableLight': 'Enable light theme', 'trainerStudioV2.shell.dashboardData': 'Your training workspace data',
        'trainerStudioV2.group.daily': 'Daily work', 'trainerStudioV2.group.training': 'Training and follow-up',
        'trainerStudioV2.group.business': 'Business', 'trainerStudioV2.group.workspace': 'Workspace',
        'trainerStudioV2.route.dashboard': 'Dashboard', 'trainerStudioV2.route.clients': 'Clients',
        'trainerStudioV2.route.calendar': 'Calendar', 'trainerStudioV2.route.sessions': 'Sessions',
        'trainerStudioV2.route.training': 'Training plans', 'trainerStudioV2.route.nutrition': 'Nutrition plans',
        'trainerStudioV2.route.exercises': 'Exercise library', 'trainerStudioV2.route.muscles': 'Muscles',
        'trainerStudioV2.route.foods': 'Food library', 'trainerStudioV2.route.measurements': 'Measurements',
        'trainerStudioV2.route.progress': 'Progress', 'trainerStudioV2.route.checkins': 'Check-ins',
        'trainerStudioV2.route.goals': 'Goals', 'trainerStudioV2.route.packages': 'Packages',
        'trainerStudioV2.route.sales': 'Sales and collections', 'trainerStudioV2.route.renewals': 'Renewals',
        'trainerStudioV2.route.finance': 'Finance', 'trainerStudioV2.route.reports': 'Reports',
        'trainerStudioV2.route.portal': 'Client portal', 'trainerStudioV2.route.notifications': 'Notifications',
        'trainerStudioV2.route.tasks': 'Tasks', 'trainerStudioV2.route.templates': 'Templates',
        'trainerStudioV2.route.settings': 'Settings', 'trainerStudioV2.eyebrow.dashboard': 'Trainer workspace',
        'trainerStudioV2.eyebrow.dailyWork': 'Daily operations', 'trainerStudioV2.eyebrow.training': 'Training and follow-up',
        'trainerStudioV2.eyebrow.execution': 'Delivery', 'trainerStudioV2.eyebrow.programming': 'Training programs',
        'trainerStudioV2.eyebrow.nutrition': 'Nutrition', 'trainerStudioV2.eyebrow.library': 'Library',
        'trainerStudioV2.eyebrow.bodyMap': 'Body map', 'trainerStudioV2.eyebrow.assessment': 'Assessment',
        'trainerStudioV2.eyebrow.results': 'Results', 'trainerStudioV2.eyebrow.clientCare': 'Client care',
        'trainerStudioV2.eyebrow.services': 'Services', 'trainerStudioV2.eyebrow.revenue': 'Revenue',
        'trainerStudioV2.eyebrow.retention': 'Client retention', 'trainerStudioV2.eyebrow.finance': 'Financial overview',
        'trainerStudioV2.eyebrow.activity': 'Activity insights', 'trainerStudioV2.eyebrow.clientExperience': 'Client experience',
        'trainerStudioV2.eyebrow.actionCenter': 'Action center', 'trainerStudioV2.eyebrow.trainerLibrary': 'Trainer library',
        'trainerStudioV2.eyebrow.workspace': 'Workspace management',
        'trainerStudioV2.dashboard.welcomeKicker': 'Independent workspace', 'trainerStudioV2.dashboard.welcomeLead': 'Start strong,',
        'trainerStudioV2.dashboard.welcomeFallback': 'trainer',
        'trainerStudioV2.dashboard.welcomeDescription': 'Start with your upcoming sessions, then follow up with clients who need your attention.',
        'trainerStudioV2.dashboard.dataUpdated': 'Data updated from the trainer workspace', 'trainerStudioV2.dashboard.metricsLabel': 'Trainer metrics',
        'trainerStudioV2.dashboard.clientsBase': 'Client base', 'trainerStudioV2.dashboard.activeClients': 'Active clients',
        'trainerStudioV2.dashboard.todayRhythm': 'Today’s rhythm', 'trainerStudioV2.dashboard.todaySessions': 'Today’s sessions',
        'trainerStudioV2.dashboard.upcoming': 'Upcoming appointments', 'trainerStudioV2.dashboard.scheduledSessions': 'Scheduled sessions',
        'trainerStudioV2.dashboard.businessAlert': 'Business alert', 'trainerStudioV2.dashboard.expiringPackages': 'Packages expiring soon',
        'trainerStudioV2.dashboard.collections': 'Collections', 'trainerStudioV2.dashboard.outstanding': 'Outstanding balances',
        'trainerStudioV2.dashboard.quickKicker': 'Work shortcuts', 'trainerStudioV2.dashboard.quickTitle': 'Your next step',
        'trainerStudioV2.dashboard.addClient': 'Add client', 'trainerStudioV2.dashboard.addClientDescription': 'Create a new training profile',
        'trainerStudioV2.dashboard.scheduleSession': 'Schedule session', 'trainerStudioV2.dashboard.scheduleDescription': 'Plan your next appointment',
        'trainerStudioV2.dashboard.createPackage': 'Create package', 'trainerStudioV2.dashboard.packageDescription': 'Offer a clear service to your clients',
        'trainerStudioV2.dashboard.todayKicker': 'Your daily schedule', 'trainerStudioV2.dashboard.sessionsTitle': 'Today and upcoming sessions',
        'trainerStudioV2.dashboard.sessionsDescription': 'Track the appointment and status, then take the right action in one place.',
        'trainerStudioV2.dashboard.scheduleAction': 'Schedule session', 'trainerStudioV2.dashboard.followupKicker': 'Follow-up signals',
        'trainerStudioV2.dashboard.followupTitle': 'Clients who need you', 'trainerStudioV2.dashboard.followupDescription': 'Real figures from your private training profiles.',
        'trainerStudioV2.dashboard.followupItem': 'Client needs follow-up', 'trainerStudioV2.dashboard.measurements': 'Measurements in the last 30 days',
        'trainerStudioV2.dashboard.checkins': 'Check-ins in the last 14 days',
        'trainerStudioV2.dashboard.priorityNote': 'Priorities are calculated only from clients, sessions, packages, and collections in your trainer workspace.',
        'trainerStudioV2.dashboard.sessionsList': 'Upcoming sessions list', 'trainerStudioV2.dashboard.sessionCount': '{{count}} sessions', 'trainerStudioV2.dashboard.noSessions': 'No sessions are scheduled for this period.',
        'trainerStudioV2.dashboard.noSessionsHint': 'Upcoming sessions will appear here after they are scheduled.',
        'trainerStudioV2.dashboard.session.scheduled': 'Scheduled', 'trainerStudioV2.dashboard.session.completed': 'Completed',
        'trainerStudioV2.dashboard.session.cancelled': 'Cancelled', 'trainerStudioV2.dashboard.session.noShow': 'No show',
        'trainerStudioV2.dashboard.session.complete': 'Complete', 'trainerStudioV2.dashboard.session.cancel': 'Cancel',
        'trainerStudioV2.dashboard.workspaceLoading': 'Verifying your workspace…',
        'trainerStudioV2.dashboard.workspaceReady': 'Your workspace is ready with the data available to your account.',
        'trainerStudioV2.dashboard.workspaceError': 'Could not load the workspace.',
        'trainerStudioV2.description.clients': 'Organized training profiles from first contact through follow-up.',
        'trainerStudioV2.description.calendar': 'Upcoming session appointments in one workspace.',
        'trainerStudioV2.description.sessions': 'Review sessions, their status, and package links.',
        'trainerStudioV2.description.training': 'Saved plans for your clients from the current source.',
        'trainerStudioV2.description.nutrition': 'Nutrition plans linked to client profiles.',
        'trainerStudioV2.description.exercises': 'Illustrated exercises ready to use in training programs.',
        'trainerStudioV2.description.muscles': 'Explore target muscles, images, and body regions.',
        'trainerStudioV2.description.foods': 'Foods and ingredients with their current nutrition values.',
        'trainerStudioV2.description.measurements': 'Clients’ latest measurements and profile update dates.',
        'trainerStudioV2.description.progress': 'Training indicators and measurements actually recorded.',
        'trainerStudioV2.description.checkins': 'Clients who need a follow-up step from you.',
        'trainerStudioV2.description.goals': 'Measurable goals linked to each client.',
        'trainerStudioV2.description.packages': 'Training services, prices, and durations.',
        'trainerStudioV2.description.sales': 'Package purchases, paid amounts, and balances.',
        'trainerStudioV2.description.renewals': 'Packages that need a renewal decision or collection follow-up.',
        'trainerStudioV2.description.finance': 'Collections and balances from the current ledger.',
        'trainerStudioV2.description.reports': 'Training performance for the selected period.',
        'trainerStudioV2.description.portal': 'Issue client access and review the training experience.',
        'trainerStudioV2.description.notifications': 'Session, follow-up, and package notifications.',
        'trainerStudioV2.description.tasks': 'Tasks linked to clients and follow-up dates.',
        'trainerStudioV2.description.templates': 'Saved templates to reuse safely with clients.',
        'trainerStudioV2.description.settings': 'Available workspace, subscription, and preference details.',
        'trainerStudioV2.ui.dataSource': 'Current data source',
        'trainerStudioV2.ui.heading.followUps': 'Follow-up center',
        'trainerStudioV2.ui.heading.renewals': 'Renewals center',
        'trainerStudioV2.ui.heading.clientPortal': 'Client portal access',
        'trainerStudioV2.ui.heading.actionCenter': 'Action center',
        'trainerStudioV2.ui.heading.templates': 'Template library',
        'trainerStudioV2.ui.templates.emptyDescription': 'Save a training or nutrition template to get started.',
        'trainerStudioV2.ui.templates.emptyTitle': 'No saved templates yet.',
        'trainerStudioV2.ui.goals.emptyDescription': 'Add a goal and link it to a client to track progress.',
        'trainerStudioV2.ui.goals.emptyTitle': 'No goals recorded yet',
        'trainerStudioV2.ui.goalStatus.active': 'Active',
        'trainerStudioV2.ui.goalStatus.completed': 'Completed',
        'trainerStudioV2.ui.goalStatus.paused': 'Paused',
        'trainerStudioV2.ui.goalStatus.archived': 'Archived',
        'trainerStudioV2.ui.goalType.performance': 'Performance',
        'trainerStudioV2.ui.goalType.custom': 'Custom',
        'trainerStudioV2.ui.goalAction.markComplete': 'Mark complete',
        'trainerStudioV2.ui.deadline': 'Due',
        'trainerStudioV2.ui.goal.valueUnset': 'Value not set',
        'trainerStudioV2.ui.item': 'items',
        'trainerStudioV2.ui.currentData': 'Action based on current data',
        'trainerStudioV2.ui.close': 'Close',
        'trainerStudioV2.ui.cancel': 'Cancel',
        'trainerStudioV2.ui.retry': 'Try again',
        'trainerStudioV2.ui.loading.schedule': 'Loading schedule…',
        'trainerStudioV2.ui.loading.plan': 'Preparing the form…',
        'trainerStudioV2.ui.loading.plans': 'Loading plans…',
        'trainerStudioV2.ui.loading.library': 'Preparing the visual library…',
        'trainerStudioV2.ui.loading.clients': 'Loading client profiles…',
        'trainerStudioV2.ui.loading.priorities': 'Calculating priorities…',
        'trainerStudioV2.ui.loading.finance': 'Loading the financial ledger…',
        'trainerStudioV2.ui.loading.portal': 'Loading your clients…',
        'trainerStudioV2.ui.loading.renewals': 'Reviewing packages…',
        'trainerStudioV2.ui.loading.settings': 'Loading workspace settings…',
        'trainerStudioV2.ui.loading.tasks': 'Loading tasks…',
        'trainerStudioV2.ui.loading.templates': 'Loading templates…',
        'trainerStudioV2.ui.loading.notifications': 'Loading notifications…',
        'trainerStudioV2.ui.loading.goals': 'Loading goals…',
        'trainerStudioV2.ui.sessions.title': 'Your upcoming sessions',
        'trainerStudioV2.ui.sessions.empty': 'There are no sessions in this period.',
        'trainerStudioV2.ui.period': 'Period',
        'trainerStudioV2.ui.period.upcoming': 'Upcoming',
        'trainerStudioV2.ui.period.today': 'Today',
        'trainerStudioV2.ui.period.week': '7 days',
        'trainerStudioV2.ui.period.month': '31 days',
        'trainerStudioV2.ui.all': 'All',
        'trainerStudioV2.ui.scheduleSession': 'Schedule session',
        'trainerStudioV2.ui.client': 'Client',
        'trainerStudioV2.ui.planName': 'Plan name',
        'trainerStudioV2.ui.startDate': 'Start date',
        'trainerStudioV2.ui.duration': 'Duration',
        'trainerStudioV2.ui.mealName': 'Meal name',
        'trainerStudioV2.ui.food': 'Food',
        'trainerStudioV2.ui.quantity': 'Quantity',
        'trainerStudioV2.ui.unit': 'Unit',
        'trainerStudioV2.ui.targetCalories': 'Target calories',
        'trainerStudioV2.ui.targetProtein': 'Target protein',
        'trainerStudioV2.ui.goal': 'Goal',
        'trainerStudioV2.ui.level': 'Level',
        'trainerStudioV2.ui.beginner': 'Beginner',
        'trainerStudioV2.ui.intermediate': 'Intermediate',
        'trainerStudioV2.ui.advanced': 'Advanced',
        'trainerStudioV2.ui.trainingDayName': 'Training day name',
        'trainerStudioV2.ui.dayOfWeek': 'Day of week',
        'trainerStudioV2.ui.exercise': 'Exercise',
        'trainerStudioV2.ui.sets': 'Sets',
        'trainerStudioV2.ui.reps': 'Repetitions',
        'trainerStudioV2.ui.restSeconds': 'Rest (seconds)',
        'trainerStudioV2.ui.savePlan': 'Save plan',
        'trainerStudioV2.ui.chooseExercise': 'Choose an exercise',
        'trainerStudioV2.ui.chooseFood': 'Choose a food',
        'trainerStudioV2.ui.chooseClient': 'Choose a client',
        'trainerStudioV2.ui.plan.training': 'Create training plan',
        'trainerStudioV2.ui.plan.nutrition': 'Create nutrition plan',
        'trainerStudioV2.ui.plan.trainingList': 'Saved training plans',
        'trainerStudioV2.ui.plan.nutritionList': 'Saved nutrition plans',
        'trainerStudioV2.ui.plan.emptyTraining': 'There are no saved training plans.',
        'trainerStudioV2.ui.plan.emptyNutrition': 'There are no saved nutrition plans.',
        'trainerStudioV2.ui.plan.create': 'Create plan',
        'trainerStudioV2.ui.library.search': 'Search trainer library',
        'trainerStudioV2.ui.library.searchExercises': 'Search exercises',
        'trainerStudioV2.ui.library.searchPlaceholder': 'Search by exercise, food, or muscle…',
        'trainerStudioV2.ui.library.searchExercisePlaceholder': 'Search by exercise or muscle…',
        'trainerStudioV2.ui.library.commonSafe': 'Shared secure library',
        'trainerStudioV2.ui.library.title': 'Trainer library',
        'trainerStudioV2.ui.library.exercises': 'Exercise library',
        'trainerStudioV2.ui.library.source': 'Shared secure source',
        'trainerStudioV2.ui.library.description': 'The same gym catalog, isolated within the trainer workspace and used directly in the plan editor.',
        'trainerStudioV2.ui.library.helper': 'The catalog shows the first 100 items and supports searching the shared source. Choose an item to use in the plan editor.',
        'trainerStudioV2.ui.library.trainingProgram': 'Create a program from the library',
        'trainerStudioV2.ui.library.page': 'Page {{page}} of {{total}}',
        'trainerStudioV2.ui.previous': 'Previous',
        'trainerStudioV2.ui.next': 'Next',
        'trainerStudioV2.ui.openProfile': 'Open profile',
        'trainerStudioV2.ui.financialRecord': 'Current ledger',
        'trainerStudioV2.ui.latestPayments': 'Latest payments',
        'trainerStudioV2.ui.payment': 'payment',
        'trainerStudioV2.ui.issueFromClient': 'Issued from the client profile',
        'trainerStudioV2.ui.openCollections': 'Open collections',
        'trainerStudioV2.ui.date.start': 'Start',
        'trainerStudioV2.ui.date.end': 'End',
        'trainerStudioV2.ui.noPlansAvailable': 'No plans are available',
        'trainerStudioV2.ui.contactPlatform': 'Contact the platform administrator to review the available options.',
        'trainerStudioV2.ui.entitlement.label': 'Plan access · {{feature}}',
        'trainerStudioV2.ui.entitlement.currentPlan': 'your current plan',
        'trainerStudioV2.ui.entitlement.viewPlans': 'View plans',
        'trainerStudioV2.ui.entitlement.notIncluded.title': 'This feature is not included in your current plan',
        'trainerStudioV2.ui.entitlement.notIncluded.description': 'This feature is not included in the current {{plan}} plan. Review available plans to upgrade.',
        'trainerStudioV2.ui.entitlement.expired.title': 'Your subscription has expired',
        'trainerStudioV2.ui.entitlement.expired.description': 'The platform subscription has expired. Renew it to restore features without losing your data.',
        'trainerStudioV2.ui.entitlement.suspended.title': 'Account suspended',
        'trainerStudioV2.ui.entitlement.suspended.description': 'Operational access to this account has been temporarily suspended. Contact the platform administrator.',
        'trainerStudioV2.ui.entitlement.notReady.title': 'Could not verify subscription features',
        'trainerStudioV2.ui.entitlement.notReady.description': 'Please try again in a moment.',
        'trainerStudioV2.ui.entitlement.pending.title': 'Verifying subscription features',
        'trainerStudioV2.ui.entitlement.pending.description': 'Please wait while we determine the available features.',
        'trainerStudioV2.ui.entitlement.unavailable.title': 'This feature is currently unavailable',
        'trainerStudioV2.ui.entitlement.unavailable.description': 'Cannot open {{feature}} with the current subscription status.',
        'trainerStudioV2.ui.plan.fallbackName': 'Untitled plan',
        'trainerStudioV2.ui.plan.fallbackClient': 'Linked to a client',
        'trainerStudioV2.ui.plan.fallbackDetails': 'Saved data',
        'trainerStudioV2.ui.identity': 'Identity',
        'trainerStudioV2.ui.settingsReadOnly': 'Appearance preferences are available from the theme button above. Identity details cannot be changed here without a supported settings flow.',
        'trainerStudioV2.ui.currentSubscription': 'Current subscription',
        'trainerStudioV2.ui.durationLabel': 'Duration:',
        'trainerStudioV2.ui.savedPrice': 'Saved price:',
        'trainerStudioV2.ui.subscriptionRequired': 'Trainer Studio requires a valid subscription. Contact the platform administrator.',
        'trainerStudioV2.ui.platform': 'Logic Fit platform',
        'trainerStudioV2.ui.availablePlans': 'Plans available for Trainer Studio',
        'trainerStudioV2.ui.plansDescription': 'Choose a billing term to compare prices and features. Displayed values come from current platform settings.',
        'trainerStudioV2.ui.planCount': 'plans',
        'trainerStudioV2.ui.dailyWorkCenter': 'Daily work center',
        'trainerStudioV2.ui.tasksTitle': 'Your tasks and follow-ups',
        'trainerStudioV2.ui.newTask': 'New task',
        'trainerStudioV2.ui.task': 'task',
        'trainerStudioV2.ui.addFollowUp': 'Add follow-up',
        'trainerStudioV2.ui.taskTitle': 'Title',
        'trainerStudioV2.ui.taskType': 'Type',
        'trainerStudioV2.ui.followUp': 'Follow-up',
        'trainerStudioV2.ui.measurements': 'Measurements',
        'trainerStudioV2.ui.measurementCount': '{{count}} measurements',
        'trainerStudioV2.ui.lastMeasurementUpdate': 'Last updated {{date}}',
        'trainerStudioV2.ui.noMeasurementRecorded': 'No measurement recorded yet',
        'trainerStudioV2.ui.followUpReason.assessmentDue': 'Assessment due',
        'trainerStudioV2.ui.followUpReason.checkinDue': 'Check-in due',
        'trainerStudioV2.ui.followUpReason.packageExpiring': 'Package expiring soon',
        'trainerStudioV2.ui.followUpReason.paymentOutstanding': 'Outstanding balance',
        'trainerStudioV2.ui.followUpNeeded': 'Follow-up needed',
        'trainerStudioV2.ui.followUpPresent': 'Follow-up recorded',
        'trainerStudioV2.ui.followUpsEmpty': 'There are no follow-ups due right now.',
        'trainerStudioV2.ui.operationsGridLabel': 'Trainer services and operations',
        'trainerStudioV2.ui.renewal.noExpiry': 'No expiry date',
        'trainerStudioV2.ui.renewal.expires': 'Expires {{date}}',
        'trainerStudioV2.ui.renewal.sessionsRemaining': '{{count}} sessions remaining',
        'trainerStudioV2.ui.action.openSales': 'Open sales',
        'trainerStudioV2.ui.fallback.client': 'Client',
        'trainerStudioV2.ui.fallback.trainingPackage': 'Training package',
        'trainerStudioV2.ui.renewalsEmpty': 'No packages currently need follow-up.',
        'trainerStudioV2.ui.finance.netRevenue': 'Net revenue',
        'trainerStudioV2.ui.finance.outstanding': 'Outstanding balance',
        'trainerStudioV2.ui.finance.payments': 'Recorded payments',
        'trainerStudioV2.ui.finance.refunds': 'Refunds',
        'trainerStudioV2.ui.finance.currentLedger': 'Current ledger',
        'trainerStudioV2.ui.finance.paymentCount': '{{count}} payments',
        'trainerStudioV2.ui.finance.emptyPayments': 'No payments recorded yet.',
        'trainerStudioV2.ui.program': 'Program',
        'trainerStudioV2.ui.collections': 'Collections',
        'trainerStudioV2.ui.renewal': 'Renewal',
        'trainerStudioV2.ui.session': 'Session',
        'trainerStudioV2.ui.custom': 'Custom',
        'trainerStudioV2.ui.noClient': 'No client selected',
        'trainerStudioV2.ui.dueDate': 'Due date',
        'trainerStudioV2.ui.notes': 'Notes',
        'trainerStudioV2.ui.saveTask': 'Save task',
        'trainerStudioV2.ui.template.savedData': 'Saved and reusable data',
        'trainerStudioV2.ui.createTemplate': 'Create template',
        'trainerStudioV2.ui.templateType': 'Template type',
        'trainerStudioV2.ui.templateName': 'Template name',
        'trainerStudioV2.ui.description': 'Description',
        'trainerStudioV2.ui.jsonData': 'JSON data',
        'trainerStudioV2.ui.jsonHint': 'Enter a valid JSON object that matches the plan contract.',
        'trainerStudioV2.ui.saveTemplate': 'Save template',
        'trainerStudioV2.ui.draft.reviewable': 'Reviewable draft',
        'trainerStudioV2.ui.draft.reviewRequired': 'Trainer review required',
        'trainerStudioV2.ui.source': 'Source',
        'trainerStudioV2.ui.logicFitLibrary': 'Logic Fit library',
        'trainerStudioV2.ui.draft.empty': 'There are no items in this draft.',
        'trainerStudioV2.ui.warning.beforeApproval': 'Review before approval',
        'trainerStudioV2.ui.draft.edit': 'Edit draft',
        'trainerStudioV2.ui.applyEdit': 'Apply changes',
        'trainerStudioV2.ui.draft.approveSave': 'Approve and save draft',
        'trainerStudioV2.ui.draft.createAnother': 'Create another draft',
        'trainerStudioV2.ui.auto.safe': 'Safe automatic generation',
        'trainerStudioV2.ui.auto.training': 'Generate a training program automatically',
        'trainerStudioV2.ui.auto.nutrition': 'Generate a nutrition plan automatically',
        'trainerStudioV2.ui.auto.disclaimer': 'The draft remains under your review before saving.',
        'trainerStudioV2.ui.goal.general': 'General fitness',
        'trainerStudioV2.ui.goal.strength': 'Increase strength',
        'trainerStudioV2.ui.goal.hypertrophy': 'Build muscle',
        'trainerStudioV2.ui.goal.fatLoss': 'Fat loss',
        'trainerStudioV2.ui.goal.weightGain': 'Weight gain',
        'trainerStudioV2.ui.goal.mobility': 'Mobility and flexibility',
        'trainerStudioV2.ui.mealsPerDay': 'Meals per day',
        'trainerStudioV2.ui.weightKg': 'Weight (kg)',
        'trainerStudioV2.ui.heightCm': 'Height (cm)',
        'trainerStudioV2.ui.age': 'Age',
        'trainerStudioV2.ui.gender': 'Gender',
        'trainerStudioV2.ui.gender.male': 'Male',
        'trainerStudioV2.ui.gender.female': 'Female',
        'trainerStudioV2.ui.activity': 'Activity',
        'trainerStudioV2.ui.activity.low': 'Low',
        'trainerStudioV2.ui.activity.light': 'Light',
        'trainerStudioV2.ui.activity.high': 'High',
        'trainerStudioV2.ui.allergies': 'Allergies / exclusions',
        'trainerStudioV2.ui.trainingDays': 'Training days per week',
        'trainerStudioV2.ui.durationWeeks': 'Duration in weeks',
        'trainerStudioV2.ui.limitations': 'Limitations or excluded exercises',
        'trainerStudioV2.ui.createDraftFromLibrary': 'Create draft from library',
        'trainerStudioV2.ui.example.planName': 'Example: Strength program — phase one',
        'trainerStudioV2.ui.example.goal': 'Example: Build strength',
        'trainerStudioV2.ui.example.allergies': 'Example: nuts, dairy',
        'trainerStudioV2.ui.example.limitations': 'Example: knee, jumping',
        'trainerStudioV2.ui.itemCount': '{{count}} items',
        'trainerStudioV2.ui.exerciseCount': '{{count}} exercises',
        'trainerStudioV2.ui.availableItemCount': '{{count}} available items',
        'trainerStudioV2.ui.trainingFoodMeasurementCount': '{{training}} training · {{nutrition}} nutrition · {{measurement}} measurements',
        'trainerStudioV2.ui.schedule.complete': 'Complete',
        'trainerStudioV2.ui.schedule.cancel': 'Cancel',
        'trainerStudioV2.ui.noOpenTasks': 'There are no open tasks.',
        'trainerStudioV2.ui.taskCount': '{{count}} tasks',
        'trainerStudioV2.ui.taskDue': 'Due {{date}}',
        'trainerStudioV2.ui.taskStatus.open': 'Open',
        'trainerStudioV2.ui.taskStatus.inProgress': 'In progress',
        'trainerStudioV2.ui.taskStatus.completed': 'Completed',
        'trainerStudioV2.ui.taskStatus.dismissed': 'Dismissed',
        'trainerStudioV2.ui.taskType.followUp': 'Follow-up',
        'trainerStudioV2.ui.taskType.measurement': 'Measurements',
        'trainerStudioV2.ui.taskType.program': 'Program',
        'trainerStudioV2.ui.taskType.payment': 'Collection',
        'trainerStudioV2.ui.taskType.renewal': 'Renewal',
        'trainerStudioV2.ui.taskType.session': 'Session',
        'trainerStudioV2.ui.taskType.custom': 'Custom',
        'trainerStudioV2.ui.task.due': 'Due date',
        'trainerStudioV2.ui.task.dailyCenter': 'Daily work center',
        'trainerStudioV2.ui.task.listTitle': 'Your tasks and follow-ups',
        'trainerStudioV2.ui.task.new': 'New task',
        'trainerStudioV2.ui.task.addFollowUp': 'Add follow-up',
        'trainerStudioV2.ui.task.title': 'Title',
        'trainerStudioV2.ui.task.type': 'Type',
        'trainerStudioV2.ui.task.client': 'Client',
        'trainerStudioV2.ui.task.noClient': 'No specific client',
        'trainerStudioV2.ui.task.selectClient': 'Select a client',
        'trainerStudioV2.ui.task.notes': 'Notes',
        'trainerStudioV2.ui.task.nextStep': 'What is the next step?',
        'trainerStudioV2.ui.task.titleExample': 'Example: Review the client plan',
        'trainerStudioV2.ui.task.save': 'Save task',
        'trainerStudioV2.ui.task.cancel': 'Cancel',
        'trainerStudioV2.ui.task.complete': 'Complete',
        'trainerStudioV2.ui.task.dismiss': 'Dismiss',
        'trainerStudioV2.ui.createTaskHint': 'Create a clear reminder for follow-up, collection, or preparing a client program.',
        'trainerStudioV2.ui.addGoal': 'Add goal',
        'trainerStudioV2.ui.measurableFollowUp': 'Measurable follow-up',
        'trainerStudioV2.ui.notification.open': 'Open',
        'trainerStudioV2.ui.task.dismiss': 'Dismiss',
        'trainerStudioV2.ui.loadFailure': 'Could not load this workspace',
        'trainerStudioV2.ui.tryAgain': 'Try refreshing the page.',
        'trainerStudioV2.ui.planStatus.active': 'Active',
        'trainerStudioV2.ui.planStatus.archived': 'Archived',
        'trainerStudioV2.ui.reactivate': 'Reactivate',
        'trainerStudioV2.ui.archive': 'Archive',
        'trainerStudioV2.ui.submitForReview': 'Submit for review',
        'trainerStudioV2.ui.approve': 'Approve',
        'trainerStudioV2.ui.reject': 'Reject',
        'trainerStudioV2.ui.save': 'Save',
        'trainerStudioV2.ui.edit': 'Edit',
        'trainerStudioV2.ui.delete': 'Delete',
        'trainerStudioV2.ui.search': 'Search',
        'trainerStudioV2.ui.refresh': 'Refresh',
        'trainerStudioV2.ui.filters': 'Filters',
        'trainerStudioV2.ui.status': 'Status',
        'trainerStudioV2.ui.amount': 'Amount',
        'trainerStudioV2.ui.date': 'Date',
        'trainerStudioV2.ui.clientName': 'Client name',
        'trainerStudioV2.ui.noData': 'No data is currently available.',
        'trainerStudioV2.plan.dataBacked': 'Connected to live data',
        'trainerStudioV2.plan.createTraining': 'Create training plan', 'trainerStudioV2.plan.createNutrition': 'Create nutrition plan',
        'trainerStudioV2.plan.client': 'Client', 'trainerStudioV2.plan.name': 'Plan name',
        'trainerStudioV2.plan.startDate': 'Start date', 'trainerStudioV2.plan.duration': 'Duration',
        'trainerStudioV2.plan.days': 'in days', 'trainerStudioV2.plan.weeks': 'in weeks',
        'trainerStudioV2.plan.mealName': 'Meal name', 'trainerStudioV2.plan.food': 'Food',
        'trainerStudioV2.plan.quantity': 'Quantity', 'trainerStudioV2.plan.unit': 'Unit',
        'trainerStudioV2.plan.targetCalories': 'Target calories', 'trainerStudioV2.plan.targetProtein': 'Target protein',
        'trainerStudioV2.plan.goal': 'Goal', 'trainerStudioV2.plan.level': 'Level',
        'trainerStudioV2.plan.routineName': 'Training day name', 'trainerStudioV2.plan.dayOfWeek': 'Day of week',
        'trainerStudioV2.plan.exercise': 'Exercise', 'trainerStudioV2.plan.sets': 'Sets',
        'trainerStudioV2.plan.reps': 'Repetitions', 'trainerStudioV2.plan.restSeconds': 'Rest (seconds)',
        'trainerStudioV2.plan.level.beginner': 'Beginner', 'trainerStudioV2.plan.level.intermediate': 'Intermediate',
        'trainerStudioV2.plan.level.advanced': 'Advanced', 'trainerStudioV2.plan.save': 'Save plan',
        'trainerStudioV2.ui.close': 'Close'
    });

    // This is the sole dictionary owner. Keep domain values, routes, IDs and
    // persisted values out of this presentation-only catalog.
    const reportsScreenArabic = Object.freeze({
        'reports.title': 'تقارير {{brand}}', 'reports.eyebrow': 'مركز التقارير',
        'reports.description': 'اختر التقرير والفترة لعرض بيانات دقيقة وقابلة للمتابعة.',
        'reports.export': 'تصدير CSV', 'reports.refresh': 'تحديث البيانات', 'reports.tabs.label': 'أنواع التقارير',
        'reports.tab.overview': 'الملخص العام', 'reports.tab.attendance': 'الحضور والغياب', 'reports.tab.memberships': 'الاشتراكات والعضويات',
        'reports.tab.finance': 'التحصيل والمصروفات', 'reports.tab.coaching': 'التدريب والتغذية', 'reports.tab.library': 'مكتبة النظام', 'reports.tab.backups': 'النسخ الاحتياطية',
        'reports.filters.kicker': 'خيارات العرض', 'reports.filters.title': 'الفترة والفلاتر', 'reports.from': 'من تاريخ', 'reports.to': 'إلى تاريخ', 'reports.run': 'عرض التقرير',
        'reports.filter.overview': 'ملخص شامل للفترة المحددة', 'reports.filter.attendance': 'بحث في الحضور',
        'reports.filter.memberOrPhone': 'اسم المشترك أو الهاتف', 'reports.filter.membershipStatus': 'حالة العضوية', 'reports.filter.allStatuses': 'كل الحالات',
        'reports.status.active': 'نشطة', 'reports.status.expiring': 'قريبة الانتهاء', 'reports.status.frozen': 'مجمدة', 'reports.status.expired': 'منتهية',
        'reports.filter.plan': 'الباقة', 'reports.filter.allPlans': 'كل الباقات', 'reports.plan.gymOnly': 'جيم فقط', 'reports.plan.gymCardio': 'جيم وكارديو',
        'reports.filter.debtors': 'عليهم متبقي', 'reports.search': 'بحث', 'reports.filter.nameOrPhone': 'اسم أو هاتف',
        'reports.filter.type': 'نوع التقرير', 'reports.all': 'الكل', 'reports.filter.collection': 'التحصيل والمدفوعات', 'reports.expenses': 'المصروفات',
        'reports.filter.paymentMethod': 'طريقة الدفع', 'reports.filter.allMethods': 'كل الطرق', 'reports.payment.cash': 'نقدي', 'reports.payment.card': 'بطاقة', 'reports.payment.transfer': 'تحويل', 'reports.other': 'أخرى',
        'reports.filter.memberOrExpense': 'مشترك أو اسم مصروف', 'reports.filter.systemType': 'نوع النظام', 'reports.coaching': 'التدريب والتغذية',
        'reports.workoutPrograms': 'برامج التدريب', 'reports.dietPlans': 'خطط التغذية', 'reports.filter.status': 'الحالة',
        'reports.draft': 'مسودة', 'reports.paused': 'متوقفة', 'reports.completed': 'مكتملة', 'reports.archived': 'مؤرشفة',
        'reports.filter.traineeOrProgram': 'اسم المتدرب أو النظام', 'reports.filter.librarySection': 'قسم المكتبة', 'reports.filter.allSections': 'كل الأقسام',
        'reports.foods': 'الأطعمة', 'reports.exercises': 'التمارين', 'reports.muscles': 'العضلات', 'reports.filter.archiveFormat': 'امتداد النسخة',
        'reports.filter.allArchives': 'كل النسخ', 'reports.backup.retentionNote': 'النسخ اليومية محفوظة حسب سياسة الاحتفاظ الحالية',
        'reports.loading': 'جاري إعداد التقرير…', 'reports.loadingAttendance': 'جاري إعداد تقرير الحضور والغياب…', 'reports.loadingBackups': 'جاري تحميل سجل النسخ…',
        'reports.error': 'تعذر تحميل التقرير.', 'reports.empty.period': 'لا توجد بيانات في الفترة المحددة.',
        'reports.periodMembers': '{{from}} — {{to}} · {{count}} عضو حالي',
        'reports.kpi.newMembers': 'الأعضاء الجدد', 'reports.kpi.inPeriod': 'خلال الفترة', 'reports.kpi.newMemberships': 'الاشتراكات الجديدة', 'reports.kpi.registeredMembership': 'اشتراك مسجل',
        'reports.kpi.collections': 'إجمالي التحصيل', 'reports.kpi.paymentCount': '{{count}} دفعة', 'reports.kpi.expenses': 'المصروفات', 'reports.kpi.expenseCount': '{{count}} مصروف',
        'reports.kpi.net': 'صافي الفترة', 'reports.kpi.needsReview': 'يحتاج مراجعة', 'reports.kpi.positiveNet': 'الصافي موجب', 'reports.kpi.outstanding': 'المبالغ المتبقية', 'reports.kpi.subscriptionCount': '{{count}} اشتراك',
        'reports.timeline': 'التحليل الزمني', 'reports.dailyMovement': 'الحركة اليومية', 'reports.distribution': 'التوزيع', 'reports.plansAndMethods': 'الباقات وطرق الدفع',
        'reports.collectionPriority': 'أولوية التحصيل', 'reports.membersWithDues': 'المشتركون عليهم مستحقات', 'reports.memberCount': '{{count}} مشترك',
        'reports.noOutstanding': 'لا توجد مبالغ متبقية حاليًا.', 'reports.newMembersLegend': 'أعضاء جدد', 'reports.newMembershipsLegend': 'اشتراكات جديدة',
        'reports.collections': 'التحصيل', 'reports.expensesLegend': 'المصروفات', 'reports.chartCountHint': 'الرقم = أعضاء واشتراكات جديدة',
        'reports.plans': 'الباقات', 'reports.paymentMethods': 'طرق الدفع', 'reports.currentStatuses': 'الحالات الحالية', 'reports.noData': 'لا توجد بيانات.', 'reports.noPayments': 'لا توجد مدفوعات.',
        'reports.details': 'التفاصيل', 'reports.recordPayment': 'تسجيل دفعة', 'reports.action': 'إجراء', 'reports.member': 'المشترك', 'reports.plan': 'الباقة', 'reports.remaining': 'المتبقي',
        'reports.membership.current': 'سجل الاشتراكات والعضويات', 'reports.membership.periodDetails': 'تفاصيل الفترة', 'reports.membership.planAndType': 'الباقة والنوع', 'reports.membership.status': 'الحالة',
        'reports.membership.period': 'الفترة', 'reports.account': 'الحساب', 'reports.contact': 'تواصل', 'reports.resultCount': '{{count}} نتيجة', 'reports.inPeriod': 'في الفترة',
        'reports.noMatchingFilters': 'لا توجد نتائج مطابقة للفلاتر.', 'reports.until': 'حتى {{date}}', 'reports.paid': 'مدفوع {{amount}}', 'reports.noAction': '—',
        'reports.finance.collectionMovement': 'حركة التحصيل', 'reports.finance.paymentsReceipts': 'المدفوعات والإيصالات', 'reports.finance.paymentCount': '{{count}} دفعة',
        'reports.finance.member': 'المشترك', 'reports.finance.transaction': 'العملية', 'reports.date': 'التاريخ', 'reports.finance.paid': 'المدفوع', 'reports.finance.noMatchingPayments': 'لا توجد مدفوعات مطابقة.',
        'reports.finance.expenseMovement': 'حركة المصروفات', 'reports.finance.expenseRegister': 'سجل المصروفات', 'reports.finance.expenseNameNotes': 'اسم المصروف والملاحظات',
        'reports.finance.noMatchingExpenses': 'لا توجد مصروفات مطابقة.', 'reports.withoutNotes': 'بدون ملاحظات', 'reports.transactions.subscription': 'اشتراك', 'reports.transactions.payment': 'دفعة', 'reports.transactions.adjustment': 'تسوية',
        'reports.plan.monthly': 'شهرية', 'reports.plan.halfMonth': 'نصف شهر', 'reports.plan.quarterly': 'ربع سنوية', 'reports.plan.semiannual': 'نصف سنوية', 'reports.plan.annual': 'سنوية', 'reports.plan.twoMonths': 'شهرين',
        'reports.status.none': 'بدون اشتراك', 'reports.status.upcoming': 'تبدأ لاحقًا', 'reports.contact.sent': 'تم التواصل', 'reports.contact.opened': 'تم فتح واتساب',
        'reports.coaching.training': 'التدريب', 'reports.coaching.workoutsCreated': 'البرامج المنشأة خلال الفترة', 'reports.coaching.planAndTrainee': 'البرنامج والمتدرب',
        'reports.coaching.period': 'الفترة', 'reports.coaching.days': 'الأيام', 'reports.coaching.exercises': 'التمارين', 'reports.coaching.actions': 'الإجراءات', 'reports.coaching.noPrograms': 'لا توجد برامج مطابقة.',
        'reports.coaching.nutrition': 'التغذية', 'reports.coaching.dietsCreated': 'خطط التغذية المنشأة خلال الفترة', 'reports.coaching.dietAndTrainee': 'الخطة والمتدرب',
        'reports.coaching.calories': 'السعرات', 'reports.coaching.content': 'المحتوى', 'reports.coaching.noDiets': 'لا توجد خطط مطابقة.', 'reports.coaching.routines': '{{count}} أيام', 'reports.coaching.exerciseCount': '{{count}} تمارين',
        'reports.library.summary': 'ملخص مكتبة التدريب والتغذية', 'reports.library.reference': 'مرجع النظام', 'reports.library.totalItems': 'إجمالي العناصر', 'reports.library.addedInPeriod': 'المضاف خلال الفترة',
        'reports.library.usage': 'الاستخدام', 'reports.library.foodPlans': 'مكونات الخطط الغذائية', 'reports.library.trainingCatalog': 'مكتبة البرامج التدريبية', 'reports.library.muscleTargets': 'توزيع العضلات والاستهداف', 'reports.library.addedCount': '+{{count}} في الفترة',
        'reports.attendance.totalVisits': 'إجمالي الزيارات', 'reports.attendance.membersAttended': 'مشتركون حضروا', 'reports.attendance.checkedOut': 'انصراف مسجل', 'reports.attendance.averageMinutes': 'متوسط الدقائق', 'reports.attendance.noAttendance': 'بلا حضور',
        'reports.attendance.dailyMovement': 'الحركة اليومية', 'reports.attendance.dailySummary': 'ملخص الحضور حسب اليوم', 'reports.attendance.dayCount': '{{count}} يوم', 'reports.attendance.visits': 'الزيارات',
        'reports.attendance.uniqueMembers': 'مشتركون مختلفون', 'reports.attendance.noVisits': 'لا توجد زيارات في الفترة.', 'reports.attendance.mostActive': 'الأعلى نشاطًا', 'reports.attendance.mostVisits': 'الأكثر حضورًا',
        'reports.attendance.duration': 'المدة', 'reports.attendance.lastVisit': 'آخر حضور', 'reports.attendance.noMatchingVisits': 'لا توجد زيارات مطابقة.', 'reports.attendance.followUp': 'تحتاج متابعة',
        'reports.attendance.absentMembers': 'مشتركون بلا حضور', 'reports.attendance.membershipEnd': 'انتهاء الاشتراك', 'reports.attendance.call': 'اتصال', 'reports.attendance.noOngoingAbsence': 'لا توجد حالات غياب مستمرة.',
        'reports.backups.saved': 'النسخ المحفوظة', 'reports.backups.retention': 'مدة الاحتفاظ يومان', 'reports.backups.recentOperations': 'آخر العمليات', 'reports.backups.lastThree': 'عرض آخر 3 فقط',
        'reports.backups.schedule': 'موعد النسخة', 'reports.backups.cairoTime': 'بتوقيت القاهرة', 'reports.backups.automaticArchive': 'الأرشيف التلقائي', 'reports.backups.dailyArchives': 'النسخ اليومية المحفوظة',
        'reports.backups.fileDate': 'الملف والتاريخ', 'reports.backups.extension': 'الامتداد', 'reports.backups.data': 'البيانات', 'reports.backups.download': 'تحميل', 'reports.backups.delete': 'حذف',
        'reports.backups.noSaved': 'لا توجد نسخ محفوظة.', 'reports.backups.followUp': 'المتابعة', 'reports.backups.lastThreeOperations': 'آخر 3 عمليات', 'reports.backups.operation': 'العملية',
        'reports.backups.rows': 'الصفوف', 'reports.backups.noOperations': 'لا يوجد سجل عمليات.', 'reports.backups.success': 'ناجحة', 'reports.backups.failure': 'فاشلة', 'reports.backups.rowCount': '{{count}} صف',
        'reports.backups.operation.download': 'تنزيل نسخة', 'reports.backups.operation.inspect': 'فحص نسخة', 'reports.backups.operation.restore': 'استرجاع نسخة',
        'reports.expense': 'مصروف', 'reports.collection': 'تحصيل', 'reports.whatsapp.reminder': 'إرسال تذكير عبر واتساب',
        'reports.amount': 'المبلغ', 'reports.library.section': 'القسم',
        'reports.finance.netWithRefunds': 'التحصيل − المصروفات − الاستردادات', 'reports.finance.netWithoutRefunds': 'التحصيل − المصروفات',
        'reports.finance.actualCollections': 'التحصيل الفعلي', 'reports.finance.net': 'الصافي',
        'reports.coaching.volume': 'حجم التدريب', 'reports.coaching.kilograms': 'كجم', 'reports.coaching.weightReps': 'من الأوزان والتكرارات',
        'reports.coaching.caloriesLogged': 'السعرات المسجلة', 'reports.coaching.dailyCheckins': 'المتابعات اليومية', 'reports.coaching.recoveryPeriod': 'استشفاء خلال الفترة',
        'reports.coaching.activeCount': '{{count}} نشطة', 'reports.coaching.completedCount': '{{count}} مكتملة', 'reports.coaching.sessions': 'جلسات التمرين',
        'reports.coaching.mealLogs': 'سجل الوجبات', 'reports.coaching.measurements': 'القياسات', 'reports.coaching.addedInPeriod': 'مضافة خلال الفترة',
        'reports.coaching.mealFoodCount': '{{meals}} وجبات · {{foods}} أطعمة', 'reports.attendance.minutes': 'دقيقة',
        'reports.backups.scheduleTime': '3:00 م'
    });

    const reportsScreenEnglish = Object.freeze({
        'reports.title': '{{brand}} reports', 'reports.eyebrow': 'Reports center',
        'reports.description': 'Choose a report and date range to review accurate, actionable data.',
        'reports.export': 'Export CSV', 'reports.refresh': 'Refresh data', 'reports.tabs.label': 'Report types',
        'reports.tab.overview': 'Overview', 'reports.tab.attendance': 'Attendance', 'reports.tab.memberships': 'Memberships',
        'reports.tab.finance': 'Collections & expenses', 'reports.tab.coaching': 'Training & nutrition', 'reports.tab.library': 'System library', 'reports.tab.backups': 'Backups',
        'reports.filters.kicker': 'View options', 'reports.filters.title': 'Period & filters', 'reports.from': 'From date', 'reports.to': 'To date', 'reports.run': 'Run report',
        'reports.filter.overview': 'Summary for the selected period', 'reports.filter.attendance': 'Search attendance',
        'reports.filter.memberOrPhone': 'Member name or phone', 'reports.filter.membershipStatus': 'Membership status', 'reports.filter.allStatuses': 'All statuses',
        'reports.status.active': 'Active', 'reports.status.expiring': 'Expiring soon', 'reports.status.frozen': 'Frozen', 'reports.status.expired': 'Expired',
        'reports.filter.plan': 'Plan', 'reports.filter.allPlans': 'All plans', 'reports.plan.gymOnly': 'Gym only', 'reports.plan.gymCardio': 'Gym & cardio',
        'reports.filter.debtors': 'Has outstanding balance', 'reports.search': 'Search', 'reports.filter.nameOrPhone': 'Name or phone',
        'reports.filter.type': 'Report type', 'reports.all': 'All', 'reports.filter.collection': 'Collections & payments', 'reports.expenses': 'Expenses',
        'reports.filter.paymentMethod': 'Payment method', 'reports.filter.allMethods': 'All methods', 'reports.payment.cash': 'Cash', 'reports.payment.card': 'Card', 'reports.payment.transfer': 'Transfer', 'reports.other': 'Other',
        'reports.filter.memberOrExpense': 'Member or expense name', 'reports.filter.systemType': 'Program type', 'reports.coaching': 'Training & nutrition',
        'reports.workoutPrograms': 'Training programs', 'reports.dietPlans': 'Nutrition plans', 'reports.filter.status': 'Status',
        'reports.draft': 'Draft', 'reports.paused': 'Paused', 'reports.completed': 'Completed', 'reports.archived': 'Archived',
        'reports.filter.traineeOrProgram': 'Trainee or program name', 'reports.filter.librarySection': 'Library section', 'reports.filter.allSections': 'All sections',
        'reports.foods': 'Foods', 'reports.exercises': 'Exercises', 'reports.muscles': 'Muscles', 'reports.filter.archiveFormat': 'Archive format',
        'reports.filter.allArchives': 'All archives', 'reports.backup.retentionNote': 'Daily backups are retained according to the current policy',
        'reports.loading': 'Preparing report…', 'reports.loadingAttendance': 'Preparing attendance report…', 'reports.loadingBackups': 'Loading backup history…',
        'reports.error': 'Could not load the report.', 'reports.empty.period': 'No data for the selected period.',
        'reports.periodMembers': '{{from}} — {{to}} · {{count}} current members',
        'reports.kpi.newMembers': 'New members', 'reports.kpi.inPeriod': 'during this period', 'reports.kpi.newMemberships': 'New memberships', 'reports.kpi.registeredMembership': 'registered membership',
        'reports.kpi.collections': 'Total collections', 'reports.kpi.paymentCount': '{{count}} payments', 'reports.kpi.expenses': 'Expenses', 'reports.kpi.expenseCount': '{{count}} expenses',
        'reports.kpi.net': 'Net for period', 'reports.kpi.needsReview': 'Needs review', 'reports.kpi.positiveNet': 'Positive net', 'reports.kpi.outstanding': 'Outstanding balances', 'reports.kpi.subscriptionCount': '{{count}} memberships',
        'reports.timeline': 'Timeline analysis', 'reports.dailyMovement': 'Daily activity', 'reports.distribution': 'Distribution', 'reports.plansAndMethods': 'Plans & payment methods',
        'reports.collectionPriority': 'Collection priority', 'reports.membersWithDues': 'Members with outstanding balances', 'reports.memberCount': '{{count}} members',
        'reports.noOutstanding': 'There are no outstanding balances.', 'reports.newMembersLegend': 'New members', 'reports.newMembershipsLegend': 'New memberships',
        'reports.collections': 'Collections', 'reports.expensesLegend': 'Expenses', 'reports.chartCountHint': 'Count = new members and memberships',
        'reports.plans': 'Plans', 'reports.paymentMethods': 'Payment methods', 'reports.currentStatuses': 'Current statuses', 'reports.noData': 'No data available.', 'reports.noPayments': 'No payments available.',
        'reports.details': 'Details', 'reports.recordPayment': 'Record payment', 'reports.action': 'Action', 'reports.member': 'Member', 'reports.plan': 'Plan', 'reports.remaining': 'Remaining',
        'reports.membership.current': 'Membership register', 'reports.membership.periodDetails': 'Period details', 'reports.membership.planAndType': 'Plan & type', 'reports.membership.status': 'Status',
        'reports.membership.period': 'Period', 'reports.account': 'Account', 'reports.contact': 'Contact', 'reports.resultCount': '{{count}} results', 'reports.inPeriod': 'In period',
        'reports.noMatchingFilters': 'No results match the selected filters.', 'reports.until': 'Until {{date}}', 'reports.paid': 'Paid {{amount}}', 'reports.noAction': '—',
        'reports.finance.collectionMovement': 'Collections activity', 'reports.finance.paymentsReceipts': 'Payments & receipts', 'reports.finance.paymentCount': '{{count}} payments',
        'reports.finance.member': 'Member', 'reports.finance.transaction': 'Transaction', 'reports.date': 'Date', 'reports.finance.paid': 'Paid', 'reports.finance.noMatchingPayments': 'No matching payments.',
        'reports.finance.expenseMovement': 'Expense activity', 'reports.finance.expenseRegister': 'Expense register', 'reports.finance.expenseNameNotes': 'Expense and notes',
        'reports.finance.noMatchingExpenses': 'No matching expenses.', 'reports.withoutNotes': 'No notes', 'reports.transactions.subscription': 'Membership', 'reports.transactions.payment': 'Payment', 'reports.transactions.adjustment': 'Adjustment',
        'reports.plan.monthly': 'Monthly', 'reports.plan.halfMonth': 'Half-month', 'reports.plan.quarterly': 'Quarterly', 'reports.plan.semiannual': 'Semiannual', 'reports.plan.annual': 'Annual', 'reports.plan.twoMonths': 'Two months',
        'reports.status.none': 'No membership', 'reports.status.upcoming': 'Upcoming', 'reports.contact.sent': 'Contacted', 'reports.contact.opened': 'WhatsApp opened',
        'reports.coaching.training': 'Training', 'reports.coaching.workoutsCreated': 'Programs created in period', 'reports.coaching.planAndTrainee': 'Program & trainee',
        'reports.coaching.period': 'Period', 'reports.coaching.days': 'Days', 'reports.coaching.exercises': 'Exercises', 'reports.coaching.actions': 'Actions', 'reports.coaching.noPrograms': 'No matching programs.',
        'reports.coaching.nutrition': 'Nutrition', 'reports.coaching.dietsCreated': 'Nutrition plans created in period', 'reports.coaching.dietAndTrainee': 'Plan & trainee',
        'reports.coaching.calories': 'Calories', 'reports.coaching.content': 'Content', 'reports.coaching.noDiets': 'No matching plans.', 'reports.coaching.routines': '{{count}} days', 'reports.coaching.exerciseCount': '{{count}} exercises',
        'reports.library.summary': 'Training & nutrition library summary', 'reports.library.reference': 'System reference', 'reports.library.totalItems': 'Total items', 'reports.library.addedInPeriod': 'Added in period',
        'reports.library.usage': 'Usage', 'reports.library.foodPlans': 'Nutrition plan ingredients', 'reports.library.trainingCatalog': 'Training program catalog', 'reports.library.muscleTargets': 'Muscle distribution and targeting', 'reports.library.addedCount': '+{{count}} in period',
        'reports.attendance.totalVisits': 'Total visits', 'reports.attendance.membersAttended': 'Members attended', 'reports.attendance.checkedOut': 'Check-outs recorded', 'reports.attendance.averageMinutes': 'Average minutes', 'reports.attendance.noAttendance': 'No attendance',
        'reports.attendance.dailyMovement': 'Daily activity', 'reports.attendance.dailySummary': 'Attendance by day', 'reports.attendance.dayCount': '{{count}} days', 'reports.attendance.visits': 'Visits',
        'reports.attendance.uniqueMembers': 'Unique members', 'reports.attendance.noVisits': 'No visits in this period.', 'reports.attendance.mostActive': 'Most active', 'reports.attendance.mostVisits': 'Most visits',
        'reports.attendance.duration': 'Duration', 'reports.attendance.lastVisit': 'Last visit', 'reports.attendance.noMatchingVisits': 'No matching visits.', 'reports.attendance.followUp': 'Follow-up needed',
        'reports.attendance.absentMembers': 'Members with no attendance', 'reports.attendance.membershipEnd': 'Membership end', 'reports.attendance.call': 'Call', 'reports.attendance.noOngoingAbsence': 'No ongoing absence cases.',
        'reports.backups.saved': 'Saved backups', 'reports.backups.retention': 'Two-day retention', 'reports.backups.recentOperations': 'Recent operations', 'reports.backups.lastThree': 'Showing the latest 3',
        'reports.backups.schedule': 'Backup schedule', 'reports.backups.cairoTime': 'Cairo time', 'reports.backups.automaticArchive': 'Automatic archive', 'reports.backups.dailyArchives': 'Saved daily backups',
        'reports.backups.fileDate': 'File & date', 'reports.backups.extension': 'Format', 'reports.backups.data': 'Records', 'reports.backups.download': 'Download', 'reports.backups.delete': 'Delete',
        'reports.backups.noSaved': 'No saved backups.', 'reports.backups.followUp': 'Activity', 'reports.backups.lastThreeOperations': 'Latest 3 operations', 'reports.backups.operation': 'Operation',
        'reports.backups.rows': 'Rows', 'reports.backups.noOperations': 'No operation history.', 'reports.backups.success': 'Succeeded', 'reports.backups.failure': 'Failed', 'reports.backups.rowCount': '{{count}} rows',
        'reports.backups.operation.download': 'Download backup', 'reports.backups.operation.inspect': 'Inspect backup', 'reports.backups.operation.restore': 'Restore backup',
        'reports.expense': 'Expense', 'reports.collection': 'Collection', 'reports.whatsapp.reminder': 'Send WhatsApp reminder',
        'reports.amount': 'Amount', 'reports.library.section': 'Section',
        'reports.finance.netWithRefunds': 'Collections − expenses − refunds', 'reports.finance.netWithoutRefunds': 'Collections − expenses',
        'reports.finance.actualCollections': 'Actual collections', 'reports.finance.net': 'Net',
        'reports.coaching.volume': 'Training volume', 'reports.coaching.kilograms': 'kg', 'reports.coaching.weightReps': 'From weights and repetitions',
        'reports.coaching.caloriesLogged': 'Logged calories', 'reports.coaching.dailyCheckins': 'Daily check-ins', 'reports.coaching.recoveryPeriod': 'Recovery during this period',
        'reports.coaching.activeCount': '{{count}} active', 'reports.coaching.completedCount': '{{count}} completed', 'reports.coaching.sessions': 'Workout sessions',
        'reports.coaching.mealLogs': 'Meal log entries', 'reports.coaching.measurements': 'Measurements', 'reports.coaching.addedInPeriod': 'Added during this period',
        'reports.coaching.mealFoodCount': '{{meals}} meals · {{foods}} foods', 'reports.attendance.minutes': 'minutes',
        'reports.backups.scheduleTime': '3:00 PM'
    });

    const portalAnalyticsScreenArabic = Object.freeze({
        'portalAnalytics.kicker': 'إحصائيات بوابة العضوية',
        'portalAnalytics.title': 'إحصائيات بوابة العضوية',
        'portalAnalytics.description': 'تابع استخدام بوابة هذا الجيم دون عرض أسماء الأعضاء أو بياناتهم الشخصية.',
        'portalAnalytics.range.label': 'الفترة',
        'portalAnalytics.range.7': 'آخر 7 أيام',
        'portalAnalytics.range.30': 'آخر 30 يومًا',
        'portalAnalytics.range.90': 'آخر 90 يومًا',
        'portalAnalytics.refresh': 'تحديث',
        'portalAnalytics.refresh.loading': 'جارٍ تحديث الإحصائيات...',
        'portalAnalytics.card.pageViews': 'مشاهدات الصفحات',
        'portalAnalytics.card.pageViewsHint': 'كل مرات فتح صفحات البوابة',
        'portalAnalytics.card.uniqueVisitors': 'الزوار الفريدون',
        'portalAnalytics.card.uniqueVisitorsHint': 'تقدير تقريبي لا يحفظ هوية الزائر',
        'portalAnalytics.card.authenticatedMembers': 'الأعضاء المسجلون',
        'portalAnalytics.card.authenticatedMembersHint': 'زيارات مرتبطة بجلسة عضو مصادق عليها',
        'portalAnalytics.trend.kicker': 'الاتجاه اليومي',
        'portalAnalytics.trend.title': 'التوزيع اليومي للزيارات',
        'portalAnalytics.trend.description': 'الفصل واضح بين المشاهدات والزوار والأعضاء المصادق عليهم.',
        'portalAnalytics.series.pageViews': 'مشاهدات الصفحات',
        'portalAnalytics.series.uniqueVisitors': 'الزوار الفريدون',
        'portalAnalytics.series.authenticatedMembers': 'الأعضاء المسجلون',
        'portalAnalytics.series.views': 'مشاهدات',
        'portalAnalytics.series.visitors': 'زوار',
        'portalAnalytics.series.members': 'أعضاء',
        'portalAnalytics.day.views': '{{count}} مشاهدة',
        'portalAnalytics.day.noViews': 'بدون مشاهدات',
        'portalAnalytics.highlight.mostVisited': 'أكثر يوم زيارة: {{date}} · {{count}} مشاهدة صفحة',
        'portalAnalytics.state.loading': 'جارٍ تحميل الإحصائيات…',
        'portalAnalytics.state.empty.title': 'لا توجد زيارات مسجلة خلال الفترة',
        'portalAnalytics.state.empty.description': 'ستظهر حركة البوابة هنا بعد دخول الأعضاء إليها.',
        'portalAnalytics.state.error.title': 'تعذر تحميل الإحصائيات',
        'portalAnalytics.state.error.description': 'تحقق من الاتصال والصلاحيات ثم أعد المحاولة.',
        'portalAnalytics.status.error': 'تعذر تحميل إحصائيات البوابة. حاول مرة أخرى.',
        'portalAnalytics.toast.error': 'تعذر تحميل إحصائيات البوابة.'
    });

    const portalAnalyticsScreenEnglish = Object.freeze({
        'portalAnalytics.kicker': 'MEMBER PORTAL INSIGHTS',
        'portalAnalytics.title': 'Member portal analytics',
        'portalAnalytics.description': 'Track this gym’s member portal usage without exposing member names or personal information.',
        'portalAnalytics.range.label': 'Date range',
        'portalAnalytics.range.7': 'Last 7 days',
        'portalAnalytics.range.30': 'Last 30 days',
        'portalAnalytics.range.90': 'Last 90 days',
        'portalAnalytics.refresh': 'Refresh',
        'portalAnalytics.refresh.loading': 'Refreshing analytics...',
        'portalAnalytics.card.pageViews': 'Page views',
        'portalAnalytics.card.pageViewsHint': 'Total member portal page opens',
        'portalAnalytics.card.uniqueVisitors': 'Unique visitors',
        'portalAnalytics.card.uniqueVisitorsHint': 'Approximate count; visitor identity is not stored',
        'portalAnalytics.card.authenticatedMembers': 'Authenticated members',
        'portalAnalytics.card.authenticatedMembersHint': 'Visits associated with an authenticated member session',
        'portalAnalytics.trend.kicker': 'DAILY TREND',
        'portalAnalytics.trend.title': 'Daily visit breakdown',
        'portalAnalytics.trend.description': 'Page views, visitors, and authenticated members are shown separately.',
        'portalAnalytics.series.pageViews': 'Page views',
        'portalAnalytics.series.uniqueVisitors': 'Unique visitors',
        'portalAnalytics.series.authenticatedMembers': 'Authenticated members',
        'portalAnalytics.series.views': 'Views',
        'portalAnalytics.series.visitors': 'Visitors',
        'portalAnalytics.series.members': 'Members',
        'portalAnalytics.day.views': '{{count}} views',
        'portalAnalytics.day.noViews': 'No views',
        'portalAnalytics.highlight.mostVisited': 'Most visited day: {{date}} · {{count}} page views',
        'portalAnalytics.state.loading': 'Loading analytics…',
        'portalAnalytics.state.empty.title': 'No visits recorded for this period',
        'portalAnalytics.state.empty.description': 'Portal activity will appear here after members visit.',
        'portalAnalytics.state.error.title': 'Could not load analytics',
        'portalAnalytics.state.error.description': 'Check the connection and permissions, then try again.',
        'portalAnalytics.status.error': 'Could not load portal analytics. Please try again.',
        'portalAnalytics.toast.error': 'Could not load portal analytics.'
    });

    const coachingScreenArabic = Object.freeze({
        'coaching.dialog.externalTrainee.description': 'أدخل البيانات الأساسية فقط، ثم أنشئ له برنامجًا أو خطة تغذية من ملفه.',
        'coaching.externalForm.fullName': 'الاسم الكامل *',
        'coaching.externalForm.fullNamePlaceholder': 'مثال: كريم عبد الحميد',
        'coaching.externalForm.phone': 'رقم الهاتف *',
        'coaching.externalForm.email': 'البريد الإلكتروني',
        'coaching.externalForm.optional': 'اختياري',
        'coaching.externalForm.registrationDate': 'تاريخ التسجيل',
        'coaching.externalForm.notes': 'ملاحظات',
        'coaching.externalForm.save': 'حفظ المتدرب',
        'coaching.page.kicker': 'إدارة التدريب والتغذية',
        'coaching.page.title': 'المتدربون غير المشتركين',
        'coaching.page.description': 'عملاء لديهم نظام تدريب أو تغذية بدون اشتراك Gym فعال، مع الحفاظ على نفس ملف العميل.',
        'coaching.addTrainee': 'إضافة متدرب خارجي',
        'coaching.search.placeholder': 'ابحث باسم المتدرب أو الهاتف',
        'coaching.search.label': 'البحث في المتدربين',
        'coaching.refresh': 'تحديث القائمة',
        'coaching.summary.trainees': 'المتدربون الخارجيون',
        'coaching.summary.traineesHint': 'عملاء بدون عضوية فعالة',
        'coaching.summary.workouts': 'برامج التدريب',
        'coaching.summary.savedSystems': 'أنظمة محفوظة',
        'coaching.summary.diets': 'خطط التغذية',
        'coaching.summary.savedPlans': 'خطط محفوظة',
        'coaching.summary.measurements': 'سجلات القياسات',
        'coaching.summary.savedFollowUps': 'متابعة محفوظة',
        'coaching.count.trainees': '{{count}} متدرب',
        'coaching.type.external': 'خارجي',
        'coaching.type.workout': 'تدريب',
        'coaching.type.diet': 'تغذية',
        'coaching.type.measurement': 'قياس محفوظ',
        'coaching.type.noMeasurements': 'لا توجد قياسات',
        'coaching.unit.calories': 'سعر',
        'coaching.unit.meals': 'وجبات',
        'coaching.unit.foods': 'أطعمة',
        'coaching.unit.exercises': 'تمرين',
        'coaching.unit.weeks': 'أسبوع',
        'coaching.unit.daysPerWeek': 'أيام أسبوعيًا',
        'coaching.activity.none': 'لا يوجد نشاط',
        'coaching.table.trainee': 'المتدرب',
        'coaching.table.type': 'النوع',
        'coaching.table.systems': 'الأنظمة',
        'coaching.table.measurements': 'القياسات',
        'coaching.table.lastActivity': 'آخر نشاط',
        'coaching.table.actions': 'الإجراءات',
        'coaching.action.addWorkout': 'إضافة تدريب',
        'coaching.action.openProfile': 'فتح الملف',
        'coaching.action.addDiet': 'إضافة تغذية',
        'coaching.action.editSystem': 'تعديل النظام',
        'coaching.action.printSystem': 'طباعة النظام',
        'coaching.action.downloadPdf': 'تحميل PDF النظام',
        'coaching.action.deleteSystem': 'حذف النظام',
        'coaching.system.noSaved': 'لا توجد أنظمة محفوظة',
        'coaching.system.detailsSaved': 'تفاصيل النظام محفوظة',
        'coaching.empty.search.title': 'لا يوجد متدربون مطابقون لبحثك',
        'coaching.empty.search.description': 'جرّب البحث باسم آخر أو رقم هاتف مختلف.',
        'coaching.empty.search.clear': 'مسح البحث',
        'coaching.empty.title': 'لا يوجد متدربون خارجيون حاليًا',
        'coaching.empty.description': 'أضف متدربًا، ثم أنشئ له برنامج تدريب أو خطة تغذية ليظهر هنا.',
        'coaching.pagination.page': 'صفحة {{page}} من {{totalPages}} · {{count}} متدرب',
        'coaching.pagination.previous': 'السابق',
        'coaching.pagination.next': 'التالي',
        'coaching.loading.list': 'افتح تبويب المتدربين لتحميل البيانات…',
        'coaching.loading.trainees': 'جارٍ تحميل قائمة المتدربين…',
        'coaching.error.trainees': 'تعذر تحميل قائمة المتدربين',
        'coaching.action.retry': 'إعادة المحاولة',
        'coaching.status.active': 'نشط',
        'coaching.status.draft': 'مسودة',
        'coaching.status.paused': 'متوقف',
        'coaching.status.completed': 'مكتمل',
        'coaching.status.archived': 'مؤرشف',
        'coaching.profile.title': 'ملف المتدرب',
        'coaching.profile.close': 'إغلاق',
        'coaching.profile.noGymMembership': 'لا يوجد اشتراك Gym فعال حاليًا',
        'coaching.profile.addGymMembership': 'إضافة اشتراك Gym',
        'coaching.profile.currentWeight': 'الوزن الحالي',
        'coaching.profile.weightChange': 'تغير الوزن',
        'coaching.profile.completedSessions': 'الجلسات المكتملة',
        'coaching.profile.mealLogs': 'تسجيلات الوجبات',
        'coaching.profile.newWorkout': 'برنامج تدريب',
        'coaching.profile.newDiet': 'خطة تغذية',
        'coaching.profile.newMeasurement': 'قياس جديد',
        'coaching.profile.editDetails': 'تعديل البيانات الأساسية',
        'coaching.profile.currentSystems': 'الأنظمة الحالية',
        'coaching.profile.system': '{{count}} نظام',
        'coaching.profile.noSystem': 'لم يتم إنشاء نظام بعد.',
        'coaching.profile.measurementsFollowUp': 'القياسات والمتابعة',
        'coaching.profile.measurement': '{{count}} قياس',
        'coaching.profile.firstMeasurement': 'أضف أول قياس لمتابعة التقدم.',
        'coaching.builder.create': 'إنشاء',
        'coaching.builder.edit': 'تعديل',
        'coaching.builder.workout': 'برنامج تدريب',
        'coaching.builder.diet': 'خطة تغذية',
        'coaching.builder.close': 'إغلاق',
        'coaching.builder.cancel': 'إلغاء',
        'coaching.builder.back': 'السابق',
        'coaching.builder.preview': 'مراجعة سريعة',
        'coaching.builder.print': 'طباعة',
        'coaching.builder.pdf': 'PDF',
        'coaching.builder.next': 'التالي',
        'coaching.builder.save': 'حفظ النظام',
        'coaching.builder.saveChanges': 'حفظ التعديلات',
        'coaching.builder.approveSave': 'اعتماد وحفظ النظام',
        'coaching.builder.client': 'العميل',
        'coaching.builder.clientPlaceholder': 'اختر العميل الذي سيُحفظ النظام باسمه.',
        'coaching.builder.basic': 'البيانات الأساسية',
        'coaching.builder.dietStructure': 'بناء الوجبات',
        'coaching.builder.workoutStructure': 'بناء الأيام والتمارين',
        'coaching.builder.review': 'المراجعة والحفظ',
        'coaching.builder.reviewBeforeSave': 'مراجعة قبل الحفظ',
        'coaching.builder.food': 'الطعام',
        'coaching.builder.protein': 'بروتين',
        'coaching.builder.carbs': 'كربوهيدرات',
        'coaching.builder.fat': 'دهون',
        'coaching.builder.calories': 'السعرات',
        'coaching.builder.target': 'المستهدف',
        'coaching.builder.exercise': 'التمرين',
        'coaching.builder.sets': 'المجموعات',
        'coaching.builder.reps': 'التكرارات',
        'coaching.builder.weight': 'الوزن',
        'coaching.builder.rest': 'الراحة',
        'coaching.builder.tempo': 'الإيقاع',
        'coaching.builder.superset': 'سوبر سيت',
        'coaching.builder.quickAi': 'تعديل سريع بالذكاء الاصطناعي',
        'coaching.builder.applyAi': 'تطبيق التعديل',
        'coaching.builder.validation.client': 'أكمل العميل والاسم وتاريخ البداية أولًا.',
        'coaching.builder.validation.structure.workout': 'أضف يومًا وتمرينًا صحيحًا واحدًا على الأقل.',
        'coaching.builder.validation.structure.diet': 'أضف وجبة وطعامًا صحيحًا واحدًا على الأقل لكل وجبة.',
        'coaching.builder.nutritionTotals': 'إجمالي التغذية الحالي', 'coaching.builder.macroTargets': 'السعرات والماكروز المستهدفة',
        'coaching.builder.proteinGrams': 'البروتين (جم)', 'coaching.builder.carbsGrams': 'الكربوهيدرات (جم)',
        'coaching.builder.fatGrams': 'الدهون (جم)', 'coaching.builder.basalMetabolicRate': 'معدل الأيض الأساسي (BMR)',
        'coaching.builder.dailyEnergyNeeds': 'الاحتياج اليومي مع النشاط (TDEE)',
        'coaching.builder.calculationTarget': 'الهدف المقترح',
        'coaching.builder.targetCaloriesLabel': 'السعرات المستهدفة',
        'coaching.measurement.edit': 'تعديل القياس',
        'coaching.measurement.saved': 'تم حفظ القياس بنجاح.',
        'coaching.checkin.question': 'كيف كان يوم المتدرب؟',
        'coaching.checkin.edit': 'تعديل المتابعة اليومية',
        'coaching.checkin.saved': 'تم حفظ المتابعة اليومية بنجاح.',
        'coaching.client.updated': 'تم تحديث بيانات العميل.',
        'coaching.session.started': 'تم بدء جلسة التدريب.',
        'coaching.session.savedSet': 'تم حفظ المجموعة.',
        'coaching.session.ended': 'تم إنهاء الجلسة وحفظ التقدم.',
        'coaching.meal.saved': 'تم تسجيل الوجبة وحفظ السعرات والماكروز.'
    });

    const coachingScreenEnglish = Object.freeze({
        'coaching.dialog.externalTrainee.description': 'Enter basic details, then create a training program or nutrition plan from the profile.',
        'coaching.externalForm.fullName': 'Full name *',
        'coaching.externalForm.fullNamePlaceholder': 'e.g., Kareem Abdel Hamid',
        'coaching.externalForm.phone': 'Phone number *',
        'coaching.externalForm.email': 'Email',
        'coaching.externalForm.optional': 'Optional',
        'coaching.externalForm.registrationDate': 'Registration date',
        'coaching.externalForm.notes': 'Notes',
        'coaching.externalForm.save': 'Save trainee',
        'coaching.page.kicker': 'Training & nutrition management',
        'coaching.page.title': 'External trainees',
        'coaching.page.description': 'Clients with a training or nutrition plan and no active gym membership, while keeping the same client profile.',
        'coaching.addTrainee': 'Add external trainee',
        'coaching.search.placeholder': 'Search by trainee name or phone',
        'coaching.search.label': 'Search trainees',
        'coaching.refresh': 'Refresh list',
        'coaching.summary.trainees': 'External trainees',
        'coaching.summary.traineesHint': 'Clients without an active membership',
        'coaching.summary.workouts': 'Training programs',
        'coaching.summary.savedSystems': 'Saved systems',
        'coaching.summary.diets': 'Nutrition plans',
        'coaching.summary.savedPlans': 'Saved plans',
        'coaching.summary.measurements': 'Measurement records',
        'coaching.summary.savedFollowUps': 'Saved follow-ups',
        'coaching.count.trainees': '{{count}} trainees',
        'coaching.type.external': 'External',
        'coaching.type.workout': 'Training',
        'coaching.type.diet': 'Nutrition',
        'coaching.type.measurement': 'Saved measurement',
        'coaching.type.noMeasurements': 'No measurements',
        'coaching.unit.calories': 'cal',
        'coaching.unit.meals': 'meals',
        'coaching.unit.foods': 'foods',
        'coaching.unit.exercises': 'exercises',
        'coaching.unit.weeks': 'weeks',
        'coaching.unit.daysPerWeek': 'days/week',
        'coaching.activity.none': 'No activity',
        'coaching.table.trainee': 'Trainee',
        'coaching.table.type': 'Type',
        'coaching.table.systems': 'Systems',
        'coaching.table.measurements': 'Measurements',
        'coaching.table.lastActivity': 'Last activity',
        'coaching.table.actions': 'Actions',
        'coaching.action.addWorkout': 'Add training',
        'coaching.action.openProfile': 'Open profile',
        'coaching.action.addDiet': 'Add nutrition',
        'coaching.action.editSystem': 'Edit system',
        'coaching.action.printSystem': 'Print system',
        'coaching.action.downloadPdf': 'Download system PDF',
        'coaching.action.deleteSystem': 'Delete system',
        'coaching.system.noSaved': 'No saved systems',
        'coaching.system.detailsSaved': 'System details are saved',
        'coaching.empty.search.title': 'No trainees match your search',
        'coaching.empty.search.description': 'Try another name or a different phone number.',
        'coaching.empty.search.clear': 'Clear search',
        'coaching.empty.title': 'There are no external trainees yet',
        'coaching.empty.description': 'Add a trainee, then create a training program or nutrition plan to see them here.',
        'coaching.pagination.page': 'Page {{page}} of {{totalPages}} · {{count}} trainees',
        'coaching.pagination.previous': 'Previous',
        'coaching.pagination.next': 'Next',
        'coaching.loading.list': 'Open the trainees tab to load data…',
        'coaching.loading.trainees': 'Loading trainees…',
        'coaching.error.trainees': 'Could not load the trainee list',
        'coaching.action.retry': 'Try again',
        'coaching.status.active': 'Active',
        'coaching.status.draft': 'Draft',
        'coaching.status.paused': 'Paused',
        'coaching.status.completed': 'Completed',
        'coaching.status.archived': 'Archived',
        'coaching.profile.title': 'Trainee profile',
        'coaching.profile.close': 'Close',
        'coaching.profile.noGymMembership': 'There is no active gym membership',
        'coaching.profile.addGymMembership': 'Add gym membership',
        'coaching.profile.currentWeight': 'Current weight',
        'coaching.profile.weightChange': 'Weight change',
        'coaching.profile.completedSessions': 'Completed sessions',
        'coaching.profile.mealLogs': 'Meal logs',
        'coaching.profile.newWorkout': 'Training program',
        'coaching.profile.newDiet': 'Nutrition plan',
        'coaching.profile.newMeasurement': 'New measurement',
        'coaching.profile.editDetails': 'Edit basic details',
        'coaching.profile.currentSystems': 'Current systems',
        'coaching.profile.system': '{{count}} systems',
        'coaching.profile.noSystem': 'No system has been created yet.',
        'coaching.profile.measurementsFollowUp': 'Measurements & follow-up',
        'coaching.profile.measurement': '{{count}} measurements',
        'coaching.profile.firstMeasurement': 'Add the first measurement to track progress.',
        'coaching.builder.create': 'Create',
        'coaching.builder.edit': 'Edit',
        'coaching.builder.workout': 'Training program',
        'coaching.builder.diet': 'Nutrition plan',
        'coaching.builder.close': 'Close',
        'coaching.builder.cancel': 'Cancel',
        'coaching.builder.back': 'Previous',
        'coaching.builder.preview': 'Quick review',
        'coaching.builder.print': 'Print',
        'coaching.builder.pdf': 'PDF',
        'coaching.builder.next': 'Next',
        'coaching.builder.save': 'Save system',
        'coaching.builder.saveChanges': 'Save changes',
        'coaching.builder.approveSave': 'Approve & save system',
        'coaching.builder.client': 'Client',
        'coaching.builder.clientPlaceholder': 'Choose the client this system will be saved for.',
        'coaching.builder.basic': 'Basic information',
        'coaching.builder.dietStructure': 'Build meals',
        'coaching.builder.workoutStructure': 'Build days & exercises',
        'coaching.builder.review': 'Review & save',
        'coaching.builder.reviewBeforeSave': 'Review before saving',
        'coaching.builder.food': 'Food',
        'coaching.builder.protein': 'Protein',
        'coaching.builder.carbs': 'Carbohydrates',
        'coaching.builder.fat': 'Fat',
        'coaching.builder.calories': 'Calories',
        'coaching.builder.target': 'Target',
        'coaching.builder.exercise': 'Exercise',
        'coaching.builder.sets': 'Sets',
        'coaching.builder.reps': 'Repetitions',
        'coaching.builder.weight': 'Weight',
        'coaching.builder.rest': 'Rest',
        'coaching.builder.tempo': 'Tempo',
        'coaching.builder.superset': 'Superset',
        'coaching.builder.quickAi': 'Quick AI refinement',
        'coaching.builder.applyAi': 'Apply changes',
        'coaching.builder.validation.client': 'Complete the client, name, and start date first.',
        'coaching.builder.validation.structure.workout': 'Add at least one valid day and exercise.',
        'coaching.builder.validation.structure.diet': 'Add at least one valid food item to every meal.',
        'coaching.builder.nutritionTotals': 'Live nutrition totals', 'coaching.builder.macroTargets': 'Target calories and macros',
        'coaching.builder.proteinGrams': 'Protein (g)', 'coaching.builder.carbsGrams': 'Carbohydrates (g)',
        'coaching.builder.fatGrams': 'Fat (g)', 'coaching.builder.basalMetabolicRate': 'Basal metabolic rate (BMR)',
        'coaching.builder.dailyEnergyNeeds': 'Total daily energy expenditure (TDEE)',
        'coaching.builder.calculationTarget': 'Suggested target',
        'coaching.builder.targetCaloriesLabel': 'Target calories',
        'coaching.measurement.edit': 'Edit measurement',
        'coaching.measurement.saved': 'Measurement saved successfully.',
        'coaching.checkin.question': 'How was the trainee’s day?',
        'coaching.checkin.edit': 'Edit daily check-in',
        'coaching.checkin.saved': 'Daily check-in saved successfully.',
        'coaching.client.updated': 'Client details updated.',
        'coaching.session.started': 'Training session started.',
        'coaching.session.savedSet': 'Set saved.',
        'coaching.session.ended': 'Session ended and progress saved.',
        'coaching.meal.saved': 'Meal and nutrition totals saved.'
    });

    const gymLibraryScreenArabic = Object.freeze({
        'gymLibrary.kicker': 'مرجع الجيم', 'gymLibrary.title': 'مكتبة التدريب والتغذية',
        'gymLibrary.description': 'إدارة بيانات الأطعمة والتمارين لاستخدامها في الأنظمة الغذائية والتدريبية.',
        'gymLibrary.add.default': 'إضافة عنصر', 'gymLibrary.tablist': 'أقسام المكتبة',
        'gymLibrary.type.muscles': 'العضلات', 'gymLibrary.type.foods': 'الأطعمة', 'gymLibrary.type.exercises': 'التمارين',
        'gymLibrary.type.muscles.singular': 'عضلة', 'gymLibrary.type.foods.singular': 'طعام', 'gymLibrary.type.exercises.singular': 'تمرين',
        'gymLibrary.type.muscles.add': 'إضافة عضلة', 'gymLibrary.type.foods.add': 'إضافة طعام', 'gymLibrary.type.exercises.add': 'إضافة تمرين',
        'gymLibrary.type.muscles.empty': 'لا توجد عضلات مطابقة للبحث.', 'gymLibrary.type.foods.empty': 'لا توجد أطعمة مطابقة للبحث.', 'gymLibrary.type.exercises.empty': 'لا توجد تمارين مطابقة للبحث.',
        'gymLibrary.search.label': 'بحث في المكتبة', 'gymLibrary.search.placeholder': 'ابحث بالاسم أو الوصف...', 'gymLibrary.refresh': 'تحديث',
        'gymLibrary.loading.initial': 'افتح تبويب المكتبة لتحميل البيانات...', 'gymLibrary.loading.list': 'جاري تحميل بيانات المكتبة...',
        'gymLibrary.filter.bodyPart.label': 'فلترة منطقة الجسم', 'gymLibrary.filter.bodyPart.all': 'كل مناطق الجسم',
        'gymLibrary.filter.category.food.label': 'فلترة تصنيف الطعام', 'gymLibrary.filter.category.exercise.label': 'فلترة تصنيف التمرين', 'gymLibrary.filter.category.all': 'كل التصنيفات',
        'gymLibrary.filter.difficulty.label': 'فلترة مستوى التمرين', 'gymLibrary.filter.difficulty.all': 'كل المستويات',
        'gymLibrary.filter.equipment.label': 'فلترة أدوات التمرين', 'gymLibrary.filter.equipment.all': 'كل الأدوات',
        'gymLibrary.filter.targetMuscle.label': 'فلترة العضلة المستهدفة', 'gymLibrary.filter.targetMuscle.all': 'كل العضلات المستهدفة',
        'gymLibrary.table.muscle': 'العضلة', 'gymLibrary.table.bodyPart': 'منطقة الجسم', 'gymLibrary.table.description': 'الوصف', 'gymLibrary.table.number': 'الرقم',
        'gymLibrary.table.food': 'الطعام', 'gymLibrary.table.category': 'التصنيف', 'gymLibrary.table.calories': 'السعرات', 'gymLibrary.table.protein': 'البروتين', 'gymLibrary.table.carbs': 'الكربوهيدرات', 'gymLibrary.table.fat': 'الدهون', 'gymLibrary.table.serving': 'الحصة',
        'gymLibrary.table.exercise': 'التمرين', 'gymLibrary.table.targetMuscle': 'العضلة المستهدفة', 'gymLibrary.table.difficulty': 'المستوى', 'gymLibrary.table.equipment': 'الأداة', 'gymLibrary.table.alert': 'التنبيه', 'gymLibrary.table.actions': 'الإجراءات',
        'gymLibrary.action.details': 'التفاصيل', 'gymLibrary.action.edit': 'تعديل', 'gymLibrary.action.delete': 'حذف', 'gymLibrary.action.previous': 'السابق', 'gymLibrary.action.next': 'التالي',
        'gymLibrary.pagination.info': 'عرض {{from}}–{{to}} من {{total}} {{item}}', 'gymLibrary.pagination.page': 'صفحة {{page}} من {{pages}}',
        'gymLibrary.row.descriptionAvailable': 'وصف متاح', 'gymLibrary.row.highImpact': 'مجهود مرتفع',
        'gymLibrary.unit.calorie': 'سعرة', 'gymLibrary.unit.gram': 'جرام', 'gymLibrary.unit.protein': 'بروتين', 'gymLibrary.unit.carbs': 'كارب', 'gymLibrary.unit.fat': 'دهون',
        'gymLibrary.value.unspecified': 'غير محدد', 'gymLibrary.value.unspecifiedFem': 'غير محددة', 'gymLibrary.value.notAvailable': 'غير متوفر في بيانات المصدر',
        'gymLibrary.form.nameArabic': 'الاسم بالعربية', 'gymLibrary.form.nameEnglish': 'الاسم بالإنجليزية', 'gymLibrary.form.bodyPart': 'منطقة الجسم', 'gymLibrary.form.icon': 'الأيقونة',
        'gymLibrary.form.descriptionArabic': 'الوصف بالعربية', 'gymLibrary.form.descriptionEnglish': 'الوصف بالإنجليزية', 'gymLibrary.form.foodNameArabic': 'اسم الطعام بالعربية', 'gymLibrary.form.foodNameEnglish': 'اسم الطعام بالإنجليزية',
        'gymLibrary.form.category': 'التصنيف', 'gymLibrary.form.servingUnit': 'وحدة الحصة', 'gymLibrary.form.servingSize': 'حجم الحصة', 'gymLibrary.form.basicData': 'البيانات الأساسية',
        'gymLibrary.form.nutrition': 'القيم الغذائية لكل حصة', 'gymLibrary.form.calories': 'السعرات الحرارية', 'gymLibrary.form.protein': 'البروتين', 'gymLibrary.form.carbs': 'الكربوهيدرات', 'gymLibrary.form.fat': 'الدهون', 'gymLibrary.form.fiber': 'الألياف', 'gymLibrary.form.sugar': 'السكريات', 'gymLibrary.form.sodium': 'الصوديوم',
        'gymLibrary.form.exerciseData': 'بيانات التمرين', 'gymLibrary.form.exerciseNameArabic': 'اسم التمرين بالعربية', 'gymLibrary.form.exerciseNameEnglish': 'الاسم بالإنجليزية', 'gymLibrary.form.targetMuscle': 'العضلة المستهدفة',
        'gymLibrary.form.equipment': 'الأداة', 'gymLibrary.form.difficulty': 'المستوى', 'gymLibrary.form.movementPattern': 'نمط الحركة', 'gymLibrary.form.mechanic': 'الميكانيكية', 'gymLibrary.form.force': 'نوع القوة',
        'gymLibrary.form.repsRange': 'مدى التكرارات', 'gymLibrary.form.setsRange': 'مدى المجموعات', 'gymLibrary.form.rest': 'الراحة بالثواني', 'gymLibrary.form.tempo': 'الإيقاع', 'gymLibrary.form.highImpact': 'تمرين عالي المجهود', 'gymLibrary.form.video': 'رابط الفيديو',
        'gymLibrary.form.trainingContent': 'المحتوى التدريبي — اكتب كل نقطة في سطر', 'gymLibrary.form.secondaryMuscles': 'العضلات الثانوية', 'gymLibrary.form.instructionsArabic': 'التعليمات بالعربية', 'gymLibrary.form.instructionsEnglish': 'التعليمات بالإنجليزية',
        'gymLibrary.form.tipsArabic': 'النصائح بالعربية', 'gymLibrary.form.tipsEnglish': 'النصائح بالإنجليزية', 'gymLibrary.form.mistakesArabic': 'الأخطاء الشائعة بالعربية', 'gymLibrary.form.mistakesEnglish': 'الأخطاء الشائعة بالإنجليزية',
        'gymLibrary.form.secondaryMuscles.placeholder': 'كل عنصر في سطر مستقل', 'gymLibrary.form.secondaryMuscles.example': 'رقم العضلة، نسبة المساهمة مثل: 35, 25',
        'gymLibrary.form.chooseMuscle': 'اختر العضلة', 'gymLibrary.form.edit.title': 'تعديل {{item}}', 'gymLibrary.form.add.description': 'أدخل البيانات الأساسية، ويمكنك استكمال التفاصيل لاحقًا.',
        'gymLibrary.form.edit.description': 'حدّث البيانات ثم احفظ التعديلات في المكتبة.', 'gymLibrary.form.saveChanges': 'حفظ التعديلات', 'gymLibrary.form.saveItem': 'حفظ العنصر',
        'gymLibrary.dialog.close': 'إغلاق', 'gymLibrary.dialog.cancel': 'إلغاء', 'gymLibrary.details.title': 'تفاصيل {{item}}', 'gymLibrary.details.subtitle': '{{name}} · رقم {{id}}',
        'gymLibrary.details.nameArabic': 'الاسم بالعربية', 'gymLibrary.details.nameEnglish': 'الاسم بالإنجليزية', 'gymLibrary.details.bodyPart': 'منطقة الجسم', 'gymLibrary.details.sourceId': 'المعرّف المصدر',
        'gymLibrary.details.descriptionArabic': 'الوصف بالعربية', 'gymLibrary.details.descriptionEnglish': 'الوصف بالإنجليزية', 'gymLibrary.details.category': 'التصنيف', 'gymLibrary.details.serving': 'الحصة',
        'gymLibrary.details.calories': 'السعرات', 'gymLibrary.details.protein': 'البروتين', 'gymLibrary.details.carbs': 'الكربوهيدرات', 'gymLibrary.details.fat': 'الدهون', 'gymLibrary.details.fiber': 'الألياف', 'gymLibrary.details.sugar': 'السكريات', 'gymLibrary.details.sodium': 'الصوديوم',
        'gymLibrary.details.primaryMuscle': 'العضلة الأساسية', 'gymLibrary.details.difficulty': 'المستوى', 'gymLibrary.details.equipment': 'الأداة', 'gymLibrary.details.movementPattern': 'نمط الحركة', 'gymLibrary.details.mechanic': 'الميكانيكية', 'gymLibrary.details.force': 'نوع القوة',
        'gymLibrary.details.repsRange': 'مدى التكرارات', 'gymLibrary.details.setsRange': 'مدى المجموعات', 'gymLibrary.details.rest': 'الراحة', 'gymLibrary.details.highImpact': 'التمرين عالي المجهود', 'gymLibrary.details.video': 'رابط الفيديو',
        'gymLibrary.details.secondaryMuscles': 'العضلات الثانوية', 'gymLibrary.details.instructionsArabic': 'التعليمات بالعربية', 'gymLibrary.details.instructionsEnglish': 'التعليمات بالإنجليزية', 'gymLibrary.details.tipsArabic': 'النصائح بالعربية', 'gymLibrary.details.tipsEnglish': 'النصائح بالإنجليزية', 'gymLibrary.details.mistakesArabic': 'الأخطاء الشائعة بالعربية', 'gymLibrary.details.mistakesEnglish': 'الأخطاء الشائعة بالإنجليزية',
        'gymLibrary.details.englishNameUnavailable': 'الاسم الإنجليزي غير متاح', 'gymLibrary.details.arabicNameUnavailable': 'الاسم العربي غير متاح', 'gymLibrary.details.primaryMuscleUnavailable': 'العضلة الأساسية غير محددة',
        'gymLibrary.details.noSecondaryMuscles': 'لم تُسجل عضلات ثانوية في بيانات التمرين', 'gymLibrary.details.stepsArabicUnavailable': 'الخطوات العربية غير متاحة في بيانات المصدر', 'gymLibrary.details.stepsEnglishUnavailable': 'الخطوات الإنجليزية غير متاحة في بيانات المصدر',
        'gymLibrary.details.tipsArabicUnavailable': 'النصائح العربية غير متاحة في بيانات المصدر', 'gymLibrary.details.tipsEnglishUnavailable': 'النصائح الإنجليزية غير متاحة في بيانات المصدر', 'gymLibrary.details.mistakesArabicUnavailable': 'الأخطاء الشائعة بالعربية غير متاحة في بيانات المصدر', 'gymLibrary.details.mistakesEnglishUnavailable': 'الأخطاء الشائعة بالإنجليزية غير متاحة في بيانات المصدر',
        'gymLibrary.details.targetMuscle': 'العضلة المستهدفة', 'gymLibrary.details.anatomyNote': 'الصور التشريحية من Z-Anatomy / BodyParts3D بهوية {{brand}} الحديثة. السجلات غير المطابقة تعرض fallback لحين المراجعة.', 'gymLibrary.details.startPose': 'وضع البداية', 'gymLibrary.details.endPose': 'وضع النهاية',
        'gymLibrary.confirm.delete.title': 'تأكيد الحذف', 'gymLibrary.confirm.delete.body': 'هل تريد حذف {{name}}؟', 'gymLibrary.confirm.delete.confirm': 'نعم، احذف',
        'gymLibrary.error.request': 'تعذر تنفيذ الطلب.', 'gymLibrary.error.secondaryList': 'العضلات الثانوية يجب أن تكون قائمة.', 'gymLibrary.error.secondaryFormat': 'صيغة العضلات الثانوية: رقم العضلة، النسبة.',
        'gymLibrary.success.saved': 'تم حفظ التعديلات بنجاح.', 'gymLibrary.success.added': 'تمت إضافة {{item}} بنجاح.', 'gymLibrary.success.deleted': 'تم حذف {{item}} بنجاح.',
        'gymLibrary.value.meat': 'لحوم', 'gymLibrary.value.poultry': 'دواجن', 'gymLibrary.value.seafood': 'مأكولات بحرية', 'gymLibrary.value.fish': 'أسماك', 'gymLibrary.value.dairy': 'ألبان', 'gymLibrary.value.eggs': 'بيض', 'gymLibrary.value.grains': 'حبوب', 'gymLibrary.value.cereals': 'حبوب', 'gymLibrary.value.fruits': 'فواكه', 'gymLibrary.value.fruit': 'فواكه', 'gymLibrary.value.vegetables': 'خضروات', 'gymLibrary.value.vegetable': 'خضروات', 'gymLibrary.value.legumes': 'بقوليات', 'gymLibrary.value.nuts': 'مكسرات', 'gymLibrary.value.oils': 'زيوت', 'gymLibrary.value.beverages': 'مشروبات', 'gymLibrary.value.sweets': 'حلويات', 'gymLibrary.value.snacks': 'وجبات خفيفة', 'gymLibrary.value.supplements': 'مكملات', 'gymLibrary.value.other': 'أخرى',
        'gymLibrary.value.upperBody': 'الجزء العلوي', 'gymLibrary.value.lowerBody': 'الجزء السفلي', 'gymLibrary.value.core': 'الجذع', 'gymLibrary.value.neck': 'الرقبة', 'gymLibrary.value.shoulders': 'الكتفان', 'gymLibrary.value.arms': 'الذراعان', 'gymLibrary.value.legs': 'الساقان', 'gymLibrary.value.back': 'الظهر', 'gymLibrary.value.chest': 'الصدر',
        'gymLibrary.value.beginner': 'مبتدئ', 'gymLibrary.value.intermediate': 'متوسط', 'gymLibrary.value.advanced': 'متقدم', 'gymLibrary.value.expert': 'خبير', 'gymLibrary.value.bodyOnly': 'وزن الجسم', 'gymLibrary.value.barbell': 'بار', 'gymLibrary.value.dumbbell': 'دامبل', 'gymLibrary.value.cable': 'كابل', 'gymLibrary.value.kettlebells': 'كيتل بيل', 'gymLibrary.value.machine': 'جهاز', 'gymLibrary.value.bands': 'أشرطة مقاومة', 'gymLibrary.value.ezBar': 'بار EZ', 'gymLibrary.value.strength': 'قوة', 'gymLibrary.value.stretching': 'إطالة', 'gymLibrary.value.plyometrics': 'تمارين انفجارية', 'gymLibrary.value.cardio': 'كارديو', 'gymLibrary.value.powerlifting': 'باور ليفتنج', 'gymLibrary.value.olympic': 'أولمبي', 'gymLibrary.value.strongman': 'سترونجمان',
        'gymLibrary.value.gram': 'جرام', 'gymLibrary.value.kilogram': 'كجم', 'gymLibrary.value.milliliter': 'مل', 'gymLibrary.value.serving': 'حصة', 'gymLibrary.value.piece': 'قطعة',
        'gymLibrary.value.kg': 'كجم', 'gymLibrary.value.g': 'جرام', 'gymLibrary.value.ml': 'مل', 'gymLibrary.value.bodyOnlyLabel': 'وزن الجسم', 'gymLibrary.value.unavailable': 'غير متوفر في بيانات المصدر',
        'gymLibrary.value.meals': 'وجبات', 'gymLibrary.value.itemWithoutName': 'عنصر بدون اسم', 'gymLibrary.value.seconds': 'ثانية', 'gymLibrary.value.milligrams': 'ملجم', 'gymLibrary.value.yes': 'نعم', 'gymLibrary.value.no': 'لا'
    });

    const gymLibraryScreenEnglish = Object.freeze({
        'gymLibrary.kicker': 'Gym reference', 'gymLibrary.title': 'Training & nutrition library',
        'gymLibrary.description': 'Manage food and exercise data used in nutrition and training plans.',
        'gymLibrary.add.default': 'Add item', 'gymLibrary.tablist': 'Library sections',
        'gymLibrary.type.muscles': 'Muscles', 'gymLibrary.type.foods': 'Foods', 'gymLibrary.type.exercises': 'Exercises',
        'gymLibrary.type.muscles.singular': 'muscle', 'gymLibrary.type.foods.singular': 'food', 'gymLibrary.type.exercises.singular': 'exercise',
        'gymLibrary.type.muscles.add': 'Add muscle', 'gymLibrary.type.foods.add': 'Add food', 'gymLibrary.type.exercises.add': 'Add exercise',
        'gymLibrary.type.muscles.empty': 'No matching muscles found.', 'gymLibrary.type.foods.empty': 'No matching foods found.', 'gymLibrary.type.exercises.empty': 'No matching exercises found.',
        'gymLibrary.search.label': 'Search library', 'gymLibrary.search.placeholder': 'Search by name or description…', 'gymLibrary.refresh': 'Refresh',
        'gymLibrary.loading.initial': 'Open the Library tab to load data…', 'gymLibrary.loading.list': 'Loading library data…',
        'gymLibrary.filter.bodyPart.label': 'Filter by body part', 'gymLibrary.filter.bodyPart.all': 'All body parts',
        'gymLibrary.filter.category.food.label': 'Filter food category', 'gymLibrary.filter.category.exercise.label': 'Filter exercise category', 'gymLibrary.filter.category.all': 'All categories',
        'gymLibrary.filter.difficulty.label': 'Filter difficulty', 'gymLibrary.filter.difficulty.all': 'All levels',
        'gymLibrary.filter.equipment.label': 'Filter equipment', 'gymLibrary.filter.equipment.all': 'All equipment',
        'gymLibrary.filter.targetMuscle.label': 'Filter target muscle', 'gymLibrary.filter.targetMuscle.all': 'All target muscles',
        'gymLibrary.table.muscle': 'Muscle', 'gymLibrary.table.bodyPart': 'Body part', 'gymLibrary.table.description': 'Description', 'gymLibrary.table.number': 'ID',
        'gymLibrary.table.food': 'Food', 'gymLibrary.table.category': 'Category', 'gymLibrary.table.calories': 'Calories', 'gymLibrary.table.protein': 'Protein', 'gymLibrary.table.carbs': 'Carbohydrates', 'gymLibrary.table.fat': 'Fat', 'gymLibrary.table.serving': 'Serving',
        'gymLibrary.table.exercise': 'Exercise', 'gymLibrary.table.targetMuscle': 'Target muscle', 'gymLibrary.table.difficulty': 'Difficulty', 'gymLibrary.table.equipment': 'Equipment', 'gymLibrary.table.alert': 'Notice', 'gymLibrary.table.actions': 'Actions',
        'gymLibrary.action.details': 'Details', 'gymLibrary.action.edit': 'Edit', 'gymLibrary.action.delete': 'Delete', 'gymLibrary.action.previous': 'Previous', 'gymLibrary.action.next': 'Next',
        'gymLibrary.pagination.info': 'Showing {{from}}–{{to}} of {{total}} {{item}}', 'gymLibrary.pagination.page': 'Page {{page}} of {{pages}}',
        'gymLibrary.row.descriptionAvailable': 'Description available', 'gymLibrary.row.highImpact': 'High impact',
        'gymLibrary.unit.calorie': 'cal', 'gymLibrary.unit.gram': 'g', 'gymLibrary.unit.protein': 'protein', 'gymLibrary.unit.carbs': 'carbs', 'gymLibrary.unit.fat': 'fat',
        'gymLibrary.value.unspecified': 'Unspecified', 'gymLibrary.value.unspecifiedFem': 'Unspecified', 'gymLibrary.value.notAvailable': 'Not available in source data',
        'gymLibrary.form.nameArabic': 'Arabic name', 'gymLibrary.form.nameEnglish': 'English name', 'gymLibrary.form.bodyPart': 'Body part', 'gymLibrary.form.icon': 'Icon',
        'gymLibrary.form.descriptionArabic': 'Arabic description', 'gymLibrary.form.descriptionEnglish': 'English description', 'gymLibrary.form.foodNameArabic': 'Food name in Arabic', 'gymLibrary.form.foodNameEnglish': 'Food name in English',
        'gymLibrary.form.category': 'Category', 'gymLibrary.form.servingUnit': 'Serving unit', 'gymLibrary.form.servingSize': 'Serving size', 'gymLibrary.form.basicData': 'Basic information',
        'gymLibrary.form.nutrition': 'Nutrition per serving', 'gymLibrary.form.calories': 'Calories', 'gymLibrary.form.protein': 'Protein', 'gymLibrary.form.carbs': 'Carbohydrates', 'gymLibrary.form.fat': 'Fat', 'gymLibrary.form.fiber': 'Fiber', 'gymLibrary.form.sugar': 'Sugar', 'gymLibrary.form.sodium': 'Sodium',
        'gymLibrary.form.exerciseData': 'Exercise information', 'gymLibrary.form.exerciseNameArabic': 'Exercise name in Arabic', 'gymLibrary.form.exerciseNameEnglish': 'English name', 'gymLibrary.form.targetMuscle': 'Target muscle',
        'gymLibrary.form.equipment': 'Equipment', 'gymLibrary.form.difficulty': 'Difficulty', 'gymLibrary.form.movementPattern': 'Movement pattern', 'gymLibrary.form.mechanic': 'Mechanic', 'gymLibrary.form.force': 'Force type',
        'gymLibrary.form.repsRange': 'Rep range', 'gymLibrary.form.setsRange': 'Set range', 'gymLibrary.form.rest': 'Rest (seconds)', 'gymLibrary.form.tempo': 'Tempo', 'gymLibrary.form.highImpact': 'High-impact exercise', 'gymLibrary.form.video': 'Video URL',
        'gymLibrary.form.trainingContent': 'Training content — enter one item per line', 'gymLibrary.form.secondaryMuscles': 'Secondary muscles', 'gymLibrary.form.instructionsArabic': 'Instructions in Arabic', 'gymLibrary.form.instructionsEnglish': 'Instructions in English',
        'gymLibrary.form.tipsArabic': 'Tips in Arabic', 'gymLibrary.form.tipsEnglish': 'Tips in English', 'gymLibrary.form.mistakesArabic': 'Common mistakes in Arabic', 'gymLibrary.form.mistakesEnglish': 'Common mistakes in English',
        'gymLibrary.form.secondaryMuscles.placeholder': 'Enter one item per line', 'gymLibrary.form.secondaryMuscles.example': 'Muscle ID, contribution percentage, e.g. 35, 25',
        'gymLibrary.form.chooseMuscle': 'Choose a muscle', 'gymLibrary.form.edit.title': 'Edit {{item}}', 'gymLibrary.form.add.description': 'Enter the basic information. You can add more details later.',
        'gymLibrary.form.edit.description': 'Update the information, then save your changes to the library.', 'gymLibrary.form.saveChanges': 'Save changes', 'gymLibrary.form.saveItem': 'Save item',
        'gymLibrary.dialog.close': 'Close', 'gymLibrary.dialog.cancel': 'Cancel', 'gymLibrary.details.title': '{{item}} details', 'gymLibrary.details.subtitle': '{{name}} · ID {{id}}',
        'gymLibrary.details.nameArabic': 'Arabic name', 'gymLibrary.details.nameEnglish': 'English name', 'gymLibrary.details.bodyPart': 'Body part', 'gymLibrary.details.sourceId': 'Source ID',
        'gymLibrary.details.descriptionArabic': 'Arabic description', 'gymLibrary.details.descriptionEnglish': 'English description', 'gymLibrary.details.category': 'Category', 'gymLibrary.details.serving': 'Serving',
        'gymLibrary.details.calories': 'Calories', 'gymLibrary.details.protein': 'Protein', 'gymLibrary.details.carbs': 'Carbohydrates', 'gymLibrary.details.fat': 'Fat', 'gymLibrary.details.fiber': 'Fiber', 'gymLibrary.details.sugar': 'Sugar', 'gymLibrary.details.sodium': 'Sodium',
        'gymLibrary.details.primaryMuscle': 'Primary muscle', 'gymLibrary.details.difficulty': 'Difficulty', 'gymLibrary.details.equipment': 'Equipment', 'gymLibrary.details.movementPattern': 'Movement pattern', 'gymLibrary.details.mechanic': 'Mechanic', 'gymLibrary.details.force': 'Force type',
        'gymLibrary.details.repsRange': 'Rep range', 'gymLibrary.details.setsRange': 'Set range', 'gymLibrary.details.rest': 'Rest', 'gymLibrary.details.highImpact': 'High-impact exercise', 'gymLibrary.details.video': 'Video URL',
        'gymLibrary.details.secondaryMuscles': 'Secondary muscles', 'gymLibrary.details.instructionsArabic': 'Instructions in Arabic', 'gymLibrary.details.instructionsEnglish': 'Instructions in English', 'gymLibrary.details.tipsArabic': 'Tips in Arabic', 'gymLibrary.details.tipsEnglish': 'Tips in English', 'gymLibrary.details.mistakesArabic': 'Common mistakes in Arabic', 'gymLibrary.details.mistakesEnglish': 'Common mistakes in English',
        'gymLibrary.details.englishNameUnavailable': 'English name unavailable', 'gymLibrary.details.arabicNameUnavailable': 'Arabic name unavailable', 'gymLibrary.details.primaryMuscleUnavailable': 'Primary muscle not specified',
        'gymLibrary.details.noSecondaryMuscles': 'No secondary muscles are recorded for this exercise', 'gymLibrary.details.stepsArabicUnavailable': 'Arabic steps are not available in the source data', 'gymLibrary.details.stepsEnglishUnavailable': 'English steps are not available in the source data',
        'gymLibrary.details.tipsArabicUnavailable': 'Arabic tips are not available in the source data', 'gymLibrary.details.tipsEnglishUnavailable': 'English tips are not available in the source data', 'gymLibrary.details.mistakesArabicUnavailable': 'Arabic common mistakes are not available in the source data', 'gymLibrary.details.mistakesEnglishUnavailable': 'English common mistakes are not available in the source data',
        'gymLibrary.details.targetMuscle': 'Target muscle', 'gymLibrary.details.anatomyNote': 'Anatomical images from Z-Anatomy / BodyParts3D with {{brand}} identity. Unmatched records use a fallback until reviewed.', 'gymLibrary.details.startPose': 'Starting position', 'gymLibrary.details.endPose': 'Ending position',
        'gymLibrary.confirm.delete.title': 'Confirm deletion', 'gymLibrary.confirm.delete.body': 'Delete {{name}}?', 'gymLibrary.confirm.delete.confirm': 'Yes, delete',
        'gymLibrary.error.request': 'Could not complete the request.', 'gymLibrary.error.secondaryList': 'Secondary muscles must be a list.', 'gymLibrary.error.secondaryFormat': 'Use this format for secondary muscles: muscle ID, percentage.',
        'gymLibrary.success.saved': 'Changes saved successfully.', 'gymLibrary.success.added': '{{item}} added successfully.', 'gymLibrary.success.deleted': '{{item}} deleted successfully.',
        'gymLibrary.value.meat': 'Meat', 'gymLibrary.value.poultry': 'Poultry', 'gymLibrary.value.seafood': 'Seafood', 'gymLibrary.value.fish': 'Fish', 'gymLibrary.value.dairy': 'Dairy', 'gymLibrary.value.eggs': 'Eggs', 'gymLibrary.value.grains': 'Grains', 'gymLibrary.value.cereals': 'Cereals', 'gymLibrary.value.fruits': 'Fruit', 'gymLibrary.value.fruit': 'Fruit', 'gymLibrary.value.vegetables': 'Vegetables', 'gymLibrary.value.vegetable': 'Vegetable', 'gymLibrary.value.legumes': 'Legumes', 'gymLibrary.value.nuts': 'Nuts', 'gymLibrary.value.oils': 'Oils', 'gymLibrary.value.beverages': 'Beverages', 'gymLibrary.value.sweets': 'Sweets', 'gymLibrary.value.snacks': 'Snacks', 'gymLibrary.value.supplements': 'Supplements', 'gymLibrary.value.other': 'Other',
        'gymLibrary.value.upperBody': 'Upper body', 'gymLibrary.value.lowerBody': 'Lower body', 'gymLibrary.value.core': 'Core', 'gymLibrary.value.neck': 'Neck', 'gymLibrary.value.shoulders': 'Shoulders', 'gymLibrary.value.arms': 'Arms', 'gymLibrary.value.legs': 'Legs', 'gymLibrary.value.back': 'Back', 'gymLibrary.value.chest': 'Chest',
        'gymLibrary.value.beginner': 'Beginner', 'gymLibrary.value.intermediate': 'Intermediate', 'gymLibrary.value.advanced': 'Advanced', 'gymLibrary.value.expert': 'Expert', 'gymLibrary.value.bodyOnly': 'Body only', 'gymLibrary.value.barbell': 'Barbell', 'gymLibrary.value.dumbbell': 'Dumbbell', 'gymLibrary.value.cable': 'Cable', 'gymLibrary.value.kettlebells': 'Kettlebells', 'gymLibrary.value.machine': 'Machine', 'gymLibrary.value.bands': 'Resistance bands', 'gymLibrary.value.ezBar': 'EZ curl bar', 'gymLibrary.value.strength': 'Strength', 'gymLibrary.value.stretching': 'Stretching', 'gymLibrary.value.plyometrics': 'Plyometrics', 'gymLibrary.value.cardio': 'Cardio', 'gymLibrary.value.powerlifting': 'Powerlifting', 'gymLibrary.value.olympic': 'Olympic weightlifting', 'gymLibrary.value.strongman': 'Strongman',
        'gymLibrary.value.gram': 'g', 'gymLibrary.value.kilogram': 'kg', 'gymLibrary.value.milliliter': 'ml', 'gymLibrary.value.serving': 'serving', 'gymLibrary.value.piece': 'piece',
        'gymLibrary.value.kg': 'kg', 'gymLibrary.value.g': 'g', 'gymLibrary.value.ml': 'ml', 'gymLibrary.value.bodyOnlyLabel': 'Body only', 'gymLibrary.value.unavailable': 'Not available in source data',
        'gymLibrary.value.meals': 'Meals', 'gymLibrary.value.itemWithoutName': 'Unnamed item', 'gymLibrary.value.seconds': 'seconds', 'gymLibrary.value.milligrams': 'mg', 'gymLibrary.value.yes': 'Yes', 'gymLibrary.value.no': 'No'
    });

    const membershipManagementScreenArabic = Object.freeze({
        'membershipManagement.kicker': 'إدارة النظام',
        'membershipManagement.title': 'الأسعار والعضويات',
        'membershipManagement.description': 'تحكم في الباقات وأنواع العضويات من مكان واحد.',
        'membershipManagement.pricingShortcut.title': 'أسعار الباقات',
        'membershipManagement.pricingShortcut.description': 'تعديل أسعار الجيم والكارديو.',
        'membershipManagement.typesShortcut.title': 'أنواع العضويات',
        'membershipManagement.typesShortcut.description': 'إدارة المدد ومعاملات الأسعار.',
        'membershipManagement.pricing.eyebrow': 'إدارة الإيرادات',
        'membershipManagement.pricing.title': 'أسعار الباقات',
        'membershipManagement.pricing.description': 'تحكم في أسعار الباقات وقيمة كل مدة من مساحة واحدة.',
        'membershipManagement.pricing.section.title': 'أسعار الباقات',
        'membershipManagement.pricing.section.description': 'اضبط السعر الشهري وسعر كل مدة بشكل مستقل لكل باقة.',
        'membershipManagement.pricing.card.durations': 'أسعار المدد',
        'membershipManagement.pricing.card.durationSingular': 'مدة',
        'membershipManagement.pricing.card.durationPlural': 'مدد',
        'membershipManagement.pricing.card.currency': 'ج.م',
        'membershipManagement.pricing.addPlan': 'إضافة باقة جديدة',
        'membershipManagement.pricing.column.plan': 'الباقة',
        'membershipManagement.pricing.column.monthly': 'السعر الشهري',
        'membershipManagement.pricing.column.independent': 'سعر مستقل',
        'membershipManagement.pricing.column.status': 'الحالة',
        'membershipManagement.pricing.column.actions': 'الإجراء',
        'membershipManagement.pricing.status.active': 'نشطة',
        'membershipManagement.pricing.status.hidden': 'غير ظاهرة',
        'membershipManagement.pricing.action.edit': 'تعديل',
        'membershipManagement.pricing.action.editAria': 'تعديل الباقة {{name}}',
        'membershipManagement.pricing.input.planName': 'اسم الباقة {{name}}',
        'membershipManagement.pricing.input.monthlyPrice': 'السعر الشهري لباقة {{name}}',
        'membershipManagement.pricing.input.durationPrice': 'سعر باقة {{plan}} لمدة {{type}}',
        'membershipManagement.pricing.loading': 'جارٍ تحميل الأسعار…',
        'membershipManagement.types.loading': 'جارٍ تحميل أنواع العضويات…',
        'membershipManagement.dayPass.loading': 'جارٍ تحميل أسعار الحصص…',
        'membershipManagement.pricing.empty': 'لا توجد باقات أسعار متاحة.',
        'membershipManagement.error.catalogUnavailable': 'تعذر تحميل أسعار العضويات. حاول مرة أخرى.',
        'membershipManagement.pricing.close': 'إغلاق',
        'membershipManagement.pricing.save': 'حفظ أسعار الباقات',
        'membershipManagement.pricing.saveLoading': 'جارٍ حفظ الأسعار…',
        'membershipManagement.pricing.saved': 'تم حفظ أسعار الاشتراكات.',
        'membershipManagement.dayPass.title': 'أسعار الحصص اليومية',
        'membershipManagement.dayPass.description': 'اضبط سعر دخول اليوم الواحد بشكل مستقل عن اشتراكات الأعضاء.',
        'membershipManagement.dayPass.note': 'إيراد مستقل',
        'membershipManagement.dayPass.column.type': 'نوع الحصة',
        'membershipManagement.dayPass.column.price': 'السعر',
        'membershipManagement.dayPass.column.status': 'الحالة',
        'membershipManagement.dayPass.active': 'مفعل',
        'membershipManagement.dayPass.inactive': 'غير مفعل',
        'membershipManagement.dayPass.empty': 'لا توجد أسعار حصص.',
        'membershipManagement.dayPass.priceFor': 'سعر {{name}}',
        'membershipManagement.dayPass.save': 'حفظ أسعار الحصص',
        'membershipManagement.dayPass.ownerOnly': 'تعديل الأسعار متاح لمالك النظام فقط',
        'membershipManagement.types.eyebrow': 'إدارة الاشتراكات',
        'membershipManagement.types.title': 'أنواع العضويات',
        'membershipManagement.types.description': 'أضف أو عدّل مدد العضويات ومعاملات أسعارها بشكل مستقل.',
        'membershipManagement.types.section.title': 'أنواع العضويات',
        'membershipManagement.types.section.description': 'مثل نصف الشهر، الشهرية، الربع سنوية وباقي المدد.',
        'membershipManagement.types.card.eyebrow': 'نوع العضوية',
        'membershipManagement.types.add': 'إضافة نوع جديد',
        'membershipManagement.types.column.type': 'النوع',
        'membershipManagement.types.column.duration': 'المدة',
        'membershipManagement.types.column.multiplier': 'معامل السعر',
        'membershipManagement.types.column.status': 'الحالة',
        'membershipManagement.types.column.action': 'الإجراء',
        'membershipManagement.types.status.active': 'نشط',
        'membershipManagement.types.status.hidden': 'غير ظاهر',
        'membershipManagement.types.action.edit': 'تعديل',
        'membershipManagement.types.action.editAria': 'تعديل نوع العضوية {{name}}',
        'membershipManagement.types.action.delete': 'حذف',
        'membershipManagement.types.action.deleteAria': 'حذف نوع العضوية {{name}}',
        'membershipManagement.types.duration.days': '{{count}} يوم',
        'membershipManagement.types.duration.months': '{{count}} شهر',
        'membershipManagement.types.empty': 'لا توجد أنواع عضويات.',
        'membershipManagement.types.deleted': 'تم حذف نوع العضوية.',
        'membershipManagement.types.close': 'إغلاق',
        'membershipManagement.type.add.title': 'إضافة نوع عضوية جديد',
        'membershipManagement.type.edit.title': 'تعديل نوع العضوية',
        'membershipManagement.type.add.description': 'أدخل بيانات النوع الجديد ليظهر مباشرة عند إضافة أو تجديد الاشتراك.',
        'membershipManagement.type.edit.description': 'يمكنك تعديل المدة أو السعر أو إخفاء النوع من قوائم الاشتراك.',
        'membershipManagement.type.code': 'رمز النوع *',
        'membershipManagement.type.code.placeholder': 'مثال: weekly',
        'membershipManagement.type.code.hint': 'بالإنجليزية للاستخدام البرمجي فقط.',
        'membershipManagement.type.name': 'اسم النوع *',
        'membershipManagement.type.name.placeholder': 'مثال: أسبوعية',
        'membershipManagement.type.mode': 'وحدة المدة *',
        'membershipManagement.type.mode.months': 'شهور',
        'membershipManagement.type.mode.days': 'أيام',
        'membershipManagement.type.mode.monthsSingular': 'شهر',
        'membershipManagement.type.mode.daysSingular': 'يوم',
        'membershipManagement.type.mode.monthsPlural': 'شهور',
        'membershipManagement.type.mode.daysPlural': 'أيام',
        'membershipManagement.type.duration': 'قيمة المدة *',
        'membershipManagement.type.multiplier': 'معامل السعر *',
        'membershipManagement.type.multiplier.hint': 'شهري = 1، نصف شهر = 0.5.',
        'membershipManagement.type.sortOrder': 'ترتيب العرض',
        'membershipManagement.type.active': 'إظهار النوع في قوائم الاشتراك',
        'membershipManagement.type.preview': '{{name}} · {{duration}} {{unit}} · السعر المتوقع لجيم فقط: {{price}}',
        'membershipManagement.type.previewFallback': 'نوع جديد',
        'membershipManagement.type.save': 'حفظ النوع',
        'membershipManagement.type.saveLoading': 'جارٍ حفظ النوع…',
        'membershipManagement.type.save.added': 'تمت إضافة نوع العضوية.',
        'membershipManagement.type.save.edited': 'تم تعديل نوع العضوية.',
        'membershipManagement.type.cancel': 'إلغاء',
        'membershipManagement.type.close': 'إغلاق',
        'membershipManagement.plan.add.title': 'إضافة باقة جديدة',
        'membershipManagement.plan.edit.title': 'تعديل الباقة',
        'membershipManagement.plan.add.description': 'أدخل بيانات الباقة الجديدة لتظهر مباشرة عند إضافة أو تجديد الاشتراك.',
        'membershipManagement.plan.edit.description': 'عدّل الاسم أو السعر أو حالة ظهور الباقة مع الاحتفاظ بالاشتراكات السابقة.',
        'membershipManagement.plan.code': 'رمز الباقة *',
        'membershipManagement.plan.code.placeholder': 'مثال: premium',
        'membershipManagement.plan.code.hint': 'بالإنجليزية للاستخدام البرمجي فقط.',
        'membershipManagement.plan.name': 'اسم الباقة *',
        'membershipManagement.plan.name.placeholder': 'مثال: جيم وبخار',
        'membershipManagement.plan.price': 'السعر الشهري *',
        'membershipManagement.plan.sortOrder': 'ترتيب العرض',
        'membershipManagement.plan.active': 'إظهار الباقة في قوائم الاشتراك',
        'membershipManagement.plan.preview': '{{name}} · شهري: {{monthly}} · نصف شهر: {{halfMonth}}',
        'membershipManagement.plan.previewFallback': 'باقة جديدة',
        'membershipManagement.plan.save': 'حفظ الباقة',
        'membershipManagement.plan.saveLoading': 'جارٍ حفظ الباقة…',
        'membershipManagement.plan.cancel': 'إلغاء',
        'membershipManagement.plan.close': 'إغلاق'
    });

    const membershipManagementScreenEnglish = Object.freeze({
        'membershipManagement.kicker': 'System management',
        'membershipManagement.title': 'Pricing and memberships',
        'membershipManagement.description': 'Manage plans and membership types in one place.',
        'membershipManagement.pricingShortcut.title': 'Plan pricing',
        'membershipManagement.pricingShortcut.description': 'Edit gym and cardio prices.',
        'membershipManagement.typesShortcut.title': 'Membership types',
        'membershipManagement.typesShortcut.description': 'Manage durations and price multipliers.',
        'membershipManagement.pricing.eyebrow': 'Revenue management',
        'membershipManagement.pricing.title': 'Plan pricing',
        'membershipManagement.pricing.description': 'Manage plan prices and duration-specific rates in one place.',
        'membershipManagement.pricing.section.title': 'Plan pricing',
        'membershipManagement.pricing.section.description': 'Set monthly and duration-specific prices independently for each plan.',
        'membershipManagement.pricing.card.durations': 'Duration prices',
        'membershipManagement.pricing.card.durationSingular': 'duration',
        'membershipManagement.pricing.card.durationPlural': 'durations',
        'membershipManagement.pricing.card.currency': 'EGP',
        'membershipManagement.pricing.addPlan': 'Add plan',
        'membershipManagement.pricing.column.plan': 'Plan',
        'membershipManagement.pricing.column.monthly': 'Monthly price',
        'membershipManagement.pricing.column.independent': 'Custom price',
        'membershipManagement.pricing.column.status': 'Status',
        'membershipManagement.pricing.column.actions': 'Action',
        'membershipManagement.pricing.status.active': 'Active',
        'membershipManagement.pricing.status.hidden': 'Hidden',
        'membershipManagement.pricing.action.edit': 'Edit',
        'membershipManagement.pricing.action.editAria': 'Edit plan {{name}}',
        'membershipManagement.pricing.input.planName': 'Plan name: {{name}}',
        'membershipManagement.pricing.input.monthlyPrice': 'Monthly price for {{name}}',
        'membershipManagement.pricing.input.durationPrice': '{{plan}} price for {{type}}',
        'membershipManagement.pricing.loading': 'Loading prices…',
        'membershipManagement.types.loading': 'Loading membership types…',
        'membershipManagement.dayPass.loading': 'Loading day-pass prices…',
        'membershipManagement.pricing.empty': 'No pricing plans are available.',
        'membershipManagement.error.catalogUnavailable': 'Could not load membership pricing. Please try again.',
        'membershipManagement.pricing.close': 'Close',
        'membershipManagement.pricing.save': 'Save plan prices',
        'membershipManagement.pricing.saveLoading': 'Saving prices…',
        'membershipManagement.pricing.saved': 'Membership prices saved.',
        'membershipManagement.dayPass.title': 'Day-pass prices',
        'membershipManagement.dayPass.description': 'Set the single-day entry price separately from member subscriptions.',
        'membershipManagement.dayPass.note': 'Separate revenue',
        'membershipManagement.dayPass.column.type': 'Pass type',
        'membershipManagement.dayPass.column.price': 'Price',
        'membershipManagement.dayPass.column.status': 'Status',
        'membershipManagement.dayPass.active': 'Active',
        'membershipManagement.dayPass.inactive': 'Inactive',
        'membershipManagement.dayPass.empty': 'No day-pass prices are available.',
        'membershipManagement.dayPass.priceFor': 'Price for {{name}}',
        'membershipManagement.dayPass.save': 'Save day-pass prices',
        'membershipManagement.dayPass.ownerOnly': 'Only the system owner can edit prices',
        'membershipManagement.types.eyebrow': 'Membership management',
        'membershipManagement.types.title': 'Membership types',
        'membershipManagement.types.description': 'Add or edit membership durations and their price multipliers.',
        'membershipManagement.types.section.title': 'Membership types',
        'membershipManagement.types.section.description': 'For example, half-month, monthly, quarterly, and other durations.',
        'membershipManagement.types.card.eyebrow': 'Membership type',
        'membershipManagement.types.add': 'Add type',
        'membershipManagement.types.column.type': 'Type',
        'membershipManagement.types.column.duration': 'Duration',
        'membershipManagement.types.column.multiplier': 'Price multiplier',
        'membershipManagement.types.column.status': 'Status',
        'membershipManagement.types.column.action': 'Action',
        'membershipManagement.types.status.active': 'Active',
        'membershipManagement.types.status.hidden': 'Hidden',
        'membershipManagement.types.action.edit': 'Edit',
        'membershipManagement.types.action.editAria': 'Edit membership type {{name}}',
        'membershipManagement.types.action.delete': 'Delete',
        'membershipManagement.types.action.deleteAria': 'Delete membership type {{name}}',
        'membershipManagement.types.duration.days': '{{count}} days',
        'membershipManagement.types.duration.months': '{{count}} months',
        'membershipManagement.types.empty': 'No membership types are available.',
        'membershipManagement.types.deleted': 'Membership type deleted.',
        'membershipManagement.types.close': 'Close',
        'membershipManagement.type.add.title': 'Add membership type',
        'membershipManagement.type.edit.title': 'Edit membership type',
        'membershipManagement.type.add.description': 'Enter the new type details to make it available when adding or renewing a membership.',
        'membershipManagement.type.edit.description': 'Edit the duration or price, or hide this type from membership options.',
        'membershipManagement.type.code': 'Type code *',
        'membershipManagement.type.code.placeholder': 'Example: weekly',
        'membershipManagement.type.code.hint': 'English only; used by the system.',
        'membershipManagement.type.name': 'Type name *',
        'membershipManagement.type.name.placeholder': 'Example: Weekly',
        'membershipManagement.type.mode': 'Duration unit *',
        'membershipManagement.type.mode.months': 'Months',
        'membershipManagement.type.mode.days': 'Days',
        'membershipManagement.type.mode.monthsSingular': 'Month',
        'membershipManagement.type.mode.daysSingular': 'Day',
        'membershipManagement.type.mode.monthsPlural': 'Months',
        'membershipManagement.type.mode.daysPlural': 'Days',
        'membershipManagement.type.duration': 'Duration value *',
        'membershipManagement.type.multiplier': 'Price multiplier *',
        'membershipManagement.type.multiplier.hint': 'Monthly = 1, half-month = 0.5.',
        'membershipManagement.type.sortOrder': 'Display order',
        'membershipManagement.type.active': 'Show this type in membership options',
        'membershipManagement.type.preview': '{{name}} · {{duration}} {{unit}} · estimated gym-only price: {{price}}',
        'membershipManagement.type.previewFallback': 'New type',
        'membershipManagement.type.save': 'Save type',
        'membershipManagement.type.saveLoading': 'Saving type…',
        'membershipManagement.type.save.added': 'Membership type added.',
        'membershipManagement.type.save.edited': 'Membership type updated.',
        'membershipManagement.type.cancel': 'Cancel',
        'membershipManagement.type.close': 'Close',
        'membershipManagement.plan.add.title': 'Add plan',
        'membershipManagement.plan.edit.title': 'Edit plan',
        'membershipManagement.plan.add.description': 'Enter the new plan details to make it available when adding or renewing a membership.',
        'membershipManagement.plan.edit.description': 'Edit the name, price, or visibility while keeping existing memberships unchanged.',
        'membershipManagement.plan.code': 'Plan code *',
        'membershipManagement.plan.code.placeholder': 'Example: premium',
        'membershipManagement.plan.code.hint': 'English only; used by the system.',
        'membershipManagement.plan.name': 'Plan name *',
        'membershipManagement.plan.name.placeholder': 'Example: Gym and sauna',
        'membershipManagement.plan.price': 'Monthly price *',
        'membershipManagement.plan.sortOrder': 'Display order',
        'membershipManagement.plan.active': 'Show this plan in membership options',
        'membershipManagement.plan.preview': '{{name}} · Monthly: {{monthly}} · Half-month: {{halfMonth}}',
        'membershipManagement.plan.previewFallback': 'New plan',
        'membershipManagement.plan.save': 'Save plan',
        'membershipManagement.plan.saveLoading': 'Saving plan…',
        'membershipManagement.plan.cancel': 'Cancel',
        'membershipManagement.plan.close': 'Close'
    });

    const permissionsScreenArabic = Object.freeze({
        'permissionsScreen.authUsers.table.role': 'الدور',
        'permissionsScreen.authUsers.table.lastLogin': 'آخر دخول',
        'permissionsScreen.authUsers.role.owner': 'مالك النظام',
        'permissionsScreen.authUsers.role.assistant': 'مساعد',
        'permissionsScreen.authUsers.lastLogin.never': 'لم يسجل دخولًا',
        'permissionsScreen.authUsers.action.disable': 'تعطيل',
        'permissionsScreen.authUsers.action.activate': 'تفعيل',
        'permissionsScreen.authUsers.primaryAccount': 'الحساب الرئيسي',
        'permissionsScreen.authUsers.dialog.addTitle': 'إضافة مساعد',
        'permissionsScreen.authUsers.dialog.editTitle': 'تعديل حساب مساعد',
        'permissionsScreen.authUsers.dialog.addDescription': 'أنشئ حسابًا مساعدًا بصلاحيات تشغيلية محدودة.',
        'permissionsScreen.authUsers.dialog.editDescription': 'عدّل الاسم أو البريد، ويمكنك إدخال كلمة مرور جديدة لإعادة التعيين.',
        'permissionsScreen.authUsers.dialog.name': 'الاسم',
        'permissionsScreen.authUsers.dialog.email': 'البريد الإلكتروني',
        'permissionsScreen.authUsers.dialog.password': 'كلمة المرور',
        'permissionsScreen.authUsers.dialog.passwordHintAdd': 'يجب أن تكون 8 أحرف على الأقل. لا يتم عرضها أو إرسالها مرة أخرى بعد الحفظ.',
        'permissionsScreen.authUsers.dialog.passwordHintEdit': 'اترك الحقل فارغًا للحفاظ على كلمة المرور الحالية، أو أدخل كلمة مرور جديدة لإعادة التعيين.',
        'permissionsScreen.authUsers.dialog.close': 'إغلاق',
        'permissionsScreen.authUsers.dialog.cancel': 'إلغاء',
        'permissionsScreen.authUsers.dialog.save': 'حفظ الحساب',
        'permissionsScreen.authUsers.error.load': 'تعذر تحميل الحسابات.',
        'permissionsScreen.authUsers.error.requiredFields': 'أكمل الاسم والبريد وكلمة المرور المطلوبة.',
        'permissionsScreen.authUsers.error.save': 'تعذر حفظ الحساب.',
        'permissionsScreen.authUsers.error.status': 'تعذر تحديث حالة الحساب.',
        'permissionsScreen.authUsers.error.delete': 'تعذر حذف حساب المساعد.',
        'permissionsScreen.authUsers.message.saved': 'تم حفظ بيانات الحساب.',
        'permissionsScreen.authUsers.message.created': 'تم إنشاء حساب المساعد بنجاح.',
        'permissionsScreen.authUsers.message.disable': 'تم تعطيل حساب {{name}}.',
        'permissionsScreen.authUsers.message.activate': 'تمت إعادة تفعيل حساب {{name}}.',
        'permissionsScreen.authUsers.message.deleted': 'تم حذف حساب {{name}} نهائيًا.',
        'permissionsScreen.authUsers.confirm.disable': 'هل تريد تعطيل حساب {{name}}؟',
        'permissionsScreen.authUsers.confirm.activate': 'هل تريد إعادة تفعيل حساب {{name}}؟',
        'permissionsScreen.authUsers.confirm.deleteTitle': 'تأكيد حذف حساب المساعد',
        'permissionsScreen.authUsers.confirm.deleteBody': 'سيتم حذف حساب {{name}} نهائيًا وإلغاء جلساته وصلاحياته. لا يمكن التراجع عن هذه العملية.',
        'permissionsScreen.authUsers.confirm.delete': 'نعم، احذف الحساب',
        'permissionsScreen.authUsers.confirm.deleteFallback': 'سيتم حذف حساب {{name}} نهائيًا وإلغاء جلساته وصلاحياته. لا يمكن التراجع عن هذه العملية. هل تريد المتابعة؟',
        'permissionsScreen.tab': 'صلاحيات الحسابات',
        'permissionsScreen.ownerOnly': 'للمالك فقط',
        'permissionsScreen.title': 'صلاحيات حسابات Assistant',
        'permissionsScreen.description': 'تحكم في الشاشات والعمليات المتاحة لكل حساب بشكل مستقل.',
        'permissionsScreen.ownerNotice': 'لا يمكن تعديل صلاحيات Owner',
        'permissionsScreen.accountsKicker': 'إدارة الحسابات',
        'permissionsScreen.accountsTitle': 'حسابات الإدارة والمساعدين',
        'permissionsScreen.accountsDescription': 'أدر حسابات Assistant ثم خصص صلاحيات كل حساب من بطاقات الشاشات.',
        'permissionsScreen.assistantsSummary': 'ملخص حسابات المساعدين',
        'permissionsScreen.totalAssistants': 'إجمالي المساعدين',
        'permissionsScreen.activeAccounts': 'حسابات نشطة',
        'permissionsScreen.disabledAccounts': 'حسابات معطلة',
        'permissionsScreen.addAssistant': 'إضافة Assistant',
        'permissionsScreen.accounts': 'الحسابات',
        'permissionsScreen.chooseAssistant': 'اختر Assistant',
        'permissionsScreen.loadingAccounts': 'جارٍ تحميل الحسابات…',
        'permissionsScreen.noAccounts': 'لا توجد حسابات Assistant حتى الآن.',
        'permissionsScreen.accessMatrix': 'مصفوفة الوصول',
        'permissionsScreen.selectAccount': 'اختر حسابًا لعرض صلاحياته',
        'permissionsScreen.readOnly': 'قراءة فقط',
        'permissionsScreen.auditNoChanges': 'لم تُسجل تعديلات سابقة لهذا الحساب.',
        'permissionsScreen.auditLastChange': 'آخر تعديل: {{name}} · {{date}}',
        'permissionsScreen.accountActive': 'الحساب نشط',
        'permissionsScreen.accountDisabled': 'الحساب معطل',
        'permissionsScreen.reasonRequired': 'يتطلب الحفظ سببًا واضحًا.',
        'permissionsScreen.auditNotice': 'كل تعديل يُسجل في سجل التدقيق ويُنهي جلسة الحساب المستهدف.',
        'permissionsScreen.noAccountsAvailable': 'لا توجد حسابات Assistant متاحة.',
        'permissionsScreen.noPermissions': 'لا توجد صلاحيات لعرضها.',
        'permissionsScreen.noAssistantSelected': 'اختر حساب Assistant لعرض مصفوفة الصلاحيات.',
        'permissionsScreen.permissionCount': '{{granted}} من {{total}} صلاحية مفعّلة',
        'permissionsScreen.readOnlyGroup': 'صلاحيات مستقلة',
        'permissionsScreen.readOnlyMode': 'قراءة فقط',
        'permissionsScreen.customizable': 'عمليات قابلة للتخصيص',
        'permissionsScreen.reason': 'سبب التعديل *',
        'permissionsScreen.reasonPlaceholder': 'مثال: منح صلاحية التقارير لمتابعة الحضور الأسبوعي',
        'permissionsScreen.reset': 'استعادة الافتراضي',
        'permissionsScreen.save': 'حفظ الصلاحيات',
        'permissionsScreen.error.load': 'تعذر تحميل الصلاحيات.',
        'permissionsScreen.error.reason': 'اكتب سبب تعديل الصلاحيات قبل الحفظ.',
        'permissionsScreen.error.save': 'تعذر حفظ الصلاحيات.',
        'permissionsScreen.error.reset': 'تعذر استعادة الصلاحيات.',
        'permissionsScreen.success.save': 'تم حفظ الصلاحيات وإنهاء جلسة الحساب المستهدف بنجاح.',
        'permissionsScreen.success.reset': 'تمت استعادة الصلاحيات الآمنة الافتراضية.',
        'permissionsScreen.resetReason': 'استعادة الصلاحيات الآمنة الافتراضية',
        'permissionsScreen.status.active': 'نشط',
        'permissionsScreen.status.disabled': 'معطل',
        'permissionsScreen.group.dashboard': 'لوحة التحكم',
        'permissionsScreen.group.members': 'المشتركون',
        'permissionsScreen.group.memberships': 'العضويات',
        'permissionsScreen.group.payments': 'التحصيل',
        'permissionsScreen.group.trainees': 'المتدربون الخارجيون',
        'permissionsScreen.group.coaching': 'التدريب والتغذية',
        'permissionsScreen.group.attendance': 'الحضور والانصراف',
        'permissionsScreen.group.finance': 'البيانات المالية',
        'permissionsScreen.group.reports': 'التقارير',
        'permissionsScreen.group.pricing': 'الأسعار والعضويات',
        'permissionsScreen.group.day_passes': 'الحصص اليومية',
        'permissionsScreen.group.library': 'المكتبة',
        'permissionsScreen.group.management': 'إدارة الحسابات والنسخ',
        'permissionsScreen.group.feedback': 'تقييمات المشتركين',
        'permissionsScreen.group.permissions': 'الصلاحيات'
        ,'permissionsScreen.permissionLabel': '{{action}} {{resource}}'
        ,'permissionsScreen.permissionDescription': 'السماح بـ{{action}} ضمن {{resource}}.'
        ,'permissionsScreen.action.read': 'عرض'
        ,'permissionsScreen.action.create': 'إنشاء'
        ,'permissionsScreen.action.update': 'تعديل'
        ,'permissionsScreen.action.delete': 'حذف'
        ,'permissionsScreen.action.manage': 'إدارة'
        ,'permissionsScreen.action.view': 'عرض'
        ,'permissionsScreen.action.review': 'مراجعة'
        ,'permissionsScreen.action.refund': 'استرداد'
        ,'permissionsScreen.action.check_in': 'تسجيل الحضور'
        ,'permissionsScreen.action.check_out': 'تسجيل الانصراف'
        ,'permissionsScreen.action.export': 'تصدير'
        ,'permissionsScreen.action.print': 'طباعة'
        ,'permissionsScreen.action.freeze': 'تجميد'
        ,'permissionsScreen.action.renew': 'تجديد'
        ,'permissionsScreen.action.alerts': 'تسجيل التنبيهات'
        ,'permissionsScreen.action.status': 'تغيير الحالة'
        ,'permissionsScreen.action.generate': 'إنشاء اقتراحات'
        ,'permissionsScreen.action.reveal': 'إظهار'
        ,'permissionsScreen.action.resend': 'إعادة الإرسال'
        ,'permissionsScreen.action.rotate': 'إعادة الإصدار'
        ,'permissionsScreen.action.whatsapp': 'مراسلة واتساب'
        ,'permissionsScreen.action.restore': 'استعادة'
        ,'permissionsScreen.resource.notifications': 'الإشعارات'
        ,'permissionsScreen.resource.message_templates': 'قوالب الرسائل'
        ,'permissionsScreen.resource.dashboard': 'لوحة التحكم'
        ,'permissionsScreen.resource.members': 'المشتركين'
        ,'permissionsScreen.resource.memberships': 'العضويات'
        ,'permissionsScreen.resource.membership_codes': 'أكواد بوابة المشتركين'
        ,'permissionsScreen.resource.payments': 'المدفوعات'
        ,'permissionsScreen.resource.trainees': 'المتدربين الخارجيين'
        ,'permissionsScreen.resource.coaching': 'التدريب والتغذية'
        ,'permissionsScreen.resource.attendance': 'الحضور والانصراف'
        ,'permissionsScreen.resource.finance': 'المالية'
        ,'permissionsScreen.resource.reports': 'التقارير'
        ,'permissionsScreen.resource.pricing': 'الأسعار والعضويات'
        ,'permissionsScreen.resource.day_passes': 'الحصص اليومية'
        ,'permissionsScreen.resource.library': 'المكتبة'
        ,'permissionsScreen.resource.management': 'إدارة الحسابات والنسخ الاحتياطية'
        ,'permissionsScreen.resource.feedback': 'تقييمات المشتركين'
        ,'permissionsScreen.resource.permissions': 'الصلاحيات'
        ,'permissionsScreen.resource.branding': 'الهوية'
        ,'permissionsScreen.resource.store': 'المتجر'
        ,'permissionsScreen.resource.intelligence': 'الذكاء التشغيلي'
        ,'permissionsScreen.resource.saas': 'اشتراك المنصة'
        ,'permissionsScreen.resource.portal': 'بوابة العضو'
        ,'permissionsScreen.resource.branches': 'الفروع'
        ,'permissionsScreen.resource.inventory': 'المخزون'
        ,'permissionsScreen.resource.bar': 'البار ونقطة البيع'
        ,'permissionsScreen.resource.member': 'طلبات اشتراك العضو'
    });

    const permissionsScreenEnglish = Object.freeze({
        'permissionsScreen.authUsers.table.role': 'Role',
        'permissionsScreen.authUsers.table.lastLogin': 'Last sign-in',
        'permissionsScreen.authUsers.role.owner': 'Owner',
        'permissionsScreen.authUsers.role.assistant': 'Assistant',
        'permissionsScreen.authUsers.lastLogin.never': 'Never signed in',
        'permissionsScreen.authUsers.action.disable': 'Disable',
        'permissionsScreen.authUsers.action.activate': 'Activate',
        'permissionsScreen.authUsers.primaryAccount': 'Primary account',
        'permissionsScreen.authUsers.dialog.addTitle': 'Add assistant',
        'permissionsScreen.authUsers.dialog.editTitle': 'Edit assistant account',
        'permissionsScreen.authUsers.dialog.addDescription': 'Create an assistant account with limited operational permissions.',
        'permissionsScreen.authUsers.dialog.editDescription': 'Edit the name or email, or enter a new password to reset it.',
        'permissionsScreen.authUsers.dialog.name': 'Name',
        'permissionsScreen.authUsers.dialog.email': 'Email address',
        'permissionsScreen.authUsers.dialog.password': 'Password',
        'permissionsScreen.authUsers.dialog.passwordHintAdd': 'Use at least 8 characters. The password is not shown or sent again after saving.',
        'permissionsScreen.authUsers.dialog.passwordHintEdit': 'Leave this blank to keep the current password, or enter a new password to reset it.',
        'permissionsScreen.authUsers.dialog.close': 'Close',
        'permissionsScreen.authUsers.dialog.cancel': 'Cancel',
        'permissionsScreen.authUsers.dialog.save': 'Save account',
        'permissionsScreen.authUsers.error.load': 'Could not load accounts.',
        'permissionsScreen.authUsers.error.requiredFields': 'Complete the required name, email, and password fields.',
        'permissionsScreen.authUsers.error.save': 'Could not save the account.',
        'permissionsScreen.authUsers.error.status': 'Could not update the account status.',
        'permissionsScreen.authUsers.error.delete': 'Could not delete the assistant account.',
        'permissionsScreen.authUsers.message.saved': 'Account details saved.',
        'permissionsScreen.authUsers.message.created': 'Assistant account created.',
        'permissionsScreen.authUsers.message.disable': 'Assistant account {{name}} disabled.',
        'permissionsScreen.authUsers.message.activate': 'Assistant account {{name}} reactivated.',
        'permissionsScreen.authUsers.message.deleted': 'Assistant account {{name}} permanently deleted.',
        'permissionsScreen.authUsers.confirm.disable': 'Disable {{name}}’s account?',
        'permissionsScreen.authUsers.confirm.activate': 'Reactivate {{name}}’s account?',
        'permissionsScreen.authUsers.confirm.deleteTitle': 'Confirm assistant account deletion',
        'permissionsScreen.authUsers.confirm.deleteBody': 'Assistant account {{name}} will be permanently deleted and its sessions and permissions revoked. This cannot be undone.',
        'permissionsScreen.authUsers.confirm.delete': 'Yes, delete account',
        'permissionsScreen.authUsers.confirm.deleteFallback': 'Assistant account {{name}} will be permanently deleted and its sessions and permissions revoked. This cannot be undone. Continue?',
        'permissionsScreen.tab': 'Account permissions',
        'permissionsScreen.ownerOnly': 'Owner only',
        'permissionsScreen.title': 'Assistant account permissions',
        'permissionsScreen.description': 'Control the screens and operations available to each account independently.',
        'permissionsScreen.ownerNotice': 'Owner permissions cannot be changed',
        'permissionsScreen.accountsKicker': 'Account management',
        'permissionsScreen.accountsTitle': 'Management and assistant accounts',
        'permissionsScreen.accountsDescription': 'Manage Assistant accounts, then assign each account permissions from the screen cards.',
        'permissionsScreen.assistantsSummary': 'Assistant account summary',
        'permissionsScreen.totalAssistants': 'Total assistants',
        'permissionsScreen.activeAccounts': 'Active accounts',
        'permissionsScreen.disabledAccounts': 'Disabled accounts',
        'permissionsScreen.addAssistant': 'Add Assistant',
        'permissionsScreen.accounts': 'Accounts',
        'permissionsScreen.chooseAssistant': 'Choose an Assistant',
        'permissionsScreen.loadingAccounts': 'Loading accounts…',
        'permissionsScreen.noAccounts': 'No Assistant accounts yet.',
        'permissionsScreen.accessMatrix': 'Access matrix',
        'permissionsScreen.selectAccount': 'Choose an account to view its permissions',
        'permissionsScreen.readOnly': 'Read only',
        'permissionsScreen.auditNoChanges': 'No previous changes are recorded for this account.',
        'permissionsScreen.auditLastChange': 'Last change: {{name}} · {{date}}',
        'permissionsScreen.accountActive': 'Account active',
        'permissionsScreen.accountDisabled': 'Account disabled',
        'permissionsScreen.reasonRequired': 'Saving requires a clear reason.',
        'permissionsScreen.auditNotice': 'Each change is recorded in the audit log and ends the target account session.',
        'permissionsScreen.noAccountsAvailable': 'No Assistant accounts are available.',
        'permissionsScreen.noPermissions': 'There are no permissions to display.',
        'permissionsScreen.noAssistantSelected': 'Choose an Assistant account to view its permission matrix.',
        'permissionsScreen.permissionCount': '{{granted}} of {{total}} permissions enabled',
        'permissionsScreen.readOnlyGroup': 'Independent permissions',
        'permissionsScreen.readOnlyMode': 'Read only',
        'permissionsScreen.customizable': 'Customizable operations',
        'permissionsScreen.reason': 'Reason for change *',
        'permissionsScreen.reasonPlaceholder': 'Example: Grant report access to review weekly attendance',
        'permissionsScreen.reset': 'Restore defaults',
        'permissionsScreen.save': 'Save permissions',
        'permissionsScreen.error.load': 'Could not load permissions.',
        'permissionsScreen.error.reason': 'Enter a reason for changing permissions before saving.',
        'permissionsScreen.error.save': 'Could not save permissions.',
        'permissionsScreen.error.reset': 'Could not restore permissions.',
        'permissionsScreen.success.save': 'Permissions saved and the target account session was ended.',
        'permissionsScreen.success.reset': 'Safe default permissions were restored.',
        'permissionsScreen.resetReason': 'Restore safe default permissions',
        'permissionsScreen.status.active': 'Active',
        'permissionsScreen.status.disabled': 'Disabled',
        'permissionsScreen.group.dashboard': 'Dashboard',
        'permissionsScreen.group.members': 'Members',
        'permissionsScreen.group.memberships': 'Memberships',
        'permissionsScreen.group.payments': 'Collections',
        'permissionsScreen.group.trainees': 'External trainees',
        'permissionsScreen.group.coaching': 'Training and nutrition',
        'permissionsScreen.group.attendance': 'Attendance',
        'permissionsScreen.group.finance': 'Finance',
        'permissionsScreen.group.reports': 'Reports',
        'permissionsScreen.group.pricing': 'Pricing and memberships',
        'permissionsScreen.group.day_passes': 'Day passes',
        'permissionsScreen.group.library': 'Library',
        'permissionsScreen.group.management': 'Accounts and backups',
        'permissionsScreen.group.feedback': 'Member feedback',
        'permissionsScreen.group.permissions': 'Permissions'
        ,'permissionsScreen.permissionLabel': '{{action}} {{resource}}'
        ,'permissionsScreen.permissionDescription': 'Allow {{action}} in {{resource}}.'
        ,'permissionsScreen.action.read': 'View'
        ,'permissionsScreen.action.create': 'Create'
        ,'permissionsScreen.action.update': 'Edit'
        ,'permissionsScreen.action.delete': 'Delete'
        ,'permissionsScreen.action.manage': 'Manage'
        ,'permissionsScreen.action.view': 'View'
        ,'permissionsScreen.action.review': 'Review'
        ,'permissionsScreen.action.refund': 'Refund'
        ,'permissionsScreen.action.check_in': 'Check in'
        ,'permissionsScreen.action.check_out': 'Check out'
        ,'permissionsScreen.action.export': 'Export'
        ,'permissionsScreen.action.print': 'Print'
        ,'permissionsScreen.action.freeze': 'Freeze'
        ,'permissionsScreen.action.renew': 'Renew'
        ,'permissionsScreen.action.alerts': 'Record reminders'
        ,'permissionsScreen.action.status': 'Change status'
        ,'permissionsScreen.action.generate': 'Generate suggestions'
        ,'permissionsScreen.action.reveal': 'Reveal'
        ,'permissionsScreen.action.resend': 'Resend'
        ,'permissionsScreen.action.rotate': 'Reissue'
        ,'permissionsScreen.action.whatsapp': 'Send WhatsApp message'
        ,'permissionsScreen.action.restore': 'Restore'
        ,'permissionsScreen.resource.notifications': 'notifications'
        ,'permissionsScreen.resource.message_templates': 'message templates'
        ,'permissionsScreen.resource.dashboard': 'the dashboard'
        ,'permissionsScreen.resource.members': 'members'
        ,'permissionsScreen.resource.memberships': 'memberships'
        ,'permissionsScreen.resource.membership_codes': 'member portal codes'
        ,'permissionsScreen.resource.payments': 'payments'
        ,'permissionsScreen.resource.trainees': 'external trainees'
        ,'permissionsScreen.resource.coaching': 'training and nutrition'
        ,'permissionsScreen.resource.attendance': 'attendance'
        ,'permissionsScreen.resource.finance': 'finance'
        ,'permissionsScreen.resource.reports': 'reports'
        ,'permissionsScreen.resource.pricing': 'pricing and memberships'
        ,'permissionsScreen.resource.day_passes': 'day passes'
        ,'permissionsScreen.resource.library': 'the library'
        ,'permissionsScreen.resource.management': 'accounts and backups'
        ,'permissionsScreen.resource.feedback': 'member feedback'
        ,'permissionsScreen.resource.permissions': 'permissions'
        ,'permissionsScreen.resource.branding': 'branding'
        ,'permissionsScreen.resource.store': 'the store'
        ,'permissionsScreen.resource.intelligence': 'operational intelligence'
        ,'permissionsScreen.resource.saas': 'the platform subscription'
        ,'permissionsScreen.resource.portal': 'the member portal'
        ,'permissionsScreen.resource.branches': 'branches'
        ,'permissionsScreen.resource.inventory': 'inventory'
        ,'permissionsScreen.resource.bar': 'the bar and point of sale'
        ,'permissionsScreen.resource.member': 'member requests'
    });

    const backupHistoryArabic = Object.freeze({
        'backupHistory.dialog.title': '\u0627\u0633\u062a\u0631\u062c\u0627\u0639 \u0646\u0633\u062e\u0629 \u0627\u062d\u062a\u064a\u0627\u0637\u064a\u0629',
        'backupHistory.dialog.description': '\u0627\u062e\u062a\u0631 \u0645\u0644\u0641 \u0627\u0644\u0646\u0633\u062e\u0629 \u0627\u0644\u0645\u0636\u063a\u0648\u0637\u0629. \u0633\u064a\u062a\u0645 \u0641\u062d\u0635\u0647\u0627 \u0623\u0648\u0644\u0627\u064b \u0648\u0644\u0646 \u064a\u0628\u062f\u0623 \u0627\u0644\u0627\u0633\u062a\u0631\u062c\u0627\u0639 \u0625\u0644\u0627 \u0628\u0639\u062f \u062a\u0623\u0643\u064a\u062f\u0643.',
        'backupHistory.dialog.file': '\u0645\u0644\u0641 \u0627\u0644\u0646\u0633\u062e\u0629 \u0627\u0644\u0627\u062d\u062a\u064a\u0627\u0637\u064a\u0629 (.json.gz)',
        'backupHistory.dialog.reason': '\u0633\u0628\u0628 \u0627\u0644\u0627\u0633\u062a\u0631\u062c\u0627\u0639 *',
        'backupHistory.dialog.reasonPlaceholder': '\u0627\u0643\u062a\u0628 \u0633\u0628\u0628 \u0627\u0633\u062a\u0631\u062c\u0627\u0639 \u0627\u0644\u0646\u0633\u062e\u0629',
        'backupHistory.dialog.close': '\u0625\u063a\u0644\u0627\u0642',
        'backupHistory.dialog.cancel': '\u0625\u0644\u063a\u0627\u0621',
        'backupHistory.dialog.restore': '\u0627\u0633\u062a\u0631\u062c\u0627\u0639 \u0627\u0644\u0646\u0633\u062e\u0629',
        'backupHistory.dialog.restoreVerified': '\u0627\u0633\u062a\u0631\u062c\u0627\u0639 \u0628\u0639\u062f \u0627\u0644\u062a\u062d\u0642\u0642',
        'backupHistory.dialog.operationReason': '\u0633\u0628\u0628 \u0627\u0644\u0639\u0645\u0644\u064a\u0629 *',
        'backupHistory.dialog.operationReasonPlaceholder': '\u0627\u0643\u062a\u0628 \u0633\u0628\u0628\u064b\u0627 \u0648\u0627\u0636\u062d\u064b\u0627 \u0644\u0644\u0627\u062d\u062a\u0641\u0627\u0638 \u0628\u0647 \u0641\u064a \u0633\u062c\u0644 \u0627\u0644\u062a\u062f\u0642\u064a\u0642',
        'backupHistory.dialog.reasonRequired': '\u0633\u0628\u0628 \u0627\u0644\u0639\u0645\u0644\u064a\u0629 \u0645\u0637\u0644\u0648\u0628.',
        'backupHistory.validation.fileVerified': '\u062a\u0645 \u0627\u0644\u062a\u062d\u0642\u0642 \u0645\u0646 \u0627\u0644\u0645\u0644\u0641',
        'backupHistory.validation.backupLabel': '\u0627\u0644\u0646\u0633\u062e\u0629',
        'backupHistory.validation.createdAt': '\u062a\u0627\u0631\u064a\u062e \u0625\u0646\u0634\u0627\u0621 \u0627\u0644\u0646\u0633\u062e\u0629:',
        'backupHistory.validation.integrityVerified': '\u062a\u0645 \u0627\u0644\u062a\u062d\u0642\u0642 \u0645\u0646 \u0628\u0635\u0645\u0629 \u0633\u0644\u0627\u0645\u0629 \u0627\u0644\u0645\u0644\u0641 SHA-256.',
        'backupHistory.validation.legacyIntegrity': '\u062a\u0645 \u0627\u0644\u062a\u062d\u0642\u0642 \u0645\u0646 \u0628\u0646\u064a\u0629 \u0627\u0644\u0646\u0633\u062e\u0629 \u0627\u0644\u0642\u062f\u064a\u0645\u0629.',
        'backupHistory.validation.rows': '{{count}} \u0635\u0641',
        'backupHistory.validation.table': '\u0627\u0644\u062c\u062f\u0648\u0644',
        'backupHistory.validation.rowCount': '\u0627\u0644\u0635\u0641\u0648\u0641',
        'backupHistory.validation.noData': '\u0644\u0627 \u062a\u0648\u062c\u062f \u0628\u064a\u0627\u0646\u0627\u062a \u0641\u064a \u0627\u0644\u0646\u0633\u062e\u0629.',
        'backupHistory.validation.fileTooLarge': '\u062d\u062c\u0645 \u0627\u0644\u0645\u0644\u0641 \u0623\u0643\u0628\u0631 \u0645\u0646 25 \u0645\u064a\u062c\u0627\u0628\u0627\u064a\u062a.',
        'backupHistory.validation.inspecting': '\u062c\u0627\u0631\u064d \u0641\u062d\u0635 \u0627\u0644\u0646\u0633\u062e\u0629\u2026',
        'backupHistory.validation.invalidFile': '\u0627\u0644\u0645\u0644\u0641 \u063a\u064a\u0631 \u0635\u0627\u0644\u062d.',
        'backupHistory.validation.inspectFailed': '\u062a\u0639\u0630\u0631 \u0627\u0644\u062a\u062d\u0642\u0642 \u0645\u0646 \u0627\u0644\u0646\u0633\u062e\u0629:',
        'backupHistory.confirm.confirm': '\u062a\u0623\u0643\u064a\u062f',
        'backupHistory.confirm.createTitle': '\u0625\u0646\u0634\u0627\u0621 \u0646\u0633\u062e\u0629 \u0645\u062d\u0641\u0648\u0638\u0629 \u0644\u0644\u062c\u064a\u0645',
        'backupHistory.confirm.create': '\u0625\u0646\u0634\u0627\u0621 \u0627\u0644\u0646\u0633\u062e\u0629',
        'backupHistory.confirm.restoreTitle': '\u062a\u0623\u0643\u064a\u062f \u0627\u0633\u062a\u0631\u062c\u0627\u0639 \u0627\u0644\u0646\u0633\u062e\u0629',
        'backupHistory.confirm.restoreBody': '\u0633\u064a\u062a\u0645 \u0627\u0633\u062a\u0628\u062f\u0627\u0644 \u0627\u0644\u0628\u064a\u0627\u0646\u0627\u062a \u0627\u0644\u062d\u0627\u0644\u064a\u0629 \u0628\u0628\u064a\u0627\u0646\u0627\u062a \u0627\u0644\u0646\u0633\u062e\u0629 \u0628\u0639\u062f \u0627\u0644\u062a\u062d\u0642\u0642 \u0645\u0646\u0647\u0627. \u0633\u064a\u062a\u0645 \u0625\u0646\u0634\u0627\u0621 \u0646\u0633\u062e\u0629 \u062c\u062f\u064a\u062f\u0629 \u0639\u0644\u0649 \u062c\u0647\u0627\u0632\u0643 \u0623\u0648\u0644\u064b\u0627 \u0625\u0646 \u0623\u0631\u062f\u062a \u0627\u0644\u0627\u062d\u062a\u0641\u0627\u0638 \u0628\u0627\u0644\u062d\u0627\u0644\u0629 \u0627\u0644\u062d\u0627\u0644\u064a\u0629.',
        'backupHistory.confirm.restoreWarning': '\u0644\u0627 \u064a\u0645\u0643\u0646 \u0627\u0644\u062a\u0631\u0627\u062c\u0639 \u0639\u0646 \u0627\u0644\u0627\u0633\u062a\u0631\u062c\u0627\u0639 \u0645\u0646 \u062f\u0627\u062e\u0644 \u0647\u0630\u0647 \u0627\u0644\u0639\u0645\u0644\u064a\u0629.',
        'backupHistory.confirm.restoreNow': '\u0627\u0633\u062a\u0631\u062c\u0627\u0639 \u0627\u0644\u0622\u0646',
        'backupHistory.confirm.restoreContinue': '\u0645\u062a\u0627\u0628\u0639\u0629 \u0627\u0644\u0627\u0633\u062a\u0631\u062c\u0627\u0639',
        'backupHistory.confirm.deleteTitle': '\u062a\u0623\u0643\u064a\u062f \u062d\u0630\u0641 \u0627\u0644\u0646\u0633\u062e\u0629 \u0627\u0644\u0627\u062d\u062a\u064a\u0627\u0637\u064a\u0629',
        'backupHistory.confirm.deleteBody': '\u0633\u064a\u062a\u0645 \u062d\u0630\u0641 \u0627\u0644\u0646\u0633\u062e\u0629 \u0627\u0644\u0645\u062d\u0641\u0648\u0638\u0629 \u0645\u0646 \u0627\u0644\u062a\u062e\u0632\u064a\u0646 \u0627\u0644\u062e\u0627\u0635\u060c \u0648\u0644\u0646 \u064a\u0624\u062b\u0631 \u0630\u0644\u0643 \u0639\u0644\u0649 \u0628\u064a\u0627\u0646\u0627\u062a \u0627\u0644\u0646\u0638\u0627\u0645 \u0627\u0644\u062d\u0627\u0644\u064a\u0629.',
        'backupHistory.confirm.delete': '\u0646\u0639\u0645\u060c \u0627\u062d\u0630\u0641',
        'backupHistory.confirm.deleteFallback': '\u0647\u0644 \u062a\u0631\u064a\u062f \u062d\u0630\u0641 \u0627\u0644\u0646\u0633\u062e\u0629 \u0627\u0644\u0627\u062d\u062a\u064a\u0627\u0637\u064a\u0629 \u0627\u0644\u0645\u062d\u0641\u0648\u0638\u0629\u061f',
        'backupHistory.action.creating': '\u062c\u0627\u0631\u064d \u0625\u0646\u0634\u0627\u0621 \u0627\u0644\u0646\u0633\u062e\u0629\u2026',
        'backupHistory.action.preparingDownload': '\u062c\u0627\u0631\u064d \u062a\u062c\u0647\u064a\u0632 \u0627\u0644\u062a\u0646\u0632\u064a\u0644\u2026',
        'backupHistory.action.restoring': '\u062c\u0627\u0631\u064d \u0627\u0633\u062a\u0631\u062c\u0627\u0639 \u0627\u0644\u0646\u0633\u062e\u0629\u2026',
        'backupHistory.action.deleting': '\u062c\u0627\u0631\u064d \u062d\u0630\u0641 \u0627\u0644\u0646\u0633\u062e\u0629\u2026',
        'backupHistory.message.alreadyCreated': '\u0627\u0644\u0646\u0633\u062e\u0629 \u0627\u0644\u064a\u0648\u0645\u064a\u0629 \u0645\u0648\u062c\u0648\u062f\u0629 \u0628\u0627\u0644\u0641\u0639\u0644.',
        'backupHistory.message.created': '\u062a\u0645 \u0625\u0646\u0634\u0627\u0621 \u0627\u0644\u0646\u0633\u062e\u0629 \u0627\u0644\u0645\u062d\u0641\u0648\u0638\u0629 \u0648\u0627\u0644\u062a\u062d\u0642\u0642 \u0645\u0646\u0647\u0627.',
        'backupHistory.message.downloaded': '\u062a\u0645 \u062a\u0646\u0632\u064a\u0644 \u0627\u0644\u0646\u0633\u062e\u0629 \u0627\u0644\u0627\u062d\u062a\u064a\u0627\u0637\u064a\u0629.',
        'backupHistory.message.localCopy': '\u062a\u0645 \u0625\u0646\u0634\u0627\u0621 \u0646\u0633\u062e\u0629 \u0644\u062d\u0638\u064a\u0629 \u0648\u062d\u0641\u0638\u0647\u0627 \u0639\u0644\u0649 \u062c\u0647\u0627\u0632\u0643 \u0641\u0642\u0637.',
        'backupHistory.message.restored': '\u062a\u0645 \u0627\u0633\u062a\u0631\u062c\u0627\u0639 \u0627\u0644\u0646\u0633\u062e\u0629 \u0628\u0646\u062c\u0627\u062d.',
        'backupHistory.message.reload': '\u0633\u064a\u062a\u0645 \u062a\u062d\u062f\u064a\u062b \u0628\u064a\u0627\u0646\u0627\u062a \u0627\u0644\u0646\u0638\u0627\u0645 \u0627\u0644\u0622\u0646.',
        'backupHistory.message.deleted': '\u062a\u0645 \u062d\u0630\u0641 \u0627\u0644\u0646\u0633\u062e\u0629 \u0627\u0644\u0627\u062d\u062a\u064a\u0627\u0637\u064a\u0629.',
        'backupHistory.error.createFailed': '\u062a\u0639\u0630\u0631 \u0625\u0646\u0634\u0627\u0621 \u0627\u0644\u0646\u0633\u062e\u0629 \u0627\u0644\u0645\u062d\u0641\u0648\u0638\u0629.',
        'backupHistory.error.downloadFailed': '\u062a\u0639\u0630\u0631 \u062a\u062d\u0645\u064a\u0644 \u0627\u0644\u0646\u0633\u062e\u0629 \u0627\u0644\u0627\u062d\u062a\u064a\u0627\u0637\u064a\u0629.',
        'backupHistory.error.restoreFailed': '\u0641\u0634\u0644 \u0627\u0633\u062a\u0631\u062c\u0627\u0639 \u0627\u0644\u0646\u0633\u062e\u0629.',
        'backupHistory.error.deleteFailed': '\u062a\u0639\u0630\u0631 \u062d\u0630\u0641 \u0627\u0644\u0646\u0633\u062e\u0629 \u0627\u0644\u0627\u062d\u062a\u064a\u0627\u0637\u064a\u0629.',
        'backupHistory.error.noChange': '\u0644\u0645 \u064a\u062a\u0645 \u062a\u063a\u064a\u064a\u0631 \u0627\u0644\u0628\u064a\u0627\u0646\u0627\u062a.',
        'backupHistory.error.retry': '\u062d\u0627\u0648\u0644 \u0645\u0631\u0629 \u0623\u062e\u0631\u0649.',
        'backupHistory.error.generic': '\u062a\u0639\u0630\u0631 \u0625\u0643\u0645\u0627\u0644 \u0627\u0644\u0639\u0645\u0644\u064a\u0629.',
        'backupHistory.error.serviceUnavailable': '\u062e\u062f\u0645\u0629 \u0627\u0644\u0646\u0633\u062e \u0627\u0644\u0627\u062d\u062a\u064a\u0627\u0637\u064a \u063a\u064a\u0631 \u0645\u062a\u0627\u062d\u0629 \u062d\u0627\u0644\u064a\u064b\u0627. \u062d\u0627\u0648\u0644 \u0645\u0631\u0629 \u0623\u062e\u0631\u0649 \u0628\u0639\u062f \u0642\u0644\u064a\u0644.',
        'backupHistory.error.storageNotConfigured': '\u0627\u0644\u062a\u062e\u0632\u064a\u0646 \u0627\u0644\u062e\u0627\u0635 \u0644\u0644\u0646\u0633\u062e \u0627\u0644\u0627\u062d\u062a\u064a\u0627\u0637\u064a\u0629 \u063a\u064a\u0631 \u0645\u0647\u064a\u0623 \u062d\u0627\u0644\u064a\u064b\u0627. \u064a\u062c\u0628 \u0639\u0644\u0649 \u0645\u062f\u064a\u0631 \u0627\u0644\u0645\u0646\u0635\u0629 \u0631\u0628\u0637 \u0645\u0632\u0648\u062f \u062a\u062e\u0632\u064a\u0646 \u0645\u0639\u062a\u0645\u062f \u0642\u0628\u0644 \u0625\u0646\u0634\u0627\u0621 \u0646\u0633\u062e\u0629 \u0645\u062d\u0641\u0648\u0638\u0629.',
        'backupHistory.error.storageUnavailable': '\u0627\u0644\u062a\u062e\u0632\u064a\u0646 \u0627\u0644\u062e\u0627\u0635 \u0644\u0644\u0646\u0633\u062e \u0627\u0644\u0627\u062d\u062a\u064a\u0627\u0637\u064a\u0629 \u063a\u064a\u0631 \u0645\u062a\u0627\u062d \u062d\u0627\u0644\u064a\u064b\u0627. \u062d\u0627\u0648\u0644 \u0645\u0631\u0629 \u0623\u062e\u0631\u0649 \u0628\u0639\u062f \u0627\u0644\u062a\u062d\u0642\u0642 \u0645\u0646 \u0625\u0639\u062f\u0627\u062f\u0627\u062a \u0645\u0632\u0648\u062f \u0627\u0644\u062a\u062e\u0632\u064a\u0646.'
    });

    const backupHistoryEnglish = Object.freeze({
        'backupHistory.dialog.title': 'Restore a backup',
        'backupHistory.dialog.description': 'Choose a compressed backup file. It will be inspected first; restoration starts only after your confirmation.',
        'backupHistory.dialog.file': 'Backup file (.json.gz)',
        'backupHistory.dialog.reason': 'Reason for restoration *',
        'backupHistory.dialog.reasonPlaceholder': 'Enter the reason for restoring this backup',
        'backupHistory.dialog.close': 'Close',
        'backupHistory.dialog.cancel': 'Cancel',
        'backupHistory.dialog.restore': 'Restore backup',
        'backupHistory.dialog.restoreVerified': 'Restore after verification',
        'backupHistory.dialog.operationReason': 'Reason for this operation *',
        'backupHistory.dialog.operationReasonPlaceholder': 'Enter a clear reason to retain in the audit log',
        'backupHistory.dialog.reasonRequired': 'A reason is required.',
        'backupHistory.validation.fileVerified': 'File verified',
        'backupHistory.validation.backupLabel': 'Backup',
        'backupHistory.validation.createdAt': 'Backup created:',
        'backupHistory.validation.integrityVerified': 'SHA-256 file integrity verified.',
        'backupHistory.validation.legacyIntegrity': 'Legacy backup structure verified.',
        'backupHistory.validation.rows': '{{count}} rows',
        'backupHistory.validation.table': 'Table',
        'backupHistory.validation.rowCount': 'Rows',
        'backupHistory.validation.noData': 'No data was found in this backup.',
        'backupHistory.validation.fileTooLarge': 'The file exceeds 25 MB.',
        'backupHistory.validation.inspecting': 'Inspecting backup…',
        'backupHistory.validation.invalidFile': 'The file is not valid.',
        'backupHistory.validation.inspectFailed': 'Could not verify the backup:',
        'backupHistory.confirm.confirm': 'Confirm',
        'backupHistory.confirm.createTitle': 'Create a saved gym backup',
        'backupHistory.confirm.create': 'Create backup',
        'backupHistory.confirm.restoreTitle': 'Confirm backup restoration',
        'backupHistory.confirm.restoreBody': 'After verification, the current data will be replaced by this backup. A new backup of the current state will first be created on your device if you choose to keep it.',
        'backupHistory.confirm.restoreWarning': 'Restoration cannot be undone from this operation.',
        'backupHistory.confirm.restoreNow': 'Restore now',
        'backupHistory.confirm.restoreContinue': 'Continue restoration',
        'backupHistory.confirm.deleteTitle': 'Confirm backup deletion',
        'backupHistory.confirm.deleteBody': 'This saved backup will be deleted from private storage. Current system data will not be affected.',
        'backupHistory.confirm.delete': 'Yes, delete',
        'backupHistory.confirm.deleteFallback': 'Delete this saved backup?',
        'backupHistory.action.creating': 'Creating backup…',
        'backupHistory.action.preparingDownload': 'Preparing download…',
        'backupHistory.action.restoring': 'Restoring backup…',
        'backupHistory.action.deleting': 'Deleting backup…',
        'backupHistory.message.alreadyCreated': 'The daily backup already exists.',
        'backupHistory.message.created': 'The saved backup was created and verified.',
        'backupHistory.message.downloaded': 'The backup was downloaded.',
        'backupHistory.message.localCopy': 'A one-time copy was created and saved on your device only.',
        'backupHistory.message.restored': 'The backup was restored successfully.',
        'backupHistory.message.reload': 'System data will now be refreshed.',
        'backupHistory.message.deleted': 'The backup was deleted.',
        'backupHistory.error.createFailed': 'Could not create the saved backup.',
        'backupHistory.error.downloadFailed': 'Could not download the backup.',
        'backupHistory.error.restoreFailed': 'Backup restoration failed.',
        'backupHistory.error.deleteFailed': 'Could not delete the backup.',
        'backupHistory.error.noChange': 'No data was changed.',
        'backupHistory.error.retry': 'Please try again.',
        'backupHistory.error.generic': 'The operation could not be completed.',
        'backupHistory.error.serviceUnavailable': 'The backup service is temporarily unavailable. Please try again shortly.',
        'backupHistory.error.storageNotConfigured': 'Private backup storage is not configured. A platform administrator must connect an approved provider before a saved backup can be created.',
        'backupHistory.error.storageUnavailable': 'Private backup storage is currently unavailable. Check the provider settings and try again.'
    });

    const messages = Object.freeze({
        ar: Object.freeze({
            'platformAdminScreen.shell.brandName': 'منصة Logic Fit',
            'platformAdminScreen.shell.brandDescription': 'إدارة المنصة المركزية',
            'platformAdminScreen.shell.sidebarCaption': 'إدارة المنصة',
            'platformAdminScreen.shell.scopeTitle': 'نطاق المنصة',
            'platformAdminScreen.shell.scopeDescription': 'نطاق مستقل بلا جيم افتراضي',
            'platformAdminScreen.shell.topbarEyebrow': 'منصة Logic Fit',
            'platformAdminScreen.shell.roleDescription': 'مدير المنصة',
            ...backupHistoryArabic,
            ...loginScreenArabic,
            ...trainerWorkspaceScreenArabic,
            ...trainerStudioV2Arabic,
            ...reportsScreenArabic,
            ...portalAnalyticsScreenArabic,
            ...coachingScreenArabic,
            ...gymLibraryScreenArabic,
            ...membershipManagementScreenArabic,
            ...permissionsScreenArabic,
            'feedback.kicker': 'صوت المشتركين',
            'feedback.title': 'تقييمات المشتركين',
            'feedback.description': 'راجع آراء الأعضاء ومشكلاتهم واقتراحاتهم لتحسين تجربة الجيم.',
            'feedback.refresh': 'تحديث التقييمات',
            'feedback.filter.rating': 'التقييم',
            'feedback.filter.rating.all': 'كل التقييمات',
            'feedback.filter.rating.one': 'نجمة واحدة',
            'feedback.filter.rating.two': 'نجمتان',
            'feedback.filter.rating.stars': '{{count}} نجوم',
            'feedback.filter.type': 'نوع الملاحظة',
            'feedback.filter.type.all': 'كل الملاحظات',
            'feedback.type.general': 'رأي عام',
            'feedback.type.problem': 'مشكلة',
            'feedback.type.complaint': 'شكوى',
            'feedback.type.suggestion': 'اقتراح',
            'feedback.type.featureRequest': 'إضافة يحتاجها {{brand}}',
            'feedback.filter.from': 'من تاريخ',
            'feedback.filter.to': 'إلى تاريخ',
            'feedback.filter.search': 'بحث عن مشترك',
            'feedback.filter.search.placeholder': 'الاسم أو رقم الهاتف',
            'feedback.reset': 'إعادة تعيين',
            'feedback.meta.total': 'إجمالي النتائج: {{count}}',
            'feedback.loading': 'جاري تحميل التقييمات…',
            'feedback.empty.title': 'لا توجد تقييمات مطابقة',
            'feedback.empty.description': 'ستظهر آراء المشتركين هنا بعد إرسالها من بوابة العضوية.',
            'feedback.error.title': 'تعذر تحميل التقييمات',
            'feedback.error.description': 'حدثت مشكلة أثناء تحميل التقييمات. حاول مرة أخرى.',
            'feedback.retry': 'إعادة المحاولة',
            'feedback.table.member': 'المشترك',
            'feedback.table.rating': 'التقييم',
            'feedback.table.type': 'نوع الملاحظة',
            'feedback.table.message': 'الرأي أو المشكلة',
            'feedback.table.date': 'تاريخ الإرسال',
            'feedback.table.action': 'الإجراء',
            'feedback.rating.aria': '{{count}} من 5 نجوم',
            'feedback.action.memberDetails': 'تفاصيل العضو',
            'feedback.pagination.range': 'عرض {{from}}–{{to}} من {{total}} تقييم',
            'feedback.pagination.page': 'صفحة {{page}} من {{pages}}',
            'feedback.pagination.previous': 'السابق',
            'feedback.pagination.next': 'التالي',
            'feedback.value.unavailable': '—',
            'platformAdminScreen.page.dashboard': 'لوحة المنصة',
            'platformAdminScreen.page.gyms': 'الجيمات',
            'platformAdminScreen.page.requests': 'طلبات الاشتراك',
            'platformAdminScreen.page.gymRegistrations': 'طلبات الانضمام',
            'platformAdminScreen.page.paymentMethods': 'وسائل دفع Logic Fit',
            'platformAdminScreen.page.backups': 'النسخ والتعافي',
            'platformAdminScreen.page.plans': 'الباقات',
            'platformAdminScreen.page.audit': 'سجل المنصة',
            'platformAdminScreen.page.settings': 'إعدادات المنصة',
            'platformAdminScreen.nav.gyms': 'الجيمات',
            'platformAdminScreen.nav.requests': 'طلبات الاشتراك',
            'platformAdminScreen.nav.registrations': 'طلبات الانضمام',
            'platformAdminScreen.nav.paymentMethods': 'دفع Logic Fit',
            'platformAdminScreen.nav.backups': 'النسخ والتعافي',
            'platformAdminScreen.nav.plans': 'الباقات',
            'platformAdminScreen.nav.audit': 'سجل المنصة',
            'platformAdminScreen.nav.settings': 'إعدادات المنصة',
            'platformAdminScreen.action.refresh': 'تحديث',
            'platformAdminScreen.action.refreshData': 'تحديث البيانات',
            'platformAdminScreen.action.refreshRequests': 'تحديث الطلبات',
            'platformAdminScreen.action.addGym': '+ إضافة جيم جديد',
            'platformAdminScreen.action.addPaymentMethod': '+ إضافة وسيلة دفع',
            'platformAdminScreen.action.addPlan': '+ إضافة باقة',
            'platformAdminScreen.action.cleanupExpired': 'تنظيف المنتهية',
            'platformAdminScreen.action.createPlatformBackup': 'إنشاء نسخة للمنصة',
            'platformAdminScreen.action.openAll': 'عرض الكل',
            'platformAdminScreen.action.manageGyms': 'إدارة الجيمات',
            'platformAdminScreen.action.fullLog': 'السجل الكامل',
            'platformAdminScreen.action.openProfile': 'فتح الملف',
            'platformAdminScreen.action.preview': 'معاينة',
            'platformAdminScreen.action.notUploaded': 'لم يرفع',
            'platformAdminScreen.action.notUploadedProof': 'لم يتم رفع إثبات دفع مؤكد',
            'platformAdminScreen.action.approve': 'اعتماد',
            'platformAdminScreen.action.reject': 'رفض',
            'platformAdminScreen.action.edit': 'تعديل',
            'platformAdminScreen.action.download': 'تنزيل',
            'platformAdminScreen.action.activate': 'تفعيل',
            'platformAdminScreen.action.disable': 'إيقاف',
            'platformAdminScreen.action.archive': 'أرشفة',
            'platformAdminScreen.action.delete': 'حذف',
            'platformAdminScreen.action.noAction': '—',
            'platformAdminScreen.filter.allCustomerTypes': 'كل أنواع العملاء',
            'platformAdminScreen.filter.gym': 'جيم',
            'platformAdminScreen.filter.trainer': 'مدرب مستقل',
            'platformAdminScreen.filter.allStatuses': 'كل الحالات',
            'platformAdminScreen.filter.active': 'نشط',
            'platformAdminScreen.filter.trial': 'تجريبي',
            'platformAdminScreen.filter.suspended': 'موقوف',
            'platformAdminScreen.filter.expired': 'منتهي',
            'platformAdminScreen.filter.archived': 'مؤرشف',
            'platformAdminScreen.filter.allDates': 'كل المواعيد',
            'platformAdminScreen.filter.tenantTypeLabel': 'تصفية نوع العميل',
            'platformAdminScreen.filter.tenantStatusLabel': 'تصفية حالة العميل',
            'platformAdminScreen.filter.tenantPlanLabel': 'تصفية باقة العميل',
            'platformAdminScreen.filter.tenantExpiryLabel': 'تصفية موعد التجديد',
            'platformAdminScreen.filter.allPlans': 'كل الباقات',
            'platformAdminScreen.filter.expiring7': 'تنتهي خلال 7 أيام',
            'platformAdminScreen.filter.expiring30': 'تنتهي خلال 30 يومًا',
            'platformAdminScreen.filter.allRequests': 'كل الطلبات',
            'platformAdminScreen.filter.pending': 'قيد المراجعة',
            'platformAdminScreen.filter.approved': 'مقبول',
            'platformAdminScreen.filter.rejected': 'مرفوض',
            'platformAdminScreen.filter.cancelled': 'ملغي',
            'platformAdminScreen.search.gyms': 'ابحث بالاسم أو المعرف أو المالك...',
            'platformAdminScreen.search.tenantLabel': 'البحث في الجيمات والعملاء',
            'platformAdminScreen.shell.navigationLabel': 'تنقل إدارة المنصة',
            'platformAdminScreen.search.global': 'ابحث عن جيم أو مالك...',
            'platformAdminScreen.search.label': 'البحث في الجيمات والعملاء',
            'platformAdminScreen.search.globalLabel': 'البحث في الجيمات ومالكيها',
            'platformAdminScreen.dashboard.eyebrow': 'نظرة عامة',
            'platformAdminScreen.dashboard.today': 'صورة المنصة اليوم',
            'platformAdminScreen.dashboard.description': 'تابع حالة الجيمات والاشتراكات والاستخدام من مكان واحد.',
            'platformAdminScreen.dashboard.loading': 'جارٍ تحميل مؤشرات المنصة...',
            'platformAdminScreen.dashboard.health': 'صحة الجيمات',
            'platformAdminScreen.dashboard.distribution': 'توزيع حالات الجيمات',
            'platformAdminScreen.dashboard.actionsEyebrow': 'إجراءات سريعة',
            'platformAdminScreen.dashboard.actionsTitle': 'إجراءات المنصة',
            'platformAdminScreen.dashboard.openGym': 'فتح ملف أي جيم',
            'platformAdminScreen.dashboard.reviewRequests': 'مراجعة الطلبات',
            'platformAdminScreen.dashboard.billing': 'الدفع والاشتراكات',
            'platformAdminScreen.dashboard.configurePlans': 'ضبط الباقات',
            'platformAdminScreen.dashboard.limitsBenefits': 'الحدود والمزايا',
            'platformAdminScreen.dashboard.latestGyms': 'أحدث الجيمات',
            'platformAdminScreen.dashboard.latestGymsTitle': 'آخر الجيمات المضافة',
            'platformAdminScreen.dashboard.activity': 'سجل النشاط',
            'platformAdminScreen.dashboard.latestActivity': 'آخر الأنشطة',
            'platformAdminScreen.dashboard.allActivity': 'السجل الكامل',
            'platformAdminScreen.dashboard.gymsTotal': 'إجمالي الجيمات',
            'platformAdminScreen.dashboard.gymsTotalCaption': 'كل الجيمات المسجلة',
            'platformAdminScreen.dashboard.gymsActive': 'الجيمات النشطة',
            'platformAdminScreen.dashboard.gymsActiveCaption': 'تعمل الآن',
            'platformAdminScreen.dashboard.gymsTrial': 'جيمات تجريبية',
            'platformAdminScreen.dashboard.gymsTrialCaption': 'في فترة التجربة',
            'platformAdminScreen.dashboard.pendingRequests': 'طلبات قيد المراجعة',
            'platformAdminScreen.dashboard.pendingRequestsCaption': 'تحتاج إلى إجراء',
            'platformAdminScreen.dashboard.expiring': 'تنتهي قريبًا',
            'platformAdminScreen.dashboard.expiringCaption': 'خلال 30 يومًا',
            'platformAdminScreen.dashboard.members': 'إجمالي المشتركين',
            'platformAdminScreen.dashboard.allGyms': 'في كل الجيمات',
            'platformAdminScreen.dashboard.users': 'مستخدمو النظام',
            'platformAdminScreen.dashboard.ownersAssistants': 'الملاك والمساعدون',
            'platformAdminScreen.dashboard.aiUsage': 'استخدام AI',
            'platformAdminScreen.dashboard.thisMonth': 'هذا الشهر',
            'platformAdminScreen.dashboard.storage': 'التخزين',
            'platformAdminScreen.dashboard.files': 'ملفات المنصة والجيمات',
            'platformAdminScreen.dashboard.newGyms': 'جيمات جديدة',
            'platformAdminScreen.dashboard.selectedPeriod': 'خلال الفترة المحددة',
            'platformAdminScreen.empty.recentGyms': 'لا توجد جيمات مضافة بعد.',
            'platformAdminScreen.empty.activity': 'لا توجد عمليات مسجلة.',
            'platformAdminScreen.empty.tenants': 'لا توجد نتائج مطابقة.',
            'platformAdminScreen.empty.results': 'لا توجد نتائج',
            'platformAdminScreen.empty.requests': 'لا توجد طلبات.',
            'platformAdminScreen.empty.registrations': 'لا توجد طلبات انضمام مطابقة.',
            'platformAdminScreen.empty.paymentMethodsTitle': 'لا توجد وسائل دفع للمنصة بعد.',
            'platformAdminScreen.empty.paymentMethodsDescription': 'أضف وسيلة دفع نشطة حتى يستطيع صاحب الجيم إكمال التسجيل من /register-gym.',
            'platformAdminScreen.empty.backupTenants': 'لا توجد بيانات نسخ للجيمات بعد.',
            'platformAdminScreen.empty.platformBackups': 'لم تُنشأ نسخ للمنصة بعد.',
            'platformAdminScreen.empty.backupAudit': 'لا توجد عمليات نسخ مسجلة.',
            'platformAdminScreen.empty.plans': 'لا توجد باقات.',
            'platformAdminScreen.empty.audit': 'لا توجد عمليات.',
            'platformAdminScreen.status.unknownTenantType': 'نوع غير معروف',
        'platformAdminScreen.status.noOwner': 'بدون مالك',
            'platformAdminScreen.status.requests': 'طلب',
            'platformAdminScreen.status.days': '{{count}} يوم',
            'platformAdminScreen.status.months': '{{count}} شهر',
            'platformAdminScreen.status.monthly': 'شهري',
            'platformAdminScreen.status.quarterly': '3 أشهر',
            'platformAdminScreen.status.semiannual': '6 أشهر',
            'platformAdminScreen.status.annual': 'سنوي',
            'platformAdminScreen.status.noExpiry': 'بدون انتهاء',
            'platformAdminScreen.status.allTenants': 'عميل منصة',
            'platformAdminScreen.summary.rows': 'عرض {{shown}} من {{total}} {{entity}}',
            'platformAdminScreen.summary.paymentMethods': '{{active}} وسيلة نشطة · {{total}} إجمالي',
            'platformAdminScreen.table.customer': 'العميل',
            'platformAdminScreen.table.type': 'النوع',
            'platformAdminScreen.table.owner': 'المالك',
            'platformAdminScreen.table.plan': 'الباقة',
            'platformAdminScreen.table.status': 'الحالة',
            'platformAdminScreen.table.subscription': 'الاشتراك',
            'platformAdminScreen.table.usage': 'الاستخدام',
            'platformAdminScreen.table.lastActivity': 'آخر نشاط',
            'platformAdminScreen.table.amount': 'المبلغ',
            'platformAdminScreen.table.proof': 'إثبات الدفع',
            'platformAdminScreen.table.date': 'التاريخ',
            'platformAdminScreen.table.action': 'الإجراء',
            'platformAdminScreen.table.duration': 'المدة',
            'platformAdminScreen.table.gym': 'الجيم',
            'platformAdminScreen.table.contact': 'المسؤول ووسيلة التواصل',
            'platformAdminScreen.table.planTerm': 'الباقة والمدة',
            'platformAdminScreen.table.amountMethod': 'المبلغ وطريقة الدفع',
            'platformAdminScreen.table.method': 'الوسيلة',
            'platformAdminScreen.table.account': 'الرقم / الحساب',
            'platformAdminScreen.table.recipientInstructions': 'المستلم والتعليمات',
            'platformAdminScreen.table.order': 'الترتيب',
            'platformAdminScreen.table.updated': 'آخر تحديث',
            'platformAdminScreen.table.time': 'الوقت',
            'platformAdminScreen.table.actor': 'الممثل',
            'platformAdminScreen.table.operation': 'العملية',
            'platformAdminScreen.table.reason': 'السبب',
            'platformAdminScreen.table.details': 'التفاصيل',
            'platformAdminScreen.gyms.kicker': 'دليل الجيمات',
            'platformAdminScreen.gyms.title': 'كل الجيمات',
            'platformAdminScreen.gyms.description': 'إدارة آمنة ومباشرة لكل جيم دون الدخول إلى حساب المالك.',
            'platformAdminScreen.requests.kicker': 'الفوترة اليدوية',
            'platformAdminScreen.requests.description': 'راجع إثباتات الدفع وفعّل اشتراك الجيم يدويًا بعد التحقق.',
            'platformAdminScreen.registrations.kicker': 'التسجيل الذاتي',
            'platformAdminScreen.registrations.title': 'طلبات الانضمام إلى Logic Fit',
            'platformAdminScreen.registrations.description': 'راجع طلبات الجيمات الجديدة وإثباتات الدفع قبل إنشاء Tenant وحساب Owner.',
            'platformAdminScreen.payments.kicker': 'تحصيل اشتراكات Logic Fit',
            'platformAdminScreen.payments.description': 'أدر وسائل الدفع التي تظهر لصاحب الجيم أثناء التسجيل في Logic Fit. هذه البيانات تخص المنصة فقط ولا تُستخدم داخل بوابات الجيمات.',
            'platformAdminScreen.payments.source': 'مصدر الدفع في /register-gym',
            'platformAdminScreen.payments.sourceDescription': 'سيتم عرض الوسائل النشطة فقط للمتقدمين. لا تُعتبر الوسيلة جاهزة قبل حفظها وتفعيلها من هذه الشاشة، ولا يتم تخزين أي بيانات داخل الواجهة أو الكود.',
            'platformAdminScreen.payments.current': 'القائمة الحالية',
            'platformAdminScreen.backups.kicker': 'حماية المنصة',
            'platformAdminScreen.backups.description': 'تابع نسخ الجيمات والمنصة، وتحقق من سلامة آخر نسخة قبل الاعتماد عليها.',
            'platformAdminScreen.backups.health': 'صحة النسخ',
            'platformAdminScreen.backups.dailySummary': 'ملخص النسخ اليومية',
            'platformAdminScreen.backups.recovery': 'استعادة المنصة',
            'platformAdminScreen.backups.storageStatus': 'حالة التخزين الخاص',
            'platformAdminScreen.backups.platformDR': 'نسخ المنصة',
            'platformAdminScreen.backups.tenantBackups': 'آخر نسخة لكل جيم',
            'platformAdminScreen.backups.history': 'سجل النسخ',
            'platformAdminScreen.backups.latestOperations': 'أحدث عمليات Backup/DR',
            'platformAdminScreen.plans.kicker': 'باقات المنصة',
            'platformAdminScreen.plans.title': 'الباقات والحدود',
            'platformAdminScreen.plans.description': 'إدارة أسعار الباقات والمزايا التي يتم تطبيقها مركزيًا.',
            'platformAdminScreen.audit.kicker': 'سجل العمليات',
            'platformAdminScreen.audit.title': 'سجل عمليات المنصة',
            'platformAdminScreen.audit.description': 'كل قرار إداري محفوظ مع الممثل والوقت والسبب والتغيير.',
            'platformAdminScreen.settings.description': 'إدارة إعدادات التشغيل والتخصيص الخاصة بالمنصة من مكان واحد.',
            'platformAdminScreen.settings.sections': 'أقسام إعدادات المنصة',
            'platformAdminScreen.settings.instructions': 'اختر القسم المطلوب لإدارته. تظهر قوالب WhatsApp هنا كإعداد مركزي للمنصة فقط.',
            'platformAdminScreen.settings.subscriptions': 'الاشتراكات والخطط',
            'platformAdminScreen.settings.subscriptionsDescription': 'إدارة خطط المنصة وباقاتها.',
            'platformAdminScreen.settings.paymentMethods': 'وسائل الدفع',
            'platformAdminScreen.settings.paymentMethodsDescription': 'إدارة وسائل الدفع الخاصة بالمنصة.',
            'platformAdminScreen.settings.backups': 'النسخ الاحتياطي',
            'platformAdminScreen.settings.backupsDescription': 'مراجعة النسخ والاستعادة الآمنة.',
            'platformAdminScreen.settings.whatsapp': 'الرسائل وWhatsApp',
            'platformAdminScreen.settings.whatsappDescription': 'إدارة القوالب المركزية المستخدمة لجميع الجيمات والمدربين.',
            'platformAdminScreen.settings.templatesCount': '{{count}} قوالب',
            'platformAdminScreen.settings.back': 'العودة إلى إعدادات المنصة',
            'platformAdminScreen.settings.currentSection': 'القسم الحالي',
            'platformAdminScreen.settings.currentSectionDescription': 'إدارة هذا القسم من الشاشة الحالية.',
            'platformAdminScreen.whatsapp.kicker': 'إدارة المنصة · قوالب النظام',
            'platformAdminScreen.whatsapp.description': 'إدارة قوالب WhatsApp المركزية المستخدمة لجميع الجيمات والمدربين. يفتح WhatsApp للإرسال اليدوي.',
            'platformAdminScreen.whatsapp.centralTemplates': 'قوالب مركزية',
            'platformAdminScreen.whatsapp.onePerType': 'قالب نظام واحد لكل نوع رسالة.',
            'platformAdminScreen.whatsapp.listLabel': 'قوالب رسائل WhatsApp',
            'platformAdminScreen.whatsapp.templates': 'القوالب',
            'platformAdminScreen.whatsapp.listHint': 'اختر قالبًا لتحريره ومعاينته. تنطبق التعديلات المركزية على جميع العملاء.',
            'platformAdminScreen.whatsapp.centralListLabel': 'القوالب المركزية',
            'platformAdminScreen.whatsapp.messageText': 'نص الرسالة',
            'platformAdminScreen.whatsapp.variableHint': 'اختر متغيرًا لإضافته عند موضع المؤشر.',
            'platformAdminScreen.whatsapp.availableVariables': 'المتغيرات المتاحة',
            'platformAdminScreen.whatsapp.noVariables': 'لا توجد متغيرات متاحة لهذا القالب.',
            'platformAdminScreen.whatsapp.restoreDefault': 'استعادة الافتراضي',
            'platformAdminScreen.whatsapp.openPreview': 'فتح معاينة WhatsApp',
            'platformAdminScreen.whatsapp.saveChanges': 'حفظ التعديلات',
            'platformAdminScreen.whatsapp.previewLabel': 'معاينة الرسالة',
            'platformAdminScreen.whatsapp.previewTitle': 'معاينة WhatsApp',
            'platformAdminScreen.whatsapp.sampleData': 'بيانات تجريبية',
            'platformAdminScreen.whatsapp.previewNote': 'هذه المعاينة لا ترسل رسالة ولا تستخدم بيانات عضو حقيقي.',
            'platformAdminScreen.whatsapp.systemTemplate': 'قالب النظام',
            'platformAdminScreen.whatsapp.empty': 'لا توجد قوالب متاحة.',
            'platformAdminScreen.whatsapp.saved': 'تم الحفظ',
            'platformAdminScreen.whatsapp.unsaved': 'تغييرات غير محفوظة',
            'platformAdminScreen.whatsapp.loading': 'جارٍ تحميل القوالب…',
            'platformAdminScreen.whatsapp.loadError': 'تعذر تحميل القوالب.',
            'platformAdminScreen.whatsapp.saveError': 'تعذر حفظ القالب.',
            'platformAdminScreen.whatsapp.saveSuccess': 'تم حفظ قالب النظام.',
            'platformAdminScreen.whatsapp.restoreConfirm': 'سيتم استعادة نص قالب النظام الافتراضي. هل تريد المتابعة؟',
            'platformAdminScreen.whatsapp.restoreError': 'تعذرت استعادة القالب الافتراضي.',
            'platformAdminScreen.whatsapp.restoreSuccess': 'تمت استعادة القالب الافتراضي.',
            'platformAdminScreen.whatsapp.phonePrompt': 'أدخل رقم اختبار لفتح WhatsApp:',
            'platformAdminScreen.whatsapp.unsavedConfirm': 'لديك تغييرات غير محفوظة. هل تريد تبديل القالب؟',
            'platformAdminScreen.whatsapp.status.platform': 'قالب النظام · المنصة',
            'platformAdminScreen.whatsapp.status.system': 'نظامي',
            'platformAdminScreen.whatsapp.noVariablesForTemplate': 'لا توجد متغيرات لهذا القالب.',
            'platformAdminScreen.whatsapp.catalogLabel': 'قائمة القوالب',
            'platformAdminScreen.whatsapp.editorLabel': 'محرر القالب',
            'platformAdminScreen.whatsapp.insertLabel': 'إدراج متغير',
            'platformAdminScreen.whatsapp.livePreview': 'معاينة مباشرة',
            'platformAdminScreen.whatsapp.descriptionExact': 'إدارة قوالب WhatsApp المركزية المستخدمة لجميع الجيمات والمدربين. يظل فتح WhatsApp والإرسال يدويًا.',
            'platformAdminScreen.whatsapp.listHintExact': 'اختر قالبًا لتحريره ومعاينته. التعديلات المركزية تنطبق على كل الـTenants.',
            'platformAdminScreen.settings.templatesCountFixed': '9 قوالب',
            'platformAdminScreen.settings.backArrow': '→ العودة إلى إعدادات المنصة',
            'platformAdminScreen.filter.requestStatusLabel': 'حالة طلب الاشتراك',
            'platformAdminScreen.filter.registrationStatusLabel': 'حالة تسجيل الجيم',
            'platformAdminScreen.page.paymentMethodsTitle': 'وسائل دفع المنصة',
            'platformAdminScreen.backups.pageTitle': 'النسخ الاحتياطي والتعافي',
            'platformAdminScreen.backups.today': 'اليوم',
            'platformAdminScreen.backups.eligibleToday': 'الجيمات المستحقة اليوم',
            'platformAdminScreen.backups.verifiedToday': 'نسخ تم التحقق منها',
            'platformAdminScreen.backups.healthyDaily': 'نسخ يومية سليمة',
            'platformAdminScreen.backups.failedToday': 'نسخ فشلت',
            'platformAdminScreen.backups.reviewRetry': 'تحتاج مراجعة أو إعادة محاولة',
            'platformAdminScreen.backups.missingToday': 'نسخ مفقودة اليوم',
            'platformAdminScreen.backups.notCreated': 'لم تُنشأ بعد',
            'platformAdminScreen.backups.missingOrFailed': 'مفقود أو فاشل',
            'platformAdminScreen.backups.lastPlatformVerified': 'آخر نسخة منصة Verified',
            'platformAdminScreen.backups.restoreRehearsal': 'استعادة تجريبية مثبتة',
            'platformAdminScreen.backups.recurring': 'النسخ الدورية',
            'platformAdminScreen.backups.dailyOnly': 'اليومي فقط',
            'platformAdminScreen.backups.tableCoverage': 'تغطية سجل الجداول',
            'platformAdminScreen.backups.reviewNeeded': 'تحتاج مراجعة ({{count}})',
            'platformAdminScreen.backups.recentFailures': 'فشل نسخ المنصة مؤخرًا',
            'platformAdminScreen.backups.unconfigured': 'غير مهيأ',
            'platformAdminScreen.backups.privateStorageRequired': 'يلزم ربط مزود تخزين خاص قبل التشغيل الفعلي.',
            'platformAdminScreen.backups.offsitePrivacy': 'Off-site: {{status}} · لا يتم عرض مسارات التخزين أو روابط عامة للملفات الخاصة.',
            'platformAdminScreen.backups.connected': 'متصل',
            'platformAdminScreen.backups.localTesting': 'محلي للاختبار',
            'platformAdminScreen.backups.privateReady': 'التخزين الخاص جاهز للتحقق والرفع.',
            'platformAdminScreen.backups.localNotProduction': 'تخزين محلي للتطوير فقط؛ لا يُعتمد كنسخة Production أو Off-site.',
            'platformAdminScreen.backups.complete': 'مكتملة',
            'platformAdminScreen.backups.weekly': 'أسبوعي',
            'platformAdminScreen.backups.monthly': 'شهري',
            'platformAdminScreen.backups.verified': 'تم التحقق',
            'platformAdminScreen.backups.size': 'الحجم',
            'platformAdminScreen.backups.verification': 'التحقق',
            'platformAdminScreen.backups.backupDay': 'يوم النسخة',
            'platformAdminScreen.backups.lastVerification': 'آخر تحقق',
            'platformAdminScreen.backups.backup': 'النسخة',
            'platformAdminScreen.backups.result': 'النتيجة',
            'notificationCenter.trigger.label': 'الإشعارات',
            'notificationCenter.trigger.title': 'الإشعارات',
            'notificationCenter.panel.label': 'الإشعارات',
            'notificationCenter.panel.title': 'الإشعارات',
            'notificationCenter.panel.description': 'آخر المستجدات في حسابك',
            'notificationCenter.action.closePanel': 'إغلاق الإشعارات',
            'notificationCenter.action.close': 'إغلاق',
            'notificationCenter.filter.label': 'تصفية الإشعارات',
            'notificationCenter.filter.all': 'كل الإشعارات',
            'notificationCenter.action.refreshAccessible': 'تحديث الإشعارات',
            'notificationCenter.action.refresh': 'تحديث',
            'notificationCenter.action.markAllRead': 'تمييز الكل كمقروء',
            'notificationCenter.action.loadMore': 'تحميل المزيد',
            'notificationCenter.state.loadingMore': 'جارٍ تحميل المزيد…',
            'notificationCenter.state.endOfList': 'وصلت إلى نهاية الإشعارات',
            'notificationCenter.action.closeNotification': 'إغلاق الإشعار',
            'notificationCenter.action.markReadAccessible': 'تمييز الإشعار كمقروء',
            'notificationCenter.action.markRead': 'تمييز كمقروء',
            'notificationCenter.status.unread': 'غير مقروء',
            'notificationCenter.status.unreadCount': '{{count}} غير مقروءة',
            'notificationCenter.status.allRead': 'كل التنبيهات مقروءة',
            'notificationCenter.category.coaching': 'التدريب',
            'notificationCenter.category.registration': 'التسجيل',
            'notificationCenter.category.membership': 'العضويات',
            'notificationCenter.category.attendance': 'الحضور والانصراف',
            'notificationCenter.category.payment': 'المدفوعات',
            'notificationCenter.category.system': 'النظام',
            'notificationCenter.category.subscription': 'الاشتراكات',
            'notificationCenter.category.default': 'تنبيه',
            'notificationCenter.event.memberCreated': 'تمت إضافة المشترك',
            'notificationCenter.event.membershipCreated': 'تم إنشاء اشتراك',
            'notificationCenter.event.membershipFrozen': 'تم تجميد العضوية',
            'notificationCenter.event.membershipResumed': 'تم استئناف العضوية',
            'notificationCenter.event.membershipRenewed': 'تم تجديد العضوية',
            'notificationCenter.event.membershipUpdated': 'تم تحديث العضوية',
            'notificationCenter.event.paymentUpdated': 'تم تحديث الدفع',
            'notificationCenter.event.attendanceCheckedIn': 'تم تسجيل حضور',
            'notificationCenter.event.attendanceAutoCheckedOut': 'تم تسجيل الانصراف تلقائيًا',
            'notificationCenter.event.subscriptionRequestCreated': 'تم استلام طلب اشتراك',
            'notificationCenter.event.subscriptionRequestApproved': 'تم قبول طلب الاشتراك',
            'notificationCenter.event.subscriptionRequestRejected': 'تم رفض طلب الاشتراك',
            'notificationCenter.event.trainerSessionScheduled': 'تمت جدولة جلسة تدريب',
            'notificationCenter.event.trainerSessionUpdated': 'تم تحديث جلسة التدريب',
            'notificationCenter.event.trainerSessionStatusChanged': 'تغيرت حالة جلسة التدريب',
            'notificationCenter.event.trainerPlanPublished': 'تم نشر خطة تدريب',
            'notificationCenter.event.systemAnnouncement': 'إعلان جديد',
            'notificationCenter.event.generic': 'إشعار جديد',
            'notificationCenter.event.withName': '{{title}} {{name}}',
            'notificationCenter.event.withMembershipName': '{{title}} لـ{{name}}',
            'notificationCenter.state.empty': 'لا توجد إشعارات جديدة.',
            'notificationCenter.state.signIn': 'سجّل الدخول لعرض إشعاراتك.',
            'notificationCenter.state.loading': 'جارٍ تحميل الإشعارات…',
            'notificationCenter.state.loadError': 'تعذر تحميل الإشعارات. حاول مرة أخرى.',
            'platformAdminScreen.backupStatus.pending': 'قيد الانتظار',
            'platformAdminScreen.backupStatus.running': 'جارٍ التنفيذ',
            'platformAdminScreen.backupStatus.uploaded': 'تم الرفع',
            'platformAdminScreen.backupStatus.verifying': 'جارٍ التحقق',
            'platformAdminScreen.backupStatus.verified': 'تم التحقق',
            'platformAdminScreen.backupStatus.failed': 'فشل',
            'platformAdminScreen.backupStatus.expired': 'منتهية',
            'platformAdminScreen.backupStatus.deleted': 'محذوفة',
            'platformAdminScreen.backupType.platform_daily': 'نسخة يومية للمنصة',
            'platformAdminScreen.backupType.platform_weekly': 'نسخة أسبوعية للمنصة',
            'platformAdminScreen.backupType.platform_monthly': 'نسخة شهرية للمنصة',
            'platformAdminScreen.backupType.platform_manual': 'نسخة يدوية للمنصة',
            'platformAdminScreen.backupType.tenant_daily': 'نسخة يومية للجيم',
            'platformAdminScreen.backupType.tenant_manual': 'نسخة يدوية للجيم',
            'platformAdminScreen.backupType.tenant_pre_restore': 'نسخة أمان قبل الاستعادة',
            'platformAdminScreen.activity.member_created': 'تمت إضافة مشترك',
            'platformAdminScreen.activity.membership_created': 'تم إنشاء اشتراك',
            'platformAdminScreen.activity.attendance_checked_in': 'تم تسجيل حضور عضو',
            'platformAdminScreen.activity.operation': 'عملية إدارية',
            'platformAdminScreen.activity.system': 'النظام',
            'platformAdminScreen.login.forPlatformAdmin': 'هذه الصفحة مخصصة لحساب PlatformAdmin فقط.',
            'platformAdminScreen.theme.enableLight': 'تفعيل المظهر الفاتح',
            'platformAdminScreen.theme.enableDark': 'تفعيل المظهر الداكن',
            'language.name': 'العربية',
            'language.short': 'EN',
            'language.switchToEnglish': 'التبديل إلى الإنجليزية',
            'language.switchToArabic': 'التبديل إلى العربية',
            'common.greeting': 'مرحبًا {{name}}',
            'common.loading.data': 'جارٍ تحميل البيانات',
            'common.loading.indicators': 'جارٍ تحميل المؤشرات',
            'common.loading.text': 'جارٍ تحميل النص',
            'common.loading.avatar': 'جارٍ تحميل الصورة الشخصية',
            'common.loading.metric': 'جارٍ تحميل المؤشر',
            'common.loading.chart': 'جارٍ تحميل الرسم البياني',
            'common.loading.form': 'جارٍ تحميل النموذج',
            'common.loading.select': 'جارٍ تحميل الخيارات',
            'passwordChange.brand.subtitle': 'مساحة عمل آمنة',
            'passwordChange.pageTitle': 'تغيير كلمة المرور | Logic Fit',
            'passwordChange.eyebrow': 'خطوة أمان مطلوبة',
            'passwordChange.title': 'أنشئ كلمة مرورك الجديدة',
            'passwordChange.description': 'انتهت صلاحية كلمة المرور المؤقتة. اختر كلمة مرور جديدة لمتابعة الدخول إلى مساحة عملك.',
            'passwordChange.field.new': 'كلمة المرور الجديدة',
            'passwordChange.field.confirm': 'تأكيد كلمة المرور',
            'passwordChange.hint': 'استخدم 8 أحرف على الأقل، ويُفضّل المزج بين الحروف والأرقام.',
            'passwordChange.password.show': 'إظهار كلمة المرور',
            'passwordChange.password.hide': 'إخفاء كلمة المرور',
            'passwordChange.password.showNew': 'إظهار كلمة المرور الجديدة',
            'passwordChange.password.hideNew': 'إخفاء كلمة المرور الجديدة',
            'passwordChange.password.showConfirm': 'إظهار تأكيد كلمة المرور',
            'passwordChange.password.hideConfirm': 'إخفاء تأكيد كلمة المرور',
            'passwordChange.submit': 'حفظ كلمة المرور والمتابعة',
            'passwordChange.submit.loading': 'جارٍ حفظ كلمة المرور…',
            'passwordChange.note': 'لن يتم تسجيل كلمة المرور أو عرضها مرة أخرى.',
            'passwordChange.footer': 'تجربة آمنة تبدأ من حسابك',
            'passwordChange.identity': 'الحساب: {{name}}',
            'passwordChange.error.request': 'تعذر إكمال العملية. حاول مرة أخرى.',
            'passwordChange.error.session': 'تعذر التحقق من جلسة الحساب. حاول إعادة تحميل الصفحة.',
            'passwordChange.error.short': 'يجب أن تتكون كلمة المرور الجديدة من 8 أحرف على الأقل.',
            'passwordChange.error.mismatch': 'كلمتا المرور غير متطابقتين.',
            'passwordChange.error.sessionUpdate': 'لم يتم تحديث حالة الحساب بعد. أعد المحاولة.',
            'passwordChange.error.save': 'تعذر حفظ كلمة المرور. حاول مرة أخرى.',
            'passwordChange.error.api.INVALID_USER_ID': 'بيانات الحساب غير صالحة. سجّل الدخول مجددًا.',
            'passwordChange.error.api.INVALID_PASSWORD': 'كلمة المرور يجب أن تتراوح بين 8 و128 حرفًا.',
            'passwordChange.error.api.PASSWORD_CONFIRMATION_MISMATCH': 'كلمتا المرور غير متطابقتين.',
            'passwordChange.error.api.ACCOUNT_DISABLED': 'هذا الحساب غير متاح. تواصل مع مسؤول النظام.',
            'passwordChange.error.api.PASSWORD_CHANGE_NOT_REQUIRED': 'لا توجد كلمة مرور مؤقتة تحتاج إلى تغيير.',
            'passwordChange.error.api.AUTH_REQUIRED': 'انتهت جلسة الدخول. سجّل الدخول مرة أخرى.',
            'passwordChange.error.api.TENANT_ACCESS_REQUIRED': 'تعذر التحقق من مساحة العمل المرتبطة بهذا الحساب.',
            'passwordChange.theme.dark': 'الوضع الداكن',
            'passwordChange.theme.light': 'الوضع الفاتح',
            'passwordChange.theme.enableDark': 'تفعيل الوضع الداكن',
            'passwordChange.theme.enableLight': 'تفعيل الوضع الفاتح',
            'platformAdminForbidden.pageTitle': 'غير مصرح | Logic Fit',
            'platformAdminForbidden.eyebrow': 'لإدارة المنصة فقط',
            'platformAdminForbidden.title': 'هذه المساحة مخصصة لمدير المنصة',
            'platformAdminForbidden.description': 'حسابات مالك الجيم والمساعد تستخدم تطبيق الجيم من المسار الرئيسي.',
            'platformAdminForbidden.returnToGym': 'العودة إلى تطبيق الجيم',
            'platformAdminForbidden.switchAccount': 'تسجيل الخروج والدخول كمدير للمنصة',
            'platformAdminForbidden.switchAccount.loading': 'جارٍ تجهيز تسجيل الدخول…',
            'registration.pageTitle.gym': 'ابدأ مع Logic Fit',
            'registration.pageTitle.trainer': 'ابدأ كمدرب شخصي | Logic Fit',
            'registration.brand.subtitle.gym': 'منصة إدارة الجيمات',
            'registration.brand.subtitle.trainer': 'منصة إدارة التدريب الشخصي',
            'registration.header.return': 'العودة للمنصة',
            'registration.header.safeNote': 'بياناتك محمية',
            'registration.path.ariaLabel': 'نوع استخدام المنصة',
            'registration.path.eyebrow': 'خطوتك الأولى',
            'registration.path.title': 'هتستخدم المنصة لإيه؟',
            'registration.path.description': 'اختار المسار المناسب لك عشان نجهز تجربتك.',
            'registration.path.gym.title': 'إدارة جيم',
            'registration.path.gym.description': 'للجيمات ومراكز اللياقة',
            'registration.path.trainer.title': 'أنا مدرب شخصي',
            'registration.path.trainer.description': 'للتدريب الفردي وإدارة عملائك',
            'registration.progress.ariaLabel.gym': 'مراحل التسجيل',
            'registration.progress.ariaLabel.trainer': 'مراحل تسجيل المدرب',
            'registration.progress.gym.1.title': 'بيانات الجيم',
            'registration.progress.gym.1.description': 'المعلومات الأساسية',
            'registration.progress.trainer.1.title': 'بيانات المدرب',
            'registration.progress.trainer.1.description': 'الهوية والتواصل',
            'registration.progress.2.title': 'الباقة',
            'registration.progress.gym.2.description': 'اختر ما يناسبك',
            'registration.progress.trainer.2.description': 'اختيار الخطة',
            'registration.progress.3.title': 'المدة',
            'registration.progress.3.description': 'طريقة الاشتراك',
            'registration.progress.4.title': 'الدفع',
            'registration.progress.4.description': 'بيانات التحويل',
            'registration.progress.5.title': 'الإثبات',
            'registration.progress.5.description': 'رفع صورة الدفع',
            'registration.progress.6.title': 'المراجعة',
            'registration.progress.gym.6.description': 'تأكيد وإرسال الطلب',
            'registration.progress.trainer.6.description': 'تأكيد الطلب',
            'registration.aside.ariaLabel.gym': 'عن Logic Fit وتجربة التسجيل',
            'registration.aside.ariaLabel.trainer': 'عن Logic Fit وتجربة تسجيل المدرب',
            'registration.aside.kicker': 'ابدأ بخطوة واضحة',
            'registration.aside.gym.title': 'جهّز جيمك للعمل بذكاء.',
            'registration.aside.gym.description': 'قدّم طلب الاشتراك، وسيتولى فريق Logic Fit مراجعته ثم يجهز مساحة جيمك الخاصة.',
            'registration.aside.gym.imageAlt': 'مساحة تدريب مجهزة لإدارة الجيم',
            'registration.aside.trainer.title': 'حوّل خبرتك إلى مساحة تدريب أذكى.',
            'registration.aside.trainer.description': 'قدّم طلبك، وسيتولى فريق Logic Fit مراجعته ثم يجهز مساحة عملك الخاصة.',
            'registration.aside.trainer.imageAlt': 'مساحة تدريب حديثة',
            'registration.aside.gym.footerTitle': 'تجربة واضحة من البداية',
            'registration.aside.gym.footerDescription': 'بعد الاعتماد، يصلك رابط الدخول وبيانات التفعيل عبر WhatsApp.',
            'registration.aside.trainer.footerTitle': 'تجربة مصممة للمدرب',
            'registration.aside.trainer.footerDescription': 'بعد الاعتماد، تصلك بيانات الدخول الآمنة عبر القناة المعتمدة.',
            'registration.card.badge.gym': 'طلب جديد',
            'registration.card.badge.trainer': 'طلب مدرب شخصي',
            'registration.step.1.gym.title': 'بيانات الجيم والمسؤول',
            'registration.step.1.trainer.title': 'بيانات المدرب',
            'registration.stage.1.gym.description': 'أدخل بيانات التواصل الأساسية حتى نتمكن من مراجعة طلبك.',
            'registration.stage.1.trainer.description': 'أدخل بيانات التواصل الأساسية لمراجعة طلبك.',
            'registration.field.gymName.gym': 'اسم الجيم',
            'registration.field.gymName.trainer': 'اسم المدرب أو العلامة',
            'registration.field.gymName.placeholder.gym': 'مثال: Power Gym',
            'registration.field.gymName.placeholder.trainer': 'مثال: أحمد كوتشنج',
            'registration.field.ownerName.gym': 'اسم المسؤول',
            'registration.field.ownerName.trainer': 'الاسم الكامل',
            'registration.field.ownerName.placeholder': 'الاسم بالكامل',
            'registration.field.phone.gym': 'رقم WhatsApp',
            'registration.field.phone.trainer': 'رقم الهاتف',
            'registration.field.email': 'البريد الإلكتروني',
            'registration.field.email.placeholder': 'name@example.com',
            'registration.field.city': 'المدينة أو المنطقة',
            'registration.field.city.placeholder': 'القاهرة، الجيزة...',
            'registration.optional': 'اختياري',
            'registration.step.2.title': 'اختر باقة Logic Fit',
            'registration.step.2.description.gym': 'الباقات المعروضة يتم تحميلها مباشرة من إعدادات المنصة.',
            'registration.step.2.description.trainer': 'الباقات المتاحة للمدربين يتم تحميلها من إعدادات المنصة.',
            'registration.loading.plans': 'جاري تحميل الباقات...',
            'registration.plans.empty': 'لا توجد باقات متاحة حاليًا. حاول لاحقًا.',
            'registration.plan.descriptionFallback': 'باقة مرنة لإدارة وتشغيل الجيم.',
            'registration.plan.memberLimit.unlimited': 'أعضاء بدون حد معلن',
            'registration.plan.memberLimit.upTo': 'حتى {{count}} عضو نشط',
            'registration.step.3.title': 'اختر مدة الاشتراك',
            'registration.step.3.description.gym': 'اختر المدة المتاحة داخل الباقة التي حددتها.',
            'registration.step.3.description.trainer': 'اختر المدة المتاحة داخل الباقة التي حددتها.',
            'registration.term.months': '{{count}} شهر',
            'registration.term.monthly': 'شهري',
            'registration.term.quarterly': '3 أشهر',
            'registration.term.semiannual': '6 أشهر',
            'registration.term.annual': 'سنوي',
            'registration.discount': 'خصم',
            'registration.terms.empty': 'اختر باقة أولًا لعرض المدد المتاحة.',
            'registration.step.4.title': 'طريقة الدفع',
            'registration.step.4.description.gym': 'حوّل المبلغ إلى وسيلة الدفع الخاصة بـLogic Fit ثم احتفظ بالإثبات.',
            'registration.step.4.description.trainer': 'حوّل المبلغ إلى وسيلة الدفع المختارة واحتفظ بالإثبات.',
            'registration.payment.steps.ariaLabel': 'خطوات الدفع',
            'registration.payment.steps.transfer': 'حوّل المبلغ إلى بيانات وسيلة الدفع المختارة.',
            'registration.payment.steps.proof': 'احتفظ بإثبات التحويل وارفعه في الخطوة التالية.',
            'registration.payment.steps.track': 'تابع رقم الطلب حتى يكتمل التحقق والمراجعة.',
            'registration.payment.recipient': 'المستلم',
            'registration.payment.copyAccount': 'نسخ رقم الحساب',
            'registration.payment.empty': 'لم تُجهّز وسائل دفع Logic Fit بعد. لا يمكن إرسال طلب التسجيل قبل تفعيل وسيلة دفع من لوحة إدارة المنصة.',
            'registration.price.amountDue': 'المبلغ المطلوب حسب إعدادات المنصة',
            'registration.price.discount': 'الخصم',
            'registration.step.5.title': 'ارفع إثبات الدفع',
            'registration.step.5.description.gym': 'أي صورة مدعومة أو ملف PDF بحجم أقصى 4 ميجابايت.',
            'registration.step.5.description.trainer': 'أي صورة أو ملف PDF بحجم أقصى 4 ميجابايت.',
            'registration.upload.choose': 'اختر ملف إثبات الدفع',
            'registration.upload.helper': 'اضغط للاختيار أو اسحب الملف هنا',
            'registration.upload.privacy.gym': 'سيتم حفظ الإثبات في تخزين خاص ولا يظهر إلا لفريق المراجعة المصرح له.',
            'registration.upload.privacy.trainer': 'يحفظ الإثبات في تخزين خاص ولا يظهر إلا لفريق المراجعة.',
            'registration.file.remove': 'إزالة الملف',
            'registration.step.6.title': 'راجع طلبك قبل الإرسال',
            'registration.step.6.description': 'تأكد من صحة البيانات؛ سيتم تثبيت السعر من إعدادات المنصة عند إنشاء الطلب.',
            'registration.review.gymName': 'اسم الجيم',
            'registration.review.trainerName': 'اسم المدرب أو العلامة',
            'registration.review.owner': 'المسؤول',
            'registration.review.whatsapp': 'WhatsApp',
            'registration.review.plan': 'الباقة',
            'registration.review.term': 'المدة',
            'registration.review.paymentMethod': 'وسيلة الدفع',
            'registration.review.paymentProof': 'إثبات الدفع',
            'registration.review.total': 'الإجمالي',
            'registration.notes.label': 'ملاحظة إضافية',
            'registration.notes.placeholder': 'أي تفاصيل تساعد فريق Logic Fit في مراجعة طلبك',
            'registration.success.kicker': 'تم استلام طلبك',
            'registration.success.title': 'طلبك الآن قيد المراجعة',
            'registration.success.description.gym': 'سيتم مراجعة الدفع، وبعد الاعتماد ستصلك رسالة عبر WhatsApp تحتوي على تفاصيل تفعيل حساب الجيم وبيانات الدخول.',
            'registration.success.description.trainer': 'سيتم مراجعة الدفع، وبعد الاعتماد تصلك تفاصيل تفعيل حسابك.',
            'registration.success.reference': 'رقم الطلب',
            'registration.success.return': 'العودة إلى Logic Fit',
            'registration.confirmation.amount': 'المبلغ المسجل',
            'registration.confirmation.paymentMethod': 'وسيلة الدفع',
            'registration.confirmation.status': 'حالة الطلب',
            'registration.confirmation.refresh': 'تحديث الحالة',
            'registration.confirmation.received': 'تم استلام إثبات التحويل. لا يتم تفعيل الحساب إلا بعد مراجعة فريق Logic Fit واعتماد الطلب.',
            'registration.status.pending': 'قيد المراجعة',
            'registration.status.approved': 'تم اعتماد الطلب',
            'registration.status.rejected': 'مرفوض',
            'registration.status.cancelled': 'ملغي',
            'registration.status.unavailable': 'غير متاح حاليًا',
            'registration.status.loading': 'جارٍ تحديث الحالة…',
            'registration.status.refreshError': 'تعذر تحديث الحالة. حاول مرة أخرى.',
            'registration.actions.back': 'رجوع',
            'registration.actions.next': 'التالي',
            'registration.actions.submit': 'إرسال طلب الاشتراك',
            'registration.actions.hint.editable': 'يمكنك الرجوع لتعديل أي اختيار.',
            'registration.actions.hint.review.gym': 'لن يتم إنشاء أي حساب قبل مراجعة الطلب.',
            'registration.actions.hint.review.trainer': 'لن يتم إنشاء الحساب قبل مراجعة الطلب واعتماده.',
            'registration.actions.loading': 'جاري المتابعة...',
            'registration.actions.submitLoading': 'جاري إرسال الطلب...',
            'registration.actions.submitSuccess': 'تم إرسال الطلب',
            'registration.stageLabel': 'الخطوة {{step}} من 06',
            'registration.actions.submitShort': 'إرسال طلب الاشتراك',
            'registration.validation.required': 'أكمل الحقول المطلوبة للمتابعة.',
            'registration.validation.email': 'أدخل بريدًا إلكترونيًا صالحًا.',
            'registration.validation.plan': 'اختر باقة للمتابعة.',
            'registration.validation.term': 'اختر مدة الاشتراك للمتابعة.',
            'registration.validation.paymentMethod': 'اختر وسيلة الدفع للمتابعة.',
            'registration.validation.paymentMethodNotConfigured': 'لا توجد وسيلة دفع مفعلة لـLogic Fit حاليًا. يجب على Platform Admin تهيئة وسيلة دفع قبل متابعة التسجيل.',
            'registration.validation.paymentProof': 'ارفع إثبات الدفع أولًا.',
            'registration.validation.paymentProofSize': 'حجم إثبات الدفع يجب ألا يتجاوز 4 ميجابايت.',
            'registration.validation.requestIdMissing': 'لم يتم إنشاء رمز متابعة آمن للطلب.',
            'registration.error.generic': 'تعذر تنفيذ الطلب. حاول مرة أخرى.',
            'registration.error.network': 'تعذر الاتصال بخدمة التسجيل حاليًا. حاول مرة أخرى بعد قليل.',
            'registration.error.rateLimited': 'تم تجاوز عدد المحاولات المسموح به. انتظر قليلًا ثم حاول مرة أخرى.',
            'registration.error.catalogInvalid': 'تعذر تحميل خيارات التسجيل حاليًا. أعد المحاولة بعد قليل.',
            'registration.error.catalogUnavailable': 'التسجيل العام غير مهيأ حاليًا. تواصل مع Logic Fit أو أعد المحاولة لاحقًا.',
            'registration.error.planUnavailable': 'الباقة المختارة لم تعد متاحة. أعد تحميل الخيارات واختر باقة أخرى.',
            'registration.error.termUnavailable': 'مدة الاشتراك المختارة لم تعد متاحة. أعد تحميل الخيارات واختر مدة أخرى.',
            'registration.error.paymentMethodUnavailable': 'وسيلة الدفع المختارة لم تعد متاحة. أعد تحميل الخيارات واختر وسيلة أخرى.',
            'registration.error.storageNotConfigured': 'تعذر رفع إثبات الدفع لأن التخزين الخاص غير مهيأ حاليًا.',
            'registration.error.storageVerificationUnavailable': 'تعذر التحقق من إثبات الدفع حاليًا. حاول مرة أخرى.',
            'registration.error.proofUnavailable': 'تعذر الوصول إلى إثبات الدفع. أعد رفع الملف وحاول مرة أخرى.',
            'registration.error.proofIntegrity': 'تعذر التحقق من سلامة إثبات الدفع. أعد رفع الملف الأصلي.',
            'registration.error.requestExists': 'يوجد طلب تسجيل مماثل قيد المراجعة بالفعل.',
            'registration.error.requestLocked': 'تمت مراجعة هذا الطلب بالفعل. أعد تحميل الصفحة لمعرفة حالته.',
            'registration.error.catalogLoad': 'تعذر تحميل الباقات حاليًا. أعد تحميل الصفحة وحاول مرة أخرى.',
            'registration.error.requestSubmit': 'تعذر إرسال الطلب. تحقق من التخزين أو الملف وحاول مرة أخرى.',
            'registration.payment.copySuccess': 'تم نسخ رقم الحساب.',
            'registration.payment.copyFailure': 'تعذر النسخ تلقائيًا. يمكنك تحديد رقم الحساب ونسخه يدويًا.',
            'registration.toast.success': 'تم استلام طلبك بنجاح.',
            'registration.toast.copied': 'تم نسخ رقم الحساب.',
            'registration.toast.copyFailed': 'تعذر النسخ تلقائيًا. يمكنك تحديد رقم الحساب ونسخه يدويًا.',
            'registration.upload.sizeUnit.kb': 'كيلوبايت',
            'registration.upload.sizeUnit.mb': 'ميجابايت',
            'registration.phone.help': 'أدخل الرقم بدون مفتاح الدولة.',
            'registration.phone.required': 'رقم الهاتف مطلوب.',
            'registration.phone.characters': 'استخدم أرقامًا فقط في حقل الرقم، ويمكن استخدام تنسيق الرقم عند اللصق.',
            'registration.phone.localFormat': 'اكتب رقم المحمول المصري محليًا بدون +20 أو مفتاح دولة.',
            'registration.phone.length': 'أدخل رقم المحمول المصري المكون من 11 رقمًا.',
            'registration.phone.tooLong': 'الرقم أطول من الحد الأقصى المسموح ({{count}} رقمًا كحد أقصى).',
            'registration.phone.format': 'أدخل رقم محمول مصري صحيح يبدأ بـ 010 أو 011 أو 012 أو 015.',
            'registration.phone.catalog': 'قواعد الهاتف غير جاهزة بعد. حاول مرة أخرى.',
            'registration.phone.countrySearch': 'ابحث باسم الدولة أو مفتاح الاتصال',
            'branchesScreen.header.kicker': 'الفروع والأقسام',
            'branchesScreen.header.title': 'إدارة فروع الجيم',
            'branchesScreen.header.description': 'أضف الفروع وحدد بيانات التشغيل داخل حساب الجيم.',
            'branchesScreen.summary.label': 'ملخص الفروع',
            'branchesScreen.summary.active': 'فروع نشطة',
            'branchesScreen.summary.limit': 'حد الباقة',
            'branchesScreen.actions.addBranch': 'إضافة فرع',
            'branchesScreen.actions.refresh': 'تحديث',
            'branchesScreen.actions.close': 'إغلاق',
            'branchesScreen.actions.cancel': 'إلغاء',
            'branchesScreen.actions.submitAddBranch': 'إضافة الفرع',
            'branchesScreen.actions.archive': 'أرشفة الفرع',
            'branchesScreen.actions.archiveNamed': 'أرشفة الفرع {{name}}',
            'branchesScreen.actions.enableBar': 'تفعيل البار',
            'branchesScreen.actions.disableBar': 'إيقاف البار',
            'branchesScreen.list.kicker': 'دليل الفروع',
            'branchesScreen.list.title': 'الفروع الحالية',
            'branchesScreen.list.description': 'الأرشفة تحفظ السجل ولا تحذف البيانات التشغيلية.',
            'branchesScreen.loading': 'جارٍ تحميل الفروع…',
            'branchesScreen.empty': 'لا توجد فروع نشطة.',
            'branchesScreen.dialog.kicker': 'فرع جديد',
            'branchesScreen.dialog.title': 'إضافة فرع',
            'branchesScreen.dialog.description': 'سيتم حفظه كفرع تابع لنفس الجيم.',
            'branchesScreen.fields.code': 'كود الفرع',
            'branchesScreen.fields.name': 'اسم الفرع',
            'branchesScreen.fields.namePlaceholder': 'فرع مدينة نصر',
            'branchesScreen.fields.address': 'العنوان',
            'branchesScreen.fields.phone': 'الهاتف',
            'branchesScreen.fields.enableStore': 'تفعيل المتجر',
            'branchesScreen.fields.enableBarAndPos': 'تفعيل البار وإنشاء موقع البيع',
            'branchesScreen.section.type.men': 'رجال',
            'branchesScreen.section.type.women': 'سيدات',
            'branchesScreen.section.type.mixed': 'مختلط',
            'branchesScreen.section.type.unknown': 'قسم',
            'branchesScreen.context.section': 'القسم',
            'branchesScreen.context.branch': 'الفرع',
            'branchesScreen.context.currentSection': 'القسم الحالي: {{name}}',
            'branchesScreen.context.currentBranch': 'الفرع الحالي: {{name}}',
            'branchesScreen.context.sectionTitle': 'القسم: {{name}}',
            'branchesScreen.context.branchTitle': 'الفرع: {{name}}',
            'branchesScreen.context.sectionCurrent': 'القسم الحالي',
            'branchesScreen.context.branchCurrent': 'الفرع الحالي',
            'branchesScreen.context.allBranches': 'كل الفروع',
            'branchesScreen.context.allSections': 'كل الأقسام',
            'branchesScreen.context.allBranchesView': 'عرض موحد',
            'branchesScreen.status.active': 'نشط',
            'branchesScreen.status.inactive': 'غير نشط',
            'branchesScreen.status.archived': 'مؤرشف',
            'branchesScreen.status.enabled': 'مفعل',
            'branchesScreen.status.disabled': 'غير مفعل',
            'branchesScreen.branch.noAddress': 'بدون عنوان',
            'branchesScreen.branch.main': 'الفرع الرئيسي',
            'branchesScreen.branch.operational': 'فرع تشغيلي',
            'branchesScreen.commerce.settings': 'إعدادات التجارة',
            'branchesScreen.commerce.store': 'المتجر',
            'branchesScreen.commerce.bar': 'البار',
            'branchesScreen.errors.updateBar': 'تعذر تحديث إعدادات البار.',
            'branchesScreen.errors.load': 'تعذر تحميل سياق الفروع.',
            'branchesScreen.errors.create': 'تعذر إضافة الفرع.',
            'branchesScreen.errors.archive': 'تعذر أرشفة الفرع.',
            'branchesScreen.messages.created': 'تمت إضافة الفرع بنجاح.',
            'branchesScreen.confirm.archive': 'سيتم إيقاف العمليات الجديدة مع الاحتفاظ بالسجل. هل تريد المتابعة؟',
            'nav.aria': 'أقسام الإدارة',
            'nav.mobile.heading': 'أقسام الجيم',
            'nav.mobile.open': 'فتح القائمة',
            'nav.mobile.close': 'إغلاق القائمة',
            'nav.group.workspace': 'مساحة العمل',
            'nav.group.location': 'الفروع والأقسام',
            'nav.group.operations': 'التشغيل',
            'nav.group.management': 'الإدارة',
            'nav.dashboard': 'لوحة التحكم',
            'nav.members': 'المشتركون',
            'nav.attendance': 'الحضور والانصراف',
            'nav.reports': 'التقارير',
            'nav.branches': 'الفروع والأقسام',
            'nav.trainees': 'متدرب خارجي',
            'nav.library': 'المكتبة',
            'nav.store': 'المتجر',
            'nav.intelligence': 'الذكاء التشغيلي',
            'intelligenceScreen.header.title': 'مركز القرار الذكي',
            'intelligenceScreen.header.description': 'ابدأ بالأهم: التدخلات العاجلة، ثم الاحتفاظ بالمشتركين، ثم تنفيذ الخطط.',
            'intelligenceScreen.header.engine': 'ذكاء هجين · مراجعة بشرية',
            'intelligenceScreen.header.refresh': 'تحديث التحليل',
            'intelligenceScreen.loading.analysis': 'جارٍ تجهيز التحليل…',
            'intelligenceScreen.loading.priorities': 'جارٍ التحليل…',
            'intelligenceScreen.loading.cases': 'جارٍ تحميل الحالات…',
            'intelligenceScreen.stats.highRisk': 'خطر توقف مرتفع',
            'intelligenceScreen.stats.highRisk.caption': 'أولوية تواصل اليوم',
            'intelligenceScreen.stats.expiring': 'قريبة الانتهاء',
            'intelligenceScreen.stats.expiring.caption': 'تحتاج متابعة قريبة',
            'intelligenceScreen.stats.activeMemberships': 'اشتراكات نشطة',
            'intelligenceScreen.stats.activeMemberships.caption': 'تحتاج متابعة مستمرة',
            'intelligenceScreen.stats.workouts': 'برامج تدريب نشطة',
            'intelligenceScreen.stats.workouts.caption': 'خطة قيد التنفيذ',
            'intelligenceScreen.stats.diet': 'خطط تغذية نشطة',
            'intelligenceScreen.stats.diet.caption': 'خطة قابلة للقياس',
            'intelligenceScreen.stats.members': 'الأعضاء',
            'intelligenceScreen.stats.members.caption': 'إجمالي الملفات',
            'intelligenceScreen.priority.now': 'الأولوية 01 · الآن',
            'intelligenceScreen.priority.title': 'ماذا يحتاج انتباهك الآن؟',
            'intelligenceScreen.priority.description': 'ابدأ بهذه الإشارات قبل الانتقال إلى التحليل أو إنشاء الخطط.',
            'intelligenceScreen.priority.empty': 'لا توجد إشارات تحتاج تدخلاً الآن.',
            'intelligenceScreen.priority.retention': 'الأولوية 02 · الاحتفاظ',
            'intelligenceScreen.churn.title': 'الأعضاء المعرضون للتوقف',
            'intelligenceScreen.churn.description': 'النتيجة مؤشر تشغيلي للمساعدة في ترتيب المتابعة، وليست حكمًا نهائيًا على العضو.',
            'intelligenceScreen.churn.legend.high': 'مرتفع',
            'intelligenceScreen.churn.legend.medium': 'متوسط',
            'intelligenceScreen.churn.legend.low': 'منخفض',
            'intelligenceScreen.churn.header.member': 'المشترك',
            'intelligenceScreen.churn.header.risk': 'المؤشر',
            'intelligenceScreen.churn.header.lastVisit': 'آخر حضور',
            'intelligenceScreen.churn.header.expiry': 'الانتهاء',
            'intelligenceScreen.churn.header.reason': 'السبب الأبرز',
            'intelligenceScreen.churn.header.action': 'الإجراء',
            'intelligenceScreen.churn.noPhone': 'بدون هاتف',
            'intelligenceScreen.churn.noAttendance': 'لا يوجد حضور',
            'intelligenceScreen.churn.daysAgo': 'منذ {{count}} يوم',
            'intelligenceScreen.churn.expired': 'منتهية',
            'intelligenceScreen.churn.days': '{{count}} يوم',
            'intelligenceScreen.churn.reasonFallback': 'مؤشر يحتاج مراجعة',
            'intelligenceScreen.churn.openMember': 'فتح ملف',
            'intelligenceScreen.churn.empty': 'لا توجد عضويات نشطة في نطاق التحليل.',
            'intelligenceScreen.query.priority': 'الأولوية 03 · اسأل',
            'intelligenceScreen.query.title': 'مساعد المدير الذكي',
            'intelligenceScreen.query.description': 'اسأل النظام عن الاشتراكات، الحضور، أو حالة التدريب والتغذية.',
            'intelligenceScreen.query.label': 'اكتب سؤالك بلغة طبيعية',
            'intelligenceScreen.query.placeholder': 'مثال: اعرض الأعضاء المعرضين للتوقف',
            'intelligenceScreen.query.submit': 'تحليل السؤال',
            'intelligenceScreen.query.answer': 'تحليل النظام',
            'intelligenceScreen.plans.priority': 'الأولوية 04 · نفّذ',
            'intelligenceScreen.plans.title': 'إنشاء خطة ثم تعديلها بالتعليمات',
            'intelligenceScreen.plans.description': 'اكتب مثلًا: «أضف تمرين ضغط صدر»، «بدّل الأرز بالبطاطس»، أو «اجعلها 5 وجبات».',
            'intelligenceScreen.plans.type.label': 'نوع الخطة',
            'intelligenceScreen.plans.type.workout': 'خطة تدريب',
            'intelligenceScreen.plans.type.diet': 'خطة تغذية',
            'intelligenceScreen.plans.client': 'العميل',
            'intelligenceScreen.plans.client.loading': 'جارٍ تحميل العملاء…',
            'intelligenceScreen.plans.client.choose': 'اختر العميل',
            'intelligenceScreen.plans.client.fallback': 'عميل',
            'intelligenceScreen.plans.goal': 'الهدف',
            'intelligenceScreen.plans.goal.muscle': 'بناء العضلات',
            'intelligenceScreen.plans.goal.strength': 'زيادة القوة',
            'intelligenceScreen.plans.goal.fatLoss': 'خسارة الدهون',
            'intelligenceScreen.plans.goal.maintain': 'تثبيت الوزن',
            'intelligenceScreen.plans.goal.weightGain': 'زيادة الكتلة',
            'intelligenceScreen.plans.goal.fitness': 'لياقة عامة',
            'intelligenceScreen.plans.level': 'المستوى',
            'intelligenceScreen.plans.level.beginner': 'مبتدئ',
            'intelligenceScreen.plans.level.intermediate': 'متوسط',
            'intelligenceScreen.plans.level.advanced': 'متقدم',
            'intelligenceScreen.plans.days': 'أيام أسبوعيًا',
            'intelligenceScreen.plans.duration': 'المدة بالأسابيع',
            'intelligenceScreen.plans.limitations': 'تمارين مستبعدة أو قيود',
            'intelligenceScreen.plans.limitations.placeholder': 'مثال: بدون ركبة أو بار',
            'intelligenceScreen.plans.meals': 'عدد الوجبات',
            'intelligenceScreen.plans.calories': 'السعرات المستهدفة',
            'intelligenceScreen.plans.calories.placeholder': 'اختياري',
            'intelligenceScreen.plans.allergies': 'حساسية أو أطعمة ممنوعة',
            'intelligenceScreen.plans.allergies.placeholder': 'مثال: لبن، فول سوداني',
            'intelligenceScreen.plans.activity': 'النشاط',
            'intelligenceScreen.plans.activity.moderate': 'متوسط',
            'intelligenceScreen.plans.activity.sedentary': 'قليل جدًا',
            'intelligenceScreen.plans.activity.light': 'خفيف',
            'intelligenceScreen.plans.activity.high': 'مرتفع',
            'intelligenceScreen.plans.generate': 'إنشاء اقتراح ذكي',
            'intelligenceScreen.plan.empty.title': 'اختر عميلًا وابدأ الاقتراح',
            'intelligenceScreen.plan.empty.description': 'النتيجة ستظهر كمسودة، ويمكن تعديلها قبل الحفظ.',
            'intelligenceScreen.plan.draft': 'مسودة قابلة للمراجعة',
            'intelligenceScreen.plan.status.draft': 'مسودة',
            'intelligenceScreen.plan.suggestion': 'اقتراح ذكي',
            'intelligenceScreen.plan.days': 'أيام',
            'intelligenceScreen.plan.exercises': 'تمارين',
            'intelligenceScreen.plan.weeks': 'أسابيع',
            'intelligenceScreen.plan.level': 'مستوى',
            'intelligenceScreen.plan.meals': 'وجبات',
            'intelligenceScreen.plan.foods': 'أطعمة',
            'intelligenceScreen.plan.calories': 'سعر',
            'intelligenceScreen.plan.protein': 'بروتين',
            'intelligenceScreen.plan.applied': 'تم تطبيق التعديل',
            'intelligenceScreen.plan.review': 'مراجعة ضرورية قبل الاعتماد',
            'intelligenceScreen.plan.refine.label': 'اكتب تعديلك على المسودة',
            'intelligenceScreen.plan.refine.placeholder': 'مثال: احذف تمرين السكوات وأضف جهاز الرجلين',
            'intelligenceScreen.plan.refine.submit': 'إعادة إنشاء بالتعليمات',
            'intelligenceScreen.plan.save': 'حفظ كمسودة في النظام',
            'intelligenceScreen.plan.manual': 'فتح في المحرر اليدوي',
            'intelligenceScreen.plan.humanReview': 'لن يتم نشر الخطة كخطة معتمدة تلقائيًا؛ راجعها واحفظها أو عدّلها يدويًا.',
            'intelligenceScreen.message.loadError': 'تعذر تحميل مركز الذكاء.',
            'intelligenceScreen.message.permissionRead': 'لا تملك صلاحية عرض مركز الذكاء.',
            'intelligenceScreen.message.permissionAssistant': 'لا تملك صلاحية استخدام المساعد الذكي.',
            'intelligenceScreen.message.questionRequired': 'اكتب سؤالًا للمساعد أولًا.',
            'intelligenceScreen.message.queryError': 'تعذر تحليل السؤال.',
            'intelligenceScreen.message.permissionGenerate': 'لا تملك صلاحية إنشاء اقتراحات الذكاء.',
            'intelligenceScreen.message.clientRequired': 'اختر العميل قبل إنشاء الاقتراح.',
            'intelligenceScreen.message.planCreated': 'تم إنشاء المسودة الذكية. راجعها قبل اعتمادها.',
            'intelligenceScreen.message.planError': 'تعذر إنشاء الاقتراح.',
            'intelligenceScreen.message.permissionRefine': 'لا تملك صلاحية تعديل اقتراحات الذكاء.',
            'intelligenceScreen.message.refineRequired': 'اكتب التعديل المطلوب على المسودة.',
            'intelligenceScreen.message.refined': 'تمت إعادة بناء المسودة حسب تعليماتك.',
            'intelligenceScreen.message.refineError': 'تعذر تطبيق التعديل.',
            'intelligenceScreen.message.permissionSave': 'لا تملك صلاحية حفظ خطة التدريب أو التغذية.',
            'intelligenceScreen.message.saved': 'تم حفظ المسودة داخل التدريب والتغذية. يمكنك فتحها وتعديلها يدويًا.',
            'intelligenceScreen.message.saveError': 'تعذر حفظ المسودة.',
            'intelligenceScreen.message.permissionManual': 'لا تملك صلاحية فتح محرر التدريب والتغذية.',
            'intelligenceScreen.message.manualError': 'تعذر فتح المحرر اليدوي.',
            'intelligenceScreen.message.refreshed': 'تم تحديث التحليل الذكي.',
            'nav.feedback': 'تقييمات المشتركين',
            'nav.management': 'الأسعار والعضويات',
            'nav.branding': 'تخصيص الهوية',
            'nav.member-payment-methods': 'وسائل دفع الأعضاء',
            'nav.permissions': 'صلاحيات الحسابات',
            'nav.expenses': 'المصروفات',
            'nav.member-subscription-requests': 'طلبات اشتراك الأعضاء',
            'nav.portal-analytics': 'إحصائيات البوابة',
            'nav.saas-billing': 'اشتراك المنصة',
            'saasBilling.page.kicker': 'اشتراك المنصة',
            'saasBilling.page.title': 'اشتراك الجيم في المنصة',
            'saasBilling.page.description': 'أدر باقة منصتك، وارفع إثبات الدفع، وتابع حالة الطلب من مكان واحد.',
            'saasBilling.navigation.aria': 'مسار الاشتراك',
            'saasBilling.navigation.back': 'العودة',
            'saasBilling.navigation.platform': 'المنصة',
            'saasBilling.navigation.current': 'اشتراكات الجيم',
            'saasBilling.summary.gym': 'الجيم',
            'saasBilling.summary.loading': 'جارٍ تحميل بيانات الاشتراك…',
            'saasBilling.summary.gymNotFound': 'تعذر العثور على بيانات الجيم.',
            'saasBilling.summary.status': 'حالة الاشتراك',
            'saasBilling.summary.noSubscription': 'بدون اشتراك',
            'saasBilling.summary.expiryUnknown': 'لا يوجد تاريخ انتهاء محدد',
            'saasBilling.summary.daysRemaining': '{{count}} يوم متبقٍ',
            'saasBilling.summary.currentPlan': 'الباقة الحالية',
            'saasBilling.summary.noPlan': 'بدون باقة',
            'saasBilling.summary.yearlyCycle': 'دورة سنوية',
            'saasBilling.summary.monthlyCycle': 'دورة شهرية',
            'saasBilling.summary.subscriptionDetails': 'بيانات الاشتراك',
            'saasBilling.summary.startDate': 'تاريخ الاشتراك',
            'saasBilling.summary.notSpecified': 'غير محدد',
            'saasBilling.summary.until': 'حتى {{date}}',
            'saasBilling.summary.openSubscription': 'اشتراك مفتوح',
            'saasBilling.summary.memberUsage': 'ملفات الأعضاء المستخدمة في الباقة',
            'saasBilling.summary.limitMembers': 'من حد {{count}} عضو',
            'saasBilling.common.unlimited': 'غير محدود',
            'saasBilling.feature.dashboard': 'لوحة التحكم',
            'saasBilling.feature.members': 'إدارة المشتركين',
            'saasBilling.feature.attendance': 'الحضور والانصراف',
            'saasBilling.feature.coaching': 'التدريب',
            'saasBilling.feature.nutrition': 'التغذية',
            'saasBilling.feature.ai': 'الذكاء الاصطناعي',
            'saasBilling.feature.library': 'المكتبة',
            'saasBilling.feature.pricing': 'أسعار العضويات',
            'saasBilling.feature.payments': 'المدفوعات',
            'saasBilling.feature.finance': 'التقارير المالية',
            'saasBilling.feature.day_passes': 'دخول اليوم الواحد',
            'saasBilling.feature.reports': 'التقارير',
            'saasBilling.feature.store': 'المتجر',
            'saasBilling.feature.inventory': 'المخزون',
            'saasBilling.feature.branches': 'الفروع',
            'saasBilling.feature.bar': 'البار والوصفات',
            'saasBilling.feature.portal': 'البوابة',
            'saasBilling.feature.branding': 'هوية الجيم',
            'saasBilling.feature.team': 'الفريق والصلاحيات',
            'saasBilling.feature.backup': 'النسخ الاحتياطي',
            'saasBilling.feature.audit': 'سجل النشاط',
            'saasBilling.feature.clients': 'إدارة العملاء',
            'saasBilling.feature.assessments': 'القياسات والتقييمات',
            'saasBilling.feature.progress': 'متابعة التقدم',
            'saasBilling.feature.goals': 'الأهداف',
            'saasBilling.feature.sessions': 'الجلسات',
            'saasBilling.feature.packages': 'الباقات',
            'saasBilling.feature.notifications': 'الإشعارات',
            'saasBilling.feature.tasks': 'مركز الإجراءات',
            'saasBilling.feature.templates': 'القوالب',
            'saasBilling.feature.prioritySupport': 'دعم بأولوية',
            'saasBilling.current.title': 'الاشتراك الحالي',
            'saasBilling.current.noActivePlan': 'لا توجد باقة مفعّلة',
            'saasBilling.current.choosePlanHint': 'اختر باقة من القائمة الحالية لإرسال الطلب.',
            'saasBilling.pending.kicker': 'حالة الطلب',
            'saasBilling.pending.title': 'طلب الاشتراك قيد المراجعة',
            'saasBilling.pending.description': 'تم إرسال طلبك وسيتم إشعارك بعد مراجعته.',
            'saasBilling.pending.month': 'شهر',
            'saasBilling.pending.months': 'أشهر',
            'saasBilling.pending.sentAt': 'تاريخ الإرسال: {{date}}',
            'saasBilling.pending.proofAttached': 'مرفق',
            'saasBilling.pending.proofMissing': 'غير مرفق',
            'saasBilling.plans.kicker': 'الباقات',
            'saasBilling.plans.title': 'الباقات المتاحة',
            'saasBilling.plans.description': 'قارن باقات المنصة واختر المستوى المناسب لتشغيل جيمك.',
            'saasBilling.plans.compare': 'مقارنة الباقات',
            'saasBilling.plans.loading': 'جارٍ تحميل الباقات…',
            'saasBilling.plans.empty': 'لا توجد باقات مفعّلة حاليًا. راجع مدير المنصة.',
            'saasBilling.plans.term': 'مدة الاشتراك',
            'saasBilling.plans.termFor': 'مدة الاشتراك لباقة {{name}}',
            'saasBilling.plans.termUnavailable': 'مدة غير متاحة',
            'saasBilling.plans.monthly': 'شهري',
            'saasBilling.plans.quarterly': '3 شهور',
            'saasBilling.plans.semiannual': '6 شهور',
            'saasBilling.plans.annual': 'سنوي',
            'saasBilling.plans.duration': '{{count}} شهر',
            'saasBilling.plans.members': 'الأعضاء',
            'saasBilling.plans.clients': 'العملاء',
            'saasBilling.plans.users': 'المستخدمون',
            'saasBilling.plans.aiMonthly': 'AI شهريًا',
            'saasBilling.plans.branches': 'الفروع',
            'saasBilling.plans.storage': 'التخزين',
            'saasBilling.plans.features': 'مميزات الباقة',
            'saasBilling.plans.featuresEmpty': 'لا توجد مميزات إضافية مسجلة لهذه الباقة.',
            'saasBilling.plans.upgrade': 'ترقية',
            'saasBilling.plans.choosePlaceholder': 'اختر الباقة المطلوبة',
            'saasBilling.plans.current': 'الباقة الحالية',
            'saasBilling.plans.select': 'اختيار الباقة',
            'saasBilling.review.kicker': 'مراجعة يدوية',
            'saasBilling.review.title': 'إرسال طلب اشتراك',
            'saasBilling.review.description': 'قم بملء البيانات التالية ثم ارفع إثبات الدفع للمراجعة.',
            'saasBilling.review.secureUpload': 'رفع آمن',
            'saasBilling.form.plan': 'الباقة المطلوبة *',
            'saasBilling.form.term': 'مدة الاشتراك المطلوبة *',
            'saasBilling.form.notes': 'ملاحظات إضافية',
            'saasBilling.form.optional': 'اختياري',
            'saasBilling.form.notesPlaceholder': 'اكتب أي تفاصيل تساعد المراجعة',
            'saasBilling.form.proof': 'إثبات الدفع',
            'saasBilling.form.proofHint': 'أي صورة أو PDF حتى 4MB',
            'saasBilling.form.uploadProof': 'ارفع إثبات الدفع',
            'saasBilling.form.dropOrChoose': 'اسحب الملف هنا أو اختره من جهازك',
            'saasBilling.form.noFile': 'لم يتم اختيار ملف بعد',
            'saasBilling.form.chooseFile': 'اختيار ملف',
            'saasBilling.form.allowedTypes': 'PNG أو JPG أو PDF · الحد الأقصى 4MB',
            'saasBilling.form.submit': 'إرسال الطلب للمراجعة',
            'saasBilling.form.submitLoading': 'جارٍ إرسال الطلب…',
            'saasBilling.form.close': 'إغلاق نموذج طلب الاشتراك',
            'saasBilling.form.closeButton': 'إغلاق',
            'saasBilling.form.reviewPlatform': 'مراجعة المنصة',
            'saasBilling.form.renewTitle': 'طلب تجديد الاشتراك',
            'saasBilling.form.renewDescription': 'اختر الباقة والمدة، ثم أرفق إثبات الدفع لإرسال الطلب للمراجعة.',
            'saasBilling.form.totalPlatform': 'الإجمالي حسب إعدادات المنصة',
            'saasBilling.form.choosePlanTerm': 'اختر الباقة والمدة',
            'saasBilling.form.manageTitle': 'إدارة اشتراك الجيم',
            'saasBilling.form.managePrompt': 'هل تريد الترقية أو التجديد؟',
            'saasBilling.form.openRequest': 'إرسال طلب اشتراك',
            'saasBilling.summary.total': 'الإجمالي: {{amount}}',
            'saasBilling.requests.kicker': 'سجل الطلبات',
            'saasBilling.requests.title': 'سجل طلبات الاشتراك',
            'saasBilling.requests.description': 'تظهر هنا كل الطلبات وحالتها وإثباتاتها.',
            'saasBilling.requests.loading': 'جارٍ تحميل الطلبات…',
            'saasBilling.requests.empty': 'لم يتم إرسال طلبات اشتراك بعد.',
            'saasBilling.requests.date': 'التاريخ',
            'saasBilling.requests.plan': 'الباقة',
            'saasBilling.requests.duration': 'المدة',
            'saasBilling.requests.amount': 'المبلغ',
            'saasBilling.requests.status': 'الحالة',
            'saasBilling.requests.proof': 'الإثبات',
            'saasBilling.requests.reviewNotes': 'ملاحظات المراجعة',
            'saasBilling.requests.showProof': 'عرض الإثبات',
            'saasBilling.requests.noProof': 'غير مرفق',
            'saasBilling.requests.noNotes': 'لا توجد ملاحظات',
            'saasBilling.requests.paginationAria': 'صفحات طلبات الاشتراك',
            'saasBilling.requests.summary': 'عرض {{shown}} من {{total}} طلب',
            'saasBilling.requests.none': 'لا توجد طلبات',
            'saasBilling.message.choosePlan': 'اختر باقة أولًا.',
            'saasBilling.message.chooseTerm': 'اختر مدة اشتراك متاحة للباقة.',
            'saasBilling.message.uploadProof': 'ارفع إثبات الدفع قبل إرسال الطلب.',
            'saasBilling.message.proofTooLarge': 'حجم إثبات الدفع يجب ألا يتجاوز 4MB.',
            'saasBilling.message.requestSavedProofUnconfirmed': 'تم حفظ الطلب لكن تعذر تأكيد إثبات الدفع. حدّث سجل الطلبات قبل إعادة الإرسال.',
            'saasBilling.message.requestSent': 'تم إرسال طلب الاشتراك بنجاح، والطلب الآن تحت المراجعة.',
            'saasBilling.message.pendingExists': 'لديك طلب اشتراك قيد المراجعة بالفعل.',
            'saasBilling.message.requestFailed': 'تعذر إرسال طلب الاشتراك.',
            'saasBilling.message.loadFailed': 'تعذر تحميل اشتراك المنصة.',
            'saasBilling.proof.popupBlocked': 'اسمح بفتح نافذة معاينة الإثبات ثم حاول مرة أخرى.',
            'saasBilling.proof.invalidType': 'استجابة ملف الإثبات ليست صورة أو PDF صالحًا.',
            'saasBilling.proof.invalidFile': 'تعذر التحقق من ملف إثبات الدفع.',
            'saasBilling.proof.displayFailed': 'تعذر عرض إثبات الدفع.',
            'saasBilling.status.trial': 'فترة تجريبية',
            'saasBilling.status.active': 'نشط',
            'saasBilling.status.expired': 'منتهي',
            'saasBilling.status.suspended': 'موقوف',
            'saasBilling.status.cancelled': 'ملغى',
            'saasBilling.status.pending': 'قيد المراجعة',
            'saasBilling.status.approved': 'مقبول',
            'saasBilling.status.rejected': 'مرفوض',
            'nav.backup-history': 'سجل النسخ',
            'backupHistory.page.kicker': 'حماية البيانات',
            'backupHistory.page.title': 'سجل النسخ الاحتياطية',
            'backupHistory.page.description': 'راجع النسخ اليومية المحفوظة وعمليات التنزيل والفحص والاسترجاع من شاشة مستقلة.',
            'backupHistory.action.refresh': 'تحديث السجل',
            'backupHistory.action.refreshLoading': 'جارٍ تحديث السجل…',
            'backupHistory.tools.title': 'أدوات النسخ والاسترجاع',
            'backupHistory.tools.description': 'أنشئ نسخة {{brand}} بصيغة .json.gz، ثم افحصها واسترجعها بأمان من هذه الشاشة.',
            'backupHistory.tools.create': 'إنشاء نسخة محفوظة',
            'backupHistory.tools.download': 'تحميل لحظي .json.gz',
            'backupHistory.tools.restore': 'استرجاع ملف',
            'backupHistory.loading': 'جارٍ تحميل سجل النسخ…',
            'backupHistory.section.archives': 'النسخ المحفوظة للجيم',
            'backupHistory.section.retention': 'النسخ اليومية تحتفظ بها المنصة {{count}} يومًا',
            'backupHistory.section.audit': 'سجل التدقيق',
            'backupHistory.audit.count': '{{count}} عمليات معروضة',
            'backupHistory.column.file': 'الملف',
            'backupHistory.column.type': 'النوع',
            'backupHistory.column.status': 'الحالة',
            'backupHistory.column.data': 'البيانات',
            'backupHistory.column.size': 'الحجم',
            'backupHistory.column.verifiedAt': 'آخر تحقق',
            'backupHistory.column.actions': 'الإجراءات',
            'backupHistory.column.date': 'التاريخ',
            'backupHistory.column.operation': 'العملية',
            'backupHistory.column.result': 'النتيجة',
            'backupHistory.column.reason': 'السبب',
            'backupHistory.rows.count': '{{count}} صف',
            'backupHistory.action.download': 'تحميل',
            'backupHistory.action.restore': 'استرجاع',
            'backupHistory.action.delete': 'حذف',
            'backupHistory.empty.archives': 'لا توجد نسخ محفوظة لهذا الجيم حتى الآن.',
            'backupHistory.empty.audit': 'لا يوجد سجل عمليات حتى الآن.',
            'backupHistory.empty.operations': 'لا يوجد سجل نسخ حتى الآن.',
            'backupHistory.storage.title': 'التخزين الخاص غير مهيأ',
            'backupHistory.storage.description': 'لن يتم اعتماد أي نسخة محفوظة حتى يربط مدير المنصة مزود تخزين خاصًا. النسخة الفاشلة تظل مسجلة بحالة «فشل» ولا تتحول إلى نسخة موثقة.',
            'backupHistory.status.pending': 'قيد الانتظار',
            'backupHistory.status.running': 'جارٍ التنفيذ',
            'backupHistory.status.uploaded': 'تم الرفع',
            'backupHistory.status.verifying': 'جارٍ التحقق',
            'backupHistory.status.verified': 'تم التحقق',
            'backupHistory.status.failed': 'فشل',
            'backupHistory.status.expired': 'منتهية',
            'backupHistory.status.deleted': 'محذوفة',
            'backupHistory.status.success': 'ناجحة',
            'backupHistory.status.unknown': 'حالة أخرى',
            'backupHistory.type.tenantDaily': 'نسخة يومية',
            'backupHistory.type.tenantManual': 'نسخة يدوية',
            'backupHistory.type.tenantPreRestore': 'نسخة أمان قبل الاسترجاع',
            'backupHistory.type.unknown': 'نوع آخر',
            'backupHistory.event.created': 'إنشاء نسخة',
            'backupHistory.event.verified': 'التحقق من النسخة',
            'backupHistory.event.downloaded': 'تنزيل نسخة',
            'backupHistory.event.deleted': 'حذف نسخة',
            'backupHistory.event.restoreRequested': 'طلب استرجاع',
            'backupHistory.event.restoreStarted': 'بدء الاسترجاع',
            'backupHistory.event.restoreCompleted': 'اكتمال الاسترجاع',
            'backupHistory.event.restoreFailed': 'فشل الاسترجاع',
            'backupHistory.event.unknown': 'عملية نسخ أخرى',
            'backupHistory.storage.unavailable': 'التخزين الخاص للنسخ الاحتياطية غير مهيأ حاليًا',
            'backupHistory.error.load': 'تعذر تحميل سجل النسخ.',
            'backupHistory.error.loadTitle': 'تعذر تحميل سجل النسخ',
            'backupHistory.error.retry': 'حاول مرة أخرى.',
            'backupHistory.confirm.close': 'إغلاق',
            'backupHistory.operation.download': 'تنزيل نسخة',
            'backupHistory.operation.inspect': 'فحص نسخة',
            'backupHistory.operation.restore': 'استرجاع نسخة',
            'shell.branch': 'الفرع',
            'shell.branch.current': 'الفرع الحالي',
            'shell.section': 'القسم',
            'shell.section.current': 'القسم الحالي',
            'shell.context': 'سياق العمل',
            'shell.context.subtitle': 'الفرع والقسم',
            'shell.menu': 'فتح القائمة',
            'shell.addMember': 'إضافة مشترك',
            'shell.pricing': 'الأسعار',
            'shell.refresh': 'تحديث البيانات',
            'shell.theme.dark': 'تفعيل الوضع الداكن',
            'shell.theme.light': 'تفعيل الوضع الفاتح',
            'shell.theme.darkName': 'الوضع الداكن',
            'shell.theme.lightName': 'الوضع الفاتح',
            'shell.fullscreen': 'ملء الشاشة',
            'shell.logout': 'تسجيل الخروج',
            'shell.account': 'حساب المستخدم الحالي',
            'shell.assistant.ask': 'اسأل المساعد',
            'shell.assistant.open': 'فتح المساعد الذكي',
            'dialogs.close.title': 'إغلاق',
            'dialogs.close.aria': 'إغلاق النافذة',
            'attendance.qr.reader.title': 'مسح QR Code',
            'attendance.qr.reader.description': 'وجّه كاميرا الهاتف إلى رمز العضو.',
            'attendance.qr.reader.close': 'إغلاق',
            'attendance.qr.reader.note': 'إذا لم تعمل الكاميرا، أغلق النافذة وسجّل الحضور برقم الهاتف.'
            , 'dashboard.loading': 'جارٍ تجهيز مؤشرات لوحة التحكم…'
            , 'dashboard.aria.actions': 'إجراءات لوحة التحكم'
            , 'dashboard.status.live': 'النظام يعمل الآن'
            , 'dashboard.eyebrow': 'لوحة التشغيل اليومية'
            , 'dashboard.welcome.prefix': 'مرحبًا بك في'
            , 'dashboard.welcome.subtitle': 'إدارة أذكى لجيم أقوى.'
            , 'dashboard.meta.insights': 'مؤشرات واضحة'
            , 'dashboard.meta.secure': 'بياناتك في مساحة آمنة'
            , 'dashboard.quickActions.title': 'اختصارات سريعة'
            , 'dashboard.quickActions.description': 'انتقل مباشرة إلى أدوات التشغيل اليومية.'
            , 'dashboard.action.members': 'عرض المشتركين'
            , 'dashboard.action.printMemberships': 'طباعة الاشتراكات'
            , 'dashboard.action.printPlans': 'طباعة الأسعار'
            , 'dashboard.action.printMembershipsTitle': 'إنشاء ملف PDF للاشتراكات والباقات'
            , 'dashboard.action.printPlansTitle': 'فتح نسخة الطباعة للأسعار والعضويات'
            , 'dashboard.summary.subscription': 'ملخص الاشتراك الحالي'
            , 'dashboard.summary.plan': 'الباقة الحالية'
            , 'dashboard.summary.memberCount': 'عدد الأعضاء'
            , 'dashboard.summary.subscriptionDate': 'تاريخ الاشتراك'
            , 'dashboard.memberships.aria': 'ملخص العضويات والتنبيهات'
            , 'dashboard.memberships.eyebrow': 'حالة العضويات'
            , 'dashboard.memberships.quickSummary': 'ملخص سريع للمشتركين'
            , 'dashboard.memberships.totalSubscriptions': 'إجمالي الاشتراكات'
            , 'dashboard.memberships.monthNetRemaining': 'المتبقي / صافي الشهر'
            , 'dashboard.memberships.pausedCaption': 'متوقفة مؤقتاً'
            , 'dashboard.action.manageExpenses': 'إدارة المصروفات'
            , 'dashboard.memberships.title': 'ملخص العضويات'
            , 'dashboard.memberships.total': 'إجمالي الأعضاء'
            , 'dashboard.memberships.allMembers': 'كل المشتركين'
            , 'dashboard.memberships.active': 'نشطة'
            , 'dashboard.memberships.activeCaption': 'اشتراك ساري'
            , 'dashboard.memberships.expiring': 'قريبة الانتهاء'
            , 'dashboard.memberships.expiringCaption': 'خلال 7 أيام'
            , 'dashboard.memberships.expired': 'منتهية'
            , 'dashboard.memberships.expiredCaption': 'تحتاج متابعة'
            , 'dashboard.memberships.frozen': 'مجمدة الآن'
            , 'dashboard.memberships.frozenCaption': 'متوقفة مؤقتًا'
            , 'dashboard.alerts.eyebrow': 'متابعة اليوم'
            , 'dashboard.alerts.title': 'التنبيهات اليومية'
            , 'dashboard.alerts.description': 'راجع الحالات التي تحتاج إلى إجراء سريع'
            , 'dashboard.alerts.count': '{{count}} تنبيه'
            , 'dashboard.alerts.emptyCount': 'لا توجد تنبيهات'
            , 'dashboard.alerts.aria': 'بحث في التنبيهات اليومية'
            , 'dashboard.alerts.searchPlaceholder': 'ابحث باسم المشترك أو رقم الهاتف'
            , 'dashboard.alerts.loading': 'جاري تحميل التنبيهات…'
            , 'dashboard.alerts.empty': 'لا توجد تنبيهات اليوم.'
            , 'dashboard.alerts.filter': 'تصفية التنبيهات'
            , 'dashboard.alerts.filterShort': 'تصفية'
            , 'dashboard.alerts.pagination': 'تقليب التنبيهات'
            , 'dashboard.alerts.showLess': 'عرض أقل'
            , 'dashboard.alerts.showAll': 'عرض الكل ({{count}})'
            , 'dashboard.alerts.resultCount': '{{visible}} من {{total}}'
            , 'dashboard.alerts.kind.debt': 'عليه مستحقات'
            , 'dashboard.alerts.kind.inactive': 'غياب طويل'
            , 'dashboard.alerts.status.active': 'نشطة'
            , 'dashboard.alerts.status.expiring': 'قريبة الانتهاء'
            , 'dashboard.alerts.status.expired': 'منتهية'
            , 'dashboard.alerts.status.frozen': 'مجمدة'
            , 'dashboard.alerts.status.unknown': 'تنبيه'
            , 'dashboard.alerts.detail.debt': 'متبقي على الحساب {{amount}}'
            , 'dashboard.alerts.detail.neverVisited': 'لم يسجل حضورًا من قبل'
            , 'dashboard.alerts.detail.lastVisit': 'آخر حضور منذ {{count}} يومًا'
            , 'dashboard.alerts.detail.frozenUntil': 'حتى {{date}}'
            , 'dashboard.alerts.detail.expiredAt': 'انتهت في {{date}}'
            , 'dashboard.alerts.detail.expiresAt': 'تنتهي في {{date}}'
            , 'dashboard.alerts.whatsapp.renewal': 'رسالة تجديد'
            , 'dashboard.alerts.whatsapp.manual': 'واتساب يدوي'
            , 'dashboard.alerts.whatsapp.sendRenewal': 'إرسال رسالة التجديد'
            , 'dashboard.alerts.whatsapp.contact': 'تواصل الآن عبر واتساب'
            , 'dashboard.alerts.whatsapp.send': 'إرسال واتساب'
            , 'dashboard.finance.eyebrow': 'الحسابات'
            , 'dashboard.finance.title': 'ملخص الشهر الحالي'
            , 'dashboard.finance.loading': 'جاري تحميل حسابات الشهر…'
            , 'dashboard.finance.autoUpdate': 'تحديث تلقائي'
            , 'dashboard.finance.subscriptions': 'تحصيلات الاشتراكات'
            , 'dashboard.finance.subscriptionsHelp': 'المبلغ المحصل فعليًا من الاشتراكات خلال الفترة'
            , 'dashboard.finance.dayPasses': 'الحصص اليومية'
            , 'dashboard.finance.noDayPasses': 'لا توجد حصص مسجلة'
            , 'dashboard.finance.expenses': 'المصروفات'
            , 'dashboard.finance.addExpense': 'إضافة مصروف'
            , 'dashboard.finance.noExpenses': 'لا توجد مصروفات مسجلة'
            , 'dashboard.finance.net': 'صافي الشهر'
            , 'dashboard.finance.netHelp': 'التحصيل الفعلي − المصروفات'
            , 'dashboard.finance.loadingExpenses': 'جاري تحميل المصروفات…'
            , 'expenses.eyebrow': 'الحسابات'
            , 'expenses.title': 'إدارة المصروفات'
            , 'expenses.description': 'أضف وعدّل واحذف مصروفات الشهر الحالي من مكان واحد.'
            , 'expenses.add': 'إضافة مصروف'
            , 'expenses.list.heading': 'البند والتاريخ'
            , 'expenses.list.amount': 'القيمة'
            , 'expenses.list.actions': 'الإجراءات'
            , 'expenses.list.empty': 'لا توجد مصروفات مسجلة في الشهر الحالي.'
            , 'expenses.state.loading': 'جاري تحميل الحسابات الشهرية…'
            , 'expenses.state.loadingData': 'جارٍ تحميل البيانات المالية…'
            , 'expenses.state.unavailable': 'غير متاح حتى اكتمال تحميل البيانات.'
            , 'expenses.state.refreshing': 'جاري تحديث الحسابات…'
            , 'expenses.state.updated': 'محدث الآن'
            , 'expenses.state.loadFailed': 'تعذر التحميل'
            , 'expenses.state.refreshFailed': 'تعذر التحديث'
            , 'expenses.state.loadError': 'تعذر تحميل الحسابات الشهرية. حاول تحديث الصفحة أو أعد المحاولة لاحقًا.'
            , 'expenses.state.loadingExpenses': 'جاري تحميل المصروفات…'
            , 'expenses.list.error': 'تعذر تحميل قائمة المصروفات. حاول التحديث مرة أخرى.'
            , 'expenses.summary.collectionCount': '{{count}} عملية تحصيل · المبلغ المحصل فعليًا خلال الفترة'
            , 'expenses.summary.dayPassCount': '{{count}} حصة · تحصيل فعلي'
            , 'expenses.summary.noDayPasses': 'لا توجد حصص مسجلة'
            , 'expenses.summary.expenseCount': '{{count}} مصروف · مسجل خلال الفترة'
            , 'expenses.summary.noExpenses': 'لا توجد مصروفات مسجلة'
            , 'expenses.summary.netWithRefunds': 'التحصيل الفعلي − المصروفات − الاستردادات'
            , 'expenses.summary.net': 'التحصيل الفعلي − المصروفات'
            , 'expenses.list.periodCount': '{{count}} مصروف مسجل خلال الفترة'
            , 'expenses.dialog.add.title': 'إضافة مصروف'
            , 'expenses.dialog.edit.title': 'تعديل المصروف'
            , 'expenses.dialog.add.description': 'سجّل مصروفًا جديدًا ليُخصم مباشرة من صافي الشهر الحالي.'
            , 'expenses.dialog.edit.description': 'عدّل بيانات المصروف وسيتم تحديث إجمالي المصروفات وصافي الشهر تلقائيًا.'
            , 'expenses.dialog.close': 'إغلاق'
            , 'expenses.field.name': 'اسم المصروف *'
            , 'expenses.field.name.placeholder': 'مثال: إيجار أو صيانة'
            , 'expenses.field.amount': 'المبلغ *'
            , 'expenses.field.date': 'التاريخ *'
            , 'expenses.field.notes': 'ملاحظة اختيارية'
            , 'expenses.field.notes.placeholder': 'أضف تفاصيل مختصرة إن لزم'
            , 'expenses.action.cancel': 'إلغاء'
            , 'expenses.action.save': 'حفظ المصروف'
            , 'expenses.action.saveEdit': 'حفظ التعديل'
            , 'expenses.action.edit': 'تعديل المصروف'
            , 'expenses.action.delete': 'حذف المصروف'
            , 'dashboard.dayPasses.eyebrow': 'الإيراد اليومي'
            , 'dashboard.dayPasses.title': 'الحصص اليومية'
            , 'dashboard.dayPasses.monthSummary': 'ملخص الحصص المسجلة خلال {{month}}'
            , 'dashboard.dayPasses.add': 'إضافة حصة'
            , 'dashboard.dayPasses.manage': 'إدارة السجل'
            , 'dashboard.dayPasses.monthCount': 'عدد الحصص هذا الشهر'
            , 'dashboard.dayPasses.monthRevenue': 'إيراد الحصص هذا الشهر'
            , 'dashboard.dayPasses.loading': 'جاري تحميل سجل الحصص…'
            , 'dashboard.dayPasses.empty': 'لا توجد حصص مسجلة خلال هذا الشهر.'
            , 'dashboard.dayPasses.column.visitor': 'الزائر'
            , 'dashboard.dayPasses.column.type': 'نوع الحصة'
            , 'dashboard.dayPasses.column.date': 'التاريخ'
            , 'dashboard.dayPasses.column.amount': 'المبلغ'
            , 'dashboard.dayPasses.column.actions': 'الإجراءات'
            , 'dashboard.store.title': 'ملخص المتجر'
            , 'dashboard.store.sales': 'مبيعات المتجر'
            , 'dashboard.store.description': 'ملخص سريع لا يزاحم مؤشرات الجيم الأساسية.'
            , 'dashboard.store.open': 'فتح المتجر'
            , 'dashboard.store.todaySales': 'مبيعات اليوم'
            , 'dashboard.store.monthSales': 'مبيعات الشهر'
            , 'dashboard.store.expenses': 'مصروفات المتجر'
            , 'dashboard.store.netProfit': 'صافي الربح'
            , 'dashboard.store.stockAlerts': 'تنبيهات المخزون'
            , 'dashboard.analytics.eyebrow': 'تحليلات {{brand}}'
            , 'dashboard.analytics.title': 'مؤشرات الأداء والرسومات البيانية'
            , 'dashboard.analytics.loading': 'جاري تحميل التحليلات…'
            , 'dashboard.analytics.refreshing': 'جاري تحديث المؤشرات…'
            , 'dashboard.analytics.loadError': 'تعذر تحميل التحليلات.'
            , 'dashboard.analytics.refreshError': 'تعذر تحديث التحليلات.'
            , 'dashboard.analytics.period.week': 'أسبوعي'
            , 'dashboard.analytics.period.month': 'شهري'
            , 'dashboard.analytics.period.year': 'سنوي'
            , 'dashboard.analytics.period.weekLabel': 'هذا الأسبوع'
            , 'dashboard.analytics.period.monthLabel': 'هذا الشهر'
            , 'dashboard.analytics.period.yearLabel': 'هذه السنة'
            , 'dashboard.analytics.period.range': '{{period}} · {{start}} — {{end}}'
            , 'dashboard.analytics.label.smartReading': 'القراءة الذكية'
            , 'dashboard.analytics.label.health': 'مؤشر الصحة'
            , 'dashboard.analytics.label.activityRate': 'نسبة النشاط'
            , 'dashboard.analytics.label.collectionTrend': 'اتجاه التحصيل'
            , 'dashboard.analytics.label.followupPriority': 'أولوية المتابعة'
            , 'dashboard.analytics.label.newMembers': 'أعضاء جدد'
            , 'dashboard.analytics.label.actualCollections': 'التحصيل الفعلي'
            , 'dashboard.analytics.label.periodNet': 'صافي الفترة'
            , 'dashboard.analytics.label.attendanceVisits': 'زيارات الحضور'
            , 'dashboard.analytics.label.outstanding': 'المبالغ المتبقية'
            , 'dashboard.analytics.label.needsFollowup': 'تحتاج متابعة'
            , 'dashboard.analytics.label.financialActivity': 'الحركة المالية'
            , 'dashboard.analytics.label.collections': 'التحصيل'
            , 'dashboard.analytics.label.expenses': 'المصروفات'
            , 'dashboard.analytics.label.currentState': 'الوضع الحالي'
            , 'dashboard.analytics.label.memberStatuses': 'حالات الأعضاء'
            , 'dashboard.analytics.label.membershipDistribution': 'توزيع الاشتراكات'
            , 'dashboard.analytics.label.paymentMethods': 'طرق الدفع'
            , 'dashboard.analytics.label.duringPeriod': 'خلال الفترة'
            , 'dashboard.analytics.label.financialMovement': 'الحركة المالية'
            , 'dashboard.analytics.label.collectionExpenses': 'التحصيل والمصروفات'
            , 'dashboard.analytics.label.memberStates': 'حالات الأعضاء'
            , 'dashboard.analytics.label.membershipsActivity': 'الأعضاء والاشتراكات'
            , 'dashboard.analytics.label.operations': 'تحليل التشغيل'
            , 'dashboard.analytics.label.attendance': 'تحليل الحضور والانصراف'
            , 'dashboard.analytics.empty.chartStatus': 'لا توجد حالات مسجلة.'
            , 'dashboard.analytics.empty.chartMemberships': 'لا توجد بيانات خلال الفترة.'
            , 'dashboard.analytics.empty.chartTrend': 'لا توجد بيانات كافية بعد.'
            , 'dashboard.analytics.label.traffic': 'الزحام'
            , 'dashboard.analytics.label.commitment': 'الالتزام'
            , 'dashboard.analytics.label.collection': 'التحصيل'
            , 'dashboard.analytics.label.expense': 'المصروفات'
            , 'dashboard.analytics.error.period': 'الفترة الزمنية للتحليلات'
            , 'dashboard.analytics.label.activity': 'النشاط'
            , 'dashboard.analytics.label.membersAndMemberships': 'الأعضاء والاشتراكات'
            , 'dashboard.analytics.label.operationsAnalysis': 'تحليل التشغيل'
            , 'dashboard.analytics.label.attendanceAnalysis': 'تحليل الحضور والانصراف'
            , 'dashboard.analytics.label.attendanceDescription': 'اعرف أوقات الذروة، أكثر المشتركين حضورًا، ومن يحتاج إلى متابعة.'
            , 'dashboard.analytics.label.peakHours': 'أوقات الذروة'
            , 'dashboard.analytics.label.mostAttended': 'الأكثر حضورًا'
            , 'dashboard.analytics.label.followup': 'المتابعة'
            , 'dashboard.analytics.label.absent7Days': 'لم يحضروا منذ 7 أيام'
            , 'dashboard.analytics.empty.trend': 'ستظهر الحركة المالية هنا بعد تسجيل أول تحصيل أو مصروف.'
            , 'dashboard.analytics.empty.status': 'لا توجد حالات مسجلة.'
            , 'dashboard.analytics.empty.memberships': 'لا توجد بيانات خلال الفترة.'
            , 'dashboard.analytics.empty.activity': 'لا توجد حركة تسجيل أو اشتراكات في هذه الفترة.'
            , 'dashboard.analytics.empty.visits': 'لا توجد زيارات مسجلة في هذه الفترة.'
            , 'dashboard.analytics.empty.allAttended': 'كل المشتركين حضروا خلال آخر 7 أيام.'
            , 'dashboard.analytics.empty.comparison': 'لا توجد فترة مقارنة'
            , 'dashboard.analytics.empty.priority': 'لا توجد أولوية عاجلة'
            , 'dashboard.analytics.health.excellent': 'أداء ممتاز'
            , 'dashboard.analytics.health.stable': 'أداء مستقر'
            , 'dashboard.analytics.health.followup': 'يحتاج متابعة'
            , 'dashboard.analytics.health.intervention': 'بيانات تحتاج تدخل'
            , 'dashboard.analytics.comparison.new': 'جديد خلال الفترة'
            , 'dashboard.analytics.comparison.none': 'بدون حركة'
            , 'dashboard.analytics.comparison.flat': 'بدون تغيير عن السابقة'
            , 'dashboard.analytics.comparison.previous': 'عن الفترة السابقة'
            , 'dashboard.analytics.net.positive': 'الصافي موجب، ونسبة المصروفات {{ratio}}٪ من التحصيل.'
            , 'dashboard.analytics.net.negative': 'المصروفات أعلى من التحصيل وتحتاج مراجعة.'
            , 'dashboard.analytics.net.afterExpenses': 'التحصيل − المصروفات'
            , 'dashboard.analytics.net.afterRefunds': 'التحصيل − المصروفات − الاستردادات'
            , 'dashboard.analytics.priority.balance': '{{count}} اشتراك عليه رصيد'
            , 'dashboard.analytics.priority.expiring': '{{count}} اشتراك يقترب انتهاؤه'
            , 'dashboard.analytics.priority.inactive': '{{count}} مشترك يحتاج تنشيطًا'
            , 'dashboard.analytics.meta.transactions': '{{count}} دفعة · المبلغ المحصل فعليًا خلال الفترة'
            , 'dashboard.analytics.meta.activeMembers': '{{active}} عضو نشط من {{total}}'
            , 'dashboard.analytics.meta.uniqueMembers': '{{count}} مشترك حضر'
            , 'dashboard.analytics.meta.outstandingCount': '{{count}} اشتراك'
            , 'dashboard.analytics.meta.inactiveMembers': '{{count}} غائب 7 أيام'
            , 'dashboard.analytics.meta.datedVisit': '{{count}} زيارة'
            , 'dashboard.analytics.meta.visitCount': '{{count}} زيارة'
            , 'dashboard.analytics.attendance.peak': 'الذروة {{hour}}'
            , 'dashboard.analytics.chart.aria': 'رسم التحصيل والمصروفات'
            , 'dashboard.analytics.activity.newMembers': 'أعضاء جدد'
            , 'dashboard.analytics.activity.memberships': 'اشتراكات'
            , 'dashboard.analytics.activity.memberTitle': 'أعضاء جدد: {{count}}'
            , 'dashboard.analytics.activity.membershipTitle': 'اشتراكات: {{count}}'
            , 'dashboard.analytics.attendance.lastVisit': 'آخر حضور'
            , 'dashboard.analytics.attendance.notVisited': 'لم يسجل حضورًا'
            , 'dashboard.analytics.attendance.firstVisitNeeded': 'بحاجة إلى أول زيارة'
            , 'dashboard.analytics.attendance.daysAgo': 'منذ {{count}} يوم'
            , 'dashboard.analytics.value.active': 'نشطة'
            , 'dashboard.analytics.value.expiring_soon': 'قريبة الانتهاء'
            , 'dashboard.analytics.value.expired': 'منتهية'
            , 'dashboard.analytics.value.frozen': 'مجمدة'
            , 'dashboard.analytics.value.gym_only': 'جيم فقط'
            , 'dashboard.analytics.value.gym_cardio': 'جيم وكارديو'
            , 'dashboard.analytics.value.monthly': 'شهرية'
            , 'dashboard.analytics.value.half_month': 'نصف شهر'
            , 'dashboard.analytics.value.quarterly': 'ربع سنوية'
            , 'dashboard.analytics.value.semiannual': 'نصف سنوية'
            , 'dashboard.analytics.value.annual': 'سنوية'
            , 'dashboard.analytics.value.two month': 'شهرين'
            , 'dashboard.analytics.value.custom_mslzyl8m': 'شهرين'
            , 'dashboard.analytics.value.cash': 'نقدي'
            , 'dashboard.analytics.value.card': 'بطاقة'
            , 'dashboard.analytics.value.transfer': 'تحويل'
            , 'dashboard.analytics.value.other': 'أخرى'
            , 'dashboard.analytics.error.generic': 'تعذر تحميل التحليلات.'
            , 'store.tabs.pos': 'نقطة البيع'
            , 'store.tabs.bar': 'نقطة بيع البار'
            , 'store.tabs.products': 'المنتجات'
            , 'store.tabs.inventory': 'المخزون'
            , 'store.tabs.purchases': 'المشتريات'
            , 'store.tabs.sales': 'المبيعات'
            , 'store.tabs.suppliers': 'الموردون'
            , 'store.tabs.expenses': 'مصروفات المتجر'
            , 'store.tabs.reports': 'تقارير المتجر'
            , 'store.common.refresh': 'تحديث'
            , 'store.common.clear': 'تفريغ'
            , 'store.common.cancel': 'إلغاء'
            , 'store.common.save': 'حفظ'
            , 'store.common.loadingProducts': 'جارٍ تحميل المنتجات...'
            , 'store.common.loadingInventory': 'جارٍ تحميل المخزون...'
            , 'store.common.loadingPurchases': 'جارٍ تحميل المشتريات...'
            , 'store.common.loadingSales': 'جارٍ تحميل المبيعات...'
            , 'store.common.loadingSuppliers': 'جارٍ تحميل الموردين...'
            , 'store.common.loadingExpenses': 'جارٍ تحميل المصروفات...'
            , 'store.pos.searchProducts': 'بحث في المنتجات'
            , 'store.pos.searchPlaceholder': 'ابحث عن منتج...'
            , 'store.pos.searchHelp': 'ابحث بالاسم أو SKU أو الباركود.'
            , 'store.pos.noMatchingProducts': 'لا توجد منتجات مطابقة للبحث.'
            , 'store.pos.cart': 'السلة'
            , 'store.pos.noProductsAdded': 'لم تتم إضافة منتجات'
            , 'store.pos.cartEmpty': 'أضف منتجًا إلى السلة للبدء.'
            , 'store.pos.customerOptional': 'العميل (اختياري)'
            , 'store.pos.customerPlaceholder': 'اسم العضو أو الهاتف...'
            , 'store.pos.discount': 'خصم'
            , 'store.pos.tax': 'ضريبة'
            , 'store.pos.paid': 'المدفوع'
            , 'store.pos.amountPlaceholder': 'كامل المبلغ'
            , 'store.pos.paymentMethod': 'طريقة الدفع'
            , 'store.pos.notes': 'ملاحظات'
            , 'store.pos.total': 'الإجمالي'
            , 'store.pos.completeSale': 'إتمام البيع وطباعة الإيصال'
            , 'store.pos.cash': 'نقدي'
            , 'store.pos.card': 'بطاقة'
            , 'store.pos.transfer': 'تحويل'
            , 'store.pos.wallet': 'محفظة'
            , 'store.pos.other': 'أخرى'
            , 'store.products.manage': 'إدارة المنتجات'
            , 'store.products.description': 'أضف المنتجات مع SKU وسعر التكلفة والبيع والحد الأدنى للمخزون.'
            , 'store.products.add': 'إضافة منتج'
            , 'store.products.name': 'اسم المنتج بالعربية'
            , 'store.products.category': 'التصنيف'
            , 'store.products.sku': 'SKU'
            , 'store.products.barcode': 'الباركود'
            , 'store.products.cost': 'تكلفة الشراء'
            , 'store.products.price': 'سعر البيع'
            , 'store.products.minimumStock': 'الحد الأدنى للمخزون'
            , 'store.products.trackInventory': 'تتبع المخزون'
            , 'store.products.noProducts': 'لا توجد منتجات بعد.'
            , 'store.products.variants': '{{count}} نسخة'
            , 'store.products.statusActive': 'نشط'
            , 'store.products.statusInactive': 'غير نشط'
            , 'store.status.received': 'مستلم'
            , 'store.status.completed': 'مكتمل'
            , 'store.dashboard.todaySales': 'مبيعات اليوم'
            , 'store.dashboard.monthRevenue': 'مبيعات الشهر'
            , 'store.dashboard.expenses': 'مصروفات المتجر'
            , 'store.dashboard.netProfit': 'صافي الربح'
            , 'store.dashboard.stockAlerts': 'تنبيهات المخزون'
            , 'store.reports.cogs': 'تكلفة البضاعة'
            , 'store.reports.netProfit': 'صافي الربح'
            , 'store.products.edit': 'تعديل'
            , 'store.products.deactivate': 'تعطيل'
            , 'store.inventory.description': 'الرصيد الحالي والتنبيهات وحركات التسوية.'
            , 'store.inventory.balance': 'الرصيد'
            , 'memberPortal.title': 'بيانات عضويتي'
            , 'memberPortal.intro': 'تابع اشتراكك وحضورك ومدفوعاتك باستخدام كود العضوية الخاص بك.'
            , 'memberPortal.membershipCode': 'كود العضوية'
            , 'memberPortal.secureEntry': 'دخول آمن'
            , 'memberPortal.secureEntryHelp': 'أدخل الكود كما استلمته من إدارة Logic Fit، ولا تشاركه مع أي شخص.'
            , 'memberPortal.viewData': 'عرض بياناتي'
            , 'memberPortal.portalTitle': 'بوابة عضويتي'
            , 'memberPortal.chooseService': 'اختر الخدمة التي تريد استخدامها'
            , 'memberPortal.printReport': 'طباعة التقرير'
            , 'memberPortal.downloadPdf': 'تنزيل PDF'
            , 'memberPortal.anotherCode': 'كود آخر'
            , 'memberPortal.occupancy.kicker': 'حالة الجيم الآن'
            , 'memberPortal.occupancy.title': 'اعرف مستوى الازدحام قبل ما تتحرك'
            , 'memberPortal.occupancy.privacy': 'عدد تقريبي يحافظ على خصوصية الأعضاء، بدون عرض أي أسماء أو بيانات شخصية.'
            , 'memberPortal.occupancy.peopleInside': 'شخص داخل الجيم'
            , 'memberPortal.occupancy.loading': 'جارٍ تحديث الحالة'
            , 'memberPortal.occupancy.safeEstimate': 'نحسب الحضور الحالي بأمان'
            , 'memberPortal.occupancy.autoRefresh': 'يتم التحديث تلقائيًا كل 30 ثانية'
            , 'memberPortal.occupancy.refresh': 'تحديث الآن'
            , 'memberPortal.occupancy.note': 'يتم استبعاد التسجيلات القديمة تلقائيًا حسب سياسة الانصراف التلقائي.'
            , 'memberPortal.occupancy.quiet': 'هادئ'
            , 'memberPortal.occupancy.quietHint': 'مناسب للتمرين براحة'
            , 'memberPortal.occupancy.moderate': 'متوسط'
            , 'memberPortal.occupancy.moderateHint': 'حركة متوازنة داخل الجيم'
            , 'memberPortal.occupancy.busy': 'مزدحم'
            , 'memberPortal.occupancy.busyHint': 'الجيم فيه حركة ملحوظة'
            , 'memberPortal.occupancy.veryBusy': 'مزدحم جدًا'
            , 'memberPortal.occupancy.veryBusyHint': 'يفضل اختيار وقت أهدأ'
            , 'memberPortal.occupancy.refreshing': 'جاري تحديث الحالة...'
            , 'memberPortal.occupancy.lastUpdated': 'آخر تحديث {{date}}'
            , 'memberPortal.occupancy.staleExcluded': 'تم استبعاد {{count}} تسجيلات قديمة تلقائيًا حتى يظل العدد واقعيًا.'
            , 'memberPortal.occupancy.error': 'تعذر تحديث الحالة'
            , 'memberPortal.occupancy.retryHint': 'حاول التحديث مرة أخرى بعد قليل'
            , 'memberPortal.occupancy.savedReading': 'آخر قراءة محفوظة إن وُجدت'
            , 'memberPortal.occupancy.refreshFailed': 'تعذر تحديث الحالة الآن.'
            , 'memberPortal.tools.aria': 'خدمات العضو'
            , 'memberPortal.tools.report': 'بياناتي وطباعتها'
            , 'memberPortal.tools.reportHelp': 'عرض التقرير وتنزيله بصيغة PDF'
            , 'memberPortal.tools.feedback': 'قيّم تجربتي'
            , 'memberPortal.tools.feedbackHelp': 'شاركنا رأيك في Logic Fit والمدربين'
            , 'memberPortal.tools.exercises': 'دليل التمارين'
            , 'memberPortal.tools.exercisesHelp': 'ابحث باسم التمرين واستخدم المستوى والأداة'
            , 'memberPortal.tools.foods': 'دليل التغذية'
            , 'memberPortal.tools.foodsHelp': 'السعرات والماكروز لكل طعام'
            , 'memberPortal.tools.subscription': 'اشترك / جدد عضويتك'
            , 'memberPortal.tools.subscriptionHelp': 'اختر العضوية وارفع إثبات الدفع للمراجعة'
            , 'memberPortal.trainer.title': 'مساحة العميل'
            , 'memberPortal.trainer.description': 'خططك ومتابعتك وجلساتك في مكان واحد.'
            , 'memberPortal.trainer.profile': 'ملف العميل'
            , 'memberPortal.trainer.mode': 'تدريب شخصي'
            , 'memberPortal.trainer.summary': 'ملخص مساحة العميل'
            , 'memberPortal.trainer.trainingPlans': 'خطط التدريب'
            , 'memberPortal.trainer.nutritionPlans': 'خطط التغذية'
            , 'memberPortal.trainer.upcomingSessions': 'الجلسات القادمة'
            , 'memberPortal.trainer.remainingSessions': 'الجلسات المتبقية'
            , 'memberPortal.trainer.availablePlans': 'الخطط المتاحة لك'
            , 'memberPortal.trainer.scheduledSessions': 'مواعيد مجدولة'
            , 'memberPortal.trainer.currentPackages': 'ضمن الباقات الحالية'
            , 'memberPortal.trainer.plan': 'الخطة'
            , 'memberPortal.trainer.period': 'الفترة'
            , 'memberPortal.trainer.status': 'الحالة'
            , 'memberPortal.trainer.noTrainingPlans': 'لا توجد خطط تدريب متاحة.'
            , 'memberPortal.trainer.noNutritionPlans': 'لا توجد خطط تغذية متاحة.'
            , 'memberPortal.trainer.noUpcomingSessions': 'لا توجد جلسات قادمة.'
            , 'memberPortal.trainer.until': 'حتى {{date}}'
            , 'memberPortal.view.home.title': 'بوابة عضويتي'
            , 'memberPortal.view.home.description': 'اختر الخدمة التي تريد استخدامها'
            , 'memberPortal.view.report.title': 'بياناتي وطباعتها'
            , 'memberPortal.lookup.loading': 'جاري التحقق من الكود...'
            , 'memberPortal.lookup.codeRequired': 'أدخل كود العضوية أولًا.'
            , 'memberPortal.lookup.failed': 'تعذر عرض بيانات العضوية.'
            , 'memberPortal.view.report.description': 'عرض حالة العضوية والاشتراكات والمدفوعات والحضور.'
            , 'memberPortal.view.feedback.title': 'قيّم تجربتي'
            , 'memberPortal.view.feedback.description': 'شاركنا رأيك في الجيم والمدربين.'
            , 'memberPortal.view.subscription.title': 'اشترك أو جدد عضويتك'
            , 'memberPortal.view.subscription.description': 'أرسل طلب عضوية أو تجديد مع إثبات الدفع للمراجعة.'
            , 'memberPortal.view.exercises.title': 'دليل التمارين'
            , 'memberPortal.view.exercises.description': 'ابحث عن التمرين بالاسم وحدد المستوى والأداة المناسبة.'
            , 'memberPortal.view.foods.title': 'دليل التغذية'
            , 'memberPortal.view.foods.description': 'ابحث عن الطعام وتعرّف على السعرات والماكروز لكل حصة.'
            , 'memberPortal.back.aria': 'العودة إلى خدمات العضو'
            , 'memberPortal.back': 'العودة للخدمات'
            , 'memberPortal.clientPortal': 'بوابة العميل'
            , 'memberPortal.clientPortalDescription': 'تابع خطتك وجلساتك وتقدمك مع مدربك.'
            , 'memberPortal.loadingLibrary': 'تعذر تحميل دليل التمارين والتغذية.'
            , 'memberPortal.openLibraryError': 'تعذر فتح الدليل'
            , 'memberPortal.retry': 'حاول مرة أخرى.'
            , 'memberPortal.library.close': 'العودة للخدمات'
            , 'memberPortal.library.details': 'التفاصيل'
            , 'memberPortal.library.closeDialog': 'إغلاق'
            , 'memberPortal.library.quickSearch': 'بحث سريع'
            , 'memberPortal.library.searchPlaceholder': 'ابحث باسم التمرين أو الطعام...'
            , 'memberPortal.library.category': 'التصنيف'
            , 'memberPortal.library.allCategories': 'كل التصنيفات'
            , 'memberPortal.library.level': 'المستوى'
            , 'memberPortal.library.allLevels': 'كل المستويات'
            , 'memberPortal.library.equipment': 'الأداة'
            , 'memberPortal.library.allEquipment': 'كل الأدوات'
            , 'memberPortal.library.exercisesAvailable': 'التمارين المتاحة'
            , 'memberPortal.library.exerciseHint': 'استخدم البحث أو الفلاتر للوصول إلى التمرين المطلوب'
            , 'memberPortal.library.noExercisesMatch': 'لا توجد تمارين مطابقة'
            , 'memberPortal.library.noExercises': 'لا توجد تمارين متاحة'
            , 'memberPortal.library.tryDifferentFilter': 'جرّب اسمًا مختلفًا أو غيّر أحد الفلاتر.'
            , 'memberPortal.library.foodsAndNutrition': 'الأطعمة والقيم الغذائية'
            , 'memberPortal.library.foodHint': 'ابحث عن طعام لمعرفة تفاصيله'
            , 'memberPortal.library.noFoodsMatch': 'لا توجد أطعمة مطابقة'
            , 'memberPortal.library.startFoodSearch': 'اكتب اسم الطعام للبدء'
            , 'memberPortal.library.foodNutrientsHint': 'ستظهر السعرات والماكروز لكل حصة.'
            , 'memberPortal.library.page': 'صفحة {{page}} من {{pages}}'
            , 'memberPortal.library.previous': 'السابق'
            , 'memberPortal.library.next': 'التالي'
            , 'memberPortal.library.exerciseGuide': 'دليل التمارين'
            , 'memberPortal.library.nutritionGuide': 'دليل التغذية'
            , 'memberPortal.library.startPosition': 'وضع البداية'
            , 'memberPortal.library.detailsButton': 'عرض التفاصيل'
            , 'memberPortal.library.nutritionDetails': 'التفاصيل الغذائية'
            , 'memberPortal.library.calories': 'السعرات'
            , 'memberPortal.library.protein': 'بروتين'
            , 'memberPortal.library.carbs': 'كارب'
            , 'memberPortal.library.fat': 'دهون'
            , 'memberPortal.library.difficulty.beginner': 'مبتدئ'
            , 'memberPortal.library.difficulty.intermediate': 'متوسط'
            , 'memberPortal.library.difficulty.advanced': 'متقدم'
            , 'memberPortal.library.difficulty.expert': 'خبير'
            , 'memberPortal.library.equipment.bodyOnly': 'وزن الجسم'
            , 'memberPortal.library.equipment.dumbbell': 'دامبل'
            , 'memberPortal.library.equipment.barbell': 'بار'
            , 'memberPortal.library.equipment.cable': 'كابل'
            , 'memberPortal.library.equipment.machine': 'جهاز'
            , 'memberPortal.library.equipment.bands': 'أشرطة مقاومة'
            , 'memberPortal.library.equipment.kettlebell': 'كيتل بيل'
            , 'memberPortal.library.equipment.medicineBall': 'كرة طبية'
            , 'memberPortal.library.equipment.other': 'أخرى'
            , 'memberPortal.library.category.strength': 'قوة'
            , 'memberPortal.library.category.stretching': 'إطالة'
            , 'memberPortal.library.category.cardio': 'كارديو'
            , 'memberPortal.library.category.plyometrics': 'بليومتري'
            , 'memberPortal.library.category.powerlifting': 'باور ليفتنج'
            , 'memberPortal.library.category.strongman': 'سترونج مان'
            , 'memberPortal.library.unnamed': 'بدون اسم'
            , 'memberPortal.library.requestFailed': 'تعذر تحميل البيانات.'
            , 'memberPortal.library.memberHub': 'مركز الأعضاء'
            , 'memberPortal.library.guideLabel': 'دليل'
            , 'memberPortal.library.calorieUnit': 'سعرة'
            , 'memberPortal.library.servingSize': 'لكل {{amount}} {{unit}}'
            , 'memberPortal.library.sets': 'مجموعات'
            , 'memberPortal.library.reps': 'تكرارات'
            , 'memberPortal.library.loadingDetails': 'جاري تجهيز التفاصيل...'
            , 'memberPortal.library.loadError': 'تعذر تحميل الدليل'
            , 'memberPortal.library.detailsError': 'تعذر تحميل التفاصيل'
            , 'memberPortal.library.setupError': 'تعذر تجهيز الدليل'
            , 'memberPortal.library.retryButton': 'إعادة المحاولة'
            , 'memberPortal.library.food': 'طعام'
            , 'memberPortal.library.perServing': 'سعرة لكل {{amount}} {{unit}}'
            , 'memberPortal.library.resultCount': '{{count}} نتيجة'
            , 'memberPortal.library.foodCount': '{{count}} طعام متاح'
            , 'memberPortal.library.noFoodSearch': 'ابحث عن طعام لمعرفة تفاصيله'
            , 'memberPortal.library.noFoodMatch': 'لا توجد أطعمة مطابقة'
            , 'memberPortal.library.enterFood': 'اكتب اسم الطعام للبدء'
            , 'memberPortal.library.noFoodDetails': 'ستظهر السعرات والماكروز لكل حصة.'
            , 'memberPortal.library.rest': 'الراحة'
            , 'memberPortal.library.tempo': 'الإيقاع'
            , 'memberPortal.library.seconds': 'ث'
            , 'memberPortal.library.muscleUnknown': 'عضلة غير محددة'
            , 'memberPortal.library.howTo': 'طريقة الأداء'
            , 'memberPortal.library.instructionsUnavailable': 'التعليمات العربية غير متاحة لهذا التمرين.'
            , 'memberPortal.library.tips': 'نصائح مهمة'
            , 'memberPortal.library.noTips': 'لا توجد نصائح إضافية مسجلة.'
            , 'memberPortal.library.commonMistakes': 'أخطاء شائعة'
            , 'memberPortal.library.noMistakes': 'لا توجد أخطاء شائعة مسجلة.'
            , 'memberPortal.library.grams': 'جرام'
            , 'memberPortal.library.fiber': 'الألياف'
            , 'memberPortal.library.sugar': 'السكريات'
            , 'memberPortal.library.sodium': 'الصوديوم'
            , 'memberPortal.library.milligrams': 'ملجم'
            , 'memberPortal.library.detailsUnavailable': 'تعذر تحميل التفاصيل'
            , 'memberPortal.library.tryAgain': 'حاول مرة أخرى.'
            , 'memberPortal.library.preparing': 'جاري تجهيز التفاصيل...'
            , 'memberPortal.feedback.eyebrow': 'رأيك يهمنا'
            , 'memberPortal.feedback.title': 'قيّم تجربتك'
            , 'memberPortal.feedback.description': 'شاركنا رأيك في Logic Fit والمدربين، وأخبرنا بما يمكننا تحسينه.'
            , 'memberPortal.feedback.ratingPrompt': 'كيف تقيّم تجربتك؟'
            , 'memberPortal.feedback.ratingAria': 'تقييم التجربة من نجمة إلى خمس نجوم'
            , 'memberPortal.feedback.star.one': 'نجمة واحدة'
            , 'memberPortal.feedback.star.two': 'نجمتان'
            , 'memberPortal.feedback.star.three': 'ثلاث نجوم'
            , 'memberPortal.feedback.star.four': 'أربع نجوم'
            , 'memberPortal.feedback.star.five': 'خمس نجوم'
            , 'memberPortal.feedback.type': 'نوع الملاحظة'
            , 'memberPortal.feedback.chooseType': 'اختر نوع الملاحظة'
            , 'memberPortal.feedback.general': 'رأي عام'
            , 'memberPortal.feedback.problem': 'مشكلة'
            , 'memberPortal.feedback.complaint': 'شكوى'
            , 'memberPortal.feedback.suggestion': 'اقتراح'
            , 'memberPortal.feedback.featureRequest': 'إضافة يحتاجها Logic Fit'
            , 'memberPortal.feedback.message': 'ملاحظتك'
            , 'memberPortal.feedback.placeholder': 'اكتب رأيك في Logic Fit والمدربين والإيجابيات والسلبيات أو أي اقتراح لديك...'
            , 'memberPortal.feedback.submit': 'إرسال التقييم'
            , 'memberPortal.feedback.sending': 'جاري إرسال التقييم...'
            , 'memberPortal.feedback.success': 'تم حفظ تقييمك بنجاح، شكرًا لمشاركتنا رأيك.'
            , 'memberPortal.feedback.portalCodeRequired': 'أعد إدخال كود العضوية لفتح البوابة.'
            , 'memberPortal.feedback.ratingRequired': 'اختر تقييمًا من نجمة إلى 5 نجوم.'
            , 'memberPortal.feedback.messageRequired': 'اكتب ملاحظتك قبل إرسال التقييم.'
            , 'memberPortal.feedback.saveFailed': 'تعذر حفظ التقييم. حاول مرة أخرى.'
            , 'memberPortal.subscription.title': 'اشترك أو جدد عضويتك'
            , 'memberPortal.subscription.description': 'اختر تفاصيل عضويتك وأرسل إثبات الدفع لمراجعته من إدارة الجيم.'
            , 'memberPortal.subscription.operation': 'العملية المناسبة لعضويتك'
            , 'memberPortal.subscription.new': 'اشتراك جديد'
            , 'memberPortal.subscription.extension': 'تمديد العضوية'
            , 'memberPortal.subscription.renewal': 'تجديد العضوية'
            , 'memberPortal.subscription.autoOperation': 'يحدد النظام العملية تلقائيًا حسب حالة عضويتك الحالية.'
            , 'memberPortal.subscription.plan': 'الباقة'
            , 'memberPortal.subscription.type': 'نوع العضوية'
            , 'memberPortal.subscription.chooseType': 'اختر نوع العضوية'
            , 'memberPortal.subscription.startDate': 'تاريخ البداية'
            , 'memberPortal.subscription.paymentDate': 'تاريخ التحصيل الفعلي'
            , 'memberPortal.subscription.paymentDateHint': 'التاريخ الذي استلمت فيه إدارة الجيم المبلغ، وليس وقت إدخال الطلب.'
            , 'memberPortal.subscription.paymentDetails': 'بيانات التحويل للجيم'
            , 'memberPortal.subscription.currentGym': 'هذه البيانات تخص الجيم الحالي فقط.'
            , 'memberPortal.subscription.currentGymBrand': 'هذه البيانات تخص {{brand}} فقط.'
            , 'memberPortal.subscription.paymentSteps': 'خطوات الدفع'
            , 'memberPortal.subscription.step.transfer': 'حوّل المبلغ إلى وسيلة الدفع المعروضة.'
            , 'memberPortal.subscription.step.proof': 'أرفق إثبات التحويل مع الطلب.'
            , 'memberPortal.subscription.step.track': 'تابع حالة الطلب هنا حتى تراجعه إدارة الجيم.'
            , 'memberPortal.subscription.membership': 'العضوية'
            , 'memberPortal.subscription.collectionDate': 'تاريخ التحصيل'
            , 'memberPortal.subscription.amountDue': 'المبلغ المطلوب'
            , 'memberPortal.subscription.optionalNote': 'ملاحظة اختيارية'
            , 'memberPortal.subscription.notePlaceholder': 'أي ملاحظة تساعد الإدارة على مراجعة طلبك...'
            , 'memberPortal.subscription.proof': 'إثبات الدفع'
            , 'memberPortal.subscription.proofHelp': 'اختر أي صورة أو ملف PDF — الحد الأقصى 4MB'
            , 'memberPortal.subscription.sendRequest': 'إرسال طلب التفعيل'
            , 'memberPortal.subscription.reviewNote': 'سيتم اعتماد الاشتراك بعد مراجعة إثبات الدفع من إدارة الجيم.'
            , 'memberPortal.subscription.requestHistory': 'طلباتك السابقة'
            , 'memberPortal.subscription.refresh': 'تحديث'
            , 'memberPortal.subscription.noHistory': 'لا توجد طلبات محملة بعد.'
            , 'memberPortal.subscription.request': 'طلب'
            , 'memberPortal.subscription.requestId': 'طلب #{{id}}'
            , 'memberPortal.subscription.status.pending': 'قيد المراجعة'
            , 'memberPortal.subscription.status.approved': 'تم الاعتماد'
            , 'memberPortal.subscription.status.rejected': 'مرفوض'
            , 'memberPortal.subscription.status.cancelled': 'ملغي'
            , 'memberPortal.subscription.status.unknown': 'غير معروف'
            , 'memberPortal.subscription.attachProof': 'تم إرفاق إثبات الدفع والتحقق منه'
            , 'memberPortal.subscription.waitingProof': 'بانتظار إثبات الدفع'
            , 'memberPortal.subscription.rejectionReason': 'سبب الرفض'
            , 'memberPortal.subscription.noRejectionReason': 'لم يتم تسجيل سبب إضافي.'
            , 'memberPortal.subscription.uploadProof': 'رفع الإثبات'
            , 'memberPortal.subscription.noPaymentMethods': 'لم يفعّل هذا الجيم وسيلة دفع إلكترونية حاليًا. يجب على Owner إضافة وسيلة دفع من إعدادات هوية الجيم ثم نشر الهوية، وبعدها أعد تحميل الصفحة.'
            , 'memberPortal.subscription.copyAccount': 'نسخ رقم الحساب'
            , 'memberPortal.subscription.copySuccess': 'تم نسخ رقم الحساب. أرفق إثبات الدفع بعد إتمام التحويل.'
            , 'memberPortal.subscription.copyFailure': 'تعذر النسخ تلقائيًا. يمكنك تحديد رقم الحساب ونسخه يدويًا.'
            , 'memberPortal.subscription.systemAfterVerify': 'سيحدده النظام بعد التحقق'
            , 'memberPortal.subscription.startExtension': 'تاريخ بدء التمديد'
            , 'memberPortal.subscription.startRenewal': 'تاريخ بدء التجديد'
            , 'memberPortal.subscription.extensionHint': 'يحدده النظام تلقائيًا ليبدأ بعد نهاية العضوية الحالية.'
            , 'memberPortal.subscription.renewalHint': 'يحدده النظام تلقائيًا من اليوم لأن العضوية الحالية منتهية.'
            , 'memberPortal.subscription.newStartHint': 'يبدأ الاشتراك الجديد من التاريخ الذي تختاره.'
            , 'memberPortal.subscription.frozenHint': 'عضويتك مجمدة حاليًا. استأنفها من إدارة الجيم قبل طلب التمديد أو التجديد.'
            , 'memberPortal.subscription.extensionScenario': 'تم اختيار تمديد العضوية تلقائيًا؛ ستبدأ المدة الجديدة بعد نهاية عضويتك الحالية.'
            , 'memberPortal.subscription.renewalScenario': 'تم اختيار تجديد العضوية تلقائيًا؛ ستبدأ من اليوم لأن العضوية الحالية منتهية.'
            , 'memberPortal.subscription.newScenario': 'تم اختيار الاشتراك الجديد؛ حدد تاريخ البداية المناسب لك.'
            , 'memberPortal.subscription.loading': 'جاري تحميل الباقات ووسائل الدفع...'
            , 'memberPortal.subscription.loadingPlans': 'جاري تحميل الباقات...'
            , 'memberPortal.subscription.loadingMethods': 'جاري تحميل وسائل الدفع...'
            , 'memberPortal.subscription.loadingRequests': 'جاري تحميل الطلبات...'
            , 'memberPortal.subscription.activationDetails': 'تم تفعيل {{plan}} من {{start}} إلى {{end}}.'
            , 'memberPortal.subscription.createdRequestIdMissing': 'تعذر تأكيد رقم الطلب بعد الحفظ.'
            , 'memberPortal.subscription.historyLoadFailed': 'تعذر تحميل سجل الطلبات.'
            , 'memberPortal.subscription.membershipStartDateRequired': 'اختر تاريخ بداية العضوية.'
            , 'memberPortal.subscription.networkError': 'تعذر الاتصال بالخدمة حاليًا. تحقق من الاتصال وحاول مرة أخرى.'
            , 'memberPortal.subscription.newMembership': 'عضوية جديدة'
            , 'memberPortal.subscription.noMemberRequests': 'لا توجد طلبات عضوية سابقة.'
            , 'memberPortal.subscription.noPlans': 'لا توجد باقات متاحة حاليًا.'
            , 'memberPortal.subscription.noTypes': 'لا توجد أنواع عضوية متاحة حاليًا.'
            , 'memberPortal.subscription.paymentDateRequired': 'أدخل تاريخ التحصيل الفعلي.'
            , 'memberPortal.subscription.paymentMethod': 'وسيلة الدفع'
            , 'memberPortal.subscription.paymentMethodRequired': 'اختر وسيلة الدفع.'
            , 'memberPortal.subscription.paymentMethodsLoadFailed': 'تعذر تحميل وسائل الدفع.'
            , 'memberPortal.subscription.paymentProofTooLarge': 'حجم إثبات الدفع يتجاوز الحد المسموح.'
            , 'memberPortal.subscription.plansLoadFailed': 'تعذر تحميل الباقات.'
            , 'memberPortal.subscription.proofRequired': 'أرفق إثبات الدفع قبل إرسال الطلب.'
            , 'memberPortal.subscription.proofRetryFailed': 'تعذر إعادة محاولة رفع إثبات الدفع.'
            , 'memberPortal.subscription.proofSelectedForRetry': 'تم اختيار الملف. أعد المحاولة لإكمال الرفع.'
            , 'memberPortal.subscription.proofUploadFailed': 'تعذر رفع إثبات الدفع.'
            , 'memberPortal.subscription.proofUploadNetworkError': 'انقطع الاتصال أثناء رفع إثبات الدفع.'
            , 'memberPortal.subscription.proofUploadSuccess': 'تم رفع إثبات الدفع والتحقق منه.'
            , 'memberPortal.subscription.requestFailed': 'تعذر تحميل بيانات طلب العضوية.'
            , 'memberPortal.subscription.requestsLoadFailed': 'تعذر تحميل طلبات العضوية.'
            , 'memberPortal.subscription.requestSubmitFailed': 'تعذر إرسال طلب العضوية.'
            , 'memberPortal.subscription.requestSubmitSuccess': 'تم إرسال طلب العضوية بنجاح.'
            , 'memberPortal.subscription.selectProofForRetry': 'اختر ملف إثبات الدفع أولًا.'
            , 'memberPortal.subscription.sendingRequest': 'جارٍ إرسال الطلب...'
            , 'memberPortal.subscription.subscriptionLoadFailed': 'تعذر تحميل معلومات العضوية.'
            , 'memberPortal.subscription.uploadingAndVerifyingProof': 'جارٍ رفع إثبات الدفع والتحقق منه...'
            , 'memberPortal.subscription.uploadingProof': 'جارٍ رفع إثبات الدفع...'
            , 'memberPortal.subscription.errors.paymentProofRequired': 'أرفق إثبات الدفع قبل المتابعة.'
            , 'memberPortal.subscription.errors.portalSessionRequired': 'أعد إدخال كود العضوية لفتح البوابة.'
            , 'memberPortal.subscription.errors.portalSessionExpired': 'انتهت جلسة البوابة. أعد إدخال كود العضوية.'
            , 'memberPortal.subscription.errors.requestAlreadyPending': 'يوجد طلب عضوية قيد المراجعة بالفعل.'
            , 'memberPortal.subscription.errors.paymentMethodUnavailable': 'وسيلة الدفع المحددة لم تعد متاحة.'
            , 'memberPortal.subscription.errors.planUnavailable': 'الباقة المحددة لم تعد متاحة.'
            , 'memberPortal.subscription.errors.membershipTypeUnavailable': 'نوع العضوية المحدد لم يعد متاحًا.'
            , 'memberPortal.subscription.errors.invalidPaymentProofType': 'نوع ملف إثبات الدفع غير مدعوم.'
            , 'memberPortal.subscription.errors.paymentProofSignatureMismatch': 'تعذر التحقق من نوع ملف إثبات الدفع.'
            , 'memberPortal.subscription.errors.paymentProofStorageNotConfigured': 'تخزين إثبات الدفع غير مهيأ لهذا الجيم.'
            , 'memberPortal.subscription.errors.paymentProofStorageUnavailable': 'تخزين إثبات الدفع غير متاح حاليًا. حاول لاحقًا.'
            , 'memberPortal.subscription.errors.requestSaveUnconfirmed': 'تعذر تأكيد حفظ الطلب. حدّث السجل قبل إعادة الإرسال.'
            , 'memberPortal.subscription.errors.requestNotFound': 'لم يعد طلب العضوية متاحًا.'
            , 'memberPortal.subscription.errors.requestAlreadyReviewed': 'تمت مراجعة هذا الطلب بالفعل. حدّث السجل.'
            , 'memberPortal.subscription.errors.portalSessionMemberInvalid': 'تعذر التحقق من جلسة العضو. أعد إدخال كود العضوية.'
            , 'memberPortal.subscription.errors.membershipSelectionRequired': 'اختر الباقة ونوع العضوية.'
            , 'memberPortal.subscription.errors.paymentMethodRequired': 'اختر وسيلة الدفع.'
            , 'memberPortal.subscription.errors.paymentDateRequired': 'أدخل تاريخ التحصيل الفعلي.'
            , 'memberPortal.subscription.errors.paymentDateInFuture': 'لا يمكن أن يكون تاريخ التحصيل في المستقبل.'
            , 'memberPortal.subscription.errors.invalidPaymentProofSubmission': 'بيانات إثبات الدفع غير صالحة. اختر الملف مرة أخرى.'
            , 'memberPortal.subscription.errors.requestTypeUnsupported': 'نوع طلب العضوية غير مدعوم.'
            , 'memberPortal.subscription.errors.reviewNotesRequired': 'أضف ملاحظة توضح طلبك.'
            , 'memberPortal.subscription.errors.paymentProofUnavailable': 'إثبات الدفع غير متاح حاليًا.'
            , 'memberPortal.subscription.errors.paymentProofIntegrityFailed': 'تعذر التحقق من سلامة إثبات الدفع.'
            , 'memberPortal.subscription.errors.renewalRequiresExisting': 'يتطلب التمديد أو التجديد وجود عضوية سابقة.'
            , 'memberPortal.subscription.errors.membershipFreezeActive': 'لا يمكن تمديد العضوية أثناء تجميدها. استأنفها أولًا.'
            , 'memberPortal.subscription.errors.membershipStartOverlapsCurrent': 'عدّل تاريخ البداية لتجنب تداخل العضويات.'
            , 'memberPortal.subscription.errors.membershipCurrentDatesInvalid': 'تعذر التحقق من تواريخ العضوية الحالية.'
            , 'memberPortal.subscription.errors.membershipRenewalSnapshotInvalid': 'تعذر التحقق من مدة العضوية المطلوبة.'
            , 'memberPortal.subscription.activationTitle': 'تم تفعيل اشتراكك'
            , 'memberPortal.subscription.readyToTrain': 'جاهز للتمرين؟'
            , 'memberPortal.subscription.membershipActivated': 'أصبح اشتراكك جاهزًا للتمرين.'
            , 'memberPortal.report.memberPortal': 'سجل العضوية'
            , 'memberPortal.report.memberName': 'ملف العميل: {{name}} · تاريخ الإصدار: {{date}}'
            , 'memberPortal.report.number': 'رقم التقرير: {{number}} · تاريخ الإصدار: {{date}}'
            , 'memberPortal.report.issuedBy': 'صادر من إدارة'
            , 'memberPortal.report.phone': 'الهاتف'
            , 'memberPortal.report.email': 'البريد الإلكتروني'
            , 'memberPortal.report.membershipStatus': 'حالة العضوية'
            , 'memberPortal.report.membershipProfile': 'ملف العضوية'
            , 'memberPortal.report.membershipSummary': 'ملخص العضوية'
            , 'memberPortal.report.currentMembership': 'بيانات العضوية الحالية لهذا المشترك فقط'
            , 'memberPortal.report.plan': 'الباقة'
            , 'memberPortal.report.startDate': 'تاريخ البداية'
            , 'memberPortal.report.currentStart': 'بداية الاشتراك الحالي'
            , 'memberPortal.report.endDate': 'تاريخ الانتهاء'
            , 'memberPortal.report.firstJoined': 'أول انضمام'
            , 'memberPortal.report.profileStart': 'تاريخ بداية الملف'
            , 'memberPortal.report.remaining': 'متبقي'
            , 'memberPortal.report.expired': 'منتهية'
            , 'memberPortal.report.visitsFinance': 'ملخص الزيارات والحساب'
            , 'memberPortal.report.totalVisits': 'إجمالي الزيارات'
            , 'memberPortal.report.fullAttendance': 'سجل حضور كامل'
            , 'memberPortal.report.totalDue': 'إجمالي المستحق'
            , 'memberPortal.report.membershipValue': 'قيمة الاشتراكات'
            , 'memberPortal.report.totalPaid': 'إجمالي المدفوع'
            , 'memberPortal.report.paidToDate': 'المدفوع حتى الآن'
            , 'memberPortal.report.remainingAmount': 'المبلغ المتبقي'
            , 'memberPortal.report.currentBalance': 'الرصيد الحالي'
            , 'memberPortal.report.memberships': 'الاشتراكات والتجديدات'
            , 'memberPortal.report.period': 'الفترة'
            , 'memberPortal.report.status': 'الحالة'
            , 'memberPortal.report.account': 'الحساب'
            , 'memberPortal.report.noMemberships': 'لا توجد اشتراكات مسجلة.'
            , 'memberPortal.report.payments': 'سجل المدفوعات والإيصالات'
            , 'memberPortal.report.receipt': 'الإيصال'
            , 'memberPortal.report.date': 'التاريخ'
            , 'memberPortal.report.operation': 'العملية'
            , 'memberPortal.report.paid': 'المدفوع'
            , 'memberPortal.report.due': 'المتبقي'
            , 'memberPortal.report.paymentMethod': 'طريقة الدفع'
            , 'memberPortal.report.noPayments': 'لا توجد مدفوعات مسجلة.'
            , 'memberPortal.report.attendance': 'سجل الحضور والزيارات'
            , 'memberPortal.report.checkIn': 'الحضور'
            , 'memberPortal.report.checkOut': 'الانصراف'
            , 'memberPortal.report.duration': 'المدة'
            , 'memberPortal.report.noVisits': 'لا توجد زيارات مسجلة.'
            , 'memberPortal.report.freezes': 'حالات التجميد أو الإيقاف'
            , 'memberPortal.report.start': 'البداية'
            , 'memberPortal.report.end': 'النهاية'
            , 'memberPortal.report.resumed': 'الاستئناف'
            , 'memberPortal.report.continues': 'مستمر'
            , 'memberPortal.report.days': 'يوم'
            , 'memberPortal.report.noFreezes': 'لا توجد حالات تجميد.'
            , 'memberPortal.report.noRecords': 'لا توجد سجلات'
            , 'memberPortal.report.recordSingular': 'سجل'
            , 'memberPortal.report.recordPlural': 'سجلات'
            , 'memberPortal.report.planAndDuration': 'الباقة والمدة'
            , 'memberPortal.report.until': 'حتى {{date}}'
            , 'memberPortal.report.paidValue': 'مدفوع {{amount}}'
            , 'memberPortal.report.remainingValue': 'متبقي {{amount}}'
            , 'memberPortal.report.insideGym': 'داخل {{gym}}'
            , 'memberPortal.report.minutes': '{{count}} دقيقة'
            , 'memberPortal.report.daysCount': '{{count}} يوم'
            , 'memberPortal.report.daysRemaining': '{{count}} يوم متبقي'
            , 'memberPortal.data.plan.gymOnly': 'جيم فقط'
            , 'memberPortal.data.plan.gymCardio': 'جيم وكارديو'
            , 'memberPortal.data.type.monthly': 'شهرية'
            , 'memberPortal.data.type.halfMonth': 'نصف شهر'
            , 'memberPortal.data.type.quarterly': 'ربع سنوية'
            , 'memberPortal.data.type.semiannual': 'نصف سنوية'
            , 'memberPortal.data.type.annual': 'سنوية'
            , 'memberPortal.data.status.active': 'نشطة'
            , 'memberPortal.data.status.expiring': 'قريبة الانتهاء'
            , 'memberPortal.data.status.expired': 'منتهية'
            , 'memberPortal.data.status.frozen': 'مجمدة'
            , 'memberPortal.data.status.none': 'بدون حالة'
            , 'memberPortal.data.payment.cash': 'نقدي'
            , 'memberPortal.data.payment.card': 'بطاقة'
            , 'memberPortal.data.payment.transfer': 'تحويل'
            , 'memberPortal.data.payment.other': 'أخرى'
            , 'memberPortal.data.transaction.subscription': 'اشتراك'
            , 'memberPortal.data.transaction.adjustment': 'تسوية'
            , 'memberPortal.data.transaction.payment': 'دفعة'
            , 'memberPortal.footer': 'إدارة أذكى، أداء أفضل.'
            , 'store.inventory.minimum': 'الحد الأدنى'
            , 'store.inventory.expiry': 'الصلاحية'
            , 'store.inventory.low': 'مخزون منخفض'
            , 'store.inventory.available': 'متاح'
            , 'store.inventory.adjust': 'تسوية'
            , 'store.inventory.empty': 'لا توجد حركات أو أصناف مخزنية بعد.'
            , 'store.purchases.title': 'المشتريات والاستلام'
            , 'store.purchases.description': 'استلام الكميات يحدث الرصيد وسجل الحركة داخل معاملة واحدة.'
            , 'store.purchases.add': 'إضافة فاتورة شراء'
            , 'store.purchases.supplier': 'المورد'
            , 'store.purchases.noneSupplier': 'بدون مورد'
            , 'store.purchases.invoiceNumber': 'رقم الفاتورة'
            , 'store.purchases.date': 'التاريخ'
            , 'store.purchases.variant': 'المنتج/النسخة'
            , 'store.purchases.quantity': 'الكمية'
            , 'store.purchases.unitCost': 'تكلفة الوحدة'
            , 'store.purchases.receive': 'استلام الفاتورة'
            , 'store.purchases.empty': 'لا توجد مشتريات في الفترة الحالية.'
            , 'store.sales.title': 'سجل المبيعات'
            , 'store.sales.description': 'الفواتير والمدفوعات والمرتجعات.'
            , 'store.sales.cashCustomer': 'عميل نقدي'
            , 'store.sales.empty': 'لا توجد مبيعات في الفترة الحالية.'
            , 'store.suppliers.description': 'بيانات الموردين المستخدمة في فواتير الشراء.'
            , 'store.suppliers.add': 'إضافة مورد'
            , 'store.suppliers.name': 'اسم المورد'
            , 'store.suppliers.phone': 'الهاتف'
            , 'store.suppliers.email': 'البريد'
            , 'store.suppliers.address': 'العنوان'
            , 'store.suppliers.empty': 'لا يوجد موردون بعد.'
            , 'store.expenses.description': 'مصروفات منفصلة عن التشغيل مع ظهورها في الربحية والتقارير.'
            , 'store.expenses.add': 'إضافة مصروف'
            , 'store.expenses.name': 'اسم المصروف'
            , 'store.expenses.category': 'التصنيف'
            , 'store.expenses.categoryPlaceholder': 'شحن، تغليف...'
            , 'store.expenses.amount': 'المبلغ'
            , 'store.expenses.notes': 'ملاحظات'
            , 'store.expenses.empty': 'لا توجد مصروفات للمتجر في الفترة الحالية.'
            , 'store.reports.description': 'المبيعات، الأصناف الأكثر مبيعًا، والمخزون والربحية حسب الصلاحية.'
            , 'store.reports.from': 'من'
            , 'store.reports.to': 'إلى'
            , 'store.reports.type': 'نوع التقرير'
            , 'store.reports.run': 'عرض التقرير'
            , 'store.reports.choosePeriod': 'اختر الفترة ثم اعرض التقرير.'
            , 'store.reports.noResults': 'لا توجد نتائج في الفترة المحددة.'
            , 'store.reports.noExpensePermission': 'لا تملك صلاحية عرض مصروفات المتجر.'
            , 'store.bar.title': 'نقطة بيع البار'
            , 'store.bar.description': 'نقطة بيع سريعة للطلبات الجاهزة والوصفات مع مخزون الفرع.'
            , 'store.bar.search': 'بحث في قائمة البار'
            , 'store.bar.searchPlaceholder': 'ابحث عن مشروب أو صنف...'
            , 'store.bar.loadingMenu': 'جارٍ تحميل قائمة البار...'
            , 'store.bar.order': 'الطلب الحالي'
            , 'store.bar.emptyOrder': 'أضف صنفًا إلى الطلب.'
            , 'store.bar.memberOptional': 'العضو (اختياري)'
            , 'store.bar.memberNumber': 'رقم العضو'
            , 'store.bar.checkout': 'تحصيل الطلب'
            , 'store.common.noResults': 'لا توجد نتائج.'
            , 'store.common.noPhone': 'بدون هاتف'
            , 'store.common.removeCustomer': 'إزالة العميل'
            , 'store.common.reduceQuantity': 'تقليل الكمية'
            , 'store.common.increaseQuantity': 'زيادة الكمية'
            , 'store.common.deleteItem': 'حذف {{name}}'
            , 'store.common.itemCount': '{{count}} أصناف'
            , 'store.common.noData': 'لا توجد بيانات.'
            , 'store.success.sale': 'تم تسجيل البيع بنجاح.'
            , 'store.error.load': 'تعذر تحميل بيانات المتجر.'
            , 'store.error.salePermission': 'لا تملك صلاحية إنشاء مبيعات المتجر.'
            , 'store.error.sale': 'تعذر إتمام البيع.'
            , 'store.error.customerSearch': 'تعذر البحث عن العميل.'
            , 'store.confirm.deactivateProduct': 'هل تريد تعطيل هذا المنتج؟'
            , 'store.confirm.deleteExpense': 'هل تريد حذف هذا المصروف؟'
            , 'store.prompt.adjustQuantity': 'أدخل الكمية الموجبة للتسوية:'
            , 'store.success.productDeactivated': 'تم تعطيل المنتج.'
            , 'store.success.expenseDeleted': 'تم حذف المصروف.'
            , 'store.success.inventoryAdjusted': 'تمت تسوية المخزون.'
            , 'store.error.supplierPhone': 'رقم هاتف المورد غير صحيح.'
            , 'store.receipt.number': 'إيصال مبيعات: {{number}}'
            , 'store.receipt.thanks': 'شكرًا لزيارتكم'
            , 'store.common.storeArea': 'إدارة المتجر'
            , 'store.page.title': 'المتجر والمبيعات والمخزون'
            , 'store.page.description': 'بيع سريع، مخزون قابل للتتبع، وتقارير واضحة في مكان واحد.'
            , 'store.page.refresh': 'تحديث البيانات'
            , 'store.page.navigation': 'أقسام المتجر'
            , 'store.bar.eyebrow': 'البار'
            , 'store.bar.location': 'موقع البيع'
            , 'store.bar.setupRequired': 'فعّل Bar وأنشئ موقع بيع لهذا الفرع من إعدادات الفروع.'
            , 'store.bar.openingCash': 'رصيد بداية الوردية'
            , 'store.bar.openShiftAction': 'فتح وردية Bar'
            , 'store.bar.searchAccessible': 'بحث في قائمة Bar'
            , 'store.bar.emptyMenu': 'لا توجد أصناف Bar متاحة في هذا الموقع.'
            , 'store.bar.activeBranchRequired': 'لا يوجد فرع نشط لتشغيل Bar.'
            , 'store.bar.shiftOpenCurrent': 'الوردية مفتوحة · موقع البيع الحالي'
            , 'store.bar.shiftLocationMismatch': 'الوردية مفتوحة · تحقق من موقع الوردية'
            , 'store.bar.noOpenShift': 'لا توجد وردية مفتوحة. افتح وردية قبل التحصيل.'
            , 'store.bar.shiftOpened': 'تم فتح وردية Bar. يمكنك بدء البيع الآن.'
            , 'store.bar.openShiftError': 'تعذر فتح الوردية.'
            , 'store.bar.checkoutSuccess': 'تم تحصيل طلب Bar بنجاح.'
            , 'store.bar.checkoutError': 'تعذر تحصيل طلب Bar.'
            , 'store.bar.loadError': 'تعذر تحميل تشغيل Bar.'
            , 'store.bar.refreshError': 'تعذر تحديث قائمة البار.'
            , 'store.bar.recipe': 'وصفة'
            , 'store.common.unavailable': 'غير متاح'
            , 'store.common.search': 'بحث'
            , 'store.common.status': 'الحالة'
            , 'store.common.action': 'الإجراء'
            , 'store.common.invoice': 'الفاتورة'
            , 'store.common.customer': 'العميل'
            , 'store.common.phone': 'الهاتف'
            , 'store.common.date': 'التاريخ'
            , 'store.common.amount': 'المبلغ'
            , 'store.common.total': 'الإجمالي'
            , 'store.common.paid': 'المدفوع'
            , 'store.common.remaining': 'المتبقي'
            , 'store.common.category': 'التصنيف'
            , 'store.common.revenue': 'الإيراد'
            , 'store.common.orders': 'الفواتير'
            , 'store.common.refunds': 'المرتجعات'
            , 'store.common.cost': 'التكلفة'
            , 'store.inventory.description': 'الرصيد الحالي والتنبيهات وحركات التسوية.'
            , 'store.purchases.title': 'المشتريات والاستلام'
            , 'store.purchases.description': 'استلام الكميات يحدث الرصيد وسجل الحركة داخل معاملة واحدة.'
            , 'store.sales.title': 'سجل المبيعات'
            , 'store.sales.description': 'الفواتير والمدفوعات والمرتجعات.'
            , 'store.suppliers.description': 'بيانات الموردين المستخدمة في فواتير الشراء.'
            , 'store.expenses.description': 'مصروفات منفصلة عن التشغيل مع ظهورها في الربحية والتقارير.'
            , 'store.expenses.category': 'التصنيف'
            , 'store.reports.mode.products': 'حسب المنتج'
            , 'store.reports.mode.categories': 'حسب التصنيف'
            , 'store.reports.mode.customers': 'حسب العميل'
            , 'store.reports.mode.payments': 'طرق الدفع'
            , 'store.reports.mode.daily': 'المبيعات اليومية'
            , 'store.reports.mode.purchases': 'المشتريات'
            , 'store.reports.mode.inventory': 'المخزون'
            , 'store.reports.mode.returns': 'المرتجعات'
            , 'store.reports.mode.expenses': 'مصروفات المتجر'
            , 'store.report.product': 'المنتج'
            , 'store.report.variant': 'النسخة'
            , 'store.report.sku': 'SKU'
            , 'store.report.quantity': 'الكمية'
            , 'store.report.revenue': 'الإيراد'
            , 'store.report.cost': 'التكلفة'
            , 'store.report.customer': 'العميل'
            , 'store.report.phone': 'الهاتف'
            , 'store.report.invoiceCount': 'الفواتير'
            , 'store.report.value': 'القيمة'
            , 'store.report.day': 'اليوم'
            , 'store.report.supplier': 'المورد'
            , 'store.report.expense': 'المصروف'
            , 'store.report.paymentMethod': 'طريقة الدفع'
            , 'store.report.refundMethod': 'طريقة الاسترداد'
            , 'store.report.reason': 'السبب'
            , 'store.report.expiry': 'الصلاحية'
            , 'store.products.noProductsAfter': 'لا توجد منتجات بعد.'
            , 'store.common.noResultsPeriod': 'لا توجد نتائج في الفترة المحددة.'
            , 'store.products.confirmDeactivate': 'هل تريد تعطيل هذا المنتج؟'
            , 'store.expenses.confirmDelete': 'هل تريد حذف هذا المصروف؟'
            , 'store.error.noSalesPermission': 'لا تملك صلاحية إنشاء مبيعات المتجر.'
            , 'store.error.storeLoad': 'تعذر تحميل بيانات المتجر.'
            , 'store.error.saleComplete': 'تعذر إتمام البيع.'
            , 'store.error.customerLookup': 'تعذر البحث عن العميل.'
            , 'store.success.saleRecorded': 'تم تسجيل البيع بنجاح.'
            , 'store.success.productDisabled': 'تم تعطيل المنتج.'
            , 'store.success.expenseRemoved': 'تم حذف المصروف.'
            , 'store.success.inventoryAdjusted': 'تمت تسوية المخزون.'
            , 'store.error.invalidSupplierPhone': 'رقم هاتف المورد غير صحيح.'
            , 'store.receipt.saleNumber': 'إيصال مبيعات: {{number}}'
            , 'store.pos.receiptThanks': 'شكرًا لزيارتكم'
            , 'attendance.kicker': 'تشغيل يومي'
            , 'members.title': 'المشتركون'
            , 'members.form.add.title': 'إضافة عضو جديد'
            , 'members.form.edit.title': 'تعديل بيانات العضو'
            , 'members.form.add.description': 'أدخل بيانات العضو الأساسية ثم أكمل التفاصيل الاختيارية'
            , 'members.form.profile': 'بيانات العضو'
            , 'members.form.profileDescription': 'المعلومات الأساسية للتواصل والتسجيل'
            , 'members.form.fullName': 'الاسم الكامل *'
            , 'members.form.phone': 'رقم الهاتف *'
            , 'members.form.email': 'البريد الإلكتروني'
            , 'members.form.memberNotes': 'ملاحظات العضو'
            , 'members.form.registrationDate': 'تاريخ التسجيل'
            , 'members.form.branch': 'الفرع'
            , 'members.form.section': 'القسم'
            , 'members.form.membershipType': 'نوع العضوية'
            , 'members.form.plan': 'الباقة'
            , 'members.form.startDate': 'تاريخ البداية'
            , 'members.form.endDate': 'تاريخ الانتهاء'
            , 'members.form.membershipNotes': 'ملاحظات الاشتراك'
            , 'members.form.amountDue': 'المستحق بعد الخصم'
            , 'members.form.discount': 'الخصم'
            , 'members.form.amountPaid': 'المبلغ المدفوع'
            , 'members.form.paymentDate': 'تاريخ الدفع'
            , 'members.form.paymentMethod': 'طريقة الدفع'
            , 'members.form.save': 'حفظ العضو'
            , 'members.form.saveEdit': 'حفظ التعديلات'
            , 'members.form.cancel': 'إلغاء'
            , 'members.form.clear': 'تفريغ'
            , 'members.details.emptyLoading': 'جاري تحميل التفاصيل…'
            , 'members.details.financialBalance': 'الرصيد المالي'
            , 'members.details.subscriptionHistory': 'سجل الاشتراكات والتجديدات'
            , 'members.details.access': 'تفاصيل الوصول'
            , 'members.details.todayAttendance': 'حضور اليوم'
            , 'members.details.portalCode': 'كود بوابة المشترك'
            , 'members.details.events': 'سجل كل العمليات'
            , 'members.details.financialHistory': 'السجل المالي والإيصالات'
            , 'members.details.storePurchases': 'مشتريات المتجر'
            , 'members.details.trainingNutrition': 'التدريب والتغذية'
            , 'members.details.close': 'إغلاق'
            , 'members.details.closeAccessible': 'إغلاق تفاصيل العضو'
            , 'members.profile.badge.member': 'عضو'
            , 'members.status.activeBadge': 'نشط'
            , 'members.status.expiringSoonBadge': 'تنتهي قريبًا'
            , 'members.status.frozenBadge': 'مجمّدة'
            , 'members.status.expiredBadge': 'منتهية'
            , 'members.status.cancelledBadge': 'ملغاة'
            , 'members.subtitle': 'إدارة أعضاء النادي والاشتراكات والحضور والتجديد'
            , 'members.add': 'إضافة مشترك'
            , 'members.pricing': 'أسعار الباقات'
            , 'members.types': 'أنواع العضويات'
            , 'members.toolbar.aria': 'البحث وتصفية المشتركين'
            , 'members.toolbar.title': 'بحث المشتركين'
            , 'members.toolbar.description': 'الوصول السريع إلى بيانات الاسم أو الهاتف'
            , 'members.search.label': 'البحث بالاسم أو الهاتف أو كود العضوية'
            , 'members.search.placeholder': 'ابحث بالاسم أو رقم الهاتف أو كود العضوية'
            , 'members.search.clear': 'مسح بحث المشتركين'
            , 'members.filter.status': 'حالة الاشتراك'
            , 'members.filter.statusAria': 'فلتر الحالة'
            , 'members.filter.all': 'كل الحالات'
            , 'members.filter.active': 'نشطة'
            , 'members.filter.expiringSoon': 'قريبة الانتهاء'
            , 'members.filter.expired': 'منتهية'
            , 'members.filter.frozen': 'مجمدة'
            , 'members.filter.sort': 'ترتيب النتائج'
            , 'members.filter.sortAria': 'ترتيب القائمة'
            , 'members.filter.expiry': 'الأقرب انتهاءً'
            , 'members.filter.newest': 'الأحدث تسجيلًا'
            , 'members.filter.remaining': 'الأعلى مبلغًا متبقيًا'
            , 'members.filter.disclosure': 'الفلاتر والترتيب'
            , 'members.filter.clear': 'مسح الفلاتر'
            , 'members.filter.dialogTitle': 'فلترة المشتركين'
            , 'members.filter.dialogDescription': 'ضيّق النتائج حسب الحالة أو ترتيب الانتهاء.'
            , 'members.filter.close': 'إغلاق الفلاتر'
            , 'members.filter.apply': 'تطبيق الفلاتر'
            , 'members.count': '{{count}} مشترك'
            , 'members.summary.aria': 'ملخص المشتركين'
            , 'members.summary.total': 'إجمالي المشتركين'
            , 'members.summary.active': 'اشتراكات نشطة'
            , 'members.summary.expiringSoon': 'تنتهي قريبًا'
            , 'members.summary.expired': 'اشتراكات منتهية'
            , 'members.table.member': 'العضو'
            , 'members.table.subscription': 'الاشتراك'
            , 'members.table.status': 'الحالة'
            , 'members.table.expiry': 'الانتهاء'
            , 'members.table.freeze': 'التجميد'
            , 'members.table.account': 'الحساب'
            , 'members.table.actions': 'الإجراءات'
            , 'members.card.subscription': 'الاشتراك'
            , 'members.card.expiry': 'الانتهاء'
            , 'members.card.balance': 'المتبقي من الحساب'
            , 'members.balance.remaining': 'المتبقي {{amount}}'
            , 'members.phone.missing': 'لا يوجد رقم هاتف'
            , 'members.noMembership': 'بدون اشتراك'
            , 'members.loading': 'جارٍ تحميل المشتركين…'
            , 'members.registration': 'تسجيل: {{date}}'
            , 'members.remaining.days': '{{count}} يوم متبقي'
            , 'members.remaining.expired': 'منتهية منذ {{count}} يوم'
            , 'members.remaining.frozenUntil': 'تجميد حتى {{date}}'
            , 'members.freeze.remaining': 'متبقي {{count}}'
            , 'members.portalCode': 'كود البوابة: {{code}}'
            , 'members.portalCode.unissued': 'غير مُصدر'
            , 'members.empty.title': 'لا يوجد مشتركون مطابقون'
            , 'members.empty.description': 'جرّب تعديل البحث أو إزالة بعض الفلاتر لعرض النتائج.'
            , 'members.empty.clear': 'مسح الفلاتر'
            , 'members.status.active': 'نشطة'
            , 'members.status.expiringSoon': 'قريبة الانتهاء'
            , 'members.status.expired': 'منتهية'
            , 'members.status.frozen': 'مجمدة'
            , 'members.status.cancelled': 'ملغاة'
            , 'members.action.details': 'التفاصيل'
            , 'members.action.mobileDetails': 'عرض'
            , 'members.action.edit': 'تعديل العضو'
            , 'members.action.renew': 'تجديد الاشتراك'
            , 'members.action.mobileRenew': 'تجديد'
            , 'members.action.freeze': 'تجميد العضوية'
            , 'members.action.resume': 'استئناف العضوية'
            , 'members.action.payment': 'تسجيل دفعة'
            , 'members.action.print': 'طباعة الاشتراك'
            , 'members.action.qr': 'عرض QR Code'
            , 'members.action.delete': 'حذف العضو'
            , 'members.action.refund': 'استرجاع الاشتراك'
            , 'members.pagination.range': 'عرض {{first}}–{{last}} من {{total}}'
            , 'members.pagination.first': 'أول صفحة'
            , 'members.pagination.previous': 'الصفحة السابقة'
            , 'members.pagination.next': 'الصفحة التالية'
            , 'members.pagination.last': 'آخر صفحة'
            , 'members.pagination.page': 'صفحة {{page}}'
            , 'members.pagination.mobilePrevious': 'السابق'
            , 'members.pagination.mobileNext': 'التالي'
            , 'members.pagination.pageSize': 'لكل صفحة'
            , 'members.pagination.pageSizeAria': 'عدد النتائج في الصفحة'
            , 'members.pagination.pages': 'صفحات المشتركين'
            , 'attendance.title': 'الحضور والانصراف'
            , 'attendance.description': 'تسجيل دخول وخروج الأعضاء ومتابعة حركة اليوم.'
            , 'attendance.today': 'اليوم'
            , 'attendance.kiosk': 'وضع Kiosk'
            , 'attendance.reportsHint': 'التقارير التفصيلية متاحة داخل تبويب التقارير.'
            , 'attendance.workspace.title': 'تسجيل حضور عضو'
            , 'attendance.workspace.description': 'ابحث برقم الهاتف أو استخدم QR Code للتعرف على العضو.'
            , 'attendance.mode.aria': 'طريقة التسجيل'
            , 'attendance.mode.phone': 'بالهاتف'
            , 'attendance.mode.qr': 'QR Code'
            , 'attendance.phone.label': 'رقم الهاتف'
            , 'attendance.phone.placeholder': '01015819700'
            , 'attendance.phone.help': 'أدخل الرقم بدون مفتاح الدولة.'
            , 'attendance.phone.search': 'بحث عن العضو'
            , 'attendance.policy': 'يُسمح بالحضور للعضوية السارية وغير المجمدة مرة واحدة يوميًا. يُغلق الحضور المفتوح تلقائيًا بعد ساعة.'
            , 'attendance.member.heading': 'بيانات العضو'
            , 'attendance.member.hint': 'تظهر بعد العثور على الرقم'
            , 'attendance.member.waiting': 'بانتظار رقم العضو'
            , 'attendance.member.waitingHint': 'أدخل رقم الهاتف لعرض الحالة ووقت الدخول.'
            , 'attendance.action.aria': 'إجراء الحضور'
            , 'attendance.action.checkIn': 'تسجيل حضور'
            , 'attendance.action.checkOut': 'تسجيل انصراف'
            , 'attendance.action.noCheckInPermission': 'لا تملك صلاحية تسجيل الحضور'
            , 'attendance.action.noCheckOutPermission': 'لا تملك صلاحية تسجيل الانصراف'
            , 'attendance.summary.total': 'إجمالي حضور اليوم'
            , 'attendance.summary.aria': 'ملخص الحضور'
            , 'attendance.summary.inside': 'داخل الجيم الآن'
            , 'attendance.summary.checkedOut': 'انصرفوا اليوم'
            , 'attendance.log.title': 'سجل اليوم'
            , 'attendance.log.loading': 'جارٍ تحميل سجل الحضور…'
            , 'attendance.log.search.label': 'بحث في حضور اليوم بالاسم أو الهاتف'
            , 'attendance.log.search.placeholder': 'ابحث بالاسم أو رقم الهاتف'
            , 'attendance.log.search.clear': 'مسح بحث حضور اليوم'
            , 'attendance.log.filter.label': 'فلترة حالة الحضور'
            , 'attendance.log.filter.all': 'كل الحالات'
            , 'attendance.log.filter.inside': 'داخل الجيم'
            , 'attendance.log.filter.checkedOut': 'تم الانصراف'
            , 'attendance.log.refresh': 'تحديث'
            , 'attendance.table.member': 'العضو'
            , 'attendance.table.phone': 'الهاتف'
            , 'attendance.table.checkIn': 'وقت الدخول'
            , 'attendance.table.checkOut': 'وقت الخروج'
            , 'attendance.table.duration': 'المدة'
            , 'attendance.table.status': 'الحالة'
            , 'attendance.table.action': 'الإجراء'
            , 'attendance.log.count': '{{count}} سجل حضور في {{date}}'
            , 'attendance.log.filteredCount': '{{count}} من {{total}} سجل في {{date}}'
            , 'attendance.log.emptyFiltered': 'لا توجد سجلات مطابقة للفلاتر الحالية.'
            , 'attendance.log.empty': 'لا توجد سجلات حضور اليوم حتى الآن.'
            , 'attendance.log.refreshing': 'جارٍ تحديث سجل الحضور…'
            , 'attendance.duration.minutes': 'دقيقة'
            , 'attendance.status.inside': 'داخل الجيم'
            , 'attendance.status.checkedOut': 'انصرف'
            , 'attendance.status.autoCheckedOut': 'انصرف تلقائيًا'
            , 'attendance.status.checkedOutDone': 'تم الانصراف'
            , 'attendance.status.autoCheckedOutDone': 'انصراف تلقائي'
            , 'attendance.member.status.active': 'نشطة'
            , 'attendance.member.status.expiring': 'قريبة الانتهاء'
            , 'attendance.member.status.expired': 'منتهية'
            , 'attendance.member.status.frozen': 'مجمّدة'
            , 'attendance.member.status.none': 'بدون اشتراك فعال'
            , 'attendance.member.generic': 'العضو'
            , 'attendance.member.plan.gymOnly': 'جيم فقط'
            , 'attendance.member.plan.gymCardio': 'جيم وكارديو'
            , 'attendance.member.type.monthly': 'شهرية'
            , 'attendance.member.type.halfMonth': 'نصف شهر'
            , 'attendance.member.type.quarterly': 'ربع سنوية'
            , 'attendance.member.type.semiannual': 'نصف سنوية'
            , 'attendance.member.type.annual': 'سنوية'
            , 'attendance.member.attendance.inside': 'داخل الجيم الآن'
            , 'attendance.member.attendance.checkedOut': 'تم الانصراف اليوم'
            , 'attendance.member.attendance.notCheckedIn': 'لم يسجل حضور اليوم'
            , 'attendance.member.field.plan': 'الباقة'
            , 'attendance.member.field.type': 'النوع'
            , 'attendance.member.field.startDate': 'تاريخ البداية'
            , 'attendance.member.field.endDate': 'تاريخ الانتهاء'
            , 'attendance.member.field.remaining': 'المتبقي'
            , 'attendance.member.field.todayAttendance': 'الحضور اليوم'
            , 'attendance.member.field.membershipUntil': 'الاشتراك حتى'
            , 'attendance.member.currency': 'ج.م'
            , 'attendance.member.operation.checkIn': 'تسجيل الحضور'
            , 'attendance.member.operation.checkOut': 'تسجيل الانصراف'
            , 'attendance.member.operation.unavailable': 'الحضور غير متاح'
            , 'attendance.member.operation.confirm': 'تأكيد {{action}}'
            , 'attendance.member.operation.details': 'بيانات المشترك'
            , 'attendance.member.operation.close': 'إغلاق'
            , 'attendance.member.operation.cancel': 'إلغاء'
            , 'attendance.member.operation.inside': 'المشترك مسجل داخل الجيم حاليًا'
            , 'attendance.member.operation.valid': 'العضوية صالحة لتسجيل الحضور'
            , 'attendance.member.operation.blocked': 'لا يمكن تسجيل الحضور بهذه العضوية'
            , 'attendance.member.operation.ok': 'حسنًا'
            , 'attendance.member.operation.checkedOut': 'تم تسجيل الدخول والانصراف لهذا العضو اليوم.'
            , 'attendance.member.operation.frozen': 'الاشتراك مجمّد؛ لا يمكن تسجيل حضور.'
            , 'attendance.member.operation.expired': 'الاشتراك منتهٍ؛ لا يمكن تسجيل حضور.'
            , 'attendance.member.operation.noMembership': 'لا يوجد اشتراك فعال يسمح بتسجيل الحضور.'
            , 'attendance.member.operation.noCheckOutPermission': 'لا توجد صلاحية لتسجيل انصراف.'
            , 'attendance.member.operation.noCheckInPermission': 'لا توجد صلاحية لتسجيل حضور.'
            , 'attendance.preview.searching': 'جارٍ البحث عن بيانات المشترك…'
            , 'attendance.preview.notFound': 'لم يتم العثور على مشترك بهذا الرقم.'
            , 'attendance.preview.loadError': 'تعذر تحميل بيانات المشترك. جرّب مرة أخرى.'
            , 'attendance.preview.invalidPhone': 'أدخل رقم هاتف صالحًا للبحث عن العضو.'
            , 'attendance.action.enterPhoneOrScan': 'أدخل رقم الهاتف أو امسح QR Code أولاً.'
            , 'attendance.action.invalidPhone': 'أدخل رقم هاتف صحيحًا.'
            , 'attendance.permission.checkIn': 'لا تملك صلاحية تسجيل الحضور.'
            , 'attendance.permission.checkOut': 'لا تملك صلاحية تسجيل الانصراف.'
            , 'attendance.success.checkIn': 'تم تسجيل حضور {{name}} بنجاح'
            , 'attendance.success.checkOut': 'تم تسجيل انصراف {{name}}'
            , 'attendance.success.checkedIn': 'تم تسجيل الحضور بنجاح'
            , 'attendance.success.checkedOut': 'تم تسجيل الانصراف بنجاح'
            , 'attendance.qr.alreadyCheckedOutMember': 'تم تسجيل انصراف هذا العضو اليوم بالفعل.'
            , 'attendance.qr.alreadyCheckedOutSubscriber': 'تم تسجيل انصراف هذا المشترك اليوم بالفعل.'
            , 'attendance.qr.unavailable': 'أداة مسح QR Code غير متاحة حاليًا. استخدم رقم الهاتف.'
            , 'attendance.qr.cameraError': 'تعذر تشغيل الكاميرا. تأكد من السماح بالوصول للكاميرا أو استخدم رقم الهاتف.'
            , 'attendance.qr.cardUnavailable': 'أداة بطاقة العضوية غير جاهزة. لم يتم عرض رمز QR غير آمن؛ أعد تحميل الشاشة وحاول مرة أخرى.'
            , 'attendance.source.manual': 'يدوي'
            , 'attendance.source.auto': 'تلقائي'
            , 'attendance.error.request': 'تعذر تنفيذ عملية الحضور.'
            , 'branding.page.eyebrow': 'نظام الهوية · للمالك فقط', 'branding.page.title': 'تخصيص الهوية', 'branding.page.description': 'غيّر هوية المنصة من مكان واحد، راجعها مباشرة، ثم انشرها بأمان على كل الشاشات.'
            , 'branding.editor.aria': 'محرر الهوية', 'branding.editor.sections.aria': 'أقسام تخصيص الهوية'
            , 'branding.section.identity': 'الهوية الأساسية', 'branding.section.assets': 'الشعارات والأصول', 'branding.section.light': 'الوضع الفاتح', 'branding.section.dark': 'الوضع الداكن', 'branding.section.typography': 'الخطوط', 'branding.section.login': 'تسجيل الدخول', 'branding.section.interface': 'واجهة النظام', 'branding.section.documents': 'المستندات والبوابة'
            , 'branding.identity.description': 'النصوص الأساسية التي تظهر في الدخول والشريط العلوي والتقارير وبوابة المشترك.'
            , 'branding.identity.label.brand': 'اسم العلامة *', 'branding.identity.label.english': 'الاسم الإنجليزي', 'branding.identity.label.short': 'الاسم المختصر', 'branding.identity.label.company': 'اسم الشركة أو الجيم', 'branding.identity.label.description': 'وصف العلامة', 'branding.identity.label.welcomeTitle': 'عنوان الترحيب', 'branding.identity.label.welcomeSubtitle': 'وصف الترحيب', 'branding.identity.label.copyright': 'نص الحقوق'
            , 'branding.payments.eyebrow': 'إعدادات دفع الجيم', 'branding.payments.title': 'بيانات الدفع واستقبال التحويلات', 'branding.payments.description': 'أضف وسائل الدفع الخاصة بهذا الجيم فقط. ستظهر الوسائل النشطة للعضو داخل طلب الاشتراك أو التجديد.', 'branding.payments.add': 'إضافة وسيلة دفع', 'branding.payments.open': 'فتح شاشة وسائل الدفع', 'branding.payments.notice': 'لا تُستخدم هذه البيانات كإعدادات عامة للمنصة، ولا تظهر إلا بعد نشر الهوية وبحسب جيم العضو.', 'branding.identity.defaultsNote': 'الهوية الافتراضية الآمنة هي «Logic Fit». أي حقل متروك فارغًا يعود تلقائيًا إلى القيمة الافتراضية.'
            , 'branding.assets.description': 'ارفع SVG أو PNG أو WebP. تظل الأصول الجديدة مسودة حتى نشر الهوية.', 'branding.assets.limit': 'الحد الأقصى للأصل 2MB، مع فحص النوع والأبعاد ونسبة العرض إلى الارتفاع قبل الحفظ.'
            , 'branding.theme.light.description': 'ألوان مستقلة للوضع الفاتح، مع فحص تلقائي للتباين.', 'branding.theme.dark.description': 'درجات داكنة مستقلة، وليست عكسًا آليًا لألوان الوضع الفاتح.'
            , 'branding.typography.description': 'اختر خطًا عربيًا واضحًا مع حدود آمنة تمنع كسر التخطيط.', 'branding.typography.body': 'خط النصوص', 'branding.typography.heading': 'خط العناوين', 'branding.typography.size': 'حجم الخط الأساسي', 'branding.typography.weight': 'وزن العناوين', 'branding.typography.weight.medium': 'متوسط', 'branding.typography.weight.bold': 'عريض', 'branding.typography.weight.extraBold': 'عريض جدًا', 'branding.typography.fallback': 'سيتم تحميل الخط المختار عند الحاجة، مع بديل آمن إلى Cairo وTahoma.'
            , 'branding.login.description': 'خصص شاشة الدخول دون التأثير على أمان الجلسة أو النموذج.', 'branding.login.background': 'لون الخلفية', 'branding.login.gradientStart': 'بداية التدرج', 'branding.login.gradientEnd': 'نهاية التدرج', 'branding.login.overlay': 'قوة طبقة التعتيم', 'branding.login.showIllustration': 'إظهار الصورة أو التوضيح في شاشة الدخول', 'branding.login.showCopy': 'إظهار اسم العلامة ووصفها', 'branding.login.note': 'تُرفع صورة الخلفية الاختيارية من قسم الشعارات والأصول باسم خلفية تسجيل الدخول. تُستخدم الهوية الافتراضية عند عدم وجودها.'
            , 'branding.interface.description': 'تخصيص بصري محدود وآمن يحافظ على ترتيب التخطيط وتجربة الاستخدام.', 'branding.interface.radius': 'استدارة العناصر', 'branding.interface.cards': 'نمط البطاقات', 'branding.interface.shadows': 'الظلال', 'branding.interface.sidebar': 'نمط القائمة الجانبية', 'branding.interface.active': 'نمط العنصر النشط', 'branding.interface.shadow.none': 'بدون', 'branding.interface.shadow.soft': 'خفيفة', 'branding.interface.shadow.medium': 'متوسطة', 'branding.interface.note': 'تغيّر هذه الإعدادات المظهر فقط؛ ولا تسمح بتغيير الشبكة أو ترتيب الحقول بما يسبب تمريرًا أفقيًا.'
            , 'branding.documents.description': 'بيانات الاتصال والتذييل التي تظهر في الطباعة وPDF وبوابة المشترك.', 'branding.documents.phone': 'الهاتف', 'branding.documents.email': 'البريد الإلكتروني', 'branding.documents.address': 'العنوان', 'branding.documents.website': 'الموقع الإلكتروني', 'branding.documents.footer': 'تذييل المستندات والبوابة', 'branding.documents.watermark': 'علامة مائية', 'branding.documents.signature': 'التوقيع', 'branding.documents.stamp': 'الختم', 'branding.documents.note': 'تستخدم بوابة المشترك والطباعة الهوية المنشورة نفسها، مع الحفاظ على خلفية بيضاء مناسبة للمستندات الورقية.'
            , 'branding.preview.kicker': 'معاينة مباشرة', 'branding.preview.title': 'المعاينة المباشرة', 'branding.preview.description': 'تظل التغييرات مسودة حتى نشر الهوية.', 'branding.preview.theme.aria': 'سمة المعاينة', 'branding.preview.size.aria': 'حجم المعاينة'
            , 'branding.actions.discard': 'إلغاء التعديلات', 'branding.actions.reset': 'استعادة الافتراضي', 'branding.actions.save': 'حفظ كمسودة', 'branding.actions.publish': 'نشر الهوية', 'branding.actions.title.clean': 'لا توجد تغييرات غير محفوظة', 'branding.actions.title.dirty': 'لديك تغييرات غير محفوظة', 'branding.actions.title.pending': 'مسودة محفوظة ولم تُنشر', 'branding.actions.hint.dirty': 'راجع المعاينة، ثم انشر الهوية لتطبيقها على كامل المنصة.', 'branding.actions.hint.clean': 'التعديلات الحالية مطابقة للهوية المنشورة.'
            , 'branding.status.published': 'الهوية المنشورة: {{brand}}', 'branding.status.draft': 'مسودة محفوظة: {{brand}}', 'branding.status.changed': 'مسودة الهوية بها تغييرات جديدة', 'branding.status.savedAsset': 'تم رفع {{asset}} — احفظ المسودة لتثبيته', 'branding.status.removedAsset': 'تمت إزالة الأصل — احفظ المسودة أو انشر الهوية', 'branding.status.addedPayment': 'مسودة الهوية — تمت إضافة وسيلة دفع', 'branding.status.removedPayment': 'مسودة الهوية — تمت إزالة وسيلة دفع', 'branding.status.resetDraft': 'تمت استعادة «Logic Fit» كمسودة — انشرها لتطبيقها', 'branding.version.unpublished': 'لم تُنشر بعد'
            , 'branding.validation.ready.title': 'الهوية جاهزة للنشر', 'branding.validation.ready.body': 'تم فحص الاسم والتباين والقيم الأساسية بنجاح.', 'branding.validation.errors': 'يجب إصلاح {{count}} مشكلة قبل النشر', 'branding.validation.warnings': 'ملاحظات الوصول والوضوح', 'branding.validation.brandRequired': 'اسم العلامة التجارية مطلوب.', 'branding.validation.textContrast': 'تباين النص الأساسي في سمة {{theme}} أقل من WCAG AA.', 'branding.validation.primaryContrast': 'تباين نص الزر الأساسي في سمة {{theme}} غير كافٍ.', 'branding.validation.secondaryContrast': 'تباين النص الثانوي في سمة {{theme}} منخفض.', 'branding.theme.light.name': 'الوضع الفاتح', 'branding.theme.dark.name': 'الوضع الداكن'
            , 'branding.tokens.onPrimary': 'نص الزر الأساسي', 'branding.tokens.background': 'خلفية التطبيق', 'branding.tokens.surfaceSecondary': 'سطح ثانوي', 'branding.tokens.card': 'خلفية البطاقات', 'branding.tokens.cardHover': 'البطاقة عند المرور', 'branding.tokens.elevated': 'عنصر مرتفع', 'branding.tokens.sidebar': 'القائمة الجانبية', 'branding.tokens.header': 'الشريط العلوي', 'branding.tokens.textPrimary': 'النص الأساسي', 'branding.tokens.textSecondary': 'النص الثانوي', 'branding.tokens.textMuted': 'النص الهادئ', 'branding.tokens.textDisabled': 'النص المعطل', 'branding.tokens.border': 'الحدود الأساسية', 'branding.tokens.borderSecondary': 'الحدود الهادئة', 'branding.tokens.borderHover': 'الحد عند المرور', 'branding.tokens.inputBackground': 'خلفية الحقول', 'branding.tokens.tableHeader': 'رأس الجدول', 'branding.tokens.scrollbarTrack': 'مسار التمرير', 'branding.tokens.scrollbarThumb': 'مقبض التمرير'
            , 'branding.asset.primaryLogo': 'الشعار الأساسي', 'branding.asset.primaryLogo.hint': 'يظهر في الشريط العلوي والتقارير.', 'branding.asset.horizontalLogo': 'الشعار الأفقي', 'branding.asset.horizontalLogo.hint': 'نسخة كاملة لشاشة الدخول والمستندات.', 'branding.asset.lightLogo': 'الشعار للخلفية الداكنة', 'branding.asset.lightLogo.hint': 'نسخة فاتحة للاستخدام فوق الأسطح الداكنة.', 'branding.asset.darkLogo': 'الشعار للخلفية الفاتحة', 'branding.asset.darkLogo.hint': 'نسخة داكنة للاستخدام فوق الأسطح الفاتحة.', 'branding.asset.compactLogo': 'الشعار المختصر', 'branding.asset.compactLogo.hint': 'للشريط الجانبي المغلق والأحجام الصغيرة.', 'branding.asset.favicon': 'أيقونة الموقع', 'branding.asset.favicon.hint': 'أيقونة علامة تبويب المتصفح.', 'branding.asset.appIcon': 'أيقونة التطبيق', 'branding.asset.appIcon.hint': 'أيقونة التطبيق عند تثبيته.', 'branding.asset.loginBackground': 'خلفية تسجيل الدخول', 'branding.asset.loginBackground.hint': 'صورة اختيارية لخلفية شاشة الدخول.', 'branding.asset.loginIllustration': 'توضيح شاشة الدخول', 'branding.asset.loginIllustration.hint': 'صورة اختيارية بجانب نموذج الدخول.', 'branding.asset.defaultAvatar': 'الصورة الافتراضية', 'branding.asset.defaultAvatar.hint': 'صورة بديلة للمشترك عند عدم وجود صورة.', 'branding.asset.printLogo': 'شعار الطباعة', 'branding.asset.printLogo.hint': 'نسخة واضحة للمستندات وملفات PDF.', 'branding.asset.watermark': 'علامة مائية', 'branding.asset.watermark.hint': 'علامة مائية اختيارية للمستندات.', 'branding.asset.upload': 'رفع أو استبدال', 'branding.asset.remove': 'إزالة', 'branding.asset.defaultActive': 'يستخدم الأصل الافتراضي حاليًا', 'branding.asset.uploaded': 'تم الرفع'
            , 'branding.payment.empty.title': 'لا توجد وسائل دفع مضافة', 'branding.payment.empty.body': 'أضف وسيلة دفع ليتمكن العضو من معرفة بيانات التحويل الخاصة بهذا الجيم.', 'branding.payment.method': 'وسيلة دفع {{count}}', 'branding.payment.remove': 'إزالة', 'branding.payment.name': 'اسم الوسيلة', 'branding.payment.reference': 'الرقم أو الحساب', 'branding.payment.recipient': 'اسم المستلم', 'branding.payment.sortOrder': 'ترتيب الظهور', 'branding.payment.instructions': 'تعليمات الدفع', 'branding.payment.instructions.placeholder': 'تعليمات مختصرة للعضو', 'branding.payment.active': 'عرض هذه الوسيلة للعضو'
            , 'branding.audit.saved': 'حفظ مسودة', 'branding.audit.published': 'نشر الهوية', 'branding.audit.reset': 'استعادة الافتراضي', 'branding.audit.uploaded': 'رفع أصل', 'branding.audit.removed': 'إزالة أصل', 'branding.audit.operation': 'عملية', 'branding.audit.account': 'حساب #{{id}}', 'branding.audit.system': 'النظام', 'branding.audit.version': 'الإصدار {{version}}', 'branding.audit.empty': 'لا توجد عمليات مسجلة بعد.'
            , 'branding.error.operation': 'تعذر تنفيذ العملية.', 'branding.error.retry': 'حاول مرة أخرى.', 'branding.error.load': 'تعذر تحميل إعدادات الهوية', 'branding.error.loadDetail': 'تعذر تحميل إعدادات الهوية — تم الاحتفاظ بالافتراضي الآمن', 'branding.error.phone': 'رقم الهاتف غير صحيح', 'branding.error.fileSize': 'حجم الملف كبير', 'branding.error.fileLimit': 'الحد الأقصى لأصل الهوية هو 2MB.', 'branding.error.assetUpload': 'تعذر رفع الأصل', 'branding.success.assetUploaded': 'تم رفع الأصل', 'branding.success.assetUploadedDetail': 'سيظهر الأصل في المعاينة، وسيظل غير منشور حتى نشر الهوية.', 'branding.error.assetRemove': 'تعذر إزالة الأصل', 'branding.success.assetRemoved': 'تمت إزالة الأصل', 'branding.success.assetRestored': 'تمت العودة إلى الأصل الافتراضي في المعاينة.', 'branding.success.done': 'تمت العملية.', 'branding.success.saved': 'تم حفظ التعديلات', 'branding.success.savedDetail': 'تم حفظ الهوية كمسودة ولم يتم نشرها بعد.', 'branding.error.save': 'تعذر حفظ المسودة', 'branding.error.saveDetail': 'تحقق من الألوان والبيانات.', 'branding.success.published': 'تم نشر الهوية بنجاح', 'branding.success.publishedDetail': 'تم تطبيقها على لوحة الإدارة وبوابة المشترك والطباعة.', 'branding.error.publish': 'تعذر نشر الهوية', 'branding.error.publishDetail': 'أصلح أخطاء التباين ثم حاول مرة أخرى.', 'branding.success.discarded': 'تم إلغاء التعديلات', 'branding.success.discardedDetail': 'عادت الشاشة إلى آخر مسودة محفوظة.'
            , 'branding.confirm.reset.title': 'استعادة الهوية الافتراضية؟', 'branding.confirm.reset.body': 'سيتم استبدال المسودة الحالية بهوية «Logic Fit» وحذف أصول المسودة. لن تتغير الهوية المنشورة إلا بعد الضغط على «نشر الهوية».', 'branding.confirm.reset.confirm': 'استعادة «Logic Fit»', 'branding.confirm.cancel': 'إلغاء', 'branding.loading.reset': 'جارٍ الاستعادة…', 'branding.success.reset': 'تمت استعادة الهوية الافتراضية', 'branding.success.resetDetail': 'يمكنك مراجعة المعاينة قبل النشر.', 'branding.confirm.leave.title': 'لديك تغييرات غير محفوظة', 'branding.confirm.leave.body': 'هل تريد مغادرة شاشة تخصيص الهوية دون حفظ التعديلات الحالية؟', 'branding.confirm.leave.discard': 'تجاهل التعديلات', 'branding.confirm.leave.stay': 'البقاء', 'branding.loading.save': 'جارٍ الحفظ…', 'branding.loading.publish': 'جارٍ النشر…', 'branding.loading.resetting': 'جارٍ الاستعادة…'
            , 'branding.panel.identity.eyebrow': '01 · الهوية التجارية', 'branding.panel.assets.eyebrow': '02 · الأصول', 'branding.panel.light.eyebrow': '03 · السمة الفاتحة', 'branding.panel.dark.eyebrow': '04 · السمة الداكنة', 'branding.panel.typography.eyebrow': '05 · الخطوط', 'branding.panel.login.eyebrow': '06 · تسجيل الدخول', 'branding.panel.interface.eyebrow': '07 · الواجهة', 'branding.panel.documents.eyebrow': '08 · المستندات والبوابة'
            , 'branding.tokens.primary': 'أساسي', 'branding.tokens.primaryHover': 'أساسي عند المرور', 'branding.tokens.primaryActive': 'أساسي عند الضغط', 'branding.tokens.secondary': 'ثانوي', 'branding.tokens.accent': 'تمييز', 'branding.tokens.surface': 'السطح', 'branding.tokens.success': 'نجاح', 'branding.tokens.warning': 'تحذير', 'branding.tokens.danger': 'خطر', 'branding.tokens.info': 'معلومات', 'branding.tokens.hexValue': 'قيمة {{label}} بصيغة HEX'
            , 'branding.audit.description': 'تتبع حفظ المسودات والنشر وإدارة الأصول من مكان واحد.'
            , 'branding.payment.name.placeholder': 'مثال: محفظة الهاتف', 'branding.payment.reference.placeholder': 'رقم الهاتف أو الحساب'
            , 'memberPayment.eyebrow': 'مدفوعات أعضاء الجيم · للمالك فقط', 'memberPayment.title': 'وسائل دفع أعضاء الجيم', 'memberPayment.description': 'أدر وسائل التحويل الخاصة بهذا الجيم فقط. ستظهر الوسائل المنشورة لأعضاء الجيم داخل بوابة العضو، ولا تختلط بإعدادات دفع Logic Fit.'
            , 'memberPayment.status.loading': 'جاري تحميل وسائل الدفع…', 'memberPayment.status.loadingSettings': 'جاري تحميل إعدادات الدفع…', 'memberPayment.status.draft': 'مسودة الهوية', 'memberPayment.status.draftChanged': 'مسودة وسائل الدفع بها تغييرات جديدة', 'memberPayment.status.draftSaved': 'تم حفظ وسائل الدفع كمسودة.', 'memberPayment.status.publishedReady': 'بيانات الدفع المنشورة جاهزة لبوابة العضو.', 'memberPayment.status.draftNotPublished': 'توجد مسودة محفوظة لم تُنشر بعد.', 'memberPayment.status.loadError': 'تعذر تحميل إعدادات الدفع.', 'memberPayment.status.saveError': 'تعذر حفظ وسائل الدفع. حاول مرة أخرى.', 'memberPayment.status.publishError': 'تعذر نشر وسائل الدفع. حاول مرة أخرى.', 'memberPayment.status.leaveError': 'توجد تغييرات غير محفوظة. هل تريد المغادرة؟', 'memberPayment.meta.draft': 'الإصدار {{version}} · مسودة', 'memberPayment.meta.published': 'الإصدار {{version}} · منشور'
            , 'memberPayment.methods.eyebrow': 'وسائل الدفع', 'memberPayment.methods.title': 'بيانات استقبال التحويلات', 'memberPayment.methods.description': 'استخدم رقم الحساب أو الهاتف الخاص بهذا الجيم. يتم حفظ المسودة أولًا ثم نشرها لتظهر للعضو.', 'memberPayment.methods.add': 'إضافة وسيلة دفع', 'memberPayment.methods.loading': 'جاري تحميل إعدادات الدفع…', 'memberPayment.methods.empty.title': 'لا توجد وسائل دفع مضافة', 'memberPayment.methods.empty.body': 'أضف وسيلة دفع خاصة بهذا الجيم ليتمكن العضو من معرفة بيانات التحويل.', 'memberPayment.methods.loadError.title': 'تعذر تحميل وسائل الدفع', 'memberPayment.methods.loadError.body': 'حاول تحديث الشاشة مرة أخرى.', 'memberPayment.methods.row': 'وسيلة دفع {{count}}', 'memberPayment.methods.remove': 'إزالة', 'memberPayment.methods.name': 'اسم الوسيلة', 'memberPayment.methods.reference': 'الرقم أو الحساب', 'memberPayment.methods.recipient': 'اسم المستلم', 'memberPayment.methods.sortOrder': 'ترتيب الظهور', 'memberPayment.methods.instructions': 'تعليمات الدفع', 'memberPayment.methods.instructions.placeholder': 'تعليمات مختصرة للعضو', 'memberPayment.methods.name.placeholder': 'Vodafone Cash', 'memberPayment.methods.reference.placeholder': 'رقم الهاتف أو الحساب', 'memberPayment.methods.active': 'عرض هذه الوسيلة للعضو'
            , 'memberPayment.summary.eyebrow': 'منشورة في بوابة العضو', 'memberPayment.summary.title': 'حالة العرض', 'memberPayment.summary.description': 'لا تظهر أي وسيلة للعضو إلا إذا كانت مفعلة ومضمنة في الهوية المنشورة.', 'memberPayment.summary.activeCount': 'الوسائل النشطة', 'memberPayment.summary.totalCount': 'إجمالي الوسائل', 'memberPayment.summary.activeNote': '{{count}} وسيلة دفع نشطة ستظهر لأعضاء هذا الجيم بعد نشر الهوية.', 'memberPayment.summary.inactiveNote': 'لا توجد وسيلة نشطة منشورة لأعضاء هذا الجيم حاليًا.'
            , 'memberPayment.action.unsavedTitle': 'لديك تغييرات غير محفوظة', 'memberPayment.action.pendingTitle': 'مسودة محفوظة ولم تُنشر', 'memberPayment.action.cleanTitle': 'لا توجد تغييرات غير محفوظة', 'memberPayment.action.unsavedHint': 'احفظ المسودة أولًا، ثم انشرها حتى تظهر البيانات في بوابة العضو.', 'memberPayment.action.pendingHint': 'البيانات محفوظة كمسودة ولن تظهر للعضو قبل النشر.', 'memberPayment.action.cleanHint': 'التعديلات الحالية مطابقة للمسودة المنشورة.', 'memberPayment.action.saveDraft': 'حفظ كمسودة', 'memberPayment.action.publish': 'حفظ ونشر للبوابة', 'memberPayment.action.loadingSave': 'جارٍ حفظ وسائل الدفع…', 'memberPayment.action.savedTitle': 'تم حفظ المسودة', 'memberPayment.action.saved': 'تم حفظ وسائل الدفع كمسودة.', 'memberPayment.action.saveError': 'تعذر حفظ مسودة وسائل الدفع.', 'memberPayment.action.loadingPublish': 'جارٍ نشر وسائل الدفع…', 'memberPayment.action.publishedTitle': 'تم النشر', 'memberPayment.action.published': 'تم نشر وسائل الدفع لبوابة العضو.', 'memberPayment.action.publishError': 'تعذر نشر وسائل الدفع.'
            , 'memberPayment.validation.required': 'أكمل اسم الوسيلة والرقم أو الحساب في وسيلة الدفع {{count}}.', 'memberPayment.leave.title': 'تغييرات غير محفوظة', 'memberPayment.leave.body': 'هل تريد مغادرة الشاشة دون حفظ وسائل الدفع؟', 'memberPayment.leave.confirm': 'مغادرة دون حفظ', 'memberPayment.leave.cancel': 'البقاء'
            , 'memberSubscriptionRequests.kicker': 'مراجعة مدفوعات الأعضاء', 'memberSubscriptionRequests.title': 'طلبات اشتراك الأعضاء', 'memberSubscriptionRequests.description': 'راجع طلبات الاشتراك والتجديد وإثباتات الدفع الخاصة بهذا الجيم فقط.', 'memberSubscriptionRequests.refresh': 'تحديث', 'memberSubscriptionRequests.refresh.loading': 'جارٍ تحديث الطلبات…', 'memberSubscriptionRequests.filter.label': 'تصفية الحالة', 'memberSubscriptionRequests.filter.pending': 'قيد المراجعة', 'memberSubscriptionRequests.filter.approved': 'معتمد', 'memberSubscriptionRequests.filter.rejected': 'مرفوض', 'memberSubscriptionRequests.filter.all': 'كل الطلبات', 'memberSubscriptionRequests.summary.loading': 'جارٍ تحميل الطلبات…', 'memberSubscriptionRequests.loading': 'جارٍ تحميل طلبات الأعضاء…', 'memberSubscriptionRequests.loading.update': 'جارٍ تحديث الطلبات…', 'memberSubscriptionRequests.empty.title': 'لا توجد طلبات مطابقة', 'memberSubscriptionRequests.empty.body': 'ستظهر طلبات الاشتراك والتجديد هنا بعد إرسالها من بوابة العضو.', 'memberSubscriptionRequests.column.member': 'العضو', 'memberSubscriptionRequests.column.request': 'الطلب والعضوية', 'memberSubscriptionRequests.column.amount': 'المبلغ', 'memberSubscriptionRequests.column.proof': 'إثبات الدفع', 'memberSubscriptionRequests.column.date': 'تاريخ الطلب', 'memberSubscriptionRequests.column.status': 'الحالة والإجراء', 'memberSubscriptionRequests.value.unknown': 'غير محدد', 'memberSubscriptionRequests.value.noCode': 'بدون كود عضوية', 'memberSubscriptionRequests.value.noProof': 'غير مرفق/غير موثّق', 'memberSubscriptionRequests.value.paymentDateNeeded': 'يحتاج تحديدًا', 'memberSubscriptionRequests.value.collection': 'التحصيل', 'memberSubscriptionRequests.value.price': 'السعر', 'memberSubscriptionRequests.value.currency': 'ج.م', 'memberSubscriptionRequests.value.dash': '—', 'memberSubscriptionRequests.type.membership': 'اشتراك جديد', 'memberSubscriptionRequests.type.extension': 'تمديد عضوية', 'memberSubscriptionRequests.type.renewal': 'تجديد عضوية', 'memberSubscriptionRequests.status.pending': 'قيد المراجعة', 'memberSubscriptionRequests.status.approved': 'معتمد', 'memberSubscriptionRequests.status.rejected': 'مرفوض', 'memberSubscriptionRequests.status.cancelled': 'ملغى', 'memberSubscriptionRequests.action.viewProof': 'عرض الإثبات', 'memberSubscriptionRequests.action.approve': 'اعتماد وتفعيل', 'memberSubscriptionRequests.action.reject': 'رفض', 'memberSubscriptionRequests.action.reviewed': 'تمت المراجعة', 'memberSubscriptionRequests.total': 'إجمالي النتائج: {{count}}', 'memberSubscriptionRequests.pagination.page': 'صفحة {{page}} من {{pages}}', 'memberSubscriptionRequests.pagination.previous': 'السابق', 'memberSubscriptionRequests.pagination.next': 'التالي', 'memberSubscriptionRequests.error.load.title': 'تعذر تحميل الطلبات', 'memberSubscriptionRequests.error.load.retry': 'إعادة المحاولة', 'memberSubscriptionRequests.error.operation': 'تعذر تنفيذ العملية. حاول مرة أخرى.', 'memberSubscriptionRequests.error.notFound': 'الطلب غير موجود أو لم يعد متاحًا.', 'memberSubscriptionRequests.error.alreadyReviewed': 'تمت مراجعة هذا الطلب بالفعل. حدّث القائمة.', 'memberSubscriptionRequests.error.proofRequired': 'لا يمكن الاعتماد قبل رفع إثبات دفع موثّق.', 'memberSubscriptionRequests.error.proofIntegrity': 'تعذر التحقق من سلامة إثبات الدفع.', 'memberSubscriptionRequests.error.proofUnavailable': 'إثبات الدفع غير متاح حاليًا.', 'memberSubscriptionRequests.error.proofChanged': 'تغير إثبات الدفع أثناء المراجعة. حدّث القائمة وحاول مرة أخرى.', 'memberSubscriptionRequests.error.paymentDateRequired': 'حدد تاريخ التحصيل الفعلي قبل اعتماد الطلب.', 'memberSubscriptionRequests.error.paymentDateFuture': 'تاريخ التحصيل لا يمكن أن يكون في المستقبل.', 'memberSubscriptionRequests.error.storageNotConfigured': 'تخزين إثباتات الدفع غير مهيأ حاليًا.', 'memberSubscriptionRequests.error.storageUnavailable': 'تخزين إثباتات الدفع غير متاح حاليًا. حاول مرة أخرى لاحقًا.', 'memberSubscriptionRequests.error.planUnavailable': 'الباقة المطلوبة لم تعد متاحة.', 'memberSubscriptionRequests.error.typeUnavailable': 'نوع العضوية المطلوب لم يعد متاحًا.', 'memberSubscriptionRequests.error.renewalRequiresExisting': 'لا يمكن اعتماد التمديد أو التجديد دون عضوية سابقة. حدّث بيانات العضو ثم أعد المحاولة.', 'memberSubscriptionRequests.error.freezeActive': 'لا يمكن اعتماد التمديد أثناء التجميد. استأنف العضوية أولًا ثم أعد المحاولة.', 'memberSubscriptionRequests.error.overlap': 'تم تحويل الطلب تلقائيًا إلى تمديد/تجديد لمنع تداخل العضويات. حدّث القائمة وحاول مرة أخرى.', 'memberSubscriptionRequests.error.snapshotInvalid': 'بيانات مدة العضوية غير صالحة. راجع إعدادات العضوية وأنشئ طلبًا جديدًا.', 'memberSubscriptionRequests.error.currentDatesInvalid': 'تواريخ العضوية الحالية غير صالحة. راجع بيانات العضو قبل الاعتماد.', 'memberSubscriptionRequests.dialog.reject.title': 'رفض طلب الاشتراك', 'memberSubscriptionRequests.dialog.reject.reason': 'سبب الرفض', 'memberSubscriptionRequests.dialog.reject.placeholder': 'اكتب سببًا واضحًا للعضو', 'memberSubscriptionRequests.dialog.reject.confirm': 'رفض الطلب', 'memberSubscriptionRequests.dialog.cancel': 'إلغاء', 'memberSubscriptionRequests.dialog.reject.required': 'سبب الرفض مطلوب.', 'memberSubscriptionRequests.dialog.approve.title': 'اعتماد طلب الاشتراك؟', 'memberSubscriptionRequests.dialog.approve.body': 'سيتم إنشاء أو تجديد العضوية وتسجيل الدفعة داخل معاملة واحدة.', 'memberSubscriptionRequests.dialog.paymentDate': 'تاريخ التحصيل الفعلي', 'memberSubscriptionRequests.dialog.approve.confirm': 'اعتماد وتفعيل', 'memberSubscriptionRequests.dialog.paymentDate.required': 'تاريخ التحصيل مطلوب.', 'memberSubscriptionRequests.dialog.approve.fallback': 'سيتم تفعيل العضوية وتسجيل الدفعة بتاريخ التحصيل المحدد. هل تريد المتابعة؟', 'memberSubscriptionRequests.status.approvedNotice': 'تم اعتماد الطلب وتفعيل العضوية.', 'memberSubscriptionRequests.status.rejectedNotice': 'تم رفض الطلب.', 'memberSubscriptionRequests.status.approveError': 'تعذر اعتماد الطلب.', 'memberSubscriptionRequests.status.rejectError': 'تعذر رفض الطلب.'
            , 'branding.preview.theme.light': '☀ الوضع الفاتح', 'branding.preview.theme.dark': '◐ الوضع الداكن', 'branding.preview.size.desktop': 'سطح المكتب', 'branding.preview.size.mobile': 'الهاتف'
            , 'branding.interface.radius.sharp': 'حاد', 'branding.interface.radius.small': 'صغير', 'branding.interface.radius.medium': 'متوسط', 'branding.interface.radius.large': 'كبير'
            , 'branding.interface.cards.flat': 'مسطح', 'branding.interface.cards.border': 'بحدود', 'branding.interface.cards.softShadow': 'ظل خفيف'
            , 'branding.interface.sidebar.brand': 'الهوية', 'branding.interface.sidebar.light': 'فاتح', 'branding.interface.sidebar.dark': 'داكن', 'branding.interface.sidebar.auto': 'تلقائي'
            , 'branding.interface.active.background': 'خلفية', 'branding.interface.active.indicator': 'مؤشر', 'branding.interface.active.pill': 'شريط مستدير'
            , 'branding.confirm.removeAsset.title': 'إزالة أصل الهوية؟', 'branding.confirm.removeAsset.body': 'سيعود النظام إلى الأصل الافتراضي بعد نشر الهوية.', 'branding.error.reset': 'تعذر استعادة الهوية'
            , 'branding.panel.identity.title': 'الهوية الأساسية', 'branding.panel.assets.title': 'الشعارات والأصول', 'branding.panel.light.title': 'ألوان Light Mode', 'branding.panel.dark.title': 'ألوان Dark Mode', 'branding.panel.typography.title': 'الخطوط', 'branding.panel.login.title': 'شاشة تسجيل الدخول', 'branding.panel.interface.title': 'واجهة النظام', 'branding.panel.documents.title': 'المستندات وبوابة المشترك'
            , 'branding.audit.title': 'سجل الهوية', 'branding.audit.kicker': 'سجل الإصدارات', 'branding.preview.sample.search': 'ابحث عن مشترك', 'branding.preview.welcomeFallback': 'إدارة أذكى لجيم أقوى.', 'branding.preview.metric.revenueValue': '٤٢K', 'branding.preview.table.member': 'المشترك', 'branding.preview.table.status': 'الحالة', 'branding.preview.table.action': 'الإجراء'
            , 'branding.preview.nav.home': 'الرئيسية', 'branding.preview.nav.members': 'الأعضاء', 'branding.preview.nav.reports': 'التقارير', 'branding.preview.metric.members': 'المشتركون', 'branding.preview.metric.attendance': 'الحضور', 'branding.preview.metric.revenue': 'الإيراد', 'branding.preview.sample.card': 'بطاقة تشغيلية', 'branding.preview.sample.today': 'اليوم', 'branding.preview.sample.action': 'إجراء', 'branding.preview.sample.memberOne': 'أحمد علي', 'branding.preview.sample.memberTwo': 'سارة محمد', 'branding.preview.sample.status': 'نشط', 'branding.preview.sample.view': 'عرض', 'branding.preview.sample.edit': 'تعديل', 'branding.preview.sample.modal': 'معاينة نافذة', 'branding.preview.sample.modalBody': 'المكونات المنبثقة والحقول تتبع نفس الهوية تلقائيًا.', 'branding.preview.sample.confirm': 'تأكيد'
            , 'branding.payment.instructions.ownerValue': 'قيمة يكتبها مالك الجيم', 'branding.asset.preview.initialFallback': 'ج', 'branding.version.separator': ' · '
            , 'branding.confirm.removeAsset.confirm': 'إزالة', 'branding.confirm.removeAsset.cancel': 'إلغاء', 'branding.confirm.removeAsset.fallback': 'إزالة أصل الهوية والعودة إلى الافتراضي؟', 'branding.confirm.reset.fallback': 'استعادة الهوية الافتراضية «Logic Fit»؟', 'branding.confirm.leave.fallback': 'لديك تغييرات غير محفوظة. هل تريد مغادرة الشاشة؟'
        }),
        en: Object.freeze({
            ...backupHistoryEnglish,
            ...loginScreenEnglish,
            ...trainerWorkspaceScreenEnglish,
            ...trainerStudioV2English,
            ...reportsScreenEnglish,
            ...portalAnalyticsScreenEnglish,
            ...coachingScreenEnglish,
            ...gymLibraryScreenEnglish,
            ...membershipManagementScreenEnglish,
            ...permissionsScreenEnglish,
            ...platformAdminScreenEnglish,
            'feedback.kicker': 'Member voice',
            'feedback.title': 'Member feedback',
            'feedback.description': 'Review member comments, concerns, and suggestions to improve the gym experience.',
            'feedback.refresh': 'Refresh feedback',
            'feedback.filter.rating': 'Rating',
            'feedback.filter.rating.all': 'All ratings',
            'feedback.filter.rating.one': 'One star',
            'feedback.filter.rating.two': 'Two stars',
            'feedback.filter.rating.stars': '{{count}} stars',
            'feedback.filter.type': 'Feedback type',
            'feedback.filter.type.all': 'All feedback',
            'feedback.type.general': 'General feedback',
            'feedback.type.problem': 'Problem',
            'feedback.type.complaint': 'Complaint',
            'feedback.type.suggestion': 'Suggestion',
            'feedback.type.featureRequest': 'Feature request for {{brand}}',
            'feedback.filter.from': 'From date',
            'feedback.filter.to': 'To date',
            'feedback.filter.search': 'Search members',
            'feedback.filter.search.placeholder': 'Name or phone number',
            'feedback.reset': 'Reset filters',
            'feedback.meta.total': 'Total results: {{count}}',
            'feedback.loading': 'Loading feedback…',
            'feedback.empty.title': 'No matching feedback',
            'feedback.empty.description': 'Member feedback submitted through the member portal will appear here.',
            'feedback.error.title': 'Could not load feedback',
            'feedback.error.description': 'There was a problem loading feedback. Please try again.',
            'feedback.retry': 'Try again',
            'feedback.table.member': 'Member',
            'feedback.table.rating': 'Rating',
            'feedback.table.type': 'Feedback type',
            'feedback.table.message': 'Comment or concern',
            'feedback.table.date': 'Submitted',
            'feedback.table.action': 'Action',
            'feedback.rating.aria': '{{count}} out of 5 stars',
            'feedback.action.memberDetails': 'Member details',
            'feedback.pagination.range': 'Showing {{from}}–{{to}} of {{total}} reviews',
            'feedback.pagination.page': 'Page {{page}} of {{pages}}',
            'feedback.pagination.previous': 'Previous',
            'feedback.pagination.next': 'Next',
            'feedback.value.unavailable': '—',
            'language.name': 'English',
            'language.short': 'عربي',
            'language.switchToEnglish': 'Switch to English',
            'language.switchToArabic': 'Switch to Arabic',
            'common.greeting': 'Hello {{name}}',
            'common.loading.data': 'Loading data',
            'common.loading.indicators': 'Loading indicators',
            'common.loading.text': 'Loading text',
            'common.loading.avatar': 'Loading profile picture',
            'common.loading.metric': 'Loading metric',
            'common.loading.chart': 'Loading chart',
            'common.loading.form': 'Loading form',
            'common.loading.select': 'Loading options',
            'passwordChange.brand.subtitle': 'Secure workspace',
            'passwordChange.pageTitle': 'Change password | Logic Fit',
            'passwordChange.eyebrow': 'Security step required',
            'passwordChange.title': 'Create your new password',
            'passwordChange.description': 'Your temporary password has expired. Choose a new password to continue to your workspace.',
            'passwordChange.field.new': 'New password',
            'passwordChange.field.confirm': 'Confirm password',
            'passwordChange.hint': 'Use at least 8 characters. A mix of letters and numbers is recommended.',
            'passwordChange.password.show': 'Show password',
            'passwordChange.password.hide': 'Hide password',
            'passwordChange.password.showNew': 'Show new password',
            'passwordChange.password.hideNew': 'Hide new password',
            'passwordChange.password.showConfirm': 'Show password confirmation',
            'passwordChange.password.hideConfirm': 'Hide password confirmation',
            'passwordChange.submit': 'Save password and continue',
            'passwordChange.submit.loading': 'Saving password…',
            'passwordChange.note': 'Your password will not be recorded or shown again.',
            'passwordChange.footer': 'A secure experience starts with your account',
            'passwordChange.identity': 'Account: {{name}}',
            'passwordChange.error.request': 'Could not complete the operation. Try again.',
            'passwordChange.error.session': 'Could not verify the account session. Reload the page and try again.',
            'passwordChange.error.short': 'The new password must contain at least 8 characters.',
            'passwordChange.error.mismatch': 'The passwords do not match.',
            'passwordChange.error.sessionUpdate': 'The account status has not updated yet. Try again.',
            'passwordChange.error.save': 'Could not save the password. Try again.',
            'passwordChange.error.api.INVALID_USER_ID': 'The account details are invalid. Sign in again.',
            'passwordChange.error.api.INVALID_PASSWORD': 'The password must contain between 8 and 128 characters.',
            'passwordChange.error.api.PASSWORD_CONFIRMATION_MISMATCH': 'The passwords do not match.',
            'passwordChange.error.api.ACCOUNT_DISABLED': 'This account is unavailable. Contact your system administrator.',
            'passwordChange.error.api.PASSWORD_CHANGE_NOT_REQUIRED': 'There is no temporary password that needs changing.',
            'passwordChange.error.api.AUTH_REQUIRED': 'Your session has expired. Sign in again.',
            'passwordChange.error.api.TENANT_ACCESS_REQUIRED': 'Could not verify the workspace linked to this account.',
            'passwordChange.theme.dark': 'Dark mode',
            'passwordChange.theme.light': 'Light mode',
            'passwordChange.theme.enableDark': 'Enable dark mode',
            'passwordChange.theme.enableLight': 'Enable light mode',
            'platformAdminForbidden.pageTitle': 'Access denied | Logic Fit',
            'platformAdminForbidden.eyebrow': 'PLATFORM ADMIN ONLY',
            'platformAdminForbidden.title': 'This area is for platform administrators',
            'platformAdminForbidden.description': 'Gym Owner and Assistant accounts must use the gym application from its main route.',
            'platformAdminForbidden.returnToGym': 'Return to the gym app',
            'platformAdminForbidden.switchAccount': 'Sign out and sign in as a platform administrator',
            'platformAdminForbidden.switchAccount.loading': 'Preparing sign-in…',
            'registration.pageTitle.gym': 'Get started with Logic Fit',
            'registration.pageTitle.trainer': 'Get started as a personal trainer | Logic Fit',
            'registration.brand.subtitle.gym': 'Gym management platform',
            'registration.brand.subtitle.trainer': 'Personal training management platform',
            'registration.header.return': 'Back to the platform',
            'registration.header.safeNote': 'Your information is protected',
            'registration.path.ariaLabel': 'How you use the platform',
            'registration.path.eyebrow': 'Your first step',
            'registration.path.title': 'How will you use the platform?',
            'registration.path.description': 'Choose the path that fits you so we can prepare your experience.',
            'registration.path.gym.title': 'Gym management',
            'registration.path.gym.description': 'For gyms and fitness centers',
            'registration.path.trainer.title': 'I am a personal trainer',
            'registration.path.trainer.description': 'For one-to-one training and managing your clients',
            'registration.progress.ariaLabel.gym': 'Registration steps',
            'registration.progress.ariaLabel.trainer': 'Trainer registration steps',
            'registration.progress.gym.1.title': 'Gym details',
            'registration.progress.gym.1.description': 'Basic information',
            'registration.progress.trainer.1.title': 'Trainer details',
            'registration.progress.trainer.1.description': 'Identity and contact',
            'registration.progress.2.title': 'Plan',
            'registration.progress.gym.2.description': 'Choose what suits you',
            'registration.progress.trainer.2.description': 'Choose a plan',
            'registration.progress.3.title': 'Term',
            'registration.progress.3.description': 'Subscription duration',
            'registration.progress.4.title': 'Payment',
            'registration.progress.4.description': 'Transfer details',
            'registration.progress.5.title': 'Proof',
            'registration.progress.5.description': 'Upload payment proof',
            'registration.progress.6.title': 'Review',
            'registration.progress.gym.6.description': 'Confirm and send your request',
            'registration.progress.trainer.6.description': 'Confirm your request',
            'registration.aside.ariaLabel.gym': 'About Logic Fit and registration',
            'registration.aside.ariaLabel.trainer': 'About Logic Fit and trainer registration',
            'registration.aside.kicker': 'Start with a clear next step',
            'registration.aside.gym.title': 'Get your gym ready to work smarter.',
            'registration.aside.gym.description': 'Submit a subscription request. The Logic Fit team will review it and prepare your gym workspace.',
            'registration.aside.gym.imageAlt': 'A training space prepared for gym management',
            'registration.aside.trainer.title': 'Turn your expertise into a smarter training space.',
            'registration.aside.trainer.description': 'Submit your request. The Logic Fit team will review it and prepare your workspace.',
            'registration.aside.trainer.imageAlt': 'A modern training space',
            'registration.aside.gym.footerTitle': 'A clear experience from the start',
            'registration.aside.gym.footerDescription': 'After approval, your login link and activation details will arrive via WhatsApp.',
            'registration.aside.trainer.footerTitle': 'Designed for trainers',
            'registration.aside.trainer.footerDescription': 'After approval, your secure login details will arrive through the approved channel.',
            'registration.card.badge.gym': 'New request',
            'registration.card.badge.trainer': 'Personal trainer request',
            'registration.step.1.gym.title': 'Gym and owner details',
            'registration.step.1.trainer.title': 'Trainer details',
            'registration.stage.1.gym.description': 'Enter the primary contact details so we can review your request.',
            'registration.stage.1.trainer.description': 'Enter your primary contact details for request review.',
            'registration.field.gymName.gym': 'Gym name',
            'registration.field.gymName.trainer': 'Trainer or brand name',
            'registration.field.gymName.placeholder.gym': 'Example: Power Gym',
            'registration.field.gymName.placeholder.trainer': 'Example: Ahmed Coaching',
            'registration.field.ownerName.gym': 'Owner name',
            'registration.field.ownerName.trainer': 'Full name',
            'registration.field.ownerName.placeholder': 'Full name',
            'registration.field.phone.gym': 'WhatsApp number',
            'registration.field.phone.trainer': 'Phone number',
            'registration.field.email': 'Email address',
            'registration.field.email.placeholder': 'name@example.com',
            'registration.field.city': 'City or area',
            'registration.field.city.placeholder': 'Cairo, Giza...',
            'registration.optional': 'Optional',
            'registration.step.2.title': 'Choose a Logic Fit plan',
            'registration.step.2.description.gym': 'Available plans are loaded directly from platform settings.',
            'registration.step.2.description.trainer': 'Plans available to trainers are loaded from platform settings.',
            'registration.loading.plans': 'Loading plans...',
            'registration.plans.empty': 'No plans are currently available. Please try again later.',
            'registration.plan.descriptionFallback': 'A flexible plan for managing and operating a gym.',
            'registration.plan.memberLimit.unlimited': 'No stated member limit',
            'registration.plan.memberLimit.upTo': 'Up to {{count}} active members',
            'registration.step.3.title': 'Choose a subscription term',
            'registration.step.3.description.gym': 'Choose a term available in the plan you selected.',
            'registration.step.3.description.trainer': 'Choose a term available in the plan you selected.',
            'registration.term.months': '{{count}} months',
            'registration.term.monthly': 'Monthly',
            'registration.term.quarterly': '3 months',
            'registration.term.semiannual': '6 months',
            'registration.term.annual': 'Annual',
            'registration.discount': 'Discount',
            'registration.terms.empty': 'Choose a plan first to see the available terms.',
            'registration.step.4.title': 'Payment method',
            'registration.step.4.description.gym': 'Transfer the amount using Logic Fit’s payment method, then keep the proof.',
            'registration.step.4.description.trainer': 'Transfer the amount using the selected payment method and keep the proof.',
            'registration.payment.steps.ariaLabel': 'Payment steps',
            'registration.payment.steps.transfer': 'Transfer the amount using the selected payment method details.',
            'registration.payment.steps.proof': 'Keep the transfer proof and upload it in the next step.',
            'registration.payment.steps.track': 'Track the request number until verification and review are complete.',
            'registration.payment.recipient': 'Recipient',
            'registration.payment.copyAccount': 'Copy account number',
            'registration.payment.empty': 'Logic Fit payment methods have not been set up yet. A registration request cannot be sent until a payment method is enabled in the Platform Admin panel.',
            'registration.price.amountDue': 'Amount due according to platform settings',
            'registration.price.discount': 'Discount',
            'registration.step.5.title': 'Upload payment proof',
            'registration.step.5.description.gym': 'An accepted image or PDF file up to 4 MB.',
            'registration.step.5.description.trainer': 'An image or PDF file up to 4 MB.',
            'registration.upload.choose': 'Choose payment proof file',
            'registration.upload.helper': 'Select a file or drag it here',
            'registration.upload.privacy.gym': 'The proof is stored privately and is visible only to authorized reviewers.',
            'registration.upload.privacy.trainer': 'The proof is stored privately and is visible only to the review team.',
            'registration.file.remove': 'Remove file',
            'registration.step.6.title': 'Review your request before sending',
            'registration.step.6.description': 'Check that your information is correct. The price will be set from platform settings when the request is created.',
            'registration.review.gymName': 'Gym name',
            'registration.review.trainerName': 'Trainer or brand name',
            'registration.review.owner': 'Owner',
            'registration.review.whatsapp': 'WhatsApp',
            'registration.review.plan': 'Plan',
            'registration.review.term': 'Term',
            'registration.review.paymentMethod': 'Payment method',
            'registration.review.paymentProof': 'Payment proof',
            'registration.review.total': 'Total',
            'registration.notes.label': 'Additional note',
            'registration.notes.placeholder': 'Any details that could help the Logic Fit team review your request',
            'registration.success.kicker': 'Request received',
            'registration.success.title': 'Your request is under review',
            'registration.success.description.gym': 'Your payment will be reviewed. After approval, you will receive a WhatsApp message with your gym account activation details and login information.',
            'registration.success.description.trainer': 'Your payment will be reviewed. After approval, you will receive your account activation details.',
            'registration.success.reference': 'Request number',
            'registration.success.return': 'Back to Logic Fit',
            'registration.confirmation.amount': 'Recorded amount',
            'registration.confirmation.paymentMethod': 'Payment method',
            'registration.confirmation.status': 'Request status',
            'registration.confirmation.refresh': 'Refresh status',
            'registration.confirmation.received': 'Your transfer proof has been received. The account is activated only after the Logic Fit team reviews and approves the request.',
            'registration.status.pending': 'Under review',
            'registration.status.approved': 'Request approved',
            'registration.status.rejected': 'Rejected',
            'registration.status.cancelled': 'Cancelled',
            'registration.status.unavailable': 'Currently unavailable',
            'registration.status.loading': 'Updating status…',
            'registration.status.refreshError': 'Could not update the status. Please try again.',
            'registration.actions.back': 'Back',
            'registration.actions.next': 'Next',
            'registration.actions.submit': 'Send subscription request',
            'registration.actions.hint.editable': 'You can go back to change any selection.',
            'registration.actions.hint.review.gym': 'No account will be created before the request is reviewed.',
            'registration.actions.hint.review.trainer': 'The account will not be created until the request is reviewed and approved.',
            'registration.actions.loading': 'Continuing...',
            'registration.actions.submitLoading': 'Sending your request...',
            'registration.actions.submitSuccess': 'Request sent',
            'registration.stageLabel': 'Step {{step}} of 06',
            'registration.actions.submitShort': 'Send subscription request',
            'registration.validation.required': 'Complete the required fields to continue.',
            'registration.validation.email': 'Enter a valid email address.',
            'registration.validation.plan': 'Choose a plan to continue.',
            'registration.validation.term': 'Choose a subscription term to continue.',
            'registration.validation.paymentMethod': 'Choose a payment method to continue.',
            'registration.validation.paymentMethodNotConfigured': 'No Logic Fit payment method is currently enabled. A Platform Admin must configure one before registration can continue.',
            'registration.validation.paymentProof': 'Upload payment proof first.',
            'registration.validation.paymentProofSize': 'Payment proof must not exceed 4 MB.',
            'registration.validation.requestIdMissing': 'A secure request tracking token was not created.',
            'registration.error.generic': 'The request could not be completed. Please try again.',
            'registration.error.network': 'Could not connect to the registration service. Please try again shortly.',
            'registration.error.rateLimited': 'The allowed number of attempts was exceeded. Wait a moment, then try again.',
            'registration.error.catalogInvalid': 'Could not load registration options. Please try again shortly.',
            'registration.error.catalogUnavailable': 'Public registration is not configured. Contact Logic Fit or try again later.',
            'registration.error.planUnavailable': 'The selected plan is no longer available. Reload the options and choose another plan.',
            'registration.error.termUnavailable': 'The selected subscription term is no longer available. Reload the options and choose another term.',
            'registration.error.paymentMethodUnavailable': 'The selected payment method is no longer available. Reload the options and choose another method.',
            'registration.error.storageNotConfigured': 'Could not upload payment proof because private storage is not configured.',
            'registration.error.storageVerificationUnavailable': 'Payment proof could not be verified. Please try again.',
            'registration.error.proofUnavailable': 'Payment proof could not be accessed. Upload the file again and retry.',
            'registration.error.proofIntegrity': 'Payment proof integrity could not be verified. Upload the original file again.',
            'registration.error.requestExists': 'A similar registration request is already under review.',
            'registration.error.requestLocked': 'This request has already been reviewed. Reload the page to see its status.',
            'registration.error.catalogLoad': 'Could not load plans. Reload the page and try again.',
            'registration.error.requestSubmit': 'Could not send the request. Check storage or the file and try again.',
            'registration.payment.copySuccess': 'Account number copied.',
            'registration.payment.copyFailure': 'Could not copy automatically. Select the account number and copy it manually.',
            'registration.toast.success': 'Your request was received successfully.',
            'registration.toast.copied': 'Account number copied.',
            'registration.toast.copyFailed': 'Could not copy automatically. Select and copy the account number manually.',
            'registration.upload.sizeUnit.kb': 'KB',
            'registration.upload.sizeUnit.mb': 'MB',
            'registration.phone.help': 'Enter the number without the country calling code.',
            'registration.phone.required': 'A phone number is required.',
            'registration.phone.characters': 'Use digits only in the number field. A formatted number may be used when pasting.',
            'registration.phone.localFormat': 'Enter the Egyptian mobile number in local format without +20 or a country calling code.',
            'registration.phone.length': 'Enter an Egyptian mobile number with 11 digits.',
            'registration.phone.tooLong': 'The number exceeds the maximum allowed length ({{count}} digits maximum).',
            'registration.phone.format': 'Enter a valid Egyptian mobile number starting with 010, 011, 012, or 015.',
            'registration.phone.catalog': 'Phone rules are not ready yet. Please try again.',
            'registration.phone.countrySearch': 'Search by country name or calling code',
            'branchesScreen.header.kicker': 'Branches & sections',
            'branchesScreen.header.title': 'Manage gym branches',
            'branchesScreen.header.description': 'Add branches and configure operating details for your gym account.',
            'branchesScreen.summary.label': 'Branch summary',
            'branchesScreen.summary.active': 'Active branches',
            'branchesScreen.summary.limit': 'Plan limit',
            'branchesScreen.actions.addBranch': 'Add branch',
            'branchesScreen.actions.refresh': 'Refresh',
            'branchesScreen.actions.close': 'Close',
            'branchesScreen.actions.cancel': 'Cancel',
            'branchesScreen.actions.submitAddBranch': 'Add branch',
            'branchesScreen.actions.archive': 'Archive branch',
            'branchesScreen.actions.archiveNamed': 'Archive {{name}}',
            'branchesScreen.actions.enableBar': 'Enable bar',
            'branchesScreen.actions.disableBar': 'Disable bar',
            'branchesScreen.list.kicker': 'Branch directory',
            'branchesScreen.list.title': 'Current branches',
            'branchesScreen.list.description': 'Archiving preserves the record and does not delete operational data.',
            'branchesScreen.loading': 'Loading branches…',
            'branchesScreen.empty': 'No active branches.',
            'branchesScreen.dialog.kicker': 'New branch',
            'branchesScreen.dialog.title': 'Add a branch',
            'branchesScreen.dialog.description': 'It will be saved as a branch of this gym.',
            'branchesScreen.fields.code': 'Branch code',
            'branchesScreen.fields.name': 'Branch name',
            'branchesScreen.fields.namePlaceholder': 'Nasr City branch',
            'branchesScreen.fields.address': 'Address',
            'branchesScreen.fields.phone': 'Phone',
            'branchesScreen.fields.enableStore': 'Enable store',
            'branchesScreen.fields.enableBarAndPos': 'Enable the bar and create a point of sale',
            'branchesScreen.section.type.men': 'Men',
            'branchesScreen.section.type.women': 'Women',
            'branchesScreen.section.type.mixed': 'Mixed',
            'branchesScreen.section.type.unknown': 'Section',
            'branchesScreen.context.section': 'Section',
            'branchesScreen.context.branch': 'Branch',
            'branchesScreen.context.currentSection': 'Current section: {{name}}',
            'branchesScreen.context.currentBranch': 'Current branch: {{name}}',
            'branchesScreen.context.sectionTitle': 'Section: {{name}}',
            'branchesScreen.context.branchTitle': 'Branch: {{name}}',
            'branchesScreen.context.sectionCurrent': 'Current section',
            'branchesScreen.context.branchCurrent': 'Current branch',
            'branchesScreen.context.allBranches': 'All branches',
            'branchesScreen.context.allSections': 'All sections',
            'branchesScreen.context.allBranchesView': 'Unified view',
            'branchesScreen.status.active': 'Active',
            'branchesScreen.status.inactive': 'Inactive',
            'branchesScreen.status.archived': 'Archived',
            'branchesScreen.status.enabled': 'Enabled',
            'branchesScreen.status.disabled': 'Disabled',
            'branchesScreen.branch.noAddress': 'No address',
            'branchesScreen.branch.main': 'Main branch',
            'branchesScreen.branch.operational': 'Operational branch',
            'branchesScreen.commerce.settings': 'Commerce settings',
            'branchesScreen.commerce.store': 'Store',
            'branchesScreen.commerce.bar': 'Bar',
            'branchesScreen.errors.updateBar': 'Could not update bar settings.',
            'branchesScreen.errors.load': 'Could not load branch context.',
            'branchesScreen.errors.create': 'Could not add the branch.',
            'branchesScreen.errors.archive': 'Could not archive the branch.',
            'branchesScreen.messages.created': 'Branch added successfully.',
            'branchesScreen.confirm.archive': 'New operations will stop while the history is retained. Continue?',
            'nav.aria': 'Administration sections',
            'nav.mobile.heading': 'Gym sections',
            'nav.mobile.open': 'Open navigation',
            'nav.mobile.close': 'Close navigation',
            'nav.group.workspace': 'Workspace',
            'nav.group.location': 'Locations',
            'nav.group.operations': 'Operations',
            'nav.group.management': 'Management',
            'nav.dashboard': 'Dashboard',
            'nav.members': 'Members',
            'nav.attendance': 'Attendance',
            'nav.reports': 'Reports',
            'nav.branches': 'Branches & sections',
            'nav.trainees': 'External trainees',
            'nav.library': 'Library',
            'nav.store': 'Store',
            'nav.intelligence': 'Operational intelligence',
            'intelligenceScreen.header.title': 'Intelligence decision center',
            'intelligenceScreen.header.description': 'Start with urgent interventions, then member retention, then plan execution.',
            'intelligenceScreen.header.engine': 'Hybrid intelligence · Human review',
            'intelligenceScreen.header.refresh': 'Refresh analysis',
            'intelligenceScreen.loading.analysis': 'Preparing analysis…',
            'intelligenceScreen.loading.priorities': 'Analyzing…',
            'intelligenceScreen.loading.cases': 'Loading cases…',
            'intelligenceScreen.stats.highRisk': 'High churn risk',
            'intelligenceScreen.stats.highRisk.caption': 'Contact priority today',
            'intelligenceScreen.stats.expiring': 'Expiring soon',
            'intelligenceScreen.stats.expiring.caption': 'Needs timely follow-up',
            'intelligenceScreen.stats.activeMemberships': 'Active memberships',
            'intelligenceScreen.stats.activeMemberships.caption': 'Needs ongoing follow-up',
            'intelligenceScreen.stats.workouts': 'Active workout programs',
            'intelligenceScreen.stats.workouts.caption': 'Plan in progress',
            'intelligenceScreen.stats.diet': 'Active nutrition plans',
            'intelligenceScreen.stats.diet.caption': 'Trackable plan',
            'intelligenceScreen.stats.members': 'Members',
            'intelligenceScreen.stats.members.caption': 'Total profiles',
            'intelligenceScreen.priority.now': 'Priority 01 · Now',
            'intelligenceScreen.priority.title': 'What needs your attention now?',
            'intelligenceScreen.priority.description': 'Start with these signals before moving to analysis or plan creation.',
            'intelligenceScreen.priority.empty': 'No signals need action right now.',
            'intelligenceScreen.priority.retention': 'Priority 02 · Retention',
            'intelligenceScreen.churn.title': 'Members at risk of leaving',
            'intelligenceScreen.churn.description': 'This is an operational signal to help prioritize follow-up, not a final judgment about a member.',
            'intelligenceScreen.churn.legend.high': 'High',
            'intelligenceScreen.churn.legend.medium': 'Medium',
            'intelligenceScreen.churn.legend.low': 'Low',
            'intelligenceScreen.churn.header.member': 'Member',
            'intelligenceScreen.churn.header.risk': 'Signal',
            'intelligenceScreen.churn.header.lastVisit': 'Last visit',
            'intelligenceScreen.churn.header.expiry': 'Expiry',
            'intelligenceScreen.churn.header.reason': 'Primary reason',
            'intelligenceScreen.churn.header.action': 'Action',
            'intelligenceScreen.churn.noPhone': 'No phone',
            'intelligenceScreen.churn.noAttendance': 'No attendance',
            'intelligenceScreen.churn.daysAgo': '{{count}} days ago',
            'intelligenceScreen.churn.expired': 'Expired',
            'intelligenceScreen.churn.days': '{{count}} days',
            'intelligenceScreen.churn.reasonFallback': 'Signal needs review',
            'intelligenceScreen.churn.openMember': 'Open profile',
            'intelligenceScreen.churn.empty': 'No active memberships are in the analysis scope.',
            'intelligenceScreen.query.priority': 'Priority 03 · Ask',
            'intelligenceScreen.query.title': 'Smart manager assistant',
            'intelligenceScreen.query.description': 'Ask about memberships, attendance, or training and nutrition status.',
            'intelligenceScreen.query.label': 'Ask your question in natural language',
            'intelligenceScreen.query.placeholder': 'Example: Show members at risk of leaving',
            'intelligenceScreen.query.submit': 'Analyze question',
            'intelligenceScreen.query.answer': 'System analysis',
            'intelligenceScreen.plans.priority': 'Priority 04 · Act',
            'intelligenceScreen.plans.title': 'Create a plan, then refine it with instructions',
            'intelligenceScreen.plans.description': 'For example: “Add a chest press”, “Replace rice with potatoes”, or “Make it 5 meals”.',
            'intelligenceScreen.plans.type.label': 'Plan type',
            'intelligenceScreen.plans.type.workout': 'Workout plan',
            'intelligenceScreen.plans.type.diet': 'Nutrition plan',
            'intelligenceScreen.plans.client': 'Client',
            'intelligenceScreen.plans.client.loading': 'Loading clients…',
            'intelligenceScreen.plans.client.choose': 'Select a client',
            'intelligenceScreen.plans.client.fallback': 'Client',
            'intelligenceScreen.plans.goal': 'Goal',
            'intelligenceScreen.plans.goal.muscle': 'Build muscle',
            'intelligenceScreen.plans.goal.strength': 'Increase strength',
            'intelligenceScreen.plans.goal.fatLoss': 'Lose fat',
            'intelligenceScreen.plans.goal.maintain': 'Maintain weight',
            'intelligenceScreen.plans.goal.weightGain': 'Gain mass',
            'intelligenceScreen.plans.goal.fitness': 'General fitness',
            'intelligenceScreen.plans.level': 'Level',
            'intelligenceScreen.plans.level.beginner': 'Beginner',
            'intelligenceScreen.plans.level.intermediate': 'Intermediate',
            'intelligenceScreen.plans.level.advanced': 'Advanced',
            'intelligenceScreen.plans.days': 'Days per week',
            'intelligenceScreen.plans.duration': 'Duration in weeks',
            'intelligenceScreen.plans.limitations': 'Excluded exercises or limitations',
            'intelligenceScreen.plans.limitations.placeholder': 'Example: no squats or barbell',
            'intelligenceScreen.plans.meals': 'Meals per day',
            'intelligenceScreen.plans.calories': 'Target calories',
            'intelligenceScreen.plans.calories.placeholder': 'Optional',
            'intelligenceScreen.plans.allergies': 'Allergies or excluded foods',
            'intelligenceScreen.plans.allergies.placeholder': 'Example: milk, peanuts',
            'intelligenceScreen.plans.activity': 'Activity',
            'intelligenceScreen.plans.activity.moderate': 'Moderate',
            'intelligenceScreen.plans.activity.sedentary': 'Very low',
            'intelligenceScreen.plans.activity.light': 'Light',
            'intelligenceScreen.plans.activity.high': 'High',
            'intelligenceScreen.plans.generate': 'Generate smart suggestion',
            'intelligenceScreen.plan.empty.title': 'Select a client to start a suggestion',
            'intelligenceScreen.plan.empty.description': 'The result appears as a draft that you can refine before saving.',
            'intelligenceScreen.plan.draft': 'Draft for review',
            'intelligenceScreen.plan.status.draft': 'Draft',
            'intelligenceScreen.plan.suggestion': 'Smart suggestion',
            'intelligenceScreen.plan.days': 'days',
            'intelligenceScreen.plan.exercises': 'exercises',
            'intelligenceScreen.plan.weeks': 'weeks',
            'intelligenceScreen.plan.level': 'level',
            'intelligenceScreen.plan.meals': 'meals',
            'intelligenceScreen.plan.foods': 'foods',
            'intelligenceScreen.plan.calories': 'calories',
            'intelligenceScreen.plan.protein': 'protein',
            'intelligenceScreen.plan.applied': 'Changes applied',
            'intelligenceScreen.plan.review': 'Review required before approval',
            'intelligenceScreen.plan.refine.label': 'Describe how to refine the draft',
            'intelligenceScreen.plan.refine.placeholder': 'Example: remove squats and add a leg press',
            'intelligenceScreen.plan.refine.submit': 'Regenerate with instructions',
            'intelligenceScreen.plan.save': 'Save as a draft',
            'intelligenceScreen.plan.manual': 'Open in the manual editor',
            'intelligenceScreen.plan.humanReview': 'The plan is not published as approved automatically; review it, then save or edit it manually.',
            'intelligenceScreen.message.loadError': 'Could not load the intelligence center.',
            'intelligenceScreen.message.permissionRead': 'You do not have permission to view the intelligence center.',
            'intelligenceScreen.message.permissionAssistant': 'You do not have permission to use the smart assistant.',
            'intelligenceScreen.message.questionRequired': 'Enter a question for the assistant first.',
            'intelligenceScreen.message.queryError': 'Could not analyze the question.',
            'intelligenceScreen.message.permissionGenerate': 'You do not have permission to generate intelligence suggestions.',
            'intelligenceScreen.message.clientRequired': 'Select a client before creating a suggestion.',
            'intelligenceScreen.message.planCreated': 'The smart draft was created. Review it before approval.',
            'intelligenceScreen.message.planError': 'Could not create the suggestion.',
            'intelligenceScreen.message.permissionRefine': 'You do not have permission to refine intelligence suggestions.',
            'intelligenceScreen.message.refineRequired': 'Describe the change you want to make to the draft.',
            'intelligenceScreen.message.refined': 'The draft was rebuilt using your instructions.',
            'intelligenceScreen.message.refineError': 'Could not apply the change.',
            'intelligenceScreen.message.permissionSave': 'You do not have permission to save a training or nutrition plan.',
            'intelligenceScreen.message.saved': 'Draft saved to Training & Nutrition. You can open and edit it manually.',
            'intelligenceScreen.message.saveError': 'Could not save the draft.',
            'intelligenceScreen.message.permissionManual': 'You do not have permission to open the Training & Nutrition editor.',
            'intelligenceScreen.message.manualError': 'Could not open the manual editor.',
            'intelligenceScreen.message.refreshed': 'Intelligence analysis refreshed.',
            'nav.feedback': 'Member feedback',
            'nav.management': 'Pricing & memberships',
            'nav.branding': 'Branding',
            'nav.member-payment-methods': 'Member payment methods',
            'nav.permissions': 'Account permissions',
            'nav.expenses': 'Expenses',
            'nav.member-subscription-requests': 'Membership requests',
            'nav.portal-analytics': 'Portal analytics',
            'nav.saas-billing': 'Platform subscription',
            'saasBilling.page.kicker': 'PLATFORM SUBSCRIPTION',
            'saasBilling.page.title': 'Gym subscription to the platform',
            'saasBilling.page.description': 'Manage your platform plan, upload payment proof, and track requests in one place.',
            'saasBilling.navigation.aria': 'Subscription path',
            'saasBilling.navigation.back': 'Back',
            'saasBilling.navigation.platform': 'Platform',
            'saasBilling.navigation.current': 'Gym subscriptions',
            'saasBilling.summary.gym': 'Gym',
            'saasBilling.summary.loading': 'Loading subscription details…',
            'saasBilling.summary.gymNotFound': 'Gym information could not be found.',
            'saasBilling.summary.status': 'Subscription status',
            'saasBilling.summary.noSubscription': 'No subscription',
            'saasBilling.summary.expiryUnknown': 'No end date specified',
            'saasBilling.summary.daysRemaining': '{{count}} days remaining',
            'saasBilling.summary.currentPlan': 'Current plan',
            'saasBilling.summary.noPlan': 'No plan',
            'saasBilling.summary.yearlyCycle': 'Annual cycle',
            'saasBilling.summary.monthlyCycle': 'Monthly cycle',
            'saasBilling.summary.subscriptionDetails': 'Subscription details',
            'saasBilling.summary.startDate': 'Subscription date',
            'saasBilling.summary.notSpecified': 'Not specified',
            'saasBilling.summary.until': 'Until {{date}}',
            'saasBilling.summary.openSubscription': 'Open-ended subscription',
            'saasBilling.summary.memberUsage': 'Member profiles used by the plan',
            'saasBilling.summary.limitMembers': 'of {{count}} members',
            'saasBilling.common.unlimited': 'Unlimited',
            'saasBilling.feature.dashboard': 'Dashboard',
            'saasBilling.feature.members': 'Member management',
            'saasBilling.feature.attendance': 'Attendance',
            'saasBilling.feature.coaching': 'Coaching',
            'saasBilling.feature.nutrition': 'Nutrition',
            'saasBilling.feature.ai': 'Artificial intelligence',
            'saasBilling.feature.library': 'Library',
            'saasBilling.feature.pricing': 'Membership pricing',
            'saasBilling.feature.payments': 'Payments',
            'saasBilling.feature.finance': 'Financial reports',
            'saasBilling.feature.day_passes': 'Day passes',
            'saasBilling.feature.reports': 'Reports',
            'saasBilling.feature.store': 'Store',
            'saasBilling.feature.inventory': 'Inventory',
            'saasBilling.feature.branches': 'Branches',
            'saasBilling.feature.bar': 'Bar and recipes',
            'saasBilling.feature.portal': 'Portal',
            'saasBilling.feature.branding': 'Gym branding',
            'saasBilling.feature.team': 'Team and permissions',
            'saasBilling.feature.backup': 'Backups',
            'saasBilling.feature.audit': 'Activity log',
            'saasBilling.feature.clients': 'Client management',
            'saasBilling.feature.assessments': 'Measurements and assessments',
            'saasBilling.feature.progress': 'Progress tracking',
            'saasBilling.feature.goals': 'Goals',
            'saasBilling.feature.sessions': 'Sessions',
            'saasBilling.feature.packages': 'Packages',
            'saasBilling.feature.notifications': 'Notifications',
            'saasBilling.feature.tasks': 'Action center',
            'saasBilling.feature.templates': 'Templates',
            'saasBilling.feature.prioritySupport': 'Priority support',
            'saasBilling.current.title': 'Current subscription',
            'saasBilling.current.noActivePlan': 'No active plan',
            'saasBilling.current.choosePlanHint': 'Choose a plan from the current list to submit a request.',
            'saasBilling.pending.kicker': 'Request status',
            'saasBilling.pending.title': 'Subscription request under review',
            'saasBilling.pending.description': 'Your request was submitted. You will be notified after it is reviewed.',
            'saasBilling.pending.month': 'month',
            'saasBilling.pending.months': 'months',
            'saasBilling.pending.sentAt': 'Submitted: {{date}}',
            'saasBilling.pending.proofAttached': 'Attached',
            'saasBilling.pending.proofMissing': 'Not attached',
            'saasBilling.plans.kicker': 'PLANS',
            'saasBilling.plans.title': 'Available plans',
            'saasBilling.plans.description': 'Compare platform plans and choose the level that fits your gym.',
            'saasBilling.plans.compare': 'Compare plans',
            'saasBilling.plans.loading': 'Loading plans…',
            'saasBilling.plans.empty': 'No active plans are available. Contact the platform administrator.',
            'saasBilling.plans.term': 'Billing term',
            'saasBilling.plans.termFor': 'Billing term for {{name}}',
            'saasBilling.plans.termUnavailable': 'Term unavailable',
            'saasBilling.plans.monthly': 'Monthly',
            'saasBilling.plans.quarterly': '3 months',
            'saasBilling.plans.semiannual': '6 months',
            'saasBilling.plans.annual': 'Annual',
            'saasBilling.plans.duration': '{{count}} months',
            'saasBilling.plans.members': 'Members',
            'saasBilling.plans.clients': 'Clients',
            'saasBilling.plans.users': 'Users',
            'saasBilling.plans.aiMonthly': 'Monthly AI',
            'saasBilling.plans.branches': 'Branches',
            'saasBilling.plans.storage': 'Storage',
            'saasBilling.plans.features': 'Plan features',
            'saasBilling.plans.featuresEmpty': 'No additional features are listed for this plan.',
            'saasBilling.plans.upgrade': 'Upgrade',
            'saasBilling.plans.choosePlaceholder': 'Choose a plan',
            'saasBilling.plans.current': 'Current plan',
            'saasBilling.plans.select': 'Select plan',
            'saasBilling.review.kicker': 'MANUAL REVIEW',
            'saasBilling.review.title': 'Submit a subscription request',
            'saasBilling.review.description': 'Complete the details below and upload payment proof for review.',
            'saasBilling.review.secureUpload': 'Secure upload',
            'saasBilling.form.plan': 'Requested plan *',
            'saasBilling.form.term': 'Requested billing term *',
            'saasBilling.form.notes': 'Additional notes',
            'saasBilling.form.optional': 'Optional',
            'saasBilling.form.notesPlaceholder': 'Add any details that may help the review',
            'saasBilling.form.proof': 'Payment proof',
            'saasBilling.form.proofHint': 'Image or PDF up to 4MB',
            'saasBilling.form.uploadProof': 'Upload payment proof',
            'saasBilling.form.dropOrChoose': 'Drop a file here or choose it from your device',
            'saasBilling.form.noFile': 'No file selected',
            'saasBilling.form.chooseFile': 'Choose file',
            'saasBilling.form.allowedTypes': 'PNG, JPG, or PDF · 4MB maximum',
            'saasBilling.form.submit': 'Submit for review',
            'saasBilling.form.submitLoading': 'Submitting request…',
            'saasBilling.form.close': 'Close subscription request form',
            'saasBilling.form.closeButton': 'Close',
            'saasBilling.form.reviewPlatform': 'Platform review',
            'saasBilling.form.renewTitle': 'Request subscription renewal',
            'saasBilling.form.renewDescription': 'Choose a plan and term, then attach payment proof to submit the request for review.',
            'saasBilling.form.totalPlatform': 'Total based on platform settings',
            'saasBilling.form.choosePlanTerm': 'Choose a plan and term',
            'saasBilling.form.manageTitle': 'Manage gym subscription',
            'saasBilling.form.managePrompt': 'Would you like to upgrade or renew?',
            'saasBilling.form.openRequest': 'Submit subscription request',
            'saasBilling.summary.total': 'Total: {{amount}}',
            'saasBilling.requests.kicker': 'REQUEST HISTORY',
            'saasBilling.requests.title': 'Subscription request history',
            'saasBilling.requests.description': 'All requests, their statuses, and proof files appear here.',
            'saasBilling.requests.loading': 'Loading requests…',
            'saasBilling.requests.empty': 'No subscription requests have been submitted yet.',
            'saasBilling.requests.date': 'Date',
            'saasBilling.requests.plan': 'Plan',
            'saasBilling.requests.duration': 'Duration',
            'saasBilling.requests.amount': 'Amount',
            'saasBilling.requests.status': 'Status',
            'saasBilling.requests.proof': 'Proof',
            'saasBilling.requests.reviewNotes': 'Review notes',
            'saasBilling.requests.showProof': 'View proof',
            'saasBilling.requests.noProof': 'Not attached',
            'saasBilling.requests.noNotes': 'No notes',
            'saasBilling.requests.paginationAria': 'Subscription request pages',
            'saasBilling.requests.summary': 'Showing {{shown}} of {{total}} requests',
            'saasBilling.requests.none': 'No requests',
            'saasBilling.message.choosePlan': 'Choose a plan first.',
            'saasBilling.message.chooseTerm': 'Choose an available billing term for the plan.',
            'saasBilling.message.uploadProof': 'Upload payment proof before submitting the request.',
            'saasBilling.message.proofTooLarge': 'Payment proof must not exceed 4MB.',
            'saasBilling.message.requestSavedProofUnconfirmed': 'The request was saved, but its payment proof could not be confirmed. Refresh the request history before submitting again.',
            'saasBilling.message.requestSent': 'Subscription request submitted successfully and is now under review.',
            'saasBilling.message.pendingExists': 'You already have a subscription request under review.',
            'saasBilling.message.requestFailed': 'Could not submit the subscription request.',
            'saasBilling.message.loadFailed': 'Could not load the platform subscription.',
            'saasBilling.proof.popupBlocked': 'Allow the proof preview window to open, then try again.',
            'saasBilling.proof.invalidType': 'The proof file response is not a valid image or PDF.',
            'saasBilling.proof.invalidFile': 'Could not verify the payment proof file.',
            'saasBilling.proof.displayFailed': 'Could not display payment proof.',
            'saasBilling.status.trial': 'Trial',
            'saasBilling.status.active': 'Active',
            'saasBilling.status.expired': 'Expired',
            'saasBilling.status.suspended': 'Suspended',
            'saasBilling.status.cancelled': 'Cancelled',
            'saasBilling.status.pending': 'Under review',
            'saasBilling.status.approved': 'Approved',
            'saasBilling.status.rejected': 'Rejected',
            'nav.backup-history': 'Backup history',
            'backupHistory.page.kicker': 'Data protection',
            'backupHistory.page.title': 'Backup history',
            'backupHistory.page.description': 'Review saved daily backups and download, verification, and recovery activity in one dedicated view.',
            'backupHistory.action.refresh': 'Refresh history',
            'backupHistory.action.refreshLoading': 'Refreshing history…',
            'backupHistory.tools.title': 'Backup and recovery tools',
            'backupHistory.tools.description': 'Create a {{brand}} backup in .json.gz format, then inspect and restore it safely from this screen.',
            'backupHistory.tools.create': 'Create saved backup',
            'backupHistory.tools.download': 'Download snapshot .json.gz',
            'backupHistory.tools.restore': 'Restore a file',
            'backupHistory.loading': 'Loading backup history…',
            'backupHistory.section.archives': 'Saved gym backups',
            'backupHistory.section.retention': 'The platform retains daily backups for {{count}} days',
            'backupHistory.section.audit': 'Audit log',
            'backupHistory.audit.count': '{{count}} operations shown',
            'backupHistory.column.file': 'File',
            'backupHistory.column.type': 'Type',
            'backupHistory.column.status': 'Status',
            'backupHistory.column.data': 'Data',
            'backupHistory.column.size': 'Size',
            'backupHistory.column.verifiedAt': 'Last verified',
            'backupHistory.column.actions': 'Actions',
            'backupHistory.column.date': 'Date',
            'backupHistory.column.operation': 'Operation',
            'backupHistory.column.result': 'Result',
            'backupHistory.column.reason': 'Reason',
            'backupHistory.rows.count': '{{count}} rows',
            'backupHistory.action.download': 'Download',
            'backupHistory.action.restore': 'Restore',
            'backupHistory.action.delete': 'Delete',
            'backupHistory.empty.archives': 'No saved backups for this gym yet.',
            'backupHistory.empty.audit': 'No operations have been recorded yet.',
            'backupHistory.empty.operations': 'No backup history is available yet.',
            'backupHistory.storage.title': 'Private storage is not configured',
            'backupHistory.storage.description': 'Saved backups cannot be trusted until the platform administrator connects an approved private storage provider. Failed backups remain recorded as failed and are never presented as verified.',
            'backupHistory.status.pending': 'Pending',
            'backupHistory.status.running': 'Running',
            'backupHistory.status.uploaded': 'Uploaded',
            'backupHistory.status.verifying': 'Verifying',
            'backupHistory.status.verified': 'Verified',
            'backupHistory.status.failed': 'Failed',
            'backupHistory.status.expired': 'Expired',
            'backupHistory.status.deleted': 'Deleted',
            'backupHistory.status.success': 'Successful',
            'backupHistory.status.unknown': 'Other status',
            'backupHistory.type.tenantDaily': 'Daily backup',
            'backupHistory.type.tenantManual': 'Manual backup',
            'backupHistory.type.tenantPreRestore': 'Pre-restore safety backup',
            'backupHistory.type.unknown': 'Other type',
            'backupHistory.event.created': 'Backup created',
            'backupHistory.event.verified': 'Backup verified',
            'backupHistory.event.downloaded': 'Backup downloaded',
            'backupHistory.event.deleted': 'Backup deleted',
            'backupHistory.event.restoreRequested': 'Restore requested',
            'backupHistory.event.restoreStarted': 'Restore started',
            'backupHistory.event.restoreCompleted': 'Restore completed',
            'backupHistory.event.restoreFailed': 'Restore failed',
            'backupHistory.event.unknown': 'Other backup operation',
            'backupHistory.storage.unavailable': 'Private backup storage is not configured',
            'backupHistory.error.load': 'Could not load backup history.',
            'backupHistory.error.loadTitle': 'Could not load backup history',
            'backupHistory.error.retry': 'Please try again.',
            'backupHistory.confirm.close': 'Close',
            'backupHistory.operation.download': 'Download backup',
            'backupHistory.operation.inspect': 'Inspect backup',
            'backupHistory.operation.restore': 'Restore backup',
            'shell.branch': 'Branch',
            'shell.branch.current': 'Current branch',
            'shell.section': 'Section',
            'shell.section.current': 'Current section',
            'shell.context': 'Workspace context',
            'shell.context.subtitle': 'Branch and section',
            'shell.menu': 'Open navigation',
            'shell.addMember': 'Add member',
            'shell.pricing': 'Pricing',
            'shell.refresh': 'Refresh data',
            'shell.theme.dark': 'Enable dark theme',
            'shell.theme.light': 'Enable light theme',
            'shell.theme.darkName': 'Dark theme',
            'shell.theme.lightName': 'Light theme',
            'shell.fullscreen': 'Full screen',
            'shell.logout': 'Sign out',
            'shell.account': 'Current user account',
            'shell.assistant.ask': 'Ask the assistant',
            'shell.assistant.open': 'Open the smart assistant',
            'dialogs.close.title': 'Close',
            'dialogs.close.aria': 'Close dialog',
            'attendance.qr.reader.title': 'Scan QR Code',
            'attendance.qr.reader.description': 'Point your phone camera at the member’s code.',
            'attendance.qr.reader.close': 'Close',
            'attendance.qr.reader.note': 'If the camera does not work, close this dialog and record attendance by phone number.'
            , 'dashboard.loading': 'Preparing dashboard metrics…'
            , 'dashboard.aria.actions': 'Dashboard actions'
            , 'dashboard.status.live': 'System is live'
            , 'dashboard.eyebrow': 'Daily operations overview'
            , 'dashboard.welcome.prefix': 'Welcome to'
            , 'dashboard.welcome.subtitle': 'Smarter management for a stronger gym.'
            , 'dashboard.meta.insights': 'Clear insights'
            , 'dashboard.meta.secure': 'Your data is securely organized'
            , 'dashboard.quickActions.title': 'Quick shortcuts'
            , 'dashboard.quickActions.description': 'Jump directly to your daily operating tools.'
            , 'dashboard.action.members': 'View members'
            , 'dashboard.action.printMemberships': 'Print memberships'
            , 'dashboard.action.printPlans': 'Print pricing'
            , 'dashboard.action.printMembershipsTitle': 'Create a PDF of memberships and plans'
            , 'dashboard.action.printPlansTitle': 'Open the pricing and membership print view'
            , 'dashboard.summary.subscription': 'Current subscription summary'
            , 'dashboard.summary.plan': 'Current plan'
            , 'dashboard.summary.memberCount': 'Member count'
            , 'dashboard.summary.subscriptionDate': 'Subscription date'
            , 'dashboard.memberships.aria': 'Membership and alerts summary'
            , 'dashboard.memberships.eyebrow': 'Membership status'
            , 'dashboard.memberships.quickSummary': 'Quick member summary'
            , 'dashboard.memberships.totalSubscriptions': 'Total memberships'
            , 'dashboard.memberships.monthNetRemaining': 'Remaining / net for month'
            , 'dashboard.memberships.pausedCaption': 'Temporarily paused'
            , 'dashboard.action.manageExpenses': 'Manage expenses'
            , 'dashboard.memberships.title': 'Membership summary'
            , 'dashboard.memberships.total': 'Total members'
            , 'dashboard.memberships.allMembers': 'All members'
            , 'dashboard.memberships.active': 'Active'
            , 'dashboard.memberships.activeCaption': 'Current membership'
            , 'dashboard.memberships.expiring': 'Expiring soon'
            , 'dashboard.memberships.expiringCaption': 'Within 7 days'
            , 'dashboard.memberships.expired': 'Expired'
            , 'dashboard.memberships.expiredCaption': 'Needs follow-up'
            , 'dashboard.memberships.frozen': 'Frozen now'
            , 'dashboard.memberships.frozenCaption': 'Temporarily paused'
            , 'dashboard.alerts.eyebrow': 'Today’s follow-up'
            , 'dashboard.alerts.title': 'Daily alerts'
            , 'dashboard.alerts.description': 'Review cases that need prompt action'
            , 'dashboard.alerts.count': '{{count}} alerts'
            , 'dashboard.alerts.emptyCount': 'No alerts'
            , 'dashboard.alerts.aria': 'Search daily alerts'
            , 'dashboard.alerts.searchPlaceholder': 'Search by member name or phone'
            , 'dashboard.alerts.loading': 'Loading alerts…'
            , 'dashboard.alerts.empty': 'There are no alerts today.'
            , 'dashboard.alerts.filter': 'Filter alerts'
            , 'dashboard.alerts.filterShort': 'Filter'
            , 'dashboard.alerts.pagination': 'Alerts pagination'
            , 'dashboard.alerts.showLess': 'Show less'
            , 'dashboard.alerts.showAll': 'View all ({{count}})'
            , 'dashboard.alerts.resultCount': '{{visible}} of {{total}}'
            , 'dashboard.alerts.kind.debt': 'Outstanding balance'
            , 'dashboard.alerts.kind.inactive': 'Long absence'
            , 'dashboard.alerts.status.active': 'Active'
            , 'dashboard.alerts.status.expiring': 'Expiring soon'
            , 'dashboard.alerts.status.expired': 'Expired'
            , 'dashboard.alerts.status.frozen': 'Frozen'
            , 'dashboard.alerts.status.unknown': 'Alert'
            , 'dashboard.alerts.detail.debt': 'Balance remaining: {{amount}}'
            , 'dashboard.alerts.detail.neverVisited': 'No attendance has been recorded'
            , 'dashboard.alerts.detail.lastVisit': 'Last visit {{count}} days ago'
            , 'dashboard.alerts.detail.frozenUntil': 'Frozen until {{date}}'
            , 'dashboard.alerts.detail.expiredAt': 'Expired on {{date}}'
            , 'dashboard.alerts.detail.expiresAt': 'Expires on {{date}}'
            , 'dashboard.alerts.whatsapp.renewal': 'Renewal message'
            , 'dashboard.alerts.whatsapp.manual': 'WhatsApp message'
            , 'dashboard.alerts.whatsapp.sendRenewal': 'Send renewal message'
            , 'dashboard.alerts.whatsapp.contact': 'Contact via WhatsApp'
            , 'dashboard.alerts.whatsapp.send': 'Send WhatsApp message'
            , 'dashboard.finance.eyebrow': 'Finance'
            , 'dashboard.finance.title': 'Current month summary'
            , 'dashboard.finance.loading': 'Loading monthly finance…'
            , 'dashboard.finance.autoUpdate': 'Auto-updating'
            , 'dashboard.finance.subscriptions': 'Membership collections'
            , 'dashboard.finance.subscriptionsHelp': 'Actual membership collections during this period'
            , 'dashboard.finance.dayPasses': 'Daily passes'
            , 'dashboard.finance.noDayPasses': 'No daily passes recorded'
            , 'dashboard.finance.expenses': 'Expenses'
            , 'dashboard.finance.addExpense': 'Add expense'
            , 'dashboard.finance.noExpenses': 'No expenses recorded'
            , 'dashboard.finance.net': 'Net for the month'
            , 'dashboard.finance.netHelp': 'Actual collections − expenses'
            , 'dashboard.finance.loadingExpenses': 'Loading expenses…'
            , 'expenses.eyebrow': 'Finance'
            , 'expenses.title': 'Manage expenses'
            , 'expenses.description': 'Add, edit, and delete this month’s expenses in one place.'
            , 'expenses.add': 'Add expense'
            , 'expenses.list.heading': 'Item and date'
            , 'expenses.list.amount': 'Amount'
            , 'expenses.list.actions': 'Actions'
            , 'expenses.list.empty': 'No expenses recorded this month.'
            , 'expenses.state.loading': 'Loading monthly finance…'
            , 'expenses.state.loadingData': 'Loading finance data…'
            , 'expenses.state.unavailable': 'Unavailable until finance data loads.'
            , 'expenses.state.refreshing': 'Updating monthly finance…'
            , 'expenses.state.updated': 'Updated just now'
            , 'expenses.state.loadFailed': 'Load failed'
            , 'expenses.state.refreshFailed': 'Refresh failed'
            , 'expenses.state.loadError': 'Monthly finance could not be loaded. Refresh the page or try again later.'
            , 'expenses.state.loadingExpenses': 'Loading expenses…'
            , 'expenses.list.error': 'The expense list could not be loaded. Try refreshing again.'
            , 'expenses.summary.collectionCount': '{{count}} collection transactions · actual collections for the period'
            , 'expenses.summary.dayPassCount': '{{count}} passes · actual collections'
            , 'expenses.summary.noDayPasses': 'No daily passes recorded'
            , 'expenses.summary.expenseCount': '{{count}} expenses · recorded during the period'
            , 'expenses.summary.noExpenses': 'No expenses recorded'
            , 'expenses.summary.netWithRefunds': 'Actual collections − expenses − refunds'
            , 'expenses.summary.net': 'Actual collections − expenses'
            , 'expenses.list.periodCount': '{{count}} expenses recorded during this period'
            , 'expenses.dialog.add.title': 'Add expense'
            , 'expenses.dialog.edit.title': 'Edit expense'
            , 'expenses.dialog.add.description': 'Record a new expense to deduct it from the current month’s net total.'
            , 'expenses.dialog.edit.description': 'Update the expense; the expense total and monthly net will refresh automatically.'
            , 'expenses.dialog.close': 'Close'
            , 'expenses.field.name': 'Expense name *'
            , 'expenses.field.name.placeholder': 'Example: rent or maintenance'
            , 'expenses.field.amount': 'Amount *'
            , 'expenses.field.date': 'Date *'
            , 'expenses.field.notes': 'Optional note'
            , 'expenses.field.notes.placeholder': 'Add a brief detail if needed'
            , 'expenses.action.cancel': 'Cancel'
            , 'expenses.action.save': 'Save expense'
            , 'expenses.action.saveEdit': 'Save changes'
            , 'expenses.action.edit': 'Edit expense'
            , 'expenses.action.delete': 'Delete expense'
            , 'dashboard.dayPasses.eyebrow': 'Daily revenue'
            , 'dashboard.dayPasses.title': 'Daily passes'
            , 'dashboard.dayPasses.monthSummary': 'Summary of passes recorded in {{month}}'
            , 'dashboard.dayPasses.add': 'Add pass'
            , 'dashboard.dayPasses.manage': 'Manage records'
            , 'dashboard.dayPasses.monthCount': 'Passes this month'
            , 'dashboard.dayPasses.monthRevenue': 'Pass revenue this month'
            , 'dashboard.dayPasses.loading': 'Loading pass records…'
            , 'dashboard.dayPasses.empty': 'No passes recorded this month.'
            , 'dashboard.dayPasses.column.visitor': 'Visitor'
            , 'dashboard.dayPasses.column.type': 'Pass type'
            , 'dashboard.dayPasses.column.date': 'Date'
            , 'dashboard.dayPasses.column.amount': 'Amount'
            , 'dashboard.dayPasses.column.actions': 'Actions'
            , 'dashboard.store.title': 'Store summary'
            , 'dashboard.store.sales': 'Store sales'
            , 'dashboard.store.description': 'A quick summary that keeps gym metrics in focus.'
            , 'dashboard.store.open': 'Open store'
            , 'dashboard.store.todaySales': 'Today’s sales'
            , 'dashboard.store.monthSales': 'Sales this month'
            , 'dashboard.store.expenses': 'Store expenses'
            , 'dashboard.store.netProfit': 'Net profit'
            , 'dashboard.store.stockAlerts': 'Stock alerts'
            , 'dashboard.analytics.eyebrow': '{{brand}} analytics'
            , 'dashboard.analytics.title': 'Performance metrics and charts'
            , 'dashboard.analytics.loading': 'Loading analytics…'
            , 'dashboard.analytics.refreshing': 'Refreshing metrics…'
            , 'dashboard.analytics.loadError': 'Could not load analytics.'
            , 'dashboard.analytics.refreshError': 'Could not refresh analytics.'
            , 'dashboard.analytics.period.week': 'Weekly'
            , 'dashboard.analytics.period.month': 'Monthly'
            , 'dashboard.analytics.period.year': 'Yearly'
            , 'dashboard.analytics.period.weekLabel': 'This week'
            , 'dashboard.analytics.period.monthLabel': 'This month'
            , 'dashboard.analytics.period.yearLabel': 'This year'
            , 'dashboard.analytics.period.range': '{{period}} · {{start}} — {{end}}'
            , 'dashboard.analytics.label.smartReading': 'Smart insights'
            , 'dashboard.analytics.label.health': 'Health score'
            , 'dashboard.analytics.label.activityRate': 'Activity rate'
            , 'dashboard.analytics.label.collectionTrend': 'Collection trend'
            , 'dashboard.analytics.label.followupPriority': 'Follow-up priority'
            , 'dashboard.analytics.label.newMembers': 'New members'
            , 'dashboard.analytics.label.actualCollections': 'Collections'
            , 'dashboard.analytics.label.periodNet': 'Net for period'
            , 'dashboard.analytics.label.attendanceVisits': 'Attendance visits'
            , 'dashboard.analytics.label.outstanding': 'Outstanding balances'
            , 'dashboard.analytics.label.needsFollowup': 'Needs follow-up'
            , 'dashboard.analytics.label.financialActivity': 'Financial activity'
            , 'dashboard.analytics.label.collections': 'Collections'
            , 'dashboard.analytics.label.expenses': 'Expenses'
            , 'dashboard.analytics.label.currentState': 'Current state'
            , 'dashboard.analytics.label.memberStatuses': 'Member statuses'
            , 'dashboard.analytics.label.membershipDistribution': 'Membership distribution'
            , 'dashboard.analytics.label.paymentMethods': 'Payment methods'
            , 'dashboard.analytics.label.duringPeriod': 'During period'
            , 'dashboard.analytics.label.financialMovement': 'Financial activity'
            , 'dashboard.analytics.label.collectionExpenses': 'Collections and expenses'
            , 'dashboard.analytics.label.memberStates': 'Member statuses'
            , 'dashboard.analytics.label.membershipsActivity': 'Members and memberships'
            , 'dashboard.analytics.label.operations': 'Operations analysis'
            , 'dashboard.analytics.label.attendance': 'Attendance analysis'
            , 'dashboard.analytics.empty.chartStatus': 'No member statuses recorded.'
            , 'dashboard.analytics.empty.chartMemberships': 'No data for this period.'
            , 'dashboard.analytics.empty.chartTrend': 'Not enough data yet.'
            , 'dashboard.analytics.label.traffic': 'Peak traffic'
            , 'dashboard.analytics.label.commitment': 'Attendance'
            , 'dashboard.analytics.label.collection': 'Collections'
            , 'dashboard.analytics.label.expense': 'Expenses'
            , 'dashboard.analytics.error.period': 'Analytics period'
            , 'dashboard.analytics.label.activity': 'Activity'
            , 'dashboard.analytics.label.membersAndMemberships': 'Members and memberships'
            , 'dashboard.analytics.label.operationsAnalysis': 'Operations analysis'
            , 'dashboard.analytics.label.attendanceAnalysis': 'Attendance analysis'
            , 'dashboard.analytics.label.attendanceDescription': 'See peak hours, your most frequent visitors, and who needs follow-up.'
            , 'dashboard.analytics.label.peakHours': 'Peak hours'
            , 'dashboard.analytics.label.mostAttended': 'Most frequent visitors'
            , 'dashboard.analytics.label.followup': 'Follow-up'
            , 'dashboard.analytics.label.absent7Days': 'No visits in 7 days'
            , 'dashboard.analytics.empty.trend': 'Financial activity will appear after the first collection or expense.'
            , 'dashboard.analytics.empty.status': 'No member statuses recorded.'
            , 'dashboard.analytics.empty.memberships': 'No data for this period.'
            , 'dashboard.analytics.empty.activity': 'No member registrations or memberships during this period.'
            , 'dashboard.analytics.empty.visits': 'No visits recorded during this period.'
            , 'dashboard.analytics.empty.allAttended': 'All members visited within the last 7 days.'
            , 'dashboard.analytics.empty.comparison': 'No comparison period available'
            , 'dashboard.analytics.empty.priority': 'No urgent follow-up needed'
            , 'dashboard.analytics.health.excellent': 'Excellent performance'
            , 'dashboard.analytics.health.stable': 'Stable performance'
            , 'dashboard.analytics.health.followup': 'Needs follow-up'
            , 'dashboard.analytics.health.intervention': 'Data needs attention'
            , 'dashboard.analytics.comparison.new': 'New this period'
            , 'dashboard.analytics.comparison.none': 'No activity'
            , 'dashboard.analytics.comparison.flat': 'No change from previous period'
            , 'dashboard.analytics.comparison.previous': 'from previous period'
            , 'dashboard.analytics.net.positive': 'Net is positive; expenses are {{ratio}}% of collections.'
            , 'dashboard.analytics.net.negative': 'Expenses exceed collections and need review.'
            , 'dashboard.analytics.net.afterExpenses': 'Collections − expenses'
            , 'dashboard.analytics.net.afterRefunds': 'Collections − expenses − refunds'
            , 'dashboard.analytics.priority.balance': '{{count}} memberships have a balance'
            , 'dashboard.analytics.priority.expiring': '{{count}} memberships are nearing expiry'
            , 'dashboard.analytics.priority.inactive': '{{count}} members need re-engagement'
            , 'dashboard.analytics.meta.transactions': '{{count}} payments · amount collected during this period'
            , 'dashboard.analytics.meta.activeMembers': '{{active}} active members out of {{total}}'
            , 'dashboard.analytics.meta.uniqueMembers': '{{count}} members attended'
            , 'dashboard.analytics.meta.outstandingCount': '{{count}} memberships'
            , 'dashboard.analytics.meta.inactiveMembers': '{{count}} absent for 7 days'
            , 'dashboard.analytics.meta.datedVisit': '{{count}} visits'
            , 'dashboard.analytics.meta.visitCount': '{{count}} visits'
            , 'dashboard.analytics.attendance.peak': 'Peak {{hour}}'
            , 'dashboard.analytics.chart.aria': 'Collections and expenses chart'
            , 'dashboard.analytics.activity.newMembers': 'New members'
            , 'dashboard.analytics.activity.memberships': 'Memberships'
            , 'dashboard.analytics.activity.memberTitle': 'New members: {{count}}'
            , 'dashboard.analytics.activity.membershipTitle': 'Memberships: {{count}}'
            , 'dashboard.analytics.attendance.lastVisit': 'Last visit'
            , 'dashboard.analytics.attendance.notVisited': 'No visit recorded'
            , 'dashboard.analytics.attendance.firstVisitNeeded': 'Needs a first visit'
            , 'dashboard.analytics.attendance.daysAgo': '{{count}} days ago'
            , 'dashboard.analytics.value.active': 'Active'
            , 'dashboard.analytics.value.expiring_soon': 'Expiring soon'
            , 'dashboard.analytics.value.expired': 'Expired'
            , 'dashboard.analytics.value.frozen': 'Frozen'
            , 'dashboard.analytics.value.gym_only': 'Gym only'
            , 'dashboard.analytics.value.gym_cardio': 'Gym and cardio'
            , 'dashboard.analytics.value.monthly': 'Monthly'
            , 'dashboard.analytics.value.half_month': 'Half-month'
            , 'dashboard.analytics.value.quarterly': 'Quarterly'
            , 'dashboard.analytics.value.semiannual': 'Semiannual'
            , 'dashboard.analytics.value.annual': 'Annual'
            , 'dashboard.analytics.value.two month': 'Two months'
            , 'dashboard.analytics.value.custom_mslzyl8m': 'Two months'
            , 'dashboard.analytics.value.cash': 'Cash'
            , 'dashboard.analytics.value.card': 'Card'
            , 'dashboard.analytics.value.transfer': 'Transfer'
            , 'dashboard.analytics.value.other': 'Other'
            , 'dashboard.analytics.error.generic': 'Could not load analytics.'
            , 'store.tabs.pos': 'Point of sale'
            , 'store.tabs.bar': 'Bar POS'
            , 'store.tabs.products': 'Products'
            , 'store.tabs.inventory': 'Inventory'
            , 'store.tabs.purchases': 'Purchases'
            , 'store.tabs.sales': 'Sales'
            , 'store.tabs.suppliers': 'Suppliers'
            , 'store.tabs.expenses': 'Store expenses'
            , 'store.tabs.reports': 'Store reports'
            , 'store.common.refresh': 'Refresh'
            , 'store.common.clear': 'Clear'
            , 'store.common.cancel': 'Cancel'
            , 'store.common.save': 'Save'
            , 'store.common.loadingProducts': 'Loading products…'
            , 'store.common.loadingInventory': 'Loading inventory…'
            , 'store.common.loadingPurchases': 'Loading purchases…'
            , 'store.common.loadingSales': 'Loading sales…'
            , 'store.common.loadingSuppliers': 'Loading suppliers…'
            , 'store.common.loadingExpenses': 'Loading expenses…'
            , 'store.pos.searchProducts': 'Search products'
            , 'store.pos.searchPlaceholder': 'Search for a product…'
            , 'store.pos.searchHelp': 'Search by name, SKU, or barcode.'
            , 'store.pos.noMatchingProducts': 'No products match your search.'
            , 'store.pos.cart': 'Cart'
            , 'store.pos.noProductsAdded': 'No products added'
            , 'store.pos.cartEmpty': 'Add a product to the cart to begin.'
            , 'store.pos.customerOptional': 'Customer (optional)'
            , 'store.pos.customerPlaceholder': 'Member name or phone…'
            , 'store.pos.discount': 'Discount'
            , 'store.pos.tax': 'Tax'
            , 'store.pos.paid': 'Paid'
            , 'store.pos.amountPlaceholder': 'Full amount'
            , 'store.pos.paymentMethod': 'Payment method'
            , 'store.pos.notes': 'Notes'
            , 'store.pos.total': 'Total'
            , 'store.pos.completeSale': 'Complete sale and print receipt'
            , 'store.pos.cash': 'Cash'
            , 'store.pos.card': 'Card'
            , 'store.pos.transfer': 'Transfer'
            , 'store.pos.wallet': 'Wallet'
            , 'store.pos.other': 'Other'
            , 'store.products.manage': 'Manage products'
            , 'store.products.description': 'Add products with SKU, purchase and selling prices, and minimum stock.'
            , 'store.products.add': 'Add product'
            , 'store.products.name': 'Product name (Arabic)'
            , 'store.products.category': 'Category'
            , 'store.products.sku': 'SKU'
            , 'store.products.barcode': 'Barcode'
            , 'store.products.cost': 'Purchase cost'
            , 'store.products.price': 'Selling price'
            , 'store.products.minimumStock': 'Minimum stock'
            , 'store.products.trackInventory': 'Track inventory'
            , 'store.products.noProducts': 'No products yet.'
            , 'store.products.variants': '{{count}} variants'
            , 'store.products.statusActive': 'Active'
            , 'store.products.statusInactive': 'Inactive'
            , 'store.status.received': 'Received'
            , 'store.status.completed': 'Completed'
            , 'store.dashboard.todaySales': "Today's sales"
            , 'store.dashboard.monthRevenue': 'Monthly sales'
            , 'store.dashboard.expenses': 'Store expenses'
            , 'store.dashboard.netProfit': 'Net profit'
            , 'store.dashboard.stockAlerts': 'Stock alerts'
            , 'store.reports.cogs': 'Cost of goods'
            , 'store.reports.netProfit': 'Net profit'
            , 'store.products.edit': 'Edit'
            , 'store.products.deactivate': 'Deactivate'
            , 'store.inventory.description': 'Current balance, alerts, and stock adjustments.'
            , 'store.inventory.balance': 'Balance'
            , 'store.inventory.minimum': 'Minimum'
            , 'store.inventory.expiry': 'Expiry'
            , 'memberPortal.title': 'My membership'
            , 'memberPortal.intro': 'Check your membership, attendance, and payments with your personal membership code.'
            , 'memberPortal.membershipCode': 'Membership code'
            , 'memberPortal.secureEntry': 'Secure access'
            , 'memberPortal.secureEntryHelp': 'Enter the code provided by your gym and do not share it with anyone.'
            , 'memberPortal.viewData': 'View my details'
            , 'memberPortal.portalTitle': 'Member portal'
            , 'memberPortal.chooseService': 'Choose a service to continue'
            , 'memberPortal.printReport': 'Print report'
            , 'memberPortal.downloadPdf': 'Download PDF'
            , 'memberPortal.anotherCode': 'Use another code'
            , 'memberPortal.occupancy.kicker': 'Gym occupancy now'
            , 'memberPortal.occupancy.title': 'Check how busy the gym is before you head out'
            , 'memberPortal.occupancy.privacy': 'An approximate count protects member privacy. No names or personal details are shown.'
            , 'memberPortal.occupancy.peopleInside': 'people inside the gym'
            , 'memberPortal.occupancy.loading': 'Updating occupancy'
            , 'memberPortal.occupancy.safeEstimate': 'Estimating current attendance securely'
            , 'memberPortal.occupancy.autoRefresh': 'Updates automatically every 30 seconds'
            , 'memberPortal.occupancy.refresh': 'Refresh now'
            , 'memberPortal.occupancy.note': 'Older check-ins are automatically excluded according to the auto-checkout policy.'
            , 'memberPortal.occupancy.quiet': 'Quiet'
            , 'memberPortal.occupancy.quietHint': 'A comfortable time to work out'
            , 'memberPortal.occupancy.moderate': 'Moderate'
            , 'memberPortal.occupancy.moderateHint': 'Steady activity in the gym'
            , 'memberPortal.occupancy.busy': 'Busy'
            , 'memberPortal.occupancy.busyHint': 'There is noticeable activity in the gym'
            , 'memberPortal.occupancy.veryBusy': 'Very busy'
            , 'memberPortal.occupancy.veryBusyHint': 'Consider choosing a quieter time'
            , 'memberPortal.occupancy.refreshing': 'Refreshing occupancy...'
            , 'memberPortal.occupancy.lastUpdated': 'Last updated {{date}}'
            , 'memberPortal.occupancy.staleExcluded': '{{count}} older check-ins were excluded automatically to keep the count realistic.'
            , 'memberPortal.occupancy.error': 'Could not refresh occupancy'
            , 'memberPortal.occupancy.retryHint': 'Try refreshing again in a moment'
            , 'memberPortal.occupancy.savedReading': 'The last saved reading is shown, if available'
            , 'memberPortal.occupancy.refreshFailed': 'Occupancy is temporarily unavailable.'
            , 'memberPortal.tools.aria': 'Member services'
            , 'memberPortal.tools.report': 'My details and report'
            , 'memberPortal.tools.reportHelp': 'View the report or download it as a PDF'
            , 'memberPortal.tools.feedback': 'Share feedback'
            , 'memberPortal.tools.feedbackHelp': 'Tell us what you think about Logic Fit and your trainers'
            , 'memberPortal.tools.exercises': 'Exercise library'
            , 'memberPortal.tools.exercisesHelp': 'Find exercises by name, level, and equipment'
            , 'memberPortal.tools.foods': 'Nutrition guide'
            , 'memberPortal.tools.foodsHelp': 'Calories and macros for each food'
            , 'memberPortal.tools.subscription': 'Join or renew membership'
            , 'memberPortal.tools.subscriptionHelp': 'Choose a membership and upload payment proof for review'
            , 'memberPortal.trainer.title': 'Client workspace'
            , 'memberPortal.trainer.description': 'Your plans, progress, and sessions in one place.'
            , 'memberPortal.trainer.profile': 'Client profile'
            , 'memberPortal.trainer.mode': 'Personal training'
            , 'memberPortal.trainer.summary': 'Client workspace summary'
            , 'memberPortal.trainer.trainingPlans': 'Training plans'
            , 'memberPortal.trainer.nutritionPlans': 'Nutrition plans'
            , 'memberPortal.trainer.upcomingSessions': 'Upcoming sessions'
            , 'memberPortal.trainer.remainingSessions': 'Sessions remaining'
            , 'memberPortal.trainer.availablePlans': 'Plans available to you'
            , 'memberPortal.trainer.scheduledSessions': 'Scheduled sessions'
            , 'memberPortal.trainer.currentPackages': 'In your current packages'
            , 'memberPortal.trainer.plan': 'Plan'
            , 'memberPortal.trainer.period': 'Period'
            , 'memberPortal.trainer.status': 'Status'
            , 'memberPortal.trainer.noTrainingPlans': 'No training plans are available.'
            , 'memberPortal.trainer.noNutritionPlans': 'No nutrition plans are available.'
            , 'memberPortal.trainer.noUpcomingSessions': 'There are no upcoming sessions.'
            , 'memberPortal.trainer.until': 'Until {{date}}'
            , 'memberPortal.view.home.title': 'Member portal'
            , 'memberPortal.view.home.description': 'Choose a service to continue'
            , 'memberPortal.view.report.title': 'My details and report'
            , 'memberPortal.lookup.loading': 'Verifying membership code…'
            , 'memberPortal.lookup.codeRequired': 'Enter your membership code first.'
            , 'memberPortal.lookup.failed': 'Could not display membership details.'
            , 'memberPortal.view.report.description': 'View your membership, renewals, payments, and attendance.'
            , 'memberPortal.view.feedback.title': 'Share feedback'
            , 'memberPortal.view.feedback.description': 'Tell us what you think about the gym and trainers.'
            , 'memberPortal.view.subscription.title': 'Join or renew membership'
            , 'memberPortal.view.subscription.description': 'Send a membership or renewal request with payment proof for review.'
            , 'memberPortal.view.exercises.title': 'Exercise library'
            , 'memberPortal.view.exercises.description': 'Find exercises by name, level, and equipment.'
            , 'memberPortal.view.foods.title': 'Nutrition guide'
            , 'memberPortal.view.foods.description': 'Explore foods, calories, and macros per serving.'
            , 'memberPortal.back.aria': 'Back to member services'
            , 'memberPortal.back': 'Back to services'
            , 'memberPortal.clientPortal': 'Client portal'
            , 'memberPortal.clientPortalDescription': 'Follow your plan, sessions, and progress with your trainer.'
            , 'memberPortal.loadingLibrary': 'Could not load the exercise and nutrition guides.'
            , 'memberPortal.openLibraryError': 'Could not open the guide'
            , 'memberPortal.retry': 'Please try again.'
            , 'memberPortal.library.close': 'Back to services'
            , 'memberPortal.library.details': 'Details'
            , 'memberPortal.library.closeDialog': 'Close'
            , 'memberPortal.library.quickSearch': 'Quick search'
            , 'memberPortal.library.searchPlaceholder': 'Search exercises or foods...'
            , 'memberPortal.library.category': 'Category'
            , 'memberPortal.library.allCategories': 'All categories'
            , 'memberPortal.library.level': 'Level'
            , 'memberPortal.library.allLevels': 'All levels'
            , 'memberPortal.library.equipment': 'Equipment'
            , 'memberPortal.library.allEquipment': 'All equipment'
            , 'memberPortal.library.exercisesAvailable': 'Available exercises'
            , 'memberPortal.library.exerciseHint': 'Search or filter to find the exercise you need'
            , 'memberPortal.library.noExercisesMatch': 'No matching exercises'
            , 'memberPortal.library.noExercises': 'No exercises available'
            , 'memberPortal.library.tryDifferentFilter': 'Try another name or change a filter.'
            , 'memberPortal.library.foodsAndNutrition': 'Foods and nutrition facts'
            , 'memberPortal.library.foodHint': 'Search for a food to see its details'
            , 'memberPortal.library.noFoodsMatch': 'No matching foods'
            , 'memberPortal.library.startFoodSearch': 'Enter a food name to get started'
            , 'memberPortal.library.foodNutrientsHint': 'Calories and macros per serving will appear here.'
            , 'memberPortal.library.page': 'Page {{page}} of {{pages}}'
            , 'memberPortal.library.previous': 'Previous'
            , 'memberPortal.library.next': 'Next'
            , 'memberPortal.library.exerciseGuide': 'Exercise guide'
            , 'memberPortal.library.nutritionGuide': 'Nutrition guide'
            , 'memberPortal.library.startPosition': 'Starting position'
            , 'memberPortal.library.detailsButton': 'View details'
            , 'memberPortal.library.nutritionDetails': 'Nutrition details'
            , 'memberPortal.library.calories': 'Calories'
            , 'memberPortal.library.protein': 'Protein'
            , 'memberPortal.library.carbs': 'Carbohydrates'
            , 'memberPortal.library.fat': 'Fat'
            , 'memberPortal.library.difficulty.beginner': 'Beginner'
            , 'memberPortal.library.difficulty.intermediate': 'Intermediate'
            , 'memberPortal.library.difficulty.advanced': 'Advanced'
            , 'memberPortal.library.difficulty.expert': 'Expert'
            , 'memberPortal.library.equipment.bodyOnly': 'Bodyweight'
            , 'memberPortal.library.equipment.dumbbell': 'Dumbbell'
            , 'memberPortal.library.equipment.barbell': 'Barbell'
            , 'memberPortal.library.equipment.cable': 'Cable'
            , 'memberPortal.library.equipment.machine': 'Machine'
            , 'memberPortal.library.equipment.bands': 'Resistance bands'
            , 'memberPortal.library.equipment.kettlebell': 'Kettlebell'
            , 'memberPortal.library.equipment.medicineBall': 'Medicine ball'
            , 'memberPortal.library.equipment.other': 'Other'
            , 'memberPortal.library.category.strength': 'Strength'
            , 'memberPortal.library.category.stretching': 'Stretching'
            , 'memberPortal.library.category.cardio': 'Cardio'
            , 'memberPortal.library.category.plyometrics': 'Plyometrics'
            , 'memberPortal.library.category.powerlifting': 'Powerlifting'
            , 'memberPortal.library.category.strongman': 'Strongman'
            , 'memberPortal.library.unnamed': 'Unnamed'
            , 'memberPortal.library.requestFailed': 'Could not load data.'
            , 'memberPortal.library.memberHub': 'MEMBER HUB'
            , 'memberPortal.library.guideLabel': 'GUIDE'
            , 'memberPortal.library.calorieUnit': 'kcal'
            , 'memberPortal.library.servingSize': 'Per {{amount}} {{unit}}'
            , 'memberPortal.library.sets': 'Sets'
            , 'memberPortal.library.reps': 'Repetitions'
            , 'memberPortal.library.loadingDetails': 'Preparing details...'
            , 'memberPortal.library.loadError': 'Could not load the guide'
            , 'memberPortal.library.detailsError': 'Could not load details'
            , 'memberPortal.library.setupError': 'Could not prepare the guide'
            , 'memberPortal.library.retryButton': 'Try again'
            , 'memberPortal.library.food': 'Food'
            , 'memberPortal.library.perServing': '{{amount}} calories per {{unit}}'
            , 'memberPortal.library.resultCount': '{{count}} results'
            , 'memberPortal.library.foodCount': '{{count}} foods available'
            , 'memberPortal.library.noFoodSearch': 'Search for a food to see its details'
            , 'memberPortal.library.noFoodMatch': 'No matching foods'
            , 'memberPortal.library.enterFood': 'Enter a food name to get started'
            , 'memberPortal.library.noFoodDetails': 'Calories and macros per serving will appear here.'
            , 'memberPortal.library.rest': 'Rest'
            , 'memberPortal.library.tempo': 'Tempo'
            , 'memberPortal.library.seconds': 'sec'
            , 'memberPortal.library.muscleUnknown': 'Muscle not specified'
            , 'memberPortal.library.howTo': 'Instructions'
            , 'memberPortal.library.instructionsUnavailable': 'Arabic instructions are not available for this exercise.'
            , 'memberPortal.library.tips': 'Tips'
            , 'memberPortal.library.noTips': 'No additional tips are recorded.'
            , 'memberPortal.library.commonMistakes': 'Common mistakes'
            , 'memberPortal.library.noMistakes': 'No common mistakes are recorded.'
            , 'memberPortal.library.grams': 'g'
            , 'memberPortal.library.fiber': 'Fiber'
            , 'memberPortal.library.sugar': 'Sugar'
            , 'memberPortal.library.sodium': 'Sodium'
            , 'memberPortal.library.milligrams': 'mg'
            , 'memberPortal.library.detailsUnavailable': 'Could not load details'
            , 'memberPortal.library.tryAgain': 'Try again.'
            , 'memberPortal.library.preparing': 'Preparing details...'
            , 'memberPortal.feedback.eyebrow': 'Your feedback matters'
            , 'memberPortal.feedback.title': 'Share your feedback'
            , 'memberPortal.feedback.description': 'Tell us what you think about Logic Fit and your trainers, and how we can improve.'
            , 'memberPortal.feedback.ratingPrompt': 'How would you rate your experience?'
            , 'memberPortal.feedback.ratingAria': 'Rate your experience from one to five stars'
            , 'memberPortal.feedback.star.one': 'One star'
            , 'memberPortal.feedback.star.two': 'Two stars'
            , 'memberPortal.feedback.star.three': 'Three stars'
            , 'memberPortal.feedback.star.four': 'Four stars'
            , 'memberPortal.feedback.star.five': 'Five stars'
            , 'memberPortal.feedback.type': 'Feedback type'
            , 'memberPortal.feedback.chooseType': 'Choose a feedback type'
            , 'memberPortal.feedback.general': 'General feedback'
            , 'memberPortal.feedback.problem': 'Problem'
            , 'memberPortal.feedback.complaint': 'Complaint'
            , 'memberPortal.feedback.suggestion': 'Suggestion'
            , 'memberPortal.feedback.featureRequest': 'Feature request for Logic Fit'
            , 'memberPortal.feedback.message': 'Your feedback'
            , 'memberPortal.feedback.placeholder': 'Share your thoughts about Logic Fit, your trainers, what works well, or what we could improve...'
            , 'memberPortal.feedback.submit': 'Send feedback'
            , 'memberPortal.feedback.sending': 'Sending feedback...'
            , 'memberPortal.feedback.success': 'Your feedback was saved. Thank you for sharing it.'
            , 'memberPortal.feedback.portalCodeRequired': 'Enter your membership code again to open the portal.'
            , 'memberPortal.feedback.ratingRequired': 'Choose a rating from one to five stars.'
            , 'memberPortal.feedback.messageRequired': 'Write your feedback before submitting.'
            , 'memberPortal.feedback.saveFailed': 'Could not save your feedback. Try again.'
            , 'memberPortal.subscription.title': 'Join or renew membership'
            , 'memberPortal.subscription.description': 'Choose your membership details and submit payment proof for the gym to review.'
            , 'memberPortal.subscription.operation': 'Request type'
            , 'memberPortal.subscription.new': 'New membership'
            , 'memberPortal.subscription.extension': 'Membership extension'
            , 'memberPortal.subscription.renewal': 'Membership renewal'
            , 'memberPortal.subscription.autoOperation': 'The request type is selected automatically based on your current membership.'
            , 'memberPortal.subscription.plan': 'Plan'
            , 'memberPortal.subscription.type': 'Membership type'
            , 'memberPortal.subscription.chooseType': 'Choose a membership type'
            , 'memberPortal.subscription.startDate': 'Start date'
            , 'memberPortal.subscription.paymentDate': 'Date payment was received'
            , 'memberPortal.subscription.paymentDateHint': 'The date the gym received your payment, not when the request is entered.'
            , 'memberPortal.subscription.paymentDetails': 'Payment details for this gym'
            , 'memberPortal.subscription.currentGym': 'These details belong to the current gym only.'
            , 'memberPortal.subscription.currentGymBrand': 'These details are for {{brand}} only.'
            , 'memberPortal.subscription.paymentSteps': 'Payment steps'
            , 'memberPortal.subscription.step.transfer': 'Transfer the amount using the payment method shown.'
            , 'memberPortal.subscription.step.proof': 'Attach proof of payment to your request.'
            , 'memberPortal.subscription.step.track': 'Track your request here while the gym reviews it.'
            , 'memberPortal.subscription.membership': 'Membership'
            , 'memberPortal.subscription.collectionDate': 'Payment date'
            , 'memberPortal.subscription.amountDue': 'Amount due'
            , 'memberPortal.subscription.optionalNote': 'Optional note'
            , 'memberPortal.subscription.notePlaceholder': 'Add a note that may help the team review your request...'
            , 'memberPortal.subscription.proof': 'Payment proof'
            , 'memberPortal.subscription.proofHelp': 'Choose an image or PDF file — maximum 4 MB'
            , 'memberPortal.subscription.sendRequest': 'Send activation request'
            , 'memberPortal.subscription.reviewNote': 'Your membership will be approved after the gym reviews the payment proof.'
            , 'memberPortal.subscription.requestHistory': 'Previous requests'
            , 'memberPortal.subscription.refresh': 'Refresh'
            , 'memberPortal.subscription.noHistory': 'No requests have been loaded yet.'
            , 'memberPortal.subscription.request': 'Request'
            , 'memberPortal.subscription.requestId': 'Request #{{id}}'
            , 'memberPortal.subscription.status.pending': 'Under review'
            , 'memberPortal.subscription.status.approved': 'Approved'
            , 'memberPortal.subscription.status.rejected': 'Rejected'
            , 'memberPortal.subscription.status.cancelled': 'Cancelled'
            , 'memberPortal.subscription.status.unknown': 'Unknown'
            , 'memberPortal.subscription.attachProof': 'Payment proof attached and verified'
            , 'memberPortal.subscription.waitingProof': 'Waiting for payment proof'
            , 'memberPortal.subscription.rejectionReason': 'Reason for rejection'
            , 'memberPortal.subscription.noRejectionReason': 'No additional reason was provided.'
            , 'memberPortal.subscription.uploadProof': 'Upload proof'
            , 'memberPortal.subscription.noPaymentMethods': 'This gym has not enabled an electronic payment method. Ask the gym to configure its payment details, then reload this page.'
            , 'memberPortal.subscription.copyAccount': 'Copy account number'
            , 'memberPortal.subscription.copySuccess': 'Account number copied. Attach payment proof after completing the transfer.'
            , 'memberPortal.subscription.copyFailure': 'Could not copy automatically. Select and copy the account number manually.'
            , 'memberPortal.subscription.systemAfterVerify': 'Set by the system after verification'
            , 'memberPortal.subscription.startExtension': 'Extension start date'
            , 'memberPortal.subscription.startRenewal': 'Renewal start date'
            , 'memberPortal.subscription.extensionHint': 'The system schedules this automatically after your current membership ends.'
            , 'memberPortal.subscription.renewalHint': 'The system schedules this from today because your membership has expired.'
            , 'memberPortal.subscription.newStartHint': 'Your new membership starts on the date you choose.'
            , 'memberPortal.subscription.frozenHint': 'Your membership is currently frozen. Ask the gym to resume it before requesting an extension or renewal.'
            , 'memberPortal.subscription.extensionScenario': 'A membership extension was selected automatically. The new period starts after your current membership ends.'
            , 'memberPortal.subscription.renewalScenario': 'A renewal was selected automatically. It starts today because your current membership has expired.'
            , 'memberPortal.subscription.newScenario': 'A new membership was selected. Choose a suitable start date.'
            , 'memberPortal.subscription.loading': 'Loading plans and payment methods...'
            , 'memberPortal.subscription.loadingPlans': 'Loading plans...'
            , 'memberPortal.subscription.loadingMethods': 'Loading payment methods...'
            , 'memberPortal.subscription.loadingRequests': 'Loading requests...'
            , 'memberPortal.subscription.activationDetails': '{{plan}} is active from {{start}} to {{end}}.'
            , 'memberPortal.subscription.createdRequestIdMissing': 'The request was saved, but its reference could not be confirmed.'
            , 'memberPortal.subscription.historyLoadFailed': 'Could not load request history.'
            , 'memberPortal.subscription.membershipStartDateRequired': 'Choose the membership start date.'
            , 'memberPortal.subscription.networkError': 'Could not connect to the service. Check your connection and try again.'
            , 'memberPortal.subscription.newMembership': 'New membership'
            , 'memberPortal.subscription.noMemberRequests': 'There are no previous membership requests.'
            , 'memberPortal.subscription.noPlans': 'No plans are currently available.'
            , 'memberPortal.subscription.noTypes': 'No membership types are currently available.'
            , 'memberPortal.subscription.paymentDateRequired': 'Enter the actual collection date.'
            , 'memberPortal.subscription.paymentMethod': 'Payment method'
            , 'memberPortal.subscription.paymentMethodRequired': 'Choose a payment method.'
            , 'memberPortal.subscription.paymentMethodsLoadFailed': 'Could not load payment methods.'
            , 'memberPortal.subscription.paymentProofTooLarge': 'The payment-proof file exceeds the allowed size.'
            , 'memberPortal.subscription.plansLoadFailed': 'Could not load membership plans.'
            , 'memberPortal.subscription.proofRequired': 'Attach payment proof before submitting the request.'
            , 'memberPortal.subscription.proofRetryFailed': 'Could not retry the payment-proof upload.'
            , 'memberPortal.subscription.proofSelectedForRetry': 'File selected. Retry to complete the upload.'
            , 'memberPortal.subscription.proofUploadFailed': 'Could not upload payment proof.'
            , 'memberPortal.subscription.proofUploadNetworkError': 'The connection was interrupted while uploading payment proof.'
            , 'memberPortal.subscription.proofUploadSuccess': 'Payment proof was uploaded and verified.'
            , 'memberPortal.subscription.requestFailed': 'Could not load membership-request details.'
            , 'memberPortal.subscription.requestsLoadFailed': 'Could not load membership requests.'
            , 'memberPortal.subscription.requestSubmitFailed': 'Could not submit the membership request.'
            , 'memberPortal.subscription.requestSubmitSuccess': 'The membership request was submitted.'
            , 'memberPortal.subscription.selectProofForRetry': 'Choose a payment-proof file first.'
            , 'memberPortal.subscription.sendingRequest': 'Sending request…'
            , 'memberPortal.subscription.subscriptionLoadFailed': 'Could not load membership details.'
            , 'memberPortal.subscription.uploadingAndVerifyingProof': 'Uploading and verifying payment proof…'
            , 'memberPortal.subscription.uploadingProof': 'Uploading payment proof…'
            , 'memberPortal.subscription.errors.paymentProofRequired': 'Attach payment proof before continuing.'
            , 'memberPortal.subscription.errors.portalSessionRequired': 'Enter your membership code again to open the portal.'
            , 'memberPortal.subscription.errors.portalSessionExpired': 'Your portal session expired. Enter your membership code again.'
            , 'memberPortal.subscription.errors.requestAlreadyPending': 'A membership request is already pending review.'
            , 'memberPortal.subscription.errors.paymentMethodUnavailable': 'The selected payment method is no longer available.'
            , 'memberPortal.subscription.errors.planUnavailable': 'The selected plan is no longer available.'
            , 'memberPortal.subscription.errors.membershipTypeUnavailable': 'The selected membership type is no longer available.'
            , 'memberPortal.subscription.errors.invalidPaymentProofType': 'This payment-proof file type is not supported.'
            , 'memberPortal.subscription.errors.paymentProofSignatureMismatch': 'The payment-proof file type could not be verified.'
            , 'memberPortal.subscription.errors.paymentProofStorageNotConfigured': 'Payment-proof storage is not configured for this gym.'
            , 'memberPortal.subscription.errors.paymentProofStorageUnavailable': 'Payment-proof storage is currently unavailable. Try again later.'
            , 'memberPortal.subscription.errors.requestSaveUnconfirmed': 'The request could not be confirmed as saved. Refresh the history before retrying.'
            , 'memberPortal.subscription.errors.requestNotFound': 'This membership request is no longer available.'
            , 'memberPortal.subscription.errors.requestAlreadyReviewed': 'This request has already been reviewed. Refresh the history.'
            , 'memberPortal.subscription.errors.portalSessionMemberInvalid': 'The member session could not be verified. Enter your membership code again.'
            , 'memberPortal.subscription.errors.membershipSelectionRequired': 'Choose a plan and membership type.'
            , 'memberPortal.subscription.errors.paymentMethodRequired': 'Choose a payment method.'
            , 'memberPortal.subscription.errors.paymentDateRequired': 'Enter the actual collection date.'
            , 'memberPortal.subscription.errors.paymentDateInFuture': 'The collection date cannot be in the future.'
            , 'memberPortal.subscription.errors.invalidPaymentProofSubmission': 'Payment-proof details are invalid. Select the file again.'
            , 'memberPortal.subscription.errors.requestTypeUnsupported': 'This membership-request type is not supported.'
            , 'memberPortal.subscription.errors.reviewNotesRequired': 'Add a note explaining your request.'
            , 'memberPortal.subscription.errors.paymentProofUnavailable': 'Payment proof is currently unavailable.'
            , 'memberPortal.subscription.errors.paymentProofIntegrityFailed': 'The integrity of the payment proof could not be verified.'
            , 'memberPortal.subscription.errors.renewalRequiresExisting': 'An extension or renewal requires an existing membership.'
            , 'memberPortal.subscription.errors.membershipFreezeActive': 'A frozen membership cannot be extended. Resume it first.'
            , 'memberPortal.subscription.errors.membershipStartOverlapsCurrent': 'Choose a start date that does not overlap the current membership.'
            , 'memberPortal.subscription.errors.membershipCurrentDatesInvalid': 'The current membership dates could not be verified.'
            , 'memberPortal.subscription.errors.membershipRenewalSnapshotInvalid': 'The requested membership duration could not be verified.'
            , 'memberPortal.subscription.activationTitle': 'Your membership is active'
            , 'memberPortal.subscription.readyToTrain': 'Ready to work out?'
            , 'memberPortal.subscription.membershipActivated': 'Your membership is ready for training.'
            , 'memberPortal.report.memberPortal': 'Membership record'
            , 'memberPortal.report.memberName': 'Client: {{name}} · Issued: {{date}}'
            , 'memberPortal.report.number': 'Report: {{number}} · Issued: {{date}}'
            , 'memberPortal.report.issuedBy': 'Issued by'
            , 'memberPortal.report.phone': 'Phone'
            , 'memberPortal.report.email': 'Email'
            , 'memberPortal.report.membershipStatus': 'Membership status'
            , 'memberPortal.report.membershipProfile': 'Membership profile'
            , 'memberPortal.report.membershipSummary': 'Membership summary'
            , 'memberPortal.report.currentMembership': 'Current membership details for this member only'
            , 'memberPortal.report.plan': 'Plan'
            , 'memberPortal.report.startDate': 'Start date'
            , 'memberPortal.report.currentStart': 'Current membership start'
            , 'memberPortal.report.endDate': 'Expiry date'
            , 'memberPortal.report.firstJoined': 'First joined'
            , 'memberPortal.report.profileStart': 'Profile start date'
            , 'memberPortal.report.remaining': 'remaining'
            , 'memberPortal.report.expired': 'Expired'
            , 'memberPortal.report.visitsFinance': 'Visits and account summary'
            , 'memberPortal.report.totalVisits': 'Total visits'
            , 'memberPortal.report.fullAttendance': 'Complete attendance record'
            , 'memberPortal.report.totalDue': 'Total due'
            , 'memberPortal.report.membershipValue': 'Membership value'
            , 'memberPortal.report.totalPaid': 'Total paid'
            , 'memberPortal.report.paidToDate': 'Paid to date'
            , 'memberPortal.report.remainingAmount': 'Amount remaining'
            , 'memberPortal.report.currentBalance': 'Current balance'
            , 'memberPortal.report.memberships': 'Memberships and renewals'
            , 'memberPortal.report.period': 'Period'
            , 'memberPortal.report.status': 'Status'
            , 'memberPortal.report.account': 'Account'
            , 'memberPortal.report.noMemberships': 'No memberships recorded.'
            , 'memberPortal.report.payments': 'Payments and receipts'
            , 'memberPortal.report.receipt': 'Receipt'
            , 'memberPortal.report.date': 'Date'
            , 'memberPortal.report.operation': 'Transaction'
            , 'memberPortal.report.paid': 'Paid'
            , 'memberPortal.report.due': 'Remaining'
            , 'memberPortal.report.paymentMethod': 'Payment method'
            , 'memberPortal.report.noPayments': 'No payments recorded.'
            , 'memberPortal.report.attendance': 'Attendance and visits'
            , 'memberPortal.report.checkIn': 'Check-in'
            , 'memberPortal.report.checkOut': 'Check-out'
            , 'memberPortal.report.duration': 'Duration'
            , 'memberPortal.report.noVisits': 'No visits recorded.'
            , 'memberPortal.report.freezes': 'Freeze or suspension history'
            , 'memberPortal.report.start': 'Start'
            , 'memberPortal.report.end': 'End'
            , 'memberPortal.report.resumed': 'Resumed'
            , 'memberPortal.report.continues': 'Ongoing'
            , 'memberPortal.report.days': 'days'
            , 'memberPortal.report.noFreezes': 'No freeze records.'
            , 'memberPortal.report.noRecords': 'No records'
            , 'memberPortal.report.recordSingular': 'record'
            , 'memberPortal.report.recordPlural': 'records'
            , 'memberPortal.report.planAndDuration': 'Plan and duration'
            , 'memberPortal.report.until': 'Until {{date}}'
            , 'memberPortal.report.paidValue': 'Paid {{amount}}'
            , 'memberPortal.report.remainingValue': 'Remaining {{amount}}'
            , 'memberPortal.report.insideGym': 'Inside {{gym}}'
            , 'memberPortal.report.minutes': '{{count}} min'
            , 'memberPortal.report.daysCount': '{{count}} days'
            , 'memberPortal.report.daysRemaining': '{{count}} days remaining'
            , 'memberPortal.data.plan.gymOnly': 'Gym only'
            , 'memberPortal.data.plan.gymCardio': 'Gym and cardio'
            , 'memberPortal.data.type.monthly': 'Monthly'
            , 'memberPortal.data.type.halfMonth': 'Half-month'
            , 'memberPortal.data.type.quarterly': 'Quarterly'
            , 'memberPortal.data.type.semiannual': 'Semiannual'
            , 'memberPortal.data.type.annual': 'Annual'
            , 'memberPortal.data.status.active': 'Active'
            , 'memberPortal.data.status.expiring': 'Expiring soon'
            , 'memberPortal.data.status.expired': 'Expired'
            , 'memberPortal.data.status.frozen': 'Frozen'
            , 'memberPortal.data.status.none': 'No status'
            , 'memberPortal.data.payment.cash': 'Cash'
            , 'memberPortal.data.payment.card': 'Card'
            , 'memberPortal.data.payment.transfer': 'Transfer'
            , 'memberPortal.data.payment.other': 'Other'
            , 'memberPortal.data.transaction.subscription': 'Membership'
            , 'memberPortal.data.transaction.adjustment': 'Adjustment'
            , 'memberPortal.data.transaction.payment': 'Payment'
            , 'memberPortal.footer': 'Smarter management, better performance.'
            , 'store.inventory.low': 'Low stock'
            , 'store.inventory.available': 'Available'
            , 'store.inventory.adjust': 'Adjust'
            , 'store.inventory.empty': 'No stock movements or inventory items yet.'
            , 'store.purchases.title': 'Purchases and receiving'
            , 'store.purchases.description': 'Receiving quantities updates the balance and movement history in one transaction.'
            , 'store.purchases.add': 'Add purchase invoice'
            , 'store.purchases.supplier': 'Supplier'
            , 'store.purchases.noneSupplier': 'No supplier'
            , 'store.purchases.invoiceNumber': 'Invoice number'
            , 'store.purchases.date': 'Date'
            , 'store.purchases.variant': 'Product/variant'
            , 'store.purchases.quantity': 'Quantity'
            , 'store.purchases.unitCost': 'Unit cost'
            , 'store.purchases.receive': 'Receive invoice'
            , 'store.purchases.empty': 'No purchases in the current period.'
            , 'store.sales.title': 'Sales record'
            , 'store.sales.description': 'Invoices, payments, and returns.'
            , 'store.sales.cashCustomer': 'Walk-in customer'
            , 'store.sales.empty': 'No sales in the current period.'
            , 'store.suppliers.description': 'Supplier details used in purchase invoices.'
            , 'store.suppliers.add': 'Add supplier'
            , 'store.suppliers.name': 'Supplier name'
            , 'store.suppliers.phone': 'Phone'
            , 'store.suppliers.email': 'Email'
            , 'store.suppliers.address': 'Address'
            , 'store.suppliers.empty': 'No suppliers yet.'
            , 'store.expenses.description': 'Operating expenses tracked separately and included in profitability reports.'
            , 'store.expenses.add': 'Add expense'
            , 'store.expenses.name': 'Expense name'
            , 'store.expenses.category': 'Category'
            , 'store.expenses.categoryPlaceholder': 'Shipping, packaging…'
            , 'store.expenses.amount': 'Amount'
            , 'store.expenses.notes': 'Notes'
            , 'store.expenses.empty': 'No store expenses in the current period.'
            , 'store.reports.description': 'Sales, best-selling items, inventory, and profitability based on access.'
            , 'store.reports.from': 'From'
            , 'store.reports.to': 'To'
            , 'store.reports.type': 'Report type'
            , 'store.reports.run': 'Run report'
            , 'store.reports.choosePeriod': 'Choose a period, then run the report.'
            , 'store.reports.noResults': 'No results for the selected period.'
            , 'store.reports.noExpensePermission': 'You do not have permission to view store expenses.'
            , 'store.bar.title': 'Bar point of sale'
            , 'store.bar.description': 'Fast point of sale for prepared orders and recipes using branch inventory.'
            , 'store.bar.search': 'Search the bar menu'
            , 'store.bar.searchPlaceholder': 'Search drinks or items…'
            , 'store.bar.loadingMenu': 'Loading the bar menu…'
            , 'store.bar.order': 'Current order'
            , 'store.bar.emptyOrder': 'Add an item to the order.'
            , 'store.bar.memberOptional': 'Member (optional)'
            , 'store.bar.memberNumber': 'Member number'
            , 'store.bar.checkout': 'Collect payment'
            , 'store.common.noResults': 'No results.'
            , 'store.common.noPhone': 'No phone'
            , 'store.common.removeCustomer': 'Remove customer'
            , 'store.common.reduceQuantity': 'Decrease quantity'
            , 'store.common.increaseQuantity': 'Increase quantity'
            , 'store.common.deleteItem': 'Remove {{name}}'
            , 'store.common.itemCount': '{{count}} items'
            , 'store.common.noData': 'No data.'
            , 'store.success.sale': 'Sale recorded successfully.'
            , 'store.error.load': 'Could not load store data.'
            , 'store.error.salePermission': 'You do not have permission to create store sales.'
            , 'store.error.sale': 'Could not complete the sale.'
            , 'store.error.customerSearch': 'Could not search for the customer.'
            , 'store.confirm.deactivateProduct': 'Do you want to deactivate this product?'
            , 'store.confirm.deleteExpense': 'Do you want to delete this expense?'
            , 'store.prompt.adjustQuantity': 'Enter the positive adjustment quantity:'
            , 'store.success.productDeactivated': 'Product deactivated.'
            , 'store.success.expenseDeleted': 'Expense deleted.'
            , 'store.success.inventoryAdjusted': 'Inventory adjusted.'
            , 'store.error.supplierPhone': 'Supplier phone number is invalid.'
            , 'store.receipt.number': 'Sales receipt: {{number}}'
            , 'store.receipt.thanks': 'Thank you for your visit'
            , 'store.common.storeArea': 'Store management'
            , 'store.page.title': 'Store, sales, and inventory'
            , 'store.page.description': 'Fast sales, traceable inventory, and clear reporting in one place.'
            , 'store.page.refresh': 'Refresh data'
            , 'store.page.navigation': 'Store sections'
            , 'store.bar.eyebrow': 'Bar'
            , 'store.bar.location': 'Sales location'
            , 'store.bar.setupRequired': 'Enable Bar and create a sales location for this branch in Branch Settings.'
            , 'store.bar.openingCash': 'Shift opening balance'
            , 'store.bar.openShiftAction': 'Open Bar shift'
            , 'store.bar.searchAccessible': 'Search Bar menu'
            , 'store.bar.emptyMenu': 'No Bar items are available at this location.'
            , 'store.bar.activeBranchRequired': 'No active branch is available for Bar operations.'
            , 'store.bar.shiftOpenCurrent': 'Shift open · Current sales location'
            , 'store.bar.shiftLocationMismatch': 'Shift open · Verify the shift location'
            , 'store.bar.noOpenShift': 'No shift is open. Open a shift before collecting payment.'
            , 'store.bar.shiftOpened': 'Bar shift opened. You can start selling now.'
            , 'store.bar.openShiftError': 'Could not open the shift.'
            , 'store.bar.checkoutSuccess': 'Bar order payment collected successfully.'
            , 'store.bar.checkoutError': 'Could not collect payment for the Bar order.'
            , 'store.bar.loadError': 'Could not load Bar operations.'
            , 'store.bar.refreshError': 'Could not refresh the Bar menu.'
            , 'store.bar.recipe': 'Recipe'
            , 'store.common.unavailable': 'Unavailable'
            , 'store.common.search': 'Search'
            , 'store.common.status': 'Status'
            , 'store.common.action': 'Action'
            , 'store.common.invoice': 'Invoice'
            , 'store.common.customer': 'Customer'
            , 'store.common.phone': 'Phone'
            , 'store.common.date': 'Date'
            , 'store.common.amount': 'Amount'
            , 'store.common.total': 'Total'
            , 'store.common.paid': 'Paid'
            , 'store.common.remaining': 'Remaining'
            , 'store.common.category': 'Category'
            , 'store.common.revenue': 'Revenue'
            , 'store.common.orders': 'Invoices'
            , 'store.common.refunds': 'Returns'
            , 'store.common.cost': 'Cost'
            , 'store.inventory.description': 'Current balance, alerts, and stock adjustments.'
            , 'store.purchases.title': 'Purchases and receiving'
            , 'store.purchases.description': 'Receiving quantities updates the balance and movement history in one transaction.'
            , 'store.sales.title': 'Sales record'
            , 'store.sales.description': 'Invoices, payments, and returns.'
            , 'store.suppliers.description': 'Supplier details used in purchase invoices.'
            , 'store.expenses.description': 'Operating expenses tracked separately and included in profitability reports.'
            , 'store.expenses.category': 'Category'
            , 'store.reports.mode.products': 'By product'
            , 'store.reports.mode.categories': 'By category'
            , 'store.reports.mode.customers': 'By customer'
            , 'store.reports.mode.payments': 'Payment methods'
            , 'store.reports.mode.daily': 'Daily sales'
            , 'store.reports.mode.purchases': 'Purchases'
            , 'store.reports.mode.inventory': 'Inventory'
            , 'store.reports.mode.returns': 'Returns'
            , 'store.reports.mode.expenses': 'Store expenses'
            , 'store.report.product': 'Product'
            , 'store.report.variant': 'Variant'
            , 'store.report.sku': 'SKU'
            , 'store.report.quantity': 'Quantity'
            , 'store.report.revenue': 'Revenue'
            , 'store.report.cost': 'Cost'
            , 'store.report.customer': 'Customer'
            , 'store.report.phone': 'Phone'
            , 'store.report.invoiceCount': 'Invoices'
            , 'store.report.value': 'Value'
            , 'store.report.day': 'Day'
            , 'store.report.supplier': 'Supplier'
            , 'store.report.expense': 'Expense'
            , 'store.report.paymentMethod': 'Payment method'
            , 'store.report.refundMethod': 'Refund method'
            , 'store.report.reason': 'Reason'
            , 'store.report.expiry': 'Expiry'
            , 'store.products.noProductsAfter': 'No products yet.'
            , 'store.common.noResultsPeriod': 'No results for the selected period.'
            , 'store.products.confirmDeactivate': 'Do you want to deactivate this product?'
            , 'store.expenses.confirmDelete': 'Do you want to delete this expense?'
            , 'store.error.noSalesPermission': 'You do not have permission to create store sales.'
            , 'store.error.storeLoad': 'Could not load store data.'
            , 'store.error.saleComplete': 'Could not complete the sale.'
            , 'store.error.customerLookup': 'Could not search for the customer.'
            , 'store.success.saleRecorded': 'Sale recorded successfully.'
            , 'store.success.productDisabled': 'Product deactivated.'
            , 'store.success.expenseRemoved': 'Expense deleted.'
            , 'store.success.inventoryAdjusted': 'Inventory adjusted.'
            , 'store.error.invalidSupplierPhone': 'Supplier phone number is invalid.'
            , 'store.receipt.saleNumber': 'Sales receipt: {{number}}'
            , 'store.pos.receiptThanks': 'Thank you for your visit'
            , 'attendance.kicker': 'Daily operations'
            , 'members.title': 'Members'
            , 'members.form.add.title': 'Add new member'
            , 'members.form.edit.title': 'Edit member details'
            , 'members.form.add.description': 'Enter the member’s basic details, then complete any optional information'
            , 'members.form.profile': 'Member details'
            , 'members.form.profileDescription': 'Basic contact and registration information'
            , 'members.form.fullName': 'Full name *'
            , 'members.form.phone': 'Phone number *'
            , 'members.form.email': 'Email'
            , 'members.form.memberNotes': 'Member notes'
            , 'members.form.registrationDate': 'Registration date'
            , 'members.form.branch': 'Branch'
            , 'members.form.section': 'Section'
            , 'members.form.membershipType': 'Membership type'
            , 'members.form.plan': 'Plan'
            , 'members.form.startDate': 'Start date'
            , 'members.form.endDate': 'End date'
            , 'members.form.membershipNotes': 'Membership notes'
            , 'members.form.amountDue': 'Amount due after discount'
            , 'members.form.discount': 'Discount'
            , 'members.form.amountPaid': 'Amount paid'
            , 'members.form.paymentDate': 'Payment date'
            , 'members.form.paymentMethod': 'Payment method'
            , 'members.form.save': 'Save member'
            , 'members.form.saveEdit': 'Save changes'
            , 'members.form.cancel': 'Cancel'
            , 'members.form.clear': 'Clear'
            , 'members.details.emptyLoading': 'Loading details…'
            , 'members.details.financialBalance': 'Financial balance'
            , 'members.details.subscriptionHistory': 'Membership and renewal history'
            , 'members.details.access': 'Access details'
            , 'members.details.todayAttendance': 'Today’s attendance'
            , 'members.details.portalCode': 'Member portal code'
            , 'members.details.events': 'Activity history'
            , 'members.details.financialHistory': 'Financial history and receipts'
            , 'members.details.storePurchases': 'Store purchases'
            , 'members.details.trainingNutrition': 'Training and nutrition'
            , 'members.details.close': 'Close'
            , 'members.details.closeAccessible': 'Close member details'
            , 'members.profile.badge.member': 'Member'
            , 'members.status.activeBadge': 'Active'
            , 'members.status.expiringSoonBadge': 'Expiring soon'
            , 'members.status.frozenBadge': 'Frozen'
            , 'members.status.expiredBadge': 'Expired'
            , 'members.status.cancelledBadge': 'Cancelled'
            , 'members.subtitle': 'Manage gym members, memberships, attendance, and renewals'
            , 'members.add': 'Add member'
            , 'members.pricing': 'Membership pricing'
            , 'members.types': 'Membership types'
            , 'members.toolbar.aria': 'Search and filter members'
            , 'members.toolbar.title': 'Search members'
            , 'members.toolbar.description': 'Quickly find members by name or phone'
            , 'members.search.label': 'Search by name, phone, or membership code'
            , 'members.search.placeholder': 'Search by name, phone number, or membership code'
            , 'members.search.clear': 'Clear member search'
            , 'members.filter.status': 'Membership status'
            , 'members.filter.statusAria': 'Filter by status'
            , 'members.filter.all': 'All statuses'
            , 'members.filter.active': 'Active'
            , 'members.filter.expiringSoon': 'Expiring soon'
            , 'members.filter.expired': 'Expired'
            , 'members.filter.frozen': 'Frozen'
            , 'members.filter.sort': 'Sort results'
            , 'members.filter.sortAria': 'Sort members'
            , 'members.filter.expiry': 'Expiring soonest'
            , 'members.filter.newest': 'Recently registered'
            , 'members.filter.remaining': 'Highest balance due'
            , 'members.filter.disclosure': 'Filters and sorting'
            , 'members.filter.clear': 'Clear filters'
            , 'members.filter.dialogTitle': 'Filter members'
            , 'members.filter.dialogDescription': 'Narrow results by status or expiry order.'
            , 'members.filter.close': 'Close filters'
            , 'members.filter.apply': 'Apply filters'
            , 'members.count': '{{count}} members'
            , 'members.summary.aria': 'Members summary'
            , 'members.summary.total': 'Total members'
            , 'members.summary.active': 'Active memberships'
            , 'members.summary.expiringSoon': 'Expiring soon'
            , 'members.summary.expired': 'Expired memberships'
            , 'members.table.member': 'Member'
            , 'members.table.subscription': 'Membership'
            , 'members.table.status': 'Status'
            , 'members.table.expiry': 'Expiry'
            , 'members.table.freeze': 'Freezes'
            , 'members.table.account': 'Account'
            , 'members.table.actions': 'Actions'
            , 'members.card.subscription': 'Membership'
            , 'members.card.expiry': 'Expiry'
            , 'members.card.balance': 'Balance remaining'
            , 'members.balance.remaining': '{{amount}} remaining'
            , 'members.phone.missing': 'No phone number'
            , 'members.noMembership': 'No membership'
            , 'members.loading': 'Loading members…'
            , 'members.registration': 'Registered: {{date}}'
            , 'members.remaining.days': '{{count}} days remaining'
            , 'members.remaining.expired': 'Expired {{count}} days ago'
            , 'members.remaining.frozenUntil': 'Frozen until {{date}}'
            , 'members.freeze.remaining': '{{count}} remaining'
            , 'members.portalCode': 'Portal code: {{code}}'
            , 'members.portalCode.unissued': 'Not issued'
            , 'members.empty.title': 'No matching members'
            , 'members.empty.description': 'Try adjusting your search or removing some filters.'
            , 'members.empty.clear': 'Clear filters'
            , 'members.status.active': 'Active'
            , 'members.status.expiringSoon': 'Expiring soon'
            , 'members.status.expired': 'Expired'
            , 'members.status.frozen': 'Frozen'
            , 'members.status.cancelled': 'Cancelled'
            , 'members.action.details': 'View details'
            , 'members.action.mobileDetails': 'View'
            , 'members.action.edit': 'Edit member'
            , 'members.action.renew': 'Renew membership'
            , 'members.action.mobileRenew': 'Renew'
            , 'members.action.freeze': 'Freeze membership'
            , 'members.action.resume': 'Resume membership'
            , 'members.action.payment': 'Record payment'
            , 'members.action.print': 'Print membership'
            , 'members.action.qr': 'View QR code'
            , 'members.action.delete': 'Delete member'
            , 'members.action.refund': 'Refund membership'
            , 'members.pagination.range': 'Showing {{first}}–{{last}} of {{total}}'
            , 'members.pagination.first': 'First page'
            , 'members.pagination.previous': 'Previous page'
            , 'members.pagination.next': 'Next page'
            , 'members.pagination.last': 'Last page'
            , 'members.pagination.page': 'Page {{page}}'
            , 'members.pagination.mobilePrevious': 'Previous'
            , 'members.pagination.mobileNext': 'Next'
            , 'members.pagination.pageSize': 'Per page'
            , 'members.pagination.pageSizeAria': 'Results per page'
            , 'members.pagination.pages': 'Member pages'
            , 'attendance.title': 'Attendance'
            , 'attendance.description': 'Record member check-ins and check-outs and follow today’s activity.'
            , 'attendance.today': 'Today'
            , 'attendance.kiosk': 'Kiosk mode'
            , 'attendance.reportsHint': 'Detailed reports are available in the Reports tab.'
            , 'attendance.workspace.title': 'Record member attendance'
            , 'attendance.workspace.description': 'Search by phone number or use a QR Code to identify a member.'
            , 'attendance.mode.aria': 'Attendance method'
            , 'attendance.mode.phone': 'Phone'
            , 'attendance.mode.qr': 'QR Code'
            , 'attendance.phone.label': 'Phone number'
            , 'attendance.phone.placeholder': 'e.g. 01015819700'
            , 'attendance.phone.help': 'Enter the number without the country code.'
            , 'attendance.phone.search': 'Find member'
            , 'attendance.policy': 'Active, unfrozen memberships can check in once per day. Open attendance is automatically closed after one hour.'
            , 'attendance.member.heading': 'Member details'
            , 'attendance.member.hint': 'Shown after a member is found'
            , 'attendance.member.waiting': 'Waiting for member number'
            , 'attendance.member.waitingHint': 'Enter a phone number to view membership status and check-in time.'
            , 'attendance.action.aria': 'Attendance action'
            , 'attendance.action.checkIn': 'Check in'
            , 'attendance.action.checkOut': 'Check out'
            , 'attendance.action.noCheckInPermission': 'You do not have permission to check in'
            , 'attendance.action.noCheckOutPermission': 'You do not have permission to check out'
            , 'attendance.summary.total': 'Today’s attendance'
            , 'attendance.summary.aria': 'Attendance summary'
            , 'attendance.summary.inside': 'Currently inside'
            , 'attendance.summary.checkedOut': 'Checked out today'
            , 'attendance.log.title': 'Today’s log'
            , 'attendance.log.loading': 'Loading today’s attendance…'
            , 'attendance.log.search.label': 'Search today’s attendance by name or phone'
            , 'attendance.log.search.placeholder': 'Search by name or phone number'
            , 'attendance.log.search.clear': 'Clear today’s attendance search'
            , 'attendance.log.filter.label': 'Filter attendance status'
            , 'attendance.log.filter.all': 'All statuses'
            , 'attendance.log.filter.inside': 'Currently inside'
            , 'attendance.log.filter.checkedOut': 'Checked out'
            , 'attendance.log.refresh': 'Refresh'
            , 'attendance.table.member': 'Member'
            , 'attendance.table.phone': 'Phone'
            , 'attendance.table.checkIn': 'Check-in time'
            , 'attendance.table.checkOut': 'Check-out time'
            , 'attendance.table.duration': 'Duration'
            , 'attendance.table.status': 'Status'
            , 'attendance.table.action': 'Action'
            , 'attendance.log.count': '{{count}} attendance records on {{date}}'
            , 'attendance.log.filteredCount': '{{count}} of {{total}} records on {{date}}'
            , 'attendance.log.emptyFiltered': 'No records match the current filters.'
            , 'attendance.log.empty': 'No attendance records yet today.'
            , 'attendance.log.refreshing': 'Refreshing today’s attendance…'
            , 'attendance.duration.minutes': 'min'
            , 'attendance.status.inside': 'Inside the gym'
            , 'attendance.status.checkedOut': 'Checked out'
            , 'attendance.status.autoCheckedOut': 'Automatically checked out'
            , 'attendance.status.checkedOutDone': 'Checked out'
            , 'attendance.status.autoCheckedOutDone': 'Auto check-out'
            , 'attendance.member.status.active': 'Active'
            , 'attendance.member.status.expiring': 'Expiring soon'
            , 'attendance.member.status.expired': 'Expired'
            , 'attendance.member.status.frozen': 'Frozen'
            , 'attendance.member.status.none': 'No active membership'
            , 'attendance.member.generic': 'Member'
            , 'attendance.member.plan.gymOnly': 'Gym only'
            , 'attendance.member.plan.gymCardio': 'Gym and cardio'
            , 'attendance.member.type.monthly': 'Monthly'
            , 'attendance.member.type.halfMonth': 'Half month'
            , 'attendance.member.type.quarterly': 'Quarterly'
            , 'attendance.member.type.semiannual': 'Semiannual'
            , 'attendance.member.type.annual': 'Annual'
            , 'attendance.member.attendance.inside': 'Currently inside the gym'
            , 'attendance.member.attendance.checkedOut': 'Checked out today'
            , 'attendance.member.attendance.notCheckedIn': 'No check-in recorded today'
            , 'attendance.member.field.plan': 'Plan'
            , 'attendance.member.field.type': 'Type'
            , 'attendance.member.field.startDate': 'Start date'
            , 'attendance.member.field.endDate': 'Expiry date'
            , 'attendance.member.field.remaining': 'Remaining'
            , 'attendance.member.field.todayAttendance': 'Today’s attendance'
            , 'attendance.member.field.membershipUntil': 'Membership until'
            , 'attendance.member.currency': 'EGP'
            , 'attendance.member.operation.checkIn': 'Check in'
            , 'attendance.member.operation.checkOut': 'Check out'
            , 'attendance.member.operation.unavailable': 'Attendance unavailable'
            , 'attendance.member.operation.confirm': 'Confirm {{action}}'
            , 'attendance.member.operation.details': 'Member details'
            , 'attendance.member.operation.close': 'Close'
            , 'attendance.member.operation.cancel': 'Cancel'
            , 'attendance.member.operation.inside': 'This member is currently checked in.'
            , 'attendance.member.operation.valid': 'The membership is valid for check-in.'
            , 'attendance.member.operation.blocked': 'This membership cannot be used to check in.'
            , 'attendance.member.operation.ok': 'OK'
            , 'attendance.member.operation.checkedOut': 'This member has already checked in and out today.'
            , 'attendance.member.operation.frozen': 'The membership is frozen and cannot be used to check in.'
            , 'attendance.member.operation.expired': 'The membership has expired and cannot be used to check in.'
            , 'attendance.member.operation.noMembership': 'No active membership allows attendance.'
            , 'attendance.member.operation.noCheckOutPermission': 'You do not have permission to check out.'
            , 'attendance.member.operation.noCheckInPermission': 'You do not have permission to check in.'
            , 'attendance.preview.searching': 'Searching for member details…'
            , 'attendance.preview.notFound': 'No member was found with this number.'
            , 'attendance.preview.loadError': 'Could not load member details. Try again.'
            , 'attendance.preview.invalidPhone': 'Enter a valid phone number to find the member.'
            , 'attendance.action.enterPhoneOrScan': 'Enter a phone number or scan a QR Code first.'
            , 'attendance.action.invalidPhone': 'Enter a valid phone number.'
            , 'attendance.permission.checkIn': 'You do not have permission to check in.'
            , 'attendance.permission.checkOut': 'You do not have permission to check out.'
            , 'attendance.success.checkIn': '{{name}} checked in successfully'
            , 'attendance.success.checkOut': '{{name}} checked out'
            , 'attendance.success.checkedIn': 'Check-in recorded successfully.'
            , 'attendance.success.checkedOut': 'Check-out recorded successfully.'
            , 'attendance.qr.alreadyCheckedOutMember': 'This member has already checked out today.'
            , 'attendance.qr.alreadyCheckedOutSubscriber': 'This subscriber has already checked out today.'
            , 'attendance.qr.unavailable': 'QR scanning is not available right now. Use a phone number instead.'
            , 'attendance.qr.cameraError': 'Could not start the camera. Allow camera access or use a phone number instead.'
            , 'attendance.qr.cardUnavailable': 'The membership card tool is not ready. No unsafe QR was shown; reload the screen and try again.'
            , 'attendance.source.manual': 'Manual'
            , 'attendance.source.auto': 'Automatic'
            , 'attendance.error.request': 'Could not complete the attendance request.'
            , 'branding.page.eyebrow': 'Brand system · Owner only', 'branding.page.title': 'Branding', 'branding.page.description': 'Manage your platform identity in one place, preview changes, and publish them safely across the application.'
            , 'branding.editor.aria': 'Brand identity editor', 'branding.editor.sections.aria': 'Branding editor sections'
            , 'branding.section.identity': 'Brand identity', 'branding.section.assets': 'Logos and assets', 'branding.section.light': 'Light mode', 'branding.section.dark': 'Dark mode', 'branding.section.typography': 'Typography', 'branding.section.login': 'Login', 'branding.section.interface': 'Interface', 'branding.section.documents': 'Documents and portal'
            , 'branding.identity.description': 'Core text shown on login, the top bar, reports, and the member portal.'
            , 'branding.identity.label.brand': 'Brand name *', 'branding.identity.label.english': 'English name', 'branding.identity.label.short': 'Short name', 'branding.identity.label.company': 'Company or gym name', 'branding.identity.label.description': 'Brand description', 'branding.identity.label.welcomeTitle': 'Welcome title', 'branding.identity.label.welcomeSubtitle': 'Welcome subtitle', 'branding.identity.label.copyright': 'Copyright text'
            , 'branding.payments.eyebrow': 'Gym payment settings', 'branding.payments.title': 'Payment and transfer details', 'branding.payments.description': 'Add payment methods for this gym only. Active methods appear to members in subscription and renewal requests.', 'branding.payments.add': 'Add payment method', 'branding.payments.open': 'Open payment methods', 'branding.payments.notice': 'These details are not platform-wide settings. They appear only after publishing and according to the member’s gym.', 'branding.identity.defaultsNote': 'The safe default identity is “Logic Fit”. Empty fields automatically use their default values.'
            , 'branding.assets.description': 'Upload SVG, PNG, or WebP. New assets remain drafts until the identity is published.', 'branding.assets.limit': 'Assets are limited to 2MB. Type, dimensions, and aspect ratio are checked before saving.'
            , 'branding.theme.light.description': 'Independent Light Mode colors with automatic contrast checks.', 'branding.theme.dark.description': 'Independent dark shades, not an automatic inversion of Light Mode colors.'
            , 'branding.typography.description': 'Choose a readable Arabic font with safe limits that prevent layout breakage.', 'branding.typography.body': 'Body font', 'branding.typography.heading': 'Heading font', 'branding.typography.size': 'Base font size', 'branding.typography.weight': 'Heading weight', 'branding.typography.weight.medium': 'Medium', 'branding.typography.weight.bold': 'Bold', 'branding.typography.weight.extraBold': 'Extra bold', 'branding.typography.fallback': 'The selected font loads when needed, with a safe Cairo and Tahoma fallback.'
            , 'branding.login.description': 'Customize the login screen without affecting session security or the form.', 'branding.login.background': 'Background color', 'branding.login.gradientStart': 'Gradient start', 'branding.login.gradientEnd': 'Gradient end', 'branding.login.overlay': 'Overlay strength', 'branding.login.showIllustration': 'Show the image or illustration on the login screen', 'branding.login.showCopy': 'Show the brand name and description', 'branding.login.note': 'The optional background image is uploaded in Logos and Assets as Login Background. The default identity is used when no image exists.'
            , 'branding.interface.description': 'Limited, safe visual customization that preserves layout order and usability.', 'branding.interface.radius': 'Element radius', 'branding.interface.cards': 'Card style', 'branding.interface.shadows': 'Shadows', 'branding.interface.sidebar': 'Sidebar style', 'branding.interface.active': 'Active item style', 'branding.interface.shadow.none': 'None', 'branding.interface.shadow.soft': 'Soft', 'branding.interface.shadow.medium': 'Medium', 'branding.interface.note': 'These settings change appearance only; they cannot change the grid or field order in a way that causes horizontal scrolling.'
            , 'branding.documents.description': 'Contact details and footer shown in print, PDF, and the member portal.', 'branding.documents.phone': 'Phone', 'branding.documents.email': 'Email', 'branding.documents.address': 'Address', 'branding.documents.website': 'Website', 'branding.documents.footer': 'Documents and portal footer', 'branding.documents.watermark': 'Watermark', 'branding.documents.signature': 'Signature', 'branding.documents.stamp': 'Stamp', 'branding.documents.note': 'The member portal and printouts use the same published identity while keeping a white background suitable for paper documents.'
            , 'branding.preview.kicker': 'LIVE PREVIEW', 'branding.preview.title': 'Live preview', 'branding.preview.description': 'Changes remain a draft until the identity is published.', 'branding.preview.theme.aria': 'Preview theme', 'branding.preview.size.aria': 'Preview size'
            , 'branding.actions.discard': 'Discard changes', 'branding.actions.reset': 'Restore defaults', 'branding.actions.save': 'Save draft', 'branding.actions.publish': 'Publish identity', 'branding.actions.title.clean': 'No unsaved changes', 'branding.actions.title.dirty': 'You have unsaved changes', 'branding.actions.title.pending': 'Draft saved but not published', 'branding.actions.hint.dirty': 'Review the preview, then publish the identity to apply it across the platform.', 'branding.actions.hint.clean': 'Current changes match the published identity.'
            , 'branding.status.published': 'Published identity: {{brand}}', 'branding.status.draft': 'Saved draft: {{brand}}', 'branding.status.changed': 'The identity draft has new changes', 'branding.status.savedAsset': '{{asset}} uploaded — save the draft to keep it', 'branding.status.removedAsset': 'Asset removed — save the draft or publish the identity', 'branding.status.addedPayment': 'Identity draft — payment method added', 'branding.status.removedPayment': 'Identity draft — payment method removed', 'branding.status.resetDraft': '“Logic Fit” restored as a draft — publish it to apply', 'branding.version.unpublished': 'Not published yet'
            , 'branding.validation.ready.title': 'Identity is ready to publish', 'branding.validation.ready.body': 'Name, contrast, and essential values passed validation.', 'branding.validation.errors': 'Fix {{count}} issue(s) before publishing', 'branding.validation.warnings': 'Accessibility and readability notes', 'branding.validation.brandRequired': 'Brand name is required.', 'branding.validation.textContrast': 'Primary text contrast in {{theme}} mode is below WCAG AA.', 'branding.validation.primaryContrast': 'Primary button text contrast in {{theme}} mode is insufficient.', 'branding.validation.secondaryContrast': 'Secondary text contrast in {{theme}} mode is low.', 'branding.theme.light.name': 'Light', 'branding.theme.dark.name': 'Dark'
            , 'branding.tokens.onPrimary': 'Primary button text', 'branding.tokens.background': 'App background', 'branding.tokens.surfaceSecondary': 'Secondary surface', 'branding.tokens.card': 'Card background', 'branding.tokens.cardHover': 'Card hover', 'branding.tokens.elevated': 'Elevated element', 'branding.tokens.sidebar': 'Sidebar', 'branding.tokens.header': 'Top bar', 'branding.tokens.textPrimary': 'Primary text', 'branding.tokens.textSecondary': 'Secondary text', 'branding.tokens.textMuted': 'Muted text', 'branding.tokens.textDisabled': 'Disabled text', 'branding.tokens.border': 'Primary border', 'branding.tokens.borderSecondary': 'Subtle border', 'branding.tokens.borderHover': 'Hover border', 'branding.tokens.inputBackground': 'Input background', 'branding.tokens.tableHeader': 'Table header', 'branding.tokens.scrollbarTrack': 'Scrollbar track', 'branding.tokens.scrollbarThumb': 'Scrollbar thumb'
            , 'branding.asset.primaryLogo': 'Primary logo', 'branding.asset.primaryLogo.hint': 'Shown in the top bar and reports.', 'branding.asset.horizontalLogo': 'Horizontal logo', 'branding.asset.horizontalLogo.hint': 'Full version for login and documents.', 'branding.asset.lightLogo': 'Logo for dark backgrounds', 'branding.asset.lightLogo.hint': 'Light version for dark surfaces.', 'branding.asset.darkLogo': 'Logo for light backgrounds', 'branding.asset.darkLogo.hint': 'Dark version for light surfaces.', 'branding.asset.compactLogo': 'Compact logo', 'branding.asset.compactLogo.hint': 'For collapsed sidebars and small sizes.', 'branding.asset.favicon': 'Site icon', 'branding.asset.favicon.hint': 'Browser tab icon.', 'branding.asset.appIcon': 'App icon', 'branding.asset.appIcon.hint': 'Application icon when installed.', 'branding.asset.loginBackground': 'Login background', 'branding.asset.loginBackground.hint': 'Optional image for the login background.', 'branding.asset.loginIllustration': 'Login illustration', 'branding.asset.loginIllustration.hint': 'Optional image beside the login form.', 'branding.asset.defaultAvatar': 'Default avatar', 'branding.asset.defaultAvatar.hint': 'Fallback member photo when no photo exists.', 'branding.asset.printLogo': 'Print logo', 'branding.asset.printLogo.hint': 'Clear version for documents and PDFs.', 'branding.asset.watermark': 'Watermark', 'branding.asset.watermark.hint': 'Optional watermark for documents.', 'branding.asset.upload': 'Upload or replace', 'branding.asset.remove': 'Remove', 'branding.asset.defaultActive': 'Using the default asset', 'branding.asset.uploaded': 'Uploaded'
            , 'branding.payment.empty.title': 'No payment methods added', 'branding.payment.empty.body': 'Add a payment method so members can see this gym’s transfer details.', 'branding.payment.method': 'Payment method {{count}}', 'branding.payment.remove': 'Remove', 'branding.payment.name': 'Method name', 'branding.payment.reference': 'Number or account', 'branding.payment.recipient': 'Recipient name', 'branding.payment.sortOrder': 'Display order', 'branding.payment.instructions': 'Payment instructions', 'branding.payment.instructions.placeholder': 'Brief instructions for the member', 'branding.payment.active': 'Show this method to the member'
            , 'branding.audit.saved': 'Draft saved', 'branding.audit.published': 'Identity published', 'branding.audit.reset': 'Defaults restored', 'branding.audit.uploaded': 'Asset uploaded', 'branding.audit.removed': 'Asset removed', 'branding.audit.operation': 'Operation', 'branding.audit.account': 'Account #{{id}}', 'branding.audit.system': 'System', 'branding.audit.version': 'Version {{version}}', 'branding.audit.empty': 'No activity recorded yet.'
            , 'branding.error.operation': 'Could not complete the operation.', 'branding.error.retry': 'Try again.', 'branding.error.load': 'Could not load branding settings', 'branding.error.loadDetail': 'Could not load branding settings — the safe defaults were kept', 'branding.error.phone': 'Invalid phone number', 'branding.error.fileSize': 'File is too large', 'branding.error.fileLimit': 'Branding assets are limited to 2MB.', 'branding.error.assetUpload': 'Could not upload the asset', 'branding.success.assetUploaded': 'Asset uploaded', 'branding.success.assetUploadedDetail': 'The asset appears in the preview and remains unpublished until you publish the identity.', 'branding.error.assetRemove': 'Could not remove the asset', 'branding.success.assetRemoved': 'Asset removed', 'branding.success.assetRestored': 'The preview has returned to the default asset.', 'branding.success.done': 'Done.', 'branding.success.saved': 'Changes saved', 'branding.success.savedDetail': 'The identity was saved as a draft and has not been published.', 'branding.error.save': 'Could not save the draft', 'branding.error.saveDetail': 'Check the colors and values.', 'branding.success.published': 'Identity published successfully', 'branding.success.publishedDetail': 'Applied to the admin dashboard, member portal, and printouts.', 'branding.error.publish': 'Could not publish the identity', 'branding.error.publishDetail': 'Fix contrast issues and try again.', 'branding.success.discarded': 'Changes discarded', 'branding.success.discardedDetail': 'The screen returned to the last saved draft.'
            , 'branding.confirm.reset.title': 'Restore the default identity?', 'branding.confirm.reset.body': 'The current draft will be replaced with the “Logic Fit” identity and its draft assets removed. The published identity will not change until you select “Publish identity”.', 'branding.confirm.reset.confirm': 'Restore “Logic Fit”', 'branding.confirm.cancel': 'Cancel', 'branding.loading.reset': 'Restoring…', 'branding.success.reset': 'Default identity restored', 'branding.success.resetDetail': 'You can review the preview before publishing.', 'branding.confirm.leave.title': 'You have unsaved changes', 'branding.confirm.leave.body': 'Leave Branding without saving the current changes?', 'branding.confirm.leave.discard': 'Discard changes', 'branding.confirm.leave.stay': 'Stay', 'branding.loading.save': 'Saving…', 'branding.loading.publish': 'Publishing…', 'branding.loading.resetting': 'Restoring…'
            , 'branding.panel.identity.eyebrow': '01 · Brand identity', 'branding.panel.assets.eyebrow': '02 · Assets', 'branding.panel.light.eyebrow': '03 · Light theme', 'branding.panel.dark.eyebrow': '04 · Dark theme', 'branding.panel.typography.eyebrow': '05 · Typography', 'branding.panel.login.eyebrow': '06 · Login', 'branding.panel.interface.eyebrow': '07 · Interface', 'branding.panel.documents.eyebrow': '08 · Documents and portal'
            , 'branding.tokens.primary': 'Primary', 'branding.tokens.primaryHover': 'Primary hover', 'branding.tokens.primaryActive': 'Primary active', 'branding.tokens.secondary': 'Secondary', 'branding.tokens.accent': 'Accent', 'branding.tokens.surface': 'Surface', 'branding.tokens.success': 'Success', 'branding.tokens.warning': 'Warning', 'branding.tokens.danger': 'Danger', 'branding.tokens.info': 'Information', 'branding.tokens.hexValue': '{{label}} HEX value'
            , 'branding.audit.description': 'Track draft saves, publishing, and asset management in one place.'
            , 'branding.payment.name.placeholder': 'Example: mobile wallet', 'branding.payment.reference.placeholder': 'Phone number or account'
            , 'memberPayment.eyebrow': 'GYM MEMBER PAYMENTS · OWNER ONLY', 'memberPayment.title': 'Gym member payment methods', 'memberPayment.description': 'Manage transfer methods for this gym only. Published methods appear to its members in the member portal and remain separate from Logic Fit payment settings.'
            , 'memberPayment.status.loading': 'Loading payment methods…', 'memberPayment.status.loadingSettings': 'Loading payment settings…', 'memberPayment.status.draft': 'Identity draft', 'memberPayment.status.draftChanged': 'The payment-method draft has new changes', 'memberPayment.status.draftSaved': 'Payment methods were saved as a draft.', 'memberPayment.status.publishedReady': 'Published payment details are ready for the member portal.', 'memberPayment.status.draftNotPublished': 'A saved draft has not been published yet.', 'memberPayment.status.loadError': 'Could not load payment settings.', 'memberPayment.status.saveError': 'Could not save payment methods. Try again.', 'memberPayment.status.publishError': 'Could not publish payment methods. Try again.', 'memberPayment.status.leaveError': 'There are unsaved changes. Do you want to leave?', 'memberPayment.meta.draft': 'Version {{version}} · Draft', 'memberPayment.meta.published': 'Version {{version}} · Published'
            , 'memberPayment.methods.eyebrow': 'PAYMENT METHODS', 'memberPayment.methods.title': 'Transfer details', 'memberPayment.methods.description': 'Use this gym’s own account or phone number. Save the draft first, then publish it for members.', 'memberPayment.methods.add': 'Add payment method', 'memberPayment.methods.loading': 'Loading payment settings…', 'memberPayment.methods.empty.title': 'No payment methods added', 'memberPayment.methods.empty.body': 'Add a payment method for this gym so members can view its transfer details.', 'memberPayment.methods.loadError.title': 'Could not load payment methods', 'memberPayment.methods.loadError.body': 'Try refreshing the screen.', 'memberPayment.methods.row': 'Payment method {{count}}', 'memberPayment.methods.remove': 'Remove', 'memberPayment.methods.name': 'Method name', 'memberPayment.methods.reference': 'Number or account', 'memberPayment.methods.recipient': 'Recipient name', 'memberPayment.methods.sortOrder': 'Display order', 'memberPayment.methods.instructions': 'Payment instructions', 'memberPayment.methods.instructions.placeholder': 'Brief instructions for the member', 'memberPayment.methods.name.placeholder': 'Vodafone Cash', 'memberPayment.methods.reference.placeholder': 'Phone number or account', 'memberPayment.methods.active': 'Show this method to the member'
            , 'memberPayment.summary.eyebrow': 'PUBLISHED TO MEMBER PORTAL', 'memberPayment.summary.title': 'Visibility status', 'memberPayment.summary.description': 'Members see a method only when it is active and included in the published identity.', 'memberPayment.summary.activeCount': 'Active methods', 'memberPayment.summary.totalCount': 'Total methods', 'memberPayment.summary.activeNote': 'Active payment methods ({{count}}) will appear to this gym’s members after the identity is published.', 'memberPayment.summary.inactiveNote': 'There are currently no active payment methods published for this gym.'
            , 'memberPayment.action.unsavedTitle': 'You have unsaved changes', 'memberPayment.action.pendingTitle': 'Draft saved but not published', 'memberPayment.action.cleanTitle': 'No unsaved changes', 'memberPayment.action.unsavedHint': 'Save the draft first, then publish it for the details to appear in the member portal.', 'memberPayment.action.pendingHint': 'The details are saved as a draft and will not appear to members until published.', 'memberPayment.action.cleanHint': 'The current changes match the published draft.', 'memberPayment.action.saveDraft': 'Save draft', 'memberPayment.action.publish': 'Save and publish to portal', 'memberPayment.action.loadingSave': 'Saving payment methods…', 'memberPayment.action.savedTitle': 'Draft saved', 'memberPayment.action.saved': 'Payment methods were saved as a draft.', 'memberPayment.action.saveError': 'Could not save the payment-method draft.', 'memberPayment.action.loadingPublish': 'Publishing payment methods…', 'memberPayment.action.publishedTitle': 'Published', 'memberPayment.action.published': 'Payment methods were published to the member portal.', 'memberPayment.action.publishError': 'Could not publish payment methods.'
            , 'memberPayment.validation.required': 'Complete the name and number or account for payment method {{count}}.', 'memberPayment.leave.title': 'Unsaved changes', 'memberPayment.leave.body': 'Leave this screen without saving the payment methods?', 'memberPayment.leave.confirm': 'Leave without saving', 'memberPayment.leave.cancel': 'Stay'
            , 'memberSubscriptionRequests.kicker': 'MEMBER PAYMENT REVIEW', 'memberSubscriptionRequests.title': 'Member subscription requests', 'memberSubscriptionRequests.description': 'Review subscription, renewal, and payment-proof requests for this gym only.', 'memberSubscriptionRequests.refresh': 'Refresh', 'memberSubscriptionRequests.refresh.loading': 'Refreshing requests…', 'memberSubscriptionRequests.filter.label': 'Filter by status', 'memberSubscriptionRequests.filter.pending': 'Pending review', 'memberSubscriptionRequests.filter.approved': 'Approved', 'memberSubscriptionRequests.filter.rejected': 'Rejected', 'memberSubscriptionRequests.filter.all': 'All requests', 'memberSubscriptionRequests.summary.loading': 'Loading requests…', 'memberSubscriptionRequests.loading': 'Loading member requests…', 'memberSubscriptionRequests.loading.update': 'Updating requests…', 'memberSubscriptionRequests.empty.title': 'No matching requests', 'memberSubscriptionRequests.empty.body': 'Subscription and renewal requests will appear here after members submit them through the portal.', 'memberSubscriptionRequests.column.member': 'Member', 'memberSubscriptionRequests.column.request': 'Request and membership', 'memberSubscriptionRequests.column.amount': 'Amount', 'memberSubscriptionRequests.column.proof': 'Payment proof', 'memberSubscriptionRequests.column.date': 'Request date', 'memberSubscriptionRequests.column.status': 'Status and action', 'memberSubscriptionRequests.value.unknown': 'Not specified', 'memberSubscriptionRequests.value.noCode': 'No membership code', 'memberSubscriptionRequests.value.noProof': 'Not attached / not verified', 'memberSubscriptionRequests.value.paymentDateNeeded': 'Date required', 'memberSubscriptionRequests.value.collection': 'Collected', 'memberSubscriptionRequests.value.price': 'Price', 'memberSubscriptionRequests.value.currency': 'EGP', 'memberSubscriptionRequests.value.dash': '—', 'memberSubscriptionRequests.type.membership': 'New membership', 'memberSubscriptionRequests.type.extension': 'Membership extension', 'memberSubscriptionRequests.type.renewal': 'Membership renewal', 'memberSubscriptionRequests.status.pending': 'Pending review', 'memberSubscriptionRequests.status.approved': 'Approved', 'memberSubscriptionRequests.status.rejected': 'Rejected', 'memberSubscriptionRequests.status.cancelled': 'Cancelled', 'memberSubscriptionRequests.action.viewProof': 'View proof', 'memberSubscriptionRequests.action.approve': 'Approve and activate', 'memberSubscriptionRequests.action.reject': 'Reject', 'memberSubscriptionRequests.action.reviewed': 'Reviewed', 'memberSubscriptionRequests.total': 'Total results: {{count}}', 'memberSubscriptionRequests.pagination.page': 'Page {{page}} of {{pages}}', 'memberSubscriptionRequests.pagination.previous': 'Previous', 'memberSubscriptionRequests.pagination.next': 'Next', 'memberSubscriptionRequests.error.load.title': 'Could not load requests', 'memberSubscriptionRequests.error.load.retry': 'Try again', 'memberSubscriptionRequests.error.operation': 'The operation could not be completed. Try again.', 'memberSubscriptionRequests.error.notFound': 'The request was not found or is no longer available.', 'memberSubscriptionRequests.error.alreadyReviewed': 'This request has already been reviewed. Refresh the list.', 'memberSubscriptionRequests.error.proofRequired': 'A verified payment proof is required before approval.', 'memberSubscriptionRequests.error.proofIntegrity': 'Payment proof integrity could not be verified.', 'memberSubscriptionRequests.error.proofUnavailable': 'Payment proof is currently unavailable.', 'memberSubscriptionRequests.error.proofChanged': 'Payment proof changed during review. Refresh the list and try again.', 'memberSubscriptionRequests.error.paymentDateRequired': 'Enter the actual collection date before approval.', 'memberSubscriptionRequests.error.paymentDateFuture': 'The collection date cannot be in the future.', 'memberSubscriptionRequests.error.storageNotConfigured': 'Payment-proof storage is not configured.', 'memberSubscriptionRequests.error.storageUnavailable': 'Payment-proof storage is currently unavailable. Try again later.', 'memberSubscriptionRequests.error.planUnavailable': 'The requested plan is no longer available.', 'memberSubscriptionRequests.error.typeUnavailable': 'The requested membership type is no longer available.', 'memberSubscriptionRequests.error.renewalRequiresExisting': 'An extension or renewal requires an existing membership. Update the member record and try again.', 'memberSubscriptionRequests.error.freezeActive': 'A membership cannot be extended while frozen. Resume it first and try again.', 'memberSubscriptionRequests.error.overlap': 'The request was converted to an extension or renewal to avoid overlapping memberships. Refresh the list and try again.', 'memberSubscriptionRequests.error.snapshotInvalid': 'The membership duration is invalid. Review membership settings and create a new request.', 'memberSubscriptionRequests.error.currentDatesInvalid': 'The current membership dates are invalid. Review the member record before approval.', 'memberSubscriptionRequests.dialog.reject.title': 'Reject subscription request', 'memberSubscriptionRequests.dialog.reject.reason': 'Reason for rejection', 'memberSubscriptionRequests.dialog.reject.placeholder': 'Write a clear reason for the member', 'memberSubscriptionRequests.dialog.reject.confirm': 'Reject request', 'memberSubscriptionRequests.dialog.cancel': 'Cancel', 'memberSubscriptionRequests.dialog.reject.required': 'A rejection reason is required.', 'memberSubscriptionRequests.dialog.approve.title': 'Approve this subscription request?', 'memberSubscriptionRequests.dialog.approve.body': 'The membership will be created or renewed and the payment recorded in one transaction.', 'memberSubscriptionRequests.dialog.paymentDate': 'Actual collection date', 'memberSubscriptionRequests.dialog.approve.confirm': 'Approve and activate', 'memberSubscriptionRequests.dialog.paymentDate.required': 'A collection date is required.', 'memberSubscriptionRequests.dialog.approve.fallback': 'The membership will be activated and payment recorded using the selected collection date. Continue?', 'memberSubscriptionRequests.status.approvedNotice': 'The request was approved and the membership activated.', 'memberSubscriptionRequests.status.rejectedNotice': 'The request was rejected.', 'memberSubscriptionRequests.status.approveError': 'Could not approve the request.', 'memberSubscriptionRequests.status.rejectError': 'Could not reject the request.'
            , 'branding.preview.theme.light': '☀ Light', 'branding.preview.theme.dark': '◐ Dark', 'branding.preview.size.desktop': 'Desktop', 'branding.preview.size.mobile': 'Mobile'
            , 'branding.interface.radius.sharp': 'Sharp', 'branding.interface.radius.small': 'Small', 'branding.interface.radius.medium': 'Medium', 'branding.interface.radius.large': 'Large'
            , 'branding.interface.cards.flat': 'Flat', 'branding.interface.cards.border': 'Border', 'branding.interface.cards.softShadow': 'Soft shadow'
            , 'branding.interface.sidebar.brand': 'Brand', 'branding.interface.sidebar.light': 'Light', 'branding.interface.sidebar.dark': 'Dark', 'branding.interface.sidebar.auto': 'Auto'
            , 'branding.interface.active.background': 'Background', 'branding.interface.active.indicator': 'Indicator', 'branding.interface.active.pill': 'Pill'
            , 'branding.confirm.removeAsset.title': 'Remove this branding asset?', 'branding.confirm.removeAsset.body': 'The system will return to the default asset after the identity is published.', 'branding.error.reset': 'Could not restore the identity'
            , 'branding.panel.identity.title': 'Brand identity', 'branding.panel.assets.title': 'Logos and assets', 'branding.panel.light.title': 'Light Mode colors', 'branding.panel.dark.title': 'Dark Mode colors', 'branding.panel.typography.title': 'Typography', 'branding.panel.login.title': 'Login screen', 'branding.panel.interface.title': 'Interface', 'branding.panel.documents.title': 'Documents and member portal'
            , 'branding.audit.title': 'Brand history', 'branding.audit.kicker': 'VERSION HISTORY', 'branding.preview.sample.search': 'Search members', 'branding.preview.welcomeFallback': 'Smarter management for a stronger gym.', 'branding.preview.metric.revenueValue': '42K', 'branding.preview.table.member': 'Member', 'branding.preview.table.status': 'Status', 'branding.preview.table.action': 'Action'
            , 'branding.preview.nav.home': 'Home', 'branding.preview.nav.members': 'Members', 'branding.preview.nav.reports': 'Reports', 'branding.preview.metric.members': 'Members', 'branding.preview.metric.attendance': 'Attendance', 'branding.preview.metric.revenue': 'Revenue', 'branding.preview.sample.card': 'Operations card', 'branding.preview.sample.today': 'Today', 'branding.preview.sample.action': 'Action', 'branding.preview.sample.memberOne': 'Ahmed Ali', 'branding.preview.sample.memberTwo': 'Sarah Mohamed', 'branding.preview.sample.status': 'Active', 'branding.preview.sample.view': 'View', 'branding.preview.sample.edit': 'Edit', 'branding.preview.sample.modal': 'Dialog preview', 'branding.preview.sample.modalBody': 'Dialogs and form controls automatically follow the same identity.', 'branding.preview.sample.confirm': 'Confirm'
            , 'branding.payment.instructions.ownerValue': 'Value entered by the gym owner', 'branding.asset.preview.initialFallback': 'G', 'branding.version.separator': ' · '
            , 'branding.confirm.removeAsset.confirm': 'Remove', 'branding.confirm.removeAsset.cancel': 'Cancel', 'branding.confirm.removeAsset.fallback': 'Remove the branding asset and return to the default?', 'branding.confirm.reset.fallback': 'Restore the default “Logic Fit” identity?', 'branding.confirm.leave.fallback': 'You have unsaved changes. Leave this screen?'
        })
    });

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

    function format(kind, value, options = {}) {
        const locale = currentLocale === 'en' ? 'en-EG' : 'ar-EG';
        if (kind === 'number') {
            const number = Number(value);
            return Number.isFinite(number) ? new Intl.NumberFormat(locale, options).format(number) : '';
        }
        if (kind === 'currency') {
            const number = Number(value);
            return Number.isFinite(number) ? new Intl.NumberFormat(locale, { style: 'currency', currency: options.currency || 'EGP', ...options }).format(number) : '';
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
            return new Intl.DateTimeFormat(locale, formatterOptions).format(date);
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
            return new Intl.DateTimeFormat(locale, formatterOptions).format(date);
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

    function applyTranslations(root = document) {
        const elements = [];
        if (typeof Element === 'function' && root instanceof Element && root.matches('[data-i18n], [data-i18n-placeholder], [data-i18n-title], [data-i18n-aria-label], [data-i18n-format]')) elements.push(root);
        root.querySelectorAll?.('[data-i18n], [data-i18n-placeholder], [data-i18n-title], [data-i18n-aria-label], [data-i18n-format]').forEach((element) => elements.push(element));
        elements.forEach((element) => {
            if (element.closest?.('[data-i18n-preserve]')) return;
            const params = {};
            Object.keys(element.dataset).forEach((name) => {
                if (name.startsWith('i18nParam')) {
                    const parameter = name.slice(9, 10).toLowerCase() + name.slice(10);
                    const value = element.dataset[name];
                    params[parameter] = parameter === 'count' && /^\d+(?:\.\d+)?$/u.test(value) ? Number(value) : value;
                }
            });
            const textKey = element.dataset.i18n;
            if (textKey) {
                const translated = t(textKey, params);
                const textNode = [...element.childNodes].find((node) => node.nodeType === Node.TEXT_NODE && node.nodeValue.trim());
                if (textNode) {
                    const leading = textNode.nodeValue.match(/^\s*/u)?.[0] || '';
                    const trailing = textNode.nodeValue.match(/\s*$/u)?.[0] || '';
                    textNode.nodeValue = `${leading}${translated}${trailing}`;
                } else if (!element.children.length) element.textContent = translated;
            }
            [['i18nPlaceholder', 'placeholder'], ['i18nTitle', 'title'], ['i18nAriaLabel', 'aria-label'], ['i18nDataLoadingText', 'data-loading-text']].forEach(([dataKey, attribute]) => {
                const key = element.dataset[dataKey];
                if (key) element.setAttribute(attribute, t(key, params));
            });
            if (element.dataset.i18nFormat) {
                const formatted = format(element.dataset.i18nFormat, element.dataset.i18nValue, { currency: element.dataset.i18nCurrency || undefined });
                if (element.textContent !== formatted) element.textContent = formatted;
            }
        });
    }

    function annotateText(root, prefix, skipSelector = '') {
        if (!root?.ownerDocument && root !== document) return;
        const catalog = new Map(Object.entries(messages.ar).filter(([key]) => key.startsWith(prefix)).map(([key, value]) => [value, key]));
        const elements = [];
        if (root instanceof Element) elements.push(root);
        root.querySelectorAll?.('*').forEach((element) => elements.push(element));
        const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
        while (walker.nextNode()) {
            const node = walker.currentNode;
            const parent = node.parentElement;
            if (!parent || parent.closest('[data-i18n-preserve]') || (skipSelector && parent.closest(skipSelector))) continue;
            const source = node.nodeValue.trim();
            if (!source || parent.dataset.i18n) continue;
            const key = catalog.get(source);
            if (key) parent.dataset.i18n = key;
        }
        const attributes = ['placeholder', 'title', 'aria-label', 'data-loading-text'];
        elements.forEach((element) => {
            if (element.closest('[data-i18n-preserve]') || (skipSelector && element.closest(skipSelector))) return;
            attributes.forEach((attribute) => {
                const value = element.getAttribute(attribute);
                const key = value && catalog.get(value.trim());
                if (key) element.dataset[`i18n${attribute.split('-').map((part) => part[0].toUpperCase() + part.slice(1)).join('')}`] = key;
            });
        });
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
            ['#authRecoveryDialog .auth-dialog-confirm', 'login.recovery.confirm'],
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
        const segmented = document.querySelector('#authScreen .auth-locale-segmented[data-locale-segmented]');
        if (segmented) {
            const target = currentLocale === 'ar' ? 'en' : 'ar';
            const switchKey = target === 'en' ? 'language.switchToEnglish' : 'language.switchToArabic';
            segmented.querySelectorAll('[data-locale-choice]').forEach((button) => {
                const locale = button.dataset.localeChoice;
                button.setAttribute('aria-pressed', String(locale === currentLocale));
                button.setAttribute('lang', locale);
                button.setAttribute('dir', localeMeta[locale]?.dir || 'ltr');
                if (locale === target) {
                    button.id = 'languageToggleButton';
                    button.setAttribute('aria-label', t(switchKey));
                    button.setAttribute('title', t(switchKey));
                } else {
                    button.removeAttribute('id');
                    button.removeAttribute('title');
                    button.setAttribute('aria-label', locale === 'ar' ? 'العربية' : 'English');
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
            mobileNav.setAttribute('aria-label', t('shell.menu'));
            mobileNav.setAttribute('title', t('shell.menu'));
            const hiddenLabel = mobileNav.querySelector('[data-mobile-nav-label]');
            if (hiddenLabel) hiddenLabel.textContent = t('shell.menu');
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
            ['#topAddMemberButton', 'shell.addMember'],
            ['#topPricingButton', 'shell.pricing'],
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
        const topbarActions = document.querySelector('.topbar-mobile-actions');
        const rootLoginActions = document.querySelector('#authScreen[data-auth-stage="login"] .auth-reference-controls[data-i18n-switcher]');
        const genericSwitcher = document.querySelector('[data-i18n-switcher]');
        const actions = loginPage
            ? (genericSwitcher || document.querySelector('.auth-form-heading'))
            : authenticated
                ? (topbarActions || genericSwitcher || rootLoginActions)
                : (rootLoginActions || genericSwitcher || topbarActions);
        if (!actions) return;
        const segmented = loginPage && actions.querySelector('[data-locale-segmented]');
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
        if (!languageButton) {
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
        applyShell
    });

    function setup() {
        installLanguageButton();
        if (document.body && typeof MutationObserver === 'function' && !languageHostObserver) {
            languageHostObserver = new MutationObserver(() => installLanguageButton());
            languageHostObserver.observe(document.body, { attributes: true, attributeFilter: ['data-top-gym-authenticated'] });
        }
        set(currentLocale, { persist: false });
        const rail = document.getElementById('pageTabs');
        if (rail && typeof MutationObserver === 'function') {
            navigationObserver = new MutationObserver(applyNavigationLabels);
            navigationObserver.observe(rail, { childList: true, subtree: true });
        }
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', setup, { once: true });
    else setup();
})();
