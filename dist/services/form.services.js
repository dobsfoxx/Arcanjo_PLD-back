"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.FormService = void 0;
const database_1 = __importDefault(require("../config/database"));
class FormService {
    // =========== TÓPICOS ===========
    static async createTopic(userId, name, description, internalNorm) {
        // Contar tópicos para definir ordem
        const count = await database_1.default.topic.count();
        return await database_1.default.topic.create({
            data: {
                name,
                description,
                internalNorm,
                order: count,
                userId,
            },
        });
    }
    // Listar tópicos com perguntas, trazendo apenas a resposta do usuário atual.
    // ADMIN vê todos os tópicos; USER só vê tópicos atribuídos a ele.
    static async getTopics(userId, role) {
        const where = { isActive: true };
        if (role !== 'ADMIN') {
            where.assignedToId = userId;
        }
        const topics = await database_1.default.topic.findMany({
            where,
            include: {
                assignedTo: {
                    select: { id: true, name: true, email: true },
                },
                questions: {
                    include: {
                        answers: {
                            where: { userId },
                            include: {
                                evidences: true,
                            },
                        },
                    },
                    orderBy: { order: 'asc' },
                },
            },
            orderBy: { order: 'asc' },
        });
        // Adaptar para o formato esperado pelo frontend: question.answer (única)
        const adapted = topics.map((topic) => ({
            ...topic,
            questions: topic.questions.map((question) => {
                const { answers, ...rest } = question;
                return {
                    ...rest,
                    answer: answers && answers.length > 0 ? answers[0] : null,
                };
            }),
        }));
        return adapted;
    }
    // Listar tópicos para revisão de um usuário específico (ADMIN)
    static async getTopicsByAssignee(assigneeId) {
        const topics = await database_1.default.topic.findMany({
            where: {
                isActive: true,
                assignedToId: assigneeId,
            },
            include: {
                assignedTo: {
                    select: { id: true, name: true, email: true },
                },
                questions: {
                    include: {
                        answers: {
                            where: { userId: assigneeId },
                            include: {
                                evidences: true,
                            },
                        },
                    },
                    orderBy: { order: 'asc' },
                },
            },
            orderBy: { order: 'asc' },
        });
        const adapted = topics.map((topic) => ({
            ...topic,
            questions: topic.questions.map((question) => {
                const { answers, ...rest } = question;
                return {
                    ...rest,
                    answer: answers && answers.length > 0 ? answers[0] : null,
                };
            }),
        }));
        return adapted;
    }
    // Reordenar tópicos
    static async reorderTopics(topicIds) {
        const updates = topicIds.map((id, index) => {
            return database_1.default.topic.update({
                where: { id },
                data: { order: index }
            });
        });
        await Promise.all(updates);
    }
    // Deletar tópico (cascateia perguntas/respostas/evidências via onDelete: Cascade)
    static async deleteTopic(topicId) {
        // Confirma existência
        const topic = await database_1.default.topic.findUnique({ where: { id: topicId } });
        if (!topic) {
            throw new Error('Tópico não encontrado');
        }
        // Deletar; cascade definido no schema
        await database_1.default.topic.delete({ where: { id: topicId } });
        // Reordenar restantes
        const remaining = await database_1.default.topic.findMany({ orderBy: { order: 'asc' } });
        await Promise.all(remaining.map((t, index) => database_1.default.topic.update({ where: { id: t.id }, data: { order: index } })));
        return { message: 'Tópico excluído' };
    }
    // =========== PERGUNTAS ===========
    // Criar pergunta em um tópico
    static async createQuestion(topicId, title, description, criticality = 'MEDIA', capitulation) {
        // Verificar se tópico existe
        const topic = await database_1.default.topic.findUnique({
            where: { id: topicId }
        });
        if (!topic) {
            throw new Error('Tópico não encontrado');
        }
        // Contar perguntas do tópico para ordem
        const count = await database_1.default.question.count({
            where: { topicId }
        });
        return await database_1.default.question.create({
            data: {
                title,
                capitulation: capitulation ? capitulation.slice(0, 200) : undefined,
                description,
                criticality,
                topicId,
                order: count
            }
        });
    }
    // Marcar pergunta como não aplicável
    static async toggleQuestionApplicable(questionId, isApplicable, actorId, actorRole) {
        if (actorRole === 'ADMIN') {
            return await database_1.default.question.update({
                where: { id: questionId },
                data: { isApplicable },
            });
        }
        const question = await database_1.default.question.findUnique({
            where: { id: questionId },
            include: { topic: true },
        });
        if (!question) {
            throw new Error('Pergunta não encontrada');
        }
        if (!question.topic?.assignedToId || question.topic.assignedToId !== actorId) {
            throw new Error('Não é permitido alterar perguntas de outro usuário');
        }
        // Usuário só pode alterar enquanto está preenchendo (ou ajustando após devolução)
        const status = question.topic.status;
        if (!status || !['ASSIGNED', 'IN_PROGRESS', 'RETURNED'].includes(status)) {
            throw new Error('Tópico não está em edição para alterar aplicabilidade');
        }
        return await database_1.default.question.update({
            where: { id: questionId },
            data: { isApplicable },
        });
    }
    // Reordenar perguntas dentro de um tópico
    static async reorderQuestions(topicId, questionIds) {
        const updates = questionIds.map((id, index) => {
            return database_1.default.question.update({
                where: {
                    id,
                    topicId // Garantir que pertence ao tópico
                },
                data: { order: index }
            });
        });
        await Promise.all(updates);
    }
    // =========== RESPOSTAS ===========
    static async answerQuestion(questionId, userId, response, // Sim ou Não
    justification, testOption, testDescription, correctiveActionPlan) {
        // Validações para o fluxo de teste
        if (testOption === 'SIM') {
            if (testDescription && testDescription.length > 300) {
                throw new Error('Descrição do teste deve ter até 300 caracteres');
            }
        }
        if (testOption === 'CORRETIVA') {
            if (!correctiveActionPlan || !correctiveActionPlan.trim()) {
                throw new Error('Plano de ação corretiva é obrigatório quando há plano em andamento');
            }
            if (correctiveActionPlan.length > 200) {
                throw new Error('Plano de ação corretiva deve ter até 200 caracteres');
            }
        }
        // Usuário só informa resposta e justificativa; deficiência/recomendação são preenchidas pelo admin na revisão
        // Verificar se pergunta existe e se o tópico está atribuído ao usuário
        const question = await database_1.default.question.findUnique({
            where: { id: questionId },
            include: {
                topic: true,
            },
        });
        if (!question) {
            throw new Error('Pergunta não encontrada');
        }
        if (!question.topic.assignedToId || question.topic.assignedToId !== userId) {
            throw new Error('Este tópico não está atribuído a você para resposta');
        }
        // Criar ou atualizar resposta do usuário
        const existingAnswer = await database_1.default.answer.findFirst({
            where: { questionId, userId },
        });
        if (existingAnswer) {
            // Atualizar resposta existente
            return await database_1.default.answer.update({
                where: { id: existingAnswer.id },
                data: {
                    response,
                    justification,
                    testOption,
                    testDescription,
                    correctiveActionPlan,
                }
            });
        }
        else {
            // Primeira resposta deste usuário neste tópico: marcar como EM ANDAMENTO
            if (question.topic.status === 'ASSIGNED' || question.topic.status === 'RETURNED') {
                await database_1.default.topic.update({
                    where: { id: question.topicId },
                    data: { status: 'IN_PROGRESS' },
                });
            }
            return await database_1.default.answer.create({
                data: {
                    response,
                    justification,
                    testOption,
                    testDescription,
                    correctiveActionPlan,
                    deficiency: null,
                    recommendation: null,
                    questionId,
                    userId,
                }
            });
        }
    }
    // ADMIN: atualizar resposta de um usuário específico durante revisão
    static async adminUpdateAnswer(questionId, assigneeId, response, justification, deficiency, recommendation, testOption, testDescription, correctiveActionPlan) {
        if (testOption === 'SIM') {
            if (testDescription && testDescription.length > 300) {
                throw new Error('Descrição do teste deve ter até 300 caracteres');
            }
        }
        if (testOption === 'CORRETIVA') {
            if (!correctiveActionPlan || !correctiveActionPlan.trim()) {
                throw new Error('Plano de ação corretiva é obrigatório quando há plano em andamento');
            }
            if (correctiveActionPlan.length > 200) {
                throw new Error('Plano de ação corretiva deve ter até 200 caracteres');
            }
        }
        if (response === false) {
            if (!deficiency || !recommendation) {
                throw new Error('Para resposta "Não", é obrigatório informar deficiência e recomendação');
            }
        }
        const question = await database_1.default.question.findUnique({
            where: { id: questionId },
            include: { topic: true },
        });
        if (!question) {
            throw new Error('Pergunta não encontrada');
        }
        if (!question.topic.assignedToId || question.topic.assignedToId !== assigneeId) {
            throw new Error('Tópico não está atribuído a este usuário');
        }
        const existingAnswer = await database_1.default.answer.findFirst({
            where: { questionId, userId: assigneeId },
            include: { evidences: true },
        });
        if (!existingAnswer) {
            throw new Error('Resposta do usuário não encontrada para esta pergunta');
        }
        return await database_1.default.answer.update({
            where: { id: existingAnswer.id },
            data: {
                response,
                justification,
                deficiency: response ? null : deficiency,
                recommendation: response ? null : recommendation,
                testOption,
                testDescription,
                correctiveActionPlan,
            },
            include: {
                evidences: true,
            },
        });
    }
    // Buscar resposta de uma pergunta
    static async getAnswer(questionId, userId) {
        return await database_1.default.answer.findFirst({
            where: { questionId, userId },
            include: {
                evidences: true
            }
        });
    }
    // =========== EVIDÊNCIAS (UPLOAD) ===========
    // Adicionar evidência a uma resposta
    static async addEvidence(answerId, filename, originalName, path, mimeType, size) {
        return await database_1.default.evidence.create({
            data: {
                filename,
                originalName,
                path,
                mimeType,
                size,
                answerId
            }
        });
    }
    // Remover evidência
    static async removeEvidence(evidenceId) {
        return await database_1.default.evidence.delete({
            where: { id: evidenceId }
        });
    }
    // =========== PROGRESSO ===========
    // Calcular progresso geral
    static async calculateProgress(userId) {
        const topics = await database_1.default.topic.findMany({
            where: { isActive: true },
            include: {
                questions: {
                    include: {
                        answers: {
                            where: { userId },
                        },
                    },
                },
            },
        });
        const topicList = topics || [];
        let totalApplicable = 0;
        let totalAnswered = 0;
        let totalQuestions = 0;
        for (const topic of topicList) {
            const questions = topic.questions || [];
            totalQuestions += questions.length;
            for (const question of questions) {
                if (question.isApplicable) {
                    totalApplicable++;
                    if (question.answers && question.answers.length > 0) {
                        totalAnswered++;
                    }
                }
            }
        }
        const progress = totalApplicable > 0
            ? Math.round((totalAnswered / totalApplicable) * 100)
            : 0;
        return {
            progress,
            totalApplicable,
            totalAnswered,
            totalQuestions,
        };
    }
    // Calcular progresso por tópico
    static async calculateTopicProgress(topicId, userId) {
        const topic = await database_1.default.topic.findUnique({
            where: { id: topicId },
            include: {
                questions: {
                    include: {
                        answers: {
                            where: { userId },
                        },
                    },
                },
            },
        });
        if (!topic) {
            throw new Error('Tópico não encontrado');
        }
        const applicableQuestions = topic.questions.filter((q) => q.isApplicable);
        const answeredQuestions = applicableQuestions.filter((q) => q.answers && q.answers.length > 0);
        const progress = applicableQuestions.length > 0
            ? Math.round((answeredQuestions.length / applicableQuestions.length) * 100)
            : 0;
        return {
            topicId: topic.id,
            topicName: topic.name,
            progress,
            applicableCount: applicableQuestions.length,
            answeredCount: answeredQuestions.length,
            totalQuestions: topic.questions.length
        };
    }
    // =========== DADOS DO FORMULÁRIO ===========
    // Pegar todos os dados do formulário (para relatório)
    static async getFormData(userId) {
        const topics = await database_1.default.topic.findMany({
            where: { isActive: true },
            include: {
                questions: {
                    include: {
                        answers: {
                            where: { userId },
                            include: {
                                evidences: true,
                            },
                        },
                    },
                    orderBy: { order: 'asc' },
                },
            },
            orderBy: { order: 'asc' },
        });
        const adapted = topics.map((topic) => ({
            ...topic,
            questions: topic.questions.map((question) => {
                const { answers, ...rest } = question;
                return {
                    ...rest,
                    answer: answers && answers.length > 0 ? answers[0] : null,
                };
            }),
        }));
        return adapted;
    }
    // Em src/services/form.service.ts
    // Deletar pergunta
    static async deleteQuestion(questionId) {
        const question = await database_1.default.question.delete({
            where: { id: questionId },
        });
        // Reordenar perguntas restantes do tópico
        const remainingQuestions = await database_1.default.question.findMany({
            where: { topicId: question.topicId },
            orderBy: { order: 'asc' },
        });
        await Promise.all(remainingQuestions.map((q, index) => database_1.default.question.update({
            where: { id: q.id },
            data: { order: index },
        })));
        return question;
    }
    // Atualizar pergunta
    static async updateQuestion(questionId, data) {
        return await database_1.default.question.update({
            where: { id: questionId },
            data,
        });
    }
    // =========== WORKFLOW DE TÓPICOS ===========
    // ADMIN: atribuir tópico a um usuário (por e-mail)
    static async assignTopicToUser(topicId, adminId, email) {
        const topic = (await database_1.default.topic.findUnique({ where: { id: topicId } }));
        if (!topic) {
            throw new Error('Tópico não encontrado');
        }
        // Opcional: garantir que o admin é o criador do tópico
        if (topic.userId !== adminId) {
            throw new Error('Apenas o criador do tópico pode atribuí-lo');
        }
        const user = await database_1.default.user.findUnique({ where: { email } });
        if (!user) {
            throw new Error('Usuário não encontrado para o e-mail informado');
        }
        // Usar any para evitar problemas de tipagem até o client ser regenerado
        const updated = await database_1.default.topic.update({
            where: { id: topicId },
            data: {
                assignedToId: user.id,
                status: 'ASSIGNED',
            },
            include: {
                assignedTo: {
                    select: { id: true, name: true, email: true },
                },
            },
        });
        return updated;
    }
    // ADMIN: atribuir TODOS os tópicos criados por ele a um usuário (por e-mail)
    static async assignAllTopicsToUser(adminId, email) {
        const user = await database_1.default.user.findUnique({ where: { email } });
        if (!user) {
            throw new Error('Usuário não encontrado para o e-mail informado');
        }
        const topics = await database_1.default.topic.findMany({
            where: {
                userId: adminId,
                isActive: true,
            },
        });
        if (!topics || topics.length === 0) {
            throw new Error('Nenhum tópico encontrado para este administrador');
        }
        await database_1.default.topic.updateMany({
            where: {
                userId: adminId,
                isActive: true,
            },
            data: {
                assignedToId: user.id,
                status: 'ASSIGNED',
            },
        });
        const updatedTopics = await database_1.default.topic.findMany({
            where: {
                userId: adminId,
                isActive: true,
            },
            include: {
                assignedTo: {
                    select: { id: true, name: true, email: true },
                },
            },
        });
        return updatedTopics;
    }
    // USER: enviar respostas para revisão do administrador
    static async submitTopic(topicId, userId) {
        const topic = await database_1.default.topic.findUnique({ where: { id: topicId } });
        if (!topic) {
            throw new Error('Tópico não encontrado');
        }
        if (!topic.assignedToId || topic.assignedToId !== userId) {
            throw new Error('Tópico não atribuído a este usuário');
        }
        if (topic.status !== 'IN_PROGRESS' && topic.status !== 'RETURNED') {
            throw new Error('Tópico não está em edição para ser enviado');
        }
        return await database_1.default.topic.update({
            where: { id: topicId },
            data: { status: 'SUBMITTED' },
        });
    }
    // USER: enviar TODOS os tópicos atribuídos para revisão do administrador
    static async submitAllTopics(userId) {
        const topics = await database_1.default.topic.findMany({
            where: {
                assignedToId: userId,
                isActive: true,
                status: {
                    in: ['IN_PROGRESS', 'RETURNED'],
                },
            },
        });
        if (!topics || topics.length === 0) {
            throw new Error('Não há tópicos em edição para enviar para revisão');
        }
        await database_1.default.topic.updateMany({
            where: {
                assignedToId: userId,
                isActive: true,
                status: {
                    in: ['IN_PROGRESS', 'RETURNED'],
                },
            },
            data: {
                status: 'SUBMITTED',
            },
        });
        const updated = await database_1.default.topic.findMany({
            where: {
                assignedToId: userId,
                isActive: true,
            },
        });
        return updated;
    }
    // ADMIN: devolver tópico para ajustes do usuário
    static async returnTopic(topicId, adminId) {
        const topic = await database_1.default.topic.findUnique({ where: { id: topicId } });
        if (!topic) {
            throw new Error('Tópico não encontrado');
        }
        // Permissão: a rota já exige admin (requireAdmin).
        // Regra de workflow: só pode devolver quando estiver em revisão.
        if (topic.status !== 'SUBMITTED' && topic.status !== 'IN_REVIEW') {
            throw new Error('Tópico não está enviado para revisão');
        }
        return await database_1.default.topic.update({
            where: { id: topicId },
            data: { status: 'RETURNED' },
        });
    }
    // ADMIN: devolver TODOS os tópicos enviados de um usuário para ajustes
    static async returnAllTopicsForUser(assigneeId, adminId) {
        await database_1.default.topic.updateMany({
            where: {
                assignedToId: assigneeId,
                isActive: true,
                status: {
                    in: ['SUBMITTED', 'IN_REVIEW'],
                },
            },
            data: { status: 'RETURNED' },
        });
        const updated = await database_1.default.topic.findMany({
            where: {
                assignedToId: assigneeId,
                isActive: true,
            },
        });
        return updated;
    }
    // ADMIN: aprovar/concluir tópico
    static async approveTopic(topicId, adminId) {
        const topic = await database_1.default.topic.findUnique({ where: { id: topicId } });
        if (!topic) {
            throw new Error('Tópico não encontrado');
        }
        // Permissão: a rota já exige admin (requireAdmin).
        if (topic.status !== 'SUBMITTED' && topic.status !== 'IN_REVIEW') {
            throw new Error('Tópico não está enviado para revisão');
        }
        return await database_1.default.topic.update({
            where: { id: topicId },
            data: { status: 'COMPLETED' },
        });
    }
}
exports.FormService = FormService;
