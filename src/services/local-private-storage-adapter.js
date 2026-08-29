'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');

const LOCAL_STORAGE_ENVIRONMENTS = new Set(['local', 'development', 'test']);
const VERCEL_ENVIRONMENT_SIGNALS = new Set(['1', 'true', 'yes', 'on', 'production', 'preview', 'development']);
const SAFE_KEY_PATTERN = /^(?:tenants\/\d+\/private\/|platform\/private\/)[A-Za-z0-9_./-]+$/;

function localStorageError(message, statusCode = 500, code = 'LOCAL_STORAGE_ERROR') {
    const error = new Error(message);
    error.statusCode = statusCode;
    error.expose = false;
    error.code = code;
    return error;
}

function isVercelRuntime(value = null) {
    const signals = value == null ? [process.env.VERCEL, process.env.VERCEL_ENV] : [value];
    return signals.some((signal) => VERCEL_ENVIRONMENT_SIGNALS.has(String(signal || '').trim().toLowerCase()));
}

function assertLocalEnvironment(nodeEnv, { isVercel = isVercelRuntime() } = {}) {
    const environment = String(nodeEnv || '').trim().toLowerCase();
    if (isVercel || !LOCAL_STORAGE_ENVIRONMENTS.has(environment)) {
        throw localStorageError(
            'The local private storage adapter is forbidden on Vercel and allowed only in local, development or test environments.',
            500,
            'LOCAL_STORAGE_FORBIDDEN'
        );
    }
    return environment;
}

function normalizeRootDir(rootDir) {
    const value = String(rootDir || '').trim();
    if (!value) throw localStorageError('A local private storage directory is required.', 500, 'LOCAL_STORAGE_PATH_REQUIRED');
    const resolved = path.resolve(value);
    if (resolved === path.parse(resolved).root) {
        throw localStorageError('The local private storage directory is too broad.', 500, 'LOCAL_STORAGE_PATH_UNSAFE');
    }
    return resolved;
}

function normalizeKey(key) {
    const normalized = String(key || '').trim().replaceAll('\\', '/');
    if (!normalized || normalized.includes('\0') || normalized.startsWith('/') || normalized.includes('//')
        || normalized.split('/').some((segment) => segment === '.' || segment === '..')
        || !SAFE_KEY_PATTERN.test(normalized)) {
        throw localStorageError('The private object key is invalid.', 400, 'INVALID_STORAGE_OBJECT_KEY');
    }
    return normalized;
}

function isWithinRoot(rootDir, targetPath) {
    const relative = path.relative(rootDir, targetPath);
    return relative && !relative.startsWith('..') && !path.isAbsolute(relative);
}

async function assertNoSymlink(rootDir, targetPath, { allowMissing = true } = {}) {
    const relative = path.relative(rootDir, targetPath);
    if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
        throw localStorageError('The private object path escapes its storage directory.', 403, 'LOCAL_STORAGE_PATH_ESCAPE');
    }
    let current = rootDir;
    for (const segment of relative.split(path.sep)) {
        current = path.join(current, segment);
        try {
            const stat = await fs.lstat(current);
            if (stat.isSymbolicLink()) throw localStorageError('Symbolic links are not allowed in private storage.', 403, 'LOCAL_STORAGE_SYMLINK_FORBIDDEN');
        } catch (error) {
            if (error.code === 'ENOENT' && allowMissing) return;
            throw error;
        }
    }
}

function metadataPath(artifactPath) {
    return `${artifactPath}.metadata.json`;
}

async function readMetadata(metaPath) {
    try {
        return JSON.parse(await fs.readFile(metaPath, 'utf8'));
    } catch (error) {
        if (error.code === 'ENOENT') return null;
        throw localStorageError('Private storage metadata is invalid.', 503, 'LOCAL_STORAGE_METADATA_INVALID');
    }
}

async function writeAtomic(filePath, body, mode = 0o600) {
    const tempPath = `${filePath}.tmp-${crypto.randomUUID()}`;
    try {
        await fs.writeFile(tempPath, body, { flag: 'wx', mode });
        await fs.rename(tempPath, filePath);
    } catch (error) {
        await fs.unlink(tempPath).catch(() => {});
        throw error;
    }
}

function createLocalPrivateStorageAdapter({ rootDir, nodeEnv = process.env.NODE_ENV, isVercel = isVercelRuntime() } = {}) {
    assertLocalEnvironment(nodeEnv, { isVercel });
    const root = normalizeRootDir(rootDir || path.join(process.cwd(), '.local-private-storage'));

    async function resolveObjectPath(key) {
        const normalizedKey = normalizeKey(key);
        const objectPath = path.resolve(root, ...normalizedKey.split('/'));
        if (!isWithinRoot(root, objectPath)) {
            throw localStorageError('The private object path escapes its storage directory.', 403, 'LOCAL_STORAGE_PATH_ESCAPE');
        }
        await assertNoSymlink(root, objectPath);
        return { key: normalizedKey, objectPath, metaPath: metadataPath(objectPath) };
    }

    async function putPrivateObject(object) {
        const resolved = await resolveObjectPath(object?.key);
        const body = Buffer.isBuffer(object?.body) ? object.body : Buffer.from(object?.body || '');
        if (!body.length) throw localStorageError('The private object is empty.', 400, 'INVALID_STORAGE_SIZE');
        await fs.mkdir(path.dirname(resolved.objectPath), { recursive: true, mode: 0o700 });
        await assertNoSymlink(root, path.dirname(resolved.objectPath));
        await writeAtomic(resolved.objectPath, body);
        await writeAtomic(resolved.metaPath, JSON.stringify({
            tenantId: object.tenantId == null ? null : Number(object.tenantId),
            scope: object.scope || (String(resolved.key).startsWith('platform/') ? 'platform' : 'tenant'),
            key: resolved.key,
            originalName: String(object.originalName || 'object').slice(0, 255),
            contentType: String(object.contentType || 'application/octet-stream').slice(0, 100),
            size: body.length,
            checksum: String(object.checksum || crypto.createHash('sha256').update(body).digest('hex')).toLowerCase(),
            createdAt: new Date().toISOString()
        }), 0o600);
        return true;
    }

    async function getPrivateObject({ key } = {}) {
        const resolved = await resolveObjectPath(key);
        try {
            const stat = await fs.lstat(resolved.objectPath);
            if (!stat.isFile()) return null;
            const [body, metadata] = await Promise.all([
                fs.readFile(resolved.objectPath),
                readMetadata(resolved.metaPath)
            ]);
            if (!metadata) throw localStorageError('Private storage metadata is missing.', 503, 'LOCAL_STORAGE_METADATA_MISSING');
            return { ...metadata, key: resolved.key, size: body.length, body };
        } catch (error) {
            if (error.code === 'ENOENT') return null;
            throw error;
        }
    }

    async function headPrivateObject({ key } = {}) {
        const resolved = await resolveObjectPath(key);
        try {
            const stat = await fs.lstat(resolved.objectPath);
            if (!stat.isFile()) return null;
            const metadata = await readMetadata(resolved.metaPath);
            if (!metadata) return { key: resolved.key, size: stat.size };
            return { ...metadata, key: resolved.key, size: stat.size };
        } catch (error) {
            if (error.code === 'ENOENT') return null;
            throw error;
        }
    }

    async function deletePrivateObject({ key } = {}) {
        const resolved = await resolveObjectPath(key);
        let deleted = false;
        for (const filePath of [resolved.objectPath, resolved.metaPath]) {
            try {
                await fs.unlink(filePath);
                deleted = true;
            } catch (error) {
                if (error.code !== 'ENOENT') throw error;
            }
        }
        return deleted;
    }

    return Object.freeze({
        provider: 'local-private-filesystem',
        rootDir: root,
        putPrivateObject,
        getPrivateObject,
        headPrivateObject,
        deletePrivateObject
    });
}

module.exports = {
    LOCAL_STORAGE_ENVIRONMENTS,
    createLocalPrivateStorageAdapter,
    isVercelRuntime,
    normalizeKey,
    normalizeRootDir
};
