(() => {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const form = $('portalLookupForm');
  const input = $('membershipCodeInput');
  const submit = $('portalSubmitButton');
  const errorBox = $('portalError');
  const loginPanel = $('portalLoginPanel');
  const resultPanel = $('portalResult');
  const homeView = $('portalHomeView');
  const viewToolbar = $('portalViewToolbar');
  const viewTitle = $('portalViewTitle');
  const viewDescription = $('portalViewDescription');
  const resultTitle = $('portalResultTitle');
  const reportContent = $('portalReportContent');
  const librarySection = $('portalLibrarySection');
  const feedbackSection = $('portalFeedbackSection');
  const feedbackForm = $('portalFeedbackForm');
  const feedbackSubmit = $('portalFeedbackSubmit');
  const feedbackRating = $('portalFeedbackRating');
  const feedbackType = $('portalFeedbackType');
  const feedbackMessage = $('portalFeedbackMessage');
  const feedbackError = $('portalFeedbackError');
  const feedbackSuccess = $('portalFeedbackSuccess');
  let portalMembershipCode = '';
  let portalReportMeta = '';
  let libraryLoaderPromise = null;
  let activePortalView = 'home';

  const brandName = () => String(window.topGymBranding?.get?.().identity?.brandName || 'Logic Fit').trim() || 'Logic Fit';

  const portalViews = Object.freeze({
    home: { title: 'بوابة عضويتي', description: 'اختر الخدمة التي تريد استخدامها' },
    report: { title: 'بياناتي وطباعتها', description: 'عرض حالة العضوية والاشتراكات والمدفوعات والحضور.' },
    feedback: { title: 'قيّم تجربتي', description: 'شاركنا رأيك في الجيم والمدربين.' },
    exercises: { title: 'دليل التمارين', description: 'ابحث عن التمرين بالاسم وحدد المستوى والأداة المناسبة.' },
    foods: { title: 'دليل التغذية', description: 'ابحث عن الطعام وتعرّف على السعرات والماكروز لكل حصة.' }
  });

  const escapeHtml = (value) => String(value ?? '').replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[character]));
  const number = (value) => Number.isFinite(Number(value)) ? Number(value) : 0;
  const money = (value) => `${number(value).toLocaleString('ar-EG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ج.م`;
  const dateText = (value) => {
    if (!value) return '—';
    const raw = String(value).slice(0, 10);
    const date = new Date(`${raw}T00:00:00`);
    return Number.isNaN(date.getTime()) ? String(value) : new Intl.DateTimeFormat('ar-EG-u-ca-gregory', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(date);
  };
  const dateTimeText = (value) => {
    if (!value) return '—';
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? String(value) : new Intl.DateTimeFormat('ar-EG-u-ca-gregory', { dateStyle: 'medium', timeStyle: 'short' }).format(date);
  };
  const initials = (name) => String(name || 'م').trim().split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join('') || 'م';
  const planLabel = (value) => ({ gym_only: 'جيم فقط', gym_cardio: 'جيم وكارديو' }[value] || value || '—');
  const typeLabel = (value) => ({ monthly: 'شهرية', half_month: 'نصف شهر', quarterly: 'ربع سنوية', semiannual: 'نصف سنوية', annual: 'سنوية' }[value] || value || '—');
  const statusLabel = (value) => ({ active: 'نشطة', expiring_soon: 'قريبة الانتهاء', expired: 'منتهية', frozen: 'مجمدة' }[value] || 'بدون حالة');
  const paymentLabel = (value) => ({ cash: 'نقدي', card: 'بطاقة', transfer: 'تحويل', other: 'أخرى' }[value] || value || '—');

  function setLoading(value) {
    submit.disabled = value;
    submit.setAttribute('aria-busy', String(value));
  }

  function showError(message) {
    errorBox.textContent = message;
    errorBox.hidden = !message;
  }

  function setFeedbackBusy(value) {
    if (!feedbackSubmit) return;
    feedbackSubmit.disabled = value;
    feedbackSubmit.setAttribute('aria-busy', String(value));
  }

  function showFeedbackError(message) {
    if (!feedbackError) return;
    feedbackError.textContent = message || '';
    feedbackError.hidden = !message;
  }

  function setRating(value) {
    const rating = Number(value) || 0;
    if (feedbackRating) feedbackRating.value = rating ? String(rating) : '';
    document.querySelectorAll('[data-feedback-rating]').forEach((button) => {
      const active = Number(button.dataset.feedbackRating) <= rating;
      button.classList.toggle('is-selected', active);
      button.setAttribute('aria-checked', String(Number(button.dataset.feedbackRating) === rating));
    });
  }

  function resetFeedback() {
    feedbackForm?.reset();
    setRating(0);
    showFeedbackError('');
    if (feedbackSuccess) feedbackSuccess.hidden = true;
  }

  function setPortalView(view = 'home') {
    const nextView = portalViews[view] ? view : 'home';
    const metadata = { ...portalViews[nextView] };
    if (nextView === 'feedback') metadata.description = `شاركنا رأيك في ${brandName()} والمدربين.`;
    activePortalView = nextView;
    const isHome = nextView === 'home';
    const isReport = nextView === 'report';
    const isLibrary = nextView === 'exercises' || nextView === 'foods';

    if (!isLibrary) window.topGymMemberPortalLibrary?.close?.();
    if (homeView) homeView.hidden = !isHome;
    if (viewToolbar) viewToolbar.hidden = isHome;
    if (viewTitle) viewTitle.textContent = metadata.title;
    if (viewDescription) viewDescription.textContent = metadata.description;
    if (resultTitle) resultTitle.textContent = metadata.title;
    if (reportContent) reportContent.hidden = !isReport;
    if (librarySection) librarySection.hidden = !isLibrary;
    if (feedbackSection) feedbackSection.hidden = nextView !== 'feedback';
    if ($('portalPrintButton')) $('portalPrintButton').hidden = !isReport;
    if ($('portalPdfButton')) $('portalPdfButton').hidden = !isReport;
    if ($('portalIssueMeta')) $('portalIssueMeta').textContent = isReport ? portalReportMeta : metadata.description;
  }

  function ensureLibraryFeature() {
    if (window.topGymMemberPortalLibrary) return Promise.resolve(window.topGymMemberPortalLibrary);
    if (libraryLoaderPromise) return libraryLoaderPromise;
    libraryLoaderPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = '/js/member-portal-library.js?v=4';
      script.async = true;
      script.onload = () => window.topGymMemberPortalLibrary ? resolve(window.topGymMemberPortalLibrary) : reject(new Error('Library feature did not initialize.'));
      script.onerror = () => reject(new Error('تعذر تحميل دليل التمارين والتغذية.'));
      document.body.appendChild(script);
    });
    return libraryLoaderPromise;
  }

  async function openLibrary(type) {
    if (!librarySection) return;
    setPortalView(type);
    viewToolbar?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    try {
      const feature = await ensureLibraryFeature();
      feature.open(type);
    } catch (error) {
      const mount = $('portalLibraryMount');
      if (mount) mount.innerHTML = `<div class="portal-library-state portal-library-error"><strong>تعذر فتح الدليل</strong><span>${escapeHtml(error.message || 'حاول مرة أخرى.')}</span></div>`;
    }
  }

  function tableCell(label, value, className = '') {
    const classAttribute = className ? ` class="${className}"` : '';
    const valueClass = ['portal-table-cell-value', className].filter(Boolean).join(' ');
    return `<td${classAttribute} data-label="${escapeHtml(label)}"><span class="${valueClass}">${value}</span></td>`;
  }

  function table(title, headers, rows, emptyText = 'لا توجد بيانات مسجلة.', className = '') {
    const sectionClass = ['portal-section', className].filter(Boolean).join(' ');
    const countLabel = rows.length ? `${rows.length.toLocaleString('ar-EG')} ${rows.length === 1 ? 'سجل' : 'سجلات'}` : 'لا توجد سجلات';
    return `<section class="${sectionClass}" aria-label="${escapeHtml(title)}"><div class="portal-section-heading"><div><span class="portal-section-kicker">سجل العضوية</span><h3>${escapeHtml(title)}</h3></div><span class="portal-section-count">${countLabel}</span></div>${rows.length ? `<div class="portal-table-wrap"><table class="portal-table"><thead><tr>${headers.map((header) => `<th>${escapeHtml(header)}</th>`).join('')}</tr></thead><tbody>${rows.join('')}</tbody></table></div>` : `<div class="portal-empty">${escapeHtml(emptyText)}</div>`}</section>`;
  }

  function render(data) {
    const member = data.member || {};
    const current = data.currentMembership || {};
    const status = current.status || 'expired';
    const summary = data.financialSummary || {};
    const firstJoin = data.firstJoinDate || member.registrationDate;
    const remainingClass = number(summary.totalRemaining) > 0 ? 'portal-outstanding' : '';
    const membershipRows = (data.memberships || []).map((item) => `<tr>${tableCell('الباقة والمدة', `${escapeHtml(planLabel(item.plan))}<small>${escapeHtml(typeLabel(item.type))}</small>`)}${tableCell('الفترة', `${dateText(item.startDate)}<br>حتى ${dateText(item.effectiveEndDate || item.endDate)}`, 'portal-ltr')}${tableCell('الحالة', `<span class="portal-status ${escapeHtml(item.status || '')}">${escapeHtml(statusLabel(item.status))}</span>`)}${tableCell('الحساب', `${money(item.amountDue)}<br><small>مدفوع ${money(item.amountPaid)} · متبقي ${money(item.amountRemaining)}</small>`, 'portal-money')}</tr>`);
    const paymentRows = (data.payments || []).map((item) => `<tr>${tableCell('الإيصال', escapeHtml(item.receiptNumber || '—'), 'portal-ltr')}${tableCell('التاريخ', dateTimeText(item.transactionDate || item.createdAt))}${tableCell('العملية', escapeHtml(item.transactionType === 'subscription' ? 'اشتراك' : item.transactionType === 'adjustment' ? 'تسوية' : 'دفعة'))}${tableCell('المدفوع', money(item.amountPaid), 'portal-money')}${tableCell('المتبقي', money(item.amountRemaining), `portal-money ${number(item.amountRemaining) > 0 ? 'portal-debt' : ''}`)}${tableCell('طريقة الدفع', escapeHtml(paymentLabel(item.paymentMethod)))}</tr>`);
    const attendanceRows = (data.attendance || []).map((item) => `<tr>${tableCell('التاريخ', dateText(item.attendanceDate), 'portal-ltr')}${tableCell('الحضور', dateTimeText(item.checkInAt))}${tableCell('الانصراف', item.checkOutAt ? dateTimeText(item.checkOutAt) : `داخل ${escapeHtml(brandName())}`)}${tableCell('المدة', item.durationMinutes == null ? '—' : `${number(item.durationMinutes)} دقيقة`)}</tr>`);
    const freezeRows = (data.freezes || []).map((item) => `<tr>${tableCell('البداية', dateText(item.startDate))}${tableCell('النهاية', dateText(item.endDate))}${tableCell('الاستئناف', item.resumedDate ? dateText(item.resumedDate) : 'مستمر')}${tableCell('المدة', `${number(item.days)} يوم`)}</tr>`);
    const currentEndDate = current.effectiveEndDate || current.endDate;
    const daysRemaining = current.daysRemaining == null ? '—' : current.daysRemaining >= 0 ? `${number(current.daysRemaining)} يوم` : 'منتهية';
    const tenantName = String(data.tenant?.name || brandName()).trim() || brandName();
    reportContent.innerHTML = `
      <section class="portal-member-identity">
        <div class="portal-member-primary"><span class="portal-member-avatar" aria-hidden="true">${escapeHtml(initials(member.fullName))}</span><div class="portal-member-copy"><h3>${escapeHtml(member.fullName || '—')}</h3><p class="portal-member-contact"><span>الهاتف</span><b class="portal-ltr">${escapeHtml(member.phone || '—')}</b></p><p class="portal-member-contact"><span>البريد الإلكتروني</span><b>${escapeHtml(member.email || '—')}</b></p></div></div>
        <div class="portal-member-status-block"><span>حالة العضوية</span><span class="portal-status ${escapeHtml(status)}">${escapeHtml(statusLabel(status))}</span></div>
      </section>
      <section class="portal-membership-overview" aria-labelledby="portalMembershipOverviewTitle">
        <header class="portal-membership-overview-head"><div><span class="portal-section-kicker">MEMBERSHIP PROFILE</span><h3 id="portalMembershipOverviewTitle">ملخص العضوية</h3><p>بيانات العضوية الحالية لهذا المشترك فقط</p></div><span class="portal-membership-scope"><span aria-hidden="true">⌂</span>${escapeHtml(tenantName)}</span></header>
        <div class="portal-membership-facts"><article class="portal-membership-fact portal-membership-fact-featured"><span>الباقة</span><strong>${escapeHtml(planLabel(current.plan))}</strong><small>${escapeHtml(typeLabel(current.type))}</small></article><article class="portal-membership-fact"><span>تاريخ البداية</span><strong class="portal-ltr">${dateText(current.startDate)}</strong><small>بداية الاشتراك الحالي</small></article><article class="portal-membership-fact"><span>تاريخ الانتهاء</span><strong class="portal-ltr">${dateText(currentEndDate)}</strong><small>${escapeHtml(daysRemaining)} ${current.daysRemaining == null || current.daysRemaining < 0 ? '' : 'متبقي'}</small></article><article class="portal-membership-fact"><span>أول انضمام</span><strong class="portal-ltr">${dateText(firstJoin)}</strong><small>تاريخ بداية الملف</small></article></div>
      </section>
      <section class="portal-stat-grid portal-financial-grid" aria-label="ملخص الزيارات والحساب"><article class="portal-stat"><span>إجمالي الزيارات</span><strong>${number(data.attendanceSummary?.totalVisits).toLocaleString('ar-EG')}</strong><small>سجل حضور كامل</small></article><article class="portal-stat"><span>إجمالي المستحق</span><strong>${money(summary.totalDue)}</strong><small>قيمة الاشتراكات</small></article><article class="portal-stat"><span>إجمالي المدفوع</span><strong>${money(summary.totalPaid)}</strong><small>المدفوع حتى الآن</small></article><article class="portal-stat"><span>المبلغ المتبقي</span><strong class="${remainingClass}">${money(summary.totalRemaining)}</strong><small>الرصيد الحالي</small></article></section>
      ${table('الاشتراكات والتجديدات', ['الباقة والمدة', 'الفترة', 'الحالة', 'الحساب'], membershipRows, 'لا توجد اشتراكات مسجلة.', 'portal-membership-history')}
      ${table('سجل المدفوعات والإيصالات', ['الإيصال', 'التاريخ', 'العملية', 'المدفوع', 'المتبقي', 'طريقة الدفع'], paymentRows, 'لا توجد مدفوعات مسجلة.', 'portal-payments-history')}
      ${table('سجل الحضور والزيارات', ['التاريخ', 'الحضور', 'الانصراف', 'المدة'], attendanceRows, 'لا توجد زيارات مسجلة.', 'portal-attendance-history')}
      ${freezeRows.length ? table('حالات التجميد أو الإيقاف', ['البداية', 'النهاية', 'الاستئناف', 'المدة'], freezeRows, 'لا توجد حالات تجميد.', 'portal-freeze-history') : ''}`;
    portalReportMeta = `رقم التقرير: ${data.reportNumber || '—'} · تاريخ الإصدار: ${dateTimeText(data.issuedAt)}`;
    resetFeedback();
    setPortalView('home');
  }

  function portalTenantSlug() {
    const bodyTenant = String(document.body?.dataset?.brandingTenant || '').trim().toLowerCase();
    if (bodyTenant) return bodyTenant;
    try { return String(new URLSearchParams(window.location.search).get('tenant') || '').trim().toLowerCase(); } catch (_) { return ''; }
  }

  function applyTenantBrandingFallback(tenant) {
    const name = String(tenant?.name || '').trim().slice(0, 120);
    const brandingApi = window.topGymBranding;
    if (!name || typeof brandingApi?.fallback !== 'function' || typeof brandingApi?.apply !== 'function') return;
    const fallback = brandingApi.fallback();
    fallback.identity = {
      ...(fallback.identity || {}),
      brandName: name,
      shortName: name.slice(0, 30),
      companyName: name
    };
    brandingApi.apply(fallback, 1);
  }

  async function applyPortalTenant(tenant) {
    const slug = String(tenant?.slug || '').trim().toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 80);
    if (!slug) return { loaded: false };
    document.body.dataset.brandingTenant = slug;
    const refresh = window.topGymBranding?.refresh;
    if (typeof refresh !== 'function') {
      applyTenantBrandingFallback(tenant);
      return { loaded: false };
    }
    const result = await refresh.call(window.topGymBranding, { scope: 'tenant', resetOnFailure: true });
    if (!result?.loaded) applyTenantBrandingFallback(tenant);
    return result;
  }

  function resetPortalTenant() {
    delete document.body.dataset.brandingTenant;
    const brandingApi = window.topGymBranding;
    if (typeof brandingApi?.fallback === 'function' && typeof brandingApi?.apply === 'function') {
      brandingApi.apply(brandingApi.fallback(), 1);
    }
    const refresh = brandingApi?.refresh;
    if (typeof refresh === 'function') void refresh.call(brandingApi, { scope: 'platform', resetOnFailure: true });
  }

  async function lookup(code) {
    const response = await fetch('/api/member-portal/lookup', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ membershipCode: code, tenantSlug: portalTenantSlug() || undefined })
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(response.status === 429 ? payload.error : 'تعذر عرض بيانات العضوية. تأكد من الكود وحاول مرة أخرى.');
    return payload;
  }

  function printReport() {
    window.print();
  }

  form?.addEventListener('submit', async (event) => {
    event.preventDefault();
    showError('');
    const code = String(input.value || '').trim();
    if (!code) { showError('أدخل كود العضوية أولًا.'); input.focus(); return; }
    setLoading(true);
    try {
      const data = await lookup(code);
      await applyPortalTenant(data.tenant);
      render(data);
      portalMembershipCode = code;
      input.value = '';
      loginPanel.hidden = true;
      resultPanel.hidden = false;
      resultPanel.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch (error) {
      showError(error.message || 'تعذر عرض بيانات العضوية.');
    } finally { setLoading(false); }
  });
  $('portalPrintButton')?.addEventListener('click', printReport);
  $('portalPdfButton')?.addEventListener('click', printReport);
  resultPanel?.addEventListener('click', (event) => {
    if (event.target.closest('[data-portal-back]')) {
      setPortalView('home');
      resultPanel.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }
    const tool = event.target.closest('[data-portal-tool]');
    if (!tool) return;
    const action = tool.dataset.portalTool;
    if (action === 'print') { setPortalView('report'); return; }
    if (action === 'feedback') {
      setPortalView('feedback');
      viewToolbar?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }
    if (action === 'exercises' || action === 'foods') void openLibrary(action);
  });
  window.addEventListener('topgym:portal-library-close', () => {
    setPortalView('home');
    resultPanel?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
  window.addEventListener('topgym:brandingchange', () => {
    if (activePortalView === 'feedback') setPortalView(activePortalView);
  });
  document.querySelectorAll('[data-feedback-rating]').forEach((button) => {
    button.addEventListener('click', () => setRating(button.dataset.feedbackRating));
  });
  feedbackForm?.addEventListener('submit', async (event) => {
    event.preventDefault();
    showFeedbackError('');
    if (feedbackSuccess) feedbackSuccess.hidden = true;
    const rating = Number(feedbackRating?.value || 0);
    const noteType = String(feedbackType?.value || '');
    const message = String(feedbackMessage?.value || '').trim();
    if (!portalMembershipCode) { showFeedbackError('أعد إدخال كود العضوية لفتح البوابة.'); return; }
    if (!rating) { showFeedbackError('اختر تقييمًا من نجمة إلى 5 نجوم.'); return; }
    if (!noteType) { showFeedbackError('اختر نوع الملاحظة.'); feedbackType?.focus(); return; }
    if (message.length < 3) { showFeedbackError('اكتب ملاحظتك قبل إرسال التقييم.'); feedbackMessage?.focus(); return; }
    setFeedbackBusy(true);
    try {
      const response = await fetch('/api/member-portal/feedback', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ membershipCode: portalMembershipCode, tenantSlug: portalTenantSlug() || undefined, rating, noteType, message })
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(response.status === 429 ? payload.error : payload.error || 'تعذر حفظ التقييم. حاول مرة أخرى.');
      resetFeedback();
      if (feedbackSuccess) feedbackSuccess.hidden = false;
    } catch (error) {
      showFeedbackError(error.message || 'تعذر حفظ التقييم.');
    } finally { setFeedbackBusy(false); }
  });
  $('portalResetButton')?.addEventListener('click', () => {
    portalMembershipCode = '';
    portalReportMeta = '';
    resetPortalTenant();
    setPortalView('home');
    resetFeedback();
    resultPanel.hidden = true;
    loginPanel.hidden = false;
    input.focus();
  });
})();
