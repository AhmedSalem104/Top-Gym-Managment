        (() => {
            const list = document.getElementById('membersList');
            const STATUS_LABELS = { active: 'نشطة', expiring_soon: 'قريبة الانتهاء', expired: 'منتهية', frozen: 'مجمدة' };
            const EVENT_LABELS = { created: 'إضافة اشتراك', updated: 'تعديل بيانات', renewed: 'تجديد اشتراك', frozen: 'تجميد العضوية', resumed: 'استئناف العضوية', payment_updated: 'تحديث الدفع' };
            const PAYMENT_LABELS = { cash: 'نقدي', card: 'بطاقة', transfer: 'تحويل', other: 'أخرى' };
            const PAYMENT_TRANSACTION_LABELS = { subscription: 'اشتراك', payment: 'دفعة', adjustment: 'تسوية' };
            const PLAN_LABELS = { gym_only: 'جيم فقط', gym_cardio: 'جيم وكارديو' };
            const TYPE_LABELS = { monthly: 'شهرية', half_month: 'نصف شهر', quarterly: 'ربع سنوية', semiannual: 'نصف سنوية', annual: 'سنوية', 'two month': 'شهرين', custom_mslzyl8m: 'شهرين' };

            function printPaperColor() {
                return window.topGymThemeValue?.('--qr-paper')
                    || getComputedStyle(document.documentElement).getPropertyValue('--bg-surface').trim();
            }

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

            function branding() {
                return window.topGymBranding?.get?.() || {};
            }

            function brandName() {
                return branding().identity?.brandName || 'Logic Fit';
            }

            function safeBrandHex(value, fallback) {
                return /^#[\da-f]{6}$/i.test(String(value || '')) ? String(value).toUpperCase() : fallback;
            }

            function printBrandVariables() {
                const config = branding();
                const theme = config.themes?.light || {};
                const primary = safeBrandHex(theme.primary, '#7C3AED');
                const hover = safeBrandHex(theme.primaryHover, '#6D28D9');
                const text = safeBrandHex(theme.textPrimary, '#172033');
                const muted = safeBrandHex(theme.textMuted, '#718096');
                const border = safeBrandHex(theme.border, '#D9E2EF');
                const surface = safeBrandHex(theme.card, '#F5F9FF');
                const borderSoft = safeBrandHex(theme.borderSecondary, '#E7EDF5');
                return `<style data-top-gym-print-brand>:root{--print-brand-primary:${primary};--print-brand-primary-hover:${hover};--print-brand-text:${text};--print-brand-muted:${muted};--print-brand-border:${border};--print-brand-surface:${surface};--print-brand-border-soft:${borderSoft};}</style>`;
            }

            function printStylesheetLink() {
                return '<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link rel="stylesheet" data-top-gym-print-fonts href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;500;600;700;800&display=swap"><link rel="stylesheet" data-top-gym-print-styles href="' + assetUrl('/css/print.css?v=5') + '">' + printBrandVariables();
            }

            function printBrandMarkup(subtitle = 'إدارة الجيم') {
                const config = branding();
                const logo = config.assets?.printLogo?.url || config.assets?.primaryLogo?.url || '/assets/gym-brand.svg?v=2';
                return '<div class="print-brand"><img class="print-logo" src="' + assetUrl(logo) + '" alt="' + escapeHtml(brandName()) + '"><div class="print-brand-copy"><h1 class="print-brand-title">' + escapeHtml(brandName()) + '</h1><span class="print-brand-subtitle">' + escapeHtml(subtitle) + '</span></div></div>';
            }

            function printFooterMarkup(context = 'إدارة الجيم', generatedSystem = false) {
                const config = branding();
                const footer = config.documents?.footer || 'إدارة أذكى، أداء أفضل.';
                return '<footer class="print-footer"><div class="print-footer-management"><strong>' + escapeHtml(config.identity?.companyName || brandName()) + '</strong><span>' + escapeHtml(context) + ' · ' + escapeHtml(generatedSystem ? `From ${brandName()} System` : footer) + '</span></div><span class="print-signature">اعتماد الإدارة</span></footer>';
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

            function paymentHistory(data) {
                const rows = (data.payments || []).map((payment) => `<tr>
                    <td>${escapeHtml(payment.receiptNumber || `TG-${String(payment.id).padStart(6, '0')}`)}</td>
                    <td>${escapeHtml(printDateTime(payment.transactionDate || payment.createdAt))}</td>
                    <td>${escapeHtml(PAYMENT_TRANSACTION_LABELS[payment.transactionType] || payment.transactionType || 'دفعة')}</td>
                    <td>${escapeHtml(planLabel(payment.plan))}<span class="print-table-sub">${escapeHtml(typeLabel(payment.type))}</span></td>
                    <td>${escapeHtml(money(payment.amountPaid))}</td>
                    <td>${escapeHtml(money(payment.amountRemaining))}</td>
                    <td>${escapeHtml(paymentLabel(payment.paymentMethod))}</td>
                    <td>${escapeHtml(payment.notes || '—')}</td>
                </tr>`).join('');
                return rows || '<tr><td colspan="8"><div class="print-empty">لا توجد مدفوعات أو إيصالات مسجلة.</div></td></tr>';
            }

            function buildPrintDocument(data, mode) {
                const member = data.member || {};
                const membership = currentMembership(data);
                const title = mode === 'full' ? 'ملف العضوية الكامل' : mode === 'new' ? 'إيصال اشتراك جديد' : 'إيصال الاشتراك';
                const memberName = member.fullName || 'عضو الجيم';
                const memberInfo = `<section class="print-section">
                    <div class="print-section-title"><div><span class="print-section-kicker">بيانات العميل</span><h2>بيانات المشترك</h2></div></div>
                    <div class="print-member-hero"><span class="print-member-avatar">${escapeHtml(initials(memberName))}</span><div class="print-member-copy"><h2>${escapeHtml(memberName)}</h2><p>${escapeHtml(member.phone || '—')}${member.email ? ` · ${escapeHtml(member.email)}` : ''}</p></div></div>
                    <div class="print-info-grid">${infoItem('رقم العضو', `#${member.id || '—'}`)}${infoItem('تاريخ التسجيل', printDate(member.registrationDate))}${infoItem('البريد الإلكتروني', member.email || '—')}${infoItem('ملاحظات العضو', member.notes || '—')}</div>
                </section>`;
                const membershipInfo = membership ? `<section class="print-section">
                    <div class="print-section-title"><div><span class="print-section-kicker">تفاصيل العضوية</span><h2>${mode === 'new' ? 'تفاصيل الاشتراك الجديد' : 'الاشتراك الحالي'}</h2></div><span class="print-status ${escapeHtml(membership.status)}">${escapeHtml(statusLabel(membership.status))}</span></div>
                    <div class="print-info-grid">${infoItem('الباقة', planLabel(membership.plan))}${infoItem('نوع العضوية', typeLabel(membership.type))}${infoItem('تاريخ البداية', printDate(membership.startDate))}${infoItem('تاريخ الانتهاء', printDate(membership.effectiveEndDate))}${infoItem('الأيام المتبقية', membership.status === 'expired' ? `منتهية منذ ${Math.abs(Number(membership.daysRemaining || 0))} يوم` : `${Number(membership.daysRemaining || 0)} يوم`)}${infoItem('التجميد', `${Number(membership.freezeCount || 0)}/${Number(membership.freezeLimit || 3)}`)}${infoItem('تاريخ الدفع', printDate(membership.paidAt))}${infoItem('طريقة الدفع', paymentLabel(membership.paymentMethod))}</div>
                    <div class="print-billing-grid">${billingItem('السعر الأساسي', money(membership.listPrice))}${billingItem('الخصم', money(membership.discountAmount))}${billingItem('المستحق', money(membership.amountDue))}${billingItem('المتبقي', money(membership.amountRemaining), 'remaining')}</div>
                    ${membership.notes ? `<p class="print-notes"><strong>ملاحظات الاشتراك:</strong> ${escapeHtml(membership.notes)}</p>` : ''}
                </section>` : '<section class="print-section"><div class="print-empty">لا يوجد اشتراك مسجل لهذا العضو.</div></section>';
                const history = mode === 'full' ? `<section class="print-section"><div class="print-section-title"><div><span class="print-section-kicker">السجل المالي</span><h2>سجل المدفوعات والإيصالات</h2></div></div><div class="print-billing-grid print-payment-summary">${billingItem('إجمالي المستحق', money(data.financialSummary?.totalDue))}${billingItem('إجمالي المدفوع', money(data.financialSummary?.totalPaid))}${billingItem('إجمالي المتبقي', money(data.financialSummary?.totalRemaining), 'remaining')}${billingItem('عدد الإيصالات', String(data.financialSummary?.paidTransactionCount || 0))}</div><div class="print-table-wrap"><table class="print-table"><thead><tr><th>رقم الإيصال</th><th>التاريخ</th><th>العملية</th><th>الاشتراك</th><th>قيمة العملية</th><th>المتبقي</th><th>طريقة الدفع</th><th>ملاحظات</th></tr></thead><tbody>${paymentHistory(data)}</tbody></table></div></section>
                    <section class="print-section"><div class="print-section-title"><div><span class="print-section-kicker">السجل الكامل</span><h2>سجل الاشتراكات والتجديدات</h2></div></div><div class="print-table-wrap"><table class="print-table"><thead><tr><th>الباقة والمدة</th><th>الفترة</th><th>الحالة</th><th>الحساب</th><th>الدفع</th></tr></thead><tbody>${membershipHistory(data)}</tbody></table></div></section>
                    <section class="print-section"><div class="print-section-title"><div><span class="print-section-kicker">سجل التجميد</span><h2>عمليات التجميد</h2></div></div><div class="print-table-wrap"><table class="print-table"><thead><tr><th>البداية</th><th>النهاية</th><th>الاستئناف</th><th>المدة</th><th>السبب</th></tr></thead><tbody>${freezeHistory(data)}</tbody></table></div></section>
                    <section class="print-section"><div class="print-section-title"><div><span class="print-section-kicker">سجل النشاط</span><h2>كل العمليات المسجلة</h2></div></div><div class="print-table-wrap"><table class="print-table"><thead><tr><th>التاريخ</th><th>العملية</th><th>التفاصيل</th></tr></thead><tbody>${eventHistory(data)}</tbody></table></div></section>` : '';
                const printHeader = `<header class="print-header">${printBrandMarkup('إدارة العضويات والاشتراكات')}<div class="print-document-meta"><strong>${escapeHtml(title)}</strong><span>رقم العضو: #${escapeHtml(member.id || '—')}</span><span>تاريخ الطباعة: ${escapeHtml(printDate(new Date()))}</span></div></header>`;
                const printFooter = printFooterMarkup('إدارة العضويات والاشتراكات');
                return `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escapeHtml(title)} - ${escapeHtml(brandName())}</title></head><body><main class="print-sheet">${printHeader}<div class="print-accent"></div>${memberInfo}${membershipInfo}${history}${printFooter}</main></body></html>`;
            }

            function buildPaymentReceiptDocument(data, payment) {
                const member = data.member || {};
                const membership = (data.memberships || []).find((item) => Number(item.id) === Number(payment.membershipId)) || currentMembership(data);
                const title = 'إيصال دفع';
                const printHeader = `<header class="print-header">${printBrandMarkup('إدارة العضويات والاشتراكات')}<div class="print-document-meta"><strong>${title}</strong><span>رقم الإيصال: ${escapeHtml(payment.receiptNumber || `TG-${String(payment.id).padStart(6, '0')}`)}</span><span>تاريخ الطباعة: ${escapeHtml(printDate(new Date()))}</span></div></header>`;
                const memberInfo = `<section class="print-section"><div class="print-section-title"><div><span class="print-section-kicker">بيانات العميل</span><h2>إيصال استلام دفعة</h2></div><span class="print-receipt-id">${escapeHtml(payment.receiptNumber || '—')}</span></div><div class="print-member-hero"><span class="print-member-avatar">${escapeHtml(initials(member.fullName))}</span><div class="print-member-copy"><h2>${escapeHtml(member.fullName || 'عضو الجيم')}</h2><p>${escapeHtml(member.phone || '—')}</p></div></div><div class="print-info-grid">${infoItem('رقم العضو', `#${member.id || '—'}`)}${infoItem('تاريخ العملية', printDateTime(payment.transactionDate || payment.createdAt))}${infoItem('الباقة', planLabel(payment.plan))}${infoItem('النوع', typeLabel(payment.type))}</div></section>`;
                const paymentInfo = `<section class="print-section"><div class="print-section-title"><div><span class="print-section-kicker">تفاصيل العملية</span><h2>${escapeHtml(PAYMENT_TRANSACTION_LABELS[payment.transactionType] || 'دفعة')}</h2></div></div><div class="print-info-grid">${infoItem('طريقة الدفع', paymentLabel(payment.paymentMethod))}${infoItem('تاريخ الاشتراك', printDate(membership?.startDate))}${infoItem('تاريخ الانتهاء', printDate(membership?.effectiveEndDate))}${infoItem('المستحق', money(payment.amountDue))}</div><div class="print-receipt-amount"><span>قيمة العملية</span><strong>${escapeHtml(money(payment.amountPaid))}</strong><small>الرصيد المتبقي بعد العملية: ${escapeHtml(money(payment.amountRemaining))}</small></div>${payment.notes ? `<p class="print-notes"><strong>ملاحظات:</strong> ${escapeHtml(payment.notes)}</p>` : ''}</section>`;
                const printFooter = printFooterMarkup('إدارة العضويات والاشتراكات');
                return `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${title} - ${escapeHtml(brandName())}</title></head><body><main class="print-sheet">${printHeader}<div class="print-accent"></div>${memberInfo}${paymentInfo}${printFooter}</main></body></html>`;
            }

            function decoratePrintDocumentHtml(html) {
                const parsed = new DOMParser().parseFromString(html, 'text/html');
                if (String(html || '').includes('print-system-document')) parsed.querySelectorAll('.print-system-table tbody tr').forEach((row) => {
                    const cell = row.querySelector('td');
                    const name = cell?.querySelector('.print-table-main')?.textContent?.trim();
                    if (!cell || !name || cell.querySelector('.print-exercise-cell')) return;
                    const item = window.TopGymExerciseAssets?.find?.({ name }) || { name };
                    const content = cell.innerHTML;
                    cell.innerHTML = '<div class="print-exercise-cell">' + exercisePrintImage({ name, ...item }) + '<span>' + content + '</span></div>';
                });
                if (String(html || '').includes('print-system-document')) parsed.querySelectorAll('.print-system-reference').forEach((card) => {
                    if (card.querySelector('.print-exercise-gallery')) return;
                    const name = card.querySelector('h3')?.textContent?.trim();
                    const item = name ? window.TopGymExerciseAssets?.find?.({ name }) : null;
                    if (item) card.querySelector('h3')?.insertAdjacentHTML('afterend', exercisePrintGallery({ name, ...item }));
                });
                if (parsed.head && !parsed.head.querySelector('[data-top-gym-print-styles]')) {
                    parsed.head.insertAdjacentHTML('beforeend', printStylesheetLink());
                }
                return '<!doctype html>' + parsed.documentElement.outerHTML;
            }

            function writeWindow(printWindow, html) {
                html = decoratePrintDocumentHtml(html);
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
                const parsed = new DOMParser().parseFromString(decoratePrintDocumentHtml(buildPrintDocument(data, mode)), 'text/html');
                const sheet = parsed.querySelector('.print-sheet');
                if (!sheet) throw new Error('تعذر تجهيز قالب PDF.');
                const holder = document.createElement('div');
                holder.dir = 'rtl';
                holder.style.cssText = `position:fixed;left:-100000px;top:0;width:190mm;min-height:1px;overflow:visible;background:${printPaperColor()};z-index:-1;`;
                const brandVariables = parsed.head?.querySelector('[data-top-gym-print-brand]')?.cloneNode(true);
                if (brandVariables) holder.append(brandVariables);
                holder.append(sheet);
                document.body.append(holder);
                try {
                    if (document.fonts?.ready) await document.fonts.ready;
                    if (document.fonts?.load) await Promise.all(['400 10pt Cairo', '700 10pt Cairo', '800 16pt Cairo'].map((font) => document.fonts.load(font).catch(() => [])));
                    await Promise.all([...holder.querySelectorAll('img')].map((image) => image.complete ? Promise.resolve() : new Promise((resolve) => { image.onload = resolve; image.onerror = resolve; })));
                    const blob = await window.html2pdf().set({
                        margin: [8, 8, 8, 8],
                        image: { type: 'jpeg', quality: .98 },
                        html2canvas: { scale: 2, useCORS: true, backgroundColor: printPaperColor(), logging: false, letterRendering: true },
                        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
                        pagebreak: { mode: ['css', 'legacy'] }
                    }).from(sheet).outputPdf('blob');
                    const filename = `${String(brandName()).replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-+|-+$/g, '').slice(0, 30) || 'Gym'}-${String(data.member?.id || memberId)}-${mode}.pdf`;
                    return { data, file: new File([blob], filename, { type: 'application/pdf' }) };
                } finally {
                    holder.remove();
                }
            }

            async function fetchPrintJson(url) {
                const response = await fetch(url, { headers: { Accept: 'application/json' } });
                const data = await response.json().catch(() => ({}));
                if (!response.ok) throw new Error(data.error || 'تعذر تجهيز بيانات الطباعة.');
                return data;
            }

            function coachingNumber(value, digits = 0) {
                const parsed = Number(value);
                return Number.isFinite(parsed)
                    ? parsed.toLocaleString('ar-EG', { maximumFractionDigits: digits, minimumFractionDigits: digits })
                    : '—';
            }

            function coachingStatusLabel(value) {
                return { active: 'نشطة', draft: 'مسودة', paused: 'متوقفة', completed: 'مكتملة', archived: 'مؤرشفة' }[value] || value || '—';
            }

            function coachingGoalLabel(value) {
                return { lose: 'خسارة وزن', maintain: 'تثبيت الوزن', gain: 'زيادة وزن' }[value] || value || '—';
            }

            function coachingActivityLabel(value) {
                return { sedentary: 'قليل جدًا', light: 'خفيف', moderate: 'متوسط', high: 'مرتفع', very_high: 'مرتفع جدًا' }[value] || value || '—';
            }

            function coachingValue(value, fallback = '—') {
                return value === null || value === undefined || value === '' ? fallback : String(value);
            }

            function coachingList(value) {
                if (Array.isArray(value)) return value.map((item) => String(item || '').trim()).filter(Boolean);
                if (value === null || value === undefined || value === '') return [];
                return [String(value).trim()].filter(Boolean);
            }

            function coachingListMarkup(value, emptyLabel = 'لا توجد بيانات مسجلة.') {
                const values = coachingList(value);
                if (!values.length) return '<span class="print-system-muted">' + escapeHtml(emptyLabel) + '</span>';
                return '<ul class="print-system-list">' + values.map((item) => '<li>' + escapeHtml(item) + '</li>').join('') + '</ul>';
            }

            function coachingItemName(item) {
                return item?.nameAr || item?.name || item?.nameEn || 'عنصر بدون اسم';
            }

            function exercisePrintSource(item, phase = 'start') {
                const metadata = item?.metadata && typeof item.metadata === 'object' ? item.metadata : {};
                const match = window.TopGymExerciseAssets?.find?.(item);
                const requestedPhase = phase === 'end' ? 'end' : 'start';
                const source = match?.imageAssets?.[requestedPhase]
                    || item?.imageAssets?.[requestedPhase]
                    || metadata.imageAssets?.[requestedPhase];
                return source ? assetUrl(source) : '';
            }

            function exercisePrintImage(item, phase = 'start', className = 'print-exercise-thumb', altSuffix = '') {
                const source = exercisePrintSource(item, phase);
                if (!source) return '<span class="print-exercise-thumb print-exercise-fallback" aria-hidden="true">&#127947;</span>';
                return '<img class="' + escapeHtml(className) + '" src="' + escapeHtml(source) + '" alt="' + escapeHtml(coachingItemName(item) + (altSuffix ? ' - ' + altSuffix : '')) + '" width="720" height="480" loading="eager">';
            }

            function exercisePrintGallery(item) {
                const start = exercisePrintSource(item, 'start');
                const end = exercisePrintSource(item, 'end');
                if (!start && !end) return '';
                return '<div class="print-exercise-gallery">' + (start ? '<figure>' + exercisePrintImage(item, 'start', 'print-exercise-detail-image', 'البداية') + '<figcaption>البداية</figcaption></figure>' : '') + (end ? '<figure>' + exercisePrintImage(item, 'end', 'print-exercise-detail-image', 'النهاية') + '<figcaption>النهاية</figcaption></figure>' : '') + '</div>';
            }

            async function preloadPrintImages(items = []) {
                if (window.TopGymExerciseAssets?.preloadItems) {
                    await window.TopGymExerciseAssets.preloadItems(items, ['start', 'end']);
                }
            }

            async function waitForPrintWindowImages(printWindow) {
                if (!printWindow?.document) return;
                if (window.TopGymExerciseAssets?.waitForImages) {
                    await window.TopGymExerciseAssets.waitForImages(printWindow.document);
                    return;
                }
                await Promise.all([...printWindow.document.images].map((image) => image.complete
                    ? Promise.resolve()
                    : new Promise((resolve) => { image.onload = resolve; image.onerror = resolve; })));
            }

            async function waitForPrintWindowFonts(printWindow) {
                if (printWindow?.document?.fonts?.ready) await printWindow.document.fonts.ready;
            }

            function coachingReps(exercise) {
                const min = exercise?.repsMin;
                const max = exercise?.repsMax;
                if (min === null || min === undefined || min === '') return '—';
                if (max === null || max === undefined || max === '' || Number(max) === Number(min)) return String(min);
                return String(min) + '–' + String(max);
            }

            function normalizeCoachingDraft(draft, type, catalog = {}, clientLabel = '') {
                const system = JSON.parse(JSON.stringify(draft || {}));
                system.memberName = system.memberName || clientLabel || 'العميل المحدد';
                system.name = system.name || `${type === 'diet' ? 'خطة تغذية' : 'برنامج تدريب'} - ${system.memberName} · From ${brandName()} System`;
                if (type === 'workout') {
                    const exercises = catalog.exercises || [];
                    system.routines = (system.routines || []).map((routine) => ({
                        ...routine,
                        exercises: (routine.exercises || []).map((exercise) => {
                            const libraryItem = exercises.find((item) => String(item.id) === String(exercise.exerciseId)) || {};
                            return { ...exercise, ...libraryItem, exerciseId: exercise.exerciseId };
                        })
                    }));
                    return { system, libraryItems: exercises };
                }
                const foods = catalog.foods || [];
                system.meals = (system.meals || []).map((meal) => ({
                    ...meal,
                    items: (meal.items || []).map((item) => {
                        const food = foods.find((candidate) => String(candidate.id) === String(item.foodId)) || {};
                        const factor = Number(item.assignedQuantity || 0) / (Number(food.servingSize || 100) || 100);
                        return {
                            ...item,
                            nameAr: food.nameAr || food.name,
                            nameEn: food.nameEn,
                            calories: Number(food.calories || 0) * factor,
                            protein: Number(food.protein || 0) * factor,
                            carbs: Number(food.carbs || 0) * factor,
                            fats: Number(food.fat || food.fats || 0) * factor,
                            servingUnit: item.servingUnit || food.servingUnit
                        };
                    })
                }));
                return { system, libraryItems: foods };
            }

            function coachingHeader(title, system) {
                const memberName = system.memberName || system.fullName || 'العميل';
                const memberPhone = system.memberPhone || system.phone || '—';
                const documentId = system.id ? '#' + system.id : 'مسودة';
                return '<header class="print-header">' + printBrandMarkup('إدارة التدريب والتغذية الرياضية') + '<div class="print-document-meta"><strong>' + escapeHtml(title) + '</strong><span>' + escapeHtml(memberName) + ' · ' + escapeHtml(memberPhone) + '</span><span>' + escapeHtml(documentId) + ' · ' + escapeHtml(printDate(new Date())) + '</span></div></header>';
            }

            function coachingMemberHero(system, type) {
                const memberName = system.memberName || system.fullName || 'العميل';
                const memberPhone = system.memberPhone || system.phone || '—';
                const title = type === 'diet' ? 'خطة التغذية المعتمدة' : 'برنامج التدريب المعتمد';
                return '<section class="print-section print-system-hero"><div class="print-system-hero-copy"><span class="print-section-kicker">ملف العميل</span><h2>' + escapeHtml(memberName) + '</h2><p>' + escapeHtml(memberPhone) + (system.memberEmail ? ' · ' + escapeHtml(system.memberEmail) : '') + '</p></div><div class="print-system-hero-title"><span>' + escapeHtml(title) + '</span><strong>' + escapeHtml(system.name || 'نظام جديد') + '</strong></div></section>';
            }

            function coachingKpi(label, value, detail = '') {
                return '<div class="print-system-kpi"><span>' + escapeHtml(label) + '</span><strong>' + escapeHtml(value) + '</strong>' + (detail ? '<small>' + escapeHtml(detail) + '</small>' : '') + '</div>';
            }

            function coachingInfo(label, value, className = '') {
                return '<div class="print-system-info ' + className + '"><span>' + escapeHtml(label) + '</span><strong>' + escapeHtml(coachingValue(value)) + '</strong></div>';
            }

            function workoutPrintSections(system, libraryItems) {
                const libraryById = new Map((libraryItems || []).map((item) => [String(item.id), item]));
                const routines = Array.isArray(system.routines) ? system.routines : [];
                const muscles = {};
                let exerciseCount = 0;
                let setCount = 0;
                let volume = 0;
                const detailFor = (exercise) => ({ ...(libraryById.get(String(exercise.exerciseId)) || {}), ...exercise });
                routines.forEach((routine) => (routine.exercises || []).forEach((exercise) => {
                    exerciseCount += 1;
                    setCount += Number(exercise.sets || 0);
                    const reps = ((Number(exercise.repsMin) || 0) + (Number(exercise.repsMax) || Number(exercise.repsMin) || 0)) / 2;
                    volume += Number(exercise.sets || 0) * reps * Number(exercise.weightKg || 0);
                    const detail = detailFor(exercise);
                    const muscle = detail.targetMuscleNameAr || detail.targetMuscleName || (detail.targetMuscleId ? 'عضلة #' + detail.targetMuscleId : 'غير محددة');
                    muscles[muscle] = (muscles[muscle] || 0) + Number(exercise.sets || 0);
                }));
                const muscleEntries = Object.entries(muscles).sort(([, first], [, second]) => second - first);
                const maxMuscleSets = Math.max(1, ...muscleEntries.map(([, count]) => count));
                const distribution = muscleEntries.length
                    ? '<div class="print-system-distribution">' + muscleEntries.map(([name, count]) => '<div class="print-system-bar"><div><span>' + escapeHtml(name) + '</span><b>' + coachingNumber(count) + ' مجموعة</b></div><i><em></em></i></div>').join('') + '</div>'
                    : '<div class="print-empty">لم يتم تحديد توزيع العضلات.</div>';
                const routineSections = routines.length ? routines.map((routine, routineIndex) => {
                    const rows = (routine.exercises || []).map((exercise) => {
                        const detail = detailFor(exercise);
                        const muscle = detail.targetMuscleNameAr || detail.targetMuscleName || (detail.targetMuscleId ? 'عضلة #' + detail.targetMuscleId : 'غير محددة');
                        const intensity = [exercise.rir == null ? '' : 'RIR ' + exercise.rir, exercise.rpe == null ? '' : 'RPE ' + exercise.rpe].filter(Boolean).join(' · ');
                        return '<tr><td><span class="print-table-main">' + escapeHtml(coachingItemName(detail)) + '</span>' + (exercise.notes ? '<span class="print-table-sub">' + escapeHtml(exercise.notes) + '</span>' : '') + '</td><td>' + escapeHtml(muscle) + '</td><td dir="ltr">' + coachingNumber(exercise.sets) + '</td><td dir="ltr">' + escapeHtml(coachingReps(exercise)) + '</td><td dir="ltr">' + (exercise.weightKg === null || exercise.weightKg === undefined || exercise.weightKg === '' ? '—' : coachingNumber(exercise.weightKg, 1) + ' كجم') + '</td><td dir="ltr">' + (exercise.restSeconds == null ? '—' : coachingNumber(exercise.restSeconds) + ' ث') + '</td><td dir="ltr">' + escapeHtml(exercise.tempo || intensity || '—') + '</td><td dir="ltr">' + escapeHtml(exercise.supersetGroupId || '—') + '</td></tr>';
                    }).join('');
                    return '<section class="print-section print-system-routine"><div class="print-section-title"><div><span class="print-section-kicker">اليوم ' + coachingNumber(routineIndex + 1) + '</span><h2>' + escapeHtml(routine.name || 'اليوم ' + (routineIndex + 1)) + '</h2></div><span class="print-system-count">' + coachingNumber((routine.exercises || []).length) + ' تمرين · ' + coachingNumber((routine.exercises || []).reduce((sum, item) => sum + Number(item.sets || 0), 0)) + ' مجموعات</span></div>' + (routine.notes ? '<p class="print-notes print-system-note">' + escapeHtml(routine.notes) + '</p>' : '') + '<div class="print-table-wrap"><table class="print-table print-system-table"><thead><tr><th>التمرين</th><th>العضلة</th><th>مجموعات</th><th>تكرارات</th><th>الوزن</th><th>الراحة</th><th>الوتيرة / الجهد</th><th>سوبر سيت</th></tr></thead><tbody>' + (rows || '<tr><td colspan="8"><div class="print-empty">لا توجد تمارين.</div></td></tr>') + '</tbody></table></div></section>';
                }).join('') : '<section class="print-section"><div class="print-empty">لا توجد أيام تدريب محفوظة.</div></section>';
                const references = [];
                const referenceKeys = new Set();
                routines.forEach((routine) => (routine.exercises || []).forEach((exercise) => {
                    const detail = detailFor(exercise);
                    const key = String(exercise.exerciseId || detail.id || detail.name || '');
                    if (!key || referenceKeys.has(key)) return;
                    referenceKeys.add(key);
                    references.push(detail);
                }));
                const referenceMarkup = references.length ? '<section class="print-section print-system-reference-section"><div class="print-section-title"><div><span class="print-section-kicker">مرجع الأداء</span><h2>تعليمات التمارين والنصائح</h2></div><span class="print-system-count">' + coachingNumber(references.length) + ' تمرين</span></div><div class="print-system-reference-grid">' + references.map((item) => '<article class="print-system-reference"><h3>' + escapeHtml(coachingItemName(item)) + '</h3><div class="print-system-reference-meta">' + escapeHtml(item.targetMuscleNameAr || item.targetMuscleName || 'عضلة غير محددة') + ' · ' + escapeHtml(item.equipment || 'معدات غير محددة') + ' · ' + escapeHtml(item.difficulty || 'مستوى غير محدد') + '</div><div class="print-system-reference-columns"><div><b>طريقة الأداء</b>' + coachingListMarkup(item.instructionsAr || item.instructions) + '</div><div><b>نصيحة</b>' + coachingListMarkup(item.tipsAr || item.tips) + '</div><div><b>أخطاء شائعة</b>' + coachingListMarkup(item.commonMistakesAr || item.commonMistakes) + '</div></div></article>').join('') + '</div></section>' : '';
                return '<section class="print-section"><div class="print-section-title"><div><span class="print-section-kicker">ملخص البرنامج</span><h2>الحمل التدريبي وتوزيع العضلات</h2></div></div><div class="print-system-kpi-grid">' + coachingKpi('الأيام التدريبية', coachingNumber(routines.length)) + coachingKpi('إجمالي التمارين', coachingNumber(exerciseCount)) + coachingKpi('إجمالي المجموعات', coachingNumber(setCount)) + coachingKpi('الحجم التقريبي', coachingNumber(volume) + ' كجم', 'حسب الوزن والتكرارات المدخلة') + '</div><div class="print-system-overview-grid"><div><h3>البيانات الأساسية</h3><div class="print-system-info-grid">' + coachingInfo('الهدف', system.goal) + coachingInfo('المستوى', system.level) + coachingInfo('أيام أسبوعيًا', system.daysPerWeek) + coachingInfo('المدة', system.durationWeeks ? coachingNumber(system.durationWeeks) + ' أسبوع' : '—') + coachingInfo('البداية', printDate(system.startDate)) + coachingInfo('النهاية', printDate(system.endDate)) + coachingInfo('الحالة', coachingStatusLabel(system.status)) + coachingInfo('الإصدار', system.version) + '</div></div><div><h3>توزيع العضلات</h3>' + distribution + '</div></div>' + (system.description ? '<div class="print-system-callout"><b>وصف البرنامج</b><p>' + escapeHtml(system.description) + '</p></div>' : '') + '</section>' + routineSections + referenceMarkup + (system.notes ? '<section class="print-section"><div class="print-section-title"><div><span class="print-section-kicker">ملاحظات الإدارة</span><h2>ملاحظات البرنامج</h2></div></div><p class="print-notes">' + escapeHtml(system.notes) + '</p></section>' : '');
            }

            function dietPrintSections(system) {
                const meals = Array.isArray(system.meals) ? system.meals : [];
                const fallbackTotals = meals.reduce((total, meal) => (meal.items || []).reduce((sum, item) => {
                    sum.calories += Number(item.calories || 0);
                    sum.protein += Number(item.protein || 0);
                    sum.carbs += Number(item.carbs || 0);
                    sum.fats += Number(item.fats || 0);
                    return sum;
                }, total), { calories: 0, protein: 0, carbs: 0, fats: 0 });
                const totals = system.totals || fallbackTotals;
                const mealSections = meals.length ? meals.map((meal, mealIndex) => {
                    const mealTotals = (meal.items || []).reduce((total, item) => {
                        total.calories += Number(item.calories || 0);
                        total.protein += Number(item.protein || 0);
                        total.carbs += Number(item.carbs || 0);
                        total.fats += Number(item.fats || 0);
                        return total;
                    }, { calories: 0, protein: 0, carbs: 0, fats: 0 });
                    const rows = (meal.items || []).map((item) => '<tr><td><span class="print-table-main">' + escapeHtml(item.nameAr || item.nameEn || 'طعام غير محدد') + '</span>' + (item.notes ? '<span class="print-table-sub">' + escapeHtml(item.notes) + '</span>' : '') + '</td><td dir="ltr">' + coachingNumber(item.assignedQuantity, 1) + ' ' + escapeHtml(item.servingUnit || '') + '</td><td dir="ltr">' + coachingNumber(item.calories, 1) + '</td><td dir="ltr">' + coachingNumber(item.protein, 1) + ' ج</td><td dir="ltr">' + coachingNumber(item.carbs, 1) + ' ج</td><td dir="ltr">' + coachingNumber(item.fats, 1) + ' ج</td></tr>').join('');
                    return '<section class="print-section print-system-routine"><div class="print-section-title"><div><span class="print-section-kicker">وجبة ' + coachingNumber(mealIndex + 1) + '</span><h2>' + escapeHtml(meal.name || 'وجبة ' + (mealIndex + 1)) + '</h2></div><span class="print-system-count">' + escapeHtml(meal.mealTime || 'بدون موعد') + ' · ' + coachingNumber(mealTotals.calories, 1) + ' سعر</span></div>' + (meal.notes ? '<p class="print-notes print-system-note">' + escapeHtml(meal.notes) + '</p>' : '') + '<div class="print-table-wrap"><table class="print-table print-system-table"><thead><tr><th>الطعام</th><th>الكمية</th><th>السعرات</th><th>البروتين</th><th>الكربوهيدرات</th><th>الدهون</th></tr></thead><tbody>' + (rows || '<tr><td colspan="6"><div class="print-empty">لا توجد أطعمة.</div></td></tr>') + '</tbody></table></div></section>';
                }).join('') : '<section class="print-section"><div class="print-empty">لا توجد وجبات محفوظة.</div></section>';
                const calculator = system.calculator || {};
                return '<section class="print-section"><div class="print-section-title"><div><span class="print-section-kicker">ملخص الخطة</span><h2>الأهداف الغذائية والقيم المحسوبة</h2></div></div><div class="print-system-kpi-grid">' + coachingKpi('السعرات المستهدفة', coachingNumber(system.targetCalories) + ' سعر') + coachingKpi('السعرات المحسوبة', coachingNumber(totals.calories, 1) + ' سعر') + coachingKpi('عدد الوجبات', coachingNumber(meals.length)) + coachingKpi('عدد الأطعمة', coachingNumber(meals.reduce((sum, meal) => sum + (meal.items || []).length, 0))) + '</div><div class="print-system-overview-grid"><div><h3>الأهداف اليومية</h3><div class="print-system-info-grid">' + coachingInfo('الهدف', coachingGoalLabel(system.calorieGoal)) + coachingInfo('تعديل السعرات', coachingNumber(system.calorieAdjustment) + ' سعر') + coachingInfo('البروتين المستهدف', coachingNumber(system.targetProtein, 1) + ' ج') + coachingInfo('الكربوهيدرات المستهدفة', coachingNumber(system.targetCarbs, 1) + ' ج') + coachingInfo('الدهون المستهدفة', coachingNumber(system.targetFats, 1) + ' ج') + coachingInfo('البداية', printDate(system.startDate)) + coachingInfo('النهاية', printDate(system.endDate)) + coachingInfo('الحالة', coachingStatusLabel(system.status)) + '</div></div><div><h3>حاسبة الاحتياج اليومي</h3><div class="print-system-info-grid">' + coachingInfo('الوزن', calculator.weightKg ? coachingNumber(calculator.weightKg, 1) + ' كجم' : '—') + coachingInfo('الطول', calculator.heightCm ? coachingNumber(calculator.heightCm, 1) + ' سم' : '—') + coachingInfo('العمر', calculator.age ? coachingNumber(calculator.age) + ' سنة' : '—') + coachingInfo('النوع', calculator.gender === 'female' ? 'أنثى' : calculator.gender === 'male' ? 'ذكر' : calculator.gender) + coachingInfo('النشاط', coachingActivityLabel(calculator.activity)) + coachingInfo('BMR · معدل الأيض الأساسي', calculator.bmr ? coachingNumber(calculator.bmr) + ' سعر' : '—') + coachingInfo('TDEE · الاحتياج اليومي', calculator.tdee ? coachingNumber(calculator.tdee) + ' سعر' : '—') + coachingInfo('الإصدار', system.version) + '</div></div></div>' + (system.description ? '<div class="print-system-callout"><b>وصف الخطة</b><p>' + escapeHtml(system.description) + '</p></div>' : '') + '<div class="print-system-total"><span>إجمالي الماكروز المحسوبة</span><strong>البروتين ' + coachingNumber(totals.protein, 1) + ' ج · الكربوهيدرات ' + coachingNumber(totals.carbs, 1) + ' ج · الدهون ' + coachingNumber(totals.fats, 1) + ' ج</strong></div></section>' + mealSections + (system.notes ? '<section class="print-section"><div class="print-section-title"><div><span class="print-section-kicker">ملاحظات الإدارة</span><h2>ملاحظات الخطة</h2></div></div><p class="print-notes">' + escapeHtml(system.notes) + '</p></section>' : '');
            }

            function buildCoachingSystemDocument(system, type, libraryItems = []) {
                const title = type === 'diet' ? 'خطة تغذية رياضية' : 'برنامج تدريب رياضي';
                const content = type === 'diet' ? dietPrintSections(system) : workoutPrintSections(system, libraryItems);
                const footer = printFooterMarkup('إدارة التدريب والتغذية الرياضية', true);
                return '<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>' + escapeHtml(title) + ' - ' + escapeHtml(brandName()) + '</title></head><body><main class="print-sheet print-system-document">' + coachingHeader(title, system) + '<div class="print-accent"></div>' + coachingMemberHero(system, type) + content + footer + '</main></body></html>';
            }

            async function fetchCoachingSystem(id, type) {
                const endpoint = type === 'diet' ? '/api/dietplans/' + encodeURIComponent(id) : '/api/workoutprograms/' + encodeURIComponent(id);
                const response = await fetchPrintJson(endpoint);
                const system = response.plan || response.program;
                if (!system) throw new Error('لم يتم العثور على النظام المطلوب.');
                if (type !== 'workout') return { system, libraryItems: [] };
                await window.TopGymExerciseAssets?.load?.().catch(() => {});
                const ids = [...new Set((system.routines || []).flatMap((routine) => (routine.exercises || []).map((exercise) => exercise.exerciseId)).filter(Boolean).map(String))];
                const results = await Promise.allSettled(ids.map((exerciseId) => fetchPrintJson('/api/library/exercises/' + encodeURIComponent(exerciseId)).then((data) => data.item)));
                const libraryItems = results.filter((result) => result.status === 'fulfilled' && result.value).map((result) => result.value);
                await preloadPrintImages(libraryItems);
                return { system, libraryItems };
            }

            function writePrintLoading(printWindow, label = 'جاري تجهيز مستند الطباعة…') {
                writeWindow(printWindow, '<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"></head><body><div class="print-loading">' + escapeHtml(label) + '</div></body></html>');
            }

            function notifyPrint(message, type = 'success') {
                if (typeof window.showToast === 'function') window.showToast(message, type === 'error', type);
                else if (type === 'error') window.alert(message);
            }

            function coachingFilename(type, system) {
                const label = String(system?.name || (type === 'diet' ? 'خطة-تغذية' : 'برنامج-تدريب')).replace(/[\\/:*?"<>|]+/g, '-').trim().slice(0, 70);
                const prefix = String(brandName()).replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-+|-+$/g, '').slice(0, 30) || 'Gym';
                return prefix + '-' + (type === 'diet' ? 'Nutrition' : 'Workout') + '-' + (label || 'System') + '-' + (system?.id || 'draft') + '.pdf';
            }

            async function createPdfFromDocument(html, filename, downloadMode = false) {
                html = decoratePrintDocumentHtml(html);
                await loadPdfLibrary();
                const parsed = new DOMParser().parseFromString(html, 'text/html');
                const sheet = parsed.querySelector('.print-sheet');
                if (!sheet) throw new Error('تعذر تجهيز قالب PDF.');
                const holder = document.createElement('div');
                holder.dir = 'rtl';
                holder.style.cssText = `position:fixed;left:-100000px;top:0;width:190mm;min-height:1px;overflow:visible;background:${printPaperColor()};z-index:-1;`;
                holder.append(sheet);
                document.body.append(holder);
                try {
                    if (document.fonts?.ready) await document.fonts.ready;
                    await Promise.all([...holder.querySelectorAll('img')].map((image) => image.complete ? Promise.resolve() : new Promise((resolve) => { image.onload = resolve; image.onerror = resolve; })));
                    const pdfOptions = {
                        margin: [8, 8, 8, 8],
                        filename,
                        image: { type: 'jpeg', quality: .98 },
                        html2canvas: { scale: 2, useCORS: true, backgroundColor: printPaperColor(), logging: false, letterRendering: true },
                        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
                        pagebreak: { mode: ['css', 'legacy'] }
                    };
                    const worker = window.html2pdf().set(pdfOptions).from(sheet);
                    if (downloadMode) {
                        await worker.save();
                        return null;
                    }
                    return await worker.outputPdf('blob');
                } finally {
                    holder.remove();
                }
            }

            function downloadBlob(blob, filename) {
                const url = URL.createObjectURL(blob);
                const anchor = document.createElement('a');
                anchor.href = url;
                anchor.download = filename;
                document.body.append(anchor);
                anchor.click();
                anchor.remove();
                window.setTimeout(() => URL.revokeObjectURL(url), 1200);
            }

            function pricingDuration(type) {
                const value = Number(type?.durationValue || 0);
                const unit = type?.mode === 'days' ? 'يوم' : 'شهر';
                return value ? `${coachingNumber(value)} ${unit}` : '—';
            }

            function buildPricingDocument(pricing = {}) {
                const plans = Object.entries(pricing.plans || {}).sort(([, first], [, second]) => Number(first?.sortOrder || 0) - Number(second?.sortOrder || 0));
                const types = Object.entries(pricing.types || {})
                    .sort(([, first], [, second]) => Number(first?.sortOrder || 0) - Number(second?.sortOrder || 0));
                const activeTypes = types.filter(([, type]) => type?.active !== false);
                const planRows = plans.map(([code, plan]) => {
                    const prices = pricing.prices?.[code] || {};
                    const cells = activeTypes.map(([typeCode, type]) => {
                        const configured = prices[typeCode];
                        const fallback = Number(plan?.monthlyPrice || 0) * Number(type?.priceMultiplier || 1);
                        return `<td dir="ltr">${escapeHtml(money(configured === undefined ? fallback : configured))}</td>`;
                    }).join('');
                    const status = plan?.active === false ? 'غير متاحة' : 'متاحة';
                    return `<tr><td><span class="print-table-main">${escapeHtml(plan?.label || code)}</span><span class="print-table-sub">${escapeHtml(code)}</span></td><td dir="ltr">${escapeHtml(money(plan?.monthlyPrice))}</td>${cells}<td><span class="print-status ${plan?.active === false ? 'expired' : 'active'}">${status}</span></td></tr>`;
                }).join('');
                const typeRows = types.map(([code, type]) => `<tr><td><span class="print-table-main">${escapeHtml(type?.label || code)}</span><span class="print-table-sub">${escapeHtml(code)}</span></td><td dir="ltr">${escapeHtml(pricingDuration(type))}</td><td dir="ltr">${escapeHtml(coachingNumber(type?.priceMultiplier, 4))}</td><td><span class="print-status ${type?.active === false ? 'expired' : 'active'}">${type?.active === false ? 'غير ظاهر' : 'نشط'}</span></td></tr>`).join('');
                const planHeaders = activeTypes.map(([, type]) => `<th>${escapeHtml(type?.label || 'سعر المدة')}<span class="print-table-sub">${escapeHtml(pricingDuration(type))}</span></th>`).join('');
                const emptyPlanRows = `<tr><td colspan="${activeTypes.length + 3}"><div class="print-empty">لا توجد باقات مسجلة.</div></td></tr>`;
                const emptyTypeRows = '<tr><td colspan="4"><div class="print-empty">لا توجد أنواع عضويات مسجلة.</div></td></tr>';
                const generatedAt = printDate(new Date());
                const printHeader = `<header class="print-header">${printBrandMarkup('إدارة العضويات')}<div class="print-document-meta"><strong>الاشتراكات والباقات</strong><span>بيان الأسعار والعضويات المعتمد</span><span>تاريخ الإصدار: ${escapeHtml(generatedAt)}</span></div></header>`;
                const summary = `<section class="print-section"><div class="print-section-title"><div><span class="print-section-kicker">ملخص الملف</span><h2>دليل الاشتراكات والباقات</h2></div></div><div class="print-info-grid"><div class="print-info-item"><span>عدد الباقات</span><strong dir="ltr">${escapeHtml(coachingNumber(plans.length))}</strong></div><div class="print-info-item"><span>أنواع العضويات</span><strong dir="ltr">${escapeHtml(coachingNumber(types.length))}</strong></div><div class="print-info-item"><span>الأنواع المتاحة</span><strong dir="ltr">${escapeHtml(coachingNumber(activeTypes.length))}</strong></div><div class="print-info-item"><span>آخر تحديث للملف</span><strong>${escapeHtml(generatedAt)}</strong></div></div></section>`;
                const plansSection = `<section class="print-section print-pricing-section"><div class="print-section-title"><div><span class="print-section-kicker">الأسعار</span><h2>مصفوفة أسعار الباقات</h2></div><span class="print-table-sub">الأسعار بالجنيه المصري</span></div><div class="print-table-wrap"><table class="print-table"><thead><tr><th>الباقة</th><th>السعر الشهري</th>${planHeaders}<th>الحالة</th></tr></thead><tbody>${planRows || emptyPlanRows}</tbody></table></div></section>`;
                const typesSection = `<section class="print-section print-pricing-section"><div class="print-section-title"><div><span class="print-section-kicker">المدد</span><h2>أنواع العضويات وصلاحيتها</h2></div></div><div class="print-table-wrap"><table class="print-table"><thead><tr><th>نوع العضوية</th><th>مدة الصلاحية</th><th>معامل السعر</th><th>الحالة</th></tr></thead><tbody>${typeRows || emptyTypeRows}</tbody></table></div></section>`;
                const footer = printFooterMarkup('إدارة العضويات');
                return `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>الاشتراكات والباقات - ${escapeHtml(brandName())}</title></head><body><main class="print-sheet print-pricing-document">${printHeader}<div class="print-accent"></div>${summary}${plansSection}${typesSection}${footer}</main></body></html>`;
            }

            async function downloadPricingPdf() {
                try {
                    const pricing = await fetchPrintJson('/api/pricing');
                    const filename = `${String(brandName()).replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-+|-+$/g, '').slice(0, 30) || 'Gym'}-Subscriptions-Pricing-${new Date().toISOString().slice(0, 10)}.pdf`;
                    await createPdfFromDocument(buildPricingDocument(pricing), filename, true);
                    notifyPrint('تم تجهيز ملف الاشتراكات والباقات وتحميله بنجاح.');
                } catch (error) {
                    notifyPrint(error.message || 'تعذر إنشاء ملف الاشتراكات والباقات.', 'error');
                }
            }

            async function printPricing(existingWindow = null) {
                const printWindow = existingWindow || window.open('', '_blank', 'width=980,height=820');
                if (!printWindow) {
                    notifyPrint('يرجى السماح بالنوافذ المنبثقة لإتمام طباعة الأسعار والعضويات.', 'error');
                    return;
                }
                writePrintLoading(printWindow, 'جاري تجهيز الأسعار والعضويات للطباعة…');
                try {
                    const pricing = await fetchPrintJson('/api/pricing');
                    writeWindow(printWindow, buildPricingDocument(pricing));
                    printWindow.onafterprint = () => printWindow.close();
                    window.setTimeout(async () => {
                        await waitForPrintWindowFonts(printWindow);
                        await waitForPrintWindowImages(printWindow);
                        printWindow.focus();
                        printWindow.print();
                    }, 100);
                } catch (error) {
                    writeWindow(printWindow, '<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"></head><body><div class="print-error">' + escapeHtml(error.message || 'تعذر تجهيز الأسعار والعضويات للطباعة.') + '</div></body></html>');
                }
            }

            async function downloadCoachingPdf(id, type) {
                try {
                    const result = await fetchCoachingSystem(id, type);
                    const filename = coachingFilename(type, result.system);
                    const blob = await createPdfFromDocument(buildCoachingSystemDocument(result.system, type, result.libraryItems), filename);
                    downloadBlob(blob, filename);
                    notifyPrint('تم تجهيز ملف PDF وتحميله بنجاح.');
                } catch (error) {
                    notifyPrint(error.message || 'تعذر إنشاء ملف PDF.', 'error');
                }
            }

            async function printCoachingSystem(id, type, existingWindow = null) {
                const printWindow = existingWindow || window.open('', '_blank', 'width=980,height=820');
                if (!printWindow) {
                    notifyPrint('يرجى السماح بالنوافذ المنبثقة لإتمام الطباعة.', 'error');
                    return;
                }
                writePrintLoading(printWindow, 'جاري تجهيز النظام للطباعة…');
                try {
                    const result = await fetchCoachingSystem(id, type);
                    writeWindow(printWindow, buildCoachingSystemDocument(result.system, type, result.libraryItems));
                    printWindow.onafterprint = () => printWindow.close();
                    window.setTimeout(async () => { await waitForPrintWindowFonts(printWindow); await waitForPrintWindowImages(printWindow); printWindow.focus(); printWindow.print(); }, 100);
                } catch (error) {
                    writeWindow(printWindow, '<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"></head><body><div class="print-error">' + escapeHtml(error.message || 'تعذر تجهيز مستند الطباعة.') + '</div></body></html>');
                }
            }

            function writeCoachingDraft(printWindow, draft, type, catalog, clientLabel) {
                const normalized = normalizeCoachingDraft(draft, type, catalog, clientLabel);
                writeWindow(printWindow, buildCoachingSystemDocument(normalized.system, type, normalized.libraryItems));
            }

            function printCoachingDraft(draft, type, catalog = {}, clientLabel = '', existingWindow = null) {
                const printWindow = existingWindow || window.open('', '_blank', 'width=980,height=820');
                if (!printWindow) {
                    notifyPrint('يرجى السماح بالنوافذ المنبثقة لإتمام الطباعة.', 'error');
                    return;
                }
                try {
                    writePrintLoading(printWindow, 'جاري تجهيز مسودة النظام للطباعة…');
                    writeCoachingDraft(printWindow, draft, type, catalog, clientLabel);
                    printWindow.onafterprint = () => printWindow.close();
                    window.setTimeout(async () => { await waitForPrintWindowFonts(printWindow); await waitForPrintWindowImages(printWindow); printWindow.focus(); printWindow.print(); }, 100);
                } catch (error) {
                    writeWindow(printWindow, '<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"></head><body><div class="print-error">' + escapeHtml(error.message || 'تعذر تجهيز المسودة.') + '</div></body></html>');
                }
            }

            async function downloadCoachingDraftPdf(draft, type, catalog = {}, clientLabel = '') {
                try {
                    const normalized = normalizeCoachingDraft(draft, type, catalog, clientLabel);
                const filename = coachingFilename(type, normalized.system);
                if (type === 'workout') await preloadPrintImages(normalized.libraryItems);
                const blob = await createPdfFromDocument(buildCoachingSystemDocument(normalized.system, type, normalized.libraryItems), filename);
                    downloadBlob(blob, filename);
                    notifyPrint('تم تجهيز ملف PDF وتحميله بنجاح.');
                } catch (error) {
                    notifyPrint(error.message || 'تعذر إنشاء ملف PDF.', 'error');
                }
            }

            function coachingOverviewTable(head, rows, emptyLabel = 'لا توجد بيانات مسجلة.') {
                return '<div class="print-table-wrap"><table class="print-table"><thead><tr>' + head + '</tr></thead><tbody>' + (rows || '<tr><td colspan="4"><div class="print-empty">' + escapeHtml(emptyLabel) + '</div></td></tr>') + '</tbody></table></div>';
            }

            function buildCoachingOverviewDocument(overview) {
                const member = overview.member || {};
                const progress = overview.progress || {};
                const workouts = overview.workoutPrograms || [];
                const diets = overview.dietPlans || [];
                const workoutRows = workouts.map((item) => '<tr><td><span class="print-table-main">' + escapeHtml(item.name) + '</span><span class="print-table-sub">' + escapeHtml(item.goal || '—') + ' · ' + escapeHtml(item.level || '—') + '</span></td><td>' + escapeHtml(printDate(item.startDate)) + '<span class="print-table-sub">حتى ' + escapeHtml(printDate(item.endDate)) + '</span></td><td>' + escapeHtml(coachingStatusLabel(item.status)) + '</td><td dir="ltr">' + coachingNumber(item.exerciseCount || item.exercises) + ' تمرين</td></tr>').join('');
                const dietRows = diets.map((item) => '<tr><td><span class="print-table-main">' + escapeHtml(item.name) + '</span><span class="print-table-sub">' + coachingNumber(item.targetCalories) + ' سعر</span></td><td>' + escapeHtml(printDate(item.startDate)) + '<span class="print-table-sub">حتى ' + escapeHtml(printDate(item.endDate)) + '</span></td><td>' + escapeHtml(coachingStatusLabel(item.status)) + '</td><td dir="ltr">' + coachingNumber(item.mealsPerDay || item.mealCount) + ' وجبات</td></tr>').join('');
                const measurementRows = (overview.measurements || []).map((item) => '<tr><td dir="ltr">' + escapeHtml(item.measuredAt || '—') + '</td><td dir="ltr">' + (item.weightKg == null ? '—' : coachingNumber(item.weightKg, 1) + ' كجم') + '</td><td dir="ltr">' + (item.heightCm == null ? '—' : coachingNumber(item.heightCm, 1) + ' سم') + '</td><td dir="ltr">' + (item.bodyFatPercent == null ? '—' : coachingNumber(item.bodyFatPercent, 1) + '%') + '</td></tr>').join('');
                const sessionRows = (overview.workoutSessions || []).map((item) => '<tr><td>' + escapeHtml(item.programName || 'جلسة تدريب') + '</td><td>' + escapeHtml(item.routineName || '—') + '</td><td>' + escapeHtml(item.status === 'completed' ? 'مكتملة' : item.status || '—') + '</td><td dir="ltr">' + escapeHtml(item.startedAt || item.createdAt || '—') + '</td></tr>').join('');
                const mealRows = (overview.mealLogs || []).map((item) => '<tr><td>' + escapeHtml(item.foodName || 'طعام') + '</td><td>' + escapeHtml(item.mealName || '—') + '</td><td dir="ltr">' + coachingNumber(item.calories, 1) + '</td><td dir="ltr">' + escapeHtml(item.consumedAt || '—') + '</td></tr>').join('');
                const section = (kicker, title, head, rows, empty) => '<section class="print-section"><div class="print-section-title"><div><span class="print-section-kicker">' + kicker + '</span><h2>' + title + '</h2></div></div>' + coachingOverviewTable(head, rows, empty) + '</section>';
                const system = { id: member.id, memberName: member.fullName, memberPhone: member.phone, name: 'ملف التدريب والتغذية' };
                const hero = '<section class="print-section print-system-hero"><div class="print-system-hero-copy"><span class="print-section-kicker">ملف العميل</span><h2>' + escapeHtml(member.fullName || 'العميل') + '</h2><p>' + escapeHtml(member.phone || '—') + (member.email ? ' · ' + escapeHtml(member.email) : '') + '</p></div><div class="print-system-hero-title"><span>التنفيذ والمتابعة</span><strong>' + escapeHtml(member.registrationDate ? printDate(member.registrationDate) : 'ملف نشط') + '</strong></div></section>';
                const footer = printFooterMarkup('إدارة التدريب والتغذية الرياضية', true);
                return '<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>ملف التدريب والتغذية - ' + escapeHtml(brandName()) + '</title></head><body><main class="print-sheet print-system-document">' + coachingHeader('ملف التدريب والتغذية الكامل', system) + '<div class="print-accent"></div>' + hero + '<section class="print-section"><div class="print-system-kpi-grid">' + coachingKpi('برامج التدريب', coachingNumber(workouts.length)) + coachingKpi('خطط التغذية', coachingNumber(diets.length)) + coachingKpi('القياسات', coachingNumber((overview.measurements || []).length)) + coachingKpi('الجلسات المكتملة', coachingNumber(progress.completedSessions || progress.sessionCount)) + coachingKpi('تسجيلات الوجبات', coachingNumber(progress.mealLogCount)) + coachingKpi('الوزن الحالي', progress.currentWeight == null ? '—' : coachingNumber(progress.currentWeight, 1) + ' كجم') + '</div></section>' + section('الأنظمة المحفوظة', 'برامج التدريب', '<th>البرنامج والهدف</th><th>الفترة</th><th>الحالة</th><th>المحتوى</th>', workoutRows, 'لا توجد برامج تدريب.') + section('الأنظمة المحفوظة', 'خطط التغذية', '<th>الخطة والسعرات</th><th>الفترة</th><th>الحالة</th><th>المحتوى</th>', dietRows, 'لا توجد خطط تغذية.') + section('المتابعة البدنية', 'القياسات المسجلة', '<th>التاريخ</th><th>الوزن</th><th>الطول</th><th>نسبة الدهون</th>', measurementRows, 'لا توجد قياسات.') + section('التنفيذ', 'جلسات التدريب', '<th>البرنامج</th><th>اليوم</th><th>الحالة</th><th>وقت البدء</th>', sessionRows, 'لا توجد جلسات.') + section('التنفيذ', 'سجل الوجبات', '<th>الطعام</th><th>الوجبة</th><th>السعرات</th><th>وقت التسجيل</th>', mealRows, 'لا توجد وجبات مسجلة.') + (member.notes ? '<section class="print-section"><div class="print-section-title"><div><span class="print-section-kicker">ملاحظات العميل</span><h2>ملاحظات الملف</h2></div></div><p class="print-notes">' + escapeHtml(member.notes) + '</p></section>' : '') + footer + '</main></body></html>';
            }

            async function printCoachingOverview(memberId, existingWindow = null) {
                const printWindow = existingWindow || window.open('', '_blank', 'width=980,height=820');
                if (!printWindow) {
                    notifyPrint('يرجى السماح بالنوافذ المنبثقة لإتمام الطباعة.', 'error');
                    return;
                }
                writePrintLoading(printWindow, 'جاري تجهيز ملف التدريب والتغذية…');
                try {
                    const overview = await fetchPrintJson('/api/clients/' + encodeURIComponent(memberId) + '/training-overview');
                    writeWindow(printWindow, buildCoachingOverviewDocument(overview));
                    printWindow.onafterprint = () => printWindow.close();
                    window.setTimeout(async () => { await waitForPrintWindowFonts(printWindow); printWindow.focus(); printWindow.print(); }, 450);
                } catch (error) {
                    writeWindow(printWindow, '<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"></head><body><div class="print-error">' + escapeHtml(error.message || 'تعذر تجهيز الملف.') + '</div></body></html>');
                }
            }

            async function downloadCoachingOverviewPdf(memberId) {
                try {
                    const overview = await fetchPrintJson('/api/clients/' + encodeURIComponent(memberId) + '/training-overview');
                    const filename = String(brandName()).replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-+|-+$/g, '').slice(0, 30) + '-Coaching-Profile-' + memberId + '.pdf';
                    const blob = await createPdfFromDocument(buildCoachingOverviewDocument(overview), filename);
                    downloadBlob(blob, filename);
                    notifyPrint('تم تجهيز ملف PDF وتحميله بنجاح.');
                } catch (error) {
                    notifyPrint(error.message || 'تعذر إنشاء ملف PDF.', 'error');
                }
            }

            async function printMember(memberId, mode = 'membership') {
                const printWindow = window.open('', '_blank', 'width=980,height=820');
                if (!printWindow) {
                    window.alert('يرجى السماح بالنوافذ المنبثقة لإتمام الطباعة.');
                    return;
                }
                writeWindow(printWindow, `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"></head><body><div class="print-loading">جاري تجهيز مستند الطباعة…</div></body></html>`);
                try {
                    const data = await fetchMemberDetails(memberId);
                    writeWindow(printWindow, buildPrintDocument(data, mode));
                    printWindow.onafterprint = () => printWindow.close();
                    window.setTimeout(async () => { await waitForPrintWindowFonts(printWindow); printWindow.focus(); printWindow.print(); }, 450);
                } catch (error) {
                    writeWindow(printWindow, `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"></head><body><div class="print-error">${escapeHtml(error.message)}</div></body></html>`);
                }
            }

            async function printPaymentReceipt(memberId, paymentId) {
                const printWindow = window.open('', '_blank', 'width=900,height=760');
                if (!printWindow) {
                    window.alert('يرجى السماح بالنوافذ المنبثقة لإتمام طباعة الإيصال.');
                    return;
                }
                writeWindow(printWindow, `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"></head><body><div class="print-loading">جاري تجهيز الإيصال…</div></body></html>`);
                try {
                    const data = await fetchMemberDetails(memberId);
                    const payment = (data.payments || []).find((item) => Number(item.id) === Number(paymentId));
                    if (!payment) throw new Error('الإيصال غير موجود. حدّث بيانات العضو وحاول مرة أخرى.');
                    writeWindow(printWindow, buildPaymentReceiptDocument(data, payment));
                    printWindow.onafterprint = () => printWindow.close();
                    window.setTimeout(async () => { await waitForPrintWindowFonts(printWindow); printWindow.focus(); printWindow.print(); }, 450);
                } catch (error) {
                    writeWindow(printWindow, `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"></head><body><div class="print-error">${escapeHtml(error.message)}</div></body></html>`);
                }
            }

            window.topGymPrint = {
                ...(window.topGymPrint || {}),
                printMember,
                printPaymentReceipt,
                createPdfFile,
                printPricing,
                printCoachingSystem,
                downloadCoachingPdf,
                downloadPricingPdf,
                printCoachingDraft,
                writeCoachingDraft,
                downloadCoachingDraftPdf,
                printCoachingOverview,
                downloadCoachingOverviewPdf
            };

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
                    const menuPanel = actions.querySelector('.action-menu-panel');
                    if (menuPanel) {
                        button.className = 'action-menu-item';
                        button.dataset.printMenuItem = 'true';
                        button.innerHTML = '<span class="action-menu-print-icon" aria-hidden="true">⎙</span><span>طباعة الاشتراك</span>';
                        menuPanel.append(button);
                    } else {
                        button.innerHTML = '<span class="print-source-icon" aria-hidden="true">⎙</span>';
                        actions.append(button);
                    }
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
                printButton.dataset.requiredPermission = 'members.print,members.read,memberships.read';
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

            function initializePrintEnhancements() {
                ensurePrintActions();
                ensureDetailsPrintButton();
            }

            if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initializePrintEnhancements, { once: true });
            else initializePrintEnhancements();
        })();
