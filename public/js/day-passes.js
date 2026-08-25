(() => {
    if (window.__topGymDayPassesLoaded) return;
    window.__topGymDayPassesLoaded = true;

    const $ = (id) => document.getElementById(id);
    const state = { pricing: [], records: [], dashboardRecords: [], initialized: false, loading: false, editingId: null, searchTimer: null };

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

    async function confirmDeleteRecord(sale) {
        if (!window.Swal && window.topGymLoadExternalAsset) {
            await window.topGymLoadExternalAsset('sweetalert').catch(() => null);
        }
        if (!window.Swal) return window.confirm(`هل تريد حذف سجل ${recordDisplayName(sale)}؟ لا يمكن التراجع عن هذا الإجراء.`);
        const result = await window.Swal.fire({
            position: 'center',
            backdrop: window.topGymThemeValue?.('--overlay') || 'rgba(2, 6, 23, .75)',
            icon: 'warning',
            title: 'تأكيد حذف الحصة',
            text: `هل تريد حذف سجل ${recordDisplayName(sale)}؟ لا يمكن التراجع عن هذا الإجراء.`,
            showCancelButton: true,
            confirmButtonText: 'نعم، احذف الحصة',
            cancelButtonText: 'إلغاء',
            buttonsStyling: false,
            customClass: {
                popup: 'delete-confirm-alert',
                confirmButton: 'btn btn-danger',
                cancelButton: 'btn btn-light'
            }
        });
        return result.isConfirmed;
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

    function getRecord(id) {
        return [...state.records, ...state.dashboardRecords].find((item) => String(item.id) === String(id)) || null;
    }

    function closeDayPassDialog() {
        const dialog = $('dayPassDialog');
        if (dialog?.close && dialog.open) dialog.close();
        else dialog?.removeAttribute('open');
    }

    function arrangeDashboardSections() {
        const overview = document.querySelector('.overview-grid');
        const alerts = $('alertsSection');
        const dayPassCard = $('dashboardDayPassCard');
        const financeCard = $('monthlyFinanceCard');
        if (!overview || !dayPassCard || dayPassCard.parentElement !== overview) return;
        const stats = overview.querySelector(':scope > .stats-grid');
        const firstContentAfterStats = stats?.nextElementSibling || alerts || null;
        if (dayPassCard !== firstContentAfterStats) overview.insertBefore(dayPassCard, firstContentAfterStats);
        if (alerts && alerts.parentElement === overview && alerts !== dayPassCard.nextElementSibling) {
            overview.insertBefore(alerts, dayPassCard.nextElementSibling || null);
        }
        if (financeCard && financeCard.parentElement === overview && alerts && alerts.parentElement === overview) {
            overview.insertBefore(financeCard, alerts.nextElementSibling || null);
        }
    }

    function prepareDayPassDialog() {
        const dialog = $('dayPassDialog');
        const panel = $('dayPassPanel');
        if (!dialog || !panel) return dialog;
        if (panel.parentElement !== dialog) dialog.appendChild(panel);
        if (!dialog.dataset.dayPassReady) {
            const head = panel.querySelector('.day-pass-head');
            const badge = $('dayPassTodayCount');
            if (head && badge) {
                const actions = document.createElement('div');
                actions.className = 'day-pass-dialog-head-actions';
                const closeButton = document.createElement('button');
                closeButton.type = 'button';
                closeButton.className = 'btn btn-light btn-small';
                closeButton.dataset.dayPassDialogClose = 'true';
                closeButton.setAttribute('aria-label', 'إغلاق نافذة الحصص اليومية');
                closeButton.textContent = 'إغلاق';
                actions.append(badge, closeButton);
                head.append(actions);
            }
            dialog.addEventListener('cancel', (event) => {
                event.preventDefault();
                closeDayPassDialog();
            });
            dialog.addEventListener('close', () => resetEditForm());
            dialog.dataset.dayPassReady = 'true';
        }
        return dialog;
    }

    function showDayPassDialog({ reset = true } = {}) {
        const dialog = prepareDayPassDialog();
        if (!dialog) return;
        if (reset) resetEditForm();
        if (typeof dialog.showModal === 'function' && !dialog.open) dialog.showModal();
        else dialog.setAttribute('open', '');
        void loadPricing();
        void loadToday();
        window.setTimeout(() => $('dayPassVisitorName')?.focus(), 120);
    }

    function recordDisplayName(item) {
        return String(item?.visitorName || '').trim() || 'زائر';
    }

    function recordPhone(item) {
        return String(item?.visitorPhoneNormalized || item?.visitorPhone || '').trim();
    }

    function renderRecordActions(item, { compact = true } = {}) {
        const owner = window.topGymAuth?.isOwner?.() === true;
        const phone = recordPhone(item);
        const permissionByAction = { whatsapp: 'day_passes.whatsapp', edit: 'day_passes.update', delete: 'day_passes.delete', void: 'day_passes.delete' };
        const iconButton = (action, label, icon, extra = '') => `<button type="button" class="btn btn-light btn-small day-pass-action-button ${compact ? 'is-compact' : ''} ${extra}" data-day-pass-${action}="${item.id}" data-required-permission="${permissionByAction[action] || 'day_passes.read'}" title="${label}" aria-label="${label}">${icon}${compact ? '' : `<span>${label}</span>`}</button>`;
        const whatsapp = phone
            ? iconButton('whatsapp', 'واتساب', '<svg class="ui-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 11.5a8 8 0 0 1-11.9 7L4 20l1.5-4.1A8 8 0 1 1 20 11.5Z"/><path d="M8.5 9.5c.3 1.5 1.5 2.7 3 3l1-.8c.2-.2.5-.2.7-.1l1.3.6c.3.1.4.5.3.8-.3.8-1 1.2-1.8 1.1-3.3-.5-5.3-2.5-5.8-5.8-.1-.8.3-1.5 1.1-1.8.3-.1.7 0 .8.3l.6 1.3c.1.2.1.5-.1.7Z"/></svg>')
            : `<span class="day-pass-no-phone">بدون رقم</span>`;
        const ownerActions = owner
            ? `${iconButton('edit', 'تعديل', '<svg class="ui-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4Z"/></svg>')} ${iconButton('delete', 'حذف', '<svg class="ui-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/></svg>', 'day-pass-delete-button')}`
            : '';
        return `<div class="day-pass-actions">${whatsapp}${ownerActions}${owner && !compact ? iconButton('void', 'إلغاء', '<svg class="ui-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="m9 9 6 6m0-6-6 6"/></svg>', 'day-pass-void-button') : ''}</div>`;
    }

    function renderList() {
        const host = $('dayPassTableWrap');
        if (!host) return;
        const query = normalizeSearch($('dayPassSearch')?.value);
        const records = state.records.filter((item) => !query || `${item.reference} ${recordDisplayName(item)} ${item.visitorPhone} ${item.passTypeName}`.toLocaleLowerCase('ar-EG').includes(query));
        if ($('dayPassTodayCount')) $('dayPassTodayCount').textContent = `${state.records.length.toLocaleString('ar-EG')} حصة اليوم`;
        if ($('dayPassListMeta')) $('dayPassListMeta').textContent = records.length ? `${records.length.toLocaleString('ar-EG')} سجل مكتمل` : 'لا توجد حصص مسجلة اليوم.';
        if (!records.length) {
            host.innerHTML = '<div class="day-pass-empty">لا توجد حصص مطابقة حتى الآن.</div>';
            return;
        }
        host.innerHTML = `<table class="day-pass-table"><thead><tr><th>الزائر</th><th>نوع الحصة</th><th>المبلغ</th><th>طريقة الدفع</th><th>الوقت</th><th>الإجراءات</th></tr></thead><tbody>${records.map((item) => `<tr data-day-pass-id="${item.id}"><td><strong>${escapeHtml(recordDisplayName(item))}</strong><small class="day-pass-reference" dir="ltr">${escapeHtml(item.reference || `VIS-${String(item.id).padStart(6, '0')}`)}</small><small dir="ltr">${escapeHtml(recordPhone(item) || 'بدون رقم')}</small></td><td><span class="day-pass-type-badge ${escapeHtml(item.passTypeCode)}">${escapeHtml(item.passTypeName)}</span></td><td class="day-pass-amount">${money(item.amountPaid)}</td><td>${escapeHtml(paymentLabel(item.paymentMethod))}</td><td dir="ltr">${new Intl.DateTimeFormat('ar-EG', { timeStyle: 'short' }).format(new Date(item.createdAt))}</td><td>${renderRecordActions(item)}</td></tr>`).join('')}</tbody></table>`;
    }

    function monthRange() {
        const today = todayIso();
        return { from: `${today.slice(0, 7)}-01`, to: today };
    }

    function renderDashboardList() {
        const host = $('dashboardDayPassTableWrap');
        if (!host) return;
        if (!state.dashboardRecords.length) {
            host.innerHTML = '<div class="day-pass-empty">لا توجد حصص مسجلة هذا الشهر.</div>';
            return;
        }
        host.innerHTML = `<table class="dashboard-day-pass-table"><thead><tr><th>الزائر</th><th>نوع الحصة</th><th>التاريخ</th><th>المبلغ</th><th>الإجراءات</th></tr></thead><tbody>${state.dashboardRecords.map((item) => `<tr data-day-pass-id="${item.id}"><td><strong>${escapeHtml(recordDisplayName(item))}</strong><small dir="ltr">${escapeHtml(item.reference || '')} · ${escapeHtml(recordPhone(item) || 'بدون رقم')}</small></td><td><span class="day-pass-type-badge ${escapeHtml(item.passTypeCode)}">${escapeHtml(item.passTypeName)}</span></td><td dir="ltr">${escapeHtml(dateText(item.visitDate))}</td><td class="day-pass-amount">${money(item.amountPaid)}</td><td>${renderRecordActions(item, { compact: true })}</td></tr>`).join('')}</tbody></table>`;
    }

    function yieldToBrowser() {
        return new Promise((resolve) => {
            if (typeof window.requestIdleCallback === 'function') window.requestIdleCallback(() => resolve(), { timeout: 120 });
            else window.setTimeout(resolve, 0);
        });
    }

    async function loadDashboard() {
        const host = $('dashboardDayPassTableWrap');
        if (!host || !isAuthenticated()) return false;
        const { from, to } = monthRange();
        try {
            const pageSize = 100;
            const params = new URLSearchParams({ from, to, page: '1', pageSize: String(pageSize) });
            const [list, summary] = await Promise.all([
                request(`/api/day-passes?${params}`),
                request(`/api/day-passes/summary?${new URLSearchParams({ from, to })}`)
            ]);
            let dashboardRecords = Array.isArray(list?.records) ? list.records : [];
            const totalRecords = Number(list?.pagination?.total || dashboardRecords.length);
            const totalPages = Math.ceil(totalRecords / pageSize);
            state.dashboardRecords = dashboardRecords;
            if ($('dashboardDayPassCount')) $('dashboardDayPassCount').textContent = Number(summary?.count || 0).toLocaleString('ar-EG');
            if ($('dashboardDayPassTotal')) $('dashboardDayPassTotal').textContent = money(summary?.amount || 0);
            if ($('dashboardDayPassMonthMeta')) $('dashboardDayPassMonthMeta').textContent = `ملخص ${new Intl.DateTimeFormat('ar-EG', { month: 'long', year: 'numeric' }).format(new Date(`${from}T00:00:00`))}`;
            renderDashboardList();

            if (totalPages > 1) {
                const releaseProgress = window.topGymPerformance?.startTask?.('جاري استكمال سجل الحصص…');
                try {
                    const chunkSize = 2;
                    for (let firstPage = 2; firstPage <= totalPages; firstPage += chunkSize) {
                        const pages = await Promise.all(
                            Array.from({ length: Math.min(chunkSize, totalPages - firstPage + 1) }, (_, index) => {
                                const page = firstPage + index;
                                const pageParams = new URLSearchParams({ from, to, page: String(page), pageSize: String(pageSize) });
                                return request(`/api/day-passes?${pageParams}`);
                            })
                        );
                        const nextRecords = pages.flatMap((page) => Array.isArray(page?.records) ? page.records : []);
                        if (nextRecords.length) {
                            state.dashboardRecords.push(...nextRecords);
                            renderDashboardList();
                        }
                        await yieldToBrowser();
                    }
                } catch (error) {
                    console.warn('[TOP GYM] Remaining day-pass pages failed to load.', error);
                } finally {
                    releaseProgress?.();
                }
            }
            return true;
        } catch (error) {
            host.innerHTML = `<div class="day-pass-empty">${escapeHtml(error.message || 'تعذر تحميل سجل الحصص.')}</div>`;
            return false;
        }
    }

    async function loadToday() {
        const date = $('dayPassDate')?.value || todayIso();
        const search = $('dayPassSearch')?.value || '';
        try {
            const response = await request(`/api/day-passes?${new URLSearchParams({ from: date, to: date, search, page: '1', pageSize: '100' })}`);
            state.records = response.records || [];
            renderList();
            return true;
        } catch (error) {
            if ($('dayPassTableWrap')) $('dayPassTableWrap').innerHTML = `<div class="day-pass-empty">${escapeHtml(error.message || 'تعذر تحميل سجل الحصص.')}</div>`;
            return false;
        }
    }

    function openForm() {
        showDayPassDialog();
    }

    function resetEditForm() {
        state.editingId = null;
        $('dayPassForm')?.reset();
        renderPricingOptions();
        if ($('dayPassSaveButton')) $('dayPassSaveButton').textContent = 'حفظ الحصة';
        if ($('dayPassCancelEditButton')) $('dayPassCancelEditButton').hidden = true;
    }

    function editRecord(id) {
        const sale = getRecord(id);
        if (!sale) return;
        showDayPassDialog();
        state.editingId = String(id);
        $('dayPassVisitorName').value = recordDisplayName(sale) === 'زائر' ? '' : recordDisplayName(sale);
        $('dayPassVisitorPhone').value = sale.visitorPhone || '';
        $('dayPassType').value = sale.passTypeCode || '';
        $('dayPassPaymentMethod').value = sale.paymentMethod || 'cash';
        $('dayPassSendWhatsApp').checked = false;
        updatePricePreview();
        if ($('dayPassSaveButton')) $('dayPassSaveButton').textContent = 'حفظ التعديل';
        if ($('dayPassCancelEditButton')) $('dayPassCancelEditButton').hidden = false;
        window.setTimeout(() => $('dayPassForm')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 120);
    }

    async function deleteRecord(id) {
        const sale = getRecord(id);
        if (!sale || !(await confirmDeleteRecord(sale))) return;
        try {
            await request(`/api/day-passes/${encodeURIComponent(id)}`, { method: 'DELETE' });
            if (String(state.editingId) === String(id)) resetEditForm();
            await Promise.all([loadToday(), loadDashboard()]);
            window.topGymRefreshMonthlyFinance?.();
            await notify('تم حذف سجل الحصة.');
        } catch (error) {
            await notify(error.message || 'تعذر حذف سجل الحصة.', 'error');
        }
    }

    async function submitDayPass(event) {
        event.preventDefault();
        const visitorPhone = $('dayPassVisitorPhone').value.trim();
        const shouldSend = Boolean($('dayPassSendWhatsApp')?.checked && visitorPhone);
        const preparedWindow = shouldSend ? window.topGymWhatsapp?.prepareWindow(visitorPhone) : null;
        const button = $('dayPassSaveButton');
        if (button) button.disabled = true;
        try {
            const editingId = state.editingId;
            const result = await request(editingId ? `/api/day-passes/${encodeURIComponent(editingId)}` : '/api/day-passes', {
                method: editingId ? 'PUT' : 'POST',
                body: JSON.stringify({
                    visitorName: $('dayPassVisitorName').value,
                    visitorPhone,
                    passTypeCode: $('dayPassType').value,
                    paymentMethod: $('dayPassPaymentMethod').value,
                    visitDate: todayIso()
                })
            });
            const whatsappSent = shouldSend && result.whatsapp?.available && openWhatsapp(result.sale, result.whatsapp?.message || '', preparedWindow);
            if (!whatsappSent && preparedWindow && !preparedWindow.closed) preparedWindow.close();
            resetEditForm();
            closeDayPassDialog();
            await Promise.all([loadToday(), loadDashboard()]);
            await notify(editingId ? 'تم تحديث سجل الحصة.' : (whatsappSent ? 'تم حفظ الحصة وتجهيز رسالة واتساب.' : 'تم حفظ الحصة وإضافتها للإيرادات.'));
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
            await Promise.all([loadToday(), loadDashboard()]);
            window.topGymRefreshMonthlyFinance?.();
            await notify('تم إلغاء الحصة.');
        } catch (error) {
            await notify(error.message || 'تعذر إلغاء الحصة.', 'error');
        }
    }

    function whatsappForRecord(id) {
        const sale = getRecord(id);
        if (!sale) return;
        if (!recordPhone(sale)) return notify('لا يوجد رقم هاتف مسجل لهذا الزائر.', 'warning');
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
        arrangeDashboardSections();
        prepareDayPassDialog();
        $('dayPassForm')?.addEventListener('submit', submitDayPass);
        $('dayPassType')?.addEventListener('change', updatePricePreview);
        $('dayPassRefreshButton')?.addEventListener('click', loadToday);
        $('dayPassCancelEditButton')?.addEventListener('click', resetEditForm);
        $('dayPassSearch')?.addEventListener('input', () => { window.clearTimeout(state.searchTimer); state.searchTimer = window.setTimeout(loadToday, 250); });
        $('dayPassTableWrap')?.addEventListener('click', (event) => {
            const whatsappButton = event.target.closest('[data-day-pass-whatsapp]');
            if (whatsappButton) return whatsappForRecord(whatsappButton.dataset.dayPassWhatsapp);
            const editButton = event.target.closest('[data-day-pass-edit]');
            if (editButton) return editRecord(editButton.dataset.dayPassEdit);
            const deleteButton = event.target.closest('[data-day-pass-delete]');
            if (deleteButton) return deleteRecord(deleteButton.dataset.dayPassDelete);
            const voidButton = event.target.closest('[data-day-pass-void]');
            if (voidButton) return voidDayPass(voidButton.dataset.dayPassVoid);
        });
        $('dashboardDayPassAdd')?.addEventListener('click', openForm);
        $('dashboardDayPassManage')?.addEventListener('click', () => showDayPassDialog());
        $('dayPassDialog')?.addEventListener('click', (event) => {
            if (event.target.closest('[data-day-pass-dialog-close]')) closeDayPassDialog();
        });
        $('dashboardDayPassTableWrap')?.addEventListener('click', (event) => {
            const whatsappButton = event.target.closest('[data-day-pass-whatsapp]');
            if (whatsappButton) return whatsappForRecord(whatsappButton.dataset.dayPassWhatsapp);
            const editButton = event.target.closest('[data-day-pass-edit]');
            if (editButton) return editRecord(editButton.dataset.dayPassEdit);
            const deleteButton = event.target.closest('[data-day-pass-delete]');
            if (deleteButton) return deleteRecord(deleteButton.dataset.dayPassDelete);
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
            if (!$('dashboardSection')?.hidden) void loadDashboard();
        };
        if (window.topGymAuthReady) window.topGymAuthReady.then(loadAfterAuth).catch(() => {});
        else loadAfterAuth();
        document.addEventListener('topgym:tab-changed', (event) => {
            if (event.detail?.name === 'dashboard' && isAuthenticated()) void loadDashboard();
        });
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initialize, { once: true });
    else initialize();

    window.topGymDayPasses = Object.freeze({ loadPricing, loadToday, loadDashboard, openForm });
})();
