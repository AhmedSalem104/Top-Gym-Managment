(() => {
  'use strict';

  if (window.__topGymMemberDetailsUiLoaded) return;

  const dialog = document.getElementById('detailsDialog');
  const content = document.getElementById('detailsContent');
  if (!dialog || !content) return;
  window.__topGymMemberDetailsUiLoaded = true;

  const brandName = () => String(window.topGymBranding?.get?.().identity?.brandName || 'الجيم').trim() || 'الجيم';

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

  function resolveSubscription(member, details) {
    const memberships = Array.isArray(details?.memberships) ? details.memberships : [];
    return member?.membership || memberships.find((item) => item?.status !== 'cancelled') || memberships[memberships.length - 1] || null;
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
    if (subtitle) subtitle.textContent = `${member?.phone || '—'}${member?.email ? ` · ${member.email}` : ''}`;
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
    if (typeof dialog.close === 'function' && dialog.open) dialog.close();
    window.requestAnimationFrame(() => source.click());
  }

  function actionButton(action, label, className = '') {
    return `<button class="member-details-action ${className}" type="button" data-member-detail-action="${action}" aria-label="${label}" title="${label}">${icon(action)}<span>${label}</span></button>`;
  }

  function renderOverview(member, details) {
    content.querySelector('.member-details-overview')?.remove();
    const subscription = resolveSubscription(member, details) || {};
    const freezeLimit = number(subscription.freezeLimit || 3);
    const freezeCount = number(subscription.freezeCount ?? details?.freezes?.length);
    const days = remainingDays(subscription);
    const remaining = number(subscription.amountRemaining);
    const isCancelled = subscription.status === 'cancelled';
    const freezeAction = isCancelled ? '' : actionButton('freeze', 'تجميد', 'member-details-action-secondary');
    const paymentAction = isCancelled ? '' : '<button type="button" data-member-detail-action="payment">' + icon('payment') + '<span>تسجيل دفعة</span></button>';
    const canRefund = window.topGymAuth?.isOwner?.() === true && number(subscription.amountPaid) > 0;
    const refundAction = canRefund ? '<button type="button" data-member-detail-action="refund">' + icon('refund') + '<span>استرجاع الاشتراك</span></button>' : '';
    const overview = document.createElement('div');
    overview.className = 'member-details-overview';
    overview.innerHTML = `<div class="member-details-stats" aria-label="ملخص الاشتراك">
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
       <span class="member-details-more"><button class="member-details-action member-details-action-more" type="button" data-member-detail-action="more" aria-expanded="false" aria-controls="memberDetailsMoreMenu" aria-label="المزيد" title="المزيد">${icon('more')}</button><span class="member-details-more-menu" id="memberDetailsMoreMenu" hidden>${paymentAction}<button type="button" data-member-detail-action="qr">${icon('qr')}<span>عرض QR</span></button><button type="button" data-member-detail-action="edit">${icon('view')}<span>تعديل البيانات</span></button>${refundAction}</span></span>
    </div></section>`;
    content.prepend(overview);
  }

  function renderStorePurchases(purchases, loading = false) {
    content.querySelector('[data-member-store-purchases]')?.remove();
    const section = document.createElement('section');
    section.className = 'details-section member-store-purchases';
    section.dataset.memberStorePurchases = 'true';
    if (loading) {
      section.innerHTML = '<h4>مشتريات المتجر</h4><div class="history-empty">جاري تحميل مشتريات العضو…</div>';
      content.append(section);
      return;
    }
    const rows = (purchases || []).map((item) => `<tr><td><strong dir="ltr">${escapeHtml(item.saleNumber || '—')}</strong><span class="table-sub">${escapeHtml(dateText(item.saleDate))}</span></td><td>${escapeHtml(item.items || '—')}</td><td><strong class="member-ltr-value">${escapeHtml(money(item.totalAmount))}</strong><span class="table-sub">مدفوع ${escapeHtml(money(item.paidAmount))} · متبقي ${escapeHtml(money(item.remainingAmount))}</span></td><td>${escapeHtml(paymentLabels[item.paymentMethod] || item.paymentMethod || '—')}</td><td><span class="badge ${escapeHtml(item.status || 'completed')}">${item.status === 'cancelled' ? 'ملغاة' : 'مكتملة'}</span></td></tr>`).join('');
    section.innerHTML = `<div class="member-store-purchases-head"><div><span class="member-store-purchases-kicker">مبيعات منفصلة عن العضوية</span><h4>مشتريات المتجر</h4><p>سجل مشتريات العضو من متجر ${brandName()} دون خلطها باشتراك العضوية.</p></div><strong>${number((purchases || []).length)} فاتورة</strong></div><div class="history-scroll">${rows ? `<table class="history-table member-store-purchases-table"><thead><tr><th>الفاتورة والتاريخ</th><th>المنتجات</th><th>الإجمالي</th><th>طريقة الدفع</th><th>الحالة</th></tr></thead><tbody>${rows}</tbody></table>` : '<div class="history-empty">لا توجد مشتريات متجر مسجلة لهذا العضو.</div>'}</div>`;
    content.append(section);
  }

  async function loadStorePurchases(member) {
    const canView = window.topGymAuth?.isOwner?.() === true || window.topGymAuth?.hasPermission?.('store.sales.view') === true;
    if (!canView || !member?.id || !window.topGymApi?.get) return;
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
    const action = button.dataset.memberDetailAction;
    if (action === 'more') {
      const menu = document.getElementById('memberDetailsMoreMenu');
      const open = Boolean(menu && menu.hidden);
      if (menu) menu.hidden = !open;
      button.setAttribute('aria-expanded', String(open));
      return;
    }
    document.getElementById('memberDetailsMoreMenu')?.setAttribute('hidden', '');
    runExistingAction(action);
  });

  window.addEventListener('topgym:member-details-opened', (event) => {
    const member = event.detail?.member || event.detail?.details?.member;
    const details = event.detail?.details;
    if (!member || !details || !dialog.open) return;
    updateHeader(member, details);
    renderOverview(member, details);
    void loadStorePurchases(member);
  });
})();
