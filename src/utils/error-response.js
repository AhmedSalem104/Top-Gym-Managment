'use strict';

const DEFAULT_INTERNAL_ERROR_MESSAGE = 'حدث خطأ في الخادم. حاول مرة أخرى.';

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

function getSafeErrorMessage(error, statusCode) {
    return isPublicClientError(error, statusCode)
        ? sanitizePublicErrorMessage(error.message)
        : DEFAULT_INTERNAL_ERROR_MESSAGE;
}

module.exports = {
    DEFAULT_INTERNAL_ERROR_MESSAGE,
    getSafeErrorMessage,
    isPublicClientError,
    sanitizePublicErrorMessage
};
