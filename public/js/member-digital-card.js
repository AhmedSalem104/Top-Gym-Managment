(() => {
    'use strict';
    if (window.__logicFitMemberDigitalCardLoaded) return;
    window.__logicFitMemberDigitalCardLoaded = true;

    const dialog = document.getElementById('memberQrDialog');
    const canvas = document.getElementById('memberQrCanvas');
    if (!dialog || !canvas) return;

    const ctx = canvas.getContext('2d');
    const status = document.getElementById('memberQrStatus');
    const closeButton = document.getElementById('memberQrClose');
    const downloadButton = document.getElementById('memberQrDownload');
    const shareButton = document.getElementById('memberQrShare');
    const whatsappButton = document.getElementById('memberQrWhatsapp');
    const editPhoneButton = document.getElementById('memberQrEditPhone');
    const retryButton = document.getElementById('memberQrRetry');
    const CARD_WIDTH = 1080;
    const CARD_HEIGHT = 1350;
    let currentCard = null;
    let lastOpenRequest = null;
    let busy = false;

    const escapeStatus = (message) => { if (status) status.textContent = message; };
    const canUseCard = () => window.topGymAuth?.isOwner?.() === true || ['members.read', 'memberships.read', 'attendance.read'].every((permission) => window.topGymAuth?.hasPermission?.(permission) === true);
    const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));
    const validCode = (value) => /^LFQR1\.[A-Za-z0-9_-]{32,160}$/.test(String(value || '').trim());
    const dateText = (value) => {
        if (!value) return '';
        const date = new Date(`${String(value).slice(0, 10)}T00:00:00`);
        return Number.isNaN(date.getTime()) ? '' : new Intl.DateTimeFormat('ar-EG-u-ca-gregory', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(date);
    };
    const membershipStatus = (membership) => {
        const current = String(membership?.status || '').toLowerCase();
        return ({ active: 'نشط', expiring_soon: 'قارب على الانتهاء', frozen: 'مجمّد', expired: 'منتهي', cancelled: 'ملغي' })[current] || (membership ? 'غير محدد' : 'لا توجد عضوية حالية');
    };
    const statusAppearance = (membership) => {
        const current = String(membership?.status || '').toLowerCase();
        if (['active', 'expiring_soon'].includes(current)) return { background: '#edf8f3', foreground: '#13744f' };
        if (current === 'frozen') return { background: '#fff5df', foreground: '#9b6410' };
        if (['expired', 'cancelled'].includes(current)) return { background: '#fff0f0', foreground: '#b42323' };
        return { background: '#f1f5f9', foreground: '#526176' };
    };
    const membershipTypeLabel = (value) => ({ monthly: 'شهرية', half_month: 'نصف شهر', quarterly: 'ربع سنوية', semiannual: 'نصف سنوية', annual: 'سنوية' })[String(value || '').toLowerCase()] || String(value || '');
    const membershipPlanLabel = (value) => ({ gym_only: 'جيم فقط', gym_cardio: 'جيم وكارديو' })[String(value || '').toLowerCase()] || String(value || '');
    const initials = (value) => String(value || '').trim().split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join('') || '—';
    const drawText = (text, x, y, size, color, weight = 500, align = 'right') => {
        if (!text) return;
        ctx.fillStyle = color;
        ctx.font = `${weight} ${size}px Cairo, Tahoma, sans-serif`;
        ctx.textAlign = align;
        ctx.textBaseline = 'middle';
        ctx.direction = 'rtl';
        ctx.fillText(String(text), x, y, 840);
    };
    const roundedRect = (x, y, width, height, radius, fill, stroke = null) => {
        ctx.beginPath();
        ctx.roundRect(x, y, width, height, radius);
        ctx.fillStyle = fill;
        ctx.fill();
        if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 2; ctx.stroke(); }
    };
    async function loadTenantBranding() {
        const result = await window.topGymBranding?.refresh?.({ scope: 'tenant' });
        if (!result?.loaded) throw new Error('تعذر تحميل هوية الجيم الحالية بأمان. أعد المحاولة.');
        const branding = result.branding;
        const gymName = String(branding?.identity?.brandName || '').trim();
        if (!gymName) throw new Error('اسم الجيم غير متاح، لذلك لم يتم تجهيز البطاقة.');
        const logoKey = ['primaryLogo', 'horizontalLogo', 'lightLogo', 'darkLogo', 'compactLogo'].find((key) => branding.assets?.[key]?.url);
        const logoUrl = logoKey ? window.topGymBranding.assetUrl(logoKey) : '';
        return { branding, gymName, logoUrl };
    }
    async function imageFromUrl(url) {
        if (!url) return null;
        const parsed = new URL(url, window.location.origin);
        if (parsed.origin !== window.location.origin) return null;
        return new Promise((resolve) => {
            const image = new Image();
            image.onload = () => resolve(image);
            image.onerror = () => resolve(null);
            image.src = parsed.href;
        });
    }
    function drawCard({ member, membership, gymName, logo, qrCanvas }) {
        ctx.clearRect(0, 0, CARD_WIDTH, CARD_HEIGHT);
        ctx.fillStyle = '#f2f6fc'; ctx.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT);
        roundedRect(42, 42, 996, 1266, 34, '#ffffff', '#dbe5f2');
        roundedRect(42, 42, 996, 18, 9, '#1769e8');
        const logoX = 920;
        if (logo) {
            const ratio = Math.min(112 / logo.width, 112 / logo.height);
            const width = logo.width * ratio; const height = logo.height * ratio;
            ctx.drawImage(logo, logoX - width, 100, width, height);
        } else {
            roundedRect(900, 92, 92, 92, 24, '#eaf1ff');
            drawText(initials(gymName), 946, 138, 32, '#1769e8', 800, 'center');
        }
        drawText(gymName, 870, 116, 42, '#172033', 800);
        drawText('بطاقة العضوية الرقمية', 870, 168, 24, '#66758b', 500);
        ctx.strokeStyle = '#e6edf5'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(100, 230); ctx.lineTo(980, 230); ctx.stroke();

        roundedRect(814, 274, 166, 166, 83, '#eaf1ff');
        drawText(initials(member.fullName), 897, 357, 56, '#1769e8', 800, 'center');
        drawText(member.fullName || '', 770, 300, 44, '#172033', 800);
        const statusColors = statusAppearance(membership);
        roundedRect(618, 390, 164, 48, 24, statusColors.background);
        drawText(membershipStatus(membership), 700, 414, 21, statusColors.foreground, 700, 'center');

        let y = 520;
        const fields = [
            ['الباقة', membershipPlanLabel(membership?.plan)],
            ['نوع الاشتراك', membershipTypeLabel(membership?.typeLabel || membership?.type)],
            ['الحالة', membershipStatus(membership)],
            ['تاريخ البداية', dateText(membership?.startDate)],
            ['تاريخ الانتهاء', dateText(membership?.effectiveEndDate || membership?.endDate)]
        ].filter(([, value]) => String(value || '').trim());
        fields.forEach(([label, value], index) => {
            const column = index % 2;
            const row = Math.floor(index / 2);
            const x = column === 0 ? 980 : 520;
            const top = y + row * 132;
            roundedRect(x - 410, top, 410, 104, 18, '#f8fafd', '#edf1f7');
            drawText(label, x - 28, top + 32, 20, '#718096', 500);
            drawText(value, x - 28, top + 72, 27, '#172033', 700);
        });
        if (qrCanvas) {
            const qrSize = 290;
            const qrX = (CARD_WIDTH - qrSize) / 2;
            const qrY = 930;
            roundedRect(qrX - 25, qrY - 25, qrSize + 50, qrSize + 50, 22, '#ffffff', '#e1e8f0');
            ctx.imageSmoothingEnabled = false;
            ctx.drawImage(qrCanvas, qrX, qrY, qrSize, qrSize);
            ctx.imageSmoothingEnabled = true;
            drawText('استخدم الرمز عند تسجيل الحضور والانصراف', CARD_WIDTH / 2, 1280, 23, '#526176', 600, 'center');
        } else {
            drawText('لا يوجد رمز عضوية نشط لهذه البطاقة', CARD_WIDTH / 2, 1000, 24, '#718096', 600, 'center');
        }
    }
    async function renderCard(member, qrToken, tenant) {
        if (!validCode(qrToken)) throw new Error('رمز الحضور غير متاح لهذا العضو.');
        const qrLibrary = window.topGymLoadExternalAsset?.('qrcode');
        if (qrLibrary) await qrLibrary;
        if (!window.QRCode?.toCanvas) throw new Error('تعذر تحميل مولّد QR. أعد المحاولة.');
        await document.fonts?.ready;
        const qrCanvas = document.createElement('canvas');
        await window.QRCode.toCanvas(qrCanvas, String(qrToken).trim(), {
            width: 330, margin: 4, errorCorrectionLevel: 'Q',
            color: { dark: '#111827', light: '#ffffff' }
        });
        const logo = await imageFromUrl(tenant.logoUrl);
        const membership = member.membership || member.currentMembership || null;
        drawCard({ member, membership, gymName: tenant.gymName, logo, qrCanvas });
        currentCard = { member, membership, gymName: tenant.gymName };
        return currentCard;
    }
    async function openCard(member, qrToken, context = 'resend') {
        if (!canUseCard()) throw new Error('لا تملك الصلاحيات المطلوبة لعرض بطاقة العضو.');
        if (busy) return;
        busy = true;
        lastOpenRequest = { memberId: member?.id, context };
        if (retryButton) retryButton.hidden = true;
        if (editPhoneButton) editPhoneButton.hidden = true;
        [shareButton, whatsappButton, downloadButton].forEach((button) => { if (button) button.disabled = true; });
        if (dialog.showModal && !dialog.open) dialog.showModal(); else dialog.setAttribute('open', '');
        escapeStatus('جارٍ تجهيز بطاقة العضوية...');
        try {
            const tenant = await loadTenantBranding();
            await renderCard(member || {}, qrToken, tenant);
            currentCard.context = context;
            try { await window.topGymEnsureWhatsapp?.(); } catch (_) { /* Card preview/download remain available without WhatsApp. */ }
            escapeStatus('البطاقة جاهزة. رمز QR لا يقرر السماح بالدخول؛ النظام يتحقق من حالة العضوية عند المسح.');
        } catch (error) {
            currentCard = null;
            ctx.clearRect(0, 0, CARD_WIDTH, CARD_HEIGHT);
            escapeStatus(error.message || 'تعذر تجهيز بطاقة العضوية.');
            if (retryButton) retryButton.hidden = false;
        } finally {
            busy = false;
            [shareButton, whatsappButton, downloadButton].forEach((button) => { if (button) button.disabled = !currentCard; });
        }
    }
    async function openFromMemberId(memberId, context = 'resend') {
        if (!canUseCard()) { window.showToast?.('لا تملك الصلاحيات المطلوبة لعرض البطاقة.', true, 'warning'); return; }
        if (busy) return;
        busy = true;
        lastOpenRequest = { memberId, context };
        currentCard = null;
        ctx.clearRect(0, 0, CARD_WIDTH, CARD_HEIGHT);
        [shareButton, whatsappButton, downloadButton].forEach((button) => { if (button) button.disabled = true; });
        if (dialog.showModal && !dialog.open) dialog.showModal(); else dialog.setAttribute('open', '');
        if (retryButton) retryButton.hidden = true;
        escapeStatus('جارٍ تجهيز بطاقة العضوية...');
        try {
            const memberResponse = await window.topGymApi.get(`/api/members/${encodeURIComponent(memberId)}`);
            const member = memberResponse.member || memberResponse;
            const qrResponse = await window.topGymApi.get(`/api/attendance/qr/${encodeURIComponent(memberId)}`);
            busy = false;
            await openCard(member, qrResponse.qrToken, context);
        } catch (error) {
            currentCard = null;
            escapeStatus(error.message || 'تعذر تجهيز بطاقة العضوية.');
            if (retryButton) retryButton.hidden = false;
            window.showToast?.(error.message || 'تعذر تحميل بطاقة العضوية.', true, 'error');
        } finally { busy = false; }
    }
    function canvasBlob() {
        return new Promise((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('تعذر تصدير صورة البطاقة.')), 'image/png'));
    }
    async function downloadCard() {
        if (!currentCard) return;
        const blob = await canvasBlob();
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = 'membership-card.png';
        link.click();
        window.setTimeout(() => URL.revokeObjectURL(url), 30000);
    }
    async function runCardAction(action) {
        if (!currentCard || busy) return;
        busy = true;
        [shareButton, whatsappButton, downloadButton].forEach((button) => { if (button) button.disabled = true; });
        try { await action(); }
        catch (error) { escapeStatus(error.message || 'تعذر تجهيز البطاقة.'); }
        finally {
            busy = false;
            [shareButton, whatsappButton, downloadButton].forEach((button) => { if (button) button.disabled = !currentCard; });
        }
    }
    function messageForCard(card) {
        const membership = card.membership || {};
        const lines = [
            `أهلاً ${card.member.fullName || 'بك'}`,
            '',
            card.context === 'created' ? `تم تجهيز عضويتك في ${card.gymName} بنجاح.` : `بطاقة عضويتك في ${card.gymName} جاهزة.`,
            '',
            'بيانات العضوية:',
            card.member.fullName ? `الاسم: ${card.member.fullName}` : '',
            membership.plan ? `الباقة: ${membershipPlanLabel(membership.plan)}` : '',
            membership.type ? `نوع الاشتراك: ${membershipTypeLabel(membership.typeLabel || membership.type)}` : '',
            dateText(membership.startDate) ? `تاريخ البداية: ${dateText(membership.startDate)}` : '',
            dateText(membership.effectiveEndDate || membership.endDate) ? `تاريخ الانتهاء: ${dateText(membership.effectiveEndDate || membership.endDate)}` : '',
            `حالة الاشتراك: ${membershipStatus(membership)}`,
            '',
            `بطاقة عضويتك في ${card.gymName} جاهزة. احتفظ بالصورة واستخدم رمز QR عند تسجيل الحضور والانصراف.`,
            'رمز QR خاص بعضويتك؛ يُرجى عدم مشاركته مع أي شخص آخر.',
            '',
            card.gymName
        ];
        return lines.filter((line, index) => line !== '' || (index && lines[index - 1] !== '')).join('\n').trim();
    }
    async function shareCard() {
        if (!currentCard) return;
        const file = new File([await canvasBlob()], 'membership-card.png', { type: 'image/png' });
        const text = messageForCard(currentCard);
        if (navigator.canShare?.({ files: [file] }) && navigator.share) {
            try {
                await navigator.share({ files: [file], title: `بطاقة ${currentCard.gymName}`, text });
                escapeStatus('تم فتح قائمة المشاركة؛ أكمل الإرسال يدويًا عبر التطبيق الذي تختاره.');
                return;
            } catch (error) {
                if (error?.name === 'AbortError') return;
            }
        }
        await downloadCard();
        escapeStatus('تم تحميل البطاقة. أرفق الصورة في واتساب بعد فتح المحادثة.');
    }
    async function handoffWhatsapp() {
        if (!currentCard) return;
        const whatsapp = window.topGymWhatsapp;
        if (!whatsapp) { escapeStatus('تعذر تحميل وسيلة واتساب الحالية. يمكنك تحميل البطاقة ومشاركتها يدويًا.'); return; }
        const phone = whatsapp?.normalizePhone?.(currentCard.member.phone, currentCard.member.phoneCountry);
        if (!phone) {
            escapeStatus('لا يوجد رقم واتساب صالح مسجل لهذا العضو.');
            if (editPhoneButton && (window.topGymAuth?.isOwner?.() === true || window.topGymAuth?.hasPermission?.('members.update') === true)) editPhoneButton.hidden = false;
            return;
        }
        const preparedWindow = whatsapp.prepareWindow(currentCard.member.phone, currentCard.member.phoneCountry);
        try {
            await downloadCard();
            const opened = whatsapp.openMessage(phone, messageForCard(currentCard), preparedWindow);
            if (!opened) throw new Error('تعذر فتح واتساب. تم تحميل البطاقة ويمكن مشاركتها يدويًا.');
            escapeStatus('تم تحميل البطاقة وفتح واتساب برسالة جاهزة. أرفق الصورة وأرسلها يدويًا.');
        } catch (error) {
            whatsapp.closeWindow(preparedWindow);
            escapeStatus(error.message || 'تعذر تجهيز المشاركة عبر واتساب.');
        }
    }

    async function retryCardPreparation() {
        if (!lastOpenRequest?.memberId || busy) return;
        return openFromMemberId(lastOpenRequest.memberId, lastOpenRequest.context);
    }

    closeButton?.addEventListener('click', () => dialog.close?.());
    dialog.addEventListener('close', () => {
        currentCard = null;
        ctx.clearRect(0, 0, CARD_WIDTH, CARD_HEIGHT);
        [shareButton, whatsappButton, downloadButton].forEach((button) => { if (button) button.disabled = true; });
    });
    downloadButton?.addEventListener('click', () => { void runCardAction(downloadCard); });
    shareButton?.addEventListener('click', () => { void runCardAction(shareCard); });
    whatsappButton?.addEventListener('click', () => { void runCardAction(handoffWhatsapp); });
    editPhoneButton?.addEventListener('click', () => {
        if (!currentCard?.member?.id) return;
        const edit = document.querySelector(`#membersList [data-member-id="${CSS.escape(String(currentCard.member.id))}"] button[data-action="edit"]`);
        if (!edit) { escapeStatus('تعذر فتح تعديل الهاتف من هذه الشاشة. أغلق البطاقة وافتح تعديل بيانات العضو.'); return; }
        dialog.close?.();
        window.requestAnimationFrame(() => edit.click());
    });
    retryButton?.addEventListener('click', () => { void retryCardPreparation(); });
    window.addEventListener('topgym:member-created', (event) => {
        const detail = event.detail || {};
        if (!detail.isNew || !detail.member?.id || !canUseCard()) return;
        void openFromMemberId(detail.member.id, 'created');
    });
    window.topGymMemberDigitalCard = Object.freeze({ openFromMemberId, download: downloadCard, openCard });
})();
