(() => {
    if (window.__topGymLibraryLoaded) return;
    window.__topGymLibraryLoaded = true;

    const $ = (id) => document.getElementById(id);
    const state = {
        activeType: 'foods',
        opened: false,
        options: null,
        items: [],
        pagination: null,
        page: 1,
        pageSize: 20,
        search: '',
        filters: { muscles: { bodyPart: '' }, foods: { category: '' }, exercises: { category: '', difficulty: '', equipment: '', targetMuscleId: '' } },
        requestId: 0,
        abortController: null,
        searchTimer: null,
        lastLoadedKey: '',
        lastLoadedAt: 0,
        muscleCatalog: null,
        muscleCatalogPromise: null,
        detailsItem: null,
        detailsType: null,
        detailsRequestId: 0
    };

    const META = {
        muscles: { title: 'العضلات', singular: 'عضلة', add: 'إضافة عضلة', empty: 'لا توجد عضلات مطابقة للبحث.', color: 'muscles' },
        foods: { title: 'الأطعمة', singular: 'طعام', add: 'إضافة طعام', empty: 'لا توجد أطعمة مطابقة للبحث.', color: 'foods' },
        exercises: { title: 'التمارين', singular: 'تمرين', add: 'إضافة تمرين', empty: 'لا توجد تمارين مطابقة للبحث.', color: 'exercises' }
    };
    const VISIBLE_TYPES = ['muscles', 'foods', 'exercises'];

    function escapeHtml(value) {
        return String(value ?? '').replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[character]));
    }

    function formatNumber(value, maximumFractionDigits = 0) {
        const number = Number(value || 0);
        return Number.isFinite(number) ? number.toLocaleString('ar-EG', { maximumFractionDigits }) : '—';
    }

    function safeArray(value) { return Array.isArray(value) ? value : []; }
    function lineText(value) { return safeArray(value).filter(Boolean).join('\n'); }
    function nonEmptyValue(...values) {
        return values.find((value) => value !== undefined && value !== null && String(value).trim() !== '') ?? '';
    }
    function itemNames(item) {
        return {
            arabic: nonEmptyValue(item?.nameAr, item?.name_ar),
            english: nonEmptyValue(item?.nameEn, item?.name, item?.name_en)
        };
    }
    function itemName(item) {
        const names = itemNames(item);
        return names.arabic || names.english || 'عنصر بدون اسم';
    }
    function contentLines(value) {
        if (Array.isArray(value)) {
            return value.flatMap((entry) => {
                if (entry === undefined || entry === null) return [];
                if (typeof entry === 'string' || typeof entry === 'number') return String(entry).trim() ? [String(entry).trim()] : [];
                const text = nonEmptyValue(entry.text, entry.value, entry.instruction, entry.description, entry.step);
                return text ? [String(text).trim()] : [];
            });
        }
        return typeof value === 'string' ? value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean) : [];
    }

    function exerciseImage(item, phase = 'main', options = {}) {
        if (window.TopGymExerciseAssets?.imageMarkup) return window.TopGymExerciseAssets.imageMarkup(item, phase, options);
        return `<span class="exercise-media exercise-media-fallback ${escapeHtml(options.className || '')}" aria-hidden="true"><span class="exercise-media-fallback-icon">${escapeHtml(item?.icon || '🏋️')}</span></span>`;
    }

    function exerciseGallery(item) {
        const match = window.TopGymExerciseAssets?.find(item) || item;
        const names = itemNames(item);
        const altName = names.arabic || names.english || 'التمرين';
        const start = `<figure>${exerciseImage(item, 'start', { className: 'exercise-media-detail', alt: `${altName} - وضع البداية`, loading: 'eager' })}<figcaption>وضع البداية</figcaption></figure>`;
        const end = match?.imageAssets?.end
            ? `<figure>${exerciseImage(item, 'end', { className: 'exercise-media-detail', alt: `${altName} - وضع النهاية`, loading: 'lazy' })}<figcaption>وضع النهاية</figcaption></figure>`
            : '';
        return `${start}${end}`;
    }

    async function requestJson(url, options = {}) {
        const response = await fetch(url, { ...options, headers: { 'Content-Type': 'application/json', ...(options.headers || {}) } });
        if (response.status === 204) return null;
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
            const error = new Error(data.error || 'تعذر تنفيذ الطلب.');
            error.code = data.code || null;
            throw error;
        }
        return data;
    }

    function showMessage(message, type = 'success') {
        const element = $('libraryMessage');
        if (!element) return;
        element.textContent = message;
        element.className = `library-message ${type}`;
        element.hidden = false;
        window.clearTimeout(showMessage.timer);
        showMessage.timer = window.setTimeout(() => { element.hidden = true; }, type === 'error' ? 6500 : 3200);
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

    function selected(value, current) { return String(value ?? '') === String(current ?? '') ? ' selected' : ''; }

    function renderSummary() {
        const counts = state.options?.counts || {};
        const summary = $('librarySummary');
        if (summary) summary.innerHTML = '';
        const foodsCount = $('libraryFoodsCount');
        const exercisesCount = $('libraryExercisesCount');
        const musclesCount = $('libraryMusclesCount');
        if (musclesCount) musclesCount.textContent = formatNumber(counts.muscles);
        if (foodsCount) foodsCount.textContent = formatNumber(counts.foods);
        if (exercisesCount) exercisesCount.textContent = formatNumber(counts.exercises);
    }

    function optionList(items, current, placeholder) {
        return `<option value="">${placeholder}</option>${(items || []).map((value) => `<option value="${escapeHtml(value)}"${selected(value, current)}>${escapeHtml(value)}</option>`).join('')}`;
    }

    function renderFilters() {
        const container = $('libraryFilters');
        if (!container) return;
        container.classList.toggle('single-filter', state.activeType !== 'exercises');
        const filters = state.filters[state.activeType];
        const available = state.options?.filters || {};
        if (state.activeType === 'muscles') {
            container.innerHTML = `<select class="library-filter" data-library-filter="bodyPart" aria-label="فلترة منطقة الجسم">${optionList(available.bodyParts, filters.bodyPart, 'كل مناطق الجسم')}</select>`;
        } else if (state.activeType === 'foods') {
            container.innerHTML = `<select class="library-filter" data-library-filter="category" aria-label="فلترة تصنيف الطعام">${optionList(available.categories, filters.category, 'كل التصنيفات')}</select>`;
        } else {
            const muscles = available.muscles || [];
            container.innerHTML = `
                <select class="library-filter" data-library-filter="category" aria-label="فلترة تصنيف التمرين">${optionList(available.exerciseCategories, filters.category, 'كل التصنيفات')}</select>
                <select class="library-filter" data-library-filter="difficulty" aria-label="فلترة مستوى التمرين">${optionList(available.difficulties, filters.difficulty, 'كل المستويات')}</select>
                <select class="library-filter" data-library-filter="equipment" aria-label="فلترة أدوات التمرين">${optionList(available.equipment, filters.equipment, 'كل الأدوات')}</select>
                <select class="library-filter" data-library-filter="targetMuscleId" aria-label="فلترة العضلة المستهدفة"><option value="">كل العضلات المستهدفة</option>${muscles.map((muscle) => `<option value="${muscle.id}"${selected(muscle.id, filters.targetMuscleId)}>${escapeHtml(muscle.nameAr || muscle.name)}</option>`).join('')}</select>`;
        }
    }

    function renderTypeTabs() {
        document.querySelectorAll('[data-library-type]').forEach((button) => {
            const active = button.dataset.libraryType === state.activeType;
            button.classList.toggle('active', active);
            button.setAttribute('aria-selected', String(active));
        });
        const addButton = $('libraryAddButton');
        if (addButton && META[state.activeType]) addButton.querySelector('span:last-child').textContent = META[state.activeType].add;
    }

    function tableActions(id) {
        return `<div class="library-row-actions"><button class="btn btn-light" type="button" title="التفاصيل" aria-label="التفاصيل" data-library-action="details" data-id="${id}">التفاصيل</button><button class="btn btn-light" type="button" title="تعديل" aria-label="تعديل" data-library-action="edit" data-id="${id}">تعديل</button><button class="btn library-delete" type="button" title="حذف" aria-label="حذف" data-library-action="delete" data-id="${id}">حذف</button></div>`;
    }

    function renderMuscleRow(item) {
        const title = item.nameAr || item.name || itemName(item);
        const muscleMedia = window.TopGymMuscleAssets?.imageMarkup
            ? window.TopGymMuscleAssets.imageMarkup(item, 'main', { className: 'muscle-media-thumb', alt: title, icon: item.icon || '💪' })
            : `<span class="muscle-media muscle-media-fallback"><span class="muscle-media-fallback-icon">${escapeHtml(item.icon || '💪')}</span></span>`;
        return `<tr><td><div class="library-table-primary"><span class="library-table-icon muscle-table-icon">${muscleMedia}</span><div><strong title="${escapeHtml(title)}">${escapeHtml(title)}</strong><small>${escapeHtml(item.name || '')}</small></div></div></td><td>${item.bodyPart ? `<span class="library-table-badge muscles">${escapeHtml(item.bodyPart)}</span>` : '—'}</td><td>${item.descriptionAr || item.description ? '<span class="library-table-badge positive">وصف متاح</span>' : '—'}</td><td>${formatNumber(item.id)}</td><td>${tableActions(item.id)}</td></tr>`;
    }

    function renderFoodRow(item) {
        const title = item.nameAr || item.nameEn || itemName(item);
        return `<tr><td><div class="library-table-primary"><span class="library-table-icon">🥗</span><div><strong title="${escapeHtml(title)}">${escapeHtml(title)}</strong><small>${escapeHtml(item.nameEn || '')}</small></div></div></td><td>${item.category ? `<span class="library-table-badge foods">${escapeHtml(item.category)}</span>` : '—'}</td><td><strong>${formatNumber(item.calories, 1)}</strong><small>سعرة</small></td><td><strong>${formatNumber(item.protein, 1)} g</strong><small>بروتين</small></td><td><strong>${formatNumber(item.carbs, 1)} g</strong><small>كارب</small></td><td><strong>${formatNumber(item.fat, 1)} g</strong><small>دهون</small></td><td>${formatNumber(item.servingSize, 1)} ${escapeHtml(item.servingUnit || '')}</td><td>${tableActions(item.id)}</td></tr>`;
    }

    function renderExerciseRow(item) {
        const title = item.nameAr || item.name || itemName(item);
        const target = item.targetMuscleNameAr || item.targetMuscleName || 'غير محددة';
        return `<tr><td><div class="library-table-primary"><span class="library-table-icon exercise-table-icon">${exerciseImage(item, 'main', { className: 'exercise-media-thumb', alt: title })}</span><div><strong title="${escapeHtml(title)}">${escapeHtml(title)}</strong><small>${escapeHtml(item.name || '')}</small></div></div></td><td><span class="library-table-badge exercises">${escapeHtml(target)}</span></td><td>${item.difficulty ? escapeHtml(item.difficulty) : '—'}</td><td>${item.equipment ? escapeHtml(item.equipment) : '—'}</td><td>${item.category ? escapeHtml(item.category) : '—'}</td><td>${item.isHighImpact ? '<span class="library-table-badge warning">مجهود مرتفع</span>' : '—'}</td><td>${tableActions(item.id)}</td></tr>`;
    }

    function renderList() {
        const list = $('libraryList');
        if (!list) return;
        if (!state.items.length) {
            list.innerHTML = `<div class="library-empty">${META[state.activeType].empty}</div>`;
            renderPagination();
            return;
        }
        const renderer = state.activeType === 'muscles' ? renderMuscleRow : state.activeType === 'foods' ? renderFoodRow : renderExerciseRow;
        const headers = state.activeType === 'muscles'
            ? '<th>العضلة</th><th>منطقة الجسم</th><th>الوصف</th><th>الرقم</th><th>الإجراءات</th>'
            : state.activeType === 'foods'
                ? '<th>الطعام</th><th>التصنيف</th><th>السعرات</th><th>البروتين</th><th>الكربوهيدرات</th><th>الدهون</th><th>الحصة</th><th>الإجراءات</th>'
                : '<th>التمرين</th><th>العضلة المستهدفة</th><th>المستوى</th><th>الأداة</th><th>التصنيف</th><th>التنبيه</th><th>الإجراءات</th>';
        list.innerHTML = `<div class="library-table-wrap"><table class="library-data-table ${state.activeType}"><thead><tr>${headers}</tr></thead><tbody>${state.items.map(renderer).join('')}</tbody></table></div>`;
        window.TopGymExerciseAssets?.hydrate(list);
        window.TopGymMuscleAssets?.hydrate(list);
        renderPagination();
    }

    function renderPagination() {
        const container = $('libraryPagination');
        const pagination = state.pagination;
        if (!container || !pagination || pagination.totalItems <= pagination.pageSize) {
            if (container) container.hidden = true;
            return;
        }
        container.hidden = false;
        const from = (pagination.page - 1) * pagination.pageSize + 1;
        const to = Math.min(pagination.totalItems, pagination.page * pagination.pageSize);
        container.innerHTML = `<span class="library-pagination-info">عرض ${formatNumber(from)}–${formatNumber(to)} من ${formatNumber(pagination.totalItems)} ${META[state.activeType].singular}</span><div class="library-pagination-actions"><button class="btn btn-light" type="button" data-library-page="prev" ${pagination.page <= 1 ? 'disabled' : ''}>السابق</button><button class="btn btn-light" type="button" data-library-page="next" ${pagination.page >= pagination.totalPages ? 'disabled' : ''}>التالي</button></div>`;
    }

    async function loadOptions(force = false) {
        if (state.options && !force) {
            renderSummary();
            renderFilters();
            return;
        }
        try {
            const suffix = force ? `?refresh=${Date.now()}` : '';
            state.options = await requestJson(`/api/library/options${suffix}`);
            renderSummary();
            renderFilters();
        } catch (error) {
            showMessage(error.message, 'error');
        }
    }

    async function loadCollection(force = false) {
        if (!state.opened) return;
        if (state.activeType === 'exercises' && window.TopGymExerciseAssets?.load) {
            await window.TopGymExerciseAssets.load().catch(() => null);
        }
        if (state.activeType === 'muscles' && window.TopGymMuscleAssets?.load) {
            await window.TopGymMuscleAssets.load().catch(() => null);
        }
        const filters = state.filters[state.activeType];
        const requestKey = JSON.stringify([state.activeType, state.page, state.search, filters]);
        if (!force && state.lastLoadedKey === requestKey && Date.now() - state.lastLoadedAt < 30000) {
            renderList();
            return;
        }
        if (state.abortController) state.abortController.abort();
        state.abortController = new AbortController();
        const requestId = ++state.requestId;
        const params = new URLSearchParams({ page: String(state.page), pageSize: String(state.pageSize), search: state.search });
        if (force) params.set('refresh', String(Date.now()));
        Object.entries(filters).forEach(([key, value]) => { if (value) params.set(key, value); });
        const list = $('libraryList');
        if (list) list.innerHTML = '<div class="loading">جاري تحميل بيانات المكتبة...</div>';
        try {
            const response = await requestJson(`/api/library/${state.activeType}?${params}`, { signal: state.abortController.signal });
            if (requestId !== state.requestId) return;
            state.items = response.items || [];
            state.pagination = response.pagination || null;
            state.lastLoadedKey = requestKey;
            state.lastLoadedAt = Date.now();
            renderList();
        } catch (error) {
            if (error.name === 'AbortError') return;
            if (list) list.innerHTML = `<div class="library-empty">${escapeHtml(error.message)}</div>`;
            const pagination = $('libraryPagination');
            if (pagination) pagination.hidden = true;
            showMessage(error.message, 'error');
        }
    }

    function field(name, label, value = '', type = 'text', options = {}) {
        const required = options.required ? ' required' : '';
        const full = options.full ? ' full' : '';
        const min = options.min !== undefined ? ` min="${options.min}"` : '';
        const step = options.step !== undefined ? ` step="${options.step}"` : '';
        const placeholder = options.placeholder ? ` placeholder="${escapeHtml(options.placeholder)}"` : '';
        return `<div class="library-field${full}"><label for="libraryField_${name}">${label}${options.required ? ' *' : ''}</label><input id="libraryField_${name}" data-library-field="${name}" type="${type}" value="${escapeHtml(value)}"${required}${min}${step}${placeholder}></div>`;
    }

    function textareaField(name, label, value = '', options = {}) {
        return `<div class="library-field${options.full ? ' full' : ''}"><label for="libraryField_${name}">${label}</label><textarea id="libraryField_${name}" data-library-field="${name}" placeholder="${escapeHtml(options.placeholder || 'كل عنصر في سطر مستقل')}">${escapeHtml(value)}</textarea></div>`;
    }

    function selectField(name, label, value, options, placeholder, full = false) {
        return `<div class="library-field${full ? ' full' : ''}"><label for="libraryField_${name}">${label}</label><select id="libraryField_${name}" data-library-field="${name}"><option value="">${placeholder}</option>${options.map((option) => { const optionValue = typeof option === 'object' ? option.value : option; const optionLabel = typeof option === 'object' ? option.label : option; return `<option value="${escapeHtml(optionValue)}"${selected(optionValue, value)}>${escapeHtml(optionLabel)}</option>`; }).join('')}</select></div>`;
    }

    function formValue(item, key) { return item?.[key] ?? ''; }

    function renderFormFields(type, item = {}) {
        const fields = $('libraryFormFields');
        if (!fields) return;
        if (type === 'muscles') {
            fields.innerHTML = `<div class="library-form-grid">${field('nameAr', 'الاسم بالعربية', formValue(item, 'nameAr'), 'text', { required: true })}${field('name', 'الاسم بالإنجليزية', formValue(item, 'name'), 'text', { required: true })}${field('bodyPart', 'منطقة الجسم', formValue(item, 'bodyPart'))}${field('icon', 'الأيقونة', formValue(item, 'icon'), 'text', { placeholder: '💪' })}${textareaField('descriptionAr', 'الوصف بالعربية', formValue(item, 'descriptionAr'), { full: true })}${textareaField('description', 'الوصف بالإنجليزية', formValue(item, 'description'), { full: true })}</div>`;
            return;
        }
        if (type === 'foods') {
            fields.innerHTML = `<div class="library-form-grid"><div class="library-form-section-title">البيانات الأساسية</div>${field('nameAr', 'اسم الطعام بالعربية', formValue(item, 'nameAr'), 'text', { required: true })}${field('nameEn', 'اسم الطعام بالإنجليزية', formValue(item, 'nameEn'), 'text')}${field('category', 'التصنيف', formValue(item, 'category'))}${field('servingUnit', 'وحدة الحصة', formValue(item, 'servingUnit'), 'text', { placeholder: 'gram' })}${field('servingSize', 'حجم الحصة', formValue(item, 'servingSize') || 100, 'number', { min: 0.001, step: 0.001, required: true })}<div></div><div class="library-form-section-title">القيم الغذائية لكل حصة</div>${field('calories', 'السعرات الحرارية', formValue(item, 'calories'), 'number', { min: 0, step: 0.001 })}${field('protein', 'البروتين', formValue(item, 'protein'), 'number', { min: 0, step: 0.001 })}${field('carbs', 'الكربوهيدرات', formValue(item, 'carbs'), 'number', { min: 0, step: 0.001 })}${field('fat', 'الدهون', formValue(item, 'fat'), 'number', { min: 0, step: 0.001 })}${field('fiber', 'الألياف', formValue(item, 'fiber'), 'number', { min: 0, step: 0.001 })}${field('sugar', 'السكريات', formValue(item, 'sugar'), 'number', { min: 0, step: 0.001 })}${field('sodium', 'الصوديوم', formValue(item, 'sodium'), 'number', { min: 0, step: 0.001 })}</div>`;
            return;
        }
        const muscles = (state.options?.filters?.muscles || []).map((muscle) => ({ value: muscle.id, label: muscle.nameAr || muscle.name }));
        const secondary = safeArray(item.secondaryMuscles).map((entry) => {
            const muscleId = entry?.muscleId ?? entry?.muscle_id ?? entry;
            const contribution = entry?.contributionPercent ?? entry?.contribution_percent;
            return contribution === undefined || contribution === null || contribution === ''
                ? String(muscleId)
                : `${muscleId}, ${contribution}`;
        }).join('\n');
        fields.innerHTML = `<div class="library-form-grid"><div class="library-form-section-title">بيانات التمرين</div>${field('nameAr', 'اسم التمرين بالعربية', formValue(item, 'nameAr'), 'text', { required: true })}${field('name', 'الاسم بالإنجليزية', formValue(item, 'name'), 'text', { required: true })}${selectField('targetMuscleId', 'العضلة المستهدفة', formValue(item, 'targetMuscleId'), muscles, 'اختر العضلة')}${field('equipment', 'الأداة', formValue(item, 'equipment'))}${field('difficulty', 'المستوى', formValue(item, 'difficulty'))}${field('category', 'التصنيف', formValue(item, 'category'))}${field('movementPattern', 'نمط الحركة', formValue(item, 'movementPattern'))}${field('mechanic', 'الميكانيكية', formValue(item, 'mechanic'))}${field('force', 'نوع القوة', formValue(item, 'force'))}${field('icon', 'الأيقونة', formValue(item, 'icon'), 'text', { placeholder: '🏋️' })}${field('repsRange', 'مدى التكرارات', formValue(item, 'repsRange'), 'text', { placeholder: '8-12' })}${field('setsRange', 'مدى المجموعات', formValue(item, 'setsRange'), 'text', { placeholder: '3-4' })}${field('restSeconds', 'الراحة بالثواني', formValue(item, 'restSeconds'), 'number', { min: 0, step: 1 })}${field('tempo', 'الإيقاع', formValue(item, 'tempo'), 'text', { placeholder: '3-1-2-0' })}<div class="library-field checkbox"><input id="libraryField_isHighImpact" data-library-field="isHighImpact" type="checkbox"${item.isHighImpact ? ' checked' : ''}><label for="libraryField_isHighImpact">تمرين عالي المجهود</label></div>${field('videoUrl', 'رابط الفيديو', formValue(item, 'videoUrl'), 'url', { full: true })}${textareaField('descriptionAr', 'الوصف بالعربية', formValue(item, 'descriptionAr'), { full: true })}${textareaField('description', 'الوصف بالإنجليزية', formValue(item, 'description'), { full: true })}<div class="library-form-section-title">المحتوى التدريبي — اكتب كل نقطة في سطر</div>${textareaField('secondaryMuscles', 'العضلات الثانوية', secondary, { placeholder: 'رقم العضلة، نسبة المساهمة مثل: 35, 25' })}${textareaField('instructionsAr', 'التعليمات بالعربية', lineText(item.instructionsAr))}${textareaField('instructions', 'التعليمات بالإنجليزية', lineText(item.instructions))}${textareaField('tipsAr', 'النصائح بالعربية', lineText(item.tipsAr))}${textareaField('tips', 'النصائح بالإنجليزية', lineText(item.tips))}${textareaField('commonMistakesAr', 'الأخطاء الشائعة بالعربية', lineText(item.commonMistakesAr))}${textareaField('commonMistakes', 'الأخطاء الشائعة بالإنجليزية', lineText(item.commonMistakes))}</div>`;
    }

    function openForm(item = null) {
        const type = state.activeType;
        const dialog = $('libraryFormDialog');
        const form = $('libraryForm');
        if (!dialog || !form) return;
        form.dataset.type = type;
        form.dataset.id = item?.id ? String(item.id) : '';
        $('libraryFormTitle').textContent = item ? `تعديل ${META[type].singular}` : META[type].add;
        $('libraryFormDescription').textContent = item ? 'حدّث البيانات ثم احفظ التعديلات في المكتبة.' : 'أدخل البيانات الأساسية، ويمكنك استكمال التفاصيل لاحقًا.';
        $('libraryFormSave').textContent = item ? 'حفظ التعديلات' : 'حفظ العنصر';
        renderFormFields(type, item || {});
        openDialog(dialog);
    }

    function readField(form, name) { return form.querySelector(`[data-library-field="${name}"]`)?.value ?? ''; }

    function readLines(form, name) {
        return readField(form, name).split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    }

    function readSecondary(form) {
        const value = readField(form, 'secondaryMuscles').trim();
        if (!value) return [];
        if (value.startsWith('[')) {
            const parsed = JSON.parse(value);
            if (!Array.isArray(parsed)) throw new Error('العضلات الثانوية يجب أن تكون قائمة.');
            return parsed;
        }
        return value.split(/\r?\n/).filter(Boolean).map((line) => {
            const parts = line.split(/[,،]/).map((part) => part.trim());
            const muscleId = Number(parts[0]);
            const contributionPercent = parts[1] === undefined || parts[1] === '' || parts[1].toLowerCase() === 'null'
                ? null
                : Number(parts[1]);
            if (!Number.isInteger(muscleId) || muscleId < 1 || (contributionPercent !== null && !Number.isFinite(contributionPercent))) throw new Error('صيغة العضلات الثانوية: رقم العضلة، النسبة.');
            return { muscleId, contributionPercent };
        });
    }

    function collectForm(form) {
        const type = form.dataset.type;
        if (type === 'muscles') {
            return { nameAr: readField(form, 'nameAr'), name: readField(form, 'name'), bodyPart: readField(form, 'bodyPart'), icon: readField(form, 'icon'), descriptionAr: readField(form, 'descriptionAr'), description: readField(form, 'description') };
        }
        if (type === 'foods') {
            return { nameAr: readField(form, 'nameAr'), nameEn: readField(form, 'nameEn'), category: readField(form, 'category'), servingSize: Number(readField(form, 'servingSize') || 100), servingUnit: readField(form, 'servingUnit'), calories: Number(readField(form, 'calories') || 0), protein: Number(readField(form, 'protein') || 0), carbs: Number(readField(form, 'carbs') || 0), fat: Number(readField(form, 'fat') || 0), fiber: Number(readField(form, 'fiber') || 0), sugar: Number(readField(form, 'sugar') || 0), sodium: Number(readField(form, 'sodium') || 0) };
        }
        return { nameAr: readField(form, 'nameAr'), name: readField(form, 'name'), targetMuscleId: readField(form, 'targetMuscleId') || null, secondaryMuscles: readSecondary(form), equipment: readField(form, 'equipment'), isHighImpact: Boolean(form.querySelector('[data-library-field="isHighImpact"]')?.checked), difficulty: readField(form, 'difficulty'), category: readField(form, 'category'), movementPattern: readField(form, 'movementPattern'), mechanic: readField(form, 'mechanic'), force: readField(form, 'force'), icon: readField(form, 'icon'), repsRange: readField(form, 'repsRange'), setsRange: readField(form, 'setsRange'), restSeconds: readField(form, 'restSeconds') === '' ? null : Number(readField(form, 'restSeconds')), tempo: readField(form, 'tempo'), videoUrl: readField(form, 'videoUrl'), descriptionAr: readField(form, 'descriptionAr'), description: readField(form, 'description'), instructionsAr: readLines(form, 'instructionsAr'), instructions: readLines(form, 'instructions'), tipsAr: readLines(form, 'tipsAr'), tips: readLines(form, 'tips'), commonMistakesAr: readLines(form, 'commonMistakesAr'), commonMistakes: readLines(form, 'commonMistakes') };
    }

    function normalizeMuscleEntry(entry) {
        if (!entry) return null;
        const source = typeof entry === 'object' ? entry : { id: entry };
        const id = nonEmptyValue(source.id, source.muscleId, source.muscle_id);
        const sourceId = nonEmptyValue(source.sourceId, source.source_id, source.muscleSourceId, source.muscle_source_id);
        const nameAr = nonEmptyValue(source.nameAr, source.name_ar, source.muscleNameAr, source.muscle_name_ar);
        const nameEn = nonEmptyValue(source.name, source.nameEn, source.name_en, source.muscleName, source.muscle_name);
        if (!id && !sourceId && !nameAr && !nameEn) return null;
        return { id, sourceId, nameAr, nameEn };
    }

    function buildMuscleCatalog() {
        const entries = [];
        const seen = new Set();
        const add = (entry) => {
            const normalized = normalizeMuscleEntry(entry);
            if (!normalized) return;
            const key = [normalized.id, normalized.sourceId, normalized.nameAr, normalized.nameEn].join('|');
            if (seen.has(key)) return;
            seen.add(key);
            entries.push(normalized);
        };
        safeArray(state.options?.filters?.muscles).forEach(add);
        safeArray(state.muscleCatalog).forEach(add);
        return entries;
    }

    async function loadMuscleCatalog() {
        if (state.muscleCatalog) return state.muscleCatalog;
        if (state.muscleCatalogPromise) return state.muscleCatalogPromise;
        const optionFallback = safeArray(state.options?.filters?.muscles).map(normalizeMuscleEntry).filter(Boolean);
        state.muscleCatalogPromise = (async () => {
            const firstPage = await requestJson('/api/library/muscles?page=1&pageSize=100');
            const totalPages = Math.max(1, Number(firstPage?.pagination?.totalPages || 1));
            const remainingPages = totalPages > 1
                ? await Promise.all(Array.from({ length: totalPages - 1 }, (_, index) => requestJson(`/api/library/muscles?page=${index + 2}&pageSize=100`)))
                : [];
            state.muscleCatalog = [
                ...optionFallback,
                ...safeArray(firstPage?.items),
                ...remainingPages.flatMap((page) => safeArray(page?.items))
            ];
            return state.muscleCatalog;
        })().catch((error) => {
            state.muscleCatalog = optionFallback;
            throw error;
        }).finally(() => {
            state.muscleCatalogPromise = null;
        });
        return state.muscleCatalogPromise;
    }

    function resolveMuscle(reference, explicitNameAr = '', explicitNameEn = '') {
        const source = reference && typeof reference === 'object' ? reference : {};
        const sourceCandidates = [source.sourceId, source.source_id].filter((value) => value !== undefined && value !== null && value !== '');
        // Older API payloads expose the catalog/source muscle number only as
        // `muscleId`. Treat it as a DB id fallback as well; when both values
        // exist, the explicit source-id match still wins below.
        const idCandidates = [source.id, source.dbId, source.db_id, source.sourceId, source.source_id]
            .filter((value) => value !== undefined && value !== null && value !== '');
        if (!sourceCandidates.length && !idCandidates.length && reference !== undefined && reference !== null && reference !== '' && typeof reference !== 'object') sourceCandidates.push(reference);
        const catalog = buildMuscleCatalog();
        const matchBySource = catalog.find((entry) => sourceCandidates.some((candidate) => entry.sourceId !== '' && String(entry.sourceId) === String(candidate)));
        const matchById = catalog.find((entry) => idCandidates.some((candidate) => entry.id !== '' && String(entry.id) === String(candidate)));
        const match = matchBySource || matchById;
        const nameAr = nonEmptyValue(explicitNameAr, source.nameAr, source.name_ar, source.muscleNameAr, source.muscle_name_ar, match?.nameAr);
        const nameEn = nonEmptyValue(explicitNameEn, source.name, source.nameEn, source.name_en, source.muscleName, source.muscle_name, match?.nameEn);
        return { id: match?.id || source.id || '', sourceId: match?.sourceId || source.sourceId || '', nameAr, nameEn, matched: Boolean(match || nameAr || nameEn) };
    }

    function bilingualName(nameAr, nameEn, fallback = 'غير محددة') {
        const arabic = String(nameAr || '').trim();
        const english = String(nameEn || '').trim();
        if (arabic && english && arabic.toLocaleLowerCase() !== english.toLocaleLowerCase()) return `${arabic} · ${english}`;
        return arabic || english || fallback;
    }

    function contributionText(entry) {
        const raw = nonEmptyValue(entry?.contributionPercent, entry?.contribution, entry?.percentage);
        const percentage = Number(raw);
        return Number.isFinite(percentage) && percentage > 0 ? ` — ${formatNumber(percentage, 1)}%` : '';
    }

    function secondaryMuscleLabels(item) {
        const entries = safeArray(item?.secondaryMuscleDetails).length
            ? item.secondaryMuscleDetails
            : safeArray(item?.secondaryMuscles);
        return entries.map((entry) => {
            const source = entry && typeof entry === 'object' ? entry : { sourceId: entry };
            const reference = source.id || source.dbId || source.db_id
                ? source
                : { ...source, sourceId: nonEmptyValue(source.sourceId, source.source_id, source.muscleId, source.muscle_id) };
            const resolved = resolveMuscle(reference,
                nonEmptyValue(source.nameAr, source.name_ar),
                nonEmptyValue(source.name, source.nameEn, source.name_en));
            return `${bilingualName(resolved.nameAr, resolved.nameEn, 'عضلة غير محددة')}${contributionText(entry)}`;
        }).filter(Boolean);
    }

    const EXERCISE_VALUE_LABELS = {
        difficulty: { beginner: 'مبتدئ', intermediate: 'متوسط', advanced: 'متقدم', expert: 'خبير' },
        equipment: { 'body only': 'وزن الجسم', barbell: 'بار', dumbbell: 'دامبل', cable: 'كابل', kettlebells: 'كيتل بيل', machine: 'جهاز', bands: 'أشرطة مقاومة', 'e-z curl bar': 'بار EZ', other: 'أخرى' },
        category: { strength: 'قوة', stretching: 'إطالة', plyometrics: 'تمارين انفجارية', cardio: 'كارديو', powerlifting: 'باور ليفتنج', olympic: 'أولمبي', strongman: 'سترونجمان' }
    };

    function exerciseValue(value, type) {
        const raw = String(value || '').trim();
        if (!raw) return 'غير محدد';
        const translated = EXERCISE_VALUE_LABELS[type]?.[raw.toLowerCase()];
        return translated && translated.toLocaleLowerCase() !== raw.toLocaleLowerCase() ? `${translated} · ${raw}` : translated || raw;
    }

    function detailItem(label, value, full = false) {
        const displayValue = value === 0 ? '0' : nonEmptyValue(value, 'غير متوفر في بيانات المصدر');
        return `<div class="library-detail-item${full ? ' full' : ''}"><span>${escapeHtml(label)}</span><strong>${escapeHtml(displayValue)}</strong></div>`;
    }

    function detailList(label, values, fallback = 'غير متوفر في بيانات المصدر') {
        const list = contentLines(values);
        return `<div class="library-detail-item full"><span>${escapeHtml(label)}</span>${list.length ? `<ol class="library-detail-list">${list.map((value) => `<li>${escapeHtml(value)}</li>`).join('')}</ol>` : `<strong>${escapeHtml(fallback)}</strong>`}</div>`;
    }

    function renderDetailsContent(type, item) {
        const content = $('libraryDetailsContent');
        if (!content || !item) return;
        const names = itemNames(item);
        $('libraryDetailsTitle').textContent = `تفاصيل ${META[type].singular}`;
        $('libraryDetailsSubtitle').textContent = `${itemName(item)} · رقم ${item.id}`;
        if (type === 'muscles') {
            const muscleGallery = window.TopGymMuscleAssets?.galleryMarkup
                ? window.TopGymMuscleAssets.galleryMarkup(item, { alt: itemName(item) })
                : '';
            content.innerHTML = `<div class="library-detail-hero"><span class="library-detail-hero-icon">${escapeHtml(item.icon || '💪')}</span><div><h4>${escapeHtml(itemName(item))}</h4><p>${escapeHtml(names.english || 'الاسم الإنجليزي غير متاح')}</p></div></div><div class="muscle-detail-visual">${muscleGallery}<small class="muscle-detail-source-note">الصور التشريحية من BodyParts3D / Anatomography بنفس الهوية البصرية. السجلات غير المطابقة تعرض fallback لحين المراجعة.</small></div><div class="library-detail-grid">${detailItem('الاسم بالعربية', names.arabic || 'الاسم العربي غير متاح')}${detailItem('الاسم بالإنجليزية', names.english || 'الاسم الإنجليزي غير متاح')}${detailItem('منطقة الجسم', item.bodyPart)}${detailItem('المعرّف المصدر', item.sourceId)}${detailItem('الوصف بالعربية', item.descriptionAr, true)}${detailItem('الوصف بالإنجليزية', item.description, true)}</div>`;
        } else if (type === 'foods') {
            content.innerHTML = `<div class="library-detail-hero"><span class="library-detail-hero-icon">🥗</span><div><h4>${escapeHtml(itemName(item))}</h4><p>${escapeHtml(names.english || 'الاسم الإنجليزي غير متاح')}</p></div></div><div class="library-detail-grid">${detailItem('الاسم بالعربية', names.arabic || 'الاسم العربي غير متاح')}${detailItem('الاسم بالإنجليزية', names.english || 'الاسم الإنجليزي غير متاح')}${detailItem('التصنيف', item.category)}${detailItem('الحصة', `${formatNumber(item.servingSize, 1)} ${item.servingUnit || ''}`)}${detailItem('السعرات', formatNumber(item.calories, 1))}${detailItem('البروتين', `${formatNumber(item.protein, 1)} g`)}${detailItem('الكربوهيدرات', `${formatNumber(item.carbs, 1)} g`)}${detailItem('الدهون', `${formatNumber(item.fat, 1)} g`)}${detailItem('الألياف', `${formatNumber(item.fiber, 1)} g`)}${detailItem('السكريات', `${formatNumber(item.sugar, 1)} g`)}${detailItem('الصوديوم', `${formatNumber(item.sodium, 1)} mg`)}</div>`;
        } else {
            const primary = resolveMuscle(item.targetMuscleId, item.targetMuscleNameAr, item.targetMuscleName);
            const primaryLabel = bilingualName(primary.nameAr, primary.nameEn, 'العضلة الأساسية غير محددة');
            const secondary = secondaryMuscleLabels(item);
            const primaryMedia = window.TopGymMuscleAssets?.imageMarkup
                ? `<div class="exercise-target-muscle-visual"><span>العضلة المستهدفة</span>${window.TopGymMuscleAssets.imageMarkup(primary, 'main', { className: 'exercise-target-muscle-image', alt: primaryLabel, icon: '💪' })}<strong>${escapeHtml(primaryLabel)}</strong></div>`
                : '';
            const details = [
                detailItem('الاسم بالعربية', names.arabic || 'الاسم العربي غير متاح', true),
                detailItem('الاسم بالإنجليزية', names.english || 'الاسم الإنجليزي غير متاح', true),
                detailItem('العضلة الأساسية', primaryLabel),
                detailItem('المستوى', exerciseValue(item.difficulty, 'difficulty')),
                detailItem('التصنيف', exerciseValue(item.category, 'category')),
                detailItem('الأداة', exerciseValue(item.equipment, 'equipment')),
                detailItem('نمط الحركة', item.movementPattern),
                detailItem('الميكانيكية', item.mechanic),
                detailItem('نوع القوة', item.force),
                detailItem('مدى التكرارات', item.repsRange),
                detailItem('مدى المجموعات', item.setsRange),
                detailItem('الراحة', item.restSeconds == null ? 'غير محددة' : `${item.restSeconds} ثانية`),
                detailItem('التمرين عالي المجهود', item.isHighImpact ? 'نعم' : 'لا'),
                detailItem('رابط الفيديو', item.videoUrl, true),
                detailItem('الوصف بالعربية', item.descriptionAr, true),
                detailItem('الوصف بالإنجليزية', item.description, true),
                detailList('العضلات الثانوية', secondary, 'لم تُسجل عضلات ثانوية في بيانات التمرين'),
                detailList('التعليمات بالعربية', item.instructionsAr, 'الخطوات العربية غير متاحة في بيانات المصدر'),
                detailList('التعليمات بالإنجليزية', item.instructions, 'الخطوات الإنجليزية غير متاحة في بيانات المصدر'),
                detailList('النصائح بالعربية', item.tipsAr, 'النصائح العربية غير متاحة في بيانات المصدر'),
                detailList('النصائح بالإنجليزية', item.tips, 'النصائح الإنجليزية غير متاحة في بيانات المصدر'),
                detailList('الأخطاء الشائعة بالعربية', item.commonMistakesAr, 'الأخطاء الشائعة بالعربية غير متاحة في بيانات المصدر'),
                detailList('الأخطاء الشائعة بالإنجليزية', item.commonMistakes, 'الأخطاء الشائعة بالإنجليزية غير متاحة في بيانات المصدر')
            ];
            content.innerHTML = `<div class="library-detail-hero"><span class="library-detail-hero-icon">${escapeHtml(item.icon || '🏋️')}</span><div><h4>${escapeHtml(names.arabic || names.english || 'تمرين بدون اسم')}</h4><p>${escapeHtml(names.english || 'الاسم الإنجليزي غير متاح')}</p></div></div><div class="library-detail-grid">${details.join('')}</div>`;
            const hero = content.querySelector('.library-detail-hero');
            const heroIcon = hero?.querySelector('.library-detail-hero-icon');
            if (heroIcon) heroIcon.outerHTML = `<div class="exercise-detail-gallery exercise-media-gallery">${exerciseGallery(item)}</div>`;
            if (primaryMedia) hero?.insertAdjacentHTML('afterend', primaryMedia);
        }
        window.TopGymMuscleAssets?.hydrate(content);
        window.TopGymExerciseAssets?.hydrate(content);
    }

    async function showDetails(item) {
        const type = state.activeType;
        const content = $('libraryDetailsContent');
        if (!content) return;
        const requestId = ++state.detailsRequestId;
        state.detailsItem = item;
        state.detailsType = type;
        renderDetailsContent(type, item);
        openDialog($('libraryDetailsDialog'));
        if (type === 'muscles') {
            await window.TopGymMuscleAssets?.load?.().catch(() => null);
            if (requestId === state.detailsRequestId && state.detailsType === type) renderDetailsContent(type, state.detailsItem);
            return;
        }
        if (type !== 'exercises') return;
        const [latestResult] = await Promise.allSettled([
            requestJson(`/api/library/exercises/${encodeURIComponent(item.id)}`),
            loadMuscleCatalog()
        ]);
        if (requestId !== state.detailsRequestId || state.detailsType !== type) return;
        if (latestResult.status === 'fulfilled' && latestResult.value?.item) state.detailsItem = latestResult.value.item;
        renderDetailsContent(type, state.detailsItem);
    }

    async function confirmDelete(item) {
        const name = itemName(item);
        if (window.Swal) {
            const result = await window.Swal.fire({ position: 'center', backdrop: 'rgba(15, 23, 42, .52)', icon: 'warning', title: 'تأكيد الحذف', text: `هل تريد حذف ${name}؟`, showCancelButton: true, confirmButtonText: 'نعم، احذف', cancelButtonText: 'إلغاء', buttonsStyling: false, customClass: { popup: 'delete-confirm-alert', confirmButton: 'btn btn-primary', cancelButton: 'btn btn-light' } });
            return result.isConfirmed;
        }
        return window.confirm(`هل تريد حذف ${name}؟`);
    }

    async function deleteItem(item) {
        if (!(await confirmDelete(item))) return;
        try {
            await requestJson(`/api/library/${state.activeType}/${item.id}`, { method: 'DELETE' });
            showMessage(`تم حذف ${META[state.activeType].singular} بنجاح.`);
            await loadOptions(true);
            if (state.page > 1 && state.items.length === 1) state.page -= 1;
            await loadCollection(true);
        } catch (error) {
            showMessage(error.message, 'error');
        }
    }

    async function submitForm(event) {
        event.preventDefault();
        const form = event.currentTarget;
        const type = form.dataset.type;
        const id = form.dataset.id;
        const button = $('libraryFormSave');
        try {
            const body = collectForm(form);
            button.disabled = true;
            await requestJson(id ? `/api/library/${type}/${id}` : `/api/library/${type}`, { method: id ? 'PUT' : 'POST', body: JSON.stringify(body) });
            closeDialog($('libraryFormDialog'));
            showMessage(id ? 'تم حفظ التعديلات بنجاح.' : `تمت إضافة ${META[type].singular} بنجاح.`);
            await loadOptions(true);
            await loadCollection(true);
        } catch (error) {
            showMessage(error.message, 'error');
        } finally {
            button.disabled = false;
        }
    }

    async function handleListClick(event) {
        const button = event.target.closest('[data-library-action]');
        if (!button) return;
        const item = state.items.find((entry) => String(entry.id) === String(button.dataset.id));
        if (!item) return;
        if (button.dataset.libraryAction === 'details') await showDetails(item);
        if (button.dataset.libraryAction === 'edit') openForm(item);
        if (button.dataset.libraryAction === 'delete') await deleteItem(item);
    }

    function changeType(type) {
        if (!VISIBLE_TYPES.includes(type) || type === state.activeType) return;
        state.activeType = type;
        state.page = 1;
        state.search = '';
        $('librarySearch').value = '';
        renderTypeTabs();
        renderFilters();
        loadCollection();
    }

    async function initialize() {
        if (!state.opened) {
            state.opened = true;
            renderTypeTabs();
            await Promise.all([loadOptions(), loadCollection()]);
            return;
        }
        renderTypeTabs();
        renderFilters();
        await loadCollection();
    }

    let eventsInitialized = false;

    function initializeEvents() {
        if (eventsInitialized) return;
        eventsInitialized = true;
        document.querySelectorAll('[data-library-type]').forEach((button) => button.addEventListener('click', () => changeType(button.dataset.libraryType)));
        $('libraryAddButton')?.addEventListener('click', () => openForm());
        $('libraryRefreshButton')?.addEventListener('click', () => { loadOptions(true); loadCollection(true); });
        $('libraryList')?.addEventListener('click', handleListClick);
        $('libraryPagination')?.addEventListener('click', (event) => {
            const button = event.target.closest('[data-library-page]');
            if (!button || button.disabled || !state.pagination) return;
            state.page += button.dataset.libraryPage === 'next' ? 1 : -1;
            loadCollection();
        });
        $('libraryFilters')?.addEventListener('change', (event) => {
            const filter = event.target.closest('[data-library-filter]');
            if (!filter) return;
            state.filters[state.activeType][filter.dataset.libraryFilter] = filter.value;
            state.page = 1;
            loadCollection();
        });
        $('librarySearch')?.addEventListener('input', (event) => {
            state.search = event.target.value.trim();
            state.page = 1;
            window.clearTimeout(state.searchTimer);
            state.searchTimer = window.setTimeout(loadCollection, 300);
        });
        $('libraryForm')?.addEventListener('submit', submitForm);
        $('libraryFormClose')?.addEventListener('click', () => closeDialog($('libraryFormDialog')));
        $('libraryFormCancel')?.addEventListener('click', () => closeDialog($('libraryFormDialog')));
        $('libraryDetailsClose')?.addEventListener('click', () => closeDialog($('libraryDetailsDialog')));
        window.addEventListener('topgym:tab-changed', (event) => { if (event.detail?.name === 'library') initialize(); });
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initializeEvents, { once: true });
    else initializeEvents();
})();
