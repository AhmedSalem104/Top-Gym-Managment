(() => {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const i18n = window.TopGymI18n;
  const tr = (key, params) => i18n?.t?.(`memberPortal.${key}`, params) || key;
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
  const subscriptionSection = $('portalSubscriptionSection');
  const feedbackForm = $('portalFeedbackForm');
  const feedbackSubmit = $('portalFeedbackSubmit');
  const feedbackRating = $('portalFeedbackRating');
  const feedbackType = $('portalFeedbackType');
  const feedbackMessage = $('portalFeedbackMessage');
  const feedbackError = $('portalFeedbackError');
  const feedbackSuccess = $('portalFeedbackSuccess');
  const occupancyCard = $('portalOccupancyCard');
  const occupancyCount = $('portalOccupancyCount');
  const occupancyStatus = $('portalOccupancyStatus');
  const occupancyStatusText = $('portalOccupancyStatusText');
  const occupancyStatusHint = $('portalOccupancyStatusHint');
  const occupancyUpdated = $('portalOccupancyUpdated');
  const occupancyNote = $('portalOccupancyNote');
  const occupancyRefresh = $('portalOccupancyRefresh');
  const trainerOverview = $('portalTrainerOverview');
  const trainerOverviewContent = $('portalTrainerOverviewContent');
  let portalMembershipCode = '';
  let portalReportMeta = '';
  let portalDisplayMember = null;
  let libraryLoaderPromise = null;
  let activePortalView = 'home';
  let occupancyRefreshTimer = null;
  let occupancyRequestController = null;
  let occupancyRequestSequence = 0;
  let portalViewData = null;
  let occupancySnapshot = null;
  let occupancyHasError = false;

  const brandName = () => String(window.topGymBranding?.get?.().identity?.brandName || 'Logic Fit').trim() || 'Logic Fit';

  const portalViews = Object.freeze({
    home: { title: 'view.home.title', description: 'view.home.description' },
    report: { title: 'view.report.title', description: 'view.report.description' },
    feedback: { title: 'view.feedback.title', description: 'view.feedback.description' },
    subscription: { title: 'view.subscription.title', description: 'view.subscription.description' },
    exercises: { title: 'view.exercises.title', description: 'view.exercises.description' },
    foods: { title: 'view.foods.title', description: 'view.foods.description' }
  });

  const escapeHtml = (value) => String(value ?? '').replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[character]));
  const displayPhone = (value, iso = '') => window.LogicFitPhoneInputs?.formatForDisplay?.(value, iso) || String(value || '');
  const refreshPortalPhoneDisplay = () => {
    const formatted = displayPhone(portalDisplayMember?.phone, portalDisplayMember?.phoneCountry) || '—';
    document.querySelectorAll('[data-portal-phone-display]').forEach((element) => { element.textContent = formatted; });
  };
  window.addEventListener('logicfit:phone-formatter-ready', refreshPortalPhoneDisplay);
  window.addEventListener('logicfit:phone-catalog-ready', refreshPortalPhoneDisplay);
  const number = (value) => Number.isFinite(Number(value)) ? Number(value) : 0;
  const formatNumber = (value, options = {}) => i18n?.format?.('number', value, options) || String(value ?? 0);
  const money = (value) => i18n?.format?.('currency', number(value), { currency: 'EGP', minimumFractionDigits: 2, maximumFractionDigits: 2 }) || `${number(value).toLocaleString('ar-EG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ج.م`;
  const dateText = (value) => {
    if (!value) return '—';
    const raw = String(value).slice(0, 10);
    const date = new Date(`${raw}T00:00:00`);
    return Number.isNaN(date.getTime()) ? String(value) : (i18n?.format?.('date', raw, { day: '2-digit', month: '2-digit', year: 'numeric' }) || new Intl.DateTimeFormat('ar-EG-u-ca-gregory', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(date));
  };
  const dateTimeText = (value) => {
    if (!value) return '—';
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? String(value) : (i18n?.format?.('date', value, { dateStyle: 'medium', timeStyle: 'short' }) || new Intl.DateTimeFormat('ar-EG-u-ca-gregory', { dateStyle: 'medium', timeStyle: 'short' }).format(date));
  };
  const initials = (name) => String(name || 'م').trim().split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join('') || 'م';
  const planLabel = (value) => ({ gym_only: tr('data.plan.gymOnly'), gym_cardio: tr('data.plan.gymCardio') }[value] || value || '—');
  const typeLabel = (value) => ({ monthly: tr('data.type.monthly'), half_month: tr('data.type.halfMonth'), quarterly: tr('data.type.quarterly'), semiannual: tr('data.type.semiannual'), annual: tr('data.type.annual') }[value] || value || '—');
  const statusLabel = (value) => ({ active: tr('data.status.active'), expiring_soon: tr('data.status.expiring'), expired: tr('data.status.expired'), frozen: tr('data.status.frozen') }[value] || tr('data.status.none'));
  const paymentLabel = (value) => ({ cash: tr('data.payment.cash'), card: tr('data.payment.card'), transfer: tr('data.payment.transfer'), other: tr('data.payment.other') }[value] || value || '—');

  function setLoading(value) {
    if (window.topGymFeedback) {
      if (value) window.topGymFeedback.start(submit, { loadingText: tr('lookup.loading') });
      else window.topGymFeedback.stop(submit);
      return;
    }
    submit.disabled = value;
    submit.setAttribute('aria-busy', String(value));
  }

  function showError(message) {
    errorBox.textContent = message;
    errorBox.hidden = !message;
  }

  function setFeedbackBusy(value) {
    if (!feedbackSubmit) return;
    if (window.topGymFeedback) {
      if (value) window.topGymFeedback.start(feedbackSubmit, { loadingText: tr('feedback.sending') });
      else window.topGymFeedback.stop(feedbackSubmit);
      return;
    }
    feedbackSubmit.disabled = value;
    feedbackSubmit.setAttribute('aria-busy', String(value));
  }

  function showFeedbackError(message) {
    if (!feedbackError) return;
    feedbackError.textContent = message || '';
    feedbackError.hidden = !message;
  }

  const occupancyLevels = Object.freeze({
    quiet: { label: 'occupancy.quiet', hint: 'occupancy.quietHint', className: 'quiet' },
    moderate: { label: 'occupancy.moderate', hint: 'occupancy.moderateHint', className: 'moderate' },
    busy: { label: 'occupancy.busy', hint: 'occupancy.busyHint', className: 'busy' },
    very_busy: { label: 'occupancy.veryBusy', hint: 'occupancy.veryBusyHint', className: 'very_busy' }
  });

  function clearOccupancyTimer() {
    if (occupancyRefreshTimer) window.clearTimeout(occupancyRefreshTimer);
    occupancyRefreshTimer = null;
  }

  function stopOccupancyRequest() {
    occupancyRequestSequence += 1;
    occupancyRequestController?.abort();
    occupancyRequestController = null;
  }

  function resetOccupancyDisplay() {
    if (!occupancyCard) return;
    occupancyCard.hidden = true;
    if (occupancyCount) occupancyCount.textContent = '—';
    if (occupancyStatus) occupancyStatus.className = 'portal-occupancy-status is-loading';
    occupancySnapshot = null;
    occupancyHasError = false;
    if (occupancyStatusText) occupancyStatusText.textContent = tr('occupancy.loading');
    if (occupancyStatusHint) occupancyStatusHint.textContent = tr('occupancy.safeEstimate');
    if (occupancyUpdated) occupancyUpdated.textContent = tr('occupancy.autoRefresh');
    if (occupancyNote) occupancyNote.textContent = tr('occupancy.note');
  }

  function setOccupancyBusy(value) {
    if (!occupancyRefresh) return;
    if (window.topGymFeedback) {
    if (value) window.topGymFeedback.start(occupancyRefresh, { loadingText: tr('occupancy.refreshing') });
      else window.topGymFeedback.stop(occupancyRefresh);
      return;
    }
    occupancyRefresh.disabled = value;
    occupancyRefresh.setAttribute('aria-busy', String(value));
  }

  function renderOccupancy(data) {
    if (!occupancyCard) return;
    const count = Math.max(0, Math.floor(number(data?.presentCount)));
    const level = occupancyLevels[data?.level] || occupancyLevels.quiet;
    occupancyCard.hidden = false;
    occupancySnapshot = data;
    occupancyHasError = false;
    if (occupancyCount) occupancyCount.textContent = formatNumber(count);
    if (occupancyStatus) occupancyStatus.className = `portal-occupancy-status ${level.className}`;
    if (occupancyStatusText) occupancyStatusText.textContent = tr(level.label);
    if (occupancyStatusHint) occupancyStatusHint.textContent = tr(level.hint);
    if (occupancyUpdated) occupancyUpdated.textContent = tr('occupancy.lastUpdated', { date: dateTimeText(data?.observedAt) });
    const staleCount = Math.max(0, Math.floor(number(data?.staleCheckInsExcluded)));
    if (occupancyNote) {
      occupancyNote.textContent = staleCount
        ? tr('occupancy.staleExcluded', { count: staleCount })
        : tr('occupancy.note');
    }
  }

  function showOccupancyError() {
    if (!occupancyCard) return;
    occupancyCard.hidden = false;
    if (occupancyStatus) occupancyStatus.className = 'portal-occupancy-status error';
    occupancyHasError = true;
    if (occupancyStatusText) occupancyStatusText.textContent = tr('occupancy.error');
    if (occupancyStatusHint) occupancyStatusHint.textContent = tr('occupancy.retryHint');
    if (occupancyUpdated) occupancyUpdated.textContent = tr('occupancy.savedReading');
  }

  async function refreshOccupancy({ silent = false } = {}) {
    if (!portalMembershipCode || !occupancyCard) return;
    const requestSequence = ++occupancyRequestSequence;
    occupancyRequestController?.abort();
    const controller = new AbortController();
    occupancyRequestController = controller;
    occupancyCard.hidden = false;
    if (!silent) setOccupancyBusy(true);
    try {
      const response = await fetch('/api/member-portal/occupancy', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ membershipCode: portalMembershipCode }),
        signal: controller.signal
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(response.status === 429 ? 'RATE_LIMITED' : 'OCCUPANCY_UNAVAILABLE');
      if (requestSequence !== occupancyRequestSequence || controller.signal.aborted) return;
      renderOccupancy(payload);
    } catch (error) {
      if (error?.name === 'AbortError' || requestSequence !== occupancyRequestSequence) return;
      showOccupancyError();
    } finally {
      if (occupancyRequestController === controller) occupancyRequestController = null;
      if (!silent) setOccupancyBusy(false);
    }
  }

  function scheduleOccupancyRefresh(delayMs = 30_000) {
    clearOccupancyTimer();
    if (!portalMembershipCode || document.hidden) return;
    occupancyRefreshTimer = window.setTimeout(async () => {
      occupancyRefreshTimer = null;
      await refreshOccupancy({ silent: true });
      scheduleOccupancyRefresh();
    }, Math.max(15_000, Number(delayMs) || 30_000));
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
    const metadata = {
      title: tr(portalViews[nextView].title),
      description: tr(portalViews[nextView].description, { brand: brandName() })
    };
    activePortalView = nextView;
    const isHome = nextView === 'home';
    const isReport = nextView === 'report';
    const isLibrary = nextView === 'exercises' || nextView === 'foods';

    if (!isLibrary) window.topGymMemberPortalLibrary?.close?.();
    if (homeView) homeView.hidden = !isHome;
    if (viewToolbar) viewToolbar.hidden = isHome || isLibrary;
    if (viewTitle) {
      viewTitle.dataset.i18n = `memberPortal.${portalViews[nextView].title}`;
      viewTitle.textContent = metadata.title;
    }
    if (viewDescription) {
      viewDescription.dataset.i18n = `memberPortal.${portalViews[nextView].description}`;
      viewDescription.dataset.i18nParamBrand = brandName();
      viewDescription.textContent = metadata.description;
    }
    if (resultTitle) resultTitle.textContent = metadata.title;
    if (reportContent) reportContent.hidden = !isReport;
    if (librarySection) librarySection.hidden = !isLibrary;
    if (feedbackSection) feedbackSection.hidden = nextView !== 'feedback';
    if (subscriptionSection) subscriptionSection.hidden = nextView !== 'subscription';
    if ($('portalPrintButton')) $('portalPrintButton').hidden = !isReport;
    if ($('portalPdfButton')) $('portalPdfButton').hidden = !isReport;
    const issueMeta = $('portalIssueMeta');
    if (issueMeta) {
      if (isReport) {
        issueMeta.removeAttribute('data-i18n');
        issueMeta.textContent = portalReportMeta;
      } else {
        issueMeta.setAttribute('data-i18n', `memberPortal.view.${nextView}.description`);
        issueMeta.textContent = metadata.description;
      }
    }
  }

  function ensureLibraryFeature() {
    if (window.topGymMemberPortalLibrary) return Promise.resolve(window.topGymMemberPortalLibrary);
    if (libraryLoaderPromise) return libraryLoaderPromise;
    libraryLoaderPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = '/js/member-portal-library.js?v=2b8c2265b1056448';
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
    librarySection.scrollIntoView({ behavior: 'smooth', block: 'start' });
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
    const countLabel = rows.length ? `${formatNumber(rows.length)} ${tr(rows.length === 1 ? 'report.recordSingular' : 'report.recordPlural')}` : tr('report.noRecords');
    return `<section class="${sectionClass}" aria-label="${escapeHtml(title)}"><div class="portal-section-heading"><div><span class="portal-section-kicker">سجل العضوية</span><h3>${escapeHtml(title)}</h3></div><span class="portal-section-count">${countLabel}</span></div>${rows.length ? `<div class="portal-table-wrap"><table class="portal-table"><thead><tr>${headers.map((header) => `<th>${escapeHtml(header)}</th>`).join('')}</tr></thead><tbody>${rows.join('')}</tbody></table></div>` : `<div class="portal-empty">${escapeHtml(emptyText)}</div>`}</section>`;
  }

  function renderTrainerPortal(data, { localeRefresh = false } = {}) {
    const member = data.member || {};
    portalDisplayMember = member;
    const coaching = data.coaching || {};
    const packages = Array.isArray(data.packagePurchases) ? data.packagePurchases : [];
    const sessions = Array.isArray(data.sessions) ? data.sessions : [];
    const plans = Array.isArray(coaching.trainingPlans) ? coaching.trainingPlans : [];
    const nutritionPlans = Array.isArray(coaching.nutritionPlans) ? coaching.nutritionPlans : [];
    const upcomingSessions = sessions.filter((item) => item.status === 'scheduled').slice(0, 3);
    const remainingSessions = packages.reduce((sum, item) => sum + number(item.sessionsRemaining), 0);
    document.documentElement.dataset.portalMode = 'trainer_client';
    document.documentElement.dataset.portalRequestType = 'trainer_client';
    document.documentElement.dataset.portalRequestOperation = 'trainer_client';
    document.documentElement.dataset.portalRequestCanSubmit = 'false';
    if (!localeRefresh) window.dispatchEvent(new CustomEvent('topgym:portal-session-change', {
      detail: { requestType: 'trainer_client', operation: 'trainer_client', canSubmit: false, membershipStatus: 'none' }
    }));
    if (occupancyCard) occupancyCard.hidden = true;
    const trainerTool = document.querySelector('[data-portal-tool="subscription"]');
    if (trainerTool) trainerTool.hidden = true;
    if (resultTitle) resultTitle.textContent = tr('clientPortal');
    if ($('portalIssueMeta')) $('portalIssueMeta').textContent = tr('clientPortalDescription');
    if (trainerOverview) trainerOverview.hidden = false;
    if (trainerOverviewContent) {
      trainerOverviewContent.innerHTML = `
        <section class="portal-trainer-identity"><div><span class="portal-section-kicker">CLIENT PROFILE</span><h4>${escapeHtml(member.fullName || '—')}</h4><p class="portal-ltr" data-portal-phone-display>${escapeHtml(displayPhone(member.phone, member.phoneCountry) || '—')}</p></div><span class="portal-trainer-mode">${escapeHtml(tr('trainer.mode'))}</span></section>
        <div class="portal-stat-grid portal-trainer-stats" aria-label="${escapeHtml(tr('trainer.summary'))}"><article class="portal-stat"><span>${escapeHtml(tr('trainer.trainingPlans'))}</span><strong>${formatNumber(plans.length)}</strong><small>${escapeHtml(tr('trainer.availablePlans'))}</small></article><article class="portal-stat"><span>${escapeHtml(tr('trainer.nutritionPlans'))}</span><strong>${formatNumber(nutritionPlans.length)}</strong><small>${escapeHtml(tr('trainer.availablePlans'))}</small></article><article class="portal-stat"><span>${escapeHtml(tr('trainer.upcomingSessions'))}</span><strong>${formatNumber(upcomingSessions.length)}</strong><small>${escapeHtml(tr('trainer.scheduledSessions'))}</small></article><article class="portal-stat"><span>${escapeHtml(tr('trainer.remainingSessions'))}</span><strong>${formatNumber(remainingSessions)}</strong><small>${escapeHtml(tr('trainer.currentPackages'))}</small></article></div>
        ${table('خطط التدريب', ['الخطة', 'الفترة', 'الحالة'], plans.map((item) => `<tr>${tableCell('الخطة', escapeHtml(item.name || '—'))}${tableCell('الفترة', `${dateText(item.startDate)}<br>حتى ${dateText(item.endDate)}`, 'portal-ltr')}${tableCell('الحالة', escapeHtml(item.status || '—'))}</tr>`), 'لا توجد خطط تدريب متاحة.', 'portal-trainer-history')}
        ${table('خطط التغذية', ['الخطة', 'الفترة', 'الحالة'], nutritionPlans.map((item) => `<tr>${tableCell('الخطة', escapeHtml(item.name || '—'))}${tableCell('الفترة', `${dateText(item.startDate)}<br>حتى ${dateText(item.endDate)}`, 'portal-ltr')}${tableCell('الحالة', escapeHtml(item.status || '—'))}</tr>`), 'لا توجد خطط تغذية متاحة.', 'portal-trainer-history')}
        ${table('الجلسات القادمة', ['الموعد', 'الحالة', 'ملاحظات'], upcomingSessions.map((item) => `<tr>${tableCell('الموعد', dateTimeText(item.scheduledStart), 'portal-ltr')}${tableCell('الحالة', escapeHtml(item.status === 'scheduled' ? 'مجدولة' : item.status || '—'))}${tableCell('ملاحظات', escapeHtml(item.notes || '—'))}</tr>`), 'لا توجد جلسات قادمة.', 'portal-trainer-history')}`;
    }
    window.topGymSkeleton?.ready(trainerOverviewContent);
    refreshPortalPhoneDisplay();
    portalReportMeta = tr('report.memberName', { name: member.fullName || '—', date: dateTimeText(data.issuedAt) });
    if (!localeRefresh) {
      resetFeedback();
      setPortalView('home');
    }
  }

  function render(data, { localeRefresh = false } = {}) {
    if (data?.portalMode === 'trainer_client') {
      renderTrainerPortal(data, { localeRefresh });
      return;
    }
    document.documentElement.dataset.portalMode = 'gym_member';
    const trainerTool = document.querySelector('[data-portal-tool="subscription"]');
    if (trainerTool) trainerTool.hidden = false;
    if (trainerOverview) trainerOverview.hidden = true;
    const member = data.member || {};
    portalDisplayMember = member;
    const current = data.currentMembership || {};
    const status = current.status || 'expired';
    const hasExistingMembership = Boolean(current.id && status !== 'cancelled');
    const requestType = hasExistingMembership
      ? (status === 'expired' ? 'renewal' : 'extension')
      : 'membership';
    const requestOperation = hasExistingMembership
      ? (status === 'frozen' ? 'blocked' : requestType)
      : 'membership';
    const requestCanSubmit = !hasExistingMembership || status !== 'frozen';
    document.documentElement.dataset.portalRequestType = requestType;
    document.documentElement.dataset.portalRequestOperation = requestOperation;
    document.documentElement.dataset.portalRequestCanSubmit = String(requestCanSubmit);
    if (!localeRefresh) window.dispatchEvent(new CustomEvent('topgym:portal-session-change', {
      detail: { requestType, operation: requestOperation, canSubmit: requestCanSubmit, membershipStatus: status }
    }));
    const summary = data.financialSummary || {};
    const firstJoin = data.firstJoinDate || member.registrationDate;
    const remainingClass = number(summary.totalRemaining) > 0 ? 'portal-outstanding' : '';
    const membershipRows = (data.memberships || []).map((item) => `<tr>${tableCell(tr('report.planAndDuration'), `${escapeHtml(planLabel(item.plan))}<small>${escapeHtml(typeLabel(item.type))}</small>`)}${tableCell(tr('report.period'), `${dateText(item.startDate)}<br>${escapeHtml(tr('report.until', { date: dateText(item.effectiveEndDate || item.endDate) }))}`, 'portal-ltr')}${tableCell(tr('report.status'), `<span class="portal-status ${escapeHtml(item.status || '')}">${escapeHtml(statusLabel(item.status))}</span>`)}${tableCell(tr('report.account'), `${money(item.amountDue)}<br><small>${escapeHtml(tr('report.paidValue', { amount: money(item.amountPaid) }))} · ${escapeHtml(tr('report.remainingValue', { amount: money(item.amountRemaining) }))}</small>`, 'portal-money')}</tr>`);
    const paymentRows = (data.payments || []).map((item) => `<tr>${tableCell(tr('report.receipt'), escapeHtml(item.receiptNumber || '—'), 'portal-ltr')}${tableCell(tr('report.date'), dateTimeText(item.transactionDate || item.createdAt))}${tableCell(tr('report.operation'), escapeHtml(tr(item.transactionType === 'subscription' ? 'data.transaction.subscription' : item.transactionType === 'adjustment' ? 'data.transaction.adjustment' : 'data.transaction.payment')))}${tableCell(tr('report.paid'), money(item.amountPaid), 'portal-money')}${tableCell(tr('report.due'), money(item.amountRemaining), `portal-money ${number(item.amountRemaining) > 0 ? 'portal-debt' : ''}`)}${tableCell(tr('report.paymentMethod'), escapeHtml(paymentLabel(item.paymentMethod)))}</tr>`);
    const attendanceRows = (data.attendance || []).map((item) => `<tr>${tableCell(tr('report.date'), dateText(item.attendanceDate), 'portal-ltr')}${tableCell(tr('report.checkIn'), dateTimeText(item.checkInAt))}${tableCell(tr('report.checkOut'), item.checkOutAt ? dateTimeText(item.checkOutAt) : tr('report.insideGym', { gym: escapeHtml(brandName()) }))}${tableCell(tr('report.duration'), item.durationMinutes == null ? '—' : tr('report.minutes', { count: formatNumber(item.durationMinutes) }))}</tr>`);
    const freezeRows = (data.freezes || []).map((item) => `<tr>${tableCell(tr('report.start'), dateText(item.startDate))}${tableCell(tr('report.end'), dateText(item.endDate))}${tableCell(tr('report.resumed'), item.resumedDate ? dateText(item.resumedDate) : tr('report.continues'))}${tableCell(tr('report.duration'), tr('report.daysCount', { count: formatNumber(item.days) }))}</tr>`);
    const currentEndDate = current.effectiveEndDate || current.endDate;
    const daysRemaining = current.daysRemaining == null ? '—' : current.daysRemaining >= 0 ? tr('report.daysRemaining', { count: formatNumber(current.daysRemaining) }) : tr('report.expired');
    const tenantName = String(data.tenant?.name || brandName()).trim() || brandName();
    reportContent.innerHTML = `
      <section class="portal-member-identity">
        <div class="portal-member-primary"><span class="portal-member-avatar" aria-hidden="true">${escapeHtml(initials(member.fullName))}</span><div class="portal-member-copy"><h3>${escapeHtml(member.fullName || '—')}</h3><p class="portal-member-contact"><span>الهاتف</span><b class="portal-ltr" data-portal-phone-display>${escapeHtml(displayPhone(member.phone, member.phoneCountry) || '—')}</b></p><p class="portal-member-contact"><span>البريد الإلكتروني</span><b>${escapeHtml(member.email || '—')}</b></p></div></div>
        <div class="portal-member-status-block"><span>حالة العضوية</span><span class="portal-status ${escapeHtml(status)}">${escapeHtml(statusLabel(status))}</span></div>
      </section>
      <section class="portal-membership-overview" aria-labelledby="portalMembershipOverviewTitle">
        <header class="portal-membership-overview-head"><div><span class="portal-section-kicker">MEMBERSHIP PROFILE</span><h3 id="portalMembershipOverviewTitle">ملخص العضوية</h3><p>بيانات العضوية الحالية لهذا المشترك فقط</p></div><span class="portal-membership-scope"><span aria-hidden="true">⌂</span>${escapeHtml(tenantName)}</span></header>
        <div class="portal-membership-facts"><article class="portal-membership-fact portal-membership-fact-featured"><span>الباقة</span><strong>${escapeHtml(planLabel(current.plan))}</strong><small>${escapeHtml(typeLabel(current.type))}</small></article><article class="portal-membership-fact"><span>تاريخ البداية</span><strong class="portal-ltr">${dateText(current.startDate)}</strong><small>بداية الاشتراك الحالي</small></article><article class="portal-membership-fact"><span>تاريخ الانتهاء</span><strong class="portal-ltr">${dateText(currentEndDate)}</strong><small>${escapeHtml(daysRemaining)}</small></article><article class="portal-membership-fact"><span>أول انضمام</span><strong class="portal-ltr">${dateText(firstJoin)}</strong><small>تاريخ بداية الملف</small></article></div>
      </section>
      <section class="portal-stat-grid portal-financial-grid" aria-label="${escapeHtml(tr('report.visitsFinance'))}"><article class="portal-stat"><span>${escapeHtml(tr('report.totalVisits'))}</span><strong>${formatNumber(data.attendanceSummary?.totalVisits)}</strong><small>${escapeHtml(tr('report.fullAttendance'))}</small></article><article class="portal-stat"><span>${escapeHtml(tr('report.totalDue'))}</span><strong>${money(summary.totalDue)}</strong><small>${escapeHtml(tr('report.membershipValue'))}</small></article><article class="portal-stat"><span>${escapeHtml(tr('report.totalPaid'))}</span><strong>${money(summary.totalPaid)}</strong><small>${escapeHtml(tr('report.paidToDate'))}</small></article><article class="portal-stat"><span>${escapeHtml(tr('report.remainingAmount'))}</span><strong class="${remainingClass}">${money(summary.totalRemaining)}</strong><small>${escapeHtml(tr('report.currentBalance'))}</small></article></section>
      ${table('الاشتراكات والتجديدات', ['الباقة والمدة', 'الفترة', 'الحالة', 'الحساب'], membershipRows, 'لا توجد اشتراكات مسجلة.', 'portal-membership-history')}
      ${table('سجل المدفوعات والإيصالات', ['الإيصال', 'التاريخ', 'العملية', 'المدفوع', 'المتبقي', 'طريقة الدفع'], paymentRows, 'لا توجد مدفوعات مسجلة.', 'portal-payments-history')}
      ${table('سجل الحضور والزيارات', ['التاريخ', 'الحضور', 'الانصراف', 'المدة'], attendanceRows, 'لا توجد زيارات مسجلة.', 'portal-attendance-history')}
      ${freezeRows.length ? table('حالات التجميد أو الإيقاف', ['البداية', 'النهاية', 'الاستئناف', 'المدة'], freezeRows, 'لا توجد حالات تجميد.', 'portal-freeze-history') : ''}`;
    portalReportMeta = tr('report.number', { number: data.reportNumber || '—', date: dateTimeText(data.issuedAt) });
    refreshPortalPhoneDisplay();
    if (!localeRefresh) {
      resetFeedback();
      setPortalView('home');
    }
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
    delete document.documentElement.dataset.portalRequestType;
    delete document.documentElement.dataset.portalRequestOperation;
    delete document.documentElement.dataset.portalRequestCanSubmit;
    delete document.documentElement.dataset.portalMode;
    const trainerTool = document.querySelector('[data-portal-tool="subscription"]');
    if (trainerTool) trainerTool.hidden = false;
    if (trainerOverview) trainerOverview.hidden = true;
    window.dispatchEvent(new CustomEvent('topgym:portal-session-change', {
      detail: { requestType: 'membership', operation: 'membership', canSubmit: true, membershipStatus: 'none' }
    }));
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

  const portalLocalizationRoot = document.querySelector('.portal-shell');
  const annotatePortalCopy = () => i18n?.annotateText?.(portalLocalizationRoot || document, 'memberPortal.');
  annotatePortalCopy();
  if (portalLocalizationRoot && typeof MutationObserver === 'function') {
    const portalLocalizationObserver = new MutationObserver((records) => {
      if (records.some((record) => record.addedNodes.length || record.removedNodes.length)) annotatePortalCopy();
    });
    portalLocalizationObserver.observe(portalLocalizationRoot, { childList: true, subtree: true });
  }
  window.addEventListener('topgym:localechange', () => {
    const activeView = activePortalView;
    if (portalViewData && resultPanel && !resultPanel.hidden) {
      render(portalViewData, { localeRefresh: true });
      setPortalView(activeView);
    }
    if (occupancySnapshot) renderOccupancy(occupancySnapshot);
    else if (occupancyHasError) showOccupancyError();
    annotatePortalCopy();
    i18n?.apply?.(portalLocalizationRoot || document);
  });

  form?.addEventListener('submit', async (event) => {
    event.preventDefault();
    showError('');
    const code = String(input.value || '').trim();
    if (!code) { showError(tr('lookup.codeRequired')); input.focus(); return; }
    setLoading(true);
    try {
      const data = await lookup(code);
      await applyPortalTenant(data.tenant);
      portalMembershipCode = code;
      portalViewData = data;
      render(data);
      window.topGymNotificationCenter?.refresh?.();
      input.value = '';
      loginPanel.hidden = true;
      resultPanel.hidden = false;
      if (data?.portalMode !== 'trainer_client') {
        void refreshOccupancy();
        scheduleOccupancyRefresh();
      } else {
        clearOccupancyTimer();
        stopOccupancyRequest();
      }
      resultPanel.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch (error) {
      showError(error.message || tr('lookup.failed'));
    } finally { setLoading(false); }
  });
  $('portalPrintButton')?.addEventListener('click', printReport);
  $('portalPdfButton')?.addEventListener('click', printReport);
  occupancyRefresh?.addEventListener('click', () => {
    void refreshOccupancy();
    scheduleOccupancyRefresh();
  });
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
    if (action === 'subscription') {
      setPortalView('subscription');
      viewToolbar?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      window.dispatchEvent(new CustomEvent('topgym:portal-subscription-open'));
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
    applyPortalBrandFooter();
  });
  function applyPortalBrandFooter() {
    const footer = document.querySelector('[data-portal-brand-footer]');
    if (!footer) return;
    const brandingApi = window.topGymBranding;
    const currentFooter = String(brandingApi?.get?.().documents?.footer || '').trim();
    const fallbackFooter = String(brandingApi?.fallback?.().documents?.footer || '').trim();
    footer.textContent = currentFooter && currentFooter !== fallbackFooter ? currentFooter : tr('footer');
  }
  window.addEventListener('topgym:localechange', applyPortalBrandFooter);
  window.addEventListener('topgym:themechange', applyPortalBrandFooter);
  applyPortalBrandFooter();
  document.addEventListener('visibilitychange', () => {
    if (!portalMembershipCode || document.documentElement.dataset.portalMode === 'trainer_client') return;
    if (document.hidden) {
      clearOccupancyTimer();
      occupancyRequestController?.abort();
    } else {
      void refreshOccupancy({ silent: true });
      scheduleOccupancyRefresh();
    }
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
    if (!portalMembershipCode) { showFeedbackError(tr('feedback.portalCodeRequired')); return; }
    if (!rating) { showFeedbackError(tr('feedback.ratingRequired')); return; }
    if (!noteType) { showFeedbackError(tr('feedback.chooseType')); feedbackType?.focus(); return; }
    if (message.length < 3) { showFeedbackError(tr('feedback.messageRequired')); feedbackMessage?.focus(); return; }
    setFeedbackBusy(true);
    try {
      const response = await fetch('/api/member-portal/feedback', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ membershipCode: portalMembershipCode, tenantSlug: portalTenantSlug() || undefined, rating, noteType, message })
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(response.status === 429 ? payload.error : payload.error || tr('feedback.saveFailed'));
      resetFeedback();
      if (feedbackSuccess) feedbackSuccess.hidden = false;
    } catch (error) {
      showFeedbackError(error.message || tr('feedback.saveFailed'));
    } finally { setFeedbackBusy(false); }
  });
  $('portalResetButton')?.addEventListener('click', () => {
    clearOccupancyTimer();
    stopOccupancyRequest();
    portalMembershipCode = '';
    portalReportMeta = '';
    resetPortalTenant();
    window.topGymNotificationCenter?.refresh?.();
    setPortalView('home');
    resetFeedback();
    resetOccupancyDisplay();
    resultPanel.hidden = true;
    loginPanel.hidden = false;
    input.focus();
  });
})();
