/**
 * FormService - Serviço de Gerenciamento de Formulários PLD
 * 
 * Este serviço gerencia todas as operações relacionadas a formulários,
 * tópicos, questões, respostas e evidências no sistema PLD.
 * 
 * Principais funcionalidades:
 * - CRUD de tópicos e questões
 * - Gerenciamento de respostas e evidências
 * - Controle de atribuições de formulários
 * - Upload e exclusão de arquivos
 */
import prisma from '../config/database'

export class FormService {
  // =========== TÓPICOS ===========

  /**
   * Cria um novo tópico no formulário
   * @param userId - ID do usuário criador
   * @param name - Nome do tópico
   * @param description - Descrição opcional
   * @param internalNorm - Norma interna relacionada
   */
  static async createTopic(
    userId: string,
    name: string,
    description?: string,
    internalNorm?: string
  ) {
    // Conta tópicos existentes para definir ordem
    const count = await prisma.topic.count()

    return await prisma.topic.create({
      data: {
        name,
        description,
        internalNorm,
        order: count,
        userId,
      },
    })
  }

  /**
   * Lista tópicos com perguntas e respostas do usuário atual
   * ADMIN vê todos os tópicos; USER vê apenas os atribuídos a ele
   */
  static async getTopics(userId: string, role: string) {
    const where: any = { isActive: true }

    if (role !== 'ADMIN') {
      where.assignedToId = userId
    }

    const topics = await (prisma as any).topic.findMany({
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
    })

    // Adapta estrutura de tópico e pergunta para o frontend
    const adapted = (topics as any[]).map((topic: any) => ({
      ...topic,
      questions: (topic.questions as any[]).map((question: any) => {
        const { answers, ...rest } = question
        return {
          ...rest,
          answer: answers && answers.length > 0 ? answers[0] : null,
        }
      }),
    }))

    return adapted
  }

  // Listar tópicos para revisão de um usuário específico (ADMIN)
  static async getTopicsByAssignee(assigneeId: string) {
    const topics = await (prisma as any).topic.findMany({
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
    })

    const adapted = (topics as any[]).map((topic: any) => ({
      ...topic,
      questions: (topic.questions as any[]).map((question: any) => {
        const { answers, ...rest } = question
        return {
          ...rest,
          answer: answers && answers.length > 0 ? answers[0] : null,
        }
      }),
    }))

    return adapted
  }
  
  // Reordenar tópicos
  static async reorderTopics(topicIds: string[]) {
    const updates = topicIds.map((id, index) => {
      return prisma.topic.update({
        where: { id },
        data: { order: index }
      })
    })
    
    await Promise.all(updates)
  }

  // Deletar tópico (cascateia perguntas/respostas/evidências via onDelete: Cascade)
  static async deleteTopic(topicId: string) {
    // Confirma existência
    const topic = await prisma.topic.findUnique({ where: { id: topicId } })
    if (!topic) {
      throw new Error('Tópico não encontrado')
    }

    // Deletar; cascade definido no schema
    await prisma.topic.delete({ where: { id: topicId } })

    // Reordenar restantes
    const remaining = await prisma.topic.findMany({ orderBy: { order: 'asc' } })
    await Promise.all(
      remaining.map((t, index) =>
        prisma.topic.update({ where: { id: t.id }, data: { order: index } })
      )
    )

    return { message: 'Tópico excluído' }
  }
  
  // =========== PERGUNTAS ===========
  
  // Criar pergunta em um tópico
  static async createQuestion(
    topicId: string, 
    title: string, 
    description?: string, 
    criticality: string = 'MEDIA',
    capitulation?: string
  ) {
    // Verificar se tópico existe
    const topic = await prisma.topic.findUnique({
      where: { id: topicId }
    })
    
    if (!topic) {
      throw new Error('Tópico não encontrado')
    }
    
    // Contar perguntas do tópico para ordem
    const count = await prisma.question.count({
      where: { topicId }
    })
    
    return await prisma.question.create({
      data: {
        title,
        capitulation: capitulation ? capitulation.slice(0, 200) : undefined,
        description,
        criticality,
        topicId,
        order: count
      }
    })
  }
  
  // Marcar pergunta como não aplicável
  static async toggleQuestionApplicable(
    questionId: string,
    isApplicable: boolean,
    actorId: string,
    actorRole: string
  ) {
    if (actorRole === 'ADMIN') {
      return await prisma.question.update({
        where: { id: questionId },
        data: { isApplicable },
      })
    }

    const question = await (prisma as any).question.findUnique({
      where: { id: questionId },
      include: { topic: true },
    }) as any

    if (!question) {
      throw new Error('Pergunta não encontrada')
    }

    if (!question.topic?.assignedToId || question.topic.assignedToId !== actorId) {
      throw new Error('Não é permitido alterar perguntas de outro usuário')
    }

    // Usuário só pode alterar enquanto está preenchendo (ou ajustando após devolução)
    const status = question.topic.status as string | undefined
    if (!status || !['ASSIGNED', 'IN_PROGRESS', 'RETURNED'].includes(status)) {
      throw new Error('Tópico não está em edição para alterar aplicabilidade')
    }

    return await prisma.question.update({
      where: { id: questionId },
      data: { isApplicable },
    })
  }
  
  // Reordenar perguntas dentro de um tópico
  static async reorderQuestions(topicId: string, questionIds: string[]) {
    const updates = questionIds.map((id, index) => {
      return prisma.question.update({
        where: { 
          id,
          topicId // Garantir que pertence ao tópico
        },
        data: { order: index }
      })
    })
    
    await Promise.all(updates)
  }
  
  // =========== RESPOSTAS ===========
  
  static async answerQuestion(
    questionId: string,
    userId: string,
    response: boolean, // Sim ou Não
    justification?: string,
    testOption?: string,
    testDescription?: string,
    correctiveActionPlan?: string,
  ) {
    // Validações para o fluxo de teste
    if (testOption === 'SIM') {
      if (testDescription && testDescription.length > 600) {
        throw new Error('Descrição do teste deve ter até 600 caracteres')
      }
    }

    if (testOption === 'CORRETIVA') {
      if (!correctiveActionPlan || !correctiveActionPlan.trim()) {
        throw new Error('Plano de ação corretiva é obrigatório quando há plano em andamento')
      }
      if (correctiveActionPlan.length > 200) {
        throw new Error('Plano de ação corretiva deve ter até 200 caracteres')
      }
    }
    // Usuário só informa resposta e justificativa; deficiência/recomendação são preenchidas pelo admin na revisão
    
    // Verificar se pergunta existe e se o tópico está atribuído ao usuário
    const question = await (prisma as any).question.findUnique({
      where: { id: questionId },
      include: {
        topic: true,
      },
    }) as any

    if (!question) {
      throw new Error('Pergunta não encontrada')
    }

    if (!question.topic.assignedToId || question.topic.assignedToId !== userId) {
      throw new Error('Este tópico não está atribuído a você para resposta')
    }
    
    // Criar ou atualizar resposta do usuário
    const existingAnswer = await prisma.answer.findFirst({
      where: { questionId, userId },
    })
    
    if (existingAnswer) {
      // Atualizar resposta existente
      return await prisma.answer.update({
        where: { id: existingAnswer.id },
        data: {
          response,
          justification,
          testOption,
          testDescription,
          correctiveActionPlan,
        }
      })
    } else {
      // Primeira resposta deste usuário neste tópico: marcar como EM ANDAMENTO
      if (question.topic.status === 'ASSIGNED' || question.topic.status === 'RETURNED') {
        await (prisma as any).topic.update({
          where: { id: question.topicId },
          data: { status: 'IN_PROGRESS' },
        })
      }

      return await prisma.answer.create({
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
      })
    }
  }

  // ADMIN: atualizar resposta de um usuário específico durante revisão
  static async adminUpdateAnswer(
    questionId: string,
    assigneeId: string,
    response: boolean,
    justification?: string,
    deficiency?: string,
    recommendation?: string,
    testOption?: string,
    testDescription?: string,
    correctiveActionPlan?: string,
  ) {
    if (testOption === 'SIM') {
      if (testDescription && testDescription.length > 600) {
        throw new Error('Descrição do teste deve ter até 600 caracteres')
      }
    }

    if (testOption === 'CORRETIVA') {
      if (!correctiveActionPlan || !correctiveActionPlan.trim()) {
        throw new Error('Plano de ação corretiva é obrigatório quando há plano em andamento')
      }
      if (correctiveActionPlan.length > 200) {
        throw new Error('Plano de ação corretiva deve ter até 200 caracteres')
      }
    }
    if (response === false) {
      if (!deficiency || !recommendation) {
        throw new Error('Para resposta "Não", é obrigatório informar deficiência e recomendação')
      }
    }

    const question = await (prisma as any).question.findUnique({
      where: { id: questionId },
      include: { topic: true },
    }) as any

    if (!question) {
      throw new Error('Pergunta não encontrada')
    }

    if (!question.topic.assignedToId || question.topic.assignedToId !== assigneeId) {
      throw new Error('Tópico não está atribuído a este usuário')
    }

    const existingAnswer = await prisma.answer.findFirst({
      where: { questionId, userId: assigneeId },
      include: { evidences: true },
    })

    if (!existingAnswer) {
      throw new Error('Resposta do usuário não encontrada para esta pergunta')
    }

    return await prisma.answer.update({
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
    })
  }
  
  // Buscar resposta de uma pergunta
  static async getAnswer(questionId: string, userId: string) {
    return await prisma.answer.findFirst({
      where: { questionId, userId },
      include: {
        evidences: true
      }
    })
  }
  
  // =========== EVIDÊNCIAS (UPLOAD) ===========
  
  // Adicionar evidência a uma resposta
  static async addEvidence(
    answerId: string,
    filename: string,
    originalName: string,
    path: string,
    mimeType: string,
    size: number
  ) {
    return await prisma.evidence.create({
      data: {
        filename,
        originalName,
        path,
        mimeType,
        size,
        answerId
      }
    })
  }
  
  // Remover evidência
  static async removeEvidence(evidenceId: string) {
    return await prisma.evidence.delete({
      where: { id: evidenceId }
    })
  }
  
  // =========== PROGRESSO ===========
  
  // Calcular progresso geral
  static async calculateProgress(userId: string) {
    const [totalQuestions, totalApplicable, totalAnswered] = await Promise.all([
      prisma.question.count({
        where: { topic: { isActive: true } },
      }),
      prisma.question.count({
        where: { isApplicable: true, topic: { isActive: true } },
      }),
      prisma.answer.count({
        where: {
          userId,
          question: { isApplicable: true, topic: { isActive: true } },
        },
      }),
    ])

    const progress = totalApplicable > 0
      ? Math.round((totalAnswered / totalApplicable) * 100)
      : 0

    return {
      progress,
      totalApplicable,
      totalAnswered,
      totalQuestions,
    }
  }
  
  // Calcular progresso por tópico
  static async calculateTopicProgress(topicId: string, userId: string) {
    const topic = await (prisma as any).topic.findUnique({
      where: { id: topicId },
      select: { id: true, name: true },
    })

    if (!topic) {
      throw new Error('Tópico não encontrado')
    }

    const [totalQuestions, applicableCount, answeredCount] = await Promise.all([
      prisma.question.count({ where: { topicId } }),
      prisma.question.count({ where: { topicId, isApplicable: true } }),
      prisma.answer.count({
        where: {
          userId,
          question: { topicId, isApplicable: true },
        },
      }),
    ])

    const progress = applicableCount > 0
      ? Math.round((answeredCount / applicableCount) * 100)
      : 0

    return {
      topicId: topic.id,
      topicName: topic.name,
      progress,
      applicableCount,
      answeredCount,
      totalQuestions,
    }
  }
  
  // =========== DADOS DO FORMULÁRIO ===========
  
  // Pegar todos os dados do formulário (para relatório)
  static async getFormData(userId: string) {
    const topics = await (prisma as any).topic.findMany({
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
    })

    const adapted = (topics as any[]).map((topic: any) => ({
      ...topic,
      questions: (topic.questions as any[]).map((question: any) => {
        const { answers, ...rest } = question
        return {
          ...rest,
          answer: answers && answers.length > 0 ? answers[0] : null,
        }
      }),
    }))

    return adapted
  }
  // Em src/services/form.service.ts

  // Deletar pergunta
  static async deleteQuestion(questionId: string) {
    const question = await prisma.question.delete({
      where: { id: questionId },
    })

    // Reordenar perguntas restantes do tópico
    const remainingQuestions = await prisma.question.findMany({
      where: { topicId: question.topicId },
      orderBy: { order: 'asc' },
    })

    await Promise.all(
      remainingQuestions.map((q, index) =>
        prisma.question.update({
          where: { id: q.id },
          data: { order: index },
        })
      )
    )

    return question
  }

  // Atualizar pergunta
  static async updateQuestion(
    questionId: string,
    data: {
      title?: string
      description?: string
      criticality?: string
      normReference?: string
      normFileUrl?: string
    }
  ) {
    return await prisma.question.update({
      where: { id: questionId },
      data,
    })
  }

  // =========== WORKFLOW DE TÓPICOS ===========

  // ADMIN: atribuir tópico a um usuário (por e-mail)
  static async assignTopicToUser(topicId: string, adminId: string, email: string) {
    const topic = (await (prisma as any).topic.findUnique({ where: { id: topicId } })) as any
    if (!topic) {
      throw new Error('Tópico não encontrado')
    }

    // Opcional: garantir que o admin é o criador do tópico
    if (topic.userId !== adminId) {
      throw new Error('Apenas o criador do tópico pode atribuí-lo')
    }

    const user = await prisma.user.findUnique({ where: { email } })
    if (!user) {
      throw new Error('Usuário não encontrado para o e-mail informado')
    }

    // Usar any para evitar problemas de tipagem até o client ser regenerado
    const updated = await (prisma as any).topic.update({
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
    })

    return updated as any
  }

  // ADMIN: atribuir TODOS os tópicos criados por ele a um usuário (por e-mail)
  static async assignAllTopicsToUser(adminId: string, email: string) {
    const user = await prisma.user.findUnique({ where: { email } })
    if (!user) {
      throw new Error('Usuário não encontrado para o e-mail informado')
    }

    const topics = await prisma.topic.findMany({
      where: {
        userId: adminId,
        isActive: true,
      },
    })

    if (!topics || topics.length === 0) {
      throw new Error('Nenhum tópico encontrado para este administrador')
    }

    await (prisma as any).topic.updateMany({
      where: {
        userId: adminId,
        isActive: true,
      },
      data: {
        assignedToId: user.id,
        status: 'ASSIGNED',
      },
    })

    const updatedTopics = await (prisma as any).topic.findMany({
      where: {
        userId: adminId,
        isActive: true,
      },
      include: {
        assignedTo: {
          select: { id: true, name: true, email: true },
        },
      },
    })

    return updatedTopics as any
  }

  // USER: enviar respostas para revisão do administrador
  static async submitTopic(topicId: string, userId: string) {
    const topic = await prisma.topic.findUnique({ where: { id: topicId } })
    if (!topic) {
      throw new Error('Tópico não encontrado')
    }

    if (!(topic as any).assignedToId || (topic as any).assignedToId !== userId) {
      throw new Error('Tópico não atribuído a este usuário')
    }

    if ((topic as any).status !== 'IN_PROGRESS' && (topic as any).status !== 'RETURNED') {
      throw new Error('Tópico não está em edição para ser enviado')
    }

    return await (prisma as any).topic.update({
      where: { id: topicId },
      data: { status: 'SUBMITTED' },
    })
  }

  // USER: enviar TODOS os tópicos atribuídos para revisão do administrador
  static async submitAllTopics(userId: string) {
    const topics = await (prisma as any).topic.findMany({
      where: {
        assignedToId: userId,
        isActive: true,
        status: {
          in: ['IN_PROGRESS', 'RETURNED'],
        },
      },
    }) as any[]

    if (!topics || topics.length === 0) {
      throw new Error('Não há tópicos em edição para enviar para revisão')
    }

    await (prisma as any).topic.updateMany({
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
    })

    const updated = await (prisma as any).topic.findMany({
      where: {
        assignedToId: userId,
        isActive: true,
      },
    })

    return updated as any
  }

  // ADMIN: devolver tópico para ajustes do usuário
  static async returnTopic(topicId: string, adminId: string) {
    const topic = await (prisma as any).topic.findUnique({ where: { id: topicId } }) as any
    if (!topic) {
      throw new Error('Tópico não encontrado')
    }

    // Permissão: a rota já exige admin (requireAdmin).
    // Regra de workflow: só pode devolver quando estiver em revisão.
    if (topic.status !== 'SUBMITTED' && topic.status !== 'IN_REVIEW') {
      throw new Error('Tópico não está enviado para revisão')
    }

    return await (prisma as any).topic.update({
      where: { id: topicId },
      data: { status: 'RETURNED' },
    })
  }

  // ADMIN: devolver TODOS os tópicos enviados de um usuário para ajustes
  static async returnAllTopicsForUser(assigneeId: string, adminId: string) {
    await (prisma as any).topic.updateMany({
      where: {
        assignedToId: assigneeId,
        isActive: true,
        status: {
          in: ['SUBMITTED', 'IN_REVIEW'],
        },
      },
      data: { status: 'RETURNED' },
    })

    const updated = await (prisma as any).topic.findMany({
      where: {
        assignedToId: assigneeId,
        isActive: true,
      },
    })

    return updated as any
  }

  // ADMIN: aprovar/concluir tópico
  static async approveTopic(topicId: string, adminId: string) {
    const topic = await (prisma as any).topic.findUnique({ where: { id: topicId } }) as any
    if (!topic) {
      throw new Error('Tópico não encontrado')
    }

    // Permissão: a rota já exige admin (requireAdmin).
    if (topic.status !== 'SUBMITTED' && topic.status !== 'IN_REVIEW') {
      throw new Error('Tópico não está enviado para revisão')
    }

    return await (prisma as any).topic.update({
      where: { id: topicId },
      data: { status: 'COMPLETED' },
    })
  }
}