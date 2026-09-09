'use strict';

const crypto = require('node:crypto');
const { secretRing } = require('./secret-ring');

function createMembershipCodeCrypto(ring = secretRing) {
    function currentSecret() {
        return ring.getCurrentSecret('membershipCode');
    }

    function encryptionKey(secret = currentSecret()) {
        return crypto.createHash('sha256').update(secret).digest();
    }

    function hashCode(compactCode, secret = currentSecret()) {
        return crypto.createHmac('sha256', secret).update(compactCode).digest('hex');
    }

    function hashCandidates(compactCode) {
        return ring.getVerificationSecrets('membershipCode').map((entry) => ({
            hash: hashCode(compactCode, entry.secret),
            keyId: entry.keyId,
            version: entry.version
        }));
    }

    function encryptCode(compactCode, secret = currentSecret()) {
        const iv = crypto.randomBytes(12);
        const cipher = crypto.createCipheriv('aes-256-gcm', encryptionKey(secret), iv);
        const encrypted = Buffer.concat([cipher.update(compactCode, 'utf8'), cipher.final()]);
        return [iv, cipher.getAuthTag(), encrypted].map((part) => part.toString('base64url')).join('.');
    }

    function decryptCode(ciphertext, secret = currentSecret()) {
        const [ivEncoded, tagEncoded, dataEncoded] = String(ciphertext || '').split('.');
        if (!ivEncoded || !tagEncoded || !dataEncoded) throw new Error('Invalid membership code ciphertext.');
        const decipher = crypto.createDecipheriv('aes-256-gcm', encryptionKey(secret), Buffer.from(ivEncoded, 'base64url'));
        decipher.setAuthTag(Buffer.from(tagEncoded, 'base64url'));
        return Buffer.concat([
            decipher.update(Buffer.from(dataEncoded, 'base64url')),
            decipher.final()
        ]).toString('utf8');
    }

    function decryptWithVerification(ciphertext) {
        let lastError;
        for (const entry of ring.getVerificationSecrets('membershipCode')) {
            try {
                const plaintext = decryptCode(ciphertext, entry.secret);
                ring.recordVerification('membershipCode', entry.keyId, 'decrypt');
                return { plaintext, keyId: entry.keyId, version: entry.version };
            } catch (error) {
                lastError = error;
            }
        }
        throw lastError || new Error('Membership code decryption failed.');
    }

    return Object.freeze({
        currentSecret,
        decryptCode,
        decryptWithVerification,
        encryptCode,
        hashCandidates,
        hashCode
    });
}

module.exports = {
    createMembershipCodeCrypto
};
