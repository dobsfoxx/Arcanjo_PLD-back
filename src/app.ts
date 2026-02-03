import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import morgan from 'morgan'
import rateLimit from 'express-rate-limit'
import hpp from 'hpp'
import { config } from 'dotenv'
import path from 'path'
import multer from 'multer'
import fs from 'fs'
import cookieParser from 'cookie-parser'
import { getUploadsRoot } from './config/paths'
import { createSignedUrlForStoredPath, getStorageProvider } from './config/storage'
import { authenticateFromHeaderOrQuery } from './middleware/auth'
import { billingWebhookHandler } from './routes/billing.webhook'
import { toPublicErrorMessage } from './utils/publicError'

config()

const app = express()

const trustProxyValue = process.env.TRUST_PROXY
if (trustProxyValue) {
  const parsed = Number.parseInt(trustProxyValue, 10)
  app.set('trust proxy', Number.isFinite(parsed) ? parsed : 1)
} else if (process.env.NODE_ENV === 'production') {
  app.set('trust proxy', 1)
}

// Segurança básica
app.use(
  helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  })
)

// Não expor assinatura do framework
app.disable('x-powered-by')

// CORS - configure via CORS_ORIGIN (lista separada por vírgula). Ex: "https://app.com,http://localhost:5173"
const corsAllowlist = [process.env.CORS_ORIGIN, process.env.FRONTEND_URL]
  .filter(Boolean)
  .flatMap((value) => (value || '').split(','))
  .map((o) => o.trim())
  .filter(Boolean)
const corsAllowlistSet = new Set(corsAllowlist)
const corsAllowsAll = corsAllowlistSet.has('*')

app.use(
  cors({
    credentials: true,
    origin: (origin, cb) => {
      // Permitir requests sem Origin (curl, Postman, server-to-server)
      if (!origin) return cb(null, true)

      // Se não configurado, permitir apenas localhost em dev
      if (corsAllowlistSet.size === 0) {
        const isLocalhost = /^https?:\/\/localhost(:\d+)?$/.test(origin)
        return cb(null, process.env.NODE_ENV !== 'production' && isLocalhost)
      }

      if (corsAllowsAll) {
        return cb(null, true)
      }

      return cb(null, corsAllowlistSet.has(origin))
    },
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'X-Bootstrap-Token'],
  })
)

// Proteção contra HTTP Parameter Pollution
app.use(hpp())

// Rate limit geral da API
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Muitas requisições. Tente novamente em instantes.' },
})
app.use('/api', apiLimiter)

// Logs de requisição
app.use(morgan('combined'))

// Stripe webhook precisa do corpo "raw" (não JSON parseado)
app.post('/api/billing/webhook', express.raw({ type: 'application/json' }), billingWebhookHandler)

// Body parser
app.use(express.json({ limit: process.env.JSON_LIMIT || '5mb' }))
app.use(express.urlencoded({ extended: false, limit: process.env.URLENCODED_LIMIT || '1mb' }))

// Cookies (para auth via HttpOnly cookie)
app.use(cookieParser())

// Test route
app.get('/', (req, res) => {
  res.json({ message: 'Formulário PLD API' })
})

// Rotas de autenticação
import authRoutes from './routes/auth.routes'
app.use('/api/auth', authRoutes)

// Importar rotas do formulário
import formRoutes from './routes/form.routes'
import reportRoutes from './routes/report.routes'
import pldBuilderRoutes from './routes/pldBuilder.routes'
import billingRoutes from './routes/billing.routes'
app.use('/api/form', formRoutes)
app.use('/api/report', reportRoutes)
app.use('/api/pld', pldBuilderRoutes)
app.use('/api/billing', billingRoutes)

// Arquivos estáticos (uploads, evidências, relatórios)
// Express 5 / path-to-regexp requires a named wildcard param
app.get('/uploads/*path', authenticateFromHeaderOrQuery, async (req, res) => {
  try {
    const raw = (req.params as any).path as unknown
    const wildcard = Array.isArray(raw) ? raw.join('/') : typeof raw === 'string' ? raw : ''
    const objectKey = wildcard.replace(/^\/+/, '')
    if (!objectKey || objectKey.split('/').some((seg) => seg === '..')) {
      return res.status(400).json({ error: 'Caminho inválido' })
    }

    if (getStorageProvider() === 'supabase') {
      const signedUrl = await createSignedUrlForStoredPath(`uploads/${objectKey}`)
      if (!signedUrl) {
        return res.status(404).json({ error: 'Arquivo não encontrado' })
      }

      return res.redirect(signedUrl)
    }

    const absolutePath = path.join(getUploadsRoot(), objectKey)
    const uploadsRoot = getUploadsRoot()
    const normalizedRoot = path.resolve(uploadsRoot)
    const normalizedTarget = path.resolve(absolutePath)
    if (!normalizedTarget.startsWith(normalizedRoot + path.sep) && normalizedTarget !== normalizedRoot) {
      return res.status(400).json({ error: 'Caminho inválido' })
    }

    if (!fs.existsSync(normalizedTarget)) {
      return res.status(404).json({ error: 'Arquivo não encontrado' })
    }

    return res.sendFile(normalizedTarget)
  } catch (error: any) {
    return res.status(400).json({ error: error.message || 'Erro ao acessar arquivo' })
  }
})

// Error handler (keeps responses JSON, including Multer errors like "too many files").
app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_UNEXPECTED_FILE') {
      return res.status(400).json({ error: 'Limite de arquivos excedido (máximo 5).' })
    }
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ error: 'Arquivo excede o tamanho máximo permitido.' })
    }
    return res.status(400).json({ error: err.message })
  }

  if (process.env.NODE_ENV !== 'test') {
    // Keep full details in server logs only.
    // eslint-disable-next-line no-console
    console.error('Unhandled error:', err)
  }

  return res.status(500).json({ error: toPublicErrorMessage(err, 'Erro inesperado') })
})

const PORT = process.env.PORT || 3001
app.listen(PORT, () => {
  console.log(`🚀 Servidor de formulário rodando: http://localhost:${PORT}`)
})