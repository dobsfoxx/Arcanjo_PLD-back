"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.signToken = signToken;
exports.authenticate = authenticate;
exports.authenticateFromHeaderOrQuery = authenticateFromHeaderOrQuery;
exports.requireAdmin = requireAdmin;
exports.requireBuilderAccess = requireBuilderAccess;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const database_1 = __importDefault(require("../config/database"));
// Tempo de expiração do token (padrão: 8 horas)
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '8h';
const rawSecret = process.env.JWT_SECRET;
// Validação obrigatória do JWT_SECRET em produção
if (!rawSecret) {
    if (process.env.NODE_ENV === 'production') {
        throw new Error('JWT_SECRET is required in production');
    }
    console.warn('[SECURITY] JWT_SECRET is not set; using a dev-only fallback secret');
}
const JWT_SECRET = (rawSecret || 'dev-only-change-me');
/**
 * Gera um token JWT para o usuário especificado
 * @param userId - ID do usuário para incluir no token
 * @returns Token JWT assinado
 */
function signToken(userId) {
    return jsonwebtoken_1.default.sign({ userId }, JWT_SECRET, {
        expiresIn: JWT_EXPIRES_IN,
        algorithm: 'HS256',
    });
}
/**
 * Middleware principal de autenticação
 * Valida o token e carrega os dados do usuário na requisição
 */
async function authenticate(req, res, next) {
    try {
        const token = getTokenFromRequest(req);
        if (!token) {
            return res.status(401).json({ error: 'Token de autenticação não fornecido' });
        }
        let payload;
        try {
            payload = jsonwebtoken_1.default.verify(token, JWT_SECRET, { algorithms: ['HS256'] });
        }
        catch {
            return res.status(401).json({ error: 'Token inválido ou expirado' });
        }
        // Busca dados completos do usuário no banco
        const user = await database_1.default.user.findUnique({
            where: { id: payload.userId },
            select: {
                id: true,
                email: true,
                name: true,
                role: true,
                isTrial: true,
                trialExpiresAt: true,
                subscriptionStatus: true,
                subscriptionExpiresAt: true,
                stripeCustomerId: true,
                stripeSubscriptionId: true,
                isActive: true,
                createdAt: true,
                updatedAt: true,
            },
        });
        if (!user || !user.isActive) {
            return res.status(401).json({ error: 'Usuário não encontrado ou inativo' });
        }
        req.user = user;
        return next();
    }
    catch (error) {
        console.error('Erro na autenticação:', error);
        return res.status(500).json({ error: 'Erro interno de autenticação' });
    }
}
function getTokenFromRequest(req) {
    const rawAuth = req.headers.authorization;
    const authHeader = Array.isArray(rawAuth) ? rawAuth[0] : rawAuth;
    if (authHeader && typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) {
        const token = authHeader.split(' ')[1];
        return token || null;
    }
    const tokenFromCookie = req.cookies?.pld_token || req.cookies?.auth_token;
    if (tokenFromCookie && typeof tokenFromCookie === 'string' && tokenFromCookie.trim()) {
        return tokenFromCookie.trim();
    }
    return null;
}
function getBearerTokenFromRequest(req) {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
        const token = authHeader.split(' ')[1];
        return token || null;
    }
    const tokenFromQuery = req.query?.token || req.query?.access_token;
    return tokenFromQuery && tokenFromQuery.trim() ? tokenFromQuery.trim() : null;
}
async function authenticateFromHeaderOrQuery(req, res, next) {
    try {
        const token = getTokenFromRequest(req) || getBearerTokenFromRequest(req);
        if (!token) {
            return res.status(401).json({ error: 'Token de autenticação não fornecido' });
        }
        let payload;
        try {
            payload = jsonwebtoken_1.default.verify(token, JWT_SECRET, { algorithms: ['HS256'] });
        }
        catch {
            return res.status(401).json({ error: 'Token inválido ou expirado' });
        }
        const user = await database_1.default.user.findUnique({
            where: { id: payload.userId },
            select: {
                id: true,
                email: true,
                name: true,
                role: true,
                isTrial: true,
                trialExpiresAt: true,
                subscriptionStatus: true,
                subscriptionExpiresAt: true,
                stripeCustomerId: true,
                stripeSubscriptionId: true,
                isActive: true,
                createdAt: true,
                updatedAt: true,
            },
        });
        if (!user || !user.isActive) {
            return res.status(401).json({ error: 'Usuário não encontrado ou inativo' });
        }
        req.user = user;
        return next();
    }
    catch (error) {
        console.error('Erro na autenticação:', error);
        return res.status(500).json({ error: 'Erro interno de autenticação' });
    }
}
function requireAdmin(req, res, next) {
    if (!req.user) {
        return res.status(401).json({ error: 'Não autenticado' });
    }
    if (req.user.role !== 'ADMIN') {
        return res.status(403).json({ error: 'Acesso restrito ao administrador' });
    }
    return next();
}
function isTrialActive(user) {
    if (!user.isTrial)
        return false;
    if (!user.trialExpiresAt)
        return false;
    return user.trialExpiresAt.getTime() > Date.now();
}
function hasActiveSubscription(user) {
    if ((user.subscriptionStatus || '').toUpperCase() !== 'ACTIVE')
        return false;
    if (!user.subscriptionExpiresAt)
        return true;
    return user.subscriptionExpiresAt.getTime() > Date.now();
}
function requireBuilderAccess(req, res, next) {
    if (!req.user) {
        return res.status(401).json({ error: 'Não autenticado' });
    }
    if (req.user.role === 'ADMIN') {
        return next();
    }
    if (req.user.role === 'TRIAL_ADMIN') {
        if (isTrialActive(req.user))
            return next();
        return res.status(403).json({ error: 'Seu período de teste expirou. Finalize o pagamento para continuar.', code: 'TRIAL_EXPIRED' });
    }
    if (hasActiveSubscription(req.user)) {
        return next();
    }
    return res.status(403).json({ error: 'Acesso ao builder restrito. Faça upgrade para continuar.', code: 'PAYMENT_REQUIRED' });
}
