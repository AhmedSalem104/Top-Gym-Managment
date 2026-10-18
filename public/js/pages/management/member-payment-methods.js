(() => {
  'use strict';

  if (window.__topGymMemberPaymentMethodsLoaded) return;
  window.__topGymMemberPaymentMethodsLoaded = true;
  const page = document.getElementById('memberPaymentMethodsSection');
  if (!page) return;

  const $ = (id) => document.getElementById(id);
  const t = (key, params) => window.TopGymI18n?.t?.(key, params) || key;
  const catalog = window.LogicFitPaymentMethodCatalog;
  const fallback = window.topGymBranding?.fallback?.() || { identity: {} };
  const state = {
    draft: null, published: null, originalDraft: null, version: 1,
    dirty: false, pendingPublish: false, busy: false, initialized: false,
    editingIndex: null, editingMethod: null, editingTrigger: null, nameTouched: false
  };

  function clone(value) { return JSON.parse(JSON.stringify(value ?? {})); }
  function isObject(value) { return Boolean(value) && typeof value === 'object' && !Array.isArray(value); }
  function merge(base, override) {
    const result = clone(base || {});
    if (!isObject(override)) return result;
    Object.entries(override).forEach(([key, value]) => {
      result[key] = isObject(value) && isObject(result[key]) ? merge(result[key], value) : value;
    });
    return result;
  }
  function methodsFor(config) {
    if (!isObject(config.identity)) config.identity = {};
    if (!Array.isArray(config.identity.paymentMethods)) config.identity.paymentMethods = [];
    return config.identity.paymentMethods;
  }
  function methodSnapshot(config) {
    return methodsFor(clone(config)).map((method, index) => ({
      id: String(method?.id || ''), typeId: String(method?.typeId || ''),
      name: String(method?.name || ''), accountReference: String(method?.accountReference || ''),
      recipientName: String(method?.recipientName || ''), instructions: String(method?.instructions || ''),
      isActive: method?.isActive !== false,
      sortOrder: Number.isFinite(Number(method?.sortOrder)) ? Number(method.sortOrder) : index
    }));
  }
  function hasMethodChanges(first, second) {
    return JSON.stringify(methodSnapshot(first)) !== JSON.stringify(methodSnapshot(second));
  }
  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  }
  function updateStatus(key, kind = 'info', params = {}) {
    const status = $('memberPaymentMethodsStatus');
    if (!status) return;
    status.dataset.i18n = key;
    Object.keys(status.dataset).filter((name) => name.startsWith('i18nParam')).forEach((name) => delete status.dataset[name]);
    Object.entries(params).forEach(([name, value]) => { status.dataset[`i18nParam${name[0].toUpperCase()}${name.slice(1)}`] = String(value); });
    status.textContent = t(key, params);
    status.classList.toggle('is-error', kind === 'error');
    status.classList.toggle('is-success', kind === 'success');
  }
  function methodTypeLabel(typeId) {
    const locale = window.TopGymI18n?.get?.() || document.documentElement.lang || 'ar';
    return catalog?.label?.(typeId, locale) || t('memberPayment.methods.legacyType');
  }
  function renderMeta() {
    const methods = methodsFor(state.draft || merge(fallback, {}));
    const activeCount = methods.filter((method) => method?.isActive !== false).length;
    const meta = $('memberPaymentMethodsMeta');
    if (!meta) return;
    const key = state.pendingPublish ? 'memberPayment.meta.draft' : 'memberPayment.meta.published';
    const version = t(key, { version: state.version });
    meta.textContent = `${version} · ${t('memberPayment.summary.totalCount')}: ${methods.length} · ${t('memberPayment.summary.activeCount')}: ${activeCount}`;
    delete meta.dataset.i18n;
  }
  function renderActionState() {
    const actionTitle = $('memberPaymentMethodsActionTitle');
    const actionHint = $('memberPaymentMethodsActionHint');
    if (actionTitle) {
      const key = state.dirty ? 'memberPayment.action.unsavedTitle' : state.pendingPublish ? 'memberPayment.action.pendingTitle' : 'memberPayment.action.cleanTitle';
      actionTitle.dataset.i18n = key;
      actionTitle.textContent = t(key);
    }
    if (actionHint) {
      const key = state.dirty ? 'memberPayment.action.unsavedHint' : state.pendingPublish ? 'memberPayment.action.pendingHint' : 'memberPayment.action.cleanHint';
      actionHint.dataset.i18n = key;
      actionHint.textContent = t(key);
    }
  }
  function updateSummary() { renderMeta(); renderActionState(); }

  function renderMethods() {
    const container = $('memberPaymentMethodsList');
    if (!container || !state.draft) return;
    const methods = methodsFor(state.draft);
    container.setAttribute('aria-busy', 'false');
    if (!methods.length) {
      container.innerHTML = `<div class="member-payment-empty"><strong data-i18n="memberPayment.methods.empty.title"></strong><span data-i18n="memberPayment.methods.empty.body"></span></div>`;
      window.TopGymI18n?.apply?.(container);
      updateSummary();
      return;
    }
    const locale = window.TopGymI18n?.getLocale?.() || document.documentElement.lang || 'ar';
    const columnLabel = (key) => escapeHtml(t(`memberPayment.table.${key}`));
    const rows = methods.map((method, index) => {
      const brand = catalog?.createMark?.(method?.typeId, { label: methodTypeLabel(method?.typeId) })?.outerHTML || '';
      const instructions = String(method?.instructions || '').trim();
      return `<tr data-member-payment-row="${index}">
        <td><div class="member-payment-method-cell">${brand}<span class="member-payment-method-copy"><strong>${escapeHtml(method?.name || '—')}</strong><small>${escapeHtml(instructions || t('memberPayment.methods.noInstructions'))}</small></span></div></td>
        <td data-label="${columnLabel('reference')}"><span class="member-payment-ltr" dir="auto">${escapeHtml(method?.accountReference || '—')}</span></td>
        <td data-label="${columnLabel('recipient')}">${escapeHtml(method?.recipientName || '—')}</td>
        <td data-label="${columnLabel('sortOrder')}"><b class="member-payment-order">${escapeHtml(method?.sortOrder ?? index)}</b></td>
        <td data-label="${columnLabel('visibility')}"><span class="member-payment-visibility ${method?.isActive === false ? 'is-hidden' : 'is-visible'}">${escapeHtml(t(method?.isActive === false ? 'memberPayment.methods.hidden' : 'memberPayment.methods.visible'))}</span></td>
        <td data-label="${columnLabel('actions')}"><div class="member-payment-row-actions"><button class="btn btn-light" type="button" data-member-payment-edit="${index}" aria-label="${escapeHtml(t('memberPayment.methods.editNamed', { name: method?.name || '' }))}" title="${escapeHtml(t('memberPayment.methods.edit'))}">${escapeHtml(t('memberPayment.methods.edit'))}</button><button class="btn btn-danger" type="button" data-member-payment-remove="${index}" aria-label="${escapeHtml(t('memberPayment.methods.removeNamed', { name: method?.name || '' }))}" title="${escapeHtml(t('memberPayment.methods.remove'))}">${escapeHtml(t('memberPayment.methods.remove'))}</button></div></td>
      </tr>`;
    }).join('');
    container.innerHTML = `<table class="member-payment-table"><thead><tr>${['method','reference','recipient','sortOrder','visibility','actions'].map((key) => `<th scope="col" data-i18n="memberPayment.table.${key}"></th>`).join('')}</tr></thead><tbody>${rows}</tbody></table>`;
    catalog?.bindFallbackHandling?.(container);
    container.lang = locale;
    window.TopGymI18n?.apply?.(container);
    updateSummary();
  }

  function refreshDirtyState() {
    state.dirty = Boolean(state.draft && state.originalDraft && hasMethodChanges(state.draft, state.originalDraft));
    state.pendingPublish = Boolean(state.draft && state.published && hasMethodChanges(state.draft, state.published));
    updateSummary();
  }
  function markChanged() {
    refreshDirtyState();
    updateStatus('memberPayment.status.draftChanged');
  }
  function dialog() { return $('memberPaymentMethodDialog'); }
  function getTypeId(method) { return String(method?.typeId || ''); }
  function currentLocale() { return window.TopGymI18n?.get?.() || document.documentElement.lang || 'ar'; }

  function renderTypeOptions(selectedType = '') {
    const select = $('memberPaymentType');
    if (!select) return;
    const types = catalog?.types || [];
    const empty = `<option value="">${escapeHtml(t('memberPayment.dialog.chooseType'))}</option>`;
    select.innerHTML = empty + types.map((type) => `<option value="${escapeHtml(type.id)}">${escapeHtml(catalog.label(type.id, currentLocale()))}</option>`).join('');
    if (selectedType && !types.some((type) => type.id === selectedType)) {
      select.insertAdjacentHTML('beforeend', `<option value="${escapeHtml(selectedType)}">${escapeHtml(t('memberPayment.methods.legacyType'))}</option>`);
    }
    select.value = selectedType;
    filterTypeOptions();
  }
  function filterTypeOptions() {
    const search = $('memberPaymentTypeSearch');
    const select = $('memberPaymentType');
    if (!search || !select) return;
    const term = search.value.trim().toLocaleLowerCase(currentLocale());
    [...select.options].forEach((option) => {
      option.hidden = Boolean(term && option.value && !option.textContent.toLocaleLowerCase(currentLocale()).includes(term));
    });
  }
  function updateBrandPreview() {
    const preview = $('memberPaymentBrandPreview');
    const typeId = $('memberPaymentType')?.value || '';
    if (!preview) return;
    const label = typeId ? methodTypeLabel(typeId) : t('memberPayment.dialog.chooseType');
    const brand = catalog?.createMark?.(typeId, { label })?.outerHTML || '';
    preview.innerHTML = `${brand}<span>${escapeHtml(label)}</span>`;
    catalog?.bindFallbackHandling?.(preview);
  }
  function setDialogError(key = '') {
    const el = $('memberPaymentDialogError');
    if (!el) return;
    el.hidden = !key;
    el.dataset.i18n = key || '';
    el.textContent = key ? t(key) : '';
  }
  function openEditor(index, trigger) {
    if (state.busy || !state.draft) return;
    const existing = Number.isInteger(index) && index >= 0 ? methodsFor(state.draft)[index] : null;
    state.editingIndex = existing ? index : null;
    state.editingMethod = existing ? clone(existing) : {
      id: '', typeId: '', name: '', accountReference: '', recipientName: '', instructions: '',
      isActive: true, sortOrder: methodsFor(state.draft).length
    };
    state.editingTrigger = trigger || $('memberPaymentMethodAdd');
    state.nameTouched = Boolean(existing);
    const method = state.editingMethod;
    $('memberPaymentDialogTitle').dataset.i18n = existing ? 'memberPayment.dialog.editTitle' : 'memberPayment.dialog.addTitle';
    $('memberPaymentDialogTitle').textContent = t(existing ? 'memberPayment.dialog.editTitle' : 'memberPayment.dialog.addTitle');
    $('memberPaymentTypeSearch').value = '';
    renderTypeOptions(getTypeId(method));
    $('memberPaymentName').value = method.name || '';
    $('memberPaymentReference').value = method.accountReference || '';
    $('memberPaymentRecipient').value = method.recipientName || '';
    $('memberPaymentSortOrder').value = String(method.sortOrder ?? methodsFor(state.draft).length);
    $('memberPaymentInstructions').value = method.instructions || '';
    $('memberPaymentActive').checked = method.isActive !== false;
    setDialogError();
    updateBrandPreview();
    if (!dialog().open) dialog().showModal();
    $('memberPaymentTypeSearch').focus();
  }
  function closeEditor() {
    const trigger = state.editingTrigger;
    state.editingIndex = null;
    state.editingMethod = null;
    state.editingTrigger = null;
    state.nameTouched = false;
    if (dialog()?.open) dialog().close();
    trigger?.isConnected && trigger.focus();
  }
  function applyEditor(event) {
    event?.preventDefault();
    if (!state.editingMethod || state.busy) return;
    const name = $('memberPaymentName').value.trim();
    const accountReference = $('memberPaymentReference').value.trim();
    const typeId = $('memberPaymentType').value;
    const index = state.editingIndex;
    const isLegacyEdit = index != null && !getTypeId(methodsFor(state.draft)[index]);
    if (!name || !accountReference) {
      setDialogError('memberPayment.validation.dialogRequired');
      (!name ? $('memberPaymentName') : $('memberPaymentReference')).focus();
      return;
    }
    if (!typeId && !isLegacyEdit) {
      setDialogError('memberPayment.validation.typeRequired');
      $('memberPaymentType').focus();
      return;
    }
    const updated = {
      ...state.editingMethod,
      ...(typeId ? { typeId } : {}),
      name,
      accountReference,
      recipientName: $('memberPaymentRecipient').value.trim(),
      instructions: $('memberPaymentInstructions').value.trim(),
      sortOrder: Math.min(999, Math.max(0, Number($('memberPaymentSortOrder').value) || 0)),
      isActive: $('memberPaymentActive').checked
    };
    if (index == null) methodsFor(state.draft).push(updated);
    else methodsFor(state.draft)[index] = updated;
    closeEditor();
    renderMethods();
    markChanged();
  }
  function onTypeChange() {
    const typeId = $('memberPaymentType').value;
    state.editingMethod && (state.editingMethod.typeId = typeId);
    $('memberPaymentTypeSearch').value = '';
    filterTypeOptions();
    if (!state.nameTouched && typeId && typeId !== 'other') $('memberPaymentName').value = catalog?.label?.(typeId, currentLocale()) || '';
    if (typeId === 'other' && !state.nameTouched) $('memberPaymentName').value = '';
    updateBrandPreview();
  }
  async function removeMethod(index, trigger) {
    if (state.busy || !state.draft) return;
    const methods = methodsFor(state.draft);
    if (!Number.isInteger(index) || index < 0 || index >= methods.length) return;
    const method = methods[index];
    let confirmed = false;
    if (window.Swal) {
      const result = await window.Swal.fire({
        icon: 'warning', title: t('memberPayment.methods.removeTitle'),
        text: t('memberPayment.methods.removeConfirm', { name: method.name || '' }),
        showCancelButton: true, confirmButtonText: t('memberPayment.methods.remove'),
        cancelButtonText: t('memberPayment.dialog.cancel'), buttonsStyling: false,
        customClass: { popup: 'top-gym-alert', confirmButton: 'btn btn-danger', cancelButton: 'btn btn-light' }
      });
      confirmed = Boolean(result.isConfirmed);
    } else confirmed = window.confirm(t('memberPayment.methods.removeConfirm', { name: method.name || '' }));
    if (!confirmed) { trigger?.focus(); return; }
    methods.splice(index, 1);
    renderMethods();
    markChanged();
    $('memberPaymentMethodAdd')?.focus();
  }
  function validateMethods() {
    const methods = methodsFor(state.draft);
    for (const [index, method] of methods.entries()) {
      if (!String(method?.name || '').trim() || !String(method?.accountReference || '').trim()) {
        updateStatus('memberPayment.validation.required', 'error', { count: index + 1 });
        page.querySelector(`[data-member-payment-edit="${index}"]`)?.focus();
        return false;
      }
      if (method?.typeId && !catalog?.has?.(method.typeId)) {
        updateStatus('memberPayment.validation.invalidType', 'error');
        page.querySelector(`[data-member-payment-edit="${index}"]`)?.focus();
        return false;
      }
    }
    return true;
  }
  async function runWithFeedback(button, task, options) {
    if (window.topGymFeedback?.run) return window.topGymFeedback.run(button, task, options);
    button.disabled = true;
    try { return await task(); } finally { button.disabled = false; }
  }
  function applySettings(result) {
    state.draft = merge(fallback, result?.draft || state.draft || {});
    state.published = merge(fallback, result?.published || state.published || {});
    state.originalDraft = clone(state.draft);
    state.version = Number(result?.version || state.version || 1);
    state.dirty = false;
    refreshDirtyState();
    renderMethods();
  }
  async function loadSettings() {
    if (!window.topGymAuth?.isOwner?.()) return false;
    const list = $('memberPaymentMethodsList');
    if (list) list.setAttribute('aria-busy', 'true');
    updateStatus('memberPayment.status.loadingSettings');
    try {
      const result = await window.topGymAuth.api('/api/branding/settings', { method: 'GET' });
      state.draft = merge(fallback, result?.draft || {});
      state.published = merge(fallback, result?.published || {});
      state.originalDraft = clone(state.draft);
      state.version = Number(result?.version || 1);
      state.dirty = false;
      refreshDirtyState();
      renderMethods();
      state.initialized = true;
      updateStatus(state.pendingPublish ? 'memberPayment.status.draftNotPublished' : 'memberPayment.status.publishedReady', state.pendingPublish ? 'info' : 'success');
      return true;
    } catch (error) {
      if (list) {
        list.setAttribute('aria-busy', 'false');
        list.innerHTML = `<div class="member-payment-empty"><strong data-i18n="memberPayment.methods.loadError.title"></strong><span data-i18n="memberPayment.methods.loadError.body"></span></div>`;
        window.TopGymI18n?.apply?.(list);
      }
      updateStatus('memberPayment.status.loadError', 'error');
      return false;
    }
  }
  async function saveDraft(button = $('memberPaymentMethodsSave')) {
    if (state.busy || !state.draft || !validateMethods()) return false;
    state.busy = true;
    try {
      const result = await runWithFeedback(button, () => window.topGymAuth.api('/api/branding/draft', {
        method: 'PUT', body: JSON.stringify({ config: state.draft })
      }), {
        loadingText: t('memberPayment.action.loadingSave'), successText: t('memberPayment.action.savedTitle'),
        successMessage: t('memberPayment.action.saved'), errorMessage: t('memberPayment.action.saveError')
      });
      applySettings(result);
      updateStatus('memberPayment.status.draftSaved', 'success');
      return true;
    } catch (error) {
      updateStatus('memberPayment.status.saveError', 'error');
      return false;
    } finally { state.busy = false; }
  }
  async function publish(button = $('memberPaymentMethodsPublish')) {
    if (state.busy || !state.draft || !validateMethods()) return false;
    state.busy = true;
    try {
      if (state.dirty) {
        state.busy = false;
        const saved = await saveDraft($('memberPaymentMethodsSave'));
        if (!saved) return false;
        state.busy = true;
      }
      const result = await runWithFeedback(button, () => window.topGymAuth.api('/api/branding/publish', { method: 'POST', body: JSON.stringify({}) }), {
        loadingText: t('memberPayment.action.loadingPublish'), successText: t('memberPayment.action.publishedTitle'),
        successMessage: t('memberPayment.action.published'), errorMessage: t('memberPayment.action.publishError')
      });
      applySettings(result);
      state.pendingPublish = false;
      updateSummary();
      updateStatus('memberPayment.status.publishedReady', 'success');
      window.topGymBranding?.refresh?.();
      window.dispatchEvent(new CustomEvent('topgym:brandingchange'));
      return true;
    } catch (error) {
      updateStatus('memberPayment.status.publishError', 'error');
      return false;
    } finally { state.busy = false; }
  }
  async function confirmLeave() {
    if (!state.dirty) return true;
    if (window.Swal) {
      const result = await window.Swal.fire({
        icon: 'warning', title: t('memberPayment.leave.title'), text: t('memberPayment.leave.body'),
        showCancelButton: true, confirmButtonText: t('memberPayment.leave.confirm'), cancelButtonText: t('memberPayment.leave.cancel'),
        buttonsStyling: false, customClass: { popup: 'top-gym-alert', confirmButton: 'btn btn-danger', cancelButton: 'btn btn-light' }
      });
      return Boolean(result.isConfirmed);
    }
    return window.confirm(t('memberPayment.status.leaveError'));
  }
  function bind() {
    $('memberPaymentMethodAdd')?.addEventListener('click', (event) => openEditor(null, event.currentTarget));
    $('memberPaymentMethodsSave')?.addEventListener('click', () => { void saveDraft(); });
    $('memberPaymentMethodsPublish')?.addEventListener('click', () => { void publish(); });
    $('memberPaymentMethodsList')?.addEventListener('click', (event) => {
      const edit = event.target.closest('[data-member-payment-edit]');
      const remove = event.target.closest('[data-member-payment-remove]');
      if (edit) openEditor(Number(edit.dataset.memberPaymentEdit), edit);
      if (remove) void removeMethod(Number(remove.dataset.memberPaymentRemove), remove);
    });
    $('memberPaymentMethodForm')?.addEventListener('submit', applyEditor);
    document.querySelectorAll('[data-member-payment-dialog-close]').forEach((button) => button.addEventListener('click', closeEditor));
    dialog()?.addEventListener('cancel', (event) => { event.preventDefault(); closeEditor(); });
    $('memberPaymentTypeSearch')?.addEventListener('input', filterTypeOptions);
    $('memberPaymentType')?.addEventListener('change', onTypeChange);
    $('memberPaymentName')?.addEventListener('input', () => { state.nameTouched = true; });
    window.addEventListener('beforeunload', (event) => {
      if (!state.dirty) return;
      event.preventDefault(); event.returnValue = '';
    });
    window.addEventListener('topgym:brandingchange', () => {
      if (state.initialized && !state.dirty && !state.busy) void loadSettings();
    });
  }

  function annotateStaticText() {
    const labels = [
      ['.member-payment-eyebrow', 'memberPayment.eyebrow'],
      ['#memberPaymentMethodsTitle', 'memberPayment.title'],
      ['.member-payment-page-heading > p', 'memberPayment.description'],
      ['#memberPaymentMethodsStatus', 'memberPayment.status.loadingSettings'],
      ['#memberPaymentEditorTitle', 'memberPayment.methods.title'],
      ['.member-payment-section-head p', 'memberPayment.methods.description'],
      ['#memberPaymentMethodAdd', 'memberPayment.methods.add'],
      ['#memberPaymentMethodsSave', 'memberPayment.action.saveDraft'],
      ['#memberPaymentMethodsPublish', 'memberPayment.action.publish']
    ];
    labels.forEach(([selector, key]) => {
      const element = page.querySelector(selector);
      if (element) element.dataset.i18n = key;
    });
    window.TopGymI18n?.apply?.(page);
    window.TopGymI18n?.apply?.(dialog());
  }

  bind();
  annotateStaticText();
  window.addEventListener('topgym:localechange', () => {
    window.TopGymI18n?.apply?.(page);
    window.TopGymI18n?.apply?.(dialog());
    renderMethods();
    if (dialog()?.open) {
      const type = $('memberPaymentType').value;
      renderTypeOptions(type);
      updateBrandPreview();
    }
    updateSummary();
  });
  window.topGymMemberPaymentMethodsEditor = Object.freeze({ confirmLeave, reload: loadSettings });
  if (window.topGymAuthReady) void window.topGymAuthReady.then(loadSettings).catch(() => null);
})();
