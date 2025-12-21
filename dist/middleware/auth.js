"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.signToken = signToken;
exports.authenticate = authenticate;
exports.requireAdmin = requireAdmin;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const database_1 = __importDefault(require("../config/database"));
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '8h';
const rawSecret = process.env.JWT_SECRET;
if (!rawSecret) {
    if (process.env.NODE_ENV === 'production') {
        throw new Error('JWT_SECRET is required in production');
    }
    console.warn('[SECURITY] JWT_SECRET is not set; using a dev-only fallback secret');
}
const JWT_SECRET = (rawSecret || 'dev-only-change-me');
function signToken(userId) {
    return jsonwebtoken_1.default.sign({ userId }, JWT_SECRET, {
        expiresIn: JWT_EXPIRES_IN,
    });
}
async function authenticate(req, res, next) {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ error: 'Token de autenticação não fornecido' });
        }
        const token = authHeader.split(' ')[1];
        let payload;
        try {
            payload = jsonwebtoken_1.default.verify(token, JWT_SECRET);
        }
        catch {
            return res.status(401).json({ error: 'Token inválido ou expirado' });
        }
        const user = await database_1.default.user.findUnique({ where: { id: payload.userId } });
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
