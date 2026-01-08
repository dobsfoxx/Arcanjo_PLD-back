"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const auth_service_1 = require("../services/auth.service");
const auth_1 = require("../middleware/auth");
const database_1 = __importDefault(require("../config/database"));
const router = express_1.default.Router();
function setAuthCookie(res, token) {
    const isProd = process.env.NODE_ENV === 'production';
    res.cookie('pld_token', token, {
        httpOnly: true,
        sameSite: 'lax',
        secure: isProd,
        path: '/',
    });
}
function clearAuthCookie(res) {
    const isProd = process.env.NODE_ENV === 'production';
    res.clearCookie('pld_token', {
        httpOnly: true,
        sameSite: 'lax',
        secure: isProd,
        path: '/',
    });
}
router.post('/register', async (req, res) => {
    try {
        const { name, email, password, startTrial } = req.body;
        if (!name || !email || !password) {
            return res.status(400).json({ error: 'Nome, e-mail e senha são obrigatórios' });
        }
        const { user, token } = await auth_service_1.AuthService.registerUser(name, email, password, { startTrial: !!startTrial });
        const { password: _pw, ...safeUser } = user;
        setAuthCookie(res, token);
        res.status(201).json({
            token,
            user: safeUser,
        });
    }
    catch (error) {
        console.error('[AUTH] register failed:', error);
        const msg = typeof error?.message === 'string' ? error.message : '';
        const safeMessage = msg === 'E-mail já está em uso' || msg === 'A senha deve ter pelo menos 8 caracteres'
            ? msg
            : 'Erro ao registrar usuário';
        res.status(400).json({ error: safeMessage });
    }
});
router.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        if (!email || !password) {
            return res.status(400).json({ error: 'E-mail e senha são obrigatórios' });
        }
        const { user, token } = await auth_service_1.AuthService.login(email, password);
        const { password: _pw, ...safeUser } = user;
        setAuthCookie(res, token);
        res.json({
            token,
            user: safeUser,
        });
    }
    catch (error) {
        console.error('[AUTH] login failed:', error);
        const msg = typeof error?.message === 'string' ? error.message : '';
        const safeMessage = msg === 'Credenciais inválidas' || msg === 'Usuário inativo' ? msg : 'Erro ao autenticar';
        res.status(401).json({ error: safeMessage });
    }
});
// Endpoint para criação do primeiro administrador
router.post('/bootstrap-admin', async (req, res) => {
    try {
        const { name, email, password } = req.body;
        if (!name || !email || !password) {
            return res.status(400).json({ error: 'Nome, e-mail e senha são obrigatórios' });
        }
        const { user, token } = await auth_service_1.AuthService.bootstrapAdmin(name, email, password);
        const { password: _pw, ...safeUser } = user;
        setAuthCookie(res, token);
        res.status(201).json({
            token,
            user: safeUser,
        });
    }
    catch (error) {
        console.error('[AUTH] bootstrap-admin failed:', error);
        const msg = typeof error?.message === 'string' ? error.message : '';
        const safeMessage = msg === 'Já existe um administrador cadastrado' || msg === 'Senha do administrador deve ter pelo menos 10 caracteres'
            ? msg
            : 'Erro ao criar administrador';
        res.status(400).json({ error: safeMessage });
    }
});
// Esqueci minha senha - solicita envio de e-mail com link de recuperação
router.post('/forgot-password', async (req, res) => {
    try {
        const { email } = req.body;
        if (!email) {
            return res.status(400).json({ error: 'E-mail é obrigatório' });
        }
        await auth_service_1.AuthService.requestPasswordReset(email);
        // Sempre responder sucesso para não expor se o e-mail existe ou não
        res.json({ message: 'Se existir uma conta com este e-mail, enviaremos instruções de recuperação.' });
    }
    catch (error) {
        console.error('[AUTH] forgot-password failed:', error);
        res.status(500).json({ error: 'Erro ao solicitar recuperação de senha' });
    }
});
// Redefinir senha usando token recebido por e-mail
router.post('/reset-password', async (req, res) => {
    try {
        const { token, password } = req.body;
        if (!token || !password) {
            return res.status(400).json({ error: 'Token e nova senha são obrigatórios' });
        }
        await auth_service_1.AuthService.resetPassword(token, password);
        res.json({ message: 'Senha redefinida com sucesso. Você já pode fazer login com a nova senha.' });
    }
    catch (error) {
        console.error('[AUTH] reset-password failed:', error);
        const msg = typeof error?.message === 'string' ? error.message : '';
        const safeMessage = msg === 'A nova senha deve ter pelo menos 8 caracteres' || msg === 'Token de recuperação inválido ou expirado'
            ? msg
            : 'Erro ao redefinir senha';
        res.status(400).json({ error: safeMessage });
    }
});
// Login com Google OAuth
router.post('/google', async (req, res) => {
    try {
        const { credential } = req.body;
        if (!credential) {
            return res.status(400).json({ error: 'Credential do Google é obrigatório' });
        }
        // Decodifica o JWT do Google (em produção, você deve verificar a assinatura)
        // O credential é um JWT que contém as informações do usuário
        const base64Payload = credential.split('.')[1];
        const payload = JSON.parse(Buffer.from(base64Payload, 'base64').toString('utf-8'));
        const { email, name, picture, email_verified } = payload;
        if (!email_verified) {
            return res.status(400).json({ error: 'E-mail do Google não verificado' });
        }
        const { user, token } = await auth_service_1.AuthService.loginWithGoogleProfile({
            email,
            name,
            picture,
            email_verified,
        });
        const { password: _pw, ...safeUser } = user;
        setAuthCookie(res, token);
        res.json({
            token,
            user: safeUser,
        });
    }
    catch (error) {
        console.error('[AUTH] google failed:', error);
        res.status(401).json({ error: 'Erro ao autenticar com Google' });
    }
});
router.post('/logout', auth_1.authenticate, (req, res) => {
    clearAuthCookie(res);
    return res.json({ message: 'Logout realizado com sucesso' });
});
// Exemplo de rota protegida para verificar sessão
router.get('/me', auth_1.authenticate, (req, res) => {
    if (!req.user) {
        return res.status(401).json({ error: 'Não autenticado' });
    }
    const { password: _pw, ...safeUser } = req.user;
    return res.json({ user: safeUser });
});
router.patch('/me', auth_1.authenticate, async (req, res) => {
    try {
        if (!req.user) {
            return res.status(401).json({ error: 'Não autenticado' });
        }
        const rawName = req.body?.name ?? '';
        const name = typeof rawName === 'string' ? rawName.trim() : '';
        if (!name) {
            return res.status(400).json({ error: 'Nome é obrigatório' });
        }
        if (name.length < 2 || name.length > 80) {
            return res.status(400).json({ error: 'Nome deve ter entre 2 e 80 caracteres' });
        }
        const updated = await database_1.default.user.update({
            where: { id: req.user.id },
            data: { name },
        });
        const { password: _pw, ...safeUser } = updated;
        return res.json({ user: safeUser });
    }
    catch (error) {
        console.error('[AUTH] patch /me failed:', error);
        return res.status(500).json({ error: 'Erro ao atualizar perfil' });
    }
});
// Exemplo de rota apenas para admin
router.get('/admin-only', auth_1.authenticate, auth_1.requireAdmin, (req, res) => {
    return res.json({ message: 'Acesso permitido para ADMIN' });
});
exports.default = router;
