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
        if (['error', 'warning'].includes(type) && window.topGymShowDialogValidation?.(message, type)) return;
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

    async function openBuilder(type, memberId, id = null, memberName = '') {
        try {
            await loadCatalog();
            let draft = type === 'workout' ? blankWorkout(memberId) : blankDiet(memberId);
            if (id) draft = type === 'workout' ? await requestJson(`/api/workoutprograms/${id}`).then((data) => data.program) : await requestJson(`/api/dietplans/${id}`).then((data) => data.plan);
            state.builder = { type, memberId: Number(memberId), id: id ? Number(id) : null, draft };
            $('coachingBuilderId').value = id || '';
            $('coachingBuilderMemberId').value = memberId;
            $('coachingBuilderTitle').textContent = `${id ? 'تعديل' : 'إنشاء'} ${type === 'workout' ? 'برنامج تدريب' : 'خطة تغذية'}`;
            $('coachingBuilderSubtitle').textContent = `العميل: ${memberName || draft.memberName || state.profile?.member?.fullName || 'العميل الحالي'} · الحفظ يتم بالكامل داخل Transaction واحدة.`;
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

    /* Builder v2: staged workflow, live calculations, compact rows and review before save. */
    function builderOptionList(items, current, placeholder, getLabel = itemName) {
        return `<option value="">${escapeHtml(placeholder)}</option>${(items || []).map((item) => `<option value="${escapeHtml(item.id)}" ${String(item.id) === String(current) ? 'selected' : ''}>${escapeHtml(getLabel(item))}</option>`).join('')}`;
    }

    async function loadBuilderClients() {
        if (state.builderClients?.length) return state.builderClients;
        try {
            const data = await requestJson('/api/coaching/clients?limit=300');
            state.builderClients = data.clients || [];
        } catch (_) {
            state.builderClients = [];
        }
        return state.builderClients;
    }

    function builderClientOptions(selectedId, memberName = '') {
        const clients = [...(state.builderClients || [])];
        if (selectedId && !clients.some((client) => String(client.id) === String(selectedId))) clients.unshift({ id: selectedId, fullName: memberName || 'العميل الحالي', phone: '' });
        return builderOptionList(clients, selectedId, 'اختر العميل', (client) => `${client.fullName || 'عميل'}${client.phone ? ` · ${client.phone}` : ''}`);
    }

    function builderValue(root, selector, fallback = '') {
        return root?.querySelector(selector)?.value ?? fallback;
    }

    function builderNum(value, digits = 0) {
        const parsed = Number(value);
        return Number.isFinite(parsed) ? parsed.toLocaleString('ar-EG', { maximumFractionDigits: digits }) : '—';
    }

    function builderDate(value) {
        if (!value) return '—';
        try { return new Intl.DateTimeFormat('ar-EG', { dateStyle: 'medium' }).format(new Date(`${String(value).slice(0, 10)}T00:00:00`)); } catch (_) { return String(value); }
    }

    function blankBuilderWorkout(memberId, memberName = '') {
        const exerciseId = state.catalog.exercises[0]?.id || '';
        return { memberId: Number(memberId), memberName, name: '', description: '', startDate: today(), endDate: '', durationWeeks: 4, goal: 'بناء العضلات', level: 'مبتدئ', daysPerWeek: 3, status: 'active', notes: '', version: null, routines: [{ name: 'اليوم الأول', dayOfWeek: 1, sortOrder: 0, notes: '', exercises: [{ exerciseId, sortOrder: 0, sets: 3, repsMin: 10, repsMax: 12, weightKg: '', restSeconds: 90, tempo: '', supersetGroupId: '', notes: '' }] }] };
    }

    function blankBuilderDiet(memberId, memberName = '') {
        const foodId = state.catalog.foods[0]?.id || '';
        const names = ['الفطور', 'وجبة خفيفة', 'الغداء', 'العشاء'];
        return { memberId: Number(memberId), memberName, name: '', description: '', startDate: today(), endDate: '', mealsPerDay: 4, targetCalories: 2200, targetProtein: 165, targetCarbs: 220, targetFats: 73, calorieGoal: 'maintain', calorieAdjustment: 0, calculator: { weightKg: '', heightCm: '', age: '', gender: 'male', activity: 'moderate', bmr: null, tdee: null, measurementDate: '' }, status: 'active', notes: '', version: null, meals: names.map((name, index) => ({ name, mealTime: '', sortOrder: index, notes: '', items: [{ foodId, sortOrder: 0, assignedQuantity: 100, servingUnit: '', notes: '' }] })) };
    }

    function readBuilderWorkoutDraft() {
        const draft = state.builder.draft;
        const content = $('coachingBuilderContent');
        const memberId = Number(builderValue(content, '[data-builder-field="memberId"]', draft.memberId));
        if (memberId) draft.memberId = memberId;
        draft.name = builderValue(content, '[data-builder-field="name"]', draft.name);
        draft.description = builderValue(content, '[data-builder-field="description"]', draft.description);
        draft.startDate = builderValue(content, '[data-builder-field="startDate"]', draft.startDate);
        draft.endDate = builderValue(content, '[data-builder-field="endDate"]', draft.endDate);
        draft.durationWeeks = Number(builderValue(content, '[data-builder-field="durationWeeks"]', draft.durationWeeks)) || null;
        draft.goal = builderValue(content, '[data-builder-field="goal"]', draft.goal);
        draft.level = builderValue(content, '[data-builder-field="level"]', draft.level);
        draft.daysPerWeek = Number(builderValue(content, '[data-builder-field="daysPerWeek"]', draft.daysPerWeek)) || null;
        draft.status = builderValue(content, '[data-builder-field="status"]', draft.status || 'active');
        draft.notes = builderValue(content, '[data-builder-field="notes"]', draft.notes);
        const routineElements = [...content.querySelectorAll('[data-routine-index]')];
        if (routineElements.length) draft.routines = routineElements.map((routineElement, routineIndex) => ({
            name: builderValue(routineElement, '[data-routine-field="name"]', `اليوم ${routineIndex + 1}`),
            dayOfWeek: Number(builderValue(routineElement, '[data-routine-field="dayOfWeek"]')) || null,
            sortOrder: routineIndex,
            notes: builderValue(routineElement, '[data-routine-field="notes"]'),
            exercises: [...routineElement.querySelectorAll('[data-exercise-index]')].map((exerciseElement, exerciseIndex) => ({
                exerciseId: Number(builderValue(exerciseElement, '[data-exercise-field="exerciseId"]')) || '',
                sortOrder: exerciseIndex,
                sets: Number(builderValue(exerciseElement, '[data-exercise-field="sets"]')) || 3,
                repsMin: Number(builderValue(exerciseElement, '[data-exercise-field="repsMin"]')) || null,
                repsMax: Number(builderValue(exerciseElement, '[data-exercise-field="repsMax"]')) || null,
                weightKg: builderValue(exerciseElement, '[data-exercise-field="weightKg"]'),
                restSeconds: Number(builderValue(exerciseElement, '[data-exercise-field="restSeconds"]')) || 0,
                tempo: builderValue(exerciseElement, '[data-exercise-field="tempo"]'),
                supersetGroupId: builderValue(exerciseElement, '[data-exercise-field="supersetGroupId"]'),
                notes: builderValue(exerciseElement, '[data-exercise-field="notes"]')
            }))
        }));
        return draft;
    }

    function readBuilderDietDraft() {
        const draft = state.builder.draft;
        const content = $('coachingBuilderContent');
        const memberId = Number(builderValue(content, '[data-builder-field="memberId"]', draft.memberId));
        if (memberId) draft.memberId = memberId;
        draft.name = builderValue(content, '[data-builder-field="name"]', draft.name);
        draft.description = builderValue(content, '[data-builder-field="description"]', draft.description);
        draft.startDate = builderValue(content, '[data-builder-field="startDate"]', draft.startDate);
        draft.endDate = builderValue(content, '[data-builder-field="endDate"]', draft.endDate);
        draft.mealsPerDay = Number(builderValue(content, '[data-builder-field="mealsPerDay"]', draft.mealsPerDay)) || null;
        for (const field of ['targetCalories', 'targetProtein', 'targetCarbs', 'targetFats', 'calorieAdjustment']) draft[field] = Number(builderValue(content, `[data-builder-field="${field}"]`, draft[field])) || 0;
        draft.calorieGoal = builderValue(content, '[data-builder-field="calorieGoal"]', draft.calorieGoal || 'maintain');
        draft.status = builderValue(content, '[data-builder-field="status"]', draft.status || 'active');
        draft.notes = builderValue(content, '[data-builder-field="notes"]', draft.notes);
        draft.calculator = { ...(draft.calculator || {}) };
        for (const field of ['weightKg', 'heightCm', 'age', 'gender', 'activity']) draft.calculator[field] = builderValue(content, `[data-calculator-field="${field}"]`, draft.calculator[field] || '');
        const mealElements = [...content.querySelectorAll('[data-meal-index]')];
        if (mealElements.length) draft.meals = mealElements.map((mealElement, mealIndex) => ({
            name: builderValue(mealElement, '[data-meal-field="name"]', `وجبة ${mealIndex + 1}`),
            mealTime: builderValue(mealElement, '[data-meal-field="mealTime"]'),
            sortOrder: mealIndex,
            notes: builderValue(mealElement, '[data-meal-field="notes"]'),
            items: [...mealElement.querySelectorAll('[data-food-index]')].map((itemElement, itemIndex) => ({
                foodId: Number(builderValue(itemElement, '[data-food-field="foodId"]')) || '',
                sortOrder: itemIndex,
                assignedQuantity: Number(builderValue(itemElement, '[data-food-field="assignedQuantity"]')) || 0,
                servingUnit: builderValue(itemElement, '[data-food-field="servingUnit"]'),
                notes: builderValue(itemElement, '[data-food-field="notes"]')
            }))
        }));
        return draft;
    }

    function activeBuilderDraft() {
        return state.builder.type === 'diet' ? readBuilderDietDraft() : readBuilderWorkoutDraft();
    }

    function dietFoodMetrics(item) {
        const food = state.catalog.foods.find((candidate) => String(candidate.id) === String(item.foodId));
        if (!food) return { food: null, calories: 0, protein: 0, carbs: 0, fats: 0 };
        const factor = Number(item.assignedQuantity || 0) / (Number(food.servingSize || 100) || 100);
        return { food, calories: Number(food.calories || 0) * factor, protein: Number(food.protein || 0) * factor, carbs: Number(food.carbs || 0) * factor, fats: Number(food.fat || 0) * factor };
    }

    function dietMealTotals(meal) {
        return meal.items.reduce((total, item) => { const values = dietFoodMetrics(item); total.calories += values.calories; total.protein += values.protein; total.carbs += values.carbs; total.fats += values.fats; return total; }, { calories: 0, protein: 0, carbs: 0, fats: 0 });
    }

    function dietTotals(draft) {
        return draft.meals.reduce((total, meal) => { const values = dietMealTotals(meal); total.calories += values.calories; total.protein += values.protein; total.carbs += values.carbs; total.fats += values.fats; return total; }, { calories: 0, protein: 0, carbs: 0, fats: 0 });
    }

    function syncDietMealCount(draft, count) {
        const desired = Math.min(6, Math.max(3, Number(count) || 4));
        const names = ['Ø§Ù„ÙØ·ÙˆØ±', 'ÙˆØ¬Ø¨Ø© Ø®ÙÙŠÙØ©', 'Ø§Ù„ØºØ¯Ø§Ø¡', 'Ø§Ù„Ø¹Ø´Ø§Ø¡', 'ÙˆØ¬Ø¨Ø© Ø®ÙÙŠÙØ© 2', 'ÙˆØ¬Ø¨Ø© Ø®ÙÙŠÙØ© 3'];
        while (draft.meals.length < desired) {
            const index = draft.meals.length;
            draft.meals.push({ name: names[index] || `ÙˆØ¬Ø¨Ø© ${index + 1}`, mealTime: '', sortOrder: index, notes: '', items: [{ foodId: state.catalog.foods[0]?.id || '', sortOrder: 0, assignedQuantity: 100, servingUnit: '', notes: '' }] });
        }
        if (draft.meals.length > desired) draft.meals = draft.meals.slice(0, desired);
        draft.meals.forEach((meal, index) => { meal.sortOrder = index; if (!meal.name) meal.name = names[index] || `ÙˆØ¬Ø¨Ø© ${index + 1}`; });
        draft.mealsPerDay = desired;
        return draft;
    }

    function calculateDietEnergy(draft) {
        const calculator = draft.calculator || {};
        const weight = Number(calculator.weightKg);
        const height = Number(calculator.heightCm);
        const age = Number(calculator.age);
        if (![weight, height, age].every((value) => Number.isFinite(value) && value > 0)) return null;
        const bmr = (calculator.gender || 'male') === 'female' ? (10 * weight) + (6.25 * height) - (5 * age) - 161 : (10 * weight) + (6.25 * height) - (5 * age) + 5;
        const activityFactors = { sedentary: 1.2, light: 1.375, moderate: 1.55, high: 1.725, very_high: 1.9 };
        const tdee = bmr * (activityFactors[calculator.activity] || activityFactors.moderate);
        const adjustment = Number(draft.calorieAdjustment || 0);
        return { bmr, tdee, target: Math.max(0, tdee + adjustment) };
    }

    function applyDietCalories() {
        const draft = readBuilderDietDraft();
        const result = calculateDietEnergy(draft);
        if (!result) { notify('أدخل الوزن والطول والعمر أولاً لحساب السعرات.', 'error'); return; }
        draft.calculator.bmr = result.bmr;
        draft.calculator.tdee = result.tdee;
        draft.targetCalories = Math.round(result.target);
        draft.targetProtein = Math.round((draft.targetCalories * 0.30) / 4);
        draft.targetCarbs = Math.round((draft.targetCalories * 0.40) / 4);
        draft.targetFats = Math.round((draft.targetCalories * 0.30) / 9);
        state.builder.draft = draft;
        renderBuilder();
        notify('تم تطبيق السعرات والماكروز بتوزيع 30% بروتين · 40% كارب · 30% دهون.');
    }

    function workoutStats(draft) {
        const muscles = {};
        let exercises = 0;
        let sets = 0;
        let volume = 0;
        draft.routines.forEach((routine) => routine.exercises.forEach((exercise) => {
            exercises += 1;
            sets += Number(exercise.sets || 0);
            const reps = ((Number(exercise.repsMin) || 0) + (Number(exercise.repsMax) || Number(exercise.repsMin) || 0)) / 2;
            volume += Number(exercise.sets || 0) * reps * Number(exercise.weightKg || 0);
            const libraryExercise = state.catalog.exercises.find((candidate) => String(candidate.id) === String(exercise.exerciseId));
            const muscle = libraryExercise?.targetMuscleNameAr || libraryExercise?.targetMuscleName || 'غير محددة';
            muscles[muscle] = (muscles[muscle] || 0) + Number(exercise.sets || 0);
        }));
        return { exercises, sets, volume, muscles };
    }

    function builderBasicComplete(draft) {
        return Boolean(Number(draft.memberId) > 0 && String(draft.name || '').trim() && draft.startDate);
    }

    function builderStructureComplete(draft) {
        if (state.builder.type === 'diet') return draft.meals.length > 0 && draft.meals.every((meal) => meal.items.length > 0 && meal.items.every((item) => Number(item.foodId) > 0 && Number(item.assignedQuantity) > 0));
        return draft.routines.length > 0 && draft.routines.every((routine) => routine.exercises.length > 0 && routine.exercises.every((exercise) => Number(exercise.exerciseId) > 0));
    }

    function renderBuilderChrome() {
        const step = state.builder.step;
        const steps = state.builder.type === 'diet' ? ['المعلومات وحساب السعرات', 'بناء الوجبات', 'المراجعة والحفظ'] : ['بيانات البرنامج', 'بناء الأيام والتمارين', 'المراجعة والحفظ'];
        $('coachingBuilderStepper').innerHTML = steps.map((label, index) => { const number = index + 1; return `<button type="button" class="builder-step ${number === step ? 'active' : ''} ${number < step ? 'complete' : ''}" data-builder-step-target="${number}" ${number > step ? 'disabled' : ''}><span>${number}</span><strong>${label}</strong></button>`; }).join('');
        const draft = state.builder.draft;
        const basicDone = builderBasicComplete(draft);
        const structureDone = builderStructureComplete(draft);
        const structureCount = state.builder.type === 'diet' ? `${draft.meals.length} وجبات · ${draft.meals.reduce((sum, meal) => sum + meal.items.length, 0)} أطعمة` : `${draft.routines.length} أيام · ${workoutStats(draft).exercises} تمارين`;
        $('coachingBuilderProgress').innerHTML = `<div class="builder-progress-track"><span class="${basicDone ? 'complete' : ''}">١ <b>البيانات الأساسية</b></span><i class="${basicDone ? 'complete' : ''}"></i><span class="${structureDone ? 'complete' : ''}">٢ <b>${structureCount}</b></span><i class="${structureDone ? 'complete' : ''}"></i><span class="${step === 3 ? 'active' : ''}">٣ <b>مراجعة قبل الحفظ</b></span></div>`;
        $('coachingBuilderBack').hidden = step === 1;
        $('coachingBuilderPreview').hidden = step !== 2;
        $('coachingBuilderPrint').hidden = step !== 3;
        $('coachingBuilderNext').hidden = step === 3;
        $('coachingBuilderSave').hidden = step !== 3;
        $('coachingBuilderNext').textContent = step === 1 ? 'التالي: بناء النظام' : 'التالي: المراجعة';
    }

    function renderBuilderClientField(draft, locked = false) {
        return `<label class="builder-client-field">العميل *<select data-builder-field="memberId" ${locked ? 'disabled' : ''}>${builderClientOptions(draft.memberId, draft.memberName)}</select><small>${draft.memberName ? `الملف الحالي: ${escapeHtml(draft.memberName)}` : 'اختر العميل الذي سيُحفظ النظام باسمه.'}</small></label>`;
    }

    function renderDietStepOne() {
        const draft = state.builder.draft;
        const calculator = draft.calculator || {};
        const energy = calculateDietEnergy(draft);
        const goalLabels = { lose: 'خسارة وزن', maintain: 'تثبيت الوزن', gain: 'زيادة وزن' };
        const activityLabels = { sedentary: 'قليل جدًا', light: 'خفيف', moderate: 'متوسط', high: 'مرتفع', very_high: 'مرتفع جدًا' };
        const latestNote = calculator.measurementDate ? `تم جلب الوزن والطول من آخر قياس بتاريخ ${builderDate(calculator.measurementDate)}.` : 'يمكن تعبئة القياسات يدويًا أو إضافة قياس من ملف العميل.';
        $('coachingBuilderContent').innerHTML = `<section class="builder-stage builder-diet-basics"><div class="builder-stage-heading"><div><span>المرحلة الأولى</span><h4>المعلومات الأساسية وحساب السعرات</h4><p>احسب الاحتياج اليومي ثم طبّق الهدف والماكروز على الخطة قبل بناء الوجبات.</p></div><span class="builder-lock-chip">حفظ آمن داخل Transaction</span></div><div class="builder-basic-grid">${renderBuilderClientField(draft, Boolean(state.builder.id))}<label>اسم الخطة *<input required data-builder-field="name" value="${escapeHtml(draft.name)}" placeholder="مثال: خطة بناء العضلات"></label><label>تاريخ البداية *<input required type="date" data-builder-field="startDate" value="${escapeHtml(draft.startDate)}"></label><label>تاريخ النهاية<input type="date" data-builder-field="endDate" value="${escapeHtml(draft.endDate || '')}"></label><label>عدد الوجبات اليومية<select data-builder-field="mealsPerDay">${[3, 4, 5, 6].map((value) => `<option value="${value}" ${Number(draft.mealsPerDay) === value ? 'selected' : ''}>${value} وجبات</option>`).join('')}</select></label><label>الحالة<select data-builder-field="status">${Object.entries(STATUS_LABELS).map(([key, label]) => `<option value="${key}" ${draft.status === key ? 'selected' : ''}>${label}</option>`).join('')}</select></label></div><div class="builder-calculator"><div class="builder-section-title"><div><span>حاسبة BMR / TDEE</span><h4>الاحتياج اليومي للعميل</h4><small>${latestNote}</small></div><span class="builder-formula-chip">Mifflin–St Jeor</span></div><div class="calculator-grid"><label>الوزن كجم<input type="number" min="1" step="0.1" data-calculator-field="weightKg" value="${escapeHtml(calculator.weightKg || '')}"></label><label>الطول سم<input type="number" min="1" step="0.1" data-calculator-field="heightCm" value="${escapeHtml(calculator.heightCm || '')}"></label><label>العمر<input type="number" min="1" max="120" data-calculator-field="age" value="${escapeHtml(calculator.age || '')}"></label><label>النوع<select data-calculator-field="gender"><option value="male" ${calculator.gender === 'male' ? 'selected' : ''}>ذكر</option><option value="female" ${calculator.gender === 'female' ? 'selected' : ''}>أنثى</option></select></label><label>مستوى النشاط<select data-calculator-field="activity">${Object.entries(activityLabels).map(([key, label]) => `<option value="${key}" ${calculator.activity === key ? 'selected' : ''}>${label}</option>`).join('')}</select></label><label>الهدف<select data-builder-field="calorieGoal">${Object.entries(goalLabels).map(([key, label]) => `<option value="${key}" ${draft.calorieGoal === key ? 'selected' : ''}>${label}</option>`).join('')}</select></label><label>العجز / الفائض بالسعرات<input type="number" step="50" data-builder-field="calorieAdjustment" value="${escapeHtml(draft.calorieAdjustment || 0)}"><small>سالب للخسارة وموجب للزيادة</small></label></div><div class="calculator-results"><div><span>BMR</span><strong id="dietBmrValue">${energy ? builderNum(energy.bmr) : '—'}</strong><small>السعرات الأساسية</small></div><div><span>TDEE</span><strong id="dietTdeeValue">${energy ? builderNum(energy.tdee) : '—'}</strong><small>الاحتياج مع النشاط</small></div><div><span>Target</span><strong id="dietTargetValue">${energy ? builderNum(energy.target) : builderNum(draft.targetCalories)}</strong><small>الهدف المقترح</small></div><button type="button" class="btn btn-primary" data-builder-action="apply-calories">تطبيق على الخطة</button></div></div><div class="builder-target-panel"><div class="builder-section-title"><div><span>أهداف الخطة</span><h4>Target Calories & Macros</h4></div><small>التوزيع الافتراضي: 30% بروتين · 40% كارب · 30% دهون</small></div><div class="target-grid"><label>Target Calories<input type="number" min="1" data-builder-field="targetCalories" value="${escapeHtml(draft.targetCalories || '')}"></label><label>Protein (g)<input type="number" min="0" step="0.1" data-builder-field="targetProtein" value="${escapeHtml(draft.targetProtein || '')}"></label><label>Carbs (g)<input type="number" min="0" step="0.1" data-builder-field="targetCarbs" value="${escapeHtml(draft.targetCarbs || '')}"></label><label>Fat (g)<input type="number" min="0" step="0.1" data-builder-field="targetFats" value="${escapeHtml(draft.targetFats || '')}"></label></div></div><label class="builder-wide-label">وصف الخطة<textarea data-builder-field="description" rows="2">${escapeHtml(draft.description || '')}</textarea></label><label class="builder-wide-label">ملاحظات<textarea data-builder-field="notes" rows="2">${escapeHtml(draft.notes || '')}</textarea></label></section>`;
    }

    function renderWorkoutStepOne() {
        const draft = state.builder.draft;
        $('coachingBuilderContent').innerHTML = `<section class="builder-stage"><div class="builder-stage-heading"><div><span>المرحلة الأولى</span><h4>بيانات البرنامج</h4><p>حدد هدف البرنامج ومستواه ومدته قبل توزيع الأيام والتمارين.</p></div><span class="builder-lock-chip">حفظ آمن داخل Transaction</span></div><div class="builder-basic-grid">${renderBuilderClientField(draft, Boolean(state.builder.id))}<label>اسم البرنامج *<input required data-builder-field="name" value="${escapeHtml(draft.name)}" placeholder="مثال: برنامج القوة الأساسي"></label><label>تاريخ البداية *<input required type="date" data-builder-field="startDate" value="${escapeHtml(draft.startDate)}"></label><label>تاريخ النهاية<input type="date" data-builder-field="endDate" value="${escapeHtml(draft.endDate || '')}"></label><label>المدة بالأسابيع<input type="number" min="1" max="520" data-builder-field="durationWeeks" value="${escapeHtml(draft.durationWeeks || '')}"></label><label>الهدف<select data-builder-field="goal">${['بناء العضلات', 'زيادة القوة', 'حرق الدهون', 'لياقة عامة', 'التحمل'].map((item) => `<option ${draft.goal === item ? 'selected' : ''}>${item}</option>`).join('')}</select></label><label>المستوى<select data-builder-field="level">${['مبتدئ', 'متوسط', 'متقدم'].map((item) => `<option ${draft.level === item ? 'selected' : ''}>${item}</option>`).join('')}</select></label><label>أيام التدريب أسبوعيًا<input type="number" min="1" max="7" data-builder-field="daysPerWeek" value="${escapeHtml(draft.daysPerWeek || '')}"></label><label>الحالة<select data-builder-field="status">${Object.entries(STATUS_LABELS).map(([key, label]) => `<option value="${key}" ${draft.status === key ? 'selected' : ''}>${label}</option>`).join('')}</select></label></div><label class="builder-wide-label">وصف البرنامج<textarea data-builder-field="description" rows="3">${escapeHtml(draft.description || '')}</textarea></label><label class="builder-wide-label">ملاحظات المدرب<textarea data-builder-field="notes" rows="2">${escapeHtml(draft.notes || '')}</textarea></label></section>`;
    }

    function renderDietLiveSummary(draft) {
        const totals = dietTotals(draft);
        const target = Number(draft.targetCalories || 0);
        const caloriePercent = target ? Math.min(100, Math.round((totals.calories / target) * 100)) : 0;
        const macro = (current, goal) => goal ? Math.min(100, Math.round((current / goal) * 100)) : 0;
        const summary = $('dietLiveSummary');
        if (!summary) return;
        summary.innerHTML = `<div class="nutrition-summary-head"><div><span>Live Nutrition Totals</span><strong>${builderNum(totals.calories)} <small>/ ${builderNum(target)} سعرة</small></strong></div><b>${caloriePercent}% مكتمل</b></div><div class="nutrition-total-progress"><i style="width:${caloriePercent}%"></i></div><div class="nutrition-macro-grid"><div><span>Protein</span><strong>${builderNum(totals.protein, 1)} / ${builderNum(draft.targetProtein, 1)}g</strong><i><b style="width:${macro(totals.protein, draft.targetProtein)}%"></b></i></div><div><span>Carbs</span><strong>${builderNum(totals.carbs, 1)} / ${builderNum(draft.targetCarbs, 1)}g</strong><i><b style="width:${macro(totals.carbs, draft.targetCarbs)}%"></b></i></div><div><span>Fat</span><strong>${builderNum(totals.fats, 1)} / ${builderNum(draft.targetFats, 1)}g</strong><i><b style="width:${macro(totals.fats, draft.targetFats)}%"></b></i></div></div><div class="nutrition-summary-foot"><span>${draft.meals.length} وجبات</span><span>${draft.meals.reduce((sum, meal) => sum + meal.items.length, 0)} أطعمة</span><span>المتبقي ${builderNum(Math.max(0, target - totals.calories))} سعرة</span></div>`;
    }

    function renderDietStepTwo() {
        const draft = state.builder.draft;
        const meals = draft.meals.map((meal, mealIndex) => {
            const mealTotals = dietMealTotals(meal);
            const rows = meal.items.map((item, itemIndex) => {
                const values = dietFoodMetrics(item);
                return `<div class="builder-food-row" data-food-index="${itemIndex}"><label><span>Food</span><select data-food-field="foodId">${builderOptionList(state.catalog.foods, item.foodId, 'اختر طعامًا')}</select></label><label><span>الكمية</span><input type="number" min="0.1" step="0.1" data-food-field="assignedQuantity" value="${escapeHtml(item.assignedQuantity)}"></label><label><span>الوحدة</span><input data-food-field="servingUnit" value="${escapeHtml(item.servingUnit || '')}" placeholder="جرام"></label><div class="food-live-value"><b>${builderNum(values.calories, 0)}</b><small>سعرة</small></div><div class="food-live-value"><b>${builderNum(values.protein, 1)}g</b><small>Protein</small></div><div class="food-live-value"><b>${builderNum(values.carbs, 1)}g</b><small>Carbs</small></div><div class="food-live-value"><b>${builderNum(values.fats, 1)}g</b><small>Fat</small></div><button type="button" class="btn btn-danger btn-small row-delete-button" data-builder-action="remove-food" data-meal="${mealIndex}" data-index="${itemIndex}" aria-label="حذف الطعام">حذف</button></div>`;
            }).join('');
            return `<section class="builder-meal-row" data-meal-index="${mealIndex}"><div class="builder-meal-row-head"><div class="builder-meal-title"><span>${mealIndex + 1}</span><div><input data-meal-field="name" value="${escapeHtml(meal.name)}" aria-label="اسم الوجبة"><small>${meal.mealTime ? `موعد الوجبة: ${escapeHtml(meal.mealTime)}` : 'حدد موعد الوجبة'}</small></div></div><div class="builder-row-actions"><label class="meal-time-field">الوقت<input type="time" data-meal-field="mealTime" value="${escapeHtml(meal.mealTime || '')}"></label><button type="button" class="btn btn-light btn-small" data-builder-action="move-meal" data-index="${mealIndex}" data-direction="up" ${mealIndex === 0 ? 'disabled' : ''}>↑</button><button type="button" class="btn btn-light btn-small" data-builder-action="move-meal" data-index="${mealIndex}" data-direction="down" ${mealIndex === draft.meals.length - 1 ? 'disabled' : ''}>↓</button><button type="button" class="btn btn-danger btn-small" data-builder-action="remove-meal" data-index="${mealIndex}">حذف الوجبة</button></div></div><div class="builder-meal-row-summary"><span>${builderNum(mealTotals.calories, 0)} سعرة</span><span>${builderNum(mealTotals.protein, 1)}g Protein</span><span>${builderNum(mealTotals.carbs, 1)}g Carbs</span><span>${builderNum(mealTotals.fats, 1)}g Fat</span></div><div class="builder-food-table"><div class="builder-food-table-head"><span>الطعام</span><span>الكمية</span><span>الوحدة</span><span>Calories</span><span>Protein</span><span>Carbs</span><span>Fat</span><span></span></div>${rows || '<div class="builder-empty">أضف أول طعام لهذه الوجبة.</div>'}</div><label class="builder-row-note">ملاحظات الوجبة<input data-meal-field="notes" value="${escapeHtml(meal.notes || '')}"></label><button type="button" class="btn btn-light builder-add-item" data-builder-action="add-food" data-meal="${mealIndex}">+ إضافة Food</button></section>`;
        }).join('');
        $('coachingBuilderContent').innerHTML = `<section class="builder-stage builder-diet-builder"><div class="builder-builder-head"><div><span>المرحلة الثانية</span><h4>بناء الوجبات</h4><p>تتغير القيم فورًا عند تعديل الكمية أو الطعام.</p></div><button type="button" class="btn btn-primary btn-small" data-builder-action="add-meal">+ إضافة وجبة</button></div><div id="dietLiveSummary" class="diet-live-summary enhanced"></div><div class="builder-meals-list">${meals || '<div class="builder-empty">لم تضف وجبات بعد.</div>'}</div></section>`;
        renderDietLiveSummary(draft);
    }

    function exerciseReference(exercise) {
        const item = state.catalog.exercises.find((candidate) => String(candidate.id) === String(exercise.exerciseId));
        if (!item) return '<span class="builder-reference-muted">اختر تمرينًا لعرض العضلة والتعليمات.</span>';
        const muscle = item.targetMuscleNameAr || item.targetMuscleName || 'غير محددة';
        const instruction = item.instructionsAr?.[0] || item.instructions?.[0] || item.descriptionAr || item.description || 'لا توجد تعليمات مسجلة.';
        const tip = item.tipsAr?.[0] || item.tips?.[0] || 'لا توجد نصائح مسجلة.';
        const mistake = item.commonMistakesAr?.[0] || item.commonMistakes?.[0] || 'لا توجد أخطاء شائعة مسجلة.';
        return `<div class="builder-exercise-reference"><span>العضلة المستهدفة: <b>${escapeHtml(muscle)}</b></span><details><summary>التعليمات والنصائح</summary><p><b>التعليمات:</b> ${escapeHtml(instruction)}</p><p><b>نصيحة:</b> ${escapeHtml(tip)}</p><p><b>خطأ شائع:</b> ${escapeHtml(mistake)}</p></details></div>`;
    }

    function renderWorkoutMetrics(draft) {
        const stats = workoutStats(draft);
        const distributions = Object.entries(stats.muscles).sort(([, first], [, second]) => second - first).slice(0, 8);
        return `<div class="workout-metrics-grid"><article><span>إجمالي التمارين</span><strong>${builderNum(stats.exercises)}</strong></article><article><span>إجمالي المجموعات</span><strong>${builderNum(stats.sets)}</strong></article><article><span>حجم التدريب التقريبي</span><strong>${builderNum(stats.volume, 0)} <small>كجم</small></strong></article><article><span>الأيام</span><strong>${builderNum(draft.routines.length)}</strong></article></div><div class="muscle-distribution"><div class="builder-section-title"><div><span>Muscle Distribution</span><h4>توزيع الحمل على العضلات</h4></div><small>حسب مجموعات التمارين</small></div>${distributions.length ? distributions.map(([name, value]) => `<div class="muscle-bar"><span>${escapeHtml(name)}</span><b><i style="width:${stats.sets ? Math.round((value / stats.sets) * 100) : 0}%"></i></b><strong>${value}</strong></div>`).join('') : '<div class="builder-reference-muted">أضف تمارين لعرض التوزيع.</div>'}</div>`;
    }

    function renderWorkoutStepTwo() {
        const draft = state.builder.draft;
        const activeRoutine = Math.min(Math.max(Number(state.builder.activeRoutine || 0), 0), Math.max(draft.routines.length - 1, 0));
        state.builder.activeRoutine = activeRoutine;
        const tabs = draft.routines.map((routine, index) => `<button type="button" class="builder-day-tab ${index === activeRoutine ? 'active' : ''}" data-builder-action="select-routine" data-index="${index}"><span>اليوم ${index + 1}</span><b>${escapeHtml(routine.name || 'يوم جديد')}</b><small>${routine.exercises.length} تمرين</small></button>`).join('');
        const panels = draft.routines.map((routine, routineIndex) => {
            const exerciseRows = routine.exercises.map((exercise, exerciseIndex) => `<div class="builder-exercise-row" data-exercise-index="${exerciseIndex}"><div class="exercise-row-number">${exerciseIndex + 1}</div><label class="exercise-select-field"><span>Exercise</span><select data-exercise-field="exerciseId">${builderOptionList(state.catalog.exercises, exercise.exerciseId, 'اختر تمرينًا', (item) => item.nameAr || item.name || item.nameEn)}</select></label><label><span>Sets</span><input type="number" min="1" max="100" data-exercise-field="sets" value="${escapeHtml(exercise.sets)}"></label><label><span>Reps من</span><input type="number" min="1" data-exercise-field="repsMin" value="${escapeHtml(exercise.repsMin ?? '')}"></label><label><span>Reps إلى</span><input type="number" min="1" data-exercise-field="repsMax" value="${escapeHtml(exercise.repsMax ?? '')}"></label><label><span>Weight kg</span><input type="number" min="0" step="0.5" data-exercise-field="weightKg" value="${escapeHtml(exercise.weightKg ?? '')}"></label><label><span>Rest sec</span><input type="number" min="0" data-exercise-field="restSeconds" value="${escapeHtml(exercise.restSeconds ?? '')}"></label><label><span>Tempo</span><input data-exercise-field="tempo" value="${escapeHtml(exercise.tempo || '')}" placeholder="3-1-2-0"></label><label><span>Superset</span><input data-exercise-field="supersetGroupId" value="${escapeHtml(exercise.supersetGroupId || '')}" placeholder="A"></label><button type="button" class="btn btn-danger btn-small row-delete-button" data-builder-action="remove-exercise" data-routine="${routineIndex}" data-index="${exerciseIndex}">حذف</button><div class="exercise-row-notes"><input data-exercise-field="notes" value="${escapeHtml(exercise.notes || '')}" placeholder="ملاحظات التمرين"><div>${exerciseReference(exercise)}</div></div></div>`).join('');
            return `<section class="builder-day-panel" data-routine-index="${routineIndex}" ${routineIndex === activeRoutine ? '' : 'hidden'}><div class="builder-day-panel-head"><div><label>اسم اليوم<input data-routine-field="name" value="${escapeHtml(routine.name)}"></label><label>يوم الأسبوع<select data-routine-field="dayOfWeek"><option value="">اختر اليوم</option>${[1, 2, 3, 4, 5, 6, 7].map((day) => `<option value="${day}" ${Number(routine.dayOfWeek) === day ? 'selected' : ''}>اليوم ${day}</option>`).join('')}</select></label></div><div class="builder-row-actions"><button type="button" class="btn btn-light btn-small" data-builder-action="move-routine" data-index="${routineIndex}" data-direction="up" ${routineIndex === 0 ? 'disabled' : ''}>↑</button><button type="button" class="btn btn-light btn-small" data-builder-action="move-routine" data-index="${routineIndex}" data-direction="down" ${routineIndex === draft.routines.length - 1 ? 'disabled' : ''}>↓</button><button type="button" class="btn btn-danger btn-small" data-builder-action="remove-routine" data-index="${routineIndex}">حذف اليوم</button></div></div><label class="builder-row-note">ملاحظات اليوم<input data-routine-field="notes" value="${escapeHtml(routine.notes || '')}"></label><div class="builder-exercise-table"><div class="builder-exercise-table-head"><span>#</span><span>Exercise</span><span>Sets</span><span>Reps</span><span>Weight</span><span>Rest</span><span>Tempo</span><span>Superset</span><span></span></div>${exerciseRows || '<div class="builder-empty">أضف أول تمرين لهذا اليوم.</div>'}</div><button type="button" class="btn btn-light builder-add-item" data-builder-action="add-exercise" data-routine="${routineIndex}">+ إضافة تمرين</button></section>`;
        }).join('');
        $('coachingBuilderContent').innerHTML = `<section class="builder-stage builder-workout-builder"><div class="builder-builder-head"><div><span>المرحلة الثانية</span><h4>Workout Builder</h4><p>أضف الأيام والتمارين، وسيُحسب الحجم وتوزيع العضلات تلقائيًا.</p></div><button type="button" class="btn btn-primary btn-small" data-builder-action="add-routine">+ إضافة يوم</button></div><div class="builder-workout-metrics" id="workoutBuilderMetrics">${renderWorkoutMetrics(draft)}</div><div class="builder-day-tabs">${tabs || '<div class="builder-empty">أضف أول يوم تدريب.</div>'}</div><div class="builder-day-panels">${panels}</div></section>`;
    }

    function renderBuilderReview() {
        const draft = state.builder.draft;
        const clientLabel = draft.memberName || (state.builderClients || []).find((client) => String(client.id) === String(draft.memberId))?.fullName || 'العميل المحدد';
        if (state.builder.type === 'diet') {
            const totals = dietTotals(draft);
            const mealRows = draft.meals.map((meal, index) => `<section class="review-block"><div class="review-block-head"><strong>${index + 1}. ${escapeHtml(meal.name)}</strong><span>${meal.mealTime ? escapeHtml(meal.mealTime) : 'بدون موعد'} · ${builderNum(dietMealTotals(meal).calories)} سعرة</span></div><table class="builder-review-table"><thead><tr><th>الطعام</th><th>الكمية</th><th>Calories</th><th>Protein</th><th>Carbs</th><th>Fat</th></tr></thead><tbody>${meal.items.map((item) => { const values = dietFoodMetrics(item); return `<tr><td>${escapeHtml(values.food ? itemName(values.food) : '—')}</td><td>${builderNum(item.assignedQuantity, 1)} ${escapeHtml(item.servingUnit || values.food?.servingUnit || '')}</td><td>${builderNum(values.calories, 1)}</td><td>${builderNum(values.protein, 1)}g</td><td>${builderNum(values.carbs, 1)}g</td><td>${builderNum(values.fats, 1)}g</td></tr>`; }).join('')}</tbody></table></section>`).join('');
            $('coachingBuilderContent').innerHTML = `<section class="builder-stage builder-review"><div class="builder-stage-heading"><div><span>المرحلة الثالثة</span><h4>مراجعة خطة التغذية قبل الحفظ</h4><p>راجع بيانات العميل، الأهداف، والقيم الفعلية لكل وجبة.</p></div><span class="builder-ready-chip">جاهز للمراجعة</span></div><div class="review-identity"><strong>${escapeHtml(clientLabel)}</strong><span>${builderDate(draft.startDate)}${draft.endDate ? ` — ${builderDate(draft.endDate)}` : ''}</span></div><div class="review-summary-grid"><div><span>Target Calories</span><strong>${builderNum(draft.targetCalories)} سعرة</strong></div><div><span>Protein</span><strong>${builderNum(draft.targetProtein, 1)}g</strong></div><div><span>Carbs</span><strong>${builderNum(draft.targetCarbs, 1)}g</strong></div><div><span>Fat</span><strong>${builderNum(draft.targetFats, 1)}g</strong></div><div><span>القيم الحالية</span><strong>${builderNum(totals.calories)} سعرة</strong></div><div><span>الوجبات / الأطعمة</span><strong>${draft.meals.length} / ${draft.meals.reduce((sum, meal) => sum + meal.items.length, 0)}</strong></div></div><div class="review-note">الخطة: <b>${escapeHtml(draft.name)}</b> · الهدف: <b>${draft.calorieGoal === 'lose' ? 'خسارة وزن' : draft.calorieGoal === 'gain' ? 'زيادة وزن' : 'تثبيت'}</b> · BMR: <b>${draft.calculator?.bmr ? builderNum(draft.calculator.bmr) : '—'}</b> · TDEE: <b>${draft.calculator?.tdee ? builderNum(draft.calculator.tdee) : '—'}</b></div><div class="review-blocks">${mealRows}</div></section>`;
        } else {
            const stats = workoutStats(draft);
            const routineRows = draft.routines.map((routine, index) => `<section class="review-block"><div class="review-block-head"><strong>${index + 1}. ${escapeHtml(routine.name)}</strong><span>${routine.exercises.length} تمارين · ${routine.exercises.reduce((sum, exercise) => sum + Number(exercise.sets || 0), 0)} مجموعات</span></div><table class="builder-review-table"><thead><tr><th>التمرين</th><th>Sets</th><th>Reps</th><th>Weight</th><th>Rest</th><th>Tempo</th><th>Superset</th></tr></thead><tbody>${routine.exercises.map((exercise) => { const item = state.catalog.exercises.find((candidate) => String(candidate.id) === String(exercise.exerciseId)); return `<tr><td>${escapeHtml(item ? itemName(item) : '—')}</td><td>${exercise.sets}</td><td>${exercise.repsMin || '—'}${exercise.repsMax ? `–${exercise.repsMax}` : ''}</td><td>${exercise.weightKg || '—'} kg</td><td>${exercise.restSeconds || 0}s</td><td>${escapeHtml(exercise.tempo || '—')}</td><td>${escapeHtml(exercise.supersetGroupId || '—')}</td></tr>`; }).join('')}</tbody></table></section>`).join('');
            $('coachingBuilderContent').innerHTML = `<section class="builder-stage builder-review"><div class="builder-stage-heading"><div><span>المرحلة الثالثة</span><h4>مراجعة برنامج التدريب قبل الحفظ</h4><p>راجع الحمل التدريبي وتوزيع العضلات وتفاصيل كل يوم.</p></div><span class="builder-ready-chip">جاهز للمراجعة</span></div><div class="review-identity"><strong>${escapeHtml(clientLabel)}</strong><span>${builderDate(draft.startDate)}${draft.endDate ? ` — ${builderDate(draft.endDate)}` : ''}</span></div><div class="review-summary-grid"><div><span>البرنامج</span><strong>${escapeHtml(draft.name)}</strong></div><div><span>المدة</span><strong>${builderNum(draft.durationWeeks)} أسبوع</strong></div><div><span>الأيام</span><strong>${draft.routines.length}</strong></div><div><span>التمارين</span><strong>${stats.exercises}</strong></div><div><span>المجموعات</span><strong>${stats.sets}</strong></div><div><span>الحجم التقريبي</span><strong>${builderNum(stats.volume)} كجم</strong></div></div><div class="review-note">الهدف: <b>${escapeHtml(draft.goal)}</b> · المستوى: <b>${escapeHtml(draft.level)}</b> · أيام أسبوعيًا: <b>${draft.daysPerWeek}</b></div><div class="review-muscles">${Object.entries(stats.muscles).map(([name, count]) => `<span>${escapeHtml(name)} <b>${count}</b></span>`).join('') || '<span>لم يحدد توزيع بعد</span>'}</div><div class="review-blocks">${routineRows}</div></section>`;
        }
    }

    let builderSearchDismissBound = false;

    function closeBuilderSearchSelects(except = null) {
        document.querySelectorAll('.builder-search-select.is-open').forEach((wrapper) => {
            if (wrapper === except) return;
            wrapper.classList.remove('is-open');
            const trigger = wrapper.querySelector('.builder-search-trigger');
            const popover = wrapper.querySelector('.builder-search-popover');
            trigger?.setAttribute('aria-expanded', 'false');
            if (popover) popover.hidden = true;
        });
    }

    function enhanceBuilderSearchSelects() {
        const content = $('coachingBuilderContent');
        if (!content) return;
        if (!builderSearchDismissBound) {
            document.addEventListener('click', (event) => {
                if (!event.target.closest('.builder-search-select')) closeBuilderSearchSelects();
            });
            document.addEventListener('keydown', (event) => {
                if (event.key === 'Escape') closeBuilderSearchSelects();
            });
            document.addEventListener('scroll', () => closeBuilderSearchSelects(), true);
            builderSearchDismissBound = true;
        }

        const definitions = [
            { selector: 'select[data-builder-field="memberId"]', kind: 'client', placeholder: 'اختر العميل', searchPlaceholder: 'ابحث باسم العميل أو الهاتف', empty: 'لا يوجد عميل مطابق.' },
            { selector: 'select[data-food-field="foodId"]', kind: 'food', placeholder: 'اختر طعامًا', searchPlaceholder: 'ابحث عن الطعام', empty: 'لا يوجد طعام مطابق.' },
            { selector: 'select[data-exercise-field="exerciseId"]', kind: 'exercise', placeholder: 'اختر تمرينًا', searchPlaceholder: 'ابحث عن التمرين أو العضلة', empty: 'لا يوجد تمرين مطابق.' },
            { selector: 'select[data-builder-field]:not([data-builder-field="memberId"]), select[data-calculator-field], select[data-routine-field]', kind: 'option', placeholder: 'اختر من القائمة', searchPlaceholder: 'ابحث في الخيارات', empty: 'لا توجد خيارات مطابقة.' }
        ];

        definitions.forEach(({ selector, kind, placeholder, searchPlaceholder, empty }) => {
            content.querySelectorAll(selector).forEach((select) => {
                if (select.closest('.builder-search-select')) return;
                const parent = select.parentElement;
                if (!parent) return;
                const wrapper = document.createElement('div');
                wrapper.className = 'builder-search-select';
                wrapper.dataset.searchKind = kind;

                const trigger = document.createElement('button');
                trigger.type = 'button';
                trigger.className = 'builder-search-trigger';
                trigger.setAttribute('aria-haspopup', 'listbox');
                trigger.setAttribute('aria-expanded', 'false');
                trigger.disabled = select.disabled;
                const triggerText = document.createElement('span');
                const triggerArrow = document.createElement('b');
                triggerArrow.textContent = '⌄';
                trigger.append(triggerText, triggerArrow);

                const popover = document.createElement('div');
                popover.className = 'builder-search-popover';
                popover.hidden = true;
                const searchLabel = document.createElement('label');
                searchLabel.className = 'builder-search-input-wrap';
                const searchInput = document.createElement('input');
                searchInput.type = 'search';
                searchInput.placeholder = searchPlaceholder;
                searchInput.setAttribute('aria-label', searchPlaceholder);
                searchLabel.append(searchInput);
                const options = document.createElement('div');
                options.className = 'builder-search-options';
                options.setAttribute('role', 'listbox');
                popover.append(searchLabel, options);

                const updateTrigger = () => {
                    const selected = select.selectedOptions?.[0];
                    triggerText.textContent = selected?.value ? selected.textContent.trim() : placeholder;
                    trigger.title = triggerText.textContent;
                };
                const renderOptions = () => {
                    const query = searchInput.value.trim().toLocaleLowerCase();
                    options.replaceChildren();
                    const matchingOptions = [...select.options].filter((option) => !query || option.textContent.toLocaleLowerCase().includes(query));
                    if (!matchingOptions.length) {
                        const emptyState = document.createElement('div');
                        emptyState.className = 'builder-search-empty';
                        emptyState.textContent = empty;
                        options.append(emptyState);
                        return;
                    }
                    matchingOptions.forEach((option) => {
                        const optionButton = document.createElement('button');
                        optionButton.type = 'button';
                        optionButton.className = 'builder-search-option';
                        optionButton.setAttribute('role', 'option');
                        optionButton.setAttribute('aria-selected', String(option.value === select.value));
                        optionButton.disabled = option.disabled;
                        optionButton.textContent = option.value ? option.textContent.trim() : placeholder;
                        optionButton.addEventListener('click', () => {
                            const previousValue = select.value;
                            select.value = option.value;
                            updateTrigger();
                            closeBuilderSearchSelects();
                            searchInput.value = '';
                            if (previousValue !== select.value) select.dispatchEvent(new Event('change', { bubbles: true }));
                        });
                        options.append(optionButton);
                    });
                };
                const setOpen = (open) => {
                    if (select.disabled) return;
                    if (open) closeBuilderSearchSelects(wrapper);
                    wrapper.classList.toggle('is-open', open);
                    trigger.setAttribute('aria-expanded', String(open));
                    popover.hidden = !open;
                    if (open) {
                        const rect = trigger.getBoundingClientRect();
                        const availableWidth = Math.max(180, window.innerWidth - 28);
                        const width = Math.min(Math.max(rect.width, 230), availableWidth);
                        const left = Math.min(Math.max(rect.left, 14), Math.max(14, window.innerWidth - width - 14));
                        const estimatedHeight = Math.min(360, window.innerHeight * .6);
                        const top = rect.bottom + 6 + estimatedHeight > window.innerHeight - 14
                            ? Math.max(14, rect.top - estimatedHeight - 6)
                            : rect.bottom + 6;
                        popover.style.width = `${width}px`;
                        popover.style.left = `${left}px`;
                        popover.style.top = `${top}px`;
                        searchInput.value = '';
                        renderOptions();
                        window.requestAnimationFrame(() => searchInput.focus());
                    }
                };

                trigger.addEventListener('click', () => setOpen(!wrapper.classList.contains('is-open')));
                trigger.addEventListener('keydown', (event) => {
                    if (event.key === 'Enter' || event.key === 'ArrowDown') { event.preventDefault(); setOpen(true); }
                });
                searchInput.addEventListener('input', renderOptions);
                searchInput.addEventListener('keydown', (event) => {
                    if (event.key === 'Escape') { event.preventDefault(); setOpen(false); return; }
                    if (event.key === 'Enter') { event.preventDefault(); options.querySelector('.builder-search-option:not(:disabled)')?.click(); }
                });
                select.addEventListener('change', updateTrigger);

                parent.insertBefore(wrapper, select);
                wrapper.append(trigger, popover, select);
                select.classList.add('builder-search-native');
                updateTrigger();
            });
        });
    }

    function renderBuilderV2() {
        if (!state.builder) return;
        renderBuilderChrome();
        if (state.builder.step === 1) state.builder.type === 'diet' ? renderDietStepOne() : renderWorkoutStepOne();
        else if (state.builder.step === 2) state.builder.type === 'diet' ? renderDietStepTwo() : renderWorkoutStepTwo();
        else renderBuilderReview();
        enhanceBuilderSearchSelects();
    }

    function syncBuilderDraft() {
        if (!state.builder) return null;
        return state.builder.type === 'diet' ? readBuilderDietDraft() : readBuilderWorkoutDraft();
    }

    function builderStepValid(step) {
        const draft = syncBuilderDraft();
        if (step === 1) {
            if (!builderBasicComplete(draft)) { notify('أكمل العميل والاسم وتاريخ البداية أولاً.', 'error'); return false; }
            if (state.builder.type === 'diet' && (!(Number(draft.mealsPerDay) >= 3 && Number(draft.mealsPerDay) <= 6) || Number(draft.targetCalories) <= 0)) { notify('حدد عدد الوجبات وأدخل Target Calories صحيحًا.', 'error'); return false; }
            if (state.builder.type === 'workout' && (!(Number(draft.durationWeeks) > 0) || !(Number(draft.daysPerWeek) > 0))) { notify('أدخل مدة البرنامج وعدد أيام التدريب.', 'error'); return false; }
            return true;
        }
        if (!builderStructureComplete(draft)) { notify(state.builder.type === 'diet' ? 'أضف وجبة وطعامًا صحيحًا واحدًا على الأقل لكل وجبة.' : 'أضف يومًا وتمرينًا صحيحًا واحدًا على الأقل.', 'error'); return false; }
        return true;
    }

    function setBuilderStep(step) {
        if (!state.builder) return;
        const next = Math.min(3, Math.max(1, Number(step)));
        if (next > state.builder.step && !builderStepValid(state.builder.step)) return;
        syncBuilderDraft();
        state.builder.step = next;
        renderBuilderV2();
    }

    async function openBuilderV2(type, memberId, id = null, memberName = '') {
        try {
            await Promise.all([loadCatalog(), loadBuilderClients()]);
            let draft = type === 'workout' ? blankBuilderWorkout(memberId, memberName) : blankBuilderDiet(memberId, memberName);
            if (id) draft = type === 'workout' ? await requestJson(`/api/workoutprograms/${id}`).then((data) => data.program) : await requestJson(`/api/dietplans/${id}`).then((data) => data.plan);
            if (type === 'diet') {
                draft.calculator = { ...(draft.calculator || {}) };
                try {
                    const measurementData = await requestJson(`/api/clients/${draft.memberId || memberId}/measurements`);
                    const latest = (measurementData.measurements || []).find((measurement) => measurement.weightKg != null || measurement.heightCm != null);
                    if (latest) {
                        if (!draft.calculator.weightKg) draft.calculator.weightKg = latest.weightKg || '';
                        if (!draft.calculator.heightCm) draft.calculator.heightCm = latest.heightCm || '';
                        draft.calculator.measurementDate = latest.measuredAt || '';
                    }
                } catch (_) { /* القياسات مساعدة فقط ولا تمنع فتح النظام. */ }
            }
            state.builder = { type, memberId: Number(draft.memberId || memberId), id: id ? Number(id) : null, draft, step: 1, activeRoutine: 0 };
            $('coachingBuilderId').value = id || '';
            $('coachingBuilderMemberId').value = state.builder.memberId;
            $('coachingBuilderTitle').textContent = `${id ? 'تعديل' : 'إنشاء'} ${type === 'workout' ? 'برنامج تدريب' : 'خطة تغذية'}`;
            $('coachingBuilderSubtitle').textContent = `العميل: ${draft.memberName || memberName || 'العميل المحدد'} · ثلاث مراحل واضحة حتى الحفظ.`;
            renderBuilderV2();
            openDialog($('coachingBuilderDialog'));
        } catch (error) { notify(error.message, 'error'); }
    }

    function handleBuilderActionV2(button) {
        if (!state.builder) return;
        const draft = syncBuilderDraft();
        const action = button.dataset.builderAction;
        const index = Number(button.dataset.index);
        if (action === 'apply-calories') return applyDietCalories();
        if (action === 'select-routine') { state.builder.activeRoutine = index; return renderBuilderV2(); }
        if (state.builder.type === 'diet') {
            if (action === 'add-meal') draft.meals.push({ name: `وجبة ${draft.meals.length + 1}`, mealTime: '', sortOrder: draft.meals.length, notes: '', items: [{ foodId: state.catalog.foods[0]?.id || '', sortOrder: 0, assignedQuantity: 100, servingUnit: '', notes: '' }] });
            if (action === 'remove-meal') draft.meals.splice(index, 1);
            if (action === 'move-meal') { const target = button.dataset.direction === 'up' ? index - 1 : index + 1; if (draft.meals[target]) [draft.meals[index], draft.meals[target]] = [draft.meals[target], draft.meals[index]]; }
            if (action === 'add-food') draft.meals[Number(button.dataset.meal)]?.items.push({ foodId: state.catalog.foods[0]?.id || '', sortOrder: draft.meals[Number(button.dataset.meal)]?.items.length || 0, assignedQuantity: 100, servingUnit: '', notes: '' });
            if (action === 'remove-food') draft.meals[Number(button.dataset.meal)]?.items.splice(index, 1);
        } else {
            if (action === 'add-routine') { draft.routines.push({ name: `اليوم ${draft.routines.length + 1}`, dayOfWeek: Math.min(7, draft.routines.length + 1), sortOrder: draft.routines.length, notes: '', exercises: [{ exerciseId: state.catalog.exercises[0]?.id || '', sortOrder: 0, sets: 3, repsMin: 10, repsMax: 12, weightKg: '', restSeconds: 90, tempo: '', supersetGroupId: '', notes: '' }] }); state.builder.activeRoutine = draft.routines.length - 1; }
            if (action === 'remove-routine') { draft.routines.splice(index, 1); state.builder.activeRoutine = Math.max(0, Math.min(state.builder.activeRoutine, draft.routines.length - 1)); }
            if (action === 'move-routine') { const target = button.dataset.direction === 'up' ? index - 1 : index + 1; if (draft.routines[target]) { [draft.routines[index], draft.routines[target]] = [draft.routines[target], draft.routines[index]]; state.builder.activeRoutine = target; } }
            if (action === 'add-exercise') draft.routines[Number(button.dataset.routine)]?.exercises.push({ exerciseId: state.catalog.exercises[0]?.id || '', sortOrder: draft.routines[Number(button.dataset.routine)]?.exercises.length || 0, sets: 3, repsMin: 10, repsMax: 12, weightKg: '', restSeconds: 90, tempo: '', supersetGroupId: '', notes: '' });
            if (action === 'remove-exercise') draft.routines[Number(button.dataset.routine)]?.exercises.splice(index, 1);
        }
        state.builder.draft = draft;
        renderBuilderV2();
    }

    /*
    function buildBuilderPrintDocument() {
        const draft = state.builder.draft;
        const clientLabel = draft.memberName || (state.builderClients || []).find((client) => String(client.id) === String(draft.memberId))?.fullName || 'العميل المحدد';
        const title = state.builder.type === 'diet' ? 'خطة تغذية' : 'برنامج تدريب';
        const content = state.builder.type === 'diet' ? `<div class="print-summary"><b>Target Calories:</b> ${builderNum(draft.targetCalories)} · <b>Protein:</b> ${builderNum(draft.targetProtein, 1)}g · <b>Carbs:</b> ${builderNum(draft.targetCarbs, 1)}g · <b>Fat:</b> ${builderNum(draft.targetFats, 1)}g</div>${draft.meals.map((meal, index) => `<section><h2>${index + 1}. ${escapeHtml(meal.name)} <small>${meal.mealTime || ''}</small></h2><table><thead><tr><th>الطعام</th><th>الكمية</th><th>Calories</th><th>Protein</th><th>Carbs</th><th>Fat</th></tr></thead><tbody>${meal.items.map((item) => { const values = dietFoodMetrics(item); return `<tr><td>${escapeHtml(values.food ? itemName(values.food) : '—')}</td><td>${builderNum(item.assignedQuantity, 1)} ${escapeHtml(item.servingUnit || '')}</td><td>${builderNum(values.calories, 1)}</td><td>${builderNum(values.protein, 1)}</td><td>${builderNum(values.carbs, 1)}</td><td>${builderNum(values.fats, 1)}</td></tr>`; }).join('')}</tbody></table></section>`).join('') : `<div class="print-summary"><b>الهدف:</b> ${escapeHtml(draft.goal)} · <b>المستوى:</b> ${escapeHtml(draft.level)} · <b>المدة:</b> ${builderNum(draft.durationWeeks)} أسبوع · <b>الأيام:</b> ${draft.routines.length}</div>${draft.routines.map((routine, index) => `<section><h2>${index + 1}. ${escapeHtml(routine.name)}</h2><table><thead><tr><th>التمرين</th><th>Sets</th><th>Reps</th><th>Weight</th><th>Rest</th><th>Tempo</th><th>Superset</th></tr></thead><tbody>${routine.exercises.map((exercise) => { const item = state.catalog.exercises.find((candidate) => String(candidate.id) === String(exercise.exerciseId)); return `<tr><td>${escapeHtml(item ? itemName(item) : '—')}</td><td>${exercise.sets}</td><td>${exercise.repsMin || '—'}${exercise.repsMax ? `–${exercise.repsMax}` : ''}</td><td>${exercise.weightKg || '—'}</td><td>${exercise.restSeconds || 0}s</td><td>${escapeHtml(exercise.tempo || '—')}</td><td>${escapeHtml(exercise.supersetGroupId || '—')}</td></tr>`; }).join('')}</tbody></table></section>`).join('')}`;
        return `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>${title} - TOP GYM</title><style>@page{size:A4;margin:14mm}*{box-sizing:border-box}body{font-family:Cairo,Tahoma,Arial,sans-serif;color:#0f172a;margin:0;line-height:1.6}header{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:4px solid #2563eb;padding-bottom:12px;margin-bottom:18px}h1{font-size:27px;margin:0;color:#1d4ed8;letter-spacing:2px}header p{margin:2px 0;color:#64748b;font-size:11px}.meta{text-align:left;color:#475569;font-size:11px}h2{font-size:15px;margin:16px 0 7px;padding:7px 10px;border-right:4px solid #2563eb;background:#eff6ff}h2 small{float:left;color:#64748b;font-size:10px;font-weight:400}table{width:100%;border-collapse:collapse;font-size:10px}th{background:#0f172a;color:#fff;text-align:right;padding:7px}td{border:1px solid #dbe3ef;padding:7px}tr:nth-child(even) td{background:#f8fafc}.print-summary{padding:10px 12px;border:1px solid #bfdbfe;background:#f8fbff;border-radius:8px;font-size:11px}footer{margin-top:25px;border-top:1px solid #dbe3ef;padding-top:10px;color:#64748b;font-size:10px;display:flex;justify-content:space-between}</style></head><body><header><div><h1>TOP GYM</h1><p>${title}</p></div><div class="meta"><b>${escapeHtml(clientLabel)}</b><br>${builderDate(draft.startDate)}${draft.endDate ? ` — ${builderDate(draft.endDate)}` : ''}</div></header>${content}<footer><b>إدارة الجيم</b><span>TOP GYM · ${new Date().toLocaleDateString('ar-EG')}</span></footer><script>window.onload=()=>setTimeout(()=>window.print(),350);<\/script></body></html>`;
    }

    }
    */
    function buildBuilderPrintDocument() {
        const draft = state.builder.draft;
        const clientLabel = draft.memberName || (state.builderClients || []).find((client) => String(client.id) === String(draft.memberId))?.fullName || 'Selected client';
        const title = state.builder.type === 'diet' ? 'Nutrition plan' : 'Workout program';
        const dietSections = (draft.meals || []).map((meal, index) => {
            const rows = (meal.items || []).map((item) => {
                const values = dietFoodMetrics(item);
                const foodLabel = values.food ? itemName(values.food) : '—';
                return `<tr><td>${escapeHtml(foodLabel)}</td><td>${builderNum(item.assignedQuantity, 1)} ${escapeHtml(item.servingUnit || '')}</td><td>${builderNum(values.calories, 1)}</td><td>${builderNum(values.protein, 1)}</td><td>${builderNum(values.carbs, 1)}</td><td>${builderNum(values.fats, 1)}</td></tr>`;
            }).join('');
            return `<section><h2>${index + 1}. ${escapeHtml(meal.name)} <small>${escapeHtml(meal.mealTime || '')}</small></h2><table><thead><tr><th>Food</th><th>Quantity</th><th>Calories</th><th>Protein</th><th>Carbs</th><th>Fat</th></tr></thead><tbody>${rows}</tbody></table></section>`;
        }).join('');
        const workoutSections = (draft.routines || []).map((routine, index) => {
            const rows = (routine.exercises || []).map((exercise) => {
                const item = state.catalog.exercises.find((candidate) => String(candidate.id) === String(exercise.exerciseId));
                const reps = exercise.repsMax ? `${exercise.repsMin || '—'}–${exercise.repsMax}` : (exercise.repsMin || '—');
                return `<tr><td>${escapeHtml(item ? itemName(item) : '—')}</td><td>${builderNum(exercise.sets, 0)}</td><td>${escapeHtml(String(reps))}</td><td>${builderNum(exercise.weightKg, 1) || '—'}</td><td>${builderNum(exercise.restSeconds, 0)}s</td><td>${escapeHtml(exercise.tempo || '—')}</td><td>${escapeHtml(exercise.supersetGroupId || '—')}</td></tr>`;
            }).join('');
            return `<section><h2>${index + 1}. ${escapeHtml(routine.name)}</h2><table><thead><tr><th>Exercise</th><th>Sets</th><th>Reps</th><th>Weight</th><th>Rest</th><th>Tempo</th><th>Superset</th></tr></thead><tbody>${rows}</tbody></table></section>`;
        }).join('');
        const content = state.builder.type === 'diet'
            ? `<div class="print-summary"><b>Target calories:</b> ${builderNum(draft.targetCalories)} · <b>Protein:</b> ${builderNum(draft.targetProtein, 1)}g · <b>Carbs:</b> ${builderNum(draft.targetCarbs, 1)}g · <b>Fat:</b> ${builderNum(draft.targetFats, 1)}g</div>${dietSections}`
            : `<div class="print-summary"><b>Goal:</b> ${escapeHtml(draft.goal)} · <b>Level:</b> ${escapeHtml(draft.level)} · <b>Duration:</b> ${builderNum(draft.durationWeeks)} weeks · <b>Days:</b> ${(draft.routines || []).length}</div>${workoutSections}`;
        return `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>${title} - TOP GYM</title><style>@page{size:A4;margin:14mm}*{box-sizing:border-box}body{font-family:Cairo,Tahoma,Arial,sans-serif;color:#0f172a;margin:0;line-height:1.6}header{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:4px solid #2563eb;padding-bottom:12px;margin-bottom:18px}h1{font-size:27px;margin:0;color:#1d4ed8;letter-spacing:2px}header p{margin:2px 0;color:#64748b;font-size:11px}.meta{text-align:left;color:#475569;font-size:11px}h2{font-size:15px;margin:16px 0 7px;padding:7px 10px;border-right:4px solid #2563eb;background:#eff6ff}h2 small{float:left;color:#64748b;font-size:10px;font-weight:400}table{width:100%;border-collapse:collapse;font-size:10px}th{background:#0f172a;color:#fff;text-align:right;padding:7px}td{border:1px solid #dbe3ef;padding:7px}tr:nth-child(even) td{background:#f8fafc}.print-summary{padding:10px 12px;border:1px solid #bfdbfe;background:#f8fbff;border-radius:8px;font-size:11px}footer{margin-top:25px;border-top:1px solid #dbe3ef;padding-top:10px;color:#64748b;font-size:10px;display:flex;justify-content:space-between}</style></head><body><header><div><h1>TOP GYM</h1><p>${title}</p></div><div class="meta"><b>${escapeHtml(clientLabel)}</b><br>${builderDate(draft.startDate)}${draft.endDate ? ` — ${builderDate(draft.endDate)}` : ''}</div></header>${content}<footer><b>Gym management</b><span>TOP GYM · ${new Date().toLocaleDateString('ar-EG')}</span></footer><script>window.onload=()=>setTimeout(()=>window.print(),350);<\/script></body></html>`;
    }

    function printBuilderDraft() {
        if (!state.builder) return;
        syncBuilderDraft();
        if (!builderStructureComplete(state.builder.draft)) { notify('أكمل بناء النظام قبل الطباعة.', 'error'); return; }
        const printWindow = window.open('', '_blank', 'width=980,height=820');
        if (!printWindow) { notify('اسمح بالنوافذ المنبثقة لإتمام الطباعة.', 'error'); return; }
        printWindow.document.open();
        printWindow.document.write(buildBuilderPrintDocument());
        printWindow.document.close();
    }

    function refreshBuilderDerivedMetrics(draft = activeBuilderDraft()) {
        if (!state.builder || !draft) return;
        const content = $('coachingBuilderContent');
        if (state.builder.type === 'diet') {
            renderDietLiveSummary(draft);
            content?.querySelectorAll('[data-meal-index]').forEach((mealElement, mealIndex) => {
                const meal = draft.meals[mealIndex];
                if (!meal) return;
                const totals = dietMealTotals(meal);
                const summary = mealElement.querySelector('.builder-meal-row-summary');
                if (summary) summary.innerHTML = `<span>${builderNum(totals.calories, 0)} calories</span><span>${builderNum(totals.protein, 1)}g Protein</span><span>${builderNum(totals.carbs, 1)}g Carbs</span><span>${builderNum(totals.fats, 1)}g Fat</span>`;
                mealElement.querySelectorAll('[data-food-index]').forEach((foodElement, itemIndex) => {
                    const item = meal.items[itemIndex];
                    if (!item) return;
                    const values = dietFoodMetrics(item);
                    const liveValues = foodElement.querySelectorAll('.food-live-value');
                    [builderNum(values.calories, 0), `${builderNum(values.protein, 1)}g`, `${builderNum(values.carbs, 1)}g`, `${builderNum(values.fats, 1)}g`].forEach((value, valueIndex) => { if (liveValues[valueIndex]) liveValues[valueIndex].innerHTML = `<b>${value}</b>`; });
                });
            });
        } else {
            const metrics = $('workoutBuilderMetrics');
            if (metrics) metrics.innerHTML = renderWorkoutMetrics(draft);
        }
    }

    function refreshDietEnergyPreview(draft = readBuilderDietDraft()) {
        if (!draft) return;
        const energy = calculateDietEnergy(draft);
        const bmr = $('dietBmrValue');
        const tdee = $('dietTdeeValue');
        const target = $('dietTargetValue');
        if (bmr) bmr.textContent = energy ? builderNum(energy.bmr) : '—';
        if (tdee) tdee.textContent = energy ? builderNum(energy.tdee) : '—';
        if (target) target.textContent = energy ? builderNum(energy.target) : builderNum(draft.targetCalories);
    }

    async function saveBuilderV2(event) {
        event.preventDefault();
        if (!state.builder) return;
        if (state.builder.step !== 3) { setBuilderStep(state.builder.step + 1); return; }
        const draft = syncBuilderDraft();
        if (!builderStepValid(2)) return;
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

    function blankWorkout(memberId) { return blankBuilderWorkout(memberId); }
    function blankDiet(memberId) { return blankBuilderDiet(memberId); }
    function readWorkoutDraft() { return readBuilderWorkoutDraft(); }
    function readDietDraft() { return readBuilderDietDraft(); }
    function renderBuilder() { return renderBuilderV2(); }
    function openBuilder(type, memberId, id = null, memberName = '') { return openBuilderV2(type, memberId, id, memberName); }
    function handleBuilderAction(button) { return handleBuilderActionV2(button); }
    function saveBuilder(event) { return saveBuilderV2(event); }

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
        $('coachingBuilderBack')?.addEventListener('click', () => setBuilderStep((state.builder?.step || 1) - 1));
        $('coachingBuilderNext')?.addEventListener('click', () => setBuilderStep((state.builder?.step || 1) + 1));
        $('coachingBuilderPreview')?.addEventListener('click', () => setBuilderStep(3));
        $('coachingBuilderPrint')?.addEventListener('click', printBuilderDraft);
        $('coachingBuilderStepper')?.addEventListener('click', (event) => {
            const button = event.target.closest('[data-builder-step-target]');
            if (button && !button.disabled) setBuilderStep(button.dataset.builderStepTarget);
        });
        $('coachingBuilderContent')?.addEventListener('input', (event) => {
            if (!state.builder || !event.target.closest('[data-builder-field], [data-calculator-field], [data-meal-field], [data-food-field], [data-routine-field], [data-exercise-field]')) return;
            if (event.target.matches('[data-builder-field="calorieAdjustment"]')) state.builder.calorieAdjustmentTouched = true;
            const draft = syncBuilderDraft();
            if (state.builder.type === 'diet' && state.builder.step === 1) refreshDietEnergyPreview(draft);
            if (state.builder.step === 2) refreshBuilderDerivedMetrics(draft);
        });
        $('coachingBuilderContent')?.addEventListener('change', async (event) => {
            if (!state.builder) return;
            const target = event.target;
            const draft = syncBuilderDraft();
            if (state.builder.type === 'diet' && state.builder.step === 1 && target.matches('[data-builder-field="memberId"]')) {
                draft.calculator = { ...(draft.calculator || {}), weightKg: '', heightCm: '', measurementDate: '' };
                try {
                    const measurementData = await requestJson(`/api/clients/${draft.memberId}/measurements`);
                    const latest = (measurementData.measurements || []).find((measurement) => measurement.weightKg != null || measurement.heightCm != null);
                    if (latest) { draft.calculator.weightKg = latest.weightKg || ''; draft.calculator.heightCm = latest.heightCm || ''; draft.calculator.measurementDate = latest.measuredAt || ''; }
                } catch (_) { /* measurements are optional */ }
                state.builder.draft = draft;
                renderBuilderV2();
                return;
            }
            if (state.builder.type === 'diet' && state.builder.step === 1 && target.matches('[data-builder-field="mealsPerDay"]')) {
                syncDietMealCount(draft, target.value);
                state.builder.draft = draft;
                renderBuilderV2();
                return;
            }
            if (state.builder.type === 'diet' && state.builder.step === 1 && target.matches('[data-builder-field="calorieGoal"]') && !state.builder.calorieAdjustmentTouched) {
                const defaultAdjustments = { lose: -500, maintain: 0, gain: 300 };
                draft.calorieAdjustment = defaultAdjustments[target.value] ?? 0;
                const adjustmentInput = $('coachingBuilderContent')?.querySelector('[data-builder-field="calorieAdjustment"]');
                if (adjustmentInput) adjustmentInput.value = draft.calorieAdjustment;
            }
            if (state.builder.type === 'diet' && state.builder.step === 1) refreshDietEnergyPreview(draft);
            if (state.builder.type === 'diet' && state.builder.step === 2) refreshBuilderDerivedMetrics(draft);
            if (state.builder.type === 'workout' && state.builder.step === 2 && target.matches('[data-exercise-field="exerciseId"]')) renderBuilderV2();
        });
        $('detailsContent')?.addEventListener('click', (event) => { const button = event.target.closest('[data-member-coaching-action]'); if (button) handleMemberCoachingAction(button); });
        $('membersList')?.addEventListener('click', (event) => {
            const button = event.target.closest('[data-member-coaching-action]');
            if (!button) return;
            event.preventDefault();
            event.stopPropagation();
            const memberId = button.dataset.memberId || button.dataset.id || button.closest('[data-member-id]')?.dataset.memberId;
            const action = button.dataset.memberCoachingAction;
            if (action === 'workout') openBuilder('workout', memberId, null, button.dataset.memberName || '');
            else if (action === 'diet') openBuilder('diet', memberId, null, button.dataset.memberName || '');
        });
        $('coachingProfileContent')?.addEventListener('click', (event) => { const button = event.target.closest('[data-profile-action], [data-measurement-action]'); if (!button) return; const action = button.dataset.profileAction || (button.dataset.measurementAction === 'edit' ? 'edit-measurement' : 'delete-measurement'); handleProfileAction(action, button.dataset.id); });
        window.addEventListener('topgym:tab-changed', (event) => { if (event.detail?.name === 'trainees') loadTrainees(); });
        window.addEventListener('topgym:member-details-opened', (event) => renderMemberTrainingPanel(event.detail?.member?.id || event.detail?.details?.member?.id));
        window.addEventListener('topgym:coaching-updated', (event) => { if (event.detail?.memberId && $('detailsDialog')?.open) renderMemberTrainingPanel(event.detail.memberId); });
    });
})();
