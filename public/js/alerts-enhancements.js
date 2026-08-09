        (() => {
            const alertsList = document.getElementById('alertsList');
            if (!alertsList) return;
            const labels = { active: 'نشطة', expiring_soon: 'قريبة الانتهاء', expired: 'منتهية', frozen: 'مجمدة' };
            const icons = {
                active: '<svg class="ui-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m5 12 4 4L19 6"/></svg>',
                expiring_soon: '<svg class="ui-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="8"/><path d="M12 8v4l3 2"/></svg>',
                expired: '<svg class="ui-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3 2.5 20h19L12 3Z"/><path d="M12 9v4M12 17h.01"/></svg>',
                frozen: '<svg class="ui-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3v18M5.6 6.7l12.8 10.6M18.4 6.7 5.6 17.3M4 12h16"/></svg>'
            };
            const escape = (value) => String(value ?? '').replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));
            const enhanceDailyAlerts = () => {
                alertsList.querySelectorAll('.alert-card:not([data-alert-enhanced])').forEach((card) => {
                    const status = ['active', 'expiring_soon', 'expired', 'frozen'].find((item) => card.classList.contains(item)) || 'expiring_soon';
                    const original = [...card.children];
                    const name = original[0]?.textContent || '';
                    const rawDetail = original[1]?.textContent || '';
                    const phone = original[2]?.textContent || '';
                    const label = labels[status] || 'تنبيه';
                    const detail = rawDetail.replace(`${label} · `, '');
                    const icon = document.createElement('span');
                    icon.className = 'alert-card-icon';
                    icon.setAttribute('aria-hidden', 'true');
                    icon.innerHTML = icons[status];
                    const body = document.createElement('div');
                    body.className = 'alert-card-body';
                    body.innerHTML = `<div class="alert-card-head"><strong>${escape(name)}</strong><span class="alert-status">${escape(label)}</span></div><span class="alert-card-detail">${escape(detail)}</span><a class="alert-card-phone" href="tel:${escape(phone.replace(/\s+/g, ''))}">${escape(phone)}</a>`;
                    card.replaceChildren(icon, body);
                    card.dataset.alertEnhanced = 'true';
                });
                const count = alertsList.querySelectorAll('.alert-card').length;
                alertsList.classList.toggle('alerts-list-scroll', count > 2);
                const badge = document.getElementById('alertsCount');
                if (badge) badge.textContent = count ? `${count.toLocaleString('ar-EG')} تنبيه` : 'لا توجد تنبيهات';
            };
            new MutationObserver(enhanceDailyAlerts).observe(alertsList, { childList: true, subtree: true });
            enhanceDailyAlerts();
        })();
