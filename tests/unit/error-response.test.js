'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const {
    DEFAULT_INTERNAL_ERROR_MESSAGE,
    getClientErrorCode,
    getSafeErrorMessage,
    isPublicClientError,
    safeErrorCode
} = require('../../src/utils/error-response');
const { safeOperationalError } = require('../../src/services/backup-service');

test('exposed 4xx validation errors remain available to the client', () => {
    const error = Object.assign(new Error('بيانات الطلب غير صالحة.'), { expose: true });
    assert.equal(isPublicClientError(error, 400), true);
    assert.equal(getSafeErrorMessage(error, 400), 'بيانات الطلب غير صالحة.');
});

test('5xx errors never expose internal messages even when marked expose', () => {
    const error = Object.assign(new Error('SQL password=secret internal path'), { expose: true });
    assert.equal(isPublicClientError(error, 500), false);
    assert.equal(getSafeErrorMessage(error, 500), DEFAULT_INTERNAL_ERROR_MESSAGE);
    assert.doesNotMatch(getSafeErrorMessage(error, 500), /secret|SQL/i);
});

test('public error messages strip control characters and are bounded', () => {
    const error = Object.assign(new Error(`bad\u0000input${'x'.repeat(1500)}`), { expose: true });
    const message = getSafeErrorMessage(error, 422);
    assert.doesNotMatch(message, /[\u0000-\u001F\u007F]/);
    assert.equal(message.length, 1000);
});

test('backup audit details keep internal failures generic', () => {
    const internal = Object.assign(new Error('database password and filesystem path'), {
        statusCode: 500,
        expose: true
    });
    assert.equal(safeOperationalError(internal, 'Backup inspection failed.'), 'Backup inspection failed.');
});

test('safe error codes are bounded and never include raw error details', () => {
    assert.equal(safeErrorCode({ code: 'EREQUEST' }), 'EREQUEST');
    assert.equal(safeErrorCode({ code: 'SQL password=secret' }), 'operation_failed');
    assert.equal(safeErrorCode(new Error('SQL password=secret'), 'db_operation_failed'), 'db_operation_failed');
});

test('internal error codes are withheld from clients while public codes remain stable', () => {
    const internal = Object.assign(new Error('database failure'), { code: 'EREQUEST', expose: true });
    const publicError = Object.assign(new Error('بيانات غير صالحة.'), { code: 'INVALID_INPUT', expose: true });
    assert.equal(getClientErrorCode(internal, 500), null);
    assert.equal(getClientErrorCode(publicError, 400), 'INVALID_INPUT');
});

test('missing private backup storage exposes only a safe remediation message', () => {
    const error = Object.assign(new Error('S3 secret and internal bucket path'), {
        statusCode: 503,
        code: 'OBJECT_STORAGE_PROVIDER_NOT_CONFIGURED',
        expose: false
    });
    const message = getSafeErrorMessage(error, 503);
    assert.equal(getClientErrorCode(error, 503), 'BACKUP_STORAGE_NOT_CONFIGURED');
    assert.match(message, /التخزين الخاص/);
    assert.doesNotMatch(message, /S3|secret|bucket|path/i);
});

test('private upload storage failures expose a safe configuration message', () => {
    const error = Object.assign(new Error('S3 secret and internal endpoint'), {
        statusCode: 503,
        code: 'PRIVATE_OBJECT_STORAGE_NOT_CONFIGURED',
        expose: false
    });
    const message = getSafeErrorMessage(error, 503);
    assert.equal(getClientErrorCode(error, 503), 'PRIVATE_STORAGE_NOT_CONFIGURED');
    assert.match(message, /التخزين الخاص/);
    assert.doesNotMatch(message, /S3|secret|endpoint/i);
});

test('member payment-proof storage failures expose safe member-specific responses', () => {
    const unavailable = Object.assign(new Error('S3 secret and internal endpoint'), {
        statusCode: 503,
        code: 'MEMBER_PAYMENT_PROOF_STORAGE_UNAVAILABLE',
        expose: false
    });
    const notConfigured = Object.assign(new Error('private key and bucket path'), {
        statusCode: 503,
        code: 'MEMBER_PAYMENT_PROOF_STORAGE_NOT_CONFIGURED',
        expose: false
    });

    assert.equal(getClientErrorCode(unavailable, 503), 'MEMBER_PAYMENT_PROOF_STORAGE_UNAVAILABLE');
    assert.equal(getClientErrorCode(notConfigured, 503), 'MEMBER_PAYMENT_PROOF_STORAGE_NOT_CONFIGURED');
    assert.match(getSafeErrorMessage(unavailable, 503), /إثباتات الدفع/);
    assert.match(getSafeErrorMessage(notConfigured, 503), /إثباتات الدفع/);
    assert.doesNotMatch(getSafeErrorMessage(unavailable, 503), /S3|secret|endpoint/i);
    assert.doesNotMatch(getSafeErrorMessage(notConfigured, 503), /private key|bucket|path/i);
});

test('member subscription request availability failures expose safe retry guidance', () => {
    const error = Object.assign(new Error('database internals must stay private'), {
        statusCode: 503,
        code: 'MEMBER_SUBSCRIPTION_REQUEST_NOT_AVAILABLE',
        expose: false
    });
    assert.equal(getClientErrorCode(error, 503), 'MEMBER_SUBSCRIPTION_REQUEST_NOT_AVAILABLE');
    assert.match(getSafeErrorMessage(error, 503), /تأكيد حفظ طلب العضوية/);
    assert.match(getSafeErrorMessage(error, 503), /حدّث سجل الطلبات/);
    assert.doesNotMatch(getSafeErrorMessage(error, 503), /database|internals/i);
});
