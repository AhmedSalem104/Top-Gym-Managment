(() => {
    if (window.__topGymAttendanceLoaded) return;
    window.__topGymAttendanceLoaded = true;

    const $ = (id) => document.getElementById(id);
    const SOURCE_LABELS = { phone: 'بالهاتف', qr: 'QR Code', manual: 'يدوي', auto: 'تلقائي' };
    let scanner = null;
    let scannerRunning = false;
    let currentQrMember = null;

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
        const membership = member.membership || {};
        const date = (value) => {
            if (!value) return '—';
            const [year, month, day] = String(value).slice(0, 10).split('-');
            return year && month && day ? `${day}/${month}/${year}` : String(value);
        };
        const status = STATUS_LABELS[membership.status] || membership.status || 'بدون اشتراك';
        const plan = PLAN_LABELS[membership.plan] || membership.plan || '—';
        const type = TYPE_LABELS[membership.type] || membership.type || '—';
        const remaining = Number(membership.amountRemaining || 0);
        return [
            `TOPGYM-MEMBER:${Number(member.id)}`,
            'TOP GYM',
            'بيانات المشترك',
            `الاسم: ${member.fullName || '—'}`,
            `الهاتف: ${member.phone || '—'}`,
            `الباقة: ${plan}`,
            `النوع: ${type}`,
            `تاريخ البداية: ${date(membership.startDate)}`,
            `تاريخ الانتهاء: ${date(membership.effectiveEndDate || membership.endDate)}`,
            `الحالة: ${status}`,
            ...(remaining > 0 ? [`المتبقي: ${remaining.toFixed(2)} ج.م`] : [])
        ].join('\n');
    }

    async function showQrMemberPreview(member) {
        const membership = member.membership || {};
        const status = String(membership.status || '').toLowerCase();
        const eligible = ['active', 'expiring_soon'].includes(status);
        const statusLabel = STATUS_LABELS[status] || 'بدون اشتراك';
        const planLabel = PLAN_LABELS[membership.plan] || membership.plan || '—';
        const typeLabel = TYPE_LABELS[membership.type] || membership.type || '—';
        if (!window.Swal) return eligible;
        const result = await window.Swal.fire({
            position: 'center',
            icon: eligible ? 'info' : 'warning',
            title: 'بيانات المشترك',
            html: `<div class="qr-member-preview">
                <div class="qr-member-preview-head">
                    <div><strong>${escapeHtml(member.fullName || '—')}</strong><span dir="ltr">${escapeHtml(member.phone || '—')}</span></div>
                    <b class="qr-member-preview-status ${qrStatusClass(status)}">${escapeHtml(statusLabel)}</b>
                </div>
                <div class="qr-member-preview-grid">
                    <div><span>الباقة</span><strong>${escapeHtml(planLabel)}</strong></div>
                    <div><span>النوع</span><strong>${escapeHtml(typeLabel)}</strong></div>
                    <div><span>تاريخ البداية</span><strong>${escapeHtml(dateText(membership.startDate))}</strong></div>
                    <div><span>تاريخ الانتهاء</span><strong>${escapeHtml(dateText(membership.effectiveEndDate || membership.endDate))}</strong></div>
                    ${membership.amountRemaining > 0 ? `<div class="qr-member-preview-balance"><span>المتبقي</span><strong>${Number(membership.amountRemaining).toLocaleString('ar-EG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ج.م</strong></div>` : ''}
                </div>
            </div>`,
            showCancelButton: eligible,
            confirmButtonText: eligible ? 'تسجيل الحضور' : 'إغلاق',
            cancelButtonText: 'إلغاء',
            buttonsStyling: false,
            customClass: {
                popup: 'top-gym-alert qr-member-preview-alert',
                confirmButton: 'duplicate-phone-alert-confirm',
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

    function renderRecords(data) {
        const records = data.records || [];
        $('attendanceDateLabel').textContent = dateText(data.date);
        $('attendancePresentCount').textContent = Number(data.summary?.present || 0).toLocaleString('ar-EG');
        $('attendanceCheckedInCount').textContent = Number(data.summary?.checkedIn || 0).toLocaleString('ar-EG');
        $('attendanceCheckedOutCount').textContent = Number(data.summary?.checkedOut || 0).toLocaleString('ar-EG');
        $('attendanceListMeta').textContent = `${records.length.toLocaleString('ar-EG')} سجل حضور في ${dateText(data.date)}`;
        if (!records.length) {
            $('attendanceTableWrap').innerHTML = '<div class="attendance-empty">لا توجد سجلات حضور اليوم حتى الآن.</div>';
            return;
        }
        $('attendanceTableWrap').innerHTML = `<table class="attendance-table"><thead><tr><th>المشترك</th><th>الباقة</th><th>الحضور</th><th>الانصراف</th><th>المدة</th><th>طريقة التسجيل</th><th>الحالة</th></tr></thead><tbody>${records.map((record) => `<tr><td><span class="attendance-member-name">${escapeHtml(record.memberName)}</span><span class="attendance-member-phone">${escapeHtml(record.phone)}</span></td><td>${escapeHtml(record.plan || '—')}<span class="table-sub">${escapeHtml(record.type || '')}</span></td><td><span class="attendance-time">${timeText(record.checkInAt)}</span></td><td><span class="attendance-time">${timeText(record.checkOutAt)}</span></td><td>${record.durationMinutes === null ? 'داخل الجيم' : `${record.durationMinutes} دقيقة`}</td><td><span class="attendance-source ${escapeHtml(record.checkInSource)}">${escapeHtml(SOURCE_LABELS[record.checkInSource] || record.checkInSource)}</span></td><td><span class="attendance-status${record.checkOutAt ? ' complete' : ''}">${record.checkOutAt ? (record.checkOutSource === 'auto' ? 'انصرف تلقائيًا' : 'انصرف') : 'داخل الجيم'}</span></td></tr>`).join('')}</tbody></table>`;
    }

    function decorateAttendanceActions(records) {
        const table = $('attendanceTableWrap')?.querySelector('table');
        if (!table?.tHead || !table.tBodies[0]) return;
        const header = document.createElement('th');
        header.textContent = 'الإجراء';
        table.tHead.rows[0].append(header);
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
                button.dataset.phone = record?.phone || '';
                button.textContent = 'تسجيل انصراف';
                cell.append(button);
            }
            row.append(cell);
        });
    }

    async function loadAttendance() {
        const search = $('attendanceSearch')?.value.trim() || '';
        $('attendanceTableWrap').innerHTML = '<div class="loading">جاري تحديث سجل الحضور…</div>';
        try {
            const data = await request(`/api/attendance?${new URLSearchParams({ search })}`);
            renderRecords(data);
            decorateAttendanceActions(data.records || []);
            if (Number(data.autoClosed || 0) > 0) announceAttendanceUpdate();
        } catch (error) {
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
        const body = payload || currentInput();
        if (!body) return;
        try {
            const result = await request('/api/attendance/check-in', { method: 'POST', body: JSON.stringify(body) });
            $('attendancePhone').value = '';
            await showMessage('تم تسجيل الحضور بنجاح ✅', 'success', result.message);
            await loadAttendance();
            announceAttendanceUpdate();
        } catch (error) {
            await showMessage(error.message, error.code?.startsWith('ATTENDANCE_') ? 'warning' : 'error');
            if (error.attendance) await loadAttendance();
        }
    }

    async function checkOut(payload = null) {
        const body = payload || currentInput();
        if (!body) return;
        try {
            const result = await request('/api/attendance/check-out', { method: 'POST', body: JSON.stringify(body) });
            $('attendancePhone').value = '';
            await showMessage('تم تسجيل الانصراف بنجاح ✅', 'success', result.message);
            await loadAttendance();
            announceAttendanceUpdate();
        } catch (error) {
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
    }

    async function handleQrScan(decodedText) {
        const memberId = qrMemberId(decodedText);
        if (!memberId) {
            await checkIn({ qrToken: decodedText });
            return;
        }
        try {
            const response = await request(`/api/members/${encodeURIComponent(memberId)}`);
            const member = response.member || response;
            if (await showQrMemberPreview(member)) await checkIn({ qrToken: decodedText });
        } catch (error) {
            await showMessage(error.message, 'error');
        }
    }

    async function openScanner() {
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
        try {
            const response = await request(`/api/members/${encodeURIComponent(memberId)}`);
            const member = response.member || response;
            currentQrMember = member;
            $('memberQrName').textContent = member.fullName || '—';
            $('memberQrPhone').textContent = member.phone || '—';
            const canvas = $('memberQrCanvas');
            if (!window.QRCode || !canvas) throw new Error('أداة إنشاء QR Code غير متاحة حالياً.');
            await window.QRCode.toCanvas(canvas, qrPayload(member), { width: 210, margin: 1, color: { dark: '#0f172a', light: '#ffffff' } });
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

    document.addEventListener('DOMContentLoaded', () => {
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
        $('attendanceScanButton')?.addEventListener('click', openScanner);
        $('qrReaderClose')?.addEventListener('click', closeScanner);
        $('memberQrClose')?.addEventListener('click', closeMemberQr);
        $('memberQrDownload')?.addEventListener('click', downloadMemberQr);
        let timer;
        $('attendanceSearch')?.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(loadAttendance, 250); });
        $('attendancePhone')?.addEventListener('keydown', (event) => { if (event.key === 'Enter') { event.preventDefault(); checkIn(); } });
        $('membersList')?.addEventListener('click', (event) => {
            const button = event.target.closest('button[data-action="qr"], button[data-member-qr]');
            if (!button) return;
            event.preventDefault();
            event.stopPropagation();
            openMemberQr(button.dataset.id || button.dataset.memberQr || button.closest('[data-member-id]')?.dataset.memberId);
        });
        window.addEventListener('topgym:member-created', (event) => {
            const detail = event.detail || {};
            if (detail.isNew && detail.member?.id) openMemberQr(detail.member.id);
        });
        document.addEventListener('topgym:tab-changed', (event) => { if (event.detail?.name === 'attendance') loadAttendance(); });
        window.setInterval(() => {
            if (document.visibilityState !== 'hidden') loadAttendance();
        }, 30000);
        loadAttendance();
    });

    window.topGymAttendance = { checkIn, checkOut, loadAttendance, openMemberQr, quickAction: (action, payload) => action === 'checkin' ? checkIn(payload) : checkOut(payload) };
})();
