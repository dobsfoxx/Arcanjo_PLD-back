import express from 'express'
import { OAuth2Client } from 'google-auth-library'
import rateLimit from 'express-rate-limit'
import { AuthService } from '../services/auth.service'
import { authenticate, requireAdmin } from '../middleware/auth'
import { validateBody } from '../middleware/validate'
import {
  bootstrapAdminSchema,
  forgotPasswordSchema,
  googleSchema,
  loginSchema,
  registerSchema,
  resetPasswordSchema,
} from '../validators/auth.schemas'
import prisma from '../config/database'

const router = express.Router()

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Muitas tentativas. Aguarde alguns minutos e tente novamente.' },
})

const passwordLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Muitas tentativas. Tente novamente mais tarde.' },
})

const googleClientId = (process.env.GOOGLE_CLIENT_ID || '').trim()
const googleClient = googleClientId ? new OAuth2Client(googleClientId) : null

function requireBootstrapToken(req: express.Request, res: express.Response): boolean {
  const allowBootstrap = (process.env.ALLOW_BOOTSTRAP_ADMIN || '').toLowerCase() === 'true'
  if (!allowBootstrap && process.env.NODE_ENV === 'production') {
    res.status(403).json({ error: 'Bootstrap admin desativado' })
    return false
  }

  const expected = (process.env.BOOTSTRAP_ADMIN_TOKEN || '').trim()
  if (!expected) {
    if (process.env.NODE_ENV === 'production') {
      res.status(403).json({ error: 'Bootstrap admin requer token' })
      return false
    }
    return true
  }

  const provided = (req.headers['x-bootstrap-token'] as string | undefined)?.trim()
  if (!provided || provided !== expected) {
    res.status(403).json({ error: 'Token de bootstrap inválido' })
    return false
  }

  return true
}

function setAuthCookie(res: express.Response, token: string) {
  const isProd = process.env.NODE_ENV === 'production'
  const maxAgeMs = Number.parseInt(process.env.JWT_COOKIE_MAX_AGE_MS || '', 10)
  res.cookie('pld_token', token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: isProd,
    path: '/',
    ...(Number.isFinite(maxAgeMs) && maxAgeMs > 0 ? { maxAge: maxAgeMs } : {}),
  })
}

function clearAuthCookie(res: express.Response) {
  const isProd = process.env.NODE_ENV === 'production'
  res.clearCookie('pld_token', {
    httpOnly: true,
    sameSite: 'lax',
    secure: isProd,
    path: '/',
  })
}

router.post('/register', authLimiter, validateBody(registerSchema), async (req, res) => {
  try {
    const { name, email, password, startTrial } = req.body

    if (!name || !email || !password) {
      return res.status(400).json({ error: 'Nome, e-mail e senha são obrigatórios' })
    }

    const { user, token } = await AuthService.registerUser(name, email, password, { startTrial: !!startTrial })

    const { password: _pw, ...safeUser } = user

    setAuthCookie(res, token)
    res.status(201).json({
      token,
      user: safeUser,
    })
  } catch (error: any) {
    console.error('[AUTH] register failed:', error)
    const msg = typeof error?.message === 'string' ? error.message : ''
    const safeMessage =
      msg === 'E-mail já está em uso' ||
      msg === 'A senha deve ter pelo menos 8 caracteres e conter letra maiúscula, minúscula, número e símbolo'
        ? msg
        : 'Erro ao registrar usuário'
    res.status(400).json({ error: safeMessage })
  }
})

router.post('/login', authLimiter, validateBody(loginSchema), async (req, res) => {
  try {
    const { email, password } = req.body

    if (!email || !password) {
      return res.status(400).json({ error: 'E-mail e senha são obrigatórios' })
    }

    const { user, token } = await AuthService.login(email, password)
    const { password: _pw, ...safeUser } = user

    setAuthCookie(res, token)
    res.json({
      token,
      user: safeUser,
    })
  } catch (error: any) {
    console.error('[AUTH] login failed:', error)
    const msg = typeof error?.message === 'string' ? error.message : ''
    const safeMessage = msg === 'Credenciais inválidas' || msg === 'Usuário inativo' ? msg : 'Erro ao autenticar'
    res.status(401).json({ error: safeMessage })
  }
})

// Endpoint para criação do primeiro administrador
router.post('/bootstrap-admin', authLimiter, validateBody(bootstrapAdminSchema), async (req, res) => {
  try {
    if (!requireBootstrapToken(req, res)) return
    const { name, email, password } = req.body

    if (!name || !email || !password) {
      return res.status(400).json({ error: 'Nome, e-mail e senha são obrigatórios' })
    }

    const { user, token } = await AuthService.bootstrapAdmin(name, email, password)
    const { password: _pw, ...safeUser } = user

    setAuthCookie(res, token)
    res.status(201).json({
      token,
      user: safeUser,
    })
  } catch (error: any) {
    console.error('[AUTH] bootstrap-admin failed:', error)
    const msg = typeof error?.message === 'string' ? error.message : ''
    const safeMessage =
      msg === 'Já existe um administrador cadastrado' ||
      msg === 'Senha do administrador deve ter pelo menos 12 caracteres e conter letra maiúscula, minúscula, número e símbolo'
        ? msg
        : 'Erro ao criar administrador'
    res.status(400).json({ error: safeMessage })
  }
})

// Esqueci minha senha - solicita envio de e-mail com link de recuperação
router.post('/forgot-password', passwordLimiter, validateBody(forgotPasswordSchema), async (req, res) => {
  try {
    const { email } = req.body

    if (!email) {
      return res.status(400).json({ error: 'E-mail é obrigatório' })
    }

    await AuthService.requestPasswordReset(email)

    // Sempre responder sucesso para não expor se o e-mail existe ou não
    res.json({ message: 'Se existir uma conta com este e-mail, enviaremos instruções de recuperação.' })
  } catch (error: any) {
    console.error('[AUTH] forgot-password failed:', error)
    res.status(500).json({ error: 'Erro ao solicitar recuperação de senha' })
  }
})

// Redefinir senha usando token recebido por e-mail
router.post('/reset-password', passwordLimiter, validateBody(resetPasswordSchema), async (req, res) => {
  try {
    const { token, password } = req.body

    if (!token || !password) {
      return res.status(400).json({ error: 'Token e nova senha são obrigatórios' })
    }

    await AuthService.resetPassword(token, password)
    res.json({ message: 'Senha redefinida com sucesso. Você já pode fazer login com a nova senha.' })
  } catch (error: any) {
    console.error('[AUTH] reset-password failed:', error)
    const msg = typeof error?.message === 'string' ? error.message : ''
    const safeMessage =
      msg === 'A senha deve ter pelo menos 8 caracteres e conter letra maiúscula, minúscula, número e símbolo' ||
      msg === 'Token de recuperação inválido ou expirado'
        ? msg
        : 'Erro ao redefinir senha'
    res.status(400).json({ error: safeMessage })
  }
})

// Login com Google OAuth
router.post('/google', authLimiter, validateBody(googleSchema), async (req, res) => {
  try {
    const { credential } = req.body

    let payload: any | null = null
    if (googleClient) {
      const ticket = await googleClient.verifyIdToken({
        idToken: credential,
        audience: googleClientId,
      })
      payload = ticket.getPayload() || null
    } else {
      if (process.env.NODE_ENV === 'production') {
        return res.status(500).json({ error: 'Google Client ID não configurado' })
      }
      const base64Payload = credential.split('.')[1]
      payload = JSON.parse(Buffer.from(base64Payload, 'base64').toString('utf-8'))
    }

    const { email, name, picture, email_verified } = payload || {}

    if (!email_verified) {
      return res.status(400).json({ error: 'E-mail do Google não verificado' })
    }

    const { user, token } = await AuthService.loginWithGoogleProfile({
      email,
      name,
      picture,
      email_verified,
    })

    const { password: _pw, ...safeUser } = user

    setAuthCookie(res, token)
    res.json({
      token,
      user: safeUser,
    })
  } catch (error: any) {
    console.error('[AUTH] google failed:', error)
    res.status(401).json({ error: 'Erro ao autenticar com Google' })
  }
})

router.post('/logout', authenticate, (req, res) => {
  clearAuthCookie(res)
  return res.json({ message: 'Logout realizado com sucesso' })
})

// Exemplo de rota protegida para verificar sessão
router.get('/me', authenticate, (req, res) => {
  if (!req.user) {
    return res.status(401).json({ error: 'Não autenticado' })
  }

  const { password: _pw, ...safeUser } = req.user
  return res.json({ user: safeUser })
})

router.patch('/me', authenticate, async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Não autenticado' })
    }

    const rawName = (req.body?.name as unknown) ?? ''
    const name = typeof rawName === 'string' ? rawName.trim() : ''

    if (!name) {
      return res.status(400).json({ error: 'Nome é obrigatório' })
    }

    if (name.length < 2 || name.length > 80) {
      return res.status(400).json({ error: 'Nome deve ter entre 2 e 80 caracteres' })
    }

    const updated = await prisma.user.update({
      where: { id: req.user.id },
      data: { name },
    })

    const { password: _pw, ...safeUser } = updated
    return res.json({ user: safeUser })
  } catch (error) {
    console.error('[AUTH] patch /me failed:', error)
    return res.status(500).json({ error: 'Erro ao atualizar perfil' })
  }
})

// Exemplo de rota apenas para admin
router.get('/admin-only', authenticate, requireAdmin, (req, res) => {
  return res.json({ message: 'Acesso permitido para ADMIN' })
})

export default router
