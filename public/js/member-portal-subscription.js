(() => {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const state = {
    catalog: null,
    paymentMethods: [],
    history: [],
    loading: false,
    submitting: false,
    feedbackTranslation: null,
    proofRecoveryRequestId: null,
    activationSeen: new Set(),
    requestScenario: null
  };

  const elements = {
    section: $('portalSubscriptionSection'),
    form: $('portalSubscriptionForm'),
    requestType: $('portalSubscriptionRequestType'),
    scenarioHint: $('portalSubscriptionScenarioHint'),
    plan: $('portalSubscriptionPlan'),
    type: $('portalSubscriptionType'),
    startDate: $('portalSubscriptionStartDate'),
    startDateLabel: $('portalSubscriptionStartDateLabel'),
    startDateHint: $('portalSubscriptionStartDateHint'),
    paymentDate: $('portalSubscriptionPaymentDate'),
    method: $('portalSubscriptionPaymentMethod'),
    methodList: $('portalPaymentMethodList'),
    summaryMembership: $('portalSubscriptionSummaryMembership'),
    summaryStart: $('portalSubscriptionSummaryStart'),
    summaryPaymentDate: $('portalSubscriptionSummaryPaymentDate'),
    summaryAmount: $('portalSubscriptionSummaryAmount'),
    notes: $('portalSubscriptionNotes'),
    proof: $('portalSubscriptionProof'),
    proofName: $('portalSubscriptionProofName'),
    submit: $('portalSubscriptionSubmit'),
    feedback: $('portalSubscriptionFeedback'),
    refresh: $('portalSubscriptionRefresh'),
    history: $('portalSubscriptionHistory'),
    activation: $('portalActivationCelebration'),
    activationMessage: $('portalActivationMessage'),
    activationDismiss: document.querySelector('[data-portal-activation-dismiss]')
  };

  if (!elements.section || !elements.form) return;

  const today = () => new Date().toISOString().slice(0, 10);
  const tr = (key, params) => window.TopGymI18n?.t?.(`memberPortal.subscription.${key}`, params) || key;
  const number = (value) => Number.isFinite(Number(value)) ? Number(value) : 0;
  const escapeHtml = (value) => String(value ?? '').replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[character]));
  const locale = () => window.TopGymI18n?.get?.() === 'en' ? 'en-EG' : 'ar-EG';
  const formatMoney = (value, currency = 'EGP') => window.TopGymI18n?.format?.('currency', number(value), { currency, minimumFractionDigits: 2, maximumFractionDigits: 2 }) || `${number(value).toLocaleString(locale(), { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${escapeHtml(currency)}`;
  const formatDate = (value) => {
    if (!value) return '—';
    const raw = String(value).slice(0, 10);
    const parsed = new Date(`${raw}T00:00:00`);
    return Number.isNaN(parsed.getTime()) ? escapeHtml(value) : (window.TopGymI18n?.format?.('date', raw, { day: '2-digit', month: '2-digit', year: 'numeric' }) || new Intl.DateTimeFormat(`${locale()}-u-ca-gregory`, { day: '2-digit', month: '2-digit', year: 'numeric' }).format(parsed));
  };
  const requestTypeLabel = (value) => ({ membership: tr('new'), extension: tr('extension'), renewal: tr('renewal') }[value] || tr('request'));
  const statusLabel = (value) => tr(`status.${['pending', 'approved', 'rejected', 'cancelled'].includes(value) ? value : 'unknown'}`);
  const errorTranslationKeys = Object.freeze({
    PAYMENT_PROOF_REQUIRED: 'paymentProofRequired', PORTAL_SESSION_REQUIRED: 'portalSessionRequired', PORTAL_SESSION_EXPIRED: 'portalSessionExpired',
    MEMBER_SUBSCRIPTION_REQUEST_ALREADY_PENDING: 'requestAlreadyPending', PAYMENT_METHOD_NOT_AVAILABLE: 'paymentMethodUnavailable',
    MEMBERSHIP_PLAN_NOT_AVAILABLE: 'planUnavailable', MEMBERSHIP_TYPE_NOT_AVAILABLE: 'membershipTypeUnavailable', PAYMENT_PROOF_TOO_LARGE: 'paymentProofTooLarge',
    INVALID_PAYMENT_PROOF_TYPE: 'invalidPaymentProofType', PAYMENT_PROOF_SIGNATURE_MISMATCH: 'paymentProofSignatureMismatch',
    OBJECT_STORAGE_PROVIDER_NOT_CONFIGURED: 'paymentProofStorageNotConfigured', MEMBER_PAYMENT_PROOF_STORAGE_NOT_CONFIGURED: 'paymentProofStorageNotConfigured',
    MEMBER_PAYMENT_PROOF_STORAGE_UNAVAILABLE: 'paymentProofStorageUnavailable', MEMBER_SUBSCRIPTION_REQUEST_NOT_AVAILABLE: 'requestSaveUnconfirmed',
    MEMBER_SUBSCRIPTION_REQUEST_NOT_FOUND: 'requestNotFound', MEMBER_SUBSCRIPTION_REQUEST_LOCKED: 'requestAlreadyReviewed',
    MEMBER_SUBSCRIPTION_REQUEST_ALREADY_REVIEWED: 'requestAlreadyReviewed', PORTAL_SESSION_MEMBER_INVALID: 'portalSessionMemberInvalid',
    MEMBERSHIP_SELECTION_REQUIRED: 'membershipSelectionRequired', PAYMENT_METHOD_REQUIRED: 'paymentMethodRequired', PAYMENT_DATE_REQUIRED: 'paymentDateRequired',
    PAYMENT_DATE_IN_FUTURE: 'paymentDateInFuture', INVALID_PAYMENT_PROOF_SUBMISSION: 'invalidPaymentProofSubmission',
    MEMBER_SUBSCRIPTION_REQUEST_TYPE_UNSUPPORTED: 'requestTypeUnsupported', REVIEW_NOTES_REQUIRED: 'reviewNotesRequired',
    PAYMENT_PROOF_UNAVAILABLE: 'paymentProofUnavailable', PAYMENT_PROOF_INTEGRITY_FAILED: 'paymentProofIntegrityFailed',
    MEMBER_RENEWAL_REQUIRES_EXISTING: 'renewalRequiresExisting', MEMBERSHIP_FREEZE_ACTIVE: 'membershipFreezeActive',
    MEMBERSHIP_START_OVERLAPS_CURRENT: 'membershipStartOverlapsCurrent', MEMBERSHIP_CURRENT_DATES_INVALID: 'membershipCurrentDatesInvalid',
    MEMBERSHIP_RENEWAL_SNAPSHOT_INVALID: 'membershipRenewalSnapshotInvalid', STORAGE_NOT_CONFIGURED: 'paymentProofStorageNotConfigured'
  });
  const activationStoragePrefix = 'logicfit.portal.activation-seen.v1:';

  function safeError(payload, fallback, statusCode = 0) {
    const code = String(payload?.code || '').trim();
    const serverMessage = typeof payload?.error === 'string'
      ? payload.error.replace(/[\u0000-\u001F\u007F]/g, ' ').trim().slice(0, 300)
      : '';
    const message = (errorTranslationKeys[code] ? tr(`errors.${errorTranslationKeys[code]}`) : '')
      || (statusCode >= 400 && statusCode < 500 ? serverMessage : '')
      || fallback;
    const error = new Error(message || fallback);
    error.code = code;
    error.statusCode = Number(statusCode) || 0;
    return error;
  }

  async function requestJson(path, options = {}, fallback = tr('requestFailed')) {
    let response;
    try {
      response = await fetch(path, { credentials: 'same-origin', ...options });
    } catch (_) {
      const error = new Error(tr('networkError'));
      error.code = 'NETWORK_ERROR';
      throw error;
    }
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw safeError(payload, fallback, response.status);
    return payload;
  }

  function setFeedback(message = '', type = '', translation = null) {
    if (!elements.feedback) return;
    state.feedbackTranslation = translation;
    elements.feedback.textContent = translation ? tr(translation.key, translation.params) : message;
    elements.feedback.className = `portal-subscription-feedback${type ? ` ${type}` : ''}`;
    elements.feedback.hidden = !message && !translation;
  }

  function setFeedbackKey(key, type = '', params) {
    setFeedback('', type, { key, params });
  }

  function activationKey(requestId) {
    const id = Number(requestId);
    return Number.isInteger(id) && id > 0 ? `${activationStoragePrefix}${id}` : '';
  }

  function activationWasSeen(requestId) {
    const key = activationKey(requestId);
    if (!key || state.activationSeen.has(key)) return true;
    try { return window.localStorage.getItem(key) === '1'; } catch (_) { return false; }
  }

  function markActivationSeen(requestId) {
    const key = activationKey(requestId);
    if (!key) return;
    state.activationSeen.add(key);
    try { window.localStorage.setItem(key, '1'); } catch (_) { /* Private browsing may deny storage. */ }
  }

  function hideActivation() {
    if (!elements.activation) return;
    elements.activation.hidden = true;
    elements.activation.classList.remove('is-visible');
  }

  function showActivationFor(items = []) {
    if (!elements.activation) return;
    const approved = (Array.isArray(items) ? items : [])
      .filter((item) => String(item?.status || '').toLowerCase() === 'approved' && Number(item?.approvedMembershipId) > 0)
      .sort((first, second) => new Date(second.reviewedAt || second.updatedAt || 0).getTime() - new Date(first.reviewedAt || first.updatedAt || 0).getTime())[0];
    if (!approved || activationWasSeen(approved.id)) return;
    const membership = approved.membership || {};
    const plan = [membership.plan, membership.type].filter(Boolean).join(' · ') || tr('newMembership');
    const start = formatDate(membership.startDate);
    const end = formatDate(membership.endDate);
    if (elements.activationMessage) elements.activationMessage.textContent = tr('activationDetails', { plan, start, end });
    markActivationSeen(approved.id);
    elements.activation.hidden = false;
    elements.activation.classList.remove('is-visible');
    window.requestAnimationFrame(() => elements.activation?.classList.add('is-visible'));
  }

  function setBusy(button, busy, loadingText = tr('sendingRequest')) {
    if (!button) return;
    if (window.topGymFeedback) {
      if (busy) window.topGymFeedback.start(button, { loadingText });
      else window.topGymFeedback.stop(button);
      return;
    }
    button.disabled = busy;
    button.setAttribute('aria-busy', String(busy));
  }

  function applyRequestScenario(detail = {}) {
    const allowedTypes = new Set(['membership', 'extension', 'renewal']);
    const requestType = allowedTypes.has(String(detail.requestType || ''))
      ? String(detail.requestType)
      : 'membership';
    const operation = String(detail.operation || requestType);
    const canSubmit = detail.canSubmit !== false;
    state.requestScenario = { requestType, operation, canSubmit, resolved: true };
    if (elements.requestType) {
      elements.requestType.value = requestType;
      elements.requestType.disabled = true;
      elements.requestType.setAttribute('aria-readonly', 'true');
      [...elements.requestType.options].forEach((option) => {
        option.hidden = option.value !== requestType;
      });
    }
    syncScenarioHint();
    syncRequestTypePresentation();
    syncSubmitState();
  }

  function syncScenarioHint() {
    const hint = elements.scenarioHint;
    if (!hint || !state.requestScenario) return;
    const { operation } = state.requestScenario;
    hint.textContent = tr(operation === 'blocked' ? 'frozenHint' : operation === 'extension' ? 'extensionScenario' : operation === 'renewal' ? 'renewalScenario' : 'newScenario');
    hint.classList.toggle('is-blocked', operation === 'blocked');
  }

  function syncRequestTypePresentation() {
    const requestType = state.requestScenario?.requestType || elements.requestType?.value || 'membership';
    const isContinuation = ['extension', 'renewal'].includes(requestType);
    if (elements.startDateLabel) elements.startDateLabel.textContent = tr(requestType === 'extension' ? 'startExtension' : requestType === 'renewal' ? 'startRenewal' : 'startDate');
    if (elements.startDateHint) {
      elements.startDateHint.textContent = tr(requestType === 'extension' ? 'extensionHint' : requestType === 'renewal' ? 'renewalHint' : 'newStartHint');
    }
    if (elements.startDate) {
      elements.startDate.disabled = isContinuation;
      if (isContinuation) {
        elements.startDate.value = '';
        elements.startDate.removeAttribute('required');
      } else {
        elements.startDate.setAttribute('required', '');
        if (!elements.startDate.value) elements.startDate.value = today();
      }
    }
    if (elements.requestType && state.requestScenario?.resolved) elements.requestType.disabled = true;
    updateSummary();
  }

  function activePlan() {
    return state.catalog?.plans?.find((item) => item.code === elements.plan?.value) || null;
  }

  function activeType() {
    return state.catalog?.types?.find((item) => item.code === elements.type?.value) || null;
  }

  function selectedMethod() {
    return state.paymentMethods.find((item) => String(item.id) === String(elements.method?.value)) || null;
  }

  function renderPlans() {
    if (!elements.plan) return;
    const previous = elements.plan.value;
    const plans = state.catalog?.plans || [];
    elements.plan.innerHTML = plans.length
      ? plans.map((item) => `<option value="${escapeHtml(item.code)}">${escapeHtml(item.label)}</option>`).join('')
      : `<option value="">${escapeHtml(tr('noPlans'))}</option>`;
    elements.plan.disabled = !plans.length;
    elements.plan.value = plans.some((item) => item.code === previous) ? previous : (plans[0]?.code || '');
  }

  function renderTypes() {
    if (!elements.type) return;
    const previous = elements.type.value;
    const types = state.catalog?.types || [];
    elements.type.innerHTML = types.length
      ? types.map((item) => `<option value="${escapeHtml(item.code)}">${escapeHtml(item.label)}</option>`).join('')
      : `<option value="">${escapeHtml(tr('noTypes'))}</option>`;
    elements.type.disabled = !types.length;
    elements.type.value = types.some((item) => item.code === previous) ? previous : (types[0]?.code || '');
  }

  function renderPaymentMethods() {
    if (!elements.methodList || !elements.method) return;
    const methods = state.paymentMethods;
    if (!methods.length) {
      elements.method.value = '';
      elements.methodList.innerHTML = `<div class="portal-subscription-state">${escapeHtml(tr('noPaymentMethods'))}</div>`;
      syncSubmitState();
      return;
    }
    const previous = elements.method.value;
    const selected = methods.some((item) => String(item.id) === String(previous)) ? String(previous) : String(methods[0].id);
    elements.method.value = selected;
    elements.methodList.innerHTML = methods.map((item) => `
      <div class="portal-payment-method-choice">
        <label class="portal-payment-method-row">
          <input type="radio" name="portalPaymentMethod" value="${escapeHtml(item.id)}" ${String(item.id) === selected ? 'checked' : ''}>
          <span class="portal-payment-method-copy"><strong>${escapeHtml(item.name || tr('paymentMethod'))}</strong>${item.recipientName ? `<small>${escapeHtml(item.recipientName)}</small>` : ''}${item.instructions ? `<small>${escapeHtml(item.instructions)}</small>` : ''}</span>
          <span class="portal-payment-method-account" dir="ltr">${escapeHtml(item.accountReference || '—')}</span>
        </label>
        <button class="btn btn-light btn-small portal-copy-payment" type="button" data-portal-copy-payment="${escapeHtml(item.id)}">${escapeHtml(tr('copyAccount'))}</button>
      </div>`).join('');
    syncSubmitState();
  }

  function updateSummary() {
    const plan = activePlan();
    const type = activeType();
    const amount = plan && type ? state.catalog?.prices?.[plan.code]?.[type.code] : null;
    if (elements.summaryMembership) elements.summaryMembership.textContent = plan && type ? `${plan.label} · ${type.label}` : '—';
    if (elements.summaryStart) elements.summaryStart.textContent = ['extension', 'renewal'].includes(elements.requestType?.value)
      ? tr('systemAfterVerify')
      : formatDate(elements.startDate?.value);
    if (elements.summaryPaymentDate) elements.summaryPaymentDate.textContent = formatDate(elements.paymentDate?.value);
    if (elements.summaryAmount) elements.summaryAmount.innerHTML = amount == null ? escapeHtml(tr('systemAfterVerify')) : formatMoney(amount, state.catalog?.currency || 'EGP');
  }

  function updateTenantPaymentCopy() {
    const target = document.querySelector('#portalPaymentMethodsTitle')?.parentElement?.querySelector('p');
    if (!target) return;
    const brand = target.querySelector('[data-brand-text="brandName"]')?.textContent?.trim()
      || window.topGymBranding?.get?.().identity?.brandName || 'Logic Fit';
    const marker = '__TENANT_BRAND__';
    const localized = tr('currentGymBrand', { brand: marker });
    const [before, after = ''] = localized.split(marker);
    const brandNode = document.createElement('strong');
    brandNode.setAttribute('data-brand-text', 'brandName');
    brandNode.textContent = brand;
    target.replaceChildren(document.createTextNode(before), brandNode, document.createTextNode(after));
  }

  function syncSubmitState() {
    if (!elements.submit) return;
    const recoveryRequestId = Number(state.proofRecoveryRequestId);
    const isProofRecovery = Number.isInteger(recoveryRequestId) && recoveryRequestId > 0;
    const label = elements.submit.querySelector('span:not(.portal-spinner)');
    if (label) label.textContent = tr(isProofRecovery ? 'uploadProof' : 'sendRequest');
    const scenarioBlocked = state.requestScenario?.resolved && state.requestScenario.canSubmit === false;
    elements.submit.disabled = state.submitting || scenarioBlocked || (!isProofRecovery && (!state.catalog?.plans?.length || !state.catalog?.types?.length || !state.paymentMethods.length));
  }

  function renderHistory(items = state.history, { localeRefresh = false } = {}) {
    if (!elements.history) return;
    state.history = Array.isArray(items) ? items : [];
    if (!items.length) {
      hideActivation();
      elements.history.innerHTML = `<div class="portal-subscription-state">${escapeHtml(tr('noMemberRequests'))}</div>`;
      return;
    }
    elements.history.innerHTML = items.map((item) => {
      const membership = item.membership || {};
      const pricing = item.pricing || {};
      const status = String(item.status || '').toLowerCase();
      const proofLabel = status === 'rejected'
        ? statusLabel('rejected')
        : status === 'cancelled'
          ? statusLabel('cancelled')
          : item.proof?.verified ? tr('attachProof') : tr('waitingProof');
      const rejectionReason = String(item.reviewNotes ?? item.review_notes ?? '').trim();
      const reviewReason = status === 'rejected'
        ? `<div class="portal-request-history-review" role="note"><strong>${escapeHtml(tr('rejectionReason'))}</strong><span>${escapeHtml(rejectionReason || tr('noRejectionReason'))}</span></div>`
        : '';
      const proofRecovery = status === 'pending' && !item.proof?.verified
        ? `<button class="btn btn-light btn-small portal-proof-retry" type="button" data-portal-proof-retry="${escapeHtml(item.id)}">${escapeHtml(tr('uploadProof'))}</button>`
        : '';
      return `<article class="portal-request-history-row">
        <div class="portal-request-history-copy"><strong>${escapeHtml(tr('requestId', { id: item.id }))} · ${escapeHtml(requestTypeLabel(item.requestType))} · ${escapeHtml(membership.type || tr('membership'))}</strong><small>${formatDate(membership.startDate)} · ${formatMoney(pricing.amountDue, pricing.currency || 'EGP')} · ${escapeHtml(proofLabel)}</small>${reviewReason}</div>
        <div class="portal-request-history-actions"><span class="portal-request-history-status ${escapeHtml(status)}">${escapeHtml(statusLabel(status))}</span>${proofRecovery}</div>
      </article>`;
    }).join('');
    if (!localeRefresh) showActivationFor(items);
  }

  async function loadHistory() {
    const result = await requestJson('/api/member-portal/subscription-requests?page=1&pageSize=10', {}, tr('historyLoadFailed'));
    state.history = result.requests || [];
    renderHistory(state.history);
  }

  async function load() {
    if (state.loading) return;
    state.loading = true;
    setFeedbackKey('loading');
    try {
      const [catalog, methods, history] = await Promise.all([
        requestJson('/api/member-portal/membership-catalog', {}, tr('plansLoadFailed')).then((result) => result),
        requestJson('/api/member-portal/payment-methods', {}, tr('paymentMethodsLoadFailed')),
        requestJson('/api/member-portal/subscription-requests?page=1&pageSize=10', {}, tr('historyLoadFailed'))
      ]);
      state.catalog = catalog;
      state.paymentMethods = Array.isArray(methods.paymentMethods) ? methods.paymentMethods : [];
      state.history = history.requests || [];
      renderPlans();
      renderTypes();
      renderPaymentMethods();
      if (!state.requestScenario?.resolved) {
        applyRequestScenario({
          requestType: document.documentElement.dataset.portalRequestType,
          operation: document.documentElement.dataset.portalRequestOperation,
          canSubmit: document.documentElement.dataset.portalRequestCanSubmit !== 'false'
        });
      }
      if (elements.startDate && !elements.startDate.value) elements.startDate.value = today();
      if (elements.startDate) elements.startDate.min = today();
      if (elements.paymentDate) {
        if (!elements.paymentDate.value) elements.paymentDate.value = today();
        elements.paymentDate.max = today();
      }
      syncRequestTypePresentation();
      updateSummary();
      renderHistory(state.history);
      setFeedback('', '');
    } catch (error) {
      if (error.code && errorTranslationKeys[error.code]) setFeedbackKey(`errors.${errorTranslationKeys[error.code]}`, 'error');
      else setFeedback(error.message || tr('subscriptionLoadFailed'), 'error');
      if (elements.history) elements.history.innerHTML = `<div class="portal-subscription-state">${escapeHtml(tr('requestsLoadFailed'))}</div>`;
    } finally {
      state.loading = false;
      syncSubmitState();
    }
  }

  async function uploadProof(requestId, file) {
    let response;
    try {
      response = await fetch(`/api/member-portal/subscription-requests/${encodeURIComponent(requestId)}/proof`, {
        method: 'POST',
        credentials: 'same-origin',
        headers: {
          'Content-Type': 'application/octet-stream',
          'x-payment-proof-mime': file.type || 'application/octet-stream',
          'x-payment-proof-name-encoded': encodeURIComponent(file.name || 'payment-proof')
        },
        body: await file.arrayBuffer()
      });
    } catch (_) {
      const error = new Error(tr('proofUploadNetworkError'));
      error.code = 'NETWORK_ERROR';
      throw error;
    }
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw safeError(payload, tr('proofUploadFailed'), response.status);
    return payload;
  }

  function randomIdempotencyKey() {
    if (window.crypto?.randomUUID) return window.crypto.randomUUID();
    return `portal-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 14)}`;
  }

  async function copyText(value) {
    if (navigator.clipboard?.writeText) return navigator.clipboard.writeText(String(value));
    const field = document.createElement('textarea');
    field.value = String(value);
    field.setAttribute('readonly', '');
    field.style.position = 'fixed';
    field.style.opacity = '0';
    document.body.appendChild(field);
    field.select();
    const copied = document.execCommand('copy');
    field.remove();
    if (!copied) throw new Error('clipboard_unavailable');
  }

  elements.plan?.addEventListener('change', updateSummary);
  elements.type?.addEventListener('change', updateSummary);
  elements.requestType?.addEventListener('change', syncRequestTypePresentation);
  elements.startDate?.addEventListener('change', updateSummary);
  elements.paymentDate?.addEventListener('change', updateSummary);
  elements.methodList?.addEventListener('change', (event) => {
    if (event.target.matches('input[name="portalPaymentMethod"]')) {
      elements.method.value = event.target.value;
      syncSubmitState();
    }
  });
  elements.methodList?.addEventListener('click', async (event) => {
    const button = event.target instanceof Element ? event.target.closest('[data-portal-copy-payment]') : null;
    if (!button) return;
    const method = state.paymentMethods.find((item) => String(item.id) === String(button.dataset.portalCopyPayment));
    if (!method?.accountReference) return;
    try {
      await copyText(method.accountReference);
      setFeedbackKey('copySuccess', 'success');
    } catch (_) {
      setFeedbackKey('copyFailure', 'error');
    }
  });
  elements.proof?.addEventListener('change', () => {
    const file = elements.proof.files?.[0];
    if (elements.proofName) elements.proofName.textContent = file ? `${file.name} · ${(file.size / 1024 / 1024).toFixed(2)}MB` : tr('proofHelp');
    if (file && state.proofRecoveryRequestId) setFeedbackKey('proofSelectedForRetry');
    syncSubmitState();
  });
  elements.history?.addEventListener('click', (event) => {
    const trigger = event.target instanceof Element ? event.target.closest('[data-portal-proof-retry]') : null;
    const requestId = Number(trigger?.dataset?.portalProofRetry);
    if (!trigger || !Number.isInteger(requestId) || requestId <= 0 || state.submitting) return;
    state.proofRecoveryRequestId = requestId;
    syncSubmitState();
    setFeedbackKey('selectProofForRetry');
    elements.proof?.click();
  });
  elements.refresh?.addEventListener('click', async () => {
    if (window.topGymFeedback) window.topGymFeedback.start(elements.refresh, { loadingText: tr('loadingRequests') });
    try { await loadHistory(); } catch (error) { setFeedback(error.message || tr('historyLoadFailed'), 'error'); }
    finally { window.topGymFeedback?.stop?.(elements.refresh); }
  });
  elements.activationDismiss?.addEventListener('click', () => {
    hideActivation();
    document.querySelector('.portal-tool-grid')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  });
  elements.form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (state.submitting) return;
    const recoveryRequestId = Number(state.proofRecoveryRequestId);
    const isProofRecovery = Number.isInteger(recoveryRequestId) && recoveryRequestId > 0;
    const file = elements.proof.files?.[0];
    if (!file) { setFeedbackKey('proofRequired', 'error'); return; }
    if (file.size > 4 * 1024 * 1024) { setFeedbackKey('paymentProofTooLarge', 'error'); return; }
    if (!isProofRecovery && !selectedMethod()) { setFeedbackKey('paymentMethodRequired', 'error'); return; }
    if (!isProofRecovery && !elements.paymentDate?.value) { setFeedbackKey('paymentDateRequired', 'error'); elements.paymentDate?.focus(); return; }
    const isContinuation = ['extension', 'renewal'].includes(elements.requestType.value);
    if (!isProofRecovery && !isContinuation && !elements.startDate.value) { setFeedbackKey('membershipStartDateRequired', 'error'); elements.startDate.focus(); return; }
    state.submitting = true;
    syncSubmitState();
    setFeedback('', '');
    setBusy(elements.submit, true, tr(isProofRecovery ? 'uploadingProof' : 'uploadingAndVerifyingProof'));
    let requestId = isProofRecovery ? recoveryRequestId : null;
    let proofUploaded = false;
    try {
      if (!isProofRecovery) {
        const formData = new FormData();
        formData.append('requestType', elements.requestType.value);
        formData.append('membershipPlan', elements.plan.value);
        formData.append('membershipType', elements.type.value);
        formData.append('startDate', isContinuation ? '' : elements.startDate.value);
        formData.append('paymentDate', elements.paymentDate.value);
        formData.append('paymentMethodCode', selectedMethod().id);
        if (elements.notes.value) formData.append('notes', elements.notes.value);
        formData.append('proof', file, file.name || 'payment-proof');
        const created = await requestJson('/api/member-portal/subscription-requests', {
          method: 'POST',
          headers: { 'Idempotency-Key': randomIdempotencyKey() },
          body: formData
        }, tr('requestSubmitFailed'));
        requestId = created.request?.id;
        if (!requestId) throw new Error(tr('createdRequestIdMissing'));
      }
      if (isProofRecovery) setFeedbackKey('uploadingAndVerifyingProof');
      if (isProofRecovery) await uploadProof(requestId, file);
      proofUploaded = true;
      state.proofRecoveryRequestId = null;
      if (isProofRecovery) {
        setFeedbackKey('proofUploadSuccess', 'success');
        elements.proof.value = '';
        if (elements.proofName) elements.proofName.textContent = tr('proofHelp');
      } else {
        setFeedbackKey('requestSubmitSuccess', 'success');
        elements.form.reset();
        elements.startDate.value = today();
        elements.startDate.min = today();
        elements.paymentDate.value = today();
        elements.paymentDate.max = today();
        syncRequestTypePresentation();
        renderPlans();
        renderTypes();
        renderPaymentMethods();
        updateSummary();
      }
      await loadHistory();
    } catch (error) {
      if (requestId && !proofUploaded) state.proofRecoveryRequestId = requestId;
      if (requestId && !proofUploaded) {
        setFeedbackKey('proofRetryFailed', 'error', { error: error.message || tr('proofUploadFailed') });
      } else if (error.code && errorTranslationKeys[error.code]) {
        setFeedbackKey(`errors.${errorTranslationKeys[error.code]}`, 'error');
      } else {
        setFeedback(error.message || tr('requestSubmitFailed'), 'error');
      }
    } finally {
      state.submitting = false;
      setBusy(elements.submit, false);
      syncSubmitState();
    }
  });

  window.addEventListener('topgym:portal-subscription-open', () => {
    void load();
  });

  window.addEventListener('topgym:portal-session-change', (event) => {
    if (event.detail?.operation === 'trainer_client') {
      if (elements.section) elements.section.hidden = true;
      return;
    }
    applyRequestScenario(event.detail || {});
  });

  window.addEventListener('topgym:localechange', () => {
    syncScenarioHint();
    if (state.feedbackTranslation && elements.feedback) {
      elements.feedback.textContent = tr(state.feedbackTranslation.key, state.feedbackTranslation.params);
    }
    if (!state.catalog || state.loading) {
      window.TopGymI18n?.annotateText?.(elements.section, 'memberPortal.');
      window.TopGymI18n?.apply?.(elements.section);
      return;
    }
    updateTenantPaymentCopy();
    renderPlans();
    renderTypes();
    renderPaymentMethods();
    syncRequestTypePresentation();
    updateSummary();
    renderHistory(state.history, { localeRefresh: true });
    if (elements.proofName && !elements.proof?.files?.length) {
      elements.proofName.textContent = tr('proofHelp');
    }
    window.TopGymI18n?.annotateText?.(elements.section, 'memberPortal.');
    window.TopGymI18n?.apply?.(elements.section);
  });

  syncRequestTypePresentation();
})();
