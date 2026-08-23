(() => {
  'use strict';

  if (window.topGymMemberPortalLibrary) return;
  const mount = document.getElementById('portalLibraryMount');
  if (!mount) return;

  const state = {
    activeType: 'exercises',
    options: null,
    items: [],
    pagination: null,
    page: 1,
    search: '',
    category: '',
    difficulty: '',
    equipment: '',
    requestId: 0,
    abortController: null,
    searchTimer: null,
    detailsRequestId: 0
  };

  const labels = {
    difficulty: { beginner: 'مبتدئ', intermediate: 'متوسط', advanced: 'متقدم', expert: 'خبير' },
    equipment: { 'body only': 'وزن الجسم', dumbbell: 'دامبل', barbell: 'بار', cable: 'كابل', machine: 'جهاز', bands: 'أشرطة مقاومة', kettlebell: 'كيتل بيل', 'medicine ball': 'كرة طبية', other: 'أخرى' },
    category: { strength: 'قوة', stretching: 'إطالة', cardio: 'كارديو', plyometrics: 'بليومتري', powerlifting: 'باور ليفتنج', strongman: 'سترونج مان' }
  };

  const $ = (id) => document.getElementById(id);
  const escapeHtml = (value) => String(value ?? '').replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[character]));
  const number = (value, digits = 0) => Number.isFinite(Number(value)) ? Number(value).toLocaleString('ar-EG', { maximumFractionDigits: digits }) : '—';
  const safeArray = (value) => Array.isArray(value) ? value.filter(Boolean) : [];
  const textValue = (...values) => values.find((value) => value !== undefined && value !== null && String(value).trim()) ?? '';
  const nameOf = (item) => textValue(item?.nameAr, item?.name, item?.nameEn) || 'بدون اسم';
  const englishName = (item) => textValue(item?.name, item?.nameEn);
  const translate = (value, type) => labels[type]?.[String(value || '').toLowerCase()] || value || 'غير محدد';

  function requestJson(url, options = {}) {
    return fetch(url, { ...options, headers: { Accept: 'application/json', ...(options.headers || {}) } }).then(async (response) => {
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'تعذر تحميل البيانات.');
      return payload;
    });
  }

  function imageMarkup(item, phase = 'start', className = '') {
    const source = item?.imageAssets?.[phase] || item?.imageAssets?.main;
    if (!source) return `<span class="portal-library-image-fallback" aria-hidden="true">${escapeHtml(item?.icon || '🏋️')}</span>`;
    return `<img class="${className}" src="${escapeHtml(source)}" alt="${escapeHtml(nameOf(item))}" loading="lazy" width="720" height="480" data-portal-library-image>`;
  }


  function renderExerciseCard(item) {
    const title = nameOf(item);
    const tags = [item.targetMuscleNameAr, translate(item.difficulty, 'difficulty'), item.equipment ? translate(item.equipment, 'equipment') : null].filter(Boolean);
    return `<article class="portal-exercise-card"><div class="portal-exercise-media">${imageMarkup(item)}<span class="portal-exercise-phase">وضع البداية</span></div><div class="portal-exercise-body"><div class="portal-exercise-title"><div><h5>${escapeHtml(title)}</h5><small dir="ltr">${escapeHtml(englishName(item))}</small></div><span class="portal-exercise-icon">${escapeHtml(item.icon || '🏋️')}</span></div><div class="portal-exercise-tags">${tags.map((tag) => `<span>${escapeHtml(tag)}</span>`).join('')}</div><div class="portal-exercise-meta"><span>${item.setsRange ? `مجموعات ${escapeHtml(item.setsRange)}` : 'مجموعات —'}</span><span>${item.repsRange ? `تكرارات ${escapeHtml(item.repsRange)}` : 'تكرارات —'}</span></div><button class="btn btn-light portal-library-details-button" type="button" data-library-details="exercises" data-library-id="${item.id}">عرض التفاصيل</button></div></article>`;
  }

  function renderFoodCard(item) {
    const title = nameOf(item);
    return `<article class="portal-food-card"><div class="portal-food-symbol" aria-hidden="true">🥗</div><div class="portal-food-title"><div><h5>${escapeHtml(title)}</h5><small dir="ltr">${escapeHtml(englishName(item))}</small></div><span>${escapeHtml(item.category || 'طعام')}</span></div><div class="portal-food-calories"><strong>${number(item.calories, 1)}</strong><span>سعرة لكل ${number(item.servingSize, 1)} ${escapeHtml(item.servingUnit || 'جرام')}</span></div><div class="portal-macro-grid"><span><b>${number(item.protein, 1)}</b><small>بروتين</small></span><span><b>${number(item.carbs, 1)}</b><small>كارب</small></span><span><b>${number(item.fat, 1)}</b><small>دهون</small></span></div><button class="btn btn-light portal-library-details-button" type="button" data-library-details="foods" data-library-id="${item.id}">التفاصيل الغذائية</button></article>`;
  }

  function renderPagination() {
    if (!state.pagination || state.pagination.totalPages <= 1) return '';
    return `<div class="portal-library-pagination"><span>صفحة ${number(state.pagination.page)} من ${number(state.pagination.totalPages)}</span><div><button type="button" class="btn btn-light" data-library-page="prev" ${state.pagination.page <= 1 ? 'disabled' : ''}>السابق</button><button type="button" class="btn btn-light" data-library-page="next" ${state.pagination.page >= state.pagination.totalPages ? 'disabled' : ''}>التالي</button></div></div>`;
  }

  function renderLibraryShell() {
    const isFoods = state.activeType === 'foods';
    const title = isFoods ? 'دليل التغذية' : 'دليل التمارين';
    const description = isFoods
      ? 'ابحث عن الطعام وتعرّف على السعرات والماكروز لكل حصة.'
      : 'ابحث عن التمرين بالاسم وحدد المستوى والأداة المناسبة.';
    mount.innerHTML = `<div class="portal-library-head" data-library-type="${state.activeType}"><div><span class="portal-library-kicker">TOP GYM MEMBER HUB</span><h3 id="portalLibraryTitle">${title}</h3><p>${description}</p></div><button type="button" class="btn btn-light" data-library-close>العودة للخدمات</button></div><div id="portalLibraryContent"></div><div class="portal-library-modal" id="portalLibraryModal" role="dialog" aria-modal="true" aria-labelledby="portalLibraryModalTitle" hidden><div class="portal-library-modal-card"><header><div><span class="portal-library-kicker">TOP GYM GUIDE</span><h3 id="portalLibraryModalTitle">التفاصيل</h3></div><button type="button" class="portal-library-modal-close" data-library-modal-close aria-label="إغلاق">×</button></header><div id="portalLibraryModalContent"></div></div></div>`;
  }

  function renderFilters() {
    const filters = state.options?.filters || {};
    return `<div class="portal-library-filter-bar"><label><span>بحث سريع</span><input id="portalLibrarySearch" type="search" value="${escapeHtml(state.search)}" placeholder="ابحث باسم التمرين أو الطعام..." autocomplete="off"></label>${state.activeType === 'foods' ? `<label><span>التصنيف</span><select id="portalFoodCategory"><option value="">كل التصنيفات</option>${(filters.categories || []).map((item) => `<option value="${escapeHtml(item)}"${item === state.category ? ' selected' : ''}>${escapeHtml(item)}</option>`).join('')}</select></label>` : `<label><span>المستوى</span><select id="portalExerciseDifficulty"><option value="">كل المستويات</option>${(filters.difficulties || []).map((item) => `<option value="${escapeHtml(item)}"${item === state.difficulty ? ' selected' : ''}>${escapeHtml(translate(item, 'difficulty'))}</option>`).join('')}</select></label><label><span>الأداة</span><select id="portalExerciseEquipment"><option value="">كل الأدوات</option>${(filters.equipment || []).map((item) => `<option value="${escapeHtml(item)}"${item === state.equipment ? ' selected' : ''}>${escapeHtml(translate(item, 'equipment'))}</option>`).join('')}</select></label>`}</div>`;
  }

  function renderCurrent() {
    const content = $('portalLibraryContent');
    if (!content) return;
    if (state.activeType === 'exercises') {
      content.innerHTML = `<div class="portal-exercise-results">${renderFilters()}<div class="portal-library-results-head"><div><h4>التمارين المتاحة</h4><span>${state.pagination ? `${number(state.pagination.totalItems)} نتيجة` : 'استخدم البحث أو الفلاتر للوصول إلى التمرين المطلوب'}</span></div></div><div class="portal-exercise-grid">${state.items.length ? state.items.map(renderExerciseCard).join('') : `<div class="portal-library-state portal-library-state-wide"><strong>${state.search || state.difficulty || state.equipment ? 'لا توجد تمارين مطابقة' : 'لا توجد تمارين متاحة'}</strong><span>جرّب اسمًا مختلفًا أو غيّر أحد الفلاتر.</span></div>`}</div>${renderPagination()}</div>`;
    } else {
      content.innerHTML = `<div class="portal-food-explorer">${renderFilters()}<div class="portal-library-results-head"><div><h4>الأطعمة والقيم الغذائية</h4><span>${state.pagination ? `${number(state.pagination.totalItems)} طعام متاح` : 'ابحث عن طعام لمعرفة تفاصيله'}</span></div></div><div class="portal-food-grid">${state.items.length ? state.items.map(renderFoodCard).join('') : `<div class="portal-library-state portal-library-state-wide"><strong>${state.search ? 'لا توجد أطعمة مطابقة' : 'اكتب اسم الطعام للبدء'}</strong><span>ستظهر السعرات والماكروز لكل حصة.</span></div>`}</div>${renderPagination()}</div>`;
    }
    bindDynamicControls();
  }

  async function loadOptions() {
    if (state.options) return state.options;
    state.options = await requestJson('/api/member-portal/library/options');
    return state.options;
  }

  async function loadCollection() {
    await loadOptions();
    if (state.abortController) state.abortController.abort();
    const controller = new AbortController();
    state.abortController = controller;
    const requestId = ++state.requestId;
    const params = new URLSearchParams({ page: String(state.page), pageSize: '18', search: state.search });
    if (state.activeType === 'foods') {
      if (state.category) params.set('category', state.category);
    } else {
      if (state.difficulty) params.set('difficulty', state.difficulty);
      if (state.equipment) params.set('equipment', state.equipment);
    }
    const content = $('portalLibraryContent');
    content?.classList.add('is-loading');
    try {
      const result = await requestJson(`/api/member-portal/library/${state.activeType}?${params}`, { signal: controller.signal });
      if (requestId !== state.requestId) return;
      state.items = result.items || [];
      state.pagination = result.pagination || null;
      renderCurrent();
    } catch (error) {
      if (error.name === 'AbortError') return;
      if (content) content.innerHTML = `<div class="portal-library-state portal-library-error"><strong>تعذر تحميل الدليل</strong><span>${escapeHtml(error.message || 'حاول مرة أخرى.')}</span><button type="button" class="btn btn-light" data-library-retry>إعادة المحاولة</button></div>`;
    } finally {
      content?.classList.remove('is-loading');
    }
  }

  async function showDetails(type, id) {
    const modal = $('portalLibraryModal');
    const content = $('portalLibraryModalContent');
    if (!modal || !content) return;
    const requestId = ++state.detailsRequestId;
    modal.hidden = false;
    content.innerHTML = '<div class="portal-library-state"><span class="portal-library-loader"></span><strong>جاري تجهيز التفاصيل...</strong></div>';
    try {
      const result = await requestJson(`/api/member-portal/library/${type}/${encodeURIComponent(id)}`);
      if (requestId !== state.detailsRequestId) return;
      const item = result.item || {};
      $('portalLibraryModalTitle').textContent = type === 'foods' ? nameOf(item) : nameOf(item);
      content.innerHTML = type === 'foods' ? renderFoodDetails(item) : renderExerciseDetails(item);
    } catch (error) {
      if (requestId !== state.detailsRequestId) return;
      content.innerHTML = `<div class="portal-library-state portal-library-error"><strong>تعذر تحميل التفاصيل</strong><span>${escapeHtml(error.message || 'حاول مرة أخرى.')}</span></div>`;
    }
  }

  function listBlock(title, values, fallback) {
    const list = safeArray(values);
    return `<section class="portal-detail-block"><h4>${escapeHtml(title)}</h4>${list.length ? `<ul>${list.map((value) => `<li>${escapeHtml(typeof value === 'object' ? textValue(value.text, value.value, value.instruction, value.description) : value)}</li>`).join('')}</ul>` : `<p class="portal-detail-muted">${escapeHtml(fallback)}</p>`}</section>`;
  }

  function renderExerciseDetails(item) {
    const images = item.imageAssets || {};
    return `<div class="portal-detail-hero"><div class="portal-detail-gallery">${imageMarkup({ ...item, imageAssets: images }, 'start', 'portal-detail-image')}${images.end ? imageMarkup({ ...item, imageAssets: images }, 'end', 'portal-detail-image') : ''}</div><div><span class="portal-library-kicker">EXERCISE GUIDE</span><h4>${escapeHtml(nameOf(item))}</h4><p dir="ltr">${escapeHtml(englishName(item))}</p><div class="portal-detail-tags"><span>${escapeHtml(item.targetMuscleNameAr || 'عضلة غير محددة')}</span><span>${escapeHtml(translate(item.difficulty, 'difficulty'))}</span><span>${escapeHtml(translate(item.equipment, 'equipment'))}</span></div></div></div><div class="portal-detail-stat-grid"><span><b>${escapeHtml(item.setsRange || '—')}</b><small>المجموعات</small></span><span><b>${escapeHtml(item.repsRange || '—')}</b><small>التكرارات</small></span><span><b>${item.restSeconds == null ? '—' : number(item.restSeconds)} ث</b><small>الراحة</small></span><span><b>${escapeHtml(item.tempo || '—')}</b><small>الإيقاع</small></span></div><div class="portal-detail-copy">${item.descriptionAr ? `<p>${escapeHtml(item.descriptionAr)}</p>` : ''}${listBlock('طريقة الأداء', item.instructionsAr, 'التعليمات العربية غير متاحة لهذا التمرين.')}${listBlock('نصائح مهمة', item.tipsAr, 'لا توجد نصائح إضافية مسجلة.')}${listBlock('أخطاء شائعة', item.commonMistakesAr, 'لا توجد أخطاء شائعة مسجلة.')}</div>`;
  }

  function renderFoodDetails(item) {
    const nutrients = [['السعرات', `${number(item.calories, 1)} سعرة`], ['البروتين', `${number(item.protein, 1)} جرام`], ['الكربوهيدرات', `${number(item.carbs, 1)} جرام`], ['الدهون', `${number(item.fat, 1)} جرام`], ['الألياف', `${number(item.fiber, 1)} جرام`], ['السكريات', `${number(item.sugar, 1)} جرام`], ['الصوديوم', `${number(item.sodium, 1)} ملجم`]];
    return `<div class="portal-food-detail-hero"><span class="portal-food-detail-icon">🥗</span><div><span class="portal-library-kicker">NUTRITION GUIDE</span><h4>${escapeHtml(nameOf(item))}</h4><p dir="ltr">${escapeHtml(englishName(item))}</p><span>${escapeHtml(item.category || 'طعام')} · لكل ${number(item.servingSize, 1)} ${escapeHtml(item.servingUnit || 'جرام')}</span></div></div><div class="portal-food-detail-grid">${nutrients.map(([label, value]) => `<div><span>${escapeHtml(label)}</span><strong dir="auto">${escapeHtml(value)}</strong></div>`).join('')}</div>`;
  }

  function bindDynamicControls() {
    $('portalLibrarySearch')?.addEventListener('input', (event) => {
      state.search = event.target.value.trim();
      state.page = 1;
      clearTimeout(state.searchTimer);
      state.searchTimer = setTimeout(() => void loadCollection(), 320);
    });
    $('portalFoodCategory')?.addEventListener('change', (event) => { state.category = event.target.value; state.page = 1; void loadCollection(); });
    $('portalExerciseDifficulty')?.addEventListener('change', (event) => { state.difficulty = event.target.value; state.page = 1; void loadCollection(); });
    $('portalExerciseEquipment')?.addEventListener('change', (event) => { state.equipment = event.target.value; state.page = 1; void loadCollection(); });
  }

  mount.addEventListener('click', (event) => {
    if (event.target.closest('[data-library-close]')) {
      window.dispatchEvent(new CustomEvent('topgym:portal-library-close'));
      return;
    }
    const details = event.target.closest('[data-library-details]');
    if (details) { void showDetails(details.dataset.libraryDetails, details.dataset.libraryId); return; }
    if (event.target.closest('[data-library-modal-close]') || event.target === $('portalLibraryModal')) { $('portalLibraryModal').hidden = true; return; }
    const page = event.target.closest('[data-library-page]');
    if (page) { state.page += page.dataset.libraryPage === 'next' ? 1 : -1; void loadCollection(); return; }
    if (event.target.closest('[data-library-retry]')) void loadCollection();
  });

  async function open(type = 'exercises') {
    state.activeType = type === 'foods' ? 'foods' : 'exercises';
    state.abortController?.abort?.();
    clearTimeout(state.searchTimer);
    state.page = 1;
    state.items = [];
    state.pagination = null;
    state.search = '';
    state.category = '';
    state.difficulty = '';
    state.equipment = '';
    state.detailsRequestId += 1;
    renderLibraryShell();
    renderCurrent();
    try { await loadOptions(); renderCurrent(); await loadCollection(); } catch (error) {
      mount.innerHTML = `<div class="portal-library-state portal-library-error"><strong>تعذر تجهيز الدليل</strong><span>${escapeHtml(error.message || 'حاول مرة أخرى.')}</span></div>`;
    }
  }

  function close() { state.abortController?.abort?.(); clearTimeout(state.searchTimer); mount.innerHTML = ''; }

  window.topGymMemberPortalLibrary = { open, close };
})();
