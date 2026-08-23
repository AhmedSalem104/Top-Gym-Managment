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

  const portalViews = Object.freeze({
    home: { title: 'بوابة عضويتي', description: 'اختر الخدمة التي تريد استخدامها' },
    report: { title: 'بياناتي وطباعتها', description: 'عرض حالة العضوية والاشتراكات والمدفوعات والحضور.' },
    feedback: { title: 'قيّم تجربتي', description: 'شاركنا رأيك في الجيم والمدربين.' },
    exercises: { title: 'دليل التمارين', description: 'اختر منطقة الجسم أو ابحث عن تمرين مناسب.' },
    foods: { title: 'دليل التغذية', description: 'ابحث عن الطعام وتعرّف على السعرات والماكروز.' }
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
    const metadata = portalViews[nextView];
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
      script.src = '/js/member-portal-library.js?v=2';
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

  function table(title, headers, rows, emptyText = 'لا توجد بيانات مسجلة.') {
    return `<section class="portal-section"><h3>${title}</h3>${rows.length ? `<div class="portal-table-wrap"><table class="portal-table"><thead><tr>${headers.map((header) => `<th>${header}</th>`).join('')}</tr></thead><tbody>${rows.join('')}</tbody></table></div>` : `<div class="portal-empty">${emptyText}</div>`}</section>`;
  }

  function render(data) {
    const member = data.member || {};
    const current = data.currentMembership || {};
    const status = current.status || 'expired';
    const summary = data.financialSummary || {};
    const firstJoin = data.firstJoinDate || member.registrationDate;
    const remainingClass = number(summary.totalRemaining) > 0 ? 'portal-outstanding' : '';
    const membershipRows = (data.memberships || []).map((item) => `<tr><td>${escapeHtml(planLabel(item.plan))}<small>${escapeHtml(typeLabel(item.type))}</small></td><td class="portal-ltr">${dateText(item.startDate)}<br>حتى ${dateText(item.effectiveEndDate || item.endDate)}</td><td><span class="portal-status ${escapeHtml(item.status || '')}">${escapeHtml(statusLabel(item.status))}</span></td><td class="portal-money">${money(item.amountDue)}<br><small>مدفوع ${money(item.amountPaid)} · متبقي ${money(item.amountRemaining)}</small></td></tr>`);
    const paymentRows = (data.payments || []).map((item) => `<tr><td class="portal-ltr">${escapeHtml(item.receiptNumber || '—')}</td><td>${dateTimeText(item.transactionDate || item.createdAt)}</td><td>${escapeHtml(item.transactionType === 'subscription' ? 'اشتراك' : item.transactionType === 'adjustment' ? 'تسوية' : 'دفعة')}</td><td class="portal-money">${money(item.amountPaid)}</td><td class="portal-money ${number(item.amountRemaining) > 0 ? 'portal-debt' : ''}">${money(item.amountRemaining)}</td><td>${escapeHtml(paymentLabel(item.paymentMethod))}</td></tr>`);
    const attendanceRows = (data.attendance || []).map((item) => `<tr><td class="portal-ltr">${dateText(item.attendanceDate)}</td><td>${dateTimeText(item.checkInAt)}</td><td>${item.checkOutAt ? dateTimeText(item.checkOutAt) : 'داخل الجيم'}</td><td>${item.durationMinutes == null ? '—' : `${number(item.durationMinutes)} دقيقة`}</td></tr>`);
    const freezeRows = (data.freezes || []).map((item) => `<tr><td>${dateText(item.startDate)}</td><td>${dateText(item.endDate)}</td><td>${item.resumedDate ? dateText(item.resumedDate) : 'مستمر'}</td><td>${number(item.days)} يوم</td></tr>`);
    reportContent.innerHTML = `
      <section class="portal-member-identity"><span class="portal-member-avatar" aria-hidden="true">${escapeHtml(initials(member.fullName))}</span><div><h3>${escapeHtml(member.fullName || '—')}</h3><p class="portal-ltr">${escapeHtml(member.phone || '—')}</p><p>${member.email ? escapeHtml(member.email) : `تاريخ أول انضمام: ${dateText(firstJoin)}`}</p></div><span class="portal-status ${escapeHtml(status)}">${escapeHtml(statusLabel(status))}</span></section>
      <section class="portal-stat-grid"><article class="portal-stat"><span>الاشتراك الحالي</span><strong>${escapeHtml(planLabel(current.plan))}</strong><small>${escapeHtml(typeLabel(current.type))}</small></article><article class="portal-stat"><span>تاريخ الانتهاء</span><strong class="portal-ltr">${dateText(current.effectiveEndDate || current.endDate)}</strong><small>${current.daysRemaining == null ? '—' : current.daysRemaining >= 0 ? `${number(current.daysRemaining)} يوم متبقي` : 'منتهية'}</small></article><article class="portal-stat"><span>إجمالي الزيارات</span><strong>${number(data.attendanceSummary?.totalVisits).toLocaleString('ar-EG')}</strong><small>سجل حضور كامل</small></article><article class="portal-stat"><span>المبلغ المتبقي</span><strong class="${remainingClass}">${money(summary.totalRemaining)}</strong><small>من إجمالي ${money(summary.totalDue)}</small></article></section>
      ${table('الاشتراكات والتجديدات', ['الباقة والمدة', 'الفترة', 'الحالة', 'الحساب'], membershipRows)}
      ${table('سجل المدفوعات والإيصالات', ['الإيصال', 'التاريخ', 'العملية', 'المدفوع', 'المتبقي', 'طريقة الدفع'], paymentRows)}
      ${table('سجل الحضور والزيارات', ['التاريخ', 'الحضور', 'الانصراف', 'المدة'], attendanceRows)}
      ${freezeRows.length ? table('حالات التجميد أو الإيقاف', ['البداية', 'النهاية', 'الاستئناف', 'المدة'], freezeRows) : ''}`;
    portalReportMeta = `رقم التقرير: ${data.reportNumber || '—'} · تاريخ الإصدار: ${dateTimeText(data.issuedAt)}`;
    resetFeedback();
    setPortalView('home');
  }

  async function lookup(code) {
    const response = await fetch('/api/member-portal/lookup', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ membershipCode: code })
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
        body: JSON.stringify({ membershipCode: portalMembershipCode, rating, noteType, message })
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
    setPortalView('home');
    resetFeedback();
    resultPanel.hidden = true;
    loginPanel.hidden = false;
    input.focus();
  });
})();
