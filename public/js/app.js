        const TYPE_LABELS = { monthly: 'شهرية', quarterly: 'ربع سنوية', semiannual: 'نصف سنوية', annual: 'سنوية' };
        const STATUS_LABELS = { active: 'نشطة', expiring_soon: 'قريبة الانتهاء', expired: 'منتهية', frozen: 'مجمدة' };
        const ALERT_ICON_PATHS = {
            active: '<path d="m5 12 4 4L19 6"/>',
            expiring_soon: '<circle cx="12" cy="12" r="8"/><path d="M12 8v4l3 2"/>',
            expired: '<path d="M12 3 2.5 20h19L12 3Z"/><path d="M12 9v4M12 17h.01"/>',
            frozen: '<path d="M12 3v18M5.6 6.7l12.8 10.6M18.4 6.7 5.6 17.3M4 12h16"/>',
            debt: '<circle cx="12" cy="12" r="9"/><path d="M12 7v10M9 10h4a2 2 0 1 1 0 4H9"/>',
            inactive: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>'
        };
        const ALERT_WHATSAPP_ICON = '<svg class="ui-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 11.5a8 8 0 0 1-8 8 8.5 8.5 0 0 1-3.7-.85L4 20l1.35-4.05A8.5 8.5 0 1 1 20 11.5Z"/><path d="M8.7 9.1c.2-.45.4-.46.7-.47h.35c.2 0 .4.08.5.34l.65 1.5c.1.23.08.42-.08.62l-.42.52c.55 1.1 1.4 1.8 2.55 2.3l.45-.5c.17-.2.36-.23.6-.14l1.42.63c.25.12.34.3.31.55-.1.8-.68 1.35-1.47 1.4-2.3.12-5.98-3.5-6.1-6.75-.02-.01.17-.75.54-1.02Z"/></svg>';
        function alertIconMarkup(kind, status) {
            const path = ALERT_ICON_PATHS[kind] || ALERT_ICON_PATHS[status] || ALERT_ICON_PATHS.expiring_soon;
            return `<span class="alert-card-icon" aria-hidden="true"><svg class="ui-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${path}</svg></span>`;
        }
        function alertStatusMarkup(kind, status, label) {
            const path = kind === 'inactive'
                ? '<path d="M20 15.5A8.5 8.5 0 0 1 8.5 4 8.5 8.5 0 1 0 20 15.5Z"/>'
                : ALERT_ICON_PATHS[kind] || ALERT_ICON_PATHS[status] || ALERT_ICON_PATHS.expiring_soon;
            return `<span class="alert-status"><svg class="alert-status-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${path}</svg><span>${escapeHtml(label)}</span></span>`;
        }
        const PAYMENT_LABELS = { cash: 'نقدي', card: 'بطاقة', transfer: 'تحويل', other: 'أخرى' };
        const PAYMENT_TRANSACTION_LABELS = { subscription: 'اشتراك', payment: 'دفعة', adjustment: 'تسوية' };
         const EVENT_LABELS = { created: 'إضافة اشتراك', updated: 'تعديل بيانات', renewed: 'تجديد اشتراك', frozen: 'تجميد العضوية', resumed: 'استئناف العضوية', payment_updated: 'تحديث الدفع' };
         const FREEZE_LIMIT = 3;
         const ACTION_LABELS = { details: 'التفاصيل', edit: 'تعديل العضو', renew: 'تجديد الاشتراك', freeze: 'تجميد العضوية', resume: 'استئناف العضوية', payment: 'تسجيل دفعة', qr: 'عرض QR Code', delete: 'حذف العضو' };
         const ACTION_ICONS = {
             details: '<path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z"/><circle cx="12" cy="12" r="2.5"/>',
             edit: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4Z"/>',
             renew: '<path d="M20 11a8 8 0 0 0-14.8-4L3 10"/><path d="M3 5v5h5"/><path d="M4 13a8 8 0 0 0 14.8 4L21 14"/><path d="M21 19v-5h-5"/>',
             freeze: '<path d="M12 2v20M4.9 6l14.2 12M19.1 6 4.9 18M4 12h16"/>',
             resume: '<path d="m8 5 11 7-11 7V5Z"/>',
             payment: '<circle cx="12" cy="12" r="9"/><path d="M12 7v10M9 10h4a2 2 0 1 1 0 4H9"/>',
             qr: '<rect x="4" y="4" width="6" height="6"/><rect x="14" y="4" width="6" height="6"/><rect x="4" y="14" width="6" height="6"/><path d="M14 14h3v3h3M14 20h2M20 14v2"/>',
             delete: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>'
         };
         function actionIcon(action) { return `<svg class="action-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ACTION_ICONS[action] || ''}</svg>`; }
         const COACHING_ACTION_LABELS = { workout: '\u0625\u0646\u0634\u0627\u0621 \u0628\u0631\u0646\u0627\u0645\u062c \u062a\u062f\u0631\u064a\u0628', diet: '\u0625\u0646\u0634\u0627\u0621 \u062e\u0637\u0629 \u062a\u063a\u0630\u064a\u0629' };
         const COACHING_ACTION_ICONS = { workout: '<path d="M6 8v8M18 8v8M3 11h18M8 5h8v14H8z"/>', diet: '<path d="M12 21c-4-2-7-5.5-7-10a5 5 0 0 1 7-4.6A5 5 0 0 1 19 11c0 4.5-3 7.8-7 10Z"/><path d="M12 7c0 4-2 6-5 7"/>' };
         function actionButton(action, memberId, classes = 'btn btn-light btn-small', extra = '') { const label = ACTION_LABELS[action] || action; return `<button class="${classes} icon-action rounded-lg shadow-none transition-colors" data-action="${action}" data-label="${label}" data-id="${memberId}" aria-label="${label}" title="${label}" type="button" ${extra}>${actionIcon(action)}</button>`; }
         const DEFAULT_PRICING = { plans: { gym_only: { label: 'جيم فقط', monthlyPrice: 305, active: true, sortOrder: 1 }, gym_cardio: { label: 'جيم وكارديو', monthlyPrice: 400, active: true, sortOrder: 2 } }, types: { monthly: { label: 'شهرية', mode: 'months', durationValue: 1, priceMultiplier: 1, active: true, sortOrder: 1 }, half_month: { label: 'نصف شهر', mode: 'days', durationValue: 15, priceMultiplier: .5, active: true, sortOrder: 2 }, quarterly: { label: 'ربع سنوية', mode: 'months', durationValue: 3, priceMultiplier: 3, active: true, sortOrder: 3 }, semiannual: { label: 'نصف سنوية', mode: 'months', durationValue: 6, priceMultiplier: 6, active: true, sortOrder: 4 }, annual: { label: 'سنوية', mode: 'months', durationValue: 12, priceMultiplier: 12, active: true, sortOrder: 5 } }, durations: { monthly: 1, quarterly: 3, semiannual: 6, annual: 12 } };
         const state = { members: [], dashboard: null, pricing: DEFAULT_PRICING, pricingLoadedAt: 0, editing: null, dialogAction: null, dialogMember: null, endDateManual: false };
         const $ = (id) => document.getElementById(id);
        let membersAbortController = null;
        let membersLoadPromise = null;
        let membersLoadKey = '';
        let dataLoadPromise = null;
        let pricingRequestPromise = null;
         const PRICING_CACHE_TTL_MS = 5 * 60 * 1000;

        function todayIso() { const now = new Date(); return new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 10); }
        function addMonths(dateString, months) { const [y, m, d] = dateString.split('-').map(Number); const index = m - 1 + months; const year = y + Math.floor(index / 12); const month = ((index % 12) + 12) % 12; const last = new Date(Date.UTC(year, month + 1, 0)).getUTCDate(); return new Date(Date.UTC(year, month, Math.min(d, last))).toISOString().slice(0, 10); }
        function addDays(dateString, days) { const date = new Date(`${dateString}T00:00:00Z`); date.setUTCDate(date.getUTCDate() + Number(days)); return date.toISOString().slice(0, 10); }
         function resolvedTypeCode(type) { const requestedCode = String(type ?? '').trim(); return state.pricing.typeAliases?.[requestedCode] || requestedCode; }
         function typeConfig(type) { const code = resolvedTypeCode(type); return state.pricing.types?.[code] || DEFAULT_PRICING.types[code] || DEFAULT_PRICING.types.monthly; }
         function typeLabel(type) { return typeConfig(type).label || type || '—'; }
         function activeTypeEntries() { return Object.entries(state.pricing.types || DEFAULT_PRICING.types).filter(([, item]) => item && item.active !== false).sort(([, first], [, second]) => Number(first.sortOrder || 0) - Number(second.sortOrder || 0)); }
         function calculatedEndDate(start, type) { const config = typeConfig(type); if (!start) return ''; const value = Math.max(1, Number(config.durationValue || 1)); return config.mode === 'days' ? addDays(start, Math.max(1, Math.round(value)) - 1) : addDays(addMonths(start, Math.max(1, Math.round(value))), -1); }
        function formatDate(value) { if (!value) return '—'; return new Intl.DateTimeFormat('ar-EG', { dateStyle: 'medium' }).format(new Date(`${String(value).slice(0, 10)}T00:00:00`)); }
        function formatDateTime(value) { if (!value) return '—'; return new Intl.DateTimeFormat('ar-EG', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)); }
        function money(value) { return `${Number(value || 0).toLocaleString('ar-EG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ج.م`; }
        function escapeHtml(value) { return String(value ?? '').replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char])); }
        function planLabel(plan) { return state.pricing.plans[plan]?.label || DEFAULT_PRICING.plans[plan]?.label || plan || 'جيم فقط'; }
         function calculateClientPricing(type, plan, discount) { const monthlyPrice = Number(state.pricing.plans[plan]?.monthlyPrice || DEFAULT_PRICING.plans[plan]?.monthlyPrice || 0); const code = resolvedTypeCode(type); const config = typeConfig(code); const configuredPrice = state.pricing.prices?.[plan]?.[code]; const listPrice = configuredPrice === undefined ? monthlyPrice * Number(config.priceMultiplier || 1) : Number(configuredPrice); const discountAmount = Math.max(0, Number(discount) || 0); return { listPrice, discountAmount, amountDue: Math.max(0, listPrice - discountAmount) }; }

         async function withLoader(task) { return task(); }

        function showToast(message, error = false, type = '') { const toast = $('toast'); if (!toast) return; const kind = ['success', 'error', 'warning', 'info'].includes(type) ? type : (error ? 'error' : 'success'); const icons = { info: '<svg class="ui-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 10v6M12 7h.01"/></svg>', warning: '<svg class="ui-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3 2.5 20h19L12 3Z"/><path d="M12 9v4M12 17h.01"/></svg>', error: '<svg class="ui-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="m9 9 6 6M15 9l-6 6"/></svg>', success: '<svg class="ui-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m5 12 4 4L19 6"/></svg>' }; const item = document.createElement('div'); item.className = `toast-item ${kind}`; item.setAttribute('role', kind === 'error' ? 'alert' : 'status'); item.innerHTML = `<span class="toast-icon" aria-hidden="true">${icons[kind]}</span><span class="toast-message">${escapeHtml(message)}</span><button class="toast-close" type="button" aria-label="إغلاق">×</button>`; toast.appendChild(item); toast.className = 'toast show'; const close = () => { if (item.dataset.closed) return; item.dataset.closed = 'true'; item.classList.add('is-leaving'); window.setTimeout(() => { item.remove(); if (!toast.children.length) toast.className = 'toast'; }, 180); }; item.querySelector('.toast-close')?.addEventListener('click', close); window.setTimeout(close, kind === 'error' ? 5000 : 3000); }
        function getTopLayerDialog() {
            const dialogs = [...document.querySelectorAll('dialog[open]')];
            return dialogs[dialogs.length - 1] || null;
        }

        function showDialogValidation(message, type = 'error') {
            const dialog = getTopLayerDialog();
            if (!dialog) return false;
            const host = dialog.querySelector('.dialog-body, .form-body, .form-panel') || dialog;
            let alert = [...host.children].find((child) => child.classList?.contains('dialog-validation'));
            if (!alert) {
                alert = document.createElement('div');
                alert.setAttribute('role', 'alert');
                const heading = [...host.children].find((child) => child.matches?.('.details-dialog-head, .section-heading, .builder-stepper'));
                if (heading) heading.insertAdjacentElement('afterend', alert);
                else host.prepend(alert);
            }
            alert.className = `dialog-validation ${type}`;
            alert.textContent = String(message || 'حدث خطأ أثناء تنفيذ الطلب.');
            alert.hidden = false;
            window.clearTimeout(alert.validationTimer);
            alert.validationTimer = window.setTimeout(() => { if (alert.isConnected) alert.hidden = true; }, type === 'error' ? 8000 : 5000);
            alert.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' });
            return true;
        }

        function clearDialogValidation(dialog) {
            dialog?.querySelectorAll('.dialog-validation').forEach((alert) => {
                window.clearTimeout(alert.validationTimer);
                alert.hidden = true;
            });
        }

        window.topGymDialogTarget = getTopLayerDialog;
        window.topGymShowDialogValidation = showDialogValidation;
        document.querySelectorAll('dialog').forEach((dialog) => dialog.addEventListener('close', () => clearDialogValidation(dialog)));
        if (window.Swal && !window.Swal.__topGymDialogPatched) {
            const originalSweetAlertFire = window.Swal.fire.bind(window.Swal);
            window.Swal.fire = (...args) => {
                if (args.length === 1 && args[0] && typeof args[0] === 'object' && !args[0].target) {
                    const dialog = getTopLayerDialog();
                    if (dialog) args[0] = { ...args[0], target: dialog };
                }
                return originalSweetAlertFire(...args);
            };
            window.Swal.__topGymDialogPatched = true;
        }

        const baseShowToast = showToast;
        showToast = function(message, error = false, type = '') {
            const kind = ['success', 'error', 'warning', 'info'].includes(type) ? type : (error ? 'error' : 'success');
            if (['error', 'warning'].includes(kind) && showDialogValidation(message, kind)) return;
            return baseShowToast(message, error, type);
        };

        function notify(title, icon = 'success') {
            const kind = ['success', 'error', 'warning', 'info'].includes(icon) ? icon : 'info';
            showToast(title, kind === 'error', kind);
            return Promise.resolve();
        }
         async function refreshAfterAction(message, icon = 'success') {
             const refreshPromise = loadData();
             try { await notify(message, icon); } finally { await refreshPromise; }
         }
         async function confirmDelete(name) {
            if (window.Swal) { const result = await window.Swal.fire({ position: 'center', backdrop: 'rgba(15, 23, 42, .52)', icon: 'warning', title: 'تأكيد الحذف', text: `هل تريد حذف العضو ${name}؟`, showCancelButton: true, confirmButtonText: 'نعم، احذف', cancelButtonText: 'إلغاء', buttonsStyling: false, customClass: { popup: 'delete-confirm-alert' } }); return result.isConfirmed; }
            return window.confirm(`هل تريد حذف العضو ${name}؟`);
        }

        async function api(path, options = {}) {
            const response = await fetch(path, { ...options, headers: { 'Content-Type': 'application/json', ...(options.headers || {}) } });
            if (response.status === 204) return null;
            const data = await response.json().catch(() => ({}));
            if (!response.ok) {
                const error = new Error(data.error || 'تعذر تنفيذ الطلب.');
                error.code = data.code || null;
                error.field = data.field || null;
                error.memberName = data.memberName || null;
                error.attendance = data.attendance || null;
                throw error;
            }
            return data;
        }

        function applyPricingCatalog(pricing) {
            state.pricing = pricing || DEFAULT_PRICING;
            state.pricingLoadedAt = Date.now();
            if ($('membershipPlan')) syncPlanOptions();
            if ($('amountDue')) updateFormPricing();
            return state.pricing;
        }

        async function loadPricingCatalog(force = false) {
            if (pricingRequestPromise) return pricingRequestPromise;
            const isFresh = state.pricingLoadedAt && Date.now() - state.pricingLoadedAt < PRICING_CACHE_TTL_MS;
            if (!force && isFresh) return state.pricing;
            pricingRequestPromise = api('/api/pricing')
                .then((pricing) => applyPricingCatalog(pricing))
                .finally(() => { pricingRequestPromise = null; });
            return pricingRequestPromise;
        }

        async function showDuplicatePhoneValidation(error) {
            const memberName = error.memberName || 'مشترك مسجل بالفعل';
            if (window.Swal) {
                await window.Swal.fire({
                    position: 'center',
                    backdrop: 'rgba(15, 23, 42, .58)',
                    icon: 'warning',
                    title: 'رقم الهاتف مستخدم بالفعل',
                    html: `<div class="duplicate-phone-alert-content"><p>هذا الرقم مسجل من قبل لدى المشترك:</p><strong>${escapeHtml(memberName)}</strong><small>راجع الرقم أو افتح بيانات المشترك الحالي.</small></div>`,
                    confirmButtonText: 'حسنًا',
                    buttonsStyling: false,
                    customClass: { popup: 'duplicate-phone-alert', confirmButton: 'duplicate-phone-alert-confirm' }
                });
            } else {
                await notify(`هذا الرقم مستخدم بالفعل لدى المشترك ${memberName}.`, 'warning');
            }
            $('phone')?.focus();
            $('phone')?.select();
        }

         function syncTypeOptions() {
             const selects = [$('membershipType'), $('dialogType')].filter(Boolean);
             selects.forEach((select) => { const current = select.value; select.innerHTML = activeTypeEntries().map(([code, type]) => `<option value="${escapeHtml(code)}">${escapeHtml(type.label)}</option>`).join(''); if ((state.pricing.types || {})[current]?.active !== false) select.value = current; if (!select.value && select.options.length) select.selectedIndex = 0; });
         }
         function syncPlanOptions() {
             const selects = [$('membershipPlan'), $('dialogPlan')].filter(Boolean); selects.forEach((select) => { const current = select.value; select.innerHTML = Object.entries(state.pricing.plans).map(([code, plan]) => `<option value="${escapeHtml(code)}">${escapeHtml(plan.label)}</option>`).join(''); if (state.pricing.plans[current]) select.value = current; }); syncTypeOptions();
         }
        function updateFormPricing() {
            const pricing = calculateClientPricing($('membershipType').value, $('membershipPlan').value, $('discountAmount').value); $('amountDue').value = pricing.amountDue.toFixed(2); $('pricingSummary').textContent = `السعر الأساسي: ${money(pricing.listPrice)} · الخصم: ${money(pricing.discountAmount)} · المستحق: ${money(pricing.amountDue)}`;
        }
        function updateDialogPricing() {
            if (!$('dialogType') || !$('dialogPlan')) return; const pricing = calculateClientPricing($('dialogType').value, $('dialogPlan').value, $('dialogDiscount').value); $('dialogDue').value = pricing.amountDue.toFixed(2); $('dialogPricing').textContent = `السعر الأساسي: ${money(pricing.listPrice)} · الخصم: ${money(pricing.discountAmount)} · المستحق: ${money(pricing.amountDue)}`;
        }

        function isMembersTabActive() {
            return document.querySelector('[data-page-tab="members"]')?.classList.contains('active');
        }

        async function loadData() {
            if (dataLoadPromise) return dataLoadPromise;
            const loadPromise = withLoader(async () => {
                const dashboardRequest = api('/api/dashboard');
                const pricingRequest = loadPricingCatalog(true);
                try {
                    const [dashboard] = await Promise.all([dashboardRequest, pricingRequest]);
                    state.dashboard = dashboard || null;
                    renderDashboard();
                    updateFormPricing();
                    if (isMembersTabActive()) await loadMembersOnly();
                } catch (error) {
                    await notify(error.message, 'error');
                }
            }, 'جاري تحميل بيانات TOP GYM…');
            const trackedPromise = loadPromise.finally(() => {
                if (dataLoadPromise === trackedPromise) dataLoadPromise = null;
            });
            dataLoadPromise = trackedPromise;
            return trackedPromise;
        }
        async function loadMembersOnly() {
            const queryKey = JSON.stringify([$('searchInput')?.value.trim() || '', $('statusFilter')?.value || '', $('sortFilter')?.value || '']);
            if (membersLoadPromise && membersLoadKey === queryKey) return membersLoadPromise;
            if (membersAbortController) membersAbortController.abort();
            membersAbortController = new AbortController();
            const controller = membersAbortController;
            membersLoadKey = queryKey;
            const loadPromise = withLoader(async () => {
                state.pagination = null;
                if ($('membersPagination')) $('membersPagination').hidden = true;
                $('membersList').innerHTML = '<div class="loading">جاري تحديث القائمة…</div>';
                try { const params = new URLSearchParams({ search: $('searchInput').value.trim(), status: $('statusFilter').value, sort: $('sortFilter').value, page: '1', pageSize: '5' }); const response = await api(`/api/members?${params}`, { signal: controller.signal }); state.members = response.members || []; state.pagination = response.pagination || null; state.detailsCache = new Map(); renderMembers(); }
                catch (error) { if (error.name !== 'AbortError') { $('membersList').innerHTML = `<div class="empty">${escapeHtml(error.message)}</div>`; await notify(error.message, 'error'); } }
            }, 'جاري تحديث قائمة TOP GYM…');
            const trackedPromise = loadPromise.finally(() => {
                if (membersLoadPromise === trackedPromise) membersLoadPromise = null;
            });
            membersLoadPromise = trackedPromise;
            return trackedPromise;
        }

        function renderDashboard() {
             const dashboard = state.dashboard || { stats: {}, alerts: [] }; $('statTotal').textContent = dashboard.stats.total || 0; $('statActive').textContent = dashboard.stats.active || 0; $('statExpiring').textContent = dashboard.stats.expiringSoon || 0; $('statExpired').textContent = dashboard.stats.expired || 0; $('statFrozen').textContent = dashboard.stats.frozen || 0;
            const alerts = dashboard.alerts || [];
            $('alertsList').innerHTML = alerts.length ? alerts.map((member) => {
                const sub = member.membership || {};
                const kind = member.alertKind || 'membership';
                const status = sub.status || 'active';
                const detail = kind === 'debt'
                    ? `متبقي على الحساب ${money(sub.amountRemaining)}`
                    : kind === 'inactive'
                        ? (member.daysSinceLastVisit == null ? 'لم يسجل حضورًا من قبل' : `آخر حضور منذ ${member.daysSinceLastVisit} يومًا`)
                        : status === 'frozen'
                            ? `حتى ${formatDate(sub.freezeEnd)}`
                            : status === 'expired'
                                ? `انتهت في ${formatDate(sub.endDate)}`
                                : `تنتهي في ${formatDate(sub.effectiveEndDate)}`;
                const label = kind === 'debt' ? 'عليه مستحقات' : kind === 'inactive' ? 'غياب طويل' : (STATUS_LABELS[status] || status);
                const alertAction = member.id
                    ? `<button type="button" class="alert-whatsapp-button" data-alert-whatsapp="${escapeHtml(kind)}" data-member-id="${escapeHtml(member.id)}" data-alert-name="${escapeHtml(member.fullName)}" data-alert-phone="${escapeHtml(member.phone)}" data-alert-status="${escapeHtml(status)}" data-alert-end="${escapeHtml(sub.effectiveEndDate || sub.endDate || '')}" data-alert-freeze-end="${escapeHtml(sub.freezeEnd || '')}" data-alert-remaining="${escapeHtml(sub.amountRemaining ?? '')}" data-alert-days="${escapeHtml(member.daysSinceLastVisit ?? '')}">${ALERT_WHATSAPP_ICON}<span><strong>واتساب يدوي</strong><small>تواصل الآن عبر واتساب</small></span></button>`
                    : '';
                const phone = String(member.phone || '');
                return `<article class="alert-card ${status}" data-alert-enhanced="true" data-alert-kind="${escapeHtml(kind)}" data-member-id="${escapeHtml(member.id || '')}" data-alert-name="${escapeHtml(member.fullName)}" data-alert-phone="${escapeHtml(member.phone)}" data-alert-status="${escapeHtml(status)}" data-alert-end="${escapeHtml(sub.effectiveEndDate || sub.endDate || '')}" data-alert-freeze-end="${escapeHtml(sub.freezeEnd || '')}" data-alert-remaining="${escapeHtml(sub.amountRemaining ?? '')}" data-alert-days="${escapeHtml(member.daysSinceLastVisit ?? '')}">${alertIconMarkup(kind, status)}<div class="alert-card-body"><strong class="alert-card-name">${escapeHtml(member.fullName)}</strong><span class="alert-card-detail">${escapeHtml(detail)}</span><a class="alert-card-phone" href="tel:${escapeHtml(phone.replace(/\s+/g, ''))}">${escapeHtml(phone)}</a></div>${alertStatusMarkup(kind, status, label)}${alertAction}</article>`;
            }).join('') : '<div class="empty">لا توجد تنبيهات اليوم.</div>';
            const headerAlertCount = $('headerAlertCount'); if (headerAlertCount) headerAlertCount.textContent = alerts.length.toLocaleString('ar-EG');
        }
        function decorateMemberQuickActions() {
            const list = $('membersList');
            if (!list) return;
            list.querySelectorAll('tr[data-member-id]').forEach((row) => {
                if (row.dataset.quickActionsReady === 'true') return;
                const member = state.members.find((item) => String(item.id) === String(row.dataset.memberId));
                const cell = row.querySelector('td:last-child');
                if (!member || !cell) return;
                const quickActions = document.createElement('div');
                quickActions.className = 'member-quick-actions';
                const attendance = member.attendance;
                const checkInOpen = attendance?.checkInAt && !attendance?.checkOutAt;
                const canCheckIn = ['active', 'expiring_soon'].includes(member.membership?.status);
                if (checkInOpen) {
                    const button = document.createElement('button');
                    button.className = 'btn member-attendance-quick checkout';
                    button.type = 'button';
                    button.dataset.attendanceAction = 'checkout';
                    button.dataset.id = String(member.id);
                    button.dataset.phone = member.phone || '';
                    button.textContent = 'انصراف';
                    button.title = 'تسجيل انصراف';
                    button.setAttribute('aria-label', `تسجيل انصراف ${member.fullName}`);
                    quickActions.append(button);
                } else if (attendance?.checkOutAt) {
                    const status = document.createElement('span');
                    status.className = `member-attendance-status${attendance.checkOutSource === 'auto' ? ' auto' : ''}`;
                    status.textContent = attendance.checkOutSource === 'auto' ? 'انصرف تلقائيًا' : 'تم الانصراف';
                    quickActions.append(status);
                } else if (canCheckIn) {
                    const button = document.createElement('button');
                    button.className = 'btn member-attendance-quick check-in';
                    button.type = 'button';
                    button.dataset.attendanceAction = 'checkin';
                    button.dataset.id = String(member.id);
                    button.dataset.phone = member.phone || '';
                    button.textContent = 'حضور';
                    button.title = 'تسجيل حضور';
                    button.setAttribute('aria-label', `تسجيل حضور ${member.fullName}`);
                    quickActions.append(button);
                } else {
                    const status = document.createElement('span');
                    status.className = 'member-attendance-status unavailable';
                    status.textContent = 'غير متاح';
                    status.title = 'العضوية غير سارية أو مجمدة';
                    quickActions.append(status);
                }
                const tableActions = cell.querySelector(':scope > .table-actions');
                if (tableActions && !tableActions.querySelector('[data-member-coaching-action="workout"]')) {
                    const detailsAction = tableActions.querySelector('[data-action="details"]');
                    const coachingActions = ['workout', 'diet'].map((action) => `<button class="btn btn-light btn-small icon-action rounded-lg shadow-none transition-colors table-action-visible coaching-table-action ${action}" data-member-coaching-action="${action}" data-member-id="${member.id}" data-member-name="${escapeHtml(member.fullName || '')}" aria-label="${COACHING_ACTION_LABELS[action]}" title="${COACHING_ACTION_LABELS[action]}" type="button"><svg class="action-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${COACHING_ACTION_ICONS[action]}</svg></button>`).join('');
                    if (detailsAction) detailsAction.insertAdjacentHTML('afterend', coachingActions);
                    else tableActions.insertAdjacentHTML('afterbegin', coachingActions);
                }
                if (tableActions && !tableActions.querySelector('[data-action="qr"]')) {
                    const menuPanel = tableActions.querySelector('.action-menu-panel');
                    if (menuPanel) {
                        menuPanel.insertAdjacentHTML('beforeend', `<button class="action-menu-item" type="button" data-action="qr" data-id="${member.id}" aria-label="${ACTION_LABELS.qr}" title="${ACTION_LABELS.qr}">${actionIcon('qr')}<span>${escapeHtml(ACTION_LABELS.qr)}</span></button>`);
                    } else {
                        tableActions.insertAdjacentHTML('beforeend', actionButton('qr', member.id));
                    }
                }
                const actionRow = document.createElement('div');
                actionRow.className = 'member-action-row';
                actionRow.append(quickActions);
                if (tableActions) actionRow.append(tableActions);
                cell.append(actionRow);
                row.dataset.quickActionsReady = 'true';
            });
        }

        function memberTableRow(member) {
            const sub = member.membership;
            if (!sub) return `<tr data-member-id="${member.id}"><td><span class="table-member-name">${escapeHtml(member.fullName)}</span><a class="table-member-phone" href="tel:${escapeHtml(member.phone)}">${escapeHtml(member.phone)}</a><span class="table-sub">تسجيل: ${formatDate(member.registrationDate)}</span></td><td>—</td><td><span class="badge expired">بدون اشتراك</span></td><td>—</td><td>—</td><td>—</td><td><div class="table-actions">${actionButton('details', member.id, 'btn btn-details btn-small')}${actionButton('edit', member.id)}${actionButton('delete', member.id, 'btn btn-danger btn-small')}</div></td></tr>`;
            const freezeLimit = Number(sub.freezeLimit || FREEZE_LIMIT);
            const freezeCount = Number(sub.freezeCount || 0);
            const remaining = sub.status === 'expired' ? `منتهية منذ ${Math.abs(sub.daysRemaining || 0)} يوم` : sub.status === 'frozen' ? `تجميد حتى ${formatDate(sub.freezeEnd)}` : `${sub.daysRemaining} يوم متبقي`;
            const freezeUsage = `<span class="freeze-usage${freezeCount >= freezeLimit ? ' complete' : ''}"><strong>${freezeCount}/${freezeLimit}</strong><span>متبقي ${Math.max(0, freezeLimit - freezeCount)}</span></span>`;
            const freezeButton = sub.status === 'frozen'
                ? actionButton('resume', member.id, 'btn btn-purple btn-small')
                : sub.status === 'expired'
                    ? ''
                    : actionButton('freeze', member.id, 'btn btn-light btn-small', freezeCount >= freezeLimit ? 'disabled' : '');
            return `<tr data-member-id="${member.id}"><td><span class="table-member-name">${escapeHtml(member.fullName)}</span><a class="table-member-phone" href="tel:${escapeHtml(member.phone)}">${escapeHtml(member.phone)}</a><span class="table-sub">تسجيل: ${formatDate(member.registrationDate)}</span></td><td><span class="table-main">${escapeHtml(planLabel(sub.plan))}</span><span class="table-sub">${escapeHtml(typeLabel(sub.type))}</span></td><td><span class="badge ${sub.status}">${STATUS_LABELS[sub.status] || sub.status}</span></td><td><span class="table-main">${formatDate(sub.effectiveEndDate)}</span><span class="table-sub">${escapeHtml(remaining)}</span></td><td>${freezeUsage}</td><td><span class="table-money">${money(sub.amountDue)}</span><span class="table-sub">متبقي ${money(sub.amountRemaining)}</span></td><td><div class="table-actions">${actionButton('details', member.id, 'btn btn-details btn-small')}${actionButton('edit', member.id)}${actionButton('renew', member.id, 'btn btn-primary btn-small')}${freezeButton}${actionButton('payment', member.id)}${actionButton('delete', member.id, 'btn btn-danger btn-small')}</div></td></tr>`;
        }
        function renderMembers() { $('membersCount').textContent = `${state.members.length} عضو ظاهر`; $('membersList').innerHTML = state.members.length ? `<div class="table-scroll"><table class="members-table"><thead><tr><th>العضو</th><th>الاشتراك</th><th>الحالة</th><th>الانتهاء</th><th>التجميد</th><th>الحساب</th><th>الإجراءات</th></tr></thead><tbody>${state.members.map(memberTableRow).join('')}</tbody></table></div>` : '<div class="empty">لا يوجد أعضاء مطابقون للبحث.</div>'; }

        function closeMemberDialog() { const dialog = $('memberDialog'); if (typeof dialog.close === 'function' && dialog.open) dialog.close(); else dialog.removeAttribute('open'); }
         function setFormDefaults(close = false) { const today = todayIso(); const defaultType = activeTypeEntries()[0]?.[0] || 'monthly'; $('memberId').value = ''; $('fullName').value = ''; $('phone').value = ''; $('email').value = ''; $('registrationDate').value = today; $('notes').value = ''; $('membershipType').value = defaultType; $('membershipPlan').value = 'gym_only'; $('startDate').value = today; $('endDate').value = calculatedEndDate(today, defaultType); $('membershipNotes').value = ''; $('discountAmount').value = '0'; $('amountPaid').value = ''; $('paymentMethod').value = 'cash'; $('sendWhatsAppAfterSave').checked = true; $('sendWhatsAppAfterSave').closest('.whatsapp-after-save')?.classList.remove('hidden'); state.editing = null; state.endDateManual = false; $('formTitle').textContent = 'إضافة عضو جديد'; $('saveButton').textContent = 'حفظ العضو'; $('cancelEditButton').classList.add('hidden'); $('resetButton').classList.add('hidden'); updateFormPricing(); if (close) closeMemberDialog(); }
        function openMemberDialog(member = null) { if (member) editMember(member); else setFormDefaults(); const dialog = $('memberDialog'); if (typeof dialog.showModal === 'function') dialog.showModal(); else dialog.setAttribute('open', ''); }
        function editMember(member) { const sub = member.membership || {}; $('memberId').value = member.id; $('fullName').value = member.fullName || ''; $('phone').value = member.phone || ''; $('email').value = member.email || ''; $('registrationDate').value = member.registrationDate || todayIso(); $('notes').value = member.notes || ''; $('membershipType').value = resolvedTypeCode(sub.type || 'monthly'); $('membershipPlan').value = sub.plan || 'gym_only'; $('startDate').value = sub.startDate || todayIso(); $('endDate').value = sub.endDate || calculatedEndDate($('startDate').value, $('membershipType').value); $('membershipNotes').value = sub.notes || ''; $('discountAmount').value = String(sub.discountAmount || 0); $('amountPaid').value = String(sub.amountPaid || 0); $('paymentMethod').value = sub.paymentMethod || 'cash'; $('sendWhatsAppAfterSave').checked = false; $('sendWhatsAppAfterSave').closest('.whatsapp-after-save')?.classList.add('hidden'); state.editing = member; state.endDateManual = true; $('formTitle').textContent = 'تعديل بيانات العضو'; $('saveButton').textContent = 'حفظ التعديلات'; $('cancelEditButton').classList.remove('hidden'); $('resetButton').classList.remove('hidden'); updateFormPricing(); }

        function openDialog(action, member) {
             state.dialogAction = action; state.dialogMember = member; const sub = member.membership || {}; const fields = $('dialogFields'); const freezeLimit = Number(sub.freezeLimit || FREEZE_LIMIT); const freezeCount = Number(sub.freezeCount || 0); $('dialogTitle').textContent = action === 'freeze' ? 'تجميد العضوية' : action === 'renew' ? 'تجديد العضوية' : 'تسجيل دفعة'; $('dialogDescription').textContent = `${member.fullName} · ${member.phone}`;
            if (action === 'freeze' && freezeCount >= freezeLimit) { state.dialogAction = null; state.dialogMember = null; notify(`تم استهلاك الحد الأقصى للتجميد (${freezeLimit} مرات) لهذا العضو.`, 'warning'); return; }
            if (action === 'freeze') fields.innerHTML = `<div class="freeze-limit-note"><span class="freeze-limit-icon">${actionIcon('freeze')}</span><div><strong>التجميد المستخدم ${freezeCount}/${freezeLimit}</strong><span>متبقي ${Math.max(0, freezeLimit - freezeCount)} مرات لهذا العضو.</span></div></div><div class="field"><label for="dialogDays">عدد أيام التجميد</label><input id="dialogDays" type="number" min="1" max="365" value="7" required></div><div class="field"><label for="dialogReason">السبب (اختياري)</label><textarea id="dialogReason" maxlength="500"></textarea></div>`;
            if (action === 'renew' || action === 'payment') { const plan = sub.plan || 'gym_only'; const type = sub.type || activeTypeEntries()[0]?.[0] || 'monthly'; const discount = sub.discountAmount || 0; const paidDefault = 0; const planOptions = Object.entries(state.pricing.plans).map(([code, item]) => `<option value="${escapeHtml(code)}">${escapeHtml(item.label)}</option>`).join(''); const typeOptions = activeTypeEntries().map(([code, item]) => `<option value="${escapeHtml(code)}">${escapeHtml(item.label)}</option>`).join(''); const paymentHint = action === 'payment' ? `<div class="payment-dialog-balance"><span>المدفوع حتى الآن</span><strong>${money(sub.amountPaid)}</strong><span>المتبقي الحالي</span><strong class="has-debt">${money(sub.amountRemaining)}</strong></div>` : ''; fields.innerHTML = `<div class="field-grid"><div class="field"><label for="dialogPlan">الباقة</label><select id="dialogPlan">${planOptions}</select></div><div class="field"><label for="dialogType">نوع العضوية</label><select id="dialogType">${typeOptions}</select></div></div><div class="field-grid"><div class="field"><label for="dialogDiscount">الخصم</label><input id="dialogDiscount" type="number" min="0" step="0.01" value="${discount}"></div><div class="field"><label for="dialogDue">المستحق بعد الخصم</label><input id="dialogDue" type="number" readonly></div></div><div class="pricing-summary" id="dialogPricing"></div>${paymentHint}<div class="field"><label for="dialogPaid">${action === 'payment' ? 'قيمة الدفعة الجديدة' : 'المبلغ المدفوع'}</label><input id="dialogPaid" type="number" min="0" step="0.01" value="${paidDefault}" required></div><div class="field"><label for="dialogMethod">طريقة الدفع</label><select id="dialogMethod"><option value="cash">نقدي</option><option value="card">بطاقة</option><option value="transfer">تحويل</option><option value="other">أخرى</option></select></div>`; $('dialogPlan').value = plan; $('dialogType').value = type; $('dialogMethod').value = sub.paymentMethod || 'cash'; updateDialogPricing(); $('dialogPlan').addEventListener('change', updateDialogPricing); $('dialogType').addEventListener('change', updateDialogPricing); $('dialogDiscount').addEventListener('input', updateDialogPricing); }
            const dialog = $('actionDialog'); if (typeof dialog.showModal === 'function') dialog.showModal(); else dialog.setAttribute('open', '');
        }
        function closeDialog() { const dialog = $('actionDialog'); if (typeof dialog.close === 'function' && dialog.open) dialog.close(); else dialog.removeAttribute('open'); state.dialogAction = null; state.dialogMember = null; }

        async function submitDialog(event) { event.preventDefault(); const action = state.dialogAction; const member = state.dialogMember; if (!action || !member) return; if (action === 'freeze' && Number(member.membership?.freezeCount || 0) >= Number(member.membership?.freezeLimit || FREEZE_LIMIT)) { await notify(`تم استهلاك الحد الأقصى للتجميد (${FREEZE_LIMIT} مرات) لهذا العضو.`, 'warning'); return; } try { await withLoader(async () => { if (action === 'freeze') await api(`/api/members/${member.id}/freeze`, { method: 'POST', body: JSON.stringify({ days: Number($('dialogDays').value), reason: $('dialogReason').value }) }); if (action === 'renew') await api(`/api/members/${member.id}/renew`, { method: 'POST', body: JSON.stringify({ membershipType: $('dialogType').value, membershipPlan: $('dialogPlan').value, discountAmount: Number($('dialogDiscount').value || 0), amountPaid: Number($('dialogPaid').value || 0), paymentMethod: $('dialogMethod').value }) }); if (action === 'payment') { const pricing = calculateClientPricing($('dialogType').value, $('dialogPlan').value, $('dialogDiscount').value); await api(`/api/memberships/${member.membership.id}/payments`, { method: 'POST', body: JSON.stringify({ listPrice: pricing.listPrice, discountAmount: pricing.discountAmount, amountDue: pricing.amountDue, paymentAmount: Number($('dialogPaid').value || 0), paymentMethod: $('dialogMethod').value }) }); } }, 'جاري تنفيذ الإجراء…'); closeDialog(); await refreshAfterAction(action === 'freeze' ? 'تم تجميد العضوية.' : action === 'renew' ? 'تم تجديد العضوية.' : 'تم تسجيل الدفعة وإضافة الإيصال للسجل المالي.'); } catch (error) { await notify(error.message, 'error'); } }

         function renderPricingTable() { const typeEntries = activeTypeEntries(); const headers = typeEntries.map(([, type]) => `<th>${escapeHtml(type.label)}<small class="pricing-column-hint">سعر مستقل</small></th>`).join(''); const rows = Object.entries(state.pricing.plans).map(([code, plan]) => `<tr data-plan="${escapeHtml(code)}"><td><input data-field="planName" maxlength="80" value="${escapeHtml(plan.label)}"><span class="table-sub">${escapeHtml(code)}</span></td><td><input data-field="monthlyPrice" type="number" min="0" step="0.01" value="${Number(plan.monthlyPrice).toFixed(2)}"></td>${typeEntries.map(([typeCode, type]) => { const currentPrice = Number(state.pricing.prices?.[code]?.[typeCode] ?? (Number(plan.monthlyPrice || 0) * Number(type.priceMultiplier || 1))); return `<td class="duration-price"><input data-field="typePrice" data-type-code="${escapeHtml(typeCode)}" type="number" min="0" step="0.01" value="${currentPrice.toFixed(2)}"></td>`; }).join('')}</tr>`).join(''); $('pricingTableContainer').innerHTML = `<table class="pricing-table"><thead><tr><th>الباقة</th><th>السعر الشهري</th>${headers}</tr></thead><tbody>${rows}</tbody></table>`; }
         function renderMembershipTypesTable() { const entries = Object.entries(state.pricing.types || {}).sort(([, first], [, second]) => Number(first.sortOrder || 0) - Number(second.sortOrder || 0)); const rows = entries.map(([code, type]) => { const duration = type.mode === 'days' ? `${Number(type.durationValue)} يوم` : `${Number(type.durationValue)} شهر`; const status = type.active === false ? '<span class="type-status off">غير ظاهر</span>' : '<span class="type-status">نشط</span>'; return `<tr><td><strong>${escapeHtml(type.label)}</strong><span class="table-sub">${escapeHtml(code)}</span></td><td>${duration}</td><td>${Number(type.priceMultiplier || 0).toFixed(4).replace(/0+$/, '').replace(/\.$/, '')}</td><td>${status}</td><td><div class="type-actions"><button class="btn btn-light btn-small" type="button" data-type-action="edit" data-code="${escapeHtml(code)}">تعديل</button></div></td></tr>`; }).join(''); $('membershipTypesTableContainer').innerHTML = `<table class="membership-types-table"><thead><tr><th>النوع</th><th>المدة</th><th>معامل السعر</th><th>الحالة</th><th>الإجراء</th></tr></thead><tbody>${rows || '<tr><td colspan="5">لا توجد أنواع عضويات.</td></tr>'}</tbody></table>`; }
         async function openPricingDialog() { try { await loadPricingCatalog(); syncPlanOptions(); renderPricingTable(); const dialog = $('pricingDialog'); if (typeof dialog.showModal === 'function') dialog.showModal(); else dialog.setAttribute('open', ''); } catch (error) { await notify(error.message, 'error'); } }
         async function openMembershipTypesDialog() { try { await loadPricingCatalog(); syncPlanOptions(); renderMembershipTypesTable(); const dialog = $('membershipTypesDialog'); if (typeof dialog.showModal === 'function') dialog.showModal(); else dialog.setAttribute('open', ''); } catch (error) { await notify(error.message, 'error'); } }
         function closePricingDialog() { const dialog = $('pricingDialog'); if (typeof dialog.close === 'function' && dialog.open) dialog.close(); else dialog.removeAttribute('open'); }
         function closeMembershipTypesDialog() { const dialog = $('membershipTypesDialog'); if (typeof dialog.close === 'function' && dialog.open) dialog.close(); else dialog.removeAttribute('open'); }
         async function savePricing(event) { event.preventDefault(); const rows = [...$('pricingTableContainer').querySelectorAll('tr[data-plan]')]; const saveButton = $('pricingSave'); saveButton.disabled = true; try { await withLoader(async () => { const plans = rows.map((row) => ({ planCode: row.dataset.plan, planName: row.querySelector('[data-field="planName"]').value, monthlyPrice: Number(row.querySelector('[data-field="monthlyPrice"]').value || 0), prices: Object.fromEntries([...row.querySelectorAll('[data-field="typePrice"]')].map((input) => [input.dataset.typeCode, Number(input.value || 0)])) })); applyPricingCatalog(await api('/api/pricing', { method: 'PUT', body: JSON.stringify({ plans }) })); }, 'جاري حفظ أسعار TOP GYM…'); closePricingDialog(); await notify('تم حفظ أسعار الاشتراكات.'); } catch (error) { await notify(error.message, 'error'); } finally { saveButton.disabled = false; } }

         function updateMembershipTypePreview() { const mode = $('membershipTypeMode').value; const duration = Number($('membershipTypeDuration').value || 0); const multiplier = Number($('membershipTypeMultiplier').value || 0); const name = $('membershipTypeName').value.trim() || 'نوع جديد'; const unit = mode === 'days' ? 'يوم' : 'شهر'; const monthlyPrice = Number(state.pricing.plans.gym_only?.monthlyPrice || 0); $('membershipTypePreview').textContent = `${name} · ${duration || '—'} ${unit} · السعر المتوقع لجيم فقط: ${money(monthlyPrice * multiplier)}`; }
         function openMembershipTypeDialog(code = '') { const type = code ? state.pricing.types?.[code] : null; const generatedCode = `custom_${Date.now().toString(36)}`; $('editingMembershipTypeCode').value = type ? code : ''; $('membershipTypeDialogTitle').textContent = type ? 'تعديل نوع العضوية' : 'إضافة نوع عضوية جديد'; $('membershipTypeDialogDescription').textContent = type ? 'يمكنك تعديل المدة أو السعر أو إخفاء النوع من قوائم الاشتراك.' : 'أدخل بيانات النوع الجديد ليظهر مباشرة عند إضافة أو تجديد الاشتراك.'; $('membershipTypeCode').value = type ? code : generatedCode; $('membershipTypeCode').readOnly = Boolean(type); $('membershipTypeName').value = type?.label || ''; $('membershipTypeMode').value = type?.mode || 'days'; $('membershipTypeDuration').value = type?.durationValue ?? (type ? '' : 15); $('membershipTypeMultiplier').value = type?.priceMultiplier ?? (type ? '' : 0.5); $('membershipTypeSortOrder').value = type?.sortOrder ?? (Object.keys(state.pricing.types || {}).length + 1); $('membershipTypeActive').checked = type?.active !== false; updateMembershipTypePreview(); const dialog = $('membershipTypeDialog'); if (typeof dialog.showModal === 'function') dialog.showModal(); else dialog.setAttribute('open', ''); }
         function closeMembershipTypeDialog() { const dialog = $('membershipTypeDialog'); if (typeof dialog.close === 'function' && dialog.open) dialog.close(); else dialog.removeAttribute('open'); }
         async function submitMembershipType(event) { event.preventDefault(); const code = $('membershipTypeCode').value.trim().toLowerCase(); const editingCode = $('editingMembershipTypeCode').value; const button = $('membershipTypeSave'); button.disabled = true; try { const body = { typeCode: code, typeName: $('membershipTypeName').value, durationMode: $('membershipTypeMode').value, durationValue: Number($('membershipTypeDuration').value), priceMultiplier: Number($('membershipTypeMultiplier').value), sortOrder: Number($('membershipTypeSortOrder').value || 0), isActive: $('membershipTypeActive').checked }; applyPricingCatalog(await api(editingCode ? `/api/membership-types/${encodeURIComponent(editingCode)}` : '/api/membership-types', { method: editingCode ? 'PUT' : 'POST', body: JSON.stringify(body) })); renderPricingTable(); renderMembershipTypesTable(); closeMembershipTypeDialog(); await notify(editingCode ? 'تم تعديل نوع العضوية.' : 'تمت إضافة نوع العضوية.'); } catch (error) { await notify(error.message, 'error'); } finally { button.disabled = false; } }

         function eventSummary(event) { const details = event.details || {}; const values = []; if (details.membershipPlan) values.push(planLabel(details.membershipPlan)); if (details.membershipType) values.push(typeLabel(details.membershipType)); if (details.startDate) values.push(`من ${formatDate(details.startDate)}`); if (details.endDate) values.push(`إلى ${formatDate(details.endDate)}`); if (details.amountDue !== undefined) values.push(`مستحق ${money(details.amountDue)}`); if (details.amountPaid !== undefined) values.push(`مدفوع ${money(details.amountPaid)}`); if (details.days) values.push(`${details.days} يوم`); return values.join(' · ') || 'تم تسجيل العملية في سجل العضو.'; }
         function renderDetails(data) { const member = data.member; const memberships = data.memberships || []; const freezes = data.freezes || []; const events = data.events || []; $('detailsTitle').textContent = member.fullName; $('detailsSubtitle').textContent = `${member.phone}${member.email ? ` · ${member.email}` : ''}`; const membershipRows = memberships.length ? memberships.map((item, index) => `<tr><td><strong>#${index + 1}</strong><span class="table-sub">${item.id}</span></td><td><strong>${escapeHtml(planLabel(item.plan))}</strong><span class="table-sub">${escapeHtml(typeLabel(item.type))}</span></td><td>${formatDate(item.startDate)}<span class="table-sub">حتى ${formatDate(item.effectiveEndDate)}</span></td><td><span class="badge ${item.status}">${STATUS_LABELS[item.status] || item.status}</span></td><td><span class="table-money">${money(item.amountDue)}</span><span class="table-sub">مدفوع ${money(item.amountPaid)} · متبقي ${money(item.amountRemaining)}</span></td><td>${item.freezes.length ? `${item.freezes.length} مرة` : '—'}</td></tr>`).join('') : '<tr><td colspan="6">لا توجد اشتراكات مسجلة.</td></tr>'; const freezeRows = freezes.length ? freezes.map((item) => `<tr><td>${formatDate(item.startDate)}</td><td>${formatDate(item.endDate)}</td><td>${item.resumedDate ? formatDate(item.resumedDate) : '<span class="badge frozen">نشط</span>'}</td><td>${item.days} يوم</td><td>${escapeHtml(item.reason || '—')}</td></tr>`).join('') : ''; const eventRows = events.length ? events.map((event) => `<div class="event-item"><div><strong>${escapeHtml(EVENT_LABELS[event.eventType] || event.eventType)}</strong><span>${escapeHtml(eventSummary(event))}</span></div><span class="event-date">${formatDateTime(event.createdAt)}</span></div>`).join('') : '<div class="history-empty">لا توجد عمليات مسجلة بعد.</div>'; $('detailsContent').innerHTML = `<div class="details-summary"><div class="details-summary-card"><span>تاريخ التسجيل</span><strong>${formatDate(member.registrationDate)}</strong></div><div class="details-summary-card"><span>عدد الاشتراكات</span><strong>${memberships.length}</strong></div><div class="details-summary-card"><span>عدد التجميدات</span><strong>${freezes.length}</strong></div><div class="details-summary-card"><span>عدد العمليات</span><strong>${events.length}</strong></div></div><div class="details-section"><h4>سجل الاشتراكات والتجديدات</h4><div class="history-scroll"><table class="history-table"><thead><tr><th>#</th><th>الباقة والمدة</th><th>الفترة</th><th>الحالة</th><th>الحساب</th><th>التجميد</th></tr></thead><tbody>${membershipRows}</tbody></table></div></div>${freezes.length ? `<div class="details-section"><h4>سجل التجميد</h4><div class="history-scroll"><table class="history-table"><thead><tr><th>البداية</th><th>النهاية</th><th>الاستئناف</th><th>المدة</th><th>السبب</th></tr></thead><tbody>${freezeRows}</tbody></table></div></div>` : ''}<div class="details-section"><h4>سجل كل العمليات</h4><div class="event-list">${eventRows}</div></div>${member.notes ? `<div class="details-section"><h4>ملاحظات العضو</h4><div class="history-empty">${escapeHtml(member.notes)}</div></div>` : ''}`; }
        function renderPaymentHistory(data) {
            const payments = data.payments || [];
            const summary = data.financialSummary || {};
            const section = document.createElement('div');
            section.className = 'details-section payment-history-section';
            const summaryCards = `<div class="financial-summary"><div class="financial-summary-card"><span>إجمالي المستحق</span><strong>${money(summary.totalDue)}</strong></div><div class="financial-summary-card paid"><span>إجمالي المدفوع</span><strong>${money(summary.totalPaid)}</strong></div><div class="financial-summary-card remaining"><span>إجمالي المتبقي</span><strong>${money(summary.totalRemaining)}</strong></div><div class="financial-summary-card"><span>عدد الإيصالات</span><strong>${Number(summary.paidTransactionCount || 0).toLocaleString('ar-EG')}</strong></div></div>`;
            section.innerHTML = `<h4>السجل المالي والإيصالات</h4>${summaryCards}${payments.length ? `<div class="history-scroll"><table class="history-table payment-history-table"><thead><tr><th>الإيصال</th><th>التاريخ والوقت</th><th>العملية</th><th>الاشتراك</th><th>قيمة العملية</th><th>المتبقي</th><th>طريقة الدفع</th><th>الإجراء</th></tr></thead><tbody>${payments.map((payment) => { const amountClass = payment.amountPaid < 0 ? ' payment-adjustment' : ''; return `<tr class="${amountClass.trim()}"><td><strong>${escapeHtml(payment.receiptNumber || `TG-${String(payment.id).padStart(6, '0')}`)}</strong></td><td>${formatDateTime(payment.transactionDate || payment.createdAt)}<span class="table-sub">${payment.paidAt ? formatDate(payment.paidAt) : ''}</span></td><td><span class="payment-transaction-type ${escapeHtml(payment.transactionType || 'payment')}">${escapeHtml(PAYMENT_TRANSACTION_LABELS[payment.transactionType] || payment.transactionType || 'دفعة')}</span></td><td>${escapeHtml(planLabel(payment.plan))}<span class="table-sub">${escapeHtml(typeLabel(payment.type))}</span></td><td><span class="table-money">${payment.amountPaid < 0 ? '−' : ''}${money(Math.abs(payment.amountPaid))}</span>${payment.notes ? `<span class="table-sub">${escapeHtml(payment.notes)}</span>` : ''}</td><td><span class="table-money${payment.amountRemaining > 0 ? ' has-debt' : ''}">${money(payment.amountRemaining)}</span></td><td>${PAYMENT_LABELS[payment.paymentMethod] || escapeHtml(payment.paymentMethod || '—')}</td><td>${payment.amountPaid > 0 ? `<button class="btn btn-light btn-small payment-receipt-button" type="button" data-payment-receipt data-payment-id="${payment.id}" data-member-id="${data.member?.id || ''}">طباعة الإيصال</button>` : '—'}</td></tr>`; }).join('')}</tbody></table></div>` : '<div class="history-empty">لا توجد مدفوعات أو إيصالات مسجلة بعد.</div>'}`;
            $('detailsContent')?.appendChild(section);
        }

        async function openDetails(member) {
            const dialog = $('detailsDialog');
            dialog.dataset.memberId = String(member.id);
            const detailsCache = state.detailsCache || (state.detailsCache = new Map());
            $('detailsTitle').textContent = 'تفاصيل العميل';
            $('detailsSubtitle').textContent = `${member.fullName} · ${member.phone}`;
            $('detailsContent').innerHTML = '<div class="loading">جاري تحميل التفاصيل…</div>';
            if (typeof dialog.showModal === 'function') dialog.showModal(); else dialog.setAttribute('open', '');
            try {
                const cached = detailsCache.get(member.id);
                if (cached) {
                    renderDetails(cached); renderPaymentHistory(cached);
                    window.dispatchEvent(new CustomEvent('topgym:member-details-opened', { detail: { member, details: cached } }));
                }
                else {
                    const details = await withLoader(() => api(`/api/members/${member.id}/details`), 'جاري تحميل ملف العميل…');
                    detailsCache.set(member.id, details);
                    renderDetails(details);
                    renderPaymentHistory(details);
                    window.dispatchEvent(new CustomEvent('topgym:member-details-opened', { detail: { member, details } }));
                }
            } catch (error) {
                $('detailsContent').innerHTML = `<div class="empty">${escapeHtml(error.message)}</div>`;
                await notify(error.message, 'error');
            }
        }
        function closeDetails() { const dialog = $('detailsDialog'); if (typeof dialog.close === 'function' && dialog.open) dialog.close(); else dialog.removeAttribute('open'); }

        async function submitMember(event) {
            event.preventDefault();
            const id = $('memberId').value;
            const isNewMember = !id;
            const shouldSendWhatsApp = isNewMember && Boolean($('sendWhatsAppAfterSave')?.checked);
            const body = {
                fullName: $('fullName').value,
                phone: $('phone').value,
                email: $('email').value,
                registrationDate: $('registrationDate').value,
                notes: $('notes').value,
                membershipType: $('membershipType').value,
                membershipPlan: $('membershipPlan').value,
                startDate: $('startDate').value,
                endDate: $('endDate').value,
                membershipNotes: $('membershipNotes').value,
                discountAmount: Number($('discountAmount').value || 0),
                amountDue: Number($('amountDue').value || 0),
                amountPaid: Number($('amountPaid').value || 0),
                paymentMethod: $('paymentMethod').value
            };
            const button = $('saveButton');
            button.disabled = true;
            const whatsappWindow = shouldSendWhatsApp ? window.topGymWhatsapp?.prepareWindow(body.phone) : null;
            try {
                const saved = await withLoader(() => api(id ? `/api/members/${id}` : '/api/members', { method: id ? 'PUT' : 'POST', body: JSON.stringify(body) }), 'جاري حفظ بيانات TOP GYM…');
                setFormDefaults(true);
                if (shouldSendWhatsApp) {
                    await loadData();
                    window.dispatchEvent(new CustomEvent('topgym:member-created', { detail: { member: saved?.member || saved, payload: body, whatsappWindow, sendWhatsApp: true, isNew: !id, labels: { plan: planLabel(body.membershipPlan), type: typeLabel(body.membershipType), payment: PAYMENT_LABELS[body.paymentMethod] || body.paymentMethod } } }));
                } else {
                    await refreshAfterAction(id ? 'تم حفظ تعديلات العضو.' : 'تمت إضافة العضو بنجاح.');
                    if (!id) window.dispatchEvent(new CustomEvent('topgym:member-created', { detail: { member: saved?.member || saved, payload: body, sendWhatsApp: false, isNew: true } }));
                }
            } catch (error) {
                window.topGymWhatsapp?.closeWindow(whatsappWindow);
                if (error.code === 'DUPLICATE_MEMBER_PHONE' || error.field === 'phone') await showDuplicatePhoneValidation(error);
                else await notify(error.message, 'error');
            } finally {
                button.disabled = false;
            }
        }

        document.addEventListener('DOMContentLoaded', () => {
             setFormDefaults(); $('memberForm').addEventListener('submit', submitMember); $('refreshButton').addEventListener('click', loadData); $('topAddMemberButton').addEventListener('click', () => openMemberDialog()); $('addMemberButton').addEventListener('click', () => openMemberDialog()); $('topPricingButton').addEventListener('click', openPricingDialog); $('pricingButton').addEventListener('click', openPricingDialog); $('membershipTypesButton').addEventListener('click', openMembershipTypesDialog); $('memberDialogClose').addEventListener('click', closeMemberDialog); $('cancelEditButton').addEventListener('click', () => setFormDefaults(true)); $('resetButton').addEventListener('click', () => setFormDefaults(true)); $('actionForm').addEventListener('submit', submitDialog); $('dialogCancel').addEventListener('click', closeDialog); $('pricingForm').addEventListener('submit', savePricing); $('pricingClose').addEventListener('click', closePricingDialog); $('membershipTypesClose').addEventListener('click', closeMembershipTypesDialog); $('detailsClose').addEventListener('click', closeDetails); $('detailsContent').addEventListener('click', (event) => { const button = event.target.closest('[data-payment-receipt]'); if (!button) return; window.topGymPrint?.printPaymentReceipt(button.dataset.memberId, button.dataset.paymentId); }); $('addMembershipTypeButton').addEventListener('click', () => openMembershipTypeDialog()); $('membershipTypeDialogClose').addEventListener('click', closeMembershipTypeDialog); $('membershipTypeCancel').addEventListener('click', closeMembershipTypeDialog); $('membershipTypeForm').addEventListener('submit', submitMembershipType); ['membershipTypeName', 'membershipTypeMode', 'membershipTypeDuration', 'membershipTypeMultiplier'].forEach((id) => $(id).addEventListener('input', updateMembershipTypePreview)); $('membershipTypeMode').addEventListener('change', updateMembershipTypePreview); $('membershipTypesTableContainer').addEventListener('click', (event) => { const button = event.target.closest('[data-type-action="edit"]'); if (button) openMembershipTypeDialog(button.dataset.code); }); $('membershipType').addEventListener('change', () => { if (!state.endDateManual) $('endDate').value = calculatedEndDate($('startDate').value, $('membershipType').value); updateFormPricing(); }); $('membershipPlan').addEventListener('change', updateFormPricing); $('discountAmount').addEventListener('input', updateFormPricing); $('startDate').addEventListener('change', () => { if (!state.endDateManual) $('endDate').value = calculatedEndDate($('startDate').value, $('membershipType').value); }); $('endDate').addEventListener('input', () => { state.endDateManual = true; }); let timer; $('searchInput').addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(loadMembersOnly, 300); }); $('statusFilter').addEventListener('change', loadMembersOnly);
            $('membersList').addEventListener('click', async (event) => { const button = event.target.closest('button[data-action]'); if (!button) return; const id = button.dataset.id || button.closest('[data-member-id]')?.dataset.memberId; const member = state.members.find((item) => String(item.id) === String(id)); if (!member) { await notify('تعذر تحديد العضو. حدّث الصفحة وحاول مرة أخرى.', 'error'); return; } const action = button.dataset.action; if (action === 'details') { await openDetails(member); return; } if (action === 'edit') { openMemberDialog(member); return; } if (action === 'freeze' || action === 'renew' || action === 'payment') { openDialog(action, member); return; } if (action === 'resume') { try { await withLoader(() => api(`/api/members/${member.id}/resume`, { method: 'POST' }), 'جاري استئناف العضوية…'); await refreshAfterAction('تم استئناف العضوية.'); } catch (error) { await notify(error.message, 'error'); } return; } if (action === 'delete' && await confirmDelete(member.fullName)) { try { await withLoader(() => api(`/api/members/${member.id}`, { method: 'DELETE' }), 'جاري حذف العضو…'); if (String($('memberId').value) === String(member.id)) setFormDefaults(true); await refreshAfterAction('تم حذف العضو.'); } catch (error) { await notify(error.message, 'error'); } } });
            const membersQuickActionsObserver = new MutationObserver(() => decorateMemberQuickActions());
            membersQuickActionsObserver.observe($('membersList'), { childList: true, subtree: true });
            window.addEventListener('topgym:attendance-updated', () => loadMembersOnly());
            $('membersList').addEventListener('click', async (event) => {
                const button = event.target.closest('button[data-attendance-action]');
                if (!button || button.disabled) return;
                const action = button.dataset.attendanceAction;
                if (!window.topGymAttendance?.quickAction) {
                    await notify('أداة الحضور غير جاهزة. حدّث الصفحة وحاول مرة أخرى.', 'error');
                    return;
                }
                button.disabled = true;
                try {
                    await window.topGymAttendance.quickAction(action, { phone: button.dataset.phone });
                } finally {
                    if (button.isConnected) button.disabled = false;
                }
            });
            window.addEventListener('topgym:report-member-action', async (event) => {
                const action = event.detail?.action;
                const memberId = Number(event.detail?.id || 0);
                if (!memberId || !['details', 'payment'].includes(action)) return;
                let member = state.members.find((item) => Number(item.id) === memberId);
                try {
                    if (!member) {
                        const response = await api(`/api/members/${memberId}`);
                        member = response.member;
                    }
                    if (action === 'details') await openDetails(member);
                    if (action === 'payment') openDialog('payment', member);
                } catch (error) {
                    await notify(error.message || 'تعذر فتح بيانات المشترك.', 'error');
                }
            });
            window.addEventListener('topgym:tab-changed', (event) => {
                if (event.detail?.name === 'members') loadMembersOnly();
            });
            loadData();
        });
