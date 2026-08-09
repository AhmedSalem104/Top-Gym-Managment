        (() => {
            const baseRenderDetails = window.renderDetails;
            if (typeof baseRenderDetails !== 'function') return;
            window.renderDetails = (data) => {
                baseRenderDetails(data);
                const freezes = data.freezes || [];
                const limit = Number(data.memberships?.[0]?.freezeLimit || 3);
                const summaryCard = document.querySelector('#detailsContent .details-summary-card:nth-child(3)');
                if (summaryCard) summaryCard.innerHTML = `<span>التجميد المستخدم</span><strong>${freezes.length}/${limit}</strong><small class="table-sub">متبقي ${Math.max(0, limit - freezes.length)} مرات</small>`;
                const membershipTable = document.querySelector('#detailsContent .details-section .history-table');
                membershipTable?.querySelectorAll('tbody tr').forEach((row, index) => {
                    const membership = data.memberships?.[index];
                    const freezeCell = row.lastElementChild;
                    if (!membership || !freezeCell) return;
                    freezeCell.innerHTML = `<span class="freeze-usage${membership.freezeCount >= (membership.freezeLimit || limit) ? ' complete' : ''}"><strong>${membership.freezeCount || 0}/${membership.freezeLimit || limit}</strong><span>متبقي ${membership.freezesRemaining ?? Math.max(0, limit - (membership.freezeCount || 0))}</span></span>`;
                });
            };
        })();
