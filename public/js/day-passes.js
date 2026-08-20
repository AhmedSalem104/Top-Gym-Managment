(() => {
    if (window.__topGymDayPassesLoaded) return;
    window.__topGymDayPassesLoaded = true;

    const $ = (id) => document.getElementById(id);
    const state = { pricing: [], records: [], initialized: false, loading: false };

    function escapeHtml(value) {
        return String(value ?? '').replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[character]));
    }

    function todayIso() {
        const now = new Date();
        return new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
    }

    function money(value) {
        return `${Number(value || 0).toLocaleString('ar-EG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ج.م`;
    }

    function dateText(value) {
        if (!value) return '—';
        const date = new Date(`${String(value).slice(0, 10)}T00:00:00`);
        return Number.isNaN(date.getTime()) ? String(value) : new Intl.DateTimeFormat('ar-EG', { dateStyle: 'medium' }).format(date);
    }

    function paymentLabel(value) {
        return ({ cash: 'نقدي', card: 'بطاقة', transfer: 'تحويل', other: 'أخرى' })[value] || value || '—';
    }

    function normalizeSearch(value) {
        return String(value || '').trim().toLocaleLowerCase('ar-EG');
    }

    function notify(message, icon = 'success') {
        if (window.Swal) return window.Swal.fire({ toast: true, position: 'top-start', icon, title: message, showConfirmButton: false, timer: 3000, timerProgressBar: true, customClass: { popup: 'top-gym-alert top-gym-toast' } });
        if (window.showToast) return window.showToast(message, icon === 'error', icon);
        window.alert(message);
        return Promise.resolve();
    }

    async function request(path, options = {}) {
        return window.topGymApi.request(path, options);
    }

    function activePricing() {
        return state.pricing.filter((item) => item.active !== false).sort((a, b) => Number(a.sortOrder || 0) - Number(b.sortOrder || 0));
    }

    function renderPricingOptions() {
        const select = $('dayPassType');
        if (!select) return;
        const current = select.value;
        const entries = activePricing();
        select.innerHTML = entries.length
            ? entries.map((item) => `<option value="${escapeHtml(item.code)}">${escapeHtml(item.label)} — ${money(item.price)}</option>`).join('')
            : '<option value="">لا توجد أنواع حصص مفعلة</option>';
        if (entries.some((item) => item.code === current)) select.value = current;
        updatePricePreview();
    }

    function updatePricePreview() {
        const selected = state.pricing.find((item) => item.code === $('dayPassType')?.value);
        if ($('dayPassPrice')) $('dayPassPrice').textContent = selected ? money(selected.price) : '—';
    }

    function renderPricingEditor() {
        const host = $('dayPassPricingContainer');
        if (!host) return;
        const owner = window.topGymAuth?.isOwner?.() === true;
        const rows = state.pricing.map((item) => `<tr data-day-pass-price-code="${escapeHtml(item.code)}"><td><strong>${escapeHtml(item.label)}</strong><small>${escapeHtml(item.code)}</small></td><td><input data-day-pass-price type="number" min="0.01" step="0.01" value="${Number(item.price || 0).toFixed(2)}" ${owner ? '' : 'disabled'} aria-label="سعر ${escapeHtml(item.label)}"></td><td><span class="day-pass-type-status ${item.active === false ? 'inactive' : ''}">${item.active === false ? 'غير مفعل' : 'مفعل'}</span></td></tr>`).join('');
        host.innerHTML = rows
            ? `<table class="day-pass-pricing-table"><thead><tr><th>نوع الحصة</th><th>السعر</th><th>الحالة</th></tr></thead><tbody>${rows}</tbody></table>`
            : '<div class="empty">لا توجد أسعار حصص.</div>';
        const saveButton = $('dayPassPricingSave');
        if (saveButton) {
            saveButton.disabled = !owner;
            saveButton.title = owner ? '' : 'تعديل الأسعار متاح لمالك النظام فقط';
        }
    }

    async function loadPricing() {
        try {
            const response = await request('/api/day-passes/pricing');
            state.pricing = Array.isArray(response?.types) ? response.types : [];
            renderPricingOptions();
            renderPricingEditor();
        } catch (error) {
            if ($('dayPassType')) $('dayPassType').innerHTML = '<option value="">تعذر تحميل أسعار الحصص</option>';
            if ($('dayPassPricingContainer')) $('dayPassPricingContainer').innerHTML = `<div class="empty">${escapeHtml(error.message || 'تعذر تحميل الأسعار.')}</div>`;
        }
    }

    async function savePricing() {
        if (window.topGymAuth?.isOwner?.() !== true) return notify('تعديل أسعار الحصص متاح لمالك النظام فقط.', 'warning');
        const rows = [...document.querySelectorAll('[data-day-pass-price-code]')];
        const types = rows.map((row) => ({ code: row.dataset.dayPassPriceCode, price: Number(row.querySelector('[data-day-pass-price]')?.value || 0), label: state.pricing.find((item) => item.code === row.dataset.dayPassPriceCode)?.label, active: state.pricing.find((item) => item.code === row.dataset.dayPassPriceCode)?.active !== false, sortOrder: state.pricing.find((item) => item.code === row.dataset.dayPassPriceCode)?.sortOrder || 0 }));
        const button = $('dayPassPricingSave');
        if (button) button.disabled = true;
        try {
            const response = await request('/api/day-passes/pricing', { method: 'PUT', body: JSON.stringify({ types }) });
            state.pricing = response.types || state.pricing;
            renderPricingOptions();
            renderPricingEditor();
            await notify('تم حفظ أسعار الحصص اليومية.');
        } catch (error) {
            await notify(error.message || 'تعذر حفظ أسعار الحصص.', 'error');
        } finally {
            if (button) button.disabled = false;
        }
    }

    function buildWhatsappUrl(phone, message) {
        return `https://wa.me/${encodeURIComponent(phone)}?text=${encodeURIComponent(message)}`;
    }

    function openWhatsapp(sale, message, preparedWindow = null) {
        const phone = sale?.visitorPhoneNormalized || sale?.visitorPhone;
        if (!phone) return false;
        const url = buildWhatsappUrl(phone, message);
        let opened = preparedWindow && !preparedWindow.closed ? preparedWindow : null;
        if (opened) opened.location.href = url;
        else opened = window.open(url, 'topGymDayPassWhatsapp', 'popup=yes,width=480,height=760,resizable=yes,scrollbars=yes');
        if (opened) {
            opened.opener = null;
            void request(`/api/day-passes/${encodeURIComponent(sale.id)}/whatsapp-opened`, { method: 'POST' }).catch(() => {});
        }
        return Boolean(opened);
    }

    function renderList() {
        const host = $('dayPassTableWrap');
        if (!host) return;
        const query = normalizeSearch($('dayPassSearch')?.value);
        const records = state.records.filter((item) => !query || `${item.visitorName} ${item.visitorPhone} ${item.passTypeName}`.toLocaleLowerCase('ar-EG').includes(query));
        const owner = window.topGymAuth?.isOwner?.() === true;
        if ($('dayPassTodayCount')) $('dayPassTodayCount').textContent = `${state.records.length.toLocaleString('ar-EG')} حصة اليوم`;
        if ($('dayPassListMeta')) $('dayPassListMeta').textContent = records.length ? `${records.length.toLocaleString('ar-EG')} سجل مكتمل` : 'لا توجد حصص مسجلة اليوم.';
        if (!records.length) {
            host.innerHTML = '<div class="day-pass-empty">لا توجد حصص مطابقة حتى الآن.</div>';
            return;
        }
        host.innerHTML = `<table class="day-pass-table"><thead><tr><th>الزائر</th><th>نوع الحصة</th><th>المبلغ</th><th>طريقة الدفع</th><th>الوقت</th><th>الإجراءات</th></tr></thead><tbody>${records.map((item) => `<tr data-day-pass-id="${item.id}"><td><strong>${escapeHtml(item.visitorName)}</strong><small dir="ltr">${escapeHtml(item.visitorPhone)}</small></td><td><span class="day-pass-type-badge ${escapeHtml(item.passTypeCode)}">${escapeHtml(item.passTypeName)}</span></td><td class="day-pass-amount">${money(item.amountPaid)}</td><td>${escapeHtml(paymentLabel(item.paymentMethod))}</td><td dir="ltr">${new Intl.DateTimeFormat('ar-EG', { timeStyle: 'short' }).format(new Date(item.createdAt))}</td><td><div class="day-pass-actions"><button type="button" class="btn btn-light btn-small" data-day-pass-whatsapp="${item.id}" title="إرسال رسالة واتساب" aria-label="إرسال رسالة واتساب"><span aria-hidden="true">◉</span> واتساب</button>${owner ? `<button type="button" class="btn btn-light btn-small day-pass-void-button" data-day-pass-void="${item.id}" title="إلغاء الحصة" aria-label="إلغاء الحصة">إلغاء</button>` : ''}</div></td></tr>`).join('')}</tbody></table>`;
    }

    async function loadToday() {
        const date = $('dayPassDate')?.value || todayIso();
        const search = $('dayPassSearch')?.value || '';
        try {
            const response = await request(`/api/day-passes?${new URLSearchParams({ from: date, to: date, search, page: '1', pageSize: '100' })}`);
            state.records = response.records || [];
            renderList();
        } catch (error) {
            if ($('dayPassTableWrap')) $('dayPassTableWrap').innerHTML = `<div class="day-pass-empty">${escapeHtml(error.message || 'تعذر تحميل سجل الحصص.')}</div>`;
        }
    }

    async function submitDayPass(event) {
        event.preventDefault();
        const visitorPhone = $('dayPassVisitorPhone').value.trim();
        const shouldSend = Boolean($('dayPassSendWhatsApp')?.checked);
        const preparedWindow = shouldSend ? window.topGymWhatsapp?.prepareWindow(visitorPhone) : null;
        const button = $('dayPassSaveButton');
        if (button) button.disabled = true;
        try {
            const result = await request('/api/day-passes', {
                method: 'POST',
                body: JSON.stringify({
                    visitorName: $('dayPassVisitorName').value,
                    visitorPhone,
                    passTypeCode: $('dayPassType').value,
                    paymentMethod: $('dayPassPaymentMethod').value,
                    visitDate: todayIso()
                })
            });
            if (shouldSend) openWhatsapp(result.sale, result.whatsapp?.message || '', preparedWindow);
            else if (preparedWindow && !preparedWindow.closed) preparedWindow.close();
            $('dayPassForm').reset();
            renderPricingOptions();
            await loadToday();
            await notify(shouldSend ? 'تم حفظ الحصة وتجهيز رسالة واتساب.' : 'تم حفظ الحصة وإضافتها للإيرادات.');
            window.dispatchEvent(new CustomEvent('topgym:day-pass-created', { detail: result }));
            window.topGymRefreshMonthlyFinance?.();
        } catch (error) {
            if (preparedWindow && !preparedWindow.closed) preparedWindow.close();
            await notify(error.message || 'تعذر حفظ الحصة.', 'error');
        } finally {
            if (button) button.disabled = false;
        }
    }

    async function voidDayPass(id) {
        if (!window.confirm('هل تريد إلغاء هذه الحصة؟ سيتم استبعادها من التقارير والإيرادات.')) return;
        try {
            await request(`/api/day-passes/${encodeURIComponent(id)}/void`, { method: 'POST' });
            await loadToday();
            await notify('تم إلغاء الحصة.');
        } catch (error) {
            await notify(error.message || 'تعذر إلغاء الحصة.', 'error');
        }
    }

    function whatsappForRecord(id) {
        const sale = state.records.find((item) => String(item.id) === String(id));
        if (!sale) return;
        const message = `أهلًا ${sale.visitorName} 👋\n\nشكرًا لحضورك اليوم في TOP GYM، نورتنا جدًا 💙\n\nنوع الحصة: ${sale.passTypeName}\nنتمنى نشوفك دائمًا 💪`;
        openWhatsapp(sale, message);
    }

    function pricingDialogOpened() {
        window.setTimeout(() => { void loadPricing(); }, 0);
    }

    function isAuthenticated() {
        return Boolean(window.topGymAuth?.getUser?.() || window.topGymAuth?.currentUser?.());
    }

    function initialize() {
        if (state.initialized) return;
        state.initialized = true;
        $('dayPassForm')?.addEventListener('submit', submitDayPass);
        $('dayPassType')?.addEventListener('change', updatePricePreview);
        $('dayPassRefreshButton')?.addEventListener('click', loadToday);
        $('dayPassSearch')?.addEventListener('input', () => { window.clearTimeout(state.searchTimer); state.searchTimer = window.setTimeout(loadToday, 250); });
        $('dayPassTableWrap')?.addEventListener('click', (event) => {
            const whatsappButton = event.target.closest('[data-day-pass-whatsapp]');
            if (whatsappButton) return whatsappForRecord(whatsappButton.dataset.dayPassWhatsapp);
            const voidButton = event.target.closest('[data-day-pass-void]');
            if (voidButton) return voidDayPass(voidButton.dataset.dayPassVoid);
        });
        $('dayPassPricingSave')?.addEventListener('click', savePricing);
        document.addEventListener('click', (event) => {
            if (event.target.closest('#pricingButton, #topPricingButton')) pricingDialogOpened();
        }, true);
        const pricingDialog = $('pricingDialog');
        if (pricingDialog) new MutationObserver(() => { if (pricingDialog.hasAttribute('open')) pricingDialogOpened(); }).observe(pricingDialog, { attributes: true, attributeFilter: ['open'] });
        const loadAfterAuth = () => {
            if (!isAuthenticated()) return;
            void loadPricing();
            if (!$('attendanceSection')?.hidden) void loadToday();
        };
        if (window.topGymAuthReady) window.topGymAuthReady.then(loadAfterAuth).catch(() => {});
        else loadAfterAuth();
        document.addEventListener('topgym:tab-changed', (event) => {
            if (event.detail?.name === 'attendance' && isAuthenticated()) {
                void loadPricing();
                void loadToday();
            }
        });
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initialize, { once: true });
    else initialize();

    window.topGymDayPasses = Object.freeze({ loadPricing, loadToday });
})();
