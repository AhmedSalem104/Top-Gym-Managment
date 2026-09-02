(() => {
    if (window.__topGymBarPosLoaded) return;
    window.__topGymBarPosLoaded = true;

    const $ = (id) => document.getElementById(id);
    const api = window.topGymApi;
    const state = { locations: [], menu: [], cart: [], locationId: null, branchId: null, shift: null, checkoutKey: null, loaded: false };
    const can = (permission) => window.topGymAuth?.isOwner?.() || window.topGymAuth?.hasPermission?.(permission);
    const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[character]));
    const money = (value) => `${Number(value || 0).toLocaleString('ar-EG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ج.م`;
    const notify = (message, isError = false) => {
        if (window.showToast) window.showToast(message, isError);
        else if (isError) console.error(message);
    };

    function selectedBranchId() {
        try {
            const value = sessionStorage.getItem('logicfit.branchId');
            return value && /^\d+$/.test(value) ? Number(value) : null;
        } catch (_) { return null; }
    }

    async function resolveBranch() {
        const requested = selectedBranchId();
        const data = await api.get('/api/branches');
        const branches = (data.branches || []).filter((branch) => branch.status === 'active');
        const branch = branches.find((item) => item.id === requested) || branches.find((item) => item.isMain) || branches[0];
        if (!branch) throw new Error('لا يوجد فرع نشط لتشغيل Bar.');
        state.branchId = Number(branch.id);
        return branch;
    }

    function setStatus(message, type = '') {
        const element = $('barPosStatus');
        if (!element) return;
        element.textContent = message;
        element.dataset.status = type;
    }

    function renderCart() {
        const lines = $('barPosLines');
        const total = state.cart.reduce((sum, line) => sum + line.price * line.quantity, 0);
        if ($('barPosTotal')) $('barPosTotal').textContent = money(total);
        if ($('barPosCheckout')) $('barPosCheckout').disabled = !state.cart.length || !state.shift || !can('bar.sell');
        if (!lines) return;
        lines.innerHTML = state.cart.length ? state.cart.map((line, index) => `<div class="bar-pos-line"><div><strong>${esc(line.name)}</strong><small>${esc(line.variantName)} · ${money(line.price)}</small></div><div class="bar-pos-line-actions"><button type="button" data-bar-decrease="${index}" aria-label="تقليل الكمية">−</button><b>${line.quantity}</b><button type="button" data-bar-increase="${index}" aria-label="زيادة الكمية">+</button></div></div>`).join('') : '<div class="empty">أضف صنفًا إلى الطلب.</div>';
    }

    function renderMenu() {
        const search = String($('barPosSearch')?.value || '').trim().toLowerCase();
        const items = state.menu.filter((item) => !search || [item.name, item.variantName, item.sku].some((value) => String(value || '').toLowerCase().includes(search)));
        const menu = $('barPosMenu');
        if (!menu) return;
        menu.innerHTML = items.length ? items.map((item) => `<button type="button" class="bar-pos-item${item.available ? '' : ' is-unavailable'}" data-bar-item="${esc(item.variantId)}" ${item.available ? '' : 'disabled'}><span class="bar-pos-item-icon" aria-hidden="true">${item.recipeId ? '◒' : '●'}</span><span class="bar-pos-item-copy"><strong>${esc(item.name)}</strong><small>${esc(item.variantName)}${item.recipeId ? ' · وصفة' : ''}</small></span><b>${money(item.price)}</b>${item.available ? '' : '<em>غير متاح</em>'}</button>`).join('') : '<div class="empty">لا توجد أصناف Bar متاحة في هذا الموقع.</div>';
    }

    async function loadLocations() {
        const branch = await resolveBranch();
        const data = await api.get(`/api/commerce/stock-locations?branchId=${encodeURIComponent(branch.id)}`);
        state.locations = (data.locations || []).filter((location) => location.type === 'bar' && location.status === 'active');
        const select = $('barPosLocation');
        if (!select) return;
        select.innerHTML = state.locations.map((location) => `<option value="${esc(location.id)}">${esc(location.name)}</option>`).join('');
        state.locationId = state.locations[0]?.id || null;
        if (!state.locationId) {
            setStatus('فعّل Bar وأنشئ موقع بيع لهذا الفرع من إعدادات الفروع.', 'warning');
            state.menu = [];
            renderMenu();
            renderCart();
            return;
        }
        await loadMenu();
    }

    async function loadMenu() {
        if (!state.locationId) return;
        const data = await api.get(`/api/bar/menu?locationId=${encodeURIComponent(state.locationId)}`);
        state.menu = data.items || [];
        state.shift = await api.get(`/api/bar/shifts/branch/${encodeURIComponent(state.branchId)}/open`);
        setStatus(state.shift ? `الوردية مفتوحة · ${state.shift.locationId === Number(state.locationId) ? 'موقع البيع الحالي' : 'تحقق من موقع الوردية'}` : 'لا توجد وردية مفتوحة. افتح وردية قبل التحصيل.', state.shift ? 'ready' : 'warning');
        renderMenu();
        renderCart();
    }

    async function openShift() {
        if (!can('bar.shifts.manage') || !state.locationId) return;
        const button = $('barPosOpenShift');
        if (button) button.disabled = true;
        try {
            state.shift = (await api.post('/api/bar/shifts', { locationId: Number(state.locationId), openingCash: Number($('barPosOpeningCash')?.value || 0) })).shift;
            setStatus('تم فتح وردية Bar. يمكنك بدء البيع الآن.', 'ready');
            renderCart();
        } catch (error) { notify(error.message || 'تعذر فتح الوردية.', true); }
        finally { if (button) button.disabled = false; }
    }

    function addItem(variantId) {
        const item = state.menu.find((candidate) => Number(candidate.variantId) === Number(variantId));
        if (!item?.available || !can('bar.sell')) return;
        const existing = state.cart.find((line) => line.variantId === item.variantId);
        if (existing) existing.quantity += 1;
        else state.cart.push({ variantId: Number(item.variantId), recipeId: item.recipeId ? Number(item.recipeId) : null, name: item.name, variantName: item.variantName, price: Number(item.price || 0), quantity: 1 });
        state.checkoutKey = state.checkoutKey || (window.crypto?.randomUUID?.() || `bar-${Date.now()}-${Math.random()}`);
        renderCart();
    }

    function changeQuantity(index, delta) {
        const line = state.cart[index];
        if (!line) return;
        line.quantity += delta;
        if (line.quantity <= 0) state.cart.splice(index, 1);
        if (!state.cart.length) state.checkoutKey = null;
        renderCart();
    }

    async function checkout() {
        if (!state.cart.length || !state.shift || !can('bar.sell')) return;
        const total = state.cart.reduce((sum, line) => sum + line.price * line.quantity, 0);
        const button = $('barPosCheckout');
        if (button) button.disabled = true;
        try {
            await api.post('/api/bar/sales', {
                locationId: Number(state.locationId),
                shiftId: Number(state.shift.id),
                memberId: $('barPosMemberId')?.value ? Number($('barPosMemberId').value) : undefined,
                items: state.cart.map((line) => ({ variantId: line.variantId, recipeId: line.recipeId || undefined, quantity: line.quantity })),
                paidAmount: Math.round(total * 100) / 100,
                paymentMethod: $('barPosPayment')?.value || 'cash',
                idempotencyKey: state.checkoutKey || (window.crypto?.randomUUID?.() || `bar-${Date.now()}`)
            });
            notify('تم تحصيل طلب Bar بنجاح.');
            state.cart = [];
            state.checkoutKey = null;
            if ($('barPosMemberId')) $('barPosMemberId').value = '';
            await loadMenu();
        } catch (error) { notify(error.message || 'تعذر تحصيل طلب Bar.', true); }
        finally { renderCart(); }
    }

    async function load() {
        if (!can('bar.read') || window.topGymAuth?.getUser?.()?.tenantType !== 'gym') return;
        try {
            await loadLocations();
            state.loaded = true;
        } catch (error) { setStatus(error.message || 'تعذر تحميل تشغيل Bar.', 'error'); }
    }

    function bind() {
        const tab = document.querySelector('[data-store-view="bar"]');
        if (!tab || !api) return;
        tab.hidden = !can('bar.read') || window.topGymAuth?.getUser?.()?.tenantType !== 'gym';
        tab.addEventListener('click', (event) => {
            event.preventDefault();
            document.querySelectorAll('[data-store-view-panel]').forEach((panel) => { panel.hidden = panel.dataset.storeViewPanel !== 'bar'; });
            document.querySelectorAll('.store-subnav-button').forEach((button) => { const active = button === tab; button.classList.toggle('is-active', active); button.setAttribute('aria-selected', String(active)); });
            if (!state.loaded) void load();
        });
        $('barPosLocation')?.addEventListener('change', (event) => { state.locationId = Number(event.currentTarget.value) || null; void loadMenu(); });
        $('barPosSearch')?.addEventListener('input', renderMenu);
        $('barPosRefresh')?.addEventListener('click', () => void loadLocations());
        $('barPosOpenShift')?.addEventListener('click', () => void openShift());
        $('barPosCheckout')?.addEventListener('click', () => void checkout());
        $('barPosClear')?.addEventListener('click', () => { state.cart = []; state.checkoutKey = null; renderCart(); });
        $('barPosMenu')?.addEventListener('click', (event) => { const button = event.target.closest('[data-bar-item]'); if (button) addItem(button.dataset.barItem); });
        $('barPosLines')?.addEventListener('click', (event) => {
            const increase = event.target.closest('[data-bar-increase]');
            const decrease = event.target.closest('[data-bar-decrease]');
            if (increase) changeQuantity(Number(increase.dataset.barIncrease), 1);
            if (decrease) changeQuantity(Number(decrease.dataset.barDecrease), -1);
        });
        window.addEventListener('topgym:branch-context-changed', () => { state.loaded = false; state.cart = []; state.shift = null; void load(); });
        void (window.topGymAuthReady?.then(load) || load());
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bind, { once: true });
    else bind();
})();
