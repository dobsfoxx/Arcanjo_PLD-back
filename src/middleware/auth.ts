/**
 * Middleware de Autenticação JWT
 * 
 * Este módulo gerencia toda a autenticação do sistema PLD,
 * incluindo geração e validação de tokens JWT, verificação
 * de assinaturas e controle de acesso baseado em roles.
 * 
 * Tokens podem ser enviados via:
 * - Header Authorization: Bearer <token>
 * - Cookie HttpOnly: pld_token
 * - Query string: ?token=<token> (apenas para downloads)
 */
import { Request, Response, NextFunction } from 'express'
import jwt, { Secret } from 'jsonwebtoken'
import prisma from '../config/database'

// Estrutura do payload do token JWT
interface JwtPayload {
  userId: string
}

// Tempo de expiração do token (padrão: 8 horas)
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '8h'

const rawSecret = process.env.JWT_SECRET

// Validação obrigatória do JWT_SECRET em produção
if (!rawSecret) {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('JWT_SECRET is required in production')
  }
  console.warn('[SECURITY] JWT_SECRET is not set; using a dev-only fallback secret')
}

const JWT_SECRET: Secret = (rawSecret || 'dev-only-change-me') as Secret

/**
 * Gera um token JWT para o usuário especificado
 * @param userId - ID do usuário para incluir no token
 * @returns Token JWT assinado
 */
export function signToken(userId: string) {
  return (jwt as any).sign({ userId } as JwtPayload, JWT_SECRET, {
    expiresIn: JWT_EXPIRES_IN,
    algorithm: 'HS256',
  })
}

/**
 * Middleware principal de autenticação
 * Valida o token e carrega os dados do usuário na requisição
 */
export async function authenticate(req: Request, res: Response, next: NextFunction) {
  try {
    const token = getTokenFromRequest(req)

    if (!token) {
      return res.status(401).json({ error: 'Token de autenticação não fornecido' })
    }

    let payload: JwtPayload
    try {
      payload = jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'] }) as JwtPayload
    } catch {
      return res.status(401).json({ error: 'Token inválido ou expirado' })
    }

    // Busca dados completos do usuário no banco
    const user = await prisma.user.findUnique({
      where: { id: payload.userId },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        isTrial: true,
        trialExpiresAt: true,
        subscriptionStatus: true,
        subscriptionExpiresAt: true,
        stripeCustomerId: true,
        stripeSubscriptionId: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
      },
    })

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

function getTokenFromRequest(req: Request): string | null {
  const rawAuth = (req.headers as any).authorization as string | string[] | undefined
  const authHeader = Array.isArray(rawAuth) ? rawAuth[0] : rawAuth
  if (authHeader && typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) {
    const token = authHeader.split(' ')[1]
    return token || null
  }

  const tokenFromCookie = (req as any).cookies?.pld_token || (req as any).cookies?.auth_token
  if (tokenFromCookie && typeof tokenFromCookie === 'string' && tokenFromCookie.trim()) {
    return tokenFromCookie.trim()
  }

  return null
}

function getBearerTokenFromRequest(req: Request): string | null {
  const authHeader = req.headers.authorization

  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.split(' ')[1]
    return token || null
  }

  const tokenFromQuery = (req.query?.token as string | undefined) || (req.query?.access_token as string | undefined)
  return tokenFromQuery && tokenFromQuery.trim() ? tokenFromQuery.trim() : null
}

export async function authenticateFromHeaderOrQuery(req: Request, res: Response, next: NextFunction) {
  try {
    const token = getTokenFromRequest(req) || getBearerTokenFromRequest(req)

    if (!token) {
      return res.status(401).json({ error: 'Token de autenticação não fornecido' })
    }

    let payload: JwtPayload
    try {
      payload = jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'] }) as JwtPayload
    } catch {
      return res.status(401).json({ error: 'Token inválido ou expirado' })
    }

    const user = await prisma.user.findUnique({
      where: { id: payload.userId },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        isTrial: true,
        trialExpiresAt: true,
        subscriptionStatus: true,
        subscriptionExpiresAt: true,
        stripeCustomerId: true,
        stripeSubscriptionId: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
      },
    })

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

function isTrialActive(user: { isTrial: boolean; trialExpiresAt: Date | null }) {
  if (!user.isTrial) return false
  if (!user.trialExpiresAt) return false
  return user.trialExpiresAt.getTime() > Date.now()
}

function hasActiveSubscription(user: { subscriptionStatus?: string | null; subscriptionExpiresAt?: Date | null }) {
  if ((user.subscriptionStatus || '').toUpperCase() !== 'ACTIVE') return false
  if (!user.subscriptionExpiresAt) return true
  return user.subscriptionExpiresAt.getTime() > Date.now()
}

export function requireBuilderAccess(req: Request, res: Response, next: NextFunction) {
  if (!req.user) {
    return res.status(401).json({ error: 'Não autenticado' })
  }

  if (req.user.role === 'ADMIN') {
    return next()
  }

  if (req.user.role === 'TRIAL_ADMIN') {
    if (isTrialActive(req.user)) return next()
    return res.status(403).json({ error: 'Seu período de teste expirou. Finalize o pagamento para continuar.', code: 'TRIAL_EXPIRED' })
  }

  if (hasActiveSubscription(req.user as any)) {
    return next()
  }

  return res.status(403).json({ error: 'Acesso ao builder restrito. Faça upgrade para continuar.', code: 'PAYMENT_REQUIRED' })
}
