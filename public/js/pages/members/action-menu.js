        (() => {
            const list = document.getElementById('membersList');
            if (!list) return;

            function closeMenus(except = null) {
                list.querySelectorAll('.action-menu-panel:not([hidden])').forEach((panel) => {
                    const menu = panel.closest('.action-menu');
                    const toggle = menu?.querySelector('[data-menu-toggle]');
                    if (menu !== except) {
                        panel.hidden = true;
                        panel.classList.remove('is-floating');
                        menu.classList.remove('is-open');
                        menu.closest('td')?.classList.remove('has-open-action-menu');
                        panel.style.removeProperty('top');
                        panel.style.removeProperty('left');
                        toggle?.setAttribute('aria-expanded', 'false');
                    }
                });
            }

            function positionFloatingMenu(menu, panel) {
                if (!menu || !panel || panel.hidden) return;
                const toggle = menu.querySelector('[data-menu-toggle]');
                if (!toggle) return;
                const toggleRect = toggle.getBoundingClientRect();
                const panelWidth = panel.offsetWidth || 200;
                const panelHeight = panel.offsetHeight || 240;
                const viewportPadding = 8;
                const left = Math.min(
                    Math.max(viewportPadding, toggleRect.right - panelWidth),
                    Math.max(viewportPadding, window.innerWidth - panelWidth - viewportPadding)
                );
                const opensDown = toggleRect.bottom + panelHeight + viewportPadding <= window.innerHeight;
                const top = opensDown
                    ? toggleRect.bottom + viewportPadding
                    : Math.max(viewportPadding, toggleRect.top - panelHeight - viewportPadding);
                panel.style.left = `${Math.round(left)}px`;
                panel.style.top = `${Math.round(top)}px`;
            }

            function repositionOpenMenus() {
                list.querySelectorAll('.action-menu-panel.is-floating:not([hidden])').forEach((panel) => {
                    positionFloatingMenu(panel.closest('.action-menu'), panel);
                });
            }

            function menuActionIcon(action) {
                return action === 'print'
                    ? '<span class="action-menu-print-icon" aria-hidden="true">⎙</span>'
                    : actionIcon(action);
            }

            function moveCoachingActionsToMenu(actions) {
                const panel = actions.querySelector(':scope > .action-menu .action-menu-panel');
                if (!panel) return;
                actions.querySelectorAll(':scope > button[data-member-coaching-action]').forEach((button) => {
                    const label = button.dataset.label || button.getAttribute('aria-label') || button.title || button.dataset.memberCoachingAction;
                    const icon = button.querySelector('svg')?.outerHTML || '';
                    button.className = 'action-menu-item';
                    button.type = 'button';
                    button.innerHTML = `${icon}<span>${escapeHtml(label)}</span>`;
                    panel.append(button);
                });
            }

            function compactActions() {
                list.querySelectorAll('.table-actions').forEach((actions) => {
                    if (actions.dataset.compact === 'true') {
                        moveCoachingActionsToMenu(actions);
                        return;
                    }
                    const buttons = [...actions.querySelectorAll(':scope > button[data-action]')];
                    if (!buttons.length) return;
                    actions.dataset.compact = 'true';
                    const mobileCard = Boolean(actions.closest('.members-mobile-card'));
                    const visibleActions = new Set(['details', 'renew']);
                    const visible = buttons.filter((button) => visibleActions.has(button.dataset.action));
                    const coachingButtons = [...actions.querySelectorAll(':scope > button[data-member-coaching-action]')];
                    const advanced = [
                        ...buttons.filter((button) => !visibleActions.has(button.dataset.action)),
                        ...coachingButtons
                    ];
                    const directButtons = [...actions.children].filter((child) => visible.includes(child));
                    actions.replaceChildren(...directButtons);
                    visible.forEach((button) => {
                        const label = button.dataset.label || ACTION_LABELS[button.dataset.action] || button.dataset.action;
                        button.type = 'button';
                        button.classList.add('table-action-visible');
                        button.setAttribute('aria-label', label);
                        button.title = label;
                        // Desktop stays icon-only; mobile cards show text labels so actions
                        // remain discoverable and easy to tap.
                        button.innerHTML = mobileCard
                            ? `${actionIcon(button.dataset.action)}<span class="table-action-label">${escapeHtml(label)}</span>`
                            : actionIcon(button.dataset.action);
                    });
                    if (!advanced.length) return;

                    const menu = document.createElement('div');
                    menu.className = 'action-menu';
                    menu.innerHTML = '<button class="btn btn-small action-menu-toggle" type="button" data-menu-toggle aria-expanded="false" aria-label="المزيد من الإجراءات" title="المزيد من الإجراءات"><svg class="ui-icon action-menu-icon" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/></svg></button><div class="action-menu-panel" hidden></div>';
                    const panel = menu.querySelector('.action-menu-panel');
                    advanced.forEach((button) => {
                        const action = button.dataset.action;
                        const coachingAction = button.dataset.memberCoachingAction;
                        const label = button.dataset.label || ACTION_LABELS[action] || button.getAttribute('aria-label') || action || coachingAction;
                        const icon = action
                            ? menuActionIcon(action)
                            : button.querySelector('svg')?.outerHTML || '';
                        button.className = `action-menu-item${action === 'delete' ? ' danger' : ''}`;
                        button.type = 'button';
                        button.innerHTML = `${icon}<span>${escapeHtml(label)}</span>`;
                        panel.append(button);
                    });
                    actions.append(menu);
                });
            }

            document.addEventListener('click', (event) => {
                const toggle = event.target.closest('[data-menu-toggle]');
                if (toggle && list.contains(toggle)) {
                    event.preventDefault();
                    const menu = toggle.closest('.action-menu');
                    const panel = menu?.querySelector('.action-menu-panel');
                    if (!panel) return;
                    const shouldOpen = panel.hidden;
                    closeMenus(menu);
                    panel.hidden = !shouldOpen;
                    panel.classList.toggle('is-floating', shouldOpen);
                    menu.classList.toggle('is-open', shouldOpen);
                    menu.closest('td')?.classList.toggle('has-open-action-menu', shouldOpen);
                    toggle.setAttribute('aria-expanded', String(shouldOpen));
                    if (shouldOpen) positionFloatingMenu(menu, panel);
                    window.topGymStopButtonLoading?.(toggle);
                    return;
                }
                if (event.target.closest('.action-menu-item')) {
                    closeMenus();
                    return;
                }
                if (!event.target.closest('.action-menu')) closeMenus();
            });

            window.addEventListener('scroll', repositionOpenMenus, { passive: true });
            window.addEventListener('resize', repositionOpenMenus, { passive: true });

            new MutationObserver(compactActions).observe(list, { childList: true, subtree: true });
            function initializeActionMenu() {
                compactActions();
                document.getElementById('sortFilter')?.addEventListener('change', loadMembersOnly);
            }

            if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initializeActionMenu, { once: true });
            else initializeActionMenu();
        })();
