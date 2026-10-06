        (() => {
            const list = document.getElementById('membersList');
            const pagination = document.getElementById('membersPagination');
            if (!list || !pagination) return;
            let pageController = null;
            const getState = () => window.topGymMembersState || null;

            function renderPagination() {
                const data = getState()?.pagination;
                const rawTotal = data?.total ?? data?.totalItems ?? data?.totalCount;
                const total = rawTotal === undefined
                    ? Number(getState()?.members?.length || 0)
                    : Number(rawTotal || 0);
                const pageSize = Math.max(1, Number(data?.pageSize || getState()?.membersPageSize || 5));
                const totalPages = Math.max(0, Number(data?.totalPages ?? data?.pages ?? (total ? Math.ceil(total / pageSize) : 0)));
                if (!data || total === 0 || totalPages === 0) {
                    pagination.hidden = true;
                    pagination.innerHTML = '';
                    return;
                }
                const page = Number(data.page || 1);
                const first = (page - 1) * pageSize + 1;
                const last = Math.min(page * pageSize, total);
                const hasPrevious = data.hasPrevious === undefined ? page > 1 : Boolean(data.hasPrevious);
                const hasNext = data.hasNext === undefined ? page < totalPages : Boolean(data.hasNext);
                const icon = (path) => `<svg class="ui-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${path}</svg>`;
                const pageButton = (targetPage, label, path, disabled = false, active = false, extraClass = '') => `<button class="btn ${active ? 'btn-primary' : 'btn-light'} btn-small members-page-button${active ? ' active' : ''}${extraClass ? ` ${extraClass}` : ''}" type="button" data-members-page="${targetPage}" aria-label="${label}" title="${label}" ${disabled ? 'disabled' : ''}>${path ? icon(path) : label}</button>`;
                pagination.hidden = false;
                pagination.innerHTML = `<span class="members-pagination-info">عرض ${first}–${last} من ${total}</span><div class="members-pagination-actions">${pageButton(1, 'أول صفحة', '<path d="m17 5-7 7 7 7"/><path d="M6 5v14"/>', !hasPrevious)}${pageButton(page - 1, 'الصفحة السابقة', '<path d="m14 5-7 7 7 7"/>', !hasPrevious)}${pageButton(page, String(page), '', false, true)}${pageButton(page + 1, 'الصفحة التالية', '<path d="m10 5 7 7-7 7"/>', !hasNext)}${pageButton(totalPages, 'آخر صفحة', '<path d="m7 5 7 7-7 7"/><path d="M18 5v14"/>', !hasNext)}<label class="members-page-size"><span>لكل صفحة</span><select data-members-page-size aria-label="عدد النتائج في الصفحة"><option value="5" ${pageSize === 5 ? 'selected' : ''}>5</option><option value="10" ${pageSize === 10 ? 'selected' : ''}>10</option><option value="20" ${pageSize === 20 ? 'selected' : ''}>20</option></select></label></div><div class="members-mobile-pagination">${pageButton(page - 1, 'السابق', '<path d="m10 5 7 7-7 7"/>', !hasPrevious, false, 'members-mobile-page-button')}<span dir="ltr">${page} / ${totalPages}</span>${pageButton(page + 1, 'التالي', '<path d="m14 5-7 7 7 7"/>', !hasNext, false, 'members-mobile-page-button')}</div>`;
            }

            async function loadPage(page, pageSize = Number(getState()?.membersPageSize || 5)) {
                if (pageController) pageController.abort();
                pageController = new AbortController();
                const appState = getState();
                if (!appState) return;
                const params = new URLSearchParams({
                    search: document.getElementById('searchInput').value.trim(),
                    status: document.getElementById('statusFilter').value,
                    sort: document.getElementById('sortFilter').value,
                    page: String(page),
                    pageSize: String(pageSize)
                });
                appState.membersPageSize = pageSize;
                list.innerHTML = '<div class="loading">جاري تحميل الصفحة…</div>';
                try {
                    const response = await api(`/api/members?${params}`, { signal: pageController.signal });
                    appState.members = response.members || [];
                    appState.pagination = response.pagination || null;
                    renderMembers();
                    renderPagination();
                } catch (error) {
                    if (error.name === 'AbortError') return;
                    appState.pagination = null;
                    list.innerHTML = `<div class="empty">${escapeHtml(error.message)}</div>`;
                    pagination.hidden = true;
                    await notify(error.message, 'error');
                }
            }

            function enhanceDesktopPageWindow() {
                const actions = pagination.querySelector('.members-pagination-actions');
                const active = actions?.querySelector('.members-page-button.active');
                if (!actions || !active || actions.querySelector('.members-pagination-window')) return;
                const data = getState()?.pagination;
                const total = Number(data?.total ?? data?.totalItems ?? data?.totalCount ?? 0);
                const pageSize = Math.max(1, Number(data?.pageSize || getState()?.membersPageSize || 5));
                const totalPages = Math.max(0, Number(data?.totalPages ?? data?.pages ?? (total ? Math.ceil(total / pageSize) : 0)));
                const currentPage = Number(data?.page || 1);
                const targets = totalPages <= 7
                    ? Array.from({ length: totalPages }, (_, index) => index + 1)
                    : currentPage <= 3
                        ? [1, 2, 3, 4, 5, 'ellipsis', totalPages]
                        : currentPage >= totalPages - 2
                            ? [1, 'ellipsis', totalPages - 4, totalPages - 3, totalPages - 2, totalPages - 1, totalPages]
                            : [1, 'ellipsis', currentPage - 1, currentPage, currentPage + 1, 'ellipsis', totalPages];
                const windowElement = document.createElement('span');
                windowElement.className = 'members-pagination-window';
                windowElement.setAttribute('role', 'group');
                windowElement.setAttribute('aria-label', 'صفحات المشتركين');
                targets.forEach((target) => {
                    if (target === 'ellipsis') {
                        const ellipsis = document.createElement('span');
                        ellipsis.className = 'members-pagination-ellipsis';
                        ellipsis.setAttribute('aria-hidden', 'true');
                        ellipsis.textContent = '…';
                        windowElement.append(ellipsis);
                        return;
                    }
                    const isCurrent = target === currentPage;
                    const button = document.createElement('button');
                    button.className = `btn ${isCurrent ? 'btn-primary active' : 'btn-light'} btn-small members-page-button`;
                    button.type = 'button';
                    button.dataset.membersPage = String(target);
                    button.setAttribute('aria-label', `صفحة ${target}`);
                    button.title = `صفحة ${target}`;
                    button.textContent = String(target);
                    if (isCurrent) button.setAttribute('aria-current', 'page');
                    windowElement.append(button);
                });
                active.replaceWith(windowElement);
            }

            function initializePagination() {
                if (pagination.dataset.bound === 'true') return;
                pagination.dataset.bound = 'true';
                renderPagination();
                new MutationObserver(enhanceDesktopPageWindow).observe(pagination, { childList: true });
                enhanceDesktopPageWindow();
                pagination.addEventListener('click', (event) => {
                    const button = event.target.closest('[data-members-page]');
                    if (!button || button.disabled) return;
                    loadPage(Number(button.dataset.membersPage));
                });
                pagination.addEventListener('change', (event) => {
                    const select = event.target.closest('[data-members-page-size]');
                    if (!select) return;
                    loadPage(1, Number(select.value) || 5);
                });
                document.addEventListener('input', (event) => {
                    if (event.target.id === 'searchInput') {
                        const appState = getState();
                        if (appState) appState.pagination = null;
                        pagination.hidden = true;
                    }
                }, true);
                document.addEventListener('change', (event) => {
                    if (event.target.id === 'statusFilter' || event.target.id === 'sortFilter') {
                        const appState = getState();
                        if (appState) appState.pagination = null;
                        pagination.hidden = true;
                    }
                }, true);
                new MutationObserver(renderPagination).observe(list, { childList: true, subtree: true });
            }

            if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initializePagination, { once: true });
            else initializePagination();
        })();
