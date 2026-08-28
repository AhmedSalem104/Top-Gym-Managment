(() => {
    if (window.__topGymIntelligenceLoaded) return;
    window.__topGymIntelligenceLoaded = true;

    const $ = (id) => document.getElementById(id);
    const api = window.topGymApi;
    const state = {
        loaded: false,
        loading: false,
        type: 'workout',
        overview: null,
        clients: [],
        catalog: { exercises: [], foods: [] },
        plan: null
    };
    function brandName() {
        return String(window.topGymBranding?.get?.().identity?.brandName || 'Logic Fit').trim() || 'Logic Fit';
    }

    function brandText(value) {
        return String(value ?? '').replaceAll('TOP GYM', () => brandName());
    }

    function escapeHtml(value) {
        return String(value ?? '').replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[character]));
    }

    function number(value, digits = 0) {
        const parsed = Number(value);
        return Number.isFinite(parsed) ? parsed.toLocaleString('ar-EG', { maximumFractionDigits: digits }) : '—';
    }

    function dateText(value) {
        if (!value) return '—';
        const parsed = new Date(`${String(value).slice(0, 10)}T00:00:00`);
        return Number.isNaN(parsed.getTime()) ? String(value) : parsed.toLocaleDateString('ar-EG');
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

    function renderStats(stats = {}) {
        const cards = [
            ['خطر توقف مرتفع', stats.highRiskMembers, 'أولوية تواصل اليوم', 'danger'],
            ['قريبة الانتهاء', stats.expiringMemberships, 'تحتاج متابعة قريبة', 'warning'],
            ['اشتراكات نشطة', stats.activeMemberships, 'تحتاج متابعة مستمرة', 'active'],
            ['برامج تدريب نشطة', stats.activeWorkoutPrograms, 'خطة قيد التنفيذ', 'workout'],
            ['خطط تغذية نشطة', stats.activeDietPlans, 'خطة قابلة للقياس', 'diet'],
            ['الأعضاء', stats.totalMembers, 'إجمالي الملفات', 'members']
        ];
        $('intelligenceStats').innerHTML = cards.map(([label, value, caption, tone]) => `<article class="intelligence-stat-card ${tone}"><span>${escapeHtml(label)}</span><strong>${number(value)}</strong><small>${escapeHtml(caption)}</small></article>`).join('');
    }

    function renderPriorities(items = []) {
        const priorityOrder = { danger: 0, warning: 1, info: 2, success: 3 };
        const orderedItems = [...items].sort((left, right) => (priorityOrder[left.tone] ?? 9) - (priorityOrder[right.tone] ?? 9));
        $('intelligencePriorities').innerHTML = orderedItems.map((item) => `<article class="intelligence-priority ${escapeHtml(item.tone || 'info')}"><span class="intelligence-priority-dot" aria-hidden="true"></span><div><strong>${escapeHtml(item.title)}</strong><small>${escapeHtml(item.action)}</small></div></article>`).join('') || '<div class="intelligence-empty-line">لا توجد إشارات تحتاج تدخلاً الآن.</div>';
    }

    function riskLabel(level) {
        return level === 'high' ? 'مرتفع' : level === 'medium' ? 'متوسط' : 'منخفض';
    }

    function renderChurn(items = []) {
        const rows = items.map((item) => `<tr><td><div class="intelligence-member-cell"><span class="intelligence-member-avatar">${escapeHtml((item.fullName || 'م').trim().slice(0, 1))}</span><div><strong>${escapeHtml(item.fullName)}</strong><small dir="ltr">${escapeHtml(item.phone || 'بدون هاتف')}</small></div></div></td><td><span class="intelligence-risk-badge ${escapeHtml(item.level)}">${riskLabel(item.level)} · ${number(item.score)}%</span></td><td>${item.daysSinceLastVisit == null ? 'لا يوجد حضور' : `منذ ${number(item.daysSinceLastVisit)} يوم`}</td><td>${item.daysToExpiry == null ? '—' : item.daysToExpiry < 0 ? 'منتهية' : `${number(item.daysToExpiry)} يوم`}</td><td><small>${escapeHtml(item.reasons?.[0] || 'مؤشر يحتاج مراجعة')}</small></td><td><button class="btn btn-light btn-small" type="button" data-intelligence-member="${escapeHtml(item.id)}">فتح ملف</button></td></tr>`).join('');
        $('intelligenceChurnTable').innerHTML = rows ? `<table class="intelligence-table"><thead><tr><th>المشترك</th><th>المؤشر</th><th>آخر حضور</th><th>الانتهاء</th><th>السبب الأبرز</th><th>الإجراء</th></tr></thead><tbody>${rows}</tbody></table>` : '<div class="intelligence-empty-line">لا توجد عضويات نشطة في نطاق التحليل.</div>';
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
        if (badge) badge.textContent = data.mode === 'hybrid-rules' ? 'Hybrid intelligence · مراجعة بشرية' : brandText(data.engine || `${brandName()} Intelligence`);
    }

    function renderClients() {
        const select = $('intelligenceMemberId');
        if (!select) return;
        const current = select.value;
        select.innerHTML = `<option value="">اختر العميل</option>${state.clients.map((client) => `<option value="${escapeHtml(client.id)}">${escapeHtml(client.fullName || 'عميل')}${client.phone ? ` · ${escapeHtml(client.phone)}` : ''}</option>`).join('')}`;
        if (state.clients.some((client) => String(client.id) === String(current))) select.value = current;
    }

    function renderAnswer(data) {
        const answer = $('intelligenceAnswer');
        if (!answer) return;
        answer.hidden = false;
        answer.innerHTML = `<span class="intelligence-answer-label">تحليل النظام</span><p>${escapeHtml(brandText(data.answer || ''))}</p>`;
    }

    function planSummary(plan, type) {
        if (type === 'workout') {
            const exercises = (plan.routines || []).reduce((sum, routine) => sum + (routine.exercises || []).length, 0);
            return `<div class="intelligence-result-metrics"><span><b>${number(plan.routines?.length || 0)}</b> أيام</span><span><b>${number(exercises)}</b> تمارين</span><span><b>${number(plan.durationWeeks)}</b> أسابيع</span><span><b>${escapeHtml(plan.level || '—')}</b> مستوى</span></div>`;
        }
        const foods = (plan.meals || []).reduce((sum, meal) => sum + (meal.items || []).length, 0);
        return `<div class="intelligence-result-metrics"><span><b>${number(plan.meals?.length || 0)}</b> وجبات</span><span><b>${number(foods)}</b> أطعمة</span><span><b>${number(plan.targetCalories)}</b> سعر</span><span><b>${number(plan.targetProtein)}g</b> بروتين</span></div>`;
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
        const plan = state.plan.draft;
        const warningMarkup = state.plan.warnings.map((warning) => `<li>${escapeHtml(brandText(warning))}</li>`).join('');
        const changeMarkup = changes.map((change) => `<li>${escapeHtml(brandText(change))}</li>`).join('');
        $('intelligencePlanResult').innerHTML = `<div class="intelligence-result-head"><div><span class="intelligence-result-kicker">مسودة قابلة للمراجعة</span><h4>${escapeHtml(plan.name || 'اقتراح ذكي')}</h4><p>${escapeHtml(plan.description || '')}</p></div><span class="intelligence-draft-badge">Draft</span></div>${planSummary(plan, state.plan.type)}${planPreview(plan, state.plan.type)}${changeMarkup ? `<div class="intelligence-result-notice success"><strong>تم تطبيق التعديل</strong><ul>${changeMarkup}</ul></div>` : ''}${warningMarkup ? `<div class="intelligence-result-notice warning"><strong>مراجعة ضرورية قبل الاعتماد</strong><ul>${warningMarkup}</ul></div>` : ''}<form class="intelligence-refine-form" id="intelligenceRefineForm"><label>اكتب تعديلك على المسودة<textarea id="intelligenceRefineInstruction" rows="2" maxlength="500" placeholder="مثال: احذف تمرين السكوات وأضف جهاز الرجلين"></textarea></label><button class="btn btn-light" type="submit">إعادة إنشاء بالتعليمات</button></form><div class="intelligence-result-actions"><button class="btn btn-primary" type="button" data-intelligence-save>حفظ كمسودة في النظام</button><button class="btn btn-light" type="button" data-intelligence-manual>فتح في المحرر اليدوي</button></div><small class="intelligence-human-review-note">لن يتم نشر الخطة كخطة معتمدة تلقائيًا؛ راجعها واحفظها أو عدّلها يدويًا.</small>`;
    }

    async function loadBaseData() {
        if (state.loaded || state.loading) return;
        state.loading = true;
        try {
            const [overview, clients, catalog] = await Promise.all([
                api.get('/api/intelligence/overview'),
                api.get('/api/coaching/clients?limit=300'),
                api.get('/api/coaching/catalog')
            ]);
            state.clients = clients.clients || [];
            state.catalog = { exercises: catalog.exercises || [], foods: catalog.foods || [] };
            renderOverview(overview);
            renderClients();
            state.loaded = true;
            setMessage('', 'info');
        } catch (error) {
            setMessage(error.message || 'تعذر تحميل مركز الذكاء.', 'error');
        } finally {
            state.loading = false;
        }
    }

    async function refresh() {
        state.loaded = false;
        await loadBaseData();
        notify('تم تحديث التحليل الذكي.');
    }

    async function submitQuestion(event) {
        event.preventDefault();
        const input = $('intelligenceQuery');
        const question = input?.value.trim();
        if (!question) return setMessage('اكتب سؤالًا للمساعد أولًا.', 'warning');
        try {
            const data = await api.post('/api/intelligence/query', { question });
            renderAnswer(data);
        } catch (error) { setMessage(error.message || 'تعذر تحليل السؤال.', 'error'); }
    }

    function setPlanType(type) {
        state.type = type;
        document.querySelectorAll('[data-intelligence-type]').forEach((button) => {
            const active = button.dataset.intelligenceType === type;
            button.classList.toggle('is-active', active);
            button.setAttribute('aria-selected', String(active));
        });
        $('intelligenceWorkoutFields').hidden = type !== 'workout';
        $('intelligenceDietFields').hidden = type !== 'diet';
        $('intelligenceGoal').innerHTML = type === 'diet'
            ? '<option value="fat_loss">خسارة الدهون</option><option value="maintain">تثبيت الوزن</option><option value="weight_gain">زيادة الكتلة</option>'
            : '<option value="hypertrophy">بناء العضلات</option><option value="strength">زيادة القوة</option><option value="fat_loss">خسارة الدهون</option><option value="weight_gain">زيادة الكتلة</option><option value="general">لياقة عامة</option>';
    }

    async function generatePlan(event) {
        event.preventDefault();
        const memberId = $('intelligenceMemberId')?.value;
        if (!memberId) return setMessage('اختر العميل قبل إنشاء الاقتراح.', 'warning');
        const button = event.currentTarget.querySelector('button[type="submit"]');
        button.disabled = true;
        try {
            const body = { memberId, goal: $('intelligenceGoal').value };
            const endpoint = state.type === 'workout' ? '/api/intelligence/workout-suggestions' : '/api/intelligence/diet-suggestions';
            if (state.type === 'workout') Object.assign(body, { level: $('intelligenceLevel').value, daysPerWeek: $('intelligenceDays').value, durationWeeks: $('intelligenceDuration').value, limitations: $('intelligenceLimitations').value });
            else Object.assign(body, { mealsPerDay: $('intelligenceMeals').value, targetCalories: $('intelligenceCalories').value || null, allergies: $('intelligenceAllergies').value, activity: $('intelligenceActivity').value });
            const result = await api.post(endpoint, body);
            renderPlanResult(result);
            setMessage('تم إنشاء المسودة الذكية. راجعها قبل اعتمادها.', 'success');
        } catch (error) { setMessage(error.message || 'تعذر إنشاء الاقتراح.', 'error'); }
        finally { button.disabled = false; }
    }

    async function refinePlan(event) {
        event.preventDefault();
        if (!state.plan) return;
        const instruction = $('intelligenceRefineInstruction')?.value.trim();
        if (!instruction) return setMessage('اكتب التعديل المطلوب على المسودة.', 'warning');
        const button = event.currentTarget.querySelector('button[type="submit"]');
        button.disabled = true;
        try {
            const result = await api.post('/api/intelligence/refine', { type: state.plan.type, memberId: state.plan.memberId, draft: state.plan.draft, instruction });
            renderPlanResult(result, result.changes || []);
            setMessage('تمت إعادة بناء المسودة حسب تعليماتك.', 'success');
        } catch (error) { setMessage(error.message || 'تعذر تطبيق التعديل.', 'error'); }
        finally { button.disabled = false; }
    }

    async function savePlan() {
        if (!state.plan?.draft) return;
        try {
            const endpoint = state.plan.type === 'workout' ? '/api/workoutprograms' : '/api/dietplans';
            const member = state.clients.find((client) => String(client.id) === String(state.plan.memberId));
            state.plan.draft = normalizeGeneratedPlan(state.plan.draft, state.plan.type, member?.fullName);
            await api.post(endpoint, { ...state.plan.draft, status: 'draft' });
            notify('تم حفظ المسودة داخل التدريب والتغذية. يمكنك فتحها وتعديلها يدويًا.');
            window.dispatchEvent(new CustomEvent('topgym:coaching-data-changed', { detail: { memberId: state.plan.memberId } }));
        } catch (error) { setMessage(error.message || 'تعذر حفظ المسودة.', 'error'); }
    }

    async function openManualEditor() {
        if (!state.plan?.draft) return;
        const member = state.clients.find((client) => String(client.id) === String(state.plan.memberId));
        try {
            if (window.topGymActivateTab) await window.topGymActivateTab('trainees');
            window.dispatchEvent(new CustomEvent('topgym:ai-draft-ready', { detail: { type: state.plan.type, draft: JSON.parse(JSON.stringify(state.plan.draft)), memberName: member?.fullName || '' } }));
        } catch (error) { setMessage(error.message || 'تعذر فتح المحرر اليدوي.', 'error'); }
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
    }

    bindEvents();
    setPlanType('workout');
    if (document.querySelector('[data-page-tab="intelligence"]')?.classList.contains('active')) void loadBaseData();
})();
