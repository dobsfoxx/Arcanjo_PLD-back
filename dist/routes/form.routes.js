"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const path_1 = __importDefault(require("path"));
const form_services_1 = require("../services/form.services");
const upload_1 = require("../config/upload");
const fs_1 = __importDefault(require("fs"));
const database_1 = __importDefault(require("../config/database"));
const auth_1 = require("../middleware/auth");
const paths_1 = require("../config/paths");
const router = express_1.default.Router();
// =========== TÓPICOS ===========
router.post('/topics', auth_1.authenticate, auth_1.requireAdmin, async (req, res) => {
    try {
        const { name, description, internalNorm } = req.body;
        const userId = req.user.id;
        const topic = await form_services_1.FormService.createTopic(userId, name, description, internalNorm);
        res.status(201).json({ topic });
    }
    catch (error) {
        res.status(400).json({ error: error.message });
    }
});
router.get('/topics', auth_1.authenticate, async (req, res) => {
    try {
        const userId = req.user.id;
        const role = req.user.role;
        const topics = await form_services_1.FormService.getTopics(userId, role);
        res.json({ topics });
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
// Atualizar norma interna (texto + arquivo) de um tópico
router.post('/topics/:id/norm', auth_1.authenticate, upload_1.upload.single('file'), async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.user.id;
        const role = req.user.role;
        const topic = await database_1.default.topic.findUnique({ where: { id } });
        if (!topic) {
            return res.status(404).json({ error: 'Tópico não encontrado' });
        }
        if (topic.assignedToId !== userId) {
            return res.status(403).json({ error: 'Apenas o usuário designado pode editar a norma deste tópico' });
        }
        const { description, internalNorm, removeFile } = req.body;
        // IMPORTANTE: `internalNorm` é usado como nome/identificação do formulário (agrupamento).
        // A referência/descrição da norma interna do tópico deve ficar em `description`.
        const normReferenceText = (description ?? internalNorm) ?? null;
        const data = {
            description: typeof normReferenceText === 'string' && normReferenceText.trim() ? normReferenceText.trim() : null,
        };
        if (req.file) {
            const relativePath = path_1.default
                .relative((0, paths_1.getUploadsRoot)(), req.file.path)
                .replace(/\\/g, '/')
                .replace(/^\/+/, '');
            data.normFilename = req.file.filename;
            data.normOriginalName = req.file.originalname;
            data.normPath = relativePath;
            data.normMimeType = req.file.mimetype;
            data.normSize = req.file.size;
        }
        else if (removeFile === 'true') {
            data.normFilename = null;
            data.normOriginalName = null;
            data.normPath = null;
            data.normMimeType = null;
            data.normSize = null;
        }
        const updated = await database_1.default.topic.update({
            where: { id },
            data,
        });
        res.json({ topic: updated });
    }
    catch (error) {
        res.status(400).json({ error: error.message });
    }
});
// ADMIN: listar tópicos de um usuário específico para revisão
router.get('/topics/for-user/:id', auth_1.authenticate, auth_1.requireAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        const topics = await form_services_1.FormService.getTopicsByAssignee(id);
        res.json({ topics });
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
router.patch('/topics/reorder', auth_1.authenticate, auth_1.requireAdmin, async (req, res) => {
    try {
        const { topicIds } = req.body;
        await form_services_1.FormService.reorderTopics(topicIds);
        res.json({ message: 'Tópicos reordenados' });
    }
    catch (error) {
        res.status(400).json({ error: error.message });
    }
});
// Deletar tópico
router.delete('/topics/:id', auth_1.authenticate, auth_1.requireAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        await form_services_1.FormService.deleteTopic(id);
        res.json({ message: 'Tópico excluído com sucesso' });
    }
    catch (error) {
        res.status(400).json({ error: error.message });
    }
});
// Atribuir tópico a um usuário (ADMIN)
router.post('/topics/:id/assign', auth_1.authenticate, auth_1.requireAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        const { email } = req.body;
        const adminId = req.user.id;
        const topic = await form_services_1.FormService.assignTopicToUser(id, adminId, email);
        res.json({ topic });
    }
    catch (error) {
        res.status(400).json({ error: error.message });
    }
});
// Atribuir TODOS os tópicos criados pelo admin a um usuário (ADMIN)
router.post('/topics/assign-all', auth_1.authenticate, auth_1.requireAdmin, async (req, res) => {
    try {
        const { email } = req.body;
        const adminId = req.user.id;
        const topics = await form_services_1.FormService.assignAllTopicsToUser(adminId, email);
        res.json({ topics });
    }
    catch (error) {
        res.status(400).json({ error: error.message });
    }
});
// ADMIN: limpar arquivos da pasta uploads (exceto relatórios)
router.delete('/uploads/clean', auth_1.authenticate, auth_1.requireAdmin, async (_req, res) => {
    try {
        const uploadsDir = (0, paths_1.getUploadsRoot)();
        if (!fs_1.default.existsSync(uploadsDir)) {
            return res.json({ message: 'Nenhum diretório de uploads encontrado' });
        }
        const entries = fs_1.default.readdirSync(uploadsDir, { withFileTypes: true });
        entries.forEach(entry => {
            if (entry.name === 'reports') {
                return;
            }
            const target = path_1.default.join(uploadsDir, entry.name);
            fs_1.default.rmSync(target, { recursive: true, force: true });
        });
        return res.json({ message: 'Uploads removidos com sucesso (reports preservados)' });
    }
    catch (error) {
        return res.status(500).json({ error: error.message || 'Erro ao limpar uploads' });
    }
});
// =========== PERGUNTAS ===========
router.post('/questions', auth_1.authenticate, auth_1.requireAdmin, async (req, res) => {
    try {
        const { topicId, title, description, criticality, capitulation } = req.body;
        const question = await form_services_1.FormService.createQuestion(topicId, title, description, criticality, capitulation);
        res.status(201).json({ question });
    }
    catch (error) {
        res.status(400).json({ error: error.message });
    }
});
// ADMIN: anexar arquivo-modelo (em branco) para o usuário preencher
router.post('/questions/:id/template', auth_1.authenticate, auth_1.requireAdmin, upload_1.upload.single('file'), async (req, res) => {
    try {
        const { id } = req.params;
        const question = await database_1.default.question.findUnique({ where: { id } });
        if (!question) {
            return res.status(404).json({ error: 'Pergunta não encontrada' });
        }
        if (!req.file) {
            return res.status(400).json({ error: 'Nenhum arquivo enviado' });
        }
        const allowed = [
            'text/plain',
            'application/msword',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            'application/vnd.ms-excel',
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        ];
        if (!allowed.includes(req.file.mimetype)) {
            // Limpar arquivo se tipo não permitido
            if (fs_1.default.existsSync(req.file.path)) {
                fs_1.default.unlinkSync(req.file.path);
            }
            return res.status(400).json({
                error: 'Tipo de arquivo não permitido. Use TXT, XLSX, DOC ou DOCX.',
            });
        }
        const relativePath = path_1.default
            .relative((0, paths_1.getUploadsRoot)(), req.file.path)
            .replace(/\\/g, '/')
            .replace(/^\/+/, '');
        const updated = await database_1.default.question.update({
            where: { id },
            data: {
                templateFilename: req.file.filename,
                templateOriginalName: req.file.originalname,
                templatePath: relativePath,
                templateMimeType: req.file.mimetype,
                templateSize: req.file.size,
            },
        });
        res.json({ question: updated });
    }
    catch (error) {
        res.status(400).json({ error: error.message });
    }
});
// USER/ADMIN: baixar arquivo-modelo (força download)
router.get('/questions/:id/template/download', auth_1.authenticate, async (req, res) => {
    try {
        const { id } = req.params;
        const question = await database_1.default.question.findUnique({ where: { id } });
        if (!question) {
            return res.status(404).json({ error: 'Pergunta não encontrada' });
        }
        if (!question.templatePath) {
            return res.status(404).json({ error: 'Nenhum arquivo-modelo anexado' });
        }
        // NOTE: templatePath é salvo como caminho relativo (sem garantir prefixo 'uploads/')
        // e em produção UPLOAD_PATH pode estar fora do projeto.
        const resolvedPath = (0, paths_1.resolveFromUploads)(question.templatePath);
        if (!fs_1.default.existsSync(resolvedPath)) {
            return res.status(404).json({ error: 'Arquivo-modelo não encontrado no servidor' });
        }
        const downloadName = question.templateOriginalName || question.templateFilename || 'arquivo-modelo';
        return res.download(resolvedPath, downloadName);
    }
    catch (error) {
        res.status(400).json({ error: error.message });
    }
});
router.patch('/questions/:id/applicable', auth_1.authenticate, async (req, res) => {
    try {
        const { id } = req.params;
        const { isApplicable } = req.body;
        const actorId = req.user.id;
        const role = req.user.role;
        const question = await form_services_1.FormService.toggleQuestionApplicable(id, isApplicable, actorId, role);
        res.json({ question });
    }
    catch (error) {
        res.status(400).json({ error: error.message });
    }
});
router.patch('/questions/reorder', auth_1.authenticate, auth_1.requireAdmin, async (req, res) => {
    try {
        const { topicId, questionIds } = req.body;
        await form_services_1.FormService.reorderQuestions(topicId, questionIds);
        res.json({ message: 'Perguntas reordenadas' });
    }
    catch (error) {
        res.status(400).json({ error: error.message });
    }
});
// Deletar pergunta
router.delete('/questions/:id', auth_1.authenticate, auth_1.requireAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        await form_services_1.FormService.deleteQuestion(id);
        res.json({ message: 'Pergunta deletada com sucesso' });
    }
    catch (error) {
        res.status(400).json({ error: error.message });
    }
});
// Atualizar pergunta
router.put('/questions/:id', auth_1.authenticate, auth_1.requireAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        const data = req.body;
        const question = await form_services_1.FormService.updateQuestion(id, data);
        res.json({ question });
    }
    catch (error) {
        res.status(400).json({ error: error.message });
    }
});
router.post('/answers/:answerId/evidences', auth_1.authenticate, upload_1.uploadMultiple, async (req, res) => {
    try {
        const { answerId } = req.params;
        const files = req.files;
        const category = req.body?.category;
        if (!files || files.length === 0) {
            return res.status(400).json({ error: 'Nenhum arquivo enviado' });
        }
        // Verificar se resposta existe
        const answer = await database_1.default.answer.findUnique({
            where: { id: answerId }
        });
        if (!answer) {
            // Limpar arquivos enviados
            files.forEach(file => {
                if (fs_1.default.existsSync(file.path)) {
                    fs_1.default.unlinkSync(file.path);
                }
            });
            return res.status(404).json({ error: 'Resposta não encontrada' });
        }
        // Verificar se a resposta pertence ao usuário autenticado
        if (answer.userId !== req.user.id) {
            files.forEach(file => {
                if (fs_1.default.existsSync(file.path)) {
                    fs_1.default.unlinkSync(file.path);
                }
            });
            return res.status(403).json({ error: 'Não é permitido anexar evidências a respostas de outro usuário' });
        }
        // Salvar informações dos arquivos com caminho relativo para servir via /uploads
        const evidences = await Promise.all(files.map(async (file) => {
            const relative = path_1.default
                .relative((0, paths_1.getUploadsRoot)(), file.path)
                .replace(/\\/g, '/')
                .replace(/^\/+/, '');
            const publicPath = relative ? `uploads/${relative}` : `uploads/${file.filename}`;
            return await database_1.default.evidence.create({
                data: {
                    filename: file.filename,
                    originalName: file.originalname,
                    path: publicPath,
                    mimeType: file.mimetype,
                    size: file.size,
                    category: category ?? 'GENERAL',
                    answerId
                }
            });
        }));
        res.status(201).json({
            message: 'Arquivos enviados com sucesso',
            evidences
        });
    }
    catch (error) {
        // Limpar arquivos em caso de erro
        if (req.files) {
            const files = req.files;
            files.forEach(file => {
                if (fs_1.default.existsSync(file.path)) {
                    fs_1.default.unlinkSync(file.path);
                }
            });
        }
        res.status(500).json({
            error: 'Erro ao enviar arquivos',
            details: error.message
        });
    }
});
// =========== RESPOSTAS ===========
router.post('/answers', auth_1.authenticate, async (req, res) => {
    try {
        const { questionId, response, justification, testOption, testDescription, correctiveActionPlan } = req.body;
        const userId = req.user.id;
        const answer = await form_services_1.FormService.answerQuestion(questionId, userId, response, justification, testOption, testDescription, correctiveActionPlan);
        res.json({ answer });
    }
    catch (error) {
        res.status(400).json({ error: error.message });
    }
});
// ADMIN: atualizar resposta de um usuário específico durante a revisão
router.post('/admin/answers', auth_1.authenticate, auth_1.requireAdmin, async (req, res) => {
    try {
        const { questionId, assigneeId, response, justification, deficiency, recommendation, testOption, testDescription, correctiveActionPlan } = req.body;
        const answer = await form_services_1.FormService.adminUpdateAnswer(questionId, assigneeId, response, justification, deficiency, recommendation, testOption, testDescription, correctiveActionPlan);
        res.json({ answer });
    }
    catch (error) {
        res.status(400).json({ error: error.message });
    }
});
// USER: enviar respostas do tópico para revisão do administrador
router.post('/topics/:id/submit', auth_1.authenticate, async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.user.id;
        const topic = await form_services_1.FormService.submitTopic(id, userId);
        res.json({ topic });
    }
    catch (error) {
        res.status(400).json({ error: error.message });
    }
});
// USER: enviar TODOS os tópicos atribuídos para revisão do administrador
router.post('/topics/submit-all', auth_1.authenticate, async (req, res) => {
    try {
        const userId = req.user.id;
        const topics = await form_services_1.FormService.submitAllTopics(userId);
        res.json({ topics });
    }
    catch (error) {
        res.status(400).json({ error: error.message });
    }
});
// ADMIN: devolver tópico para usuário ajustar
router.post('/topics/:id/return', auth_1.authenticate, auth_1.requireAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        const adminId = req.user.id;
        const topic = await form_services_1.FormService.returnTopic(id, adminId);
        res.json({ topic });
    }
    catch (error) {
        res.status(400).json({ error: error.message });
    }
});
// ADMIN: devolver TODOS os tópicos enviados de um usuário para ajustes
router.post('/topics/return-all/:assigneeId', auth_1.authenticate, auth_1.requireAdmin, async (req, res) => {
    try {
        const { assigneeId } = req.params;
        const adminId = req.user.id;
        const topics = await form_services_1.FormService.returnAllTopicsForUser(assigneeId, adminId);
        res.json({ topics });
    }
    catch (error) {
        res.status(400).json({ error: error.message });
    }
});
// ADMIN: aprovar/concluir tópico
router.post('/topics/:id/approve', auth_1.authenticate, auth_1.requireAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        const adminId = req.user.id;
        const topic = await form_services_1.FormService.approveTopic(id, adminId);
        res.json({ topic });
    }
    catch (error) {
        res.status(400).json({ error: error.message });
    }
});
router.get('/answers/:questionId', auth_1.authenticate, async (req, res) => {
    try {
        const { questionId } = req.params;
        const userId = req.user.id;
        const answer = await form_services_1.FormService.getAnswer(questionId, userId);
        res.json({ answer });
    }
    catch (error) {
        res.status(404).json({ error: error.message });
    }
});
router.delete('/evidences/:id', auth_1.authenticate, async (req, res) => {
    try {
        const { id } = req.params;
        // Verifica se a evidência pertence a uma resposta do usuário
        const evidence = await database_1.default.evidence.findUnique({
            where: { id },
            include: { answer: true },
        });
        if (!evidence || evidence.answer.userId !== req.user.id) {
            return res.status(403).json({ error: 'Não é permitido remover evidências de outro usuário' });
        }
        await form_services_1.FormService.removeEvidence(id);
        res.json({ message: 'Evidência removida' });
    }
    catch (error) {
        res.status(400).json({ error: error.message });
    }
});
// =========== PROGRESSO ===========
router.get('/progress', auth_1.authenticate, async (req, res) => {
    try {
        const userId = req.user.id;
        const progress = await form_services_1.FormService.calculateProgress(userId);
        res.json({ progress });
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
router.get('/progress/topic/:topicId', auth_1.authenticate, async (req, res) => {
    try {
        const { topicId } = req.params;
        const userId = req.user.id;
        const progress = await form_services_1.FormService.calculateTopicProgress(topicId, userId);
        res.json({ progress });
    }
    catch (error) {
        res.status(404).json({ error: error.message });
    }
});
// =========== DADOS COMPLETOS ===========
router.get('/data', auth_1.authenticate, async (req, res) => {
    try {
        const userId = req.user.id;
        const data = await form_services_1.FormService.getFormData(userId);
        res.json({ data });
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
exports.default = router;
