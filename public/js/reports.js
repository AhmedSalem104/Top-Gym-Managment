(() => {
    if (window.__topGymReportsLoaded) return;
    window.__topGymReportsLoaded = true;

    const state = { data: null, requestId: 0 };
    const PLAN_LABELS = { gym_only: 'جيم فقط', gym_cardio: 'جيم وكارديو' };
    const TYPE_LABELS = { monthly: 'شهرية', half_month: 'نصف شهر', quarterly: 'ربع سنوية', semiannual: 'نصف سنوية', annual: 'سنوية', 'two month': 'شهرين', custom_mslzyl8m: 'شهرين' };
    const PAYMENT_LABELS = { cash: 'نقدي', card: 'بطاقة', transfer: 'تحويل', other: 'أخرى' };
    const STATUS_LABELS = { active: 'نشطة', expiring_soon: 'قريبة الانتهاء', expired: 'منتهية', frozen: 'مجمدة' };

    function $(id) { return document.getElementById(id); }
    function escapeHtml(value) { return String(value ?? '').replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[character])); }
    function number(value) { return Number(value || 0).toLocaleString('ar-EG'); }
    function money(value) { return `${Number(value || 0).toLocaleString('ar-EG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ج.م`; }
    function dateOnly(value) { return new Intl.DateTimeFormat('ar-EG', { dateStyle: 'medium' }).format(new Date(`${String(value).slice(0, 10)}T00:00:00Z`)); }
    function todayIso() { const date = new Date(); return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 10); }
    function monthStart() { return `${todayIso().slice(0, 7)}-01`; }
    function label(map, key) { return map[key] || key || '—'; }

    function ensurePanel() {
        const panel = $('reportsSection');
        if (!panel || panel.dataset.ready === 'true') return panel;
        panel.dataset.ready = 'true';
        panel.innerHTML = `<div class="reports-header"><div class="reports-heading"><span class="reports-icon" aria-hidden="true"><svg class="ui-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19V5"/><path d="M4 19h16"/><path d="m7 15 3-4 3 2 5-6"/></svg></span><div><span class="reports-eyebrow">مركز التقارير</span><h2 id="reportsTitle">تقارير تشغيلية ومالية</h2><p id="reportsPeriod">اختر فترة لعرض ملخص قابل للمتابعة والتصدير.</p></div></div><div class="reports-actions"><button class="btn btn-light btn-small" id="reportsExportButton" type="button">تصدير CSV</button><button class="btn btn-primary btn-small" id="reportsRefreshButton" type="button">تحديث التقرير</button></div></div>
            <form class="reports-filters" id="reportsForm"><label><span>من تاريخ</span><input id="reportsFrom" type="date" required></label><label><span>إلى تاريخ</span><input id="reportsTo" type="date" required></label><button class="btn btn-primary" type="submit">عرض التقرير</button></form>
            <div class="reports-kpis" id="reportsKpis"><div class="loading">جاري تحميل التقرير…</div></div>
            <div class="reports-grid"><section class="report-card"><div class="report-card-head"><div><span>التحليل الزمني</span><h3>الحركة اليومية</h3></div></div><div class="reports-timeline-wrap" id="reportsTimeline"></div></section><section class="report-card"><div class="report-card-head"><div><span>التوزيع</span><h3>الباقات وطرق الدفع</h3></div></div><div class="reports-breakdown" id="reportsBreakdown"></div></section></div>
            <section class="report-card reports-members-card"><div class="report-card-head"><div><span>تفاصيل الفترة</span><h3>المشتركون المسجلون</h3></div><span class="reports-members-count" id="reportsMembersCount">—</span></div><div class="reports-table-wrap" id="reportsMembers"></div></section>`;
        $('reportsFrom').value = monthStart();
        $('reportsTo').value = todayIso();
        $('reportsForm').addEventListener('submit', (event) => { event.preventDefault(); loadReport(); });
        $('reportsRefreshButton').addEventListener('click', loadReport);
        $('reportsExportButton').addEventListener('click', exportCsv);
        return panel;
    }

    function renderKpis(data) {
        const summary = data.summary || {};
        const items = [
            ['المشتركون الجدد', number(summary.newMembers), 'خلال الفترة', 'blue'],
            ['الاشتراكات الجديدة', number(summary.newMemberships), 'اشتراك مسجل', 'indigo'],
            ['التحصيل', money(summary.collected), `${number(summary.paidTransactions)} دفعة`, 'green'],
            ['المصروفات', money(summary.expenses), 'خلال الفترة', 'amber'],
            ['صافي الفترة', money(summary.net), summary.net < 0 ? 'يحتاج مراجعة' : 'الصافي موجب', summary.net < 0 ? 'red' : 'teal'],
            ['المبالغ المتبقية', money(summary.outstanding), `${number(summary.outstandingCount)} اشتراك`, 'rose']
        ];
        $('reportsKpis').innerHTML = items.map(([title, value, meta, tone]) => `<article class="report-kpi ${tone}"><span>${title}</span><strong>${value}</strong><small>${meta}</small></article>`).join('');
        $('reportsPeriod').textContent = `${dateOnly(data.period.from)} — ${dateOnly(data.period.to)} · ${number(summary.currentMembers)} عضو حالي`;
    }

    function renderTimeline(data) {
        const rows = data.timeline || [];
        if (!rows.length) { $('reportsTimeline').innerHTML = '<div class="empty">لا توجد بيانات في الفترة.</div>'; return; }
        const max = Math.max(1, ...rows.map((item) => Math.max(Number(item.collected || 0), Number(item.expenses || 0))));
        $('reportsTimeline').innerHTML = `<div class="reports-mini-chart">${rows.map((row) => { const collectedHeight = Math.max(row.collected ? 6 : 2, (Number(row.collected || 0) / max) * 100); const expenseHeight = Math.max(row.expenses ? 6 : 2, (Number(row.expenses || 0) / max) * 100); return `<div class="reports-day"><div class="reports-day-bars"><span class="collected" style="height:${collectedHeight.toFixed(2)}%" title="تحصيل ${money(row.collected)}"></span><span class="expenses" style="height:${expenseHeight.toFixed(2)}%" title="مصروفات ${money(row.expenses)}"></span></div><small>${escapeHtml(dateOnly(row.date).replace(/\s*٢٠٢٦|\s*٢٠٢٥|\s*٢٠٢٤/g, ''))}</small><b>${number(Number(row.newMembers || 0) + Number(row.newMemberships || 0))}</b></div>`; }).join('')}</div><div class="reports-chart-legend"><span><i class="collected"></i>التحصيل</span><span><i class="expenses"></i>المصروفات</span><span>الرقم = أعضاء واشتراكات جديدة</span></div>`;
    }

    function renderBreakdown(data) {
        const breakdown = data.breakdown || {};
        const planRows = (breakdown.plans || []).map((item) => `<div class="breakdown-row"><span>${escapeHtml(label(PLAN_LABELS, item.key))}</span><strong>${number(item.value)}</strong></div>`).join('');
        const paymentRows = (breakdown.paymentMethods || []).map((item) => `<div class="breakdown-row"><span>${escapeHtml(label(PAYMENT_LABELS, item.key))}</span><strong>${money(item.amount)} <small>(${number(item.count)})</small></strong></div>`).join('');
        const statusRows = (breakdown.statuses || []).map((item) => `<div class="breakdown-row"><span>${escapeHtml(label(STATUS_LABELS, item.key))}</span><strong>${number(item.value)}</strong></div>`).join('');
        $('reportsBreakdown').innerHTML = `<div class="breakdown-group"><h4>الباقات</h4>${planRows || '<span class="reports-empty">لا توجد بيانات.</span>'}</div><div class="breakdown-group"><h4>طرق الدفع</h4>${paymentRows || '<span class="reports-empty">لا توجد مدفوعات.</span>'}</div><div class="breakdown-group"><h4>الحالات الحالية</h4>${statusRows || '<span class="reports-empty">لا توجد بيانات.</span>'}</div>`;
    }

    function renderMembers(data) {
        const members = data.members || [];
        $('reportsMembersCount').textContent = `${number(members.length)} مشترك`;
        if (!members.length) { $('reportsMembers').innerHTML = '<div class="empty">لا يوجد مشتركون مسجلون في الفترة المحددة.</div>'; return; }
        $('reportsMembers').innerHTML = `<table class="reports-table"><thead><tr><th>المشترك</th><th>التسجيل</th><th>الاشتراك</th><th>الحساب</th><th>المتبقي</th></tr></thead><tbody>${members.map((member) => `<tr><td><strong>${escapeHtml(member.fullName)}</strong><small>${escapeHtml(member.phone)}</small></td><td>${dateOnly(member.registrationDate)}</td><td>${escapeHtml(label(PLAN_LABELS, member.plan))}<small>${escapeHtml(label(TYPE_LABELS, member.type))}</small></td><td>${money(member.amountDue)}<small>مدفوع ${money(member.amountPaid)}</small></td><td class="${Number(member.amountRemaining) > 0 ? 'has-debt' : 'paid'}">${money(member.amountRemaining)}</td></tr>`).join('')}</tbody></table>`;
    }

    function render(data) { state.data = data; renderKpis(data); renderTimeline(data); renderBreakdown(data); renderMembers(data); }

    async function loadReport() {
        const panel = ensurePanel();
        if (!panel || !window.topGymAuth?.user) return;
        const from = $('reportsFrom').value;
        const to = $('reportsTo').value;
        const requestId = ++state.requestId;
        $('reportsKpis').innerHTML = '<div class="loading">جاري تحديث التقرير…</div>';
        try {
            const data = await window.topGymAuth.request(`/api/reports?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`);
            if (requestId === state.requestId) render(data);
        } catch (error) { $('reportsKpis').innerHTML = `<div class="analytics-error">${escapeHtml(error.message)}</div>`; }
    }

    function csvCell(value) { return `"${String(value ?? '').replace(/"/g, '""')}"`; }
    function exportCsv() {
        if (!state.data) return;
        const rows = [['المشترك', 'الهاتف', 'التسجيل', 'الباقة', 'النوع', 'المستحق', 'المدفوع', 'المتبقي']];
        (state.data.members || []).forEach((member) => rows.push([member.fullName, member.phone, member.registrationDate, label(PLAN_LABELS, member.plan), label(TYPE_LABELS, member.type), member.amountDue, member.amountPaid, member.amountRemaining]));
        const csv = '\uFEFF' + rows.map((row) => row.map(csvCell).join(',')).join('\r\n');
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `top-gym-report-${state.data.period.from}-${state.data.period.to}.csv`;
        link.click();
        URL.revokeObjectURL(link.href);
    }

    document.addEventListener('DOMContentLoaded', ensurePanel);
    window.addEventListener('topgym:auth-ready', () => { if (window.location.hash === '#reports') loadReport(); });
    window.addEventListener('topgym:tab-changed', (event) => { if (event.detail?.name === 'reports') loadReport(); });
})();
