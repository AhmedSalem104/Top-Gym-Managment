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

            function messageFrame(title, lines) {
                return [
                    '╭────────────────────────────╮',
                    `│  ${title}`,
                    '├────────────────────────────┤',
                    ...lines.map((line) => line ? `│  ${line}` : '│'),
                    '╰────────────────────────────╯'
                ];
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
                const greetingName = name;
                const plan = inlineText(labels.plan || membership.plan || payload.membershipPlan);
                const type = inlineText(labels.type || membership.type || payload.membershipType);
                const amountDue = membership.amountDue ?? payload.amountDue ?? 0;
                const amountPaid = membership.amountPaid ?? payload.amountPaid ?? 0;
                const amountRemaining = membership.amountRemaining ?? Math.max(0, Number(amountDue) - Number(amountPaid));
                const discountAmount = membership.discountAmount ?? payload.discountAmount ?? 0;
                const listPrice = membership.listPrice ?? payload.listPrice ?? (Number(amountDue) + Number(discountAmount));
                const paymentMethod = inlineText(labels.payment || membership.paymentMethod || payload.paymentMethod);
                const remainingAmount = Math.max(0, Number(amountRemaining) || 0);
                const accountLines = [
                    '• السعر الأساسي: *' + money(listPrice) + '*',
                    '• الخصم: *' + money(discountAmount) + '*',
                    '• المستحق: *' + money(amountDue) + '*',
                    '• المدفوع: *' + money(amountPaid) + '*'
                ];
                if (remainingAmount > 0) accountLines.push('• المتبقي: *' + money(remainingAmount) + '*');
                accountLines.push('• طريقة الدفع: *' + paymentMethod + '*');
                return messageFrame('TOP GYM', [
                    `السلام عليكم يا *${greetingName}*`,
                    '',
                    'مبروك يا بطل 🎉',
                    'تم تسجيل اشتراكك في',
                    `*TOP GYM* بنجاح ${ICONS.check}`,
                    '',
                    '*تفاصيل اشتراكك*',
                    '• الباقة: *' + plan + '*',
                    '• النوع: *' + type + '*',
                    '• البداية: *' + formatDate(membership.startDate || payload.startDate) + '*',
                    '• الانتهاء: *' + formatDate(membership.effectiveEndDate || membership.endDate || payload.endDate) + '*',
                    '',
                    '*ملخص الحساب*',
                    ...accountLines,
                    '',
                    'مبسوطين إنك بقيت جزء من',
                    '*TOP GYM* ❤️',
                    'مستنيينك تبدأ بقوة،',
                    'وإحنا معاك خطوة بخطوة',
                    'لحد ما توصل لهدفك'
                ]).join('\n');
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

            function buildAlertMessage(member, kind) {
                const name = inlineText(member?.fullName, 'عضو TOP GYM');
                const greetingName = name;
                const membership = member?.membership || {};
                if (kind === 'membership') {
                    const status = String(membership.status || '').toLowerCase();
                    const endDate = formatDate(membership.effectiveEndDate || membership.endDate);
                    if (status === 'frozen') {
                        return messageFrame('🧊 TOP GYM', [
                            `السلام عليكم يا *${greetingName}*`,
                            '',
                            'اشتراكك متجمّد لحد:',
                            `*${formatDate(membership.freezeEnd)}*`,
                            '',
                            'ياريت تراجع الإدارة لو محتاج أي تفاصيل.',
                            '',
                            'مستنيينك ترجع تكمل تمرينك معانا ❤️'
                        ]).join('\n');
                    }
                    if (status === 'expired') {
                        return messageFrame('⚠️ TOP GYM', [
                            `السلام عليكم يا *${greetingName}*`,
                            '',
                            'حبيت أنبهك إن اشتراكك في',
                            '*TOP GYM* انتهى بتاريخ:',
                            '',
                            `*${endDate}*`,
                            '',
                            'ياريت تمر علينا في الإدارة',
                            'لتجديد الاشتراك والرجوع',
                            'للتمرين من جديد.',
                            '',
                            'مكانك معانا موجود',
                            'ومستنيين نشوفك راجع بقوة',
                            '',
                            'وجودك في *TOP GYM* بيفرق معانا ❤️'
                        ]).join('\n');
                    }
                    return messageFrame('⏳ TOP GYM', [
                        `السلام عليكم يا *${greetingName}*`,
                        '',
                        'حبيت أفكرك إن اشتراكك في',
                        '*TOP GYM* هينتهي يوم:',
                        '',
                        `*${endDate}*`,
                        '',
                        'ياريت تعدّي علينا في الإدارة',
                        'لتجديد الاشتراك واستمرار تمرينك',
                        'من غير انقطاع.',
                        '',
                        'مستنيينك تكمل معانا يا بطل',
                        'ولسه قدامنا أهداف نحققها سوا',
                        '',
                        '*TOP GYM* ❤️'
                    ]).join('\n');
                }
                if (kind === 'debt') {
                    return messageFrame('TOP GYM', [
                        `السلام عليكم يا *${greetingName}*`,
                        '',
                        'بنحب نفكرك إن فيه مبلغ متبقي',
                        'على اشتراكك بقيمة:',
                        '',
                        `*${money(membership.amountRemaining)}*`,
                        '',
                        'واشتراكك مستمر لحد:',
                        `*${formatDate(membership.effectiveEndDate || membership.endDate)}*`,
                        '',
                        'ياريت تعدّي علينا في الإدارة',
                        'لاستكمال السداد وتنظيم حسابك.',
                        '',
                        'مستنيينك في الجيم يا بطل',
                        'وجودك وتمرينك معانا مهم،',
                        'ولسه عندنا أهداف نكملها سوا',
                        '',
                        'شكرًا إنك جزء من *TOP GYM* ❤️'
                    ]).join('\n');
                }
                return messageFrame('TOP GYM', [
                    `السلام عليكم يا *${greetingName}*`,
                    '',
                    'بقالنا فترة مشوفناكش في الجيم',
                    '',
                    'اشتراكك لسه مستمر لحد:',
                    `*${formatDate(membership.effectiveEndDate || membership.endDate)}*`,
                    '',
                    'ومستنيين نشوفك راجع تتمرن',
                    'معانا قريب',
                    '',
                    'الجيم من غيرك ناقصه حماس',
                    'يلا نرجع نكمل على هدفك سوا ❤️',
                    '',
                    '*TOP GYM*'
                ]).join('\n');
            }

            async function sendAlertWhatsapp(memberId, kind, button = null) {
                if (button) button.disabled = true;
                const fallbackPhone = normalizeEgyptianPhone(button?.dataset.alertPhone);
                const fallbackMember = {
                    fullName: button?.dataset.alertName || '',
                    daysSinceLastVisit: button?.dataset.alertDays ? Number(button.dataset.alertDays) : null,
                    membership: {
                        status: button?.dataset.alertStatus || '',
                        amountRemaining: Number(button?.dataset.alertRemaining || 0),
                        effectiveEndDate: button?.dataset.alertEnd || '',
                        endDate: button?.dataset.alertEnd || '',
                        freezeEnd: button?.dataset.alertFreezeEnd || ''
                    }
                };
                let preparedWindow = null;
                if (fallbackPhone && !isMobileDevice()) preparedWindow = prepareWhatsappWindow(fallbackPhone);
                if (fallbackPhone && isMobileDevice()) {
                    const opened = openWhatsappChat(fallbackPhone, buildAlertMessage(fallbackMember, kind));
                    if (opened && window.Swal) window.Swal.fire({ toast: true, position: 'top-start', icon: 'success', title: 'واتساب جاهز للإرسال ✅', text: 'الإرسال يدوي بعد مراجعة الرسالة.', showConfirmButton: false, timer: 3200, customClass: { popup: 'top-gym-alert top-gym-toast' } });
                    if (button) button.disabled = false;
                    return;
                }
                try {
                    const response = await fetch(`/api/members/${encodeURIComponent(memberId)}`);
                    const data = await response.json().catch(() => ({}));
                    if (!response.ok) throw new Error(data.error || 'تعذر تحميل بيانات المشترك.');
                    const member = data.member || data;
                    const phone = normalizeEgyptianPhone(member.phone);
                    if (!phone) throw new Error('رقم هاتف المشترك غير صالح لفتح واتساب.');
                    const message = buildAlertMessage(member, kind);
                    const opened = openWhatsappChat(phone, message, preparedWindow);
                    if (opened) {
                        if (window.Swal) window.Swal.fire({ toast: true, position: 'top-start', icon: 'success', title: 'واتساب جاهز للإرسال ✅', text: 'الإرسال يدوي بعد مراجعة الرسالة.', showConfirmButton: false, timer: 3200, customClass: { popup: 'top-gym-alert top-gym-toast' } });
                    } else {
                        showWhatsappStatus(phone, message, null);
                    }
                } catch (error) {
                    closeWhatsappWindow(preparedWindow);
                    if (window.Swal) window.Swal.fire({ toast: true, position: 'top-start', icon: 'error', title: 'تعذر تجهيز رسالة واتساب', text: error.message, showConfirmButton: false, timer: 4500, customClass: { popup: 'top-gym-alert top-gym-toast' } });
                } finally {
                    if (button) button.disabled = false;
                }
            }

            window.topGymWhatsapp = {
                prepareWindow: prepareWhatsappWindow,
                closeWindow: closeWhatsappWindow,
                sendAlert: sendAlertWhatsapp
            };

            window.addEventListener('topgym:member-created', (event) => {
                const detail = event.detail || {};
                if (!detail.sendWhatsApp) return;
                sendWhatsappMessage(detail);
            });
            document.addEventListener('click', (event) => {
                const button = event.target.closest('[data-alert-whatsapp]');
                if (!button) return;
                event.preventDefault();
                event.stopPropagation();
                sendAlertWhatsapp(button.dataset.memberId, button.dataset.alertWhatsapp, button);
            });
        })();
