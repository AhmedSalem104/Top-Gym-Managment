(() => {
  'use strict';

  if (window.__topGymMemberDetailsUiLoaded) return;

  const dialog = document.getElementById('detailsDialog');
  const content = document.getElementById('detailsContent');
  if (!dialog || !content) return;
  window.__topGymMemberDetailsUiLoaded = true;

  const brandName = () => String(window.topGymBranding?.get?.().identity?.brandName || 'Logic Fit').trim() || 'Logic Fit';

  const planLabels = { gym_only: 'جيم فقط', gym_cardio: 'جيم وكارديو' };
  const typeLabels = {
    monthly: 'شهرية',
    half_month: 'نصف شهر',
    quarterly: 'ربع سنوية',
    semiannual: 'نصف سنوية',
    annual: 'سنوية'
  };

  const icons = {
    subscription: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M7 9h10M7 13h5"/>',
    calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M8 3v4M16 3v4M3 10h18"/>',
    freeze: '<path d="M12 3v18M5.6 6.7l12.8 10.6M18.4 6.7 5.6 17.3M4 12h16"/>',
    wallet: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M16 12h5M7 9h6"/>',
    renew: '<path d="M20 11a8 8 0 0 0-14.8-4L3 10"/><path d="M3 5v5h5M4 13a8 8 0 0 0 14.8 4L21 14"/><path d="M21 19v-5h-5"/>',
    view: '<path d="M2.5 12s3.4-6 9.5-6 9.5 6 9.5 6-3.4 6-9.5 6-9.5-6-9.5-6Z"/><circle cx="12" cy="12" r="2.5"/>',
     print: '<path d="M6 9V3h12v6M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><path d="M6 14h12v7H6z"/>',
     resume: '<path d="m8 5 11 7-11 7V5Z"/>',
    more: '<circle cx="5" cy="12" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="19" cy="12" r="1.5"/>',
    payment: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 10h18M7 15h3"/>',
    qr: '<rect x="4" y="4" width="6" height="6"/><rect x="14" y="4" width="6" height="6"/><rect x="4" y="14" width="6" height="6"/><path d="M14 14h2v2h-2zM18 18h2v2h-2zM18 14h2"/>',
    refund: '<path d="M4 7h11a5 5 0 1 1 0 10H8"/><path d="m7 4-3 3 3 3"/><path d="M12 12h.01"/>'
  };

  const icon = (name) => `<svg class="ui-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name] || icons.view}</svg>`;
  const escapeHtml = (value) => String(value ?? '').replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[character]));
  const number = (value) => Number.isFinite(Number(value)) ? Number(value) : 0;
  const money = (value) => `${number(value).toLocaleString('ar-EG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ج.م`;
  const paymentLabels = { cash: 'نقدي', card: 'بطاقة', transfer: 'تحويل', wallet: 'محفظة', other: 'أخرى' };
  let storePurchasesRequestId = 0;
  let activeMoreMenu = null;
   let activeMoreTrigger = null;
   let moreMenuOriginalParent = null;
  let moreMenuOriginalNextSibling = null;
  let moreMenuOriginalStyle = '';
  let moreMenuOutsideHandler = null;
  let moreMenuKeyHandler = null;
  let moreMenuRepositionHandler = null;
  let mobileDetailsNodes = null;
  let mobileDetailsObserver = null;
  let mobileAttendancePanel = null;
  let mobileDetailsBadgeOriginal = null;
  let mobileProfileCodeNode = null;
  let mobileDetailsData = null;
  let mobileDetailsMedia = window.matchMedia?.('(max-width: 767px)') || null;
  let mobileMovedElements = [];
  let mobileDetailsMember = null;

  function hasRequiredPermissions(value) {
    const required = String(value || '').split(',').map((item) => item.trim()).filter(Boolean);
    if (!required.length || window.topGymAuth?.isOwner?.() === true) return true;
    return required.every((permission) => window.topGymAuth?.hasPermission?.(permission) === true);
  }

  function dateText(value) {
    if (!value) return '—';
    const date = new Date(`${String(value).slice(0, 10)}T00:00:00`);
    return Number.isNaN(date.getTime()) ? String(value) : new Intl.DateTimeFormat('ar-EG', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(date);
  }

  function initials(name) {
    const parts = String(name || 'م').trim().split(/\s+/).filter(Boolean);
    return (parts.slice(0, 2).map((part) => part[0]).join('') || 'م').slice(0, 2);
  }

  function remainingDays(subscription) {
    if (subscription?.daysRemaining !== undefined && subscription?.daysRemaining !== null && subscription.daysRemaining !== '') {
      return number(subscription.daysRemaining);
    }
    if (!subscription?.effectiveEndDate) return null;
    const end = new Date(`${String(subscription.effectiveEndDate).slice(0, 10)}T23:59:59`);
    if (Number.isNaN(end.getTime())) return null;
    return Math.ceil((end.getTime() - Date.now()) / 86400000);
  }

  function membershipEndTimestamp(item) {
    // The list projection ranks memberships by the stored end date. Keep the
    // compatibility fallback aligned with that projection; the API's explicit
    // currentMembership is preferred whenever it is available.
    const value = item?.endDate || item?.effectiveEndDate;
    if (!value) return 0;
    const timestamp = Date.parse(`${String(value).slice(0, 10)}T00:00:00`);
    return Number.isNaN(timestamp) ? 0 : timestamp;
  }

  function resolveSubscription(member, details) {
    // The API derives this from the same member_rows CTE used by the table.
    // It is the authoritative current/latest membership for every member.
    if (details?.currentMembership && typeof details.currentMembership === 'object') return details.currentMembership;

    // The members list is the source of truth for the current subscription
    // shown in the table. Keep the details header/overview aligned with it;
    // the details endpoint remains a history fallback for callers that do not
    // have the list row available.
    if (member?.membership && typeof member.membership === 'object') return member.membership;

    const memberships = Array.isArray(details?.memberships) ? details.memberships : [];
    if (!memberships.length) return member?.membership || null;

    // Keep the details view aligned with the members list: cancelled rows are
    // last, then the membership with the latest effective end date is the
    // current subscription. The details API intentionally returns the full
    // history in chronological order, so taking the first non-cancelled row
    // would surface an old expired subscription instead of the current one.
    const candidates = memberships.filter((item) => (
      String(item?.status || '').toLowerCase() !== 'cancelled'
      && !item?.cancelledAt
    ));
    const source = candidates.length ? candidates : memberships;
    return [...source].sort((left, right) => (
      membershipEndTimestamp(right) - membershipEndTimestamp(left)
      || number(right?.id) - number(left?.id)
    ))[0] || member?.membership || null;
  }

  function scopeNames(items) {
    return (Array.isArray(items) ? items : [])
      .map((item) => String(item?.name || '').trim())
      .filter(Boolean)
      .join('، ');
  }

  function renderMemberScope(member, subscription) {
    const scope = subscription?.scope || {};
    const branches = scopeNames(scope.branches);
    const sections = scopeNames(scope.sections);
    const portalUrl = String(member?.membershipCodePortalUrl || '').trim();
    const portalCode = String(member?.membershipCode?.maskedCode || '').trim();
    const section = document.createElement('section');
    section.className = 'details-section member-scope-details';
    section.innerHTML = `<div class="member-scope-details-head"><div><span class="member-store-purchases-kicker">نطاق العضوية والبوابة</span><h4>تفاصيل الوصول</h4></div></div><div class="member-scope-grid"><div><span>الفرع</span><strong>${escapeHtml(branches || 'غير محدد')}</strong></div><div><span>القسم</span><strong>${escapeHtml(sections || 'غير محدد')}</strong></div><div><span>كود بوابة العضوية</span><strong dir="ltr">${escapeHtml(portalCode || 'غير متاح')}</strong></div><div><span>رابط بوابة العضوية</span><strong dir="ltr">${escapeHtml(portalUrl || 'غير متاح')}</strong></div></div>`;
    return section;
  }

  function displayPhone(value, iso = '') {
    return window.LogicFitPhoneInputs?.formatForDisplay?.(value, iso) || String(value || '');
  }

  function updateHeader(member, details) {
    const subscription = resolveSubscription(member, details);
    const avatar = document.getElementById('detailsAvatar');
    const subtitle = document.getElementById('detailsSubtitle');
    const registration = document.getElementById('detailsRegistration');
    const badge = document.getElementById('detailsMemberBadge');
    const banner = document.getElementById('detailsExpiryBanner');
    const bannerTitle = document.getElementById('detailsExpiryTitle');
    const bannerText = document.getElementById('detailsExpiryText');
    if (avatar) avatar.textContent = initials(member?.fullName);
    if (subtitle) {
      const formattedPhone = displayPhone(member?.phone, member?.phoneCountry) || '—';
      subtitle.textContent = `${formattedPhone}${member?.email ? ` · ${member.email}` : ''}`;
    }
    if (registration) registration.textContent = `تاريخ التسجيل: ${dateText(member?.registrationDate)}`;
    if (badge) badge.textContent = 'عضو';
    if (!banner) return;

    const status = subscription?.status || '';
    const days = remainingDays(subscription);
    let title = '';
    let text = '';
    let tone = 'warning';
    if (status === 'expiring_soon' || (status === 'active' && days !== null && days <= 3)) {
      title = 'قريبة الانتهاء';
      text = days === 0 ? 'ينتهي الاشتراك اليوم' : days > 0 ? `ينتهي الاشتراك خلال ${days} يوم` : 'ينتهي الاشتراك قريبًا';
    } else if (status === 'expired') {
      title = 'الاشتراك منتهي';
      text = `انتهى الاشتراك في ${dateText(subscription?.effectiveEndDate || subscription?.endDate)}`;
      tone = 'danger';
    } else if (status === 'frozen') {
      title = 'الاشتراك مجمد';
      text = subscription?.freezeEnd ? `يستمر التجميد حتى ${dateText(subscription.freezeEnd)}` : 'العضوية مجمدة حاليًا';
      tone = 'info';
    }
    banner.hidden = !title;
    banner.dataset.tone = tone;
    if (bannerTitle) bannerTitle.textContent = title;
    if (bannerText) bannerText.textContent = text;
  }

  function findSourceButton(action) {
    const memberId = String(dialog.dataset.memberId || '');
    if (!memberId) return null;
    const row = [...document.querySelectorAll('#membersList [data-member-id]')].find((item) => String(item.dataset.memberId) === memberId);
    return row?.querySelector(`button[data-action="${action}"]`) || null;
  }

  function runExistingAction(action) {
    if (action === 'view') {
      document.querySelector('.member-details-overview')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      document.querySelector('.member-details-action-primary')?.focus({ preventScroll: true });
      return;
    }
    const source = action === 'print' ? document.querySelector('#detailsDialog .print-details-button') || findSourceButton('print') : findSourceButton(action);
    if (!source) return;
    if (!hasRequiredPermissions(source.dataset.requiredPermission)) return;
    closeMoreMenu();
    if (typeof dialog.close === 'function' && dialog.open) dialog.close();
    window.requestAnimationFrame(() => source.click());
  }

  const actionPermissions = Object.freeze({
    renew: 'memberships.renew,payments.create',
    view: 'members.read,memberships.read',
    print: 'members.print,members.read,memberships.read',
    freeze: 'memberships.freeze',
    resume: 'memberships.freeze',
    payment: 'payments.create',
    qr: 'members.read,memberships.read',
    edit: 'members.update',
    refund: 'payments.refund'
  });

  function actionButton(action, label, className = '') {
    const requiredPermission = actionPermissions[action] || '';
    return `<button class="member-details-action ${className}" type="button" data-member-detail-action="${action}"${requiredPermission ? ` data-required-permission="${requiredPermission}"` : ''} aria-label="${label}" title="${label}">${icon(action)}<span>${label}</span></button>`;
  }

  function closeMoreMenu({ restoreFocus = false } = {}) {
    const menu = activeMoreMenu;
    const trigger = activeMoreTrigger;
    if (!menu) return;
    if (moreMenuOutsideHandler) document.removeEventListener('pointerdown', moreMenuOutsideHandler, true);
    if (moreMenuKeyHandler) document.removeEventListener('keydown', moreMenuKeyHandler, true);
    if (moreMenuRepositionHandler) window.removeEventListener('resize', moreMenuRepositionHandler);
    if (moreMenuRepositionHandler) window.removeEventListener('scroll', moreMenuRepositionHandler, true);
    menu.hidden = true;
    menu.classList.remove('is-floating');
    menu.style.cssText = moreMenuOriginalStyle;
    if (moreMenuOriginalParent?.isConnected) {
      if (moreMenuOriginalNextSibling?.isConnected && moreMenuOriginalNextSibling.parentNode === moreMenuOriginalParent) {
        moreMenuOriginalParent.insertBefore(menu, moreMenuOriginalNextSibling);
      } else {
        moreMenuOriginalParent.appendChild(menu);
      }
    }
    trigger?.setAttribute('aria-expanded', 'false');
    activeMoreMenu = null;
    activeMoreTrigger = null;
    moreMenuOriginalParent = null;
    moreMenuOriginalNextSibling = null;
    moreMenuOutsideHandler = null;
    moreMenuKeyHandler = null;
    moreMenuRepositionHandler = null;
    if (restoreFocus && trigger?.isConnected) trigger.focus({ preventScroll: true });
  }

  function positionMoreMenu() {
    if (!activeMoreMenu || activeMoreMenu.hidden || !activeMoreTrigger) return;
    const triggerRect = activeMoreTrigger.getBoundingClientRect();
    const viewportPadding = 12;
    const gap = 8;
    const maxWidth = Math.max(180, window.innerWidth - (viewportPadding * 2));
    activeMoreMenu.style.maxWidth = `${maxWidth}px`;
    activeMoreMenu.style.left = `${viewportPadding}px`;
    activeMoreMenu.style.top = `${viewportPadding}px`;
    const menuWidth = Math.min(Math.max(activeMoreMenu.offsetWidth, 180), maxWidth);
    activeMoreMenu.style.width = `${menuWidth}px`;
    const menuHeight = activeMoreMenu.offsetHeight;
    const availableBelow = window.innerHeight - triggerRect.bottom - viewportPadding;
    const availableAbove = triggerRect.top - viewportPadding;
    const openBelow = availableBelow >= menuHeight + gap || availableBelow >= availableAbove;
    const top = openBelow
      ? Math.min(window.innerHeight - viewportPadding - menuHeight, triggerRect.bottom + gap)
      : Math.max(viewportPadding, triggerRect.top - gap - menuHeight);
    const left = Math.min(
      Math.max(viewportPadding, triggerRect.right - menuWidth),
      window.innerWidth - viewportPadding - menuWidth
    );
    activeMoreMenu.style.left = `${left}px`;
    activeMoreMenu.style.top = `${top}px`;
    activeMoreMenu.dataset.placement = openBelow ? 'bottom' : 'top';
  }

  function mobileDetailsCategory(node) {
    if (!(node instanceof Element)) return 'overview';
    if (node.querySelector('.event-list')) return 'account';
    if (node.matches('[data-member-training-panel]')) return 'training';
    if (node.matches('[data-member-store-purchases]')) return 'store';
    if (node.matches('.payment-history-section, .financial-summary, .membership-portal-code-card')) return 'account';
    if (node.matches('.details-summary')) return 'overview';
    if (node.matches('.member-details-overview, .member-scope-details, .current-membership-section')) return 'overview';
    const heading = node.querySelector(':scope > h4')?.textContent?.trim() || '';
    if (/الاشتراك|التجميد/.test(heading)) return 'subscriptions';
    if (/الحساب|الدفع|الإيصال|مشتريات/.test(heading)) return 'account';
    return 'overview';
  }

  function updateMobileProfileBadge(member) {
    const profileBadge = dialog.querySelector('#detailsMemberBadge');
    if (!profileBadge) return;
    if (!mobileDetailsBadgeOriginal) {
      mobileDetailsBadgeOriginal = { text: profileBadge.textContent, status: profileBadge.dataset.membershipStatus || '' };
    }
    const status = String(mobileDetailsData?.currentMembership?.status || member?.membership?.status || '').toLowerCase();
    const labels = { active: 'نشط', expiring_soon: 'تنتهي قريبًا', frozen: 'مجمّدة', expired: 'منتهية', cancelled: 'ملغاة' };
    if (labels[status]) {
      profileBadge.textContent = labels[status];
      profileBadge.dataset.membershipStatus = status;
    }
    const copy = dialog.querySelector('.member-profile-copy');
    const maskedCode = String(member?.membershipCode?.maskedCode || '').trim();
    if (copy && maskedCode) {
      if (!mobileProfileCodeNode) {
        mobileProfileCodeNode = document.createElement('small');
        mobileProfileCodeNode.className = 'member-profile-code';
        mobileProfileCodeNode.dir = 'ltr';
        mobileProfileCodeNode.setAttribute('aria-label', 'كود العضوية');
      }
      mobileProfileCodeNode.textContent = maskedCode;
      copy.append(mobileProfileCodeNode);
    }
  }

  function formatAttendanceTime(value) {
    if (!value) return '—';
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? String(value) : new Intl.DateTimeFormat('ar-EG', { hour: '2-digit', minute: '2-digit' }).format(date);
  }

  function createAttendancePanel(member) {
    const attendance = member?.attendance || {};
    const checkedIn = Boolean(attendance.checkInAt);
    const checkedOut = Boolean(attendance.checkOutAt);
    const panel = document.createElement('section');
    panel.className = 'member-detail-attendance details-section';
    panel.dataset.mobileAttendancePanel = 'true';
    panel.innerHTML = `<h4>حضور اليوم</h4><div class="member-detail-attendance-state${checkedIn && !checkedOut ? ' is-inside' : ''}"><span class="member-detail-attendance-indicator" aria-hidden="true"></span><strong>${checkedIn ? (checkedOut ? 'تم تسجيل الانصراف اليوم' : 'العضو داخل الجيم الآن') : 'لا يوجد حضور مسجل اليوم'}</strong></div><div class="member-detail-attendance-times"><div><span>وقت الدخول</span><strong dir="ltr">${escapeHtml(formatAttendanceTime(attendance.checkInAt))}</strong></div><div><span>وقت الانصراف</span><strong dir="ltr">${escapeHtml(formatAttendanceTime(attendance.checkOutAt))}</strong></div></div>${checkedIn ? '' : '<p class="member-detail-attendance-note">ستظهر حالة الدخول والانصراف هنا بعد تسجيل حركة اليوم.</p>'}`;
    return panel;
  }

  function selectMobileDetailsTab(tabId, { focus = false } = {}) {
    const tab = content.querySelector(`[data-member-details-tab="${tabId}"]`);
    if (!tab) return;
    content.querySelectorAll('[data-member-details-tab]').forEach((item) => {
      const selected = item === tab;
      item.setAttribute('aria-selected', String(selected));
      item.tabIndex = selected ? 0 : -1;
      if (selected) item.dataset.state = 'active'; else delete item.dataset.state;
    });
    content.querySelectorAll('[data-member-details-panel]').forEach((panel) => {
      panel.hidden = panel.dataset.memberDetailsPanel !== tabId;
    });
    if (focus) tab.focus({ preventScroll: true });
  }

  function placeMobileDetailsNode(node) {
    if (!(node instanceof Element) || node.matches('[data-member-details-tabs], [data-member-details-panel], [data-member-details-footer]')) return;
    if (!mobileDetailsNodes.includes(node)) mobileDetailsNodes.push(node);
    if (node.matches('.member-details-actions')) {
      moveMobileActionNode(node);
      return;
    }
    content.querySelector(`[data-member-details-panel="${mobileDetailsCategory(node)}"]`)?.append(node);
    moveMobileFinancialSummary();
  }

  function moveMobileFinancialSummary() {
    const overviewPanel = content.querySelector('[data-member-details-panel="overview"]');
    if (!overviewPanel || overviewPanel.querySelector('.member-details-overview-financial')) return;
    const financialSummary = mobileDetailsData?.financialSummary || {};
    const subscription = resolveSubscription(mobileDetailsMember, mobileDetailsData);
    const values = [
      { label: 'إجمالي المستحق', value: financialSummary.totalDue ?? subscription?.amountDue, tone: '' },
      { label: 'إجمالي المدفوع', value: financialSummary.totalPaid ?? subscription?.amountPaid, tone: 'paid' },
      { label: 'إجمالي المتبقي', value: financialSummary.totalRemaining ?? subscription?.amountRemaining, tone: 'remaining' }
    ].filter((item) => item.value !== undefined && item.value !== null && item.value !== '');
    if (!values.length) return;
    let summarySection = overviewPanel.querySelector('.member-details-overview-financial');
    summarySection = document.createElement('section');
    summarySection.className = 'member-details-overview-financial';
    summarySection.setAttribute('aria-label', 'الرصيد المالي');
    summarySection.innerHTML = '<h4>الرصيد المالي</h4><div class="member-details-overview-financial-grid"></div>';
    const summaryGrid = summarySection.querySelector('.member-details-overview-financial-grid');
    values.forEach(({ label, value, tone }) => {
      const card = document.createElement('div');
      card.className = `member-details-overview-financial-card${tone ? ` ${tone}` : ''}`;
      card.innerHTML = `<span>${label}</span><strong dir="ltr">${escapeHtml(money(value))}</strong>`;
      summaryGrid.append(card);
    });
    const overview = overviewPanel.querySelector('.member-details-overview') || overviewPanel;
    const stats = overview.querySelector('.member-details-stats');
    overview.insertBefore(summarySection, stats || null);
  }

  function rememberMobileMove(node, destination) {
    const parent = node.parentNode;
    if (!parent) return;
    mobileMovedElements.push({ node, parent, nextSibling: node.nextSibling });
    destination.append(node);
  }

  function moveMobileActionNode(actions) {
    const footer = dialog.querySelector('[data-member-details-footer]');
    if (!footer) return;
    const menu = actions.querySelector('.member-details-more-menu');
    actions.querySelectorAll('[data-member-detail-action="print"], [data-member-detail-action="freeze"], [data-member-detail-action="resume"]').forEach((action) => {
      if (menu) rememberMobileMove(action, menu);
    });
    rememberMobileMove(actions, footer);
  }

  function enableMobileDetails(member) {
    if (mobileDetailsNodes || !content.isConnected) return;
    mobileDetailsNodes = [...content.children];
    updateMobileProfileBadge(member);
    const tabs = [
      ['overview', 'ملخص', 'نظرة عامة'],
      ['subscriptions', 'اشتراك', 'الاشتراكات'],
      ['attendance', 'حضور', 'الحضور'],
      ['account', 'حساب', 'الحساب'],
      ['store', 'متجر', 'المتجر'],
      ['training', 'تدريب', 'التدريب والتغذية']
    ];
    const tabList = document.createElement('div');
    tabList.className = 'member-details-tabs';
    tabList.dataset.memberDetailsTabs = 'true';
    tabList.setAttribute('role', 'tablist');
    tabList.setAttribute('aria-label', 'أقسام تفاصيل المشترك');
    const panels = new Map();
    for (const [id, label, accessibleLabel] of tabs) {
      const tab = document.createElement('button');
      tab.type = 'button';
      tab.className = 'member-details-tab';
      tab.dataset.memberDetailsTab = id;
      tab.id = `memberDetailsTab-${id}`;
      tab.setAttribute('role', 'tab');
      tab.setAttribute('aria-label', accessibleLabel);
      tab.title = accessibleLabel;
      tab.setAttribute('aria-controls', `memberDetailsPanel-${id}`);
      tab.setAttribute('aria-selected', String(id === 'overview'));
      tab.tabIndex = id === 'overview' ? 0 : -1;
      tab.textContent = label;
      tabList.append(tab);

      const panel = document.createElement('section');
      panel.className = 'member-details-tab-panel';
      panel.dataset.memberDetailsPanel = id;
      panel.id = `memberDetailsPanel-${id}`;
      panel.setAttribute('role', 'tabpanel');
      panel.setAttribute('aria-labelledby', tab.id);
      panel.tabIndex = 0;
      panel.hidden = id !== 'overview';
      panels.set(id, panel);
    }
    mobileAttendancePanel = createAttendancePanel(member);
    panels.get('attendance').append(mobileAttendancePanel);
    const footer = document.createElement('div');
    footer.className = 'member-details-mobile-footer';
    footer.dataset.memberDetailsFooter = 'true';
    content.append(tabList, ...panels.values());
    dialog.append(footer);
    mobileDetailsNodes.forEach(placeMobileDetailsNode);
    const overviewPanel = content.querySelector('[data-member-details-panel="overview"]');
    const currentMembership = overviewPanel?.querySelector('.current-membership-section');
    if (currentMembership) overviewPanel.prepend(currentMembership);
    moveMobileFinancialSummary();
    const scopeDetails = overviewPanel?.querySelector('.member-scope-details');
    const subscriptionsPanel = content.querySelector('[data-member-details-panel="subscriptions"]');
    if (scopeDetails && subscriptionsPanel) rememberMobileMove(scopeDetails, subscriptionsPanel);
    const nestedActions = content.querySelector('.member-details-overview .member-details-actions');
    if (nestedActions) moveMobileActionNode(nestedActions);
    content.addEventListener('click', onMobileDetailsClick);
    content.addEventListener('keydown', onMobileDetailsKeydown);
    footer.addEventListener('click', onMobileFooterClick);
    mobileDetailsObserver = new MutationObserver((records) => {
      for (const record of records) record.addedNodes.forEach(placeMobileDetailsNode);
    });
    mobileDetailsObserver.observe(content, { childList: true });
    selectMobileDetailsTab('overview');
  }

  function disableMobileDetails() {
    if (!mobileDetailsNodes) return;
    mobileDetailsObserver?.disconnect();
    mobileDetailsObserver = null;
    content.removeEventListener('click', onMobileDetailsClick);
    content.removeEventListener('keydown', onMobileDetailsKeydown);
    dialog.querySelector('[data-member-details-footer]')?.removeEventListener('click', onMobileFooterClick);
    for (const moved of mobileMovedElements.reverse()) {
      if (!moved.parent?.isConnected) continue;
      if (moved.nextSibling?.parentNode === moved.parent) moved.parent.insertBefore(moved.node, moved.nextSibling);
      else moved.parent.append(moved.node);
    }
    mobileMovedElements = [];
    const restored = mobileDetailsNodes.filter((node) => node?.isConnected && !node.matches?.('[data-mobile-attendance-panel]'));
    content.replaceChildren(...restored);
    dialog.querySelector('[data-member-details-footer]')?.remove();
    mobileDetailsNodes = null;
    mobileAttendancePanel = null;
    mobileDetailsData = null;
    mobileProfileCodeNode?.remove();
    mobileProfileCodeNode = null;
    if (mobileDetailsBadgeOriginal) {
      const profileBadge = dialog.querySelector('#detailsMemberBadge');
      if (profileBadge) {
        profileBadge.textContent = mobileDetailsBadgeOriginal.text;
        if (mobileDetailsBadgeOriginal.status) profileBadge.dataset.membershipStatus = mobileDetailsBadgeOriginal.status;
        else delete profileBadge.dataset.membershipStatus;
      }
      mobileDetailsBadgeOriginal = null;
    }
  }

  function onMobileDetailsClick(event) {
    const tab = event.target.closest('[data-member-details-tab]');
    if (tab) selectMobileDetailsTab(tab.dataset.memberDetailsTab);
  }

  function onMobileFooterClick(event) {
    const button = event.target.closest('[data-member-detail-action]');
    if (!button || !hasRequiredPermissions(button.dataset.requiredPermission)) return;
    const action = button.dataset.memberDetailAction;
    if (action === 'more') {
      if (activeMoreMenu) closeMoreMenu({ restoreFocus: true }); else openMoreMenu(button);
      return;
    }
    closeMoreMenu();
    runExistingAction(action);
  }

  function onMobileDetailsKeydown(event) {
    const tab = event.target.closest('[data-member-details-tab]');
    if (!tab || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const tabs = [...content.querySelectorAll('[data-member-details-tab]')];
    const index = tabs.indexOf(tab);
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1
      : (index + (event.key === 'ArrowLeft' ? 1 : -1) + tabs.length) % tabs.length;
    selectMobileDetailsTab(tabs[next]?.dataset.memberDetailsTab, { focus: true });
  }

  function syncMobileDetailsMode(member) {
    if (member) {
      mobileDetailsMember = member;
      updateMobileProfileBadge(member);
    }
    if (!dialog.open) return;
    if (mobileDetailsMedia?.matches) {
      enableMobileDetails(member);
      moveMobileFinancialSummary();
    } else disableMobileDetails();
  }

  function openMoreMenu(trigger) {
    closeMoreMenu();
    const menu = document.getElementById('memberDetailsMoreMenu');
    if (!menu || !trigger) return;
    activeMoreMenu = menu;
    activeMoreTrigger = trigger;
    moreMenuOriginalParent = menu.parentNode;
    moreMenuOriginalNextSibling = menu.nextSibling;
    moreMenuOriginalStyle = menu.getAttribute('style') || '';
    menu.setAttribute('role', 'menu');
    menu.querySelectorAll('button').forEach((item) => {
      item.setAttribute('role', 'menuitem');
      item.tabIndex = 0;
    });
    // Keep the menu inside the native dialog's top layer. Portaling to body
    // would place it below the dialog top layer even with a larger z-index.
    dialog.appendChild(menu);
    menu.hidden = false;
    menu.classList.add('is-floating');
    trigger.setAttribute('aria-expanded', 'true');
    moreMenuOutsideHandler = (event) => {
      if (!activeMoreMenu?.contains(event.target) && event.target !== activeMoreTrigger && !activeMoreTrigger?.contains(event.target)) {
        closeMoreMenu();
      }
    };
    moreMenuKeyHandler = (event) => {
      if (!activeMoreMenu || !activeMoreTrigger) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        closeMoreMenu({ restoreFocus: true });
        return;
      }
      const items = [...activeMoreMenu.querySelectorAll('[role="menuitem"]')];
      const currentIndex = items.indexOf(document.activeElement);
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        const direction = event.key === 'ArrowDown' ? 1 : -1;
        const nextIndex = currentIndex < 0 ? 0 : (currentIndex + direction + items.length) % items.length;
        items[nextIndex]?.focus({ preventScroll: true });
      } else if (event.key === 'Home' || event.key === 'End') {
        event.preventDefault();
        items[event.key === 'Home' ? 0 : items.length - 1]?.focus({ preventScroll: true });
      } else if (event.key === 'Tab' && activeMoreMenu.contains(document.activeElement)) {
        closeMoreMenu();
      }
    };
    moreMenuRepositionHandler = () => positionMoreMenu();
    document.addEventListener('pointerdown', moreMenuOutsideHandler, true);
    document.addEventListener('keydown', moreMenuKeyHandler, true);
    window.addEventListener('resize', moreMenuRepositionHandler);
    window.addEventListener('scroll', moreMenuRepositionHandler, true);
    positionMoreMenu();
    window.requestAnimationFrame(() => activeMoreMenu?.querySelector('[role="menuitem"]')?.focus({ preventScroll: true }));
  }

  function renderOverview(member, details) {
    content.querySelector('.member-details-overview')?.remove();
    const subscription = resolveSubscription(member, details) || {};
    const freezeLimit = number(subscription.freezeLimit || 3);
    const freezeCount = number(subscription.freezeCount ?? details?.freezes?.length);
    const days = remainingDays(subscription);
    const remaining = number(subscription.amountRemaining);
    const status = String(subscription.status || '').toLowerCase();
    const canFreeze = ['active', 'expiring_soon'].includes(status) && freezeCount < freezeLimit;
    const freezeAction = status === 'frozen'
      ? actionButton('resume', 'استئناف', 'member-details-action-secondary')
      : canFreeze ? actionButton('freeze', 'تجميد', 'member-details-action-secondary') : '';
    const isCancelled = status === 'cancelled';
    const paymentAction = isCancelled ? '' : '<button type="button" data-member-detail-action="payment" data-required-permission="payments.create">' + icon('payment') + '<span>تسجيل دفعة</span></button>';
    const canRefund = window.topGymAuth?.isOwner?.() === true && number(subscription.amountPaid) > 0;
    const refundAction = canRefund ? '<button type="button" data-member-detail-action="refund" data-owner-only>' + icon('refund') + '<span>استرجاع الاشتراك</span></button>' : '';
    const overview = document.createElement('div');
    overview.className = 'member-details-overview';
    overview.innerHTML = `<div class="member-details-overview-heading"><span>ملخص العضوية</span><small>الحالة والمدة والتجميد</small></div><div class="member-details-stats" aria-label="ملخص الاشتراك">
      <article class="member-detail-stat"><span class="member-detail-stat-icon">${icon('subscription')}</span><span class="member-detail-stat-copy"><small>الاشتراك</small><strong>${escapeHtml(planLabels[subscription.plan] || subscription.plan || '—')}</strong><em>${escapeHtml(typeLabels[subscription.type] || subscription.type || '—')}</em></span></article>
      <article class="member-detail-stat"><span class="member-detail-stat-icon">${icon('calendar')}</span><span class="member-detail-stat-copy"><small>تاريخ الانتهاء</small><strong class="member-ltr-value">${escapeHtml(dateText(subscription.effectiveEndDate || subscription.endDate))}</strong><em>${days === null ? '—' : days >= 0 ? `${days} يوم متبقي` : `منتهية منذ ${Math.abs(days)} يوم`}</em></span></article>
      <article class="member-detail-stat"><span class="member-detail-stat-icon">${icon('freeze')}</span><span class="member-detail-stat-copy"><small>التجميد</small><strong class="member-ltr-value">${freezeCount}/${freezeLimit}</strong><em>متبقي ${Math.max(0, freezeLimit - freezeCount)} مرات</em></span></article>
      <article class="member-detail-stat${remaining > 0 ? ' has-outstanding' : ''}"><span class="member-detail-stat-icon">${icon('wallet')}</span><span class="member-detail-stat-copy"><small>الحساب</small><strong class="member-ltr-value">${escapeHtml(money(subscription.amountDue))}</strong><em${remaining > 0 ? ' class="outstanding-text"' : ''}>${remaining > 0 ? `المتبقي ${escapeHtml(money(remaining))}` : 'الحساب مسدد'}</em></span></article>
    </div>
    <section class="member-details-actions" aria-labelledby="memberDetailsActionsTitle"><h4 id="memberDetailsActionsTitle">الإجراءات</h4><div class="member-details-action-grid">
       ${actionButton('renew', 'تجديد', 'member-details-action-primary member-details-action-renew')}
      ${actionButton('view', 'عرض', 'member-details-action-secondary')}
      ${actionButton('print', 'طباعة', 'member-details-action-secondary')}
       ${freezeAction}
       <span class="member-details-more"><button class="member-details-action member-details-action-more" type="button" data-member-detail-action="more" aria-haspopup="menu" aria-expanded="false" aria-controls="memberDetailsMoreMenu" aria-label="المزيد" title="المزيد">${icon('more')}</button><span class="member-details-more-menu" id="memberDetailsMoreMenu" hidden>${paymentAction}${window.topGymAuth?.isOwner?.() === true ? `<button type="button" data-member-detail-action="qr" data-owner-only>${icon('qr')}<span>بطاقة العضوية</span></button>` : ''}<button type="button" data-member-detail-action="edit" data-required-permission="members.update">${icon('view')}<span>تعديل البيانات</span></button>${refundAction}</span></span>
       </div></section>`;
    overview.querySelector('[data-member-detail-action="qr"]')?.remove();
    if (hasRequiredPermissions('members.read,memberships.read,attendance.read')) {
      const menu = overview.querySelector('#memberDetailsMoreMenu');
      if (menu) {
        const button = document.createElement('button');
        button.type = 'button';
        button.dataset.memberDetailAction = 'qr';
        button.dataset.id = String(member.id);
        button.dataset.requiredPermission = 'members.read,memberships.read,attendance.read';
        button.innerHTML = `${icon('qr')}<span>بطاقة العضوية</span>`;
        menu.append(button);
      }
    }
    content.prepend(overview);
    const moreMenu = overview.querySelector('#memberDetailsMoreMenu');
    moreMenu?.addEventListener('click', (event) => {
      const item = event.target.closest('[data-member-detail-action]');
      if (!item) return;
      if (item.hasAttribute('data-owner-only') && window.topGymAuth?.isOwner?.() !== true) return;
      if (!hasRequiredPermissions(item.dataset.requiredPermission)) return;
      const action = item.dataset.memberDetailAction;
      closeMoreMenu();
      runExistingAction(action);
    });
    overview.append(renderMemberScope(member, subscription));
  }

  function renderStorePurchases(purchases, loading = false, state = 'ready') {
    content.querySelector('[data-member-store-purchases]')?.remove();
    const section = document.createElement('section');
    section.className = 'details-section member-store-purchases';
    section.dataset.memberStorePurchases = 'true';
    if (loading) {
      section.innerHTML = '<h4>مشتريات المتجر</h4><div class="history-empty">جاري تحميل مشتريات العضو…</div>';
      content.append(section);
      return;
    }
    if (state === 'denied') {
      section.innerHTML = '<h4>مشتريات المتجر</h4><div class="history-empty">لا تتوفر لديك صلاحية عرض مشتريات هذا العضو.</div>';
      content.append(section);
      return;
    }
    const rows = (purchases || []).map((item) => `<tr><td><strong dir="ltr">${escapeHtml(item.saleNumber || '—')}</strong><span class="table-sub">${escapeHtml(dateText(item.saleDate))}</span></td><td>${escapeHtml(item.items || '—')}</td><td><strong class="member-ltr-value">${escapeHtml(money(item.totalAmount))}</strong><span class="table-sub">مدفوع ${escapeHtml(money(item.paidAmount))} · متبقي ${escapeHtml(money(item.remainingAmount))}</span></td><td>${escapeHtml(paymentLabels[item.paymentMethod] || item.paymentMethod || '—')}</td><td><span class="badge ${escapeHtml(item.status || 'completed')}">${item.status === 'cancelled' ? 'ملغاة' : 'مكتملة'}</span></td></tr>`).join('');
    section.innerHTML = `<div class="member-store-purchases-head"><div><span class="member-store-purchases-kicker">مبيعات منفصلة عن العضوية</span><h4>مشتريات المتجر</h4><p>سجل مشتريات العضو من متجر ${brandName()} دون خلطها باشتراك العضوية.</p></div><strong>${number((purchases || []).length)} فاتورة</strong></div><div class="history-scroll">${rows ? `<table class="history-table member-store-purchases-table"><thead><tr><th>الفاتورة والتاريخ</th><th>المنتجات</th><th>الإجمالي</th><th>طريقة الدفع</th><th>الحالة</th></tr></thead><tbody>${rows}</tbody></table>` : '<div class="history-empty">لا توجد مشتريات متجر مسجلة لهذا العضو.</div>'}</div>`;
    content.append(section);
  }

  async function loadStorePurchases(member) {
    const canView = window.topGymAuth?.isOwner?.() === true
      || (window.topGymAuth?.hasPermission?.('members.read') === true
        && window.topGymAuth?.hasPermission?.('store.sales.view') === true);
    if (!canView) {
      renderStorePurchases([], false, 'denied');
      return;
    }
    if (!member?.id || !window.topGymApi?.get) return;
    const requestId = ++storePurchasesRequestId;
    renderStorePurchases([], true);
    try {
      const data = await window.topGymApi.get(`/api/members/${encodeURIComponent(member.id)}/store-purchases`);
      if (requestId !== storePurchasesRequestId || !dialog.open) return;
      renderStorePurchases(data.purchases || []);
    } catch (error) {
      if (requestId !== storePurchasesRequestId || error?.status === 401 || error?.status === 403) return;
      const section = content.querySelector('[data-member-store-purchases]');
      if (section) section.innerHTML = '<h4>مشتريات المتجر</h4><div class="history-empty">تعذر تحميل مشتريات المتجر حاليًا.</div>';
    }
  }

  content.addEventListener('click', (event) => {
    const button = event.target.closest('[data-member-detail-action]');
    if (!button) return;
    if (button.hasAttribute('data-owner-only') && window.topGymAuth?.isOwner?.() !== true) return;
    if (!hasRequiredPermissions(button.dataset.requiredPermission)) return;
    const action = button.dataset.memberDetailAction;
    if (action === 'qr') {
      if (button.dataset.id) void window.topGymMemberDigitalCard?.openFromMemberId(button.dataset.id);
      return;
    }
    if (action === 'more') {
      if (activeMoreMenu) closeMoreMenu({ restoreFocus: true });
      else openMoreMenu(button);
      return;
    }
    closeMoreMenu();
    runExistingAction(action);
  });

  dialog.addEventListener('close', () => { closeMoreMenu(); disableMobileDetails(); mobileDetailsMember = null; });

  mobileDetailsMedia?.addEventListener?.('change', () => syncMobileDetailsMode(mobileDetailsMember));

  window.addEventListener('topgym:member-details-opened', (event) => {
    const member = event.detail?.details?.member || event.detail?.member;
    const details = event.detail?.details;
    if (!member || !details || !dialog.open) return;
    mobileDetailsData = details;
    updateHeader(member, details);
    renderOverview(member, details);
    void loadStorePurchases(member);
    window.requestAnimationFrame(() => syncMobileDetailsMode({ ...member, ...(details.member || {}), attendance: member.attendance || details.member?.attendance }));
  });
})();
