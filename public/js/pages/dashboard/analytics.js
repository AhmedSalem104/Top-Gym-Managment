(() => {
    if (window.__topGymDashboardAnalyticsLoaded) return;
    window.__topGymDashboardAnalyticsLoaded = true;

    const state = { period: 'month', requestId: 0, abortController: null };
    const PERIOD_LABELS = { week: 'هذا الأسبوع', month: 'هذا الشهر', year: 'هذه السنة' };
    const STATUS_LABELS = { active: 'نشطة', expiring_soon: 'قريبة الانتهاء', expired: 'منتهية', frozen: 'مجمدة' };
    const PLAN_LABELS = { gym_only: 'جيم فقط', gym_cardio: 'جيم وكارديو' };
    const TYPE_LABELS = { monthly: 'شهرية', half_month: 'نصف شهر', quarterly: 'ربع سنوية', semiannual: 'نصف سنوية', annual: 'سنوية', 'two month': 'شهرين', custom_mslzyl8m: 'شهرين' };
    const PAYMENT_LABELS = { cash: 'نقدي', card: 'بطاقة', transfer: 'تحويل', other: 'أخرى' };

    function $(id) { return document.getElementById(id); }
    function brandName() { return String(window.topGymBranding?.get?.().identity?.brandName || 'الجيم').trim() || 'الجيم'; }
    function number(value) { return Number(value || 0).toLocaleString('ar-EG'); }
    function money(value) { return `${Number(value || 0).toLocaleString('ar-EG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ج.م`; }
    function escapeHtml(value) { return String(value ?? '').replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[character])); }

    function formatDate(value, options = { dateStyle: 'medium' }) {
        if (!value) return '—';
        return new Intl.DateTimeFormat('ar-EG', options).format(new Date(`${String(value).slice(0, 10)}T00:00:00Z`));
    }

    function bucketLabel(value, period) {
        if (period === 'year') return formatDate(value, { month: 'short' });
        return formatDate(value, { day: 'numeric', month: 'short' });
    }

    function periodText(data) {
        const period = data.period || {};
        return `${PERIOD_LABELS[period.key] || ''} · ${formatDate(period.startDate)} — ${formatDate(period.endDate)}`;
    }

    function comparisonSummary(data, key, inverse = false) {
        const comparison = data.comparisons?.[key];
        if (!comparison) return '';
        if (comparison.percent === null) return comparison.current > 0 ? 'جديد خلال الفترة' : 'بدون حركة';
        if (comparison.direction === 'flat') return 'بدون تغيير عن السابقة';
        const percent = Math.abs(Number(comparison.percent || 0)).toLocaleString('ar-EG', { maximumFractionDigits: 1 });
        const arrow = comparison.direction === 'up' ? '↑' : '↓';
        const isPositive = inverse ? comparison.direction === 'down' : comparison.direction === 'up';
        return `<span class="${isPositive ? 'is-positive' : 'is-negative'}">${arrow} ${percent}٪</span> عن الفترة السابقة`;
    }

    function comparisonMarkup(data, key, inverse = false) {
        const summary = comparisonSummary(data, key, inverse);
        if (!summary) return '';
        const comparison = data.comparisons?.[key] || {};
        const tone = comparison.direction === 'flat'
            ? 'neutral'
            : (inverse ? comparison.direction === 'down' : comparison.direction === 'up') ? 'positive' : 'negative';
        return `<small class="analytics-kpi-delta ${tone}">${summary}</small>`;
    }

    function ensurePanel() {
        const panel = $('dashboardAnalytics');
        if (!panel || panel.dataset.ready === 'true') return panel;
        if (!window.topGymAuth?.isOwner?.()) panel.hidden = true;
        panel.dataset.ready = 'true';
        panel.innerHTML = `
            <div class="dashboard-analytics-head">
                <div class="dashboard-analytics-title">
                    <span class="dashboard-analytics-icon" aria-hidden="true"><svg class="ui-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19V5"/><path d="M4 19h16"/><path d="m7 15 3-4 3 2 5-6"/></svg></span>
                    <div><span class="dashboard-analytics-eyebrow">تحليلات ${brandName()}</span><h2 id="dashboardAnalyticsTitle">مؤشرات الأداء والرسومات البيانية</h2><p id="dashboardAnalyticsPeriod">جاري تحميل التحليلات…</p></div>
                </div>
                <div class="analytics-period-switch" role="tablist" aria-label="الفترة الزمنية للتحليلات">
                    <button type="button" data-analytics-period="week" role="tab" aria-selected="false">أسبوعي</button>
                    <button type="button" data-analytics-period="month" role="tab" aria-selected="true">شهري</button>
                    <button type="button" data-analytics-period="year" role="tab" aria-selected="false">سنوي</button>
                </div>
            </div>
            <div class="analytics-loading" id="dashboardAnalyticsLoading" hidden>جاري تحديث المؤشرات…</div>
            <div class="analytics-smart-strip" id="analyticsSmartStrip"></div>
            <div class="analytics-kpis" id="dashboardAnalyticsKpis"></div>
            <div class="analytics-main-grid">
                <section class="analytics-card analytics-trend-card" aria-labelledby="analyticsTrendTitle">
                    <div class="analytics-card-head"><div><span>الحركة المالية</span><h3 id="analyticsTrendTitle">التحصيل والمصروفات</h3></div><div class="analytics-legend"><span><i class="collected"></i>التحصيل</span><span><i class="expenses"></i>المصروفات</span></div></div>
                    <div class="analytics-trend-wrap" id="analyticsTrendChart"><div class="analytics-chart-empty">لا توجد بيانات كافية بعد.</div></div>
                </section>
                <section class="analytics-card" aria-labelledby="analyticsStatusTitle">
                    <div class="analytics-card-head"><div><span>الوضع الحالي</span><h3 id="analyticsStatusTitle">حالات الأعضاء</h3></div></div>
                    <div class="analytics-bars" id="analyticsStatusChart"></div>
                </section>
            </div>
            <div class="analytics-secondary-grid">
                <section class="analytics-card" aria-labelledby="analyticsMembershipTitle">
                    <div class="analytics-card-head"><div><span>خلال الفترة</span><h3 id="analyticsMembershipTitle">توزيع الاشتراكات</h3></div></div>
                    <div class="analytics-bars" id="analyticsMembershipChart"></div>
                </section>
                <section class="analytics-card" aria-labelledby="analyticsPaymentTitle">
                    <div class="analytics-card-head"><div><span>التحصيل</span><h3 id="analyticsPaymentTitle">طرق الدفع</h3></div></div>
                    <div class="analytics-bars" id="analyticsPaymentChart"></div>
                </section>
                <section class="analytics-card analytics-activity-card" aria-labelledby="analyticsActivityTitle">
                    <div class="analytics-card-head"><div><span>النشاط</span><h3 id="analyticsActivityTitle">الأعضاء والاشتراكات</h3></div></div>
                    <div class="analytics-activity-chart" id="analyticsActivityChart"></div>
                </section>
            </div>
            <section class="analytics-card attendance-insights-card" aria-labelledby="attendanceInsightsTitle">
                <div class="attendance-insights-head">
                    <div class="attendance-insights-heading">
                        <span class="attendance-insights-heading-icon" aria-hidden="true"><svg class="ui-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 7h8M8 11h3M8 15h8"/><path d="m14 11 1.5 1.5L18 10"/></svg></span>
                        <div><span>تحليل التشغيل</span><h3 id="attendanceInsightsTitle">تحليل الحضور والانصراف</h3><p>اعرف أوقات الذروة، أكثر المشتركين حضورًا، ومن يحتاج إلى متابعة.</p></div>
                    </div>
                    <span class="attendance-insights-badge" id="attendanceInsightsBadge">—</span>
                </div>
                <div class="attendance-insights-kpis" id="attendanceInsightsKpis"></div>
                <div class="attendance-insights-grid">
                    <section class="attendance-insights-cardlet" aria-labelledby="attendancePeakTitle"><div class="attendance-insights-cardlet-head"><div><span>الزحام</span><h4 id="attendancePeakTitle">أوقات الذروة</h4></div></div><div class="attendance-peak-list" id="attendancePeakChart"></div></section>
                    <section class="attendance-insights-cardlet" aria-labelledby="attendanceTopTitle"><div class="attendance-insights-cardlet-head"><div><span>الالتزام</span><h4 id="attendanceTopTitle">الأكثر حضورًا</h4></div></div><div class="attendance-member-list" id="attendanceTopMembers"></div></section>
                    <section class="attendance-insights-cardlet" aria-labelledby="attendanceInactiveTitle"><div class="attendance-insights-cardlet-head"><div><span>المتابعة</span><h4 id="attendanceInactiveTitle">لم يحضروا منذ 7 أيام</h4></div></div><div class="attendance-member-list" id="attendanceInactiveMembers"></div></section>
                </div>
            </section>`;

        panel.querySelectorAll('[data-analytics-period]').forEach((button) => {
            button.addEventListener('click', () => loadAnalytics(button.dataset.analyticsPeriod));
        });
        return panel;
    }

    function setActivePeriod(period) {
        document.querySelectorAll('[data-analytics-period]').forEach((button) => {
            const active = button.dataset.analyticsPeriod === period;
            button.classList.toggle('active', active);
            button.setAttribute('aria-selected', String(active));
        });
    }

    function renderKpis(data) {
        const kpis = data.kpis || {};
        const attendance = data.attendance?.kpis || {};
        const attentionCount = Number(kpis.expiringSoon || 0) + Number(kpis.expiredMembers || 0);
        const items = [
            { key: 'newMembers', label: 'أعضاء جدد', value: number(kpis.newMembers), meta: PERIOD_LABELS[data.period?.key] || '', delta: comparisonMarkup(data, 'newMembers'), tone: 'indigo', icon: 'plus' },
            { key: 'collected', label: 'التحصيل الفعلي', value: money(kpis.collected), meta: `${number(kpis.paidTransactions)} دفعة`, delta: comparisonMarkup(data, 'collected'), tone: 'green', icon: 'up' },
            { key: 'net', label: 'صافي الفترة', value: money(kpis.net), meta: 'التحصيل − المصروفات', delta: comparisonMarkup(data, 'net'), tone: kpis.net < 0 ? 'red' : 'teal', icon: 'net' },
            { key: 'visits', label: 'زيارات الحضور', value: number(attendance.visits), meta: `${number(attendance.uniqueMembers)} مشترك حضر`, delta: comparisonMarkup(data, 'visits'), tone: 'blue', icon: 'visits' },
            { key: 'outstanding', label: 'المبالغ المتبقية', value: money(kpis.outstanding), meta: `${number(kpis.outstandingCount)} اشتراك`, tone: 'rose', icon: 'clock' },
            { key: 'attention', label: 'تحتاج متابعة', value: number(attentionCount), meta: `${number(attendance.inactiveMembers)} غائب 7 أيام`, tone: 'amber', icon: 'alert' }
        ];
        const icons = {
            plus: '<path d="M12 5v14M5 12h14"/>',
            up: '<path d="M4 17 10 11l4 4 6-8"/><path d="M15 7h5v5"/>',
            net: '<path d="M4 19V5"/><path d="M4 19h16"/><path d="m7 15 3-4 3 2 5-6"/>',
            clock: '<circle cx="12" cy="12" r="8"/><path d="M12 8v4l3 2"/>',
            alert: '<path d="M12 3 2.5 20h19L12 3Z"/><path d="M12 9v4M12 17h.01"/>',
            visits: '<path d="M4 19V5"/><path d="M4 19h16"/><path d="M7 15v-3M11 15V8M15 15v-6M19 15v-9"/>'
        };
        $('dashboardAnalyticsKpis').innerHTML = items.map((item) => `<article class="analytics-kpi ${item.tone}"><span class="analytics-kpi-icon" aria-hidden="true"><svg class="ui-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${icons[item.icon] || ''}</svg></span><div><span>${item.label}</span><strong>${item.value}</strong><small>${item.meta}</small>${item.delta || ''}</div></article>`).join('');
    }

    function renderSmartStrip(data) {
        const kpis = data.kpis || {};
        const attendance = data.attendance?.kpis || {};
        const currentMembers = Number(kpis.currentMembers || 0);
        const activeMembers = Number(kpis.activeMembers || 0);
        const collected = Number(kpis.collected || 0);
        const expenses = Number(kpis.expenses || 0);
        const net = Number(kpis.net || 0);
        const activeRate = currentMembers ? Math.round((activeMembers / currentMembers) * 100) : 0;
        const expenseRatio = collected ? Math.round((expenses / collected) * 100) : (expenses ? 100 : 0);
        const healthScore = Math.max(0, Math.min(100, Math.round((activeRate * .45) + (net >= 0 ? 30 : 8) + Math.max(0, 25 - (expenseRatio * .35)))));
        const healthLabel = healthScore >= 80 ? 'أداء ممتاز' : healthScore >= 60 ? 'أداء مستقر' : healthScore >= 35 ? 'يحتاج متابعة' : 'بيانات تحتاج تدخل';
        const priorityCount = Number(kpis.alertsCount || 0);
        const priorityText = Number(kpis.outstandingCount || 0) > 0
            ? `${number(kpis.outstandingCount)} اشتراك عليه رصيد`
            : Number(kpis.expiringSoon || 0) > 0
                ? `${number(kpis.expiringSoon)} اشتراك يقترب انتهاؤه`
                : Number(attendance.inactiveMembers || 0) > 0
                    ? `${number(attendance.inactiveMembers)} مشترك يحتاج تنشيطًا`
                    : 'لا توجد أولوية عاجلة';
        $('analyticsSmartStrip').innerHTML = `<article class="analytics-smart-health"><div class="analytics-health-ring"><strong>${number(healthScore)}٪</strong><span>مؤشر الصحة</span></div><div><span class="analytics-smart-eyebrow">القراءة الذكية</span><h3>${healthLabel}</h3><p>${net >= 0 ? `الصافي موجب، ونسبة المصروفات ${number(expenseRatio)}٪ من التحصيل.` : 'المصروفات أعلى من التحصيل وتحتاج مراجعة.'}</p></div></article><article class="analytics-smart-insight blue"><span class="analytics-smart-insight-icon" aria-hidden="true"><svg class="ui-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="m8 12 2.5 2.5L16.5 9"/></svg></span><div><span>نسبة النشاط</span><strong>${number(activeRate)}٪</strong><small>${number(activeMembers)} عضو نشط من ${number(currentMembers)}</small></div></article><article class="analytics-smart-insight green"><span class="analytics-smart-insight-icon" aria-hidden="true"><svg class="ui-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 17 10 11l4 4 6-8"/><path d="M15 7h5v5"/></svg></span><div><span>اتجاه التحصيل</span><strong>${money(collected)}</strong><small>${comparisonSummary(data, 'collected') || 'لا توجد فترة مقارنة'}</small></div></article><article class="analytics-smart-insight rose"><span class="analytics-smart-insight-icon" aria-hidden="true"><svg class="ui-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9"/><path d="M10 21h4"/></svg></span><div><span>أولوية المتابعة</span><strong>${number(priorityCount)}</strong><small>${escapeHtml(priorityText)}</small></div></article>`;
    }

    function renderTrend(data) {
        const target = $('analyticsTrendChart');
        const trend = data.trend || {};
        const labels = trend.labels || [];
        const collected = trend.collected || [];
        const expenses = trend.expenses || [];
        if (!target) return;
        if (!labels.length || ![...collected, ...expenses].some((value) => Number(value || 0) > 0)) {
            target.innerHTML = '<div class="analytics-chart-empty">ستظهر الحركة المالية هنا بعد تسجيل أول تحصيل أو مصروف.</div>';
            return;
        }
        const width = 820;
        const height = 285;
        const padding = { top: 18, right: 18, bottom: 38, left: 54 };
        const chartWidth = width - padding.left - padding.right;
        const chartHeight = height - padding.top - padding.bottom;
        const allValues = [...collected, ...expenses].map((value) => Number(value || 0));
        const maxValue = Math.max(1, ...allValues);
        const x = (index) => padding.left + (labels.length === 1 ? chartWidth / 2 : (index / (labels.length - 1)) * chartWidth);
        const y = (value) => padding.top + chartHeight - (Number(value || 0) / maxValue) * chartHeight;
        const makePoints = (values) => values.map((value, index) => `${x(index).toFixed(1)},${y(value).toFixed(1)}`).join(' ');
        const yTicks = [0, .5, 1].map((ratio) => {
            const value = maxValue * ratio;
            const lineY = y(value);
            return `<line x1="${padding.left}" y1="${lineY}" x2="${width - padding.right}" y2="${lineY}" class="analytics-grid-line"/><text x="${padding.left - 9}" y="${lineY + 4}" class="analytics-axis-label" text-anchor="end">${escapeHtml(money(value).replace(' ج.م', ''))}</text>`;
        }).join('');
        const step = labels.length <= 8 ? 1 : Math.ceil(labels.length / 7);
        const xLabels = labels.map((label, index) => {
            if (index % step !== 0 && index !== labels.length - 1) return '';
            return `<text x="${x(index)}" y="${height - 12}" class="analytics-axis-label" text-anchor="middle">${escapeHtml(bucketLabel(label, data.period?.key))}</text>`;
        }).join('');
        const collectedPoints = makePoints(collected);
        const expensePoints = makePoints(expenses);
        target.innerHTML = `<svg class="analytics-trend-svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="رسم التحصيل والمصروفات"><g>${yTicks}</g><polyline points="${collectedPoints}" class="analytics-line collected-line"/><polyline points="${expensePoints}" class="analytics-line expenses-line"/><g class="analytics-points collected-points">${collected.map((value, index) => `<circle cx="${x(index)}" cy="${y(value)}" r="3.5"><title>${bucketLabel(labels[index], data.period?.key)}: ${money(value)}</title></circle>`).join('')}</g><g class="analytics-points expenses-points">${expenses.map((value, index) => `<circle cx="${x(index)}" cy="${y(value)}" r="3.5"><title>${bucketLabel(labels[index], data.period?.key)}: ${money(value)}</title></circle>`).join('')}</g><g>${xLabels}</g></svg>`;
    }

    function renderBars(targetId, items, labels, emptyText = 'لا توجد بيانات خلال الفترة.') {
        const target = $(targetId);
        if (!target) return;
        const rows = (items || []).filter((item) => Number(item.value || 0) > 0);
        if (!rows.length) {
            target.innerHTML = `<div class="analytics-bars-empty">${emptyText}</div>`;
            return;
        }
        const max = Math.max(1, ...rows.map((item) => Number(item.value || 0)));
        target.innerHTML = rows.map((item) => {
            const value = Number(item.value || 0);
            const width = Math.max(4, (value / max) * 100);
            const label = labels[item.key] || item.key;
            return `<div class="analytics-bar-row"><div class="analytics-bar-label"><span>${escapeHtml(label)}</span><strong>${number(value)}</strong></div><div class="analytics-bar-track"><span style="width:${width.toFixed(2)}%"></span></div></div>`;
        }).join('');
    }

    function renderActivity(data) {
        const target = $('analyticsActivityChart');
        const trend = data.trend || {};
        const members = trend.newMembers || [];
        const memberships = trend.newMemberships || [];
        const max = Math.max(1, ...members, ...memberships);
        if (!target) return;
        if (!members.length || ![...members, ...memberships].some((value) => Number(value || 0) > 0)) {
            target.innerHTML = '<div class="analytics-chart-empty">لا توجد حركة تسجيل أو اشتراكات في هذه الفترة.</div>';
            return;
        }
        const step = members.length <= 12 ? 1 : Math.ceil(members.length / 8);
        target.innerHTML = `<div class="analytics-activity-legend"><span><i class="members"></i>أعضاء جدد</span><span><i class="memberships"></i>اشتراكات</span></div><div class="analytics-column-chart">${members.map((value, index) => { const membershipValue = Number(memberships[index] || 0); const memberHeight = Math.max(4, (Number(value || 0) / max) * 100); const membershipHeight = Math.max(4, (membershipValue / max) * 100); const label = index % step === 0 || index === members.length - 1 ? bucketLabel((data.trend.labels || [])[index], data.period?.key) : ''; return `<div class="analytics-column-group"><div class="analytics-column-pair"><span class="analytics-column members" style="height:${memberHeight.toFixed(2)}%" title="أعضاء جدد: ${number(value)}"></span><span class="analytics-column memberships" style="height:${membershipHeight.toFixed(2)}%" title="اشتراكات: ${number(membershipValue)}"></span></div><small>${escapeHtml(label)}</small></div>`; }).join('')}</div>`;
    }

    function formatDateTime(value) {
        if (!value) return '—';
        return new Intl.DateTimeFormat('ar-EG', {
            dateStyle: 'short',
            timeStyle: 'short',
            timeZone: 'Africa/Cairo'
        }).format(new Date(value));
    }

    function renderAttendanceInsights(data) {
        const attendance = data.attendance || {};
        const kpis = attendance.kpis || {};
        const formatDecimal = (value) => Number(value || 0).toLocaleString('ar-EG', { maximumFractionDigits: 1 });
        const peakHour = kpis.peakHour || '—';
        const badge = $('attendanceInsightsBadge');
        if (badge) badge.textContent = peakHour === '—' ? 'لا توجد زيارات' : `الذروة ${peakHour}`;

        const kpiItems = [
            ['الزيارات', number(kpis.visits), 'خلال الفترة', 'blue'],
            ['مشتركون حضروا', number(kpis.uniqueMembers), 'مشترك مختلف', 'green'],
            ['المتوسط اليومي', formatDecimal(kpis.averageVisitsPerDay), 'زيارة في اليوم', 'violet'],
            ['تحتاج متابعة', number(kpis.inactiveMembers), 'بلا حضور 7 أيام', 'amber']
        ];
        if ($('attendanceInsightsKpis')) $('attendanceInsightsKpis').innerHTML = kpiItems.map(([label, value, meta, tone]) => `<article class="attendance-insights-kpi ${tone}"><strong>${value}</strong><span>${label}</span><small>${meta}</small></article>`).join('');

        const peakTarget = $('attendancePeakChart');
        const peakRows = (attendance.peakHours || []).filter((item) => Number(item.value || 0) > 0);
        if (peakTarget) {
            if (!peakRows.length) peakTarget.innerHTML = '<div class="attendance-insights-empty">لا توجد زيارات مسجلة في هذه الفترة.</div>';
            else {
                const max = Math.max(1, ...peakRows.map((item) => Number(item.value || 0)));
                peakTarget.innerHTML = peakRows.map((item) => { const value = Number(item.value || 0); const width = Math.max(4, (value / max) * 100); return `<div class="attendance-peak-row"><div><span>${escapeHtml(item.label || '—')}</span><strong>${number(value)} زيارة</strong></div><div class="attendance-peak-track"><span style="width:${width.toFixed(2)}%"></span></div></div>`; }).join('');
            }
        }

        const renderMembers = (targetId, rows, inactive = false) => {
            const target = $(targetId);
            if (!target) return;
            if (!rows.length) {
                target.innerHTML = `<div class="attendance-insights-empty">${inactive ? 'كل المشتركين حضروا خلال آخر 7 أيام.' : 'لا توجد زيارات مسجلة في هذه الفترة.'}</div>`;
                return;
            }
            target.innerHTML = rows.map((item) => {
                const secondary = inactive
                    ? (item.lastVisitDate ? `آخر حضور ${formatDate(item.lastVisitDate)}` : 'لم يسجل حضورًا')
                    : `آخر حضور ${formatDateTime(item.lastVisitAt)}`;
                const meta = inactive
                    ? (item.daysSinceLastVisit === null ? 'بحاجة إلى أول زيارة' : `منذ ${number(item.daysSinceLastVisit)} يوم`)
                    : `${number(item.visits)} زيارة`;
                return `<div class="attendance-member-row"><div class="attendance-member-copy"><strong>${escapeHtml(item.fullName || '—')}</strong><small>${escapeHtml(secondary)} · ${escapeHtml(item.phone || '—')}</small></div><span class="attendance-member-stat">${escapeHtml(meta)}</span></div>`;
            }).join('');
        };
        renderMembers('attendanceTopMembers', (attendance.topMembers || []).slice(0, 5));
        renderMembers('attendanceInactiveMembers', (attendance.inactiveMembers || []).slice(0, 5), true);
    }

    function renderAnalytics(data) {
        $('dashboardAnalyticsPeriod').textContent = periodText(data);
        renderSmartStrip(data);
        renderKpis(data);
        renderTrend(data);
        renderBars('analyticsStatusChart', data.distributions?.statuses, STATUS_LABELS, 'لا توجد حالات مسجلة.');
        const membershipItems = [...(data.distributions?.plans || []), ...(data.distributions?.types || [])];
        const membershipLabels = { ...PLAN_LABELS, ...TYPE_LABELS };
        renderBars('analyticsMembershipChart', membershipItems, membershipLabels);
        renderBars('analyticsPaymentChart', data.distributions?.paymentMethods, PAYMENT_LABELS);
        renderActivity(data);
        renderAttendanceInsights(data);
    }

    function hidePanel() {
        state.requestId += 1;
        state.abortController?.abort();
        state.abortController = null;
        const panel = $('dashboardAnalytics');
        if (panel) {
            panel.hidden = true;
            panel.setAttribute('aria-hidden', 'true');
            panel.toggleAttribute('inert', true);
        }
        const loading = $('dashboardAnalyticsLoading');
        if (loading) loading.hidden = true;
    }

    async function loadAnalytics(period = state.period) {
        if (!isDashboardActive() || !window.topGymAuth?.isOwner?.() || !window.topGymAuth?.hasPermission?.('finance.read')) {
            hidePanel();
            return;
        }
        const panel = ensurePanel();
        if (!panel) return;
        panel.hidden = false;
        panel.setAttribute('aria-hidden', 'false');
        panel.toggleAttribute('inert', false);
        state.period = ['week', 'month', 'year'].includes(period) ? period : 'month';
        setActivePeriod(state.period);
        const requestId = ++state.requestId;
        state.abortController?.abort();
        state.abortController = new AbortController();
        const controller = state.abortController;
        const loading = $('dashboardAnalyticsLoading');
        if (loading) loading.hidden = false;
        try {
            const response = await fetch(`/api/dashboard-analytics?period=${encodeURIComponent(state.period)}`, { cache: 'no-store', signal: controller.signal, headers: { Accept: 'application/json' } });
            const data = await response.json().catch(() => ({}));
            if (!response.ok) throw new Error(data.error || 'تعذر تحميل تحليلات لوحة التحكم.');
            if (requestId === state.requestId) renderAnalytics(data);
        } catch (error) {
            if (error.name === 'AbortError') return;
            if (requestId === state.requestId) {
                $('dashboardAnalyticsPeriod').textContent = error.message || 'تعذر تحميل التحليلات.';
                $('dashboardAnalyticsKpis').innerHTML = `<div class="analytics-error">${escapeHtml(error.message || 'تعذر تحميل التحليلات.')}</div>`;
            }
        } finally {
            if (requestId === state.requestId && loading) loading.hidden = true;
        }
    }

    function isDashboardActive() {
        const requestedTab = window.location.hash.slice(1) || 'dashboard';
        return requestedTab === 'dashboard' && document.querySelector('[data-page-tab="dashboard"]')?.classList.contains('active');
    }

    function initialize() {
        ensurePanel();
        window.addEventListener('topgym:tab-changed', (event) => {
            if (event.detail?.name === 'dashboard') {
                ensurePanel();
                loadAnalytics(state.period);
            } else {
                hidePanel();
            }
        });
        window.addEventListener('topgym:brandingchange', () => {
            const eyebrow = document.querySelector('.dashboard-analytics-eyebrow');
            if (eyebrow) eyebrow.textContent = `تحليلات ${brandName()}`;
        });
        window.addEventListener('hashchange', () => {
            if ((window.location.hash.slice(1) || 'dashboard') !== 'dashboard') hidePanel();
        });
        if (isDashboardActive()) loadAnalytics('month');
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initialize, { once: true });
    else initialize();

    window.topGymRefreshDashboardAnalytics = () => {
        if (isDashboardActive()) return loadAnalytics(state.period);
        hidePanel();
        return Promise.resolve();
    };
})();
