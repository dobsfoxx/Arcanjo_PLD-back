import { Request, Response, NextFunction } from 'express'
import jwt, { Secret } from 'jsonwebtoken'
import prisma from '../config/database'

interface JwtPayload {
  userId: string
}

const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '8h'

const rawSecret = process.env.JWT_SECRET

if (!rawSecret) {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('JWT_SECRET is required in production')
  }
  console.warn('[SECURITY] JWT_SECRET is not set; using a dev-only fallback secret')
}

const JWT_SECRET: Secret = (rawSecret || 'dev-only-change-me') as Secret

export function signToken(userId: string) {
  return (jwt as any).sign({ userId } as JwtPayload, JWT_SECRET, {
    expiresIn: JWT_EXPIRES_IN,
  })
}

export async function authenticate(req: Request, res: Response, next: NextFunction) {
  try {
    const authHeader = req.headers.authorization

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Token de autenticação não fornecido' })
    }

    const token = authHeader.split(' ')[1]

    let payload: JwtPayload
    try {
      payload = jwt.verify(token, JWT_SECRET) as JwtPayload
    } catch {
      return res.status(401).json({ error: 'Token inválido ou expirado' })
    }

    const user = await prisma.user.findUnique({ where: { id: payload.userId } })

    if (!user || !user.isActive) {
      return res.status(401).json({ error: 'Usuário não encontrado ou inativo' })
    }

    req.user = user
    return next()
  } catch (error) {
    console.error('Erro na autenticação:', error)
    return res.status(500).json({ error: 'Erro interno de autenticação' })
  }
}

export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (!req.user) {
    return res.status(401).json({ error: 'Não autenticado' })
  }

  if (req.user.role !== 'ADMIN') {
    return res.status(403).json({ error: 'Acesso restrito ao administrador' })
  }

  return next()
}
