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
        searchTimer: null
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
    function itemName(item) { return item?.nameAr || item?.name || item?.nameEn || 'عنصر بدون اسم'; }

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
        return `<div class="library-row-actions"><button class="btn btn-light" type="button" data-library-action="details" data-id="${id}">التفاصيل</button><button class="btn btn-light" type="button" data-library-action="edit" data-id="${id}">تعديل</button><button class="btn library-delete" type="button" data-library-action="delete" data-id="${id}">حذف</button></div>`;
    }

    function renderMuscleRow(item) {
        const title = item.nameAr || item.name || itemName(item);
        return `<tr><td><div class="library-table-primary"><span class="library-table-icon">${escapeHtml(item.icon || '💪')}</span><div><strong title="${escapeHtml(title)}">${escapeHtml(title)}</strong><small>${escapeHtml(item.name || '')}</small></div></div></td><td>${item.bodyPart ? `<span class="library-table-badge muscles">${escapeHtml(item.bodyPart)}</span>` : '—'}</td><td>${item.descriptionAr || item.description ? '<span class="library-table-badge positive">وصف متاح</span>' : '—'}</td><td>${formatNumber(item.id)}</td><td>${tableActions(item.id)}</td></tr>`;
    }

    function renderFoodRow(item) {
        const title = item.nameAr || item.nameEn || itemName(item);
        return `<tr><td><div class="library-table-primary"><span class="library-table-icon">🥗</span><div><strong title="${escapeHtml(title)}">${escapeHtml(title)}</strong><small>${escapeHtml(item.nameEn || '')}</small></div></div></td><td>${item.category ? `<span class="library-table-badge foods">${escapeHtml(item.category)}</span>` : '—'}</td><td><strong>${formatNumber(item.calories, 1)}</strong><small>سعرة</small></td><td><strong>${formatNumber(item.protein, 1)} g</strong><small>بروتين</small></td><td><strong>${formatNumber(item.carbs, 1)} g</strong><small>كارب</small></td><td><strong>${formatNumber(item.fat, 1)} g</strong><small>دهون</small></td><td>${formatNumber(item.servingSize, 1)} ${escapeHtml(item.servingUnit || '')}</td><td>${tableActions(item.id)}</td></tr>`;
    }

    function renderExerciseRow(item) {
        const title = item.nameAr || item.name || itemName(item);
        const target = item.targetMuscleNameAr || item.targetMuscleName || 'غير محددة';
        return `<tr><td><div class="library-table-primary"><span class="library-table-icon">${escapeHtml(item.icon || '🏋️')}</span><div><strong title="${escapeHtml(title)}">${escapeHtml(title)}</strong><small>${escapeHtml(item.name || '')}</small></div></div></td><td><span class="library-table-badge exercises">${escapeHtml(target)}</span></td><td>${item.difficulty ? escapeHtml(item.difficulty) : '—'}</td><td>${item.equipment ? escapeHtml(item.equipment) : '—'}</td><td>${item.category ? escapeHtml(item.category) : '—'}</td><td>${item.isHighImpact ? '<span class="library-table-badge warning">مجهود مرتفع</span>' : '—'}</td><td>${tableActions(item.id)}</td></tr>`;
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
            state.options = await requestJson('/api/library/options');
            renderSummary();
            renderFilters();
        } catch (error) {
            showMessage(error.message, 'error');
        }
    }

    async function loadCollection() {
        if (!state.opened) return;
        if (state.abortController) state.abortController.abort();
        state.abortController = new AbortController();
        const requestId = ++state.requestId;
        const filters = state.filters[state.activeType];
        const params = new URLSearchParams({ page: String(state.page), pageSize: String(state.pageSize), search: state.search });
        Object.entries(filters).forEach(([key, value]) => { if (value) params.set(key, value); });
        const list = $('libraryList');
        if (list) list.innerHTML = '<div class="loading">جاري تحميل بيانات المكتبة...</div>';
        try {
            const response = await requestJson(`/api/library/${state.activeType}?${params}`, { signal: state.abortController.signal });
            if (requestId !== state.requestId) return;
            state.items = response.items || [];
            state.pagination = response.pagination || null;
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
        const secondary = safeArray(item.secondaryMuscles).map((entry) => `${entry.muscleId}, ${entry.contributionPercent}`).join('\n');
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
            const contributionPercent = Number(parts[1] || 0);
            if (!Number.isInteger(muscleId) || muscleId < 1 || !Number.isFinite(contributionPercent)) throw new Error('صيغة العضلات الثانوية: رقم العضلة، النسبة.');
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

    function detailItem(label, value, full = false) {
        return `<div class="library-detail-item${full ? ' full' : ''}"><span>${label}</span><strong>${escapeHtml(value || '—')}</strong></div>`;
    }

    function detailList(label, values) {
        const list = safeArray(values);
        return `<div class="library-detail-item full"><span>${label}</span>${list.length ? `<ol class="library-detail-list">${list.map((value) => `<li>${escapeHtml(value)}</li>`).join('')}</ol>` : '<strong>لا توجد بيانات</strong>'}</div>`;
    }

    function showDetails(item) {
        const type = state.activeType;
        const content = $('libraryDetailsContent');
        if (!content) return;
        $('libraryDetailsTitle').textContent = `تفاصيل ${META[type].singular}`;
        $('libraryDetailsSubtitle').textContent = `${itemName(item)} · رقم ${item.id}`;
        if (type === 'muscles') {
            content.innerHTML = `<div class="library-detail-hero"><span class="library-detail-hero-icon">${escapeHtml(item.icon || '💪')}</span><div><h4>${escapeHtml(itemName(item))}</h4><p>${escapeHtml(item.name || '')}</p></div></div><div class="library-detail-grid">${detailItem('منطقة الجسم', item.bodyPart)}${detailItem('المعرّف المصدر', item.sourceId)}${detailItem('الوصف بالعربية', item.descriptionAr, true)}${detailItem('الوصف بالإنجليزية', item.description, true)}</div>`;
        } else if (type === 'foods') {
            content.innerHTML = `<div class="library-detail-hero"><span class="library-detail-hero-icon">🥗</span><div><h4>${escapeHtml(itemName(item))}</h4><p>${escapeHtml(item.nameEn || '')}</p></div></div><div class="library-detail-grid">${detailItem('التصنيف', item.category)}${detailItem('الحصة', `${formatNumber(item.servingSize, 1)} ${item.servingUnit || ''}`)}${detailItem('السعرات', formatNumber(item.calories, 1))}${detailItem('البروتين', `${formatNumber(item.protein, 1)} g`)}${detailItem('الكربوهيدرات', `${formatNumber(item.carbs, 1)} g`)}${detailItem('الدهون', `${formatNumber(item.fat, 1)} g`)}${detailItem('الألياف', `${formatNumber(item.fiber, 1)} g`)}${detailItem('السكريات', `${formatNumber(item.sugar, 1)} g`)}${detailItem('الصوديوم', `${formatNumber(item.sodium, 1)} mg`)}</div>`;
        } else {
            const target = item.targetMuscleNameAr || item.targetMuscleName || 'غير محددة';
            const secondary = safeArray(item.secondaryMuscles).map((entry) => `العضلة ${entry.muscleId} — ${entry.contributionPercent}%`);
            content.innerHTML = `<div class="library-detail-hero"><span class="library-detail-hero-icon">${escapeHtml(item.icon || '🏋️')}</span><div><h4>${escapeHtml(itemName(item))}</h4><p>${escapeHtml(item.name || '')}</p></div></div><div class="library-detail-grid">${detailItem('العضلة المستهدفة', target)}${detailItem('المستوى', item.difficulty)}${detailItem('التصنيف', item.category)}${detailItem('الأداة', item.equipment)}${detailItem('نمط الحركة', item.movementPattern)}${detailItem('الميكانيكية', item.mechanic)}${detailItem('نوع القوة', item.force)}${detailItem('مدى التكرارات', item.repsRange)}${detailItem('مدى المجموعات', item.setsRange)}${detailItem('الراحة', item.restSeconds == null ? '—' : `${item.restSeconds} ثانية`)}${detailItem('التمرين عالي المجهود', item.isHighImpact ? 'نعم' : 'لا')}${detailItem('رابط الفيديو', item.videoUrl, true)}${detailItem('الوصف بالعربية', item.descriptionAr, true)}${detailItem('الوصف بالإنجليزية', item.description, true)}${detailList('العضلات الثانوية', secondary)}${detailList('التعليمات بالعربية', item.instructionsAr)}${detailList('التعليمات بالإنجليزية', item.instructions)}${detailList('النصائح بالعربية', item.tipsAr)}${detailList('النصائح بالإنجليزية', item.tips)}${detailList('الأخطاء الشائعة بالعربية', item.commonMistakesAr)}${detailList('الأخطاء الشائعة بالإنجليزية', item.commonMistakes)}</div>`;
        }
        openDialog($('libraryDetailsDialog'));
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
            await loadCollection();
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
            await loadCollection();
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
        if (button.dataset.libraryAction === 'details') showDetails(item);
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

    document.addEventListener('DOMContentLoaded', () => {
        document.querySelectorAll('[data-library-type]').forEach((button) => button.addEventListener('click', () => changeType(button.dataset.libraryType)));
        $('libraryAddButton')?.addEventListener('click', () => openForm());
        $('libraryRefreshButton')?.addEventListener('click', () => { loadOptions(true); loadCollection(); });
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
    });
})();
