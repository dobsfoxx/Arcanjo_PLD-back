"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getStorageProvider = getStorageProvider;
exports.isSupabasePath = isSupabasePath;
exports.toSupabasePath = toSupabasePath;
exports.parseSupabasePath = parseSupabasePath;
exports.uploadFileToStorage = uploadFileToStorage;
exports.createSignedUrlForStoredPath = createSignedUrlForStoredPath;
exports.buildObjectKeyFromMulterFile = buildObjectKeyFromMulterFile;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const supabase_js_1 = require("@supabase/supabase-js");
const paths_1 = require("./paths");
const providerRaw = (process.env.STORAGE_PROVIDER || '').trim().toLowerCase();
const provider = providerRaw === 'supabase' ? 'supabase' : 'local';
const debug = (process.env.STORAGE_DEBUG || '').trim().toLowerCase() === 'true';
const bucket = (process.env.SUPABASE_STORAGE_BUCKET || 'uploads').trim();
const defaultSignedUrlExpiresIn = Number(process.env.SUPABASE_SIGNED_URL_EXPIRES_IN || '3600');
let supabaseClient = null;
function getSupabase() {
    if (provider !== 'supabase') {
        throw new Error('Supabase storage is not enabled');
    }
    if (supabaseClient)
        return supabaseClient;
    const url = (process.env.SUPABASE_URL || '').trim();
    const serviceRoleKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
    if (!url || !serviceRoleKey) {
        throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY for STORAGE_PROVIDER=supabase');
    }
    supabaseClient = (0, supabase_js_1.createClient)(url, serviceRoleKey, {
        auth: { persistSession: false },
    });
    return supabaseClient;
}
function getStorageProvider() {
    return provider;
}
function isSupabasePath(p) {
    return typeof p === 'string' && p.startsWith('sb:');
}
function toSupabasePath(objectKey) {
    return `sb:${bucket}/${objectKey.replace(/^\/+/, '')}`;
}
function parseSupabasePath(p) {
    // sb:<bucket>/<key>
    if (!isSupabasePath(p)) {
        throw new Error('Not a supabase path');
    }
    const withoutPrefix = p.slice('sb:'.length);
    const firstSlash = withoutPrefix.indexOf('/');
    if (firstSlash === -1) {
        throw new Error('Invalid supabase path format');
    }
    const parsedBucket = withoutPrefix.slice(0, firstSlash);
    const key = withoutPrefix.slice(firstSlash + 1);
    if (!parsedBucket || !key) {
        throw new Error('Invalid supabase path format');
    }
    return { bucket: parsedBucket, key };
}
async function uploadFileToStorage(params) {
    const { localPath, objectKey, contentType, deleteLocal } = params;
    if (provider !== 'supabase') {
        // Local mode: caller should store a public-ish path that matches /uploads static.
        // We return the objectKey normalized under uploads/ to keep consistency.
        const normalizedKey = objectKey.replace(/^\/+/, '');
        return `uploads/${normalizedKey}`;
    }
    const client = getSupabase();
    const fileBuffer = fs_1.default.readFileSync(localPath);
    if (debug) {
        console.log(`[storage] uploading to supabase bucket=${bucket} key=${objectKey} bytes=${fileBuffer.length}`);
    }
    const uploadRes = await client.storage.from(bucket).upload(objectKey, fileBuffer, {
        contentType: contentType || 'application/octet-stream',
        upsert: true,
    });
    if (uploadRes.error) {
        throw new Error(`Supabase upload failed: ${uploadRes.error.message}`);
    }
    if (debug) {
        console.log(`[storage] upload ok bucket=${bucket} key=${objectKey}`);
    }
    if (deleteLocal) {
        try {
            fs_1.default.unlinkSync(localPath);
        }
        catch {
            // ignore
        }
    }
    return `uploads/${objectKey.replace(/^\/+/, '')}`;
}
async function createSignedUrlForStoredPath(storedPath, expiresInSeconds = defaultSignedUrlExpiresIn) {
    if (provider !== 'supabase') {
        return null;
    }
    const client = getSupabase();
    const key = (0, paths_1.stripUploadsPrefix)(storedPath)
        .replace(/\\/g, '/')
        .replace(/^\/+/, '');
    if (!key || key.split('/').some((segment) => segment === '..')) {
        throw new Error('Invalid storage path');
    }
    const res = await client.storage.from(bucket).createSignedUrl(key, expiresInSeconds);
    if (res.error) {
        throw new Error(`Supabase signed URL failed: ${res.error.message}`);
    }
    if (debug) {
        console.log(`[storage] signed url ok bucket=${bucket} key=${key} exp=${expiresInSeconds}`);
    }
    return res.data.signedUrl;
}
function buildObjectKeyFromMulterFile(params) {
    const folder = (params.folder || '').replace(/^\/+/, '').replace(/\/+$/, '');
    const filename = path_1.default.basename(params.filename);
    return folder ? `${folder}/${filename}` : filename;
}
