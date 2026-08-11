(() => {
    if (window.__topGymBackupEnhancementsLoaded) return;
    window.__topGymBackupEnhancementsLoaded = true;

    const $ = (id) => document.getElementById(id);
    const downloadButton = $('backupButton');
    const restoreButton = $('restoreBackupButton');
    const historyButton = $('backupHistoryButton');
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

    function getFilename(response) {
        const disposition = response.headers.get('Content-Disposition') || '';
        const match = disposition.match(/filename="([^"]+)"/i);
        return match?.[1] || 'TOP-GYM-backup.json.gz';
    }

    async function downloadBackup() {
        if (!downloadButton || downloadButton.dataset.backupBusy === 'true') return;
        downloadButton.dataset.backupBusy = 'true';
        try {
            const response = await fetch('/api/backup/download', { method: 'GET', cache: 'no-store', headers: { Accept: 'application/gzip' } });
            if (!response.ok) {
                const body = await response.json().catch(() => ({}));
                throw new Error(body.error || 'تعذر إنشاء النسخة الاحتياطية.');
            }
            const blob = await response.blob();
            const objectUrl = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = objectUrl;
            link.download = getFilename(response);
            link.hidden = true;
            document.body.appendChild(link);
            link.click();
            link.remove();
            window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1500);
            showToast('success', 'تم تنزيل النسخة الاحتياطية ✅', 'تم إنشاء نسخة لحظية وحفظها على جهازك فقط.');
        } catch (error) {
            showToast('error', 'تعذر تحميل النسخة الاحتياطية', error.message || 'حاول مرة أخرى.');
        } finally {
            delete downloadButton.dataset.backupBusy;
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

    async function showHistory() {
        try {
            const response = await fetch('/api/backup/history?limit=30', { cache: 'no-store' });
            const data = await response.json().catch(() => ({}));
            if (!response.ok) throw new Error(data.error || 'تعذر تحميل سجل النسخ.');
            if (window.Swal) {
                await window.Swal.fire({ position: 'center', title: 'سجل النسخ الاحتياطية', html: renderHistory(data.operations), confirmButtonText: 'إغلاق', buttonsStyling: false, customClass: { popup: 'top-gym-alert backup-history-alert', confirmButton: 'btn btn-primary' } });
            }
        } catch (error) { showToast('error', 'تعذر تحميل سجل النسخ', error.message); }
    }

    downloadButton?.addEventListener('click', downloadBackup);
    restoreButton?.addEventListener('click', () => { resetRestore(); openDialog(restoreDialog); });
    historyButton?.addEventListener('click', showHistory);
    $('backupRestoreClose')?.addEventListener('click', () => closeDialog(restoreDialog));
    $('backupRestoreCancel')?.addEventListener('click', () => closeDialog(restoreDialog));
    fileInput?.addEventListener('change', () => inspectFile(fileInput.files?.[0]));
    restoreForm?.addEventListener('submit', restoreBackup);
})();
