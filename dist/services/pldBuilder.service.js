"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.PldBuilderService = exports.ATTACHMENT_CATEGORIES = void 0;
const database_1 = __importDefault(require("../config/database"));
const path_1 = __importDefault(require("path"));
const paths_1 = require("../config/paths");
exports.ATTACHMENT_CATEGORIES = {
    NORMA: 'NORMA',
    TEMPLATE: 'TEMPLATE',
    RESPOSTA: 'RESPOSTA',
    DEFICIENCIA: 'DEFICIENCIA',
    TEST_REQUISICAO: 'TEST_REQUISICAO',
    TEST_RESPOSTA: 'TEST_RESPOSTA',
    TEST_AMOSTRA: 'TEST_AMOSTRA',
    TEST_EVIDENCIAS: 'TEST_EVIDENCIAS',
};
// NOTE: In some VS Code/TS server states, Prisma's generated delegates can appear stale
// even after `prisma generate`. Casting here avoids blocking editor diagnostics while
// keeping runtime behavior intact.
const prismaAny = database_1.default;
const coerceDateTime = (value) => {
    if (value === null || value === undefined)
        return value;
    if (typeof value !== 'string')
        return value;
    const trimmed = value.trim();
    if (!trimmed)
        return null;
    // `<input type="date" />` commonly sends `YYYY-MM-DD`.
    const isoLike = /^\d{4}-\d{2}-\d{2}$/.test(trimmed) ? `${trimmed}T00:00:00.000Z` : trimmed;
    const parsed = new Date(isoLike);
    if (Number.isNaN(parsed.getTime()))
        return null;
    return parsed.toISOString();
};
class PldBuilderService {
    static async listSections() {
        const sections = await prismaAny.pldSection.findMany({
            include: {
                attachments: true,
                questions: {
                    include: {
                        attachments: true,
                    },
                    orderBy: { order: 'asc' },
                },
            },
            orderBy: { order: 'asc' },
        });
        return sections;
    }
    static async createSection(data) {
        const count = await prismaAny.pldSection.count();
        return prismaAny.pldSection.create({
            data: {
                ...data,
                order: count,
            },
        });
    }
    static async updateSection(id, data) {
        return prismaAny.pldSection.update({ where: { id }, data });
    }
    static async deleteSection(id) {
        await prismaAny.pldSection.delete({ where: { id } });
        const remaining = await prismaAny.pldSection.findMany({ orderBy: { order: 'asc' } });
        await Promise.all(remaining.map((s, idx) => prismaAny.pldSection.update({ where: { id: s.id }, data: { order: idx } })));
    }
    static async reorderSections(sectionIds) {
        await Promise.all(sectionIds.map((id, idx) => prismaAny.pldSection.update({ where: { id }, data: { order: idx } })));
    }
    static async createQuestion(sectionId, texto) {
        const section = await prismaAny.pldSection.findUnique({ where: { id: sectionId } });
        if (!section)
            throw new Error('Seção não encontrada');
        const count = await prismaAny.pldQuestion.count({ where: { sectionId } });
        return prismaAny.pldQuestion.create({
            data: {
                sectionId,
                texto,
                order: count,
            },
        });
    }
    static async updateQuestion(id, data) {
        const cleaned = {
            ...data,
            actionDataApontamento: coerceDateTime(data?.actionDataApontamento),
            actionPrazoOriginal: coerceDateTime(data?.actionPrazoOriginal),
            actionPrazoAtual: coerceDateTime(data?.actionPrazoAtual),
        };
        return prismaAny.pldQuestion.update({ where: { id }, data: cleaned });
    }
    static async deleteQuestion(id) {
        const question = await prismaAny.pldQuestion.findUnique({ where: { id } });
        if (!question)
            return;
        await prismaAny.pldQuestion.delete({ where: { id } });
        const remaining = await prismaAny.pldQuestion.findMany({
            where: { sectionId: question.sectionId },
            orderBy: { order: 'asc' },
        });
        await Promise.all(remaining.map((q, idx) => prismaAny.pldQuestion.update({ where: { id: q.id }, data: { order: idx } })));
    }
    static async reorderQuestions(sectionId, ids) {
        await Promise.all(ids.map((id, idx) => prismaAny.pldQuestion.update({ where: { id, sectionId }, data: { order: idx } })));
    }
    static async addAttachment(params) {
        const { file, category, referenceText, sectionId, questionId } = params;
        if (!sectionId && !questionId) {
            throw new Error('sectionId ou questionId é obrigatório');
        }
        const relativePath = path_1.default
            .relative((0, paths_1.getUploadsRoot)(), file.path)
            .replace(/\\/g, '/')
            .replace(/^\/+/, '');
        const publicPath = relativePath ? `uploads/${relativePath}` : `uploads/${file.filename}`;
        // Para o builder, cada categoria representa um único arquivo (por seção/pergunta).
        // Evita duplicação ao salvar o builder várias vezes.
        await prismaAny.pldAttachment.deleteMany({
            where: {
                category,
                sectionId: sectionId ?? undefined,
                questionId: questionId ?? undefined,
            },
        });
        return prismaAny.pldAttachment.create({
            data: {
                sectionId,
                questionId,
                category,
                referenceText: referenceText || null,
                filename: file.filename,
                originalName: file.originalname,
                path: publicPath,
                mimeType: file.mimetype,
                size: file.size,
            },
        });
    }
    static async deleteAttachment(id) {
        await prismaAny.pldAttachment.delete({ where: { id } });
    }
    static async concludeBuilder() {
        // Start a new report cycle by clearing all builder data.
        // Order matters to satisfy FK constraints.
        await prismaAny.pldAttachment.deleteMany({});
        await prismaAny.pldQuestion.deleteMany({});
        await prismaAny.pldSection.deleteMany({});
    }
}
exports.PldBuilderService = PldBuilderService;
