"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const auth_1 = require("../middleware/auth");
const upload_1 = require("../config/upload");
const pldBuilder_service_1 = require("../services/pldBuilder.service");
const router = express_1.default.Router();
// Listar seções com perguntas/arquivos
router.get('/sections', auth_1.authenticate, async (_req, res) => {
    try {
        const data = await pldBuilder_service_1.PldBuilderService.listSections();
        res.json({ sections: data });
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
router.post('/sections', auth_1.authenticate, auth_1.requireAdmin, async (req, res) => {
    try {
        const { item, customLabel, hasNorma, normaReferencia, descricao } = req.body;
        const section = await pldBuilder_service_1.PldBuilderService.createSection({
            item,
            customLabel,
            hasNorma: !!hasNorma,
            normaReferencia,
            descricao,
            createdById: req.user?.id,
        });
        res.status(201).json({ section });
    }
    catch (error) {
        res.status(400).json({ error: error.message });
    }
});
router.patch('/sections/:id', auth_1.authenticate, auth_1.requireAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        const section = await pldBuilder_service_1.PldBuilderService.updateSection(id, req.body);
        res.json({ section });
    }
    catch (error) {
        res.status(400).json({ error: error.message });
    }
});
router.post('/sections/reorder', auth_1.authenticate, auth_1.requireAdmin, async (req, res) => {
    try {
        const { sectionIds } = req.body;
        await pldBuilder_service_1.PldBuilderService.reorderSections(sectionIds);
        res.json({ message: 'Ordem atualizada' });
    }
    catch (error) {
        res.status(400).json({ error: error.message });
    }
});
router.delete('/sections/:id', auth_1.authenticate, auth_1.requireAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        await pldBuilder_service_1.PldBuilderService.deleteSection(id);
        res.json({ message: 'Seção removida' });
    }
    catch (error) {
        res.status(400).json({ error: error.message });
    }
});
// Upload da norma interna
router.post('/sections/:id/norma', auth_1.authenticate, auth_1.requireAdmin, upload_1.upload.single('file'), async (req, res) => {
    try {
        const { id } = req.params;
        const { referencia } = req.body;
        const section = await pldBuilder_service_1.PldBuilderService.updateSection(id, {
            hasNorma: true,
            normaReferencia: referencia || null,
        });
        if (req.file) {
            await pldBuilder_service_1.PldBuilderService.addAttachment({
                sectionId: id,
                file: req.file,
                category: pldBuilder_service_1.ATTACHMENT_CATEGORIES.NORMA,
                referenceText: referencia || null,
            });
        }
        res.json({ section });
    }
    catch (error) {
        res.status(400).json({ error: error.message });
    }
});
// Perguntas
router.post('/questions', auth_1.authenticate, auth_1.requireAdmin, async (req, res) => {
    try {
        const { sectionId, texto } = req.body;
        const question = await pldBuilder_service_1.PldBuilderService.createQuestion(sectionId, texto || '');
        res.status(201).json({ question });
    }
    catch (error) {
        res.status(400).json({ error: error.message });
    }
});
router.patch('/questions/:id', auth_1.authenticate, auth_1.requireAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        const question = await pldBuilder_service_1.PldBuilderService.updateQuestion(id, req.body);
        res.json({ question });
    }
    catch (error) {
        res.status(400).json({ error: error.message });
    }
});
router.post('/questions/reorder', auth_1.authenticate, auth_1.requireAdmin, async (req, res) => {
    try {
        const { sectionId, questionIds } = req.body;
        await pldBuilder_service_1.PldBuilderService.reorderQuestions(sectionId, questionIds);
        res.json({ message: 'Ordem atualizada' });
    }
    catch (error) {
        res.status(400).json({ error: error.message });
    }
});
router.delete('/questions/:id', auth_1.authenticate, auth_1.requireAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        await pldBuilder_service_1.PldBuilderService.deleteQuestion(id);
        res.json({ message: 'Pergunta removida' });
    }
    catch (error) {
        res.status(400).json({ error: error.message });
    }
});
// Upload genérico de arquivos (template, resposta, deficiência, teste)
router.post('/questions/:id/upload', auth_1.authenticate, auth_1.requireAdmin, upload_1.upload.single('file'), async (req, res) => {
    try {
        const { id } = req.params;
        const { category, referenceText } = req.body;
        if (!req.file) {
            return res.status(400).json({ error: 'Arquivo obrigatório' });
        }
        const att = await pldBuilder_service_1.PldBuilderService.addAttachment({
            questionId: id,
            category,
            referenceText: referenceText || null,
            file: req.file,
        });
        res.status(201).json({ attachment: att });
    }
    catch (error) {
        res.status(400).json({ error: error.message });
    }
});
router.delete('/attachments/:id', auth_1.authenticate, auth_1.requireAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        await pldBuilder_service_1.PldBuilderService.deleteAttachment(id);
        res.json({ message: 'Anexo removido' });
    }
    catch (error) {
        res.status(400).json({ error: error.message });
    }
});
// Concluir relatório: limpa o builder para iniciar um novo
router.post('/conclude', auth_1.authenticate, auth_1.requireAdmin, async (_req, res) => {
    try {
        await pldBuilder_service_1.PldBuilderService.concludeBuilder();
        res.json({ message: 'Builder concluído e limpo com sucesso' });
    }
    catch (error) {
        res.status(400).json({ error: error.message });
    }
});
exports.default = router;
