'use strict';

function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>\'"]/g, (character) => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
    }[character]));
}

function absoluteActionUrl(value, publicAppUrl = '') {
    const path = String(value || '/platform-admin').trim();
    const origin = String(publicAppUrl || '').trim().replace(/\/+$/, '');
    return path.startsWith('/') && !path.startsWith('//') && origin ? `${origin}${path}` : path;
}

function formatDuration(monthsValue) {
    const months = Number(monthsValue);
    if (!Number.isInteger(months) || months <= 0) return 'غير محددة';
    if (months === 12) return 'سنة واحدة';
    if (months % 12 === 0) return `${new Intl.NumberFormat('ar-EG').format(months / 12)} سنوات`;
    return `${new Intl.NumberFormat('ar-EG').format(months)} شهرًا`;
}

function buildSharedAdminEmail({ subject, preheader, eyebrow, title, intro, details, actionUrl, actionLabel }) {
    const safeUrl = escapeHtml(actionUrl);
    const rows = details.map(([label, value]) => `
      <tr>
        <td dir="rtl" align="right" style="padding:12px 14px;border-bottom:1px solid #edf0f5;color:#718096;font-size:12px;font-weight:700;line-height:1.6;vertical-align:top;">${escapeHtml(label)}</td>
        <td dir="rtl" align="right" style="padding:12px 14px;border-bottom:1px solid #edf0f5;color:#172033;font-size:14px;line-height:1.6;word-break:break-word;vertical-align:top;">${escapeHtml(value)}</td>
      </tr>`).join('');
    const text = [
        'Logic Fit', title, preheader, '', intro, '',
        ...details.map(([label, value]) => `${label}: ${value}`), '',
        `${actionLabel}: ${actionUrl}`, '',
        'هذا إشعار آلي من Logic Fit. يرجى مراجعة التفاصيل من لوحة المنصة الآمنة.'
    ].join('\n');
    const html = `<!doctype html>
<html lang="ar" dir="rtl">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><meta name="supported-color-schemes" content="light"><title>${escapeHtml(subject)}</title></head>
<body dir="rtl" style="margin:0;padding:0;background:#f3f6fb;color:#172033;font-family:Tahoma,Arial,Helvetica,sans-serif;direction:rtl;text-align:right;">
  <div style="display:none;max-height:0;max-width:0;overflow:hidden;opacity:0;color:transparent;mso-hide:all;">${escapeHtml(preheader)}</div>
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" dir="rtl" style="width:100%;background:#f3f6fb;">
    <tr><td align="center" style="padding:24px 12px;">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="640" dir="rtl" style="width:100%;max-width:640px;background:#ffffff;border:1px solid #e5eaf2;border-radius:16px;border-collapse:separate;overflow:hidden;">
        <tr><td dir="rtl" style="padding:20px 24px;background:#102a43;color:#ffffff;text-align:right;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" dir="rtl"><tr>
            <td dir="ltr" align="left" style="font-size:19px;font-weight:700;letter-spacing:.4px;white-space:nowrap;">LOGIC <span style="color:#57d3b2;">FIT</span></td>
            <td dir="rtl" align="right" style="font-size:12px;color:#b9c9dc;">إشعار إداري</td>
          </tr></table>
        </td></tr>
        <tr><td dir="rtl" style="padding:26px 24px 16px;text-align:right;">
          <span style="display:inline-block;padding:6px 10px;border-radius:999px;background:#e7f8f3;color:#087f69;font-size:12px;font-weight:700;">${escapeHtml(eyebrow)}</span>
          <h1 style="margin:14px 0 8px;color:#102a43;font-size:23px;line-height:1.5;font-weight:700;">${escapeHtml(title)}</h1>
          <p style="margin:0;color:#526173;font-size:14px;line-height:1.8;">${escapeHtml(intro)}</p>
        </td></tr>
        <tr><td dir="rtl" style="padding:0 24px 8px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" dir="rtl" style="border:1px solid #e5eaf2;border-radius:12px;background:#fbfcfe;border-collapse:separate;">${rows}
          </table>
        </td></tr>
        <tr><td dir="rtl" style="padding:18px 24px 24px;text-align:right;">
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" dir="rtl"><tr><td align="center" bgcolor="#0f9d83" style="border-radius:9px;background:#0f9d83;">
            <a href="${safeUrl}" target="_blank" style="display:inline-block;padding:13px 20px;border:1px solid #0f9d83;border-radius:9px;color:#ffffff;font-size:14px;font-weight:700;line-height:1.4;text-decoration:none;">${escapeHtml(actionLabel)}</a>
          </td></tr></table>
          <p style="margin:18px 0 0;color:#8a96a8;font-size:12px;line-height:1.7;">هذا إشعار آلي من Logic Fit. افتح الطلب وراجع التفاصيل من داخل لوحة المنصة بعد تسجيل الدخول.</p>
        </td></tr>
        <tr><td dir="rtl" style="padding:15px 24px;background:#f8fafc;border-top:1px solid #edf0f5;color:#8a96a8;font-size:11px;line-height:1.6;text-align:right;">Logic Fit · إشعارات المنصة</td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
    return { subject, text, html };
}

function buildRegistrationEmail(event, publicAppUrl = '') {
    const payload = event.payload || {};
    const typeLabel = payload.registrationType === 'independent_trainer' ? 'مدرب مستقل' : 'جيم';
    const gymName = payload.gymName || 'غير محدد';
    const amount = payload.amountDue == null ? 'غير محدد' : `${Number(payload.amountDue).toFixed(2)} ${payload.currency || 'EGP'}`;
    const subject = `طلب انضمام جديد — ${gymName}`;
    return buildSharedAdminEmail({
        subject,
        preheader: `طلب انضمام ${typeLabel} من ${gymName} بانتظار مراجعة إدارة المنصة.`,
        eyebrow: 'طلب انضمام جديد',
        title: 'طلب انضمام جديد يحتاج إلى المراجعة',
        intro: `استلمت المنصة طلب انضمام جديدًا من ${gymName}.`,
        details: [
            ['نوع النشاط', typeLabel], ['اسم الجيم / النشاط', gymName],
            ['اسم مقدم الطلب', payload.ownerName || 'غير محدد'], ['بريد التواصل', payload.contactEmail || 'غير محدد'],
            ['الباقة', payload.planName || 'غير محددة'], ['المبلغ', amount], ['تاريخ الطلب', payload.submittedAt || 'غير محدد']
        ],
        actionUrl: absoluteActionUrl(payload.actionUrl, publicAppUrl), actionLabel: 'مراجعة طلب الانضمام'
    });
}

function buildSaasSubscriptionRequestEmail(event, publicAppUrl = '') {
    const payload = event.payload || {};
    const gymName = payload.gymName || 'غير محدد';
    const planName = payload.planName || 'غير محددة';
    const duration = formatDuration(payload.durationMonths);
    const amount = payload.amountDue == null ? 'غير محدد' : `${Number(payload.amountDue).toFixed(2)} ${payload.currency || 'EGP'}`;
    const subject = `طلب اشتراك جديد — ${gymName}`;
    return buildSharedAdminEmail({
        subject,
        preheader: `طلب باقة ${planName} لمدة ${duration} بمبلغ ${amount} بانتظار المراجعة.`,
        eyebrow: 'طلب اشتراك جديد',
        title: 'طلب اشتراك جديد يحتاج إلى المراجعة',
        intro: `تم استلام طلب اشتراك من ${gymName} ويحتاج إلى المراجعة.`,
        details: [
            ['اسم الجيم', gymName], ['الباقة المطلوبة', planName], ['مدة الاشتراك', duration],
            ['المبلغ المطلوب', amount], ['الحالة', 'تحت المراجعة'], ['تاريخ الطلب', payload.submittedAt || 'غير محدد']
        ],
        actionUrl: absoluteActionUrl(payload.actionUrl || '/platform-admin.html#subscription-requests', publicAppUrl),
        actionLabel: 'مراجعة طلب الاشتراك'
    });
}

module.exports = { buildRegistrationEmail, buildSaasSubscriptionRequestEmail, buildSharedAdminEmail, formatDuration };
