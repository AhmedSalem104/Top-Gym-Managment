        (() => {
            const list = document.getElementById('membersList');
            const pagination = document.getElementById('membersPagination');
            if (!list || !pagination) return;
            let pageController = null;

            function renderPagination() {
                const data = state.pagination;
                const total = Number(data?.total || 0);
                const totalPages = Number(data?.totalPages || 0);
                if (!data || total === 0 || totalPages === 0) {
                    pagination.hidden = true;
                    pagination.innerHTML = '';
                    return;
                }
                const page = Number(data.page || 1);
                const pageSize = Number(data.pageSize || 5);
                const first = (page - 1) * pageSize + 1;
                const last = Math.min(page * pageSize, total);
                const icon = (path) => `<svg class="ui-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${path}</svg>`;
                const pageButton = (targetPage, label, path, disabled = false, active = false) => `<button class="btn ${active ? 'btn-primary' : 'btn-light'} btn-small members-page-button${active ? ' active' : ''}" type="button" data-members-page="${targetPage}" aria-label="${label}" title="${label}" ${disabled ? 'disabled' : ''}>${path ? icon(path) : label}</button>`;
                pagination.hidden = false;
                pagination.innerHTML = `<span class="members-pagination-info">عرض ${first}–${last} من ${total}</span><div class="members-pagination-actions">${pageButton(1, 'أول صفحة', '<path d="m17 5-7 7 7 7"/><path d="M6 5v14"/>', !data.hasPrevious)}${pageButton(page - 1, 'الصفحة السابقة', '<path d="m14 5-7 7 7 7"/>', !data.hasPrevious)}${pageButton(page, String(page), '', false, true)}${pageButton(page + 1, 'الصفحة التالية', '<path d="m10 5 7 7-7 7"/>', !data.hasNext)}${pageButton(totalPages, 'آخر صفحة', '<path d="m7 5 7 7-7 7"/><path d="M18 5v14"/>', !data.hasNext)}<label class="members-page-size"><span>لكل صفحة</span><select data-members-page-size aria-label="عدد النتائج في الصفحة"><option value="5" ${pageSize === 5 ? 'selected' : ''}>5</option><option value="10" ${pageSize === 10 ? 'selected' : ''}>10</option><option value="20" ${pageSize === 20 ? 'selected' : ''}>20</option></select></label></div>`;
            }

            async function loadPage(page, pageSize = Number(state.membersPageSize || 5)) {
                if (pageController) pageController.abort();
                pageController = new AbortController();
                const params = new URLSearchParams({
                    search: document.getElementById('searchInput').value.trim(),
                    status: document.getElementById('statusFilter').value,
                    sort: document.getElementById('sortFilter').value,
                    page: String(page),
                    pageSize: String(pageSize)
                });
                state.membersPageSize = pageSize;
                list.innerHTML = '<div class="loading">جاري تحميل الصفحة…</div>';
                try {
                    const response = await api(`/api/members?${params}`, { signal: pageController.signal });
                    state.members = response.members || [];
                    state.pagination = response.pagination || null;
                    renderMembers();
                    renderPagination();
                } catch (error) {
                    if (error.name === 'AbortError') return;
                    state.pagination = null;
                    list.innerHTML = `<div class="empty">${escapeHtml(error.message)}</div>`;
                    pagination.hidden = true;
                    await notify(error.message, 'error');
                }
            }

            document.addEventListener('DOMContentLoaded', () => {
                renderPagination();
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
                        state.pagination = null;
                        pagination.hidden = true;
                    }
                }, true);
                document.addEventListener('change', (event) => {
                    if (event.target.id === 'statusFilter' || event.target.id === 'sortFilter') {
                        state.pagination = null;
                        pagination.hidden = true;
                    }
                }, true);
                new MutationObserver(renderPagination).observe(list, { childList: true, subtree: true });
            });
        })();
