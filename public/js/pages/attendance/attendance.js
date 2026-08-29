(() => {
    if (window.__topGymAttendanceLoaded) return;
    window.__topGymAttendanceLoaded = true;

    const $ = (id) => document.getElementById(id);
    const can = (permission) => window.topGymAuth?.isOwner?.() === true
        || window.topGymAuth?.hasPermission?.(permission) === true;
    const canReadMember = () => can('members.read') && can('memberships.read');
    const SOURCE_LABELS = { phone: 'بالهاتف', qr: 'QR Code', manual: 'يدوي', auto: 'تلقائي' };
    let scanner = null;
    let scannerRunning = false;
    let currentQrMember = null;
    let kioskMode = false;
    let attendanceAbortController = null;
    let memberPreviewAbortController = null;
    let memberPreviewTimer = null;
    let previewMember = null;
    let attendanceSnapshot = null;
    let initialized = false;

    function escapeHtml(value) {
        return String(value ?? '').replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));
    }

    function dateText(value) {
        if (!value) return '—';
        const date = new Date(`${String(value).slice(0, 10)}T00:00:00`);
        return Number.isNaN(date.getTime()) ? String(value) : new Intl.DateTimeFormat('ar-EG', { dateStyle: 'medium' }).format(date);
    }

    function timeText(value) {
        if (!value) return '—';
        const date = new Date(value);
        return Number.isNaN(date.getTime()) ? String(value) : new Intl.DateTimeFormat('ar-EG', { timeStyle: 'short' }).format(date);
    }

    const STATUS_LABELS = { active: 'نشطة', expiring_soon: 'قريبة الانتهاء', expired: 'منتهية', frozen: 'مجمدة' };
    const PLAN_LABELS = { gym_only: 'جيم فقط', gym_cardio: 'جيم وكارديو' };
    const TYPE_LABELS = { monthly: 'شهرية', half_month: 'نصف شهر', quarterly: 'ربع سنوية', semiannual: 'نصف سنوية', annual: 'سنوية' };

    function qrMemberId(value) {
        const token = String(value ?? '').trim();
        const direct = token.match(/TOPGYM-MEMBER:(\d+)/i) || token.match(/TOPGYM\|MEMBER\|(\d+)/i);
        if (direct) return Number(direct[1]);
        try {
            const url = new URL(token, window.location.origin);
            const pathMatch = url.pathname.match(/\/qr\/(\d+)/i);
            if (pathMatch) return Number(pathMatch[1]);
            const queryId = Number(url.searchParams.get('memberId') || url.searchParams.get('member'));
            if (Number.isInteger(queryId) && queryId > 0) return queryId;
        } catch (_) {
            /* QR may contain JSON or the legacy readable text. */
        }
        try {
            const payload = JSON.parse(token);
            const id = Number(payload?.memberId || payload?.member_id || payload?.id);
            return Number.isInteger(id) && id > 0 ? id : null;
        } catch (_) {
            return null;
        }
    }

    function qrStatusClass(status) {
        return ['active', 'expiring_soon', 'expired', 'frozen'].includes(status) ? status : 'unknown';
    }

    function qrPayload(member) {
        return `${window.location.origin}/qr/${encodeURIComponent(Number(member.id))}`;
    }

    function memberInitials(name) {
        const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
        return (parts.slice(0, 2).map((part) => part.charAt(0)).join('') || 'TG').toUpperCase();
    }

    async function showQrMemberPreview(member, action = 'checkin') {
        const membership = member.membership || {};
        const status = String(membership.status || '').toLowerCase();
        const isCheckout = action === 'checkout';
        const eligible = isCheckout || ['active', 'expiring_soon'].includes(status);
        const statusLabel = STATUS_LABELS[status] || 'بدون اشتراك';
        const planLabel = PLAN_LABELS[membership.plan] || membership.plan || '—';
        const typeLabel = TYPE_LABELS[membership.type] || membership.type || '—';
        const operationLabel = isCheckout ? 'تسجيل الانصراف' : eligible ? 'تسجيل الحضور' : 'الحضور غير متاح';
        const operationHint = isCheckout
            ? 'المشترك مسجل داخل الجيم حاليًا'
            : eligible
                ? 'العضوية صالحة لتسجيل الحضور'
                : 'لا يمكن تسجيل الحضور بهذه العضوية';
        if (!window.Swal) return eligible;
        const result = await window.Swal.fire({
            position: 'center',
            icon: isCheckout ? 'success' : eligible ? 'info' : 'warning',
            title: eligible ? `تأكيد ${operationLabel}` : 'بيانات المشترك',
            html: `<div class="qr-member-preview">
                <div class="qr-member-preview-identity">
                    <span class="qr-member-preview-avatar" aria-hidden="true">${escapeHtml(memberInitials(member.fullName))}</span>
                    <div class="qr-member-preview-identity-copy">
                        <strong>${escapeHtml(member.fullName || '—')}</strong>
                        <span dir="ltr">${escapeHtml(member.phone || '—')}</span>
                    </div>
                    <b class="qr-member-preview-status ${qrStatusClass(status)}"><span class="qr-member-preview-status-dot" aria-hidden="true"></span>${escapeHtml(statusLabel)}</b>
                </div>
                <div class="qr-member-preview-context">
                    <span class="qr-member-preview-kicker">QR Code</span>
                    <strong>${escapeHtml(operationLabel)}</strong>
                    <small>${escapeHtml(operationHint)}</small>
                </div>
                <div class="qr-member-preview-grid">
                    <div class="qr-member-preview-field"><span>الباقة</span><strong>${escapeHtml(planLabel)}</strong></div>
                    <div class="qr-member-preview-field"><span>النوع</span><strong>${escapeHtml(typeLabel)}</strong></div>
                    <div class="qr-member-preview-field"><span>تاريخ البداية</span><strong>${escapeHtml(dateText(membership.startDate))}</strong></div>
                    <div class="qr-member-preview-field"><span>تاريخ الانتهاء</span><strong>${escapeHtml(dateText(membership.effectiveEndDate || membership.endDate))}</strong></div>
                    ${Number(membership.amountRemaining || 0) > 0 ? `<div class="qr-member-preview-field qr-member-preview-balance"><span>المتبقي</span><strong>${Number(membership.amountRemaining).toLocaleString('ar-EG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ج.م</strong></div>` : ''}
                </div>
            </div>`,
            showCancelButton: eligible,
            confirmButtonText: eligible ? (isCheckout ? 'تسجيل الانصراف' : 'تسجيل الحضور') : 'إغلاق',
            cancelButtonText: 'إلغاء',
            buttonsStyling: false,
            customClass: {
                popup: `top-gym-alert qr-member-preview-alert qr-member-preview-alert-${isCheckout ? 'checkout' : eligible ? 'checkin' : 'blocked'}`,
                confirmButton: 'qr-member-preview-confirm',
                cancelButton: 'qr-member-preview-cancel'
            }
        });
        return eligible && result.isConfirmed;
    }

    function showMessage(title, icon = 'success', text = '') {
        if (window.Swal) {
            return window.Swal.fire({
                position: 'center',
                icon,
                title,
                text,
                confirmButtonText: 'حسنًا',
                buttonsStyling: false,
                customClass: { popup: 'top-gym-alert', confirmButton: 'duplicate-phone-alert-confirm' }
            });
        }
        window.alert(text ? `${title}\n${text}` : title);
        return Promise.resolve();
    }

    function attendanceFeedback(kind = 'success') {
        try { navigator.vibrate?.(kind === 'error' ? [80, 40, 80] : [35, 25, 55]); } catch (_) { /* vibration is optional */ }
        try {
            const AudioContext = window.AudioContext || window.webkitAudioContext;
            if (!AudioContext) return;
            const context = new AudioContext();
            const oscillator = context.createOscillator();
            const gain = context.createGain();
            oscillator.type = 'sine';
            oscillator.frequency.value = kind === 'error' ? 220 : 660;
            gain.gain.setValueAtTime(0.0001, context.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.08, context.currentTime + 0.01);
            gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.16);
            oscillator.connect(gain).connect(context.destination);
            oscillator.start();
            oscillator.stop(context.currentTime + 0.18);
            oscillator.addEventListener('ended', () => context.close());
        } catch (_) { /* audio feedback is optional */ }
    }

    function toggleKiosk() {
        kioskMode = !kioskMode;
        document.body.classList.toggle('attendance-kiosk-mode', kioskMode);
        const button = $('attendanceKioskButton');
        if (button) button.textContent = kioskMode ? 'إنهاء Kiosk' : 'وضع Kiosk';
        if (kioskMode) document.documentElement.requestFullscreen?.().catch(() => {});
        else if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
    }

    async function request(path, options = {}) {
        const response = await fetch(path, { ...options, headers: { 'Content-Type': 'application/json', ...(options.headers || {}) } });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
            const error = new Error(data.error || 'تعذر تنفيذ عملية الحضور.');
            Object.assign(error, data);
            throw error;
        }
        return data;
    }

    function announceAttendanceUpdate() {
        window.dispatchEvent(new CustomEvent('topgym:attendance-updated'));
    }

    function normalizePhone(value) {
        return String(value ?? '').replace(/[^0-9]/g, '');
    }

    function membershipStatus(member) {
        return String(member?.membership?.status || '').toLowerCase();
    }

    function attendanceMemberState(member) {
        const attendance = member?.attendance || {};
        const status = membershipStatus(member);
        return {
            status,
            eligible: ['active', 'expiring_soon'].includes(status),
            inside: Boolean(attendance.checkInAt && !attendance.checkOutAt),
            checkedOut: Boolean(attendance.checkOutAt)
        };
    }

    function resetAttendanceActionButtons() {
        const checkInButton = $('attendanceCheckInButton');
        const checkOutButton = $('attendanceCheckOutButton');
        if (!checkInButton || !checkOutButton) return;
        checkInButton.disabled = !can('attendance.check_in');
        checkOutButton.disabled = !can('attendance.check_out');
        checkInButton.textContent = 'تسجيل حضور';
        checkOutButton.textContent = 'تسجيل انصراف';
        checkInButton.classList.remove('is-suggested');
        checkOutButton.classList.remove('is-suggested');
        delete checkInButton.dataset.suggested;
        delete checkOutButton.dataset.suggested;
    }

    function updateAttendanceActionButtons(member = null) {
        if (!member) {
            resetAttendanceActionButtons();
            return;
        }
        const state = attendanceMemberState(member);
        const checkInButton = $('attendanceCheckInButton');
        const checkOutButton = $('attendanceCheckOutButton');
        if (!checkInButton || !checkOutButton) return;
        const canCheckIn = can('attendance.check_in') && state.eligible && !state.inside && !state.checkedOut;
        checkInButton.disabled = !can('attendance.check_in') || state.inside || state.checkedOut || !state.eligible;
        checkOutButton.disabled = !can('attendance.check_out') || !state.inside;
        checkInButton.textContent = canCheckIn ? 'تسجيل حضور' : state.inside ? 'الحضور مسجل' : 'الحضور غير متاح';
        checkOutButton.textContent = state.inside ? 'تسجيل انصراف' : 'لا يوجد انصراف مطلوب';
        checkInButton.classList.toggle('is-suggested', canCheckIn);
        checkOutButton.classList.toggle('is-suggested', state.inside);
        checkInButton.dataset.suggested = canCheckIn ? 'true' : 'false';
        checkOutButton.dataset.suggested = state.inside ? 'true' : 'false';
    }

    function renderMemberPreviewMessage(message, kind = 'neutral') {
        const preview = $('attendanceMemberPreview');
        if (!preview) return;
        preview.hidden = false;
        preview.className = `attendance-member-preview ${kind}`;
        preview.innerHTML = `<span class="attendance-preview-state-icon" aria-hidden="true">${kind === 'error' ? '!' : 'i'}</span><span>${escapeHtml(message)}</span>`;
    }

    function clearMemberPreview() {
        memberPreviewAbortController?.abort();
        previewMember = null;
        const preview = $('attendanceMemberPreview');
        if (preview) {
            preview.hidden = true;
            preview.className = 'attendance-member-preview';
            preview.innerHTML = '';
        }
        updateAttendanceActionButtons();
    }

    function renderMemberPreview(member) {
        const preview = $('attendanceMemberPreview');
        if (!preview) return;
        const state = attendanceMemberState(member);
        const membership = member.membership || {};
        const statusLabel = STATUS_LABELS[state.status] || 'بدون اشتراك فعال';
        const planLabel = PLAN_LABELS[membership.plan] || membership.plan || '—';
        const actionText = state.inside
            ? 'الإجراء المقترح: تسجيل انصراف'
            : state.eligible && !state.checkedOut
                ? 'الإجراء المقترح: تسجيل حضور'
                : 'لا يمكن تسجيل حضور بهذه العضوية الآن';
        const initials = String(member.fullName || 'TG').trim().split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part.charAt(0)).join('') || 'TG';
        preview.hidden = false;
        preview.className = `attendance-member-preview ${state.inside ? 'inside' : state.eligible ? 'eligible' : 'blocked'}`;
        preview.innerHTML = `<div class="attendance-preview-member"><span class="attendance-preview-avatar" aria-hidden="true">${escapeHtml(initials)}</span><div><strong>${escapeHtml(member.fullName || '—')}</strong><span dir="ltr">${escapeHtml(member.phone || '—')}</span></div></div><div class="attendance-preview-details"><span><small>الباقة</small><b>${escapeHtml(planLabel)}</b></span><span><small>الحالة</small><b class="attendance-preview-status ${escapeHtml(state.status || 'unknown')}">${escapeHtml(statusLabel)}</b></span><span><small>الانتهاء</small><b dir="ltr">${escapeHtml(dateText(membership.effectiveEndDate || membership.endDate))}</b></span></div><strong class="attendance-preview-action">${escapeHtml(actionText)}</strong>`;
        updateAttendanceActionButtons(member);
    }

    async function lookupMemberPreview() {
        const phone = $('attendancePhone')?.value.trim() || '';
        const digits = normalizePhone(phone);
        if (digits.length < 5) {
            clearMemberPreview();
            return;
        }
        memberPreviewAbortController?.abort();
        memberPreviewAbortController = new AbortController();
        const controller = memberPreviewAbortController;
        renderMemberPreviewMessage('جاري البحث عن بيانات المشترك…', 'loading');
        try {
            const params = new URLSearchParams({ search: phone, page: '1', pageSize: '5', sort: 'expiry' });
            const response = await request(`/api/members?${params}`, { signal: controller.signal });
            if (controller.signal.aborted) return;
            const candidates = response.members || [];
            const exact = candidates.find((member) => normalizePhone(member.phone) === digits);
            const member = exact || (candidates.length === 1 ? candidates[0] : null);
            if (!member) {
                previewMember = null;
                renderMemberPreviewMessage('لم يتم العثور على مشترك بهذا الرقم.', 'error');
                updateAttendanceActionButtons();
                return;
            }
            previewMember = member;
            renderMemberPreview(member);
        } catch (error) {
            if (error.name === 'AbortError') return;
            previewMember = null;
            renderMemberPreviewMessage('تعذر تحميل بيانات المشترك. جرّب مرة أخرى.', 'error');
            updateAttendanceActionButtons();
        }
    }

    function setAttendanceMode(mode = 'phone') {
        document.querySelectorAll('[data-attendance-mode]').forEach((button) => {
            const active = button.dataset.attendanceMode === mode;
            button.classList.toggle('active', active);
            button.setAttribute('aria-selected', active ? 'true' : 'false');
        });
        const phonePanel = $('attendancePhoneModePanel');
        if (phonePanel) phonePanel.hidden = mode === 'qr';
        if (mode === 'phone') $('attendancePhone')?.focus();
    }

    function renderRecords(data) {
        attendanceSnapshot = data;
        const allRecords = data.records || [];
        const filter = $('attendanceStatusFilter')?.value || 'all';
        const records = filter === 'inside'
            ? allRecords.filter((record) => !record.checkOutAt)
            : filter === 'checked_out'
                ? allRecords.filter((record) => Boolean(record.checkOutAt))
                : allRecords;
        $('attendanceDateLabel').textContent = dateText(data.date);
        $('attendancePresentCount').textContent = Number(data.summary?.present || 0).toLocaleString('ar-EG');
        $('attendanceCheckedInCount').textContent = Number(data.summary?.checkedIn || 0).toLocaleString('ar-EG');
        $('attendanceCheckedOutCount').textContent = Number(data.summary?.checkedOut || 0).toLocaleString('ar-EG');
        $('attendanceListMeta').textContent = filter === 'all'
            ? `${records.length.toLocaleString('ar-EG')} سجل حضور في ${dateText(data.date)}`
            : `${records.length.toLocaleString('ar-EG')} من ${allRecords.length.toLocaleString('ar-EG')} سجل في ${dateText(data.date)}`;
        if (!records.length) {
            $('attendanceTableWrap').innerHTML = `<div class="attendance-empty">${allRecords.length ? 'لا توجد سجلات مطابقة للفلاتر الحالية.' : 'لا توجد سجلات حضور اليوم حتى الآن.'}</div>`;
            return;
        }
        $('attendanceTableWrap').innerHTML = `<table class="attendance-table"><thead><tr><th>المشترك</th><th>الباقة</th><th>الحضور</th><th>الانصراف</th><th>المدة</th><th>طريقة التسجيل</th><th>الحالة</th><th>الإجراء</th></tr></thead><tbody>${records.map((record) => {
            const planLabel = PLAN_LABELS[record.plan] || record.plan || '—';
            const typeLabel = TYPE_LABELS[record.type] || record.type || '';
            return `<tr><td><span class="attendance-member-name">${escapeHtml(record.memberName)}</span><span class="attendance-member-phone" dir="ltr">${escapeHtml(record.phone)}</span></td><td>${escapeHtml(planLabel)}<span class="table-sub">${escapeHtml(typeLabel)}</span></td><td><span class="attendance-time">${timeText(record.checkInAt)}</span></td><td><span class="attendance-time">${timeText(record.checkOutAt)}</span></td><td>${record.durationMinutes === null ? 'داخل الجيم' : `${record.durationMinutes} دقيقة`}</td><td><span class="attendance-source ${escapeHtml(record.checkInSource)}">${escapeHtml(SOURCE_LABELS[record.checkInSource] || record.checkInSource)}</span></td><td><span class="attendance-status${record.checkOutAt ? ' complete' : ''}">${record.checkOutAt ? (record.checkOutSource === 'auto' ? 'انصرف تلقائيًا' : 'انصرف') : 'داخل الجيم'}</span></td><td></td></tr>`;
        }).join('')}</tbody></table>`;
    }

    function decorateAttendanceActions(records) {
        const table = $('attendanceTableWrap')?.querySelector('table');
        if (!table?.tHead || !table.tBodies[0]) return;
        Array.from(table.tBodies[0].rows).forEach((row, index) => {
            const record = records[index];
            const cell = document.createElement('td');
            cell.className = 'attendance-row-actions';
            if (record?.checkOutAt) {
                const status = document.createElement('span');
                status.className = `attendance-action-done${record.checkOutSource === 'auto' ? ' auto' : ''}`;
                status.textContent = record.checkOutSource === 'auto' ? 'انصراف تلقائي' : 'تم الانصراف';
                cell.append(status);
            } else {
                const button = document.createElement('button');
                button.type = 'button';
                button.className = 'btn btn-small attendance-checkout-button';
                button.dataset.attendanceCheckout = 'true';
                button.dataset.requiredPermission = 'attendance.check_out';
                button.dataset.phone = record?.phone || '';
                button.textContent = 'تسجيل انصراف';
                cell.append(button);
            }
            const existingCell = row.lastElementChild;
            if (existingCell) existingCell.replaceWith(cell);
            else row.append(cell);
        });
    }

    async function loadAttendance() {
        const search = $('attendanceSearch')?.value.trim() || '';
        attendanceAbortController?.abort();
        attendanceAbortController = new AbortController();
        const controller = attendanceAbortController;
        $('attendanceTableWrap').innerHTML = '<div class="loading">جاري تحديث سجل الحضور…</div>';
        try {
            const data = await request(`/api/attendance?${new URLSearchParams({ search })}`, { signal: controller.signal });
            renderRecords(data);
            decorateAttendanceActions((data.records || []).filter((record) => {
                const filter = $('attendanceStatusFilter')?.value || 'all';
                return filter === 'inside' ? !record.checkOutAt : filter === 'checked_out' ? Boolean(record.checkOutAt) : true;
            }));
            if (Number(data.autoClosed || 0) > 0) announceAttendanceUpdate();
        } catch (error) {
            if (error.name === 'AbortError') return;
            $('attendanceTableWrap').innerHTML = `<div class="attendance-empty">${escapeHtml(error.message)}</div>`;
        }
    }

    function currentInput() {
        const phone = $('attendancePhone')?.value.trim();
        if (!phone) {
            showMessage('أدخل رقم الهاتف أو امسح QR Code أولاً.', 'warning');
            return null;
        }
        return { phone };
    }

    async function checkIn(payload = null) {
        if (!can('attendance.check_in')) {
            await showMessage('لا تملك صلاحية تسجيل الحضور.', 'error');
            return;
        }
        const body = payload || currentInput();
        if (!body) return;
        try {
            const result = await request('/api/attendance/check-in', { method: 'POST', body: JSON.stringify(body) });
            $('attendancePhone').value = '';
            clearMemberPreview();
            await showMessage('تم تسجيل الحضور بنجاح ✅', 'success', result.message);
            attendanceFeedback('success');
            await loadAttendance();
            announceAttendanceUpdate();
        } catch (error) {
            attendanceFeedback('error');
            await showMessage(error.message, error.code?.startsWith('ATTENDANCE_') ? 'warning' : 'error');
            if (error.attendance) await loadAttendance();
        }
    }

    async function checkOut(payload = null) {
        if (!can('attendance.check_out')) {
            await showMessage('لا تملك صلاحية تسجيل الانصراف.', 'error');
            return;
        }
        const body = payload || currentInput();
        if (!body) return;
        try {
            const result = await request('/api/attendance/check-out', { method: 'POST', body: JSON.stringify(body) });
            $('attendancePhone').value = '';
            clearMemberPreview();
            await showMessage('تم تسجيل الانصراف بنجاح ✅', 'success', result.message);
            attendanceFeedback('success');
            await loadAttendance();
            announceAttendanceUpdate();
        } catch (error) {
            attendanceFeedback('error');
            await showMessage(error.message, error.code?.startsWith('ATTENDANCE_') ? 'warning' : 'error');
        }
    }

    async function stopScanner() {
        if (!scanner) return;
        try { if (scannerRunning) await scanner.stop(); } catch (_) { /* camera may already be closed */ }
        try { scanner.clear(); } catch (_) { /* keep the dialog usable */ }
        scanner = null;
        scannerRunning = false;
    }

    async function closeScanner() {
        await stopScanner();
        const dialog = $('qrReaderDialog');
        if (dialog?.close && dialog.open) dialog.close(); else dialog?.removeAttribute('open');
        setAttendanceMode('phone');
    }

    async function handleQrScan(decodedText) {
        const memberId = qrMemberId(decodedText);
        if (!memberId) {
            await checkIn({ qrToken: decodedText });
            return;
        }
        if (!canReadMember()) {
            await checkIn({ qrToken: decodedText });
            return;
        }
        try {
            const response = await request(`/api/members/${encodeURIComponent(memberId)}`);
            const member = response.member || response;
            let action = 'checkin';
            try {
                const attendance = await request(`/api/attendance?${new URLSearchParams({ search: member.phone || '' })}`);
                const record = (attendance.records || []).find((item) => String(item.memberId) === String(member.id));
                if (record?.checkOutAt) {
                    await showMessage('تم تسجيل انصراف هذا المشترك اليوم بالفعل.', 'info');
                    return;
                }
                if (record && !record.checkOutAt) action = 'checkout';
            } catch (_) {
                /* Keep QR check-in available if the read-only preview lookup fails. */
            }
            if (await showQrMemberPreview(member, action)) {
                if (action === 'checkout') await checkOut({ qrToken: decodedText });
                else await checkIn({ qrToken: decodedText });
            }
        } catch (error) {
            await showMessage(error.message, 'error');
        }
    }

    async function openScanner() {
        try { await window.topGymLoadExternalAsset?.('html5-qrcode'); } catch (_) { /* keep the existing user-facing fallback */ }
        if (!window.Html5Qrcode) {
            await showMessage('أداة مسح QR Code غير متاحة حالياً. استخدم رقم الهاتف.', 'warning');
            return;
        }
        const dialog = $('qrReaderDialog');
        if (dialog?.showModal) dialog.showModal(); else dialog?.setAttribute('open', '');
        await stopScanner();
        scanner = new window.Html5Qrcode('qrReader');
        try {
            await scanner.start({ facingMode: 'environment' }, { fps: 10, qrbox: { width: 230, height: 230 } }, async (decodedText) => {
                await closeScanner();
                await handleQrScan(decodedText);
            }, () => {});
            scannerRunning = true;
        } catch (error) {
            await closeScanner();
            await showMessage('تعذر تشغيل الكاميرا. تأكد من السماح بالوصول للكاميرا أو استخدم رقم الهاتف.', 'warning', error.message);
        }
    }

    async function openMemberQr(memberId) {
        if (!canReadMember()) {
            await showMessage('لا تملك صلاحية عرض بيانات المشترك أو رمز QR.', 'error');
            return;
        }
        try {
            const qrLibrary = window.topGymLoadExternalAsset?.('qrcode');
            const response = await request(`/api/members/${encodeURIComponent(memberId)}`);
            const member = response.member || response;
            currentQrMember = member;
            try { await qrLibrary; } catch (_) { /* use the same validation below */ }
            $('memberQrName').textContent = member.fullName || '—';
            $('memberQrPhone').textContent = member.phone || '—';
            const canvas = $('memberQrCanvas');
            if (!window.QRCode || !canvas) throw new Error('أداة إنشاء QR Code غير متاحة حالياً.');
            const styles = getComputedStyle(document.documentElement);
            const qrInk = styles.getPropertyValue('--qr-ink').trim();
            const qrPaper = styles.getPropertyValue('--qr-paper').trim();
            await window.QRCode.toCanvas(canvas, qrPayload(member), { width: 210, margin: 1, color: { dark: qrInk, light: qrPaper } });
            const dialog = $('memberQrDialog');
            if (dialog?.showModal) dialog.showModal(); else dialog?.setAttribute('open', '');
        } catch (error) {
            await showMessage(error.message, 'error');
        }
    }

    function closeMemberQr() {
        const dialog = $('memberQrDialog');
        if (dialog?.close && dialog.open) dialog.close(); else dialog?.removeAttribute('open');
    }

    function downloadMemberQr() {
        const canvas = $('memberQrCanvas');
        if (!canvas || !currentQrMember) return;
        const link = document.createElement('a');
        link.download = `TOP-GYM-QR-${currentQrMember.id}.png`;
        link.href = canvas.toDataURL('image/png');
        link.click();
    }

    function isAttendanceActive() {
        return !$('attendanceSection')?.hidden;
    }

    function initializeAttendance() {
        if (initialized) return;
        initialized = true;
        $('attendanceCheckInButton')?.addEventListener('click', () => checkIn());
        $('attendanceCheckOutButton')?.addEventListener('click', checkOut);
        $('attendanceRefreshButton')?.addEventListener('click', loadAttendance);
        $('attendanceTableWrap')?.addEventListener('click', (event) => {
            const button = event.target.closest('button[data-attendance-checkout="true"]');
            if (!button || button.disabled || !button.dataset.phone) return;
            button.disabled = true;
            checkOut({ phone: button.dataset.phone }).finally(() => {
                if (button.isConnected) button.disabled = false;
            });
        });
        $('attendancePhoneModeButton')?.addEventListener('click', () => setAttendanceMode('phone'));
        $('attendanceScanButton')?.addEventListener('click', () => { setAttendanceMode('qr'); openScanner(); });
        $('attendanceKioskButton')?.addEventListener('click', toggleKiosk);
        $('qrReaderClose')?.addEventListener('click', closeScanner);
        $('memberQrClose')?.addEventListener('click', closeMemberQr);
        $('memberQrDownload')?.addEventListener('click', downloadMemberQr);
        let timer;
        $('attendanceSearch')?.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(loadAttendance, 350); });
        $('attendanceStatusFilter')?.addEventListener('change', () => {
            if (!attendanceSnapshot) return;
            renderRecords(attendanceSnapshot);
            const records = attendanceSnapshot.records || [];
            const filter = $('attendanceStatusFilter').value;
            decorateAttendanceActions(records.filter((record) => filter === 'inside' ? !record.checkOutAt : filter === 'checked_out' ? Boolean(record.checkOutAt) : true));
        });
        $('attendancePhone')?.addEventListener('input', () => {
            clearTimeout(memberPreviewTimer);
            memberPreviewTimer = window.setTimeout(lookupMemberPreview, 350);
        });
        $('attendancePhone')?.addEventListener('keydown', (event) => {
            if (event.key !== 'Enter') return;
            event.preventDefault();
            const state = previewMember ? attendanceMemberState(previewMember) : null;
            if (state?.inside) checkOut();
            else checkIn();
        });
        $('membersList')?.addEventListener('click', (event) => {
            const button = event.target.closest('button[data-action="qr"], button[data-member-qr]');
            if (!button) return;
            event.preventDefault();
            event.stopPropagation();
            const menu = button.closest('.action-menu');
            const menuPanel = menu?.querySelector('.action-menu-panel');
            if (menuPanel) {
                menuPanel.hidden = true;
                menu.querySelector('[data-menu-toggle]')?.setAttribute('aria-expanded', 'false');
            }
            openMemberQr(button.dataset.id || button.dataset.memberQr || button.closest('[data-member-id]')?.dataset.memberId);
        });
        window.addEventListener('topgym:member-created', (event) => {
            const detail = event.detail || {};
            if (detail.isNew && detail.member?.id) openMemberQr(detail.member.id);
        });
        document.addEventListener('topgym:tab-changed', (event) => { if (event.detail?.name === 'attendance') loadAttendance(); });
        window.setInterval(() => {
            if (document.visibilityState !== 'hidden' && isAttendanceActive()) loadAttendance();
        }, 30000);
        document.addEventListener('keydown', (event) => { if (event.key === 'Escape' && kioskMode) toggleKiosk(); });
        if (isAttendanceActive()) loadAttendance();
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initializeAttendance, { once: true });
    else initializeAttendance();

    window.topGymAttendance = { checkIn, checkOut, loadAttendance, openMemberQr, quickAction: (action, payload) => action === 'checkin' ? checkIn(payload) : checkOut(payload) };
})();
