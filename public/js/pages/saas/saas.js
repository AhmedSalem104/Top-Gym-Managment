(() => {
    if (window.__topGymSaasBillingLoaded) return;
    window.__topGymSaasBillingLoaded = true;

    const $ = (id) => document.getElementById(id);
    const escapeHtml = (value) => String(value ?? '').replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[character]));
    const t = (key, params) => window.TopGymI18n?.t(key, params) || key;
    const formatNumber = (value, options) => window.TopGymI18n?.format('number', value, options) ?? new Intl.NumberFormat('ar-EG', options).format(Number(value));
    function formatDate(value) {
        if (!value) return t('saasBilling.summary.notSpecified');
        const raw = String(value);
        const dateOnly = /^(\d{4})-(\d{2})-(\d{2})(?:$|T)/u.exec(raw);
        if (dateOnly) return `${dateOnly[3]}/${dateOnly[2]}/${dateOnly[1]}`;
        const parsed = new Date(raw);
        if (Number.isNaN(parsed.getTime())) return raw;
        const parts = new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC' }).formatToParts(parsed);
        const part = (type) => parts.find((item) => item.type === type)?.value || '';
        return `${part('day')}/${part('month')}/${part('year')}`;
    }
    const state = { billing: null, plans: [], requests: [], pendingRequest: null, optimisticRequests: new Map(), requestsPagination: {}, requestPage: 1, loaded: false, loading: false, refreshAfterLoad: false, submitting: false, termSelections: {}, uiMessageKey: null };

    function notify(message, error = false, type = '') {
        if (typeof window.showToast === 'function') window.showToast(message, error, type || (error ? 'error' : 'success'));
        else window.alert(message);
    }

    function date(value) { return value ? formatDate(value) : t('saasBilling.summary.notSpecified'); }

    function money(value, currency = 'EGP') {
        const amount = formatNumber(Number(value || 0));
        const displayCurrency = currency === 'EGP' && window.TopGymI18n?.get() === 'ar' ? 'ج.م' : currency;
        return `${amount} ${displayCurrency}`;
    }
    function statusLabel(status) {
        const key = `saasBilling.status.${String(status || '').toLowerCase()}`;
        const label = t(key);
        return label !== key ? label : (status || t('saasBilling.summary.notSpecified'));
    }
    function statusMarkup(status, className = 'saas-status') { const value = String(status || '').toLowerCase(); return `<span class="${className}" data-status="${escapeHtml(value)}">${escapeHtml(statusLabel(value))}</span>`; }
    function limit(value) { return value == null ? t('saasBilling.common.unlimited') : formatNumber(value); }

    const termKeys = Object.freeze({ monthly: 'monthly', quarterly: 'quarterly', semiannual: 'semiannual', annual: 'annual' });
    function termName(code) { const key = termKeys[code]; return key ? t(`saasBilling.plans.${key}`) : String(code || ''); }
    function planTerms(plan) {
        return Array.isArray(plan?.terms) ? plan.terms.filter((term) => term.isActive !== false) : [];
    }
    function selectedTerm(plan) {
        const terms = planTerms(plan);
        const selectedCode = state.termSelections[String(plan?.id)] || (terms.find((term) => term.code === 'monthly')?.code || terms[0]?.code);
        return terms.find((term) => term.code === selectedCode) || terms[0] || null;
    }
    function termLabel(term) { return term ? `${termName(term.code) || t('saasBilling.plans.term')} · ${t('saasBilling.plans.duration', { count: Number(term.durationMonths || 0) })}` : t('saasBilling.plans.termUnavailable'); }
    function termAmountDue(term) { return Math.max(0, Math.round((Number(term?.price || 0) - Number(term?.discountAmount || 0)) * 100) / 100); }
    function termSelectMarkup(plan) {
        const selected = selectedTerm(plan)?.code;
        const terms = planTerms(plan);
        if (!terms.length) return `<p class="saas-muted">${escapeHtml(t('saasBilling.plans.termUnavailable'))}</p>`;
        return `<label class="saas-term-control"><span>${escapeHtml(t('saasBilling.plans.term'))}</span><select data-saas-term-plan="${escapeHtml(plan.id)}" aria-label="${escapeHtml(t('saasBilling.plans.termFor', { name: plan.name }))}">${terms.map((term) => `<option value="${escapeHtml(term.code)}" ${term.code === selected ? 'selected' : ''}>${escapeHtml(termLabel(term))} — ${escapeHtml(money(termAmountDue(term), term.currency))}</option>`).join('')}</select></label>`;
    }

    function showMessage(message, error = false, messageKey = null) {
        const element = $('saasSubscriptionMessage');
        if (!element) return;
        state.uiMessageKey = messageKey;
        element.textContent = message || '';
        element.hidden = !message;
        element.classList.toggle('is-error', error);
    }

    function setText(selector, key, root = $('saasBillingSection')) {
        const scopes = [root, document.querySelector('.saas-request-dialog')].filter((scope, index, all) => scope && all.indexOf(scope) === index);
        scopes.forEach((scope) => scope.querySelectorAll(selector).forEach((element) => { element.textContent = t(key); }));
    }

    function setLabelText(selector, key) {
        const element = document.querySelector(selector);
        if (!element) return;
        const textNode = [...element.childNodes].find((node) => node.nodeType === Node.TEXT_NODE);
        if (textNode) textNode.nodeValue = `${t(key)} `;
        else element.insertBefore(document.createTextNode(`${t(key)} `), element.firstChild);
    }

    function applyStaticTranslations() {
        const root = $('saasBillingSection');
        if (!root) return;
        [['.saas-page-heading .saas-eyebrow', 'saasBilling.page.kicker'], ['#saasBillingTitle', 'saasBilling.page.title']]
            .forEach(([selector, key]) => setText(selector, key));
        const pageDescription = root.querySelector('.saas-page-heading p');
        if (pageDescription) pageDescription.textContent = t('saasBilling.page.description');
        const pageNav = root.querySelector('.saas-page-header-nav');
        if (pageNav) pageNav.setAttribute('aria-label', t('saasBilling.navigation.aria'));
        setText('.saas-back-button span', 'saasBilling.navigation.back');
        setText('.saas-breadcrumb span', 'saasBilling.navigation.platform');
        setText('.saas-breadcrumb strong', 'saasBilling.navigation.current');

        setText('.saas-plans-panel .saas-eyebrow', 'saasBilling.plans.kicker');
        setText('#saasPlansTitle', 'saasBilling.plans.title');
        const plansDescription = root.querySelector('.saas-plans-panel .saas-panel-head p');
        if (plansDescription) plansDescription.textContent = t('saasBilling.plans.description');
        setText('.saas-plans-panel .saas-panel-badge', 'saasBilling.plans.compare');
        setText('.saas-request-panel .saas-eyebrow', 'saasBilling.review.kicker');
        setText('#saasRequestTitle', 'saasBilling.review.title');
        const requestDescription = document.getElementById('saasRequestTitle')?.closest('.modal-header, .saas-panel-head')?.querySelector('p');
        if (requestDescription) requestDescription.textContent = t('saasBilling.review.description');
        setText('.saas-request-panel .saas-panel-badge.is-secure', 'saasBilling.review.secureUpload');
        setLabelText('label[for="saasPlanSelect"]', 'saasBilling.form.plan');
        setLabelText('label[for="saasTermSelect"]', 'saasBilling.form.term');
        setLabelText('label[for="saasRequestNotes"]', 'saasBilling.form.notes');
        setText('label[for="saasRequestNotes"] .saas-muted', 'saasBilling.form.optional');
        const notes = $('saasRequestNotes');
        if (notes) notes.placeholder = t('saasBilling.form.notesPlaceholder');
        setLabelText('label[for="saasPaymentProof"]', 'saasBilling.form.proof');
        setText('label[for="saasPaymentProof"] .saas-muted', 'saasBilling.form.proofHint');
        setText('.saas-upload-box strong', 'saasBilling.form.uploadProof');
        setText('.saas-upload-box div small', 'saasBilling.form.allowedTypes');
        const selectedFile = $('saasPaymentProof')?.files?.[0];
        if (!selectedFile) setText('.file-upload-control-name', 'saasBilling.form.noFile');
        setText('.file-upload-control-trigger', 'saasBilling.form.chooseFile');
        const submit = $('saasSubscriptionSubmit');
        if (submit) {
            submit.dataset.loadingText = t('saasBilling.form.submitLoading');
            const loadingLabel = submit.querySelector('.logicfit-button-label');
            if (state.submitting && loadingLabel) {
                loadingLabel.textContent = submit.dataset.loadingText;
            } else if (!state.submitting) {
                submit.textContent = t('saasBilling.form.submit');
            }
        }
        setText('.saas-requests-panel .saas-eyebrow', 'saasBilling.requests.kicker');
        setText('#saasRequestsTitle', 'saasBilling.requests.title');
        const historyDescription = root.querySelector('.saas-requests-panel .saas-panel-head p');
        if (historyDescription) historyDescription.textContent = t('saasBilling.requests.description');
        if (!state.loaded) {
            const summaryLoading = root.querySelector('#saasSubscriptionSummary .saas-loading-block');
            if (summaryLoading) summaryLoading.textContent = t('saasBilling.summary.loading');
            const plansLoading = root.querySelector('#saasPlansList .saas-empty');
            if (plansLoading) plansLoading.textContent = t('saasBilling.plans.loading');
            const requestsLoading = root.querySelector('#saasRequestsList .saas-empty');
            if (requestsLoading) requestsLoading.textContent = t('saasBilling.requests.loading');
        }
        const headings = root.querySelectorAll('.saas-requests-panel thead th');
        ['date', 'plan', 'duration', 'amount', 'status', 'proof', 'reviewNotes'].forEach((key, index) => {
            if (headings[index]) headings[index].textContent = t(`saasBilling.requests.${key}`);
        });
        const dialog = document.querySelector('.saas-request-dialog');
        const close = dialog?.querySelector('.dialog-close-button');
        if (close) {
            close.setAttribute('aria-label', t('saasBilling.form.close'));
            close.setAttribute('title', t('saasBilling.form.closeButton'));
        }
        const eyebrow = dialog?.querySelector('.modal-header .saas-eyebrow');
        if (eyebrow) eyebrow.textContent = t('saasBilling.form.reviewPlatform');
        const title = dialog?.querySelector('#saasRequestTitle');
        if (title) title.textContent = t('saasBilling.form.renewTitle');
        const description = dialog?.querySelector('.modal-header p');
        if (description) description.textContent = t('saasBilling.form.renewDescription');
        const termSummary = $('saasRequestPriceSummary');
        if (!termSummary?.querySelector('[data-saas-selected-plan]')) {
            const totalLabel = termSummary?.querySelector('span');
            const chooseLabel = termSummary?.querySelector('strong');
            if (totalLabel) totalLabel.textContent = t('saasBilling.form.totalPlatform');
            if (chooseLabel) chooseLabel.textContent = t('saasBilling.form.choosePlanTerm');
        }
        const actionBar = root.querySelector('.saas-plan-action-bar');
        const actionBarParts = actionBar?.querySelectorAll('div > span, div > strong, button span:last-child');
        if (actionBarParts?.[0]) actionBarParts[0].textContent = t('saasBilling.form.manageTitle');
        if (actionBarParts?.[1]) actionBarParts[1].textContent = t('saasBilling.form.managePrompt');
        const openRequest = actionBar?.querySelector('button span:last-child');
        if (openRequest) openRequest.textContent = t('saasBilling.form.openRequest');
        const message = $('saasSubscriptionMessage');
        if (message && state.uiMessageKey) message.textContent = t(state.uiMessageKey);
    }

    function renderLocalizedBilling() {
        const root = $('saasBillingSection');
        if (!root) return;
        const planSelect = $('saasPlanSelect');
        const termSelect = $('saasTermSelect');
        const selectedPlanId = planSelect?.value || '';
        const selectedTermCode = termSelect?.value || '';
        if (selectedPlanId && selectedTermCode) state.termSelections[String(selectedPlanId)] = selectedTermCode;
        if (state.loaded) {
            renderSummary(state.billing);
            renderPlans(state.plans);
            renderRequests(state.requests);
            renderRequestPagination();
            renderPendingRequest(state.pendingRequest);
            if (selectedPlanId) selectPlan(selectedPlanId, selectedTermCode || null);
            renderRequestPricing();
        }
        applyStaticTranslations();
    }

    function renderSummary(billing) {
        const host = $('saasSubscriptionSummary');
        const status = billing?.subscription?.status || billing?.tenant?.status || 'expired';
        const subscription = billing?.subscription;
        const plan = subscription?.plan;
        const statusHost = $('saasSubscriptionStatus');
        if (statusHost) { statusHost.textContent = statusLabel(status); statusHost.dataset.status = status; }
        if (!host) return;
        if (!billing?.tenant) { host.innerHTML = `<div class="saas-loading-block">${escapeHtml(t('saasBilling.summary.gymNotFound'))}</div>`; return; }
        const daysRemaining = subscription?.daysRemaining;
        const startsAt = subscription?.startsAt || subscription?.startDate || null;
        const expiresAt = subscription?.expiresAt || subscription?.endDate || null;
        host.innerHTML = `<article class="saas-summary-card saas-summary-gym"><span>${escapeHtml(t('saasBilling.summary.gym'))}</span><strong data-i18n-preserve>${escapeHtml(billing.tenant.name)}</strong><p dir="ltr" data-i18n-preserve>${escapeHtml(billing.tenant.slug)}</p></article><article class="saas-summary-card saas-summary-status"><div class="saas-summary-card-top"><span>${escapeHtml(t('saasBilling.summary.status'))}</span>${subscription ? statusMarkup(subscription.status) : statusMarkup('expired')}</div><strong>${escapeHtml(subscription ? statusLabel(subscription.status) : t('saasBilling.summary.noSubscription'))}</strong><p>${daysRemaining == null ? escapeHtml(t('saasBilling.summary.expiryUnknown')) : escapeHtml(t('saasBilling.summary.daysRemaining', { count: Math.max(0, daysRemaining) }))}</p></article><article class="saas-summary-card"><span>${escapeHtml(t('saasBilling.summary.currentPlan'))}</span><strong data-i18n-preserve>${escapeHtml(plan?.name || t('saasBilling.summary.noPlan'))}</strong><p>${escapeHtml(plan?.billingPeriod === 'yearly' ? t('saasBilling.summary.yearlyCycle') : plan?.billingPeriod === 'monthly' ? t('saasBilling.summary.monthlyCycle') : t('saasBilling.summary.subscriptionDetails'))}</p></article><article class="saas-summary-card saas-summary-dates"><div><span>${escapeHtml(t('saasBilling.summary.startDate'))}</span><strong><bdi dir="ltr">${escapeHtml(startsAt ? date(startsAt) : t('saasBilling.summary.notSpecified'))}</bdi></strong></div><div><span>${escapeHtml(t('saasBilling.summary.endDate'))}</span><strong><bdi dir="ltr">${escapeHtml(expiresAt ? date(expiresAt) : t('saasBilling.summary.notSpecified'))}</bdi></strong></div></article><article class="saas-summary-card"><span>${escapeHtml(t('saasBilling.summary.memberUsage'))}</span><strong>${escapeHtml(formatNumber(Number(billing.usage?.members || 0)))}</strong><p>${escapeHtml(t('saasBilling.summary.limitMembers', { count: limit(plan?.maxMembers) }))}</p></article>`;
        renderRequestContext();
    }

    function renderRequestContext() {
        const host = $('saasRequestCurrent');
        if (!host) return;
        const subscription = state.billing?.subscription;
        const plan = subscription?.plan;
        host.innerHTML = plan
            ? `<div><small>${escapeHtml(t('saasBilling.current.title'))}</small><strong data-i18n-preserve>${escapeHtml(plan.name)}</strong><span>${escapeHtml(statusLabel(subscription.status))}${subscription.expiresAt ? ` · ${escapeHtml(t('saasBilling.summary.until', { date: date(subscription.expiresAt) }))}` : ''}</span></div>`
            : `<div><small>${escapeHtml(t('saasBilling.current.title'))}</small><strong>${escapeHtml(t('saasBilling.current.noActivePlan'))}</strong><span>${escapeHtml(t('saasBilling.current.choosePlanHint'))}</span></div>`;
    }

    function renderPendingRequest(request) {
        const host = $('saasPendingRequestState');
        const trigger = document.querySelector('.saas-request-open');
        state.pendingRequest = request && ['pending', 'under_review'].includes(String(request.status || '').toLowerCase()) ? request : null;
        const actionBar = document.querySelector('.saas-plan-action-bar');
        const createUnavailable = Boolean(state.pendingRequest) || !state.loaded;
        if (actionBar) actionBar.hidden = createUnavailable;
        if (trigger) trigger.hidden = createUnavailable;
        if (!host) return;
        host.hidden = !state.pendingRequest;
        if (!state.pendingRequest) return;
        const pending = state.pendingRequest;
        const planName = pending.plan?.name || pending.planName || '—';
        const duration = Number(pending.durationMonths || pending.duration_months || 0);
        host.innerHTML = `<div class="saas-panel-head"><div><span class="saas-eyebrow">${escapeHtml(t('saasBilling.pending.kicker'))}</span><h4>${escapeHtml(t('saasBilling.pending.title'))}</h4><p>${escapeHtml(t('saasBilling.pending.description'))}</p></div>${statusMarkup(pending.status)}</div><p data-saas-pending-duration="${duration}"><strong data-i18n-preserve>${escapeHtml(planName)}</strong> · ${escapeHtml(formatNumber(duration))} ${escapeHtml(t(duration === 1 ? 'saasBilling.pending.month' : 'saasBilling.pending.months'))} · ${escapeHtml(money(pending.amount, pending.currency))}</p><p class="saas-muted">${escapeHtml(t('saasBilling.pending.sentAt', { date: date(pending.createdAt || pending.created_at) }))} · ${escapeHtml(t('saasBilling.requests.proof'))}: ${escapeHtml(t(pending.proof ? 'saasBilling.pending.proofAttached' : 'saasBilling.pending.proofMissing'))}</p>`;
    }

    async function refreshPendingRequest() {
        const data = await window.topGymAuth.api('/api/saas/subscription-requests?page=1&pageSize=1');
        const latest = Array.isArray(data?.requests) ? data.requests : [];
        const pending = latest.find((request) => ['pending', 'under_review'].includes(String(request.status || '').toLowerCase())) || null;
        renderPendingRequest(pending);
        return pending;
    }

    function renderPlans(plans) {
        const host = $('saasPlansList');
        const select = $('saasPlanSelect');
        const subscriptionPlan = state.billing?.subscription?.plan || null;
        const subscriptionPlanId = subscriptionPlan?.id ?? state.billing?.subscription?.planId ?? null;
        const subscriptionPlanCode = String(subscriptionPlan?.code || state.billing?.subscription?.planCode || '').trim().toLowerCase();
        const subscriptionPlanName = String(subscriptionPlan?.name || '').trim().toLowerCase();
        const uniquePlans = new Map();
        const planKey = (plan) => {
            const code = String(plan?.code || '').trim().toLowerCase();
            if (code) return `code:${code}`;
            if (plan?.id != null) return `id:${String(plan.id)}`;
            const name = String(plan?.name || '').trim().toLowerCase();
            return name ? `name:${name}|${String(plan?.billingPeriod || '').toLowerCase()}` : '';
        };
        const planMatchesCurrent = (plan) => {
            if (subscriptionPlanId != null && String(plan?.id) === String(subscriptionPlanId)) return true;
            if (subscriptionPlanCode && String(plan?.code || '').trim().toLowerCase() === subscriptionPlanCode) return true;
            return !subscriptionPlanId && !subscriptionPlanCode && subscriptionPlanName && String(plan?.name || '').trim().toLowerCase() === subscriptionPlanName;
        };
        const addPlan = (plan) => {
            const key = planKey(plan);
            if (!key || uniquePlans.has(key)) return;
            uniquePlans.set(key, plan);
        };
        (plans || []).forEach((plan) => {
            addPlan(plan);
        });
        // The current subscription is a real plan from the API, not a second
        // catalog entry. Keep it visible once even if the active catalog no
        // longer returns it, so the select and comparison always reflect the
        // tenant's actual subscription.
        if (subscriptionPlan && ![...uniquePlans.values()].some(planMatchesCurrent)) addPlan(subscriptionPlan);
        const availablePlans = [...uniquePlans.values()].filter((plan) => planTerms(plan).length > 0);
        const currentPlan = availablePlans.find(planMatchesCurrent) || null;
        const currentPlanId = currentPlan?.id ?? subscriptionPlanId;
        const activePlans = availablePlans.filter((plan) => plan.isActive !== false);
        const requestPlans = currentPlan && !activePlans.some((plan) => String(plan.id) === String(currentPlan.id))
            ? [currentPlan, ...activePlans]
            : activePlans;
        if (select) {
            const hasCurrentPlan = requestPlans.some((plan) => String(plan.id) === String(currentPlanId));
            select.innerHTML = `<option value="">${escapeHtml(t('saasBilling.plans.choosePlaceholder'))}</option>${requestPlans.map((plan) => `<option value="${plan.id}" ${String(plan.id) === String(currentPlanId) ? 'selected' : ''}>${escapeHtml(plan.name)}${String(plan.id) === String(currentPlanId) ? ` · ${escapeHtml(t('saasBilling.plans.current'))}` : ''}</option>`).join('')}`;
            select.disabled = !requestPlans.length;
            select.value = hasCurrentPlan ? String(currentPlanId) : '';
        }
        if (!host) return;
        if (!availablePlans.length) { host.innerHTML = `<div class="saas-empty">${escapeHtml(t('saasBilling.plans.empty'))}</div>`; return; }
        const selectedId = currentPlan?.id ?? null;
        host.innerHTML = availablePlans.map((plan) => {
            const isCurrent = String(plan.id) === String(currentPlanId);
            const isSelected = String(plan.id) === String(selectedId);
            const term = selectedTerm(plan);
            return `<article class="saas-plan-card ${isSelected ? 'is-selected' : ''} ${isCurrent ? 'is-current' : ''}" data-saas-plan-card="${plan.id}" ${isCurrent ? `aria-current="true" data-current-label="${escapeHtml(t('saasBilling.plans.current'))}"` : ''}>${isCurrent ? `<span class="saas-plan-current-badge">${escapeHtml(t('saasBilling.plans.current'))}</span>` : ''}<div class="saas-plan-card-heading"><h5 data-i18n-preserve>${escapeHtml(plan.name)}</h5><span class="saas-muted" data-i18n-preserve>${escapeHtml(plan.description || '')}</span></div>${termSelectMarkup(plan)}<div class="saas-plan-price">${money(termAmountDue(term), term.currency)} <small>/ ${escapeHtml(termLabel(term))}</small></div><ul class="saas-plan-limits"><li><span>${escapeHtml(t('saasBilling.plans.members'))}</span><strong>${limit(plan.maxMembers)}</strong></li><li><span>${escapeHtml(t('saasBilling.plans.clients'))}</span><strong>${limit(plan.maxClients)}</strong></li><li><span>${escapeHtml(t('saasBilling.plans.users'))}</span><strong>${limit(plan.maxUsers)}</strong></li><li><span>${escapeHtml(t('saasBilling.plans.aiMonthly'))}</span><strong>${limit(plan.maxAiGenerations)}</strong></li><li><span>${escapeHtml(t('saasBilling.plans.branches'))}</span><strong>${limit(plan.maxBranches)}</strong></li><li><span>${escapeHtml(t('saasBilling.plans.storage'))}</span><strong>${limit(plan.maxStorageMb)} MB</strong></li></ul><button class="btn ${isCurrent ? 'btn-current-plan' : 'btn-light'} btn-small" type="button" data-saas-select-plan="${plan.id}" ${isCurrent ? 'disabled aria-pressed="true"' : ''}>${escapeHtml(t(isCurrent ? 'saasBilling.plans.current' : 'saasBilling.plans.select'))}</button></article>`;
        }).join('');
        host.querySelectorAll('[data-saas-term-plan]').forEach((termSelect) => {
            const plan = availablePlans.find((item) => String(item.id) === termSelect.dataset.saasTermPlan);
            if (!plan) return;
            [...termSelect.options].forEach((option) => {
                const term = planTerms(plan).find((item) => item.code === option.value);
                if (term) option.textContent = `${termLabel(term)} — ${money(termAmountDue(term), term.currency)}`;
            });
            const selected = selectedTerm(plan);
            const price = termSelect.closest('.saas-plan-card')?.querySelector('.saas-plan-price');
            if (selected && price) price.textContent = `${money(termAmountDue(selected), selected.currency)} / ${termLabel(selected)}`;
        });
        if (select) {
            select.value = selectedId == null ? '' : String(selectedId);
            if (select.value) selectPlan(select.value);
            else renderRequestPricing();
        }
    }

    function setupPaymentProofUpload() {
        const input = $('saasPaymentProof');
        const box = input?.closest('.saas-upload-box');
        if (!input || !box || box.dataset.uploadReady === 'true') return;
        box.dataset.uploadReady = 'true';
        box.classList.add('file-upload-control');
        box.setAttribute('role', 'group');
        box.querySelector('.saas-upload-icon')?.classList.replace('saas-upload-icon', 'file-upload-control-icon');
        const copy = box.querySelector('div');
        const uploadHint = copy?.querySelector('small');
        if (uploadHint) uploadHint.textContent = t('saasBilling.form.allowedTypes');
        const fileName = document.createElement('span');
        fileName.className = 'file-upload-control-name';
        fileName.setAttribute('aria-live', 'polite');
        fileName.textContent = t('saasBilling.form.noFile');
        copy?.appendChild(fileName);
        const trigger = document.createElement('button');
        trigger.className = 'file-upload-control-trigger';
        trigger.type = 'button';
        trigger.textContent = t('saasBilling.form.chooseFile');
        trigger.addEventListener('click', () => input.click());
        box.appendChild(trigger);
        input.classList.add('visually-hidden');
        const update = (file) => {
            box.classList.toggle('has-file', Boolean(file));
            fileName.textContent = file ? `${file.name} · ${Math.max(1, Math.round(file.size / 1024))} KB` : t('saasBilling.form.noFile');
        };
        input.addEventListener('change', () => update(input.files?.[0]));
        box.addEventListener('dragover', (event) => { event.preventDefault(); box.classList.add('is-dragging'); });
        box.addEventListener('dragleave', () => box.classList.remove('is-dragging'));
        box.addEventListener('drop', (event) => {
            event.preventDefault();
            box.classList.remove('is-dragging');
            const file = event.dataTransfer?.files?.[0];
            if (!file) return;
            const transfer = new DataTransfer();
            transfer.items.add(file);
            input.files = transfer.files;
            update(file);
        });
    }

    function setupRequestDialog() {
        const page = $('saasBillingSection');
        const panel = page?.querySelector('.saas-request-panel');
        const plansPanel = page?.querySelector('.saas-plans-panel');
        if (!page || !panel || !plansPanel || panel.dataset.dialogReady === 'true') return;
        panel.dataset.dialogReady = 'true';
        const dialog = document.createElement('dialog');
        dialog.className = 'saas-request-dialog lf-modal-shell lf-modal--md lf-modal--structured';
        dialog.setAttribute('aria-labelledby', 'saasRequestTitle');
        const close = document.createElement('button');
        close.className = 'btn btn-light dialog-close-button';
        close.type = 'button';
        close.setAttribute('aria-label', t('saasBilling.form.close'));
        close.textContent = t('saasBilling.form.closeButton');
        close.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="m18 6-12 12M6 6l12 12"/></svg>';
        close.setAttribute('aria-label', t('saasBilling.form.close'));
        const header = panel.querySelector('.saas-panel-head');
        header?.classList.remove('saas-panel-head');
        header?.classList.add('modal-header');
        header?.querySelector(':scope > div')?.classList.add('modal-heading-content', 'modal-heading-stack');
        const eyebrow = header?.querySelector('.saas-eyebrow');
        if (eyebrow) eyebrow.textContent = t('saasBilling.form.reviewPlatform');
        if (header) {
            dialog.appendChild(header);
            const headingActions = document.createElement('div');
            headingActions.className = 'modal-heading-actions';
            headingActions.appendChild(close);
            header.appendChild(headingActions);
        }
        header?.querySelector('.saas-panel-badge.is-secure')?.remove();
        const title = header?.querySelector('#saasRequestTitle');
        if (title) title.textContent = t('saasBilling.form.renewTitle');
        const description = header?.querySelector('p');
        if (description) description.textContent = t('saasBilling.form.renewDescription');
        const currentContext = document.createElement('div');
        currentContext.id = 'saasRequestCurrent';
        currentContext.className = 'modal-form-context';
        close.addEventListener('click', () => { if (!state.submitting) dialog.close(); });
        dialog.addEventListener('cancel', (event) => { if (state.submitting) event.preventDefault(); });
        dialog.addEventListener('click', (event) => { if (event.target === dialog && !state.submitting) dialog.close(); });
        panel.parentElement.insertBefore(dialog, panel);
        document.body.appendChild(dialog);
        panel.classList.remove('saas-panel');
        panel.classList.add('modal-body');
        dialog.appendChild(panel);
        const planSelect = $('saasPlanSelect');
        const planField = planSelect?.closest('.field');
        const form = $('saasSubscriptionForm');
        form?.classList.add('modal-form-grid');
        const notesField = $('saasRequestNotes');
        if (notesField) notesField.rows = 2;
        if (form) panel.insertBefore(currentContext, form);
        planField?.classList.remove('field-full');
        if (form && planField && !$('saasTermSelect')) {
            const termField = document.createElement('div');
            termField.className = 'field';
            termField.innerHTML = `<label for="saasTermSelect">${escapeHtml(t('saasBilling.form.term'))}</label><select id="saasTermSelect" required disabled></select><div id="saasRequestPriceSummary" class="modal-form-summary" aria-live="polite"><span>${escapeHtml(t('saasBilling.form.totalPlatform'))}</span><strong>${escapeHtml(t('saasBilling.form.choosePlanTerm'))}</strong></div>`;
            planField.after(termField);
            const summary = $('saasRequestPriceSummary');
            summary?.classList.add('modal-form-summary--neutral', 'field-full');
            if (summary) termField.after(summary);
        }
        const actions = form?.querySelector('.saas-form-actions');
        actions?.classList.add('form-actions');
        const message = $('saasSubscriptionMessage');
        if (form && actions && message) {
            message.classList.add('field-full');
            form.insertBefore(message, actions);
        }
        const submitButton = $('saasSubscriptionSubmit');
        if (submitButton && form && actions) {
            submitButton.setAttribute('form', form.id);
            submitButton.dataset.loadingText = t('saasBilling.form.submitLoading');
            actions.remove();
        }
        if (actions) dialog.appendChild(actions);
        const actionBar = document.createElement('div');
        actionBar.className = 'saas-plan-action-bar';
        actionBar.innerHTML = `<div><span>${escapeHtml(t('saasBilling.form.manageTitle'))}</span><strong>${escapeHtml(t('saasBilling.form.managePrompt'))}</strong></div>`;
        const trigger = document.createElement('button');
        trigger.className = 'btn btn-primary saas-request-open';
        trigger.type = 'button';
        trigger.innerHTML = `<span aria-hidden="true">＋</span><span>${escapeHtml(t('saasBilling.form.openRequest'))}</span>`;
        trigger.addEventListener('click', async () => {
            if (state.submitting || trigger.disabled) return;
            trigger.disabled = true;
            try {
                const pending = await refreshPendingRequest();
                if (pending) return;
                selectPlan($('saasPlanSelect')?.value || '');
                renderRequestPricing();
                dialog.showModal();
            } catch (error) {
                notify(error.message || t('saasBilling.message.requestFailed'), true, 'error');
            } finally {
                trigger.disabled = Boolean(state.pendingRequest);
            }
        });
        actionBar.appendChild(trigger);
        plansPanel.parentElement.insertBefore(actionBar, plansPanel);
        const pendingState = document.createElement('section');
        pendingState.id = 'saasPendingRequestState';
        pendingState.className = 'saas-panel';
        pendingState.setAttribute('aria-live', 'polite');
        pendingState.hidden = true;
        actionBar.parentElement.insertBefore(pendingState, plansPanel);
        renderRequestContext();
        renderPendingRequest(state.pendingRequest);
    }

    function renderRequests(requests) {
        const host = $('saasRequestsList');
        if (!host) return;
        if (!requests?.length) { host.innerHTML = `<tr><td colspan="7"><div class="saas-empty">${escapeHtml(t('saasBilling.requests.empty'))}</div></td></tr>`; return; }
        host.innerHTML = requests.map((request) => {
            const createdAt = request.createdAt || request.created_at || '';
            return `<tr><td data-label="${escapeHtml(t('saasBilling.requests.date'))}"><time datetime="${escapeHtml(createdAt)}" dir="ltr">${escapeHtml(date(createdAt))}</time></td><td data-label="${escapeHtml(t('saasBilling.requests.plan'))}"><span data-i18n-preserve>${escapeHtml(request.plan?.name || '—')}</span></td><td data-label="${escapeHtml(t('saasBilling.requests.duration'))}" data-saas-request-duration="true">${escapeHtml(t('saasBilling.plans.duration', { count: Number(request.durationMonths || 0) }))}</td><td data-label="${escapeHtml(t('saasBilling.requests.amount'))}">${money(request.amount, request.currency)}</td><td data-label="${escapeHtml(t('saasBilling.requests.status'))}">${statusMarkup(request.status)}</td><td data-label="${escapeHtml(t('saasBilling.requests.proof'))}">${request.proof ? `<a class="btn btn-light btn-small" data-saas-payment-proof href="/api/saas/payment-proofs/${request.proof.id}/file" target="_blank" rel="noreferrer">${escapeHtml(t('saasBilling.requests.showProof'))}</a>` : `<span class="saas-muted">${escapeHtml(t('saasBilling.requests.noProof'))}</span>`}</td><td data-label="${escapeHtml(t('saasBilling.requests.reviewNotes'))}">${request.reviewNotes ? `<span class="saas-muted" data-i18n-preserve>${escapeHtml(request.reviewNotes)}</span>` : `<span class="saas-muted">${escapeHtml(t('saasBilling.requests.noNotes'))}</span>`}</td></tr>`;
        }).join('');
    }

    function ensureRequestPagination() {
        const panel = $('saasRequestsList')?.closest('.saas-requests-panel');
        if (!panel) return { summary: null, host: null };
        let footer = panel.querySelector('.saas-request-footer');
        if (!footer) {
            footer = document.createElement('div');
            footer.className = 'directory-footer saas-request-footer';
            footer.innerHTML = `<span id="saasRequestsSummary" class="table-summary"></span><div id="saasRequestsPagination" class="pagination" aria-label="${escapeHtml(t('saasBilling.requests.paginationAria'))}"></div>`;
            panel.appendChild(footer);
        }
        return { summary: $('saasRequestsSummary'), host: $('saasRequestsPagination') };
    }

    function renderRequestPagination() {
        const { summary, host } = ensureRequestPagination();
        if (!summary || !host) return;
        const table = host.closest('.saas-requests-panel')?.querySelector('.saas-table');
        const headerRow = table?.tHead?.rows?.[0];
        if (headerRow && !headerRow.querySelector('[data-saas-duration-column]')) {
            const heading = document.createElement('th');
            heading.dataset.saasDurationColumn = 'true';
            heading.textContent = t('saasBilling.requests.duration');
            headerRow.insertBefore(heading, headerRow.cells[2] || null);
        }
        const rows = $('saasRequestsList')?.rows || [];
        if (rows.length === 1 && rows[0].cells[0]?.colSpan) rows[0].cells[0].colSpan = 7;
        else [...rows].forEach((row, index) => {
            if (row.querySelector('[data-saas-request-duration]')) return;
            const cell = document.createElement('td');
            cell.dataset.label = t('saasBilling.requests.duration');
            cell.dataset.saasRequestDuration = 'true';
            cell.textContent = t('saasBilling.plans.duration', { count: Number(state.requests[index]?.durationMonths || 0) });
            row.insertBefore(cell, row.cells[2] || null);
        });
        const pagination = state.requestsPagination || {};
        const total = Number(pagination.total || 0);
        const page = Number(pagination.page || state.requestPage || 1);
        const pages = Number(pagination.pages || 1);
        summary.textContent = total ? t('saasBilling.requests.summary', { shown: formatNumber(state.requests.length), total: formatNumber(total) }) : t('saasBilling.requests.none');
        host.setAttribute('aria-label', t('saasBilling.requests.paginationAria'));
        host.innerHTML = pages > 1 ? Array.from({ length: pages }, (_, index) => index + 1).map((number) => `<button type="button" class="${number === page ? 'active' : ''}" data-saas-request-page="${number}">${number}</button>`).join('') : '';
    }

    async function load() {
        if (state.loading) { state.refreshAfterLoad = true; return; }
        if (!window.topGymAuth?.isOwner?.()) return;
        state.loading = true;
        try {
            const [data, latestRequestData] = await Promise.all([
                window.topGymAuth.api(`/api/saas/subscription?page=${state.requestPage}&pageSize=25`),
                window.topGymAuth.api('/api/saas/subscription-requests?page=1&pageSize=1')
            ]);
            state.billing = data;
            state.plans = data.plans || [];
            const loadedRequests = data.requests || [];
            const loadedIds = new Set(loadedRequests.map((item) => Number(item.id)));
            for (const id of loadedIds) state.optimisticRequests.delete(id);
            const optimistic = [...state.optimisticRequests.values()].filter((item) => !loadedIds.has(Number(item.id)));
            state.requests = [...loadedRequests, ...optimistic].sort((left, right) => new Date(right.createdAt || 0) - new Date(left.createdAt || 0));
            state.requestsPagination = data.requestsPagination || {};
            const latestRequests = Array.isArray(latestRequestData?.requests) ? latestRequestData.requests : [];
            renderPendingRequest(latestRequests.find((request) => ['pending', 'under_review'].includes(String(request.status || '').toLowerCase())) || null);
            renderSummary(data);
            renderPlans(state.plans);
            renderRequests(state.requests);
            renderRequestPagination();
            state.loaded = true;
            renderPendingRequest(state.pendingRequest);
        } catch (error) {
            showMessage(error.message || t('saasBilling.message.loadFailed'), true, error.message ? null : 'saasBilling.message.loadFailed');
        } finally {
            state.loading = false;
            if (state.refreshAfterLoad) {
                state.refreshAfterLoad = false;
                void load().catch(() => {});
            }
        }
    }

    function selectPlan(planId, termCode = null) {
        const select = $('saasPlanSelect');
        if (select) select.value = String(planId);
        const plan = state.plans.find((item) => String(item.id) === String(planId));
        if (plan && termCode) state.termSelections[String(plan.id)] = termCode;
        document.querySelectorAll('[data-saas-plan-card]').forEach((card) => card.classList.toggle('is-selected', card.dataset.saasPlanCard === String(planId)));
        const termSelect = $('saasTermSelect');
        if (termSelect && plan) {
            termSelect.replaceChildren(...planTerms(plan).map((term) => new Option(`${termLabel(term)} — ${money(termAmountDue(term), term.currency)}`, term.code)));
            termSelect.value = selectedTerm(plan)?.code || '';
            termSelect.disabled = !planTerms(plan).length;
        }
        if (termSelect && !plan) { termSelect.replaceChildren(); termSelect.disabled = true; }
        if (select) {
            const currentId = state.billing?.subscription?.plan?.id ?? state.billing?.subscription?.planId ?? null;
            [...select.options].forEach((option) => {
                if (!option.value) return;
                const optionPlan = state.plans.find((item) => String(item.id) === option.value);
                if (optionPlan) option.textContent = `${optionPlan.name}${String(optionPlan.id) === String(currentId) ? ` · ${t('saasBilling.plans.current')}` : ''}`;
            });
        }
        renderRequestPricing();
    }

    function renderRequestPricing() {
        const host = $('saasRequestPriceSummary');
        const plan = state.plans.find((item) => String(item.id) === String($('saasPlanSelect')?.value));
        const term = planTerms(plan).find((item) => item.code === $('saasTermSelect')?.value);
        if (!host) return;
        host.innerHTML = plan && term
            ? `<span data-saas-selected-plan data-i18n-preserve>${escapeHtml(plan.name)}</span><span> · ${escapeHtml(termLabel(term))}</span><strong>${escapeHtml(t('saasBilling.summary.total', { amount: money(termAmountDue(term), term.currency) }))}</strong>`
            : `<span>${escapeHtml(t('saasBilling.form.totalPlatform'))}</span><strong>${escapeHtml(t('saasBilling.form.choosePlanTerm'))}</strong>`;
    }

    async function submit(event) {
        event.preventDefault();
        if (state.submitting || state.pendingRequest) return;
        const button = $('saasSubscriptionSubmit');
        const form = $('saasSubscriptionForm');
        const planId = Number($('saasPlanSelect')?.value || 0);
        const file = $('saasPaymentProof')?.files?.[0];
        const notes = $('saasRequestNotes')?.value || '';
        const selectedPlan = state.plans.find((plan) => String(plan.id) === String(planId));
        const selectedTermCode = $('saasTermSelect')?.value || '';
        const selectedBillingTerm = planTerms(selectedPlan).find((term) => term.code === selectedTermCode);
        const termCode = selectedBillingTerm?.code || '';
        if (!planId) return showMessage(t('saasBilling.message.choosePlan'), true, 'saasBilling.message.choosePlan');
        if (!selectedBillingTerm) return showMessage(t('saasBilling.message.chooseTerm'), true, 'saasBilling.message.chooseTerm');
        if (!file) return showMessage(t('saasBilling.message.uploadProof'), true, 'saasBilling.message.uploadProof');
        if (file.size > 4 * 1024 * 1024) return showMessage(t('saasBilling.message.proofTooLarge'), true, 'saasBilling.message.proofTooLarge');
        const controls = [...(form?.querySelectorAll('input,select,textarea') || [])].map((control) => ({ control, disabled: control.disabled }));
        state.submitting = true;
        const feedback = window.LogicFitFeedback?.start(button, { loadingText: button.dataset.loadingText || t('saasBilling.form.submitLoading'), allowLayoutShift: false });
        button.disabled = true;
        button.setAttribute('aria-busy', 'true');
        controls.forEach(({ control }) => { control.disabled = true; });
        try {
            const payload = new FormData();
            payload.set('planId', String(planId));
            payload.set('termCode', termCode);
            payload.set('notes', notes);
            payload.set('proof', file, file.name);
            const response = await window.topGymAuth.api('/api/saas/subscription-requests/submit', { method: 'POST', body: payload });
            const responseRequest = response.request;
            if (!responseRequest?.id || !responseRequest.proof) throw new Error(t('saasBilling.message.requestSavedProofUnconfirmed'));
            const request = { ...responseRequest, termCode, durationMonths: selectedBillingTerm.durationMonths };
            state.submitting = false;
            form?.reset();
            const dialog = form?.closest('dialog');
            if (dialog?.open) dialog.close();
            notify(t('saasBilling.message.requestSent'), false, 'success');
            renderPendingRequest(request);
            state.requestPage = 1;
            state.optimisticRequests.set(Number(request.id), request);
            state.requests = [request, ...state.requests.filter((item) => Number(item.id) !== Number(request.id))];
            renderRequests(state.requests);
            void load().catch(() => {});
        } catch (error) {
            if (error.code === 'SAAS_REQUEST_ALREADY_PENDING' || Number(error.status || error.statusCode) === 409) {
                try {
                    const pending = await refreshPendingRequest();
                    if (pending) {
                        $('saasSubscriptionForm')?.closest('dialog')?.close();
                        notify(t('saasBilling.message.pendingExists'), false, 'info');
                        return;
                    }
                } catch (_) { /* preserve the original conflict response */ }
            }
            showMessage(error.message || t('saasBilling.message.requestFailed'), true, error.message ? null : 'saasBilling.message.requestFailed');
            notify(error.message || t('saasBilling.message.requestFailed'), true, 'error');
        } finally {
            state.submitting = false;
            controls.forEach(({ control, disabled }) => { control.disabled = disabled; });
            if (feedback) window.LogicFitFeedback.stop(button);
            else {
                button.disabled = false;
                button.removeAttribute('aria-busy');
            }
            button.textContent = t('saasBilling.form.submit');
            button.dataset.loadingText = t('saasBilling.form.submitLoading');
        }
    }

    async function previewPaymentProof(event) {
        const link = event.target.closest('[data-saas-payment-proof]');
        if (!link) return;
        event.preventDefault();
        const preview = window.open('about:blank', '_blank');
        if (!preview) {
            notify(t('saasBilling.proof.popupBlocked'), true, 'error');
            return;
        }
        try {
            const response = await window.topGymApi.raw(link.href, { cache: 'no-store', headers: { Accept: 'image/*, application/pdf' } });
            const contentType = (response.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
            if (!(contentType.startsWith('image/') || contentType === 'application/pdf')) {
                throw new Error(t('saasBilling.proof.invalidType'));
            }
            const blob = await response.blob();
            if (!blob.size || blob.type && blob.type !== contentType) throw new Error(t('saasBilling.proof.invalidFile'));
            preview.location.replace(URL.createObjectURL(blob));
        } catch (error) {
            preview.close();
            notify(error.message || t('saasBilling.proof.displayFailed'), true, 'error');
        }
    }

    function bind() {
        $('saasSubscriptionForm')?.addEventListener('submit', submit);
        $('saasPlanSelect')?.addEventListener('change', (event) => { selectPlan(event.target.value); renderRequestPricing(); });
        $('saasSubscriptionForm')?.addEventListener('change', (event) => {
            if (event.target?.id !== 'saasTermSelect') return;
            const planId = $('saasPlanSelect')?.value;
            if (!planId) return;
            state.termSelections[String(planId)] = event.target.value;
            const plan = state.plans.find((item) => String(item.id) === String(planId));
            if (plan) renderPlans(state.plans);
            renderRequestPricing();
        });
        setupPaymentProofUpload();
        setupRequestDialog();
        $('saasPlansList')?.addEventListener('click', (event) => {
            const button = event.target.closest('[data-saas-select-plan]');
            if (button) selectPlan(button.dataset.saasSelectPlan);
        });
        $('saasPlansList')?.addEventListener('change', (event) => {
            const term = event.target.closest('[data-saas-term-plan]');
            if (!term) return;
            state.termSelections[String(term.dataset.saasTermPlan)] = term.value;
            selectPlan(term.dataset.saasTermPlan, term.value);
            renderPlans(state.plans);
        });
        document.addEventListener('click', (event) => {
            void previewPaymentProof(event);
            const button = event.target.closest('[data-saas-request-page]');
            if (!button) return;
            state.requestPage = Number(button.dataset.saasRequestPage) || 1;
            void load();
        });
    }

    bind();
    applyStaticTranslations();
    window.addEventListener('topgym:localechange', renderLocalizedBilling);
    window.addEventListener('topgym:tab-changed', (event) => { if (event.detail?.name === 'saas-billing') void load(); });
})();
