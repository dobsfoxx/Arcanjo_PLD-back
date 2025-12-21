"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const helmet_1 = __importDefault(require("helmet"));
const morgan_1 = __importDefault(require("morgan"));
const dotenv_1 = require("dotenv");
const paths_1 = require("./config/paths");
const storage_1 = require("./config/storage");
(0, dotenv_1.config)();
const app = (0, express_1.default)();
// Segurança básica
app.use((0, helmet_1.default)());
// Não expor assinatura do framework
app.disable('x-powered-by');
// CORS - configure via CORS_ORIGIN (lista separada por vírgula). Ex: "https://app.com,http://localhost:5173"
const corsAllowlist = (process.env.CORS_ORIGIN || '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);
app.use((0, cors_1.default)({
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
    credentials: true,
}));
// Logs de requisição
app.use((0, morgan_1.default)('combined'));
// Body parser
app.use(express_1.default.json({ limit: '10mb' }));
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
app.use('/api/form', form_routes_1.default);
app.use('/api/report', report_routes_1.default);
app.use('/api/pld', pldBuilder_routes_1.default);
// Arquivos estáticos (uploads, evidências, relatórios)
if ((0, storage_1.getStorageProvider)() === 'supabase') {
    // Express 5 / path-to-regexp requires a named wildcard param
    app.get('/uploads/*path', async (req, res) => {
        try {
            const raw = req.params.path;
            const wildcard = Array.isArray(raw) ? raw.join('/') : typeof raw === 'string' ? raw : '';
            const objectKey = wildcard.replace(/^\/+/, '');
            if (!objectKey || objectKey.split('/').some((seg) => seg === '..')) {
                return res.status(400).json({ error: 'Caminho inválido' });
            }
            const signedUrl = await (0, storage_1.createSignedUrlForStoredPath)(`uploads/${objectKey}`);
            if (!signedUrl) {
                return res.status(404).json({ error: 'Arquivo não encontrado' });
            }
            return res.redirect(signedUrl);
        }
        catch (error) {
            return res.status(400).json({ error: error.message || 'Erro ao acessar arquivo' });
        }
    });
}
app.use('/uploads', express_1.default.static((0, paths_1.getUploadsRoot)(), {
    index: false,
    dotfiles: 'deny',
}));
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
    console.log(`🚀 Servidor de formulário rodando: http://localhost:${PORT}`);
});
