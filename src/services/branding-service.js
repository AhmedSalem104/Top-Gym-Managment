'use strict';

const { getPool, sql } = require('../database');
const { withTransaction } = require('../database/transaction');
const { currentTenantId } = require('../tenancy/tenant-context');

const BRANDING_ID = 1;
const MAX_TEXT_LENGTH = 500;
const MAX_ASSET_BYTES = 2 * 1024 * 1024;
const ASSET_KEYS = Object.freeze([
    'primaryLogo', 'horizontalLogo', 'lightLogo', 'darkLogo', 'compactLogo', 'favicon', 'appIcon',
    'loginBackground', 'loginIllustration', 'defaultAvatar', 'printLogo', 'watermark'
]);
const ASSET_MIME_TYPES = Object.freeze(new Set(['image/svg+xml', 'image/png', 'image/webp']));
const COLOR_KEYS = Object.freeze([
    'primary', 'primaryHover', 'primaryActive', 'onPrimary', 'secondary', 'accent',
    'background', 'surface', 'surfaceSecondary', 'card', 'cardHover', 'elevated',
    'sidebar', 'header', 'textPrimary', 'textSecondary', 'textMuted', 'textDisabled',
    'border', 'borderSecondary', 'borderHover', 'inputBackground', 'tableHeader',
    'scrollbarTrack', 'scrollbarThumb', 'success', 'warning', 'danger', 'info'
]);

const DEFAULT_LIGHT_TOKENS = Object.freeze({
    primary: '#1769E8', primaryHover: '#0F56C9', primaryActive: '#0D47A1', onPrimary: '#FFFFFF',
    secondary: '#41516A', accent: '#7C3AED', background: '#F5F7FB', surface: '#FFFFFF',
    surfaceSecondary: '#EEF3F9', card: '#FFFFFF', cardHover: '#F8FBFF', elevated: '#FFFFFF',
    sidebar: '#132238', header: '#132238', textPrimary: '#172033', textSecondary: '#41516A',
    textMuted: '#718096', textDisabled: '#98A3B5', border: '#D9E2EF', borderSecondary: '#E7EDF5',
    borderHover: '#B9D1F8', inputBackground: '#FFFFFF', tableHeader: '#F1F5F9',
    scrollbarTrack: '#EEF3F9', scrollbarThumb: '#CBD7E6', success: '#0F9F6E',
    warning: '#BD7604', danger: '#D74343', info: '#2563EB',
    primarySoft: 'rgb(23 105 232 / 0.10)', primaryBorder: 'rgb(23 105 232 / 0.24)',
    successSoft: 'rgb(15 159 110 / 0.10)', successBorder: 'rgb(15 159 110 / 0.25)',
    warningSoft: 'rgb(189 118 4 / 0.10)', warningBorder: 'rgb(189 118 4 / 0.25)',
    dangerSoft: 'rgb(215 67 67 / 0.10)', dangerBorder: 'rgb(215 67 67 / 0.25)',
    infoSoft: 'rgb(37 99 235 / 0.10)', infoBorder: 'rgb(37 99 235 / 0.25)',
    overlay: 'rgb(2 6 23 / 0.58)', focusRing: 'rgb(23 105 232 / 0.18)'
});

const DEFAULT_DARK_TOKENS = Object.freeze({
    primary: '#7C3AED', primaryHover: '#8B5CF6', primaryActive: '#6D28D9', onPrimary: '#FFFFFF',
    secondary: '#CBD5E1', accent: '#A78BFA', background: '#070D16', surface: '#0F1826',
    surfaceSecondary: '#0C1421', card: '#111C2B', cardHover: '#162235', elevated: '#182437',
    sidebar: '#09111D', header: '#0C1421', textPrimary: '#F8FAFC', textSecondary: '#CBD5E1',
    textMuted: '#94A3B8', textDisabled: '#64748B', border: '#243247', borderSecondary: '#1B293B',
    borderHover: '#35465E', inputBackground: '#0B1522', tableHeader: '#0C1624',
    scrollbarTrack: '#09111D', scrollbarThumb: '#35465E', success: '#22C55E',
    warning: '#F59E0B', danger: '#F43F5E', info: '#3B82F6',
    primarySoft: 'rgb(124 58 237 / 0.14)', primaryBorder: 'rgb(139 92 246 / 0.30)',
    successSoft: 'rgb(34 197 94 / 0.13)', successBorder: 'rgb(34 197 94 / 0.25)',
    warningSoft: 'rgb(245 158 11 / 0.13)', warningBorder: 'rgb(245 158 11 / 0.25)',
    dangerSoft: 'rgb(244 63 94 / 0.13)', dangerBorder: 'rgb(244 63 94 / 0.30)',
    infoSoft: 'rgb(59 130 246 / 0.13)', infoBorder: 'rgb(59 130 246 / 0.25)',
    overlay: 'rgb(2 6 23 / 0.75)', focusRing: 'rgb(124 58 237 / 0.18)'
});

const DEFAULT_BRANDING = Object.freeze({
    schemaVersion: 1,
    identity: {
        brandName: 'الجيم',
        englishBrandName: 'ELGYM',
        shortName: 'الجيم',
        description: 'منصة الإدارة الذكية للجيم واللياقة.',
        welcomeTitle: 'كل تمرينة تقرّبك لهدفك.',
        welcomeSubtitle: 'إدارة أذكى لجيم أقوى.',
        companyName: 'الجيم',
        copyrightText: '© الجيم — إدارة أذكى، أداء أفضل',
        phone: '',
        address: '',
        email: '',
        website: ''
    },
    assets: Object.fromEntries(ASSET_KEYS.map((key) => [key, null])),
    themes: { light: DEFAULT_LIGHT_TOKENS, dark: DEFAULT_DARK_TOKENS },
    typography: {
        arabicFont: 'Cairo', englishFont: 'Cairo', headingFont: 'Cairo', bodyFont: 'Cairo',
        baseFontSize: 16, headingWeight: 800, bodyWeight: 400
    },
    login: {
        backgroundColor: '#070D16', gradientStart: '#7C3AED', gradientEnd: '#070D16',
        overlayOpacity: 0.72, showIllustration: true, showBrandCopy: true
    },
    interface: { radius: 'medium', cardStyle: 'border', shadow: 'soft', sidebar: 'brand', activeStyle: 'background' },
    documents: {
        phone: '', address: '', email: '', website: '', footer: 'إدارة أذكى، أداء أفضل.',
        watermark: '', signature: '', stamp: ''
    }
});

const BRANDING_SCHEMA_SQL = `
IF OBJECT_ID(N'dbo.gym_branding_config', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.gym_branding_config (
        id TINYINT NOT NULL CONSTRAINT PK_gym_branding_config PRIMARY KEY,
        draft_config NVARCHAR(MAX) NOT NULL,
        published_config NVARCHAR(MAX) NOT NULL,
        version INT NOT NULL CONSTRAINT DF_gym_branding_config_version DEFAULT (1),
        updated_by_user_id INT NULL,
        updated_at DATETIME2(0) NOT NULL CONSTRAINT DF_gym_branding_config_updated DEFAULT (SYSUTCDATETIME()),
        published_by_user_id INT NULL,
        published_at DATETIME2(0) NULL,
        created_at DATETIME2(0) NOT NULL CONSTRAINT DF_gym_branding_config_created DEFAULT (SYSUTCDATETIME())
    );
END;
IF OBJECT_ID(N'dbo.gym_branding_assets', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.gym_branding_assets (
        id INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_gym_branding_assets PRIMARY KEY,
        asset_key VARCHAR(40) NOT NULL,
        scope VARCHAR(10) NOT NULL,
        mime_type VARCHAR(80) NOT NULL,
        file_name NVARCHAR(255) NULL,
        content VARBINARY(MAX) NOT NULL,
        width INT NULL,
        height INT NULL,
        updated_by_user_id INT NULL,
        created_at DATETIME2(0) NOT NULL CONSTRAINT DF_gym_branding_assets_created DEFAULT (SYSUTCDATETIME()),
        updated_at DATETIME2(0) NOT NULL CONSTRAINT DF_gym_branding_assets_updated DEFAULT (SYSUTCDATETIME()),
        CONSTRAINT CK_gym_branding_assets_scope CHECK (scope IN ('draft', 'published')),
        CONSTRAINT UQ_gym_branding_assets_scope_key UNIQUE (scope, asset_key)
    );
END;
IF OBJECT_ID(N'dbo.gym_branding_audit', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.gym_branding_audit (
        id BIGINT IDENTITY(1,1) NOT NULL CONSTRAINT PK_gym_branding_audit PRIMARY KEY,
        action VARCHAR(30) NOT NULL,
        version INT NULL,
        actor_user_id INT NULL,
        details NVARCHAR(1000) NULL,
        created_at DATETIME2(0) NOT NULL CONSTRAINT DF_gym_branding_audit_created DEFAULT (SYSUTCDATETIME()),
        CONSTRAINT CK_gym_branding_audit_action CHECK (action IN ('draft_saved', 'published', 'reset', 'asset_uploaded', 'asset_removed'))
    );
END;
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_gym_branding_audit_created' AND object_id = OBJECT_ID(N'dbo.gym_branding_audit'))
    CREATE INDEX IX_gym_branding_audit_created ON dbo.gym_branding_audit(created_at DESC, id DESC);
`;

let readyPromise;
const publicCache = new Map();
const brandingTenantRows = new Set();

function brandingTenantId() {
    return currentTenantId({ required: true });
}

function clone(value) {
    return JSON.parse(JSON.stringify(value));
}

function isObject(value) {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function merge(base, override) {
    const result = clone(base);
    if (!isObject(override)) return result;
    for (const [key, value] of Object.entries(override)) {
        if (isObject(value) && isObject(result[key])) result[key] = merge(result[key], value);
        else if (value !== undefined) result[key] = value;
    }
    return result;
}

function cleanText(value, fallback, maxLength = MAX_TEXT_LENGTH) {
    const text = String(value ?? fallback ?? '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim();
    return (text || String(fallback ?? '')).slice(0, maxLength);
}

function normalizeHex(value, fallback) {
    const text = String(value || '').trim().toUpperCase();
    if (/^#[0-9A-F]{3}$/i.test(text)) return `#${text.slice(1).split('').map((char) => char + char).join('')}`;
    if (/^#[0-9A-F]{6}$/i.test(text)) return text;
    return fallback;
}

function hexToRgb(hex) {
    const normalized = normalizeHex(hex, '#000000').slice(1);
    return { r: Number.parseInt(normalized.slice(0, 2), 16), g: Number.parseInt(normalized.slice(2, 4), 16), b: Number.parseInt(normalized.slice(4, 6), 16) };
}

function rgba(hex, alpha) {
    const { r, g, b } = hexToRgb(hex);
    return `rgb(${r} ${g} ${b} / ${alpha})`;
}

function relativeLuminance(hex) {
    const { r, g, b } = hexToRgb(hex);
    const channel = (value) => {
        const normalized = value / 255;
        return normalized <= 0.03928 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
    };
    return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

function contrastRatio(first, second) {
    const a = relativeLuminance(first);
    const b = relativeLuminance(second);
    return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

function normalizeTheme(input, fallback) {
    const merged = merge(fallback, input);
    const result = {};
    for (const key of COLOR_KEYS) result[key] = normalizeHex(merged[key], fallback[key]);
    result.primarySoft = rgba(result.primary, 0.12);
    result.primaryBorder = rgba(result.primaryHover, 0.30);
    result.successSoft = rgba(result.success, 0.12);
    result.successBorder = rgba(result.success, 0.25);
    result.warningSoft = rgba(result.warning, 0.12);
    result.warningBorder = rgba(result.warning, 0.25);
    result.dangerSoft = rgba(result.danger, 0.12);
    result.dangerBorder = rgba(result.danger, 0.30);
    result.infoSoft = rgba(result.info, 0.12);
    result.infoBorder = rgba(result.info, 0.25);
    result.overlay = /^rgb\(/i.test(String(merged.overlay || '')) ? String(merged.overlay) : fallback.overlay;
    result.focusRing = rgba(result.primary, 0.18);
    return result;
}

function normalizeAssetReference(value) {
    if (!value) return null;
    const key = typeof value === 'string' ? value : value.key;
    if (!ASSET_KEYS.includes(String(key))) return null;
    const revision = Number(typeof value === 'object' ? value.revision : 0);
    return revision > 0 ? { key: String(key), revision: Math.floor(revision) } : { key: String(key) };
}

function normalizeConfig(input) {
    const merged = merge(DEFAULT_BRANDING, input);
    const identity = merged.identity || {};
    const typography = merged.typography || {};
    const login = merged.login || {};
    const interfaceOptions = merged.interface || {};
    const documents = merged.documents || {};
    const assets = Object.fromEntries(ASSET_KEYS.map((key) => [key, normalizeAssetReference(merged.assets?.[key])]));
    return {
        schemaVersion: 1,
        identity: {
            // An explicitly empty brand name is a validation error. Missing
            // values still inherit the safe default through merge().
            brandName: cleanText(identity.brandName, '', 80),
            englishBrandName: cleanText(identity.englishBrandName, DEFAULT_BRANDING.identity.englishBrandName, 80),
            shortName: cleanText(identity.shortName, DEFAULT_BRANDING.identity.shortName, 30),
            description: cleanText(identity.description, DEFAULT_BRANDING.identity.description, 180),
            welcomeTitle: cleanText(identity.welcomeTitle, DEFAULT_BRANDING.identity.welcomeTitle, 160),
            welcomeSubtitle: cleanText(identity.welcomeSubtitle, DEFAULT_BRANDING.identity.welcomeSubtitle, 180),
            companyName: cleanText(identity.companyName, DEFAULT_BRANDING.identity.companyName, 120),
            copyrightText: cleanText(identity.copyrightText, DEFAULT_BRANDING.identity.copyrightText, 180),
            phone: cleanText(identity.phone, '', 40), address: cleanText(identity.address, '', 180),
            email: cleanText(identity.email, '', 120), website: cleanText(identity.website, '', 180)
        },
        assets,
        themes: { light: normalizeTheme(merged.themes?.light, DEFAULT_LIGHT_TOKENS), dark: normalizeTheme(merged.themes?.dark, DEFAULT_DARK_TOKENS) },
        typography: {
            arabicFont: ['Cairo', 'Alexandria', 'IBM Plex Sans Arabic'].includes(typography.arabicFont) ? typography.arabicFont : 'Cairo',
            englishFont: ['Cairo', 'Alexandria', 'IBM Plex Sans Arabic'].includes(typography.englishFont) ? typography.englishFont : 'Cairo',
            headingFont: ['Cairo', 'Alexandria', 'IBM Plex Sans Arabic'].includes(typography.headingFont) ? typography.headingFont : 'Cairo',
            bodyFont: ['Cairo', 'Alexandria', 'IBM Plex Sans Arabic'].includes(typography.bodyFont) ? typography.bodyFont : 'Cairo',
            baseFontSize: Math.min(18, Math.max(14, Number(typography.baseFontSize) || 16)),
            headingWeight: [600, 700, 800].includes(Number(typography.headingWeight)) ? Number(typography.headingWeight) : 800,
            bodyWeight: [400, 500, 600].includes(Number(typography.bodyWeight)) ? Number(typography.bodyWeight) : 400
        },
        login: {
            backgroundColor: normalizeHex(login.backgroundColor, DEFAULT_BRANDING.login.backgroundColor),
            gradientStart: normalizeHex(login.gradientStart, DEFAULT_BRANDING.login.gradientStart),
            gradientEnd: normalizeHex(login.gradientEnd, DEFAULT_BRANDING.login.gradientEnd),
            overlayOpacity: Math.min(0.9, Math.max(0.25, Number(login.overlayOpacity) || DEFAULT_BRANDING.login.overlayOpacity)),
            showIllustration: login.showIllustration !== false, showBrandCopy: login.showBrandCopy !== false
        },
        interface: {
            radius: ['sharp', 'small', 'medium', 'large'].includes(interfaceOptions.radius) ? interfaceOptions.radius : 'medium',
            cardStyle: ['flat', 'border', 'soft-shadow'].includes(interfaceOptions.cardStyle) ? interfaceOptions.cardStyle : 'border',
            shadow: ['none', 'soft', 'medium'].includes(interfaceOptions.shadow) ? interfaceOptions.shadow : 'soft',
            sidebar: ['brand', 'light', 'dark', 'auto'].includes(interfaceOptions.sidebar) ? interfaceOptions.sidebar : 'brand',
            activeStyle: ['background', 'indicator', 'pill'].includes(interfaceOptions.activeStyle) ? interfaceOptions.activeStyle : 'background'
        },
        documents: {
            phone: cleanText(documents.phone, identity.phone, 40), address: cleanText(documents.address, identity.address, 180),
            email: cleanText(documents.email, identity.email, 120), website: cleanText(documents.website, identity.website, 180),
            footer: cleanText(documents.footer, DEFAULT_BRANDING.documents.footer, 180), watermark: cleanText(documents.watermark, '', 100),
            signature: cleanText(documents.signature, '', 120), stamp: cleanText(documents.stamp, '', 120)
        }
    };
}

function validateConfig(config) {
    const errors = [];
    const warnings = [];
    if (!config.identity.brandName.trim()) errors.push({ field: 'identity.brandName', message: 'اسم العلامة التجارية مطلوب.' });
    for (const themeName of ['light', 'dark']) {
        const theme = config.themes[themeName];
        if (contrastRatio(theme.textPrimary, theme.background) < 4.5) errors.push({ field: `themes.${themeName}.textPrimary`, message: `تباين النص الأساسي في وضع ${themeName === 'light' ? 'Light' : 'Dark'} غير كافٍ.` });
        if (contrastRatio(theme.onPrimary, theme.primary) < 4.5) errors.push({ field: `themes.${themeName}.onPrimary`, message: `تباين نص الزر الأساسي في وضع ${themeName === 'light' ? 'Light' : 'Dark'} غير كافٍ.` });
        if (contrastRatio(theme.textSecondary, theme.background) < 3) warnings.push({ field: `themes.${themeName}.textSecondary`, message: `النص الثانوي في وضع ${themeName === 'light' ? 'Light' : 'Dark'} منخفض التباين.` });
    }
    return { errors, warnings };
}

function brandingError(message, details = null) {
    const error = new Error(message);
    error.statusCode = 400;
    error.expose = true;
    error.code = 'BRANDING_VALIDATION_FAILED';
    error.details = details;
    return error;
}

function normalizeAssetKey(value) {
    const key = String(value || '').trim();
    if (!ASSET_KEYS.includes(key)) throw brandingError('نوع أصل الهوية غير مدعوم.');
    return key;
}

function imageDimensions(buffer, mimeType, declaredWidth, declaredHeight) {
    if (mimeType === 'image/png') {
        if (buffer.length < 24 || !buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) {
            throw brandingError('ملف PNG غير صالح أو لا يطابق نوعه المعلن.');
        }
        return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
    }
    if (mimeType === 'image/webp') {
        if (buffer.length < 16 || buffer.toString('ascii', 0, 4) !== 'RIFF' || buffer.toString('ascii', 8, 12) !== 'WEBP') {
            throw brandingError('ملف WebP غير صالح أو لا يطابق نوعه المعلن.');
        }
        const type = buffer.toString('ascii', 12, 16);
        if (type === 'VP8X' && buffer.length >= 30) {
            return { width: 1 + buffer.readUIntLE(24, 3), height: 1 + buffer.readUIntLE(27, 3) };
        }
        if (type === 'VP8L' && buffer.length >= 25 && buffer[20] === 0x2f) {
            const widthBits = buffer[21] | (buffer[22] << 8);
            const heightBits = (buffer[22] >> 6) | (buffer[23] << 2) | (buffer[24] << 10);
            return { width: 1 + (widthBits & 0x3fff), height: 1 + (heightBits & 0x3fff) };
        }
        if (type === 'VP8 ') {
            const frameHeader = buffer.indexOf(Buffer.from([0x9d, 0x01, 0x2a]), 20);
            if (frameHeader >= 0 && frameHeader + 7 <= buffer.length) {
                return { width: buffer.readUInt16LE(frameHeader + 3) & 0x3fff, height: buffer.readUInt16LE(frameHeader + 5) & 0x3fff };
            }
        }
        throw brandingError('تعذر قراءة أبعاد ملف WebP. ارفع ملف WebP صالحًا.');
    }
    if (mimeType === 'image/svg+xml') {
        const source = buffer.toString('utf8');
        if (/<script\b|\bon[a-z]+\s*=|javascript:/i.test(source)) throw brandingError('ملف SVG يحتوي على تعليمات غير آمنة.');
        if (!/<svg\b[^>]*>/i.test(source)) throw brandingError('ملف SVG غير صالح أو لا يطابق نوعه المعلن.');
        const viewBox = source.match(/viewBox\s*=\s*["']\s*[-+\d.]+\s+[-+\d.]+\s+([\d.]+)\s+([\d.]+)\s*["']/i);
        const width = Number(source.match(/\bwidth\s*=\s*["']([\d.]+)/i)?.[1] || declaredWidth || 0);
        const height = Number(source.match(/\bheight\s*=\s*["']([\d.]+)/i)?.[1] || declaredHeight || 0);
        if (viewBox) return { width: Number(viewBox[1]), height: Number(viewBox[2]) };
        if (width && height) return { width, height };
    }
    const width = Number(declaredWidth || 0);
    const height = Number(declaredHeight || 0);
    if (width > 0 && height > 0) return { width, height };
    throw brandingError('تعذر قراءة أبعاد الصورة. ارفع ملفًا صالحًا أو جرّب PNG/WebP/SVG آخر.');
}

function validateAsset({ key, mimeType, fileName, buffer, width, height }) {
    normalizeAssetKey(key);
    if (!ASSET_MIME_TYPES.has(String(mimeType || '').toLowerCase())) throw brandingError('يسمح برفع SVG أو PNG أو WebP فقط.');
    if (!Buffer.isBuffer(buffer) || !buffer.length || buffer.length > MAX_ASSET_BYTES) throw brandingError('حجم أصل الهوية يجب أن يكون بين 1 بايت و2 ميجابايت.');
    const dimensions = imageDimensions(buffer, String(mimeType).toLowerCase(), width, height);
    if (!Number.isFinite(dimensions.width) || !Number.isFinite(dimensions.height) || dimensions.width < 1 || dimensions.height < 1 || dimensions.width > 5000 || dimensions.height > 5000) throw brandingError('أبعاد أصل الهوية غير صالحة أو أكبر من الحد المسموح.');
    const ratio = dimensions.width / dimensions.height;
    if (ratio < 0.12 || ratio > 8) throw brandingError('نسبة أبعاد أصل الهوية غير مناسبة للتصميم.');
    return { key: normalizeAssetKey(key), mimeType: String(mimeType).toLowerCase(), fileName: cleanText(fileName, `${key}.asset`, 255), buffer, width: Math.round(dimensions.width), height: Math.round(dimensions.height) };
}

async function ensureTenantDefaultRow(pool = null) {
    const tenantId = currentTenantId({ required: false });
    if (!tenantId || brandingTenantRows.has(tenantId)) return;
    const defaultJson = JSON.stringify(DEFAULT_BRANDING);
    const executor = pool || await getPool();
    const request = executor.request()
        .input('brandingId', sql.TinyInt, BRANDING_ID)
        .input('draftConfig', sql.NVarChar(sql.MAX), defaultJson)
        .input('publishedConfig', sql.NVarChar(sql.MAX), defaultJson);
    if (tenantId) {
        request.input('tenantId', sql.Int, tenantId);
        await request.query(`
            IF COL_LENGTH(N'dbo.gym_branding_config', N'tenant_id') IS NULL
            BEGIN
                IF NOT EXISTS (SELECT 1 FROM dbo.gym_branding_config WHERE id=@brandingId)
                    INSERT INTO dbo.gym_branding_config (id, draft_config, published_config) VALUES (@brandingId, @draftConfig, @publishedConfig);
            END
            ELSE
                EXEC sys.sp_executesql
                    N'IF NOT EXISTS (SELECT 1 FROM dbo.gym_branding_config WHERE id=@BrandingId AND tenant_id=@TenantId)
                      INSERT INTO dbo.gym_branding_config (id, tenant_id, draft_config, published_config) VALUES (@BrandingId, @TenantId, @DraftConfig, @PublishedConfig);',
                    N'@BrandingId TINYINT,@TenantId INT,@DraftConfig NVARCHAR(MAX),@PublishedConfig NVARCHAR(MAX)',
                    @BrandingId=@brandingId,@TenantId=@tenantId,@DraftConfig=@draftConfig,@PublishedConfig=@publishedConfig;
        `);
        brandingTenantRows.add(tenantId);
        return;
    }
    await request.query(`
        IF COL_LENGTH(N'dbo.gym_branding_config', N'tenant_id') IS NULL
           AND NOT EXISTS (SELECT 1 FROM dbo.gym_branding_config WHERE id=@brandingId)
            INSERT INTO dbo.gym_branding_config (id, draft_config, published_config) VALUES (@brandingId, @draftConfig, @publishedConfig);
    `);
    brandingTenantRows.add(tenantId);
}

async function createTables() {
    const pool = await getPool();
    await pool.request().batch(BRANDING_SCHEMA_SQL);
    await ensureTenantDefaultRow(pool);
}

async function ensureBrandingTables() {
    if (!readyPromise) readyPromise = createTables().catch((error) => { readyPromise = null; throw error; });
    await readyPromise;
    await ensureTenantDefaultRow();
}

async function readRow(transactionOrPool = null) {
    const executor = transactionOrPool || await getPool();
    const result = await executor.request()
        .input('brandingId', sql.TinyInt, BRANDING_ID)
        .input('tenantId', sql.Int, brandingTenantId())
        .query('SELECT TOP (1) id, draft_config, published_config, version, updated_by_user_id, updated_at, published_by_user_id, published_at, created_at FROM dbo.gym_branding_config WHERE id=@brandingId AND tenant_id=@tenantId;');
    return result.recordset[0] || null;
}

function parseStoredConfig(value) {
    try { return normalizeConfig(JSON.parse(value || '{}')); } catch (_) { return normalizeConfig(DEFAULT_BRANDING); }
}

async function assetMetadata(scope) {
    const pool = await getPool();
    const result = await pool.request().input('scope', sql.VarChar(10), scope).input('tenantId', sql.Int, brandingTenantId()).query('SELECT asset_key, mime_type, file_name, width, height, updated_at FROM dbo.gym_branding_assets WHERE scope=@scope AND tenant_id=@tenantId;');
    return new Map(result.recordset.map((row) => [String(row.asset_key), { key: String(row.asset_key), mimeType: row.mime_type, fileName: row.file_name, width: Number(row.width || 0), height: Number(row.height || 0), updatedAt: row.updated_at }]));
}

function decorateConfig(config, scope, version, metadata) {
    const result = clone(config);
    result.assets = Object.fromEntries(ASSET_KEYS.map((key) => {
        const reference = config.assets[key];
        const meta = reference && metadata.get(reference.key || key);
        if (!meta) return [key, null];
        const basePath = scope === 'draft' ? '/api/branding/draft-assets/' : '/api/branding/assets/';
        const assetVersion = Number(reference?.revision || 0) || (meta.updatedAt ? new Date(meta.updatedAt).getTime() : version);
        return [key, { ...meta, url: `${basePath}${encodeURIComponent(meta.key)}?v=${encodeURIComponent(`${version}-${assetVersion || 0}`)}` }];
    }));
    return result;
}

async function audit(action, actorUserId, version, details) {
    const pool = await getPool();
    await pool.request().input('tenantId', sql.Int, brandingTenantId()).input('action', sql.VarChar(30), action).input('version', sql.Int, version || null).input('actorUserId', sql.Int, actorUserId || null).input('details', sql.NVarChar(1000), details || null).query('INSERT INTO dbo.gym_branding_audit (tenant_id, action, version, actor_user_id, details) VALUES (@tenantId,@action,@version,@actorUserId,@details);');
}

async function latestAudit() {
    const pool = await getPool();
    const result = await pool.request().input('tenantId', sql.Int, brandingTenantId()).query('SELECT TOP (12) id, action, version, actor_user_id, details, created_at FROM dbo.gym_branding_audit WHERE tenant_id=@tenantId ORDER BY created_at DESC, id DESC;');
    return result.recordset.map((row) => ({ id: Number(row.id), action: row.action, version: row.version == null ? null : Number(row.version), actorUserId: row.actor_user_id == null ? null : Number(row.actor_user_id), details: row.details || null, createdAt: row.created_at }));
}

async function ownerResponse() {
    await ensureBrandingTables();
    const row = await readRow();
    const draft = parseStoredConfig(row?.draft_config);
    const published = parseStoredConfig(row?.published_config);
    const [draftAssets, publishedAssets] = await Promise.all([assetMetadata('draft'), assetMetadata('published')]);
    return {
        draft: decorateConfig(draft, 'draft', row?.version || 1, draftAssets),
        published: decorateConfig(published, 'published', row?.version || 1, publishedAssets),
        version: Number(row?.version || 1),
        metadata: {
            updatedAt: row?.updated_at || null, updatedByUserId: row?.updated_by_user_id == null ? null : Number(row.updated_by_user_id),
            publishedAt: row?.published_at || null, publishedByUserId: row?.published_by_user_id == null ? null : Number(row.published_by_user_id)
        },
        validation: validateConfig(draft), audit: await latestAudit()
    };
}

function invalidatePublicCache() {
    publicCache.clear();
}

async function getPublicBranding() {
    await ensureBrandingTables();
    const tenantId = brandingTenantId();
    const cached = publicCache.get(tenantId);
    if (cached && cached.expiresAt > Date.now()) return clone(cached.value);
    const row = await readRow();
    const published = parseStoredConfig(row?.published_config);
    const result = { branding: decorateConfig(published, 'published', row?.version || 1, await assetMetadata('published')), version: Number(row?.version || 1), publishedAt: row?.published_at || null };
    publicCache.set(tenantId, { value: result, expiresAt: Date.now() + 30_000 });
    return clone(result);
}

async function getPublicBrandName(fallback = 'الجيم') {
    try {
        const result = await getPublicBranding();
        return String(result?.branding?.identity?.brandName || fallback).trim() || fallback;
    } catch (_) {
        return fallback;
    }
}

async function saveDraft(input, actorUserId) {
    await ensureBrandingTables();
    const config = normalizeConfig(input);
    const validation = validateConfig(config);
    if (validation.errors.length) throw brandingError('لا يمكن حفظ المسودة قبل إصلاح مشاكل الهوية.', validation);
    const pool = await getPool();
    await pool.request().input('brandingId', sql.TinyInt, BRANDING_ID).input('tenantId', sql.Int, brandingTenantId()).input('config', sql.NVarChar(sql.MAX), JSON.stringify(config)).input('actorUserId', sql.Int, actorUserId || null).query('UPDATE dbo.gym_branding_config SET draft_config=@config, updated_by_user_id=@actorUserId, updated_at=SYSUTCDATETIME() WHERE id=@brandingId AND tenant_id=@tenantId;');
    const row = await readRow();
    await audit('draft_saved', actorUserId, Number(row?.version || 1), 'تم حفظ مسودة الهوية.');
    return ownerResponse();
}

async function publish(actorUserId) {
    await ensureBrandingTables();
    let publishedVersion = 1;
    const tenantId = brandingTenantId();
    await withTransaction(async (transaction) => {
        const rowResult = await transaction.request().input('brandingId', sql.TinyInt, BRANDING_ID).input('tenantId', sql.Int, tenantId).query('SELECT TOP (1) * FROM dbo.gym_branding_config WITH (UPDLOCK, HOLDLOCK) WHERE id=@brandingId AND tenant_id=@tenantId;');
        const row = rowResult.recordset[0];
        const config = normalizeConfig(parseStoredConfig(row?.draft_config));
        const validation = validateConfig(config);
        if (validation.errors.length) throw brandingError('لا يمكن نشر الهوية قبل إصلاح مشاكل التباين أو البيانات.', validation);
        publishedVersion = Number(row?.version || 1) + 1;
        await transaction.request().input('brandingId', sql.TinyInt, BRANDING_ID).input('tenantId', sql.Int, tenantId).input('config', sql.NVarChar(sql.MAX), JSON.stringify(config)).input('actorUserId', sql.Int, actorUserId || null).input('version', sql.Int, publishedVersion).query('UPDATE dbo.gym_branding_config SET published_config=@config, version=@version, published_by_user_id=@actorUserId, published_at=SYSUTCDATETIME(), updated_at=SYSUTCDATETIME() WHERE id=@brandingId AND tenant_id=@tenantId;');

        const references = new Set(ASSET_KEYS.map((key) => config.assets[key]?.key).filter(Boolean));
        const draftAssets = await transaction.request().input('tenantId', sql.Int, tenantId).query("SELECT asset_key, mime_type, file_name, content, width, height FROM dbo.gym_branding_assets WHERE scope='draft' AND tenant_id=@tenantId;");
        for (const asset of draftAssets.recordset.filter((item) => references.has(String(item.asset_key)))) {
            await transaction.request().input('tenantId', sql.Int, tenantId).input('assetKey', sql.VarChar(40), asset.asset_key).input('mimeType', sql.VarChar(80), asset.mime_type).input('fileName', sql.NVarChar(255), asset.file_name).input('content', sql.VarBinary(sql.MAX), asset.content).input('width', sql.Int, asset.width).input('height', sql.Int, asset.height).input('actorUserId', sql.Int, actorUserId || null).query("UPDATE dbo.gym_branding_assets SET mime_type=@mimeType, file_name=@fileName, content=@content, width=@width, height=@height, updated_by_user_id=@actorUserId, updated_at=SYSUTCDATETIME() WHERE scope='published' AND asset_key=@assetKey AND tenant_id=@tenantId; IF @@ROWCOUNT=0 INSERT INTO dbo.gym_branding_assets(tenant_id,asset_key,scope,mime_type,file_name,content,width,height,updated_by_user_id) VALUES(@tenantId,@assetKey,'published',@mimeType,@fileName,@content,@width,@height,@actorUserId);");
        }
        for (const key of ASSET_KEYS.filter((item) => !references.has(item))) await transaction.request().input('tenantId', sql.Int, tenantId).input('assetKey', sql.VarChar(40), key).query("DELETE FROM dbo.gym_branding_assets WHERE scope='published' AND asset_key=@assetKey AND tenant_id=@tenantId;");
        await transaction.request().input('action', sql.VarChar(30), 'published').input('version', sql.Int, publishedVersion).input('actorUserId', sql.Int, actorUserId || null).input('details', sql.NVarChar(1000), 'تم نشر الهوية على كامل المنصة.').query('INSERT INTO dbo.gym_branding_audit (action,version,actor_user_id,details) VALUES (@action,@version,@actorUserId,@details);');
    });
    invalidatePublicCache();
    return ownerResponse();
}

async function resetDraft(actorUserId) {
    await ensureBrandingTables();
    const pool = await getPool();
    await pool.request().input('brandingId', sql.TinyInt, BRANDING_ID).input('tenantId', sql.Int, brandingTenantId()).input('config', sql.NVarChar(sql.MAX), JSON.stringify(DEFAULT_BRANDING)).input('actorUserId', sql.Int, actorUserId || null).query('UPDATE dbo.gym_branding_config SET draft_config=@config, updated_by_user_id=@actorUserId, updated_at=SYSUTCDATETIME() WHERE id=@brandingId AND tenant_id=@tenantId; DELETE FROM dbo.gym_branding_assets WHERE scope=\'draft\' AND tenant_id=@tenantId;');
    const row = await readRow();
    await audit('reset', actorUserId, Number(row?.version || 1), 'تمت استعادة المسودة إلى الهوية الافتراضية الجيم.');
    return ownerResponse();
}

async function uploadDraftAsset(input, actorUserId) {
    await ensureBrandingTables();
    const asset = validateAsset(input);
    const pool = await getPool();
    await pool.request().input('tenantId', sql.Int, brandingTenantId()).input('assetKey', sql.VarChar(40), asset.key).input('mimeType', sql.VarChar(80), asset.mimeType).input('fileName', sql.NVarChar(255), asset.fileName).input('content', sql.VarBinary(sql.MAX), asset.buffer).input('width', sql.Int, asset.width).input('height', sql.Int, asset.height).input('actorUserId', sql.Int, actorUserId || null).query("UPDATE dbo.gym_branding_assets SET mime_type=@mimeType, file_name=@fileName, content=@content, width=@width, height=@height, updated_by_user_id=@actorUserId, updated_at=SYSUTCDATETIME() WHERE scope='draft' AND asset_key=@assetKey AND tenant_id=@tenantId; IF @@ROWCOUNT=0 INSERT INTO dbo.gym_branding_assets(tenant_id,asset_key,scope,mime_type,file_name,content,width,height,updated_by_user_id) VALUES(@tenantId,@assetKey,'draft',@mimeType,@fileName,@content,@width,@height,@actorUserId);");
    const row = await readRow();
    const config = parseStoredConfig(row?.draft_config);
    const revision = Date.now();
    config.assets[asset.key] = { key: asset.key, revision };
    await pool.request().input('brandingId', sql.TinyInt, BRANDING_ID).input('tenantId', sql.Int, brandingTenantId()).input('config', sql.NVarChar(sql.MAX), JSON.stringify(config)).query('UPDATE dbo.gym_branding_config SET draft_config=@config, updated_at=SYSUTCDATETIME() WHERE id=@brandingId AND tenant_id=@tenantId;');
    await audit('asset_uploaded', actorUserId, Number(row?.version || 1), `تم رفع أصل الهوية: ${asset.key}.`);
    return { key: asset.key, revision, mimeType: asset.mimeType, fileName: asset.fileName, width: asset.width, height: asset.height, url: `/api/branding/draft-assets/${encodeURIComponent(asset.key)}?v=${revision}` };
}

async function removeDraftAsset(key, actorUserId) {
    await ensureBrandingTables();
    const assetKey = normalizeAssetKey(key);
    const pool = await getPool();
    await pool.request().input('tenantId', sql.Int, brandingTenantId()).input('assetKey', sql.VarChar(40), assetKey).query("DELETE FROM dbo.gym_branding_assets WHERE scope='draft' AND asset_key=@assetKey AND tenant_id=@tenantId;");
    const row = await readRow();
    const config = parseStoredConfig(row?.draft_config);
    config.assets[assetKey] = null;
    await pool.request().input('brandingId', sql.TinyInt, BRANDING_ID).input('tenantId', sql.Int, brandingTenantId()).input('config', sql.NVarChar(sql.MAX), JSON.stringify(config)).query('UPDATE dbo.gym_branding_config SET draft_config=@config, updated_at=SYSUTCDATETIME() WHERE id=@brandingId AND tenant_id=@tenantId;');
    await audit('asset_removed', actorUserId, Number(row?.version || 1), `تم حذف أصل الهوية: ${assetKey}.`);
    return { key: assetKey };
}

async function readAsset(key, scope = 'published') {
    await ensureBrandingTables();
    const assetKey = normalizeAssetKey(key);
    const normalizedScope = scope === 'draft' ? 'draft' : 'published';
    const pool = await getPool();
    const result = await pool.request().input('tenantId', sql.Int, brandingTenantId()).input('assetKey', sql.VarChar(40), assetKey).input('scope', sql.VarChar(10), normalizedScope).query('SELECT TOP (1) mime_type, file_name, content FROM dbo.gym_branding_assets WHERE asset_key=@assetKey AND scope=@scope AND tenant_id=@tenantId;');
    return result.recordset[0] || null;
}

module.exports = {
    ASSET_KEYS,
    BRANDING_SCHEMA_SQL,
    DEFAULT_BRANDING,
    MAX_ASSET_BYTES,
    ensureBrandingTables,
    getPublicBranding,
    getPublicBrandName,
    latestAudit,
    ownerResponse,
    publish,
    readAsset,
    removeDraftAsset,
    resetDraft,
    saveDraft,
    uploadDraftAsset,
    validateConfig
};
