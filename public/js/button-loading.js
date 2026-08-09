        (() => {
            const activeButtons = new Set();
            let latestClickedButton = null;
            let latestClickAt = 0;

            function stopButtonLoading(button) {
                const record = button && button.__topGymLoading;
                if (!record || record.stopped) return;
                record.stopped = true;
                activeButtons.delete(button);
                clearTimeout(record.finishTimer);
                clearTimeout(record.safetyTimer);
                button.innerHTML = record.originalHtml;
                button.classList.remove('is-loading');
                button.removeAttribute('aria-busy');
                delete button.dataset.loading;
                button.disabled = record.wasDisabled;
                delete button.__topGymLoading;
            }

            function scheduleButtonStop(button, delay = 220) {
                const record = button && button.__topGymLoading;
                if (!record || record.stopped) return;
                clearTimeout(record.finishTimer);
                record.finishTimer = setTimeout(() => {
                    if (record.pendingFetches === 0) stopButtonLoading(button);
                }, delay);
            }

            function startButtonLoading(button) {
                if (!button || button.dataset.loading === 'true') return button?.__topGymLoading;
                const record = {
                    originalHtml: button.innerHTML,
                    wasDisabled: button.disabled,
                    pendingFetches: 0,
                    stopped: false,
                    finishTimer: null,
                    safetyTimer: null
                };
                button.__topGymLoading = record;
                activeButtons.add(button);
                latestClickedButton = button;
                latestClickAt = Date.now();
                button.dataset.loading = 'true';
                button.classList.add('is-loading');
                button.setAttribute('aria-busy', 'true');
                setTimeout(() => {
                    if (button.__topGymLoading === record && !record.stopped) button.disabled = true;
                }, 0);
                record.safetyTimer = setTimeout(() => stopButtonLoading(button), 30000);
                scheduleButtonStop(button);
                return record;
            }

            function buttonForFetch() {
                if (latestClickedButton && Date.now() - latestClickAt < 3000 && activeButtons.has(latestClickedButton)) {
                    return latestClickedButton;
                }
                return [...activeButtons].reverse().find((button) => button.form?.__topGymLoadingButton === button) || null;
            }

            const originalFetch = window.fetch.bind(window);
            window.fetch = (...args) => {
                const button = buttonForFetch();
                const record = button?.__topGymLoading;
                if (record && !record.stopped) {
                    record.pendingFetches += 1;
                    clearTimeout(record.finishTimer);
                }
                return originalFetch(...args).finally(() => {
                    if (record && !record.stopped) {
                        record.pendingFetches = Math.max(0, record.pendingFetches - 1);
                        scheduleButtonStop(button, 260);
                    }
                });
            };

            document.addEventListener('click', (event) => {
                const button = event.target.closest?.('button');
                if (!button) return;
                if (button.dataset.loading === 'true') {
                    event.preventDefault();
                    event.stopImmediatePropagation();
                    return;
                }
                const record = startButtonLoading(button);
                if (record && button.form) button.form.__topGymLoadingButton = button;
            }, true);

            document.addEventListener('submit', (event) => {
                const form = event.target;
                const button = event.submitter || form.__topGymLoadingButton || form.querySelector('button[type="submit"]');
                if (!button) return;
                const record = startButtonLoading(button);
                if (record) form.__topGymLoadingButton = button;
            }, true);

            window.topGymStopButtonLoading = stopButtonLoading;
        })();

        (() => {
            const planTableContainer = document.getElementById('pricingTableContainer');
            const planDialog = document.getElementById('membershipPlanDialog');
            if (!planTableContainer || !planDialog) return;

            function planEntries() {
                return Object.entries(state.pricing.plans || {}).sort(([, first], [, second]) => Number(first.sortOrder || 0) - Number(second.sortOrder || 0));
            }

            function enhancePricingTable() {
                const table = planTableContainer.querySelector('table.pricing-table');
                if (!table) return;
                const header = table.querySelector('thead tr');
                if (header && !header.querySelector('[data-plan-status-heading]')) {
                    header.insertAdjacentHTML('beforeend', '<th data-plan-status-heading>الحالة</th><th data-plan-action-heading>الإجراء</th>');
                }
                table.querySelectorAll('tbody tr[data-plan]').forEach((row) => {
                    if (row.querySelector('[data-plan-status]')) return;
                    const plan = state.pricing.plans?.[row.dataset.plan] || {};
                    const status = document.createElement('td');
                    status.dataset.planStatus = 'true';
                    status.innerHTML = plan.active === false ? '<span class="type-status off">غير ظاهر</span>' : '<span class="type-status">نشطة</span>';
                    const action = document.createElement('td');
                    action.innerHTML = `<div class="pricing-actions"><button class="btn btn-light btn-small" type="button" data-plan-action="edit" data-code="${escapeHtml(row.dataset.plan)}">تعديل</button></div>`;
                    row.append(status, action);
                });
            }

            function syncVisiblePlanOptions() {
                document.querySelectorAll('#membershipPlan, #dialogPlan').forEach((select) => {
                    const current = select.value;
                    const preserveHistorical = (select.id === 'membershipPlan' && document.getElementById('memberId')?.value) || (select.id === 'dialogPlan' && state.dialogMember);
                    [...select.options].forEach((option) => {
                        if (state.pricing.plans?.[option.value]?.active === false && !(preserveHistorical && option.value === current)) option.remove();
                    });
                    if (!select.value && select.options.length) select.selectedIndex = 0;
                });
            }

            function ensureHistoricalPlanOption(code) {
                if (!code) return;
                const plan = state.pricing.plans?.[code];
                if (!plan || plan.active !== false) return;
                document.querySelectorAll('#membershipPlan, #dialogPlan').forEach((select) => {
                    if (!select.querySelector(`option[value="${CSS.escape(code)}"]`)) {
                        select.insertAdjacentHTML('beforeend', `<option value="${escapeHtml(code)}">${escapeHtml(plan.label)} (تاريخية)</option>`);
                    }
                    select.value = code;
                });
            }

            function updatePlanPreview() {
                const name = document.getElementById('membershipPlanName').value.trim() || 'باقة جديدة';
                const price = Number(document.getElementById('membershipPlanPrice').value || 0);
                const halfMonth = price * Number(state.pricing.types?.half_month?.priceMultiplier || .5);
                document.getElementById('membershipPlanPreview').textContent = `${name} · شهري: ${money(price)} · نصف شهر: ${money(halfMonth)}`;
            }

            function openPlanDialog(code = '') {
                const plan = code ? state.pricing.plans?.[code] : null;
                const generatedCode = `custom_${Date.now().toString(36)}`;
                document.getElementById('editingMembershipPlanCode').value = plan ? code : '';
                document.getElementById('membershipPlanDialogTitle').textContent = plan ? 'تعديل الباقة' : 'إضافة باقة جديدة';
                document.getElementById('membershipPlanDialogDescription').textContent = plan ? 'عدّل الاسم أو السعر أو حالة ظهور الباقة مع الاحتفاظ بالاشتراكات السابقة.' : 'أدخل بيانات الباقة الجديدة لتظهر مباشرة عند إضافة أو تجديد الاشتراك.';
                document.getElementById('membershipPlanCode').value = plan ? code : generatedCode;
                document.getElementById('membershipPlanCode').readOnly = Boolean(plan);
                document.getElementById('membershipPlanName').value = plan?.label || '';
                document.getElementById('membershipPlanPrice').value = plan?.monthlyPrice ?? '';
                document.getElementById('membershipPlanSortOrder').value = plan?.sortOrder ?? (planEntries().length + 1);
                document.getElementById('membershipPlanActive').checked = plan?.active !== false;
                updatePlanPreview();
                if (typeof planDialog.showModal === 'function') planDialog.showModal(); else planDialog.setAttribute('open', '');
            }

            function closePlanDialog() {
                if (typeof planDialog.close === 'function' && planDialog.open) planDialog.close(); else planDialog.removeAttribute('open');
            }

            async function submitPlan(event) {
                event.preventDefault();
                const editingCode = document.getElementById('editingMembershipPlanCode').value;
                const body = {
                    planCode: document.getElementById('membershipPlanCode').value.trim().toLowerCase(),
                    planName: document.getElementById('membershipPlanName').value,
                    monthlyPrice: Number(document.getElementById('membershipPlanPrice').value),
                    sortOrder: Number(document.getElementById('membershipPlanSortOrder').value || 0),
                    isActive: document.getElementById('membershipPlanActive').checked
                };
                const button = event.submitter || event.currentTarget.__topGymLoadingButton || document.getElementById('membershipPlanSave');
                try {
                    state.pricing = await api(editingCode ? `/api/pricing-plans/${encodeURIComponent(editingCode)}` : '/api/pricing-plans', { method: editingCode ? 'PUT' : 'POST', body: JSON.stringify(body) });
                    syncPlanOptions();
                    syncVisiblePlanOptions();
                    renderPricingTable();
                    renderMembershipTypesTable();
                    updateFormPricing();
                    closePlanDialog();
                    await notify(editingCode ? 'تم تعديل الباقة.' : 'تمت إضافة الباقة.');
                } catch (error) {
                    await notify(error.message, 'error');
                } finally {
                    window.topGymStopButtonLoading?.(button);
                }
            }

            const observer = new MutationObserver(enhancePricingTable);
            observer.observe(planTableContainer, { childList: true, subtree: true });
            const optionObserver = new MutationObserver(syncVisiblePlanOptions);
            optionObserver.observe(document.body, { childList: true, subtree: true });

            document.addEventListener('DOMContentLoaded', () => {
                document.getElementById('addMembershipPlanButton').addEventListener('click', () => openPlanDialog());
                document.getElementById('membershipPlanDialogClose').addEventListener('click', closePlanDialog);
                document.getElementById('membershipPlanCancel').addEventListener('click', closePlanDialog);
                document.getElementById('membershipPlanForm').addEventListener('submit', submitPlan);
                ['membershipPlanName', 'membershipPlanPrice'].forEach((id) => document.getElementById(id).addEventListener('input', updatePlanPreview));
                planTableContainer.addEventListener('click', (event) => {
                    const button = event.target.closest('[data-plan-action="edit"]');
                    if (button) openPlanDialog(button.dataset.code);
                });
                document.addEventListener('click', (event) => {
                    const button = event.target.closest('button[data-action]');
                    if (!button) return;
                    const id = button.dataset.id || button.closest('[data-member-id]')?.dataset.memberId;
                    const member = state.members.find((item) => String(item.id) === String(id));
                    if ((button.dataset.action === 'edit' || button.dataset.action === 'renew' || button.dataset.action === 'payment') && member?.membership?.plan) {
                        setTimeout(() => ensureHistoricalPlanOption(member.membership.plan), 0);
                    }
                }, true);
                syncVisiblePlanOptions();
                enhancePricingTable();
            });
        })();
