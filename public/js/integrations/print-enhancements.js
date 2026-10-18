        (() => {
            const list = document.getElementById('membersList');
            function printLocale() {
                return window.TopGymI18n?.get?.() === 'en' ? 'en' : 'ar';
            }

            function printText(key, params = {}) {
                return window.TopGymI18n?.t?.(`print.member.${key}`, params) || key;
            }

            function localizedDomainLabel(value, labelKeys, fallback = '—') {
                if (!value) return fallback;
                const key = labelKeys[value];
                if (key) {
                    const translated = window.TopGymI18n?.t?.(key);
                    if (translated && translated !== key) return translated;
                }
                return String(value);
            }

            const PLAN_LABEL_KEYS = { gym_only: 'members.details.gymOnly', gym_cardio: 'members.details.gymCardio' };
            const TYPE_LABEL_KEYS = {
                monthly: 'members.details.monthly', half_month: 'members.details.halfMonth',
                quarterly: 'members.details.quarterly', semiannual: 'members.details.semiannual', annual: 'members.details.annual',
                'two month': 'reports.plan.twoMonths', custom_mslzyl8m: 'reports.plan.twoMonths'
            };
            const PAYMENT_LABEL_KEYS = {
                cash: 'members.details.cash', card: 'members.details.card', transfer: 'members.details.transfer',
                wallet: 'members.details.wallet', other: 'members.details.other'
            };
            const STATUS_LABEL_KEYS = {
                active: 'members.details.active', expiring_soon: 'members.details.expiringSoon',
                expired: 'members.details.expired', frozen: 'members.details.frozen', cancelled: 'members.details.cancelledStatus'
            };

            function printPaperColor() {
                return window.topGymThemeValue?.('--qr-paper')
                    || getComputedStyle(document.documentElement).getPropertyValue('--bg-surface').trim();
            }

            function escapeHtml(value) {
                return String(value ?? '').replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));
            }

            function displayPhone(value, iso = '') {
                return window.LogicFitPhoneInputs?.formatForDisplay?.(value, iso) || String(value || '');
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
                return new Intl.DateTimeFormat(`${printLocale()}-EG-u-ca-gregory`, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(date);
            }

            function printDateTime(value) {
                if (!value) return '—';
                const date = new Date(value);
                if (Number.isNaN(date.getTime())) return String(value);
                return new Intl.DateTimeFormat(`${printLocale()}-EG-u-ca-gregory`, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', hour: 'numeric', minute: '2-digit' }).format(date);
            }

            function money(value) {
                return window.TopGymI18n?.format?.('currency', Number(value || 0), { currency: 'EGP', minimumFractionDigits: 2, maximumFractionDigits: 2 })
                    || `${Number(value || 0).toLocaleString('ar-EG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ج.م`;
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
                const primary = safeBrandHex(theme.primary, '#0070F3');
                const hover = safeBrandHex(theme.primaryHover, '#0061DD');
                const text = safeBrandHex(theme.textPrimary, '#172033');
                const muted = safeBrandHex(theme.textMuted, '#718096');
                const border = safeBrandHex(theme.border, '#D9E2EF');
                const surface = safeBrandHex(theme.card, '#F5F9FF');
                const borderSoft = safeBrandHex(theme.borderSecondary, '#E7EDF5');
                return `<style data-top-gym-print-brand>:root{--print-brand-primary:${primary};--print-brand-primary-hover:${hover};--print-brand-text:${text};--print-brand-muted:${muted};--print-brand-border:${border};--print-brand-surface:${surface};--print-brand-border-soft:${borderSoft};}</style>`;
            }

            function printStylesheetLink() {
                return '<link rel="stylesheet" data-top-gym-print-styles href="' + assetUrl('/css/print.css?v=abbd420dc55de00d') + '">' + printBrandVariables();
            }

            function printBrandMarkup(subtitle = null) {
                const config = branding();
                const logo = config.assets?.printLogo?.url || config.assets?.primaryLogo?.url || '/assets/logic-fit-logo-horizontal.svg?v=1';
                return '<div class="print-brand"><img class="print-logo" src="' + assetUrl(logo) + '" alt="' + escapeHtml(brandName()) + '"><div class="print-brand-copy"><h1 class="print-brand-title">' + escapeHtml(brandName()) + '</h1><span class="print-brand-subtitle">' + escapeHtml(subtitle || printText('brand.subtitle')) + '</span></div></div>';
            }

            function printFooterMarkup(context = null, generatedSystem = false) {
                const config = branding();
                const footer = config.documents?.footer || 'إدارة أذكى، أداء أفضل.';
                const generatedBy = printText('footer.generatedBy', { brand: brandName() });
                return '<footer class="print-footer"><div class="print-footer-management"><strong>' + escapeHtml(config.identity?.companyName || brandName()) + '</strong><span>' + escapeHtml(context || printText('brand.subtitle')) + ' · ' + escapeHtml(generatedSystem ? generatedBy : footer) + '</span></div><span class="print-signature">' + escapeHtml(printText('footer.signature')) + '</span></footer>';
            }

            function planLabel(value) { return localizedDomainLabel(value, PLAN_LABEL_KEYS); }
            function typeLabel(value) { return localizedDomainLabel(value, TYPE_LABEL_KEYS); }
            function paymentLabel(value) { return localizedDomainLabel(value, PAYMENT_LABEL_KEYS); }
            function statusLabel(value) { return localizedDomainLabel(value, STATUS_LABEL_KEYS); }
            function currentMembership(data) { return data.memberships?.[data.memberships.length - 1] || null; }
            function scopeNames(items) { return (Array.isArray(items) ? items : []).map((item) => String(item?.name || '').trim()).filter(Boolean).join(printLocale() === 'en' ? ', ' : '، ') || printText('value.notSpecified'); }

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
                if (details.startDate) values.push(printText('value.from', { date: printDate(details.startDate) }));
                if (details.endDate) values.push(printText('value.to', { date: printDate(details.endDate) }));
                if (details.amountDue !== undefined) values.push(printText('value.due', { amount: money(details.amountDue) }));
                if (details.amountPaid !== undefined) values.push(printText('value.paid', { amount: money(details.amountPaid) }));
                if (details.days) values.push(printText('value.dayCount', { count: window.TopGymI18n?.format?.('number', details.days) || details.days }));
                return values.join(' · ') || printText('value.operationRecorded');
            }

            function eventLabel(value) {
                const keys = {
                    created: 'operation.created', updated: 'operation.updated', renewed: 'operation.renewed',
                    frozen: 'operation.frozen', resumed: 'operation.resumed', payment_updated: 'operation.paymentUpdated'
                };
                return keys[value] ? printText(keys[value]) : value || printText('table.operation');
            }

            function transactionLabel(value) {
                const keys = { subscription: 'operation.transactionSubscription', payment: 'operation.transactionPayment', adjustment: 'operation.transactionAdjustment' };
                return keys[value] ? printText(keys[value]) : value || printText('table.operation');
            }

            function membershipHistory(data) {
                const rows = (data.memberships || []).map((item) => `<tr>
                    <td><span class="print-table-main">${escapeHtml(planLabel(item.plan))}</span><span class="print-table-sub">${escapeHtml(typeLabel(item.type))}</span></td>
                    <td>${escapeHtml(scopeNames(item.scope?.branches))}</td>
                    <td>${escapeHtml(scopeNames(item.scope?.sections))}</td>
                    <td>${escapeHtml(printDate(item.startDate))}<span class="print-table-sub">${escapeHtml(printText('value.until', { date: printDate(item.effectiveEndDate) }))}</span></td>
                    <td><span class="print-status ${escapeHtml(item.status)}">${escapeHtml(statusLabel(item.status))}</span></td>
                    <td>${escapeHtml(money(item.amountDue))}<span class="print-table-sub">${escapeHtml(printText('value.remaining', { amount: money(item.amountRemaining) }))}</span></td>
                    <td>${escapeHtml(printDate(item.paidAt))}</td>
                </tr>`).join('');
                return rows || `<tr><td colspan="5"><div class="print-empty">${escapeHtml(printText('empty.memberships'))}</div></td></tr>`;
            }

            function freezeHistory(data) {
                const rows = (data.freezes || []).map((item) => `<tr>
                    <td>${escapeHtml(printDate(item.startDate))}</td>
                    <td>${escapeHtml(printDate(item.endDate))}</td>
                    <td>${escapeHtml(item.resumedDate ? printDate(item.resumedDate) : printText('value.active'))}</td>
                    <td>${escapeHtml(printText('value.dayCount', { count: window.TopGymI18n?.format?.('number', item.days || 0) || item.days || 0 }))}</td>
                    <td>${escapeHtml(item.reason || '—')}</td>
                </tr>`).join('');
                return rows || `<tr><td colspan="5"><div class="print-empty">${escapeHtml(printText('empty.freezes'))}</div></td></tr>`;
            }

            function eventHistory(data) {
                const rows = (data.events || []).map((event) => `<tr>
                    <td>${escapeHtml(printDateTime(event.createdAt))}</td>
                    <td>${escapeHtml(eventLabel(event.eventType))}</td>
                    <td>${escapeHtml(eventSummary(event))}</td>
                </tr>`).join('');
                return rows || `<tr><td colspan="3"><div class="print-empty">${escapeHtml(printText('empty.events'))}</div></td></tr>`;
            }

            function paymentHistory(data) {
                const rows = (data.payments || []).map((payment) => `<tr>
                    <td>${escapeHtml(payment.receiptNumber || `TG-${String(payment.id).padStart(6, '0')}`)}</td>
                    <td>${escapeHtml(printDateTime(payment.transactionDate || payment.createdAt))}</td>
                    <td>${escapeHtml(transactionLabel(payment.transactionType))}</td>
                    <td>${escapeHtml(planLabel(payment.plan))}<span class="print-table-sub">${escapeHtml(typeLabel(payment.type))}</span></td>
                    <td>${escapeHtml(money(payment.amountPaid))}</td>
                    <td>${escapeHtml(money(payment.amountRemaining))}</td>
                    <td>${escapeHtml(paymentLabel(payment.paymentMethod))}</td>
                    <td>${escapeHtml(payment.notes || '—')}</td>
                </tr>`).join('');
                return rows || `<tr><td colspan="8"><div class="print-empty">${escapeHtml(printText('empty.payments'))}</div></td></tr>`;
            }

            function buildPrintDocument(data, mode) {
                const member = data.member || {};
                const membership = currentMembership(data);
                const title = printText(mode === 'full' ? 'document.fullProfileTitle' : mode === 'new' ? 'document.newMembershipTitle' : 'document.membershipTitle');
                const memberName = member.fullName || printText('value.memberFallback');
                const memberInfo = `<section class="print-section">
                    <div class="print-section-title"><div><span class="print-section-kicker">${escapeHtml(printText('section.customerData'))}</span><h2>${escapeHtml(printText('section.memberData'))}</h2></div></div>
                    <div class="print-member-hero"><span class="print-member-avatar">${escapeHtml(initials(memberName))}</span><div class="print-member-copy"><h2>${escapeHtml(memberName)}</h2><p>${escapeHtml(displayPhone(member.phone, member.phoneCountry) || '—')}${member.email ? ` · ${escapeHtml(member.email)}` : ''}</p></div></div>
                    <div class="print-info-grid">${infoItem(printText('field.memberNumber'), `#${member.id || '—'}`)}${infoItem(printText('field.registrationDate'), printDate(member.registrationDate))}${infoItem(printText('field.email'), member.email || '—')}${infoItem(printText('field.memberNotes'), member.notes || '—')}</div>
                </section>`;
                const membershipScope = membership?.scope || {};
                const membershipAccessInfo = `<section class="print-section"><div class="print-section-title"><div><span class="print-section-kicker">${escapeHtml(printText('section.accessScope'))}</span><h2>${escapeHtml(printText('section.accessDetails'))}</h2></div></div><div class="print-info-grid">${infoItem(printText('field.branch'), scopeNames(membershipScope.branches))}${infoItem(printText('field.section'), scopeNames(membershipScope.sections))}${infoItem(printText('field.portalCode'), member.membershipCode?.maskedCode || printText('value.notAvailable'))}${infoItem(printText('field.portalLink'), member.membershipCodePortalUrl || printText('value.notAvailable'))}</div></section>`;
                const membershipInfo = membership ? `<section class="print-section">
                    <div class="print-section-title"><div><span class="print-section-kicker">${escapeHtml(printText('section.membershipDetails'))}</span><h2>${escapeHtml(printText(mode === 'new' ? 'section.newMembershipDetails' : 'section.currentMembership'))}</h2></div><span class="print-status ${escapeHtml(membership.status)}">${escapeHtml(statusLabel(membership.status))}</span></div>
                    <div class="print-info-grid">${infoItem(printText('field.plan'), planLabel(membership.plan))}${infoItem(printText('field.membershipType'), typeLabel(membership.type))}${infoItem(printText('field.startDate'), printDate(membership.startDate))}${infoItem(printText('field.endDate'), printDate(membership.effectiveEndDate))}${infoItem(printText('field.daysRemaining'), membership.status === 'expired' ? printText('value.expiredSince', { count: window.TopGymI18n?.format?.('number', Math.abs(Number(membership.daysRemaining || 0))) || Math.abs(Number(membership.daysRemaining || 0)) }) : printText('value.dayCount', { count: window.TopGymI18n?.format?.('number', Number(membership.daysRemaining || 0)) || Number(membership.daysRemaining || 0) }))}${infoItem(printText('field.freeze'), `${Number(membership.freezeCount || 0)}/${Number(membership.freezeLimit || 3)}`)}${infoItem(printText('field.paymentDate'), printDate(membership.paidAt))}${infoItem(printText('field.paymentMethod'), paymentLabel(membership.paymentMethod))}</div>
                    <div class="print-billing-grid">${billingItem(printText('field.basePrice'), money(membership.listPrice))}${billingItem(printText('field.discount'), money(membership.discountAmount))}${billingItem(printText('field.amountDue'), money(membership.amountDue))}${billingItem(printText('field.amountRemaining'), money(membership.amountRemaining), 'remaining')}</div>
                    ${membership.notes ? `<p class="print-notes"><strong>${escapeHtml(printText('field.membershipNotes'))}:</strong> ${escapeHtml(membership.notes)}</p>` : ''}
                </section>` : `<section class="print-section"><div class="print-empty">${escapeHtml(printText('value.noMembership'))}</div></section>`;
                const history = mode === 'full' ? `<section class="print-section"><div class="print-section-title"><div><span class="print-section-kicker">${escapeHtml(printText('section.financialHistory'))}</span><h2>${escapeHtml(printText('section.paymentHistory'))}</h2></div></div><div class="print-billing-grid print-payment-summary">${billingItem(printText('field.totalDue'), money(data.financialSummary?.totalDue))}${billingItem(printText('field.totalPaid'), money(data.financialSummary?.totalPaid))}${billingItem(printText('field.totalRemaining'), money(data.financialSummary?.totalRemaining), 'remaining')}${billingItem(printText('field.receiptCount'), String(data.financialSummary?.paidTransactionCount || 0))}</div><div class="print-table-wrap"><table class="print-table"><thead><tr><th>${escapeHtml(printText('table.receiptNumber'))}</th><th>${escapeHtml(printText('table.date'))}</th><th>${escapeHtml(printText('table.operation'))}</th><th>${escapeHtml(printText('table.membership'))}</th><th>${escapeHtml(printText('table.transactionAmount'))}</th><th>${escapeHtml(printText('table.remaining'))}</th><th>${escapeHtml(printText('table.paymentMethod'))}</th><th>${escapeHtml(printText('table.notes'))}</th></tr></thead><tbody>${paymentHistory(data)}</tbody></table></div></section>
                    <section class="print-section"><div class="print-section-title"><div><span class="print-section-kicker">${escapeHtml(printText('section.completeHistory'))}</span><h2>${escapeHtml(printText('section.membershipHistory'))}</h2></div></div><div class="print-table-wrap"><table class="print-table"><thead><tr><th>${escapeHtml(printText('table.planAndDuration'))}</th><th>${escapeHtml(printText('table.branch'))}</th><th>${escapeHtml(printText('table.section'))}</th><th>${escapeHtml(printText('table.period'))}</th><th>${escapeHtml(printText('table.status'))}</th><th>${escapeHtml(printText('table.account'))}</th><th>${escapeHtml(printText('table.payment'))}</th></tr></thead><tbody>${membershipHistory(data)}</tbody></table></div></section>
                    <section class="print-section"><div class="print-section-title"><div><span class="print-section-kicker">${escapeHtml(printText('section.freezeHistory'))}</span><h2>${escapeHtml(printText('section.freezeOperations'))}</h2></div></div><div class="print-table-wrap"><table class="print-table"><thead><tr><th>${escapeHtml(printText('table.start'))}</th><th>${escapeHtml(printText('table.end'))}</th><th>${escapeHtml(printText('table.resumption'))}</th><th>${escapeHtml(printText('table.duration'))}</th><th>${escapeHtml(printText('table.reason'))}</th></tr></thead><tbody>${freezeHistory(data)}</tbody></table></div></section>
                    <section class="print-section"><div class="print-section-title"><div><span class="print-section-kicker">${escapeHtml(printText('section.activityHistory'))}</span><h2>${escapeHtml(printText('section.allRecordedOperations'))}</h2></div></div><div class="print-table-wrap"><table class="print-table"><thead><tr><th>${escapeHtml(printText('table.date'))}</th><th>${escapeHtml(printText('table.operation'))}</th><th>${escapeHtml(printText('table.details'))}</th></tr></thead><tbody>${eventHistory(data)}</tbody></table></div></section>` : '';
                const printHeader = `<header class="print-header">${printBrandMarkup(printText('brand.managementContext'))}<div class="print-document-meta"><strong>${escapeHtml(title)}</strong><span>${escapeHtml(printText('meta.memberNumber'))}: #${escapeHtml(member.id || '—')}</span><span>${escapeHtml(printText('meta.printedAt'))}: ${escapeHtml(printDate(new Date()))}</span></div></header>`;
                const printFooter = printFooterMarkup(printText('brand.managementContext'));
                const locale = printLocale();
                return `<!doctype html><html lang="${locale}" dir="${locale === 'ar' ? 'rtl' : 'ltr'}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escapeHtml(title)} - ${escapeHtml(brandName())}</title></head><body><main class="print-sheet${mode === 'full' ? ' print-member-full' : ''}">${printHeader}<div class="print-accent"></div>${memberInfo}${membershipAccessInfo}${membershipInfo}${history}${printFooter}</main></body></html>`;
            }

            function buildPaymentReceiptDocument(data, payment) {
                const member = data.member || {};
                const membership = (data.memberships || []).find((item) => Number(item.id) === Number(payment.membershipId)) || currentMembership(data);
                const title = printText('document.paymentReceiptTitle');
                const printHeader = `<header class="print-header">${printBrandMarkup(printText('brand.managementContext'))}<div class="print-document-meta"><strong>${escapeHtml(title)}</strong><span>${escapeHtml(printText('meta.receiptNumber'))}: ${escapeHtml(payment.receiptNumber || `TG-${String(payment.id).padStart(6, '0')}`)}</span><span>${escapeHtml(printText('meta.printedAt'))}: ${escapeHtml(printDate(new Date()))}</span></div></header>`;
                const memberInfo = `<section class="print-section"><div class="print-section-title"><div><span class="print-section-kicker">${escapeHtml(printText('section.customerData'))}</span><h2>${escapeHtml(printText('document.paymentReceiptTitle'))}</h2></div><span class="print-receipt-id">${escapeHtml(payment.receiptNumber || '—')}</span></div><div class="print-member-hero"><span class="print-member-avatar">${escapeHtml(initials(member.fullName))}</span><div class="print-member-copy"><h2>${escapeHtml(member.fullName || printText('value.memberFallback'))}</h2><p>${escapeHtml(displayPhone(member.phone, member.phoneCountry) || '—')}</p></div></div><div class="print-info-grid">${infoItem(printText('field.memberNumber'), `#${member.id || '—'}`)}${infoItem(printText('table.operation'), printDateTime(payment.transactionDate || payment.createdAt))}${infoItem(printText('field.plan'), planLabel(payment.plan))}${infoItem(printText('field.membershipType'), typeLabel(payment.type))}</div></section>`;
                const paymentInfo = `<section class="print-section"><div class="print-section-title"><div><span class="print-section-kicker">${escapeHtml(printText('section.membershipDetails'))}</span><h2>${escapeHtml(transactionLabel(payment.transactionType))}</h2></div></div><div class="print-info-grid">${infoItem(printText('field.paymentMethod'), paymentLabel(payment.paymentMethod))}${infoItem(printText('field.startDate'), printDate(membership?.startDate))}${infoItem(printText('field.endDate'), printDate(membership?.effectiveEndDate))}${infoItem(printText('field.amountDue'), money(payment.amountDue))}</div><div class="print-receipt-amount"><span>${escapeHtml(printText('table.transactionAmount'))}</span><strong>${escapeHtml(money(payment.amountPaid))}</strong><small>${escapeHtml(printText('field.amountRemaining'))}: ${escapeHtml(money(payment.amountRemaining))}</small></div>${payment.notes ? `<p class="print-notes"><strong>${escapeHtml(printText('table.notes'))}:</strong> ${escapeHtml(payment.notes)}</p>` : ''}</section>`;
                const printFooter = printFooterMarkup(printText('brand.managementContext'));
                const locale = printLocale();
                return `<!doctype html><html lang="${locale}" dir="${locale === 'ar' ? 'rtl' : 'ltr'}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escapeHtml(title)} - ${escapeHtml(brandName())}</title></head><body><main class="print-sheet">${printHeader}<div class="print-accent"></div>${memberInfo}${paymentInfo}${printFooter}</main></body></html>`;
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
                const pdfStylesheet = parsed.head?.querySelector('[data-top-gym-print-styles]')?.cloneNode(true);
                const brandVariables = parsed.head?.querySelector('[data-top-gym-print-brand]')?.cloneNode(true);
                let stylesheetLoaded = false;
                holder.dir = 'rtl';
                holder.className = 'print-pdf-host';
                // Keep the source node in the viewport's origin. html2canvas can
                // miscalculate page offsets for elements positioned far outside
                // the viewport, which yields blank leading areas and clipped pages.
                holder.style.cssText = `position:fixed;left:0;top:0;width:190mm;min-height:1px;overflow:visible;background:${printPaperColor()};z-index:-1;opacity:0;pointer-events:none;`;
                if (brandVariables) {
                    brandVariables.textContent = brandVariables.textContent.replace(/:root/g, '.print-pdf-host');
                    holder.append(brandVariables);
                }
                holder.append(sheet);
                document.body.append(holder);
                try {
                    if (pdfStylesheet) {
                        await new Promise((resolve) => {
                            pdfStylesheet.onload = () => { stylesheetLoaded = true; resolve(); };
                            pdfStylesheet.onerror = resolve;
                            document.head.append(pdfStylesheet);
                        });
                    }
                    if (!stylesheetLoaded) throw new Error('تعذر تحميل تنسيقات مستند PDF.');
                    if (document.fonts?.ready) await document.fonts.ready;
                    if (document.fonts?.load) await Promise.all(['400 10pt Cairo', '700 10pt Cairo', '800 16pt Cairo'].map((font) => document.fonts.load(font).catch(() => [])));
                    await Promise.all([...holder.querySelectorAll('img')].map((image) => image.complete ? Promise.resolve() : new Promise((resolve) => { image.onload = resolve; image.onerror = resolve; })));
                    const blob = await window.html2pdf().set({
                        margin: [6, 8, 6, 8],
                        image: { type: 'jpeg', quality: .98 },
                        html2canvas: {
                            scale: 2,
                            useCORS: true,
                            scrollX: 0,
                            scrollY: 0,
                            windowHeight: Math.max(window.innerHeight, Math.ceil(sheet.getBoundingClientRect().height)),
                            backgroundColor: printPaperColor(),
                            logging: false,
                            letterRendering: true,
                            onclone: (clonedDocument) => {
                                const clonedHost = clonedDocument.querySelector('.print-pdf-host');
                                if (clonedHost) {
                                    clonedHost.style.position = 'fixed';
                                    clonedHost.style.left = '0';
                                    clonedHost.style.top = '0';
                                    clonedHost.style.opacity = '1';
                                    clonedHost.style.zIndex = 'auto';
                                }
                            }
                        },
                        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
                        pagebreak: { mode: ['css', 'legacy'] }
                    }).from(sheet).outputPdf('blob');
                    const filename = `${String(brandName()).replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-+|-+$/g, '').slice(0, 30) || 'Gym'}-${String(data.member?.id || memberId)}-${mode}.pdf`;
                    return { data, file: new File([blob], filename, { type: 'application/pdf' }) };
                } finally {
                    pdfStylesheet?.remove();
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

            function coachingPrintText(key, params = {}) {
                return window.TopGymI18n?.t?.(`print.coaching.${key}`, params) || key;
            }

            function coachingPrintDocumentAttributes() {
                const locale = printLocale();
                return { locale, direction: locale === 'en' ? 'ltr' : 'rtl' };
            }

            function coachingPrintNumber(value, digits = 0) {
                const parsed = Number(value);
                if (!Number.isFinite(parsed)) return '—';
                return window.TopGymI18n?.format?.('number', parsed, { maximumFractionDigits: digits, minimumFractionDigits: digits })
                    || parsed.toLocaleString(printLocale() === 'en' ? 'en-EG' : 'ar-EG', { maximumFractionDigits: digits, minimumFractionDigits: digits });
            }

            function coachingServingUnit(value) {
                const unit = String(value || '').trim();
                const normalized = unit.toLowerCase();
                const unitKeys = {
                    g: 'gram', gram: 'gram', grams: 'gram', 'جرام': 'gram', 'غرام': 'gram',
                    kg: 'kilogram', kilogram: 'kilogram', kilograms: 'kilogram', 'كجم': 'kilogram', 'كيلوجرام': 'kilogram',
                    ml: 'milliliter', milliliter: 'milliliter', milliliters: 'milliliter', 'مل': 'milliliter', 'ملليلتر': 'milliliter',
                    l: 'liter', liter: 'liter', liters: 'liter', 'لتر': 'liter',
                    cup: 'cup', cups: 'cup', 'كوب': 'cup',
                    tbsp: 'tablespoon', tablespoon: 'tablespoon', tablespoons: 'tablespoon', 'ملعقة كبيرة': 'tablespoon',
                    tsp: 'teaspoon', teaspoon: 'teaspoon', teaspoons: 'teaspoon', 'ملعقة صغيرة': 'teaspoon',
                    piece: 'piece', pieces: 'piece', 'حبة': 'piece'
                };
                const key = unitKeys[normalized];
                return key ? coachingPrintText(`servingUnit.${key}`) : unit;
            }

            function coachingStatusLabel(value) {
                const labels = { active: 'status.active', draft: 'status.draft', paused: 'status.paused', completed: 'status.completed', archived: 'status.archived' };
                return labels[value] ? coachingPrintText(labels[value]) : value || '—';
            }

            function coachingGoalLabel(value) {
                const labels = { lose: 'goal.lose', maintain: 'goal.maintain', gain: 'goal.gain' };
                return labels[value] ? coachingPrintText(labels[value]) : value || '—';
            }

            function coachingWorkoutGoalLabel(value) {
                const labels = { muscle: 'goal.muscle', strength: 'goal.strength', fat_loss: 'goal.fatLoss', fatLoss: 'goal.fatLoss', general_fitness: 'goal.generalFitness', generalFitness: 'goal.generalFitness', endurance: 'goal.endurance' };
                return labels[value] ? coachingPrintText(labels[value]) : value || '—';
            }

            function coachingWorkoutLevelLabel(value) {
                const labels = { beginner: 'level.beginner', intermediate: 'level.intermediate', advanced: 'level.advanced' };
                return labels[value] ? coachingPrintText(labels[value]) : value || '—';
            }

            function coachingPrintReps(exercise) {
                const min = exercise?.repsMin;
                const max = exercise?.repsMax;
                if (min === null || min === undefined || min === '') return '—';
                const first = coachingPrintNumber(min);
                if (max === null || max === undefined || max === '' || Number(max) === Number(min)) return first;
                return first + '–' + coachingPrintNumber(max);
            }

            function coachingActivityLabel(value) {
                const labels = { sedentary: 'activity.sedentary', light: 'activity.light', moderate: 'activity.moderate', high: 'activity.high', very_high: 'activity.veryHigh' };
                return labels[value] ? coachingPrintText(labels[value]) : value || '—';
            }

            function coachingGenderLabel(value) {
                if (value === 'female') return coachingPrintText('gender.female');
                if (value === 'male') return coachingPrintText('gender.male');
                return value || '—';
            }

            function coachingValue(value, fallback = '—') {
                return value === null || value === undefined || value === '' ? fallback : String(value);
            }

            function coachingLocalizedValue(arabicValue, englishValue, fallback = '') {
                const selected = printLocale() === 'en' ? englishValue || arabicValue : arabicValue || englishValue;
                return selected || fallback;
            }

            function coachingList(value) {
                if (Array.isArray(value)) return value.map((item) => String(item || '').trim()).filter(Boolean);
                if (value === null || value === undefined || value === '') return [];
                return [String(value).trim()].filter(Boolean);
            }

            function coachingListMarkup(value, emptyLabel = coachingPrintText('noData')) {
                const values = coachingList(value);
                if (!values.length) return '<span class="print-system-muted">' + escapeHtml(emptyLabel) + '</span>';
                return '<ul class="print-system-list">' + values.map((item) => '<li>' + escapeHtml(item) + '</li>').join('') + '</ul>';
            }

            function coachingItemName(item) {
                const english = printLocale() === 'en';
                return (english ? item?.nameEn || item?.name || item?.nameAr : item?.nameAr || item?.name || item?.nameEn)
                    || coachingPrintText('exerciseName');
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
                const startLabel = coachingPrintText('image.start');
                const endLabel = coachingPrintText('image.end');
                return '<div class="print-exercise-gallery">' + (start ? '<figure>' + exercisePrintImage(item, 'start', 'print-exercise-detail-image', startLabel) + '<figcaption>' + escapeHtml(startLabel) + '</figcaption></figure>' : '') + (end ? '<figure>' + exercisePrintImage(item, 'end', 'print-exercise-detail-image', endLabel) + '<figcaption>' + escapeHtml(endLabel) + '</figcaption></figure>' : '') + '</div>';
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
                const printDocument = printWindow?.document;
                if (!printDocument?.head) return;

                const stylesheet = printDocument.querySelector('[data-top-gym-print-styles]');
                if (stylesheet && !stylesheet.sheet) {
                    await new Promise((resolve) => {
                        let settled = false;
                        const finish = () => {
                            if (settled) return;
                            settled = true;
                            clearTimeout(timeout);
                            stylesheet.removeEventListener('load', finish);
                            stylesheet.removeEventListener('error', finish);
                            resolve();
                        };
                        const timeout = window.setTimeout(finish, 1200);
                        stylesheet.addEventListener('load', finish, { once: true });
                        stylesheet.addEventListener('error', finish, { once: true });
                    });

                    if (!stylesheet.sheet) {
                        try {
                            const response = await fetch(stylesheet.href, { credentials: 'same-origin' });
                            if (!response.ok) throw new Error('Print stylesheet could not be loaded.');
                            const inlineStyles = printDocument.createElement('style');
                            inlineStyles.dataset.topGymPrintStylesFallback = '';
                            inlineStyles.textContent = await response.text();
                            const base = printDocument.createElement('base');
                            base.href = new URL('/', window.location.href).href;
                            stylesheet.remove();
                            printDocument.head.prepend(base);
                            printDocument.head.append(inlineStyles);
                        } catch {
                            // Printing the generated document is preferable to
                            // leaving the user stuck if a stylesheet is unavailable.
                            stylesheet.remove();
                        }
                    }
                }

                const fontsReady = printDocument.fonts?.ready;
                if (fontsReady) {
                    await Promise.race([
                        fontsReady,
                        new Promise((resolve) => window.setTimeout(resolve, 1800))
                    ]);
                }
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
                system.memberName = system.memberName || clientLabel || coachingPrintText('client');
                system.name = system.name || `${coachingPrintText(type === 'diet' ? 'document.diet' : 'document.workout')} - ${system.memberName} · ${brandName()}`;
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
                        const food = foods.find((candidate) => String(candidate.id) === String(item.foodId));
                        // Drafts may already contain a complete food snapshot. Do not replace
                        // it with empty catalog defaults when printing without a loaded catalog.
                        if (!food) return { ...item };
                        const factor = Number(item.assignedQuantity || 0) / (Number(food.servingSize || 100) || 100);
                        return {
                            ...item,
                            nameAr: food.nameAr || food.name || item.nameAr || item.name,
                            nameEn: food.nameEn || item.nameEn,
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
                const memberName = coachingLocalizedValue(system.memberName, system.memberNameEn, system.fullName || coachingPrintText('client'));
                const memberPhone = displayPhone(system.memberPhone || system.phone, system.memberPhoneCountry || system.phoneCountry) || '—';
                const documentId = system.id ? '#' + system.id : coachingPrintText('documentId.draft');
                return '<header class="print-header">' + printBrandMarkup(coachingPrintText('brand.subtitle')) + '<div class="print-document-meta"><strong>' + escapeHtml(title) + '</strong><span><bdi>' + escapeHtml(memberName) + '</bdi> · <bdi>' + escapeHtml(memberPhone) + '</bdi></span><span><bdi>' + escapeHtml(documentId) + '</bdi> · ' + escapeHtml(printDate(new Date())) + '</span></div></header>';
            }

            function coachingMemberHero(system, type) {
                const memberName = coachingLocalizedValue(system.memberName, system.memberNameEn, system.fullName || coachingPrintText('client'));
                const memberPhone = displayPhone(system.memberPhone || system.phone, system.memberPhoneCountry || system.phoneCountry) || '—';
                const title = coachingPrintText(type === 'diet' ? 'approved.diet' : 'approved.workout');
                return '<section class="print-section print-system-hero"><div class="print-system-hero-copy"><span class="print-section-kicker">' + escapeHtml(coachingPrintText('clientFile')) + '</span><h2><bdi>' + escapeHtml(memberName) + '</bdi></h2><p><bdi>' + escapeHtml(memberPhone) + '</bdi>' + (system.memberEmail ? ' · <bdi>' + escapeHtml(system.memberEmail) + '</bdi>' : '') + '</p></div><div class="print-system-hero-title"><span>' + escapeHtml(title) + '</span><strong><bdi>' + escapeHtml(coachingLocalizedValue(system.name, system.nameEn, coachingPrintText('newSystem'))) + '</bdi></strong></div></section>';
            }

            function coachingKpi(label, value, detail = '') {
                return '<div class="print-system-kpi"><span>' + escapeHtml(label) + '</span><strong>' + escapeHtml(value) + '</strong>' + (detail ? '<small>' + escapeHtml(detail) + '</small>' : '') + '</div>';
            }

            function coachingInfo(label, value, className = '') {
                return '<div class="print-system-info ' + className + '"><span>' + escapeHtml(label) + '</span><strong><bdi>' + escapeHtml(coachingValue(value)) + '</bdi></strong></div>';
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
                    const muscle = detail.targetMuscleNameEn && printLocale() === 'en' ? detail.targetMuscleNameEn : detail.targetMuscleNameAr || detail.targetMuscleName || (detail.targetMuscleId ? coachingPrintText('muscleById', { id: detail.targetMuscleId }) : coachingPrintText('undeterminedMuscle'));
                    muscles[muscle] = (muscles[muscle] || 0) + Number(exercise.sets || 0);
                }));
                const muscleEntries = Object.entries(muscles).sort(([, first], [, second]) => second - first);
                const maxMuscleSets = Math.max(1, ...muscleEntries.map(([, count]) => count));
                const distribution = muscleEntries.length
                    ? '<div class="print-system-distribution">' + muscleEntries.map(([name, count]) => '<div class="print-system-bar"><div><span>' + escapeHtml(name) + '</span><b>' + coachingPrintNumber(count) + ' ' + escapeHtml(coachingPrintText('exerciseSet')) + '</b></div><i><em></em></i></div>').join('') + '</div>'
                    : '<div class="print-empty">' + escapeHtml(coachingPrintText('noMuscleDistribution')) + '</div>';
                const routineSections = routines.length ? routines.map((routine, routineIndex) => {
                    const localizedExercises = (routine.exercises || []).map((exercise) => ({
                        ...exercise,
                        notes: coachingLocalizedValue(exercise.notes, exercise.notesEn)
                    }));
                    const rows = localizedExercises.map((exercise) => {
                        const detail = detailFor(exercise);
                        const muscle = detail.targetMuscleNameEn && printLocale() === 'en' ? detail.targetMuscleNameEn : detail.targetMuscleNameAr || detail.targetMuscleName || (detail.targetMuscleId ? coachingPrintText('muscleById', { id: detail.targetMuscleId }) : coachingPrintText('undeterminedMuscle'));
                        const intensity = [exercise.rir == null ? '' : 'RIR ' + coachingPrintNumber(exercise.rir), exercise.rpe == null ? '' : 'RPE ' + coachingPrintNumber(exercise.rpe)].filter(Boolean).join(' · ');
                        return '<tr><td><span class="print-table-main"><bdi>' + escapeHtml(coachingItemName(detail)) + '</bdi></span>' + (exercise.notes ? '<span class="print-table-sub"><bdi>' + escapeHtml(exercise.notes) + '</bdi></span>' : '') + '</td><td><bdi>' + escapeHtml(muscle) + '</bdi></td><td dir="ltr">' + coachingPrintNumber(exercise.sets) + '</td><td dir="ltr">' + escapeHtml(coachingPrintReps(exercise)) + '</td><td dir="ltr">' + (exercise.weightKg === null || exercise.weightKg === undefined || exercise.weightKg === '' ? '—' : coachingPrintNumber(exercise.weightKg, 1) + ' ' + escapeHtml(coachingPrintText('unit.kg'))) + '</td><td dir="ltr">' + (exercise.restSeconds == null ? '—' : coachingPrintNumber(exercise.restSeconds) + ' ' + escapeHtml(coachingPrintText('unit.seconds'))) + '</td><td dir="ltr">' + escapeHtml(exercise.tempo || intensity || '—') + '</td><td dir="ltr"><bdi>' + escapeHtml(exercise.supersetGroupId || '—') + '</bdi></td></tr>';
                    }).join('');
                    return '<section class="print-section print-system-routine"><div class="print-section-title"><div><span class="print-section-kicker">' + escapeHtml(coachingPrintText('day', { count: coachingPrintNumber(routineIndex + 1) })) + '</span><h2><bdi>' + escapeHtml(coachingLocalizedValue(routine.name, routine.nameEn, coachingPrintText('day', { count: coachingPrintNumber(routineIndex + 1) }))) + '</bdi></h2></div><span class="print-system-count">' + coachingPrintNumber((routine.exercises || []).length) + ' ' + escapeHtml(coachingPrintText('exercises')) + ' · ' + coachingPrintNumber((routine.exercises || []).reduce((sum, item) => sum + Number(item.sets || 0), 0)) + ' ' + escapeHtml(coachingPrintText('sets')) + '</span></div>' + (routine.notes ? '<p class="print-notes print-system-note"><bdi>' + escapeHtml(coachingLocalizedValue(routine.notes, routine.notesEn)) + '</bdi></p>' : '') + '<div class="print-table-wrap"><table class="print-table print-system-table"><thead><tr><th>' + escapeHtml(coachingPrintText('exerciseName')) + '</th><th>' + escapeHtml(coachingPrintText('muscle')) + '</th><th>' + escapeHtml(coachingPrintText('sets')) + '</th><th>' + escapeHtml(coachingPrintText('reps')) + '</th><th>' + escapeHtml(coachingPrintText('weight')) + '</th><th>' + escapeHtml(coachingPrintText('rest')) + '</th><th>' + escapeHtml(coachingPrintText('tempoEffort')) + '</th><th>' + escapeHtml(coachingPrintText('superset')) + '</th></tr></thead><tbody>' + (rows || '<tr><td colspan="8"><div class="print-empty">' + escapeHtml(coachingPrintText('noExercises')) + '</div></td></tr>') + '</tbody></table></div></section>';
                }).join('') : '<section class="print-section"><div class="print-empty">' + escapeHtml(coachingPrintText('noTrainingDays')) + '</div></section>';
                const references = [];
                const referenceKeys = new Set();
                routines.forEach((routine) => (routine.exercises || []).forEach((exercise) => {
                    const detail = detailFor(exercise);
                    const key = String(exercise.exerciseId || detail.id || detail.name || '');
                    if (!key || referenceKeys.has(key)) return;
                    referenceKeys.add(key);
                    references.push(detail);
                }));
                const referenceMarkup = references.length ? '<section class="print-section print-system-reference-section"><div class="print-section-title"><div><span class="print-section-kicker">' + escapeHtml(coachingPrintText('performanceReference')) + '</span><h2>' + escapeHtml(coachingPrintText('exerciseInstructions')) + '</h2></div><span class="print-system-count">' + coachingPrintNumber(references.length) + ' ' + escapeHtml(coachingPrintText('exercises')) + '</span></div><div class="print-system-reference-grid">' + references.map((item) => {
                    const muscle = item.targetMuscleNameEn && printLocale() === 'en' ? item.targetMuscleNameEn : item.targetMuscleNameAr || item.targetMuscleName || coachingPrintText('undeterminedMuscle');
                    const instructions = printLocale() === 'en' ? item.instructionsEn || item.instructions : item.instructionsAr || item.instructions;
                    const tips = printLocale() === 'en' ? item.tipsEn || item.tips : item.tipsAr || item.tips;
                    const mistakes = printLocale() === 'en' ? item.commonMistakesEn || item.commonMistakes : item.commonMistakesAr || item.commonMistakes;
                    return '<article class="print-system-reference"><h3><bdi>' + escapeHtml(coachingItemName(item)) + '</bdi></h3><div class="print-system-reference-meta"><bdi>' + escapeHtml(muscle) + '</bdi> · <bdi>' + escapeHtml(item.equipment || coachingPrintText('equipmentUndetermined')) + '</bdi> · <bdi>' + escapeHtml(item.difficulty || coachingPrintText('levelUndetermined')) + '</bdi></div><div class="print-system-reference-columns"><div><b>' + escapeHtml(coachingPrintText('howToPerform')) + '</b>' + coachingListMarkup(instructions) + '</div><div><b>' + escapeHtml(coachingPrintText('tip')) + '</b>' + coachingListMarkup(tips) + '</div><div><b>' + escapeHtml(coachingPrintText('commonMistakes')) + '</b>' + coachingListMarkup(mistakes) + '</div></div></article>';
                }).join('') + '</div></section>' : '';
                return '<section class="print-section"><div class="print-section-title"><div><span class="print-section-kicker">' + escapeHtml(coachingPrintText('programSummary')) + '</span><h2>' + escapeHtml(coachingPrintText('trainingLoad')) + '</h2></div></div><div class="print-system-kpi-grid">' + coachingKpi(coachingPrintText('trainingDays'), coachingPrintNumber(routines.length)) + coachingKpi(coachingPrintText('exerciseTotal'), coachingPrintNumber(exerciseCount)) + coachingKpi(coachingPrintText('setTotal'), coachingPrintNumber(setCount)) + coachingKpi(coachingPrintText('approxVolume'), coachingPrintNumber(volume) + ' ' + coachingPrintText('unit.kg'), coachingPrintText('basedOnInputs')) + '</div><div class="print-system-overview-grid"><div><h3>' + escapeHtml(coachingPrintText('basicDetails')) + '</h3><div class="print-system-info-grid">' + coachingInfo(coachingPrintText('goal'), coachingWorkoutGoalLabel(system.goal)) + coachingInfo(coachingPrintText('level'), coachingWorkoutLevelLabel(system.level)) + coachingInfo(coachingPrintText('daysPerWeek'), coachingPrintNumber(system.daysPerWeek)) + coachingInfo(coachingPrintText('duration'), system.durationWeeks ? coachingPrintNumber(system.durationWeeks) + ' ' + coachingPrintText('weeks') : '—') + coachingInfo(coachingPrintText('start'), printDate(system.startDate)) + coachingInfo(coachingPrintText('end'), printDate(system.endDate)) + coachingInfo(coachingPrintText('status'), coachingStatusLabel(system.status)) + coachingInfo(coachingPrintText('version'), system.version) + '</div></div><div><h3>' + escapeHtml(coachingPrintText('muscleDistribution')) + '</h3>' + distribution + '</div></div>' + (system.description ? '<div class="print-system-callout"><b>' + escapeHtml(coachingPrintText('programDescription')) + '</b><p><bdi>' + escapeHtml(system.description) + '</bdi></p></div>' : '') + '</section>' + routineSections + referenceMarkup + (system.notes ? '<section class="print-section"><div class="print-section-title"><div><span class="print-section-kicker">' + escapeHtml(coachingPrintText('managementNotes')) + '</span><h2>' + escapeHtml(coachingPrintText('programNotes')) + '</h2></div></div><p class="print-notes"><bdi>' + escapeHtml(system.notes) + '</bdi></p></section>' : '');
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
                    const rows = (meal.items || []).map((item) => {
                        const foodName = printLocale() === 'en' ? item.nameEn || item.name || item.nameAr : item.nameAr || item.name || item.nameEn;
                        return '<tr><td><span class="print-table-main"><bdi>' + escapeHtml(foodName || coachingPrintText('fallback.food')) + '</bdi></span>' + (item.notes ? '<span class="print-table-sub"><bdi>' + escapeHtml(coachingLocalizedValue(item.notes, item.notesEn)) + '</bdi></span>' : '') + '</td><td dir="ltr">' + coachingPrintNumber(item.assignedQuantity, 1) + ' <bdi>' + escapeHtml(coachingServingUnit(item.servingUnit)) + '</bdi></td><td dir="ltr">' + coachingPrintNumber(item.calories, 1) + '</td><td dir="ltr">' + coachingPrintNumber(item.protein, 1) + ' ' + escapeHtml(coachingPrintText('grams')) + '</td><td dir="ltr">' + coachingPrintNumber(item.carbs, 1) + ' ' + escapeHtml(coachingPrintText('grams')) + '</td><td dir="ltr">' + coachingPrintNumber(item.fats, 1) + ' ' + escapeHtml(coachingPrintText('grams')) + '</td></tr>';
                    }).join('');
                    const mealLabel = coachingPrintText('meal', { count: coachingPrintNumber(mealIndex + 1) });
                    return '<section class="print-section print-system-routine"><div class="print-section-title"><div><span class="print-section-kicker">' + escapeHtml(mealLabel) + '</span><h2><bdi>' + escapeHtml(coachingLocalizedValue(meal.name, meal.nameEn, mealLabel)) + '</bdi></h2></div><span class="print-system-count"><bdi>' + escapeHtml(meal.mealTime || coachingPrintText('noMealTime')) + '</bdi> · ' + coachingPrintNumber(mealTotals.calories, 1) + ' ' + escapeHtml(coachingPrintText('calorieUnit')) + '</span></div>' + (meal.notes ? '<p class="print-notes print-system-note"><bdi>' + escapeHtml(coachingLocalizedValue(meal.notes, meal.notesEn)) + '</bdi></p>' : '') + '<div class="print-table-wrap"><table class="print-table print-system-table"><thead><tr><th>' + escapeHtml(coachingPrintText('food')) + '</th><th>' + escapeHtml(coachingPrintText('quantity')) + '</th><th>' + escapeHtml(coachingPrintText('calories')) + '</th><th>' + escapeHtml(coachingPrintText('protein')) + '</th><th>' + escapeHtml(coachingPrintText('carbs')) + '</th><th>' + escapeHtml(coachingPrintText('fats')) + '</th></tr></thead><tbody>' + (rows || '<tr><td colspan="6"><div class="print-empty">' + escapeHtml(coachingPrintText('noFood')) + '</div></td></tr>') + '</tbody></table></div></section>';
                }).join('') : '<section class="print-section"><div class="print-empty">' + escapeHtml(coachingPrintText('noMeals')) + '</div></section>';
                const calculator = system.calculator || {};
                return '<section class="print-section"><div class="print-section-title"><div><span class="print-section-kicker">' + escapeHtml(coachingPrintText('dietSummary')) + '</span><h2>' + escapeHtml(coachingPrintText('nutritionGoals')) + '</h2></div></div><div class="print-system-kpi-grid">' + coachingKpi(coachingPrintText('targetCalories'), coachingPrintNumber(system.targetCalories) + ' ' + coachingPrintText('calorieUnit')) + coachingKpi(coachingPrintText('calculatedCalories'), coachingPrintNumber(totals.calories, 1) + ' ' + coachingPrintText('calorieUnit')) + coachingKpi(coachingPrintText('mealCount'), coachingPrintNumber(meals.length)) + coachingKpi(coachingPrintText('foodCount'), coachingPrintNumber(meals.reduce((sum, meal) => sum + (meal.items || []).length, 0))) + '</div><div class="print-system-overview-grid"><div><h3>' + escapeHtml(coachingPrintText('dailyGoals')) + '</h3><div class="print-system-info-grid">' + coachingInfo(coachingPrintText('goal'), coachingGoalLabel(system.calorieGoal)) + coachingInfo(coachingPrintText('calorieAdjustment'), coachingPrintNumber(system.calorieAdjustment) + ' ' + coachingPrintText('calorieUnit')) + coachingInfo(coachingPrintText('proteinTarget'), coachingPrintNumber(system.targetProtein, 1) + ' ' + coachingPrintText('grams')) + coachingInfo(coachingPrintText('carbsTarget'), coachingPrintNumber(system.targetCarbs, 1) + ' ' + coachingPrintText('grams')) + coachingInfo(coachingPrintText('fatsTarget'), coachingPrintNumber(system.targetFats, 1) + ' ' + coachingPrintText('grams')) + coachingInfo(coachingPrintText('start'), printDate(system.startDate)) + coachingInfo(coachingPrintText('end'), printDate(system.endDate)) + coachingInfo(coachingPrintText('status'), coachingStatusLabel(system.status)) + '</div></div><div><h3>' + escapeHtml(coachingPrintText('dailyNeedsCalculator')) + '</h3><div class="print-system-info-grid">' + coachingInfo(coachingPrintText('weightKg'), calculator.weightKg ? coachingPrintNumber(calculator.weightKg, 1) + ' ' + coachingPrintText('unit.kg') : '—') + coachingInfo(coachingPrintText('heightCm'), calculator.heightCm ? coachingPrintNumber(calculator.heightCm, 1) + ' ' + coachingPrintText('unit.cm') : '—') + coachingInfo(coachingPrintText('age'), calculator.age ? coachingPrintNumber(calculator.age) + ' ' + coachingPrintText('unit.years') : '—') + coachingInfo(coachingPrintText('gender'), coachingGenderLabel(calculator.gender)) + coachingInfo(coachingPrintText('activity'), coachingActivityLabel(calculator.activity)) + coachingInfo(coachingPrintText('bmr'), calculator.bmr ? coachingPrintNumber(calculator.bmr) + ' ' + coachingPrintText('calorieUnit') : '—') + coachingInfo(coachingPrintText('tdee'), calculator.tdee ? coachingPrintNumber(calculator.tdee) + ' ' + coachingPrintText('calorieUnit') : '—') + coachingInfo(coachingPrintText('version'), system.version) + '</div></div></div>' + (system.description ? '<div class="print-system-callout"><b>' + escapeHtml(coachingPrintText('dietDescription')) + '</b><p><bdi>' + escapeHtml(system.description) + '</bdi></p></div>' : '') + '<div class="print-system-total"><span>' + escapeHtml(coachingPrintText('totalMacros')) + '</span><strong>' + escapeHtml(coachingPrintText('macroSummary', { protein: coachingPrintNumber(totals.protein, 1), carbs: coachingPrintNumber(totals.carbs, 1), fats: coachingPrintNumber(totals.fats, 1) })) + '</strong></div></section>' + mealSections + (system.notes ? '<section class="print-section"><div class="print-section-title"><div><span class="print-section-kicker">' + escapeHtml(coachingPrintText('adminNotes')) + '</span><h2>' + escapeHtml(coachingPrintText('planNotes')) + '</h2></div></div><p class="print-notes"><bdi>' + escapeHtml(system.notes) + '</bdi></p></section>' : '');
            }

            function buildCoachingSystemDocument(system, type, libraryItems = []) {
                const locale = printLocale();
                const title = coachingPrintText(type === 'diet' ? 'document.diet' : 'document.workout');
                const content = type === 'diet' ? dietPrintSections(system) : workoutPrintSections(system, libraryItems);
                const footer = printFooterMarkup(coachingPrintText('footer.generated'), true);
                return '<!doctype html><html lang="' + locale + '" dir="' + (locale === 'ar' ? 'rtl' : 'ltr') + '"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>' + escapeHtml(title) + ' - ' + escapeHtml(brandName()) + '</title></head><body><main class="print-sheet print-system-document">' + coachingHeader(title, system) + '<div class="print-accent"></div>' + coachingMemberHero(system, type) + content + footer + '</main></body></html>';
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

            function writePrintLoading(printWindow, label = '') {
                const locale = printLocale();
                const loading = locale === 'en' ? 'Preparing print document…' : 'جاري تجهيز مستند الطباعة…';
                writeWindow(printWindow, '<!doctype html><html lang="' + locale + '" dir="' + (locale === 'ar' ? 'rtl' : 'ltr') + '"><head><meta charset="utf-8"></head><body><div class="print-loading">' + escapeHtml(label || loading) + '</div></body></html>');
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
                const sourceStylesheet = parsed.head?.querySelector('[data-top-gym-print-styles]');
                const sourceBrandStyle = parsed.head?.querySelector('[data-top-gym-print-brand]');
                const pdfStylesheet = sourceStylesheet?.cloneNode(true);
                const pdfBrandStyle = sourceBrandStyle?.cloneNode(true);
                let stylesheetLoaded = false;
                holder.dir = parsed.documentElement.dir || 'rtl';
                holder.lang = parsed.documentElement.lang || 'ar';
                holder.className = 'print-pdf-host';
                holder.style.cssText = `position:fixed;left:0;top:0;width:190mm;min-height:1px;overflow:visible;background:${printPaperColor()};z-index:-1;opacity:0;pointer-events:none;`;
                if (pdfBrandStyle) {
                    pdfBrandStyle.textContent = pdfBrandStyle.textContent.replace(/:root/g, '.print-pdf-host');
                    holder.append(pdfBrandStyle);
                }
                holder.append(sheet);
                document.body.append(holder);
                try {
                    // The standalone HTML contains a stylesheet link, but only
                    // its .print-sheet node is attached to this live document.
                    // Load the same canonical print stylesheet here so html2canvas
                    // captures the designed document rather than unstyled markup.
                    if (pdfStylesheet) {
                        await new Promise((resolve) => {
                            pdfStylesheet.onload = () => { stylesheetLoaded = true; resolve(); };
                            pdfStylesheet.onerror = resolve;
                            document.head.append(pdfStylesheet);
                        });
                    }
                    if (!stylesheetLoaded) throw new Error('تعذر تحميل تنسيقات مستند PDF.');
                    if (document.fonts?.ready) await document.fonts.ready;
                    await Promise.all([...holder.querySelectorAll('img')].map((image) => image.complete ? Promise.resolve() : new Promise((resolve) => { image.onload = resolve; image.onerror = resolve; })));
                    const pdfOptions = {
                        margin: [6, 8, 6, 8],
                        filename,
                        image: { type: 'jpeg', quality: .98 },
                        html2canvas: {
                            scale: 2,
                            useCORS: true,
                            scrollX: 0,
                            scrollY: 0,
                            windowHeight: Math.max(window.innerHeight, Math.ceil(sheet.getBoundingClientRect().height)),
                            backgroundColor: printPaperColor(),
                            logging: false,
                            letterRendering: true,
                            onclone: (clonedDocument) => {
                                const clonedHost = clonedDocument.querySelector('.print-pdf-host');
                                if (clonedHost) {
                                    clonedHost.style.left = '0';
                                    clonedHost.style.top = '0';
                                    clonedHost.style.opacity = '1';
                                    clonedHost.style.zIndex = 'auto';
                                }
                            }
                        },
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
                    pdfStylesheet?.remove();
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
                writePrintLoading(printWindow, printLocale() === 'en' ? 'Preparing plan for printing…' : 'جاري تجهيز النظام للطباعة…');
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
                    writePrintLoading(printWindow, printLocale() === 'en' ? 'Preparing plan draft for printing…' : 'جاري تجهيز مسودة النظام للطباعة…');
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
                const member = {
                    ...(overview.member || {}),
                    notes: coachingLocalizedValue(overview.member?.notes, overview.member?.notesEn)
                };
                const progress = overview.progress || {};
                const workouts = overview.workoutPrograms || [];
                const diets = overview.dietPlans || [];
                const { locale, direction } = coachingPrintDocumentAttributes();
                const label = (key, params) => escapeHtml(coachingPrintText(`overview.${key}`, params));
                const value = (item, key, fallback = '—', englishKey = `${key}En`) => escapeHtml(coachingValue(coachingLocalizedValue(item?.[key], item?.[englishKey], fallback), fallback));
                const workoutRows = workouts.map((item) => '<tr><td><span class="print-table-main"><bdi>' + value(item, 'name') + '</bdi></span><span class="print-table-sub"><bdi>' + escapeHtml(coachingWorkoutGoalLabel(item.goal)) + ' · ' + escapeHtml(coachingWorkoutLevelLabel(item.level)) + '</bdi></span></td><td dir="ltr">' + escapeHtml(printDate(item.startDate)) + '<span class="print-table-sub">' + escapeHtml(printText('value.until', { date: printDate(item.endDate) })) + '</span></td><td>' + escapeHtml(coachingStatusLabel(item.status)) + '</td><td dir="ltr">' + escapeHtml(coachingPrintText('overview.exerciseCount', { count: coachingPrintNumber(item.exerciseCount ?? item.exercises ?? 0) })) + '</td></tr>').join('');
                const dietRows = diets.map((item) => '<tr><td><span class="print-table-main"><bdi>' + value(item, 'name') + '</bdi></span><span class="print-table-sub">' + escapeHtml(coachingPrintText('overview.calorieValue', { count: coachingPrintNumber(item.targetCalories) })) + '</span></td><td dir="ltr">' + escapeHtml(printDate(item.startDate)) + '<span class="print-table-sub">' + escapeHtml(printText('value.until', { date: printDate(item.endDate) })) + '</span></td><td>' + escapeHtml(coachingStatusLabel(item.status)) + '</td><td dir="ltr">' + escapeHtml(coachingPrintText('overview.mealCount', { count: coachingPrintNumber(item.mealsPerDay ?? item.mealCount ?? 0) })) + '</td></tr>').join('');
                const measurements = overview.measurements || [];
                const sessions = overview.workoutSessions || [];
                const mealLogs = overview.mealLogs || [];
                const measurementRows = measurements.map((item) => '<tr><td dir="ltr">' + escapeHtml(item.measuredAt ? printDate(item.measuredAt) : '—') + '</td><td dir="ltr">' + (item.weightKg == null ? '—' : coachingPrintNumber(item.weightKg, 1) + ' ' + label('weightUnit')) + '</td><td dir="ltr">' + (item.heightCm == null ? '—' : coachingPrintNumber(item.heightCm, 1) + ' ' + label('heightUnit')) + '</td><td dir="ltr">' + (item.bodyFatPercent == null ? '—' : coachingPrintNumber(item.bodyFatPercent, 1) + '%') + '</td></tr>').join('');
                const sessionRows = sessions.map((item) => '<tr><td><bdi>' + value(item, 'programName', coachingPrintText('overview.session')) + '</bdi></td><td><bdi>' + value(item, 'routineName') + '</bdi></td><td>' + escapeHtml(item.status === 'completed' ? coachingPrintText('overview.statusCompleted') : coachingValue(item.status)) + '</td><td dir="ltr">' + escapeHtml(printDateTime(item.startedAt || item.createdAt)) + '</td></tr>').join('');
                const mealRows = mealLogs.map((item) => '<tr><td><bdi>' + value(item, 'foodName', coachingPrintText('overview.food')) + '</bdi></td><td><bdi>' + value(item, 'mealName') + '</bdi></td><td dir="ltr">' + coachingPrintNumber(item.calories, 1) + '</td><td dir="ltr">' + escapeHtml(printDateTime(item.consumedAt)) + '</td></tr>').join('');
                const section = (kicker, title, head, rows, empty) => '<section class="print-section"><div class="print-section-title"><div><span class="print-section-kicker">' + label(kicker) + '</span><h2>' + label(title) + '</h2></div></div>' + coachingOverviewTable(head, rows, coachingPrintText(`overview.${empty}`)) + '</section>';
                const system = { id: member.id, memberName: member.fullName, memberPhone: member.phone, memberPhoneCountry: member.phoneCountry, name: coachingPrintText('overview.name') };
                const hero = '<section class="print-section print-system-hero"><div class="print-system-hero-copy"><span class="print-section-kicker">' + escapeHtml(coachingPrintText('clientFile')) + '</span><h2><bdi>' + value(member, 'fullName', coachingPrintText('client')) + '</bdi></h2><p><bdi>' + escapeHtml(displayPhone(member.phone, member.phoneCountry) || '—') + '</bdi>' + (member.email ? ' · <bdi>' + escapeHtml(member.email) + '</bdi>' : '') + '</p></div><div class="print-system-hero-title"><span>' + escapeHtml(coachingPrintText('overview.followUp')) + '</span><strong>' + escapeHtml(member.registrationDate ? printDate(member.registrationDate) : coachingPrintText('overview.activeFile')) + '</strong></div></section>';
                const footer = printFooterMarkup(coachingPrintText('brand.subtitle'), true);
                const kpis = '<section class="print-section"><div class="print-system-kpi-grid">' + coachingKpi(coachingPrintText('overview.workouts'), coachingPrintNumber(workouts.length)) + coachingKpi(coachingPrintText('overview.diets'), coachingPrintNumber(diets.length)) + coachingKpi(coachingPrintText('overview.measurements'), coachingPrintNumber(measurements.length)) + coachingKpi(coachingPrintText('overview.sessionsTitle'), coachingPrintNumber(progress.completedSessions ?? progress.sessionCount ?? 0)) + coachingKpi(coachingPrintText('overview.mealLogsTitle'), coachingPrintNumber(progress.mealLogCount ?? mealLogs.length)) + coachingKpi(coachingPrintText('overview.currentWeight'), progress.currentWeight == null ? '—' : coachingPrintNumber(progress.currentWeight, 1) + ' ' + coachingPrintText('unit.kg')) + '</div></section>';
                const workoutSection = section('savedSystems', 'workouts', '<th>' + label('workoutGoal') + '</th><th>' + label('period') + '</th><th>' + coachingPrintText('status') + '</th><th>' + label('content') + '</th>', workoutRows, 'workoutEmpty');
                const dietSection = section('savedSystems', 'diets', '<th>' + label('dietCalories') + '</th><th>' + label('period') + '</th><th>' + coachingPrintText('status') + '</th><th>' + label('content') + '</th>', dietRows, 'dietEmpty');
                const measurementSection = section('measurements', 'measurementsTitle', '<th>' + label('date') + '</th><th>' + label('weight') + '</th><th>' + label('height') + '</th><th>' + label('bodyFat') + '</th>', measurementRows, 'measurementsEmpty');
                const sessionSection = section('sessions', 'sessionsTitle', '<th>' + coachingPrintText('programSummary') + '</th><th>' + label('day') + '</th><th>' + coachingPrintText('status') + '</th><th>' + label('loggedAt') + '</th>', sessionRows, 'sessionsEmpty');
                const mealSection = section('sessions', 'mealLogsTitle', '<th>' + label('food') + '</th><th>' + label('meal') + '</th><th>' + label('calories') + '</th><th>' + label('loggedAt') + '</th>', mealRows, 'mealLogsEmpty');
                const notes = member.notes ? '<section class="print-section"><div class="print-section-title"><div><span class="print-section-kicker">' + label('clientNotes') + '</span><h2>' + label('notesTitle') + '</h2></div></div><p class="print-notes"><bdi>' + escapeHtml(member.notes) + '</bdi></p></section>' : '';
                return '<!doctype html><html lang="' + locale + '" dir="' + direction + '"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>' + escapeHtml(coachingPrintText('overview.document')) + ' - ' + escapeHtml(brandName()) + '</title></head><body><main class="print-sheet print-system-document">' + coachingHeader(coachingPrintText('overview.document'), system) + '<div class="print-accent"></div>' + hero + kpis + workoutSection + dietSection + measurementSection + sessionSection + mealSection + notes + footer + '</main></body></html>';
            }

            async function printCoachingOverview(memberId, existingWindow = null) {
                const printWindow = existingWindow || window.open('', '_blank', 'width=980,height=820');
                if (!printWindow) {
                    notifyPrint('يرجى السماح بالنوافذ المنبثقة لإتمام الطباعة.', 'error');
                    return;
                }
                writePrintLoading(printWindow, coachingPrintText('loading.overview'));
                try {
                    const overview = await fetchPrintJson('/api/clients/' + encodeURIComponent(memberId) + '/training-overview');
                    writeWindow(printWindow, buildCoachingOverviewDocument(overview));
                    printWindow.onafterprint = () => printWindow.close();
                    window.setTimeout(async () => { await waitForPrintWindowFonts(printWindow); printWindow.focus(); printWindow.print(); }, 450);
                } catch (error) {
                    const { locale, direction } = coachingPrintDocumentAttributes();
                    writeWindow(printWindow, '<!doctype html><html lang="' + locale + '" dir="' + direction + '"><head><meta charset="utf-8"></head><body><div class="print-error">' + escapeHtml(coachingPrintText('error.overview')) + '</div></body></html>');
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
