import express from 'express'
import { TopicController } from '../controllers/topic.controller'
import { authMiddleware } from '../middleware/auth.middleware'

const router = express.Router()

// Todas as rotas precisam de autenticação
router.use(authMiddleware)

// CRUD de tópicos
router.post('/', TopicController.create)
router.get('/', TopicController.list)
router.put('/:id', TopicController.update)
router.delete('/:id', TopicController.delete)
router.patch('/reorder', TopicController.reorder)

export default router