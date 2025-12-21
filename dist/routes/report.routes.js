"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const fs_1 = __importDefault(require("fs"));
const auth_1 = require("../middleware/auth");
const reportServices_1 = require("../services/reportServices");
const paths_1 = require("../config/paths");
const storage_1 = require("../config/storage");
const router = express_1.default.Router();
function buildPublicDownloadUrl(filePath) {
    const base = (process.env.PUBLIC_BASE_URL || '').replace(/\/+$/, '');
    const normalized = `/${filePath.replace(/\\/g, '/').replace(/^\/+/, '')}`;
    return base ? `${base}${normalized}` : normalized;
}
// Gera e retorna o relatório do usuário autenticado
router.get('/me', auth_1.authenticate, async (req, res) => {
    try {
        const typeParam = req.query.type?.toUpperCase();
        const type = typeParam === 'PARTIAL' ? 'PARTIAL' : 'FULL';
        const formatParam = req.query.format?.toUpperCase();
        const format = formatParam === 'DOCX' ? 'DOCX' : 'PDF';
        const topicIdsRaw = req.query.topicIds ?? undefined;
        const topicIds = topicIdsRaw
            ? topicIdsRaw
                .split(',')
                .map((s) => s.trim())
                .filter(Boolean)
            : undefined;
        const report = await reportServices_1.ReportService.generateUserReport(req.user.id, type, format, topicIds);
        // Monta URL pública baseada no caminho salvo
        const filePath = report.filePath;
        if (!filePath) {
            return res.status(500).json({ error: 'Falha ao localizar arquivo de relatório' });
        }
        const downloadUrl = buildPublicDownloadUrl(filePath);
        const signedUrl = (0, storage_1.getStorageProvider)() === 'supabase' ? await (0, storage_1.createSignedUrlForStoredPath)(filePath) : null;
        return res.json({
            report,
            url: `/${filePath.replace(/\\/g, '/')}`,
            downloadUrl,
            signedUrl,
        });
    }
    catch (error) {
        return res.status(400).json({ error: error.message || 'Erro ao gerar relatório' });
    }
});
// ADMIN: gera e retorna o relatório de um usuário específico (por ID)
router.get('/user/:id', auth_1.authenticate, async (req, res) => {
    try {
        if (req.user.role !== 'ADMIN') {
            return res.status(403).json({ error: 'Acesso negado' });
        }
        const { id } = req.params;
        const typeParam = req.query.type?.toUpperCase();
        const type = typeParam === 'PARTIAL' ? 'PARTIAL' : 'FULL';
        const formatParam = req.query.format?.toUpperCase();
        const format = formatParam === 'DOCX' ? 'DOCX' : 'PDF';
        const topicIdsRaw = req.query.topicIds ?? undefined;
        const topicIds = topicIdsRaw
            ? topicIdsRaw
                .split(',')
                .map((s) => s.trim())
                .filter(Boolean)
            : undefined;
        const report = await reportServices_1.ReportService.generateUserReport(id, type, format, topicIds);
        const filePath = report.filePath;
        if (!filePath) {
            return res.status(500).json({ error: 'Falha ao localizar arquivo de relatório' });
        }
        const downloadUrl = buildPublicDownloadUrl(filePath);
        const signedUrl = (0, storage_1.getStorageProvider)() === 'supabase' ? await (0, storage_1.createSignedUrlForStoredPath)(filePath) : null;
        return res.json({
            report,
            url: `/${filePath.replace(/\\/g, '/')}`,
            downloadUrl,
            signedUrl,
        });
    }
    catch (error) {
        return res.status(400).json({ error: error.message || 'Erro ao gerar relatório do usuário' });
    }
});
// ADMIN: gera relatório com base no novo PLD Builder
router.get('/pld-builder', auth_1.authenticate, async (req, res) => {
    try {
        if (req.user.role !== 'ADMIN') {
            return res.status(403).json({ error: 'Acesso negado' });
        }
        const formatParam = req.query.format?.toUpperCase();
        const format = formatParam === 'PDF' ? 'PDF' : 'DOCX';
        const report = await reportServices_1.ReportService.generatePldBuilderReport(req.user.id, format);
        const filePath = report.filePath;
        if (!filePath) {
            return res.status(500).json({ error: 'Falha ao localizar arquivo de relatório' });
        }
        const downloadUrl = buildPublicDownloadUrl(filePath);
        const signedUrl = (0, storage_1.getStorageProvider)() === 'supabase' ? await (0, storage_1.createSignedUrlForStoredPath)(filePath) : null;
        return res.json({
            report,
            url: `/${filePath.replace(/\\/g, '/')}`,
            downloadUrl,
            signedUrl,
        });
    }
    catch (error) {
        return res.status(400).json({ error: error.message || 'Erro ao gerar relatório do builder' });
    }
});
// Download direto de um relatório existente, se necessário
router.get('/:id/download', auth_1.authenticate, async (req, res) => {
    try {
        const { id } = req.params;
        // Apenas relatórios do próprio usuário
        const report = await reportServices_1.ReportService.getReportById(id);
        if (!report || report.userId !== req.user.id) {
            return res.status(404).json({ error: 'Relatório não encontrado' });
        }
        if (!report.filePath) {
            return res.status(404).json({ error: 'Arquivo de relatório não disponível' });
        }
        if ((0, storage_1.getStorageProvider)() === 'supabase') {
            const signedUrl = await (0, storage_1.createSignedUrlForStoredPath)(report.filePath);
            if (!signedUrl) {
                return res.status(404).json({ error: 'Arquivo de relatório não encontrado' });
            }
            return res.redirect(signedUrl);
        }
        const absolutePath = (0, paths_1.resolveFromUploads)(report.filePath);
        if (!fs_1.default.existsSync(absolutePath)) {
            return res.status(404).json({ error: 'Arquivo de relatório não encontrado no servidor' });
        }
        return res.download(absolutePath);
    }
    catch (error) {
        return res.status(400).json({ error: error.message || 'Erro ao baixar relatório' });
    }
});
exports.default = router;
