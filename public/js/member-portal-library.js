(() => {
  'use strict';

  if (window.topGymMemberPortalLibrary) return;
  const mount = document.getElementById('portalLibraryMount');
  if (!mount) return;

  const state = {
    activeType: 'exercises',
    zone: 'all',
    selectedMuscleId: '',
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
    detailsRequestId: 0,
    anatomyLoaderPromise: null,
    anatomyViewer: null,
    anatomyStatus: 'idle'
  };

  const ZONES = [
    { key: 'all', label: 'كل الجسم', icon: '✦' },
    { key: 'chest', label: 'الصدر', icon: '◈', keywords: ['صدر', 'chest', 'pectoral'] },
    { key: 'back', label: 'الظهر', icon: '◇', keywords: ['ظهر', 'back', 'lats', 'rhomboid', 'traps', 'ترابيس', 'مجنص'] },
    { key: 'shoulders', label: 'الأكتاف', icon: '◌', keywords: ['كتف', 'shoulder', 'deltoid', 'أكتاف'] },
    { key: 'arms', label: 'الذراعان', icon: '◍', bodyParts: ['Arms'] },
    { key: 'core', label: 'البطن والجذع', icon: '◎', bodyParts: ['Core'] },
    { key: 'legs', label: 'الأرجل', icon: '◒', bodyParts: ['Lower Body'], keywords: ['فخذ', 'ساق', 'مؤخرة', 'glute', 'quad', 'hamstring', 'calf', 'thigh', 'leg'] }
  ];

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
  const normalize = (value) => String(value || '').normalize('NFKD').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
  const bodyPartLabel = (value) => ({ 'Upper Body': 'الجزء العلوي', Arms: 'الذراعان', Core: 'الجذع', 'Lower Body': 'الجزء السفلي' }[value] || value || '');

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

  function currentZone() { return ZONES.find((zone) => zone.key === state.zone) || ZONES[0]; }

  function musclesForZone() {
    const muscles = state.options?.filters?.muscles || [];
    const zone = currentZone();
    if (zone.key === 'all') return muscles;
    return muscles.filter((muscle) => {
      const broadMatch = zone.bodyParts?.includes(muscle.bodyPart);
      const name = normalize(`${muscle.nameAr || ''} ${muscle.name || ''}`);
      const keywordMatch = (zone.keywords || []).some((keyword) => name.includes(normalize(keyword)));
      return broadMatch || keywordMatch;
    });
  }

  function renderAnatomy() {
    const zone = currentZone();
    const hotspots = [
      ['chest', 50, 27], ['back', 50, 27], ['shoulders', 35, 28], ['shoulders', 65, 28],
      ['arms', 27, 40], ['arms', 73, 40], ['core', 50, 40], ['legs', 43, 68], ['legs', 57, 68]
    ];
    return `<div class="portal-anatomy-card">
      <div class="portal-anatomy-head"><div><span class="portal-library-kicker">ANATOMY EXPLORER</span><h4>اختر منطقة الجسم</h4><p>اضغط على المنطقة للوصول إلى العضلات والتمارين المرتبطة بها.</p></div><span class="portal-anatomy-selected">${escapeHtml(zone.label)}</span></div>
      <div class="portal-anatomy-3d-shell" id="portalAnatomy3DMount" aria-label="عارض Anatomy ثلاثي الأبعاد"><div class="portal-anatomy-3d-stage" id="portalAnatomy3DStage"><div class="portal-anatomy-3d-placeholder"><span class="portal-anatomy-3d-badge">3D</span><strong>Premium Anatomy Viewer</strong><span>جاري تجهيز العارض التشريحي التفاعلي...</span></div></div><div class="portal-anatomy-3d-controls"><button type="button" data-anatomy-preset="front">أمام</button><button type="button" data-anatomy-preset="back">خلف</button><button type="button" data-anatomy-preset="left">يسار</button><button type="button" data-anatomy-preset="right">يمين</button><button type="button" data-anatomy-preset="reset">إعادة</button></div></div>
      <div class="portal-anatomy-view portal-anatomy-fallback-view" aria-label="خريطة تشريحية تفاعلية">
        <div class="portal-anatomy-glow"></div>
        <svg class="portal-anatomy-silhouette" viewBox="0 0 300 620" role="img" aria-label="مجسم تشريحي مبسط">
          <defs><linearGradient id="portalBodyGradient" x1="0" x2="1"><stop offset="0" stop-color="#b8c9e3"/><stop offset=".5" stop-color="#eef5ff"/><stop offset="1" stop-color="#91a8ca"/></linearGradient></defs>
          <circle cx="150" cy="48" r="30" fill="url(#portalBodyGradient)"/>
          <path d="M129 83c-10 12-16 28-17 51l-8 42 20 8 8-29v112l-21 119 24 5 15-82 15 82 24-5-21-119V155l8 29 20-8-8-42c-1-23-7-39-17-51l-22 10z" fill="url(#portalBodyGradient)"/>
          <path d="M108 92 70 124 39 207l19 8 39-64 22-25M192 92l38 32 31 83-19 8-39-64-22-25" fill="none" stroke="#a8bbd8" stroke-width="18" stroke-linecap="round" stroke-linejoin="round"/>
          <path d="m127 354-27 116 18 4 32-113m-5-7 27 116-18 4-32-113" fill="none" stroke="#a8bbd8" stroke-width="23" stroke-linecap="round"/>
          <path d="m111 473-13 114m91-114 13 114" fill="none" stroke="#9aafd0" stroke-width="17" stroke-linecap="round"/>
          <path d="M120 164c20 12 40 12 60 0M124 226c17 8 35 8 52 0M126 258c16 7 32 7 48 0" fill="none" stroke="#7f98bd" stroke-width="3" opacity=".55"/>
        </svg>
        ${hotspots.map(([key, left, top], index) => `<button class="portal-anatomy-hotspot${state.zone === key ? ' is-active' : ''}" style="--hotspot-left:${left}%;--hotspot-top:${top}%" type="button" data-anatomy-zone="${key}" aria-label="${escapeHtml(ZONES.find((item) => item.key === key)?.label || 'منطقة الجسم')}"><span>${index + 1}</span></button>`).join('')}
      </div>
      <div class="portal-anatomy-zone-list">${ZONES.map((item) => `<button type="button" class="portal-anatomy-zone${state.zone === item.key ? ' is-active' : ''}" data-anatomy-zone="${item.key}"><span>${item.icon}</span>${escapeHtml(item.label)}</button>`).join('')}</div>
    </div>`;
  }

  function renderMusclePicker() {
    const muscles = musclesForZone();
    if (!muscles.length) return '<div class="portal-library-state"><strong>لا توجد عضلات مرتبطة بهذه المنطقة.</strong><span>اختر منطقة أخرى للمتابعة.</span></div>';
    return `<div class="portal-muscle-picker"><div class="portal-library-subhead"><div><strong>اختر العضلة المستهدفة</strong><span>${number(muscles.length)} عضلة متاحة</span></div><span class="portal-library-selection">${state.selectedMuscleId ? 'تم اختيار عضلة' : 'لم يتم الاختيار بعد'}</span></div><div class="portal-muscle-chips">${muscles.slice(0, 48).map((muscle) => `<button type="button" class="portal-muscle-chip${String(state.selectedMuscleId) === String(muscle.id) ? ' is-active' : ''}" data-muscle-id="${muscle.id}"><span>${escapeHtml(muscle.nameAr || muscle.name)}</span><small>${escapeHtml(muscle.name || '')}</small></button>`).join('')}</div></div>`;
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
    mount.innerHTML = `<div class="portal-library-head"><div><span class="portal-library-kicker">TOP GYM MEMBER HUB</span><h3 id="portalLibraryTitle">دليل التمارين والتغذية</h3><p>اكتشف التمرين المناسب لجسمك وتعرّف على القيمة الغذائية للأطعمة.</p></div><button type="button" class="btn btn-light" data-library-close>إخفاء الدليل</button></div><div class="portal-library-tabs" role="tablist" aria-label="دليل العضو"><button type="button" role="tab" data-library-tab="exercises">التمارين</button><button type="button" role="tab" data-library-tab="foods">التغذية</button></div><div id="portalLibraryContent"></div><div class="portal-library-modal" id="portalLibraryModal" role="dialog" aria-modal="true" aria-labelledby="portalLibraryModalTitle" hidden><div class="portal-library-modal-card"><header><div><span class="portal-library-kicker">TOP GYM GUIDE</span><h3 id="portalLibraryModalTitle">التفاصيل</h3></div><button type="button" class="portal-library-modal-close" data-library-modal-close aria-label="إغلاق">×</button></header><div id="portalLibraryModalContent"></div></div></div>`;
  }

  function renderFilters() {
    const filters = state.options?.filters || {};
    return `<div class="portal-library-filter-bar"><label><span>بحث سريع</span><input id="portalLibrarySearch" type="search" value="${escapeHtml(state.search)}" placeholder="ابحث باسم التمرين أو الطعام..." autocomplete="off"></label>${state.activeType === 'foods' ? `<label><span>التصنيف</span><select id="portalFoodCategory"><option value="">كل التصنيفات</option>${(filters.categories || []).map((item) => `<option value="${escapeHtml(item)}"${item === state.category ? ' selected' : ''}>${escapeHtml(item)}</option>`).join('')}</select></label>` : `<label><span>المستوى</span><select id="portalExerciseDifficulty"><option value="">كل المستويات</option>${(filters.difficulties || []).map((item) => `<option value="${escapeHtml(item)}"${item === state.difficulty ? ' selected' : ''}>${escapeHtml(translate(item, 'difficulty'))}</option>`).join('')}</select></label><label><span>الأداة</span><select id="portalExerciseEquipment"><option value="">كل الأدوات</option>${(filters.equipment || []).map((item) => `<option value="${escapeHtml(item)}"${item === state.equipment ? ' selected' : ''}>${escapeHtml(translate(item, 'equipment'))}</option>`).join('')}</select></label>`}</div>`;
  }

  function renderCurrent() {
    if (state.anatomyViewer) {
      state.anatomyViewer.dispose?.();
      state.anatomyViewer = null;
      state.anatomyStatus = 'idle';
    }
    const content = $('portalLibraryContent');
    if (!content) return;
    document.querySelectorAll('[data-library-tab]').forEach((button) => {
      const active = button.dataset.libraryTab === state.activeType;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-selected', String(active));
    });
    if (state.activeType === 'exercises') {
      content.innerHTML = `<div class="portal-exercise-explorer"><div class="portal-explorer-grid"><aside>${renderAnatomy()}</aside><div class="portal-exercise-results">${renderFilters()}${renderMusclePicker()}<div class="portal-library-results-head"><div><h4>${state.selectedMuscleId ? 'تمارين العضلة المختارة' : 'كل التمارين'}</h4><span>${state.pagination ? `${number(state.pagination.totalItems)} نتيجة` : 'اختر منطقة أو ابحث عن تمرين'}</span></div></div><div class="portal-exercise-grid">${state.items.length ? state.items.map(renderExerciseCard).join('') : `<div class="portal-library-state portal-library-state-wide"><strong>${state.selectedMuscleId || state.search ? 'لا توجد تمارين مطابقة' : 'ابدأ باختيار عضلة أو اكتب اسم تمرين'}</strong><span>ستظهر النتائج هنا مع صور التمرينات وتعليماتها.</span></div>`}</div>${renderPagination()}</div></div></div>`;
    } else {
      content.innerHTML = `<div class="portal-food-explorer">${renderFilters()}<div class="portal-library-results-head"><div><h4>الأطعمة والقيم الغذائية</h4><span>${state.pagination ? `${number(state.pagination.totalItems)} طعام متاح` : 'ابحث عن طعام لمعرفة تفاصيله'}</span></div></div><div class="portal-food-grid">${state.items.length ? state.items.map(renderFoodCard).join('') : `<div class="portal-library-state portal-library-state-wide"><strong>${state.search ? 'لا توجد أطعمة مطابقة' : 'اكتب اسم الطعام للبدء'}</strong><span>ستظهر السعرات والماكروز لكل حصة.</span></div>`}</div>${renderPagination()}</div>`;
    }
    bindDynamicControls();
  }

  function renderExerciseResults() {
    const results = document.querySelector('.portal-exercise-results');
    if (!results || state.activeType !== 'exercises') return;
    results.innerHTML = `${renderFilters()}${renderMusclePicker()}<div class="portal-library-results-head"><div><h4>${state.selectedMuscleId ? 'تمارين العضلة المختارة' : 'كل التمارين'}</h4><span>${state.pagination ? `${number(state.pagination.totalItems)} نتيجة` : 'اختر منطقة أو ابحث عن تمرين'}</span></div></div><div class="portal-exercise-grid">${state.items.length ? state.items.map(renderExerciseCard).join('') : `<div class="portal-library-state portal-library-state-wide"><strong>${state.selectedMuscleId || state.search ? 'لا توجد تمارين مطابقة' : 'ابدأ باختيار عضلة أو اكتب اسم تمرين'}</strong><span>ستظهر النتائج هنا مع صور التمرينات وتعليماتها.</span></div>`}</div>${renderPagination()}`;
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
      if (state.selectedMuscleId) params.set('targetMuscleId', state.selectedMuscleId);
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
      if (state.activeType === 'exercises' && document.querySelector('.portal-exercise-results')) renderExerciseResults();
      else renderCurrent();
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
    const preset = event.target.closest('[data-anatomy-preset]');
    if (preset && state.anatomyViewer) {
      const view = preset.dataset.anatomyPreset;
      if (view === 'reset') state.anatomyViewer.reset?.();
      else state.anatomyViewer.preset?.(view);
      return;
    }
    const tab = event.target.closest('[data-library-tab]');
    if (tab) { state.activeType = tab.dataset.libraryTab; state.page = 1; state.items = []; state.pagination = null; renderCurrent(); void loadCollection(); return; }
    const zone = event.target.closest('[data-anatomy-zone]');
    if (zone) { state.zone = zone.dataset.anatomyZone; state.selectedMuscleId = ''; state.page = 1; state.items = []; state.pagination = null; renderCurrent(); void mountPremiumAnatomy(); return; }
    const muscle = event.target.closest('[data-muscle-id]');
    if (muscle) { state.selectedMuscleId = muscle.dataset.muscleId; state.activeType = 'exercises'; state.page = 1; renderExerciseResults(); void loadCollection(); return; }
    const details = event.target.closest('[data-library-details]');
    if (details) { void showDetails(details.dataset.libraryDetails, details.dataset.libraryId); return; }
    if (event.target.closest('[data-library-modal-close]') || event.target === $('portalLibraryModal')) { $('portalLibraryModal').hidden = true; return; }
    const page = event.target.closest('[data-library-page]');
    if (page) { state.page += page.dataset.libraryPage === 'next' ? 1 : -1; void loadCollection(); return; }
    if (event.target.closest('[data-library-retry]')) void loadCollection();
  });

  function ensureAnatomyEngine() {
    if (window.TopGymAnatomy) return Promise.resolve(window.TopGymAnatomy);
    if (state.anatomyLoaderPromise) return state.anatomyLoaderPromise;
    state.anatomyLoaderPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = '/js/member-portal-anatomy.js?v=1';
      script.async = true;
      script.onload = () => window.TopGymAnatomy ? resolve(window.TopGymAnatomy) : reject(new Error('Anatomy engine did not initialize.'));
      script.onerror = () => reject(new Error('تعذر تحميل محرك Anatomy ثلاثي الأبعاد.'));
      document.body.appendChild(script);
    });
    return state.anatomyLoaderPromise;
  }

  async function mountPremiumAnatomy() {
    if (state.activeType !== 'exercises' || state.anatomyStatus !== 'idle') return;
    const stage = $('portalAnatomy3DStage');
    if (!stage) return;
    state.anatomyStatus = 'loading';
    stage.innerHTML = '<div class="portal-anatomy-3d-placeholder"><span class="portal-anatomy-3d-badge">3D</span><strong>Premium Anatomy Viewer</strong><span>جاري تحميل العارض التفاعلي...</span><div class="portal-anatomy-progress"><i style="width:8%"></i></div></div>';
    try {
      const engine = await ensureAnatomyEngine();
      const viewer = await engine.mount(stage, {
        maxPixelRatio: 1.6,
        onProgress: (progress) => {
          const bar = stage.querySelector('.portal-anatomy-progress i');
          if (bar) bar.style.width = `${Math.max(8, progress)}%`;
        },
        onMuscleSelected: (muscle) => {
          if (!muscle?.id) return;
          state.selectedMuscleId = String(muscle.id);
          renderExerciseResults();
          void loadCollection();
        }
      });
      state.anatomyViewer = viewer;
      state.anatomyStatus = 'ready';
      document.querySelector('.portal-anatomy-fallback-view')?.setAttribute('hidden', 'true');
    } catch (_error) {
      state.anatomyStatus = 'unavailable';
      stage.innerHTML = '<div class="portal-anatomy-3d-placeholder portal-anatomy-3d-unavailable"><span class="portal-anatomy-3d-badge">3D</span><strong>العارض الاحترافي جاهز للتركيب</strong><span>سيتم تفعيل المجسم ثلاثي الأبعاد بعد إضافة ملف Anatomy GLB المرخص. يمكنك استخدام الخريطة التفاعلية الحالية الآن.</span></div>';
    }
  }

  async function open(type = 'exercises') {
    state.activeType = type === 'foods' ? 'foods' : 'exercises';
    renderLibraryShell();
    renderCurrent();
    try { await loadOptions(); renderCurrent(); if (state.activeType === 'exercises') void mountPremiumAnatomy(); if (state.activeType === 'foods' || state.search) await loadCollection(); } catch (error) {
      mount.innerHTML = `<div class="portal-library-state portal-library-error"><strong>تعذر تجهيز الدليل</strong><span>${escapeHtml(error.message || 'حاول مرة أخرى.')}</span></div>`;
    }
  }

  function close() { state.anatomyViewer?.dispose?.(); state.anatomyViewer = null; mount.innerHTML = ''; }

  window.topGymMemberPortalLibrary = { open, close };
})();
