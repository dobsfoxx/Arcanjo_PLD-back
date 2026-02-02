"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const auth_1 = require("../middleware/auth");
const validate_1 = require("../middleware/validate");
const upload_1 = require("../config/upload");
const pldBuilder_service_1 = require("../services/pldBuilder.service");
const publicError_1 = require("../utils/publicError");
const pldBuilder_schemas_1 = require("../validators/pldBuilder.schemas");
const router = express_1.default.Router();
// Listar seções com perguntas/arquivos
router.get('/sections', auth_1.authenticate, auth_1.requireBuilderAccess, async (req, res) => {
    try {
        const data = await pldBuilder_service_1.PldBuilderService.listSections(req.user);
        res.json({ sections: data });
    }
    catch (error) {
        res.status(500).json({ error: (0, publicError_1.toPublicErrorMessage)(error, 'Erro ao carregar seções') });
    }
});
router.post('/sections', auth_1.authenticate, auth_1.requireBuilderAccess, (0, validate_1.validateBody)(pldBuilder_schemas_1.createPldSectionSchema), async (req, res) => {
    try {
        const { item, customLabel, hasNorma, normaReferencia, descricao } = req.body;
        const section = await pldBuilder_service_1.PldBuilderService.createSection(req.user, {
            item,
            customLabel,
            hasNorma: !!hasNorma,
            normaReferencia,
            descricao,
        });
        res.status(201).json({ section });
    }
    catch (error) {
        res.status(400).json({ error: (0, publicError_1.toPublicErrorMessage)(error, 'Erro ao criar seção') });
    }
});
router.patch('/sections/:id', auth_1.authenticate, auth_1.requireBuilderAccess, (0, validate_1.validateBody)(pldBuilder_schemas_1.updatePldSectionSchema), async (req, res) => {
    try {
        const { id } = req.params;
        const section = await pldBuilder_service_1.PldBuilderService.updateSection(req.user, id, req.body);
        res.json({ section });
    }
    catch (error) {
        res.status(400).json({ error: (0, publicError_1.toPublicErrorMessage)(error, 'Erro ao atualizar seção') });
    }
});
router.post('/sections/reorder', auth_1.authenticate, auth_1.requireBuilderAccess, async (req, res) => {
    try {
        const { sectionIds } = req.body;
        await pldBuilder_service_1.PldBuilderService.reorderSections(req.user, sectionIds);
        res.json({ message: 'Ordem atualizada' });
    }
    catch (error) {
        res.status(400).json({ error: (0, publicError_1.toPublicErrorMessage)(error, 'Erro ao reordenar seções') });
    }
});
router.delete('/sections/:id', auth_1.authenticate, auth_1.requireBuilderAccess, async (req, res) => {
    try {
        const { id } = req.params;
        await pldBuilder_service_1.PldBuilderService.deleteSection(req.user, id);
        res.json({ message: 'Seção removida' });
    }
    catch (error) {
        res.status(400).json({ error: (0, publicError_1.toPublicErrorMessage)(error, 'Erro ao remover seção') });
    }
});
// Upload da norma interna
router.post('/sections/:id/norma', auth_1.authenticate, auth_1.requireBuilderAccess, upload_1.upload.single('file'), (0, validate_1.validateBody)(pldBuilder_schemas_1.uploadPldNormaSchema), async (req, res) => {
    try {
        const { id } = req.params;
        const { referencia } = req.body;
        const section = await pldBuilder_service_1.PldBuilderService.updateSection(req.user, id, {
            hasNorma: true,
            normaReferencia: referencia || null,
        });
        if (req.file) {
            await pldBuilder_service_1.PldBuilderService.addAttachment({
                actor: req.user,
                sectionId: id,
                file: req.file,
                category: pldBuilder_service_1.ATTACHMENT_CATEGORIES.NORMA,
                referenceText: referencia || null,
            });
        }
        res.json({ section });
    }
    catch (error) {
        res.status(400).json({ error: (0, publicError_1.toPublicErrorMessage)(error, 'Erro ao enviar norma') });
    }
});
// Perguntas
router.post('/questions', auth_1.authenticate, auth_1.requireBuilderAccess, (0, validate_1.validateBody)(pldBuilder_schemas_1.createPldQuestionSchema), async (req, res) => {
    try {
        const { sectionId, texto } = req.body;
        const question = await pldBuilder_service_1.PldBuilderService.createQuestion(req.user, sectionId, texto || '');
        res.status(201).json({ question });
    }
    catch (error) {
        res.status(400).json({ error: (0, publicError_1.toPublicErrorMessage)(error, 'Erro ao criar pergunta') });
    }
});
router.patch('/questions/:id', auth_1.authenticate, auth_1.requireBuilderAccess, (0, validate_1.validateBody)(pldBuilder_schemas_1.updatePldQuestionSchema), async (req, res) => {
    try {
        const { id } = req.params;
        const question = await pldBuilder_service_1.PldBuilderService.updateQuestion(req.user, id, req.body);
        res.json({ question });
    }
    catch (error) {
        res.status(400).json({ error: (0, publicError_1.toPublicErrorMessage)(error, 'Erro ao atualizar pergunta') });
    }
});
router.post('/questions/reorder', auth_1.authenticate, auth_1.requireBuilderAccess, async (req, res) => {
    try {
        const { sectionId, questionIds } = req.body;
        await pldBuilder_service_1.PldBuilderService.reorderQuestions(req.user, sectionId, questionIds);
        res.json({ message: 'Ordem atualizada' });
    }
    catch (error) {
        res.status(400).json({ error: (0, publicError_1.toPublicErrorMessage)(error, 'Erro ao reordenar perguntas') });
    }
});
router.delete('/questions/:id', auth_1.authenticate, auth_1.requireBuilderAccess, async (req, res) => {
    try {
        const { id } = req.params;
        await pldBuilder_service_1.PldBuilderService.deleteQuestion(req.user, id);
        res.json({ message: 'Pergunta removida' });
    }
    catch (error) {
        res.status(400).json({ error: (0, publicError_1.toPublicErrorMessage)(error, 'Erro ao remover pergunta') });
    }
});
// Upload genérico de arquivos (template, resposta, deficiência, teste)
router.post('/questions/:id/upload', auth_1.authenticate, auth_1.requireBuilderAccess, upload_1.upload.single('file'), (0, validate_1.validateBody)(pldBuilder_schemas_1.uploadPldAttachmentSchema), async (req, res) => {
    try {
        const { id } = req.params;
        const { category, referenceText } = req.body;
        if (!req.file) {
            return res.status(400).json({ error: 'Arquivo obrigatório' });
        }
        const att = await pldBuilder_service_1.PldBuilderService.addAttachment({
            actor: req.user,
            questionId: id,
            category,
            referenceText: referenceText || null,
            file: req.file,
        });
        res.status(201).json({ attachment: att });
    }
    catch (error) {
        res.status(400).json({ error: (0, publicError_1.toPublicErrorMessage)(error, 'Erro ao enviar arquivo') });
    }
});
router.delete('/attachments/:id', auth_1.authenticate, auth_1.requireBuilderAccess, async (req, res) => {
    try {
        const { id } = req.params;
        await pldBuilder_service_1.PldBuilderService.deleteAttachment(req.user, id);
        res.json({ message: 'Anexo removido' });
    }
    catch (error) {
        res.status(400).json({ error: (0, publicError_1.toPublicErrorMessage)(error, 'Erro ao remover anexo') });
    }
});
// BUILDER: iniciar novo formulário (apenas limpa o builder, sem salvar)
router.post('/reset', auth_1.authenticate, auth_1.requireBuilderAccess, async (req, res) => {
    try {
        await pldBuilder_service_1.PldBuilderService.concludeBuilder(req.user);
        res.json({ message: 'Builder limpo com sucesso' });
    }
    catch (error) {
        res.status(400).json({ error: (0, publicError_1.toPublicErrorMessage)(error, 'Erro ao limpar builder') });
    }
});
// Concluir relatório: limpa o builder para iniciar um novo
router.post('/conclude', auth_1.authenticate, auth_1.requireBuilderAccess, async (req, res) => {
    try {
        const { name, sentToEmail, helpTexts, metadata } = req.body;
        const saved = await pldBuilder_service_1.PldBuilderService.concludeBuilderAndSaveForm({
            name: name ?? '',
            sentToEmail: sentToEmail ?? null,
            helpTexts: helpTexts ?? null,
            metadata: metadata ?? null,
            createdById: req.user.id,
        });
        res.json({ message: 'Builder concluído, salvo e limpo com sucesso', form: { id: saved.id } });
    }
    catch (error) {
        res.status(400).json({ error: (0, publicError_1.toPublicErrorMessage)(error, 'Falha ao concluir relatório') });
    }
});
// BUILDER: listar formulários concluídos (salvos ao concluir)
router.get('/forms', auth_1.authenticate, auth_1.requireBuilderAccess, async (req, res) => {
    try {
        const forms = await pldBuilder_service_1.PldBuilderService.listConcludedForms(req.user);
        res.json({ forms });
    }
    catch (error) {
        res.status(400).json({ error: (0, publicError_1.toPublicErrorMessage)(error, 'Erro ao listar formulários') });
    }
});
// USER: listar formulários enviados para o usuário logado
router.get('/my-forms', auth_1.authenticate, async (req, res) => {
    try {
        const userEmail = req.user?.email;
        if (!userEmail) {
            return res.status(401).json({ error: 'Usuário não autenticado' });
        }
        const forms = await pldBuilder_service_1.PldBuilderService.listFormsForUser(userEmail);
        res.json({ forms });
    }
    catch (error) {
        res.status(400).json({ error: (0, publicError_1.toPublicErrorMessage)(error, 'Erro ao listar formulários') });
    }
});
// BUILDER: deletar formulário
router.delete('/forms/:id', auth_1.authenticate, auth_1.requireBuilderAccess, async (req, res) => {
    try {
        const { id } = req.params;
        await pldBuilder_service_1.PldBuilderService.deleteForm(id, req.user);
        res.json({ message: 'Formulário deletado com sucesso' });
    }
    catch (error) {
        res.status(400).json({ error: (0, publicError_1.toPublicErrorMessage)(error, 'Erro ao deletar formulário') });
    }
});
// BUILDER: ver um formulário concluído completo
router.get('/forms/:id', auth_1.authenticate, auth_1.requireBuilderAccess, async (req, res) => {
    try {
        const { id } = req.params;
        const form = await pldBuilder_service_1.PldBuilderService.getConcludedFormById(id, req.user);
        if (!form)
            return res.status(404).json({ error: 'Formulário não encontrado' });
        res.json({ form });
    }
    catch (error) {
        res.status(400).json({ error: error.message });
    }
});
// ADMIN: Enviar formulário para usuário
router.post('/forms/:id/send', auth_1.authenticate, auth_1.requireBuilderAccess, async (req, res) => {
    try {
        const { id } = req.params;
        const { email, helpTexts } = req.body;
        if (!email) {
            return res.status(400).json({ error: 'E-mail é obrigatório' });
        }
        await pldBuilder_service_1.PldBuilderService.sendFormToUser(id, email, req.user, helpTexts ?? null);
        res.json({ message: 'Formulário enviado com sucesso' });
    }
    catch (error) {
        res.status(400).json({ error: error.message });
    }
});
// USER: Obter formulário atribuído
router.get('/forms/:id/user', auth_1.authenticate, async (req, res) => {
    try {
        const { id } = req.params;
        const form = await pldBuilder_service_1.PldBuilderService.getUserForm(id, req.user.email);
        res.json({ form });
    }
    catch (error) {
        res.status(400).json({ error: error.message });
    }
});
// USER: Salvar respostas
router.post('/forms/:id/responses', auth_1.authenticate, async (req, res) => {
    try {
        const { id } = req.params;
        const { answers, sections, metadata } = req.body;
        await pldBuilder_service_1.PldBuilderService.saveUserFormResponses(id, req.user.email, answers, sections, metadata);
        res.json({ message: 'Respostas salvas com sucesso' });
    }
    catch (error) {
        res.status(400).json({ error: error.message });
    }
});
// USER: Concluir formulário (somente quando 100% preenchido)
router.post('/forms/:id/complete', auth_1.authenticate, async (req, res) => {
    try {
        const { id } = req.params;
        await pldBuilder_service_1.PldBuilderService.completeUserForm(id, req.user.email);
        res.json({ message: 'Formulário concluído com sucesso' });
    }
    catch (error) {
        res.status(400).json({ error: error.message });
    }
});
// USER: Remover formulário da lista do usuário (não deleta permanentemente)
router.delete('/forms/:id/user', auth_1.authenticate, async (req, res) => {
    try {
        const { id } = req.params;
        const userEmail = req.user?.email;
        if (!userEmail) {
            return res.status(401).json({ error: 'Usuário não autenticado' });
        }
        await pldBuilder_service_1.PldBuilderService.deleteUserForm(id, userEmail);
        res.json({ message: 'Formulário removido com sucesso' });
    }
    catch (error) {
        res.status(400).json({ error: (0, publicError_1.toPublicErrorMessage)(error, 'Erro ao remover formulário') });
    }
});
// USER: Upload de arquivo para uma questão do formulário
router.post('/forms/:id/upload', auth_1.authenticate, upload_1.upload.single('file'), async (req, res) => {
    try {
        const { id } = req.params;
        const { questionId, sectionId, category, referenceText } = req.body;
        if (!req.file) {
            return res.status(400).json({ error: 'Arquivo é obrigatório' });
        }
        if (!category) {
            return res.status(400).json({ error: 'Categoria é obrigatória' });
        }
        const result = await pldBuilder_service_1.PldBuilderService.uploadUserFormAttachment({
            formId: id,
            userEmail: req.user.email,
            questionId,
            sectionId,
            file: req.file,
            category,
            referenceText: referenceText || null,
        });
        res.json(result);
    }
    catch (error) {
        res.status(400).json({ error: error.message });
    }
});
exports.default = router;
