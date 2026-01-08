"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.heavyOperationLimiter = exports.authRateLimiter = exports.apiRateLimiter = void 0;
function getClientKey(req) {
    const ip = req.ip || (req.socket?.remoteAddress ?? 'unknown');
    return ip;
}
function createRateLimiter(options) {
    const buckets = new Map();
    return function rateLimiter(req, res, next) {
        // Não rate-limit OPTIONS (preflight)
        if (req.method === 'OPTIONS')
            return next();
        const now = Date.now();
        const key = `${options.keyPrefix}:${getClientKey(req)}`;
        const existing = buckets.get(key);
        if (!existing || existing.resetAt <= now) {
            buckets.set(key, { count: 1, resetAt: now + options.windowMs });
            return next();
        }
        existing.count += 1;
        if (existing.count > options.max) {
            const retryAfterSeconds = Math.max(1, Math.ceil((existing.resetAt - now) / 1000));
            res.setHeader('Retry-After', String(retryAfterSeconds));
            return res.status(429).json({
                error: 'Muitas requisições. Tente novamente em instantes.',
                retryAfterSeconds,
            });
        }
        return next();
    };
}
exports.apiRateLimiter = createRateLimiter({
    windowMs: 60000,
    max: 600,
    keyPrefix: 'api',
});
exports.authRateLimiter = createRateLimiter({
    windowMs: 60000,
    max: 60,
    keyPrefix: 'auth',
});
exports.heavyOperationLimiter = createRateLimiter({
    windowMs: 60000,
    max: 30,
    keyPrefix: 'heavy',
});
