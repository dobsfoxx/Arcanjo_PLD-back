import { Request, Response } from 'express'
import { AuthService } from '../services/auth.services'

export class AuthController {
  // Registrar usuário
  static async register(req: Request, res: Response) {
    try {
      const { email, password, name } = req.body

      // Validação básica
      if (!email || !password || !name) {
        return res.status(400).json({
          error: 'Email, senha e nome são obrigatórios'
        })
      }

      const { user, token } = await AuthService.register(email, password, name)

      res.status(201).json({
        message: 'Usuário criado com sucesso',
        user,
        token
      })
    } catch (error: any) {
      res.status(400).json({
        error: error.message || 'Erro ao criar usuário'
      })
    }
  }

  // Login
  static async login(req: Request, res: Response) {
    try {
      const { email, password } = req.body

      if (!email || !password) {
        return res.status(400).json({
          error: 'Email e senha são obrigatórios'
        })
      }

      const { user, token } = await AuthService.login(email, password)

      res.json({
        message: 'Login realizado com sucesso',
        user,
        token
      })
    } catch (error: any) {
      res.status(401).json({
        error: error.message || 'Erro ao fazer login'
      })
    }
  }

  // Perfil do usuário
  static async profile(req: Request, res: Response) {
    try {
      res.json({
        user: req.user
      })
    } catch (error) {
      res.status(500).json({
        error: 'Erro ao buscar perfil'
      })
    }
  }
}