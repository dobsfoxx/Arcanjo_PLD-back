"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getUploadsRoot = getUploadsRoot;
exports.ensureDir = ensureDir;
exports.getReportsDir = getReportsDir;
exports.stripUploadsPrefix = stripUploadsPrefix;
exports.resolveFromUploads = resolveFromUploads;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
function getUploadsRoot() {
    const configured = process.env.UPLOAD_PATH;
    if (configured && configured.trim()) {
        return path_1.default.resolve(configured.trim());
    }
    return path_1.default.resolve(process.cwd(), 'uploads');
}
function ensureDir(dirPath) {
    if (!fs_1.default.existsSync(dirPath)) {
        fs_1.default.mkdirSync(dirPath, { recursive: true });
    }
}
function getReportsDir() {
    const reportsDir = path_1.default.join(getUploadsRoot(), 'reports');
    ensureDir(reportsDir);
    return reportsDir;
}
function stripUploadsPrefix(p) {
    const normalized = (p || '').replace(/\\/g, '/');
    return normalized.replace(/^\/?uploads\/?/, '');
}
function resolveFromUploads(p) {
    return path_1.default.join(getUploadsRoot(), stripUploadsPrefix(p));
}
