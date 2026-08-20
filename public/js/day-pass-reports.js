(() => {
    if (window.__topGymDayPassReportsLoaded) return;
    window.__topGymDayPassReportsLoaded = true;

    const $ = (id) => document.getElementById(id);
    let requestKey = '';
    let requestPromise = null;

    function escapeHtml(value) { return String(value ?? '').replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[character])); }
    function money(value) { return `${Number(value || 0).toLocaleString('ar-EG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ج.م`; }
    function dateText(value) { const raw = String(value || '').slice(0, 10); const date = new Date(`${raw}T00:00:00`); return Number.isNaN(date.getTime()) ? raw || '—' : new Intl.DateTimeFormat('ar-EG', { dateStyle: 'medium' }).format(date); }
    function paymentLabel(value) { return ({ cash: 'نقدي', card: 'بطاقة', transfer: 'تحويل', other: 'أخرى' })[value] || value || '—'; }
    function currentKey() { return `${$('reportsFrom')?.value || ''}|${$('reportsTo')?.value || ''}|${$('reportsFinanceType')?.value || ''}|${$('reportsPaymentMethod')?.value || ''}|${$('reportsLocalSearch')?.value || ''}`; }
    function isFinanceView() { return (document.documentElement.dataset.topGymActiveTab || location.hash.slice(1)) === 'reports' && Boolean($('reportsFinanceView')) && !$('reportsFinanceView').hidden && $('reportsFinanceType'); }

    function ensureFilterOption() {
        const select = $('reportsFinanceType');
        if (!select || select.querySelector('option[value="day_passes"]')) return;
        const option = document.createElement('option');
        option.value = 'day_passes';
        option.textContent = 'الحصص اليومية';
        select.appendChild(option);
    }

    function filterRows(rows) {
        const method = $('reportsPaymentMethod')?.value || '';
        const query = String($('reportsLocalSearch')?.value || '').trim().toLocaleLowerCase('ar-EG');
        return rows.filter((item) => (!method || item.paymentMethod === method) && (!query || `${item.visitorName} ${item.visitorPhone} ${item.passTypeName}`.toLocaleLowerCase('ar-EG').includes(query)));
    }

    async function load() {
        if (!isFinanceView()) return;
        ensureFilterOption();
        const view = $('reportsFinanceView');
        const mode = $('reportsFinanceType').value;
        view.querySelector('#dayPassReportCard')?.remove();
        view.querySelector('#dayPassReportSummary')?.remove();
        view.querySelectorAll('.reports-detail-grid > .report-card').forEach((card) => { card.hidden = mode === 'day_passes'; });
        if (!['all', 'day_passes'].includes(mode)) return;
        const from = $('reportsFrom').value;
        const to = $('reportsTo').value;
        const key = `${from}|${to}|${mode}|${$('reportsPaymentMethod').value}|${$('reportsLocalSearch').value}`;
        if (requestKey === key && requestPromise) return requestPromise;
        requestKey = key;
        requestPromise = Promise.all([
            window.topGymApi.request(`/api/day-passes?${new URLSearchParams({ from, to, page: '1', pageSize: '100' })}`),
            window.topGymApi.request(`/api/day-passes/summary?${new URLSearchParams({ from, to })}`)
        ]).then(([list, summary]) => {
            if (!isFinanceView() || requestKey !== key) return;
            const rows = filterRows(list.records || []);
            const summaryCard = document.createElement('div');
            summaryCard.id = 'dayPassReportSummary';
            summaryCard.className = 'day-pass-report-summary';
            summaryCard.innerHTML = `<article><span>عدد الحصص اليومية</span><strong>${Number(summary.count || 0).toLocaleString('ar-EG')}</strong></article><article><span>إيرادات الحصص اليومية</span><strong>${money(summary.amount)}</strong></article>`;
            view.insertBefore(summaryCard, view.firstChild);
            const card = document.createElement('section');
            card.id = 'dayPassReportCard';
            card.className = 'report-card finance-detail-card day-pass-report-card';
            const body = rows.length ? `<table class="reports-table day-pass-report-table"><thead><tr><th>الزائر</th><th>نوع الحصة</th><th>التاريخ</th><th>طريقة الدفع</th><th>المبلغ</th><th>واتساب</th></tr></thead><tbody>${rows.map((item) => `<tr><td><strong>${escapeHtml(item.visitorName)}</strong><small dir="ltr">${escapeHtml(item.visitorPhone)}</small></td><td>${escapeHtml(item.passTypeName)}</td><td>${dateText(item.visitDate)}</td><td>${escapeHtml(paymentLabel(item.paymentMethod))}</td><td class="paid">${money(item.amountPaid)}</td><td><button type="button" class="alert-whatsapp-button reports-whatsapp-button" data-day-pass-report-whatsapp="${item.id}" data-phone="${escapeHtml(item.visitorPhoneNormalized || item.visitorPhone)}" data-name="${escapeHtml(item.visitorName)}" data-type="${escapeHtml(item.passTypeName)}" title="إرسال رسالة واتساب" aria-label="إرسال رسالة واتساب">◉</button></td></tr>`).join('')}</tbody></table>` : '<div class="reports-empty-state">لا توجد حصص يومية مطابقة للفلاتر.</div>';
            card.innerHTML = `<div class="report-card-head"><div><span>إيراد مستقل</span><h3>سجل الحصص اليومية</h3></div><span class="reports-members-count">${rows.length.toLocaleString('ar-EG')} نتيجة</span></div><div class="reports-table-wrap">${body}</div>`;
            const grid = view.querySelector('.reports-detail-grid');
            if (grid) grid.appendChild(card);
            else view.appendChild(card);
        }).catch(() => {}).finally(() => { requestPromise = null; });
        return requestPromise;
    }

    function openWhatsapp(button) {
        const phone = button.dataset.phone;
        const message = `أهلًا ${button.dataset.name} 👋\n\nشكرًا لحضورك اليوم في TOP GYM، نورتنا جدًا 💙\n\nنوع الحصة: ${button.dataset.type}\nنتمنى نشوفك دائمًا 💪`;
        const opened = window.open(`https://wa.me/${encodeURIComponent(phone)}?text=${encodeURIComponent(message)}`, 'topGymDayPassWhatsapp', 'popup=yes,width=480,height=760,resizable=yes,scrollbars=yes');
        if (opened) void window.topGymApi.request(`/api/day-passes/${encodeURIComponent(button.dataset.dayPassReportWhatsapp)}/whatsapp-opened`, { method: 'POST' }).catch(() => {});
    }

    function sync() {
        if (!isFinanceView()) return;
        ensureFilterOption();
        const key = currentKey();
        if (key !== requestKey || !$('dayPassReportCard')) void load();
    }

    document.addEventListener('click', (event) => {
        const button = event.target.closest('[data-day-pass-report-whatsapp]');
        if (button) openWhatsapp(button);
    });
    document.addEventListener('topgym:tab-changed', (event) => { if (event.detail?.name === 'reports') window.setTimeout(sync, 80); });
    document.addEventListener('DOMContentLoaded', () => {
        const observer = new MutationObserver(() => window.setTimeout(sync, 0));
        const extra = $('reportsExtraFilters');
        const view = $('reportsFinanceView');
        const section = $('reportsSection');
        if (extra) observer.observe(extra, { childList: true, subtree: true });
        if (view) observer.observe(view, { childList: true, subtree: true });
        if (section) observer.observe(section, { childList: true, subtree: true });
        document.addEventListener('change', (event) => { if (event.target.closest('#reportsForm')) window.setTimeout(sync, 30); });
        document.addEventListener('input', (event) => { if (event.target.id === 'reportsLocalSearch') window.setTimeout(sync, 80); });
        window.setTimeout(sync, 200);
    }, { once: true });
})();
