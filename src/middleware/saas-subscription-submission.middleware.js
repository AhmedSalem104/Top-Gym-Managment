'use strict';

const Busboy = require('busboy');

const MAX_PROOF_BYTES = 4 * 1024 * 1024;
const ALLOWED_FIELDS = new Set(['planId', 'termCode', 'notes']);

function submissionError(message, statusCode = 400, code = 'INVALID_SUBSCRIPTION_REQUEST') {
    const error = new Error(message);
    error.statusCode = statusCode;
    error.expose = true;
    error.code = code;
    return error;
}

function parseSaasSubscriptionSubmission(request, response, next) {
    if (!/^multipart\/form-data\s*(?:;|$)/i.test(String(request.headers['content-type'] || ''))) {
        return next(submissionError('The subscription request format is invalid.', 400, 'INVALID_SUBSCRIPTION_SUBMISSION'));
    }

    let parser;
    try {
        parser = Busboy({
            headers: request.headers,
            limits: { files: 1, fields: ALLOWED_FIELDS.size, parts: ALLOWED_FIELDS.size + 2, fieldSize: 2048, fileSize: MAX_PROOF_BYTES }
        });
    } catch (_) {
        return next(submissionError('The subscription request format is invalid.', 400, 'INVALID_SUBSCRIPTION_SUBMISSION'));
    }

    const fields = Object.create(null);
    const chunks = [];
    let proof = null;
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
        if (!ALLOWED_FIELDS.has(name) || Object.hasOwn(fields, name) || info.valueTruncated) {
            fail(submissionError('The subscription request contains an invalid field.', 400, 'INVALID_SUBSCRIPTION_SUBMISSION'));
            return;
        }
        fields[name] = String(value);
    });
    parser.on('file', (name, stream, info = {}) => {
        if (name !== 'proof' || proof) {
            stream.resume();
            fail(submissionError('Exactly one payment proof is required.', 422, 'PAYMENT_PROOF_REQUIRED'));
            return;
        }
        proof = { fileName: String(info.filename || ''), mimeType: String(info.mimeType || 'application/octet-stream') };
        stream.on('data', (chunk) => chunks.push(chunk));
        stream.on('limit', () => fail(submissionError('Payment proof must not exceed 4 MB.', 400, 'PAYMENT_PROOF_TOO_LARGE')));
        stream.on('error', () => fail(submissionError('The payment proof could not be read.', 400, 'INVALID_SUBSCRIPTION_SUBMISSION')));
    });
    parser.on('filesLimit', () => fail(submissionError('Exactly one payment proof is required.', 422, 'PAYMENT_PROOF_REQUIRED')));
    parser.on('fieldsLimit', () => fail(submissionError('The subscription request contains too many fields.', 400, 'INVALID_SUBSCRIPTION_SUBMISSION')));
    parser.on('partsLimit', () => fail(submissionError('The subscription request contains too many parts.', 400, 'INVALID_SUBSCRIPTION_SUBMISSION')));
    parser.on('error', () => fail(submissionError('The subscription request format is invalid.', 400, 'INVALID_SUBSCRIPTION_SUBMISSION')));
    parser.on('finish', () => {
        if (finished) return;
        if (!proof || !chunks.length) {
            fail(submissionError('Payment proof is required before submitting the request.', 422, 'PAYMENT_PROOF_REQUIRED'));
            return;
        }
        finished = true;
        request.saasSubscriptionSubmission = {
            fields,
            proof: { ...proof, buffer: Buffer.concat(chunks) }
        };
        next();
    });
    request.pipe(parser);
}

module.exports = { MAX_PROOF_BYTES, parseSaasSubscriptionSubmission, submissionError };
