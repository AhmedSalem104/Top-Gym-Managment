        (() => {
            const list = document.getElementById('membersList');
            const STATUS_LABELS = { active: 'نشطة', expiring_soon: 'قريبة الانتهاء', expired: 'منتهية', frozen: 'مجمدة' };
            const EVENT_LABELS = { created: 'إضافة اشتراك', updated: 'تعديل بيانات', renewed: 'تجديد اشتراك', frozen: 'تجميد العضوية', resumed: 'استئناف العضوية', payment_updated: 'تحديث الدفع' };
            const PAYMENT_LABELS = { cash: 'نقدي', card: 'بطاقة', transfer: 'تحويل', other: 'أخرى' };
            const PLAN_LABELS = { gym_only: 'جيم فقط', gym_cardio: 'جيم وكارديو' };
            const TYPE_LABELS = { monthly: 'شهرية', half_month: 'نصف شهر', quarterly: 'ربع سنوية', semiannual: 'نصف سنوية', annual: 'سنوية', 'two month': 'شهرين', custom_mslzyl8m: 'شهرين' };

            function escapeHtml(value) {
                return String(value ?? '').replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));
            }

            function initials(name) {
                const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
                return (parts.slice(0, 2).map((part) => part.charAt(0)).join('') || 'TG').toUpperCase();
            }

            function printDate(value) {
                if (!value) return '—';
                const raw = String(value);
                const date = /^\d{4}-\d{2}-\d{2}$/.test(raw) ? new Date(`${raw}T00:00:00`) : new Date(raw);
                if (Number.isNaN(date.getTime())) return raw;
                return new Intl.DateTimeFormat('ar-EG-u-ca-gregory', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(date);
            }

            function printDateTime(value) {
                if (!value) return '—';
                const date = new Date(value);
                if (Number.isNaN(date.getTime())) return String(value);
                return new Intl.DateTimeFormat('ar-EG-u-ca-gregory', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', hour: 'numeric', minute: '2-digit' }).format(date);
            }

            function money(value) {
                return `${Number(value || 0).toLocaleString('ar-EG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ج.م`;
            }

            function assetUrl(path) {
                return new URL(path, window.location.href).href;
            }

            function planLabel(value) { return PLAN_LABELS[value] || value || '—'; }
            function typeLabel(value) { return TYPE_LABELS[value] || value || '—'; }
            function paymentLabel(value) { return PAYMENT_LABELS[value] || value || '—'; }
            function statusLabel(value) { return STATUS_LABELS[value] || value || '—'; }
            function currentMembership(data) { return data.memberships?.[data.memberships.length - 1] || null; }

            function infoItem(label, value) {
                return `<div class="print-info-item"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`;
            }

            function billingItem(label, value, extraClass = '') {
                return `<div class="print-billing-item ${extraClass}"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`;
            }

            function eventSummary(event) {
                const details = event.details || {};
                const values = [];
                if (details.membershipPlan) values.push(planLabel(details.membershipPlan));
                if (details.membershipType) values.push(typeLabel(details.membershipType));
                if (details.startDate) values.push(`من ${printDate(details.startDate)}`);
                if (details.endDate) values.push(`إلى ${printDate(details.endDate)}`);
                if (details.amountDue !== undefined) values.push(`مستحق ${money(details.amountDue)}`);
                if (details.amountPaid !== undefined) values.push(`مدفوع ${money(details.amountPaid)}`);
                if (details.days) values.push(`${details.days} يوم`);
                return values.join(' · ') || 'تم تسجيل العملية في سجل العضو.';
            }

            function membershipHistory(data) {
                const rows = (data.memberships || []).map((item) => `<tr>
                    <td><span class="print-table-main">${escapeHtml(planLabel(item.plan))}</span><span class="print-table-sub">${escapeHtml(typeLabel(item.type))}</span></td>
                    <td>${escapeHtml(printDate(item.startDate))}<span class="print-table-sub">حتى ${escapeHtml(printDate(item.effectiveEndDate))}</span></td>
                    <td><span class="print-status ${escapeHtml(item.status)}">${escapeHtml(statusLabel(item.status))}</span></td>
                    <td>${escapeHtml(money(item.amountDue))}<span class="print-table-sub">متبقي ${escapeHtml(money(item.amountRemaining))}</span></td>
                    <td>${escapeHtml(printDate(item.paidAt))}</td>
                </tr>`).join('');
                return rows || '<tr><td colspan="5"><div class="print-empty">لا توجد اشتراكات مسجلة.</div></td></tr>';
            }

            function freezeHistory(data) {
                const rows = (data.freezes || []).map((item) => `<tr>
                    <td>${escapeHtml(printDate(item.startDate))}</td>
                    <td>${escapeHtml(printDate(item.endDate))}</td>
                    <td>${escapeHtml(item.resumedDate ? printDate(item.resumedDate) : 'نشط')}</td>
                    <td>${escapeHtml(`${item.days || 0} يوم`)}</td>
                    <td>${escapeHtml(item.reason || '—')}</td>
                </tr>`).join('');
                return rows || '<tr><td colspan="5"><div class="print-empty">لا توجد عمليات تجميد.</div></td></tr>';
            }

            function eventHistory(data) {
                const rows = (data.events || []).map((event) => `<tr>
                    <td>${escapeHtml(printDateTime(event.createdAt))}</td>
                    <td>${escapeHtml(EVENT_LABELS[event.eventType] || event.eventType || 'عملية')}</td>
                    <td>${escapeHtml(eventSummary(event))}</td>
                </tr>`).join('');
                return rows || '<tr><td colspan="3"><div class="print-empty">لا توجد عمليات مسجلة.</div></td></tr>';
            }

            function buildPrintDocument(data, mode) {
                const member = data.member || {};
                const membership = currentMembership(data);
                const title = mode === 'full' ? 'ملف العضوية الكامل' : mode === 'new' ? 'إيصال اشتراك جديد' : 'إيصال الاشتراك';
                const memberName = member.fullName || 'عضو الجيم';
                const memberInfo = `<section class="print-section">
                    <div class="print-section-title"><div><span class="print-section-kicker">بيانات العميل</span><h2>بيانات المشترك</h2></div></div>
                    <div class="print-member-hero"><span class="print-member-avatar">${escapeHtml(initials(memberName))}</span><div class="print-member-copy"><h2>${escapeHtml(memberName)}</h2><p>${escapeHtml(member.phone || '—')}${member.email ? ` · ${escapeHtml(member.email)}` : ''}</p></div></div>
                    <div class="print-info-grid" style="margin-top: 10px;">${infoItem('رقم العضو', `#${member.id || '—'}`)}${infoItem('تاريخ التسجيل', printDate(member.registrationDate))}${infoItem('البريد الإلكتروني', member.email || '—')}${infoItem('ملاحظات العضو', member.notes || '—')}</div>
                </section>`;
                const membershipInfo = membership ? `<section class="print-section">
                    <div class="print-section-title"><div><span class="print-section-kicker">تفاصيل العضوية</span><h2>${mode === 'new' ? 'تفاصيل الاشتراك الجديد' : 'الاشتراك الحالي'}</h2></div><span class="print-status ${escapeHtml(membership.status)}">${escapeHtml(statusLabel(membership.status))}</span></div>
                    <div class="print-info-grid">${infoItem('الباقة', planLabel(membership.plan))}${infoItem('نوع العضوية', typeLabel(membership.type))}${infoItem('تاريخ البداية', printDate(membership.startDate))}${infoItem('تاريخ الانتهاء', printDate(membership.effectiveEndDate))}${infoItem('الأيام المتبقية', membership.status === 'expired' ? `منتهية منذ ${Math.abs(Number(membership.daysRemaining || 0))} يوم` : `${Number(membership.daysRemaining || 0)} يوم`)}${infoItem('التجميد', `${Number(membership.freezeCount || 0)}/${Number(membership.freezeLimit || 3)}`)}${infoItem('تاريخ الدفع', printDate(membership.paidAt))}${infoItem('طريقة الدفع', paymentLabel(membership.paymentMethod))}</div>
                    <div class="print-billing-grid" style="margin-top: 10px;">${billingItem('السعر الأساسي', money(membership.listPrice))}${billingItem('الخصم', money(membership.discountAmount))}${billingItem('المستحق', money(membership.amountDue))}${billingItem('المتبقي', money(membership.amountRemaining), 'remaining')}</div>
                    ${membership.notes ? `<p class="print-notes" style="margin-top: 10px;"><strong>ملاحظات الاشتراك:</strong> ${escapeHtml(membership.notes)}</p>` : ''}
                </section>` : '<section class="print-section"><div class="print-empty">لا يوجد اشتراك مسجل لهذا العضو.</div></section>';
                const history = mode === 'full' ? `<section class="print-section"><div class="print-section-title"><div><span class="print-section-kicker">السجل الكامل</span><h2>سجل الاشتراكات والتجديدات</h2></div></div><div class="print-table-wrap"><table class="print-table"><thead><tr><th>الباقة والمدة</th><th>الفترة</th><th>الحالة</th><th>الحساب</th><th>الدفع</th></tr></thead><tbody>${membershipHistory(data)}</tbody></table></div></section>
                    <section class="print-section"><div class="print-section-title"><div><span class="print-section-kicker">سجل التجميد</span><h2>عمليات التجميد</h2></div></div><div class="print-table-wrap"><table class="print-table"><thead><tr><th>البداية</th><th>النهاية</th><th>الاستئناف</th><th>المدة</th><th>السبب</th></tr></thead><tbody>${freezeHistory(data)}</tbody></table></div></section>
                    <section class="print-section"><div class="print-section-title"><div><span class="print-section-kicker">سجل النشاط</span><h2>كل العمليات المسجلة</h2></div></div><div class="print-table-wrap"><table class="print-table"><thead><tr><th>التاريخ</th><th>العملية</th><th>التفاصيل</th></tr></thead><tbody>${eventHistory(data)}</tbody></table></div></section>` : '';
                const printHeader = `<header class="print-header"><div class="print-brand"><img class="print-logo" src="${assetUrl('/favicon.svg?v=2')}" alt=""><div class="print-brand-copy"><h1 class="print-brand-title">TOP GYM</h1></div></div><div class="print-document-meta"><strong>${escapeHtml(title)}</strong><span>رقم العضو: #${escapeHtml(member.id || '—')}</span><span>تاريخ الطباعة: ${escapeHtml(printDate(new Date()))}</span></div></header>`;
                const printFooter = `<footer class="print-footer"><div class="print-footer-management"><strong>إدارة الجيم</strong><span>C/ Ahmed Abdel Hamid · C/ Karim Abdelhamid</span></div><span class="print-signature">اعتماد الإدارة</span></footer>`;
                return `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escapeHtml(title)} - TOP GYM</title><link rel="stylesheet" href="${assetUrl('/css/print.css?v=3')}"></head><body><main class="print-sheet">${printHeader}<div class="print-accent"></div>${memberInfo}${membershipInfo}${history}${printFooter}</main></body></html>`;
            }

            function writeWindow(printWindow, html) {
                printWindow.document.open();
                printWindow.document.write(html);
                printWindow.document.close();
            }

            let pdfLibraryPromise = null;

            function loadPdfLibrary() {
                if (window.html2pdf) return Promise.resolve();
                if (pdfLibraryPromise) return pdfLibraryPromise;
                pdfLibraryPromise = new Promise((resolve, reject) => {
                    const script = document.createElement('script');
                    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js';
                    script.onload = () => resolve();
                    script.onerror = () => reject(new Error('تعذر تحميل أداة إنشاء ملف PDF.'));
                    document.head.append(script);
                });
                return pdfLibraryPromise;
            }

            async function fetchMemberDetails(memberId) {
                const response = await fetch(`/api/members/${encodeURIComponent(memberId)}/details`, { headers: { 'Content-Type': 'application/json' } });
                const data = await response.json().catch(() => ({}));
                if (!response.ok) throw new Error(data.error || 'تعذر تجهيز بيانات العضو.');
                return data;
            }

            async function createPdfFile(memberId, mode = 'new') {
                await loadPdfLibrary();
                const data = await fetchMemberDetails(memberId);
                const parsed = new DOMParser().parseFromString(buildPrintDocument(data, mode), 'text/html');
                const sheet = parsed.querySelector('.print-sheet');
                if (!sheet) throw new Error('تعذر تجهيز قالب PDF.');
                const cssResponse = await fetch(assetUrl('/css/print.css?v=3'));
                const cssText = await cssResponse.text();
                const holder = document.createElement('div');
                holder.dir = 'rtl';
                holder.style.cssText = 'position:fixed;left:-100000px;top:0;width:190mm;min-height:1px;overflow:visible;background:#fff;z-index:-1;';
                const style = document.createElement('style');
                style.textContent = cssText;
                holder.append(style, sheet);
                document.body.append(holder);
                try {
                    if (document.fonts?.ready) await document.fonts.ready;
                    await Promise.all([...holder.querySelectorAll('img')].map((image) => image.complete ? Promise.resolve() : new Promise((resolve) => { image.onload = resolve; image.onerror = resolve; })));
                    const blob = await window.html2pdf().set({
                        margin: [8, 8, 8, 8],
                        image: { type: 'jpeg', quality: .98 },
                        html2canvas: { scale: 2, useCORS: true, backgroundColor: '#fff', logging: false, letterRendering: true },
                        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
                        pagebreak: { mode: ['css', 'legacy'] }
                    }).from(sheet).outputPdf('blob');
                    const filename = `TOP-GYM-${String(data.member?.id || memberId)}-${mode}.pdf`;
                    return { data, file: new File([blob], filename, { type: 'application/pdf' }) };
                } finally {
                    holder.remove();
                }
            }

            async function printMember(memberId, mode = 'membership') {
                const printWindow = window.open('', '_blank', 'width=980,height=820');
                if (!printWindow) {
                    window.alert('يرجى السماح بالنوافذ المنبثقة لإتمام الطباعة.');
                    return;
                }
                writeWindow(printWindow, `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><link rel="stylesheet" href="${assetUrl('/css/print.css?v=3')}"></head><body><div class="print-loading">جاري تجهيز مستند الطباعة…</div></body></html>`);
                try {
                    const data = await fetchMemberDetails(memberId);
                    writeWindow(printWindow, buildPrintDocument(data, mode));
                    printWindow.onafterprint = () => printWindow.close();
                    window.setTimeout(() => { printWindow.focus(); printWindow.print(); }, 450);
                } catch (error) {
                    writeWindow(printWindow, `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><link rel="stylesheet" href="${assetUrl('/css/print.css?v=3')}"></head><body><div class="print-error">${escapeHtml(error.message)}</div></body></html>`);
                }
            }

            window.topGymPrint = { ...(window.topGymPrint || {}), printMember, createPdfFile };

            function ensurePrintActions() {
                if (!list) return;
                list.querySelectorAll('.table-actions').forEach((actions) => {
                    if (actions.querySelector('[data-action="print"]')) return;
                    const row = actions.closest('[data-member-id]');
                    if (!row) return;
                    const button = document.createElement('button');
                    button.className = 'btn btn-light btn-small icon-action table-print-source';
                    button.type = 'button';
                    button.dataset.action = 'print';
                    button.dataset.label = 'طباعة الاشتراك';
                    button.dataset.id = row.dataset.memberId;
                    button.setAttribute('aria-label', 'طباعة الاشتراك');
                    button.title = 'طباعة الاشتراك';
                    button.innerHTML = '<span class="print-source-icon" aria-hidden="true">⎙</span>';
                    actions.append(button);
                });
            }

            function ensureDetailsPrintButton() {
                const dialog = document.getElementById('detailsDialog');
                const head = dialog?.querySelector('.details-dialog-head');
                if (!dialog || !head || head.dataset.printReady === 'true') return;
                const closeButton = document.getElementById('detailsClose');
                const actions = document.createElement('div');
                actions.className = 'print-dialog-actions';
                const printButton = document.createElement('button');
                printButton.className = 'btn btn-light btn-small print-details-button';
                printButton.type = 'button';
                printButton.textContent = 'طباعة الملف الكامل';
                printButton.addEventListener('click', () => {
                    const memberId = dialog.dataset.memberId;
                    if (memberId) printMember(memberId, 'full');
                });
                actions.append(printButton);
                if (closeButton) actions.append(closeButton);
                head.append(actions);
                head.dataset.printReady = 'true';
            }

            if (list) {
                list.addEventListener('click', (event) => {
                    const button = event.target.closest('button[data-action]');
                    if (!button || !list.contains(button)) return;
                    const row = button.closest('[data-member-id]');
                    if (!row) return;
                    const memberId = row.dataset.memberId;
                    if (button.dataset.action === 'details') {
                        document.getElementById('detailsDialog')?.setAttribute('data-member-id', memberId);
                        return;
                    }
                    if (button.dataset.action === 'print') {
                        event.preventDefault();
                        event.stopImmediatePropagation();
                        printMember(memberId, 'membership');
                    }
                }, true);
                new MutationObserver(ensurePrintActions).observe(list, { childList: true, subtree: true });
            }

            document.addEventListener('DOMContentLoaded', () => {
                ensurePrintActions();
                ensureDetailsPrintButton();
            });
        })();
