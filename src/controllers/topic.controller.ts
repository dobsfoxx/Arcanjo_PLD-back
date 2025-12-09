import { Request, Response } from 'express'
import { TopicService } from '../services/topic.service'

export class TopicController {
  // Criar tópico
  static async create(req: Request, res: Response) {
    try {
      const { name, description, internalNorm } = req.body
      const userId = req.user!.id

      const topic = await TopicService.create(userId, {
        name,
        description,
        internalNorm
      })

      res.status(201).json({
        message: 'Tópico criado com sucesso',
        topic
      })
    } catch (error) {
      res.status(500).json({
        error: 'Erro ao criar tópico'
      })
    }
  }

  // Listar tópicos
  static async list(req: Request, res: Response) {
    try {
      const topics = await TopicService.list(req.user!.id)

      res.json({
        topics
      })
    } catch (error) {
      res.status(500).json({
        error: 'Erro ao listar tópicos'
      })
    }
  }

  // Atualizar tópico
  static async update(req: Request, res: Response) {
    try {
      const { id } = req.params
      const data = req.body

      const topic = await TopicService.update(id, req.user!.id, data)

      res.json({
        message: 'Tópico atualizado com sucesso',
        topic
      })
    } catch (error) {
      res.status(500).json({
        error: 'Erro ao atualizar tópico'
      })
    }
  }

  // Deletar tópico
  static async delete(req: Request, res: Response) {
    try {
      const { id } = req.params

      await TopicService.delete(id, req.user!.id)

      res.json({
        message: 'Tópico deletado com sucesso'
      })
    } catch (error) {
      res.status(500).json({
        error: 'Erro ao deletar tópico'
      })
    }
  }

  // Reordenar tópicos
  static async reorder(req: Request, res: Response) {
    try {
      const { topicIds } = req.body

      await TopicService.reorder(req.user!.id, topicIds)

      res.json({
        message: 'Tópicos reordenados com sucesso'
      })
    } catch (error) {
      res.status(500).json({
        error: 'Erro ao reordenar tópicos'
      })
    }
  }
}