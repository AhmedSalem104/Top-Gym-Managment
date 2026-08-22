(() => {
  'use strict';

  const dialog = document.getElementById('detailsDialog');
  const content = document.getElementById('detailsContent');
  if (!dialog || !content) return;

  let currentMember = null;
  let codeState = null;

  const escapeHtml = (value) => String(value ?? '').replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[character]));
  const notify = async (title, icon = 'success') => {
    if (window.Swal) await window.Swal.fire({ toast: true, position: 'top-start', icon, title, showConfirmButton: false, timer: 3000, customClass: { popup: 'top-gym-alert top-gym-toast' } });
    else window.alert(title);
  };
  const request = async (url, options = {}) => {
    const response = await fetch(url, { credentials: 'same-origin', ...options, headers: { Accept: 'application/json', ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...(options.headers || {}) } });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) { const error = new Error(payload.error || 'تعذر تنفيذ العملية.'); error.status = response.status; throw error; }
    return payload;
  };

  function codeMarkup() {
    const code = codeState?.fullCode || codeState?.maskedCode || 'غير متاح';
    const stateLabel = codeState?.active === false ? 'غير نشط' : 'نشط';
    return `<section class="membership-portal-code-card" data-portal-code-card><div class="membership-portal-code-head"><div><span class="membership-portal-code-kicker">بوابة المشترك</span><h4>كود بوابة المشترك</h4><p>كود مستقل وثابت لمتابعة العضوية دون مشاركة بياناتك الشخصية.</p></div><span class="membership-portal-code-status ${codeState?.active === false ? 'inactive' : 'active'}">${stateLabel}</span></div><div class="membership-portal-code-value"><code dir="ltr">${escapeHtml(code)}</code><span>${codeState?.fullCode ? 'عرض كامل' : 'عرض مختصر'}</span></div><div class="membership-portal-code-actions"><button type="button" class="btn btn-light btn-small" data-portal-code-action="show">${codeState?.fullCode ? 'إخفاء الكود' : 'إظهار الكود'}</button><button type="button" class="btn btn-light btn-small" data-portal-code-action="copy">نسخ الكود</button><button type="button" class="btn btn-light btn-small" data-portal-code-action="whatsapp">إرسال واتساب</button><button type="button" class="btn btn-light btn-small" data-portal-code-action="open">فتح البوابة</button><button type="button" class="btn btn-danger btn-small" data-portal-code-action="rotate">إعادة إصدار</button></div></section>`;
  }

  function renderCard() {
    content.querySelector('[data-portal-code-card]')?.remove();
    const overview = content.querySelector('.member-details-overview');
    const wrapper = document.createElement('div');
    wrapper.innerHTML = codeMarkup();
    const card = wrapper.firstElementChild;
    if (overview) overview.after(card); else content.prepend(card);
  }

  async function loadCode(memberId) {
    try {
      const data = await request(`/api/members/${encodeURIComponent(memberId)}/membership-code`);
      codeState = { ...data, fullCode: null };
      renderCard();
    } catch (error) {
      if (error.status !== 403 && error.status !== 401) await notify(error.message, 'error');
      content.querySelector('[data-portal-code-card]')?.remove();
    }
  }

  async function getFullCode() {
    const data = await request(`/api/members/${encodeURIComponent(dialog.dataset.memberId)}/membership-code/reveal`, { method: 'POST', body: '{}' });
    codeState = { ...data, fullCode: data.membershipCode };
    renderCard();
    return data.membershipCode;
  }

  async function copyCode() {
    const code = codeState?.fullCode || await getFullCode();
    await navigator.clipboard?.writeText(code);
    await notify('تم نسخ كود بوابة المشترك.');
  }

  async function resendCode() {
    const data = await request(`/api/members/${encodeURIComponent(dialog.dataset.memberId)}/membership-code/resend`, { method: 'POST', body: '{}' });
    codeState = { ...data, fullCode: data.membershipCode };
    renderCard();
    if (!window.topGymWhatsapp?.sendMembershipPortalInvite) throw new Error('أداة واتساب غير جاهزة. حدّث الصفحة وحاول مرة أخرى.');
    window.topGymWhatsapp.sendMembershipPortalInvite({ member: currentMember, membershipCode: data.membershipCode, portalUrl: data.portalUrl });
  }

  async function rotateCode() {
    let confirmed = false;
    if (window.Swal) {
      const result = await window.Swal.fire({ icon: 'warning', title: 'إعادة إصدار كود العضوية؟', text: 'سيتوقف الكود القديم فورًا ولن يعمل بعد ذلك.', showCancelButton: true, confirmButtonText: 'إصدار كود جديد', cancelButtonText: 'إلغاء', buttonsStyling: false, customClass: { popup: 'top-gym-alert', confirmButton: 'btn btn-danger', cancelButton: 'btn btn-light' } });
      confirmed = result.isConfirmed;
    } else confirmed = window.confirm('سيتم إلغاء الكود القديم وإصدار كود جديد. هل تريد المتابعة؟');
    if (!confirmed) return;
    const data = await request(`/api/members/${encodeURIComponent(dialog.dataset.memberId)}/membership-code/rotate`, { method: 'POST', body: '{}' });
    codeState = { ...data, fullCode: data.membershipCode };
    renderCard();
    await notify('تم إلغاء الكود القديم وإصدار كود جديد.');
  }

  content.addEventListener('click', async (event) => {
    const button = event.target.closest('[data-portal-code-action]');
    if (!button) return;
    const action = button.dataset.portalCodeAction;
    try {
      if (action === 'show') { if (codeState?.fullCode) codeState.fullCode = null; else await getFullCode(); renderCard(); }
      if (action === 'copy') await copyCode();
      if (action === 'whatsapp') await resendCode();
      if (action === 'open') window.open(`${window.location.origin}/member-portal`, '_blank', 'noopener,noreferrer');
      if (action === 'rotate') await rotateCode();
    } catch (error) { await notify(error.message, 'error'); }
  });

  window.addEventListener('topgym:member-details-opened', (event) => {
    currentMember = event.detail?.member || event.detail?.details?.member || null;
    codeState = null;
    if (currentMember?.id) window.setTimeout(() => loadCode(currentMember.id), 0);
  });

  const decorateMemberRows = async () => {
    const rows = [...document.querySelectorAll('#membersList tr[data-member-id]')];
    await Promise.all(rows.map(async (row) => {
      if (row.dataset.portalPreviewReady === 'true') return;
      row.dataset.portalPreviewReady = 'true';
      try {
        const payload = await request(`/api/members/${encodeURIComponent(row.dataset.memberId)}`);
        const preview = payload.member?.membershipCode?.maskedCode;
        if (!preview) return;
        const cell = row.querySelector('td:first-child');
        if (cell && !cell.querySelector('.member-code-preview')) cell.insertAdjacentHTML('beforeend', `<span class="table-sub member-code-preview">كود البوابة: <b dir="ltr">${escapeHtml(preview)}</b></span>`);
      } catch (_) { /* The preview is optional UX; keep the member table usable. */ }
    }));
  };
  const observer = new MutationObserver(() => window.setTimeout(decorateMemberRows, 0));
  const membersList = document.getElementById('membersList');
  if (membersList) { observer.observe(membersList, { childList: true, subtree: true }); decorateMemberRows(); }
})();
