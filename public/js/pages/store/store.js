(() => {
    if (window.__topGymStoreLoaded) return;
    window.__topGymStoreLoaded = true;

    const $ = (id) => document.getElementById(id);
    const state = {
        categories: [],
        products: [],
        suppliers: [],
        expenses: [],
        cart: [],
        customer: null,
        activeView: 'pos',
        loaded: false,
        loading: false
    };

    const api = window.topGymApi;
    const i18n = window.TopGymI18n;
    const tr = (key, params) => i18n?.t?.(`store.${key}`, params) || key;
    const fullTranslationKey = (key) => key.startsWith('store.') ? key : `store.${key}`;
    const localizedMarkup = (key, params = {}) => {
        const fullKey = fullTranslationKey(key);
        const countAttribute = Object.hasOwn(params, 'count') ? ` data-i18n-param-count="${esc(params.count)}"` : '';
        return `<span data-i18n="${esc(fullKey)}"${countAttribute}>${esc(tr(key, params))}</span>`;
    };
    const localizedValueMarkup = (kind, value, currency = 'EGP') => `<span data-i18n-format="${kind}" data-i18n-value="${esc(value)}"${kind === 'currency' ? ` data-i18n-currency="${esc(currency)}"` : ''}>${esc(i18n?.format?.(kind, value, kind === 'currency' ? { currency } : {}) ?? String(value ?? ''))}</span>`;
    const moneyMarkup = (value) => localizedValueMarkup('currency', value);
    const numberMarkup = (value) => localizedValueMarkup('number', Number(value || 0));
    const dateMarkup = (value) => value ? localizedValueMarkup('date', value) : '—';
    const setLocalizedValue = (element, kind, value, currency = 'EGP') => {
        if (!element) return;
        element.dataset.i18nFormat = kind;
        element.dataset.i18nValue = String(value ?? '');
        if (kind === 'currency') element.dataset.i18nCurrency = currency;
        i18n?.apply?.(element);
    };
    const can = (permission) => window.topGymAuth?.isOwner?.() || window.topGymAuth?.hasPermission?.(permission);
    const canCreateSale = () => Boolean(can('store.sales.create'));
    const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[character]));
    const displayPhone = (value, iso = '') => window.LogicFitPhoneInputs?.formatForDisplay?.(value, iso) || String(value || '');
    const money = (value) => i18n?.format?.('currency', Number(value || 0), { currency: 'EGP' }) ?? `${Number(value || 0).toFixed(2)} EGP`;
    const paymentMarkup = (value) => {
        const keys = { cash: 'cash', card: 'card', transfer: 'transfer', wallet: 'wallet', other: 'other' };
        return Object.hasOwn(keys, value) ? localizedMarkup(`pos.${keys[value]}`) : esc(String(value ?? ''));
    };
    const statusMarkup = (value) => {
        const keyByValue = { received: 'store.status.received', completed: 'store.status.completed' };
        return Object.hasOwn(keyByValue, value) ? localizedMarkup(keyByValue[value]) : esc(String(value ?? '—'));
    };
    const today = () => new Date().toISOString().slice(0, 10);
    let storeTranslationObserver = null;
    let storeLocaleListenerBound = false;

    function mountStoreSummary() {
        const summary = $('dashboardStoreSummary');
        const storeSection = $('storeSection');
        const subnav = storeSection?.querySelector('.store-subnav');
        if (summary && storeSection && subnav && summary.parentElement !== storeSection) {
            summary.classList.add('store-only-summary');
            storeSection.insertBefore(summary, subnav);
        }
    }
    const notify = (message, type = 'success') => {
        if (window.showToast) window.showToast(message, type === 'error');
        else if (type === 'error') console.error(message);
    };

    function bindStoreTranslations() {
        const root = $('storeSection');
        if (!root || !i18n?.apply || !i18n?.annotateText) return;

        const placeholderKeys = {
            storePosSearch: 'store.pos.searchPlaceholder',
            storeCustomerSearch: 'store.pos.customerPlaceholder',
            storeSalePaid: 'store.pos.amountPlaceholder',
            storeExpenseCategory: 'store.expenses.categoryPlaceholder',
            barPosSearch: 'store.bar.searchPlaceholder',
            barPosMemberId: 'store.bar.memberNumber'
        };
        const translate = (target = root) => {
            i18n.annotateText(target, 'store.');
            const scope = target.nodeType === Node.ELEMENT_NODE ? target : root;
            if (scope === root || root.contains(scope)) {
                const pageLabels = [
                    [$('storeTitle'), 'store.page.title'],
                    [root.querySelector('.store-page-heading p'), 'store.page.description'],
                    [$('storeRefreshButton'), 'store.page.refresh']
                ];
                pageLabels.forEach(([element, key]) => {
                    if (element) element.dataset.i18n = key;
                });
                root.dataset.i18nAriaLabel = 'store.page.navigation';
                scope.querySelectorAll?.('.store-subnav-button[data-store-view]').forEach((button) => {
                    const label = button.querySelector('.store-tab-label');
                    if (label) label.dataset.i18n = `store.tabs.${button.dataset.storeView}`;
                });
                Object.entries(placeholderKeys).forEach(([id, key]) => {
                    const field = $(id);
                    if (field && (field === scope || scope.contains?.(field))) field.dataset.i18nPlaceholder = key;
                });
            }
            i18n.apply(target);
        };

        translate();
        if (!storeTranslationObserver && typeof MutationObserver === 'function') {
            storeTranslationObserver = new MutationObserver((records) => {
                records.forEach((record) => record.addedNodes.forEach((node) => {
                    if (node.nodeType === Node.ELEMENT_NODE) translate(node);
                    else if (node.nodeType === Node.TEXT_NODE && node.parentElement) translate(node.parentElement);
                }));
            });
            storeTranslationObserver.observe(root, { childList: true, subtree: true });
        }
        if (!storeLocaleListenerBound) {
            window.addEventListener('topgym:localechange', () => translate());
            storeLocaleListenerBound = true;
        }
    }

    function queryRange() {
        const to = today();
        const fromDate = new Date();
        fromDate.setDate(1);
        return { from: fromDate.toISOString().slice(0, 10), to };
    }

    function flattenVariants() {
        return state.products.flatMap((product) => (product.variants || []).filter((variant) => variant.active !== false).map((variant) => ({
            ...variant,
            productId: product.id,
            productName: product.nameAr,
            categoryName: product.categoryName,
            stock: product.stock
        })));
    }

    function renderProductCatalog() {
        const search = String($('storePosSearch')?.value || '').trim().toLowerCase();
        const variants = flattenVariants().filter((item) => !search || [item.productName, item.variantName, item.sku, item.barcode].some((value) => String(value || '').toLowerCase().includes(search)));
        const salesAllowed = canCreateSale();
        $('storeProductCatalog').innerHTML = variants.length ? variants.map((item) => `<button class="store-product-card" type="button" data-store-add-variant="${esc(item.id)}"${salesAllowed ? '' : ' disabled'} aria-disabled="${String(!salesAllowed)}"><span><strong>${esc(item.productName)}</strong><small>${esc(item.variantName)} · ${esc(item.sku)}</small></span><span class="store-product-price">${localizedValueMarkup('currency', item.discountPrice ?? item.sellingPrice)}</span></button>`).join('') : '<div class="empty">لا توجد منتجات مطابقة للبحث.</div>';
    }

    function cartTotals() {
        const subtotal = state.cart.reduce((sum, line) => sum + line.quantity * line.unitPrice, 0);
        const discount = Math.max(0, Number($('storeSaleDiscount')?.value || 0));
        const tax = Math.max(0, Number($('storeSaleTax')?.value || 0));
        return { subtotal, discount, tax, total: Math.max(0, subtotal - discount + tax) };
    }

    function renderCart() {
        const totals = cartTotals();
        $('storeCartMeta').innerHTML = state.cart.length ? localizedMarkup('common.itemCount', { count: state.cart.length }) : localizedMarkup('pos.noProductsAdded');
        $('storeCartLines').innerHTML = state.cart.length ? state.cart.map((line) => `<div class="store-cart-line" data-store-cart-line="${esc(line.variantId)}"><div><strong>${esc(line.productName)}</strong><small>${esc(line.variantName)} · ${localizedValueMarkup('currency', line.unitPrice)}</small></div><div class="store-cart-quantity"><button type="button" data-store-cart-minus="${esc(line.variantId)}" aria-label="تقليل الكمية">−</button><input type="number" min="1" step="1" value="${esc(line.quantity)}" data-store-cart-quantity="${esc(line.variantId)}" aria-label="كمية ${esc(line.productName)}"><button type="button" data-store-cart-plus="${esc(line.variantId)}" aria-label="زيادة الكمية">+</button></div><div><strong>${localizedValueMarkup('currency', line.quantity * line.unitPrice)}</strong><button class="store-cart-remove" type="button" data-store-cart-remove="${esc(line.variantId)}" aria-label="حذف ${esc(line.productName)}">×</button></div></div>`).join('') : '<div class="empty">أضف منتجًا إلى السلة للبدء.</div>';
        setLocalizedValue($('storeCartTotal'), 'currency', totals.total);
        const paid = $('storeSalePaid');
        if (paid && !paid.value) paid.placeholder = totals.total.toFixed(2);
        const submit = $('storeCompleteSale');
        if (submit) submit.disabled = !state.cart.length || !canCreateSale();
    }

    function syncSalesPermissionUi() {
        const allowed = canCreateSale();
        const picker = document.querySelector('.store-customer-picker');
        const customerSearch = $('storeCustomerSearch');
        const results = $('storeCustomerResults');
        const checkout = $('storeCheckoutForm');
        const clearCart = $('storeCartClear');

        if (picker) {
            picker.hidden = !allowed;
            picker.setAttribute('aria-hidden', String(!allowed));
        }
        if (customerSearch) customerSearch.disabled = !allowed;
        if (!allowed && results) {
            results.hidden = true;
            results.innerHTML = '';
        }
        if (checkout) {
            checkout.classList.toggle('permission-restricted', !allowed);
            checkout.querySelectorAll('input, select, textarea').forEach((control) => { control.disabled = !allowed; });
        }
        if (clearCart) clearCart.disabled = !allowed;
        document.querySelectorAll('[data-store-add-variant]').forEach((button) => {
            button.disabled = !allowed;
            button.setAttribute('aria-disabled', String(!allowed));
        });
        const submit = $('storeCompleteSale');
        if (submit) submit.disabled = !allowed || !state.cart.length;
    }

    function selectCustomer(customer) {
        if (!canCreateSale()) return;
        state.customer = customer;
        $('storeCustomerResults').hidden = true;
        $('storeCustomerSearch').value = '';
        $('storeSelectedCustomer').hidden = false;
        $('storeSelectedCustomer').innerHTML = `<span><strong>${esc(customer.name)}</strong><br><small dir="ltr">${esc(displayPhone(customer.phone, customer.phoneCountry) || 'بدون هاتف')}</small></span><button type="button" class="store-cart-remove" data-store-clear-customer aria-label="إزالة العميل">×</button>`;
    }

    function renderTable(target, headers, rows, empty = 'لا توجد بيانات.') {
        const element = $(target);
        if (!element) return;
        element.innerHTML = rows.length ? `<table class="store-table"><thead><tr>${headers.map((header) => `<th>${header}</th>`).join('')}</tr></thead><tbody>${rows.join('')}</tbody></table>` : `<div class="empty">${empty}</div>`;
    }

    async function loadBootstrap() {
        if (state.loading) return;
        state.loading = true;
        try {
            const data = await api.request('/api/store/bootstrap');
            state.categories = data.categories || [];
            state.products = data.products?.items || [];
            state.suppliers = data.suppliers || [];
            state.loaded = true;
            renderProductCatalog();
            renderCategoryOptions();
            renderSupplierOptions();
            renderCart();
            syncSalesPermissionUi();
            await loadDashboard();
            await loadView(state.activeView);
        } catch (error) {
            notify(error.message || 'تعذر تحميل بيانات المتجر.', 'error');
        } finally {
            state.loading = false;
        }
    }

    async function loadDashboard() {
        const range = queryRange();
        const data = await api.request(`/api/store/dashboard?${new URLSearchParams(range)}`);
        renderDashboardStore(data);
    }

    function renderDashboardStore(data) {
        const summary = data.summary || {};
        const profit = data.profit || {};
        const summaryElement = $('dashboardStoreSummary');
        if (!summaryElement) return;
        summaryElement.hidden = !can('store.view');
        const todaySales = data.today?.revenue ?? data.todaySales ?? 0;
        setLocalizedValue($('dashboardStoreTodaySales'), 'currency', todaySales);
        setLocalizedValue($('dashboardStoreRevenue'), 'currency', summary.revenue);
        setLocalizedValue($('dashboardStoreLowStock'), 'number', (data.alerts?.lowStock || []).length);
        setLocalizedValue($('dashboardStoreExpenses'), 'currency', profit.expenses);
        setLocalizedValue($('dashboardStoreNetProfit'), 'currency', profit.netProfit);
        summaryElement.querySelectorAll('[data-store-profit-only]').forEach((element) => { element.hidden = !can('store.profit.view'); });
    }

    function renderCategoryOptions() {
        const select = $('storeProductCategory');
        if (select) select.innerHTML = state.categories.filter((item) => item.active !== false).map((item) => `<option value="${esc(item.id)}">${esc(item.nameAr)}</option>`).join('');
    }

    function renderSupplierOptions() {
        const select = $('storePurchaseSupplier');
        if (select) select.innerHTML = `<option value="">بدون مورد</option>${state.suppliers.filter((item) => item.active !== false).map((item) => `<option value="${esc(item.id)}">${esc(item.name)}</option>`).join('')}`;
    }

    async function loadProducts() {
        const data = await api.request('/api/store/products?page=1&pageSize=100');
        state.products = data.items || [];
        renderProductCatalog();
        renderPurchaseVariants();
        const rows = state.products.map((product) => `<tr><td><strong>${esc(product.nameAr)}</strong><small>${localizedMarkup('products.variants', { count: product.variants?.length || 0 })}</small></td><td dir="ltr">${esc(product.sku)}</td><td>${esc(product.categoryName || '—')}</td><td>${numberMarkup(product.stock)}</td><td>${product.active ? `<span class="store-status">${localizedMarkup('products.statusActive')}</span>` : `<span class="store-status danger">${localizedMarkup('products.statusInactive')}</span>`}</td><td>${can('store.products.manage') ? `<div class="store-row-actions">${product.active ? `<button class="btn btn-light btn-small" type="button" data-store-edit-product="${esc(product.id)}">${localizedMarkup('products.edit')}</button><button class="btn btn-light btn-small" type="button" data-store-deactivate-product="${esc(product.id)}">${localizedMarkup('products.deactivate')}</button>` : '—'}</div>` : '—'}</td></tr>`);
        renderTable('storeProductsTable', ['المنتج', 'SKU', 'التصنيف', 'المخزون', 'الحالة', 'الإجراء'], rows, 'لا توجد منتجات بعد.');
    }

    function renderPurchaseVariants() {
        const select = $('storePurchaseVariant');
        if (!select) return;
        select.innerHTML = flattenVariants().map((item) => `<option value="${esc(item.id)}">${esc(item.productName)} · ${esc(item.variantName)} · ${esc(item.sku)}</option>`).join('');
    }

    async function loadInventory() {
        const data = await api.request('/api/store/inventory');
        const rows = (data.items || []).map((item) => `<tr><td>${esc(item.productName)}</td><td>${esc(item.variantName)}</td><td dir="ltr">${esc(item.sku)}</td><td>${numberMarkup(item.quantityOnHand)}</td><td>${numberMarkup(item.minimumStock)}</td><td>${dateMarkup(item.nearestExpiry)}</td><td>${item.lowStock ? `<span class="store-status warning">${localizedMarkup('inventory.low')}</span>` : `<span class="store-status">${localizedMarkup('inventory.available')}</span>`}</td><td>${can('store.inventory.adjust') ? `<button class="btn btn-light btn-small" type="button" data-store-adjust="${esc(item.id)}">${localizedMarkup('inventory.adjust')}</button>` : '—'}</td></tr>`);
        renderTable('storeInventoryTable', ['المنتج', 'النسخة', 'SKU', 'الرصيد', 'الحد الأدنى', 'الصلاحية', 'الحالة', 'الإجراء'], rows, 'لا توجد حركات أو أصناف مخزنية بعد.');
    }

    async function loadPurchases() {
        const range = queryRange();
        const data = await api.request(`/api/store/purchases?${new URLSearchParams({ ...range, page: '1', pageSize: '100' })}`);
        const rows = (data.items || []).map((item) => `<tr><td>#${esc(item.id)}</td><td>${esc(item.invoiceNumber || '—')}</td><td>${item.supplierName ? esc(item.supplierName) : localizedMarkup('purchases.noneSupplier')}</td><td>${dateMarkup(item.purchaseDate)}</td><td>${moneyMarkup(item.totalAmount)}</td><td>${moneyMarkup(item.paidAmount)}</td><td>${moneyMarkup(item.remainingAmount)}</td><td><span class="store-status">${statusMarkup(item.status)}</span></td></tr>`);
        renderTable('storePurchasesTable', ['#', 'الفاتورة', 'المورد', 'التاريخ', 'الإجمالي', 'المدفوع', 'المتبقي', 'الحالة'], rows, 'لا توجد مشتريات في الفترة الحالية.');
    }

    async function loadSales() {
        const range = queryRange();
        const data = await api.request(`/api/store/sales?${new URLSearchParams({ ...range, page: '1', pageSize: '100' })}`);
        const rows = (data.items || []).map((item) => `<tr><td>${esc(item.saleNumber)}</td><td>${item.customerName ? esc(item.customerName) : localizedMarkup('sales.cashCustomer')}</td><td dir="ltr">${esc(item.customerPhone || '—')}</td><td>${dateMarkup(item.saleDate)}</td><td>${moneyMarkup(item.totalAmount)}</td><td>${moneyMarkup(item.paidAmount)}</td><td>${moneyMarkup(item.remainingAmount)}</td><td><span class="store-status">${statusMarkup(item.status)}</span></td></tr>`);
        renderTable('storeSalesTable', ['الفاتورة', 'العميل', 'الهاتف', 'التاريخ', 'الإجمالي', 'المدفوع', 'المتبقي', 'الحالة'], rows, 'لا توجد مبيعات في الفترة الحالية.');
    }

    async function loadSuppliers() {
        state.suppliers = await api.request('/api/store/suppliers');
        renderSupplierOptions();
        const rows = state.suppliers.map((item) => `<tr><td>${esc(item.name)}</td><td dir="ltr">${esc(displayPhone(item.phone, item.phoneCountry) || '—')}</td><td dir="ltr">${esc(item.email || '—')}</td><td>${item.active ? `<span class="store-status">${localizedMarkup('products.statusActive')}</span>` : `<span class="store-status danger">${localizedMarkup('products.statusInactive')}</span>`}</td><td>${can('store.suppliers.manage') ? `<button class="btn btn-light btn-small" type="button" data-store-edit-supplier="${esc(item.id)}">${localizedMarkup('products.edit')}</button>` : '—'}</td></tr>`);
        renderTable('storeSuppliersTable', ['المورد', 'الهاتف', 'البريد', 'الحالة', 'الإجراء'], rows, 'لا يوجد موردون بعد.');
    }

    async function loadExpenses() {
        const range = queryRange();
        const data = await api.request(`/api/store/expenses?${new URLSearchParams(range)}`);
        state.expenses = data.expenses || [];
        const rows = state.expenses.map((item) => `<tr><td>${esc(item.name)}</td><td>${esc(item.category || 'عام')}</td><td>${dateMarkup(item.expenseDate)}</td><td>${moneyMarkup(item.amount)}</td><td>${paymentMarkup(item.paymentMethod)}</td><td>${can('store.expenses.manage') ? `<div class="store-row-actions"><button class="btn btn-light btn-small" type="button" data-store-edit-expense="${esc(item.id)}">${localizedMarkup('products.edit')}</button><button class="btn btn-light btn-small" type="button" data-store-delete-expense="${esc(item.id)}">${localizedMarkup('common.cancel')}</button></div>` : '—'}</td></tr>`);
        renderTable('storeExpensesTable', ['المصروف', 'التصنيف', 'التاريخ', 'المبلغ', 'طريقة الدفع', 'الإجراء'], rows, 'لا توجد مصروفات للمتجر في الفترة الحالية.');
    }

    async function loadReports() {
        const from = $('storeReportFrom').value || queryRange().from;
        const to = $('storeReportTo').value || queryRange().to;
        const data = await api.request(`/api/store/reports?${new URLSearchParams({ from, to })}`);
        const summary = data.summary || {};
        $('storeReportSummary').innerHTML = [['common.revenue', moneyMarkup(summary.revenue)], ['common.orders', numberMarkup(summary.orders)], ['common.refunds', moneyMarkup(summary.refunds)], ...(data.profit && can('store.profit.view') ? [['reports.cogs', moneyMarkup(data.profit.cogs)], ['reports.netProfit', moneyMarkup(data.profit.netProfit)]] : [])].map(([key, value]) => `<article><span>${localizedMarkup(key)}</span><strong>${value}</strong></article>`).join('');
        const mode = $('storeReportMode')?.value || 'products';
        const profitVisible = data.profit && can('store.profit.view');
        let headers = [];
        let rows = [];
        if (mode === 'categories') {
            headers = ['التصنيف', 'الكمية', 'الإيراد', ...(profitVisible ? ['التكلفة'] : [])];
            rows = (data.byCategory || []).map((item) => `<tr><td>${esc(item.name)}</td><td>${numberMarkup(item.quantity)}</td><td>${moneyMarkup(item.revenue)}</td>${profitVisible ? `<td>${moneyMarkup(item.cogs)}</td>` : ''}</tr>`);
        } else if (mode === 'customers') {
            headers = ['العميل', 'الهاتف', 'الفواتير', 'الإيراد'];
            rows = (data.byCustomer || []).map((item) => `<tr><td>${esc(item.name)}</td><td dir="ltr">${esc(displayPhone(item.phone, item.phoneCountry) || '—')}</td><td>${numberMarkup(item.orders)}</td><td>${moneyMarkup(item.revenue)}</td></tr>`);
        } else if (mode === 'payments') {
            headers = ['طريقة الدفع', 'الفواتير', 'القيمة'];
            rows = (data.paymentMethods || []).map((item) => `<tr><td>${paymentMarkup(item.method)}</td><td>${numberMarkup(item.orders)}</td><td>${moneyMarkup(item.amount)}</td></tr>`);
        } else if (mode === 'daily') {
            headers = ['اليوم', 'الفواتير', 'الإيراد'];
            rows = (data.dailySales || []).map((item) => `<tr><td>${dateMarkup(item.date)}</td><td>${numberMarkup(item.orders)}</td><td>${moneyMarkup(item.revenue)}</td></tr>`);
        } else if (mode === 'purchases') {
            headers = ['الفاتورة', 'المورد', 'التاريخ', 'الإجمالي', 'المدفوع', 'المتبقي'];
            rows = (data.purchases || []).map((item) => `<tr><td>${esc(item.invoiceNumber || `#${item.id}`)}</td><td>${item.supplierName ? esc(item.supplierName) : localizedMarkup('purchases.noneSupplier')}</td><td>${dateMarkup(item.purchaseDate)}</td><td>${moneyMarkup(item.totalAmount)}</td><td>${moneyMarkup(item.paidAmount)}</td><td>${moneyMarkup(item.remainingAmount)}</td></tr>`);
        } else if (mode === 'inventory') {
            headers = ['المنتج', 'النسخة', 'SKU', 'الرصيد', 'الحد الأدنى', 'الصلاحية', 'الحالة'];
            rows = (data.inventory || []).map((item) => `<tr><td>${esc(item.productName)}</td><td>${esc(item.variantName)}</td><td dir="ltr">${esc(item.sku)}</td><td>${numberMarkup(item.quantityOnHand)}</td><td>${numberMarkup(item.minimumStock)}</td><td>${dateMarkup(item.nearestExpiry)}</td><td>${item.lowStock ? `<span class="store-status warning">${localizedMarkup('inventory.low')}</span>` : `<span class="store-status">${localizedMarkup('inventory.available')}</span>`}</td></tr>`);
        } else if (mode === 'returns') {
            headers = ['المرتجع', 'الفاتورة', 'التاريخ', 'المبلغ', 'طريقة الاسترداد', 'السبب'];
            rows = (data.returns || []).map((item) => `<tr><td dir="ltr">${esc(item.returnNumber)}</td><td dir="ltr">${esc(item.saleNumber)}</td><td>${dateMarkup(item.createdAt)}</td><td>${moneyMarkup(item.refundAmount)}</td><td>${paymentMarkup(item.refundMethod)}</td><td>${esc(item.reason || '—')}</td></tr>`);
        } else if (mode === 'expenses') {
            headers = ['المصروف', 'التصنيف', 'التاريخ', 'المبلغ', 'طريقة الدفع'];
            rows = (data.expenses || []).map((item) => `<tr><td>${esc(item.name)}</td><td>${esc(item.category || 'عام')}</td><td>${dateMarkup(item.expenseDate)}</td><td>${moneyMarkup(item.amount)}</td><td>${paymentMarkup(item.paymentMethod)}</td></tr>`);
        } else {
            headers = ['المنتج', 'النسخة', 'SKU', 'الكمية', 'الإيراد', ...(profitVisible ? ['التكلفة'] : [])];
            rows = (data.bestSelling || []).map((item) => `<tr><td>${esc(item.productName)}</td><td>${esc(item.variantName)}</td><td dir="ltr">${esc(item.sku)}</td><td>${numberMarkup(item.quantity)}</td><td>${moneyMarkup(item.revenue)}</td>${profitVisible ? `<td>${moneyMarkup(item.cogs)}</td>` : ''}</tr>`);
        }
        renderTable('storeReportTable', headers, rows, mode === 'expenses' && !data.expenses ? 'لا تملك صلاحية عرض مصروفات المتجر.' : 'لا توجد نتائج في الفترة المحددة.');
    }

    async function loadView(view) {
        state.activeView = view;
        document.querySelectorAll('[data-store-view-panel]').forEach((panel) => { panel.hidden = panel.dataset.storeViewPanel !== view; });
        document.querySelectorAll('.store-subnav-button').forEach((button) => { const active = button.dataset.storeView === view; button.classList.toggle('is-active', active); button.setAttribute('aria-selected', String(active)); });
        if (!state.loaded) return;
        try {
            if (view === 'products') await loadProducts();
            if (view === 'inventory') await loadInventory();
            if (view === 'purchases') await loadPurchases();
            if (view === 'sales') await loadSales();
            if (view === 'suppliers') await loadSuppliers();
            if (view === 'expenses') await loadExpenses();
            if (view === 'reports') await loadReports();
        } catch (error) { notify(error.message || 'تعذر تحميل بيانات القسم.', 'error'); }
    }

    function addVariant(variantId) {
        if (!canCreateSale()) return;
        const item = flattenVariants().find((variant) => String(variant.id) === String(variantId));
        if (!item) return;
        const existing = state.cart.find((line) => String(line.variantId) === String(item.id));
        if (existing) existing.quantity += 1;
        else state.cart.push({ variantId: item.id, productName: item.productName, variantName: item.variantName, unitPrice: Number(item.discountPrice ?? item.sellingPrice), quantity: 1 });
        renderCart();
    }

    async function completeSale(event) {
        event.preventDefault();
        if (!canCreateSale()) {
            notify('لا تملك صلاحية إنشاء مبيعات المتجر.', 'error');
            return;
        }
        if (!state.cart.length) return;
        const totals = cartTotals();
        const payload = { memberId: state.customer?.type === 'member' ? state.customer.id : undefined, customerName: state.customer?.type === 'member' ? undefined : state.customer?.name, customerPhone: state.customer?.type === 'member' ? undefined : state.customer?.phone, items: state.cart.map((line) => ({ variantId: line.variantId, quantity: line.quantity })), discountAmount: totals.discount, taxAmount: totals.tax, paidAmount: $('storeSalePaid').value === '' ? totals.total : Number($('storeSalePaid').value), paymentMethod: $('storeSalePaymentMethod').value, notes: $('storeSaleNotes').value.trim() };
        const button = $('storeCompleteSale');
        button.disabled = true;
        try {
            const result = await api.post('/api/store/sales', payload);
            notify('تم تسجيل البيع بنجاح.');
            printReceipt(result.sale);
            state.cart = [];
            state.customer = null;
            $('storeSelectedCustomer').hidden = true;
            $('storeSalePaid').value = '';
            $('storeSaleDiscount').value = '0';
            $('storeSaleTax').value = '0';
            $('storeSaleNotes').value = '';
            renderCart();
            await loadDashboard();
        } catch (error) { notify(error.message || 'تعذر إتمام البيع.', 'error'); }
        finally { button.disabled = false; renderCart(); }
    }

    function printReceipt(sale) {
        if (!sale) return;
        const popup = window.open('', '_blank', 'width=420,height=680');
        if (!popup) return;
        const branding = window.topGymBranding?.get?.() || {};
        const brandName = branding.identity?.brandName || 'Logic Fit';
        const logo = branding.assets?.printLogo?.url || branding.assets?.primaryLogo?.url || '/assets/logic-fit-logo-horizontal.svg?v=1';
        const lines = (sale.items || []).map((item) => `<tr><td>${esc(item.productName)}<br><small>${esc(item.variantName)}</small></td><td>${esc(item.quantity)}</td><td>${money(item.lineTotal)}</td></tr>`).join('');
        const html = `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${esc(sale.saleNumber)} | ${esc(brandName)}</title></head><body><main class="print-sheet print-store-receipt"><header class="print-store-receipt-brand"><img src="${esc(logo)}" alt="${esc(brandName)}"><h1>${esc(brandName)}</h1><p>إيصال مبيعات: <bdi>${esc(sale.saleNumber)}</bdi></p></header><table class="print-store-receipt-table"><thead><tr><th>المنتج</th><th>الكمية</th><th>الإجمالي</th></tr></thead><tbody>${lines}</tbody></table><div class="print-store-receipt-total"><span>الإجمالي</span><strong>${money(sale.totalAmount)}</strong></div><p class="print-store-receipt-thanks">شكرًا لزيارتكم</p></main></body></html>`;
        Promise.resolve(window.topGymEnsureTab?.('print'))
            .then(() => {
                const printDocument = window.topGymPrint?.printDocument;
                if (!printDocument) throw new Error(tr('error.print'));
                return printDocument(popup, html);
            })
            .catch((error) => {
                popup.close();
                window.showToast?.(error.message || tr('error.print'), true, 'error');
            });
    }

    async function searchCustomer() {
        if (!canCreateSale()) {
            $('storeCustomerResults').hidden = true;
            return;
        }
        const term = $('storeCustomerSearch').value.trim();
        const results = $('storeCustomerResults');
        if (term.length < 2) { results.hidden = true; return; }
        try {
            const data = await api.request(`/api/store/customers/search?search=${encodeURIComponent(term)}`);
            results.innerHTML = (data.customers || []).map((customer) => `<button type="button" class="store-customer-result" data-store-customer="${esc(customer.id)}"><span><strong>${esc(customer.name)}</strong><br><small dir="ltr">${esc(displayPhone(customer.phone, customer.phoneCountry) || 'بدون هاتف')}</small></span><span>${esc(customer.membershipPlan || '')}</span></button>`).join('') || '<div class="empty">لا توجد نتائج.</div>';
            results.hidden = false;
            results._customers = data.customers || [];
        } catch (error) { notify(error.message || 'تعذر البحث عن العميل.', 'error'); }
    }

    async function saveProduct(event) {
        event.preventDefault();
        const productId = $('storeProductId').value;
        const payload = { categoryId: Number($('storeProductCategory').value), nameAr: $('storeProductName').value.trim(), sku: $('storeProductSku').value.trim(), barcode: $('storeProductBarcode').value.trim() || null, purchaseCost: Number($('storeProductCost').value || 0), sellingPrice: Number($('storeProductPrice').value || 0), minimumStock: Number($('storeProductMinStock').value || 0), trackInventory: $('storeProductTrackInventory').checked };
        try { if (productId) await api.put(`/api/store/products/${encodeURIComponent(productId)}`, payload); else await api.post('/api/store/products', payload); notify(productId ? 'تم تحديث المنتج.' : 'تم حفظ المنتج.'); $('storeProductFormCard').hidden = true; event.target.reset(); $('storeProductId').value = ''; $('storeProductTrackInventory').checked = true; await loadProducts(); } catch (error) { notify(error.message, 'error'); }
    }

    async function savePurchase(event) {
        event.preventDefault();
        const payload = { supplierId: $('storePurchaseSupplier').value || null, invoiceNumber: $('storePurchaseInvoice').value.trim() || null, purchaseDate: $('storePurchaseDate').value, items: [{ variantId: Number($('storePurchaseVariant').value), quantity: Number($('storePurchaseQuantity').value), unitCost: Number($('storePurchaseUnitCost').value) }], paidAmount: $('storePurchasePaid').value === '' ? undefined : Number($('storePurchasePaid').value), paymentMethod: $('storePurchasePayment').value };
        try { await api.post('/api/store/purchases', payload); notify('تم استلام فاتورة الشراء وتحديث المخزون.'); $('storePurchaseFormCard').hidden = true; event.target.reset(); await loadPurchases(); await loadDashboard(); } catch (error) { notify(error.message, 'error'); }
    }

    async function saveSupplier(event) {
        event.preventDefault();
        const supplierId = $('storeSupplierId').value;
        const phoneInput = $('storeSupplierPhone');
        const phoneValue = phoneInput.value.trim();
        const phonePayload = phoneValue ? window.LogicFitPhoneInputs?.getSubmissionPayload?.(phoneInput) : null;
        if (phoneValue && !phonePayload) {
            notify('رقم هاتف المورد غير صحيح.', 'error');
            phoneInput.focus();
            return;
        }
        const payload = { name: $('storeSupplierName').value.trim(), phone: phonePayload?.phone || null, phoneNational: phonePayload?.phoneNational || null, phoneCountry: phonePayload?.phoneCountry || '', email: $('storeSupplierEmail').value.trim() || null, address: $('storeSupplierAddress').value.trim() || null };
        try { if (supplierId) await api.put(`/api/store/suppliers/${encodeURIComponent(supplierId)}`, payload); else await api.post('/api/store/suppliers', payload); notify(supplierId ? 'تم تحديث المورد.' : 'تم حفظ المورد.'); $('storeSupplierFormCard').hidden = true; event.target.reset(); $('storeSupplierId').value = ''; await loadSuppliers(); } catch (error) { notify(error.message, 'error'); }
    }

    async function saveExpense(event) {
        event.preventDefault();
        const expenseId = $('storeExpenseId').value;
        const payload = { name: $('storeExpenseName').value.trim(), category: $('storeExpenseCategory').value.trim() || null, amount: Number($('storeExpenseAmount').value), expenseDate: $('storeExpenseDate').value, paymentMethod: $('storeExpensePayment').value, notes: $('storeExpenseNotes').value.trim() || null };
        try { if (expenseId) await api.put(`/api/store/expenses/${encodeURIComponent(expenseId)}`, payload); else await api.post('/api/store/expenses', payload); notify(expenseId ? 'تم تحديث مصروف المتجر.' : 'تم حفظ مصروف المتجر.'); $('storeExpenseFormCard').hidden = true; event.target.reset(); $('storeExpenseId').value = ''; $('storeExpenseDate').value = today(); await loadExpenses(); await loadDashboard(); } catch (error) { notify(error.message, 'error'); }
    }

    function openProductEditor(product) {
        if (!product) return;
        $('storeProductId').value = product.id;
        $('storeProductName').value = product.nameAr || '';
        $('storeProductCategory').value = product.categoryId || '';
        $('storeProductSku').value = product.sku || '';
        $('storeProductBarcode').value = product.barcode || '';
        $('storeProductCost').value = product.variants?.[0]?.purchaseCost ?? 0;
        $('storeProductPrice').value = product.variants?.[0]?.sellingPrice ?? 0;
        $('storeProductMinStock').value = product.minimumStock ?? 0;
        $('storeProductTrackInventory').checked = product.trackInventory !== false;
        $('storeProductFormCard').hidden = false;
    }

    function openSupplierEditor(supplier) {
        if (!supplier) return;
        $('storeSupplierId').value = supplier.id;
        $('storeSupplierName').value = supplier.name || '';
        window.LogicFitPhoneInputs?.setValue?.($('storeSupplierPhone'), supplier.phone || '', supplier.phoneCountry || '');
        $('storeSupplierEmail').value = supplier.email || '';
        $('storeSupplierAddress').value = supplier.address || '';
        $('storeSupplierFormCard').hidden = false;
    }

    function openExpenseEditor(expense) {
        if (!expense) return;
        $('storeExpenseId').value = expense.id;
        $('storeExpenseName').value = expense.name || '';
        $('storeExpenseCategory').value = expense.category || '';
        $('storeExpenseAmount').value = expense.amount ?? '';
        $('storeExpenseDate').value = expense.expenseDate || today();
        $('storeExpensePayment').value = expense.paymentMethod || 'cash';
        $('storeExpenseNotes').value = expense.notes || '';
        $('storeExpenseFormCard').hidden = false;
    }

    function bind() {
        mountStoreSummary();
        bindStoreTranslations();
        const permissionControls = {
            storeAddProduct: 'store.products.manage',
            storeAddPurchase: 'store.purchases.manage',
            storeAddSupplier: 'store.suppliers.manage',
            storeAddExpense: 'store.expenses.manage'
        };
        const storeViewIds = {
            pos: 'storePosView',
            bar: 'barPosView',
            products: 'storeProductsView',
            inventory: 'storeInventoryView',
            purchases: 'storePurchasesView',
            sales: 'storeSalesView',
            suppliers: 'storeSuppliersView',
            expenses: 'storeExpensesView',
            reports: 'storeReportsView'
        };
        document.querySelectorAll('[data-store-view-panel]').forEach((panel) => {
            const id = storeViewIds[panel.dataset.storeViewPanel];
            if (!id) return;
            panel.id = id;
            panel.setAttribute('role', 'tabpanel');
        });
        document.querySelectorAll('.store-subnav-button').forEach((button) => {
            const id = storeViewIds[button.dataset.storeView];
            if (id) button.setAttribute('aria-controls', id);
        });
        Object.entries(permissionControls).forEach(([id, permission]) => { if ($(id)) $(id).hidden = !can(permission); });
        document.querySelectorAll('[data-store-view="reports"]').forEach((button) => { button.hidden = !can('store.reports.view'); });
        document.querySelectorAll('[data-store-view="purchases"]').forEach((button) => { button.hidden = !can('store.purchases.manage'); });
        document.querySelectorAll('[data-store-view="suppliers"]').forEach((button) => { button.hidden = !can('store.suppliers.manage'); });
        document.querySelectorAll('[data-store-view="expenses"]').forEach((button) => { button.hidden = !can('store.expenses.manage'); });
        document.querySelectorAll('[data-store-profit-only]').forEach((element) => { element.hidden = !can('store.profit.view'); });
        syncSalesPermissionUi();
        document.querySelectorAll('[data-store-view]').forEach((button) => button.addEventListener('click', () => void loadView(button.dataset.storeView)));
        $('storeRefreshButton')?.addEventListener('click', () => void loadBootstrap());
        $('storePosSearch')?.addEventListener('input', renderProductCatalog);
        $('storeCartClear')?.addEventListener('click', () => { state.cart = []; renderCart(); });
        $('storeCustomerSearch')?.addEventListener('input', () => void searchCustomer());
        $('storeCheckoutForm')?.addEventListener('submit', completeSale);
        ['storeSaleDiscount', 'storeSaleTax'].forEach((id) => $(id)?.addEventListener('input', renderCart));
        $('storeProductForm')?.addEventListener('submit', saveProduct);
        $('storePurchaseForm')?.addEventListener('submit', savePurchase);
        $('storeSupplierForm')?.addEventListener('submit', saveSupplier);
        $('storeExpenseForm')?.addEventListener('submit', saveExpense);
        $('storeAddProduct')?.addEventListener('click', () => { $('storeProductFormCard').hidden = false; $('storeProductForm').reset(); $('storeProductId').value = ''; $('storeProductTrackInventory').checked = true; });
        $('storeProductCancel')?.addEventListener('click', () => { $('storeProductFormCard').hidden = true; });
        $('storeAddPurchase')?.addEventListener('click', () => { $('storePurchaseFormCard').hidden = false; $('storePurchaseDate').value = today(); renderPurchaseVariants(); });
        $('storePurchaseCancel')?.addEventListener('click', () => { $('storePurchaseFormCard').hidden = true; });
        $('storeAddSupplier')?.addEventListener('click', () => { $('storeSupplierFormCard').hidden = false; $('storeSupplierForm').reset(); $('storeSupplierId').value = ''; });
        $('storeSupplierCancel')?.addEventListener('click', () => { $('storeSupplierFormCard').hidden = true; });
        $('storeAddExpense')?.addEventListener('click', () => { $('storeExpenseFormCard').hidden = false; $('storeExpenseForm').reset(); $('storeExpenseId').value = ''; $('storeExpenseDate').value = today(); });
        $('storeExpenseCancel')?.addEventListener('click', () => { $('storeExpenseFormCard').hidden = true; });
        $('storeInventoryRefresh')?.addEventListener('click', () => void loadInventory());
        $('storeSalesRefresh')?.addEventListener('click', () => void loadSales());
        $('storeReportRun')?.addEventListener('click', () => void loadReports());
        $('storeReportMode')?.addEventListener('change', () => void loadReports());
        document.addEventListener('click', async (event) => {
            const add = event.target.closest('[data-store-add-variant]');
            if (add) addVariant(add.dataset.storeAddVariant);
            const plus = event.target.closest('[data-store-cart-plus]');
            if (plus) { const line = state.cart.find((item) => String(item.variantId) === plus.dataset.storeCartPlus); if (line) line.quantity += 1; renderCart(); }
            const minus = event.target.closest('[data-store-cart-minus]');
            if (minus) { const line = state.cart.find((item) => String(item.variantId) === minus.dataset.storeCartMinus); if (line) line.quantity = Math.max(1, line.quantity - 1); renderCart(); }
            const remove = event.target.closest('[data-store-cart-remove]');
            if (remove) { state.cart = state.cart.filter((item) => String(item.variantId) !== remove.dataset.storeCartRemove); renderCart(); }
            const clearCustomer = event.target.closest('[data-store-clear-customer]');
            if (clearCustomer) { state.customer = null; $('storeSelectedCustomer').hidden = true; }
            const customerButton = event.target.closest('[data-store-customer]');
            if (customerButton) { const customer = customerButton.parentElement._customers?.find((item) => String(item.id) === customerButton.dataset.storeCustomer); if (customer) selectCustomer(customer); }
            const deactivate = event.target.closest('[data-store-deactivate-product]');
            if (deactivate && window.confirm('هل تريد تعطيل هذا المنتج؟')) { try { await api.del(`/api/store/products/${deactivate.dataset.storeDeactivateProduct}`); notify('تم تعطيل المنتج.'); await loadProducts(); } catch (error) { notify(error.message, 'error'); } }
            const editProduct = event.target.closest('[data-store-edit-product]');
            if (editProduct) openProductEditor(state.products.find((item) => String(item.id) === String(editProduct.dataset.storeEditProduct)));
            const editSupplier = event.target.closest('[data-store-edit-supplier]');
            if (editSupplier) openSupplierEditor(state.suppliers.find((item) => String(item.id) === String(editSupplier.dataset.storeEditSupplier)));
            const editExpense = event.target.closest('[data-store-edit-expense]');
            if (editExpense) openExpenseEditor(state.expenses.find((item) => String(item.id) === String(editExpense.dataset.storeEditExpense)));
            const deleteExpense = event.target.closest('[data-store-delete-expense]');
            if (deleteExpense && window.confirm('هل تريد حذف هذا المصروف؟')) { try { await api.del(`/api/store/expenses/${deleteExpense.dataset.storeDeleteExpense}`); notify('تم حذف المصروف.'); await loadExpenses(); await loadDashboard(); } catch (error) { notify(error.message, 'error'); } }
            const adjust = event.target.closest('[data-store-adjust]');
            if (adjust) { const amount = Number(window.prompt('أدخل الكمية الموجبة للتسوية:', '1')); if (Number.isFinite(amount) && amount > 0) { try { await api.post('/api/store/inventory/adjustments', { variantId: Number(adjust.dataset.storeAdjust), quantity: amount, direction: 'in', movementType: 'adjustment', notes: 'تسوية من شاشة المتجر' }); notify('تمت تسوية المخزون.'); await loadInventory(); await loadDashboard(); } catch (error) { notify(error.message, 'error'); } } }
        });
    }

    async function onStoreTab() {
        if (!document.getElementById('storeSection')) return;
        if (!state.loaded) await loadBootstrap();
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bind, { once: true });
    else bind();
    window.addEventListener('topgym:tab-changed', (event) => { if (event.detail?.name === 'store') void onStoreTab(); });
    // Store is lazy-loaded by the tab router. The router event is the single
    // startup trigger, avoiding a second bootstrap request on deep links.
})();
