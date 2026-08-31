'use strict';

const Busboy = require('busboy');

const MAX_PROOF_BYTES = 4 * 1024 * 1024;
const MAX_FIELD_BYTES = 2048;
const ALLOWED_FIELDS = new Set([
    'requestType',
    'membershipPlan',
    'membershipType',
    'startDate',
    'paymentMethodCode',
    'notes',
    'idempotencyKey'
]);

function submissionError(message, statusCode = 400, code = 'MEMBER_SUBSCRIPTION_REQUEST_INVALID') {
    const error = new Error(message);
    error.statusCode = statusCode;
    error.expose = true;
    error.code = code;
    return error;
}

function isMultipartRequest(request) {
    return /^multipart\/form-data\s*(?:;|$)/i.test(String(request.headers['content-type'] || ''));
}

function parseMemberSubscriptionSubmission(request, response, next) {
    if (!isMultipartRequest(request)) return next();

    let parser;
    try {
        parser = Busboy({
            headers: request.headers,
            limits: {
                files: 1,
                fields: ALLOWED_FIELDS.size,
                parts: ALLOWED_FIELDS.size + 1,
                fieldSize: MAX_FIELD_BYTES,
                fileSize: MAX_PROOF_BYTES
            }
        });
    } catch (_) {
        return next(submissionError('The payment proof submission format is invalid.', 400, 'INVALID_PAYMENT_PROOF_SUBMISSION'));
    }

    const fields = Object.create(null);
    const proofChunks = [];
    let proofInfo = null;
    let finished = false;

    const fail = (error) => {
        if (finished) return;
        finished = true;
        request.unpipe(parser);
        parser.destroy();
        request.resume();
        next(error);
    };

    parser.on('field', (name, value, info = {}) => {
        if (!ALLOWED_FIELDS.has(name)) {
            fail(submissionError('The payment request contains an unsupported field.', 400, 'INVALID_PAYMENT_PROOF_SUBMISSION'));
            return;
        }
        if (Object.prototype.hasOwnProperty.call(fields, name)) {
            fail(submissionError('The payment request contains a duplicate field.', 400, 'INVALID_PAYMENT_PROOF_SUBMISSION'));
            return;
        }
        if (info.valueTruncated || Buffer.byteLength(String(value), 'utf8') > MAX_FIELD_BYTES) {
            fail(submissionError('A payment request field is too large.', 400, 'INVALID_PAYMENT_PROOF_SUBMISSION'));
            return;
        }
        fields[name] = String(value);
    });

    parser.on('file', (name, file, info = {}) => {
        if (name !== 'proof' || proofInfo) {
            file.resume();
            fail(submissionError('Exactly one payment proof file is required.', 422, 'PAYMENT_PROOF_REQUIRED'));
            return;
        }
        proofInfo = {
            fileName: String(info.filename || ''),
            mimeType: String(info.mimeType || 'application/octet-stream')
        };
        file.on('data', (chunk) => proofChunks.push(chunk));
        file.on('limit', () => fail(submissionError('Payment proof is too large.', 400, 'PAYMENT_PROOF_TOO_LARGE')));
        file.on('error', () => fail(submissionError('The payment proof could not be read.', 400, 'INVALID_PAYMENT_PROOF_SUBMISSION')));
    });

    parser.on('filesLimit', () => fail(submissionError('Exactly one payment proof file is required.', 422, 'PAYMENT_PROOF_REQUIRED')));
    parser.on('fieldsLimit', () => fail(submissionError('The payment request contains too many fields.', 400, 'INVALID_PAYMENT_PROOF_SUBMISSION')));
    parser.on('partsLimit', () => fail(submissionError('The payment request contains too many parts.', 400, 'INVALID_PAYMENT_PROOF_SUBMISSION')));
    parser.on('error', () => fail(submissionError('The payment proof submission format is invalid.', 400, 'INVALID_PAYMENT_PROOF_SUBMISSION')));
    parser.on('finish', () => {
        if (finished) return;
        if (!proofInfo || !proofChunks.length) {
            fail(submissionError('Payment proof is required before submitting the request.', 422, 'PAYMENT_PROOF_REQUIRED'));
            return;
        }
        finished = true;
        request.memberSubscriptionSubmission = {
            fields,
            proof: {
                buffer: Buffer.concat(proofChunks),
                fileName: proofInfo.fileName,
                mimeType: proofInfo.mimeType
            }
        };
        next();
    });

    request.pipe(parser);
}

module.exports = {
    ALLOWED_FIELDS,
    MAX_FIELD_BYTES,
    MAX_PROOF_BYTES,
    isMultipartRequest,
    parseMemberSubscriptionSubmission,
    submissionError
};
