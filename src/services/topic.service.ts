import prisma from '../config/database'

export class TopicService {
  // Criar tópico
  static async create(userId: string, data: { name: string; description?: string; internalNorm?: string }) {
    // Contar tópicos do usuário para definir ordem
    const topicCount = await prisma.topic.count({
      where: { userId }
    })

    return await prisma.topic.create({
      data: {
        ...data,
        userId,
        order: topicCount
      }
    })
  }

  // Listar tópicos do usuário
  static async list(userId: string) {
    return await prisma.topic.findMany({
      where: { 
        userId,
        isActive: true 
      },
      include: {
        questions: {
          include: {
            answer: true
          },
          orderBy: { order: 'asc' }
        }
      },
      orderBy: { order: 'asc' }
    })
  }

  // Atualizar tópico
  static async update(id: string, userId: string, data: any) {
    return await prisma.topic.update({
      where: { 
        id,
        userId 
      },
      data
    })
  }

  // Deletar tópico (soft delete)
  static async delete(id: string, userId: string) {
    return await prisma.topic.update({
      where: { 
        id,
        userId 
      },
      data: { isActive: false }
    })
  }

  // Reordenar tópicos
  static async reorder(userId: string, topicIds: string[]) {
    const updates = topicIds.map((id, index) => {
      return prisma.topic.update({
        where: { 
          id,
          userId 
        },
        data: { order: index }
      })
    })

    await Promise.all(updates)
  }
}