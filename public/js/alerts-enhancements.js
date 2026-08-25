(() => {
    const alertsList = document.getElementById('alertsList');
    if (!alertsList) return;

    const alertsSearch = document.getElementById('alertsSearch');
    const alertsSearchResult = document.getElementById('alertsSearchResult');
    const alertsHeader = document.querySelector('.alerts-panel-header');
    const pageSize = 5;
    let currentPage = 1;

    if (alertsHeader && !alertsHeader.querySelector('.alerts-filter-button')) {
        const filterButton = document.createElement('label');
        filterButton.className = 'alerts-filter-button';
        filterButton.htmlFor = 'alertsSearch';
        filterButton.setAttribute('aria-label', '\u062a\u0635\u0641\u064a\u0629 \u0627\u0644\u062a\u0646\u0628\u064a\u0647\u0627\u062a');
        filterButton.innerHTML = '<svg class="ui-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 6h16M7 12h10M10 18h4"/></svg><span>\u062a\u0635\u0641\u064a\u0629</span>';
        alertsHeader.appendChild(filterButton);
    }

    const pagination = document.createElement('nav');
    pagination.className = 'alerts-pagination';
    pagination.setAttribute('aria-label', '\u062a\u0642\u0644\u064a\u0628 \u0627\u0644\u062a\u0646\u0628\u064a\u0647\u0627\u062a');
    alertsList.insertAdjacentElement('afterend', pagination);

    const labels = {
        active: '\u0646\u0634\u0637\u0629',
        expiring_soon: '\u0642\u0631\u064a\u0628\u0629 \u0627\u0644\u0627\u0646\u062a\u0647\u0627\u0621',
        expired: '\u0645\u0646\u062a\u0647\u064a\u0629',
        frozen: '\u0645\u062c\u0645\u062f\u0629'
    };
    const kindLabels = {
        debt: '\u0639\u0644\u064a\u0647 \u0645\u0633\u062a\u062d\u0642\u0627\u062a',
        inactive: '\u063a\u064a\u0627\u0628 \u0637\u0648\u064a\u0644'
    };
    const icons = {
        active: '<svg class="ui-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m5 12 4 4L19 6"/></svg>',
        expiring_soon: '<svg class="ui-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="8"/><path d="M12 8v4l3 2"/></svg>',
        expired: '<svg class="ui-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3 2.5 20h19L12 3Z"/><path d="M12 9v4M12 17h.01"/></svg>',
        frozen: '<svg class="ui-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3v18M5.6 6.7l12.8 10.6M18.4 6.7 5.6 17.3M4 12h16"/></svg>',
        debt: '<svg class="ui-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v10M9 10h4a2 2 0 1 1 0 4H9"/></svg>',
        inactive: '<svg class="ui-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>'
    };
    const whatsappIcon = '<svg class="ui-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 11.5a8 8 0 0 1-8 8 8.5 8.5 0 0 1-3.7-.85L4 20l1.35-4.05A8.5 8.5 0 1 1 20 11.5Z"/><path d="M8.7 9.1c.2-.45.4-.46.7-.47h.35c.2 0 .4.08.5.34l.65 1.5c.1.23.08.42-.08.62l-.42.52c.55 1.1 1.4 1.8 2.55 2.3l.45-.5c.17-.2.36-.23.6-.14l1.42.63c.25.12.34.3.31.55-.1.8-.68 1.35-1.47 1.4-2.3.12-5.98-3.5-6.1-6.75-.02-.01.17-.75.54-1.02Z"/></svg>';
    const escape = (value) => String(value ?? '').replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));
    const whatsappLabel = '\u0625\u0631\u0633\u0627\u0644 \u0648\u0627\u062a\u0633\u0627\u0628';

    function prepareWhatsappButton(button) {
        if (!button) return;
        button.title = whatsappLabel;
        button.setAttribute('aria-label', whatsappLabel);
    }

    function normalizeRenderedCard(card) {
        const body = card.querySelector(':scope > .alert-card-body');
        if (!body || body.querySelector(':scope > .alert-card-content, :scope > .alert-card-head')) {
            prepareWhatsappButton(card.querySelector('.alert-whatsapp-button'));
            return;
        }

        const name = body.querySelector(':scope > .alert-card-name, :scope > strong');
        const detail = body.querySelector(':scope > .alert-card-detail');
        const phone = body.querySelector(':scope > .alert-card-phone');
        const status = card.querySelector(':scope > .alert-status');
        const button = card.querySelector(':scope > .alert-whatsapp-button');
        if (!name || !detail || !phone) return;

        const content = document.createElement('div');
        content.className = 'alert-card-content';
        const head = document.createElement('div');
        head.className = 'alert-card-head';
        head.appendChild(name);
        content.append(head, detail, phone);

        const actions = document.createElement('div');
        actions.className = 'alert-card-actions';
        if (status) actions.appendChild(status);
        if (button) {
            prepareWhatsappButton(button);
            actions.appendChild(button);
        }
        body.replaceChildren(content, actions);
        card.dataset.alertLayoutReady = 'true';
    }

    function renderPagination() {
        pagination.replaceChildren();
        const total = alertsList.querySelectorAll('.alert-card').length;
        if (total <= pageSize) {
            alertsList.classList.remove('alerts-list-scroll', 'alerts-list-expanded');
            pagination.hidden = true;
            return;
        }

        const expanded = alertsList.classList.contains('alerts-list-expanded');
        alertsList.classList.toggle('alerts-list-scroll', !expanded);
        pagination.hidden = false;
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'alerts-view-all btn btn-light btn-small';
        button.textContent = expanded
            ? '\u0639\u0631\u0636 \u0623\u0642\u0644'
            : '\u0639\u0631\u0636 \u0627\u0644\u0643\u0644 (' + total.toLocaleString('ar-EG') + ')';
        button.setAttribute('aria-expanded', String(expanded));
        button.addEventListener('click', () => {
            alertsList.classList.toggle('alerts-list-expanded');
            renderPagination();
        });
        pagination.appendChild(button);
    }

    function filterAlerts() {
        const query = String(alertsSearch?.value || '').trim().toLocaleLowerCase('ar-EG');
        const cards = [...alertsList.querySelectorAll('.alert-card')];
        const matchingCards = cards.filter((card) => {
            const haystack = [card.dataset.alertName, card.dataset.alertPhone, card.textContent]
                .filter(Boolean)
                .join(' ')
                .toLocaleLowerCase('ar-EG');
            return !query || haystack.includes(query);
        });
        const visibleCards = new Set(matchingCards);
        cards.forEach((card) => {
            card.hidden = !visibleCards.has(card);
        });

        if (alertsSearchResult) {
            const visible = matchingCards.length.toLocaleString('ar-EG');
            const total = cards.length.toLocaleString('ar-EG');
            alertsSearchResult.textContent = query
                ? visible + ' ' + '\u0645\u0646' + ' ' + total
                : total + ' ' + '\u062a\u0646\u0628\u064a\u0647';
        }
        renderPagination();
    }

    function enhanceDailyAlerts() {
        alertsList.querySelectorAll('.alert-card').forEach(normalizeRenderedCard);
        alertsList.querySelectorAll('.alert-card:not([data-alert-enhanced])').forEach((card) => {
            const status = ['active', 'expiring_soon', 'expired', 'frozen'].find((item) => card.classList.contains(item)) || 'expiring_soon';
            const kind = card.dataset.alertKind || 'membership';
            const original = [...card.children];
            const name = original[0]?.textContent || '';
            const rawDetail = original[1]?.textContent || '';
            const phone = original[2]?.textContent || '';
            const label = kindLabels[kind] || labels[status] || '\u062a\u0646\u0628\u064a\u0647';
            const detail = rawDetail.replace(label + ' \u00b7 ', '').replace((labels[status] || '') + ' \u00b7 ', '');
            const icon = document.createElement('span');
            icon.className = 'alert-card-icon';
            icon.setAttribute('aria-hidden', 'true');
            icon.innerHTML = icons[kind] || icons[status];
            const body = document.createElement('div');
            body.className = 'alert-card-body';
            const memberId = card.dataset.memberId || '';
            const quickAction = memberId
                ? '<button type="button" class="alert-whatsapp-button" data-alert-whatsapp="' + escape(kind) + '" data-member-id="' + escape(memberId) + '" data-alert-key="' + escape(card.dataset.alertKey || '') + '" data-alert-name="' + escape(card.dataset.alertName || name) + '" data-alert-phone="' + escape(card.dataset.alertPhone || phone) + '" data-alert-status="' + escape(card.dataset.alertStatus || status) + '" data-alert-end="' + escape(card.dataset.alertEnd || '') + '" data-alert-freeze-end="' + escape(card.dataset.alertFreezeEnd || '') + '" data-alert-remaining="' + escape(card.dataset.alertRemaining || '') + '" data-alert-days="' + escape(card.dataset.alertDays || '') + '" title="' + whatsappLabel + '" aria-label="' + whatsappLabel + '">' + whatsappIcon + '<span>\u0648\u0627\u062a\u0633\u0627\u0628</span></button>'
                : '';
            body.innerHTML = '<div class="alert-card-content"><div class="alert-card-head"><strong>' + escape(name) + '</strong></div><span class="alert-card-detail">' + escape(detail) + '</span><a class="alert-card-phone" href="tel:' + escape(phone.replace(/\s+/g, '')) + '">' + escape(phone) + '</a></div><div class="alert-card-actions"><span class="alert-status">' + escape(label) + '</span>' + quickAction + '</div>';
            card.replaceChildren(icon, body);
            card.dataset.alertEnhanced = 'true';
        });

        alertsList.querySelectorAll('.alert-whatsapp-button').forEach(prepareWhatsappButton);
        const count = alertsList.querySelectorAll('.alert-card').length;
        if (count <= pageSize) alertsList.classList.remove('alerts-list-expanded');
        alertsList.classList.toggle('alerts-list-scroll', count > pageSize && !alertsList.classList.contains('alerts-list-expanded'));
        const badge = document.getElementById('alertsCount');
        if (badge) badge.textContent = count ? count.toLocaleString('ar-EG') + ' ' + '\u062a\u0646\u0628\u064a\u0647' : '\u0644\u0627 \u062a\u0648\u062c\u062f \u062a\u0646\u0628\u064a\u0647\u0627\u062a';
        filterAlerts();
    }

    let enhanceFrame = 0;
    const scheduleEnhance = () => {
        if (enhanceFrame) return;
        const run = () => {
            enhanceFrame = 0;
            enhanceDailyAlerts();
        };
        enhanceFrame = typeof window.requestAnimationFrame === 'function'
            ? window.requestAnimationFrame(run)
            : window.setTimeout(run, 0);
    };
    new MutationObserver(scheduleEnhance).observe(alertsList, { childList: true, subtree: true });
    alertsSearch?.addEventListener('input', () => {
        currentPage = 1;
        filterAlerts();
    });
    scheduleEnhance();
})();
