import { Request, Response, NextFunction } from 'express'
import { AuthService } from '../services/auth.services'

export const authMiddleware = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const authHeader = req.headers.authorization

    if (!authHeader) {
      return res.status(401).json({
        error: 'Token não fornecido'
      })
    }

    const token = authHeader.split(' ')[1]

    if (!token) {
      return res.status(401).json({
        error: 'Token mal formatado'
      })
    }

    const user = await AuthService.validateToken(token)

    if (!user) {
      return res.status(401).json({
        error: 'Token inválido ou expirado'
      })
    }

    // Adicionar usuário à requisição
    req.user = user
    next()
  } catch (error) {
    res.status(401).json({
      error: 'Falha na autenticação'
    })
  }
}