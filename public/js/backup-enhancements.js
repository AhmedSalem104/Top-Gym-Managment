(() => {
    const button = document.getElementById('backupButton');
    if (!button) return;

    function showBackupToast(icon, title, text = '') {
        if (!window.Swal) return;
        window.Swal.fire({
            toast: true,
            position: 'top-start',
            icon,
            title,
            text,
            showConfirmButton: false,
            timer: 3400,
            timerProgressBar: true,
            customClass: {
                popup: 'top-gym-alert top-gym-toast'
            }
        });
    }

    function getFilename(response) {
        const contentDisposition = response.headers.get('Content-Disposition') || '';
        const match = contentDisposition.match(/filename="([^"]+)"/i);
        return match?.[1] || 'TOP-GYM-backup.json.gz';
    }

    async function downloadBackup() {
        if (button.dataset.backupBusy === 'true') return;
        button.dataset.backupBusy = 'true';

        try {
            const response = await fetch('/api/backup/download', {
                method: 'GET',
                cache: 'no-store',
                headers: { Accept: 'application/gzip' }
            });

            if (!response.ok) {
                const errorBody = await response.json().catch(() => ({}));
                throw new Error(errorBody.error || 'تعذر إنشاء النسخة الاحتياطية.');
            }

            const blob = await response.blob();
            const objectUrl = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = objectUrl;
            link.download = getFilename(response);
            link.style.display = 'none';
            document.body.appendChild(link);
            link.click();
            link.remove();
            window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1500);

            showBackupToast(
                'success',
                'تم تحميل النسخة الاحتياطية ✅',
                'تم إنشاء نسخة لحظية وحفظها على جهازك بدون الاحتفاظ بها على السيرفر.'
            );
        } catch (error) {
            showBackupToast(
                'error',
                'تعذر تحميل النسخة الاحتياطية',
                error.message || 'حاول مرة أخرى.'
            );
        } finally {
            delete button.dataset.backupBusy;
        }
    }

    button.addEventListener('click', downloadBackup);
})();
