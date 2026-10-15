(() => {
    'use strict';

    const TEXT = {
        plan: '\u0627\u0644\u0628\u0627\u0642\u0629',
        planName: '\u0627\u0633\u0645 \u0627\u0644\u0628\u0627\u0642\u0629',
        monthlyPrice: '\u0627\u0644\u0633\u0639\u0631 \u0627\u0644\u0634\u0647\u0631\u064a',
        durations: '\u0623\u0633\u0639\u0627\u0631 \u0627\u0644\u0645\u062f\u062f',
        independentPrice: '\u0633\u0639\u0631 \u0645\u0633\u062a\u0642\u0644',
        membershipType: '\u0646\u0648\u0639 \u0627\u0644\u0639\u0636\u0648\u064a\u0629',
        duration: '\u0627\u0644\u0645\u062f\u0629',
        multiplier: '\u0645\u0639\u0627\u0645\u0644 \u0627\u0644\u0633\u0639\u0631',
        status: '\u0627\u0644\u062d\u0627\u0644\u0629',
        action: '\u0627\u0644\u0625\u062c\u0631\u0627\u0621',
        dayPass: '\u0646\u0648\u0639 \u0627\u0644\u062d\u0635\u0629',
        currency: '\u062c.\u0645',
        noPlans: '\u0644\u0627 \u062a\u0648\u062c\u062f \u0628\u0627\u0642\u0627\u062a \u0645\u0633\u062c\u0644\u0629 \u062d\u0627\u0644\u064a\u064b\u0627.',
        noTypes: '\u0644\u0627 \u062a\u0648\u062c\u062f \u0623\u0646\u0648\u0627\u0639 \u0639\u0636\u0648\u064a\u0627\u062a \u0645\u0633\u062c\u0644\u0629 \u062d\u0627\u0644\u064a\u064b\u0627.',
        noDayPassPrices: '\u0644\u0627 \u062a\u0648\u062c\u062f \u0623\u0633\u0639\u0627\u0631 \u062d\u0635\u0635 \u0645\u0633\u062c\u0644\u0629.'
    };

    const TEXT_KEYS = {
        plan: 'pricing.column.plan',
        planName: 'plan.name',
        monthlyPrice: 'pricing.column.monthly',
        durations: 'pricing.card.durations',
        durationSingular: 'pricing.card.durationSingular',
        durationPlural: 'pricing.card.durationPlural',
        independentPrice: 'pricing.column.independent',
        membershipType: 'types.card.eyebrow',
        duration: 'types.column.duration',
        multiplier: 'types.column.multiplier',
        dayPass: 'dayPass.column.type',
        currency: 'pricing.card.currency',
        noPlans: 'pricing.empty',
        noTypes: 'types.empty',
        noDayPassPrices: 'dayPass.empty',
        price: 'dayPass.column.price'
    };

    function label(name) {
        const key = TEXT_KEYS[name];
        return (key && window.TopGymI18n?.t?.(`membershipManagement.${key}`)) || TEXT[name];
    }

    const hosts = [
        { id: 'pricingTableContainer', tableClass: 'pricing-table', gridClass: 'pricing-plan-grid', render: renderPlanCards },
        { id: 'membershipTypesTableContainer', tableClass: 'membership-types-table', gridClass: 'membership-type-card-grid', render: renderMembershipTypeCards },
        { id: 'dayPassPricingContainer', tableClass: 'day-pass-pricing-table', gridClass: 'day-pass-pricing-card-grid', render: renderDayPassCards }
    ];

    function createElement(tag, className, text = '') {
        const element = document.createElement(tag);
        if (className) element.className = className;
        if (text) element.textContent = text;
        return element;
    }

    function textFromCell(cell) {
        return cell?.textContent?.replace(/\s+/g, ' ').trim() || '';
    }

    function headerLabel(header) {
        if (!header) return '';
        const copy = header.cloneNode(true);
        copy.querySelectorAll('small').forEach((hint) => hint.remove());
        return textFromCell(copy);
    }

    function cloneInput(source, data = {}) {
        const input = source.cloneNode(true);
        input.removeAttribute('id');
        input.classList.add('pricing-card-input');
        Object.entries(data).forEach(([key, value]) => {
            input.dataset[key] = value;
        });
        return input;
    }

    function createTextField(label, source, data) {
        const field = createElement('label', 'pricing-card-field');
        field.appendChild(createElement('span', 'pricing-card-field-label', label));
        field.appendChild(cloneInput(source, data));
        return field;
    }

    function createMoneyField(fieldLabel, source, data, hint = label('independentPrice')) {
        const field = createElement('label', 'pricing-card-field pricing-card-money-field');
        const labelNode = createElement('span', 'pricing-card-field-label', fieldLabel);
        if (hint) labelNode.appendChild(createElement('small', 'pricing-card-field-hint', hint));
        const shell = createElement('span', 'pricing-card-input-shell');
        shell.appendChild(cloneInput(source, data));
        shell.appendChild(createElement('span', 'pricing-card-currency', label('currency')));
        field.append(labelNode, shell);
        return field;
    }

    function createInfo(label, value, className = '') {
        const item = createElement('div', `membership-type-info ${className}`.trim());
        item.appendChild(createElement('span', 'membership-type-info-label', label));
        const valueNode = createElement('strong', 'membership-type-info-value', value || '—');
        valueNode.dir = 'auto';
        item.appendChild(valueNode);
        return item;
    }

    function setSourceTableHidden(table) {
        table.dataset.pricingCardsSource = 'true';
        table.hidden = true;
        table.setAttribute('aria-hidden', 'true');
    }

    function removeExistingCards(host, gridClass) {
        host.querySelectorAll(`.${gridClass}`).forEach((grid) => grid.remove());
    }

    function findSourceTable(host, tableClass) {
        return [...host.querySelectorAll(`table.${tableClass}`)].find((table) => table.dataset.pricingCardsSource !== 'true');
    }

    function createEmptyState(message) {
        return createElement('div', 'pricing-cards-empty', message);
    }

    function renderPlanCards(host, table, grid) {
        const headers = [...(table.tHead?.rows?.[0]?.cells || [])];
        const durationHeaders = headers.slice(2).map((header) => ({
            label: headerLabel(header),
            hint: header.querySelector('small')?.textContent?.trim() || label('independentPrice')
        }));
        const rows = [...table.querySelectorAll('tbody tr[data-plan]')];

        if (!rows.length) {
            grid.appendChild(createEmptyState(label('noPlans')));
            return;
        }

        rows.forEach((row, index) => {
            const code = row.dataset.plan || '';
            const planName = row.querySelector('[data-field="planName"]');
            const monthlyPrice = row.querySelector('[data-field="monthlyPrice"]');
            const card = createElement('article', 'pricing-plan-card');
            card.dataset.plan = code;

            const cardHeader = createElement('div', 'pricing-plan-card-header');
            const heading = createElement('div', 'pricing-plan-card-heading');
            heading.appendChild(createElement('span', 'pricing-card-eyebrow', label('plan')));
            heading.appendChild(createElement('strong', 'pricing-plan-card-code', code));
            cardHeader.appendChild(heading);
            cardHeader.appendChild(createElement('span', 'pricing-card-index', String(index + 1).padStart(2, '0')));
            card.appendChild(cardHeader);

            const baseFields = createElement('div', 'pricing-card-base-fields');
            if (planName) baseFields.appendChild(createTextField(label('planName'), planName, { pricingCardInput: 'true', sourcePlan: code, sourceField: 'planName' }));
            if (monthlyPrice) baseFields.appendChild(createMoneyField(label('monthlyPrice'), monthlyPrice, { pricingCardInput: 'true', sourcePlan: code, sourceField: 'monthlyPrice' }, label('independentPrice')));
            card.appendChild(baseFields);

            const durationSection = createElement('section', 'pricing-card-duration-section');
            const durationHeading = createElement('div', 'pricing-card-section-heading');
            durationHeading.appendChild(createElement('strong', '', label('durations')));
            durationHeading.appendChild(createElement('span', '', `${durationHeaders.length} ${label(durationHeaders.length === 1 ? 'durationSingular' : 'durationPlural')}`));
            durationSection.appendChild(durationHeading);
            const durationGrid = createElement('div', 'pricing-duration-grid');
            [...row.querySelectorAll('td.duration-price')].forEach((cell, durationIndex) => {
                const input = cell.querySelector('input');
                if (!input) return;
                const metadata = durationHeaders[durationIndex] || { label: label('duration'), hint: label('independentPrice') };
                durationGrid.appendChild(createMoneyField(metadata.label || label('duration'), input, {
                    pricingCardInput: 'true',
                    sourcePlan: code,
                    sourceField: 'typePrice',
                    sourceTypeCode: input.dataset.typeCode || ''
                }, metadata.hint));
            });
            if (!durationGrid.children.length) durationGrid.appendChild(createElement('span', 'pricing-cards-muted', label('noTypes')));
            durationSection.appendChild(durationGrid);
            card.appendChild(durationSection);

            const status = row.querySelector('[data-plan-status]')?.firstElementChild;
            const editButton = row.querySelector('[data-plan-action="edit"]');
            if (status || editButton) {
                const actionBar = createElement('div', 'pricing-plan-card-actions');
                if (status) actionBar.appendChild(status.cloneNode(true));
                if (editButton) {
                    const button = editButton.cloneNode(true);
                    button.classList.add('pricing-card-action');
                    actionBar.appendChild(button);
                }
                card.appendChild(actionBar);
            }

            grid.appendChild(card);
        });
    }

    function renderMembershipTypeCards(host, table, grid) {
        const rows = [...table.querySelectorAll('tbody tr')].filter((row) => row.querySelector('[data-type-action="edit"]'));

        if (!rows.length) {
            grid.appendChild(createEmptyState(label('noTypes')));
            return;
        }

        rows.forEach((row, index) => {
            const editButton = row.querySelector('[data-type-action="edit"]');
            const deleteButton = row.querySelector('[data-type-action="delete"]');
            const code = editButton?.dataset.code || '';
            const card = createElement('article', 'membership-type-card');
            const header = createElement('div', 'membership-type-card-header');
            const heading = createElement('div', 'membership-type-card-heading');
            heading.appendChild(createElement('span', 'pricing-card-eyebrow', label('membershipType')));
            heading.appendChild(createElement('strong', '', row.cells?.[0]?.querySelector('strong')?.textContent?.trim() || textFromCell(row.cells?.[0])));
            heading.appendChild(createElement('small', 'membership-type-card-code', code));
            header.appendChild(heading);
            const status = row.cells?.[3]?.firstElementChild;
            if (status) header.appendChild(status.cloneNode(true));
            card.appendChild(header);

            const infoGrid = createElement('div', 'membership-type-info-grid');
            infoGrid.appendChild(createInfo(label('duration'), textFromCell(row.cells?.[1])));
            infoGrid.appendChild(createInfo(label('multiplier'), textFromCell(row.cells?.[2]), 'membership-type-info-emphasis'));
            card.appendChild(infoGrid);

            const actionBar = createElement('div', 'membership-type-card-actions');
            actionBar.appendChild(createElement('span', 'pricing-card-index', String(index + 1).padStart(2, '0')));
            if (editButton) {
                const button = editButton.cloneNode(true);
                button.classList.add('pricing-card-action');
                actionBar.appendChild(button);
            }
            if (deleteButton) {
                const button = deleteButton.cloneNode(true);
                button.classList.add('pricing-card-action');
                actionBar.appendChild(button);
            }
            card.appendChild(actionBar);
            grid.appendChild(card);
        });
    }

    function renderDayPassCards(host, table, grid) {
        const rows = [...table.querySelectorAll('tbody tr[data-day-pass-price-code]')];

        if (!rows.length) {
            grid.appendChild(createEmptyState(label('noDayPassPrices')));
            return;
        }

        rows.forEach((row, index) => {
            const code = row.dataset.dayPassPriceCode || '';
            const labelCell = row.cells?.[0];
            const priceInput = row.querySelector('[data-day-pass-price]');
            const status = row.cells?.[2]?.firstElementChild;
            const card = createElement('article', 'day-pass-pricing-card');
            const header = createElement('div', 'day-pass-pricing-card-header');
            const heading = createElement('div', 'day-pass-pricing-card-heading');
            heading.appendChild(createElement('span', 'pricing-card-eyebrow', label('dayPass')));
            heading.appendChild(createElement('strong', '', labelCell?.querySelector('strong')?.textContent?.trim() || textFromCell(labelCell)));
            heading.appendChild(createElement('small', 'day-pass-pricing-card-code', code));
            header.appendChild(heading);
            if (status) header.appendChild(status.cloneNode(true));
            card.appendChild(header);
            if (priceInput) card.appendChild(createMoneyField(label('price'), priceInput, { dayPassCardInput: code }, label('independentPrice')));
            card.appendChild(createElement('span', 'pricing-card-index', String(index + 1).padStart(2, '0')));
            grid.appendChild(card);
        });
    }

    function enhanceHost(hostConfig) {
        const host = document.getElementById(hostConfig.id);
        if (!host) return;
        const table = findSourceTable(host, hostConfig.tableClass);
        if (!table) return;
        removeExistingCards(host, hostConfig.gridClass);
        const grid = createElement('div', hostConfig.gridClass);
        hostConfig.render(host, table, grid);
        host.insertBefore(grid, table);
        setSourceTableHidden(table);
    }

    function syncPricingInput(input) {
        if (input.dataset.pricingCardInput !== 'true') return;
        const host = document.getElementById('pricingTableContainer');
        const row = [...(host?.querySelectorAll('tr[data-plan]') || [])].find((item) => item.dataset.plan === input.dataset.sourcePlan);
        if (!row) return;
        let source;
        if (input.dataset.sourceField === 'typePrice') {
            source = [...row.querySelectorAll('[data-field="typePrice"]')].find((item) => item.dataset.typeCode === input.dataset.sourceTypeCode);
        } else {
            source = row.querySelector(`[data-field="${input.dataset.sourceField}"]`);
        }
        if (source) source.value = input.value;
    }

    function syncDayPassInput(input) {
        if (!input.dataset.dayPassCardInput) return;
        const host = document.getElementById('dayPassPricingContainer');
        const row = [...(host?.querySelectorAll('[data-day-pass-price-code]') || [])].find((item) => item.dataset.dayPassPriceCode === input.dataset.dayPassCardInput);
        const source = row?.querySelector('[data-day-pass-price]');
        if (source) source.value = input.value;
    }

    document.addEventListener('input', (event) => {
        syncPricingInput(event.target);
        syncDayPassInput(event.target);
    });

    document.addEventListener('change', (event) => {
        syncPricingInput(event.target);
        syncDayPassInput(event.target);
    });

    document.addEventListener('submit', (event) => {
        if (event.target?.id !== 'pricingForm') return;
        document.querySelectorAll('#pricingTableContainer .pricing-card-input').forEach(syncPricingInput);
        document.querySelectorAll('#dayPassPricingContainer [data-day-pass-card-input]').forEach(syncDayPassInput);
    }, true);

    let isRendering = false;
    const observer = new MutationObserver(() => {
        if (!isRendering) enhanceAll();
    });

    function observeHosts() {
        hosts.forEach((hostConfig) => {
            const host = document.getElementById(hostConfig.id);
            if (host) observer.observe(host, { childList: true, subtree: true });
        });
    }

    function enhanceAll() {
        if (isRendering) return;
        isRendering = true;
        observer.disconnect();
        try {
            hosts.forEach(enhanceHost);
        } finally {
            isRendering = false;
            observeHosts();
        }
    }

    const start = () => {
        enhanceAll();
    };

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
    else start();
})();
