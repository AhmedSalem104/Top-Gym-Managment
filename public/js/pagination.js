        (() => {
            const list = document.getElementById('membersList');
            const pagination = document.getElementById('membersPagination');
            if (!list || !pagination) return;
            let pageController = null;

            function renderPagination() {
                const data = state.pagination;
                const total = Number(data?.total || 0);
                const totalPages = Number(data?.totalPages || 0);
                if (!data || totalPages <= 1) {
                    pagination.hidden = true;
                    pagination.innerHTML = '';
                    return;
                }
                const page = Number(data.page || 1);
                const pageSize = Number(data.pageSize || 5);
                const first = (page - 1) * pageSize + 1;
                const last = Math.min(page * pageSize, total);
                pagination.hidden = false;
                pagination.innerHTML = `<span class="members-pagination-info">عرض ${first}–${last} من ${total} · صفحة ${page} من ${totalPages}</span><div class="members-pagination-actions"><button class="btn btn-light btn-small" type="button" data-members-page="${page - 1}" ${data.hasPrevious ? '' : 'disabled'}>السابق</button><button class="btn btn-primary btn-small" type="button" data-members-page="${page + 1}" ${data.hasNext ? '' : 'disabled'}>التالي</button></div>`;
            }

            async function loadPage(page) {
                if (pageController) pageController.abort();
                pageController = new AbortController();
                const params = new URLSearchParams({
                    search: document.getElementById('searchInput').value.trim(),
                    status: document.getElementById('statusFilter').value,
                    sort: document.getElementById('sortFilter').value,
                    page: String(page),
                    pageSize: '5'
                });
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
