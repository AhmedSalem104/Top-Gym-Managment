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
    detailsItem: null,
    detailsType: '',
    modalTrigger: null,
    modalTriggerDetails: null,
    requestId: 0,
    abortController: null,
    searchTimer: null,
    detailsRequestId: 0
  };

  const $ = (id) => document.getElementById(id);
  const tr = (key, params) => window.TopGymI18n?.t?.(`memberPortal.library.${key}`, params) || key;
  const isEnglish = () => window.TopGymI18n?.get?.() === 'en';
  const brandName = () => isEnglish()
    ? (window.topGymBranding?.get?.().identity?.englishBrandName || 'LOGIC FIT')
    : (window.topGymBranding?.get?.().identity?.brandName || 'Logic Fit');
  const englishBrandName = () => window.topGymBranding?.get?.().identity?.englishBrandName || 'LOGIC FIT';
  const escapeHtml = (value) => String(value ?? '').replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[character]));
  const number = (value, digits = 0) => Number.isFinite(Number(value)) ? (window.TopGymI18n?.format?.('number', Number(value), { maximumFractionDigits: digits }) || String(value)) : '—';
  const safeArray = (value) => Array.isArray(value) ? value.filter(Boolean) : [];
  const textValue = (...values) => values.find((value) => value !== undefined && value !== null && String(value).trim()) ?? '';
  const nameOf = (item) => textValue(
    isEnglish() ? item?.name : item?.nameAr,
    item?.name,
    item?.nameEn,
    item?.nameAr
  ) || tr('unnamed');
  const englishName = (item) => textValue(item?.name, item?.nameEn);
  const localizedField = (item, arabicKey, englishKey) => textValue(
    isEnglish() ? item?.[englishKey] : item?.[arabicKey],
    item?.[englishKey],
    item?.[arabicKey]
  );
  const errorMessage = (error) => {
    const message = String(error?.message || '').trim();
    return message && !(isEnglish() && /[\u0600-\u06ff]/u.test(message)) ? message : tr('requestFailed');
  };
  const servingUnit = (value) => {
    const unit = String(value || '').trim().toLowerCase();
    if (['g', 'gram', 'grams', 'جرام', 'غرام'].includes(unit)) return tr('grams');
    if (['mg', 'milligram', 'milligrams', 'ملجم', 'مجم'].includes(unit)) return tr('milligrams');
    return value || tr('grams');
  };
  const translate = (value, type) => {
    const normalized = String(value || '').trim().toLowerCase().replace(/[^a-z0-9]+([a-z0-9])/g, (_, character) => character.toUpperCase()).replace(/[^a-zA-Z0-9]/g, '');
    const translated = normalized ? tr(`${type}.${normalized}`) : '';
    return translated && translated !== `memberPortal.library.${type}.${normalized}` ? translated : (value || tr('muscleUnknown'));
  };
  const secondaryName = (item, element = 'small') => {
    const candidate = englishName(item);
    return candidate && candidate !== nameOf(item) ? `<${element} dir="ltr">${escapeHtml(candidate)}</${element}>` : '';
  };

  function requestJson(url, options = {}) {
    return fetch(url, { ...options, headers: { Accept: 'application/json', ...(options.headers || {}) } }).then(async (response) => {
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || tr('requestFailed'));
      return payload;
    });
  }

  function imageMarkup(item, phase = 'start', className = '') {
    const source = item?.imageAssets?.[phase] || item?.imageAssets?.main;
    if (!source) return `<span class="portal-library-image-fallback" aria-hidden="true">${escapeHtml(item?.icon || '🏋️')}</span>`;
    return `<img class="${className}" src="${escapeHtml(source)}" alt="${escapeHtml(nameOf(item))}" loading="lazy" width="720" height="480" data-portal-library-image>`;
  }

  function foodImageMarkup(item) {
    if (window.TopGymFoodAssets?.imageMarkup) return window.TopGymFoodAssets.imageMarkup(item, { className: 'portal-food-media', alt: nameOf(item), loading: 'lazy' });
    return '<span class="portal-food-symbol" aria-hidden="true"></span>';
  }


  function renderExerciseCard(item) {
    const title = nameOf(item);
    const tags = [localizedField(item, 'targetMuscleNameAr', 'targetMuscleName') || tr('muscleUnknown'), translate(item.difficulty, 'difficulty'), item.equipment ? translate(item.equipment, 'equipment') : null].filter(Boolean);
    return `<article class="portal-exercise-card"><div class="portal-exercise-media">${imageMarkup(item)}<span class="portal-exercise-phase">${escapeHtml(tr('startPosition'))}</span></div><div class="portal-exercise-body"><div class="portal-exercise-title"><div><h5>${escapeHtml(title)}</h5>${secondaryName(item)}</div><span class="portal-exercise-icon">${escapeHtml(item.icon || '🏋️')}</span></div><div class="portal-exercise-tags">${tags.map((tag) => `<span>${escapeHtml(tag)}</span>`).join('')}</div><div class="portal-exercise-meta"><span>${escapeHtml(tr('sets'))} ${item.setsRange ? escapeHtml(item.setsRange) : '—'}</span><span>${escapeHtml(tr('reps'))} ${item.repsRange ? escapeHtml(item.repsRange) : '—'}</span></div><button class="btn btn-light portal-library-details-button" type="button" data-library-details="exercises" data-library-id="${item.id}">${escapeHtml(tr('detailsButton'))}</button></div></article>`;
  }

  function renderFoodCard(item) {
    const title = nameOf(item);
    return `<article class="portal-food-card"><div class="portal-food-media-wrap">${foodImageMarkup(item)}</div><div class="portal-food-title"><div><h5>${escapeHtml(title)}</h5>${secondaryName(item)}</div><span>${escapeHtml(translate(item.category, 'category') || tr('food'))}</span></div><div class="portal-food-calories"><strong>${number(item.calories, 1)}</strong><span>${escapeHtml(tr('perServing', { amount: number(item.calories, 1), unit: `${number(item.servingSize, 1)} ${servingUnit(item.servingUnit)}` }))}</span></div><div class="portal-macro-grid"><span><b>${number(item.protein, 1)}</b><small>${escapeHtml(tr('protein'))}</small></span><span><b>${number(item.carbs, 1)}</b><small>${escapeHtml(tr('carbs'))}</small></span><span><b>${number(item.fat, 1)}</b><small>${escapeHtml(tr('fat'))}</small></span></div><button class="btn btn-light portal-library-details-button" type="button" data-library-details="foods" data-library-id="${item.id}">${escapeHtml(tr('nutritionDetails'))}</button></article>`;
  }

  function renderPagination() {
    if (!state.pagination || state.pagination.totalPages <= 1) return '';
    return `<div class="portal-library-pagination"><span>${escapeHtml(tr('page', { page: number(state.pagination.page), pages: number(state.pagination.totalPages) }))}</span><div><button type="button" class="btn btn-light" data-library-page="prev" ${state.pagination.page <= 1 ? 'disabled' : ''}>${escapeHtml(tr('previous'))}</button><button type="button" class="btn btn-light" data-library-page="next" ${state.pagination.page >= state.pagination.totalPages ? 'disabled' : ''}>${escapeHtml(tr('next'))}</button></div></div>`;
  }

  function renderLibraryShell() {
    const isFoods = state.activeType === 'foods';
    const title = tr(isFoods ? 'nutritionGuide' : 'exerciseGuide');
    const description = tr(isFoods ? 'foodHint' : 'exerciseHint');
    mount.innerHTML = `<div class="portal-library-head" data-library-type="${state.activeType}"><div><span class="portal-library-kicker">${escapeHtml(englishBrandName())} ${escapeHtml(tr('memberHub'))}</span><h3 id="portalLibraryTitle">${escapeHtml(title)}</h3><p>${escapeHtml(description)}</p></div><button type="button" class="btn btn-light" data-library-close>${escapeHtml(tr('close'))}</button></div><div id="portalLibraryContent"></div><div class="portal-library-modal" id="portalLibraryModal" role="dialog" aria-modal="true" aria-labelledby="portalLibraryModalTitle" hidden><div class="portal-library-modal-card"><header><div><span class="portal-library-kicker">${escapeHtml(brandName())} ${escapeHtml(tr('guideLabel'))}</span><h3 id="portalLibraryModalTitle">${escapeHtml(tr('details'))}</h3></div><button type="button" class="portal-library-modal-close" data-library-modal-close aria-label="${escapeHtml(tr('closeDialog'))}">×</button></header><div id="portalLibraryModalContent"></div></div></div>`;
  }

  function renderFilters() {
    const filters = state.options?.filters || {};
    return `<div class="portal-library-filter-bar"><label><span>${escapeHtml(tr('quickSearch'))}</span><input id="portalLibrarySearch" type="search" value="${escapeHtml(state.search)}" placeholder="${escapeHtml(tr('searchPlaceholder'))}" autocomplete="off"></label>${state.activeType === 'foods' ? `<label><span>${escapeHtml(tr('category'))}</span><select id="portalFoodCategory"><option value="">${escapeHtml(tr('allCategories'))}</option>${(filters.categories || []).map((item) => `<option value="${escapeHtml(item)}"${item === state.category ? ' selected' : ''}>${escapeHtml(translate(item, 'category'))}</option>`).join('')}</select></label>` : `<label><span>${escapeHtml(tr('level'))}</span><select id="portalExerciseDifficulty"><option value="">${escapeHtml(tr('allLevels'))}</option>${(filters.difficulties || []).map((item) => `<option value="${escapeHtml(item)}"${item === state.difficulty ? ' selected' : ''}>${escapeHtml(translate(item, 'difficulty'))}</option>`).join('')}</select></label><label><span>${escapeHtml(tr('equipment'))}</span><select id="portalExerciseEquipment"><option value="">${escapeHtml(tr('allEquipment'))}</option>${(filters.equipment || []).map((item) => `<option value="${escapeHtml(item)}"${item === state.equipment ? ' selected' : ''}>${escapeHtml(translate(item, 'equipment'))}</option>`).join('')}</select></label>`}</div>`;
  }

  function renderCurrent() {
    const content = $('portalLibraryContent');
    if (!content) return;
    if (state.activeType === 'exercises') {
      content.innerHTML = `<div class="portal-exercise-results">${renderFilters()}<div class="portal-library-results-head"><div><h4>${escapeHtml(tr('exercisesAvailable'))}</h4><span>${state.pagination ? escapeHtml(tr('resultCount', { count: number(state.pagination.totalItems) })) : escapeHtml(tr('exerciseHint'))}</span></div></div><div class="portal-exercise-grid">${state.items.length ? state.items.map(renderExerciseCard).join('') : `<div class="portal-library-state portal-library-state-wide"><strong>${escapeHtml(tr(state.search || state.difficulty || state.equipment ? 'noExercisesMatch' : 'noExercises'))}</strong><span>${escapeHtml(tr('tryDifferentFilter'))}</span></div>`}</div>${renderPagination()}</div>`;
    } else {
      content.innerHTML = `<div class="portal-food-explorer">${renderFilters()}<div class="portal-library-results-head"><div><h4>${escapeHtml(tr('foodsAndNutrition'))}</h4><span>${state.pagination ? escapeHtml(tr('foodCount', { count: number(state.pagination.totalItems) })) : escapeHtml(tr('noFoodSearch'))}</span></div></div><div class="portal-food-grid">${state.items.length ? state.items.map(renderFoodCard).join('') : `<div class="portal-library-state portal-library-state-wide"><strong>${escapeHtml(tr(state.search ? 'noFoodMatch' : 'enterFood'))}</strong><span>${escapeHtml(tr('noFoodDetails'))}</span></div>`}</div>${renderPagination()}</div>`;
    }
    bindDynamicControls();
    window.TopGymI18n?.annotateText?.(mount, 'memberPortal.');
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
      if (state.activeType === 'foods') window.TopGymFoodAssets?.hydrate?.(content);
    } catch (error) {
      if (error.name === 'AbortError') return;
      if (content) content.innerHTML = `<div class="portal-library-state portal-library-error"><strong>${escapeHtml(tr('loadError'))}</strong><span>${escapeHtml(errorMessage(error))}</span><button type="button" class="btn btn-light" data-library-retry>${escapeHtml(tr('retryButton'))}</button></div>`;
    } finally {
      content?.classList.remove('is-loading');
    }
  }

  async function showDetails(type, id, trigger) {
    const modal = $('portalLibraryModal');
    const content = $('portalLibraryModalContent');
    if (!modal || !content) return;
    state.modalTrigger = trigger instanceof HTMLElement ? trigger : document.activeElement;
    state.modalTriggerDetails = { type, id: String(id) };
    const requestId = ++state.detailsRequestId;
    modal.hidden = false;
    modal.tabIndex = -1;
    content.setAttribute('aria-busy', 'true');
    modal.querySelector('[data-library-modal-close]')?.focus({ preventScroll: true });
    content.innerHTML = `<div class="portal-library-state"><span class="portal-library-loader"></span><strong>${escapeHtml(tr('loadingDetails'))}</strong></div>`;
    try {
      const result = await requestJson(`/api/member-portal/library/${type}/${encodeURIComponent(id)}`);
      if (requestId !== state.detailsRequestId) return;
      const item = result.item || {};
      state.detailsType = type;
      state.detailsItem = item;
      content.removeAttribute('aria-busy');
      renderDetails();
    } catch (error) {
      if (requestId !== state.detailsRequestId) return;
      content.removeAttribute('aria-busy');
      content.innerHTML = `<div class="portal-library-state portal-library-error"><strong>${escapeHtml(tr('detailsError'))}</strong><span>${escapeHtml(errorMessage(error))}</span></div>`;
    }
  }

  function closeDetailsModal() {
    const modal = $('portalLibraryModal');
    if (!modal || modal.hidden) return;
    state.detailsRequestId += 1;
    modal.hidden = true;
    $('portalLibraryModalContent')?.removeAttribute('aria-busy');
    const triggerDetails = state.modalTriggerDetails;
    const fallbackTrigger = triggerDetails
      ? Array.from(mount.querySelectorAll('[data-library-details]')).find((element) =>
        element.dataset.libraryDetails === triggerDetails.type && element.dataset.libraryId === triggerDetails.id)
      : null;
    const trigger = state.modalTrigger?.isConnected ? state.modalTrigger : fallbackTrigger;
    trigger?.focus({ preventScroll: true });
  }

  function handleModalKeydown(event) {
    const modal = $('portalLibraryModal');
    if (!modal || modal.hidden) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      closeDetailsModal();
      return;
    }
    if (event.key !== 'Tab') return;
    const focusable = Array.from(modal.querySelectorAll(
      'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
    )).filter((element) => !element.hidden && element.getClientRects().length > 0);
    if (!focusable.length) {
      event.preventDefault();
      modal.focus({ preventScroll: true });
      return;
    }
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && (document.activeElement === first || !modal.contains(document.activeElement))) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && (document.activeElement === last || !modal.contains(document.activeElement))) {
      event.preventDefault();
      first.focus();
    }
  }

  document.addEventListener('keydown', handleModalKeydown);

  function renderDetails() {
    if (!state.detailsItem) return;
    const modal = $('portalLibraryModal');
    const content = $('portalLibraryModalContent');
    if (!modal || !content) return;
    modal.hidden = false;
    $('portalLibraryModalTitle').textContent = nameOf(state.detailsItem);
    content.innerHTML = state.detailsType === 'foods' ? renderFoodDetails(state.detailsItem) : renderExerciseDetails(state.detailsItem);
    window.TopGymI18n?.annotateText?.(modal, 'memberPortal.');
  }

  function listBlock(title, values, fallback) {
    const list = safeArray(values);
    return `<section class="portal-detail-block"><h4>${escapeHtml(title)}</h4>${list.length ? `<ul>${list.map((value) => `<li>${escapeHtml(typeof value === 'object' ? textValue(value.text, value.value, value.instruction, value.description) : value)}</li>`).join('')}</ul>` : `<p class="portal-detail-muted">${escapeHtml(fallback)}</p>`}</section>`;
  }

  function renderExerciseDetails(item) {
    const images = item.imageAssets || {};
    const instructions = localizedField(item, 'instructionsAr', 'instructions');
    const tips = localizedField(item, 'tipsAr', 'tips');
    const mistakes = localizedField(item, 'commonMistakesAr', 'commonMistakes');
    return `<div class="portal-detail-hero"><div class="portal-detail-gallery">${imageMarkup({ ...item, imageAssets: images }, 'start', 'portal-detail-image')}${images.end ? imageMarkup({ ...item, imageAssets: images }, 'end', 'portal-detail-image') : ''}</div><div><span class="portal-library-kicker">${escapeHtml(tr('exerciseGuide'))}</span><h4>${escapeHtml(nameOf(item))}</h4>${secondaryName(item, 'p')}<div class="portal-detail-tags"><span>${escapeHtml(localizedField(item, 'targetMuscleNameAr', 'targetMuscleName') || tr('muscleUnknown'))}</span><span>${escapeHtml(translate(item.difficulty, 'difficulty'))}</span><span>${escapeHtml(translate(item.equipment, 'equipment'))}</span></div></div></div><div class="portal-detail-stat-grid"><span><b>${escapeHtml(item.setsRange || '—')}</b><small>${escapeHtml(tr('sets'))}</small></span><span><b>${escapeHtml(item.repsRange || '—')}</b><small>${escapeHtml(tr('reps'))}</small></span><span><b>${item.restSeconds == null ? '—' : number(item.restSeconds)} ${escapeHtml(tr('seconds'))}</b><small>${escapeHtml(tr('rest'))}</small></span><span><b>${escapeHtml(item.tempo || '—')}</b><small>${escapeHtml(tr('tempo'))}</small></span></div><div class="portal-detail-copy">${localizedField(item, 'descriptionAr', 'description') ? `<p>${escapeHtml(localizedField(item, 'descriptionAr', 'description'))}</p>` : ''}${listBlock(tr('howTo'), instructions, tr('instructionsUnavailable'))}${listBlock(tr('tips'), tips, tr('noTips'))}${listBlock(tr('commonMistakes'), mistakes, tr('noMistakes'))}</div>`;
  }

  function renderFoodDetails(item) {
    const grams = tr('grams');
    const milligrams = tr('milligrams');
    const nutrients = [
      [tr('calories'), `${number(item.calories, 1)} ${tr('calorieUnit')}`],
      [tr('protein'), `${number(item.protein, 1)} ${grams}`],
      [tr('carbs'), `${number(item.carbs, 1)} ${grams}`],
      [tr('fat'), `${number(item.fat, 1)} ${grams}`],
      [tr('fiber'), `${number(item.fiber, 1)} ${grams}`],
      [tr('sugar'), `${number(item.sugar, 1)} ${grams}`],
      [tr('sodium'), `${number(item.sodium, 1)} ${milligrams}`]
    ];
    return `<div class="portal-food-detail-hero"><span class="portal-food-detail-icon">🥗</span><div><span class="portal-library-kicker">${escapeHtml(tr('nutritionGuide'))}</span><h4>${escapeHtml(nameOf(item))}</h4>${secondaryName(item)}<span>${escapeHtml(translate(item.category, 'category') || tr('food'))} · ${escapeHtml(tr('servingSize', { amount: number(item.servingSize, 1), unit: servingUnit(item.servingUnit) }))}</span></div></div><div class="portal-food-detail-grid">${nutrients.map(([label, value]) => `<div><span>${escapeHtml(label)}</span><strong dir="auto">${escapeHtml(value)}</strong></div>`).join('')}</div>`;
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
    if (details) { void showDetails(details.dataset.libraryDetails, details.dataset.libraryId, details); return; }
    if (event.target.closest('[data-library-modal-close]') || event.target === $('portalLibraryModal')) { closeDetailsModal(); return; }
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
    state.detailsItem = null;
    state.detailsType = '';
    renderLibraryShell();
    renderCurrent();
    try { await loadOptions(); renderCurrent(); await loadCollection(); } catch (error) {
      mount.innerHTML = `<div class="portal-library-state portal-library-error"><strong>${escapeHtml(tr('setupError'))}</strong><span>${escapeHtml(errorMessage(error))}</span></div>`;
    }
  }

  function close() { state.abortController?.abort?.(); clearTimeout(state.searchTimer); state.detailsItem = null; state.detailsType = ''; mount.innerHTML = ''; }

  window.addEventListener('topgym:localechange', () => {
    if (!mount.firstElementChild) return;
    const modalWasOpen = Boolean($('portalLibraryModal') && !$('portalLibraryModal').hidden);
    renderLibraryShell();
    renderCurrent();
    if (state.detailsItem && modalWasOpen) renderDetails();
    window.TopGymI18n?.annotateText?.(mount, 'memberPortal.');
  });

  window.topGymMemberPortalLibrary = { open, close };
})();
