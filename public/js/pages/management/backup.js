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
    let inspectedFile = null;
    let busy = false;
    let historyData = null;
    let validationPresentation = null;

    function translate(key, params) {
        return window.TopGymI18n?.t(key, params) || key;
    }

    function formatHistoryNumber(value) {
        const locale = window.TopGymI18n?.get?.() === 'en' ? 'en-US' : 'ar-EG';
        return window.TopGymI18n?.format('number', Number(value || 0)) || Number(value || 0).toLocaleString(locale);
    }

    function formatHistoryDate(value) {
        if (!value) return '—';
        if (window.TopGymI18n?.format) return window.TopGymI18n.format('date', value, { dateStyle: 'medium', timeStyle: 'short' });
        return formatDate(value);
    }

    function setLocalizedText(element, key, params) {
        if (element) element.textContent = translate(key, params);
    }

    function applyBackupBrandDescription(section) {
        const description = section.querySelector('[data-brand-template="backupDescription"]');
        if (!description) return;
        const identity = window.topGymBranding?.get?.().identity || {};
        const brandName = String(identity.brandName || '').trim();
        const englishBrandName = String(identity.englishBrandName || '').trim();
        const hasTenantEnglishName = englishBrandName && englishBrandName.toLowerCase() !== 'logic fit';
        const brand = window.TopGymI18n?.get() === 'en'
            ? (hasTenantEnglishName ? englishBrandName : brandName || englishBrandName || 'Logic Fit')
            : (brandName || englishBrandName || 'Logic Fit');
        setLocalizedText(description, 'backupHistory.tools.description', { brand });
    }

    function applyRestoreDialogTranslations() {
        if (!restoreDialog) return;
        setLocalizedText($('backupRestoreTitle'), 'backupHistory.dialog.title');
        setLocalizedText(restoreDialog.querySelector('.details-dialog-head p'), 'backupHistory.dialog.description');
        setLocalizedText(restoreDialog.querySelector('.backup-file-field span'), 'backupHistory.dialog.file');
        setLocalizedText(restoreDialog.querySelector('.backup-reason-field span'), 'backupHistory.dialog.reason');
        setLocalizedText($('backupRestoreClose'), 'backupHistory.dialog.close');
        setLocalizedText($('backupRestoreCancel'), 'backupHistory.dialog.cancel');
        setLocalizedText(restoreSubmit, inspected ? 'backupHistory.dialog.restoreVerified' : 'backupHistory.dialog.restore');
        if (restoreReason) restoreReason.placeholder = translate('backupHistory.dialog.reasonPlaceholder');
        if (validationPresentation?.kind === 'success') renderInspection(validationPresentation.data, validationPresentation.file);
        else if (validationPresentation) renderValidationMessage(validationPresentation);
    }

    function applyBackupHistoryTranslations() {
        const section = $('backupHistorySection');
        if (!section) return;
        setLocalizedText(section.querySelector('.backup-history-page-heading .management-eyebrow'), 'backupHistory.page.kicker');
        setLocalizedText($('backupHistoryPageTitle'), 'backupHistory.page.title');
        setLocalizedText(section.querySelector('.backup-history-page-heading > p'), 'backupHistory.page.description');
        setLocalizedText(historyRefreshButton, 'backupHistory.action.refresh');
        setLocalizedText(section.querySelector('.backup-history-tools .management-eyebrow'), 'backupHistory.page.kicker');
        setLocalizedText($('backupToolsTitle'), 'backupHistory.tools.title');
        applyBackupBrandDescription(section);
        setLocalizedText(manualBackupButton, 'backupHistory.tools.create');
        setLocalizedText(jsonDownloadButton, 'backupHistory.tools.download');
        setLocalizedText(restoreButton, 'backupHistory.tools.restore');
        applyRestoreDialogTranslations();
        const loading = historyList?.querySelector('.backup-history-loading');
        setLocalizedText(loading, 'backupHistory.loading');

        if (!historyData || !historyList) return;
        const scrollTop = historyList.scrollTop;
        historyList.innerHTML = renderVisibleHistory(historyData);
        historyList.scrollTop = scrollTop;
    }

    function escapeHtml(value) {
        return String(value ?? '').replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[character]));
    }

    function renderValidationMessage(state) {
        if (!validationBox || !state) return;
        const messages = {
            tooLarge: ['error', 'backupHistory.validation.fileTooLarge'],
            inspecting: ['loading', 'backupHistory.validation.inspecting'],
            invalid: ['error', 'backupHistory.validation.invalidFile']
        };
        const [className, key] = messages[state.kind] || ['error', 'backupHistory.validation.inspectFailed'];
        const detail = state.kind === 'failed' && state.detail ? ` ${escapeHtml(state.detail)}` : '';
        validationBox.hidden = false;
        validationBox.innerHTML = `<div class="backup-validation-${className}">${escapeHtml(translate(key))}${detail}</div>`;
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
        if (Number.isNaN(date.getTime())) return String(value);
        return window.TopGymI18n?.format('date', date, { dateStyle: 'medium', timeStyle: 'short' })
            || new Intl.DateTimeFormat(window.TopGymI18n?.get?.() === 'en' ? 'en-US' : 'ar-EG', { dateStyle: 'medium', timeStyle: 'short' }).format(date);
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

    const BACKUP_ERROR_KEYS = Object.freeze({
        BACKUP_STORAGE_NOT_CONFIGURED: 'backupHistory.error.storageNotConfigured',
        BACKUP_STORAGE_UNAVAILABLE: 'backupHistory.error.storageUnavailable'
    });

    function backupErrorMessage(error, fallback) {
        if (BACKUP_ERROR_KEYS[error?.code]) return translate(BACKUP_ERROR_KEYS[error.code]);
        if (Number(error?.status) === 503) return translate('backupHistory.error.serviceUnavailable');
        return fallback || translate('backupHistory.error.generic');
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

    async function askReason(titleKey, confirmKey = 'backupHistory.confirm.confirm') {
        const title = translate(titleKey);
        if (window.Swal) {
            const result = await window.Swal.fire({
                position: 'center',
                title,
                input: 'textarea',
                inputLabel: translate('backupHistory.dialog.operationReason'),
                inputPlaceholder: translate('backupHistory.dialog.operationReasonPlaceholder'),
                inputAttributes: { maxlength: 1000, 'aria-label': translate('backupHistory.dialog.operationReason') },
                showCancelButton: true,
                confirmButtonText: translate(confirmKey),
                cancelButtonText: translate('backupHistory.dialog.cancel'),
                buttonsStyling: false,
                customClass: { popup: 'top-gym-alert backup-reason-alert', confirmButton: 'btn btn-primary', cancelButton: 'btn btn-light' },
                inputValidator: (value) => String(value || '').trim() ? undefined : translate('backupHistory.dialog.reasonRequired')
            });
            return result.isConfirmed ? String(result.value || '').trim().slice(0, 1000) : null;
        }
        const value = window.prompt(`${title}\n${translate('backupHistory.dialog.operationReason')}:`);
        return value ? value.trim().slice(0, 1000) : null;
    }

    async function createManualBackup() {
        if (!manualBackupButton || manualBackupButton.dataset.backupBusy === 'true') return;
        const reason = await askReason('backupHistory.confirm.createTitle', 'backupHistory.confirm.create');
        if (!reason) return;
        manualBackupButton.dataset.backupBusy = 'true';
        const originalText = manualBackupButton.textContent;
        setActionLoading(manualBackupButton, true, translate('backupHistory.action.creating'));
        try {
            const response = await fetch('/api/backup/records', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
                body: JSON.stringify({ format: 'json.gz', reason })
            });
            const data = await readJsonResponse(response, translate('backupHistory.error.createFailed'));
            showToast('success', translate(data.idempotent ? 'backupHistory.message.alreadyCreated' : 'backupHistory.message.created'));
            await showHistory();
        } catch (error) {
            showToast('error', translate('backupHistory.error.createFailed'), backupErrorMessage(error, translate('backupHistory.error.retry')));
        } finally {
            delete manualBackupButton.dataset.backupBusy;
            if (window.topGymFeedback) setActionLoading(manualBackupButton, false);
            else { manualBackupButton.disabled = false; manualBackupButton.textContent = originalText; }
        }
    }

    async function downloadBackup(trigger) {
        if (!trigger || trigger.dataset.backupBusy === 'true') return;
        trigger.dataset.backupBusy = 'true';
        setActionLoading(trigger, true, translate('backupHistory.action.preparingDownload'));
        try {
            const response = await fetch('/api/backup/download', { method: 'GET', cache: 'no-store', headers: { Accept: 'application/gzip' } });
            if (!response.ok) {
                const body = await response.json().catch(() => ({}));
                const error = new Error(body.error || translate('backupHistory.error.downloadFailed'));
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
            showToast('success', translate('backupHistory.message.downloaded'), translate('backupHistory.message.localCopy'));
        } catch (error) {
            showToast('error', translate('backupHistory.error.downloadFailed'), backupErrorMessage(error, translate('backupHistory.error.retry')));
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

    function resetInspectionState() {
        inspected = null;
        inspectedFile = null;
        validationPresentation = null;
        if (validationBox) {
            validationBox.hidden = true;
            validationBox.innerHTML = '';
        }
        if (restoreSubmit) restoreSubmit.disabled = true;
    }

    function resetRestore() {
        if (restoreForm) restoreForm.reset();
        resetInspectionState();
        if (restoreReason) restoreReason.value = '';
    }

    function renderInspection(data, file) {
        if (!validationBox) return;
        validationPresentation = { kind: 'success', data, file };
        const tableRows = Object.entries(data.tableCounts || {})
            .filter(([, count]) => Number(count) > 0)
            .map(([name, count]) => `<tr><td>${escapeHtml(name)}</td><td>${escapeHtml(formatHistoryNumber(count))}</td></tr>`)
            .join('');
        const integrityText = data.integrity?.verified
            ? translate('backupHistory.validation.integrityVerified')
            : translate('backupHistory.validation.legacyIntegrity');
        validationBox.hidden = false;
        validationBox.innerHTML = `<div class="backup-validation-success"><strong>${escapeHtml(translate('backupHistory.validation.fileVerified'))}</strong><span>${escapeHtml(file?.name || translate('backupHistory.validation.backupLabel'))} · ${formatBytes(file?.size)} · ${escapeHtml(translate('backupHistory.validation.rows', { count: formatHistoryNumber(data.rowCount) }))}</span><small>${escapeHtml(translate('backupHistory.validation.createdAt'))} ${escapeHtml(formatDate(data.generatedAt))}</small><small>${escapeHtml(integrityText)}</small></div><div class="backup-count-table-wrap"><table class="backup-count-table"><thead><tr><th>${escapeHtml(translate('backupHistory.validation.table'))}</th><th>${escapeHtml(translate('backupHistory.validation.rowCount'))}</th></tr></thead><tbody>${tableRows || `<tr><td colspan="2">${escapeHtml(translate('backupHistory.validation.noData'))}</td></tr>`}</tbody></table></div>`;
    }

    async function inspectFile(file) {
        resetInspectionState();
        if (!file) return;
        inspectedFile = file;
        if (file.size > 25 * 1024 * 1024) {
            validationPresentation = { kind: 'tooLarge' };
            renderValidationMessage(validationPresentation);
            return;
        }
        validationPresentation = { kind: 'inspecting' };
        renderValidationMessage(validationPresentation);
        try {
            const response = await fetch('/api/backup/inspect', { method: 'POST', body: file, headers: { 'Content-Type': 'application/gzip', 'X-Backup-Filename': file.name } });
            const data = await response.json().catch(() => ({}));
            if (!response.ok || !data.valid) {
                const error = new Error(data.error || translate('backupHistory.validation.invalidFile'));
                error.backupInvalid = true;
                throw error;
            }
            inspected = data;
            renderInspection(data, file);
            if (restoreSubmit) restoreSubmit.disabled = false;
        } catch (error) {
            validationPresentation = error.backupInvalid ? { kind: 'invalid' } : { kind: 'failed', detail: error.message };
            renderValidationMessage(validationPresentation);
        }
    }

    async function restoreBackup(event) {
        event.preventDefault();
        const file = fileInput?.files?.[0];
        if (!file || !inspected || busy) return;
        const reason = String(restoreReason?.value || '').trim();
        if (!reason) {
            showToast('warning', translate('backupHistory.dialog.reasonRequired'), translate('backupHistory.dialog.operationReasonPlaceholder'));
            restoreReason?.focus();
            return;
        }
        let confirmation = { isConfirmed: true };
        if (window.Swal) {
            confirmation = await window.Swal.fire({
                position: 'center',
                icon: 'warning',
                title: translate('backupHistory.confirm.restoreTitle'),
                html: `<p>${escapeHtml(translate('backupHistory.confirm.restoreBody'))}</p><strong>${escapeHtml(translate('backupHistory.confirm.restoreWarning'))}</strong>`,
                showCancelButton: true,
                confirmButtonText: translate('backupHistory.confirm.restoreNow'),
                cancelButtonText: translate('backupHistory.dialog.cancel'),
                buttonsStyling: false,
                customClass: { popup: 'top-gym-alert backup-restore-confirm', confirmButton: 'btn btn-danger', cancelButton: 'btn btn-light' }
            });
        }
        if (!confirmation.isConfirmed) return;
        busy = true;
        const originalRestoreText = restoreSubmit?.textContent || translate('backupHistory.dialog.restoreVerified');
        setActionLoading(restoreSubmit, true, translate('backupHistory.action.restoring'));
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
            await readJsonResponse(response, translate('backupHistory.error.restoreFailed'));
            closeDialog(restoreDialog);
            showToast('success', translate('backupHistory.message.restored'), translate('backupHistory.message.reload'));
            window.setTimeout(() => window.location.reload(), 1200);
        } catch (error) {
            showToast('error', translate('backupHistory.error.restoreFailed'), backupErrorMessage(error, translate('backupHistory.error.noChange')));
        } finally {
            busy = false;
            if (window.topGymFeedback) {
                setActionLoading(restoreSubmit, false);
                if (restoreSubmit) restoreSubmit.disabled = !inspected;
            } else if (restoreSubmit) { restoreSubmit.disabled = !inspected; restoreSubmit.textContent = originalRestoreText; }
        }
    }

    function renderHistory(operations) {
        const operationKeys = { download: 'backupHistory.operation.download', inspect: 'backupHistory.operation.inspect', restore: 'backupHistory.operation.restore' };
        const rows = (operations || []).map((item) => {
            const operationKey = operationKeys[item.operationType];
            const operation = operationKey ? translate(operationKey) : translate('backupHistory.event.unknown');
            const statusKey = item.status === 'success' ? 'backupHistory.status.success' : 'backupHistory.status.failed';
            return `<tr><td><strong>${escapeHtml(operation)}</strong><small>${escapeHtml(item.fileName || '—')}</small></td><td>${escapeHtml(formatHistoryDate(item.createdAt))}</td><td>${formatHistoryNumber(item.rowCount)}</td><td><span class="backup-history-status ${item.status === 'success' ? 'success' : 'error'}">${escapeHtml(translate(statusKey))}</span></td></tr>`;
        }).join('');
        return `<div class="backup-history-wrap"><table class="backup-history-table"><thead><tr><th>${escapeHtml(translate('backupHistory.column.operation'))}</th><th>${escapeHtml(translate('backupHistory.column.date'))}</th><th>${escapeHtml(translate('backupHistory.column.data'))}</th><th>${escapeHtml(translate('backupHistory.column.status'))}</th></tr></thead><tbody>${rows || `<tr><td colspan="4">${escapeHtml(translate('backupHistory.empty.operations'))}</td></tr>`}</tbody></table></div>`;
    }

    function recoveryStatusLabel(value) {
        const key = ({ PENDING: 'pending', RUNNING: 'running', UPLOADED: 'uploaded', VERIFYING: 'verifying', VERIFIED: 'verified', FAILED: 'failed', EXPIRED: 'expired', DELETED: 'deleted', SUCCESS: 'success' })[String(value || '').toUpperCase()];
        return key ? translate(`backupHistory.status.${key}`) : translate('backupHistory.status.unknown');
    }

    function recoveryStatusMarkup(value) {
        const status = String(value || '').toLowerCase();
        const className = ['pending', 'running', 'uploaded', 'verifying', 'verified', 'failed', 'expired', 'deleted'].includes(status) ? status : '';
        return `<span class="backup-history-status ${className}">${escapeHtml(recoveryStatusLabel(value))}</span>`;
    }

    function recoveryTypeLabel(value) {
        const key = ({ tenant_daily: 'tenantDaily', tenant_manual: 'tenantManual', tenant_pre_restore: 'tenantPreRestore' })[String(value || '').toLowerCase()];
        return key ? translate(`backupHistory.type.${key}`) : translate('backupHistory.type.unknown');
    }

    function auditEventLabel(value) {
        const key = ({ BACKUP_CREATED: 'created', BACKUP_VERIFIED: 'verified', BACKUP_DOWNLOADED: 'downloaded', BACKUP_DELETED: 'deleted', RESTORE_REQUESTED: 'restoreRequested', RESTORE_STARTED: 'restoreStarted', RESTORE_COMPLETED: 'restoreCompleted', RESTORE_FAILED: 'restoreFailed' })[String(value || '').toUpperCase()];
        return key ? translate(`backupHistory.event.${key}`) : translate('backupHistory.event.unknown');
    }

    function renderVisibleHistory(data = {}) {
        const records = Array.isArray(data.records) ? data.records : (Array.isArray(data.archives) ? data.archives : []);
        const audit = Array.isArray(data.audit) ? data.audit : (Array.isArray(data.operations) ? data.operations : []);
        const retentionDays = Number(data.retention?.tenant_daily || 30);
        const rows = records.map((item) => {
            const status = String(item.status || '').toUpperCase();
            const id = escapeHtml(item.id);
            const actions = status === 'VERIFIED'
                ? `<button type="button" class="btn btn-light btn-small backup-history-download" data-backup-record-id="${id}">${escapeHtml(translate('backupHistory.action.download'))}</button><button type="button" class="btn btn-light btn-small backup-history-restore" data-backup-record-restore-id="${id}">${escapeHtml(translate('backupHistory.action.restore'))}</button>`
                : '';
            const canDelete = !['RUNNING', 'UPLOADED', 'VERIFYING', 'DELETED'].includes(status);
            return `<tr><td><strong>${escapeHtml(item.fileName || '—')}</strong><small>${escapeHtml(formatHistoryDate(item.createdAt || item.generatedAt))}</small></td><td>${escapeHtml(recoveryTypeLabel(item.backupType || item.format))}</td><td>${recoveryStatusMarkup(status)}</td><td>${escapeHtml(translate('backupHistory.rows.count', { count: formatHistoryNumber(item.rowCount) }))}</td><td>${formatBytes(item.sizeBytes ?? item.contentBytes)}</td><td>${escapeHtml(formatHistoryDate(item.verifiedAt))}</td><td><div class="backup-history-actions">${actions}${canDelete ? `<button type="button" class="btn btn-danger btn-small backup-history-delete" data-backup-record-delete-id="${id}">${escapeHtml(translate('backupHistory.action.delete'))}</button>` : ''}${actions || canDelete ? '' : '—'}</div></td></tr>`;
        }).join('');
        const auditRows = audit.slice(0, 8).map((item) => `<tr><td>${escapeHtml(formatHistoryDate(item.createdAt))}</td><td>${escapeHtml(auditEventLabel(item.eventType || item.operationType))}</td><td>${recoveryStatusMarkup(item.result === 'success' ? 'VERIFIED' : item.result)}</td><td>${escapeHtml(item.reason || item.fileName || '—')}</td></tr>`).join('');
        const storageNotice = data.storage && data.storage.configured !== true
            ? `<div class="backup-storage-warning" role="status"><strong>${escapeHtml(translate('backupHistory.storage.title'))}</strong><p>${escapeHtml(translate('backupHistory.storage.description'))}</p></div>`
            : '';
        const columns = (keys) => keys.map((key) => `<th>${escapeHtml(translate(key))}</th>`).join('');
        const archiveColumns = columns(['backupHistory.column.file', 'backupHistory.column.type', 'backupHistory.column.status', 'backupHistory.column.data', 'backupHistory.column.size', 'backupHistory.column.verifiedAt', 'backupHistory.column.actions']);
        const auditColumns = columns(['backupHistory.column.date', 'backupHistory.column.operation', 'backupHistory.column.result', 'backupHistory.column.reason']);
        const archiveEmpty = `<tr><td colspan="7">${escapeHtml(translate('backupHistory.empty.archives'))}</td></tr>`;
        const auditEmpty = `<tr><td colspan="4">${escapeHtml(translate('backupHistory.empty.audit'))}</td></tr>`;
        return `${storageNotice}<div class="backup-history-block"><div class="backup-history-block-head"><strong>${escapeHtml(translate('backupHistory.section.archives'))}</strong><span>${escapeHtml(translate('backupHistory.section.retention', { count: formatHistoryNumber(retentionDays) }))}</span></div><div class="backup-history-wrap"><table class="backup-history-table backup-archive-table"><thead><tr>${archiveColumns}</tr></thead><tbody>${rows || archiveEmpty}</tbody></table></div></div><div class="backup-history-block"><div class="backup-history-block-head"><strong>${escapeHtml(translate('backupHistory.section.audit'))}</strong><span>${escapeHtml(translate('backupHistory.audit.count', { count: formatHistoryNumber(audit.slice(0, 8).length) }))}</span></div><div class="backup-history-wrap"><table class="backup-history-table backup-operations-table"><thead><tr>${auditColumns}</tr></thead><tbody>${auditRows || auditEmpty}</tbody></table></div></div>`;
    }

    async function downloadArchive(id, trigger) {
        if (!id || !trigger || trigger.dataset.backupBusy === 'true') return;
        trigger.dataset.backupBusy = 'true';
        try {
            const response = await fetch(`/api/backup/records/${encodeURIComponent(id)}/download`, { cache: 'no-store', headers: { Accept: 'application/octet-stream' } });
            if (!response.ok) {
                const body = await response.json().catch(() => ({}));
                throw new Error(body.error || translate('backupHistory.error.downloadFailed'));
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
            showToast('success', translate('backupHistory.message.downloaded'));
        } catch (error) {
            showToast('error', translate('backupHistory.error.downloadFailed'), backupErrorMessage(error, translate('backupHistory.error.retry')));
        } finally {
            delete trigger.dataset.backupBusy;
        }
    }

    async function restoreStoredRecord(id, trigger) {
        if (!id || !trigger || trigger.dataset.backupBusy === 'true') return;
        const reason = await askReason('backupHistory.confirm.restoreTitle', 'backupHistory.confirm.restoreContinue');
        if (!reason) return;
        if (window.Swal) {
            const confirmation = await window.Swal.fire({
                position: 'center',
                icon: 'warning',
                title: translate('backupHistory.confirm.restoreTitle'),
                text: translate('backupHistory.confirm.restoreBody'),
                showCancelButton: true,
                confirmButtonText: translate('backupHistory.confirm.restoreContinue'),
                cancelButtonText: translate('backupHistory.dialog.cancel'),
                buttonsStyling: false,
                customClass: { popup: 'top-gym-alert backup-restore-confirm', confirmButton: 'btn btn-danger', cancelButton: 'btn btn-light' }
            });
            if (!confirmation.isConfirmed) return;
        }
        trigger.dataset.backupBusy = 'true';
        setActionLoading(trigger, true, translate('backupHistory.action.restoring'));
        try {
            const response = await fetch(`/api/backup/records/${encodeURIComponent(id)}/restore`, { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'X-TOP-GYM-RESTORE-CONFIRM': 'RESTORE' }, body: JSON.stringify({ reason }) });
            await readJsonResponse(response, translate('backupHistory.error.restoreFailed'));
            showToast('success', translate('backupHistory.message.restored'));
            window.setTimeout(() => window.location.reload(), 1200);
        } catch (error) {
            showToast('error', translate('backupHistory.error.restoreFailed'), backupErrorMessage(error, translate('backupHistory.error.noChange')));
        } finally { delete trigger.dataset.backupBusy; setActionLoading(trigger, false); }
    }

    async function deleteArchive(id, trigger) {
        if (!id || !trigger || trigger.dataset.backupBusy === 'true') return;
        const reason = await askReason('backupHistory.confirm.deleteTitle', 'backupHistory.confirm.delete');
        if (!reason) return;
        if (window.Swal) {
            const result = await window.Swal.fire({
                position: 'center',
                icon: 'warning',
                title: translate('backupHistory.confirm.deleteTitle'),
                text: translate('backupHistory.confirm.deleteBody'),
                showCancelButton: true,
                confirmButtonText: translate('backupHistory.confirm.delete'),
                cancelButtonText: translate('backupHistory.dialog.cancel'),
                buttonsStyling: false,
                customClass: { popup: 'top-gym-alert delete-confirm-alert', confirmButton: 'btn btn-danger', cancelButton: 'btn btn-light' }
            });
            if (!result.isConfirmed) return;
        } else if (!window.confirm(translate('backupHistory.confirm.deleteFallback'))) return;
        trigger.dataset.backupBusy = 'true';
        setActionLoading(trigger, true, translate('backupHistory.action.deleting'));
        try {
            const response = await fetch(`/api/backup/records/${encodeURIComponent(id)}`, { method: 'DELETE', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify({ reason }) });
            await readJsonResponse(response, translate('backupHistory.error.deleteFailed'));
            showToast('success', translate('backupHistory.message.deleted'));
            await showHistory();
        } catch (error) {
            showToast('error', translate('backupHistory.error.deleteFailed'), backupErrorMessage(error, translate('backupHistory.error.retry')));
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
                const error = new Error(data.error || translate('backupHistory.error.load'));
                error.code = data.code;
                error.status = response.status;
                throw error;
            }
            if (manualBackupButton && data.storage) {
                const storageConfigured = data.storage.configured === true;
                manualBackupButton.disabled = !storageConfigured;
                manualBackupButton.title = storageConfigured
                    ? ''
                    : translate('backupHistory.storage.unavailable');
                manualBackupButton.setAttribute('aria-disabled', String(!storageConfigured));
            }
            if (historyList) {
                historyData = data;
                historyList.innerHTML = renderVisibleHistory(data);
                return;
            }
            if (window.Swal) {
                await window.Swal.fire({ position: 'center', title: translate('backupHistory.page.title'), html: renderHistory(data.operations), confirmButtonText: translate('backupHistory.confirm.close'), buttonsStyling: false, customClass: { popup: 'top-gym-alert backup-history-alert', confirmButton: 'btn btn-primary' } });
            }
        } catch (error) {
            if (historyList) historyList.innerHTML = `<div class="backup-history-error">${escapeHtml(backupErrorMessage(error, translate('backupHistory.error.load')))}</div>`;
            showToast('error', translate('backupHistory.error.loadTitle'), backupErrorMessage(error, translate('backupHistory.error.retry')));
        }
    }

    manualBackupButton?.addEventListener('click', createManualBackup);
    jsonDownloadButton?.addEventListener('click', () => downloadBackup(jsonDownloadButton));
    restoreButton?.addEventListener('click', () => { resetRestore(); openDialog(restoreDialog); });
    historyRefreshButton?.addEventListener('click', async () => {
        setActionLoading(historyRefreshButton, true, translate('backupHistory.action.refreshLoading'));
        try { await showHistory(); } finally { setActionLoading(historyRefreshButton, false); }
    });
    window.addEventListener('topgym:localechange', applyBackupHistoryTranslations);
    window.addEventListener('topgym:brandingchange', () => applyBackupBrandDescription($('backupHistorySection')));
    applyBackupHistoryTranslations();
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
