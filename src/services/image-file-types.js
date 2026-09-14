'use strict';

// Keep upload acceptance broad at the browser boundary while keeping the
// server authoritative: a declared MIME type is never enough; the bytes must
// carry a recognized image signature. These are image formats commonly
// produced by browsers, phones, screenshots, scanners, and design tools.
const IMAGE_MIME_TYPES = Object.freeze(new Set([
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/gif',
    'image/bmp',
    'image/tiff',
    'image/x-icon',
    'image/vnd.microsoft.icon',
    'image/jp2',
    'image/jpx',
    'image/avif',
    'image/heic',
    'image/heif',
    'image/jxl',
    'image/svg+xml'
]));

function hasSignature(buffer, signature) {
    return Buffer.isBuffer(buffer)
        && buffer.length >= signature.length
        && buffer.subarray(0, signature.length).equals(Buffer.from(signature));
}

function isoBaseMediaBrand(buffer) {
    if (!Buffer.isBuffer(buffer) || buffer.length < 12 || buffer.toString('ascii', 4, 8) !== 'ftyp') return '';
    const brands = [];
    for (let offset = 8; offset + 4 <= Math.min(buffer.length, 64); offset += 4) {
        brands.push(buffer.toString('ascii', offset, offset + 4));
    }
    return brands.join('|');
}

function detectImageMime(buffer) {
    if (!Buffer.isBuffer(buffer) || !buffer.length) return null;
    if (hasSignature(buffer, [137, 80, 78, 71, 13, 10, 26, 10])) return 'image/png';
    if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'image/jpeg';
    if (buffer.length >= 12 && buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP') return 'image/webp';
    if (buffer.length >= 6 && ['GIF87a', 'GIF89a'].includes(buffer.toString('ascii', 0, 6))) return 'image/gif';
    if (buffer.length >= 2 && buffer.toString('ascii', 0, 2) === 'BM') return 'image/bmp';
    if (buffer.length >= 4 && (
        buffer.subarray(0, 4).equals(Buffer.from([0x49, 0x49, 0x2a, 0x00]))
        || buffer.subarray(0, 4).equals(Buffer.from([0x4d, 0x4d, 0x00, 0x2a]))
        || buffer.subarray(0, 4).equals(Buffer.from([0x49, 0x49, 0x2b, 0x00]))
        || buffer.subarray(0, 4).equals(Buffer.from([0x4d, 0x4d, 0x00, 0x2b]))
    )) return 'image/tiff';
    if (buffer.length >= 6 && buffer.readUInt16LE(0) === 0 && buffer.readUInt16LE(2) === 1 && buffer.readUInt16LE(4) >= 1) {
        return 'image/x-icon';
    }
    if (hasSignature(buffer, [0x00, 0x00, 0x00, 0x0c, 0x6a, 0x50, 0x20, 0x20, 0x0d, 0x0a, 0x87, 0x0a])) return 'image/jp2';
    if (hasSignature(buffer, [0x00, 0x00, 0x00, 0x0c, 0x4a, 0x58, 0x4c, 0x20, 0x0d, 0x0a, 0x87, 0x0a])
        || (buffer.length >= 2 && buffer[0] === 0xff && buffer[1] === 0x0a)) return 'image/jxl';

    const brands = isoBaseMediaBrand(buffer);
    if (/(?:^|\|)(?:avif|avis)(?:\||$)/.test(brands)) return 'image/avif';
    if (/(?:^|\|)(?:heic|heix|hevc|hevx)(?:\||$)/.test(brands)) return 'image/heic';
    if (/(?:^|\|)(?:mif1|msf1)(?:\||$)/.test(brands)) return 'image/heif';

    const source = buffer.subarray(0, Math.min(buffer.length, 4096)).toString('utf8').replace(/^\uFEFF/, '').trimStart();
    if (/^(?:<\?xml[^>]*>\s*)?<svg\b/i.test(source)) return 'image/svg+xml';
    return null;
}

function detectProofMime(buffer) {
    if (Buffer.isBuffer(buffer) && buffer.length >= 5 && buffer.subarray(0, 5).toString('ascii') === '%PDF-') return 'application/pdf';
    return detectImageMime(buffer);
}

module.exports = { IMAGE_MIME_TYPES, detectImageMime, detectProofMime };
