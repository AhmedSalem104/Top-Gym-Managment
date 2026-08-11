        (() => {
            const alertsList = document.getElementById('alertsList');
            if (!alertsList) return;
            const alertsSearch = document.getElementById('alertsSearch');
            const alertsSearchResult = document.getElementById('alertsSearchResult');
            const labels = { active: 'نشطة', expiring_soon: 'قريبة الانتهاء', expired: 'منتهية', frozen: 'مجمدة' };
            const kindLabels = { debt: 'عليه مستحقات', inactive: 'غياب طويل' };
            const icons = {
                active: '<svg class="ui-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m5 12 4 4L19 6"/></svg>',
                expiring_soon: '<svg class="ui-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="8"/><path d="M12 8v4l3 2"/></svg>',
                expired: '<svg class="ui-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3 2.5 20h19L12 3Z"/><path d="M12 9v4M12 17h.01"/></svg>',
                frozen: '<svg class="ui-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3v18M5.6 6.7l12.8 10.6M18.4 6.7 5.6 17.3M4 12h16"/></svg>',
                debt: '<svg class="ui-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v10M9 10h4a2 2 0 1 1 0 4H9"/></svg>',
                inactive: '<svg class="ui-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>'
            };
            const escape = (value) => String(value ?? '').replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));
            const filterAlerts = () => {
                const query = String(alertsSearch?.value || '').trim().toLocaleLowerCase('ar-EG');
                const cards = [...alertsList.querySelectorAll('.alert-card')];
                let visibleCount = 0;
                cards.forEach((card) => {
                    const haystack = [card.dataset.alertName, card.dataset.alertPhone, card.textContent]
                        .filter(Boolean)
                        .join(' ')
                        .toLocaleLowerCase('ar-EG');
                    const matches = !query || haystack.includes(query);
                    card.hidden = !matches;
                    if (matches) visibleCount += 1;
                });
                if (alertsSearchResult) {
                    const visible = visibleCount.toLocaleString('ar-EG');
                    const total = cards.length.toLocaleString('ar-EG');
                    alertsSearchResult.textContent = query ? `${visible} من ${total}` : `${total} تنبيه`;
                }
            };
            const enhanceDailyAlerts = () => {
                alertsList.querySelectorAll('.alert-card:not([data-alert-enhanced])').forEach((card) => {
                    const status = ['active', 'expiring_soon', 'expired', 'frozen'].find((item) => card.classList.contains(item)) || 'expiring_soon';
                    const kind = card.dataset.alertKind || 'membership';
                    const original = [...card.children];
                    const name = original[0]?.textContent || '';
                    const rawDetail = original[1]?.textContent || '';
                    const phone = original[2]?.textContent || '';
                    const label = kindLabels[kind] || labels[status] || 'تنبيه';
                    const detail = rawDetail.replace(`${label} · `, '').replace(`${labels[status] || ''} · `, '');
                    const icon = document.createElement('span');
                    icon.className = 'alert-card-icon';
                    icon.setAttribute('aria-hidden', 'true');
                    icon.innerHTML = icons[kind] || icons[status];
                    const body = document.createElement('div');
                    body.className = 'alert-card-body';
                    const memberId = card.dataset.memberId || '';
                    const quickAction = memberId
                        ? `<button type="button" class="alert-whatsapp-button" data-alert-whatsapp="${kind}" data-member-id="${escape(memberId)}" data-alert-name="${escape(card.dataset.alertName || name)}" data-alert-phone="${escape(card.dataset.alertPhone || phone)}" data-alert-status="${escape(card.dataset.alertStatus || status)}" data-alert-end="${escape(card.dataset.alertEnd || '')}" data-alert-freeze-end="${escape(card.dataset.alertFreezeEnd || '')}" data-alert-remaining="${escape(card.dataset.alertRemaining || '')}" data-alert-days="${escape(card.dataset.alertDays || '')}">واتساب يدوي</button>`
                        : '';
                    body.innerHTML = `<div class="alert-card-head"><strong>${escape(name)}</strong><span class="alert-status">${escape(label)}</span></div><span class="alert-card-detail">${escape(detail)}</span><a class="alert-card-phone" href="tel:${escape(phone.replace(/\s+/g, ''))}">${escape(phone)}</a>${quickAction}`;
                    card.replaceChildren(icon, body);
                    card.dataset.alertEnhanced = 'true';
                });
                const count = alertsList.querySelectorAll('.alert-card').length;
                alertsList.classList.toggle('alerts-list-scroll', count > 2);
                const badge = document.getElementById('alertsCount');
                if (badge) badge.textContent = count ? `${count.toLocaleString('ar-EG')} تنبيه` : 'لا توجد تنبيهات';
                filterAlerts();
            };
            new MutationObserver(enhanceDailyAlerts).observe(alertsList, { childList: true, subtree: true });
            alertsSearch?.addEventListener('input', filterAlerts);
            enhanceDailyAlerts();
        })();
