import express from 'express'
import { AuthController } from '../controllers/auth.controller'
import { authMiddleware } from '../middleware/auth.middleware'

const router = express.Router()

// Rotas públicas
router.post('/register', AuthController.register)
router.post('/login', AuthController.login)

// Rotas protegidas
router.get('/profile', authMiddleware, AuthController.profile)

export default router