        (() => {
            if (window.__topGymWhatsappEnhancementsLoaded) return;
            window.__topGymWhatsappEnhancementsLoaded = true;

            const arabicDigits = '٠١٢٣٤٥٦٧٨٩';
            const memberForm = document.getElementById('memberForm');
            const whatsappOption = document.getElementById('sendWhatsAppAfterSave');
            const ICONS = {
                wave: '\u{1F44B}',
                check: '\u2705',
                clipboard: '\u{1F4CB}',
                workout: '\u{1F3CB}\uFE0F',
                timer: '\u23F1\uFE0F',
                calendar: '\u{1F4C5}',
                calendarEnd: '\u{1F5D3}\uFE0F',
                card: '\u{1F4B3}',
                money: '\u{1F4B0}',
                gift: '\u{1F381}',
                receipt: '\u{1F9FE}',
                cash: '\u{1F4B5}',
                pin: '\u{1F4CC}',
                sparkles: '\u2728',
                target: '\u{1F3AF}',
                thanks: '\u{1F64F}'
            };

            if (!memberForm || !whatsappOption) return;

            function latinDigits(value) {
                return String(value ?? '').replace(/[٠-٩]/g, (digit) => String(arabicDigits.indexOf(digit)));
            }

            function normalizeEgyptianPhone(value) {
                let phone = latinDigits(value).trim();
                if (phone.startsWith('+')) phone = phone.slice(1);
                phone = phone.replace(/\D/g, '');
                if (phone.startsWith('00')) phone = phone.slice(2);
                if (phone.startsWith('0')) phone = `20${phone.slice(1)}`;
                else if (/^(10|11|12|15)\d{8}$/.test(phone)) phone = `20${phone}`;
                return /^20(10|11|12|15)\d{8}$/.test(phone) ? phone : '';
            }

            function formatDate(value) {
                if (!value) return '—';
                const raw = String(value);
                const date = /^\d{4}-\d{2}-\d{2}$/.test(raw) ? new Date(`${raw}T00:00:00`) : new Date(raw);
                if (Number.isNaN(date.getTime())) return raw;
                return new Intl.DateTimeFormat('ar-EG-u-ca-gregory', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(date);
            }

            function money(value) {
                return `${Number(value || 0).toLocaleString('ar-EG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ج.م`;
            }

            function inlineText(value, fallback = '—') {
                const text = String(value ?? '').replace(/[\r\n\s]+/g, ' ').trim();
                return text || fallback;
            }

            function isMobileDevice() {
                return /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent || '');
            }

            function buildMessage(detail) {
                const member = detail.member || {};
                const payload = detail.payload || {};
                const membership = member.membership || {};
                const labels = detail.labels || {};
                const name = inlineText(member.fullName || payload.fullName, 'عضو TOP GYM');
                const greetingName = inlineText(name.split(/\s+/)[0], name);
                const plan = inlineText(labels.plan || membership.plan || payload.membershipPlan);
                const type = inlineText(labels.type || membership.type || payload.membershipType);
                const amountDue = membership.amountDue ?? payload.amountDue ?? 0;
                const amountPaid = membership.amountPaid ?? payload.amountPaid ?? 0;
                const amountRemaining = membership.amountRemaining ?? Math.max(0, Number(amountDue) - Number(amountPaid));
                const discountAmount = membership.discountAmount ?? payload.discountAmount ?? 0;
                const listPrice = membership.listPrice ?? payload.listPrice ?? (Number(amountDue) + Number(discountAmount));
                const paymentMethod = inlineText(labels.payment || membership.paymentMethod || payload.paymentMethod);
                const remainingAmount = Math.max(0, Number(amountRemaining) || 0);
                const lines = [
                    `السلام عليكم يا *${greetingName}*`,
                    '',
                    `${ICONS.check} *تم تسجيل اشتراكك في TOP GYM بنجاح* ${ICONS.check}`,
                    '',
                    '╭───────────────╮',
                    '│  *تفاصيل الاشتراك*',
                    '├───────────────┤',
                    `│  الباقة: *${plan}*`,
                    `│ ${ICONS.timer} النوع: *${type}*`,
                    `│  البداية: *${formatDate(membership.startDate || payload.startDate)}*`,
                    `│  الانتهاء: *${formatDate(membership.effectiveEndDate || membership.endDate || payload.endDate)}*`,
                    '╰───────────────╯',
                    '',
                    '╭───────────────╮',
                    '│  *ملخص الحساب*',
                    '├───────────────┤',
                    `│  السعر الأساسي: *${money(listPrice)}*`,
                    `│  الخصم: *${money(discountAmount)}*`,
                    `│  المستحق: *${money(amountDue)}*`,
                    `│  المدفوع: *${money(amountPaid)}*`
                ];
                if (remainingAmount > 0) lines.push(`│  المتبقي: *${money(remainingAmount)}*`);
                lines.push(`│  طريقة الدفع: *${paymentMethod}*`, '╰───────────────╯');
                lines.push('', `${ICONS.sparkles} نتمنى لك تجربة تدريب مميزة وتحقيق كافة أهدافك!`, 'شكرًا لاختيارك *TOP GYM*');
                return lines.join('\n');
            }

            function openWhatsappChat(phone, message = '', existingWindow = null) {
                if (!phone) return false;
                const query = message ? `?text=${encodeURIComponent(message)}` : '';
                const url = `https://wa.me/${phone}${query}`;
                if (isMobileDevice() && !existingWindow) {
                    const appLink = document.createElement('a');
                    appLink.href = `whatsapp://send?phone=${phone}&text=${encodeURIComponent(message)}`;
                    appLink.setAttribute('aria-hidden', 'true');
                    appLink.style.display = 'none';
                    document.body.append(appLink);
                    appLink.click();
                    appLink.remove();
                    return true;
                }
                const opened = existingWindow && !existingWindow.closed ? existingWindow : window.open(url, 'topGymWhatsapp', 'popup=yes,width=480,height=760,resizable=yes,scrollbars=yes');
                if (opened && existingWindow) opened.location.href = url;
                if (opened) opened.opener = null;
                return Boolean(opened);
            }

            function prepareWhatsappWindow(phone) {
                if (!normalizeEgyptianPhone(phone)) return null;
                if (isMobileDevice()) return null;
                const opened = window.open('about:blank', 'topGymWhatsapp', 'popup=yes,width=480,height=760,resizable=yes,scrollbars=yes');
                if (opened) opened.opener = null;
                return opened || null;
            }

            function closeWhatsappWindow(opened) {
                if (opened && !opened.closed) opened.close();
            }

            function showWhatsappStatus(phone, message, opened) {
                if (!window.Swal) return;
                if (opened) {
                    window.Swal.fire({
                        toast: true,
                        position: 'top-start',
                        icon: 'success',
                        title: `تم فتح واتساب والرسالة جاهزة ${ICONS.check}`,
                        showConfirmButton: false,
                        timer: 2800,
                        timerProgressBar: true,
                        customClass: { popup: 'top-gym-alert top-gym-toast' }
                    });
                    return;
                }
                window.Swal.fire({
                    icon: 'info',
                    title: `تم حفظ المشترك ${ICONS.check}`,
                    text: 'لم يفتح واتساب تلقائيًا. اضغط الزر لفتح المحادثة والرسالة جاهزة للإرسال.',
                    showCancelButton: true,
                    confirmButtonText: 'فتح واتساب',
                    cancelButtonText: 'لاحقًا',
                    buttonsStyling: false,
                    customClass: { popup: 'top-gym-alert', confirmButton: 'btn btn-primary', cancelButton: 'btn btn-light' }
                }).then((result) => {
                    if (result.isConfirmed) openWhatsappChat(phone, message);
                });
            }

            function sendWhatsappMessage(detail) {
                const phone = normalizeEgyptianPhone(detail.payload?.phone || detail.member?.phone);
                const message = buildMessage(detail);
                if (!phone) {
                    if (window.Swal) window.Swal.fire({ toast: true, position: 'top-start', icon: 'warning', title: 'تم الحفظ — رقم الهاتف غير صحيح', showConfirmButton: false, timer: 4500, timerProgressBar: true, customClass: { popup: 'top-gym-alert top-gym-toast' } });
                    return;
                }

                const openedWindow = detail.whatsappWindow && !detail.whatsappWindow.closed ? detail.whatsappWindow : null;
                const opened = openedWindow ? openWhatsappChat(phone, message, openedWindow) : openWhatsappChat(phone, message);
                showWhatsappStatus(phone, message, opened);
            }

            window.topGymWhatsapp = { prepareWindow: prepareWhatsappWindow, closeWindow: closeWhatsappWindow };

            window.addEventListener('topgym:member-created', (event) => {
                const detail = event.detail || {};
                if (!detail.sendWhatsApp) return;
                sendWhatsappMessage(detail);
            });
        })();
