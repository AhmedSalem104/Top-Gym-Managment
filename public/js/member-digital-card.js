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
    const CARD_COLORS = Object.freeze({
        background: '#f5f7fb',
        surface: '#ffffff',
        surfaceMuted: '#f8fbff',
        border: '#d9e2ef',
        borderSubtle: '#e7edf5',
        primary: '#1769e8',
        primarySoft: '#eaf1ff',
        text: '#172033',
        textSecondary: '#41516a',
        textMuted: '#718096'
    });
    const drawText = (text, x, y, size, color, weight = 500, align = 'right', maxWidth = 840) => {
        if (!text) return;
        ctx.fillStyle = color;
        ctx.font = `${weight} ${size}px Cairo, Tahoma, sans-serif`;
        ctx.textAlign = align;
        ctx.textBaseline = 'middle';
        ctx.direction = 'rtl';
        ctx.fillText(String(text), x, y, maxWidth);
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
        ctx.fillStyle = CARD_COLORS.background;
        ctx.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT);
        roundedRect(42, 42, 996, 1266, 34, CARD_COLORS.surface, CARD_COLORS.border);
        roundedRect(42, 42, 996, 18, 9, CARD_COLORS.primary);

        // Keep tenant identity and logo in separate, predictable zones. Long
        // gym names are constrained before the logo tile rather than drawn
        // underneath it.
        roundedRect(92, 88, 176, 142, 24, CARD_COLORS.surfaceMuted, CARD_COLORS.borderSubtle);
        if (logo) {
            const ratio = Math.min(140 / logo.width, 106 / logo.height);
            const width = logo.width * ratio;
            const height = logo.height * ratio;
            ctx.drawImage(logo, 110 + (140 - width) / 2, 106 + (106 - height) / 2, width, height);
        } else {
            roundedRect(110, 106, 140, 106, 20, CARD_COLORS.primarySoft);
            drawText(initials(gymName), 180, 159, 36, CARD_COLORS.primary, 800, 'center');
        }
        drawText(gymName, 970, 126, 46, CARD_COLORS.text, 800, 'right', 640);
        drawText('بطاقة العضوية الرقمية', 970, 180, 24, CARD_COLORS.textMuted, 600, 'right', 640);
        ctx.strokeStyle = CARD_COLORS.borderSubtle;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(92, 254);
        ctx.lineTo(988, 254);
        ctx.stroke();

        roundedRect(92, 282, 896, 178, 28, CARD_COLORS.surfaceMuted, CARD_COLORS.borderSubtle);
        roundedRect(818, 296, 146, 146, 73, CARD_COLORS.primarySoft);
        drawText(initials(member.fullName), 891, 369, 52, CARD_COLORS.primary, 800, 'center');
        drawText(member.fullName || '', 780, 342, 43, CARD_COLORS.text, 800, 'right', 660);
        const statusColors = statusAppearance(membership);
        roundedRect(592, 390, 188, 44, 22, statusColors.background);
        drawText(membershipStatus(membership), 686, 412, 21, statusColors.foreground, 700, 'center');

        const fields = [
            ['الباقة', membershipPlanLabel(membership?.plan)],
            ['نوع الاشتراك', membershipTypeLabel(membership?.typeLabel || membership?.type)],
            ['تاريخ البداية', dateText(membership?.startDate)],
            ['تاريخ الانتهاء', dateText(membership?.effectiveEndDate || membership?.endDate)]
        ].filter(([, value]) => String(value || '').trim());
        const gridTop = 500;
        const tileHeight = 112;
        const rowGap = 20;
        fields.forEach(([label, value], index) => {
            const column = index % 2;
            const row = Math.floor(index / 2);
            const x = column === 0 ? 548 : 92;
            const top = gridTop + row * (tileHeight + rowGap);
            roundedRect(x, top, 440, tileHeight, 20, CARD_COLORS.surfaceMuted, CARD_COLORS.borderSubtle);
            drawText(label, x + 408, top + 34, 20, CARD_COLORS.textMuted, 500, 'right', 390);
            drawText(value, x + 408, top + 76, 28, CARD_COLORS.text, 700, 'right', 390);
        });
        if (qrCanvas) {
            const qrSize = 350;
            const qrX = (CARD_WIDTH - qrSize) / 2;
            const rowCount = Math.ceil(fields.length / 2);
            const qrY = Math.max(574, Math.min(790, gridTop + rowCount * (tileHeight + rowGap) + 24));
            roundedRect(qrX - 24, qrY - 24, qrSize + 48, qrSize + 48, 26, CARD_COLORS.surface, CARD_COLORS.border);
            ctx.imageSmoothingEnabled = false;
            ctx.drawImage(qrCanvas, qrX, qrY, qrSize, qrSize);
            ctx.imageSmoothingEnabled = true;
            drawText('اعرض الرمز لموظف الاستقبال لتسجيل الحضور أو الانصراف', CARD_WIDTH / 2, qrY + qrSize + 64, 22, CARD_COLORS.textSecondary, 600, 'center', 880);
        } else {
            drawText('لا يوجد رمز عضوية نشط لهذه البطاقة', CARD_WIDTH / 2, 1080, 24, CARD_COLORS.textMuted, 600, 'center');
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
    window.addEventListener('topgym:membership-renewed', (event) => {
        const memberId = event.detail?.memberId;
        if (memberId == null || !canUseCard()) return;
        void openFromMemberId(memberId, 'renewed');
    });
    window.topGymMemberDigitalCard = Object.freeze({ openFromMemberId, download: downloadCard, openCard });
})();
