(() => {
    if (window.__topGymPageTabsLoaded) return;
    window.__topGymPageTabsLoaded = true;

    const validTabs = new Set(['dashboard', 'members', 'expenses', 'reports', 'management', 'branding', 'member-payment-methods', 'saas-billing', 'backup-history', 'permissions', 'attendance', 'library', 'trainees', 'intelligence', 'feedback', 'store', 'branches', 'member-subscription-requests', 'portal-analytics']);
    let activationToken = 0;
    let activeTabName = null;

    function ensureBackupHistoryTab() {
        const rail = document.getElementById('pageTabs');
        if (!rail || rail.querySelector('[data-page-tab="backup-history"]')) return;

        const button = document.createElement('button');
        button.className = 'page-tab page-tab-backup-history';
        button.type = 'button';
        button.dataset.pageTab = 'backup-history';
        button.dataset.ownerOnly = '';
        button.setAttribute('aria-selected', 'false');
        button.innerHTML = '<svg class="ui-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 7.5A2.5 2.5 0 0 1 6.5 5H20v14H6.5A2.5 2.5 0 0 0 4 21.5z"/><path d="M4 7.5v14M8 9h7M8 13h8"/><path d="M17 16h.01"/></svg><span>\u0633\u062c\u0644 \u0627\u0644\u0646\u0633\u062e</span>';

        const feedbackTab = rail.querySelector('[data-page-tab="feedback"]');
        rail.insertBefore(button, feedbackTab || null);
    }

    ensureBackupHistoryTab();
    // Platform Admin has its own application at /platform-admin. Remove the
    // legacy in-shell entry so gym users never see a second control plane.
    document.querySelector('[data-page-tab="platform"]')?.remove();
    document.getElementById('platformSection')?.remove();

    function setHidden(element, hidden) {
        if (!element) return;
        element.hidden = hidden;
        if (element.hasAttribute('data-page-tab-panel')) {
            element.setAttribute('aria-hidden', String(hidden));
            element.toggleAttribute('inert', hidden);
        }
    }

    function syncSidebarTooltips(rail) {
        if (!rail) return;

        const targets = [
            ...rail.querySelectorAll('.page-tab'),
            rail.querySelector('.smart-assistant-launcher'),
            rail.querySelector('.auth-logout-button')
        ].filter(Boolean);

        targets.forEach((element) => {
            const label = (element.querySelector('span:not(.visually-hidden)')?.textContent || element.getAttribute('aria-label') || element.title || '').trim();
            if (!label) return;
            element.dataset.sidebarLabel = label;
            if (!element.getAttribute('aria-label')) element.setAttribute('aria-label', label);
            if (!element.title) element.title = label;
        });
    }

    function initSidebarTooltip(rail) {
        if (!rail || document.querySelector('.sidebar-floating-tooltip')) return null;

        const shell = rail.closest('.app-shell');
        const tooltip = document.createElement('div');
        tooltip.className = 'sidebar-floating-tooltip';
        tooltip.setAttribute('role', 'tooltip');
        tooltip.setAttribute('aria-hidden', 'true');
        tooltip.hidden = true;
        document.body.appendChild(tooltip);

        let target = null;
        let hideTimer = null;

        const position = () => {
            if (!target || tooltip.hidden) return;
            const rect = target.getBoundingClientRect();
            const gap = 12;
            const direction = getComputedStyle(rail).direction;

            tooltip.style.top = `${Math.round(rect.top + (rect.height / 2))}px`;
            tooltip.style.maxWidth = `${Math.min(220, Math.max(140, window.innerWidth - 24))}px`;
            if (direction === 'rtl') {
                tooltip.style.right = `${Math.max(8, Math.round(window.innerWidth - rect.left + gap))}px`;
                tooltip.style.left = 'auto';
            } else {
                tooltip.style.left = `${Math.max(8, Math.round(rect.right + gap))}px`;
                tooltip.style.right = 'auto';
            }
        };

        const hide = () => {
            target = null;
            tooltip.classList.remove('is-visible');
            if (hideTimer) window.clearTimeout(hideTimer);
            hideTimer = window.setTimeout(() => {
                if (target) return;
                tooltip.hidden = true;
                tooltip.setAttribute('aria-hidden', 'true');
            }, 180);
        };

        const show = (element) => {
            if (window.matchMedia('(max-width: 1199px)').matches) return;
            if (rail.classList.contains('is-hovered') || shell?.classList.contains('sidebar-expanded')) return;
            const label = element?.dataset.sidebarLabel;
            if (!label) return;

            if (hideTimer) window.clearTimeout(hideTimer);
            target = element;
            tooltip.textContent = label;
            tooltip.hidden = false;
            tooltip.setAttribute('aria-hidden', 'false');
            position();
            window.requestAnimationFrame(() => {
                if (target === element) tooltip.classList.add('is-visible');
            });
        };

        const targets = [
            ...rail.querySelectorAll('.page-tab, .smart-assistant-launcher'),
        ].filter(Boolean);
        targets.forEach((element) => {
            element.addEventListener('pointerenter', () => show(element));
            element.addEventListener('pointerleave', hide);
            element.addEventListener('focusin', () => show(element));
            element.addEventListener('focusout', (event) => {
                if (!element.contains(event.relatedTarget)) hide();
            });
        });

        rail.addEventListener('scroll', position, { passive: true });
        window.addEventListener('resize', position, { passive: true });
        return { hide };
    }

    function initSidebarPin() {
        const rail = document.getElementById('pageTabs');
        if (!rail) return;

        syncSidebarTooltips(rail);
        const tooltip = initSidebarTooltip(rail);

        const shell = rail.closest('.app-shell');
        const desktopMediaQuery = window.matchMedia('(min-width: 1200px)');

        let hoverOpenTimer = null;
        let hoverReleaseTimer = null;
        const revealRail = () => {
            if (!desktopMediaQuery.matches) return;
            if (hoverOpenTimer) window.clearTimeout(hoverOpenTimer);
            if (hoverReleaseTimer) window.clearTimeout(hoverReleaseTimer);
            hoverOpenTimer = null;
            hoverReleaseTimer = null;
            rail.classList.add('is-hovered');
            shell?.classList.add('sidebar-expanded');
            tooltip?.hide();
        };
        const openRail = (reason = 'pointer') => {
            if (!desktopMediaQuery.matches) return;
            if (hoverReleaseTimer) window.clearTimeout(hoverReleaseTimer);
            if (reason === 'focus') {
                revealRail();
                return;
            }
            if (rail.classList.contains('is-hovered')) return;
            if (hoverOpenTimer) window.clearTimeout(hoverOpenTimer);
            hoverOpenTimer = window.setTimeout(revealRail, 120);
        };
        const scheduleRailClose = () => {
            if (hoverOpenTimer) window.clearTimeout(hoverOpenTimer);
            hoverOpenTimer = null;
            if (hoverReleaseTimer) window.clearTimeout(hoverReleaseTimer);
            if (!desktopMediaQuery.matches) {
                rail.classList.remove('is-hovered');
                shell?.classList.remove('sidebar-expanded');
                return;
            }
            hoverReleaseTimer = window.setTimeout(() => {
                rail.classList.remove('is-hovered');
                shell?.classList.remove('sidebar-expanded');
                hoverReleaseTimer = null;
            }, 180);
        };

        rail.addEventListener('pointerenter', openRail);
        rail.addEventListener('pointerleave', scheduleRailClose);
        rail.addEventListener('focusin', () => openRail('focus'));
        rail.addEventListener('focusout', (event) => {
            if (!rail.contains(event.relatedTarget)) scheduleRailClose();
        });

        const handleDesktopViewportChange = () => {
            if (desktopMediaQuery.matches) return;
            if (hoverOpenTimer) window.clearTimeout(hoverOpenTimer);
            if (hoverReleaseTimer) window.clearTimeout(hoverReleaseTimer);
            rail.classList.remove('is-hovered');
            shell?.classList.remove('sidebar-expanded');
            tooltip?.hide();
            hoverOpenTimer = null;
            hoverReleaseTimer = null;
        };
        if (typeof desktopMediaQuery.addEventListener === 'function') {
            desktopMediaQuery.addEventListener('change', handleDesktopViewportChange);
        } else if (typeof desktopMediaQuery.addListener === 'function') {
            desktopMediaQuery.addListener(handleDesktopViewportChange);
        }

        // The shell can be hidden while authentication/branding is settling.
        // Mark it ready after the first paint so the first reveal is stable;
        // only real pointer/focus changes should animate the rail afterward.
        window.requestAnimationFrame(() => {
            window.requestAnimationFrame(() => {
                document.querySelector('.app-shell')?.classList.add('sidebar-ready');
            });
        });

    }

    function initMobileNavigation() {
        const rail = document.getElementById('pageTabs');
        const shell = rail?.closest('.app-shell');
        const toggle = document.getElementById('mobileNavToggle');
        const closeButton = document.getElementById('mobileNavClose');
        const backdrop = document.getElementById('mobileNavBackdrop');
        if (!rail || !shell || !toggle) return;

        const mediaQuery = window.matchMedia('(max-width: 1199px)');
        const openLabel = '\u0641\u062a\u062d \u0627\u0644\u0642\u0627\u0626\u0645\u0629';

        const syncNavigationAria = () => {
            // On small screens the navigation is an always-visible tab rail,
            // not an off-canvas drawer. It must remain exposed to keyboard and
            // screen-reader users even while the legacy toggle is hidden.
            rail.removeAttribute('aria-hidden');
        };

        const resetNavigationPresentation = () => {
            shell.classList.remove('mobile-nav-open');
            document.body.classList.remove('mobile-nav-open');
            rail.classList.remove('is-mobile-open');
            toggle.setAttribute('aria-expanded', 'false');
            toggle.setAttribute('aria-label', openLabel);
            toggle.setAttribute('title', openLabel);
            const toggleLabel = toggle.querySelector('[data-mobile-nav-label]');
            if (toggleLabel) toggleLabel.textContent = openLabel;

            if (backdrop) {
                backdrop.hidden = true;
                backdrop.setAttribute('aria-hidden', 'true');
            }
            syncNavigationAria();
        };

        const setOpen = () => {
            // Keep the old event hooks harmless for cached markup or a stale
            // script, while the canonical mobile presentation remains a
            // visible four-column tab grid.
            resetNavigationPresentation();
        };

        toggle.addEventListener('click', () => setOpen());
        closeButton?.addEventListener('click', () => setOpen());
        backdrop?.addEventListener('click', () => setOpen());
        rail.addEventListener('click', (event) => {
            if (event.target.closest('[data-page-tab]')) setOpen();
        });
        document.addEventListener('keydown', (event) => {
            if (event.key === 'Escape' && shell.classList.contains('mobile-nav-open')) setOpen();
        });

        const handleViewportChange = () => setOpen();
        if (typeof mediaQuery.addEventListener === 'function') {
            mediaQuery.addEventListener('change', handleViewportChange);
        } else if (typeof mediaQuery.addListener === 'function') {
            mediaQuery.addListener(handleViewportChange);
        }

        setOpen();
    }

    function normalizeTab(name) {
        if (!validTabs.has(name)) return 'dashboard';
        if (window.topGymAuth?.isReady?.()) {
            if (!window.topGymAuth.getUser?.()) return 'dashboard';
            if ((name === 'management' || name === 'branding' || name === 'member-payment-methods' || name === 'saas-billing' || name === 'backup-history' || name === 'branches' || name === 'member-subscription-requests' || name === 'portal-analytics') && !window.topGymAuth.isOwner?.()) return window.topGymPermissions?.firstAccessibleTab?.(window.topGymAuth.getUser?.()) || 'members';
            if (!window.topGymAuth.canAccessTab(name)) return window.topGymPermissions?.firstAccessibleTab?.(window.topGymAuth.getUser?.()) || 'members';
        }
        return name;
    }

    function renderTab(name) {
        const overview = document.querySelector('.overview-grid');
        const dashboardHero = document.querySelector('.dashboard-page-actions');
        const dashboardSectionHeading = document.querySelector('.dashboard-section-heading');
        const workspace = document.querySelector('.workspace');
        const membersSection = document.getElementById('membersSection');
        const expensesSection = document.getElementById('expensesSection');
        const monthlyFinanceSnapshot = document.getElementById('monthlyFinanceSnapshot');
        const managementSection = document.getElementById('managementSection');
        const brandingSection = document.getElementById('brandingSection');
        const memberPaymentMethodsSection = document.getElementById('memberPaymentMethodsSection');
        const saasBillingSection = document.getElementById('saasBillingSection');
        const backupHistorySection = document.getElementById('backupHistorySection');
        const memberSubscriptionRequestsSection = document.getElementById('memberSubscriptionRequestsSection');
        const portalAnalyticsSection = document.getElementById('portalAnalyticsSection');
        const analyticsSection = document.getElementById('dashboardAnalytics');
        const dashboardStoreSummary = document.getElementById('dashboardStoreSummary');
        const reportsSection = document.getElementById('reportsSection');
        const feedbackSection = document.getElementById('feedbackSection');
        const permissionsSection = document.getElementById('permissionsSection');
        const attendanceSection = document.getElementById('attendanceSection');
        const librarySection = document.getElementById('librarySection');
        const traineesSection = document.getElementById('traineesSection');
        const intelligenceSection = document.getElementById('intelligenceSection');
        const storeSection = document.getElementById('storeSection');
        const branchesSection = document.getElementById('branchesSection');
        const isDashboard = name === 'dashboard';
        const isMembers = name === 'members';
        const isExpenses = name === 'expenses';
        const isManagement = name === 'management';
        const isBranding = name === 'branding';
        const isMemberPaymentMethods = name === 'member-payment-methods';
        const isSaasBilling = name === 'saas-billing';
        const isBackupHistory = name === 'backup-history';
        const isMemberSubscriptionRequests = name === 'member-subscription-requests';
        const isPortalAnalytics = name === 'portal-analytics';
        const isPermissions = name === 'permissions';
        const isReports = name === 'reports';
        const isFeedback = name === 'feedback';
        const isAttendance = name === 'attendance';
        const isLibrary = name === 'library';
        const isTrainees = name === 'trainees';
        const isIntelligence = name === 'intelligence';
        const isStore = name === 'store';
        const isBranches = name === 'branches';

        setHidden(dashboardHero, !isDashboard);
        setHidden(dashboardSectionHeading, !isDashboard);
        setHidden(overview, !isDashboard);
        setHidden(monthlyFinanceSnapshot, !isDashboard);
        setHidden(expensesSection, !isExpenses);
        setHidden(managementSection, !isManagement);
        setHidden(brandingSection, !isBranding);
        setHidden(memberPaymentMethodsSection, !isMemberPaymentMethods);
        setHidden(saasBillingSection, !isSaasBilling);
        setHidden(backupHistorySection, !isBackupHistory);
        setHidden(memberSubscriptionRequestsSection, !isMemberSubscriptionRequests);
        setHidden(portalAnalyticsSection, !isPortalAnalytics);
        const hideAnalytics = !isDashboard || !window.topGymAuth?.isOwner?.();
        setHidden(analyticsSection, hideAnalytics);
        // Dashboard data can finish after the user has already moved to a
        // different tab. Only reveal the optional store summary when both
        // conditions are true; the dashboard renderer owns availability.
        setHidden(dashboardStoreSummary, !isDashboard || dashboardStoreSummary?.dataset.dashboardStoreAvailable !== 'true');
        analyticsSection?.setAttribute('aria-hidden', String(hideAnalytics));
        setHidden(reportsSection, !isReports);
        setHidden(feedbackSection, !isFeedback);
        setHidden(permissionsSection, !isPermissions);
        setHidden(attendanceSection, !isAttendance);
        setHidden(librarySection, !isLibrary);
        setHidden(traineesSection, !isTrainees);
        setHidden(intelligenceSection, !isIntelligence);
        setHidden(storeSection, !isStore);
        setHidden(branchesSection, !isBranches);
        setHidden(workspace, isDashboard || isExpenses || isReports || isManagement || isBranding || isMemberPaymentMethods || isSaasBilling || isBackupHistory || isMemberSubscriptionRequests || isPortalAnalytics || isPermissions || isAttendance || isLibrary || isTrainees || isIntelligence || isFeedback || isStore || isBranches);
        setHidden(membersSection, !isMembers);

        const tabPanelIds = { 'saas-billing': 'saasBillingSection', 'backup-history': 'backupHistorySection', 'member-payment-methods': 'memberPaymentMethodsSection', 'member-subscription-requests': 'memberSubscriptionRequestsSection', 'portal-analytics': 'portalAnalyticsSection' };
        document.querySelectorAll('[data-page-tab]').forEach((button) => {
            const active = button.dataset.pageTab === name;
            button.classList.toggle('active', active);
            button.setAttribute('role', 'tab');
            button.setAttribute('aria-selected', String(active));
            button.toggleAttribute('aria-current', active);
            button.setAttribute('aria-controls', tabPanelIds[button.dataset.pageTab] || `${button.dataset.pageTab}Section`);
        });

        // A direct link such as #library can activate a tab that is outside
        // the initial RTL scroll position on tablet widths. Reveal it without
        // changing the page's vertical scroll or the tab data flow.
        const tabRail = document.getElementById('pageTabs');
        const activeTab = tabRail?.querySelector(`[data-page-tab="${name}"]`);
        if (tabRail && activeTab && tabRail.scrollWidth > tabRail.clientWidth) {
            activeTab.scrollIntoView({ block: 'nearest', inline: 'nearest' });
        }
    }

    async function activateTab(rawName) {
        if (window.topGymAuthReady) await window.topGymAuthReady.catch(() => null);
        if (activeTabName === 'branding' && rawName !== 'branding' && window.topGymBrandingEditor?.confirmLeave) {
            const canLeave = await window.topGymBrandingEditor.confirmLeave();
            if (!canLeave) return;
        }
        if (activeTabName === 'member-payment-methods' && rawName !== 'member-payment-methods' && window.topGymMemberPaymentMethodsEditor?.confirmLeave) {
            const canLeave = await window.topGymMemberPaymentMethodsEditor.confirmLeave();
            if (!canLeave) return;
        }
        const name = normalizeTab(rawName);
        const token = ++activationToken;
        document.body.classList.add('top-gym-navigation-pending');
        if (name === activeTabName) {
            document.body.classList.remove('top-gym-navigation-pending');
            return;
        }
        document.documentElement.setAttribute('data-top-gym-loading-tab', name);
        // Hide the previous screen immediately. Optional feature scripts can
        // take a round-trip to load, but dashboard-only content must never
        // remain visible while the next tab is being prepared.
        renderTab(name);
        const releaseProgress = window.topGymPerformance?.startTask?.('جاري تجهيز الشاشة…');
        try {
            await window.topGymEnsureTab?.(name);
        } catch (error) {
            // The section still opens so one unavailable optional feature cannot lock navigation.
            console.warn(`[TOP GYM] Failed to load the ${name} feature.`, error);
        } finally {
            releaseProgress?.();
        }
        if (token !== activationToken) return;
        renderTab(name);
        activeTabName = name;
        document.documentElement.dataset.topGymActiveTab = name;
        window.history.replaceState(null, '', `#${name}`);
        document.body.classList.remove('top-gym-navigation-pending');
        document.documentElement.removeAttribute('data-top-gym-loading-tab');
        window.dispatchEvent(new CustomEvent('topgym:tab-changed', { detail: { name } }));
    }

    document.addEventListener('DOMContentLoaded', () => {
        ensureBackupHistoryTab();
        initSidebarPin();
        initMobileNavigation();
        document.querySelectorAll('[data-page-tab]').forEach((button) => {
            button.setAttribute('role', 'tab');
        });
        // Use one delegated listener so tabs injected by optional modules
        // (for example the Gym-only Branches tab) remain navigable even when
        // they are created after this bootstrap handler runs.
        const tabRail = document.getElementById('pageTabs');
        tabRail?.addEventListener('click', (event) => {
            const button = event.target.closest?.('[data-page-tab]');
            if (!button || !tabRail.contains(button)) return;
            void activateTab(button.dataset.pageTab);
        });
        document.querySelectorAll('[data-page-tab-link]').forEach((button) => {
            button.addEventListener('click', () => { void activateTab(button.dataset.pageTabLink); });
        });
        document.querySelectorAll('[data-open-dialog-button]').forEach((button) => {
            button.addEventListener('click', () => {
                document.getElementById(button.dataset.openDialogButton)?.click();
            });
        });
        void activateTab(window.location.hash.slice(1) || 'dashboard');
    });

    window.addEventListener('hashchange', () => {
        void activateTab(window.location.hash.slice(1) || 'dashboard');
    });

    window.topGymActivateTab = activateTab;
})();
