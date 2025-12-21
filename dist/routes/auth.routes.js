"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const auth_service_1 = require("../services/auth.service");
const auth_1 = require("../middleware/auth");
const router = express_1.default.Router();
router.post('/register', async (req, res) => {
    try {
        const { name, email, password } = req.body;
        if (!name || !email || !password) {
            return res.status(400).json({ error: 'Nome, e-mail e senha são obrigatórios' });
        }
        const { user, token } = await auth_service_1.AuthService.registerUser(name, email, password);
        const { password: _pw, ...safeUser } = user;
        res.status(201).json({
            token,
            user: safeUser,
        });
    }
    catch (error) {
        res.status(400).json({ error: error.message || 'Erro ao registrar usuário' });
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
        res.json({
            token,
            user: safeUser,
        });
    }
    catch (error) {
        res.status(401).json({ error: error.message || 'Erro ao autenticar' });
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
        res.status(201).json({
            token,
            user: safeUser,
        });
    }
    catch (error) {
        res.status(400).json({ error: error.message || 'Erro ao criar administrador' });
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
        res.status(500).json({ error: error.message || 'Erro ao solicitar recuperação de senha' });
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
        res.status(400).json({ error: error.message || 'Erro ao redefinir senha' });
    }
});
// Exemplo de rota protegida para verificar sessão
router.get('/me', auth_1.authenticate, (req, res) => {
    if (!req.user) {
        return res.status(401).json({ error: 'Não autenticado' });
    }
    const { password: _pw, ...safeUser } = req.user;
    return res.json({ user: safeUser });
});
// Exemplo de rota apenas para admin
router.get('/admin-only', auth_1.authenticate, auth_1.requireAdmin, (req, res) => {
    return res.json({ message: 'Acesso permitido para ADMIN' });
});
exports.default = router;
