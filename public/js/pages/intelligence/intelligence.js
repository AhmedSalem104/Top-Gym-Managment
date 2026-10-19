(() => {
    if (window.__topGymIntelligenceLoaded) return;
    window.__topGymIntelligenceLoaded = true;

    const $ = (id) => document.getElementById(id);
    const api = window.topGymApi;
    const t = (key, params) => window.TopGymI18n?.t?.(`intelligenceScreen.${key}`, params) || key;
    const locale = () => window.TopGymI18n?.get?.() || 'ar';
    const formatNumber = (value, digits = 0) => window.TopGymI18n?.format?.('number', value, { maximumFractionDigits: digits })
        || (Number.isFinite(Number(value)) ? Number(value).toLocaleString(locale() === 'en' ? 'en-EG' : 'ar-EG', { maximumFractionDigits: digits }) : '—');
    const can = (permission) => window.topGymAuth?.isOwner?.() === true
        || window.topGymAuth?.hasPermission?.(permission) === true;
    const state = {
        loaded: false,
        loading: false,
        type: 'workout',
        overview: null,
        clients: [],
        catalog: { exercises: [], foods: [] },
        plan: null,
        answer: null
    };
    function brandName() {
        return String(window.topGymBranding?.get?.().identity?.brandName || 'Logic Fit').trim() || 'Logic Fit';
    }

    function brandText(value) {
        return String(value ?? '').replaceAll('TOP GYM', () => brandName());
    }

    function displayPhone(value, iso = '') { return window.LogicFitPhoneInputs?.formatForDisplay?.(value, iso) || String(value || ''); }

    function escapeHtml(value) {
        return String(value ?? '').replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[character]));
    }

    function number(value, digits = 0) {
        const parsed = Number(value);
        return Number.isFinite(parsed) ? formatNumber(parsed, digits) : '—';
    }

    function dateText(value) {
        if (!value) return '—';
        const parsed = new Date(`${String(value).slice(0, 10)}T00:00:00`);
        return Number.isNaN(parsed.getTime()) ? String(value) : (window.TopGymI18n?.format?.('date', value) || parsed.toLocaleDateString(locale() === 'en' ? 'en-EG' : 'ar-EG'));
    }

    function notify(message, type = 'success') {
        if (window.showToast) window.showToast(message, type === 'error', type);
        else setMessage(message, type);
    }

    function setMessage(message, type = 'info') {
        const element = $('intelligenceMessage');
        if (!element) return;
        element.textContent = message || '';
        element.className = `intelligence-message ${type}`;
        element.hidden = !message;
    }

    function selectedClient() {
        return state.clients.find((client) => String(client.id) === String($('intelligenceMemberId')?.value)) || null;
    }

    function generatedSystemName(type, memberName = '') {
        const prefix = type === 'diet' ? 'خطة تغذية' : 'برنامج تدريب';
        const suffix = ` · From ${brandName()} System`;
        const label = String(memberName || 'العميل المحدد').trim() || 'العميل المحدد';
        const availableLabelLength = Math.max(12, 160 - prefix.length - suffix.length - 3);
        return `${prefix} - ${label.slice(0, availableLabelLength)}${suffix}`;
    }

    function normalizeGeneratedPlan(draft, type, memberName = '') {
        const normalized = JSON.parse(JSON.stringify(draft || {}));
        const clientLabel = normalized.memberName || memberName || 'العميل المحدد';
        normalized.memberName = normalized.memberName || memberName || clientLabel;
        normalized.name = generatedSystemName(type, clientLabel);
        return normalized;
    }

    function exerciseLabel(id) {
        const exercise = state.catalog.exercises.find((item) => String(item.id) === String(id));
        return exercise?.nameAr || exercise?.name || exercise?.nameEn || `تمرين #${id}`;
    }

    function foodLabel(id) {
        const food = state.catalog.foods.find((item) => String(item.id) === String(id));
        return food?.nameAr || food?.nameEn || `طعام #${id}`;
    }

    function planLevelLabel(value) {
        const key = { beginner: 'plans.level.beginner', intermediate: 'plans.level.intermediate', advanced: 'plans.level.advanced' }[String(value || '').toLowerCase()];
        return key ? t(key) : value || '—';
    }

    function renderStats(stats = {}) {
        const cards = [
            ['stats.highRisk', stats.highRiskMembers, 'stats.highRisk.caption', 'danger'],
            ['stats.expiring', stats.expiringMemberships, 'stats.expiring.caption', 'warning'],
            ['stats.activeMemberships', stats.activeMemberships, 'stats.activeMemberships.caption', 'active'],
            ['stats.workouts', stats.activeWorkoutPrograms, 'stats.workouts.caption', 'workout'],
            ['stats.diet', stats.activeDietPlans, 'stats.diet.caption', 'diet'],
            ['stats.members', stats.totalMembers, 'stats.members.caption', 'members']
        ];
        $('intelligenceStats').innerHTML = cards.map(([label, value, caption, tone]) => `<article class="intelligence-stat-card ${tone}"><span>${escapeHtml(t(label))}</span><strong>${number(value)}</strong><small>${escapeHtml(t(caption))}</small></article>`).join('');
    }

    function renderPriorities(items = []) {
        const priorityOrder = { danger: 0, warning: 1, info: 2, success: 3 };
        const orderedItems = [...items].sort((left, right) => (priorityOrder[left.tone] ?? 9) - (priorityOrder[right.tone] ?? 9));
        $('intelligencePriorities').innerHTML = orderedItems.map((item) => `<article class="intelligence-priority ${escapeHtml(item.tone || 'info')}"><span class="intelligence-priority-dot" aria-hidden="true"></span><div><strong>${escapeHtml(item.title)}</strong><small>${escapeHtml(item.action)}</small></div></article>`).join('') || `<div class="intelligence-empty-line">${escapeHtml(t('priority.empty'))}</div>`;
    }

    function riskLabel(level) {
        return t(level === 'high' ? 'churn.legend.high' : level === 'medium' ? 'churn.legend.medium' : 'churn.legend.low');
    }

    function renderChurn(items = []) {
        const rows = items.map((item) => `<tr><td><div class="intelligence-member-cell"><span class="intelligence-member-avatar">${escapeHtml((item.fullName || (locale() === 'en' ? 'M' : 'م')).trim().slice(0, 1))}</span><div><strong>${escapeHtml(item.fullName)}</strong><small dir="ltr">${escapeHtml(displayPhone(item.phone, item.phoneCountry) || t('churn.noPhone'))}</small></div></div></td><td><span class="intelligence-risk-badge ${escapeHtml(item.level)}">${riskLabel(item.level)} · ${number(item.score)}%</span></td><td>${item.daysSinceLastVisit == null ? t('churn.noAttendance') : t('churn.daysAgo', { count: number(item.daysSinceLastVisit) })}</td><td>${item.daysToExpiry == null ? '—' : item.daysToExpiry < 0 ? t('churn.expired') : t('churn.days', { count: number(item.daysToExpiry) })}</td><td><small>${escapeHtml(item.reasons?.[0] || t('churn.reasonFallback'))}</small></td><td><button class="btn btn-light btn-small" type="button" data-required-permission="members.read,memberships.read" data-intelligence-member="${escapeHtml(item.id)}">${escapeHtml(t('churn.openMember'))}</button></td></tr>`).join('');
        const headers = ['member', 'risk', 'lastVisit', 'expiry', 'reason', 'action'].map((key) => `<th>${escapeHtml(t(`churn.header.${key}`))}</th>`).join('');
        $('intelligenceChurnTable').innerHTML = rows ? `<table class="intelligence-table" data-responsive-cards="false"><thead><tr>${headers}</tr></thead><tbody>${rows}</tbody></table>` : `<div class="intelligence-empty-line">${escapeHtml(t('churn.empty'))}</div>`;
    }

    function renderPrompts(prompts = []) {
        $('intelligencePromptList').innerHTML = prompts.map((prompt) => `<button type="button" class="intelligence-prompt" data-intelligence-prompt="${escapeHtml(prompt)}">${escapeHtml(prompt)}</button>`).join('');
    }

    function renderOverview(data) {
        state.overview = data;
        renderStats(data.stats || {});
        renderPriorities(data.priorities || []);
        renderChurn(data.churn || []);
        renderPrompts(data.prompts || []);
        const badge = $('intelligenceEngineBadge');
        if (badge) badge.textContent = data.mode === 'hybrid-rules' ? t('header.engine') : brandText(data.engine || `${brandName()} Intelligence`);
    }

    function renderClients() {
        const select = $('intelligenceMemberId');
        if (!select) return;
        const current = select.value;
        select.innerHTML = `<option value="">${escapeHtml(t('plans.client.choose'))}</option>${state.clients.map((client) => `<option value="${escapeHtml(client.id)}">${escapeHtml(client.fullName || t('plans.client.fallback'))}${client.phone ? ` · ${escapeHtml(displayPhone(client.phone, client.phoneCountry))}` : ''}</option>`).join('')}`;
        if (state.clients.some((client) => String(client.id) === String(current))) select.value = current;
    }

    function renderAnswer(data) {
        const answer = $('intelligenceAnswer');
        if (!answer) return;
        state.answer = data;
        answer.hidden = false;
        answer.innerHTML = `<span class="intelligence-answer-label">${escapeHtml(t('query.answer'))}</span><p>${escapeHtml(brandText(data.answer || ''))}</p>`;
    }

    function planSummary(plan, type) {
        if (type === 'workout') {
            const exercises = (plan.routines || []).reduce((sum, routine) => sum + (routine.exercises || []).length, 0);
            return `<div class="intelligence-result-metrics"><span><b>${number(plan.routines?.length || 0)}</b> ${escapeHtml(t('plan.days'))}</span><span><b>${number(exercises)}</b> ${escapeHtml(t('plan.exercises'))}</span><span><b>${number(plan.durationWeeks)}</b> ${escapeHtml(t('plan.weeks'))}</span><span><b>${escapeHtml(planLevelLabel(plan.level))}</b> ${escapeHtml(t('plan.level'))}</span></div>`;
        }
        const foods = (plan.meals || []).reduce((sum, meal) => sum + (meal.items || []).length, 0);
        return `<div class="intelligence-result-metrics"><span><b>${number(plan.meals?.length || 0)}</b> ${escapeHtml(t('plan.meals'))}</span><span><b>${number(foods)}</b> ${escapeHtml(t('plan.foods'))}</span><span><b>${number(plan.targetCalories)}</b> ${escapeHtml(t('plan.calories'))}</span><span><b>${number(plan.targetProtein)}g</b> ${escapeHtml(t('plan.protein'))}</span></div>`;
    }

    function planPreview(plan, type) {
        if (type === 'workout') {
            return `<div class="intelligence-plan-preview-list">${(plan.routines || []).slice(0, 6).map((routine) => `<article><strong>${escapeHtml(routine.name)}</strong><small>${(routine.exercises || []).map((exercise) => `${escapeHtml(exerciseLabel(exercise.exerciseId))} · ${number(exercise.sets)}×${number(exercise.repsMin)}–${number(exercise.repsMax)}`).join(' · ')}</small></article>`).join('')}</div>`;
        }
        return `<div class="intelligence-plan-preview-list">${(plan.meals || []).slice(0, 6).map((meal) => `<article><strong>${escapeHtml(meal.name)}</strong><small>${(meal.items || []).map((item) => `${escapeHtml(foodLabel(item.foodId))} · ${number(item.assignedQuantity, 1)} ${escapeHtml(item.servingUnit || '')}`).join(' · ')}</small></article>`).join('')}</div>`;
    }

    function renderPlanResult(result, changes = []) {
        const type = result.type === 'diet' ? 'diet' : 'workout';
        const memberId = result.memberId || result.suggestion?.memberId || result.draft?.memberId;
        const member = state.clients.find((client) => String(client.id) === String(memberId));
        state.plan = { type, memberId, draft: normalizeGeneratedPlan(result.suggestion || result.draft, type, member?.fullName), warnings: result.warnings || [], explanation: result.explanation || [], changes };
        renderCurrentPlan();
    }

    function renderCurrentPlan() {
        if (!state.plan?.draft) return;
        const refineValue = $('intelligenceRefineInstruction')?.value || '';
        const plan = state.plan.draft;
        const warningMarkup = state.plan.warnings.map((warning) => `<li>${escapeHtml(brandText(warning))}</li>`).join('');
        const changeMarkup = state.plan.changes.map((change) => `<li>${escapeHtml(brandText(change))}</li>`).join('');
        $('intelligencePlanResult').innerHTML = `<div class="intelligence-result-head"><div><span class="intelligence-result-kicker">${escapeHtml(t('plan.draft'))}</span><h4>${escapeHtml(plan.name || t('plan.suggestion'))}</h4><p>${escapeHtml(plan.description || '')}</p></div><span class="intelligence-draft-badge">${escapeHtml(t('plan.status.draft'))}</span></div>${planSummary(plan, state.plan.type)}${planPreview(plan, state.plan.type)}${changeMarkup ? `<div class="intelligence-result-notice success"><strong>${escapeHtml(t('plan.applied'))}</strong><ul>${changeMarkup}</ul></div>` : ''}${warningMarkup ? `<div class="intelligence-result-notice warning"><strong>${escapeHtml(t('plan.review'))}</strong><ul>${warningMarkup}</ul></div>` : ''}<form class="intelligence-refine-form" id="intelligenceRefineForm"><label>${escapeHtml(t('plan.refine.label'))}<textarea id="intelligenceRefineInstruction" rows="2" maxlength="500" placeholder="${escapeHtml(t('plan.refine.placeholder'))}"></textarea></label><button class="btn btn-light" type="submit" data-required-permission="intelligence.generate">${escapeHtml(t('plan.refine.submit'))}</button></form><div class="intelligence-result-actions"><button class="btn btn-primary" type="button" data-required-permission="coaching.create" data-intelligence-save>${escapeHtml(t('plan.save'))}</button><button class="btn btn-light" type="button" data-required-permission="coaching.create,coaching.read" data-intelligence-manual>${escapeHtml(t('plan.manual'))}</button></div><small class="intelligence-human-review-note">${escapeHtml(t('plan.humanReview'))}</small>`;
        $('intelligenceRefineInstruction').value = refineValue;
    }

    function translateOptions(select, keys) {
        if (!select) return;
        const current = select.value;
        [...select.options].forEach((option) => {
            if (keys[option.value]) option.textContent = t(keys[option.value]);
        });
        select.value = current;
    }

    function preserveDynamicCopy(section) {
        const selectors = [
            '#intelligenceStats', '#intelligencePriorities', '#intelligenceChurnTable',
            '#intelligencePromptList', '#intelligenceAnswer', '#intelligencePlanResult',
            '#intelligenceMemberId', '#intelligenceMessage', '#intelligenceEngineBadge'
        ];
        selectors.forEach((selector) => {
            const element = section.querySelector(selector);
            if (!element) return;
            element.dataset.i18nPreserve = '';
            [element, ...element.querySelectorAll('[data-i18n], [data-i18n-placeholder], [data-i18n-title], [data-i18n-aria-label], [data-i18n-format]')]
                .forEach((target) => ['i18n', 'i18nPlaceholder', 'i18nTitle', 'i18nAriaLabel', 'i18nFormat'].forEach((key) => delete target.dataset[key]));
        });
    }

    function renderDynamicLocale() {
        const section = $('intelligenceSection');
        if (!section) return;
        preserveDynamicCopy(section);
        if (!state.overview) {
            $('intelligenceStats').innerHTML = `<div class="loading">${escapeHtml(t('loading.analysis'))}</div>`;
            $('intelligencePriorities').innerHTML = `<div class="loading">${escapeHtml(t('loading.priorities'))}</div>`;
            $('intelligenceChurnTable').innerHTML = `<div class="loading">${escapeHtml(t('loading.cases'))}</div>`;
        } else {
            renderStats(state.overview.stats || {});
            renderPriorities(state.overview.priorities || []);
            renderChurn(state.overview.churn || []);
            renderPrompts(state.overview.prompts || []);
            const badge = $('intelligenceEngineBadge');
            if (badge) badge.textContent = state.overview.mode === 'hybrid-rules' ? t('header.engine') : brandText(state.overview.engine || `${brandName()} Intelligence`);
        }
        if (state.loaded) renderClients();
        else $('intelligenceMemberId').innerHTML = `<option value="">${escapeHtml(t('plans.client.loading'))}</option>`;
        if (state.answer) renderAnswer(state.answer);
        renderCurrentPlan();
    }

    function applyPageLocale() {
        const section = $('intelligenceSection');
        if (!section) return;
        const planTypeTabs = $('intelligencePlanForm')?.querySelector('.intelligence-plan-type');
        if (planTypeTabs) {
            planTypeTabs.setAttribute('aria-label', t('plans.type.label'));
            planTypeTabs.querySelectorAll('[data-intelligence-type]').forEach((button) => {
                button.textContent = t(button.dataset.intelligenceType === 'diet' ? 'plans.type.diet' : 'plans.type.workout');
            });
        }
        preserveDynamicCopy(section);
        window.TopGymI18n?.annotateText?.(section, 'intelligenceScreen.', [
            '#intelligenceStats', '#intelligencePriorities', '#intelligenceChurnTable',
            '#intelligencePromptList', '#intelligenceAnswer', '#intelligencePlanResult',
            '#intelligenceMemberId', '#intelligenceMessage', '#intelligenceEngineBadge'
        ].join(','));
        translateOptions($('intelligenceGoal'), {
            hypertrophy: 'plans.goal.muscle', strength: 'plans.goal.strength', fat_loss: 'plans.goal.fatLoss',
            weight_gain: 'plans.goal.weightGain', general: 'plans.goal.fitness', maintain: 'plans.goal.maintain'
        });
        translateOptions($('intelligenceLevel'), { beginner: 'plans.level.beginner', intermediate: 'plans.level.intermediate', advanced: 'plans.level.advanced' });
        translateOptions($('intelligenceActivity'), { moderate: 'plans.activity.moderate', sedentary: 'plans.activity.sedentary', light: 'plans.activity.light', high: 'plans.activity.high' });
        queueMicrotask(renderDynamicLocale);
    }

    async function loadBaseData() {
        if (state.loaded || state.loading) return;
        state.loading = true;
        try {
            const [overview, coachingData] = await Promise.all([
                api.get('/api/intelligence/overview'),
                can('coaching.read')
                    ? Promise.all([
                        api.get('/api/coaching/clients?limit=300'),
                        api.get('/api/coaching/catalog')
                    ])
                    : Promise.resolve([{ clients: [] }, { exercises: [], foods: [] }])
            ]);
            const [clients, catalog] = coachingData;
            state.clients = clients.clients || [];
            state.catalog = { exercises: catalog.exercises || [], foods: catalog.foods || [] };
            renderOverview(overview);
            renderClients();
            state.loaded = true;
            setMessage('', 'info');
        } catch (error) {
            setMessage(error.message || t('message.loadError'), 'error');
        } finally {
            state.loading = false;
        }
    }

    async function refresh() {
        if (!can('intelligence.read')) {
            setMessage(t('message.permissionRead'), 'error');
            return;
        }
        state.loaded = false;
        await loadBaseData();
        notify(t('message.refreshed'));
    }

    async function submitQuestion(event) {
        event.preventDefault();
        if (!can('intelligence.read')) {
            setMessage(t('message.permissionAssistant'), 'error');
            return;
        }
        const input = $('intelligenceQuery');
        const question = input?.value.trim();
        if (!question) return setMessage(t('message.questionRequired'), 'warning');
        try {
            const data = await api.post('/api/intelligence/query', { question });
            renderAnswer(data);
        } catch (error) { setMessage(error.message || t('message.queryError'), 'error'); }
    }

    function setPlanType(type) {
        state.type = type;
        const planTypeTabs = $('intelligencePlanForm')?.querySelector('.intelligence-plan-type');
        planTypeTabs?.classList.add('tabs', 'tabs--section-switcher');
        planTypeTabs?.querySelectorAll('[data-intelligence-type]').forEach((button) => {
            button.classList.add('tab-button');
            const buttonType = button.dataset.intelligenceType;
            const panelId = buttonType === 'diet' ? 'intelligenceDietFields' : 'intelligenceWorkoutFields';
            button.id = `intelligencePlanType-${buttonType}`;
            button.setAttribute('aria-controls', panelId);
            const active = button.dataset.intelligenceType === type;
            button.classList.toggle('is-active', active);
            button.setAttribute('aria-selected', String(active));
        });
        [['intelligenceWorkoutFields', 'workout'], ['intelligenceDietFields', 'diet']].forEach(([panelId, buttonType]) => {
            const panel = $(panelId);
            panel?.setAttribute('role', 'tabpanel');
            panel?.setAttribute('aria-labelledby', `intelligencePlanType-${buttonType}`);
        });
        $('intelligenceWorkoutFields').hidden = type !== 'workout';
        $('intelligenceDietFields').hidden = type !== 'diet';
        $('intelligenceGoal').innerHTML = type === 'diet'
            ? `<option value="fat_loss">${escapeHtml(t('plans.goal.fatLoss'))}</option><option value="maintain">${escapeHtml(t('plans.goal.maintain'))}</option><option value="weight_gain">${escapeHtml(t('plans.goal.weightGain'))}</option>`
            : `<option value="hypertrophy">${escapeHtml(t('plans.goal.muscle'))}</option><option value="strength">${escapeHtml(t('plans.goal.strength'))}</option><option value="fat_loss">${escapeHtml(t('plans.goal.fatLoss'))}</option><option value="weight_gain">${escapeHtml(t('plans.goal.weightGain'))}</option><option value="general">${escapeHtml(t('plans.goal.fitness'))}</option>`;
    }

    async function generatePlan(event) {
        event.preventDefault();
        if (!can('intelligence.generate')) {
            setMessage(t('message.permissionGenerate'), 'error');
            return;
        }
        const memberId = $('intelligenceMemberId')?.value;
        if (!memberId) return setMessage(t('message.clientRequired'), 'warning');
        const button = event.currentTarget.querySelector('button[type="submit"]');
        button.disabled = true;
        try {
            const body = { memberId, goal: $('intelligenceGoal').value };
            const endpoint = state.type === 'workout' ? '/api/intelligence/workout-suggestions' : '/api/intelligence/diet-suggestions';
            if (state.type === 'workout') Object.assign(body, { level: $('intelligenceLevel').value, daysPerWeek: $('intelligenceDays').value, durationWeeks: $('intelligenceDuration').value, limitations: $('intelligenceLimitations').value });
            else Object.assign(body, { mealsPerDay: $('intelligenceMeals').value, targetCalories: $('intelligenceCalories').value || null, allergies: $('intelligenceAllergies').value, activity: $('intelligenceActivity').value });
            const result = await api.post(endpoint, body);
            renderPlanResult(result);
            setMessage(t('message.planCreated'), 'success');
        } catch (error) { setMessage(error.message || t('message.planError'), 'error'); }
        finally { button.disabled = false; }
    }

    async function refinePlan(event) {
        event.preventDefault();
        if (!can('intelligence.generate')) {
            setMessage(t('message.permissionRefine'), 'error');
            return;
        }
        if (!state.plan) return;
        const instruction = $('intelligenceRefineInstruction')?.value.trim();
        if (!instruction) return setMessage(t('message.refineRequired'), 'warning');
        const button = event.currentTarget.querySelector('button[type="submit"]');
        button.disabled = true;
        try {
            const result = await api.post('/api/intelligence/refine', { type: state.plan.type, memberId: state.plan.memberId, draft: state.plan.draft, instruction });
            renderPlanResult(result, result.changes || []);
            setMessage(t('message.refined'), 'success');
        } catch (error) { setMessage(error.message || t('message.refineError'), 'error'); }
        finally { button.disabled = false; }
    }

    async function savePlan() {
        if (!can('coaching.create')) {
            notify(t('message.permissionSave'), 'error');
            return;
        }
        if (!state.plan?.draft) return;
        try {
            const endpoint = state.plan.type === 'workout' ? '/api/workoutprograms' : '/api/dietplans';
            const member = state.clients.find((client) => String(client.id) === String(state.plan.memberId));
            state.plan.draft = normalizeGeneratedPlan(state.plan.draft, state.plan.type, member?.fullName);
            await api.post(endpoint, { ...state.plan.draft, status: 'draft' });
            notify(t('message.saved'));
            window.dispatchEvent(new CustomEvent('topgym:coaching-data-changed', { detail: { memberId: state.plan.memberId } }));
        } catch (error) { setMessage(error.message || t('message.saveError'), 'error'); }
    }

    async function openManualEditor() {
        if (!can('coaching.create') || !can('coaching.read')) {
            notify(t('message.permissionManual'), 'error');
            return;
        }
        if (!state.plan?.draft) return;
        const member = state.clients.find((client) => String(client.id) === String(state.plan.memberId));
        try {
            if (window.topGymActivateTab) await window.topGymActivateTab('trainees');
            window.dispatchEvent(new CustomEvent('topgym:ai-draft-ready', { detail: { type: state.plan.type, draft: JSON.parse(JSON.stringify(state.plan.draft)), memberName: member?.fullName || '' } }));
        } catch (error) { setMessage(error.message || t('message.manualError'), 'error'); }
    }

    function initContentTabs() {
        const section = $('intelligenceSection');
        const dashboardGrid = section?.querySelector('.intelligence-dashboard-grid');
        const stats = $('intelligenceStats');
        const priorities = dashboardGrid?.querySelector('.intelligence-priorities-card');
        const assistant = dashboardGrid?.querySelector('.intelligence-query-card');
        const retention = section?.querySelector('.intelligence-churn-card');
        const plans = section?.querySelector('.intelligence-plans-card');
        const message = $('intelligenceMessage');
        if (!section || !dashboardGrid || !stats || !priorities || !assistant || !retention || !plans || !message) return;

        const definitions = [
            { id: 'overview', key: 'tabs.overview', nodes: [stats, priorities, retention] },
            { id: 'assistant', key: 'tabs.assistant', nodes: [assistant] },
            { id: 'plans', key: 'tabs.plans', nodes: [plans] }
        ];
        const tablist = document.createElement('div');
        tablist.className = 'tabs tabs--section-switcher intelligence-content-tabs';
        tablist.id = 'intelligenceContentTabs';
        tablist.setAttribute('role', 'tablist');
        tablist.setAttribute('aria-label', t('tabs.aria'));
        tablist.dataset.i18nAriaLabel = 'intelligenceScreen.tabs.aria';

        const panels = document.createElement('div');
        panels.className = 'intelligence-content-panels';
        panels.id = 'intelligenceContentPanels';

        definitions.forEach((definition, index) => {
            const tab = document.createElement('button');
            tab.type = 'button';
            tab.className = 'tab-button';
            tab.id = `intelligenceTab-${definition.id}`;
            tab.dataset.intelligenceContentTab = definition.id;
            tab.setAttribute('role', 'tab');
            tab.setAttribute('aria-selected', String(index === 0));
            tab.setAttribute('aria-controls', `intelligencePanel-${definition.id}`);
            tab.tabIndex = index === 0 ? 0 : -1;
            tab.dataset.i18n = `intelligenceScreen.${definition.key}`;
            tab.textContent = t(definition.key);
            tablist.append(tab);

            const panel = document.createElement('section');
            panel.className = 'intelligence-content-panel';
            panel.id = `intelligencePanel-${definition.id}`;
            panel.dataset.intelligenceContentPanel = definition.id;
            panel.setAttribute('role', 'tabpanel');
            panel.setAttribute('aria-labelledby', tab.id);
            panel.tabIndex = 0;
            panel.hidden = index !== 0;
            panel.setAttribute('aria-hidden', String(index !== 0));
            panel.toggleAttribute('inert', index !== 0);
            definition.nodes.forEach((node) => panel.append(node));
            panels.append(panel);
        });

        dashboardGrid.remove();
        message.after(tablist, panels);

        const activate = (name, moveFocus = false) => {
            const selectedTab = tablist.querySelector(`[data-intelligence-content-tab="${name}"]`);
            if (!selectedTab) return;
            tablist.querySelectorAll('[data-intelligence-content-tab]').forEach((tab) => {
                const active = tab === selectedTab;
                tab.setAttribute('aria-selected', String(active));
                tab.tabIndex = active ? 0 : -1;
            });
            panels.querySelectorAll('[data-intelligence-content-panel]').forEach((panel) => {
                const active = panel.dataset.intelligenceContentPanel === name;
                panel.hidden = !active;
                panel.setAttribute('aria-hidden', String(!active));
                panel.toggleAttribute('inert', !active);
            });
            if (moveFocus) selectedTab.focus({ preventScroll: true });
        };

        tablist.addEventListener('click', (event) => {
            const tab = event.target.closest('[data-intelligence-content-tab]');
            if (tab && tablist.contains(tab)) activate(tab.dataset.intelligenceContentTab);
        });
        tablist.addEventListener('keydown', (event) => {
            const current = event.target.closest('[data-intelligence-content-tab]');
            if (!current) return;
            const available = [...tablist.querySelectorAll('[data-intelligence-content-tab]')];
            const direction = document.documentElement.dir === 'rtl' ? -1 : 1;
            let index = available.indexOf(current);
            if (event.key === 'Home') index = 0;
            else if (event.key === 'End') index = available.length - 1;
            else if (event.key === 'ArrowRight') index = (index + direction + available.length) % available.length;
            else if (event.key === 'ArrowLeft') index = (index - direction + available.length) % available.length;
            else return;
            event.preventDefault();
            activate(available[index].dataset.intelligenceContentTab, true);
        });
    }

    function bindEvents() {
        $('intelligenceRefreshButton')?.addEventListener('click', () => void refresh());
        $('intelligenceQueryForm')?.addEventListener('submit', submitQuestion);
        $('intelligencePlanForm')?.addEventListener('submit', generatePlan);
        document.querySelectorAll('[data-intelligence-type]').forEach((button) => button.addEventListener('click', () => setPlanType(button.dataset.intelligenceType)));
        $('intelligencePromptList')?.addEventListener('click', (event) => {
            const button = event.target.closest('[data-intelligence-prompt]');
            if (!button) return;
            $('intelligenceQuery').value = button.dataset.intelligencePrompt;
            $('intelligenceQueryForm').requestSubmit();
        });
        $('intelligenceChurnTable')?.addEventListener('click', (event) => {
            const button = event.target.closest('[data-intelligence-member]');
            if (!button) return;
            window.dispatchEvent(new CustomEvent('topgym:member-details-opened', { detail: { member: { id: button.dataset.intelligenceMember } } }));
        });
        $('intelligencePlanResult')?.addEventListener('submit', (event) => {
            if (event.target.id === 'intelligenceRefineForm') void refinePlan(event);
        });
        $('intelligencePlanResult')?.addEventListener('click', (event) => {
            if (event.target.closest('[data-intelligence-save]')) void savePlan();
            if (event.target.closest('[data-intelligence-manual]')) void openManualEditor();
        });
        window.addEventListener('topgym:tab-changed', (event) => { if (event.detail?.name === 'intelligence') void loadBaseData(); });
        window.addEventListener('topgym:brandingchange', () => { if (state.overview) renderOverview(state.overview); });
        window.addEventListener('topgym:localechange', applyPageLocale);
    }

    initContentTabs();
    bindEvents();
    setPlanType('workout');
    applyPageLocale();
})();
