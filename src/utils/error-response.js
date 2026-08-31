'use strict';

const DEFAULT_INTERNAL_ERROR_MESSAGE = 'حدث خطأ في الخادم. حاول مرة أخرى.';

// A small, explicit allow-list for operational failures that have a safe,
// actionable explanation. Other 5xx errors remain intentionally generic so
// database/provider internals cannot leak through the API response.
const SAFE_OPERATIONAL_FAILURES = Object.freeze({
    TENANT_ISOLATION_NOT_READY: Object.freeze({
        code: 'TENANT_ISOLATION_NOT_READY',
        message: 'Tenant data isolation is temporarily unavailable. Please try again later.'
    }),
    PRIVATE_OBJECT_STORAGE_NOT_CONFIGURED: Object.freeze({
        code: 'PRIVATE_STORAGE_NOT_CONFIGURED',
        message: 'التخزين الخاص لملفات المنصة غير مهيأ حاليًا. أضف مزود تخزين خاصًا معتمدًا قبل رفع الملفات.'
    }),
    PRIVATE_OBJECT_STORAGE_UNAVAILABLE: Object.freeze({
        code: 'PRIVATE_STORAGE_UNAVAILABLE',
        message: 'تعذر الوصول إلى التخزين الخاص لملفات المنصة حاليًا. حاول مرة أخرى بعد التحقق من إعدادات التخزين.'
    }),
    MEMBER_PAYMENT_PROOF_STORAGE_NOT_CONFIGURED: Object.freeze({
        code: 'MEMBER_PAYMENT_PROOF_STORAGE_NOT_CONFIGURED',
        message: 'رفع إثبات الدفع غير متاح حاليًا لأن التخزين الخاص لإثباتات الدفع غير مهيأ.'
    }),
    MEMBER_PAYMENT_PROOF_STORAGE_UNAVAILABLE: Object.freeze({
        code: 'MEMBER_PAYMENT_PROOF_STORAGE_UNAVAILABLE',
        message: 'تعذر الوصول إلى تخزين إثباتات الدفع حاليًا. حاول مرة أخرى لاحقًا.'
    }),
    MEMBER_SUBSCRIPTION_REQUEST_NOT_AVAILABLE: Object.freeze({
        code: 'MEMBER_SUBSCRIPTION_REQUEST_NOT_AVAILABLE',
        message: 'تعذر تأكيد حفظ طلب العضوية حاليًا. حدّث سجل الطلبات أولًا قبل إعادة المحاولة حتى لا يتكرر الطلب.'
    }),
    PAYMENT_PROOF_UNAVAILABLE: Object.freeze({
        code: 'PAYMENT_PROOF_UNAVAILABLE',
        message: 'إثبات الدفع غير متاح حاليًا. أعد رفعه أو حاول مرة أخرى لاحقًا.'
    }),
    PAYMENT_PROOF_INTEGRITY_FAILED: Object.freeze({
        code: 'PAYMENT_PROOF_INTEGRITY_FAILED',
        message: 'تعذر التحقق من سلامة إثبات الدفع. أعد رفع الملف الأصلي.'
    }),
    OBJECT_STORAGE_PROVIDER_NOT_CONFIGURED: Object.freeze({
        code: 'BACKUP_STORAGE_NOT_CONFIGURED',
        message: 'التخزين الخاص للنسخ الاحتياطية غير مهيأ حاليًا. أضف مزود تخزين خاصًا معتمدًا قبل إنشاء نسخة محفوظة.'
    }),
    OBJECT_STORAGE_PROVIDER_UNAVAILABLE: Object.freeze({
        code: 'BACKUP_STORAGE_UNAVAILABLE',
        message: 'التخزين الخاص للنسخ الاحتياطية غير متاح حاليًا. حاول مرة أخرى بعد التحقق من إعدادات مزود التخزين.'
    }),
    OBJECT_STORAGE_PROVIDER_REQUEST_FAILED: Object.freeze({
        code: 'BACKUP_STORAGE_UNAVAILABLE',
        message: 'تعذر الوصول إلى التخزين الخاص للنسخ الاحتياطية حاليًا. حاول مرة أخرى بعد قليل.'
    })
});

function isPublicClientError(error, statusCode) {
    return Number.isInteger(statusCode)
        && statusCode >= 400
        && statusCode < 500
        && error?.expose === true;
}

function sanitizePublicErrorMessage(message) {
    return String(message || '')
        .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, ' ')
        .slice(0, 1000);
}

function safeErrorCode(error, fallback = 'operation_failed') {
    const code = typeof error?.code === 'string' ? error.code.trim() : '';
    return /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,63}$/.test(code) ? code : fallback;
}

function safeOperationalFailure(error, statusCode) {
    if (Number(statusCode) !== 503) return null;
    const code = typeof error?.code === 'string' ? error.code.trim() : '';
    return SAFE_OPERATIONAL_FAILURES[code] || null;
}

function getClientErrorCode(error, statusCode) {
    const operationalFailure = safeOperationalFailure(error, statusCode);
    if (operationalFailure) return operationalFailure.code;
    return isPublicClientError(error, statusCode) ? safeErrorCode(error, null) : null;
}

function getSafeErrorMessage(error, statusCode) {
    const operationalFailure = safeOperationalFailure(error, statusCode);
    if (operationalFailure) return operationalFailure.message;
    return isPublicClientError(error, statusCode)
        ? sanitizePublicErrorMessage(error.message)
        : DEFAULT_INTERNAL_ERROR_MESSAGE;
}

module.exports = {
    DEFAULT_INTERNAL_ERROR_MESSAGE,
    SAFE_OPERATIONAL_FAILURES,
    getClientErrorCode,
    getSafeErrorMessage,
    isPublicClientError,
    safeOperationalFailure,
    safeErrorCode,
    sanitizePublicErrorMessage
};
