(() => {
    if (window.__topGymBackupEnhancementsLoaded) return;
    window.__topGymBackupEnhancementsLoaded = true;

    const $ = (id) => document.getElementById(id);
    const manualBackupButton = $('backupManualButton');
    const jsonDownloadButton = $('backupJsonButton');
    const restoreButton = $('restoreBackupButton');
    const historyRefreshButton = $('backupHistoryRefresh');
    const historyList = $('backupHistoryList');
    const restoreDialog = $('backupRestoreDialog');
    const restoreForm = $('backupRestoreForm');
    const fileInput = $('backupFileInput');
    const validationBox = $('backupValidationBox');
    const restoreSubmit = $('backupRestoreSubmit');
    const restoreReason = $('backupRestoreReason');
    let inspected = null;
    let busy = false;

    function escapeHtml(value) {
        return String(value ?? '').replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[character]));
    }

    function showToast(icon, title, text = '') {
        if (window.topGymFeedback) {
            const message = text ? `${title} — ${text}` : title;
            const kind = ['success', 'error', 'warning', 'info'].includes(icon) ? icon : 'info';
            window.topGymFeedback.toast(message, kind);
            return;
        }
        if (!window.Swal) return;
        window.Swal.fire({
            toast: true,
            position: 'top-start',
            icon,
            title,
            text,
            showConfirmButton: false,
            timer: icon === 'error' ? 5000 : 3400,
            timerProgressBar: true,
            customClass: { popup: 'top-gym-alert top-gym-toast' }
        });
    }

    function formatBytes(value) {
        const bytes = Number(value || 0);
        if (bytes < 1024) return `${bytes} B`;
        if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
        return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    }

    function formatDate(value) {
        if (!value) return '—';
        const date = new Date(value);
        return Number.isNaN(date.getTime()) ? String(value) : new Intl.DateTimeFormat('ar-EG', { dateStyle: 'medium', timeStyle: 'short' }).format(date);
    }

    function getFilename(response, fallback = 'TOP-GYM-backup.json.gz') {
        const disposition = response.headers.get('Content-Disposition') || '';
        const match = disposition.match(/filename="([^"]+)"/i);
        return match?.[1] || fallback;
    }

    function encodeReasonHeader(value) {
        const bytes = new TextEncoder().encode(String(value || ''));
        let binary = '';
        bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
        return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
    }

    async function readJsonResponse(response, fallbackMessage) {
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
            const error = new Error(data.error || fallbackMessage);
            error.code = data.code;
            error.status = response.status;
            throw error;
        }
        return data;
    }

    const BACKUP_ERROR_MESSAGES = Object.freeze({
        BACKUP_STORAGE_NOT_CONFIGURED: 'التخزين الخاص للنسخ الاحتياطية غير مهيأ حاليًا. يجب على مدير المنصة ربط مزود تخزين خاص معتمد قبل إنشاء نسخة محفوظة.',
        BACKUP_STORAGE_UNAVAILABLE: 'التخزين الخاص للنسخ الاحتياطية غير متاح حاليًا. حاول مرة أخرى بعد التحقق من إعدادات مزود التخزين.'
    });

    function backupErrorMessage(error, fallback) {
        if (BACKUP_ERROR_MESSAGES[error?.code]) return BACKUP_ERROR_MESSAGES[error.code];
        if (Number(error?.status) === 503) return 'خدمة النسخ الاحتياطي غير متاحة حاليًا. حاول مرة أخرى بعد قليل.';
        return error?.message || fallback;
    }

    function setActionLoading(button, loading, loadingText) {
        if (!button) return;
        if (window.topGymFeedback) {
            if (loading) window.topGymFeedback.start(button, { loadingText });
            else window.topGymFeedback.stop(button);
            return;
        }
        button.disabled = loading;
        if (loadingText) button.textContent = loadingText;
    }

    async function askReason(title, confirmText = 'تأكيد') {
        if (window.Swal) {
            const result = await window.Swal.fire({
                position: 'center',
                title,
                input: 'textarea',
                inputLabel: 'سبب العملية *',
                inputPlaceholder: 'اكتب سببًا واضحًا للاحتفاظ به في سجل التدقيق',
                inputAttributes: { maxlength: 1000, 'aria-label': 'سبب العملية' },
                showCancelButton: true,
                confirmButtonText: confirmText,
                cancelButtonText: 'إلغاء',
                buttonsStyling: false,
                customClass: { popup: 'top-gym-alert backup-reason-alert', confirmButton: 'btn btn-primary', cancelButton: 'btn btn-light' },
                inputValidator: (value) => String(value || '').trim() ? undefined : 'سبب العملية مطلوب.'
            });
            return result.isConfirmed ? String(result.value || '').trim().slice(0, 1000) : null;
        }
        const value = window.prompt(`${title}\nاكتب سبب العملية:`);
        return value ? value.trim().slice(0, 1000) : null;
    }

    async function createManualBackup() {
        if (!manualBackupButton || manualBackupButton.dataset.backupBusy === 'true') return;
        const reason = await askReason('إنشاء نسخة محفوظة للجيم', 'إنشاء النسخة');
        if (!reason) return;
        manualBackupButton.dataset.backupBusy = 'true';
        const originalText = manualBackupButton.textContent;
        setActionLoading(manualBackupButton, true, 'جاري إنشاء النسخة...');
        try {
            const response = await fetch('/api/backup/records', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
                body: JSON.stringify({ format: 'json.gz', reason })
            });
            const data = await readJsonResponse(response, 'تعذر إنشاء النسخة المحفوظة.');
            showToast('success', data.idempotent ? 'النسخة اليومية موجودة بالفعل ✅' : 'تم إنشاء النسخة المحفوظة والتحقق منها ✅');
            await showHistory();
        } catch (error) {
            showToast('error', 'تعذر إنشاء النسخة المحفوظة', backupErrorMessage(error, 'حاول مرة أخرى.'));
        } finally {
            delete manualBackupButton.dataset.backupBusy;
            if (window.topGymFeedback) setActionLoading(manualBackupButton, false);
            else { manualBackupButton.disabled = false; manualBackupButton.textContent = originalText; }
        }
    }

    async function downloadBackup(trigger) {
        if (!trigger || trigger.dataset.backupBusy === 'true') return;
        trigger.dataset.backupBusy = 'true';
        setActionLoading(trigger, true, 'جاري تجهيز التنزيل...');
        try {
            const response = await fetch('/api/backup/download', { method: 'GET', cache: 'no-store', headers: { Accept: 'application/gzip' } });
            if (!response.ok) {
                const body = await response.json().catch(() => ({}));
                const error = new Error(body.error || 'تعذر إنشاء النسخة الاحتياطية.');
                error.code = body.code;
                error.status = response.status;
                throw error;
            }
            const blob = await response.blob();
            const objectUrl = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = objectUrl;
            link.download = getFilename(response, 'LOGIC-FIT-backup.json.gz');
            link.hidden = true;
            document.body.appendChild(link);
            link.click();
            link.remove();
            window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1500);
            showToast('success', 'تم تنزيل النسخة الاحتياطية ✅', 'تم إنشاء نسخة لحظية وحفظها على جهازك فقط.');
        } catch (error) {
            showToast('error', 'تعذر تحميل النسخة الاحتياطية', backupErrorMessage(error, 'حاول مرة أخرى.'));
        } finally {
            delete trigger.dataset.backupBusy;
            setActionLoading(trigger, false);
        }
    }

    function openDialog(dialog) {
        if (!dialog) return;
        if (dialog.showModal) dialog.showModal();
        else dialog.setAttribute('open', '');
    }

    function closeDialog(dialog) {
        if (!dialog) return;
        if (dialog.close && dialog.open) dialog.close();
        else dialog.removeAttribute('open');
    }

    function resetRestore() {
        inspected = null;
        if (restoreForm) restoreForm.reset();
        if (validationBox) {
            validationBox.hidden = true;
            validationBox.innerHTML = '';
        }
        if (restoreSubmit) restoreSubmit.disabled = true;
        if (restoreReason) restoreReason.value = '';
    }

    function renderInspection(data, file) {
        if (!validationBox) return;
        const tableRows = Object.entries(data.tableCounts || {})
            .filter(([, count]) => Number(count) > 0)
            .map(([name, count]) => `<tr><td>${escapeHtml(name)}</td><td>${Number(count).toLocaleString('ar-EG')}</td></tr>`)
            .join('');
        const integrityText = data.integrity?.verified
            ? 'تم التحقق من بصمة سلامة الملف SHA-256.'
            : 'تم التحقق من بنية النسخة القديمة.';
        validationBox.hidden = false;
        validationBox.innerHTML = `<div class="backup-validation-success"><strong>تم التحقق من الملف ✅</strong><span>${escapeHtml(file?.name || 'النسخة')} · ${formatBytes(file?.size)} · ${Number(data.rowCount || 0).toLocaleString('ar-EG')} صف</span><small>تاريخ إنشاء النسخة: ${escapeHtml(formatDate(data.generatedAt))}</small><small>${integrityText}</small></div><div class="backup-count-table-wrap"><table class="backup-count-table"><thead><tr><th>الجدول</th><th>الصفوف</th></tr></thead><tbody>${tableRows || '<tr><td colspan="2">لا توجد بيانات في النسخة.</td></tr>'}</tbody></table></div>`;
    }

    async function inspectFile(file) {
        resetRestore();
        if (!file) return;
        if (file.size > 25 * 1024 * 1024) {
            if (validationBox) { validationBox.hidden = false; validationBox.innerHTML = '<div class="backup-validation-error">حجم الملف أكبر من 25 ميجابايت.</div>'; }
            return;
        }
        if (validationBox) { validationBox.hidden = false; validationBox.innerHTML = '<div class="backup-validation-loading">جاري فحص النسخة…</div>'; }
        try {
            const response = await fetch('/api/backup/inspect', { method: 'POST', body: file, headers: { 'Content-Type': 'application/gzip', 'X-Backup-Filename': file.name } });
            const data = await response.json().catch(() => ({}));
            if (!response.ok || !data.valid) throw new Error(data.error || 'الملف غير صالح.');
            inspected = data;
            renderInspection(data, file);
            if (restoreSubmit) restoreSubmit.disabled = false;
        } catch (error) {
            if (validationBox) { validationBox.hidden = false; validationBox.innerHTML = `<div class="backup-validation-error">تعذر التحقق من النسخة: ${escapeHtml(error.message)}</div>`; }
        }
    }

    async function restoreBackup(event) {
        event.preventDefault();
        const file = fileInput?.files?.[0];
        if (!file || !inspected || busy) return;
        const reason = String(restoreReason?.value || '').trim();
        if (!reason) {
            showToast('warning', 'سبب الاسترجاع مطلوب', 'اكتب سبب العملية قبل المتابعة.');
            restoreReason?.focus();
            return;
        }
        let confirmation = { isConfirmed: true };
        if (window.Swal) {
            confirmation = await window.Swal.fire({
                position: 'center',
                icon: 'warning',
                title: 'تأكيد استرجاع النسخة',
                html: '<p>سيتم استبدال البيانات الحالية ببيانات النسخة بعد التحقق منها. سيتم إنشاء نسخة جديدة على جهازك أولًا إن أردت الاحتفاظ بالحالة الحالية.</p><strong>لا يمكن التراجع عن الاسترجاع من داخل هذه العملية.</strong>',
                showCancelButton: true,
                confirmButtonText: 'استرجاع الآن',
                cancelButtonText: 'إلغاء',
                buttonsStyling: false,
                customClass: { popup: 'top-gym-alert backup-restore-confirm', confirmButton: 'btn btn-danger', cancelButton: 'btn btn-light' }
            });
        }
        if (!confirmation.isConfirmed) return;
        busy = true;
        const originalRestoreText = restoreSubmit?.textContent || 'استرجاع بعد التحقق';
        setActionLoading(restoreSubmit, true, 'جاري استرجاع النسخة...');
        try {
            const response = await fetch('/api/backup/restore', {
                method: 'POST',
                body: file,
                headers: {
                    'Content-Type': 'application/gzip',
                    'X-TOP-GYM-RESTORE-CONFIRM': 'RESTORE',
                    'X-Backup-Reason-B64': encodeReasonHeader(reason),
                    'X-Backup-Filename': file.name
                }
            });
            await readJsonResponse(response, 'تعذر استرجاع النسخة.');
            closeDialog(restoreDialog);
            showToast('success', 'تم استرجاع النسخة بنجاح ✅', 'سيتم تحديث بيانات النظام الآن.');
            window.setTimeout(() => window.location.reload(), 1200);
        } catch (error) {
            showToast('error', 'فشل استرجاع النسخة', backupErrorMessage(error, 'لم يتم تغيير البيانات.'));
        } finally {
            busy = false;
            if (window.topGymFeedback) {
                setActionLoading(restoreSubmit, false);
                if (restoreSubmit) restoreSubmit.disabled = !inspected;
            } else if (restoreSubmit) { restoreSubmit.disabled = !inspected; restoreSubmit.textContent = originalRestoreText; }
        }
    }

    const HISTORY_LABELS = { download: 'تنزيل نسخة', inspect: 'فحص نسخة', restore: 'استرجاع نسخة' };
    function renderHistory(operations) {
        const rows = (operations || []).map((item) => `<tr><td><strong>${escapeHtml(HISTORY_LABELS[item.operationType] || item.operationType)}</strong><small>${escapeHtml(item.fileName || '—')}</small></td><td>${escapeHtml(formatDate(item.createdAt))}</td><td>${Number(item.rowCount || 0).toLocaleString('ar-EG')}</td><td><span class="backup-history-status ${item.status === 'success' ? 'success' : 'error'}">${item.status === 'success' ? 'ناجحة' : 'فاشلة'}</span></td></tr>`).join('');
        return `<div class="backup-history-wrap"><table class="backup-history-table"><thead><tr><th>العملية</th><th>التاريخ</th><th>الصفوف</th><th>الحالة</th></tr></thead><tbody>${rows || '<tr><td colspan="4">لا يوجد سجل نسخ حتى الآن.</td></tr>'}</tbody></table></div>`;
    }

    function recoveryStatusLabel(value) {
        return ({ PENDING: 'قيد الانتظار', RUNNING: 'جارٍ التنفيذ', UPLOADED: 'تم الرفع', VERIFYING: 'جارٍ التحقق', VERIFIED: 'تم التحقق', FAILED: 'فشل', EXPIRED: 'منتهية', DELETED: 'محذوفة' })[String(value || '').toUpperCase()] || value || '—';
    }

    function recoveryStatusMarkup(value) {
        const status = String(value || '').toLowerCase();
        const className = ['pending', 'running', 'uploaded', 'verifying', 'verified', 'failed', 'expired', 'deleted'].includes(status) ? status : '';
        return `<span class="backup-history-status ${className}">${escapeHtml(recoveryStatusLabel(value))}</span>`;
    }

    function recoveryTypeLabel(value) {
        return ({ tenant_daily: 'نسخة يومية', tenant_manual: 'نسخة يدوية', tenant_pre_restore: 'نسخة أمان قبل الاسترجاع' })[String(value || '').toLowerCase()] || value || '—';
    }

    function auditEventLabel(value) {
        return ({ BACKUP_CREATED: 'إنشاء نسخة', BACKUP_VERIFIED: 'تحقق من النسخة', BACKUP_DOWNLOADED: 'تنزيل نسخة', BACKUP_DELETED: 'حذف نسخة', RESTORE_REQUESTED: 'طلب استرجاع', RESTORE_STARTED: 'بدء الاسترجاع', RESTORE_COMPLETED: 'اكتمال الاسترجاع', RESTORE_FAILED: 'فشل الاسترجاع' })[String(value || '').toUpperCase()] || value || 'عملية نسخ';
    }

    function renderVisibleHistory(data = {}) {
        const records = Array.isArray(data.records) ? data.records : (Array.isArray(data.archives) ? data.archives : []);
        const audit = Array.isArray(data.audit) ? data.audit : (Array.isArray(data.operations) ? data.operations : []);
        const retentionDays = Number(data.retention?.tenant_daily || 30);
        const rows = records.map((item) => {
            const status = String(item.status || '').toUpperCase();
            const id = escapeHtml(item.id);
            const actions = status === 'VERIFIED'
                ? `<button type="button" class="btn btn-light btn-small backup-history-download" data-backup-record-id="${id}">تحميل</button><button type="button" class="btn btn-light btn-small backup-history-restore" data-backup-record-restore-id="${id}">استرجاع</button>`
                : '';
            const canDelete = !['RUNNING', 'UPLOADED', 'VERIFYING', 'DELETED'].includes(status);
            return `<tr><td><strong>${escapeHtml(item.fileName || '—')}</strong><small>${escapeHtml(formatDate(item.createdAt || item.generatedAt))}</small></td><td>${escapeHtml(recoveryTypeLabel(item.backupType || item.format))}</td><td>${recoveryStatusMarkup(status)}</td><td>${Number(item.rowCount || 0).toLocaleString('ar-EG')} صف</td><td>${formatBytes(item.sizeBytes ?? item.contentBytes)}</td><td>${escapeHtml(formatDate(item.verifiedAt))}</td><td><div class="backup-history-actions">${actions}${canDelete ? `<button type="button" class="btn btn-danger btn-small backup-history-delete" data-backup-record-delete-id="${id}">حذف</button>` : ''}${actions || canDelete ? '' : '—'}</div></td></tr>`;
        }).join('');
        const auditRows = audit.slice(0, 8).map((item) => `<tr><td>${escapeHtml(formatDate(item.createdAt))}</td><td>${escapeHtml(auditEventLabel(item.eventType || item.operationType))}</td><td>${recoveryStatusMarkup(item.result === 'success' ? 'VERIFIED' : item.result)}</td><td>${escapeHtml(item.reason || item.fileName || '—')}</td></tr>`).join('');
        const storageNotice = data.storage && data.storage.configured !== true
            ? `<div class="backup-storage-warning" role="status"><strong>التخزين الخاص غير مهيأ</strong><p>لن يتم اعتماد أي نسخة محفوظة حتى يربط مدير المنصة مزود تخزين خاصًا. النسخة الفاشلة تظل مسجلة بحالة «فشل» ولا تتحول إلى نسخة موثقة.</p></div>`
            : '';
        return `${storageNotice}<div class="backup-history-block"><div class="backup-history-block-head"><strong>النسخ المحفوظة للجيم</strong><span>النسخ اليومية تحتفظ بها المنصة ${retentionDays} يومًا</span></div><div class="backup-history-wrap"><table class="backup-history-table backup-archive-table"><thead><tr><th>الملف</th><th>النوع</th><th>الحالة</th><th>البيانات</th><th>الحجم</th><th>آخر تحقق</th><th>الإجراءات</th></tr></thead><tbody>${rows || '<tr><td colspan="7">لا توجد نسخ محفوظة لهذا الجيم حتى الآن.</td></tr>'}</tbody></table></div></div><div class="backup-history-block"><div class="backup-history-block-head"><strong>سجل التدقيق</strong><span>${audit.slice(0, 8).length.toLocaleString('ar-EG')} عمليات معروضة</span></div><div class="backup-history-wrap"><table class="backup-history-table backup-operations-table"><thead><tr><th>التاريخ</th><th>العملية</th><th>النتيجة</th><th>السبب</th></tr></thead><tbody>${auditRows || '<tr><td colspan="4">لا يوجد سجل عمليات حتى الآن.</td></tr>'}</tbody></table></div></div>`;
    }

    async function downloadArchive(id, trigger) {
        if (!id || !trigger || trigger.dataset.backupBusy === 'true') return;
        trigger.dataset.backupBusy = 'true';
        try {
            const response = await fetch(`/api/backup/records/${encodeURIComponent(id)}/download`, { cache: 'no-store', headers: { Accept: 'application/octet-stream' } });
            if (!response.ok) {
                const body = await response.json().catch(() => ({}));
                throw new Error(body.error || 'تعذر تحميل النسخة المحفوظة.');
            }
            const blob = await response.blob();
            const objectUrl = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = objectUrl;
            link.download = getFilename(response, `LOGIC-FIT-backup-${id}.json.gz`);
            link.hidden = true;
            document.body.appendChild(link);
            link.click();
            link.remove();
            window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1500);
            showToast('success', 'تم تحميل النسخة المحفوظة ✅');
        } catch (error) {
            showToast('error', 'تعذر تحميل النسخة المحفوظة', backupErrorMessage(error, 'حاول مرة أخرى.'));
        } finally {
            delete trigger.dataset.backupBusy;
        }
    }

    async function restoreStoredRecord(id, trigger) {
        if (!id || !trigger || trigger.dataset.backupBusy === 'true') return;
        const reason = await askReason('استرجاع النسخة المحفوظة', 'استرجاع النسخة');
        if (!reason) return;
        if (window.Swal) {
            const confirmation = await window.Swal.fire({
                position: 'center',
                icon: 'warning',
                title: 'تأكيد الاسترجاع',
                text: 'سيتم إنشاء نسخة أمان تلقائيًا ثم استبدال بيانات الجيم بهذه النسخة.',
                showCancelButton: true,
                confirmButtonText: 'متابعة الاسترجاع',
                cancelButtonText: 'إلغاء',
                buttonsStyling: false,
                customClass: { popup: 'top-gym-alert backup-restore-confirm', confirmButton: 'btn btn-danger', cancelButton: 'btn btn-light' }
            });
            if (!confirmation.isConfirmed) return;
        }
        trigger.dataset.backupBusy = 'true';
        setActionLoading(trigger, true, 'جاري استرجاع النسخة...');
        try {
            const response = await fetch(`/api/backup/records/${encodeURIComponent(id)}/restore`, { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'X-TOP-GYM-RESTORE-CONFIRM': 'RESTORE' }, body: JSON.stringify({ reason }) });
            await readJsonResponse(response, 'تعذر استرجاع النسخة المحفوظة.');
            showToast('success', 'تم استرجاع النسخة بنجاح ✅');
            window.setTimeout(() => window.location.reload(), 1200);
        } catch (error) {
            showToast('error', 'فشل استرجاع النسخة', backupErrorMessage(error, 'لم يتم تغيير البيانات.'));
        } finally { delete trigger.dataset.backupBusy; setActionLoading(trigger, false); }
    }

    async function deleteArchive(id, trigger) {
        if (!id || !trigger || trigger.dataset.backupBusy === 'true') return;
        const reason = await askReason('حذف النسخة الاحتياطية', 'متابعة الحذف');
        if (!reason) return;
        if (window.Swal) {
            const result = await window.Swal.fire({
                position: 'center',
                icon: 'warning',
                title: 'تأكيد حذف النسخة الاحتياطية',
                text: 'سيتم حذف النسخة المحفوظة من التخزين الخاص، ولن يؤثر ذلك على بيانات النظام الحالية.',
                showCancelButton: true,
                confirmButtonText: 'نعم، احذف',
                cancelButtonText: 'إلغاء',
                buttonsStyling: false,
                customClass: { popup: 'top-gym-alert delete-confirm-alert', confirmButton: 'btn btn-danger', cancelButton: 'btn btn-light' }
            });
            if (!result.isConfirmed) return;
        } else if (!window.confirm('هل تريد حذف النسخة الاحتياطية المحفوظة؟')) return;
        trigger.dataset.backupBusy = 'true';
        setActionLoading(trigger, true, 'جاري حذف النسخة...');
        try {
            const response = await fetch(`/api/backup/records/${encodeURIComponent(id)}`, { method: 'DELETE', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify({ reason }) });
            await readJsonResponse(response, 'تعذر حذف النسخة الاحتياطية.');
            showToast('success', 'تم حذف النسخة الاحتياطية ✅');
            await showHistory();
        } catch (error) {
            showToast('error', 'تعذر حذف النسخة الاحتياطية', backupErrorMessage(error, 'حاول مرة أخرى.'));
        } finally {
            delete trigger.dataset.backupBusy;
            setActionLoading(trigger, false);
        }
    }

    async function showHistory() {
        try {
            const response = await fetch('/api/backup/history?limit=30&auditLimit=50', { cache: 'no-store' });
            const data = await response.json().catch(() => ({}));
            if (!response.ok) {
                const error = new Error(data.error || 'تعذر تحميل سجل النسخ.');
                error.code = data.code;
                error.status = response.status;
                throw error;
            }
            if (manualBackupButton && data.storage) {
                const storageConfigured = data.storage.configured === true;
                manualBackupButton.disabled = !storageConfigured;
                manualBackupButton.title = storageConfigured
                    ? ''
                    : 'التخزين الخاص للنسخ الاحتياطية غير مهيأ حاليًا';
                manualBackupButton.setAttribute('aria-disabled', String(!storageConfigured));
            }
            if (historyList) {
                historyList.innerHTML = renderVisibleHistory(data);
                return;
            }
            if (window.Swal) {
                await window.Swal.fire({ position: 'center', title: 'سجل النسخ الاحتياطية', html: renderHistory(data.operations), confirmButtonText: 'إغلاق', buttonsStyling: false, customClass: { popup: 'top-gym-alert backup-history-alert', confirmButton: 'btn btn-primary' } });
            }
        } catch (error) {
            if (historyList) historyList.innerHTML = `<div class="backup-history-error">${escapeHtml(backupErrorMessage(error, 'تعذر تحميل سجل النسخ.'))}</div>`;
            showToast('error', 'تعذر تحميل سجل النسخ', backupErrorMessage(error, 'حاول مرة أخرى.'));
        }
    }

    manualBackupButton?.addEventListener('click', createManualBackup);
    jsonDownloadButton?.addEventListener('click', () => downloadBackup(jsonDownloadButton));
    restoreButton?.addEventListener('click', () => { resetRestore(); openDialog(restoreDialog); });
    historyRefreshButton?.addEventListener('click', async () => {
        setActionLoading(historyRefreshButton, true, 'جاري تحديث السجل...');
        try { await showHistory(); } finally { setActionLoading(historyRefreshButton, false); }
    });
    window.addEventListener('topgym:tab-changed', (event) => {
        if (event.detail?.name === 'backup-history') void showHistory();
    });
    historyList?.addEventListener('click', (event) => {
        const button = event.target.closest('[data-backup-record-id], [data-backup-archive-id]');
        if (button) {
            downloadArchive(button.dataset.backupRecordId || button.dataset.backupArchiveId, button);
            return;
        }
        const restoreButton = event.target.closest('[data-backup-record-restore-id]');
        if (restoreButton) {
            restoreStoredRecord(restoreButton.dataset.backupRecordRestoreId, restoreButton);
            return;
        }
        const deleteButton = event.target.closest('[data-backup-record-delete-id], [data-backup-archive-delete-id]');
        if (deleteButton) deleteArchive(deleteButton.dataset.backupRecordDeleteId || deleteButton.dataset.backupArchiveDeleteId, deleteButton);
    });
    $('backupRestoreClose')?.addEventListener('click', () => closeDialog(restoreDialog));
    $('backupRestoreCancel')?.addEventListener('click', () => closeDialog(restoreDialog));
    fileInput?.addEventListener('change', () => inspectFile(fileInput.files?.[0]));
    restoreForm?.addEventListener('submit', restoreBackup);
    if (historyList && document.documentElement.dataset.topGymActiveTab === 'backup-history') showHistory();
})();
