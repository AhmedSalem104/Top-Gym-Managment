(() => {
    'use strict';
    if (window.__topGymWhatsappEnhancementsLoaded) return;
    window.__topGymWhatsappEnhancementsLoaded = true;

    const memberForm = document.getElementById('memberForm');
    const whatsappOption = document.getElementById('sendWhatsAppAfterSave');
    const checkIcon = '✅';
    if (!memberForm || !whatsappOption) return;

    function latinDigits(value) {
        return String(value ?? '').replace(/[٠-٩]/g, (digit) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(digit)));
    }

    function normalizePhone(value, country = '') {
        const input = memberForm.elements?.namedItem('phone');
        const selectedCountry = country
            || window.LogicFitPhoneInputs?.countryForValue?.(value)
            || input?.dataset?.phoneCountry
            || '';
        const prepared = window.LogicFitPhoneInputs?.normalizeForTransport?.(latinDigits(value), selectedCountry) || latinDigits(value).trim();
        return /^\+[1-9]\d{6,14}$/.test(prepared) ? prepared.slice(1) : '';
    }

    function isMobileDevice() { return /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent || ''); }

    function openWhatsappChat(phone, message = '', existingWindow = null) {
        if (!phone) return false;
        const url = `https://wa.me/${phone}${message ? `?text=${encodeURIComponent(message)}` : ''}`;
        if (isMobileDevice() && !existingWindow) {
            const link = document.createElement('a');
            link.href = `whatsapp://send?phone=${phone}&text=${encodeURIComponent(message)}`;
            link.hidden = true;
            link.setAttribute('aria-hidden', 'true');
            document.body.append(link);
            link.click();
            link.remove();
            return true;
        }
        const opened = existingWindow && !existingWindow.closed
            ? existingWindow
            : window.open(url, 'topGymWhatsapp', 'popup=yes,width=480,height=760,resizable=yes,scrollbars=yes');
        if (opened && existingWindow) opened.location.href = url;
        if (opened) opened.opener = null;
        return Boolean(opened);
    }

    function prepareWhatsappWindow(phone, country = '') {
        if (!normalizePhone(phone, country) || isMobileDevice()) return null;
        const opened = window.open('about:blank', 'topGymWhatsapp', 'popup=yes,width=480,height=760,resizable=yes,scrollbars=yes');
        if (opened) opened.opener = null;
        return opened || null;
    }

    function closeWhatsappWindow(opened) { if (opened && !opened.closed) opened.close(); }

    function showWhatsappStatus(phone, message, opened) {
        if (!window.Swal) return;
        if (opened) {
            window.Swal.fire({ toast: true, position: 'top-start', icon: 'success', title: `تم فتح واتساب والرسالة جاهزة ${checkIcon}`, showConfirmButton: false, timer: 2800, timerProgressBar: true, customClass: { popup: 'top-gym-alert top-gym-toast' } });
            return;
        }
        window.Swal.fire({
            icon: 'info', title: `تم حفظ المشترك ${checkIcon}`,
            text: 'لم يفتح واتساب تلقائيًا. اضغط الزر لفتح المحادثة والرسالة جاهزة للإرسال.',
            showCancelButton: true, confirmButtonText: 'فتح واتساب', cancelButtonText: 'لاحقًا', buttonsStyling: false,
            customClass: { popup: 'top-gym-alert', confirmButton: 'btn btn-primary', cancelButton: 'btn btn-light' }
        }).then((result) => { if (result.isConfirmed) openWhatsappChat(phone, message); });
    }

    async function renderTemplate(templateId, context, options = {}) {
        if (!window.LogicFitWhatsAppTemplates?.render) throw new Error('أداة قوالب الرسائل غير جاهزة.');
        return window.LogicFitWhatsAppTemplates.render(templateId, context, options);
    }

    function memberContext(member = {}, payload = {}, labels = {}) {
        const membership = member.membership || {};
        const due = Number(membership.amountDue ?? payload.amountDue ?? 0);
        const paid = Number(membership.amountPaid ?? payload.amountPaid ?? 0);
        const remaining = Math.max(0, Number(membership.amountRemaining ?? due - paid) || 0);
        const discount = Number(membership.discountAmount ?? payload.discountAmount ?? 0);
        return {
            member_name: member.fullName || payload.fullName || 'العضو',
            gym_name: window.topGymBranding?.get?.().identity?.brandName || 'Logic Fit',
            plan_name: labels.plan || membership.plan || payload.membershipPlan || '',
            membership_type: labels.type || membership.type || payload.membershipType || '',
            start_date: membership.startDate || payload.startDate || '',
            expiry_date: membership.effectiveEndDate || membership.endDate || payload.endDate || '',
            list_price: String(Number(membership.listPrice ?? payload.listPrice ?? due + discount) || 0),
            discount_amount: discount > 0 ? String(discount) : '',
            amount_due: due > 0 ? String(due) : '',
            amount_paid: paid > 0 ? String(paid) : '',
            remaining_amount: remaining > 0 ? String(remaining) : '',
            payment_method: labels.payment || membership.paymentMethod || payload.paymentMethod || '',
            freeze_until: membership.freezeEnd || '',
            days_remaining: member.daysRemaining ?? '',
            days_since_last_visit: member.daysSinceLastVisit ?? ''
        };
    }

    function alertTemplateId(member, kind) {
        if (kind === 'debt') return 'PAYMENT_OUTSTANDING';
        if (kind === 'inactive') return 'MEMBER_ABSENCE';
        const status = String(member?.membership?.status || '').toLowerCase();
        if (status === 'frozen') return 'MEMBERSHIP_FROZEN';
        if (status === 'expired') return 'MEMBERSHIP_EXPIRED';
        return 'MEMBERSHIP_EXPIRING';
    }

    function alertContext(member = {}) {
        const context = memberContext(member);
        context.expiry_date = member.membership?.effectiveEndDate || member.membership?.endDate || '';
        context.freeze_until = member.membership?.freezeEnd || '';
        context.remaining_amount = Number(member.membership?.amountRemaining || 0) > 0 ? String(member.membership.amountRemaining) : '';
        return context;
    }

    async function sendMembershipPortalInvite(detail = {}) {
        const member = detail.member || {};
        const phone = normalizePhone(detail.phone || member.phone, member.phoneCountry || detail.payload?.phoneCountry);
        if (!phone) throw new Error('رقم هاتف المشترك غير صالح لفتح واتساب.');
        const message = await renderTemplate('PORTAL_ACCESS', {
            member_name: member.fullName || 'العضو',
            gym_name: window.topGymBranding?.get?.().identity?.brandName || 'Logic Fit',
            membership_code: detail.membershipCode || member.membershipCode || '',
            portal_url: detail.portalUrl || member.membershipCodePortalUrl || `${window.location.origin}/member-portal`
        });
        const opened = openWhatsappChat(phone, message);
        showWhatsappStatus(phone, message, opened);
        return opened;
    }

    async function sendMembershipFreezeNotice(detail = {}) {
        const member = detail.member || {};
        const phone = normalizePhone(member.phone, member.phoneCountry);
        if (!phone) throw new Error('رقم هاتف العضو غير صالح لفتح واتساب.');
        const message = await renderTemplate('MEMBERSHIP_FROZEN', memberContext(member, detail.payload, detail.labels));
        const preparedWindow = detail.whatsappWindow && !detail.whatsappWindow.closed ? detail.whatsappWindow : null;
        const opened = openWhatsappChat(phone, message, preparedWindow);
        showWhatsappStatus(phone, message, opened);
        return opened;
    }

    async function sendWhatsappMessage(detail = {}) {
        const member = detail.member || {};
        const payload = detail.payload || {};
        const phone = normalizePhone(payload.phone || member.phone, payload.phoneCountry || member.phoneCountry);
        if (!phone) {
            window.Swal?.fire({ toast: true, position: 'top-start', icon: 'warning', title: 'تم الحفظ — رقم الهاتف غير صحيح', showConfirmButton: false, timer: 4500, timerProgressBar: true, customClass: { popup: 'top-gym-alert top-gym-toast' } });
            return;
        }
        const message = await renderTemplate('MEMBERSHIP_WELCOME', memberContext(member, payload, detail.labels));
        const openedWindow = detail.whatsappWindow && !detail.whatsappWindow.closed ? detail.whatsappWindow : null;
        const opened = openWhatsappChat(phone, message, openedWindow);
        showWhatsappStatus(phone, message, opened);
    }

    async function recordAlertCommunication(memberId, kind, status, button) {
        const alertKey = button?.dataset.alertKey || '';
        if (!memberId || !kind || !alertKey) return null;
        const response = await fetch(`/api/members/${encodeURIComponent(memberId)}/alert-communications`, {
            method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ alertKind: kind, alertKey, status })
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error || 'تعذر حفظ حالة التواصل.');
        return data.contact || null;
    }

    function updateAlertContactState(button, contact) {
        if (!button || !contact?.status) return;
        const host = button.closest('.alert-card-actions, .reports-debtor-actions');
        if (!host) return;
        host.querySelectorAll(':scope > .alert-contact-state').forEach((item) => item.remove());
        const state = document.createElement('span');
        state.className = `alert-contact-state ${contact.status === 'sent' ? 'sent' : 'opened'}`;
        state.innerHTML = `<span class="alert-contact-dot" aria-hidden="true"></span>${contact.status === 'sent' ? 'تم التواصل' : 'تم فتح واتساب'}`;
        host.insertBefore(state, button);
    }

    async function markAlertOpened(memberId, kind, button) {
        try { updateAlertContactState(button, await recordAlertCommunication(memberId, kind, 'opened', button)); } catch (_) { /* opening WhatsApp remains successful even if audit write fails */ }
        if (!window.Swal || !button?.dataset.alertKey) return;
        const result = await window.Swal.fire({ icon: 'question', title: 'هل تم إرسال الرسالة؟', text: 'تم فتح واتساب والرسالة جاهزة. أكد الحالة يدويًا.', showCancelButton: true, confirmButtonText: 'تم الإرسال', cancelButtonText: 'لم أرسل بعد', buttonsStyling: false, customClass: { popup: 'top-gym-alert', confirmButton: 'btn btn-primary', cancelButton: 'btn btn-light' } });
        if (!result.isConfirmed) return;
        try { updateAlertContactState(button, await recordAlertCommunication(memberId, kind, 'sent', button)); } catch (_) { /* no message content or secret is logged */ }
    }

    async function sendAlertWhatsapp(memberId, kind, button = null) {
        if (button) button.disabled = true;
        let preparedWindow = null;
        try {
            const response = await fetch(`/api/members/${encodeURIComponent(memberId)}`, { credentials: 'same-origin' });
            const data = await response.json().catch(() => ({}));
            if (!response.ok) throw new Error(data.error || 'تعذر تحميل بيانات المشترك.');
            const member = data.member || data;
            const phone = normalizePhone(member.phone, member.phoneCountry);
            if (!phone) throw new Error('رقم هاتف المشترك غير صالح لفتح واتساب.');
            if (!isMobileDevice()) preparedWindow = prepareWhatsappWindow(phone);
            const message = await renderTemplate(alertTemplateId(member, kind), alertContext(member));
            const opened = openWhatsappChat(phone, message, preparedWindow);
            if (opened) await markAlertOpened(memberId, kind, button);
            else showWhatsappStatus(phone, message, null);
        } catch (error) {
            closeWhatsappWindow(preparedWindow);
            window.Swal?.fire({ toast: true, position: 'top-start', icon: 'error', title: 'تعذر تجهيز رسالة واتساب', text: error.message, showConfirmButton: false, timer: 4500, customClass: { popup: 'top-gym-alert top-gym-toast' } });
        } finally { if (button) button.disabled = false; }
    }

    window.topGymWhatsapp = { prepareWindow: prepareWhatsappWindow, closeWindow: closeWhatsappWindow, sendAlert: sendAlertWhatsapp, sendMembershipPortalInvite, sendMembershipFreezeNotice };
    window.addEventListener('topgym:member-created', (event) => { if (event.detail?.sendWhatsApp) void sendWhatsappMessage(event.detail); });
    document.addEventListener('click', (event) => {
        const button = event.target.closest('[data-alert-whatsapp]');
        if (!button) return;
        event.preventDefault(); event.stopPropagation();
        void sendAlertWhatsapp(button.dataset.memberId, button.dataset.alertWhatsapp, button);
    });
})();
