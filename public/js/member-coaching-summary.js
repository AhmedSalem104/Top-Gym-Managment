'use strict';

/*
 * Lightweight coaching information for the member details dialog.
 * The full coaching module is deliberately loaded only when an action is
 * requested. Viewing a member must not download the 200KB+ coaching bundle.
 */
(() => {
    if (window.__topGymMemberCoachingSummaryLoaded) return;
    window.__topGymMemberCoachingSummaryLoaded = true;

    const cache = new Map();
    const number = (value) => Number.isFinite(Number(value)) ? Number(value) : 0;
    const escapeHtml = (value) => String(value ?? '').replace(/[&<>'"]/g, (character) => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
    }[character]));
    const statusLabels = {
        draft: 'مسودة', active: 'نشطة', paused: 'متوقفة', completed: 'مكتملة', archived: 'مؤرشفة'
    };
    const icon = '<svg class="ui-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 8v8M18 8v8M3 11h18M8 5h8v14H8z"/></svg>';

    function action(actionName, label, memberId, className = 'btn btn-light btn-small', entityId = '') {
        const entityAttribute = entityId ? ` data-id="${entityId}"` : '';
        return `<button class="${className}" type="button" data-member-coaching-action="${actionName}" data-member-id="${memberId}"${entityAttribute} aria-label="${label}" title="${label}">${label}</button>`;
    }

    function systemActions(type, memberId, entityId) {
        return `<div class="member-training-system-actions">${action(`edit-${type}`, 'تعديل', memberId, 'btn btn-light btn-small', entityId)}${action(`print-${type}`, 'طباعة', memberId, 'btn btn-light btn-small', entityId)}${action(`pdf-${type}`, 'PDF', memberId, 'btn btn-light btn-small', entityId)}${action(`delete-${type}`, 'حذف', memberId, 'btn btn-danger btn-small', entityId)}</div>`;
    }

    function renderPanel(memberId, data) {
        const content = document.getElementById('detailsContent');
        if (!content || !document.getElementById('detailsDialog')?.open) return;
        const panel = content.querySelector('[data-member-training-panel]') || document.createElement('section');
        panel.className = 'member-training-panel member-training-panel-summary';
        panel.dataset.memberTrainingPanel = 'true';
        const workouts = data.workoutPrograms || [];
        const diets = data.dietPlans || [];
        const systems = [
            ...workouts.map((item) => `<div class="member-training-system"><span class="system-type workout">${icon} تدريب</span><strong>${escapeHtml(item.name)}</strong><small>${number(item.exerciseCount)} تمرين · ${escapeHtml(statusLabels[item.status] || item.status || 'غير محددة')}</small>${systemActions('workout', memberId, item.id)}</div>`),
            ...diets.map((item) => `<div class="member-training-system"><span class="system-type diet">${icon} تغذية</span><strong>${escapeHtml(item.name)}</strong><small>${number(item.itemCount)} طعام · ${escapeHtml(statusLabels[item.status] || item.status || 'غير محددة')}</small>${systemActions('diet', memberId, item.id)}</div>`)
        ].join('');
        panel.innerHTML = `<div class="member-training-head"><div><span>امتداد ملف العميل</span><h4>التدريب والتغذية</h4><small>ملخص سريع، وتُحمّل أدوات الإدارة الكاملة عند طلبها فقط.</small></div><div class="member-training-actions">${action('profile', 'فتح المتابعة', memberId)}${action('new-workout', '+ تدريب', memberId, 'btn btn-primary btn-small')}${action('new-diet', '+ تغذية', memberId)}</div></div><div class="member-training-systems">${systems || '<div class="profile-empty">لا توجد أنظمة مرتبطة بهذا العميل حتى الآن.</div>'}</div><div class="member-progress-line"><span>القياسات: <b>${number(data.measurementCount)}</b></span><span>الجلسات المكتملة: <b>${number(data.completedSessions)}</b></span><span>تسجيلات الوجبات: <b>${number(data.mealLogCount)}</b></span></div>`;
        if (!panel.isConnected) content.appendChild(panel);
    }

    async function loadSummary(memberId, force = false) {
        const key = String(memberId);
        const cached = cache.get(key);
        if (!force && cached && Date.now() - cached.loadedAt < 30_000) {
            renderPanel(memberId, cached.data);
            return cached.data;
        }
        const content = document.getElementById('detailsContent');
        if (!content || !document.getElementById('detailsDialog')?.open) return null;
        const panel = content.querySelector('[data-member-training-panel]') || document.createElement('section');
        panel.className = 'member-training-panel member-training-panel-summary';
        panel.dataset.memberTrainingPanel = 'true';
        panel.innerHTML = '<div class="loading">جاري تحميل ملخص التدريب والتغذية…</div>';
        if (!panel.isConnected) content.appendChild(panel);
        try {
            const data = await window.topGymApi.request(`/api/clients/${encodeURIComponent(key)}/coaching-summary`);
            cache.set(key, { data, loadedAt: Date.now() });
            renderPanel(memberId, data);
            return data;
        } catch (error) {
            panel.innerHTML = `<div class="coaching-empty error"><strong>تعذر تحميل ملخص التدريب والتغذية</strong><span>${escapeHtml(error.message)}</span><button class="btn btn-light btn-small" type="button" data-member-coaching-retry="${escapeHtml(key)}">إعادة المحاولة</button></div>`;
            return null;
        }
    }

    window.addEventListener('topgym:member-details-opened', (event) => {
        const detail = event.detail || {};
        const memberId = detail.member?.id || detail.details?.member?.id;
        if (memberId) void loadSummary(memberId);
    });

    document.addEventListener('click', (event) => {
        const button = event.target.closest('[data-member-coaching-retry]');
        if (button) void loadSummary(button.dataset.memberCoachingRetry, true);
    });

    window.topGymMemberCoachingSummaryRefresh = (memberId) => loadSummary(memberId, true);
})();
