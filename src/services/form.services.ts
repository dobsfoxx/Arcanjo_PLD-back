import prisma from '../config/database'

export class FormService {
  // =========== TÓPICOS ===========
  
 
  static async createTopic(name: string, description?: string, internalNorm?: string) {
    // Contar tópicos para definir ordem
    const count = await prisma.topic.count()
    
    return await prisma.topic.create({
      data: {
        name,
        description,
        internalNorm,
        order: count
      }
    })
  }
  
  // Listar todos tópicos com suas perguntas
  static async getTopics() {
    return await prisma.topic.findMany({
      where: { isActive: true },
      include: {
        questions: {
          include: {
            answer: {
              include: {
                evidences: true
              }
            }
          },
          orderBy: { order: 'asc' }
        }
      },
      orderBy: { order: 'asc' }
    })
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
    criticality: string = 'MEDIA'
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
        description,
        criticality,
        topicId,
        order: count
      }
    })
  }
  
  // Marcar pergunta como não aplicável
  static async toggleQuestionApplicable(questionId: string, isApplicable: boolean) {
    return await prisma.question.update({
      where: { id: questionId },
      data: { isApplicable }
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
    response: boolean, // Sim ou Não
    justification?: string,
    deficiency?: string,
    recommendation?: string
  ) {
    // Validar: se resposta = NÃO, deve ter deficiência e recomendação
    if (response === false) {
      if (!deficiency || !recommendation) {
        throw new Error('Para resposta "Não", é obrigatório informar deficiência e recomendação')
      }
    }
    
    // Verificar se pergunta existe
    const question = await prisma.question.findUnique({
      where: { id: questionId }
    })
    
    if (!question) {
      throw new Error('Pergunta não encontrado')
    }
    
    // Criar ou atualizar resposta
    const existingAnswer = await prisma.answer.findUnique({
      where: { questionId }
    })
    
    if (existingAnswer) {
      // Atualizar resposta existente
      return await prisma.answer.update({
        where: { id: existingAnswer.id },
        data: {
          response,
          justification,
          deficiency: response ? null : deficiency, // Só salva se for Não
          recommendation: response ? null : recommendation // Só salva se for Não
        }
      })
    } else {
      // Criar nova resposta SEM userId
      return await prisma.answer.create({
        data: {
          response,
          justification,
          deficiency: response ? null : deficiency,
          recommendation: response ? null : recommendation,
          questionId
          // ⚠️ Não passa userId - será NULL
        }
      })
    }
  }
  
  // Buscar resposta de uma pergunta
  static async getAnswer(questionId: string) {
    return await prisma.answer.findUnique({
      where: { questionId },
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
  static async calculateProgress() {
    const topics = await prisma.topic.findMany({
      where: { isActive: true },
      include: {
        questions: {
          include: {
            answer: true
          }
        }
      }
    })
    
    let totalApplicable = 0
    let totalAnswered = 0
    
    topics.forEach(topic => {
      topic.questions.forEach(question => {
        // Só conta perguntas aplicáveis
        if (question.isApplicable) {
          totalApplicable++
          if (question.answer) {
            totalAnswered++
          }
        }
      })
    })
    
    const progress = totalApplicable > 0 
      ? Math.round((totalAnswered / totalApplicable) * 100)
      : 0
    
    return {
      progress,
      totalApplicable,
      totalAnswered,
      totalQuestions: topics.reduce((acc, topic) => acc + topic.questions.length, 0)
    }
  }
  
  // Calcular progresso por tópico
  static async calculateTopicProgress(topicId: string) {
    const topic = await prisma.topic.findUnique({
      where: { id: topicId },
      include: {
        questions: {
          include: {
            answer: true
          }
        }
      }
    })
    
    if (!topic) {
      throw new Error('Tópico não encontrado')
    }
    
    
    const applicableQuestions = topic.questions.filter(q => q.isApplicable)
    const answeredQuestions = applicableQuestions.filter(q => q.answer)
    
    const progress = applicableQuestions.length > 0
      ? Math.round((answeredQuestions.length / applicableQuestions.length) * 100)
      : 0
    
    return {
      topicId: topic.id,
      topicName: topic.name,
      progress,
      applicableCount: applicableQuestions.length,
      answeredCount: answeredQuestions.length,
      totalQuestions: topic.questions.length
    }
  }
  
  // =========== DADOS DO FORMULÁRIO ===========
  
  // Pegar todos os dados do formulário (para relatório)
  static async getFormData() {
    return await prisma.topic.findMany({
      where: { isActive: true },
      include: {
        questions: {
          include: {
            answer: {
              include: {
                evidences: true
              }
            }
          },
          orderBy: { order: 'asc' }
        }
      },
      orderBy: { order: 'asc' }
    })
    
  }
  // Em src/services/form.service.ts

// Deletar pergunta
static async deleteQuestion(questionId: string) {
  const question = await prisma.question.delete({
    where: { id: questionId }
  });

  // Reordenar perguntas restantes do tópico
  const remainingQuestions = await prisma.question.findMany({
    where: { topicId: question.topicId },
    orderBy: { order: 'asc' }
  });

  await Promise.all(
    remainingQuestions.map((q, index) =>
      prisma.question.update({
        where: { id: q.id },
        data: { order: index }
      })
    )
  );

  return question;
}

// Atualizar pergunta
static async updateQuestion(
  questionId: string,
  data: {
    title?: string;
    description?: string;
    criticality?: string;
    normReference?: string;
    normFileUrl?: string;
  }
) {
  return await prisma.question.update({
    where: { id: questionId },
    data
  });
}
}