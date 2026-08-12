(() => {
    if (window.__topGymBackupEnhancementsLoaded) return;
    window.__topGymBackupEnhancementsLoaded = true;

    const $ = (id) => document.getElementById(id);
    const downloadButton = $('backupButton');
    const jsonDownloadButton = $('backupJsonButton');
    const bakDownloadButton = $('backupBakButton');
    const restoreButton = $('restoreBackupButton');
    const historyButton = $('backupHistoryButton');
    const historyRefreshButton = $('backupHistoryRefresh');
    const historyList = $('backupHistoryList');
    const restoreDialog = $('backupRestoreDialog');
    const restoreForm = $('backupRestoreForm');
    const fileInput = $('backupFileInput');
    const validationBox = $('backupValidationBox');
    const restoreSubmit = $('backupRestoreSubmit');
    let inspected = null;
    let busy = false;

    function escapeHtml(value) {
        return String(value ?? '').replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[character]));
    }

    function showToast(icon, title, text = '') {
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

    async function downloadBackup(format = 'json.gz', trigger = downloadButton) {
        const normalizedFormat = format === 'bak' ? 'bak' : 'json.gz';
        if (!trigger || trigger.dataset.backupBusy === 'true') return;
        trigger.dataset.backupBusy = 'true';
        try {
            const endpoint = normalizedFormat === 'bak' ? '/api/backup/download?format=bak' : '/api/backup/download';
            const response = await fetch(endpoint, { method: 'GET', cache: 'no-store', headers: { Accept: normalizedFormat === 'bak' ? 'application/octet-stream' : 'application/gzip' } });
            if (!response.ok) {
                const body = await response.json().catch(() => ({}));
                throw new Error(body.error || 'تعذر إنشاء النسخة الاحتياطية.');
            }
            const blob = await response.blob();
            const objectUrl = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = objectUrl;
            link.download = getFilename(response, `TOP-GYM-backup.${normalizedFormat}`);
            link.hidden = true;
            document.body.appendChild(link);
            link.click();
            link.remove();
            window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1500);
            showToast('success', 'تم تنزيل النسخة الاحتياطية ✅', 'تم إنشاء نسخة لحظية وحفظها على جهازك فقط.');
        } catch (error) {
            showToast('error', 'تعذر تحميل النسخة الاحتياطية', error.message || 'حاول مرة أخرى.');
        } finally {
            delete trigger.dataset.backupBusy;
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
    }

    function renderInspection(data, file) {
        if (!validationBox) return;
        const tableRows = Object.entries(data.tableCounts || {})
            .filter(([, count]) => Number(count) > 0)
            .map(([name, count]) => `<tr><td>${escapeHtml(name)}</td><td>${Number(count).toLocaleString('ar-EG')}</td></tr>`)
            .join('');
        validationBox.hidden = false;
        validationBox.innerHTML = `<div class="backup-validation-success"><strong>تم التحقق من الملف ✅</strong><span>${escapeHtml(file?.name || 'النسخة')} · ${formatBytes(file?.size)} · ${Number(data.rowCount || 0).toLocaleString('ar-EG')} صف</span><small>تاريخ إنشاء النسخة: ${escapeHtml(formatDate(data.generatedAt))}</small></div><div class="backup-count-table-wrap"><table class="backup-count-table"><thead><tr><th>الجدول</th><th>الصفوف</th></tr></thead><tbody>${tableRows || '<tr><td colspan="2">لا توجد بيانات في النسخة.</td></tr>'}</tbody></table></div>`;
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
        if (restoreSubmit) { restoreSubmit.disabled = true; restoreSubmit.textContent = 'جاري الاسترجاع…'; }
        try {
            const response = await fetch('/api/backup/restore', {
                method: 'POST',
                body: file,
                headers: {
                    'Content-Type': 'application/gzip',
                    'X-TOP-GYM-RESTORE-CONFIRM': 'RESTORE',
                    'X-Backup-Filename': file.name
                }
            });
            const data = await response.json().catch(() => ({}));
            if (!response.ok) throw new Error(data.error || 'تعذر استرجاع النسخة.');
            closeDialog(restoreDialog);
            showToast('success', 'تم استرجاع النسخة بنجاح ✅', 'سيتم تحديث بيانات النظام الآن.');
            window.setTimeout(() => window.location.reload(), 1200);
        } catch (error) {
            showToast('error', 'فشل استرجاع النسخة', error.message || 'لم يتم تغيير البيانات.');
        } finally {
            busy = false;
            if (restoreSubmit) { restoreSubmit.disabled = !inspected; restoreSubmit.textContent = 'استرجاع بعد التحقق'; }
        }
    }

    const HISTORY_LABELS = { download: 'تنزيل نسخة', inspect: 'فحص نسخة', restore: 'استرجاع نسخة' };
    function renderHistory(operations) {
        const rows = (operations || []).map((item) => `<tr><td><strong>${escapeHtml(HISTORY_LABELS[item.operationType] || item.operationType)}</strong><small>${escapeHtml(item.fileName || '—')}</small></td><td>${escapeHtml(formatDate(item.createdAt))}</td><td>${Number(item.rowCount || 0).toLocaleString('ar-EG')}</td><td><span class="backup-history-status ${item.status === 'success' ? 'success' : 'error'}">${item.status === 'success' ? 'ناجحة' : 'فاشلة'}</span></td></tr>`).join('');
        return `<div class="backup-history-wrap"><table class="backup-history-table"><thead><tr><th>العملية</th><th>التاريخ</th><th>الصفوف</th><th>الحالة</th></tr></thead><tbody>${rows || '<tr><td colspan="4">لا يوجد سجل نسخ حتى الآن.</td></tr>'}</tbody></table></div>`;
    }

    function renderVisibleHistory(data = {}) {
        const archives = Array.isArray(data.archives) ? data.archives : [];
        const operations = Array.isArray(data.operations) ? data.operations : [];
        const visibleOperations = operations.slice(0, 3);
        const archiveRows = archives.map((item) => `<tr><td><strong>${escapeHtml(item.fileName || '—')}</strong><small>${escapeHtml(formatDate(item.generatedAt || item.createdAt))}</small></td><td>${escapeHtml(String(item.format || 'bak').toUpperCase())}</td><td>${Number(item.rowCount || 0).toLocaleString('ar-EG')} صف</td><td>${formatBytes(item.contentBytes)}</td><td><button type="button" class="btn btn-light btn-small backup-history-download" data-backup-archive-id="${escapeHtml(item.id)}">تحميل</button></td></tr>`).join('');
        const operationRows = visibleOperations.map((item) => `<tr><td><strong>${escapeHtml(HISTORY_LABELS[item.operationType] || item.operationType)}</strong><small>${escapeHtml(item.fileName || '—')}</small></td><td>${escapeHtml(formatDate(item.createdAt))}</td><td>${Number(item.rowCount || 0).toLocaleString('ar-EG')}</td><td><span class="backup-history-status ${item.status === 'success' ? 'success' : 'error'}">${item.status === 'success' ? 'ناجحة' : 'فاشلة'}</span></td></tr>`).join('');
        return `<div class="backup-history-block"><div class="backup-history-block-head"><strong>النسخ اليومية المحفوظة</strong><span>يوميًا 3:00 م · احتفاظ يومين</span></div><div class="backup-history-wrap"><table class="backup-history-table backup-archive-table"><thead><tr><th>الملف</th><th>الامتداد</th><th>البيانات</th><th>الحجم</th><th>الإجراء</th></tr></thead><tbody>${archiveRows || '<tr><td colspan="5">لا توجد نسخ تلقائية محفوظة حتى الآن.</td></tr>'}</tbody></table></div></div><div class="backup-history-block"><div class="backup-history-block-head"><strong>آخر 3 عمليات</strong><span>${visibleOperations.length.toLocaleString('ar-EG')} معروضة</span></div><div class="backup-history-wrap"><table class="backup-history-table backup-operations-table"><thead><tr><th>العملية</th><th>التاريخ</th><th>الصفوف</th><th>الحالة</th></tr></thead><tbody>${operationRows || '<tr><td colspan="4">لا يوجد سجل عمليات حتى الآن.</td></tr>'}</tbody></table></div></div>`;
    }

    async function downloadArchive(id, trigger) {
        if (!id || !trigger || trigger.dataset.backupBusy === 'true') return;
        trigger.dataset.backupBusy = 'true';
        try {
            const response = await fetch(`/api/backup/archives/${encodeURIComponent(id)}`, { cache: 'no-store', headers: { Accept: 'application/octet-stream' } });
            if (!response.ok) {
                const body = await response.json().catch(() => ({}));
                throw new Error(body.error || 'تعذر تحميل النسخة المحفوظة.');
            }
            const blob = await response.blob();
            const objectUrl = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = objectUrl;
            link.download = getFilename(response, `TOP-GYM-backup-${id}.bak`);
            link.hidden = true;
            document.body.appendChild(link);
            link.click();
            link.remove();
            window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1500);
            showToast('success', 'تم تحميل النسخة المحفوظة ✅');
        } catch (error) {
            showToast('error', 'تعذر تحميل النسخة المحفوظة', error.message || 'حاول مرة أخرى.');
        } finally {
            delete trigger.dataset.backupBusy;
        }
    }

    async function showHistory() {
        try {
            const response = await fetch('/api/backup/history?limit=3&archiveLimit=10', { cache: 'no-store' });
            const data = await response.json().catch(() => ({}));
            if (!response.ok) throw new Error(data.error || 'تعذر تحميل سجل النسخ.');
            if (historyList) {
                historyList.innerHTML = renderVisibleHistory(data);
                return;
            }
            if (window.Swal) {
                await window.Swal.fire({ position: 'center', title: 'سجل النسخ الاحتياطية', html: renderHistory(data.operations), confirmButtonText: 'إغلاق', buttonsStyling: false, customClass: { popup: 'top-gym-alert backup-history-alert', confirmButton: 'btn btn-primary' } });
            }
        } catch (error) {
            if (historyList) historyList.innerHTML = `<div class="backup-history-error">${escapeHtml(error.message || 'تعذر تحميل سجل النسخ.')}</div>`;
            showToast('error', 'تعذر تحميل سجل النسخ', error.message);
        }
    }

    downloadButton?.addEventListener('click', () => downloadBackup('json.gz', downloadButton));
    jsonDownloadButton?.addEventListener('click', () => downloadBackup('json.gz', jsonDownloadButton));
    bakDownloadButton?.addEventListener('click', () => downloadBackup('bak', bakDownloadButton));
    restoreButton?.addEventListener('click', () => { resetRestore(); openDialog(restoreDialog); });
    historyButton?.addEventListener('click', showHistory);
    historyRefreshButton?.addEventListener('click', showHistory);
    historyList?.addEventListener('click', (event) => {
        const button = event.target.closest('[data-backup-archive-id]');
        if (button) downloadArchive(button.dataset.backupArchiveId, button);
    });
    $('backupRestoreClose')?.addEventListener('click', () => closeDialog(restoreDialog));
    $('backupRestoreCancel')?.addEventListener('click', () => closeDialog(restoreDialog));
    fileInput?.addEventListener('change', () => inspectFile(fileInput.files?.[0]));
    restoreForm?.addEventListener('submit', restoreBackup);
    if (historyList) showHistory();
})();
