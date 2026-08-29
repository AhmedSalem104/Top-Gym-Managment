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
