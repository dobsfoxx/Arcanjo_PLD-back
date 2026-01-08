"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isPrismaLikeError = isPrismaLikeError;
exports.compactSingleLineMessage = compactSingleLineMessage;
exports.toPublicErrorMessage = toPublicErrorMessage;
function isPrismaLikeError(err) {
    if (!(err instanceof Error))
        return false;
    const name = err.name || '';
    const msg = err.message || '';
    if (/^PrismaClient/.test(name))
        return true;
    if (/Invalid `.*` invocation/i.test(msg))
        return true;
    if (/\bPrisma\b/i.test(msg))
        return true;
    return false;
}
function compactSingleLineMessage(message, maxLen = 180) {
    const firstLine = (message || '').split(/\r?\n/)[0]?.trim() || '';
    if (!firstLine)
        return '';
    if (firstLine.length <= maxLen)
        return firstLine;
    return `${firstLine.slice(0, maxLen - 1)}…`;
}
function toPublicErrorMessage(err, fallback = 'Erro inesperado') {
    if (typeof err === 'string') {
        return compactSingleLineMessage(err) || fallback;
    }
    if (err instanceof Error) {
        if (isPrismaLikeError(err))
            return 'Erro interno do servidor';
        return compactSingleLineMessage(err.message) || fallback;
    }
    return fallback;
}
