"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const helmet_1 = __importDefault(require("helmet"));
const morgan_1 = __importDefault(require("morgan"));
const express_rate_limit_1 = __importDefault(require("express-rate-limit"));
const hpp_1 = __importDefault(require("hpp"));
const dotenv_1 = require("dotenv");
const path_1 = __importDefault(require("path"));
const multer_1 = __importDefault(require("multer"));
const fs_1 = __importDefault(require("fs"));
const cookie_parser_1 = __importDefault(require("cookie-parser"));
const paths_1 = require("./config/paths");
const storage_1 = require("./config/storage");
const auth_1 = require("./middleware/auth");
const billing_webhook_1 = require("./routes/billing.webhook");
const publicError_1 = require("./utils/publicError");
(0, dotenv_1.config)();
const app = (0, express_1.default)();
const trustProxyValue = process.env.TRUST_PROXY;
if (trustProxyValue) {
    const parsed = Number.parseInt(trustProxyValue, 10);
    app.set('trust proxy', Number.isFinite(parsed) ? parsed : 1);
}
else if (process.env.NODE_ENV === 'production') {
    app.set('trust proxy', 1);
}
// Segurança básica
app.use((0, helmet_1.default)({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
}));
// Não expor assinatura do framework
app.disable('x-powered-by');
// CORS - configure via CORS_ORIGIN (lista separada por vírgula). Ex: "https://app.com,http://localhost:5173"
const corsAllowlist = (process.env.CORS_ORIGIN || '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);
app.use((0, cors_1.default)({
    credentials: true,
    origin: (origin, cb) => {
        // Permitir requests sem Origin (curl, Postman, server-to-server)
        if (!origin)
            return cb(null, true);
        // Se não configurado, permitir apenas localhost em dev
        if (corsAllowlist.length === 0) {
            const isLocalhost = /^https?:\/\/localhost(:\d+)?$/.test(origin);
            return cb(null, process.env.NODE_ENV !== 'production' && isLocalhost);
        }
        return cb(null, corsAllowlist.includes(origin));
    },
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'X-Bootstrap-Token'],
}));
// Proteção contra HTTP Parameter Pollution
app.use((0, hpp_1.default)());
// Rate limit geral da API
const apiLimiter = (0, express_rate_limit_1.default)({
    windowMs: 15 * 60 * 1000,
    max: 300,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Muitas requisições. Tente novamente em instantes.' },
});
app.use('/api', apiLimiter);
// Logs de requisição
app.use((0, morgan_1.default)('combined'));
// Stripe webhook precisa do corpo "raw" (não JSON parseado)
app.post('/api/billing/webhook', express_1.default.raw({ type: 'application/json' }), billing_webhook_1.billingWebhookHandler);
// Body parser
app.use(express_1.default.json({ limit: process.env.JSON_LIMIT || '5mb' }));
app.use(express_1.default.urlencoded({ extended: false, limit: process.env.URLENCODED_LIMIT || '1mb' }));
// Cookies (para auth via HttpOnly cookie)
app.use((0, cookie_parser_1.default)());
// Test route
app.get('/', (req, res) => {
    res.json({ message: 'Formulário PLD API' });
});
// Rotas de autenticação
const auth_routes_1 = __importDefault(require("./routes/auth.routes"));
app.use('/api/auth', auth_routes_1.default);
// Importar rotas do formulário
const form_routes_1 = __importDefault(require("./routes/form.routes"));
const report_routes_1 = __importDefault(require("./routes/report.routes"));
const pldBuilder_routes_1 = __importDefault(require("./routes/pldBuilder.routes"));
const billing_routes_1 = __importDefault(require("./routes/billing.routes"));
app.use('/api/form', form_routes_1.default);
app.use('/api/report', report_routes_1.default);
app.use('/api/pld', pldBuilder_routes_1.default);
app.use('/api/billing', billing_routes_1.default);
// Arquivos estáticos (uploads, evidências, relatórios)
// Express 5 / path-to-regexp requires a named wildcard param
app.get('/uploads/*path', auth_1.authenticateFromHeaderOrQuery, async (req, res) => {
    try {
        const raw = req.params.path;
        const wildcard = Array.isArray(raw) ? raw.join('/') : typeof raw === 'string' ? raw : '';
        const objectKey = wildcard.replace(/^\/+/, '');
        if (!objectKey || objectKey.split('/').some((seg) => seg === '..')) {
            return res.status(400).json({ error: 'Caminho inválido' });
        }
        if ((0, storage_1.getStorageProvider)() === 'supabase') {
            const signedUrl = await (0, storage_1.createSignedUrlForStoredPath)(`uploads/${objectKey}`);
            if (!signedUrl) {
                return res.status(404).json({ error: 'Arquivo não encontrado' });
            }
            return res.redirect(signedUrl);
        }
        const absolutePath = path_1.default.join((0, paths_1.getUploadsRoot)(), objectKey);
        const uploadsRoot = (0, paths_1.getUploadsRoot)();
        const normalizedRoot = path_1.default.resolve(uploadsRoot);
        const normalizedTarget = path_1.default.resolve(absolutePath);
        if (!normalizedTarget.startsWith(normalizedRoot + path_1.default.sep) && normalizedTarget !== normalizedRoot) {
            return res.status(400).json({ error: 'Caminho inválido' });
        }
        if (!fs_1.default.existsSync(normalizedTarget)) {
            return res.status(404).json({ error: 'Arquivo não encontrado' });
        }
        return res.sendFile(normalizedTarget);
    }
    catch (error) {
        return res.status(400).json({ error: error.message || 'Erro ao acessar arquivo' });
    }
});
// Error handler (keeps responses JSON, including Multer errors like "too many files").
app.use((err, _req, res, _next) => {
    if (err instanceof multer_1.default.MulterError) {
        if (err.code === 'LIMIT_UNEXPECTED_FILE') {
            return res.status(400).json({ error: 'Limite de arquivos excedido (máximo 5).' });
        }
        if (err.code === 'LIMIT_FILE_SIZE') {
            return res.status(400).json({ error: 'Arquivo excede o tamanho máximo permitido.' });
        }
        return res.status(400).json({ error: err.message });
    }
    if (process.env.NODE_ENV !== 'test') {
        // Keep full details in server logs only.
        // eslint-disable-next-line no-console
        console.error('Unhandled error:', err);
    }
    return res.status(500).json({ error: (0, publicError_1.toPublicErrorMessage)(err, 'Erro inesperado') });
});
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
    console.log(`🚀 Servidor de formulário rodando: http://localhost:${PORT}`);
});
