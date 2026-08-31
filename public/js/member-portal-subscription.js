(() => {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const state = {
    catalog: null,
    paymentMethods: [],
    loading: false,
    submitting: false,
    proofRecoveryRequestId: null,
    activationSeen: new Set()
  };

  const elements = {
    section: $('portalSubscriptionSection'),
    form: $('portalSubscriptionForm'),
    requestType: $('portalSubscriptionRequestType'),
    plan: $('portalSubscriptionPlan'),
    type: $('portalSubscriptionType'),
    startDate: $('portalSubscriptionStartDate'),
    startDateLabel: $('portalSubscriptionStartDateLabel'),
    startDateHint: $('portalSubscriptionStartDateHint'),
    method: $('portalSubscriptionPaymentMethod'),
    methodList: $('portalPaymentMethodList'),
    summaryMembership: $('portalSubscriptionSummaryMembership'),
    summaryStart: $('portalSubscriptionSummaryStart'),
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
  const number = (value) => Number.isFinite(Number(value)) ? Number(value) : 0;
  const escapeHtml = (value) => String(value ?? '').replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[character]));
  const formatMoney = (value, currency = 'EGP') => `${number(value).toLocaleString('ar-EG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${escapeHtml(currency)}`;
  const formatDate = (value) => {
    if (!value) return '—';
    const raw = String(value).slice(0, 10);
    const parsed = new Date(`${raw}T00:00:00`);
    return Number.isNaN(parsed.getTime()) ? escapeHtml(value) : new Intl.DateTimeFormat('ar-EG-u-ca-gregory', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(parsed);
  };
  const requestTypeLabel = (value) => ({ membership: 'اشتراك جديد', renewal: 'تجديد العضوية' }[value] || 'طلب عضوية');
  const statusLabel = (value) => ({ pending: 'قيد المراجعة', approved: 'تم الاعتماد', rejected: 'مرفوض', cancelled: 'ملغي' }[value] || 'غير معروف');
  const activationStoragePrefix = 'logicfit.portal.activation-seen.v1:';
  const errorMessages = Object.freeze({
    PORTAL_SESSION_REQUIRED: 'انتهت جلسة البوابة. أعد إدخال كود العضوية.',
    PORTAL_SESSION_EXPIRED: 'انتهت جلسة البوابة. أعد إدخال كود العضوية.',
    MEMBER_SUBSCRIPTION_REQUEST_ALREADY_PENDING: 'لديك طلب من نفس النوع قيد المراجعة بالفعل.',
    PAYMENT_METHOD_NOT_AVAILABLE: 'وسيلة الدفع المختارة لم تعد متاحة. حدّث البيانات وحاول مرة أخرى.',
    MEMBERSHIP_PLAN_NOT_AVAILABLE: 'الباقة المختارة غير متاحة حاليًا.',
    MEMBERSHIP_TYPE_NOT_AVAILABLE: 'نوع العضوية المختار غير متاح حاليًا.',
    PAYMENT_PROOF_TOO_LARGE: 'حجم إثبات الدفع أكبر من الحد المسموح وهو 4MB.',
    INVALID_PAYMENT_PROOF_TYPE: 'نوع الملف غير مسموح. استخدم صورة أو ملف PDF.',
    PAYMENT_PROOF_SIGNATURE_MISMATCH: 'محتوى الملف لا يطابق نوعه المعلن.',
    OBJECT_STORAGE_PROVIDER_NOT_CONFIGURED: 'رفع إثبات الدفع غير متاح حاليًا لأن التخزين الخاص غير مهيأ.',
    MEMBER_PAYMENT_PROOF_STORAGE_NOT_CONFIGURED: 'رفع إثبات الدفع غير متاح حاليًا لأن التخزين الخاص غير مهيأ.',
    MEMBER_PAYMENT_PROOF_STORAGE_UNAVAILABLE: 'تعذر الوصول إلى تخزين إثباتات الدفع حاليًا. حاول مرة أخرى لاحقًا.',
    PAYMENT_PROOF_UNAVAILABLE: 'إثبات الدفع غير متاح حاليًا. أعد رفعه أو حاول مرة أخرى لاحقًا.',
    PAYMENT_PROOF_INTEGRITY_FAILED: 'تعذر التحقق من سلامة إثبات الدفع. أعد رفع الملف الأصلي.',
    MEMBER_RENEWAL_REQUIRES_EXISTING: 'لا يمكن تقديم طلب تجديد قبل وجود عضوية سابقة. اختر اشتراكًا جديدًا إذا كانت هذه أول عضوية.',
    MEMBERSHIP_FREEZE_ACTIVE: 'استأنف العضوية أولًا قبل تقديم طلب التجديد.',
    MEMBERSHIP_START_OVERLAPS_CURRENT: 'سيبدأ التجديد تلقائيًا بعد نهاية العضوية الحالية.',
    STORAGE_NOT_CONFIGURED: 'رفع إثبات الدفع غير متاح حاليًا لأن التخزين الخاص غير مهيأ.'
  });

  function safeError(payload, fallback) {
    const code = String(payload?.code || '').trim();
    const error = new Error(errorMessages[code] || fallback);
    error.code = code;
    return error;
  }

  async function requestJson(path, options = {}, fallback = 'تعذر تنفيذ الطلب. حاول مرة أخرى.') {
    const response = await fetch(path, { credentials: 'same-origin', ...options });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw safeError(payload, fallback);
    return payload;
  }

  function setFeedback(message = '', type = '') {
    if (!elements.feedback) return;
    elements.feedback.textContent = message;
    elements.feedback.className = `portal-subscription-feedback${type ? ` ${type}` : ''}`;
    elements.feedback.hidden = !message;
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
    const plan = [membership.plan, membership.type].filter(Boolean).join(' · ') || 'عضويتك الجديدة';
    const start = formatDate(membership.startDate);
    const end = formatDate(membership.endDate);
    if (elements.activationMessage) elements.activationMessage.textContent = `${plan} — من ${start} حتى ${end}.`;
    markActivationSeen(approved.id);
    elements.activation.hidden = false;
    elements.activation.classList.remove('is-visible');
    window.requestAnimationFrame(() => elements.activation?.classList.add('is-visible'));
  }

  function setBusy(button, busy, loadingText = 'جاري إرسال الطلب...') {
    if (!button) return;
    if (window.topGymFeedback) {
      if (busy) window.topGymFeedback.start(button, { loadingText });
      else window.topGymFeedback.stop(button);
      return;
    }
    button.disabled = busy;
    button.setAttribute('aria-busy', String(busy));
  }

  function syncRequestTypePresentation() {
    const isRenewal = elements.requestType?.value === 'renewal';
    if (elements.startDateLabel) elements.startDateLabel.textContent = isRenewal ? 'تاريخ بدء التجديد' : 'تاريخ البداية';
    if (elements.startDateHint) {
      elements.startDateHint.textContent = isRenewal
        ? 'يحدده النظام تلقائيًا بعد نهاية العضوية الحالية أو من اليوم إذا انتهت.'
        : 'يبدأ الاشتراك الجديد من التاريخ الذي تختاره.';
    }
    if (elements.startDate) {
      elements.startDate.disabled = isRenewal;
      if (isRenewal) {
        elements.startDate.value = '';
        elements.startDate.removeAttribute('required');
      } else {
        elements.startDate.setAttribute('required', '');
        if (!elements.startDate.value) elements.startDate.value = today();
      }
    }
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
      : '<option value="">لا توجد باقات متاحة حاليًا</option>';
    elements.plan.disabled = !plans.length;
    elements.plan.value = plans.some((item) => item.code === previous) ? previous : (plans[0]?.code || '');
  }

  function renderTypes() {
    if (!elements.type) return;
    const previous = elements.type.value;
    const types = state.catalog?.types || [];
    elements.type.innerHTML = types.length
      ? types.map((item) => `<option value="${escapeHtml(item.code)}">${escapeHtml(item.label)}</option>`).join('')
      : '<option value="">لا توجد أنواع عضوية متاحة</option>';
    elements.type.disabled = !types.length;
    elements.type.value = types.some((item) => item.code === previous) ? previous : (types[0]?.code || '');
  }

  function renderPaymentMethods() {
    if (!elements.methodList || !elements.method) return;
    const methods = state.paymentMethods;
    if (!methods.length) {
      elements.method.value = '';
      elements.methodList.innerHTML = '<div class="portal-subscription-state">لم يفعّل هذا الجيم وسيلة دفع إلكترونية حاليًا. يجب على Owner إضافة وسيلة دفع من إعدادات هوية الجيم ثم نشر الهوية، وبعدها أعد تحميل الصفحة.</div>';
      syncSubmitState();
      return;
    }
    const previous = elements.method.value;
    const selected = methods.some((item) => String(item.id) === String(previous)) ? String(previous) : String(methods[0].id);
    elements.method.value = selected;
    elements.methodList.innerHTML = methods.map((item) => `
      <label class="portal-payment-method-row">
        <input type="radio" name="portalPaymentMethod" value="${escapeHtml(item.id)}" ${String(item.id) === selected ? 'checked' : ''}>
        <span class="portal-payment-method-copy"><strong>${escapeHtml(item.name || 'وسيلة دفع')}</strong><small>${escapeHtml(item.recipientName || item.instructions || 'تحويل مباشر للجيم')}</small></span>
        <span class="portal-payment-method-account" dir="ltr">${escapeHtml(item.accountReference || '—')}</span>
      </label>`).join('');
    syncSubmitState();
  }

  function updateSummary() {
    const plan = activePlan();
    const type = activeType();
    const amount = plan && type ? state.catalog?.prices?.[plan.code]?.[type.code] : null;
    if (elements.summaryMembership) elements.summaryMembership.textContent = plan && type ? `${plan.label} · ${type.label}` : '—';
    if (elements.summaryStart) elements.summaryStart.textContent = elements.requestType?.value === 'renewal'
      ? 'يحدده النظام تلقائيًا'
      : formatDate(elements.startDate?.value);
    if (elements.summaryAmount) elements.summaryAmount.innerHTML = amount == null ? 'سيحدده النظام بعد التحقق' : formatMoney(amount, state.catalog?.currency || 'EGP');
  }

  function syncSubmitState() {
    if (!elements.submit) return;
    const recoveryRequestId = Number(state.proofRecoveryRequestId);
    const isProofRecovery = Number.isInteger(recoveryRequestId) && recoveryRequestId > 0;
    const label = elements.submit.querySelector('span:not(.portal-spinner)');
    if (label) label.textContent = isProofRecovery ? 'رفع إثبات الدفع' : 'إرسال طلب التفعيل';
    elements.submit.disabled = state.submitting || (!isProofRecovery && (!state.catalog?.plans?.length || !state.catalog?.types?.length || !state.paymentMethods.length));
  }

  function renderHistory(items = []) {
    if (!elements.history) return;
    if (!items.length) {
      hideActivation();
      elements.history.innerHTML = '<div class="portal-subscription-state">لا توجد طلبات سابقة لهذا العضو.</div>';
      return;
    }
    elements.history.innerHTML = items.map((item) => {
      const membership = item.membership || {};
      const pricing = item.pricing || {};
      const status = String(item.status || '').toLowerCase();
      const proofLabel = status === 'rejected'
        ? 'تم رفض الطلب'
        : status === 'cancelled'
          ? 'تم إلغاء الطلب'
          : item.proof?.verified
            ? 'تم إرفاق إثبات الدفع والتحقق منه'
            : 'بانتظار إثبات الدفع';
      const reviewReason = status === 'rejected' && item.reviewNotes
        ? `<small class="portal-request-history-review"><strong>سبب الرفض:</strong> ${escapeHtml(item.reviewNotes)}</small>`
        : '';
      const proofRecovery = status === 'pending' && !item.proof?.verified
        ? `<button class="btn btn-light btn-small portal-proof-retry" type="button" data-portal-proof-retry="${escapeHtml(item.id)}">رفع الإثبات</button>`
        : '';
      return `<article class="portal-request-history-row">
        <div class="portal-request-history-copy"><strong>${escapeHtml(requestTypeLabel(item.requestType))} · ${escapeHtml(membership.type || 'عضوية')}</strong><small>${formatDate(membership.startDate)} · ${formatMoney(pricing.amountDue, pricing.currency || 'EGP')} · ${proofLabel}</small>${reviewReason}</div>
        <div class="portal-request-history-actions"><span class="portal-request-history-status ${escapeHtml(status)}">${escapeHtml(statusLabel(status))}</span>${proofRecovery}</div>
      </article>`;
    }).join('');
    showActivationFor(items);
  }

  async function loadHistory() {
    const result = await requestJson('/api/member-portal/subscription-requests?page=1&pageSize=10', {}, 'تعذر تحميل سجل طلبات العضوية.');
    renderHistory(result.requests || []);
  }

  async function load() {
    if (state.loading) return;
    state.loading = true;
    setFeedback('جاري تحميل الباقات ووسائل الدفع...', '');
    try {
      const [catalog, methods, history] = await Promise.all([
        requestJson('/api/member-portal/membership-catalog', {}, 'تعذر تحميل باقات العضوية.').then((result) => result),
        requestJson('/api/member-portal/payment-methods', {}, 'تعذر تحميل وسائل الدفع الخاصة بالجيم.'),
        requestJson('/api/member-portal/subscription-requests?page=1&pageSize=10', {}, 'تعذر تحميل سجل طلبات العضوية.')
      ]);
      state.catalog = catalog;
      state.paymentMethods = Array.isArray(methods.paymentMethods) ? methods.paymentMethods : [];
      renderPlans();
      renderTypes();
      renderPaymentMethods();
      if (elements.startDate && !elements.startDate.value) elements.startDate.value = today();
      if (elements.startDate) elements.startDate.min = today();
      syncRequestTypePresentation();
      updateSummary();
      renderHistory(history.requests || []);
      setFeedback('', '');
    } catch (error) {
      setFeedback(error.message || 'تعذر تحميل بيانات الاشتراك.', 'error');
      if (elements.history) elements.history.innerHTML = '<div class="portal-subscription-state">تعذر تحميل الطلبات. حاول تحديث الصفحة.</div>';
    } finally {
      state.loading = false;
      syncSubmitState();
    }
  }

  async function uploadProof(requestId, file) {
    const response = await fetch(`/api/member-portal/subscription-requests/${encodeURIComponent(requestId)}/proof`, {
      method: 'POST',
      credentials: 'same-origin',
      headers: {
        'Content-Type': 'application/octet-stream',
        'x-payment-proof-mime': file.type || 'application/octet-stream',
        'x-payment-proof-name-encoded': encodeURIComponent(file.name || 'payment-proof')
      },
      body: await file.arrayBuffer()
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw safeError(payload, 'تعذر رفع إثبات الدفع.');
    return payload;
  }

  function randomIdempotencyKey() {
    if (window.crypto?.randomUUID) return window.crypto.randomUUID();
    return `portal-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 14)}`;
  }

  elements.plan?.addEventListener('change', updateSummary);
  elements.type?.addEventListener('change', updateSummary);
  elements.requestType?.addEventListener('change', syncRequestTypePresentation);
  elements.startDate?.addEventListener('change', updateSummary);
  elements.methodList?.addEventListener('change', (event) => {
    if (event.target.matches('input[name="portalPaymentMethod"]')) {
      elements.method.value = event.target.value;
      syncSubmitState();
    }
  });
  elements.proof?.addEventListener('change', () => {
    const file = elements.proof.files?.[0];
    if (elements.proofName) elements.proofName.textContent = file ? `${file.name} · ${(file.size / 1024 / 1024).toFixed(2)}MB` : 'اختر صورة أو ملف إثبات التحويل — الحد الأقصى 4MB';
    if (file && state.proofRecoveryRequestId) setFeedback('تم اختيار الملف. اضغط «رفع إثبات الدفع» لإكمال نفس الطلب.', '');
    syncSubmitState();
  });
  elements.history?.addEventListener('click', (event) => {
    const trigger = event.target instanceof Element ? event.target.closest('[data-portal-proof-retry]') : null;
    const requestId = Number(trigger?.dataset?.portalProofRetry);
    if (!trigger || !Number.isInteger(requestId) || requestId <= 0 || state.submitting) return;
    state.proofRecoveryRequestId = requestId;
    syncSubmitState();
    setFeedback('اختر إثبات الدفع للطلب المحدد. لن يتم إنشاء طلب جديد.', '');
    elements.proof?.click();
  });
  elements.refresh?.addEventListener('click', async () => {
    if (window.topGymFeedback) window.topGymFeedback.start(elements.refresh, { loadingText: 'جاري تحديث الطلبات...' });
    try { await loadHistory(); } catch (error) { setFeedback(error.message || 'تعذر تحديث الطلبات.', 'error'); }
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
    if (!file) { setFeedback('اختر إثبات الدفع أولًا.', 'error'); return; }
    if (file.size > 4 * 1024 * 1024) { setFeedback('حجم إثبات الدفع أكبر من الحد المسموح وهو 4MB.', 'error'); return; }
    if (!isProofRecovery && !selectedMethod()) { setFeedback('اختر وسيلة الدفع التي استخدمتها.', 'error'); return; }
    const isRenewal = elements.requestType.value === 'renewal';
    if (!isProofRecovery && !isRenewal && !elements.startDate.value) { setFeedback('حدد تاريخ بداية العضوية.', 'error'); elements.startDate.focus(); return; }
    state.submitting = true;
    syncSubmitState();
    setFeedback('', '');
    setBusy(elements.submit, true, isProofRecovery ? 'جاري رفع إثبات الدفع...' : 'جاري إرسال الطلب...');
    let requestId = isProofRecovery ? recoveryRequestId : null;
    let proofUploaded = false;
    try {
      if (!isProofRecovery) {
        const created = await requestJson('/api/member-portal/subscription-requests', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Idempotency-Key': randomIdempotencyKey() },
          body: JSON.stringify({
            requestType: elements.requestType.value,
            membershipPlan: elements.plan.value,
            membershipType: elements.type.value,
            startDate: isRenewal ? null : elements.startDate.value,
            paymentMethodCode: selectedMethod().id,
            notes: elements.notes.value
          })
        }, 'تعذر إنشاء طلب العضوية.');
        requestId = created.request?.id;
        if (!requestId) throw new Error('تعذر تحديد طلب العضوية بعد إنشائه.');
      }
      setFeedback('جاري رفع إثبات الدفع والتحقق منه...', '');
      await uploadProof(requestId, file);
      proofUploaded = true;
      state.proofRecoveryRequestId = null;
      if (isProofRecovery) {
        setFeedback('تم رفع إثبات الدفع بنجاح. سيظهر الطلب للمراجعة الآن.', 'success');
        elements.proof.value = '';
        if (elements.proofName) elements.proofName.textContent = 'اختر صورة أو ملف إثبات التحويل — الحد الأقصى 4MB';
      } else {
        setFeedback('تم استلام طلبك بنجاح. ستظهر حالته هنا بعد مراجعة إدارة الجيم.', 'success');
        elements.form.reset();
        elements.startDate.value = today();
        elements.startDate.min = today();
        syncRequestTypePresentation();
        renderPlans();
        renderTypes();
        renderPaymentMethods();
        updateSummary();
      }
      await loadHistory();
    } catch (error) {
      if (requestId && !proofUploaded) state.proofRecoveryRequestId = requestId;
      const message = requestId && !proofUploaded
        ? `${error.message || 'تعذر رفع إثبات الدفع.'} تم الاحتفاظ بالطلب الحالي؛ أعد اختيار الملف واضغط «رفع إثبات الدفع» دون إنشاء طلب جديد.`
        : (error.message || 'تعذر إرسال الطلب. حاول مرة أخرى.');
      setFeedback(message, 'error');
    } finally {
      state.submitting = false;
      setBusy(elements.submit, false);
      syncSubmitState();
    }
  });

  window.addEventListener('topgym:portal-subscription-open', () => {
    void load();
  });

  syncRequestTypePresentation();
})();
