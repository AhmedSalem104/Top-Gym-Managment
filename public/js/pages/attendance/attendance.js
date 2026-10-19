(() => {
    if (window.__topGymAttendanceLoaded) return;
    window.__topGymAttendanceLoaded = true;

    const $ = (id) => document.getElementById(id);
    const translate = (key, params) => window.TopGymI18n?.t?.(key, params) || key;
    const formatNumber = (value) => window.TopGymI18n?.format?.('number', Number(value)) ?? String(value ?? 0);
    const can = (permission) => window.topGymAuth?.isOwner?.() === true
        || window.topGymAuth?.hasPermission?.(permission) === true;
    const canReadMember = () => can('members.read') && can('memberships.read');
    const canReadAttendanceQr = () => canReadMember() && can('attendance.read');
    const SOURCE_LABEL_KEYS = { phone: 'attendance.mode.phone', qr: 'attendance.mode.qr', manual: 'attendance.source.manual', auto: 'attendance.source.auto' };
    let scanner = null;
    let scannerRunning = false;
    let attendanceAbortController = null;
    let memberPreviewAbortController = null;
    let memberPreviewTimer = null;
    let memberPreviewLookupDigits = '';
    let previewMember = null;
    let attendanceSnapshot = null;
    let attendanceRequest = null;
    let attendanceRequestKey = '';
    let initialized = false;
    let memberPreviewMessage = null;

    function escapeHtml(value) {
        return String(value ?? '').replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));
    }

    function dateText(value) {
        if (!value) return '—';
        return window.TopGymI18n?.format?.('date', String(value).slice(0, 10), { dateStyle: 'medium' }) || String(value);
    }

    function timeText(value) {
        if (!value) return '—';
        return window.TopGymI18n?.format?.('time', value, { timeStyle: 'short' }) || String(value);
    }

    const STATUS_LABEL_KEYS = { active: 'attendance.member.status.active', expiring_soon: 'attendance.member.status.expiring', expired: 'attendance.member.status.expired', frozen: 'attendance.member.status.frozen' };
    const PLAN_LABEL_KEYS = { gym_only: 'attendance.member.plan.gymOnly', gym_cardio: 'attendance.member.plan.gymCardio' };
    const TYPE_LABEL_KEYS = { monthly: 'attendance.member.type.monthly', half_month: 'attendance.member.type.halfMonth', quarterly: 'attendance.member.type.quarterly', semiannual: 'attendance.member.type.semiannual', annual: 'attendance.member.type.annual' };
    const displayEnum = (value, keys) => keys[value] ? translate(keys[value]) : (value || '—');

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

    function isSecureMembershipQr(value) {
        return /^LFQR1\.[A-Za-z0-9_-]{32,160}$/.test(String(value || '').trim());
    }

    function qrStatusClass(status) {
        return ['active', 'expiring_soon', 'expired', 'frozen'].includes(status) ? status : 'unknown';
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
        const statusLabel = STATUS_LABEL_KEYS[status] ? translate(STATUS_LABEL_KEYS[status]) : translate('attendance.member.status.none');
        const planLabel = displayEnum(membership.plan, PLAN_LABEL_KEYS);
        const typeLabel = displayEnum(membership.type, TYPE_LABEL_KEYS);
        const operationLabel = translate(isCheckout ? 'attendance.member.operation.checkOut' : eligible ? 'attendance.member.operation.checkIn' : 'attendance.member.operation.unavailable');
        const operationHint = isCheckout
            ? translate('attendance.member.operation.inside')
            : eligible
                ? translate('attendance.member.operation.valid')
                : translate('attendance.member.operation.blocked');
        if (!window.Swal) return eligible;
        const result = await window.Swal.fire({
            position: 'center',
            icon: isCheckout ? 'success' : eligible ? 'info' : 'warning',
            title: eligible ? translate('attendance.member.operation.confirm', { action: operationLabel }) : translate('attendance.member.operation.details'),
            html: `<div class="qr-member-preview">
                <div class="qr-member-preview-identity">
                    <span class="qr-member-preview-avatar" aria-hidden="true">${escapeHtml(memberInitials(member.fullName))}</span>
                    <div class="qr-member-preview-identity-copy">
                        <strong>${escapeHtml(member.fullName || '—')}</strong>
                        <span dir="ltr">${escapeHtml(displayPhone(member.phone, member.phoneCountry) || '—')}</span>
                    </div>
                    <b class="qr-member-preview-status ${qrStatusClass(status)}"><span class="qr-member-preview-status-dot" aria-hidden="true"></span>${escapeHtml(statusLabel)}</b>
                </div>
                <div class="qr-member-preview-context">
                    <span class="qr-member-preview-kicker">QR Code</span>
                    <strong>${escapeHtml(operationLabel)}</strong>
                    <small>${escapeHtml(operationHint)}</small>
                </div>
                <div class="qr-member-preview-grid">
                    <div class="qr-member-preview-field"><span>${escapeHtml(translate('attendance.member.field.plan'))}</span><strong>${escapeHtml(planLabel)}</strong></div>
                    <div class="qr-member-preview-field"><span>${escapeHtml(translate('attendance.member.field.type'))}</span><strong>${escapeHtml(typeLabel)}</strong></div>
                    <div class="qr-member-preview-field"><span>${escapeHtml(translate('attendance.member.field.startDate'))}</span><strong>${escapeHtml(dateText(membership.startDate))}</strong></div>
                    <div class="qr-member-preview-field"><span>${escapeHtml(translate('attendance.member.field.endDate'))}</span><strong>${escapeHtml(dateText(membership.effectiveEndDate || membership.endDate))}</strong></div>
                    ${Number(membership.amountRemaining || 0) > 0 ? `<div class="qr-member-preview-field qr-member-preview-balance"><span>${escapeHtml(translate('attendance.member.field.remaining'))}</span><strong>${formatNumber(Number(membership.amountRemaining))} ${escapeHtml(translate('attendance.member.currency'))}</strong></div>` : ''}
                </div>
            </div>`,
            showCancelButton: eligible,
            confirmButtonText: eligible ? operationLabel : translate('attendance.member.operation.close'),
            cancelButtonText: translate('attendance.member.operation.cancel'),
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
                confirmButtonText: translate('attendance.member.operation.ok'),
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

    async function request(path, options = {}) {
        if (window.topGymApi?.request) return window.topGymApi.request(path, options);
        const response = await fetch(path, { ...options, headers: { 'Content-Type': 'application/json', ...(options.headers || {}) } });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
            const error = new Error(data.error || translate('attendance.error.request'));
            Object.assign(error, data);
            throw error;
        }
        return data;
    }

    function announceAttendanceUpdate() {
        window.dispatchEvent(new CustomEvent('topgym:attendance-updated'));
    }

    function normalizePhone(value) {
        const iso = $('attendancePhone')?.dataset.phoneCountry || '';
        const prepared = window.LogicFitPhoneInputs?.normalizeForTransport?.(value, iso) || value;
        return String(prepared ?? '').replace(/[^0-9]/g, '');
    }

    function displayPhone(value, iso = '') {
        return window.LogicFitPhoneInputs?.formatForDisplay?.(value, iso) || String(value || '');
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
        checkInButton.hidden = true;
        checkOutButton.hidden = true;
        checkInButton.classList.add('hidden');
        checkOutButton.classList.add('hidden');
        checkInButton.disabled = !can('attendance.check_in');
        checkOutButton.disabled = !can('attendance.check_out');
        checkInButton.textContent = translate('attendance.action.checkIn');
        checkOutButton.textContent = translate('attendance.action.checkOut');
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
        const canCheckOut = can('attendance.check_out') && state.inside;
        checkInButton.hidden = !canCheckIn;
        checkOutButton.hidden = !canCheckOut;
        checkInButton.classList.toggle('hidden', !canCheckIn);
        checkOutButton.classList.toggle('hidden', !canCheckOut);
        checkInButton.disabled = !can('attendance.check_in') || state.inside || state.checkedOut || !state.eligible;
        checkOutButton.disabled = !can('attendance.check_out') || !state.inside;
        checkInButton.textContent = canCheckIn ? translate('attendance.action.checkIn') : translate('attendance.action.noCheckInPermission');
        checkOutButton.textContent = canCheckOut ? translate('attendance.action.checkOut') : translate('attendance.action.noCheckOutPermission');
        checkInButton.classList.toggle('is-suggested', canCheckIn);
        checkOutButton.classList.toggle('is-suggested', state.inside);
        checkInButton.dataset.suggested = canCheckIn ? 'true' : 'false';
        checkOutButton.dataset.suggested = state.inside ? 'true' : 'false';
    }

    function renderMemberPreviewMessage(key, kind = 'neutral') {
        const preview = $('attendanceMemberPreview');
        if (!preview) return;
        memberPreviewMessage = { key, kind };
        preview.hidden = false;
        preview.className = `attendance-member-preview ${kind}`;
        preview.innerHTML = `<span class="attendance-preview-state-icon" aria-hidden="true">${kind === 'error' ? '!' : 'i'}</span><span>${escapeHtml(translate(key))}</span>`;
    }

    function clearMemberPreview() {
        memberPreviewAbortController?.abort();
        memberPreviewLookupDigits = '';
        previewMember = null;
        memberPreviewMessage = null;
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
        const statusLabel = STATUS_LABEL_KEYS[state.status] ? translate(STATUS_LABEL_KEYS[state.status]) : translate('attendance.member.status.none');
        const planLabel = displayEnum(membership.plan, PLAN_LABEL_KEYS);
        const attendanceLabel = translate(state.inside ? 'attendance.member.attendance.inside' : state.checkedOut ? 'attendance.member.attendance.checkedOut' : 'attendance.member.attendance.notCheckedIn');
        const attendanceTime = state.inside ? timeText(member.attendance?.checkInAt) : '—';
        const actionText = state.checkedOut
            ? translate('attendance.member.operation.checkedOut')
            : !state.eligible
                ? state.status === 'frozen' ? translate('attendance.member.operation.frozen') : state.status === 'expired' ? translate('attendance.member.operation.expired') : translate('attendance.member.operation.noMembership')
                : state.inside && !can('attendance.check_out')
                    ? translate('attendance.member.operation.noCheckOutPermission')
                    : !state.inside && !can('attendance.check_in')
                        ? translate('attendance.member.operation.noCheckInPermission')
                        : '';
        const initials = String(member.fullName || 'TG').trim().split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part.charAt(0)).join('') || 'TG';
        preview.hidden = false;
        preview.className = `attendance-member-preview ${state.inside ? 'inside' : state.eligible ? 'eligible' : 'blocked'}`;
        preview.innerHTML = `<div class="attendance-preview-member"><span class="attendance-preview-avatar" aria-hidden="true">${escapeHtml(initials)}</span><div><strong>${escapeHtml(member.fullName || '—')}</strong><span dir="ltr">${escapeHtml(displayPhone(member.phone, member.phoneCountry) || '—')}</span></div><div class="attendance-preview-badges"><b class="attendance-preview-status ${escapeHtml(state.status || 'unknown')}"><span data-i18n="${escapeHtml(STATUS_LABEL_KEYS[state.status] || 'attendance.member.status.none')}">${escapeHtml(statusLabel)}</span></b><b class="attendance-preview-attendance ${state.inside ? 'inside' : state.checkedOut ? 'checked-out' : ''}">${escapeHtml(attendanceLabel)}</b></div></div><div class="attendance-preview-details"><span><small>${escapeHtml(translate('attendance.member.field.plan'))}</small><b>${escapeHtml(planLabel)}</b></span><span><small>${escapeHtml(translate('attendance.member.field.todayAttendance'))}</small><b>${escapeHtml(attendanceTime)}</b></span><span><small>${escapeHtml(translate('attendance.member.field.membershipUntil'))}</small><b dir="ltr">${escapeHtml(dateText(membership.effectiveEndDate || membership.endDate))}</b></span></div>${actionText ? `<p class="attendance-preview-action${state.eligible ? ' is-warning' : ''}" role="status">${escapeHtml(actionText)}</p>` : ''}`;
        const previewPhone = preview.querySelector('.attendance-preview-member span[dir="ltr"]');
        if (previewPhone) previewPhone.textContent = displayPhone(member.phone, member.phoneCountry) || '—';
        updateAttendanceActionButtons(member);
    }

    async function lookupMemberPreview() {
        const phone = $('attendancePhone')?.value.trim() || '';
        const digits = normalizePhone(phone);
        if (digits.length < 5) {
            clearMemberPreview();
            return;
        }
        if (memberPreviewLookupDigits === digits && memberPreviewAbortController && !memberPreviewAbortController.signal.aborted) return;
        if (previewMember && normalizePhone(previewMember.phone) === digits) return;
        memberPreviewAbortController?.abort();
        memberPreviewAbortController = new AbortController();
        const controller = memberPreviewAbortController;
        memberPreviewLookupDigits = digits;
        renderMemberPreviewMessage('attendance.preview.searching', 'loading');
        try {
            const params = new URLSearchParams({ search: phone, page: '1', pageSize: '5', sort: 'expiry' });
            const response = await request(`/api/members?${params}`, { signal: controller.signal });
            if (controller.signal.aborted) return;
            const candidates = response.members || [];
            const exact = candidates.find((member) => normalizePhone(member.phone) === digits);
            const member = exact || (candidates.length === 1 ? candidates[0] : null);
            if (!member) {
                memberPreviewLookupDigits = '';
                previewMember = null;
                renderMemberPreviewMessage('attendance.preview.notFound', 'error');
                updateAttendanceActionButtons();
                return;
            }
            previewMember = member;
            renderMemberPreview(member);
        } catch (error) {
            if (error.name === 'AbortError') return;
            memberPreviewLookupDigits = '';
            previewMember = null;
            renderMemberPreviewMessage('attendance.preview.loadError', 'error');
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

    function filteredAttendanceRecords(data) {
        const allRecords = data.records || [];
        const filter = $('attendanceStatusFilter')?.value || 'all';
        return filter === 'inside'
            ? allRecords.filter((record) => !record.checkOutAt)
            : filter === 'checked_out'
                ? allRecords.filter((record) => Boolean(record.checkOutAt))
                : allRecords;
    }

    function renderRecords(data) {
        attendanceSnapshot = data;
        const allRecords = data.records || [];
        const records = filteredAttendanceRecords(data);
        const filter = $('attendanceStatusFilter')?.value || 'all';
        $('attendanceDateLabel').textContent = dateText(data.date);
        $('attendancePresentCount').textContent = formatNumber(Number(data.summary?.present || 0));
        $('attendanceCheckedInCount').textContent = formatNumber(Number(data.summary?.checkedIn || 0));
        $('attendanceCheckedOutCount').textContent = formatNumber(Number(data.summary?.checkedOut || 0));
        const listMeta = $('attendanceListMeta');
        // The loading annotation is only valid before the first response.
        // Once runtime data owns this node, prevent a locale-wide static pass
        // from restoring the stale loading copy over the rendered summary.
        listMeta?.removeAttribute('data-i18n');
        if (listMeta) listMeta.textContent = filter === 'all'
            ? translate('attendance.log.count', { count: records.length, date: dateText(data.date) })
            : translate('attendance.log.filteredCount', { count: records.length, total: allRecords.length, date: dateText(data.date) });
        if (!records.length) {
            $('attendanceTableWrap').innerHTML = `<div class="attendance-empty">${escapeHtml(translate(allRecords.length ? 'attendance.log.emptyFiltered' : 'attendance.log.empty'))}</div>`;
            return;
        }
        const labels = {
            member: translate('attendance.table.member'), phone: translate('attendance.table.phone'),
            checkIn: translate('attendance.table.checkIn'), checkOut: translate('attendance.table.checkOut'),
            duration: translate('attendance.table.duration'), status: translate('attendance.table.status'),
            action: translate('attendance.table.action')
        };
        $('attendanceTableWrap').innerHTML = `<table class="attendance-table"><thead><tr><th>${escapeHtml(labels.member)}</th><th>${escapeHtml(labels.phone)}</th><th>${escapeHtml(labels.checkIn)}</th><th>${escapeHtml(labels.checkOut)}</th><th>${escapeHtml(labels.duration)}</th><th>${escapeHtml(labels.status)}</th><th>${escapeHtml(labels.action)}</th></tr></thead><tbody>${records.map((record) => {
            const duration = record.durationMinutes === null
                ? translate('attendance.status.inside')
                : `${formatNumber(record.durationMinutes)} ${translate('attendance.duration.minutes')}`;
            const status = record.checkOutAt
                ? translate(record.checkOutSource === 'auto' ? 'attendance.status.autoCheckedOut' : 'attendance.status.checkedOut')
                : translate('attendance.status.inside');
            return `<tr><td data-label="${escapeHtml(labels.member)}"><span class="attendance-row-avatar" aria-hidden="true">${escapeHtml(memberInitials(record.memberName))}</span><span class="attendance-member-name">${escapeHtml(record.memberName)}</span></td><td data-label="${escapeHtml(labels.phone)}"><span class="attendance-member-phone" dir="ltr">${escapeHtml(record.phone)}</span></td><td data-label="${escapeHtml(labels.checkIn)}"><span class="attendance-time">${timeText(record.checkInAt)}</span></td><td data-label="${escapeHtml(labels.checkOut)}"><span class="attendance-time">${timeText(record.checkOutAt)}</span></td><td data-label="${escapeHtml(labels.duration)}">${escapeHtml(duration)}</td><td data-label="${escapeHtml(labels.status)}"><span class="attendance-status${record.checkOutAt ? ' complete' : ''}">${escapeHtml(status)}</span></td><td data-label="${escapeHtml(labels.action)}"></td></tr>`;
        }).join('')}</tbody></table>`;
        $('attendanceTableWrap').querySelectorAll('.attendance-member-phone').forEach((phoneNode, index) => {
            const record = records[index];
            if (record) phoneNode.textContent = displayPhone(record.phone, record.phoneCountry) || record.phone || '—';
        });
    }

    function searchAttendanceMember() {
        window.clearTimeout(memberPreviewTimer);
        if (normalizePhone($('attendancePhone')?.value || '').length < 5) {
            renderMemberPreviewMessage('attendance.preview.invalidPhone', 'error');
            $('attendancePhone')?.focus({ preventScroll: true });
            return;
        }
        void lookupMemberPreview();
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
                status.textContent = translate(record.checkOutSource === 'auto' ? 'attendance.status.autoCheckedOutDone' : 'attendance.status.checkedOutDone');
                cell.append(status);
            } else {
                const button = document.createElement('button');
                button.type = 'button';
                button.className = 'btn btn-small attendance-checkout-button';
                button.dataset.attendanceCheckout = 'true';
                button.dataset.requiredPermission = 'attendance.check_out';
                button.dataset.phone = record?.phone || '';
                button.textContent = translate('attendance.action.checkOut');
                button.setAttribute('aria-label', translate('attendance.action.checkOut'));
                cell.append(button);
            }
            const existingCell = row.lastElementChild;
            if (existingCell) existingCell.replaceWith(cell);
            else row.append(cell);
        });
    }

    async function loadAttendance(options = {}) {
        const search = $('attendanceSearch')?.value.trim() || '';
        const branchId = window.sessionStorage?.getItem('logicfit.branchId') || '';
        const sectionId = window.sessionStorage?.getItem('logicfit.sectionId') || '';
        const requestKey = JSON.stringify([search, branchId, sectionId]);
        const force = options?.force === true;
        if (!force && attendanceRequest && attendanceRequestKey === requestKey) return attendanceRequest;
        attendanceAbortController?.abort();
        attendanceAbortController = new AbortController();
        const controller = attendanceAbortController;
        const loadPromise = (async () => {
        $('attendanceTableWrap').innerHTML = `<div class="loading" role="status" aria-live="polite">${escapeHtml(translate('attendance.log.refreshing'))}</div>`;
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
        })();
        const trackedPromise = loadPromise.finally(() => {
            if (attendanceRequest === trackedPromise) {
                attendanceRequest = null;
                attendanceRequestKey = '';
            }
        });
        attendanceRequestKey = requestKey;
        attendanceRequest = trackedPromise;
        return trackedPromise;
    }

    function currentInput() {
        const phoneInput = $('attendancePhone');
        const phone = phoneInput?.value.trim();
        if (!phone) {
            showMessage(translate('attendance.action.enterPhoneOrScan'), 'warning');
            return null;
        }
        const validation = window.LogicFitPhoneInputs?.validateInput?.(phoneInput, { show: true });
        const payload = window.LogicFitPhoneInputs?.getSubmissionPayload?.(phoneInput);
        if (!validation?.valid || !payload) {
            showMessage(validation?.message || translate('attendance.action.invalidPhone'), 'warning');
            phoneInput?.focus();
            return null;
        }
        return payload;
    }

    async function checkIn(payload = null) {
        if (!can('attendance.check_in')) {
            await showMessage(translate('attendance.permission.checkIn'), 'error');
            return;
        }
        const body = payload || currentInput();
        if (!body) return;
        try {
            const result = await request('/api/attendance/check-in', { method: 'POST', body: JSON.stringify(body) });
            const memberName = previewMember?.fullName || translate('attendance.member.generic');
            $('attendancePhone').value = '';
            clearMemberPreview();
            if (typeof window.showToast === 'function') window.showToast(translate('attendance.success.checkIn', { name: memberName }), false, 'success');
            else void showMessage(translate('attendance.success.checkedIn'), 'success', result.message);
            attendanceFeedback('success');
            announceAttendanceUpdate();
            void loadAttendance({ force: true });
        } catch (error) {
            attendanceFeedback('error');
            await showMessage(error.message, error.code?.startsWith('ATTENDANCE_') ? 'warning' : 'error');
            if (error.attendance) await loadAttendance({ force: true });
        }
    }

    async function checkOut(payload = null) {
        if (!can('attendance.check_out')) {
            await showMessage(translate('attendance.permission.checkOut'), 'error');
            return;
        }
        const body = payload || currentInput();
        if (!body) return;
        try {
            const result = await request('/api/attendance/check-out', { method: 'POST', body: JSON.stringify(body) });
            const memberName = previewMember?.fullName || translate('attendance.member.generic');
            $('attendancePhone').value = '';
            clearMemberPreview();
            if (typeof window.showToast === 'function') window.showToast(translate('attendance.success.checkOut', { name: memberName }), false, 'success');
            else void showMessage(translate('attendance.success.checkedOut'), 'success', result.message);
            attendanceFeedback('success');
            announceAttendanceUpdate();
            void loadAttendance({ force: true });
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
        if (isSecureMembershipQr(decodedText) && canReadAttendanceQr()) {
            try {
                const resolved = await request('/api/attendance/resolve-qr', { method: 'POST', body: JSON.stringify({ qrToken: decodedText }) });
                const member = resolved.member;
                if (resolved.attendance?.checkedOut) {
                    await showMessage(translate('attendance.qr.alreadyCheckedOutMember'), 'info');
                    return;
                }
                const action = resolved.attendance?.inside ? 'checkout' : 'checkin';
                if (await showQrMemberPreview(member, action)) {
                    if (action === 'checkout') await checkOut({ qrToken: decodedText });
                    else await checkIn({ qrToken: decodedText });
                }
            } catch (error) { await showMessage(error.message, 'error'); }
            return;
        }
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
                    await showMessage(translate('attendance.qr.alreadyCheckedOutSubscriber'), 'info');
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
            await showMessage(translate('attendance.qr.unavailable'), 'warning');
            return;
        }
        const dialog = $('qrReaderDialog');
        // The QR dialog is a sibling of attendanceSection, so the normal
        // attendance localization pass does not cover it. Re-apply the
        // canonical catalog when opening it, before it becomes visible.
        window.TopGymI18n?.apply?.(dialog);
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
            await showMessage(translate('attendance.qr.cameraError'), 'warning', error.message);
        }
    }

    async function openMemberQr(memberId) {
        if (window.topGymMemberDigitalCard?.openFromMemberId) {
            await window.topGymMemberDigitalCard.openFromMemberId(memberId);
            return;
        }
        await showMessage(translate('attendance.qr.cardUnavailable'), 'error');
    }

    function isAttendanceActive() {
        return !$('attendanceSection')?.hidden;
    }

    function applyAttendanceLocalization() {
        const section = $('attendanceSection');
        if (!section) return;
        window.TopGymI18n?.apply?.(section);
        window.TopGymI18n?.apply?.($('qrReaderDialog'));
    }

    function initializeAttendance() {
        if (initialized) return;
        initialized = true;
        applyAttendanceLocalization();
        resetAttendanceActionButtons();
        $('attendanceCheckInButton')?.addEventListener('click', () => checkIn());
        $('attendanceCheckOutButton')?.addEventListener('click', () => checkOut());
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
        document.querySelector('.attendance-member-search-button')?.addEventListener('click', searchAttendanceMember);
        $('qrReaderClose')?.addEventListener('click', closeScanner);
        $('qrReaderDialog')?.addEventListener('close', () => {
            void stopScanner();
            setAttendanceMode('phone');
        });
        let timer;
        const attendanceSearch = $('attendanceSearch');
        const attendanceSearchClear = $('attendanceSearchClearButton');
        const syncAttendanceSearchClear = () => {
            if (attendanceSearchClear && attendanceSearch) attendanceSearchClear.hidden = !attendanceSearch.value.trim();
        };
        attendanceSearch?.addEventListener('input', () => {
            syncAttendanceSearchClear();
            clearTimeout(timer);
            timer = setTimeout(loadAttendance, 350);
        });
        attendanceSearchClear?.addEventListener('click', () => {
            clearTimeout(timer);
            if (attendanceSearch) attendanceSearch.value = '';
            syncAttendanceSearchClear();
            attendanceSearch?.focus({ preventScroll: true });
            void loadAttendance({ force: true });
        });
        syncAttendanceSearchClear();
        $('attendanceStatusFilter')?.addEventListener('change', () => {
            if (!attendanceSnapshot) return;
            renderRecords(attendanceSnapshot);
            const records = attendanceSnapshot.records || [];
            const filter = $('attendanceStatusFilter').value;
            decorateAttendanceActions(records.filter((record) => filter === 'inside' ? !record.checkOutAt : filter === 'checked_out' ? Boolean(record.checkOutAt) : true));
        });
        window.addEventListener('topgym:localechange', () => {
            const section = $('attendanceSection');
            if (!section) return;
            applyAttendanceLocalization();
            if (previewMember) renderMemberPreview(previewMember);
            else if (memberPreviewMessage) renderMemberPreviewMessage(memberPreviewMessage.key, memberPreviewMessage.kind);
            if (attendanceSnapshot) {
                renderRecords(attendanceSnapshot);
                decorateAttendanceActions(filteredAttendanceRecords(attendanceSnapshot));
            } else updateAttendanceActionButtons();
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
        window.addEventListener('topgym:tab-changed', (event) => { if (event.detail?.name === 'attendance') loadAttendance(); });
        window.addEventListener('topgym:branch-context-changed', () => {
            attendanceSnapshot = null;
            if (isAttendanceActive()) void loadAttendance();
        });
        window.setInterval(() => {
            if (document.visibilityState !== 'hidden' && isAttendanceActive()) loadAttendance();
        }, 30000);
        // The tab router dispatches `topgym:tab-changed` after this lazy
        // module is loaded. Waiting for that event prevents a duplicate
        // attendance request during first navigation to the screen.
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initializeAttendance, { once: true });
    else initializeAttendance();

    window.topGymAttendance = { checkIn, checkOut, loadAttendance, openMemberQr, quickAction: (action, payload) => action === 'checkin' ? checkIn(payload) : checkOut(payload) };
})();
