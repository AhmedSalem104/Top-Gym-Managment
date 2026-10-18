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
    const translate = (key, params = {}) => window.TopGymI18n?.t?.(`members.details.coaching.${key}`, params) || key;
    const escapeHtml = (value) => String(value ?? '').replace(/[&<>'"]/g, (character) => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
    }[character]));
    const statusLabels = { draft: 'draft', active: 'active', paused: 'paused', completed: 'completed', archived: 'archived' };
    const statusLabel = (status) => {
        const key = statusLabels[String(status || '').toLowerCase()];
        return key ? translate(`status.${key}`) : translate('status.unknown');
    };
    const icon = '<svg class="ui-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 8v8M18 8v8M3 11h18M8 5h8v14H8z"/></svg>';

    function action(actionName, label, memberId, className = 'btn btn-light btn-small', entityId = '') {
        const entityAttribute = entityId ? ` data-id="${entityId}"` : '';
        const safeLabel = escapeHtml(label);
        return `<button class="${className}" type="button" data-member-coaching-action="${actionName}" data-member-id="${memberId}"${entityAttribute} aria-label="${safeLabel}" title="${safeLabel}">${safeLabel}</button>`;
    }

    function systemActions(type, memberId, entityId) {
        return `<div class="member-training-system-actions">${action(`edit-${type}`, translate('action.edit'), memberId, 'btn btn-light btn-small', entityId)}${action(`print-${type}`, translate('action.print'), memberId, 'btn btn-light btn-small', entityId)}${action(`pdf-${type}`, translate('action.pdf'), memberId, 'btn btn-light btn-small', entityId)}${action(`delete-${type}`, translate('action.delete'), memberId, 'btn btn-danger btn-small', entityId)}</div>`;
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
            ...workouts.map((item) => `<div class="member-training-system"><span class="system-type workout">${icon} ${escapeHtml(translate('type.workout'))}</span><strong>${escapeHtml(item.name)}</strong><small>${escapeHtml(translate('meta.workout', { count: number(item.exerciseCount), status: statusLabel(item.status) }))}</small>${systemActions('workout', memberId, item.id)}</div>`),
            ...diets.map((item) => `<div class="member-training-system"><span class="system-type diet">${icon} ${escapeHtml(translate('type.diet'))}</span><strong>${escapeHtml(item.name)}</strong><small>${escapeHtml(translate('meta.diet', { count: number(item.itemCount), status: statusLabel(item.status) }))}</small>${systemActions('diet', memberId, item.id)}</div>`)
        ].join('');
        panel.setAttribute('aria-label', translate('title'));
        panel.innerHTML = `<div class="member-training-head"><div><span>${escapeHtml(translate('eyebrow'))}</span><h4>${escapeHtml(translate('title'))}</h4><small>${escapeHtml(translate('description'))}</small></div><div class="member-training-actions">${action('profile', translate('action.profile'), memberId)}${action('new-workout', translate('action.newWorkout'), memberId, 'btn btn-primary btn-small')}${action('new-diet', translate('action.newDiet'), memberId)}</div></div><div class="member-training-systems">${systems || `<div class="profile-empty">${escapeHtml(translate('empty'))}</div>`}</div><div class="member-progress-line"><span>${escapeHtml(translate('measurementCount'))}<b>${number(data.measurementCount)}</b></span><span>${escapeHtml(translate('completedSessions'))}<b>${number(data.completedSessions)}</b></span><span>${escapeHtml(translate('mealLogCount'))}<b>${number(data.mealLogCount)}</b></span></div>`;
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
        panel.innerHTML = `<div class="loading">${escapeHtml(translate('loading'))}</div>`;
        if (!panel.isConnected) content.appendChild(panel);
        try {
            const data = await window.topGymApi.request(`/api/clients/${encodeURIComponent(key)}/coaching-summary`);
            cache.set(key, { data, loadedAt: Date.now() });
            renderPanel(memberId, data);
            return data;
        } catch (error) {
            panel.innerHTML = `<div class="coaching-empty error"><strong>${escapeHtml(translate('error'))}</strong><span>${escapeHtml(error.message)}</span><button class="btn btn-light btn-small" type="button" data-member-coaching-retry="${escapeHtml(key)}">${escapeHtml(translate('retry'))}</button></div>`;
            return null;
        }
    }

    window.addEventListener('topgym:member-details-opened', (event) => {
        const detail = event.detail || {};
        const memberId = detail.member?.id || detail.details?.member?.id;
        if (memberId) void loadSummary(memberId);
    });

    window.addEventListener('topgym:localechange', () => {
        const memberId = document.getElementById('detailsDialog')?.dataset.memberId;
        const cached = memberId ? cache.get(String(memberId)) : null;
        if (cached && document.getElementById('detailsDialog')?.open) renderPanel(memberId, cached.data);
    });

    document.addEventListener('click', (event) => {
        const button = event.target.closest('[data-member-coaching-retry]');
        if (button) void loadSummary(button.dataset.memberCoachingRetry, true);
    });

    window.topGymMemberCoachingSummaryRefresh = (memberId) => loadSummary(memberId, true);
})();
