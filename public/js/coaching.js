(() => {
    if (window.__topGymCoachingLoaded) return;
    window.__topGymCoachingLoaded = true;

    const $ = (id) => document.getElementById(id);
    const state = {
        trainees: [],
        pagination: null,
        page: 1,
        search: '',
        loaded: false,
        catalog: { exercises: [], foods: [] },
        builder: null,
        profile: null
    };

    const STATUS_LABELS = { active: 'نشط', draft: 'مسودة', paused: 'متوقف', completed: 'مكتمل', archived: 'مؤرشف' };

    function escapeHtml(value) {
        return String(value ?? '').replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[character]));
    }

    function number(value, digits = 1) {
        const parsed = Number(value);
        return Number.isFinite(parsed) ? parsed.toLocaleString('ar-EG', { maximumFractionDigits: digits }) : '—';
    }

    function today() {
        const date = new Date();
        const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
        return local.toISOString().slice(0, 10);
    }

    function openDialog(dialog) {
        if (!dialog) return;
        if (typeof dialog.showModal === 'function') dialog.showModal();
        else dialog.setAttribute('open', '');
    }

    function closeDialog(dialog) {
        if (!dialog) return;
        if (typeof dialog.close === 'function' && dialog.open) dialog.close();
        else dialog.removeAttribute('open');
    }

    async function requestJson(url, options = {}) {
        const response = await fetch(url, { ...options, headers: { 'Content-Type': 'application/json', ...(options.headers || {}) } });
        if (response.status === 204) return null;
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
            const error = new Error(data.error || 'تعذر تنفيذ الطلب.');
            Object.assign(error, data);
            throw error;
        }
        return data;
    }

    function notify(message, type = 'success') {
        if (window.Swal) {
            window.Swal.fire({ toast: true, position: 'top-start', icon: type === 'error' ? 'error' : 'success', title: message, showConfirmButton: false, timer: type === 'error' ? 5000 : 2800, customClass: { popup: 'coaching-alert' } });
            return;
        }
        const element = $('coachingMessage');
        if (!element) return;
        element.textContent = message;
        element.className = `coaching-message ${type}`;
        element.hidden = false;
        window.clearTimeout(notify.timer);
        notify.timer = window.setTimeout(() => { element.hidden = true; }, 4000);
    }

    function setLoading(element, message = 'جاري التحميل…') {
        if (element) element.innerHTML = `<div class="loading">${message}</div>`;
    }

    function itemName(item) { return item?.nameAr || item?.name || item?.nameEn || 'عنصر بدون اسم'; }

    async function loadCatalog() {
        if (state.catalog.exercises.length && state.catalog.foods.length) return;
        const loadCollection = async (type) => {
            const pages = await Promise.all([1, 2, 3].map((page) => requestJson(`/api/library/${type}?page=${page}&pageSize=100`)));
            return pages.flatMap((page) => page.items || []).filter((item, index, list) => list.findIndex((candidate) => candidate.id === item.id) === index);
        };
        [state.catalog.exercises, state.catalog.foods] = await Promise.all([loadCollection('exercises'), loadCollection('foods')]);
    }

    function activateCoachingSummary() {
        const summary = $('coachingSummary');
        if (!summary) return;
        const workoutCount = state.trainees.reduce((sum, item) => sum + item.workoutCount, 0);
        const dietCount = state.trainees.reduce((sum, item) => sum + item.dietCount, 0);
        const measurements = state.trainees.reduce((sum, item) => sum + item.measurementCount, 0);
        summary.innerHTML = [
            ['المتدربون الخارجيون', state.pagination?.total || 0, 'users'],
            ['برامج التدريب', workoutCount, 'workout'],
            ['خطط التغذية', dietCount, 'diet'],
            ['سجلات القياسات', measurements, 'progress']
        ].map(([label, value, tone]) => `<article class="coaching-summary-card ${tone}"><span>${label}</span><strong>${number(value, 0)}</strong><small>بيانات محفوظة فعليًا</small></article>`).join('');
    }

    function renderTrainees() {
        const container = $('externalTraineesList');
        if (!container) return;
        if (!state.trainees.length) {
            container.innerHTML = '<div class="coaching-empty"><strong>لا يوجد متدربون خارجيون حاليًا</strong><span>أضف متدربًا، ثم أنشئ له برنامج تدريب أو خطة تغذية ليظهر هنا.</span></div>';
            activateCoachingSummary();
            return;
        }
        container.innerHTML = state.trainees.map((trainee) => `<article class="external-trainee-card" data-trainee-id="${trainee.id}">
            <div class="external-trainee-head"><div class="trainee-avatar">${escapeHtml((trainee.fullName || 'م').trim().slice(0, 1))}</div><div class="trainee-identity"><strong>${escapeHtml(trainee.fullName)}</strong><a href="tel:${escapeHtml(trainee.phone)}">${escapeHtml(trainee.phone)}</a>${trainee.email ? `<small>${escapeHtml(trainee.email)}</small>` : ''}</div><span class="trainee-badge">خارجي</span></div>
            <div class="external-trainee-metrics"><span><b>${number(trainee.workoutCount, 0)}</b> برنامج تدريب</span><span><b>${number(trainee.dietCount, 0)}</b> خطة تغذية</span><span><b>${number(trainee.measurementCount, 0)}</b> قياس</span></div>
            <div class="external-trainee-foot"><small>آخر نشاط: ${trainee.lastActivity ? escapeHtml(new Date(trainee.lastActivity).toLocaleDateString('ar-EG')) : '—'}</small><div class="trainee-actions"><button class="btn btn-light btn-small" data-coaching-action="profile" data-id="${trainee.id}">فتح الملف</button><button class="btn btn-primary btn-small" data-coaching-action="workout" data-id="${trainee.id}">+ تدريب</button><button class="btn btn-light btn-small" data-coaching-action="diet" data-id="${trainee.id}">+ تغذية</button></div></div>
        </article>`).join('');
        activateCoachingSummary();
    }

    function renderPagination() {
        const element = $('externalTraineesPagination');
        const pagination = state.pagination;
        if (!element || !pagination || pagination.totalPages <= 1) { if (element) element.hidden = true; return; }
        element.hidden = false;
        element.innerHTML = `<span>صفحة ${number(pagination.page, 0)} من ${number(pagination.totalPages, 0)} · ${number(pagination.total, 0)} متدرب</span><div><button class="btn btn-light btn-small" data-coaching-page="prev" ${pagination.hasPrevious ? '' : 'disabled'}>السابق</button><button class="btn btn-light btn-small" data-coaching-page="next" ${pagination.hasNext ? '' : 'disabled'}>التالي</button></div>`;
    }

    async function loadTrainees(force = false) {
        if (state.loaded && !force && state.search === String($('externalTraineeSearch')?.value || '').trim()) return;
        state.search = String($('externalTraineeSearch')?.value || '').trim();
        setLoading($('externalTraineesList'), 'جاري تحميل المتدربين…');
        try {
            const data = await requestJson(`/api/external-trainees?page=${state.page}&pageSize=12&search=${encodeURIComponent(state.search)}`);
            state.trainees = data.trainees || [];
            state.pagination = data.pagination;
            state.loaded = true;
            renderTrainees();
            renderPagination();
        } catch (error) {
            $('externalTraineesList').innerHTML = `<div class="coaching-empty error"><strong>تعذر تحميل المتدربين</strong><span>${escapeHtml(error.message)}</span></div>`;
            notify(error.message, 'error');
        }
    }

    function renderExternalForm() {
        $('externalRegistrationDate').value = today();
        $('externalFullName').value = '';
        $('externalPhone').value = '';
        $('externalEmail').value = '';
        $('externalNotes').value = '';
    }

    async function submitExternalTrainee(event) {
        event.preventDefault();
        const form = event.currentTarget;
        const submitButton = form.querySelector('button[type="submit"]');
        submitButton.disabled = true;
        try {
            const data = await requestJson('/api/external-trainees', { method: 'POST', body: JSON.stringify({ fullName: $('externalFullName').value, phone: $('externalPhone').value, email: $('externalEmail').value, registrationDate: $('externalRegistrationDate').value, notes: $('externalNotes').value }) });
            closeDialog($('externalTraineeDialog'));
            state.loaded = false;
            await loadTrainees(true);
            notify('تم إنشاء ملف المتدرب. أنشئ له النظام من زر التدريب أو التغذية.');
            openProfile(data.member.id);
        } catch (error) {
            notify(error.message, 'error');
            if (error.memberId) openProfile(error.memberId);
        } finally { submitButton.disabled = false; }
    }

    async function openProfile(memberId) {
        const dialog = $('coachingProfileDialog');
        setLoading($('coachingProfileContent'), 'جاري تحميل ملف المتدرب…');
        openDialog(dialog);
        try {
            state.profile = await requestJson(`/api/clients/${memberId}/training-overview`);
            renderProfile(state.profile);
        } catch (error) {
            $('coachingProfileContent').innerHTML = `<div class="coaching-empty error"><strong>تعذر فتح الملف</strong><span>${escapeHtml(error.message)}</span></div>`;
            notify(error.message, 'error');
        }
    }

    function renderProfile(overview) {
        const member = overview.member;
        $('coachingProfileTitle').textContent = member.fullName;
        $('coachingProfileSubtitle').textContent = `${member.phone}${member.email ? ` · ${member.email}` : ''}`;
        const workoutCards = (overview.workoutPrograms || []).map((program) => `<article class="profile-system-card"><div><span class="system-type workout">برنامج تدريب</span><strong>${escapeHtml(program.name)}</strong><small>${escapeHtml(program.goal || 'هدف غير محدد')} · ${escapeHtml(program.level || 'مستوى غير محدد')}</small></div><div><span class="system-status ${program.status}">${STATUS_LABELS[program.status] || program.status}</span><button class="btn btn-light btn-small" data-profile-action="edit-workout" data-id="${program.id}">تعديل</button></div></article>`).join('');
        const dietCards = (overview.dietPlans || []).map((plan) => `<article class="profile-system-card"><div><span class="system-type diet">خطة تغذية</span><strong>${escapeHtml(plan.name)}</strong><small>${number(plan.targetCalories, 0)} سعر · ${number(plan.mealCount, 0)} وجبات</small></div><div><span class="system-status ${plan.status}">${STATUS_LABELS[plan.status] || plan.status}</span><button class="btn btn-light btn-small" data-profile-action="edit-diet" data-id="${plan.id}">تعديل</button></div></article>`).join('');
        const measurements = (overview.measurements || []).slice(0, 6).map((item) => `<tr><td>${escapeHtml(item.measuredAt)}</td><td>${item.weightKg == null ? '—' : `${number(item.weightKg, 1)} كجم`}</td><td>${item.bodyFatPercent == null ? '—' : `${number(item.bodyFatPercent, 1)}%`}</td><td><button class="btn btn-light btn-small" data-measurement-action="edit" data-id="${item.id}">تعديل</button><button class="btn btn-danger btn-small" data-measurement-action="delete" data-id="${item.id}">حذف</button></td></tr>`).join('');
        $('coachingProfileContent').innerHTML = `<div class="profile-hero"><div class="trainee-avatar large">${escapeHtml((member.fullName || 'م').trim().slice(0, 1))}</div><div><strong>${escapeHtml(member.fullName)}</strong><span>${escapeHtml(member.phone)}${member.email ? ` · ${escapeHtml(member.email)}` : ''}</span><small>ملف العميل #${member.id} · لا يوجد اشتراك Gym فعال حاليًا</small></div><button class="btn btn-primary btn-small" data-profile-action="subscribe">إضافة اشتراك Gym</button></div>
            <div class="profile-stats"><article><span>الوزن الحالي</span><strong>${overview.progress.currentWeight == null ? '—' : `${number(overview.progress.currentWeight, 1)} كجم`}</strong></article><article><span>تغير الوزن</span><strong>${overview.progress.weightChange == null ? '—' : `${overview.progress.weightChange > 0 ? '+' : ''}${number(overview.progress.weightChange, 1)} كجم`}</strong></article><article><span>الجلسات المكتملة</span><strong>${number(overview.progress.completedSessions, 0)}</strong></article><article><span>تسجيلات الوجبات</span><strong>${number(overview.progress.mealLogCount, 0)}</strong></article></div>
            <div class="profile-actions"><button class="btn btn-primary" data-profile-action="new-workout">+ برنامج تدريب</button><button class="btn btn-light" data-profile-action="new-diet">+ خطة تغذية</button><button class="btn btn-light" data-profile-action="new-measurement">+ قياس جديد</button><button class="btn btn-light" data-profile-action="edit-client">تعديل البيانات الأساسية</button></div>
            <div class="profile-section"><div class="profile-section-head"><h4>الأنظمة الحالية</h4><span>${number((overview.workoutPrograms || []).length + (overview.dietPlans || []).length, 0)} نظام</span></div>${workoutCards || dietCards ? `${workoutCards}${dietCards}` : '<div class="profile-empty">لم يتم إنشاء نظام بعد.</div>'}</div>
            <div class="profile-section"><div class="profile-section-head"><h4>القياسات والمتابعة</h4><span>${number((overview.measurements || []).length, 0)} قياس</span></div>${measurements ? `<div class="profile-table-wrap"><table class="profile-table"><thead><tr><th>التاريخ</th><th>الوزن</th><th>الدهون</th><th>الإجراءات</th></tr></thead><tbody>${measurements}</tbody></table></div>` : '<div class="profile-empty">أضف أول قياس لمتابعة التقدم.</div>'}</div>`;
    }

    function blankWorkout(memberId) {
        const exerciseId = state.catalog.exercises[0]?.id || '';
        return { memberId, name: '', description: '', startDate: today(), endDate: '', durationWeeks: 4, goal: 'بناء العضلات', level: 'مبتدئ', daysPerWeek: 3, status: 'active', notes: '', version: null, routines: [{ name: 'اليوم الأول', dayOfWeek: 1, sortOrder: 0, notes: '', exercises: [{ exerciseId, sortOrder: 0, sets: 3, repsMin: 10, repsMax: 12, weightKg: '', restSeconds: 90, tempo: '', supersetGroupId: '', notes: '' }] }] };
    }

    function blankDiet(memberId) {
        const foodId = state.catalog.foods[0]?.id || '';
        const names = ['الفطور', 'وجبة خفيفة', 'الغداء', 'العشاء'];
        return { memberId, name: '', description: '', startDate: today(), endDate: '', mealsPerDay: 4, targetCalories: 2200, targetProtein: 160, targetCarbs: 240, targetFats: 70, status: 'active', notes: '', version: null, meals: names.map((name, index) => ({ name, mealTime: '', sortOrder: index, notes: '', items: [{ foodId, sortOrder: 0, assignedQuantity: 100, servingUnit: '', notes: '' }] })) };
    }

    function valueOf(root, selector, fallback = '') { return root.querySelector(selector)?.value ?? fallback; }

    function readWorkoutDraft() {
        const draft = state.builder.draft;
        const content = $('coachingBuilderContent');
        draft.name = valueOf(content, '[data-builder-field="name"]');
        draft.description = valueOf(content, '[data-builder-field="description"]');
        draft.startDate = valueOf(content, '[data-builder-field="startDate"]');
        draft.endDate = valueOf(content, '[data-builder-field="endDate"]');
        draft.durationWeeks = Number(valueOf(content, '[data-builder-field="durationWeeks"]')) || null;
        draft.goal = valueOf(content, '[data-builder-field="goal"]');
        draft.level = valueOf(content, '[data-builder-field="level"]');
        draft.daysPerWeek = Number(valueOf(content, '[data-builder-field="daysPerWeek"]')) || null;
        draft.status = valueOf(content, '[data-builder-field="status"]', 'active');
        draft.notes = valueOf(content, '[data-builder-field="notes"]');
        draft.routines = [...content.querySelectorAll('[data-routine-index]')].map((routineElement, routineIndex) => ({
            name: valueOf(routineElement, '[data-routine-field="name"]', `اليوم ${routineIndex + 1}`), dayOfWeek: Number(valueOf(routineElement, '[data-routine-field="dayOfWeek"]')) || null, sortOrder: routineIndex, notes: valueOf(routineElement, '[data-routine-field="notes"]'), exercises: [...routineElement.querySelectorAll('[data-exercise-index]')].map((exerciseElement, exerciseIndex) => ({ exerciseId: Number(valueOf(exerciseElement, '[data-exercise-field="exerciseId"]')) || '', sortOrder: exerciseIndex, sets: Number(valueOf(exerciseElement, '[data-exercise-field="sets"]')) || 3, repsMin: Number(valueOf(exerciseElement, '[data-exercise-field="repsMin"]')) || null, repsMax: Number(valueOf(exerciseElement, '[data-exercise-field="repsMax"]')) || null, weightKg: valueOf(exerciseElement, '[data-exercise-field="weightKg"]'), restSeconds: Number(valueOf(exerciseElement, '[data-exercise-field="restSeconds"]')) || 0, tempo: valueOf(exerciseElement, '[data-exercise-field="tempo"]'), supersetGroupId: valueOf(exerciseElement, '[data-exercise-field="supersetGroupId"]'), notes: valueOf(exerciseElement, '[data-exercise-field="notes"]') }))
        }));
        return draft;
    }

    function readDietDraft() {
        const draft = state.builder.draft;
        const content = $('coachingBuilderContent');
        draft.name = valueOf(content, '[data-builder-field="name"]');
        draft.description = valueOf(content, '[data-builder-field="description"]');
        draft.startDate = valueOf(content, '[data-builder-field="startDate"]');
        draft.endDate = valueOf(content, '[data-builder-field="endDate"]');
        draft.mealsPerDay = Number(valueOf(content, '[data-builder-field="mealsPerDay"]')) || null;
        for (const field of ['targetCalories', 'targetProtein', 'targetCarbs', 'targetFats']) draft[field] = Number(valueOf(content, `[data-builder-field="${field}"]`)) || 0;
        draft.status = valueOf(content, '[data-builder-field="status"]', 'active');
        draft.notes = valueOf(content, '[data-builder-field="notes"]');
        draft.meals = [...content.querySelectorAll('[data-meal-index]')].map((mealElement, mealIndex) => ({
            name: valueOf(mealElement, '[data-meal-field="name"]', `وجبة ${mealIndex + 1}`), mealTime: valueOf(mealElement, '[data-meal-field="mealTime"]'), sortOrder: mealIndex, notes: valueOf(mealElement, '[data-meal-field="notes"]'), items: [...mealElement.querySelectorAll('[data-food-index]')].map((itemElement, itemIndex) => ({ foodId: Number(valueOf(itemElement, '[data-food-field="foodId"]')) || '', sortOrder: itemIndex, assignedQuantity: Number(valueOf(itemElement, '[data-food-field="assignedQuantity"]')) || 0, servingUnit: valueOf(itemElement, '[data-food-field="servingUnit"]'), notes: valueOf(itemElement, '[data-food-field="notes"]') }))
        }));
        return draft;
    }

    function selectOptions(items, current, label) {
        return `<option value="">${label}</option>${items.map((item) => `<option value="${item.id}" ${String(item.id) === String(current) ? 'selected' : ''}>${escapeHtml(itemName(item))}</option>`).join('')}`;
    }

    function renderWorkoutBuilder() {
        const draft = state.builder.draft;
        const content = $('coachingBuilderContent');
        const routines = draft.routines.map((routine, routineIndex) => `<article class="builder-routine" data-routine-index="${routineIndex}"><div class="builder-card-head"><div><span>اليوم ${routineIndex + 1}</span><strong>${escapeHtml(routine.name || 'يوم جديد')}</strong></div><button type="button" class="btn btn-danger btn-small" data-builder-action="remove-routine" data-index="${routineIndex}">حذف اليوم</button></div><div class="builder-inline-fields"><label>اسم اليوم<input data-routine-field="name" value="${escapeHtml(routine.name)}"></label><label>اليوم في الأسبوع<select data-routine-field="dayOfWeek"><option value="">—</option>${[1, 2, 3, 4, 5, 6, 7].map((day) => `<option value="${day}" ${Number(routine.dayOfWeek) === day ? 'selected' : ''}>اليوم ${day}</option>`).join('')}</select></label></div><div class="builder-exercises">${routine.exercises.map((exercise, exerciseIndex) => `<div class="builder-exercise" data-exercise-index="${exerciseIndex}"><div class="builder-exercise-head"><strong>تمرين ${exerciseIndex + 1}</strong><button type="button" class="btn btn-danger btn-small" data-builder-action="remove-exercise" data-routine="${routineIndex}" data-index="${exerciseIndex}">حذف</button></div><label class="builder-wide-label">التمرين<select data-exercise-field="exerciseId">${selectOptions(state.catalog.exercises, exercise.exerciseId, 'اختر تمرينًا')}</select></label><div class="builder-mini-grid"><label>مجموعات<input type="number" min="1" max="100" data-exercise-field="sets" value="${escapeHtml(exercise.sets)}"></label><label>تكرارات من<input type="number" min="1" data-exercise-field="repsMin" value="${escapeHtml(exercise.repsMin ?? '')}"></label><label>تكرارات إلى<input type="number" min="1" data-exercise-field="repsMax" value="${escapeHtml(exercise.repsMax ?? '')}"></label><label>الوزن كجم<input type="number" min="0" step="0.5" data-exercise-field="weightKg" value="${escapeHtml(exercise.weightKg ?? '')}"></label><label>الراحة بالثانية<input type="number" min="0" data-exercise-field="restSeconds" value="${escapeHtml(exercise.restSeconds ?? '')}"></label><label>Tempo<input data-exercise-field="tempo" value="${escapeHtml(exercise.tempo || '')}"></label></div></div>`).join('')}</div><button type="button" class="btn btn-light builder-add-item" data-builder-action="add-exercise" data-routine="${routineIndex}">+ إضافة تمرين</button></article>`).join('');
        content.innerHTML = `<div class="builder-switch"><span>برنامج تدريب</span><span class="builder-chip">حفظ ذري داخل قاعدة البيانات</span></div><div class="builder-basic-grid"><label>اسم البرنامج *<input required data-builder-field="name" value="${escapeHtml(draft.name)}"></label><label>البداية *<input required type="date" data-builder-field="startDate" value="${escapeHtml(draft.startDate)}"></label><label>النهاية<input type="date" data-builder-field="endDate" value="${escapeHtml(draft.endDate || '')}"></label><label>المدة بالأسابيع<input type="number" min="1" max="520" data-builder-field="durationWeeks" value="${escapeHtml(draft.durationWeeks || '')}"></label><label>الهدف<select data-builder-field="goal">${['بناء العضلات', 'زيادة القوة', 'حرق الدهون', 'لياقة عامة', 'التحمل'].map((item) => `<option ${item === draft.goal ? 'selected' : ''}>${item}</option>`).join('')}</select></label><label>المستوى<select data-builder-field="level">${['مبتدئ', 'متوسط', 'متقدم'].map((item) => `<option ${item === draft.level ? 'selected' : ''}>${item}</option>`).join('')}</select></label><label>أيام التدريب أسبوعيًا<input type="number" min="1" max="7" data-builder-field="daysPerWeek" value="${escapeHtml(draft.daysPerWeek || '')}"></label><label>الحالة<select data-builder-field="status">${Object.entries(STATUS_LABELS).map(([key, label]) => `<option value="${key}" ${draft.status === key ? 'selected' : ''}>${label}</option>`).join('')}</select></label></div><label class="builder-wide-label">وصف البرنامج<textarea data-builder-field="description" rows="2">${escapeHtml(draft.description || '')}</textarea></label><div class="builder-structure-head"><div><h4>بناء أيام التدريب</h4><small>أضف الأيام والتمارين من مكتبة TOP GYM.</small></div><button type="button" class="btn btn-primary btn-small" data-builder-action="add-routine">+ إضافة يوم</button></div><div class="builder-routines">${routines || '<div class="builder-empty">لم تضف أيامًا بعد.</div>'}</div><label class="builder-wide-label">ملاحظات<textarea data-builder-field="notes" rows="2">${escapeHtml(draft.notes || '')}</textarea></label>`;
    }

    function renderDietBuilder() {
        const draft = state.builder.draft;
        const content = $('coachingBuilderContent');
        const meals = draft.meals.map((meal, mealIndex) => `<article class="builder-meal" data-meal-index="${mealIndex}"><div class="builder-card-head"><div><span>وجبة ${mealIndex + 1}</span><strong>${escapeHtml(meal.name || 'وجبة جديدة')}</strong></div><button type="button" class="btn btn-danger btn-small" data-builder-action="remove-meal" data-index="${mealIndex}">حذف الوجبة</button></div><div class="builder-inline-fields"><label>اسم الوجبة<input data-meal-field="name" value="${escapeHtml(meal.name)}"></label><label>وقت الوجبة<input type="time" data-meal-field="mealTime" value="${escapeHtml(meal.mealTime || '')}"></label></div><div class="builder-foods">${meal.items.map((item, itemIndex) => `<div class="builder-food" data-food-index="${itemIndex}"><label>الطعام<select data-food-field="foodId">${selectOptions(state.catalog.foods, item.foodId, 'اختر طعامًا')}</select></label><label>الكمية<input type="number" min="0.1" step="0.1" data-food-field="assignedQuantity" value="${escapeHtml(item.assignedQuantity)}"></label><label>الوحدة<input data-food-field="servingUnit" value="${escapeHtml(item.servingUnit || '')}" placeholder="جرام"></label><button type="button" class="btn btn-danger btn-small" data-builder-action="remove-food" data-meal="${mealIndex}" data-index="${itemIndex}">حذف</button></div>`).join('')}</div><button type="button" class="btn btn-light builder-add-item" data-builder-action="add-food" data-meal="${mealIndex}">+ إضافة طعام</button></article>`).join('');
        const totals = draft.meals.reduce((total, meal) => meal.items.reduce((sum, item) => { const food = state.catalog.foods.find((candidate) => String(candidate.id) === String(item.foodId)); if (food) { const factor = Number(item.assignedQuantity || 0) / (Number(food.servingSize || 100) || 100); sum.calories += Number(food.calories || 0) * factor; sum.protein += Number(food.protein || 0) * factor; sum.carbs += Number(food.carbs || 0) * factor; sum.fats += Number(food.fat || 0) * factor; } return sum; }, total), { calories: 0, protein: 0, carbs: 0, fats: 0 });
        content.innerHTML = `<div class="builder-switch"><span>خطة تغذية</span><span class="builder-chip">القيم الغذائية Snapshot وقت الحفظ</span></div><div class="builder-basic-grid"><label>اسم الخطة *<input required data-builder-field="name" value="${escapeHtml(draft.name)}"></label><label>البداية *<input required type="date" data-builder-field="startDate" value="${escapeHtml(draft.startDate)}"></label><label>النهاية<input type="date" data-builder-field="endDate" value="${escapeHtml(draft.endDate || '')}"></label><label>عدد الوجبات<input type="number" min="1" max="12" data-builder-field="mealsPerDay" value="${escapeHtml(draft.mealsPerDay || '')}"></label><label>السعرات المستهدفة<input type="number" min="0" data-builder-field="targetCalories" value="${escapeHtml(draft.targetCalories || '')}"></label><label>البروتين المستهدف<input type="number" min="0" data-builder-field="targetProtein" value="${escapeHtml(draft.targetProtein || '')}"></label><label>الكربوهيدرات المستهدفة<input type="number" min="0" data-builder-field="targetCarbs" value="${escapeHtml(draft.targetCarbs || '')}"></label><label>الدهون المستهدفة<input type="number" min="0" data-builder-field="targetFats" value="${escapeHtml(draft.targetFats || '')}"></label><label>الحالة<select data-builder-field="status">${Object.entries(STATUS_LABELS).map(([key, label]) => `<option value="${key}" ${draft.status === key ? 'selected' : ''}>${label}</option>`).join('')}</select></label></div><div class="diet-live-summary"><span>المحسوب الآن <b>${number(totals.calories, 0)} سعر</b></span><span>بروتين <b>${number(totals.protein, 1)} ج</b></span><span>كربوهيدرات <b>${number(totals.carbs, 1)} ج</b></span><span>دهون <b>${number(totals.fats, 1)} ج</b></span></div><label class="builder-wide-label">وصف الخطة<textarea data-builder-field="description" rows="2">${escapeHtml(draft.description || '')}</textarea></label><div class="builder-structure-head"><div><h4>بناء الوجبات</h4><small>اختر الطعام والكمية، وسيحسب النظام القيم ويحفظها مع الخطة.</small></div><button type="button" class="btn btn-primary btn-small" data-builder-action="add-meal">+ إضافة وجبة</button></div><div class="builder-meals">${meals || '<div class="builder-empty">لم تضف وجبات بعد.</div>'}</div><label class="builder-wide-label">ملاحظات<textarea data-builder-field="notes" rows="2">${escapeHtml(draft.notes || '')}</textarea></label>`;
    }

    function renderBuilder() { if (state.builder?.type === 'workout') renderWorkoutBuilder(); else renderDietBuilder(); }

    async function openBuilder(type, memberId, id = null) {
        try {
            await loadCatalog();
            let draft = type === 'workout' ? blankWorkout(memberId) : blankDiet(memberId);
            if (id) draft = type === 'workout' ? await requestJson(`/api/workoutprograms/${id}`).then((data) => data.program) : await requestJson(`/api/dietplans/${id}`).then((data) => data.plan);
            state.builder = { type, memberId: Number(memberId), id: id ? Number(id) : null, draft };
            $('coachingBuilderId').value = id || '';
            $('coachingBuilderMemberId').value = memberId;
            $('coachingBuilderTitle').textContent = `${id ? 'تعديل' : 'إنشاء'} ${type === 'workout' ? 'برنامج تدريب' : 'خطة تغذية'}`;
            $('coachingBuilderSubtitle').textContent = `العميل: ${draft.memberName || state.profile?.member?.fullName || 'العميل الحالي'} · الحفظ يتم بالكامل داخل Transaction واحدة.`;
            renderBuilder();
            openDialog($('coachingBuilderDialog'));
        } catch (error) { notify(error.message, 'error'); }
    }

    function handleBuilderAction(button) {
        if (!state.builder) return;
        const draft = state.builder.type === 'workout' ? readWorkoutDraft() : readDietDraft();
        const action = button.dataset.builderAction;
        const index = Number(button.dataset.index);
        if (state.builder.type === 'workout') {
            if (action === 'add-routine') draft.routines.push({ name: `اليوم ${draft.routines.length + 1}`, dayOfWeek: draft.routines.length + 1, sortOrder: draft.routines.length, notes: '', exercises: [{ ...blankWorkout(state.builder.memberId).routines[0].exercises[0] }] });
            if (action === 'remove-routine') draft.routines.splice(index, 1);
            if (action === 'add-exercise') draft.routines[Number(button.dataset.routine)]?.exercises.push({ ...blankWorkout(state.builder.memberId).routines[0].exercises[0] });
            if (action === 'remove-exercise') draft.routines[Number(button.dataset.routine)]?.exercises.splice(index, 1);
        } else {
            if (action === 'add-meal') draft.meals.push({ name: `وجبة ${draft.meals.length + 1}`, mealTime: '', sortOrder: draft.meals.length, notes: '', items: [{ ...blankDiet(state.builder.memberId).meals[0].items[0] }] });
            if (action === 'remove-meal') draft.meals.splice(index, 1);
            if (action === 'add-food') draft.meals[Number(button.dataset.meal)]?.items.push({ ...blankDiet(state.builder.memberId).meals[0].items[0] });
            if (action === 'remove-food') draft.meals[Number(button.dataset.meal)]?.items.splice(index, 1);
        }
        state.builder.draft = draft;
        renderBuilder();
    }

    async function saveBuilder(event) {
        event.preventDefault();
        if (!state.builder) return;
        const draft = state.builder.type === 'workout' ? readWorkoutDraft() : readDietDraft();
        draft.memberId = state.builder.memberId;
        if (state.builder.id) draft.version = state.builder.draft.version;
        const button = $('coachingBuilderSave');
        button.disabled = true;
        try {
            const base = state.builder.type === 'workout' ? '/api/workoutprograms' : '/api/dietplans';
            await requestJson(state.builder.id ? `${base}/${state.builder.id}` : base, { method: state.builder.id ? 'PUT' : 'POST', body: JSON.stringify(draft) });
            closeDialog($('coachingBuilderDialog'));
            notify(`تم ${state.builder.id ? 'تعديل' : 'إنشاء'} ${state.builder.type === 'workout' ? 'برنامج التدريب' : 'خطة التغذية'} بنجاح.`);
            const memberId = state.builder.memberId;
            state.builder = null;
            state.loaded = false;
            await loadTrainees(true);
            if ($('coachingProfileDialog')?.open) openProfile(memberId);
            window.dispatchEvent(new CustomEvent('topgym:coaching-updated', { detail: { memberId } }));
        } catch (error) { notify(error.message, 'error'); }
        finally { button.disabled = false; }
    }

    function ensureMeasurementDialog() {
        if ($('measurementDialog')) return $('measurementDialog');
        const dialog = document.createElement('dialog');
        dialog.id = 'measurementDialog';
        dialog.className = 'coaching-small-dialog rounded-lg border-slate-200 shadow-lift';
        dialog.innerHTML = `<form class="dialog-body" id="measurementForm"><div class="details-dialog-head"><div><h3 id="measurementTitle">إضافة قياس</h3><p>سجل القياسات لمتابعة التقدم مع مرور الوقت.</p></div><button class="btn btn-light btn-small" type="button" data-close-measurement>إغلاق</button></div><input type="hidden" id="measurementId"><input type="hidden" id="measurementMemberId"><div class="field-grid"><label>التاريخ<input id="measurementDate" type="date" required></label><label>الوزن كجم<input id="measurementWeight" type="number" min="0" step="0.1"></label><label>الطول سم<input id="measurementHeight" type="number" min="0" step="0.1"></label><label>نسبة الدهون %<input id="measurementFat" type="number" min="0" max="100" step="0.1"></label><label>الصدر سم<input id="measurementChest" type="number" min="0" step="0.1"></label><label>الخصر سم<input id="measurementWaist" type="number" min="0" step="0.1"></label><label>الأرداف سم<input id="measurementHips" type="number" min="0" step="0.1"></label><label>الذراع سم<input id="measurementArms" type="number" min="0" step="0.1"></label><label>الفخذ سم<input id="measurementThighs" type="number" min="0" step="0.1"></label></div><label class="builder-wide-label">ملاحظات<textarea id="measurementNotes" rows="2"></textarea></label><div class="dialog-actions"><button class="btn btn-light" type="button" data-close-measurement>إلغاء</button><button class="btn btn-primary" type="submit">حفظ القياس</button></div></form>`;
        document.body.appendChild(dialog);
        dialog.addEventListener('click', (event) => { if (event.target.matches('[data-close-measurement]')) closeDialog(dialog); });
        dialog.querySelector('form').addEventListener('submit', saveMeasurement);
        return dialog;
    }

    function openMeasurementDialog(memberId, measurement = null) {
        ensureMeasurementDialog();
        $('measurementTitle').textContent = measurement ? 'تعديل القياس' : 'إضافة قياس';
        $('measurementId').value = measurement?.id || '';
        $('measurementMemberId').value = memberId;
        $('measurementDate').value = measurement?.measuredAt || today();
        [['measurementWeight', 'weightKg'], ['measurementHeight', 'heightCm'], ['measurementFat', 'bodyFatPercent'], ['measurementChest', 'chestCm'], ['measurementWaist', 'waistCm'], ['measurementHips', 'hipsCm'], ['measurementArms', 'armsCm'], ['measurementThighs', 'thighsCm'], ['measurementNotes', 'notes']].forEach(([field, key]) => { $(field).value = measurement?.[key] ?? ''; });
        openDialog($('measurementDialog'));
    }

    async function saveMeasurement(event) {
        event.preventDefault();
        const memberId = $('measurementMemberId').value;
        const id = $('measurementId').value;
        const body = { measuredAt: $('measurementDate').value, weightKg: $('measurementWeight').value || null, heightCm: $('measurementHeight').value || null, bodyFatPercent: $('measurementFat').value || null, chestCm: $('measurementChest').value || null, waistCm: $('measurementWaist').value || null, hipsCm: $('measurementHips').value || null, armsCm: $('measurementArms').value || null, thighsCm: $('measurementThighs').value || null, notes: $('measurementNotes').value };
        try {
            await requestJson(id ? `/api/clients/${memberId}/measurements/${id}` : `/api/clients/${memberId}/measurements`, { method: id ? 'PUT' : 'POST', body: JSON.stringify(body) });
            closeDialog($('measurementDialog'));
            notify('تم حفظ القياس بنجاح.');
            if ($('coachingProfileDialog')?.open) openProfile(memberId);
        } catch (error) { notify(error.message, 'error'); }
    }

    function ensureSubscriptionDialog() {
        if ($('coachingSubscriptionDialog')) return $('coachingSubscriptionDialog');
        const dialog = document.createElement('dialog');
        dialog.id = 'coachingSubscriptionDialog';
        dialog.className = 'coaching-small-dialog rounded-lg border-slate-200 shadow-lift';
        dialog.innerHTML = `<form class="dialog-body" id="coachingSubscriptionForm"><div class="details-dialog-head"><div><h3>إضافة اشتراك Gym</h3><p>سيتم ربط الاشتراك بنفس ملف العميل الحالي دون إنشاء نسخة جديدة.</p></div><button class="btn btn-light btn-small" type="button" data-close-subscription>إغلاق</button></div><input type="hidden" id="subscriptionMemberId"><div class="field-grid"><label>الباقة<select id="subscriptionPlan"><option value="gym_only">جيم فقط</option><option value="gym_cardio">جيم وكارديو</option></select></label><label>النوع<select id="subscriptionType"><option value="monthly">شهرية</option><option value="half_month">نصف شهر</option><option value="quarterly">ربع سنوية</option><option value="semiannual">نصف سنوية</option><option value="annual">سنوية</option></select></label><label>تاريخ البداية<input id="subscriptionStart" type="date" required></label><label>المبلغ المدفوع<input id="subscriptionPaid" type="number" min="0" step="0.01" value="0"></label><label>الخصم<input id="subscriptionDiscount" type="number" min="0" step="0.01" value="0"></label></div><div class="dialog-actions"><button class="btn btn-light" type="button" data-close-subscription>إلغاء</button><button class="btn btn-primary" type="submit">حفظ الاشتراك</button></div></form>`;
        document.body.appendChild(dialog);
        dialog.addEventListener('click', (event) => { if (event.target.matches('[data-close-subscription]')) closeDialog(dialog); });
        dialog.querySelector('form').addEventListener('submit', saveSubscription);
        return dialog;
    }

    function ensureClientEditDialog() {
        if ($('coachingClientEditDialog')) return $('coachingClientEditDialog');
        const dialog = document.createElement('dialog');
        dialog.id = 'coachingClientEditDialog';
        dialog.className = 'coaching-small-dialog rounded-lg border-slate-200 shadow-lift';
        dialog.innerHTML = `<form class="dialog-body" id="coachingClientEditForm"><div class="details-dialog-head"><div><h3>تعديل بيانات العميل</h3><p>يتم تحديث الهوية نفسها، ولن تتأثر البرامج أو الخطط أو القياسات.</p></div><button class="btn btn-light btn-small" type="button" data-close-client-edit>إغلاق</button></div><input type="hidden" id="coachingEditMemberId"><div class="field"><label>الاسم الكامل *<input id="coachingEditName" maxlength="120" required></label></div><div class="field-grid"><label>رقم الهاتف *<input id="coachingEditPhone" inputmode="tel" maxlength="30" required></label><label>البريد الإلكتروني<input id="coachingEditEmail" type="email" maxlength="254"></label></div><div class="field"><label>الملاحظات<textarea id="coachingEditNotes" rows="3" maxlength="1000"></textarea></label></div><div class="dialog-actions"><button class="btn btn-light" type="button" data-close-client-edit>إلغاء</button><button class="btn btn-primary" type="submit">حفظ التعديلات</button></div></form>`;
        document.body.appendChild(dialog);
        dialog.addEventListener('click', (event) => { if (event.target.matches('[data-close-client-edit]')) closeDialog(dialog); });
        dialog.querySelector('form').addEventListener('submit', saveClientEdit);
        return dialog;
    }

    function openClientEditDialog(member) {
        ensureClientEditDialog();
        $('coachingEditMemberId').value = member.id;
        $('coachingEditName').value = member.fullName || '';
        $('coachingEditPhone').value = member.phone || '';
        $('coachingEditEmail').value = member.email || '';
        $('coachingEditNotes').value = member.notes || '';
        openDialog($('coachingClientEditDialog'));
    }

    async function saveClientEdit(event) {
        event.preventDefault();
        const memberId = $('coachingEditMemberId').value;
        try {
            const data = await requestJson(`/api/clients/${memberId}`, { method: 'PUT', body: JSON.stringify({ fullName: $('coachingEditName').value, phone: $('coachingEditPhone').value, email: $('coachingEditEmail').value, notes: $('coachingEditNotes').value }) });
            closeDialog($('coachingClientEditDialog'));
            notify('تم تحديث بيانات العميل.');
            if ($('coachingProfileDialog')?.open) openProfile(data.member.id);
            state.loaded = false;
            loadTrainees(true);
        } catch (error) { notify(error.message, 'error'); }
    }

    function openSubscriptionDialog(memberId) { ensureSubscriptionDialog(); $('subscriptionMemberId').value = memberId; $('subscriptionStart').value = today(); openDialog($('coachingSubscriptionDialog')); }

    async function saveSubscription(event) {
        event.preventDefault();
        try {
            const memberId = $('subscriptionMemberId').value;
            await requestJson(`/api/members/${memberId}/memberships`, { method: 'POST', body: JSON.stringify({ membershipPlan: $('subscriptionPlan').value, membershipType: $('subscriptionType').value, startDate: $('subscriptionStart').value, amountPaid: Number($('subscriptionPaid').value || 0), discountAmount: Number($('subscriptionDiscount').value || 0), paymentMethod: 'cash' }) });
            closeDialog($('coachingSubscriptionDialog'));
            closeDialog($('coachingProfileDialog'));
            state.loaded = false;
            await loadTrainees(true);
            notify('تم ربط الاشتراك بنفس العميل. سيظهر الآن في شاشة المشتركين بدون تكرار.');
            window.topGymActivateTab?.('members');
            window.dispatchEvent(new CustomEvent('topgym:coaching-updated', { detail: { memberId } }));
        } catch (error) { notify(error.message, 'error'); }
    }

    function renderMemberTrainingPanel(memberId) {
        const content = $('detailsContent');
        if (!content || !memberId) return;
        content.querySelector('[data-member-training-panel]')?.remove();
        const panel = document.createElement('section');
        panel.className = 'member-training-panel';
        panel.dataset.memberTrainingPanel = 'true';
        panel.innerHTML = '<div class="loading">جاري تحميل أنظمة التدريب والتغذية…</div>';
        content.appendChild(panel);
        requestJson(`/api/clients/${memberId}/training-overview`).then((overview) => {
            const workout = overview.workoutPrograms || [];
            const diets = overview.dietPlans || [];
            panel.innerHTML = `<div class="member-training-head"><div><span>امتداد ملف العميل</span><h4>التدريب والتغذية</h4><small>يمكن إنشاء الأنظمة للمشترك بدون تغيير نظام العضوية الحالي.</small></div><div><button class="btn btn-primary btn-small" data-member-coaching-action="new-workout" data-id="${memberId}">+ تدريب</button><button class="btn btn-light btn-small" data-member-coaching-action="new-diet" data-id="${memberId}">+ تغذية</button><button class="btn btn-light btn-small" data-member-coaching-action="new-measurement" data-id="${memberId}">+ قياس</button></div></div><div class="member-training-systems">${[...workout.map((item) => `<div><span class="system-type workout">تدريب</span><strong>${escapeHtml(item.name)}</strong><small>${number(item.exerciseCount, 0)} تمرين · ${STATUS_LABELS[item.status] || item.status}</small><button class="btn btn-light btn-small" data-member-coaching-action="edit-workout" data-id="${item.id}" data-member-id="${memberId}">تعديل</button></div>`), ...diets.map((item) => `<div><span class="system-type diet">تغذية</span><strong>${escapeHtml(item.name)}</strong><small>${number(item.itemCount, 0)} طعام · ${STATUS_LABELS[item.status] || item.status}</small><button class="btn btn-light btn-small" data-member-coaching-action="edit-diet" data-id="${item.id}" data-member-id="${memberId}">تعديل</button></div>`)].join('') || '<div class="profile-empty">لا توجد أنظمة مرتبطة بهذا العميل حتى الآن.</div>'}</div><div class="member-progress-line"><span>القياسات: <b>${number(overview.measurements?.length, 0)}</b></span><span>الجلسات المكتملة: <b>${number(overview.progress.completedSessions, 0)}</b></span><span>تسجيلات الوجبات: <b>${number(overview.progress.mealLogCount, 0)}</b></span></div>`;
        }).catch((error) => { panel.innerHTML = `<div class="coaching-empty error">${escapeHtml(error.message)}</div>`; });
    }

    async function handleProfileAction(action, id) {
        const memberId = state.profile?.member?.id;
        if (!memberId) return;
        if (action === 'new-workout') return openBuilder('workout', memberId);
        if (action === 'new-diet') return openBuilder('diet', memberId);
        if (action === 'edit-workout') return openBuilder('workout', memberId, id);
        if (action === 'edit-diet') return openBuilder('diet', memberId, id);
        if (action === 'new-measurement') return openMeasurementDialog(memberId);
        if (action === 'subscribe') return openSubscriptionDialog(memberId);
        if (action === 'edit-client') return openClientEditDialog(state.profile.member);
        if (action === 'delete') return;
        if (action === 'edit-measurement') {
            const item = (state.profile.measurements || []).find((measurement) => String(measurement.id) === String(id));
            return openMeasurementDialog(memberId, item);
        }
        if (action === 'delete-measurement') {
            if (!window.confirm('هل تريد حذف هذا القياس؟')) return;
            try { await requestJson(`/api/clients/${memberId}/measurements/${id}`, { method: 'DELETE' }); notify('تم حذف القياس.'); openProfile(memberId); } catch (error) { notify(error.message, 'error'); }
        }
    }

    function handleMemberCoachingAction(button) {
        const memberId = button.dataset.memberId || button.dataset.id;
        const action = button.dataset.memberCoachingAction;
        if (!memberId || !action) return;
        if (action === 'new-workout') openBuilder('workout', memberId);
        else if (action === 'new-diet') openBuilder('diet', memberId);
        else if (action === 'edit-workout') openBuilder('workout', memberId, button.dataset.id);
        else if (action === 'edit-diet') openBuilder('diet', memberId, button.dataset.id);
        else if (action === 'new-measurement') openMeasurementDialog(memberId);
    }

    document.addEventListener('DOMContentLoaded', () => {
        $('externalTraineeForm')?.addEventListener('submit', submitExternalTrainee);
        $('externalTraineeClose')?.addEventListener('click', () => closeDialog($('externalTraineeDialog')));
        $('externalTraineeCancel')?.addEventListener('click', () => closeDialog($('externalTraineeDialog')));
        $('addExternalTraineeButton')?.addEventListener('click', () => { renderExternalForm(); openDialog($('externalTraineeDialog')); });
        $('externalTraineeRefreshButton')?.addEventListener('click', () => { state.page = 1; state.loaded = false; loadTrainees(true); });
        $('externalTraineeSearch')?.addEventListener('input', () => { window.clearTimeout(state.searchTimer); state.searchTimer = window.setTimeout(() => { state.page = 1; state.loaded = false; loadTrainees(true); }, 300); });
        $('externalTraineesList')?.addEventListener('click', (event) => { const button = event.target.closest('[data-coaching-action]'); if (!button) return; const id = button.dataset.id; if (button.dataset.coachingAction === 'profile') openProfile(id); else if (button.dataset.coachingAction === 'workout') openBuilder('workout', id); else if (button.dataset.coachingAction === 'diet') openBuilder('diet', id); });
        $('externalTraineesPagination')?.addEventListener('click', (event) => { const button = event.target.closest('[data-coaching-page]'); if (!button || button.disabled) return; state.page += button.dataset.coachingPage === 'next' ? 1 : -1; state.loaded = false; loadTrainees(true); });
        $('coachingProfileClose')?.addEventListener('click', () => closeDialog($('coachingProfileDialog')));
        $('coachingBuilderClose')?.addEventListener('click', () => closeDialog($('coachingBuilderDialog')));
        $('coachingBuilderCancel')?.addEventListener('click', () => closeDialog($('coachingBuilderDialog')));
        $('coachingBuilderForm')?.addEventListener('submit', saveBuilder);
        $('coachingBuilderContent')?.addEventListener('click', (event) => { const button = event.target.closest('[data-builder-action]'); if (button) handleBuilderAction(button); });
        $('detailsContent')?.addEventListener('click', (event) => { const button = event.target.closest('[data-member-coaching-action]'); if (button) handleMemberCoachingAction(button); });
        $('coachingProfileContent')?.addEventListener('click', (event) => { const button = event.target.closest('[data-profile-action], [data-measurement-action]'); if (!button) return; const action = button.dataset.profileAction || (button.dataset.measurementAction === 'edit' ? 'edit-measurement' : 'delete-measurement'); handleProfileAction(action, button.dataset.id); });
        window.addEventListener('topgym:tab-changed', (event) => { if (event.detail?.name === 'trainees') loadTrainees(); });
        window.addEventListener('topgym:member-details-opened', (event) => renderMemberTrainingPanel(event.detail?.member?.id || event.detail?.details?.member?.id));
        window.addEventListener('topgym:coaching-updated', (event) => { if (event.detail?.memberId && $('detailsDialog')?.open) renderMemberTrainingPanel(event.detail.memberId); });
    });
})();
